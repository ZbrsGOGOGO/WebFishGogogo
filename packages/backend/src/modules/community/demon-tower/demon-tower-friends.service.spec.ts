import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import type { DemonTowerAction, DemonTowerActionInput } from '@stealth-reader/shared';
import { DemonTowerCommand, DemonTowerProfile, User, WalletLedger } from '../../../database/entities';
import { Friendship } from '../../../database/entities/friendship.entity';
import { UserBlock } from '../../../database/entities/user-block.entity';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { PlatformAssetsService } from '../../platform/platform-assets.service';
import type { DemonTowerEngineState } from './demon-tower.engine';
import { DemonTowerService } from './demon-tower.service';

/** Entity/query integration only; real PostgreSQL must separately verify lock races. */
describe('Demon tower real-friend sparring', () => {
  let db: DataSource, service: DemonTowerService, now: Date;
  const env = { ...process.env };
  beforeEach(async () => {
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    process.env.FEATURE_COMMUNITY_DEMON_TOWER_ENABLED = 'true';
    process.env.FEATURE_DEMON_TOWER_EXPANSION_ENABLED = 'true';
    now = new Date('2099-09-08T02:00:00Z');
    db = await createLocalDevDataSource();
    service = new DemonTowerService(db, new PlatformAssetsService({ now: () => now }), { now: () => now });
  });
  afterEach(async () => { jest.restoreAllMocks(); if (db?.isInitialized) await db.destroy(); process.env = { ...env }; });
  async function user(name: string, optedIn = true): Promise<User> {
    const repo = db.getRepository(User);
    const actor = await repo.save(repo.create({ username: name, displayName: name, email: `${name}@friend-tower.invalid`, passwordHash: 'synthetic-only', accountStatus: 'active' }));
    await act(actor, { kind: 'enroll', payload: {} });
    if (optedIn) await act(actor, { kind: 'arena_enroll', payload: { enabled: true } });
    return actor;
  }
  function input(action: DemonTowerAction, expectedVersion: number): DemonTowerActionInput { return { ...action, requestId: randomUUID(), expectedVersion }; }
  async function act(actor: User, action: DemonTowerAction) {
    now = new Date(now.getTime() + 1001);
    const view = await service.overview(actor.id);
    return service.action(actor.id, input(action, view.profile?.version ?? 0));
  }
  const raw = (actor: User) => db.getRepository(DemonTowerProfile).createQueryBuilder('profile').addSelect('profile.state').where('profile.user_id = :id', { id: actor.id }).getOneOrFail();
  async function befriend(left: User, right: User, endedAt: Date | null = null): Promise<Friendship> {
    const [userLowId, userHighId] = [left.id, right.id].sort();
    const repo = db.getRepository(Friendship);
    return repo.save(repo.create({ userLowId, userHighId, firstBecameFriendsAt: now, currentStartedAt: now, endedAt, endedReason: endedAt ? 'removed' : null }));
  }
  async function block(left: User, right: User): Promise<void> {
    const repo = db.getRepository(UserBlock); await repo.save(repo.create({ blockerId: left.id, blockedId: right.id, reason: null }));
  }
  const spar = (opponent: User, friendOnly = true): DemonTowerAction => ({ kind: 'arena_challenge', payload: { opponentPublicId: opponent.publicId, ...(friendOnly ? { friendOnly: true as const } : {}) } });

  it('returns only active opted-in real friends, hides either-direction blocks and never initializes data on GET', async () => {
    const owner = await user('list-owner'), friend = await user('list-friend'), stranger = await user('list-stranger');
    const privateFriend = await user('list-private', false), ended = await user('list-ended'), outgoing = await user('list-outgoing');
    const incoming = await user('list-incoming'), suspended = await user('list-suspended');
    for (const actor of [friend, privateFriend, outgoing, incoming, suspended]) await befriend(owner, actor);
    await befriend(owner, ended, now); await block(owner, outgoing); await block(incoming, owner);
    await db.getRepository(User).update(suspended.id, { accountStatus: 'suspended' });
    const before = await raw(owner), commands = await db.getRepository(DemonTowerCommand).count();
    const view = await service.social(owner.id);
    expect(view.friends).toEqual([{ publicId: friend.publicId, displayName: friend.displayName, level: 1, rating: 0, rank: '青铜', isFriend: true, challengedToday: false }]);
    expect(view.opponents.find(row => row.publicId === stranger.publicId)).toMatchObject({ isFriend: false, challengedToday: false });
    expect(view.opponents.find(row => row.publicId === ended.publicId)).toMatchObject({ isFriend: false });
    for (const actor of [owner, privateFriend, outgoing, incoming, suspended]) expect(view.opponents.map(row => row.publicId)).not.toContain(actor.publicId);
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/rngSeed|rngCounter|passwordHash|"build"|userId|@friend-tower/);
    for (const actor of [owner, friend, stranger, privateFriend, outgoing, incoming, suspended]) expect(json).not.toContain(actor.id);
    expect(await raw(owner)).toEqual(before); expect(await db.getRepository(DemonTowerCommand).count()).toBe(commands);
    process.env.FEATURE_DEMON_TOWER_EXPANSION_ENABLED = 'false';
    expect(await service.social(owner.id)).toMatchObject({ enabled: false, opponents: [], friends: [], squads: [] });
  });

  it('keeps the friend entrance independent of the public top-30 limit', async () => {
    const owner = await user('cap-owner'), friend = await user('cap-friend'); await befriend(owner, friend);
    const template = (await raw(friend)).state as unknown as DemonTowerEngineState;
    const users = db.getRepository(User);
    const others = await users.save(Array.from({ length: 31 }, (_, i) => users.create({ username: `cap-${i}`, displayName: `cap-${i}`, email: `cap-${i}@friend-tower.invalid`, passwordHash: 'synthetic-only', accountStatus: 'active' })));
    const profiles = db.getRepository(DemonTowerProfile);
    await profiles.save(others.map(actor => {
      const state = JSON.parse(JSON.stringify(template)) as DemonTowerEngineState;
      state.expansion!.arena!.rating = 100;
      return profiles.create({ userId: actor.id, version: 1, state: state as unknown as Record<string, unknown>, actionWindowCount: 0, actionWindowAt: null, createdAt: now, updatedAt: now });
    }));
    const view = await service.social(owner.id);
    expect(view.opponents).toHaveLength(30); expect(view.opponents.map(row => row.publicId)).not.toContain(friend.publicId);
    expect(view.friends?.map(row => row.publicId)).toEqual([friend.publicId]);
  });

  it('shares existing rewards, daily pair accounting and idempotency without opponent, XP or wallet mutations', async () => {
    const owner = await user('settle-owner'), friend = await user('settle-friend'); const relationship = await befriend(owner, friend);
    const before = await raw(owner), beforeFriend = await raw(friend), request = input(spar(friend), before.version);
    const first = await service.action(owner.id, request), saved = await raw(owner);
    const state = saved.state as unknown as DemonTowerEngineState, old = before.state as unknown as DemonTowerEngineState;
    expect(state.expansion!.arena!.attemptsToday).toBe(1);
    expect(state.expansion!.arena!.honor).toBeGreaterThan(old.expansion!.arena!.honor);
    expect(state.expansion!.arena!.skillPoints).toBeGreaterThan(old.expansion!.arena!.skillPoints);
    expect([state.experience, state.totalExperience, state.level, state.hp, state.stamina]).toEqual([old.experience, old.totalExperience, old.level, old.hp, old.stamina]);
    expect(first.officeCoinsGranted).toBe(0); expect(await db.getRepository(WalletLedger).count()).toBe(0); expect(await raw(friend)).toEqual(beforeFriend);
    expect((await service.action(owner.id, request)).replayed).toBe(true); expect(await raw(owner)).toEqual(saved);
    await expect(service.action(owner.id, { ...request, payload: { opponentPublicId: friend.publicId } })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_IDEMPOTENCY_CONFLICT' } });
    await expect(act(owner, spar(friend, false))).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_ARENA_OPPONENT_ALREADY_CHALLENGED' } });
    await db.getRepository(Friendship).update(relationship.id, { endedAt: now, endedReason: 'removed' }); await befriend(owner, friend);
    await expect(act(owner, spar(friend))).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_ARENA_OPPONENT_ALREADY_CHALLENGED' } });
    expect((await service.social(owner.id)).friends?.[0].challengedToday).toBe(true);
  });

  it('rechecks friendship, opt-in and both block directions after listing and rejects forged scope without writes', async () => {
    const owner = await user('gates-owner'), friend = await user('gates-friend'), stranger = await user('gates-stranger'), privateFriend = await user('gates-private', false);
    const relationship = await befriend(owner, friend); await befriend(owner, privateFriend);
    expect((await service.social(owner.id)).friends?.map(row => row.publicId)).toContain(friend.publicId);
    const before = await raw(owner), commands = await db.getRepository(DemonTowerCommand).count();
    await db.getRepository(Friendship).update(relationship.id, { endedAt: now, endedReason: 'removed' });
    for (const opponent of [friend, stranger, privateFriend]) await expect(service.action(owner.id, input(spar(opponent), before.version))).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_ARENA_OPPONENT_UNAVAILABLE' } });
    for (const friendOnly of [false, 'true', 1]) await expect(service.action(owner.id, { ...input(spar(stranger), before.version), payload: { opponentPublicId: stranger.publicId, friendOnly } })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_INVALID_ACTION' } });
    await expect(service.action(owner.id, { ...input(spar(stranger), before.version), payload: { opponentPublicId: stranger.publicId, friendOnly: true, grantXp: 1000 } })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_INVALID_ACTION' } });
    await block(owner, friend); await block(stranger, owner);
    for (const opponent of [friend, stranger]) await expect(service.action(owner.id, input(spar(opponent, false), before.version))).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_ARENA_OPPONENT_UNAVAILABLE' } });
    expect(await raw(owner)).toEqual(before); expect(await db.getRepository(DemonTowerCommand).count()).toBe(commands);
  });

  it('shares the five-opponent budget across both entrances and resets display by Beijing date without saving a GET', async () => {
    const owner = await user('daily-owner'), opponents: User[] = [];
    for (let i = 0; i < 6; i += 1) { const opponent = await user(`daily-${i}`); await befriend(owner, opponent); opponents.push(opponent); }
    for (const [i, opponent] of opponents.slice(0, 5).entries()) await act(owner, spar(opponent, i % 2 === 0));
    expect((await service.overview(owner.id)).profile!.expansion!.arena!.attemptsToday).toBe(5);
    await expect(act(owner, spar(opponents[5]))).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_ARENA_DAILY_LIMIT' } });
    const before = await raw(owner);
    now = new Date('2099-09-08T16:00:00Z');
    expect((await service.social(owner.id)).friends?.every(row => !row.challengedToday)).toBe(true);
    expect(await raw(owner)).toEqual(before);
    expect((await act(owner, spar(opponents[0]))).overview.profile!.expansion!.arena!.attemptsToday).toBe(1);
  });
});
