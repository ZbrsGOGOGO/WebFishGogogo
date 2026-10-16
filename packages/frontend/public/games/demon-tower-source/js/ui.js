/* =========================================================================
 * 九层妖塔 · 交互/渲染层 (ui.js)
 * 六页签渲染 + 战斗/事件/商店/捏脸弹窗 + 全局动作分发。
 * ========================================================================= */
(function (global) {
  'use strict';
  const C = global.CFG, ST = global.ST, API = global.API;

  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
  }

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

  const RARITY_COLOR = { '凡': '#9aa', '良': '#7bd97b', '精': '#5fa8d9', '灵': '#c98cd9', '宝': '#d9a0d9', '仙': '#e8c34a', '神': '#ff7a3c' };

  /* ============ 顶部状态条 ============ */
  function renderStatusBar() {
    const S = ST.S;
    const pwr = ST.powerScore();
    const xpNeed = C.xpNeed(S.level);
    $('statusBar').innerHTML =
      `<span class="sb"><b>Lv${S.level}</b> <i>${C.titleOf(S.level)}</i></span>` +
      `<span class="sb hl">⚔ 战力 ${pwr}</span>` +
      `<span class="sb">❤ 体力 ${S.stamina}/${S.staminaMax}</span>` +
      `<span class="sb">⭐ 经验 ${S.xp}/${xpNeed}·今日${S.xpToday}</span>` +
      `<span class="sb">💠 天赋点 ${S.jing || 0}</span>` +
      `<span class="sb">🪙 办公币 ${S.stone}</span>` +
      `<span class="sb">📜 功法点 ${S.daoYun}</span>` +
      `<span class="sb">⚒ 神材 ${Object.keys(C.EQUIP.MATS).filter(k => (S.mat[k] || 0) > 0).map(k => C.EQUIP.MATS[k].name + ':' + S.mat[k]).join(' ') || '无'}${S.jinchi ? ' ·🔴' + S.jinchi : ''}</span>` +
      `<span class="sb">🧭 探索 ${S.exploreCount}/${C.EXPLORE_DAILY_LIMIT}</span>` +
      `<span class="sb">⚔ 推塔 ${S.bossCount}/${C.BOSS_DAILY_LIMIT}</span>` +
      `<span class="sb">📿 符文 ${S.runeBag.length}</span>` +
      `<span class="sb">🎫 符 ${S.talisman}</span>` +
      (S.injury ? `<span class="sb" style="color:#ff7b6b">🤕 伤势 ${S.injury}/3</span>` : '');
  }

  /* ============ ① 成长 ============ */
  function renderGrow() {
    const S = ST.S;
    const ed = ST.effectiveDims({ equip: true });
    let dims = C.DIMS.map(d => {
      const base = S.dims[d.key], eff = ed[d.key];
      const bonus = eff - base;
      return `<div class="dimRow">
        <span class="dimName" style="color:${d.color}">${d.name}</span>
        <span class="dimVal">${eff}${bonus ? `<small>(+${bonus})</small>` : ''}</span>
        <span class="dimRole">${d.role}</span>
        ${S.freePoints > 0 ? `<button class="miniBtn" data-act="alloc" data-dim="${d.key}">+</button>` : ''}
      </div>`;
    }).join('');

    let gifts = C.GIFTS.map(g => {
      const on = S.destiny.includes(g.id);
      return `<div class="gift ${on ? 'on' : ''}" title="${g.desc}">
        <b>${g.name}</b><span>${on ? g.desc : '未觉醒'}</span></div>`;
    }).join('');

    $('tab-grow').innerHTML = `
      <div class="card growCard">
        <div class="avatarWrap">${global.Avatar.svg(S.avatar)}</div>
        <div class="growInfo">
          <div class="growName">${esc(S.name)} <button class="miniBtn" data-act="openAvatar">捏脸</button></div>
          <div class="growMeta">档${C.tierOf(S.level)} · ${C.titleOf(S.level)} · 自由点 <b>${S.freePoints}</b></div>
          <div class="presets">
            <button class="miniBtn" data-act="preset" data-preset="str">力量爆发</button>
            <button class="miniBtn" data-act="preset" data-preset="agi">敏捷闪避</button>
            <button class="miniBtn" data-act="preset" data-preset="def">防御反伤</button>
          </div>
        </div>
      </div>
      <div class="card"><h3>五维</h3>${dims}
        <p class="tip">提示：速度决定先手（首击+15%压制）与额外回合（版本核心）；每回合积累怒气，满100触发💥怒气爆发(伤害×1.5)；力量主导伤害；敏捷影响闪避与暴击；防御减伤；幸运影响暴击与爆率。前期(Lv≤30)每次升级还会随机获赠武器/天赋（开盲盒）。</p>
      </div>
      <div class="card"><h3>天生命格（${S.destiny.length}/8）</h3><div class="giftGrid">${gifts}</div></div>
      <div class="card"><h3>数据台账</h3>
        <div class="ledger">累计推塔伤害 ${S.stats.bossDamage} · 探索 ${S.stats.exploreTotal} 次 · 秘境 ${S.stats.realmTotal} 次</div>
        <div class="ledger">全服：第 ${S.server.day} 天 · 活跃 ${S.server.pop} 人 · 均 Lv${S.server.lvAvg}</div>
      </div>`;
  }

  /* ============ ② 探索 ============ */
  function renderExplore() {
    const S = ST.S;
    const terrBtns = C.TERRAINS.map(t =>
      `<button class="terrBtn" data-act="doExplore" data-terrain="${t.id}">${t.name}<small>风险${t.risk}</small></button>`).join('');
    $('tab-explore').innerHTML = `
      <div class="card">
        <h3>区域探索</h3>
        <p class="tip">每步消耗 1 体力，每日前 ${C.EXPLORE_DAILY_LIMIT} 次计入限额；超出需探索符。潜心修炼耗 10 体力/次、休整每小时限 1 次回 20 体力；体力随时间自动恢复（约 1/14 分钟）。</p>
        <div class="storyProgress">📜 剧情进度：已完成 ${S.story.done.length} 节 · 解锁彩蛋 ${S.story.eggs.length} 个</div>
        <div class="terrRow">${terrBtns}</div>
        <div class="actionRow">
          <button class="actBtn" data-act="train">潜心修炼(体10)</button>
          <button class="actBtn" data-act="rest">休整(每时1/+20)</button>
        </div>
        <div class="statusLine">探索 ${S.exploreCount}/${C.EXPLORE_DAILY_LIMIT} · 推塔 ${S.bossCount}/${C.BOSS_DAILY_LIMIT} · 体力 ${S.stamina}/${S.staminaMax} · 探索符 ${S.talisman}</div>
      </div>
      <div class="card" id="exploreResult"><h3>行动结果</h3><div class="resultText">点击地貌开始探索…</div></div>
      ${realmCard()}`;
  }

  /* 秘境区块 */
  function realmCard() {
    const S = ST.S;
    const rs = C.SECRET_REALMS.map(r => {
      const ok = S.level >= r.lvRange[0] && S.level <= r.lvRange[1];
      return `<div class="shopItem">
        <b>${r.name}</b><span class="rar">耗符 ${r.cost}</span>
        <small>${r.lvRange[0]}~${r.lvRange[1]} 级 · 评级 凡/良/灵/宝/仙</small>
        <button class="miniBtn" data-act="realm" data-id="${r.id}" ${ok ? '' : 'disabled'}>进入</button></div>`;
    }).join('');
    return `<div class="card"><h3>秘境工坊 §7.2（消耗探索符）</h3><div class="shopGrid">${rs}</div>
      <p class="tip">秘境产出资源与锻造材料（品质随档位），不刷五维经验；探索符可在探索页/物资库获取。</p></div>`;
  }

  function showExploreResult(res) {
    const box = $('exploreResult');
    if (!box) return;
    let html = '<h3>行动结果</h3>';
    if (res.event === 'fight') {
      const c = Combat.run({ enemy: res.enemy });
      box.innerHTML = `<h3>行动结果</h3><div class="resultText">遭遇${esc(res.enemy.name)}！</div>
        <div class="combatBox"><div class="logBox" id="exploreLiveLog" style="min-height:120px"></div>
        <div id="exploreLiveResult"></div></div>`;
      const resEl = $('exploreLiveResult');
      streamCombatLog($('exploreLiveLog'), c, {
        delay: 130,
        onDone: function () {
          resEl.innerHTML = c.win
            ? '<div class="reward" style="color:#e8c34a;font-weight:bold">🏆 胜利！</div>'
            : '<div class="reward" style="color:#e8533a;font-weight:bold">💀 落败。</div>'
              + '<div class="reward" style="color:#ff7b6b">⚠ 受伤 +1：全属性 −5%（伤势 ' + ST.S.injury + '/3，可用疗伤符清除）</div>';
        }
      });
      return;
    }
    if (res.event === 'adventure') {
      html += `<div class="resultText">奇遇·${esc(res.choices.title)}</div>`;
      html += res.choices.options.map((o, i) =>
        `<button class="actBtn" data-act="resolveAdv" data-i="${i}">${esc(o.label)}</button>`).join('');
      box.innerHTML = html;
      box._adv = res.choices;
      box._res = res;            // 保留原始结果（含本次材料掉落），供选项结算后展示
      return;
    }
    if (res.event === 'story' || res.event === 'egg') {
      const tag = res.event === 'egg' ? '彩蛋·' : '剧情·';
      html += `<div class="resultText">${tag}${esc(res.node.title)}</div>`;
      html += `<div class="resultDesc">${esc(res.node.desc)}</div>`;
      html += res.node.options.map((o, i) =>
        `<button class="actBtn" data-act="resolveStory" data-node="${encodeURIComponent(res.node.storyId)}" data-opt="${i}">${esc(o.label)}</button>`).join('');
      box.innerHTML = html;
      return;
    }
    if (res.realmHint) {
      html += `<div class="resultText">${esc(res.text || '发现秘境入口')}</div>` + realmCard();
      box.innerHTML = html;
      return;
    }
    html += `<div class="resultText">${esc(res.text || '探索结束')}</div>`;
    if (res.matGained && res.matGained.length)
      html += `<div class="resultReward">⛏ 拾得锻造材料：${esc(res.matGained.join('、'))}</div>`;
    if (res.bpGained && res.bpGained.length)
      html += `<div class="resultReward">📜 获得图纸：${esc(res.bpGained.join('、'))}</div>`;
    box.innerHTML = html;
    if (res.needDim) pickLootDim();
    renderStatusBar();
  }

  /* 宝箱开出淬体丹：选择要永久提升的一维（免费获得，非购买） */
  function pickLootDim() {
    const opts = C.DIMS.map(d => `<button class="miniBtn" data-act="lootDim" data-dim="${d.key}">${d.name}</button>`).join('');
    modal(`<h3>🎁 淬体丹</h3><p>选择要永久提升的一维（+1）：</p><div class="actionRow">${opts}</div>`);
  }

  /* ============ ③ 装备 ============ */
  function renderEquip() {
    $('tab-equip').innerHTML = `
      ${EQ.renderSlots()}
      ${EQ.renderBag()}`;
  }

  /* ============ ④ 养成 ============ */
  let talCat = '全部';
  const TAL_CATS = ['全部', '根骨', '武势', '武诀', '身形'];
  /* 天赋图鉴 §9.2：领悟进度 / 天赋点升级 */
  function talentCard() {
    const S = ST.S;
    const lvOf = id => { const o = (S.talents || []).find(x => x.id === id); return o ? o.lv : 0; };
    const items = C.TALENTS.filter(t => talCat === '全部' || t.cat === talCat).map(t => {
      const lv = lvOf(t.id), owned = lv > 0, maxed = lv >= t.max;
      const pct = Math.round(lv / t.max * 100);
      const bar = `<div style="background:#3a2f22;border-radius:4px;height:6px;margin:4px 0">
        <div style="background:#d4af37;height:6px;border-radius:4px;width:${pct}%"></div></div>`;
      const upBtn = !owned ? '' : (maxed
        ? '<span class="ownTag">🏆 已满级</span>'
        : `<button class="miniBtn" data-act="upTalent" data-id="${t.id}" ${S.jing < t.jing ? 'disabled' : ''}>升级至 Lv.${lv + 1}</button>`);
      return `<div class="raiseItem" style="${owned ? '' : 'opacity:.55'}">
        <b>${t.icon} ${t.name}</b><span class="ownTag">${t.cat}</span>
        ${owned ? `<span class="ownTag">Lv.${lv}/${t.max}</span>` : '<span class="ownTag">未领悟</span>'}
        ${bar}
        <small>${t.desc}</small>
        <small>📐 ${t.eff}</small>
        <small>🔓 Lv.${t.learnLv}+ 升级时可能领悟${t.active ? ' · 战斗自动释放' : ''}</small>
        ${owned ? `<div class="eqBtns"><span class="ownTag">💠${t.jing}/级</span>${upBtn}</div>` : ''}
      </div>`;
    }).join('');
    const filters = TAL_CATS.map(c =>
      `<button class="miniBtn" data-act="talFilter" data-cat="${c}" ${talCat === c ? 'disabled' : ''}>${c}</button>`).join(' ');
    return `<div class="card"><h3>天赋图鉴（${C.TALENTS.length} 种）· 💠天赋点 ${S.jing || 0}</h3>
      <p class="tip">升级抽取必得天赋（重复自动 +1 级、满级转 💠天赋点）；<b>此处手动升级按等级概率领悟</b>：目标等级越高越难（基础 96%→45% 递减），武诀/秘传更难；<b>领悟失败返还一半天赋点</b>（净耗另一半）。根骨/武势为被动与战场条件触发；武诀为主动技，战斗中消耗【气机】释放（每场 1 次，有代价）。</p>
      <div class="actionRow">${filters}</div>
      <div class="raiseGrid">${items}</div></div>`;
  }

  function renderRaise() {
    $('tab-raise').innerHTML = `
      ${talentCard()}`;
  }

  function renderForge() {
    $('tab-forge').innerHTML = EQ.renderForge();
  }

  /* ============ ⑧ 帮派系统（管理/Boss/列表 + 七子页） ============ */
  let sectTop = 'manage', sectSub = 'ov';
  function fmt(n) { n = Math.round(Number(n) || 0); return n.toLocaleString('en-US'); }
  function mul32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function sectMyRow(role, weekN) {
    const S = ST.S;
    return { name: S.name, role: role, lv: S.level, av: '🧙', week: weekN, date: ST.todayStr().replace(/-/g, '/'), me: true };
  }
  function sectActivityList() {
    const s = ST.S.sect;
    const role = s.mine ? '盟主' : '弟子';
    return [sectMyRow(role, ST.sectMyWeekN())].concat(s.members || []).sort((a, b) => b.week - a.week);
  }
  function roleTagCls(r) { return r === '盟主' ? 'r1' : (r === '弟子' ? '' : 'r2'); }
  function renderSect() {
    const S = ST.S;
    ST.sectEnsure();
    const tops = [
      { k: 'manage', icon: '🏯', label: '帮派管理' },
      { k: 'boss',   icon: '⚔', label: '帮派Boss' },
      { k: 'list',   icon: '🔍', label: '帮派列表' }
    ];
    const topHtml = `<div class="sectTopTabs">${tops.map(t =>
      `<button class="sectTop ${sectTop === t.k ? 'on' : ''}" data-act="sectTopGo" data-sub="${t.k}">${t.icon} ${t.label}</button>`).join('')}</div>`;
    let body = '';
    if (sectTop === 'manage') body = S.sect ? sectManageHtml() : sectManageNoSect();
    else if (sectTop === 'boss') body = S.sect ? sectBossCard()
      : `<div class="card"><h3>⚔ 帮派Boss</h3><p class="tip">加入帮派后，可挑战每日刷新的镇派妖兽：按伤害折算贡献，讨伐成功全帮重赏。<br>可先在「帮派列表」申请加入成名大派。</p></div>`;
    else body = sectListCard();
    $('tab-sect').innerHTML = `<div class="sectTitle">🐉 帮派系统</div>${topHtml}${body}`;
  }
  function sectManageNoSect() {
    const S = ST.S;
    const elOpts = Object.keys(C.EQUIP.SECT_ELEMENTS).map(k => {
      const e = C.EQUIP.SECT_ELEMENTS[k];
      return `<option value="${k}">${e.icon} ${e.attr}·${e.name} —— ${e.desc}</option>`;
    }).join('');
    const createBlock = S.level >= 10
      ? `<div class="card"><h3>开宗立派</h3>
          <p class="tip">五行帮派各有擅长：⚔金·攻击功法｜🌿木·灵草治疗｜💧水·速度治疗｜🔥火·控火炼丹｜⛰土·挖矿。创建需 办公币150。</p>
          <div class="forgeRow">帮派名<input id="sectName" maxlength="8" placeholder="2~8 字" style="width:120px">
          属性<select id="sectElement">${elOpts}</select>
          <button class="miniBtn" data-act="sectCreate">开宗立派</button></div></div>`
      : `<div class="card"><h3>开宗立派</h3><p class="tip">道途初成，需 <b>10 级</b> 方可开宗立派（当前 Lv${S.level}）；可先在「帮派列表」申请加入成名大派。</p></div>`;
    return `<div class="card"><h3>帮派管理</h3><p class="tip">尚未加入帮派：可切换到「帮派列表」申请入门，达到门槛即享该属性加成。</p></div>${createBlock}`;
  }
  function sectManageHtml() {
    const subs = [
      { k: 'ov',    icon: '🔥', label: '总览' },
      { k: 'chat',  icon: '💬', label: '聊天' },
      { k: 'mem',   icon: '👥', label: '成员' },
      { k: 'apply', icon: '📮', label: '申请' },
      { k: 'role',  icon: '🏅', label: '职位' },
      { k: 'grow',  icon: '🌱', label: '成长' },
      { k: 'set',   icon: '⚙', label: '设置' }
    ];
    const subHtml = `<div class="sectSubTabs">${subs.map(t =>
      `<button class="sectSub ${sectSub === t.k ? 'on' : ''}" data-act="sectSubGo" data-sub="${t.k}">${t.icon} ${t.label}</button>`).join('')}</div>`;
    let body = '';
    if (sectSub === 'ov') body = sectOverviewCard();
    else if (sectSub === 'chat') body = sectChatCard();
    else if (sectSub === 'mem') body = sectMembersCard();
    else if (sectSub === 'apply') body = sectApplyCard();
    else if (sectSub === 'role') body = sectRoleCard();
    else if (sectSub === 'grow') body = sectGrowCard();
    else body = sectSettingCard();
    return subHtml + body;
  }
  function sectOverviewCard() {
    const s = ST.S.sect, e = C.EQUIP.SECT_ELEMENTS[s.element];
    const cap = C.sectMemberCap(s.level), need = C.sectLevelNeed(s.level);
    const nextLv = Math.min(10, s.level + 1);
    const pct = Math.min(100, Math.round(s.exp / need * 100));
    const myRole = s.mine ? '盟主' : '弟子';
    const actRows = sectActivityList().slice(0, 5).map(m => `
      <div class="sectActRow">
        <span class="sectAv">${m.av}</span>
        <span class="sectActInfo"><b>${esc(m.name)}</b><em class="roleTag ${roleTagCls(m.role)}">${m.role}</em>
          <small>Lv.${m.lv} · ${m.date}</small></span>
        <span class="sectWeek">周贡献<b>${fmt(m.week)}</b></span>
      </div>`).join('');
    return `
      <div class="sectCard sectHead">
        <div class="sectIcon" style="border-color:${e.color};color:${e.color}">${e.icon}</div>
        <div class="sectHeadInfo">
          <div class="sectName">${esc(s.name)} <span class="lvBadge">Lv.${s.level}</span> <span class="roleBadge">${myRole}</span></div>
          <div class="sectMeta">${s.mine ? '自建帮派 · ' : '成名大派 · '}${e.attr} · 成员上限 ${cap} 人</div>
        </div>
        <button class="miniBtn ghost" data-act="sectSubGo" data-sub="set">⚙ 设置</button>
      </div>
      <div class="sectCard growBox">
        <div class="growHead"><b>🌱 帮派成长</b><span>距 Lv.${nextLv} 还差 ${fmt(Math.max(0, need - s.exp))} 累计贡献</span></div>
        <div class="progBar"><div class="progFill" style="width:${pct}%"></div></div>
        <div class="growFoot"><span>当前累计 ${fmt(s.exp)}</span><span>下一阶段需要 ${fmt(need)}</span></div>
      </div>
      <div class="sectCard noticeBox">
        <div class="noticeHead"><b>📢 帮派公告</b><button class="miniBtn ghost" data-act="sectAnnounceEdit">✏ 编辑</button></div>
        <div class="noticeBody">${esc(s.announce || '暂无公告')}</div>
      </div>
      <div class="sectCard statsRow">
        <div class="st"><b>${s.memberCount}/${cap}</b><span>成员规模</span></div>
        <div class="st"><b>${fmt(s.exp)}</b><span>累计贡献</span></div>
        <div class="st"><b>${fmt(s.myContrib)}</b><span>可用贡献</span></div>
        <div class="st"><b>${fmt(s.myContribHist)}</b><span>我的历史贡献</span></div>
      </div>
      <div class="sectCard donateBox">
        <div class="donInfo"><b>💰 快速捐献</b><small>${C.SECT_DONATE.stonePer} 办公币 = 1 贡献 · 助力帮派成长，攒个人贡献</small></div>
        <div class="donOps"><input id="sectDonateN" type="number" min="${C.SECT_DONATE.stonePer}" step="${C.SECT_DONATE.stonePer}" value="500">
          <button class="miniBtn prime" data-act="sectDonate">立即捐献</button></div>
      </div>
      <div class="sectCard">
        <div class="actHead"><b>🔥 本周活跃</b><button class="miniBtn ghost" data-act="sectSubGo" data-sub="mem">查看全部</button></div>
        ${actRows || '<p class="tip">本周暂无活跃记录</p>'}
      </div>`;
  }
  function sectChatCard() {
    const s = ST.S.sect;
    const day = ST.todayStr();
    let seed = 7;
    for (let i = 0; i < day.length; i++) seed = (seed * 31 + day.charCodeAt(i)) | 0;
    const rnd = mul32(seed), pool = (s.members || []).slice();
    const lines = [];
    for (let i = 0; i < 8; i++) {
      const m = pool[Math.floor(rnd() * pool.length)] || { name: '道友', av: '🧙' };
      const p = C.SECT_CHAT[Math.floor(rnd() * C.SECT_CHAT.length)];
      lines.push(`<div class="chatLine"><span class="sectAv">${m.av}</span><div class="chatBubble"><b>${esc(m.name)}</b>${esc(p)}</div></div>`);
    }
    return `<div class="sectCard"><div class="actHead"><b>💬 帮派频道</b><span class="tip" style="margin:0">每日闲聊 · 同道水群</span></div>
      <div class="sectChat">${lines.join('')}</div></div>`;
  }
  function sectMembersCard() {
    const s = ST.S.sect;
    const rows = sectActivityList().map(m => `
      <div class="memCell"><span class="sectAv">${m.av}</span>
        <span style="flex:1;min-width:0"><b>${esc(m.name)}</b>${m.me ? ' <em class="roleTag r1">我</em>' : ''}<em class="roleTag ${roleTagCls(m.role)}">${m.role}</em>
        <small style="display:block;color:#8a7c63">Lv.${m.lv} · 周贡献 ${fmt(m.week)}</small></span>
      </div>`).join('');
    return `<div class="sectCard"><div class="actHead"><b>👥 成员（${s.memberCount}/${C.sectMemberCap(s.level)}）</b></div>
      <div class="memberGrid">${rows}</div>
      <p class="tip">仅展示核心成员；帮派升级可提升成员上限。</p></div>`;
  }
  function sectApplyCard() {
    const s = ST.S.sect;
    if (!s.mine) return `<div class="sectCard"><div class="actHead"><b>📮 入派申请</b></div>
      <p class="tip">「${esc(s.name)}」为成名大派，弟子由掌教直录、长老推举，暂无可审核的申请。</p></div>`;
    const apps = s.applicants || [];
    const rows = apps.map((a, i) => `
      <div class="sectActRow"><span class="sectAv">${a.av}</span>
        <span class="sectActInfo"><b>${esc(a.name)}</b><small>Lv.${a.lv} · 请求入派</small></span>
        <button class="miniBtn" data-act="sectAccept" data-i="${i}">通过</button>
        <button class="miniBtn ghost" data-act="sectReject" data-i="${i}">拒绝</button>
      </div>`).join('');
    return `<div class="sectCard"><div class="actHead"><b>📮 入派申请（${apps.length}）</b></div>
      ${rows || '<p class="tip">暂无申请。帮派声望提升后，会有更多散修慕名而来。</p>'}</div>`;
  }
  function sectRoleCard() {
    const cnt = { '盟主': 0, '副帮主': 0, '长老': 0, '精英': 0, '弟子': 0 };
    sectActivityList().forEach(m => { if (cnt[m.role] !== undefined) cnt[m.role]++; });
    const roleInfo = [
      ['盟主', '帮派之主：改名、公告、审核申请、升级帮派'],
      ['副帮主', '协理帮务：发布公告、审核申请'],
      ['长老', '镇压一脉：带队讨伐妖兽、培养弟子'],
      ['精英', '中坚战力：探索秘境先锋，周贡献主力'],
      ['弟子', '潜力新血：每日捐献与产出，稳步成长']
    ];
    return `<div class="sectCard"><div class="actHead"><b>🏅 职位体系</b></div>
      <div class="ledger">${roleInfo.map(r =>
        `<div class="dimRow"><span class="dimName">${r[0]}×${cnt[r[0]] || 0}</span><span class="dimRole">${r[1]}</span></div>`).join('')}</div>
      <p class="tip">职位按周贡献与战力动态评定，位列前茅者可晋升。</p></div>`;
  }
  function sectGrowCard() {
    const s = ST.S.sect, e = C.EQUIP.SECT_ELEMENTS[s.element];
    const b = ST.sectBonus();
    const bonusTxt = [];
    if (b.atkPct) bonusTxt.push('攻击 +' + Math.round(b.atkPct * 100) + '%');
    if (b.spdPct) bonusTxt.push('速度 +' + Math.round(b.spdPct * 100) + '%');
    if (b.healPct) bonusTxt.push('治疗 +' + Math.round(b.healPct * 100) + '%');
    if (b.mineMul) bonusTxt.push('挖矿掉落 +' + Math.round(b.mineMul * 100) + '%');
    if (b.pillMul) bonusTxt.push('炼丹产出 ×' + (1 + b.pillMul).toFixed(2));
    const need = C.sectLevelNeed(s.level), maxed = s.level >= 10;
    const exRows = (C.SECT_EXCHANGE || []).map(x =>
      `<div class="sectActRow"><span class="sectActInfo"><b>${x.name}</b><small>耗可用贡献 ${x.cost}</small></span>
        <button class="miniBtn" data-act="sectExchange" data-id="${x.id}">兑换</button></div>`).join('');
    return `
      <div class="sectCard"><div class="actHead"><b>🌱 镇派功法 · ${e.talent}</b><span class="lvBadge">Lv.${s.level}</span></div>
        <p class="tip">加入本帮即自动习得该镇派功法，可在「功法」页修炼、升级。</p>
        <p class="tip">${e.desc}</p>
        <p style="font-size:13px"><b>当前加成</b>：${bonusTxt.join('　') || '无'}</p>
        <div class="progBar"><div class="progFill" style="width:${Math.min(100, Math.round(s.exp / need * 100))}%"></div></div>
        <div class="growFoot"><span>累计贡献 ${fmt(s.exp)} / ${fmt(need)}</span><span>每级加成系数 +10%</span></div>
        <div class="actionRow" style="margin-top:8px">
          <button class="actBtn" data-act="sectUp" ${maxed ? 'disabled' : ''}>${maxed ? '已达 10 级' : '帮派升级（累计贡献 ' + fmt(need) + '）'}</button>
        </div>
        <p class="tip">升级由累计贡献驱动：总览快速捐献、讨伐帮派Boss 均可积累。</p>
      </div>
      <div class="sectCard"><div class="actHead"><b>🎁 贡献兑换</b><span class="sectWeek">可用贡献 <b>${fmt(s.myContrib)}</b></span></div>
        ${exRows}</div>`;
  }
  function sectSettingCard() {
    const s = ST.S.sect;
    return `<div class="sectCard"><div class="actHead"><b>⚙ 帮派设置</b></div>
      <div class="sectActRow"><span class="sectActInfo"><b>帮派公告</b><small>对全体成员可见，120 字以内</small></span>
        <button class="miniBtn" data-act="sectAnnounceEdit">✏ 编辑</button></div>
      ${s.mine ? `<div class="sectActRow"><span class="sectActInfo"><b>帮派改名</b><small>耗办公币 ${C.SECT_RENAME_COST}</small></span>
        <button class="miniBtn" data-act="sectRename">改名</button></div>` : ''}
      <div class="sectActRow"><span class="sectActInfo"><b>退出帮派</b><small>退出后将失去 ${esc(s.name)} 的五行加成</small></span>
        <button class="miniBtn btnDanger" data-act="sectLeave">退出</button></div>
    </div>`;
  }
  function sectBossCard() {
    const s = ST.S.sect, e = C.EQUIP.SECT_ELEMENTS[s.element];
    const b = ST.sectBossInfo();
    const pct = Math.max(0, Math.round(b.hp / b.max * 100));
    return `<div class="sectCard">
      <div class="actHead"><b>${e.icon} 镇派妖兽 · 噬渊魔君</b><span class="lvBadge">Lv.${s.level * 10}</span></div>
      <div class="riskBar"><div class="riskFill" style="width:${pct}%"></div><span>剩余血量 ${fmt(b.hp)} / ${fmt(b.max)}</span></div>
      <p class="tip">每日刷新。挑战耗 2 体力，伤害越高贡献越多（伤害/100）；讨伐成功全帮重赏。</p>
      <button class="actBtn" data-act="sectBossFight" ${b.hp <= 0 ? 'disabled' : ''}>${b.hp <= 0 ? '今日已讨伐' : '挑战（耗 2 体力）'}</button>
    </div>`;
  }
  function sectListCard() {
    const S = ST.S;
    const list = (C.SECT_LIST || []).map(sd => {
      const e = C.EQUIP.SECT_ELEMENTS[sd.element];
      const can = !S.sect && S.level >= sd.reqLevel;
      const btn = S.sect ? '<button class="miniBtn" disabled>已加入帮派</button>'
        : `<button class="miniBtn" data-act="sectJoin" data-id="${sd.id}" ${can ? '' : 'disabled'}>${can ? '申请加入' : 'Lv' + sd.reqLevel + ' 解锁'}</button>`;
      return `<div class="shopItem" style="border-color:${e.color}">
        <b>${e.icon} ${sd.name}</b><span class="ownTag">${e.attr}·${e.name}</span>
        <small>${sd.desc}</small>
        <small style="color:#9ab">掌教 ${sd.leader}｜弟子 ${sd.members} 人｜门槛 Lv${sd.reqLevel}</small>
        ${btn}</div>`;
    }).join('');
    return `<div class="card"><h3>🔍 帮派列表</h3>
      <p class="tip">诸天闻名的大派，达到门槛等级即可申请加入并享该属性加成；Lv10 后亦可开宗立派。</p>
      <div class="shopGrid">${list}</div></div>`;
  }

  /* ============ ⑤ 物资 ============ */
  function renderShop() {
    const S = ST.S;
    const supply = C.SHOP_SUPPLY.map(it => {
      const cnt = Shop.boughtCount(it);
      const left = it.limit ? it.limit - cnt : '∞';
      return `<div class="shopItem">
        <b>${it.name}</b><span class="rar">${Shop.curName(it.cur)} ${it.price}</span>
        <small>${it.desc}</small>
        <span class="leftTag">${it.day ? '日限' : ''} 余 ${left}</span>
        <button class="miniBtn" data-act="buy" data-id="${it.id}">购买</button></div>`;
    }).join('');
    const market = C.SHOP_MARKET.map(it => {
      const cnt = Shop.boughtCount(it);
      const left = it.limit ? it.limit - cnt : '∞';
      return `<div class="shopItem">
        <b>${it.name}</b><span class="rar">${Shop.curName(it.cur)} ${it.price}</span>
        <small>${it.desc}</small>
        <span class="leftTag">${it.week ? '周限' : ''} 余 ${left}</span>
        <button class="miniBtn" data-act="buy" data-id="${it.id}">购买</button></div>`;
    }).join('');
    $('tab-shop').innerHTML = `
      <div class="card"><h3>物资库</h3><p class="tip">办公币结算，临时增益为主。</p><div class="shopGrid">${supply}</div></div>
      <div class="card"><h3>秘市（办公币·稀有/限购）</h3><div class="shopGrid">${market}</div></div>`;
  }

  /* ============ ⑥ 协作 ============ */
  function renderCoop() {
    const S = ST.S;
    const layers = S.layers.map(L => {
      const bs = C.bossStats(L.layer);
      const gate = World.bossGate(L.layer);
      const pct = Math.round((1 - L.bossHp / L.bossMaxHp) * 100);
      let statusTxt, action = '';
      if (L.status === 'locked') statusTxt = '🔒 未解锁';
      else if (L.status === 'cleared') statusTxt = '✅ 已通关';
      else {
        statusTxt = '🟢 开放';
        const why = !gate.ready ? (!gate.selfOk ? `需自身 Lv${gate.need}` : `全服 Lv${gate.need}+ 仅 ${ST.countAtLevel(gate.need)}/${gate.need}`) : '可推塔';
        action = `<button class="miniBtn" data-act="boss" data-layer="${L.layer}">推塔(耗${C.STAMINA_PER_BOSS}体力)</button>
                  <span class="gate">${why}</span>`;
      }
      const channelTxt = L.status === 'cleared'
        ? `<div class="channel">通道 ${L.channel}/${L.channelGoal}
             <button class="miniBtn" data-act="channel" data-layer="${L.layer}">捐材料</button></div>` : '';
      return `<div class="layerCard" style="border-color:${pct > 0 ? '#d98c5f' : '#ccc'}">
        <div class="lcHead">第${L.layer}层 · ${esc(bs.name)} <span class="lcTerrain">${bs.terrain}</span></div>
        <div class="riskBar"><div class="riskFill" style="width:${pct}%"></div>
          <span>项目风险指数 ${pct}%（${L.bossHp}/${L.bossMaxHp}）</span></div>
        <div class="lcFoot">${statusTxt} ${action}</div>
        ${channelTxt}
      </div>`;
    }).join('');

    const logHtml = (S.log || []).slice(-12).reverse().map(l => `<div class="logLine">${esc(l)}</div>`).join('') || '<p class="tip">暂无战报</p>';

    $('tab-coop').innerHTML = `
      <div class="card"><h3>共同推进首领（项目风险指数）</h3><div class="layerGrid">${layers}</div></div>
      <div class="card"><h3>行动战报</h3><div class="logBox">${logHtml}</div></div>`;
  }

  /* ============ ⑦ 好友论道（独立菜单：演武场论道 + 本站好友） ============ */
  function renderFriend() {
    const S = ST.S;
    const friends = S.friends.map(f => `
      <div class="friendRow">
        <span>${esc(f.name)} <small>Lv${Math.max(1, S.level + f.off)}</small></span>
        <button class="miniBtn" data-act="spar" data-id="${f.id}">切磋</button>
      </div>`).join('');

    $('tab-friend').innerHTML = `
      <div class="card"><h3>演武场·论道（好友切磋 · NPC 练手）</h3><div class="friendGrid">${friends}</div>
        <p class="tip">可重复与同一好友切磋（练手）；胜利经验+，落败+8不扣体力。</p></div>
      <div class="card"><h3>本站好友（异步切磋）</h3><div class="friendGrid" id="rivalList"><p class="tip">加载中…</p></div>
        <p class="tip">读取本站好友列表，点好友角色即可切磋（对方无需在线）；可重复切磋，胜利经验+，落败+8不扣体力。</p></div>`;
    loadFriendRivals();
  }

  /* 异步加载经过本站好友关系校验的角色列表。 */
  async function loadFriendRivals() {
    const box = document.getElementById('rivalList');
    if (!box) return;
    let list = [];
    try { list = await API.getFriends(); } catch (e) { list = []; }
    if (!list || !list.length) {
      box.innerHTML = '<p class="tip">暂无可切磋的本站好友，可先在好友页添加。</p>';
      return;
    }
    box.innerHTML = list.map(f => {
      const fid = f.playerId || f.id;
      const nm = f.name || fid;
      return `<div class="friendRow"><span>${esc(nm)} <small>Lv${f.level || 1}</small></span>
        <button class="miniBtn" data-act="sparFriend" data-id="${encodeURIComponent(fid)}">切磋</button></div>`;
    }).join('');
  }

  function safeParseJson(s) { try { return JSON.parse(s); } catch (e) { return null; } }

  /* 与本站好友角色异步切磋，对方无需在线。 */
  async function sparRealFriend(friend) {
    const S = ST.S;
    if (S.stamina < C.STAMINA_PER_SPAR) { ST.toast('体力不足（切磋需 ' + C.STAMINA_PER_SPAR + '）'); return; }
    S.stamina -= C.STAMINA_PER_SPAR;
    let save = null;
    if (friend.saveData) save = (typeof friend.saveData === 'string') ? safeParseJson(friend.saveData) : friend.saveData;
    if (!save) {
      try {
        const p = await API.getProfile(friend.id);
        if (p && p.saveData) save = (typeof p.saveData === 'string') ? safeParseJson(p.saveData) : p.saveData;
      } catch (e) { save = null; }
    }
    if (!save) {
      save = { name: friend.name, level: 1, dims: { str: 10, spd: 10, agi: 10, def: 10, luc: 10 },
        equip: { weapon: null, faqi: null }, destiny: [] };
    }
    const enemy = Combat.snapshotFromSave(save);
    const res = Combat.run({ enemy: enemy, isSpar: true });
    const ad = Math.abs(S.level - (save.level || 1));
    let xp;
    if (res.win) { xp = 30 + Math.min(40, ad * 3); if (ad >= 10) xp += 11; } else xp = 8;
    const leveled = ST.gainXp(xp);
    ST.save();
    showCombatLive('好友切磋 · ' + enemy.name, Object.assign({}, res, { rewards: { xp: xp, leveled: leveled, stamina: C.STAMINA_PER_SPAR } }),
      { after: function () { renderCoop(); renderStatusBar(); } });
  }

  /* ============ 弹窗 ============ */
  function modal(html, id) {
    const m = $(id || 'modal');
    m.querySelector('.modalBox').innerHTML = html;
    m.classList.remove('hidden');
  }
  function closeModal(id) { $(id || 'modal').classList.add('hidden'); }


  /* 逐条流式写入战斗日志（实时展示对战记录） */
  function streamCombatLog(container, c, opts) {
    opts = opts || {};
    let i = 0;
    const step = function () {
      if (i < c.log.length) {
        container.insertAdjacentHTML('beforeend', `<div class="logLine">${esc(c.log[i])}</div>`);
        container.scrollTop = container.scrollHeight;
        i++;
        setTimeout(step, opts.delay || 130);
        return;
      }
      if (opts.onDone) opts.onDone();
    };
    step();
  }

  /* 实时（逐条）展示切磋 / 野怪战斗记录与结果 */
  function showCombatLive(title, c, opts) {
    opts = opts || {};
    modal(`<h3>${esc(title)}</h3><div class="combatBox">
      <div class="logBox" id="liveLog" style="min-height:150px"></div>
      <div id="liveResult"></div></div>`);
    const resEl = $('liveLog') ? $('liveLog').parentNode.querySelector('#liveResult') : null;
    streamCombatLog($('liveLog'), c, {
      delay: 130,
      onDone: function () {
        const verdict = c.win
          ? '<div class="reward" style="color:#e8c34a;font-weight:bold">🏆 胜利！</div>'
          : '<div class="reward" style="color:#e8533a;font-weight:bold">💀 落败。</div>';
        let reward = '';
        if (c.rewards) {
          const r = c.rewards;
          reward = '<div class="reward">';
          if (r.xp) reward += `经验 +${r.xp}${r.leveled ? `（升${r.leveled}级）` : ''} `;
          if (r.stone) reward += `办公币 +${r.stone} `;
          if (r.materials) reward += `材料 +${r.materials} `;
          if (r.stamina) reward += `体力 -${r.stamina} `;
          reward += '</div>';
        }
        const hpLine = `<div class="hpResult">` +
          `<span style="color:#5fb0ff">🟦 ${esc(c.playerName || '我方')}：${Math.max(0, Math.round(c.playerHp))}/${c.playerMaxHp} HP</span>` +
          `　` +
          `<span style="color:#ff7b6b">🟥 ${esc(c.enemyName || '敌方')}：${Math.max(0, Math.round(c.enemyHp))}/${c.enemyMaxHp} HP</span>` +
          `</div>`;
        if (resEl) resEl.innerHTML = verdict + hpLine + reward + (opts.extra || '') +
          '<button class="miniBtn" data-act="closeModal">关闭</button>';
        if (c.rewards && c.rewards.leveled) renderStatusBar();
        if (opts.after) opts.after();
      }
    });
  }

  /* 升级抽取反馈弹窗 + 自动刷新装备图鉴 §9.1 */
  function showLevelDraw(g) {
    if (g.kind === 'mat') {
      const mats = g.mats ? Object.keys(g.mats).map(k => (C.EQUIP.MATS[k] ? C.EQUIP.MATS[k].name : k) + '×' + g.mats[k]).join(' ') : '';
      modal(`<h3>🎁 升级抽取 · Lv${ST.S.level}</h3><div class="gachaRes">获得<b>锻造材料</b>：${mats}</div><button class="miniBtn" data-act="closeModal">收下</button>`);
      toast('🎁 锻造材料：' + mats);
      renderStatusBar();
      return;
    }
    if (g.kind === 'talent') {
      const html = `<h3>🎁 升级领悟 · Lv${ST.S.level}</h3>
        <div class="gachaRes" style="color:#d4af37">
          <p>${g.icon} <b>${g.name}</b>　<span class="ownTag">${g.cat}</span></p>
          <p>${g.desc}</p>
          <p class="tip">📐 ${g.eff || ''}</p>
          <p>${g.converted ? '💠 已满级 · 转化为 ' + g.jing + ' 天赋点'
            : (g.dup ? '🔁 重复领悟 · 升至 Lv' + g.plus + '/' + g.max : '✨ 全新领悟！')}</p>
        </div>
        <button class="miniBtn" data-act="closeModal">收下</button>`;
      modal(html);
      toast('🎁 ' + (g.converted ? '💠+' + g.jing : (g.dup ? '天赋 Lv' + g.plus : '新天赋')) + '：' + g.name);
      renderRaise(); renderStatusBar();
      return;
    }
    const color = RARITY_COLOR[g.rarity] || '#fff';
    const kind = '武器';
    const isNew = !g.dup;
    const html = `<h3>🎁 升级抽取 · Lv${ST.S.level}</h3>
      <div class="gachaRes" style="color:${color}">
        <p class="tip">获得${kind}：<b>${g.name}</b>　[${g.rarity}]</p>
        <p>${g.eff || ''}</p>
        <p>${isNew ? '✨ 全新收录！' : '🔁 重复获得 · 品质提升 +' + g.plus}</p>
      </div>
      <button class="miniBtn" data-act="closeModal">收下</button>`;
    modal(html);
    toast('🎁 ' + (isNew ? '新' : '重复+' + g.plus) + '：' + g.name + ' [' + g.rarity + ']');
    renderEquip(); renderStatusBar();
  }

  function showAvatarModal() {
    const S = ST.S;
    let parts = '';
    Object.keys(Avatar.PARTS).forEach(k => {
      parts += `<div class="avPart"><label>${k}</label><div class="avOpts">` +
        Avatar.PARTS[k].map((name, i) =>
          `<button class="miniBtn ${S.avatar[k] === i ? 'on' : ''}" data-act="avPart" data-k="${k}" data-i="${i}">${name}</button>`).join('') +
        `</div></div>`;
    });
    modal(`<h3>编辑形象</h3><div class="avPreview">${Avatar.svg(S.avatar)}</div>${parts}
      <button class="miniBtn" data-act="closeAvatar">完成</button>`, 'avatarModal');
  }

  /* ============ 动作分发 ============ */
  async function handleAct(act, elA) {
    const S = ST.S;
    const arg = elA.dataset;
    switch (act) {
      case 'alloc': {
        if (S.freePoints <= 0) { toast('无自由点'); break; }
        S.dims[arg.dim]++; S.freePoints--; ST.save(); renderGrow(); renderStatusBar(); break;
      }
      case 'preset': {
        if (S.freePoints <= 0) { toast('无自由点'); break; }
        const k = arg.preset;
        while (S.freePoints > 0) { S.dims[k]++; S.freePoints--; }
        ST.save(); renderGrow(); renderStatusBar(); toast('已按流派加点'); break;
      }
      case 'openAvatar': showAvatarModal(); break;
      case 'avPart': {
        S.avatar[arg.k] = parseInt(arg.i, 10); ST.save(); showAvatarModal(); break;
      }
      case 'closeAvatar': closeModal('avatarModal'); renderGrow(); break;

      case 'doExplore': {
        const r = await World.explore(arg.terrain);
        if (!r.ok) { if (r.needTalisman) toast(r.msg + '（可用探索符免限）'); else toast(r.msg); break; }
        showExploreResult(r); renderStatusBar(); break;
      }
      case 'resolveAdv': {
        const box = $('exploreResult');
        const txt = World.resolveAdventure(box._adv.options[parseInt(arg.i, 10)].fn);
        let h = `<h3>行动结果</h3><div class="resultText">${esc(txt)}</div>`;
        if (box._res && box._res.matGained && box._res.matGained.length)
          h += `<div class="resultReward">⛏ 拾得锻造材料：${esc(box._res.matGained.join('、'))}</div>`;
        if (box._res && box._res.bpGained && box._res.bpGained.length)
          h += `<div class="resultReward">📜 获得图纸：${esc(box._res.bpGained.join('、'))}</div>`;
        box.innerHTML = h;
        renderStatusBar(); break;
      }
      case 'resolveStory': {
        const node = decodeURIComponent(arg.node);
        const r = World.resolveStory(node, parseInt(arg.opt, 10));
        let h = '<h3>行动结果</h3><div class="resultText">' + esc(r.text) + '</div>';
        if (r.reward && r.reward.length) h += '<div class="resultReward">' + r.reward.join(' · ') + '</div>';
        if (r.chapterDone) h += '<div class="resultText" style="color:#e8c34a">📜 章节《' + esc(r.chapterDone) + '》完成！</div>';
        $('exploreResult').innerHTML = h;
        renderStatusBar(); renderExplore(); break;
      }
      case 'realm': {
        const r = World.secretRealm(arg.id);
        if (!r.ok) { toast(r.msg); break; }
        let txt = '秘境结算 · 评级【' + r.tier + '】<br>';
        if (r.matGained && r.matGained.length) txt += '⛏ 拾得锻造材料：' + r.matGained.join('、') + '<br>';
        if (r.reward.blueprints && r.reward.blueprints.length) txt += '📜获得图纸：' + r.reward.blueprints.join('、') + '<br>';
        if ((!r.matGained || !r.matGained.length) && !(r.reward.blueprints && r.reward.blueprints.length)) txt += '未获得额外奖励';
        modal(`<h3>秘境·${C.SECRET_REALMS.find(x => x.id === arg.id).name}</h3><div class="gachaRes">${txt}</div><button class="miniBtn" data-act="closeModal">关闭</button>`);
        ST.save(); renderExplore(); renderEquip(); renderRaise(); renderStatusBar(); break;
      }
      case 'train': {
        const COST = 10;
        if (S.stamina < COST) { toast('体力不足（需 ' + COST + '）'); break; }
        S.stamina -= COST;
        const x = ri(15, 30);
        const lv = ST.gainXp(x);
        toast('潜心修炼，体力-' + COST + '，经验+' + x + (lv ? ' 升' + lv + '级' : ''));
        ST.save(); renderExplore(); renderStatusBar(); break;
      }
      case 'rest': {
        const sb = ST.sectBonus();
        const RECOVER = sb.healPct ? Math.round(20 * (1 + sb.healPct)) : 20;
        const COOLDOWN = 3600000;   // 每小时限 1 次，免费
        if (S.stamina >= S.staminaMax) { toast('体力已满'); break; }
        if (S.lastRest && (Date.now() - S.lastRest) < COOLDOWN) {
          const left = Math.ceil((COOLDOWN - (Date.now() - S.lastRest)) / 60000);
          toast('休整冷却中，约 ' + left + ' 分钟后再来'); break;
        }
        S.stamina = Math.min(S.staminaMax, S.stamina + RECOVER);
        S.lastRest = Date.now();
        ST.save(); toast('休整，体力+' + RECOVER + '（每小时限 1 次）'); renderExplore(); renderStatusBar(); break;
      }

      case 'sectTopGo': sectTop = arg.sub; renderSect(); break;
      case 'sectSubGo': sectSub = arg.sub; renderSect(); break;
      case 'sectCreate': {
        const name = ($('sectName') ? $('sectName').value : '').trim();
        const element = $('sectElement') ? $('sectElement').value : '';
        const r = ST.createSect(name, element);
        toast(r.ok ? ('立派成功：' + r.sect.name + '（' + C.EQUIP.SECT_ELEMENTS[element].attr + '）') : r.msg);
        if (r.ok) { sectTop = 'manage'; sectSub = 'ov'; renderSect(); renderStatusBar(); } break;
      }
      case 'sectJoin': {
        const r = ST.joinSect(arg.id);
        toast(r.ok ? ('已加入「' + r.sect.name + '」，享' + C.EQUIP.SECT_ELEMENTS[r.sect.element].attr + '加成') : r.msg);
        if (r.ok) { sectTop = 'manage'; sectSub = 'ov'; renderSect(); renderStatusBar(); } break;
      }
      case 'sectUp': {
        const r = ST.sectUp();
        toast(r.ok ? ('帮派升至 ' + r.level + ' 级，加成系数提升！') : r.msg);
        if (r.ok) { renderSect(); renderStatusBar(); } break;
      }
      case 'sectYield': {
        const r = ST.sectDailyYield();
        toast(r.ok ? ('领取成功：' + r.got.join('、')) : r.msg);
        if (r.ok) { renderSect(); renderStatusBar(); } break;
      }
      case 'sectDonate': {
        const n = $('sectDonateN') ? parseInt($('sectDonateN').value, 10) : 0;
        const r = ST.sectDonate(n);
        toast(r.ok ? ('捐献成功：贡献+' + r.gain + '（办公币-' + r.spend + '）') : r.msg);
        if (r.ok) { renderSect(); renderStatusBar(); } break;
      }
      case 'sectExchange': {
        const r = ST.sectExchange(arg.id);
        toast(r.ok ? ('兑换成功：' + r.got) : r.msg);
        if (r.ok) { renderSect(); renderStatusBar(); } break;
      }
      case 'sectAnnounceEdit': {
        if (!S.sect) { toast('尚未加入帮派'); break; }
        const t = prompt('编辑帮派公告（120 字以内）', S.sect.announce || '');
        if (t === null) break;
        const r = ST.sectAnnounce(t);
        toast(r.ok ? '公告已更新' : r.msg);
        if (r.ok) renderSect(); break;
      }
      case 'sectRename': {
        const t = prompt('输入新的帮派名（2~8 字，耗办公币 ' + C.SECT_RENAME_COST + '）', S.sect ? S.sect.name : '');
        if (t === null) break;
        const r = ST.sectRename(t);
        toast(r.ok ? ('帮派已更名：' + r.name) : r.msg);
        if (r.ok) renderSect(); break;
      }
      case 'sectLeave': {
        if (!S.sect) break;
        if (!confirm('确定退出「' + S.sect.name + '」？将失去其五行加成。')) break;
        const r = ST.sectLeave();
        toast(r.ok ? '已退出帮派' : r.msg);
        sectSub = 'ov'; renderSect(); renderStatusBar(); break;
      }
      case 'sectAccept': {
        const r = ST.sectAcceptApplicant(parseInt(arg.i, 10));
        toast(r.ok ? ('已通过 ' + r.name + ' 的入派申请') : r.msg);
        renderSect(); break;
      }
      case 'sectReject': {
        const r = ST.sectRejectApplicant(parseInt(arg.i, 10));
        toast(r.ok ? '已拒绝该申请' : r.msg);
        renderSect(); break;
      }
      case 'sectBossFight': {
        const r = ST.sectBossFight();
        toast(r.ok ? (r.killed ? ('⚔ ' + r.got.join('，')) : ('造成伤害 ' + fmt(r.dmg) + '，贡献+' + r.contrib)) : r.msg);
        renderSect(); if (r.ok) renderStatusBar(); break;
      }

      case 'upTalent': {
        const r = ST.upTalent(arg.id);
        if (r.fail) { toast(r.msg); renderRaise(); renderStatusBar(); break; }
        if (!r.ok) { toast(r.msg); break; }
        toast('天赋升至 Lv.' + r.lv + '（天赋点-' + r.cost + '）');
        renderRaise(); renderStatusBar(); break;
      }
      case 'talFilter': {
        talCat = arg.cat; renderRaise(); break;
      }
      case 'buy': {
        const all = C.SHOP_SUPPLY.concat(C.SHOP_MARKET);
        const it = all.find(x => x.id === arg.id);
        if (!it) break;
        const r = Shop.buy(it);
        if (!r.ok) { toast(r.msg); break; }
        if (r.needDim) { pickDim(r.item); }
        else if (r.needPill) { pickPill(r.item); }
        else if (r.box) {
          const res = r.result;
          let txt = r.box === 'weapon' ? `获得武器：${res.weapon.name}${res.dup ? '（重复·品质+' + res.plus + '）' : ''}`
            : `获得符文：${res.runeName}（${res.runeDesc}）`;
          modal(`<h3>开箱</h3><div class="gachaRes">${txt}</div><button class="miniBtn" data-act="closeModal">关闭</button>`);
        } else toast('购买成功');
        ST.save(); renderShop(); renderStatusBar(); break;
      }
      case 'buyDim': {
        const S2 = ST.S; const k = arg.dim;
        S2.dimPerm[k] = (S2.dimPerm[k] || 0) + 1; ST.save();
        closeModal(); renderShop(); renderGrow(); renderStatusBar(); toast('永久+' + C.DIMS.find(d => d.key === k).name); break;
      }
      case 'lootDim': {
        const S2 = ST.S; const k = arg.dim;
        S2.dimPerm[k] = (S2.dimPerm[k] || 0) + 1; ST.save();
        closeModal(); renderGrow(); renderStatusBar(); toast('🎁 淬体丹：' + C.DIMS.find(d => d.key === k).name + ' 永久+1'); break;
      }
      case 'buyPill': {
        const S2 = ST.S; const k = arg.dim;
        S2.inventory.pills[k] = (S2.inventory.pills[k] || 0) + 5; ST.save();
        closeModal(); renderShop(); renderGrow(); renderStatusBar(); toast('当日 ' + C.DIMS.find(d => d.key === k).name + ' +5'); break;
      }

      case 'boss': {
        const layer = parseInt(arg.layer, 10);
        const r = await World.bossAttack(layer);
        if (!r.ok) { if (r.gate) toast('推塔未就绪：' + (!r.gate.selfOk ? `需自身 Lv${r.gate.need}` : `全服不足`)); else toast(r.msg); break; }
        const c = r.combat;
        let extra = '';
        if (c.cleared) {
          extra = layer < 9
            ? '<div class="reward">🎉 第' + layer + '层首领已击败！完成通道建设后解锁下一层。</div>'
            : '<div class="reward">🎉 九层妖塔之主已击败，登顶成功！</div>';
          toast(layer < 9 ? '首领已击败，请继续建设通道' : '九层妖塔登顶成功！');
        }
        showCombatLive('推塔·' + C.bossStats(layer).name, c, {
          extra: extra,
          after: function () {
            if (r.matGained && r.matGained.length) { toast('材料：' + r.matGained.join('、')); }
            if (r.bpGained && r.bpGained.length) { toast('📜图纸：' + r.bpGained.join('、')); }
            syncLayersOnly().then(renderCoop);
            renderCoop(); renderStatusBar();
          }
        }); break;
      }
      case 'channel': {
        const layer = parseInt(arg.layer, 10);
        const r = await World.channelDonate(layer, 20);
        if (!r.ok) { toast(r.msg); break; }
        if (r.unlocked) toast(r.msg || ('第' + r.unlocked + '层解锁！'));
        else toast('捐献材料 ' + (r.give || 0) + '，通道 ' + Math.round(r.progress * 100) + '%');
        await syncLayersOnly();
        renderCoop(); renderStatusBar(); break;
      }
      case 'spar': {
        const r = World.friendSpar(parseInt(arg.id, 10));
        if (!r.ok) { toast(r.msg); break; }
        showCombatLive('切磋·' + r.friend.name, r.combat, { after: function () { renderCoop(); renderStatusBar(); } });
        break;
      }
      case 'sparFriend': {
        sparRealFriend({ id: decodeURIComponent(arg.id), name: decodeURIComponent(arg.id) });
        break;
      }

      case 'gongfaActive': {
        const r = ST.setActiveGongfa(a.dataset.id);
        toast(r.msg); renderGongfa(); renderStatusBar(); break;
      }
      case 'gongfaUpgrade': {
        const r = ST.upgradeGongfa(a.dataset.id);
        toast(r.msg); renderGongfa(); renderStatusBar(); break;
      }
      case 'learnBook': {
        const r = ST.learnGongfaBook(a.dataset.uid);
        toast(r.msg); renderGongfa(); renderBackpack(); renderStatusBar(); break;
      }
      case 'goBag': switchTab('bag'); renderBackpack(); break;
      case 'goSect': switchTab('sect'); renderSect(); break;
      case 'closeModal': closeModal(); break;
      case 'refresh': syncAll(); toast('已同步全服进度'); break;
      case 'help': modal(HELP_HTML + '<button class="miniBtn" data-act="closeModal">关闭</button>'); break;
      case 'cloud': {
        const data = ST.S; ST.save();
        API.saveProgress(data).then(() => toast('联网档案已保存')).catch(() => toast('云端保存失败，请保持页面并重试'));
        break;
      }
    }
  }

  /* ============ ⑨ 功法修炼 ============ */
  const GF_WORLDVIEW = '大道不可同修，修士体内道则互斥，纵然习得万千功法，战斗之时只能择取一门催动，多法同修极易道则冲突、自身崩毁。';
  const GONGFA_DIM_NAME = { str: '力量', spd: '速度', agi: '敏捷', def: '体质', luc: '灵力' };
  const GONGFA_LABELS = {
    critDmgAdd: v => `暴击伤害 +${pct(v)}`,
    reduction: v => `受到全伤害 -${pct(v)}`,
    reductionMagic: v => `受到道则/法术伤害 -${pct(v)}`,
    critReduc: v => `受到暴击伤害 -${pct(v)}`,
    reflect: v => `反震伤害 +${pct(v)}`,
    lifesteal: v => `吸血 +${pct(v)}`,
    skillDmg: v => `主动技能伤害 +${pct(v)}`,
    skillChance: v => `主动技能触发概率 +${pct(v)}`,
    qiRegen: v => `每回合回灵 +${v}`,
    dotDmg: v => `法术持续伤害 +${pct(v)}`,
    allDmg: v => `全类型伤害 +${pct(v)}`,
    allRedu: v => `全类型减伤 +${pct(v)}`,
    regen: v => `每回合回复生命 +${pct(v)}`,
    shieldMul: v => `护盾厚度 +${pct(v)}`,
    shieldExtraRedu: v => `护盾期间额外减伤 +${pct(v)}`,
    healShieldMul: v => `护盾/治疗 +${pct(v)}`,
    firstStrikeIgnoreDef: v => `先手无视防御 +${pct(v)}`,
    firstHitDmg: v => `首击伤害 +${pct(v)}`,
    towerBonus: v => `对妖塔怪物伤害 +${pct(v)}`,
    enemyLowHp25Crit: () => `敌方血量<25% 攻击必定暴击`,
    basicHitHeal: v => `普攻命中回复生命 +${pct(v)}`,
    killHeal8: v => `击杀回复生命 +${pct(v)}`,
    critExtraShadow: v => `暴击追加暗影伤害 +${pct(v)}`,
    dodgeChance: v => `常态闪避 +${pct(v)}`,
    dodgeThenNextAtk: v => `闪避后下次攻击 +${pct(v)}`,
    killStackStr: v => `每次击杀永久 +${pct(v)} 力量(可叠)`,
    lowHpStr: v => `血量越低力量越高(上限+${pct(v)})`,
    strUpOnHit: () => `受击小概率临时激发圣力`,
    perHigherDim: v => `每项属性压制额外增伤 +${pct(v)}`,
    perDebuffRedu: v => `每存在1负面减伤 +${pct(v)}`,
    openSuppress: () => `开局压制敌方首次攻击/伤害`,
    critCutEnemyQi: v => `暴击削敌灵力并降其技能概率 ${pct(v)}`,
    openSkillChance: v => `开局有概率抢先释放主动技能(${pct(v)})`,
    skillChanceStack: () => `每回合提升主动技能频率(可叠)`,
    bleedOnHit: v => `攻击概率附加灼烧(概率${pct(v.prob)})`,
    burnOnHit: v => `攻击概率附加灼烧(概率${pct(v.prob)})`,
    bleedBonus: v => `对流血目标伤害 +${pct(v)}`,
    hitReduceEnemyAllDmg: v => `命中降低敌方全伤害 ${pct(v)}`,
    bleedTurnsBonus: v => `流血/灼烧持续 +${v} 回合`,
    extendEnemyCd: v => `命中延长敌方技能CD +${v}`,
    highHp70ImmuneBleed: () => `血量>70% 免疫流血类debuff`,
    enemyDebuffChanceReduce: v => `被挂debuff概率 -${pct(v)}`,
    debuffDurReduce: v => `负面状态持续时间缩短 ${pct(v)}`,
    breakArmor: v => `破甲效果 +${pct(v)}`,
    startShield: v => `开局获得神魂护盾(生命${pct(v)})`,
    skillGivesShield: v => `释放主动技能后获得符文护盾(生命${pct(v)})`
  };
  function pct(v) { return Math.round(v * 100) + '%'; }
  function gfEffectLines(gf, lv) {
    const frac = 0.4 + 0.6 * (lv - 1) / (gf.maxLevel - 1);
    const e = gf.effects; const lines = [];
    if (e.dimPct) for (const k in e.dimPct) lines.push(`<b style="color:#7fd">${GONGFA_DIM_NAME[k] || k}</b> +${pct(e.dimPct[k] * frac)}`);
    for (const k in e) {
      if (k === 'dimPct') continue;
      const lab = GONGFA_LABELS[k]; if (!lab) continue;
      const v = e[k];
      lines.push(lab(typeof v === 'number' ? v * frac : v));
    }
    return lines;
  }
  function renderGongfa() {
    const S = ST.S;
    ST.gongfaAutoUnlock();
    const active = S.gongfa.active;
    const activeDef = active ? C.gongfaDef(active) : null;
    const books = S.gongfaBooks || [];
    const elOfGf = {}; Object.keys(C.EQUIP.SECT_ELEMENTS).forEach(k => { const gid = C.EQUIP.SECT_ELEMENTS[k].gongfa; if (gid) elOfGf[gid] = k; });
    let html = `<div class="card"><h3>⑨ 功法修炼（一次仅可修炼一套）</h3>`;
    html += `<p class="tip">【当前修炼：<b>${activeDef ? activeDef.name : '无'}</b>】${activeDef ? '（' + S.gongfa.unlocked[active] + '级）' : ''} ｜ 提示：一次仅可修炼一套，更换功法请返回备战界面。</p>`;
    html += `<p class="tip">📜 功法点 <b>${S.daoYun}</b> ｜ 升级材料（仙金仅用于红色帝器，不参与功法养成）。</p>`;
    html += `<p class="tip">世界观：${GF_WORLDVIEW}</p>`;
    html += `<div class="gongfaGrid">`;
    C.GONGFA_LIST.forEach(id => {
      const gf = C.gongfaDef(id);
      const lv = S.gongfa.unlocked[id] || 0;
      const unlocked = !!S.gongfa.unlocked[id];
      const isActive = active === id;
      const max = lv >= gf.maxLevel;
      const lines = gfEffectLines(gf, Math.max(1, lv || 1));
      let actions = '';
      if (!unlocked) {
        // 解锁前提：参悟对应功法书，或加入拥有该镇派功法的帮派
        const book = books.find(b => b.gfId === id && !b.learned);
        const elKey = elOfGf[id];
        let req = '需参悟《' + gf.name + '》功法书';
        if (elKey) req += '，或加入「' + C.EQUIP.SECT_ELEMENTS[elKey].attr + '」帮派习得镇派功法';
        let btn;
        if (book) btn = `<button class="miniBtn primary" data-act="goBag">背包参悟</button>`;
        else if (elKey) btn = `<button class="miniBtn primary" data-act="goSect">${S.sect ? '前往帮派' : '加入' + C.EQUIP.SECT_ELEMENTS[elKey].name + '帮派'}</button>`;
        else btn = `<span class="badge">未得功法书</span>`;
        actions = `<div class="gfReq">${req}</div>${btn}`;
      } else {
        if (isActive) actions = `<span class="badge on">修炼中</span>`;
        else actions = `<button class="miniBtn" data-act="gongfaActive" data-id="${id}">修炼</button>`;
        if (!max) {
          const cost = C.gongfaUpCost(lv);
          actions += ` <button class="miniBtn ${S.daoYun >= cost ? 'primary' : 'locked'}" data-act="gongfaUpgrade" data-id="${id}">升级→${lv + 1}（${cost}残卷）</button>`;
        } else actions += ` <span class="badge">满级</span>`;
      }
      html += `<div class="gongfaItem ${isActive ? 'active' : ''} ${unlocked ? '' : 'locked'}">
        <div class="gfHead"><b>${gf.name}</b> <span class="tag">${gf.school}</span>${unlocked ? `<span class="lv">Lv${lv}${max ? '·满' : ''}</span>` : `<span class="lv locked">未解锁</span>`}</div>
        <div class="gfDesc">${gf.desc}</div>
        <div class="gfEffects">${lines.map(l => `<span class="gfLine">· ${l}</span>`).join('')}</div>
        ${gf.maxEffect ? `<div class="gfMax ${max ? 'on' : ''}">★ 满级特效：${gf.maxEffect.desc} ${max ? '（已激活）' : '（升级至满级解锁）'}</div>` : ''}
        <div class="gfAct">${actions}</div>
      </div>`;
    });
    html += `</div></div>`;
    $('tab-gongfa').innerHTML = html;
  }

  function pickDim(item) {
    const opts = C.DIMS.map(d => `<button class="miniBtn" data-act="buyDim" data-dim="${d.key}">${d.name}</button>`).join('');
    modal(`<h3>${item.name}</h3><p>选择要永久提升的一维：</p><div class="actionRow">${opts}</div>`);
  }

  function pickPill(item) {
    const opts = C.DIMS.map(d => `<button class="miniBtn" data-act="buyPill" data-dim="${d.key}">${d.name}（+5/当日）</button>`).join('');
    modal(`<h3>${item.name}</h3><p>选择要临时增强的一维（当日 +5，可叠加）：</p><div class="actionRow">${opts}</div>`);
  }

  /* ============ ⑩ 统一背包 ============ */
  function renderBackpack() {
    const S = ST.S;
    function bagQColor(it) {
      if (it.zhengdao || it.growth) return '#e0533f';
      return (C.EQUIP && C.EQUIP.QUAL && C.EQUIP.QUAL[it.quality]) ? C.EQUIP.QUAL[it.quality].color : '#fff';
    }
    function bagSlotName(k) { const s = (C.EQUIP && C.EQUIP.SLOTS || []).find(x => x.key === k); return s ? s.name : k; }
    function bagWType(w) { const t = C.EQUIP && C.EQUIP.WTYPES && C.EQUIP.WTYPES[w]; return t ? t.name : ''; }
    function bagAffText(a) {
      if (!a) return '';
      if (a.cat === 'dim') { const dn = { str: '力', spd: '速', agi: '敏', def: '御', luc: '运' }[a.kind] || '维'; return '+' + a.val + dn; }
      else if (a.cat === 'atk') return '攻+' + a.val + '%';
      else if (a.cat === 'crit') return '暴+' + a.val + '%';
      else if (a.cat === 'dodge') return '闪+' + a.val + '%';
      else if (a.cat === 'hp') return '命+' + a.val;
      else if (a.cat === 'redu') return '物减+' + a.val + '%';
      else if (a.cat === 'reduMagic') return '法减+' + a.val + '%';
      else if (a.cat === 'critReduc') return '抗暴+' + a.val + '%';
      else if (a.cat === 'critDmg') return '暴伤+' + a.val + '%';
      else if (a.cat === 'sp') return '异象';
      else if (a.cat === 'ult') return '【证道唯一】';
      return a.name || '';
    }
    function isEquipped(it) {
      if (it.slot === 'weapon') return !S.zhengdao && S.equipSlots.weapon === it.uid;
      return S.equipSlots[it.slot] === it.uid;
    }

    /* —— 货币 / 资源 —— */
    const cur = [
      { ic: '💰', n: '办公币', v: S.stone },
      { ic: '✨', n: '天赋点', v: S.jing },
      { ic: '📜', n: '功法点', v: S.daoYun },
      { ic: '🎫', n: '探索符', v: S.talisman }
    ];
    const curHtml = `<div class="bagRow">${cur.map(x => `<span class="bagChip"><b>${x.ic}</b>${x.n}<i>${x.v}</i></span>`).join('')}</div>`;

    /* —— 通用材料 + 烬赤源核 —— */
    const matHtml = (S.inventory && S.inventory.materials)
      ? `<span class="bagChip"><b>🔩</b>通用锻造材料<i>${S.inventory.materials}</i></span>` : '';
    const jinchiHtml = (S.jinchi > 0)
      ? `<span class="bagChip" style="border-color:#e83a3a"><b>🔴</b>烬赤源核<i>${S.jinchi}</i></span>` : '';

    /* —— 遮天神材 —— */
    const matKeys = Object.keys(S.mat || {}).filter(k => (S.mat[k] || 0) > 0);
    const godMatHtml = matKeys.length ? matKeys.map(k => {
      const m = (C.EQUIP && C.EQUIP.MATS && C.EQUIP.MATS[k]) || { name: k, color: '#ccc' };
      return `<span class="bagChip" style="border-color:${m.color}"><b>⛏</b>${m.name}<i>${S.mat[k]}</i></span>`;
    }).join('') : '<span class="tip">暂未采集到遮天神材</span>';

    /* —— 符文 —— */
    const runeHtml = (S.runeBag && S.runeBag.length)
      ? S.runeBag.map(r => `<span class="bagChip" title="${r.desc || ''}"><b>📿</b>${r.name}<small>${r.desc || ''}</small></span>`).join('')
      : '<span class="tip">暂无符文（探索/剧情/符文箱可获取）</span>';

    /* —— 图纸 —— */
    const bpKeys = Object.keys(S.blueprints || {}).filter(k => (S.blueprints[k] || 0) > 0);
    const bpHtml = bpKeys.length ? bpKeys.map(k => {
      const bp = (C.BLUEPRINTS && C.BLUEPRINTS[k]) || { name: k };
      const q = bp.quality || '';
      const qc = (C.EQUIP && C.EQUIP.QUAL && C.EQUIP.QUAL[q]) ? C.EQUIP.QUAL[q].color : '#ccc';
      return `<span class="bagChip" style="border-color:${qc}"><b>${bp.icon || '📐'}</b>${bp.name}<i>×${S.blueprints[k]}</i></span>`;
    }).join('') : '<span class="tip">暂无图纸（探索/秘境可掉落）</span>';

    /* —— 资质丹 —— */
    const pills = (S.inventory && S.inventory.pills) || {};
    const pillHtml = (['str', 'spd', 'agi', 'def', 'luc']).filter(k => (pills[k] || 0) > 0).map(k =>
      `<span class="bagChip"><b>💊</b>${ { str: '力', spd: '速', agi: '敏', def: '御', luc: '运' }[k] }资质丹<i>${pills[k]}</i></span>`).join('') || '<span class="tip">暂无资质丹</span>';

    /* —— 功法书 —— */
    const books = S.gongfaBooks || [];
    const bookHtml = books.length ? books.map(b => {
      const g = (C.GONGFA && C.GONGFA[b.gfId]) || { name: b.gfId };
      const act = b.learned
        ? '<span class="badge on" style="margin-left:6px">已参悟</span>'
        : `<button class="miniBtn primary" data-act="learnBook" data-uid="${b.uid}" style="margin-left:6px">参悟</button>`;
      return `<div class="bagBook"><span class="bagChip"><b>📖</b>${g.name}<i>${b.learned ? '已参悟' : '未参悟'}</i></span>${act}</div>`;
    }).join('') : '<span class="tip">暂无功法书（探索/秘境/升级抽取可爆出，参悟后习得对应功法）</span>';

    /* —— 装备 —— */
    const eqHtml = (S.equipBag && S.equipBag.length)
      ? S.equipBag.map(it => {
        const color = bagQColor(it);
        const aff = (it.affixes || []).map(bagAffText).join('，');
        const eqTag = isEquipped(it) ? '<span class="ownTag">已装备</span>' : '';
        const typeTxt = it.zhengdao ? ('证道·' + bagWType(it.wtype))
          : (it.growth ? '成长装备' : (it.wtype ? bagWType(it.wtype) : (it.type ? '主' + { str: '力', spd: '速', agi: '敏', def: '御', luc: '运' }[it.type] : '')));
        return `<div class="eqItem" style="border-color:${color}">
          <b>${it.name}</b><span class="ownTag" style="color:${color}">${it.growth ? '成长' : it.quality}</span>${eqTag}
          <small>${bagSlotName(it.slot)} · ${typeTxt}${it.growthLv ? ' Lv' + it.growthLv : ''}</small>
          <small>${aff}</small></div>`;
      }).join('')
      : '<span class="tip">暂无装备（去养成页「打造工作台」锻造）</span>';

    $('tab-bag').innerHTML = `
      <div class="card"><h3>🎒 统一背包</h3>
        <p class="tip">这里汇总你探索与养成所得的全部物品，方便一处查看。</p>

        <h4 class="bagH">货币 / 资源</h4>${curHtml}

        <h4 class="bagH">材料</h4>
        <div class="bagRow">${matHtml}${jinchiHtml}</div>
        <div class="bagRow">${godMatHtml}</div>

        <h4 class="bagH">符文（装备镶嵌用）</h4><div class="bagRow">${runeHtml}</div>

        <h4 class="bagH">锻造图纸</h4><div class="bagRow">${bpHtml}</div>

        <h4 class="bagH">资质丹</h4><div class="bagRow">${pillHtml}</div>

        <h4 class="bagH">功法书</h4><div class="bagRow">${bookHtml}</div>

        <h4 class="bagH">装备（${S.equipBag.length}）</h4>
        <div class="eqBagGrid">${eqHtml}</div>
      </div>`;
  }

  const HELP_HTML = `<h3>玩法说明</h3>
    <p>九层妖塔：探索妖塔大陆、变强，与全服合力推平每层 Boss。九层通关即胜利。</p>
    <ul>
      <li><b>成长</b>：五维加点、命格、捏脸、战力。</li>
      <li><b>探索</b>：每步1体力，随机事件（奇遇/战斗/宝箱/修炼/秘境/线索）。每日10次限额。</li>
      <li><b>装备 §8</b>：无固定成品掉落，全部装备由<b>养成页·打造工作台</b>用材料锻造（白/绿/蓝/紫/橙五品质、随机词条）。武器位可被<b>证道武器</b>占用（可无限重塑）；🔴烬赤源核打造的<b>成长装备</b>无穿戴等级、可喂材料无限成长。升级不再掉成品武器（改为锻造材料）。装备词条与五维/命格乘法叠加。</li>
      <li><b>养成</b>：升级领悟<b>天赋</b>（31 种，重复自动+1 级、满级转 💠天赋点，可在养成页手动升级）。</li>
      <li><b>物资</b>：物资库与秘市均以<b>办公币</b>结算（秘市含稀有/限购项）。</li>
      <li><b>协作</b>：推塔消耗${C.STAMINA_PER_BOSS}体力，每日限 ${C.BOSS_DAILY_LIMIT} 次，Boss 血池全服共享；需自身达档 + 全服人数门槛；神秘通道捐材料解锁上层；论道切磋好友。</li>
    </ul>`;

  /* 云端存档逻辑已内联至 case 'cloud'（调用 API.saveProgress） */

  /* ============ 绑定 + 初始化 ============ */
  function bind() {
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-act]');
      if (a) { handleAct(a.dataset.act, a); return; }
    });
    document.querySelectorAll('#nav .cap').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#nav .cap').forEach(x => x.classList.remove('on'));
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        $('tab-' + b.dataset.tab).classList.add('on');
        renderTab(b.dataset.tab);
      });
    });
    const br = document.getElementById('btnRefresh'); if (br) br.addEventListener('click', () => { syncAll(); toast('已同步全服进度'); });
    const bh = document.getElementById('btnHelp'); if (bh) bh.addEventListener('click', () => handleAct('help'));
    const bc = document.getElementById('btnCloud'); if (bc) bc.addEventListener('click', () => handleAct('cloud'));
  }

  function renderTab(name) {
    if (name === 'grow') renderGrow();
    else if (name === 'explore') renderExplore();
    else if (name === 'equip') renderEquip();
    else if (name === 'raise') renderRaise();
    else if (name === 'forge') renderForge();
    else if (name === 'sect') renderSect();
    else if (name === 'shop') renderShop();
    else if (name === 'coop') renderCoop();
    else if (name === 'friend') renderFriend();
    else if (name === 'gongfa') renderGongfa();
    else if (name === 'bag') renderBackpack();
    else if (name === 'rank') renderRank();
  }
  // 切换一级标签页（供按钮跳转用）
  function switchTab(name) {
    document.querySelectorAll('#nav .cap').forEach(x => x.classList.remove('on'));
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
    const cap = document.querySelector('#nav .cap[data-tab="' + name + '"]');
    if (cap) cap.classList.add('on');
    const tab = document.getElementById('tab-' + name);
    if (tab) tab.classList.add('on');
    renderTab(name);
  }

  /* 后端权威数据同步：全服 KPI / 层状态 / 云端存档 */
  async function pullServerState() {
    try { const srv = await API.getServer(); ST.applyServer(srv); } catch (e) {}
    try { const ls = await API.getLayers(); ST.applyLayers(ls); } catch (e) {}
  }
  async function pullCloudSave() {
    try {
      const p = await API.getProgress();
      if (p && p.saveData) ST.applyCloud(p.saveData);
      applyAccountName();
      // 覆盖附件存档里可能残留的旧昵称，并把本站账号名写回联网档案。
      ST.save();
    } catch (e) {}
  }
  async function syncLayersOnly() {
    try { const ls = await API.getLayers(); ST.applyLayers(ls); } catch (e) {}
  }
  function renderAll() {
    renderStatusBar(); renderGrow(); renderExplore(); renderEquip(); renderRaise(); renderForge(); renderSect(); renderShop(); renderCoop(); renderGongfa(); renderBackpack();
  }
  async function syncAll() {
    await pullServerState();
    renderAll();
  }

  /* ============ ⑬ 榜单（用户战力排名 + 神兵战力排名） ============ */
  function renderRank() {
    const S = ST.S;
    // —— 我的神兵战力排名（逐件装备按单件战力降序）——
    const godList = (S.equipBag || []).slice();
    if (S.zhengdao) godList.push(S.zhengdao);
    godList.forEach(it => { it._pw = ST.equipItemPower(it); });
    godList.sort((a, b) => b._pw - a._pw);
    const setName = it => (it.set && C.EQUIP && C.EQUIP.SETS && C.EQUIP.SETS[it.set]) ? C.EQUIP.SETS[it.set].name : (it.set || '无套装');
    const isWorn = it => it.zhengdao || (S.equipSlots && Object.keys(S.equipSlots).some(k => S.equipSlots[k] === it.uid));
    const godRows = godList.length ? godList.map((it, i) => `
      <div class="friendRow ${isWorn(it) ? 'on' : ''}">
        <span class="rk" style="width:26px;text-align:center;opacity:.7">${i + 1}</span>
        <span class="nm" style="flex:1;color:${RARITY_COLOR[it.quality] || '#ccc'}">${esc(it.name || '未命名')}</span>
        <span class="meta" style="opacity:.8">${esc(it.quality || '?')} · ${esc(setName(it))}${isWorn(it) ? ' · 穿戴中' : ''}</span>
        <span class="pw" style="min-width:64px;text-align:right">⚔ ${it._pw}</span>
      </div>`).join('') : `<div class="tip">暂无形神兵，去锻造或探索获取吧</div>`;

    $('tab-rank').innerHTML = `
      <div class="card"><h3>🏆 用户战力排名（全服）</h3>
        <div class="tip">按战力降序，含自己；数据来自全服玩家存档。</div>
        <div id="rankUserList"><div class="tip">加载中…</div></div>
      </div>
      <div class="card"><h3>⚔ 神兵战力排名（我的）</h3>
        <div class="tip">按单件装备战力降序（与总战力同算法）。</div>
        <div class="rankList">${godRows}</div>
      </div>`;

    // —— 用户战力排名（异步，全服）——
    API.getRanking(50).then(list => {
      const rows = (list || []).map((p, i) => {
        const me = p.name === S.name;
        return `<div class="friendRow ${me ? 'on' : ''}">
          <span class="rk" style="width:26px;text-align:center;opacity:.7">${i + 1}</span>
          <span class="nm" style="flex:1">${esc(p.name || '无名')} <small>Lv${p.level || 1}</small></span>
          <span class="pw" style="min-width:64px;text-align:right">⚔ ${p.power || 0}</span>
        </div>`;
      }).join('');
      const box = $('rankUserList');
      if (box) box.innerHTML = rows || `<div class="tip">暂无数据</div>`;
    }).catch(() => {
      const box = $('rankUserList');
      if (box) box.innerHTML = `<div class="tip">联网排行榜暂不可用，请稍后重试</div>`;
    });
  }

  function init() {
    ST.load();
    applyAccountName();
    ST.ensureDaily();
    renderStatusBar();
    renderGrow();
    bind();
    // 后台从后端同步全服权威数据（server/layers），不阻塞首屏
    pullServerState().then(renderAll).catch(renderAll);
    // 加载探索剧情库（后端优先，失败用内置兜底）
    World.loadStories().catch(function () {});
    // 拉取本站只读配置；失败则使用源码内置默认值。
    API.getSettings().then(function (list) {
      if (global.CFG && global.CFG.applyServerConfig) global.CFG.applyServerConfig(list);
      ST.ensureDaily(); renderAll();
    }).catch(function () {});
    // 个人进度：联网档案优先，再渲染。
    pullCloudSave().then(function () {
      renderAll();
      // 父页面保持不可交互遮罩，直到联网档案已经同步应用，避免默认态
      // 在极窄窗口内接受操作后又被云档覆盖。
      if (API.notifyHydrated) API.notifyHydrated();
    });
    // 每 60 秒检测跨天，确保 0 点自动补满体力/探索符（无需刷新页面）
    setInterval(function () { ST.ensureDaily(); renderStatusBar(); }, 60000);
  }

  function applyAccountName() {
    const name = API.getDisplayName && API.getDisplayName();
    if (name) ST.S.name = name;
  }

  global.UI = { init, renderStatusBar, renderTab, switchTab, toast, modal, closeModal, showLevelDraw };
})(window);
