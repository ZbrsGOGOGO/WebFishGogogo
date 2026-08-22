import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  SelectQueryBuilder,
} from 'typeorm';

import { AdminAuditLog } from '../../database/entities/admin-audit-log.entity';
import { CommentRevision } from '../../database/entities/comment-revision.entity';
import { CommunityCommandReceipt } from '../../database/entities/community-command-receipt.entity';
import { CommunityComment } from '../../database/entities/community-comment.entity';
import {
  CommunityPost,
  CommunityPostChannel,
  CommunityPostType,
} from '../../database/entities/community-post.entity';
import { ContentReport } from '../../database/entities/content-report.entity';
import { PlayerProfile } from '../../database/entities/player-profile.entity';
import { PostBookmark } from '../../database/entities/post-bookmark.entity';
import { PostFollow } from '../../database/entities/post-follow.entity';
import { PostRevision } from '../../database/entities/post-revision.entity';
import { PostUsefulReaction } from '../../database/entities/post-useful-reaction.entity';
import { UserBlock } from '../../database/entities/user-block.entity';
import { User } from '../../database/entities/user.entity';
import {
  assertContentWritesEnabled,
  contentWritesEnabled,
} from './content-gates';
import {
  assessContentRisk,
  contentHash,
  ContentRiskLevel,
  lowRiskAutoPublishEnabled,
  normalizeSearchQuery,
  SavePostInput,
  searchDocument,
} from './content-validation';
import { ModerationService } from './moderation.service';
import { NotificationService } from './notification.service';
import { RelationshipPolicyService } from './relationship-policy.service';

const POST_PAGE_SIZE = 20;
const POST_SCAN_BATCH_SIZE = 200;
const COMMENT_PAGE_SIZE = 50;
const COMMENT_SCAN_BATCH_SIZE = 200;
const RESTORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PostSort = 'latest' | 'popular' | 'unresolved';
type PostListCandidate = {
  post: CommunityPost;
  revision: PostRevision;
  summary: Record<string, any>;
  popularityScore?: number;
};

@Injectable()
export class ContentService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly policy: RelationshipPolicyService,
    private readonly notifications: NotificationService,
    private readonly moderation: ModerationService,
  ) {}

  async listPosts(
    viewerId: string | null,
    filters: {
      channel?: string;
      type?: string;
      tag?: string;
      q?: unknown;
      sort?: string;
      cursor?: string;
    },
  ) {
    const channel = this.optionalChannel(filters.channel);
    const type = this.optionalType(filters.type);
    const tag = this.optionalTag(filters.tag);
    const query = normalizeSearchQuery(filters.q);
    const sort = this.postSort(filters.sort);
    const viewer = await this.optionalActiveUser(this.dataSource.manager, viewerId);
    if (!channel && !type && !tag && !query && sort === 'latest') {
      const blocked = viewer
        ? await this.blockedUserIds(this.dataSource.manager, viewer.id)
        : new Set<string>();
      return this.latestPostPage(
        this.dataSource.manager,
        viewer,
        blocked,
        filters.cursor,
      );
    }
    const manager = this.dataSource.manager;
    const blocked = viewer
      ? await this.blockedUserIds(manager, viewer.id)
      : new Set<string>();
    return this.filteredPostPage(
      manager,
      viewer,
      blocked,
      { channel, type, tag, query, sort },
      filters.cursor,
    );
  }

  async getPost(postId: string, viewerId: string | null) {
    const viewer = await this.optionalActiveUser(this.dataSource.manager, viewerId);
    const post = await this.dataSource.getRepository(CommunityPost).findOne({
      where: { id: postId },
    });
    if (!post) throw this.contentNotFound();
    const revision = await this.selectPostRevision(
      this.dataSource.manager,
      post,
      viewer,
    );
    return this.postView(this.dataSource.manager, post, revision, viewer, true);
  }

  async createPost(userId: string, input: SavePostInput, idempotencyKey: string) {
    assertContentWritesEnabled();
    const hash = contentHash(input);
    return this.dataSource.transaction(async (manager) => {
      const author = await this.requirePublisher(manager, userId, true);
      const replay = await this.replay(manager, userId, 'content.post.create', idempotencyKey, hash);
      if (replay) return replay;
      const postRepo = manager.getRepository(CommunityPost);
      const post = await postRepo.save(
        postRepo.create({
          authorId: userId,
          activeRevisionId: null,
          pendingRevisionId: null,
          acceptedCommentId: null,
          publicationStatus: 'draft',
          moderationStatus: 'normal',
          lastReviewDecision: null,
          lastReviewReason: null,
          moderationReason: null,
          deletedAt: null,
          version: 1,
        }),
      );
      const revision = await this.createPostRevision(manager, post, input, 'draft');
      post.pendingRevisionId = revision.id;
      await postRepo.save(post);
      const result = await this.postView(manager, post, revision, author, true);
      return this.record(manager, userId, 'content.post.create', idempotencyKey, hash, result);
    });
  }

  async updatePost(
    userId: string,
    postId: string,
    input: SavePostInput,
    expectedVersion: number,
    idempotencyKey: string,
  ) {
    assertContentWritesEnabled();
    const hash = contentHash({ postId, input, expectedVersion });
    return this.dataSource.transaction(async (manager) => {
      const author = await this.requirePublisher(manager, userId, true);
      const replay = await this.replay(manager, userId, 'content.post.update', idempotencyKey, hash);
      if (replay) return replay;
      const post = await this.lockPost(manager, postId);
      this.requireAuthor(post, userId);
      this.assertVersion(post.version, expectedVersion);
      if (post.deletedAt) throw new ConflictException({ code: 'CONTENT_DELETED' });
      const previousState = this.state(post);
      if (post.pendingRevisionId) {
        const superseded = await manager.getRepository(PostRevision).findOne({
          where: { id: post.pendingRevisionId, postId: post.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (superseded) {
          superseded.reviewDecision = 'withdrawn';
          superseded.reviewReason = '由更新后的修订替代';
          await manager.getRepository(PostRevision).save(superseded);
          await this.moderation.resolvePendingCase(manager, 'post', post.id, superseded.id);
        }
      }
      post.version += 1;
      const revision = await this.createPostRevision(manager, post, input, 'draft');
      post.pendingRevisionId = revision.id;
      post.publicationStatus = post.activeRevisionId ? 'published' : 'draft';
      post.lastReviewDecision = null;
      post.lastReviewReason = null;
      await manager.getRepository(CommunityPost).save(post);
      await this.audit(manager, author, 'post.edited', 'post', post.id, null, idempotencyKey, previousState, this.state(post));
      const result = await this.postView(manager, post, revision, author, true);
      return this.record(manager, userId, 'content.post.update', idempotencyKey, hash, result);
    });
  }

  async submitPostReview(userId: string, postId: string, expectedVersion: number) {
    return this.transitionPostReview(userId, postId, expectedVersion, 'submit');
  }

  async withdrawPostReview(userId: string, postId: string, expectedVersion: number) {
    return this.transitionPostReview(userId, postId, expectedVersion, 'withdraw');
  }

  async deletePost(userId: string, postId: string, expectedVersion: number) {
    return this.softDeletePost(userId, postId, expectedVersion, false);
  }

  async restorePost(userId: string, postId: string, expectedVersion: number) {
    return this.softDeletePost(userId, postId, expectedVersion, true);
  }

  async listPostRevisions(postId: string, viewerId: string | null) {
    const viewer = await this.optionalActiveUser(this.dataSource.manager, viewerId);
    const post = await this.dataSource.getRepository(CommunityPost).findOne({ where: { id: postId } });
    if (!post) throw this.contentNotFound();
    await this.selectPostRevision(this.dataSource.manager, post, viewer);
    const privileged = viewer?.id === post.authorId || this.isModerator(viewer);
    const rows = await this.dataSource.getRepository(PostRevision).find({
      where: { postId },
      order: { version: 'DESC' },
    });
    return {
      items: rows
        .filter(
          (revision) =>
            privileged ||
            (revision.publicationStatus === 'published' &&
              revision.moderationStatus === 'normal'),
        )
        .map((revision) => this.postRevisionView(revision)),
    };
  }

  async listComments(postId: string, viewerId: string | null, cursor?: string) {
    const manager = this.dataSource.manager;
    const viewer = await this.optionalActiveUser(manager, viewerId);
    const post = await manager.getRepository(CommunityPost).findOne({ where: { id: postId } });
    if (!post) throw this.contentNotFound();
    await this.selectPostRevision(manager, post, viewer);
    const blocked = viewer
      ? await this.blockedUserIds(manager, viewer.id)
      : new Set<string>();
    const decodedCursor = this.decodeCommentCursor(cursor);
    const pageQuery = manager
      .getRepository(CommunityComment)
      .createQueryBuilder('comment')
      .where('comment.post_id = :postId', { postId });
    if (decodedCursor) {
      pageQuery.andWhere(
        '(comment.created_at > :cursorCreatedAt OR (comment.created_at = :cursorCreatedAt AND comment.id > :cursorId))',
        {
          cursorCreatedAt: decodedCursor.createdAt,
          cursorId: decodedCursor.id,
        },
      );
    }
    const scanned = await pageQuery
      .orderBy('comment.createdAt', 'ASC')
      .addOrderBy('comment.id', 'ASC')
      .take(COMMENT_SCAN_BATCH_SIZE + 1)
      .getMany();
    const hasMoreRaw = scanned.length > COMMENT_SCAN_BATCH_SIZE;
    const rows = scanned.slice(0, COMMENT_SCAN_BATCH_SIZE);
    const rowIds = new Set(rows.map((comment) => comment.id));
    const missingParentIds = [
      ...new Set(
        rows
          .map((comment) => comment.parentCommentId)
          .filter(
            (id): id is string => id !== null && !rowIds.has(id),
          ),
      ),
    ];
    const parents =
      missingParentIds.length > 0
        ? await manager.getRepository(CommunityComment).find({
            where: { id: In(missingParentIds), postId },
          })
        : [];
    const contextRows = [...rows, ...parents];
    const authorIds = [...new Set(contextRows.map((comment) => comment.authorId))];
    const selectedRevisionIds = contextRows
      .map((comment) =>
        viewer?.id === comment.authorId || this.isModerator(viewer)
          ? comment.pendingRevisionId ?? comment.activeRevisionId
          : comment.activeRevisionId,
      )
      .filter((id): id is string => id !== null);
    const [authors, profiles, revisions] = await Promise.all([
      authorIds.length > 0
        ? manager.getRepository(User).find({ where: { id: In(authorIds) } })
        : Promise.resolve([]),
      authorIds.length > 0
        ? manager.getRepository(PlayerProfile).find({
            where: { userId: In(authorIds) },
          })
        : Promise.resolve([]),
      selectedRevisionIds.length > 0
        ? manager.getRepository(CommentRevision).find({
            where: { id: In(selectedRevisionIds) },
          })
        : Promise.resolve([]),
    ]);
    const authorById = new Map(authors.map((author) => [author.id, author]));
    const profileByUser = new Map(profiles.map((profile) => [profile.userId, profile]));
    const revisionById = new Map(revisions.map((revision) => [revision.id, revision]));
    const commentById = new Map(contextRows.map((comment) => [comment.id, comment]));
    const visible: Array<{ comment: CommunityComment; revision: CommentRevision }> = [];
    for (const comment of rows) {
      const revision = this.visibleCommentRevisionFromContext(
        comment,
        viewer,
        authorById,
        revisionById,
        blocked,
      );
      if (!revision) continue;
      if (comment.parentCommentId) {
        const parent = commentById.get(comment.parentCommentId);
        if (
          !parent ||
          !this.visibleCommentRevisionFromContext(
            parent,
            viewer,
            authorById,
            revisionById,
            blocked,
          )
        ) {
          continue;
        }
      }
      if (visible.length >= COMMENT_PAGE_SIZE + 1) {
        continue;
      }
      visible.push({ comment, revision });
    }
    const page = visible.slice(0, COMMENT_PAGE_SIZE);
    const moreVisibleInWindow = visible.length > COMMENT_PAGE_SIZE;
    const resumeComment = moreVisibleInWindow
      ? page.at(-1)?.comment
      : hasMoreRaw
        ? rows.at(-1)
        : null;
    return {
      items: page.map(({ comment, revision }) =>
        this.commentViewFromContext(
          comment,
          revision,
          viewer,
          authorById,
          profileByUser,
          revisionById,
        ),
      ),
      nextCursor: resumeComment ? this.commentCursor(resumeComment) : null,
    };
  }

  async createComment(
    userId: string,
    postId: string,
    body: string,
    parentCommentId: string | null,
    idempotencyKey: string,
  ) {
    assertContentWritesEnabled();
    const hash = contentHash({ postId, body, parentCommentId });
    return this.dataSource.transaction(async (manager) => {
      const author = await this.requirePublisher(manager, userId, true);
      const replay = await this.replay(manager, userId, 'content.comment.create', idempotencyKey, hash);
      if (replay) return replay;
      const post = await this.lockPost(manager, postId);
      const publishedRevision = post.activeRevisionId
        ? await manager.getRepository(PostRevision).findOne({
            where: {
              id: post.activeRevisionId,
              postId: post.id,
              publicationStatus: 'published',
            },
          })
        : null;
      if (
        post.publicationStatus !== 'published' ||
        post.deletedAt ||
        post.moderationStatus !== 'normal' ||
        !publishedRevision
      ) {
        throw new ForbiddenException({ code: 'COMMENTS_NOT_ALLOWED' });
      }
      if (await this.policy.isBlocked(manager, userId, post.authorId)) {
        throw this.contentNotFound();
      }
      let depth: 0 | 1 = 0;
      if (parentCommentId) {
        const parent = await manager.getRepository(CommunityComment).findOne({
          where: { id: parentCommentId, postId },
        });
        if (
          !parent ||
          parent.depth !== 0 ||
          parent.deletedAt ||
          parent.publicationStatus !== 'published' ||
          parent.moderationStatus !== 'normal'
        ) {
          throw new BadRequestException({ code: 'INVALID_COMMENT_PARENT' });
        }
        if (await this.policy.isBlocked(manager, userId, parent.authorId)) {
          throw new BadRequestException({ code: 'INVALID_COMMENT_PARENT' });
        }
        depth = 1;
      }
      const risk = assessContentRisk(body);
      const autoPublish = lowRiskAutoPublishEnabled(risk);
      const commentRepo = manager.getRepository(CommunityComment);
      const comment = await commentRepo.save(
        commentRepo.create({
          postId,
          authorId: userId,
          parentCommentId,
          depth,
          activeRevisionId: null,
          pendingRevisionId: null,
          publicationStatus: autoPublish ? 'published' : 'pending_review',
          moderationStatus: 'normal',
          lastReviewDecision: autoPublish ? 'approved' : null,
          lastReviewReason: autoPublish ? '低风险自动审核' : null,
          moderationReason: null,
          deletedAt: null,
          version: 1,
        }),
      );
      const revision = await this.createCommentRevision(
        manager,
        comment,
        body,
        autoPublish ? 'published' : 'pending_review',
        risk,
      );
      if (autoPublish) {
        comment.activeRevisionId = revision.id;
        await this.commentPublishedSideEffects(manager, comment);
      } else {
        if (risk === 'high' || risk === 'critical') {
          revision.moderationStatus = 'hidden';
          await manager.getRepository(CommentRevision).save(revision);
        }
        comment.pendingRevisionId = revision.id;
        await this.moderation.openCase(manager, {
          contentType: 'comment',
          contentId: comment.id,
          revisionId: revision.id,
          authorId: userId,
          sourceType: 'submission',
          riskLevel: risk,
          title: null,
          body,
          contentState: this.state(comment),
        });
      }
      await commentRepo.save(comment);
      const result = await this.commentView(manager, comment, revision, author);
      return this.record(manager, userId, 'content.comment.create', idempotencyKey, hash, result);
    });
  }

  async updateComment(
    userId: string,
    commentId: string,
    body: string,
    expectedVersion: number,
    idempotencyKey: string,
  ) {
    assertContentWritesEnabled();
    const hash = contentHash({ commentId, body, expectedVersion });
    return this.dataSource.transaction(async (manager) => {
      const author = await this.requirePublisher(manager, userId, true);
      const replay = await this.replay(manager, userId, 'content.comment.update', idempotencyKey, hash);
      if (replay) return replay;
      const comment = await this.lockComment(manager, commentId);
      this.requireCommentAuthor(comment, userId);
      this.assertVersion(comment.version, expectedVersion);
      if (comment.deletedAt) throw new ConflictException({ code: 'CONTENT_DELETED' });
      const previousState = this.state(comment);
      if (comment.pendingRevisionId) {
        const superseded = await manager.getRepository(CommentRevision).findOne({
          where: { id: comment.pendingRevisionId, commentId },
          lock: { mode: 'pessimistic_write' },
        });
        if (superseded) {
          superseded.reviewDecision = 'withdrawn';
          superseded.reviewReason = '由更新后的修订替代';
          await manager.getRepository(CommentRevision).save(superseded);
          await this.moderation.resolvePendingCase(manager, 'comment', comment.id, superseded.id);
        }
      }
      comment.version += 1;
      const revision = await this.createCommentRevision(
        manager,
        comment,
        body,
        'draft',
        assessContentRisk(body),
      );
      comment.pendingRevisionId = revision.id;
      comment.publicationStatus = comment.activeRevisionId ? 'published' : 'draft';
      comment.lastReviewDecision = null;
      comment.lastReviewReason = null;
      await manager.getRepository(CommunityComment).save(comment);
      await this.audit(manager, author, 'comment.edited', 'comment', comment.id, null, idempotencyKey, previousState, this.state(comment));
      const result = await this.commentView(manager, comment, revision, author);
      return this.record(manager, userId, 'content.comment.update', idempotencyKey, hash, result);
    });
  }

  async submitCommentReview(userId: string, commentId: string, expectedVersion: number) {
    return this.transitionCommentReview(userId, commentId, expectedVersion, 'submit');
  }

  async withdrawCommentReview(userId: string, commentId: string, expectedVersion: number) {
    return this.transitionCommentReview(userId, commentId, expectedVersion, 'withdraw');
  }

  async deleteComment(userId: string, commentId: string, expectedVersion: number) {
    return this.softDeleteComment(userId, commentId, expectedVersion, false);
  }

  async restoreComment(userId: string, commentId: string, expectedVersion: number) {
    return this.softDeleteComment(userId, commentId, expectedVersion, true);
  }

  async listCommentRevisions(commentId: string, viewerId: string | null) {
    const viewer = await this.optionalActiveUser(this.dataSource.manager, viewerId);
    const comment = await this.dataSource.getRepository(CommunityComment).findOne({
      where: { id: commentId },
    });
    if (!comment) throw this.contentNotFound();
    const selected = await this.selectCommentRevision(
      this.dataSource.manager,
      comment,
      viewer,
      true,
    );
    if (!selected) throw this.contentNotFound();
    const privileged = viewer?.id === comment.authorId || this.isModerator(viewer);
    const rows = await this.dataSource.getRepository(CommentRevision).find({
      where: { commentId },
      order: { version: 'DESC' },
    });
    return {
      items: rows
        .filter(
          (revision) =>
            privileged ||
            (revision.publicationStatus === 'published' &&
              revision.moderationStatus === 'normal'),
        )
        .map((revision) => this.commentRevisionView(revision)),
    };
  }

  async setBookmark(userId: string, postId: string, value: boolean): Promise<void> {
    return this.setPostFlag(PostBookmark, userId, postId, value);
  }

  async setFollow(userId: string, postId: string, value: boolean): Promise<void> {
    return this.setPostFlag(PostFollow, userId, postId, value);
  }

  async setUseful(userId: string, postId: string, value: boolean): Promise<void> {
    return this.setPostFlag(PostUsefulReaction, userId, postId, value);
  }

  async acceptAnswer(
    userId: string,
    postId: string,
    commentId: string | null,
    expectedVersion: number,
  ) {
    assertContentWritesEnabled();
    const commandKey = `${postId}:${expectedVersion}:${commentId ?? 'none'}`;
    const hash = contentHash({ postId, commentId, expectedVersion });
    return this.dataSource.transaction(async (manager) => {
      const author = await this.requirePublisher(manager, userId, true);
      const replay = await this.replay(manager, userId, 'content.answer.accept', commandKey, hash);
      if (replay) return replay;
      const post = await this.lockPost(manager, postId);
      this.requireAuthor(post, userId);
      this.assertVersion(post.version, expectedVersion);
      const active = post.activeRevisionId
        ? await manager.getRepository(PostRevision).findOne({
            where: { id: post.activeRevisionId, postId },
          })
        : null;
      if (!active || active.type !== 'question' || post.deletedAt) {
        throw new ConflictException({ code: 'ANSWER_NOT_ALLOWED' });
      }
      let accepted: CommunityComment | null = null;
      if (commentId) {
        accepted = await manager.getRepository(CommunityComment).findOne({
          where: {
            id: commentId,
            postId,
            depth: 0,
            publicationStatus: 'published',
            moderationStatus: 'normal',
            deletedAt: IsNull(),
          },
        });
        if (!accepted) throw new BadRequestException({ code: 'INVALID_ACCEPTED_COMMENT' });
      }
      const previousState = this.state(post);
      post.acceptedCommentId = commentId;
      post.version += 1;
      await manager.getRepository(CommunityPost).save(post);
      await this.audit(manager, author, 'post.answer_accepted', 'post', post.id, null, commandKey, previousState, this.state(post));
      if (accepted && accepted.authorId !== userId) {
        await this.notifications.create(manager, {
          userId: accepted.authorId,
          actorUserId: userId,
          category: 'reply',
          eventType: 'question.answer_accepted',
          title: '回答已被采纳',
          summary: '你的回答被提问者标记为已解决答案',
          resourceType: 'post',
          resourceId: post.id,
          resourcePath: `/community/posts/${post.id}`,
          dedupeKey: `answer-accepted:${post.id}:${accepted.id}`,
        });
      }
      const revision = await this.selectPostRevision(manager, post, author);
      const result = await this.postView(manager, post, revision, author, true);
      return this.record(manager, userId, 'content.answer.accept', commandKey, hash, result);
    });
  }

  async report(
    userId: string,
    targetType: 'post' | 'comment',
    targetId: string,
    reason: ContentReport['reason'],
    details: string,
    idempotencyKey: string,
  ) {
    assertContentWritesEnabled();
    const hash = contentHash({ targetType, targetId, reason, details });
    return this.dataSource.transaction(async (manager) => {
      const reporter = await this.requireActiveUser(manager, userId, true);
      const repo = manager.getRepository(ContentReport);
      const replay = await repo.findOne({
        where: { reporterId: userId, idempotencyKey },
        lock: { mode: 'pessimistic_write' },
      });
      if (replay) {
        if (replay.requestHash !== hash) {
          throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' });
        }
        return { reportId: replay.id, receivedAt: replay.createdAt.toISOString() };
      }
      const evidence = await this.reportEvidence(manager, reporter, targetType, targetId);
      if (evidence.authorId === userId) {
        throw new BadRequestException({ code: 'CANNOT_REPORT_SELF' });
      }
      const report = await repo.save(
        repo.create({
          reporterId: userId,
          targetType,
          targetId,
          reason,
          details: details || null,
          evidenceSnapshot: {
            revisionId: evidence.revisionId,
            title: evidence.title,
            excerpt: this.excerpt(evidence.body),
            contentHash: contentHash(evidence.body),
          },
          status: 'open',
          idempotencyKey,
          requestHash: hash,
        }),
      );
      await this.moderation.openCase(manager, {
        contentType: targetType,
        contentId: targetId,
        revisionId: evidence.revisionId,
        authorId: evidence.authorId,
        sourceType: 'report',
        riskLevel: this.reportRisk(reason),
        title: evidence.title,
        body: evidence.body,
        contentState: evidence.state,
        incrementReport: true,
      });
      return { reportId: report.id, receivedAt: report.createdAt.toISOString() };
    });
  }

  private async transitionPostReview(
    userId: string,
    postId: string,
    expectedVersion: number,
    action: 'submit' | 'withdraw',
  ) {
    assertContentWritesEnabled();
    const commandType = `content.post.${action}`;
    const commandKey = `${postId}:${expectedVersion}`;
    const hash = contentHash({ postId, expectedVersion, action });
    return this.dataSource.transaction(async (manager) => {
      const author = await this.requirePublisher(manager, userId, true);
      const replay = await this.replay(manager, userId, commandType, commandKey, hash);
      if (replay) return replay;
      const post = await this.lockPost(manager, postId);
      this.requireAuthor(post, userId);
      this.assertVersion(post.version, expectedVersion);
      if (post.deletedAt) throw new ConflictException({ code: 'CONTENT_DELETED' });
      if (!post.pendingRevisionId) {
        throw new ConflictException({ code: 'NO_PENDING_REVISION' });
      }
      const revision = await manager.getRepository(PostRevision).findOne({
        where: { id: post.pendingRevisionId, postId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!revision) throw new ConflictException({ code: 'NO_PENDING_REVISION' });
      const previousState = this.state(post);
      if (action === 'submit') {
        if (revision.publicationStatus !== 'draft') {
          throw new ConflictException({ code: 'REVISION_NOT_DRAFT' });
        }
        const risk = assessContentRisk(`${revision.title}\n${revision.body}`);
        revision.riskLevel = risk;
        if (lowRiskAutoPublishEnabled(risk)) {
          revision.publicationStatus = 'published';
          revision.reviewDecision = 'approved';
          revision.reviewReason = '低风险自动审核';
          revision.effectiveAt = new Date();
          post.activeRevisionId = revision.id;
          post.pendingRevisionId = null;
          post.publicationStatus = 'published';
          post.lastReviewDecision = 'approved';
          post.lastReviewReason = '低风险自动审核';
        } else {
          revision.publicationStatus = 'pending_review';
          revision.moderationStatus =
            risk === 'high' || risk === 'critical' ? 'hidden' : 'normal';
          revision.reviewDecision = null;
          revision.reviewReason = null;
          if (!post.activeRevisionId) post.publicationStatus = 'pending_review';
          await this.moderation.openCase(manager, {
            contentType: 'post',
            contentId: post.id,
            revisionId: revision.id,
            authorId: post.authorId,
            sourceType: 'submission',
            riskLevel: risk,
            title: revision.title,
            body: revision.body,
            contentState: this.state(post),
          });
        }
      } else {
        if (revision.publicationStatus !== 'pending_review') {
          throw new ConflictException({ code: 'REVISION_NOT_PENDING_REVIEW' });
        }
        revision.publicationStatus = 'draft';
        revision.reviewDecision = 'withdrawn';
        revision.reviewReason = '作者主动撤回';
        post.publicationStatus = post.activeRevisionId ? 'published' : 'draft';
        post.lastReviewDecision = 'withdrawn';
        post.lastReviewReason = '作者主动撤回';
        await this.moderation.resolvePendingCase(manager, 'post', post.id, revision.id);
      }
      post.version += 1;
      await manager.getRepository(PostRevision).save(revision);
      await manager.getRepository(CommunityPost).save(post);
      await this.audit(
        manager,
        author,
        `post.review_${action}`,
        'post',
        post.id,
        action === 'withdraw' ? '作者主动撤回' : null,
        commandKey,
        previousState,
        this.state(post),
      );
      const result = await this.postView(manager, post, revision, author, true);
      return this.record(manager, userId, commandType, commandKey, hash, result);
    });
  }

  private async softDeletePost(
    userId: string,
    postId: string,
    expectedVersion: number,
    restore: boolean,
  ) {
    assertContentWritesEnabled();
    const commandType = restore ? 'content.post.restore' : 'content.post.delete';
    const commandKey = `${postId}:${expectedVersion}`;
    const hash = contentHash({ postId, expectedVersion, restore });
    return this.dataSource.transaction(async (manager) => {
      const author = await this.requireActiveUser(manager, userId, true);
      const replay = await this.replay(manager, userId, commandType, commandKey, hash);
      if (replay) return replay;
      const post = await this.lockPost(manager, postId);
      this.requireAuthor(post, userId);
      this.assertVersion(post.version, expectedVersion);
      const previousState = this.state(post);
      if (restore) {
        if (!post.deletedAt) throw new ConflictException({ code: 'CONTENT_NOT_DELETED' });
        if (Date.now() - post.deletedAt.getTime() > RESTORE_WINDOW_MS) {
          throw new ConflictException({ code: 'CONTENT_RESTORE_WINDOW_EXPIRED' });
        }
        post.deletedAt = null;
      } else {
        if (post.deletedAt) throw new ConflictException({ code: 'CONTENT_ALREADY_DELETED' });
        post.deletedAt = new Date();
      }
      post.version += 1;
      await manager.getRepository(CommunityPost).save(post);
      await this.audit(
        manager,
        author,
        restore ? 'post.restored' : 'post.deleted',
        'post',
        post.id,
        restore ? '作者在30天窗口内恢复' : '作者软删除',
        commandKey,
        previousState,
        this.state(post),
      );
      const revision = await this.selectPostRevision(manager, post, author);
      const result = await this.postView(manager, post, revision, author, true);
      return this.record(manager, userId, commandType, commandKey, hash, result);
    });
  }

  private async transitionCommentReview(
    userId: string,
    commentId: string,
    expectedVersion: number,
    action: 'submit' | 'withdraw',
  ) {
    assertContentWritesEnabled();
    const commandType = `content.comment.${action}`;
    const commandKey = `${commentId}:${expectedVersion}`;
    const hash = contentHash({ commentId, expectedVersion, action });
    return this.dataSource.transaction(async (manager) => {
      const author = await this.requirePublisher(manager, userId, true);
      const replay = await this.replay(manager, userId, commandType, commandKey, hash);
      if (replay) return replay;
      const comment = await this.lockComment(manager, commentId);
      this.requireCommentAuthor(comment, userId);
      this.assertVersion(comment.version, expectedVersion);
      if (comment.deletedAt) throw new ConflictException({ code: 'CONTENT_DELETED' });
      if (!comment.pendingRevisionId) {
        throw new ConflictException({ code: 'NO_PENDING_REVISION' });
      }
      const revision = await manager.getRepository(CommentRevision).findOne({
        where: { id: comment.pendingRevisionId, commentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!revision) throw new ConflictException({ code: 'NO_PENDING_REVISION' });
      const previousState = this.state(comment);
      if (action === 'submit') {
        if (revision.publicationStatus !== 'draft') {
          throw new ConflictException({ code: 'REVISION_NOT_DRAFT' });
        }
        const risk = assessContentRisk(revision.body);
        revision.riskLevel = risk;
        if (lowRiskAutoPublishEnabled(risk)) {
          revision.publicationStatus = 'published';
          revision.reviewDecision = 'approved';
          revision.reviewReason = '低风险自动审核';
          revision.effectiveAt = new Date();
          comment.activeRevisionId = revision.id;
          comment.pendingRevisionId = null;
          comment.publicationStatus = 'published';
          comment.lastReviewDecision = 'approved';
          comment.lastReviewReason = '低风险自动审核';
          await this.commentPublishedSideEffects(manager, comment);
        } else {
          revision.publicationStatus = 'pending_review';
          revision.moderationStatus =
            risk === 'high' || risk === 'critical' ? 'hidden' : 'normal';
          if (!comment.activeRevisionId) comment.publicationStatus = 'pending_review';
          await this.moderation.openCase(manager, {
            contentType: 'comment',
            contentId: comment.id,
            revisionId: revision.id,
            authorId: comment.authorId,
            sourceType: 'submission',
            riskLevel: risk,
            title: null,
            body: revision.body,
            contentState: this.state(comment),
          });
        }
      } else {
        if (revision.publicationStatus !== 'pending_review') {
          throw new ConflictException({ code: 'REVISION_NOT_PENDING_REVIEW' });
        }
        revision.publicationStatus = 'draft';
        revision.reviewDecision = 'withdrawn';
        revision.reviewReason = '作者主动撤回';
        comment.publicationStatus = comment.activeRevisionId ? 'published' : 'draft';
        comment.lastReviewDecision = 'withdrawn';
        comment.lastReviewReason = '作者主动撤回';
        await this.moderation.resolvePendingCase(
          manager,
          'comment',
          comment.id,
          revision.id,
        );
      }
      comment.version += 1;
      await manager.getRepository(CommentRevision).save(revision);
      await manager.getRepository(CommunityComment).save(comment);
      await this.audit(
        manager,
        author,
        `comment.review_${action}`,
        'comment',
        comment.id,
        action === 'withdraw' ? '作者主动撤回' : null,
        commandKey,
        previousState,
        this.state(comment),
      );
      const result = await this.commentView(manager, comment, revision, author);
      return this.record(manager, userId, commandType, commandKey, hash, result);
    });
  }

  private async softDeleteComment(
    userId: string,
    commentId: string,
    expectedVersion: number,
    restore: boolean,
  ) {
    assertContentWritesEnabled();
    const commandType = restore ? 'content.comment.restore' : 'content.comment.delete';
    const commandKey = `${commentId}:${expectedVersion}`;
    const hash = contentHash({ commentId, expectedVersion, restore });
    return this.dataSource.transaction(async (manager) => {
      const author = await this.requireActiveUser(manager, userId, true);
      const replay = await this.replay(manager, userId, commandType, commandKey, hash);
      if (replay) return replay;
      const comment = await this.lockComment(manager, commentId);
      this.requireCommentAuthor(comment, userId);
      this.assertVersion(comment.version, expectedVersion);
      const previousState = this.state(comment);
      if (restore) {
        if (!comment.deletedAt) throw new ConflictException({ code: 'CONTENT_NOT_DELETED' });
        if (Date.now() - comment.deletedAt.getTime() > RESTORE_WINDOW_MS) {
          throw new ConflictException({ code: 'CONTENT_RESTORE_WINDOW_EXPIRED' });
        }
        comment.deletedAt = null;
      } else {
        if (comment.deletedAt) throw new ConflictException({ code: 'CONTENT_ALREADY_DELETED' });
        comment.deletedAt = new Date();
      }
      comment.version += 1;
      await manager.getRepository(CommunityComment).save(comment);
      await this.audit(
        manager,
        author,
        restore ? 'comment.restored' : 'comment.deleted',
        'comment',
        comment.id,
        restore ? '作者在30天窗口内恢复' : '作者软删除',
        commandKey,
        previousState,
        this.state(comment),
      );
      const revision = await this.selectCommentRevision(manager, comment, author, true);
      if (!revision) throw this.contentNotFound();
      const result = await this.commentView(manager, comment, revision, author);
      return this.record(manager, userId, commandType, commandKey, hash, result);
    });
  }

  private async createPostRevision(
    manager: EntityManager,
    post: CommunityPost,
    input: SavePostInput,
    publicationStatus: 'draft' | 'pending_review' | 'published',
  ): Promise<PostRevision> {
    const risk = assessContentRisk(`${input.title}\n${input.body}`);
    return manager.getRepository(PostRevision).save(
      manager.getRepository(PostRevision).create({
        postId: post.id,
        version: post.version,
        type: input.type,
        channel: input.channel,
        title: input.title,
        body: input.body,
        bodyFormat: input.bodyFormat,
        tags: input.tags,
        searchDocument: searchDocument(input),
        contentHash: contentHash(input),
        publicationStatus,
        moderationStatus: post.moderationStatus,
        reviewDecision: publicationStatus === 'published' ? 'approved' : null,
        reviewReason: null,
        riskLevel: risk,
        effectiveAt: publicationStatus === 'published' ? new Date() : null,
      }),
    );
  }

  private async createCommentRevision(
    manager: EntityManager,
    comment: CommunityComment,
    body: string,
    publicationStatus: 'draft' | 'pending_review' | 'published',
    riskLevel: ContentRiskLevel,
  ): Promise<CommentRevision> {
    return manager.getRepository(CommentRevision).save(
      manager.getRepository(CommentRevision).create({
        commentId: comment.id,
        version: comment.version,
        body,
        contentHash: contentHash(body),
        publicationStatus,
        moderationStatus: comment.moderationStatus,
        reviewDecision: publicationStatus === 'published' ? 'approved' : null,
        reviewReason: null,
        riskLevel,
        effectiveAt: publicationStatus === 'published' ? new Date() : null,
      }),
    );
  }

  private async filteredPostPage(
    manager: EntityManager,
    viewer: User | null,
    blocked: ReadonlySet<string>,
    filters: {
      channel: CommunityPostChannel | null;
      type: CommunityPostType | null;
      tag: string | null;
      query: string | null;
      sort: PostSort;
    },
    rawCursor?: string,
  ) {
    if (this.usesSearchFallback() && filters.sort === 'popular') {
      return this.fallbackPopularPostPage(
        manager,
        viewer,
        blocked,
        filters,
        rawCursor,
      );
    }
    if (
      this.usesSearchFallback() &&
      (filters.tag !== null || filters.query !== null)
    ) {
      return this.fallbackScanPostPage(
        manager,
        viewer,
        blocked,
        filters,
        rawCursor,
      );
    }
    return this.databaseFilteredPostPage(
      manager,
      viewer,
      blocked,
      filters,
      rawCursor,
    );
  }

  private filteredPostQuery(
    manager: EntityManager,
    viewer: User | null,
    blocked: ReadonlySet<string>,
    filters: {
      channel: CommunityPostChannel | null;
      type: CommunityPostType | null;
      tag: string | null;
      query: string | null;
      sort: PostSort;
    },
    includeDatabaseTextFilters: boolean,
  ): SelectQueryBuilder<CommunityPost> {
    const query = this.publicPostQuery(manager, viewer, blocked).innerJoin(
      PostRevision,
      'revision',
      'revision.id = post.active_revision_id AND revision.post_id = post.id',
    );
    if (filters.channel) {
      query.andWhere('revision.channel = :contentChannel', {
        contentChannel: filters.channel,
      });
    }
    if (filters.type) {
      query.andWhere('revision.type = :contentType', {
        contentType: filters.type,
      });
    }
    if (filters.sort === 'unresolved') {
      query
        .andWhere("revision.type = 'question'")
        .andWhere('post.accepted_comment_id IS NULL');
    }
    if (includeDatabaseTextFilters && filters.tag) {
      query.andWhere(
        `EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(revision.tags) AS content_tag(value)
          WHERE lower(content_tag.value) = lower(:contentTag)
        )`,
        { contentTag: filters.tag },
      );
    }
    if (includeDatabaseTextFilters && filters.query) {
      query.andWhere(
        `to_tsvector('simple', revision.search_document) @@ plainto_tsquery('simple', :contentQuery)`,
        { contentQuery: filters.query },
      );
    }
    return query;
  }

  private async databaseFilteredPostPage(
    manager: EntityManager,
    viewer: User | null,
    blocked: ReadonlySet<string>,
    filters: {
      channel: CommunityPostChannel | null;
      type: CommunityPostType | null;
      tag: string | null;
      query: string | null;
      sort: PostSort;
    },
    rawCursor?: string,
  ) {
    const base = this.filteredPostQuery(
      manager,
      viewer,
      blocked,
      filters,
      true,
    );
    const cursor = this.decodeOrderedPostCursor(rawCursor, filters.sort);
    const tagQuery = base.clone().select('revision.tags', 'tags');
    const totalPromise = base.clone().getCount();
    let orderedPostIds: string[];
    const scoreByPost = new Map<string, number>();
    if (filters.sort === 'popular') {
      const scoreExpression = this.popularityScoreExpression(blocked);
      base.select('post.id', 'cursor_post_id');
      base.addSelect(scoreExpression, 'popularity_score');
      if (cursor) {
        if (cursor.score === null) {
          throw new BadRequestException({ code: 'INVALID_CURSOR' });
        }
        base.andWhere(
          `(
            (${scoreExpression}) < :cursorScore OR
            ((${scoreExpression}) = :cursorScore AND post.updated_at < :cursorUpdatedAt) OR
            ((${scoreExpression}) = :cursorScore AND post.updated_at = :cursorUpdatedAt AND post.id < :cursorId)
          )`,
          {
            cursorScore: cursor.score,
            cursorUpdatedAt: cursor.updatedAt,
            cursorId: cursor.id,
          },
        );
      }
      const rows = await base
        .orderBy(scoreExpression, 'DESC')
        .addOrderBy('post.updatedAt', 'DESC')
        .addOrderBy('post.id', 'DESC')
        .take(POST_PAGE_SIZE + 1)
        .getRawMany<Record<string, unknown>>();
      orderedPostIds = [];
      for (const row of rows) {
        const postId = row.cursor_post_id;
        const score = Number(row.popularity_score);
        if (typeof postId !== 'string') continue;
        orderedPostIds.push(postId);
        if (Number.isSafeInteger(score) && score >= 0) scoreByPost.set(postId, score);
      }
    } else {
      if (cursor) {
        base.andWhere(
          '(post.updated_at < :cursorUpdatedAt OR (post.updated_at = :cursorUpdatedAt AND post.id < :cursorId))',
          {
            cursorUpdatedAt: cursor.updatedAt,
            cursorId: cursor.id,
          },
        );
      }
      const rows = await base
        .select('post.id', 'cursor_post_id')
        .orderBy('post.updatedAt', 'DESC')
        .addOrderBy('post.id', 'DESC')
        .take(POST_PAGE_SIZE + 1)
        .getRawMany<{ cursor_post_id: string }>();
      orderedPostIds = rows.map((row) => row.cursor_post_id);
    }
    const [total, tagRows] = await Promise.all([
      totalPromise,
      tagQuery.getRawMany<{ tags: unknown }>(),
    ]);
    const hasMore = orderedPostIds.length > POST_PAGE_SIZE;
    const pageIds = orderedPostIds.slice(0, POST_PAGE_SIZE);
    const loadedPosts =
      pageIds.length > 0
        ? await manager.getRepository(CommunityPost).find({
            where: { id: In(pageIds) },
          })
        : [];
    const postsById = new Map(loadedPosts.map((post) => [post.id, post]));
    const pagePosts = pageIds.flatMap((id) => {
      const post = postsById.get(id);
      return post ? [post] : [];
    });
    const hydrated = await this.hydratePostRows(manager, pagePosts, scoreByPost);
    await this.populatePostSummaries(manager, hydrated, viewer, blocked);
    if (filters.sort === 'popular') {
      for (const candidate of hydrated.candidates) {
        candidate.popularityScore ??=
          Number(candidate.summary.usefulCount ?? 0) * 3 +
          Number(candidate.summary.commentCount ?? 0) * 2;
      }
    }
    return {
      items: hydrated.candidates.map((candidate) => candidate.summary),
      nextCursor:
        hasMore && hydrated.candidates.length > 0
          ? this.postCursor(hydrated.candidates.at(-1)!, filters.sort)
          : null,
      total,
      availableTags: this.availableTags(tagRows),
      writeEnabled: contentWritesEnabled(),
    };
  }

  private async fallbackScanPostPage(
    manager: EntityManager,
    viewer: User | null,
    blocked: ReadonlySet<string>,
    filters: {
      channel: CommunityPostChannel | null;
      type: CommunityPostType | null;
      tag: string | null;
      query: string | null;
      sort: PostSort;
    },
    rawCursor?: string,
  ) {
    const base = this.filteredPostQuery(
      manager,
      viewer,
      blocked,
      filters,
      false,
    );
    const cursor = this.decodeOrderedPostCursor(rawCursor, filters.sort);
    if (cursor) {
      base.andWhere(
        '(post.updated_at < :cursorUpdatedAt OR (post.updated_at = :cursorUpdatedAt AND post.id < :cursorId))',
        { cursorUpdatedAt: cursor.updatedAt, cursorId: cursor.id },
      );
    }
    const scanned = await base
      .orderBy('post.updatedAt', 'DESC')
      .addOrderBy('post.id', 'DESC')
      .take(POST_SCAN_BATCH_SIZE + 1)
      .getMany();
    const hasMoreRaw = scanned.length > POST_SCAN_BATCH_SIZE;
    const scanWindow = scanned.slice(0, POST_SCAN_BATCH_SIZE);
    const hydrated = await this.hydratePostRows(manager, scanWindow);
    const matches = hydrated.candidates.filter((candidate) =>
      this.matchesFallbackPostFilters(candidate.revision, filters.tag, filters.query),
    );
    const pageCandidates = matches.slice(0, POST_PAGE_SIZE);
    await this.populatePostSummaries(
      manager,
      { ...hydrated, candidates: pageCandidates },
      viewer,
      blocked,
    );
    const moreMatchesInWindow = matches.length > POST_PAGE_SIZE;
    const resumePost = moreMatchesInWindow
      ? pageCandidates.at(-1)?.post
      : hasMoreRaw
        ? scanWindow.at(-1)
        : null;
    return {
      items: pageCandidates.map((candidate) => candidate.summary),
      nextCursor: resumePost
        ? this.postCursor({ post: resumePost }, filters.sort)
        : null,
      availableTags: Array.from(
        new Set(matches.flatMap((candidate) => candidate.revision.tags)),
      ).sort((left, right) => left.localeCompare(right, 'zh-CN')),
      total: undefined as number | undefined,
      writeEnabled: contentWritesEnabled(),
    };
  }

  private async fallbackPopularPostPage(
    manager: EntityManager,
    viewer: User | null,
    blocked: ReadonlySet<string>,
    filters: {
      channel: CommunityPostChannel | null;
      type: CommunityPostType | null;
      tag: string | null;
      query: string | null;
      sort: PostSort;
    },
    rawCursor?: string,
  ) {
    const posts = await this.filteredPostQuery(
      manager,
      viewer,
      blocked,
      filters,
      false,
    )
      .orderBy('post.updatedAt', 'DESC')
      .addOrderBy('post.id', 'DESC')
      .getMany();
    const hydrated = await this.hydratePostRows(manager, posts);
    hydrated.candidates = hydrated.candidates.filter((candidate) =>
      this.matchesFallbackPostFilters(candidate.revision, filters.tag, filters.query),
    );
    await this.populatePostSummaries(manager, hydrated, viewer, blocked);
    for (const candidate of hydrated.candidates) {
      candidate.popularityScore =
        Number(candidate.summary.usefulCount ?? 0) * 3 +
        Number(candidate.summary.commentCount ?? 0) * 2;
    }
    hydrated.candidates.sort((left, right) => {
      const score = (right.popularityScore ?? 0) - (left.popularityScore ?? 0);
      if (score !== 0) return score;
      const updated = right.post.updatedAt.getTime() - left.post.updatedAt.getTime();
      return updated || right.post.id.localeCompare(left.post.id);
    });
    const start = this.postCursorStart(
      hydrated.candidates,
      rawCursor,
      filters.sort,
    );
    const page = hydrated.candidates.slice(start, start + POST_PAGE_SIZE);
    return {
      items: page.map((candidate) => candidate.summary),
      nextCursor:
        start + POST_PAGE_SIZE < hydrated.candidates.length && page.length > 0
          ? this.postCursor(page.at(-1)!, filters.sort)
          : null,
      total: hydrated.candidates.length,
      availableTags: Array.from(
        new Set(hydrated.candidates.flatMap((candidate) => candidate.revision.tags)),
      ).sort((left, right) => left.localeCompare(right, 'zh-CN')),
      writeEnabled: contentWritesEnabled(),
    };
  }

  private async hydratePostRows(
    manager: EntityManager,
    posts: readonly CommunityPost[],
    scoreByPost: ReadonlyMap<string, number> = new Map(),
  ) {
    const authorIds = [...new Set(posts.map((post) => post.authorId))];
    const revisionIds = posts
      .map((post) => post.activeRevisionId)
      .filter((id): id is string => id !== null);
    const [revisions, authors, profiles] = await Promise.all([
      revisionIds.length > 0
        ? manager.getRepository(PostRevision).find({ where: { id: In(revisionIds) } })
        : Promise.resolve([]),
      authorIds.length > 0
        ? manager.getRepository(User).find({ where: { id: In(authorIds) } })
        : Promise.resolve([]),
      authorIds.length > 0
        ? manager.getRepository(PlayerProfile).find({
            where: { userId: In(authorIds) },
          })
        : Promise.resolve([]),
    ]);
    const revisionById = new Map(revisions.map((revision) => [revision.id, revision]));
    const candidates: PostListCandidate[] = posts.flatMap((post) => {
      const revision = post.activeRevisionId
        ? revisionById.get(post.activeRevisionId)
        : undefined;
      return revision?.postId === post.id
        ? [
            {
              post,
              revision,
              summary: {},
              popularityScore: scoreByPost.get(post.id),
            },
          ]
        : [];
    });
    return {
      candidates,
      authorById: new Map(authors.map((author) => [author.id, author])),
      profileByUser: new Map(profiles.map((profile) => [profile.userId, profile])),
    };
  }

  private async populatePostSummaries(
    manager: EntityManager,
    hydrated: {
      candidates: PostListCandidate[];
      authorById: ReadonlyMap<string, User>;
      profileByUser: ReadonlyMap<string, PlayerProfile>;
    },
    viewer: User | null,
    blocked: ReadonlySet<string>,
  ): Promise<void> {
    const summaries = await this.postListSummaries(
      manager,
      hydrated.candidates,
      viewer,
      hydrated.authorById,
      hydrated.profileByUser,
      blocked,
    );
    for (const candidate of hydrated.candidates) {
      candidate.summary = summaries.get(candidate.post.id) ?? {};
    }
  }

  private matchesFallbackPostFilters(
    revision: PostRevision,
    tag: string | null,
    query: string | null,
  ): boolean {
    if (
      tag &&
      !revision.tags.some(
        (item) => item.toLocaleLowerCase('zh-CN') === tag.toLocaleLowerCase('zh-CN'),
      )
    ) {
      return false;
    }
    if (!query) return true;
    const terms = query
      .toLocaleLowerCase('zh-CN')
      .split(/\s+/)
      .filter(Boolean);
    const document = revision.searchDocument.toLocaleLowerCase('zh-CN');
    return terms.every((term) => document.includes(term));
  }

  private popularityScoreExpression(blocked: ReadonlySet<string>): string {
    const blockedClause =
      blocked.size > 0
        ? ' AND popular_comment.author_id NOT IN (:...blocked)'
        : '';
    return `(
      (SELECT COUNT(*) FROM community_post_useful_reactions popular_useful
       WHERE popular_useful.post_id = post.id) * 3 +
      (SELECT COUNT(*) FROM community_comments popular_comment
       INNER JOIN users popular_author
         ON popular_author.id = popular_comment.author_id
        AND popular_author.account_status = 'active'
       WHERE popular_comment.post_id = post.id
         AND popular_comment.publication_status = 'published'
         AND popular_comment.moderation_status = 'normal'
         AND popular_comment.deleted_at IS NULL${blockedClause}) * 2
    )`;
  }

  private availableTags(rows: readonly { tags: unknown }[]): string[] {
    return Array.from(
      new Set(rows.flatMap((row) => this.tagArray(row.tags))),
    ).sort((left, right) => left.localeCompare(right, 'zh-CN'));
  }

  private async latestPostPage(
    manager: EntityManager,
    viewer: User | null,
    blocked: ReadonlySet<string>,
    rawCursor?: string,
  ) {
    const base = this.publicPostQuery(manager, viewer, blocked);
    const total = await base.clone().getCount();
    const cursor = this.decodeLatestPostCursor(rawCursor);
    if (cursor) {
      base.andWhere(
        '(post.updated_at < :cursorUpdatedAt OR (post.updated_at = :cursorUpdatedAt AND post.id < :cursorId))',
        { cursorUpdatedAt: cursor.updatedAt, cursorId: cursor.id },
      );
    }
    const tagQuery = this.publicPostQuery(manager, viewer, blocked)
      .innerJoin(
        PostRevision,
        'tag_revision',
        'tag_revision.id = post.active_revision_id',
      )
      .select('tag_revision.tags', 'tags');
    const [rows, tagRows] = await Promise.all([
      base
        .orderBy('post.updatedAt', 'DESC')
        .addOrderBy('post.id', 'DESC')
        .take(POST_PAGE_SIZE + 1)
        .getMany(),
      tagQuery.getRawMany<{ tags: unknown }>(),
    ]);
    const hasMore = rows.length > POST_PAGE_SIZE;
    const page = rows.slice(0, POST_PAGE_SIZE);
    const revisionIds = page
      .map((post) => post.activeRevisionId)
      .filter((id): id is string => id !== null);
    const authorIds = [...new Set(page.map((post) => post.authorId))];
    const [revisions, authors, profiles] = await Promise.all([
      revisionIds.length > 0
        ? manager.getRepository(PostRevision).find({ where: { id: In(revisionIds) } })
        : Promise.resolve([]),
      authorIds.length > 0
        ? manager.getRepository(User).find({ where: { id: In(authorIds) } })
        : Promise.resolve([]),
      authorIds.length > 0
        ? manager.getRepository(PlayerProfile).find({
            where: { userId: In(authorIds) },
          })
        : Promise.resolve([]),
    ]);
    const revisionById = new Map(revisions.map((revision) => [revision.id, revision]));
    const candidates = page.flatMap((post) => {
      const revision = post.activeRevisionId
        ? revisionById.get(post.activeRevisionId)
        : undefined;
      return revision?.postId === post.id
        ? [{ post, revision, summary: {} as Record<string, any> }]
        : [];
    });
    const summaries = await this.postListSummaries(
      manager,
      candidates,
      viewer,
      new Map(authors.map((author) => [author.id, author])),
      new Map(profiles.map((profile) => [profile.userId, profile])),
      blocked,
    );
    for (const candidate of candidates) {
      candidate.summary = summaries.get(candidate.post.id) ?? {};
    }
    const availableTags = Array.from(
      new Set(tagRows.flatMap((row) => this.tagArray(row.tags))),
    ).sort((left, right) => left.localeCompare(right, 'zh-CN'));
    return {
      items: candidates.map((candidate) => candidate.summary),
      nextCursor:
        hasMore && candidates.length > 0
          ? this.postCursor(candidates.at(-1)!, 'latest')
          : null,
      total,
      availableTags,
      writeEnabled: contentWritesEnabled(),
    };
  }

  private publicPostQuery(
    manager: EntityManager,
    viewer: User | null,
    blocked: ReadonlySet<string>,
  ): SelectQueryBuilder<CommunityPost> {
    const query = manager
      .getRepository(CommunityPost)
      .createQueryBuilder('post')
      .where("post.publication_status = 'published'")
      .andWhere('post.deleted_at IS NULL')
      .andWhere('post.active_revision_id IS NOT NULL');
    if (!this.isModerator(viewer)) {
      query.andWhere(
        "post.author_id IN (SELECT id FROM users WHERE account_status = 'active')",
      );
      if (viewer) {
        query.andWhere(
          "(post.moderation_status = 'normal' OR post.author_id = :viewerId)",
          { viewerId: viewer.id },
        );
      } else {
        query.andWhere("post.moderation_status = 'normal'");
      }
    }
    if (blocked.size > 0) {
      query.andWhere('post.author_id NOT IN (:...blocked)', {
        blocked: [...blocked],
      });
    }
    return query;
  }

  private decodeLatestPostCursor(
    raw: string | undefined,
  ): { id: string; updatedAt: Date } | null {
    const cursor = this.decodeOrderedPostCursor(raw, 'latest');
    return cursor ? { id: cursor.id, updatedAt: cursor.updatedAt } : null;
  }

  private decodeOrderedPostCursor(
    raw: string | undefined,
    sort: PostSort,
  ): { id: string; updatedAt: Date; score: number | null } | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
        id?: unknown;
        sort?: unknown;
        updatedAt?: unknown;
        score?: unknown;
      };
      if (
        parsed.sort !== sort ||
        typeof parsed.id !== 'string' ||
        !UUID_PATTERN.test(parsed.id) ||
        typeof parsed.updatedAt !== 'string' ||
        (sort === 'popular' &&
          (typeof parsed.score !== 'number' ||
            !Number.isSafeInteger(parsed.score) ||
            parsed.score < 0))
      ) {
        throw new Error();
      }
      const updatedAt = new Date(parsed.updatedAt);
      if (
        Number.isNaN(updatedAt.getTime()) ||
        updatedAt.toISOString() !== parsed.updatedAt
      ) {
        throw new Error();
      }
      return {
        id: parsed.id,
        updatedAt,
        score: sort === 'popular' ? (parsed.score as number) : null,
      };
    } catch {
      throw new BadRequestException({ code: 'INVALID_CURSOR' });
    }
  }

  private tagArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((tag): tag is string => typeof tag === 'string');
    }
    if (typeof value === 'string') {
      try {
        return this.tagArray(JSON.parse(value));
      } catch {
        return [];
      }
    }
    return [];
  }

  private async postListSummaries(
    manager: EntityManager,
    candidates: readonly { post: CommunityPost; revision: PostRevision }[],
    viewer: User | null,
    authors: ReadonlyMap<string, User>,
    profiles: ReadonlyMap<string, PlayerProfile>,
    blocked: ReadonlySet<string>,
  ): Promise<Map<string, Record<string, any>>> {
    const postIds = candidates.map((candidate) => candidate.post.id);
    if (postIds.length === 0) return new Map();

    const commentQuery = manager
      .getRepository(CommunityComment)
      .createQueryBuilder('comment')
      .innerJoin(
        User,
        'comment_author',
        "comment_author.id = comment.author_id AND comment_author.account_status = 'active'",
      )
      .select('comment.post_id', 'postId')
      .addSelect('COUNT(*)', 'count')
      .where('comment.post_id IN (:...postIds)', { postIds })
      .andWhere("comment.publication_status = 'published'")
      .andWhere("comment.moderation_status = 'normal'")
      .andWhere('comment.deleted_at IS NULL')
      .groupBy('comment.post_id');
    if (blocked.size > 0) {
      commentQuery.andWhere('comment.author_id NOT IN (:...blocked)', {
        blocked: [...blocked],
      });
    }
    const usefulQuery = manager
      .getRepository(PostUsefulReaction)
      .createQueryBuilder('reaction')
      .select('reaction.post_id', 'postId')
      .addSelect('COUNT(*)', 'count')
      .where('reaction.post_id IN (:...postIds)', { postIds })
      .groupBy('reaction.post_id');

    const [commentCounts, usefulCounts, usefulByViewer, bookmarks, follows] =
      await Promise.all([
        commentQuery.getRawMany<{ postId: string; count: string }>(),
        usefulQuery.getRawMany<{ postId: string; count: string }>(),
        viewer
          ? manager.getRepository(PostUsefulReaction).find({
              where: { userId: viewer.id, postId: In(postIds) },
            })
          : Promise.resolve([]),
        viewer
          ? manager.getRepository(PostBookmark).find({
              where: { userId: viewer.id, postId: In(postIds) },
            })
          : Promise.resolve([]),
        viewer
          ? manager.getRepository(PostFollow).find({
              where: { userId: viewer.id, postId: In(postIds) },
            })
          : Promise.resolve([]),
      ]);
    const commentCountByPost = new Map(
      commentCounts.map((row) => [row.postId, Number(row.count)]),
    );
    const usefulCountByPost = new Map(
      usefulCounts.map((row) => [row.postId, Number(row.count)]),
    );
    const usefulSet = new Set(usefulByViewer.map((row) => row.postId));
    const bookmarkSet = new Set(bookmarks.map((row) => row.postId));
    const followSet = new Set(follows.map((row) => row.postId));

    return new Map(
      candidates.map(({ post, revision }) => [
        post.id,
        {
          id: post.id,
          type: revision.type,
          channel: revision.channel,
          title: revision.title,
          excerpt: this.excerpt(revision.body),
          tags: revision.tags,
          author: this.authorViewFromContext(
            authors.get(post.authorId),
            profiles.get(post.authorId),
          ),
          createdAt: post.createdAt.toISOString(),
          updatedAt: post.updatedAt.toISOString(),
          commentCount: commentCountByPost.get(post.id) ?? 0,
          usefulCount: usefulCountByPost.get(post.id) ?? 0,
          usefulByMe: usefulSet.has(post.id),
          bookmarked: bookmarkSet.has(post.id),
          followed: followSet.has(post.id),
          acceptedCommentId: post.acceptedCommentId,
          ...this.state(post),
        },
      ]),
    );
  }

  private async postView(
    manager: EntityManager,
    post: CommunityPost,
    revision: PostRevision,
    viewer: User | null,
    detail: boolean,
  ): Promise<Record<string, any>> {
    const author = await this.authorView(manager, post.authorId);
    const commentCount = await this.visibleCommentCount(manager, post.id, viewer);
    const [usefulCount, usefulByMe, bookmarked, followed] = await Promise.all([
      manager.getRepository(PostUsefulReaction).count({ where: { postId: post.id } }),
      viewer
        ? manager.getRepository(PostUsefulReaction).exist({
            where: { postId: post.id, userId: viewer.id },
          })
        : false,
      viewer
        ? manager.getRepository(PostBookmark).exist({
            where: { postId: post.id, userId: viewer.id },
          })
        : false,
      viewer
        ? manager.getRepository(PostFollow).exist({
            where: { postId: post.id, userId: viewer.id },
          })
        : false,
    ]);
    const self = viewer?.id === post.authorId;
    const moderator = this.isModerator(viewer);
    const pending = post.pendingRevisionId
      ? await manager.getRepository(PostRevision).findOne({
          where: { id: post.pendingRevisionId, postId: post.id },
        })
      : null;
    const state = this.state(post);
    const summary: Record<string, any> = {
      id: post.id,
      type: revision.type,
      channel: revision.channel,
      title: revision.title,
      excerpt: this.excerpt(revision.body),
      tags: revision.tags,
      author,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
      commentCount,
      usefulCount,
      usefulByMe,
      bookmarked,
      followed,
      acceptedCommentId: post.acceptedCommentId,
      ...state,
    };
    if (!detail) return summary;
    const writeEnabled = contentWritesEnabled();
    return {
      ...summary,
      writeEnabled,
      body: revision.body,
      bodyFormat: revision.bodyFormat,
      restoreUntil: post.deletedAt
        ? new Date(post.deletedAt.getTime() + RESTORE_WINDOW_MS).toISOString()
        : null,
      permissions: {
        canComment: Boolean(
          writeEnabled &&
          viewer &&
            post.publicationStatus === 'published' &&
            post.moderationStatus === 'normal' &&
            !post.deletedAt,
        ),
        canEdit: Boolean(writeEnabled && self && !post.deletedAt),
        canDelete: Boolean(writeEnabled && self && !post.deletedAt),
        canRestore: Boolean(
          writeEnabled &&
          self &&
            post.deletedAt &&
            Date.now() - post.deletedAt.getTime() <= RESTORE_WINDOW_MS,
        ),
        canSubmitReview: Boolean(
          writeEnabled && self && !post.deletedAt && pending?.publicationStatus === 'draft',
        ),
        canWithdrawReview: Boolean(
          writeEnabled && self && !post.deletedAt && pending?.publicationStatus === 'pending_review',
        ),
        canAcceptAnswer: Boolean(
          writeEnabled &&
          self &&
            !post.deletedAt &&
            revision.type === 'question' &&
            post.publicationStatus === 'published',
        ),
        canReport: Boolean(
          writeEnabled &&
          viewer &&
            !self &&
            !moderator &&
            !post.deletedAt &&
            post.publicationStatus === 'published' &&
            post.moderationStatus === 'normal',
        ),
      },
    };
  }

  private async commentView(
    manager: EntityManager,
    comment: CommunityComment,
    revision: CommentRevision,
    viewer: User | null,
  ) {
    const writeEnabled = contentWritesEnabled();
    const self = viewer?.id === comment.authorId;
    const moderator = this.isModerator(viewer);
    const pending = comment.pendingRevisionId
      ? await manager.getRepository(CommentRevision).findOne({
          where: { id: comment.pendingRevisionId, commentId: comment.id },
        })
      : null;
    return {
      id: comment.id,
      postId: comment.postId,
      parentCommentId: comment.parentCommentId,
      depth: comment.depth,
      body: revision.body,
      author: await this.authorView(manager, comment.authorId),
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      usefulCount: 0,
      ...this.state(comment),
      permissions: {
        canReply: Boolean(
          writeEnabled &&
          viewer &&
            comment.depth === 0 &&
            !comment.deletedAt &&
            comment.publicationStatus === 'published' &&
            comment.moderationStatus === 'normal',
        ),
        canEdit: Boolean(writeEnabled && self && !comment.deletedAt),
        canDelete: Boolean(writeEnabled && self && !comment.deletedAt),
        canRestore: Boolean(
          writeEnabled &&
          self &&
            comment.deletedAt &&
            Date.now() - comment.deletedAt.getTime() <= RESTORE_WINDOW_MS,
        ),
        canSubmitReview: Boolean(
          writeEnabled && self && !comment.deletedAt && pending?.publicationStatus === 'draft',
        ),
        canWithdrawReview: Boolean(
          writeEnabled && self && !comment.deletedAt && pending?.publicationStatus === 'pending_review',
        ),
        canReport: Boolean(
          writeEnabled &&
          viewer &&
            !self &&
            !moderator &&
            !comment.deletedAt &&
            comment.publicationStatus === 'published' &&
            comment.moderationStatus === 'normal',
        ),
      },
    };
  }

  private commentViewFromContext(
    comment: CommunityComment,
    revision: CommentRevision,
    viewer: User | null,
    authors: ReadonlyMap<string, User>,
    profiles: ReadonlyMap<string, PlayerProfile>,
    revisions: ReadonlyMap<string, CommentRevision>,
  ) {
    const writeEnabled = contentWritesEnabled();
    const self = viewer?.id === comment.authorId;
    const moderator = this.isModerator(viewer);
    const pending = comment.pendingRevisionId
      ? revisions.get(comment.pendingRevisionId) ?? null
      : null;
    return {
      id: comment.id,
      postId: comment.postId,
      parentCommentId: comment.parentCommentId,
      depth: comment.depth,
      body: revision.body,
      author: this.authorViewFromContext(
        authors.get(comment.authorId),
        profiles.get(comment.authorId),
      ),
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      usefulCount: 0,
      ...this.state(comment),
      permissions: {
        canReply: Boolean(
          writeEnabled &&
            viewer &&
            comment.depth === 0 &&
            !comment.deletedAt &&
            comment.publicationStatus === 'published' &&
            comment.moderationStatus === 'normal',
        ),
        canEdit: Boolean(writeEnabled && self && !comment.deletedAt),
        canDelete: Boolean(writeEnabled && self && !comment.deletedAt),
        canRestore: Boolean(
          writeEnabled &&
            self &&
            comment.deletedAt &&
            Date.now() - comment.deletedAt.getTime() <= RESTORE_WINDOW_MS,
        ),
        canSubmitReview: Boolean(
          writeEnabled &&
            self &&
            !comment.deletedAt &&
            pending?.publicationStatus === 'draft',
        ),
        canWithdrawReview: Boolean(
          writeEnabled &&
            self &&
            !comment.deletedAt &&
            pending?.publicationStatus === 'pending_review',
        ),
        canReport: Boolean(
          writeEnabled &&
            viewer &&
            !self &&
            !moderator &&
            !comment.deletedAt &&
            comment.publicationStatus === 'published' &&
            comment.moderationStatus === 'normal',
        ),
      },
    };
  }

  private visibleCommentRevisionFromContext(
    comment: CommunityComment,
    viewer: User | null,
    authors: ReadonlyMap<string, User>,
    revisions: ReadonlyMap<string, CommentRevision>,
    blocked: ReadonlySet<string>,
  ): CommentRevision | null {
    const moderator = this.isModerator(viewer);
    const privileged = moderator || viewer?.id === comment.authorId;
    if (!moderator && authors.get(comment.authorId)?.accountStatus !== 'active') {
      return null;
    }
    if (blocked.has(comment.authorId)) return null;
    if (
      !privileged &&
      (comment.deletedAt ||
        comment.publicationStatus !== 'published' ||
        comment.moderationStatus !== 'normal')
    ) {
      return null;
    }
    const revisionId = privileged
      ? comment.pendingRevisionId ?? comment.activeRevisionId
      : comment.activeRevisionId;
    const revision = revisionId ? revisions.get(revisionId) : undefined;
    if (!revision || revision.commentId !== comment.id) return null;
    if (
      !privileged &&
      (revision.publicationStatus !== 'published' ||
        revision.moderationStatus !== 'normal')
    ) {
      return null;
    }
    return revision;
  }

  private async selectPostRevision(
    manager: EntityManager,
    post: CommunityPost,
    viewer: User | null,
  ): Promise<PostRevision> {
    const privileged = viewer?.id === post.authorId || this.isModerator(viewer);
    if (!this.isModerator(viewer) && !(await this.publicAuthorAvailable(manager, post.authorId))) {
      throw this.contentNotFound();
    }
    if (viewer && (await this.policy.isBlocked(manager, viewer.id, post.authorId))) {
      throw this.contentNotFound();
    }
    if (
      (!privileged && post.deletedAt) ||
      (!privileged && post.publicationStatus !== 'published') ||
      (!privileged && post.moderationStatus !== 'normal')
    ) {
      throw this.contentNotFound();
    }
    const revisionId = privileged
      ? post.pendingRevisionId ?? post.activeRevisionId
      : post.activeRevisionId;
    if (!revisionId) throw this.contentNotFound();
    const revision = await manager.getRepository(PostRevision).findOne({
      where: { id: revisionId, postId: post.id },
    });
    if (!revision) throw this.contentNotFound();
    if (
      !privileged &&
      (revision.publicationStatus !== 'published' || revision.moderationStatus !== 'normal')
    ) {
      throw this.contentNotFound();
    }
    return revision;
  }

  private async selectCommentRevision(
    manager: EntityManager,
    comment: CommunityComment,
    viewer: User | null,
    strict: boolean,
  ): Promise<CommentRevision | null> {
    const privileged = viewer?.id === comment.authorId || this.isModerator(viewer);
    if (
      !this.isModerator(viewer) &&
      !(await this.publicAuthorAvailable(manager, comment.authorId))
    ) {
      if (strict) throw this.contentNotFound();
      return null;
    }
    if (viewer && (await this.policy.isBlocked(manager, viewer.id, comment.authorId))) {
      if (strict) throw this.contentNotFound();
      return null;
    }
    if (
      (!privileged && comment.deletedAt) ||
      (!privileged && comment.publicationStatus !== 'published') ||
      (!privileged && comment.moderationStatus !== 'normal')
    ) {
      if (strict) throw this.contentNotFound();
      return null;
    }
    const revisionId = privileged
      ? comment.pendingRevisionId ?? comment.activeRevisionId
      : comment.activeRevisionId;
    if (!revisionId) {
      if (strict) throw this.contentNotFound();
      return null;
    }
    const revision = await manager.getRepository(CommentRevision).findOne({
      where: { id: revisionId, commentId: comment.id },
    });
    if (
      !revision ||
      (!privileged &&
        (revision.publicationStatus !== 'published' ||
          revision.moderationStatus !== 'normal'))
    ) {
      if (strict) throw this.contentNotFound();
      return null;
    }
    return revision;
  }

  private async visiblePublishedPost(post: CommunityPost, viewer: User | null): Promise<boolean> {
    if (post.deletedAt || post.publicationStatus !== 'published') return false;
    if (
      !this.isModerator(viewer) &&
      !(await this.publicAuthorAvailable(this.dataSource.manager, post.authorId))
    ) {
      return false;
    }
    if (viewer && (await this.policy.isBlocked(this.dataSource.manager, viewer.id, post.authorId))) {
      return false;
    }
    return (
      post.moderationStatus === 'normal' ||
      viewer?.id === post.authorId ||
      this.isModerator(viewer)
    );
  }

  private async setPostFlag(
    entity: typeof PostBookmark | typeof PostFollow | typeof PostUsefulReaction,
    userId: string,
    postId: string,
    value: boolean,
  ): Promise<void> {
    assertContentWritesEnabled();
    await this.dataSource.transaction(async (manager) => {
      const user = await this.requireActiveUser(manager, userId, true);
      const post = await this.lockPost(manager, postId);
      await this.selectPostRevision(manager, post, user);
      if (value) {
        // Desired-state PUT remains successful under duplicate/concurrent calls.
        await manager
          .createQueryBuilder()
          .insert()
          .into(entity)
          .values({ userId, postId })
          .orIgnore()
          .execute();
      } else {
        await manager.getRepository(entity).delete({ userId, postId } as any);
      }
    });
  }

  private async filterBySearch<T extends { revision: PostRevision }>(
    candidates: T[],
    query: string,
  ): Promise<T[]> {
    if (candidates.length === 0) return [];
    if (this.usesSearchFallback()) {
      const terms = query
        .toLocaleLowerCase('zh-CN')
        .split(/\s+/)
        .filter(Boolean);
      return candidates.filter((candidate) => {
        const document = candidate.revision.searchDocument.toLocaleLowerCase('zh-CN');
        return terms.every((term) => document.includes(term));
      });
    }
    const ids = candidates.map((candidate) => candidate.revision.id);
    const matched = await this.dataSource
      .getRepository(PostRevision)
      .createQueryBuilder('revision')
      .select('revision.id', 'id')
      .where('revision.id IN (:...ids)', { ids })
      .andWhere(
        `to_tsvector('simple', revision.search_document) @@ plainto_tsquery('simple', :query)`,
        { query },
      )
      .getRawMany<{ id: string }>();
    const allowed = new Set(matched.map((row) => row.id));
    return candidates.filter((candidate) => allowed.has(candidate.revision.id));
  }

  private async reportEvidence(
    manager: EntityManager,
    reporter: User,
    targetType: 'post' | 'comment',
    targetId: string,
  ): Promise<{
    authorId: string;
    revisionId: string;
    title: string | null;
    body: string;
    state: Record<string, unknown>;
  }> {
    if (targetType === 'post') {
      const post = await manager.getRepository(CommunityPost).findOne({
        where: { id: targetId },
      });
      if (!post) throw this.contentNotFound();
      const revision = await this.selectPostRevision(manager, post, reporter);
      return {
        authorId: post.authorId,
        revisionId: revision.id,
        title: revision.title,
        body: revision.body,
        state: this.state(post),
      };
    }
    const comment = await manager.getRepository(CommunityComment).findOne({
      where: { id: targetId },
    });
    if (!comment) throw this.contentNotFound();
    const revision = await this.selectCommentRevision(manager, comment, reporter, true);
    if (!revision) throw this.contentNotFound();
    return {
      authorId: comment.authorId,
      revisionId: revision.id,
      title: null,
      body: revision.body,
      state: this.state(comment),
    };
  }

  private async commentPublishedSideEffects(
    manager: EntityManager,
    comment: CommunityComment,
  ): Promise<void> {
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
      if (await this.policy.isBlocked(manager, recipientId, comment.authorId)) continue;
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

  private async authorView(manager: EntityManager, userId: string) {
    const user = await manager.getRepository(User).findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException({ code: 'CONTENT_AUTHOR_NOT_FOUND' });
    const profile = await manager.getRepository(PlayerProfile).findOne({
      where: { userId },
    });
    return this.authorViewFromContext(user, profile);
  }

  private authorViewFromContext(
    user: User | undefined,
    profile: PlayerProfile | null | undefined,
  ) {
    if (!user) throw new NotFoundException({ code: 'CONTENT_AUTHOR_NOT_FOUND' });
    if (user.accountStatus === 'deleted') {
      return {
        publicId: '00000000-0000-4000-8000-000000000000',
        displayName: '已注销用户',
        avatarKey: 'violet',
        battleProfession: null,
        ipRegion: null,
      };
    }
    return {
      publicId: user.publicId,
      displayName: user.displayName ?? '办公室同事',
      avatarKey: profile?.avatarKey ?? 'violet',
      battleProfession: profile?.battleProfession ?? null,
      ipRegion: null,
    };
  }

  private async blockedUserIds(
    manager: EntityManager,
    userId: string,
  ): Promise<Set<string>> {
    const rows = await manager.getRepository(UserBlock).find({
      where: [{ blockerId: userId }, { blockedId: userId }],
    });
    return new Set(
      rows.map((row) =>
        row.blockerId === userId ? row.blockedId : row.blockerId,
      ),
    );
  }

  private async visibleCommentCount(
    manager: EntityManager,
    postId: string,
    viewer: User | null,
  ): Promise<number> {
    const blocked = viewer
      ? await this.blockedUserIds(manager, viewer.id)
      : new Set<string>();
    const query = manager
      .getRepository(CommunityComment)
      .createQueryBuilder('comment')
      .innerJoin(
        User,
        'comment_author',
        "comment_author.id = comment.author_id AND comment_author.account_status = 'active'",
      )
      .where('comment.post_id = :postId', { postId })
      .andWhere("comment.publication_status = 'published'")
      .andWhere("comment.moderation_status = 'normal'")
      .andWhere('comment.deleted_at IS NULL');
    if (blocked.size > 0) {
      query.andWhere('comment.author_id NOT IN (:...blocked)', {
        blocked: [...blocked],
      });
    }
    return query.getCount();
  }

  private publicAuthorAvailable(
    manager: EntityManager,
    userId: string,
  ): Promise<boolean> {
    return manager.getRepository(User).exist({
      where: { id: userId, accountStatus: 'active' },
    });
  }

  private state(content: CommunityPost | CommunityComment) {
    return {
      publicationStatus: content.publicationStatus,
      moderationStatus: content.moderationStatus,
      deletedAt: content.deletedAt?.toISOString() ?? null,
      version: content.version,
      lastReviewDecision: content.lastReviewDecision,
      lastReviewReason: content.lastReviewReason,
      moderationReason: content.moderationReason,
    };
  }

  private postRevisionView(revision: PostRevision) {
    return {
      id: revision.id,
      version: revision.version,
      title: revision.title,
      body: revision.body,
      publicationStatus: revision.publicationStatus,
      moderationStatus: revision.moderationStatus,
      createdAt: revision.createdAt.toISOString(),
      effectiveAt: revision.effectiveAt?.toISOString() ?? null,
      reviewReason: revision.reviewReason,
    };
  }

  private commentRevisionView(revision: CommentRevision) {
    return {
      id: revision.id,
      version: revision.version,
      body: revision.body,
      publicationStatus: revision.publicationStatus,
      moderationStatus: revision.moderationStatus,
      createdAt: revision.createdAt.toISOString(),
      effectiveAt: revision.effectiveAt?.toISOString() ?? null,
      reviewReason: revision.reviewReason,
    };
  }

  private async lockPost(manager: EntityManager, postId: string): Promise<CommunityPost> {
    const post = await manager.getRepository(CommunityPost).findOne({
      where: { id: postId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!post) throw this.contentNotFound();
    return post;
  }

  private async lockComment(
    manager: EntityManager,
    commentId: string,
  ): Promise<CommunityComment> {
    const comment = await manager.getRepository(CommunityComment).findOne({
      where: { id: commentId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!comment) throw this.contentNotFound();
    return comment;
  }

  private requireAuthor(post: CommunityPost, userId: string): void {
    if (post.authorId !== userId) {
      throw new ForbiddenException({ code: 'CONTENT_AUTHOR_REQUIRED' });
    }
  }

  private requireCommentAuthor(comment: CommunityComment, userId: string): void {
    if (comment.authorId !== userId) {
      throw new ForbiddenException({ code: 'CONTENT_AUTHOR_REQUIRED' });
    }
  }

  private assertVersion(current: number, expected: number): void {
    if (current !== expected) {
      // 只返回版本号，绝不附带待审标题或正文。
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        currentVersion: current,
      });
    }
  }

  private async requirePublisher(
    manager: EntityManager,
    userId: string,
    lock = false,
  ): Promise<User> {
    const user = await this.requireActiveUser(manager, userId, lock);
    if (user.socialVerificationStatus !== 'verified') {
      throw new ForbiddenException({ code: 'SOCIAL_VERIFICATION_REQUIRED' });
    }
    return user;
  }

  private async requireActiveUser(
    manager: EntityManager,
    userId: string,
    lock = false,
  ): Promise<User> {
    const user = await manager.getRepository(User).findOne({
      where: { id: userId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!user || user.accountStatus !== 'active') {
      throw new ForbiddenException({ code: 'ACCOUNT_UNAVAILABLE' });
    }
    return user;
  }

  private async optionalActiveUser(
    manager: EntityManager,
    userId: string | null,
  ): Promise<User | null> {
    if (!userId) return null;
    return this.requireActiveUser(manager, userId);
  }

  private isModerator(user: User | null): boolean {
    return user?.communityRole === 'moderator' || user?.communityRole === 'admin';
  }

  private optionalChannel(value?: string): CommunityPostChannel | null {
    if (!value) return null;
    const allowed: CommunityPostChannel[] = [
      'general',
      'developer',
      'product-manager',
      'qa',
      'sales',
      'human-resources',
      'questions',
      'retrospectives',
      'tools',
    ];
    if (!allowed.includes(value as CommunityPostChannel)) {
      throw new BadRequestException({ code: 'INVALID_CONTENT_FILTER' });
    }
    return value as CommunityPostChannel;
  }

  private optionalType(value?: string): CommunityPostType | null {
    if (!value) return null;
    if (!['experience', 'question', 'retrospective'].includes(value)) {
      throw new BadRequestException({ code: 'INVALID_CONTENT_FILTER' });
    }
    return value as CommunityPostType;
  }

  private optionalTag(value?: string): string | null {
    if (!value) return null;
    const tag = value.trim().normalize('NFC');
    if ([...tag].length < 1 || [...tag].length > 20) {
      throw new BadRequestException({ code: 'INVALID_CONTENT_FILTER' });
    }
    return tag;
  }

  private postSort(value?: string): PostSort {
    if (!value) return 'latest';
    if (value !== 'latest' && value !== 'popular' && value !== 'unresolved') {
      throw new BadRequestException({ code: 'INVALID_CONTENT_SORT' });
    }
    return value;
  }

  private postCursorStart<T extends { post: CommunityPost }>(
    rows: T[],
    cursor: string | undefined,
    sort: PostSort,
  ): number {
    if (!cursor) return 0;
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
        id?: unknown;
        sort?: unknown;
      };
      if (parsed.sort !== sort) throw new Error('sort mismatch');
      const index = rows.findIndex((entry) => entry.post.id === parsed.id);
      if (index < 0) throw new Error('missing cursor');
      return index + 1;
    } catch {
      throw new BadRequestException({ code: 'INVALID_CURSOR' });
    }
  }

  private postCursor(
    entry: { post: CommunityPost; popularityScore?: number },
    sort: PostSort,
  ): string {
    if (
      sort === 'popular' &&
      (!Number.isSafeInteger(entry.popularityScore) ||
        (entry.popularityScore as number) < 0)
    ) {
      throw new Error('Popular cursor requires a non-negative integer score');
    }
    return Buffer.from(
      JSON.stringify({
        id: entry.post.id,
        sort,
        updatedAt: entry.post.updatedAt.toISOString(),
        ...(sort === 'popular' ? { score: entry.popularityScore } : {}),
      }),
    ).toString('base64url');
  }

  private decodeCommentCursor(
    cursor?: string,
  ): { id: string; createdAt: Date } | null {
    if (!cursor) return null;
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
        id?: unknown;
        createdAt?: unknown;
      };
      if (
        typeof parsed.id !== 'string' ||
        !UUID_PATTERN.test(parsed.id) ||
        typeof parsed.createdAt !== 'string'
      ) {
        throw new Error();
      }
      const createdAt = new Date(parsed.createdAt);
      if (
        Number.isNaN(createdAt.getTime()) ||
        createdAt.toISOString() !== parsed.createdAt
      ) {
        throw new Error();
      }
      return { id: parsed.id, createdAt };
    } catch {
      throw new BadRequestException({ code: 'INVALID_CURSOR' });
    }
  }

  private commentCursor(comment: CommunityComment): string {
    return Buffer.from(
      JSON.stringify({ id: comment.id, createdAt: comment.createdAt.toISOString() }),
    ).toString('base64url');
  }

  private usesSearchFallback(): boolean {
    const extra = this.dataSource.options.extra as Record<string, unknown> | undefined;
    return extra?.contentSearchFallback === true;
  }

  private reportRisk(reason: ContentReport['reason']): ContentRiskLevel {
    return reason === 'illegal'
      ? 'critical'
      : reason === 'privacy' || reason === 'harassment'
        ? 'high'
        : reason === 'spam'
          ? 'medium'
          : 'low';
  }

  private excerpt(body: string): string {
    return body
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[#*_`>\[\]()~-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);
  }

  private async audit(
    manager: EntityManager,
    actor: User,
    action: string,
    targetType: string,
    targetId: string,
    reason: string | null,
    requestId: string | null,
    previousState: Record<string, unknown>,
    nextState: Record<string, unknown>,
  ): Promise<void> {
    await manager.getRepository(AdminAuditLog).save(
      manager.getRepository(AdminAuditLog).create({
        actorId: actor.id,
        actorRole: actor.communityRole,
        action,
        targetType,
        targetId,
        reason,
        requestId,
        previousState,
        nextState,
      }),
    );
  }

  private async replay(
    manager: EntityManager,
    userId: string,
    commandType: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<Record<string, unknown> | null> {
    const receipt = await manager.getRepository(CommunityCommandReceipt).findOne({
      where: { userId, commandType, idempotencyKey },
      lock: { mode: 'pessimistic_write' },
    });
    if (!receipt) return null;
    if (receipt.requestHash !== requestHash) {
      throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' });
    }
    return receipt.result;
  }

  private async record<T extends Record<string, any>>(
    manager: EntityManager,
    userId: string,
    commandType: string,
    idempotencyKey: string,
    requestHash: string,
    result: T,
  ): Promise<T> {
    await manager.getRepository(CommunityCommandReceipt).save(
      manager.getRepository(CommunityCommandReceipt).create({
        userId,
        commandType,
        idempotencyKey,
        requestHash,
        result,
      }),
    );
    return result;
  }

  private contentNotFound(): NotFoundException {
    return new NotFoundException({ code: 'CONTENT_NOT_FOUND' });
  }
}
