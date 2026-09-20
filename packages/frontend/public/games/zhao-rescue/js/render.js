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
  const CELL = cfg.CELL;                       // LANE 动态获取；COLS/ROWS 运行时同步（跟随地图尺寸）
  let COLS = cfg.COLS, ROWS = cfg.ROWS;
  const UNIT_DEF = cfg.UNIT_DEF, HERO_DEF = cfg.HERO_DEF, HERO_FIRST = cfg.HERO_FIRST;
  const core = ZYJ.core;

  const cv = document.getElementById('cv');
  const ctx = cv ? cv.getContext('2d') : null;

  /* ===== 固定瓦片模块（离屏缓存） ===== */
  const tileCache = {};
  function darkMode() { return document.documentElement.dataset.colorMode === 'dark'; }

  function buildTile(type) {
    const off = document.createElement('canvas');
    off.width = CELL; off.height = CELL;
    const o = off.getContext('2d');
    const dark = darkMode();
    let fill = dark ? '#111827' : '#f3f6fc', stroke = dark ? '#334155' : '#dde5f0';
    if (type === 'path') { fill = dark ? '#12304a' : '#dbeafe'; stroke = dark ? '#24577d' : '#bcd3f5'; }
    else if (type === 'pathOpp') { fill = dark ? '#202938' : '#e8edf6'; stroke = dark ? '#374151' : '#d6deec'; }
    else if (type === 'greenOpp') { fill = dark ? '#151b25' : '#f4f7fc'; stroke = dark ? '#293548' : '#e2e8f1'; }
    else if (type === 'white') { fill = dark ? '#121820' : '#f6f8fb'; stroke = dark ? '#293548' : '#e4e9f1'; }
    else if (type === 'spawn') { fill = dark ? '#475569' : '#93a5c8'; stroke = dark ? '#64748b' : '#7b8fb5'; }
    else if (type === 'stone') { fill = dark ? '#1f3a2a' : '#dcf0dc'; stroke = dark ? '#315b40' : '#c0e0c4'; }
    else if (type === 'core') { fill = dark ? '#10243e' : '#eaf1ff'; stroke = dark ? '#58a6ff' : '#2f6bff'; }

    // 底色 + 边框
    o.fillStyle = fill; o.fillRect(0, 0, CELL, CELL);
    o.strokeStyle = stroke; o.lineWidth = 1; o.strokeRect(0.5, 0.5, CELL - 1, CELL - 1);

    // 可放置指示（蓝色虚线框）：green(己方) / greenOpp(对面)
    if (type === 'green') {
      o.save(); o.setLineDash([4, 3]); o.strokeStyle = dark ? '#58a6ff' : '#7ea6f0'; o.lineWidth = 1.5;
      o.strokeRect(6.5, 6.5, CELL - 13, CELL - 13); o.restore();
    } else if (type === 'greenOpp') {
      o.save(); o.setLineDash([3, 4]); o.strokeStyle = dark ? '#475569' : '#ccd6e6'; o.lineWidth = 1;
      o.strokeRect(8.5, 8.5, CELL - 17, CELL - 17); o.restore();
    }

    // 文字标记
    o.textAlign = 'center';
    if (type === 'stone') { o.fillStyle = dark ? '#86c991' : '#4a7c59'; o.font = '20px "Microsoft YaHei",sans-serif'; o.fillText('草', CELL / 2, CELL / 2 + 7); }
    else if (type === 'spawn') { o.fillStyle = '#ffffff'; o.font = 'bold 17px "Microsoft YaHei",sans-serif'; o.fillText('出', CELL / 2, CELL / 2 + 6); }
    else if (type === 'core') { o.fillStyle = dark ? '#79c0ff' : '#2f6bff'; o.font = 'bold 30px "Microsoft YaHei",sans-serif'; o.fillText('主', CELL / 2, CELL / 2 + 11); }

    return off;
  }

  function getTile(type) {
    const key = (darkMode() ? 'dark:' : 'light:') + type;
    if (!tileCache[key]) tileCache[key] = buildTile(type);
    return tileCache[key];
  }

  function draw() {
    try { drawInner(); } catch (err) { if (window.console) console.error('[zyjad] 渲染异常：', err); }
  }

  function drawInner() {
    const board = core.board, G = core.G;
    if (!ctx || !board || !G) return;
    const dark = darkMode();
    ROWS = cfg.ROWS; COLS = cfg.COLS;           // 跟随地图实际尺寸（如 8×9 → 高 432）
    if (cv.width !== COLS * CELL) cv.width = COLS * CELL;   // 画布尺寸动态适配
    if (cv.height !== ROWS * CELL) cv.height = ROWS * CELL;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.textBaseline = 'alphabetic';

    // 屏幕震动（读取 G.shake，衰减在 core.update 内）：整场抖动增强打击感
    ctx.save();
    if (G.shake > 0) ctx.translate((Math.random() - .5) * G.shake * 2, (Math.random() - .5) * G.shake * 2);

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
          ctx.fillStyle = i < hearts ? '#ef4444' : '#e2e8f0';
          ctx.beginPath(); ctx.arc(hx, y + 9 + i * 9, 3.4, 0, 7); ctx.fill();
        }
      } else if (G.mode === 'pvp' && c === 0 && r === 0) {
        // 对手阿斗（180°旋转后落在地图顶左核心格）实时血量，使“一人一边”两边对称
        const ohRatio = Math.max(0, G.oppAdouHp) / (G.oppAdouMax || G.adouMax), oh = Math.ceil(ohRatio * 5);
        const ohx = x + 8;
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = i < oh ? '#ef4444' : '#e2e8f0';
          ctx.beginPath(); ctx.arc(ohx, y + 9 + i * 9, 3.4, 0, 7); ctx.fill();
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
        ctx.fillStyle = 'rgba(59,130,246,.10)'; ctx.fillRect(rx, ry, rw, rh);       // 蓝框包裹两格
        ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2.5; ctx.strokeRect(rx, ry, rw, rh);
        ctx.fillStyle = '#1d4ed8'; ctx.font = 'bold 26px "Microsoft YaHei",sans-serif'; ctx.textBaseline = 'middle';
        ctx.fillText(u.hero[0], x1 + CELL / 2, y1 + CELL / 2);                       // 左格首字
        ctx.fillText(u.hero[1], x2 + CELL / 2, y2 + CELL / 2);                       // 右格次字
        ctx.fillStyle = '#2563eb'; ctx.font = 'bold 11px sans-serif';
        ctx.fillText(u.hero, (x1 + x2 + CELL) / 2, ry + rh - 4);
        // 重做版：等级 + 能量条 + 大招就绪高亮
        ctx.fillStyle = '#fde047'; ctx.font = 'bold 10px sans-serif';
        ctx.fillText('Lv' + u.level, (x1 + x2 + CELL) / 2, ry + 11);
        const eRatio = u.energyMax ? Math.max(0, Math.min(1, u.energy / u.energyMax)) : 0;
        const ebx = rx + 2, eby = ry + rh + 2, ebw = rw - 4, ebh = 3;
        ctx.fillStyle = '#374151'; ctx.fillRect(ebx, eby, ebw, ebh);
        const ready = (u.level >= 2 && u.energy >= u.energyMax && u.skillCdTimer <= 0);
        ctx.fillStyle = ready ? '#facc15' : '#22c55e'; ctx.fillRect(ebx, eby, ebw * eRatio, ebh);
        if (ready) { ctx.strokeStyle = '#fde047'; ctx.lineWidth = 2; ctx.strokeRect(rx, ry, rw, rh); }
        // 羁绊角标（顶部一行并排，多羁绊取首个颜色描边）
        const bondTags = [];
        if (u.taoyuan) bondTags.push(['结义', '#ec4899']);
        if (u.bonds && u.bonds.has('dangyang')) bondTags.push(['当阳', '#22d3ee']);
        if (u.bonds && u.bonds.has('shenshe')) bondTags.push(['神射', '#f97316']);
        if (u.bonds && u.bonds.has('qishou')) bondTags.push(['骑手', '#a855f7']);
        if (u.bonds && u.bonds.has('wuhu_1')) bondTags.push(['无双', '#f59e0b']);
        else if (u.bonds && u.bonds.has('wuhu_0')) bondTags.push(['五虎', '#f59e0b']);
        if (bondTags.length) {
          ctx.strokeStyle = bondTags[0][1]; ctx.lineWidth = 2; ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);
          let bx = (x1 + x2 + CELL) / 2 - (bondTags.length - 1) * 11;
          for (const [t, col] of bondTags) { ctx.fillStyle = col; ctx.font = 'bold 9px sans-serif'; ctx.fillText(t, bx, ry + 10); bx += 22; }
        }
        ctx.textBaseline = 'alphabetic';
      } else {
        // 该格已被其它单位占据（孤儿单位），跳过绘制，避免“两字重合”
        if (board[u.r][u.c].unit !== u) continue;
        ctx.fillStyle = dark ? 'rgba(22,27,34,.96)' : 'rgba(255,255,255,.95)';
        ctx.fillRect(u.x - CELL * 0.36, u.y - CELL * 0.36, CELL * 0.72, CELL * 0.72);
        ctx.strokeStyle = dark ? '#3b4b61' : '#c9d7f0'; ctx.lineWidth = 1;
        ctx.strokeRect(u.x - CELL * 0.36, u.y - CELL * 0.36, CELL * 0.72, CELL * 0.72);
        ctx.fillStyle = dark ? '#f0f6fc' : '#1f2937'; ctx.font = 'bold 30px "Microsoft YaHei",sans-serif'; ctx.textBaseline = 'middle';
        ctx.fillText(u.card.ch, u.x, u.y - 3); ctx.textBaseline = 'alphabetic';
        if (u.card.level > 1) { ctx.fillStyle = '#dc2626'; ctx.font = 'bold 13px sans-serif'; ctx.fillText(u.card.level, u.x + 15, u.y - 15); }
        ctx.fillStyle = '#6b7280'; ctx.font = '10px sans-serif';
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
        ctx.fillStyle = 'rgba(59,130,246,.10)';
        ctx.beginPath(); ctx.arc(x, y, CELL * 0.4, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(59,130,246,.6)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.3; ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#2563eb'; ctx.font = 'bold 26px "Microsoft YaHei",sans-serif'; ctx.textBaseline = 'middle';
        ctx.fillText(u.ch, x, y - 1); ctx.textBaseline = 'alphabetic';
        // 显示所有可配的次字（支持一字多配，如 黄→忠/盖/祖）；无候选则显示自身
        let mates = HERO_FIRST[u.ch];
        if (!mates || !mates.length) {
          const h = Object.keys(HERO_DEF).find(n => n[0] === u.ch);
          mates = h ? [h[1]] : [u.ch];
        }
        const mateText = mates.slice(0, 3).join('/') + (mates.length > 3 ? '…' : '');
        ctx.fillStyle = '#60a5fa'; ctx.font = '10px sans-serif'; ctx.fillText('待' + mateText, x, y + CELL * 0.34);
      }
    }

    /* —— 敌人（亮红圆+白字+红血条，浅色底上更醒目）—— */
    const paintEnemy = (ex, ey, e) => {
      const rad = e.boss ? CELL * 0.42 : CELL * 0.3;
      ctx.fillStyle = e.boss ? '#dc2626' : '#e0554d';
      ctx.beginPath(); ctx.arc(ex, ey, rad, 0, 7); ctx.fill();
      const label = (e.gly && e.gly.length) ? e.gly : e.name || '';
      const n = label.length;
      let fs = e.boss ? 22 : 19;
      if (n >= 2) fs = e.boss ? 15 : 13;
      if (n >= 4) fs = e.boss ? 11 : 10;
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold ' + fs + 'px "Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, ex, ey + 1); ctx.textBaseline = 'alphabetic';
      const w = e.boss ? 32 : 20, hp = Math.max(0, e.hp / e.maxhp);
      const by = ey - (e.boss ? 24 : 15);
      ctx.fillStyle = '#d1d5db'; ctx.fillRect(ex - w / 2, by, w, 3);
      ctx.fillStyle = '#ef4444'; ctx.fillRect(ex - w / 2, by, w * hp, 3);
      // 控制状态标记（眩晕/减速/灼烧/易伤）
      let badge = '', bc = '#fff';
      if (e.stunT > 0) { badge = '晕'; bc = '#22d3ee'; }
      else if (e.burnT > 0) { badge = '燃'; bc = '#f97316'; }
      else if (e.slowT > 0) { badge = '缓'; bc = '#38bdf8'; }
      else if (e.vulnT > 0) { badge = '伤'; bc = '#a855f7'; }
      if (badge) {
        ctx.beginPath(); ctx.arc(ex + rad, ey - rad, 6, 0, 7); ctx.fillStyle = bc; ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(badge, ex + rad, ey - rad); ctx.textBaseline = 'alphabetic';
      }
      if (e.hitT > 0) {                                    // 受击白闪（打击感）
        ctx.globalAlpha = Math.min(1, e.hitT / 0.12) * 0.85;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(ex, ey, rad, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      }
    };
    for (const e of G.enemies) {
      paintEnemy(e.x, e.y, e);                                                  // 己方这边：敌人冲己方阿斗（下半场）
      if (G.mode === 'pvp') paintEnemy(COLS * CELL - e.x, ROWS * CELL - e.y, e); // 对手这边：镜像敌人冲对手阿斗（上半场）
    }

    /* —— 飞行子弹 / 射箭 —— */
    for (const b of G.bullets) {
      const a = Math.atan2(b.ty - b.y, b.tx - b.x);
      if (b.visual === 'arrow') {                      // 弓兵：一支飞行的箭
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a);
        ctx.strokeStyle = 'rgba(100,116,139,.95)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(6, 0); ctx.stroke();           // 箭杆
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(1, -3); ctx.lineTo(1, 3); ctx.closePath(); ctx.fill(); // 箭尖
        ctx.restore();
      } else {                                         // 其它单体：小光点
        ctx.fillStyle = 'rgba(59,130,246,.9)';
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
        ctx.strokeStyle = 'rgba(59,130,246,' + (0.8 * (1 - p)).toFixed(3) + ')';
        ctx.lineWidth = 3 * (1 - p) + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, 7); ctx.stroke();
      }
    }

    /* —— 打击感：击杀粒子 / 伤害飘字 —— */
    for (const p of G.parts) {
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.dur);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 13px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center';
    for (const f of G.floaters) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / f.dur);
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3;
      ctx.strokeText(f.txt, f.x, f.y);
      ctx.fillStyle = f.color; ctx.fillText(f.txt, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    /* —— 开局倒计时覆盖层（浅色磨砂） —— */
    if (G.startDelay > 0) {
      ctx.fillStyle = dark ? 'rgba(13,17,23,.82)' : 'rgba(248,250,253,.78)'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = dark ? '#f0f6fc' : '#1f2937'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 38px "Microsoft YaHei",sans-serif';
      ctx.fillText('准备 ' + Math.ceil(G.startDelay) + ' 秒', cv.width / 2, cv.height / 2 - 10);
      ctx.font = '15px "Microsoft YaHei",sans-serif'; ctx.fillStyle = dark ? '#8b949e' : '#6b7280';
      ctx.fillText('快布阵！', cv.width / 2, cv.height / 2 + 26);
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();   // 结束震动偏移（PVP 对手副本不参与抖动）
    // PVP：在「对手半场」绘制对方实时重放（行镜像、蓝色调，禁输入）
    if (ZYJ.net && ZYJ.net.replay && ZYJ.net.replay.render) ZYJ.net.replay.render(ctx);
  }

  return { draw };
})();
