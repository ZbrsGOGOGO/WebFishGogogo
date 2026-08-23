import type { GuildBuildingKey, GuildBuildings } from '../../database/entities/guild.entity';

export const GUILD_UNLOCK_LEVEL = 15;
export const GUILD_CREATE_COST = 20_000;
export const GUILD_DAILY_EFFECTIVE_DONATION = 500;
export const GUILD_MAX_BUILDING_LEVEL = 5;
export const GUILD_BUILDING_COSTS = [2_000, 5_000, 10_000, 20_000, 40_000] as const;

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
