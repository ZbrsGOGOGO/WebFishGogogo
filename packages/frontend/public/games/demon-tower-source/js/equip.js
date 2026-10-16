/* =========================================================================
 * 九层妖塔 · 装备 / 打造系统 UI + 交互 (equip.js)  §8
 * 数据/逻辑见 state.js（ST.forgeEquip 等）+ config.js（CFG.EQUIP）。
 * 本文件只负责渲染「穿戴装备/装备背包/打造工作台」并分发 [data-eqact] 点击。
 * ========================================================================= */
(function (global) {
  'use strict';
  const C = global.CFG, ST = global.ST;
  // 注意：equip.js 在 ui.js 之前加载，UI 必须在调用时从 global 取值（用 global.UI）

  /* ---------- 工具 ---------- */
  function affText(a) {
    if (!a) return '';
    const tierColor = { common: '#9ad0ff', rare: '#c98cd9', ultimate: '#ffd23a' }[a.tier] || '#ddd';
    let eff = '';
    if (a.cat === 'dim') { const dn = { str: '力', spd: '速', agi: '敏', def: '御', luc: '运' }[a.kind] || '维'; eff = '+' + a.val + dn; }
    else if (a.cat === 'atk') eff = '攻+' + a.val + '%';
    else if (a.cat === 'crit') eff = '暴+' + a.val + '%';
    else if (a.cat === 'dodge') eff = '闪+' + a.val + '%' + (a.dodgeFollowup ? (' 闪后追伤+' + a.dodgeFollowup + '%') : '');
    else if (a.cat === 'hp') eff = '命+' + a.val;
    else if (a.cat === 'redu') eff = '物减+' + a.val + '%';
    else if (a.cat === 'reduMagic') eff = '法减+' + a.val + '%';
    else if (a.cat === 'critReduc') eff = '抗暴+' + a.val + '%';
    else if (a.cat === 'critDmg') eff = '暴伤+' + a.val + '%';
    else if (a.cat === 'lifesteal') eff = '吸血+' + a.val + '%' + (a.killHeal ? (' 击杀回' + a.killHeal + '%') : '');
    else if (a.cat === 'ignoreDefHit') eff = '破甲·命降敌防' + a.val + '%';
    else if (a.cat === 'reflect') eff = '反伤+' + a.val + '%';
    else if (a.cat === 'defPct') eff = '御+' + a.val + '%' + (a.enemyAtkDown ? (' 敌攻-' + a.enemyAtkDown + '%') : '');
    else if (a.cat === 'enemyAtkDown') eff = '敌攻-' + a.val + '%';
    else if (a.cat === 'dodgeFollowup') eff = '闪后追伤+' + a.val + '%';
    else if (a.cat === 'atkStack') eff = '风行·每回合攻+3%(≤3层)';
    else if (a.cat === 'survive1') eff = '御灵·保命1点';
    else if (a.cat === 'sp') eff = '异象';
    else if (a.cat === 'ult') eff = '【证道唯一】全道则暴涨';
    const nm = (a.tier === 'ultimate' ? '【道则】' : '') + (a.name || '');
    return `<span style="color:${tierColor}">${nm}</span>${eff ? '(' + eff + ')' : ''}`;
  }
  // 套装归属着色文本
  function setText(setId) {
    if (!setId) return '';
    const S = CFG.EQUIP.SETS[setId]; if (!S) return '';
    return `<span style="color:${S.color}">〔${S.name}〕</span>`;
  }
  function affixPoolText(pool) {
    if (!pool || !pool.length) return '';
    return pool.map(id => { const a = CFG.EQUIP.AFFIX_BY_ID[id]; return a ? a.name : id; }).join('/');
  }
  function matText(cost) { return Object.keys(cost).map(k => (C.EQUIP.MATS[k] ? C.EQUIP.MATS[k].name : k) + '×' + cost[k]).join(' '); }
  function dimName(k) { return { str: '力量', spd: '速度', agi: '敏捷', def: '防御', luc: '幸运' }[k] || k; }
  function slotName(k) { const s = C.EQUIP.SLOTS.find(x => x.key === k); return s ? s.name : k; }
  function qColor(it) {
    if (it.zhengdao) { const st = ST.zdStage && ST.zdStage(); if (st && st.emperor) return '#ff3a3a'; return '#e0533f'; }
    if (it.growth) return '#e0533f';
    return C.EQUIP.QUAL[it.quality] ? C.EQUIP.QUAL[it.quality].color : '#fff';
  }
  // 装备明细（名称/品质/部位/流派/套装/词条）—— 用于打造结果反馈与背包详情
  function itemDetailHtml(it) {
    const color = qColor(it);
    const aff = it.affixes.map(affText).join('，');
    const setT = setText(it.set);
    const wt = it.wtype ? ((C.EQUIP.WTYPES[it.wtype] || {}).name || '') : '';
    const gradeTag = it.growth ? '成长' : (it.red ? '帝兵' : (it.zhengdao ? '证道' : ''));
    const req = it.reqLevel ? ('需' + it.reqLevel + '级') : '无等级';
    return `<div class="eqItem" style="border-color:${color};margin:8px 0">
      <div class="eqItemHead"><b>${it.name}</b><span class="ownTag" style="color:${color}">${gradeTag || it.quality} · ${slotName(it.slot)}</span></div>
      <small>${wt ? ('流派·' + wt + ' ｜ ') : ''}${setT || '无套装'} ｜ ${req}${it.red ? ' ｜ 无等级限制' : ''}</small>
      <small><b>词条：</b>${aff || '无'}</small>
    </div>`;
  }
  // 打造结果弹窗（解决“打造后没反馈/不知道打了啥/词条无”）
  function forgeResultModal(r) {
    const it = r.item;
    const color = qColor(it);
    const head = r.fail ? '🔨 打造失败（残次）' : '🎉 锻造成功';
    const sub = `主材品质 <b>${r.matQual}</b> ｜ 精炼等级 <b>${r.grade}</b> → 产出 <b style="color:${color}">${r.qual}</b>${r.fail ? '（残次·材料不返还）' : ''} ｜ 综合成功率 ${r.succPct}%`;
    global.UI.modal(`<h3>${head}</h3><p class="tip">${sub}</p>${itemDetailHtml(it)}<div style="text-align:right;margin-top:10px"><button class="miniBtn primary" data-act="closeModal">收下</button></div>`);
  }
  // 精炼台：计算并显示某次精炼的消耗/产出预览
  function refineNeed(grade, ore) {
    const t = (C.EQUIP.REFINE.tiers || []).find(x => x.grade === grade);
    if (!t) return null;
    return { fromGrade: t.fromGrade, need: t.need, reagent: t.reagent, reagentName: t.reagentName, rneed: t.rneed || 1, yield: t.yield, oreName: (C.EQUIP.MATS[ore] || {}).name || ore };
  }
  function updRefineTip() {
    const tip = document.getElementById('eqRefineTip');
    const gEl = document.getElementById('eqRefineGrade');
    const oEl = document.getElementById('eqRefineOre');
    const nEl = document.getElementById('eqRefineN');
    if (!tip || !gEl || !oEl || !nEl) return;
    const grade = gEl.value, ore = oEl.value;
    const n = Math.max(1, parseInt(nEl.value, 10) || 1);
    const t = refineNeed(grade, ore);
    if (!t) { tip.textContent = '未知精炼等级'; return; }
    const src = t.fromGrade === '原矿' ? ST.S.mat : ((ST.S.refine || {})[t.fromGrade] || {});
    const oreHave = src[ore] || 0;
    const rgHave = ST.S.mat[t.reagent] || 0;
    const rgNeed = t.rneed * n;
    const fromName = t.fromGrade === '原矿' ? t.oreName : ('已' + t.fromGrade + t.oreName);
    tip.innerHTML = `精炼「${t.oreName} → ${grade}」：消耗 ${fromName}×${t.need * n} + ${t.reagentName}×${rgNeed}（持有 ${oreHave} / ${t.reagentName} ${rgHave}）→ 产出 ${grade}${t.oreName}×${t.yield * n}。` +
      (oreHave < t.need * n ? ' <span class="lack">原料不足</span>' : '') + (rgHave < rgNeed ? ' <span class="lack">耗材不足</span>' : '');
  }
  function recipeGuide() {
    const cats = { metal: '金属系', leather: '皮甲系', jade: '玉髓系' };
    return Object.keys(cats).map(cat => {
      const lines = ['白', '绿', '蓝', '紫', '橙'].map(q => {
        const cost = C.EQUIP.RECIPE[cat][q];
        const s = Object.keys(cost).map(k => C.EQUIP.MATS[k].name + '×' + cost[k]).join('+');
        return q + ':' + s;
      }).join(' ');
      return cats[cat] + ' → ' + lines;
    }).join('<br>');
  }
  function refresh() { try { global.UI.renderTab('equip'); global.UI.renderTab('raise'); global.UI.renderTab('forge'); global.UI.renderStatusBar(); EQ.updRefineTip(); } catch (e) {} }

  /* ---------- 消耗预览：让玩家锻造前看清具体扣哪些材料 ---------- */
  // 余量对比芯片：材料名 持有/需求，不足标红
  function costChips(cost, refineGrade) {
    const S = ST.S;
    const useRefine = refineGrade && refineGrade !== '原矿';
    return Object.keys(cost).map(k => {
      const m = C.EQUIP.MATS[k] || { name: k };
      const fromRefine = useRefine && (C.EQUIP.MATS[k] || {}).tier < 5;
      const src = fromRefine ? ((S.refine || {})[refineGrade] || {}) : S.mat;
      const have = src[k] || 0, need = cost[k];
      const tag = fromRefine ? '（精炼）' : '';
      return `<span class="matChip ${have < need ? 'lack' : ''}">${m.name}${tag} ${have}/${need}${have < need ? '（不足）' : ''}</span>`;
    }).join('');
  }
  // 计算一次锻造的确定性消耗（复刻 state.forgeEquip：配方×精炼倍率向上取整 + 辅料并入）
  function forgeCost(slot, q, grade, auxId, auxN) {
    const cat = C.EQUIP.SLOT_CAT[slot] || 'metal';
    const g = C.EQUIP.MAT_GRADE[grade] || C.EQUIP.MAT_GRADE['原矿'];
    const redRandom = (q === '橙' && cat === 'metal');   // 金属系橙装：龙纹/凰血/道劫黄金 随机其一
    const base = redRandom ? { lh: 2, hx: 2, dj: 2 } : C.EQUIP.RECIPE[cat][q];
    const need = {};
    for (const k in base) need[k] = Math.max(1, Math.ceil(base[k] * g.countMul));
    if (auxId && auxN > 0) need[auxId] = (need[auxId] || 0) + Math.min(3, auxN);
    return { slot: slot, cat: cat, need: need, redRandom: redRandom, grade: g, gradeKey: grade, q: q, auxId: auxId, auxN: auxN };
  }
  // 由 forgeCost 结果构建预览行：材料系标签 + 余量芯片 + 成功率/品质上限/失败返还说明
  function costPreviewHtml(fc) {
    const catName = { metal: '金属系', leather: '皮甲系', jade: '玉髓系' }[fc.cat] || fc.cat;
    const slName = fc.slot === 'weapon' ? '武器' : ((C.EQUIP.SLOTS.find(s => s.key === fc.slot) || {}).name || '');
    const aux = (fc.auxId && fc.auxN > 0) ? (C.EQUIP.FORGE_AUX[fc.auxId] || null) : null;
    const aN = aux ? Math.min(3, fc.auxN) : 0;
    const succ = Math.min(100, Math.max(40, (C.EQUIP.FORGE_BASE_SUCC[fc.q] || 70) + fc.grade.succ + (aux ? aux.succ * aN : 0)));
    const capIdx = Math.min(4, (C.EQUIP.FORGE_BASE_CAP[fc.q] || 0) + fc.grade.cap + (aux ? aux.cap * aN : 0));
    return `<span class="catTag">${catName}·${slName}</span>` + costChips(fc.need, fc.gradeKey)
      + (fc.redRandom ? '<span class="tip" style="margin:0">三选一随机消耗</span>' : '')
      + `<span class="tip" style="margin:0">成功率 ${succ}% · 品质上限 ${C.EQUIP.QUAL_ORDER[capIdx]} · ${fc.q === '白' ? '失败全返主材' : '失败返 30% 主材'}</span>`;
  }
  // 表单联动：重算消耗预览（挂到 部位/品质/精炼/辅料/数量 的 change/input）
  function updCost() {
    const el = document.getElementById('eqCostPreview');
    const gEl = id => document.getElementById(id);
    if (!el || !gEl('eqForgeSlot')) return;
    const slot = gEl('eqForgeSlot').value, q = gEl('eqForgeQual').value, grade = gEl('eqForgeGrade').value;
    const auxId = gEl('eqAuxId').value, auxN = Math.min(3, parseInt(gEl('eqAuxN').value, 10) || 0);
    el.innerHTML = costPreviewHtml(forgeCost(slot, q, grade, auxId, auxN));
  }

  /* ---------- ① 穿戴装备（7 部位） ---------- */
  function renderSlots() {
    const S = ST.S;
    const slots = C.EQUIP.SLOTS.map(function (s) {
      const k = s.key;
      let it = null;
      if (k === 'weapon') { if (S.zhengdao) it = S.zhengdao; else if (S.equipSlots.weapon != null && S.equipSlots.weapon !== 'zd') it = S.equipBag.find(x => x.uid === S.equipSlots.weapon); }
      else { const u = S.equipSlots[k]; if (u != null) it = S.equipBag.find(x => x.uid === u); }
      const color = it ? qColor(it) : '#555';
      const name = it ? it.name : '空';
      const req = it && it.reqLevel ? ('（需' + it.reqLevel + '级）') : '';
      const aff = it ? it.affixes.map(affText).join('，') : '—';
      return `<div class="eqSlot" data-eqact="openSlot" data-slot="${k}" style="border-color:${color}">
        <div class="eqSlotName">${s.name}</div>
        <div class="eqSlotItem" style="color:${color}">${name}${req}</div>
        <div class="eqSlotAff">${aff}</div>
        <div class="eqSlotBtn">${it ? '管理' : '装备'}</div>
      </div>`;
    }).join('');
    const pwr = ST.equipPower();
    return `<div class="card"><h3>穿戴装备 §8（7 部位）</h3>
      <p class="tip">无固定成品掉落，全部装备由【养成·打造工作台】锻造。武器位可被【证道武器】占用（可无限重塑）。穿戴词条与五维/命格<b>乘法叠加</b>；装备贡献战力 ≈ ${pwr}。</p>
      <div class="eqSlotGrid">${slots}</div></div>`;
  }

  /* ---------- ② 装备背包 ---------- */
  function renderBag() {
    const S = ST.S;
    const items = S.equipBag.map(function (it) {
      const color = qColor(it);
      const sn = slotName(it.slot);
      const aff = it.affixes.map(affText).join('，');
      const req = it.reqLevel ? ('需' + it.reqLevel + '级 ') : '';
      const equipped = (it.slot === 'weapon') ? (S.zhengdao ? false : S.equipSlots.weapon === it.uid) : (S.equipSlots[it.slot] === it.uid);
      const isZD = !!it.zhengdao;
      let btns;
      if (isZD) btns = `<button class="miniBtn" data-eqact="zdView">查看</button>`;
      else {
        btns = equipped
          ? `<button class="miniBtn" data-eqact="unequipSlot" data-slot="${it.slot}">卸下</button>`
          : `<button class="miniBtn" data-eqact="equipItem" data-uid="${it.uid}">装备</button>`;
        if (it.growth) btns += `<button class="miniBtn" data-eqact="feedOpen" data-uid="${it.uid}">喂养</button>`;
        else btns += `<button class="miniBtn" data-eqact="dismantleEquip" data-uid="${it.uid}">分解</button>`;
        if (it.runeSlots > 0) btns += `<button class="miniBtn" data-eqact="embedEquipOpen" data-uid="${it.uid}">符文(${(it.slots || []).length}/${it.runeSlots})</button>`;
      }
      return `<div class="eqItem" style="border-color:${color}">
        <b>${it.name}</b><span class="ownTag" style="color:${color}">${it.red ? '帝兵' : (it.growth ? '成长' : it.quality)}${req}</span>
        <small>${sn} · ${it.zhengdao ? ('证道·' + (C.EQUIP.WTYPES[it.wtype] ? C.EQUIP.WTYPES[it.wtype].name : '') + ' · ' + ((ST.zdStage && ST.zdStage()) ? ST.zdStage().name : '')) : (it.wtype ? (C.EQUIP.WTYPES[it.wtype].name + '·' + C.EQUIP.WTYPES[it.wtype].dao) : (it.type ? ('主' + dimName(it.type)) : (it.red ? ('帝兵Lv' + (it.growthLv || 1)) : (it.growth ? ('成长Lv' + it.growthLv) : ''))))}${(it.inscriptions && it.inscriptions.length) ? ' · 铭文' + it.inscriptions.length : ''}</small>
        <small>${aff}</small>
        <div class="eqBtns">${btns}</div></div>`;
    }).join('');
    return `<div class="card"><h3>装备背包（${S.equipBag.length}）</h3>
      <p class="tip">锻造出的装备存于此。可穿戴（占对应部位）、分解返还材料；成长装备可喂养提升（需更高阶材料）。符文可镶嵌到带槽装备上。</p>
      <div class="eqBagGrid">${items || '<p class="tip">背包空空，去养成页「打造工作台」锻造吧。</p>'}</div></div>`;
  }

  /* ---------- ③ 打造工作台 ---------- */
  function renderForge() {
    const S = ST.S;
    const slotOpts = C.EQUIP.SLOTS.map(s => `<option value="${s.key}">${s.name}</option>`).join('');
    const qualOpts = ['白', '绿', '蓝', '紫', '橙'].map(q => `<option value="${q}">${C.EQUIP.FORGE_MAT_LABEL[q] || q}</option>`).join('');
    const gradeOpts = C.EQUIP.GRADE_ORDER.map(g => `<option value="${g}">${g}</option>`).join('');
    const auxOptsFor = (q) => {
      const list = Object.keys(C.EQUIP.FORGE_AUX).filter(k => C.EQUIP.FORGE_AUX[k].q.indexOf(q) >= 0);
      return '<option value="">无辅助</option>' + list.map(k => `<option value="${k}">${C.EQUIP.MATS[k].name}（+${C.EQUIP.FORGE_AUX[k].succ}%）</option>`).join('');
    };
    const auxOpts = auxOptsFor('白');
    const wtypeOpts = '<option value="">随机流派</option>' + Object.keys(C.EQUIP.WTYPES).map(k => `<option value="${k}">${C.EQUIP.WTYPES[k].name}·${C.EQUIP.WTYPES[k].dao}</option>`).join('');
    const setOpts = '<option value="">（默认归属）</option>' + CFG.EQUIP.SET_LIST.map(id => `<option value="${id}">${CFG.EQUIP.SETS[id].name}</option>`).join('');
    const refineGradeOpts = (C.EQUIP.REFINE.tiers || []).map(t => `<option value="${t.grade}">${t.grade}</option>`).join('');
    const refineOreOpts = (C.EQUIP.REFINE.ores || []).map(k => `<option value="${k}">${(C.EQUIP.MATS[k] || {}).name || k}</option>`).join('');
    const refineStock = (C.EQUIP.REFINE.tiers || []).map(t => {
      const st = (S.refine || {})[t.grade] || {};
      const parts = Object.keys(st).filter(k => st[k] > 0).map(k => ((C.EQUIP.MATS[k] || {}).name || k) + '×' + st[k]).join(' ');
      return `<span class="matChip">${t.grade}：${parts || '无'}</span>`;
    }).join('');
    const redImperialOpts = CFG.RED_IMPERIAL_LIST.map(id => { const r = C.RED_IMPERIAL[id]; return `<option value="${id}">${r.icon}${r.name}（${C.EQUIP.MATS[r.immKey].name}×2）</option>`; }).join('');
    const bagOpts = S.equipBag.filter(i => !i.growth && !i.zhengdao).map(i => `<option value="${i.uid}">${i.name} [${i.quality}]</option>`).join('') || '<option value="">（无可用装备）</option>';
    const zd = S.zhengdao;
    const zst = zd ? (ST.zdStage && ST.zdStage()) : null;
    const zdHtml = zd
      ? `<div class="eqItem" style="border-color:#e0533f;margin:0"><b>${zd.name}</b><span class="ownTag" style="color:#e0533f">证道·${zd.wtype ? C.EQUIP.WTYPES[zd.wtype].name : ''} · ${zst ? zst.name : ''}</span>
         <small>${zd.affixes.map(affText).join('，')}${(zd.inscriptions && zd.inscriptions.length) ? ('<br>铭文：' + zd.inscriptions.map(affText).join('，')) : ''}</small>
         <div class="eqBtns"><button class="miniBtn" data-eqact="zdReshape">重塑（耗 ${matText(C.EQUIP.ZHENGDAO.reshapeCost)}）</button>
         ${zst && zst.bound ? `<button class="miniBtn" data-eqact="zdEngrave">铭文（耗 ${matText(C.EQUIP.ZHENGDAO.engraveCost)}）</button>` : ''}</div></div>`
      : `<div class="forgeFoot" style="margin-top:0;border-top:none;padding-top:0"><span class="tip">需 ${C.EQUIP.ZHENGDAO.openLv} 级 · 耗 ${matText(C.EQUIP.ZHENGDAO.openCost)} · 开启后永久占用武器位，不可回退</span><button class="actBtn" data-eqact="zdOpen">开启证道武器</button></div>`;
    const matChips = Object.keys(C.EQUIP.MATS).filter(k => (S.mat[k] || 0) > 0)
      .map(k => `<span class="matChip">${C.EQUIP.MATS[k].name} ×${S.mat[k]}</span>`).join('') || '<span class="tip" style="margin:0">暂无神材，先去探索采集。</span>';
    return `<div class="card"><h3>🔨 打造工作台</h3>
      <div class="forgeMats"><b>神材持有：</b>${matChips}${S.jinchi ? '<span class="matChip red">🔴 烬赤源核 ×' + S.jinchi + '</span>' : ''}</div>

      <div class="forgeBox">
        <div class="forgeBoxHead"><b>🔨 普通锻造</b><small class="tip">主材×2 · 精炼越高：耗料越少 / 成功率越高 / 品质上限越高</small></div>
        <div class="fGrid">
          <label>部位</label><select id="eqForgeSlot" class="forgeSel" data-eqchange="slot">${slotOpts}</select>
          <label>主材品质</label><select id="eqForgeQual" class="forgeSel" data-eqchange="quality">${qualOpts}</select>
          <label>精炼等级</label><select id="eqForgeGrade" class="forgeSel" data-eqchange="cost">${gradeOpts}</select>
          <span id="eqWtypeWrap" class="fPair" style="display:none"><label>流派</label><select id="eqForgeWtype" class="forgeSel">${wtypeOpts}</select></span>
          <span id="eqSetWrap" class="fPair" style="display:flex"><label>套装</label><select id="eqForgeSet" class="forgeSel">${setOpts}</select></span>
        </div>
        <div class="fGrid" style="margin-top:8px">
          <label>辅助材料</label><span class="fPair"><select id="eqAuxId" class="forgeSel" data-eqchange="cost">${auxOpts}</select><input id="eqAuxN" class="forgeNum" type="number" min="0" max="3" value="0" data-eqchange="cost"></span>
        </div>
        <div class="fGrid" style="margin-top:8px"><label>本次消耗</label><div id="eqCostPreview" class="costPreview">${costPreviewHtml(forgeCost(C.EQUIP.SLOTS[0].key, '白', C.EQUIP.GRADE_ORDER[0], '', 0))}</div></div>
        <div class="forgeFoot"><span class="tip">辅料按品质限定：绿=淬炼精粹 · 蓝=精粹/道源凝果 · 紫=凝紫精粹/凝果 · 橙=羽化神金/仙泪绿金/至尊兽皮/凝果（每 1 份 +成功率 +品质上限）；武器可指定流派并自选套装归属，其余部位也可自选套装。部位决定材料系：头/腕/武器=金属，胸/腿/鞋=皮甲，项链=玉髓。精炼等级需先在下方「材料精炼台」精炼对应神材。</span><button class="miniBtn primary" data-eqact="forgeDo">开始锻造</button></div>
      </div>

      <div class="forgeBox refineBox">
        <div class="forgeBoxHead"><b>⚒️ 材料精炼台</b><small class="tip">将基础神材（凡铁/灵金层级）精炼为 粗炼/精炼/纯净；精炼仅需消耗<b>木炭</b>（探索/妖塔均可稳定获得）。每档需 3 份上一级材料：粗炼=3原矿+6炭、精炼=3粗炼+9炭、纯净=3精炼+12炭。锻造时按所选精炼等级消耗对应精炼料（仙金/至尊神料不参与精炼）。</small></div>
        <div class="fGrid">
          <label>目标等级</label><select id="eqRefineGrade" class="forgeSel" data-eqchange="refine">${refineGradeOpts}</select>
          <label>精炼材料</label><select id="eqRefineOre" class="forgeSel" data-eqchange="refine">${refineOreOpts}</select>
          <label>数量</label><input id="eqRefineN" class="forgeNum" type="number" min="1" max="99" value="1" data-eqchange="refine">
        </div>
        <div class="forgeFoot"><span class="tip" id="eqRefineTip">选择等级与材料后显示精确消耗；精炼消耗「上一级精炼料 + 对应耗材（淬炼/凝紫/道源凝果）」产出本级精炼料。</span><button class="miniBtn primary" data-eqact="refineDo">精炼</button></div>
        <div class="forgeMats"><b>精炼库存：</b>${refineStock}</div>
      </div>

      <div class="forgeBox">
        <div class="forgeBoxHead"><b>♻️ 重铸</b><small class="tip">重洗一件已有装备的词条</small></div>
        <div class="fGrid"><label>选择装备</label><select id="eqRecastUid" class="forgeSel wide">${bagOpts}</select></div>
        <div class="fGrid" style="margin-top:8px"><label>本次消耗</label><div class="costPreview">${costChips(C.EQUIP.RECAST_COST)}</div></div>
        <div class="forgeFoot"><span class="tip">词条按当前品质的词条池重roll。</span><button class="miniBtn" data-eqact="recastDo">重铸</button></div>
      </div>

      <div class="forgeBox redBox">
        <div class="forgeBoxHead"><b>🔴 红色仙金帝兵</b><small class="tip">烬赤源核×1 + 仙金×2 · 成功率 1% · 失败仙金湮灭</small></div>
        <div class="fGrid">
          <label>帝兵图谱</label><select id="eqRedId" class="forgeSel wide">${redImperialOpts}</select>
          <label>辅料</label><select id="eqRedAux" class="forgeSel">${auxOptsFor('红')}</select>
        </div>
        <div class="forgeFoot"><span class="tip">仙金乃大帝铸帝兵之本，凡器承载不住其道则——普通装备严禁锻入仙金。</span><button class="miniBtn btnDanger" data-eqact="redMake">铸就帝兵</button></div>
      </div>

      <div class="forgeBox zdBox">
        <div class="forgeBoxHead"><b>🗡️ 证道武器</b><small class="tip">§8.8</small></div>
        ${zdHtml}
      </div>

      <details class="forgeHelp"><summary>📖 材料层级与锻造规则</summary>
        <p class="tip">材料层级：<b>凡铁</b>(白/绿) → <b>灵金</b>(蓝/紫/橙主材) → <b>至尊神料</b>(橙装辅料) → <b>仙金·帝材</b>(仅红色烬赤帝兵主材)。普通白绿蓝紫橙装备<b>严禁使用仙金</b>——仙金乃大帝铸帝兵之本，凡器承载不住其道则，强行锻入即崩碎。</p>
        <p class="tip">精炼等级（原矿→粗炼→精炼→纯净）：等级越高，主材消耗越少、成功率越高、品质上限越高；辅助材料每 1 份 +成功率、+品质上限。</p>
        <p class="tip">证道武器开启后占用武器位（不可回退为普通武器），可消耗<b>虚空神晶</b>重塑、至尊神料铭文；烬赤源核打造的「红色帝兵」无穿戴等级、可喂凡铁/灵金无限成长，但<b>不能直接打造证道武器，且喂养严禁消耗仙金</b>。重塑/喂养均无法用办公币直购。</p>
        <details class="tip"><summary>📜 锻造配方（主材×2）</summary>${recipeGuide()}</details>
      </details>
    </div>${blueprintCard()}${renderSets()}`;
  }

  // 图纸锻造区块：已拥有图纸可制造（出品确定）+ 二十件设计图鉴
  function blueprintCard() {
    const S = ST.S;
    const owned = (S.blueprints || {});
    const ownedIds = Object.keys(owned).filter(id => owned[id] > 0);
    const matTxt = m => Object.keys(m).map(k => ((C.EQUIP.MATS[k] && C.EQUIP.MATS[k].name) || k) + '×' + m[k]).join(' ');
    const wInfo = w => { const e = C.EQUIP.WTYPES[w]; return e ? (e.name + '·' + e.dao) : w; };
    const qColorOf = q => (C.EQUIP.QUAL[q] && C.EQUIP.QUAL[q].color) || '#999';
    let ownHtml = ownedIds.length
      ? ownedIds.map(id => {
          const bp = C.BLUEPRINTS[id], canMat = canAfford(bp.mats);
          return `<div class="eqItem" style="border-color:${qColorOf(bp.quality)}">
            <b>${bp.icon} ${bp.name}</b><span class="ownTag">${bp.shape} · ${bp.quality} · 持有×${owned[id]}</span>
            <small>${bp.desc}</small>
            <small style="color:#bcd">流派：${wInfo(bp.wtype)}｜${setText(bp.set)}｜倾向词条：${affixPoolText(bp.affixPool)}｜需 ${matTxt(bp.mats)}</small>
            <button class="miniBtn" data-eqact="bpCraft" data-bp="${id}" ${canMat ? '' : 'disabled'}>制造</button></div>`;
        }).join('')
      : '<p class="tip">尚未拥有任何锻造图纸（可在探索/Boss/秘境获取）。</p>';
    const codex = C.BLUEPRINT_LIST.map(id => {
      const bp = C.BLUEPRINTS[id], has = (owned[id] || 0) > 0;
      return `<div class="codexItem ${has ? 'own' : ''}" style="border-color:${qColorOf(bp.quality)}">
        <b>${bp.icon} ${bp.name}</b><span class="rar" style="color:${qColorOf(bp.quality)}">${bp.shape}·${bp.quality}</span>
        <small>${wInfo(bp.wtype)}</small><small style="color:#9ab">${setText(bp.set)} 倾向：${affixPoolText(bp.affixPool)}</small><small style="color:#9ab">需 ${matTxt(bp.mats)}</small></div>`;
    }).join('');
    return `<div class="card"><h3>图纸锻造 §8.6</h3>
      <p class="tip">凭<b>锻造图纸 + 对应神材</b>制造二十件设计武器，出品品质/流派/词条数<b>完全确定</b>（不再随机）。锻造时仅在图纸<b>倾向词条池</b>内随机 roll（凡铁·白绿 0 条 / 蓝2 / 紫3 / 橙3 条）。图纸可自探索(4%)、Boss、秘境(仙级)获取。</p>
      <h4 style="margin:8px 0 4px">我的图纸（可制造）</h4>
      <div class="eqBagGrid">${ownHtml}</div>
      <details class="tip"><summary>📐 设计图鉴（二十件武器）</summary><div class="codexGrid">${codex}</div></details>
    </div>`;
  }
  function canAfford(cost) { const m = cost || {}; for (const k in m) if ((ST.S.mat[k] || 0) < m[k]) return false; return true; }
  // 套装激活总览：按已穿戴（含证道/本命）聚合件数，2/4/7 三档 + 帝级异象
  function renderSets() {
    const S = ST.S;
    const items = [];
    CFG.EQUIP.SLOTS.forEach(s => {
      if (s.key === 'weapon') { if (S.zhengdao) items.push(S.zhengdao); else { const u = S.equipSlots[s.key]; if (u != null && u !== 'zd') { const w = S.equipBag.find(x => x.uid === u); if (w) items.push(w); } } }
      else { const u = S.equipSlots[s.key]; if (u != null) { const w = S.equipBag.find(x => x.uid === u); if (w) items.push(w); } }
    });
    const cnt = {}, red = {};
    items.forEach(it => { if (it.set) { cnt[it.set] = (cnt[it.set] || 0) + 1; if (it.red) red[it.set] = (red[it.set] || 0) + 1; } });
    // 套装互斥：同一时间仅激活件数最多的一套；并列按 SET_LIST 优先级靠前者胜出
    const activeId = Object.keys(cnt).filter(id => cnt[id] >= 3).sort((a, b) => cnt[b] - cnt[a])[0] || null;
    const html = CFG.EQUIP.SET_LIST.map(id => {
      const c = cnt[id] || 0, Sc = CFG.EQUIP.SETS[id], hasRed = !!red[id];
      const t3 = c >= 3, t5 = c >= 5, isActive = (id === activeId && t3);
      const lines = [
        `<div class="setLine ${t3 ? 'on' : 'off'}"><b>3件</b> ${Sc.t3.desc}</div>`,
        `<div class="setLine ${t5 ? 'on' : 'off'}"><b>5件</b> ${Sc.t5.desc}</div>`
      ].join('');
      return `<div class="setItem" style="border-color:${Sc.color};opacity:${c > 0 ? 1 : 0.45}">
        <div class="setHead"><b style="color:${Sc.color}">${Sc.name}</b><span class="rar">${Sc.dao} · ${c}件${hasRed ? ' · 含红' : ''}${isActive ? ' · ✅激活' : ''}</span></div>
        <small style="color:#9ab">部位：${Sc.slots.map(slotName).join('·')}</small>
        ${lines}</div>`;
    }).join('');
    return `<div class="card"><h3>套装激活 §8.9</h3>
      <p class="tip">共 6 套，各服务自身流派，<b>不做全局放大</b>。所有装备<b>单件特效全部生效</b>；<b>套装增益同一时间仅激活 1 套</b>（自动选件数最多者，并列时优先级靠前）。集齐 3/5 件解锁一/二阶；<b>不再设置 7 件套超模全局 buff</b>。吸血总和≤30%，闪避总和≤40%。红色【帝尊道装】为均衡毕业套，<b>证道武器是独立单件</b>，可任意混搭其它套装。</p>
      <div class="setGrid">${html}</div></div>`;
  }

  /* ---------- 弹窗 ---------- */
  function openSlotModal(slot) {
    const S = ST.S, isWeapon = slot === 'weapon';
    let html = '<h3>' + slotName(slot) + ' · 选择装备</h3>';
    if (isWeapon && S.zhengdao) {
      const zd = S.zhengdao; const zst = ST.zdStage && ST.zdStage();
      const insc = (zd.inscriptions && zd.inscriptions.length) ? ('<br><b>铭文</b>：' + zd.inscriptions.map(affText).join('，')) : '';
      html += '<p class="tip">武器位已被【证道武器】永久占用，无法穿戴普通锻造武器（凡铁亦可修成帝器）。</p>';
      html += `<div class="eqItem" style="border-color:#e0533f"><b>${zd.name}</b><span class="ownTag" style="color:#e0533f">证道·${zd.wtype ? C.EQUIP.WTYPES[zd.wtype].name : ''} · ${zst ? zst.name : ''}</span><small>${zd.affixes.map(affText).join('，')}${insc}</small>
        <button class="miniBtn" data-eqact="zdReshape">重塑（耗 ${matText(C.EQUIP.ZHENGDAO.reshapeCost)}）</button>
        ${zst && zst.bound ? `<button class="miniBtn" data-eqact="zdEngrave">铭文铭刻（耗 ${matText(C.EQUIP.ZHENGDAO.engraveCost)}）</button>` : ''}</div>`;
    } else {
      const items = S.equipBag.filter(i => i.slot === slot);
      if (!items.length) html += '<p class="tip">背包无该部位装备，去锻造。</p>';
      items.forEach(it => {
        const equipped = S.equipSlots[slot] === it.uid;
        html += `<div class="eqItem" style="border-color:${qColor(it)}">
          <b>${it.name}</b><span class="ownTag">${it.quality}${it.reqLevel ? (' 需' + it.reqLevel) : ''}</span>
          <small>${it.affixes.map(affText).join('，')}</small>
          ${equipped ? `<button class="miniBtn" data-eqact="unequipSlot" data-slot="${slot}">卸下</button>` : `<button class="miniBtn" data-eqact="equipItem" data-uid="${it.uid}">装备</button>`}
          ${it.runeSlots > 0 ? `<button class="miniBtn" data-eqact="embedEquipOpen" data-uid="${it.uid}">符文(${(it.slots || []).length}/${it.runeSlots})</button>` : ''}
        </div>`;
      });
    }
    html += '<button class="miniBtn" data-act="closeModal">关闭</button>';
    global.UI.modal(html);
  }
  function embedModal(uid) {
    const S = ST.S; const it = S.equipBag.find(x => x.uid === parseInt(uid, 10)); if (!it) return;
    let html = '<h3>符文镶嵌 · ' + it.name + '</h3>';
    const cur = (it.slots || []).map(r => `<span class="runeOn">${r.name}<button class="miniBtn" data-eqact="unembedDo" data-uid="${it.uid}" data-ruid="${r.uid}">摘</button></span>`).join(' ') || '空';
    html += '<p>已镶嵌 ' + cur + '（' + (it.slots ? it.slots.length : 0) + '/' + it.runeSlots + '）</p>';
    if (S.runeBag.length) html += S.runeBag.map(r => `<button class="miniBtn" data-eqact="embedDo" data-uid="${it.uid}" data-ruid="${r.uid}">${r.name}</button>`).join(' ');
    else html += '<p class="tip">背包无符文</p>';
    html += '<button class="miniBtn" data-act="closeModal">关闭</button>';
    global.UI.modal(html);
  }
  function feedModal(uid) {
    const S = ST.S; const it = S.equipBag.find(x => x.uid === parseInt(uid, 10));
    if (!it || !it.growth) return;
    if (it.growthLv >= C.EQUIP.GROWTH.maxLv) { global.UI.toast('已达成长上限'); return; }
    const need = C.EQUIP.GROWTH.feed[it.growthLv];
    global.UI.modal('<h3>喂养成长装备 · ' + it.name + '</h3><p>当前成长 Lv' + it.growthLv + '，喂养需 ' + matText(need) + '（高阶材料受全服进度约束 §8.8）。</p><button class="miniBtn" data-eqact="feedDo" data-uid="' + uid + '">喂养</button> <button class="miniBtn" data-act="closeModal">关闭</button>');
  }
  function zdDetail(zd) {
    const zst = ST.zdStage && ST.zdStage();
    const insc = (zd.inscriptions && zd.inscriptions.length) ? ('<br><b>铭文</b>：' + zd.inscriptions.map(affText).join('，')) : '';
    return `<div class="eqItem" style="border-color:#e0533f"><b>${zd.name}</b><span class="ownTag" style="color:#e0533f">证道·${zd.wtype ? C.EQUIP.WTYPES[zd.wtype].name : ''} · ${zst ? zst.name : ''} · 重塑${zd.reshape || 0}次</span>
      <small>${zd.affixes.map(affText).join('，')}${insc}</small></div>`;
  }

  // 切换锻造品质时，刷新辅助材料下拉（按品质限定、屏蔽仙金）
  function updAux() {
    const q = document.getElementById('eqForgeQual');
    const a = document.getElementById('eqAuxId');
    if (!q || !a) return;
    const qq = q.value;
    const list = Object.keys(C.EQUIP.FORGE_AUX).filter(k => C.EQUIP.FORGE_AUX[k].q.indexOf(qq) >= 0);
    a.innerHTML = '<option value="">无辅助</option>' + list.map(k =>
      `<option value="${k}">${C.EQUIP.MATS[k].name}（+${C.EQUIP.FORGE_AUX[k].succ}%）</option>`).join('');
  }
  /* ---------- 点击分发（[data-eqact]，与 ui.js 的 [data-act] 并存） ---------- */
  function eqHandler(e) {
    const a = e.target.closest('[data-eqact]');
    if (!a) return;
    const act = a.dataset.eqact, d = a.dataset, S = ST.S;
    const ok = (r) => r && r.ok;
    switch (act) {
      case 'openSlot': openSlotModal(d.slot); break;
      case 'equipItem': { const r = ST.equipItem(parseInt(d.uid, 10)); global.UI.toast(r.ok ? (r.msg || '已装备') : r.msg); if (ok(r)) { global.UI.closeModal(); refresh(); } break; }
      case 'unequipSlot': { const r = ST.unequipSlot(d.slot); global.UI.toast(r.ok ? '已卸下' : r.msg); if (ok(r)) { global.UI.closeModal(); refresh(); } break; }
      case 'dismantleEquip': { const r = ST.dismantleEquip(parseInt(d.uid, 10)); global.UI.toast(r.ok ? ('分解成功，返还 ' + matText(r.gained)) : r.msg); if (ok(r)) refresh(); break; }
      case 'feedOpen': feedModal(d.uid); break;
      case 'feedDo': { const r = ST.feedGrowth(parseInt(d.uid, 10)); global.UI.toast(r.ok ? ('成长至 Lv' + r.lv) : r.msg); if (ok(r)) { global.UI.closeModal(); refresh(); } break; }
      case 'forgeDo': {
        const slot = document.getElementById('eqForgeSlot').value, mat = document.getElementById('eqForgeQual').value;
        const grade = document.getElementById('eqForgeGrade').value;
        const auxId = document.getElementById('eqAuxId').value || null;
        const auxN = document.getElementById('eqAuxN').value;
        const wEl = document.getElementById('eqForgeWtype');
        const wtype = (slot === 'weapon' && wEl) ? (wEl.value || null) : null;
        const sEl = document.getElementById('eqForgeSet');
        const set = sEl ? (sEl.value || null) : null;
        const r = ST.forgeEquip(slot, mat, grade, auxId, auxN, { wtype: wtype, set: set });
        if (ok(r)) { forgeResultModal(r); refresh(); }
        else global.UI.toast(r.msg);
        break;
      }
      case 'refineDo': {
        const grade = document.getElementById('eqRefineGrade').value;
        const ore = document.getElementById('eqRefineOre').value;
        const n = document.getElementById('eqRefineN').value;
        const r = ST.refineMats(grade, ore, n);
        if (ok(r)) global.UI.toast('精炼成功：' + r.gained.name + ' ×' + r.gained.n + '（' + r.gained.grade + '）');
        else global.UI.toast(r.msg);
        refresh(); break;
      }
      case 'bpCraft': {
        const id = d.bp;
        const r = ST.craftByBlueprint(id);
        global.UI.toast(r.ok ? ('制造成功：' + r.name + '（' + r.qual + '·' + (C.EQUIP.WTYPES[C.BLUEPRINTS[id].wtype].name) + '）') : r.msg);
        if (ok(r)) refresh(); break;
      }
      case 'recastDo': {
        const uid = document.getElementById('eqRecastUid').value;
        if (!uid) { global.UI.toast('请选择装备'); break; }
        const r = ST.recastEquip(parseInt(uid, 10)); global.UI.toast(r.ok ? '重铸成功' : r.msg); if (ok(r)) refresh(); break;
      }
      case 'redMake': {
        const ri = document.getElementById('eqRedId');
        const riId = (ri && ri.value) ? ri.value : CFG.RED_IMPERIAL_LIST[0];
        const ax = document.getElementById('eqRedAux');
        const auxId = (ax && ax.value) ? ax.value : null;
        const r = ST.forgeRedImperial(riId, auxId);
        global.UI.toast(r.ok ? (r.fail ? ('帝器锻造失败！' + r.msg.replace(/^帝器锻造失败，/, '')) : '🔴 帝器铸成成功（' + (r.item && r.item.name) + '·无等级限制）') : r.msg);
        if (ok(r)) refresh(); break;
      }
      case 'zdOpen': { const r = ST.openZhengdao(); global.UI.toast(r.ok ? '证道武器已开启（武器位已占用）' : r.msg); if (ok(r)) refresh(); break; }
      case 'zdReshape': { const r = ST.reshapeZhengdao(); global.UI.toast(r.ok ? '重塑成功' : r.msg); if (ok(r)) { global.UI.closeModal(); refresh(); } break; }
      case 'zdEngrave': { const r = ST.engraveZhengdao(); global.UI.toast(r.ok ? '铭文铭刻成功' : r.msg); if (ok(r)) { global.UI.closeModal(); refresh(); } break; }
      case 'zdView': { if (S.zhengdao) { const zst = ST.zdStage && ST.zdStage(); global.UI.modal('<h3>证道武器 · ' + (zst ? zst.name : '') + '</h3>' + zdDetail(S.zhengdao) + '<button class="miniBtn" data-eqact="zdReshape">重塑</button>' + (zst && zst.bound ? ' <button class="miniBtn" data-eqact="zdEngrave">铭文铭刻</button>' : '') + ' <button class="miniBtn" data-act="closeModal">关闭</button>'); } break; }
      case 'embedEquipOpen': embedModal(d.uid); break;
      case 'embedDo': { const r = ST.embedRuneEquip(parseInt(d.uid, 10), parseInt(d.ruid, 10)); global.UI.toast(r.ok ? '镶嵌成功' : r.msg); if (ok(r)) { global.UI.closeModal(); refresh(); } break; }
      case 'unembedDo': { const r = ST.unembedRuneEquip(parseInt(d.uid, 10), parseInt(d.ruid, 10)); global.UI.toast(r.ok ? '已摘除' : r.msg); if (ok(r)) refresh(); break; }
    }
  }
  document.addEventListener('click', eqHandler);
  document.addEventListener('input', function (e) {
    const control = e.target.closest && e.target.closest('[data-eqchange]');
    if (!control || control.tagName === 'SELECT') return;
    if (control.dataset.eqchange === 'refine') EQ.updRefineTip();
    else EQ.updCost();
  });
  document.addEventListener('change', function (e) {
    const control = e.target.closest && e.target.closest('[data-eqchange]');
    if (!control) return;
    if (control.dataset.eqchange === 'slot') {
      const w = document.getElementById('eqWtypeWrap');
      const s = document.getElementById('eqSetWrap');
      if (w) w.style.display = control.value === 'weapon' ? 'flex' : 'none';
      if (s) s.style.display = 'flex';
      EQ.updCost();
    } else if (control.dataset.eqchange === 'quality') {
      EQ.updAux(); EQ.updCost();
    } else if (control.dataset.eqchange === 'refine') EQ.updRefineTip();
    else EQ.updCost();
  });

  /* ---------- 样式 ---------- */
  (function injectCss() {
    const css = `
      .eqSlotGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-top:8px}
      .eqSlot{border:1px solid var(--line);border-radius:10px;padding:8px;cursor:pointer;text-align:center;background:var(--card)}
      .eqSlotName{font-size:12px;color:var(--ink3)}.eqSlotItem{font-weight:bold;margin:4px 0;color:var(--ink)}
      .eqSlotAff{font-size:11px;color:var(--ink2);min-height:28px;line-height:1.3}.eqSlotBtn{font-size:11px;color:var(--blue);margin-top:4px}
      .eqBagGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-top:8px}
      .eqItem{border:1px solid var(--line);border-radius:10px;padding:8px;background:var(--card);display:flex;flex-direction:column;gap:3px}
      .eqItem b{color:var(--ink)}.eqItem small{color:var(--ink2);font-size:11px}
      .forgeRow{margin:6px 0;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
      .forgeRow select{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:2px 4px}
      .forgeRow b{display:inline-block;min-width:54px;color:var(--blue)}
      .miniBtn.red{background:#e83a3a;color:#fff;border-color:#e83a3a}
      .setGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;margin-top:8px}
      .setItem{border:1px solid var(--line);border-radius:10px;padding:8px;background:var(--card)}
      .setHead{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
      .setLine{font-size:11px;color:var(--ink2);padding:2px 4px;border-left:3px solid var(--line);margin:2px 0}
      .setLine.on{color:var(--ink);border-left-color:var(--blue);background:var(--blueSoft)}
      .setLine.off{opacity:0.55}
      .setLine b{color:var(--blue);margin-right:4px}
    `;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  })();

  global.EQ = { renderSlots, renderBag, renderForge, updAux, updCost, updRefineTip };
})(window);
