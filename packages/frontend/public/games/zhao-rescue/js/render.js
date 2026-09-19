/*
 * 赵云救阿斗 —— 渲染层（仅负责 Canvas 绘制，不修改任何游戏状态）
 * 地形采用「固定瓦片模块」：每种地形预渲染一次到离屏 canvas，绘制时直接盖章。
 *   - 草皮/空地：green(可放置)、greenOpp(对面空地)、white(备用空地)
 *   - 路：path(己方青绿兵道)、pathOpp(对面土黄兵道)
 *   - 障碍/特殊：stone(草地·草障·铲子可开垦)、spawn(出兵口)、core(阿斗核心)
 * 以后要换成真实贴图，只需替换 buildTile() 内部绘制即可，主循环无需改动。
 */
window.ZYJ = window.ZYJ || {};
ZYJ.render = (function () {
  const cfg = ZYJ.config;
  const CELL = cfg.CELL, COLS = cfg.COLS, ROWS = cfg.ROWS; // LANE 动态获取
  const UNIT_DEF = cfg.UNIT_DEF, HERO_DEF = cfg.HERO_DEF, HERO_FIRST = cfg.HERO_FIRST;
  const core = ZYJ.core;

  const cv = document.getElementById('cv');
  const ctx = cv ? cv.getContext('2d') : null;

  /* ===== 固定瓦片模块（离屏缓存） ===== */
  const tileCache = {};

  function buildTile(type) {
    const off = document.createElement('canvas');
    off.width = CELL; off.height = CELL;
    const o = off.getContext('2d');
    let fill = '#efe7d6', stroke = '#cfc7b3';
    if (type === 'path') { fill = '#8ab89a'; stroke = '#6a987a'; }        // 己方兵道：青绿
    else if (type === 'pathOpp') { fill = '#d4b88a'; stroke = '#b49a6a'; } // 对面兵道：土黄/沙色
    else if (type === 'greenOpp') { fill = '#e8dfcc'; stroke = '#c8c0ac'; }
    else if (type === 'white') { fill = '#f4efe2'; stroke = '#cdc3ab'; }
    else if (type === 'spawn') { fill = '#b5713f'; stroke = '#96552b'; }
    else if (type === 'stone') { fill = '#7a8c72'; stroke = '#5e7060'; }
    else if (type === 'core') { fill = '#a8322a'; stroke = '#7d211b'; }

    // 底色 + 边框
    o.fillStyle = fill; o.fillRect(0, 0, CELL, CELL);
    o.strokeStyle = stroke; o.lineWidth = 1; o.strokeRect(0.5, 0.5, CELL - 1, CELL - 1);

    // 可放置指示（金色虚线框）：green(己方) / greenOpp(对面)
    if (type === 'green') {
      o.save(); o.setLineDash([4, 3]); o.strokeStyle = '#c9a24a'; o.lineWidth = 1.5;
      o.strokeRect(6.5, 6.5, CELL - 13, CELL - 13); o.restore();
    } else if (type === 'greenOpp') {
      o.save(); o.setLineDash([3, 4]); o.strokeStyle = '#b9b0a0'; o.lineWidth = 1;
      o.strokeRect(8.5, 8.5, CELL - 17, CELL - 17); o.restore();
    }

    // 文字标记
    o.textAlign = 'center';
    if (type === 'stone') { o.fillStyle = '#4a5a46'; o.font = '20px serif'; o.fillText('草', CELL / 2, CELL / 2 + 7); }
    else if (type === 'spawn') { o.fillStyle = '#f7e6c4'; o.font = 'bold 17px serif'; o.fillText('出', CELL / 2, CELL / 2 + 6); }
    else if (type === 'core') { o.fillStyle = '#f7e6c4'; o.font = 'bold 30px serif'; o.fillText('主', CELL / 2, CELL / 2 + 11); }

    return off;
  }

  function getTile(type) {
    if (!tileCache[type]) tileCache[type] = buildTile(type);
    return tileCache[type];
  }

  function draw() {
    try { drawInner(); } catch (err) { if (window.console) console.error('[zyjad] 渲染异常：', err); }
  }

  function drawInner() {
    const board = core.board, G = core.G;
    if (!ctx || !board || !G) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.textBaseline = 'alphabetic';

    /* —— 地形：逐格盖章固定瓦片模块 —— */
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const b = board[r][c], x = c * CELL, y = r * CELL;
      ctx.drawImage(getTile(b.type), x, y);
    }

    /* —— 阿斗核心心数（红心，动态）—— */
    const hpRatio = Math.max(0, G.adouHp) / G.adouMax, hearts = Math.ceil(hpRatio * 5);
    const lane = cfg.LANE;
    const endC = lane[lane.length - 1];
    for (const [c, r] of core.cores) {
      const x = c * CELL, y = r * CELL;
      // 仅阿斗（终点）画红心血条；核心格文字统一由瓦片画“主”，不再叠加实时“敌”字（避免两字重合）
      if (c === endC[0] && r === endC[1]) {
        const hx = (c < COLS / 2) ? (x + CELL - 8) : (x + 8);
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = i < hearts ? '#e0463a' : '#5a2a26';
          ctx.beginPath(); ctx.arc(hx, y + 9 + i * 9, 3.4, 0, 7); ctx.fill();
        }
      }
    }

    /* —— 单位（白底卡片+深色字）—— */
    ctx.textAlign = 'center';
    for (const u of G.units) {
      if (u.kind === 'char') continue;   // 待激活将字由下方专门循环绘制，避免读 u.card 导致崩溃
      if (u.kind === 'hero') {
        // 仅当该武将的左首字格仍由它自身占据时才绘制：防止被破坏/覆盖后“马”与“弓”等两字重合
        if (board[u.r][u.c].unit !== u) continue;
        const x1 = u.c * CELL, y1 = u.r * CELL, x2 = u.c2 * CELL, y2 = u.r2 * CELL;
        const rx = Math.min(x1, x2) + 2, ry = Math.min(y1, y2) + 2;
        const rw = Math.abs(x2 - x1) + CELL - 4, rh = CELL - 4;
        ctx.fillStyle = 'rgba(217,164,65,.22)'; ctx.fillRect(rx, ry, rw, rh);       // 金框包裹两格
        ctx.strokeStyle = '#d9a441'; ctx.lineWidth = 2.5; ctx.strokeRect(rx, ry, rw, rh);
        ctx.fillStyle = '#9a6b1c'; ctx.font = 'bold 26px "KaiTi",serif'; ctx.textBaseline = 'middle';
        ctx.fillText(u.hero[0], x1 + CELL / 2, y1 + CELL / 2);                       // 左格首字
        ctx.fillText(u.hero[1], x2 + CELL / 2, y2 + CELL / 2);                       // 右格次字
        ctx.fillStyle = '#a8781f'; ctx.font = 'bold 11px sans-serif';
        ctx.fillText(u.hero, (x1 + x2 + CELL) / 2, ry + rh - 4);
        ctx.textBaseline = 'alphabetic';
      } else {
        // 该格已被其它单位占据（孤儿单位），跳过绘制，避免“两字重合”
        if (board[u.r][u.c].unit !== u) continue;
        ctx.fillStyle = 'rgba(245,240,225,.85)';
        ctx.fillRect(u.x - CELL * 0.36, u.y - CELL * 0.36, CELL * 0.72, CELL * 0.72);
        ctx.strokeStyle = 'rgba(160,140,100,.45)'; ctx.lineWidth = 1;
        ctx.strokeRect(u.x - CELL * 0.36, u.y - CELL * 0.36, CELL * 0.72, CELL * 0.72);
        ctx.fillStyle = '#2b2118'; ctx.font = 'bold 30px "KaiTi",serif'; ctx.textBaseline = 'middle';
        ctx.fillText(u.card.ch, u.x, u.y - 3); ctx.textBaseline = 'alphabetic';
        if (u.card.level > 1) { ctx.fillStyle = '#b3402f'; ctx.font = 'bold 13px sans-serif'; ctx.fillText(u.card.level, u.x + 15, u.y - 15); }
        ctx.fillStyle = '#7a6334'; ctx.font = '10px sans-serif';
        const uDef = UNIT_DEF[u.card.ch];                       // 容错：兵种/等级缺失时回退到单位自身 range
        const uRng = uDef && uDef.levels && uDef.levels[u.card.level]
          ? uDef.levels[u.card.level].range : u.range;
        ctx.fillText('攻' + u.atk + '·射' + uRng, u.x, u.y + CELL * 0.34);
      }
    }

    /* —— 待激活将字（金色虚线圆圈）—— */
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const u = board[r][c].unit;
      if (u && u.kind === 'char') {
        const x = c * CELL + CELL / 2, y = r * CELL + CELL / 2;
        ctx.fillStyle = 'rgba(217,164,65,.18)';
        ctx.beginPath(); ctx.arc(x, y, CELL * 0.4, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(217,164,65,.7)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.3; ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#9a6b1c'; ctx.font = 'bold 26px "KaiTi",serif'; ctx.textBaseline = 'middle';
        ctx.fillText(u.ch, x, y - 1); ctx.textBaseline = 'alphabetic';
        // 显示所有可配的次字（支持一字多配，如 黄→忠/盖/祖）；无候选则显示自身
        let mates = HERO_FIRST[u.ch];
        if (!mates || !mates.length) {
          const h = Object.keys(HERO_DEF).find(n => n[0] === u.ch);
          mates = h ? [h[1]] : [u.ch];
        }
        const mateText = mates.slice(0, 3).join('/') + (mates.length > 3 ? '…' : '');
        ctx.fillStyle = '#b58a3a'; ctx.font = '10px sans-serif'; ctx.fillText('待' + mateText, x, y + CELL * 0.34);
      }
    }

    /* —— 敌人（暗红圆+白字+红血条）—— */
    for (const e of G.enemies) {
      const rad = e.boss ? CELL * 0.42 : CELL * 0.3;
      ctx.fillStyle = e.boss ? '#7a1f14' : 'rgba(90,43,35,.85)';
      ctx.beginPath(); ctx.arc(e.x, e.y, rad, 0, 7); ctx.fill();
      // 显示字：Boss 可为多字（如「张宝」）。按字数自适应字号，避免溢出圆圈。
      const label = (e.gly && e.gly.length) ? e.gly : e.name || '';
      const n = label.length;
      let fs = e.boss ? 22 : 19;
      if (n >= 2) fs = e.boss ? 15 : 13;          // 两字及以上缩小
      if (n >= 4) fs = e.boss ? 11 : 10;          // 四字及以上再缩小
      ctx.fillStyle = '#f0e2c8'; ctx.font = 'bold ' + fs + 'px "KaiTi",serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, e.x, e.y + 1); ctx.textBaseline = 'alphabetic';
      const w = e.boss ? 32 : 20, hp = Math.max(0, e.hp / e.maxhp);
      const by = e.y - (e.boss ? 24 : 15);
      ctx.fillStyle = '#000'; ctx.fillRect(e.x - w / 2, by, w, 3);
      ctx.fillStyle = '#e05a4a'; ctx.fillRect(e.x - w / 2, by, w * hp, 3);
    }

    /* —— 飞行子弹 / 射箭 —— */
    for (const b of G.bullets) {
      const a = Math.atan2(b.ty - b.y, b.tx - b.x);
      if (b.visual === 'arrow') {                      // 弓兵：一支飞行的箭
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a);
        ctx.strokeStyle = 'rgba(120,90,40,.9)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(6, 0); ctx.stroke();           // 箭杆
        ctx.fillStyle = 'rgba(180,140,70,.95)';
        ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(1, -3); ctx.lineTo(1, 3); ctx.closePath(); ctx.fill(); // 箭尖
        ctx.restore();
      } else {                                         // 其它单体：小光点
        ctx.fillStyle = 'rgba(255,210,120,.85)';
        ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, 7); ctx.fill();
      }
    }

    /* —— 攻击特效（半透明细线/弧，置于上层，不遮挡核心）—— */
    for (const f of G.fx) {
      const p = f.t / f.dur;                           // 0→1 进度
      if (f.type === 'slash') {                        // 刀：弧形刀光
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.ang);
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.75 * (1 - p)).toFixed(3) + ')';
        ctx.lineWidth = 3 * (1 - p) + 1;
        ctx.beginPath(); ctx.arc(0, 0, CELL * 0.5, -0.7, 0.7); ctx.stroke();
        ctx.restore();
      } else if (f.type === 'pierce') {                // 枪：直线枪刺光痕
        ctx.save();
        const a = Math.atan2(f.ty - f.y, f.tx - f.x);
        ctx.translate(f.x, f.y); ctx.rotate(a);
        const len = Math.hypot(f.tx - f.x, f.ty - f.y);
        const g = ctx.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(1, 'rgba(255,255,255,' + (0.8 * (1 - p)).toFixed(3) + ')');
        ctx.strokeStyle = g; ctx.lineWidth = 4 * (1 - p) + 1;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
        ctx.restore();
      } else if (f.type === 'aoe') {                   // 骑/范围：抡圆扩散圆环
        const rr = f.r * (0.3 + 0.7 * p);
        ctx.strokeStyle = 'rgba(255,180,90,' + (0.8 * (1 - p)).toFixed(3) + ')';
        ctx.lineWidth = 3 * (1 - p) + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, 7); ctx.stroke();
      }
    }

    /* —— 开局倒计时覆盖层 —— */
    if (G.startDelay > 0) {
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 38px "KaiTi",serif';
      ctx.fillText('准备 ' + Math.ceil(G.startDelay) + ' 秒', cv.width / 2, cv.height / 2 - 10);
      ctx.font = '15px "KaiTi",serif'; ctx.fillStyle = '#e6e6e6';
      ctx.fillText('快布阵！', cv.width / 2, cv.height / 2 + 26);
      ctx.textBaseline = 'alphabetic';
    }
    // PVP：在「对手半场」绘制对方实时重放（行镜像、蓝色调，禁输入）
    if (ZYJ.net && ZYJ.net.replay && ZYJ.net.replay.render) ZYJ.net.replay.render(ctx);
  }

  return { draw };
})();
