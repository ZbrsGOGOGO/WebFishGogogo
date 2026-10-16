import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { OFFICE_RELIEF_RULES, type OfficeReliefDrop } from '@stealth-reader/shared';
import { EntityManager } from 'typeorm';
import { DeskPlant } from '../../../database/entities/desk-plant.entity';
import { FARM_CROPS, farmLevelSnapshot } from '../farm-growth-rules';

/** Internal settlement. The active user and office profile must already be locked by the same transaction. */
export async function grantOfficeReliefDrop(m: EntityManager, userId: string, drop: OfficeReliefDrop, now: number): Promise<void> {
  if (drop.kind === 'farm_crop') {
    if (!FARM_CROPS.some(crop => crop.key === drop.itemId)) throw new ConflictException({ code: 'OFFICE_RELIEF_STATE_INVALID' });
    const repository = m.getRepository(DeskPlant);
    const plant = await repository.findOne({ where: { userId }, lock: { mode: 'pessimistic_write' } });
    if (!plant) throw new ConflictException({ code: 'OFFICE_RELIEF_FARM_REQUIRED' });
    if (!Number.isSafeInteger(plant.plantExperience) || plant.plantExperience < 0 || plant.plantExperience > 2_147_483_647 - OFFICE_RELIEF_RULES.farmExperiencePerGift ||
        !Number.isSafeInteger(plant.farmVersion) || plant.farmVersion < 1 || plant.farmVersion >= 2_147_483_647)
      throw new ConflictException({ code: 'OFFICE_RELIEF_REWARD_FULL' });
    // farmCoins is a retired balance and the current farm projection always
    // returns zero for it. Grant the visible, usable growth experience instead.
    plant.plantExperience += OFFICE_RELIEF_RULES.farmExperiencePerGift;
    plant.level = farmLevelSnapshot(plant.plantExperience).level;
    plant.farmVersion += 1;
    plant.updatedAt = new Date(now);
    await repository.save(plant);
    return;
  }
  // Production had no pending tower drops at retirement. Keep the legacy shape
  // readable, but never consume it or write into either tower implementation.
  throw new ServiceUnavailableException({ code: 'OFFICE_RELIEF_TOWER_RETIRED' });
}
