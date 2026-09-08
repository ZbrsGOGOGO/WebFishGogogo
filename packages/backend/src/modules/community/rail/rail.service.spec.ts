import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import type { RailActionKind, RailRoomView } from '@stealth-reader/shared';
import { PlayRoomMember, RailCommand, RailDailyScore, RailPlayerStats, RailRoom, RailRoomMember, User, UserBlock } from '../../../database/entities';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PlayService } from '../play/play.service';
import * as roomPasswords from '../room-password';
import { RailChatService } from './rail-chat.service';
import { RailController } from './rail.controller';
import { RailService } from './rail.service';

/** pg-mem verifies actual entities/SQL, not PostgreSQL locking or rollback semantics. */
describe('RailService entity integration', () => {
  let db: DataSource;
  let service: RailService;
  let chat: RailChatService;
  const originalEnv = { ...process.env };
  const initialTime = new Date('2026-09-12T02:00:00.000Z');
  beforeEach(async () => {
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    db = await createLocalDevDataSource();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'hrtime'] }).setSystemTime(initialTime);
    chat = { availability: () => ({ chatEnabled: true, chatCanWrite: true }) } as RailChatService;
    service = new RailService(db, chat);
  });
  afterEach(async () => {
    service?.onModuleDestroy(); jest.useRealTimers(); jest.restoreAllMocks();
    if (db?.isInitialized) await db.destroy();
    process.env = { ...originalEnv };
  });
  async function user(label: string, status: User['accountStatus'] = 'active'): Promise<User> {
    const repo = db.getRepository(User);
    return repo.save(repo.create({ email: `${label}@rail-test.invalid`, username: label, passwordHash: 'not-a-real-password', displayName: label, accountStatus: status }));
  }
  const input = (extra: Record<string, unknown> = {}) => ({ clientRequestId: randomUUID(), mode: 'room', ...extra });
  const tick = (ms = 100): void => { jest.setSystemTime(new Date(Date.now() + ms)); };
  async function start(users: User[], extra: Record<string, unknown> = {}): Promise<RailRoomView> {
    const room = await service.create(users[0].id, input(extra));
    for (const member of users.slice(1)) { tick(); await service.join(member.id, { roomId: room.id }); }
    for (const member of users) await service.ready(member.id, room.id, { ready: true });
    return service.start(users[0].id, room.id);
  }
  async function act(user: User, roomId: string, kind: RailActionKind, fields: Record<string, unknown> = {}): Promise<RailRoomView> {
    const room = await service.get(user.id, roomId);
    tick();
    return service.action(user.id, roomId, { actionId: randomUUID(), sequence: room.me.nextSequence, kind, payload: { roundToken: room.game!.roundToken, ...fields } });
  }
  async function complete(users: User[], initial: RailRoomView): Promise<RailRoomView> {
    let latest = initial;
    for (let step = 0; step < 200 && latest.status === 'running'; step += 1) {
      let acted = false;
      for (const member of users) {
        const room = await service.get(member.id, latest.id);
        latest = room;
        if (room.status !== 'running') break;
        const me = room.game!.me!;
        const kind = me.availableActions[0];
        if (!kind) continue;
        let fields: Record<string, unknown> = {};
        if (kind === 'place_good') fields = { cardId: me.hand.good[0].id };
        else if (kind === 'place_bad') fields = { cardId: me.hand.bad[0].id };
        else if (kind === 'place_buff') fields = { cardId: me.hand.buff[0].id, targetId: [...room.game!.tracks.A, ...room.game!.tracks.B].find((character) => !character.buff)!.id };
        else if (kind === 'choose_track') fields = { track: 'A' };
        else if (kind === 'rate') fields = { value: 5 };
        latest = await act(member, room.id, kind, fields);
        acted = true;
        break;
      }
      if (!acted && latest.status === 'running') { tick(1500); latest = await service.get(users[0].id, latest.id); }
    }
    expect(latest.status).toBe('finished');
    return latest;
  }

  it('requires JWT on every personal/room/chat operation and leaves only catalog/board public', () => {
    for (const method of ['me', 'list', 'create', 'join', 'get', 'ready', 'start', 'action', 'leave', 'bots', 'password', 'chatList', 'chatSend', 'chatWithdraw'] as const) expect(Reflect.getMetadata(GUARDS_METADATA, RailController.prototype[method])).toContain(JwtAuthGuard);
    expect(Reflect.getMetadata(GUARDS_METADATA, RailController.prototype.catalog)).toBeUndefined();
    expect(Reflect.getMetadata(GUARDS_METADATA, RailController.prototype.leaderboard)).toBeUndefined();
  });
  it('enforces active accounts and rejects client-supplied identities, scoring and unknown fields', async () => {
    const a = await user('alice'); const disabled = await user('disabled', 'suspended');
    await expect(service.create(disabled.id, input())).rejects.toMatchObject({ response: { code: 'RAIL_ACTIVE_ACCOUNT_REQUIRED' } });
    await expect(service.create(a.id, input({ userId: disabled.id, communityRole: 'admin' }))).rejects.toMatchObject({ response: { code: 'RAIL_REQUEST_INVALID' } });
    await expect(service.list(disabled.id)).rejects.toMatchObject({ response: { code: 'RAIL_ACTIVE_ACCOUNT_REQUIRED' } });
    expect(await db.getRepository(RailRoom).count()).toBe(0);
  });
  it('makes creation idempotent and keyed password intent cannot become plaintext or an offline password hash', async () => {
    const a = await user('alice'); const request = input({ password: '私有测试密码' });
    const hasher = jest.spyOn(roomPasswords, 'hashRoomPassword');
    const room = await service.create(a.id, request);
    expect((await service.create(a.id, request)).id).toBe(room.id);
    await expect(service.create(a.id, { ...request, password: 'another-secret' })).rejects.toMatchObject({ response: { code: 'RAIL_IDEMPOTENCY_CONFLICT' } });
    expect(await db.getRepository(RailRoom).count()).toBe(1);
    expect(room.hasPassword).toBe(true);
    expect(JSON.stringify(room)).not.toMatch(/passwordHash|engineState|requestHash|email|rngSeed/);
    expect(JSON.stringify(room)).not.toContain('私有测试密码');
    const stored = await db.getRepository(RailRoom).createQueryBuilder('room').addSelect('room.passwordHash').getOne();
    expect(stored?.passwordHash).toMatch(/^rp1\$\$2/);
    expect(stored?.requestHash).toHaveLength(64);
    await expect(service.create(a.id, input())).rejects.toMatchObject({ response: { code: 'RAIL_ACTIVE_ROOM', roomId: room.id } });
    expect(hasher).toHaveBeenCalledTimes(1);
  });
  it('validates 3–9 capacity and bot count, never lets the client declare a bot identity', async () => {
    const a = await user('alice');
    for (const extra of [{ maxPlayers: 2 }, { maxPlayers: 10 }, { botCount: 9 }, { maxPlayers: 3, botCount: 3 }, { mode: 'practice', botCount: 1 }]) await expect(service.create(a.id, input(extra))).rejects.toBeDefined();
    await expect(service.create(a.id, input({ bots: [{ id: 'AI01', isBot: false }] }))).rejects.toMatchObject({ response: { code: 'RAIL_REQUEST_INVALID' } });
    const room = await service.create(a.id, input({ mode: 'practice', botCount: 8 }));
    expect(room).toMatchObject({ status: 'running', playerCount: 1, botCount: 8, rankingEligible: false });
    expect(room.game?.players).toHaveLength(9);
  });
  it('lists waiting/running rooms with safe counts, hiding practices and blocked rooms without leaking private data', async () => {
    const a = await user('alice'); const b = await user('bob'); const c = await user('carol');
    const room = await service.create(a.id, input({ botCount: 2, password: 'test-pass' }));
    await service.create(b.id, input({ mode: 'practice' }));
    const lobby = await service.list(c.id);
    expect(lobby.items).toHaveLength(1);
    expect(lobby.items[0]).toMatchObject({ id: room.id, hasPassword: true, playerCount: 1, botCount: 2 });
    expect(JSON.stringify(lobby)).not.toMatch(/passwordHash|engineState|requestHash|email|userId|communityRole/);
    await db.getRepository(UserBlock).insert({ blockerId: a.id, blockedId: c.id });
    expect((await service.list(c.id)).items).toHaveLength(0);
    await expect(service.join(c.id, { roomId: room.id, password: 'wrong' })).rejects.toMatchObject({ response: { code: 'RAIL_ROOM_NOT_FOUND' } });
  });
  it('requires a correct password even for spectators and preserves independent failed-attempt limits', async () => {
    const a = await user('alice'); const b = await user('bob'); const c = await user('carol');
    const room = await service.create(a.id, input({ password: 'open-test' }));
    for (let attempt = 0; attempt < 5; attempt += 1) await expect(service.join(b.id, { roomId: room.id, role: 'spectator', password: 'wrong-pass' })).rejects.toMatchObject({ response: { code: 'RAIL_PASSWORD_REQUIRED' } });
    await expect(service.join(b.id, { roomId: room.id, password: 'open-test' })).rejects.toMatchObject({ status: 429 });
    const joined = await service.join(c.id, { roomId: room.id, password: 'open-test', role: 'spectator' });
    expect(joined.me.role).toBe('spectator');
    expect((await service.join(c.id, { roomId: room.id })).me.role).toBe('spectator');
    expect(await db.getRepository(RailRoomMember).count({ where: { roomId: room.id } })).toBe(2);
  });
  it('checks readiness, host rights, bot capacity and expected versions, resetting readiness on bot changes', async () => {
    const a = await user('alice'); const b = await user('bob');
    const room = await service.create(a.id, input({ maxPlayers: 3 }));
    await service.join(b.id, { roomId: room.id });
    await expect(service.start(b.id, room.id)).rejects.toMatchObject({ response: { code: 'RAIL_HOST_REQUIRED' } });
    await expect(service.start(a.id, room.id)).rejects.toMatchObject({ response: { code: 'RAIL_PLAYERS_NOT_READY' } });
    const ready = await service.ready(a.id, room.id, { ready: true });
    await expect(service.setBots(a.id, room.id, { count: 1, expectedVersion: room.version })).rejects.toMatchObject({ response: { code: 'RAIL_VERSION_CONFLICT' } });
    await expect(service.setBots(a.id, room.id, { count: 2, expectedVersion: ready.version })).rejects.toMatchObject({ response: { code: 'RAIL_ROOM_FULL' } });
    const updated = await service.setBots(a.id, room.id, { count: 1, expectedVersion: ready.version });
    expect(updated.members.every((member) => !member.ready)).toBe(true);
    for (const actor of [a, b]) await service.ready(actor.id, room.id, { ready: true });
    const started = await service.start(a.id, room.id);
    expect(started.status).toBe('running'); expect(started.rankingEligible).toBe(false);
    expect((await service.start(a.id, room.id)).status).toBe('running');
  });
  it('lets only a waiting host change/remove a password and rejects stale expected versions', async () => {
    const a = await user('alice'); const b = await user('bob');
    const room = await service.create(a.id, input());
    await service.join(b.id, { roomId: room.id });
    const current = await service.get(a.id, room.id);
    await expect(service.setPassword(b.id, room.id, { password: 'test-pass', expectedVersion: current.version })).rejects.toMatchObject({ response: { code: 'RAIL_HOST_REQUIRED' } });
    const updated = await service.setPassword(a.id, room.id, { password: 'test-pass', expectedVersion: current.version });
    expect(updated.hasPassword).toBe(true);
    await expect(service.setPassword(a.id, room.id, { password: '', expectedVersion: current.version })).rejects.toMatchObject({ response: { code: 'RAIL_VERSION_CONFLICT' } });
    const cleared = await service.setPassword(a.id, room.id, { password: '', expectedVersion: updated.version });
    expect(cleared.hasPassword).toBe(false);
  });
  it('rechecks the password hash under the room lock after an otherwise successful preflight verification', async () => {
    const a = await user('alice'); const b = await user('bob');
    const room = await service.create(a.id, input({ password: 'old-secret' }));
    const replacement = await roomPasswords.hashRoomPassword('new-secret');
    const verify = roomPasswords.verifyRoomPassword;
    jest.spyOn(roomPasswords, 'verifyRoomPassword').mockImplementationOnce(async (password, stored) => {
      const valid = await verify(password, stored);
      await db.getRepository(RailRoom).update(room.id, { passwordHash: replacement });
      return valid;
    });
    await expect(service.join(b.id, { roomId: room.id, password: 'old-secret' })).rejects.toMatchObject({ response: { code: 'RAIL_PASSWORD_CHANGED' } });
    expect(await db.getRepository(RailRoomMember).count({ where: { roomId: room.id } })).toBe(1);
  });
  it('limits password mutations across service instances before hashing, including repeated clears', async () => {
    const a = await user('alice');
    let room = await service.create(a.id, input());
    const hasher = jest.spyOn(roomPasswords, 'hashRoomPassword');
    for (let index = 0; index < 10; index += 1) room = await new RailService(db, chat).setPassword(a.id, room.id, { password: '', expectedVersion: room.version });
    expect(hasher).toHaveBeenCalledTimes(10);
    await expect(new RailService(db, chat).setPassword(a.id, room.id, { password: 'not-hashed-now', expectedVersion: room.version })).rejects.toMatchObject({ status: 429 });
    expect(hasher).toHaveBeenCalledTimes(10);
  });
  it('limits observers to 20, prevents spectator actions/roles, and shows no private hand even midgame', async () => {
    const actors = await Promise.all(['alice', 'bob', 'carol'].map((label) => user(label)));
    const room = await start(actors);
    let observer!: User;
    for (let index = 0; index < 20; index += 1) {
      const current = await user(`observer${index}`);
      await service.join(current.id, { roomId: room.id, role: 'spectator' });
      if (index === 0) observer = current;
    }
    const view = await service.get(observer.id, room.id);
    expect(view).toMatchObject({ spectatorCount: 20, me: { role: 'spectator' }, game: { viewerRole: 'spectator', me: null } });
    expect(JSON.stringify(view.game)).not.toMatch(/"hand"|rngSeed|manualActions/);
    await expect(service.ready(observer.id, room.id, { ready: true })).rejects.toMatchObject({ response: { code: 'RAIL_PARTICIPANT_REQUIRED' } });
    await expect(service.action(observer.id, room.id, { actionId: randomUUID(), sequence: 1, kind: 'choose_track', payload: { roundToken: view.game!.roundToken, track: 'A' } })).rejects.toMatchObject({ response: { code: 'RAIL_PARTICIPANT_REQUIRED' } });
    const extra = await user('extra');
    await expect(service.join(extra.id, { roomId: room.id, role: 'spectator' })).rejects.toMatchObject({ response: { code: 'RAIL_SPECTATORS_FULL' } });
    await expect(service.join(extra.id, { roomId: room.id, role: 'participant' })).rejects.toMatchObject({ response: { code: 'RAIL_ROOM_NOT_JOINABLE' } });
  });
  it('serializes game participation across old Play and Rail while allowing Rail observation beside a Play game', async () => {
    const a = await user('alice'); const b = await user('bob'); const old = new PlayService(db);
    const play = await old.create(a.id, { clientRequestId: randomUUID(), gameKey: 'snake', mode: 'solo' });
    await expect(service.create(a.id, input())).rejects.toMatchObject({ response: { code: 'RAIL_ACTIVE_PLAY_ROOM', roomId: play.id } });
    const rail = await service.create(b.id, input());
    expect((await service.join(a.id, { roomId: rail.id, role: 'spectator' })).me.role).toBe('spectator');
    expect(await db.getRepository(PlayRoomMember).count({ where: { userId: a.id, active: true } })).toBe(1);
    await expect(old.create(b.id, { clientRequestId: randomUUID(), gameKey: 'snake', mode: 'solo' })).rejects.toMatchObject({ response: { code: 'PLAY_ACTIVE_RAIL_ROOM' } });
  });
  it('makes accepted actions sequence/idempotency bound, and rejects forged scores without consuming a command', async () => {
    const actors = await Promise.all(['alice', 'bob', 'carol'].map((label) => user(label)));
    const room = await start(actors);
    const actor = actors.find((entry) => entry.publicId !== room.game!.conductorId)!;
    const own = await service.get(actor.id, room.id);
    const command = { actionId: randomUUID(), sequence: 1, kind: 'place_good', payload: { roundToken: own.game!.roundToken, cardId: own.game!.me!.hand.good[0].id } };
    await expect(service.action(actor.id, room.id, { ...command, payload: { ...command.payload, score: 10000 } })).rejects.toMatchObject({ response: { code: 'RAIL_INVALID_ACTION' } });
    expect(await db.getRepository(RailCommand).count()).toBe(0);
    const first = await service.action(actor.id, room.id, command);
    expect(first.me.nextSequence).toBe(2);
    expect((await service.action(actor.id, room.id, command)).me.nextSequence).toBe(2);
    expect(await db.getRepository(RailCommand).count()).toBe(1);
    await expect(service.action(actor.id, room.id, { ...command, actionId: randomUUID() })).rejects.toMatchObject({ response: { code: 'RAIL_SEQUENCE_CONFLICT' } });
    await expect(service.action(actor.id, room.id, { ...command, payload: { ...command.payload, cardId: own.game!.me!.hand.good[1].id } })).rejects.toMatchObject({ response: { code: 'RAIL_IDEMPOTENCY_CONFLICT' } });
  });
  it('settles a fully manual three-human game once into cumulative stats and a positive survival dayboard', async () => {
    const actors = await Promise.all(['alice', 'bob', 'carol'].map((label) => user(label)));
    const over = await complete(actors, await start(actors));
    expect(over.rankingEligible).toBe(true);
    expect(over.game?.result?.players.every((player) => player.eligible && player.eligibleRounds === 2)).toBe(true);
    const stats = await db.getRepository(RailPlayerStats).find();
    expect(stats).toHaveLength(3);
    expect(stats.every((entry) => entry.completedGames === 1 && entry.rankedGames === 1 && entry.eligibleRounds === 2)).toBe(true);
    const scores = await db.getRepository(RailDailyScore).find();
    expect(scores.length).toBeGreaterThan(0);
    expect(scores.every((entry) => entry.rateBasisPoints > 0 && entry.serviceDate === '2026-09-12')).toBe(true);
    await service.get(actors[0].id, over.id); await service.sweep();
    expect((await db.getRepository(RailPlayerStats).find()).every((entry) => entry.completedGames === 1)).toBe(true);
    expect(await db.getRepository(RailRoomMember).count({ where: { roomId: over.id, active: true } })).toBe(0);
  });
  it('keeps fully manual bot practice in personal stats but never the currency leaderboard', async () => {
    const a = await user('alice');
    const initial = await service.create(a.id, input({ mode: 'practice' }));
    const over = await complete([a], initial);
    expect(over.game?.result?.players.find((entry) => entry.id === a.publicId)?.eligible).toBe(true);
    expect(await db.getRepository(RailDailyScore).count()).toBe(0);
    expect(await db.getRepository(RailPlayerStats).findOneByOrFail({ userId: a.id })).toMatchObject({ completedGames: 1, rankedGames: 0, eligibleRounds: 2 });
  });
  it('finishes long-idle games on sweep without AFK scores and leaves history/read-only chat intact', async () => {
    const actors = await Promise.all(['alice', 'bob', 'carol'].map((label) => user(label)));
    const room = await start(actors);
    jest.setSystemTime(new Date(new Date(room.expiresAt).getTime() + 1000));
    await service.sweep();
    const over = await service.get(actors[0].id, room.id);
    expect(over.status).toBe('finished'); expect(over.game?.history).toHaveLength(3); expect(over.chatCanWrite).toBe(false);
    expect(await db.getRepository(RailDailyScore).count()).toBe(0);
    expect(await db.getRepository(RailPlayerStats).count()).toBe(0);
  });
  it('transfers the host only to a player, closes abandoned waiting rooms, and forbids returning after leaving', async () => {
    const a = await user('alice'); const b = await user('bob'); const observer = await user('observer');
    const room = await service.create(a.id, input());
    await service.join(observer.id, { roomId: room.id, role: 'spectator' });
    await service.join(b.id, { roomId: room.id });
    const left = await service.leave(a.id, room.id);
    expect(left.me.left).toBe(true); expect(left.game).toBeNull(); expect(left.chatCanWrite).toBe(false);
    expect((await service.get(b.id, room.id)).me.isHost).toBe(true);
    await expect(service.join(a.id, { roomId: room.id })).rejects.toMatchObject({ response: { code: 'RAIL_ROOM_LEFT' } });
    expect((await service.leave(b.id, room.id)).status).toBe('closed');
    expect(await db.getRepository(RailRoomMember).count({ where: { roomId: room.id, active: true } })).toBe(0);
  });
  it('projects changed/deleted identities from live accounts, not stale engine names, including final results', async () => {
    const actors = await Promise.all(['alice', 'bob', 'carol'].map((label) => user(label)));
    const room = await complete(actors, await start(actors));
    await db.getRepository(User).update(actors[1].id, { accountStatus: 'deleted', displayName: 'obsolete-private-name', username: 'obsolete-user' });
    const latest = await service.get(actors[0].id, room.id);
    expect(latest.game?.players.find((entry) => entry.id === actors[1].publicId)?.displayName).toBe('已注销同事');
    expect(latest.game?.result?.players.find((entry) => entry.id === actors[1].publicId)?.displayName).toBe('已注销同事');
    expect(JSON.stringify(latest)).not.toMatch(/obsolete-private-name|obsolete-user|"bob"/);
  });
  it('respects write flags for actions, automatic progression and moderation availability on the page', async () => {
    const a = await user('alice'); const room = await service.create(a.id, input({ mode: 'practice' }));
    jest.spyOn(chat, 'availability').mockReturnValue({ chatEnabled: true, chatCanWrite: false });
    expect((await service.get(a.id, room.id)).chatCanWrite).toBe(false);
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
    jest.setSystemTime(new Date(new Date(room.expiresAt).getTime() + 1000));
    await service.sweep();
    expect((await service.get(a.id, room.id)).status).toBe('running');
    await expect(service.leave(a.id, room.id)).rejects.toMatchObject({ status: 503 });
    expect(await db.getRepository(RailPlayerStats).count()).toBe(0);
  });
});
