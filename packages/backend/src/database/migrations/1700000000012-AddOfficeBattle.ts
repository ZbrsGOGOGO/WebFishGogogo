import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Server-authoritative Office Battle state, immutable settlements and ledgers. */
export class AddOfficeBattle1700000000012 implements MigrationInterface {
  name = 'AddOfficeBattle1700000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "office_battle_profiles" (
        "user_id" UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
        "profession" VARCHAR(16) NOT NULL,
        "total_battle_experience" INT NOT NULL DEFAULT 0,
        "wins" INT NOT NULL DEFAULT 0,
        "losses" INT NOT NULL DEFAULT 0,
        "energy" SMALLINT NOT NULL DEFAULT 12,
        "service_date" DATE NOT NULL,
        "parts" INT NOT NULL DEFAULT 0,
        "rewarded_battles_used" SMALLINT NOT NULL DEFAULT 0,
        "rewarded_friend_battles_used" SMALLINT NOT NULL DEFAULT 0,
        "upgrade_protection_used" BOOLEAN NOT NULL DEFAULT false,
        "profile_version" INT NOT NULL DEFAULT 1,
        "loadout_version" INT NOT NULL DEFAULT 1,
        "inventory_version" INT NOT NULL DEFAULT 1,
        "defense_version" INT NOT NULL DEFAULT 1,
        "profession_changed_at" TIMESTAMPTZ,
        "starter_professions" JSONB NOT NULL DEFAULT '[]',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_office_battle_profiles_profession"
          CHECK ("profession" IN ('developer', 'product', 'qa', 'sales', 'hr')),
        CONSTRAINT "chk_office_battle_profiles_energy" CHECK ("energy" BETWEEN 0 AND 12),
        CONSTRAINT "chk_office_battle_profiles_experience"
          CHECK ("total_battle_experience" BETWEEN 0 AND 40120),
        CONSTRAINT "chk_office_battle_profiles_non_negative"
          CHECK ("wins" >= 0 AND "losses" >= 0 AND "parts" >= 0),
        CONSTRAINT "chk_office_battle_profiles_versions"
          CHECK ("profile_version" > 0 AND "loadout_version" > 0
            AND "inventory_version" > 0 AND "defense_version" > 0)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "office_battle_offer_sets" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "seed_hex" VARCHAR(64) NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "consumed_at" TIMESTAMPTZ,
        "consumed_battle_id" UUID,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_office_battle_offer_sets_active"
      ON "office_battle_offer_sets" ("user_id", "expires_at", "consumed_at");
    `);

    await queryRunner.query(`
      CREATE TABLE "office_battle_offers" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "offer_set_id" UUID NOT NULL REFERENCES "office_battle_offer_sets"("id") ON DELETE CASCADE,
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "tier" VARCHAR(16) NOT NULL,
        "opponent_snapshot" JSONB NOT NULL,
        "reward_multiplier_percent" SMALLINT NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_office_battle_offers_tier" UNIQUE ("offer_set_id", "tier"),
        CONSTRAINT "chk_office_battle_offers_tier"
          CHECK ("tier" IN ('simple', 'balanced', 'challenge')),
        CONSTRAINT "chk_office_battle_offers_multiplier"
          CHECK ("reward_multiplier_percent" IN (80, 100, 120))
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_office_battle_offers_expiry"
      ON "office_battle_offers" ("user_id", "expires_at");
    `);

    await queryRunner.query(`
      CREATE TABLE "office_battle_records" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "defender_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "battle_request_id" VARCHAR(100) NOT NULL,
        "request_hash" VARCHAR(64) NOT NULL,
        "mode" VARCHAR(16) NOT NULL,
        "opponent_kind" VARCHAR(16) NOT NULL,
        "offer_id" UUID REFERENCES "office_battle_offers"("id") ON DELETE SET NULL,
        "service_date" DATE NOT NULL,
        "engine_version" VARCHAR(64) NOT NULL,
        "balance_version" VARCHAR(64) NOT NULL,
        "seed_hex" VARCHAR(64) NOT NULL,
        "player_snapshot" JSONB NOT NULL,
        "opponent_snapshot" JSONB NOT NULL,
        "opponent_equipment_visible" BOOLEAN NOT NULL DEFAULT true,
        "player_equipment_visible_to_defender" BOOLEAN NOT NULL DEFAULT true,
        "events" JSONB NOT NULL,
        "winner" VARCHAR(16) NOT NULL,
        "reward_snapshot" JSONB NOT NULL,
        "energy_snapshot" JSONB NOT NULL,
        "profile_version" INT NOT NULL,
        "loadout_version" INT NOT NULL,
        "inventory_version" INT NOT NULL,
        "completed_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_office_battle_records_request" UNIQUE ("user_id", "battle_request_id"),
        CONSTRAINT "chk_office_battle_records_mode" CHECK ("mode" IN ('reward', 'practice')),
        CONSTRAINT "chk_office_battle_records_opponent_kind" CHECK ("opponent_kind" IN ('npc', 'friend')),
        CONSTRAINT "chk_office_battle_records_winner" CHECK ("winner" IN ('player', 'opponent'))
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_office_battle_records_history"
      ON "office_battle_records" ("user_id", "completed_at" DESC, "id" DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_office_battle_records_defender"
      ON "office_battle_records" ("defender_user_id", "completed_at" DESC);
    `);
    await queryRunner.query(`
      ALTER TABLE "office_battle_offer_sets"
      ADD CONSTRAINT "fk_office_battle_offer_sets_consumed_battle"
      FOREIGN KEY ("consumed_battle_id") REFERENCES "office_battle_records"("id") ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE "office_battle_equipment" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "profession" VARCHAR(16) NOT NULL,
        "slot" VARCHAR(16) NOT NULL,
        "name" VARCHAR(120) NOT NULL,
        "required_level" SMALLINT NOT NULL,
        "equipment_level" SMALLINT NOT NULL,
        "rarity" VARCHAR(16) NOT NULL,
        "stats" JSONB NOT NULL,
        "score" INT NOT NULL,
        "locked" BOOLEAN NOT NULL DEFAULT false,
        "starter_bound" BOOLEAN NOT NULL DEFAULT false,
        "enhancement_level" SMALLINT NOT NULL DEFAULT 0,
        "source_battle_id" UUID REFERENCES "office_battle_records"("id") ON DELETE SET NULL,
        "salvaged_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_office_battle_equipment_profession"
          CHECK ("profession" IN ('developer', 'product', 'qa', 'sales', 'hr')),
        CONSTRAINT "chk_office_battle_equipment_slot"
          CHECK ("slot" IN ('weapon', 'head', 'body', 'badge', 'shoes', 'accessory')),
        CONSTRAINT "chk_office_battle_equipment_rarity"
          CHECK ("rarity" IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
        CONSTRAINT "chk_office_battle_equipment_level"
          CHECK ("equipment_level" BETWEEN 1 AND 60 AND "required_level" BETWEEN 1 AND 60),
        CONSTRAINT "chk_office_battle_equipment_enhancement"
          CHECK ("enhancement_level" BETWEEN 0 AND 6)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_office_battle_equipment_inventory"
      ON "office_battle_equipment" ("user_id", "salvaged_at", "created_at" DESC);
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_office_battle_starter_equipment"
      ON "office_battle_equipment" ("user_id", "profession", "slot")
      WHERE "starter_bound" = true;
    `);

    await queryRunner.query(`
      CREATE TABLE "office_battle_loadout_items" (
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "slot" VARCHAR(16) NOT NULL,
        "equipment_id" UUID NOT NULL REFERENCES "office_battle_equipment"("id") ON DELETE RESTRICT,
        PRIMARY KEY ("user_id", "slot"),
        CONSTRAINT "uq_office_battle_loadout_equipment" UNIQUE ("user_id", "equipment_id"),
        CONSTRAINT "chk_office_battle_loadout_slot"
          CHECK ("slot" IN ('weapon', 'head', 'body', 'badge', 'shoes', 'accessory'))
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "office_battle_defense_configs" (
        "user_id" UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
        "profession" VARCHAR(16) NOT NULL,
        "equipment_ids" JSONB NOT NULL,
        "challenge_visibility" VARCHAR(16) NOT NULL DEFAULT 'friends',
        "equipment_visibility" VARCHAR(16) NOT NULL DEFAULT 'friends',
        "version" INT NOT NULL DEFAULT 1,
        CONSTRAINT "chk_office_battle_defense_challenge_visibility"
          CHECK ("challenge_visibility" IN ('friends', 'none')),
        CONSTRAINT "chk_office_battle_defense_equipment_visibility"
          CHECK ("equipment_visibility" IN ('public', 'friends', 'private')),
        CONSTRAINT "chk_office_battle_defense_version" CHECK ("version" > 0)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "office_battle_pending_rewards" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "battle_id" UUID NOT NULL REFERENCES "office_battle_records"("id") ON DELETE CASCADE,
        "equipment_snapshot" JSONB NOT NULL,
        "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
        "resolution_result" JSONB,
        "resolved_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_office_battle_pending_rewards_battle" UNIQUE ("user_id", "battle_id"),
        CONSTRAINT "chk_office_battle_pending_rewards_status"
          CHECK ("status" IN ('pending', 'claimed', 'salvaged'))
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_office_battle_pending_rewards_user"
      ON "office_battle_pending_rewards" ("user_id", "status", "created_at" DESC);
    `);

    await queryRunner.query(`
      CREATE TABLE "office_battle_friend_reward_claims" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "attacker_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "defender_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "service_date" DATE NOT NULL,
        "battle_id" UUID NOT NULL REFERENCES "office_battle_records"("id") ON DELETE CASCADE,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_office_battle_friend_reward_claim"
          UNIQUE ("attacker_user_id", "defender_user_id", "service_date")
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "office_battle_asset_ledger" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "battle_id" UUID REFERENCES "office_battle_records"("id") ON DELETE SET NULL,
        "asset_type" VARCHAR(32) NOT NULL,
        "delta" INT NOT NULL,
        "balance_after" INT NOT NULL,
        "reason" VARCHAR(64) NOT NULL,
        "idempotency_key" VARCHAR(200) NOT NULL UNIQUE,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_office_battle_asset_type"
          CHECK ("asset_type" IN ('energy', 'battle_experience', 'parts'))
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_office_battle_asset_ledger_user"
      ON "office_battle_asset_ledger" ("user_id", "created_at" DESC);
    `);

    await queryRunner.query(`
      CREATE TABLE "office_battle_inventory_ledger" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "equipment_id" UUID REFERENCES "office_battle_equipment"("id") ON DELETE SET NULL,
        "battle_id" UUID REFERENCES "office_battle_records"("id") ON DELETE SET NULL,
        "action" VARCHAR(32) NOT NULL,
        "payload" JSONB NOT NULL,
        "idempotency_key" VARCHAR(200) NOT NULL UNIQUE,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_office_battle_inventory_action"
          CHECK ("action" IN ('create', 'lock', 'equip', 'defense_equip', 'salvage', 'pending', 'claim'))
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_office_battle_inventory_ledger_user"
      ON "office_battle_inventory_ledger" ("user_id", "created_at" DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "office_battle_inventory_ledger";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "office_battle_asset_ledger";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "office_battle_friend_reward_claims";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "office_battle_pending_rewards";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "office_battle_defense_configs";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "office_battle_loadout_items";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "office_battle_equipment";`);
    await queryRunner.query(`ALTER TABLE "office_battle_offer_sets" DROP CONSTRAINT IF EXISTS "fk_office_battle_offer_sets_consumed_battle";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "office_battle_records";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "office_battle_offers";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "office_battle_offer_sets";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "office_battle_profiles";`);
  }
}
