import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DataSource, EntityManager, In, LessThan, MoreThan } from 'typeorm';
import type { ArcadeGameKey, PlayRoomList, PlayRoomSummary, PlayRoomView } from '@stealth-reader/shared';
import { PlayCommand, PlayRoom, PlayRoomMember, RailRoomMember, User, UserBlock } from '../../../database/entities';
import { toBusinessLocalDate } from '../../platform/platform-time';
import { assertCommunityWritesEnabled, communityWritesEnabled } from '../community-write-gate';
import { consumeRoomPasswordAttempt, consumeRoomPasswordMutation, hashRoomPassword, normalizeRoomPassword, roomPasswordFingerprint, verifyRoomPassword } from '../room-password';
import * as engine from './engines';
import { recordOfficeRealtimeUndercover } from '../office-hub/office-hub-realtime';
import { boundedPayload, gameKey, hash, object, person, PLAY_CATALOG, RANKING_RULES, uuid } from './play.rules';

/** All engine JSON and join codes are private. Only viewer-specific projections leave this service. */
@Injectable()
export class PlayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlayService.name);
  private timer?: ReturnType<typeof setInterval>;
  private sweeping = false;
  constructor(private readonly db: DataSource) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => { void this.sweep(); }, 15_000);
    this.timer.unref();
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }
  catalog() { return PLAY_CATALOG; }

  async list(userId: string, filter?: ArcadeGameKey): Promise<PlayRoomList> {
    await this.activeUser(this.db.manager, userId);
    const now = new Date();
    const blocked = await this.blockedIds(this.db.manager, userId);
    const rows = await this.db.getRepository(PlayRoom).createQueryBuilder('room').setFindOptions({
      where: { visibility: 'public', mode: 'room', status: 'waiting', expiresAt: MoreThan(now), ...(filter ? { gameKey: filter } : {}) },
      relations: ['host'], order: { createdAt: 'DESC' }, take: 60,
    }).addSelect('room.passwordHash').getMany();
    const allMembers = rows.length ? await this.db.getRepository(PlayRoomMember).find({ where: { roomId: In(rows.map((room) => room.id)) }, relations: ['user'] }) : [];
    const visible: PlayRoomSummary[] = [];
    for (const room of rows) {
      const members = allMembers.filter((member) => member.roomId === room.id);
      if (members.some((member) => member.active && blocked.has(member.userId))) continue;
      visible.push(this.summary(room, members));
    }
    const active = await this.db.getRepository(PlayRoomMember).findOne({ where: { userId, active: true } });
    const activeRoom = active ? await this.db.getRepository(PlayRoom).createQueryBuilder('room').setFindOptions({ where: { id: active.roomId }, relations: ['host'] }).addSelect('room.passwordHash').getOne() : null;
    return { items: visible, activeRoom: activeRoom ? this.summary(activeRoom, await this.members(this.db.manager, activeRoom.id)) : null };
  }

  async create(userId: string, raw: unknown): Promise<PlayRoomView> {
    assertCommunityWritesEnabled();
    const input = object(raw, ['clientRequestId', 'gameKey', 'mode', 'visibility', 'maxPlayers', 'title', 'password']);
    const key = gameKey(input.gameKey);
    const clientRequestId = uuid(input.clientRequestId);
    if (input.mode !== 'solo' && input.mode !== 'room') throw new BadRequestException({ code: 'PLAY_MODE_INVALID' });
    if (input.visibility !== undefined && input.visibility !== 'public') throw new BadRequestException({ code: 'PLAY_VISIBILITY_INVALID' });
    const mode = input.mode;
    const password = normalizeRoomPassword(input.password);
    if (mode === 'solo' && password !== null) throw new BadRequestException({ code: 'PLAY_REQUEST_INVALID' });
    const maxPlayers = input.maxPlayers ?? (mode === 'solo' ? 1 : 8);
    if (!Number.isSafeInteger(maxPlayers) || Number(maxPlayers) < (mode === 'solo' ? 1 : key === 'undercover' ? 3 : 2) || Number(maxPlayers) > (mode === 'solo' ? 1 : 8)) throw new BadRequestException({ code: 'PLAY_CAPACITY_INVALID' });
    if (input.title !== undefined && (typeof input.title !== 'string' || input.title.length > 40 || /[\u0000-\u001f\u007f]/.test(input.title))) throw new BadRequestException({ code: 'PLAY_TITLE_INVALID' });
    const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim() : `${PLAY_CATALOG.games.find((game) => game.gameKey === key)!.name} · ${mode === 'solo' ? '个人挑战' : '协作房间'}`;
    const visibility = mode === 'solo' ? 'invite' : 'public';
    const requestHash = hash({ key, mode, maxPlayers, title, visibility, password: roomPasswordFingerprint(password) });
    return this.db.transaction(async (manager) => {
      const user = await this.activeUser(manager, userId, true);
      const previous = await manager.getRepository(PlayRoom).findOne({ where: { creatorId: userId, clientRequestId } });
      if (previous) {
        if (previous.requestHash !== requestHash) throw new ConflictException({ code: 'PLAY_IDEMPOTENCY_CONFLICT' });
        const room = await this.lockRoom(manager, previous.id);
        await this.advance(manager, room, new Date());
        return this.project(manager, room, user);
      }
      await this.ensureNoActiveRoom(manager, userId);
      const now = new Date();
      const createdToday = await manager.getRepository(PlayRoom).count({ where: { creatorId: userId, createdAt: MoreThan(new Date(now.getTime() - 86_400_000)) } });
      if (createdToday >= 60) throw new HttpException({ code: 'PLAY_CREATE_LIMIT', message: '24 小时最多新建 60 局，请稍后再试。' }, 429);
      const openCount = await manager.getRepository(PlayRoom).count({ where: { status: In(['waiting', 'running']) } });
      if (openCount >= 100) throw new HttpException({ code: 'PLAY_SERVER_BUSY' }, 429);
      // Bcrypt only after durable account serialization, replay, active-game
      // and creation-quota checks. No room row lock exists yet.
      const passwordHash = await hashRoomPassword(password);
      const state = mode === 'solo' ? engine.create(key, [{ id: user.publicId, displayName: person(user).displayName }], mode, now.getTime(), randomBytes(32).toString('hex')) : null;
      const room = manager.getRepository(PlayRoom).create({
        creatorId: userId, hostUserId: userId, clientRequestId, requestHash, gameKey: key, mode, visibility,
        title, status: state ? 'running' : 'waiting', version: 1, joinCode: randomBytes(6).toString('hex').toUpperCase(), passwordHash, maxPlayers: Number(maxPlayers),
        engineState: state as unknown as Record<string, unknown> | null, createdAt: now, startedAt: state ? now : null,
        expiresAt: new Date(state ? state.endsAt : now.getTime() + 3_600_000), finishedAt: null, leaderboardDate: null,
      });
      await manager.getRepository(PlayRoom).save(room);
      await manager.getRepository(PlayRoomMember).insert({ roomId: room.id, userId, ready: mode === 'solo', active: true, lastSequence: 0, actionWindowAt: null, actionWindowCount: 0, score: null, joinedAt: now, leftAt: null });
      return this.project(manager, room, user);
    });
  }

  async join(userId: string, raw: unknown): Promise<PlayRoomView> {
    assertCommunityWritesEnabled();
    const input = object(raw, ['roomId', 'code', 'password']);
    if ((input.roomId === undefined) === (input.code === undefined)) throw new BadRequestException({ code: 'PLAY_JOIN_INVALID' });
    const roomId = input.roomId === undefined ? undefined : uuid(input.roomId);
    const code = typeof input.code === 'string' ? input.code.trim().toUpperCase() : undefined;
    if (input.code !== undefined && (!code || !/^[A-F0-9]{12}$/.test(code))) throw new BadRequestException({ code: 'PLAY_JOIN_INVALID' });
    const password = normalizeRoomPassword(input.password);
    await this.activeUser(this.db.manager, userId);
    const found = await this.db.getRepository(PlayRoom).createQueryBuilder('room')
      .addSelect('room.passwordHash').where(roomId ? { id: roomId, visibility: 'public', mode: 'room' } : { joinCode: code!, mode: 'room' }).getOne();
    if (!found) throw new NotFoundException({ code: 'PLAY_ROOM_NOT_FOUND' });
    const priorMembers = await this.members(this.db.manager, found.id);
    const priorBlocked = await this.blockedIds(this.db.manager, userId);
    if (priorMembers.some((member) => member.active && priorBlocked.has(member.userId))) throw new NotFoundException({ code: 'PLAY_ROOM_NOT_FOUND' });
    const prior = priorMembers.find((member) => member.userId === userId && !member.leftAt);
    const checkedHash = found.passwordHash ?? null;
    if (!prior && checkedHash !== null) {
      // Hash checks must not hold a room lock or roll back the abuse budget.
      await consumeRoomPasswordAttempt(this.db, 'play', userId, found.id);
      if (!await verifyRoomPassword(password, checkedHash)) throw new ForbiddenException({ code: 'PLAY_ROOM_ACCESS_DENIED' });
    }
    return this.db.transaction(async (manager) => {
      const user = await this.activeUser(manager, userId, true);
      // Resolve any old expired participation before locking the target room.
      await this.ensureNoActiveRoom(manager, userId, found.id);
      const room = await this.lockRoom(manager, found.id);
      const now = new Date();
      await this.advance(manager, room, now);
      const members = await this.members(manager, room.id);
      const activeMembers = members.filter((member) => member.active);
      const blocked = await this.blockedIds(manager, userId);
      if (activeMembers.some((member) => blocked.has(member.userId))) throw new NotFoundException({ code: 'PLAY_ROOM_NOT_FOUND' });
      const existing = members.find((member) => member.userId === userId);
      if (existing && !existing.leftAt) return this.project(manager, room, user);
      if ((room.passwordHash ?? null) !== checkedHash) throw new ForbiddenException({ code: 'PLAY_ROOM_ACCESS_DENIED' });
      if (room.status !== 'waiting') throw new ConflictException({ code: 'PLAY_ROOM_NOT_WAITING' });
      if (existing) throw new ConflictException({ code: 'PLAY_ROOM_LEFT', message: '已退出的房间不能重新加入，请创建或加入下一局。' });
      if (activeMembers.length >= room.maxPlayers) throw new ConflictException({ code: 'PLAY_ROOM_FULL' });
      await manager.getRepository(PlayRoomMember).insert({ roomId: room.id, userId, ready: false, active: true, lastSequence: 0, actionWindowAt: null, actionWindowCount: 0, score: null, joinedAt: now, leftAt: null });
      room.version += 1;
      await manager.getRepository(PlayRoom).save(room);
      return this.project(manager, room, user);
    });
  }

  async setPassword(userId: string, rawId: string, raw: unknown): Promise<PlayRoomView> {
    assertCommunityWritesEnabled();
    const roomId = uuid(rawId);
    const input = object(raw, ['password', 'expectedVersion']);
    if (typeof input.password !== 'string' || !Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 1) throw new BadRequestException({ code: 'PLAY_REQUEST_INVALID' });
    const password = normalizeRoomPassword(input.password);
    await this.activeUser(this.db.manager, userId);
    const membership = await this.db.getRepository(PlayRoomMember).findOneBy({ roomId, userId, active: true });
    if (!membership) throw new NotFoundException({ code: 'PLAY_ROOM_NOT_FOUND' });
    const before = await this.db.getRepository(PlayRoom).findOneBy({ id: roomId });
    if (!before || before.hostUserId !== userId) throw new ForbiddenException({ code: 'PLAY_HOST_REQUIRED' });
    if (before.status !== 'waiting' || before.mode !== 'room') throw new ConflictException({ code: 'PLAY_ROOM_NOT_WAITING' });
    if (before.version !== input.expectedVersion) throw new ConflictException({ code: 'PLAY_VERSION_CONFLICT' });
    await consumeRoomPasswordMutation(this.db, 'play', userId, roomId);
    const passwordHash = await hashRoomPassword(password);
    return this.inRoom(userId, roomId, true, async (manager, room, user, member) => {
      await this.advance(manager, room, new Date());
      if (room.hostUserId !== userId || !member.active) throw new ForbiddenException({ code: 'PLAY_HOST_REQUIRED' });
      if (room.status !== 'waiting' || room.mode !== 'room') throw new ConflictException({ code: 'PLAY_ROOM_NOT_WAITING' });
      if (room.version !== input.expectedVersion) throw new ConflictException({ code: 'PLAY_VERSION_CONFLICT' });
      room.passwordHash = passwordHash; room.version += 1;
      await manager.getRepository(PlayRoom).save(room);
      return this.project(manager, room, user);
    });
  }

  async get(userId: string, roomId: string): Promise<PlayRoomView> {
    return this.inRoom(userId, roomId, false, async (manager, room, user) => {
      if (communityWritesEnabled()) await this.advance(manager, room, new Date());
      return this.project(manager, room, user);
    });
  }
  async ready(userId: string, roomId: string, raw: unknown): Promise<PlayRoomView> {
    const input = object(raw, ['ready']);
    if (typeof input.ready !== 'boolean') throw new BadRequestException({ code: 'PLAY_READY_INVALID' });
    return this.inRoom(userId, roomId, true, async (manager, room, user, member) => {
      await this.advance(manager, room, new Date());
      if (room.status !== 'waiting' || !member.active) throw new ConflictException({ code: 'PLAY_ROOM_NOT_WAITING' });
      member.ready = input.ready as boolean;
      await manager.getRepository(PlayRoomMember).save(member);
      room.version += 1;
      await manager.getRepository(PlayRoom).save(room);
      return this.project(manager, room, user);
    });
  }
  async start(userId: string, roomId: string): Promise<PlayRoomView> {
    return this.inRoom(userId, roomId, true, async (manager, room, user, member) => {
      const now = new Date();
      await this.advance(manager, room, now);
      if (room.hostUserId !== userId || !member.active) throw new ForbiddenException({ code: 'PLAY_HOST_REQUIRED' });
      if (room.status === 'running') return this.project(manager, room, user);
      if (room.status !== 'waiting') throw new ConflictException({ code: 'PLAY_ROOM_NOT_WAITING' });
      const members = (await this.members(manager, room.id)).filter((entry) => entry.active);
      const minPlayers = room.gameKey === 'undercover' ? 3 : 2;
      if (members.length < minPlayers || members.some((entry) => !entry.ready || entry.user.accountStatus !== 'active')) throw new ConflictException({ code: 'PLAY_PLAYERS_NOT_READY' });
      const state = engine.create(room.gameKey, members.map((entry) => ({ id: entry.user.publicId, displayName: person(entry.user).displayName })), room.mode, now.getTime(), randomBytes(32).toString('hex'));
      room.engineState = state as unknown as Record<string, unknown>;
      room.status = 'running'; room.startedAt = now; room.expiresAt = new Date(state.endsAt); room.version += 1;
      await manager.getRepository(PlayRoom).save(room);
      return this.project(manager, room, user);
    });
  }
  async action(userId: string, roomId: string, raw: unknown): Promise<PlayRoomView> {
    const input = object(raw, ['actionId', 'sequence', 'kind', 'payload']);
    const actionId = uuid(input.actionId);
    const sequence = input.sequence;
    if (!Number.isSafeInteger(sequence) || Number(sequence) < 1 || Number(sequence) > 1800 || typeof input.kind !== 'string' || input.kind.length > 20) throw new BadRequestException({ code: 'PLAY_ACTION_INVALID' });
    const payload = object(input.payload);
    boundedPayload(payload);
    const requestHash = hash({ sequence, kind: input.kind, payload });
    return this.inRoom(userId, roomId, true, async (manager, room, user, member) => {
      const now = new Date(); // Read time AFTER the row lock: queued concurrent requests must never rewind the engine.
      const previous = await manager.getRepository(PlayCommand).findOne({ where: { roomId: room.id, userId, actionId } });
      if (previous) {
        if (previous.requestHash !== requestHash) throw new ConflictException({ code: 'PLAY_IDEMPOTENCY_CONFLICT' });
        await this.advance(manager, room, now);
        return this.project(manager, room, user);
      }
      if (Number(sequence) !== member.lastSequence + 1) throw new ConflictException({ code: 'PLAY_SEQUENCE_CONFLICT', nextSequence: member.lastSequence + 1 });
      if (room.status !== 'running' || !member.active || !room.engineState) throw new ConflictException({ code: 'PLAY_ROOM_NOT_RUNNING' });
      if (!member.actionWindowAt || now.getTime() - member.actionWindowAt.getTime() >= 1000) { member.actionWindowAt = now; member.actionWindowCount = 0; }
      if (member.actionWindowCount >= 12) throw new HttpException({ code: 'PLAY_ACTION_RATE_LIMIT' }, 429);
      let state: engine.ArcadeEngineState;
      try { state = engine.act(room.engineState as unknown as engine.ArcadeEngineState, user.publicId, input.kind as string, payload, now.getTime()); }
      catch (error) { if (error instanceof engine.ArcadeEngineError) throw new BadRequestException({ code: `PLAY_${error.code}` }); throw error; }
      member.lastSequence = Number(sequence); member.actionWindowCount += 1;
      await manager.getRepository(PlayRoomMember).save(member);
      await manager.getRepository(PlayCommand).insert({ roomId: room.id, userId, actionId, sequence: Number(sequence), requestHash, createdAt: now });
      room.engineState = state as unknown as Record<string, unknown>; room.version += 1;
      await this.finishIfNeeded(manager, room, now);
      await manager.getRepository(PlayRoom).save(room);
      return this.project(manager, room, user);
    });
  }
  async leave(userId: string, roomId: string): Promise<PlayRoomView> {
    return this.inRoom(userId, roomId, true, async (manager, room, user, member) => {
      const now = new Date();
      await this.advance(manager, room, now);
      if (!member.active || room.status === 'finished' || room.status === 'closed') return this.project(manager, room, user);
      member.active = false; member.leftAt = now; member.ready = false;
      await manager.getRepository(PlayRoomMember).save(member);
      if (room.status === 'running' && room.engineState) {
        room.engineState = engine.forfeit(room.engineState as unknown as engine.ArcadeEngineState, user.publicId, now.getTime()) as unknown as Record<string, unknown>;
        await this.finishIfNeeded(manager, room, now);
      }
      const remaining = (await this.members(manager, room.id)).filter((entry) => entry.active);
      if (room.hostUserId === userId) room.hostUserId = remaining[0]?.userId ?? null;
      if (!remaining.length && !room.finishedAt) { room.status = 'closed'; room.finishedAt = now; }
      room.version += 1;
      await manager.getRepository(PlayRoom).save(room);
      return this.project(manager, room, user);
    });
  }

  async sweep(): Promise<void> {
    if (this.sweeping || !communityWritesEnabled()) return;
    this.sweeping = true;
    try {
      const rooms = await this.db.getRepository(PlayRoom).find({ where: [ { status: 'running' }, { status: 'waiting', expiresAt: LessThan(new Date()) } ], order: { expiresAt: 'ASC' }, take: 100 });
      for (const row of rooms) {
        try { await this.db.transaction(async (manager) => { const room = await this.lockRoom(manager, row.id); await this.advance(manager, room, new Date()); }); }
        catch (error) { this.logger.warn(`Room sweep failed (${error instanceof Error ? error.name : 'unknown'}); retained for retry.`); }
      }
    } finally { this.sweeping = false; }
  }

  private async inRoom<T>(userId: string, rawId: string, write: boolean, work: (manager: EntityManager, room: PlayRoom, user: User, member: PlayRoomMember) => Promise<T>): Promise<T> {
    if (write) assertCommunityWritesEnabled();
    const roomId = uuid(rawId);
    return this.db.transaction(async (manager) => {
      // Match account mutation and create/join lock ordering. Even GET can
      // advance/settle a game, so a stale pre-lock account read is insufficient.
      const user = await this.activeUser(manager, userId, true);
      // Membership before loading private JSON, then rechecked under the room lock.
      if (!await manager.getRepository(PlayRoomMember).exist({ where: { roomId, userId } })) throw new NotFoundException({ code: 'PLAY_ROOM_NOT_FOUND' });
      const room = await this.lockRoom(manager, roomId);
      const member = await manager.getRepository(PlayRoomMember).findOneBy({ roomId, userId });
      if (!member) throw new NotFoundException({ code: 'PLAY_ROOM_NOT_FOUND' });
      return work(manager, room, user, member);
    });
  }
  private async activeUser(manager: EntityManager, userId: string, lock = false): Promise<User> {
    const query = manager.getRepository(User).createQueryBuilder('user').where('user.id = :userId', { userId });
    if (lock) query.setLock('for_no_key_update');
    const user = await query.getOne();
    if (!user || user.accountStatus !== 'active') throw new UnauthorizedException({ code: 'PLAY_ACTIVE_ACCOUNT_REQUIRED' });
    return user;
  }
  private async lockRoom(manager: EntityManager, roomId: string): Promise<PlayRoom> {
    const room = await manager.getRepository(PlayRoom).createQueryBuilder('room').addSelect(['room.engineState', 'room.passwordHash']).where('room.id = :roomId', { roomId }).setLock('pessimistic_write').getOne();
    if (!room) throw new NotFoundException({ code: 'PLAY_ROOM_NOT_FOUND' });
    return room;
  }
  private members(manager: EntityManager, roomId: string) {
    return manager.getRepository(PlayRoomMember).find({ where: { roomId }, relations: ['user'], order: { joinedAt: 'ASC', userId: 'ASC' } });
  }
  private async blockedIds(manager: EntityManager, userId: string): Promise<Set<string>> {
    const rows = await manager.getRepository(UserBlock).find({ where: [{ blockerId: userId }, { blockedId: userId }] });
    return new Set(rows.map((row) => row.blockerId === userId ? row.blockedId : row.blockerId));
  }
  private async ensureNoActiveRoom(manager: EntityManager, userId: string, exceptId?: string): Promise<void> {
    // Both games acquire the same user row lock before this cross-module check.
    // Never advance the other module here: its own sweep owns expiry processing.
    const rail = await manager.getRepository(RailRoomMember).findOneBy({ userId, role: 'participant', active: true });
    if (rail) throw new ConflictException({ code: 'PLAY_ACTIVE_RAIL_ROOM', roomId: rail.roomId, message: '请先返回或退出当前轨道难题赛局。' });
    const current = await manager.getRepository(PlayRoomMember).findOneBy({ userId, active: true });
    if (!current || current.roomId === exceptId) return;
    const room = await this.lockRoom(manager, current.roomId);
    await this.advance(manager, room, new Date());
    if (await manager.getRepository(PlayRoomMember).exist({ where: { roomId: room.id, userId, active: true } })) throw new ConflictException({ code: 'PLAY_ACTIVE_ROOM', roomId: room.id, message: '请先返回当前房间，或退出后再开新局。' });
  }
  private async advance(manager: EntityManager, room: PlayRoom, now: Date): Promise<void> {
    if (room.status === 'running' && room.engineState) {
      room.engineState = engine.advance(room.engineState as unknown as engine.ArcadeEngineState, now.getTime()) as unknown as Record<string, unknown>;
      room.version += 1;
      await this.finishIfNeeded(manager, room, now);
      await manager.getRepository(PlayRoom).save(room);
    } else if (room.status === 'waiting' && room.expiresAt.getTime() <= now.getTime()) {
      room.status = 'closed'; room.finishedAt = now; room.version += 1;
      await manager.getRepository(PlayRoomMember).update({ roomId: room.id, active: true }, { active: false });
      await manager.getRepository(PlayRoom).save(room);
    }
  }
  private async finishIfNeeded(manager: EntityManager, room: PlayRoom, now: Date): Promise<void> {
    if (room.status !== 'running' || !room.engineState) return;
    const result = engine.result(room.engineState as unknown as engine.ArcadeEngineState);
    if (!result) return;
    room.status = 'finished'; room.finishedAt = now; room.leaderboardDate = toBusinessLocalDate(now);
    const scores = new Map(result.scores.map((entry) => [entry.userId, entry.score]));
    const members = (await this.members(manager, room.id)).sort((a, b) => a.userId.localeCompare(b.userId));
    for (const member of members) {
      const score = scores.get(member.user.publicId) ?? 0;
      member.active = false;
      member.score = member.leftAt || member.user.accountStatus !== 'active' ? 0 : Math.max(0, Math.min(5_000_000, Math.floor(score)));
      await manager.getRepository(PlayRoomMember).save(member);
      if (!member.score) continue;
      // Atomic best-score replacement; equal scores preserve the earliest achievement and mode.
      await manager.query(`INSERT INTO play_daily_scores (service_date, game_key, user_id, score, mode, room_id, achieved_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (service_date, game_key, user_id) DO UPDATE
        SET score = EXCLUDED.score, mode = EXCLUDED.mode, room_id = EXCLUDED.room_id, achieved_at = EXCLUDED.achieved_at
        WHERE play_daily_scores.score < EXCLUDED.score`, [room.leaderboardDate, room.gameKey, member.userId, member.score, room.mode, room.id, now]);
    }
    await recordOfficeRealtimeUndercover(manager,room,members);
  }
  private summary(room: PlayRoom, members: PlayRoomMember[]): PlayRoomSummary {
    const host = room.host ?? members.find((member) => member.userId === room.hostUserId)?.user;
    return { id: room.id, title: room.title, gameKey: room.gameKey, mode: room.mode, visibility: room.visibility, status: room.status, host: host ? person(host) : null, memberCount: members.filter((member) => !member.leftAt).length, maxPlayers: room.maxPlayers, createdAt: room.createdAt.toISOString(), hasPassword: Boolean(room.passwordHash) };
  }
  private async project(manager: EntityManager, room: PlayRoom, user: User): Promise<PlayRoomView> {
    const members = await this.members(manager, room.id);
    const me = members.find((member) => member.userId === user.id);
    if (!me) throw new NotFoundException({ code: 'PLAY_ROOM_NOT_FOUND' });
    const now = new Date();
    return { ...this.summary(room, members), version: room.version, joinCode: null,
      members: members.map((member) => ({ ...person(member.user), ready: member.ready, left: Boolean(member.leftAt), score: member.score, joinedAt: member.joinedAt.toISOString() })),
      me: { publicId: user.publicId, isHost: room.hostUserId === user.id, ready: me.ready, left: Boolean(me.leftAt), nextSequence: me.lastSequence + 1 },
      game: room.engineState && !me.leftAt ? engine.view(room.engineState as unknown as engine.ArcadeEngineState, user.publicId, now.getTime()) : null,
      serverNow: now.toISOString(), expiresAt: room.expiresAt.toISOString(), leaderboardDate: room.leaderboardDate, rankingNotice: RANKING_RULES,
    };
  }
}
