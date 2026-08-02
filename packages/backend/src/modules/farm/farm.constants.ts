export const FARM_CLOCK = Symbol('FARM_CLOCK');

export interface FarmClock {
  now(): Date;
}

export const systemFarmClock: FarmClock = {
  now: () => new Date(),
};

export const FARM_PLOT_SLOTS = 6;
export const INITIAL_UNLOCKED_PLOTS = 4;
export const LEVEL_UNLOCKED_PLOTS = 5;
export const FIFTH_PLOT_UNLOCK_LEVEL = 5;

export const FARM_ONBOARDING_REWARD = {
  currencies: { water: 4 },
  items: {
    seed_wheat: 4,
    seed_strawberry: 2,
    seed_coffee: 1,
  },
} as const;
