import { randomUUID } from 'node:crypto';
import { GUARDS_METADATA, MODULE_METADATA } from '@nestjs/common/constants';
import type { DataSource } from 'typeorm';

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
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { DemonTowerModule } from './demon-tower.module';
import { DemonTowerController } from './demon-tower.controller';
import { DemonTowerSourceController } from './demon-tower-source.controller';
import { cleanupDemonTowerSourceUser } from './demon-tower-source-cleanup';
import { DemonTowerSourceService } from './demon-tower-source.service';

describe('DemonTowerSourceService', () => {
  let db: DataSource;
  let service: DemonTowerSourceService;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env.LOCAL_DEV = 'true';
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    process.env.FEATURE_COMMUNITY_DEMON_TOWER_ENABLED = 'true';
    db = await createLocalDevDataSource();
    service = new DemonTowerSourceService(db);
  });
  afterEach(async () => { if (db?.isInitialized) await db.destroy(); process.env = { ...originalEnv }; });

  it('mounts every source route behind JWT and does not register retired services or the auto worker', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, DemonTowerSourceController)).toContain(JwtAuthGuard);
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DemonTowerModule) as unknown[];
    expect(providers).toEqual([DemonTowerSourceService]);
    try { new DemonTowerController().catalog(); throw new Error('expected retired endpoint'); }
    catch (error) { expect(error).toMatchObject({ status: 410, response: { code: 'DEMON_TOWER_CLIENT_OUTDATED', replacement: '/games/demon-tower' } }); }
  });

  it('stores an account-bound sanitized save with CAS and immutable idempotency', async () => {
    const user = await actor('save');
    const id = randomUUID();
    const source = { name: 'spoofed', level: 7, power: 9_999_999, server: { admin: true }, layers: [{ status: 'cleared' }],
      dims: { str: 12, spd: 11, agi: 10, def: 9, luc: 8 }, dimPerm: {}, inventory: { pills: {} }, destiny: ['str'], log: ['private'] };
    const receipt = await service.save(user.id, { requestId: id, expectedVersion: 0, saveData: JSON.stringify(source) });
    expect(receipt).toMatchObject({ requestId: id, version: 1, replayed: false });
    user.displayName = 'Renamed User'; await db.getRepository(User).save(user);
    await expect(service.save(user.id, { requestId: id, expectedVersion: 0, saveData: JSON.stringify(source) })).resolves.toMatchObject({ version: 1, replayed: true });
    const stored = await rawProfile(user.id);
    expect(stored.saveData).toMatchObject({ name: 'Save User', level: 7 });
    expect(stored.saveData).not.toHaveProperty('server');
    expect(stored.saveData).not.toHaveProperty('layers');
    expect(stored.saveData).not.toHaveProperty('power');
    expect(stored.power).toBeLessThan(9_999_999);
    expect(await db.getRepository(DemonTowerSourceCommand).count()).toBe(0);
    await expect(service.ranking(user.id, '50')).resolves.toEqual([{ playerId: user.publicId, name: 'Renamed User', level: 7, power: stored.power }]);
    await expect(service.save(user.id, { requestId: id, expectedVersion: 0, saveData: JSON.stringify({ ...source, level: 8 }) })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_SOURCE_IDEMPOTENCY_CONFLICT' } });
    await expect(service.save(user.id, { requestId: randomUUID(), expectedVersion: 0, saveData: JSON.stringify(source) })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_SOURCE_VERSION_CONFLICT', currentVersion: 1 } });
  });

  it('bounds account save write amplification while preserving exact last-request replay', async () => {
    const user = await actor('quota');
    const id = randomUUID();
    const input = { requestId: id, expectedVersion: 0, saveData: JSON.stringify({ level: 2 }) };
    await service.save(user.id, input);
    const daily = await db.getRepository(DemonTowerSourceDailyAction).findOneByOrFail({ userId: user.id });
    daily.saveCount = 720;
    await db.getRepository(DemonTowerSourceDailyAction).save(daily);
    await expect(service.save(user.id, input)).resolves.toMatchObject({ version: 1, replayed: true });
    await expect(service.save(user.id, { ...input, requestId: randomUUID(), expectedVersion: 1 })).rejects.toMatchObject({
      status: 429,
      response: { code: 'DEMON_TOWER_SOURCE_DAILY_SAVE_LIMIT' },
    });
    expect((await service.progress(user.id)).version).toBe(1);
  });

  it('rejects dangerous, oversized and non-exact saves before any state is written', async () => {
    const user = await actor('invalid');
    await expect(service.save(user.id, { requestId: randomUUID(), expectedVersion: 0, saveData: '{"__proto__":{"polluted":true}}' })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_SOURCE_SAVE_INVALID' } });
    await expect(service.save(user.id, { requestId: randomUUID(), expectedVersion: 0, saveData: JSON.stringify({ level: 1, blob: 'x'.repeat(513 * 1024) }) })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_SOURCE_SAVE_TOO_LARGE' } });
    await expect(service.save(user.id, { requestId: randomUUID(), expectedVersion: 0, saveData: '{}', playerId: user.publicId })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_SOURCE_SAVE_INVALID' } });
    expect(await db.getRepository(DemonTowerSourceProfile).count()).toBe(0);
    expect(await db.getRepository(DemonTowerSourceCommand).count()).toBe(0);
  });

  it('preserves the source world baseline and applies clue/damage/channel once without a wallet', async () => {
    const user = await actor('world');
    await enroll(user, { level: 1, dims: { str: 12, spd: 12, agi: 12, def: 12, luc: 12 }, destiny: [] });
    const initial = await service.world(user.id);
    expect(initial.server).toMatchObject({ pop: 2001, lvAvg: 30, sourceVersion: '2fe1c88e' });
    expect(initial.layers).toHaveLength(9);
    expect(initial.layers[0]).toMatchObject({ layerId: 1, bossHp: 1200, bossName: '百战羚王·犼野' });
    const clue = await worldInput(user, 1, 1);
    await expect(service.clue(user.id, clue)).resolves.toMatchObject({ accepted: 1, replayed: false, profileVersion: 2, layer: { clues: 1 } });
    await expect(service.clue(user.id, clue)).resolves.toMatchObject({ accepted: 1, replayed: true, profileVersion: 2, layer: { clues: 1 } });
    const damage = await worldInput(user, 1, 1200);
    await expect(service.damage(user.id, damage)).resolves.toMatchObject({ accepted: 1200, replayed: false, profileVersion: 3, layer: { status: 'cleared', bossHp: 0, clues: 1 } });
    await expect(service.damage(user.id, damage)).resolves.toMatchObject({ accepted: 1200, replayed: true, profileVersion: 3 });
    for (let index = 0; index < 14; index += 1) {
      await expect(service.channel(user.id, await worldInput(user, 1, 20))).resolves.toMatchObject({ accepted: 20, unlockedLayer: index === 13 ? 2 : null, layer: { channel: (index + 1) * 20 } });
    }
    const layers = await db.getRepository(DemonTowerSourceWorldFloor).find({ order: { layerId: 'ASC' } });
    expect(layers[1].status).toBe('open');
    expect(await db.getRepository(DemonTowerSourceCommand).countBy({ userId: user.id })).toBe(16); // clue + damage + fourteen bounded donations; save idempotency is a bounded profile slot
    await expect(service.contribution(user.id)).resolves.toEqual([{ layerId: 1, bossDamage: 1200, materials: 280, clues: 1 }]);
  });

  it('refunds a partially accepted channel donation inside the same profile/world transaction', async () => {
    const user = await actor('partial-channel');
    await enroll(user, { level: 1, inventory: { materials: 100, pills: {} } });
    await service.damage(user.id, await worldInput(user, 1, 1200));
    await db.getRepository(DemonTowerSourceWorldFloor).update({ layerId: 1 }, { channelGoal: 15 });
    const progress = await service.progress(user.id);
    const state = JSON.parse(progress.saveData ?? '{}') as { inventory: { materials: number } };
    state.inventory.materials -= 20;
    const receipt = await service.channel(user.id, {
      requestId: randomUUID(), layerId: 1, amount: 20, expectedVersion: progress.version, saveData: JSON.stringify(state),
    });
    expect(receipt).toMatchObject({ accepted: 15, layer: { channel: 15 }, profileVersion: 3 });
    expect((await rawProfile(user.id)).saveData).toMatchObject({ inventory: { materials: 85 } });
  });

  it('caps a forged direct-HTTP damage claim independently of the client save and claimed amount', async () => {
    const user = await actor('damage-cap');
    await enroll(user, { level: 120, power: 9_999_999 });
    await db.getRepository(DemonTowerSourceWorldFloor).update({ layerId: 1 }, { bossHp: 10_000, bossMaxHp: 10_000 });
    const receipt = await service.damage(user.id, await worldInput(user, 1, 100_000));
    expect(receipt).toMatchObject({ accepted: 2_500, layer: { bossHp: 7_500, status: 'open' } });
    await expect(service.contribution(user.id)).resolves.toEqual([{ layerId: 1, bossDamage: 2_500, materials: 0, clues: 0 }]);
  });

  it('prunes expired world receipts globally even when their owner is suspended', async () => {
    const active = await actor('receipt-active');
    const suspended = await actor('receipt-suspended');
    await enroll(active, { level: 1 });
    await enroll(suspended, { level: 1 });
    await service.damage(suspended.id, await worldInput(suspended, 1, 10));
    await db.getRepository(DemonTowerSourceCommand).update(
      { userId: suspended.id },
      { createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1_000) },
    );
    suspended.accountStatus = 'suspended';
    await db.getRepository(User).save(suspended);

    await service.damage(active.id, await worldInput(active, 1, 10));

    expect(await db.getRepository(DemonTowerSourceCommand).countBy({ userId: suspended.id })).toBe(0);
    expect(await db.getRepository(DemonTowerSourceCommand).countBy({ userId: active.id })).toBe(1);
  });

  it('enforces feature and global write gates while reads remain available during maintenance', async () => {
    const user = await actor('gate');
    process.env.FEATURE_COMMUNITY_DEMON_TOWER_ENABLED = 'false';
    await expect(service.progress(user.id)).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_DISABLED' } });
    try { service.settings(); throw new Error('expected disabled feature'); }
    catch (error) { expect(error).toMatchObject({ response: { code: 'DEMON_TOWER_DISABLED' } }); }
    process.env.FEATURE_COMMUNITY_DEMON_TOWER_ENABLED = 'true';
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
    await expect(service.progress(user.id)).resolves.toMatchObject({ exists: false });
    await expect(service.save(user.id, { requestId: randomUUID(), expectedVersion: 0, saveData: '{}' })).rejects.toMatchObject({ response: { code: 'COMMUNITY_WRITES_DISABLED' } });
    expect(await db.getRepository(DemonTowerSourceProfile).count()).toBe(0);
  });

  it('exposes only accepted, unblocked friends and a sanitized battle projection', async () => {
    const a = await actor('a'), b = await actor('b'), stranger = await actor('stranger');
    await enroll(b, { level: 9, dims: { str: 20, spd: 15, agi: 11, def: 18, luc: 9 }, inventory: { pills: { str: 2 } },
      destiny: ['str'], talents: [{ id: 'tStr', lv: 2 }], log: ['secret'], story: { flags: { secret: true } } });
    const now = new Date();
    const [low, high] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    await db.getRepository(Friendship).save(db.getRepository(Friendship).create({ userLowId: low, userHighId: high, firstBecameFriendsAt: now, currentStartedAt: now, endedAt: null, endedReason: null, createdAt: now, updatedAt: now }));
    await expect(service.friends(a.id)).resolves.toEqual([{ id: b.publicId, playerId: b.publicId, name: 'B User', level: 9, avatar: null, saveData: null }]);
    const profile = await service.battleProfile(a.id, b.publicId);
    expect(JSON.parse(profile.saveData)).toMatchObject({ name: 'B User', level: 9, dims: { str: 20 }, talents: [{ id: 'tStr', lv: 2 }] });
    expect(profile.saveData).not.toMatch(/secret|log|story/);
    await expect(service.battleProfile(a.id, stranger.publicId)).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_SOURCE_FRIEND_NOT_FOUND' } });
    await db.getRepository(UserBlock).save(db.getRepository(UserBlock).create({ blockerId: b.id, blockedId: a.id, reason: null, createdAt: now }));
    await expect(service.friends(a.id)).resolves.toEqual([]);
    await expect(service.battleProfile(a.id, b.publicId)).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_SOURCE_FRIEND_NOT_FOUND' } });
  });

  it('erases soft-deleted account source data but preserves peers and the shared world', async () => {
    const a = await actor('cleanup-a'), b = await actor('cleanup-b');
    await enroll(a, { level: 2 }); await enroll(b, { level: 3 });
    await service.damage(a.id, await worldInput(a, 1, 100));
    const world = await db.getRepository(DemonTowerSourceWorldFloor).findOneByOrFail({ layerId: 1 });
    await db.transaction((manager) => cleanupDemonTowerSourceUser(manager, a.id));
    expect(await db.getRepository(DemonTowerSourceProfile).countBy({ userId: a.id })).toBe(0);
    expect(await db.getRepository(DemonTowerSourceCommand).countBy({ userId: a.id })).toBe(0);
    expect(await db.getRepository(DemonTowerSourceContribution).countBy({ userId: a.id })).toBe(0);
    expect(await db.getRepository(DemonTowerSourceDailyAction).countBy({ userId: a.id })).toBe(0);
    expect(await db.getRepository(DemonTowerSourceProfile).countBy({ userId: b.id })).toBe(1);
    expect(await db.getRepository(DemonTowerSourceWorldFloor).findOneByOrFail({ layerId: 1 })).toEqual(world);
  });

  async function actor(key: string): Promise<User> {
    const now = new Date();
    const repo = db.getRepository(User);
    return repo.save(repo.create({ email: `${key}@example.com`, emailNormalized: `${key}@example.com`, username: key, usernameNormalized: key,
      passwordHash: 'hash', displayName: `${key.replace(/(^|-)(.)/g, (_m, _p, c: string) => c.toUpperCase())} User`, accountStatus: 'active', socialVerificationStatus: 'verified', communityRole: 'user', emailVerifiedAt: now, passwordChangedAt: now, onboardingCompleted: true, createdAt: now, updatedAt: now }));
  }
  async function enroll(user: User, value: Record<string, unknown>): Promise<void> {
    await service.save(user.id, { requestId: randomUUID(), expectedVersion: 0, saveData: JSON.stringify(value) });
  }
  async function worldInput(user: User, layerId: number, amount: number) {
    const progress = await service.progress(user.id);
    if (!progress.saveData) throw new Error('source save missing');
    return { requestId: randomUUID(), layerId, amount, expectedVersion: progress.version, saveData: progress.saveData };
  }
  function rawProfile(userId: string): Promise<DemonTowerSourceProfile> {
    return db.getRepository(DemonTowerSourceProfile).createQueryBuilder('profile').addSelect('profile.saveData').where('profile.user_id=:userId', { userId }).getOneOrFail();
  }
});
