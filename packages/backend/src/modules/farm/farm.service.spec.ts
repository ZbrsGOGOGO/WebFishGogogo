import { ConflictException } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { User } from '../../database/entities/user.entity';
import { createLocalDevDataSource } from '../../database/local-dev-datasource';
import { OutboxService } from '../outbox';
import { PlatformAssetsService, PlatformService } from '../platform';
import type { PlatformClock } from '../platform/platform.constants';
import type { FarmClock } from './farm.constants';
import { FarmService } from './farm.service';

class MutableClock implements FarmClock, PlatformClock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  advanceMilliseconds(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

describe('FarmService integration', () => {
  let dataSource: DataSource;
  let clock: MutableClock;
  let farmService: FarmService;
  let platformService: PlatformService;
  let userId: string;

  beforeEach(async () => {
    dataSource = await createLocalDevDataSource();
    clock = new MutableClock(new Date('2026-07-24T02:00:00.000Z'));
    const assets = new PlatformAssetsService(clock);
    const outbox = new OutboxService();
    farmService = new FarmService(dataSource, assets, outbox, clock);
    platformService = new PlatformService(dataSource, clock, assets, outbox);

    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        email: 'farm-test@example.com',
        passwordHash: 'not-used-in-this-test',
        displayName: '农场测试用户',
      }),
    );
    userId = user.id;
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('initializes once, plants, matures, harvests and replays commands idempotently', async () => {
    const initial = await farmService.getFarm(userId);
    expect(initial.plots).toHaveLength(6);
    expect(initial.farm.plotCount).toBe(4);
    expect(initial.assets.water).toBe(4);
    expect(initial.inventory.seed_wheat).toBe(4);

    const plot = initial.plots.find((candidate) => candidate.state === 'empty');
    expect(plot).toBeDefined();

    const planted = await farmService.plant(
      userId,
      plot!.id,
      'wheat',
      'plant-test-0001',
    );
    expect(planted.assets.water).toBe(3);
    expect(planted.inventory.seed_wheat).toBe(3);
    expect(planted.plots.find((candidate) => candidate.id === plot!.id)?.state)
      .toBe('growing');

    const plantReplay = await farmService.plant(
      userId,
      plot!.id,
      'wheat',
      'plant-test-0001',
    );
    expect(plantReplay.assets.water).toBe(3);
    expect(plantReplay.inventory.seed_wheat).toBe(3);

    clock.advanceMilliseconds(30 * 60 * 1000);
    const harvested = await farmService.harvest(
      userId,
      plot!.id,
      'harvest-test-0001',
    );
    expect(harvested.plots.find((candidate) => candidate.id === plot!.id)?.state)
      .toBe('empty');
    expect(harvested.farm.experience).toBe(10);
    expect(harvested.inventory.seed_wheat).toBe(4);

    const platformAfterHarvest = await platformService.getOverview(userId);
    expect(platformAfterHarvest.profile.exp).toBe(20);
    expect(platformAfterHarvest.balances.officeCoin).toBe(5);

    await farmService.harvest(
      userId,
      plot!.id,
      'harvest-test-0001',
    );
    const platformAfterReplay = await platformService.getOverview(userId);
    expect(platformAfterReplay.profile.exp).toBe(20);
    expect(platformAfterReplay.balances.officeCoin).toBe(5);
  });

  it('rejects harvesting before the server-side maturity time', async () => {
    const initial = await farmService.getFarm(userId);
    const plot = initial.plots.find((candidate) => candidate.state === 'empty')!;
    await farmService.plant(userId, plot.id, 'wheat', 'plant-test-early');

    await expect(
      farmService.harvest(userId, plot.id, 'harvest-test-early'),
    ).rejects.toBeInstanceOf(ConflictException);

    const current = await farmService.getFarm(userId);
    expect(current.plots.find((candidate) => candidate.id === plot.id)?.state)
      .toBe('growing');
  });

  it('does not expose another user plot through a forged id', async () => {
    const firstFarm = await farmService.getFarm(userId);
    const other = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        email: 'other-farm-test@example.com',
        passwordHash: 'not-used',
        displayName: null,
      }),
    );

    await expect(
      farmService.plant(
        other.id,
        firstFarm.plots[0].id,
        'wheat',
        'plant-test-other',
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
