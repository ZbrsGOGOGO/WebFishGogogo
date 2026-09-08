import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DataSource, EntityManager, In, LessThan, MoreThan } from 'typeorm';
import type { RailParticipant, RailRoomList, RailRoomRole, RailRoomSummary, RailRoomView } from '@stealth-reader/shared';
import { PlayRoomMember, RailCommand, RailRoom, RailRoomMember, User, UserBlock } from '../../../database/entities';
import { toBusinessLocalDate } from '../../platform/platform-time';
import { assertCommunityWritesEnabled, communityWritesEnabled } from '../community-write-gate';
import { boundedPayload, hash } from '../play/play.rules';
import { consumeRoomPasswordAttempt, consumeRoomPasswordMutation, hashRoomPassword, normalizeRoomPassword, roomPasswordFingerprint, verifyRoomPassword } from '../room-password';
import * as engine from './engine';
import { RailChatService } from './rail-chat.service';
import { RAIL_CATALOG, RAIL_RANKING_RULES, railInteger, railObject, railPerson, railUuid } from './rail.rules';

@Injectable()
export class RailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RailService.name);
  private timer?: ReturnType<typeof setInterval>;
  private sweeping = false;
  constructor(private readonly db: DataSource, private readonly chat: RailChatService) {}
  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => { void this.sweep(); }, 5000);
    this.timer.unref();
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }
  catalog() { return RAIL_CATALOG; }

  async list(userId: string): Promise<RailRoomList> {
    await this.activeUser(this.db.manager, userId);
    const blocked = await this.blockedIds(this.db.manager, userId);
    const rooms = await this.db.getRepository(RailRoom).createQueryBuilder('room').addSelect('room.passwordHash')
      .leftJoinAndSelect('room.host', 'host').where('room.mode = :mode', { mode: 'room' })
      .andWhere('room.status IN (:...statuses)', { statuses: ['waiting', 'running'] })
      .andWhere('room.expires_at > :now', { now: new Date() }).orderBy('room.createdAt', 'DESC').take(60).getMany();
    const all = rooms.length ? await this.db.getRepository(RailRoomMember).find({ where: { roomId: In(rooms.map((room) => room.id)) }, relations: ['user'] }) : [];
    const items = rooms.flatMap((room) => {
      const members = all.filter((member) => member.roomId === room.id);
      return members.some((member) => member.active && blocked.has(member.userId)) ? [] : [this.summary(room, members)];
    });
    const active = await this.db.getRepository(RailRoomMember).findOneBy({ userId, active: true });
    const activeRoom = active ? await this.db.getRepository(RailRoom).createQueryBuilder('room').addSelect('room.passwordHash').where('room.id = :id', { id: active.roomId }).getOne() : null;
    return { items, activeRoom: activeRoom ? this.summary(activeRoom, await this.members(this.db.manager, activeRoom.id)) : null };
  }

  async create(userId: string, raw: unknown): Promise<RailRoomView> {
    assertCommunityWritesEnabled();
    const input = railObject(raw, ['clientRequestId', 'mode', 'title', 'password', 'maxPlayers', 'botCount']);
    const clientRequestId = railUuid(input.clientRequestId);
    if (input.mode !== 'practice' && input.mode !== 'room') throw new BadRequestException({ code: 'RAIL_MODE_INVALID' });
    const mode = input.mode;
    const maxPlayers = railInteger(input.maxPlayers ?? 9, 3, 9, 'RAIL_CAPACITY_INVALID');
    const botCount = railInteger(input.botCount ?? (mode === 'practice' ? 2 : 0), mode === 'practice' ? 2 : 0, Math.min(8, maxPlayers - 1), 'RAIL_BOT_COUNT_INVALID');
    if (input.title !== undefined && (typeof input.title !== 'string' || input.title.length > 40 || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2060-\u206f]/u.test(input.title))) throw new BadRequestException({ code: 'RAIL_TITLE_INVALID' });
    const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim() : mode === 'practice' ? '轨道难题 · 个人练习' : '轨道难题 · 讨论室';
    const password = normalizeRoomPassword(input.password);
    await this.activeUser(this.db.manager, userId);
    const requestHash = hash({ mode, maxPlayers, botCount, title, password: roomPasswordFingerprint(password) });
    return this.db.transaction(async (manager) => {
      const user = await this.activeUser(manager, userId, true);
      const previous = await manager.getRepository(RailRoom).findOneBy({ creatorId: userId, clientRequestId });
      if (previous) {
        if (previous.requestHash !== requestHash) throw new ConflictException({ code: 'RAIL_IDEMPOTENCY_CONFLICT' });
        const room = await this.lockRoom(manager, previous.id);
        await this.advance(manager, room, new Date());
        return this.project(manager, room, user);
      }
      await this.ensureNoActiveRoom(manager, userId, 'participant');
      const now = new Date();
      if (await manager.getRepository(RailRoom).count({ where: { creatorId: userId, createdAt: MoreThan(new Date(now.getTime() - 86_400_000)) } }) >= 30) throw new HttpException({ code: 'RAIL_CREATE_LIMIT' }, 429);
      if (await manager.getRepository(RailRoom).count({ where: { status: In(['waiting', 'running']) } }) >= 100) throw new HttpException({ code: 'RAIL_SERVER_BUSY' }, 429);
      const passwordHash = await hashRoomPassword(password);
      const state = mode === 'practice' ? engine.create([{ id: user.publicId, displayName: railPerson(user).displayName, isBot: false }, ...this.bots(botCount)], now.getTime(), randomBytes(32).toString('hex')) : null;
      const room = manager.getRepository(RailRoom).create({
        creatorId: userId, hostUserId: userId, clientRequestId, requestHash, mode, title,
        passwordHash, maxPlayers, botCount, status: state ? 'running' : 'waiting', version: 1,
        engineState: state as unknown as Record<string, unknown> | null, rankingEligible: false,
        latestChatSequence: 0, createdAt: now, startedAt: state ? now : null,
        expiresAt: new Date(state ? state.endsAt : now.getTime() + 3_600_000), finishedAt: null, leaderboardDate: null,
      });
      await manager.getRepository(RailRoom).save(room);
      await manager.getRepository(RailRoomMember).insert(this.newMember(room.id, userId, 'participant', now, mode === 'practice'));
      return this.project(manager, room, user);
    });
  }

  async join(userId: string, raw: unknown): Promise<RailRoomView> {
    assertCommunityWritesEnabled();
    const input = railObject(raw, ['roomId', 'password', 'role']);
    const roomId = railUuid(input.roomId);
    const role = input.role ?? 'participant';
    if (role !== 'participant' && role !== 'spectator') throw new BadRequestException({ code: 'RAIL_ROLE_INVALID' });
    const password = normalizeRoomPassword(input.password);
    await this.activeUser(this.db.manager, userId);
    const preflight = await this.db.getRepository(RailRoom).createQueryBuilder('room').addSelect('room.passwordHash').where('room.id = :id AND room.mode = :mode', { id: roomId, mode: 'room' }).getOne();
    if (!preflight) throw new NotFoundException({ code: 'RAIL_ROOM_NOT_FOUND' });
    const beforeMembers = await this.members(this.db.manager, roomId);
    await this.assertNotBlocked(this.db.manager, userId, beforeMembers);
    const already = beforeMembers.find((member) => member.userId === userId && !member.leftAt);
    if (!already && preflight.passwordHash) {
      // Independent transaction: a failed password check must not roll its rate-limit receipt back.
      await consumeRoomPasswordAttempt(this.db, 'rail', userId, roomId);
      if (!await verifyRoomPassword(password, preflight.passwordHash)) throw new ForbiddenException({ code: 'RAIL_PASSWORD_REQUIRED', message: '房间密码不正确。' });
    }
    return this.db.transaction(async (manager) => {
      const user = await this.activeUser(manager, userId, true);
      await this.ensureNoActiveRoom(manager, userId, role, roomId);
      const room = await this.lockRoom(manager, roomId);
      const now = new Date();
      await this.advance(manager, room, now);
      const members = await this.members(manager, roomId);
      await this.assertNotBlocked(manager, userId, members);
      const existing = members.find((member) => member.userId === userId);
      if (existing && !existing.leftAt) return this.project(manager, room, user);
      if (room.passwordHash !== preflight.passwordHash) throw new ConflictException({ code: 'RAIL_PASSWORD_CHANGED', message: '房间密码已更新，请重新加入。' });
      if (room.mode !== 'room') throw new NotFoundException({ code: 'RAIL_ROOM_NOT_FOUND' });
      if (existing) throw new ConflictException({ code: 'RAIL_ROOM_LEFT' });
      if ((role === 'participant' && room.status !== 'waiting') || (role === 'spectator' && !['waiting', 'running'].includes(room.status))) throw new ConflictException({ code: 'RAIL_ROOM_NOT_JOINABLE' });
      const active = members.filter((member) => member.active);
      if (role === 'participant' && active.filter((member) => member.role === 'participant').length + room.botCount >= room.maxPlayers) throw new ConflictException({ code: 'RAIL_ROOM_FULL' });
      if (role === 'spectator' && active.filter((member) => member.role === 'spectator').length >= 20) throw new ConflictException({ code: 'RAIL_SPECTATORS_FULL' });
      await manager.getRepository(RailRoomMember).insert(this.newMember(roomId, userId, role, now));
      room.version += 1;
      await manager.getRepository(RailRoom).save(room);
      return this.project(manager, room, user);
    });
  }

  async get(userId: string, roomId: string): Promise<RailRoomView> {
    return this.inRoom(userId, roomId, false, async (manager, room, user) => {
      if (communityWritesEnabled()) await this.advance(manager, room, new Date());
      return this.project(manager, room, user);
    });
  }
  async ready(userId: string, roomId: string, raw: unknown): Promise<RailRoomView> {
    const input = railObject(raw, ['ready']);
    if (typeof input.ready !== 'boolean') throw new BadRequestException({ code: 'RAIL_READY_INVALID' });
    return this.inRoom(userId, roomId, true, async (manager, room, user, member) => {
      await this.advance(manager, room, new Date());
      this.waitingParticipant(room, member);
      member.ready = input.ready as boolean;
      await manager.getRepository(RailRoomMember).save(member);
      room.version += 1;
      await manager.getRepository(RailRoom).save(room);
      return this.project(manager, room, user);
    });
  }
  async start(userId: string, roomId: string): Promise<RailRoomView> {
    return this.inRoom(userId, roomId, true, async (manager, room, user, member) => {
      const now = new Date();
      await this.advance(manager, room, now);
      this.host(room, member);
      if (room.status === 'running') return this.project(manager, room, user);
      this.waitingParticipant(room, member);
      const members = (await this.members(manager, room.id)).filter((entry) => entry.active && entry.role === 'participant');
      if (members.length + room.botCount < 3 || members.length + room.botCount > room.maxPlayers || members.some((entry) => !entry.ready || entry.user.accountStatus !== 'active')) throw new ConflictException({ code: 'RAIL_PLAYERS_NOT_READY' });
      for (const entry of members) await this.assertNotBlocked(manager, entry.userId, members);
      const state = engine.create([...members.map((entry) => ({ id: entry.user.publicId, displayName: railPerson(entry.user).displayName, isBot: false })), ...this.bots(room.botCount)], now.getTime(), randomBytes(32).toString('hex'));
      room.engineState = state as unknown as Record<string, unknown>;
      room.status = 'running'; room.startedAt = now; room.expiresAt = new Date(state.endsAt); room.version += 1;
      room.rankingEligible = room.mode === 'room' && members.length >= 3 && room.botCount === 0;
      await manager.getRepository(RailRoom).save(room);
      return this.project(manager, room, user);
    });
  }
  async setBots(userId: string, roomId: string, raw: unknown): Promise<RailRoomView> {
    const input = railObject(raw, ['count', 'expectedVersion']);
    const count = railInteger(input.count, 0, 8, 'RAIL_BOT_COUNT_INVALID');
    const expectedVersion = railInteger(input.expectedVersion, 1, 2_147_483_647);
    return this.inRoom(userId, roomId, true, async (manager, room, user, member) => {
      await this.advance(manager, room, new Date());
      this.host(room, member); this.waitingParticipant(room, member); this.version(room, expectedVersion);
      const participants = (await this.members(manager, room.id)).filter((entry) => entry.active && entry.role === 'participant');
      if (participants.length + count > room.maxPlayers) throw new ConflictException({ code: 'RAIL_ROOM_FULL' });
      room.botCount = count; room.version += 1;
      await manager.getRepository(RailRoomMember).update({ roomId: room.id, active: true, role: 'participant' }, { ready: false });
      await manager.getRepository(RailRoom).save(room);
      return this.project(manager, room, user);
    });
  }
  async setPassword(userId: string, roomId: string, raw: unknown): Promise<RailRoomView> {
    assertCommunityWritesEnabled();
    const input = railObject(raw, ['password', 'expectedVersion']);
    if (typeof input.password !== 'string') throw new BadRequestException({ code: 'RAIL_REQUEST_INVALID' });
    const expectedVersion = railInteger(input.expectedVersion, 1, 2_147_483_647);
    const password = normalizeRoomPassword(input.password);
    // Check membership/host before expensive hashing, then recheck under the actual write lock.
    await this.inRoom(userId, roomId, false, async (_manager, room, _user, member) => { this.host(room, member); this.waitingParticipant(room, member); this.version(room, expectedVersion); });
    await consumeRoomPasswordMutation(this.db, 'rail', userId, railUuid(roomId));
    const passwordHash = await hashRoomPassword(password);
    return this.inRoom(userId, roomId, true, async (manager, room, user, member) => {
      await this.advance(manager, room, new Date());
      this.host(room, member); this.waitingParticipant(room, member); this.version(room, expectedVersion);
      room.passwordHash = passwordHash; room.version += 1;
      await manager.getRepository(RailRoom).save(room);
      return this.project(manager, room, user);
    });
  }
  async action(userId: string, roomId: string, raw: unknown): Promise<RailRoomView> {
    const input = railObject(raw, ['actionId', 'sequence', 'kind', 'payload']);
    const actionId = railUuid(input.actionId);
    const sequence = railInteger(input.sequence, 1, 200, 'RAIL_ACTION_INVALID');
    if (typeof input.kind !== 'string' || input.kind.length > 20) throw new BadRequestException({ code: 'RAIL_ACTION_INVALID' });
    const payload = railObject(input.payload);
    boundedPayload(payload);
    const requestHash = hash({ sequence, kind: input.kind, payload });
    return this.inRoom(userId, roomId, true, async (manager, room, user, member) => {
      const now = new Date();
      if (member.role !== 'participant' || member.leftAt) throw new ForbiddenException({ code: 'RAIL_PARTICIPANT_REQUIRED' });
      const previous = await manager.getRepository(RailCommand).findOneBy({ roomId: room.id, userId, actionId });
      if (previous) {
        if (previous.requestHash !== requestHash) throw new ConflictException({ code: 'RAIL_IDEMPOTENCY_CONFLICT' });
        await this.advance(manager, room, now);
        return this.project(manager, room, user);
      }
      if (sequence !== member.lastSequence + 1) throw new ConflictException({ code: 'RAIL_SEQUENCE_CONFLICT', nextSequence: member.lastSequence + 1 });
      if (room.status !== 'running' || !member.active || !room.engineState) throw new ConflictException({ code: 'RAIL_ROOM_NOT_RUNNING' });
      if (!member.actionWindowAt || now.getTime() - member.actionWindowAt.getTime() >= 1000) { member.actionWindowAt = now; member.actionWindowCount = 0; }
      if (member.actionWindowCount >= 8) throw new HttpException({ code: 'RAIL_ACTION_RATE_LIMIT' }, 429);
      let state: engine.RailEngineState;
      try { state = engine.act(room.engineState as unknown as engine.RailEngineState, user.publicId, input.kind as string, payload, now.getTime()); }
      catch (error) { if (error instanceof engine.RailEngineError) throw new BadRequestException({ code: `RAIL_${error.code}` }); throw error; }
      member.lastSequence = sequence; member.actionWindowCount += 1;
      await manager.getRepository(RailRoomMember).save(member);
      await manager.getRepository(RailCommand).insert({ roomId: room.id, userId, actionId, sequence, requestHash, createdAt: now });
      room.engineState = state as unknown as Record<string, unknown>; room.version += 1;
      await this.finishIfNeeded(manager, room, now);
      await manager.getRepository(RailRoom).save(room);
      return this.project(manager, room, user);
    });
  }
  async leave(userId: string, roomId: string): Promise<RailRoomView> {
    return this.inRoom(userId, roomId, true, async (manager, room, user, member) => {
      const now = new Date();
      await this.advance(manager, room, now);
      if (!member.active || ['finished', 'closed'].includes(room.status)) return this.project(manager, room, user);
      member.active = false; member.leftAt = now; member.ready = false;
      await manager.getRepository(RailRoomMember).save(member);
      if (room.status === 'running' && room.engineState && member.role === 'participant') {
        room.engineState = engine.leave(room.engineState as unknown as engine.RailEngineState, user.publicId, now.getTime()) as unknown as Record<string, unknown>;
        await this.finishIfNeeded(manager, room, now);
      }
      const participants = (await this.members(manager, room.id)).filter((entry) => entry.active && entry.role === 'participant');
      if (room.hostUserId === userId) room.hostUserId = participants[0]?.userId ?? null;
      if (!participants.length && room.status === 'waiting') {
        room.status = 'closed'; room.finishedAt = now;
        await manager.getRepository(RailRoomMember).update({ roomId: room.id, active: true }, { active: false });
      }
      room.version += 1;
      await manager.getRepository(RailRoom).save(room);
      return this.project(manager, room, user);
    });
  }

  async sweep(): Promise<void> {
    if (this.sweeping || !communityWritesEnabled()) return;
    this.sweeping = true;
    try {
      const rooms = await this.db.getRepository(RailRoom).find({ where: [{ status: 'running' }, { status: 'waiting', expiresAt: LessThan(new Date()) }], order: { expiresAt: 'ASC' }, take: 100 });
      for (const row of rooms) {
        try { await this.db.transaction(async (manager) => { const room = await this.lockRoom(manager, row.id); await this.advance(manager, room, new Date()); }); }
        catch { this.logger.warn('Rail phase update deferred; retained for retry.'); }
      }
    } catch { this.logger.warn('Rail room scan deferred; retained for retry.'); }
    finally { this.sweeping = false; }
  }
  private async inRoom<T>(userId: string, rawId: string, write: boolean, work: (manager: EntityManager, room: RailRoom, user: User, member: RailRoomMember) => Promise<T>): Promise<T> {
    if (write) assertCommunityWritesEnabled();
    const roomId = railUuid(rawId);
    return this.db.transaction(async (manager) => {
      const user = await this.activeUser(manager, userId, true);
      if (!await manager.getRepository(RailRoomMember).exist({ where: { roomId, userId } })) throw new NotFoundException({ code: 'RAIL_ROOM_NOT_FOUND' });
      const room = await this.lockRoom(manager, roomId);
      const member = await manager.getRepository(RailRoomMember).findOneBy({ roomId, userId });
      if (!member) throw new NotFoundException({ code: 'RAIL_ROOM_NOT_FOUND' });
      return work(manager, room, user, member);
    });
  }
  private async activeUser(manager: EntityManager, userId: string, lock = false): Promise<User> {
    const query = manager.getRepository(User).createQueryBuilder('user').where('user.id = :id', { id: userId });
    if (lock) query.setLock('for_no_key_update');
    const user = await query.getOne();
    if (!user || user.accountStatus !== 'active') throw new UnauthorizedException({ code: 'RAIL_ACTIVE_ACCOUNT_REQUIRED' });
    return user;
  }
  private async lockRoom(manager: EntityManager, roomId: string): Promise<RailRoom> {
    const room = await manager.getRepository(RailRoom).createQueryBuilder('room').addSelect(['room.engineState', 'room.passwordHash']).where('room.id = :id', { id: roomId }).setLock('pessimistic_write').getOne();
    if (!room) throw new NotFoundException({ code: 'RAIL_ROOM_NOT_FOUND' });
    return room;
  }
  private members(manager: EntityManager, roomId: string) {
    return manager.getRepository(RailRoomMember).find({ where: { roomId }, relations: ['user'], order: { joinedAt: 'ASC', userId: 'ASC' } });
  }
  private async blockedIds(manager: EntityManager, userId: string): Promise<Set<string>> {
    const rows = await manager.getRepository(UserBlock).find({ where: [{ blockerId: userId }, { blockedId: userId }] });
    return new Set(rows.map((row) => row.blockerId === userId ? row.blockedId : row.blockerId));
  }
  private async assertNotBlocked(manager: EntityManager, userId: string, members: RailRoomMember[]): Promise<void> {
    const blocked = await this.blockedIds(manager, userId);
    if (members.some((member) => member.active && blocked.has(member.userId))) throw new NotFoundException({ code: 'RAIL_ROOM_NOT_FOUND' });
  }
  private async ensureNoActiveRoom(manager: EntityManager, userId: string, role: RailRoomRole, exceptId?: string): Promise<void> {
    if (role === 'participant') {
      const play = await manager.getRepository(PlayRoomMember).findOneBy({ userId, active: true });
      if (play) throw new ConflictException({ code: 'RAIL_ACTIVE_PLAY_ROOM', roomId: play.roomId });
    }
    const current = await manager.getRepository(RailRoomMember).findOneBy({ userId, active: true });
    if (!current || current.roomId === exceptId) return;
    const room = await this.lockRoom(manager, current.roomId);
    await this.advance(manager, room, new Date());
    if (await manager.getRepository(RailRoomMember).exist({ where: { roomId: room.id, userId, active: true } })) throw new ConflictException({ code: 'RAIL_ACTIVE_ROOM', roomId: room.id });
  }
  private waitingParticipant(room: RailRoom, member: RailRoomMember): void {
    if (member.role !== 'participant' || !member.active || member.leftAt) throw new ForbiddenException({ code: 'RAIL_PARTICIPANT_REQUIRED' });
    if (room.status !== 'waiting') throw new ConflictException({ code: 'RAIL_ROOM_NOT_WAITING' });
  }
  private host(room: RailRoom, member: RailRoomMember): void {
    if (room.hostUserId !== member.userId || !member.active || member.role !== 'participant' || member.leftAt) throw new ForbiddenException({ code: 'RAIL_HOST_REQUIRED' });
  }
  private version(room: RailRoom, expected: number): void {
    if (room.version !== expected) throw new ConflictException({ code: 'RAIL_VERSION_CONFLICT', version: room.version });
  }
  private bots(count: number): RailParticipant[] {
    return Array.from({ length: count }, (_, index) => ({ id: `AI0${index + 1}`, displayName: `AI0${index + 1}`, isBot: true }));
  }
  private newMember(roomId: string, userId: string, role: RailRoomRole, joinedAt: Date, ready = false) {
    return { roomId, userId, role, ready, active: true, lastSequence: 0, actionWindowAt: null, actionWindowCount: 0, joinedAt, leftAt: null };
  }
  private async advance(manager: EntityManager, room: RailRoom, now: Date): Promise<void> {
    if (room.status === 'running' && room.engineState) {
      let state = room.engineState as unknown as engine.RailEngineState;
      const members = await this.members(manager, room.id);
      for (const player of state.players.filter((entry) => !entry.isBot && !entry.left)) {
        const member = members.find((entry) => entry.user.publicId === player.id);
        if (!member || member.leftAt || member.user.accountStatus !== 'active') state = engine.leave(state, player.id, now.getTime());
      }
      room.engineState = engine.advance(state, now.getTime()) as unknown as Record<string, unknown>;
      room.version += 1;
      await this.finishIfNeeded(manager, room, now);
      await manager.getRepository(RailRoom).save(room);
    } else if (room.status === 'waiting' && room.expiresAt.getTime() <= now.getTime()) {
      room.status = 'closed'; room.finishedAt = now; room.version += 1;
      await manager.getRepository(RailRoomMember).update({ roomId: room.id, active: true }, { active: false });
      await manager.getRepository(RailRoom).save(room);
    }
  }
  private async finishIfNeeded(manager: EntityManager, room: RailRoom, now: Date): Promise<void> {
    if (room.status !== 'running' || !room.engineState) return;
    const finished = engine.result(room.engineState as unknown as engine.RailEngineState);
    if (!finished) return;
    room.status = 'finished'; room.finishedAt = now; room.leaderboardDate = toBusinessLocalDate(now);
    const members = (await this.members(manager, room.id)).sort((a, b) => a.userId.localeCompare(b.userId));
    const records = new Map(finished.players.map((player) => [player.id, player]));
    for (const member of members) {
      const record = records.get(member.user.publicId);
      member.active = false;
      await manager.getRepository(RailRoomMember).save(member);
      if (member.role !== 'participant' || member.leftAt || member.user.accountStatus !== 'active' || !record?.eligible || record.isBot) continue;
      const ranked = room.rankingEligible && room.mode === 'room' && room.botCount === 0 && finished.players.length >= 3 && finished.players.every((player) => !player.isBot);
      await manager.query(`INSERT INTO rail_player_stats (user_id, completed_games, survived, eligible_rounds, demon_total, demon_mvp_count, ranked_games)
        VALUES ($1, 1, $2, $3, $4, $5, $6) ON CONFLICT (user_id) DO UPDATE SET
        completed_games = rail_player_stats.completed_games + 1, survived = rail_player_stats.survived + EXCLUDED.survived,
        eligible_rounds = rail_player_stats.eligible_rounds + EXCLUDED.eligible_rounds, demon_total = rail_player_stats.demon_total + EXCLUDED.demon_total,
        demon_mvp_count = rail_player_stats.demon_mvp_count + EXCLUDED.demon_mvp_count, ranked_games = rail_player_stats.ranked_games + EXCLUDED.ranked_games`,
      [member.userId, record.survived, record.eligibleRounds, record.demonTotal, finished.demonMvpIds.includes(record.id) ? 1 : 0, ranked ? 1 : 0]);
      if (!ranked || record.rateBasisPoints <= 0) continue;
      await manager.query(`INSERT INTO rail_daily_scores (service_date, user_id, rate_basis_points, survived, eligible_rounds, demon_total, room_id, achieved_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (service_date, user_id) DO UPDATE SET
        rate_basis_points = EXCLUDED.rate_basis_points, survived = EXCLUDED.survived, eligible_rounds = EXCLUDED.eligible_rounds,
        demon_total = EXCLUDED.demon_total, room_id = EXCLUDED.room_id, achieved_at = EXCLUDED.achieved_at
        WHERE rail_daily_scores.rate_basis_points < EXCLUDED.rate_basis_points`,
      [room.leaderboardDate, member.userId, record.rateBasisPoints, record.survived, record.eligibleRounds, record.demonTotal, room.id, now]);
    }
  }
  private summary(room: RailRoom, members: RailRoomMember[]): RailRoomSummary {
    const host = room.host ?? members.find((member) => member.userId === room.hostUserId)?.user;
    return {
      id: room.id, title: room.title, mode: room.mode, hasPassword: Boolean(room.passwordHash), status: room.status,
      host: host ? railPerson(host) : null,
      playerCount: members.filter((member) => member.role === 'participant' && !member.leftAt).length,
      botCount: room.botCount, spectatorCount: members.filter((member) => member.role === 'spectator' && !member.leftAt).length,
      maxPlayers: room.maxPlayers, createdAt: room.createdAt.toISOString(),
    };
  }
  private async project(manager: EntityManager, room: RailRoom, user: User): Promise<RailRoomView> {
    const members = await this.members(manager, room.id);
    const me = members.find((member) => member.userId === user.id);
    if (!me) throw new NotFoundException({ code: 'RAIL_ROOM_NOT_FOUND' });
    const now = new Date();
    const chat = this.chat.availability();
    const game = room.engineState && !me.leftAt ? engine.view(room.engineState as unknown as engine.RailEngineState, me.role === 'participant' ? user.publicId : null, now.getTime()) : null;
    if (game) {
      // Engine snapshots retain old seating identities. Display names always come from current account state.
      const names = new Map(members.map((member) => [member.user.publicId, railPerson(member.user).displayName]));
      for (const player of game.players) if (!player.isBot) player.displayName = names.get(player.id) ?? '已离开成员';
      if (game.result) for (const player of game.result.players) if (!player.isBot) player.displayName = names.get(player.id) ?? '已离开成员';
    }
    return {
      ...this.summary(room, members), version: room.version,
      members: members.map((member) => ({ ...railPerson(member.user), role: member.role, ready: member.ready, left: Boolean(member.leftAt), joinedAt: member.joinedAt.toISOString() })),
      bots: this.bots(room.botCount),
      me: { publicId: user.publicId, role: me.role, ready: me.ready, left: Boolean(me.leftAt), isHost: room.hostUserId === user.id, nextSequence: me.lastSequence + 1 },
      game, serverNow: now.toISOString(), expiresAt: room.expiresAt.toISOString(), leaderboardDate: room.leaderboardDate,
      rankingEligible: room.rankingEligible, rankingNotice: RAIL_RANKING_RULES,
      chatEnabled: chat.chatEnabled, chatCanWrite: chat.chatCanWrite && me.active && !me.leftAt && ['waiting', 'running'].includes(room.status) && now.getTime() < room.expiresAt.getTime(),
    };
  }
}
