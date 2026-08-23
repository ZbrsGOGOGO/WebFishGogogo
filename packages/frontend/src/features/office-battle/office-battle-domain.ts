export type BattleProfession =
  | 'developer'
  | 'product'
  | 'qa'
  | 'sales'
  | 'hr';

export type EquipmentSlot =
  | 'weapon'
  | 'head'
  | 'body'
  | 'badge'
  | 'shoes'
  | 'accessory';

export type EquipmentRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary';

const EQUIPMENT_RARITIES: readonly EquipmentRarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

export interface FighterStats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  luck: number;
}

export interface ProfessionDefinition {
  id: BattleProfession;
  name: string;
  shortName: string;
  mark: string;
  slogan: string;
  skillName: string;
  skillDescription: string;
  baseStats: FighterStats;
}

export interface EquipmentDefinition {
  id: string;
  profession: BattleProfession;
  slot: EquipmentSlot;
  name: string;
  level: number;
  rarity: EquipmentRarity;
  stats: Partial<FighterStats>;
  weaponCategory?: '轻型' | '中型' | '重型';
  weaponTrait?: 'combo' | 'stun' | 'block' | 'critical' | 'drain';
  weaponTraitLabel?: string;
  weaponTraitChance?: number;
}

export interface OfficeFighter {
  name: string;
  profession: BattleProfession;
  level: number;
  equipment: EquipmentDefinition[];
  skillRanks?: Record<string, number>;
}

export interface OfficeBattleLogEntry {
  round: number;
  actor: 'player' | 'opponent';
  kind: 'attack' | 'skill' | 'heal' | 'stun' | 'combo' | 'block' | 'counter' | 'result';
  text: string;
}

export interface OfficeBattleResult {
  winner: 'player' | 'opponent';
  playerRemainingHp: number;
  opponentRemainingHp: number;
  playerStats: FighterStats;
  opponentStats: FighterStats;
  rounds: number;
  logs: OfficeBattleLogEntry[];
}

export const EQUIPMENT_SLOTS: readonly {
  id: EquipmentSlot;
  name: string;
  mark: string;
}[] = [
  { id: 'weapon', name: '专业工具', mark: '器' },
  { id: 'head', name: '工作终端', mark: '端' },
  { id: 'body', name: '职业装', mark: '衣' },
  { id: 'badge', name: '工牌', mark: '牌' },
  { id: 'shoes', name: '通勤鞋', mark: '履' },
  { id: 'accessory', name: '随身件', mark: '件' },
] as const;

export const RARITY_DEFINITIONS: Record<
  EquipmentRarity,
  { label: string; prefix: string; multiplier: number }
> = {
  common: { label: '标准', prefix: '标准', multiplier: 1 },
  uncommon: { label: '精工', prefix: '精工', multiplier: 1.08 },
  rare: { label: '专业', prefix: '专业', multiplier: 1.18 },
  epic: { label: '卓越', prefix: '卓越', multiplier: 1.3 },
  legendary: { label: '代表作', prefix: '代表作', multiplier: 1.45 },
};

export const PROFESSION_DEFINITIONS: readonly ProfessionDefinition[] = [
  {
    id: 'developer',
    name: '程序员',
    shortName: '研发',
    mark: '</>',
    slogan: '把复杂问题拆成可以提交的下一步。',
    skillName: '紧急热修',
    skillDescription: '快速定位薄弱点，造成高额伤害。',
    baseStats: { hp: 112, attack: 17, defense: 10, speed: 12, luck: 8 },
  },
  {
    id: 'product',
    name: '产品经理',
    shortName: '产品',
    mark: 'PRD',
    slogan: '定义问题，也重新定义战场。',
    skillName: '需求冻结',
    skillDescription: '锁定本轮范围，有机会让对手暂停行动。',
    baseStats: { hp: 120, attack: 14, defense: 12, speed: 10, luck: 10 },
  },
  {
    id: 'qa',
    name: '测试',
    shortName: '测试',
    mark: 'BUG',
    slogan: '任何侥幸，最终都会被稳定复现。',
    skillName: '致命复现',
    skillDescription: '无视部分防御，稳定打出关键一击。',
    baseStats: { hp: 116, attack: 15, defense: 13, speed: 9, luck: 11 },
  },
  {
    id: 'sales',
    name: '销售员',
    shortName: '销售',
    mark: 'TOP',
    slogan: '机会出现时，就要一口气拿下。',
    skillName: '临门签单',
    skillDescription: '对状态不佳的对手造成额外终结伤害。',
    baseStats: { hp: 108, attack: 18, defense: 8, speed: 14, luck: 11 },
  },
  {
    id: 'hr',
    name: '人力资源管理',
    shortName: '人力',
    mark: 'HR',
    slogan: '让团队状态，永远比问题多一点余量。',
    skillName: '团队激励',
    skillDescription: '恢复士气后继续行动，擅长持久战。',
    baseStats: { hp: 126, attack: 13, defense: 12, speed: 10, luck: 9 },
  },
] as const;

export interface OfficeSkillDefinition {
  id: string;
  profession: BattleProfession | 'all';
  name: string;
  mark: string;
  description: string;
  maxRank: number;
  unlockLevel: number;
}

export const OFFICE_SKILLS: readonly OfficeSkillDefinition[] = [
  { id: 'focus', profession: 'all', name: '专注训练', mark: '专', description: '每级提高 2 点执行，适合稳定输出。', maxRank: 5, unlockLevel: 1 },
  { id: 'resilience', profession: 'all', name: '抗压训练', mark: '稳', description: '每级提高 10 点活力和 1 点抗压。', maxRank: 5, unlockLevel: 1 },
  { id: 'agility', profession: 'all', name: '协作步伐', mark: '快', description: '每级提高 2 点反应和 1 点洞察。', maxRank: 5, unlockLevel: 3 },
  { id: 'developer_mastery', profession: 'developer', name: '紧急热修', mark: 'FIX', description: '提高职业行动概率，连击型武器效果更稳定。', maxRank: 5, unlockLevel: 2 },
  { id: 'product_mastery', profession: 'product', name: '需求冻结', mark: 'LOCK', description: '提高职业行动概率，更擅长打断对手节奏。', maxRank: 5, unlockLevel: 2 },
  { id: 'qa_mastery', profession: 'qa', name: '致命复现', mark: 'BUG', description: '提高职业行动概率，同时增加洞察与抗压。', maxRank: 5, unlockLevel: 2 },
  { id: 'sales_mastery', profession: 'sales', name: '临门签单', mark: 'TOP', description: '提高职业行动概率，擅长暴击收尾。', maxRank: 5, unlockLevel: 2 },
  { id: 'hr_mastery', profession: 'hr', name: '团队激励', mark: 'UP', description: '提高职业行动概率，恢复效果更强。', maxRank: 5, unlockLevel: 2 },
] as const;

const SLOT_BASE_STATS: Record<EquipmentSlot, Partial<FighterStats>> = {
  weapon: { attack: 7 },
  head: { defense: 2, luck: 2 },
  body: { hp: 18, defense: 4 },
  badge: { attack: 2, luck: 3 },
  shoes: { defense: 2, speed: 4 },
  accessory: { hp: 8, luck: 4 },
};

const EQUIPMENT_NAMES: Record<
  BattleProfession,
  Record<EquipmentSlot, readonly string[]>
> = {
  developer: {
    weapon: ['薄膜键盘', '双屏调试台', '灰度发布终端', '并发编译阵列', '零停机架构台', '星环算力中枢'],
    head: ['有线耳机', '降噪耳机', '沉浸式监听耳机', '深夜发布头戴', '零故障思维环'],
    body: ['格子衬衫', '连帽卫衣', '发布作战服', '全栈机能外套', '首席架构风衣'],
    badge: ['实习工牌', '研发工牌', '核心提交者工牌', '技术负责人徽章', '传奇架构师铭牌'],
    shoes: ['办公拖鞋', '静音休闲鞋', '机房疾行鞋', '发布夜行靴', '零延迟步履'],
    accessory: ['橡皮鸭', '桌面机械臂', '智能代码助手', '故障预警核心', '无限算力方块'],
  },
  product: {
    weapon: ['需求便利贴', '用户旅程笔', '快速原型台', '版本路线罗盘', '跨部门决策盘', '全景产品沙盘'],
    head: ['框架眼镜', '用户洞察镜', '全景访谈耳机', '战略推演头戴', '需求先知冠'],
    body: ['基础通勤装', '访谈夹克', '评审战衣', '路线图风衣', '首席产品礼服'],
    badge: ['助理工牌', '产品工牌', '增长负责人徽章', '产品总监铭牌', '愿景掌舵者名牌'],
    shoes: ['会议室便鞋', '访谈行走鞋', '跨部门疾行鞋', '增长追踪靴', '全场景漫步者'],
    accessory: ['便利贴盒', '需求优先级沙盘', '用户画像终端', '增长曲线投影仪', '未来路线水晶'],
  },
  qa: {
    weapon: ['边界检查表', '缺陷探针', '自动回归台', '全链路压测仪', '混沌验证矩阵', '零遗漏验收核'],
    head: ['护眼镜', '像素观察镜', '异常捕捉目镜', '全链路扫描头戴', '真相洞察镜'],
    body: ['基础测试服', '回归夹克', '质量守门战衣', '全链路防护服', '零缺陷披风'],
    badge: ['测试助理工牌', '质量工牌', '缺陷猎手徽章', '质量负责人铭牌', '零缺陷守护印'],
    shoes: ['复测便鞋', '回归跑鞋', '环境巡检鞋', '全链路追踪靴', '无死角步履'],
    accessory: ['测试数据本', '自动化小车', '缺陷雷达', '环境镜像核心', '质量预言机'],
  },
  sales: {
    weapon: ['客户名片夹', '商机演示笔', '方案呈现台', '全域客户雷达', '关键谈判台', '年度签约金印'],
    head: ['通话耳麦', '降噪商务耳机', '客户情绪捕捉器', '商机指挥头戴', '销冠气场环'],
    body: ['基础西装', '商务夹克', '大客户战袍', '区域总监礼服', '年度销冠披风'],
    badge: ['销售新人牌', '客户经理工牌', '金牌顾问徽章', '区域销冠铭牌', '传奇签单王名牌'],
    shoes: ['拜访皮鞋', '商机追踪鞋', '签约疾行鞋', '全国巡访靴', '一步成交履'],
    accessory: ['名片盒', '客户关系沙盘', '商机雷达', '签约倒计时器', '无限订单印章'],
  },
  hr: {
    weapon: ['面谈记录夹', '人才画像板', '组织测评仪', '文化协同台', '梯队规划中枢', '百人同心名册'],
    head: ['亲和耳麦', '沟通洞察镜', '人才识别目镜', '组织感知头戴', '团队共鸣冠'],
    body: ['基础通勤装', '招聘夹克', '员工关系战衣', '组织发展礼服', '首席人才披风'],
    badge: ['人事助理牌', '招聘顾问工牌', '人才伙伴徽章', '人力负责人铭牌', '组织设计师名牌'],
    shoes: ['面试便鞋', '校招行走鞋', '跨团队协调鞋', '组织巡游靴', '人才通路履'],
    accessory: ['简历夹', '面试排期器', '人才雷达', '组织温度计', '团队活力核心'],
  },
};

const BASIC_ACTIONS: Record<BattleProfession, readonly string[]> = {
  developer: ['甩出一段紧急补丁', '用键盘声压制了对方', '提交了一记精准改动'],
  product: ['抛出一张优先级矩阵', '把对手拉进临时评审', '用需求边界完成反击'],
  qa: ['复现了对手的关键失误', '提交了一份高优缺陷', '用边界用例击中漏洞'],
  sales: ['用一轮强势提案发起进攻', '抓住商机连续施压', '递出一份无法拒绝的方案'],
  hr: ['发起一轮高强度沟通', '用组织洞察化解防线', '拿出人才盘点表精准反击'],
};

const OPPONENT_NAMES: Record<BattleProfession, readonly string[]> = {
  developer: ['隔壁组老周', '凌晨发布员', '神秘全栈同事'],
  product: ['会议室掌门人', '增长组小林', '路线图守门员'],
  qa: ['缺陷猎手阿岚', '回归组老陈', '环境守护者'],
  sales: ['华东销冠', '大客户猎手', '季度冲刺王'],
  hr: ['招聘季指挥官', '组织发展顾问', '面试间守护者'],
};

function professionDefinition(id: BattleProfession): ProfessionDefinition {
  return PROFESSION_DEFINITIONS.find((item) => item.id === id) ?? PROFESSION_DEFINITIONS[0];
}

function rarityIndex(rarity: EquipmentRarity): number {
  return EQUIPMENT_RARITIES.indexOf(rarity);
}

function scaleStats(
  stats: Partial<FighterStats>,
  level: number,
  multiplier: number,
  rarityBonus: number,
): Partial<FighterStats> {
  const levelScale = 1 + Math.max(0, level - 1) * 0.08;
  return Object.fromEntries(
    Object.entries(stats).map(([key, value]) => [
      key,
      Math.max(
        1,
        Math.round((value ?? 0) * levelScale * multiplier) + rarityBonus,
      ),
    ]),
  );
}

export function createEquipment(
  profession: BattleProfession,
  slot: EquipmentSlot,
  level: number,
  rarity: EquipmentRarity,
  serial = 0,
): EquipmentDefinition {
  const normalizedLevel = Math.max(1, Math.min(60, Math.floor(level)));
  const tier = Math.min(5, Math.floor(normalizedLevel / 10));
  const rarityDefinition = RARITY_DEFINITIONS[rarity];
  const slotNames = EQUIPMENT_NAMES[profession][slot];
  const baseName = slotNames[Math.min(tier, slotNames.length - 1)];
  const weaponTraits: Record<BattleProfession, {
    category: '轻型' | '中型' | '重型';
    trait: NonNullable<EquipmentDefinition['weaponTrait']>;
    label: string;
  }> = {
    developer: { category: '轻型', trait: 'combo', label: '连续提交' },
    product: { category: '中型', trait: 'stun', label: '会议定身' },
    qa: { category: '中型', trait: 'block', label: '稳定复现' },
    sales: { category: '重型', trait: 'critical', label: '暴击签单' },
    hr: { category: '中型', trait: 'drain', label: '团队回复' },
  };
  const weapon = slot === 'weapon' ? weaponTraits[profession] : undefined;
  return {
    id: `${profession}-${slot}-${normalizedLevel}-${rarity}-${serial}`,
    profession,
    slot,
    name: `${rarityDefinition.prefix}·${baseName}`,
    level: normalizedLevel,
    rarity,
    stats: scaleStats(
      SLOT_BASE_STATS[slot],
      normalizedLevel,
      rarityDefinition.multiplier,
      rarityIndex(rarity),
    ),
    ...(weapon ? {
      weaponCategory: weapon.category,
      weaponTrait: weapon.trait,
      weaponTraitLabel: weapon.label,
      weaponTraitChance: 0.12 + rarityIndex(rarity) * 0.035,
    } : {}),
  };
}

export function createStarterEquipment(
  profession: BattleProfession,
): EquipmentDefinition[] {
  return EQUIPMENT_SLOTS.map((slot, index) =>
    createEquipment(profession, slot.id, 1, 'common', index),
  );
}

export function deriveFighterStats(fighter: OfficeFighter): FighterStats {
  const base = professionDefinition(fighter.profession).baseStats;
  const levelBonus = Math.max(0, fighter.level - 1);
  const result: FighterStats = {
    hp: base.hp + levelBonus * 8,
    attack: base.attack + levelBonus * 2,
    defense: base.defense + levelBonus,
    speed: base.speed + Math.floor(levelBonus / 2),
    luck: base.luck + Math.floor(levelBonus / 3),
  };
  for (const item of fighter.equipment) {
    for (const key of Object.keys(item.stats) as Array<keyof FighterStats>) {
      result[key] += item.stats[key] ?? 0;
    }
  }
  const skills = fighter.skillRanks ?? {};
  result.attack += Math.max(0, skills.focus ?? 0) * 2;
  result.hp += Math.max(0, skills.resilience ?? 0) * 10;
  result.defense += Math.max(0, skills.resilience ?? 0);
  result.speed += Math.max(0, skills.agility ?? 0) * 2;
  result.luck += Math.max(0, skills.agility ?? 0);
  const mastery = Math.max(0, skills[`${fighter.profession}_mastery`] ?? 0);
  if (fighter.profession === 'developer') result.speed += mastery;
  if (fighter.profession === 'product') result.defense += mastery * 2;
  if (fighter.profession === 'qa') { result.defense += mastery; result.luck += mastery * 2; }
  if (fighter.profession === 'sales') result.attack += mastery * 2;
  if (fighter.profession === 'hr') result.hp += mastery * 12;
  return result;
}

export function fighterPower(fighter: OfficeFighter): number {
  const stats = deriveFighterStats(fighter);
  return Math.round(
    stats.hp * 0.34 +
      stats.attack * 3.2 +
      stats.defense * 2.5 +
      stats.speed * 1.8 +
      stats.luck * 1.2,
  );
}

export function createOpponent(
  playerProfession: BattleProfession,
  level: number,
  seed: number,
  difficulty = 0,
): OfficeFighter {
  const professions = PROFESSION_DEFINITIONS.map((item) => item.id);
  const profession = professions[Math.abs(seed + professions.indexOf(playerProfession) + 1) % professions.length];
  const names = OPPONENT_NAMES[profession];
  const opponentLevel = Math.min(
    60,
    Math.max(1, level + ((Math.abs(seed) % 3) - 1) + Math.max(0, difficulty)),
  );
  const equipment = createStarterEquipment(profession).map((item, index) =>
    createEquipment(
      profession,
      item.slot,
      opponentLevel,
      opponentLevel >= 10 && index === Math.abs(seed) % 6 ? 'uncommon' : 'common',
      seed + index,
    ),
  );
  return {
    name: names[Math.abs(seed) % names.length],
    profession,
    level: opponentLevel,
    equipment,
    skillRanks: opponentLevel >= 3 ? {
      focus: Math.min(3, Math.floor(opponentLevel / 8)),
      [`${profession}_mastery`]: Math.min(3, Math.floor(opponentLevel / 10)),
    } : {},
  };
}

export function createSeededRandom(seed: number): () => number {
  let state = (Math.floor(seed) || 1) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function clampDamage(value: number): number {
  return Math.max(1, Math.round(value));
}

export function resolveOfficeBattle(
  player: OfficeFighter,
  opponent: OfficeFighter,
  random: () => number = Math.random,
): OfficeBattleResult {
  const playerStats = deriveFighterStats(player);
  const opponentStats = deriveFighterStats(opponent);
  const hp = { player: playerStats.hp, opponent: opponentStats.hp };
  const maxHp = { player: playerStats.hp, opponent: opponentStats.hp };
  const fighters = { player, opponent };
  const stats = { player: playerStats, opponent: opponentStats };
  const logs: OfficeBattleLogEntry[] = [];
  const stunned = { player: false, opponent: false };
  const first =
    playerStats.speed === opponentStats.speed
      ? random() < 0.5
        ? 'player'
        : 'opponent'
      : playerStats.speed > opponentStats.speed
        ? 'player'
        : 'opponent';
  const order: Array<'player' | 'opponent'> =
    first === 'player' ? ['player', 'opponent'] : ['opponent', 'player'];

  let rounds = 0;
  for (let round = 1; round <= 10; round += 1) {
    rounds = round;
    for (const actor of order) {
      const target = actor === 'player' ? 'opponent' : 'player';
      if (hp[actor] <= 0 || hp[target] <= 0) continue;
      if (stunned[actor]) {
        stunned[actor] = false;
        logs.push({
          round,
          actor,
          kind: 'stun',
          text: `${fighters[actor].name}还困在上一轮会议里，错过了行动。`,
        });
        continue;
      }

      const definition = professionDefinition(fighters[actor].profession);
      const masteryRank = fighters[actor].skillRanks?.[`${fighters[actor].profession}_mastery`] ?? 0;
      const actorWeapon = fighters[actor].equipment.find((item) => item.slot === 'weapon');
      const targetWeapon = fighters[target].equipment.find((item) => item.slot === 'weapon');
      const skillTriggered = random() < 0.18 + stats[actor].luck * 0.002 + masteryRank * 0.025;
      const critical = random() < 0.08 + stats[actor].luck * 0.004 + (actorWeapon?.weaponTrait === 'critical' ? actorWeapon.weaponTraitChance ?? 0 : 0);
      const defenseFactor = fighters[actor].profession === 'qa' && skillTriggered ? 0.35 : 0.7;
      let multiplier = critical ? 1.55 : 1;
      let kind: OfficeBattleLogEntry['kind'] = 'attack';
      if (skillTriggered) {
        kind = 'skill';
        if (fighters[actor].profession === 'developer') multiplier *= 1.55;
        if (fighters[actor].profession === 'product') {
          multiplier *= 1.08;
          if (random() < 0.48) stunned[target] = true;
        }
        if (fighters[actor].profession === 'qa') multiplier *= 1.38;
        if (fighters[actor].profession === 'sales') {
          multiplier *= hp[target] <= maxHp[target] / 2 ? 1.85 : 1.25;
        }
        if (fighters[actor].profession === 'hr') {
          const healed = Math.max(4, Math.round(maxHp[actor] * 0.1));
          hp[actor] = Math.min(maxHp[actor], hp[actor] + healed);
          logs.push({
            round,
            actor,
            kind: 'heal',
            text: `${fighters[actor].name}发动「${definition.skillName}」，恢复 ${healed} 点士气。`,
          });
          multiplier *= 1.05;
        }
      }

      const deadlineMultiplier = round >= 8 ? 1 + (round - 7) * 0.18 : 1;
      let damage = clampDamage(
        stats[actor].attack * (0.95 + random() * 0.1) * multiplier * deadlineMultiplier -
          stats[target].defense * defenseFactor,
      );
      if (targetWeapon?.weaponTrait === 'block' && random() < (targetWeapon.weaponTraitChance ?? 0)) {
        damage = Math.max(1, Math.round(damage * 0.55));
        logs.push({
          round,
          actor: target,
          kind: 'block',
          text: `${fighters[target].name}通过「${targetWeapon.weaponTraitLabel}」提前发现问题，减免了部分伤害。`,
        });
      }
      hp[target] = Math.max(0, hp[target] - damage);
      const actionText = skillTriggered
        ? `发动「${definition.skillName}」`
        : BASIC_ACTIONS[fighters[actor].profession][
            Math.floor(random() * BASIC_ACTIONS[fighters[actor].profession].length)
          ];
      logs.push({
        round,
        actor,
        kind,
        text: `${fighters[actor].name}${actionText}，让${fighters[target].name}损失 ${damage} 点士气${critical ? '（暴击）' : ''}。`,
      });
      if (hp[target] > 0 && actorWeapon?.weaponTrait === 'combo' && random() < (actorWeapon.weaponTraitChance ?? 0)) {
        const comboDamage = Math.max(1, Math.round(damage * 0.45));
        hp[target] = Math.max(0, hp[target] - comboDamage);
        logs.push({ round, actor, kind: 'combo', text: `${fighters[actor].name}触发「${actorWeapon.weaponTraitLabel}」，追加 ${comboDamage} 点士气伤害。` });
      }
      if (hp[target] > 0 && actorWeapon?.weaponTrait === 'stun' && random() < (actorWeapon.weaponTraitChance ?? 0)) {
        stunned[target] = true;
        logs.push({ round, actor, kind: 'stun', text: `${fighters[actor].name}发起「${actorWeapon.weaponTraitLabel}」，${fighters[target].name}下回合无法行动。` });
      }
      if (actorWeapon?.weaponTrait === 'drain' && random() < (actorWeapon.weaponTraitChance ?? 0)) {
        const recovered = Math.max(2, Math.round(damage * 0.3));
        hp[actor] = Math.min(maxHp[actor], hp[actor] + recovered);
        logs.push({ round, actor, kind: 'heal', text: `${fighters[actor].name}通过「${actorWeapon.weaponTraitLabel}」恢复 ${recovered} 点士气。` });
      }
    }
    if (hp.player <= 0 || hp.opponent <= 0) break;
  }

  const winner =
    hp.player === hp.opponent
      ? playerStats.speed >= opponentStats.speed
        ? 'player'
        : 'opponent'
      : hp.player > hp.opponent
        ? 'player'
        : 'opponent';
  logs.push({
    round: rounds,
    actor: winner,
    kind: 'result',
    text:
      winner === 'player'
        ? `${player.name}守住了工位，赢下这场办公室乐斗。`
        : `${opponent.name}拿下本轮，整理装备后再来一次。`,
  });

  return {
    winner,
    playerRemainingHp: hp.player,
    opponentRemainingHp: hp.opponent,
    playerStats,
    opponentStats,
    rounds,
    logs,
  };
}

export function rollLoot(
  profession: BattleProfession,
  level: number,
  random: () => number = Math.random,
): EquipmentDefinition {
  const roll = random();
  const rarity: EquipmentRarity =
    roll < 0.01
      ? 'legendary'
      : roll < 0.06
        ? 'epic'
        : roll < 0.22
          ? 'rare'
          : roll < 0.55
            ? 'uncommon'
            : 'common';
  const slot = EQUIPMENT_SLOTS[Math.floor(random() * EQUIPMENT_SLOTS.length)].id;
  return createEquipment(profession, slot, level, rarity, Math.floor(random() * 1_000_000));
}

export function equipmentScore(item: EquipmentDefinition): number {
  const statsScore = Object.entries(item.stats).reduce(
    (total, [key, value]) => total + (key === 'hp' ? (value ?? 0) * 0.35 : (value ?? 0)),
    0,
  );
  return Math.round(statsScore * 10);
}

export function ensureLootUpgrade(
  candidate: EquipmentDefinition,
  equipped: EquipmentDefinition | undefined,
): EquipmentDefinition | null {
  if (!equipped || equipmentScore(candidate) > equipmentScore(equipped)) {
    return candidate;
  }

  const serial = candidate.id
    .split('-')
    .reduce((total, part) => total + part.length * 31, 0);
  const level = Math.max(candidate.level, equipped.level);
  const firstRarityIndex = Math.max(
    rarityIndex(candidate.rarity),
    rarityIndex(equipped.rarity) + 1,
  );

  for (let index = firstRarityIndex; index < EQUIPMENT_RARITIES.length; index += 1) {
    const promoted = createEquipment(
      candidate.profession,
      candidate.slot,
      level,
      EQUIPMENT_RARITIES[index],
      serial + index,
    );
    if (equipmentScore(promoted) > equipmentScore(equipped)) {
      return promoted;
    }
  }

  for (let nextLevel = level + 1; nextLevel <= 60; nextLevel += 1) {
    const promoted = createEquipment(
      candidate.profession,
      candidate.slot,
      nextLevel,
      'legendary',
      serial + nextLevel,
    );
    if (equipmentScore(promoted) > equipmentScore(equipped)) {
      return promoted;
    }
  }

  return null;
}
