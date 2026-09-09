import { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive schema; production rollback preserves these rows and pauses old account erasure. */
export class AddCommunityProgression1700000000031 implements MigrationInterface {
  name = 'AddCommunityProgression1700000000031';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE membership_grants (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      campaign_key varchar(64) NOT NULL CHECK (length(campaign_key) > 0),
      starts_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL,
      PRIMARY KEY (user_id, campaign_key), CHECK (expires_at > starts_at)
    )`);
    await queryRunner.query('CREATE INDEX idx_membership_grants_user_expiry ON membership_grants(user_id, expires_at)');
    await queryRunner.query(`CREATE TABLE achievement_unlocks (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      achievement_key varchar(64) NOT NULL CHECK (length(achievement_key) > 0),
      unlocked_at timestamptz NOT NULL, source_version smallint NOT NULL DEFAULT 1 CHECK (source_version > 0),
      PRIMARY KEY (user_id, achievement_key)
    )`);
    await queryRunner.query(`CREATE TABLE user_presentation (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      equipped_title_key varchar(64), version integer NOT NULL DEFAULT 1 CHECK (version > 0),
      last_request_id uuid, last_request_hash varchar(64), updated_at timestamptz NOT NULL,
      CHECK ((last_request_id IS NULL AND last_request_hash IS NULL) OR (last_request_id IS NOT NULL AND last_request_hash IS NOT NULL AND length(last_request_hash) = 64))
    )`);
    // A single fixed campaign, at migration time, for existing ACTIVE accounts only.
    // 720 hours means exactly 30*24h regardless of session timezone or DST.
    await queryRunner.query(`INSERT INTO membership_grants (user_id, campaign_key, starts_at, expires_at, created_at)
      SELECT id, 'launch_vip_202609', transaction_timestamp(), transaction_timestamp() + interval '720 hours', transaction_timestamp()
      FROM users WHERE account_status = 'active'
      ON CONFLICT (user_id, campaign_key) DO NOTHING`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    // Isolated restore rehearsals only. Never erase production member/history records on application rollback.
    await queryRunner.query('DROP TABLE user_presentation');
    await queryRunner.query('DROP TABLE achievement_unlocks');
    await queryRunner.query('DROP TABLE membership_grants');
  }
}
