import 'reflect-metadata';

import { AppDataSource } from '../database/data-source';
import { DemonTowerRewardsService } from '../modules/community/demon-tower/demon-tower-rewards.service';
import { NotificationService } from '../modules/community/notification.service';
import { PlatformAssetsService } from '../modules/platform/platform-assets.service';
import { systemPlatformClock } from '../modules/platform/platform.constants';

async function main(): Promise<void> {
  const date = process.argv[2];
  if (!date || process.argv.length !== 3) {
    throw new Error('Usage: node settle-retired-demon-tower-day.js YYYY-MM-DD');
  }
  const expected = `RETIRE_OLD_DEMON_TOWER:${date}`;
  const confirmation = process.env.CONFIRM_DEMON_TOWER_RETIREMENT_SETTLEMENT ?? '';
  if (confirmation !== expected) {
    throw new Error(`Set CONFIRM_DEMON_TOWER_RETIREMENT_SETTLEMENT=${expected}`);
  }

  await AppDataSource.initialize();
  try {
    const assets = new PlatformAssetsService(systemPlatformClock);
    const notifications = new NotificationService(AppDataSource);
    const rewards = new DemonTowerRewardsService(
      AppDataSource,
      assets,
      notifications,
      systemPlatformClock,
    );
    const applied = await rewards.settleRetirementDay(date, confirmation);
    process.stdout.write(`${JSON.stringify({ date, result: applied ? 'applied' : 'already_settled' })}\n`);
  } finally {
    await AppDataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'retirement settlement failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
