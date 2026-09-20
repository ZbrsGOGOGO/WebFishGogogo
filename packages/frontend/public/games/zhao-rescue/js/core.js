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
  const CELL = cfg.CELL, TYP = cfg.TYP;
  let COLS = cfg.COLS, ROWS = cfg.ROWS, MAP = cfg.MAP;
  const UNIT_DEF = cfg.UNIT_DEF, HERO_DEF = cfg.HERO_DEF; // LANE 改为动态 getter，不再缓存引用
  // 合成武将统一按「相邻两字拼名 + HERO_DEF 查表」判定，故无需 HERO_FIRST/SECOND
  const WEAPON_CHARS = cfg.WEAPON_CHARS, HERO_CHARS = cfg.HERO_CHARS, ITEM_DEF = cfg.ITEM_DEF;
  const POOL = cfg.POOL, CFG = cfg.CFG, WAVE_DEF = cfg.WAVE_DEF, MAIN = cfg.MAIN, MERCHANT_ITEMS = cfg.MERCHANT_ITEMS, WAVES = cfg.WAVES;
  const WEAPON_ATKSPEED_MUL = cfg.WEAPON_ATKSPEED_MUL || 1;
  // 羁绊（自走棋式阵容联动）：普通羁绊需 members 全在；分阶段羁绊（含 tiers）取已满足 need 的最高 tier。
  // atk/aspd/energyMul 为对成员的乘积增益，shield 为激活瞬间一次性护盾。
  const BONDS = [
    { id: 'taoyuan', name: '桃园结义', color: '#ec4899', members: ['刘备', '关羽', '张飞'], atk: 1.30, aspd: 0.85, energyMul: 1.5, shield: 30,
      desc: '刘关张 攻+30% 攻速+15% 能量回复+50%，并获结义护盾' },
    { id: 'dangyang', name: '当阳桥', color: '#22d3ee', members: ['赵云', '张飞'], atk: 1.25, aspd: 0.85, energyMul: 1.4, shield: 0,
      desc: '赵云+张飞 攻+25% 攻速+15% 能量回复+40%' },
    { id: 'shenshe', name: '神射手', color: '#f97316', members: ['黄忠', '黄盖'], atk: 1.25, aspd: 1.0, energyMul: 1.5, shield: 0,
      desc: '黄忠+黄盖 攻+25% 能量回复+50%' },
    { id: 'qishou', name: '骑手', color: '#a855f7', members: ['赵云', '马超'], atk: 1.20, aspd: 0.85, energyMul: 1.3, shield: 0,
      desc: '赵云+马超 攻+20% 攻速+15% 能量回复+30%' },
    { id: 'wuhu', name: '五虎将', color: '#f59e0b', members: ['赵云', '关羽', '张飞', '马超', '黄忠'],
      tiers: [
        { tier: 0, need: 3, atk: 1.15, aspd: 0.9, energyMul: 1.3, shield: 0, name: '五虎·锋锐', desc: '上阵3名五虎将 攻+15% 攻速+10% 能量回复+30%' },
        { tier: 1, need: 5, atk: 1.40, aspd: 0.8, energyMul: 1.6, shield: 50, name: '五虎·无双', desc: '集齐5名五虎将 攻+40% 攻速+20% 能量回复+60%，并获无双护盾' }
      ] }
  ];

  /* ============ 音效（WebAudio 现场合成，无外部素材；localStorage 记住开关） ============ */
  const sfx = (function () {
    let ac = null;
    let on = true;
    try { on = localStorage.getItem('zyjad_sfx') !== '0'; } catch (_) {}
    function ctxA() {
      if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {} }
      if (ac && ac.state === 'suspended') ac.resume();
      return ac;
    }
    // 简短音：f1→f2 滑频 + 指数衰减
    function tone(f1, f2, dur, type, vol, delay) {
      if (!on) return; const a = ctxA(); if (!a) return;
      const t0 = a.currentTime + (delay || 0);
      const o = a.createOscillator(), g = a.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(f1, t0);
      if (f2 && f2 !== f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t0 + dur);
      g.gain.setValueAtTime(vol || .07, t0);
      g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
      o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + dur + .02);
    }
    // 噪声爆点：命中质感
    function noise(dur, vol) {
      if (!on) return; const a = ctxA(); if (!a) return;
      const n = Math.max(1, Math.floor(a.sampleRate * dur)), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = a.createBufferSource(); s.buffer = buf;
      const g = a.createGain(); g.gain.value = vol || .08;
      s.connect(g); g.connect(a.destination); s.start();
    }
    return {
      shoot() { tone(880, 620, .06, 'square', .04); },                                            // 出手
      hit() { noise(.05, .08); },                                                                  // 命中
      kill() { tone(300, 80, .14, 'triangle', .11); noise(.06, .05); },                            // 击杀小兵
      bossKill() { tone(220, 50, .4, 'sawtooth', .13); tone(110, 35, .55, 'triangle', .11, .06); },// Boss 击杀
      hurt() { tone(180, 60, .28, 'sawtooth', .11); },                                             // 阿斗被突入
      place() { tone(520, 520, .05, 'sine', .08); },                                               // 落子
      merge() { tone(660, 990, .1, 'sine', .08); tone(990, 1320, .12, 'sine', .06, .07); },        // 合成
      coin() { tone(980, 1470, .09, 'sine', .06); },                                               // 抽卡
      toggle() { on = !on; try { localStorage.setItem('zyjad_sfx', on ? '1' : '0'); } catch (_) {} return on; },
      isOn() { return on; }
    };
  })();

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
    ROWS = cfg.ROWS; COLS = cfg.COLS; MAP = cfg.MAP;
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
      units: [], enemies: [], bullets: [], fx: [], floaters: [], parts: [], spawnQueue: [], spawnTimer: 0, shake: 0, hitstop: 0,
      deck: {},   // 消耗型牌库：ch -> 本局剩余张数（抽走即减，不回池）
      lucky: {},  // 本局幸运字（抽中概率 ×2），开局随机 ≤3 个武将字
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
    initBoard();
    freshGame();
    G.mode = mode; G.chapter = ci || 0; G.level = li || 0;
    G.autoWave = false; G.nextWaveTimer = 0; G.pvpDrawTimer = 0;
    G.totalWaves = mode === 'main' ? MAIN[G.chapter][G.level].length
      : (mode === 'endless' ? 9999 : 1);
    G.startDelay = CFG.FIRST_DELAY;   // 所有模式统一：开局倒计时后才出兵
    hand = []; items = [];
    dayState = loadDayState(); applyDayBuffs();   // 先应用招贤榜等日状态
    buildDeck();                                // 再建消耗型牌库（招贤榜金色字已扩容）
    rollLucky();                                // 随机选定本局幸运字（≤3 个武将字，概率×2）
    conscript(true);                            // 开局首抽（免费）
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
  // 开局随机摇号：从武将字中抽 1~3 个作为本局「幸运字」，其抽中概率 ×2（每局不同）
  function rollLucky() {
    G.lucky = {};
    const pool = Array.from(HERO_CHARS);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    const n = 1 + Math.floor(Math.random() * 3); // 1~3 个
    for (let i = 0; i < n && i < pool.length; i++) G.lucky[pool[i]] = true;
  }
  // 本局各字抽中概率（含幸运字 ×2），供「营」面板展示
  function charProbs() {
    const chars = Object.keys(G.deck).filter(c => (G.deck[c] || 0) > 0);
    let tot = 0; const arr = [];
    for (const c of chars) {
      const p = POOL.find(x => x.ch === c); let w = p ? p.w : 1;
      if (G.lucky && G.lucky[c]) w *= 2;
      tot += w; arr.push({ ch: c, remain: G.deck[c] || 0, weight: w, lucky: !!(G.lucky && G.lucky[c]) });
    }
    for (const a of arr) a.prob = tot ? (a.weight / tot * 100) : 0;
    return arr;
  }
  // 当前羁绊状态（供「营」面板展示：在场人数 / 是否激活 / 当前阶效果）
  function bondStatus() {
    const onField = new Set();
    for (const u of G.units) if (u.kind === 'hero' && u.side !== 'enemy') onField.add(u.hero);
    return BONDS.map(b => {
      const on = b.members.filter(n => onField.has(n)).length;
      let eff = null;
      if (b.tiers) {
        for (const t of b.tiers) if (on >= t.need) eff = t;
      } else if (on >= b.members.length) eff = b;
      return { id: b.id, name: b.name, color: b.color, members: b.members, on, total: b.members.length, eff };
    });
  }
  // 从剩余牌库按权重选一个字（不消耗），字库空返回 null
  function randomChar() {
    const chars = Object.keys(G.deck).filter(c => (G.deck[c] || 0) > 0);
    if (!chars.length) return null;
    let tot = 0; const wm = {};
    for (const c of chars) { const p = POOL.find(x => x.ch === c); let w = p ? p.w : 1; if (G.lucky && G.lucky[c]) w *= 2; wm[c] = w; tot += w; }
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

  function conscript(free) {
    if (G.over) return;
    const cost = CFG.CONSCRIPT_COST + (CFG.CONSCRIPT_STEP || 0) * G.conscriptTimes;  // 首次基础，之后每次 +STEP
    if (G.baozi < cost) { ZYJ.ui && ZYJ.ui.toast('包子不足（需 ' + cost + '）'); return; }
    const left = Object.keys(G.deck).reduce((a, c) => a + (G.deck[c] || 0), 0);
    if (left <= 0) { ZYJ.ui && ZYJ.ui.toast('字库已空，无法征兵'); return; }
    if (!free) G.baozi -= cost;          // 首抽免费：开局首抽不扣包子
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
    if (isHero) u.skillDesc = L.skillDesc;
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
  // 保留上游调用名，所有升级统一走同一套“次/秒 → 秒/次”换算。
  function applyLevelStats(u) { return refreshUnitStats(u); }
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
      const gi = G.units.indexOf(b.unit); if (gi >= 0) G.units.splice(gi, 1);
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
    const L = d.levels[1] || d.levels[d.maxLevel];
    const hero = { kind: 'hero', hero: p.name, level: 1, exp: 0, energy: 0,
      energyMax: d.energyMax || 0, skillCd: d.skillCd || 0, skillCdTimer: 0,
      skillName: d.skillName, skillDesc: L.skillDesc, weaponType: d.weaponType, basicFeature: d.basicFeature,
      armorPierce: (p.name === '黄盖' ? 0.20 : 0),   // 黄盖 Lv1 即自带 20% 破甲被动
      buffs: {},                                     // 大招产生的自我/增益状态容器
      r: p.fr, c: p.fc, r2: p.sr, c2: p.sc, cd: 0, cd0: 1, atk: 0, range: 0, atkType: L.atkType, x: 0, y: 0 };
    refreshUnitStats(hero);
    const [x1, y1] = cellPx(p.fc, p.fr), [x2, y2] = cellPx(p.sc, p.sr);
    hero.x = (x1 + x2) / 2; hero.y = (y1 + y2) / 2;
    board[p.fr][p.fc].unit = hero; board[p.sr][p.sc].unit = hero; G.units.push(hero);
    // 【PVP】武将合成后广播 hero（左首字格 r/c + 双字）
    if (ZYJ.net && ZYJ.net.isActive && ZYJ.net.isActive()) ZYJ.net.op('hero', { first: p.name[0], second: p.name[1], r: p.fr, c: p.fc });
    codexSet.add('hero:' + p.name);
    sfx.merge(); addParts(hero.x, hero.y, '#3b82f6', 12, 120);
    ZYJ.ui && ZYJ.ui.log('激活武将 ' + p.name + '！' + d.skillName);
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
    // 武器单位是 kind:'unit'，真实字段在 u.card 上；待激活将字是 kind:'char'，字段在 u 上
    const ch = u.card ? u.card.ch : u.ch;
    const lv = u.card ? u.card.level : (u.level || 1);
    hand.push({ kind: 'char', ch: ch, level: lv });
    cell.unit = null;
    const i = G.units.indexOf(u); if (i >= 0) G.units.splice(i, 1);
    ZYJ.ui && ZYJ.ui.log('撤回 ' + (u.card ? u.card.ch : u.ch) + ' ' + lv + '级 → 备战席');
    return true;
  }
  // 拖动武将的「单个字」：拆解武将，只移动被抓取的那一个字，另一字留在原位，合成随即取消。
  // 目标单格可用（空绿且非另一字原位）→ 被抓字移过去；否则（被占用/非绿/就是另一字原位）→ 被抓字留在原抓取格，仍拆散。
  function moveOneHeroChar(sr, sc, nr, nc) {
    const u = board[sr][sc].unit; if (!u || u.kind !== 'hero') return false;
    if (!inBoard(nc, nr)) return false;
    const grabbedIsLeft = (sr === u.r && sc === u.c);          // 被抓的是左首字还是右次字
    const grabbedGlyph = grabbedIsLeft ? u.hero[0] : u.hero[1];
    const otherR = grabbedIsLeft ? u.r2 : u.r;
    const otherC = grabbedIsLeft ? u.c2 : u.c;
    const otherGlyph = grabbedIsLeft ? u.hero[1] : u.hero[0];
    const targetFree = !board[nr][nc].unit && board[nr][nc].type === 'green' && !(nr === otherR && nc === otherC);
    detachHero(sr, sc);                                         // 拆掉武将，两格清空、移出战斗列表
    const mk = (ch, r, c) => { const o = { kind: 'char', ch, level: 1, r, c, x: 0, y: 0 };
      const [x, y] = cellPx(c, r); o.x = x; o.y = y; board[r][c].unit = o; G.units.push(o); return o; };
    mk(otherGlyph, otherR, otherC);                             // 另一字留在原位
    mk(grabbedGlyph, targetFree ? nr : sr, targetFree ? nc : sc); // 被抓字：可用则移过去，否则留原抓取格
    ZYJ.ui && ZYJ.ui.log('拆解 ' + u.hero + '：移动「' + grabbedGlyph + '」');
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
          sfx.merge(); addParts(b.unit.x, b.unit.y, '#3b82f6', 10, 110);
          // 【PVP】神兵符升级武器，广播 item 让对方同步等级
          if (ZYJ.net && ZYJ.net.isActive && ZYJ.net.isActive()) ZYJ.net.op('item', { item: '神兵符', r: r, c: c });
          const i = items.indexOf(card); if (i >= 0) items.splice(i, 1); consumeStash('神兵符');
          ZYJ.ui && ZYJ.ui.log('神兵符：单位升到 ' + b.unit.card.level + ' 级'); return 'consumed';
        }
        if (b.unit && b.unit.kind === 'hero') {
          const def = HERO_DEF[b.unit.hero], max = def.maxLevel || 5;
          if (b.unit.level >= max) { ZYJ.ui && ZYJ.ui.toast(b.unit.hero + ' 已达满级 ' + max); return null; }
          upgradeUnit(b.unit);
          sfx.merge(); G.shake = 4; addParts(b.unit.x, b.unit.y, '#3b82f6', 12, 120);
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
          detachHero(r, c);
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
          sfx.merge(); addParts(b.unit.x, b.unit.y, '#3b82f6', 10, 110);
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
        const gi = G.units.indexOf(b.unit); if (gi >= 0) G.units.splice(gi, 1);
        b.unit = null; placeChar(r, c, ch, card.level); codexSet.add('unit:' + ch);
        hand.push(back);
        ZYJ.ui && ZYJ.ui.log('替换：' + ch + ' ↔ 将字' + back.ch + '（将字已回备战席）');
        return 'consumed';
      }
      if (b.unit.kind === 'hero') {                          // 武将 → 拆回两枚将字回备战席，再放武器
        const hero = b.unit, hName = hero.hero;
        detachHero(r, c);
        placeChar(r, c, ch, card.level); codexSet.add('unit:' + ch);
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
      slowAura: (name === '淤泥怪'),                // 淤泥怪：经过时减速我方棋子攻速
      stunT: 0, slowT: 0, slowFactor: 1, burnT: 0, burnDps: 0, vulnT: 0  // 控制/持续状态（眩晕/减速/灼烧/易伤）
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
  /* ============ 打击反馈：白闪 / 飘字 / 粒子 / 震动 / 顿帧 / 音效 ============ */
  function addFloater(x, y, txt, color) { if (G.floaters.length < 60) G.floaters.push({ x: x, y: y, txt: txt, color: color || '#ef4444', t: 0, dur: 0.7 }); }
  function addParts(x, y, color, n, spd) {
    for (let i = 0; i < (n || 10); i++) {
      const a = Math.random() * 6.283, v = (spd || 110) * (0.35 + Math.random() * 0.85);
      G.parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, r: 1.5 + Math.random() * 2.5, color: color || '#ef4444', t: 0, dur: 0.45 + Math.random() * 0.3 });
    }
  }
  // 敌人身上的控制/持续状态容器在 spawn 时初始化（见 spawnEnemy）
  function enemiesInRadius(x, y, r) { return G.enemies.filter(e => e.hp > 0 && Math.hypot(e.x - x, e.y - y) <= r); }
  function applyStun(e, dur) { if (e) e.stunT = Math.max(e.stunT || 0, dur); }
  function applySlow(e, factor, dur) { if (!e) return; e.slowT = Math.max(e.slowT || 0, dur); e.slowFactor = Math.min(e.slowFactor || 1, factor); }
  function applyBurn(e, dps, dur) { if (!e) return; e.burnT = Math.max(e.burnT || 0, dur); e.burnDps = Math.max(e.burnDps || 0, dps); }
  function applyVuln(e, dur) { if (e) e.vulnT = Math.max(e.vulnT || 0, dur); }
  // 统一扣血入口：受击白闪 + 伤害飘字 + 死亡粒子/震动/顿帧/音效（所有伤害都走这里，保证手感一致）
  function hitEnemy(e, dmg, src) {
    if (!e || e.hp <= 0) return;
    if (e.vulnT > 0) dmg *= 1.2;                 // 易伤（黄忠大招）：受到所有伤害 +20%
    if (src && src.kind === 'hero') e.killer = src; // 记录最后一击武将（用于击杀经验，助攻不加）
    e.hp -= dmg;
    e.hitT = 0.12;
    addFloater(e.x + (Math.random() * 10 - 5), e.y - 16, '-' + Math.max(1, Math.round(dmg)), e.boss ? '#d97706' : '#ef4444');
    sfx.hit();
    if (e.boss) G.shake = Math.max(G.shake, 3);
    if (e.hp <= 0) {
      addParts(e.x, e.y, e.boss ? '#f59e0b' : '#ef4444', e.boss ? 18 : 10, e.boss ? 160 : 110);
      if (e.boss) { G.shake = 9; G.hitstop = 0.09; sfx.bossKill(); }
      else { G.shake = Math.max(G.shake, 4); sfx.kill(); }
      grantKill(e);
    }
  }
  // 打击感元素推进（受击白闪衰减 / 震动衰减 / 飘字上浮 / 粒子物理）
  function stepJuice(dt) {
    for (const e of G.enemies) if (e.hitT > 0) e.hitT -= dt;
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 26);
    for (const f of G.floaters) { f.t += dt; f.y -= 30 * dt; }
    G.floaters = G.floaters.filter(f => f.t < f.dur);
    for (const p of G.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 170 * dt; }
    G.parts = G.parts.filter(p => p.t < p.dur);
  }
  function grantKill(e) {
    if (e.rewarded) return; e.rewarded = true;
    // boss 判定：自身标志 或 已知 BOSS 名称(WAVE_DEF 里的 boss)，双保险
    const isBoss = e.boss || (WAVE_DEF[e.name] && WAVE_DEF[e.name].boss);
    const reward = isBoss ? (CFG.KILL_REWARD_BOSS || 40) : (CFG.KILL_REWARD_MOB || 1);
    G.baozi += reward;
    ZYJ.ui && ZYJ.ui.log((isBoss ? 'BOSS ' : '') + e.gly + ' 被斩！+' + reward + ' 包子');
    if (isBoss) G.bossKilled++;
    // 击杀经验（仅最后一击武将获得，助攻不加）—— 重做版经验升级
    if (e.killer && e.killer.kind === 'hero') gainHeroExp(e.killer, isBoss ? (CFG.EXP_BOSS || 10) : (CFG.EXP_MOB || 1));
  }
  // 武将经验与升级：属性 = Lv1基础 × 分级倍率（HERO_MUL），技能随等级强化
  function gainHeroExp(hero, amt) {
    const def = HERO_DEF[hero.hero]; if (!def) return;
    hero.exp += amt;
    while (hero.level < (def.maxLevel || 5)) {
      const need = CFG.EXP_TO_REACH[hero.level + 1];
      if (need == null || hero.exp < need) break;
      hero.level++;
      applyLevelStats(hero);
      ZYJ.ui && ZYJ.ui.log(hero.hero + ' 升到 ' + hero.level + ' 级！' + (hero.skillDesc || ''));
      sfx.merge(); addParts(hero.x, hero.y, '#22c55e', 12, 120);
    }
  }
  // 在半径内对敌人造成伤害并可附加控制/持续效果（大招通用伤害入口）
  function heroAoe(x, y, r, dmg, opts) {
    opts = opts || {};
    for (const e of enemiesInRadius(x, y, r)) {
      hitEnemy(e, dmg, opts.src);
      if (opts.stun) applyStun(e, opts.stun);
      if (opts.slow) applySlow(e, (opts.slowFactor != null ? opts.slowFactor : 0.6), opts.slow);
      if (opts.burn) applyBurn(e, opts.burnDps || 5, opts.burn);
      if (opts.vuln) applyVuln(e, opts.vuln);
    }
  }
  // 击退后按敌人自身路径点重置坐标
  function repositionEnemy(e) {
    if (!e || !e.lane || e.idx >= e.lane.length) return;
    const [c, r] = e.lane[e.idx]; const [x, y] = cellPx(c, r); e.x = x; e.y = y;
  }
  // 武将大招：能量满且不在 CD → 释放（触发见 update）。按武将名分发各自效果（忠实还原设计稿）。
  function castHeroSkill(u) {
    const lv = u.level, a = u.atk;
    ZYJ.ui && ZYJ.ui.log(u.hero + ' 释放【' + u.skillName + '】！');
    sfx.merge(); addParts(u.x, u.y, '#fde047', 18, 150);
    const fwd = (u.side === 'ally' ? 1 : -1);  // 敌方在英雄前方（敌道推进方向）
    switch (u.hero) {
      case '赵云': {                 // 七进七出：沿前方直线多次贯穿群伤
        const dashes = (lv >= 4) ? 9 : 7;
        const mul = (lv >= 3 ? 1.3 : 1) * (lv >= 4 ? 1.15 : 1);
        const dmg = a * mul, r = CELL * (1.6 + (lv >= 3 ? 0.3 : 0));
        for (let i = 0; i < dashes; i++) {
          const cx = u.x + fwd * CELL * (1 + i * 0.8);
          G.fx.push({ type: 'pierce', x: u.x, y: u.y, tx: cx, ty: u.y, t: 0, dur: 0.2 });
          heroAoe(cx, u.y, r, dmg, { src: u, slow: (lv >= 5 ? 2.0 : 0), slowFactor: 0.8 });
          if (lv >= 5) u.energy = Math.min(u.energyMax, u.energy + 1);  // Lv5 命中回能
        }
        break;
      }
      case '关羽': {                 // 跳斩：向前跳跃撞击 AOE + 击退，随后普攻溅射增益
        const jx = u.x + fwd * CELL * 2;
        G.fx.push({ type: 'aoe', x: jx, y: u.y, r: CELL * 2.2, t: 0, dur: 0.4 });
        heroAoe(jx, u.y, CELL * 2.2, a * 1.6, { src: u, slow: (lv >= 4 ? 0.5 : 0), slowFactor: 0.6 });
        for (const e of enemiesInRadius(jx, u.y, CELL * 2.2)) { e.idx = Math.max(0, e.idx - 2); repositionEnemy(e); }
        u.buffs.splash = { t: (lv >= 4 ? 4 : 3), ratio: (lv >= 3 ? 1.0 : 0.8) };  // 接下来普攻溅射（80%~100%）
        break;
      }
      case '张飞': {                 // 大喝：自身周围大范围咆哮眩晕
        const r = u.range * CELL + (lv >= 3 ? CELL * 0.4 : 0);
        const dur = (lv >= 4 ? 3.2 : (lv >= 3 ? 2.6 : 2.0));
        G.fx.push({ type: 'aoe', x: u.x, y: u.y, r: r, t: 0, dur: 0.4 });
        heroAoe(u.x, u.y, r, a * 1.2, { src: u, stun: dur });
        if (lv >= 5) { u.buffs.range = { t: 5, add: 1 }; for (const e of enemiesInRadius(u.x, u.y, r)) { e.idx = Math.max(0, e.idx - 1); repositionEnemy(e); } }
        break;
      }
      case '黄忠': {                 // 火箭烈：远程大范围 AOE + 灼烧
        const jx = u.x + fwd * CELL * Math.max(3, u.range * 0.6);
        const r = CELL * (2 + (lv >= 3 ? 1 : 0));
        G.fx.push({ type: 'aoe', x: jx, y: u.y, r: r, t: 0, dur: 0.5 });
        heroAoe(jx, u.y, r, a * 1.5 * (lv >= 3 ? 1.25 : 1), { src: u, burn: (lv >= 4 ? 4 : 2), burnDps: 5 * (lv >= 3 ? 1.4 : 1) });
        if (lv >= 5) for (const e of enemiesInRadius(jx, u.y, r)) applyVuln(e, 3);
        break;
      }
      case '刘备': {                 // 圣剑：AOE + 眩晕；高阶团队增益
        const r = CELL * 2.2;
        G.fx.push({ type: 'aoe', x: u.x, y: u.y, r: r, t: 0, dur: 0.5 });
        heroAoe(u.x, u.y, r, a * 1.4, { src: u, stun: (lv >= 3 ? 1.8 : 1.2) });
        if (lv >= 4) G.teamAtk = { t: 4, mul: 1.1 };        // 友军攻击 +10%（4 秒）
        if (lv >= 5) G.teamShield = (G.teamShield || 0) + 30; // 全队护盾吸收
        break;
      }
      case '马超': {                 // 惊雷刺：提升命中眩晕概率 + 范围（一段时间）
        u.buffs.stunChance = { t: (lv >= 4 ? 6 : 4), chance: (lv >= 3 ? 0.48 : 0.30), dur: 1.2 };
        if (lv >= 4) u.buffs.range = { t: 6, add: 0.3 };
        if (lv >= 5) u.buffs.splash = { t: 6, ratio: 0.5 };  // 普攻附带小范围溅射
        break;
      }
      case '张苞': {                 // 破阵刺：命中眩晕概率 + 增伤
        u.buffs.stunChance = { t: 4, chance: (lv >= 3 ? 0.28 : 0.20), dur: 1.0 };
        u.buffs.atkMul = { t: 4, mul: (lv >= 3 ? 1.40 : 1.30) };
        break;
      }
      case '关平': {                 // 小喝：小范围咆哮眩晕
        const r = u.range * CELL + (lv >= 3 ? CELL * 0.2 : 0);
        const dur = (lv >= 3 ? 1.4 : 1.0);
        G.fx.push({ type: 'aoe', x: u.x, y: u.y, r: r, t: 0, dur: 0.35 });
        heroAoe(u.x, u.y, r, a * 1.1, { src: u, stun: dur });
        break;
      }
      case '关兴': {                 // 猛击：命中眩晕概率 + 攻击增益
        u.buffs.stunChance = { t: 4, chance: (lv >= 3 ? 0.28 : 0.20), dur: 1.0 };
        u.buffs.atkMul = { t: 4, mul: (lv >= 3 ? 1.35 : 1.25) };
        break;
      }
      case '张翼': {                 // 小跳斩：向前跳跃撞击 AOE + 击退
        const jx = u.x + fwd * CELL * 1.6;
        const r = CELL * (1.8 + (lv >= 3 ? 0.6 : 0));
        G.fx.push({ type: 'aoe', x: jx, y: u.y, r: r, t: 0, dur: 0.4 });
        heroAoe(jx, u.y, r, a * 1.3, { src: u });
        for (const e of enemiesInRadius(jx, u.y, r)) { e.idx = Math.max(0, e.idx - (lv >= 3 ? 2 : 1)); repositionEnemy(e); }
        break;
      }
      case '黄祖': {                 // 箭雨：远程大范围 AOE
        const jx = u.x + fwd * CELL * Math.max(3, u.range * 0.6);
        const r = CELL * 2.2;
        G.fx.push({ type: 'aoe', x: jx, y: u.y, r: r, t: 0, dur: 0.5 });
        heroAoe(jx, u.y, r, a * (lv >= 3 ? 1.25 : 1.0), { src: u });
        break;
      }
      case '黄盖': {                 // 苦肉焚营：破甲强化 + 范围灼烧
        u.armorPierce = (lv >= 3 ? 0.70 : 0.60);
        u.buffs.armor = { t: 6, v: u.armorPierce };
        u.buffs.range = { t: 6, add: 0.4 };
        const r = u.range * CELL;
        G.fx.push({ type: 'aoe', x: u.x, y: u.y, r: r, t: 0, dur: 0.5 });
        heroAoe(u.x, u.y, r, a * 1.0, { src: u, burn: 3, burnDps: 6 });
        break;
      }
    }
  }
  function attack(u, t) {
    const range = u.range * CELL;
    if (Math.hypot(u.x - t.x, u.y - t.y) > range) return;
    let dmg = u.atk;
    // 武将专属增益（叠加在总伤害上）
    if (u.kind === 'hero') {
      if (u.hero === '赵云') dmg *= 1.3;
      else if (u.hero === '黄忠') { if (t.boss) dmg *= 1.4; if (t.hp < t.maxhp * 0.3) dmg *= 1.5; }
      if (u.buffs && u.buffs.atkMul && u.buffs.atkMul.t > 0) dmg *= u.buffs.atkMul.mul;  // 关兴猛击 / 刘备光环等攻击增益
      if (u.armorPierce) dmg *= (1 + u.armorPierce);                                      // 黄盖破甲被动（含大招强化）
    }
    if (G.teamAtk && G.teamAtk.t > 0) dmg *= G.teamAtk.mul;                                 // 全队攻击增益（刘备 Lv4 圣剑光环）
    if (u.bondAtk && u.bondAtk !== 1) dmg *= u.bondAtk;                                    // 羁绊攻击增益（桃园/当阳桥连乘）
    // 能量回复（武将每次普攻命中）
    if (u.kind === 'hero' && u.energy < u.energyMax) u.energy = Math.min(u.energyMax, u.energy + (CFG.ENERGY_PER_HIT || 1));
    const ch = u.kind === 'hero' ? null : u.card.ch;   // 小兵种类：弓/刀/枪/骑
    const at = u.atkType || 'single';
    // 关羽「跳斩」增益：一段时间内普攻变为溅射（80%~100%）
    const splashBuff = (u.kind === 'hero' && u.buffs && u.buffs.splash && u.buffs.splash.t > 0);
    if (at === 'single') {
      if (ch === '刀') {                               // 刀兵：近战挥刀，即时命中
        hitEnemy(t, dmg, u);
        const ang = Math.atan2(t.y - u.y, t.x - u.x);
        G.fx.push({ type: 'slash', x: t.x, y: t.y, ang: ang, t: 0, dur: 0.18 });
      } else if (ch === '弓') {                        // 弓兵：射箭（飞行子弹）
        sfx.shoot();
        G.bullets.push({ x: u.x, y: u.y, tx: t.x, ty: t.y, dmg: dmg, t: t, visual: 'arrow', src: u });
      } else {                                         // 其它单体（刘备等武将）：飞弹
        sfx.shoot();
        G.bullets.push({ x: u.x, y: u.y, tx: t.x, ty: t.y, dmg: dmg, t: t, visual: 'shot', src: u });
      }
      if (splashBuff) {                                // 关羽跳斩溅射：目标周围附加溅射伤害
        const radius = CELL * 1.4;
        for (const e of enemiesInRadius(t.x, t.y, radius)) if (e !== t) hitEnemy(e, dmg * u.buffs.splash.ratio, u);
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
          hitEnemy(e, ed, u);
        }
      }
    }
    // 命中眩晕（马超惊雷刺 / 张苞破阵刺 大招期间）
    if (u.kind === 'hero' && u.buffs && u.buffs.stunChance && u.buffs.stunChance.t > 0 && Math.random() < u.buffs.stunChance.chance) {
      applyStun(t, u.buffs.stunChance.dur);
    }
  }
  function update(dt) {
    if (!G || G.over) return;
    if (paused) return;

    // Boss 击杀的短顿帧只冻结战场，飘字与粒子继续推进。
    if (G.hitstop > 0) {
      G.hitstop -= dt;
      for (const f of G.fx) f.t += dt;
      G.fx = G.fx.filter(f => f.t < f.dur);
      stepJuice(dt);
      return;
    }

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
    // 全队攻击增益（刘备 Lv4 圣剑光环）
    if (G.teamAtk && G.teamAtk.t > 0) { G.teamAtk.t -= dt; if (G.teamAtk.t <= 0) G.teamAtk = null; }
    // 单位攻击（淤泥怪在场时，我方棋子攻速按比例降低，可叠加）
    let slowStacks = 0;
    for (const e of G.enemies) if (e.hp > 0 && e.slowAura) slowStacks++;
    const slowFactor = 1 + 0.1 * slowStacks;
    // 自走棋式羁绊联动（定义见 BONDS；分阶段羁绊取已满足 need 的最高 tier）
    const onField = new Set();
    for (const u of G.units) if (u.kind === 'hero' && u.side !== 'enemy') onField.add(u.hero);
    G.bondState = G.bondState || {}; G.bondEff = G.bondEff || {};
    for (const b of BONDS) {
      const onCount = b.members.filter(n => onField.has(n)).length;
      let eff = null;
      if (b.tiers) { for (const t of b.tiers) if (onCount >= t.need) eff = t; }   // 取已满足的最高阶
      else if (onCount >= b.members.length) eff = b;
      const prev = G.bondState[b.id];
      const prevTier = prev ? (prev.tier != null ? prev.tier : -1) : null;
      const curTier = eff ? (eff.tier != null ? eff.tier : -1) : null;
      if (eff && prevTier === null) { if (eff.shield) G.teamShield = (G.teamShield || 0) + eff.shield; ZYJ.ui && ZYJ.ui.log('【' + eff.name + '】激活！' + eff.desc); }
      else if (eff && prevTier !== null && prevTier !== curTier) { if (eff.shield) G.teamShield = (G.teamShield || 0) + eff.shield; ZYJ.ui && ZYJ.ui.log('【' + eff.name + '】进阶！' + eff.desc); }
      else if (!eff && prevTier !== null) ZYJ.ui && ZYJ.ui.log('【' + (prev.name || b.name) + '】解除（需 ' + b.members.join('、') + ' 同时在场）');
      G.bondState[b.id] = eff ? { tier: curTier, name: eff.name } : null;
      G.bondEff[b.id] = eff;                                                   // 供英雄聚合增益
    }
    for (const u of G.units) {
      if (u.kind === 'char') continue;   // 待激活将字（赵/云…碎片）：静默，不参战、不触发攻击
      // 武将：能量回复 / 大招触发 / 增益倒计时
      if (u.kind === 'hero') {
        u.bonds = u.bonds || new Set(); u.bonds.clear();
        let _atk = 1, _aspd = 1, _en = 1;                        // 同时参与多羁绊时增益连乘
        for (const b of BONDS) {
          const eff = G.bondEff[b.id];
          if (eff && b.members.includes(u.hero)) {
            u.bonds.add(b.id + (eff.tier != null ? ('_' + eff.tier) : ''));
            _atk *= eff.atk; _aspd *= eff.aspd; _en *= eff.energyMul;
          }
        }
        u.taoyuan = u.bonds.has('taoyuan');                    // 兼容旧标记（粉色角标）
        u.bondAtk = _atk; u.bondAspd = _aspd; u.bondEnergy = _en;
        if (u.skillCdTimer > 0) u.skillCdTimer -= dt;
        u.energy = Math.min(u.energyMax || 0, u.energy + (CFG.ENERGY_REGEN || 0) * dt * (u.bondEnergy || 1));
        // 增益状态倒计时（溅射 / 攻击增益 / 眩晕概率 / 范围 / 破甲）
        for (const k of ['splash', 'atkMul', 'stunChance', 'armor', 'range']) {
          const b = u.buffs[k];
          if (b && b.t > 0) { b.t -= dt; if (b.t <= 0) { b.t = 0; if (k === 'armor') u.armorPierce = (u.hero === '黄盖' ? 0.20 : 0); } }
        }
        // 范围增益（张飞/马超/黄盖 大招期间扩大攻击范围）
        if (u.buffs.range && u.buffs.range.t > 0) u.range = HERO_DEF[u.hero].levels[u.level].range + u.buffs.range.add;
        else u.range = HERO_DEF[u.hero].levels[u.level].range;
        // Lv2+ 解锁技能：能量满且不在 CD → 释放大招
        if (u.level >= 2 && u.energy >= (u.energyMax || 0) && u.skillCdTimer <= 0) {
          castHeroSkill(u); u.energy = 0; u.skillCdTimer = u.skillCd;
        }
      }
      u.cd -= dt;
      if (u.cd <= 0) {
        const t = nearestEnemy(u.x, u.y);
        if (t) {
          const globalSpeed = Math.max(0.1, G.atkSpeedMul || 1);
          u.cd = u.cd0 * slowFactor * (u.bondAspd || 1) / globalSpeed;
          attack(u, t);
        }
      }
    }
    // 敌人移动（严格沿 LANE 路径格子行走，不穿墙）
    for (const e of G.enemies) {
      if (e.hp <= 0) continue;
      // 灼烧 DoT（黄忠/黄盖 大招）
      if (e.burnT > 0) { e.burnT -= dt; hitEnemy(e, (e.burnDps || 0) * dt, null); if (e.hp <= 0) continue; }
      if (e.slowT > 0) e.slowT -= dt;
      if (e.vulnT > 0) e.vulnT -= dt;
      const stunned = (e.stunT > 0);
      if (stunned) { e.stunT -= dt; continue; }   // 眩晕：原地不动（仍可被攻击/持续伤害）
      if (e.idx >= e.lane.length) continue;
      const [c, r] = e.lane[e.idx];   // 路径点是 [col, row]，与 cellPx(c, r) 对齐
      const [tx, ty] = cellPx(c, r);
      const dx = tx - e.x, dy = ty - e.y, dist = Math.hypot(dx, dy);
      const slowMul = (e.slowT > 0) ? (e.slowFactor || 1) : 1;
      const step = (CELL / 3) * dt * slowMul * (G.buffs.mud ? 0.9 : 1); // 三秒一格
      if (dist <= step) { e.x = tx; e.y = ty; e.idx++; }
      else { e.x += dx / dist * step; e.y += dy / dist * step; }
      // 到达路径终点 → 突入阿斗
      if (e.idx >= e.lane.length) {
        if (G.buffs.meteor) {                     // 陨石：敌人接近阿斗即被消灭
          grantKill(e); ZYJ.ui && ZYJ.ui.log('陨石落下！' + e.gly + ' 被轰碎');
        } else {
          let hit = e.dmg;
          if (e.boss && e.name === '夏侯惇' && e.hp < e.maxhp * 0.4) hit *= 1.6;   // 残血狂暴：撞伤 +60%
          if (G.teamShield && G.teamShield > 0) { const ab = Math.min(G.teamShield, hit); G.teamShield -= ab; hit -= ab; }  // 刘备 Lv5 全队护盾吸收
          G.adouHp -= hit;
          G.shake = 8; sfx.hurt();
          addFloater(e.x, e.y - 16, '-' + Math.round(hit), '#dc2626');
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
        if (b.t && b.t.hp > 0) hitEnemy(b.t, b.dmg, b.src);
        b.dead = true;
      } else { b.x += dx / d * bs; b.y += dy / d * bs; }
    }
    G.bullets = G.bullets.filter(b => !b.dead);
    // 攻击特效推进与回收（短命、半透明，不遮挡画面）
    for (const f of G.fx) f.t += dt;
    G.fx = G.fx.filter(f => f.t < f.dur);
    stepJuice(dt);
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
    splitHeroToHand, moveHeroFromCell, moveOneHeroChar, removeUnitToHand, charProbs, bondStatus,
    reset, conscript, canMerge, mergeHand, applyToCell, unitAtk, applyLevelStats, refreshUnitStats, upgradeUnit, attackIntervalSeconds, placeChar, tryPlaceWeapon,
    startWave, queueWave,
    shuffle, spawnEnemy, update, applyItem, buyMerchant, closeMerchant, getDayState, getOfficeCoin, grantOfficeCoin, sfx,
    WEAPON_CHARS, buildPvpSchedule, startPvp, pvpEnd,
    cv, ctx
  };
})();
