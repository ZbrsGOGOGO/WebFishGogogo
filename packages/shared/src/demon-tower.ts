/** Public 九层妖塔 contracts. Seeds, RNG counters and internal combat state are never API data. */
export const DEMON_TOWER_ATTRIBUTE_KEYS = ['STR', 'SPD', 'AGI', 'DEF', 'LUCK'] as const;
export type DemonTowerAttribute = typeof DEMON_TOWER_ATTRIBUTE_KEYS[number];
export type DemonTowerAttributes = Record<DemonTowerAttribute, number>;
export type DemonTowerRarity = '凡' | '精' | '灵' | '仙' | '神';
export type DemonTowerWeaponId = 'w1' | 'w2' | 'w3' | 'w4' | 'w5' | 'w6' | 'w7' | 'w8' | 'w9' | 'w10' | 'w11' | 'w12' | 'w13' | 'w14' | 'w15' | 'w16' | 'w17' | 'w18' | 'w19' | 'w20';
export type DemonTowerSkillId = 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7' | 's8' | 's9' | 's10' | 's11' | 's12' | 's13' | 's14' | 's15' | 's16';
export type DemonTowerMaterial = 'ore' | 'herb' | 'soul' | 'clue';
export type DemonTowerMaterials = Record<DemonTowerMaterial, number>;
export type DemonTowerTerrain = 'plain' | 'lake' | 'mountain' | 'sea';
export type DemonTowerWeaponType = '重兵' | '轻兵' | '长兵' | '盾兵' | '法器';
export interface DemonTowerWeaponDefinition {
  id: DemonTowerWeaponId; name: string; type: DemonTowerWeaponType; attribute: DemonTowerAttribute;
  rarity: DemonTowerRarity; requiredLevel: number; baseBonus: number; qualityCap: number; description: string;
}
export interface DemonTowerSkillDefinition {
  id: DemonTowerSkillId; name: string; category: '回复' | '伤害' | '维度'; kind: 'active' | 'passive';
  rarity: DemonTowerRarity; requiredLevel: number; cooldown: number; qualityCap: number; description: string;
}
export interface DemonTowerFloorDefinition {
  floor: number; name: string; terrain: DemonTowerTerrain; requiredLevel: number; description: string;
  /** Public pre-battle warning, matching the server-controlled boss/elite mechanism. */
  mechanicHint: string;
  enemyNames: readonly string[]; bossName: string; bossMaxHp: number; passageRequired: number;
}
export interface DemonTowerCatalog {
  gameKey: 'demon-tower'; name: '九层妖塔'; version: 1; enabled: boolean;
  attributes: Readonly<Record<DemonTowerAttribute, string>>;
  materials: Readonly<Record<DemonTowerMaterial, string>>;
  weapons: readonly DemonTowerWeaponDefinition[]; skills: readonly DemonTowerSkillDefinition[];
  floors: readonly DemonTowerFloorDefinition[];
  starter: { weapons: readonly DemonTowerWeaponId[]; skills: readonly DemonTowerSkillId[]; loadout: DemonTowerLoadout };
  rules: { maxLevel: number; staminaCap: number; staminaRestoreMs: number; exploreCost: number;
    trainCost: number; restCost: number; bossCost: number; bossAttemptsPerDay: number;
    combatRoundLimit: number; bossRoundLimit: number; activeSkillSlots: number; passiveSkillSlots: number;
    dailyOfficeCoinCap: number; dailyActivityTarget: number; dailyActivityCoins: number; dailyLeaderboardCoins: number;
    restHealingPercent: number; healingRestoreMs: number; donationValues: { ore: number; clue: number };
    lootGuaranteeEvery: number; attributeResetCooldownMs: number;
    resetTimezone: 'Asia/Shanghai'; rulesText: readonly string[] };
}
export interface DemonTowerOwnedWeapon { id: DemonTowerWeaponId; quality: number; spareCopies: number }
export interface DemonTowerOwnedSkill { id: DemonTowerSkillId; quality: number; spareCopies: number }
export interface DemonTowerUpgradeCost {
  available: boolean; reason: 'max_quality' | 'level_required' | null; requiredLevel: number;
  spareCopies: number; materials: DemonTowerMaterials;
}
export interface DemonTowerLoadout {
  mainHand: DemonTowerWeaponId; artifact: DemonTowerWeaponId | null;
  /** Boss automation tries usable active skills in this order, then a normal attack. */
  activeSkills: DemonTowerSkillId[]; passiveSkills: DemonTowerSkillId[];
}
export interface DemonTowerEffectView { id: string; name: string; remainingTurns: number; magnitude: number }
export interface DemonTowerCombatantView {
  id: string; name: string; hp: number; maxHp: number; shield: number;
  attributes: DemonTowerAttributes; effects: DemonTowerEffectView[];
}
export interface DemonTowerCombatLog {
  turn: number; actor: 'player' | 'enemy' | 'system'; kind: 'damage' | 'heal' | 'shield' | 'effect' | 'dodge' | 'defeat' | 'reward' | 'info';
  text: string; amount?: number; targetId?: string;
}
export interface DemonTowerBattleView {
  id: string; kind: 'explore'; floor: number; turn: number; roundLimit: number;
  player: DemonTowerCombatantView; enemies: DemonTowerCombatantView[];
  availableSkills: Array<{ id: DemonTowerSkillId; cooldownRemaining: number; usable: boolean }>;
  log: DemonTowerCombatLog[];
}
export interface DemonTowerBattleReport {
  id: string; kind: 'explore' | 'boss'; floor: number; outcome: 'victory' | 'defeat' | 'fled' | 'timeout' | 'contributed';
  turns: number; damage: number; experience: number; materials: DemonTowerMaterials;
  /** Actual credited coins are returned by the service receipt, not this combat simulation. */
  log: DemonTowerCombatLog[]; completedAt: number;
}
export interface DemonTowerDailyView {
  serviceDate: string; activity: number; activityTarget: number; rewardClaimed: boolean;
  bossAttempts: number; bossAttemptsMax: number; officeCoinsEarned: number; officeCoinCap: number;
}
export interface DemonTowerProfileView {
  version: number; level: number; experience: number; experienceToNext: number; totalExperience: number;
  attributes: DemonTowerAttributes; effectiveAttributes: DemonTowerAttributes; unspentPoints: number;
  /** Only spent free points are refundable; null means a first reset has no cooldown. */
  attributeReset: { allocatedPoints: number; eligibleAt: number | null };
  hp: number; maxHp: number; stamina: number; staminaMax: number; nextStaminaAt: number | null;
  materials: DemonTowerMaterials; weapons: DemonTowerOwnedWeapon[]; skills: DemonTowerOwnedSkill[];
  loadout: DemonTowerLoadout; selectedFloor: number; personalUnlockedFloor: number;
  daily: DemonTowerDailyView; battle: DemonTowerBattleView | null; lastReport: DemonTowerBattleReport | null;
  availableActions: DemonTowerActionKind[]; createdAt: number;
}
export interface DemonTowerWorldView {
  version: number; unlockedFloor: number; currentFloor: number; phase: 'boss' | 'passage' | 'complete';
  boss: { name: string; hp: number; maxHp: number }; passage: { current: number; required: number };
  completedFloors: number[]; updatedAt: number;
}
export interface DemonTowerOverview {
  serverNow: number; profile: DemonTowerProfileView | null; world: DemonTowerWorldView;
  wallet: { officeCoinBalance: number }; writesEnabled: boolean;
}
export type DemonTowerAction =
  | { kind: 'enroll'; payload: Record<string, never> }
  | { kind: 'explore'; payload: Record<string, never> }
  | { kind: 'attack'; payload: { targetId: string } }
  | { kind: 'skill'; payload: { skillId: DemonTowerSkillId; targetId?: string } }
  | { kind: 'flee'; payload: Record<string, never> }
  | { kind: 'train'; payload: Record<string, never> }
  | { kind: 'rest'; payload: Record<string, never> }
  | { kind: 'equip'; payload: DemonTowerLoadout }
  | { kind: 'allocate'; payload: { attribute: DemonTowerAttribute; points: number } }
  | { kind: 'reset_attributes'; payload: Record<string, never> }
  | { kind: 'upgrade'; payload: { itemType: 'weapon' | 'skill'; itemId: DemonTowerWeaponId | DemonTowerSkillId } }
  | { kind: 'select_floor'; payload: { floor: number } }
  | { kind: 'challenge_boss'; payload: { floor: number } }
  | { kind: 'donate'; payload: { floor: number; material: 'ore' | 'clue'; amount: number } }
  | { kind: 'claim_reward'; payload: Record<string, never> };
export type DemonTowerActionKind = DemonTowerAction['kind'];
export type DemonTowerActionInput = DemonTowerAction & { requestId: string; expectedVersion: number };
export interface DemonTowerActionReceipt {
  requestId: string; replayed: boolean; overview: DemonTowerOverview;
  events: string[]; officeCoinsGranted: number; effectiveBossDamage: number; passageContribution: number;
}
export interface DemonTowerLeaderboardEntry {
  rank: number; publicId: string; displayName: string; level: number;
  bossDamage: number; passageContribution: number; score: number;
}
export interface DemonTowerLeaderboard {
  serverNow: number; serviceDate: string; entries: DemonTowerLeaderboardEntry[];
  me: DemonTowerLeaderboardEntry | null; rewardDescription: string;
  award: { officeCoins: number; status: 'pending' | 'awarded' | 'no_eligible_player'; winnerPublicId: string | null };
}
export interface DemonTowerContributions {
  serverNow: number; floor: number; entries: DemonTowerLeaderboardEntry[];
  me: DemonTowerLeaderboardEntry | null; rewardDescription: string;
}

const weapon = (id: DemonTowerWeaponId, name: string, type: DemonTowerWeaponType, attribute: DemonTowerAttribute,
  rarity: DemonTowerRarity, requiredLevel: number, baseBonus: number, description: string): DemonTowerWeaponDefinition =>
  ({ id, name, type, attribute, rarity, requiredLevel, baseBonus, qualityCap: ({ 凡: 3, 精: 5, 灵: 7, 仙: 9, 神: 9 })[rarity], description });
const skill = (id: DemonTowerSkillId, name: string, category: DemonTowerSkillDefinition['category'], kind: DemonTowerSkillDefinition['kind'],
  rarity: DemonTowerRarity, requiredLevel: number, cooldown: number, description: string): DemonTowerSkillDefinition =>
  ({ id, name, category, kind, rarity, requiredLevel, cooldown, qualityCap: ({ 凡: 3, 精: 5, 灵: 7, 仙: 9, 神: 9 })[rarity], description });

export const DEMON_TOWER_WEAPONS: readonly DemonTowerWeaponDefinition[] = [
  weapon('w1', '斩马刀', '重兵', 'STR', '精', 1, 6, '破甲：目标防御不低于自身力量时，伤害增加15%。'),
  weapon('w2', '玄铁锤', '重兵', 'STR', '灵', 12, 10, '震慑：命中有20%概率使目标跳过一次行动。'),
  weapon('w3', '裂岳斧', '重兵', 'STR', '仙', 28, 16, '蓄力：连续3回合未损失生命后，下次攻击伤害增加40%。'),
  weapon('w4', '镇魂钺', '重兵', 'STR', '神', 48, 23, '吸血：实际造成伤害的20%恢复生命，不超过生命上限。'),
  weapon('w5', '鱼肠匕', '轻兵', 'AGI', '精', 1, 6, '背刺：本场先手时，首次普通攻击必定暴击。'),
  weapon('w6', '秋水短剑', '轻兵', 'AGI', '灵', 12, 10, '连击：普通攻击命中有30%概率追加0.5倍敏捷伤害。'),
  weapon('w7', '影刃', '轻兵', 'AGI', '仙', 28, 16, '残影：成功闪避后，反击1倍敏捷伤害。'),
  weapon('w8', '无影双匕', '轻兵', 'AGI', '神', 48, 23, '极速：常驻敏捷+15，普通攻击分为两段，每段65%伤害。'),
  weapon('w9', '梨花枪', '长兵', 'SPD', '精', 1, 6, '突刺：决定先后手时，额外获得15速度。'),
  weapon('w10', '方天画戟', '长兵', 'SPD', '灵', 12, 10, '横扫：普通攻击同时命中所有存活敌人，伤害不衰减。'),
  weapon('w11', '寒梅枪', '长兵', 'SPD', '仙', 28, 16, '穿云：直接攻击无视目标25%防御。'),
  weapon('w12', '龙渊戟', '长兵', 'SPD', '神', 48, 23, '龙吟：普通攻击追加一段50%伤害，并向其他敌人溅射40%伤害。'),
  weapon('w13', '罡气盾', '盾兵', 'DEF', '精', 1, 6, '格挡：受到直接攻击伤害减少20%，成功免伤/闪避仍为0。'),
  weapon('w14', '玄铁锏', '盾兵', 'DEF', '灵', 12, 10, '反震：直接攻击实际损失生命的25%反弹给攻击者，不触发连锁。'),
  weapon('w15', '玄武盾', '盾兵', 'DEF', '仙', 28, 16, '壁垒：每场战斗开始获得1.5倍防御护盾。'),
  weapon('w16', '不动明王盾', '盾兵', 'DEF', '神', 48, 23, '绝对防御：受到直接攻击时，有10%概率完全免伤。'),
  weapon('w17', '摄魂铃', '法器', 'LUCK', '精', 1, 6, '惑心：敌方命中与闪避概率分别降低15个百分点。'),
  weapon('w18', '招妖幡', '法器', 'LUCK', '灵', 12, 10, '召灵：每2回合对当前存活敌人造成0.5倍幸运伤害。'),
  weapon('w19', '乾坤壶', '法器', 'LUCK', '仙', 28, 16, '聚气：修炼获得的妖塔经验增加30%。'),
  weapon('w20', '混元幡', '法器', 'LUCK', '神', 48, 23, '改命：常驻幸运+15，探索物品掉落概率增加10个百分点。'),
];
export const DEMON_TOWER_SKILLS: readonly DemonTowerSkillDefinition[] = [
  skill('s1', '回春术', '回复', 'active', '凡', 1, 3, '恢复20+2倍幸运生命，不超过生命上限。'),
  skill('s2', '裂地斩', '伤害', 'active', '凡', 1, 2, '造成2倍力量伤害；自身下一回合速度降低25%。'),
  skill('s3', '铁壁', '维度', 'active', '凡', 1, 3, '获得1.5倍防御护盾，持续2回合；品质提升护盾量。'),
  skill('s4', '力之祝福', '维度', 'active', '凡', 1, 4, '力量增加10，持续3回合。'),
  skill('s5', '疾影连刺', '伤害', 'active', '精', 6, 2, '连续攻击3段，每段0.6倍速度伤害，逐段结算护盾。'),
  skill('s6', '毒刃', '伤害', 'active', '精', 6, 2, '造成0.5倍敏捷伤害，并在随后2个回合末造成0.3倍敏捷毒伤。'),
  skill('s7', '幻身', '维度', 'active', '精', 6, 3, '暴击率增加25个百分点、闪避率增加20个百分点，持续2回合。'),
  skill('s8', '幸运星', '维度', 'passive', '精', 6, 0, '常驻幸运+8，并提高探索宝箱获得经验和材料的数量。'),
  skill('s9', '疗伤真气', '回复', 'passive', '灵', 18, 0, '存活时每个回合结束恢复0.5倍幸运生命。'),
  skill('s10', '灭却斩', '伤害', 'active', '灵', 18, 3, '造成1.5倍力量伤害；对首领或精英再增加50%。'),
  skill('s11', '风之祝福', '维度', 'passive', '灵', 18, 0, '常驻速度+8。'),
  skill('s12', '生生不息', '回复', 'passive', '灵', 18, 0, '战斗外生命自动恢复速度增加30%。'),
  skill('s13', '续命丹心', '回复', 'active', '仙', 36, 0, '每场一次：恢复至至少50%生命，并保留一次致命伤后50%生命复起的效果。'),
  skill('s14', '全维淬炼', '维度', 'active', '仙', 36, 5, '五属性各增加5，持续2回合。'),
  skill('s15', '气运一击', '伤害', 'active', '仙', 36, 4, '造成1至4倍幸运的随机伤害，随机数仅由服务器生成。'),
  skill('s16', '崩山击', '伤害', 'active', '仙', 36, 4, '造成3倍力量伤害，并使目标防御降低30%，持续2回合。'),
];
const DEMON_TOWER_MECHANIC_HINTS: Record<number, string> = {
  1: '犼野守关者与精英先蓄力、下次行动重击（1.35倍）；蓄力不攻击，震慑可打断，提前铁壁或治疗可应对。',
  2: '湖雾妖物先预告毒雾、下次弱攻击穿透护盾才施加2回合毒伤；毒不叠层，护盾与治疗都有效。',
  3: '山岭守关者与精英带有限护盾，第4回合举盾时不会攻击；可先清其他敌人，或趁举盾治疗。',
  4: '潮毒先预告、下次弱攻击穿透护盾才施加2回合毒伤；震慑打断预备，持续毒可由护盾吸收。',
  5: '赤风重击在蓄力后释放（1.8倍），蓄力时不攻击；控制打断或提前护盾，比硬扛更稳。',
  6: '寒星护势仅提供有限护盾，第4回合再次举盾并放弃攻击；首领盾量按楼层强度，不按共享总生命计算。',
  7: '鸣雷守关者与精英先蓄力、下次释放1.8倍重击；可在预告回合治疗、护盾，或以震慑打断。',
  8: '归墟毒雾先预告，随后弱攻击穿透护盾才上2回合毒伤；毒伤不叠层，提前防护可阻止中毒。',
  9: '镇塔灵带有限护势，第4回合举盾时放弃攻击；盾量不随全服血池增长，普通配装也能贡献有效伤害。',
};
export const DEMON_TOWER_FLOORS: readonly DemonTowerFloorDefinition[] = ([
  { floor: 1, name: '犼野平原', terrain: 'plain', requiredLevel: 1, description: '草海与古道交汇，新手也能参与守关者与通道协作。', enemyNames: ['游荡妖卒', '荒原狼', '石甲蜥'], bossName: '百战羚王·犼野', bossMaxHp: 2400, passageRequired: 60 },
  { floor: 2, name: '雾隐镜湖', terrain: 'lake', requiredLevel: 5, description: '雾气深处藏着水底贝匣，灵草在湖畔生长。', enemyNames: ['碧鳞鱼妖', '雾隐盗', '泽畔水鬼'], bossName: '镜湖灵蜃·照影', bossMaxHp: 7000, passageRequired: 110 },
  { floor: 3, name: '裂石群山', terrain: 'mountain', requiredLevel: 12, description: '矿砂与残卷散落山径，厚甲妖物守着石窟。', enemyNames: ['山魈', '裂石魔', '石甲蜥'], bossName: '裂岳山君·磐岳', bossMaxHp: 15000, passageRequired: 180 },
  { floor: 4, name: '潮生之海', terrain: 'sea', requiredLevel: 22, description: '踏过退潮礁石，合力修筑通往高塔的栈桥。', enemyNames: ['潮生海妖', '礁石蟹将', '怒涛游魂'], bossName: '沧潮蛟君·覆浪', bossMaxHp: 28000, passageRequired: 260 },
  { floor: 5, name: '赤风荒原', terrain: 'plain', requiredLevel: 36, description: '赤风掠过断戟，成群妖卒考验横扫与防御配装。', enemyNames: ['赤风妖骑', '荒原兽卫', '火羽妖禽'], bossName: '赤羽妖侯·焚翎', bossMaxHp: 47000, passageRequired: 360 },
  { floor: 6, name: '寒星冰湖', terrain: 'lake', requiredLevel: 52, description: '冰湖映出繁星，速度与续航让探索更加从容。', enemyNames: ['冰鳞灵妖', '寒雾守卫', '星霜影兽'], bossName: '寒星玄龟·凝霜', bossMaxHp: 74000, passageRequired: 480 },
  { floor: 7, name: '雷鸣绝岭', terrain: 'mountain', requiredLevel: 72, description: '雷光照亮古代封印，各流派一起收集修复材料。', enemyNames: ['雷羽山魈', '鸣石魔像', '奔霆兽'], bossName: '鸣霄雷猿·震岳', bossMaxHp: 110000, passageRequired: 620 },
  { floor: 8, name: '归墟深海', terrain: 'sea', requiredLevel: 94, description: '古楼船停泊归墟，守关者与群妖共同守护最后航道。', enemyNames: ['归墟幽鳞', '深海甲将', '沉舟妖灵'], bossName: '归墟鲲影·吞澜', bossMaxHp: 155000, passageRequired: 780 },
  { floor: 9, name: '九霄天台', terrain: 'mountain', requiredLevel: 110, description: '九层云阶汇聚众人贡献，最终封印完成后仍可自由探索。', enemyNames: ['云阶妖卫', '天台影将', '九霄灵兽'], bossName: '九霄镇塔灵·太初', bossMaxHp: 210000, passageRequired: 1000 },
] satisfies Array<Omit<DemonTowerFloorDefinition, 'mechanicHint'>>).map((floor) => ({ ...floor, mechanicHint: DEMON_TOWER_MECHANIC_HINTS[floor.floor] }));
export const DEMON_TOWER_CATALOG: DemonTowerCatalog = {
  gameKey: 'demon-tower', name: '九层妖塔', version: 1, enabled: true,
  attributes: { STR: '力量', SPD: '速度', AGI: '敏捷', DEF: '防御', LUCK: '幸运' },
  materials: { ore: '玄铁砂', herb: '灵草', soul: '妖塔残魂', clue: '通道线索' },
  weapons: DEMON_TOWER_WEAPONS, skills: DEMON_TOWER_SKILLS, floors: DEMON_TOWER_FLOORS,
  starter: { weapons: ['w1', 'w5', 'w9', 'w13', 'w17'], skills: ['s1', 's2', 's3', 's4'],
    loadout: { mainHand: 'w1', artifact: 'w17', activeSkills: ['s2', 's1', 's3'], passiveSkills: [] } },
  rules: { maxLevel: 120, staminaCap: 100, staminaRestoreMs: 180_000, exploreCost: 5, trainCost: 6, restCost: 5,
    bossCost: 10, bossAttemptsPerDay: 3, combatRoundLimit: 12, bossRoundLimit: 5, activeSkillSlots: 3, passiveSkillSlots: 2,
    dailyOfficeCoinCap: 200, dailyActivityTarget: 3, dailyActivityCoins: 30, dailyLeaderboardCoins: 100,
    restHealingPercent: 50, healingRestoreMs: 30_000, donationValues: { ore: 1, clue: 5 }, lootGuaranteeEvery: 4,
    attributeResetCooldownMs: 86_400_000, resetTimezone: 'Asia/Shanghai',
    rulesText: [
      '完全免费；没有充值、付费战力或第二种通用货币。妖塔等级、体力和材料独立于平台账号成长。',
      '开局赠送五类基础武器和四个基础技能，可立即选择流派；主手一件、副法器一件、主动技能三个、被动技能两个。',
      '法器也可作为主手，普通攻击按主手对应属性计算；同一件武器不能同时占据主手和副法器槽。',
      '战斗外可免费重置已分配自由点，首次随时可用、以后每24小时一次；固有属性保留，不提供治疗或额外资源。',
      '普通战斗每次操作一个回合，无实时倒计时；世界首领按配装技能优先顺序自动进行最多五回合。',
      '世界首领伤害与通道材料由全服共享，不要求实时组队或最低人数；后来者可探索已解锁楼层。',
      '妖塔日常办公币最多200枚/上海自然日，由平台统一钱包结算；没有额外付费或承诺返利。',
      '重复物品保留为副本。升阶必定成功：优先消耗一个副本，否则使用独立材料；到品质上限仍保留副本。',
      '每4次可掉落的探索结算至少获得1件武器或技能；保底优先当前等级可用的未收录物品，武器与技能交替补齐。',
      '战斗外生命与体力按服务器时间恢复，战斗内不自动回血；负伤可以休整。',
  ] },
};

/** Display helper only. The server recomputes against locked, owned inventory. */
export function demonTowerUpgradeCost(itemType: 'weapon' | 'skill', itemId: string, quality: number, spareCopies: number, level: number): DemonTowerUpgradeCost {
  const item = (itemType === 'weapon' ? DEMON_TOWER_WEAPONS : DEMON_TOWER_SKILLS).find((entry) => entry.id === itemId);
  const materials: DemonTowerMaterials = { ore: 0, herb: 0, soul: 0, clue: 0 };
  const next = quality + 1;
  const requiredLevel = Math.max(item?.requiredLevel ?? 120, Math.max(1, (next - 2) * 8));
  const reason = !item || quality >= item.qualityCap ? 'max_quality' : level < requiredLevel ? 'level_required' : null;
  if (spareCopies < 1 && item) {
    if (itemType === 'weapon') materials.ore = 3 + next * 3;
    else materials.herb = 2 + next * 2;
    materials.soul = Math.max(1, next);
  }
  return { available: reason === null, reason, requiredLevel, spareCopies: spareCopies > 0 ? 1 : 0, materials };
}
