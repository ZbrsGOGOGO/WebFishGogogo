/* =========================================================================
 * 九层妖塔 · 状态层 (state.js)
 * 全局存档 S、账号云存档、每日重置、全服模拟、升级/战力。
 * ========================================================================= */
(function (global) {
  'use strict';
  const C = global.CFG;

  /* ---------- 默认存档 ---------- */
  function defaultState() {
    const dims = {};
    C.DIMS.forEach(d => { dims[d.key] = 8 + Math.floor(Math.random() * 5); }); // 8~12
    const sum = Object.values(dims).reduce((a, b) => a + b, 0);
    // 把总和补到 ~50
    let i = 0;
    while (sum + i < 50) { const k = C.DIMS[i % 5].key; dims[k]++; i++; }

    const layers = [];
    for (let k = 1; k <= 9; k++) {
      layers.push({
        layer: k,
        status: k === 1 ? 'open' : 'locked',   // open / cleared / locked
        bossHp: C.bossMaxHp(k),
        bossMaxHp: C.bossMaxHp(k),
        clues: 0,
        channel: 0,
        channelGoal: 200 + k * 80
      });
    }
    const server = { day: 1, pop: 2000, lvAvg: 30 };

    return {
      name: '寻道者',
      level: 1, xp: 0, xpToday: 0,
      dims: dims,
      freePoints: 0,
      charGift: null,            // 开局主维
      destiny: [],               // 已觉醒命格 id
      stamina: C.STAMINA_MAX, staminaMax: C.STAMINA_MAX, lastRecover: Date.now(),
      stone: 50,
      injury: 0,                 // 0~3
      exploreCount: 0, bossCount: 0, talisman: 2,
      inventory: { materials: 0, runes: 0, pills: { str: 0, spd: 0, agi: 0, def: 0, luc: 0 } },
      dimPerm: { str: 0, spd: 0, agi: 0, def: 0, luc: 0 }, // 淬体丹永久
      weapons: [],               // {id, star, favor, plus}
      runeBag: [],               // 符文背包实例 {uid,kind,name,type,dim,stat,val,desc}（装备镶嵌用）
      talents: [],               // 天赋 {id, lv}
      jing: 0,                   // 天赋点（满级重复领悟转化 / 手动升级消耗）
      grantLog: [],              // 升级抽取记录（最近6条）{lv,kind,name,rarity,dup,plus}
      equip: { weapon: null, faqi: null }, // 主手武器id / 法器id
      // §8 装备/打造系统（全新，替换旧预设武器）
      mat: {},                                // 锻造材料（遮天神材，按 id 存储）
      refine: {},                            // 精炼料库存：{ 等级: { matId: 数量 } }（粗炼/精炼/纯净）
      jinchi: 0,                            // 烬赤源核（红色稀有）
      sect: null,                           // 帮派：{ name, element, level }
      blueprints: {},                       // 锻造图纸：{ bpId: 数量 }
      equipSlots: { head: null, chest: null, wrist: null, pants: null, shoes: null, necklace: null, weapon: null },
      equipBag: [],                         // 已打造装备实例
      zhengdao: null,                       // 证道武器（占用武器位，可重塑）
      avatar: { hat: 0, hair: 0, face: 0, glass: 0, top: 0, pant: 0, shoe: 0, hand: 0 },
      layers: layers,
      server: server,
      friends: C.FRIENDS.map((f, idx) => ({ id: idx, name: f.name, off: f.off, sparred: false })),
      story: { done: [], flags: {}, eggs: [] },   // 连锁剧情/彩蛋进度（落库）
      sparCount: 0,
      gongfa: { unlocked: {}, active: null },  // 功法：{ unlocked:{gfId:level}, active:gfId }
      gongfaBooks: [],              // 功法书背包 {uid, gfId, learned}（探索/秘境/升级抽取掉落）
      daoYun: 0,                              // 功法点（功法养成专用，仙金不参与）
      weekReset: todayStr(),
      _dayBought: {},                         // 商店每日限购计数（每日 0 点重置）
      _sectYieldDay: '',                    // 帮派每日产出锁定
      log: [],
      stats: { bossDamage: 0, exploreTotal: 0, realmTotal: 0 }
    };
  }

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  /* ---------- 存档读写 ---------- */
  let S = defaultState();

  function save() {
    // 把当前战力落入存档，供后端战力排行榜（JSON 路径投影）直接读取
    try { S.power = powerScore(); } catch (e) {}
    // 同步到本站账号云存档；桥会去重相同快照，并在版本冲突时冻结写入。
    try {
      if (global.API && global.API.saveProgress) global.API.saveProgress(S).catch(function () {});
    } catch (e) {}
  }
  function load() {
    // 站内版本不读取浏览器本地存档，避免账号切换时串档。联网档案会在
    // 初始化阶段通过 API.getProgress 后应用；读取完成前桥不会发送写入。
    ensureEquip();
    return S;
  }
  /* 装备系统字段兜底（旧存档迁移 + 遮天神材映射） */
  function ensureEquip() {
    if (!S.mat || typeof S.mat !== 'object' || Array.isArray(S.mat)) S.mat = {};
    if (!S.blueprints || typeof S.blueprints !== 'object' || Array.isArray(S.blueprints)) S.blueprints = {};
    // 旧版 t1~t4 通用材料迁移到遮天神材（按层级映射，尽量保留价值）
    if (S.mat.t1 || S.mat.t2 || S.mat.t3 || S.mat.t4) {
      const old = S.mat; S.mat = {};
      if (old.t1) { S.mat.ht = (S.mat.ht || 0) + Math.ceil(old.t1 / 2); S.mat.lm = (S.mat.lm || 0) + Math.floor(old.t1 / 2); }
      if (old.t2) { S.mat.ct = (S.mat.ct || 0) + Math.ceil(old.t2 / 2); S.mat.yl = (S.mat.yl || 0) + Math.floor(old.t2 / 2); }
      if (old.t3) { S.mat.lh = (S.mat.lh || 0) + Math.ceil(old.t3 / 2); S.mat.wj = (S.mat.wj || 0) + Math.floor(old.t3 / 2); }
      if (old.t4) { S.mat.xlg = (S.mat.xlg || 0) + old.t4; }
    }
    if (typeof S.jinchi !== 'number') S.jinchi = 0;
    if (!S.equipSlots) S.equipSlots = { head: null, chest: null, wrist: null, pants: null, shoes: null, necklace: null, weapon: null };
    C.EQUIP.SLOTS.forEach(s => { if (!(s.key in S.equipSlots)) S.equipSlots[s.key] = null; });
    if (!Array.isArray(S.equipBag)) S.equipBag = [];
    (S.equipBag || []).forEach(it => {
      if (!it.affixes || !Array.isArray(it.affixes)) it.affixes = [];
      if (!it.slots || !Array.isArray(it.slots)) it.slots = [];
      if (it.zhengdao && !it.inscriptions) it.inscriptions = [];
      // 旧存档清洗：凡铁（白/绿）不应带套装名，残留 set 一律清空
      if ((it.quality === '白' || it.quality === '绿') && it.set) it.set = null;
    });
    if (S.zhengdao === undefined) S.zhengdao = null;
    if (S.zhengdao) {
      if (!S.zhengdao.affixes || !Array.isArray(S.zhengdao.affixes)) S.zhengdao.affixes = [];
      if (!S.zhengdao.inscriptions) S.zhengdao.inscriptions = [];
    }
    if (S.gongfa === undefined) S.gongfa = { unlocked: {}, active: null };
    if (S.gongfa.unlocked === undefined) S.gongfa.unlocked = {};
    if (S.gongfa.active === undefined) S.gongfa.active = null;
    if (S.daoYun === undefined) S.daoYun = 0;
    ST.gongfaAutoUnlock();
  }
  /* 全服是否已推进到 7 层及以上（高阶材料/烬赤源核掉落门槛 §8.8） */
  function highUnlocked() {
    return (S.layers || []).some(L => L.layer >= 7 && L.status !== 'locked');
  }
  function reset() { S = defaultState(); save(); return S; }

  /* ---------- 每日重置 / 体力自然恢复 ---------- */
  function ensureDaily() {
    const t = todayStr();
    // 体力恢复（按分钟）
    const now = Date.now();
    const minPassed = (now - (S.lastRecover || now)) / 60000;
    if (minPassed >= C.STAMINA_REGEN_MIN) {
      const gained = Math.floor(minPassed / C.STAMINA_REGEN_MIN);
      S.stamina = Math.min(S.staminaMax, S.stamina + gained);
      S.lastRecover = now;
    }
    // 跨天：重置探索次数、今日经验、好友切磋、周限，并 0 点补满体力与探索符
    if (S._day !== t) {
      S.stamina = S.staminaMax;                 // 每日 0 点体力补满
      S.talisman = C.TALISMAN_DAILY_MAX;         // 每日 0 点探索符补满
      S.lastRecover = now;
      // 全服 KPI（day/pop/lvAvg）改由后端权威，不再本地随机推进
      S.exploreCount = 0;
      S.bossCount = 0;                         // 每日 BOSS 次数重置
      S._dayBought = {};                       // 每日限购重置
      S.xpToday = 0;
      S.friends.forEach(f => f.sparred = false);
      S.sparCount = 0;
      // 周限商品（以 7 天为周期）
      if (daysBetween(S.weekReset, t) >= 7) { S.weekReset = t; S._weekBought = {}; }
      S._day = t;
    }
    save();
  }

  function daysBetween(a, b) {
    const da = new Date(a), db = new Date(b);
    return Math.round((db - da) / 86400000);
  }

  /* ---------- 全服达到某等级人数 §4.2 ---------- */
  function countAtLevel(L) {
    const s = S.server;
    return Math.max(0, Math.floor(s.pop * (1 - L / (s.lvAvg * 2.2))));
  }

  /* ---------- 经验 / 升级 ---------- */
  function gainXp(amount) {
    const inc = amount;          // 取消每日经验封顶：经验仅受体力与升级曲线约束
    S.xpToday += inc;
    S.xp += inc;
    let leveled = 0;
    while (S.level < 120 && S.xp >= C.xpNeed(S.level)) {
      S.xp -= C.xpNeed(S.level);
      S.level++;
      leveled++;
      grantLevelRewards();
    }
    save();
    return leveled;
  }

  function grantLevelRewards() {
    // 自由点 +1
    S.freePoints += 1;
    // 保底成长：随机 2 维各 +1
    const keys = C.DIMS.map(d => d.key);
    const a = keys[Math.floor(Math.random() * 5)];
    let b = keys[Math.floor(Math.random() * 5)];
    while (b === a) b = keys[Math.floor(Math.random() * 5)];
    S.dims[a]++; S.dims[b]++;
    // 轮空 & 潜心（p≈18%）：补最低维 +1
    if (Math.random() < 0.18) {
      const minK = keys.reduce((m, k) => S.dims[k] < S.dims[m] ? k : m, keys[0]);
      S.dims[minK]++;
    }
    // 每 5 级体力上限 +1
    if (S.level % 5 === 0) S.staminaMax += 1;
    // 每 15 级（突破）：有概率觉醒下一个命格
    if (S.level % 15 === 0) {
      const next = C.GIFTS.find(g => !S.destiny.includes(g.id));
      if (next) {
        if (Math.random() < C.DESTINY_AWAKEN_ODDS) {
          S.destiny.push(next.id);
          toast('突破！觉醒命格：' + next.name);
        } else {
          toast('突破！但机缘未到，未能觉醒命格');
        }
      }
    }
    // 升级抽取 §9.1：每升 1 级免费抽 1 发（40% 武器 / 60% 天赋），品质由等级档位决定（§5.4）
    const g = Gacha.grantRandom();
    if (g) {
      S.grantLog = (S.grantLog || []).slice(-5);
      S.grantLog.push({ lv: S.level, kind: g.kind, name: g.name, rarity: g.rarity, dup: g.dup, plus: g.plus });
      if (global.UI && global.UI.showLevelDraw) global.UI.showLevelDraw(g);
      else toast('🎁 升级抽取·' + (g.kind === 'weapon' ? '武器' : '天赋') + '：' + g.name +
        ' [' + g.rarity + ']' + (g.dup ? '（升 +' + g.plus + '）' : '（全新）'));
    }
  }

  /* ---------- 有效五维（含命格/永久/药丸） ---------- */
  function effectiveDims(opts) {
    const d = {};
    C.DIMS.forEach(x => {
      d[x.key] = S.dims[x.key] + (S.dimPerm[x.key] || 0) + (S.inventory.pills[x.key] || 0);
    });
    // 命格
    if (S.destiny.includes('str')) d.str += 8;
    if (S.destiny.includes('spd')) d.spd += 8;
    if (S.destiny.includes('agi')) d.agi += 8;
    if (S.destiny.includes('def')) d.def += 8;
    if (S.destiny.includes('luc')) d.luc += 8;
    // §8 穿戴装备的五维词条（与命格、五维乘法叠加）
    const eb = equipDimBonus(S);
    C.DIMS.forEach(x => { d[x.key] += (eb[x.key] || 0); });
    // 伤势：每点 −5% 全属性（上限 3，0 即无损）——战力与战斗快照均经由此函数，自动生效
    const inj = 1 - 0.05 * (S.injury || 0);
    if (inj !== 1) C.DIMS.forEach(x => { d[x.key] = Math.round(d[x.key] * inj); });
    return d;
  }

  /* ---------- 战力评分 §4.7 ---------- */
  function powerScore() {
    let p = S.level * 6;
    const ed = effectiveDims({ equip: true });
    p += C.DIMS.reduce((s, x) => s + ed[x.key], 0) * 2;
    p += S.destiny.length * 15;
    p += equipPower(S);
    return Math.round(p);
  }

  /* 天赋：领悟/升级/满级转化天赋点 §9.2 */
  function addTalent(id) {
    const t = C.TALENTS.find(x => x.id === id);
    if (!t) return { dup: false, plus: 0, converted: false };
    const o = S.talents.find(x => x.id === id);
    if (!o) { S.talents.push({ id: id, lv: 1 }); return { dup: false, plus: 1, converted: false }; }
    if (o.lv < t.max) { o.lv++; return { dup: true, plus: o.lv, converted: false }; }
    S.jing += 5; return { dup: true, plus: o.lv, converted: true, jing: 5 };
  }
  /* 天赋升级领悟概率：按目标等级递减 + 难度系数（类别/稀有度），clamp 到 [0.1, 0.97] */
  function talentLearnRate(t, targetLv) {
    const base = (C.TALENT_RATE_BY_LV && C.TALENT_RATE_BY_LV[targetLv]) || 0.5;
    let scale = 1;
    if (t.id === 'tVip' || t.id === 'tPalm' || t.id === 'tChimeMax') scale = 0.70; // 秘传高阶武诀最难
    else if (t.id === 'tLightHeavy' || t.id === 'tThrow') scale = 0.85;
    else scale = ({ 根骨: 1.05, 武势: 1.0, 武诀: 0.85, 身形: 0.92 })[t.cat] || 1;
    return Math.max(0.1, Math.min(0.97, base * scale));
  }
  /* 天赋点手动升级天赋（按等级概率领悟；失败返还一半天赋点，保留代价以拉长节奏） */
  function upTalent(id) {
    const t = C.TALENTS.find(x => x.id === id);
    const o = S.talents.find(x => x.id === id);
    if (!t || !o) return { ok: false, msg: '尚未领悟该天赋' };
    if (o.lv >= t.max) return { ok: false, msg: '已达满级' };
    if (S.jing < t.jing) return { ok: false, msg: '天赋点不足（需 ' + t.jing + '）' };
    const target = o.lv + 1;
    const rate = talentLearnRate(t, target);
    const cost = t.jing;
    S.jing -= cost;
    save();
    if (Math.random() < rate) {
      o.lv++; save();
      return { ok: true, lv: o.lv, cost: cost };
    }
    const back = Math.ceil(cost / 2);          // 领悟失败：返还一半天赋点（向上取整）
    S.jing += back; save();
    return { ok: false, fail: true, msg: '领悟失败（成功率 ' + Math.round(rate * 100) + '%）！返还 ' + back + ' 天赋点（净耗 ' + (cost - back) + '）', cost: cost, back: back };
  }

  /* 生成一枚符文实例（kind 省略则随机）存入背包；同时累加 inventory.runes 兼容显示 */
  function addRune(kind) {
    if (!kind) kind = C.RUNE_POOL[Math.floor(Math.random() * C.RUNE_POOL.length)];
    S._ruid = (S._ruid || 0) + 1;
    const k = C.RUNE_KINDS[kind];
    const r = { uid: S._ruid, kind: kind, name: k.name, type: k.type, dim: k.dim, stat: k.stat, val: k.val, desc: k.desc };
    S.runeBag.push(r);
    S.inventory.runes = (S.inventory.runes || 0) + 1;
    save();
    return r;
  }
  function toast(msg) {
    if (global.UI && global.UI.toast) global.UI.toast(msg);
    else console.log(msg);
  }

  /* ===== 后端权威数据接入 ===== */
  function applyServer(s) {
    if (!s) return;
    if (s.day != null) S.server.day = s.day;
    if (s.pop != null) S.server.pop = s.pop;
    if (s.lvAvg != null) S.server.lvAvg = s.lvAvg;
  }
  function applyLayers(list) {
    if (!list || !list.length) return;
    list.forEach(function (it) {
      const i = (it.layerId != null ? it.layerId : it.layer) - 1;
      if (i < 0 || i >= S.layers.length) return;
      const L = S.layers[i];
      if (it.status) L.status = it.status;
      if (it.bossHp != null) L.bossHp = it.bossHp;
      if (it.bossMaxHp != null) L.bossMaxHp = it.bossMaxHp;
      if (it.channel != null) L.channel = it.channel;
      if (it.channelGoal != null) L.channelGoal = it.channelGoal;
      if (it.clues != null) L.clues = it.clues;
    });
    save();
  }
  function applyCloud(saveDataStr) {
    if (!saveDataStr) return;
    let d;
    try { d = JSON.parse(saveDataStr); } catch (e) { return; }
    const keepServer = S.server, keepLayers = S.layers;
    Object.keys(d).forEach(function (k) { S[k] = d[k]; });
    S.server = keepServer;
    S.layers = keepLayers;
    ensureEquip();   // 云端存档同样走字段兜底与旧数据清洗（白/绿去套装等）
    save();
  }
  function restoreSnapshot(saveDataStr) {
    let d;
    try { d = typeof saveDataStr === 'string' ? JSON.parse(saveDataStr) : saveDataStr; } catch (e) { return false; }
    if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
    S = d;
    ensureEquip();
    save();
    return true;
  }

  /* ============ §8 装备 / 打造系统（全新，替换旧预设武器） ============ */
  function ri(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function addMat(id, n) { if (!S.mat) S.mat = {}; S.mat[id] = (S.mat[id] || 0) + (n || 0); save(); }
  function addJinchi(n) { S.jinchi = (S.jinchi || 0) + (n || 0); save(); }

  function topDim() {
    const d = {};
    C.DIMS.forEach(x => { d[x.key] = (S.dims[x.key] || 0) + (S.dimPerm[x.key] || 0) + (S.inventory.pills[x.key] || 0) + (S.destiny.includes(x.key) ? 8 : 0); });
    let best = 'str', bv = -1;
    C.DIMS.forEach(x => { if (d[x.key] > bv) { bv = d[x.key]; best = x.key; } });
    return best;
  }
  function runeSlotsFor(qualKey) {
    return ({ '白': 1, '绿': 1, '蓝': 2, '紫': 2, '橙': 3 })[qualKey] || 1;
  }
  function pickName(qualKey, slot) {
    const pre = (C.EQUIP.NAME_PREFIX[qualKey] || ['凡品']);
    const sl = (C.EQUIP.NAME_SLOT[slot] || ['装备']);
    return pick(pre) + pick(sl);
  }
  // ===== 全新随机词条系统（普通 / 稀有 / 极品道则 三档）=====
  function affixDef(id) { return C.EQUIP.AFFIX_BY_ID[id]; }
  // 仙金 → 套装归属（武器独立单件，不参与套装；仅历史兼容占位）
  const IMM_SET = { lh: null, hx: null, dj: null, hy: null };
  // 流派 → 套装归属（武器默认独立，玩家可在锻造台自选套装；套装栏位由 SLOT_SET_DEFAULT 决定）
  const WTYPE_SET = { zhong: null, qing: null, chang: null, dun: null, fa: null };

  // 按品质 + 武器倾向池构造候选词条 id（普通 / 稀有 / 终极 分层开放）
  function forgeAffixCandidates(qual, poolIds, wtype) {
    const lib = C.EQUIP.AFFIX_LIB;
    let ids = poolIds ? poolIds.slice() : lib.common.map(a => a.id);
    if (!poolIds && ['蓝', '紫', '橙', '红'].indexOf(qual) >= 0) ids = ids.concat(lib.rare.map(a => a.id));
    // 终极道则词条（受 wtype 限制；橙小概率 / 红必出）
    let ultIds = lib.ultimate.map(a => a.id).filter(id => {
      const a = affixDef(id); return !a.wtype || !wtype || a.wtype.indexOf(wtype) >= 0;
    });
    if (qual === '橙') { if (Math.random() < 0.18) ids = ids.concat(ultIds); }
    else if (qual === '红') { ids = ids.concat(ultIds); }
    return ids;
  }
  // 从候选 id 不重复抽取 count 条（返回完整词条定义）
  function rollAffixIds(candIds, count) {
    const pool = candIds.slice(), out = [];
    while (out.length < count && pool.length) {
      const i = Math.floor(Math.random() * pool.length);
      out.push(pool.splice(i, 1)[0]);
    }
    return out.map(affixDef);
  }
  // 锻造随机词条：数量按品质；红装保底 1 条极品道则
  function rollForgeAffixes(qual, poolIds, wtype) {
    const cfgCnt = C.EQUIP.QUAL_AFFIX_COUNT[qual];
    const count = (typeof cfgCnt === 'number') ? cfgCnt : 1;   // 0 为合法值（凡铁白/绿不出词条），不能用 || 兜底
    if (qual === '红') {
      let ultPool = (poolIds || []).filter(id => affixDef(id) && affixDef(id).tier === 'ultimate');
      if (!ultPool.length) {
        ultPool = C.EQUIP.AFFIX_LIB.ultimate.map(a => a.id).filter(id => {
          const a = affixDef(id); return !a.wtype || !wtype || a.wtype.indexOf(wtype) >= 0;
        });
      }
      const first = ultPool[Math.floor(Math.random() * ultPool.length)];
      const rest = rollAffixIds(
        (poolIds || forgeAffixCandidates('红', null, wtype)).filter(id => id !== first), count - 1);
      return [affixDef(first)].concat(rest);
    }
    return rollAffixIds(forgeAffixCandidates(qual, poolIds, wtype), count);
  }
  // 词条定义 → 存储对象（保留旧 cat/kind/val 形态以便战斗/展示兼容，并附加 id/tier/stat）
  // qual 决定数值区间：在 AFFIX_RANGE 对应 cat 的 [min,max] 内随机，无区间时回退到固定 val
  function affixToStored(a, qual) {
    const o = { id: a.id, name: a.name, tier: a.tier, desc: a.desc, stat: a.stat, key: a.key || null, val: 0, cat: null, kind: null };
    const R = C.EQUIP.AFFIX_RANGE || {};
    const qi = Math.min(4, Math.max(0, C.EQUIP.QUAL_ORDER.indexOf(qual) >= 0 ? C.EQUIP.QUAL_ORDER.indexOf(qual) : 0));
    const roll = (key) => { const seg = (R[key] && R[key][qi]) || null; return seg ? (seg[0] + Math.floor(Math.random() * (seg[1] - seg[0] + 1))) : null; };
    switch (a.stat) {
      case 'dimPct': o.cat = 'dim'; o.kind = a.key; o.val = roll('dim'); if (o.val == null) o.val = Math.round((a.val || 0) * 100); break;
      case 'atkPct': o.cat = 'atk'; o.val = roll('atk'); if (o.val == null) o.val = Math.round((a.val || 0) * 100); break;
      case 'redu': o.cat = 'redu'; o.val = roll('redu'); if (o.val == null) o.val = Math.round((a.val || 0) * 100); break;
      case 'reduMagic': o.cat = 'reduMagic'; o.val = roll('redu'); if (o.val == null) o.val = Math.round((a.val || 0) * 100); break;
      case 'critReduc': o.cat = 'critReduc'; o.val = roll('crit'); if (o.val == null) o.val = Math.round((a.val || 0) * 100); break;
      case 'critDmg': o.cat = 'critDmg'; o.val = roll('crit'); if (o.val == null) o.val = Math.round((a.val || 0) * 100); break;
      case 'hp': o.cat = 'hp'; o.val = roll('hp'); if (o.val == null) o.val = Math.round(a.val || 0); break;
      case 'lifesteal': o.cat = 'lifesteal'; o.val = Math.round((a.val || 0) * 100); if (a.killHeal) o.killHeal = Math.round((a.killHeal || 0) * 100); break;
      case 'dodge': o.cat = 'dodge'; o.val = Math.round((a.val || 0) * 100); if (a.dodgeFollowup) o.dodgeFollowup = Math.round((a.dodgeFollowup || 0) * 100); break;
      case 'ignoreDefHit': o.cat = 'ignoreDefHit'; o.val = Math.round((a.val || 0) * 100); break;
      case 'reflect': o.cat = 'reflect'; o.val = Math.round((a.val || 0) * 100); break;
      case 'defPct': o.cat = 'defPct'; o.val = Math.round((a.val || 0) * 100); if (a.enemyAtkDown) o.enemyAtkDown = Math.round((a.enemyAtkDown || 0) * 100); break;
      case 'enemyAtkDown': o.cat = 'enemyAtkDown'; o.val = Math.round((a.val || 0) * 100); break;
      case 'dodgeFollowup': o.cat = 'dodgeFollowup'; o.val = Math.round((a.val || 0) * 100); break;
      case 'atkStack': o.cat = 'atkStack'; o.val = Math.round((a.val || 0) * 100); if (a.max) o.max = a.max; break;
      case 'survive1': o.cat = 'survive1'; o.val = 0; break;
      case 'sp': o.cat = 'sp'; o.kind = a.key; o.val = 0; break;
      default: o.cat = 'hp'; o.val = 0;
    }
    return o;
  }
  // 兼容旧调用：以 QUAL_AFFIX_COUNT 决定条数，pool 倾向池可空
  function rollNAffixes(qualKey, mult, count, opts) {
    opts = opts || {};
    return rollForgeAffixes(qualKey, opts.pool || null, opts.wtype || null).map(a => affixToStored(a, qualKey));
  }
  function makeItem(slot, qualKey, opts) {
    opts = opts || {};
    const q = C.EQUIP.QUAL[qualKey];
    const wtype = (slot === 'weapon') ? (opts.wtype || ['zhong', 'qing', 'chang', 'dun', 'fa'][Math.floor(Math.random() * 5)]) : null;
    const it = {
      uid: (S._euid = (S._euid || 0) + 1),
      slot: slot, quality: qualKey, name: pickName(qualKey, slot),
      reqLevel: opts.req !== undefined ? opts.req : q.req,
      growth: !!opts.growth, growthLv: opts.growthLv || 0,
      zhengdao: !!opts.zhengdao, reshape: opts.reshape || 0,
      wtype: wtype,
      type: (slot === 'weapon') ? C.EQUIP.WTYPES[wtype].combat : null,
      affixes: [], inscriptions: opts.zhengdao ? [] : undefined,
      runeSlots: runeSlotsFor(qualKey), slots: [], born: Date.now()
    };
    if (q.mul) it.powMul = q.mul;
    it.affixPool = opts.affixPool || null;                       // 武器倾向词条池
    // 套装归属：仅灵金（蓝/紫/橙/红）防具默认归属套装；凡铁（白/绿）不带套装；武器独立
    const canSet = ['蓝', '紫', '橙', '红'].indexOf(qualKey) >= 0;
    it.set = opts.set || (slot === 'weapon' ? (WTYPE_SET[wtype] || null) : (canSet ? (C.EQUIP.SLOT_SET_DEFAULT[slot] || null) : null));
    it.affixes = (opts.affixPool ? rollForgeAffixes(qualKey, opts.affixPool, wtype) : rollForgeAffixes(qualKey, null, wtype)).map(a => affixToStored(a, qualKey));
    return it;
  }
  // 校验材料是否充足并扣除
  // 扣材料。refineGrade 非空（且非原矿）时，tier<5 的基础神材从精炼料库存扣除，其余（含仙金/耗材）仍从原始料扣。
  function spendMats(cost, refineGrade) {
    const m = cost || {};
    const useRefine = !!refineGrade && refineGrade !== '原矿';
    S.refine = S.refine || {};
    for (const k in m) {
      const src = (useRefine && (C.EQUIP.MATS[k] || {}).tier < 5) ? (S.refine[refineGrade] || {}) : S.mat;
      if ((src[k] || 0) < m[k]) return false;
    }
    for (const k in m) {
      if (useRefine && (C.EQUIP.MATS[k] || {}).tier < 5) {
        S.refine[refineGrade] = S.refine[refineGrade] || {};
        S.refine[refineGrade][k] = (S.refine[refineGrade][k] || 0) - m[k];
      } else {
        S.mat[k] = (S.mat[k] || 0) - m[k];
      }
    }
    return true;
  }
  function matText(cost) {
    return Object.keys(cost).map(k => (C.EQUIP.MATS[k] ? C.EQUIP.MATS[k].name : k) + '×' + cost[k]).join(' ');
  }

  function recipeFor(slot, qualKey) {
    const cat = C.EQUIP.SLOT_CAT[slot];
    const base = C.EQUIP.RECIPE[cat][qualKey];
    if (qualKey === '橙' && cat === 'metal') {
      const opt = ['lh', 'hx', 'dj'][Math.floor(Math.random() * 3)];
      const r = {}; r[opt] = 2; return r;
    }
    const c = {}; for (const k in base) c[k] = base[k]; return c;
  }
  // 在 [0, capIdx] 内按权重抽取产出品质；bias 额外加权最高档（精炼/辅助越好，越偏向高品）
  function rollQualByCap(capIdx, bias) {
    const Q = C.EQUIP.QUAL_ORDER, w = [];
    for (let i = 0; i <= capIdx; i++) {
      let base = 1 + i * 0.5;
      if (i === capIdx) base += (bias || 0);
      w[i] = base;
    }
    let sum = 0; for (const x of w) sum += x;
    let r = Math.random() * sum;
    for (let i = 0; i <= capIdx; i++) { r -= w[i]; if (r < 0) return Q[i]; }
    return Q[capIdx];
  }
  // 锻造：matQual=主材档位，grade=精炼等级，auxId/auxN=辅助材料；产出品质随机、受精炼与辅助影响
  function forgeEquip(slot, matQual, grade, auxId, auxN, opts) {
    opts = opts || {};
    if (!C.EQUIP.MAT_GRADE[grade]) return { ok: false, msg: '未知精炼等级' };
    if (slot === 'weapon' && S.zhengdao) return { ok: false, msg: '武器位已被证道武器占用' };
    const mq = C.EQUIP.QUAL[matQual];
    if (S.level < mq.req) return { ok: false, msg: '需 ' + mq.req + ' 级方可驾驭' + (C.EQUIP.FORGE_MAT_LABEL[matQual] || matQual) };
    auxN = Math.max(0, parseInt(auxN, 10) || 0);
    const g = C.EQUIP.MAT_GRADE[grade];
    const base = recipeFor(slot, matQual);
    const cost = {};
    for (const k in base) cost[k] = Math.max(1, Math.ceil(base[k] * g.countMul));
    // 辅助材料校验（按品质限定，普通装备严禁使用仙金）
    let aux = null;
    if (auxId && auxN > 0) {
      aux = C.EQUIP.FORGE_AUX[auxId];
      if (!aux) return { ok: false, msg: '未知辅助材料' };
      if ((C.EQUIP.MATS[auxId] || {}).tier >= 5) return { ok: false, msg: (C.EQUIP.MATS[auxId] || {}).name + ' 为仙金·帝材，普通装备禁用' };
      if (aux.q.indexOf(matQual) < 0) return { ok: false, msg: (C.EQUIP.MATS[auxId] || {}).name + ' 不可用于 ' + matQual + ' 装备' };
      cost[auxId] = (cost[auxId] || 0) + Math.min(auxN, 3);
    }
    if (!spendMats(cost, grade)) return { ok: false, msg: '材料不足（需 ' + matText(cost) + (grade !== '原矿' ? '；精炼料不足请先到精炼台精炼' : '') + '）' };
    const aN = aux ? Math.min(auxN, 3) : 0;
    const auxCap = aux ? aux.cap : 0;
    const auxSucc = aux ? aux.succ : 0;
    const capIdx = Math.min(C.EQUIP.QUAL_ORDER.length - 1,
      (C.EQUIP.FORGE_BASE_CAP[matQual] || 0) + g.cap + aN * auxCap);
    const succPct = Math.min(100, Math.max(40,
      (C.EQUIP.FORGE_BASE_SUCC[matQual] || 70) + g.succ + aN * auxSucc));
    const bias = g.succ + aN * auxSucc;
    if (Math.random() * 100 > succPct) {
      // 失败不返还任何材料（白装亦不返还）
      const item = makeItem(slot, '白', { wtype: opts.wtype || null, set: opts.set || null });
      S.equipBag.push(item); save();
      return { ok: true, item: item, qual: '白', matQual: matQual, grade: grade, fail: true, succPct: succPct };
    }
    const eff = rollQualByCap(capIdx, bias);
    const item = makeItem(slot, eff, { wtype: opts.wtype || null, set: opts.set || null });
    S.equipBag.push(item); save();
    return { ok: true, item: item, qual: eff, matQual: matQual, grade: grade, fail: false, succPct: succPct };
  }
  // §8 材料精炼台：将基础神材精炼为 粗炼/精炼/纯净，存入 S.refine[grade]。
  function refineMats(grade, matId, n) {
    const t = (C.EQUIP.REFINE.tiers || []).find(x => x.grade === grade);
    if (!t) return { ok: false, msg: '未知精炼等级' };
    if (C.EQUIP.REFINE.ores.indexOf(matId) < 0) return { ok: false, msg: (C.EQUIP.MATS[matId] || {}).name + ' 不可精炼（仅 tier1~2 基础神材）' };
    n = Math.max(1, parseInt(n, 10) || 1);
    S.refine = S.refine || {};
    const src = t.fromGrade === '原矿' ? S.mat : (S.refine[t.fromGrade] = S.refine[t.fromGrade] || {});
    const needOre = t.need * n;
    if ((src[matId] || 0) < needOre) return { ok: false, msg: (C.EQUIP.MATS[matId].name) + '（' + t.fromGrade + '）不足，需 ' + needOre };
    const needReagent = (t.rneed || 1) * n;
    if ((S.mat[t.reagent] || 0) < needReagent) return { ok: false, msg: '需 ' + t.reagentName + '×' + needReagent + '（持有 ' + (S.mat[t.reagent] || 0) + '）' };
    src[matId] -= needOre;
    S.mat[t.reagent] -= needReagent;
    S.refine[grade] = S.refine[grade] || {};
    S.refine[grade][matId] = (S.refine[grade][matId] || 0) + t.yield * n;
    save();
    return { ok: true, gained: { grade: grade, mat: matId, n: t.yield * n, name: C.EQUIP.MATS[matId].name } };
  }
  function recastEquip(uid) {
    const it = S.equipBag.find(x => x.uid === uid);
    if (!it) return { ok: false, msg: '装备不存在' };
    if (it.growth || it.zhengdao) return { ok: false, msg: '成长/证道装备不可重铸' };
    if (!spendMats(C.EQUIP.RECAST_COST)) return { ok: false, msg: '材料不足（需 ' + matText(C.EQUIP.RECAST_COST) + '）' };
    it.affixes = rollForgeAffixes(it.quality, it.affixPool, it.wtype).map(a => affixToStored(a, it.quality));
    it.name = it.bpName || pickName(it.quality, it.slot);
    save(); return { ok: true };
  }
  function dismantleEquip(uid) {
    const i = S.equipBag.findIndex(x => x.uid === uid);
    if (i < 0) return { ok: false, msg: '装备不存在' };
    const it = S.equipBag[i];
    if (it.zhengdao) return { ok: false, msg: '证道武器不可分解' };
    if (it.growth) return { ok: false, msg: '成长装备不可分解' };
    const cat = C.EQUIP.SLOT_CAT[it.slot];
    const back = C.EQUIP.DISMANTLE[it.quality] || (cat === 'jade' ? { py: 1 } : (cat === 'leather' ? { lm: 1 } : { ht: 1 }));
    for (const k in back) S.mat[k] = (S.mat[k] || 0) + back[k];
    C.EQUIP.SLOTS.forEach(s => { if (S.equipSlots[s.key] === uid) S.equipSlots[s.key] = null; });
    S.equipBag.splice(i, 1); save();
    return { ok: true, gained: back };
  }
  function makeGrowth(slot, auxId) {
    if (slot === 'weapon') return { ok: false, msg: '烬赤源核不能锻造为武器（证道武器另走帝器之路）' };
    if ((S.jinchi || 0) < C.EQUIP.GROWTH.jinchiCost) return { ok: false, msg: '烬赤源核不足' };
    const need = C.EQUIP.GROWTH.bySlot[slot];
    if (!need) return { ok: false, msg: '该部位暂不支持烬赤锻造' };
    const immKey = Object.keys(need)[0], immN = need[immKey];
    if ((S.mat[immKey] || 0) < immN) return { ok: false, msg: (C.EQUIP.MATS[immKey] || {}).name + '（×' + immN + '）不足，无法铸就帝兵' };
    let aux = (auxId && C.EQUIP.FORGE_AUX[auxId]) || null;
    if (auxId && (!aux || aux.q.indexOf('红') < 0)) return { ok: false, msg: (C.EQUIP.MATS[auxId] || {}).name + ' 不可用于红色帝兵' };
    const succPct = Math.min(20, 1 + (aux ? aux.succ : 0));
    const failed = Math.random() * 100 > succPct;
    if (failed) {
      // 失败：仅留烬赤源核，仙金道则暴走全部湮灭
      S.jinchi -= C.EQUIP.GROWTH.jinchiCost;
      S.mat[immKey] -= immN;
      if (aux) S.mat[auxId] = (S.mat[auxId] || 0) - 1;
      save();
      return { ok: true, fail: true, destroyed: immN, immName: (C.EQUIP.MATS[immKey] || {}).name };
    }
    S.jinchi -= C.EQUIP.GROWTH.jinchiCost;
    S.mat[immKey] -= immN;
    if (aux) S.mat[auxId] = (S.mat[auxId] || 0) - 1;
    const item = makeItem(slot, '红', { growth: true, growthLv: 1, req: 0 });
    item.red = true; item.immKey = immKey; item.set = IMM_SET[immKey] || null;
    item.name = '帝兵·' + item.name;
    S.equipBag.push(item); save();
    return { ok: true, item: item, fail: false };
  }
  // 红色仙金帝器铸造：烬赤源核×1 + 对应仙金×2，基础 1%（受辅材提升）；失败仙金湮灭，仅留烬赤源核
  function forgeRedImperial(riId, auxId) {
    const ri = C.RED_IMPERIAL[riId];
    if (!ri) return { ok: false, msg: '无此帝器图纸' };
    const sv = S;
    for (const k in ri.mats) { if (k === 'JINCHI') continue; if ((sv.mat[k] || 0) < ri.mats[k]) return { ok: false, msg: (C.EQUIP.MATS[k] || {}).name + '（×' + ri.mats[k] + '）不足' }; }
    let prob = 0.01;
    const aux = (auxId && C.EQUIP.FORGE_AUX[auxId]) || null;
    if (auxId) {
      if (!aux || aux.q.indexOf('红') < 0) return { ok: false, msg: (C.EQUIP.MATS[auxId] || {}).name + ' 不可用于红色帝器' };
      if ((sv.mat[auxId] || 0) < 1) return { ok: false, msg: (C.EQUIP.MATS[auxId] || {}).name + ' 不足' };
      sv.mat[auxId]--; prob = Math.min(0.5, prob + aux.succ / 100);
    }
    for (const k in ri.mats) { if (k !== 'JINCHI') sv.mat[k] -= ri.mats[k]; }   // 仙金必耗（失败亦湮灭）
    if (Math.random() * 100 < prob * 100) {
      sv.jinchi -= ri.mats.JINCHI || 0;
      const item = makeItem('weapon', '红', { wtype: ri.wtype, affixPool: ri.pool, set: ri.set, req: 0 });
      item.red = true; item.immKey = ri.immKey; item.icon = ri.icon; item.shape = ri.shape;
      item.name = '帝兵·' + ri.name;
      sv.equipBag.push(item); save();
      return { ok: true, item: item, msg: '帝器铸成！' };
    }
    save();
    return { ok: true, fail: true, msg: '帝器锻造失败，仙金湮灭，仅余烬赤源核' };
  }
  function feedGrowth(uid) {
    const it = S.equipBag.find(x => x.uid === uid);
    if (!it || !it.growth) return { ok: false, msg: '非成长装备' };
    if (it.growthLv >= C.EQUIP.GROWTH.maxLv) return { ok: false, msg: '已达成长上限' };
    const need = C.EQUIP.GROWTH.feed[it.growthLv];
    if (!need) return { ok: false, msg: '无喂养方案' };
    const tk = Object.keys(need)[0];
    if (C.EQUIP.MATS[tk] && C.EQUIP.MATS[tk].tier >= 3) {
      const okt = (S.layers || []).some(L => L.layer >= 6 && L.status !== 'locked');
      if (!okt) return { ok: false, msg: '高阶喂养材料需全服推进至第 6 层解锁' };
    }
    if ((S.mat[tk] || 0) < need[tk]) return { ok: false, msg: '材料不足（需 ' + matText(need) + '）' };
    S.mat[tk] -= need[tk];
    it.growthLv += 1;
    it.affixes = rollForgeAffixes('红', null, it.wtype).map(a => affixToStored(a, '红'));
    save(); return { ok: true, lv: it.growthLv };
  }
  function openZhengdao() {
    if (S.zhengdao) return { ok: false, msg: '已开启证道武器' };
    if (S.level < C.EQUIP.ZHENGDAO.openLv) return { ok: false, msg: '需 ' + C.EQUIP.ZHENGDAO.openLv + ' 级解锁【铸器始基】（当前 ' + S.level + ' 级）' };
    if (!spendMats(C.EQUIP.ZHENGDAO.openCost)) return { ok: false, msg: '材料不足（需 ' + matText(C.EQUIP.ZHENGDAO.openCost) + '）' };
    const item = makeItem('weapon', '蓝', { zhengdao: true, req: 0, affixCount: 2 });
    S.zhengdao = item; S.equipSlots.weapon = 'zd'; save();
    return { ok: true, item: item };
  }
  function reshapeZhengdao() {
    if (!S.zhengdao) return { ok: false, msg: '尚未开启证道武器' };
    if (!spendMats(C.EQUIP.ZHENGDAO.reshapeCost)) return { ok: false, msg: '材料不足（需 ' + matText(C.EQUIP.ZHENGDAO.reshapeCost) + '）' };
    S.zhengdao.reshape = (S.zhengdao.reshape || 0) + 1;
    S.zhengdao.affixes = rollForgeAffixes(S.zhengdao.quality, null, S.zhengdao.wtype).map(a => affixToStored(a, S.zhengdao.quality));
    if (S.level >= C.EQUIP.ZHENGDAO.emperorLv) {
      S.zhengdao.wtype = ['zhong', 'qing', 'chang', 'dun', 'fa'][Math.floor(Math.random() * 5)];
      S.zhengdao.type = C.EQUIP.WTYPES[S.zhengdao.wtype].combat;
      S.zhengdao.affixes.push(affixToStored(C.EQUIP.AFFIX_BY_ID['tunyuan'], S.zhengdao.quality));  // 帝道本源：额外吞元单件特效
    }
    save(); return { ok: true, item: S.zhengdao };
  }
  function equipItem(uid) {
    const it = S.equipBag.find(x => x.uid === uid);
    if (!it) return { ok: false, msg: '装备不存在' };
    if (it.slot === 'weapon' && S.zhengdao) return { ok: false, msg: '武器位已被证道武器占用' };
    if (it.reqLevel && S.level < it.reqLevel) return { ok: false, msg: '等级不足（需 ' + it.reqLevel + ' 级）' };
    S.equipSlots[it.slot] = uid; save();
    return { ok: true };
  }
  function unequipSlot(slot) {
    if (slot === 'weapon' && S.zhengdao) return { ok: false, msg: '证道武器无法卸下' };
    S.equipSlots[slot] = null; save();
    return { ok: true };
  }
  function embedRuneEquip(uid, runeUid) {
    const it = S.equipBag.find(x => x.uid === uid) || (S.zhengdao && S.zhengdao.uid === uid ? S.zhengdao : null);
    if (!it) return { ok: false, msg: '装备不存在' };
    if ((it.slots || []).length >= (it.runeSlots || 0)) return { ok: false, msg: '符文槽已满（' + (it.runeSlots || 0) + '）' };
    const i = S.runeBag.findIndex(r => r.uid === runeUid);
    if (i < 0) return { ok: false, msg: '符文不在背包' };
    it.slots = it.slots || [];
    it.slots.push(S.runeBag.splice(i, 1)[0]); save();
    return { ok: true };
  }
  function unembedRuneEquip(uid, runeUid) {
    const it = S.equipBag.find(x => x.uid === uid) || (S.zhengdao && S.zhengdao.uid === uid ? S.zhengdao : null);
    if (!it) return { ok: false, msg: '装备不存在' };
    const i = (it.slots || []).findIndex(r => r.uid === runeUid);
    if (i < 0) return { ok: false, msg: '该装备无此符文' };
    S.runeBag.push(it.slots.splice(i, 1)[0]); save();
    return { ok: true };
  }
  function collectEquipped(Sv, bag) {
    const items = [];
    const slots = Sv.equipSlots || {};
    C.EQUIP.SLOTS.forEach(s => {
      if (s.key === 'weapon') {
        if (Sv.zhengdao) items.push(Sv.zhengdao);
        else { const u = slots.weapon; if (u != null && u !== 'zd') { const w = bag.find(x => x.uid === u); if (w) items.push(w); } }
      } else {
        const u = slots[s.key];
        if (u != null) { const w = bag.find(x => x.uid === u); if (w) items.push(w); }
      }
    });
    return items;
  }
  function equipDimBonus(save) {
    const Sv = save || S;
    const d = { str: 0, spd: 0, agi: 0, def: 0, luc: 0 };
    collectEquipped(Sv, Sv.equipBag || []).forEach(it => {
      (it.affixes || []).forEach(a => { if (a.cat === 'dim' && a.kind) d[a.kind] += a.val; });
      if (it.inscriptions) (it.inscriptions || []).forEach(a => { if (a.cat === 'dim' && a.kind) d[a.kind] += a.val; });
    });
    return d;
  }
  function equipPower(save) {
    const Sv = save || S;
    let p = 0;
    collectEquipped(Sv, Sv.equipBag || []).forEach(it => {
      const affs = (it.affixes || []).concat(it.inscriptions || []);
      affs.forEach(a => {
        if (a.cat === 'dim') p += a.val * 2;
        else if (a.cat === 'atk') p += a.val * 1.5;
        else if (a.cat === 'crit') p += a.val * 2;
        else if (a.cat === 'dodge') p += a.val * 1.5;
        else if (a.cat === 'hp') p += a.val * 0.1;
        else if (a.cat === 'redu') p += a.val * 2;
      });
    });
    return Math.round(p);
  }
  // 单件装备（神兵）战力：与 equipPower 完全一致的加权算法，作用于一件装备实例。
  // 用于“神兵战力排名”对背包/穿戴全部装备逐件打分。
  function equipItemPower(it, save) {
    const Sv = save || S;
    let p = 0;
    const affs = (it.affixes || []).concat(it.inscriptions || []);
    affs.forEach(a => {
      if (a.cat === 'dim') p += a.val * 2;
      else if (a.cat === 'atk') p += a.val * 1.5;
      else if (a.cat === 'crit') p += a.val * 2;
      else if (a.cat === 'dodge') p += a.val * 1.5;
      else if (a.cat === 'hp') p += a.val * 0.1;
      else if (a.cat === 'redu') p += a.val * 2;
    });
    return Math.round(p);
  }
  // 把穿戴装备的属性写入战斗快照（覆盖旧预设武器、叠加词条/符文）
  function applyEquipToPlayer(player, save) {
    const Sv = save || S;
    const bag = Sv.equipBag || [];
    const items = collectEquipped(Sv, bag);
    if (!items.length) return;
    const wItem = Sv.zhengdao || ((Sv.equipSlots.weapon != null && Sv.equipSlots.weapon !== 'zd') ? bag.find(x => x.uid === Sv.equipSlots.weapon) : null);
    if (wItem && wItem.type) {
      player.weapon = { type: wItem.type, atkMul: 1, name: wItem.name, star: 0, plus: 0, critMul: 0, runeAtkMul: 0 };
    }
    const resonance = (Sv.zhengdao && Sv.level >= C.EQUIP.ZHENGDAO.resonanceLv) ? 1.25 : 1;
    let atkPct = 0, critFrac = 0, dodgeFrac = 0, hp = 0, reduFrac = 0, runeAtk = 0, runeCrit = 0, runeDef = 0, runeHp = 0;
    player._affixCounts = {};
    player.affixFlags = player.affixFlags || {};
    function addAffix(a, mult) {
      if (a.id) {                                   // 同词条（同 id）最多叠加 AFFIX_CAP 条
        player._affixCounts[a.id] = (player._affixCounts[a.id] || 0) + 1;
        if (player._affixCounts[a.id] > C.EQUIP.AFFIX_CAP) return;
      }
      if (a.cat === 'atk') atkPct += a.val * mult;
      else if (a.cat === 'crit') critFrac += (a.val * mult) / 100;
      else if (a.cat === 'dodge') { dodgeFrac += (a.val * mult) / 100; if (a.dodgeFollowup) player.dodgeFollowup = (player.dodgeFollowup || 0) + (a.dodgeFollowup * mult) / 100; }
      else if (a.cat === 'hp') hp += a.val * mult;
      else if (a.cat === 'redu') reduFrac += (a.val * mult) / 100;
      else if (a.cat === 'reduMagic') player.reductionMagic = (player.reductionMagic || 0) + (a.val * mult) / 100;
      else if (a.cat === 'critReduc') player.critReduc = (player.critReduc || 0) + (a.val * mult) / 100;
      else if (a.cat === 'critDmg') player.critDmgAdd = (player.critDmgAdd || 0) + (a.val * mult) / 100;
      else if (a.cat === 'lifesteal') { player.lifesteal = (player.lifesteal || 0) + (a.val * mult) / 100; if (a.killHeal) player.killHeal = (player.killHeal || 0) + (a.killHeal * mult) / 100; }
      else if (a.cat === 'ignoreDefHit') player.ignoreDefHit = (player.ignoreDefHit || 0) + (a.val * mult) / 100;
      else if (a.cat === 'reflect') player.reflect = (player.reflect || 0) + (a.val * mult) / 100;
      else if (a.cat === 'defPct') { player.affixDefPct = (player.affixDefPct || 0) + (a.val * mult) / 100; if (a.enemyAtkDown) player.enemyAtkDown = (player.enemyAtkDown || 0) + (a.enemyAtkDown * mult) / 100; }
      else if (a.cat === 'enemyAtkDown') player.enemyAtkDown = (player.enemyAtkDown || 0) + (a.val * mult) / 100;
      else if (a.cat === 'dodgeFollowup') player.dodgeFollowup = (player.dodgeFollowup || 0) + (a.val * mult) / 100;
      else if (a.cat === 'atkStack') { player.atkStackEnabled = true; player.atkStackMax = Math.max(player.atkStackMax || 0, a.max || 3); }
      else if (a.cat === 'survive1') player.survive1 = true;
      else if (a.cat === 'sp') player.affixFlags[a.kind] = true;
      else if (a.cat === 'ult') { atkPct += 15; critFrac += 0.08; dodgeFrac += 0.08; reduFrac += 0.05; }
    }
    items.forEach(it => {
      const mult = it.zhengdao ? resonance : 1;
      (it.affixes || []).forEach(a => addAffix(a, mult));
      if (it.zhengdao && it.inscriptions) (it.inscriptions || []).forEach(a => addAffix(a, mult));
      (it.slots || []).forEach(r => {
        if (r.stat === 'atk') runeAtk += r.val;
        else if (r.stat === 'crit') runeCrit += r.val;
        else if (r.stat === 'def') runeDef += r.val;
        else if (r.stat === 'hp') runeHp += r.val;
      });
    });
    if (player.weapon) player.weapon.atkMul += (atkPct / 100) + runeAtk;
    player.maxHp = (player.maxHp || 0) + hp + runeHp;
    player.defStat = (player.defStat || 0) + runeDef;
    player.critMul = (player.critMul || 0) + critFrac + runeCrit;
    player.dodgeMul = (player.dodgeMul || 0) + dodgeFrac;
    player.reduction = (player.reduction || 0) + reduFrac;
    if (Sv.zhengdao) {
      const st = zdStage();
      player.zdGuard = (st.stage >= 4);    // 元神共鸣（90级）已具护主神智
      player.zdEmperor = (st.stage >= 5);  // 完整神智（120级）帝道本源
      // 证道武器·独立单件特效（不绑定套装、不放大任何套装效果，仅武器自身触发）
      if (st.stage >= 2) { player.zdIgnoreDefChance = 0.10; player.zdIgnoreDefPct = 0.10; }                                     // 【道痕】命中 10% 概率无视 10% 防御
      if (st.stage >= 3) { player.zdIgnoreDefChance = 0.15; player.zdIgnoreDefPct = 0.10; player.ignoreDefHit = (player.ignoreDefHit || 0) + 0.05; } // 【道印】15%无视；命中降敌 5% 防御
      if (st.stage >= 4) { player.zdIgnoreDefChance = 0.20; player.zdIgnoreDefPct = 0.20; player.zdDispelChance = 0.30; }       // 【道威】20%无视；有概率驱散敌方 1 层套装增益
      if (st.stage >= 5) { player.zdIgnoreDefChance = 0.25; player.zdIgnoreDefPct = 0.20; player.zdDispelChance = 0.30; }       // 【帝道本源】仅武器自身触发，不放大套装
    }
    applyAffixSets(player, Sv);    // 套装 3/5 激活，同一时间仅激活 1 套（互斥）
    player._affixCounts = undefined;
  }
  // 计算已穿戴装备激活的套装（按 set 聚合件数；3/5 两档；不再有 7 件超模档）
  function computeSetTiers(save) {
    const items = collectEquipped(save, save.equipBag || []);
    const cnt = {}, red = {};
    items.forEach(it => {
      // 凡铁（白/绿）不带套装；兼容旧存档残留的 set 字段，一律不计入
      if (!it.set || it.quality === '白' || it.quality === '绿') return;
      cnt[it.set] = (cnt[it.set] || 0) + 1; if (it.red) red[it.set] = (red[it.set] || 0) + 1;
    });
    const out = [];
    CFG.EQUIP.SET_LIST.forEach(id => {
      const c = cnt[id] || 0; if (c < 3) return;                 // 3 件起激活一阶
      const S = CFG.EQUIP.SETS[id];
      const tier = c >= 5 ? 't5' : 't3';                          // 5 件解锁二阶
      const t = S[tier];
      out.push({ id: id, name: S.name, dao: S.dao, color: S.color, slots: S.slots, count: c, hasRed: !!red[id], tier: tier, desc: t.desc, bonus: t.bonus || null });
    });
    return out;
  }
  // 套装增益同一时间仅激活 1 套：取已穿戴件数最多者；并列按 SET_LIST 优先级靠前者胜出
  function applyAffixSets(player, save) {
    const sets = computeSetTiers(save);
    player.sets = sets;                                           // 所有达到 3 件的套装（展示用）
    if (!sets.length) { player.activeSet = null; player.setBonus = null; return; }
    let best = sets[0];
    for (let i = 1; i < sets.length; i++) if (sets[i].count > best.count) best = sets[i];
    player.activeSet = best;
    applySetBonus(player, best.bonus || {});
  }
  function applySetBonus(p, b) {
    p.setBonus = Object.assign({}, b);
    if (b.lifesteal) p.lifesteal = (p.lifesteal || 0) + b.lifesteal;
    if (b.dodge) p.dodgeBonus = (p.dodgeBonus || 0) + b.dodge;
    if (b.defPct) p.setDefPct = (p.setDefPct || 0) + b.defPct;
    if (b.reduAll) p.reduAll = (p.reduAll || 0) + b.reduAll;
    if (b.reflect) p.reflect = (p.reflect || 0) + b.reflect;
    if (b.atkPct && p.weapon) p.weapon.atkMul += b.atkPct;
    if (b.shieldStart) p.shieldStart = b.shieldStart;
    if (b.surviveThreshold) p.surviveThreshold = b.surviveThreshold;
    if (b.debuffHalf) p.debuffHalf = b.debuffHalf;
    if (b.daozheDmg) p.daozheDmg = b.daozheDmg;
    if (b.killAtkUp) p.killAtkUp = b.killAtkUp;
    if (b.dodgeFollowup) p.dodgeFollowup = (p.dodgeFollowup || 0) + b.dodgeFollowup;
    if (b.fenjiProc) p.fenjiProc = b.fenjiProc;
    if (b.fenjiMul) p.fenjiMul = b.fenjiMul;
  }
  /* ============ 功法（仅可修炼 1 套，其余仅保留等级） ============
   * 解锁前提：① 参悟对应《功法书》；② 加入帮派，自动习得该帮派【镇派功法】。
   * 旧的「妖塔层数」解锁已废弃，这里只做兜底同步（不主动解锁）。 */
  // 帮派镇派功法对应的功法 id
  function sectGongfaId(sect) {
    const e = (C.EQUIP && C.EQUIP.SECT_ELEMENTS && sect) ? C.EQUIP.SECT_ELEMENTS[sect.element] : null;
    return e ? e.gongfa : null;
  }
  function gongfaAutoUnlock() {
    if (!S.gongfa) S.gongfa = { unlocked: {}, active: null };
    if (!S.gongfa.unlocked) S.gongfa.unlocked = {};
    // 1) 已参悟的功法书
    (S.gongfaBooks || []).forEach(b => { if (b.learned) S.gongfa.unlocked[b.gfId] = S.gongfa.unlocked[b.gfId] || 1; });
    // 2) 当前帮派的镇派功法（在帮派即视为已学习）
    const gid = sectGongfaId(S.sect);
    if (gid) S.gongfa.unlocked[gid] = S.gongfa.unlocked[gid] || 1;
    // 兜底：老存档里已解锁的条目保留
    if (!S.gongfa.active) {
      const first = C.GONGFA_LIST.find(id => S.gongfa.unlocked[id]);
      if (first) S.gongfa.active = first;
    }
  }
  // 参悟一本功法书 → 习得对应功法
  function learnGongfaBook(uid) {
    const b = (S.gongfaBooks || []).find(x => x.uid === uid);
    if (!b) return { ok: false, msg: '功法书不存在' };
    if (b.learned) return { ok: true, msg: '该功法书已参悟' };
    const g = C.gongfaDef(b.gfId); if (!g) return { ok: false, msg: '未知功法' };
    b.learned = true;
    S.gongfa.unlocked[b.gfId] = S.gongfa.unlocked[b.gfId] || 1;
    if (!S.gongfa.active) S.gongfa.active = b.gfId;
    save();
    return { ok: true, msg: '参悟功法书，习得《' + g.name + '》' };
  }
  function upgradeGongfa(id) {
    const g = C.gongfaDef(id);
    if (!g) return { ok: false, msg: '功法不存在' };
    if (!S.gongfa.unlocked[id]) return { ok: false, msg: '尚未解锁' };
    const lv = S.gongfa.unlocked[id];
    if (lv >= g.maxLevel) return { ok: false, msg: '已达满级' };
    const cost = C.gongfaUpCost(lv);
    if (S.daoYun < cost) return { ok: false, msg: '功法点不足（需' + cost + '）' };
    S.daoYun -= cost; S.gongfa.unlocked[id] = lv + 1; save();
    return { ok: true, msg: g.name + ' 升至 ' + (lv + 1) + ' 级（消耗功法点' + cost + '）' };
  }
  function setActiveGongfa(id) {
    if (!S.gongfa.unlocked[id]) return { ok: false, msg: '尚未解锁，无法修炼' };
    if (S.gongfa.active === id) return { ok: true, msg: '已是当前修炼功法' };
    S.gongfa.active = id; save();
    return { ok: true, msg: '开始修炼：' + C.gongfaDef(id).name };
  }
  // 将当前生效功法写入战斗快照（dimPct 并入 dims，其余数值存入 player.gongfa）
  function applyGongfaToPlayer(player, save, opts) {
    opts = opts || {};
    const Sv = save || S;
    const g = Sv && Sv.gongfa;
    player.gongfa = null;
    if (!g || !g.active) return;
    const def = C.gongfaDef(g.active);
    if (!def) return;
    const lv = Math.max(1, Math.min(def.maxLevel, (g.unlocked && g.unlocked[g.active]) || 1));
    const lvlFrac = 0.4 + 0.6 * (lv - 1) / (def.maxLevel - 1);
    const half = (opts.isSpar && def.effects.pvpHalf) ? 0.5 : 1;
    const frac = lvlFrac * half;
    const e = def.effects;
    const G = { id: def.id, name: def.name, school: def.school, level: lv, max: lv >= def.maxLevel, flags: {} };
    if (e.dimPct) for (const k in e.dimPct) if (player.dims[k] != null) player.dims[k] *= (1 + e.dimPct[k] * frac);
    if (e.reduction) player.reduction = (player.reduction || 0) + e.reduction * frac;
    if (e.reductionMagic) player.reductionMagic = (player.reductionMagic || 0) + e.reductionMagic * frac;
    if (e.critReduc) player.critReduc = (player.critReduc || 0) + e.critReduc * frac;
    if (e.critDmgAdd) player.critDmgAdd = (player.critDmgAdd || 0) + e.critDmgAdd * frac;
    if (e.dodgeTurn1) player.dodgeTurn1 = (player.dodgeTurn1 || 0) + e.dodgeTurn1 * frac;
    if (e.breakArmor) player.ignoreDef = (player.ignoreDef || 0) + e.breakArmor * frac;
    const NUMKEYS = ['reflect','lifesteal','skillDmg','skillChance','qiRegen','dotDmg','allDmg','allRedu',
      'regen','shieldMul','shieldExtraRedu','healShieldMul','firstStrikeIgnoreDef','firstHitDmg',
      'towerBonus','enemyLowHp25Crit','basicHitHeal','killHeal8','critExtraShadow','dodgeChance',
      'dodgeThenNextAtk','killStackStr','lowHpStr','strUpOnHit','perHigherDim','perDebuffRedu',
      'openSuppress','critCutEnemyQi','openSkillChance','skillChanceStack','bleedOnHit','burnOnHit',
      'bleedBonus','hitReduceEnemyAllDmg','bleedTurnsBonus','extendEnemyCd','highHp70ImmuneBleed',
      'enemyDebuffChanceReduce','debuffDurReduce','startShield','skillGivesShield'];
    NUMKEYS.forEach(k => {
      if (e[k] === undefined || e[k] === null) return;
      G[k] = (typeof e[k] === 'number') ? e[k] * frac : e[k];
    });
    if (lv >= def.maxLevel && def.maxEffect) {
      G.flags[def.maxEffect.flag] = true;
      G.maxEffectDesc = def.maxEffect.desc;
      if (def.maxEffect.bonus) Object.keys(def.maxEffect.bonus).forEach(k => { G[k] = def.maxEffect.bonus[k]; });
    }
    player.gongfa = G;
  }

  function resolveCombatWeapon(save) {
    const Sv = save || S;
    if (Sv.zhengdao) return { type: Sv.zhengdao.type, name: Sv.zhengdao.name };
    const u = Sv.equipSlots && Sv.equipSlots.weapon;
    if (u != null && u !== 'zd') { const w = (Sv.equipBag || []).find(x => x.uid === u); if (w) return { type: w.type, name: w.name }; }
    return null;
  }

  function zdStage() {
    if (!S.zhengdao) return null;
    const L = S.level, Z = C.EQUIP.ZHENGDAO;
    return {
      bound: L >= Z.boundLv, resonance: L >= Z.resonanceLv, spirit: L >= Z.spiritLv, emperor: L >= Z.emperorLv,
      stage: L >= Z.emperorLv ? 5 : L >= Z.spiritLv ? 4 : L >= Z.resonanceLv ? 3 : L >= Z.boundLv ? 2 : 1,
      name: L >= Z.emperorLv ? '帝器生灵' : L >= Z.spiritLv ? '器生微灵' : L >= Z.resonanceLv ? '器神交感' : L >= Z.boundLv ? '道器烙印' : '铸器始基'
    };
  }
  function engraveZhengdao() {
    if (!S.zhengdao) return { ok: false, msg: '尚未开启证道武器' };
    if (S.level < C.EQUIP.ZHENGDAO.boundLv) return { ok: false, msg: '需 ' + C.EQUIP.ZHENGDAO.boundLv + ' 级认主后方可铭文铭刻' };
    if (!spendMats(C.EQUIP.ZHENGDAO.engraveCost)) return { ok: false, msg: '材料不足（需 ' + matText(C.EQUIP.ZHENGDAO.engraveCost) + '）' };
    const pool = C.EQUIP.AFFIX_INSCRIPTION.slice(), picks = [];
    for (let n = 0; n < 2 && pool.length; n++) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    S.zhengdao.inscriptions = picks.map(meta => {
      const range = C.EQUIP.AFFIX_RANGE[meta.cat][2];
      let val = Math.round(range[0] + Math.random() * (range[1] - range[0]));
      if (meta.cat === 'dim') val = Math.max(1, val);
      return { cat: meta.cat, kind: meta.key || null, name: meta.name, val: val };
    });
    save();
    return { ok: true, item: S.zhengdao };
  }

  /* ============ 帮派系统（五行） ============ */
  // 计算帮派当前生效加成（随等级成长：factor = 1 + (lv-1)*0.1）
  function sectBonus() {
    const s = S.sect; if (!s) return {};
    const el = C.EQUIP.SECT_ELEMENTS[s.element]; if (!el) return {};
    const f = 1 + (s.level - 1) * 0.1, out = {}, b = el.bonus || {};
    if (b.atkPct) out.atkPct = b.atkPct * f;     // 攻击%
    if (b.spdPct) out.spdPct = b.spdPct * f;     // 速度%
    if (b.healPct) out.healPct = b.healPct * f;  // 治疗%
    if (b.mineMul) out.mineMul = b.mineMul * f;  // 挖矿额外掉落倍率
    if (b.pillMul) out.pillMul = b.pillMul * f;  // 炼丹产出行数倍率
    return out;
  }
  /* ---- 帮派扩展：名册/公告/捐献/成长/Boss/申请 §9.3 ---- */
  function weekStr() {
    const d = new Date(), start = new Date(d.getFullYear(), 0, 1);
    const wk = Math.floor(((d - start) / 86400000 + start.getDay()) / 7);
    return d.getFullYear() + 'w' + wk;
  }
  function rint(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  const NPC_X = ['云', '墨', '苏', '洛', '白', '林', '秦', '顾', '沈', '陆', '萧', '叶', '谢', '裴', '江', '燕'],
        NPC_M = ['无涯', '青玄', '凌霜', '子期', '望舒', '清越', '惊鸿', '寒山', '拂雪', '疏影', '长歌', '听澜', '既明', '南烛', '星眠', '照野'],
        NPC_AV = ['🦊', '🐺', '🐉', '🦅', '🐯', '🦌', '🐨', '🐼', '🦉', '🐳', '🦁', '🐸'];
  function npcName(used) {
    let n, guard = 0;
    do { n = NPC_X[rint(0, NPC_X.length - 1)] + NPC_M[rint(0, NPC_M.length - 1)]; guard++; }
    while (used[n] && guard < 50);
    used[n] = 1;
    return n;
  }
  function dateStr() {
    const d = new Date(Date.now() - rint(0, 6) * 86400000);
    return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
  }
  // 初始化/迁移帮派扩展字段（老存档缺 members 等字段时补齐）
  function sectEnsure() {
    const s = S.sect; if (!s) return;
    if (s.members && s.members.length) {
      if (!s.boss) s.boss = { day: '', hp: 0, max: 0 };
      if (!s.applicants) s.applicants = [];
      return;
    }
    const def = (C.SECT_LIST || []).find(x => x.name === s.name);
    s.mine = !!s.mine || !def;   // 名录内且未标记自建 → 视为加入大派
    s.exp = s.exp || 0;
    s.myContrib = s.myContrib || 0;
    s.myContribHist = s.myContribHist || 0;
    s.myWeek = s.myWeek || { wk: weekStr(), n: 0 };
    s.announce = s.announce || (def
      ? ('欢迎四方同道入' + s.name + '，共参' + ((C.EQUIP.SECT_ELEMENTS[s.element] || {}).talent || '五行功法') + '！')
      : '新派初立，广纳同道，共建五行道基！');
    const cap = C.sectMemberCap(s.level);
    s.memberCount = s.memberCount || (s.mine ? rint(6, 12) : Math.min(cap, rint(Math.floor(cap * 0.55), cap)));
    const used = {}, members = [];
    if (s.mine) {
      members.push({ name: npcName(used), role: '副帮主', lv: rint(40, 80), av: NPC_AV[rint(0, NPC_AV.length - 1)], week: rint(300, 1200), date: dateStr() });
    } else {
      members.push({ name: def.leader, role: '盟主', lv: 99, av: '👑', week: rint(800, 2000), date: dateStr() });
    }
    for (let i = 0; i < 2; i++) members.push({ name: npcName(used), role: '长老', lv: rint(30, 70), av: NPC_AV[rint(0, NPC_AV.length - 1)], week: rint(200, 900), date: dateStr() });
    for (let i = 0; i < 3; i++) members.push({ name: npcName(used), role: '精英', lv: rint(15, 50), av: NPC_AV[rint(0, NPC_AV.length - 1)], week: rint(80, 600), date: dateStr() });
    for (let i = 0; i < 4; i++) members.push({ name: npcName(used), role: '弟子', lv: rint(1, 30), av: NPC_AV[rint(0, NPC_AV.length - 1)], week: rint(10, 300), date: dateStr() });
    s.members = members;
    s.applicants = s.mine ? Array.from({ length: rint(1, 3) }, () =>
      ({ name: npcName(used), lv: rint(8, 40), av: NPC_AV[rint(0, NPC_AV.length - 1)] })) : [];
    s.boss = { day: '', hp: 0, max: 0 };
    save();
  }
  // 我的本周贡献（跨周自动清零）
  function sectMyWeekN() {
    const s = S.sect; if (!s) return 0;
    if (!s.myWeek || s.myWeek.wk !== weekStr()) s.myWeek = { wk: weekStr(), n: 0 };
    return s.myWeek.n;
  }
  function bumpMyWeek(s, n) {
    if (!s.myWeek || s.myWeek.wk !== weekStr()) s.myWeek = { wk: weekStr(), n: 0 };
    s.myWeek.n += n;
  }
  // 快速捐献：n 办公币 → n/10 贡献（帮派累计 + 个人可用/历史/本周）
  function sectDonate(stoneAmt) {
    const s = S.sect; if (!s) return { ok: false, msg: '尚未加入帮派' };
    const n = Math.floor(Number(stoneAmt) || 0), unit = C.SECT_DONATE.stonePer;
    const gain = Math.floor(n / unit);
    if (gain <= 0) return { ok: false, msg: '每次至少捐 ' + unit + ' 办公币' };
    if (S.stone < gain * unit) return { ok: false, msg: '办公币不足（需 ' + (gain * unit) + '）' };
    S.stone -= gain * unit;
    s.exp += gain; s.myContrib += gain; s.myContribHist += gain; bumpMyWeek(s, gain);
    save();
    return { ok: true, gain: gain, spend: gain * unit };
  }
  // 帮派升级：由"累计贡献"驱动
  function sectUp() {
    const s = S.sect; if (!s) return { ok: false, msg: '尚未加入帮派' };
    if (s.level >= 10) return { ok: false, msg: '帮派已达 10 级上限' };
    const need = C.sectLevelNeed(s.level);
    if (s.exp < need) return { ok: false, msg: '累计贡献不足（' + s.exp + '/' + need + '），可在总览快速捐献' };
    s.level++;
    save();
    return { ok: true, level: s.level };
  }
  function sectAnnounce(text) {
    const s = S.sect; if (!s) return { ok: false, msg: '尚未加入帮派' };
    text = String(text || '').trim();
    if (!text) return { ok: false, msg: '公告不能为空' };
    if (text.length > 120) return { ok: false, msg: '公告限 120 字' };
    s.announce = text; save();
    return { ok: true };
  }
  function sectRename(name) {
    const s = S.sect; if (!s) return { ok: false, msg: '尚未加入帮派' };
    if (!s.mine) return { ok: false, msg: '仅自建帮派可改名' };
    name = String(name || '').trim();
    if (name.length < 2 || name.length > 8) return { ok: false, msg: '帮派名 2~8 字' };
    if (S.stone < C.SECT_RENAME_COST) return { ok: false, msg: '改名需办公币 ' + C.SECT_RENAME_COST };
    S.stone -= C.SECT_RENAME_COST; s.name = name; save();
    return { ok: true, name: name };
  }
  function sectLeave() {
    if (!S.sect) return { ok: false, msg: '尚未加入帮派' };
    S.sect = null; save();
    return { ok: true };
  }
  function sectAcceptApplicant(i) {
    const s = S.sect;
    if (!s || !s.mine) return { ok: false, msg: '仅自建帮派可审核申请' };
    const a = (s.applicants || [])[i];
    if (!a) return { ok: false, msg: '该申请不存在' };
    if (s.memberCount >= C.sectMemberCap(s.level)) return { ok: false, msg: '成员已达上限' };
    s.memberCount++;
    s.members.push({ name: a.name, role: '弟子', lv: a.lv, av: a.av, week: rint(5, 40), date: dateStr() });
    s.applicants.splice(i, 1); save();
    return { ok: true, name: a.name };
  }
  function sectRejectApplicant(i) {
    const s = S.sect;
    if (!s || !s.mine) return { ok: false, msg: '仅自建帮派可审核申请' };
    if (!(s.applicants || [])[i]) return { ok: false, msg: '该申请不存在' };
    s.applicants.splice(i, 1); save();
    return { ok: true };
  }
  // 贡献兑换
  function sectExchange(id) {
    const s = S.sect; if (!s) return { ok: false, msg: '尚未加入帮派' };
    const x = (C.SECT_EXCHANGE || []).find(v => v.id === id);
    if (!x) return { ok: false, msg: '未知兑换项' };
    if (s.myContrib < x.cost) return { ok: false, msg: '可用贡献不足（需 ' + x.cost + '）' };
    s.myContrib -= x.cost;
    const got = [];
    if (x.type === 'spirit' || x.type === 'stone') { S.stone += x.n; got.push('办公币+' + x.n); }
    else if (x.type === 'mat') {
      const pool = ['ht', 'qw', 'ct', 'bl', 'lm', 'yh'];
      for (let i = 0; i < x.n; i++) {
        const k = pool[Math.floor(Math.random() * pool.length)];
        S.mat[k] = (S.mat[k] || 0) + 1; got.push(C.EQUIP.MATS[k].name + '+1');
      }
    }
    save();
    return { ok: true, got: got.join('、') };
  }
  // —— 帮派Boss（每日刷新，按伤害折贡献） ——
  function sectBossInfo() {
    const s = S.sect; if (!s) return null;
    const max = 50000 * s.level;
    if (!s.boss || s.boss.day !== todayStr()) s.boss = { day: todayStr(), hp: max, max: max };
    return s.boss;
  }
  function sectBossFight() {
    const s = S.sect; if (!s) return { ok: false, msg: '尚未加入帮派' };
    if (S.stamina < 2) return { ok: false, msg: '体力不足（需 2）' };
    const b = sectBossInfo();
    if (b.hp <= 0) return { ok: false, msg: '今日镇派妖兽已被讨伐，明日再来' };
    S.stamina -= 2;
    const dmg = Math.max(100, Math.round(powerScore() * (8 + Math.random() * 6)));
    const real = Math.min(dmg, b.hp);
    b.hp -= real;
    const contrib = Math.max(1, Math.round(real / 100));
    s.exp += contrib; s.myContrib += contrib; s.myContribHist += contrib; bumpMyWeek(s, contrib);
    const got = ['贡献+' + contrib];
    if (b.hp <= 0) {
      const st = 80 * s.level;
      S.stone += st;
      got.push('讨伐成功！办公币+' + st);
    }
    save();
    return { ok: true, dmg: real, killed: b.hp <= 0, contrib: contrib, got: got };
  }

  /* ---- 帮派基础（加入/创建） ---- */
  // 申请加入成名大派（未建派时，达到其门槛等级即可）
  function joinSect(id) {
    const def = (C.SECT_LIST || []).find(s => s.id === id);
    if (!def) return { ok: false, msg: '未知帮派' };
    if (S.sect) return { ok: false, msg: '你已加入帮派' };
    if (S.level < def.reqLevel) return { ok: false, msg: '需 ' + def.reqLevel + ' 级方可申请' };
    S.sect = { name: def.name, element: def.element, level: 1, mine: false };
    sectEnsure();
    gongfaAutoUnlock();
    save();
    return { ok: true, sect: S.sect };
  }
  function createSect(name, element) {    name = (name || '').trim();
    if (S.level < 10) return { ok: false, msg: '需 10 级方可创建帮派' };
    if (S.sect) return { ok: false, msg: '你已加入帮派' };
    if (!C.EQUIP.SECT_ELEMENTS[element]) return { ok: false, msg: '未知五行属性' };
    if (name.length < 2 || name.length > 8) return { ok: false, msg: '帮派名 2~8 字' };
    if (S.stone < 150) return { ok: false, msg: '创建需 办公币150' };
    S.stone -= 150;
    S.sect = { name: name, element: element, level: 1, mine: true };
    sectEnsure();
    gongfaAutoUnlock();
    save();
    return { ok: true, sect: S.sect };
  }
  // 每日帮派产出（对应五行"擅长"方向），每日限一次
  function sectDailyYield() {
    if (!S.sect) return { ok: false, msg: '尚未加入帮派' };
    if (S._sectYieldDay === todayStr()) return { ok: false, msg: '今日帮派产出已领取' };
    const el = C.EQUIP.SECT_ELEMENTS[S.sect.element], d = el.daily;
    const n = Math.max(1, Math.round(d.n * (1 + (S.sect.level - 1) * 0.3)));
    const b = sectBonus(); const got = [];
    if (d.type === 'stone' || d.type === 'spirit') { S.stone += n; got.push('办公币+' + n); }
    else if (d.type === 'pill') {
      const cnt = Math.round(n * (1 + (b.pillMul || 0))), dim = C.DIMS[Math.floor(Math.random() * 5)].key;
      S.inventory.pills[dim] = (S.inventory.pills[dim] || 0) + cnt; got.push('资质丹(' + dim + ')+' + cnt);
    } else if (d.type === 'mat') {
      const pool = ['ht', 'qw', 'ct', 'bl', 'lm', 'yh'], k = pool[Math.floor(Math.random() * pool.length)];
      S.mat[k] = (S.mat[k] || 0) + n; got.push((C.EQUIP.MATS[k].name) + '+' + n);
    }
    S._sectYieldDay = todayStr(); save();
    return { ok: true, got: got };
  }
  // 将帮派加成写入战斗角色
  function applySectToPlayer(player, save) {
    const b = sectBonus();
    if (b.atkPct) {
      if (player.weapon) player.weapon.runeAtkMul = (player.weapon.runeAtkMul || 1) * (1 + b.atkPct);
      if (player.faqi) player.faqi.runeAtkMul = (player.faqi.runeAtkMul || 1) * (1 + b.atkPct);
    }
    if (b.spdPct) { player.spd = player.spd * (1 + b.spdPct); if (player.dims) player.dims.spd = player.dims.spd * (1 + b.spdPct); }
    if (b.healPct) player.healMul = 1 + b.healPct;
  }
  /* ============ 锻造图纸（10 件设计武器）§8.6 ============ */
  function addBlueprint(id, n) {
    if (!C.BLUEPRINTS[id]) return false;
    S.blueprints[id] = (S.blueprints[id] || 0) + (n || 1); save();
    return true;
  }
  // 凭图纸+材料制造一件设计武器：出品确定（品质/流派/词条数按图纸）
  function craftByBlueprint(bpId) {
    const bp = C.BLUEPRINTS[bpId];
    if (!bp) return { ok: false, msg: '未知图纸' };
    if ((S.blueprints[bpId] || 0) < 1) return { ok: false, msg: '尚无此锻造图纸' };
    if (!spendMats(bp.mats)) return { ok: false, msg: '材料不足（需 ' + matText(bp.mats) + '）' };
    S.blueprints[bpId]--;
    if (S.blueprints[bpId] <= 0) delete S.blueprints[bpId];
    const item = makeItem('weapon', bp.quality, { wtype: bp.wtype, affixPool: bp.affixPool, set: bp.set });
    item.bpName = bp.name; item.shape = bp.shape; item.icon = bp.icon;
    S.equipBag.push(item); save();
    return { ok: true, item: item, qual: bp.quality, name: bp.name };
  }
  global.ST = {
    get S() { return S; },
    save, load, reset, ensureDaily, todayStr, daysBetween,
    countAtLevel, gainXp, grantLevelRewards, effectiveDims, powerScore,
    addRune, addTalent, upTalent, defaultState, toast,
    applyServer, applyLayers, applyCloud, restoreSnapshot, ensureEquip, highUnlocked,
    addMat, addJinchi, forgeEquip, refineMats, recastEquip, dismantleEquip, makeGrowth, feedGrowth, forgeRedImperial,
    openZhengdao, reshapeZhengdao, engraveZhengdao, zdStage,
    equipItem, unequipSlot, embedRuneEquip, unembedRuneEquip,
    equipDimBonus, equipPower, equipItemPower, applyEquipToPlayer, resolveCombatWeapon, topDim,
    computeSetTiers, applyAffixSets, applyGongfaToPlayer, gongfaAutoUnlock, learnGongfaBook, upgradeGongfa, setActiveGongfa, sectGongfaId,
    createSect, joinSect, sectUp, sectDailyYield, sectBonus, applySectToPlayer,
    sectEnsure, sectMyWeekN, sectDonate, sectAnnounce, sectRename, sectLeave,
    sectAcceptApplicant, sectRejectApplicant, sectExchange, sectBossInfo, sectBossFight,
    addBlueprint, craftByBlueprint
  };
})(window);
