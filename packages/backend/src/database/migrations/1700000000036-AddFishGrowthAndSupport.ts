import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFishGrowthAndSupport1700000000036 implements MigrationInterface {
  name = 'AddFishGrowthAndSupport1700000000036';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE community_fish_progress (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      experience integer NOT NULL DEFAULT 0 CHECK (experience >= 0),
      active_seconds integer NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
      game_seconds integer NOT NULL DEFAULT 0 CHECK (game_seconds >= 0 AND game_seconds <= active_seconds),
      service_date varchar(10) NOT NULL,
      daily_active_seconds integer NOT NULL DEFAULT 0 CHECK (daily_active_seconds BETWEEN 0 AND 14400),
      daily_game_seconds integer NOT NULL DEFAULT 0 CHECK (daily_game_seconds >= 0 AND daily_game_seconds <= daily_active_seconds),
      tab_id uuid, sequence integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
      mode varchar(8) NOT NULL DEFAULT 'pause' CHECK (mode IN ('browse','game','pause')),
      last_seen_at timestamptz NOT NULL
    )`);
    await q.query(`CREATE TABLE community_support_ledger (
      id uuid PRIMARY KEY, user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
      order_hash varchar(64) NOT NULL, request_hash varchar(64) NOT NULL, order_hint varchar(8),
      months smallint NOT NULL CHECK (months BETWEEN 1 AND 12),
      amount_fen integer NOT NULL CHECK (amount_fen BETWEEN 1 AND 100000000),
      starts_at timestamptz NOT NULL, expires_at timestamptz NOT NULL CHECK (expires_at > starts_at),
      created_at timestamptz NOT NULL, revoked_at timestamptz,
      revoked_by uuid REFERENCES users(id) ON DELETE SET NULL
    )`);
    await q.query('CREATE UNIQUE INDEX idx_support_order_hash ON community_support_ledger(order_hash)');
    await q.query('CREATE INDEX idx_support_user_expiry ON community_support_ledger(user_id, expires_at)');
  }
  async down(): Promise<void> { throw new Error('Retain growth/support records. Roll back the application, not this data migration.'); }
}
