import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  DemonTowerSourceBattleProfile,
  DemonTowerSourceContribution as DemonTowerSourceContributionView,
  DemonTowerSourceFriend,
  DemonTowerSourceLayer,
  DemonTowerSourceProgress,
  DemonTowerSourceRankingEntry,
  DemonTowerSourceSaveInput,
  DemonTowerSourceSaveReceipt,
  DemonTowerSourceWorld,
  DemonTowerSourceWorldInput,
  DemonTowerSourceWorldReceipt,
} from '@stealth-reader/shared';
import { DataSource, EntityManager, In, IsNull, LessThan } from 'typeorm';

import {
  DemonTowerSourceCommand,
  DemonTowerSourceContribution,
  DemonTowerSourceDailyAction,
  DemonTowerSourceProfile,
  DemonTowerSourceWorldFloor,
  Friendship,
  User,
  UserBlock,
} from '../../../database/entities';
import { toBusinessLocalDate } from '../../platform/platform-time';
import { assertCommunityWritesEnabled } from '../community-write-gate';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_VERSION = '2fe1c88e' as const;
const MAX_SAVE_BYTES = 512 * 1024;
const MAX_SAVE_DEPTH = 18;
const MAX_SAVE_NODES = 30_000;
const MAX_ARRAY_LENGTH = 5_000;
const MAX_STRING_LENGTH = 8_192;
const MAX_TOTAL_STRING_LENGTH = 400_000;
const MAX_DAILY_SAVE_COUNT = 720;
const MAX_DAILY_SAVE_BYTES = 64 * 1024 * 1024;
const COMMAND_RETENTION_MS = 8 * 24 * 60 * 60 * 1_000;
const COMMAND_PRUNE_BATCH = 500;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

type PlainObject = Record<string, unknown>;

function strictObject(raw: unknown, keys: readonly string[], code: string): PlainObject {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) {
    throw new BadRequestException({ code });
  }
  const own = Object.keys(raw);
  if (own.length !== keys.length || own.some((key) => !keys.includes(key)) || keys.some((key) => !Object.prototype.hasOwnProperty.call(raw, key))) {
    throw new BadRequestException({ code });
  }
  return raw as PlainObject;
}

function integer(value: unknown, min: number, max: number, code: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new BadRequestException({ code });
  return value;
}

function requestId(value: unknown, code: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new BadRequestException({ code });
  return value.toLowerCase();
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function safeInteger(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function plain(value: unknown): PlainObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as PlainObject : {};
}

function safeNumber(value: unknown, max = 10_000): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(0, Math.round(value))) : 0;
}

function projectPower(state: PlainObject, level: number): number {
  const dims = plain(state.dims);
  const permanent = plain(state.dimPerm);
  const pills = plain(plain(state.inventory).pills);
  const destiny = Array.isArray(state.destiny) ? state.destiny.filter((item): item is string => typeof item === 'string').slice(0, 8) : [];
  const keys = ['str', 'spd', 'agi', 'def', 'luc'];
  const dimensionTotal = keys.reduce((sum, key) => sum + safeNumber(dims[key]) + safeNumber(permanent[key]) + safeNumber(pills[key]) + (destiny.includes(key) ? 8 : 0), 0);
  // Ranking has no rewards. This projection deliberately ignores the client
  // supplied `power` field and opaque equipment multipliers.
  return Math.min(10_000_000, level * 6 + dimensionTotal * 2 + destiny.length * 15);
}

function validateAndSanitizeSave(raw: string, displayName: string): PlainObject {
  if (Buffer.byteLength(raw, 'utf8') > MAX_SAVE_BYTES) throw new BadRequestException({ code: 'DEMON_TOWER_SOURCE_SAVE_TOO_LARGE' });
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new BadRequestException({ code: 'DEMON_TOWER_SOURCE_SAVE_INVALID' }); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.getPrototypeOf(parsed) !== Object.prototype) {
    throw new BadRequestException({ code: 'DEMON_TOWER_SOURCE_SAVE_INVALID' });
  }
  let nodes = 0;
  let stringLength = 0;
  const visit = (value: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > MAX_SAVE_NODES || depth > MAX_SAVE_DEPTH) throw new BadRequestException({ code: 'DEMON_TOWER_SOURCE_SAVE_TOO_COMPLEX' });
    if (typeof value === 'string') {
      stringLength += value.length;
      if (value.length > MAX_STRING_LENGTH || stringLength > MAX_TOTAL_STRING_LENGTH) throw new BadRequestException({ code: 'DEMON_TOWER_SOURCE_SAVE_TOO_COMPLEX' });
      return;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new BadRequestException({ code: 'DEMON_TOWER_SOURCE_SAVE_INVALID' });
      return;
    }
    if (value === null || typeof value === 'boolean') return;
    if (Array.isArray(value)) {
      if (value.length > MAX_ARRAY_LENGTH) throw new BadRequestException({ code: 'DEMON_TOWER_SOURCE_SAVE_TOO_COMPLEX' });
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw new BadRequestException({ code: 'DEMON_TOWER_SOURCE_SAVE_INVALID' });
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key) || key.length > 100) throw new BadRequestException({ code: 'DEMON_TOWER_SOURCE_SAVE_INVALID' });
      visit(item, depth + 1);
    }
  };
  visit(parsed, 0);
  const state = parsed as PlainObject;
  delete state.server;
  delete state.layers;
  delete state.power;
  delete state._hasLocal;
  state.name = displayName;
  state.level = safeInteger(state.level, 1, 120, 1);
  return state;
}

function battleProjection(profile: DemonTowerSourceProfile, displayName: string): PlainObject {
  const source = profile.saveData;
  const dims = plain(source.dims);
  const dimPerm = plain(source.dimPerm);
  const pills = plain(plain(source.inventory).pills);
  const dimension = (input: PlainObject) => Object.fromEntries(['str', 'spd', 'agi', 'def', 'luc'].map((key) => [key, safeNumber(input[key])]));
  const talents = Array.isArray(source.talents) ? source.talents.slice(0, 32).flatMap((item) => {
    const value = plain(item);
    return typeof value.id === 'string' && value.id.length <= 40 ? [{ id: value.id, lv: safeInteger(value.lv, 0, 20, 0) }] : [];
  }) : [];
  return {
    name: displayName,
    level: profile.level,
    dims: dimension(dims),
    dimPerm: dimension(dimPerm),
    inventory: { pills: dimension(pills) },
    destiny: Array.isArray(source.destiny) ? source.destiny.filter((item): item is string => typeof item === 'string' && item.length <= 40).slice(0, 8) : [],
    talents,
  };
}

@Injectable()
export class DemonTowerSourceService {
  constructor(private readonly db: DataSource) {}

  async progress(userId: string): Promise<DemonTowerSourceProgress> {
    this.assertFeature();
    return this.db.transaction(async (manager) => {
      await this.activeUser(manager, userId, false);
      const profile = await this.profile(manager, userId);
      return profile ? {
        exists: true,
        version: profile.version,
        saveData: JSON.stringify(profile.saveData),
        updatedAt: profile.updatedAt.toISOString(),
      } : { exists: false, version: 0, saveData: null, updatedAt: null };
    });
  }

  async save(userId: string, raw: unknown): Promise<DemonTowerSourceSaveReceipt> {
    this.assertFeature();
    assertCommunityWritesEnabled();
    const value = strictObject(raw, ['requestId', 'expectedVersion', 'saveData'], 'DEMON_TOWER_SOURCE_SAVE_INVALID');
    const input: DemonTowerSourceSaveInput = {
      requestId: requestId(value.requestId, 'DEMON_TOWER_SOURCE_SAVE_INVALID'),
      expectedVersion: integer(value.expectedVersion, 0, 2_147_483_646, 'DEMON_TOWER_SOURCE_SAVE_INVALID'),
      saveData: typeof value.saveData === 'string' ? value.saveData : (() => { throw new BadRequestException({ code: 'DEMON_TOWER_SOURCE_SAVE_INVALID' }); })(),
    };
    // The idempotency fingerprint is the caller's immutable request, not the
    // account display name that may legitimately change before a retry.
    const requestHash = hash({ kind: 'save', expectedVersion: input.expectedVersion, saveData: input.saveData });
    return this.db.transaction(async (manager) => {
      this.assertFeature();
      assertCommunityWritesEnabled();
      const actor = await this.activeUser(manager, userId, true);
      const displayName = (actor.displayName || actor.username || '同事').trim().slice(0, 100) || '同事';
      const state = validateAndSanitizeSave(input.saveData, displayName);
      const repo = manager.getRepository(DemonTowerSourceProfile);
      const current = await this.profile(manager, userId, true);
      if (current?.lastSaveRequestId === input.requestId) {
        if (current.lastSaveRequestHash !== requestHash || !current.lastSaveReceipt || current.lastSaveReceipt.version !== current.version) {
          throw new ConflictException({ code: 'DEMON_TOWER_SOURCE_IDEMPOTENCY_CONFLICT' });
        }
        return { ...current.lastSaveReceipt, replayed: true } as unknown as DemonTowerSourceSaveReceipt;
      }
      const currentVersion = current?.version ?? 0;
      if (currentVersion !== input.expectedVersion) throw new ConflictException({ code: 'DEMON_TOWER_SOURCE_VERSION_CONFLICT', currentVersion });
      const now = new Date();
      const serviceDate = toBusinessLocalDate(now);
      const dailyRepo = manager.getRepository(DemonTowerSourceDailyAction);
      let daily = await dailyRepo.findOne({ where: { serviceDate, userId }, lock: { mode: 'pessimistic_write' } });
      daily ??= dailyRepo.create({ serviceDate, userId, bossAttempts: 0, donatedMaterials: 0, mutationCount: 0, saveCount: 0, saveBytes: '0', updatedAt: now });
      const saveBytes = Buffer.byteLength(input.saveData, 'utf8');
      const nextSaveBytes = Number(daily.saveBytes) + saveBytes;
      if (daily.saveCount >= MAX_DAILY_SAVE_COUNT || nextSaveBytes > MAX_DAILY_SAVE_BYTES) {
        throw new HttpException({ code: 'DEMON_TOWER_SOURCE_DAILY_SAVE_LIMIT' }, 429);
      }
      const level = safeInteger(state.level, 1, 120, 1);
      const profile = current ?? repo.create({ userId, version: 1, schemaVersion: 1, lastSaveRequestId: null, lastSaveRequestHash: null, lastSaveReceipt: null, createdAt: now });
      profile.version = current ? current.version + 1 : 1;
      profile.saveData = state;
      profile.displayName = displayName;
      profile.level = level;
      profile.power = projectPower(state, level);
      profile.updatedAt = now;
      const receipt: DemonTowerSourceSaveReceipt = { requestId: input.requestId, version: profile.version, replayed: false, updatedAt: now.toISOString() };
      profile.lastSaveRequestId = input.requestId;
      profile.lastSaveRequestHash = requestHash;
      profile.lastSaveReceipt = receipt as unknown as PlainObject;
      daily.saveCount += 1;
      daily.saveBytes = String(nextSaveBytes);
      daily.updatedAt = now;
      await repo.save(profile);
      await dailyRepo.save(daily);
      this.assertFeature();
      assertCommunityWritesEnabled();
      return receipt;
    });
  }

  async world(userId: string): Promise<DemonTowerSourceWorld> {
    this.assertFeature();
    return this.db.transaction(async (manager) => {
      await this.activeUser(manager, userId, false);
      const [layers, playerCount] = await Promise.all([
        manager.getRepository(DemonTowerSourceWorldFloor).find({ order: { layerId: 'ASC' } }),
        manager.getRepository(DemonTowerSourceProfile).count(),
      ]);
      if (layers.length !== 9) throw new Error('Demon tower source world seed invariant failed');
      // These two values are gameplay gates in the supplied source, not a real
      // telemetry claim. Preserve its default simulation baseline so the first
      // production player cannot lock the whole server at average level 1.
      return { server: { day: 1, pop: 2_000 + playerCount, lvAvg: 30, sourceVersion: SOURCE_VERSION }, layers: layers.map((row) => this.layer(row)) };
    });
  }

  damage(userId: string, raw: unknown): Promise<DemonTowerSourceWorldReceipt> {
    return this.mutateWorld(userId, 'damage', raw);
  }

  channel(userId: string, raw: unknown): Promise<DemonTowerSourceWorldReceipt> {
    return this.mutateWorld(userId, 'channel', raw);
  }

  clue(userId: string, raw: unknown): Promise<DemonTowerSourceWorldReceipt> {
    return this.mutateWorld(userId, 'clue', raw);
  }

  async contribution(userId: string): Promise<DemonTowerSourceContributionView[]> {
    this.assertFeature();
    return this.db.transaction(async (manager) => {
      await this.activeUser(manager, userId, false);
      const rows = await manager.getRepository(DemonTowerSourceContribution).find({ where: { userId }, order: { layerId: 'ASC' } });
      return rows.map((row) => ({ layerId: row.layerId, bossDamage: Number(row.bossDamage), materials: Number(row.materials), clues: Number(row.clues) }));
    });
  }

  async friends(userId: string): Promise<DemonTowerSourceFriend[]> {
    this.assertFeature();
    return this.db.transaction(async (manager) => {
      await this.activeUser(manager, userId, false);
      const relationships = await manager.getRepository(Friendship).find({ where: [{ userLowId: userId, endedAt: IsNull() }, { userHighId: userId, endedAt: IsNull() }] });
      const friendIds = [...new Set(relationships.map((item) => item.userLowId === userId ? item.userHighId : item.userLowId))];
      if (!friendIds.length) return [];
      const blocks = await manager.getRepository(UserBlock).find({ where: [{ blockerId: userId, blockedId: In(friendIds) }, { blockedId: userId, blockerId: In(friendIds) }] });
      const blocked = new Set(blocks.map((item) => item.blockerId === userId ? item.blockedId : item.blockerId));
      const users = await manager.getRepository(User).find({ where: { id: In(friendIds), accountStatus: 'active' } });
      const profiles = await this.profiles(manager, users.map((user) => user.id));
      return users.filter((user) => !blocked.has(user.id)).sort((a, b) => a.publicId.localeCompare(b.publicId)).map((user) => {
        const profile = profiles.get(user.id);
        return { id: user.publicId, playerId: user.publicId, name: (user.displayName || user.username || '同事').slice(0, 100), level: profile?.level ?? 1, avatar: null, saveData: null };
      });
    });
  }

  async battleProfile(userId: string, publicId: string): Promise<DemonTowerSourceBattleProfile> {
    this.assertFeature();
    if (!UUID.test(publicId)) throw new NotFoundException({ code: 'DEMON_TOWER_SOURCE_FRIEND_NOT_FOUND' });
    return this.db.transaction(async (manager) => {
      await this.activeUser(manager, userId, false);
      const opponent = await manager.getRepository(User).findOneBy({ publicId: publicId.toLowerCase(), accountStatus: 'active' });
      if (!opponent || opponent.id === userId || !await this.isFriend(manager, userId, opponent.id) || await this.isBlocked(manager, userId, opponent.id)) {
        throw new NotFoundException({ code: 'DEMON_TOWER_SOURCE_FRIEND_NOT_FOUND' });
      }
      const profile = await this.profile(manager, opponent.id);
      if (!profile) throw new NotFoundException({ code: 'DEMON_TOWER_SOURCE_FRIEND_PROFILE_NOT_FOUND' });
      const displayName = (opponent.displayName || opponent.username || '同事').slice(0, 100);
      return { playerId: opponent.publicId, saveData: JSON.stringify(battleProjection(profile, displayName)) };
    });
  }

  async ranking(userId: string, rawLimit: unknown): Promise<DemonTowerSourceRankingEntry[]> {
    this.assertFeature();
    const limit = rawLimit === undefined ? 50 : typeof rawLimit === 'string' && /^\d{1,3}$/.test(rawLimit) ? Number(rawLimit) : NaN;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new BadRequestException({ code: 'DEMON_TOWER_SOURCE_RANKING_INVALID' });
    return this.db.transaction(async (manager) => {
      await this.activeUser(manager, userId, false);
      const rows = await manager.getRepository(DemonTowerSourceProfile).createQueryBuilder('profile')
        .innerJoin(User, 'account', 'account.id = profile.user_id AND account.account_status = :status', { status: 'active' })
        .addSelect('account.public_id', 'public_id')
        .addSelect("COALESCE(account.display_name, account.username, '同事')", 'current_display_name')
        .orderBy('profile.power', 'DESC').addOrderBy('profile.level', 'DESC').addOrderBy('profile.updated_at', 'ASC').addOrderBy('profile.user_id', 'ASC')
        .limit(limit).getRawAndEntities();
      return rows.entities.map((profile, index) => ({ playerId: String(rows.raw[index].public_id), name: String(rows.raw[index].current_display_name).slice(0, 100), level: profile.level, power: profile.power }));
    });
  }

  private async mutateWorld(userId: string, kind: 'damage' | 'channel' | 'clue', raw: unknown): Promise<DemonTowerSourceWorldReceipt> {
    this.assertFeature();
    assertCommunityWritesEnabled();
    const value = strictObject(raw, ['requestId', 'layerId', 'amount', 'expectedVersion', 'saveData'], 'DEMON_TOWER_SOURCE_WORLD_INVALID');
    const input: DemonTowerSourceWorldInput = {
      requestId: requestId(value.requestId, 'DEMON_TOWER_SOURCE_WORLD_INVALID'),
      layerId: integer(value.layerId, 1, 9, 'DEMON_TOWER_SOURCE_WORLD_INVALID'),
      amount: integer(
        value.amount,
        kind === 'damage' ? 0 : 1,
        kind === 'damage' ? 100_000 : kind === 'channel' ? 20 : 1,
        'DEMON_TOWER_SOURCE_WORLD_INVALID',
      ),
      expectedVersion: integer(value.expectedVersion, 1, 2_147_483_646, 'DEMON_TOWER_SOURCE_WORLD_INVALID'),
      saveData: typeof value.saveData === 'string' ? value.saveData : (() => { throw new BadRequestException({ code: 'DEMON_TOWER_SOURCE_WORLD_INVALID' }); })(),
    };
    const requestHash = hash({ kind, layerId: input.layerId, amount: input.amount, expectedVersion: input.expectedVersion, saveData: input.saveData });
    return this.db.transaction(async (manager) => {
      this.assertFeature();
      assertCommunityWritesEnabled();
      const actor = await this.activeUser(manager, userId, true);
      const commandRepo = manager.getRepository(DemonTowerSourceCommand);
      // The timestamp index keeps discovery bounded, the fixed batch prevents
      // a long-idle installation from turning its first gameplay transaction
      // into an unbounded DELETE/WAL spike, and global pruning also retires
      // receipts owned by suspended accounts.
      const expiredCommands = await commandRepo.find({
        select: { userId: true, requestId: true },
        where: { createdAt: LessThan(new Date(Date.now() - COMMAND_RETENTION_MS)) },
        order: { createdAt: 'ASC' },
        take: COMMAND_PRUNE_BATCH,
      });
      if (expiredCommands.length) {
        await commandRepo.delete(expiredCommands.map(({ userId: expiredUserId, requestId: expiredRequestId }) => ({
          userId: expiredUserId,
          requestId: expiredRequestId,
        })));
      }
      const previous = await this.command(manager, userId, input.requestId);
      if (previous) return this.replay<DemonTowerSourceWorldReceipt>(previous, requestHash);
      const profile = await this.profile(manager, userId, true);
      if (!profile) throw new ConflictException({ code: 'DEMON_TOWER_SOURCE_SAVE_REQUIRED' });
      if (profile.version !== input.expectedVersion) throw new ConflictException({ code: 'DEMON_TOWER_SOURCE_VERSION_CONFLICT', currentVersion: profile.version });
      const now = new Date();
      const displayName = (actor.displayName || actor.username || '同事').trim().slice(0, 100) || '同事';
      const state = validateAndSanitizeSave(input.saveData, displayName);
      const serviceDate = toBusinessLocalDate(now);
      const dailyRepo = manager.getRepository(DemonTowerSourceDailyAction);
      let daily = await dailyRepo.findOne({ where: { serviceDate, userId }, lock: { mode: 'pessimistic_write' } });
      daily ??= dailyRepo.create({ serviceDate, userId, bossAttempts: 0, donatedMaterials: 0, mutationCount: 0, saveCount: 0, saveBytes: '0', updatedAt: now });
      if (daily.mutationCount >= 120) throw new HttpException({ code: 'DEMON_TOWER_SOURCE_DAILY_ACTION_LIMIT' }, 429);
      const saveBytes = Buffer.byteLength(input.saveData, 'utf8');
      const nextSaveBytes = Number(daily.saveBytes) + saveBytes;
      if (daily.saveCount >= MAX_DAILY_SAVE_COUNT || nextSaveBytes > MAX_DAILY_SAVE_BYTES) {
        throw new HttpException({ code: 'DEMON_TOWER_SOURCE_DAILY_SAVE_LIMIT' }, 429);
      }

      const layer = await manager.getRepository(DemonTowerSourceWorldFloor).findOne({ where: { layerId: input.layerId }, lock: { mode: 'pessimistic_write' } });
      if (!layer || layer.status === 'locked') throw new ConflictException({ code: 'DEMON_TOWER_SOURCE_LAYER_LOCKED' });
      let accepted = 0;
      let unlockedLayer: number | null = null;
      if (kind === 'damage') {
        if (daily.bossAttempts >= 10) throw new ConflictException({ code: 'DEMON_TOWER_SOURCE_BOSS_DAILY_LIMIT' });
        if (layer.status !== 'open' || layer.bossHp <= 0) throw new ConflictException({ code: 'DEMON_TOWER_SOURCE_BOSS_CLEARED' });
        // Shared-world writes never trust an opaque browser save or its claimed
        // power. The supplied combat may report more, but one server mutation is
        // bounded independently and grants no site currency or achievement.
        accepted = Math.min(input.amount, 2_500, layer.bossHp);
        layer.bossHp -= accepted;
        if (layer.bossHp === 0) layer.status = 'cleared';
        daily.bossAttempts += 1;
      } else if (kind === 'channel') {
        if (layer.status !== 'cleared') throw new ConflictException({ code: 'DEMON_TOWER_SOURCE_CHANNEL_UNAVAILABLE' });
        const remainingDaily = 2_000 - daily.donatedMaterials;
        if (remainingDaily <= 0) throw new ConflictException({ code: 'DEMON_TOWER_SOURCE_CHANNEL_DAILY_LIMIT' });
        accepted = Math.min(input.amount, remainingDaily, layer.channelGoal - layer.channel);
        if (accepted <= 0) throw new ConflictException({ code: 'DEMON_TOWER_SOURCE_CHANNEL_COMPLETE' });
        layer.channel += accepted;
        daily.donatedMaterials += accepted;
        if (layer.channel === layer.channelGoal && layer.layerId < 9) {
          const next = await manager.getRepository(DemonTowerSourceWorldFloor).findOne({ where: { layerId: layer.layerId + 1 }, lock: { mode: 'pessimistic_write' } });
          if (!next) throw new Error('Demon tower source next-layer invariant failed');
          if (next.status === 'locked') {
            next.status = 'open'; next.version += 1; next.updatedAt = now;
            await manager.getRepository(DemonTowerSourceWorldFloor).save(next);
          }
          unlockedLayer = next.layerId;
        }
      } else {
        if (layer.clues >= 2_147_483_646) throw new ConflictException({ code: 'DEMON_TOWER_SOURCE_CLUE_LIMIT' });
        accepted = 1;
        layer.clues += 1;
      }
      layer.version += 1;
      layer.updatedAt = now;
      daily.mutationCount += 1;
      daily.saveCount += 1;
      daily.saveBytes = String(nextSaveBytes);
      daily.updatedAt = now;
      profile.version += 1;
      if (kind === 'channel' && accepted < input.amount) {
        // The supplied client deducts the requested amount before sending its
        // atomic snapshot. If the shared channel needs fewer materials, refund
        // the difference inside this same transaction so the committed save
        // and world receipt can never disagree after a lost response.
        const inventory = plain(state.inventory);
        const materials = inventory.materials;
        if (typeof materials !== 'number' || !Number.isSafeInteger(materials) || materials < 0 || materials > 1_000_000_000) {
          throw new BadRequestException({ code: 'DEMON_TOWER_SOURCE_SAVE_INVALID' });
        }
        inventory.materials = materials + input.amount - accepted;
        state.inventory = inventory;
      }
      profile.saveData = state;
      profile.displayName = displayName;
      profile.level = safeInteger(state.level, 1, 120, 1);
      profile.power = projectPower(state, profile.level);
      profile.lastSaveRequestId = null;
      profile.lastSaveRequestHash = null;
      profile.lastSaveReceipt = null;
      profile.updatedAt = now;
      await manager.getRepository(DemonTowerSourceWorldFloor).save(layer);
      await dailyRepo.save(daily);
      await manager.getRepository(DemonTowerSourceProfile).save(profile);
      const contributionRepo = manager.getRepository(DemonTowerSourceContribution);
      const contribution = await contributionRepo.findOne({ where: { layerId: layer.layerId, userId }, lock: { mode: 'pessimistic_write' } })
        ?? contributionRepo.create({ layerId: layer.layerId, userId, bossDamage: '0', materials: '0', clues: '0', updatedAt: now });
      if (kind === 'damage') contribution.bossDamage = String(Number(contribution.bossDamage) + accepted);
      else if (kind === 'channel') contribution.materials = String(Number(contribution.materials) + accepted);
      else contribution.clues = String(Number(contribution.clues) + accepted);
      contribution.updatedAt = now;
      await contributionRepo.save(contribution);
      const receipt: DemonTowerSourceWorldReceipt = {
        requestId: input.requestId,
        replayed: false,
        accepted,
        unlockedLayer,
        layer: this.layer(layer),
        profileVersion: profile.version,
        profileUpdatedAt: now.toISOString(),
      };
      await this.storeCommand(manager, userId, input.requestId, kind, requestHash, receipt, now);
      this.assertFeature();
      assertCommunityWritesEnabled();
      return receipt;
    });
  }

  private async activeUser(manager: EntityManager, userId: string, lock: boolean): Promise<User> {
    const query = manager.getRepository(User).createQueryBuilder('user').where('user.id = :id', { id: userId });
    if (lock) query.setLock('for_no_key_update');
    const user = await query.getOne();
    if (!user || user.accountStatus !== 'active') throw new UnauthorizedException({ code: 'DEMON_TOWER_SOURCE_ACTIVE_ACCOUNT_REQUIRED' });
    return user;
  }

  settings(): [] { this.assertFeature(); return []; }
  stories(): [] { this.assertFeature(); return []; }

  private assertFeature(): void {
    if (process.env.FEATURE_COMMUNITY_DEMON_TOWER_ENABLED !== 'true') {
      throw new ServiceUnavailableException({ code: 'DEMON_TOWER_DISABLED', message: '九层妖塔暂未开放，既有存档仍保留。' });
    }
  }

  private profile(manager: EntityManager, userId: string, lock = false): Promise<DemonTowerSourceProfile | null> {
    const query = manager.getRepository(DemonTowerSourceProfile).createQueryBuilder('profile')
      .addSelect(['profile.saveData', 'profile.lastSaveRequestId', 'profile.lastSaveRequestHash', 'profile.lastSaveReceipt'])
      .where('profile.user_id = :userId', { userId });
    if (lock) query.setLock('pessimistic_write');
    return query.getOne();
  }

  private async profiles(manager: EntityManager, userIds: string[]): Promise<Map<string, DemonTowerSourceProfile>> {
    if (!userIds.length) return new Map();
    const rows = await manager.getRepository(DemonTowerSourceProfile).find({ where: { userId: In(userIds) } });
    return new Map(rows.map((row) => [row.userId, row]));
  }

  private command(manager: EntityManager, userId: string, id: string): Promise<DemonTowerSourceCommand | null> {
    return manager.getRepository(DemonTowerSourceCommand).createQueryBuilder('command').addSelect(['command.requestHash', 'command.receipt'])
      .where('command.user_id = :userId AND command.request_id = :requestId', { userId, requestId: id }).getOne();
  }

  private replay<T extends { replayed: boolean }>(command: DemonTowerSourceCommand, expectedHash: string): T {
    if (command.requestHash !== expectedHash) throw new ConflictException({ code: 'DEMON_TOWER_SOURCE_IDEMPOTENCY_CONFLICT' });
    return { ...command.receipt, replayed: true } as T;
  }

  private async storeCommand(manager: EntityManager, userId: string, id: string, kind: 'damage' | 'channel' | 'clue', requestHash: string, receipt: object, now: Date): Promise<void> {
    const repo = manager.getRepository(DemonTowerSourceCommand);
    await repo.save(repo.create({ userId, requestId: id, kind, requestHash, receipt: receipt as PlainObject, createdAt: now }));
  }

  private layer(row: DemonTowerSourceWorldFloor): DemonTowerSourceLayer {
    return { layerId: row.layerId, status: row.status, bossHp: row.bossHp, bossMaxHp: row.bossMaxHp, clues: row.clues, channel: row.channel, channelGoal: row.channelGoal, bossName: row.bossName, terrain: row.terrain, version: row.version };
  }

  private async isFriend(manager: EntityManager, left: string, right: string): Promise<boolean> {
    const [userLowId, userHighId] = left < right ? [left, right] : [right, left];
    return manager.getRepository(Friendship).exist({ where: { userLowId, userHighId, endedAt: IsNull() } });
  }

  private isBlocked(manager: EntityManager, left: string, right: string): Promise<boolean> {
    return manager.getRepository(UserBlock).exist({ where: [{ blockerId: left, blockedId: right }, { blockerId: right, blockedId: left }] });
  }
}
