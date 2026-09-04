import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  LessThan,
  MoreThan,
} from 'typeorm';

import {
  DirectConversation,
  DirectConversationMember,
  DirectMessage,
  DirectMessageReport,
  Friendship,
  PlayerProfile,
  User,
  UserBlock,
} from '../../database/entities';
import type {
  DirectMessageReportReason,
  DirectMessageStatus,
} from '../../database/entities/direct-message.entity';
import {
  assertChatWritesEnabled,
  assertCommunityChatEnabled,
  isChatWritesEnabled,
} from './chat-gates';
import { ChatException, chatException } from './chat.errors';
import { ChatModerationService } from './chat-moderation.service';
import { ChatRealtimeService } from './chat-realtime.service';

const PAGE_SIZE = 30;
const HISTORY_DEFAULT_LIMIT = 50;
const HISTORY_MAX_LIMIT = 200;
const WITHDRAW_WINDOW_MS = 120_000;
const MAX_UNREAD_COUNT = 2_147_483_647;
const DELETED_USER_PUBLIC_ID = '00000000-0000-4000-8000-000000000000';
const REPORT_REASONS = new Set<DirectMessageReportReason>([
  'harassment',
  'spam',
  'privacy',
  'illegal',
  'other',
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface DirectMessageFriendView {
  publicId: string;
  username?: string;
  displayName: string;
  avatarKey: string;
  battleProfession: string;
}

export type DirectMessageVisibility =
  | 'visible'
  | 'withdrawn_placeholder'
  | 'moderated_placeholder';

export interface DirectMessageView {
  id: string;
  conversationId: string;
  sequence: number;
  version: number;
  clientMessageId?: string;
  visibility: DirectMessageVisibility;
  body: string | null;
  author: DirectMessageFriendView;
  replyTo: {
    messageId: string;
    authorDisplayName: string;
    bodyPreview: string | null;
    visibility: DirectMessageVisibility;
  } | null;
  createdAt: string;
  updatedAt: string;
  permissions: {
    canWithdraw: boolean;
    withdrawUntil: string | null;
    canReport: boolean;
  };
}

export interface DirectConversationView {
  id: string;
  friend: DirectMessageFriendView;
  latestSequence: number;
  lastMessage: DirectMessageView | null;
  unreadCount: number;
  canSend: boolean;
  updatedAt: string;
}

export interface DirectConversationPage {
  items: DirectConversationView[];
  nextCursor: string | null;
  totalUnread: number;
}

export interface DirectMessageHistoryPage {
  items: DirectMessageView[];
  latestSequence: number;
  oldestSequence: number | null;
  hasMoreBefore: boolean;
  nextBeforeSequence?: number;
  hasMoreAfter: boolean;
  nextAfterSequence?: number;
}

export interface SendDirectMessageInput {
  conversationId: string;
  clientMessageId: string;
  body: string;
  replyToMessageId?: string;
}

export interface DirectReadView {
  conversationId: string;
  lastReadSequence: number;
  unreadCount: number;
}

interface ConversationAccess {
  conversation: DirectConversation;
  member: DirectConversationMember;
  otherUserId: string;
}

interface DirectMessageViewContext {
  users: Map<string, User>;
  profiles: Map<string, PlayerProfile>;
  replies: Map<string, DirectMessage>;
}

@Injectable()
export class DirectMessageService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly realtime: ChatRealtimeService,
    private readonly moderation: ChatModerationService,
  ) {}

  async listConversations(
    userId: string,
    cursor?: string,
  ): Promise<DirectConversationPage> {
    assertCommunityChatEnabled();
    await this.activeUser(this.dataSource.manager, userId);
    const members = await this.dataSource.getRepository(DirectConversationMember).find({
      where: { userId },
      relations: { conversation: true },
    });
    const structurallyValid = members.filter((member) =>
      this.otherParticipant(member.conversation, userId) !== null,
    );
    const otherUserIds = structurallyValid
      .map((member) => this.otherParticipant(member.conversation, userId))
      .filter((id): id is string => id !== null);
    const blockedIds = await this.blockedUserIds(
      this.dataSource.manager,
      userId,
      otherUserIds,
    );
    const visible = structurallyValid
      .filter((member) => {
        const otherId = this.otherParticipant(member.conversation, userId);
        return otherId !== null && !blockedIds.has(otherId);
      })
      .sort((left, right) => {
        const byTime =
          this.conversationActivity(right.conversation).getTime() -
          this.conversationActivity(left.conversation).getTime();
        return byTime || right.conversationId.localeCompare(left.conversationId);
      });
    const cursorPosition = this.decodeConversationCursor(cursor);
    const afterCursor = cursorPosition
      ? visible.filter((member) => {
          const activity = this.conversationActivity(member.conversation);
          return (
            activity.getTime() < cursorPosition.updatedAt.getTime() ||
            (activity.getTime() === cursorPosition.updatedAt.getTime() &&
              member.conversationId < cursorPosition.id)
          );
        })
      : visible;
    const page = afterCursor.slice(0, PAGE_SIZE);
    const hasMore = afterCursor.length > PAGE_SIZE;
    return {
      items: await this.conversationViews(userId, page),
      nextCursor:
        hasMore && page.length > 0
          ? this.conversationCursor(page.at(-1)!.conversation)
          : null,
      totalUnread: visible.reduce(
        (total, member) => total + member.unreadCount,
        0,
      ),
    };
  }

  async openConversation(
    userId: string,
    friendPublicId: string,
  ): Promise<DirectConversationView> {
    assertCommunityChatEnabled();
    assertChatWritesEnabled();
    if (!isUuid(friendPublicId)) {
      throw chatException('CHAT_DIRECT_FRIEND_NOT_FOUND', '好友不存在。', 404);
    }
    let conversationId: string;
    try {
      conversationId = await this.dataSource.transaction(async (manager) => {
        const friend = await manager.getRepository(User).findOne({
          where: { publicId: friendPublicId, accountStatus: 'active' },
        });
        if (!friend) {
          throw chatException('CHAT_DIRECT_FRIEND_NOT_FOUND', '好友不存在。', 404);
        }
        if (friend.id === userId) {
          throw chatException('CHAT_DIRECT_SELF_NOT_ALLOWED', '不能和自己建立私聊。');
        }
        await this.lockActiveUsers(manager, [userId, friend.id]);
        if (await this.isBlocked(manager, userId, friend.id)) {
          throw chatException('CHAT_DIRECT_UNAVAILABLE', '无法与该用户建立私聊。', 403);
        }
        if (!(await this.isFriend(manager, userId, friend.id))) {
          throw chatException('CHAT_DIRECT_FRIEND_REQUIRED', '只能和好友私聊。', 403);
        }
        const [userLowId, userHighId] = pair(userId, friend.id);
        const conversationRepo = manager.getRepository(DirectConversation);
        let conversation = await conversationRepo.findOne({
          where: { userLowId, userHighId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!conversation) {
          conversation = await conversationRepo.save(
            conversationRepo.create({
              userLowId,
              userHighId,
              latestSequence: 0,
              lastMessageAt: null,
            }),
          );
          const memberRepo = manager.getRepository(DirectConversationMember);
          await memberRepo.save(
            [userLowId, userHighId].map((participantId) =>
              memberRepo.create({
                conversationId: conversation!.id,
                userId: participantId,
                lastReadSequence: 0,
                unreadCount: 0,
                mutedAt: null,
              }),
            ),
          );
        }
        return conversation.id;
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      conversationId = await this.conversationIdAfterCreateRace(
        userId,
        friendPublicId,
        error,
      );
    }
    return this.conversationForViewer(userId, conversationId);
  }

  async history(
    userId: string,
    conversationId: string,
    query: { afterSequence?: number; beforeSequence?: number; limit?: number },
  ): Promise<DirectMessageHistoryPage> {
    assertCommunityChatEnabled();
    const access = await this.requireConversation(
      this.dataSource.manager,
      userId,
      conversationId,
    );
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

    const repo = this.dataSource.getRepository(DirectMessage);
    let rows: DirectMessage[];
    if (query.afterSequence !== undefined) {
      rows = await repo.find({
        where: {
          conversationId: access.conversation.id,
          sequence: MoreThan(query.afterSequence),
        },
        order: { sequence: 'ASC' },
        take: limit,
      });
    } else {
      rows = await repo.find({
        where: {
          conversationId: access.conversation.id,
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
    const [hasMoreBefore, hasMoreAfter] = await Promise.all([
      first === undefined
        ? Promise.resolve(false)
        : repo.exist({
            where: {
              conversationId: access.conversation.id,
              sequence: LessThan(first),
            },
          }),
      last === undefined
        ? Promise.resolve(false)
        : repo.exist({
            where: {
              conversationId: access.conversation.id,
              sequence: MoreThan(last),
            },
          }),
    ]);
    return {
      items: await this.messageViews(userId, rows),
      latestSequence: access.conversation.latestSequence,
      oldestSequence: first ?? null,
      hasMoreBefore,
      ...(hasMoreBefore && first !== undefined
        ? { nextBeforeSequence: first }
        : {}),
      hasMoreAfter,
      ...(hasMoreAfter && last !== undefined ? { nextAfterSequence: last } : {}),
    };
  }

  async send(
    userId: string,
    input: SendDirectMessageInput,
  ): Promise<DirectMessageView> {
    assertCommunityChatEnabled();
    assertChatWritesEnabled();
    if (!this.realtime.isAvailable() || !this.moderation.isAvailable()) {
      throw chatException('CHAT_ROOM_READ_ONLY', '私聊当前为只读状态。', 503);
    }
    const normalized = this.normalizeSendInput(input);
    const hash = requestHash(normalized);
    const existing = await this.dataSource.getRepository(DirectMessage).findOne({
      where: { authorId: userId, clientMessageId: normalized.clientMessageId },
    });
    if (existing) return this.idempotentMessage(userId, existing, hash);

    const initialAccess = await this.requireConversation(
      this.dataSource.manager,
      userId,
      normalized.conversationId,
    );
    await this.assertCanSend(
      this.dataSource.manager,
      userId,
      initialAccess.otherUserId,
    );
    const author = await this.activeUser(this.dataSource.manager, userId);
    const proposedMessageId = randomUUID();
    const moderation = await this.moderation.moderate({
      messageId: proposedMessageId,
      roomSlug: 'direct',
      authorPublicId: author.publicId,
      body: normalized.body,
    });
    if (moderation.decision === 'reject') {
      throw chatException('CHAT_MESSAGE_REJECTED', '消息未通过安全审核。', 422);
    }
    if (moderation.decision === 'review') {
      throw chatException('CHAT_MESSAGE_PENDING_REVIEW', '消息正在等待人工审核。', 409);
    }

    let created: DirectMessage;
    try {
      created = await this.dataSource.transaction(async (manager) => {
        const snapshot = await manager.getRepository(DirectConversation).findOne({
          where: { id: normalized.conversationId },
        });
        if (!snapshot || this.otherParticipant(snapshot, userId) === null) {
          throw this.conversationNotFound();
        }
        const otherUserId = this.otherParticipant(snapshot, userId)!;
        await this.lockActiveUsers(manager, [userId, otherUserId]);
        const conversation = await manager.getRepository(DirectConversation).findOne({
          where: { id: normalized.conversationId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!conversation || this.otherParticipant(conversation, userId) !== otherUserId) {
          throw this.conversationNotFound();
        }
        await this.assertCanSend(manager, userId, otherUserId);
        const members = await manager
          .getRepository(DirectConversationMember)
          .createQueryBuilder('member')
          .setLock('pessimistic_write')
          .where('member.conversation_id = :conversationId', {
            conversationId: conversation.id,
          })
          .getMany();
        if (
          members.length !== 2 ||
          !members.some((member) => member.userId === userId) ||
          !members.some((member) => member.userId === otherUserId)
        ) {
          throw this.conversationNotFound();
        }
        const messageRepo = manager.getRepository(DirectMessage);
        const replay = await messageRepo.findOne({
          where: { authorId: userId, clientMessageId: normalized.clientMessageId },
        });
        if (replay) {
          if (replay.requestHash !== hash) throw this.idempotencyConflict();
          return replay;
        }
        const reply = await this.validateReply(
          manager,
          conversation.id,
          normalized.replyToMessageId,
        );
        const now = new Date();
        conversation.latestSequence += 1;
        conversation.lastMessageAt = now;
        await manager.getRepository(DirectConversation).save(conversation);
        const message = await messageRepo.save(
          messageRepo.create({
            id: proposedMessageId,
            conversationId: conversation.id,
            authorId: userId,
            clientMessageId: normalized.clientMessageId,
            requestHash: hash,
            sequence: conversation.latestSequence,
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
        for (const member of members) {
          member.updatedAt = now;
          if (member.userId === userId) {
            member.lastReadSequence = conversation.latestSequence;
            member.unreadCount = 0;
          } else {
            member.unreadCount = Math.min(
              MAX_UNREAD_COUNT,
              member.unreadCount + 1,
            );
          }
        }
        await manager.getRepository(DirectConversationMember).save(members);
        return message;
      });
    } catch (error) {
      if (error instanceof ChatException) throw error;
      if (isUniqueViolation(error)) {
        const replay = await this.dataSource.getRepository(DirectMessage).findOne({
          where: { authorId: userId, clientMessageId: normalized.clientMessageId },
        });
        if (replay) return this.idempotentMessage(userId, replay, hash);
      }
      throw error;
    }
    return this.messageForViewer(userId, created.id);
  }

  async withdraw(
    userId: string,
    conversationId: string,
    messageId: string,
  ): Promise<DirectMessageView> {
    assertCommunityChatEnabled();
    assertChatWritesEnabled();
    if (!isUuid(messageId)) throw this.messageNotFound();
    const updated = await this.dataSource.transaction(async (manager) => {
      await this.requireConversation(manager, userId, conversationId);
      const message = await manager.getRepository(DirectMessage).findOne({
        where: { id: messageId, conversationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!message) throw this.messageNotFound();
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
      return manager.getRepository(DirectMessage).save(message);
    });
    return this.messageForViewer(userId, updated.id);
  }

  async markRead(
    userId: string,
    conversationId: string,
    throughSequence: number,
  ): Promise<DirectReadView> {
    assertCommunityChatEnabled();
    if (!Number.isSafeInteger(throughSequence) || throughSequence < 0) {
      throw chatException('CHAT_INVALID_CURSOR', '已读序号无效。');
    }
    const result = await this.dataSource.transaction(async (manager) => {
      const access = await this.requireConversation(
        manager,
        userId,
        conversationId,
        true,
      );
      if (throughSequence > access.conversation.latestSequence) {
        throw chatException('CHAT_INVALID_CURSOR', '已读序号超过会话最新消息。');
      }
      if (throughSequence <= access.member.lastReadSequence) {
        return {
          conversationId: access.conversation.id,
          lastReadSequence: access.member.lastReadSequence,
          unreadCount: access.member.unreadCount,
        };
      }
      access.member.lastReadSequence = throughSequence;
      access.member.unreadCount = await manager.getRepository(DirectMessage).count({
        where: {
          conversationId: access.conversation.id,
          authorId: access.otherUserId,
          sequence: MoreThan(throughSequence),
        },
      });
      await manager.getRepository(DirectConversationMember).save(access.member);
      return {
        conversationId: access.conversation.id,
        lastReadSequence: access.member.lastReadSequence,
        unreadCount: access.member.unreadCount,
      };
    });
    await this.publishReadEvent(
      result.conversationId,
      userId,
      result.lastReadSequence,
    );
    return result;
  }

  async report(
    userId: string,
    messageId: string,
    idempotencyKey: string,
    input: { reason?: unknown; detail?: unknown },
  ): Promise<{ reportId: string; status: 'received' }> {
    assertCommunityChatEnabled();
    await this.activeUser(this.dataSource.manager, userId);
    if (!isUuid(messageId)) throw this.messageNotFound();
    if (!idempotencyKey || idempotencyKey.length > 160) {
      throw chatException('IDEMPOTENCY_KEY_REQUIRED', '缺少有效的 Idempotency-Key。');
    }
    const reason = String(input.reason ?? '') as DirectMessageReportReason;
    if (!REPORT_REASONS.has(reason)) {
      throw chatException('CHAT_REPORT_INVALID', '举报原因无效。');
    }
    const detail =
      input.detail === undefined
        ? null
        : String(input.detail).normalize('NFC').trim();
    if (detail && unicodeLength(detail) > 500) {
      throw chatException('CHAT_REPORT_INVALID', '补充说明不能超过 500 个字符。');
    }
    const keyHash = sha256(idempotencyKey);
    const hash = requestHash({ messageId, reason, detail });
    try {
      return await this.dataSource.transaction(async (manager) => {
        const reportRepo = manager.getRepository(DirectMessageReport);
        const replay = await reportRepo.findOne({
          where: { reporterId: userId, idempotencyKeyHash: keyHash },
        });
        if (replay) {
          if (replay.requestHash !== hash) {
            throw chatException('IDEMPOTENCY_CONFLICT', '幂等键已用于另一份举报。', 409);
          }
          return { reportId: replay.id, status: 'received' as const };
        }
        const message = await manager.getRepository(DirectMessage).findOne({
          where: { id: messageId },
        });
        if (!message) throw this.messageNotFound();
        await this.requireConversation(
          manager,
          userId,
          message.conversationId,
          false,
          true,
        );
        if (message.authorId === userId) {
          throw chatException('CHAT_REPORT_FORBIDDEN', '不能举报自己的消息。', 403);
        }
        const created = await reportRepo.save(
          reportRepo.create({
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
      const replay = await this.dataSource.getRepository(DirectMessageReport).findOne({
        where: { reporterId: userId, idempotencyKeyHash: keyHash },
      });
      if (!replay) throw error;
      if (replay.requestHash !== hash) {
        throw chatException('IDEMPOTENCY_CONFLICT', '幂等键已用于另一份举报。', 409);
      }
      return { reportId: replay.id, status: 'received' };
    }
  }

  async messageForViewer(
    userId: string,
    messageId: string,
  ): Promise<DirectMessageView> {
    assertCommunityChatEnabled();
    await this.activeUser(this.dataSource.manager, userId);
    if (!isUuid(messageId)) throw this.messageNotFound();
    const message = await this.dataSource.getRepository(DirectMessage).findOne({
      where: { id: messageId },
    });
    if (!message) throw this.messageNotFound();
    await this.requireConversation(
      this.dataSource.manager,
      userId,
      message.conversationId,
    );
    return (await this.messageViews(userId, [message]))[0]!;
  }

  async participants(conversationId: string): Promise<string[]> {
    if (!isUuid(conversationId)) return [];
    const conversation = await this.dataSource.getRepository(DirectConversation).findOne({
      where: { id: conversationId },
    });
    if (!conversation) return [];
    const participantIds = [conversation.userLowId, conversation.userHighId];
    const [users, memberCount, blocked] = await Promise.all([
      this.dataSource.getRepository(User).count({
        where: { id: In(participantIds), accountStatus: 'active' },
      }),
      this.dataSource.getRepository(DirectConversationMember).count({
        where: { conversationId, userId: In(participantIds) },
      }),
      this.isBlocked(
        this.dataSource.manager,
        conversation.userLowId,
        conversation.userHighId,
      ),
    ]);
    return users === 2 && memberCount === 2 && !blocked ? participantIds : [];
  }

  async publishMessageEvent(
    kind: 'created' | 'updated',
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    const participantIds = await this.participants(conversationId);
    if (participantIds.length !== 2) return;
    await this.realtime.publish({
      scope: 'direct',
      kind,
      conversationId,
      messageId,
      participantIds,
    });
  }

  private async publishReadEvent(
    conversationId: string,
    readerUserId: string,
    lastReadSequence: number,
  ): Promise<void> {
    const participantIds = await this.participants(conversationId);
    if (participantIds.length !== 2) return;
    await this.realtime.publish({
      scope: 'direct',
      kind: 'read',
      conversationId,
      readerUserId,
      lastReadSequence,
      participantIds,
    });
  }

  private async conversationForViewer(
    userId: string,
    conversationId: string,
  ): Promise<DirectConversationView> {
    const access = await this.requireConversation(
      this.dataSource.manager,
      userId,
      conversationId,
    );
    return (
      await this.conversationViews(userId, [
        Object.assign(access.member, { conversation: access.conversation }),
      ])
    )[0]!;
  }

  private async conversationIdAfterCreateRace(
    userId: string,
    friendPublicId: string,
    originalError: unknown,
  ): Promise<string> {
    const manager = this.dataSource.manager;
    const friend = await manager.getRepository(User).findOne({
      where: { publicId: friendPublicId, accountStatus: 'active' },
    });
    if (!friend) throw originalError;
    await this.activeUser(manager, userId);
    await this.assertCanSend(manager, userId, friend.id);
    const [userLowId, userHighId] = pair(userId, friend.id);
    const conversation = await manager.getRepository(DirectConversation).findOne({
      where: { userLowId, userHighId },
    });
    if (!conversation) throw originalError;
    return conversation.id;
  }

  private async conversationViews(
    userId: string,
    members: DirectConversationMember[],
  ): Promise<DirectConversationView[]> {
    if (members.length === 0) return [];
    const conversations = members.map((member) => member.conversation);
    const otherIds = conversations
      .map((conversation) => this.otherParticipant(conversation, userId))
      .filter((id): id is string => id !== null);
    const [users, profiles, friendships, latestMessages] = await Promise.all([
      this.dataSource.getRepository(User).find({ where: { id: In(otherIds) } }),
      this.dataSource.getRepository(PlayerProfile).find({
        where: { userId: In(otherIds) },
      }),
      this.dataSource.getRepository(Friendship).find({
        where: [
          { userLowId: userId, endedAt: IsNull() },
          { userHighId: userId, endedAt: IsNull() },
        ],
      }),
      this.latestMessages(conversations),
    ]);
    const userById = new Map(users.map((user) => [user.id, user]));
    const profileByUser = new Map(profiles.map((profile) => [profile.userId, profile]));
    const activeFriendIds = new Set(
      friendships.map((friendship) =>
        friendship.userLowId === userId
          ? friendship.userHighId
          : friendship.userLowId,
      ),
    );
    const messageViews = await this.messageViews(userId, latestMessages);
    const messageByConversation = new Map(
      messageViews.map((message) => [message.conversationId, message]),
    );
    const globallyWritable =
      isChatWritesEnabled() &&
      this.realtime.isAvailable() &&
      this.moderation.isAvailable();
    return members.flatMap((member) => {
      const otherId = this.otherParticipant(member.conversation, userId);
      if (!otherId) return [];
      const user = userById.get(otherId);
      if (!user) return [];
      const profile = profileByUser.get(otherId);
      return [
        {
          id: member.conversation.id,
          friend: this.userView(user, profile),
          latestSequence: member.conversation.latestSequence,
          lastMessage: messageByConversation.get(member.conversation.id) ?? null,
          unreadCount: member.unreadCount,
          canSend:
            globallyWritable &&
            user.accountStatus === 'active' &&
            activeFriendIds.has(otherId),
          updatedAt: this.conversationActivity(member.conversation).toISOString(),
        },
      ];
    });
  }

  private async latestMessages(
    conversations: DirectConversation[],
  ): Promise<DirectMessage[]> {
    const withMessages = conversations.filter(
      (conversation) => conversation.latestSequence > 0,
    );
    if (withMessages.length === 0) return [];
    const parameters: Record<string, string | number> = {};
    const clauses = withMessages.map((conversation, index) => {
      parameters[`conversation${index}`] = conversation.id;
      parameters[`sequence${index}`] = conversation.latestSequence;
      return `(message.conversation_id = :conversation${index} AND message.sequence = :sequence${index})`;
    });
    return this.dataSource
      .getRepository(DirectMessage)
      .createQueryBuilder('message')
      .where(clauses.join(' OR '), parameters)
      .getMany();
  }

  private async messageViews(
    viewerId: string,
    messages: DirectMessage[],
  ): Promise<DirectMessageView[]> {
    if (messages.length === 0) return [];
    const replyIds = [
      ...new Set(
        messages
          .map((message) => message.replyToMessageId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const replies =
      replyIds.length === 0
        ? []
        : await this.dataSource.getRepository(DirectMessage).find({
            where: { id: In(replyIds) },
          });
    const authorIds = [
      ...new Set([
        ...messages.map((message) => message.authorId),
        ...replies.map((reply) => reply.authorId),
      ]),
    ];
    const [users, profiles] = await Promise.all([
      this.dataSource.getRepository(User).find({ where: { id: In(authorIds) } }),
      this.dataSource.getRepository(PlayerProfile).find({
        where: { userId: In(authorIds) },
      }),
    ]);
    const context: DirectMessageViewContext = {
      users: new Map(users.map((user) => [user.id, user])),
      profiles: new Map(profiles.map((profile) => [profile.userId, profile])),
      replies: new Map(replies.map((reply) => [reply.id, reply])),
    };
    return messages.map((message) => this.messageView(viewerId, message, context));
  }

  private messageView(
    viewerId: string,
    message: DirectMessage,
    context: DirectMessageViewContext,
  ): DirectMessageView {
    const author = context.users.get(message.authorId);
    if (!author) throw this.messageNotFound();
    const deletedAuthor = author.accountStatus === 'deleted';
    const visibility = deletedAuthor
      ? 'withdrawn_placeholder'
      : messageVisibility(message.status);
    const withdrawUntil = new Date(message.createdAt.getTime() + WITHDRAW_WINDOW_MS);
    return {
      id: message.id,
      conversationId: message.conversationId,
      sequence: message.sequence,
      version: message.version,
      ...(message.authorId === viewerId
        ? { clientMessageId: message.clientMessageId }
        : {}),
      visibility,
      body: visibility === 'visible' ? message.body : null,
      author: deletedAuthor
        ? {
            publicId: DELETED_USER_PUBLIC_ID,
            displayName: '已注销用户',
            avatarKey: 'violet',
            battleProfession: 'developer',
          }
        : this.userView(author, context.profiles.get(author.id)),
      replyTo: this.replyView(message.replyToMessageId, context),
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
      permissions: {
        canWithdraw:
          !deletedAuthor &&
          message.authorId === viewerId &&
          message.status === 'visible' &&
          withdrawUntil.getTime() > Date.now(),
        withdrawUntil:
          !deletedAuthor &&
          message.authorId === viewerId &&
          message.status === 'visible'
            ? withdrawUntil.toISOString()
            : null,
        canReport: !deletedAuthor && message.authorId !== viewerId,
      },
    };
  }

  private replyView(
    replyId: string | null,
    context: DirectMessageViewContext,
  ): DirectMessageView['replyTo'] {
    if (!replyId) return null;
    const reply = context.replies.get(replyId);
    if (!reply) return null;
    const author = context.users.get(reply.authorId);
    if (!author) return null;
    const deletedAuthor = author.accountStatus === 'deleted';
    const visibility = deletedAuthor
      ? 'withdrawn_placeholder'
      : messageVisibility(reply.status);
    return {
      messageId: reply.id,
      authorDisplayName: deletedAuthor
        ? '已注销用户'
        : this.userView(author, context.profiles.get(author.id)).displayName,
      bodyPreview:
        visibility === 'visible' ? codePointSlice(reply.body, 80) : null,
      visibility,
    };
  }

  private userView(
    user: User,
    profile?: PlayerProfile,
  ): DirectMessageFriendView {
    if (user.accountStatus === 'deleted') {
      return {
        publicId: DELETED_USER_PUBLIC_ID,
        displayName: '已注销用户',
        avatarKey: 'violet',
        battleProfession: 'developer',
      };
    }
    return {
      publicId: user.publicId,
      ...(user.username ? { username: user.username } : {}),
      displayName: profile?.nickname ?? user.displayName ?? '社区用户',
      avatarKey: profile?.avatarKey ?? 'violet',
      battleProfession: profile?.battleProfession ?? 'developer',
    };
  }

  private async requireConversation(
    manager: EntityManager,
    userId: string,
    conversationId: string,
    lockMember = false,
    allowBlocked = false,
  ): Promise<ConversationAccess> {
    if (!isUuid(conversationId)) throw this.conversationNotFound();
    await this.activeUser(manager, userId);
    const conversation = await manager.getRepository(DirectConversation).findOne({
      where: { id: conversationId },
    });
    if (!conversation) throw this.conversationNotFound();
    const otherUserId = this.otherParticipant(conversation, userId);
    if (!otherUserId) throw this.conversationNotFound();
    if (!allowBlocked && (await this.isBlocked(manager, userId, otherUserId))) {
      throw this.conversationNotFound();
    }
    const member = await manager.getRepository(DirectConversationMember).findOne({
      where: { conversationId, userId },
      ...(lockMember ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!member) throw this.conversationNotFound();
    return { conversation, member, otherUserId };
  }

  private async activeUser(
    manager: EntityManager,
    userId: string,
  ): Promise<User> {
    const user = await manager.getRepository(User).findOne({ where: { id: userId } });
    if (!user || user.accountStatus !== 'active') {
      throw chatException('CHAT_ACCOUNT_RESTRICTED', '账号当前不能使用私聊。', 403);
    }
    return user;
  }

  private async lockActiveUsers(
    manager: EntityManager,
    userIds: readonly string[],
  ): Promise<void> {
    for (const userId of [...new Set(userIds)].sort()) {
      const user = await manager.getRepository(User).findOne({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user || user.accountStatus !== 'active') {
        throw chatException('CHAT_ACCOUNT_RESTRICTED', '账号当前不能使用私聊。', 403);
      }
    }
  }

  private async assertCanSend(
    manager: EntityManager,
    userId: string,
    otherUserId: string,
  ): Promise<void> {
    if (await this.isBlocked(manager, userId, otherUserId)) {
      throw chatException('CHAT_DIRECT_UNAVAILABLE', '无法向该用户发送私聊。', 403);
    }
    const other = await manager.getRepository(User).findOne({
      where: { id: otherUserId, accountStatus: 'active' },
    });
    if (!other || !(await this.isFriend(manager, userId, otherUserId))) {
      throw chatException('CHAT_DIRECT_FRIEND_REQUIRED', '只能和当前好友私聊。', 403);
    }
  }

  private async isFriend(
    manager: EntityManager,
    left: string,
    right: string,
  ): Promise<boolean> {
    const [userLowId, userHighId] = pair(left, right);
    return manager.getRepository(Friendship).exist({
      where: { userLowId, userHighId, endedAt: IsNull() },
    });
  }

  private async isBlocked(
    manager: EntityManager,
    left: string,
    right: string,
  ): Promise<boolean> {
    return manager.getRepository(UserBlock).exist({
      where: [
        { blockerId: left, blockedId: right },
        { blockerId: right, blockedId: left },
      ],
    });
  }

  private async blockedUserIds(
    manager: EntityManager,
    userId: string,
    candidateIds: string[],
  ): Promise<Set<string>> {
    const ids = [...new Set(candidateIds)];
    if (ids.length === 0) return new Set();
    const blocks = await manager.getRepository(UserBlock).find({
      where: [
        { blockerId: userId, blockedId: In(ids) },
        { blockerId: In(ids), blockedId: userId },
      ],
    });
    return new Set(
      blocks.map((block) =>
        block.blockerId === userId ? block.blockedId : block.blockerId,
      ),
    );
  }

  private async validateReply(
    manager: EntityManager,
    conversationId: string,
    replyId: string | null,
  ): Promise<DirectMessage | null> {
    if (!replyId) return null;
    const reply = await manager.getRepository(DirectMessage).findOne({
      where: { id: replyId, conversationId },
    });
    if (!reply) {
      throw chatException('CHAT_REPLY_NOT_FOUND', '回复的消息不存在于当前私聊。', 404);
    }
    return reply;
  }

  private normalizeSendInput(input: SendDirectMessageInput): {
    conversationId: string;
    clientMessageId: string;
    body: string;
    replyToMessageId: string | null;
  } {
    if (!isUuid(input.conversationId)) throw this.conversationNotFound();
    const clientMessageId = String(input.clientMessageId ?? '').trim();
    if (!clientMessageId || clientMessageId.length > 100) {
      throw chatException('CHAT_CLIENT_MESSAGE_ID_INVALID', 'clientMessageId 无效。');
    }
    const body = String(input.body ?? '').normalize('NFC').trim();
    const length = unicodeLength(body);
    if (length < 1 || length > 500) {
      throw chatException('CHAT_MESSAGE_TOO_LONG', '消息须为 1 到 500 个字符。', 422);
    }
    if (input.replyToMessageId && !isUuid(input.replyToMessageId)) {
      throw chatException('CHAT_REPLY_NOT_FOUND', '回复的消息不存在。', 404);
    }
    return {
      conversationId: input.conversationId,
      clientMessageId,
      body,
      replyToMessageId: input.replyToMessageId ?? null,
    };
  }

  private async idempotentMessage(
    userId: string,
    message: DirectMessage,
    expectedHash: string,
  ): Promise<DirectMessageView> {
    if (message.requestHash !== expectedHash) throw this.idempotencyConflict();
    return this.messageForViewer(userId, message.id);
  }

  private otherParticipant(
    conversation: DirectConversation,
    userId: string,
  ): string | null {
    if (conversation.userLowId === userId) return conversation.userHighId;
    if (conversation.userHighId === userId) return conversation.userLowId;
    return null;
  }

  private conversationActivity(conversation: DirectConversation): Date {
    return conversation.lastMessageAt ?? conversation.updatedAt;
  }

  private decodeConversationCursor(
    raw?: string,
  ): { id: string; updatedAt: Date } | null {
    if (!raw) return null;
    try {
      const value = JSON.parse(
        Buffer.from(raw, 'base64url').toString('utf8'),
      ) as { id?: unknown; updatedAt?: unknown };
      if (
        typeof value.id !== 'string' ||
        !isUuid(value.id) ||
        typeof value.updatedAt !== 'string'
      ) {
        throw new Error('invalid');
      }
      const updatedAt = new Date(value.updatedAt);
      if (
        Number.isNaN(updatedAt.getTime()) ||
        updatedAt.toISOString() !== value.updatedAt
      ) {
        throw new Error('invalid');
      }
      return { id: value.id, updatedAt };
    } catch {
      throw chatException('CHAT_INVALID_CURSOR', '会话游标无效。');
    }
  }

  private conversationCursor(conversation: DirectConversation): string {
    return Buffer.from(
      JSON.stringify({
        id: conversation.id,
        updatedAt: this.conversationActivity(conversation).toISOString(),
      }),
    ).toString('base64url');
  }

  private conversationNotFound(): ChatException {
    return chatException('CHAT_DIRECT_CONVERSATION_NOT_FOUND', '私聊会话不存在。', 404);
  }

  private messageNotFound(): ChatException {
    return chatException('CHAT_MESSAGE_NOT_FOUND', '消息不存在。', 404);
  }

  private idempotencyConflict(): ChatException {
    return chatException(
      'CHAT_IDEMPOTENCY_CONFLICT',
      'clientMessageId 已被另一条消息使用。',
      409,
    );
  }
}

function pair(left: string, right: string): [string, string] {
  return left < right ? [left, right] : [right, left];
}

function messageVisibility(status: DirectMessageStatus): DirectMessageVisibility {
  if (status === 'withdrawn') return 'withdrawn_placeholder';
  if (status === 'moderated') return 'moderated_placeholder';
  return 'visible';
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

function isUuid(value: string | undefined): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && 'code' in error && error.code === '23505',
  );
}
