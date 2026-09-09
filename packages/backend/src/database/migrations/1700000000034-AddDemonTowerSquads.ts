import { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive only. Application rollback keeps squads and all existing account assets. */
export class AddDemonTowerSquads1700000000034 implements MigrationInterface {
  name = 'AddDemonTowerSquads1700000000034';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE demon_tower_squads (
      id uuid PRIMARY KEY,
      owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
      floor integer NOT NULL CHECK (floor BETWEEN 1 AND 9),
      status varchar(12) NOT NULL CHECK (status IN ('waiting','active','victory','defeat','closed')),
      state jsonb NOT NULL CHECK (jsonb_typeof(state)='object'),
      expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
      CHECK(expires_at > created_at AND expires_at <= created_at + interval '24 hours')
    )`);
    await runner.query('CREATE INDEX ix_demon_tower_squads_status_created ON demon_tower_squads(status,created_at)');
    await runner.query('CREATE INDEX ix_demon_tower_squads_owner ON demon_tower_squads(owner_id)');
  }
  async down(runner: QueryRunner): Promise<void> { await runner.query('DROP TABLE demon_tower_squads'); }
}
