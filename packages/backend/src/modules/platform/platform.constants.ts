/** 平台日界线使用的业务时区。数据库时间仍统一保存为 UTC。 */
export const PLATFORM_TIME_ZONE = 'Asia/Shanghai';

export const PLATFORM_CLOCK = Symbol('PLATFORM_CLOCK');

export interface PlatformClock {
  now(): Date;
}

export const systemPlatformClock: PlatformClock = {
  now: () => new Date(),
};

/** 首期钱包币种。 */
export const WALLET_CURRENCIES = [
  'office_coin',
  'decor_coin',
  'inspiration',
  'water',
  'sunlight',
  'fertilizer',
] as const;

export type WalletCurrency = (typeof WALLET_CURRENCIES)[number];

export const INITIAL_PLAYER_TITLE = '初入工位';
export const INITIAL_ENERGY = 10;
export const INITIAL_ENERGY_CAPACITY = 15;

export const DAILY_CHECKIN_RULE_KEY = 'daily-checkin-v1';
export const DAILY_CHECKIN_EXP_REWARD = 10;
export const DAILY_CHECKIN_WATER_REWARD = 5;
