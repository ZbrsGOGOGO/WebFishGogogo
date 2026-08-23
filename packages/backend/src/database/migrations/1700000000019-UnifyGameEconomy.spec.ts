import type { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';

import { createLocalDevDataSource } from '../local-dev-datasource';
import { DeskPlant, User, WalletBalance, WalletLedger } from '../entities';
import { UnifyGameEconomy1700000000019 } from './1700000000019-UnifyGameEconomy';

describe('UnifyGameEconomy1700000000019', () => {
  let dataSource: DataSource;

  beforeEach(async () => { dataSource = await createLocalDevDataSource(); });
  afterEach(async () => { if (dataSource.isInitialized) await dataSource.destroy(); });

  it('round-trips the level and shared energy constraints in pg-mem', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    const migration = new UnifyGameEconomy1700000000019();
    try {
      await migration.down(runner);
      await migration.up(runner);
      await expect(migration.up(runner)).resolves.toBeUndefined();
    } finally {
      await runner.release();
    }
  });

  it('converts farm coins and records the UUID as a textual ledger source', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    const migration = new UnifyGameEconomy1700000000019();
    try {
      await migration.down(runner);
      const user = await dataSource.getRepository(User).save(
        dataSource.getRepository(User).create({
          email: 'economy-migration@example.test',
          emailNormalized: 'economy-migration@example.test',
          passwordHash: 'unused',
          displayName: 'Economy Migration',
          publicId: randomUUID(),
          accountStatus: 'active',
          socialVerificationStatus: 'verified',
          communityRole: 'user',
          emailVerifiedAt: new Date(),
          passwordChangedAt: new Date(),
          onboardingCompleted: true,
        }),
      );
      await dataSource.getRepository(DeskPlant).save(
        dataSource.getRepository(DeskPlant).create({ userId: user.id, farmCoins: 20 }),
      );
      await dataSource.getRepository(WalletBalance).save(
        dataSource.getRepository(WalletBalance).create({
          userId: user.id,
          currency: 'office_coin',
          balance: '10',
        }),
      );

      await migration.up(runner);

      await expect(dataSource.getRepository(DeskPlant).findOneByOrFail({ userId: user.id }))
        .resolves.toMatchObject({ farmCoins: 0 });
      await expect(dataSource.getRepository(WalletBalance).findOneByOrFail({
        userId: user.id,
        currency: 'office_coin',
      })).resolves.toMatchObject({ balance: 15 });
      await expect(dataSource.getRepository(WalletLedger).findOneByOrFail({
        idempotencyKey: `unified-v1-farm-coin:${user.id}`,
      })).resolves.toMatchObject({
        userId: user.id,
        sourceId: user.id,
        delta: 5,
        balanceAfter: 15,
      });
    } finally {
      await runner.release();
    }
  });
});
