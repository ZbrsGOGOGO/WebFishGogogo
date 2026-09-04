/* User-provided source archive SHA-256: 34ec6528a54acb3e593c9b9a8d0deb9ea0d3723c2d795ad32cf457671f8415a3. */
/* =========================================================================
 * 05-achievements.js  ·  成就系统  →  window.ZT.achievements
 * -------------------------------------------------------------------------
 * ACHIEVEMENTS 定义 + 解锁判定 + 成就面板渲染。加减成就只看这个文件。
 * 依赖：ZT.config（仅 ACH_KEY）、ZT.util（daoKindOf）。
 * 注意：本模块只定义与渲染，不绑定任何按钮（按钮统一由 08-app.js 接线）。
 * ========================================================================= */
(function(ZT){
  'use strict';

  const C = ZT.config, U = ZT.util;
  const ACH_KEY = C.ACH_KEY;
  const daoKindOf = U.daoKindOf;

  const ACHIEVEMENTS = [
    {id:'first_step',   name:'初入道途', desc:'跨入轮海秘境，修行之门洞开。', icon:'◈',
      chk:(f)=>f.realm>=1},
    {id:'daogong',      name:'道宫初成', desc:'五脏神藏孕育道宫神祇。', icon:'☯',
      chk:(f)=>f.realm>=5},
    {id:'siji',         name:'四极证道', desc:'四肢连通天地四极，举手投足皆法则。', icon:'✶',
      chk:(f)=>f.realm>=10},
    {id:'hualong',      name:'化龙九变', desc:'脊椎化龙，寿元千载，已非凡俗。', icon:'龍',
      chk:(f)=>f.realm>=14},
    {id:'shengren',     name:'证道圣人', desc:'生命层次升华，步入法则领域。', icon:'圣',
      chk:(f)=>f.realm>=26},
    {id:'zhundi',       name:'准帝临世', desc:'九重天圆满，俯瞰天下。', icon:'帝',
      chk:(f)=>f.realm>=29},
    {id:'dadi',         name:'证道称帝', desc:'五大秘境圆满合一，诸天共尊。', icon:'皇',
      chk:(f)=>f.realm>=38},
    {id:'tiandi',        name:'天帝', desc:'于证道之刻击碎天心印记，自立其道、独断万古，超脱天道桎梏，晋为天帝。', icon:'帝',
      chk:(f)=>f.tianDi},
    {id:'hongchen',     name:'红尘真仙', desc:'超脱岁月，长生不朽，笑傲诸天。', icon:'仙',
      chk:(f)=>f.realm>=39},
    {id:'fan_shengren', name:'凡体逆命', desc:'以凡体之身修成圣人（凡体·境界≥圣人）。', icon:'凡',
      chk:(f)=>f.phy.name==='凡体' && f.realm>=26},
    {id:'fan_dadi',     name:'凡体称帝', desc:'凡体证道称帝，狠人大帝再世。', icon:'凡',
      chk:(f)=>f.phy.name==='凡体' && f.realm>=38},
    {id:'shengti_curse',name:'圣体破诅', desc:'荒古圣体走过断路诅咒，登临化龙。', icon:'体',
      chk:(f)=>f.phy.curse && f.realm>=14},
    {id:'shengti_dadi', name:'圣体称帝', desc:'荒古圣体证道称帝，人族脊梁。', icon:'体',
      chk:(f)=>f.phy.curse && f.realm>=38},
    {id:'dun_zhundi',   name:'驽钝成道', desc:'资质≤C（值<50）而修成准帝。', icon:'钝',
      chk:(f)=>f.apt.val<50 && f.realm>=29},
    {id:'tian_cai',     name:'天纵奇才', desc:'资质 SSS 且证道称帝。', icon:'才',
      chk:(f)=>f.apt.val>=96 && f.realm>=38},
    {id:'lijie',        name:'历劫不灭', desc:'曾遭大劫却屹立不倒（终局≥大圣）。', icon:'劫',
      chk:(f,ev)=>ev.some(e=>e.type==='bad') && f.realm>=23},
    {id:'jiusi',        name:'九死一生', desc:'曾突破受挫却续命登临化龙。', icon:'死',
      chk:(f,ev)=>ev.some(e=>e.type==='fail') && f.realm>=14},
    {id:'shenbing',     name:'神兵在握', desc:'祭炼出本族证道器物（帝兵），神兵在手，可镇万劫。', icon:'兵',
      chk:(f)=>f.hasWeapon},
    {id:'changsheng',   name:'长生久视', desc:'终成红尘仙，超脱轮回。', icon:'永',
      chk:(f)=>f.cause.includes('长生')},
    {id:'shouzhong',    name:'寿终正寝', desc:'修行至坐化，安然归去（境界≥轮海）。', icon:'终',
      chk:(f)=>f.cause.includes('坐化') && f.realm>=1},
    {id:'chudu',        name:'初渡雷劫', desc:'四极之后引动天劫，淬体而成。', icon:'雷',
      chk:(f,ev)=>ev.some(e=>e.type==='break' && e.text.includes('淬体而成'))},
    {id:'dibing_dadi',  name:'帝兵证道', desc:'持本族证道器物（帝兵）证得大帝果位。', icon:'兵',
      chk:(f)=>f.realm>=38 && f.hasWeapon},
    {id:'wubing_dadi',  name:'无兵亦帝', desc:'未成帝兵，却硬撼证道之劫登临大帝。', icon:'逆',
      chk:(f)=>f.realm>=38 && !f.hasWeapon},
    {id:'shizhe10',     name:'十世修行', desc:'已历十世轮回，命数渐通。', icon:'十',
      chk:(f,ev,n)=>n>=10},
    {id:'shizhe100',     name:'百世轮回', desc:'已历百世轮回，洞悉天机。', icon:'百',
      chk:(f,ev,n)=>n>=100},
    {id:'star_road',    name:'履极星路', desc:'踏上星空古路，试炼至大圣之境（境界≥大圣）。', icon:'路',
      chk:(f)=>f.realm>=28},
    {id:'dark_turmoil', name:'平定黑暗动乱', desc:'生于北斗·葬帝星，新晋准帝时于黑暗动乱中活了下来（且达准帝）。', icon:'劫',
      chk:(f)=>f.region && f.region.turmoil && f.realm>=29},
    {id:'yuan_dadi',    name:'源天师证道', desc:'以源天师之道（源术）另辟蹊径，登临大帝果位。', icon:'源',
      chk:(f)=>f.path && f.path.id==='yuan' && f.realm>=38},
    {id:'gong_dadi',    name:'功德证道', desc:'以无量功德洗练道果，功德圆满自证大帝。', icon:'德',
      chk:(f)=>f.path && f.path.id==='gong' && f.realm>=38},
    {id:'zhe_shen',     name:'以身合兵', desc:'以自身大帝之躯祭炼帝兵（禁忌·狠人式），兵身合一证道称帝。', icon:'兵',
      chk:(f)=>f.selfBodyWeapon && f.realm>=38},
    {id:'beidou_zun',   name:'葬帝星称尊', desc:'生于天骄最多的北斗·葬帝星，于最高难度中杀出，证道称帝。', icon:'葬',
      chk:(f)=>f.region && f.region.turmoil && f.realm>=38},
    {id:'xinghai_dadi', name:'星海称帝', desc:'于北斗之外（较易、上限较低之星）证道称帝，亦是一方豪雄。', icon:'星',
      chk:(f)=>f.region && !f.region.turmoil && f.realm>=38},
    {id:'er_shi',       name:'二世大帝', desc:'服下不死药·二世重生，再活一万五千载，道途再启，诸帝侧目。', icon:'世',
      chk:(f)=>f.secondLife},
    {id:'zhizun',       name:'蛰伏至尊', desc:'大帝晚年成仙无望，自斩一刀、自贬至尊，蛰伏禁区静候成仙路。', icon:'尊',
      chk:(f)=>f.zizhan && f.realm<39},
    {id:'xianlu',       name:'仙路争渡', desc:'自斩蛰伏万古，终候得成仙路开启，踏过仙路证得红尘仙。', icon:'路',
      chk:(f)=>f.zizhan && f.realm>=39},
    {id:'wuque',        name:'无缺大帝', desc:'以正统修炼之道，五大秘境圆满无缺，与天心印记相合，证得正统大帝果位。', icon:'皇',
      chk:(f)=>f.realm>=38 && !f.tianDi && !f.zizhan && f.daoKind==='无缺'},
    {id:'linglei',      name:'另类成道', desc:'以源天师等逆天之术另辟蹊径，未全然合一却自成一格，半步成道、比肩诸帝。', icon:'源',
      chk:(f)=>f.realm>=38 && f.daoKind==='另类'},
    {id:'wuzheng',      name:'以物证道', desc:'以丹/器/阵之极致（含狠人式自身大帝之躯）逆证帝道，器物即道。', icon:'兵',
      chk:(f)=>f.realm>=38 && f.daoKind==='物证'},
    {id:'xinyang',      name:'信仰成道', desc:'以无量功德与众生信仰香火加身，善果洗练道果，另成一格证帝。', icon:'香',
      chk:(f)=>f.realm>=38 && f.daoKind==='信仰'},
    {id:'shadao',       name:'杀道证道', desc:'于无尽杀伐中悟道，以毁灭入帝，血染星河，诸帝侧目亦胆寒。', icon:'杀',
      chk:(f)=>f.realm>=38 && f.daoKind==='杀道'},
    {id:'duodao',       name:'夺道证道', desc:'夺取他人道果、逆乱嫁接己身，以邪道之术逆天成帝，为天下所忌。', icon:'邪',
      chk:(f)=>f.realm>=38 && f.daoKind==='夺道'},
  ];

  function loadAch(){
    try{ const s=localStorage.getItem(ACH_KEY); return s?JSON.parse(s):{}; }catch(e){ return {}; }
  }
  function unlockAch(id){
    const a=loadAch();
    if(!a[id]){ a[id]=Date.now(); try{ localStorage.setItem(ACH_KEY, JSON.stringify(a)); }catch(e){} }
  }
  // 返回本局"新解锁"的成就定义数组
  function evaluateAchievements(f, evs, n){
    const unlocked=loadAch();
    const newly=[];
    ACHIEVEMENTS.forEach(a=>{
      if(a.chk(f, evs, n) && !unlocked[a.id]){ unlockAch(a.id); newly.push(a); }
    });
    return newly;
  }

  function renderAch(){
    const unlocked=loadAch();
    const keys=Object.keys(unlocked);
    document.getElementById('achCount').textContent=keys.length+' / '+ACHIEVEMENTS.length;
    document.getElementById('achGrid').innerHTML=ACHIEVEMENTS.map(a=>{
      const on=!!unlocked[a.id];
      const tm=on?('解锁于 '+new Date(unlocked[a.id]).toLocaleDateString()) : '未解锁';
      return `<div class="ach${on?' on':' locked'}">`+
        `<div class="ic">${a.icon}</div>`+
        `<div class="info"><div class="nm">${a.name}</div>`+
        `<div class="ds">${a.desc}</div>`+
        `<div class="tm">${tm}</div></div>`+
      `</div>`;
    }).join('');
  }

  function showNewAchievements(list){
    const el=document.getElementById('rAch');
    if(!list || !list.length){ el.innerHTML=''; return; }
    el.innerHTML='<div class="na-t">★ 本局解锁成就 ★</div>'+
      list.map(a=>`<span class="na-i"><span class="ni">${a.icon}</span><span class="nn">${a.name}</span></span>`).join('');
  }

  ZT.achievements = { ACHIEVEMENTS, loadAch, unlockAch, evaluateAchievements, renderAch, showNewAchievements };

})(window.ZT = window.ZT || {});
