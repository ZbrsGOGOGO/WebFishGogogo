import type { GuildBuildingKey, GuildBuildings } from '../../database/entities/guild.entity';

export const GUILD_UNLOCK_LEVEL = 15;
export const GUILD_CREATE_COST = 20_000;
export const GUILD_DAILY_EFFECTIVE_DONATION = 500;
export const GUILD_MAX_BUILDING_LEVEL = 5;
export const GUILD_BUILDING_COSTS = [2_000, 5_000, 10_000, 20_000, 40_000] as const;
export const GUILD_BOSS_UNLOCK_LEVEL = 15;
export const GUILD_BOSS_ENERGY_COST = 10;
export const GUILD_BOSS_DAILY_ATTEMPTS = 1;
export const GUILD_BOSS_REWARD_COINS = 120;
export const GUILD_BOSS_REWARD_EXPERIENCE = 25;
export const GUILD_BOSS_ACTIVITY_REWARD = 25;
export const GUILD_BOSS_RULE_VERSION = 'guild-boss-v1';

export const GUILD_BUILDING_DEFINITIONS: ReadonlyArray<{
  key: GuildBuildingKey;
  name: string;
  description: string;
}> = [
  { key: 'project_room', name: '项目室', description: '逐级解锁帮派首领阶段。' },
  { key: 'training_room', name: '培训室', description: '每级让 PVE 职场经验增加 1%，最高 5%。' },
  { key: 'pantry', name: '茶水间', description: '每级让农场成熟时间缩短 1%，最高 5%。' },
  { key: 'showcase_wall', name: '展示墙', description: '解锁帮派纪念记录与无属性外观。' },
] as const;

export function normalizeGuildBuildings(value: Partial<GuildBuildings> | null | undefined): GuildBuildings {
  return Object.fromEntries(
    GUILD_BUILDING_DEFINITIONS.map(({ key }) => [
      key,
      Math.max(0, Math.min(GUILD_MAX_BUILDING_LEVEL, Math.trunc(Number(value?.[key] ?? 0)))),
    ]),
  ) as GuildBuildings;
}

export function guildBuildingCost(currentLevel: number): number {
  return GUILD_BUILDING_COSTS[Math.max(0, Math.trunc(currentLevel))] ?? 0;
}

export function guildBossMaxHp(memberCount: number, projectRoomLevel: number): number {
  return 900
    + Math.max(1, Math.trunc(memberCount)) * 450
    + Math.max(0, Math.trunc(projectRoomLevel)) * 350;
}

export function guildBossBaseDamage(playerLevel: number, projectRoomLevel: number): number {
  return 300
    + Math.max(1, Math.trunc(playerLevel)) * 30
    + Math.max(0, Math.trunc(projectRoomLevel)) * 80;
}
