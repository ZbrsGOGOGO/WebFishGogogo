/*
 * 赵云救阿斗 —— 配置层（数据 / 平衡参数）
 * ---------------------------------------------------------------
 * 本文件只描述「游戏运行所需的数据」，不含任何逻辑与渲染。
 * 全部数值集中在此，便于策划调参；前端可独立运行（不依赖后端）。
 * 后端 ZyjadController 仅接管需要跨会话持久化的「进度 / 排行榜」。
 *
 * 扩展指引（可维护性）：
 *  - 新增武器：在 UNIT_DEF 增加一项，并在 POOL 增加其抽中权重；WEAPON_CHARS 同步追加。
 *  - 新增武将：在 HERO_DEF 增加一项与技能，并在 HERO_FIRST/HERO_SECOND 配置两字配对。
 *  - 新增章节 / 关卡：在 MAIN 末尾追加即可（结构见 MAIN 注释）。
 */
window.ZYJ = window.ZYJ || {};
ZYJ.config = (function () {
  // 棋盘 8 列 × 10 行；格子由 54 缩至 48，画布整体适配（384 × 480）
  const COLS = 8, ROWS = 10, CELL = 48;

  // —— 地图（10 行 × 8 列；上下镜像对称）——
  //  A=阿斗核心  S=出兵口  p=己方兵道(绿)  P=对面兵道(黄)
  //  .=己方空地(可放置)  o=对面空地(不可放)  #=草地(草障·铲子可开垦)  w=备用空地
  // 行0 对方半场顶（对方核心在左、对方出兵口在右）；行9 己方半场底（己方出兵口在左、己方核心在右）
  // 内置默认地图（后台未配置时使用；后台地图编辑器保存后由 applyServerConfig 覆盖）
  let MAP = [
    "A######S",
    "P##ooo#P",
    "P##ooo#P",
    "P##PPPPP",
    "PPPPpppp",
    "ppppp##p",
    "ppppp##p",
    "p#...##p",
    "p#...##p",
    "S######A"
  ];
  const TYP = { A: 'core', S: 'spawn', p: 'path', P: 'pathOpp', '.': 'green', o: 'greenOpp', '#': 'stone', w: 'white' };

  // —— 敌方兵道路径（BFS 自动生成：从左下出兵口到右下阿斗核心，只走 path 格）——
  // 用法：在 core.init() 中调用 buildLane(MAP, TYP, [col,row]起点, [col,row]终点, 'path') 生成
  let _laneCache = null;
  function buildLane(map, typ, start, end, walkType) {
    const R = map.length, C = map[0].length;
    const isWalk = (r,c) => r>=0 && r<R && c>=0 && c<C && typ[map[r][c]] === walkType;
    const q = [[start[1],start[0]]]; const from = {}; from[start[1]+','+start[0]] = null;
    let qi = 0;
    while (qi < q.length) {
      const [cr,cc] = q[qi++];
      if (cr === end[1] && cc === end[0]) break;
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr=cr+dr, nc=cc+dc, key=nr+','+nc;
        if (isWalk(nr,nc) && !(key in from)) { from[key]=[cr,cc]; q.push([nr,nc]); }
      }
    }
    // 回溯
    const path = [];
    let cur = end[1]+','+end[0];
    while (cur) { const [r,c] = cur.split(',').map(Number); path.unshift([c,r]); cur = from[cur]? from[cur][0]+','+from[cur][1] : null; }
    return path;
  }

  function getLane(map, typ) {
    if (!_laneCache) {
      // 敌方兵道：从己方左下出兵口 S(列0,行9) 沿 p 走到己方右下核心 A(列7,行9)
      // S/A 本身不是 'path'，故从其相邻的 path 格起止（列0行8 / 列7行8）
      _laneCache = buildLane(map, typ, [0, 8], [7, 8], 'path');
      // 如果 BFS 没找到（比如起点周围没 path），回退到手工路径
      if (_laneCache.length < 2) {
        _laneCache = [
          [0, 9], [0, 8], [0, 7], [0, 6], [1, 6], [2, 6], [3, 6], [4, 6],
          [4, 5], [5, 5], [6, 5], [7, 5], [7, 6], [7, 7], [7, 8], [7, 9]
        ];
      }
    }
    return _laneCache;
  }

  function getLaneAlly(map, typ) {
    // 己方兵道：对方右上出兵口 S(列7,行0) 沿 P 走到对方左上核心 A(列0,行0)
    const ally = buildLane(map, typ, [7, 1], [0, 1], 'pathOpp');
    if (ally.length < 2) {
      return [
        [7, 0], [7, 1], [7, 2], [7, 3], [6, 3], [5, 3], [4, 3], [3, 3],
        [3, 4], [2, 4], [1, 4], [0, 4], [0, 3], [0, 2], [0, 1], [0, 0]
      ];
    }
    return ally;
  }

  // —— 武器（单位）定义：cd 单位秒，range 单位格 ——
  // 说明：数值按等级分级（levels[1..5]），与数据库 zyjad_unit 一致；
  //       applyServerConfig() 会用后端数据就地覆盖/补全。atkType:
  //       single=单体  pierce=贯穿  aoe=范围群伤  splash=单体+溅射
  // 攻击速率统一倍率：1.3 = 攻速上调为基准的 1.3 倍（生效时 cd 会除以该值）。
  // 这里存「基准 cd」，倍率在 WEAPON_ATKSPEED_MUL 一处调整，前后端数据源都自动生效。
  const WEAPON_ATKSPEED_MUL = 1.3;
  const UNIT_DEF = {
    枪: { name: '枪兵', role: '近战直线贯穿', atkType: 'pierce', feature: '攻速成长最高，穿透一条线上所有敌人', levels: {
      1: { atk: 1.4, cd: 1.60, range: 4 }, 2: { atk: 2.2, cd: 2.40, range: 4 }, 3: { atk: 3.5, cd: 3.94, range: 4 },
      4: { atk: 5.6, cd: 5.80, range: 4 }, 5: { atk: 7.8, cd: 7.20, range: 4 } } },
    刀: { name: '刀兵', role: '近战单体', atkType: 'single', feature: '基础攻击最高，短手，只能打单个目标', levels: {
      1: { atk: 2.0, cd: 1.25, range: 3 }, 2: { atk: 3.4, cd: 2.10, range: 3 }, 3: { atk: 6.3, cd: 3.94, range: 3 },
      4: { atk: 9.2, cd: 5.40, range: 3 }, 5: { atk: 10.0, cd: 6.20, range: 3 } } },
    骑: { name: '骑兵', role: '近战范围AOE', atkType: 'aoe', feature: '周围多格群体伤害，清杂好用，DPS偏低', levels: {
      1: { atk: 1.6, cd: 1.25, range: 3 }, 2: { atk: 2.8, cd: 2.10, range: 3 }, 3: { atk: 4.2, cd: 3.94, range: 3 },
      4: { atk: 6.5, cd: 5.40, range: 3 }, 5: { atk: 8.4, cd: 6.20, range: 3 } } },
    弓: { name: '弓兵', role: '远程单体', atkType: 'single', feature: '远距离单点，无穿透，清杂弱、适合点BOSS', levels: {
      1: { atk: 1.6, cd: 1.25, range: 6 }, 2: { atk: 2.8, cd: 2.10, range: 6 }, 3: { atk: 4.2, cd: 3.94, range: 6 },
      4: { atk: 6.5, cd: 5.40, range: 6 }, 5: { atk: 8.4, cd: 6.20, range: 6 } } }
  };
  // 对武器等级数值套用攻速倍率：仅改 cd（攻击间隔），其余（atk/range）不变
  (function applyWeaponAtkSpeed() {
    if (!WEAPON_ATKSPEED_MUL || WEAPON_ATKSPEED_MUL === 1) return;
    for (const k of Object.keys(UNIT_DEF)) {
      const lv = UNIT_DEF[k].levels || {};
      for (const n of Object.keys(lv)) {
        if (lv[n] && typeof lv[n].cd === 'number') lv[n].cd = +(lv[n].cd / WEAPON_ATKSPEED_MUL).toFixed(2);
      }
    }
  })();

  // —— 武将定义（共 12 名，分级数值与 zyjad_hero 一致）——
  // 合成规则：左放首字 + 右放次字（如 赵 左 + 云 右 = 赵云），详见 core.findHeroPair。
  const HERO_DEF = {
    赵云: { name: '赵云', grade: '金', maxLevel: 5, atkType: 'pierce', skill: '七进七出：来回突进直线群伤；专武龙胆亮银枪，10%概率全屏飞枪', levels: {
      1: { atk: 2.00, cd: 1.25, range: 4 }, 2: { atk: 7.60, cd: 1.38, range: 4 }, 3: { atk: 15.30, cd: 1.56, range: 4 },
      4: { atk: 24.80, cd: 1.82, range: 4 }, 5: { atk: 36.20, cd: 2.10, range: 4 } } },
    张飞: { name: '张飞', grade: '金', maxLevel: 5, atkType: 'aoe', skill: '咆哮，大范围眩晕敌人2秒；专武丈八蛇矛召唤灵蛇持续伤害控怪', levels: {
      1: { atk: 2.40, cd: 1.20, range: 3 }, 2: { atk: 8.80, cd: 1.32, range: 3 }, 3: { atk: 31.50, cd: 1.56, range: 3 },
      4: { atk: 42.60, cd: 1.78, range: 3 }, 5: { atk: 54.00, cd: 2.00, range: 3 } } },
    关羽: { name: '关羽', grade: '金', maxLevel: 5, atkType: 'splash', skill: '跳劈，击退敌人+高额溅射；青龙偃月刀击杀释放全屏刀气', levels: {
      1: { atk: 3.00, cd: 1.15, range: 3 }, 2: { atk: 9.40, cd: 1.28, range: 3 }, 3: { atk: 18.60, cd: 1.44, range: 3 },
      4: { atk: 29.70, cd: 1.65, range: 3 }, 5: { atk: 44.50, cd: 1.90, range: 3 } } },
    黄忠: { name: '黄忠', grade: '金', maxLevel: 5, atkType: 'aoe', skill: '全屏箭雨大招；落日弓增大射程，大范围远程输出', levels: {
      1: { atk: 1.80, cd: 1.30, range: 7 }, 2: { atk: 6.20, cd: 1.45, range: 7 }, 3: { atk: 12.50, cd: 1.62, range: 7 },
      4: { atk: 20.40, cd: 1.88, range: 7 }, 5: { atk: 30.60, cd: 2.15, range: 7 } } },
    马超: { name: '马超', grade: '金', maxLevel: 5, atkType: 'pierce', skill: '贯穿伤害，攻击附带击退；可装备龙胆亮银枪触发飞枪效果', levels: {
      1: { atk: 2.20, cd: 1.28, range: 4 }, 2: { atk: 7.90, cd: 1.42, range: 4 }, 3: { atk: 16.10, cd: 1.60, range: 4 },
      4: { atk: 25.30, cd: 1.85, range: 4 }, 5: { atk: 37.40, cd: 2.12, range: 4 } } },
    刘备: { name: '刘备', grade: '金', maxLevel: 5, atkType: 'single', skill: '全队回血、群体控制羁绊，和阿斗组队全队大幅增伤；轩辕剑触发君子剑效果', levels: {
      1: { atk: 1.60, cd: 1.10, range: 4 }, 2: { atk: 5.10, cd: 1.22, range: 4 }, 3: { atk: 10.20, cd: 1.38, range: 4 },
      4: { atk: 16.70, cd: 1.55, range: 4 }, 5: { atk: 24.50, cd: 1.76, range: 4 } } },
    关平: { name: '关平', grade: '紫', maxLevel: 3, atkType: 'aoe', skill: '小范围眩晕，张飞下位，紫武器全队加攻速', levels: {
      1: { atk: 1.50, cd: 1.18, range: 3 }, 2: { atk: 10.50, cd: 1.30, range: 3 }, 3: { atk: 19.20, cd: 1.45, range: 3 } } },
    关兴: { name: '关兴', grade: '紫', maxLevel: 3, atkType: 'splash', skill: '小幅击退，关羽下位', levels: {
      1: { atk: 1.70, cd: 1.22, range: 3 }, 2: { atk: 7.30, cd: 1.35, range: 3 }, 3: { atk: 14.60, cd: 1.50, range: 3 } } },
    张苞: { name: '张苞', grade: '紫', maxLevel: 3, atkType: 'pierce', skill: '赵云下位，直线穿透', levels: {
      1: { atk: 1.60, cd: 1.30, range: 4 }, 2: { atk: 6.80, cd: 1.44, range: 4 }, 3: { atk: 13.80, cd: 1.60, range: 4 } } },
    张翼: { name: '张翼', grade: '紫', maxLevel: 3, atkType: 'aoe', skill: '小范围群体伤害，过渡坦', levels: {
      1: { atk: 1.40, cd: 1.16, range: 3 }, 2: { atk: 5.90, cd: 1.30, range: 3 }, 3: { atk: 11.70, cd: 1.45, range: 3 } } },
    黄祖: { name: '黄祖', grade: '蓝', maxLevel: 2, atkType: 'single', skill: '低级远程过渡卡', levels: {
      1: { atk: 1.20, cd: 1.12, range: 5 }, 2: { atk: 4.30, cd: 1.25, range: 5 } } },
    黄盖: { name: '黄盖', grade: '蓝', maxLevel: 2, atkType: 'aoe', skill: '低级前排过渡卡', levels: {
      1: { atk: 1.30, cd: 1.10, range: 3 }, 2: { atk: 4.60, cd: 1.23, range: 3 } } }
  };

  // —— 武将两字配对表（先放首字再放次字）——
  // 由 HERO_DEF 自动推导，支持「一字多配」：如 黄→忠/盖/祖、张→飞/苞/翼、关→羽/平/兴。
  // 结构为一对多（首字 → 次字数组），避免手工维护写死一对一而漏配。
  const HERO_FIRST = {};    // 首字 → [次字...]
  const HERO_SECOND = {};   // 次字 → [首字...]
  (function buildHeroPairIndex() {
    for (const name of Object.keys(HERO_DEF)) {
      if (name.length !== 2) continue;
      const a = name[0], b = name[1];
      (HERO_FIRST[a] || (HERO_FIRST[a] = [])).push(b);
      (HERO_SECOND[b] || (HERO_SECOND[b] = [])).push(a);
    }
  })();

  const WEAPON_CHARS = new Set(['枪', '刀', '骑', '弓']);
  // 武将字（12 名武将的两字；首字在左、次字在右合成，见 core.findHeroPair）
  const HERO_CHARS = new Set(['赵', '云', '张', '飞', '黄', '忠', '关', '羽', '刘', '备', '马', '超', '平', '兴', '苞', '翼', '祖', '盖']);
  // 铲子：设定中的道具。拖到草地（草障）上可将障碍开垦为可放置空地；金铲（摸金校尉）可铲出宝箱。
  const ITEM_DEF = { 铲子: '铲掉草地（草障）开垦为可放置空地；金铲可铲出宝箱' };

  // —— 武器装备（神兵）定义：与 zyjad_weapon 一致，applyServerConfig 可覆盖 ——
  const WEAPON_DEF = {
    '龙胆亮银枪': { fitHero: '赵云（专属）、马超', effect: '每次攻击10%概率召唤飞枪，对全部敌人无差别伤害，赵云输出翻倍' },
    '丈八蛇矛': { fitHero: '张飞（专属）', effect: '攻击释放灵蛇持续伤害，大招后灵蛇攻速翻倍，强化控制' },
    '青龙偃月刀': { fitHero: '关羽（专属）', effect: '武将击杀敌人释放刀气，无差别攻击全场敌人，大幅提升单体斩杀' },
    '落日弓': { fitHero: '黄忠', effect: '攻击范围扩大，远程弹道加宽，大招伤害提升' },
    '射雕弓': { fitHero: '黄忠', effect: '路径伤害，概率挑起敌人砸落造成5倍伤害' },
    '君子剑': { fitHero: '刘备', effect: '体型变大，攻击力、攻击范围增加，击中敌人50%概率狼嚎增伤' },
    '玄铁盾': { fitHero: '张飞 / 前排武将', effect: '大幅提升生存，减少受到伤害' },
    '火龙剑': { fitHero: '黄忠', effect: '叠满攻速后全屏伤害，攻速流毕业武器' }
  };

  /* ===== 神秘商人（每场战斗结束出现，道具当天有效） =====
     说明：货币统一用「办公币💰」结算（独立于游戏内包子，钱包跨天/会话持久）。
     每次商店出现只能购买 1 件；价格可在此调整。 */
  const MERCHANT_ITEMS = [
    { id: 'xumingdan', name: '续命丹', rarity: '稀有', price: 50, type: 'passive',
      desc: '【被动】我方阿斗 +5 条命，对方阿斗 +3 条命' },
    { id: 'yanshi', name: '陨石', rarity: '传说', price: 150, type: 'passive',
      desc: '【被动】敌人接近阿斗时，落下陨石将其消灭' },
    { id: 'baozi', name: '包子', rarity: '卓越', price: 50, type: 'active',
      desc: '【主动】55% 给阿斗续 1 条命，45% 减少 1 条命' },
    { id: 'shenbingfu', name: '神兵符', rarity: '普通', price: 40, type: 'active',
      desc: '【主动】拖到武器单位上，该单位升 1 级' },
    { id: 'nongmin', name: '农民', rarity: '普通', price: 30, type: 'passive',
      desc: '【被动】刷出农民，每 20 秒 +1 包子，升级后生产翻倍' },
    { id: 'nini', name: '淤泥', rarity: '普通', price: 20, type: 'passive',
      desc: '【被动】道路泥泞，我方/敌人移速 -10%（全局）' },
    { id: 'mojin', name: '摸金校尉', rarity: '普通', price: 40, type: 'passive',
      desc: '【被动】铲子变金铲子，铲出宝箱' },
    { id: 'zhaoxian', name: '招贤榜', rarity: '普通', price: 60, type: 'passive',
      desc: '【被动】武将刷出概率 ×2' },
    { id: 'shengzhi', name: '升职令', rarity: '普通', price: 50, type: 'passive',
      desc: '【被动】刷出的兵有 5% 概率直接升到 2 级' }
  ];

  // —— 征兵卡池（兜底默认值；运行时由 zyjad_pool 表覆盖，含每局初始张数 count）——
  // w 为相对权重（决定同剩余量下的抽取偏向）；count 为本局初始存量（抽走即减，不回池）。
  const POOL = [
    { kind: 'char', ch: '刀', w: 18, count: 19 },
    { kind: 'char', ch: '枪', w: 17, count: 18 },
    { kind: 'char', ch: '骑', w: 17, count: 17 },
    { kind: 'char', ch: '弓', w: 17, count: 17 },
    // 金将字（五虎+刘备，初始各 2 张）
    { kind: 'char', ch: '赵', w: 1.5, count: 2 }, { kind: 'char', ch: '云', w: 1.5, count: 2 },
    { kind: 'char', ch: '张', w: 1, count: 2 }, { kind: 'char', ch: '飞', w: 1, count: 2 },
    { kind: 'char', ch: '黄', w: 1, count: 2 }, { kind: 'char', ch: '忠', w: 1, count: 2 },
    { kind: 'char', ch: '关', w: 1, count: 2 }, { kind: 'char', ch: '羽', w: 1, count: 2 },
    { kind: 'char', ch: '刘', w: 1, count: 1 }, { kind: 'char', ch: '备', w: 1, count: 1 },
    { kind: 'char', ch: '马', w: 1, count: 2 }, { kind: 'char', ch: '超', w: 1, count: 2 },
    // 紫/蓝将字（初始各 1 张）
    { kind: 'char', ch: '平', w: 0.5, count: 1 }, { kind: 'char', ch: '兴', w: 0.5, count: 1 },
    { kind: 'char', ch: '苞', w: 0.5, count: 1 }, { kind: 'char', ch: '翼', w: 0.5, count: 1 },
    { kind: 'char', ch: '祖', w: 0.5, count: 1 }, { kind: 'char', ch: '盖', w: 0.5, count: 1 }
  ];

  // —— 节奏参数（v6 放慢：出兵更缓、敌兵更慢）——
  // 全局配置：以下仅为后端无数据时的兜底默认值；运行时由 zyjad_setting 表覆盖（见 applyServerConfig）。
  const CFG = {
    BAOZI_START: 20,        // 起始包子
    CONSCRIPT_COST: 10,     // 首次征兵基础花费
    CONSCRIPT_STEP: 2,      // 每征兵一次，花费递增
    KILL_REWARD_MOB: 1,     // 击杀小兵奖励包子
    KILL_REWARD_BOSS: 40,   // 击杀 BOSS 奖励包子
    SPAWN_INTERVAL: 2.4,    // 敌兵出生间隔（秒）
    WAVE_GAP: 8.0,          // 一波清空后到下一波的间隔（秒）
    FIRST_DELAY: 3.0,       // 开局到第一波的准备时间（秒，所有模式统一）
    SPEED_MUL: 0.225,       // 敌兵移动速度全局系数（运行以 zyjad_setting.SPEED_MUL 为准，再降一半）
    ITEM_DRAW_RATE: 0.05,   // 征兵出道具(铲子)概率（运行以 zyjad_setting.ITEM_DRAW_RATE 为准）
    ADOU_MAX: 20,           // 阿斗爱心上限（敌人撞阿斗按 dmg 扣爱心）
    HP_GROWTH: 1.12,        // 野怪血量每波指数倍率：baseHp×HP_GROWTH^(波次-1)；1.12=原版，1.10平缓，1.15硬核
    HP_CAP_MUL: 50          // 野怪血量封顶倍数（基础血量×此值），防止无尽数值爆炸
  };

  // —— 野怪 / BOSS 定义（与 zyjad_enemy 一致）——
  // atk 语义 = 撞阿斗扣除的爱心数；敌人不主动攻击我方棋子，只冲向阿斗。
  // glyph 为战场显示单字；boss 决定是否画大写 + 击杀高额奖励。
  const WAVE_DEF = {
    山贼:     { gly: '贼', hp: 18,  speed: 0.8,  dmg: 1, boss: false, feature: '基础小怪，撞阿斗扣 1 爱心' },
    曹军刀兵: { gly: '刀', hp: 32,  speed: 0.70, dmg: 1, boss: false, feature: '血量更高，需要更多输出击杀' },
    曹军枪兵: { gly: '枪', hp: 26,  speed: 0.90, dmg: 1, boss: false, feature: '移动快，容易偷跑' },
    曹军弓手: { gly: '弓', hp: 20,  speed: 0.60, dmg: 1, boss: false, feature: '移速慢，血量低' },
    西凉轻骑: { gly: '骑', hp: 40,  speed: 1.40, dmg: 1, boss: false, feature: '高速冲锋，最容易漏' },
    重甲盾兵: { gly: '盾', hp: 85,  speed: 0.40, dmg: 2, boss: false, feature: '撞阿斗一次扣 2 爱心，血厚难杀' },
    淤泥怪:   { gly: '泥', hp: 45,  speed: 0.50, dmg: 2, boss: false, feature: '撞阿斗扣 2 爱心，经过时减速我方棋子攻速(可叠加)' },
    精英曹军: { gly: '精', hp: 110, speed: 0.60, dmg: 2, boss: false, feature: '后期杂兵，撞阿斗扣 2 爱心' },
    张宝:     { gly: '张宝', hp: 320,  speed: 0.40, dmg: 3, boss: true, feature: '撞阿斗扣 3 爱心，召唤小怪' },
    张角:     { gly: '张角', hp: 450,  speed: 0.45, dmg: 3, boss: true, feature: '撞阿斗扣 3，落雷' },
    张良:     { gly: '张良', hp: 520,  speed: 0.50, dmg: 3, boss: true, feature: '撞阿斗扣 3，法术单点' },
    华雄:     { gly: '华雄', hp: 600,  speed: 0.60, dmg: 4, boss: true, feature: '撞阿斗扣 4，召唤骑兵' },
    甄姬:     { gly: '甄姬', hp: 480,  speed: 0.40, dmg: 3, boss: true, feature: '撞阿斗扣 3，全场减速' },
    孙尚香:   { gly: '孙尚香', hp: 550, speed: 0.50, dmg: 4, boss: true, feature: '撞阿斗扣 4，封锁地块' },
    貂蝉:     { gly: '貂蝉', hp: 720,  speed: 0.55, dmg: 4, boss: true, feature: '撞阿斗扣 4，魅惑小兵' },
    董卓:     { gly: '董卓', hp: 850,  speed: 0.35, dmg: 5, boss: true, feature: '撞阿斗扣 5，吞噬回血' },
    吕布:     { gly: '吕布', hp: 950,  speed: 0.60, dmg: 5, boss: true, feature: '撞阿斗扣 5，压制小兵等级' },
    夏侯惇:   { gly: '夏侯惇', hp: 880, speed: 0.50, dmg: 5, boss: true, feature: '撞阿斗扣 5，残血狂暴(血<40% 撞伤+60%)' },
    曹操:     { gly: '曹操',   hp: 1100, speed: 0.50, dmg: 6, boss: true, feature: '撞阿斗扣 6 爱心，最高伤害 BOSS' }
  };

  // —— 20 波标准局组成（与 zyjad_wave 一致；name 必须与 WAVE_DEF 的 key 完全一致）——
  // 小野怪数量：纯小怪波 ×2（更充实），含 BOSS 的波只保留 1 份小野怪 + BOSS，
  // 避免小怪翻倍占用输出导致 BOSS 漏过去（突入）而拿不到 BOSS 击杀奖励。
  // 非 BOSS 波小兵数量倍率：整波不含 BOSS 时，所有小兵数量＝基准 × 该倍率（含数据库数据源）。
  const NONBOSS_WAVE_MUL = 2;
  // 判定某波是否为 BOSS 波：波内任一敌人 WAVE_DEF 标记 boss 即算
  const isBossWave = (wave) => Array.isArray(wave) && wave.some(n => WAVE_DEF[n] && WAVE_DEF[n].boss);
  // 对「非 BOSS 波」按倍率放大，就地修改数组（每个名字重复出现即视为一只）
  const scaleNonBossWaves = (waves) => {
    if (!NONBOSS_WAVE_MUL || NONBOSS_WAVE_MUL === 1) return waves;
    for (let i = 0; i < waves.length; i++) {
      const w = waves[i];
      if (!Array.isArray(w) || !w.length) continue;
      if (isBossWave(w)) continue;                       // BOSS 波不翻倍
      const out = [];
      for (const n of w) for (let k = 1; k < NONBOSS_WAVE_MUL; k++) out.push(n); // 追加 (mul-1) 份
      for (const n of out) w.push(n);
    }
    return waves;
  };
  const WAVES = [
    ['山贼','山贼','山贼','山贼','山贼','山贼','山贼','山贼','山贼','山贼','山贼','山贼'],
    ['山贼','山贼','山贼','山贼','山贼','山贼','山贼','山贼','山贼','山贼','曹军刀兵','曹军刀兵','曹军刀兵','曹军刀兵','曹军刀兵','曹军刀兵'],
    ['山贼','山贼','山贼','山贼','山贼','山贼','山贼','山贼','曹军刀兵','曹军刀兵','曹军刀兵','曹军刀兵','曹军刀兵','曹军刀兵','曹军刀兵','曹军刀兵'],
    ['曹军刀兵','曹军刀兵','曹军刀兵','曹军刀兵','张宝'],
    ['曹军刀兵','曹军刀兵','曹军刀兵','曹军刀兵','曹军刀兵','曹军刀兵','曹军刀兵','曹军刀兵','曹军枪兵','曹军枪兵','曹军枪兵','曹军枪兵','曹军枪兵','曹军枪兵','曹军枪兵','曹军枪兵'],
    ['曹军枪兵','曹军枪兵','曹军枪兵','曹军枪兵','曹军枪兵','曹军枪兵','曹军枪兵','曹军枪兵','曹军枪兵','曹军枪兵','曹军弓手','曹军弓手','曹军弓手','曹军弓手'],
    ['曹军枪兵','曹军枪兵','曹军枪兵','曹军枪兵','曹军枪兵','曹军枪兵','曹军枪兵','曹军枪兵','曹军弓手','曹军弓手','曹军弓手','曹军弓手','曹军弓手','曹军弓手','曹军弓手','曹军弓手'],
    ['曹军弓手','曹军弓手','曹军弓手','曹军弓手','西凉轻骑','西凉轻骑','西凉轻骑','张角'],
    ['西凉轻骑','西凉轻骑','西凉轻骑','西凉轻骑','西凉轻骑','西凉轻骑','西凉轻骑','西凉轻骑','重甲盾兵','重甲盾兵','重甲盾兵','重甲盾兵'],
    ['重甲盾兵','重甲盾兵','重甲盾兵','重甲盾兵','重甲盾兵','重甲盾兵','淤泥怪','淤泥怪','淤泥怪','淤泥怪','淤泥怪','淤泥怪'],
    ['重甲盾兵','重甲盾兵','重甲盾兵','重甲盾兵','重甲盾兵','重甲盾兵','淤泥怪','淤泥怪','淤泥怪','淤泥怪','淤泥怪','淤泥怪'],
    ['淤泥怪','淤泥怪','淤泥怪','精英曹军','精英曹军','精英曹军','张良'],
    ['精英曹军','精英曹军','精英曹军','西凉轻骑','西凉轻骑','西凉轻骑','西凉轻骑','西凉轻骑','华雄'],
    ['精英曹军','精英曹军','精英曹军','精英曹军','甄姬'],
    ['精英曹军','精英曹军','精英曹军','精英曹军','孙尚香'],
    ['精英曹军','精英曹军','精英曹军','重甲盾兵','重甲盾兵','貂蝉'],
    ['精英曹军','精英曹军','精英曹军','淤泥怪','淤泥怪','淤泥怪','董卓'],
    ['精英曹军','精英曹军','精英曹军','西凉轻骑','西凉轻骑','西凉轻骑','吕布'],
    ['重甲盾兵','重甲盾兵','重甲盾兵','精英曹军','精英曹军','精英曹军','夏侯惇'],
    ['山贼','山贼','山贼','曹军刀兵','曹军刀兵','曹军刀兵','曹军枪兵','曹军枪兵','曹军枪兵','曹军弓手','曹军弓手','曹军弓手','西凉轻骑','西凉轻骑','西凉轻骑','重甲盾兵','重甲盾兵','重甲盾兵','淤泥怪','淤泥怪','淤泥怪','精英曹军','精英曹军','精英曹军','曹操']
  ];
  // 内置兜底波次也套用「非 BOSS 波小兵翻倍」（与数据库数据源保持一致的最终效果）
  scaleNonBossWaves(WAVES);

  // —— 主线关卡 ——
  // 结构：MAIN[章节索引] = [ 关卡0, 关卡1, ... ]
  //       关卡 = [ 波次0, 波次1, ... ]，每个波次 = 敌兵名字数组
  // 标准模式 = 第 1 章第 1 关，共 20 波（见 WAVES）；无尽模式循环 WAVES 并逐级放大。
  const MAIN = [[WAVES]];

  // —— 用后端配置（zyjad_unit / zyjad_hero / zyjad_weapon）就地覆盖内置默认数值 ——
  // server 结构：{ units:[...], heroes:[...], weapons:[...] }（见后端 GET /zyjad/api/config）
  function applyServerConfig(server) {
    if (!server) return;
    if (Array.isArray(server.units)) {
      for (const u of server.units) {
        const key = u.unitKey;
        const def = UNIT_DEF[key] || (UNIT_DEF[key] = { name: u.name, role: u.role, atkType: u.atkType, feature: u.feature, levels: {} });
        def.name = u.name; def.role = u.role; def.atkType = u.atkType; def.feature = u.feature;
        // 数据库存「基准 cd」，此处同样套用攻速倍率，保证前后端数据源行为一致
        const cd = +u.cd / (WEAPON_ATKSPEED_MUL || 1);
        def.levels[u.level] = { atk: +u.atk, cd: +cd.toFixed(2), range: +u.range, atkType: u.atkType };
      }
    }
    if (Array.isArray(server.heroes)) {
      for (const h of server.heroes) {
        const key = h.heroKey;
        const def = HERO_DEF[key] || (HERO_DEF[key] = { name: h.name, grade: h.grade, skill: h.skill, maxLevel: h.maxLevel, atkType: h.atkType, levels: {} });
        def.name = h.name; def.grade = h.grade; def.skill = h.skill; def.maxLevel = h.maxLevel; def.atkType = h.atkType;
        def.levels[h.level] = { atk: +h.atk, cd: +h.cd, range: +h.range, atkType: h.atkType };
      }
    }
    if (Array.isArray(server.weapons)) {
      for (const w of server.weapons) WEAPON_DEF[w.weaponName] = { fitHero: w.fitHero, effect: w.effect };
    }
    if (Array.isArray(server.enemies)) {
      for (const e of server.enemies) {
        // boss 标志兜底：若数据库 zyjad_enemy.boss 列异常(0/null)，保留前端默认已知 boss 值，
        // 避免 BOSS 被误判为小怪、击杀只给 +1 而不给 +40 奖励。
        const defBoss = WAVE_DEF[e.enemyName] && WAVE_DEF[e.enemyName].boss;
        const isBoss = !!e.boss || !!defBoss;
        // Boss 显示名用完整名（如「张宝」「夏侯惇」），否则后端单字 glyph 会把多字名清成单字；
        // 小怪仍用服务端 glyph（缺省回退到原名）。
        const gly = isBoss ? (e.enemyName || e.glyph) : (e.glyph || e.enemyName);
        WAVE_DEF[e.enemyName] = { gly: gly, hp: +e.hp, speed: +e.speed, dmg: +e.dmg, boss: isBoss, feature: e.feature };
      }
    }
    if (Array.isArray(server.waves)) {
      const tmp = [];
      for (const r of server.waves) {
        const i = (r.waveNo || 1) - 1;
        if (!tmp[i]) tmp[i] = [];
        const n = r.cnt || 1;
        for (let k = 0; k < n; k++) tmp[i].push(r.enemyName);
      }
      WAVES.length = 0; for (let i = 0; i < tmp.length; i++) WAVES.push(tmp[i] || []);
      scaleNonBossWaves(WAVES);   // 数据库波次同样套用「非 BOSS 波翻倍」，两侧效果一致
    }
    // 全局配置（CFG）全部以数据库 zyjad_setting 表为准，覆盖前端兜底默认值
    if (Array.isArray(server.settings)) {
      for (const s of server.settings) {
        if (s && s.k) CFG[s.k] = Number(s.val);
      }
    }
    // 征兵卡池（POOL）以数据库 zyjad_pool 表为准，覆盖前端兜底默认值
    if (Array.isArray(server.pools) && server.pools.length) {
      POOL.length = 0;
      for (const p of server.pools) POOL.push({ kind: p.kind, ch: p.ch, w: +p.w, count: +p.count || 1 });
    }
    // 地图覆盖：后台地图编辑器保存的整图（每行字符串）。校验行列整齐且字符合法后才采用，
    // 并清空路径缓存（否则仍按旧地图算出的兵道）。
    if (Array.isArray(server.map) && server.map.length) {
      const rows = server.map.filter(s => typeof s === 'string' && s.length > 0);
      const w = rows.length ? rows[0].length : 0;
      const ok = rows.length > 0 && w > 0 && rows.every(s => s.length === w && /^[ASpP.o#w]+$/.test(s));
      if (ok) {
        MAP = rows.slice();
        _laneCache = null;
      }
    }
  }

  return {
    COLS, ROWS, CELL, MAP, TYP,
    get LANE() { return getLane(MAP, TYP); },
    get LANE_ALLY() { return getLaneAlly(MAP, TYP); },
    UNIT_DEF, HERO_DEF, HERO_FIRST, HERO_SECOND, WEAPON_DEF,
    WEAPON_CHARS, HERO_CHARS, ITEM_DEF, MERCHANT_ITEMS, POOL, CFG, WAVE_DEF, MAIN, WAVES,
    applyServerConfig,
    // 暴露路径构建工具（core.init 调用）
    buildLane, getLane, getLaneAlly
  };
})();
