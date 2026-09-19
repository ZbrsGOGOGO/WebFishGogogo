/*
 * 赵云救阿斗 —— 接口层（前后端桥接）
 * ---------------------------------------------------------------
 * 负责「需要跨会话持久化」的数据：
 *  - 玩家进度（进度 / 无尽纪录 / 图鉴解锁）
 *  - 排行榜（无尽 / PVP 成绩）
 * 优先走后端 REST（/zyjad/api/**），失败时回退到 localStorage，保证离线可玩。
 *
 * 后端契约见 ZyjadController：
 *  - GET  /zyjad/api/progress?playerId=xxx
 *  - POST /zyjad/api/progress        body: {playerId, baozi, levels, endlessBest, codex}
 *  - POST /zyjad/api/leaderboard     body: {playerId, playerName, mode, score}
 *  - GET  /zyjad/api/leaderboard?mode=endless&limit=10
 */
window.ZYJ = window.ZYJ || {};
ZYJ.api = (function () {
  const LOCAL_KEY = 'momo_zhaoyun_progress_' + window.ZYJ_PLAYER_KEY;
  const PLAYER = window.ZYJ_PLAYER_KEY;

  // 内存缓存：以 localStorage 为初始值，后端刷新后覆盖
  let cache = readLocal();

  function readLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) { /* ignore */ }
    return { levels: {}, endlessBest: 0, codex: [] };
  }
  function writeLocal() {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(cache)); } catch (_) { /* ignore */ }
  }

  async function getJSON(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }
  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  /** 拉取服务端存档（后端优先），返回合并后的进度对象 */
  async function refresh() {
    return cache;
  }

  /** 同步读取当前进度（用于初始化） */
  function loadProgress() { return cache; }

  /** 保存进度（合并 + 本地 + 异步上报后端） */
  function saveProgress(prog) {
    if (prog && prog.levels) cache.levels = prog.levels;
    if (prog && typeof prog.endlessBest === 'number') cache.endlessBest = prog.endlessBest;
    if (prog && Array.isArray(prog.codex)) cache.codex = prog.codex;
    writeLocal();
    window.parent.postMessage({ type: 'momo:zhao:progress', player: PLAYER, progress: cache }, location.origin);
  }

  /** 提交成绩到排行榜 */
  function submitScore(payload) {
    window.parent.postMessage({ type: 'momo:zhao:score', player: PLAYER, mode: payload.mode, score: payload.score }, location.origin);
    return Promise.resolve();
  }

  /** 查询排行榜前 N（返回数组） */
  async function topScores(mode, limit) {
    return [];
  }

  /** 拉取游戏数值配置（小兵/武将/武器），用于覆盖内置默认数值；后端无表时回退内置 */
  let _config = null;
  async function loadConfig() {
    _config = null;
    return _config;
  }
  function getConfig() { return _config; }

  // ===== 联机对战房间 =====
  /** 创建房间：成功返回 {code, seat, token, name}；失败返回 {error: '原因'} */
  async function roomCreate(name) {
    try {
      const data = await postJSON(BASE + '/room/create', { name: name || '' });
      if (data && data.data && data.data.code) return data.data;
      return { error: (data && data.msg) || '创建房间失败' };
    } catch (_) { return { error: '无法连接服务器' }; }
  }
  /** 加入房间：成功返回 {code, seat, token, name, startAt}；失败返回 {error: '原因'} */
  async function roomJoin(code, name) {
    try {
      const data = await postJSON(BASE + '/room/join', { code: code, name: name || '' });
      if (data && data.data && data.data.code) return data.data;
      return { error: (data && data.msg) || '加入房间失败' };
    } catch (_) { return { error: '无法连接服务器' }; }
  }
  /** 查询房间状态：返回 {code,status,startAt,winner,seats:[{name,hp,maxHp,alive,finished,ready}],you,serverTime} */
  async function roomState(code, seat, token) {
    try {
      const data = await getJSON(BASE + '/room/state?code=' + encodeURIComponent(code) +
        '&seat=' + seat + '&token=' + encodeURIComponent(token));
      return data && data.data ? data.data : null;
    } catch (_) { return null; }
  }
  /** 上报自身状态：返回 {over,winner,oppName,oppHp,oppMax,oppAlive,startAt,status,serverTime} */
  async function roomReport(p) {
    try {
      const data = await postJSON(BASE + '/room/report', p);
      return data && data.data ? data.data : null;
    } catch (_) { return null; }
  }
  /** 标记准备（双方都准备后服务器统一开战） */
  async function roomReady(code, seat, token) {
    try {
      const data = await postJSON(BASE + '/room/ready', { code: code, seat: seat, token: token });
      return data && data.data ? data.data : null;
    } catch (_) { return null; }
  }

  return { refresh, loadProgress, saveProgress, submitScore, topScores, loadConfig, getConfig,
    roomCreate, roomJoin, roomState, roomReport, roomReady };
})();
