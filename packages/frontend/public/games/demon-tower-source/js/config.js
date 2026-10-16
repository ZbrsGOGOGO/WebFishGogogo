/* =========================================================================
 * 九层妖塔 · 配置/数据层 (config.js)
 * 集中承载设计文档中的全部静态数值与公式常量。
 * 纯客户端运行；后端只接管需要跨会话持久化的存档（见 JiucengController）。
 * ========================================================================= */
(function (global) {
  'use strict';

  /* ---------- 五维 ---------- */
  const DIMS = [
    { key: 'str', name: '力量', role: '伤害', color: '#d98c5f' },
    { key: 'spd', name: '速度', role: '先手+额外回合', color: '#5fa8d9' },
    { key: 'agi', name: '敏捷', role: '闪避+暴击', color: '#7bd97b' },
    { key: 'def', name: '防御', role: '减伤', color: '#d9cf5f' },
    { key: 'luc', name: '幸运', role: '暴击+爆率', color: '#c98cd9' }
  ];

  /* ---------- 经验曲线（1~49 使用附件原曲线，其后线性外推） ---------- */
  const REAL_NEED = [40,80,120,160,210,260,320,370,430,490,
    550,610,680,750,810,880,950,1020,1090,1200,
    1350,1550,1800,2100,2450,2850,3300,3800,4350,4950,
    5600,6300,7050,7850,8700,9600,10550,11550,12600,13700,
    14850,16050,17300,18600,19950,21350,22800,24300,25850];
  function xpNeed(lv) {
    if (lv <= 0) return 0;
    return REAL_NEED[lv - 1] !== undefined ? REAL_NEED[lv - 1] : REAL_NEED[48] + (lv - 49) * 1500;
  }
  /* ---------- 体力 / 货币 ---------- */
  const STAMINA_MAX = 100;
  const STAMINA_PER_EXPLORE = 1;
  const STAMINA_PER_BOSS = 5;
  const STAMINA_PER_SPAR = 10;           // 切磋（无论输赢）每场体力消耗
  const DESTINY_AWAKEN_ODDS = 0.6;       // 每 15 级突破时觉醒命格的概率
  const STAMINA_REGEN_MIN = 14;          // 约 1 点 / 14 分钟
  const EXPLORE_DAILY_LIMIT = 10;        // 前 10 次普通探索
  const BOSS_DAILY_LIMIT = 10;           // 前 10 次妖塔 BOSS（硬上限，不靠探索符延长，用于压慢节奏）
  const TALISMAN_PRICE = 30;             // 探索符 30 办公币/张
  const TALISMAN_DAILY_MAX = 5;          // 每日 0 点自动补满的探索符上限
  // 天赋升级领悟率：索引 = 升到的目标等级（1..10）的基础概率，越往上越难领悟
  const TALENT_RATE_BY_LV = [0, 0.96, 0.92, 0.88, 0.84, 0.80, 0.74, 0.68, 0.60, 0.52, 0.45];

  /* ---------- 附件原有可调参数；本站当前只读，使用内置默认值 ---------- */
  /* 默认与历史一致；后端 /api/settings 下发的同路径值会在运行时覆盖它们。 */
  const TUNE = {
    bpExploreRate: 0.04, bpSecretRate: 0.3, bpBossLowRate: 0.12, bpBossHighRate: 0.25,
    jinchiExploreRate: 0.01, jinchiBossRate: 0.03, jinchiSecretRate: 0.02,
    exploreRareMatChance: 0.5, exploreRareCtRate: 0.5, exploreAuxCuijlChance: 0.35,
    mtDropMin: 1, mtDropMax: 3, exploreSpiritMatChance: 0.4, exploreNingzChance: 0.2, highMatChance: 0.3,
    exploreGreenMatChance: 0.45,
    bossHpBase: 1200, bossHpGrowth: 1.25, bossAtkBase: 12, bossAtkPerLayer: 14, bossDefBase: 6, bossDefPerLayer: 10
  };

  /* ---------- 档位 / 称号（120 级 = 8 档） ---------- */
  function tierOf(level) { return Math.floor((level - 1) / 15) + 1; }
  const TIERS = [
    { t: 1, lv: [1, 15], title: '寻道者' },
    { t: 2, lv: [16, 30], title: '御灵者' },
    { t: 3, lv: [31, 45], title: '镇妖使' },
    { t: 4, lv: [46, 60], title: '伏魔卫' },
    { t: 5, lv: [61, 75], title: '塔院' },
    { t: 6, lv: [76, 90], title: '妖王候' },
    { t: 7, lv: [91, 105], title: '镇塔真君' },
    { t: 8, lv: [106, 120], title: '无相尊者' }
  ];
  function titleOf(level) {
    const t = tierOf(level);
    return (TIERS[t - 1] || TIERS[TIERS.length - 1]).title;
  }

  /* ---------- 天生命格（8，永久被动） §5.5② ---------- */
  const GIFTS = [
    { id: 'str',  name: '天生神力', dim: 'str',  desc: '力量 +8' },
    { id: 'spd',  name: '疾如雷电', dim: 'spd',  desc: '速度 +8' },
    { id: 'agi',  name: '身轻如燕', dim: 'agi',  desc: '敏捷 +8，暴击 +5%' },
    { id: 'def',  name: '钢筋铁骨', dim: 'def',  desc: '防御 +8，受伤 -10%' },
    { id: 'luc',  name: '气运之子', dim: 'luc',  desc: '幸运 +8' },
    { id: 'arms', name: '兵器通神', desc: '武器伤害 ×1.2' },
    { id: 'iron', name: '金刚不坏', desc: '每场开局获得护盾' },
    { id: 'feign',name: '装死',     desc: '每场战斗一次免死' }
  ];


  /* ---------- 稀有度 ↔ 等级 / 概率 §5.4 ---------- */
  const RARITY = {
    '凡': { tier: 3, weaponDropTier: 1, weaponEquipTier: 1, pool: 0.00, maxPlus: 3 },
    '精': { tier: 3, weaponDropTier: 1, weaponEquipTier: 2, pool: 0.40, maxPlus: 5 },
    '灵': { tier: 2, weaponDropTier: 2, weaponEquipTier: 3, pool: 0.30, maxPlus: 7 },
    '仙': { tier: 1, weaponDropTier: 3, weaponEquipTier: 4, pool: 0.20, maxPlus: 9 },
    '神': { tier: 0, weaponDropTier: 4, weaponEquipTier: 5, pool: 0.10, maxPlus: 9 }
  };

  /* ---------- 天赋系统（气机武学树，升级领悟 §9.2） ---------- */
  // cat: 根骨/武势/武诀/身形；max: 等级上限；learnLv: 可领悟的最低角色等级；jing: 天赋点升级消耗/级
  // 内部 id 仅用于战斗引擎挂钩，玩家不可见；下方名称/描述/数值均为本游戏（九层）原创设计，围绕「气机」资源展开。
  const TALENTS = [
    // —— 一、根骨天赋（天赋点淬炼，上限 10 重，Lv1 起）——
    { id: 'tStr',  icon: '🪨', name: '玄力铸筋', cat: '根骨', max: 10, learnLv: 1,  jing: 4, desc: '膂力+气机上限。近战命中积地力，满3层下一击撕裂对方气脉（被动延迟1回合）', eff: '资源堆叠+封被动窗口' },
    { id: 'tAgi',  icon: '👁️', name: '灵眸锻巧', cat: '根骨', max: 10, learnLv: 1,  jing: 10, desc: '灵巧+气机上限。闪避成功获【机锋】，机锋下连击判定优先于敌格挡', eff: '机锋最多1层，持续1回合' },
    { id: 'tSpd',  icon: '🌬️', name: '踏风根行', cat: '根骨', max: 10, learnLv: 1,  jing: 8, desc: '行速+气机上限。先手+2气机；连续两回合先手，下次攻击剥夺对手1气机', eff: '压制对方释放武诀' },
    { id: 'tHp',   icon: '🛡️', name: '厚土养躯', cat: '根骨', max: 10, learnLv: 1,  jing: 10, desc: '生机上限+承载力。生机<30%开【土御】：受击生气机，恢复减半至生机>50%', eff: '残血续机' },
    { id: 'tAll',  icon: '☯️', name: '五象融身', cat: '根骨', max: 10, learnLv: 1,  jing: 4, desc: '力敏速+气机上限（稀有）。劣势不流失气机，负面状态持续-1回合', eff: '环境适应与减控' },

    // —— 二、常驻武势（战场条件触发，部分最高 5 重）——
    { id: 'tWeapon',   icon: '⚔️', name: '锋器通悟', cat: '武势', max: 5, learnLv: 5,  jing: 8, desc: '兵刃命中积【锋劲】≤3层；满层下一击无视半数气垣格挡；满重抑制对手武器武势', eff: '由固定加成改为积攒锋劲破防' },
    { id: 'tUnarmed',  icon: '🤜', name: '赤手搏道', cat: '武势', max: 5, learnLv: 5,  jing: 2, desc: '空手命中挂【缠劲】2回合；缠劲下敌释放主动武诀额外耗2气机', eff: '缠劲不可叠加，命中刷新' },
    { id: 'tCombo',    icon: '🌀', name: '连环破势', cat: '武势', max: 5, learnLv: 5,  jing: 4, desc: '命中累积连击权重；触发时第二击不增伤但刷新缠劲/幽丝（续控）', eff: '偏向续控' },

    // —— 二、常驻武势（续：防御/控制类）——
    { id: 'tArmor',    icon: '🪖', name: '玄甲凝肌', cat: '武势', max: 5, learnLv: 10, jing: 6, desc: '每持1点气机减伤；气机归零减伤消失；残血气机消耗加快', eff: '卸力依赖气机储备' },
    { id: 'tBlock',    icon: '🔰', name: '气垣御身', cat: '武势', max: 5, learnLv: 10, jing: 6, desc: '耗2气机触发格挡：成功减半并回1气机，失败流失；非常驻概率', eff: '主动消耗气机开启格挡' },
    { id: 'tDodge',    icon: '🌫️', name: '流影遁身', cat: '武势', max: 1, learnLv: 10, jing: 6, desc: '闪避成功夺走敌1气机；闪避失败自身流失1气机（闪避=气机博弈）', eff: '不再是固定百分比' },
    { id: 'tReflect',  icon: '🌊', name: '潮劲回涌', cat: '武势', max: 5, learnLv: 15, jing: 6, desc: '受击耗3气机引潮，反弹全额伤害（击穿枯荣假蜕）；触发后下回合格止恢复', eff: '强效反弹，代价明显' },
    { id: 'tCounter',  icon: '🔮', name: '心兆逆击', cat: '武势', max: 5, learnLv: 10, jing: 6, desc: '持≥3气机可耗2气机在敌攻击前逆击：命中则取消敌方本次攻击；连触提价', eff: '防守反击' },

    // —— 三、武诀主动技（消耗气机释放，有代价/冷却）——
    { id: 'tSteal',    icon: '🗡️', name: '夺械折锋', cat: '武诀', max: 1, learnLv: 15, jing: 6, desc: '耗3气机夺械：成功顺势反攻且不获气机；失败不消耗', eff: '控武诀' },
    { id: 'tGlue',     icon: '🧶', name: '黏丝缚机', cat: '武诀', max: 1, learnLv: 10, jing: 8, desc: '耗4气机必中：黏缚敌气机3回合（不可耗气机/积新机，保命仍可用）', eff: '强控' },
    { id: 'tChime',    icon: '🔔', name: '灵籁震脉', cat: '武诀', max: 5, learnLv: 10, jing: 6, desc: '耗2气机：震脉打断，清空敌锋劲/地力等资源标记；等级越高基础伤害越高', eff: '软控' },
    { id: 'tChimeMax', icon: '📯', name: '灵籁震脉·极', cat: '武诀', max: 1, learnLv: 30, jing: 10, desc: '耗5气机：封滞2回合+固定伤害，目标本回合气机清零', eff: '高阶软控' },

    // —— 二、常驻武势（续：特殊机制/身形）——
    { id: 'tLightHeavy', icon: '⚖️', name: '轻重随势', cat: '武势', max: 1, learnLv: 30, jing: 8, desc: '中小型兵器命中窃取1气机；闪避重型攻击返还本次闪避消耗气机（切换武器不清气机）', eff: '气机博弈' },
    { id: 'tExecute',  icon: '🗡️', name: '隙窍斩',   cat: '武势', max: 1, learnLv: 20, jing: 8, desc: '目标≥2种负面状态时攻击压其生机至1（无视防具），触发后清空其负面标记', eff: '一次性爆发' },
    { id: 'tLeech',    icon: '🩸', name: '血络汲元', cat: '武势', max: 1, learnLv: 20, jing: 8, desc: '命中耗2气机转化伤害为生机；溢出化气盾（≤20%最大生机），无气机不激活', eff: '以战养战' },
    { id: 'tFeign',    icon: '🪦', name: '枯荣假蜕', cat: '武势', max: 1, learnLv: 10, jing: 8, desc: '生机归零免死回1点并清空气机；之后2回合不可耗气机，仅普攻积机', eff: '与命格【装死】分别独立' },
    { id: 'tGhost',    icon: '💨', name: '虚身残影', cat: '身形', max: 1, learnLv: 15, jing: 6, desc: '耗4气机化虚影2回合：行速+50%、伤害+10%；期间敌必中类耗气效果失效；结束清半数气机', eff: '身形增益' },
    { id: 'tVip',      icon: '🌀', name: '玄渊脉冲', cat: '武诀', max: 1, learnLv: 35, jing: 10, desc: '单场一次，耗全部剩余气机：固定50伤；耗越多后续武势权重越高（2回合）；空机不释放', eff: '秘传单次' },

    // —— 三、武诀主动技（续）——
    { id: 'tPotion',   icon: '🧪', name: '百草续元', cat: '武诀', max: 1,  learnLv: 5,  jing: 4, desc: '耗2气机回血（保底25）；满血则化气盾；之后普攻不产气机', eff: '残血续命' },
    { id: 'tThunder',  icon: '⚡', name: '雷芒奔踏', cat: '武诀', max: 5,  learnLv: 5,  jing: 6, desc: '耗3气机：命中挂【雷滞】2回合，目标每耗气机额外流失1点', eff: '持续耗损' },
    { id: 'tKick',     icon: '🦶', name: '玄影连蹴', cat: '武诀', max: 5,  learnLv: 10, jing: 6, desc: '耗4气机：每击叠【挫力】降敌膂力（膂力越高层数上限越高）', eff: '削弱型' },
    { id: 'tWind',     icon: '🌪️', name: '罡风摧山', cat: '武诀', max: 5,  learnLv: 15, jing: 6, desc: '耗5气机：击碎目标气垣/格挡预备，每破一层附加伤害；高膂力附带眩晕', eff: '破防型' },
    { id: 'tWing',     icon: '👼', name: '羽翎突袭', cat: '武诀', max: 5,  learnLv: 15, jing: 6, desc: '耗3气机：结算时敌不可消耗气机触发逆击/潮劲；等级越高获机锋概率越高', eff: '压制反击' },
    { id: 'tShadowTick', icon:'🪶', name: '幽丝缠元', cat: '武诀', max: 1, learnLv: 20, jing: 6, desc: '耗4气机布幽丝6回合：每回合抽敌1气机转生机，敌汲生减半；己气机归零则断', eff: '持续耗损' },
    { id: 'tPalm',     icon: '🖐️', name: '巨灵掌印', cat: '武诀', max: 1,  learnLv: 30, jing: 8, desc: '耗6气机：削敌当前半血（Boss30%免疫）；不触发潮劲；下回合格止恢复', eff: '斩破' },
    { id: 'tThrow',    icon: '💠', name: '飞兵叠击', cat: '武诀', max: 1,  learnLv: 15, jing: 6, desc: '耗4气机：连续投掷（需≥2投掷兵器）累加伤害，每层掠影提升闪避', eff: '连携' }
  ];

  /* ---------- 九层 Boss §4.4 ---------- */
  const BOSSES = [
    { layer: 1, name: '百战羚王·犼野',   terrain: '平原', baseStr: 18, baseSpd: 10, baseAgi: 12, baseDef: 14, baseLuc: 5 },
    { layer: 2, name: '九幽狼主·苍裂',   terrain: '平原' },
    { layer: 3, name: '赤焰魔君·焚天',   terrain: '山地' },
    { layer: 4, name: '寒冰蛟后·凝霜',   terrain: '湖泊' },
    { layer: 5, name: '雷霆鹫皇·破云',   terrain: '海洋' },
    { layer: 6, name: '腐骨蛛皇·千丝',   terrain: '山地' },
    { layer: 7, name: '幻月狐祖·魅生',   terrain: '平原' },
    { layer: 8, name: '镇岳石王·磐危',   terrain: '山地' },
    { layer: 9, name: '九层妖塔之主·无相', terrain: '海洋' }
  ];
  function bossMaxHp(k) { return TUNE.bossHpBase * k; }
  function bossStats(layer) {
    const b = BOSSES[layer - 1];
    // 附件只在第一层填写了基础五维；其余层沿用同一基准再按原增长率缩放。
    // 若不回退，第二至九层会得到 NaN，战斗无法正常结算。
    const base = BOSSES[0];
    const m = Math.pow(TUNE.bossHpGrowth, layer - 1);
    return {
      name: b.name,
      terrain: b.terrain,
      level: 15 * layer,
      str: Math.round((b.baseStr || base.baseStr) * m),
      spd: Math.round((b.baseSpd || base.baseSpd) * m),
      agi: Math.round((b.baseAgi || base.baseAgi) * m),
      def: Math.round((b.baseDef || base.baseDef) * m),
      luc: Math.round((b.baseLuc || base.baseLuc) * m),
      atk: TUNE.bossAtkBase + layer * TUNE.bossAtkPerLayer,
      defStat: TUNE.bossDefBase + layer * TUNE.bossDefPerLayer,
      maxHp: bossMaxHp(layer),
      power: (15 * layer) * 6 + (15 * layer) * 10 * 2
    };
  }

  /* ---------- 地貌 §1.5 ---------- */
  const TERRAINS = [
    { id: 'plain',  name: '平原', risk: '低', eventBias: { adventure: 1.3, treasure: 1.3, train: 1.0, fight: 1.0, realm: 0.8, clue: 1.0 } },
    { id: 'lake',   name: '湖泊', risk: '中', eventBias: { adventure: 1.0, treasure: 1.0, train: 1.4, fight: 1.0, realm: 1.0, clue: 1.1 } },
    { id: 'mount',  name: '山地', risk: '高', eventBias: { adventure: 1.0, treasure: 1.0, train: 0.9, fight: 1.2, realm: 1.4, clue: 1.0 } },
    { id: 'ocean',  name: '海洋', risk: '高', eventBias: { adventure: 0.9, treasure: 1.1, train: 1.0, fight: 1.0, realm: 1.3, clue: 1.2 } }
  ];
  const LAYER_TERRAIN = ['plain','plain','mount','lake','ocean','mount','plain','mount','ocean'];

  /* 探索事件类型基础权重 */
  const EVENT_WEIGHTS = { adventure: 22, fight: 20, treasure: 18, train: 18, realm: 10, clue: 12 };

  /* ---------- 秘境 §7.2 ---------- */
  const SECRET_REALMS = [
    { id: 'low',  name: '初级秘境', cost: 1, lvRange: [1, 30],  drop: { '凡':0.45,'良':0.30,'灵':0.20,'宝':0.04,'仙':0.01 } },
    { id: 'mid',  name: '中级秘境', cost: 3, lvRange: [31, 70], drop: { '凡':0.10,'良':0.20,'灵':0.35,'宝':0.28,'仙':0.07 } },
    { id: 'high', name: '高级秘境', cost: 6, lvRange: [71, 120],drop: { '凡':0.02,'良':0.08,'灵':0.25,'宝':0.45,'仙':0.20 } }
  ];

  /* ---------- 好友 8 位 §7.3 ---------- */
  const FRIENDS = [
    { name: '青衫客·柳七', off: -3 }, { name: '醉剑仙·白九', off: 2 },
    { name: '机关师·墨十一', off: -1 }, { name: '铃音娘·苏三', off: 4 },
    { name: '铁臂王·牛二', off: 1 }, { name: '观星子·玄五', off: -2 },
    { name: '游方僧·一了', off: 3 }, { name: '织梦女·云十二', off: 0 }
  ];

  /* ---------- 商店 §6.2 ---------- */
  // 物资库（办公币）
  const SHOP_SUPPLY = [
    { id: 'stam_s', name: '体力包·小', price: 20, cur: 'stone', gain: { stamina: 30 }, limit: 5, desc: '恢复 30 点体力' },
    { id: 'stam_l', name: '体力包·大', price: 45, cur: 'stone', gain: { stamina: 50 }, limit: 2, desc: '恢复 50 点体力' },
    { id: 'pill',   name: '五维药丸',   price: 15, cur: 'stone', gain: { pill: 1 }, limit: 3, desc: '当日对应维 +5（可叠 3）' },
    { id: 'heal',   name: '疗伤符',     price: 30, cur: 'stone', gain: { injuryClear: 1 }, limit: 2, desc: '立即解除伤势' },
    { id: 'mat',    name: '材料包',     price: 25, cur: 'stone', gain: { materials: 5 }, limit: 3, desc: '材料 +5' },
    { id: 'daoyun', name: '功法点',   price: 40, cur: 'stone', gain: { daoYun: 1 }, limit: 5, desc: '功法升级材料（仙金不参与功法养成）' },
    { id: 'sell_ht', name: '黑铁',       price: 8,  cur: 'stone', gain: { mat: { ht: 1 } }, limit: 20, day: true, desc: '黑铁×1（锻造主材，每日限购 20）' },
    { id: 'sell_mt', name: '木炭',       price: 5,  cur: 'stone', gain: { mat: { mt: 1 } }, limit: 20, day: true, desc: '木炭×1（精炼消耗，每日限购 20）' }
  ];
  // 秘市（办公币·稀有/限购；货币统一用办公币）
  // 注：淬体丹（永久+1）不可用办公币购买，仅由探索宝箱/奇遇稀有开出来
  const SHOP_MARKET = [
    { id: 'rune_box', name: '符文箱',      price: 40, cur: 'stone', gain: { box: 'rune' },  limit: 1, week: true, desc: '随机符文×1' }
  ];

  /* ---------- 装备/打造系统 §8（全新模块，替换旧预设武器） ---------- */
  const EQUIP = {
    SLOTS: [
      { key: 'head',     name: '头部' },
      { key: 'chest',    name: '胸甲' },
      { key: 'wrist',    name: '护腕' },
      { key: 'pants',    name: '裤子' },
      { key: 'shoes',    name: '鞋子' },
      { key: 'necklace', name: '项链' },
      { key: 'weapon',   name: '武器' }
    ],
    // 品质梯度：affixes=词条数；req=最低穿戴等级；color=显示色；mul=词条数值系数（影响 roll 上限）
    QUAL: {
      '白': { name: '白', affixes: 1, req: 1,  color: '#d8d8d8', mul: 1.0 },
      '绿': { name: '绿', affixes: 2, req: 10, color: '#7bd97b', mul: 1.4 },
      '蓝': { name: '蓝', affixes: 3, req: 25, color: '#5fa8d9', mul: 2.0 },
      '紫': { name: '紫', affixes: 4, req: 45, color: '#c98cd9', mul: 2.8 },
      '橙': { name: '橙', affixes: 5, req: 65, color: '#e8a23a', mul: 3.8 },
      '红': { name: '红', affixes: 4, req: 90, color: '#e0533f', mul: 5.0 }
    },
    // 遮天神材（id → 名称 / 层级 / 颜色）。层级：1凡铁 2灵金 4至尊神料 5仙金(帝材) 0辅助耗材
    MATS: {
      // 凡铁类（白/绿）
      ht:  { name: '黑铁精',   tier: 1, color: '#b9b9b9' },
      qw:  { name: '青纹钢',   tier: 1, color: '#cfcfcf' },
      lm:  { name: '灵麻布',   tier: 1, color: '#cdbfa0' },
      sh:  { name: '兽魂皮',   tier: 1, color: '#a98c6b' },
      py:  { name: '普通灵玉', tier: 1, color: '#bcd9c0' },
      // 灵金类（蓝/紫主体 + 橙主材）→ 探索 3~6 层
      ct:  { name: '赤铜精金', tier: 2, color: '#7bd97b' },
      bl:  { name: '百炼陨铁', tier: 2, color: '#6f9e6f' },
      yw:  { name: '云纹兽革', tier: 2, color: '#7bae6b' },
      yl:  { name: '云麟皮甲料',tier: 2, color: '#5f9e8f' },
      yh:  { name: '月华玉髓', tier: 2, color: '#5fa8d9' },
      sl:  { name: '碎星灵玉', tier: 2, color: '#6fb0c0' },
      wj:  { name: '万劫灵玉', tier: 2, color: '#a23ad9' },
      // 至尊神料（橙装辅料，不作主材；等级低于仙金）
      xlg: { name: '仙泪绿金', tier: 4, color: '#3ad99e' },
      yhs: { name: '羽化神金', tier: 4, color: '#9e3ad9' },
      kong:{ name: '虚空神晶', tier: 4, color: '#3a6fd9' },
      zs:  { name: '至尊兽皮', tier: 4, color: '#b06b3a' },
      // 仙金·帝材（仅红色烬赤成长装备主材；普通装备禁用，强行锻入即崩碎）
      lh:  { name: '龙纹黑金', tier: 5, color: '#e8a23a' },
      hx:  { name: '凰血赤金', tier: 5, color: '#e8533a' },
      dj:  { name: '道劫黄金', tier: 5, color: '#d9b53a' },
      hy:  { name: '永恒蓝金', tier: 5, color: '#3a8fd9' },
      // 辅助/精炼耗材（非神材本体）
      cuijl:{ name: '淬炼精粹', tier: 0, color: '#9fd9d9' },
      ningz:{ name: '凝紫精粹', tier: 0, color: '#c98cd9' },
      daoyg:{ name: '道源凝果', tier: 0, color: '#7bd97b' },
      mt:   { name: '木炭', tier: 0, color: '#5a5a5a' }
    },
    JINCHI: { name: '烬赤源核·帝血残源', color: '#e83a3a' },
    // 部位材质族：金属系 / 皮甲系 / 玉髓系
    SLOT_CAT: { head: 'metal', wrist: 'metal', weapon: 'metal', chest: 'leather', pants: 'leather', shoes: 'leather', necklace: 'jade' },
    // 锻造配方：大类×品质 → 主材（数量 2，随精炼等级倍增）。橙装仅用灵金主材，至尊神料做辅料另算
    RECIPE: {
      metal:   { '白': { ht: 2 }, '绿': { qw: 2 }, '蓝': { ct: 2 }, '紫': { bl: 2 }, '橙': { bl: 2 } },
      leather: { '白': { lm: 2 }, '绿': { sh: 2 }, '蓝': { yw: 2 }, '紫': { yl: 2 }, '橙': { yl: 2 } },
      jade:    { '白': { py: 2 }, '绿': { yh: 2 }, '蓝': { sl: 2 }, '紫': { wj: 2 }, '橙': { wj: 2 } }
    },
    // 材料精炼等级：原矿→粗炼→精炼→纯净（越好：越省主材、成功率越高、产出武器品质上限越高）
    MAT_GRADE: {
      '原矿': { name: '原矿', countMul: 1.50, succ: 0,  cap: 0, qy: 0 },
      '粗炼': { name: '粗炼', countMul: 1.15, succ: 8,  cap: 0, qy: 3 },
      '精炼': { name: '精炼', countMul: 0.85, succ: 16, cap: 1, qy: 8 },
      '纯净': { name: '纯净', countMul: 0.55, succ: 26, cap: 1, qy: 18 }
    },
    GRADE_ORDER: ['原矿', '粗炼', '精炼', '纯净'],
    // §8 材料精炼台：将基础神材（凡铁/灵金层级，tier 1~2）精炼为粗炼/精炼/纯净。
    //   精炼料在锻造时按所选精炼等级消耗（替代同 id 原始料）；仙金/至尊神料/耗材不参与精炼。
    REFINE: {
      // 可精炼的基础锻造主材（tier 1~2）
      ores: ['ht', 'qw', 'lm', 'sh', 'py', 'ct', 'bl', 'yw', 'yl', 'yh', 'sl', 'wj'],
      // 逐级精炼：从 fromGrade 取 need 份 + 木炭 n 份 → 产出 yield 份 本等级精炼料（精炼仅消耗木炭）
      tiers: [
        { grade: '粗炼', fromGrade: '原矿', need: 3, reagent: 'mt', reagentName: '木炭', rneed: 6, yield: 3 },
        { grade: '精炼', fromGrade: '粗炼', need: 3, reagent: 'mt', reagentName: '木炭', rneed: 9, yield: 3 },
        { grade: '纯净', fromGrade: '精炼', need: 3, reagent: 'mt', reagentName: '木炭', rneed: 12, yield: 3 }
      ]
    },
    // 各品质基础产出上限（QUAL_ORDER 下标）与基础成功率(%) —— 新锻造表
    FORGE_BASE_CAP:  { '白': 0, '绿': 1, '蓝': 2, '紫': 3, '橙': 4 },
    FORGE_BASE_SUCC: { '白': 100, '绿': 70, '蓝': 50, '紫': 35, '橙': 10 },
    // 辅助材料：按品质限定可用；succ=单次提升成功率%；cap=品质上限+；q=可用品质
    FORGE_AUX: {
      cuijl: { name: '淬炼精粹', succ: 3, cap: 0, q: ['绿', '蓝'] },
      ningz: { name: '凝紫精粹', succ: 2, cap: 0, q: ['紫'] },
      daoyg: { name: '道源凝果', succ: 5, cap: 1, q: ['蓝', '紫', '橙', '红'], ex: true },
      yhs:   { name: '羽化神金', succ: 4, cap: 1, q: ['橙', '红'] },
      xlg:   { name: '仙泪绿金', succ: 2, cap: 1, q: ['橙', '红'] },
      zs:    { name: '至尊兽皮', succ: 2, cap: 1, q: ['橙'] }
    },
    QUAL_ORDER: ['白', '绿', '蓝', '紫', '橙'],
    // 锻造主材下拉展示名（白绿=凡铁阶，蓝紫橙=灵金阶）
    FORGE_MAT_LABEL: { '白': '凡铁·白材', '绿': '凡铁·绿材', '蓝': '灵金·蓝材', '紫': '灵金·紫材', '橙': '灵金·橙材' },
    // 帮派五行：金属性擅长攻击类功法；木擅长种植灵草+治疗；水擅长速度+治疗；火擅长控火炼丹；土擅长挖矿
    SECT_ELEMENTS: {
      metal: { name: '金', attr: '金属性', icon: '⚔', color: '#e8c34a',
        desc: '锐金肃杀，擅长攻击类功法，出师攻伐凌厉。',
        bonus: { atkPct: 0.15 }, daily: { type: 'stone', n: 60, label: '帮派贡献·办公币' }, talent: '霸皇开山劲', gongfa: 'gf_bahuang' },
      wood:  { name: '木', attr: '木属性', icon: '🌿', color: '#5fae6b',
        desc: '青木长生，擅长种植灵草与治疗类功法，疗伤续命无双。',
        bonus: { healPct: 0.20 }, daily: { type: 'stone', n: 90, label: '灵草变现·办公币' }, talent: '清心御道录', gongfa: 'gf_qingxin' },
      water: { name: '水', attr: '水属性', icon: '💧', color: '#5fa8d9',
        desc: '流波无定，擅长速度兼治疗类功法，身法飘逸、回春有术。',
        bonus: { spdPct: 0.15, healPct: 0.12 }, daily: { type: 'stone', n: 70, label: '灵液·办公币' }, talent: '疾风追猎录', gongfa: 'gf_jifeng' },
      fire:  { name: '火', attr: '火属性', icon: '🔥', color: '#e8533a',
        desc: '焚天控火，擅长炼丹，丹成则事半功倍、资质飞涨。',
        bonus: { pillMul: 1.0 }, daily: { type: 'pill', n: 2, label: '炼丹·资质丹' }, talent: '焚天离火章', gongfa: 'gf_fentian' },
      earth: { name: '土', attr: '土属性', icon: '⛰', color: '#b06b3a',
        desc: '厚土载物，擅长挖矿，神材产量更丰。',
        bonus: { mineMul: 0.5 }, daily: { type: 'mat', n: 3, label: '矿脉·神材' }, talent: '玄龟守道经', gongfa: 'gf_xuangui' }
    },
    // 分解返还（与配方同源主材）
    DISMANTLE: {
      '白': { ht: 1, lm: 1 }, '绿': { qw: 1, sh: 1 }, '蓝': { ct: 1, yw: 1 },
      '紫': { bl: 1, yl: 1 }, '橙': { bl: 1, yl: 1 }
    },
    RECAST_COST: { ht: 1, lm: 1 },           // 重铸：低级主材
    // ===== 随机词条库（全新，按品质 tier 划分）=====
    // stat 取值：dimPct(百分比五维,需 key) / atkPct(普攻伤害%) / redu(物理减伤%) /
    //   reduMagic(道则减伤%) / critReduc(暴击减伤%) / critDmg(暴击增伤%) / hp(固定生命)
    //   / lifesteal(吸血%) / dodge(闪避%) / ignoreDefHit(命中降敌防%) / reflect(反伤%)
    //   / defPct(防御%) / enemyAtkDown(敌攻降%) / dodgeFollowup(闪后追伤%) / atkStack(每回合攻叠层) / survive1(保命1点)
    // 单件特效库（蓝/紫/橙随机词条特效），见上 rare / ultimate 档；白/绿凡铁仅抽 common 普通词条
    AFFIX_LIB: {
      common: [
        { id: 'duangu',  name: '锻骨', tier: 'common', stat: 'dimPct', key: 'str', val: 0.04, desc: '力量 +4%' },
        { id: 'jiying',  name: '疾影', tier: 'common', stat: 'dimPct', key: 'agi', val: 0.04, desc: '敏捷 +4%' },
        { id: 'guyuan',  name: '固元', tier: 'common', stat: 'dimPct', key: 'def', val: 0.04, desc: '体质 +4%' },
        { id: 'yunling', name: '蕴灵', tier: 'common', stat: 'dimPct', key: 'luc', val: 0.04, desc: '灵力 +4%' },
        { id: 'tafeng',  name: '踏风', tier: 'common', stat: 'dimPct', key: 'spd', val: 0.04, desc: '速度 +4%' },
        { id: 'cuifeng', name: '淬锋', tier: 'common', stat: 'atkPct', val: 0.03, desc: '普攻伤害 +3%' },
        { id: 'yujia',   name: '御甲', tier: 'common', stat: 'redu', val: 0.03, desc: '受到物理伤害 -3%' },
        { id: 'shoushen',name: '守神', tier: 'common', stat: 'reduMagic', val: 0.03, desc: '受到法术道则伤害 -3%' }
      ],
      rare: [
        { id: 'cuixue',   name: '淬血', tier: 'rare', stat: 'lifesteal', val: 0.02, desc: '攻击命中，吸取 2% 伤害值作为生命' },
        { id: 'qingshen', name: '轻身', tier: 'rare', stat: 'dodge', val: 0.04, desc: '闪避概率 +4%' },
        { id: 'pojia',    name: '破甲', tier: 'rare', stat: 'ignoreDefHit', val: 0.05, desc: '攻击命中，降低敌方 5% 防御' },
        { id: 'xuangu',   name: '玄骨', tier: 'rare', stat: 'reflect', val: 0.05, desc: '被攻击，反弹 5% 伤害' },
        { id: 'fengxing', name: '风行', tier: 'rare', stat: 'atkStack', val: 0.03, max: 3, desc: '每回合攻击 +3%，最多叠 3 层，回合结束重置' },
        { id: 'yuling',   name: '御灵', tier: 'rare', stat: 'survive1', desc: '首次致命伤害保留 1 点生命，一局 1 次' }
      ],
      ultimate: [
        { id: 'tunyuan',   name: '吞元', tier: 'ultimate', stat: 'lifesteal', val: 0.04, killHeal: 0.10, desc: '攻击吸取 4% 伤害生命值；击杀额外回 10% 生命' },
        { id: 'zhenyue',   name: '镇岳', tier: 'ultimate', stat: 'defPct', val: 0.08, enemyAtkDown: 0.04, desc: '防御提升 8%；敌人攻击你时，敌方攻击降 4%' },
        { id: 'xukongdun', name: '虚空遁', tier: 'ultimate', stat: 'dodge', val: 0.10, dodgeFollowup: 0.15, desc: '闪避 +10%；闪避成功，下一击伤害 +15%' }
      ]
    },
    // 同词条（同 id）在整套穿戴中最多叠加条数，防止数值爆炸
    AFFIX_CAP: 3,
    // 各品质锻造随机词条数上限（红=帝器，单独处理）
    // 凡铁（白/绿）也出词条：白 1 条、绿 2 条，均只抽 common 普通词条（无稀有/极品道则特效）；
    // 数值区间取 AFFIX_RANGE 的白/绿档（小而弱）。凡铁【不带套装】，套装归属仅灵金（蓝+）。
    QUAL_AFFIX_COUNT: { '白': 1, '绿': 2, '蓝': 2, '紫': 3, '橙': 3, '红': 4 },
    // 词条检索：id → 完整定义（真正填充在 EQUIP 对象之后）
    AFFIX_BY_ID: {},
    // ===== 套装体系（橙装圣兵套 + 红色帝套，七件成套：武器+头+胸+护腕+裤+鞋+项链）=====
    // 普通白蓝紫装备无法激活套装；bonus 直接叠加到战斗快照，flag 为异象触发类标记
    // 套装：只服务自身流派，不做全局放大；单件特效全部生效，套装增益同一时间仅激活 1 套（互斥）
    // 档位：3 件解锁一阶，5 件解锁二阶；不再设置 7 件套强制绑定的超模全局 buff
    SETS: {
      xuejia: {
        name: '荒古血甲套', dao: '续航吸血', color: '#e0533f', quality: '蓝~紫',
        slots: ['head', 'chest', 'wrist', 'pants', 'shoes'],
        t3: { desc: '攻击命中获得 5% 吸血', bonus: { lifesteal: 0.05 } },
        t5: { desc: '吸血提升至 12%；击杀目标后，本回合攻击力 +8%（仅本回合）', bonus: { lifesteal: 0.12, killAtkUp: 0.08 } }
      },
      yufeng: {
        name: '云踪御风套', dao: '闪避机动', color: '#5fa8d9', quality: '紫',
        slots: ['head', 'wrist', 'shoes', 'necklace'],
        t3: { desc: '闪避概率 +12%', bonus: { dodge: 0.12 } },
        t5: { desc: '闪避概率 +20%；成功闪避后，下一次攻击伤害 +20%', bonus: { dodge: 0.20, dodgeFollowup: 0.20 } }
      },
      zhenshan: {
        name: '万钧镇山套', dao: '坦克反伤', color: '#b06b3a', quality: '紫~橙',
        slots: ['head', 'chest', 'pants', 'wrist'],
        t3: { desc: '防御 +15%，受到所有伤害降低 8%', bonus: { defPct: 0.15, reduAll: 0.08 } },
        t5: { desc: '受到伤害减免 18%；敌方对你造成伤害时，反弹 8% 伤害', bonus: { reduAll: 0.18, reflect: 0.08 } }
      },
      fentian: {
        name: '焚天战魂套', dao: '爆发强攻', color: '#e8533a', quality: '橙',
        slots: ['chest', 'wrist', 'necklace', 'weapon'],
        t3: { desc: '攻击力 +18%', bonus: { atkPct: 0.18 } },
        t5: { desc: '每次攻击 15% 概率触发【焚击】，附加目标当前生命值 10% 额外伤害', bonus: { fenjiProc: 0.15, fenjiMul: 0.10 } }
      },
      daoti: {
        name: '不灭道体套', dao: '保命坚韧', color: '#9e3ad9', quality: '橙',
        slots: ['head', 'chest', 'pants', 'necklace'],
        t3: { desc: '战斗开局获得护盾，护盾值 = 自身最大生命值 10%', bonus: { shieldStart: 0.10 } },
        t5: { desc: '第一次受到致命伤害时，保留 30% 血量（单局战斗仅触发 1 次）', bonus: { surviveThreshold: 0.30 } }
      },
      dizun: {
        name: '帝尊道装', dao: '均衡道则', color: '#e8c34a', quality: '红·毕业',
        slots: ['head', 'chest', 'wrist', 'pants', 'shoes', 'necklace'],
        t3: { desc: '吸血 +10%，闪避 +8%，攻击 +12%，防御 +12%', bonus: { lifesteal: 0.10, dodge: 0.08, atkPct: 0.12, defPct: 0.12 } },
        t5: { desc: '自身受到负面效果持续时间减半；每次攻击附带固定道则伤害（基于五维总值）', bonus: { debuffHalf: 0.5, daozheDmg: 0.4 } }
      }
    },
    SET_LIST: ['xuejia', 'yufeng', 'zhenshan', 'fentian', 'daoti', 'dizun'],
    // 武器/装备 → 套装归属（锻造时写入 item.set）；橙装圣兵、红色帝装可激活
    // 【仅灵金（蓝/紫/橙/红）】防具在锻造时默认按 SLOT_SET_DEFAULT 归属（锻造界面可自选）；
    // 凡铁（白/绿）不带套装；武器（任何品质）恒为独立单件 weapon:null。
    SLOT_SET_DEFAULT: { head: 'xuejia', chest: 'xuejia', wrist: 'xuejia', pants: 'xuejia', shoes: 'xuejia', necklace: 'yufeng', weapon: null },
    // 铭文铭刻（证道武器 30 级解锁，独立于装备道则词条）
    AFFIX_INSCRIPTION: [
      { id: 'm1', name: '破妄铭文', cat: 'atk' },
      { id: 'm2', name: '固元铭文', cat: 'hp' },
      { id: 'm3', name: '锐金铭文', cat: 'crit' },
      { id: 'm4', name: '御灵铭文', cat: 'redu' },
      { id: 'm5', name: '疾影铭文', cat: 'dodge' },
      { id: 'm6', name: '镇魂铭文', cat: 'dim', key: 'str' }
    ],
    // 各 cat 在 白/绿/蓝/紫/橙 下的数值区间 [min,max]
    AFFIX_RANGE: {
      dim:    [[1,3],[2,5],[4,8],[6,12],[9,16]],
      atk:    [[2,5],[4,8],[7,12],[10,18],[14,26]],
      crit:   [[1,3],[2,4],[3,6],[4,8],[6,10]],
      dodge:  [[1,3],[2,4],[3,6],[4,8],[6,10]],
      hp:     [[20,50],[40,90],[80,150],[140,240],[220,380]],
      redu:   [[1,3],[2,5],[4,8],[6,12],[10,18]]
    },
    // 烬赤源核成长装备（红色帝兵·无等级限制、无限成长）
    GROWTH: {
      jinchiCost: 1,
      // 按部位对应帝材（仙金唯一用途）：头盔→龙纹黑金｜胸甲→永恒蓝金｜护腕→凰血赤金｜裤/鞋→道劫黄金｜项链→龙纹黑金
      bySlot: { head: { lh: 2 }, chest: { hy: 2 }, wrist: { hx: 2 }, pants: { dj: 2 }, shoes: { dj: 2 }, necklace: { lh: 2 } },
      // 喂养仅用凡铁/灵金，绝不消耗仙金
      feed: { 1: { ht: 3 }, 2: { qw: 5 }, 3: { ct: 4 }, 4: { bl: 4 }, 5: { yw: 5 }, 6: { yl: 6 } },
      maxLv: 6
    },
    // 证道武器·本命帝器（等级成长阶段：15/30/45/90/120）
    ZHENGDAO: {
      openLv: 15,        // 15 级：解锁锻造资格【铸器始基】
      boundLv: 30,       // 30 级：认主绑定【道器烙印】（不可卸下/删除，解锁铭文）
      resonanceLv: 45,   // 45 级：器神交感（道则/铭文增幅）
      spiritLv: 90,      // 90 级：器生微灵（自主护主）
      emperorLv: 120,    // 120 级：帝器生灵（红色本命帝器·证道唯一）
      openCost:  { bl: 4, xlg: 2 },     // 铸器始基：灵金 + 至尊神料，不耗仙金
      reshapeCost: { kong: 2 },         // 重塑洗词条：虚空神晶（不耗仙金）
      engraveCost: { xlg: 1, yhs: 1 }   // 铭文铭刻（30 级解锁）：至尊神料
    },
    // 五大武器类型（遮天道则流派）
    WTYPES: {
      zhong: { name: '重械', dao: '圣体道',     combat: 'str' },
      qing:  { name: '轻刃', dao: '妖影道',     combat: 'agi' },
      chang: { name: '长兵', dao: '帝皇杀伐道', combat: 'spd' },
      dun:   { name: '盾械', dao: '不灭王道',   combat: 'def' },
      fa:    { name: '法器', dao: '符文仙道',   combat: 'luc' }
    },
    NAME_PREFIX: {
      '白': ['粗制','凡铁','寻常'], '绿': ['精良','青锋','素纹'],
      '蓝': ['玄纹','碧落','寒铁'], '紫': ['紫宸','幽冥','星陨'], '橙': ['赤焰','龙鳞','乾坤']
    },
    NAME_SLOT: {
      head:['头盔','兜鍪','冠'], chest:['胸甲','战袍','护心镜'], wrist:['护腕','臂甲','腕轮'],
      pants:['战裤','缚腿','裙甲'], shoes:['战靴','疾风履','踏云靴'], necklace:['灵佩','玉坠','链'],
      weapon:['兵刃','长兵','短兵']
    }
  };

  /* ============ §功法（20 套可修炼体系） ============
   * 五维映射：力量→str 敏捷→agi 体质→def 灵力→luc 速度→spd
   * 每套功法：effects 为满级数值；生效时按当前等级线性缩放（40%→100%）；
   * maxEffect.bonus 仅满级激活。玩家仅可修炼 1 套（其余仅保留等级）。 */
  const GONGFA = {};
  function _gf(id, name, school, dim, unlockLayer, desc, effects, maxEffect) {
    GONGFA[id] = {
      id: id, name: name, school: school, dim: dim,
      maxLevel: 10, unlockLayer: unlockLayer, desc: desc,
      effects: effects || {}, maxEffect: maxEffect || null
    };
  }
  _gf('gf_huanggu','荒古圣体诀','圣体·力量','str',1,
    '荒古圣体诀：炼体成圣，力量暴涨，血气旺盛。',
    { dimPct:{str:0.15}, atkHpAbove:{hpPct:0.6,mul:0.12}, strUpOnHit:0.15 },
    { flag:'huanggu_burst', desc:'血量低于30%触发圣体爆发：本回合所有伤害+20%',
      bonus:{ huangguBurst:true } });
  _gf('gf_bahuang','霸皇开山劲','圣体·力量','str',1,
    '霸皇开山劲：重械爆发，破甲无双。',
    { dimPct:{str:0.12}, skillDmg:0.18, breakArmor:0.05 },
    { flag:'bahuang_kill', desc:'每次击杀目标，本场战斗永久+5%力量（可叠多层）',
      bonus:{ killStackStr:0.05 } });
  _gf('gf_manshou','蛮兽吞山经','圣体·力量','str',2,
    '蛮兽吞山经：肉搏吞山，血量越低力量越强。',
    { dimPct:{str:0.10}, basicHitHeal:0.025, lowHpStr:0.30 },
    { flag:'manshou_recover', desc:'首次血量跌破30%，瞬间回复15%生命',
      bonus:{ manshouRecover:true } });
  _gf('gf_zhenyu','镇狱魔功','圣体·力量','str',3,
    '镇狱魔功：压制敌方，对流血目标巨伤。',
    { dimPct:{str:0.10}, hitReduceEnemyAllDmg:0.05, bleedBonus:0.10 },
    { flag:'zhenyu_suppress', desc:'开局压制敌方，敌方第一次攻击触发概率/伤害下降8%',
      bonus:{ openSuppress:true } });
  _gf('gf_youying','幽影噬神诀','暗影·敏捷','agi',4,
    '幽影噬神诀：暴击偷袭，首回合闪避。',
    { dimPct:{agi:0.15}, critDmgAdd:0.15, dodgeTurn1:0.12 },
    { flag:'youying_cut', desc:'暴击命中削减敌方灵力，降低敌方技能触发概率6%',
      bonus:{ critCutEnemyQi:0.06 } });
  _gf('gf_jifeng','疾风追猎录','暗影·敏捷','agi',4,
    '疾风追猎录：高速追击，残血狂攻。',
    { dimPct:{agi:0.12,spd:0.08}, lowHpAtkChance:{hpPct:0.4,crit:0.15} },
    { flag:'jifeng_lethal', desc:'敌方血量低于25%，攻击必定暴击',
      bonus:{ enemyLowHp25Crit:true } });
  _gf('gf_guiying','诡影千变章','暗影·敏捷','agi',5,
    '诡影千变章：闪避拉扯，神出鬼没。',
    { dimPct:{agi:0.10}, dodgeChance:0.15, dodgeThenNextAtk:0.10 },
    { flag:'guiying_immune', desc:'一局战斗可免疫一次暴击伤害',
      bonus:{ immuneOneCrit:true } });
  _gf('gf_xueying','血影杀道','暗影·敏捷','agi',5,
    '血影杀道：吸血持续，暴击追伤。',
    { dimPct:{agi:0.10}, lifesteal:0.04, critExtraShadow:0.30 },
    { flag:'xueying_kill', desc:'击杀目标立刻恢复8%最大生命',
      bonus:{ killHeal8:0.08 } });
  _gf('gf_xuangui','玄龟守道经','守御·体质','def',6,
    '玄龟守道经：纯防御反伤，龟息不灭。',
    { dimPct:{def:0.15}, reduction:0.12, reflect:0.10 },
    { flag:'xuangui_feign', desc:'受到致命伤害保留1点生命（一局仅1次）',
      bonus:{ xuanguiFeign:true } });
  _gf('gf_wanjia','万甲固元功','守御·体质','def',6,
    '万甲固元功：长期续航，护盾厚重。',
    { dimPct:{def:0.12}, regen:0.03, shieldMul:0.15 },
    { flag:'wanjia_shield', desc:'护盾存在期间，额外减伤8%',
      bonus:{ shieldExtraRedu:0.08 } });
  _gf('gf_panshi','磐石不灭诀','守御·体质','def',7,
    '磐石不灭诀：韧性抗暴，免疫流血。',
    { dimPct:{def:0.10}, critReduc:0.20, debuffDurReduce:0.30 },
    { flag:'panshi_immune', desc:'血量大于70%，免疫流血类debuff',
      bonus:{ highHp70ImmuneBleed:true } });
  _gf('gf_dizang','地藏镇煞典','守御·体质','def',7,
    '地藏镇煞典：抗法抗debuff。',
    { dimPct:{def:0.10}, reductionMagic:0.14, enemyDebuffChanceReduce:0.20 },
    { flag:'dizang_debuff', desc:'自身每存在一个负面效果，获得3%减伤',
      bonus:{ perDebuffRedu:0.03 } });
  _gf('gf_wanhua','万化符文书','符文·灵力','luc',8,
    '万化符文书：法术主动，符文护盾。',
    { dimPct:{luc:0.15}, skillDmg:0.16, skillChance:0.03 },
    { flag:'wanhua_shield', desc:'释放主动技能后，生成一层符文护盾',
      bonus:{ skillGivesShield:0.10 } });
  _gf('gf_xinghe','星河引灵诀','符文·灵力','luc',8,
    '星河引灵诀：持续回灵，法术dot强化。',
    { dimPct:{luc:0.12}, qiRegen:3, dotDmg:0.10 },
    { flag:'xinghe_fullqi', desc:'灵力全满时，下一次主动技能增伤12%',
      bonus:{ xingheFullqi:true } });
  _gf('gf_fentian','焚天离火章','符文·灵力','luc',9,
    '焚天离火章：爆发法术，灼烧焚敌。',
    { dimPct:{luc:0.10}, spellDmg:0.12, burnOnHit:{prob:0.25,dmg:0.02,turns:3} },
    { flag:'fentian_burn', desc:'灼烧目标每回合持续流失生命，无视部分防御',
      bonus:{ burnDotIgnore:0.30 } });
  _gf('gf_qingxin','清心御道录','符文·灵力','luc',9,
    '清心御道录：功能辅助，护盾治疗。',
    { dimPct:{luc:0.10}, debuffDurReduce:0.30, healShieldMul:0.14 },
    { flag:'qingxin_shield', desc:'开局直接获得一层厚神魂护盾',
      bonus:{ startShield:0.15 } });
  _gf('gf_benlei','奔雷破阵诀','突袭·速度','spd',9,
    '奔雷破阵诀：先手压制，破防抢攻。',
    { dimPct:{spd:0.18}, firstStrikeIgnoreDef:0.08, firstHitDmg:0.10 },
    { flag:'benlei_openskill', desc:'开局有概率直接抢先释放一次主动技能',
      bonus:{ openSkillChance:0.30 } });
  _gf('gf_duandao','断道追魂秘典','突袭·速度','spd',9,
    '断道追魂秘典：干扰对手，流血延宕。',
    { dimPct:{spd:0.14}, extendEnemyCd:1, bleedTurnsBonus:1 },
    { flag:'duandao_interrupt', desc:'敌方释放主动技能时，有概率直接打断本次技能',
      bonus:{} });
  _gf('gf_wanxiang','万象均衡经','均衡·综合','all',9,
    '万象均衡经：五维全能，攻防兼备。',
    { dimPct:{str:0.06,spd:0.06,agi:0.06,def:0.06,luc:0.06}, allDmg:0.05, allRedu:0.05 },
    { flag:'wanxiang_perdim', desc:'自身每一项属性高于对手时，额外获得2%增伤',
      bonus:{ perHigherDim:0.02 } });
  _gf('gf_yaota','妖塔本源心经','妖塔·高阶','all',9,
    '妖塔本源心经：妖塔专属后期功法（高阶稀有）。',
    { dimPct:{str:0.08,spd:0.08,agi:0.08,def:0.08,luc:0.08}, towerBonus:0.15, pvpHalf:true },
    { flag:'yaota_stack', desc:'每回合小幅提升主动技能触发概率，可叠加',
      bonus:{} });
  const GONGFA_LIST = Object.keys(GONGFA);
  function gongfaDef(id){ return GONGFA[id] || null; }
  // 功法升级消耗【功法点】：随等级递增
  function gongfaUpCost(level){ return 2 + level * 2; }

  global.CFG = {
    DIMS, xpNeed, STAMINA_MAX, STAMINA_PER_EXPLORE, STAMINA_PER_BOSS, STAMINA_PER_SPAR, EQUIP, TUNE,
    STAMINA_REGEN_MIN, EXPLORE_DAILY_LIMIT, BOSS_DAILY_LIMIT, TALISMAN_PRICE, TALISMAN_DAILY_MAX, DESTINY_AWAKEN_ODDS,
    TALENT_RATE_BY_LV,
    tierOf, titleOf, TIERS, GIFTS, RARITY, TALENTS,
    BOSSES, bossMaxHp, bossStats, TERRAINS, LAYER_TERRAIN, EVENT_WEIGHTS,
    SECRET_REALMS, FRIENDS, SHOP_SUPPLY, SHOP_MARKET,
    GONGFA, GONGFA_LIST, gongfaDef, gongfaUpCost
  };

  /* 后端可调参数覆盖：按点号路径写入 CFG（如 EQUIP.QUAL.蓝.req / TUNE.bpExploreRate）。
   * 由 UI.init 在首屏拉取 /api/settings 后调用，失败不影响内置默认值。 */
  global.CFG.applyServerConfig = function (list) {
    (list || []).forEach(function (it) {
      if (!it || !it.k) return;
      var raw = it.val, v = raw, t = (it.type || 'num');
      if (t === 'num') v = Number(raw);
      else if (t === 'bool') v = (raw === '1' || raw === 'true' || raw === true);
      else if (t === 'json') { try { v = JSON.parse(raw); } catch (e) { return; } }
      var parts = String(it.k).split('.');
      var o = global.CFG;
      for (var i = 0; i < parts.length - 1; i++) {
        if (o[parts[i]] === undefined || o[parts[i]] === null || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
        o = o[parts[i]];
      }
      o[parts[parts.length - 1]] = v;
    });
  };

  /* ---------- 符文定义（装备镶嵌用） ---------- */
  const RUNE_KINDS = {
    str:   { name: '力量符', type: 'dim', dim: 'str', val: 8,  desc: '力量+8' },
    spd:   { name: '迅捷符', type: 'dim', dim: 'spd', val: 8,  desc: '速度+8' },
    agi:   { name: '灵巧符', type: 'dim', dim: 'agi', val: 8,  desc: '敏捷+8' },
    def:   { name: '守护符', type: 'dim', dim: 'def', val: 8,  desc: '防御+8' },
    luc:   { name: '气运符', type: 'dim', dim: 'luc', val: 8,  desc: '幸运+8' },
    atk:   { name: '狂攻符', type: 'buff', stat: 'atk',  val: 0.10, desc: '武器伤害+10%' },
    shield:{ name: '护盾符', type: 'buff', stat: 'def',  val: 6,    desc: '防御+6' },
    crit:  { name: '暴击符', type: 'buff', stat: 'crit', val: 0.06, desc: '暴击率+6%' },
    hp:    { name: '生机符', type: 'buff', stat: 'hp',   val: 30,   desc: '生命+30' }
  };
  const RUNE_POOL = Object.keys(RUNE_KINDS);
  CFG.RUNE_KINDS = RUNE_KINDS; CFG.RUNE_POOL = RUNE_POOL;

  /* ============ 二十件设计武器 & 锻造图纸 §8.6 ============
     每图含：name 武器名 / shape 形制 / wtype 五大流派 / quality 成品品质
     / icon 图标 / desc 设计说明 / mats 所需神材 / set 套装归属 / affixPool 倾向词条池
     玩家凭图纸+材料，在锻造台"图纸锻造"中制造，出品确定（不再随机品质）。
     锻造时仅从本图 affixPool 内随机 roll 词条，数量按品质（白1/绿2/蓝2/紫3/橙3）。
     注意：橙装主材为灵金（百炼陨铁），以至尊神料作辅料；仙金仅用于红色帝兵。*/
  CFG.BLUEPRINTS = {
    // —— 重械·刀斧锤鼎（武器独立单件，可任意混搭套装）——
    bp_zhanren: { name: '黑铁战刃', shape: '刀', wtype: 'zhong', quality: '白', icon: '🗡', set: null,
      desc: '重械入门战刃，铁骨初成。', mats: { ht: 2 }, affixPool: ['duangu', 'cuifeng'] },
    bp_zhongfu: { name: '青纹重斧', shape: '斧', wtype: 'zhong', quality: '绿', icon: '🪓', set: null,
      desc: '重械 —— 斧开山河，横扫千军。', mats: { qw: 2 }, affixPool: ['duangu', 'guyuan'] },
    bp_juChui:  { name: '赤铜巨锤', shape: '锤', wtype: 'zhong', quality: '蓝', icon: '🔨', set: null,
      desc: '重械 —— 锤如山岳，一击崩碎万法。', mats: { ct: 2 }, affixPool: ['duangu', 'cuixue', 'pojia'] },
    bp_baDao:   { name: '陨铁霸刀', shape: '刀', wtype: 'zhong', quality: '紫', icon: '🗡', set: null,
      desc: '重械 —— 霸刀横扫，体魄刚猛者持之无双。', mats: { bl: 2 }, affixPool: ['duangu', 'cuixue', 'xuangu', 'tunyuan'] },
    bp_xuanhuang:{name: '龙纹玄黄鼎', shape: '鼎', wtype: 'zhong', quality: '橙', icon: '🍲', set: null,
      desc: '龙纹玄黄，镇压万法，本源隐隐浮现。', mats: { bl: 2, xlg: 1 }, affixPool: ['duangu', 'zhenyue', 'xukongdun', 'tunyuan'] },
    // —— 轻刃·匕刃刺 ——
    bp_duanBi:  { name: '黑铁短匕', shape: '匕', wtype: 'qing', quality: '白', icon: '🔪', set: null,
      desc: '轻刃入门短匕，影随身动。', mats: { ht: 2 }, affixPool: ['jiying', 'cuifeng'] },
    bp_yingRen: { name: '青纹影刃', shape: '刃', wtype: 'qing', quality: '绿', icon: '🗡', set: null,
      desc: '轻刃 —— 影刃诡谲，取敌首级于无声。', mats: { qw: 2 }, affixPool: ['jiying', 'qingshen'] },
    bp_hxCi:    { name: '凰血刺', shape: '刺', wtype: 'qing', quality: '蓝', icon: '🗡', set: null,
      desc: '凰血淬刺，至阳藏于暗影。', mats: { ct: 2 }, affixPool: ['jiying', 'qingshen', 'pojia'] },
    bp_diRen:   { name: '幽影帝刃', shape: '刃', wtype: 'qing', quality: '橙', icon: '⚔', set: null,
      desc: '幽影缠身，杀人不留道痕。', mats: { bl: 2, xlg: 1 }, affixPool: ['jiying', 'qingshen', 'xukongdun', 'tunyuan'] },
    // —— 长兵·枪戟矛 ——
    bp_changQiang:{name: '黑铁长枪', shape: '枪', wtype: 'chang', quality: '白', icon: '🔱', set: null,
      desc: '长兵入门长枪，枪出如龙。', mats: { ht: 2 }, affixPool: ['tafeng', 'cuifeng'] },
    bp_zhanJi:  { name: '青纹战戟', shape: '戟', wtype: 'chang', quality: '绿', icon: '⚜', set: null,
      desc: '长兵 —— 戟挑九天，古意森然。', mats: { qw: 2 }, affixPool: ['tafeng', 'guyuan'] },
    bp_pojun:   { name: '赤铜破军矛', shape: '矛', wtype: 'chang', quality: '蓝', icon: '🜲', set: null,
      desc: '长兵 —— 矛指九霄，势若奔雷。', mats: { ct: 2 }, affixPool: ['tafeng', 'cuixue', 'xuangu'] },
    bp_diQiang: { name: '无始帝枪', shape: '枪', wtype: 'chang', quality: '橙', icon: '🔱', set: null,
      desc: '无始帝枪，一往无前贯穿诸敌。', mats: { bl: 2, yhs: 1 }, affixPool: ['tafeng', 'zhenyue', 'tunyuan', 'xukongdun'] },
    // —— 盾械·圆盾玄盾 ——
    bp_yuanDun: { name: '黑铁圆盾', shape: '盾', wtype: 'dun', quality: '白', icon: '🛡', set: null,
      desc: '盾械入门圆盾，盾立如山。', mats: { ht: 2 }, affixPool: ['guyuan', 'yujia'] },
    bp_xuanDun: { name: '道劫玄盾', shape: '盾', wtype: 'dun', quality: '紫', icon: '🛡', set: null,
      desc: '道劫洗礼，王体不灭。', mats: { bl: 2 }, affixPool: ['guyuan', 'yujia', 'xuangu', 'zhenyue'] },
    bp_guiDun:  { name: '永恒玄龟盾', shape: '盾', wtype: 'dun', quality: '橙', icon: '🛡', set: null,
      desc: '玄龟守道，承万击而身不损。', mats: { bl: 2, xlg: 1 }, affixPool: ['guyuan', 'yujia', 'zhenyue', 'xukongdun'] },
    // —— 法器·铃幡壶 ——
    bp_fuLing:  { name: '黑铁符铃', shape: '铃', wtype: 'fa', quality: '白', icon: '🔔', set: null,
      desc: '法器入门符铃，铃音引灵。', mats: { ht: 2 }, affixPool: ['yunling', 'yujia'] },
    bp_daoFan:  { name: '月华道幡', shape: '幡', wtype: 'fa', quality: '绿', icon: '🚩', set: null,
      desc: '法器 —— 月华流转，聚灵归元。', mats: { qw: 2 }, affixPool: ['yunling', 'yujia'] },
    bp_fuHu:    { name: '凰血符文壶', shape: '壶', wtype: 'fa', quality: '紫', icon: '⚱', set: null,
      desc: '凰血淬壶，凝神守心。', mats: { bl: 2 }, affixPool: ['yunling', 'yujia', 'zhenyue', 'tunyuan'] },
    bp_daoguo:  { name: '混沌道果铃', shape: '铃', wtype: 'fa', quality: '橙', icon: '🔔', set: null,
      desc: '混沌道果，道则生生不息。', mats: { bl: 2, yhs: 1 }, affixPool: ['yunling', 'yujia', 'tunyuan', 'xukongdun'] }
  };
  CFG.BLUEPRINT_LIST = Object.keys(CFG.BLUEPRINTS);

  /* ============ 红色仙金帝器（4 件，仙金主材 + 烬赤源核基底）§8.7 ============
     锻造配方：烬赤源核 ×1 + 对应仙金 ×2，基础成功率 1%（受辅材提升）。
     保底至少 1 条极品道则词条，最多 4 条；pool 内先 roll 终极词条，再补普通/稀有。*/
  CFG.RED_IMPERIAL = {
    ri_ding: { name: '龙纹黑金帝鼎', shape: '鼎', wtype: 'zhong', immKey: 'lh', set: null, icon: '🍲',
      desc: '龙纹黑金所铸帝兵，鼎身环绕真龙道纹，可镇压万敌。（独立单件，不属套装）', mats: { JINCHI: 1, lh: 2 },
      pool: ['duangu', 'tunyuan', 'zhenyue', 'xukongdun', 'cuixue', 'xuangu'] },
    ri_ci:   { name: '凰血赤金帝刺', shape: '刺', wtype: 'qing', immKey: 'hx', set: null, icon: '🗡',
      desc: '凰血赤金凝成的帝刺，至阳之火藏于暗影，杀人不留道痕。（独立单件，不属套装）', mats: { JINCHI: 1, hx: 2 },
      pool: ['jiying', 'tunyuan', 'xukongdun', 'qingshen', 'cuixue'] },
    ri_dun:  { name: '道劫黄金帝盾', shape: '盾', wtype: 'dun', immKey: 'dj', set: null, icon: '🛡',
      desc: '历经天劫洗礼的道劫黄金，盾载天道劫纹，守御万法。（独立单件，不属套装）', mats: { JINCHI: 1, dj: 2 },
      pool: ['guyuan', 'zhenyue', 'tunyuan', 'xukongdun', 'xuangu'] },
    ri_ling: { name: '永恒蓝金帝铠铃', shape: '铃', wtype: 'fa', immKey: 'hy', set: null, icon: '🔔',
      desc: '永恒蓝金打造，铃音引动守护道则，生生不息。（独立单件，不属套装）', mats: { JINCHI: 1, hy: 2 },
      pool: ['yunling', 'tunyuan', 'zhenyue', 'xukongdun', 'cuixue'] }
  };
  CFG.RED_IMPERIAL_LIST = Object.keys(CFG.RED_IMPERIAL);

  /* 填充词条检索表（id → 定义），供锻造 roll 与装备展示使用 */
  (function () {
    const lib = CFG.EQUIP.AFFIX_LIB;
    ['common', 'rare', 'ultimate'].forEach(t => lib[t].forEach(a => { CFG.EQUIP.AFFIX_BY_ID[a.id] = a; }));
  })();

  /* 可申请加入的成名大派（未建派玩家也可浏览并申请）§9.2 */
  CFG.SECT_LIST = [
    { id: 's_jin',  name: '锐金剑宗', element: 'metal', leader: '太白真人', members: 1280, reqLevel: 1,  desc: '以攻伐剑道立派，门下皆擅杀伐之术。' },
    { id: 's_mu',   name: '青木神医谷', element: 'wood', leader: '药尘长老', members: 980,  reqLevel: 1,  desc: '遍植灵草、精研疗伤续命之术的医道圣地。' },
    { id: 's_shui', name: '流波仙府', element: 'water', leader: '潮汐仙君', members: 760,  reqLevel: 5,  desc: '身法飘逸、回春有术的控水一脉。' },
    { id: 's_huo',  name: '焚天丹殿', element: 'fire',  leader: '炎尊',     members: 640,  reqLevel: 10, desc: '控火炼丹无双，丹成则资质飞涨。' },
    { id: 's_tu',   name: '厚土神山', element: 'earth', leader: '搬山老祖', members: 540,  reqLevel: 1,  desc: '挖矿采材的行家，神材产量冠绝诸派。' }
  ];

  /* 帮派扩展参数 §9.3 */
  CFG.SECT_DONATE = { stonePer: 10 };        // 快速捐献：10 办公币 = 1 贡献
  CFG.SECT_RENAME_COST = 100;                // 自建帮派改名费用（办公币）
  CFG.sectMemberCap = lv => 60 + lv * 10;    // 成员上限（随帮派等级）
  CFG.sectLevelNeed = lv => lv * 800;        // 升到 lv+1 所需"累计贡献"
  CFG.SECT_EXCHANGE = [                      // 可用贡献兑换
    { id: 'ex_sp',  name: '办公币×50',  cost: 10, type: 'stone',  n: 50 },
    { id: 'ex_st',  name: '办公币×80',  cost: 10, type: 'stone',  n: 80 },
    { id: 'ex_mat', name: '随机神材×2', cost: 30, type: 'mat',    n: 2 }
  ];
  CFG.SECT_CHAT = [                          // 帮派频道水话（NPC 闲聊）
    '今日矿脉双倍，速来！', '谁有多余的淬炼液？高价收！', '昨晚秘境翻车了，求个木系道友搭把手',
    '镇派妖兽还差最后一口血，兄弟们冲！', '新来的道友报个到~', '宗门大比开始报名了，都来露一手',
    '丹炉借我炼一炉，回头分丹', '求一把趁手的飞剑，铸器铺排队太久了',
    '记得每日捐献攒贡献，帮派升级全靠它', '南岭灵田开种了，缺人手，来了就管饭'
  ];
})(window);
