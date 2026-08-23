import { UnauthorizedException } from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  EntityTarget,
  FindManyOptions,
  FindOneOptions,
  ObjectLiteral,
  Repository,
} from 'typeorm';

import { Checkin } from '../../database/entities/checkin.entity';
import { EnergyState } from '../../database/entities/energy-state.entity';
import { PlayerProfile } from '../../database/entities/player-profile.entity';
import { PlayerProgression } from '../../database/entities/player-progression.entity';
import { RewardGrant } from '../../database/entities/reward-grant.entity';
import { User } from '../../database/entities/user.entity';
import { WalletBalance } from '../../database/entities/wallet-balance.entity';
import { WalletLedger } from '../../database/entities/wallet-ledger.entity';
import type { OutboxService } from '../outbox';
import {
  DAILY_CHECKIN_EXP_REWARD,
  DAILY_CHECKIN_OFFICE_COIN_REWARD,
  PlatformClock,
} from './platform.constants';
import { PlatformAssetsService } from './platform-assets.service';
import { PlatformService } from './platform.service';

type EntityConstructor<T extends ObjectLiteral> = new () => T;

/**
 * 轻量事务内存库：只实现 PlatformService 使用到的 Repository 方法。
 * 所有实体写入都必须经 FakeDataSource.transaction 提供的 manager。
 */
class InMemoryEntityStore {
  private readonly rows = new Map<Function, ObjectLiteral[]>();
  private idSequence = 0;

  seed<T extends ObjectLiteral>(target: EntityConstructor<T>, entity: T): void {
    this.collection(target).push(entity);
  }

  all<T extends ObjectLiteral>(target: EntityConstructor<T>): T[] {
    return [...this.collection(target)] as T[];
  }

  repository<T extends ObjectLiteral>(
    target: EntityConstructor<T>,
  ): Repository<T> {
    const store = this;
    const repository = {
      create(input: Partial<T>): T {
        return Object.assign(new target(), input);
      },

      async findOne(options: FindOneOptions<T>): Promise<T | null> {
        const where = (options.where ?? {}) as Record<string, unknown>;
        return (
          (store
            .collection(target)
            .find((row) => matches(row, where)) as T | undefined) ?? null
        );
      },

      async find(options?: FindManyOptions<T>): Promise<T[]> {
        const where = (options?.where ?? {}) as Record<string, unknown>;
        return store
          .collection(target)
          .filter((row) => matches(row, where)) as T[];
      },

      async exist(options: FindManyOptions<T>): Promise<boolean> {
        const where = (options.where ?? {}) as Record<string, unknown>;
        return store.collection(target).some((row) => matches(row, where));
      },

      async save(input: T | T[]): Promise<T | T[]> {
        if (Array.isArray(input)) {
          for (const entity of input) {
            store.persist(target, entity);
          }
          return input;
        }
        store.persist(target, input);
        return input;
      },
    };
    return repository as unknown as Repository<T>;
  }

  private collection<T extends ObjectLiteral>(
    target: EntityConstructor<T>,
  ): ObjectLiteral[] {
    let rows = this.rows.get(target);
    if (!rows) {
      rows = [];
      this.rows.set(target, rows);
    }
    return rows;
  }

  private persist<T extends ObjectLiteral>(
    target: EntityConstructor<T>,
    entity: T,
  ): void {
    const mutable = entity as Record<string, unknown>;
    if ('id' in mutable && !mutable.id) {
      this.idSequence += 1;
      mutable.id = `generated-${this.idSequence}`;
    }
    if ('version' in mutable && !mutable.version) {
      mutable.version = 1;
    }
    const now = new Date('2026-07-24T00:00:00.000Z');
    if ('createdAt' in mutable && !mutable.createdAt) {
      mutable.createdAt = now;
    }
    if ('updatedAt' in mutable) {
      mutable.updatedAt = now;
    }

    const rows = this.collection(target);
    if (!rows.includes(entity)) {
      rows.push(entity);
    }
  }
}

class FakeEntityManager {
  constructor(private readonly store: InMemoryEntityStore) {}

  getRepository<T extends ObjectLiteral>(
    target: EntityTarget<T>,
  ): Repository<T> {
    return this.store.repository(
      target as EntityConstructor<T>,
    );
  }
}

class FakeDataSource {
  transactionCalls = 0;

  constructor(private readonly manager: FakeEntityManager) {}

  async transaction<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    this.transactionCalls += 1;
    return work(this.manager as unknown as EntityManager);
  }
}

class MutableClock implements PlatformClock {
  constructor(private instant: Date) {}

  now(): Date {
    return new Date(this.instant);
  }

  set(iso: string): void {
    this.instant = new Date(iso);
  }
}

function matches(
  row: ObjectLiteral,
  where: Record<string, unknown>,
): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function createFixture(now = '2026-07-23T16:30:00.000Z'): {
  service: PlatformService;
  store: InMemoryEntityStore;
  dataSource: FakeDataSource;
  clock: MutableClock;
  userId: string;
} {
  const store = new InMemoryEntityStore();
  const user = new User();
  user.id = 'user-1';
  user.email = 'user@example.com';
  user.passwordHash = 'hash';
  user.displayName = '测试用户';
  user.createdAt = new Date();
  user.updatedAt = new Date();
  store.seed(User, user);

  const manager = new FakeEntityManager(store);
  const dataSource = new FakeDataSource(manager);
  const clock = new MutableClock(new Date(now));
  const assets = new PlatformAssetsService(clock);
  const outbox = {
    enqueue: jest.fn().mockResolvedValue(undefined),
  } as unknown as OutboxService;
  const service = new PlatformService(
    dataSource as unknown as DataSource,
    clock,
    assets,
    outbox,
  );
  return { service, store, dataSource, clock, userId: user.id };
}

describe('PlatformService', () => {
  it('initializes and returns the exact overview contract', async () => {
    const { service, dataSource, userId } = createFixture();

    const overview = await service.getOverview(userId);

    expect(overview).toEqual({
      serverTime: '2026-07-23T16:30:00.000Z',
      profile: {
        level: 1,
        exp: 0,
        expToNextLevel: 100,
        title: '初入工位',
        energy: 120,
        energyCap: 120,
      },
      balances: {
        officeCoin: 500,
      },
      checkin: { checkedInToday: false },
    });
    expect(dataSource.transactionCalls).toBe(1);
  });

  it('grants +10 EXP and +50 office coins with receipt and ledger in one transaction', async () => {
    const { service, store, dataSource, userId } = createFixture();

    const result = await service.checkinToday(userId);
    const overview = await service.getOverview(userId);

    expect(result).toMatchObject({
      checkedInToday: true,
      alreadyCheckedIn: false,
      localDate: '2026-07-24',
      reward: {
        exp: DAILY_CHECKIN_EXP_REWARD,
        officeCoin: DAILY_CHECKIN_OFFICE_COIN_REWARD,
      },
    });
    expect(overview.profile.exp).toBe(10);
    expect(overview.balances.officeCoin).toBe(550);
    expect(overview.checkin.checkedInToday).toBe(true);

    const grants = store.all(RewardGrant);
    expect(grants).toHaveLength(1);
    expect(grants[0].rewardSnapshot).toEqual({
      experience: 10,
      currencies: { office_coin: 50 },
    });

    const ledger = store.all(WalletLedger);
    expect(ledger).toHaveLength(2);
    expect(ledger[1]).toMatchObject({
      userId,
      currency: 'office_coin',
      delta: '50',
      balanceAfter: '550',
      sourceType: 'checkin',
      sourceId: '2026-07-24',
    });
    expect(store.all(Checkin)).toHaveLength(1);
    // 一次签到事务 + 一次 overview 事务。
    expect(dataSource.transactionCalls).toBe(2);
  });

  it('is idempotent within the same Asia/Shanghai local date', async () => {
    const { service, store, userId } = createFixture();

    const first = await service.checkinToday(userId);
    const repeated = await service.checkinToday(userId);
    const overview = await service.getOverview(userId);

    expect(repeated.alreadyCheckedIn).toBe(true);
    expect(repeated.rewardGrantId).toBe(first.rewardGrantId);
    expect(overview.profile.exp).toBe(10);
    expect(overview.balances.officeCoin).toBe(550);
    expect(store.all(Checkin)).toHaveLength(1);
    expect(store.all(RewardGrant)).toHaveLength(1);
    expect(store.all(WalletLedger)).toHaveLength(2);
  });

  it('allows a new grant after the Shanghai day boundary', async () => {
    const { service, store, clock, userId } = createFixture(
      '2026-07-23T15:59:59.000Z',
    );
    await service.checkinToday(userId);

    clock.set('2026-07-23T16:00:00.000Z');
    const second = await service.checkinToday(userId);
    const overview = await service.getOverview(userId);

    expect(second.localDate).toBe('2026-07-24');
    expect(second.alreadyCheckedIn).toBe(false);
    expect(overview.profile.exp).toBe(20);
    expect(overview.balances.officeCoin).toBe(600);
    expect(store.all(Checkin)).toHaveLength(2);
    expect(store.all(RewardGrant)).toHaveLength(2);
    expect(store.all(WalletLedger)).toHaveLength(3);
  });

  it('rejects a JWT subject that no longer maps to an active user', async () => {
    const { service } = createFixture();

    await expect(service.getOverview('deleted-user')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('persists all baseline entity types lazily for existing users', async () => {
    const { service, store, userId } = createFixture();
    await service.getOverview(userId);

    expect(store.all(PlayerProfile)).toHaveLength(1);
    expect(store.all(PlayerProgression)).toHaveLength(1);
    expect(store.all(EnergyState)).toHaveLength(1);
    expect(store.all(WalletBalance)).toHaveLength(7);
    expect(store.all(WalletBalance)).toContainEqual(
      expect.objectContaining({ userId, currency: 'invite_coin', balance: '0' }),
    );
  });

  it('recovers one shared energy every ten minutes without a background timer', async () => {
    const { service, store, clock, userId } = createFixture();
    await service.getOverview(userId);
    const energy = store.all(EnergyState)[0];
    energy.balance = 100;
    energy.lastRecoveredAt = new Date('2026-07-23T16:30:00.000Z');

    clock.set('2026-07-23T16:55:00.000Z');
    const overview = await service.getOverview(userId);

    expect(overview.profile.energy).toBe(102);
    expect(energy.lastRecoveredAt.toISOString()).toBe('2026-07-23T16:50:00.000Z');
  });
});
