import type {
  OfficeBattleEquipmentSlot,
  OfficeBattleRarity,
  OfficeBattleStats,
} from '../../../database/entities/office-battle-equipment.entity';
import type { OfficeBattleProfession } from '../../../database/entities/office-battle-profile.entity';

export const OFFICE_BATTLE_ENGINE_VERSION = 'office-battle-engine-1';
export const OFFICE_BATTLE_BALANCE_VERSION = 'office-battle-balance-2';
export const OFFICE_BATTLE_MIN_CLIENT_VERSION = '1.0.0';
export const OFFICE_BATTLE_INVENTORY_LIMIT = 120;
export const OFFICE_BATTLE_DAILY_ENERGY = 12;
export const OFFICE_BATTLE_DAILY_REWARDED_LIMIT = 12;
export const OFFICE_BATTLE_DAILY_FRIEND_LIMIT = 3;
export const OFFICE_BATTLE_MAX_EXPERIENCE = 40120;
export const OFFICE_BATTLE_SKILL_MAX_LEVEL = 5;

export const OFFICE_BATTLE_PROFESSIONS: readonly OfficeBattleProfession[] = [
  'developer',
  'product',
  'qa',
  'sales',
  'hr',
];
export const OFFICE_BATTLE_SLOTS: readonly OfficeBattleEquipmentSlot[] = [
  'weapon',
  'head',
  'body',
  'badge',
  'shoes',
  'accessory',
];
export const OFFICE_BATTLE_RARITIES: readonly OfficeBattleRarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

export const PROFESSION_LABELS: Record<OfficeBattleProfession, string> = {
  developer: '程序员',
  product: '产品经理',
  qa: '测试',
  sales: '销售员',
  hr: '人力资源管理',
};

export const BASE_STATS: Record<OfficeBattleProfession, OfficeBattleStats> = {
  developer: { hp: 112, attack: 17, defense: 10, speed: 12, luck: 8 },
  product: { hp: 120, attack: 14, defense: 12, speed: 10, luck: 10 },
  qa: { hp: 116, attack: 15, defense: 13, speed: 9, luck: 11 },
  sales: { hp: 108, attack: 18, defense: 8, speed: 14, luck: 11 },
  hr: { hp: 126, attack: 13, defense: 12, speed: 10, luck: 9 },
};

export interface OfficeBattleSkillDefinition {
  id: string;
  profession: OfficeBattleProfession;
  name: string;
  unlockLevel: number;
  description: string;
  bonusPerLevel: Partial<OfficeBattleStats>;
}

export const OFFICE_BATTLE_SKILLS: readonly OfficeBattleSkillDefinition[] = [
  { id: 'logic_overclock', profession: 'developer', name: '逻辑超频', unlockLevel: 1, description: '每级攻击 +3，强化代码输出。', bonusPerLevel: { attack: 3 } },
  { id: 'exception_shield', profession: 'developer', name: '异常兜底', unlockLevel: 5, description: '每级生命 +4、防御 +2。', bonusPerLevel: { hp: 4, defense: 2 } },
  { id: 'rapid_deploy', profession: 'developer', name: '快速发布', unlockLevel: 10, description: '每级速度 +1、幸运 +1。', bonusPerLevel: { speed: 1, luck: 1 } },
  { id: 'priority_cut', profession: 'product', name: '优先级裁决', unlockLevel: 1, description: '每级攻击 +2、幸运 +1。', bonusPerLevel: { attack: 2, luck: 1 } },
  { id: 'scope_control', profession: 'product', name: '范围管理', unlockLevel: 5, description: '每级生命 +6、防御 +2。', bonusPerLevel: { hp: 6, defense: 2 } },
  { id: 'user_insight', profession: 'product', name: '用户洞察', unlockLevel: 10, description: '每级速度 +1、幸运 +2。', bonusPerLevel: { speed: 1, luck: 2 } },
  { id: 'boundary_strike', profession: 'qa', name: '边界突击', unlockLevel: 1, description: '每级攻击 +2、幸运 +1。', bonusPerLevel: { attack: 2, luck: 1 } },
  { id: 'regression_armor', profession: 'qa', name: '回归护甲', unlockLevel: 5, description: '每级生命 +4、防御 +2。', bonusPerLevel: { hp: 4, defense: 2 } },
  { id: 'bug_trace', profession: 'qa', name: '缺陷追踪', unlockLevel: 10, description: '每级速度 +1、幸运 +2。', bonusPerLevel: { speed: 1, luck: 2 } },
  { id: 'opening_pitch', profession: 'sales', name: '开场提案', unlockLevel: 1, description: '每级攻击 +3。', bonusPerLevel: { attack: 3 } },
  { id: 'deal_rhythm', profession: 'sales', name: '成交节奏', unlockLevel: 5, description: '每级速度 +2。', bonusPerLevel: { speed: 2 } },
  { id: 'client_insight', profession: 'sales', name: '客户洞察', unlockLevel: 10, description: '每级生命 +2、幸运 +2。', bonusPerLevel: { hp: 2, luck: 2 } },
  { id: 'talent_link', profession: 'hr', name: '人才连接', unlockLevel: 1, description: '每级生命 +3、攻击 +2。', bonusPerLevel: { hp: 3, attack: 2 } },
  { id: 'culture_shield', profession: 'hr', name: '文化护盾', unlockLevel: 5, description: '每级生命 +5、防御 +2。', bonusPerLevel: { hp: 5, defense: 2 } },
  { id: 'empathy_field', profession: 'hr', name: '共情力场', unlockLevel: 10, description: '每级速度 +1、幸运 +2。', bonusPerLevel: { speed: 1, luck: 2 } },
] as const;

export const SLOT_BASE_STATS: Record<OfficeBattleEquipmentSlot, Partial<OfficeBattleStats>> = {
  weapon: { attack: 7 },
  head: { defense: 2, luck: 2 },
  body: { hp: 18, defense: 4 },
  badge: { attack: 2, luck: 3 },
  shoes: { defense: 2, speed: 4 },
  accessory: { hp: 8, luck: 4 },
};

export const RARITY_RULES: Record<
  OfficeBattleRarity,
  { label: string; multiplier: number; fixed: number; rate: number; parts: number }
> = {
  common: { label: '标准', multiplier: 100, fixed: 0, rate: 45, parts: 1 },
  uncommon: { label: '精工', multiplier: 108, fixed: 1, rate: 33, parts: 2 },
  rare: { label: '专业', multiplier: 118, fixed: 2, rate: 16, parts: 4 },
  epic: { label: '卓越', multiplier: 130, fixed: 3, rate: 5, parts: 8 },
  legendary: { label: '代表作', multiplier: 145, fixed: 4, rate: 1, parts: 16 },
};

const EQUIPMENT_NAMES: Record<
  OfficeBattleProfession,
  Record<OfficeBattleEquipmentSlot, readonly string[]>
> = {
  developer: {
    weapon: ['薄膜键盘', '双屏调试台', '灰度发布终端', '并发编译阵列', '零停机架构台', '星环算力中枢'],
    head: ['有线耳机', '降噪耳机', '沉浸式监听耳机', '深夜发布头戴', '零故障思维环', '全域架构感知冠'],
    body: ['格子衬衫', '连帽卫衣', '发布作战服', '全栈机能外套', '首席架构风衣', '星环工程统筹披风'],
    badge: ['实习工牌', '研发工牌', '核心提交者工牌', '技术负责人徽章', '传奇架构师铭牌', '首席技术决策铭牌'],
    shoes: ['办公拖鞋', '静音休闲鞋', '机房疾行鞋', '发布夜行靴', '零延迟步履', '跨域发布跃迁履'],
    accessory: ['橡皮鸭', '桌面机械臂', '智能代码助手', '故障预警核心', '无限算力方块', '自愈系统控制核'],
  },
  product: {
    weapon: ['需求便利贴', '用户旅程笔', '快速原型台', '版本路线罗盘', '跨部门决策盘', '全景产品沙盘'],
    head: ['框架眼镜', '用户洞察镜', '全景访谈耳机', '战略推演头戴', '需求先知冠', '全景决策感知冠'],
    body: ['基础通勤装', '访谈夹克', '评审战衣', '路线图风衣', '首席产品礼服', '全域产品统筹礼服'],
    badge: ['助理工牌', '产品工牌', '增长负责人徽章', '产品总监铭牌', '愿景掌舵者名牌', '首席价值架构铭牌'],
    shoes: ['会议室便鞋', '访谈行走鞋', '跨部门疾行鞋', '增长追踪靴', '全场景漫步者', '未来场景领航履'],
    accessory: ['便利贴盒', '需求优先级沙盘', '用户画像终端', '增长曲线投影仪', '未来路线水晶', '全景价值推演核'],
  },
  qa: {
    weapon: ['边界检查表', '缺陷探针', '自动回归台', '全链路压测仪', '混沌验证矩阵', '零遗漏验收核'],
    head: ['护眼镜', '像素观察镜', '异常捕捉目镜', '全链路扫描头戴', '真相洞察镜', '零盲区验证天镜'],
    body: ['基础测试服', '回归夹克', '质量守门战衣', '全链路防护服', '零缺陷披风', '全域质量统筹披风'],
    badge: ['测试助理工牌', '质量工牌', '缺陷猎手徽章', '质量负责人铭牌', '零缺陷守护印', '首席质量裁决铭牌'],
    shoes: ['复测便鞋', '回归跑鞋', '环境巡检鞋', '全链路追踪靴', '无死角步履', '全链路巡检跃迁履'],
    accessory: ['测试数据本', '自动化小车', '缺陷雷达', '环境镜像核心', '质量预言机', '可信交付验证核'],
  },
  sales: {
    weapon: ['客户名片夹', '商机演示笔', '方案呈现台', '全域客户雷达', '关键谈判台', '年度签约金印'],
    head: ['通话耳麦', '降噪商务耳机', '客户情绪捕捉器', '商机指挥头戴', '销冠气场环', '全域商机洞察冠'],
    body: ['基础西装', '商务夹克', '大客户战袍', '区域总监礼服', '年度销冠披风', '战略客户统筹礼服'],
    badge: ['销售新人牌', '客户经理工牌', '金牌顾问徽章', '区域销冠铭牌', '传奇签单王名牌', '首席增长领航铭牌'],
    shoes: ['拜访皮鞋', '商机追踪鞋', '签约疾行鞋', '全国巡访靴', '一步成交履', '全域商机领航履'],
    accessory: ['名片盒', '客户关系沙盘', '商机雷达', '签约倒计时器', '无限订单印章', '战略客户共赢核'],
  },
  hr: {
    weapon: ['面谈记录夹', '人才画像板', '组织测评仪', '文化协同台', '梯队规划中枢', '百人同心名册'],
    head: ['亲和耳麦', '沟通洞察镜', '人才识别目镜', '组织感知头戴', '团队共鸣冠', '组织全景洞察冠'],
    body: ['基础通勤装', '招聘夹克', '员工关系战衣', '组织发展礼服', '首席人才披风', '全域组织统筹礼服'],
    badge: ['人事助理牌', '招聘顾问工牌', '人才伙伴徽章', '人力负责人铭牌', '组织设计师名牌', '首席人才战略铭牌'],
    shoes: ['面试便鞋', '校招行走鞋', '跨团队协调鞋', '组织巡游靴', '人才通路履', '组织协同领航履'],
    accessory: ['简历夹', '面试排期器', '人才雷达', '组织温度计', '团队活力核心', '人才生态协同核'],
  },
};

export interface GeneratedEquipment {
  profession: OfficeBattleProfession;
  slot: OfficeBattleEquipmentSlot;
  name: string;
  requiredLevel: number;
  equipmentLevel: number;
  rarity: OfficeBattleRarity;
  stats: Partial<OfficeBattleStats>;
  score: number;
  enhancementLevel: number;
}

export interface FighterDefinition {
  profession: OfficeBattleProfession;
  level: number;
  equipment: ReadonlyArray<{ stats: Partial<OfficeBattleStats> }>;
  skillLevels?: Readonly<Record<string, number>>;
}

export interface BattleLevelSnapshot {
  level: number;
  experienceInLevel: number;
  experienceToNextLevel: number | null;
}

export function isOfficeBattleProfession(value: unknown): value is OfficeBattleProfession {
  return typeof value === 'string' && OFFICE_BATTLE_PROFESSIONS.includes(value as OfficeBattleProfession);
}

export function roundHalfUpFraction(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('denominator must be positive');
  return floorDiv(numerator * 2n + denominator, denominator * 2n);
}

function floorDiv(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder < 0n ? quotient - 1n : quotient;
}

export function battleLevelSnapshot(totalExperience: number): BattleLevelSnapshot {
  const normalized = Math.max(0, Math.min(OFFICE_BATTLE_MAX_EXPERIENCE, Math.trunc(totalExperience)));
  let spent = 0;
  for (let level = 1; level < 60; level += 1) {
    const required = 80 + 20 * level;
    if (normalized < spent + required) {
      return { level, experienceInLevel: normalized - spent, experienceToNextLevel: required };
    }
    spent += required;
  }
  return { level: 60, experienceInLevel: 0, experienceToNextLevel: null };
}

export function createEquipmentDefinition(
  profession: OfficeBattleProfession,
  slot: OfficeBattleEquipmentSlot,
  rawLevel: number,
  rarity: OfficeBattleRarity,
): GeneratedEquipment {
  const level = Math.max(1, Math.min(60, Math.floor(rawLevel)));
  const rarityRule = RARITY_RULES[rarity];
  const levelPercent = 100 + (level - 1) * 8;
  const stats: Partial<OfficeBattleStats> = {};
  for (const [key, rawBase] of Object.entries(SLOT_BASE_STATS[slot]) as Array<
    [keyof OfficeBattleStats, number]
  >) {
    const scaled = Number(
      roundHalfUpFraction(
        BigInt(rawBase * levelPercent * rarityRule.multiplier),
        10_000n,
      ),
    );
    stats[key] = Math.max(1, scaled + rarityRule.fixed);
  }
  const stage = level < 10 ? 0 : level < 20 ? 1 : level < 30 ? 2 : level < 40 ? 3 : level < 50 ? 4 : 5;
  return {
    profession,
    slot,
    name: `${rarityRule.label}·${EQUIPMENT_NAMES[profession][slot][stage]}`,
    requiredLevel: level,
    equipmentLevel: level,
    rarity,
    stats,
    score: equipmentScore(stats),
    enhancementLevel: 0,
  };
}

export function equipmentScore(stats: Partial<OfficeBattleStats>): number {
  const hp = stats.hp ?? 0;
  const other = (stats.attack ?? 0) + (stats.defense ?? 0) + (stats.speed ?? 0) + (stats.luck ?? 0);
  return Number(roundHalfUpFraction(BigInt(hp * 35 + other * 100), 10n));
}

export function deriveBattleStats(fighter: FighterDefinition): OfficeBattleStats {
  const levelBonus = Math.max(0, Math.min(59, Math.floor(fighter.level) - 1));
  const base = BASE_STATS[fighter.profession];
  const result: OfficeBattleStats = {
    hp: base.hp + 8 * levelBonus,
    attack: base.attack + 2 * levelBonus,
    defense: base.defense + levelBonus,
    speed: base.speed + Math.floor(levelBonus / 2),
    luck: base.luck + Math.floor(levelBonus / 3),
  };
  for (const item of fighter.equipment) {
    for (const key of Object.keys(result) as Array<keyof OfficeBattleStats>) {
      result[key] += item.stats[key] ?? 0;
    }
  }
  const skillLevels = normalizeBattleSkillLevels(fighter.profession, fighter.skillLevels);
  for (const skill of battleSkillsForProfession(fighter.profession)) {
    const skillLevel = skillLevels[skill.id] ?? 0;
    for (const [key, amount] of Object.entries(skill.bonusPerLevel) as Array<
      [keyof OfficeBattleStats, number]
    >) {
      result[key] += amount * skillLevel;
    }
  }
  return result;
}

export function battleSkillsForProfession(profession: OfficeBattleProfession): OfficeBattleSkillDefinition[] {
  return OFFICE_BATTLE_SKILLS.filter((skill) => skill.profession === profession);
}

export function normalizeBattleSkillLevels(
  profession: OfficeBattleProfession,
  value: Readonly<Record<string, number>> | null | undefined,
): Record<string, number> {
  return Object.fromEntries(
    battleSkillsForProfession(profession).map((skill) => [
      skill.id,
      Math.max(0, Math.min(OFFICE_BATTLE_SKILL_MAX_LEVEL, Math.trunc(Number(value?.[skill.id] ?? 0)))),
    ]),
  );
}

export function battleSkillPointsEarned(level: number): number {
  return Math.min(15, 1 + Math.floor((Math.max(1, level) - 1) / 2));
}

export function battleSkillPointsAvailable(
  level: number,
  profession: OfficeBattleProfession,
  skillLevels: Readonly<Record<string, number>> | null | undefined,
): number {
  const normalized = normalizeBattleSkillLevels(profession, skillLevels);
  return Math.max(0, battleSkillPointsEarned(level) - Object.values(normalized).reduce((sum, value) => sum + value, 0));
}

export function nextBattleUnlock(
  level: number,
  profession: OfficeBattleProfession,
): { level: number; name: string; kind: 'skill' | 'rarity' } | null {
  const rarityUnlocks = [
    { level: 10, name: RARITY_RULES.uncommon.label, kind: 'rarity' as const },
    { level: 20, name: RARITY_RULES.rare.label, kind: 'rarity' as const },
    { level: 30, name: RARITY_RULES.epic.label, kind: 'rarity' as const },
    { level: 40, name: RARITY_RULES.legendary.label, kind: 'rarity' as const },
  ];
  const skillUnlocks = battleSkillsForProfession(profession)
    .filter((skill) => skill.unlockLevel > level)
    .map((skill) => ({ level: skill.unlockLevel, name: skill.name, kind: 'skill' as const }));
  return [...rarityUnlocks, ...skillUnlocks]
    .filter((item) => item.level > level)
    .sort((left, right) => left.level - right.level)[0] ?? null;
}

export function fighterPower(stats: OfficeBattleStats): number {
  return Number(
    roundHalfUpFraction(
      BigInt(stats.hp * 34 + stats.attack * 320 + stats.defense * 250 + stats.speed * 180 + stats.luck * 120),
      100n,
    ),
  );
}

export function communityServiceDate(instant: Date): string {
  const local = new Date(instant.getTime() + 8 * 60 * 60 * 1_000 - 5 * 60 * 60 * 1_000);
  return local.toISOString().slice(0, 10);
}

export function nextCommunityReset(instant: Date): Date {
  const shanghai = new Date(instant.getTime() + 8 * 60 * 60 * 1_000);
  const localReset = Date.UTC(
    shanghai.getUTCFullYear(),
    shanghai.getUTCMonth(),
    shanghai.getUTCDate() + (shanghai.getUTCHours() >= 5 ? 1 : 0),
    5,
  );
  return new Date(localReset - 8 * 60 * 60 * 1_000);
}

export function rarityForRoll(percentRoll: number): OfficeBattleRarity {
  const normalized = Math.max(0, Math.min(99.999999, percentRoll));
  if (normalized < 45) return 'common';
  if (normalized < 78) return 'uncommon';
  if (normalized < 94) return 'rare';
  if (normalized < 99) return 'epic';
  return 'legendary';
}

export function maxRarityForLevel(level: number): OfficeBattleRarity {
  return OFFICE_BATTLE_RARITIES[Math.min(4, Math.floor(Math.max(1, level) / 10))];
}
