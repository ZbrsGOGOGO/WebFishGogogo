import { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive. Production application rollback retains this table; down is isolated rehearsal only. */
export class AddDemonTowerAutoExplore1700000000032 implements MigrationInterface {
  name = 'AddDemonTowerAutoExplore1700000000032';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE demon_tower_auto_runs (
      id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      origin_auth_session_id uuid REFERENCES auth_sessions(id) ON DELETE SET NULL,
      start_request_id uuid NOT NULL, request_hash varchar(64) NOT NULL,
      version integer NOT NULL DEFAULT 1 CHECK(version>0),
      status varchar(12) NOT NULL CHECK(status IN ('running','completed','stopped')),
      stop_reason varchar(32), service_date date NOT NULL, floor integer NOT NULL CHECK(floor BETWEEN 1 AND 9),
      max_explorations integer NOT NULL CHECK(max_explorations BETWEEN 1 AND 20),
      started_explorations integer NOT NULL DEFAULT 0 CHECK(started_explorations BETWEEN 0 AND max_explorations),
      completed_explorations integer NOT NULL DEFAULT 0 CHECK(completed_explorations BETWEEN 0 AND started_explorations),
      steps integer NOT NULL DEFAULT 0 CHECK(steps BETWEEN 0 AND 260),
      expected_profile_version integer NOT NULL CHECK(expected_profile_version>0),
      office_coins_granted integer NOT NULL DEFAULT 0 CHECK(office_coins_granted BETWEEN 0 AND 200),
      failure_count integer NOT NULL DEFAULT 0 CHECK(failure_count BETWEEN 0 AND 3),
      next_step_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, stopped_at timestamptz,
      CHECK(expires_at>created_at AND expires_at<=created_at+interval '15 minutes'),
      CHECK((status='running' AND stop_reason IS NULL AND stopped_at IS NULL) OR (status<>'running' AND stop_reason IS NOT NULL AND stopped_at IS NOT NULL))
    )`);
    await queryRunner.query("CREATE UNIQUE INDEX uq_demon_tower_auto_active_user ON demon_tower_auto_runs(user_id) WHERE status='running'");
    await queryRunner.query('CREATE UNIQUE INDEX uq_demon_tower_auto_start_request ON demon_tower_auto_runs(user_id,start_request_id)');
    await queryRunner.query('CREATE INDEX ix_demon_tower_auto_due ON demon_tower_auto_runs(status,next_step_at)');
    await queryRunner.query('CREATE INDEX ix_demon_tower_auto_user_created ON demon_tower_auto_runs(user_id,created_at)');
  }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.query('DROP TABLE demon_tower_auto_runs'); }
}
