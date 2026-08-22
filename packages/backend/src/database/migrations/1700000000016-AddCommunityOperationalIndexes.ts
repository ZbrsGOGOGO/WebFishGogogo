import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Query-backed operational indexes for the community API hot paths.
 *
 * Every index below corresponds to a concrete where/order pair in a service;
 * this migration intentionally does not introduce speculative cache tables.
 */
export class AddCommunityOperationalIndexes1700000000016
  implements MigrationInterface
{
  name = 'AddCommunityOperationalIndexes1700000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "idx_auth_sessions_active_order"
      ON "auth_sessions" ("user_id", "last_seen_at" DESC, "created_at" DESC, "expires_at")
      WHERE "revoked_at" IS NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_community_notifications_page"
      ON "community_notifications" ("user_id", "created_at" DESC, "id" DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_community_notifications_unread_category"
      ON "community_notifications" ("user_id", "category", "created_at" DESC, "id" DESC)
      WHERE "read_at" IS NULL;
    `);

    await queryRunner.query(`DROP INDEX "idx_friend_requests_recipient_status";`);
    await queryRunner.query(`
      CREATE INDEX "idx_friend_requests_recipient_status"
      ON "friend_requests" ("recipient_id", "status", "created_at" DESC, "id" DESC);
    `);
    await queryRunner.query(`DROP INDEX "idx_friend_requests_requester_status";`);
    await queryRunner.query(`
      CREATE INDEX "idx_friend_requests_requester_status"
      ON "friend_requests" ("requester_id", "status", "created_at" DESC, "id" DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_friend_requests_requester_created"
      ON "friend_requests" ("requester_id", "created_at" DESC);
    `);

    await queryRunner.query(`DROP INDEX "idx_friendships_low_active";`);
    await queryRunner.query(`
      CREATE INDEX "idx_friendships_low_active"
      ON "friendships" ("user_low_id", "current_started_at" DESC, "id" DESC)
      WHERE "ended_at" IS NULL;
    `);
    await queryRunner.query(`DROP INDEX "idx_friendships_high_active";`);
    await queryRunner.query(`
      CREATE INDEX "idx_friendships_high_active"
      ON "friendships" ("user_high_id", "current_started_at" DESC, "id" DESC)
      WHERE "ended_at" IS NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_user_blocks_blocker_created"
      ON "user_blocks" ("blocker_id", "created_at" DESC, "blocked_id" DESC);
    `);

    await queryRunner.query(`DROP INDEX "idx_community_posts_publication";`);
    await queryRunner.query(`
      CREATE INDEX "idx_community_posts_publication"
      ON "community_posts" ("updated_at" DESC, "id" DESC)
      WHERE "publication_status" = 'published' AND "deleted_at" IS NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_chat_messages_author_room_created"
      ON "chat_messages" ("author_id", "room_slug", "created_at" DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_news_articles_public_feed"
      ON "news_articles" ("published_at" DESC, "public_id" DESC)
      WHERE "published_revision_id" IS NOT NULL
        AND "published_at" IS NOT NULL
        AND "status" IN ('published', 'pending_review');
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_office_battle_offer_sets_unconsumed"
      ON "office_battle_offer_sets" ("user_id", "created_at" DESC)
      WHERE "consumed_at" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_office_battle_offer_sets_unconsumed";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_news_articles_public_feed";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chat_messages_author_room_created";`);

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_community_posts_publication";`);
    await queryRunner.query(`
      CREATE INDEX "idx_community_posts_publication"
      ON "community_posts" ("publication_status", "moderation_status", "deleted_at", "updated_at" DESC);
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_blocks_blocker_created";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_friendships_high_active";`);
    await queryRunner.query(`
      CREATE INDEX "idx_friendships_high_active"
      ON "friendships" ("user_high_id", "ended_at");
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_friendships_low_active";`);
    await queryRunner.query(`
      CREATE INDEX "idx_friendships_low_active"
      ON "friendships" ("user_low_id", "ended_at");
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_friend_requests_requester_created";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_friend_requests_requester_status";`);
    await queryRunner.query(`
      CREATE INDEX "idx_friend_requests_requester_status"
      ON "friend_requests" ("requester_id", "status", "created_at" DESC);
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_friend_requests_recipient_status";`);
    await queryRunner.query(`
      CREATE INDEX "idx_friend_requests_recipient_status"
      ON "friend_requests" ("recipient_id", "status", "created_at" DESC);
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_community_notifications_unread_category";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_community_notifications_page";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_auth_sessions_active_order";`);
  }
}
