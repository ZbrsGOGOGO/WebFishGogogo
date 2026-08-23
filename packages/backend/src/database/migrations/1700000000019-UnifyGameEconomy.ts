import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes player_progression, energy_states and office_coin the shared game truth.
 * Legacy farm/battle columns remain as compatibility mirrors until all clients
 * have moved to the unified API.
 */
export class UnifyGameEconomy1700000000019 implements MigrationInterface {
  name = 'UnifyGameEconomy1700000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "player_progression"
        DROP CONSTRAINT "chk_player_progression_level";
    `);
    await queryRunner.query(`
      UPDATE "player_progression"
      SET "experience" = LEAST("experience", 40120),
          "level" = LEAST("level", 60);
    `);
    const battleProgress = await queryRunner.query(`
      SELECT "user_id", "total_battle_experience"
      FROM "office_battle_profiles";
    `) as Array<{ user_id: string; total_battle_experience: string | number }>;
    for (const row of battleProgress) {
      const experience = Math.min(40120, Math.max(0, Number(row.total_battle_experience)));
      await queryRunner.query(`
        UPDATE "player_progression"
        SET "experience" = GREATEST("experience", $1)
        WHERE "user_id" = $2;
      `, [experience, row.user_id]);
    }
    await queryRunner.query(`
      ALTER TABLE "player_progression"
        ADD CONSTRAINT "chk_player_progression_level"
          CHECK ("level" BETWEEN 1 AND 60);
    `);

    await queryRunner.query(`
      ALTER TABLE "energy_states"
        DROP CONSTRAINT "chk_energy_state_balance",
        DROP CONSTRAINT "chk_energy_state_capacity";
    `);
    await queryRunner.query(`
      ALTER TABLE "energy_states"
        ALTER COLUMN "balance" SET DEFAULT 120,
        ALTER COLUMN "capacity" SET DEFAULT 120;
    `);
    await queryRunner.query(`
      UPDATE "energy_states"
      SET "balance" = 120,
          "capacity" = 120,
          "last_recovered_at" = now();
    `);
    await queryRunner.query(`
      ALTER TABLE "energy_states"
        ADD CONSTRAINT "chk_energy_state_capacity" CHECK ("capacity" = 120),
        ADD CONSTRAINT "chk_energy_state_balance"
          CHECK ("balance" BETWEEN 0 AND "capacity");
    `);

    // Old farm coins were much easier to mint. Convert once at 4:1 and write
    // the corresponding immutable office-coin ledger before clearing them.
    const farmBalances = await queryRunner.query(`
      SELECT "user_id", "farm_coins" FROM "desk_plants";
    `) as Array<{ user_id: string; farm_coins: string | number }>;
    for (const row of farmBalances) {
      const delta = BigInt(row.farm_coins) / 4n;
      if (delta <= 0n) continue;
      await queryRunner.query(`
        UPDATE "wallet_balances"
        SET "balance" = "balance" + $1
        WHERE "user_id" = $2 AND "currency" = 'office_coin';
      `, [delta.toString(), row.user_id]);
      const balances = await queryRunner.query(`
        SELECT "balance" FROM "wallet_balances"
        WHERE "user_id" = $1 AND "currency" = 'office_coin';
      `, [row.user_id]) as Array<{ balance: string | number }>;
      await queryRunner.query(`
        INSERT INTO "wallet_ledger" (
          "user_id", "currency", "delta", "balance_after", "source_type",
          "source_id", "reason", "idempotency_key"
        ) VALUES ($1, 'office_coin', $2, $3, 'economy_migration', $1,
          'farm-coins-to-office-coins-4-to-1', $4)
        ON CONFLICT ("idempotency_key") DO NOTHING;
      `, [row.user_id, delta.toString(), String(balances[0]?.balance ?? delta), `unified-v1-farm-coin:${row.user_id}`]);
    }
    await queryRunner.query(`UPDATE "desk_plants" SET "farm_coins" = 0;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const converted = await queryRunner.query(`
      SELECT "user_id", "delta", "idempotency_key"
      FROM "wallet_ledger"
      WHERE "idempotency_key" LIKE 'unified-v1-farm-coin:%';
    `) as Array<{ user_id: string; delta: string | number; idempotency_key: string }>;
    for (const row of converted) {
      const delta = BigInt(row.delta);
      await queryRunner.query(`
        UPDATE "desk_plants"
        SET "farm_coins" = "farm_coins" + $1
        WHERE "user_id" = $2;
      `, [(delta * 4n).toString(), row.user_id]);
      await queryRunner.query(`
        UPDATE "wallet_balances"
        SET "balance" = "balance" - $1
        WHERE "user_id" = $2 AND "currency" = 'office_coin';
      `, [delta.toString(), row.user_id]);
    }
    await queryRunner.query(`
      DELETE FROM "wallet_ledger"
      WHERE "idempotency_key" LIKE 'unified-v1-farm-coin:%';
    `);

    await queryRunner.query(`
      ALTER TABLE "energy_states"
        DROP CONSTRAINT "chk_energy_state_balance",
        DROP CONSTRAINT "chk_energy_state_capacity";
    `);
    await queryRunner.query(`
      UPDATE "energy_states"
      SET "balance" = LEAST("balance", 15), "capacity" = 15;
    `);
    await queryRunner.query(`
      ALTER TABLE "energy_states"
        ALTER COLUMN "balance" SET DEFAULT 10,
        ALTER COLUMN "capacity" SET DEFAULT 15,
        ADD CONSTRAINT "chk_energy_state_capacity" CHECK ("capacity" > 0),
        ADD CONSTRAINT "chk_energy_state_balance"
          CHECK ("balance" BETWEEN 0 AND "capacity");
    `);

    await queryRunner.query(`
      ALTER TABLE "player_progression"
        DROP CONSTRAINT "chk_player_progression_level";
    `);
    await queryRunner.query(`
      ALTER TABLE "player_progression"
        ADD CONSTRAINT "chk_player_progression_level"
          CHECK ("level" BETWEEN 1 AND 100);
    `);
  }
}
