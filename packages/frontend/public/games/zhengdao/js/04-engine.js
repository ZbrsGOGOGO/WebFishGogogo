/* User-provided source archive SHA-256: 34ec6528a54acb3e593c9b9a8d0deb9ea0d3723c2d795ad32cf457671f8415a3. */
/* =========================================================================
 * 04-engine.js  ·  推演引擎  →  window.ZT.engine
 * -------------------------------------------------------------------------
 * simulate(apt,phy,race,baseLife,region,opts) / rollLife()
 * 一生推演主循环：突破、奇遇、七大禁区、大帝劫夺舍、逆活九世、自斩。
 * 改玩法逻辑只看这个文件。
 * 依赖：ZT.data、ZT.config、ZT.util。
 * 实现手法：在 IIFE 顶部把跨模块的符号取为本地别名（D/C/U），
 * 这样下面 simulate / rollLife 的函数体与单文件版逐字一致，回归风险最低。
 * ========================================================================= */
(function(ZT){
  'use strict';

  const D = ZT.data, C = ZT.config, U = ZT.util;

  // —— 数据别名（ZT.data）——
  const REALMS=D.REALMS, NEED=D.NEED, LIFEGAIN=D.LIFEGAIN, WEAPON_TIERS=D.WEAPON_TIERS, PATHS=D.PATHS,
        FORBIDDEN_ZONES=D.FORBIDDEN_ZONES, IDENTITIES=D.IDENTITIES, ENEMY=D.ENEMY, TRIB=D.TRIB,
        RACES=D.RACES, NOVICE_REGIONS=D.NOVICE_REGIONS, PHYSIQUES=D.PHYSIQUES,
        CULT_STYLES=D.CULT_STYLES, CULT_AT=D.CULT_AT, QIYU=D.QIYU,
        QINGYUAN_NAMES=D.QINGYUAN_NAMES, RENYU_QINGYUAN=D.RENYU_QINGYUAN, RENYU_TRIAL=D.RENYU_TRIAL;
  // —— 工具别名（ZT.util）——
  const weighted=U.weighted, combatPower=U.combatPower, weaponName=U.weaponName,
        worldStageOfRealm=U.worldStageOfRealm, pick=U.pick, ri=U.ri, rnd=U.rnd, rollApt=U.rollApt, TRIBB=U.TRIBB;
  // —— 参数别名（ZT.config）——
  const { DIBING_PROB, DIBING_PROB_NAT, DARK_TURMOIL_SURVIVE, DAJIE_CP_THRESHOLD, DAJIE_USURP_STEP, DAJIE_USURP_MAX,
          NIHUO_SPAN, NIHUO_TP_BASE, NIHUO_TP_DEC, LONGSHENG_PROB, IMMORTAL_PROB, EMPEROR_LIFESPAN, ELIXIR_PROB, EARLY_EAT_PROB,
          TIANDI_BASE, TIANDI_APT_BONUS, TIANDI_T0_BONUS, TIANDI_T1_BONUS, ZIZHAN_DELAY, ZIZHAN_PROB, ZIZHAN_LIFESPAN,
          ZIZHAN_WAIT_MIN, ZIZHAN_WAIT_MAX, ZIZHAN_XIAN_PROB, BT_BASE_RE, BT_SLOPE_RE, BT_BASE_NONRE, BT_SLOPE_NONRE,
          BT_P37_PENALTY, DEATH_29, DEATH_37_WP, DEATH_37_NOWP, REDHAIR_DEATH_PROB,
          SH_BT_BASE_LOW, SH_BT_BASE_RE, SH_BT_SLOPE_RE, SH_BT_BASE_NONRE, SH_BT_SLOPE_NONRE,
          SH_BT_FLOOR, SH_P37_PEN, SH_P38_PEN, SH_DEATH_LOW, SH_DEATH_23,
          SH_DEATH_29, SH_DEATH_37_WP, SH_DEATH_37_NOWP, SH_USURP_MAX, SH_ZIZHAN_XIAN,
          SH_NIHUO_TP_BASE, SH_NIHUO_TP_DEC, SH_LONGSHENG, SH_ZIZHAN_PROB, SH_PROG_MUL, SH_LIFE_MUL,
          SECOND_LIFE_SPAN, NEXT_LIFE, ZHUZHU_BLESS_PROB, ZHUZHU_BLESS_MUL,
          YANG_FOCUS_REALMS, YANG_COMBAT_PROB, YANG_COMP_PROB, YANG_HEART_DEATH, YANG_FORTUNE_MUL, YANG_LIFE_GAIN,
          YANG_GAP_EVENTS, YANG_GAP_MAX_YEARS,
          PERFECT_APT_MIN, PERFECT_PHY_TIERS, PERFECT_FAM_IDS } = C;

  function* simulateGen(apt, phy, race, baseLife, region, opts){
  let SH = (ZT.mode === 'shuang'); // 爽玩 / 养成（温和）皆走宽厚命运：本次推演是否走宽厚曲线（每局实时读取，可随时切换）
  if(ZT.mode === 'yang') SH = true;
  const YANG = (ZT.mode === 'yang'); // 养成模式：注入「修行侧重」抉择，维度累加形成持久偏向
  opts = opts || {};
  let path = null; // 证道之道不再于降生时注定，而于踏入仙台（推演过程中）方才显化
  const isRe = !!opts.reincarnated;       // 【轮回机制已移除】此分支不再有入口触发（不再传入 reincarnated），保留以便将来恢复；当前永远为 false
  const reCount = opts.reincarnCount || 0; // 当前第几世轮回（1..9）
  const identity = opts.identity || IDENTITIES[IDENTITIES.length-1]; // 出身身份（默认散修）
  const gender = opts.gender || '男'; // 性别（女帝彩蛋依赖）
  const perfectBirth = perfectBirthOf(apt, phy, identity); // 完美重生：出生时天赋 / 体质 / 家世皆臻顶尖
  if(perfectBirth) SH = true; // 完美重生：此生顺遂——纵在「如履薄冰」之下，亦走宽厚命运曲线
  const isEarth = !!(region && region.name && region.name.indexOf('地球')>=0); // 新地球彩蛋：仅地球出生者
  let age=0, realm=0, realmProgress=0;
  let lifeMax=baseLife;
  if(SH) lifeMax = Math.round(lifeMax * SH_LIFE_MUL); // 爽玩：先天寿元大幅延长，不白白夭折于半途
  let weaponLv = isRe ? 5 : (race.weaponNat ? 3 : 0); // 轮回者自带帝兵；天生传承帝兵雏形者起步王兵
  let hasWeapon = weaponLv>=5;
  let dibingRolled = isRe ? true : false; // 轮回者已具帝兵，无需再祭炼
  let nihuo=0, nihuoAnchor=0, canAscend=false, immortalGate=false; // 红尘仙之槛：逆活九世 / 仙门之契
  let kungaoTrap=false, xindiEgg=false, zhuzhuBlessing=false; // 彩蛋标记：困告仙尊陷阱 / 新地球 / 猪猪牛赐福
  let lastNextLifeAge=0, nextLifeCool=0; // 大帝·活出下一世：续世悟道抉择触发基准年龄 / 距下次悟道契机的冷却（约千年）
  const events=[];
  let alive=true, cause='';
  let lastStage='novice'; // 世界阶段追踪：novice → road → universe
  let merit=0, sourceLv=0, selfBodyWeapon=false, redHair=false; // 证道之道：功德 / 源术 / 禁忌炼器 / 源天诅咒·诡异红毛（准帝九重天方显化）
  // 大帝寿元与不死药：elixir 持有 / 是否已服 / 是否提前服（断绝二世）/ 二世重生 / 寿元是否已设 / 诸帝大战是否已发生
  let elixir=false, elixirUsed=false, elixirUsedEarly=false, secondLife=false, ancestorRevived=false, ancestorMsg='', duERevived=false, emperorSetLife=false, emperorWarHappened=false, tianDi=false;
  let zizhan=false, zizhanAge=0, xianluYear=0, emperorAge=0; // emperorAge：证道称帝之龄
  let hgTried=false; // 荒古禁地一生至多误入一次
  let medFound=false; // 准帝寻得神药·一次性大延寿
  let reLingWaiNoted=false; // 轮回者"另类成道"仅提示一次
  let emperorBattleNoted=0;
  let daoKind='', slain=0, duodao=false, shadaoNoted=false;
  // 秘境修行取向：道宫(5)/四极(10)/化龙(14) 入口各抉择一次，影响余生进境/凶险/机缘
  let cultDone={}, cultRateMul=1, cultRiskMul=1, cultFortuneMul=1, cultStyleName='';
  // 人欲道：情缘（人欲以情入道，无情缘者证道之门永闭）与「证道终试」（一世仅一次）
  let qingyuanAsked=false, hasQingyuan=false, qingyuanName='', qingyuanDeep=false;
  let renyuTrialDone=false, renyuTrialId='', renyuTrialName='', renyuTrialBonus=0;
  let renyuBlocked=false;   // 人欲无根：证道之门已闭，余生止步准帝九重天
  let renyuKilled=false, renyuBoai=false, renyuTongzheng=false; // 终试道果回响（证道后计入战力/结局）
  // 奇遇抉择：道宫之后偶发，玩家亲手拍板（手动点选 / 自动天意）
  const qiyuCool = QIYU.map(()=>0); // 每个奇遇的冷却年数
  let qiyuCount = 0;                // 本世已触发奇遇次数（封顶 QIYU_MAX）
  const QIYU_MAX = 10;
  let forbiddenTried = 0, forbiddenCool = 0; // 禁区奇遇：冷却 + 每世次数上限，避免长寿命下狂发抉择
  const QIYU_PROB_MUL = 0.6;       // 奇遇触发概率总乘数（平衡：避免奇遇过多拉高证道率）
  const QIYU_GAIN_MUL = 0.55;      // 奇遇增益（延寿）总乘数（平衡：延长寿命会提高证道重试次数）
  // 养成模式：五个修行维度的累加侧重（战力 / 悟性 / 道心 / 机缘 / 寿元），随抉择累积，贯穿余生
  let yangFocus = {combat:0, comp:0, heart:0, fortune:0, life:0};
  const yangDone = {};              // 每个大境界入口的「养成·修行侧重」抉择仅触发一次
  // 抉择间隔记账：上一次抉择发生的年份 / 事件总数 / 当时境界 / 当时奇遇数
  // 养成模式据此确保两次抉择之间留出可读的「修行过程」，并把这段经历写进抉择面板
  let lastChoiceAge=-9999, lastChoiceEv=0, lastChoiceRealm=0, lastChoiceQiyu=0;
  function markChoice(){ lastChoiceAge=age; lastChoiceEv=events.length; lastChoiceRealm=realm; lastChoiceQiyu=qiyuCount; }
  // 抉择间隔保护：上一次抉择之后须先攒够 YANG_GAP_EVENTS 条事件（即「这段路上发生的事」）才弹下一处，
  // 免得刚选完马上又弹一个；高境界事件稀疏时以 YANG_GAP_MAX_YEARS 兜底，绝不把抉择等丢。
  function gapOk(){ return (events.length - lastChoiceEv >= YANG_GAP_EVENTS) || (age - lastChoiceAge >= YANG_GAP_MAX_YEARS); }
  // 找出「已跨过但尚未抉择」的境界（若间隔未攒够则顺延到后几年再弹，抉择绝不丢失）
  function pendingRealm(done, list){
    for(let k=0; k<list.length; k++){ const r=list[k]; if(r<=realm && !done[r]) return r; }
    return -1;
  }
  // 抉择面板的「间隔小结」：把这两处抉择之间发生了什么讲给玩家听（年份跨度 / 境界跨度 / 其间机缘）
  function choiceRecap(){
    if(lastChoiceAge <= -9999 || age <= lastChoiceAge) return '';
    const span = age - lastChoiceAge;
    const r0 = REALMS[lastChoiceRealm] ? REALMS[lastChoiceRealm].k : '昔日之境';
    const r1 = REALMS[realm] ? REALMS[realm].k : '此境';
    // 同一秘境的相邻小境界共用 k 名，故按「秘境名」比对：异境则言跨越，同境则言深耕
    const journey = (r0 === r1)
      ? `你于【${r1}】深耕 ${span} 载`
      : `你自【${r0}】一路修至【${r1}】，历时 ${span} 载`;
    const qn3 = qiyuCount - lastChoiceQiyu;
    return `自上一次定夺，${journey}，其间${qn3 > 0 ? '历经 ' + qn3 + ' 番机缘波折' : '风平浪静，未逢奇遇'}。`;
  }
  const CULT_REALMS = Object.keys(CULT_AT).map(Number).sort(function(a,b){return a-b;}); // 秘境取向触发境界：5 / 10 / 14
  // 轮回护身符：九道轮回印所赐，每世至多一次——挡下非禁区至尊所致的必死之劫；若被禁区至尊镇杀则符亦难护真灵，轮回就此终结
  let reTalisman = isRe;       // 轮回者每世开局持符；非轮回者无符
  let lastKillerForbidden=false; // 本岁致命死劫是否由禁区至尊造成（决定护身符是否失效）
  // 护身符挡死判定：kf=true 表示被禁区至尊镇杀（符失效）；返回 true 表示复活继续，false 表示真死（或符已耗尽/非轮回）
  function reTalismanGuard(kf){
    if(!isRe || !reTalisman || kf){ return false; }
    reTalisman=false; alive=true;
    const gain=ri(400,1100);
    lifeMax=Math.max(lifeMax, age)+gain;
    events.push({year:age,type:'good',text:`【轮回护身符】于生死边缘绽放轮回神光，替你挡下这必死之劫！真灵得存，然此符已耗尽，今世往后再无第二次护身（延寿 ${gain} 载）。`});
    return true;
  }
  // 奇遇抉择：解释选项 effect 描述符并改写状态（lifeMax/weaponLv/alive/cause/events）
  function applyQiyu(eff){
    if(!eff) return;
    if(eff.neutral){ events.push({year:age,type:'qiyu',text:eff.text}); return; }
    if(eff.branch){ applyQiyuBranch(eff.branch); return; }
    if(eff.weapon){ applyQiyuWeapon(eff); return; }
    if(eff.death){ applyQiyuDeath(eff.deathText||'奇遇之中身死道消'); return; }
    if(eff.life){
      let amt = ri(eff.life[0], eff.life[1]);
      if(amt>0){
        if(eff.fortune) amt = Math.round(amt*cultFortuneMul);
        amt = Math.round(amt*QIYU_GAIN_MUL);
      } else if(amt<0){
        if(eff.risk)    amt = Math.round(amt*cultRiskMul);
      }
      lifeMax += amt;
      events.push({year:age, type:'qiyu', text:(eff.text||'奇遇临身。').replace('{life}', Math.abs(amt))});
      if(lifeMax<=age) applyQiyuDeath('奇遇受创过重，油尽灯枯，坐化于山门');
      } else if(eff.text){
      events.push({year:age, type:'qiyu', text:eff.text});
    }
  }
  function applyQiyuBranch(branch){
    if(perfectBirth){
      // ★必拿下：分支型机缘，径取其最有利之分支（不再交由天意掷骰）
      let bi=0, bs=-1e9;
      (branch||[]).forEach((b,idx)=>{ const s=scoreEff(b); if(s>bs){ bs=s; bi=idx; } });
      applyQiyu(branch[bi]);
      return;
    }
    let r=rnd(), cum=0, chosen=null;
    for(const b of branch){ cum += (b.p||0); if(r<cum){ chosen=b; break; } }
    if(!chosen) chosen = branch[branch.length-1];
    applyQiyu(chosen);
  }
  function applyQiyuWeapon(eff){
    if(weaponLv<5){
      weaponLv++; hasWeapon=true;
      const wn = weaponName(weaponLv, race);
      events.push({year:age,type:'qiyu',text:(eff.text||'本命兵器升品为【{weapon}】！').replace('{weapon}',wn)});
    } else {
      events.push({year:age,type:'qiyu',text:(eff.text||'帝兵威能更盛。').replace('{weapon}',race.weapon)});
    }
  }
  function applyQiyuDeath(text){
    if(perfectBirth){
      // ★必拿下：死劫不临其身——化必死之局为化险为夷，仅折损少许寿元，绝不因奇遇而终
      const loss=ri(20,80); lifeMax -= loss;
      events.push({year:age,type:'good',text:`【必拿下】奇遇之中劫光临身，本当殒命——然你命数天定，于必死之局中硬挣出一线生机，仅耗去 ${loss} 载寿元，全身而退。`});
      if(lifeMax<=age) lifeMax = age + ri(200,600);
      return;
    }
    if(isRe && reTalisman && rnd()<0.88){
      reTalisman=false; alive=true;
      const gain=ri(400,1100); lifeMax=Math.max(lifeMax,age)+gain;
      events.push({year:age,type:'break',text:`【轮回护身符】于奇遇险死之刻绽放轮回神光，替你挡下这必死之劫！真灵得存，延寿 ${gain} 载。`});
    } else {
      alive=false; cause=text; events.push({year:age,type:'end',text});
    }
  }
  // 境界跨越时即时切换世界阶段，并在踏入全宇宙（准帝）时引爆「黑暗动乱」（仅北斗·葬帝星）
  function checkWorldStage(){
    const stageNow = worldStageOfRealm(realm);
    if(stageNow===lastStage) return;
    lastStage=stageNow;
    if(stageNow==='road'){
      // 证道之道不再于降生/踏上古路时自动注定，而推迟到 realm≥23 由【玩家抉择】显化（见主循环 if(!path && realm>=23)）
      if(!path){
        events.push({year:age,type:'good',text:`你功行圆满，离开【${region.name}】，踏上星空古路——跨星域征战试炼，直指大圣之境。于仙台之途上，你须亲手择定本世【证道之道】——此途将贯穿余生，决定你的机缘、凶险与最终道果。`, world:'road'});
      } else {
        events.push({year:age,type:'good',text:`你功行圆满，离开【${region.name}】，踏上星空古路——跨星域征战试炼，直指大圣之境。`, world:'road'});
      }
    } else {
      events.push({year:age,type:'good',text:`星空古路已至尽头——你已臻准帝，全宇宙诸天战场尽在脚下，诸帝争锋的时代就此来临。`, world:'universe'});
      if(region.turmoil){
        if(rnd() < DARK_TURMOIL_SURVIVE){
          events.push({year:age,type:'break',text:`然【黑暗动乱】骤起——葬帝星禁区至尊苏醒，血染星河！你以新晋准帝之身搏杀至尊，于亘古劫难中活了下来，威名震动诸天！`, world:'universe', dark:true});
          if(path && path.id==='gong'){ merit=Math.min(100,merit+30); events.push({year:age,type:'good',text:`平定黑暗动乱、护佑众生，功德 +30（无量善果加身，仙途更顺）。`}); }
        } else {
          if(isRe && reTalisman){
            reTalisman=false; alive=false;
            cause='黑暗动乱中，被禁区至尊镇杀——轮回护身符难撼至尊之威，真灵崩碎，九世轮回断于此';
            events.push({year:age,type:'end',text:`黑暗动乱爆发，禁区至尊降世——你欲以【轮回护身符】相挡，然至尊之威岂是符箓可撼？真灵崩碎于星空深处，九世轮回就此断绝。`});
          } else {
            alive=false; cause='黑暗动乱中，被禁区至尊镇杀，形神俱灭';
            events.push({year:age,type:'end',text:`黑暗动乱爆发，禁区至尊降世——你新晋准帝未能挡其锋芒，形神俱灭于星空深处。`});
          }
        }
      }
    }
  }

  // 大帝服不死药·二世重生：濒死或寿尽时若有药且未提前服，则免死再活一万五千载（仅一次）
  function tryElixirRevive(){
    if(realm>=38 && !isRe && elixir && !elixirUsed){
      secondLife=true; elixirUsed=true;
      lifeMax = age + EMPEROR_LIFESPAN;
      events.push({year:age,type:'break',text:`大帝寿元将尽（或濒死），你服下【不死药】——二世重生！再活一万五千载，得寿元 +${EMPEROR_LIFESPAN} 载，道途再启，诸帝侧目。`});
      return true;
    }
    return false;
  }

  events.push({year:0,type:'start',text:`你降生于【${region.name}】。——种族【${race.name}】，资质【${apt.rank}】（${apt.val}），体质【${phy.name}】（${phy.tier}），先天寿元约 ${baseLife} 载。`});
  events.push({year:0,type:'start',text:`本命证道器物为【${race.weapon}】${race.weaponNat?'（天生传承，已具雏形）':'（需入仙台后寻大帝神料祭炼）'}。`});
  events.push({year:0,type:'start',text:`证道之道未定——你降生时尚不知将以何途登临大帝，须于修行推演中方才显化。`});
  if(isRe){
    events.push({year:0,type:'start',text:`◈ 九道轮回印加身——你曾是证道大帝，今是第 ${reCount} 世轮回重修。大帝果位犹在，然须自凡尘再修一世；九世重修，于【另类成道】之境立身，半步大帝，超然物外。`});
  }
  if(phy.curse) events.push({year:0,type:'start',text:`⚠ 你身负【荒古圣体·断路诅咒】：欲破四极秘境，须以帝兵级证道器物镇压己身——然帝兵岂是四极可求？故九成圣体夭折于此。`});
  if(perfectBirth){
    events.push({year:0,type:'vision',text:`【必拿下】在异世界，你回望前尘——天赋【${apt.rank}】、体质【${phy.name}（${phy.tier}）】、家世【${identity.name}】，三者皆臻完美，宛如天意铺就的通天之途。念及此处，你露出了欣慰的笑容：这一世顺遂无虞，万般奇遇——必拿下。`});
  }

  while(alive && realm < REALMS.length-1 && age < 120000){
    age++;
    for(let qi=0; qi<qiyuCool.length; qi++){ if(qiyuCool[qi]>0) qiyuCool[qi]--; }
    if(forbiddenCool>0) forbiddenCool--;
    if(!path && realm>=23){
      // ★抉择·修炼方向：证道之道由玩家择定，贯穿余生
      markChoice(); const askPath = yield {kind:'choice', events,
        title:'择 定 · 证 道 之 道',
        prompt:`你已踏入【仙台】——大道在前，自此须择定一世证道之途。此途将贯穿余生，决定你的机缘、凶险与最终道果。`,
        options: PATHS.map(p=>({label:p.name, desc:p.desc}))};
      const pi = (typeof askPath==='number' && askPath>=0 && askPath<PATHS.length) ? askPath : Math.floor(rnd()*PATHS.length);
      path = PATHS[pi];
      events.push({year:age,type:'good',text:`于仙台之途上，你明悟本世【证道之道】为【${path.name}】：${path.desc}`, pathReveal:path.name});
      if(path.id==='yuan' && rnd()<0.22){
        events.push({year:age,type:'bad',text:`⚠ 源天诅咒缠身——源术逆天，寿元已被天锁死，须于限内证道，否则道殒！然此咒最凶之兆，要待你登临【准帝九重天】、证道将成之际，方才以【诡异红毛】现形。`});
      }
    }

    // ★人欲道·情缘抉择：证道之道既定为人欲道，须于红尘中结一段情缘
    //   （人欲以情入道——此生若无情缘，则证道之门永闭，绝无大帝之望）
    if(alive && path && path.id==='renyu' && !qingyuanAsked && realm>=24){
      qingyuanAsked=true;
      const qn = pick(QINGYUAN_NAMES);
      markChoice(); const askQy = yield {kind:'choice', events,
        title:RENYU_QINGYUAN.title,
        prompt:RENYU_QINGYUAN.prompt.replace('{name}', qn),
        options:RENYU_QINGYUAN.options.map(o=>({label:o.label, desc:o.desc.replace('{name}', qn)}))};
      const qk = (typeof askQy==='number' && askQy>=0 && askQy<RENYU_QINGYUAN.options.length) ? askQy : Math.floor(rnd()*RENYU_QINGYUAN.options.length);
      const qopt = RENYU_QINGYUAN.options[qk];
      if(qopt.id==='shou'){
        hasQingyuan=true; qingyuanDeep=true; qingyuanName=qn;
        cultFortuneMul*=1.10; cultRiskMul*=1.08;
        events.push({year:age,type:'qiyu',text:`你与【${qn}】结为道侣，自此红尘有伴——情根深种，心境圆满（机缘 +）；然牵绊既生，心魔亦随之而来（凶险 +）。`});
      } else if(qopt.id==='suiyuan'){
        if(rnd()<0.5){
          hasQingyuan=true; qingyuanDeep=false; qingyuanName=qn;
          cultFortuneMul*=1.05; cultRiskMul*=1.03;
          events.push({year:age,type:'qiyu',text:`缘分使然，你与【${qn}】渐生情愫，彼此相伴修行——结下一段【浅情】（机缘 +、凶险 +）。`});
        } else {
          events.push({year:age,type:'qiyu',text:`聚散随缘——你与【${qn}】终究擦肩而过，情缘未成。⚠ 人欲道以情入道：情缘既无，此生证道之门已闭。`});
        }
      } else {
        cultRiskMul*=0.92; cultFortuneMul*=0.95;
        events.push({year:age,type:'qiyu',text:`你斩念避情，独行求道——心无旁骛，凶险稍减、机缘略淡。⚠ 然情根既断，人欲大道无以为凭：此生不可证道。`});
      }
    }

    // 秘境修行取向抉择：道宫(5)/四极(10)/化龙(14) 入口各一次，决定此后余生的进境节奏与凶险机缘
    //   养成模式下额外施加「抉择间隔」保护（须先攒够 YANG_GAP_EVENTS 条事件才弹），避免与「修行侧重」连发；
    //   间隔未攒够则顺延到后几年再弹，抉择绝不丢失。其它模式维持原「入境即弹」行为，逐字不变。
    let cultRealm = -1;
    if(YANG){ const pr = pendingRealm(cultDone, CULT_REALMS); if(pr >= 0 && gapOk()) cultRealm = pr; }
    else if(CULT_AT[realm] && !cultDone[realm]){ cultRealm = realm; }
    if(cultRealm >= 0){
      cultDone[cultRealm]=true;
      const ce=CULT_AT[cultRealm];
      const cultRecap = choiceRecap(); // 须先取小结：markChoice() 会覆盖上一次抉择的记账
      markChoice(); const askC = yield {kind:'choice', events,
        title:ce.title,
        prompt:cultRecap+ce.prompt,
        options:[
          {label:CULT_STYLES.houji.name,  desc:CULT_STYLES.houji.note+'（进境+、凶险-、机缘-）'},
          {label:CULT_STYLES.waiqiu.name, desc:CULT_STYLES.waiqiu.note+'（机缘++、凶险+、进境-）'},
          {label:CULT_STYLES.lianxin.name,desc:CULT_STYLES.lianxin.note+'（凶险--、平稳）'}
        ]};
      const ci = (typeof askC==='number' && askC>=0 && askC<=2) ? askC : Math.floor(rnd()*3);
      const st = [CULT_STYLES.houji, CULT_STYLES.waiqiu, CULT_STYLES.lianxin][ci];
      cultRateMul*=st.rateMul; cultRiskMul*=st.riskMul; cultFortuneMul*=st.fortuneMul; cultStyleName=st.name;
      events.push({year:age,type:'good',text:`【${ce.title.replace(/\s/g,'')}】你择定修行取向为【${st.name}】：${st.note}`});
    }

    // ★养成模式·修行侧重抉择：每个大境界入口触发一次，把心力倾注到五维之一，累加形成持久偏向（贯穿余生）
    //   间隔保护：上一次抉择之后，须先攒够 YANG_GAP_EVENTS 条事件（即「这段路上发生的事」）才弹下一处，
    //   免得刚选完马上又弹一个；等待期间若已跨过该境界则顺延到后几年再弹——抉择绝不丢失（超时兜底 YANG_GAP_MAX_YEARS）。
    const yangRealm = YANG ? pendingRealm(yangDone, YANG_FOCUS_REALMS) : -1; // 仅养成模式注入
    if(yangRealm >= 0 && gapOk()){
      yangDone[yangRealm] = true;
      const rk = REALMS[realm] ? REALMS[realm].k : '此境';
      const yangRecap = choiceRecap(); // 须先取小结：markChoice() 会覆盖上一次抉择的记账
      markChoice(); const askY = yield {kind:'choice', events,
        title:'养 成 · 修 行 侧 重',
        prompt:`${yangRecap}如今你已修至【${rk}】之境。修行之道，贵在有所侧重——你欲将这一世的心力，倾注于何方？此后余生，此般侧重将如影随形，塑你道途。`,
        options:[
          {label:'⚔ 战力',  desc:'锤炼己身战力，破关更稳——突破成功率小幅累加提升。'},
          {label:'✨ 悟性',  desc:'精研大道悟性，法理易明——突破成功率累加提升（含高境界）。'},
          {label:'❤ 道心',  desc:'淬炼道心，临危不乱——突破失败时有概率免去身死之劫。'},
          {label:'🌟 机缘',  desc:'广结机缘造化，奇遇/不死药/禁区造化之获益累加提升。'},
          {label:'⏳ 寿元',  desc:'温养本源寿元，命数绵长——每次直接延寿一截。'}
        ]};
      const yi = (typeof askY==='number' && askY>=0 && askY<=4) ? askY : Math.floor(rnd()*5);
      let yangText;
      if(yi===0){ yangFocus.combat++; yangText=`你于【${rk}】将修行侧重定于【战力】——此后破关更稳，此般偏向如影随形。`; }
      else if(yi===1){ yangFocus.comp++; yangText=`你于【${rk}】将修行侧重定于【悟性】——此后法理易明，此般偏向如影随形。`; }
      else if(yi===2){ yangFocus.heart++; yangText=`你于【${rk}】将修行侧重定于【道心】——此后临危不乱，此般偏向如影随形。`; }
      else if(yi===3){ yangFocus.fortune++; cultFortuneMul *= (1 + YANG_FORTUNE_MUL); yangText=`你于【${rk}】将修行侧重定于【机缘】——此后造化自至，此般偏向如影随形。`; }
      else { yangFocus.life++; const lg2=ri(YANG_LIFE_GAIN[0], YANG_LIFE_GAIN[1]); lifeMax += lg2;
        yangText=`你于【${rk}】将修行侧重定于【寿元】——温养本源，命数绵长，得寿元 +${lg2} 载。`; }
      events.push({year:age,type:'yang', yang:{combat:yangFocus.combat,comp:yangFocus.comp,heart:yangFocus.heart,fortune:yangFocus.fortune,life:yangFocus.life}, text:yangText});
    }

    // 奇遇抉择：道宫之后偶发，玩家亲手拍板（手动点选 / 自动天意）；封顶 QIYU_MAX，且每岁至多一次
    if(alive && realm>=6 && qiyuCount<QIYU_MAX){
      for(let qi=0; qi<QIYU.length; qi++){
        const q=QIYU[qi];
        // 抉择间隔保护（仅养成模式）：奇遇亦不得紧贴上一次抉择——先让玩家看见这段路上发生的事
        if((!YANG || gapOk()) && realm>=q.min && realm<=q.max && qiyuCool[qi]<=0 && rnd()<q.prob*QIYU_PROB_MUL){
          qiyuCool[qi]=q.cd;
          markChoice(); const askQ = yield {kind:'choice', events,
            title:q.title,
            prompt:q.prompt,
            options:q.options.map(o=>({label:o.label, desc:o.desc}))};
          const qk = (typeof askQ==='number' && askQ>=0 && askQ<q.options.length) ? askQ : Math.floor(rnd()*q.options.length);
          // ★必拿下奇遇：完美重生者，万般机缘尽在掌中——径取其最有利之果，死劫不临其身
          applyQiyu(perfectBirth ? q.options[bestQiyuIndex(q)].effect : q.options[qk].effect);
          qiyuCount++;
          break;
        }
      }
    }

    // 诡异红毛：源天师至【准帝九重天】方显化（证道将成之际，源天诅咒以红毛现形）
    if(alive && realm>=37 && path && path.id==='yuan' && !redHair){
      redHair=true;
      events.push({year:age,type:'bad',text:`⚠ 准帝九重天——你于证道将成之际，周身竟生出【诡异红毛】！源天师之诅咒在此刻显化，红毛噬体，凶兆已现。`});
    }
    let rate = 8 * apt.factor * phy.progMul * race.progMul * (1 + weaponLv*0.03);
    rate *= (1.2 - region.compete*0.4);
    rate *= identity.progMul;
    if(isRe) rate *= 3;
    const progScale = 1 + realm*0.16;
    rate *= progScale;
    rate *= cultRateMul; // 秘境修行取向：厚积/外求/炼心影响进境速度
    if(SH) rate *= SH_PROG_MUL; // 爽玩：进境更快，方有机会登临帝境
    realmProgress += rate;

    // 大帝在位：诸帝争锋·征战惨烈
    if(realm>=38 && !isRe && !emperorWarHappened && rnd()<0.02){
      emperorWarHappened=true;
      if(elixir && !elixirUsed){
        if(rnd() < EARLY_EAT_PROB){
          elixirUsed=true; elixirUsedEarly=true;
          events.push({year:age,type:'bad',text:`诸帝大战、征战惨烈，你身负濒死重伤——为续道途，提前服下【不死药】。然二世之望就此断绝，来日寿尽再无重生之机。`});
        } else {
          events.push({year:age,type:'bad',text:`诸帝大战、征战惨烈，重伤之下你死守大帝果位，未动不死药，留待寿尽重生。`});
        }
      } else {
        events.push({year:age,type:'bad',text:`诸帝大战、征战惨烈，于诸天战场厮杀，帝威凛然，万族颤栗。`});
      }
    }
    // 大帝阶段：以「千年」为进度粒度（一千年一次反馈）；大帝之前：原年度随机事件（约 14% 触发）
    if(realm >= 38){
      // 每满一千载才向玩家呈现一次：一条千年综述 + 偶发大事（顿悟 / 灾劫 / 诸帝大战 / 机缘）
      if(age % 1000 === 0 && age > emperorAge){
        events.push({year:age, type:'neutral', text: pick([
          `又历千载，大帝静坐参道，帝威如古井无波，诸天静默。`,
          `一千载悠悠，星河流转，大帝俯瞰万族争锋，帝心通明。`,
          `千载岁月不过弹指——大帝于禁区之外遥望，感应至尊气息隐隐。`
        ])});
        if(rnd() < 0.5){
          const r2 = rnd();
          if(r2 < 0.40){ // 顿悟
            const g=ri(60,220)+realmProgress*0.12; realmProgress+=g;
            events.push({year:age,type:'epiph',text:`千载参悟，忽生顿悟，修行精进，进境 +${Math.round(g)}。`});
          } else if(r2 < 0.72){ // 灾劫
            let loss=ri(60,200); lifeMax-=loss; slain++;
            const foe=pick(ENEMY);
            if(slain>0 && slain%50===0) events.push({year:age,type:'bad',text:`大帝杀伐征途：于 ${foe} 之战中再立帝威，迄今已斩 ${slain} 尊，帝威愈盛。`});
            else events.push({year:age,type:'bad',text:`千载之中偶遭${foe}算计，耗去 ${loss} 载寿元。`});
            if(lifeMax<=age){ alive=false; cause='伤重不治，陨落途中'; events.push({year:age,type:'end',text:`伤势难愈，于 ${age} 载时陨落。`}); if(!reTalismanGuard(false)) continue; }
          } else if(r2 < 0.90){ // 诸帝大战·征战惨烈
            if(!emperorWarHappened){ emperorWarHappened=true;
              if(elixir && !elixirUsed){ if(rnd()<EARLY_EAT_PROB){ elixirUsed=true; elixirUsedEarly=true; events.push({year:age,type:'bad',text:`诸帝大战、征战惨烈，你身负濒死重伤——为续道途，提前服下【不死药】。然二世之望就此断绝。`}); }
                else events.push({year:age,type:'bad',text:`诸帝大战、征战惨烈，重伤之下你死守大帝果位，未动不死药，留待寿尽重生。`}); }
              else events.push({year:age,type:'bad',text:`诸帝大战、征战惨烈，于诸天战场厮杀，帝威凛然，万族颤栗。`});
            } else { events.push({year:age,type:'bad',text:`诸帝战场再起烽烟，你于乱战中再立帝威，威震诸天。`}); }
          } else { // 机缘·古皇造化
            const gain=ri(300,1000); lifeMax+=gain;
            events.push({year:age,type:'good',text:`千载之间偶得古皇造化，温养本源，延寿 ${gain} 载。`});
          }
        }
      }
    } else if(rnd() < 0.14){
      const roll=rnd();
      const stage = worldStageOfRealm(realm);
      if(roll < 0.10){ // 顿悟
        const g=ri(40,160)+realmProgress*0.15; realmProgress+=g;
        events.push({year:age,type:'epiph',text:`于${pick(['观星','临渊','听涛','对月','静坐'])}中忽生顿悟，修行一日千里，进境 +${Math.round(g)}。`});
      } else if(roll < 0.55){ // 奇遇·祭炼兵器 / 机缘
        if(stage==='novice' && !hgTried && rnd() < 0.0015){
          hgTried=true;
          // ★抉择·奇遇：荒古禁地——深入 / 外围 / 退出
          markChoice(); const askHg = yield {kind:'choice', events,
            title:'奇 遇 · 荒 古 禁 地',
            prompt:`你于莽荒深处撞见一片【荒古禁地】——古木参天、道纹横陈，隐隐有上古禁制流转。此地九死一生，却也葬着逆天机缘。你当如何？`,
            options:[
              {label:'深入禁地深处', desc:'赌上性命强闯核心——九死一生，然若得手，必是天大机缘。'},
              {label:'外围寻些机缘', desc:'只在边缘采药拾遗——风险不大，收益亦有限。'},
              {label:'立刻退出，远离凶地', desc:'压下贪念，转身离去——全身而退，一无所获。'}
            ]};
          const hg = (typeof askHg==='number' && askHg>=0 && askHg<=2) ? askHg : Math.floor(rnd()*3);
          if(hg===2){
            events.push({year:age,type:'neutral',text:`你于禁地边缘驻足良久，终究压下贪念——转身退出。身后禁地之风掠过，你一身冷汗，却也全身而退。`});
          } else if(hg===1){
            if(rnd()<0.25){ const loss=ri(20,90); lifeMax-=loss;
              events.push({year:age,type:'bad',text:`你只在禁地边缘采得几株灵药，却惊动禁制余威，耗去 ${loss} 载寿元，仓皇退走。`});
            } else { const gain=Math.round(ri(60,220)*cultFortuneMul); lifeMax+=gain;
              events.push({year:age,type:'good',text:`你在禁地外围寻得古药与残破道纹，虽未深入，却也小有所得（延寿 ${gain} 载）。`});
            }
          } else {
            if(perfectBirth){
              // ★必拿下：直入荒古禁地核心，逆天造化尽入掌中（免死劫、无重创）
              const gain=Math.round(ri(200,700)*cultFortuneMul);
              lifeMax += gain;
              events.push({year:age,type:'good',text:`【必拿下】你毫无惧色直入【荒古禁地】核心——上古道纹与逆天造化尽入掌中，延寿 ${gain} 载！奇遇既遇，必拿下。`});
            } else if(rnd() < 0.65 * cultRiskMul){
              if(path && path.id==='xianchu' && !duERevived){
                duERevived=true; const loss=ri(80,260); lifeMax-=loss;
                events.push({year:age,type:'break',text:`你误入【荒古禁地】绝境，困死之际大喊一声「我饿了！」——虚空裂开，【肚饿真君】探出脑袋，隔空给你发来一筐蘑菇：「饿啥饿，吃蘑菇！」你啃着蘑菇硬生生破禁而出，虽受创耗去 ${loss} 载寿元，却捡回一条命。`});
                if(lifeMax<=age){ alive=false; cause='油尽灯枯，坐化于山门'; events.push({year:age,type:'end',text:`油尽灯枯，于 ${age} 载时坐化。`}); }
              } else {
                alive=false; cause='深入荒古禁地，触上古禁制，形神俱灭';
                events.push({year:age,type:'end',text:`你为求长生误入【荒古禁地】——此地乃古来绝地，九死一生！触上古禁制，当场形神俱灭，徒留一声叹息于星河。`});
                if(!reTalismanGuard(false)) continue;
              }
            } else {
              const loss=ri(120,500); lifeMax-=loss;
              events.push({year:age,type:'bad',text:`你为求长生闯【荒古禁地】——九死一生！虽险死还生，却受禁制重创，耗去 ${loss} 载寿元，狼狈遁出。`});
            }
          }
        } else if(forbiddenCool<=0 && forbiddenTried<15 && (stage==='universe' || realm>=29) && rnd() < 0.06){
          forbiddenTried++; forbiddenCool = ri(50,100); // 禁区奇遇：冷却 50~100 年、每世至多 15 次
          const z = pick(FORBIDDEN_ZONES);
          const perilBoost = (identity.id==='jin') ? 1.5 : 1;
          // ★抉择·奇遇：生命禁区——强闯 / 绕道
          markChoice(); const askZ = yield {kind:'choice', events,
            title:`奇 遇 · ${z.name}`,
            prompt:`你行至【${z.name}】之外——古来禁区，沉眠着不灭的至尊，亦埋着逆天的造化。进一步可一步登天，退一步则全身而退。是闯，还是退？`,
            options:[
              {label:'强闯禁区，夺逆天机缘', desc:'至尊在前亦不退——得手则造化加身，失手则形神俱灭。'},
              {label:'绕道而行，保全己身', desc:'禁区至尊岂可轻侮？留得性命在，自有他处机缘。'}
            ]};
          const zc = (typeof askZ==='number' && askZ>=0 && askZ<=1) ? askZ : (rnd()<0.65?0:1);
          if(perfectBirth){
            // ★必拿下：强闯生命禁区，逆天机缘必得（免至尊镇杀之劫）
            events.push({year:age,type:'good',text:`【必拿下】你于【${z.name}】前微微一笑——此身命数天定，区区至尊岂能拦你？强闯而入，逆天造化，必拿下！`});
            if(z.weaponBoost){
              if(weaponLv<5){ weaponLv++; hasWeapon=true;
                events.push({year:age,type:'good',text:`${z.fortune} 本命兵器祭炼升品为【${weaponName(weaponLv,race)}】——证道之基更稳。`});
              } else {
                events.push({year:age,type:'good',text:z.fortune});
              }
            } else {
              const gain=Math.round(z.gain * cultFortuneMul);
              lifeMax += gain;
              events.push({year:age,type:'good',text:`${z.fortune}（延寿 ${gain} 载）`});
            }
          } else if(zc===1){
            events.push({year:age,type:'neutral',text:`你于【${z.name}】外驻足——禁区至尊的气息令你遍体生寒，权衡再三，终究绕道而行。`});
          } else if(rnd() < z.fortuneProb / perilBoost / cultRiskMul){
            if(z.weaponBoost){
              if(weaponLv<5){ weaponLv++; hasWeapon=true;
                events.push({year:age,type:'good',text:`${z.fortune} 本命兵器祭炼升品为【${weaponName(weaponLv,race)}】——证道之基更稳。`});
              } else {
                events.push({year:age,type:'good',text:z.fortune});
              }
            } else {
              const gain=Math.round(z.gain * cultFortuneMul);
              lifeMax += gain;
              events.push({year:age,type:'good',text:`${z.fortune}（延寿 ${gain} 载）`});
            }
          } else {
            if(SH){
              // 爽玩：强闯禁区失利，仅折损寿元，不至尊镇杀致死——大帝方能活到自斩成仙路
              const loss=ri(60,260); lifeMax-=loss;
              events.push({year:age,type:'bad',text:`你闯【${z.name}】——${z.peril} 然你命数绵长、福缘深厚，虽受创耗去 ${loss} 载寿元，却全身而退。`});
              if(lifeMax<=age){ alive=false; cause='油尽灯枯，坐化于山门'; events.push({year:age,type:'end',text:`油尽灯枯，于 ${age} 载时坐化。`}); }
            } else if(path && path.id==='xianchu' && !duERevived){
              duERevived=true; const loss=ri(80,260); lifeMax-=loss;
              events.push({year:age,type:'break',text:`你闯【${z.name}】被困绝境，眼看要遭至尊镇杀——临死大喊「我饿了！」——虚空裂开，【肚饿真君】隔空甩来一筐蘑菇：「饿啥饿，吃蘑菇！」你抱着蘑菇硬抗过镇杀，虽受创耗去 ${loss} 载寿元，却捡回一条命。`});
              if(lifeMax<=age){ alive=false; cause='油尽灯枯，坐化于山门'; events.push({year:age,type:'end',text:`油尽灯枯，于 ${age} 载时坐化。`}); }
            } else {
              alive=false; cause='闯'+z.name+'遭禁区至尊镇杀，形神俱灭';
              events.push({year:age,type:'end',text:`你闯【${z.name}】——${z.peril}`});
              if(!reTalismanGuard(true)) continue;
            }
          }
        } else if(weaponLv < 5){
          let up = (weaponLv < 4) ? 1 : 0;
          if(up){
            weaponLv++;
            hasWeapon = weaponLv>=5;
            const wn = weaponName(weaponLv, race);
            const tip = hasWeapon ? `——此乃证道器物【${race.weapon}】，可镇压帝劫！` : '';
            const where = stage==='universe' ? '诸帝战场' : (stage==='road' ? '古星遗迹' : '古帝战场');
            events.push({year:age,type:'good',text:`于${where}寻得大帝神料，本命兵器祭炼升品为【${wn}】${tip}`, weaponLv:weaponLv, weaponName:wn});
          } else if(realm>=29 && !medFound && rnd() < 0.03){
            medFound=true;
            const r=ri(1500,3000); lifeMax+=r;
            const spot = stage==='universe' ? '古皇秘境' : (stage==='road' ? '古星灵泉' : '一处灵地');
            events.push({year:age,type:'good',text:`于${spot}偶得【神药】一株，温养本源——准帝之身得以在岁月中多撑一程，延寿 ${r} 载。`});
          } else {
            const spot = stage==='universe' ? '古皇秘境' : (stage==='road' ? '古星灵泉' : '一处灵地');
            events.push({year:age,type:'good',text:`于${spot}静修，感悟大道，修为愈发圆融。`});
          }
        } else {
          const spot = stage==='universe' ? '诸帝古矿深处' : (stage==='road' ? '古星矿脉' : '古矿');
          events.push({year:age,type:'good',text:`以【${race.weapon}】镇压己身，于${spot}闭关参道，帝威日盛。`});
        }
      } else if(roll < 0.80){ // 中性
        const txt = stage==='universe'
          ? pick(['坐镇诸天，俯瞰万族争锋。','于古矿深处参悟帝道，岁月无声。','遥望禁区，感应至尊气息隐隐。','诸帝并立之世，静修以待天地变局。'])
          : stage==='road'
          ? pick(['星空古路上跨星域试炼，历千族万界。','古路某关开启，与各方天骄争雄。','于荒古星墟中探秘，得见大圣遗骸。','星海漂流，体悟宇宙之浩瀚无垠。'])
          : pick(['闭关苦修，山中无岁月。','行走红尘，体悟世情百态。','与同道论道，各有所得。','游历四方，见天地之壮阔。']);
        events.push({year:age,type:'neutral',text:txt});
      } else { // 灾劫
        const severe = realm>=23;
        let foe = pick(ENEMY);
        if(severe && region.compete>=0.9){ foe='北斗天骄争锋'; }
        if(realm>=38){
          slain++;
          if(slain>=120 && daoKind!=='天帝' && daoKind!=='杀道' && !duodao && !shadaoNoted && path && path.id==='xiu'){
            daoKind='杀道'; shadaoNoted=true;
            events.push({year:age,type:'break',text:`你于无尽杀伐中悟道——以【杀道·魔道】证帝，血染星河，诸帝侧目亦胆寒。`});
          } else if(slain>0 && slain % 50 === 0){
            events.push({year:age,type:'bad',text:`大帝杀伐征途：于 ${foe} 之战中再立帝威，迄今已斩 ${slain} 尊，帝威愈盛。`});
          }
        } else {
          let loss = severe? ri(20,80) : ri(2,12);
          if(severe && region.compete>=0.9){ loss = ri(40,120); }
          lifeMax -= loss;
          if(severe) slain++;
          events.push({year:age,type:'bad',text:`遭${foe}所算，${severe?'重伤垂危':'险象环生'}，耗去 ${loss} 载寿元。`});
          if(lifeMax<=age){ alive=false; cause='伤重不治，陨落途中';
            events.push({year:age,type:'end',text:`伤势难愈，于 ${age} 载时陨落。`}); if(!reTalismanGuard(foe==='禁区至尊')) continue; }
        }
      }
    }

    // 证道之道专属：仙台之后，源天师积累源术、功德积累善果
    if(alive && realm>=23 && realm<38){
      if(path && path.id==='yuan'){
        if(rnd()<0.06){ const g=ri(1,3); sourceLv=Math.min(30,sourceLv+g);
          events.push({year:age,type:'epiph',text:`推演源术、辨龙脉掘神源，源天师之道精进，源术造诣 +${g}。`}); }
      } else if(path && path.id==='gong'){
        if(rnd()<0.05){ const g=ri(2,8); merit=Math.min(100,merit+g);
          events.push({year:age,type:'good',text:`行善积德、护佑一方，功德 +${g}（善果洗练道果，证道可期）。`}); }
      }
    }

    // 大帝逆活九世（大梦万古·重活一世）
    if(realm===38 && nihuo<9 && !immortalGate){
      if(age - nihuoAnchor >= NIHUO_SPAN){
        nihuoAnchor = age;
        nihuo++;
        // ★困告仙尊彩蛋：首次逆活入梦，50% 概率陷入「困告」之陷阱——万古长梦缠身，出不来
        if(nihuo===1 && !kungaoTrap){ kungaoTrap = rnd() < 0.5; if(kungaoTrap) events.push({year:age,type:'vision',text:`你逆活入梦——梦愈深，万古如茧。冥冥中似有谁在低笑，将你缠入永眠之境……（大梦万古·困告仙尊之契）`}); }
        const tp = SH ? (SH_NIHUO_TP_BASE - (nihuo-1)*SH_NIHUO_TP_DEC) : (NIHUO_TP_BASE - (nihuo-1)*SH_NIHUO_TP_DEC);
        if(rnd() < tp){
          if(nihuo>=9){
            // 困告陷阱者永悟不得长生真意（出不来），其余按常理判定
            canAscend = kungaoTrap ? false : (rnd() < (SH ? SH_LONGSHENG : LONGSHENG_PROB));
            events.push({year:age,type:'epiph',text: canAscend ? `九世逆活圆满！于岁月尽头逆乱阴阳，终悟长生真意——仙门将开，红尘仙可期。` : `九世逆活虽满，然长生法理终差一线，抱憾帝落，再难破仙关。`});
          } else {
            events.push({year:age,type:'epiph',text:`大帝极尽升华，逆活第 ${nihuo} 世，暮年回望前尘，长生法理愈明。`});
          }
        } else {
          if(SH){
            // 爽玩：逆活失败仅折损少量寿元，不致死——稳渡岁月，静待成仙之机
            const loss=ri(30,120); lifeMax-=loss;
            events.push({year:age,type:'bad',text:`逆活第 ${nihuo} 世引动天诛，然你命数绵长、稳渡此劫，仅耗去 ${loss} 载寿元。`});
          } else if(!tryElixirRevive()){
            if(rnd() < 0.5){
              alive=false; cause='逆活第 '+nihuo+' 世引动天诛，帝落';
              events.push({year:age,type:'end',text:`逆活第 ${nihuo} 世引动天诛，帝躯崩碎，大道崩殂。`});
            } else {
              const loss=ri(300,900); lifeMax-=loss;
              events.push({year:age,type:'bad',text:`逆活第 ${nihuo} 世受天诛重创，然你已无意强证仙道，敛去锋芒、蛰伏养伤，耗去 ${loss} 载寿元，静待来日自斩等仙路。`});
            }
          }
          continue;
        }
      }
    }

    // 突破判定
    if(realmProgress >= NEED[realm] && realm < REALMS.length-1){
      // ★人欲道·证道终试：冲击大帝的那一刻「必触发」，一世仅此一次——情关难过，抉择改写证道之机
      if(alive && !isRe && realm===37 && path && path.id==='renyu' && !renyuTrialDone){
        renyuTrialDone=true;
        if(!hasQingyuan){
          renyuBlocked=true;
          events.push({year:age,type:'bad',text:`你欲以【人欲道】证道——然情根未植、尘缘俱断，人欲大道竟无以为凭！道心空转，证道之门在你面前轰然合拢：⚠ 人欲无根，此生不可证道。`});
        } else {
          const qn2 = qingyuanName || '你的道侣';
          markChoice(); const askT = yield {kind:'choice', events,
            title:RENYU_TRIAL.title,
            prompt:RENYU_TRIAL.prompt.replace('{name}', qn2),
            options:RENYU_TRIAL.options.map(o=>({label:o.label, desc:o.desc.replace('{name}', qn2)}))};
          const tk = (typeof askT==='number' && askT>=0 && askT<RENYU_TRIAL.options.length) ? askT : Math.floor(rnd()*RENYU_TRIAL.options.length);
          const topt = RENYU_TRIAL.options[tk];
          renyuTrialId=topt.id; renyuTrialName=topt.name; renyuTrialBonus=topt.bonus||0;
          events.push({year:age,type:'qiyu',text:topt.text.replace('{name}', qn2)});
        }
      }
      if(renyuBlocked && realm===37){
        // 人欲无根：证道之门已闭——进度封顶于准帝九重天，余生再不可证
        realmProgress = NEED[37];
      } else if((!isRe && realm===38 && !(canAscend || immortalGate)) || (isRe && realm===38 && reCount<9)){
        realmProgress = NEED[38];
      } else if(zizhan && realm>=37){
        realmProgress = NEED[37];
      } else if(isRe && realm>=37){
        realm=37; realmProgress=NEED[37];
        if(!reLingWaiNoted){
          reLingWaiNoted=true;
          daoKind='另类';
          checkWorldStage();
          events.push({year:age,type:'break',text:`你以轮回重修之身，于【准帝九重天】圆满处另辟蹊径——不夺当世大帝果位，以【另类成道】立身，半步大帝，超然物外。`});
        }
      }
      else {
        let p;
        let wb;
        if(realm < 23) wb = WEAPON_TIERS[weaponLv].bonus;
        else if(realm===37) wb = weaponLv>=5 ? 0.25 : -0.10;
        else wb = WEAPON_TIERS[weaponLv].bonus*0.6;
        if(SH){
          // ★爽玩模式：宽厚突破曲线，随境界缓降，高境界仍有高通过率
          if(realm < 23){
            p = SH_BT_BASE_LOW - realm*0.003 + apt.breakBonus + phy.breakBonus + race.breakBonus + wb;
          } else if(isRe){
            p = SH_BT_BASE_RE - (realm-23)*SH_BT_SLOPE_RE + (apt.breakBonus+phy.breakBonus+race.breakBonus)*1.0 + wb;
          } else {
            p = SH_BT_BASE_NONRE - (realm-23)*SH_BT_SLOPE_NONRE + (apt.breakBonus+phy.breakBonus+race.breakBonus)*0.6 + wb;
          }
          let pathBonus = 0;
          if(realm>=37){
            if(path && path.id==='yuan') pathBonus = Math.min(0.12, sourceLv*0.008);
            else if(path && path.id==='gong') pathBonus = Math.min(0.14, merit*0.012);
          }
          p += pathBonus * region.ceiling;
          if(selfBodyWeapon && realm>=37) p += 0.10 * region.ceiling;
          if(phy.curse && realm>=10 && realm<=13 && weaponLv<5) p -= 0.25;
          if(realm===37) p -= SH_P37_PEN;
          if(realm>=38){ p -= SH_P38_PEN; }
          if(realm===38 && immortalGate) p += 0.30;
          if(path && path.id==='gong' && realm>=37) p += 0.04;
          p += renyuTrialBonus;
          p = Math.max(SH_BT_FLOOR, Math.min(0.99, p));
        } else {
          if(realm < 23){
            p = 0.92 - realm*0.013 + apt.breakBonus + phy.breakBonus + race.breakBonus + wb;
          } else if(isRe){
            p = BT_BASE_RE - (realm-23)*BT_SLOPE_RE + (apt.breakBonus+phy.breakBonus+race.breakBonus)*1.0 + wb;
          } else {
            p = BT_BASE_NONRE - (realm-23)*BT_SLOPE_NONRE + (apt.breakBonus+phy.breakBonus+race.breakBonus)*0.6 + wb;
          }
          let pathBonus = 0;
          if(realm>=37){
            if(path && path.id==='yuan') pathBonus = Math.min(0.12, sourceLv*0.008);
            else if(path && path.id==='gong') pathBonus = Math.min(0.14, merit*0.012);
          }
          p += pathBonus * region.ceiling;
          if(selfBodyWeapon && realm>=37) p += 0.10 * region.ceiling;
          if(phy.curse && realm>=10 && realm<=13 && weaponLv<5) p -= 0.55;
          if(realm===37) p -= BT_P37_PENALTY;
          if(realm>=38){ p -= 0.20; }
          if(realm===38 && immortalGate) p += 0.30;
          if(path && path.id==='gong' && realm>=37) p += 0.04;
          p += renyuTrialBonus; // 人欲道终试：证道之刻的抉择，改写此后的证道之机
          p = Math.max(0.015, Math.min(0.95, p));
        }
        // 养成·战力/悟性：突破成功率累加提升（五维侧重如影随形）
        if(YANG){ p += yangFocus.combat*YANG_COMBAT_PROB + yangFocus.comp*YANG_COMP_PROB; p = Math.max(0.015, Math.min(0.99, p)); }
        if(rnd() < p){
          realm++; realmProgress=0;
          checkWorldStage();
          if(realm===23 && !dibingRolled){
            dibingRolled=true;
            const got = race.weaponNat ? rnd()<DIBING_PROB_NAT : rnd()<DIBING_PROB;
            if(got){
              weaponLv=5; hasWeapon=true;
              const m=rnd(); let matName='大帝神料', matTip='可镇压日后帝劫。';
              if(m < 0.04){ matName='自身大帝之躯（禁忌·狠人式）'; selfBodyWeapon=true; matTip='以此禁忌材料祭炼，帝兵通灵入圣，证道可期！'; }
              else if(m < 0.16){ matName='无上神金'; matTip='神金为引，帝兵威能更盛，可镇压日后帝劫。'; }
              events.push({year:age,type:'good',text:`半步大能之际，终以【${matName}】将本族证道器物【${race.weapon}】祭炼圆满，成就帝兵！${matTip}`, weaponLv:5, weaponName:race.weapon});
            } else {
              weaponLv=Math.max(weaponLv,4);
              events.push({year:age,type:'neutral',text:`虽入仙台，然未得大帝神料，本命兵器止于【圣兵】，证道之路凶险。`});
            }
          }
        } else {
          let death=false, loss=0;
          if(SH){
            // ★爽玩模式：突破失败几乎不致死，仅折损寿元
            if(realm>=37){
              death = rnd() < (hasWeapon?SH_DEATH_37_WP:SH_DEATH_37_NOWP); loss = ri(20,60);
            } else if(realm>=29){
              death = rnd()<SH_DEATH_29; loss = ri(20,60);
            } else if(realm>=23){
              death = rnd()<SH_DEATH_23; loss = ri(10,40);
            } else {
              death = rnd()<SH_DEATH_LOW; loss = ri(1,6);
            }
          } else if(phy.curse && realm>=10 && realm<=13 && weaponLv<5){
            death = rnd()<0.6; loss = ri(10,30);
          } else if(realm>=37){
            death = rnd() < (hasWeapon?DEATH_37_WP:DEATH_37_NOWP); loss = ri(40,90);
          } else if(realm>=29){
            death = rnd()<DEATH_29; loss = ri(40,90);
          } else if(realm>=23){
            death = rnd()<0.26; loss = ri(20,60);
          } else if(realm>=14){
            death = rnd()<0.07; loss = ri(5,20);
          } else {
            death = rnd()<0.02; loss = ri(1,6);
          }
          // 养成·道心：突破失败时有概率免去身死之劫（临危不乱，心魔未生）
          if(YANG && yangFocus.heart>0 && death){
            const saveP = Math.min(0.85, yangFocus.heart*YANG_HEART_DEATH);
            if(rnd() < saveP){
              death=false;
              events.push({year:age,type:'good',text:`【道心】临危不乱，心魔未生——你于冲击【${REALMS[realm+1].k}】失手之际稳守道心，免去一死，仅受创而已。`});
            }
          }
          if(isRe && death) death = rnd()<0.12;
          if(path && path.id==='gong' && realm>=37 && death){ const guard=Math.min(0.35, merit*0.003); if(rnd()<guard) death=false; }
          // 祖师复活彩蛋：人欲道 / 仙厨 在【准帝九重天】将死之际，祖师显化复活一次
          if(death && realm===37 && path && (path.id==='renyu'||path.id==='xianchu') && !ancestorRevived){
            ancestorRevived=true;
            ancestorMsg = (path.id==='renyu') ? '哈比！' : '叫你放那么多酱油，闲死你算了';
            const zs = (path.id==='renyu') ? '人欲道祖师·阿香' : '仙厨祖师·老抽';
            lifeMax += ri(300,800);
            events.push({year:age,type:'break',text:`☯ 命悬一线之际，【${zs}】自虚空显化，为你续命——「${ancestorMsg}」你于准帝九重天被复活一次，道途再启！`});
            death=false; // 作废本次死亡，按受挫处理继续修行
          }
        if(death){
          if(path && path.id==='renyu' && realm>=26 && realm<38){
            // ★新地球彩蛋：人欲道·圣人境心魔而亡（仅地球出生者触发「饺子」低语）
            alive=false;
            cause='冲击【'+REALMS[realm+1].k+'】时心魔反噬，神魂俱灭';
            events.push({year:age,type:'end',text:`冲击【${REALMS[realm+1].k}】之际，旧日情劫化作心魔反噬，神魂寸寸崩碎——道殒身死。`});
            if(isEarth){ xindiEgg=true; events.push({year:age,type:'end',text:`弥留之际，地球故乡的烟火漫上心头：「这是我大哥 这是我嫂子 我爱吃饺子。」`}); }
          } else {
            alive=false; cause=`冲击【${REALMS[realm+1].k}】失败，神魂俱灭`;
            events.push({year:age,type:'end',text:`冲击【${REALMS[realm+1].k}·${REALMS[realm+1].g}】失败，道殒身死。`});
          }
          if(!reTalismanGuard(false)) continue; }
          else { lifeMax-=loss; realmProgress=NEED[realm]*0.3;
            events.push({year:age,type:'fail',text:`冲击【${REALMS[realm+1].k}】受挫，修为倒退，耗去 ${loss} 载寿元。`});
            if(lifeMax<=age){ alive=false; cause='油尽灯枯，坐化于山门';
              events.push({year:age,type:'end',text:`油尽灯枯，于 ${age} 载时坐化。`}); continue; }
          }
        }
      }
      // 大帝之境处理
      if(alive && realm===38 && !isRe && !emperorSetLife){
          emperorSetLife=true;
          // 先把「证道之道」对应的道果基调定下：即便大帝劫中陨落，道果亦不空悬、绝不与其路径矛盾
          if(path && path.id==='gong') daoKind='信仰';
          else if(path && path.id==='renyu') daoKind='无缺';
          else if(path && path.id==='xianchu') daoKind='物证';
          emperorAge = age; nihuoAnchor = age; lastNextLifeAge = age;
          lifeMax = age + EMPEROR_LIFESPAN;
          // 人欲道终试：证道之刻的道果回响（计入战力与结局）
          renyuKilled     = (renyuTrialId==='shaqi');
          renyuBoai       = (renyuTrialId==='boai');
          renyuTongzheng  = (renyuTrialId==='tongzheng');
          let tiandiProb = TIANDI_BASE
            + (apt.val>=88 ? TIANDI_APT_BONUS : 0)
            + (phy.tier==='T0' ? TIANDI_T0_BONUS : 0)
            + (phy.tier==='T1' ? TIANDI_T1_BONUS : 0);
          tiandiProb = Math.min(0.45, tiandiProb);
          if(rnd() < tiandiProb){ tianDi=true; }
          events.push({year:age,type:'break',text:`证道称帝！大帝寿元亦有尽头——得寿元 +${EMPEROR_LIFESPAN} 载，约一万五千载后大道将归于寂灭。`});
          // ★猪猪牛彩蛋：女帝按概率获赐福，来生更易活出下一世
          if(gender==='女' && rnd() < ZHUZHU_BLESS_PROB){
            zhuzhuBlessing=true;
            events.push({year:age,type:'vision',text:`🌟 一道温柔神念自虚空落下，轻抚你帝冠——猪猪牛低语：「你这一世太苦了，下一世做个好人~」你周身一暖，似有造化之荫护持来生。`});
          }
          if(!tianDi){
            const cp = combatPower({realm:38, apt, phy, race, hasWeapon, selfBodyWeapon, tianDi:false, secondLife:false, immortalGate, zizhan:false, renyuKilled, renyuBoai, renyuTongzheng});
            const gap = DAJIE_CP_THRESHOLD - cp;
            if(gap > 0 && !SH){
              // ★爽玩模式：禁区至尊不敢妄动（SH_USURP_MAX=0），大帝劫必稳
              const up = Math.min(DAJIE_USURP_MAX, gap/1000*DAJIE_USURP_STEP);
              if(rnd() < up){
                alive=false; cause='大帝劫中战力不足，被禁区至尊乘虚夺舍，形神俱灭';
                events.push({year:age,type:'end',text:`大帝劫降临——你战力评定仅 ${cp}，距镇压诸天尚差 ${gap} 钧！证道之刻，沉睡的禁区至尊乘虚而入，夺你道果、镇你真灵，形神俱灭于帝劫之中。`});
                if(!reTalismanGuard(true)) continue;
              } else {
                events.push({year:age,type:'good',text:`大帝劫降临——禁区至尊于黑暗中睁眼，欲夺你道果！你战力评定 ${cp}（距安全线尚差 ${gap} 钧），以帝兵硬撼、险之又险将其镇压回去，帝位方稳。`});
              }
            } else if(gap > 0 && SH){
              events.push({year:age,type:'good',text:`大帝劫降临——禁区至尊于黑暗中睁眼，然你命数使然、气运加身，至尊竟不敢妄动，帝位稳如磐石。`});
            }
          }
          if(rnd() < ELIXIR_PROB){
            elixir=true;
            events.push({year:age,type:'good',text:`机缘巧合，你于古老神墟中寻得【不死药】——寿尽时可再活一世；然若征战惨烈提前服之，则二世无望。`});
          }
          if(rnd() < (tianDi ? IMMORTAL_PROB+0.02 : IMMORTAL_PROB)){
            immortalGate=true;
            events.push({year:age,type:'good',text:`命数奇妙——你竟身负【仙门之契】，他日可凭毕生帝道一击打入仙界，超脱长生！`});
          }
          if(tianDi){
            daoKind='天帝';
          } else if(path && path.id==='gong'){
            // 功德证道：道果洗练以无量功德与众生信仰香火为凭，绝不与杀伐之道同现
            daoKind='信仰';
            events.push({year:age,type:'break',text:`你以【信仰成道·香火】证帝——无量功德与众生信仰香火加身，善果洗练道果，另成一格。`});
          } else if(path && path.id==='yuan'){
            // 源天师证道：以神源与无上神物逆证帝道
            daoKind = (selfBodyWeapon || rnd() < 0.12) ? '物证' : '另类';
            events.push({year:age,type:'break',text: daoKind==='物证'
              ? `你以【物证道】证帝——源天师以神源与无上神物逆证帝道，器物即道。`
              : `你以【另类成道·半步】证帝——源天师逆天之术另辟蹊径，未全然合一却自成一格，比肩诸帝。`});
          } else if(path && path.id==='renyu'){
            // 人欲道：其道果由其「情关终试」单独叙述（杀妻/博爱/双帝/斩情），本身不混入杀道/夺道
            daoKind='无缺';
            events.push({year:age,type:'break',text:`你以【无缺大帝·正统】证帝——人欲大道修至圆满，虽涉红尘情劫，道果无缺，当世共尊。`});
          } else if(path && path.id==='xianchu'){
            // 仙厨证道：以食证道、以厨入帝
            daoKind='物证';
            events.push({year:age,type:'break',text:`你以【物证道】证帝——以食证道、以厨入帝，烹天材地宝、炼万味真火，烟火之中证得大帝果位。`});
          } else {
            // 修炼证道（通用）：杀伐、夺道、物证、无缺，依此生行止而定——「杀道证道」仅出于此途
            if(rnd() < 0.03){
              duodao=true; daoKind='夺道';
              events.push({year:age,type:'break',text:`你另辟邪径——【夺道·嫁接】：夺取他人道果、逆乱嫁接己身，以邪道之术逆天成帝，为天下所忌。`});
            } else if(slain >= 120 && rnd() < 0.35){
              daoKind='杀道';
              events.push({year:age,type:'break',text:`你以【杀道·魔道】证道——于无尽杀伐中悟道，以毁灭入帝，血染星河，诸帝侧目亦胆寒。`});
            } else if(selfBodyWeapon || rnd() < 0.12){
              daoKind='物证';
              events.push({year:age,type:'break',text:`你以【物证道】证帝——以丹/器/阵之极致（${selfBodyWeapon?'自身大帝之躯·狠人式':'无上神物'}）逆证帝道，器物即道。`});
            } else {
              daoKind='无缺';
              events.push({year:age,type:'break',text:`你以【无缺大帝·正统】证帝——五大秘境圆满无缺，与天心印记相合，正统大帝果位，当世共尊。`});
            }
          }
          // 人欲道·终试道果：证道之刻的抉择，于此回响
          if(renyuKilled){
            events.push({year:age,type:'break',text:`你踏着【${qingyuanName||'道侣'}】的血登上大帝之位——【人欲道·杀妻证道】。帝威震世，然帝心已死：此后万载，再无那人唤你一声道友。`});
          } else if(renyuTrialId==='zhanqing'){
            events.push({year:age,type:'break',text:`你以绝情之身证帝——情根既断，人欲道亦成：【斩断情根】。帝路清净，亦寂寞。`});
          } else if(renyuBoai){
            events.push({year:age,type:'break',text:`你以【博爱一生】证帝——情系苍生、兼爱万物，人欲道至此臻于极致，万民颂你帝号，诸帝亦为侧目。`});
          } else if(renyuTongzheng){
            events.push({year:age,type:'break',text:`【双帝临世】——你与【${qingyuanName||'道侣'}】同登帝位，二帝同辉于星河之巅！此乃万古未有之奇景，诸天震动。`});
          }
        }
      // 突破增益 / 天劫
      if(alive && realm<38 && !zizhan){
        const lg=LIFEGAIN[realm];
        if(realm>=14){
          const tribName=pick(TRIBB(realm));
          let tp=0.92 - (realm-14)*0.009 + apt.breakBonus*0.4 + phy.breakBonus*0.4 + race.breakBonus*0.3;
          if(phy.curse && realm>=14 && realm<=22) tp-=0.06;
          tp=Math.max(0.18, Math.min(0.97, tp));
          if(rnd() < tp){
            let pre=`突破至【${REALMS[realm].k}·${REALMS[realm].g}】，引动${tribName}淬体而成，威压一方。`;
            if(lg>0 && lg<999999){ lifeMax+=lg; pre+=` 得寿元 +${lg} 载。`; }
            else if(lg>=999999){ lifeMax+=999999; pre+=' 超脱岁月，长生不朽！'; }
            if(realm===38){ pre += hasWeapon ? ` 以【${race.weapon}】镇压帝劫，证得大帝果位！` : ` 无帝兵镇压，险之又险证得大帝果位！`; }
            events.push({year:age,type:'break',text:pre});
          } else {
            let death=rnd()<0.18, loss=ri(30,90);
            if(path && path.id==='gong' && realm>=37 && death){ const guard=Math.min(0.3, merit*0.002); if(rnd()<guard) death=false; }
            if(death){ alive=false; cause=`渡${tribName}失败，形神俱灭`;
              events.push({year:age,type:'end',text:`突破【${REALMS[realm].k}·${REALMS[realm].g}】引动${tribName}，渡劫失败，身陨雷海。`}); if(!reTalismanGuard(false)) continue; }
            lifeMax-=loss; realmProgress=NEED[realm]*0.4;
            events.push({year:age,type:'fail',text:`突破【${REALMS[realm].k}·${REALMS[realm].g}】引动${tribName}，渡劫受创，耗去 ${loss} 载寿元，道行滞留。`});
            if(lifeMax<=age){ alive=false; cause='渡劫重伤，坐化于山门';
              events.push({year:age,type:'end',text:`渡劫之伤难愈，于 ${age} 载时坐化。`}); if(!reTalismanGuard(false)) continue; }
          }
        } else {
          if(lg>0 && lg<999999){
            lifeMax += lg;
            events.push({year:age,type:'break',text:`突破至【${REALMS[realm].k}·${REALMS[realm].g}】，${lg>=1000?'延寿':''}得寿元 +${lg} 载。`});
          } else if(lg>=999999){
            lifeMax += 999999;
            events.push({year:age,type:'break',text:`突破至【${REALMS[realm].k}·${REALMS[realm].g}】，超脱岁月，长生不朽！`});
          } else {
            events.push({year:age,type:'break',text:`突破至【${REALMS[realm].k}·${REALMS[realm].g}】。`});
          }
        }
      }
    }

    // 大帝晚年·活出下一世·悟道抉择（替代原自动自斩：大帝须"想出"一种续世之法，方能活出下一世）
    if(alive && realm>=38 && realm<39 && !isRe && !tianDi && !zizhan && !immortalGate && !canAscend && nextLifeCool<=0 && (age - lastNextLifeAge) >= ZIZHAN_DELAY){
      nextLifeCool = ri(900,1600); // 每次悟道契机后冷却约一千年，方再临下一契机
      // 可用方法（按前置过滤）：直接服食不死药需持有且未服
      const methods = [];
      if(elixir && !elixirUsed) methods.push(NEXT_LIFE.elixir);
      methods.push(NEXT_LIFE.zizhan, NEXT_LIFE.xianyao, NEXT_LIFE.hundun, NEXT_LIFE.fan, NEXT_LIFE.xianjing);
      markChoice(); const ask = yield {kind:'choice', events,
        title:'活 出 下 一 世 · 悟 道',
        prompt:`大帝晚年，寿元将尽。欲活出下一世、再续帝途，当以何法悟道？此乃大帝最后一搏——悟通则入下一世，悟否则归于尘土。`,
        options: methods.map(m=>({label:m.name, desc:m.desc}))};
      const mi = (typeof ask==='number' && ask>=0 && ask<methods.length) ? ask : Math.floor(rnd()*methods.length);
      const m = methods[mi];
      if(m.id==='elixir'){
        elixirUsed=true; elixirUsedEarly=true; secondLife=true;
        lifeMax = age + SECOND_LIFE_SPAN; lastNextLifeAge = age; nextLifeCool = 0;
        events.push({year:age,type:'break',text:`你于帝落之前服下【不死药】——药力流转，再活一世！大帝果位犹在，二世重生，帝途再续。`});
      } else if(m.id==='zizhan'){
        zizhan=true; zizhanAge=age; elixir=false; elixirUsed=true; daoKind='自斩';
        realm=37;
        xianluYear = age + ri(ZIZHAN_WAIT_MIN, ZIZHAN_WAIT_MAX); lifeMax = age + ZIZHAN_LIFESPAN;
        events.push({year:age,type:'break',text:`大帝晚年，成仙无望——你于帝落之前【自斩一刀】，主动削落大帝果位、自贬为【至尊】，蛰伏于禁区深处，静候万古之后的成仙路开启，再争仙果。`});
      } else if(m.kind==='immortal'){
        if(rnd() < (zhuzhuBlessing ? Math.min(0.95, m.prob*ZHUZHU_BLESS_MUL) : m.prob)){
          realm=39; realmProgress=0; lifeMax+=999999; daoKind='红尘仙';
          events.push({year:age,type:'break',text:`你以【${m.name}】悟通长生真意——仙门洞开，踏过成仙路，终成【红尘仙】，长生不朽！`});
        } else {
          events.push({year:age,type:'bad',text:`你试以【${m.name}】悟道，然机缘未至、法理终差一线，悟道未成，帝心怅然。`});
        }
      } else { // secondLife 类（观摩仙药复生 / 化混沌体 / 化凡体 / 积仙精）
        if(rnd() < (zhuzhuBlessing ? Math.min(0.95, m.prob*ZHUZHU_BLESS_MUL) : m.prob)){
          lifeMax = age + SECOND_LIFE_SPAN; lastNextLifeAge = age; nextLifeCool = 0;
          events.push({year:age,type:'break',text:`你以【${m.name}】悟道成功——大帝果位不灭，再活一世！帝途绵延，下一世可期。`});
        } else {
          events.push({year:age,type:'bad',text:`你试以【${m.name}】悟道，然火候未到，悟道未成，帝心怅然。`});
        }
      }
    }
    // 自斩至尊·静候仙路
    if(alive && zizhan && realm<39 && age >= xianluYear){
        if(rnd() < (SH ? SH_ZIZHAN_XIAN : ZIZHAN_XIAN_PROB)){
          realm=39; realmProgress=0; lifeMax+=999999; daoKind='红尘仙';
        events.push({year:age,type:'break',text:`万古等待终有果——【成仙路】于星河尽头轰然开启！你以自斩至尊之身赴会，于仙路争渡中杀穿群雄，踏过成仙路——终成【红尘仙】，长生不朽！`});
        events.push({year:age,type:'vision',text:`🌀 然于长生不朽之巅，你忽生一刹幻觉——时间长河深处，竟遥遥传来一阵诡谲而邪恶的笑声：「海绵宝宝，我们去抓水母吧～」笑声散去，唯余你一身冷汗，不知是何方存在跨越万古窥探了你。`});
      } else {
        alive=false; cause='成仙路争渡失败，至尊坐化';
        events.push({year:age,type:'end',text:`成仙路开启，你赴仙路争渡，然群雄并起、仙路无情——争渡败北，至尊之身油尽，于 ${age} 载时坐化，抱憾仙途。`});
      }
    }

    // 诡异红毛·噬主（源天师·准帝九重天专属死因；仅此死法才触发 java 彩蛋）
    if(alive && redHair && realm===37 && rnd() < REDHAIR_DEATH_PROB){
      alive=false; cause='诡异红毛噬体，道途崩断';
      events.push({year:age,type:'end',text:`周身诡异红毛愈演愈烈，竟反噬其主——你于证道前夜被红毛吞没神智，道途崩断，道殒于【准帝九重天】。`});
    }
    // 寿元耗尽
    if(alive && age>=lifeMax){
      if(!tryElixirRevive()){
        alive=false;
        cause = (realm>=38 && !isRe && secondLife) ? '二世已尽，大帝坐化于岁月' : '寿元耗尽，坐化于岁月';
        events.push({year:age,type:'end',text:`寿元耗尽，于 ${age} 载时坐化，归于尘土。`});
      }
    }
    // 红尘仙
    if(realm===REALMS.length-1 && alive){
      alive=false; cause='长生不朽，超脱轮回';
      events.push({year:age,type:'end',text:`证得红尘仙果，超脱岁月，长生不朽，笑看沧海桑田。`});
    }
  }

  // ★困告仙尊彩蛋：陷入万古长梦陷阱者，临终前响起困告低语（永眠于幻妄之间）
  if(kungaoTrap && realm < 39){
    events.push({year:age,type:'vision',text:`【困告低语】睡吧。堕入万古长梦，夺诸天造化，就此永眠于幻妄之间吧！ 啊哈哈哈哈哈哈哈！`});
  }

  return {events, final:{realm, age, lifeMax, weaponLv, cause, apt, phy, race, region, path, hasWeapon, selfBodyWeapon, secondLife, elixirUsedEarly, tianDi, immortalGate, zizhan, daoKind, baseLife, reincarnated:isRe, reincarnCount:reCount, identity:identity.name, gender, reTalismanSpent:isRe&&!reTalisman,
    __canAscend:canAscend, __nihuo:nihuo, __immortalGate:immortalGate,
    yuanJavaJoke:(path && path.id==='yuan' && redHair && realm<38 && cause==='诡异红毛噬体，道途崩断') ? '桀桀桀，沾染java的人最后都会长红毛' : '',
    ancestorRevive: ancestorRevived ? {master:(path&&path.id==='renyu'?'人欲道祖师·阿香':'仙厨祖师·老抽'), msg:ancestorMsg} : null,
    duERevive: duERevived, cultStyle: cultStyleName, qiyu: qiyuCount,
    qingyuan: hasQingyuan ? (qingyuanName||'道侣') : '', qingyuanDeep: hasQingyuan && qingyuanDeep,
    renyuTrialId: renyuTrialId, renyuTrialName: renyuTrialName,   // 终试抉择（不论成败皆记录）
    renyuBlocked: renyuBlocked,                                    // 人欲无根：证道之门永闭
    renyuTrial: (realm>=38 && renyuTrialName) ? renyuTrialName : '', // 仅证道者记为「终试道果」
    renyuKilled: renyuKilled, renyuBoai: renyuBoai, renyuTongzheng: renyuTongzheng,
    kungaoEgg: kungaoTrap && realm<39, xindiEgg: xindiEgg, zhuzhuEgg: zhuzhuBlessing,
    yang: YANG, yangFocus: {combat:yangFocus.combat, comp:yangFocus.comp, heart:yangFocus.heart, fortune:yangFocus.fortune, life:yangFocus.life},
    perfectBirth: perfectBirth}};
  }

  // 完美重生判定：出生时随机出的「天赋 / 体质 / 家世」三者皆臻顶尖
  // → 此生顺遂（走宽厚曲线），且万般奇遇「必拿下」（取最有利之机缘、免其死劫）
  function perfectBirthOf(apt, phy, identity){
    const topApt = !!(apt && apt.val >= PERFECT_APT_MIN);                      // 资质 SSS / SS
    const topPhy = !!(phy && PERFECT_PHY_TIERS.indexOf(phy.tier) >= 0);        // 体质：仅 T0（T1 不配）
    const topFam = !!(identity && PERFECT_FAM_IDS.indexOf(identity.id) >= 0);  // 家世 帝子 / 圣子
    return topApt && topPhy && topFam;
  }
  // 机缘评分：用于「必拿下」时挑选最有利之结果（死劫 -1000 / 风险 -50 / 造化 +20 / 兵器 +10 / 延寿 + / 损寿 -）
  function scoreEff(e){
    if(!e) return 0;
    let s=0;
    if(e.death)   s-=1000;                                       // 死劫：绝不取
    if(e.risk)    s-=50;                                         // 风险：避之
    if(e.fortune) s+=20;                                         // 机缘（不死药 / 造化）
    if(e.weapon)  s+=10;                                         // 兵器升品
    if(e.life)    s += (e.life[0]>0 ? 5+e.life[0]*0.01 : -5);    // 延寿 / 损寿
    if(e.neutral) s+=1;
    return s;
  }
  // 必拿下：于奇遇诸选项中，择最有利之机缘（避死劫、避险、取造化）；分支型按其最优分支计分
  function bestQiyuIndex(q){
    let bi=0, bs=-1e9;
    (q.options||[]).forEach((o,oi)=>{
      const e=o.effect||{};
      let s = scoreEff(e);
      if(e.branch){                                              // 分支型：以「最有利分支」计分
        let bmax=-1e9;
        (e.branch||[]).forEach(b=>{ const v=scoreEff(b); if(v>bmax) bmax=v; });
        s = bmax;
      }
      if(s>bs){ bs=s; bi=oi; }
    });
    return bi;
  }

  function rollLife(){
    const apt=rollApt();
    const race=weighted(RACES);
    const region=weighted(NOVICE_REGIONS);
    const phyPool=PHYSIQUES.filter(p=>p.races.includes('all') || p.races.includes(race.name))
      .map(p=> (region.genius>=0.8 && (p.tier==='T0'||p.tier==='T1')) ? {...p, w:p.w*1.6} : p);
    const phy=weighted(phyPool);
    const baseLife=Math.round(phy.lifeBase*0.6 + race.lifeBase*0.4) + ri(-20,30);
    const identity=weighted(IDENTITIES);
    const gender = rnd() < 0.5 ? '女' : '男'; // 性别（女帝彩蛋依赖）
    return {apt, phy, race, baseLife, region, identity, gender};
  }

  // 非交互版：自动随机抉择、一次跑完一生（无头校验 / 成就统计 / 旧调用兼容）
  // 交互式播放请用 simulateGen（生成器，遇抉择会 yield 等待玩家选择）。
  function simulate(apt, phy, race, baseLife, region, opts){
    const g = simulateGen(apt, phy, race, baseLife, region, opts);
    let r = g.next(), guard = 0;
    while(!r.done && guard++ < 8000){
      const req = r.value;
      const n = (req && req.options) ? req.options.length : 0;
      r = g.next(n ? Math.floor(Math.random()*n) : 0);
    }
    return r.value;
  }

  ZT.engine = { simulate, simulateGen, rollLife };

})(window.ZT = window.ZT || {});
