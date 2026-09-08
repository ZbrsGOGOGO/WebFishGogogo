import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthoritativeGameRooms1700000000027 implements MigrationInterface {
  name = 'AddAuthoritativeGameRooms1700000000027';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE play_rooms (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      creator_id uuid REFERENCES users(id) ON DELETE SET NULL,
      host_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      client_request_id uuid NOT NULL, request_hash varchar(64) NOT NULL,
      game_key varchar(16) NOT NULL CHECK(game_key IN ('snake','tetris','tank','zhesi','draw','undercover')),
      mode varchar(8) NOT NULL CHECK(mode IN ('solo','room')),
      visibility varchar(8) NOT NULL CHECK(visibility IN ('public','invite')),
      title varchar(40) NOT NULL, status varchar(12) NOT NULL CHECK(status IN ('waiting','running','finished','closed')),
      version integer NOT NULL DEFAULT 1 CHECK(version>0), join_code varchar(12) NOT NULL,
      max_players integer NOT NULL CHECK(max_players BETWEEN 1 AND 8), engine_state jsonb,
      created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz,
      expires_at timestamptz NOT NULL, finished_at timestamptz, leaderboard_date date
    );
    CREATE UNIQUE INDEX uq_play_room_client ON play_rooms(creator_id,client_request_id);
    CREATE UNIQUE INDEX uq_play_room_code ON play_rooms(join_code);
    CREATE INDEX idx_play_room_lobby ON play_rooms(status,visibility,created_at);
    CREATE INDEX idx_play_room_expiry ON play_rooms(status,expires_at);`);
    await runner.query(`CREATE TABLE play_room_members (
      room_id uuid NOT NULL REFERENCES play_rooms(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ready boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true,
      last_sequence integer NOT NULL DEFAULT 0 CHECK(last_sequence>=0),
      action_window_at timestamptz, action_window_count integer NOT NULL DEFAULT 0,
      score integer CHECK(score>=0), joined_at timestamptz NOT NULL DEFAULT now(), left_at timestamptz,
      PRIMARY KEY(room_id,user_id)
    );
    CREATE UNIQUE INDEX uq_play_member_active ON play_room_members(user_id) WHERE active=true;
    CREATE INDEX idx_play_member_history ON play_room_members(user_id,joined_at);`);
    await runner.query(`CREATE TABLE play_commands (
      room_id uuid NOT NULL REFERENCES play_rooms(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action_id uuid NOT NULL, sequence integer NOT NULL CHECK(sequence>0),
      request_hash varchar(64) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(room_id,user_id,action_id)
    );
    CREATE UNIQUE INDEX uq_play_command_sequence ON play_commands(room_id,user_id,sequence);`);
    await runner.query(`CREATE TABLE play_daily_scores (
      service_date date NOT NULL,
      game_key varchar(16) NOT NULL CHECK(game_key IN ('snake','tetris','tank','zhesi','draw','undercover')),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      score integer NOT NULL CHECK(score>0), mode varchar(8) NOT NULL CHECK(mode IN ('solo','room')),
      room_id uuid REFERENCES play_rooms(id) ON DELETE SET NULL,
      achieved_at timestamptz NOT NULL,
      PRIMARY KEY(service_date,game_key,user_id)
    );
    CREATE INDEX idx_play_daily_ranking ON play_daily_scores(service_date,game_key,score DESC,achieved_at,user_id);`);
    await runner.query(`CREATE TABLE play_daily_awards (
      service_date date NOT NULL,
      game_key varchar(16) NOT NULL CHECK(game_key IN ('snake','tetris','tank','zhesi','draw','undercover')),
      winner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      score integer NOT NULL CHECK(score>=0), coins integer NOT NULL CHECK(coins>=0 AND coins<=100),
      awarded_at timestamptz NOT NULL, PRIMARY KEY(service_date,game_key)
    );`);
  }
  async down(runner: QueryRunner): Promise<void> {
    // Test/disposable rollback only. Production app rollback keeps these tables and earned currency.
    for (const name of ['play_daily_awards', 'play_daily_scores', 'play_commands', 'play_room_members', 'play_rooms']) {
      await runner.query(`DROP TABLE "${name}"`);
    }
  }
}
