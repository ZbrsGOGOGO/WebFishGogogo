import type {
  DeskPlantSkillId,
  DeskPlantSkillLevels,
  DeskPlantToolId,
  DeskPlantToolLevels,
} from '../../database/entities/desk-plant.entity';

export const FARM_MAX_LEVEL = 30;
export const FARM_TOOL_MAX_LEVEL = 5;
export const FARM_SKILL_MAX_LEVEL = 5;
export const FARM_FIRST_CYCLE_SECONDS = 30;

export interface FarmCropDefinition {
  key: string;
  name: string;
  mark: string;
  unlockLevel: number;
  durationSeconds: number;
  experience: number;
  coins: number;
  description: string;
}

export const FARM_CROPS: readonly FarmCropDefinition[] = [
  { key: 'desk_mint', name: '工位薄荷', mark: '薄', unlockLevel: 1, durationSeconds: 5 * 60, experience: 12, coins: 12, description: '成熟最快，适合刚开始经营。' },
  { key: 'meeting_tomato', name: '会议番茄', mark: '茄', unlockLevel: 3, durationSeconds: 20 * 60, experience: 32, coins: 36, description: '稳定产出，适合短时回来收获。' },
  { key: 'deadline_strawberry', name: '截止日草莓', mark: '莓', unlockLevel: 6, durationSeconds: 60 * 60, experience: 70, coins: 84, description: '经验与办公币都很均衡。' },
  { key: 'overtime_coffee', name: '加班咖啡果', mark: '咖', unlockLevel: 10, durationSeconds: 2 * 60 * 60, experience: 125, coins: 165, description: '偏向办公币产出，适合升级工具。' },
  { key: 'promotion_sunflower', name: '晋升向日葵', mark: '升', unlockLevel: 15, durationSeconds: 4 * 60 * 60, experience: 230, coins: 280, description: '中后期主力作物。' },
  { key: 'annual_moonflower', name: '年终月光花', mark: '年', unlockLevel: 22, durationSeconds: 8 * 60 * 60, experience: 420, coins: 540, description: '长周期高收益作物。' },
] as const;

export interface FarmToolDefinition {
  id: DeskPlantToolId;
  name: string;
  slot: string;
  description: string;
}

export const FARM_TOOLS: readonly FarmToolDefinition[] = [
  { id: 'watering_can', name: '定时浇水壶', slot: '浇水工具', description: '每级让成熟时间缩短 4%。' },
  { id: 'planter_box', name: '透气种植箱', slot: '种植容器', description: '每级让农场经验增加 8%。' },
  { id: 'harvest_basket', name: '分类收获篮', slot: '收获工具', description: '每级让农场币增加 10%。' },
] as const;

export interface FarmSkillDefinition {
  id: DeskPlantSkillId;
  name: string;
  unlockLevel: number;
  description: string;
}

export const FARM_SKILLS: readonly FarmSkillDefinition[] = [
  { id: 'quick_care', name: '快速照料', unlockLevel: 2, description: '每级让成熟时间额外缩短 3%。' },
  { id: 'green_thumb', name: '绿手指', unlockLevel: 5, description: '每级让农场经验额外增加 5%。' },
  { id: 'abundant_harvest', name: '丰收心得', unlockLevel: 8, description: '每级让农场币额外增加 6%。' },
] as const;

export const EMPTY_FARM_TOOL_LEVELS: DeskPlantToolLevels = {
  watering_can: 0,
  planter_box: 0,
  harvest_basket: 0,
};

export const EMPTY_FARM_SKILL_LEVELS: DeskPlantSkillLevels = {
  quick_care: 0,
  green_thumb: 0,
  abundant_harvest: 0,
};

export interface FarmLevelSnapshot {
  level: number;
  experienceInLevel: number;
  experienceToNextLevel: number | null;
}

export function farmLevelSnapshot(totalExperience: number): FarmLevelSnapshot {
  const normalized = Math.max(0, Math.trunc(totalExperience));
  let spent = 0;
  for (let level = 1; level < FARM_MAX_LEVEL; level += 1) {
    const required = 30 + level * 10;
    if (normalized < spent + required) {
      return { level, experienceInLevel: normalized - spent, experienceToNextLevel: required };
    }
    spent += required;
  }
  return { level: FARM_MAX_LEVEL, experienceInLevel: 0, experienceToNextLevel: null };
}

export function normalizeFarmToolLevels(value: Partial<DeskPlantToolLevels> | null | undefined): DeskPlantToolLevels {
  return normalizeLevels(EMPTY_FARM_TOOL_LEVELS, value, FARM_TOOL_MAX_LEVEL);
}

export function normalizeFarmSkillLevels(value: Partial<DeskPlantSkillLevels> | null | undefined): DeskPlantSkillLevels {
  return normalizeLevels(EMPTY_FARM_SKILL_LEVELS, value, FARM_SKILL_MAX_LEVEL);
}

function normalizeLevels<T extends Record<string, number>>(defaults: T, value: Partial<T> | null | undefined, max: number): T {
  return Object.fromEntries(
    Object.keys(defaults).map((key) => [key, Math.max(0, Math.min(max, Math.trunc(Number(value?.[key] ?? 0))))]),
  ) as T;
}

export function farmSkillPointsEarned(level: number): number {
  return Math.min(15, Math.floor(Math.max(1, level) / 2));
}

export function farmSkillPointsAvailable(level: number, skills: DeskPlantSkillLevels): number {
  return Math.max(0, farmSkillPointsEarned(level) - Object.values(skills).reduce((sum, value) => sum + value, 0));
}

export function farmToolUpgradeCost(currentLevel: number): number {
  const level = Math.max(0, Math.min(FARM_TOOL_MAX_LEVEL, Math.trunc(currentLevel)));
  return level >= FARM_TOOL_MAX_LEVEL ? 0 : 20 * (level + 1) * (level + 1);
}

export function farmCrop(key: string): FarmCropDefinition | undefined {
  return FARM_CROPS.find((crop) => crop.key === key);
}

export function calculateFarmCycle(
  crop: FarmCropDefinition,
  tools: DeskPlantToolLevels,
  skills: DeskPlantSkillLevels,
): { durationSeconds: number; experience: number; coins: number } {
  const durationPercent = Math.max(55, 100 - tools.watering_can * 4 - skills.quick_care * 3);
  const experiencePercent = 100 + tools.planter_box * 8 + skills.green_thumb * 5;
  const coinPercent = 100 + tools.harvest_basket * 10 + skills.abundant_harvest * 6;
  return {
    durationSeconds: Math.max(30, Math.round(crop.durationSeconds * durationPercent / 100)),
    experience: Math.max(1, Math.round(crop.experience * experiencePercent / 100)),
    coins: Math.max(1, Math.round(crop.coins * coinPercent / 100)),
  };
}

export function nextFarmUnlock(level: number): { level: number; name: string; kind: 'crop' | 'skill' } | null {
  const candidates = [
    ...FARM_CROPS.map((crop) => ({ level: crop.unlockLevel, name: crop.name, kind: 'crop' as const })),
    ...FARM_SKILLS.map((skill) => ({ level: skill.unlockLevel, name: skill.name, kind: 'skill' as const })),
  ].filter((item) => item.level > level).sort((a, b) => a.level - b.level);
  return candidates[0] ?? null;
}
