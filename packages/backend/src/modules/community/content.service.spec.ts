import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import { CommentRevision } from '../../database/entities/comment-revision.entity';
import { CommunityComment } from '../../database/entities/community-comment.entity';
import { CommunityNotification } from '../../database/entities/community-notification.entity';
import { CommunityPost } from '../../database/entities/community-post.entity';
import { ModerationCase } from '../../database/entities/moderation-case.entity';
import { OutboxEvent } from '../../database/entities/outbox-event.entity';
import { PlayerProfile } from '../../database/entities/player-profile.entity';
import { PostRevision } from '../../database/entities/post-revision.entity';
import { UserBlock } from '../../database/entities/user-block.entity';
import { User } from '../../database/entities/user.entity';
import { createLocalDevDataSource } from '../../database/local-dev-datasource';
import { ContentService } from './content.service';
import { ModerationService } from './moderation.service';
import { NotificationService } from './notification.service';
import { RelationshipPolicyService } from './relationship-policy.service';

describe('ContentService review and visibility invariants', () => {
  let dataSource: DataSource;
  let content: ContentService;
  let moderation: ModerationService;
  let moderator: User;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.LOCAL_DEV = 'true';
    delete process.env.FEATURE_COMMUNITY_CONTENT_ENABLED;
    delete process.env.FEATURE_CONTENT_WRITES_ENABLED;
    delete process.env.FEATURE_MODERATION_OPERATIONS_ENABLED;
    delete process.env.CONTENT_MODERATION_STAFFED;
    delete process.env.CONTENT_LOW_RISK_AUTO_PUBLISH_ENABLED;
  });

  beforeEach(async () => {
    dataSource = await createLocalDevDataSource();
    const policy = new RelationshipPolicyService();
    const notifications = new NotificationService(dataSource);
    moderation = new ModerationService(
      dataSource,
      notifications,
      policy,
    );
    content = new ContentService(
      dataSource,
      policy,
      notifications,
      moderation,
    );
    moderator = await activeUser('moderator@example.com', 'Moderator', 'moderator');
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await dataSource.destroy();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('keeps pending and superseded revisions private and returns only currentVersion on conflicts', async () => {
    const author = await activeUser('author@example.com', 'Author');
    const reader = await activeUser('reader@example.com', 'Reader');
    const draft = await content.createPost(author.id, postInput('Original public body with enough detail.'), 'post-create-1');
    expect(draft).toMatchObject({ publicationStatus: 'draft', version: 1 });

    const submitted = await content.submitPostReview(author.id, draft.id, draft.version);
    expect(submitted).toMatchObject({ publicationStatus: 'pending_review', version: 2 });
    await expect(content.getPost(draft.id, reader.id)).rejects.toMatchObject({
      response: { code: 'CONTENT_NOT_FOUND' },
    });
    expect((await content.listPosts(reader.id, {})).items).toHaveLength(0);

    await approve('post', draft.id);
    const published = await content.getPost(draft.id, reader.id);
    expect(published.body).toBe('Original public body with enough detail.');
    expect(await dataSource.getRepository(OutboxEvent).count()).toBe(0);

    const currentForAuthor = await content.getPost(draft.id, author.id);
    const secretBody = 'Pending secret revision that readers must never receive.';
    const edited = await content.updatePost(
      author.id,
      draft.id,
      postInput(secretBody),
      currentForAuthor.version,
      'post-edit-1',
    );
    await content.submitPostReview(author.id, draft.id, edited.version);

    const stillPublic = await content.getPost(draft.id, reader.id);
    expect(stillPublic.body).toBe('Original public body with enough detail.');
    await expect(
      content.updatePost(
        author.id,
        draft.id,
        postInput('Another valid but stale revision body.'),
        edited.version,
        'post-edit-stale',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'VERSION_CONFLICT',
        currentVersion: edited.version + 1,
      },
    });
    try {
      await content.updatePost(
        author.id,
        draft.id,
        postInput('Another valid but stale revision body.'),
        edited.version,
        'post-edit-stale-2',
      );
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(secretBody);
    }
  });

  it('publishes approved comments, caps nesting at two levels, and filters blocked threads and notifications', async () => {
    const author = await activeUser('questioner@example.com', 'Questioner');
    const commenter = await activeUser('commenter@example.com', 'Commenter');
    const replier = await activeUser('replier@example.com', 'Replier');
    const post = await publishPost(author, 'Question body with enough context to review.');

    const root = await content.createComment(
      commenter.id,
      post.id,
      'A useful root answer.',
      null,
      'comment-root',
    );
    expect(root.publicationStatus).toBe('pending_review');
    const rootId = root.id as string;
    await approve('comment', rootId);

    const reply = await content.createComment(
      replier.id,
      post.id,
      'A second-level reply.',
      rootId,
      'comment-reply',
    );
    const replyId = reply.id as string;
    await approve('comment', replyId);
    await expect(
      content.createComment(
        author.id,
        post.id,
        'A forbidden third level.',
        replyId,
        'comment-too-deep',
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_COMMENT_PARENT' } });

    expect(
      await dataSource.getRepository(CommunityNotification).exist({
        where: { userId: author.id, eventType: 'community.post.replied' },
      }),
    ).toBe(true);
    await dataSource.getRepository(UserBlock).save(
      dataSource.getRepository(UserBlock).create({
        blockerId: author.id,
        blockedId: commenter.id,
        reason: 'test',
      }),
    );
    const comments = await content.listComments(post.id, author.id);
    expect(comments.items).toHaveLength(0);
    const notifications = await new NotificationService(dataSource).list(author.id);
    expect(notifications.items.some((item) => item.summary.includes('Commenter'))).toBe(false);
  });

  it('hides deleted authors and never returns their retained public ids', async () => {
    const author = await activeUser('deleted-author@example.com', 'Deleted Author');
    const commenter = await activeUser('deleted-commenter@example.com', 'Deleted Commenter');
    const reader = await activeUser('deleted-reader@example.com', 'Reader');
    const post = await publishPost(author, 'Content retained under an anonymous foreign key.');
    const comment = await content.createComment(
      commenter.id,
      post.id,
      'Comment whose author later deletes the account.',
      null,
      'deleted-author-comment',
    );
    await approve('comment', comment.id as string);

    commenter.accountStatus = 'deleted';
    commenter.displayName = null;
    await dataSource.getRepository(User).save(commenter);
    const comments = await content.listComments(post.id, reader.id);
    expect(comments.items).toHaveLength(0);
    expect(JSON.stringify(comments)).not.toContain(commenter.publicId);

    author.accountStatus = 'deleted';
    author.displayName = null;
    await dataSource.getRepository(User).save(author);
    const listing = await content.listPosts(reader.id, {});
    expect(listing.items).toHaveLength(0);
    expect(JSON.stringify(listing)).not.toContain(author.publicId);
    await expect(content.getPost(post.id, reader.id)).rejects.toMatchObject({
      response: { code: 'CONTENT_NOT_FOUND' },
    });
    const moderatorView = await content.getPost(post.id, moderator.id);
    expect(JSON.stringify(moderatorView)).not.toContain(author.publicId);
    expect(moderatorView.author).toMatchObject({
      publicId: '00000000-0000-4000-8000-000000000000',
      displayName: '已注销用户',
    });
  });

  it('hydrates a multi-post list with one revision and identity batch', async () => {
    const author = await activeUser('batch-post-author@example.com', 'Batch Author');
    const reader = await activeUser('batch-post-reader@example.com', 'Batch Reader');
    for (let index = 0; index < 21; index += 1) {
      await publishPost(
        author,
        `Batch post ${index} contains enough useful workplace context.`,
      );
    }

    const userFind = jest.spyOn(dataSource.getRepository(User), 'find');
    const profileFind = jest.spyOn(dataSource.getRepository(PlayerProfile), 'find');
    const revisionFind = jest.spyOn(dataSource.getRepository(PostRevision), 'find');
    const listing = await content.listPosts(reader.id, {});

    expect(listing.items).toHaveLength(20);
    expect(listing.nextCursor).toEqual(expect.any(String));
    expect(userFind).toHaveBeenCalledTimes(1);
    expect(profileFind).toHaveBeenCalledTimes(1);
    expect(revisionFind).toHaveBeenCalledTimes(1);
    const second = await content.listPosts(reader.id, {
      cursor: listing.nextCursor!,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(
      new Set([...listing.items, ...second.items].map((item) => item.id)).size,
    ).toBe(21);
  });

  it('continues filtered post keyset pagination beyond the former 5000-row guard', async () => {
    const author = await activeUser('large-post-author@example.com', 'Large Author');
    const reader = await activeUser('large-post-reader@example.com', 'Large Reader');
    await seedPublishedPosts(author.id, 5_001, 'developer');

    const first = await content.listPosts(reader.id, { channel: 'developer' });
    expect(first.total).toBe(5_001);
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await content.listPosts(reader.id, {
      channel: 'developer',
      cursor: first.nextCursor!,
    });
    expect(second.items).toHaveLength(20);
    expect(second.total).toBe(5_001);
    expect(
      new Set([...first.items, ...second.items].map((item) => item.id)).size,
    ).toBe(40);
  }, 30_000);

  it('continues comment keyset pagination beyond the former 2000-row guard', async () => {
    const author = await activeUser('large-thread-author@example.com', 'Thread Author');
    const commenter = await activeUser('large-thread-commenter@example.com', 'Commenter');
    const reader = await activeUser('large-thread-reader@example.com', 'Thread Reader');
    const post = await publishPost(author, 'A large discussion thread used for cursor regression.');
    await seedPublishedComments(post.id as string, commenter.id, 2_001);

    const first = await content.listComments(post.id as string, reader.id);
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await content.listComments(
      post.id as string,
      reader.id,
      first.nextCursor!,
    );
    expect(second.items).toHaveLength(50);
    expect(
      new Set([...first.items, ...second.items].map((item) => item.id)).size,
    ).toBe(100);
  }, 30_000);

  it('makes create/report idempotent and rejects ordinary users from moderation', async () => {
    const author = await activeUser('idempotent-author@example.com', 'Author');
    const reporter = await activeUser('idempotent-reporter@example.com', 'Reporter');
    const first = await content.createPost(author.id, postInput('Idempotent post content with enough detail.'), 'same-create-key');
    const replay = await content.createPost(author.id, postInput('Idempotent post content with enough detail.'), 'same-create-key');
    expect(replay.id).toBe(first.id);
    await expect(
      content.createPost(author.id, postInput('Different post content with enough detail.'), 'same-create-key'),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    await content.submitPostReview(author.id, first.id, first.version);
    await approve('post', first.id);

    const report = await content.report(reporter.id, 'post', first.id, 'spam', 'Repeated promotional content', 'same-report-key');
    const reportReplay = await content.report(reporter.id, 'post', first.id, 'spam', 'Repeated promotional content', 'same-report-key');
    expect(reportReplay.reportId).toBe(report.reportId);
    await expect(moderation.access(reporter.id)).rejects.toMatchObject({
      response: { code: 'MODERATOR_ACCESS_REQUIRED' },
    });
  });

  it('advertises read-only capabilities when independent write gates are closed', async () => {
    const author = await activeUser('read-only-author@example.com', 'Read Only Author');
    const draft = await content.createPost(
      author.id,
      postInput('Published before the independent write gate is closed.'),
      'read-only-create',
    );
    await content.submitPostReview(author.id, draft.id, draft.version);
    await approve('post', draft.id);
    const moderationCase = await dataSource.getRepository(ModerationCase).findOneByOrFail({
      contentId: draft.id,
      contentType: 'post',
    });

    process.env.FEATURE_CONTENT_WRITES_ENABLED = 'false';
    process.env.FEATURE_MODERATION_OPERATIONS_ENABLED = 'false';
    try {
      await expect(content.listPosts(author.id, {})).resolves.toMatchObject({
        writeEnabled: false,
      });
      const detail = await content.getPost(draft.id, author.id);
      expect(detail.writeEnabled).toBe(false);
      expect(Object.values(detail.permissions).some(Boolean)).toBe(false);
      await expect(moderation.detail(moderator.id, moderationCase.id)).resolves.toMatchObject({
        allowedActions: [],
      });
    } finally {
      delete process.env.FEATURE_CONTENT_WRITES_ENABLED;
      delete process.env.FEATURE_MODERATION_OPERATIONS_ENABLED;
    }
  });

  it('keeps production submissions pending even when phantom webhook settings exist', async () => {
    const author = await activeUser('production-review@example.com', 'Prod Author');
    process.env.LOCAL_DEV = 'false';
    process.env.NODE_ENV = 'production';
    process.env.FEATURE_COMMUNITY_CONTENT_ENABLED = 'true';
    process.env.FEATURE_CONTENT_WRITES_ENABLED = 'true';
    process.env.CONTENT_MODERATION_STAFFED = 'true';
    process.env.CONTENT_LOW_RISK_AUTO_PUBLISH_ENABLED = 'true';
    process.env.CONTENT_MODERATION_WEBHOOK_URL = 'https://unused.example.test/hook';
    process.env.CONTENT_MODERATION_WEBHOOK_TOKEN = 'x'.repeat(64);
    try {
      const draft = await content.createPost(
        author.id,
        postInput('A low-risk production submission requiring real human review.'),
        'production-pending-create',
      );
      const submitted = await content.submitPostReview(
        author.id,
        draft.id,
        draft.version,
      );
      expect(submitted.publicationStatus).toBe('pending_review');
      expect(
        await dataSource.getRepository(ModerationCase).exist({
          where: { contentType: 'post', contentId: draft.id, status: 'open' },
        }),
      ).toBe(true);
    } finally {
      process.env.LOCAL_DEV = 'true';
      process.env.NODE_ENV = 'test';
      delete process.env.FEATURE_COMMUNITY_CONTENT_ENABLED;
      delete process.env.FEATURE_CONTENT_WRITES_ENABLED;
      delete process.env.CONTENT_MODERATION_STAFFED;
      delete process.env.CONTENT_LOW_RISK_AUTO_PUBLISH_ENABLED;
      delete process.env.CONTENT_MODERATION_WEBHOOK_URL;
      delete process.env.CONTENT_MODERATION_WEBHOOK_TOKEN;
    }
  });

  async function publishPost(author: User, body: string) {
    const draft = await content.createPost(author.id, postInput(body, 'question'), randomUUID());
    await content.submitPostReview(author.id, draft.id, draft.version);
    await approve('post', draft.id);
    return content.getPost(draft.id, author.id);
  }

  async function seedPublishedPosts(
    authorId: string,
    count: number,
    channel: PostRevision['channel'],
  ): Promise<void> {
    const baseTime = Date.UTC(2025, 0, 1);
    const pairs = Array.from({ length: count }, (_, index) => ({
      postId: randomUUID(),
      revisionId: randomUUID(),
      timestamp: new Date(baseTime + index),
      index,
    }));
    const postRepo = dataSource.getRepository(CommunityPost);
    const revisionRepo = dataSource.getRepository(PostRevision);
    for (let offset = 0; offset < pairs.length; offset += 250) {
      const chunk = pairs.slice(offset, offset + 250);
      await postRepo.insert(
        chunk.map(({ postId, timestamp }) => ({
          id: postId,
          authorId,
          activeRevisionId: null,
          pendingRevisionId: null,
          acceptedCommentId: null,
          publicationStatus: 'published' as const,
          moderationStatus: 'normal' as const,
          lastReviewDecision: 'approved' as const,
          lastReviewReason: null,
          moderationReason: null,
          deletedAt: null,
          version: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      );
      await revisionRepo.insert(
        chunk.map(({ postId, revisionId, timestamp, index }) => ({
          id: revisionId,
          postId,
          version: 1,
          type: 'experience' as const,
          channel,
          title: `Seeded post ${index}`,
          body: `Seeded post ${index} contains enough workplace context.`,
          bodyFormat: 'plain_text' as const,
          tags: ['scale'],
          searchDocument: `seeded post ${index} workplace context`,
          contentHash: index.toString(16).padStart(64, '0'),
          publicationStatus: 'published' as const,
          moderationStatus: 'normal' as const,
          reviewDecision: 'approved' as const,
          reviewReason: null,
          riskLevel: 'low' as const,
          effectiveAt: timestamp,
          createdAt: timestamp,
        })),
      );
      const parameters = chunk.flatMap(({ postId, revisionId }) => [postId, revisionId]);
      const cases = chunk
        .map(
          (_, index) =>
            `WHEN CAST($${index * 2 + 1} AS uuid) THEN CAST($${index * 2 + 2} AS uuid)`,
        )
        .join(' ');
      const ids = chunk
        .map((_, index) => `CAST($${index * 2 + 1} AS uuid)`)
        .join(', ');
      await dataSource.query(
        `UPDATE community_posts
         SET active_revision_id = CASE id ${cases} ELSE active_revision_id END
         WHERE id IN (${ids})`,
        parameters,
      );
    }
  }

  async function seedPublishedComments(
    postId: string,
    authorId: string,
    count: number,
  ): Promise<void> {
    const baseTime = Date.UTC(2025, 1, 1);
    const pairs = Array.from({ length: count }, (_, index) => ({
      commentId: randomUUID(),
      revisionId: randomUUID(),
      timestamp: new Date(baseTime + index),
      index,
    }));
    const commentRepo = dataSource.getRepository(CommunityComment);
    const revisionRepo = dataSource.getRepository(CommentRevision);
    for (let offset = 0; offset < pairs.length; offset += 250) {
      const chunk = pairs.slice(offset, offset + 250);
      await commentRepo.insert(
        chunk.map(({ commentId, timestamp }) => ({
          id: commentId,
          postId,
          authorId,
          parentCommentId: null,
          depth: 0 as const,
          activeRevisionId: null,
          pendingRevisionId: null,
          publicationStatus: 'published' as const,
          moderationStatus: 'normal' as const,
          lastReviewDecision: 'approved' as const,
          lastReviewReason: null,
          moderationReason: null,
          deletedAt: null,
          version: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      );
      await revisionRepo.insert(
        chunk.map(({ commentId, revisionId, timestamp, index }) => ({
          id: revisionId,
          commentId,
          version: 1,
          body: `Seeded comment ${index}`,
          contentHash: index.toString(16).padStart(64, '0'),
          publicationStatus: 'published' as const,
          moderationStatus: 'normal' as const,
          reviewDecision: 'approved' as const,
          reviewReason: null,
          riskLevel: 'low' as const,
          effectiveAt: timestamp,
          createdAt: timestamp,
        })),
      );
      const parameters = chunk.flatMap(({ commentId, revisionId }) => [
        commentId,
        revisionId,
      ]);
      const cases = chunk
        .map(
          (_, index) =>
            `WHEN CAST($${index * 2 + 1} AS uuid) THEN CAST($${index * 2 + 2} AS uuid)`,
        )
        .join(' ');
      const ids = chunk
        .map((_, index) => `CAST($${index * 2 + 1} AS uuid)`)
        .join(', ');
      await dataSource.query(
        `UPDATE community_comments
         SET active_revision_id = CASE id ${cases} ELSE active_revision_id END
         WHERE id IN (${ids})`,
        parameters,
      );
    }
  }

  async function approve(contentType: 'post' | 'comment', contentId: string) {
    const row = await dataSource.getRepository(ModerationCase).findOneOrFail({
      where: { contentType, contentId, status: 'open' },
    });
    return moderation.applyAction(
      moderator.id,
      row.id,
      'approve',
      'Manual review approved',
      row.version,
      randomUUID(),
    );
  }

  function postInput(body: string, type: 'experience' | 'question' = 'experience') {
    return {
      type,
      channel: type === 'question' ? ('questions' as const) : ('general' as const),
      title: type === 'question' ? 'How should this work?' : 'A useful workplace note',
      body,
      tags: ['work'],
      bodyFormat: 'plain_text' as const,
    };
  }

  async function activeUser(
    email: string,
    displayName: string,
    communityRole: User['communityRole'] = 'user',
  ): Promise<User> {
    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        email,
        emailNormalized: email,
        passwordHash: 'unused-test-hash',
        displayName,
        publicId: randomUUID(),
        accountStatus: 'active',
        socialVerificationStatus: 'verified',
        communityRole,
        emailVerifiedAt: new Date(),
        passwordChangedAt: new Date(),
        onboardingCompleted: true,
      }),
    );
    await dataSource.getRepository(PlayerProfile).save(
      dataSource.getRepository(PlayerProfile).create({
        userId: user.id,
        nickname: displayName,
        avatarKey: 'violet',
        bio: null,
        battleProfession: 'developer',
        privacySettings: {
          equipment: 'friends',
          battleRecord: 'friends',
          plant: 'friends',
          honors: 'friends',
          friendCount: 'self',
          recentActivity: 'self',
        },
        title: 'New colleague',
      }),
    );
    return user;
  }
});
