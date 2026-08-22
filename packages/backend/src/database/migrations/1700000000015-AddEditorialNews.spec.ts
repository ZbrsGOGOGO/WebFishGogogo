import { randomUUID } from 'node:crypto';

import type { DataSource, QueryRunner } from 'typeorm';

import {
  NewsArticle,
  NewsArticleRevision,
  NewsReviewDecision,
  NewsSource,
  User,
} from '../entities';
import { createLocalDevDataSource } from '../local-dev-datasource';
import { AddEditorialNews1700000000015 } from './1700000000015-AddEditorialNews';

describe('AddEditorialNews1700000000015', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = await createLocalDevDataSource();
  });

  afterEach(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
  });

  it('round-trips in pg-mem and enforces independent review in the schema', async () => {
    const actor = await createUser();
    const source = await dataSource.getRepository(NewsSource).save(
      dataSource.getRepository(NewsSource).create({
        name: 'Migration News Source',
        sourceType: 'official',
        homepageUrl: 'https://migration-news.example.test/',
        trustRank: 80,
        authorizationStatus: 'verified',
        authorizationEvidenceRef: 'dms/migration-news',
        authorizationValidFrom: null,
        authorizationValidUntil: null,
        authorizationRevokedAt: null,
        version: 1,
        createdBy: actor.id,
        updatedBy: actor.id,
      }),
    );
    const article = await dataSource.getRepository(NewsArticle).save(
      dataSource.getRepository(NewsArticle).create({
        publicId: randomUUID(),
        sourceId: source.id,
        status: 'pending_review',
        currentRevisionId: null,
        pendingRevisionId: null,
        publishedRevisionId: null,
        createdBy: actor.id,
        submittedBy: actor.id,
        submittedAt: new Date(),
        reviewedBy: null,
        publishedAt: null,
        lastCorrectedAt: null,
        withdrawnAt: null,
        withdrawalNotice: null,
        version: 1,
      }),
    );
    const revision = await dataSource.getRepository(NewsArticleRevision).save(
      dataSource.getRepository(NewsArticleRevision).create({
        articleId: article.id,
        version: 1,
        originalTitle: 'Migration title',
        summary:
          'This migration-only summary is long enough to satisfy the editorial storage contract.',
        originalUrl: 'https://migration-news.example.test/story',
        originalPublishedAt: new Date(),
        professionTags: [],
        topicTags: [],
        correctionNote: null,
        contentHash: 'a'.repeat(64),
        createdBy: actor.id,
      }),
    );
    article.currentRevisionId = revision.id;
    article.pendingRevisionId = revision.id;
    await dataSource.getRepository(NewsArticle).save(article);

    await expect(
      dataSource.getRepository(NewsReviewDecision).save(
        dataSource.getRepository(NewsReviewDecision).create({
          articleId: article.id,
          revisionId: revision.id,
          submittedBy: actor.id,
          reviewerId: actor.id,
          decision: 'approved',
          reason: 'self review must fail',
          sourceAuthorizationSnapshot: {},
        }),
      ),
    ).rejects.toThrow();

    const runner = dataSource.createQueryRunner();
    await runner.connect();
    try {
      await new AddEditorialNews1700000000015().down(runner);
      expect(await tableExists(runner, 'news_articles')).toBe(false);
      expect(await tableExists(runner, 'news_sources')).toBe(false);
    } finally {
      await runner.release();
    }
  });

  async function createUser(): Promise<User> {
    const email = `news-migration-${randomUUID()}@example.com`;
    return dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        email,
        emailNormalized: email,
        passwordHash: 'unused',
        displayName: 'News Migration Admin',
        publicId: randomUUID(),
        accountStatus: 'active',
        socialVerificationStatus: 'verified',
        communityRole: 'admin',
        emailVerifiedAt: new Date(),
        passwordChangedAt: new Date(),
        onboardingCompleted: true,
      }),
    );
  }
});

async function tableExists(runner: QueryRunner, table: string): Promise<boolean> {
  const rows = (await runner.query(
    `SELECT table_name FROM information_schema.tables WHERE table_name = $1`,
    [table],
  )) as unknown[];
  return rows.length > 0;
}
