import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';

import { CommunityCommandReceipt } from '../../database/entities/community-command-receipt.entity';
import { FriendRequest } from '../../database/entities/friend-request.entity';
import { Friendship } from '../../database/entities/friendship.entity';
import { PlayerProfile } from '../../database/entities/player-profile.entity';
import { UserBlock } from '../../database/entities/user-block.entity';
import { User } from '../../database/entities/user.entity';
import { COMMUNITY_CLOCK, CommunityClock } from './community-clock';
import { toCommunityServiceDate } from './community-time';
import { requestHash } from './community-validation';
import { assertCommunityWritesEnabled } from './community-write-gate';
import { NotificationService } from './notification.service';
import { RelationshipPolicyService } from './relationship-policy.service';

const FRIEND_LIMIT = 200;
const DAILY_REQUEST_LIMIT = 20;
const PENDING_OUTGOING_LIMIT = 30;
const PAGE_SIZE = 50;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CommunityUserSummaryView {
  publicId: string;
  displayName: string;
  avatarKey: string;
  battleProfession: string;
  bio: string | null;
}

export interface RelationshipMutationView {
  status: 'pending' | 'friend' | 'none' | 'blocked_by_me';
  requestId?: string | null;
}

@Injectable()
export class RelationshipService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly policy: RelationshipPolicyService,
    private readonly notifications: NotificationService,
    @Inject(COMMUNITY_CLOCK) private readonly clock: CommunityClock,
  ) {}

  async sendRequest(
    requesterId: string,
    recipientPublicId: string,
    idempotencyKey: string,
  ): Promise<RelationshipMutationView> {
    assertCommunityWritesEnabled();
    const hash = requestHash({ recipientPublicId });
    return this.dataSource.transaction(async (manager) => {
      const recipient = await this.policy.activeUserByPublicId(
        manager,
        recipientPublicId,
      );
      if (recipient.id === requesterId) {
        throw new BadRequestException({ code: 'CANNOT_FRIEND_SELF' });
      }
      const users = await this.policy.lockActiveUsers(manager, [
        requesterId,
        recipient.id,
      ]);
      this.policy.assertProactiveSocialWriteAllowed(users.get(requesterId)!);
      const replay = await this.replay<RelationshipMutationView>(
        manager,
        requesterId,
        'friend.request',
        idempotencyKey,
        hash,
      );
      if (replay) return replay;
      if (await this.policy.isBlocked(manager, requesterId, recipient.id)) {
        throw new ForbiddenException({ code: 'RELATIONSHIP_UNAVAILABLE' });
      }

      const [userLowId, userHighId] = this.policy.pair(
        requesterId,
        recipient.id,
      );
      if (await this.policy.isFriend(manager, requesterId, recipient.id)) {
        return this.record(
          manager,
          requesterId,
          'friend.request',
          idempotencyKey,
          hash,
          { status: 'friend' as const, requestId: null },
        );
      }

      const requestRepo = manager.getRepository(FriendRequest);
      const pending = await requestRepo.findOne({
        where: { userLowId, userHighId, status: 'pending' },
        lock: { mode: 'pessimistic_write' },
      });
      if (pending) {
        if (pending.requesterId === requesterId) {
          return this.record(
            manager,
            requesterId,
            'friend.request',
            idempotencyKey,
            hash,
            { status: 'pending' as const, requestId: pending.id },
          );
        }

        await this.assertFriendCapacity(manager, requesterId, recipient.id);
        const now = this.clock.now();
        pending.status = 'accepted';
        pending.respondedAt = now;
        await requestRepo.save(pending);
        await this.notifications.removeByDedupeKey(
          manager,
          pending.recipientId,
          `friend-request:${pending.id}`,
        );
        await this.createFriendship(
          manager,
          userLowId,
          userHighId,
          pending.createdAt,
          now,
        );
        await this.friendAcceptedSideEffects(
          manager,
          users.get(requesterId)!,
          users.get(recipient.id)!,
          pending.id,
          now,
          'mutual',
        );
        return this.record(
          manager,
          requesterId,
          'friend.request',
          idempotencyKey,
          hash,
          { status: 'friend' as const, requestId: pending.id },
        );
      }

      await this.assertRequestLimits(manager, requesterId, this.clock.now());
      const created = await requestRepo.save(
        requestRepo.create({
          requesterId,
          recipientId: recipient.id,
          userLowId,
          userHighId,
          status: 'pending',
          respondedAt: null,
        }),
      );
      const requester = users.get(requesterId)!;
      await this.notifications.create(manager, {
        userId: recipient.id,
        actorUserId: requesterId,
        category: 'friend',
        eventType: 'friend.requested',
        title: '新的好友申请',
        summary: `${requester.displayName ?? '一位同事'}申请添加你为好友`,
        resourceType: 'friend_request',
        resourceId: created.id,
        resourcePath: '/friends',
        dedupeKey: `friend-request:${created.id}`,
      });
      return this.record(
        manager,
        requesterId,
        'friend.request',
        idempotencyKey,
        hash,
        { status: 'pending' as const, requestId: created.id },
      );
    });
  }

  async accept(
    recipientId: string,
    requestId: string,
    idempotencyKey: string,
  ): Promise<RelationshipMutationView> {
    return this.respond(recipientId, requestId, idempotencyKey, 'accepted');
  }

  async reject(
    recipientId: string,
    requestId: string,
    idempotencyKey: string,
  ): Promise<RelationshipMutationView> {
    return this.respond(recipientId, requestId, idempotencyKey, 'rejected');
  }

  async cancel(
    requesterId: string,
    requestId: string,
    idempotencyKey: string,
  ): Promise<void> {
    assertCommunityWritesEnabled();
    const hash = requestHash({ requestId });
    await this.dataSource.transaction(async (manager) => {
      await this.policy.lockActiveUsers(manager, [requesterId]);
      const replay = await this.replay<{ ok: true }>(
        manager,
        requesterId,
        'friend.cancel',
        idempotencyKey,
        hash,
      );
      if (replay) return;
      const request = await manager.getRepository(FriendRequest).findOne({
        where: { id: requestId, requesterId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) {
        throw new NotFoundException({ code: 'FRIEND_REQUEST_NOT_FOUND' });
      }
      if (request.status === 'pending') {
        request.status = 'cancelled';
        request.respondedAt = this.clock.now();
        await manager.getRepository(FriendRequest).save(request);
        await this.notifications.removeByDedupeKey(
          manager,
          request.recipientId,
          `friend-request:${request.id}`,
        );
      }
      await this.record(
        manager,
        requesterId,
        'friend.cancel',
        idempotencyKey,
        hash,
        { ok: true },
      );
    });
  }

  async removeFriend(
    userId: string,
    friendPublicId: string,
    idempotencyKey: string,
  ): Promise<void> {
    assertCommunityWritesEnabled();
    const hash = requestHash({ friendPublicId });
    await this.dataSource.transaction(async (manager) => {
      const target = await this.policy.activeUserByPublicId(manager, friendPublicId);
      await this.policy.lockActiveUsers(manager, [userId, target.id]);
      const replay = await this.replay<{ ok: true }>(
        manager,
        userId,
        'friend.remove',
        idempotencyKey,
        hash,
      );
      if (replay) return;
      const [userLowId, userHighId] = this.policy.pair(userId, target.id);
      const friendship = await manager.getRepository(Friendship).findOne({
        where: { userLowId, userHighId, endedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!friendship) throw new NotFoundException({ code: 'FRIEND_NOT_FOUND' });
      friendship.endedAt = this.clock.now();
      friendship.endedReason = 'removed';
      await manager.getRepository(Friendship).save(friendship);
      await this.record(
        manager,
        userId,
        'friend.remove',
        idempotencyKey,
        hash,
        { ok: true },
      );
    });
  }

  async block(
    blockerId: string,
    blockedPublicId: string,
    idempotencyKey: string,
  ): Promise<RelationshipMutationView> {
    assertCommunityWritesEnabled();
    const hash = requestHash({ blockedPublicId });
    return this.dataSource.transaction(async (manager) => {
      const target = await this.policy.activeUserByPublicId(manager, blockedPublicId);
      if (target.id === blockerId) {
        throw new BadRequestException({ code: 'CANNOT_BLOCK_SELF' });
      }
      await this.policy.lockActiveUsers(manager, [blockerId, target.id]);
      const replay = await this.replay<RelationshipMutationView>(
        manager,
        blockerId,
        'block.create',
        idempotencyKey,
        hash,
      );
      if (replay) return replay;

      const blockRepo = manager.getRepository(UserBlock);
      if (!(await blockRepo.exist({ where: { blockerId, blockedId: target.id } }))) {
        await blockRepo.save(
          blockRepo.create({ blockerId, blockedId: target.id, reason: null }),
        );
      }
      const [userLowId, userHighId] = this.policy.pair(blockerId, target.id);
      const now = this.clock.now();
      await manager
        .getRepository(Friendship)
        .createQueryBuilder()
        .update(Friendship)
        .set({ endedAt: now, endedReason: 'blocked' })
        .where('user_low_id = :userLowId AND user_high_id = :userHighId', {
          userLowId,
          userHighId,
        })
        .andWhere('ended_at IS NULL')
        .execute();
      await manager
        .getRepository(FriendRequest)
        .createQueryBuilder()
        .update(FriendRequest)
        .set({ status: 'cancelled', respondedAt: now })
        .where('user_low_id = :userLowId AND user_high_id = :userHighId', {
          userLowId,
          userHighId,
        })
        .andWhere("status = 'pending'")
        .execute();
      await this.notifications.removeBetween(manager, blockerId, target.id);
      return this.record(
        manager,
        blockerId,
        'block.create',
        idempotencyKey,
        hash,
        { status: 'blocked_by_me' as const, requestId: null },
      );
    });
  }

  async unblock(
    blockerId: string,
    blockedPublicId: string,
    idempotencyKey: string,
  ): Promise<void> {
    assertCommunityWritesEnabled();
    const hash = requestHash({ blockedPublicId });
    await this.dataSource.transaction(async (manager) => {
      const target = await this.policy.activeUserByPublicId(manager, blockedPublicId);
      await this.policy.lockActiveUsers(manager, [blockerId, target.id]);
      const replay = await this.replay<{ ok: true }>(
        manager,
        blockerId,
        'block.remove',
        idempotencyKey,
        hash,
      );
      if (replay) return;
      await manager.getRepository(UserBlock).delete({
        blockerId,
        blockedId: target.id,
      });
      await this.record(
        manager,
        blockerId,
        'block.remove',
        idempotencyKey,
        hash,
        { ok: true },
      );
    });
  }

  async listFriends(userId: string, cursor?: string) {
    const cursorPosition = this.decodePageCursor(cursor);
    const query = this.dataSource
      .getRepository(Friendship)
      .createQueryBuilder('friendship')
      .where('friendship.ended_at IS NULL')
      .andWhere(
        '(friendship.user_low_id = :userId OR friendship.user_high_id = :userId)',
        { userId },
      );
    const total = await query.clone().getCount();
    if (cursorPosition) {
      query.andWhere(
        '(friendship.current_started_at < :cursorAt OR (friendship.current_started_at = :cursorAt AND friendship.id < :cursorId))',
        { cursorAt: cursorPosition.createdAt, cursorId: cursorPosition.id },
      );
    }
    const rows = await query
      .orderBy('friendship.current_started_at', 'DESC')
      .addOrderBy('friendship.id', 'DESC')
      .take(PAGE_SIZE + 1)
      .getMany();
    const hasMore = rows.length > PAGE_SIZE;
    const page = rows.slice(0, PAGE_SIZE);
    const friendIds = page.map((friendship) =>
      friendship.userLowId === userId
        ? friendship.userHighId
        : friendship.userLowId,
    );
    const blocked = await this.blockedUserIds(
      this.dataSource.manager,
      userId,
      friendIds,
    );
    const summaries = await this.summaries(
      this.dataSource.manager,
      friendIds.filter((id) => !blocked.has(id)),
    );
    const items = page.flatMap((friendship) => {
      const friendId = friendship.userLowId === userId
        ? friendship.userHighId
        : friendship.userLowId;
      const summary = summaries.get(friendId);
      if (!summary || blocked.has(friendId)) return [];
      return [{
        ...summary,
        friendsSince: friendship.currentStartedAt.toISOString(),
        canFeed: true,
        canChallenge: true,
        note: null,
      }];
    });
    return {
      items,
      nextCursor:
        hasMore && page.length > 0
          ? this.pageCursor(page.at(-1)!.id, page.at(-1)!.currentStartedAt)
          : null,
      total,
      pageLimit: PAGE_SIZE,
      friendLimit: FRIEND_LIMIT,
      // 旧客户端兼容；limit 历史上表示单页条数。
      limit: PAGE_SIZE,
    };
  }

  async listRequests(
    userId: string,
    direction?: 'incoming' | 'outgoing',
    cursor?: string,
  ) {
    const cursorPosition = this.decodePageCursor(cursor);
    const query = this.dataSource
      .getRepository(FriendRequest)
      .createQueryBuilder('request')
      .where("request.status = 'pending'");
    if (direction === 'incoming') {
      query.andWhere('request.recipient_id = :userId', { userId });
    } else if (direction === 'outgoing') {
      query.andWhere('request.requester_id = :userId', { userId });
    } else {
      query.andWhere(
        '(request.requester_id = :userId OR request.recipient_id = :userId)',
        { userId },
      );
    }
    if (cursorPosition) {
      query.andWhere(
        '(request.created_at < :cursorAt OR (request.created_at = :cursorAt AND request.id < :cursorId))',
        { cursorAt: cursorPosition.createdAt, cursorId: cursorPosition.id },
      );
    }
    const rows = await query
      .orderBy('request.created_at', 'DESC')
      .addOrderBy('request.id', 'DESC')
      .take(PAGE_SIZE + 1)
      .getMany();
    const hasMore = rows.length > PAGE_SIZE;
    const page = rows.slice(0, PAGE_SIZE);
    const otherIds = page.map((row) =>
      row.requesterId === userId ? row.recipientId : row.requesterId,
    );
    const blocked = await this.blockedUserIds(
      this.dataSource.manager,
      userId,
      otherIds,
    );
    const summaries = await this.summaries(
      this.dataSource.manager,
      otherIds.filter((id) => !blocked.has(id)),
    );
    const items = page.flatMap((row) => {
      const incoming = row.recipientId === userId;
      const otherId = incoming ? row.requesterId : row.recipientId;
      const user = summaries.get(otherId);
      if (!user || blocked.has(otherId)) return [];
      return [{
        id: row.id,
        direction: incoming ? ('incoming' as const) : ('outgoing' as const),
        user,
        createdAt: row.createdAt.toISOString(),
        status: 'pending' as const,
      }];
    });
    const today = toCommunityServiceDate(this.clock.now());
    const { startAt, endAt } = this.serviceDateWindow(today);
    const requestRepo = this.dataSource.getRepository(FriendRequest);
    const [pendingIncomingCount, pendingOutgoingCount, dailySent] = await Promise.all([
      requestRepo.count({ where: { recipientId: userId, status: 'pending' } }),
      requestRepo.count({ where: { requesterId: userId, status: 'pending' } }),
      requestRepo
        .createQueryBuilder('request')
        .where('request.requester_id = :userId', { userId })
        .andWhere('request.created_at >= :startAt', { startAt })
        .andWhere('request.created_at < :endAt', { endAt })
        .getCount(),
    ]);
    return {
      items,
      nextCursor:
        hasMore && page.length > 0
          ? this.pageCursor(page.at(-1)!.id, page.at(-1)!.createdAt)
          : null,
      pendingIncomingCount,
      pendingOutgoingCount,
      dailySent,
      dailyLimit: DAILY_REQUEST_LIMIT,
    };
  }

  async listBlocks(userId: string, cursor?: string) {
    const cursorPosition = this.decodePageCursor(cursor);
    const query = this.dataSource
      .getRepository(UserBlock)
      .createQueryBuilder('block')
      .where('block.blocker_id = :userId', { userId });
    if (cursorPosition) {
      query.andWhere(
        '(block.created_at < :cursorAt OR (block.created_at = :cursorAt AND block.blocked_id < :cursorId))',
        { cursorAt: cursorPosition.createdAt, cursorId: cursorPosition.id },
      );
    }
    const rows = await query
      .orderBy('block.created_at', 'DESC')
      .addOrderBy('block.blocked_id', 'DESC')
      .take(PAGE_SIZE + 1)
      .getMany();
    const hasMore = rows.length > PAGE_SIZE;
    const page = rows.slice(0, PAGE_SIZE);
    const summaries = await this.summaries(
      this.dataSource.manager,
      page.map((row) => row.blockedId),
    );
    const items = page.flatMap((row) => {
      const summary = summaries.get(row.blockedId);
      return summary
        ? [{ ...summary, blockedAt: row.createdAt.toISOString() }]
        : [];
    });
    return {
      items,
      nextCursor:
        hasMore && page.length > 0
          ? this.pageCursor(page.at(-1)!.blockedId, page.at(-1)!.createdAt)
          : null,
    };
  }

  private async respond(
    recipientId: string,
    requestId: string,
    idempotencyKey: string,
    response: 'accepted' | 'rejected',
  ): Promise<RelationshipMutationView> {
    assertCommunityWritesEnabled();
    const commandType = `friend.${response}`;
    const hash = requestHash({ requestId });
    return this.dataSource.transaction(async (manager) => {
      const initial = await manager.getRepository(FriendRequest).findOne({
        where: { id: requestId, recipientId },
      });
      if (!initial) {
        throw new NotFoundException({ code: 'FRIEND_REQUEST_NOT_FOUND' });
      }
      const users = await this.policy.lockActiveUsers(manager, [
        recipientId,
        initial.requesterId,
      ]);
      if (response === 'accepted') {
        this.policy.assertProactiveSocialWriteAllowed(users.get(recipientId)!);
      }
      const replay = await this.replay<RelationshipMutationView>(
        manager,
        recipientId,
        commandType,
        idempotencyKey,
        hash,
      );
      if (replay) return replay;
      const request = await manager.getRepository(FriendRequest).findOne({
        where: { id: requestId, recipientId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request || request.status !== 'pending') {
        throw new ConflictException({ code: 'FRIEND_REQUEST_NOT_PENDING' });
      }
      if (
        await this.policy.isBlocked(manager, recipientId, request.requesterId)
      ) {
        throw new ForbiddenException({ code: 'RELATIONSHIP_UNAVAILABLE' });
      }
      const now = this.clock.now();
      request.status = response;
      request.respondedAt = now;
      await manager.getRepository(FriendRequest).save(request);
      await this.notifications.removeByDedupeKey(
        manager,
        request.recipientId,
        `friend-request:${request.id}`,
      );
      if (response === 'rejected') {
        return this.record(
          manager,
          recipientId,
          commandType,
          idempotencyKey,
          hash,
          { status: 'none' as const, requestId: request.id },
        );
      }

      await this.assertFriendCapacity(
        manager,
        recipientId,
        request.requesterId,
      );
      const [userLowId, userHighId] = this.policy.pair(
        recipientId,
        request.requesterId,
      );
      await this.createFriendship(
        manager,
        userLowId,
        userHighId,
        request.createdAt,
        now,
      );
      await this.friendAcceptedSideEffects(
        manager,
        users.get(recipientId)!,
        users.get(request.requesterId)!,
        request.id,
        now,
        'accepted',
      );
      return this.record(
        manager,
        recipientId,
        commandType,
        idempotencyKey,
        hash,
        { status: 'friend' as const, requestId: request.id },
      );
    });
  }

  private async createFriendship(
    manager: EntityManager,
    userLowId: string,
    userHighId: string,
    requestCreatedAt: Date,
    now: Date,
  ): Promise<Friendship> {
    const repo = manager.getRepository(Friendship);
    const existing = await repo.findOne({
      where: { userLowId, userHighId, endedAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    if (existing) return existing;
    const history = await repo.findOne({
      where: { userLowId, userHighId },
      order: { firstBecameFriendsAt: 'ASC' },
    });
    return repo.save(
      repo.create({
        userLowId,
        userHighId,
        firstBecameFriendsAt:
          history?.firstBecameFriendsAt ?? requestCreatedAt ?? now,
        currentStartedAt: now,
        endedAt: null,
        endedReason: null,
      }),
    );
  }

  private async assertFriendCapacity(
    manager: EntityManager,
    firstUserId: string,
    secondUserId: string,
  ): Promise<void> {
    for (const userId of [firstUserId, secondUserId]) {
      const count = await manager
        .getRepository(Friendship)
        .createQueryBuilder('friendship')
        .where('friendship.ended_at IS NULL')
        .andWhere(
          '(friendship.user_low_id = :userId OR friendship.user_high_id = :userId)',
          { userId },
        )
        .getCount();
      if (count >= FRIEND_LIMIT) {
        throw new ConflictException({ code: 'FRIEND_LIMIT_REACHED' });
      }
    }
  }

  private async assertRequestLimits(
    manager: EntityManager,
    requesterId: string,
    now: Date,
  ): Promise<void> {
    const today = toCommunityServiceDate(now);
    const { startAt, endAt } = this.serviceDateWindow(today);
    const repo = manager.getRepository(FriendRequest);
    const [dailyCount, pendingCount] = await Promise.all([
      repo
        .createQueryBuilder('request')
        .where('request.requester_id = :requesterId', { requesterId })
        .andWhere('request.created_at >= :startAt', { startAt })
        .andWhere('request.created_at < :endAt', { endAt })
        .getCount(),
      repo.count({ where: { requesterId, status: 'pending' } }),
    ]);
    if (dailyCount >= DAILY_REQUEST_LIMIT) {
      throw new ConflictException({ code: 'FRIEND_REQUEST_DAILY_LIMIT' });
    }
    if (pendingCount >= PENDING_OUTGOING_LIMIT) {
      throw new ConflictException({ code: 'FRIEND_REQUEST_PENDING_LIMIT' });
    }
  }

  private async friendAcceptedSideEffects(
    manager: EntityManager,
    actor: User,
    other: User,
    requestId: string,
    now: Date,
    source: 'accepted' | 'mutual',
  ): Promise<void> {
    await this.notifications.create(manager, {
      userId: other.id,
      actorUserId: actor.id,
      category: 'friend',
      eventType: 'friend.accepted',
      title: '好友申请已通过',
      summary: `${actor.displayName ?? '一位同事'}已与你成为好友`,
      resourceType: 'friend_request',
      resourceId: requestId,
      resourcePath: '/friends',
      dedupeKey: `friend-accepted:${requestId}:${other.id}`,
    });
    await this.notifications.create(manager, {
      userId: actor.id,
      actorUserId: other.id,
      category: 'friend',
      eventType: 'friend.accepted',
      title: source === 'mutual' ? '双方好友申请已合并' : '已添加好友',
      summary: `你已和${other.displayName ?? '这位同事'}成为好友`,
      resourceType: 'friend_request',
      resourceId: requestId,
      resourcePath: '/friends',
      dedupeKey: `friend-accepted:${requestId}:${actor.id}`,
    });
  }

  private async summaries(
    manager: EntityManager,
    userIds: readonly string[],
  ): Promise<Map<string, CommunityUserSummaryView>> {
    const uniqueIds = [...new Set(userIds)];
    if (uniqueIds.length === 0) return new Map();
    const [users, profiles] = await Promise.all([
      manager.getRepository(User).find({
        where: { id: In(uniqueIds), accountStatus: 'active' },
      }),
      manager.getRepository(PlayerProfile).find({
        where: { userId: In(uniqueIds) },
      }),
    ]);
    const profileByUser = new Map(profiles.map((profile) => [profile.userId, profile]));
    return new Map(
      users.map((user) => {
        const profile = profileByUser.get(user.id);
        return [
          user.id,
          {
            publicId: user.publicId,
            displayName: user.displayName ?? '办公室同事',
            avatarKey: profile?.avatarKey ?? 'violet',
            battleProfession: profile?.battleProfession ?? 'developer',
            bio: profile?.bio ?? null,
          },
        ];
      }),
    );
  }

  private async blockedUserIds(
    manager: EntityManager,
    userId: string,
    candidateIds: readonly string[],
  ): Promise<Set<string>> {
    const ids = [...new Set(candidateIds)];
    if (ids.length === 0) return new Set();
    const rows = await manager.getRepository(UserBlock).find({
      where: [
        { blockerId: userId, blockedId: In(ids) },
        { blockerId: In(ids), blockedId: userId },
      ],
    });
    return new Set(
      rows.map((row) =>
        row.blockerId === userId ? row.blockedId : row.blockerId,
      ),
    );
  }

  private async replay<T extends object>(
    manager: EntityManager,
    userId: string,
    commandType: string,
    idempotencyKey: string,
    hash: string,
  ): Promise<T | null> {
    const receipt = await manager.getRepository(CommunityCommandReceipt).findOne({
      where: { userId, commandType, idempotencyKey },
      lock: { mode: 'pessimistic_write' },
    });
    if (!receipt) return null;
    if (receipt.requestHash !== hash) {
      throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' });
    }
    return receipt.result as T;
  }

  private async record<T extends object>(
    manager: EntityManager,
    userId: string,
    commandType: string,
    idempotencyKey: string,
    hash: string,
    result: T,
  ): Promise<T> {
    const repo = manager.getRepository(CommunityCommandReceipt);
    await repo.save(
      repo.create({
        userId,
        commandType,
        idempotencyKey,
        requestHash: hash,
        result: result as Record<string, unknown>,
      }),
    );
    return result;
  }

  private decodePageCursor(
    cursor?: string,
  ): { id: string; createdAt: Date } | null {
    if (!cursor) return null;
    try {
      const parsed = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as { id?: unknown; createdAt?: unknown };
      if (
        typeof parsed.id !== 'string' ||
        !UUID_PATTERN.test(parsed.id) ||
        typeof parsed.createdAt !== 'string'
      ) {
        throw new Error('invalid');
      }
      const createdAt = new Date(parsed.createdAt);
      if (
        Number.isNaN(createdAt.getTime()) ||
        createdAt.toISOString() !== parsed.createdAt
      ) {
        throw new Error('invalid');
      }
      return { id: parsed.id, createdAt };
    } catch {
      throw new BadRequestException({ code: 'INVALID_CURSOR' });
    }
  }

  private pageCursor(id: string, createdAt: Date): string {
    return Buffer.from(
      JSON.stringify({ id, createdAt: createdAt.toISOString() }),
    ).toString('base64url');
  }

  private serviceDateWindow(serviceDate: string): { startAt: Date; endAt: Date } {
    const startAt = new Date(`${serviceDate}T05:00:00+08:00`);
    return { startAt, endAt: new Date(startAt.getTime() + 24 * 60 * 60 * 1_000) };
  }

}
