import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import type { RailChatChannel, RailChatMessage, RailChatPage } from '@stealth-reader/shared';
import { RailChatMessageRecord, RailRoom, RailRoomMember, User, UserBlock } from '../../../database/entities';
import { AuthRateLimitService } from '../../auth/auth-rate-limit.service';
import { assertChatWritesEnabled, assertCommunityChatEnabled, isChatWritesEnabled, isCommunityChatEnabled } from '../../chat/chat-gates';
import { ChatModerationService } from '../../chat/chat-moderation.service';
import { assertCommunityWritesEnabled, communityWritesEnabled } from '../community-write-gate';
import { hash } from '../play/play.rules';
import { railObject, railPerson, railUuid } from './rail.rules';

const PAGE_SIZE = 50;
const ROOM_MESSAGE_LIMIT = 1000;
const RECENT_WINDOW = 200;

/** Moderation runs before (not while holding) the room lock. Every commit rechecks access. */
@Injectable()
export class RailChatService {
  constructor(private readonly db: DataSource, private readonly moderation: ChatModerationService) {}

  availability() {
    const chatEnabled = isCommunityChatEnabled();
    return { chatEnabled, chatCanWrite: chatEnabled && isChatWritesEnabled() && communityWritesEnabled() && this.moderation.isAvailable() };
  }

  async list(userId: string, rawRoomId: string, query: { afterSequence?: unknown; beforeSequence?: unknown; channel?: unknown } = {}): Promise<RailChatPage> {
    assertCommunityChatEnabled();
    const roomId = railUuid(rawRoomId);
    const after = this.cursor(query.afterSequence);
    const before = this.cursor(query.beforeSequence);
    const channel = query.channel === undefined ? undefined : this.channel(query.channel);
    if (after !== undefined && before !== undefined) throw new BadRequestException({ code: 'RAIL_CHAT_CURSOR_INVALID' });
    return this.db.transaction(async (manager) => {
      const { room } = await this.access(manager, userId, roomId, false);
      const floor = Math.max(0, room.latestChatSequence - RECENT_WINDOW);
      const builder = manager.getRepository(RailChatMessageRecord).createQueryBuilder('message')
        .innerJoinAndSelect('message.author', 'author').where('message.room_id = :roomId', { roomId })
        .andWhere('message.sequence > :floor', { floor });
      if (channel) builder.andWhere('message.channel = :channel', { channel });
      if (after !== undefined) builder.andWhere('message.sequence > :after', { after });
      if (before !== undefined) builder.andWhere('message.sequence < :before', { before });
      const rows = await builder.orderBy('message.sequence', after !== undefined ? 'ASC' : 'DESC').take(PAGE_SIZE + 1).getMany();
      const hasMore = rows.length > PAGE_SIZE;
      const page = rows.slice(0, PAGE_SIZE);
      if (after === undefined) page.reverse();
      return { items: page.map((row) => this.project(row)), latestSequence: room.latestChatSequence, hasMore };
    });
  }

  async send(userId: string, rawRoomId: string, raw: unknown): Promise<RailChatMessage> {
    this.assertWrites();
    const roomId = railUuid(rawRoomId);
    const input = railObject(raw, ['clientMessageId', 'channel', 'body']);
    const clientMessageId = railUuid(input.clientMessageId);
    const channel = this.channel(input.channel);
    const body = this.body(input.body);
    const requestHash = hash({ channel, body });
    const initial = await this.db.transaction(async (manager) => {
      const context = await this.access(manager, userId, roomId, false);
      this.assertChannel(context.member, channel);
      const previous = await this.previous(manager, roomId, userId, clientMessageId, requestHash);
      if (!previous) this.assertOpen(context.room, context.member);
      return { ...context, previous };
    });
    if (initial.previous) return this.project(initial.previous);
    // Separate transaction: a rejected/failed message must not roll back its anti-spam quota.
    await new AuthRateLimitService(this.db).consume([
      { scope: 'rail:chat:account', dimension: userId, limit: 30, windowMs: 60_000 },
      { scope: 'rail:chat:burst', dimension: userId, limit: 5, windowMs: 10_000 },
    ]);
    if (!this.moderation.isAvailable()) throw new ServiceUnavailableException({ code: 'RAIL_CHAT_READ_ONLY' });
    const id = randomUUID();
    const moderation = await this.moderation.moderate({ messageId: id, roomSlug: `rail:${roomId}:${channel}`, authorPublicId: initial.user.publicId, body });
    if (moderation.decision !== 'allow') throw new ForbiddenException({ code: 'RAIL_CHAT_MODERATION_REJECTED', message: '这条消息未通过审核，请调整内容。' });
    return this.db.transaction(async (manager) => {
      this.assertWrites();
      const { user, room, member } = await this.access(manager, userId, roomId, true);
      this.assertChannel(member, channel);
      const previous = await this.previous(manager, roomId, userId, clientMessageId, requestHash);
      if (previous) return this.project(previous);
      this.assertOpen(room, member);
      if (room.latestChatSequence >= ROOM_MESSAGE_LIMIT) throw new ConflictException({ code: 'RAIL_CHAT_ROOM_LIMIT', message: '本局消息已达到上限，请在下一局继续。' });
      const now = new Date();
      const recent = await manager.getRepository(RailChatMessageRecord).findOne({ where: { roomId, authorId: userId }, order: { createdAt: 'DESC' } });
      if (recent && now.getTime() - recent.createdAt.getTime() < 1500) throw new HttpException({ code: 'RAIL_CHAT_SLOW_MODE', message: '发送太快，请稍后再试。' }, 429);
      const values = { id, roomId, authorId: userId, clientMessageId, requestHash, channel, body, sequence: room.latestChatSequence + 1, status: 'visible' as const, createdAt: now, withdrawnAt: null };
      await manager.getRepository(RailChatMessageRecord).insert(values);
      const message = manager.getRepository(RailChatMessageRecord).create(values);
      // Do not save a partial room: never overwrite engine JSON or a password.
      await manager.getRepository(RailRoom).update(room.id, { latestChatSequence: message.sequence });
      message.author = user;
      return this.project(message);
    });
  }

  async withdraw(userId: string, rawRoomId: string, rawMessageId: string): Promise<RailChatMessage> {
    this.assertWrites();
    const roomId = railUuid(rawRoomId); const messageId = railUuid(rawMessageId);
    return this.db.transaction(async (manager) => {
      await this.access(manager, userId, roomId, true);
      const message = await manager.getRepository(RailChatMessageRecord).findOne({ where: { id: messageId, roomId, authorId: userId }, relations: ['author'] });
      if (!message) throw new NotFoundException({ code: 'RAIL_CHAT_MESSAGE_NOT_FOUND' });
      if (message.status === 'visible') {
        message.status = 'withdrawn'; message.body = ''; message.withdrawnAt = new Date();
        await manager.getRepository(RailChatMessageRecord).save(message);
      }
      return this.project(message);
    });
  }

  private async access(manager: EntityManager, userId: string, roomId: string, lock: boolean) {
    const users = manager.getRepository(User).createQueryBuilder('user').where('user.id = :userId', { userId });
    if (lock) users.setLock('for_no_key_update');
    const user = await users.getOne();
    if (!user || user.accountStatus !== 'active') throw new UnauthorizedException({ code: 'RAIL_ACTIVE_ACCOUNT_REQUIRED' });
    // Establish membership before loading room metadata. All later data uses the same connection.
    const member = await manager.getRepository(RailRoomMember).findOneBy({ roomId, userId });
    if (!member || member.leftAt) throw new NotFoundException({ code: 'RAIL_ROOM_NOT_FOUND' });
    const rooms = manager.getRepository(RailRoom).createQueryBuilder('room').where('room.id = :roomId', { roomId });
    if (lock) rooms.setLock('pessimistic_write');
    const room = await rooms.getOne();
    const current = lock ? await manager.getRepository(RailRoomMember).findOneBy({ roomId, userId }) : member;
    if (!room || !current || current.leftAt) throw new NotFoundException({ code: 'RAIL_ROOM_NOT_FOUND' });
    const blocks = await manager.getRepository(UserBlock).find({ where: [{ blockerId: userId }, { blockedId: userId }] });
    const blocked = new Set(blocks.map((row) => row.blockerId === userId ? row.blockedId : row.blockerId));
    if (blocked.size) {
      const members = await manager.getRepository(RailRoomMember).findBy({ roomId });
      if (members.some((entry) => !entry.leftAt && blocked.has(entry.userId))) throw new NotFoundException({ code: 'RAIL_ROOM_NOT_FOUND' });
    }
    return { user, room, member: current };
  }

  private async previous(manager: EntityManager, roomId: string, authorId: string, clientMessageId: string, requestHash: string) {
    const row = await manager.getRepository(RailChatMessageRecord).findOne({ where: { roomId, authorId, clientMessageId }, relations: ['author'] });
    if (row && row.requestHash !== requestHash) throw new ConflictException({ code: 'RAIL_IDEMPOTENCY_CONFLICT' });
    return row;
  }
  private assertWrites() { assertCommunityChatEnabled(); assertChatWritesEnabled(); assertCommunityWritesEnabled(); }
  private assertOpen(room: RailRoom, member: RailRoomMember) {
    if (!member.active || !['waiting', 'running'].includes(room.status) || room.expiresAt.getTime() <= Date.now()) throw new ConflictException({ code: 'RAIL_CHAT_READ_ONLY', message: '本局已结束，聊天记录只读。' });
  }
  private assertChannel(member: RailRoomMember, channel: RailChatChannel) {
    if (channel !== (member.role === 'participant' ? 'player' : 'spectator')) throw new ForbiddenException({ code: 'RAIL_CHAT_CHANNEL_FORBIDDEN' });
  }
  private channel(value: unknown): RailChatChannel {
    if (value !== 'player' && value !== 'spectator') throw new BadRequestException({ code: 'RAIL_CHAT_CHANNEL_INVALID' });
    return value;
  }
  private body(value: unknown): string {
    if (typeof value !== 'string') throw new BadRequestException({ code: 'RAIL_CHAT_BODY_INVALID' });
    const body = value.normalize('NFC').trim();
    if (!body || body.length > 600 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(body) || /[\ud800-\udfff]/u.test(body)) throw new BadRequestException({ code: 'RAIL_CHAT_BODY_INVALID' });
    return body;
  }
  private cursor(value: unknown): number | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !/^(0|[1-9]\d{0,8})$/.test(value)) throw new BadRequestException({ code: 'RAIL_CHAT_CURSOR_INVALID' });
    const parsed = Number(value);
    if (parsed > ROOM_MESSAGE_LIMIT + 1) throw new BadRequestException({ code: 'RAIL_CHAT_CURSOR_INVALID' });
    return parsed;
  }
  private project(row: RailChatMessageRecord): RailChatMessage {
    const deleted = row.author.accountStatus === 'deleted' || row.author.accountStatus === 'deleting';
    const status = deleted ? 'withdrawn' : row.status;
    return { id: row.id, sequence: row.sequence, channel: row.channel, author: railPerson(row.author), body: status === 'visible' ? row.body : null, status, createdAt: row.createdAt.toISOString() };
  }
}
