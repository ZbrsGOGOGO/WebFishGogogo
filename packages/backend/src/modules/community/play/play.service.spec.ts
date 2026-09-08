import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import type { ArcadeGameKey, PlayRoomView } from '@stealth-reader/shared';
import { PlayCommand, PlayDailyScore, PlayRoom, PlayRoomMember, User, UserBlock } from '../../../database/entities';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PlayController } from './play.controller';
import { PlayService } from './play.service';

/** pg-mem exercises real entities/queries, but does not prove locks or transaction rollback. */
describe('PlayService entity integration', () => {
  let db: DataSource;
  let service: PlayService;
  const originalEnv = { ...process.env };
  const initialTime = new Date('2026-09-10T02:00:00.000Z');

  beforeEach(async () => {
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    db = await createLocalDevDataSource();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'hrtime'] }).setSystemTime(initialTime);
    service = new PlayService(db);
  });
  afterEach(async () => {
    service?.onModuleDestroy(); jest.useRealTimers(); jest.restoreAllMocks();
    if (db?.isInitialized) await db.destroy();
    process.env = { ...originalEnv };
  });
  async function user(label: string, status: User['accountStatus'] = 'active'): Promise<User> {
    const repo = db.getRepository(User);
    return repo.save(repo.create({ email: `${label}@play-test.invalid`, username: label, passwordHash: 'not-a-real-password', displayName: label, accountStatus: status }));
  }
  function input(gameKey: ArcadeGameKey = 'tetris', mode: 'solo' | 'room' = 'solo') { return { clientRequestId: randomUUID(), gameKey, mode }; }
  async function roomFor(a: User, b: User, key: ArcadeGameKey = 'tetris'): Promise<PlayRoomView> {
    const waiting = await service.create(a.id, input(key, 'room'));
    await service.join(b.id, { roomId: waiting.id });
    await service.ready(a.id, waiting.id, { ready: true }); await service.ready(b.id, waiting.id, { ready: true });
    return service.start(a.id, waiting.id);
  }
  async function drop(a: User, room: PlayRoomView, sequence = 1): Promise<PlayRoomView> {
    jest.setSystemTime(new Date(Date.now() + 100));
    return service.action(a.id, room.id, { actionId: randomUUID(), sequence, kind: 'tetris', payload: { move: 'hardDrop' } });
  }
  async function finish(a: User, room: PlayRoomView): Promise<PlayRoomView> {
    jest.setSystemTime(new Date(new Date(room.expiresAt).getTime() + 100));
    return service.get(a.id, room.id);
  }

  it('guards all room and office-balance operations with JWT at the controller boundary', () => {
    for (const name of ['list', 'create', 'join', 'get', 'ready', 'start', 'action', 'leave', 'setPassword', 'officeCoins']) {
      const method = PlayController.prototype[name as keyof PlayController];
      expect(Reflect.getMetadata(GUARDS_METADATA, method)).toContain(JwtAuthGuard);
    }
  });

  it('requires an active real account and never authorizes from a supplied user or role field', async () => {
    const suspended = await user('suspended', 'suspended'); const a = await user('alice');
    await expect(service.create(suspended.id, input())).rejects.toMatchObject({ response: { code: 'PLAY_ACTIVE_ACCOUNT_REQUIRED' } });
    await expect(service.create(randomUUID(), input())).rejects.toMatchObject({ response: { code: 'PLAY_ACTIVE_ACCOUNT_REQUIRED' } });
    await expect(service.list(suspended.id)).rejects.toMatchObject({ response: { code: 'PLAY_ACTIVE_ACCOUNT_REQUIRED' } });
    await expect(service.create(a.id, { ...input(), userId: suspended.id, role: 'admin' })).rejects.toMatchObject({ response: { code: 'PLAY_REQUEST_INVALID' } });
    expect(await db.getRepository(PlayRoom).count()).toBe(0);
  });

  it('makes creation idempotent, rejects changed replays and enforces one active participation', async () => {
    const a = await user('alice'); const request = input();
    const first = await service.create(a.id, request); const replay = await service.create(a.id, request);
    expect(replay.id).toBe(first.id); expect(replay.game?.gameKey).toBe('tetris');
    expect(await db.getRepository(PlayRoom).count()).toBe(1);
    await expect(service.create(a.id, { ...request, gameKey: 'snake' })).rejects.toMatchObject({ response: { code: 'PLAY_IDEMPOTENCY_CONFLICT' } });
    await expect(service.create(a.id, input())).rejects.toMatchObject({ response: { code: 'PLAY_ACTIVE_ROOM', roomId: first.id } });
    expect(await db.getRepository(PlayRoomMember).count({ where: { userId: a.id, active: true } })).toBe(1);
  });

  it('validates capacity, room visibility, game allowlist and request field sizes', async () => {
    const a = await user('alice');
    for (const request of [{ ...input('undercover', 'room'), maxPlayers: 2 }, { ...input(), maxPlayers: 2 }, { ...input('draw', 'room'), maxPlayers: 9 }]) {
      await expect(service.create(a.id, request)).rejects.toMatchObject({ response: { code: 'PLAY_CAPACITY_INVALID' } });
    }
    await expect(service.create(a.id, { ...input(), title: '字'.repeat(41) })).rejects.toMatchObject({ response: { code: 'PLAY_TITLE_INVALID' } });
    await expect(service.create(a.id, { ...input(), visibility: 'secret-admin' })).rejects.toMatchObject({ response: { code: 'PLAY_VISIBILITY_INVALID' } });
    await expect(service.create(a.id, { ...input('draw', 'room'), visibility: 'invite' })).rejects.toMatchObject({ response: { code: 'PLAY_VISIBILITY_INVALID' } });
    await expect(service.create(a.id, { ...input(), gameKey: 'client-executable' })).rejects.toMatchObject({ response: { code: 'PLAY_GAME_INVALID' } });
  });

  it('lists only public waiting rooms and never leaks invitation codes, engine state or private account fields', async () => {
    const a = await user('alice'); const b = await user('bob'); const c = await user('carol');
    const publicRoom = await service.create(a.id, input('draw', 'room'));
    const privateRoom = await service.create(b.id, input('draw', 'room'));
    // Historical private rooms keep their original visibility/code; no new
    // client can create them or receive the old invitation secret.
    const oldCode = 'A1B2C3D4E5F6';
    await db.getRepository(PlayRoom).update(privateRoom.id, { visibility: 'invite', joinCode: oldCode });
    const lobby = await service.list(c.id);
    expect(lobby.items.map((room) => room.id)).toEqual([publicRoom.id]);
    expect(JSON.stringify(lobby)).not.toMatch(/joinCode|engineState|passwordHash|email|requestHash/);
    expect(JSON.stringify(lobby)).not.toContain(a.id);
    expect(JSON.stringify(lobby)).not.toContain(oldCode);
    await expect(service.join(c.id, { roomId: privateRoom.id })).rejects.toMatchObject({ response: { code: 'PLAY_ROOM_NOT_FOUND' } });
    const joined = await service.join(c.id, { code: oldCode.toLowerCase() });
    expect(joined.id).toBe(privateRoom.id);
    expect(joined.visibility).toBe('invite'); expect(joined.joinCode).toBeNull();
    expect(await db.getRepository(PlayRoomMember).count({ where: { roomId: privateRoom.id } })).toBe(2);
  });

  it('enforces blocked-user discovery/join privacy, capacity, host-only start and readiness', async () => {
    const a = await user('alice'); const b = await user('bob'); const c = await user('carol');
    const waiting = await service.create(a.id, { ...input('draw', 'room'), maxPlayers: 2 });
    await db.getRepository(UserBlock).insert({ blockerId: a.id, blockedId: c.id });
    expect((await service.list(c.id)).items).toEqual([]);
    await expect(service.join(c.id, { roomId: waiting.id })).rejects.toMatchObject({ response: { code: 'PLAY_ROOM_NOT_FOUND' } });
    await service.join(b.id, { roomId: waiting.id });
    await service.join(b.id, { roomId: waiting.id });
    expect(await db.getRepository(PlayRoomMember).count({ where: { roomId: waiting.id } })).toBe(2);
    await expect(service.start(b.id, waiting.id)).rejects.toMatchObject({ response: { code: 'PLAY_HOST_REQUIRED' } });
    await expect(service.start(a.id, waiting.id)).rejects.toMatchObject({ response: { code: 'PLAY_PLAYERS_NOT_READY' } });
    const d = await user('dora');
    await expect(service.join(d.id, { roomId: waiting.id })).rejects.toMatchObject({ response: { code: 'PLAY_ROOM_FULL' } });
    await service.ready(a.id, waiting.id, { ready: true }); await service.ready(b.id, waiting.id, { ready: true });
    expect((await service.start(a.id, waiting.id)).status).toBe('running');
    expect((await service.start(a.id, waiting.id)).status).toBe('running');
  });

  it('rechecks inactive participants before starting and restricts room views to actual members', async () => {
    const a = await user('alice'); const b = await user('bob'); const c = await user('carol');
    const waiting = await service.create(a.id, input('draw', 'room'));
    await service.join(b.id, { roomId: waiting.id });
    await service.ready(a.id, waiting.id, { ready: true }); await service.ready(b.id, waiting.id, { ready: true });
    await db.getRepository(User).update(b.id, { accountStatus: 'suspended' });
    await expect(service.start(a.id, waiting.id)).rejects.toMatchObject({ response: { code: 'PLAY_PLAYERS_NOT_READY' } });
    await expect(service.get(b.id, waiting.id)).rejects.toMatchObject({ response: { code: 'PLAY_ACTIVE_ACCOUNT_REQUIRED' } });
    await expect(service.get(c.id, waiting.id)).rejects.toMatchObject({ response: { code: 'PLAY_ROOM_NOT_FOUND' } });
    await expect(service.action(c.id, waiting.id, { actionId: randomUUID(), sequence: 1, kind: 'guess', payload: { round: 1, text: '太阳' } })).rejects.toMatchObject({ response: { code: 'PLAY_ROOM_NOT_FOUND' } });
  });

  it('returns the same not-found response to blocked users before revealing full or running room status', async () => {
    const a = await user('alice'); const b = await user('bob'); const blocked = await user('blocked');
    const waiting = await service.create(a.id, { ...input('draw', 'room'), maxPlayers: 2 });
    await service.join(b.id, { roomId: waiting.id });
    await db.getRepository(UserBlock).insert({ blockerId: blocked.id, blockedId: a.id });
    await expect(service.join(blocked.id, { roomId: waiting.id })).rejects.toMatchObject({ response: { code: 'PLAY_ROOM_NOT_FOUND' } });
    const oldCode = 'F6E5D4C3B2A1'; await db.getRepository(PlayRoom).update(waiting.id, { joinCode: oldCode });
    await expect(service.join(blocked.id, { code: oldCode })).rejects.toMatchObject({ response: { code: 'PLAY_ROOM_NOT_FOUND' } });
    await service.ready(a.id, waiting.id, { ready: true }); await service.ready(b.id, waiting.id, { ready: true });
    await service.start(a.id, waiting.id);
    await expect(service.join(blocked.id, { roomId: waiting.id })).rejects.toMatchObject({ response: { code: 'PLAY_ROOM_NOT_FOUND' } });
  });

  it('projects draw words for the authenticated drawer only and returns no private seed/RNG', async () => {
    const a = await user('alice'); const b = await user('bob'); const started = await roomFor(a, b, 'draw');
    const av = await service.get(a.id, started.id); const bv = await service.get(b.id, started.id);
    expect(av.game?.gameKey).toBe('draw'); expect(bv.game?.gameKey).toBe('draw');
    if (av.game?.gameKey !== 'draw' || bv.game?.gameKey !== 'draw') throw new Error('wrong view');
    const drawerView = av.game.board.drawerId === a.publicId ? av : bv;
    const guesserView = drawerView === av ? bv : av;
    if (drawerView.game?.gameKey !== 'draw' || guesserView.game?.gameKey !== 'draw') throw new Error('wrong view');
    expect(drawerView.game.board.word).toEqual(expect.any(String)); expect(guesserView.game.board.word).toBeNull();
    expect(JSON.stringify(guesserView)).not.toContain(drawerView.game.board.word!);
    expect(JSON.stringify(av)).not.toMatch(/"rng"|wordIndex|usedWords|engineState|passwordHash|emailNormalized/);
  });

  it('persists accepted action identity and sequence once; replay cannot double-score or change payload', async () => {
    const a = await user('alice'); const room = await service.create(a.id, input());
    const action = { actionId: randomUUID(), sequence: 1, kind: 'tetris', payload: { move: 'hardDrop' } };
    const first = await service.action(a.id, room.id, action); const score = first.game!.players[0].score;
    expect(score).toBeGreaterThan(0);
    jest.setSystemTime(new Date(Date.now() + 100));
    const replay = await service.action(a.id, room.id, action);
    expect(replay.game!.players[0].score).toBe(score); expect(replay.me.nextSequence).toBe(2);
    expect(await db.getRepository(PlayCommand).count()).toBe(1);
    await expect(service.action(a.id, room.id, { ...action, payload: { move: 'rotate' } })).rejects.toMatchObject({ response: { code: 'PLAY_IDEMPOTENCY_CONFLICT' } });
    await expect(service.action(a.id, room.id, { ...action, actionId: randomUUID() })).rejects.toMatchObject({ response: { code: 'PLAY_SEQUENCE_CONFLICT', nextSequence: 2 } });
    await expect(service.action(a.id, room.id, { ...action, actionId: randomUUID(), sequence: 3 })).rejects.toMatchObject({ response: { code: 'PLAY_SEQUENCE_CONFLICT' } });
    const finished = await finish(a, room);
    expect((await service.action(a.id, room.id, action)).game!.players[0].score).toBe(finished.game!.players[0].score);
    expect(await db.getRepository(PlayCommand).count()).toBe(1);
  });

  it('rejects forged score and invalid engine commands without consuming a sequence', async () => {
    const a = await user('alice'); const room = await service.create(a.id, input());
    const action = { actionId: randomUUID(), sequence: 1, kind: 'tetris', payload: { move: 'hardDrop', score: 5000000 } };
    await expect(service.action(a.id, room.id, action)).rejects.toMatchObject({ response: { code: 'PLAY_INVALID_ACTION' } });
    await expect(service.action(a.id, room.id, { ...action, kind: 'reset', payload: {} })).rejects.toMatchObject({ response: { code: 'PLAY_INVALID_ACTION' } });
    expect(await db.getRepository(PlayCommand).count()).toBe(0);
    expect((await service.get(a.id, room.id)).me.nextSequence).toBe(1);
    await expect(service.action(a.id, room.id, { ...action, sequence: 1801 })).rejects.toMatchObject({ response: { code: 'PLAY_ACTION_INVALID' } });
  });

  it('bounds the accepted per-second command rate in addition to engine timing', async () => {
    const a = await user('alice'); const room = await service.create(a.id, input());
    for (let sequence = 1; sequence <= 12; sequence += 1) {
      jest.setSystemTime(new Date(initialTime.getTime() + (sequence - 1) * 75));
      await service.action(a.id, room.id, { actionId: randomUUID(), sequence, kind: 'tetris', payload: { move: 'rotate' } });
    }
    jest.setSystemTime(new Date(initialTime.getTime() + 900));
    await expect(service.action(a.id, room.id, { actionId: randomUUID(), sequence: 13, kind: 'tetris', payload: { move: 'rotate' } })).rejects.toMatchObject({ response: { code: 'PLAY_ACTION_RATE_LIMIT' } });
    expect(await db.getRepository(PlayCommand).count()).toBe(12);
  });

  it('transfers a waiting host, disallows rejoin after leaving and removes invitation access', async () => {
    const a = await user('alice'); const b = await user('bob');
    const waiting = await service.create(a.id, input('draw', 'room')); await service.join(b.id, { roomId: waiting.id });
    const left = await service.leave(a.id, waiting.id);
    expect(left.me.left).toBe(true); expect(left.joinCode).toBeNull(); expect(left.game).toBeNull();
    expect((await service.get(b.id, waiting.id)).me.isHost).toBe(true);
    await expect(service.join(a.id, { roomId: waiting.id })).rejects.toMatchObject({ response: { code: 'PLAY_ROOM_LEFT' } });
    expect((await service.leave(b.id, waiting.id)).status).toBe('closed');
  });

  it('excludes an already-scoring player who quits a running match from the daily board', async () => {
    const a = await user('alice'); const b = await user('bob'); const room = await roomFor(a, b);
    const played = await drop(a, room); expect(played.game!.players.find((p) => p.id === a.publicId)!.score).toBeGreaterThan(0);
    await service.leave(a.id, room.id); const finished = await finish(b, room);
    expect(finished.status).toBe('finished'); expect(finished.members.find((m) => m.publicId === a.publicId)?.score).toBe(0);
    expect(await db.getRepository(PlayDailyScore).count({ where: { userId: a.id } })).toBe(0);
    expect(await db.getRepository(PlayDailyScore).count({ where: { userId: b.id } })).toBe(0);
  });

  it('keeps one shared personal best across solo and multiplayer modes; lower scores do not replace it', async () => {
    const a = await user('alice'); const b = await user('bob');
    const solo = await service.create(a.id, input()); await drop(a, solo); await finish(a, solo);
    const first = await db.getRepository(PlayDailyScore).findOneByOrFail({ userId: a.id, gameKey: 'tetris', serviceDate: '2026-09-10' });
    const multi = await roomFor(a, b); await drop(a, multi); await drop(a, multi, 2); await finish(a, multi);
    const best = await db.getRepository(PlayDailyScore).findOneByOrFail({ userId: a.id, gameKey: 'tetris', serviceDate: '2026-09-10' });
    expect(best.score).toBeGreaterThan(first.score); expect(best.mode).toBe('room');
    const low = await service.create(a.id, input()); await drop(a, low); await finish(a, low);
    const retained = await db.getRepository(PlayDailyScore).findOneByOrFail({ userId: a.id, gameKey: 'tetris', serviceDate: '2026-09-10' });
    expect(retained).toEqual(best); expect(await db.getRepository(PlayDailyScore).count({ where: { userId: a.id } })).toBe(1);
  });

  it('uses the documented server-settlement day at Beijing midnight, including delayed catch-up', async () => {
    const a = await user('alice');
    jest.setSystemTime(new Date('2026-09-10T15:57:58.000Z'));
    const beforeMidnight = await service.create(a.id, input()); await drop(a, beforeMidnight);
    expect(beforeMidnight.expiresAt).toBe('2026-09-10T15:59:58.000Z');
    jest.setSystemTime(new Date('2026-09-10T16:00:03.000Z'));
    const caughtUp = await service.get(a.id, beforeMidnight.id);
    expect(caughtUp.leaderboardDate).toBe('2026-09-11');
    expect(await db.getRepository(PlayDailyScore).count({ where: { serviceDate: '2026-09-10' } })).toBe(0);
    expect(await db.getRepository(PlayDailyScore).count({ where: { serviceDate: '2026-09-11' } })).toBe(1);
  });

  it('closes expired waiting rooms and lets a former member start a fresh session', async () => {
    const a = await user('alice'); const waiting = await service.create(a.id, input('draw', 'room'));
    jest.setSystemTime(new Date(new Date(waiting.expiresAt).getTime() + 1));
    await service.sweep();
    expect((await service.get(a.id, waiting.id)).status).toBe('closed');
    expect((await service.create(a.id, input())).status).toBe('running');
  });

  it('does not mutate running rooms while community writes are disabled', async () => {
    const a = await user('alice'); const room = await service.create(a.id, input());
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
    jest.setSystemTime(new Date(new Date(room.expiresAt).getTime() + 1));
    await expect(service.create(a.id, input())).rejects.toMatchObject({ response: { code: 'COMMUNITY_WRITES_DISABLED' } });
    await expect(service.leave(a.id, room.id)).rejects.toMatchObject({ response: { code: 'COMMUNITY_WRITES_DISABLED' } });
    await service.sweep();
    expect((await service.get(a.id, room.id)).status).toBe('running');
    expect(await db.getRepository(PlayDailyScore).count()).toBe(0);
  });
});
