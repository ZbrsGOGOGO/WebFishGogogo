import { Injectable, OnModuleInit } from '@nestjs/common';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  LessThan,
  LessThanOrEqual,
  MoreThan,
} from 'typeorm';

import {
  AuthSession,
  ChatMessage,
  ChatMessageMention,
  ChatMessageReport,
  ChatRoom,
  ChatSocketTicket,
  CommunityNotification,
  Friendship,
  PlayerProfile,
  User,
  UserBlock,
} from '../../database/entities';
import type {
  ChatReportReason,
  ChatRoomSlug,
} from '../../database/entities/chat.entity';
import {
  assertChatWritesEnabled,
  assertCommunityChatEnabled,
  isChatWritesEnabled,
} from './chat-gates';
import { ChatException, chatException } from './chat.errors';
import { ChatModerationService } from './chat-moderation.service';
import { ChatRealtimeService } from './chat-realtime.service';
import {
  type ChatHistoryPage,
  type ChatMentionCandidateView,
  type ChatMessageView,
  type ChatPrincipal,
  type ChatRoomView,
  CHAT_ROOM_SLUGS,
  isChatRoomSlug,
  statusVisibility,
} from './chat.types';

const TICKET_TTL_MS = 60_000;
const WITHDRAW_WINDOW_MS = 120_000;
const DELETED_USER_PUBLIC_ID = '00000000-0000-4000-8000-000000000000';
const HISTORY_DEFAULT_LIMIT = 50;
const HISTORY_MAX_LIMIT = 200;
const ROOM_MESSAGE_RETENTION = 200;
const REPORT_REASONS = new Set<ChatReportReason>([
  'harassment',
  'spam',
  'privacy',
  'illegal',
  'other',
]);

export interface SendChatMessageInput {
  clientMessageId: string;
  roomSlug: string;
  body: string;
  replyToMessageId?: string;
  mentionPublicIds?: string[];
}

interface ChatHistoryViewContext {
  users: Map<string, User>;
  profiles: Map<string, PlayerProfile>;
  mentionsByMessage: Map<string, string[]>;
  replies: Map<string, ChatMessage>;
  blockedUserIds: Set<string>;
}

@Injectable()
export class ChatService implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    private readonly realtime: ChatRealtimeService,
    private readonly moderation: ChatModerationService,
  ) {}

  async onModuleInit(): Promise<void> {
    const rooms = await this.dataSource.getRepository(ChatRoom).find();
    for (const room of rooms) {
      const oldestRetainedSequence = room.latestSequence - ROOM_MESSAGE_RETENTION + 1;
      if (oldestRetainedSequence <= 1) continue;
      await this.dataSource.getRepository(ChatMessage).delete({
        roomSlug: room.slug,
        sequence: LessThanOrEqual(oldestRetainedSequence - 1),
      });
    }
  }

  async listRooms(userId: string): Promise<{ items: ChatRoomView[]; serverTime: string }> {
    assertCommunityChatEnabled();
    await this.activeUser(this.dataSource.manager, userId);
    const rooms = await this.dataSource.getRepository(ChatRoom).find();
    rooms.sort(
      (left, right) =>
        CHAT_ROOM_SLUGS.indexOf(left.slug) - CHAT_ROOM_SLUGS.indexOf(right.slug),
    );
    const mentionCandidates = await this.mentionCandidates(userId);
    const items = await Promise.all(
      rooms.map((room) => this.roomView(userId, room, mentionCandidates)),
    );
    return { items, serverTime: new Date().toISOString() };
  }

  async room(userId: string, roomSlug: string): Promise<ChatRoomView> {
    assertCommunityChatEnabled();
    await this.activeUser(this.dataSource.manager, userId);
    return this.roomView(userId, await this.requireRoom(this.dataSource.manager, roomSlug));
  }

  async history(
    userId: string,
    roomSlug: string,
    query: { afterSequence?: number; beforeSequence?: number; limit?: number },
  ): Promise<ChatHistoryPage> {
    assertCommunityChatEnabled();
    await this.activeUser(this.dataSource.manager, userId);
    const room = await this.requireRoom(this.dataSource.manager, roomSlug);
    if (query.afterSequence !== undefined && query.beforeSequence !== undefined) {
      throw chatException('CHAT_INVALID_CURSOR', '不能同时使用前向和后向游标。');
    }
    const limit = query.limit ?? HISTORY_DEFAULT_LIMIT;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > HISTORY_MAX_LIMIT) {
      throw chatException('CHAT_INVALID_LIMIT', 'limit 必须在 1 到 200 之间。');
    }
    for (const value of [query.afterSequence, query.beforeSequence]) {
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
        throw chatException('CHAT_INVALID_CURSOR', '消息游标无效。');
      }
    }

    const repo = this.dataSource.getRepository(ChatMessage);
    let rows: ChatMessage[];
    if (query.afterSequence !== undefined) {
      rows = await repo.find({
        where: { roomSlug: room.slug, sequence: MoreThan(query.afterSequence) },
        order: { sequence: 'ASC' },
        take: limit,
      });
    } else {
      rows = await repo.find({
        where: {
          roomSlug: room.slug,
          ...(query.beforeSequence === undefined
            ? {}
            : { sequence: LessThan(query.beforeSequence) }),
        },
        order: { sequence: 'DESC' },
        take: limit,
      });
      rows.reverse();
    }

    const first = rows[0]?.sequence;
    const last = rows.at(-1)?.sequence;
    const hasMoreBefore =
      first !== undefined &&
      (await repo.exist({ where: { roomSlug: room.slug, sequence: LessThan(first) } }));
    const hasMoreAfter =
      last !== undefined &&
      (await repo.exist({ where: { roomSlug: room.slug, sequence: MoreThan(last) } }));
    const items = await this.historyMessageViews(userId, rows);
    return {
      items,
      latestSequence: room.latestSequence,
      oldestSequence: first ?? null,
      hasMoreBefore,
      ...(hasMoreBefore && first !== undefined ? { nextBeforeSequence: first } : {}),
      hasMoreAfter,
      ...(hasMoreAfter && last !== undefined ? { nextAfterSequence: last } : {}),
    };
  }

  async issueSocketTicket(
    userId: string,
    sessionId: string,
  ): Promise<{ ticket: string; expiresAt: string; protocolVersion: 1 }> {
    assertCommunityChatEnabled();
    const manager = this.dataSource.manager;
    await this.activeUser(manager, userId);
    const session = await manager.getRepository(AuthSession).findOne({
      where: { id: sessionId, userId },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw chatException('INVALID_SESSION', '登录会话已失效。', 401);
    }

    const id = randomUUID();
    const raw = `${id}.${randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + TICKET_TTL_MS);
    await manager.getRepository(ChatSocketTicket).save(
      manager.getRepository(ChatSocketTicket).create({
        id,
        ticketHash: sha256(raw),
        userId,
        sessionId,
        expiresAt,
        consumedAt: null,
      }),
    );
    return { ticket: raw, expiresAt: expiresAt.toISOString(), protocolVersion: 1 };
  }

  async consumeSocketTicket(raw: string): Promise<ChatPrincipal> {
    assertCommunityChatEnabled();
    const [id, secret, ...rest] = raw.split('.');
    if (!isUuid(id) || !secret || rest.length > 0 || raw.length > 180) {
      throw chatException('CHAT_TICKET_INVALID', '连接凭证无效。', 401);
    }
    return this.dataSource.transaction(async (manager) => {
      const ticket = await manager.getRepository(ChatSocketTicket).findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      const actualHash = sha256(raw);
      if (
        !ticket ||
        !safeHashEqual(ticket.ticketHash, actualHash) ||
        ticket.consumedAt !== null ||
        ticket.expiresAt.getTime() <= Date.now()
      ) {
        throw chatException('CHAT_TICKET_INVALID', '连接凭证无效或已使用。', 401);
      }
      const [user, session] = await Promise.all([
        manager.getRepository(User).findOne({ where: { id: ticket.userId } }),
        manager.getRepository(AuthSession).findOne({
          where: { id: ticket.sessionId, userId: ticket.userId },
        }),
      ]);
      if (
        !user ||
        user.accountStatus !== 'active' ||
        !session ||
        session.revokedAt !== null ||
        session.expiresAt.getTime() <= Date.now()
      ) {
        throw chatException('INVALID_SESSION', '登录会话已失效。', 401);
      }
      ticket.consumedAt = new Date();
      await manager.getRepository(ChatSocketTicket).save(ticket);
      return { userId: ticket.userId, sessionId: ticket.sessionId };
    });
  }

  async send(userId: string, input: SendChatMessageInput): Promise<ChatMessageView> {
    assertCommunityChatEnabled();
    assertChatWritesEnabled();
    if (!this.realtime.isAvailable() || !this.moderation.isAvailable()) {
      throw chatException('CHAT_ROOM_READ_ONLY', '聊天室当前为只读状态。', 503);
    }
    const normalized = await this.normalizeSendInput(input);
    const hash = requestHash(normalized);
    const existing = await this.dataSource.getRepository(ChatMessage).findOne({
      where: { authorId: userId, clientMessageId: normalized.clientMessageId },
    });
    if (existing) return this.idempotentMessage(userId, existing, hash);

    const author = await this.activeUser(this.dataSource.manager, userId);
    const proposedMessageId = randomUUID();
    const moderation = await this.moderation.moderate({
      messageId: proposedMessageId,
      roomSlug: normalized.roomSlug,
      authorPublicId: author.publicId,
      body: normalized.body,
    });
    if (moderation.decision === 'reject') {
      throw chatException('CHAT_MESSAGE_REJECTED', '消息未通过安全审核。', 422);
    }
    if (moderation.decision === 'review') {
      throw chatException('CHAT_MESSAGE_PENDING_REVIEW', '消息正在等待人工审核。', 409);
    }

    let created: ChatMessage;
    try {
      created = await this.dataSource.transaction(async (manager) => {
        await this.activeUser(manager, userId);
        const room = await this.requireRoom(manager, normalized.roomSlug, true);
        const replay = await manager.getRepository(ChatMessage).findOne({
          where: { authorId: userId, clientMessageId: normalized.clientMessageId },
        });
        if (replay) {
          if (replay.requestHash !== hash) {
            throw chatException(
              'CHAT_IDEMPOTENCY_CONFLICT',
              'clientMessageId 已被另一条消息使用。',
              409,
            );
          }
          return replay;
        }
        this.assertWritableRoom(room);
        await this.assertSlowMode(manager, userId, room);
        const reply = await this.validateReply(manager, room.slug, normalized.replyToMessageId);
        const mentionedUsers = await this.validateMentions(
          manager,
          userId,
          normalized.mentionPublicIds,
        );

        room.latestSequence += 1;
        await manager.getRepository(ChatRoom).save(room);
        const message = await manager.getRepository(ChatMessage).save(
          manager.getRepository(ChatMessage).create({
            id: proposedMessageId,
            roomSlug: room.slug,
            authorId: userId,
            clientMessageId: normalized.clientMessageId,
            requestHash: hash,
            sequence: room.latestSequence,
            body: normalized.body,
            replyToMessageId: reply?.id ?? null,
            status: 'visible',
            version: 1,
            moderationProvider: moderation.provider,
            moderationDecision: 'allow',
            moderationReference: moderation.reference,
            withdrawnAt: null,
          }),
        );
        if (mentionedUsers.length > 0) {
          await manager.getRepository(ChatMessageMention).save(
            mentionedUsers.map((user) =>
              manager.getRepository(ChatMessageMention).create({
                messageId: message.id,
                mentionedUserId: user.id,
              }),
            ),
          );
        }
        await this.createMessageNotifications(manager, message, author, reply, mentionedUsers);
        const oldestRetainedSequence = room.latestSequence - ROOM_MESSAGE_RETENTION + 1;
        if (oldestRetainedSequence > 1) {
          await manager.getRepository(ChatMessage).delete({
            roomSlug: room.slug,
            sequence: LessThanOrEqual(oldestRetainedSequence - 1),
          });
        }
        return message;
      });
    } catch (error) {
      if (error instanceof ChatException) throw error;
      if (isUniqueViolation(error)) {
        const replay = await this.dataSource.getRepository(ChatMessage).findOne({
          where: { authorId: userId, clientMessageId: normalized.clientMessageId },
        });
        if (replay) return this.idempotentMessage(userId, replay, hash);
      }
      throw error;
    }
    return this.messageView(userId, created);
  }

  async withdraw(userId: string, roomSlug: string, messageId: string): Promise<ChatMessageView> {
    assertCommunityChatEnabled();
    assertChatWritesEnabled();
    if (!isUuid(messageId)) throw chatException('CHAT_MESSAGE_NOT_FOUND', '消息不存在。', 404);
    const updated = await this.dataSource.transaction(async (manager) => {
      await this.activeUser(manager, userId);
      const room = await this.requireRoom(manager, roomSlug);
      const message = await manager.getRepository(ChatMessage).findOne({
        where: { id: messageId, roomSlug: room.slug },
        lock: { mode: 'pessimistic_write' },
      });
      if (!message) throw chatException('CHAT_MESSAGE_NOT_FOUND', '消息不存在。', 404);
      if (message.authorId !== userId) {
        throw chatException('CHAT_WITHDRAW_FORBIDDEN', '只能撤回自己的消息。', 403);
      }
      if (message.status === 'withdrawn') return message;
      if (Date.now() > message.createdAt.getTime() + WITHDRAW_WINDOW_MS) {
        throw chatException(
          'CHAT_WITHDRAW_WINDOW_EXPIRED',
          '消息已超过两分钟撤回期限。',
          409,
        );
      }
      message.status = 'withdrawn';
      message.withdrawnAt = new Date();
      message.version += 1;
      return manager.getRepository(ChatMessage).save(message);
    });
    return this.messageView(userId, updated);
  }

  async publishMessageEvent(
    kind: 'created' | 'updated',
    roomSlug: ChatRoomSlug,
    messageId: string,
  ): Promise<void> {
    await this.realtime.publish({ kind, roomSlug, messageId });
  }

  async report(
    userId: string,
    messageId: string,
    idempotencyKey: string,
    input: { reason?: unknown; detail?: unknown },
  ): Promise<{ reportId: string; status: 'received' }> {
    assertCommunityChatEnabled();
    await this.activeUser(this.dataSource.manager, userId);
    if (!isUuid(messageId)) throw chatException('CHAT_MESSAGE_NOT_FOUND', '消息不存在。', 404);
    if (!idempotencyKey || idempotencyKey.length > 160) {
      throw chatException('IDEMPOTENCY_KEY_REQUIRED', '缺少有效的 Idempotency-Key。');
    }
    const reason = String(input.reason ?? '') as ChatReportReason;
    if (!REPORT_REASONS.has(reason)) throw chatException('CHAT_REPORT_INVALID', '举报原因无效。');
    const detail = input.detail === undefined ? null : String(input.detail).normalize('NFC').trim();
    if (detail && unicodeLength(detail) > 500) {
      throw chatException('CHAT_REPORT_INVALID', '补充说明不能超过 500 个字符。');
    }
    const keyHash = sha256(idempotencyKey);
    const hash = requestHash({ messageId, reason, detail });
    try {
      return await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(ChatMessageReport);
        const replay = await repo.findOne({
          where: { reporterId: userId, idempotencyKeyHash: keyHash },
        });
        if (replay) {
          if (replay.requestHash !== hash) {
            throw chatException('IDEMPOTENCY_CONFLICT', '幂等键已用于另一份举报。', 409);
          }
          return { reportId: replay.id, status: 'received' as const };
        }
        const message = await manager
          .getRepository(ChatMessage)
          .findOne({ where: { id: messageId } });
        if (!message) throw chatException('CHAT_MESSAGE_NOT_FOUND', '消息不存在。', 404);
        const created = await repo.save(
          repo.create({
            messageId,
            reporterId: userId,
            reason,
            detail: detail || null,
            bodyHash: sha256(message.body),
            idempotencyKeyHash: keyHash,
            requestHash: hash,
            status: 'received',
          }),
        );
        return { reportId: created.id, status: 'received' as const };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const replay = await this.dataSource.getRepository(ChatMessageReport).findOne({
        where: { reporterId: userId, idempotencyKeyHash: keyHash },
      });
      if (!replay) throw error;
      if (replay.requestHash !== hash) {
        throw chatException('IDEMPOTENCY_CONFLICT', '幂等键已用于另一份举报。', 409);
      }
      return { reportId: replay.id, status: 'received' as const };
    }
  }

  async messageForViewer(userId: string, messageId: string): Promise<ChatMessageView> {
    assertCommunityChatEnabled();
    await this.activeUser(this.dataSource.manager, userId);
    const message = await this.dataSource.getRepository(ChatMessage).findOne({ where: { id: messageId } });
    if (!message) throw chatException('CHAT_MESSAGE_NOT_FOUND', '消息不存在。', 404);
    return this.messageView(userId, message);
  }

  private async roomView(
    userId: string,
    room: ChatRoom,
    preloadedMentionCandidates?: ChatMentionCandidateView[],
  ): Promise<ChatRoomView> {
    const forcedReadOnly =
      !isChatWritesEnabled() || !this.realtime.isAvailable() || !this.moderation.isAvailable();
    const [presenceBand, mentionCandidates, retryAfterSeconds] = await Promise.all([
      this.realtime.presenceBand(room.slug),
      preloadedMentionCandidates ?? this.mentionCandidates(userId),
      this.retryAfter(userId, room),
    ]);
    return {
      slug: room.slug,
      name: room.name,
      description: room.description,
      readOnly: room.readOnly || forcedReadOnly,
      closed: room.closed,
      slowModeSeconds: room.slowModeSeconds,
      retryAfterSeconds,
      presenceBand,
      latestSequence: room.latestSequence,
      mentionCandidates,
    };
  }

  private async retryAfter(userId: string, room: ChatRoom): Promise<number | null> {
    if (room.slowModeSeconds <= 0) return null;
    const last = await this.dataSource.getRepository(ChatMessage).findOne({
      where: { roomSlug: room.slug, authorId: userId },
      order: { createdAt: 'DESC' },
    });
    if (!last) return null;
    const remaining = Math.ceil(
      (last.createdAt.getTime() + room.slowModeSeconds * 1_000 - Date.now()) / 1_000,
    );
    return remaining > 0 ? remaining : null;
  }

  private async mentionCandidates(userId: string): Promise<ChatMentionCandidateView[]> {
    const manager = this.dataSource.manager;
    const friendships = await manager.getRepository(Friendship).find({
      where: [
        { userLowId: userId, endedAt: IsNull() },
        { userHighId: userId, endedAt: IsNull() },
      ],
      take: 200,
    });
    const candidateIds = friendships.map((friendship) =>
      friendship.userLowId === userId ? friendship.userHighId : friendship.userLowId,
    );
    if (candidateIds.length === 0) return [];
    const blocks = await manager.getRepository(UserBlock).find({
      where: [
        { blockerId: userId, blockedId: In(candidateIds) },
        { blockerId: In(candidateIds), blockedId: userId },
      ],
    });
    const blocked = new Set(
      blocks.map((block) => (block.blockerId === userId ? block.blockedId : block.blockerId)),
    );
    const allowedIds = candidateIds.filter((id) => !blocked.has(id));
    if (allowedIds.length === 0) return [];
    const [users, profiles] = await Promise.all([
      manager.getRepository(User).find({ where: { id: In(allowedIds), accountStatus: 'active' } }),
      manager.getRepository(PlayerProfile).find({ where: { userId: In(allowedIds) } }),
    ]);
    const profileByUser = new Map(profiles.map((profile) => [profile.userId, profile]));
    return users
      .map((user) => {
        const profile = profileByUser.get(user.id);
        return {
          publicId: user.publicId,
          displayName: profile?.nickname ?? user.displayName ?? '社区用户',
          ...(profile?.avatarKey ? { avatarKey: profile.avatarKey } : {}),
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'zh-CN'));
  }

  private async historyMessageViews(
    userId: string,
    messages: readonly ChatMessage[],
  ): Promise<ChatMessageView[]> {
    if (messages.length === 0) return [];
    const manager = this.dataSource.manager;
    const messageIds = messages.map((message) => message.id);
    const replyIds = [
      ...new Set(
        messages
          .map((message) => message.replyToMessageId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const [mentions, replyRows] = await Promise.all([
      manager.getRepository(ChatMessageMention).find({
        where: { messageId: In(messageIds) },
      }),
      replyIds.length > 0
        ? manager.getRepository(ChatMessage).find({ where: { id: In(replyIds) } })
        : Promise.resolve([]),
    ]);
    const authorIds = [
      ...new Set([
        ...messages.map((message) => message.authorId),
        ...replyRows.map((reply) => reply.authorId),
      ]),
    ];
    const identityIds = [
      ...new Set([
        ...authorIds,
        ...mentions.map((mention) => mention.mentionedUserId),
      ]),
    ];
    const [users, profiles, blocks] = await Promise.all([
      manager.getRepository(User).find({ where: { id: In(identityIds) } }),
      manager.getRepository(PlayerProfile).find({
        where: { userId: In(authorIds) },
      }),
      manager.getRepository(UserBlock).find({
        where: [
          { blockerId: userId, blockedId: In(authorIds) },
          { blockerId: In(authorIds), blockedId: userId },
        ],
      }),
    ]);
    const mentionsByMessage = new Map<string, string[]>();
    for (const mention of mentions) {
      const ids = mentionsByMessage.get(mention.messageId) ?? [];
      ids.push(mention.mentionedUserId);
      mentionsByMessage.set(mention.messageId, ids);
    }
    const context: ChatHistoryViewContext = {
      users: new Map(users.map((user) => [user.id, user])),
      profiles: new Map(profiles.map((profile) => [profile.userId, profile])),
      mentionsByMessage,
      replies: new Map(replyRows.map((reply) => [reply.id, reply])),
      blockedUserIds: new Set(
        blocks.map((block) =>
          block.blockerId === userId ? block.blockedId : block.blockerId,
        ),
      ),
    };
    return messages.map((message) =>
      this.historyMessageView(userId, message, context),
    );
  }

  private historyMessageView(
    userId: string,
    message: ChatMessage,
    context: ChatHistoryViewContext,
  ): ChatMessageView {
    const author = context.users.get(message.authorId);
    if (!author) {
      throw chatException('CHAT_MESSAGE_NOT_FOUND', '消息不存在。', 404);
    }
    const authorProfile = context.profiles.get(message.authorId);
    const mentionedUsers = (context.mentionsByMessage.get(message.id) ?? [])
      .map((id) => context.users.get(id))
      .filter((user): user is User => Boolean(user && user.accountStatus === 'active'));
    const baseVisibility = statusVisibility(message.status);
    const deletedAuthor = author.accountStatus === 'deleted';
    const visibility = deletedAuthor
      ? 'withdrawn_placeholder'
      : context.blockedUserIds.has(message.authorId) && baseVisibility === 'visible'
        ? 'blocked_placeholder'
        : baseVisibility;
    const withdrawUntil = new Date(message.createdAt.getTime() + WITHDRAW_WINDOW_MS);
    return {
      id: message.id,
      roomSlug: message.roomSlug,
      sequence: message.sequence,
      version: message.version,
      ...(message.authorId === userId ? { clientMessageId: message.clientMessageId } : {}),
      visibility,
      body: visibility === 'visible' ? message.body : null,
      author: deletedAuthor
        ? { publicId: DELETED_USER_PUBLIC_ID, displayName: '已注销用户' }
        : {
            publicId: author.publicId,
            displayName: authorProfile?.nickname ?? author.displayName ?? '社区用户',
            ...(authorProfile?.avatarKey ? { avatarKey: authorProfile.avatarKey } : {}),
            ...(authorProfile?.battleProfession
              ? { battleProfession: authorProfile.battleProfession }
              : {}),
          },
      replyTo: this.historyReplyView(message.replyToMessageId, context),
      mentionPublicIds: mentionedUsers.map((user) => user.publicId),
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
      permissions: {
        canWithdraw:
          !deletedAuthor &&
          message.authorId === userId &&
          message.status === 'visible' &&
          withdrawUntil.getTime() > Date.now(),
        withdrawUntil:
          !deletedAuthor && message.authorId === userId && message.status === 'visible'
            ? withdrawUntil.toISOString()
            : null,
        canReport: !deletedAuthor && message.authorId !== userId,
      },
    };
  }

  private historyReplyView(
    replyId: string | null,
    context: ChatHistoryViewContext,
  ): ChatMessageView['replyTo'] {
    if (!replyId) return null;
    const reply = context.replies.get(replyId);
    if (!reply) return null;
    const author = context.users.get(reply.authorId);
    if (!author) return null;
    const profile = context.profiles.get(reply.authorId);
    const baseVisibility = statusVisibility(reply.status);
    const deletedAuthor = author.accountStatus === 'deleted';
    const visibility = deletedAuthor
      ? 'withdrawn_placeholder'
      : context.blockedUserIds.has(reply.authorId) && baseVisibility === 'visible'
        ? 'blocked_placeholder'
        : baseVisibility;
    return {
      messageId: reply.id,
      authorDisplayName: deletedAuthor
        ? '已注销用户'
        : profile?.nickname ?? author.displayName ?? '社区用户',
      bodyPreview: visibility === 'visible' ? codePointSlice(reply.body, 80) : null,
      visibility,
    };
  }

  private async messageView(userId: string, message: ChatMessage): Promise<ChatMessageView> {
    const manager = this.dataSource.manager;
    const [author, authorProfile, mentions, blocked] = await Promise.all([
      manager.getRepository(User).findOne({ where: { id: message.authorId } }),
      manager.getRepository(PlayerProfile).findOne({ where: { userId: message.authorId } }),
      manager.getRepository(ChatMessageMention).find({ where: { messageId: message.id } }),
      this.isBlocked(manager, userId, message.authorId),
    ]);
    if (!author) throw chatException('CHAT_MESSAGE_NOT_FOUND', '消息不存在。', 404);
    const mentionedUsers =
      mentions.length === 0
        ? []
        : await manager.getRepository(User).find({
            where: {
              id: In(mentions.map((mention) => mention.mentionedUserId)),
              accountStatus: 'active',
            },
          });
    const baseVisibility = statusVisibility(message.status);
    const deletedAuthor = author.accountStatus === 'deleted';
    const visibility = deletedAuthor
      ? 'withdrawn_placeholder'
      : blocked && baseVisibility === 'visible'
        ? 'blocked_placeholder'
        : baseVisibility;
    const withdrawUntil = new Date(message.createdAt.getTime() + WITHDRAW_WINDOW_MS);
    return {
      id: message.id,
      roomSlug: message.roomSlug,
      sequence: message.sequence,
      version: message.version,
      ...(message.authorId === userId ? { clientMessageId: message.clientMessageId } : {}),
      visibility,
      body: visibility === 'visible' ? message.body : null,
      author: deletedAuthor
        ? {
            publicId: DELETED_USER_PUBLIC_ID,
            displayName: '已注销用户',
          }
        : {
            publicId: author.publicId,
            displayName: authorProfile?.nickname ?? author.displayName ?? '社区用户',
            ...(authorProfile?.avatarKey ? { avatarKey: authorProfile.avatarKey } : {}),
            ...(authorProfile?.battleProfession
              ? { battleProfession: authorProfile.battleProfession }
              : {}),
          },
      replyTo: await this.replyView(userId, message.replyToMessageId),
      mentionPublicIds: mentionedUsers.map((user) => user.publicId),
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
      permissions: {
        canWithdraw:
          !deletedAuthor &&
          message.authorId === userId &&
          message.status === 'visible' &&
          withdrawUntil.getTime() > Date.now(),
        withdrawUntil:
          !deletedAuthor && message.authorId === userId && message.status === 'visible'
            ? withdrawUntil.toISOString()
            : null,
        canReport: !deletedAuthor && message.authorId !== userId,
      },
    };
  }

  private async replyView(
    viewerId: string,
    replyId: string | null,
  ): Promise<ChatMessageView['replyTo']> {
    if (!replyId) return null;
    const manager = this.dataSource.manager;
    const reply = await manager.getRepository(ChatMessage).findOne({ where: { id: replyId } });
    if (!reply) return null;
    const [author, profile, blocked] = await Promise.all([
      manager.getRepository(User).findOne({ where: { id: reply.authorId } }),
      manager.getRepository(PlayerProfile).findOne({ where: { userId: reply.authorId } }),
      this.isBlocked(manager, viewerId, reply.authorId),
    ]);
    if (!author) return null;
    const baseVisibility = statusVisibility(reply.status);
    const deletedAuthor = author.accountStatus === 'deleted';
    const visibility = deletedAuthor
      ? 'withdrawn_placeholder'
      : blocked && baseVisibility === 'visible'
        ? 'blocked_placeholder'
        : baseVisibility;
    return {
      messageId: reply.id,
      authorDisplayName: deletedAuthor
        ? '已注销用户'
        : profile?.nickname ?? author.displayName ?? '社区用户',
      bodyPreview: visibility === 'visible' ? codePointSlice(reply.body, 80) : null,
      visibility,
    };
  }

  private async normalizeSendInput(input: SendChatMessageInput): Promise<{
    clientMessageId: string;
    roomSlug: ChatRoomSlug;
    body: string;
    replyToMessageId: string | null;
    mentionPublicIds: string[];
  }> {
    if (!isChatRoomSlug(input.roomSlug)) {
      throw chatException('CHAT_ROOM_NOT_FOUND', '聊天室不存在。', 404);
    }
    const clientMessageId = String(input.clientMessageId ?? '').trim();
    if (!clientMessageId || clientMessageId.length > 100) {
      throw chatException('CHAT_CLIENT_MESSAGE_ID_INVALID', 'clientMessageId 无效。');
    }
    const body = String(input.body ?? '').normalize('NFC').trim();
    const length = unicodeLength(body);
    if (length < 1 || length > 500) {
      throw chatException('CHAT_MESSAGE_TOO_LONG', '消息须为 1 到 500 个字符。', 422);
    }
    const mentionPublicIds = [...new Set(input.mentionPublicIds ?? [])];
    if (mentionPublicIds.length > 5 || mentionPublicIds.some((id) => !isUuid(id))) {
      throw chatException('CHAT_MENTION_NOT_ALLOWED', '一次最多 @ 5 位允许的好友。', 403);
    }
    if (input.replyToMessageId && !isUuid(input.replyToMessageId)) {
      throw chatException('CHAT_REPLY_NOT_FOUND', '回复的消息不存在。', 404);
    }
    return {
      clientMessageId,
      roomSlug: input.roomSlug,
      body,
      replyToMessageId: input.replyToMessageId ?? null,
      mentionPublicIds: mentionPublicIds.sort(),
    };
  }

  private async activeUser(manager: EntityManager, userId: string): Promise<User> {
    const user = await manager.getRepository(User).findOne({ where: { id: userId } });
    if (!user || user.accountStatus !== 'active') {
      throw chatException('CHAT_ACCOUNT_RESTRICTED', '账号当前不能使用聊天室。', 403);
    }
    return user;
  }

  private async requireRoom(
    manager: EntityManager,
    value: string,
    lock = false,
  ): Promise<ChatRoom> {
    if (!isChatRoomSlug(value)) throw chatException('CHAT_ROOM_NOT_FOUND', '聊天室不存在。', 404);
    const room = await manager.getRepository(ChatRoom).findOne({
      where: { slug: value },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!room) throw chatException('CHAT_ROOM_NOT_FOUND', '聊天室不存在。', 404);
    return room;
  }

  private assertWritableRoom(room: ChatRoom): void {
    if (room.closed) throw chatException('CHAT_ROOM_CLOSED', '聊天室已关闭。', 409);
    if (room.readOnly) throw chatException('CHAT_ROOM_READ_ONLY', '聊天室当前为只读状态。', 409);
  }

  private async assertSlowMode(manager: EntityManager, userId: string, room: ChatRoom): Promise<void> {
    if (room.slowModeSeconds <= 0) return;
    const last = await manager.getRepository(ChatMessage).findOne({
      where: { authorId: userId, roomSlug: room.slug },
      order: { createdAt: 'DESC' },
    });
    if (!last) return;
    const remaining = Math.ceil(
      (last.createdAt.getTime() + room.slowModeSeconds * 1_000 - Date.now()) / 1_000,
    );
    if (remaining > 0) {
      throw chatException('CHAT_SLOW_MODE', '发送太快，请稍后再试。', 429, remaining);
    }
  }

  private async validateReply(
    manager: EntityManager,
    roomSlug: ChatRoomSlug,
    replyId: string | null,
  ): Promise<ChatMessage | null> {
    if (!replyId) return null;
    const reply = await manager.getRepository(ChatMessage).findOne({ where: { id: replyId } });
    if (!reply || reply.roomSlug !== roomSlug) {
      throw chatException('CHAT_REPLY_NOT_FOUND', '回复的消息不存在于当前房间。', 404);
    }
    return reply;
  }

  private async validateMentions(
    manager: EntityManager,
    authorId: string,
    publicIds: string[],
  ): Promise<User[]> {
    if (publicIds.length === 0) return [];
    const users = await manager.getRepository(User).find({
      where: { publicId: In(publicIds), accountStatus: 'active' },
    });
    if (users.length !== publicIds.length) {
      throw chatException('CHAT_MENTION_NOT_ALLOWED', '只能 @ 允许的好友。', 403);
    }
    for (const user of users) {
      if (
        user.id === authorId ||
        (await this.isBlocked(manager, authorId, user.id)) ||
        !(await this.isFriend(manager, authorId, user.id))
      ) {
        throw chatException('CHAT_MENTION_NOT_ALLOWED', '只能 @ 允许的好友。', 403);
      }
    }
    return users;
  }

  private async isFriend(manager: EntityManager, left: string, right: string): Promise<boolean> {
    const [userLowId, userHighId] = left < right ? [left, right] : [right, left];
    return manager.getRepository(Friendship).exist({
      where: { userLowId, userHighId, endedAt: IsNull() },
    });
  }

  private async isBlocked(manager: EntityManager, left: string, right: string): Promise<boolean> {
    if (left === right) return false;
    return manager.getRepository(UserBlock).exist({
      where: [
        { blockerId: left, blockedId: right },
        { blockerId: right, blockedId: left },
      ],
    });
  }

  private async createMessageNotifications(
    manager: EntityManager,
    message: ChatMessage,
    author: User,
    reply: ChatMessage | null,
    mentions: User[],
  ): Promise<void> {
    const recipients = new Map<string, 'chat.mentioned' | 'chat.replied'>();
    if (reply && reply.authorId !== author.id) recipients.set(reply.authorId, 'chat.replied');
    for (const mentioned of mentions) {
      if (mentioned.id !== author.id) recipients.set(mentioned.id, 'chat.mentioned');
    }
    if (recipients.size === 0) return;
    const now = new Date();
    await manager.getRepository(CommunityNotification).save(
      [...recipients].map(([userId, eventType]) =>
        manager.getRepository(CommunityNotification).create({
          userId,
          actorUserId: author.id,
          category: 'reply',
          eventType,
          resourceType: 'chat_message',
          resourceId: message.id,
          payload: { roomSlug: message.roomSlug, messageId: message.id },
          dedupeKey: `${eventType}:${message.id}:${userId}`,
          readAt: null,
          availableAt: now,
          expiresAt: null,
        }),
      ),
    );
  }

  private async idempotentMessage(
    userId: string,
    message: ChatMessage,
    requestHashValue: string,
  ): Promise<ChatMessageView> {
    if (message.requestHash !== requestHashValue) {
      throw chatException(
        'CHAT_IDEMPOTENCY_CONFLICT',
        'clientMessageId 已被另一条消息使用。',
        409,
      );
    }
    return this.messageView(userId, message);
  }
}

function unicodeLength(value: string): number {
  return [...value].length;
}

function codePointSlice(value: string, length: number): string {
  return [...value].slice(0, length).join('');
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function requestHash(value: unknown): string {
  return sha256(JSON.stringify(value));
}

function safeHashEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(actual, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function isUuid(value: string | undefined): value is string {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
  );
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505');
}
