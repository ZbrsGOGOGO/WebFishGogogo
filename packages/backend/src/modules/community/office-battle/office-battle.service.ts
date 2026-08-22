import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull, MoreThan } from 'typeorm';

import {
  CommunityCommandReceipt,
  Friendship,
  OfficeBattleAssetLedger,
  OfficeBattleDefenseConfig,
  OfficeBattleEquipment,
  OfficeBattleFriendRewardClaim,
  OfficeBattleInventoryLedger,
  OfficeBattleLoadoutItem,
  OfficeBattleOffer,
  OfficeBattleOfferSet,
  OfficeBattlePendingReward,
  OfficeBattleProfile,
  OfficeBattleRecord,
  PlayerProfile,
  User,
  UserBlock,
  WalletBalance,
} from '../../../database/entities';
import { DEFAULT_COMMUNITY_PRIVACY } from '../../../database/entities/player-profile.entity';
import type {
  OfficeBattleEquipmentSlot,
  OfficeBattleRarity,
  OfficeBattleStats,
} from '../../../database/entities/office-battle-equipment.entity';
import type { OfficeBattleProfession } from '../../../database/entities/office-battle-profile.entity';
import { PlatformAssetsService } from '../../platform/platform-assets.service';
import { COMMUNITY_CLOCK, CommunityClock } from '../community-clock';
import { requestHash } from '../community-validation';
import { NotificationService } from '../notification.service';
import { RelationshipPolicyService } from '../relationship-policy.service';
import { resolveOfficeBattle } from './office-battle-engine';
import {
  BASE_STATS,
  battleLevelSnapshot,
  communityServiceDate,
  createEquipmentDefinition,
  deriveBattleStats,
  fighterPower,
  maxRarityForLevel,
  nextCommunityReset,
  OFFICE_BATTLE_BALANCE_VERSION,
  OFFICE_BATTLE_DAILY_ENERGY,
  OFFICE_BATTLE_DAILY_FRIEND_LIMIT,
  OFFICE_BATTLE_DAILY_REWARDED_LIMIT,
  OFFICE_BATTLE_ENGINE_VERSION,
  OFFICE_BATTLE_INVENTORY_LIMIT,
  OFFICE_BATTLE_MAX_EXPERIENCE,
  OFFICE_BATTLE_MIN_CLIENT_VERSION,
  OFFICE_BATTLE_PROFESSIONS,
  OFFICE_BATTLE_RARITIES,
  OFFICE_BATTLE_SLOTS,
  PROFESSION_LABELS,
  RARITY_RULES,
  rarityForRoll,
  roundHalfUpFraction,
} from './office-battle-rules';

const OFFER_TTL_MS = 15 * 60 * 1_000;
const PROFESSION_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1_000;
const FRIEND_REWARD_AGE_MS = 24 * 60 * 60 * 1_000;
const FRIEND_CANDIDATE_LIMIT = 200;
const PAGE_LIMIT = 30;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type BattleMode = 'reward' | 'practice';
type BattleOpponent =
  | { kind: 'npc'; offerId: string }
  | { kind: 'friend'; publicId: string };

export interface CreateOfficeBattleCommand {
  battleRequestId: string;
  opponent: BattleOpponent;
  mode: BattleMode;
  loadoutVersion: number;
}

export interface EquipmentView {
  id: string;
  name: string;
  slot: OfficeBattleEquipmentSlot;
  profession: OfficeBattleProfession;
  requiredLevel: number;
  equipmentLevel: number;
  rarity: OfficeBattleRarity;
  stats: Partial<OfficeBattleStats>;
  score: number;
  locked: boolean;
  equipped: boolean;
  enhancementLevel: number;
  canSalvage: boolean;
}

export interface FighterSnapshot {
  publicId: string;
  displayName: string;
  profession: OfficeBattleProfession;
  battleLevel: number;
  power: number;
  stats: OfficeBattleStats;
  equipment: EquipmentView[] | null;
}

interface EquipmentContext {
  items: OfficeBattleEquipment[];
  loadoutItems: OfficeBattleLoadoutItem[];
  loadout: OfficeBattleEquipment[];
  defense: OfficeBattleDefenseConfig;
}

interface RewardPlan {
  battleExperience: number;
  workspaceExperience: number;
  workspaceCoins: number;
  parts: number;
  equipment: OfficeBattleEquipment | null;
  pendingRewardId: string | null;
}

@Injectable()
export class OfficeBattleService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly assets: PlatformAssetsService,
    private readonly notifications: NotificationService,
    private readonly relationships: RelationshipPolicyService,
    @Inject(COMMUNITY_CLOCK) private readonly clock: CommunityClock,
  ) {}

  invalid(code: string): BadRequestException {
    return new BadRequestException({ code });
  }

  catalog() {
    return {
      engineVersion: OFFICE_BATTLE_ENGINE_VERSION,
      balanceVersion: OFFICE_BATTLE_BALANCE_VERSION,
      minClientVersion: OFFICE_BATTLE_MIN_CLIENT_VERSION,
      energy: { dailyMax: OFFICE_BATTLE_DAILY_ENERGY, resetHour: 5, resetTimeZone: 'Asia/Shanghai' as const },
      inventoryLimit: OFFICE_BATTLE_INVENTORY_LIMIT,
      rarityRates: OFFICE_BATTLE_RARITIES.map((rarity) => ({
        rarity,
        label: RARITY_RULES[rarity].label,
        rate: RARITY_RULES[rarity].rate,
      })),
      capabilities: { enhancementEnabled: false, friendChallengesEnabled: true },
    };
  }

  async bootstrap(userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const user = await this.lockVerifiedUser(manager, userId);
      const profile = await manager.getRepository(OfficeBattleProfile).findOne({
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!profile) return this.emptyBootstrap();
      await this.applyDailyReset(manager, profile);
      return this.buildBootstrap(manager, user, profile);
    });
  }

  async chooseProfession(
    userId: string,
    profession: OfficeBattleProfession,
    expectedVersion: number | null,
    key: string,
  ) {
    const hash = requestHash({ profession, expectedVersion });
    return this.dataSource.transaction(async (manager) => {
      const user = await this.lockVerifiedUser(manager, userId);
      const replay = await this.replay<Record<string, unknown>>(manager, userId, 'battle.class', key, hash);
      if (replay) return replay;
      let profile = await manager.getRepository(OfficeBattleProfile).findOne({
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
      const now = this.clock.now();
      if (!profile) {
        if (expectedVersion !== null) throw this.versionConflict(0);
        profile = manager.getRepository(OfficeBattleProfile).create({
          userId,
          profession,
          totalBattleExperience: 0,
          wins: 0,
          losses: 0,
          energy: OFFICE_BATTLE_DAILY_ENERGY,
          serviceDate: communityServiceDate(now),
          parts: 0,
          rewardedBattlesUsed: 0,
          rewardedFriendBattlesUsed: 0,
          upgradeProtectionUsed: false,
          profileVersion: 1,
          loadoutVersion: 1,
          inventoryVersion: 1,
          defenseVersion: 1,
          professionChangedAt: now,
          starterProfessions: [],
        });
      } else {
        if (expectedVersion !== profile.profileVersion) throw this.versionConflict(profile.profileVersion);
        if (profile.profession === profession) {
          const result = await this.buildBootstrap(manager, user, profile);
          return this.record(manager, userId, 'battle.class', key, hash, result);
        }
        if (
          profile.professionChangedAt &&
          profile.professionChangedAt.getTime() + PROFESSION_COOLDOWN_MS > now.getTime()
        ) {
          throw new ConflictException({
            code: 'PROFESSION_CHANGE_COOLDOWN',
            availableAt: new Date(profile.professionChangedAt.getTime() + PROFESSION_COOLDOWN_MS).toISOString(),
          });
        }
        await this.assets.debitWallet(manager, userId, 'office_coin', 1000, {
          sourceType: 'office_battle_class_change',
          sourceId: key,
          reason: 'office-battle-class-change-v1',
          idempotencyKey: `battle-class:${userId}:${key}`,
        });
        profile.profession = profession;
        profile.professionChangedAt = now;
        profile.profileVersion += 1;
        profile.loadoutVersion += 1;
        profile.defenseVersion += 1;
      }

      const level = battleLevelSnapshot(profile.totalBattleExperience).level;
      let starters = await manager.getRepository(OfficeBattleEquipment).find({
        where: { userId, profession, starterBound: true, salvagedAt: IsNull() },
      });
      if (!profile.starterProfessions.includes(profession)) {
        starters = [];
        for (const slot of OFFICE_BATTLE_SLOTS) {
          const definition = createEquipmentDefinition(profession, slot, level, 'common');
          const item = manager.getRepository(OfficeBattleEquipment).create({
            ...definition,
            userId,
            locked: true,
            starterBound: true,
            sourceBattleId: null,
            salvagedAt: null,
          });
          starters.push(await manager.getRepository(OfficeBattleEquipment).save(item));
          await this.inventoryLedger(manager, userId, item.id, null, 'create', { starterBound: true }, `starter:${userId}:${profession}:${slot}`);
        }
        profile.starterProfessions = [...profile.starterProfessions, profession];
        profile.inventoryVersion += 1;
      }
      if (starters.length !== OFFICE_BATTLE_SLOTS.length) {
        throw new ConflictException({ code: 'STARTER_EQUIPMENT_INCOMPLETE' });
      }
      await manager.getRepository(OfficeBattleLoadoutItem).delete({ userId });
      await manager.getRepository(OfficeBattleLoadoutItem).save(
        starters.map((item) => manager.getRepository(OfficeBattleLoadoutItem).create({
          userId,
          slot: item.slot,
          equipmentId: item.id,
        })),
      );
      let defense = await manager.getRepository(OfficeBattleDefenseConfig).findOne({ where: { userId } });
      if (!defense) {
        defense = manager.getRepository(OfficeBattleDefenseConfig).create({
          userId,
          profession,
          equipmentIds: this.slotOrder(starters).map((item) => item.id),
          challengeVisibility: 'friends',
          equipmentVisibility: 'friends',
          version: profile.defenseVersion,
        });
      } else {
        defense.profession = profession;
        defense.equipmentIds = this.slotOrder(starters).map((item) => item.id);
        defense.version = profile.defenseVersion;
      }
      await manager.getRepository(OfficeBattleDefenseConfig).save(defense);
      await manager.getRepository(OfficeBattleProfile).save(profile);
      const sharedProfile = await this.ensurePlayerProfile(manager, userId);
      sharedProfile.battleProfession = profession;
      await manager.getRepository(PlayerProfile).save(sharedProfile);
      const result = await this.buildBootstrap(manager, user, profile);
      return this.record(manager, userId, 'battle.class', key, hash, result);
    });
  }

  async inventory(userId: string, cursor?: string) {
    const manager = this.dataSource.manager;
    const profile = await this.requireProfile(manager, userId);
    const context = await this.equipmentContext(manager, profile);
    const sorted = [...context.items].sort((a, b) =>
      b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
    );
    const start = this.cursorStart(sorted, cursor);
    const page = sorted.slice(start, start + PAGE_LIMIT);
    return {
      items: page.map((item) => this.equipmentView(item, context)),
      nextCursor: start + PAGE_LIMIT < sorted.length && page.length > 0 ? this.cursor(page.at(-1)!) : null,
      total: sorted.length,
      limit: PAGE_LIMIT,
      inventoryVersion: profile.inventoryVersion,
      loadout: this.loadoutView(context, profile.loadoutVersion),
      parts: profile.parts,
    };
  }

  async updateLoadout(
    userId: string,
    equipmentIds: string[],
    expectedVersion: number,
    key: string,
  ) {
    if (equipmentIds.length !== OFFICE_BATTLE_SLOTS.length) throw this.invalid('LOADOUT_REQUIRES_SIX_SLOTS');
    return this.commandMutation(userId, 'battle.loadout', key, { equipmentIds, expectedVersion }, async (manager, _user, profile) => {
      if (profile.loadoutVersion !== expectedVersion) throw this.versionConflict(profile.loadoutVersion);
      const equipment = await this.validConfigurationEquipment(manager, profile, equipmentIds);
      await manager.getRepository(OfficeBattleLoadoutItem).delete({ userId });
      await manager.getRepository(OfficeBattleLoadoutItem).save(
        equipment.map((item) => manager.getRepository(OfficeBattleLoadoutItem).create({
          userId,
          slot: item.slot,
          equipmentId: item.id,
        })),
      );
      profile.loadoutVersion += 1;
      profile.profileVersion += 1;
      await manager.getRepository(OfficeBattleProfile).save(profile);
      for (const item of equipment) {
        await this.inventoryLedger(manager, userId, item.id, null, 'equip', { loadoutVersion: profile.loadoutVersion }, `${key}:${item.id}`);
      }
      return this.mutationView(manager, profile);
    });
  }

  async getDefense(userId: string) {
    const profile = await this.requireProfile(this.dataSource.manager, userId);
    const context = await this.equipmentContext(this.dataSource.manager, profile);
    return this.defenseView(context.defense);
  }

  async updateDefense(
    userId: string,
    equipmentIds: string[],
    challengeVisibility: 'friends' | 'none',
    equipmentVisibility: 'public' | 'friends' | 'private',
    expectedVersion: number,
    key: string,
  ) {
    if (equipmentIds.length !== OFFICE_BATTLE_SLOTS.length) throw this.invalid('DEFENSE_REQUIRES_SIX_SLOTS');
    return this.commandMutation(
      userId,
      'battle.defense',
      key,
      { equipmentIds, challengeVisibility, equipmentVisibility, expectedVersion },
      async (manager, _user, profile) => {
        const existing = await manager.getRepository(OfficeBattleDefenseConfig).findOne({
          where: { userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!existing || existing.version !== expectedVersion) throw this.versionConflict(existing?.version ?? 0);
        const equipment = await this.validConfigurationEquipment(manager, profile, equipmentIds);
        existing.profession = profile.profession;
        existing.equipmentIds = this.slotOrder(equipment).map((item) => item.id);
        existing.challengeVisibility = challengeVisibility;
        existing.equipmentVisibility = equipmentVisibility;
        existing.version += 1;
        profile.defenseVersion = existing.version;
        profile.profileVersion += 1;
        await manager.getRepository(OfficeBattleDefenseConfig).save(existing);
        await manager.getRepository(OfficeBattleProfile).save(profile);
        for (const item of equipment) {
          await this.inventoryLedger(manager, userId, item.id, null, 'defense_equip', { defenseVersion: existing.version }, `${key}:${item.id}`);
        }
        return this.defenseView(existing);
      },
    );
  }

  async setEquipmentLock(
    userId: string,
    equipmentId: string,
    locked: boolean,
    expectedInventoryVersion: number,
    key: string,
  ) {
    return this.commandMutation(
      userId,
      'battle.lock',
      key,
      { equipmentId, locked, expectedInventoryVersion },
      async (manager, _user, profile) => {
        if (profile.inventoryVersion !== expectedInventoryVersion) throw this.versionConflict(profile.inventoryVersion);
        const item = await manager.getRepository(OfficeBattleEquipment).findOne({
          where: { id: equipmentId, userId, salvagedAt: IsNull() },
          lock: { mode: 'pessimistic_write' },
        });
        if (!item) throw new NotFoundException({ code: 'EQUIPMENT_NOT_FOUND' });
        if (item.starterBound && !locked) throw new ConflictException({ code: 'STARTER_EQUIPMENT_BOUND' });
        if (item.locked !== locked) {
          item.locked = locked;
          profile.inventoryVersion += 1;
          profile.profileVersion += 1;
          await manager.getRepository(OfficeBattleEquipment).save(item);
          await manager.getRepository(OfficeBattleProfile).save(profile);
          await this.inventoryLedger(manager, userId, item.id, null, 'lock', { locked }, key);
        }
        return this.mutationView(manager, profile, item.id);
      },
    );
  }

  async salvageEquipment(
    userId: string,
    equipmentIds: string[],
    expectedInventoryVersion: number,
    key: string,
  ) {
    return this.commandMutation(
      userId,
      'battle.salvage',
      key,
      { equipmentIds, expectedInventoryVersion },
      async (manager, _user, profile) => {
        if (profile.inventoryVersion !== expectedInventoryVersion) throw this.versionConflict(profile.inventoryVersion);
        const context = await this.equipmentContext(manager, profile);
        const chosen = equipmentIds.map((id) => context.items.find((item) => item.id === id));
        if (chosen.some((item) => !item)) throw new NotFoundException({ code: 'EQUIPMENT_NOT_FOUND' });
        let parts = 0;
        for (const item of chosen as OfficeBattleEquipment[]) {
          if (!this.canSalvage(item, context)) throw new ConflictException({ code: 'EQUIPMENT_NOT_SALVAGEABLE', equipmentId: item.id });
          parts += RARITY_RULES[item.rarity].parts;
        }
        const now = this.clock.now();
        for (const item of chosen as OfficeBattleEquipment[]) {
          item.salvagedAt = now;
          await manager.getRepository(OfficeBattleEquipment).save(item);
          await this.inventoryLedger(manager, userId, item.id, null, 'salvage', { parts: RARITY_RULES[item.rarity].parts }, `${key}:${item.id}`);
        }
        profile.parts += parts;
        profile.inventoryVersion += 1;
        profile.profileVersion += 1;
        await manager.getRepository(OfficeBattleProfile).save(profile);
        await this.assetLedger(manager, profile, null, 'parts', parts, 'equipment_salvage', `${key}:parts`);
        return { ...(await this.mutationView(manager, profile)), partsGranted: parts };
      },
    );
  }

  async enhanceEquipment(
    _userId: string,
    _equipmentId: string,
    _expectedInventoryVersion: number,
    _key: string,
  ): Promise<never> {
    throw new ConflictException({ code: 'ENHANCEMENT_DISABLED' });
  }

  async pendingRewards(userId: string) {
    await this.requireProfile(this.dataSource.manager, userId);
    const rows = await this.dataSource.getRepository(OfficeBattlePendingReward).find({
      where: { userId, status: 'pending' },
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => this.pendingRewardView(row));
  }

  async resolvePendingReward(
    userId: string,
    rewardId: string,
    action: 'claim' | 'salvage',
    expectedInventoryVersion: number,
    key: string,
  ) {
    return this.commandMutation(
      userId,
      `battle.reward.${action}`,
      key,
      { rewardId, action, expectedInventoryVersion },
      async (manager, _user, profile) => {
        const reward = await manager.getRepository(OfficeBattlePendingReward).findOne({
          where: { id: rewardId, userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!reward) throw new NotFoundException({ code: 'PENDING_REWARD_NOT_FOUND' });
        if (reward.status !== 'pending') return reward.resolutionResult ?? {};
        if (profile.inventoryVersion !== expectedInventoryVersion) throw this.versionConflict(profile.inventoryVersion);
        const snapshot = reward.equipmentSnapshot as unknown as EquipmentView;
        let partsGranted = 0;
        let changedEquipment: OfficeBattleEquipment | null = null;
        if (action === 'claim') {
          const count = await manager.getRepository(OfficeBattleEquipment).count({
            where: { userId, salvagedAt: IsNull() },
          });
          if (count >= OFFICE_BATTLE_INVENTORY_LIMIT) throw new ConflictException({ code: 'INVENTORY_FULL' });
          changedEquipment = manager.getRepository(OfficeBattleEquipment).create({
            id: snapshot.id,
            userId,
            profession: snapshot.profession,
            slot: snapshot.slot,
            name: snapshot.name,
            requiredLevel: snapshot.requiredLevel,
            equipmentLevel: snapshot.equipmentLevel,
            rarity: snapshot.rarity,
            stats: snapshot.stats,
            score: snapshot.score,
            locked: false,
            starterBound: false,
            enhancementLevel: snapshot.enhancementLevel,
            sourceBattleId: reward.battleId,
            salvagedAt: null,
          });
          await manager.getRepository(OfficeBattleEquipment).save(changedEquipment);
          await this.inventoryLedger(manager, userId, changedEquipment.id, reward.battleId, 'claim', { rewardId }, key);
          reward.status = 'claimed';
        } else {
          partsGranted = RARITY_RULES[snapshot.rarity].parts;
          profile.parts += partsGranted;
          await this.assetLedger(manager, profile, reward.battleId, 'parts', partsGranted, 'pending_reward_salvage', `${key}:parts`);
          reward.status = 'salvaged';
        }
        profile.inventoryVersion += 1;
        profile.profileVersion += 1;
        await manager.getRepository(OfficeBattleProfile).save(profile);
        const result = {
          ...(await this.mutationView(manager, profile, changedEquipment?.id)),
          ...(action === 'salvage' ? { partsGranted } : {}),
        };
        reward.resolvedAt = this.clock.now();
        reward.resolutionResult = result as unknown as Record<string, unknown>;
        await manager.getRepository(OfficeBattlePendingReward).save(reward);
        return result;
      },
    );
  }

  async createBattle(userId: string, command: CreateOfficeBattleCommand, key: string) {
    if (key !== command.battleRequestId) {
      throw this.invalid('BATTLE_REQUEST_KEY_MISMATCH');
    }
    const hash = requestHash(command);
    const preResolvedDefender =
      command.opponent.kind === 'friend'
        ? await this.dataSource.getRepository(User).findOne({
            where: { publicId: command.opponent.publicId, accountStatus: 'active' },
          })
        : null;
    if (command.opponent.kind === 'friend' && !preResolvedDefender) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    }

    return this.dataSource.transaction(async (manager) => {
      const users = new Map<string, User>();
      const lockIds = [userId, ...(preResolvedDefender ? [preResolvedDefender.id] : [])].sort();
      for (const id of lockIds) {
        const user = await this.lockVerifiedUser(manager, id);
        users.set(id, user);
      }
      const user = users.get(userId)!;
      const existing = await manager.getRepository(OfficeBattleRecord).findOne({
        where: { userId, battleRequestId: command.battleRequestId },
      });
      if (existing) {
        if (existing.requestHash !== hash) throw new ConflictException({ code: 'BATTLE_REQUEST_ID_REUSED' });
        return this.settlementView(existing);
      }

      const profile = await manager.getRepository(OfficeBattleProfile).findOne({
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!profile) throw new ConflictException({ code: 'BATTLE_PROFILE_REQUIRED' });
      await this.applyDailyReset(manager, profile);
      if (profile.loadoutVersion !== command.loadoutVersion) {
        throw new ConflictException({ code: 'BATTLE_EQUIPMENT_CONFLICT', currentVersion: profile.loadoutVersion });
      }
      const context = await this.equipmentContext(manager, profile);
      const now = this.clock.now();
      const serviceDate = communityServiceDate(now);

      if (command.mode === 'reward') {
        const pending = await manager.getRepository(OfficeBattlePendingReward).exist({
          where: { userId, status: 'pending' },
        });
        if (pending || context.items.length >= OFFICE_BATTLE_INVENTORY_LIMIT) {
          throw new ConflictException({ code: 'INVENTORY_FULL' });
        }
        if (
          profile.energy < 1 ||
          profile.rewardedBattlesUsed >= OFFICE_BATTLE_DAILY_REWARDED_LIMIT
        ) {
          throw new ConflictException({
            code: 'BATTLE_ENERGY_INSUFFICIENT',
            resetsAt: nextCommunityReset(now).toISOString(),
          });
        }
      }

      const playerLevel = battleLevelSnapshot(profile.totalBattleExperience).level;
      const playerSnapshot = this.fighterSnapshot(user, profile.profession, playerLevel, context.loadout, true);
      let opponentSnapshot: FighterSnapshot;
      let opponentEquipmentVisible = true;
      let playerEquipmentVisibleToDefender = true;
      let offer: OfficeBattleOffer | null = null;
      let offerSet: OfficeBattleOfferSet | null = null;
      let defender: User | null = null;
      let defenderProfile: OfficeBattleProfile | null = null;
      let friendship: Friendship | null = null;
      let rewardMultiplier = 100;

      if (command.opponent.kind === 'npc') {
        offer = await manager.getRepository(OfficeBattleOffer).findOne({
          where: { id: command.opponent.offerId, userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!offer || offer.expiresAt.getTime() <= now.getTime()) {
          throw new ConflictException({ code: 'OFFER_EXPIRED' });
        }
        offerSet = await manager.getRepository(OfficeBattleOfferSet).findOne({
          where: { id: offer.offerSetId, userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!offerSet || offerSet.consumedAt || offerSet.expiresAt.getTime() <= now.getTime()) {
          throw new ConflictException({ code: 'OFFER_EXPIRED' });
        }
        opponentSnapshot = offer.opponentSnapshot as unknown as FighterSnapshot;
        rewardMultiplier = offer.rewardMultiplierPercent;
      } else {
        defender = users.get(preResolvedDefender!.id)!;
        if (defender.id === userId) throw this.invalid('SELF_BATTLE_NOT_ALLOWED');
        if (await this.relationships.isBlocked(manager, userId, defender.id)) {
          throw new ForbiddenException({ code: 'FRIEND_CHALLENGE_BLOCKED' });
        }
        const [userLowId, userHighId] = this.relationships.pair(userId, defender.id);
        friendship = await manager.getRepository(Friendship).findOne({
          where: { userLowId, userHighId, endedAt: IsNull() },
        });
        if (!friendship) throw new ForbiddenException({ code: 'FRIEND_CHALLENGE_BLOCKED' });
        defenderProfile = await manager.getRepository(OfficeBattleProfile).findOne({
          where: { userId: defender.id },
        });
        if (!defenderProfile) throw new ConflictException({ code: 'DEFENDER_BATTLE_PROFILE_REQUIRED' });
        const defense = await manager.getRepository(OfficeBattleDefenseConfig).findOne({
          where: { userId: defender.id },
        });
        if (!defense || defense.challengeVisibility === 'none') {
          throw new ForbiddenException({ code: 'DEFENSE_PRIVACY_CLOSED' });
        }
        const defenderEquipment = await manager.getRepository(OfficeBattleEquipment).find({
          where: { id: In(defense.equipmentIds), userId: defender.id, salvagedAt: IsNull() },
        });
        if (defenderEquipment.length !== OFFICE_BATTLE_SLOTS.length) {
          throw new ConflictException({ code: 'DEFENSE_LOADOUT_INVALID' });
        }
        const defenderLevel = battleLevelSnapshot(defenderProfile.totalBattleExperience).level;
        opponentSnapshot = this.fighterSnapshot(
          defender,
          defense.profession,
          defenderLevel,
          this.slotOrder(defenderEquipment),
          true,
        );
        opponentEquipmentVisible = defense.equipmentVisibility !== 'private';
        playerEquipmentVisibleToDefender =
          context.defense.equipmentVisibility !== 'private';
        if (command.mode === 'reward') {
          const oldEnough =
            now.getTime() - friendship.currentStartedAt.getTime() >= FRIEND_REWARD_AGE_MS;
          const alreadyClaimed = await manager.getRepository(OfficeBattleFriendRewardClaim).exist({
            where: { attackerUserId: userId, defenderUserId: defender.id, serviceDate },
          });
          if (
            !oldEnough ||
            alreadyClaimed ||
            profile.rewardedFriendBattlesUsed >= OFFICE_BATTLE_DAILY_FRIEND_LIMIT
          ) {
            throw new ConflictException({
              code: 'FRIEND_REWARD_NOT_ELIGIBLE',
              requiresPracticeConfirmation: true,
            });
          }
        }
      }

      const seed = randomBytes(32).toString('hex');
      const engineResult = resolveOfficeBattle(
        { profession: playerSnapshot.profession, stats: playerSnapshot.stats },
        { profession: opponentSnapshot.profession, stats: opponentSnapshot.stats },
        seed,
      );
      const battleId = randomUUID();
      const reward = await this.planReward(
        manager,
        profile,
        context,
        battleId,
        command.mode,
        engineResult.winner,
        rewardMultiplier,
        seed,
      );

      if (command.mode === 'reward') {
        profile.energy -= 1;
        profile.rewardedBattlesUsed += 1;
        if (defender) profile.rewardedFriendBattlesUsed += 1;
        profile.totalBattleExperience = Math.min(
          OFFICE_BATTLE_MAX_EXPERIENCE,
          profile.totalBattleExperience + reward.battleExperience,
        );
        if (engineResult.winner === 'player') profile.wins += 1;
        else profile.losses += 1;
        profile.parts += reward.parts;
        profile.profileVersion += 1;
        if (reward.parts > 0 || reward.equipment || reward.pendingRewardId) profile.inventoryVersion += 1;
        await this.assets.grantReward(manager, {
          userId,
          sourceType: 'office_battle',
          sourceId: battleId,
          ruleKey: OFFICE_BATTLE_BALANCE_VERSION,
          reward: {
            experience: reward.workspaceExperience,
            currencies: { office_coin: reward.workspaceCoins },
          },
        });
      }
      await manager.getRepository(OfficeBattleProfile).save(profile);

      const energy = this.energyView(profile, now);
      const rewardView = {
        battleExperience: reward.battleExperience,
        workspaceExperience: reward.workspaceExperience,
        workspaceCoins: reward.workspaceCoins,
        parts: reward.parts,
        droppedEquipment: reward.equipment
          ? this.uncontextualizedEquipmentView(reward.equipment)
          : null,
        pendingRewardId: reward.pendingRewardId,
      };
      const record = manager.getRepository(OfficeBattleRecord).create({
        id: battleId,
        userId,
        defenderUserId: defender?.id ?? null,
        battleRequestId: command.battleRequestId,
        requestHash: hash,
        mode: command.mode,
        opponentKind: command.opponent.kind,
        offerId: offer?.id ?? null,
        serviceDate,
        engineVersion: OFFICE_BATTLE_ENGINE_VERSION,
        balanceVersion: OFFICE_BATTLE_BALANCE_VERSION,
        seedHex: seed,
        playerSnapshot: playerSnapshot as unknown as Record<string, unknown>,
        opponentSnapshot: opponentSnapshot as unknown as Record<string, unknown>,
        opponentEquipmentVisible,
        playerEquipmentVisibleToDefender,
        events: engineResult.events as unknown as Array<Record<string, unknown>>,
        winner: engineResult.winner,
        rewardSnapshot: rewardView,
        energySnapshot: energy,
        profileVersion: profile.profileVersion,
        loadoutVersion: profile.loadoutVersion,
        inventoryVersion: profile.inventoryVersion,
        completedAt: now,
      });
      await manager.getRepository(OfficeBattleRecord).save(record);

      if (command.mode === 'reward') {
        await this.assetLedger(manager, profile, battleId, 'energy', -1, 'reward_battle', `${battleId}:energy`);
        await this.assetLedger(manager, profile, battleId, 'battle_experience', reward.battleExperience, 'battle_reward', `${battleId}:battle-xp`);
        if (reward.parts > 0) {
          await this.assetLedger(manager, profile, battleId, 'parts', reward.parts, 'upgrade_protection_fallback', `${battleId}:parts`);
        }
      }

      if (reward.equipment) {
        if (reward.pendingRewardId) {
          await manager.getRepository(OfficeBattlePendingReward).save(
            manager.getRepository(OfficeBattlePendingReward).create({
              id: reward.pendingRewardId,
              userId,
              battleId,
              equipmentSnapshot: this.uncontextualizedEquipmentView(reward.equipment) as unknown as Record<string, unknown>,
              status: 'pending',
              resolutionResult: null,
              resolvedAt: null,
            }),
          );
          await this.inventoryLedger(manager, userId, reward.equipment.id, battleId, 'pending', { rewardId: reward.pendingRewardId }, `${battleId}:pending`);
        } else {
          await manager.getRepository(OfficeBattleEquipment).save(reward.equipment);
          await this.inventoryLedger(manager, userId, reward.equipment.id, battleId, 'create', { rarity: reward.equipment.rarity }, `${battleId}:equipment`);
        }
      }
      if (offerSet) {
        offerSet.consumedAt = now;
        offerSet.consumedBattleId = battleId;
        await manager.getRepository(OfficeBattleOfferSet).save(offerSet);
      }
      if (defender && command.mode === 'reward') {
        await manager.getRepository(OfficeBattleFriendRewardClaim).save(
          manager.getRepository(OfficeBattleFriendRewardClaim).create({
            attackerUserId: userId,
            defenderUserId: defender.id,
            serviceDate,
            battleId,
          }),
        );
      }
      if (defender) {
        await this.notifications.create(manager, {
          userId: defender.id,
          actorUserId: userId,
          category: 'battle',
          eventType: 'office_battle.completed',
          title: '好友发起了一次办公室切磋',
          summary: `${this.displayName(user)} 完成了一次项目切磋，点击查看战报。`,
          resourceType: 'office_battle',
          resourceId: battleId,
          resourcePath: `/battle/reports/${battleId}`,
          dedupeKey: `office-battle:${battleId}`,
        });
      }
      return this.settlementView(record, false);
    });
  }

  async getBattleByRequest(userId: string, battleRequestId: string) {
    const record = await this.dataSource.getRepository(OfficeBattleRecord).findOne({
      where: { userId, battleRequestId },
    });
    if (!record) throw new NotFoundException({ code: 'BATTLE_NOT_FOUND' });
    return this.settlementView(record, false);
  }

  async getBattle(userId: string, battleId: string) {
    const record = await this.dataSource.getRepository(OfficeBattleRecord).findOne({
      where: [{ id: battleId, userId }, { id: battleId, defenderUserId: userId }],
    });
    if (!record) throw new NotFoundException({ code: 'BATTLE_NOT_FOUND' });
    return this.settlementView(record, record.defenderUserId === userId);
  }

  async history(userId: string, cursor?: string) {
    const cursorPosition = this.decodeRecordCursor(cursor);
    const query = this.dataSource
      .getRepository(OfficeBattleRecord)
      .createQueryBuilder('battle')
      .where('battle.user_id = :userId', { userId });
    if (cursorPosition) {
      query.andWhere(
        '(battle.completed_at < :completedAt OR (battle.completed_at = :completedAt AND battle.id < :id))',
        cursorPosition,
      );
    }
    const records = await query
      .orderBy('battle.completed_at', 'DESC')
      .addOrderBy('battle.id', 'DESC')
      .take(PAGE_LIMIT + 1)
      .getMany();
    const hasMore = records.length > PAGE_LIMIT;
    const page = records.slice(0, PAGE_LIMIT);
    return {
      items: page.map((record) => {
        const opponent = record.opponentSnapshot as unknown as FighterSnapshot;
        const reward = record.rewardSnapshot as Record<string, unknown>;
        const rewardSummary =
          record.mode === 'practice'
            ? '练习战 · 无奖励'
            : `乐斗经验 +${Number(reward.battleExperience ?? 0)} · 办公币 +${Number(reward.workspaceCoins ?? 0)}`;
        return {
          battleId: record.id,
          battleRequestId: record.battleRequestId,
          mode: record.mode,
          opponentKind: record.opponentKind,
          opponent: this.opponentSummary(opponent),
          winner: record.winner,
          completedAt: record.completedAt.toISOString(),
          rewardSummary,
        };
      }),
      nextCursor:
        hasMore && page.length > 0
          ? this.recordCursor(page.at(-1)!)
          : null,
    };
  }

  async publicRecord(viewerId: string, targetPublicId: string) {
    const manager = this.dataSource.manager;
    const target = await manager.getRepository(User).findOne({
      where: { publicId: targetPublicId, accountStatus: 'active' },
    });
    if (!target || target.socialVerificationStatus !== 'verified') {
      throw new NotFoundException({ code: 'BATTLE_RECORD_NOT_FOUND' });
    }
    if (viewerId !== target.id && (await this.relationships.isBlocked(manager, viewerId, target.id))) {
      throw new NotFoundException({ code: 'BATTLE_RECORD_NOT_FOUND' });
    }
    const battleProfile = await manager.getRepository(OfficeBattleProfile).findOne({
      where: { userId: target.id },
    });
    if (!battleProfile) throw new NotFoundException({ code: 'BATTLE_RECORD_NOT_FOUND' });
    const shared = await this.ensurePlayerProfile(manager, target.id);
    const friend = viewerId === target.id || (await this.relationships.isFriend(manager, viewerId, target.id));
    const recordPrivacy = shared.privacySettings.battleRecord;
    const recordAllowed =
      viewerId === target.id || recordPrivacy === 'everyone' || (recordPrivacy === 'friends' && friend);
    const defense = await manager.getRepository(OfficeBattleDefenseConfig).findOne({ where: { userId: target.id } });
    const equipmentAllowed =
      viewerId === target.id ||
      defense?.equipmentVisibility === 'public' ||
      (defense?.equipmentVisibility === 'friends' && friend);
    let equipment: EquipmentView[] | null = null;
    if (equipmentAllowed && defense) {
      const rows = await manager.getRepository(OfficeBattleEquipment).find({
        where: { id: In(defense.equipmentIds), userId: target.id, salvagedAt: IsNull() },
      });
      equipment = this.slotOrder(rows).map((item) => ({
        ...this.uncontextualizedEquipmentView(item),
        equipped: true,
        canSalvage: false,
      }));
    }
    const recent = recordAllowed
      ? await manager.getRepository(OfficeBattleRecord).find({
          where: { userId: target.id },
          order: { completedAt: 'DESC' },
          take: 5,
        })
      : [];
    return {
      publicId: target.publicId,
      displayName: this.displayName(target, shared),
      profession: battleProfile.profession,
      visibility: recordPrivacy === 'everyone' ? 'public' : recordPrivacy === 'friends' ? 'friends' : 'private',
      battleLevel: recordAllowed ? battleLevelSnapshot(battleProfile.totalBattleExperience).level : null,
      wins: recordAllowed ? battleProfile.wins : null,
      losses: recordAllowed ? battleProfile.losses : null,
      equipment,
      recentBattles: recordAllowed
        ? recent.map((record) => ({
            battleId: record.id,
            result: record.winner === 'player' ? ('win' as const) : ('loss' as const),
            completedAt: record.completedAt.toISOString(),
          }))
        : null,
    };
  }

  private emptyBootstrap() {
    return {
      serverTime: this.clock.now().toISOString(),
      clientCompatibility: {
        status: 'current' as const,
        minClientVersion: OFFICE_BATTLE_MIN_CLIENT_VERSION,
        message: null,
      },
      catalog: this.catalog(),
      profile: null,
      loadout: null,
      defense: null,
      offers: [],
      offersExpireAt: null,
      dailyActions: null,
      pendingRewards: [],
      friendCandidates: [],
    };
  }

  private async buildBootstrap(
    manager: EntityManager,
    user: User,
    profile: OfficeBattleProfile,
  ): Promise<Record<string, unknown>> {
    const context = await this.equipmentContext(manager, profile);
    const offerRows = await this.ensureOffers(manager, user, profile, context);
    const pending = await manager.getRepository(OfficeBattlePendingReward).find({
      where: { userId: user.id, status: 'pending' },
      order: { createdAt: 'ASC' },
    });
    const now = this.clock.now();
    return {
      serverTime: now.toISOString(),
      clientCompatibility: {
        status: 'current' as const,
        minClientVersion: OFFICE_BATTLE_MIN_CLIENT_VERSION,
        message: null,
      },
      catalog: this.catalog(),
      profile: await this.profileView(manager, user, profile, context.loadout),
      loadout: this.loadoutView(context, profile.loadoutVersion),
      defense: this.defenseView(context.defense),
      offers: offerRows.map((offer) => this.offerView(offer, context.loadout, profile)),
      offersExpireAt: offerRows[0]?.expiresAt.toISOString() ?? null,
      dailyActions: {
        rewardedBattlesUsed: profile.rewardedBattlesUsed,
        rewardedBattlesLimit: OFFICE_BATTLE_DAILY_REWARDED_LIMIT,
        rewardedFriendBattlesUsed: profile.rewardedFriendBattlesUsed,
        rewardedFriendBattlesLimit: OFFICE_BATTLE_DAILY_FRIEND_LIMIT,
      },
      pendingRewards: pending.map((reward) => this.pendingRewardView(reward)),
      friendCandidates: await this.friendCandidates(manager, user.id, profile, now),
    };
  }

  private async lockVerifiedUser(manager: EntityManager, userId: string): Promise<User> {
    const user = await manager.getRepository(User).findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user || user.accountStatus !== 'active') {
      throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    }
    if (user.socialVerificationStatus !== 'verified') {
      throw new ForbiddenException({ code: 'SOCIAL_VERIFICATION_REQUIRED' });
    }
    return user;
  }

  private async requireProfile(manager: EntityManager, userId: string): Promise<OfficeBattleProfile> {
    const profile = await manager.getRepository(OfficeBattleProfile).findOne({ where: { userId } });
    if (!profile) throw new ConflictException({ code: 'BATTLE_PROFILE_REQUIRED' });
    return profile;
  }

  private async applyDailyReset(
    manager: EntityManager,
    profile: OfficeBattleProfile,
  ): Promise<void> {
    const nextDate = communityServiceDate(this.clock.now());
    if (profile.serviceDate === nextDate) return;
    const energyDelta = OFFICE_BATTLE_DAILY_ENERGY - profile.energy;
    profile.energy = OFFICE_BATTLE_DAILY_ENERGY;
    profile.serviceDate = nextDate;
    profile.rewardedBattlesUsed = 0;
    profile.rewardedFriendBattlesUsed = 0;
    profile.upgradeProtectionUsed = false;
    profile.profileVersion += 1;
    await manager.getRepository(OfficeBattleProfile).save(profile);
    if (energyDelta !== 0) {
      await this.assetLedger(
        manager,
        profile,
        null,
        'energy',
        energyDelta,
        'daily_reset',
        `daily-reset:${profile.userId}:${nextDate}`,
      );
    }
  }

  private async ensureOffers(
    manager: EntityManager,
    user: User,
    profile: OfficeBattleProfile,
    context: EquipmentContext,
  ): Promise<OfficeBattleOffer[]> {
    const now = this.clock.now();
    const active = await manager.getRepository(OfficeBattleOfferSet).findOne({
      where: {
        userId: user.id,
        consumedAt: IsNull(),
        expiresAt: MoreThan(now),
      },
      order: { createdAt: 'DESC' },
    });
    if (active) {
      const existing = await manager.getRepository(OfficeBattleOffer).find({
        where: { offerSetId: active.id, userId: user.id },
      });
      if (existing.length === 3) return this.tierOrder(existing);
    }

    const seedHex = randomBytes(32).toString('hex');
    const expiresAt = new Date(now.getTime() + OFFER_TTL_MS);
    const set = await manager.getRepository(OfficeBattleOfferSet).save(
      manager.getRepository(OfficeBattleOfferSet).create({
        userId: user.id,
        seedHex,
        expiresAt,
        consumedAt: null,
        consumedBattleId: null,
      }),
    );
    const level = battleLevelSnapshot(profile.totalBattleExperience).level;
    const playerStats = deriveBattleStats({ profession: profile.profession, level, equipment: context.loadout });
    const playerPower = fighterPower(playerStats);
    const tiers = [
      { tier: 'simple' as const, multiplier: 80 as const, midpoint: 94 },
      { tier: 'balanced' as const, multiplier: 100 as const, midpoint: 100 },
      { tier: 'challenge' as const, multiplier: 120 as const, midpoint: 107.5 },
    ];
    const offers: OfficeBattleOffer[] = [];
    for (const tier of tiers) {
      const snapshot = this.generateNpcSnapshot(seedHex, tier.tier, level, playerPower);
      offers.push(
        await manager.getRepository(OfficeBattleOffer).save(
          manager.getRepository(OfficeBattleOffer).create({
            offerSetId: set.id,
            userId: user.id,
            tier: tier.tier,
            opponentSnapshot: snapshot as unknown as Record<string, unknown>,
            rewardMultiplierPercent: tier.multiplier,
            expiresAt,
          }),
        ),
      );
    }
    return offers;
  }

  private generateNpcSnapshot(
    seedHex: string,
    tier: OfficeBattleOffer['tier'],
    level: number,
    playerPower: number,
  ): FighterSnapshot {
    const digest = createHash('sha256').update(`${seedHex}:npc:${tier}`).digest();
    const profession = OFFICE_BATTLE_PROFESSIONS[digest[0] % OFFICE_BATTLE_PROFESSIONS.length];
    const targetPercent = tier === 'simple' ? 94 : tier === 'balanced' ? 100 : 107.5;
    const target = Number(roundHalfUpFraction(BigInt(playerPower * targetPercent * 10), 1000n));
    const maxRarity = maxRarityForLevel(level);
    const rarityCount = OFFICE_BATTLE_RARITIES.indexOf(maxRarity) + 1;
    const definitions = OFFICE_BATTLE_SLOTS.map((slot) =>
      OFFICE_BATTLE_RARITIES.slice(0, rarityCount).map((rarity) =>
        createEquipmentDefinition(profession, slot, level, rarity),
      ),
    );
    let best: { power: number; equipment: OfficeBattleEquipment[]; tie: string } | null = null;
    const combinations = rarityCount ** OFFICE_BATTLE_SLOTS.length;
    for (let encoded = 0; encoded < combinations; encoded += 1) {
      let value = encoded;
      const equipment: OfficeBattleEquipment[] = [];
      const serial: number[] = [];
      for (let slotIndex = 0; slotIndex < OFFICE_BATTLE_SLOTS.length; slotIndex += 1) {
        const rarityIndex = value % rarityCount;
        value = Math.floor(value / rarityCount);
        serial.push(rarityIndex);
        const definition = definitions[slotIndex][rarityIndex];
        equipment.push(
          Object.assign(new OfficeBattleEquipment(), {
            id: this.uuidFromHash(`${seedHex}:${tier}:${slotIndex}:${rarityIndex}`),
            userId: this.uuidFromHash(`${seedHex}:${tier}:npc`),
            ...definition,
            locked: false,
            starterBound: false,
            sourceBattleId: null,
            salvagedAt: null,
            createdAt: new Date(0),
          }),
        );
      }
      const stats = deriveBattleStats({ profession, level, equipment });
      const power = fighterPower(stats);
      const tie = createHash('sha256').update(`${seedHex}:${tier}:${serial.join(',')}`).digest('hex');
      if (
        !best ||
        Math.abs(power - target) < Math.abs(best.power - target) ||
        (Math.abs(power - target) === Math.abs(best.power - target) && tie < best.tie)
      ) {
        best = { power, equipment, tie };
      }
    }
    const chosen = best!;
    const stats = deriveBattleStats({ profession, level, equipment: chosen.equipment });
    const names = ['项目协作专员', '跨组交付同事', '流程优化伙伴'];
    return {
      publicId: this.uuidFromHash(`${seedHex}:${tier}:public`),
      displayName: names[digest[1] % names.length],
      profession,
      battleLevel: level,
      power: fighterPower(stats),
      stats,
      equipment: this.slotOrder(chosen.equipment).map((item) => this.uncontextualizedEquipmentView(item)),
    };
  }

  private offerView(
    offer: OfficeBattleOffer,
    playerEquipment: OfficeBattleEquipment[],
    profile: OfficeBattleProfile,
  ) {
    const opponent = offer.opponentSnapshot as unknown as FighterSnapshot;
    const level = battleLevelSnapshot(profile.totalBattleExperience).level;
    const playerPower = fighterPower(
      deriveBattleStats({ profession: profile.profession, level, equipment: playerEquipment }),
    );
    const difference = playerPower === 0 ? 0 : ((opponent.power - playerPower) * 100) / playerPower;
    return {
      offerId: offer.id,
      tier: offer.tier,
      expiresAt: offer.expiresAt.toISOString(),
      opponent: this.opponentSummary(opponent),
      powerDifferencePercent: Math.round(difference * 10) / 10,
      rewardPreview: {
        battleExperience: 30,
        workspaceExperience: 10,
        workspaceCoins: this.multiplyReward(10, offer.rewardMultiplierPercent),
        dropEligible: true,
        note: '基础稀有度概率不受对手档位影响',
      },
    };
  }

  private async friendCandidates(
    manager: EntityManager,
    userId: string,
    profile: OfficeBattleProfile,
    now: Date,
  ) {
    const friendships = await manager
      .getRepository(Friendship)
      .createQueryBuilder('friendship')
      .where('friendship.ended_at IS NULL')
      .andWhere('(friendship.user_low_id = :userId OR friendship.user_high_id = :userId)', { userId })
      .orderBy('friendship.current_started_at', 'ASC')
      .addOrderBy('friendship.id', 'ASC')
      .limit(FRIEND_CANDIDATE_LIMIT)
      .getMany();
    const targetIds = friendships.map((friendship) =>
      friendship.userLowId === userId
        ? friendship.userHighId
        : friendship.userLowId,
    );
    if (targetIds.length === 0) return [];
    const [blocks, users, battleProfiles, playerProfiles, defenses, claims] = await Promise.all([
      manager.getRepository(UserBlock).find({
        where: [
          { blockerId: userId, blockedId: In(targetIds) },
          { blockerId: In(targetIds), blockedId: userId },
        ],
      }),
      manager.getRepository(User).find({
        where: { id: In(targetIds), accountStatus: 'active' },
      }),
      manager.getRepository(OfficeBattleProfile).find({
        where: { userId: In(targetIds) },
      }),
      manager.getRepository(PlayerProfile).find({
        where: { userId: In(targetIds) },
      }),
      manager.getRepository(OfficeBattleDefenseConfig).find({
        where: { userId: In(targetIds) },
      }),
      manager.getRepository(OfficeBattleFriendRewardClaim).find({
        where: {
          attackerUserId: userId,
          defenderUserId: In(targetIds),
          serviceDate: profile.serviceDate,
        },
      }),
    ]);
    const blocked = new Set(
      blocks.map((block) =>
        block.blockerId === userId ? block.blockedId : block.blockerId,
      ),
    );
    const userById = new Map(users.map((user) => [user.id, user]));
    const battleProfileByUser = new Map(battleProfiles.map((row) => [row.userId, row]));
    const playerProfileByUser = new Map(playerProfiles.map((row) => [row.userId, row]));
    const defenseByUser = new Map(defenses.map((row) => [row.userId, row]));
    const claimedUsers = new Set(claims.map((claim) => claim.defenderUserId));
    const result: Array<Record<string, unknown>> = [];
    for (const friendship of friendships) {
      const targetId = friendship.userLowId === userId ? friendship.userHighId : friendship.userLowId;
      if (blocked.has(targetId)) continue;
      const target = userById.get(targetId);
      const targetProfile = battleProfileByUser.get(targetId);
      const defense = defenseByUser.get(targetId);
      if (!target || target.socialVerificationStatus !== 'verified' || !targetProfile || !defense || defense.challengeVisibility === 'none') continue;
      const oldEnough = now.getTime() - friendship.currentStartedAt.getTime() >= FRIEND_REWARD_AGE_MS;
      const claimed = claimedUsers.has(targetId);
      const eligible = oldEnough && !claimed && profile.rewardedFriendBattlesUsed < OFFICE_BATTLE_DAILY_FRIEND_LIMIT && profile.energy > 0;
      result.push({
        publicId: target.publicId,
        displayName: this.displayName(target, playerProfileByUser.get(targetId)),
        profession: targetProfile.profession,
        battleLevel: battleLevelSnapshot(targetProfile.totalBattleExperience).level,
        eligibleForReward: eligible,
        requiresPracticeConfirmation: !eligible,
        reason: eligible
          ? null
          : !oldEnough
            ? '成为好友满 24 小时后可获得奖励'
            : claimed
              ? '今日与该好友的奖励场次已结算'
              : profile.rewardedFriendBattlesUsed >= OFFICE_BATTLE_DAILY_FRIEND_LIMIT
                ? '今日好友奖励场次已达上限'
                : '今日项目精力不足',
      });
    }
    return result;
  }

  private async equipmentContext(
    manager: EntityManager,
    profile: OfficeBattleProfile,
  ): Promise<EquipmentContext> {
    const items = await manager.getRepository(OfficeBattleEquipment).find({
      where: { userId: profile.userId, salvagedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    const loadoutItems = await manager.getRepository(OfficeBattleLoadoutItem).find({
      where: { userId: profile.userId },
    });
    const loadout = this.slotOrder(
      loadoutItems
        .map((row) => items.find((item) => item.id === row.equipmentId))
        .filter((item): item is OfficeBattleEquipment => Boolean(item)),
    );
    if (loadout.length !== OFFICE_BATTLE_SLOTS.length) {
      throw new ConflictException({ code: 'BATTLE_LOADOUT_INVALID' });
    }
    let defense = await manager.getRepository(OfficeBattleDefenseConfig).findOne({
      where: { userId: profile.userId },
    });
    if (!defense) {
      defense = await manager.getRepository(OfficeBattleDefenseConfig).save(
        manager.getRepository(OfficeBattleDefenseConfig).create({
          userId: profile.userId,
          profession: profile.profession,
          equipmentIds: loadout.map((item) => item.id),
          challengeVisibility: 'friends',
          equipmentVisibility: 'friends',
          version: profile.defenseVersion,
        }),
      );
    }
    return { items, loadoutItems, loadout, defense };
  }

  private async validConfigurationEquipment(
    manager: EntityManager,
    profile: OfficeBattleProfile,
    equipmentIds: string[],
  ): Promise<OfficeBattleEquipment[]> {
    const rows = await manager.getRepository(OfficeBattleEquipment).find({
      where: { id: In(equipmentIds), userId: profile.userId, salvagedAt: IsNull() },
    });
    const level = battleLevelSnapshot(profile.totalBattleExperience).level;
    if (
      rows.length !== OFFICE_BATTLE_SLOTS.length ||
      new Set(rows.map((item) => item.slot)).size !== OFFICE_BATTLE_SLOTS.length ||
      rows.some((item) => item.profession !== profile.profession || item.requiredLevel > level)
    ) {
      throw new ConflictException({ code: 'EQUIPMENT_CONFLICT' });
    }
    return this.slotOrder(rows);
  }

  private slotOrder<T extends { slot: OfficeBattleEquipmentSlot }>(items: T[]): T[] {
    return [...items].sort(
      (left, right) => OFFICE_BATTLE_SLOTS.indexOf(left.slot) - OFFICE_BATTLE_SLOTS.indexOf(right.slot),
    );
  }

  private equipmentView(item: OfficeBattleEquipment, context: EquipmentContext): EquipmentView {
    return {
      ...this.uncontextualizedEquipmentView(item),
      equipped: context.loadoutItems.some((row) => row.equipmentId === item.id),
      canSalvage: this.canSalvage(item, context),
    };
  }

  private uncontextualizedEquipmentView(item: OfficeBattleEquipment): EquipmentView {
    return {
      id: item.id,
      name: item.name,
      slot: item.slot,
      profession: item.profession,
      requiredLevel: item.requiredLevel,
      equipmentLevel: item.equipmentLevel,
      rarity: item.rarity,
      stats: item.stats,
      score: item.score,
      locked: item.locked,
      equipped: false,
      enhancementLevel: item.enhancementLevel,
      canSalvage: !item.locked && !item.starterBound,
    };
  }

  private canSalvage(item: OfficeBattleEquipment, context: EquipmentContext): boolean {
    return (
      !item.locked &&
      !item.starterBound &&
      !context.loadoutItems.some((row) => row.equipmentId === item.id) &&
      !context.defense.equipmentIds.includes(item.id)
    );
  }

  private loadoutView(context: EquipmentContext, version: number) {
    return {
      equipment: context.loadout.map((item) => this.equipmentView(item, context)),
      version,
    };
  }

  private defenseView(defense: OfficeBattleDefenseConfig) {
    return {
      equipmentIds: defense.equipmentIds,
      challengeVisibility: defense.challengeVisibility,
      equipmentVisibility: defense.equipmentVisibility,
      version: defense.version,
    };
  }

  private async profileView(
    manager: EntityManager,
    user: User,
    profile: OfficeBattleProfile,
    equipment: OfficeBattleEquipment[],
  ) {
    const level = battleLevelSnapshot(profile.totalBattleExperience);
    const stats = deriveBattleStats({ profession: profile.profession, level: level.level, equipment });
    const balance = await manager.getRepository(WalletBalance).findOne({
      where: { userId: user.id, currency: 'office_coin' },
    });
    return {
      publicId: user.publicId,
      displayName: this.displayName(user),
      profession: profile.profession,
      battleLevel: level.level,
      totalBattleExperience: profile.totalBattleExperience,
      experienceInLevel: level.experienceInLevel,
      experienceToNextLevel: level.experienceToNextLevel,
      wins: profile.wins,
      losses: profile.losses,
      power: fighterPower(stats),
      stats,
      energy: this.energyView(profile, this.clock.now()),
      workspaceCoins: Number(balance?.balance ?? 0),
      parts: profile.parts,
      profileVersion: profile.profileVersion,
      loadoutVersion: profile.loadoutVersion,
      inventoryVersion: profile.inventoryVersion,
      defenseVersion: profile.defenseVersion,
      accountState: 'active' as const,
      restrictionReason: null,
    };
  }

  private energyView(profile: OfficeBattleProfile, now: Date) {
    return {
      current: profile.energy,
      max: OFFICE_BATTLE_DAILY_ENERGY,
      serviceDate: profile.serviceDate,
      resetsAt: nextCommunityReset(now).toISOString(),
    };
  }

  private fighterSnapshot(
    user: User,
    profession: OfficeBattleProfession,
    level: number,
    equipment: OfficeBattleEquipment[],
    includeEquipment: boolean,
  ): FighterSnapshot {
    const stats = deriveBattleStats({ profession, level, equipment });
    return {
      publicId: user.publicId,
      displayName: this.displayName(user),
      profession,
      battleLevel: level,
      power: fighterPower(stats),
      stats,
      equipment: includeEquipment
        ? this.slotOrder(equipment).map((item) => ({
            ...this.uncontextualizedEquipmentView(item),
            equipped: true,
            canSalvage: false,
          }))
        : null,
    };
  }

  private opponentSummary(opponent: FighterSnapshot) {
    return {
      publicId: opponent.publicId,
      displayName: opponent.displayName,
      profession: opponent.profession,
      battleLevel: opponent.battleLevel,
      power: opponent.power,
    };
  }

  private pendingRewardView(reward: OfficeBattlePendingReward) {
    return {
      id: reward.id,
      battleId: reward.battleId,
      equipment: reward.equipmentSnapshot as unknown as EquipmentView,
      expiresAt: null,
    };
  }

  private settlementView(record: OfficeBattleRecord, viewerIsDefender = false) {
    const player = structuredClone(record.playerSnapshot) as unknown as FighterSnapshot;
    const opponent = structuredClone(record.opponentSnapshot) as unknown as FighterSnapshot;
    if (viewerIsDefender) {
      if (!record.playerEquipmentVisibleToDefender) player.equipment = null;
    } else if (!record.opponentEquipmentVisible) {
      opponent.equipment = null;
    }
    return {
      battleId: record.id,
      battleRequestId: record.battleRequestId,
      status: 'completed' as const,
      mode: record.mode,
      opponentKind: record.opponentKind,
      completedAt: record.completedAt.toISOString(),
      engineVersion: record.engineVersion,
      balanceVersion: record.balanceVersion,
      seed: record.seedHex,
      winner: record.winner,
      player,
      opponent,
      events: record.events,
      reward: record.rewardSnapshot,
      energy: record.energySnapshot,
      profileVersion: record.profileVersion,
      loadoutVersion: record.loadoutVersion,
      inventoryVersion: record.inventoryVersion,
    };
  }

  private async mutationView(
    manager: EntityManager,
    profile: OfficeBattleProfile,
    changedEquipmentId?: string,
  ) {
    const user = await manager.getRepository(User).findOneByOrFail({ id: profile.userId });
    const context = await this.equipmentContext(manager, profile);
    const changedEquipment = changedEquipmentId
      ? context.items.find((item) => item.id === changedEquipmentId) ?? null
      : null;
    return {
      profile: await this.profileView(manager, user, profile, context.loadout),
      loadout: this.loadoutViewWithVersion(context, profile.loadoutVersion),
      inventoryVersion: profile.inventoryVersion,
      changedEquipment: changedEquipment ? this.equipmentView(changedEquipment, context) : null,
    };
  }

  private loadoutViewWithVersion(context: EquipmentContext, version: number) {
    return {
      equipment: context.loadout.map((item) => this.equipmentView(item, context)),
      version,
    };
  }

  private async planReward(
    _manager: EntityManager,
    profile: OfficeBattleProfile,
    context: EquipmentContext,
    battleId: string,
    mode: BattleMode,
    winner: 'player' | 'opponent',
    multiplier: number,
    seedHex: string,
  ): Promise<RewardPlan> {
    if (mode === 'practice') {
      return {
        battleExperience: 0,
        workspaceExperience: 0,
        workspaceCoins: 0,
        parts: 0,
        equipment: null,
        pendingRewardId: null,
      };
    }
    const won = winner === 'player';
    const plan: RewardPlan = {
      battleExperience: won ? 30 : 10,
      workspaceExperience: won ? 10 : 3,
      workspaceCoins: this.multiplyReward(won ? 10 : 3, multiplier),
      parts: 0,
      equipment: null,
      pendingRewardId: null,
    };
    if (!won) return plan;

    const level = battleLevelSnapshot(profile.totalBattleExperience).level;
    const slotRoll = this.hashInteger(seedHex, 'drop-slot', OFFICE_BATTLE_SLOTS.length);
    const rarityRoll = this.hashInteger(seedHex, 'drop-rarity', 10_000) / 100;
    let definition = createEquipmentDefinition(
      profile.profession,
      OFFICE_BATTLE_SLOTS[slotRoll],
      level,
      rarityForRoll(rarityRoll),
    );
    const equippedBySlot = new Map(context.loadout.map((item) => [item.slot, item]));
    const baseIsUpgrade = definition.score > (equippedBySlot.get(definition.slot)?.score ?? -1);
    if (!profile.upgradeProtectionUsed) {
      profile.upgradeProtectionUsed = true;
      if (!baseIsUpgrade) {
        const candidates = OFFICE_BATTLE_SLOTS.flatMap((slot) =>
          OFFICE_BATTLE_RARITIES.map((rarity) => createEquipmentDefinition(profile.profession, slot, level, rarity)),
        )
          .map((candidate) => ({
            candidate,
            delta: candidate.score - (equippedBySlot.get(candidate.slot)?.score ?? -1),
          }))
          .filter(({ delta }) => delta > 0)
          .sort(
            (left, right) =>
              left.delta - right.delta ||
              OFFICE_BATTLE_SLOTS.indexOf(left.candidate.slot) - OFFICE_BATTLE_SLOTS.indexOf(right.candidate.slot) ||
              OFFICE_BATTLE_RARITIES.indexOf(left.candidate.rarity) - OFFICE_BATTLE_RARITIES.indexOf(right.candidate.rarity),
          );
        if (candidates.length === 0) {
          plan.parts = this.multiplyReward(RARITY_RULES.legendary.parts, multiplier);
          return plan;
        }
        definition = candidates[0].candidate;
      }
    }
    const equipment = Object.assign(new OfficeBattleEquipment(), {
      id: randomUUID(),
      userId: profile.userId,
      ...definition,
      locked: false,
      starterBound: false,
      sourceBattleId: battleId,
      salvagedAt: null,
      createdAt: this.clock.now(),
    });
    plan.equipment = equipment;
    if (context.items.length >= OFFICE_BATTLE_INVENTORY_LIMIT) {
      plan.pendingRewardId = randomUUID();
    }
    return plan;
  }

  private multiplyReward(value: number, percent: number): number {
    return Number(roundHalfUpFraction(BigInt(value * percent), 100n));
  }

  private hashInteger(seedHex: string, label: string, modulo: number): number {
    const digest = createHash('sha256').update(Buffer.from(seedHex, 'hex')).update(label).digest();
    return Number(digest.readBigUInt64BE(0) % BigInt(modulo));
  }

  private uuidFromHash(value: string): string {
    const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  private tierOrder(offers: OfficeBattleOffer[]): OfficeBattleOffer[] {
    const order: OfficeBattleOffer['tier'][] = ['simple', 'balanced', 'challenge'];
    return [...offers].sort((left, right) => order.indexOf(left.tier) - order.indexOf(right.tier));
  }

  private async commandMutation<T extends object>(
    userId: string,
    commandType: string,
    key: string,
    request: unknown,
    apply: (
      manager: EntityManager,
      user: User,
      profile: OfficeBattleProfile,
    ) => Promise<T>,
  ): Promise<T> {
    const hash = requestHash(request);
    return this.dataSource.transaction(async (manager) => {
      const user = await this.lockVerifiedUser(manager, userId);
      const replay = await this.replay<T>(manager, userId, commandType, key, hash);
      if (replay) return replay;
      const profile = await manager.getRepository(OfficeBattleProfile).findOne({
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!profile) throw new ConflictException({ code: 'BATTLE_PROFILE_REQUIRED' });
      await this.applyDailyReset(manager, profile);
      const result = await apply(manager, user, profile);
      return this.record(manager, userId, commandType, key, hash, result);
    });
  }

  private async replay<T extends object>(
    manager: EntityManager,
    userId: string,
    commandType: string,
    key: string,
    hash: string,
  ): Promise<T | null> {
    const receipt = await manager.getRepository(CommunityCommandReceipt).findOne({
      where: { userId, commandType, idempotencyKey: key },
    });
    if (!receipt) return null;
    if (receipt.requestHash !== hash) throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' });
    return receipt.result as T;
  }

  private async record<T extends object>(
    manager: EntityManager,
    userId: string,
    commandType: string,
    key: string,
    hash: string,
    result: T,
  ): Promise<T> {
    await manager.getRepository(CommunityCommandReceipt).save(
      manager.getRepository(CommunityCommandReceipt).create({
        userId,
        commandType,
        idempotencyKey: key,
        requestHash: hash,
        result: result as unknown as Record<string, unknown>,
      }),
    );
    return result;
  }

  private async assetLedger(
    manager: EntityManager,
    profile: OfficeBattleProfile,
    battleId: string | null,
    assetType: OfficeBattleAssetLedger['assetType'],
    delta: number,
    reason: string,
    key: string,
  ): Promise<void> {
    const balanceAfter =
      assetType === 'energy'
        ? profile.energy
        : assetType === 'parts'
          ? profile.parts
          : profile.totalBattleExperience;
    await manager.getRepository(OfficeBattleAssetLedger).save(
      manager.getRepository(OfficeBattleAssetLedger).create({
        userId: profile.userId,
        battleId,
        assetType,
        delta,
        balanceAfter,
        reason,
        idempotencyKey: key,
      }),
    );
  }

  private async inventoryLedger(
    manager: EntityManager,
    userId: string,
    equipmentId: string | null,
    battleId: string | null,
    action: OfficeBattleInventoryLedger['action'],
    payload: Record<string, unknown>,
    key: string,
  ): Promise<void> {
    await manager.getRepository(OfficeBattleInventoryLedger).save(
      manager.getRepository(OfficeBattleInventoryLedger).create({
        userId,
        equipmentId,
        battleId,
        action,
        payload,
        idempotencyKey: key,
      }),
    );
  }

  private versionConflict(currentVersion: number): ConflictException {
    return new ConflictException({ code: 'VERSION_CONFLICT', currentVersion });
  }

  private async ensurePlayerProfile(manager: EntityManager, userId: string): Promise<PlayerProfile> {
    const repo = manager.getRepository(PlayerProfile);
    const existing = await repo.findOne({ where: { userId } });
    if (existing) return existing;
    return repo.save(
      repo.create({
        userId,
        nickname: null,
        avatarKey: null,
        bio: null,
        battleProfession: null,
        privacySettings: { ...DEFAULT_COMMUNITY_PRIVACY },
        title: '初入工位',
      }),
    );
  }

  private displayName(user: User, profile?: PlayerProfile): string {
    return profile?.nickname?.trim() || user.displayName?.trim() || '职场伙伴';
  }

  private cursorStart(rows: OfficeBattleEquipment[], raw?: string): number {
    if (!raw) return 0;
    try {
      const cursor = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
        id?: unknown;
        createdAt?: unknown;
      };
      if (typeof cursor.id !== 'string' || typeof cursor.createdAt !== 'string') throw new Error();
      const index = rows.findIndex(
        (row) => row.id === cursor.id && row.createdAt.toISOString() === cursor.createdAt,
      );
      if (index < 0) throw new Error();
      return index + 1;
    } catch {
      throw this.invalid('INVALID_CURSOR');
    }
  }

  private cursor(row: OfficeBattleEquipment): string {
    return Buffer.from(
      JSON.stringify({ id: row.id, createdAt: row.createdAt.toISOString() }),
    ).toString('base64url');
  }

  private decodeRecordCursor(
    raw?: string,
  ): { id: string; completedAt: Date } | null {
    if (!raw) return null;
    try {
      const cursor = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
        id?: unknown;
        completedAt?: unknown;
      };
      if (
        typeof cursor.id !== 'string' ||
        !UUID_PATTERN.test(cursor.id) ||
        typeof cursor.completedAt !== 'string'
      ) {
        throw new Error();
      }
      const completedAt = new Date(cursor.completedAt);
      if (
        Number.isNaN(completedAt.getTime()) ||
        completedAt.toISOString() !== cursor.completedAt
      ) {
        throw new Error();
      }
      return { id: cursor.id, completedAt };
    } catch {
      throw this.invalid('INVALID_CURSOR');
    }
  }

  private recordCursor(row: OfficeBattleRecord): string {
    return Buffer.from(
      JSON.stringify({ id: row.id, completedAt: row.completedAt.toISOString() }),
    ).toString('base64url');
  }
}
