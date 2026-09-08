import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { AuthRateLimitBucket, PlayRoom, PlayRoomMember, RailRoom, RailRoomMember, User, UserBlock } from '../../../database/entities';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import * as passwords from '../room-password';
import { PlayService } from './play.service';

describe('Play room password and cross-game participation', () => {
  let db: DataSource; let play: PlayService;
  const originalEnv = { ...process.env };
  beforeEach(async () => {
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    process.env.AUTH_TOKEN_PEPPER = 'synthetic-room-password-pepper-at-least-32-bytes';
    db = await createLocalDevDataSource(); play = new PlayService(db);
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'hrtime'] }).setSystemTime(new Date('2099-08-01T02:00:00Z'));
  });
  afterEach(async () => { jest.useRealTimers(); jest.restoreAllMocks(); if (db?.isInitialized) await db.destroy(); process.env = { ...originalEnv }; });
  async function user(name: string): Promise<User> { const repo = db.getRepository(User); return repo.save(repo.create({ email: `${name}@password-test.invalid`, username: name, displayName: name, passwordHash: 'synthetic-not-for-login', accountStatus: 'active' })); }
  function create(password = '') { return { clientRequestId: randomUUID(), gameKey: 'draw', mode: 'room', password }; }
  async function privateRow(id: string): Promise<PlayRoom> { return db.getRepository(PlayRoom).createQueryBuilder('room').addSelect(['room.passwordHash', 'room.joinCode']).where('room.id = :id', { id }).getOneOrFail(); }

  it('lists protected public rooms but only exposes a boolean, never plaintext, hash or old invitation secrets', async () => {
    const a = await user('alice'); const b = await user('bob'); const password = '午间协作密码';
    const room = await play.create(a.id, create(password));
    const stored = await privateRow(room.id);
    expect(stored.passwordHash).toMatch(/^rp1\$/); expect(await passwords.verifyRoomPassword(password, stored.passwordHash)).toBe(true);
    expect((await db.getRepository(PlayRoom).findOneByOrFail({ id: room.id })).passwordHash).toBeUndefined();
    const lobby = await play.list(b.id); const own = await play.list(a.id);
    expect(room.hasPassword).toBe(true); expect(room.joinCode).toBeNull(); expect(lobby.items[0].hasPassword).toBe(true); expect(own.activeRoom?.hasPassword).toBe(true);
    for (const payload of [room, lobby, own]) {
      const value = JSON.stringify(payload); expect(value).not.toContain(password); expect(value).not.toContain(stored.passwordHash!); expect(value).not.toContain(stored.joinCode); expect(value).not.toMatch(/passwordHash|requestHash|email/);
    }
    await expect(play.join(b.id, { roomId: room.id })).rejects.toMatchObject({ response: { code: 'PLAY_ROOM_ACCESS_DENIED' } });
    await expect(play.join(b.id, { roomId: room.id, password: '错误密码' })).rejects.toMatchObject({ response: { code: 'PLAY_ROOM_ACCESS_DENIED' } });
    expect((await play.join(b.id, { roomId: room.id, password })).id).toBe(room.id);
  });

  it('keys create idempotency on the normalized password intent without changing historical private visibility', async () => {
    const a = await user('alice'); const request = create('e\u0301abc');
    const room = await play.create(a.id, request);
    expect((await play.create(a.id, { ...request, password: 'éabc' })).id).toBe(room.id);
    await expect(play.create(a.id, { ...request, password: 'other-pass' })).rejects.toMatchObject({ response: { code: 'PLAY_IDEMPOTENCY_CONFLICT' } });
    await db.getRepository(PlayRoom).update(room.id, { visibility: 'invite' });
    const changed = await play.setPassword(a.id, room.id, { password: '', expectedVersion: room.version });
    expect(changed.visibility).toBe('invite'); expect(changed.hasPassword).toBe(false); expect(changed.joinCode).toBeNull();
    const outsider = await user('outsider'); expect((await play.list(outsider.id)).items).toEqual([]);
    await expect(play.join(outsider.id, { roomId: room.id })).rejects.toMatchObject({ response: { code: 'PLAY_ROOM_NOT_FOUND' } });
  });

  it('persists password-attempt limits across rejected joins and independent service instances', async () => {
    const a = await user('alice'); const b = await user('bob'); const c = await user('carol');
    const room = await play.create(a.id, create('valid-password'));
    for (let attempt = 0; attempt < 5; attempt += 1) await expect(new PlayService(db).join(b.id, { roomId: room.id, password: 'wrong-password' })).rejects.toMatchObject({ response: { code: 'PLAY_ROOM_ACCESS_DENIED' } });
    await expect(new PlayService(db).join(b.id, { roomId: room.id, password: 'valid-password' })).rejects.toMatchObject({ response: { code: 'AUTH_RATE_LIMITED' }, status: 429 });
    expect(await db.getRepository(PlayRoomMember).count({ where: { roomId: room.id } })).toBe(1);
    expect(await db.getRepository(AuthRateLimitBucket).count()).toBeGreaterThan(0);
    // An attacker cannot exhaust a room-wide budget and lock everyone else out.
    expect((await play.join(c.id, { roomId: room.id, password: 'valid-password' })).id).toBe(room.id);
    jest.setSystemTime(new Date(Date.now() + 600_001));
    expect((await play.join(b.id, { roomId: room.id, password: 'valid-password' })).id).toBe(room.id);
  });

  it('allows only the current waiting host to change or clear a password using an expected version', async () => {
    const a = await user('alice'); const b = await user('bob'); const c = await user('carol');
    const room = await play.create(a.id, create()); await play.join(b.id, { roomId: room.id });
    await expect(play.setPassword(c.id, room.id, { password: 'pass-one', expectedVersion: 2 })).rejects.toMatchObject({ response: { code: 'PLAY_ROOM_NOT_FOUND' } });
    await expect(play.setPassword(b.id, room.id, { password: 'pass-one', expectedVersion: 2 })).rejects.toMatchObject({ response: { code: 'PLAY_HOST_REQUIRED' } });
    await expect(play.setPassword(a.id, room.id, { password: 'pass-one', expectedVersion: 1 })).rejects.toMatchObject({ response: { code: 'PLAY_VERSION_CONFLICT' } });
    const changed = await play.setPassword(a.id, room.id, { password: 'pass-one', expectedVersion: 2 });
    expect(changed.version).toBe(3); expect(changed.hasPassword).toBe(true);
    // Existing admitted members can reconnect without learning the new secret.
    expect((await play.join(b.id, { roomId: room.id })).id).toBe(room.id);
    const clear = await play.setPassword(a.id, room.id, { password: '', expectedVersion: 3 });
    expect(clear.hasPassword).toBe(false); expect((await privateRow(room.id)).passwordHash).toBeNull();
    await play.ready(a.id, room.id, { ready: true }); await play.ready(b.id, room.id, { ready: true });
    const running = await play.start(a.id, room.id);
    await expect(play.setPassword(a.id, room.id, { password: 'pass-two', expectedVersion: running.version })).rejects.toMatchObject({ response: { code: 'PLAY_ROOM_NOT_WAITING' } });
  });

  it('rechecks the verified hash under the room lock when the host changes it during verification', async () => {
    const a = await user('alice'); const b = await user('bob'); const room = await play.create(a.id, create('pass-one'));
    const actual = passwords.verifyRoomPassword;
    jest.spyOn(passwords, 'verifyRoomPassword').mockImplementationOnce(async (password, hash) => {
      const valid = await actual(password, hash);
      await play.setPassword(a.id, room.id, { password: 'pass-two', expectedVersion: room.version });
      return valid;
    });
    await expect(play.join(b.id, { roomId: room.id, password: 'pass-one' })).rejects.toMatchObject({ response: { code: 'PLAY_ROOM_ACCESS_DENIED' } });
    expect(await db.getRepository(PlayRoomMember).count({ where: { roomId: room.id } })).toBe(1);
    expect((await play.join(b.id, { roomId: room.id, password: 'pass-two' })).id).toBe(room.id);
  });

  it('keeps blocked-user discovery private and disables password writes with the community gate', async () => {
    const a = await user('alice'); const b = await user('bob'); const room = await play.create(a.id, create('secret-room'));
    await db.getRepository(UserBlock).insert({ blockerId: a.id, blockedId: b.id });
    await expect(play.join(b.id, { roomId: room.id, password: 'secret-room' })).rejects.toMatchObject({ response: { code: 'PLAY_ROOM_NOT_FOUND' } });
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
    await expect(play.setPassword(a.id, room.id, { password: '', expectedVersion: room.version })).rejects.toMatchObject({ response: { code: 'COMMUNITY_WRITES_DISABLED' } });
    expect((await privateRow(room.id)).passwordHash).not.toBeNull();
  });

  it('rejects an active Rail participant after the user lock but does not occupy their slot for spectating', async () => {
    const a = await user('alice');
    const rail = await db.getRepository(RailRoom).save({ creatorId: a.id, hostUserId: a.id, clientRequestId: randomUUID(), requestHash: 'synthetic', mode: 'room', title: '合成轨道房间', status: 'waiting', version: 1, passwordHash: null, maxPlayers: 3, botCount: 0, rankingEligible: false, latestChatSequence: 0, expiresAt: new Date(Date.now() + 3600000) });
    await db.getRepository(RailRoomMember).insert({ roomId: rail.id, userId: a.id, role: 'participant', active: true, ready: false, lastSequence: 0, actionWindowCount: 0, leftAt: null });
    await expect(play.create(a.id, create())).rejects.toMatchObject({ response: { code: 'PLAY_ACTIVE_RAIL_ROOM', roomId: rail.id } });
    const b = await user('bob'); const room = await play.create(b.id, create());
    await expect(play.join(a.id, { roomId: room.id })).rejects.toMatchObject({ response: { code: 'PLAY_ACTIVE_RAIL_ROOM' } });
    await db.getRepository(RailRoomMember).update({ roomId: rail.id, userId: a.id }, { role: 'spectator' });
    expect((await play.join(a.id, { roomId: room.id })).id).toBe(room.id);
  });

  it('locks the active user before the room even for GET-driven advancement', async () => {
    const a = await user('alice'); const room = await play.create(a.id, create());
    const queries: string[] = [];
    jest.spyOn(db.logger, 'logQuery').mockImplementation((sql) => { queries.push(sql); });
    await play.get(a.id, room.id);
    const userLock = queries.findIndex((sql) => /FROM "users"/.test(sql) && sql.includes('FOR NO KEY UPDATE'));
    const roomLock = queries.findIndex((sql) => /FROM "play_rooms"/.test(sql) && sql.includes('FOR UPDATE'));
    expect(userLock).toBeGreaterThanOrEqual(0); expect(roomLock).toBeGreaterThan(userLock);
  });

  it('does not repeat bcrypt for a creation replay or an already-active account', async () => {
    const a = await user('alice'); const request = create('existing-secret');
    const room = await play.create(a.id, request);
    const hashing = jest.spyOn(passwords, 'hashRoomPassword');
    expect((await play.create(a.id, request)).id).toBe(room.id);
    await expect(play.create(a.id, create('another-secret'))).rejects.toMatchObject({ response: { code: 'PLAY_ACTIVE_ROOM' } });
    expect(hashing).not.toHaveBeenCalled();
  });

  it('persists a separate host-mutation budget including clears before any new bcrypt work', async () => {
    const a = await user('alice'); const room = await play.create(a.id, create());
    for (let index = 0; index < 10; index += 1) expect((await new PlayService(db).setPassword(a.id, room.id, { password: '', expectedVersion: index + 1 })).version).toBe(index + 2);
    const hashing = jest.spyOn(passwords, 'hashRoomPassword');
    await expect(new PlayService(db).setPassword(a.id, room.id, { password: 'new-secret', expectedVersion: 11 })).rejects.toMatchObject({ response: { code: 'AUTH_RATE_LIMITED' }, status: 429 });
    expect(hashing).not.toHaveBeenCalled(); expect((await play.get(a.id, room.id)).version).toBe(11);
    const scopes = (await db.getRepository(AuthRateLimitBucket).find()).map((row) => row.scope);
    expect(scopes.every((scope) => scope.startsWith('room-password-mutation:play:'))).toBe(true);
  });
});
