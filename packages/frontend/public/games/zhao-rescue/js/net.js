/*
 * 赵云救阿斗 —— PVP 实时通信（前端）
 * ---------------------------------------------------------------
 * 设计：事件驱动的操作重放（operation replay），介于锁步与状态快照之间。
 *   - 发包：每个本地操作成功后调用 ZYJ.net.op(act, data)，把“这一步做了什么”广播给对方。
 *   - 收包：收到 op 后写进“展示用副本”（ZYJ.replay，即 enemyBoard），再照常跑动画，
 *          对方单位就会在你屏幕上「走起来、打起来」，实时可见但禁输入。
 *   - end ：对局结束（闭幕）/ 断线 = quit。
 *
 * 三条契约消息：
 *   start → 进房配对（由 REST 建房/加入完成，这里仅作为 ready ping）
 *   op    → 每一步操作：{type:'op', act:'place'|'hero'|'item'|'draw'|'conscript'|'sync', ...}
 *   end   → 对局结束：{type:'end', reason:'over'|'quit'}
 *
 * 关键点：
 *   ① 随机不能两头算——抽牌（draw）发「结果」（cards 带实际字），战斗因固定值同模拟自然一致。
 *   ② 移动平滑——同代码 + 同 op → 位置一致，不卡；每 0.4s 补一个轻量 sync 校正即可。
 */
window.ZYJ = window.ZYJ || {};

ZYJ.net = (function () {
  const cfg = ZYJ.config;
  const COLS = cfg.COLS, ROWS = cfg.ROWS, CELL = cfg.CELL, MAP = cfg.MAP;
  const core = ZYJ.core;

  let ws = null;
  let room = null;          // {code, seat, token}
  let active = false;       // 是否已连接并启用转发
  let onEndCb = null;       // 收到 end 的回调

  /* ===================== 连接 / 发包 ===================== */
  function wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return proto + '://' + location.host + '/zyjad/ws/pvp'
      + '?code=' + encodeURIComponent(room.code)
      + '&seat=' + room.seat
      + '&token=' + encodeURIComponent(room.token);
  }

  // 进房配对并开始监听对手的操作重放
  function connect(r, endCb) {
    room = r; onEndCb = endCb;
    replay.reset();
    try { ws = new WebSocket(wsUrl()); } catch (e) { return; }
    ws.onopen = function () {
      active = true; send({ type: 'start' });
      // 连上即补发「开局抽牌结果」+ 一次全量同步：确保对方立刻看到你的初始手牌与布阵
      const h = core.hand; if (h) op('draw', { cards: h.filter(c => c.kind === 'char').map(c => c.ch) });
      sync();
    };
    ws.onmessage = function (ev) {
      let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (!m || !m.type) return;
      if (m.type === 'op') replay.apply(m);
      else if (m.type === 'end') { active = false; if (onEndCb) onEndCb(m); }
    };
    ws.onclose = function () { active = false; };
    ws.onerror = function () { active = false; };
  }

  function isActive() { return active && ws && ws.readyState === WebSocket.OPEN; }
  function send(obj) { if (!isActive()) return; try { ws.send(JSON.stringify(obj)); } catch (e) { /* 忽略 */ } }

  // 操作事件：成功执行操作后调用，例如 ZYJ.net.op('place', {unit:'赵云', level:1, r:6, c:3})
  function op(act, data) { const o = { type: 'op', act: act }; if (data) Object.assign(o, data); send(o); }
  // 对局结束广播（我方判定结束时调用）
  function end(reason) { send({ type: 'end', reason: reason || 'over' }); }
  // 轻量位置校正：把当前我方全部单位快照发给对方（兜底，平时 0.4s 一次）
  function sync() {
    const G = core.G; if (!G) return;
    const arr = [];
    for (const u of G.units) {
      if (u.kind === 'char') continue;            // 待激活将字不进入战场，无需同步
      if (u.kind === 'hero') arr.push({ kind: 'hero', ch: u.hero, level: u.level || 1, r: u.r, c: u.c, c2: u.c2 });
      else arr.push({ kind: 'unit', ch: u.card.ch, level: u.card.level, r: u.r, c: u.c });
    }
    op('sync', { units: arr });
  }
  function stop() { active = false; if (ws) { try { ws.close(); } catch (e) {} ws = null; } }

  /* ===================== 展示用副本（enemyBoard） ===================== */
  // 对方的单位只做“展示重放”：在屏幕「上半场」（行镜像）以蓝色调绘制，禁输入。
  const replay = (function () {
    let board = null, units = [], fx = [], show = false;
    let atkTimer = 0;

    function reset() {
      board = []; units = []; fx = []; show = true; atkTimer = 0;
      for (let r = 0; r < ROWS; r++) {
        board.push([]);
        for (let c = 0; c < COLS; c++) board[r].push({ type: MAP[r][c], unit: null });
      }
    }

    function clearCell(r, c, clearPartner) {
      const cell = board[r] && board[r][c]; if (!cell) return;
      const u = cell.unit;
      if (u) {
        const i = units.indexOf(u); if (i >= 0) units.splice(i, 1);
        if (clearPartner && u.kind === 'hero') {
          const pc = (u.c === c) ? u.c2 : u.c, pr = u.r;
          if (board[pr] && board[pr][pc]) board[pr][pc].unit = null;
        }
      }
      cell.unit = null;
    }

    // 写入一个 op 到展示副本
    function apply(op) {
      if (!op || !show) return;
      const a = op.act;
      if (a === 'place') {
        const r = op.r, c = op.c; if (!inB(c, r)) return;
        clearCell(r, c, true);
        const u = { kind: 'unit', card: { ch: op.unit, level: op.level || 1 }, r: r, c: c, x: 0, y: 0 };
        u.x = (c + 0.5) * CELL; u.y = (r + 0.5) * CELL;
        board[r][c].unit = u; units.push(u);
      } else if (a === 'hero') {
        const r = op.r, c = op.c; if (!inB(c, r) || !inB(c + 1, r)) return;
        const name = (op.first || '') + (op.second || '');
        clearCell(r, c, true); clearCell(r, c + 1, true);
        const h = { kind: 'hero', hero: name, level: 1, r: r, c: c, r2: r, c2: c + 1, x: 0, y: 0 };
        h.x = ((c + 0.5) + (c + 1 + 0.5)) / 2 * CELL; h.y = (r + 0.5) * CELL;
        board[r][c].unit = h; board[r][c + 1].unit = h; units.push(h);
      } else if (a === 'item') {
        if (op.item === '铲子') { if (board[op.r] && board[op.r][op.c]) board[op.r][op.c].type = 'green'; }
        else if (op.item === '神兵符') {
          const u = board[op.r] && board[op.r][op.c] && board[op.r][op.c].unit;
          if (u) { if (u.kind === 'hero') u.level = (u.level || 1) + 1; else if (u.card) u.card.level = (u.card.level || 1) + 1; }
        }
        // 包子（阿斗血量）由后端结算体现，重放侧不处理；其它道具仅做视觉特效
        if (typeof op.c === 'number') fx.push({ type: 'aoe', x: (op.c + 0.5) * CELL, y: (op.r + 0.5) * CELL, r: CELL * 1.1, t: 0, dur: 0.4 });
      } else if (a === 'draw' || a === 'conscript') {
        // 抽牌/征兵结果：本地已发 cards（实际字），重放侧无需在对方棋盘落子，忽略
      } else if (a === 'sync') {
        for (const u of units) { if (u.kind === 'hero') { board[u.r][u.c].unit = null; board[u.r][u.c2].unit = null; } else board[u.r][u.c].unit = null; }
        units.length = 0;
        for (const su of (op.units || [])) {
          if (!inB(su.c, su.r)) continue;
          if (su.kind === 'hero') {
            const h = { kind: 'hero', hero: su.ch, level: su.level || 1, r: su.r, c: su.c, r2: su.r, c2: su.c2, x: 0, y: 0 };
            h.x = ((su.c + 0.5) + (su.c2 + 0.5)) / 2 * CELL; h.y = (su.r + 0.5) * CELL;
            board[su.r][su.c].unit = h; board[su.r][su.c2].unit = h; units.push(h);
          } else {
            const u = { kind: 'unit', card: { ch: su.ch, level: su.level || 1 }, r: su.r, c: su.c, x: 0, y: 0 };
            u.x = (su.c + 0.5) * CELL; u.y = (su.r + 0.5) * CELL;
            board[su.r][su.c].unit = u; units.push(u);
          }
        }
      }
    }

    function inB(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }

    // 每帧推进：特效计时 + 周期性发射装饰性攻击（让对方半场“打起来”）
    function tick(dt) {
      if (!show) return;
      for (const f of fx) f.t += dt;
      for (let i = fx.length - 1; i >= 0; i--) if (fx[i].t >= fx[i].dur) fx.splice(i, 1);
      atkTimer += dt;
      if (atkTimer >= 0.7) {
        atkTimer = 0;
        const localEnemies = (core.G && core.G.enemies) || [];
        for (const u of units) {
          if (u.kind === 'hero') continue;
          let best = null, bd = 1e9;
          for (const e of localEnemies) { const d = Math.hypot(e.x - u.x, e.y - u.y); if (d < bd) { bd = d; best = e; } }
          if (best) {
            const ty = ROWS * CELL - best.y;   // 把敌人也镜像到上半场，使箭头方向自然
            fx.push({ type: 'arrow', x: u.x, y: u.y, tx: best.x, ty: ty, t: 0, dur: 0.18 });
          }
        }
      }
    }

    /* —— 渲染：上半场镜像、蓝色调，禁输入 —— */
    function roundRect(c, x, y, w, h, r) {
      c.beginPath(); c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    }
    function drawCard(c, ch, col, mr, hero, lv) {
      const x = col * CELL, y = mr * CELL;
      c.save();
      c.fillStyle = hero ? 'rgba(70,110,200,0.28)' : 'rgba(225,235,255,0.92)';
      c.strokeStyle = hero ? '#3a6ed0' : '#6f8fd0'; c.lineWidth = 2;
      roundRect(c, x + 3, y + 3, CELL - 6, CELL - 6, 6); c.fill(); c.stroke();
      c.fillStyle = hero ? '#fff' : '#2a3f6a';
      c.font = 'bold ' + Math.floor(CELL * 0.5) + 'px serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(ch, x + CELL / 2, y + CELL / 2);
      if (lv && lv > 1) { c.fillStyle = '#c33'; c.font = 'bold 11px sans-serif'; c.fillText('L' + lv, x + CELL - 12, y + 13); }
      c.restore();
    }
    function drawFx(c, f) {
      if (f.type === 'arrow') {
        c.save(); c.strokeStyle = 'rgba(220,90,70,0.9)'; c.lineWidth = 2;
        const p = Math.min(1, f.t / f.dur), x = f.x + (f.tx - f.x) * p, y = f.y + (f.ty - f.y) * p;
        c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(x, y); c.stroke(); c.restore();
      } else if (f.type === 'aoe') {
        c.save(); const p = Math.min(1, f.t / f.dur);
        c.strokeStyle = 'rgba(255,150,40,' + (1 - p).toFixed(3) + ')'; c.lineWidth = 3;
        c.beginPath(); c.arc(f.x, f.y, f.r * (0.4 + 0.6 * p), 0, 7); c.stroke(); c.restore();
      }
    }
    function render(c) {
      if (!show || !c) return;
      // 对手半场底色 + 分隔线
      c.save();
      c.fillStyle = 'rgba(60,90,160,0.06)'; c.fillRect(0, 0, COLS * CELL, (ROWS / 2) * CELL);
      c.strokeStyle = 'rgba(60,90,160,0.55)'; c.setLineDash([6, 4]); c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, (ROWS / 2) * CELL); c.lineTo(COLS * CELL, (ROWS / 2) * CELL); c.stroke(); c.setLineDash([]);
      c.fillStyle = 'rgba(60,90,160,0.85)'; c.font = 'bold 14px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.fillText('对手半场（实时重放）', 8, 16);
      c.restore();
      // 单位（行镜像：对方底排 → 我方顶排）
      for (const u of units) {
        const mr = ROWS - 1 - u.r;
        if (u.kind === 'hero') { drawCard(c, u.hero[0], u.c, mr, true); drawCard(c, u.hero[1], u.c2, mr, true); }
        else drawCard(c, u.card.ch, u.c, mr, false, u.card.level);
      }
      for (const f of fx) drawFx(c, f);
    }

    return { reset, apply, tick, render, set show(v) { show = v; } };
  })();

  return { connect, op, end, sync, stop, isActive, replay };
})();
