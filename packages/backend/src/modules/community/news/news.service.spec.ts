import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import {
  NewsArticle,
  NewsArticleRevision,
  NewsSource,
  User,
} from '../../../database/entities';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import type { CommunityClock } from '../community-clock';
import { NewsService } from './news.service';
import type { NewsRevisionInput, NewsSourceInput } from './news-validation';

describe('NewsService editorial transactions', () => {
  let dataSource: DataSource;
  let service: NewsService;
  let now: Date;
  let administrator: User;
  let secondReviewer: User;
  let moderator: User;
  let member: User;

  beforeEach(async () => {
    dataSource = await createLocalDevDataSource();
    now = new Date('2026-08-22T10:00:00.000Z');
    const clock: CommunityClock = { now: () => new Date(now) };
    service = new NewsService(dataSource, clock);
    administrator = await createUser('news-admin@example.com', 'admin');
    secondReviewer = await createUser('news-reviewer@example.com', 'admin');
    moderator = await createUser('news-editor@example.com', 'moderator');
    member = await createUser('news-member@example.com', 'user');
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('requires an independent reviewer and keeps the old public revision live while a correction waits', async () => {
    const source = await service.createSource(
      administrator.id,
      sourceInput(),
      'news-source-create-1',
    );
    const draft = await service.createDraft(
      moderator.id,
      revisionInput(source.id, 'Initial title', 'initial'),
      'news-draft-create-1',
    );
    const submitted = await service.submitForReview(
      moderator.id,
      draft.id,
      draft.version,
      'news-submit-1',
    );

    await expect(
      service.review(
        moderator.id,
        draft.id,
        'approved',
        'editor cannot approve own submission',
        submitted.version,
        'news-self-review-1',
      ),
    ).rejects.toMatchObject({ response: { code: 'NEWS_SELF_REVIEW_FORBIDDEN' } });

    const published = await service.review(
      administrator.id,
      draft.id,
      'approved',
      'independent editorial approval',
      submitted.version,
      'news-review-approve-1',
    );
    expect(published).toMatchObject({ status: 'published' });
    const publicBefore = await service.getPublic(draft.id);
    expect(publicBefore).toMatchObject({ status: 'published' });
    expect('summary' in publicBefore ? publicBefore.summary : '').toContain('Initial title');
    expect(Object.keys(publicBefore).sort()).toEqual(
      [
        'correctionNote',
        'discussion',
        'id',
        'lastCorrectedAt',
        'originalPublishedAt',
        'originalUrl',
        'publishedAt',
        'source',
        'status',
        'summary',
      ].sort(),
    );
    expect('source' in publicBefore ? publicBefore.source : null).toEqual({
      name: 'Example Official Newsroom',
    });
    expect(
      'discussion' in publicBefore ? publicBefore.discussion.createPostPath : '',
    ).not.toContain('Initial title');
    const serialized = JSON.stringify(publicBefore);
    expect(serialized).not.toContain('authorizationEvidenceRef');
    expect(serialized).not.toContain(source.id);
    expect(serialized).not.toContain(administrator.id);
    expect(serialized).not.toContain(moderator.id);

    const correction = await service.reviseDraft(
      moderator.id,
      draft.id,
      revisionInput(source.id, 'Corrected title', 'correction', 'Clarified the reported date.'),
      published.version,
      'news-revise-1',
    );
    const pendingCorrection = await service.submitForReview(
      moderator.id,
      draft.id,
      correction.version,
      'news-submit-2',
    );
    const publicWhilePending = await service.getPublic(draft.id);
    expect(publicWhilePending).toMatchObject({ status: 'published' });
    expect('summary' in publicWhilePending ? publicWhilePending.summary : '').toContain(
      'Initial title',
    );

    now = new Date('2026-08-22T11:00:00.000Z');
    const corrected = await service.review(
      secondReviewer.id,
      draft.id,
      'approved',
      'correction verified against original source',
      pendingCorrection.version,
      'news-review-approve-2',
    );
    expect(corrected).toMatchObject({ status: 'published' });
    const publicCorrected = await service.getPublic(draft.id);
    expect(publicCorrected).toMatchObject({
      status: 'published',
      correctionNote: 'Clarified the reported date.',
      lastCorrectedAt: now.toISOString(),
    });
    expect('summary' in publicCorrected ? publicCorrected.summary : '').toContain(
      'Corrected title',
    );

    const withdrawn = await service.withdraw(
      administrator.id,
      draft.id,
      'The source issued a material retraction.',
      corrected.version,
      'news-withdraw-1',
    );
    expect(withdrawn.status).toBe('withdrawn');
    expect((await service.listPublic(null, { feed: 'latest' })).items).toHaveLength(0);
    const publicAfter = await service.getPublic(draft.id);
    expect(publicAfter).toMatchObject({ status: 'withdrawn', id: draft.id });
    expect(publicAfter).not.toHaveProperty('title');
    expect(publicAfter).not.toHaveProperty('summary');
    expect(publicAfter).not.toHaveProperty('originalUrl');
  });

  it('revokes public articles when source authorization becomes invalid and blocks later publication', async () => {
    const source = await service.createSource(
      administrator.id,
      sourceInput(),
      'news-source-create-revoke',
    );
    const published = await publishOne(source.id, 'Authorization-sensitive story', 'revoke');

    const revoked = await service.updateSource(
      administrator.id,
      source.id,
      { ...sourceInput(), authorizationStatus: 'revoked' },
      source.version,
      'news-source-revoke-1',
    );
    expect(revoked.authorizationStatus).toBe('revoked');
    expect(await service.getPublic(published.id)).toMatchObject({ status: 'withdrawn' });

    const draft = await service.createDraft(
      moderator.id,
      revisionInput(source.id, 'Cannot publish this story', 'invalid-source'),
      'news-invalid-source-draft',
    );
    await expect(
      service.submitForReview(
        moderator.id,
        draft.id,
        draft.version,
        'news-invalid-source-submit',
      ),
    ).rejects.toMatchObject({
      response: { code: 'NEWS_SOURCE_AUTHORIZATION_INVALID' },
    });
  });

  it('requires a new immutable revision after rejection and does not revive withdrawn text during editing', async () => {
    const source = await service.createSource(
      administrator.id,
      sourceInput(),
      'news-source-create-rejection',
    );
    const draft = await service.createDraft(
      moderator.id,
      revisionInput(source.id, 'Draft requiring changes', 'rejection'),
      'news-draft-rejection',
    );
    const pending = await service.submitForReview(
      moderator.id,
      draft.id,
      draft.version,
      'news-submit-rejection',
    );
    const rejected = await service.review(
      administrator.id,
      draft.id,
      'rejected',
      'The summary needs a clearer source attribution.',
      pending.version,
      'news-review-rejection',
    );
    await expect(
      service.submitForReview(
        moderator.id,
        draft.id,
        rejected.version,
        'news-resubmit-same-revision',
      ),
    ).rejects.toMatchObject({ response: { code: 'NEWS_REVISION_ALREADY_REVIEWED' } });

    const replacement = await service.reviseDraft(
      moderator.id,
      draft.id,
      revisionInput(source.id, 'Draft with clearer attribution', 'rejection-v2'),
      rejected.version,
      'news-revise-after-rejection',
    );
    const replacementPending = await service.submitForReview(
      moderator.id,
      draft.id,
      replacement.version,
      'news-submit-after-rejection',
    );
    const published = await service.review(
      administrator.id,
      draft.id,
      'approved',
      'The attribution is now independently verified.',
      replacementPending.version,
      'news-approve-after-rejection',
    );
    const withdrawn = await service.withdraw(
      administrator.id,
      draft.id,
      'The edition was withdrawn pending a replacement.',
      published.version,
      'news-withdraw-before-replacement',
    );
    await service.reviseDraft(
      moderator.id,
      draft.id,
      revisionInput(
        source.id,
        'Replacement after withdrawal',
        'replacement',
        'Replaces the withdrawn edition after source clarification.',
      ),
      withdrawn.version,
      'news-revise-withdrawn',
    );
    await expect(service.getPublic(draft.id)).rejects.toMatchObject({
      response: { code: 'NEWS_NOT_FOUND' },
    });
  });

  it('requires explicit personalization and applies negative feedback only to for_you', async () => {
    const source = await service.createSource(
      administrator.id,
      sourceInput(),
      'news-source-create-personalization',
    );
    const published = await publishOne(source.id, 'Developer platform update', 'technology');

    await expect(service.listPublic(member.id, { feed: 'for_you' })).rejects.toMatchObject({
      response: { code: 'NEWS_PERSONALIZATION_NOT_ENABLED' },
    });
    const preference = await service.updatePreferences(
      member.id,
      true,
      ['technology'],
      null,
      'news-preference-enable-1',
    );
    expect(preference).toMatchObject({ personalizationEnabled: true, version: 1 });
    expect((await service.listPublic(member.id, { feed: 'for_you' })).items).toHaveLength(1);

    const acknowledgement = await service.negativeFeedback(
      member.id,
      published.id,
      'not_interested',
      'news-feedback-1',
    );
    expect(
      await service.negativeFeedback(
        member.id,
        published.id,
        'not_interested',
        'news-feedback-1',
      ),
    ).toEqual(acknowledgement);
    expect((await service.listPublic(member.id, { feed: 'for_you' })).items).toHaveLength(0);
    expect((await service.listPublic(member.id, { feed: 'latest' })).items).toHaveLength(1);
  });

  it('uses database roles for editorial authorization and never lets moderators manage source evidence', async () => {
    await expect(service.listSources(moderator.id)).rejects.toMatchObject({
      response: { code: 'NEWS_ADMIN_REQUIRED' },
    });
    await expect(
      service.createSource(moderator.id, sourceInput(), 'news-source-denied-moderator'),
    ).rejects.toMatchObject({ response: { code: 'NEWS_ADMIN_REQUIRED' } });
    await expect(
      service.createDraft(
        member.id,
        revisionInput(randomUUID(), 'Member must not edit news', 'rbac'),
        'news-draft-denied-member',
      ),
    ).rejects.toMatchObject({ response: { code: 'NEWS_EDITOR_ACCESS_REQUIRED' } });
  });

  it('provides stable cursor pagination without duplicating public articles', async () => {
    const sourceView = await service.createSource(
      administrator.id,
      sourceInput(),
      'news-source-create-cursor',
    );
    const source = await dataSource.getRepository(NewsSource).findOneByOrFail({ id: sourceView.id });
    for (let index = 0; index < 21; index += 1) {
      await insertPublished(source, index);
    }

    const first = await service.listPublic(null, { feed: 'latest' });
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await service.listPublic(null, {
      feed: 'latest',
      cursor: first.nextCursor!,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(21);
    await expect(
      service.listPublic(null, { feed: 'latest', cursor: 'not-a-valid-cursor' }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_NEWS_CURSOR' } });
  });

  it('filters expired source authorization before latest-feed pagination', async () => {
    const validSourceView = await service.createSource(
      administrator.id,
      sourceInput({ name: 'Still Authorized Newsroom' }),
      'news-source-valid-page-filter',
    );
    const expiredSourceView = await service.createSource(
      administrator.id,
      sourceInput({ name: 'Expired Newsroom' }),
      'news-source-expired-page-filter',
    );
    const sourceRepo = dataSource.getRepository(NewsSource);
    const validSource = await sourceRepo.findOneByOrFail({
      id: validSourceView.id,
    });
    const expiredSource = await sourceRepo.findOneByOrFail({
      id: expiredSourceView.id,
    });
    expiredSource.authorizationValidUntil = new Date(now.getTime() - 1);
    await sourceRepo.save(expiredSource);

    const validArticle = await insertPublished(validSource, 100);
    for (let index = 0; index < 20; index += 1) {
      await insertPublished(expiredSource, index);
    }

    const page = await service.listPublic(null, { feed: 'latest' });
    expect(page.items.map((item) => item.id)).toEqual([
      validArticle.publicId,
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it(
    'does not let more than 2000 unpublished candidates disable filtered or personalized feeds',
    async () => {
      const sourceView = await service.createSource(
        administrator.id,
        sourceInput({ name: 'Capacity-safe Newsroom' }),
        'news-source-capacity-safe',
      );
      const source = await dataSource
        .getRepository(NewsSource)
        .findOneByOrFail({ id: sourceView.id });
      const visible = await insertPublished(source, 0);
      const articleRepo = dataSource.getRepository(NewsArticle);
      const unpublished = Array.from({ length: 2_001 }, (_, index) =>
        articleRepo.create({
          publicId: randomUUID(),
          sourceId: source.id,
          status: 'pending_review',
          currentRevisionId: null,
          pendingRevisionId: null,
          publishedRevisionId: null,
          createdBy: moderator.id,
          submittedBy: moderator.id,
          submittedAt: new Date(now.getTime() - index),
          reviewedBy: null,
          publishedAt: null,
          lastCorrectedAt: null,
          withdrawnAt: null,
          withdrawalNotice: null,
          version: 1,
        }),
      );
      await articleRepo.save(unpublished, { chunk: 250 });

      const filtered = await service.listPublic(null, {
        feed: 'latest',
        topic: 'cursor-0',
      });
      expect(filtered.items.map((item) => item.id)).toEqual([
        visible.publicId,
      ]);

      await service.updatePreferences(
        member.id,
        true,
        ['cursor-0'],
        null,
        'news-preference-capacity-safe',
      );
      const personalized = await service.listPublic(member.id, {
        feed: 'for_you',
      });
      expect(personalized.items.map((item) => item.id)).toEqual([
        visible.publicId,
      ]);
    },
    30_000,
  );

  async function publishOne(
    sourceId: string,
    title: string,
    topic: string,
  ) {
    const suffix = randomUUID();
    const draft = await service.createDraft(
      moderator.id,
      revisionInput(sourceId, title, topic),
      `news-draft-${suffix}`,
    );
    const pending = await service.submitForReview(
      moderator.id,
      draft.id,
      draft.version,
      `news-submit-${suffix}`,
    );
    return service.review(
      administrator.id,
      draft.id,
      'approved',
      'independent editorial approval',
      pending.version,
      `news-approve-${suffix}`,
    );
  }

  async function insertPublished(
    source: NewsSource,
    index: number,
  ): Promise<NewsArticle> {
    const articleRepo = dataSource.getRepository(NewsArticle);
    const revisionRepo = dataSource.getRepository(NewsArticleRevision);
    const publishedAt = new Date(now.getTime() - index * 60 * 60 * 1_000);
    const article = await articleRepo.save(
      articleRepo.create({
        publicId: randomUUID(),
        sourceId: source.id,
        status: 'published',
        currentRevisionId: null,
        pendingRevisionId: null,
        publishedRevisionId: null,
        createdBy: administrator.id,
        submittedBy: moderator.id,
        submittedAt: publishedAt,
        reviewedBy: administrator.id,
        publishedAt,
        lastCorrectedAt: null,
        withdrawnAt: null,
        withdrawalNotice: null,
        version: 1,
      }),
    );
    const input = revisionInput(source.id, `Cursor story ${index}`, `cursor-${index}`);
    const revision = await revisionRepo.save(
      revisionRepo.create({
        articleId: article.id,
        version: 1,
        originalTitle: input.originalTitle,
        summary: input.summary,
        originalUrl: input.originalUrl,
        originalPublishedAt: input.originalPublishedAt,
        professionTags: input.professionTags,
        topicTags: input.topicTags,
        correctionNote: null,
        contentHash: `${index}`.padStart(64, '0'),
        createdBy: administrator.id,
      }),
    );
    article.currentRevisionId = revision.id;
    article.publishedRevisionId = revision.id;
    return articleRepo.save(article);
  }

  async function createUser(
    email: string,
    role: 'user' | 'moderator' | 'admin',
  ): Promise<User> {
    return dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        email,
        emailNormalized: email,
        passwordHash: 'unused',
        displayName: email.split('@')[0],
        publicId: randomUUID(),
        accountStatus: 'active',
        socialVerificationStatus: 'verified',
        communityRole: role,
        emailVerifiedAt: now,
        passwordChangedAt: now,
        onboardingCompleted: true,
      }),
    );
  }

  function sourceInput(
    overrides: Partial<NewsSourceInput> = {},
  ): NewsSourceInput {
    return {
      name: 'Example Official Newsroom',
      sourceType: 'official',
      homepageUrl: 'https://news.example.test/',
      trustRank: 80,
      authorizationStatus: 'verified',
      authorizationEvidenceRef: 'dms/news/example-official-v1',
      authorizationValidFrom: null,
      authorizationValidUntil: null,
      ...overrides,
    };
  }

  function revisionInput(
    sourceId: string,
    title: string,
    topic: string,
    correctionNote: string | null = null,
  ): NewsRevisionInput {
    return {
      sourceId,
      originalTitle: title,
      summary:
        `Independent summary for ${title}: the source announced a material update and readers should verify details at the linked original.`,
      originalUrl: `https://news.example.test/stories/${encodeURIComponent(topic)}`,
      originalPublishedAt: new Date('2026-08-20T08:00:00.000Z'),
      professionTags: ['developer'],
      topicTags: [topic],
      correctionNote,
    };
  }
});
