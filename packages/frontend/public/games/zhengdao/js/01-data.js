/* User-provided source archive SHA-256: 34ec6528a54acb3e593c9b9a8d0deb9ea0d3723c2d795ad32cf457671f8415a3. */
/* =========================================================================
 * 01-data.js  ·  数据总表（纯数据，无逻辑）  →  window.ZT.data
 * -------------------------------------------------------------------------
 * 境界 / 种族 / 体质 / 身份 / 禁区 / 证道之道 / 杂表。
 * 改境界名、改种族、改体质、改身份、改七大禁区文案，只动这个文件。
 * 依赖：无（最先加载）。其它模块通过 ZT.data.X 读取，不再直接引用全局变量。
 * ========================================================================= */
(function(ZT){
  'use strict';

  // 五大秘境 + 准帝 + 大帝 + 红尘仙，共 40 阶
  const REALMS = [
    {k:'凡人',     g:'未入道'},
    {k:'轮海秘境', g:'开辟苦海'},
    {k:'轮海秘境', g:'修成命泉'},
    {k:'轮海秘境', g:'架设神桥'},
    {k:'轮海秘境', g:'到达彼岸'},
    {k:'道宫秘境', g:'心之神藏'},
    {k:'道宫秘境', g:'肝之神藏'},
    {k:'道宫秘境', g:'脾之神藏'},
    {k:'道宫秘境', g:'肺之神藏'},
    {k:'道宫秘境', g:'肾之神藏'},
    {k:'四极秘境', g:'修左臂'},
    {k:'四极秘境', g:'修右臂'},
    {k:'四极秘境', g:'修左腿'},
    {k:'四极秘境', g:'修右腿'},
    {k:'化龙秘境', g:'第一变'},
    {k:'化龙秘境', g:'第二变'},
    {k:'化龙秘境', g:'第三变'},
    {k:'化龙秘境', g:'第四变'},
    {k:'化龙秘境', g:'第五变'},
    {k:'化龙秘境', g:'第六变'},
    {k:'化龙秘境', g:'第七变'},
    {k:'化龙秘境', g:'第八变'},
    {k:'化龙秘境', g:'第九变（大圆满）'},
    {k:'仙台秘境', g:'第一层天·半步大能'},
    {k:'仙台秘境', g:'第二层天·大能'},
    {k:'仙台秘境', g:'第三层天·王者（斩道）'},
    {k:'仙台秘境', g:'第四层天·圣人'},
    {k:'仙台秘境', g:'第五层天·圣人王'},
    {k:'仙台秘境', g:'第六层天·大圣'},
    {k:'准帝',     g:'一重天'},
    {k:'准帝',     g:'二重天'},
    {k:'准帝',     g:'三重天'},
    {k:'准帝',     g:'四重天'},
    {k:'准帝',     g:'五重天'},
    {k:'准帝',     g:'六重天'},
    {k:'准帝',     g:'七重天'},
    {k:'准帝',     g:'八重天'},
    {k:'准帝',     g:'九重天'},
    {k:'大帝',     g:'证道称帝'},
    {k:'红尘仙',   g:'长生不朽'},
  ];

  // 突破到每一阶所需的"修行进度"（几何增长后封顶）
  const NEED = [];
  for(let i=0;i<REALMS.length-1;i++){
    NEED[i] = Math.min(6000, Math.round(18 * Math.pow(1.34, i)));
  }

  // 跨入某阶时获得的寿元增益
  const LIFEGAIN = new Array(REALMS.length).fill(0);
  LIFEGAIN[1]=20; LIFEGAIN[4]=30; LIFEGAIN[5]=40; LIFEGAIN[9]=60;
  LIFEGAIN[10]=80; LIFEGAIN[13]=120; LIFEGAIN[14]=200; LIFEGAIN[20]=300; LIFEGAIN[22]=480;
  LIFEGAIN[23]=200; LIFEGAIN[24]=470; LIFEGAIN[25]=400; LIFEGAIN[26]=600; LIFEGAIN[27]=600; LIFEGAIN[28]=1400;
  LIFEGAIN[29]=400; LIFEGAIN[30]=400; LIFEGAIN[31]=450; LIFEGAIN[32]=450; LIFEGAIN[33]=450;
  LIFEGAIN[34]=500; LIFEGAIN[35]=500; LIFEGAIN[36]=500; LIFEGAIN[37]=350;
  LIFEGAIN[38]=0; /* 大帝寿元改由证道时一次性设定 */
  LIFEGAIN[39]=999999;

  // 体质表
  const PHYSIQUES = [
    {name:'凡体',         tier:'T3', w:40, progMul:0.85, breakBonus:-0.05, lifeBase:90, races:['all'],
      desc:'芸芸众生，无特殊血脉。然潜力自在人为，狠人大帝亦是凡体成道。'},
    {name:'元灵体',       tier:'T2', w:9,  progMul:1.15, breakBonus:0.04,  lifeBase:120, races:['all'],
      desc:'天生亲近灵气，无需苦修亦能自动纳灵，续航无双。'},
    {name:'天妖体',       tier:'T2', w:6,  progMul:1.20, breakBonus:0.05,  lifeBase:130, races:['all'],
      desc:'妖族至强体魄，肉身与妖力同修，一方豪强；各族血脉交融亦偶有现。'},
    {name:'混沌体',       tier:'T0', w:0.4,progMul:1.80, breakBonus:0.25,  lifeBase:500, races:['all'],
      desc:'体质之王，与万道共鸣，万法不侵。万古偶现，不限种族；当世有大帝亦必证道。'},
    {name:'东荒神体',     tier:'T2', w:4,  progMul:1.25, breakBonus:0.06,  lifeBase:150, races:['人族'],
      desc:'东荒姬家传承神体，大成可称大圣，难破帝境。'},
    {name:'太阴体',       tier:'T1', w:3,  progMul:1.30, breakBonus:0.08,  lifeBase:160, races:['人族'],
      desc:'至阴之体，掌太阴本源，悟性卓绝，然易早夭需续命。人族血脉所钟。'},
    {name:'太阳体',       tier:'T1', w:3,  progMul:1.30, breakBonus:0.08,  lifeBase:160, races:['人族'],
      desc:'至阳之体，掌太阳本源，修行极速，攻伐无双。本为人族至高体质之一。'},
    {name:'先天道胎',     tier:'T1', w:3,  progMul:1.40, breakBonus:0.12,  lifeBase:180, races:['人族'],
      desc:'天生亲近大道，悟道如鱼得水，可轻松破仙台。人族道体之冠。'},
    {name:'苍天霸体',     tier:'T1', w:2.5,progMul:1.45, breakBonus:0.10,  lifeBase:200, races:['人族'],
      desc:'至刚至阳，圣体宿敌，九神形近战无双。人族霸体一脉。'},
    {name:'荒古圣体',     tier:'T1', w:2,  progMul:1.35, breakBonus:-0.10, lifeBase:220, curse:true, races:['人族'],
      desc:'人族脊梁，肉身无敌。然后荒古时代受断路诅咒——四极境须以帝兵级证道器物镇压己身，然帝兵岂是四极可求？故九成圣体夭折于此。'},
    {name:'先天圣体道胎', tier:'T0', w:0.7,progMul:1.70, breakBonus:0.22,  lifeBase:400, races:['人族'],
      desc:'圣体与道胎融合，万古无一。人族气运所凝，出生即终点，必成大帝。'},
    {name:'黄金神体',     tier:'T2', w:6,  progMul:1.18, breakBonus:0.05,  lifeBase:180, races:['黄金族'],
      desc:'黄金族血脉所化，体若神金，肉身无双，攻伐与防御皆绝。'},
    {name:'血雷体',       tier:'T2', w:5,  progMul:1.20, breakBonus:0.06,  lifeBase:160, races:['血电王族'],
      desc:'血电王族本源，掌血色神雷，雷霆加身，攻伐滔天。'},
    {name:'离火体',       tier:'T2', w:5,  progMul:1.17, breakBonus:0.05,  lifeBase:165, races:['火麟族'],
      desc:'火麟族离火血脉，掌焚天神焰，炼器炼体两相宜。'},
    {name:'神明体',       tier:'T1', w:3,  progMul:1.22, breakBonus:0.07,  lifeBase:190, races:['神族'],
      desc:'神族神明后裔，血统高贵，天生近道，神威浩荡。'},
    {name:'幽冥体',       tier:'T2', w:4,  progMul:1.13, breakBonus:0.04,  lifeBase:150, races:['幽冥族'],
      desc:'幽冥族地府血脉，掌轮回阴冥之力，诡谲难测。'},
    {name:'元皇体',       tier:'T1', w:3,  progMul:1.25, breakBonus:0.08,  lifeBase:200, races:['元族'],
      desc:'元皇传承血脉，万法皆通，元皇剑出，证道如虎添翼。'},
    {name:'天蚕体',       tier:'T2', w:4,  progMul:1.15, breakBonus:0.05,  lifeBase:155, races:['天蚕族'],
      desc:'天蚕族九蜕血脉，越战越强，蜕皮重生，寿元悠长。'},
    {name:'仙灵体',       tier:'T1', w:3,  progMul:1.20, breakBonus:0.06,  lifeBase:185, races:['天人族'],
      desc:'天人族近仙血脉，背生双翼，亲和仙道，证道器物易成。'},
  ];

  // 种族表（影响修行速度/突破/寿命，各有专属「证道器物」）
  const RACES = [
    {name:'人族',     w:40, progMul:1.00, breakBonus:0.03, lifeBase:100, weapon:'无定（依道而生）', weaponNat:false,
      desc:'天地主角，气运所钟。万古大帝多出人族，证道自有天道眷顾；然无天生帝兵，需自寻神料。'},
    {name:'黄金族',   w:6,  progMul:1.15, breakBonus:0.05, lifeBase:170, weapon:'黄金神钟', weaponNat:true,
      desc:'太古族裔，体若神金，肉身无双。天生继承帝兵传承之黄金神钟，证道多仗之。'},
    {name:'血电王族', w:5,  progMul:1.18, breakBonus:0.06, lifeBase:160, weapon:'血电神戟', weaponNat:false,
      desc:'掌血色神雷，攻伐滔天。需于古帝战场寻大帝遗藏，祭炼血电神戟，方能稳妥证道。'},
    {name:'火麟族',   w:4,  progMul:1.16, breakBonus:0.05, lifeBase:165, weapon:'离火神炉', weaponNat:false,
      desc:'麟族余脉，执掌离火本源。证道器物离火神炉，非神料不可成。'},
    {name:'神族',     w:3,  progMul:1.22, breakBonus:0.08, lifeBase:190, weapon:'神明铜炉', weaponNat:true,
      desc:'神明后裔，血统高贵，天生近道。族中多传神明铜炉残兵，证道如虎添翼。'},
    {name:'幽冥族',   w:3,  progMul:1.12, breakBonus:0.04, lifeBase:150, weapon:'幽冥天棺', weaponNat:false,
      desc:'地府一脉，掌轮回阴冥之力，诡谲难测。证道需幽冥天棺镇压己身真灵。'},
    {name:'元族',     w:2,  progMul:1.25, breakBonus:0.09, lifeBase:200, weapon:'元皇剑', weaponNat:true,
      desc:'元皇传承，万法皆通。元皇剑既出，证道如有神助。'},
    {name:'天蚕族',   w:2,  progMul:1.14, breakBonus:0.05, lifeBase:155, weapon:'天蚕神衣', weaponNat:false,
      desc:'九蜕重生，越战越强。需天蚕神衣护道，方渡证道之劫。'},
    {name:'天人族',   w:2,  progMul:1.20, breakBonus:0.07, lifeBase:185, weapon:'天人扇', weaponNat:false,
      desc:'背生双翼，近仙之族。证道器物天人扇，引动仙料方成。'},
  ];

  // 兵器品阶（本命兵器，品阶越高突破越顺、证道越稳）
  const WEAPON_TIERS = [
    {name:'凡铁', bonus:0.00},
    {name:'灵兵', bonus:0.03},
    {name:'道兵', bonus:0.07},
    {name:'王兵', bonus:0.12},
    {name:'圣兵', bonus:0.18},
    {name:'帝兵', bonus:0.28},
  ];

  const PATHS = [
    {id:'xiu', name:'修炼证道', w:52, desc:'以一身修为逆推大道，踏破四极仙台，直证大帝果位。'},
    {id:'yuan', name:'源天师证道', w:20, desc:'修源术、辨龙脉、掘神源，以源天师之道另辟蹊径窥得证道之门；然源术逆天，易招天诅。'},
    {id:'gong', name:'功德证道', w:20, desc:'行善积德、镇压黑暗、护佑众生，以无量功德洗练道果，功德圆满自证大帝。'},
    {id:'renyu', name:'人欲证道', w:12, desc:'循人欲大道的诡谲之途，以情欲执念为薪，于红尘中参悟另类帝果；然人道诡谲，易走火入魔，准帝之期尤为凶险。'},
    {id:'xianchu', name:'仙厨证道', w:11, desc:'以食证道、以厨入帝的逍遥之途，烹天材地宝、炼万味真火，于烟火中窥得长生；然火候难控，常惹祸端。'},
  ];

  // 秘境修行取向（道宫/四极/化龙 入口抉择，影响余生进境节奏与凶险机缘）
  const CULT_STYLES = {
    houji:  {key:'houji',  name:'厚积·修身', rateMul:1.00, riskMul:0.90, fortuneMul:0.90, note:'根基沉稳——凶险更少、更稳当，然机缘亦淡。'},
    waiqiu: {key:'waiqiu', name:'外求·修法', rateMul:1.00, riskMul:1.10, fortuneMul:1.22, note:'广猎造化——机缘大盛、凶险随福而至，进境稍缓。'},
    lianxin:{key:'lianxin',name:'炼心·修心', rateMul:1.00, riskMul:0.85, fortuneMul:1.00, note:'红尘炼心——邪祟心魔难侵，道途最为平稳。'}
  };
  const CULT_AT = {
    5:  {title:'秘 境 · 道 宫 取 向', prompt:'你初入【道宫秘境】，将修五脏神藏。修行取向自此分野——这一选择将贯穿你此后余生的进境节奏与凶险机缘。'},
    10: {title:'秘 境 · 四 极 取 向', prompt:'你踏入【四极秘境】，将修四肢通天。修行取向至此再定，余生之路或稳行、或搏险。'},
    14: {title:'秘 境 · 化 龙 取 向', prompt:'你入【化龙秘境】，九变化龙、脱胎换骨——此乃修行一大关窍！你欲以何法化龙？'}
  };

  // 世界版图：新手村（四大出生地）→ 星空古路 → 全宇宙
  const NOVICE_REGIONS = [
    {name:'北斗·葬帝星', desc:'遮天主舞台，禁区林立、古族沉眠，天骄云集（最难），然机缘与上限亦最高；新晋准帝易引黑暗动乱。', w:40, turmoil:true, compete:1.00, ceiling:1.35, genius:1.00, tag:'天骄最多·最难·收益最大'},
    {name:'紫薇星域', desc:'帝王星域，古皇道统传承，星河璀璨，天骄辈出。修行稍顺，然上限不及葬帝星。', w:25, turmoil:false, compete:0.72, ceiling:1.00, genius:0.60, tag:'顺遂·上限中等'},
    {name:'永恒星域', desc:'永恒神朝统御的繁华星域，修行与机缘无数，气象恢弘。机缘尚佳，上限平平。', w:20, turmoil:false, compete:0.66, ceiling:0.92, genius:0.52, tag:'机缘尚佳·上限偏低'},
    {name:'地球·灵气复苏', desc:'复苏中的故乡星辰，道隐于市，觉醒者渐起。修行最易，然大道未复，上限最低。', w:15, turmoil:false, compete:0.45, ceiling:0.82, genius:0.40, tag:'最易·上限最低'},
  ];

  const FAMILY=['姬家','姜家','虚空家','摇光圣地','道一圣地','妖族古国','紫府','姚家','神朝','太初古矿'];
  const HOLYMED=['不死药','九转仙草','神凰血','麒麟血','悟道茶树','朱雀残羽','龙髓'];
  const ENEMY=['宿敌','禁区至尊','古族天骄','阴鬼修士','采药大盗','心魔旧识','仇家势力'];
  const TRIB=['四九小劫','雷池大劫','阴阳死劫','星辰灭世劫','准帝天心劫','证道仙劫'];

  // 七大生命禁区：各有逆天奇遇，亦有无尽凶险
  const FORBIDDEN_ZONES = [
    {name:'太初古矿', fortuneProb:0.42,
      fortune:'太初古矿深处，你拾得一枚【太初源石】——此乃开天遗留的神物，温养本源，延寿万载，帝道可期。', gain:2400,
      peril:'太初古矿中沉睡的至尊被你惊动，一双冷漠的眸子于黑暗中睁开，一念间将你镇杀。'},
    {name:'神墟', fortuneProb:0.40,
      fortune:'神墟之内，你于残破神殿寻得远古大帝的【传承道骨】，融于己身，道行骤进，眼界大开。', gain:2000,
      peril:'神墟的墟主早已不灭，你妄入其寝宫，被一缕残余帝念轻易抹杀。'},
    {name:'仙陵', fortuneProb:0.38,
      fortune:'仙陵中葬着成仙古路，你窃得一缕【仙道气机】，肉身被洗练，距长生又近一步。', gain:2600,
      peril:'仙陵主人乃古之仙，你触其棺椁，仙威降世，真灵瞬息崩碎。'},
    {name:'古皇山', fortuneProb:0.44,
      fortune:'古皇山中，你拜入一位古皇留下的【悟道台】，静坐千年，明悟帝道精髓，修为大涨。', gain:1800,
      peril:'古皇山的主人在沉眠中被你惊扰，皇道法则如山压下，你连反抗都无便形神俱灭。'},
    {name:'不死山', fortuneProb:0.36,
      fortune:'不死山中，你采得一朵【不死神药】，服之温养本源——寿元暴涨，更窥得不死真谛。', gain:3000,
      peril:'不死山的至尊本就诡谲，你闯入其领地，被其以禁术锁死真灵，永世不得超生。'},
    {name:'轮回海', fortuneProb:0.46,
      fortune:'轮回海畔，你窥见轮回归处的奥秘，前世记忆翻涌——轮回重修者于此受益尤深，道心圆融。', gain:1600,
      peril:'轮回海连通幽冥，你陷足其中，被海中沉眠的古老存在拖入无尽轮回，再无归来之日。'},
    {name:'归墟', fortuneProb:0.40,
      fortune:'归墟乃万水尽头，你于深渊中得一件【帝兵残骸】，祭炼后本命兵器更进一步，证道之基更稳。', gain:0, weaponBoost:true,
      peril:'归墟之下镇压着不可名状之物，你惊动它，被一口吞没，连道痕都未留下。'},
  ];

  // 出身身份：圣子圣女 / 帝子帝女 / 禁区子 / 散修
  const IDENTITIES = [
    {id:'san', name:'圣子 / 圣女', w:14, progMul:1.10, boon:0.10, risk:0.10, desc:'大教倾尽资源培养的圣子圣女，功法传承齐全，然树大招风，易成各方靶子。'},
    {id:'di',  name:'帝子 / 帝女', w:8,  progMul:1.14, boon:0.16, risk:0.14, desc:'大帝后裔，自带帝血与无上传承，起点极高；然父帝坐化后往往风波骤起，众矢之的。'},
    {id:'jin', name:'禁区子',     w:6,  progMul:1.08, boon:0.20, risk:0.22, desc:'禁区强者的子嗣，得禁区庇护，机缘逆天；然血脉或被诅咒、为当世所不容，亦常陷禁区纷争。'},
    {id:'san_diao', name:'散修 / 凡俗', w:72, progMul:1.00, boon:0.00, risk:0.00, desc:'无根无凭的散修，全凭自身机缘与苦修，前路最险却也最自由。'},
  ];

  const DAO_SUR=['青','玄','凌','云','虚','寒','墨','苍','寂','幽','紫','赤','凌霄','忘机','无尘','听雪'];
  const DAO_NAME=['尘','渊','溟','霜','羽','锋','冥','霄','川','夜','辰','空','寂','轩','离','玄'];

  // 奇遇抉择表：道宫之后偶发，玩家亲手拍板（手动点选 / 自动天意）。
  // 每个选项 effect 描述符：
  //   neutral / 直接 life:[min,max]（可为负，{life}占位符显示绝对值） / weapon（帝兵升品）/
  //   death（必死） / branch:[{p, ...}]（按概率取一支再解释）。
  //   fortune:true → 增益按「外求·修法」机缘倍率放大；risk:true → 损失按凶险倍率放大。
  const QIYU = [
    { id:'cave', min:6, max:33, prob:0.0016, cd:220,
      title:'奇 遇 · 古 洞 遗 藏',
      prompt:'你途经一片荒芜山岭，崖壁间透出一丝晦暗道韵——似有上古修士坐化其中，遗蜕与传承俱埋于石室深处。',
      options:[
        { label:'入洞探宝', desc:'冒险深入，九死一生，然或得大造化。',
          effect:{ branch:[
            {p:0.55, life:[150,500], type:'good', fortune:true, text:'古洞深处你寻得前辈遗藏与半株古药，温养本源，延寿 {life} 载。'},
            {p:0.30, life:[-150,-40], type:'bad', text:'古禁余威扫过，你受创退走，耗去 {life} 载寿元。'},
            {p:0.15, death:true, deathText:'古洞核心禁制复苏，你为夺传承触禁，形神俱灭于石室之中。'} ] } },
        { label:'只取洞外灵物', desc:'稳妥，只取些许边角造化。',
          effect:{ life:[40,160], type:'good', fortune:true, text:'你只取洞外散落道纹与灵株，稳妥延寿 {life} 载。'} },
        { label:'恭敬退去', desc:'不夺前人造化，结个善缘。',
          effect:{ neutral:true, text:'你于洞外躬身一礼，未夺遗蜕。来日或有一线善缘回报。'} }
      ] },
    { id:'elder', min:6, max:36, prob:0.0014, cd:260,
      title:'奇 遇 · 神 秘 老 者',
      prompt:'山道中一位麻衣老者拦路而笑，言可点化你一二，但须付出些许代价——是机缘，亦可能是试探。',
      options:[
        { label:'求老者点化', desc:'听其传道，或得大道真意。',
          effect:{ branch:[
            {p:0.50, life:[80,300], type:'epiph', fortune:true, text:'老者授你一段古道诀，修行豁然开朗，延寿 {life} 载。'},
            {p:0.30, life:[-60,-10], type:'bad', text:'老者试你心性，反震你一口道伤，耗去 {life} 载寿元。'},
            {p:0.10, weapon:true, text:'老者见你根骨不凡，赠你一截【{weapon}】祭炼之法——本命兵器升品！'} ] } },
        { label:'婉拒离去', desc:'不深交，免生枝节。',
          effect:{ neutral:true, text:'你拱手谢过，未敢深交。老者含笑隐入山雾，似从未存在。'} }
      ] },
    { id:'battlefield', min:10, max:30, prob:0.0015, cd:240,
      title:'奇 遇 · 上 古 战 场',
      prompt:'你踏入一片干涸的古战场，断戈残旗埋于黄土，隐隐有煞气与兵魂游荡——此乃大能殒落之地。',
      options:[
        { label:'炼化兵魂', desc:'以神念炼化一缕兵魂，凶险却得益。',
          effect:{ branch:[
            {p:0.20, weapon:true, text:'你以神念炼化一缕兵魂，本命兵器受煞气淬炼，升品为【{weapon}】！'},
            {p:0.35, life:[-120,-30], type:'bad', text:'兵魂反噬，煞气侵体，你强行镇压耗去 {life} 载寿元。'},
            {p:0.20, death:true, deathText:'上古兵魂过于暴戾，反将你神魂绞碎于战场废墟。'} ] } },
        { label:'拾取残兵材料', desc:'只收残断神铁，回炉祭器。',
          effect:{ life:[30,140], type:'good', fortune:true, text:'你只收些残断神铁与兵魂余屑，回炉祭器，延寿 {life} 载。'} },
        { label:'速速离开', desc:'煞气森然，不恋战利。',
          effect:{ neutral:true, text:'你感煞气森然，不恋战利，抽身退出古战场。'} }
      ] },
    { id:'demonmed', min:14, max:28, prob:0.0014, cd:240,
      title:'奇 遇 · 妖 族 圣 药',
      prompt:'你误入一片妖族禁地，一株吞吐月华的圣药近在眼前，却有古妖巡守——夺，还是退？',
      options:[
        { label:'强取圣药', desc:'以秘法强夺，得手则大补。',
          effect:{ branch:[
            {p:0.50, life:[200,600], type:'good', fortune:true, text:'你以秘法夺下圣药，温养本源，延寿 {life} 载！'},
            {p:0.35, life:[-160,-50], type:'bad', text:'古妖追杀，你带伤遁逃，耗去 {life} 载寿元。'},
            {p:0.15, death:true, deathText:'妖族大能现身，你夺药不成反被镇杀，形神俱灭。'} ] } },
        { label:'以物易药', desc:'与守药古妖交涉换得。',
          effect:{ life:[60,200], type:'good', fortune:true, text:'你与守药古妖一番交涉，以身上宝料换得圣药一枝，延寿 {life} 载。'} },
        { label:'不取而退', desc:'古妖难惹，按捺贪念。',
          effect:{ neutral:true, text:'圣药虽好，古妖难惹。你按捺贪念，悄然退去。'} }
      ] },
    { id:'emperorrem', min:23, max:37, prob:0.0013, cd:280,
      title:'奇 遇 · 大 帝 遗 蜕',
      prompt:'星海深处漂浮着一具古大帝遗蜕，帝威虽散，却仍压得你神魂战栗——参，还是拜？',
      options:[
        { label:'参悟帝蜕', desc:'盘坐帝蜕之前，参无上道则。',
          effect:{ branch:[
            {p:0.55, life:[250,800], type:'epiph', fortune:true, text:'你盘坐帝蜕之前参悟无上道则，道行猛进，延寿 {life} 载！'},
            {p:0.30, life:[-200,-60], type:'bad', text:'帝威反压，你道心受震，耗去 {life} 载寿元才稳住。'},
            {p:0.15, death:true, deathText:'帝蜕帝威未泯，你妄参帝道遭反噬，神魂崩于星海。'} ] } },
        { label:'只取帝血残露', desc:'引一缕帝血温养己身。',
          effect:{ life:[80,280], type:'good', fortune:true, text:'你只引一缕帝血残露温养己身，延寿 {life} 载。'} },
        { label:'遥拜而退', desc:'帝蜕非你可染指。',
          effect:{ neutral:true, text:'你知帝蜕非你可染指，遥遥一拜后退出星海。'} }
      ] },
    { id:'zunlun', min:29, max:37, prob:0.0012, cd:300,
      title:'奇 遇 · 至 尊 论 道',
      prompt:'一位沉眠的至尊于梦境中邀你论道——应答得当可受益匪浅，答错则道心受创。',
      options:[
        { label:'应约论道', desc:'与至尊梦中论道，窥大道真意。',
          effect:{ branch:[
            {p:0.60, life:[150,500], type:'epiph', fortune:true, text:'你与至尊梦中论道，得窥大道真意，延寿 {life} 载。'},
            {p:0.40, life:[-150,-40], type:'bad', text:'你道行尚浅，论道落于下风，道心受创耗去 {life} 载寿元。'} ] } },
        { label:'婉拒入梦', desc:'道心稳固，不为所惑。',
          effect:{ neutral:true, text:'你道心稳固，不为梦境所惑，静坐守神，至尊之邀自散。'} }
      ] },
    { id:'xianlu', min:30, max:38, prob:0.0010, cd:320,
      title:'奇 遇 · 成 仙 路 传 闻',
      prompt:'你偶得残碑，载有【成仙路】的模糊线索——追寻或能抢得一线先机，亦可能徒耗寿元。',
      options:[
        { label:'追寻线索', desc:'循残碑追索仙路古隘。',
          effect:{ branch:[
            {p:0.50, life:[100,400], type:'epiph', fortune:true, text:'循残碑线索你寻得一处仙路古隘，沾染仙机，延寿 {life} 载。'},
            {p:0.50, life:[-200,-50], type:'bad', text:'线索虚妄，你空耗岁月追索，反损 {life} 载寿元。'} ] } },
        { label:'录而藏之', desc:'拓印珍藏，留待日后。',
          effect:{ neutral:true, text:'你将残碑拓印珍藏，未轻动，留待日后机缘。'} }
      ] },
    { id:'starmine', min:6, max:22, prob:0.0014, cd:220,
      title:'奇 遇 · 星 墟 古 矿',
      prompt:'你发现一座废弃的星墟古矿，矿脉深处似有神料微光——深入或有所获，亦可能矿塌受困。',
      options:[
        { label:'深入采矿', desc:'闯矿脉深处，搏大帝神料。',
          effect:{ branch:[
            {p:0.22, weapon:true, text:'矿脉深处你竟寻得大帝神料，本命兵器祭炼升品为【{weapon}】！'},
            {p:0.30, life:[-100,-20], type:'bad', text:'矿脉塌方，你受困耗去 {life} 载寿元才脱身。'},
            {p:0.20, life:[60,260], type:'good', fortune:true, text:'你采得若干星核神矿，回炉祭器，延寿 {life} 载。'} ] } },
        { label:'浅层拾取', desc:'只在矿口拾得些星屑。',
          effect:{ life:[20,120], type:'good', fortune:true, text:'你只在矿口拾得些星屑，聊胜于无，延寿 {life} 载。'} },
        { label:'不取而退', desc:'凶吉未卜，不深入。',
          effect:{ neutral:true, text:'古矿凶吉未卜，你未敢深入，转身离去。'} }
      ] }
  ];

  /* ============ 人欲道 · 情缘与终试 ============
   * 人欲以情入道：情为其根。
   *   1) 情缘抉择（仙台之后触发一次）：可结道侣（深情）/ 随缘（浅情）/ 斩念避情（无牵绊）。
   *      ⚠ 若无情缘，则人欲道无根——证道之门永闭，此生绝无大帝之望。
   *   2) 终试（准帝九重天·冲击大帝那一刻必触发，一世一次）：杀妻证道 / 斩断情根 / 博爱一生 / 与她同证。
   *      bonus = 对「37→38 证道突破概率」的加成（可为负）；success 时的道果回响见引擎。
   * 注意：两处 title 均含「奇 遇」，如此手动模式下会自动弹出「结果卡」（与奇遇反馈一致）。
   * ============================================ */
  const QINGYUAN_NAMES = ['苏清颜','林晚舟','姜若雪','柳青萝','沈流萤','白素心','云千岫','慕紫鸢','叶红药','楚明瑶','南宫素问','洛青书'];

  const RENYU_QINGYUAN = {
    title:'奇 遇 · 红 尘 情 缘',
    prompt:'既择【人欲证道】，便须以情欲执念为薪——人欲大道，情为其根。仙台之途上，你于一次跨域论道中遇一人【{name}】，道心微动。\n\n⚠ 切记：人欲道以情入道，此生若无情缘，则证道之门永闭，绝无大帝之望。你可愿结此红尘之约？',
    options:[
      { id:'shou', label:'执手相守，结为道侣',
        desc:'与【{name}】结为道侣，情根深种——心境圆满（机缘 +10%），然牵绊既生，心魔易炽（凶险 +8%）。' },
      { id:'suiyuan', label:'若即若离，随缘而聚',
        desc:'不远不近，顺其自然——约有一半机缘结下情缘（浅情），得失各半（机缘 +5% / 凶险 +3%）。' },
      { id:'zhannian', label:'斩念避情，独行求道',
        desc:'斩断尘念，心无旁骛——凶险 -8%、机缘 -5%；⚠ 然情根既断，人欲道无根，此生不可证道。' }
    ]
  };

  const RENYU_TRIAL = {
    title:'奇 遇 · 人 欲 道 · 情 关',
    prompt:'证道在即——你与【{name}】的这一段情缘，已成人欲道上最后一道关。以情入道者，须于证道之刻给出答案：',
    options:[
      { id:'shaqi', name:'杀妻证道', bonus:0.28,
        label:'杀妻证道 · 斩尽尘缘',
        desc:'挥剑斩向最爱之人，以此斩断尘世最后一缕牵绊——证道之机大增（+28%）；然帝路孤冷，道心永留血痕。',
        text:'你挥剑斩向【{name}】——以最爱之人的命，斩断尘世最后一缕牵绊。血染帝路，道心通明如镜，证道之机大增；然自此帝路孤冷，万载回望，再无那人身影。' },
      { id:'zhanqing', name:'斩断情根', bonus:0.08,
        label:'斩断情根 · 绝情入道',
        desc:'不伤她性命，却亲手封绝七情六欲——证道之机有增（+8%），然自此与她形同陌路，相忘于江湖。',
        text:'你不忍加害，却亲手斩断自己的情根——七情六欲尽数封绝。【{name}】自此与你形同陌路，相忘于江湖。道心清净，证道之机有增。' },
      { id:'boai', name:'博爱一生', bonus:-0.04,
        label:'博爱一生 · 兼爱证道',
        desc:'情不系一人而系天下苍生，以兼爱入道——其难百倍于斩情（证道 -4%）；然一朝功成，便是人欲道之极致。',
        text:'你选择【博爱】——情不系一人，而系天下苍生。以兼爱入道，其难百倍于斩情；然一朝功成，便是人欲道之极致，万古称颂。' },
      { id:'tongzheng', name:'双帝同证', bonus:-0.15,
        label:'与她同证 · 双帝临世',
        desc:'牵起她的手共证大道——帝路之上双帝同临，旷古绝今；然天道不容二帝同辉，其难更甚（证道 -15%）。',
        text:'你牵起【{name}】的手，决意共证大道——帝路之上，双帝同临，此念旷古绝今；然天道不容二帝同辉，其难更甚于登天。' }
    ]
  };

  ZT.data = { REALMS, NEED, LIFEGAIN, PHYSIQUES, RACES, WEAPON_TIERS, PATHS,
              CULT_STYLES, CULT_AT, QIYU,
              QINGYUAN_NAMES, RENYU_QINGYUAN, RENYU_TRIAL,
              NOVICE_REGIONS, FAMILY, HOLYMED, ENEMY, TRIB, FORBIDDEN_ZONES, IDENTITIES, DAO_SUR, DAO_NAME };

})(window.ZT = window.ZT || {});
