import { ConflictException } from '@nestjs/common';
import {
  EntityManager,
  EntityTarget,
  FindManyOptions,
  FindOneOptions,
  ObjectLiteral,
  Repository,
} from 'typeorm';

import { EnergyState } from '../../database/entities/energy-state.entity';
import { InventoryLedger } from '../../database/entities/inventory-ledger.entity';
import { InventoryStack } from '../../database/entities/inventory-stack.entity';
import { ItemDefinition } from '../../database/entities/item-definition.entity';
import { PlayerProgression } from '../../database/entities/player-progression.entity';
import { RewardGrant } from '../../database/entities/reward-grant.entity';
import { User } from '../../database/entities/user.entity';
import { WalletBalance } from '../../database/entities/wallet-balance.entity';
import { WalletLedger } from '../../database/entities/wallet-ledger.entity';
import { PlatformClock } from './platform.constants';
import {
  AssetMutationContext,
  PlatformAssetsService,
} from './platform-assets.service';

type EntityConstructor<T extends ObjectLiteral> = new () => T;

class AssetTestStore {
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
    return {
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
      async save(entity: T): Promise<T> {
        store.persist(target, entity);
        return entity;
      },
    } as unknown as Repository<T>;
  }

  private collection<T extends ObjectLiteral>(
    target: EntityConstructor<T>,
  ): ObjectLiteral[] {
    let result = this.rows.get(target);
    if (!result) {
      result = [];
      this.rows.set(target, result);
    }
    return result;
  }

  private persist<T extends ObjectLiteral>(
    target: EntityConstructor<T>,
    entity: T,
  ): void {
    const mutable = entity as Record<string, unknown>;
    const entityClass = target as Function;
    if (
      (entityClass === RewardGrant ||
        entityClass === WalletLedger ||
        entityClass === InventoryLedger) &&
      !mutable.id
    ) {
      this.idSequence += 1;
      mutable.id = `generated-${this.idSequence}`;
    }
    if (
      (entityClass === PlayerProgression ||
        entityClass === EnergyState ||
        entityClass === WalletBalance ||
        entityClass === InventoryStack) &&
      !mutable.version
    ) {
      mutable.version = 1;
    }
    const rows = this.collection(target);
    if (!rows.includes(entity)) {
      rows.push(entity);
    }
  }
}

class AssetTestManager {
  constructor(private readonly store: AssetTestStore) {}

  getRepository<T extends ObjectLiteral>(
    target: EntityTarget<T>,
  ): Repository<T> {
    return this.store.repository(target as EntityConstructor<T>);
  }
}

const fixedClock: PlatformClock = {
  now: () => new Date('2026-07-24T04:00:00.000Z'),
};

function matches(
  row: ObjectLiteral,
  where: Record<string, unknown>,
): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function item(
  id: string,
  slug: string,
  stackable = true,
): ItemDefinition {
  const definition = new ItemDefinition();
  definition.id = id;
  definition.slug = slug;
  definition.name = slug;
  definition.category = 'seed';
  definition.stackable = stackable;
  definition.metadata = {};
  definition.enabled = true;
  definition.createdAt = new Date();
  definition.updatedAt = new Date();
  return definition;
}

function fixture(): {
  assets: PlatformAssetsService;
  manager: EntityManager;
  store: AssetTestStore;
  userId: string;
} {
  const store = new AssetTestStore();
  const user = new User();
  user.id = 'user-1';
  user.email = 'user@example.com';
  user.passwordHash = 'hash';
  user.displayName = null;
  user.createdAt = new Date();
  user.updatedAt = new Date();
  store.seed(User, user);
  store.seed(ItemDefinition, item('item-wheat', 'seed_wheat'));
  store.seed(
    ItemDefinition,
    item('item-badge', 'unique_badge', false),
  );

  return {
    assets: new PlatformAssetsService(fixedClock),
    manager: new AssetTestManager(store) as unknown as EntityManager,
    store,
    userId: user.id,
  };
}

function context(
  idempotencyKey: string,
  reason = 'test-operation',
): AssetMutationContext {
  return {
    sourceType: 'test',
    sourceId: 'operation-1',
    reason,
    idempotencyKey,
  };
}

describe('PlatformAssetsService', () => {
  it('credits/debits wallet with immutable, idempotent ledger entries', async () => {
    const { assets, manager, store, userId } = fixture();

    const credited = await assets.creditWallet(
      manager,
      userId,
      'office_coin',
      20,
      context('wallet-credit-1'),
    );
    const replayed = await assets.creditWallet(
      manager,
      userId,
      'office_coin',
      20,
      context('wallet-credit-1'),
    );
    const debited = await assets.debitWallet(
      manager,
      userId,
      'office_coin',
      5,
      context('wallet-debit-1'),
    );

    expect(credited).toMatchObject({ applied: true, balance: 20 });
    expect(replayed).toMatchObject({ applied: false, balance: 20 });
    expect(debited).toMatchObject({ applied: true, balance: 15 });
    expect(store.all(WalletLedger)).toHaveLength(2);
    expect(store.all(WalletBalance).find(
      (row) => row.currency === 'office_coin',
    )?.balance).toBe('15');
  });

  it('rejects wallet overdrafts without writing a ledger', async () => {
    const { assets, manager, store, userId } = fixture();

    await expect(
      assets.debitWallet(
        manager,
        userId,
        'water',
        1,
        context('wallet-overdraft'),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(store.all(WalletLedger)).toHaveLength(0);
  });

  it('credits/debits inventory and reads requested quantities', async () => {
    const { assets, manager, store, userId } = fixture();

    await assets.creditInventory(
      manager,
      userId,
      'seed_wheat',
      4,
      context('inventory-credit-1'),
    );
    await assets.debitInventory(
      manager,
      userId,
      'seed_wheat',
      1,
      context('inventory-debit-1'),
    );
    const quantities = await assets.readInventoryQuantities(
      manager,
      userId,
      ['seed_wheat', 'seed_strawberry', 'seed_wheat'],
    );

    expect(quantities).toEqual({
      seed_strawberry: 0,
      seed_wheat: 3,
    });
    expect(store.all(InventoryStack)[0].quantity).toBe('3');
    expect(store.all(InventoryLedger)).toHaveLength(2);
  });

  it('enforces non-stackable item semantics', async () => {
    const { assets, manager, userId } = fixture();
    await assets.creditInventory(
      manager,
      userId,
      'unique_badge',
      1,
      context('badge-credit-1'),
    );

    await expect(
      assets.creditInventory(
        manager,
        userId,
        'unique_badge',
        1,
        context('badge-credit-2'),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('changes EXP level and caps positive energy at capacity', async () => {
    const { assets, manager, userId } = fixture();

    const progression = await assets.addExperience(
      manager,
      userId,
      100,
    );
    const energy = await assets.changeEnergy(manager, userId, 10);

    expect(progression).toMatchObject({
      level: 2,
      experience: '100',
    });
    expect(energy.state.balance).toBe(15);
    expect(energy.appliedDelta).toBe(5);
  });

  it('grants a composite reward once with all receipts in the same manager', async () => {
    const { assets, manager, store, userId } = fixture();
    const command = {
      userId,
      sourceType: 'farm_harvest',
      sourceId: 'cycle-1',
      ruleKey: 'wheat-harvest-v1',
      reward: {
        experience: 10,
        currencies: { water: 5 },
        items: { seed_wheat: 2 },
        energy: 3,
      },
    };

    const first = await assets.grantReward(manager, command);
    const replay = await assets.grantReward(manager, command);

    expect(first.applied).toBe(true);
    expect(first.snapshot).toEqual(command.reward);
    expect(replay.applied).toBe(false);
    expect(replay.grant.id).toBe(first.grant.id);
    expect(store.all(RewardGrant)).toHaveLength(1);
    expect(store.all(WalletLedger)).toHaveLength(1);
    expect(store.all(InventoryLedger)).toHaveLength(1);
    expect(first.state.progression.experience).toBe('10');
    expect(first.state.energy.balance).toBe(13);
    expect(first.state.balances.get('water')?.balance).toBe('5');
  });

  it('rejects reuse of a wallet idempotency key for a different amount', async () => {
    const { assets, manager, userId } = fixture();
    await assets.creditWallet(
      manager,
      userId,
      'water',
      5,
      context('reused-key'),
    );

    await expect(
      assets.creditWallet(
        manager,
        userId,
        'water',
        6,
        context('reused-key'),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
