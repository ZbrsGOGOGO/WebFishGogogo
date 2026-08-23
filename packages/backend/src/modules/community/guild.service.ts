import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';

import {
  CommunityCommandReceipt,
  Guild,
  GuildBossContribution,
  GuildBossRun,
  GuildLedger,
  GuildMember,
  User,
} from '../../database/entities';
import type { GuildBuildingKey } from '../../database/entities/guild.entity';
import {
  PlatformAssetsService,
  type PlatformAssetState,
} from '../platform';
import { COMMUNITY_CLOCK, type CommunityClock } from './community-clock';
import { toCommunityServiceDate } from './community-time';
import { requestHash } from './community-validation';
import { assertCommunityWritesEnabled } from './community-write-gate';
import {
  GUILD_BUILDING_DEFINITIONS,
  GUILD_BOSS_ACTIVITY_REWARD,
  GUILD_BOSS_DAILY_ATTEMPTS,
  GUILD_BOSS_ENERGY_COST,
  GUILD_BOSS_REWARD_COINS,
  GUILD_BOSS_REWARD_EXPERIENCE,
  GUILD_BOSS_RULE_VERSION,
  GUILD_BOSS_UNLOCK_LEVEL,
  GUILD_CREATE_COST,
  GUILD_DAILY_EFFECTIVE_DONATION,
  GUILD_MAX_BUILDING_LEVEL,
  GUILD_UNLOCK_LEVEL,
  guildBossBaseDamage,
  guildBossMaxHp,
  guildBuildingCost,
  normalizeGuildBuildings,
} from './guild.rules';

const DISCOVERY_LIMIT = 20;
const DONATION_MAX_PER_REQUEST = 5_000;

@Injectable()
export class GuildService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly assets: PlatformAssetsService,
    @Inject(COMMUNITY_CLOCK) private readonly clock: CommunityClock,
  ) {}

  async overview(userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const state = await this.assets.ensurePlatformState(manager, userId);
      return this.overviewView(manager, userId, state);
    });
  }

  async create(userId: string, rawName: string, key: string) {
    assertCommunityWritesEnabled();
    const name = this.guildName(rawName);
    const hash = requestHash({ name });
    return this.dataSource.transaction(async (manager) => {
      const state = await this.assets.ensurePlatformState(manager, userId);
      const replay = await this.replay(manager, userId, 'guild.create', key, hash);
      if (replay) return replay;
      this.assertUnlocked(state);
      if (await manager.getRepository(GuildMember).exist({ where: { userId } })) {
        throw new ConflictException({ code: 'GUILD_MEMBERSHIP_EXISTS' });
      }
      const nameKey = this.guildNameKey(name);
      if (await manager.getRepository(Guild).exist({ where: { nameKey } })) {
        throw new ConflictException({ code: 'GUILD_NAME_TAKEN' });
      }
      await this.assets.debitWallet(manager, userId, 'office_coin', GUILD_CREATE_COST, {
        sourceType: 'guild_create',
        sourceId: userId,
        reason: 'guild-create-fixed-cost-v1',
        idempotencyKey: `${key}:guild-create-office-coin`,
      });
      const guild = await manager.getRepository(Guild).save(
        manager.getRepository(Guild).create({
          name,
          nameKey,
          ownerUserId: userId,
          level: 1,
          treasury: '0',
          memberCapacity: 30,
          buildings: normalizeGuildBuildings(null),
        }),
      );
      await manager.getRepository(GuildMember).save(
        manager.getRepository(GuildMember).create({
          userId,
          guildId: guild.id,
          role: 'owner',
          activity: 0,
          donatedToday: 0,
          donationServiceDate: null,
        }),
      );
      const result = await this.overviewView(
        manager,
        userId,
        await this.assets.ensurePlatformState(manager, userId),
      );
      return this.record(manager, userId, 'guild.create', key, hash, result);
    });
  }

  async join(userId: string, guildId: string, key: string) {
    assertCommunityWritesEnabled();
    const hash = requestHash({ guildId });
    return this.dataSource.transaction(async (manager) => {
      const state = await this.assets.ensurePlatformState(manager, userId);
      const replay = await this.replay(manager, userId, 'guild.join', key, hash);
      if (replay) return replay;
      this.assertUnlocked(state);
      if (await manager.getRepository(GuildMember).exist({ where: { userId } })) {
        throw new ConflictException({ code: 'GUILD_MEMBERSHIP_EXISTS' });
      }
      const guild = await manager.getRepository(Guild).findOne({
        where: { id: guildId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!guild) throw new NotFoundException({ code: 'GUILD_NOT_FOUND' });
      const memberCount = await manager.getRepository(GuildMember).count({ where: { guildId } });
      if (memberCount >= guild.memberCapacity) {
        throw new ConflictException({ code: 'GUILD_MEMBER_CAPACITY_REACHED' });
      }
      await manager.getRepository(GuildMember).save(
        manager.getRepository(GuildMember).create({
          userId,
          guildId,
          role: 'member',
          activity: 0,
          donatedToday: 0,
          donationServiceDate: null,
        }),
      );
      const result = await this.overviewView(manager, userId, state);
      return this.record(manager, userId, 'guild.join', key, hash, result);
    });
  }

  async donate(userId: string, amount: number, key: string) {
    assertCommunityWritesEnabled();
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > DONATION_MAX_PER_REQUEST) {
      throw new BadRequestException({ code: 'GUILD_DONATION_INVALID' });
    }
    const hash = requestHash({ amount });
    return this.dataSource.transaction(async (manager) => {
      await this.assets.ensurePlatformState(manager, userId);
      const replay = await this.replay(manager, userId, 'guild.donate', key, hash);
      if (replay) return replay;
      const member = await this.requireMember(manager, userId);
      const guild = await this.requireGuild(manager, member.guildId);
      const serviceDate = toCommunityServiceDate(this.clock.now());
      if (member.donationServiceDate !== serviceDate) {
        member.donationServiceDate = serviceDate;
        member.donatedToday = 0;
      }
      await this.assets.debitWallet(manager, userId, 'office_coin', amount, {
        sourceType: 'guild_donation',
        sourceId: guild.id,
        reason: 'guild-treasury-transfer-v1',
        idempotencyKey: `${key}:guild-donation-office-coin`,
      });
      const effective = Math.max(
        0,
        Math.min(amount, GUILD_DAILY_EFFECTIVE_DONATION - member.donatedToday),
      );
      member.donatedToday += amount;
      member.activity += effective;
      guild.treasury = String(this.safeAmount(guild.treasury) + amount);
      await manager.getRepository(GuildMember).save(member);
      await manager.getRepository(Guild).save(guild);
      await manager.getRepository(GuildLedger).save(
        manager.getRepository(GuildLedger).create({
          guildId: guild.id,
          userId,
          kind: 'donation',
          delta: String(amount),
          treasuryAfter: guild.treasury,
          reason: 'member-donation',
          idempotencyKey: `guild-ledger:${key}`,
          metadata: { effectiveActivity: effective, serviceDate },
        }),
      );
      const result = await this.overviewView(
        manager,
        userId,
        await this.assets.ensurePlatformState(manager, userId),
        {
          amount,
          effectiveActivity: effective,
        },
      );
      return this.record(manager, userId, 'guild.donate', key, hash, result);
    });
  }

  async upgradeBuilding(userId: string, buildingKey: GuildBuildingKey, key: string) {
    assertCommunityWritesEnabled();
    if (!GUILD_BUILDING_DEFINITIONS.some((item) => item.key === buildingKey)) {
      throw new NotFoundException({ code: 'GUILD_BUILDING_NOT_FOUND' });
    }
    const hash = requestHash({ buildingKey });
    return this.dataSource.transaction(async (manager) => {
      const state = await this.assets.ensurePlatformState(manager, userId);
      const replay = await this.replay(manager, userId, 'guild.building.upgrade', key, hash);
      if (replay) return replay;
      const member = await this.requireMember(manager, userId);
      if (member.role !== 'owner') {
        throw new ForbiddenException({ code: 'GUILD_OWNER_REQUIRED' });
      }
      const guild = await this.requireGuild(manager, member.guildId);
      const buildings = normalizeGuildBuildings(guild.buildings);
      const currentLevel = buildings[buildingKey];
      if (currentLevel >= GUILD_MAX_BUILDING_LEVEL) {
        throw new ConflictException({ code: 'GUILD_BUILDING_MAX_LEVEL' });
      }
      const cost = guildBuildingCost(currentLevel);
      const treasury = this.safeAmount(guild.treasury);
      if (treasury < cost) {
        throw new ConflictException({
          code: 'GUILD_TREASURY_INSUFFICIENT',
          required: cost,
          current: treasury,
        });
      }
      buildings[buildingKey] = currentLevel + 1;
      guild.buildings = buildings;
      guild.treasury = String(treasury - cost);
      await manager.getRepository(Guild).save(guild);
      await manager.getRepository(GuildLedger).save(
        manager.getRepository(GuildLedger).create({
          guildId: guild.id,
          userId,
          kind: 'building_upgrade',
          delta: String(-cost),
          treasuryAfter: guild.treasury,
          reason: `upgrade-${buildingKey}-${currentLevel + 1}`,
          idempotencyKey: `guild-ledger:${key}`,
          metadata: { buildingKey, previousLevel: currentLevel, level: currentLevel + 1 },
        }),
      );
      const result = await this.overviewView(manager, userId, state, {
        buildingKey,
        level: currentLevel + 1,
        cost,
      });
      return this.record(manager, userId, 'guild.building.upgrade', key, hash, result);
    });
  }

  async attackBoss(userId: string, key: string) {
    assertCommunityWritesEnabled();
    const hash = requestHash({ action: 'attack' });
    return this.dataSource.transaction(async (manager) => {
      const state = await this.assets.ensurePlatformState(manager, userId);
      const replay = await this.replay(manager, userId, 'guild.boss.attack', key, hash);
      if (replay) return replay;
      if (state.progression.level < GUILD_BOSS_UNLOCK_LEVEL) {
        throw new ConflictException({
          code: 'GUILD_BOSS_LEVEL_LOCKED',
          unlockLevel: GUILD_BOSS_UNLOCK_LEVEL,
        });
      }

      const member = await this.requireMember(manager, userId);
      const guild = await this.requireGuild(manager, member.guildId);
      const serviceDate = toCommunityServiceDate(this.clock.now());
      const run = await this.ensureBossRun(manager, guild, serviceDate);
      if (run.status === 'defeated' || this.safeAmount(run.remainingHp) === 0) {
        throw new ConflictException({ code: 'GUILD_BOSS_ALREADY_DEFEATED' });
      }
      const existing = await manager.getRepository(GuildBossContribution).findOne({
        where: { runId: run.id, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (existing) {
        throw new ConflictException({ code: 'GUILD_BOSS_DAILY_ATTEMPT_USED' });
      }

      await this.assets.changeEnergy(manager, userId, -GUILD_BOSS_ENERGY_COST);
      const projectRoomLevel = normalizeGuildBuildings(guild.buildings).project_room;
      const roll = this.bossDamageRoll(run.id, userId, key);
      const rawDamage = Math.round(
        (guildBossBaseDamage(state.progression.level, projectRoomLevel) + roll.bonus)
          * (roll.criticalHit ? 1.5 : 1),
      );
      const remainingBefore = this.safeAmount(run.remainingHp);
      const damage = Math.min(remainingBefore, rawDamage);
      const remainingHp = remainingBefore - damage;
      run.remainingHp = String(remainingHp);
      if (remainingHp === 0) {
        run.status = 'defeated';
        run.defeatedAt = this.clock.now();
      }
      await manager.getRepository(GuildBossRun).save(run);

      const reward = await this.assets.grantReward(manager, {
        userId,
        sourceType: 'guild_boss_attack',
        sourceId: run.id,
        ruleKey: GUILD_BOSS_RULE_VERSION,
        reward: {
          experience: GUILD_BOSS_REWARD_EXPERIENCE,
          currencies: { office_coin: GUILD_BOSS_REWARD_COINS },
        },
      });
      member.activity += GUILD_BOSS_ACTIVITY_REWARD;
      await manager.getRepository(GuildMember).save(member);
      await manager.getRepository(GuildBossContribution).save(
        manager.getRepository(GuildBossContribution).create({
          runId: run.id,
          guildId: guild.id,
          userId,
          damage: String(damage),
          criticalHit: roll.criticalHit,
          rewardSnapshot: reward.snapshot,
        }),
      );

      const nextState = await this.assets.ensurePlatformState(manager, userId);
      const result = await this.overviewView(manager, userId, nextState, {
        type: 'guildBossAttack',
        damage,
        criticalHit: roll.criticalHit,
        defeated: run.status === 'defeated',
        reward: reward.snapshot,
      });
      return this.record(manager, userId, 'guild.boss.attack', key, hash, result);
    });
  }

  async leave(userId: string): Promise<void> {
    assertCommunityWritesEnabled();
    await this.dataSource.transaction(async (manager) => {
      await this.assets.ensurePlatformState(manager, userId);
      const member = await this.requireMember(manager, userId);
      if (member.role === 'owner') {
        throw new ConflictException({ code: 'GUILD_OWNER_CANNOT_LEAVE' });
      }
      await manager.getRepository(GuildMember).delete({ userId });
    });
  }

  private async overviewView(
    manager: EntityManager,
    userId: string,
    state: PlatformAssetState,
    lastMutation: Record<string, unknown> | null = null,
  ): Promise<Record<string, unknown>> {
    const member = await manager.getRepository(GuildMember).findOne({ where: { userId } });
    const guild = member
      ? await manager.getRepository(Guild).findOne({ where: { id: member.guildId } })
      : null;
    const suggestions = member ? [] : await this.discovery(manager);
    const balance = Number(state.balances.get('office_coin')?.balance ?? 0);
    return {
      serverTime: this.clock.now().toISOString(),
      unlockLevel: GUILD_UNLOCK_LEVEL,
      unlocked: state.progression.level >= GUILD_UNLOCK_LEVEL,
      player: {
        level: state.progression.level,
        officeCoins: balance,
        energy: state.energy.balance,
        energyCapacity: state.energy.capacity,
      },
      rules: {
        createCost: GUILD_CREATE_COST,
        dailyEffectiveDonation: GUILD_DAILY_EFFECTIVE_DONATION,
        maxDonationPerRequest: DONATION_MAX_PER_REQUEST,
        boss: {
          unlockLevel: GUILD_BOSS_UNLOCK_LEVEL,
          energyCost: GUILD_BOSS_ENERGY_COST,
          dailyAttempts: GUILD_BOSS_DAILY_ATTEMPTS,
          reward: {
            officeCoins: GUILD_BOSS_REWARD_COINS,
            experience: GUILD_BOSS_REWARD_EXPERIENCE,
            activity: GUILD_BOSS_ACTIVITY_REWARD,
          },
        },
        market: { status: 'observation', minimumObservationDays: 14 },
      },
      membership: member && guild
        ? await this.guildView(manager, guild, member, state)
        : null,
      suggestions,
      lastMutation,
    };
  }

  private async discovery(manager: EntityManager) {
    const guilds = await manager.getRepository(Guild).find({
      order: { createdAt: 'ASC' },
      take: DISCOVERY_LIMIT,
    });
    if (guilds.length === 0) return [];
    const members = await manager.getRepository(GuildMember).find({
      where: { guildId: In(guilds.map((guild) => guild.id)) },
    });
    const counts = new Map<string, number>();
    for (const member of members) counts.set(member.guildId, (counts.get(member.guildId) ?? 0) + 1);
    return guilds.map((guild) => ({
      id: guild.id,
      name: guild.name,
      level: guild.level,
      memberCount: counts.get(guild.id) ?? 0,
      memberCapacity: guild.memberCapacity,
      treasury: this.safeAmount(guild.treasury),
    }));
  }

  private async guildView(
    manager: EntityManager,
    guild: Guild,
    current: GuildMember,
    state: PlatformAssetState,
  ) {
    const members = await manager.getRepository(GuildMember).find({
      where: { guildId: guild.id },
      order: { joinedAt: 'ASC' },
    });
    const users = await manager.getRepository(User).find({
      where: { id: In(members.map((member) => member.userId)) },
    });
    const userById = new Map(users.map((user) => [user.id, user]));
    const buildings = normalizeGuildBuildings(guild.buildings);
    return {
      guild: {
        id: guild.id,
        name: guild.name,
        level: guild.level,
        treasury: this.safeAmount(guild.treasury),
        memberCount: members.length,
        memberCapacity: guild.memberCapacity,
        version: guild.version,
      },
      me: {
        role: current.role,
        activity: current.activity,
        donatedToday:
          current.donationServiceDate === toCommunityServiceDate(this.clock.now())
            ? current.donatedToday
            : 0,
      },
      buildings: GUILD_BUILDING_DEFINITIONS.map((definition) => ({
        ...definition,
        level: buildings[definition.key],
        maxLevel: GUILD_MAX_BUILDING_LEVEL,
        nextCost: guildBuildingCost(buildings[definition.key]),
      })),
      members: members.map((member) => ({
        publicId: userById.get(member.userId)?.publicId ?? null,
        displayName: userById.get(member.userId)?.displayName ?? '已注销成员',
        role: member.role,
        activity: member.activity,
        joinedAt: member.joinedAt.toISOString(),
      })),
      boss: await this.guildBossView(manager, guild, current, state, members.length),
    };
  }

  private async guildBossView(
    manager: EntityManager,
    guild: Guild,
    current: GuildMember,
    state: PlatformAssetState,
    memberCount: number,
  ) {
    const serviceDate = toCommunityServiceDate(this.clock.now());
    const run = await manager.getRepository(GuildBossRun).findOne({
      where: { guildId: guild.id, serviceDate },
    });
    const buildings = normalizeGuildBuildings(guild.buildings);
    const expectedMaxHp = guildBossMaxHp(memberCount, buildings.project_room);
    const contributions = run
      ? await manager.getRepository(GuildBossContribution).find({
          where: { runId: run.id },
          order: { damage: 'DESC', createdAt: 'ASC' },
          take: 20,
        })
      : [];
    const users = contributions.length > 0
      ? await manager.getRepository(User).find({
          where: { id: In(contributions.map((entry) => entry.userId)) },
        })
      : [];
    const userById = new Map(users.map((user) => [user.id, user]));
    const mine = contributions.find((entry) => entry.userId === current.userId) ?? null;
    const status = run?.status ?? 'ready';
    return {
      serviceDate,
      bossName: run?.bossName ?? '季度截止线',
      status,
      maxHp: run ? this.safeAmount(run.maxHp) : expectedMaxHp,
      remainingHp: run ? this.safeAmount(run.remainingHp) : expectedMaxHp,
      endsAt: run?.endsAt.toISOString() ?? this.bossEndsAt(serviceDate).toISOString(),
      version: run?.version ?? 0,
      attempted: Boolean(mine),
      attemptsRemaining: mine ? 0 : GUILD_BOSS_DAILY_ATTEMPTS,
      canAttack:
        state.progression.level >= GUILD_BOSS_UNLOCK_LEVEL
        && state.energy.balance >= GUILD_BOSS_ENERGY_COST
        && !mine
        && status !== 'defeated',
      myContribution: mine
        ? { damage: this.safeAmount(mine.damage), criticalHit: mine.criticalHit }
        : null,
      leaderboard: contributions.map((entry, index) => ({
        rank: index + 1,
        publicId: userById.get(entry.userId)?.publicId ?? null,
        displayName: userById.get(entry.userId)?.displayName ?? '已注销成员',
        damage: this.safeAmount(entry.damage),
        criticalHit: entry.criticalHit,
      })),
    };
  }

  private async ensureBossRun(
    manager: EntityManager,
    guild: Guild,
    serviceDate: string,
  ): Promise<GuildBossRun> {
    const repository = manager.getRepository(GuildBossRun);
    const existing = await repository.findOne({
      where: { guildId: guild.id, serviceDate },
      lock: { mode: 'pessimistic_write' },
    });
    if (existing) return existing;
    const memberCount = await manager.getRepository(GuildMember).count({
      where: { guildId: guild.id },
    });
    const projectRoomLevel = normalizeGuildBuildings(guild.buildings).project_room;
    const maxHp = guildBossMaxHp(memberCount, projectRoomLevel);
    return repository.save(repository.create({
      guildId: guild.id,
      serviceDate,
      bossKey: 'quarterly_deadline',
      bossName: '季度截止线',
      maxHp: String(maxHp),
      remainingHp: String(maxHp),
      status: 'active',
      defeatedAt: null,
      endsAt: this.bossEndsAt(serviceDate),
    }));
  }

  private bossDamageRoll(runId: string, userId: string, key: string) {
    const hash = createHash('sha256').update(`${runId}:${userId}:${key}`).digest();
    return {
      bonus: hash.readUInt16BE(0) % 161,
      criticalHit: hash[2] % 100 < 12,
    };
  }

  private bossEndsAt(serviceDate: string): Date {
    return new Date(`${serviceDate}T21:00:00.000Z`);
  }

  private assertUnlocked(state: PlatformAssetState): void {
    if (state.progression.level < GUILD_UNLOCK_LEVEL) {
      throw new ConflictException({ code: 'GUILD_LEVEL_LOCKED', unlockLevel: GUILD_UNLOCK_LEVEL });
    }
  }

  private async requireMember(manager: EntityManager, userId: string): Promise<GuildMember> {
    const member = await manager.getRepository(GuildMember).findOne({
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!member) throw new NotFoundException({ code: 'GUILD_MEMBERSHIP_REQUIRED' });
    return member;
  }

  private async requireGuild(manager: EntityManager, guildId: string): Promise<Guild> {
    const guild = await manager.getRepository(Guild).findOne({
      where: { id: guildId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!guild) throw new NotFoundException({ code: 'GUILD_NOT_FOUND' });
    return guild;
  }

  private guildName(value: string): string {
    const name = value.trim().replace(/\s+/g, ' ');
    if (
      name.length < 2 ||
      name.length > 16 ||
      !/^[\p{L}\p{N}_· -]+$/u.test(name)
    ) {
      throw new BadRequestException({ code: 'GUILD_NAME_INVALID' });
    }
    return name;
  }

  private guildNameKey(value: string): string {
    return value.toLocaleLowerCase('zh-CN');
  }

  private safeAmount(value: string): number {
    const amount = Number(value);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new ConflictException({ code: 'GUILD_TREASURY_INVALID' });
    }
    return amount;
  }

  private async replay(
    manager: EntityManager,
    userId: string,
    commandType: string,
    key: string,
    hash: string,
  ): Promise<Record<string, unknown> | null> {
    const receipt = await manager.getRepository(CommunityCommandReceipt).findOne({
      where: { userId, commandType, idempotencyKey: key },
      lock: { mode: 'pessimistic_write' },
    });
    if (!receipt) return null;
    if (receipt.requestHash !== hash) {
      throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' });
    }
    return receipt.result;
  }

  private async record(
    manager: EntityManager,
    userId: string,
    commandType: string,
    key: string,
    hash: string,
    result: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    await manager.getRepository(CommunityCommandReceipt).save(
      manager.getRepository(CommunityCommandReceipt).create({
        userId,
        commandType,
        idempotencyKey: key,
        requestHash: hash,
        result,
      }),
    );
    return result;
  }
}
