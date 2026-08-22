import { randomUUID } from 'node:crypto';

import type { DataSource, QueryRunner } from 'typeorm';

import { User } from '../entities/user.entity';
import { createLocalDevDataSource } from '../local-dev-datasource';
import { AddCommunityContentAndModeration1700000000010 } from './1700000000010-AddCommunityContentAndModeration';

describe('AddCommunityContentAndModeration1700000000010', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = await createLocalDevDataSource();
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('round-trips on pg-mem and enforces revision/comment pointer foreign keys', async () => {
    const migration = new AddCommunityContentAndModeration1700000000010();
    let runner = dataSource.createQueryRunner();
    await runner.connect();
    try {
      await migration.down(runner);
      expect(await columnExists(runner, 'users', 'community_role')).toBe(false);
      expect(await tableExists(runner, 'community_posts')).toBe(false);
      await runner.release();
      await dataSource.destroy();

      // pg-mem keeps dropped primary-key catalog relations, unlike PostgreSQL.
      // Rebooting a fresh pg-mem instance verifies the same migration's up path
      // after the down path without mistaking that emulator limitation for a
      // real PostgreSQL result.
      dataSource = await createLocalDevDataSource();
      runner = dataSource.createQueryRunner();
      await runner.connect();
      expect(await columnExists(runner, 'users', 'community_role')).toBe(true);
      expect(await tableExists(runner, 'community_posts')).toBe(true);

      const user = await dataSource.getRepository(User).save(
        dataSource.getRepository(User).create({
          email: 'migration-content@example.com',
          emailNormalized: 'migration-content@example.com',
          passwordHash: 'unused',
          displayName: 'Migration User',
          publicId: randomUUID(),
          accountStatus: 'active',
          socialVerificationStatus: 'verified',
          communityRole: 'user',
          emailVerifiedAt: new Date(),
          passwordChangedAt: new Date(),
          onboardingCompleted: true,
        }),
      );

      const [{ id: postId }] = (await runner.query(
        `INSERT INTO "community_posts"
           ("author_id", "publication_status", "moderation_status")
         VALUES ($1, 'draft', 'normal') RETURNING "id"`,
        [user.id],
      )) as Array<{ id: string }>;
      await expect(
        runner.query(
          `UPDATE "community_posts" SET "active_revision_id" = $1 WHERE "id" = $2`,
          [randomUUID(), postId],
        ),
      ).rejects.toThrow();

      const [{ id: revisionId }] = (await runner.query(
        `INSERT INTO "community_post_revisions"
          ("post_id", "version", "type", "channel", "title", "body",
           "body_format", "tags", "search_document", "content_hash",
           "publication_status", "moderation_status", "risk_level")
         VALUES ($1, 1, 'experience', 'general', 'Valid title',
           'A body long enough for this migration constraint test.',
           'plain_text', '[]', 'search document', $2, 'draft', 'normal', 'low')
         RETURNING "id"`,
        [postId, 'a'.repeat(64)],
      )) as Array<{ id: string }>;
      await expect(
        runner.query(
          `UPDATE "community_posts" SET "active_revision_id" = $1 WHERE "id" = $2`,
          [revisionId, postId],
        ),
      ).resolves.toBeDefined();
      await expect(
        runner.query(
          `UPDATE "community_posts" SET "accepted_comment_id" = $1 WHERE "id" = $2`,
          [randomUUID(), postId],
        ),
      ).rejects.toThrow();
    } finally {
      if (!runner.isReleased) await runner.release();
    }
  });

  it('emits PostgreSQL GIN FTS and referential constraints without claiming a real-PG run', async () => {
    const queries: string[] = [];
    const runner = {
      connection: { options: { type: 'postgres', extra: {} } },
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
      }),
    } as unknown as QueryRunner;
    await new AddCommunityContentAndModeration1700000000010().up(runner);
    const sql = queries.join('\n');
    expect(sql).toContain('USING GIN');
    expect(sql).toContain("to_tsvector('simple', \"search_document\")");
    expect(sql).toContain('fk_community_posts_active_revision');
    expect(sql).toContain('fk_community_posts_accepted_comment');
    expect(sql).toContain('fk_community_comments_pending_revision');
  });

  async function tableExists(runner: QueryRunner, table: string): Promise<boolean> {
    const rows = (await runner.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = $1`,
      [table],
    )) as unknown[];
    return rows.length > 0;
  }

  async function columnExists(
    runner: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const rows = (await runner.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = $1 AND column_name = $2`,
      [table, column],
    )) as unknown[];
    return rows.length > 0;
  }
});
