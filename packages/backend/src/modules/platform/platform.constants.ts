/** 平台日界线使用的业务时区。数据库时间仍统一保存为 UTC。 */
export const PLATFORM_TIME_ZONE = 'Asia/Shanghai';

export const PLATFORM_CLOCK = Symbol('PLATFORM_CLOCK');

export interface PlatformClock {
  now(): Date;
}

export const systemPlatformClock: PlatformClock = {
  now: () => new Date(),
};

/**
 * 历史钱包币种。
 *
 * 统一经济 v2 之后只有 office_coin 会继续作为玩家可见、可消费的货币。
 * 其余键暂留用于读取旧资产和执行无损迁移，禁止新玩法继续投放。
 */
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
export const INITIAL_ENERGY = 120;
export const INITIAL_ENERGY_CAPACITY = 120;
export const ENERGY_RECOVERY_INTERVAL_MILLISECONDS = 10 * 60 * 1_000;
export const INITIAL_OFFICE_COIN = 500;
export const UNIFIED_ECONOMY_RULE_VERSION = 'unified-economy-v1';

export const DAILY_CHECKIN_RULE_KEY = 'daily-checkin-v1';
export const DAILY_CHECKIN_EXP_REWARD = 10;
export const DAILY_CHECKIN_OFFICE_COIN_REWARD = 50;
