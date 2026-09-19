/*
 * 赵云救阿斗 —— UI 层（DOM 渲染 + 输入交互）
 * 负责：屏幕切换、HUD/手牌/道具/控件同步、拖拽落子、菜单入口、结算浮层。
 * 所有游戏状态都来自 ZYJ.core；不直接改规则，只把输入转交给 core。
 */
window.ZYJ = window.ZYJ || {};
ZYJ.ui = (function () {
  const cfg = ZYJ.config;
  const CFG = cfg.CFG, UNIT_DEF = cfg.UNIT_DEF, HERO_DEF = cfg.HERO_DEF;
  const WEAPON_CHARS = cfg.WEAPON_CHARS;
  const MAIN = cfg.MAIN;
  const core = ZYJ.core;

  const $ = id => document.getElementById(id);

  /* ---------- 基础工具 ---------- */
  function set(id, v) { const el = $(id); if (el) el.textContent = v; }
  function log(t) { const l = $('log'); if (!l) return; const d = document.createElement('div'); d.textContent = t; l.prepend(d); while (l.children.length > 60) l.removeChild(l.lastChild); }
  function toast(t) { const el = $('toast'); if (!el) return; el.textContent = t; el.style.opacity = '1'; clearTimeout(el._t); el._t = setTimeout(() => el.style.opacity = '0', 1200); }
  function showOverlay(t, x) { $('ovTitle').textContent = t; $('ovText').textContent = x; $('overlay').style.display = 'flex'; }

  /* ---------- HUD ---------- */
  function renderHUD() {
    const G = core.G; if (!G) return;
    const b = Math.floor(G.baozi);
    set('rBaozi', b); set('rBaozi2', b);
    set('rAdou', Math.max(0, Math.floor(G.adouHp)));
    const oppRes = $('oppRes');
    if (G.mode === 'pvp') {
      oppRes.style.display = 'flex';
      set('rOpp', Math.max(0, Math.floor(G.oppAdouHp)));
      const oppSmall = oppRes.querySelector('small'); if (oppSmall) oppSmall.textContent = (room.oppName || '敌阿斗');
    } else oppRes.style.display = 'none';
    if (G.mode === 'pvp') set('rWave', (G.pvpCursor || 0) + '/' + (G.totalWaves || 0));
    else set('rWave', G.mode === 'main'
      ? (Math.min(G.wave + 1, MAIN[G.chapter][G.level].length) + '/' + MAIN[G.chapter][G.level].length)
      : (G.wave + 1) + (core.endlessBest ? '（纪录' + core.endlessBest + '）' : ''));
    set('rUnit', G.units.length);
    set('modeName', G.mode === 'main' ? ('主线 ' + ['一', '二', '三'][G.chapter] + '-' + (G.level + 1))
      : G.mode === 'pvp' ? ('PVP · 对 ' + (room.oppName || '对手')) : '巨鹿 · 第' + (G.wave + 1) + '波');
  }

  /* ---------- 手牌 / 道具 ---------- */
  function renderHand() {
    const h = $('hand'); if (!h) return; h.innerHTML = '';
    const hand = core.hand;
    hand.forEach((c, i) => {
      const d = document.createElement('div');
      if (c.kind === 'char') {
        const isW = WEAPON_CHARS.has(c.ch);
        d.className = 'card' + (isW ? ' wp' : ' heroch');
        if (isW) {
          const def = UNIT_DEF[c.ch], L = def.levels[1];
          d.innerHTML = '<div class="gly">' + c.ch + '</div>'
            + '<div class="cap">' + def.role + '</div>'
            + '<div class="stat">射' + L.range + '·攻' + L.atk + '<br>频' + L.cd + 's</div>'
            + (c.level > 1 ? '<div class="lv">' + c.level + '</div>' : '');
        } else {
          d.innerHTML = '<div class="gly">' + c.ch + '</div><div class="cap">武将字</div>';
        }
      } else {
        d.className = 'card item';
        d.innerHTML = '<div class="gly">' + itemGlyph(c.item) + '</div><div class="cap">' + c.item + '</div>';
      }
      d.draggable = true;
      d.ondragstart = ev => {
        ev.dataTransfer.setData('text', JSON.stringify({ from: 'hand', i }));
        d.classList.add('drag');
        // 用纯文字字形做拖拽预览，避免浏览器把卡片 innerHTML 卷成英文乱码
        if (ev.dataTransfer.setDragImage) {
          const g = document.createElement('div');
          g.className = 'dragImg';
          const isW2 = c.kind === 'char' && WEAPON_CHARS.has(c.ch);
          g.textContent = c.kind === 'char' ? c.ch : itemGlyph(c.item);
          g.style.cssText = 'position:fixed;top:-200px;left:-200px;width:54px;height:54px;display:flex;align-items:center;justify-content:center;'
            + 'font-size:26px;font-weight:700;border-radius:8px;color:#3a2410;'
            + 'background:' + (isW2 ? '#e8d6b0' : '#f3e2c0') + ';border:2px solid #8a5a2b;';
          document.body.appendChild(g);
          ev.dataTransfer.setDragImage(g, 27, 27);
          setTimeout(() => g.remove(), 0);
        }
      };
      d.ondragend = () => d.classList.remove('drag');
      d.onclick = () => { core.selHand = (core.selHand === i ? null : i); renderHand(); };
      h.appendChild(d);
    });
    if (hand.length === 0) h.innerHTML = '<div style="opacity:.5;font-size:13px;color:#4a2c12">点下方「征兵」抽字牌 →</div>';
  }
  function itemGlyph(it) { return it === '铲子' ? '🛠' : it === '包子' ? '🍞' : it === '神兵符' ? '🔱' : '📦'; }
  function renderItems() {
    const b = $('items'); if (!b) return; b.innerHTML = '';
    const items = core.items;
    items.forEach((c, i) => {
      const d = document.createElement('div'); d.className = 'card item';
      d.innerHTML = '<div class="gly">' + itemGlyph(c.item) + '</div><div class="cap">' + c.item + '</div>';
      d.draggable = true;
      d.ondragstart = ev => {
        ev.dataTransfer.setData('text', JSON.stringify({ from: 'item', i }));
        if (ev.dataTransfer.setDragImage) {
          const g = document.createElement('div');
          g.textContent = itemGlyph(c.item);
          g.style.cssText = 'position:fixed;top:-200px;left:-200px;width:54px;height:54px;display:flex;align-items:center;justify-content:center;'
            + 'font-size:26px;border-radius:8px;background:#f3e2c0;border:2px solid #8a5a2b;';
          document.body.appendChild(g);
          ev.dataTransfer.setDragImage(g, 27, 27);
          setTimeout(() => g.remove(), 0);
        }
      };
      d.onclick = () => { if (core.applyItem(c)) renderAll(); };
      b.appendChild(d);
    });
    if (items.length === 0) b.innerHTML = '<div style="opacity:.5;font-size:12px;color:#4a2c12">道具（暂无）</div>';
  }

  /* ---------- 神秘商人（对战结束弹出，购买今天一整天生效） ---------- */
  let merchantNext = null;
  let merchantBought = null;   // 本次商店出现已购买的商品（每次出现只能买 1 件）
  function showMerchant(next) {
    merchantNext = (typeof next === 'function') ? next : null;
    const G = core.G; if (!G) return;
    const wrap = $('merchant'); if (!wrap) return;
    const items = cfg.MERCHANT_ITEMS;
    const day = (core.getDayState && core.getDayState()) || { buffs: {}, stash: {} };
    // 每次商店出现：重置「本场已购」标记；发放本玩法战利券（不属于站内办公币）
    merchantBought = null;
    core.grantOfficeCoin(30);
    const owned = it => {
      switch (it.id) {
        case 'yanshi': return day.buffs.meteor;
        case 'nini': return day.buffs.mud;
        case 'mojin': return day.buffs.goldShovel;
        case 'zhaoxian': return day.buffs.zhaoxian;
        case 'shengzhi': return day.buffs.shengzhi;
        case 'xumingdan': return (day.buffs.lifeBonus || 0) > 0;
        case 'nongmin': return (day.buffs.peasantLevel || 0) > 0;
        case 'baozi': return (day.stash['包子'] || 0) > 0;
        case 'shenbingfu': return (day.stash['神兵符'] || 0) > 0;
      }
      return false;
    };
    const draw = () => {
      const coin = core.getOfficeCoin();
      const canBuyMore = !merchantBought;   // 本次出现只能买 1 件
      let html = '<div class="mHead">🛒 神秘商人 <span class="mNote">（道具今天一整天生效 · 本玩法战利券 · 当前 ' + coin + '）</span></div>';
      html += '<div class="mGrid">';
      items.forEach(it => {
        const afford = coin >= it.price && canBuyMore;
        let tag = owned(it) ? '<div class="mOwned">今日已购 ✓</div>'
          : (merchantBought ? '<div class="mOwned">本场已购其他 ✓</div>' : '');
        if (it.id === 'nongmin' && (day.buffs.peasantLevel || 0) > 0) tag = '<div class="mOwned">已购 Lv' + day.buffs.peasantLevel + ' ✓</div>';
        html += '<div class="mCard">'
          + '<div class="mName">' + it.name + '<span class="mRar r-' + it.rarity + '">' + it.rarity + '</span></div>'
          + '<div class="mDesc">' + it.desc + '</div>' + tag
          + '<button class="mBuy"' + (afford ? '' : ' disabled') + ' data-id="' + it.id + '">💰 ' + it.price + '</button>'
          + '</div>';
      });
      html += '</div>';
      if (merchantBought) html += '<div class="mNote" style="margin:6px 0">本场已购 1 件，关闭后今日不可再买</div>';
      html += '<button class="mClose" id="mClose">继续 →</button>';
      wrap.innerHTML = html;
      wrap.querySelectorAll('.mBuy').forEach(btn => {
        btn.onclick = () => {
          const r = core.buyMerchant(btn.getAttribute('data-id'));
          if (!r.ok) { toast(r.msg); return; }
          merchantBought = r.item;   // 锁定：本次出现只能买这一件
          toast('已购入：' + r.item.name + '（今日生效）');
          draw(); renderAll();
        };
      });
      const c = $('mClose'); if (c) c.onclick = closeMerchant;
    };
    draw();
    wrap.style.display = 'flex';
  }
  function closeMerchant() {
    const wrap = $('merchant'); if (wrap) wrap.style.display = 'none';
    core.closeMerchant();
    const f = merchantNext; merchantNext = null; if (f) f();
  }

  /* ---------- 控件状态（每帧同步，修复“买过一次后按钮一直灰”的 bug） ---------- */
  function renderControls() {
    const G = core.G; if (!G) return;
    const need = CFG.CONSCRIPT_COST + (CFG.CONSCRIPT_STEP || 0) * G.conscriptTimes, enough = G.baozi >= need;
    const key = (enough ? '1' : '0') + (core.paused ? '1' : '0') + (G.over ? '1' : '0');
    if (key !== core.ctrlCache) {
      core.ctrlCache = key;
      const btn = $('btnConscript');
      if (btn) {
        btn.disabled = !enough || core.paused || G.over;
        btn.innerHTML = enough
          ? '<span>征 兵</span><span class="cost">🥟 ' + need + '</span>'
          : '<span>包子不足</span><span class="cost">需 🥟 ' + need + '</span>';
      }
      const bp = $('btnPause'); if (bp) bp.textContent = core.paused ? '▶' : '⏸';
    }
  }

  function renderAll() { renderHUD(); renderHand(); renderItems(); renderControls(); if (deckOpen) renderDeckPanel(); }

  /* ---------- 屏幕切换 ---------- */
  function show(s) {
    const ov = $('overlay'); if (ov) ov.style.display = 'none';   // 切屏收起结算浮层，避免遮挡操作
    ['home', 'chapter', 'battle', 'codex', 'room'].forEach(x => { const el = $(x); if (el) el.classList.toggle('on', x === s); });
    core.screen = s;
  }

  /* ---------- 章节 / 关卡 ---------- */
  function enterChapter() {
    const prog = core.loadProgress();
    const levels = prog.levels || {};
    const list = $('chapList'); list.innerHTML = '';
    MAIN.forEach((ch, ci) => {
      const d = document.createElement('div'); d.className = 'chap';
      d.innerHTML = '<h3>第' + ['一', '二', '三'][ci] + '章</h3>';
      const lv = document.createElement('div'); lv.className = 'levels';
      ch.forEach((_, li) => {
        const b = document.createElement('button'); b.className = 'lvbtn';
        const unlocked = (ci === 0 && li === 0) || (levels[ci] !== undefined && li <= levels[ci]);
        const done = levels[ci] !== undefined && li < levels[ci];
        if (!unlocked) b.classList.add('lock');
        if (done) b.classList.add('done');
        b.textContent = '第' + (li + 1) + '关' + (done ? '✓' : '');
        b.onclick = () => {
          if (b.classList.contains('lock')) { alert('未解锁'); return; }
          core.reset('main', ci, li); show('battle'); renderAll();
          log('进入 主线 ' + ['一', '二', '三'][ci] + '-' + (li + 1));
        };
        lv.appendChild(b);
      });
      d.appendChild(lv); list.appendChild(d);
    });
    show('chapter');
  }
  function startEndless() {
    core.reset('endless');
    const G = core.G; G.autoWave = true; G.nextWaveTimer = CFG.FIRST_DELAY;
    show('battle'); renderAll();
    log('无尽模式：自动出兵已开启（' + CFG.FIRST_DELAY + '秒后第一波）。');
  }
  function startPVP() { window.parent.postMessage({ type: 'momo:zhao:navigate', path: '/tower-defense/word-front/rooms' }, location.origin); }
  function openSiteRanking() { window.parent.postMessage({ type: 'momo:zhao:navigate', path: '/tower-defense/word-front/v4' }, location.origin); }

  /* ---------- 联机对战：房间流程 ---------- */
  // room 保存本局连接信息；状态轮询负责「等待对手 / 统一开战」，上报循环负责同步对手血量与胜负
  let room = { code: null, seat: null, token: null, stateTimer: null, reportTimer: null, oppName: null, iReady: false };

  function stopRoomTimers() {
    if (room.stateTimer) { clearInterval(room.stateTimer); room.stateTimer = null; }
    if (room.reportTimer) { clearInterval(room.reportTimer); room.reportTimer = null; }
  }

  function openRoom() {
    stopRoomTimers();
    room = { code: null, seat: null, token: null, stateTimer: null, reportTimer: null, oppName: null, iReady: false };
    const st = $('roomStatus'); if (st) st.textContent = '';
    const big = $('roomCodeBig'); if (big) big.style.display = 'none';
    const rb = $('btnReady'); if (rb) { rb.style.display = 'none'; rb.disabled = false; rb.textContent = '我准备好了'; }
    const rn = $('roomName'); if (rn && !rn.value) rn.value = '玩家' + Math.floor(Math.random() * 900 + 100);
    show('room');
  }

  async function createRoom() {
    const name = ($('roomName').value || '').trim() || ('玩家' + Math.floor(Math.random() * 900 + 100));
    const r = await ZYJ.api.roomCreate(name);
    if (!r || !r.code) { toast(r && r.error ? ('创建房间失败：' + r.error) : '创建房间失败'); return; }
    room.code = r.code; room.seat = r.seat; room.token = r.token;
    enterWaiting();
  }

  async function joinRoom() {
    const code = ($('roomCode').value || '').trim().toUpperCase();
    const name = ($('roomName').value || '').trim() || ('玩家' + Math.floor(Math.random() * 900 + 100));
    if (!code) { toast('请输入房间号'); return; }
    const r = await ZYJ.api.roomJoin(code, name);
    if (!r || !r.code) { toast(r && r.error ? ('加入失败：' + r.error) : '加入失败（房间不存在或已满）'); return; }
    room.code = r.code; room.seat = r.seat; room.token = r.token;
    enterWaiting();
  }

  function enterWaiting() {
    const big = $('roomCodeBig');
    if (big) { big.style.display = 'block'; big.innerHTML = '房间号<br><b>' + room.code + '</b>'; }
    const rb = $('btnReady');
    if (rb) { rb.style.display = 'block'; rb.disabled = false; rb.textContent = '我准备好了'; }
    stopRoomTimers();
    room.stateTimer = setInterval(pollRoom, 1000);
    pollRoom();
  }

  /** 点击「我准备好了」：通知服务器，双方都准备后由服务器统一开战 */
  async function markReady() {
    if (!room.code || room.iReady) return;
    await ZYJ.api.roomReady(room.code, room.seat, room.token);
    room.iReady = true;
    const rb = $('btnReady'); if (rb) { rb.disabled = true; rb.textContent = '已准备 · 等待对方…'; }
    pollRoom();
  }

  async function pollRoom() {
    if (!room.code) return;
    const st = await ZYJ.api.roomState(room.code, room.seat, room.token);
    if (!st) return;
    if (st.status === 'playing' && st.startAt) { stopRoomTimers(); beginPvpMatch(st); return; }
    const me = st.seats[room.seat];
    const opp = st.seats[1 - room.seat];
    const statusEl = $('roomStatus');
    const rb = $('btnReady');
    const myReady = room.iReady || (me && me.ready);
    if (!opp || !opp.name) {
      if (statusEl) statusEl.innerHTML = '房间号【' + room.code + '】｜<b>等待对手加入…</b><br>'
        + '<span style="opacity:.7;font-weight:normal">把房间号发给好友，或换浏览器/设备用同一房间号加入</span>';
      if (rb) { rb.disabled = false; rb.textContent = '我准备好了'; }
    } else {
      if (statusEl) statusEl.innerHTML = '房间号【' + room.code + '】<br>'
        + '你：<b>' + ((me && me.name) || '我') + '</b>' + (myReady ? ' ✅已准备' : ' ⬜未准备')
        + '<br>对手：<b>' + opp.name + '</b>' + (opp.ready ? ' ✅已准备' : ' ⬜未准备');
      if (rb) {
        if (myReady) { rb.disabled = true; rb.textContent = '已准备 · 等待对方…'; }
        else { rb.disabled = false; rb.textContent = '我准备好了'; }
      }
    }
  }

  function beginPvpMatch(st) {
    const opp = st.seats[1 - room.seat];
    room.oppName = (opp && opp.name) ? opp.name : '对手';
    // 【PVP】进房配对并接收对手的操作重放（startPvp 之后 ws.onopen 会补发开局抽牌 + 全量同步）
    if (ZYJ.net) ZYJ.net.connect({ code: room.code, seat: room.seat, token: room.token }, function (m) {
      if (core.G && core.G.pvpEnded) return;
      if (m && m.reason === 'quit') core.pvpEnd(true);   // 对手断线逃跑 → 我方判胜
      if (ZYJ.net) ZYJ.net.stop();
    });
    core.startPvp({
      code: room.code, seat: room.seat, token: room.token,
      startAt: st.startAt, serverTime: st.serverTime, oppName: room.oppName
    });
    show('battle');
    renderAll();
    stopRoomTimers();
    room.reportTimer = setInterval(reportLoop, 800);
  }

  async function reportLoop() {
    const G = core.G;
    if (!room.code) return;
    const resp = await ZYJ.api.roomReport({
      code: room.code, seat: room.seat, token: room.token,
      hp: G ? Math.max(0, Math.floor(G.adouHp)) : 0,
      maxHp: G ? Math.floor(G.adouMax) : 0,
      alive: G ? (G.adouHp > 0) : false,
      finished: G ? !!G.pvpFinished : false
    });
    if (!resp) return;
    if (G) {
      if (typeof resp.oppHp === 'number') G.oppAdouHp = resp.oppHp;
      if (typeof resp.oppMax === 'number' && resp.oppMax > 0) G.oppAdouMax = resp.oppMax;
    }
    if (resp.oppName) room.oppName = resp.oppName;
    if (resp.over) { stopRoomTimers(); if (ZYJ.net) { ZYJ.net.end('over'); ZYJ.net.stop(); } core.pvpEnd(resp.winner === room.seat); }
  }
  function togglePause() {
    const G = core.G; if (!G || G.over) return;
    if (G.mode === 'pvp') { log('PVP 禁止暂停（防作弊）'); toast('PVP 禁止暂停'); return; }
    core.paused = !core.paused; core.ctrlCache = ''; renderControls(); log(core.paused ? '已暂停' : '继续');
  }

  /* ---------- 图鉴 ---------- */
  async function showLeaderboard() {
    showOverlay('排行榜 · 无尽', '加载中…');
    const list = await ZYJ.api.topScores('endless', 10);
    if (!list.length) { $('ovText').innerHTML = '暂无记录，快去无尽模式冲榜！'; return; }
    let html = '<ol style="text-align:left;margin:8px 0;padding-left:22px;line-height:1.7">';
    list.forEach((s, i) => {
      html += '<li>' + (s.playerName || s.playerId) + ' —— 第 <b>' + s.score + '</b> 波</li>';
    });
    html += '</ol>';
    $('ovText').innerHTML = html;
  }

  function showCodex() {
    const codexSet = core.codexSet;
    const g = $('codexGrid'); g.innerHTML = '';
    const add = (t, info) => { const d = document.createElement('div'); d.className = 'cx'; d.innerHTML = '<b>' + t + '</b><br><span style="font-size:12px;opacity:.85">' + info + '</span>'; g.appendChild(d); };
    ['枪', '刀', '骑', '弓'].forEach(u => {
      const got = codexSet.has('unit:' + u);
      const def = UNIT_DEF[u], L = def.levels[1];
      add(got ? '武器·' + def.name + '（已解锁）' : '武器（未解锁）',
        got ? (def.role + '｜射' + L.range + ' 攻' + L.atk + ' 频' + L.cd + 's（满级Lv' + Object.keys(def.levels).length + '）') : '—');
    });
    Object.keys(HERO_DEF).forEach(h => {
      const got = codexSet.has('hero:' + h);
      const d = HERO_DEF[h];
      add(got ? '武将·' + h + '（已解锁）' : '武将（未解锁）',
        got ? (d.skill + '（满级Lv' + d.maxLevel + '）') : '两字按序落子激活');
    });
    show('codex');
  }

  /* ---------- 结算回调（由 core 触发） ---------- */
  function onLose() { showMerchant(() => showOverlay('失败', '阿斗被擒…')); }
  function onMainWin() { showMerchant(() => showOverlay('通关', '成功护送阿斗突围！')); }
  function onPvpWin() { showMerchant(() => showOverlay('PVP 胜利', '你守住了阿斗，击败对手！')); }
  function onPvpEnd(win) {
    stopRoomTimers();
    const opp = room.oppName || '对手';
    if (win) showOverlay('PVP 胜利', '你守住了阿斗，击败【' + opp + '】！');
    else showOverlay('PVP 失败', '阿斗被破，惜败【' + opp + '】一筹。');
  }
  function onEndlessEnd(wave) { showOverlay('无尽结束', '坚持到第 ' + wave + ' 波！'); }

  /* ---------- 拖拽：手牌 → 棋盘 ---------- */
  function bindDrag() {
    const cv = core.cv;
    if (!cv) return;
    cv.addEventListener('dragover', e => e.preventDefault());
    cv.addEventListener('drop', e => {
      e.preventDefault();
      let data; try { data = JSON.parse(e.dataTransfer.getData('text')); } catch (_) { return; }
      const card = data.from === 'hand' ? core.hand[data.i] : core.items[data.i];
      if (!card) return;
      const [c, r] = core.cellFromEvent(e);
      if (!core.inBoard(c, r)) return;
      if (card.kind === 'char') {
        if (!core.tryPlaceWeapon(data.i, r, c)) {        // 武器：合成/替换；非武器（将字）回落到原逻辑
          const res = core.applyToCell(r, c, card);
          if (res === 'consumed') { if (data.from === 'hand') core.hand.splice(data.i, 1); else core.items.splice(data.i, 1); }
        }
      } else {
        const res = core.applyToCell(r, c, card);
        if (res === 'consumed') { if (data.from === 'hand') core.hand.splice(data.i, 1); else core.items.splice(data.i, 1); }
      }
      core.selHand = null; renderAll();
    });
    // 棋盘单位指针拖拽（移动 / 合成）
    cv.addEventListener('pointerdown', e => {
      if (core.paused || (core.G && core.G.over)) return;
      const [c, r] = core.cellFromEvent(e);
      if (!core.inBoard(c, r)) return;
      const b = core.board[r][c];
      if (b.unit) {
        core.boardDrag = { r, c, unit: b.unit };
        e.preventDefault();
      }
    });
    window.addEventListener('pointerup', e => {
      if (!core.boardDrag) return;
      const src = core.boardDrag; core.boardDrag = null;
      const su = src.unit;
      // 落在备战席区域 → 武将拆解回两枚将字（别的单位不允许拖回）
      const handEl = $('hand'); const hrect = handEl.getBoundingClientRect();
      const overHand = e.clientX >= hrect.left && e.clientX <= hrect.right && e.clientY >= hrect.top && e.clientY <= hrect.bottom;
      if (overHand) {
        if (su.kind === 'hero') { core.splitHeroToHand(src.r, src.c); renderAll(); }
        else if (core.removeUnitToHand(src.r, src.c)) { renderAll(); }
        else log('只有场上单位可拖回备战席');
        return;
      }
      const [c, r] = core.cellFromEvent(e);
      if (!core.inBoard(c, r)) return;
      if (r === src.r && c === src.c) return;
      const from = core.board[src.r][src.c], to = core.board[r][c];
      if (su.kind === 'hero') {                       // 武将整体平移（保持左右字序）
        if (!core.moveHeroFromCell(src.r, src.c, r, c)) log('武将无法移动到该处');
        renderAll(); return;
      }
      if (!to.unit) {
        if (to.type !== 'green') { log('目标格不可放置'); return; }
        to.unit = su; from.unit = null;
        su.r = r; su.c = c;
        const [nx, ny] = core.cellPx(c, r); su.x = nx; su.y = ny;
        log('单位移动'); renderAll();
      } else {
        if (to.unit.kind === 'hero') { log('武将已就位，无法覆盖'); return; }
        if (to.unit.kind === 'unit' && su.kind === 'unit' && core.canMerge(su.card, to.unit.card)) {
          to.unit.card.level++; to.unit.atk = core.unitAtk(to.unit); from.unit = null;
          const gi = core.G.units.indexOf(su); if (gi >= 0) core.G.units.splice(gi, 1);
          log('合成 ' + to.unit.card.level + '级'); renderAll();
        } else {                                   // 不同兵种/等级 → 替换位置（交换两格单位）
          const tmp = to.unit; to.unit = su; from.unit = tmp;
          if (to.unit) { to.unit.r = r; to.unit.c = c; const [tx, ty] = core.cellPx(c, r); to.unit.x = tx; to.unit.y = ty; }
          if (from.unit) { from.unit.r = src.r; from.unit.c = src.c; const [fx, fy] = core.cellPx(src.c, src.r); from.unit.x = fx; from.unit.y = fy; }
          log('替换位置'); renderAll();
        }
      }
    });
    // 手牌拖手牌（合成）
    const handEl = $('hand');
    handEl.addEventListener('dragover', e => e.preventDefault());
    handEl.addEventListener('drop', e => {
      e.preventDefault(); let data; try { data = JSON.parse(e.dataTransfer.getData('text')); } catch (_) { return; }
      if (data.from !== 'hand') return;
      const el = e.target.closest('.card'); if (!el) return;
      const j = Array.prototype.indexOf.call(handEl.children, el);
      if (j < 0 || j === data.i) return;
      if (core.mergeHand(data.i, j)) renderAll();
    });
  }

  /* ---------- 菜单 / 控件 绑定 ---------- */
  function bindMenus() {
    const map = { btnMain: enterChapter, btnEndless: startEndless, btnPvp: startPVP, btnCodex: showCodex, btnRank: openSiteRanking };
    Object.keys(map).forEach(id => { const el = $(id); if (el) el.onclick = map[id]; });
    const backHome = $('backHome'); if (backHome) backHome.onclick = () => show('home');
    const backHome2 = $('backHome2'); if (backHome2) backHome2.onclick = () => show('home');
    const btnConscript = $('btnConscript'); if (btnConscript) btnConscript.onclick = () => { if (core.G) core.conscript(); };
    const btnPause = $('btnPause'); if (btnPause) btnPause.onclick = togglePause;
    const btnMenu = $('btnMenu'); if (btnMenu) btnMenu.onclick = () => { stopRoomTimers(); show('home'); };
    const btnPvp2 = $('btnPvp'); if (btnPvp2) btnPvp2.onclick = startPVP;
    const ovBtn = $('ovBtn'); if (ovBtn) ovBtn.onclick = () => { stopRoomTimers(); show('home'); };
    const camp = $('camp'); if (camp) camp.onclick = toggleDeckPanel;   // 营：本局剩余字牌
    // 联机房间
    const btnCreateRoom = $('btnCreateRoom'); if (btnCreateRoom) btnCreateRoom.onclick = createRoom;
    const btnJoinRoom = $('btnJoinRoom'); if (btnJoinRoom) btnJoinRoom.onclick = joinRoom;
    const btnReady = $('btnReady'); if (btnReady) btnReady.onclick = markReady;
    const roomBack = $('roomBack'); if (roomBack) roomBack.onclick = () => { stopRoomTimers(); show('home'); };
  }

  /* ---------- 营：本局消耗型牌库剩余 ---------- */
  let deckOpen = false;
  function toggleDeckPanel() {
    deckOpen = !deckOpen;
    const el = $('deckPanel'); if (!el) return;
    el.style.display = deckOpen ? 'block' : 'none';
    if (deckOpen) renderDeckPanel();
  }
  function renderDeckPanel() {
    const el = $('deckPanel'); if (!el || !deckOpen) return;
    const G = core.G; if (!G) return;
    const heroCh = cfg.HERO_CHARS, weaponCh = cfg.WEAPON_CHARS;
    let hero = [], mob = [];
    for (const ch in G.deck) {
      const n = G.deck[ch] || 0;
      (heroCh.has(ch) ? hero : mob).push({ ch, n });
    }
    if (!hero.length && !mob.length) { el.innerHTML = '<div class="empty">字库已空</div>'; return; }
    const chip = (o, isHero) => '<span class="chip' + (isHero ? ' hero' : '') + '">' + o.ch + (o.n > 0 ? ' <b>×' + o.n + '</b>' : ' <b style="color:#c55">0</b>') + '</span>';
    el.innerHTML =
      '<h4>本局剩余字牌（抽走即减，不回池）</h4>' +
      (hero.length ? '<div class="grp"><div class="row">' + hero.sort((a, b) => b.n - a.n).map(o => chip(o, true)).join('') + '</div></div>' : '') +
      (mob.length ? '<div class="grp"><div class="row">' + mob.sort((a, b) => b.n - a.n).map(o => chip(o, false)).join('') + '</div></div>' : '');
  }

  function init() { bindDrag(); bindMenus(); }

  return {
    init, show, log, toast, showOverlay, renderAll, renderHUD, renderHand, renderItems, renderControls,
    enterChapter, startEndless, startPVP, togglePause, showCodex, showLeaderboard, itemGlyph, showMerchant,
    onLose, onMainWin, onPvpWin, onPvpEnd, onEndlessEnd
  };
})();
