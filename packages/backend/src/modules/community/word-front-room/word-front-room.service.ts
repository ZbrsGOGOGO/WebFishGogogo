import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnApplicationBootstrap, OnModuleDestroy, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { WORD_FRONT_V2_CHAPTERS, WORD_FRONT_V2_UNITS, WORD_FRONT_V2_WIDTH, applyWordFrontV2Action, createWordFrontV2State, stepWordFrontV2, wordFrontV2HeroForLetters, wordFrontV2Terrain, type WordFrontV2Action, type WordFrontV2State } from '@stealth-reader/shared';
import { User, UserBlock } from '../../../database/entities';
import { AuthRateLimitService } from '../../auth/auth-rate-limit.service';
import { assertCommunityWritesEnabled, communityWritesEnabled } from '../community-write-gate';
import { consumeRoomPasswordAttempt, hashRoomPassword, normalizeRoomPassword, roomPasswordFingerprint, verifyRoomPassword } from '../room-password';

type Side = 'red' | 'blue';
type Status = 'waiting' | 'running' | 'finished';
type OmitTick<T> = T extends unknown ? Omit<T, 'tick'> : never;
type Action = OmitTick<WordFrontV2Action>;
interface Member { userId: string; publicId: string; displayName: string; side: Side }
interface Receipt { userId: string; hash: string }
interface Room {
  id: string; name: string; chapter: number; creatorId: string; createRequestId: string; createHash: string;
  passwordHash: string | null; hostUserId: string; status: Status; members: Map<string, Member>;
  red: WordFrontV2State; blue: WordFrontV2State; attackMeter: Record<Side, number>;
  receipts: Map<string, Receipt>; lastActionAt: Map<string, number[]>;
  createdAt: number; startedAt: number | null; lastTickAt: number; expiresAt: number;
  winner: Side | 'draw' | null; sequence: number;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ROOMS = 24;
const TICK_MS = 850;
const MAX_DURATION_MS = 15 * 60_000;
const RULES = '1V1 双线对攻；双方同章节、同开局种子，服务端每 0.85 秒同步推进。每击败 5 名来客向对方路线投递 1 名支援来客（单次最多 2 名、每线最多 24 名在场）。先失去全部核心生命判负；双方守完时比较得分。同一局仅使用局内经费和金币，不计正式榜、办公币、成就或存档。房间为临时会话，重启后结束；最长 15 分钟。';

function invalid(): never { throw new BadRequestException({ code: 'WORD_ROOM_INPUT_INVALID', message: '房间参数无效。' }); }
function object(raw: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) return invalid();
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(value, key))) return invalid();
  return value;
}
function uuid(raw: unknown): string { if (typeof raw !== 'string' || !UUID.test(raw)) return invalid(); return raw.toLowerCase(); }
function name(raw: unknown): string {
  if (typeof raw !== 'string' || [...raw].length > 32 || /[\p{Cc}\p{Cf}]/u.test(raw) || !raw.trim()) return invalid();
  return raw.trim();
}
function secret(raw: unknown): string | null {
  if (typeof raw !== 'string') return invalid();
  return normalizeRoomPassword(raw);
}
function action(raw: unknown): Action {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid();
  const type = (raw as Record<string, unknown>).type;
  if (type === 'recruit') { object(raw, ['type']); return { type }; }
  if (type === 'buy_boost') { const value = object(raw, ['type', 'boost']); if (value.boost !== 'attack' && value.boost !== 'heal') return invalid(); return { type, boost: value.boost }; }
  if (type === 'unlock') { const value = object(raw, ['type', 'slot']); if (!Number.isSafeInteger(value.slot)) return invalid(); return { type, slot: value.slot as number }; }
  if (type === 'deploy_basic') { const value = object(raw, ['type', 'card', 'slot']); if (!Number.isSafeInteger(value.card) || !Number.isSafeInteger(value.slot)) return invalid(); return { type, card: value.card as number, slot: value.slot as number }; }
  if (type === 'deploy_hero') { const value = object(raw, ['type', 'first', 'second', 'slot']); if (![value.first, value.second, value.slot].every(Number.isSafeInteger)) return invalid(); return { type, first: value.first as number, second: value.second as number, slot: value.slot as number }; }
  if (type === 'merge') { const value = object(raw, ['type', 'from', 'to']); if (!Number.isSafeInteger(value.from) || !Number.isSafeInteger(value.to)) return invalid(); return { type, from: value.from as number, to: value.to as number }; }
  return invalid();
}
function preparedState(chapter: number, seed: number): WordFrontV2State {
  let state = createWordFrontV2State('story', chapter, seed);
  state = applyWordFrontV2Action(state, { tick: 0, type: 'recruit' })!;
  const path = WORD_FRONT_V2_CHAPTERS[chapter - 1]!.path;
  let placed = false;
  for (let first = 0; first < state.hand.length && !placed; first += 1) {
    for (let second = first + 1; second < state.hand.length && !placed; second += 1) {
      const hero = wordFrontV2HeroForLetters(state.hand[first]!, state.hand[second]!);
      if (!hero) continue;
      const range = WORD_FRONT_V2_UNITS[hero].range;
      let best: { slot: number; covered: number; early: number; firstHit: number; buff: number } | null = null;
      for (let slot = 0; slot < 48; slot += 1) {
        const terrain = wordFrontV2Terrain(state, slot);
        if (terrain !== 'open' && terrain !== 'buff') continue;
        const reaches = (cell: number) => Math.abs(slot % WORD_FRONT_V2_WIDTH - cell % WORD_FRONT_V2_WIDTH) +
          Math.abs(Math.floor(slot / WORD_FRONT_V2_WIDTH) - Math.floor(cell / WORD_FRONT_V2_WIDTH)) <= range;
        const covered = path.filter(reaches).length;
        const early = path.slice(0, 6).filter(reaches).length;
        const firstHit = path.findIndex(reaches);
        const candidate = { slot, covered, early, firstHit, buff: terrain === 'buff' ? 1 : 0 };
        if (!best || covered > best.covered || covered === best.covered && (early > best.early || early === best.early &&
          (firstHit < best.firstHit || firstHit === best.firstHit && candidate.buff > best.buff))) best = candidate;
      }
      if (!best || best.early === 0) throw new Error('Word Front opening hero cannot protect the first lane segment');
      state = applyWordFrontV2Action(state, { tick: 0, type: 'deploy_hero', first, second, slot: best.slot })!;
      placed = true;
    }
  }
  if (!placed) throw new Error('Word Front opening hand did not contain guaranteed hero pair');
  return applyWordFrontV2Action(state, { tick: 0, type: 'start' })!;
}

/** Authoritative, bounded short-lived rooms. No database writes to scores or wallets. */
@Injectable()
export class WordFrontRoomService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly rooms = new Map<string, Room>();
  private readonly current = new Map<string, string>();
  private readonly pending = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  constructor(private readonly db: DataSource) {}
  onApplicationBootstrap(): void {
    if (!this.featureEnabled()) return;
    this.timer = setInterval(() => this.advance(), TICK_MS); this.timer.unref?.();
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); this.timer = null; this.rooms.clear(); this.current.clear(); }
  private featureEnabled(): boolean { return process.env.FEATURE_WORD_FRONT_ROOMS_ENABLED === 'true'; }
  private enabled(write = false): void {
    if (!this.featureEnabled()) throw new NotFoundException({ code: 'WORD_ROOM_DISABLED', message: '文字战线房间暂未开放。' });
    if (write) assertCommunityWritesEnabled();
  }
  private async active(userId: string): Promise<User> {
    const user = await this.db.getRepository(User).findOneBy({ id: userId });
    if (!user || user.accountStatus !== 'active') throw new UnauthorizedException({ code: 'INVALID_SESSION' });
    return user;
  }
  private async blocked(userId: string): Promise<Set<string>> {
    const rows = await this.db.getRepository(UserBlock).find({ where: [{ blockerId: userId }, { blockedId: userId }] });
    return new Set(rows.map(row => row.blockerId === userId ? row.blockedId : row.blockerId));
  }
  private async exclusive<T>(userId: string, work: () => Promise<T>): Promise<T> {
    if (this.pending.has(userId)) throw new ConflictException({ code: 'WORD_ROOM_OPERATION_PENDING' });
    this.pending.add(userId); try { return await work(); } finally { this.pending.delete(userId); }
  }
  private async budget(userId: string, operation: string, limit: number, windowMs = 60_000): Promise<void> {
    await new AuthRateLimitService(this.db).consume([{ scope: `word-front-room:${operation}`, dimension: userId, limit, windowMs, blockMs: windowMs }], new Date());
  }
  private room(id: string): Room {
    const room = this.rooms.get(uuid(id));
    if (!room || room.expiresAt <= Date.now()) throw new NotFoundException({ code: 'WORD_ROOM_NOT_FOUND' });
    return room;
  }
  private member(userId: string, id: string): { room: Room; member: Member } {
    const room = this.room(id), member = room.members.get(userId);
    if (!member) throw new NotFoundException({ code: 'WORD_ROOM_NOT_FOUND' });
    return { room, member };
  }
  private summary(room: Room) {
    return { id: room.id, name: room.name, chapter: room.chapter, status: room.status, requiresPassword: !!room.passwordHash,
      players: room.members.size, capacity: 2, expiresAt: room.expiresAt };
  }
  private view(userId: string, room: Room) {
    const member = room.members.get(userId);
    if (!member) throw new NotFoundException({ code: 'WORD_ROOM_NOT_FOUND' });
    const opponent = [...room.members.values()].find(value => value.userId !== userId) ?? null;
    const own = room[member.side], other = room[member.side === 'red' ? 'blue' : 'red'];
    return { ...this.summary(room), protocolVersion: 1, rulesVersion: 2, sequence: room.sequence, serverNow: Date.now(), rules: RULES,
      isHost: room.hostUserId === userId, mySide: member.side, me: { publicId: member.publicId, displayName: member.displayName },
      opponent: opponent ? { publicId: opponent.publicId, displayName: opponent.displayName } : null,
      board: room.status === 'waiting' ? null : { ...own, seed: undefined },
      opposingBoard: room.status === 'waiting' ? null : { status: other.status, coreHp: other.coreHp, wave: other.wave,
        completedWaves: other.completedWaves, kills: other.kills, score: other.score, units: other.units, enemies: other.enemies,
        pendingSpawns: other.pendingSpawns, tick: other.tick }, winner: room.winner };
  }
  async list(userId: string) {
    this.enabled(); await this.active(userId); const denied = await this.blocked(userId);
    return { currentRoomId: this.current.get(userId) ?? null,
      rooms: [...this.rooms.values()].filter(room => room.expiresAt > Date.now() && room.status === 'waiting' && ![...room.members.keys()].some(id => denied.has(id))).map(room => this.summary(room)) };
  }
  async get(userId: string, roomId: string) { this.enabled(); await this.active(userId); return this.view(userId, this.room(roomId)); }
  async create(userId: string, raw: unknown) {
    this.enabled(true);
    const value = object(raw, ['requestId', 'name', 'chapter', 'password']);
    const requestId = uuid(value.requestId), title = name(value.name), password = secret(value.password), chapter = value.chapter;
    if (!Number.isSafeInteger(chapter) || (chapter as number) < 1 || (chapter as number) > 6) return invalid();
    const requestHash = createHash('sha256').update(JSON.stringify([title, chapter, roomPasswordFingerprint(password)])).digest('hex');
    return this.exclusive(userId, async () => {
      const user = await this.active(userId);
      const replay = [...this.rooms.values()].find(room => room.creatorId === userId && room.createRequestId === requestId);
      if (replay) {
        if (replay.createHash !== requestHash || !replay.members.has(userId)) throw new ConflictException({ code: 'WORD_ROOM_CREATE_CONFLICT' });
        return this.view(userId, replay);
      }
      if (this.current.has(userId)) throw new ConflictException({ code: 'WORD_ROOM_ALREADY_JOINED' });
      if (this.rooms.size >= MAX_ROOMS) throw new ConflictException({ code: 'WORD_ROOM_CAPACITY' });
      await this.budget(userId, 'create', 3, 600_000);
      const passwordHash = await hashRoomPassword(password);
      await this.active(userId); this.enabled(true);
      if (this.rooms.size >= MAX_ROOMS || this.current.has(userId)) throw new ConflictException({ code: 'WORD_ROOM_CAPACITY' });
      const now = Date.now(), id = randomUUID(), seed = randomBytes(4).readUInt32LE();
      const room: Room = { id, name: title, chapter: chapter as number, creatorId: userId, createRequestId: requestId, createHash: requestHash,
        passwordHash, hostUserId: userId, status: 'waiting', members: new Map(), red: createWordFrontV2State('story', chapter as number, seed),
        blue: createWordFrontV2State('story', chapter as number, seed), attackMeter: { red: 0, blue: 0 }, receipts: new Map(), lastActionAt: new Map(),
        createdAt: now, startedAt: null, lastTickAt: now, expiresAt: now + 30 * 60_000, winner: null, sequence: 0 };
      room.members.set(userId, { userId, publicId: user.publicId, displayName: user.displayName || '同事', side: 'red' });
      this.rooms.set(id, room); this.current.set(userId, id); return this.view(userId, room);
    });
  }
  async join(userId: string, raw: unknown) {
    this.enabled(true); const value = object(raw, ['roomId', 'password']), id = uuid(value.roomId), password = secret(value.password);
    return this.exclusive(userId, async () => {
      const user = await this.active(userId), room = this.room(id);
      if (room.members.has(userId)) return this.view(userId, room);
      if (this.current.has(userId)) throw new ConflictException({ code: 'WORD_ROOM_ALREADY_JOINED' });
      const denied = await this.blocked(userId);
      if ([...room.members.keys()].some(memberId => denied.has(memberId))) throw new NotFoundException({ code: 'WORD_ROOM_NOT_FOUND' });
      await this.budget(userId, 'join', 12);
      if (room.passwordHash) await consumeRoomPasswordAttempt(this.db, 'word-front', userId, room.id);
      if (!(await verifyRoomPassword(password, room.passwordHash))) throw new ForbiddenException({ code: 'WORD_ROOM_PASSWORD_INVALID' });
      await this.active(userId); const freshDenied = await this.blocked(userId); this.enabled(true);
      if (this.rooms.get(id) !== room || room.expiresAt <= Date.now() || [...room.members.keys()].some(memberId => freshDenied.has(memberId))) throw new NotFoundException({ code: 'WORD_ROOM_NOT_FOUND' });
      if (room.status !== 'waiting' || room.members.size !== 1 || this.current.has(userId)) throw new ConflictException({ code: 'WORD_ROOM_FULL' });
      const occupiedSide = room.members.values().next().value!.side;
      room.members.set(userId, { userId, publicId: user.publicId, displayName: user.displayName || '同事', side: occupiedSide === 'red' ? 'blue' : 'red' });
      this.current.set(userId, id); room.sequence += 1; return this.view(userId, room);
    });
  }
  async start(userId: string, roomId: string, raw: unknown) {
    object(raw, []); this.enabled(true); await this.active(userId); this.enabled(true);
    const { room } = this.member(userId, roomId);
    if (room.hostUserId !== userId) throw new ForbiddenException({ code: 'WORD_ROOM_HOST_REQUIRED' });
    if (room.status === 'running') return this.view(userId, room);
    if (room.status !== 'waiting' || room.members.size !== 2) throw new ConflictException({ code: 'WORD_ROOM_NOT_READY' });
    room.red = preparedState(room.chapter, room.red.seed); room.blue = preparedState(room.chapter, room.blue.seed);
    room.status = 'running'; room.startedAt = room.lastTickAt = Date.now();
    // Keep a timed-out result readable for five minutes, even if the timer fires late.
    room.expiresAt = room.startedAt + MAX_DURATION_MS + 5 * 60_000;
    room.sequence += 1; return this.view(userId, room);
  }
  async act(userId: string, roomId: string, raw: unknown) {
    const value = object(raw, ['actionId', 'action']), actionId = uuid(value.actionId), move = action(value.action);
    this.enabled(true); await this.active(userId); this.enabled(true);
    const { room, member } = this.member(userId, roomId);
    if (room.status !== 'running') throw new ConflictException({ code: 'WORD_ROOM_NOT_RUNNING' });
    const hash = createHash('sha256').update(JSON.stringify(move)).digest('hex');
    const replay = room.receipts.get(actionId);
    if (replay) {
      if (replay.userId !== userId || replay.hash !== hash) throw new ConflictException({ code: 'WORD_ROOM_ACTION_CONFLICT' });
      return this.view(userId, room);
    }
    const now = Date.now(), previous = (room.lastActionAt.get(userId) ?? []).filter(at => at > now - 1_000);
    if (previous.length >= 8) throw new ConflictException({ code: 'WORD_ROOM_ACTION_RATE' });
    const board = room[member.side];
    const next = applyWordFrontV2Action(board, { ...move, tick: board.tick } as WordFrontV2Action);
    if (!next) throw new BadRequestException({ code: 'WORD_ROOM_ACTION_INVALID', message: '当前棋盘无法执行该操作，请刷新房间。' });
    room[member.side] = next; room.lastActionAt.set(userId, [...previous, now]); room.receipts.set(actionId, { userId, hash });
    if (room.receipts.size > 400) room.receipts.delete(room.receipts.keys().next().value!);
    room.sequence += 1; return this.view(userId, room);
  }
  async leave(userId: string, roomId: string, raw: unknown) {
    object(raw, []); this.enabled(); await this.active(userId);
    const room = this.rooms.get(uuid(roomId));
    if (!room?.members.has(userId)) return { left: true };
    room.members.delete(userId); this.current.delete(userId); room.sequence += 1;
    if (room.members.size === 0) this.rooms.delete(room.id);
    else if (room.hostUserId === userId) room.hostUserId = room.members.keys().next().value!;
    if (room.status === 'running' && room.members.size === 1) { room.status = 'finished'; room.winner = room.members.values().next().value!.side; room.expiresAt = Date.now() + 5 * 60_000; }
    return { left: true };
  }
  /** Both lanes advance before either side's new attacks enter, preventing tick-order advantage. */
  advance(now = Date.now()): void {
    if (!this.featureEnabled() || !communityWritesEnabled()) { for (const room of this.rooms.values()) room.lastTickAt = now; return; }
    for (const room of this.rooms.values()) {
      if (room.expiresAt <= now) { for (const id of room.members.keys()) this.current.delete(id); this.rooms.delete(room.id); continue; }
      if (room.status !== 'running') continue;
      for (let count = 0; count < 32 && room.lastTickAt + TICK_MS <= now && room.status === 'running'; count += 1) {
        room.lastTickAt += TICK_MS;
        const oldRed = room.red.kills, oldBlue = room.blue.kills;
        room.red = stepWordFrontV2(room.red); room.blue = stepWordFrontV2(room.blue);
        this.sendAttack(room, 'red', Math.max(0, room.red.kills - oldRed));
        this.sendAttack(room, 'blue', Math.max(0, room.blue.kills - oldBlue));
        room.sequence += 1;
        if (room.red.status !== 'running' || room.blue.status !== 'running') {
          if (room.red.status === 'lost' || room.blue.status === 'lost' || room.red.status === 'won' && room.blue.status === 'won') this.finish(room, now);
        }
      }
      if (room.status === 'running' && room.startedAt !== null && now - room.startedAt >= MAX_DURATION_MS) this.finish(room, now);
    }
  }
  private sendAttack(room: Room, side: Side, kills: number): void {
    room.attackMeter[side] += kills;
    const opposite: Side = side === 'red' ? 'blue' : 'red';
    const board = room[opposite];
    if (board.status !== 'running') return;
    const count = Math.min(2, Math.floor(room.attackMeter[side] / 5), Math.max(0, 24 - board.enemies.length));
    if (count <= 0) return;
    room.attackMeter[side] -= count * 5;
    const hp = 12 + Math.min(30, board.wave) * 3;
    board.enemies = [...board.enemies, ...Array.from({ length: count }, (_, index) => ({ id: board.nextEnemyId + index,
      kind: 'routine' as const, pathIndex: 0, hp, maxHp: hp, moveEvery: 3 }))];
    board.nextEnemyId += count;
  }
  private finish(room: Room, now: number): void {
    room.status = 'finished'; room.expiresAt = now + 5 * 60_000;
    if (room.red.status === 'lost' && room.blue.status !== 'lost') room.winner = 'blue';
    else if (room.blue.status === 'lost' && room.red.status !== 'lost') room.winner = 'red';
    else if (room.red.score > room.blue.score) room.winner = 'red';
    else if (room.blue.score > room.red.score) room.winner = 'blue';
    else room.winner = 'draw';
  }
}
