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

/** 首次种植压缩到半分钟，让新用户能在一次会话内完成种植闭环。 */
export const FARM_FIRST_GROW_SECONDS = 30;

/** 与最低作物的 10 EXP 合计 50 EXP，首次收获必定升到农场 Lv.2。 */
export const FARM_FIRST_HARVEST_BONUS_EXP = 40;

export const FARM_ONBOARDING_REWARD = {
  currencies: { water: 4 },
  items: {
    seed_wheat: 4,
    seed_strawberry: 2,
    seed_coffee: 1,
  },
} as const;
