import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { OFFICE_RELIEF_RULES, type OfficeReliefDrop } from '@stealth-reader/shared';
import { EntityManager } from 'typeorm';
import { DeskPlant } from '../../../database/entities/desk-plant.entity';
import { DemonTowerProfile } from '../../../database/entities/demon-tower.entity';
import { DemonTowerAutoRun } from '../../../database/entities/demon-tower-auto-run.entity';
import { FARM_CROPS } from '../farm-growth-rules';
import { DemonTowerEngineError, grantDemonTowerOfficeRelief, type DemonTowerEngineState } from '../demon-tower/demon-tower.engine';
import { officeDay } from './office-hub.rules';

/** Internal settlement. The active user and office profile must already be locked by the same transaction. */
export async function grantOfficeReliefDrop(m: EntityManager, userId: string, drop: OfficeReliefDrop, now: number): Promise<void> {
  if (drop.kind === 'farm_crop') {
    if (!FARM_CROPS.some(crop => crop.key === drop.itemId)) throw new ConflictException({ code: 'OFFICE_RELIEF_STATE_INVALID' });
    const repository = m.getRepository(DeskPlant);
    const plant = await repository.findOne({ where: { userId }, lock: { mode: 'pessimistic_write' } });
    if (!plant) throw new ConflictException({ code: 'OFFICE_RELIEF_FARM_REQUIRED' });
    if (!Number.isSafeInteger(plant.farmCoins) || plant.farmCoins < 0 || plant.farmCoins > 2_147_483_647 - OFFICE_RELIEF_RULES.farmCoinsPerGift ||
        !Number.isSafeInteger(plant.farmVersion) || plant.farmVersion < 1 || plant.farmVersion >= 2_147_483_647)
      throw new ConflictException({ code: 'OFFICE_RELIEF_REWARD_FULL' });
    plant.farmCoins += OFFICE_RELIEF_RULES.farmCoinsPerGift;
    plant.farmVersion += 1;
    plant.updatedAt = new Date(now);
    await repository.save(plant);
    return;
  }
  if (process.env.FEATURE_COMMUNITY_DEMON_TOWER_ENABLED !== 'true' || process.env.FEATURE_DEMON_TOWER_EXPANSION_ENABLED !== 'true')
    throw new ServiceUnavailableException({ code: 'OFFICE_RELIEF_TOWER_REQUIRED' });
  const repository = m.getRepository(DemonTowerProfile);
  const profile = await repository.createQueryBuilder('profile').addSelect('profile.state')
    .where('profile.userId = :userId', { userId }).setLock('pessimistic_write').getOne();
  if (!profile) throw new ConflictException({ code: 'OFFICE_RELIEF_TOWER_REQUIRED' });
  if (await m.getRepository(DemonTowerAutoRun).exists({ where: { userId, status: 'running' } }))
    throw new ConflictException({ code: 'OFFICE_RELIEF_TOWER_BUSY' });
  if (!Number.isSafeInteger(profile.version) || profile.version < 1 || profile.version >= 2_147_483_647)
    throw new ConflictException({ code: 'OFFICE_RELIEF_REWARD_FULL' });
  try {
    profile.state = grantDemonTowerOfficeRelief(profile.state as unknown as DemonTowerEngineState, drop.itemId, now, officeDay(now)) as unknown as Record<string, unknown>;
  } catch (error) {
    if (error instanceof DemonTowerEngineError) throw new ConflictException({ code: error.code.startsWith('OFFICE_RELIEF_') ? error.code : 'OFFICE_RELIEF_STATE_INVALID' });
    throw error;
  }
  profile.version += 1;
  profile.updatedAt = new Date(now);
  await repository.save(profile);
}
