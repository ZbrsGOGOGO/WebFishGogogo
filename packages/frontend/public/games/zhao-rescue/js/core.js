/*
 * 赵云救阿斗 —— 核心逻辑层
 * ---------------------------------------------------------------
 * 这一层只负责「游戏状态与规则」，不碰任何 DOM 绘制（绘制在 render.js）。
 * 状态统一放在闭包内，通过 ZYJ.core 暴露只读 / 受控访问，便于 UI 与渲染层读取。
 * 与后端的交互（进度 / 排行榜）统一走 ZYJ.api，本层不关心存储实现。
 */
window.ZYJ = window.ZYJ || {};
ZYJ.core = (function () {
  const cfg = ZYJ.config;
  const COLS = cfg.COLS, ROWS = cfg.ROWS, CELL = cfg.CELL, MAP = cfg.MAP, TYP = cfg.TYP;
  const UNIT_DEF = cfg.UNIT_DEF, HERO_DEF = cfg.HERO_DEF; // LANE 改为动态 getter，不再缓存引用
  // 合成武将统一按「相邻两字拼名 + HERO_DEF 查表」判定，故无需 HERO_FIRST/SECOND
  const WEAPON_CHARS = cfg.WEAPON_CHARS, HERO_CHARS = cfg.HERO_CHARS, ITEM_DEF = cfg.ITEM_DEF;
  const POOL = cfg.POOL, CFG = cfg.CFG, WAVE_DEF = cfg.WAVE_DEF, MAIN = cfg.MAIN, MERCHANT_ITEMS = cfg.MERCHANT_ITEMS, WAVES = cfg.WAVES;
  const WEAPON_ATKSPEED_MUL = cfg.WEAPON_ATKSPEED_MUL || 1;

  const cv = document.getElementById('cv');
  const ctx = cv ? cv.getContext('2d') : null;

  /* ============ 状态 ============ */
  let board = null, cores = [];
  let G = null;
  let hand = [], items = [];
  let screen = 'home', paused = false, selHand = null, dragState = null;

  /* ============ 当日商店（localStorage 按日期，今天一整天生效） ============ */
  const DAY_BALANCE_VERSION = 2;
  function todayKey() { const d = new Date(), m = d.getMonth() + 1, day = d.getDate(); return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day); }
  function emptyDayState() {
    return { date: todayKey(), balanceVersion: DAY_BALANCE_VERSION,
      buffs: { meteor: false, mud: false, goldShovel: false, zhaoxian: false, shengzhi: false,
        peasantLevel: 0, lifeBonus: 0, opponentLifeBonus: 0 }, stash: {} };
  }
  function loadDayState() {
    let o = null; try { o = JSON.parse(localStorage.getItem('momo_zyjad_day_' + window.ZYJ_PLAYER_KEY) || 'null'); } catch (_) {}
    if (!o || o.date !== todayKey()) return emptyDayState();
    if (!o.buffs || typeof o.buffs !== 'object') o.buffs = {};
    if (!o.stash || typeof o.stash !== 'object') o.stash = {};
    // 旧版每次购买把“+5/+3 条命”误写成我方 +100，且没有持久化对方增益；按购买次数等比迁移。
    if (o.balanceVersion !== DAY_BALANCE_VERSION) {
      const legacyBonus = Math.max(0, Number(o.buffs.lifeBonus) || 0);
      const purchases = legacyBonus > 0 ? Math.max(1, Math.round(legacyBonus / 100)) : 0;
      o.buffs.lifeBonus = purchases * 5;
      o.buffs.opponentLifeBonus = purchases * 3;
    } else {
      o.buffs.lifeBonus = Math.max(0, Number(o.buffs.lifeBonus) || 0);
      o.buffs.opponentLifeBonus = Math.max(0, Number(o.buffs.opponentLifeBonus) || 0);
    }
    o.balanceVersion = DAY_BALANCE_VERSION;
    return o;
  }
  function saveDayState() { try { localStorage.setItem('momo_zyjad_day_' + window.ZYJ_PLAYER_KEY, JSON.stringify(dayState)); } catch (_) {} }
  let dayState = loadDayState();
  function getDayState() { return dayState; }
  /* ============ 战利券（本玩法本地资源，不冒充本站办公币） ============ */
  function loadOfficeCoin() { try { const v = parseInt(localStorage.getItem('momo_zyjad_ticket_' + window.ZYJ_PLAYER_KEY)); return isFinite(v) && v > 0 ? v : 0; } catch (_) { return 0; } }
  function saveOfficeCoin() { try { localStorage.setItem('momo_zyjad_ticket_' + window.ZYJ_PLAYER_KEY, String(officeCoin)); } catch (_) {} }
  let officeCoin = loadOfficeCoin();
  function getOfficeCoin() { return officeCoin; }
  function grantOfficeCoin(n) { officeCoin += (n || 0); saveOfficeCoin(); }
  let codexSet = new Set(), endlessBest = 0;
  let ctrlCache = '', boardDrag = null;
  let progressLevels = {};   // 章节 -> 已解锁最高关卡下标

  /* ============ 棋盘 / 基础 ============ */
  function initBoard() {
    board = []; cores = [];
    for (let r = 0; r < ROWS; r++) {
      board[r] = [];
      for (let c = 0; c < COLS; c++) {
        const t = TYP[MAP[r][c]] || 'white';
        board[r][c] = { type: t, unit: null };
        if (t === 'core') cores.push([c, r]);
      }
    }
  }
  function cellPx(c, r) { return [c * CELL + CELL / 2, r * CELL + CELL / 2]; }
  function inBoard(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }
  function cellFromEvent(e) {
    const rect = cv.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (cv.width / rect.width);
    const y = (e.clientY - rect.top) * (cv.height / rect.height);
    return [Math.floor(x / CELL), Math.floor(y / CELL)];
  }
  function freeCells() {
    const a = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
      if (board[r][c].type === 'green' && !board[r][c].unit) a.push([c, r]);
    return a;
  }
  function countUnits() {
    let n = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (board[r][c].unit) n++;
    return n;
  }

  /* ============ 新局 ============ */
  function freshGame() {
    G = {
      mode: 'main', baozi: CFG.BAOZI_START, adouHp: CFG.ADOU_MAX, adouMax: CFG.ADOU_MAX, wave: -1, conscriptTimes: 0,
      units: [], enemies: [], bullets: [], fx: [], spawnQueue: [], spawnTimer: 0,
      deck: {},   // 消耗型牌库：ch -> 本局剩余张数（抽走即减，不回池）
      isBattle: false, waveCleared: false, atkSpeedMul: 1, atkSpeedTimer: 0,
      level: 0, chapter: 0, over: false, autoWave: false, nextWaveTimer: 0, startDelay: 0,
      pvpDrawTimer: 0, oppAdouHp: 0, oppAdouMax: CFG.ADOU_MAX, totalWaves: 0, bossKilled: 0,
      buffs: { meteor: false, mud: false, goldShovel: false, zhaoxian: false, shengzhi: false, peasantLevel: 0 },
      merchantPending: false, peasantTimer: 0
    };
  }
  function applyDayBuffs() {
    const db = dayState.buffs;
    G.buffs = { meteor: !!db.meteor, mud: !!db.mud, goldShovel: !!db.goldShovel, zhaoxian: !!db.zhaoxian, shengzhi: !!db.shengzhi, peasantLevel: db.peasantLevel || 0, peasantTimer: 0 };
    const lb = db.lifeBonus || 0;
    G.adouMax += lb; G.adouHp = Math.min(G.adouMax, G.adouHp + lb);
    const oppLb = db.opponentLifeBonus || 0;
    if (G.mode === 'pvp') { G.oppAdouMax += oppLb; G.oppAdouHp = Math.min(G.oppAdouMax, G.oppAdouHp + oppLb); }
    for (const name in dayState.stash) { const n = dayState.stash[name] | 0; for (let k = 0; k < n; k++) items.push({ kind: 'item', item: name }); }
  }
  function reset(mode, ci, li) {
    freshGame();
    G.mode = mode; G.chapter = ci || 0; G.level = li || 0;
    G.autoWave = false; G.nextWaveTimer = 0; G.pvpDrawTimer = 0;
    G.totalWaves = mode === 'main' ? MAIN[G.chapter][G.level].length
      : (mode === 'endless' ? 9999 : 1);
    G.startDelay = CFG.FIRST_DELAY;   // 所有模式统一：开局倒计时后才出兵
    hand = []; items = [];
    dayState = loadDayState(); applyDayBuffs();   // 先应用招贤榜等日状态
    buildDeck();                                // 再建消耗型牌库（招贤榜金色字已扩容）
    conscript();                                // 开局首抽
    if (mode === 'pvp') { G.oppAdouHp = G.oppAdouMax; G.pvpDrawTimer = 0.5; }
    ZYJ.ui && ZYJ.ui.log('准备 ' + CFG.FIRST_DELAY + ' 秒后出兵，快布阵！');
  }

  /* ============ 抽卡 / 合成 ============ */
  // 构建消耗型牌库：开局按 zyjad_pool.count 固定存量；招贤榜对金色字额外 +50% 扩容（仅开局生效）。
  function buildDeck() {
    G.deck = {};
    for (const p of POOL) {
      if (p.kind !== 'char' || !p.ch) continue;
      let n = (p.count != null) ? p.count : Math.round(p.w);
      if (G.buffs.zhaoxian && HERO_CHARS.has(p.ch)) n += Math.round(n * 0.5);  // 招贤榜：金色字 +50% 扩容
      G.deck[p.ch] = n;
    }
  }
  // 从剩余牌库按权重选一个字（不消耗），字库空返回 null
  function randomChar() {
    const chars = Object.keys(G.deck).filter(c => (G.deck[c] || 0) > 0);
    if (!chars.length) return null;
    let tot = 0; const wm = {};
    for (const c of chars) { const p = POOL.find(x => x.ch === c); const w = p ? p.w : 1; wm[c] = w; tot += w; }
    let x = Math.random() * tot;
    for (const c of chars) { x -= wm[c]; if (x <= 0) return c; }
    return chars[0];
  }
  // 抽一张（消耗：牌库对应字 -1），空返回 null
  function drawOne() {
    const c = randomChar(); if (!c) return null;
    G.deck[c] = (G.deck[c] || 0) - 1; return c;
  }
  function pickItem() { const its = Object.keys(ITEM_DEF); return its[Math.floor(Math.random() * its.length)]; }

  function conscript() {
    if (G.over) return;
    const cost = CFG.CONSCRIPT_COST + (CFG.CONSCRIPT_STEP || 0) * G.conscriptTimes;  // 首次基础，之后每次 +STEP
    if (G.baozi < cost) { ZYJ.ui && ZYJ.ui.toast('包子不足（需 ' + cost + '）'); return; }
    const left = Object.keys(G.deck).reduce((a, c) => a + (G.deck[c] || 0), 0);
    if (left <= 0) { ZYJ.ui && ZYJ.ui.toast('字库已空，无法征兵'); return; }
    G.baozi -= cost;
    G.conscriptTimes++;
    hand = []; // 抽卡前清空手牌，不累积
    for (let i = 0; i < 5; i++) {
      let card;
      const t = Math.random();
      if (t < CFG.ITEM_DRAW_RATE) card = { kind: 'item', item: pickItem() };
      else {
        const c = drawOne(); if (!c) break;          // 从消耗型牌库抽一张（牌库 -1），空则停止补牌
        card = { kind: 'char', ch: c, level: 1 };
      }
      if (card.kind === 'char' && WEAPON_CHARS.has(card.ch)) codexSet.add('unit:' + card.ch);
      hand.push(card);
    }
    ZYJ.ui && ZYJ.ui.renderAll();
    // 【PVP】抽牌含随机，必须广播“结果”（实际字），否则两端抽到的字对不上
    if (ZYJ.net && ZYJ.net.isActive && ZYJ.net.isActive()) {
      ZYJ.net.op('draw', { cards: hand.filter(c => c.kind === 'char').map(c => c.ch) });
    }
  }
  function canMerge(a, b) { return a.ch === b.ch && a.level === b.level && a.level < 5; }
  function mergeHand(i, j) {
    const a = hand[i], b = hand[j];
    if (!a || !b || i === j) return false;
    if (a.kind === 'char' && b.kind === 'char' && canMerge(a, b)) {
      b.level++; hand.splice(i, 1); ZYJ.ui && ZYJ.ui.renderAll(); return true;
    }
    // 不同兵种/等级（或道具）：替换位置（交换两张手牌）
    const t = hand[i]; hand[i] = hand[j]; hand[j] = t; ZYJ.ui && ZYJ.ui.renderAll(); return true;
  }

  /* ============ 落子 / 合成 ============ */
  function unitAtk(u) {
    const L = UNIT_DEF[u.card.ch].levels[u.card.level];
    return L ? L.atk : 0;
  }
  function attackIntervalSeconds(rate, multiplier) {
    const attacksPerSecond = Number(rate) * (Number(multiplier) || 1);
    return attacksPerSecond > 0 ? 1 / attacksPerSecond : 1;
  }
  function refreshUnitStats(u) {
    if (!u) return false;
    const isHero = u.kind === 'hero';
    const def = isHero ? HERO_DEF[u.hero] : (u.card && UNIT_DEF[u.card.ch]);
    const level = isHero ? u.level : (u.card && u.card.level);
    const L = def && def.levels && def.levels[level];
    if (!L) return false;
    u.atk = Number(L.atk);
    u.attackSpeed = Number(L.cd);
    u.cd0 = attackIntervalSeconds(u.attackSpeed, isHero ? 1 : WEAPON_ATKSPEED_MUL);
    u.range = Number(L.range);
    u.atkType = L.atkType || def.atkType;
    if (!Number.isFinite(u.cd) || u.cd < 0) u.cd = 0;
    else u.cd = Math.min(u.cd, u.cd0);
    return true;
  }
  function upgradeUnit(u) {
    if (!u || (u.kind !== 'unit' && u.kind !== 'hero')) return false;
    const isHero = u.kind === 'hero';
    const def = isHero ? HERO_DEF[u.hero] : UNIT_DEF[u.card.ch];
    const max = isHero ? (def.maxLevel || 5) : Math.max(...Object.keys(def.levels).map(Number));
    const level = isHero ? u.level : u.card.level;
    if (!Number.isInteger(level) || level >= max) return false;
    if (isHero) u.level++;
    else u.card.level++;
    return refreshUnitStats(u);
  }
  function placeChar(r, c, ch, level) {
    const def = UNIT_DEF[ch];
    const max = Math.max(...Object.keys(def.levels).map(Number));
    const requested = (level != null) ? Number(level) : ((G.buffs.shengzhi && Math.random() < 0.05) ? 2 : 1);  // 升职令：5% 刷出即 2 级
    const lv = Number.isInteger(requested) ? Math.max(1, Math.min(max, requested)) : 1;
    const u = { kind: 'unit', card: { ch: ch, level: lv }, r: r, c: c, cd: 0, cd0: 1, atk: 0, range: 0, atkType: def.atkType, x: 0, y: 0 };
    refreshUnitStats(u);
    const [x, y] = cellPx(c, r); u.x = x; u.y = y;
    board[r][c].unit = u; G.units.push(u);
    // 【PVP】武器落子（含合成/替换/顶替武将）都走这里，统一广播 place
    if (ZYJ.net && ZYJ.net.isActive && ZYJ.net.isActive()) ZYJ.net.op('place', { unit: ch, level: lv, r: r, c: c });
    return u;
  }
  // 备战席武器落子：同武器同等级→合成升级；否则→替换位置（目标单位退回备战席）
  function tryPlaceWeapon(i, r, c) {
    const card = hand[i];
    if (!card || card.kind !== 'char' || !WEAPON_CHARS.has(card.ch)) return false;
    const b = board[r][c];
    if (b.type !== 'green') { ZYJ.ui && ZYJ.ui.toast('只能在己方空地放置'); return false; }
    if (!b.unit) {
      placeChar(r, c, card.ch, card.level); codexSet.add('unit:' + card.ch);
      hand.splice(i, 1); ZYJ.ui && ZYJ.ui.log('部署 ' + card.ch + ' ' + card.level + '级');
      return true;
    }
    if (b.unit.kind === 'unit') {
      if (b.unit.card.ch === card.ch && b.unit.card.level === card.level && card.level < 5) {
        upgradeUnit(b.unit); hand.splice(i, 1);
        ZYJ.ui && ZYJ.ui.log('合成 ' + b.unit.card.ch + ' ' + b.unit.card.level + '级'); return true;
      }
      const back = { kind: 'char', ch: b.unit.card.ch, level: b.unit.card.level };
      const gi = G.units.indexOf(b.unit); if (gi >= 0) G.units.splice(gi, 1);
      b.unit = null; placeChar(r, c, card.ch, card.level); codexSet.add('unit:' + card.ch);
      hand[i] = back; ZYJ.ui && ZYJ.ui.log('替换位置：' + card.ch + ' ↔ ' + back.ch); return true;
    }
    if (b.unit.kind === 'char') {                 // 待激活将字：替换为武器，将字退回备战席
      const back = { kind: 'char', ch: b.unit.ch, level: 1 };
      b.unit = null; placeChar(r, c, card.ch, card.level); codexSet.add('unit:' + card.ch);
      hand[i] = back; ZYJ.ui && ZYJ.ui.log('替换位置：' + card.ch + ' ↔ 将字' + back.ch); return true;
    }
    ZYJ.ui && ZYJ.ui.toast('该格已有武将，无法替换'); return false;
  }
  // 武将需两字「左右相邻」（左=首字·右=次字）才能合成，例如 赵(左)+云(右)=赵云
  function findHeroPair(r, c, ch) {
    for (const dc of [-1, 1]) {                         // 仅左右相邻
      const nc = c + dc; if (nc < 0 || nc >= COLS) continue;
      const u = board[r][nc].unit; if (!u || u.kind !== 'char') continue;
      const leftCh = dc === -1 ? u.ch : ch;             // 左列字
      const rightCh = dc === -1 ? ch : u.ch;            // 右列字
      const name = leftCh + rightCh;
      if (HERO_DEF[name]) return { fr: r, fc: dc === -1 ? nc : c, sr: r, sc: dc === -1 ? c : nc, name };
    }
    return null;
  }
  function activateHeroPair(p) {
    const d = HERO_DEF[p.name]; if (!d) { ZYJ.ui && ZYJ.ui.toast('无法组成武将'); return false; }
    for (const [rr, cc] of [[p.fr, p.fc], [p.sr, p.sc]]) {     // 移除两格上任意旧单位（将字/武器），避免“两字重合”
      const u = board[rr][cc].unit;
      if (u) { const i = G.units.indexOf(u); if (i >= 0) G.units.splice(i, 1); board[rr][cc].unit = null; }
    }
    const hero = { kind: 'hero', hero: p.name, level: 1, r: p.fr, c: p.fc, r2: p.sr, c2: p.sc, cd: 0, cd0: 1, atk: 0, range: 0, atkType: d.atkType, x: 0, y: 0 };
    refreshUnitStats(hero);
    const [x1, y1] = cellPx(p.fc, p.fr), [x2, y2] = cellPx(p.sc, p.sr);
    hero.x = (x1 + x2) / 2; hero.y = (y1 + y2) / 2;
    board[p.fr][p.fc].unit = hero; board[p.sr][p.sc].unit = hero; G.units.push(hero);
    // 【PVP】武将合成后广播 hero（左首字格 r/c + 双字）
    if (ZYJ.net && ZYJ.net.isActive && ZYJ.net.isActive()) ZYJ.net.op('hero', { first: p.name[0], second: p.name[1], r: p.fr, c: p.fc });
    codexSet.add('hero:' + p.name);
    ZYJ.ui && ZYJ.ui.log('激活武将 ' + p.name + '！' + d.skill);
    return true;
  }
  // 武将占左右两格（r,c 左首字 · r2,c2 右次字），可整体拖动 / 拆解回两枚将字
  function heroLeft(u) { return { r: u.r, c: u.c }; }
  function detachHero(r, c) {
    const u = board[r][c].unit; if (!u || u.kind !== 'hero') return null;
    for (const cell of [heroLeft(u), { r: u.r2, c: u.c2 }]) {
      if (board[cell.r][cell.c].unit === u) board[cell.r][cell.c].unit = null;
    }
    const i = G.units.indexOf(u); if (i >= 0) G.units.splice(i, 1);
    return u;
  }
  function placeHeroAt(u, fr, fc) {
    const sr = fr, sc = fc + 1;
    u.r = fr; u.c = fc; u.r2 = sr; u.c2 = sc;
    board[fr][fc].unit = u; board[sr][sc].unit = u;
    const [x1, y1] = cellPx(fc, fr), [x2, y2] = cellPx(sc, sr);
    u.x = (x1 + x2) / 2; u.y = (y1 + y2) / 2;
    G.units.push(u); return u;
  }
  // 把武将拖回备战席 → 拆成两枚将字
  function splitHeroToHand(r, c) {
    const u = board[r][c].unit; if (!u || u.kind !== 'hero') return false;
    detachHero(r, c);
    hand.push({ kind: 'char', ch: u.hero[0], level: 1 });
    hand.push({ kind: 'char', ch: u.hero[1], level: 1 });
    ZYJ.ui && ZYJ.ui.log('拆解 ' + u.hero + ' → 两枚将字回备战席');
    return true;
  }
  // 把场上已部署的小兵(武器)或待激活将字撤回备战席：格清空，回一张字符卡（保留等级）
  function removeUnitToHand(r, c) {
    const cell = board[r][c];
    const u = cell && cell.unit;
    if (!u || u.kind === 'hero') return false;   // 武将走 splitHeroToHand
    hand.push({ kind: 'char', ch: u.ch, level: u.level || 1 });
    cell.unit = null;
    ZYJ.ui && ZYJ.ui.log('撤回 ' + (u.name || u.ch) + ' → 备战席');
    return true;
  }
  // 武将整体平移：以被抓起格的相对位置对齐到目标左格 (newR,newC)
  function moveHeroFromCell(r, c, newR, newC) {
    const u = board[r][c].unit; if (!u || u.kind !== 'hero') return false;
    const left = heroLeft(u);
    const offC = c - left.c;                       // 抓起的是左格(0)还是右格(1)
    const targetL = newC - offC;                   // 还原出目标左格
    const nr = newR, nc = targetL, sr = newR, sc = targetL + 1;
    if (sc >= COLS || !inBoard(nc, nr) || !inBoard(sc, sr)) return false;
    for (const [rr, cc] of [[nr, nc], [sr, sc]]) {
      const t = board[rr][cc].unit; if (t && t !== u) return false;
      if (board[rr][cc].type !== 'green') return false;
    }
    detachHero(r, c); placeHeroAt(u, nr, nc);
    ZYJ.ui && ZYJ.ui.log('移动武将 ' + u.hero);
    return true;
  }
  // 返回 'consumed'（卡牌已消耗）/ 'placed'（已落子但未消耗，保留兼容）/ null（无效）
  function applyToCell(r, c, card) {
    const b = board[r][c];
    if (card.kind === 'item') {
      if (card.item === '铲子') {
        if (b.type === 'stone') {                 // 铲子：铲掉草地（草障）→ 变可放置空地
          b.type = 'green'; const i = items.indexOf(card); if (i >= 0) items.splice(i, 1);
          // 【PVP】铲子改变地形（石→绿），广播 item 让对方重放同步
          if (ZYJ.net && ZYJ.net.isActive && ZYJ.net.isActive()) ZYJ.net.op('item', { item: '铲子', r: r, c: c });
          let msg = '铲开草地 1 格';
          if (G.buffs.goldShovel) {               // 摸金校尉：金铲铲出宝箱
            if (Math.random() < 0.5) { const g = 5 + Math.floor(Math.random() * 11); G.baozi += g; msg += '（金铲·宝箱 +' + g + ' 包子）'; }
            else { const it = pickItem(); items.push({ kind: 'item', item: it }); msg += '（金铲·宝箱 ' + it + '）'; }
          }
          ZYJ.ui && ZYJ.ui.log(msg); return 'consumed';
        }
        ZYJ.ui && ZYJ.ui.toast('铲子只能用于草地（草障）'); return null;
      }
      if (card.item === '神兵符') {                 // 神兵符：拖到武器单位/武将上升 1 级
        if (b.unit && b.unit.kind === 'unit') {
          if (!upgradeUnit(b.unit)) { ZYJ.ui && ZYJ.ui.toast('该单位已达满级'); return null; }
          // 【PVP】神兵符升级武器，广播 item 让对方同步等级
          if (ZYJ.net && ZYJ.net.isActive && ZYJ.net.isActive()) ZYJ.net.op('item', { item: '神兵符', r: r, c: c });
          const i = items.indexOf(card); if (i >= 0) items.splice(i, 1); consumeStash('神兵符');
          ZYJ.ui && ZYJ.ui.log('神兵符：单位升到 ' + b.unit.card.level + ' 级'); return 'consumed';
        }
        if (b.unit && b.unit.kind === 'hero') {
          const def = HERO_DEF[b.unit.hero], max = def.maxLevel || 5;
          if (b.unit.level >= max) { ZYJ.ui && ZYJ.ui.toast(b.unit.hero + ' 已达满级 ' + max); return null; }
          upgradeUnit(b.unit);
          // 【PVP】神兵符升级武将，广播 item 让对方同步等级
          if (ZYJ.net && ZYJ.net.isActive && ZYJ.net.isActive()) ZYJ.net.op('item', { item: '神兵符', r: r, c: c });
          const i = items.indexOf(card); if (i >= 0) items.splice(i, 1); consumeStash('神兵符');
          ZYJ.ui && ZYJ.ui.log('神兵符：' + b.unit.hero + ' 升到 ' + b.unit.level + ' 级'); return 'consumed';
        }
        ZYJ.ui && ZYJ.ui.toast('神兵符需拖到武器单位/武将上'); return null;
      }
      return applyItem(card) ? 'consumed' : null;
    }
    if (card.kind !== 'char') return null;
    const ch = card.ch;
    if (HERO_CHARS.has(ch)) {
      if (b.type !== 'green') { ZYJ.ui && ZYJ.ui.toast('武将字只能放在己方空地'); return null; }
      if (b.unit) {                                          // 已占格 → 允许替换：原单位退回备战席
        if (b.unit.kind === 'hero') {
          const hero = b.unit, hName = hero.hero;
          const gi = G.units.indexOf(hero); if (gi >= 0) G.units.splice(gi, 1);
          // 武将占两格，必须同时清空另一格，否则会留下悬挂引用（表现为“两字重合 / 占位但看不见”）
          if (board[hero.r2] && board[hero.r2][hero.c2] && board[hero.r2][hero.c2].unit === hero) board[hero.r2][hero.c2].unit = null;
          b.unit = null;
          const u0 = { kind: 'char', ch: ch, r: r, c: c, x: 0, y: 0 };
          const [x0, y0] = cellPx(c, r); u0.x = x0; u0.y = y0; board[r][c].unit = u0; G.units.push(u0);
          hand.push({ kind: 'char', ch: hName[0], level: 1 });
          hand.push({ kind: 'char', ch: hName[1], level: 1 });
          ZYJ.ui && ZYJ.ui.log('替换：将字' + ch + ' 顶替武将 ' + hName + '（两枚将字已回备战席）');
          return 'consumed';
        }
        const back = b.unit.kind === 'unit'
          ? { kind: 'char', ch: b.unit.card.ch, level: b.unit.card.level }
          : { kind: 'char', ch: b.unit.ch, level: 1 };
        const gi = G.units.indexOf(b.unit); if (gi >= 0) G.units.splice(gi, 1);
        b.unit = null;
        const nu = { kind: 'char', ch: ch, r: r, c: c, x: 0, y: 0 };
        const [nx, ny] = cellPx(c, r); nu.x = nx; nu.y = ny; board[r][c].unit = nu; G.units.push(nu);
        hand.push(back);
        ZYJ.ui && ZYJ.ui.log('替换：将字' + ch + ' ↔ ' + back.ch + '（原单位已回备战席）');
        return 'consumed';
      }
      const pair = findHeroPair(r, c, ch);                   // 与左右相邻将字配对 → 合成武将
      if (pair) return activateHeroPair(pair) ? 'consumed' : null;
      const u = { kind: 'char', ch: ch, r: r, c: c, x: 0, y: 0 };   // 否则作为待激活将字落下（不再清掉其它将字）
      const [x, y] = cellPx(c, r); u.x = x; u.y = y; board[r][c].unit = u; G.units.push(u);
      return 'consumed';
    }
    if (!WEAPON_CHARS.has(ch)) return null;
    if (b.type !== 'green') { ZYJ.ui && ZYJ.ui.toast('只能在己方空地放置'); return null; }
    if (b.unit) {
      // 已占格（满格）→ 允许替换：原单位退回备战席（含武将则拆回两枚将字）
      if (b.unit.kind === 'unit') {
        if (b.unit.card.ch === ch && b.unit.card.level === (card.level || 1) && b.unit.card.level < 5) {   // 同武器同等级 → 合成升级
          upgradeUnit(b.unit);
          // 【PVP】神兵符升级武器，广播 item 让对方同步等级
          if (ZYJ.net && ZYJ.net.isActive && ZYJ.net.isActive()) ZYJ.net.op('item', { item: '神兵符', r: r, c: c });
          return 'consumed';
        }
        const back = { kind: 'char', ch: b.unit.card.ch, level: b.unit.card.level };
        const gi = G.units.indexOf(b.unit); if (gi >= 0) G.units.splice(gi, 1);
        b.unit = null; placeChar(r, c, ch, card.level); codexSet.add('unit:' + ch);
        hand.push(back);
        ZYJ.ui && ZYJ.ui.log('替换：' + ch + ' ↔ ' + back.ch + '（原单位已回备战席）');
        return 'consumed';
      }
      if (b.unit.kind === 'char') {                          // 待激活将字 → 替换为武器，将字退回备战席
        const back = { kind: 'char', ch: b.unit.ch, level: 1 };
        b.unit = null; placeChar(r, c, ch, card.level); codexSet.add('unit:' + ch);
        hand.push(back);
        ZYJ.ui && ZYJ.ui.log('替换：' + ch + ' ↔ 将字' + back.ch + '（将字已回备战席）');
        return 'consumed';
      }
      if (b.unit.kind === 'hero') {                          // 武将 → 拆回两枚将字回备战席，再放武器
        const hero = b.unit, hName = hero.hero;
        const gi = G.units.indexOf(hero); if (gi >= 0) G.units.splice(gi, 1);
        if (board[hero.r2] && board[hero.r2][hero.c2] && board[hero.r2][hero.c2].unit === hero) board[hero.r2][hero.c2].unit = null;
        b.unit = null; placeChar(r, c, ch, card.level); codexSet.add('unit:' + ch);
        hand.push({ kind: 'char', ch: hName[0], level: 1 });
        hand.push({ kind: 'char', ch: hName[1], level: 1 });
        ZYJ.ui && ZYJ.ui.log('替换：' + ch + ' 顶替武将 ' + hName + '（两枚将字已回备战席）');
        return 'consumed';
      }
    }
    placeChar(r, c, ch, card.level); codexSet.add('unit:' + ch);
    return 'consumed';
  }
  function applyItem(c) {
    if (c.item === '神兵符') { ZYJ.ui && ZYJ.ui.toast('神兵符请拖到武器单位上升级'); return false; }
    if (c.item === '包子') {                       // 包子：主动，55% 续 1 命 / 45% 减 1 命
      if (Math.random() < 0.55) { G.adouHp = Math.min(G.adouMax, G.adouHp + 1); ZYJ.ui && ZYJ.ui.log('包子：阿斗续 1 命 (+1)'); }
      else { G.adouHp = Math.max(0, G.adouHp - 1); ZYJ.ui && ZYJ.ui.log('包子：阿斗 -1 命 (-1)'); }
      const i = items.indexOf(c); if (i >= 0) items.splice(i, 1); consumeStash('包子');
      // 【PVP】包子（阿斗血量随机增减）广播 item；对方血量为权威结算项，重放侧仅作事件标记
      if (ZYJ.net && ZYJ.net.isActive && ZYJ.net.isActive()) ZYJ.net.op('item', { item: '包子' });
      return true;
    }
    // 未识别的道具（铲子/神兵符已在上层 applyToCell 处理）
    return false;
  }

  /* ============ 波次 / 出兵 ============ */
  function startWave() {
    if (G.over) return;
    if (G.mode === 'main' || G.mode === 'pvp') {
      if (G.wave >= G.totalWaves) { G.isBattle = false; return; }
      queueWave(MAIN[G.chapter][G.level][G.wave]);
    } else { // endless：循环 20 波标准局，按轮次在 spawnEnemy 内放大
      queueWave(WAVES[((G.wave % 20) + 20) % 20]);
    }
    G.isBattle = true;
    ZYJ.ui && ZYJ.ui.log('第 ' + (G.wave + 1) + ' 波' + (G.mode === 'endless' ? '（无尽·第' + (Math.floor(G.wave / 20) + 1) + '轮）' : ''));
  }
  function queueWave(arr) { if (!arr) return; for (const name of arr) G.spawnQueue.push(name); }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  // 野怪血量随波次指数增长：baseHp × HP_GROWTH^(波次-1)，波次为 1-based；BOSS 同样适用。
  // 封顶防无尽爆炸（最多基础血量 HP_CAP_MUL 倍）。撞阿斗扣爱心(dmg)不随波次增长，恒定。
  function waveHpMul(wave1) {
    const g = (CFG.HP_GROWTH > 0) ? CFG.HP_GROWTH : 1.12;
    return Math.pow(g, wave1 - 1);
  }
  function spawnEnemy(name, waveOpt) {
    const d = WAVE_DEF[name]; if (!d) return;
    const isEndless = G.mode === 'endless';
    // 波次（1-based）：PVP 由时间表携带 wave，保证双端血量一致；其余模式用当前波次
    const wave1 = isEndless ? ((G.wave % 20) + 1)
                : (typeof waveOpt === 'number' ? waveOpt : (G.wave + 1));
    const round = isEndless ? Math.floor(G.wave / 20) : 0;
    const baseMul = isEndless ? Math.pow(1.4, round) : 1;   // 无尽：每轮基础血量 ×1.4
    let hp = d.hp * baseMul * waveHpMul(wave1);
    const capMul = (CFG.HP_CAP_MUL > 0) ? CFG.HP_CAP_MUL : 50;
    hp = Math.min(hp, d.hp * capMul);
    const lane = cfg.LANE;
    if (!lane || lane.length === 0) { ZYJ.ui && ZYJ.ui.log('路径未生成！'); return; }
    const e = {
      name, gly: d.gly, hp: hp, maxhp: hp, speed: d.speed,
      idx: 0, lane: lane, x: 0, y: 0, boss: d.boss, dmg: d.dmg, feature: d.feature,
      slowAura: (name === '淤泥怪')                 // 淤泥怪：经过时减速我方棋子攻速
    };
    const [sx, sy] = cellPx(lane[0][0], lane[0][1]); e.x = sx; e.y = sy;
    G.enemies.push(e);
  }

  /* ============ 战斗 ============ */
  function nearestEnemy(x, y) {
    let best = null, bd = 1e9;
    for (const e of G.enemies) { const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  function grantKill(e) {
    if (e.rewarded) return; e.rewarded = true;
    // boss 判定：自身标志 或 已知 BOSS 名称(WAVE_DEF 里的 boss)，双保险
    const isBoss = e.boss || (WAVE_DEF[e.name] && WAVE_DEF[e.name].boss);
    const reward = isBoss ? (CFG.KILL_REWARD_BOSS || 40) : (CFG.KILL_REWARD_MOB || 1);
    G.baozi += reward;
    ZYJ.ui && ZYJ.ui.log((isBoss ? 'BOSS ' : '') + e.gly + ' 被斩！+' + reward + ' 包子');
    if (isBoss) G.bossKilled++;
  }
  function attack(u, t) {
    const range = u.range * CELL;
    if (Math.hypot(u.x - t.x, u.y - t.y) > range) return;
    let dmg = u.atk;
    // 武将专属增益（叠加在总伤害上）
    if (u.kind === 'hero') {
      if (u.hero === '赵云') dmg *= 1.3;
      else if (u.hero === '黄忠') { if (t.boss) dmg *= 1.4; if (t.hp < t.maxhp * 0.3) dmg *= 1.5; }
    }
    const ch = u.kind === 'hero' ? null : u.card.ch;   // 小兵种类：弓/刀/枪/骑
    const at = u.atkType || 'single';
    if (at === 'single') {
      if (ch === '刀') {                               // 刀兵：近战挥刀，即时命中
        t.hp -= dmg; if (t.hp <= 0) grantKill(t);
        const ang = Math.atan2(t.y - u.y, t.x - u.x);
        G.fx.push({ type: 'slash', x: t.x, y: t.y, ang: ang, t: 0, dur: 0.18 });
      } else if (ch === '弓') {                        // 弓兵：射箭（飞行子弹）
        G.bullets.push({ x: u.x, y: u.y, tx: t.x, ty: t.y, dmg: dmg, t: t, visual: 'arrow' });
      } else {                                         // 其它单体（刘备等武将）：飞弹
        G.bullets.push({ x: u.x, y: u.y, tx: t.x, ty: t.y, dmg: dmg, t: t, visual: 'shot' });
      }
    } else {
      // 群伤：aoe 圆形 / pierce 长条近似 / splash 单体+减半溅射
      const radius = at === 'pierce' ? CELL * 3.5 : (at === 'splash' ? CELL * 1.2 : CELL * 1.6);
      const ratio = at === 'splash' ? 0.5 : 1;
      if (at === 'pierce') {                           // 枪/赵云：直线枪刺光痕
        G.fx.push({ type: 'pierce', x: u.x, y: u.y, tx: t.x, ty: t.y, t: 0, dur: 0.18 });
      } else {                                         // 骑/范围：抡圆扩散
        G.fx.push({ type: 'aoe', x: t.x, y: t.y, r: radius, t: 0, dur: 0.3 });
      }
      for (const e of G.enemies) {
        if (e.hp <= 0) continue;
        if (Math.hypot(e.x - t.x, e.y - t.y) <= radius) {
          const ed = (e === t) ? dmg : dmg * ratio;
          e.hp -= ed; if (e.hp <= 0) grantKill(e);
        }
      }
    }
  }
  function update(dt) {
    if (!G || G.over) return;
    if (paused) return;

    // 开局倒计时：倒计时未结束不允许出兵
    if (G.startDelay > 0) G.startDelay -= dt;
    const allowWave = G.startDelay <= 0;

    // 农民被动产出（神秘商人·农民）：每 20 秒 +1 包子，升级后生产翻倍
    if (G.buffs.peasantLevel > 0) {
      G.peasantTimer += dt;
      const interval = Math.max(2.5, 20 / Math.pow(2, G.buffs.peasantLevel - 1));
      if (G.peasantTimer >= interval) { G.peasantTimer -= interval; G.baozi += 1; ZYJ.ui && ZYJ.ui.log('农民耕作：+1 包子'); }
    }

    // 自动出兵（无尽）
    if (G.autoWave) {
      if (G.wave >= G.totalWaves && G.spawnQueue.length === 0 && G.enemies.length === 0) {
        G.over = true; G.isBattle = false;
        endlessBest = Math.max(endlessBest, G.wave); saveProgress();
        ZYJ.api && ZYJ.api.submitScore && ZYJ.api.submitScore({ mode: 'endless', score: G.wave });
        ZYJ.ui && ZYJ.ui.onEndlessEnd && ZYJ.ui.onEndlessEnd(G.wave);
        return;
      }
      if (G.nextWaveTimer > 0) { G.nextWaveTimer -= dt; if (G.nextWaveTimer <= 0) { G.wave++; startWave(); } }
    } else if (G.mode === 'main') {
      const cleared = G.spawnQueue.length === 0 && G.enemies.length === 0;
      if (cleared && G.wave >= G.totalWaves - 1) {        // 最后一波已清空 → 通关
        progressLevels[G.chapter] = Math.max(progressLevels[G.chapter] || 0, G.level + 1);
        saveProgress(); G.over = true; G.isBattle = false;
        ZYJ.ui && ZYJ.ui.onMainWin && ZYJ.ui.onMainWin();
        return;
      }
      if (allowWave && cleared && G.wave < G.totalWaves - 1) { G.wave++; startWave(); }
    } else if (G.mode === 'pvp') {
      // PVP：按服务器统一开始时间，双方「完全相同、时间同步」地投放同一波敌人
      if (!G.pvpStarted) {
        if (Date.now() >= G.pvpStartAt) {
          G.pvpStarted = true; G.pvpCursor = 0; G.spawnTimer = 0;
          ZYJ.ui && ZYJ.ui.log('开战！与【' + (G.pvpOppName || '对手') + '】同时面对同一波敌军，看谁守得住阿斗！');
        }
      } else {
        const elapsed = (Date.now() - G.pvpStartAt) / 1000;
        while (G.pvpCursor < G.pvpSchedule.length && G.pvpSchedule[G.pvpCursor].t <= elapsed) {
          const s = G.pvpSchedule[G.pvpCursor];
          G.spawnQueue.push({ name: s.name, wave: s.wave });
          G.pvpCursor++;
        }
        if (G.pvpCursor >= G.pvpSchedule.length && G.spawnQueue.length === 0 && G.enemies.length === 0) {
          G.pvpFinished = true;  // 本局全部波次清空且仍存活
        }
      }
    }

    // 出兵计时
    if (G.spawnQueue.length) {
      G.spawnTimer -= dt;
      if (G.spawnTimer <= 0) {
        const n = G.spawnQueue.shift();
        if (typeof n === 'string') spawnEnemy(n);
        else spawnEnemy(n.name, n.wave);
        G.spawnTimer = CFG.SPAWN_INTERVAL;
      }
    }
    // 攻速增益
    if (G.atkSpeedTimer > 0) { G.atkSpeedTimer -= dt; if (G.atkSpeedTimer <= 0) G.atkSpeedMul = 1; }
    // 单位攻击（淤泥怪在场时，我方棋子攻速按比例降低，可叠加）
    let slowStacks = 0;
    for (const e of G.enemies) if (e.hp > 0 && e.slowAura) slowStacks++;
    const slowFactor = 1 + 0.1 * slowStacks;
    for (const u of G.units) {
      if (u.kind === 'char') continue;   // 待激活将字（赵/云…碎片）：静默，不参战、不触发攻击
      u.cd -= dt;
      if (u.cd <= 0) {
        const t = nearestEnemy(u.x, u.y);
        if (t) { u.cd = u.cd0 * slowFactor / Math.max(0.1, G.atkSpeedMul || 1); attack(u, t); }
      }
    }
    // 敌人移动（严格沿 LANE 路径格子行走，不穿墙）
    const sp = CFG.SPEED_MUL;
    for (const e of G.enemies) {
      if (e.idx >= e.lane.length) continue;
      const [c, r] = e.lane[e.idx];   // 路径点是 [col, row]，与 cellPx(c, r) 对齐
      const [tx, ty] = cellPx(c, r);
      const dx = tx - e.x, dy = ty - e.y, dist = Math.hypot(dx, dy);
      const step = e.speed * CELL * sp * dt * 1.6 * (G.buffs.mud ? 0.9 : 1);
      if (dist <= step) { e.x = tx; e.y = ty; e.idx++; }
      else { e.x += dx / dist * step; e.y += dy / dist * step; }
      // 到达路径终点 → 突入阿斗
      if (e.idx >= e.lane.length) {
        if (G.buffs.meteor) {                     // 陨石：敌人接近阿斗即被消灭
          grantKill(e); ZYJ.ui && ZYJ.ui.log('陨石落下！' + e.gly + ' 被轰碎');
        } else {
          let hit = e.dmg;
          if (e.boss && e.name === '夏侯惇' && e.hp < e.maxhp * 0.4) hit *= 1.6;   // 残血狂暴：撞伤 +60%
          G.adouHp -= hit;
          if (e.boss) ZYJ.ui && ZYJ.ui.log('Boss 突入！-' + Math.round(hit));
          else ZYJ.ui && ZYJ.ui.log(e.gly + ' 突入「斗」-' + Math.round(hit));
        }
        e.hp = 0;
      }
    }
    G.enemies = G.enemies.filter(e => e.hp > 0);
    // 子弹结算
    for (const b of G.bullets) {
      const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy); const bs = 420 * dt;
      if (d <= bs) {
        b.x = b.tx; b.y = b.ty;
        if (b.t && b.t.hp > 0) { b.t.hp -= b.dmg; if (b.t.hp <= 0) grantKill(b.t); }
        b.dead = true;
      } else { b.x += dx / d * bs; b.y += dy / d * bs; }
    }
    G.bullets = G.bullets.filter(b => !b.dead);
    // 攻击特效推进与回收（短命、半透明，不遮挡画面）
    for (const f of G.fx) f.t += dt;
    G.fx = G.fx.filter(f => f.t < f.dur);
    // 主 / 无尽 失败判定（PVP 不走这里，交由服务器裁定，见下）
    if (G.mode !== 'pvp' && G.adouHp <= 0 && !G.over) { G.adouHp = 0; G.over = true; G.isBattle = false; lose(); }
    // PVP：我方阿斗破 → 交由服务器判定胜负（对手将获胜），本地只停模拟、等 report 回包；不触发主模式失败界面/商店
    if (G.mode === 'pvp' && G.adouHp <= 0 && !G.over) {
      G.adouHp = 0; G.over = true; G.isBattle = false;
      ZYJ.ui && ZYJ.ui.log('阿斗被破，等待服务器裁定胜负…');
    }
  }
  function lose() {
    G.over = true; G.isBattle = false;
    if (G.mode === 'endless') {
      endlessBest = Math.max(endlessBest, G.wave); saveProgress();
      ZYJ.api && ZYJ.api.submitScore && ZYJ.api.submitScore({ mode: 'endless', score: G.wave });
      ZYJ.ui && ZYJ.ui.onEndlessEnd && ZYJ.ui.onEndlessEnd(G.wave);
      return;
    }
    ZYJ.ui && ZYJ.ui.onLose && ZYJ.ui.onLose();
  }
  function pvpWin() {
    G.over = true; G.isBattle = false;
    ZYJ.api && ZYJ.api.submitScore && ZYJ.api.submitScore({ mode: 'pvp', score: 1 });
    ZYJ.ui && ZYJ.ui.onPvpWin && ZYJ.ui.onPvpWin();
  }

  // 构建 PVP 统一波次时间表：双方共用，按 startAt 后经过的秒数投放，保证同步、同波、同血量
  function buildPvpSchedule() {
    const sched = [];
    let t = CFG.FIRST_DELAY;
    for (let i = 0; i < WAVES.length; i++) {
      const w = WAVES[i];
      const wave1 = i + 1;   // 1-based 波次，用于血量指数增长
      for (const n of w) { sched.push({ t: t, name: n, wave: wave1 }); t += CFG.SPAWN_INTERVAL; }
      t += CFG.WAVE_GAP;
    }
    return sched;
  }

  // 启动一局 PVP（由 ui 在房间匹配成功后调用）
  function startPvp(opts) {
    reset('pvp');
    G.mode = 'pvp';
    G.pvpCode = opts.code;
    G.pvpSeat = opts.seat;
    G.pvpToken = opts.token;
    G.pvpOppName = opts.oppName || '对手';
    // 用服务器时间校正本机时钟偏差，使双端开战时刻一致
    const serverNow = opts.serverTime || Date.now();
    G.pvpStartAt = opts.startAt + (serverNow - Date.now());
    G.pvpStarted = false;
    G.pvpCursor = 0;
    G.pvpFinished = false;
    G.pvpEnded = false;
    G.pvpSchedule = buildPvpSchedule();
    G.totalWaves = G.pvpSchedule.length;     // 仅用于 HUD 波次计数显示
    G.oppAdouHp = G.oppAdouMax;
    G.startDelay = Math.max(0, (G.pvpStartAt - Date.now()) / 1000);
    ZYJ.ui && ZYJ.ui.log('房间就绪：' + opts.code + '｜对手【' + G.pvpOppName + '】｜倒计时后统一开战');
    // 【PVP】对局开始即把开局手牌作为 draw 结果广播（含随机，必须发结果）
    if (ZYJ.net && ZYJ.net.isActive && ZYJ.net.isActive()) {
      ZYJ.net.op('draw', { cards: hand.filter(c => c.kind === 'char').map(c => c.ch) });
    }
  }

  // PVP 结算（由 ui 依据服务器返回调用：win=true 我方胜）
  function pvpEnd(win) {
    if (G.pvpEnded) return;
    G.pvpEnded = true;
    G.over = true; G.isBattle = false;
    ZYJ.ui && ZYJ.ui.onPvpEnd && ZYJ.ui.onPvpEnd(win);
  }

  /* ============ 神秘商人（对战结束后出现，购买今天一整天生效） ============ */
  function consumeStash(name) { if (dayState.stash[name]) { dayState.stash[name]--; if (dayState.stash[name] <= 0) delete dayState.stash[name]; saveDayState(); } }
  function buyMerchant(id) {
    const it = MERCHANT_ITEMS.find(x => x.id === id);
    if (!it) return { ok: false, msg: '无此道具' };
    if (officeCoin < it.price) return { ok: false, msg: '战利券不足' };
    officeCoin -= it.price; saveOfficeCoin();
    const db = dayState.buffs;
    switch (it.id) {
      case 'xumingdan':                          // 续命丹：今日每场 +5 命
        db.lifeBonus = (db.lifeBonus || 0) + 5;
        db.opponentLifeBonus = (db.opponentLifeBonus || 0) + 3;
        G.adouMax += 5; G.adouHp = Math.min(G.adouMax, G.adouHp + 5);
        if (G.mode === 'pvp') { G.oppAdouMax += 3; G.oppAdouHp = Math.min(G.oppAdouMax, G.oppAdouHp + 3); }
        ZYJ.ui && ZYJ.ui.log('续命丹：今日每场我方阿斗 +5 命' + (G.mode === 'pvp' ? '，对方 +3 命' : ''));
        break;
      case 'yanshi': db.meteor = true; G.buffs.meteor = true; ZYJ.ui && ZYJ.ui.log('陨石：今日敌人近斗即被轰碎'); break;
      case 'baozi': dayState.stash['包子'] = (dayState.stash['包子'] || 0) + 1; items.push({ kind: 'item', item: '包子' }); ZYJ.ui && ZYJ.ui.log('购入包子（今日可用）'); break;
      case 'shenbingfu': dayState.stash['神兵符'] = (dayState.stash['神兵符'] || 0) + 1; items.push({ kind: 'item', item: '神兵符' }); ZYJ.ui && ZYJ.ui.log('购入神兵符（今日可用）'); break;
      case 'nongmin': db.peasantLevel = (db.peasantLevel || 0) + 1; G.buffs.peasantLevel = db.peasantLevel; ZYJ.ui && ZYJ.ui.log('农民：今日每场每 20 秒 +1 包子（可叠加升级）'); break;
      case 'nini': db.mud = true; G.buffs.mud = true; ZYJ.ui && ZYJ.ui.log('淤泥：今日全场移速 -10%'); break;
      case 'mojin': db.goldShovel = true; G.buffs.goldShovel = true; ZYJ.ui && ZYJ.ui.log('摸金校尉：今日金铲铲出宝箱'); break;
      case 'zhaoxian': db.zhaoxian = true; G.buffs.zhaoxian = true; ZYJ.ui && ZYJ.ui.log('招贤榜：今日武将刷出概率 ×2'); break;
      case 'shengzhi': db.shengzhi = true; G.buffs.shengzhi = true; ZYJ.ui && ZYJ.ui.log('升职令：今日刷出的兵 5% 直接 2 级'); break;
    }
    saveDayState();
    ZYJ.ui && ZYJ.ui.renderAll();
    return { ok: true, item: it };
  }
  function closeMerchant() { G.merchantPending = false; }

  /* ============ 存档（走 api） ============ */
  function getProgress() { return { levels: progressLevels, endlessBest: endlessBest, codex: Array.from(codexSet) }; }
  function applyProgress(prog) {
    if (!prog) return;
    progressLevels = prog.levels ? Object.assign({}, prog.levels) : {};
    if (typeof prog.endlessBest === 'number') endlessBest = prog.endlessBest;
    codexSet = new Set(prog.codex || []);
  }
  function saveProgress() { ZYJ.api && ZYJ.api.saveProgress(getProgress()); }
  function loadProgress() {
    const prog = (ZYJ.api && ZYJ.api.loadProgress) ? ZYJ.api.loadProgress() : { levels: {}, endlessBest: 0, codex: [] };
    applyProgress(prog);
    return prog;
  }

  /* ============ 对外暴露 ============ */
  return {
    // 只读状态
    get board() { return board; },
    get cores() { return cores; },
    get G() { return G; }, set G(v) { G = v; },
    get hand() { return hand; },
    get items() { return items; },
    get screen() { return screen; }, set screen(v) { screen = v; },
    get paused() { return paused; }, set paused(v) { paused = v; },
    get selHand() { return selHand; }, set selHand(v) { selHand = v; },
    get dragState() { return dragState; }, set dragState(v) { dragState = v; },
    get codexSet() { return codexSet; },
    get endlessBest() { return endlessBest; },
    get ctrlCache() { return ctrlCache; }, set ctrlCache(v) { ctrlCache = v; },
    get boardDrag() { return boardDrag; }, set boardDrag(v) { boardDrag = v; },
    getProgress, loadProgress,
    // 方法
    initBoard, cellPx, cellFromEvent, inBoard, freeCells, countUnits,
    splitHeroToHand, moveHeroFromCell, removeUnitToHand,
    reset, conscript, canMerge, mergeHand, applyToCell, unitAtk, refreshUnitStats, upgradeUnit, attackIntervalSeconds, placeChar, tryPlaceWeapon,
    startWave, queueWave,
    shuffle, spawnEnemy, update, applyItem, buyMerchant, closeMerchant, getDayState, getOfficeCoin, grantOfficeCoin,
    WEAPON_CHARS, buildPvpSchedule, startPvp, pvpEnd,
    cv, ctx
  };
})();
