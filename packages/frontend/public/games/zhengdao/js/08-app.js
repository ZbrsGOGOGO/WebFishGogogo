/* User-provided source archive SHA-256: 34ec6528a54acb3e593c9b9a8d0deb9ea0d3723c2d795ad32cf457671f8415a3. */
/* =========================================================================
 * 08-app.js  ·  唯一入口（主控 / 接线 / 启动）  →  本文件是游戏唯一的加载期副作用来源
 * -------------------------------------------------------------------------
 * 职责：
 *   1) 绑定所有按钮 / 菜单 / 抽屉的 addEventListener（界面交互的"接线"集中于此）；
 *   2) 顶部菜单抽屉 openSheet / closeSheet；
 *   3) 启动 boot()：渲染命格录与成就、揭示初始命格。
 * 其它 7 个模块都是"纯库"——只往 window.ZT 上挂能力，不在加载时碰 DOM、不绑按钮。
 * 想加一个新按钮/新菜单，只改这个文件；想改玩法，去对应模块。
 * 依赖：ZT.replay、ZT.record、ZT.achievements、ZT.engine（均已先加载）。
 * ========================================================================= */
(function(ZT){
  'use strict';

  const Replay = ZT.replay, Record = ZT.record, Ach = ZT.achievements, Engine = ZT.engine;
  const $ = id => document.getElementById(id);

  // —— 顶部菜单：命格录 / 成就 / 排行榜 抽屉 ——
  function openSheet(which){
    const ach=$('achPanel'), rec=$('recordPanel');
    if(which==='ach'){ ach.style.display='block'; rec.style.display='none'; }
    else { ach.style.display='none'; rec.style.display='block'; }
    $('sheetOverlay').classList.add('show');
    if(which==='ach') Ach.renderAch(); else Record.renderRecord();
    if(which==='lb'){ setTimeout(()=>{ const el=$('lbCpList'); if(el) el.scrollIntoView({behavior:'smooth',block:'center'}); },60); }
  }
  function closeSheet(){ $('sheetOverlay').classList.remove('show'); }

  // —— 绑定所有按钮（唯一的 addEventListener 集中地）——
  function bindEvents(){
    $('startBtn').addEventListener('click', ()=>{
      if(window.parent!==window){
        window.parent.postMessage({type:'momo.zhesi.run.started'}, window.location.origin);
      }
      Replay.start();
    });
    // 命运难易：如履薄冰（默认）/ 爽玩（成帝≈20% · 成仙≈5%）/ 养成（慢节奏·修行侧重亲手养成）
    $('modeHard').addEventListener('click', ()=>{ window.ZT.mode='hard'; $('modeHard').classList.add('on'); $('modeShuang').classList.remove('on'); $('modeYang').classList.remove('on'); });
    $('modeShuang').addEventListener('click', ()=>{ window.ZT.mode='shuang'; $('modeShuang').classList.add('on'); $('modeHard').classList.remove('on'); $('modeYang').classList.remove('on'); });
    $('modeYang').addEventListener('click', ()=>{ window.ZT.mode='yang'; $('modeYang').classList.add('on'); $('modeHard').classList.remove('on'); $('modeShuang').classList.remove('on'); Replay.setAutoMode(false); Replay.resetSpeed(); });
    $('againBtn').addEventListener('click', Replay.again);

    $('sp1').addEventListener('click', e=>Replay.setSpeed(140, e.target));
    $('sp2').addEventListener('click', e=>Replay.setSpeed(45,  e.target));
    $('sp3').addEventListener('click', e=>Replay.setSpeed(0,   e.target));

    // 手动 / 自动 抉择模式切换
    $('modeManual').addEventListener('click', ()=>Replay.setAutoMode(false));
    $('modeAuto').addEventListener('click', ()=>Replay.setAutoMode(true));

    $('recClear').addEventListener('click', ()=>{
      if(typeof confirm==='function' && !confirm('确定清空本地命格录？此操作不可恢复。')) return;
      Record.clear();
    });

    $('menuRec').addEventListener('click', ()=>openSheet('rec'));
    $('menuAch').addEventListener('click', ()=>openSheet('ach'));
    $('menuLb').addEventListener('click',  ()=>openSheet('lb'));
    $('sheetClose').addEventListener('click', closeSheet);
    $('sheetOverlay').addEventListener('click', e=>{ if(e.target===$('sheetOverlay')) closeSheet(); });

    // 设定 · 玩法图鉴
    $('menuHelp').addEventListener('click', ()=> $('settingOverlay').classList.add('show'));
    $('setClose').addEventListener('click', ()=> $('settingOverlay').classList.remove('show'));
    $('setCloseBtn').addEventListener('click', ()=> $('settingOverlay').classList.remove('show'));
    $('settingOverlay').addEventListener('click', e=>{ if(e.target===$('settingOverlay')) $('settingOverlay').classList.remove('show'); });

    // 抉择面板：事件委托——点到哪个选项就把下标交给回放模块继续推演
    $('cpOpts').addEventListener('click', e=>{
      const btn = e.target.closest ? e.target.closest('.cp-opt') : null;
      if(!btn) return;
      Replay.choose(parseInt(btn.getAttribute('data-idx'),10) || 0);
    });

    // 命格录「回看」：点到某世的「回看」按钮，把该世完整一生铺陈出来
    $('recList').addEventListener('click', e=>{
      const btn = e.target.closest ? e.target.closest('.rec-view') : null;
      if(!btn) return;
      Replay.openLife(parseInt(btn.getAttribute('data-t'),10) || 0);
    });
    // 一生回看覆盖层：关闭按钮 + 点遮罩空白处关闭
    $('lrClose').addEventListener('click', ()=> $('lifeReview').classList.remove('show'));
    $('lifeReview').addEventListener('click', e=>{ if(e.target===$('lifeReview')) $('lifeReview').classList.remove('show'); });

    // 切到后台标签页时把这一世剩余事件补完，回到前台即见结局
    document.addEventListener('visibilitychange', ()=>{ if(document.hidden) Replay.flushRemaining(); });
  }

  // —— 启动 ——
  function boot(){
    Record.renderRecord();
    Ach.renderAch();
    Replay.showInit(Engine.rollLife());
  }

  bindEvents();
  boot();

})(window.ZT = window.ZT || {});
