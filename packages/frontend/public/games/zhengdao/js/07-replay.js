/* User-provided source archive SHA-256: 34ec6528a54acb3e593c9b9a8d0deb9ea0d3723c2d795ad32cf457671f8415a3. */
/* =========================================================================
 * 07-replay.js  ·  回放与结算（支持「玩家抉择」的交互式推演）  →  window.ZT.replay
 * -------------------------------------------------------------------------
 * showInit / startLife / pump / playTail / appendEv / applyStatsToDom /
 * finishReplay / setupResultButtons / flushRemaining / setSpeed / resetSpeed
 * / choose（玩家点选）/ hasPendingChoice / start（=受命按钮逻辑）/ again。
 *
 * 交互推演机制：
 *   引擎 simulateGen 是「生成器」，推演途中遇抉择点会 yield 出抉择请求
 *   {kind:'choice', events, title, prompt, options}；本模块先把已产生的事件
 *   按速度播完，再弹出抉择面板，等玩家点选后调用 choose(i) → pump(i) 继续推演。
 * 改界面演出、逐岁演进、结局面板，只看这个文件。
 * 依赖：ZT.data、ZT.util、ZT.engine、ZT.record、ZT.achievements。
 * 注意：本模块拥有「播放状态」（current/speed/playTimer 等）与播放控制，
 *       但不主动 addEventListener 绑定按钮——按钮统一由 08-app.js 接线。
 * ========================================================================= */
(function(ZT){
  'use strict';

  const D = ZT.data, U = ZT.util, E = ZT.engine, R = ZT.record, A = ZT.achievements;
  const REALMS = D.REALMS;
  const weaponName=U.weaponName, worldStageOfRealm=U.worldStageOfRealm, worldStageName=U.worldStageName,
        gradeOf=U.gradeOf, daoHao=U.daoHao, verseFor=U.verseFor, daoKindOf=U.daoKindOf, combatPower=U.combatPower;
  const simulateGen=E.simulateGen, rollLife=E.rollLife;
  const saveRecord=R.saveRecord, renderRecord=R.renderRecord, loadHistory=R.loadHistory;
  const evaluateAchievements=A.evaluateAchievements, renderAch=A.renderAch, showNewAchievements=A.showNewAchievements;

  // —— 播放状态（本模块私有）——
  let current=null, playTimer=null, speed=140, finished=false, playIdx=0;
  let runRealm=0, runLife=0, runWeaponLv=0, runWorld='新手村';
  // —— 交互抉择状态 ——
  let gen=null;          // 当前这一世的推演生成器
  let animated=0;        // 已经播过的事件条数
  let pendingReq=null;   // 当前等待玩家点选的抉择请求
  let tailCb=null;       // 当前这一段事件播完后的回调
  let curEvs=null;       // 当前这一段的事件数组（引擎内部数组的引用）
  let autoMode=false;    // 抉择模式：false=手动（等玩家点选），true=自动（天意代择）
  let ffAuto=false;      // 瞬览（speed=0）期间强制自动抉择，使手动模式也能一键跳到结算
  let qiyuContCb=null;   // 奇遇结果卡「继续」回调（瞬览时直接代点）

  // 养成模式 HUD：实时展示五维修行侧重（战力/悟性/道心/机缘/寿元），数值可见可养
  const YANG_DIMS = [
    {key:'combat',  label:'⚔ 战力'},
    {key:'comp',    label:'✨ 悟性'},
    {key:'heart',   label:'❤ 道心'},
    {key:'fortune', label:'🌟 机缘'},
    {key:'life',    label:'⏳ 寿元'}
  ];
  function updateYangHud(focus){
    const el=document.getElementById('yangHud');
    if(!el) return;
    el.innerHTML = YANG_DIMS.map(d=>{
      const v = (focus && focus[d.key]) ? focus[d.key] : 0;
      return `<span class="yh-dim" title="修行侧重·${d.label.trim()}">${d.label}<b>${v}</b></span>`;
    }).join('');
  }

  function realmIndexFromText(t){
    for(let i=0;i<REALMS.length;i++){
      const r=REALMS[i];
      if(t.includes(r.k) && (t.includes(r.g) || r.g==='证道称帝' || r.g==='长生不朽')) return i;
    }
    return -1;
  }

  function showInit(L){
    current=L;
    document.getElementById('aptVal').textContent='？？？';
    document.getElementById('aptDesc').textContent='命数未显，入世方知。';
    document.getElementById('raceVal').textContent='？？？';
    document.getElementById('raceDesc').textContent='命数未显，入世方知。';
    document.getElementById('phyVal').textContent='？？？';
    document.getElementById('phyDesc').textContent='命数未显，入世方知。';
    document.getElementById('lifeVal').textContent='？？？';
    document.getElementById('lifeDesc').textContent='命数未显，入世方知。';
    document.getElementById('fateCard').style.display='none';
    document.getElementById('initHint').textContent='命数未显——资质、种族、体质与寿元皆藏于天机，入世后方揭晓，且不可更改。点击「受命此生」，走完这一生，方能再投一世。';
  }

  function startLife(){
    resetSpeed(); // 瞬览仅限上一段，新一世复位为常速
    document.getElementById('initPanel').style.display='none';
    document.getElementById('playPanel').style.display='block';
    document.getElementById('overlay').classList.remove('show');
    const fc=document.getElementById('fateCard');
    fc.style.display='flex';
    document.getElementById('fApt').textContent=current.apt.rank;
    const phyTag = current.phy.races.includes('all') ? '各族共有' : current.phy.races.join('/')+'专属';
    document.getElementById('fPhy').textContent=current.phy.name+'（'+current.phy.tier+'·'+phyTag+'）';
    document.getElementById('fRace').textContent=current.race.name;
    document.getElementById('fIden').textContent=current.identity.name+'（'+(current.identity.desc||'')+'）';
    document.getElementById('fLife').textContent=current.baseLife+' 载';
    document.getElementById('fWorld').textContent=current.region.name+'（'+(current.region.tag||'新手村')+'）';
    document.getElementById('fPath').textContent='推演中方定';
    // —— 重置播放与抉择状态 ——
    finished=false;
    playIdx=0; animated=0; pendingReq=null; tailCb=null; curEvs=null; qiyuContCb=null; ffAuto=false;
    runRealm=0; runLife=current.baseLife; runWeaponLv = current.race.weaponNat?3:0;
    runWorld='新手村 · '+current.region.name;
    document.getElementById('log').innerHTML='';
    document.getElementById('sAge').textContent='0';
    document.getElementById('sLife').textContent=runLife;
    document.getElementById('sWeapon').textContent=weaponName(runWeaponLv, current.race);
    document.getElementById('sRealm').textContent='凡人';
    document.getElementById('sWorld').textContent=runWorld;
    document.getElementById('realmNow').textContent='凡人 · 未入道';
    document.getElementById('realmBar').style.width='0%';
    hideChoice();
    // 养成 HUD：养成模式显示并清零，其它模式隐藏
    const yhw=document.getElementById('yangHudWrap');
    if(yhw){ if(ZT.mode==='yang'){ yhw.style.display='flex'; updateYangHud({combat:0,comp:0,heart:0,fortune:0,life:0}); } else { yhw.style.display='none'; } }
    current._sim=null; current._evs=[];
    // —— 开启交互式推演 ——
    gen = simulateGen(current.apt, current.phy, current.race, current.baseLife, current.region, {identity:current.identity, gender:current.gender});
    pump(undefined);
  }

  /* ============ 交互式推演驱动 ============ */

  // 推进推演：跑到下一個抉择点（或人生终局），先把新产生的事件播完
  function pump(choice){
    const r = gen.next(choice);
    const st = r.value;
    if(r.done){ // 一生推演完毕
      playTail(st, ()=>{ applyStatsToDom(st); finishReplay(st); });
      return;
    }
    playTail(st, ()=>resolveChoice(st)); // 遇抉择：按当前模式响应
  }

  // 抉择点响应：自动模式/瞬览由天意代择，手动模式弹面板等玩家点选
  function resolveChoice(st){
    if(autoMode || ffAuto){
      const opts = (st && st.options) || [];
      const n = opts.length;
      const idx = n ? Math.floor(Math.random()*n) : 0;
      if(autoMode && !ffAuto) appendAutoChoiceNote(st, opts[idx]); // 仅常规自动模式写「天意抉择」注记；瞬览静默代择
      pendingReq=null;
      pump(idx);
    } else {
      showChoice(st);
    }
  }

  // 自动模式下，把「天意抉择」写进日志，让玩家知道这一世如何自处
  function appendAutoChoiceNote(st, opt){
    const log=document.getElementById('log');
    if(!log) return;
    const d=document.createElement('div');
    d.className='ev t-auto';
    d.innerHTML='<span class="yr">天意</span>⚙ 自动抉择【'+(st&&st.title||'命运抉择')+'】→ '+(opt?opt.label:'续命前行');
    log.appendChild(d);
    log.scrollTop=log.scrollHeight;
  }

  // 切换手动/自动模式（按钮由 08-app.js 接线）；auto=true 即自动推演
  function setAutoMode(v){
    autoMode=!!v;
    ['modeManual','modeAuto'].forEach(id=>{ const el=document.getElementById(id); if(el) el.classList.remove('on'); });
    const on = autoMode ? 'modeAuto' : 'modeManual';
    const el=document.getElementById(on); if(el) el.classList.add('on');
    // 若此刻正等抉择，立即按新模式响应
    if(pendingReq && autoMode) resolveChoice(pendingReq);
  }

  // 单事件推进（模块级，便于速度切换时重新调度）
  function step(){
    if(finished) return;
    if(!curEvs) return;
    if(playIdx < curEvs.length){
      appendEv(curEvs[playIdx], null); playIdx++;
      playTimer = setTimeout(step, speed);
    } else {
      const cb = tailCb; tailCb = null;
      if(cb) playTimer = setTimeout(cb, 0); // 异步触发下一阶段，让出主线程，避免同步递归冻结
    }
  }

  // 播放「从上一段结束处 → 当前事件末尾」的这一段
  function playTail(st, onDone){
    curEvs = (st && st.events) || [];
    current._evs = curEvs;
    tailCb = onDone;
    const from = animated;
    animated = curEvs.length;
    if(playTimer){ clearTimeout(playTimer); playTimer=null; }
    if(from >= curEvs.length){ // 本段已播过，直接进入下一步（异步，不断递归）
      playTimer = setTimeout(()=>{ const cb=tailCb; tailCb=null; if(cb) cb(); }, 0);
      return;
    }
    if(speed===0){ // 瞬览：本段一次性补完，进度置尾，后续由 step/tailCb 异步续推（不阻塞主线程）
      for(let i=from;i<curEvs.length;i++) appendEv(curEvs[i], null, true);
      renderAllLog(curEvs);
      playIdx = curEvs.length;
      playTimer = setTimeout(()=>{ const cb=tailCb; tailCb=null; if(cb) cb(); }, 0);
      return;
    }
    playIdx = from;
    playTimer = setTimeout(step, speed);
  }

  // 把当前这一段立刻补完（瞬览 / 切后台时用），但不在此同步触发后续（杜绝递归冻结）
  function completeTailInstantly(){
    if(!curEvs) return;
    if(playIdx < curEvs.length){
      for(let i=playIdx;i<curEvs.length;i++) appendEv(curEvs[i], null, true);
      renderAllLog(curEvs);
      playIdx = curEvs.length;
    }
  }

  function renderAllLog(evs){
    const log=document.getElementById('log');
    log.innerHTML = evs.map(e=>`<div class="ev t-${e.type}">${e.year>0?`<span class="yr">${e.year}岁</span>`:''}${e.text}</div>`).join('');
    log.scrollTop=log.scrollHeight;
  }

  /* ============ 抉择面板 ============ */

  function hideChoice(){
    qiyuContCb=null;
    const p=document.getElementById('choicePanel');
    if(p) p.hidden=true;
  }

  function showChoice(req){
    pendingReq=req;
    const p=document.getElementById('choicePanel');
    const t=document.getElementById('cpTitle'), pr=document.getElementById('cpPrompt'), box=document.getElementById('cpOpts');
    if(t) t.textContent = req.title || '命 运 抉 择';
    if(pr) pr.textContent = req.prompt || '';
    if(box) box.innerHTML = (req.options||[]).map((o,i)=>
      `<button class="cp-opt" data-idx="${i}"><span class="cp-t">${o.label}</span><span class="cp-d">${o.desc||''}</span></button>`
    ).join('');
    if(p){ p.hidden=false; if(p.scrollIntoView) p.scrollIntoView({block:'nearest'}); }
  }

  function hasPendingChoice(){ return !!pendingReq; }

  // 玩家点选（按钮由 08-app.js 以事件委托接线）
  function choose(idx){
    if(!pendingReq) return;
    const req = pendingReq;
    pendingReq=null;
    hideChoice();
    // 立即推进并处理本次选择：把本次新增事件（含奇遇结果）即时播到日志，避免玩家错过反馈
    const before = animated;
    const r = gen.next(typeof idx==='number' ? idx : 0);
    const st = r.value;
    const evs = (st && st.events) || current._evs || [];
    for(let i=before;i<evs.length;i++) appendEv(evs[i], null);
    animated = evs.length;
    if(isQiyuReq(req)){            // 奇遇：在面板里把结果亮出来，点「继续」才推进（死亡也在此显示）
      if(ffAuto){                 // 瞬览：跳过结果卡，直接续推到下一抉择/结算
        if(r.done){ applyStatsToDom(st); finishReplay(st); }
        else resolveChoice(st);
        return;
      }
      showQiyuResult(req, idx, collectQiyuResults(before, evs), r);
      return;
    }
    if(r.done){ applyStatsToDom(st); finishReplay(st); return; }
    resolveChoice(st);             // 方向/禁区类抉择：直接弹下一个面板
  }

  // 是否为「奇遇」抉择（标题含「奇 遇」）
  function isQiyuReq(req){ return !!(req && req.title && req.title.indexOf('奇 遇')>=0); }

  // 收集本次抉择产生的结果事件文本（奇遇结果 / 奇遇死亡）
  function collectQiyuResults(from, evs){
    const out=[];
    for(let i=from;i<evs.length;i++){
      const e=evs[i];
      if(e.type==='qiyu' || e.type==='end') out.push(e.text);
    }
    return out.length ? out : ['（机缘已定，命运继续流转……）'];
  }

  // 奇遇结果卡：明确展示「你选了 X → 结果」，点「继续」才继续推演
  function showQiyuResult(req, idx, resTexts, r){
    pendingReq = r.done ? null : r.value; // 缓存下一抉择（若已终局则不挂起）
    const p=document.getElementById('choicePanel');
    const t=document.getElementById('cpTitle'), pr=document.getElementById('cpPrompt'), box=document.getElementById('cpOpts');
    if(t) t.textContent='奇 遇 · 结 果';
    const chosen = (req.options && req.options[idx]) ? req.options[idx].label : '';
    if(pr){ pr.innerHTML = '你于【'+(req.title||'奇遇').replace(/奇 遇/g,'奇遇')+'】中选择了【'+chosen+'】<br><br><div class="cp-result">'+ resTexts.join('<br>') +'</div>'; }
    if(box){
      box.innerHTML = '<button class="cp-cont" id="cpCont">继 续 ▶</button>';
      qiyuContCb = ()=>{
        qiyuContCb=null;
        hideChoice();
        if(r.done){ applyStatsToDom(r.value); finishReplay(r.value); }
        else resolveChoice(r.value);
      };
      const cont=document.getElementById('cpCont');
      if(cont) cont.addEventListener('click', qiyuContCb);
    }
    if(p){ p.hidden=false; if(p.scrollIntoView) p.scrollIntoView({block:'nearest'}); }
  }

  function appendEv(ev, sim, silent){
    if(ev.yang) updateYangHud(ev.yang); // 养成·修行侧重：实时刷新 HUD
    if(!silent){
      const log=document.getElementById('log');
      const d=document.createElement('div');
      d.className='ev t-'+ev.type;
      const yrTxt = ev.year>0 ? `<span class="yr">${ev.year}岁</span>` : '';
      d.innerHTML=yrTxt+ev.text;
      log.appendChild(d);
      log.scrollTop=log.scrollHeight;
    }
    if(!silent) document.getElementById('sAge').textContent = (runRealm>=38 && ev.year>=1000) ? (Math.floor(ev.year/1000)+'千载') : ev.year;
    if(ev.weaponName){ runWeaponLv=ev.weaponLv; if(!silent) document.getElementById('sWeapon').textContent=ev.weaponName; }
    if(ev.text.includes('长生不朽')) runLife=999999;
    if(ev.type==='break'){
      let lg=ev.text.match(/寿元 \+(\d+)/); if(lg) runLife+=parseInt(lg[1]);
      let ri2=realmIndexFromText(ev.text);
      if(ri2>=0){ runRealm=ri2;
        if(!silent){
          document.getElementById('sRealm').textContent=REALMS[ri2].k;
          document.getElementById('realmNow').textContent=REALMS[ri2].k+' · '+REALMS[ri2].g;
          document.getElementById('realmBar').style.width=Math.round(ri2/(REALMS.length-1)*100)+'%';
        }
      }
    }
    let ym=ev.text.match(/延寿 (\d+) 载/); if(ym) runLife+=parseInt(ym[1]);
    let lm=ev.text.match(/耗去 (\d+) 载寿元/);
    if(lm) runLife-=parseInt(lm[1]);
    if(ev.world){ runWorld = worldStageName(ev.world, current.region); if(!silent) document.getElementById('sWorld').textContent=runWorld; }
    if(ev.pathReveal){ if(!silent) document.getElementById('fPath').textContent=ev.pathReveal; }
    if(!silent){
      const lifeLeft = (runLife>=999999) ? '∞' : (runRealm>=38 ? Math.floor(Math.max(0,runLife-ev.year)/1000)+'千载' : Math.max(0,runLife-ev.year));
      document.getElementById('sLife').textContent= lifeLeft;
      document.getElementById('sWeapon').textContent=weaponName(runWeaponLv, current.race);
    }
  }

  function applyStatsToDom(sim){
    const f=sim.final;
    document.getElementById('sAge').textContent=f.age;
    document.getElementById('sRealm').textContent=REALMS[f.realm].k;
    document.getElementById('realmNow').textContent=REALMS[f.realm].k+' · '+REALMS[f.realm].g;
    document.getElementById('realmBar').style.width=Math.round(f.realm/(REALMS.length-1)*100)+'%';
    document.getElementById('sWorld').textContent=runWorld;
    document.getElementById('sWeapon').textContent=weaponName(runWeaponLv, current.race);
    document.getElementById('sLife').textContent= (runLife>=999999)?'∞':Math.max(0,runLife-f.age);
    if(f.path) document.getElementById('fPath').textContent=f.path.name;
  }

  // 结果面板分组渲染：把稠密信息拆成「一生命途 / 证道之路 / 道身根底」三块，眉清目秀
  function sectionRow(title, inner){
    return `<div class="rs-sec"><div class="rs-sec-t">${title}</div><div class="rs-sec-b">${inner}</div></div>`;
  }

  function finishReplay(sim){
    if(finished) return; // 防重复结算（如「继 续 ▶」被连点两次，避免重复写入命格录）
    finished=true;
    const f=sim.final;
    if(f.yang) updateYangHud(f.yangFocus); // 养成：结算时按最终侧重校准 HUD
    const gd=gradeOf(f.realm, f.tianDi, f.gender);
    const dao=daoHao();
    const pn=f.path?f.path.name:'道途未竟';
    document.getElementById('rGrade').textContent=gd.g;
    document.getElementById('rGrade').className='grade '+gd.cls;
    document.getElementById('rTitle').textContent=gd.title;
    document.getElementById('rDao').textContent='道号：'+dao;
    const finalWorld = worldStageName(worldStageOfRealm(f.realm), f.region);
    const dk = (f.daoKind || f.tianDi || f.zizhan) ? daoKindOf(f) : null;
    const special =
      (f.yuanJavaJoke?`<div class="java-joke">「${f.yuanJavaJoke}」</div>`:'')+
      (f.ancestorRevive?`<div class="ancestor-revive">☯ 【${f.ancestorRevive.master}】于准帝九重天显化，复活你一次，留言：「${f.ancestorRevive.msg}」</div>`:'')+
      (f.duERevive?`<div class="du-e-revive">🍄 你于奇遇绝境大喊「我饿了！」，【肚饿真君】隔空发来一筐蘑菇，你抱着蘑菇死里逃生！</div>`:'')+
      (f.realm>=REALMS.length-1?`<div class="hongchen-vision">🌀 时间长河幻觉：你于长生不朽之巅，听见时间长河深处传来诡谲笑声：「海绵宝宝，我们去抓水母吧～」</div>`:'')+
      (f.kungaoEgg?`<div class="kungao-whisper">☥ 【困告仙尊】你逆活入梦，终究没能醒来——万古长梦缠身，永眠于幻妄之间。睡吧…… 啊哈哈哈哈哈哈哈！</div>`:'')+
      (f.xindiEgg?`<div class="xindi-egg">🥟 地球故乡的烟火漫上心头：「这是我大哥 这是我嫂子 我爱吃饺子。」</div>`:'')+
      (f.zhuzhuEgg?`<div class="zhuzhu-egg">🌟 猪猪牛的赐福仍萦绕帝魂：「你这一世太苦了，下一世做个好人~」</div>`:'')+
      (f.perfectBirth?`<div class="bingxia-egg">✅ 【必拿下】你重生于异世界——天赋、体质、家世皆臻完美，此生顺遂无虞；万般奇遇，必拿下。在异世界，你露出了欣慰的笑容。</div>`:'');
    const lifeSec = sectionRow('一生命途',
      `<div>终年：<b>${f.age}</b> 载（${f.cause}）</div>`+
      `<div>最高境界：<b>${REALMS[f.realm].k} · ${REALMS[f.realm].g}</b></div>`+
      `<div>出生地：<b>${f.region.name}</b>（${f.region.tag||''}）　最终涉足：<b>${finalWorld}</b></div>`);
    const pathSec = sectionRow('证道之路',
      (f.path?`<div>证道之道：<b>${f.path.name}</b></div>`:'')+
      (dk?`<div>证道类型：<b style="color:${dk.color}">${dk.name}</b></div>`:'')+
      (f.cultStyle?`<div>修行取向：<b>${f.cultStyle}</b></div>`:'')+
      (f.qiyu?`<div>本世奇遇：<b>${f.qiyu}</b> 次（亲手拍板，改写机缘与生死）</div>`:'')+
      (f.qingyuan?`<div>本世情缘：<b>${f.qingyuan}</b>（${f.qingyuanDeep?'结为道侣 · 情根深种':'浅缘一场'}）</div>`:'')+
      (f.renyuTrialId?`<div>人欲道终试：<b>${f.renyuTrialName}</b>${f.renyuKilled?'（杀妻证道 · 帝路孤冷）':(f.renyuBoai?'（兼爱苍生 · 人欲道极致）':(f.renyuTongzheng?'（双帝临世 · 万古未有）':'（斩断情根 · 绝情入道）'))}${f.renyuTrial?'——证道之刻，你于情关前的抉择':'——情关已过，然终未证道'}</div>`:'')+
      (f.renyuBlocked?`<div style="color:var(--ink2)">⚠ 人欲无根：此生未结情缘，人欲道证道之门永闭，止步准帝九重天。</div>`:'')+
      (f.zizhan?`<div>大帝晚年自斩一刀：<b style="color:#9b59b6">自贬至尊·蛰伏禁区，静候成仙路</b>${f.realm>=39?'——终候得成仙路开启，踏过仙路证得【红尘仙】！':'——至尊之身未候得仙路，抱憾坐化。'}</div>`:''));
    const bodySec = sectionRow('道身根底',
      `<div>种族：<b>${f.race.name}</b>　性别：<b>${f.gender||'—'}</b>　身份：<b>${f.identity||'散修 / 凡俗'}</b>　证道器物：<b>${f.race.weapon}${f.hasWeapon?'（已祭炼）':'（未成）'}</b></div>`+
      `<div>资质：<b>${f.apt.rank}（${f.apt.val}）</b>　体质：<b>${f.phy.name}（${f.phy.tier}）</b></div>`+
      `<div>当前兵器：<b>${weaponName(f.weaponLv,f.race)}${f.hasWeapon?'（帝兵·证道器物）':''}</b>　先天寿元：<b>${f.baseLife}</b> 载</div>`+
      (f.realm>=38?`<div>大帝寿元：<b>约一万五千载</b>${f.secondLife?'（已服不死药·二世重生，再活一世）':(f.elixirUsedEarly?'（不死药已提前服下·二世无望）':'（未得/未服不死药，寿尽坐化）')}</div>`:'')+
      `<div>战力评定：<b style="color:var(--vermilion)">${combatPower(f)}</b>${f.tianDi?'（天帝之威，远超诸帝）':(f.zizhan?'（至尊·蛰伏待仙路）':'')}</div>`+
      (f.selfBodyWeapon?`<div>禁忌祭炼：<b>以自身大帝之躯炼帝兵（狠人式）</b>——兵身合一，证道通天。</div>`:'')+
      (f.yang?`<div>修行侧重：<b>⚔战力 ${f.yangFocus.combat}</b>　<b>✨悟性 ${f.yangFocus.comp}</b>　<b>❤道心 ${f.yangFocus.heart}</b>　<b>🌟机缘 ${f.yangFocus.fortune}</b>　<b>⏳寿元 ${f.yangFocus.life}</b></div>`:''));
    document.getElementById('rRows').innerHTML = special + lifeSec + pathSec + bodySec + `<div style="margin-top:8px;color:var(--ink2)">${gd.comment}</div>`;
    document.getElementById('rVerse').textContent='「'+verseFor(gd.g,f.phy)+'」';
    document.getElementById('overlay').classList.add('show');
    saveRecord({
      t:Date.now(),
      dao:dao,
      aptRank:f.apt.rank, aptVal:f.apt.val,
      phyName:f.phy.name, phyTier:f.phy.tier,
      raceName:f.race.name,
      regionName:f.region?f.region.name:'—',
      pathName:f.path?f.path.name:'道途未竟',
      cultStyle:f.cultStyle||'',
      qiyu:f.qiyu||0,
      qingyuan:f.qingyuan||'', qingyuanDeep:!!f.qingyuanDeep, renyuTrial:f.renyuTrial||'', renyuTrialId:f.renyuTrialId||'', renyuTrialName:f.renyuTrialName||'',
      realm:f.realm, realmName:REALMS[f.realm].k+' · '+REALMS[f.realm].g,
      age:f.age, grade:gd.g, gradeCls:gd.cls, cause:f.cause,
      tianDi:!!f.tianDi, zizhan:!!f.zizhan, daoKind:f.daoKind||'', daoKindName:daoKindOf(f).name, cp:combatPower(f),
      gender:f.gender||'—', identityName:f.identity||'散修 / 凡俗',
      events:sim.events // 完整一生：全部事件日志（供命格录「回看」铺陈）
    });
    renderRecord();
    const newly = evaluateAchievements(f, sim.events, loadHistory().length);
    renderAch();
    showNewAchievements(newly);
    setupResultButtons(f, dao);
  }

  // 命格录「回看」：在外部抽屉里点某一世，展示其完整一生（概览 + 完整事件日志）
  function openLife(t){
    const lr=document.getElementById('lifeReview');
    if(!lr) return;
    const r = R.findRecord(t);
    if(!r){ return; }
    const gd = gradeOf(r.realm, r.tianDi, r.gender);
    const gEl=document.getElementById('lrGrade');
    gEl.textContent = r.grade || gd.g;
    gEl.className = 'grade ' + (r.gradeCls || gd.cls);
    document.getElementById('lrTitle').textContent = gd.title;
    document.getElementById('lrDao').textContent='道号：'+(r.dao||'—');
    const finalWorld = worldStageName(worldStageOfRealm(r.realm), {name:r.regionName||''});
    const ldk = ((r.realm>=38||r.zizhan) && r.daoKind) ? daoKindOf(r) : null;
    const lrLife = sectionRow('一生命途',
      `<div>终年：<b>${r.age>99999?'∞':r.age}</b> 载（${r.cause||'命运使然'}）</div>`+
      `<div>最高境界：<b>${REALMS[r.realm].k} · ${REALMS[r.realm].g}</b></div>`+
      `<div>出生地：<b>${r.regionName||'—'}</b>　最终涉足：<b>${finalWorld}</b></div>`);
    const lrPath = sectionRow('证道之路',
      `<div>证道之道：<b>${r.pathName?r.pathName:'道途未竟（未至仙台，道未显）'}</b></div>`+
      (ldk?`<div>证道类型：<b style="color:${ldk.color}">${ldk.name}</b></div>`:'')+
      (r.cultStyle?`<div>修行取向：<b>${r.cultStyle}</b></div>`:'')+
      (r.qiyu?`<div>本世奇遇：<b>${r.qiyu}</b> 次（亲手拍板，改写机缘与生死）</div>`:'')+
      (r.qingyuan?`<div>本世情缘：<b>${r.qingyuan}</b>（${r.qingyuanDeep?'结为道侣 · 情根深种':'浅缘一场'}）</div>`:'')+
      (r.renyuTrialId?`<div>人欲道终试：<b>${r.renyuTrialName||r.renyuTrial||r.renyuTrialId}</b>${r.renyuTrial?'——证道之刻，你于情关前的抉择':'——情关已过，然终未证道'}</div>`:''));
    const lrBody = sectionRow('道身根底',
      `<div>种族：<b>${r.raceName||'—'}</b>　身份：<b>${r.identityName||'散修 / 凡俗'}</b></div>`+
      `<div>资质：<b>${r.aptRank||'—'}${r.aptVal!=null?('（'+r.aptVal+'）'):''}</b>　体质：<b>${r.phyName||'—'}${r.phyTier?('（'+r.phyTier+'）'):''}</b></div>`+
      (r.cp?`<div>战力评定：<b style="color:var(--vermilion)">${r.cp}</b></div>`:''));
    document.getElementById('lrRows').innerHTML = lrLife + lrPath + lrBody + `<div style="margin-top:8px;color:var(--ink2)">${gd.comment||''}</div>`;
    // 完整一生：把这一世的全部事件按年岁顺序铺陈出来
    const logEl = document.getElementById('lrLog');
    if(r.events && r.events.length){
      logEl.innerHTML = r.events.map(e=>{
        const type = e.type || 'start';
        const yr = (e.year && e.year>0) ? `<span class="yr">${e.year}岁</span>` : '';
        return `<div class="ev t-${type}">${yr}${e.text||''}</div>`;
      }).join('');
    } else {
      logEl.innerHTML = '<div class="rec-empty">此前的版本未留存完整一生，仅余上述概览。今后再走完一世，便可在命格录中「回看」其完整修行足迹。</div>';
    }
    logEl.scrollTop = 0;
    lr.classList.add('show');
  }

  function setupResultButtons(f, dao){
    const again=document.getElementById('againBtn');
    again.textContent = f.realm<38 ? '再 投 一 世' : '重 新 投 生';
    again.classList.add('primary');
  }

  // 同步把整条余生推完，直到 finishReplay 或 r.done（瞬览专用；自动模式会一直推到结算）
  // 不会无限递归——每多走 60 段让一次 setTimeout(0) 防止主线程被独占数秒。
  // 但默认一次性走完，且结尾总是把结算面板弹出来。
  function fastForwardToEnd(){
    let guard=0;
    while(!finished && guard++<200000){
      if(playTimer){ clearTimeout(playTimer); playTimer=null; }
      // 同步补完当前段
      completeTailInstantly();
      if(!tailCb) break;
      const cb = tailCb; tailCb = null;
      // 在同步调用栈里直接跑 cb（resolveChoice in auto mode → pump → playTail 等）
      try{ cb(); }catch(e){ console.error('[fastForward] cb抛错:', e); break; }
    }
  }

  // 播放速度控制（状态归本模块，按钮由 08-app.js 接线）
  function setSpeed(v, btn){
    speed=v;
    ['sp1','sp2','sp3'].forEach(id=>{ const el=document.getElementById(id); if(el) el.classList.remove('on'); });
    if(btn) btn.classList.add('on');
    if(finished) return;
    if(playTimer){ clearTimeout(playTimer); playTimer=null; }
    if(speed===0){ // 瞬览：用户主动选择"立即走完整条余生"——同步推到底，浏览器短暂独占几百毫秒是预期行为
      // 手动模式下，瞬览应自动代择所有抉择、一键跳到结算（不再卡在某个抉择面板等待点选）
      try{
        ffAuto = true;
        if(qiyuContCb){ const f=qiyuContCb; qiyuContCb=null; f(); }      // 奇遇结果卡：直接「继续」
        else if(pendingReq){ const opts=pendingReq.options||[]; choose(Math.floor(Math.random()*(opts.length||1))); } // 已停在抉择面板：先代择，再续推
        fastForwardToEnd();
      }
      catch(e){ console.error('[瞬览 fastForward] 异常：', e); }
      finally{ ffAuto = false; }
      // 即便异常卡住，仍然再保一手：以最低延迟异步续推，绝不留在半截
      if(!finished && curEvs && tailCb){
        playTimer = setTimeout(()=>{ try{ ffAuto=true; fastForwardToEnd(); }catch(_){} finally{ ffAuto=false; } }, 0);
      }
      return;
    }
    // 恢复正常速度：当前段未播完则继续，已播完则触发后续（后续以新速度异步推进）
    if(curEvs && playIdx < curEvs.length){
      playTimer = setTimeout(step, speed);
    } else if(tailCb){
      const cb=tailCb; tailCb=null; playTimer = setTimeout(cb, 0);
    }
  }

  function resetSpeed(){
    speed=140;
    ['sp1','sp2','sp3'].forEach(id=>document.getElementById(id).classList.remove('on'));
    document.getElementById('sp1').classList.add('on');
  }

  // 切到后台标签页时把当前段补完，回到前台即见进展（异步续推，不冻结）
  function flushRemaining(){
    if(finished) return;
    if(playTimer){ clearTimeout(playTimer); playTimer=null; }
    completeTailInstantly();
    if(curEvs && playIdx>=curEvs.length && tailCb){
      playTimer = setTimeout(()=>{ const cb=tailCb; tailCb=null; if(cb) cb(); }, 0);
    }
  }

  // 「受命此生」按钮逻辑（由 08-app.js 接线）
  function start(){
    if(!current) showInit(rollLife());
    startLife();
  }
  // 「重新投生」按钮逻辑（由 08-app.js 接线）
  function again(){
    document.getElementById('overlay').classList.remove('show');
    document.getElementById('playPanel').style.display='none';
    document.getElementById('initPanel').style.display='block';
    finished=true;
    if(playTimer) clearTimeout(playTimer);
    gen=null; tailCb=null; pendingReq=null;
    hideChoice();
    showInit(rollLife());
  }

  ZT.replay = { showInit, startLife, pump, playTail, appendEv, applyStatsToDom, finishReplay,
                setupResultButtons, flushRemaining, setSpeed, resetSpeed,
                choose, hasPendingChoice, start, again, realmIndexFromText,
                setAutoMode, getAutoMode:()=>autoMode, openLife };

})(window.ZT = window.ZT || {});
