import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { acceptPaperArenaInput, createPaperArenaEngine, finishPaperArenaAtDeadline, isPaperArenaInput, PAPER_ARENA_RULES, paperArenaWalkable, respawnPaperArenaPlayer, stepPaperArena, type PaperArenaInput } from '@stealth-reader/shared';
import { AuthSession, User, UserBlock, WalletBalance } from '../../../database/entities';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { PaperArenaService } from './paper-arena.service';

const input = (patch: Partial<PaperArenaInput> = {}): PaperArenaInput => ({ seq: 1, forward: 0, strafe: 0, yaw: 0, pitch: 0, fire: false, reload: false, ...patch });
describe('paper arena authoritative simulation', () => {
  it.each([4, 5, 6, 7, 8])('fills %i balanced seats and validates safe spawn positions', capacity => {
    const state = createPaperArenaEngine(capacity, 20, 7);
    expect(state.players).toHaveLength(capacity);
    expect(Math.abs(state.players.filter(p => p.team === 'red').length - state.players.filter(p => p.team === 'blue').length)).toBeLessThanOrEqual(1);
    expect(state.players.every(p => paperArenaWalkable(p.x, p.z) && p.isBot)).toBe(true);
  });
  it.each([[3, 20], [9, 20], [4, 19], [4, 101], [4, 20.5]])('rejects invalid settings %j', (capacity, target) => expect(() => createPaperArenaEngine(capacity, target, 1)).toThrow());
  it.each([null, [], input({ forward: 2 }), input({ yaw: Infinity }), input({ pitch: 2 }), input({ seq: -1 }), { ...input(), kills: 100 }, { ...input(), x: 0 }, { ...input(), fire: 'true' }])('rejects forged or malformed inputs %j', value => expect(isPaperArenaInput(value)).toBe(false));
  it('uses fixed server ticks, normalizes diagonal speed, rejects replay, and expires held input', () => {
    const state = createPaperArenaEngine(4, 20, 1), player = state.players[0];
    state.players.forEach(p => { p.isBot = false; p.connected = true; });
    player.x = -15; player.z = -15;
    expect(acceptPaperArenaInput(state, player.id, input({ forward: 1, strafe: 1 }))).toBe(true);
    expect(acceptPaperArenaInput(state, player.id, input({ forward: -1 }))).toBe(false);
    stepPaperArena(state);
    expect(Math.hypot(player.x + 15, player.z + 15)).toBeCloseTo(PAPER_ARENA_RULES.playerSpeed * .05);
    for (let i = 0; i < 8; i++) stepPaperArena(state);
    const position = [player.x, player.z]; stepPaperArena(state); expect([player.x, player.z]).toEqual(position);
    expect(state.elapsedMs).toBe(500);
  });
  function duel() {
    const state = createPaperArenaEngine(4, 20, 1);
    state.players.forEach((p, i) => { p.isBot = false; p.connected = true; p.x = -16 + i; p.z = 16; });
    const [a, b] = state.players; a.x = b.x = -5; a.z = -5; b.z = 2; a.yaw = 0;
    return { state, a, b };
  }
  function fire(state: ReturnType<typeof createPaperArenaEngine>, id: string, ticks = 20) {
    for (let index = 0; index < ticks; index++) { acceptPaperArenaInput(state, id, input({ seq: state.tick + 1, fire: true })); stepPaperArena(state); }
  }
  it('scores one kill, stops exactly at target, and never accepts client damage', () => {
    const { state, a, b } = duel(); b.protectedUntil = 0; state.scores.red = 19;
    fire(state, a.id); expect(state.winner).toBe('red'); expect(state.scores.red).toBe(20); expect(a.kills).toBe(1); expect(b.deaths).toBe(1);
    const after = JSON.stringify(state); stepPaperArena(state); expect(JSON.stringify(state)).toBe(after);
  });
  it('respects obstacles, teammates and spawn protection', () => {
    for (const mode of ['wall', 'team', 'protection']) {
      const { state, a, b } = duel();
      if (mode === 'wall') { a.x = b.x = 0; a.z = -5; b.z = 5; b.protectedUntil = 0; }
      if (mode === 'team') { b.team = a.team; b.protectedUntil = 0; }
      fire(state, a.id, 20); expect(b.hp).toBe(100); expect(state.scores.red).toBe(0);
    }
  });
  it('revives after the delay in random safe positions with bounded protection and preserves personal score', () => {
    const { state, a, b } = duel(); b.protectedUntil = 0; fire(state, a.id, 20);
    expect(b.hp).toBe(0); const readyAt = b.respawnAt;
    acceptPaperArenaInput(state, a.id, input({ seq: 100, fire: false }));
    while (state.elapsedMs + 50 < readyAt) stepPaperArena(state);
    expect(b.hp).toBe(0); stepPaperArena(state);
    expect(b.hp).toBe(100); expect(b.deaths).toBe(1); expect(b.protectedUntil).toBe(state.elapsedMs + 1500); expect(paperArenaWalkable(b.x, b.z)).toBe(true);
    const places = new Set<string>(); for (let i = 0; i < 10; i++) { respawnPaperArenaPlayer(state, b); places.add(`${b.x}:${b.z}`); } expect(places.size).toBeGreaterThan(5);
  });
  it('enforces magazine/fire cadence and reload duration instead of input frequency', () => {
    const { state, a } = duel();
    for (let i = 0; i < 100; i++) acceptPaperArenaInput(state, a.id, input({ seq: i, fire: true }));
    stepPaperArena(state); expect(a.ammo).toBe(24); // fresh spawn cooldown
    for (let i = 0; i < 5; i++) { acceptPaperArenaInput(state, a.id, input({ seq: 100 + i, fire: true })); stepPaperArena(state); }
    expect(a.ammo).toBe(23);
    acceptPaperArenaInput(state, a.id, input({ seq: 110, reload: true })); stepPaperArena(state);
    const until = a.reloadingUntil; while (state.elapsedMs + 50 < until) stepPaperArena(state);
    expect(a.ammo).toBe(23); stepPaperArena(state); expect(a.ammo).toBe(24);
  });
  it.each([1, 7, 21])('AI navigates and reaches a legitimate victory for deterministic seed %i', seed => {
    const a = createPaperArenaEngine(8, 20, seed), b = createPaperArenaEngine(8, 20, seed);
    while (!a.winner) stepPaperArena(a);
    for (let tick = 0; tick < a.tick; tick++) stepPaperArena(b);
    expect(a).toEqual(b); expect(Math.max(a.scores.red, a.scores.blue)).toBe(20); expect(a.elapsedMs).toBeLessThan(120_000);
    expect(a.players.every(p => paperArenaWalkable(p.x, p.z))).toBe(true);
  });
  it.each([[0, 0, 'draw'], [3, 2, 'red'], [4, 5, 'blue']] as const)('settles the wall-clock deadline from existing scores %i:%i', (red, blue, winner) => {
    const state = createPaperArenaEngine(4, 100, 7); state.scores = { red, blue }; const rng = state.rng;
    finishPaperArenaAtDeadline(state);
    expect(state.winner).toBe(winner); expect(state.elapsedMs).toBe(PAPER_ARENA_RULES.maxDurationMs);
    expect(state.scores).toEqual({ red, blue }); expect(state.tick).toBe(0); expect(state.rng).toBe(rng);
    const final = JSON.stringify(state); stepPaperArena(state); expect(JSON.stringify(state)).toBe(final);
  });
});

describe('paper arena authenticated ephemeral room service', () => {
  let db: DataSource, service: PaperArenaService;
  const savedEnv = { ...process.env };
  beforeAll(async () => {
    process.env.LOCAL_DEV = 'true'; process.env.FEATURE_PAPER_ARENA_ENABLED = 'true'; process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    db = await createLocalDevDataSource();
  });
  beforeEach(() => { service = new PaperArenaService(db); });
  afterEach(() => { jest.restoreAllMocks(); service.onModuleDestroy(); });
  afterAll(async () => { process.env = savedEnv; if (db?.isInitialized) await db.destroy(); });
  async function user() { const id = randomUUID(); return db.getRepository(User).save(db.getRepository(User).create({ email: `${id}@paper.test.invalid`, passwordHash: 'synthetic-only', accountStatus: 'active' as const, displayName: '测试同事' })); }
  const create = (secret = '') => ({ requestId: randomUUID(), name: '纸上协作', maxPlayers: 4, targetKills: 20, password: secret });
  async function principal(actor: User, roomId: string) {
    const session = await db.getRepository(AuthSession).save({ userId: actor.id, expiresAt: new Date(Date.now() + 600_000), revokedAt: null, lastSeenAt: new Date() });
    const result = await service.ticket(actor.id, session.id, roomId, {});
    return { session, result, value: await service.consumeTicket(result.ticket) };
  }
  it('requires explicit flags and active accounts and gives no account assets', async () => {
    const actor = await user(); process.env.FEATURE_PAPER_ARENA_ENABLED = 'false';
    await expect(service.list(actor.id)).rejects.toMatchObject({ response: { code: 'PAPER_DISABLED' } }); process.env.FEATURE_PAPER_ARENA_ENABLED = 'true';
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false'; await expect(service.create(actor.id, create())).rejects.toThrow(); process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    await db.getRepository(User).update(actor.id, { accountStatus: 'banned' }); await expect(service.create(actor.id, create())).rejects.toThrow();
    expect(await db.getRepository(WalletBalance).countBy({ userId: actor.id })).toBe(0);
  });
  it('replays a creation only for the same intent, prevents double-room membership and hides engine secrets', async () => {
    const actor = await user(), request = create(), room = await service.create(actor.id, request);
    expect((await service.create(actor.id, request)).id).toBe(room.id);
    await expect(service.create(actor.id, { ...request, targetKills: 21 })).rejects.toMatchObject({ response: { code: 'PAPER_CREATE_CONFLICT' } });
    await expect(service.create(actor.id, create())).rejects.toMatchObject({ response: { code: 'PAPER_ALREADY_JOINED' } });
    const serialized = JSON.stringify(room); for (const secret of ['rng', 'controls', 'passwordHash', 'sessionId', actor.id]) expect(serialized).not.toContain(secret);
  });
  it('checks private-room password, prevents nonmembers reading or starting and respects blocking', async () => {
    const a = await user(), b = await user(), room = await service.create(a.id, create('纸笔密码'));
    await expect(service.join(b.id, { roomId: room.id, password: '错误密码' })).rejects.toMatchObject({ response: { code: 'PAPER_PASSWORD_INVALID' } });
    await expect(service.get(b.id, room.id)).rejects.toThrow(); await expect(service.start(b.id, room.id, {})).rejects.toThrow();
    await db.getRepository(UserBlock).save({ blockerId: b.id, blockedId: a.id });
    expect((await service.list(b.id)).rooms).toHaveLength(0); await expect(service.join(b.id, { roomId: room.id, password: '纸笔密码' })).rejects.toMatchObject({ response: { code: 'PAPER_ROOM_NOT_FOUND' } });
  });
  it('admits four humans without AI, rejects fifth, reassigns host and preserves team scores when leaving', async () => {
    const actors = await Promise.all(Array.from({ length: 5 }, user)), room = await service.create(actors[0].id, create());
    for (const actor of actors.slice(1, 4)) await service.join(actor.id, { roomId: room.id, password: '' });
    expect((await service.get(actors[0].id, room.id)).players.filter(p => p.isBot)).toHaveLength(0);
    await expect(service.join(actors[4].id, { roomId: room.id, password: '' })).rejects.toThrow();
    await service.leave(actors[0].id, room.id, {});
    const view = await service.get(actors[1].id, room.id); expect(view.hostPlayerId).toBe(view.myPlayerId); expect(view.players.filter(p => p.isBot)).toHaveLength(1);
    expect((await service.join(actors[4].id, { roomId: room.id, password: '' })).humans).toBe(4);
  });
  it('uses single-use short tickets and checks revoked sessions without leaking credentials', async () => {
    const a = await user(), room = await service.create(a.id, create()), p = await principal(a, room.id);
    await expect(service.consumeTicket(p.result.ticket)).rejects.toThrow();
    expect((await service.validPrincipals([p.value])).has(p.session.id)).toBe(true);
    await db.getRepository(AuthSession).update(p.session.id, { revokedAt: new Date() });
    expect((await service.validPrincipals([p.value])).size).toBe(0);
  });
  it('retains timer fractions without catch-up bursts after long event-loop delays', async () => {
    const a = await user(), room = await service.create(a.id, create()), p = await principal(a, room.id);
    service.connect(p.value, 'clock');
    const now = Date.now(); jest.spyOn(Date, 'now').mockReturnValue(now);
    await service.start(a.id, room.id, {});
    for (let offset = 60; offset <= 300; offset += 60) service.tick(now + offset);
    expect((await service.get(a.id, room.id)).game.tick).toBe(6);
    service.tick(now + 10_315); expect((await service.get(a.id, room.id)).game.tick).toBe(8);
    service.tick(now + 10_320); expect((await service.get(a.id, room.id)).game.tick).toBe(8);
    service.tick(now + 10_350); expect((await service.get(a.id, room.id)).game.tick).toBe(9);
  });
  it('shows a final result instead of deleting the room when the wall-clock deadline overtakes simulation', async () => {
    const a = await user(), room = await service.create(a.id, create()), p = await principal(a, room.id);
    service.connect(p.value, 'deadline');
    const now = Date.now(); const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    await service.start(a.id, room.id, {});
    const late = now + PAPER_ARENA_RULES.maxDurationMs + 6000; clock.mockReturnValue(late);
    service.tick(late); const view = await service.get(a.id, room.id);
    expect(view.status).toBe('finished'); expect(view.game.winner).toBe('draw');
    expect(view.game.elapsedMs).toBe(PAPER_ARENA_RULES.maxDurationMs); expect(view.game.tick).toBe(0);
    expect(view.expiresAt).toBe(late + 600_000); expect(view.humans).toBe(1);
    clock.mockReturnValue(late + 600_000); service.tick(late + 600_000);
    await expect(service.get(a.id, room.id)).rejects.toThrow();
  });
  it('reconnect handoff ignores the old close and cannot restore health or ammo', async () => {
    const a = await user(), room = await service.create(a.id, create()), p = await principal(a, room.id);
    service.connect(p.value, 'old'); service.connect(p.value, 'new'); service.disconnect(p.value, 'old');
    expect((await service.get(a.id, room.id)).players.find(player => player.id === p.value.playerId)?.connected).toBe(true);
    expect(() => service.input(p.value, 'old', input())).toThrow();
    service.disconnect(p.value, 'new'); const v = await service.get(a.id, room.id); expect(v.players.find(player => player.id === p.value.playerId)?.connected).toBe(false);
    service.connect(p.value, 'again'); expect((await service.get(a.id, room.id)).players.find(player => player.id === p.value.playerId)?.hp).toBe(v.players.find(player => player.id === p.value.playerId)?.hp);
  });
  it('an old revoked connection cannot evict the replacement session', async () => {
    const a = await user(), room = await service.create(a.id, create()), old = await principal(a, room.id);
    service.connect(old.value, 'old');
    const fresh = await principal(a, room.id); service.connect(fresh.value, 'fresh');
    await db.getRepository(AuthSession).update(old.session.id, { revokedAt: new Date() });
    expect((await service.validPrincipals([old.value])).size).toBe(0);
    service.revoke(old.value, 'old');
    expect(service.isCurrentConnection(fresh.value, 'fresh')).toBe(true);
    expect((await service.get(a.id, room.id)).humans).toBe(1);
    service.revoke(fresh.value, 'fresh'); expect((await service.list(a.id)).currentRoomId).toBeNull();
  });
  it.each(['expiry', 'maintenance'] as const)('rechecks %s after asynchronous single-use ticket validation', async reason => {
    const a = await user(), room = await service.create(a.id, create()), initial = await principal(a, room.id);
    const ticket = await service.ticket(a.id, initial.session.id, room.id, {});
    jest.spyOn(service, 'validPrincipals').mockImplementationOnce(async values => {
      if (reason === 'expiry') jest.spyOn(Date, 'now').mockReturnValue(ticket.expiresAt);
      else process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
      return new Set(values.map(value => value.sessionId));
    });
    try { await expect(service.consumeTicket(ticket.ticket)).rejects.toThrow(); }
    finally { process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true'; jest.restoreAllMocks(); }
    await expect(service.consumeTicket(ticket.ticket)).rejects.toThrow();
  });
  it('leaving and rejoining cannot resurrect an already-validating old admission ticket', async () => {
    const a = await user(), b = await user(), room = await service.create(a.id, create());
    await service.join(b.id, { roomId: room.id, password: '' });
    const initial = await principal(a, room.id), ticket = await service.ticket(a.id, initial.session.id, room.id, {});
    jest.spyOn(service, 'validPrincipals').mockImplementationOnce(async values => {
      await service.leave(a.id, room.id, {}); await service.join(a.id, { roomId: room.id, password: '' });
      return new Set(values.map(value => value.sessionId));
    });
    await expect(service.consumeTicket(ticket.ticket)).rejects.toThrow();
    expect(() => service.connect(initial.value, 'stale-admission')).toThrow();
    expect((await service.get(a.id, room.id)).humans).toBe(2);
  });
  it('prunes a deleted never-connected member and identity without deleting teammates', async () => {
    const a = await user(), b = await user(), room = await service.create(a.id, create());
    await service.join(b.id, { roomId: room.id, password: '' });
    const old = await principal(a, room.id), ticket = await service.ticket(a.id, old.session.id, room.id, {});
    await db.getRepository(User).update(a.id, { accountStatus: 'deleted' });
    await service.pruneInactiveMembers();
    const view = await service.get(b.id, room.id);
    expect(view.humans).toBe(1); expect(view.hostPlayerId).toBe(view.myPlayerId);
    expect(JSON.stringify(view)).not.toContain(a.publicId);
    await expect(service.consumeTicket(ticket.ticket)).rejects.toThrow();
  });
  it('new blocking invalidates both room principals and removes revoked identity', async () => {
    const a = await user(), b = await user(), room = await service.create(a.id, create()); await service.join(b.id, { roomId: room.id, password: '' });
    const pa = await principal(a, room.id), pb = await principal(b, room.id);
    await db.getRepository(UserBlock).save({ blockerId: a.id, blockedId: b.id }); expect((await service.validPrincipals([pa.value, pb.value])).size).toBe(0);
    service.connect(pb.value, 'blocked'); service.revoke(pb.value, 'blocked'); expect(JSON.stringify(await service.get(a.id, room.id))).not.toContain(b.publicId);
  });
});
