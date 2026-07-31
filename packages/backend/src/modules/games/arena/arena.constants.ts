import type { RewardSnapshot } from '../../../database/entities/reward-grant.entity';

export const ARENA_CLOCK = Symbol('ARENA_CLOCK');

export interface ArenaClock {
  now(): Date;
}

export const systemArenaClock: ArenaClock = {
  now: () => new Date(),
};

export const ARENA_UNLOCK_LEVEL = 3;
export const ARENA_OFFER_TTL_MILLISECONDS = 15 * 60 * 1000;
export const ARENA_ENERGY_COST = 1;
export const ARENA_ENGINE_VERSION = 'arena-engine-v1';

export const ARENA_WIN_REWARD: Readonly<RewardSnapshot> = {
  experience: 30,
  currencies: { office_coin: 10 },
};

export const ARENA_LOSS_REWARD: Readonly<RewardSnapshot> = {
  experience: 10,
  currencies: { office_coin: 3 },
};
