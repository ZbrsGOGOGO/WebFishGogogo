import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { AdminAuditLog } from '../../database/entities/admin-audit-log.entity';
import { CommentRevision } from '../../database/entities/comment-revision.entity';
import { CommunityComment } from '../../database/entities/community-comment.entity';
import {
  CommunityPost,
  ContentModerationStatus,
} from '../../database/entities/community-post.entity';
import { ContentReport } from '../../database/entities/content-report.entity';
import { ModerationAction } from '../../database/entities/moderation-action.entity';
import { ModerationCase } from '../../database/entities/moderation-case.entity';
import { PlayerProfile } from '../../database/entities/player-profile.entity';
import { PostFollow } from '../../database/entities/post-follow.entity';
import { PostRevision } from '../../database/entities/post-revision.entity';
import { User } from '../../database/entities/user.entity';
import {
  assertModerationOperationsEnabled,
  moderationOperationsEnabled,
} from './content-gates';
import { ContentRiskLevel } from './content-validation';
import { NotificationService } from './notification.service';
import { RelationshipPolicyService } from './relationship-policy.service';

export type ModerationActionName = 'approve' | 'limit' | 'hide' | 'restore';

export interface OpenModerationCaseInput {
  contentType: 'post' | 'comment';
  contentId: string;
  revisionId: string;
  authorId: string;
  sourceType: 'submission' | 'report' | 'automated';
  riskLevel: ContentRiskLevel;
  title: string | null;
  body: string;
  contentState: Record<string, unknown>;
  incrementReport?: boolean;
}

const CASE_PAGE_SIZE = 30;
const RISK_ORDER: Record<ContentRiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

@Injectable()
export class ModerationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationService,
    private readonly policy: RelationshipPolicyService,
  ) {}

  async access(userId: string) {
    const user = await this.requireModerator(this.dataSource.manager, userId);
    return {
      allowed: true as const,
      role: user.communityRole,
      permissions: ['approve', 'limit', 'hide', 'restore'] as const,
    };
  }

  async list(
    userId: string,
    filters: {
      status?: string;
      riskLevel?: string;
      contentType?: string;
      cursor?: string;
    },
  ) {
    await this.requireModerator(this.dataSource.manager, userId);
    const status = this.optionalEnum(filters.status, ['open', 'in_review', 'resolved']);
    const riskLevel = this.optionalEnum(filters.riskLevel, [
      'low',
      'medium',
      'high',
      'critical',
    ]);
    const contentType = this.optionalEnum(filters.contentType, ['post', 'comment']);
    const rows = await this.dataSource.getRepository(ModerationCase).find({
      order: { updatedAt: 'DESC', id: 'DESC' },
    });
    const filtered = rows.filter(
      (row) =>
        (!status || row.status === status) &&
        (!riskLevel || row.riskLevel === riskLevel) &&
        (!contentType || row.contentType === contentType),
    );
    const start = this.cursorStart(filtered, filters.cursor);
    const page = filtered.slice(start, start + CASE_PAGE_SIZE);
    return {
      items: await Promise.all(
        page.map((row) => this.caseSummary(this.dataSource.manager, row)),
      ),
      nextCursor:
        start + CASE_PAGE_SIZE < filtered.length && page.length > 0
          ? this.cursor(page.at(-1)!)
          : null,
    };
  }

  async detail(userId: string, caseId: string) {
    await this.requireModerator(this.dataSource.manager, userId);
    const row = await this.dataSource.getRepository(ModerationCase).findOne({
      where: { id: caseId },
    });
    if (!row) throw new NotFoundException({ code: 'MODERATION_CASE_NOT_FOUND' });
    return this.caseDetail(this.dataSource.manager, row);
  }

  async applyAction(
    userId: string,
    caseId: string,
    action: ModerationActionName,
    reason: string,
    expectedVersion: number,
    idempotencyKey: string,
  ) {
    assertModerationOperationsEnabled();
    if (!['approve', 'limit', 'hide', 'restore'].includes(action)) {
      throw new BadRequestException({ code: 'INVALID_MODERATION_ACTION' });
    }
    const normalizedReason = reason.trim().normalize('NFC');
    if ([...normalizedReason].length < 2 || [...normalizedReason].length > 500) {
      throw new BadRequestException({ code: 'MODERATION_REASON_REQUIRED' });
    }
    const requestHash = this.hash({ caseId, action, normalizedReason, expectedVersion });
    return this.dataSource.transaction(async (manager) => {
      const actor = await this.requireModerator(manager, userId, true);
      const actionRepo = manager.getRepository(ModerationAction);
      const replay = await actionRepo.findOne({
        where: { actorId: userId, idempotencyKey },
        lock: { mode: 'pessimistic_write' },
      });
      if (replay) {
        if (replay.requestHash !== requestHash) {
          throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' });
        }
        return replay.result;
      }
      const caseRow = await manager.getRepository(ModerationCase).findOne({
        where: { id: caseId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!caseRow) {
        throw new NotFoundException({ code: 'MODERATION_CASE_NOT_FOUND' });
      }
      if (caseRow.version !== expectedVersion) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          currentVersion: caseRow.version,
        });
      }

      const previousState = await this.currentContentState(manager, caseRow);
      await this.applyContentState(manager, caseRow, action, normalizedReason);
      if (action === 'approve') {
        await this.approvedPublicationSideEffects(manager, caseRow);
      }
      const nextState = await this.currentContentState(manager, caseRow);
      caseRow.status = 'resolved';
      caseRow.assignedTo = actor.id;
      caseRow.version += 1;
      caseRow.contentStateSnapshot = nextState;
      await manager.getRepository(ModerationCase).save(caseRow);

      const audit = actionRepo.create({
        caseId: caseRow.id,
        actorId: actor.id,
        actorRole: actor.communityRole,
        action,
        reason: normalizedReason,
        previousState,
        nextState,
        idempotencyKey,
        requestHash,
        result: {},
      });
      await actionRepo.save(audit);
      await manager.getRepository(AdminAuditLog).save(
        manager.getRepository(AdminAuditLog).create({
          actorId: actor.id,
          actorRole: actor.communityRole,
          action: `moderation.${action}`,
          targetType: caseRow.contentType,
          targetId: caseRow.contentId,
          reason: normalizedReason,
          requestId: idempotencyKey,
          previousState,
          nextState,
        }),
      );
      await this.notifications.create(manager, {
        userId: caseRow.authorId,
        actorUserId: actor.id,
        category: 'reply',
        eventType: 'content.moderated',
        title: '内容审核结果',
        summary: this.actionSummary(action),
        resourceType: caseRow.contentType,
        resourceId: caseRow.contentId,
        resourcePath:
          caseRow.contentType === 'post'
            ? `/community/posts/${caseRow.contentId}`
            : null,
        dedupeKey: `moderation:${caseRow.id}:${caseRow.version}`,
      });
      const result = await this.caseDetail(manager, caseRow);
      audit.result = result as Record<string, unknown>;
      await actionRepo.save(audit);
      return result;
    });
  }

  async openCase(
    manager: EntityManager,
    input: OpenModerationCaseInput,
  ): Promise<ModerationCase> {
    const repo = manager.getRepository(ModerationCase);
    const existing = await repo.findOne({
      where: {
        contentType: input.contentType,
        contentId: input.contentId,
        revisionId: input.revisionId,
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (existing) {
      existing.status = 'open';
      existing.sourceType =
        input.sourceType === 'report' ? 'report' : existing.sourceType;
      if (RISK_ORDER[input.riskLevel] > RISK_ORDER[existing.riskLevel]) {
        existing.riskLevel = input.riskLevel;
      }
      if (input.incrementReport) existing.reportCount += 1;
      existing.version += 1;
      existing.titleSnapshot = input.title;
      existing.bodySnapshot = input.body;
      existing.contentStateSnapshot = input.contentState;
      return repo.save(existing);
    }
    return repo.save(
      repo.create({
        contentType: input.contentType,
        contentId: input.contentId,
        revisionId: input.revisionId,
        authorId: input.authorId,
        status: 'open',
        riskLevel: input.riskLevel,
        sourceType: input.sourceType,
        titleSnapshot: input.title,
        bodySnapshot: input.body,
        contentStateSnapshot: input.contentState,
        reportCount: input.incrementReport ? 1 : 0,
        assignedTo: null,
        version: 1,
      }),
    );
  }

  async resolvePendingCase(
    manager: EntityManager,
    contentType: 'post' | 'comment',
    contentId: string,
    revisionId: string,
  ): Promise<void> {
    const row = await manager.getRepository(ModerationCase).findOne({
      where: { contentType, contentId, revisionId },
      lock: { mode: 'pessimistic_write' },
    });
    if (row && row.status !== 'resolved') {
      row.status = 'resolved';
      row.version += 1;
      await manager.getRepository(ModerationCase).save(row);
    }
  }

  private async applyContentState(
    manager: EntityManager,
    caseRow: ModerationCase,
    action: ModerationActionName,
    reason: string,
  ): Promise<void> {
    const now = new Date();
    if (caseRow.contentType === 'post') {
      const post = await manager.getRepository(CommunityPost).findOne({
        where: { id: caseRow.contentId },
        lock: { mode: 'pessimistic_write' },
      });
      const revision = await manager.getRepository(PostRevision).findOne({
        where: { id: caseRow.revisionId, postId: caseRow.contentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!post || !revision) throw new NotFoundException({ code: 'CONTENT_NOT_FOUND' });
      if (action === 'approve') {
        revision.publicationStatus = 'published';
        revision.reviewDecision = 'approved';
        revision.reviewReason = reason;
        revision.effectiveAt = now;
        revision.moderationStatus = 'normal';
        post.activeRevisionId = revision.id;
        if (post.pendingRevisionId === revision.id) post.pendingRevisionId = null;
        post.publicationStatus = 'published';
        post.moderationStatus = 'normal';
        post.moderationReason = null;
        post.lastReviewDecision = 'approved';
        post.lastReviewReason = reason;
      } else {
        const status: ContentModerationStatus = action === 'limit' ? 'limited' : action === 'hide' ? 'hidden' : 'normal';
        post.moderationStatus = status;
        post.moderationReason = status === 'normal' ? null : reason;
        revision.moderationStatus = status;
      }
      post.version += 1;
      await manager.getRepository(PostRevision).save(revision);
      await manager.getRepository(CommunityPost).save(post);
      return;
    }

    const comment = await manager.getRepository(CommunityComment).findOne({
      where: { id: caseRow.contentId },
      lock: { mode: 'pessimistic_write' },
    });
    const revision = await manager.getRepository(CommentRevision).findOne({
      where: { id: caseRow.revisionId, commentId: caseRow.contentId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!comment || !revision) throw new NotFoundException({ code: 'CONTENT_NOT_FOUND' });
    if (action === 'approve') {
      revision.publicationStatus = 'published';
      revision.reviewDecision = 'approved';
      revision.reviewReason = reason;
      revision.effectiveAt = now;
      revision.moderationStatus = 'normal';
      comment.activeRevisionId = revision.id;
      if (comment.pendingRevisionId === revision.id) comment.pendingRevisionId = null;
      comment.publicationStatus = 'published';
      comment.moderationStatus = 'normal';
      comment.moderationReason = null;
      comment.lastReviewDecision = 'approved';
      comment.lastReviewReason = reason;
    } else {
      const status: ContentModerationStatus = action === 'limit' ? 'limited' : action === 'hide' ? 'hidden' : 'normal';
      comment.moderationStatus = status;
      comment.moderationReason = status === 'normal' ? null : reason;
      revision.moderationStatus = status;
    }
    comment.version += 1;
    await manager.getRepository(CommentRevision).save(revision);
    await manager.getRepository(CommunityComment).save(comment);
  }

  private async currentContentState(
    manager: EntityManager,
    row: ModerationCase,
  ): Promise<Record<string, unknown>> {
    const content =
      row.contentType === 'post'
        ? await manager.getRepository(CommunityPost).findOne({ where: { id: row.contentId } })
        : await manager.getRepository(CommunityComment).findOne({ where: { id: row.contentId } });
    return content
      ? {
          publicationStatus: content.publicationStatus,
          moderationStatus: content.moderationStatus,
          deletedAt: content.deletedAt?.toISOString() ?? null,
          version: content.version,
          lastReviewDecision: content.lastReviewDecision,
          lastReviewReason: content.lastReviewReason,
          moderationReason: content.moderationReason,
        }
      : row.contentStateSnapshot;
  }

  private async caseSummary(manager: EntityManager, row: ModerationCase) {
    const assigned = row.assignedTo
      ? await manager.getRepository(User).findOne({ where: { id: row.assignedTo } })
      : null;
    return {
      id: row.id,
      status: row.status,
      riskLevel: row.riskLevel,
      contentType: row.contentType,
      contentId: row.contentId,
      title: row.titleSnapshot,
      excerpt: this.excerpt(row.bodySnapshot),
      reportCount: row.reportCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      assignedTo: assigned?.publicId ?? null,
      contentState: await this.currentContentState(manager, row),
    };
  }

  private async caseDetail(manager: EntityManager, row: ModerationCase) {
    const author = await manager.getRepository(User).findOne({ where: { id: row.authorId } });
    if (!author) throw new NotFoundException({ code: 'CONTENT_AUTHOR_NOT_FOUND' });
    const profile = await manager.getRepository(PlayerProfile).findOne({
      where: { userId: row.authorId },
    });
    const reports = await manager.getRepository(ContentReport).find({
      where: { targetType: row.contentType, targetId: row.contentId },
      order: { createdAt: 'ASC' },
    });
    const actions = await manager.getRepository(ModerationAction).find({
      where: { caseId: row.id },
      order: { createdAt: 'ASC' },
    });
    const summary = await this.caseSummary(manager, row);
    const auditTrail = [];
    for (const action of actions) {
      const actor = await manager.getRepository(User).findOne({
        where: { id: action.actorId },
      });
      auditTrail.push({
        id: action.id,
        action: action.action,
        actorDisplayName: actor?.displayName ?? '审核人员',
        actorRole: action.actorRole,
        reason: action.reason,
        createdAt: action.createdAt.toISOString(),
        previousState: action.previousState,
        nextState: action.nextState,
      });
    }
    return {
      ...summary,
      bodySnapshot: row.bodySnapshot,
      author: {
        publicId: author.publicId,
        displayName: author.displayName ?? '办公室同事',
        avatarKey: profile?.avatarKey ?? 'violet',
        battleProfession: profile?.battleProfession ?? null,
        ipRegion: null,
      },
      reports: reports.map((report) => ({
        id: report.id,
        reason: report.reason,
        details: report.details,
        createdAt: report.createdAt.toISOString(),
      })),
      auditTrail,
      version: row.version,
      allowedActions: moderationOperationsEnabled()
        ? (['approve', 'limit', 'hide', 'restore'] as const)
        : ([] as const),
    };
  }

  private async requireModerator(
    manager: EntityManager,
    userId: string,
    lock = false,
  ): Promise<User & { communityRole: 'moderator' | 'admin' }> {
    const user = await manager.getRepository(User).findOne({
      where: { id: userId, accountStatus: 'active' },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!user || (user.communityRole !== 'moderator' && user.communityRole !== 'admin')) {
      throw new ForbiddenException({ code: 'MODERATOR_ACCESS_REQUIRED' });
    }
    return user as User & { communityRole: 'moderator' | 'admin' };
  }

  private optionalEnum<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
    if (value === undefined || value === '') return null;
    if (!allowed.includes(value as T)) {
      throw new BadRequestException({ code: 'INVALID_MODERATION_FILTER' });
    }
    return value as T;
  }

  private cursorStart(rows: ModerationCase[], cursor?: string): number {
    if (!cursor) return 0;
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
        id?: unknown;
        updatedAt?: unknown;
      };
      const index = rows.findIndex(
        (row) =>
          row.id === parsed.id && row.updatedAt.toISOString() === parsed.updatedAt,
      );
      if (index < 0) throw new Error('invalid');
      return index + 1;
    } catch {
      throw new BadRequestException({ code: 'INVALID_CURSOR' });
    }
  }

  private cursor(row: ModerationCase): string {
    return Buffer.from(
      JSON.stringify({ id: row.id, updatedAt: row.updatedAt.toISOString() }),
    ).toString('base64url');
  }

  private excerpt(body: string): string {
    return body.replace(/\s+/g, ' ').trim().slice(0, 180);
  }

  private actionSummary(action: ModerationActionName): string {
    return action === 'approve'
      ? '内容已通过审核'
      : action === 'limit'
        ? '内容已限制展示，请查看原因'
        : action === 'hide'
          ? '内容已隐藏，请查看原因'
          : '内容的展示限制已恢复';
  }

  private async approvedPublicationSideEffects(
    manager: EntityManager,
    row: ModerationCase,
  ): Promise<void> {
    if (row.contentType === 'post') {
      return;
    }

    const comment = await manager.getRepository(CommunityComment).findOne({
      where: { id: row.contentId },
    });
    if (!comment) return;
    const post = await manager.getRepository(CommunityPost).findOne({
      where: { id: comment.postId },
    });
    if (!post) return;
    const recipients = new Set<string>([post.authorId]);
    if (comment.parentCommentId) {
      const parent = await manager.getRepository(CommunityComment).findOne({
        where: { id: comment.parentCommentId, postId: comment.postId },
      });
      if (parent) recipients.add(parent.authorId);
    }
    const follows = await manager.getRepository(PostFollow).find({
      where: { postId: comment.postId },
    });
    follows.forEach((follow) => recipients.add(follow.userId));
    recipients.delete(comment.authorId);
    const actor = await manager.getRepository(User).findOne({
      where: { id: comment.authorId },
    });
    const bucket = Math.floor(Date.now() / (10 * 60 * 1_000));
    for (const recipientId of recipients) {
      if (await this.policy.isBlocked(manager, recipientId, comment.authorId)) {
        continue;
      }
      await this.notifications.create(manager, {
        userId: recipientId,
        actorUserId: comment.authorId,
        category: 'reply',
        eventType: 'community.post.replied',
        title: '帖子有新回复',
        summary: `${actor?.displayName ?? '一位同事'}回复了你关注的帖子`,
        resourceType: 'post',
        resourceId: comment.postId,
        resourcePath: `/community/posts/${comment.postId}`,
        dedupeKey: `post-replies:${comment.postId}:${recipientId}:${bucket}`,
      });
    }
  }

  private hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}
import { createHash } from 'node:crypto';
