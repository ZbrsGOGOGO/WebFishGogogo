import { randomUUID } from 'node:crypto';

import { ConflictException, NotFoundException } from '@nestjs/common';
import { newDb, type IMemoryDb } from 'pg-mem';
import { DataSource } from 'typeorm';

import { ArenaBattle } from '../../../database/entities/arena-battle.entity';
import { ArenaOpponentOffer } from '../../../database/entities/arena-opponent-offer.entity';
import { ArenaProfile } from '../../../database/entities/arena-profile.entity';
import { EnergyState } from '../../../database/entities/energy-state.entity';
import { PlayerProgression } from '../../../database/entities/player-progression.entity';
import { User } from '../../../database/entities/user.entity';
import { WalletBalance } from '../../../database/entities/wallet-balance.entity';
import { entities } from '../../../database/entities';
import { migrations } from '../../../database/migrations';
import {
  PlatformAssetsService,
  type PlatformClock,
} from '../../platform';
import { OutboxService } from '../../outbox';
import {
  ARENA_OFFER_TTL_MILLISECONDS,
  type ArenaClock,
} from './arena.constants';
import { ArenaService } from './arena.service';

class MutableClock implements ArenaClock, PlatformClock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

describe('ArenaService integration', () => {
  let dataSource: DataSource;
  let clock: MutableClock;
  let assets: PlatformAssetsService;
  let service: ArenaService;
  let userId: string;

  beforeEach(async () => {
    dataSource = await createArenaTestDataSource();
    clock = new MutableClock(new Date('2026-07-24T02:00:00.000Z'));
    assets = new PlatformAssetsService(clock);
    service = new ArenaService(dataSource, assets, new OutboxService(), clock);
    userId = await createUser(dataSource, 'arena@example.com');
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('returns the locked contract below Lv.3 without creating offers', async () => {
    const bootstrap = await service.getBootstrap(userId);

    expect(bootstrap).toEqual({
      serverTime: '2026-07-24T02:00:00.000Z',
      unlocked: false,
      unlockLevel: 3,
      profile: {
        level: 1,
        title: '初入工位',
        energy: 10,
        energyCap: 15,
        battleClass: null,
        attributes: {
          focus: 10,
          inspiration: 10,
          mindset: 10,
          slacking: 10,
          execution: 10,
        },
      },
      offers: [],
      recentBattles: [],
    });
    await expect(
      dataSource.getRepository(ArenaOpponentOffer).count({
        where: { userId },
      }),
    ).resolves.toBe(0);
  });

  it('creates one reusable set of easy/even/risky offers valid for 15 minutes', async () => {
    await levelUpToThree(dataSource, assets, userId);

    const first = await service.getBootstrap(userId);
    const second = await service.getBootstrap(userId);

    expect(first.unlocked).toBe(true);
    expect(first.profile.level).toBe(3);
    expect(first.offers.map((offer) => offer.tier)).toEqual([
      'easy',
      'even',
      'risky',
    ]);
    expect(first.offers.map((offer) => offer.id)).toEqual(
      second.offers.map((offer) => offer.id),
    );
    expect(
      first.offers.every(
        (offer) =>
          new Date(offer.expiresAt).getTime() ===
          clock.now().getTime() + ARENA_OFFER_TTL_MILLISECONDS,
      ),
    ).toBe(true);
    expect(first.offers.every((offer) => offer.power > 0)).toBe(true);
    expect(first.offers[0].power).toBeLessThan(first.offers[1].power);
    expect(first.offers[1].power).toBeLessThan(first.offers[2].power);
    await expect(
      dataSource.getRepository(ArenaOpponentOffer).count({
        where: { userId },
      }),
    ).resolves.toBe(3);
  });

  it('settles energy, record and result-dependent rewards once, then replays safely', async () => {
    await levelUpToThree(dataSource, assets, userId);
    const bootstrap = await service.getBootstrap(userId);
    const offer = bootstrap.offers[0];

    const first = await service.startBattle(
      userId,
      offer.id,
      'arena-battle-test-0001',
    );
    const expectedReward =
      first.battle.result === 'win'
        ? { experience: 30, officeCoin: 10 }
        : { experience: 10, officeCoin: 3 };

    expect(first.battle.winnerSide).toBe(
      first.battle.result === 'win' ? 'player' : 'opponent',
    );
    expect(first.battle.roundsPlayed).toBeGreaterThan(0);
    expect(first.battle.logs.length).toBeGreaterThan(0);
    expect(first.battle.logs[0]).toEqual({
      round: expect.any(Number),
      text: expect.any(String),
    });
    expect(first.reward).toEqual({
      experience: expectedReward.experience,
      currencies: { officeCoin: expectedReward.officeCoin },
    });
    expect(first.energy).toBe(9);

    const replay = await service.startBattle(
      userId,
      offer.id,
      'arena-battle-test-0001',
    );
    expect(replay).toEqual(first);

    await expect(
      dataSource.getRepository(ArenaBattle).count({ where: { userId } }),
    ).resolves.toBe(1);
    await expect(
      dataSource.getRepository(EnergyState).findOneByOrFail({ userId }),
    ).resolves.toMatchObject({ balance: 9 });
    const progression = await dataSource
      .getRepository(PlayerProgression)
      .findOneByOrFail({ userId });
    expect(Number(progression.experience)).toBe(
      300 + expectedReward.experience,
    );
    const officeCoin = await dataSource
      .getRepository(WalletBalance)
      .findOneByOrFail({
        userId,
        currency: 'office_coin',
      });
    expect(Number(officeCoin.balance)).toBe(expectedReward.officeCoin);
    await expect(
      dataSource.getRepository(ArenaProfile).findOneByOrFail({ userId }),
    ).resolves.toMatchObject(
      first.battle.result === 'win'
        ? { wins: 1, losses: 0 }
        : { wins: 0, losses: 1 },
    );

    const after = await service.getBootstrap(userId);
    expect(after.recentBattles).toEqual([
      {
        id: first.battle.id,
        result: first.battle.result,
        opponentName: offer.opponentName,
        createdAt: expect.any(String),
      },
    ]);
  });

  it('rejects expired, foreign, consumed and idempotency-key-conflicting offers', async () => {
    await levelUpToThree(dataSource, assets, userId);
    const initial = await service.getBootstrap(userId);
    const [firstOffer, secondOffer] = initial.offers;

    const otherUserId = await createUser(dataSource, 'other-arena@example.com');
    await levelUpToThree(dataSource, assets, otherUserId);
    await expect(
      service.startBattle(
        otherUserId,
        firstOffer.id,
        'arena-foreign-test',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    await service.startBattle(
      userId,
      firstOffer.id,
      'arena-consume-test',
    );
    await expect(
      service.startBattle(
        userId,
        firstOffer.id,
        'arena-consume-other-key',
      ),
    ).rejects.toMatchObject({
      response: { code: 'ARENA_OFFER_ALREADY_CONSUMED' },
    });
    await expect(
      service.startBattle(
        userId,
        secondOffer.id,
        'arena-unselected-old-offer',
      ),
    ).rejects.toMatchObject({
      response: { code: 'ARENA_OFFER_ALREADY_CONSUMED' },
    });
    await expect(
      service.startBattle(
        userId,
        secondOffer.id,
        'arena-consume-test',
      ),
    ).rejects.toMatchObject({
      response: { code: 'IDEMPOTENCY_KEY_REUSED' },
    });

    const refreshed = await service.getBootstrap(userId);
    const expiringOffer = refreshed.offers.find(
      (offer) => offer.id !== firstOffer.id,
    )!;
    clock.advance(ARENA_OFFER_TTL_MILLISECONDS);
    await expect(
      service.startBattle(
        userId,
        expiringOffer.id,
        'arena-expired-test',
      ),
    ).rejects.toMatchObject({
      response: { code: 'ARENA_OFFER_EXPIRED' },
    });
  });

  it('rolls back without consuming an offer when energy is insufficient', async () => {
    await levelUpToThree(dataSource, assets, userId);
    const initial = await service.getBootstrap(userId);
    const offer = initial.offers[0];
    const energyRepo = dataSource.getRepository(EnergyState);
    const energy = await energyRepo.findOneByOrFail({ userId });
    energy.balance = 0;
    await energyRepo.save(energy);

    await expect(
      service.startBattle(
        userId,
        offer.id,
        'arena-no-energy-test',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(
      dataSource.getRepository(ArenaBattle).count({ where: { userId } }),
    ).resolves.toBe(0);
    await expect(
      dataSource
        .getRepository(ArenaOpponentOffer)
        .findOneByOrFail({ id: offer.id }),
    ).resolves.toMatchObject({ consumedAt: null });
  });
});

async function levelUpToThree(
  dataSource: DataSource,
  assets: PlatformAssetsService,
  userId: string,
): Promise<void> {
  await dataSource.transaction((manager) =>
    assets.addExperience(manager, userId, 300),
  );
}

async function createUser(
  dataSource: DataSource,
  email: string,
): Promise<string> {
  const repo = dataSource.getRepository(User);
  const user = await repo.save(
    repo.create({
      email,
      passwordHash: 'not-used-in-this-test',
      displayName: null,
    }),
  );
  return user.id;
}

async function createArenaTestDataSource(): Promise<DataSource> {
  const db: IMemoryDb = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid' as never,
    implementation: () => randomUUID(),
    impure: true,
  });
  db.public.registerFunction({
    name: 'version',
    returns: 'text' as never,
    implementation: () => 'PostgreSQL 14.0 (pg-mem arena test)',
    impure: true,
  });
  db.public.registerFunction({
    name: 'current_database',
    returns: 'text' as never,
    implementation: () => 'stealth_reader',
    impure: true,
  });
  db.registerExtension('pgcrypto', () => {});
  db.registerExtension('uuid-ossp', () => {});

  const arenaEntities = [
    ...new Set([
      ...entities,
      ArenaProfile,
      ArenaOpponentOffer,
      ArenaBattle,
    ]),
  ];
  const source = db.adapters.createTypeormDataSource({
    type: 'postgres',
    entities: arenaEntities,
    migrations,
    synchronize: false,
    migrationsRun: false,
  }) as DataSource;
  await source.initialize();
  await source.runMigrations();
  return source;
}
