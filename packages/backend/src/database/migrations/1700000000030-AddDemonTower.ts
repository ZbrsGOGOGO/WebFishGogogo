import { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive only. Production application rollback keeps these saves; down is for isolated rehearsals. */
export class AddDemonTower1700000000030 implements MigrationInterface {
  name = 'AddDemonTower1700000000030';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE demon_tower_profiles (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      version integer NOT NULL DEFAULT 1 CHECK (version > 0),
      state jsonb NOT NULL,
      action_window_at timestamptz,
      action_window_count integer NOT NULL DEFAULT 0 CHECK (action_window_count BETWEEN 0 AND 6),
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    )`);
    await queryRunner.query(`CREATE TABLE demon_tower_world_floors (
      floor integer PRIMARY KEY CHECK (floor BETWEEN 1 AND 9),
      boss_hp integer NOT NULL CHECK (boss_hp >= 0),
      boss_max_hp integer NOT NULL CHECK (boss_max_hp > 0 AND boss_hp <= boss_max_hp),
      passage_progress integer NOT NULL DEFAULT 0 CHECK (passage_progress >= 0),
      passage_required integer NOT NULL CHECK (passage_required > 0 AND passage_progress <= passage_required),
      version integer NOT NULL DEFAULT 1 CHECK (version > 0),
      unlocked_at timestamptz,
      defeated_at timestamptz,
      completed_at timestamptz,
      updated_at timestamptz NOT NULL,
      CHECK ((defeated_at IS NULL AND boss_hp > 0) OR (defeated_at IS NOT NULL AND boss_hp = 0)),
      CHECK (passage_progress = 0 OR boss_hp = 0),
      CHECK ((completed_at IS NULL AND passage_progress < passage_required) OR (completed_at IS NOT NULL AND boss_hp = 0 AND passage_progress = passage_required)),
      CHECK (unlocked_at IS NOT NULL OR (boss_hp = boss_max_hp AND passage_progress = 0 AND defeated_at IS NULL AND completed_at IS NULL))
    )`);
    await queryRunner.query(`CREATE TABLE demon_tower_commands (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_id uuid NOT NULL,
      kind varchar(24) NOT NULL,
      request_hash varchar(64) NOT NULL,
      expected_version integer NOT NULL CHECK (expected_version >= 0),
      applied_version integer NOT NULL CHECK (applied_version = expected_version + 1),
      receipt jsonb NOT NULL,
      created_at timestamptz NOT NULL,
      PRIMARY KEY (user_id, request_id)
    )`);
    await queryRunner.query('CREATE INDEX ix_demon_tower_commands_user_created ON demon_tower_commands(user_id, created_at)');
    await queryRunner.query(`CREATE TABLE demon_tower_contributions (
      floor integer NOT NULL REFERENCES demon_tower_world_floors(floor) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      boss_damage integer NOT NULL DEFAULT 0 CHECK (boss_damage >= 0),
      passage_contribution integer NOT NULL DEFAULT 0 CHECK (passage_contribution >= 0),
      level integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 120),
      updated_at timestamptz NOT NULL,
      PRIMARY KEY (floor, user_id)
    )`);
    await queryRunner.query(`CREATE TABLE demon_tower_daily_progress (
      service_date date NOT NULL,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      office_coins integer NOT NULL DEFAULT 0 CHECK (office_coins BETWEEN 0 AND 200),
      boss_damage integer NOT NULL DEFAULT 0 CHECK (boss_damage >= 0),
      passage_contribution integer NOT NULL DEFAULT 0 CHECK (passage_contribution >= 0),
      boss_attempts integer NOT NULL DEFAULT 0 CHECK (boss_attempts BETWEEN 0 AND 3),
      action_count integer NOT NULL DEFAULT 0 CHECK (action_count BETWEEN 0 AND 2000),
      level integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 120),
      achieved_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      PRIMARY KEY (service_date, user_id)
    )`);
    await queryRunner.query('CREATE INDEX ix_demon_tower_daily_rank ON demon_tower_daily_progress(service_date, boss_damage DESC, achieved_at, user_id)');
    await queryRunner.query(`CREATE TABLE demon_tower_daily_awards (
      service_date date PRIMARY KEY,
      winner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      boss_damage integer NOT NULL DEFAULT 0 CHECK (boss_damage >= 0),
      coins integer NOT NULL DEFAULT 0 CHECK (coins IN (0, 100)),
      awarded_at timestamptz NOT NULL
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['demon_tower_daily_awards', 'demon_tower_daily_progress', 'demon_tower_contributions', 'demon_tower_commands', 'demon_tower_world_floors', 'demon_tower_profiles']) {
      await queryRunner.query(`DROP TABLE ${table}`);
    }
  }
}
