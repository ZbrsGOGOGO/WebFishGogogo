import type { EntityManager } from 'typeorm';

import {
  DemonTowerSourceCommand,
  DemonTowerSourceContribution,
  DemonTowerSourceDailyAction,
  DemonTowerSourceProfile,
} from '../../../database/entities/demon-tower-source.entity';

/** Soft account deletion does not fire user FK cascades. Keep the shared world,
 * but erase the departing account's private save, receipts and ranked identity. */
export async function cleanupDemonTowerSourceUser(manager: EntityManager, userId: string): Promise<void> {
  await manager.getRepository(DemonTowerSourceCommand).delete({ userId });
  await manager.getRepository(DemonTowerSourceContribution).delete({ userId });
  await manager.getRepository(DemonTowerSourceDailyAction).delete({ userId });
  await manager.getRepository(DemonTowerSourceProfile).delete({ userId });
}
