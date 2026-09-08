import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive only. Existing invite rooms and all existing account/game data remain untouched. */
export class AddRailRoomsAndPasswords1700000000029 implements MigrationInterface {
  name = 'AddRailRoomsAndPasswords1700000000029';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE play_rooms ADD COLUMN password_hash varchar(255);`);
    await runner.query(`CREATE TABLE rail_rooms (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      creator_id uuid REFERENCES users(id) ON DELETE SET NULL,
      host_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      client_request_id uuid NOT NULL, request_hash varchar(64) NOT NULL,
      mode varchar(8) NOT NULL CHECK (mode IN ('practice','room')),
      title varchar(40) NOT NULL,
      status varchar(12) NOT NULL CHECK (status IN ('waiting','running','finished','closed')),
      version integer NOT NULL DEFAULT 1 CHECK (version > 0),
      password_hash varchar(255),
      max_players integer NOT NULL CHECK (max_players BETWEEN 3 AND 9),
      bot_count integer NOT NULL DEFAULT 0 CHECK (bot_count BETWEEN 0 AND 8 AND bot_count < max_players),
      engine_state jsonb, ranking_eligible boolean NOT NULL DEFAULT false,
      latest_chat_sequence integer NOT NULL DEFAULT 0 CHECK (latest_chat_sequence >= 0),
      created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz,
      expires_at timestamptz NOT NULL, finished_at timestamptz, leaderboard_date date,
      CONSTRAINT uq_rail_room_client UNIQUE (creator_id, client_request_id)
    );`);
    await runner.query(`CREATE INDEX idx_rail_rooms_lobby ON rail_rooms (mode,status,created_at DESC);`);
    await runner.query(`CREATE INDEX idx_rail_rooms_expiry ON rail_rooms (status,expires_at);`);
    await runner.query(`CREATE TABLE rail_room_members (
      room_id uuid NOT NULL REFERENCES rail_rooms(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role varchar(12) NOT NULL CHECK (role IN ('participant','spectator')),
      ready boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true,
      last_sequence integer NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
      action_window_at timestamptz, action_window_count integer NOT NULL DEFAULT 0 CHECK (action_window_count >= 0),
      joined_at timestamptz NOT NULL DEFAULT now(), left_at timestamptz,
      PRIMARY KEY (room_id,user_id)
    );`);
    await runner.query(`CREATE UNIQUE INDEX uq_rail_member_active ON rail_room_members (user_id) WHERE active = true;`);
    await runner.query(`CREATE TABLE rail_commands (
      room_id uuid NOT NULL REFERENCES rail_rooms(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action_id uuid NOT NULL, sequence integer NOT NULL CHECK (sequence > 0),
      request_hash varchar(64) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (room_id,user_id,action_id), CONSTRAINT uq_rail_command_sequence UNIQUE (room_id,user_id,sequence)
    );`);
    await runner.query(`CREATE TABLE rail_chat_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id uuid NOT NULL REFERENCES rail_rooms(id) ON DELETE CASCADE,
      author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_message_id uuid NOT NULL, request_hash varchar(64) NOT NULL,
      sequence integer NOT NULL CHECK (sequence > 0),
      channel varchar(12) NOT NULL CHECK (channel IN ('player','spectator')),
      body varchar(600) NOT NULL,
      status varchar(12) NOT NULL CHECK (status IN ('visible','withdrawn')),
      created_at timestamptz NOT NULL DEFAULT now(), withdrawn_at timestamptz,
      CONSTRAINT uq_rail_chat_client UNIQUE (room_id,author_id,client_message_id),
      CONSTRAINT uq_rail_chat_sequence UNIQUE (room_id,sequence)
    );`);
    await runner.query(`CREATE INDEX idx_rail_chat_author_time ON rail_chat_messages (author_id,created_at DESC);`);
    await runner.query(`CREATE TABLE rail_daily_scores (
      service_date date NOT NULL, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rate_basis_points integer NOT NULL CHECK (rate_basis_points BETWEEN 1 AND 10000),
      survived integer NOT NULL CHECK (survived BETWEEN 1 AND 8),
      eligible_rounds integer NOT NULL CHECK (eligible_rounds BETWEEN 2 AND 8 AND survived <= eligible_rounds),
      demon_total integer NOT NULL CHECK (demon_total BETWEEN 0 AND 80),
      room_id uuid REFERENCES rail_rooms(id) ON DELETE SET NULL, achieved_at timestamptz NOT NULL,
      PRIMARY KEY (service_date,user_id)
    );`);
    await runner.query(`CREATE INDEX idx_rail_daily_ranking ON rail_daily_scores (service_date,rate_basis_points DESC,achieved_at,user_id);`);
    await runner.query(`CREATE TABLE rail_daily_awards (
      service_date date PRIMARY KEY, winner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      rate_basis_points integer NOT NULL CHECK (rate_basis_points BETWEEN 0 AND 10000),
      coins integer NOT NULL CHECK (coins IN (0,100)), awarded_at timestamptz NOT NULL
    );`);
    await runner.query(`CREATE TABLE rail_player_stats (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      completed_games integer NOT NULL DEFAULT 0 CHECK (completed_games >= 0),
      survived integer NOT NULL DEFAULT 0 CHECK (survived >= 0),
      eligible_rounds integer NOT NULL DEFAULT 0 CHECK (eligible_rounds >= survived),
      demon_total integer NOT NULL DEFAULT 0 CHECK (demon_total >= 0),
      demon_mvp_count integer NOT NULL DEFAULT 0 CHECK (demon_mvp_count >= 0 AND demon_mvp_count <= completed_games),
      ranked_games integer NOT NULL DEFAULT 0 CHECK (ranked_games >= 0 AND ranked_games <= completed_games)
    );`);
  }

  async down(runner: QueryRunner): Promise<void> {
    // Destructive down is for an isolated rehearsal only. Production application rollback keeps these tables.
    for (const table of ['rail_player_stats', 'rail_daily_awards', 'rail_daily_scores', 'rail_chat_messages', 'rail_commands', 'rail_room_members', 'rail_rooms']) {
      await runner.query(`DROP TABLE ${table};`);
    }
    await runner.query(`ALTER TABLE play_rooms DROP COLUMN password_hash;`);
  }
}
