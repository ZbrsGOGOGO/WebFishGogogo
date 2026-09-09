import { MigrationInterface, QueryRunner } from 'typeorm';
/** Additive tables only; application rollback keeps UGC and free collection progress. */
export class AddOfficeHub1700000000035 implements MigrationInterface {
    name = 'AddOfficeHub1700000000035';
    async up(q: QueryRunner): Promise<void> {
        await q.query(`CREATE TABLE office_hub_profiles (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`);
        await q.query(`CREATE TABLE office_hub_receipts (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, request_id uuid NOT NULL,
      request_hash varchar(64) NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(user_id,request_id)
    )`);
        await q.query('CREATE INDEX ix_office_receipts_created ON office_hub_receipts(created_at)');
        await q.query(`CREATE TABLE office_hub_posts (
      id uuid PRIMARY KEY, author_id uuid REFERENCES users(id) ON DELETE SET NULL,
      kind varchar(12) NOT NULL CHECK(kind IN ('story','drawing','spy')), state jsonb NOT NULL,
      hidden boolean NOT NULL DEFAULT false, reports jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`);
        await q.query('CREATE INDEX ix_office_posts_kind_created ON office_hub_posts(kind,created_at DESC)');
        await q.query('CREATE INDEX ix_office_posts_author ON office_hub_posts(author_id)');
        await q.query(`CREATE TABLE office_hub_social_awards (
      user_id uuid NOT NULL, source varchar(160) NOT NULL,
      points integer NOT NULL CHECK(points BETWEEN 1 AND 20), claimed boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,source)
    )`);
        await q.query(`CREATE TABLE office_hub_tower_events (
      run_id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      guild_id uuid REFERENCES guilds(id) ON DELETE SET NULL, week date NOT NULL,
      waves integer NOT NULL CHECK(waves BETWEEN 0 AND 1000), score integer NOT NULL CHECK(score>=0),
      stars integer NOT NULL CHECK(stars BETWEEN 0 AND 3), streak integer NOT NULL CHECK(streak>=0),
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
        await q.query('CREATE INDEX ix_office_tower_week ON office_hub_tower_events(guild_id,week,user_id)');
        await q.query(`CREATE TABLE office_hub_departments (
      guild_id uuid PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
      announcement varchar(300) NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    }
    async down(q: QueryRunner): Promise<void> {
        for (const table of ['office_hub_departments', 'office_hub_tower_events', 'office_hub_social_awards', 'office_hub_posts', 'office_hub_receipts', 'office_hub_profiles'])
            await q.query(`DROP TABLE ${table}`);
    }
}
