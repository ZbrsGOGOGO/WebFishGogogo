/* User-provided source archive SHA-256: 34ec6528a54acb3e593c9b9a8d0deb9ea0d3723c2d795ad32cf457671f8415a3. */
/* =========================================================================
 * 03-util.js  ·  工具函数（纯函数，无 DOM、无状态）  →  window.ZT.util
 * -------------------------------------------------------------------------
 * rnd / ri / pick / weighted / rollApt / combatPower / gradeOf / daoHao /
 * verseFor / weaponName / worldStage* / daoKindOf / TRIBB。
 * 依赖：ZT.data（仅 weaponName 用到 WEAPON_TIERS）。
 * 其它模块通过 ZT.util.X 调用，不再直接引用全局函数。
 * ========================================================================= */
(function(ZT){
  'use strict';

  const D = ZT.data;  // 本模块加载晚于 data，可安全捕获

  function weaponName(lv, race){ return lv>=5 ? race.weapon : D.WEAPON_TIERS[lv].name; }

  function worldStageOfRealm(realm){
    if(realm < 23) return 'novice';
    if(realm < 29) return 'road';
    return 'universe';
  }
  function worldStageName(stage, region){
    if(stage==='road') return '星空古路';
    if(stage==='universe') return '全宇宙';
    return '新手村 · ' + (region?region.name:'—');
  }

  const rnd = ()=>Math.random();
  const ri = (a,b)=>Math.floor(a+Math.random()*(b-a+1));
  const pick = arr=>arr[Math.floor(Math.random()*arr.length)];
  function weighted(list){
    let total=list.reduce((s,x)=>s+x.w,0), r=Math.random()*total;
    for(const x of list){ if((r-=x.w)<=0) return x; }
    return list[list.length-1];
  }

  function rollApt(){
    const val=ri(28,100);
    let rank,desc;
    if(val>=96){rank='SSS · 道骨仙姿';desc='万中无一的悟道奇才，一言悟道，目视即通。';}
    else if(val>=88){rank='SS · 天纵之资';desc='同代翘楚，修行事半功倍。';}
    else if(val>=78){rank='S · 绝世天骄';desc='天资卓绝，前途不可限量。';}
    else if(val>=65){rank='A · 良才美质';desc='资质上乘，勤勉可成大器。';}
    else if(val>=50){rank='B · 中上之姿';desc='资质中上，需借机缘外物。';}
    else if(val>=38){rank='C · 勤勉可补';desc='根骨平平，唯以苦修填平。';}
    else {rank='D · 驽钝之资';desc='根骨驽钝，道途多艰。';}
    return {val,rank,desc,factor:val/60,breakBonus:(val-50)/300};
  }

  function TRIBB(realm){
    if(realm>=38) return ['证道仙劫'];
    if(realm>=29) return ['准帝天心劫','星辰灭世劫'];
    if(realm>=23) return ['四九小劫','雷池大劫','阴阳死劫','仙台劫'];
    return ['四九小劫','雷池大劫','阴阳死劫'];
  }

  function gradeOf(realm, tianDi, gender){
    if(realm>=39) return {g:'神',cls:'g-shen',title:'红尘真仙',comment:'你已超脱岁月，长生不朽，笑傲诸天万界。'};
    if(realm>=38 && tianDi) return {g:'帝',cls:'g-zhidi',title: gender==='女' ? '天帝（女）' : '天帝',comment:'你于证道之刻击碎天心印记，自立其道、独断万古，超脱天道桎梏——诸帝之上，万古独尊。'};
    if(realm>=38) return {g:'天',cls:'g-tian',title: gender==='女' ? '证道女帝' : '证道称帝（普通大帝）',comment:'五大秘境圆满合一，与天心印记相合，化作道茧孕育皇道法则——当世无敌，十方星河诵你帝号。'};
    if(realm>=29) return {g:'地',cls:'g-di',title:'准帝 · 俯瞰天下',comment:'由圣道法则升华为至尊法则，九重天圆满。只差一步，便是诸天共尊的大帝。'};
    if(realm>=26) return {g:'玄',cls:'g-xuan',title:'圣人 · 圣道领域',comment:'仙台四~五层天，生命层次升华步入法则领域，寿元万载，已然站在世间顶端。'};
    if(realm>=23) return {g:'玄',cls:'g-xuan',title:'大能 · 仙台强者',comment:'半步大能、大能、斩道王者——仙台一~三层天，已离尘世、威震一方星域。'};
    if(realm>=14) return {g:'黄',cls:'g-huang',title:'化龙真人 · 寿千载',comment:'脊椎化龙，血气如海，寿元千载，已非凡俗可比。'};
    if(realm>=10) return {g:'黄',cls:'g-huang',title:'四极强者',comment:'四肢连通天地四极，举手投足皆法则玄术相伴。'};
    if(realm>=5)  return {g:'黄',cls:'g-huang',title:'道宫修士',comment:'五脏神藏孕育道宫神祇，已入修行中坚。'};
    if(realm>=1)  return {g:'凡',cls:'g-fan',title:'轮海修士',comment:'开辟苦海，初窥修行门径，距大道尚远。'};
    return {g:'凡',cls:'g-fan',title:'红尘过客',comment:'一生碌碌，未入修行门径，终究是天地间一介凡夫。'};
  }

  function daoHao(){
    return pick(D.DAO_SUR)+pick(D.DAO_NAME)+pick(['子','真人','道君','散人','居士']);
  }

  function verseFor(g, phy){
    const v={
      '神':['一粒尘中藏万界，长生久视笑沧桑。','超脱轮回外，不在五行中。'],
      '天':['帝关一开诸天静，万古长歌颂帝名。','举头红日白云低，四海五湖皆一望。'],
      '地':['准帝临世风雷动，俯瞰人间几度秋。','一念法则生，再念星河倾。'],
      '玄':['圣体不灭寿万载，道心如月照古今。','踏破虚空窥法则，方知身外有乾坤。'],
      '黄':['化龙九变惊天地，凡骨亦可傲王侯。','千载悠悠身未老，笑看沧海变桑田。'],
      '凡':['命里有时终须有，命里无时莫强求。','纵是凡骨微如芥，亦可心向长生天。']
    };
    return pick(v[g]||v['凡']);
  }

  function daoKindOf(f){
    if(f.realm>=39) return f.zizhan ? {name:'红尘仙（超脱·仙路争渡）', color:'#c0392b', short:'仙路争渡·红尘仙'} : {name:'红尘仙（超脱）', color:'#c0392b', short:'红尘仙·超脱'};
    if(f.zizhan)    return {name:'自斩至尊（堕落）', color:'#9b59b6', short:'自斩至尊·堕落'};
    if(f.tianDi)    return {name:'天帝（无敌）', color:'#d4a017', short:'天帝·无敌'};
    const map={
      '无缺':{name:'无缺大帝（正统）', color:'#b8860b', short:'无缺大帝·正统'},
      '另类':{name:'另类成道（半步）', color:'#7a3fb0', short:'另类成道·半步'},
      '物证':{name:'以物证道（丹/器/阵）', color:'#3f6b54', short:'以物证道·丹器阵'},
      '信仰':{name:'信仰成道（香火）', color:'#c97b3a', short:'信仰成道·香火'},
      '杀道':{name:'杀道证道（毁灭）', color:'#a83232', short:'杀道证道·毁灭'},
      '夺道':{name:'夺道证道（邪道）', color:'#7a1f1f', short:'夺道证道·邪道'}
    };
    return map[f.daoKind] || {name:'无缺大帝（正统）', color:'#b8860b', short:'无缺大帝·正统'};
  }

  // 战力评定：综合境界、资质、体质、兵器、是否天帝/二世/仙门之契等
  function combatPower(f){
    if(!f) return 0;
    let cp = f.realm*1000;
    cp += (f.apt?f.apt.val:50)*5;
    const tierMul={'T0':320,'T1':160,'T2':60,'T3':0};
    cp += tierMul[f.phy?f.phy.tier:'T3']||0;
    cp += f.hasWeapon?220:0;
    cp += f.selfBodyWeapon?160:0;
    cp += f.zizhan?380:0;
    // 人欲道终试的道果回响（仅证道称帝者计入）
    cp += f.renyuKilled?400:0;      // 杀妻证道：血染帝路，帝威最盛
    cp += f.renyuBoai?800:0;        // 博爱一生：兼爱苍生，人欲道之极致
    cp += f.renyuTongzheng?1400:0;  // 双帝同证：二帝同辉，万古未有之奇景
    if(f.realm>=38){
      cp += f.tianDi?1600:520;
      cp += f.secondLife?320:0;
      cp += f.immortalGate?340:0;
    }
    if(f.realm>=39) cp += 6000;
    return Math.round(cp);
  }

  ZT.util = { weaponName, worldStageOfRealm, worldStageName,
              rnd, ri, pick, weighted, rollApt, TRIBB,
              gradeOf, daoHao, verseFor, daoKindOf, combatPower };

})(window.ZT = window.ZT || {});
