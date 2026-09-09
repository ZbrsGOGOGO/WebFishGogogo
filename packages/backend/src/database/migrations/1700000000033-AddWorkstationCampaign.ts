import { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive account campaign storage. Application rollback keeps all campaign data. */
export class AddWorkstationCampaign1700000000033 implements MigrationInterface {
  name = 'AddWorkstationCampaign1700000000033';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE tower_defense_profiles (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      experience integer NOT NULL DEFAULT 0 CHECK(experience>=0),
      promotion_tier integer NOT NULL DEFAULT 0 CHECK(promotion_tier BETWEEN 0 AND 7),
      unlocked_chapter integer NOT NULL DEFAULT 1 CHECK(unlocked_chapter BETWEEN 1 AND 6),
      talents jsonb NOT NULL DEFAULT '{"output":0,"control":0,"economy":0}'::jsonb,
      formation jsonb NOT NULL DEFAULT '[]'::jsonb,
      stats jsonb NOT NULL DEFAULT '{"runs":0,"wins":0,"waves":0,"bestScore":0,"bestStreak":0,"totalScore":0,"achievements":[]}'::jsonb
    )`);
    await runner.query(`CREATE TABLE tower_defense_runs (
      id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_id uuid NOT NULL, mode varchar(12) NOT NULL CHECK(mode IN ('story','endless','extreme')),
      chapter integer NOT NULL CHECK(chapter BETWEEN 1 AND 6), state jsonb NOT NULL,
      revision integer NOT NULL DEFAULT 1 CHECK(revision>0), last_tick_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, settled_at timestamptz,
      score integer NOT NULL DEFAULT 0 CHECK(score>=0), successful_waves integer NOT NULL DEFAULT 0 CHECK(successful_waves BETWEEN 0 AND 60),
      stars integer NOT NULL DEFAULT 0 CHECK(stars BETWEEN 0 AND 3), streak integer NOT NULL DEFAULT 0 CHECK(streak BETWEEN 0 AND 60),
      coins integer NOT NULL DEFAULT 0 CHECK(coins BETWEEN 0 AND 40), UNIQUE(user_id,request_id)
    )`);
    await runner.query('CREATE UNIQUE INDEX uq_tower_defense_active ON tower_defense_runs(user_id) WHERE settled_at IS NULL');
    await runner.query('CREATE INDEX ix_tower_defense_daily ON tower_defense_runs(settled_at,mode,score DESC) WHERE settled_at IS NOT NULL');
    await runner.query('CREATE INDEX ix_tower_defense_history ON tower_defense_runs(user_id,created_at DESC)');
    await runner.query(`CREATE TABLE tower_defense_daily_awards (
      service_date date NOT NULL, mode varchar(12) NOT NULL, user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      coins integer NOT NULL CHECK(coins BETWEEN 0 AND 12), created_at timestamptz NOT NULL, PRIMARY KEY(service_date,mode)
    )`);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE tower_defense_daily_awards');
    await runner.query('DROP TABLE tower_defense_runs');
    await runner.query('DROP TABLE tower_defense_profiles');
  }
}
