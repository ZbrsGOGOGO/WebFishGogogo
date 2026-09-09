import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnApplicationBootstrap, OnModuleDestroy, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DataSource, In } from 'typeorm';
import { acceptPaperArenaInput, createPaperArenaEngine, finishPaperArenaAtDeadline, PAPER_ARENA_RULES, PAPER_ARENA_PROTOCOL_VERSION, PAPER_ARENA_MAP_VERSION, resetPaperArenaInput, stepPaperArena, type PaperArenaEngine, type PaperArenaInput, type PaperArenaRoomSummary, type PaperArenaRoomView } from '@stealth-reader/shared';
import { AuthSession, User, UserBlock } from '../../../database/entities';
import { AuthRateLimitService } from '../../auth/auth-rate-limit.service';
import { assertCommunityWritesEnabled, communityWritesEnabled } from '../community-write-gate';
import { consumeRoomPasswordAttempt, hashRoomPassword, normalizeRoomPassword, roomPasswordFingerprint, verifyRoomPassword } from '../room-password';

interface Membership { playerId: string; userId: string; admissionId: string; disconnectedAt: number; connectionId: string | null }
interface Room {
  id: string; name: string; maxPlayers: number; targetKills: number; passwordHash: string | null;
  status: 'waiting' | 'running' | 'finished'; hostUserId: string | null; members: Map<string, Membership>;
  engine: PaperArenaEngine; expiresAt: number; startedAt: number | null; lastTickAt: number; requestId: string; requestHash: string; creatorId: string;
}
export interface PaperPrincipal { userId: string; sessionId: string; roomId: string; playerId: string; admissionId: string; expiresAt: number }
const MAX_ROOMS = 24;
const RULES = '红蓝团队击败赛，五种独立弹药武器、瞄准/冲刺/跳跃由服务器判定；太刀正面格挡消耗体力并单次返弹。空位及断线由 AI 接替，重连不补血补弹。阵亡 2.5 秒后安全随机复活，保护 1.5 秒（开火取消）。收起只停止本人输入，对局不停；最长 15 分钟。临时房间重启后结束，不计官方排行榜、办公币或成就。原地图木箱保持静态，补给与钩索未开放。';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function paperArenaEnabled(): boolean { return process.env.FEATURE_PAPER_ARENA_ENABLED === 'true'; }
function invalid(): never { throw new BadRequestException({ code: 'PAPER_INPUT_INVALID', message: '房间参数无效。' }); }
export function paperObject(raw: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) return invalid();
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(value, key))) return invalid();
  return value;
}
function uuid(raw: unknown): string { if (typeof raw !== 'string' || !UUID.test(raw)) return invalid(); return raw.toLowerCase(); }
function password(raw: unknown): string | null {
  if (typeof raw !== 'string' || [...raw].length > 32) return invalid();
  return normalizeRoomPassword(raw);
}

/** A single bounded authoritative process. No client scores, no wallet writes. */
@Injectable()
export class PaperArenaService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly rooms = new Map<string, Room>();
  private readonly currentRoom = new Map<string, string>();
  private readonly tickets = new Map<string, PaperPrincipal>();
  private readonly pending = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private timer: NodeJS.Timeout | null = null;
  constructor(private readonly db: DataSource) {}
  onApplicationBootstrap(): void {
    if (!paperArenaEnabled()) return;
    this.timer = setInterval(() => this.tick(), PAPER_ARENA_RULES.tickMs); this.timer.unref?.();
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); this.timer = null; this.rooms.clear(); this.currentRoom.clear(); this.tickets.clear(); this.listeners.clear(); }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private enabled(write = false): void { if (!paperArenaEnabled()) throw new NotFoundException({ code: 'PAPER_DISABLED', message: '纸上突围联机暂未开放。' }); if (write) assertCommunityWritesEnabled(); }
  private async active(userId: string): Promise<User> {
    const user = await this.db.getRepository(User).findOneBy({ id: userId });
    if (!user || user.accountStatus !== 'active') throw new UnauthorizedException({ code: 'INVALID_SESSION' }); return user;
  }
  private async exclusive<T>(userId: string, work: () => Promise<T>): Promise<T> {
    if (this.pending.has(userId)) throw new ConflictException({ code: 'PAPER_OPERATION_PENDING', message: '上一项操作仍在处理，请稍后重试。' });
    this.pending.add(userId); try { return await work(); } finally { this.pending.delete(userId); }
  }
  private async budget(userId: string, operation: string, limit: number, windowMs = 60_000): Promise<void> {
    await new AuthRateLimitService(this.db).consume([{ scope: `paper-arena:${operation}`, dimension: userId, limit, windowMs, blockMs: windowMs }], new Date());
  }
  private async blocked(userId: string): Promise<Set<string>> {
    const rows = await this.db.getRepository(UserBlock).find({ where: [{ blockerId: userId }, { blockedId: userId }] });
    return new Set(rows.map(row => row.blockerId === userId ? row.blockedId : row.blockerId));
  }
  private room(id: string): Room {
    const room = this.rooms.get(uuid(id));
    if (!room || room.expiresAt <= Date.now()) throw new NotFoundException({ code: 'PAPER_ROOM_NOT_FOUND', message: '房间已结束或不存在，请返回列表。' }); return room;
  }
  private member(userId: string, id: string): { room: Room; member: Membership } {
    const room = this.room(id), member = room.members.get(userId);
    if (!member) throw new NotFoundException({ code: 'PAPER_ROOM_NOT_FOUND', message: '请先加入房间。' }); return { room, member };
  }
  private summary(room: Room): PaperArenaRoomSummary {
    return { id: room.id, name: room.name, maxPlayers: room.maxPlayers, targetKills: room.targetKills, requiresPassword: room.passwordHash !== null,
      status: room.status, humans: room.members.size, expiresAt: room.expiresAt };
  }
  view(userId: string, roomId: string): PaperArenaRoomView {
    const { room, member } = this.member(userId, roomId);
    return { ...this.summary(room), protocolVersion: PAPER_ARENA_PROTOCOL_VERSION, mapVersion: PAPER_ARENA_MAP_VERSION, hostPlayerId: room.hostUserId ? room.members.get(room.hostUserId)?.playerId ?? null : null,
      myPlayerId: member.playerId, serverNow: Date.now(), rules: RULES,
      players: room.engine.players.map(player => ({ ...player, arsenal: Object.fromEntries(Object.entries(player.arsenal).map(([id, ammo]) => [id, { ...ammo }])) as typeof player.arsenal })),
      game: { tick: room.engine.tick, elapsedMs: room.engine.elapsedMs, scores: { ...room.engine.scores }, winner: room.engine.winner, shots: room.engine.shots.map(shot => ({ ...shot })) } };
  }
  async list(userId: string) {
    this.enabled(); await this.active(userId); const blocked = await this.blocked(userId);
    return { enabled: true, currentRoomId: this.currentRoom.get(userId) ?? null,
      rooms: [...this.rooms.values()].filter(room => room.expiresAt > Date.now() && ![...room.members.keys()].some(id => blocked.has(id))).map(room => this.summary(room)) };
  }
  async get(userId: string, roomId: string): Promise<PaperArenaRoomView> { this.enabled(); await this.active(userId); return this.view(userId, roomId); }
  async create(userId: string, raw: unknown): Promise<PaperArenaRoomView> {
    this.enabled(true);
    const value = paperObject(raw, ['requestId', 'name', 'maxPlayers', 'targetKills', 'password']);
    const requestId = uuid(value.requestId), secret = password(value.password);
    if (typeof value.name !== 'string' || value.name.trim().length < 1 || [...value.name].length > 32 || /[\p{Cc}\p{Cf}]/u.test(value.name)) return invalid();
    const capacity = value.maxPlayers, target = value.targetKills;
    if (typeof capacity !== 'number' || !Number.isInteger(capacity) || capacity < 4 || capacity > 8 || typeof target !== 'number' || !Number.isInteger(target) || target < 20 || target > 100) return invalid();
    const name = value.name.trim();
    const requestHash = createHash('sha256').update(JSON.stringify([name, capacity, target, roomPasswordFingerprint(secret)])).digest('hex');
    return this.exclusive(userId, async () => {
      const user = await this.active(userId);
      const replay = [...this.rooms.values()].find(room => room.creatorId === userId && room.requestId === requestId);
      if (replay) {
        if (replay.requestHash !== requestHash || !replay.members.has(userId)) throw new ConflictException({ code: 'PAPER_CREATE_CONFLICT', message: '此建房请求已使用，请刷新房间列表。' });
        return this.view(userId, replay.id);
      }
      if (this.currentRoom.has(userId)) throw new ConflictException({ code: 'PAPER_ALREADY_JOINED', message: '请先退出当前房间。' });
      if (this.rooms.size >= MAX_ROOMS) throw new ConflictException({ code: 'PAPER_CAPACITY', message: '当前房间较多，请加入已有房间。' });
      await this.budget(userId, 'create', 3, 600_000);
      const passwordHash = await hashRoomPassword(secret);
      await this.active(userId); this.enabled(true);
      // No await between the final global capacity check and insertion.
      if (this.rooms.size >= MAX_ROOMS) throw new ConflictException({ code: 'PAPER_CAPACITY' });
      const now = Date.now(), id = randomUUID();
      const room: Room = { id, name, maxPlayers: capacity, targetKills: target, passwordHash, status: 'waiting', hostUserId: userId, members: new Map(),
        engine: createPaperArenaEngine(capacity, target, randomBytes(4).readUInt32LE()), expiresAt: now + 30 * 60_000, startedAt: null, lastTickAt: now, requestId, requestHash, creatorId: userId };
      this.rooms.set(id, room); this.admit(room, user); return this.view(userId, id);
    });
  }
  async join(userId: string, raw: unknown): Promise<PaperArenaRoomView> {
    this.enabled(true); const value = paperObject(raw, ['roomId', 'password']), id = uuid(value.roomId), secret = password(value.password);
    return this.exclusive(userId, async () => {
      const user = await this.active(userId), room = this.room(id);
      if (room.members.has(userId)) return this.view(userId, id);
      if (this.currentRoom.has(userId)) throw new ConflictException({ code: 'PAPER_ALREADY_JOINED', message: '请先退出当前房间。' });
      const denied = await this.blocked(userId);
      if ([...room.members.keys()].some(memberId => denied.has(memberId))) throw new NotFoundException({ code: 'PAPER_ROOM_NOT_FOUND' });
      await this.budget(userId, 'join', 12);
      if (room.passwordHash) await consumeRoomPasswordAttempt(this.db, 'paper', userId, room.id);
      if (!(await verifyRoomPassword(secret, room.passwordHash))) throw new ForbiddenException({ code: 'PAPER_PASSWORD_INVALID', message: '房间密码不正确。' });
      await this.active(userId); const freshBlocked = await this.blocked(userId); this.enabled(true);
      if (this.rooms.get(id) !== room || room.expiresAt <= Date.now() || [...room.members.keys()].some(memberId => freshBlocked.has(memberId))) throw new NotFoundException({ code: 'PAPER_ROOM_NOT_FOUND' });
      if (room.status === 'finished' || room.members.size >= room.maxPlayers) throw new ConflictException({ code: 'PAPER_ROOM_FULL', message: '房间已结束或已满。' });
      this.admit(room, user); return this.view(userId, id);
    });
  }
  private admit(room: Room, user: User): void {
    const counts = { red: 0, blue: 0 };
    for (const player of room.engine.players) if (!player.isBot) counts[player.team]++;
    const available = room.engine.players.filter(player => player.isBot);
    available.sort((a, b) => counts[a.team] - counts[b.team]);
    const player = available[0];
    if (!player) throw new ConflictException({ code: 'PAPER_ROOM_FULL' });
    player.name = user.displayName?.slice(0, 64) || '同事'; player.publicId = user.publicId; player.isBot = false; player.connected = false;
    player.kills = 0; player.deaths = 0;
    resetPaperArenaInput(room.engine, player.id);
    room.members.set(user.id, { playerId: player.id, userId: user.id, admissionId: randomUUID(), disconnectedAt: Date.now(), connectionId: null }); this.currentRoom.set(user.id, room.id);
  }
  async start(userId: string, roomId: string, raw: unknown): Promise<PaperArenaRoomView> {
    paperObject(raw, []); this.enabled(true); await this.active(userId); this.enabled(true);
    const { room } = this.member(userId, roomId);
    if (room.hostUserId !== userId) throw new ForbiddenException({ code: 'PAPER_HOST_REQUIRED', message: '只有房主可以开始。' });
    if (room.status === 'running') return this.view(userId, roomId);
    if (room.status !== 'waiting') throw new ConflictException({ code: 'PAPER_FINISHED' });
    room.status = 'running'; room.startedAt = room.lastTickAt = Date.now(); room.expiresAt = room.startedAt + PAPER_ARENA_RULES.maxDurationMs + 5000;
    return this.view(userId, roomId);
  }
  async team(userId: string, roomId: string, raw: unknown): Promise<PaperArenaRoomView> {
    const value = paperObject(raw, ['team']); if (value.team !== 'red' && value.team !== 'blue') return invalid();
    this.enabled(true); await this.active(userId); this.enabled(true); const { room, member } = this.member(userId, roomId);
    if (room.status !== 'waiting') throw new ConflictException({ code: 'PAPER_ALREADY_RUNNING', message: '开局后不能换队。' });
    const player = room.engine.players.find(actor => actor.id === member.playerId)!;
    if (player.team === value.team) return this.view(userId, roomId);
    const replacement = room.engine.players.find(actor => actor.team === value.team && actor.isBot);
    if (!replacement) throw new ConflictException({ code: 'PAPER_TEAM_FULL', message: '该队席位已满。' });
    // Swap identities, not capacities; each team retains its bounded seat count.
    const old = { name: player.name, publicId: player.publicId, connected: player.connected };
    player.name = `协作 AI ${player.id.slice(5)}`; player.publicId = null; player.connected = false; player.isBot = true;
    Object.assign(replacement, old, { isBot: false }); member.playerId = replacement.id;
    resetPaperArenaInput(room.engine, player.id); resetPaperArenaInput(room.engine, replacement.id);
    return this.view(userId, roomId);
  }
  async leave(userId: string, roomId: string, raw: unknown): Promise<{ left: true }> {
    paperObject(raw, []); this.enabled(); await this.active(userId);
    const room = this.rooms.get(uuid(roomId)); if (room) this.remove(room, userId); return { left: true };
  }
  private remove(room: Room, userId: string): void {
    const member = room.members.get(userId); if (!member) return;
    const player = room.engine.players.find(actor => actor.id === member.playerId)!;
    player.name = `协作 AI ${player.id.slice(5)}`; player.publicId = null; player.isBot = true; player.connected = false;
    resetPaperArenaInput(room.engine, player.id); room.members.delete(userId); this.currentRoom.delete(userId);
    // Leaving ends this admission, even if the same account immediately rejoins.
    for (const [key, ticket] of this.tickets) if (ticket.userId === userId && ticket.roomId === room.id) this.tickets.delete(key);
    if (room.hostUserId === userId) room.hostUserId = room.members.keys().next().value ?? null;
    if (room.members.size === 0) this.rooms.delete(room.id);
  }
  async ticket(userId: string, sessionId: string, roomId: string, raw: unknown) {
    paperObject(raw, []); this.enabled(true); await this.active(userId); await this.budget(userId, 'ticket', 20);
    this.enabled(true);
    const { room, member } = this.member(userId, roomId), now = Date.now();
    for (const [key, ticket] of this.tickets) if (ticket.expiresAt <= now || ticket.userId === userId) this.tickets.delete(key);
    if (this.tickets.size >= 256) throw new ConflictException({ code: 'PAPER_CAPACITY' });
    const ticket = randomBytes(32).toString('base64url'), expiresAt = now + 15_000;
    this.tickets.set(createHash('sha256').update(ticket).digest('hex'), { userId, sessionId, roomId: room.id, playerId: member.playerId, admissionId: member.admissionId, expiresAt });
    return { ticket, expiresAt, wsPath: '/ws/paper-arena', protocolVersion: PAPER_ARENA_PROTOCOL_VERSION, mapVersion: PAPER_ARENA_MAP_VERSION };
  }
  async consumeTicket(raw: unknown): Promise<PaperPrincipal> {
    this.enabled(true);
    if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(raw)) throw new UnauthorizedException();
    const key = createHash('sha256').update(raw).digest('hex'), principal = this.tickets.get(key); this.tickets.delete(key);
    if (!principal || principal.expiresAt <= Date.now() || !(await this.validPrincipals([principal])).has(principal.sessionId)) throw new UnauthorizedException();
    // Session I/O can outlive the short ticket or a maintenance switch.
    this.enabled(true);
    if (principal.expiresAt <= Date.now()) throw new UnauthorizedException();
    if (this.member(principal.userId, principal.roomId).member.admissionId !== principal.admissionId) throw new UnauthorizedException();
    return principal;
  }
  connect(principal: PaperPrincipal, connectionId: string): void {
    this.enabled(true);
    const { room, member } = this.member(principal.userId, principal.roomId);
    if (member.admissionId !== principal.admissionId || principal.expiresAt <= Date.now()) throw new UnauthorizedException();
    member.connectionId = connectionId; member.disconnectedAt = 0;
    room.engine.players.find(player => player.id === member.playerId)!.connected = true; resetPaperArenaInput(room.engine, member.playerId);
  }
  disconnect(principal: PaperPrincipal, connectionId: string): void {
    const room = this.rooms.get(principal.roomId), member = room?.members.get(principal.userId);
    if (!room || !member || member.admissionId !== principal.admissionId || member.connectionId !== connectionId) return;
    member.connectionId = null; member.disconnectedAt = Date.now();
    room.engine.players.find(player => player.id === member.playerId)!.connected = false; resetPaperArenaInput(room.engine, member.playerId);
  }
  input(principal: PaperPrincipal, connectionId: string, input: PaperArenaInput): void {
    this.enabled(true); const { room, member } = this.member(principal.userId, principal.roomId);
    if (member.admissionId !== principal.admissionId || member.connectionId !== connectionId) throw new UnauthorizedException();
    if (room.status === 'running') acceptPaperArenaInput(room.engine, member.playerId, input);
  }
  isCurrentConnection(principal: PaperPrincipal, connectionId: string): boolean {
    const room = this.rooms.get(principal.roomId);
    const member = room?.members.get(principal.userId);
    return !!room && room.expiresAt > Date.now() && member?.admissionId === principal.admissionId && member.connectionId === connectionId;
  }
  revoke(principal: PaperPrincipal, connectionId: string): void {
    // An asynchronous validation result for an old socket must never evict the
    // replacement socket, including one authenticated by a different session.
    if (!this.isCurrentConnection(principal, connectionId)) return;
    const room = this.rooms.get(principal.roomId); if (room) this.remove(room, principal.userId);
  }
  async pruneInactiveMembers(): Promise<void> {
    // Disconnected/never-connected members have no socket principal to validate.
    // Bound this to the existing 24 rooms × 8 seats and select no private fields.
    const entries = [...this.rooms.values()].flatMap(room => [...room.members.values()].map(member => ({ room, member })));
    if (!entries.length) return;
    const users = await this.db.getRepository(User).find({ where: { id: In([...new Set(entries.map(entry => entry.member.userId))]), accountStatus: 'active' }, select: { id: true } });
    const active = new Set(users.map(user => user.id));
    for (const { room, member } of entries) if (!active.has(member.userId) && this.rooms.get(room.id) === room && room.members.get(member.userId) === member) this.remove(room, member.userId);
  }
  async validPrincipals(principals: PaperPrincipal[]): Promise<Set<string>> {
    if (!principals.length || !paperArenaEnabled() || !communityWritesEnabled()) return new Set();
    const rows = await this.db.getRepository(AuthSession).find({ where: { id: In([...new Set(principals.map(value => value.sessionId))]) }, relations: { user: true } });
    const userIds = [...new Set(principals.map(principal => principal.userId))];
    const blocks = await this.db.getRepository(UserBlock).find({ where: [{ blockerId: In(userIds) }, { blockedId: In(userIds) }] });
    const valid = new Set<string>();
    for (const row of rows) if (row.revokedAt === null && row.expiresAt.getTime() > Date.now() && row.user?.accountStatus === 'active') {
      // There can briefly be both an old and a replacement socket for one
      // session. Only its current admission is relevant, never the first row.
      const principal = principals.find(candidate => candidate.sessionId === row.id && candidate.userId === row.userId && this.rooms.get(candidate.roomId)?.members.get(row.userId)?.admissionId === candidate.admissionId);
      const room = principal ? this.rooms.get(principal.roomId) : null;
      if (room && room.expiresAt > Date.now() && !blocks.some(block => block.blockerId === row.userId && room.members.has(block.blockedId) || block.blockedId === row.userId && room.members.has(block.blockerId))) valid.add(row.id);
    }
    return valid;
  }
  /** Interval does bounded work after event-loop delays; there is no catch-up avalanche. */
  tick(now = Date.now()): void {
    for (const [key, ticket] of this.tickets) if (ticket.expiresAt <= now) this.tickets.delete(key);
    if (!paperArenaEnabled() || !communityWritesEnabled()) return;
    for (const room of this.rooms.values()) {
      // Finalize before expiry cleanup even after a long event-loop pause. The
      // score remains authoritative and visible for ten minutes, not a 404.
      if (room.status === 'running' && room.startedAt !== null && now - room.startedAt >= PAPER_ARENA_RULES.maxDurationMs) {
        finishPaperArenaAtDeadline(room.engine); room.status = 'finished'; room.expiresAt = now + 10 * 60_000;
      }
      if (room.expiresAt <= now) { for (const member of [...room.members.values()]) this.remove(room, member.userId); this.rooms.delete(room.id); continue; }
      for (const member of [...room.members.values()]) if (member.disconnectedAt > 0 && now - member.disconnectedAt >= 90_000) this.remove(room, member.userId);
      if (!this.rooms.has(room.id) || room.status !== 'running') continue;
      const elapsed = now - room.lastTickAt, steps = Math.min(2, Math.floor(elapsed / PAPER_ARENA_RULES.tickMs));
      if (steps <= 0) continue;
      // Keep the sub-tick remainder; drop excess whole ticks after a long lag
      // instead of scheduling a catch-up avalanche on subsequent intervals.
      room.lastTickAt = now - elapsed % PAPER_ARENA_RULES.tickMs;
      for (let index = 0; index < steps; index++) stepPaperArena(room.engine);
      if (room.engine.winner) { room.status = 'finished'; room.expiresAt = now + 10 * 60_000; }
    }
    for (const listener of this.listeners) listener();
  }
}
