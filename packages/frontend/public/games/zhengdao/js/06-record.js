/* User-provided source archive SHA-256: 34ec6528a54acb3e593c9b9a8d0deb9ea0d3723c2d795ad32cf457671f8415a3. */
/* =========================================================================
 * 06-record.js  ·  命格录与排行  →  window.ZT.record
 * -------------------------------------------------------------------------
 * loadHistory / saveRecord / getBest / renderRecord / renderCpRank /
 * clear。
 * 依赖：ZT.config（LS_KEY）、ZT.util（daoKindOf）、ZT.achievements（loadAch）。
 * 注意：按钮绑定（清空）统一由 08-app.js 接线，本模块只暴露 clear()。
 * ========================================================================= */
(function(ZT){
  'use strict';

  const C = ZT.config, U = ZT.util, A = ZT.achievements;
  const LS_KEY = C.LS_KEY;
  const daoKindOf = U.daoKindOf;
  const loadAch = A.loadAch;

  function loadHistory(){
    try{ const s=localStorage.getItem(LS_KEY); return s?JSON.parse(s):[]; }catch(e){ return []; }
  }

  // 仅保留最近 80 世的「完整一生」事件日志，更旧的只留概览，避免撑爆 localStorage
  const EVENT_LOG_KEEP = 80;

  function saveRecord(rec){
    let h=loadHistory(); h.push(rec);
    if(h.length>200) h=h.slice(-200); // 仅保留最近 200 世
    // 仅最近 EVENT_LOG_KEEP 世保留完整 events，其余剥离事件只留概览数据
    for(let i=0;i<Math.max(0,h.length-EVENT_LOG_KEEP);i++){ if(h[i]) delete h[i].events; }
    try{ localStorage.setItem(LS_KEY, JSON.stringify(h)); }
    catch(e){
      // 仍超限：剥离全部事件再存（至少保住概览数据）
      try{ h.forEach(x=>{ if(x) delete x.events; }); localStorage.setItem(LS_KEY, JSON.stringify(h)); }catch(_){}
    }
  }

  // 按时间戳取出某一世的完整记录（含 events 完整一生）
  function findRecord(t){
    const h=loadHistory();
    for(let i=h.length-1;i>=0;i--){ if(h[i].t===t) return h[i]; }
    return null;
  }

  function getBest(){
    const h=loadHistory(); if(!h.length) return null;
    const gOrder={'神':7,'帝':6,'天':5,'地':4,'玄':3,'黄':2,'凡':1};
    const score=x=> x.realm*100 + (gOrder[x.grade]||0)*10 + (x.age>99999?99999:x.age);
    return h.reduce((b,x)=> score(x)>score(b)? x : b, h[0]);
  }

  function bestColor(g){const c={'神':'#c0392b','帝':'#d4a017','天':'#b8860b','地':'#7a3fb0','玄':'#3f6b54','黄':'#3f6b54','凡':'#5a4a38'};return c[g]||'#5a4a38';}

  function renderRecord(){
    const h=loadHistory().slice().reverse(); // 最新在前
    const best=getBest();
    const stats=document.getElementById('recStats');
    const list=document.getElementById('recList');
    renderCpRank();
    if(!h.length){
      stats.innerHTML='';
      list.innerHTML='<div class="rec-empty">尚无记录。走完一世，你的修行足迹便会镌刻于此。</div>';
      return;
    }
    const grades={'神':0,'天':0,'地':0,'玄':0,'黄':0,'凡':0};
    h.forEach(r=>{ if(grades[r.grade]!=null) grades[r.grade]++; });
    stats.innerHTML=
      `<div class="rs"><div class="k">已历世</div><div class="v">${h.length}</div></div>`+
      `<div class="rs"><div class="k">最佳境界</div><div class="v">${best.realmName}</div></div>`+
      `<div class="rs"><div class="k">最佳评级</div><div class="v" style="color:${bestColor(best.grade)}">${best.grade}</div></div>`+
      `<div class="rs"><div class="k">证帝/仙</div><div class="v">${grades['天']+grades['帝']+grades['神']}</div></div>`;
    list.innerHTML=h.map(r=>{
      const isBest = best && r.t===best.t;
      return `<div class="rec-item${isBest?' best':''}">`+
        `<span class="g ${r.gradeCls||''}">${r.grade}</span>`+
        `<span class="dao">${r.dao}</span>`+
        `<span class="meta">${(r.regionName||'—')}·${r.raceName}·${r.phyName}（${r.phyTier}）· 证道【${r.pathName||'道途未竟'}】· ${r.realmName}${((r.realm>=38||r.zizhan)&&daoKindOf(r).short!=='无缺大帝·正统')?' · '+daoKindOf(r).short:''}${r.qiyu?(' · 奇遇'+r.qiyu):''}${r.renyuTrial?(' · 人欲·'+r.renyuTrial):''}</span>`+
        `<span class="age">${r.age>99999?'∞':r.age}岁</span>`+
        `<button class="rec-view" data-t="${r.t}">回看</button>`+
      `</div>`;
    }).join('');
  }

  // 战力排行：按本机「战力」数值降序，取前 20 名展示
  function renderCpRank(){
    const el=document.getElementById('lbCpList');
    if(!el) return;
    const h=loadHistory().filter(r=>r.cp).slice().sort((a,b)=>b.cp-a.cp).slice(0,20);
    if(!h.length){
      el.innerHTML='<div class="rec-empty">尚无战力记录。修至大帝、乃至击碎天心晋为天帝，你的战力便会镌刻于此榜。</div>';
      return;
    }
    el.innerHTML=h.map((r,i)=>{
      const medal = i===0?'①':i===1?'②':i===2?'③':(i+1);
      const dk = ((r.realm>=38||r.zizhan) && daoKindOf(r).short!=='无缺大帝·正统') ? ' · '+daoKindOf(r).short : '';
      return `<div class="rec-item${i===0?' best':''}">`+
        `<span style="font-weight:bold;color:var(--gold);width:24px;text-align:center">${medal}</span>`+
        `<span class="g ${r.gradeCls||''}">${r.grade}</span>`+
        `<span class="dao">${r.dao}</span>`+
        `<span class="meta">${(r.regionName||'—')}·${r.raceName}·${r.phyName}（${r.phyTier}）${dk}</span>`+
        `<span class="age" style="color:var(--vermilion)">战力 ${r.cp}</span>`+
      `</div>`;
    }).join('');
  }

  // 清空命格录（由 08-app.js 的 recClear 按钮调用）
  function clear(){
    try{ localStorage.removeItem(LS_KEY); }catch(e){}
    renderRecord();
  }

  ZT.record = { loadHistory, saveRecord, findRecord, getBest, renderRecord, renderCpRank, clear };

})(window.ZT = window.ZT || {});
