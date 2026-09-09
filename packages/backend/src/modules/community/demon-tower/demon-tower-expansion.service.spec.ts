import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { DataSource } from 'typeorm';
import type { DemonTowerAction, DemonTowerActionInput } from '@stealth-reader/shared';
import { DemonTowerProfile, DemonTowerCommand, User, WalletLedger } from '../../../database/entities';
import { DemonTowerSquad } from '../../../database/entities/demon-tower-squad.entity';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { PlatformAssetsService } from '../../platform/platform-assets.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { DemonTowerService } from './demon-tower.service';
import { DemonTowerController } from './demon-tower.controller';
import { cleanupDemonTowerExpansionUser } from './demon-tower-expansion-cleanup';
import type { DemonTowerEngineState } from './demon-tower.engine';
import type { DemonTowerSquadState } from './demon-tower-squad.engine';

/** Real repository/query integration; PG transaction races remain separately verified on PostgreSQL. */
describe('Demon tower expansion account/room integration', () => {
  let db: DataSource, service: DemonTowerService, now: Date;
  const env = { ...process.env };
  beforeEach(async () => {
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true'; process.env.FEATURE_COMMUNITY_DEMON_TOWER_ENABLED = 'true'; process.env.FEATURE_DEMON_TOWER_EXPANSION_ENABLED = 'true';
    now = new Date('2099-09-08T02:00:00Z'); db = await createLocalDevDataSource();
    service = new DemonTowerService(db, new PlatformAssetsService({ now: () => now }), { now: () => now });
  });
  afterEach(async () => { if (db?.isInitialized) await db.destroy(); process.env = { ...env }; jest.restoreAllMocks(); });
  async function user(name: string) { const repo = db.getRepository(User); const actor = await repo.save(repo.create({ username: name, displayName: name, email: `${name}@expansion.invalid`, passwordHash: 'synthetic-only', accountStatus: 'active' })); await act(actor, { kind: 'enroll', payload: {} }); return actor; }
  const input = (action: DemonTowerAction, expectedVersion: number): DemonTowerActionInput => ({ ...action, requestId: randomUUID(), expectedVersion });
  async function act(actor: User, action: DemonTowerAction) { now = new Date(now.getTime() + 1001); const view = await service.overview(actor.id); return service.action(actor.id, input(action, view.profile?.version ?? 0)); }
  const raw = (actor: User) => db.getRepository(DemonTowerProfile).createQueryBuilder('profile').addSelect('profile.state').where('profile.user_id = :id', { id: actor.id }).getOneOrFail();
  async function prepare(actor: User, change: (state: DemonTowerEngineState) => void) { const profile = await raw(actor); change(profile.state as unknown as DemonTowerEngineState); await db.getRepository(DemonTowerProfile).save(profile); }
  const room = (id: string) => db.getRepository(DemonTowerSquad).createQueryBuilder('squad').addSelect('squad.state').where('squad.id = :id', { id }).getOneOrFail();

  it('protects social reads and keeps feature-off/GET-only paths free of state or room creation', async () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, DemonTowerController.prototype.social)).toContain(JwtAuthGuard);
    const actor = await user('read-only'); const before = await raw(actor);
    expect((await service.overview(actor.id)).profile!.expansion).toBeDefined(); expect(await raw(actor)).toEqual(before);
    expect(await db.getRepository(DemonTowerSquad).count()).toBe(0);
    process.env.FEATURE_DEMON_TOWER_EXPANSION_ENABLED = 'false';
    expect(await service.social(actor.id)).toMatchObject({ enabled: false, opponents: [], squads: [] });
    await expect(act(actor, { kind: 'expedition', payload: { mode: 'meditate' } })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_EXPANSION_DISABLED' } });
    expect(await raw(actor)).toEqual(before);
  });
  it('persists market debit and exact replay once, rejects version/hash conflicts and never creates wallet currency', async () => {
    const actor = await user('market'); await prepare(actor, state => { state.materials.soul = 50; });
    const current = await raw(actor), request = input({ kind: 'market', payload: { offer: 'skill_box' } }, current.version);
    const first = await service.action(actor.id, request), saved = await raw(actor), replay = await service.action(actor.id, request);
    expect(first.overview.profile!.materials.soul).toBe(40); expect(first.overview.profile!.expansion!.skillPages).toBe(1);
    expect(replay.replayed).toBe(true); expect(await raw(actor)).toEqual(saved); expect(await db.getRepository(WalletLedger).count()).toBe(0);
    await expect(service.action(actor.id, { ...request, payload: { offer: 'weapon_box' } })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_IDEMPOTENCY_CONFLICT' } });
  });
  it('resolves only another active opted-in public ID, does not mutate opponent or leak private build', async () => {
    const a = await user('duelist-a'), b = await user('duelist-b');
    await act(a, { kind: 'arena_enroll', payload: { enabled: true } }); await act(b, { kind: 'arena_enroll', payload: { enabled: true } });
    const before = await raw(b), result = await act(a, { kind: 'arena_challenge', payload: { opponentPublicId: b.publicId } });
    expect(await raw(b)).toEqual(before); expect(result.overview.profile!.expansion!.arena!.attemptsToday).toBe(1);
    expect(JSON.stringify(result)).not.toMatch(/rngSeed|rngCounter|arenaOpponentsToday|passwordHash|"build"|userId/);
    await expect(act(a, { kind: 'arena_challenge', payload: { opponentPublicId: b.publicId } })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_ARENA_OPPONENT_ALREADY_CHALLENGED' } });
    await expect(act(a, { kind: 'arena_challenge', payload: { opponentPublicId: a.publicId } })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_INVALID_ARENA_OPPONENT' } });
    await act(b, { kind: 'arena_enroll', payload: { enabled: false } });
    await expect(act(a, { kind: 'arena_challenge', payload: { opponentPublicId: b.publicId } })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_ARENA_OPPONENT_UNAVAILABLE' } });
  });
  it('projects only opted-in opponents and public member fields through the real social endpoint', async () => {
    const a = await user('social-a'), b = await user('social-b');
    await act(a, { kind: 'arena_enroll', payload: { enabled: true } });
    let view = await service.social(b.id); expect(view.opponents.map(item => item.publicId)).toEqual([a.publicId]);
    const created = await act(a, { kind: 'squad_create', payload: { floor: 1 } }); const id = created.overview.profile!.expansion!.squadId!;
    view = await service.social(b.id); expect(view.squads.map(row => row.id)).toContain(id);
    expect(JSON.stringify(view)).not.toMatch(/rngSeed|rngCounter|passwordHash|"build"|userId/); expect(JSON.stringify(view)).not.toContain(a.id);
  });
  it('requires individual ready consent, locks private snapshots, settles rounds and grants each member exactly once', async () => {
    const a = await user('party-a'), b = await user('party-b'), outsider = await user('party-outsider');
    for (const actor of [a, b]) await prepare(actor, state => { state.attributes.STR = 1000; state.attributes.SPD = 1000; state.attributes.DEF = 100; state.hp = 400; });
    const created = await act(a, { kind: 'squad_create', payload: { floor: 1 } }), id = created.overview.profile!.expansion!.squadId!;
    await act(b, { kind: 'squad_join', payload: { squadId: id } });
    const priorA = (await service.overview(a.id)).profile!.stamina, priorB = (await service.overview(b.id)).profile!.stamina;
    await act(a, { kind: 'squad_ready', payload: {} });
    expect((await room(id)).status).toBe('waiting'); expect((await service.overview(b.id)).profile!.stamina).toBe(priorB);
    await expect(act(outsider, { kind: 'squad_step', payload: {} })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_SQUAD_NOT_JOINED' } });
    await act(b, { kind: 'squad_ready', payload: {} }); expect((await room(id)).status).toBe('active');
    expect((await service.overview(a.id)).profile!.stamina).toBe(priorA - 3); expect((await service.overview(b.id)).profile!.stamina).toBe(priorB - 3);
    const beforeStep = await raw(a), request = input({ kind: 'squad_step', payload: {} }, beforeStep.version);
    await service.action(a.id, request); expect((await room(id)).status).toBe('victory');
    const saved = await room(id); expect((await service.action(a.id, request)).replayed).toBe(true); expect(await room(id)).toEqual(saved);
    const rewardA = await act(a, { kind: 'squad_claim', payload: {} }), rewardB = await act(b, { kind: 'squad_claim', payload: {} });
    expect(rewardA.overview.profile!.expansion!.essences).toBe(1); expect(rewardB.overview.profile!.expansion!.essences).toBe(1);
    await expect(act(a, { kind: 'squad_claim', payload: {} })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_SQUAD_REWARD_UNAVAILABLE' } });
    expect(await db.getRepository(WalletLedger).count()).toBe(0);
    await act(a, { kind: 'squad_leave', payload: {} }); expect((await service.overview(a.id)).profile!.expansion!.squadId).toBeNull();
  });
  it('caps membership at four, rejects room-switch/foreign ready payload and never charges unready players', async () => {
    const members: User[] = []; for (let i = 0; i < 5; i += 1) members.push(await user(`member-${i}`));
    const created = await act(members[0], { kind: 'squad_create', payload: { floor: 1 } }), id = created.overview.profile!.expansion!.squadId!;
    for (const actor of members.slice(1, 4)) await act(actor, { kind: 'squad_join', payload: { squadId: id } });
    await expect(act(members[4], { kind: 'squad_join', payload: { squadId: id } })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_SQUAD_UNAVAILABLE' } });
    const before = await raw(members[0]);
    await expect(service.action(members[0].id, input({ kind: 'squad_ready', payload: { userId: members[1].id } } as unknown as DemonTowerAction, before.version))).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_INVALID_ACTION' } });
    expect(await raw(members[0])).toEqual(before); expect(((await room(id)).state as unknown as DemonTowerSquadState).members.every(member => !member.ready)).toBe(true);
  });
  it('lets an expired unfinished party leave without refunding consented preparation or deleting teammates', async () => {
    const a = await user('expired-a'), b = await user('expired-b');
    const created = await act(a, { kind: 'squad_create', payload: { floor: 1 } }), id = created.overview.profile!.expansion!.squadId!;
    await act(b, { kind: 'squad_join', payload: { squadId: id } }); await act(a, { kind: 'squad_ready', payload: {} });
    now = new Date(now.getTime() + 86_400_001);
    await act(a, { kind: 'squad_leave', payload: {} });
    const saved = await room(id); expect(saved.status).toBe('closed'); expect((saved.state as unknown as DemonTowerSquadState).members.map(member => member.userId)).toEqual([b.id]);
  });
  it('anonymizes soft-deleted identity/build/history but retains other members assets and receipt history', async () => {
    const a = await user('delete-a'), b = await user('delete-b');
    await act(a, { kind: 'arena_enroll', payload: { enabled: true } }); await act(b, { kind: 'arena_enroll', payload: { enabled: true } });
    await act(b, { kind: 'arena_challenge', payload: { opponentPublicId: a.publicId } });
    const created = await act(a, { kind: 'squad_create', payload: { floor: 1 } }), id = created.overview.profile!.expansion!.squadId!;
    await act(b, { kind: 'squad_join', payload: { squadId: id } }); await act(a, { kind: 'squad_ready', payload: {} });
    const before = (await raw(b)).state as unknown as DemonTowerEngineState, commandCount = await db.getRepository(DemonTowerCommand).count();
    await db.transaction(manager => cleanupDemonTowerExpansionUser(manager, a.id, a.publicId));
    const after = (await raw(b)).state as unknown as DemonTowerEngineState;
    expect(after.expansion!.arena!.lastReport).toMatchObject({ opponentPublicId: '', opponentName: '已注销同事' });
    expect(after.arenaOpponentsToday).not.toContain(a.publicId); expect(after.materials).toEqual(before.materials);
    expect(JSON.stringify((await room(id)).state)).not.toContain(a.id); expect((await room(id)).ownerId).toBe(b.id);
    expect(await db.getRepository(DemonTowerCommand).count()).toBe(commandCount);
  });
});
