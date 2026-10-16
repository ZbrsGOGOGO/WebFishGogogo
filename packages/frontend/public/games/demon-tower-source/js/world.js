/* =========================================================================
 * 九层妖塔 · 世界/探索 (world.js)
 * 探索事件 §2.2/2.3、秘境 §7.2、推塔门槛+Boss血池 §4.1/4.2、神秘通道 §4.5、好友切磋 §7.3
 * ========================================================================= */
(function (global) {
  'use strict';
  const C = global.CFG, ST = global.ST, API = global.API;

  function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

  // 土属性帮派加成：挖矿（神材掉落数量提升）
  function mineMult() { const b = (ST.sectBonus && ST.sectBonus()) || {}; return 1 + (b.mineMul || 0); }
  function addMatM(k, n) { ST.addMat(k, Math.round(n * mineMult())); }

  // 掉落一份锻造图纸（按当前可承受品质分级：低层偏凡铁蓝/紫，高层出仙金橙）
  function dropBlueprint(g, chance) {
    if (Math.random() >= (chance || 0)) return false;
    const tier = C.tierOf(ST.S.level);
    let pool;
    if (tier >= 4) pool = C.BLUEPRINT_LIST;                                  // 全十图
    else if (tier >= 3) pool = C.BLUEPRINT_LIST.filter(id => ['橙', '紫'].indexOf(C.BLUEPRINTS[id].quality) >= 0);
    else pool = C.BLUEPRINT_LIST.filter(id => C.BLUEPRINTS[id].quality === '蓝');
    const id = pool[Math.floor(Math.random() * pool.length)];
    ST.addBlueprint(id, 1);
    g.push('📜锻造图纸·' + C.BLUEPRINTS[id].name + '×1');
    return true;
  }

  /* §8 锻造材料掉落（探索/宝箱/Boss 共用） */
  function dropExploreMaterials() {
    const S = ST.S, g = [];
    const tier = C.tierOf(S.level);
    const t1 = ri(2, 6); addMatM('ht', t1); g.push('黑铁精+' + t1);
    if (tier >= 2 && Math.random() < C.TUNE.exploreRareMatChance) {
      const r = Math.random();
      if (r < C.TUNE.exploreRareCtRate) { const n = ri(1, 4); addMatM('ct', n); g.push('赤铜精金+' + n); }
      else if (r < 0.75) { const n = ri(1, 3); addMatM('lm', n); g.push('灵麻布+' + n); }
      else { const n = ri(1, 3); addMatM('yh', n); g.push('月华玉髓+' + n); }
      // 辅助耗材：淬炼精粹（替代旧淬炼液）
      if (Math.random() < C.TUNE.exploreAuxCuijlChance) { const n = ri(1, 3); addMatM('cuijl', n); g.push('淬炼精粹+' + n); }
    }
    // 绿装主材（青纹钢/兽魂皮/普通灵玉）：中后期稳定产出，避免推过 3 层后只能回头刷低层 BOSS
    if (tier >= 2 && Math.random() < C.TUNE.exploreGreenMatChance) {
      const k = ['qw', 'sh', 'py'][Math.floor(Math.random() * 3)];
      const n = ri(1, 3); addMatM(k, n); g.push(C.EQUIP.MATS[k].name + '+' + n);
    }
    // 木炭：精炼台消耗，探索稳定产出
    { const n = ri(C.TUNE.mtDropMin, C.TUNE.mtDropMax); addMatM('mt', n); g.push('木炭+' + n); }
    if (tier >= 3 && Math.random() < C.TUNE.exploreSpiritMatChance) {
      // 灵金（蓝/紫主体 & 橙主材）；仙金仅妖塔第 9 层 Boss 掉落，探索绝不出
      const opts = ['ct', 'bl', 'yw', 'yl', 'yh', 'sl', 'wj'];
      const k = opts[Math.floor(Math.random() * opts.length)];
      const n = ri(1, 3); addMatM(k, n); g.push(C.EQUIP.MATS[k].name + '+' + n);
      if (Math.random() < C.TUNE.exploreNingzChance) { const m = ri(1, 2); addMatM('ningz', m); g.push('凝紫精粹+' + m); }
    }
    if (ST.highUnlocked()) {
      if (Math.random() < C.TUNE.highMatChance) {
        const opts = ['xlg', 'yhs', 'kong', 'zs'];
        const k = opts[Math.floor(Math.random() * opts.length)];
        const n = ri(1, 2); addMatM(k, n); g.push(C.EQUIP.MATS[k].name + '+' + n);
      }
      if (Math.random() < C.TUNE.jinchiExploreRate) { ST.addJinchi(1); g.push('🔴烬赤源核+1'); }
    }
    return g;
  }
  function dropBossMaterials(layer) {
    const S = ST.S, g = [];
    let mat;
    if (layer >= 8) mat = { k: ['ct', 'bl', 'yw', 'yl', 'yh', 'sl', 'wj'][Math.floor(Math.random() * 7)], n: ri(2, 4) };
    else if (layer >= 6) mat = { k: ['ct', 'bl', 'yw', 'yl', 'yh', 'sl', 'wj'][Math.floor(Math.random() * 7)], n: ri(1, 3) };
    else if (layer >= 3) mat = { k: ['ct', 'bl', 'yw', 'yl', 'yh'][Math.floor(Math.random() * 5)], n: ri(1, 4) };
    else mat = { k: ['ht', 'qw', 'lm', 'sh', 'py'][Math.floor(Math.random() * 5)], n: ri(2, 4) };
    addMatM(mat.k, mat.n); g.push(C.EQUIP.MATS[mat.k].name + '+' + mat.n);
    // 木炭：精炼台消耗，Boss 稳定产出
    { const n = ri(1, 3); addMatM('mt', n); g.push('木炭+' + n); }
    // 至尊神料（7 层起）
    if (layer >= 7 && Math.random() < 0.3) { const k = ['xlg', 'yhs', 'kong', 'zs'][Math.floor(Math.random() * 4)]; const n = ri(1, 2); addMatM(k, n); g.push(C.EQUIP.MATS[k].name + '+' + n); }
    // 道源凝果：仅 8、9 层
    if (layer >= 8 && Math.random() < 0.15) { addMatM('daoyg', 1); g.push('道源凝果+1'); }
    // 仙金·帝材：仅第 9 层 Boss 极低概率，单次最多 1 块
    if (layer === 9 && Math.random() < 0.05) { const k = ['lh', 'hx', 'dj', 'hy'][Math.floor(Math.random() * 4)]; addMatM(k, 1); g.push('⚜' + C.EQUIP.MATS[k].name + '+1'); }
    // 烬赤源核（7 层起极低）
    if (layer >= 7 && Math.random() < C.TUNE.jinchiBossRate) { ST.addJinchi(1); g.push('🔴烬赤源核+1'); }
    return g;
  }

  /* ---------- 探索剧情库（连锁剧情 + 彩蛋；配置存库，前端内置兜底） ---------- */
  const STORY_WEIGHT = 14;   // story 事件抽取权重
  const EGG_WEIGHT = 5;      // egg 彩蛋抽取权重（低概率）
  let STORY_DB = null;       // 后端下发；为空则用 STORY_FALLBACK
  // 内置兜底（与 sql/jiuceng_story.sql 内容一致）；options/reward 直接为对象
  const STORY_FALLBACK = [
    { storyId:'ch_yao_1', chapter:'ch_yao', chapterName:'妖塔低语', seq:1, type:'story', terrain:'plain', prereq:null, next:'ch_yao_2', title:'残破的碑文',
      description:'你拨开蛛网，残碑上刻着扭曲的符文，隐隐透出妖气，像是被某种力量封印了千年。',
      options:[{label:'拓印碑文',effect:{text:'你拓下碑文，发现符文似乎与某层守的封印同源。',flag:'rubbing'}},
               {label:'以血为引唤醒符文',effect:{text:'碑文灼痛你的指尖，一缕力量涌入经脉（随机资质+1）。',reward:{dimRand:1}}}],
      reward:{stone:5}, weight:12 },
    { storyId:'ch_yao_2', chapter:'ch_yao', chapterName:'妖塔低语', seq:2, type:'story', terrain:'plain', prereq:'ch_yao_1', next:'ch_yao_3', title:'风化的祭坛',
      description:'碑文指引你来到一座风化的祭坛，中央悬浮着一枚黯淡的妖核，似在等待有缘人。',
      options:[{label:'收服妖核',effect:{text:'妖核没入你掌心，气机涌动（办公币+15）。',reward:{stone:15}}},
               {label:'献祭妖核换办公币',effect:{text:'你将妖核碾碎，办公币如雨洒落（办公币+40）。',reward:{stone:40}}}],
      reward:{materials:3}, weight:12 },
    { storyId:'ch_yao_3', chapter:'ch_yao', chapterName:'妖塔低语', seq:3, type:'story', terrain:'plain', prereq:'ch_yao_2', next:null, title:'低语的回响',
      description:'祭坛深处传来低语：「第九层……钥匙在背叛者手中……」回响消散，你感到妖塔向你敞开了某种联系。',
      options:[{label:'凝神记下低语',effect:{text:'你记下低语，解锁隐藏线索（flags.yaoWhisper）。',flag:'yaoWhisper'}},
               {label:'摇摇头离去',effect:{text:'你转身离开，但妖塔的轮廓已在心中不同。',next:null}}],
      reward:{stone:30,xp:50}, weight:12 },
    { storyId:'ch_abyss_1', chapter:'ch_abyss', chapterName:'深渊回声', seq:1, type:'story', terrain:'ocean', prereq:null, next:'ch_abyss_2', title:'沉没的船骸',
      description:'海浪退去，露出一艘沉没的船骸，舱内漂着一只未寄出的信匣，封蜡早已斑驳。',
      options:[{label:'拾起信笺',effect:{text:'信上记载着海洋层守的古老弱点（flags.abyssLetter）。',flag:'abyssLetter'}},
               {label:'搜刮船骸',effect:{text:'你找到一些散落的材料（材料+8）。',reward:{materials:8}}}],
      reward:{runes:2}, weight:10 },
    { storyId:'ch_abyss_2', chapter:'ch_abyss', chapterName:'深渊回声', seq:2, type:'story', terrain:'ocean', prereq:'ch_abyss_1', next:'ch_abyss_3', title:'溺亡者的请求',
      description:'一个半透明的溺亡者浮出水面，向你伸出手：「旅人，帮我找回沉锚……它沉在这一层的最深处。」',
      options:[{label:'答应帮忙找回沉锚',effect:{text:'溺亡者祝福你，护体之力增强（防御+2）。',reward:{def:2}}},
               {label:'婉拒并离去',effect:{text:'你摇了摇头，溺亡者缓缓沉入海底，深渊线暂歇。',next:null}}],
      reward:{stone:10}, weight:10 },
    { storyId:'ch_abyss_3', chapter:'ch_abyss', chapterName:'深渊回声', seq:3, type:'story', terrain:'ocean', prereq:'ch_abyss_2', next:null, title:'沉锚的封印',
      description:'你寻得沉锚，封印松动间涌出磅礴灵气，海面被照得通明。',
      options:[{label:'汲取灵气',effect:{text:'灵气灌体，办公币盈仓（办公币+60）。',reward:{stone:60}}},
               {label:'封存留给同僚',effect:{text:'你将灵气封存，团队办公币+50（协作精神）。',reward:{stone:50}}}],
      reward:{xp:60}, weight:10 },
    { storyId:'egg_meteor', chapter:'egg_meteor', chapterName:'彩蛋·项目变天', seq:1, type:'egg', terrain:null, prereq:null, next:null, title:'陨星坠落',
      description:'天际划过一道诡异的弧光，一颗陨星坠入你所在的地貌！这是传说中的「项目变天」彩蛋。',
      options:[{label:'挖掘陨核',effect:{text:'你掘出陨核，稀有材料与办公币迸发（材料+20，办公币+50）！',reward:{materials:20,stone:50}}}],
      reward:{}, weight:4 },
    { storyId:'egg_phoenix', chapter:'egg_phoenix', chapterName:'彩蛋·不死鸟', seq:1, type:'egg', terrain:'mountain', prereq:null, next:null, title:'不死鸟现身',
      description:'山巅烈焰翻涌，一只不死鸟自灰烬中重生，凝视着你：「历劫者，可得重生之力。」',
      options:[{label:'接受不死鸟赐福',effect:{text:'历劫重生，某项资质暴涨（随机资质+3，办公币+30）！',reward:{dimRand:3,stone:30}}}],
      reward:{}, weight:3 }
  ];

  /* 拉取后端剧情库（失败留空，用内置兜底） */
  async function loadStories() {
    try { const list = await API.getStories(); if (list && list.length) STORY_DB = list; } catch (e) { STORY_DB = null; }
  }

  /* 统一取出节点，确保 options/reward 为对象（数据库返回的是 JSON 字符串） */
  function getStoryNodes() {
    const src = STORY_DB || STORY_FALLBACK;
    return src.map(function (n) {
      let options = n.options, reward = n.reward;
      if (typeof options === 'string') { try { options = JSON.parse(options); } catch (e) { options = []; } }
      if (typeof reward === 'string') { try { reward = JSON.parse(reward); } catch (e) { reward = {}; } }
      return Object.assign({}, n, { options: options, reward: reward });
    });
  }

  function pickWeighted(arr) {
    const total = arr.reduce(function (s, n) { return s + (n.weight || 10); }, 0);
    let r = Math.random() * total;
    for (const n of arr) { r -= (n.weight || 10); if (r <= 0) return n; }
    return arr[arr.length - 1];
  }

  function availableStoryNodes(terr) {
    const S = ST.S, t = terr ? terr.id : null;
    return getStoryNodes().filter(function (n) {
      if (n.type !== 'story') return false;
      if (n.terrain && n.terrain !== t) return false;
      if (n.prereq && S.story.done.indexOf(n.prereq) < 0) return false;
      if (S.story.done.indexOf(n.storyId) >= 0) return false;
      return true;
    });
  }
  function availableEggNodes(terr) {
    const S = ST.S, t = terr ? terr.id : null;
    return getStoryNodes().filter(function (n) {
      if (n.type !== 'egg') return false;
      if (n.terrain && n.terrain !== t) return false;
      if (S.story.eggs.indexOf(n.storyId) >= 0) return false;
      return true;
    });
  }

  /* 结算剧情奖励：{materials,runes,spirit,stone,xp,dimRand,def} → 文本数组 */
  function applyStoryReward(r) {
    const S = ST.S, g = [];
    if (r.materials) { S.inventory.materials += r.materials; ST.addMat('ht', r.materials); g.push('黑铁精+' + r.materials); }
    if (r.runes) { for (let i = 0; i < r.runes; i++) ST.addRune(); g.push('符文+' + r.runes); }
    if (r.spirit) { S.stone += r.spirit; g.push('办公币+' + r.spirit); }
    if (r.stone) { S.stone += r.stone; g.push('办公币+' + r.stone); }
    if (r.def) { S.dims.def += r.def; g.push('防御+' + r.def); }
    if (r.dimRand) { const d = C.DIMS[ri(0, 4)]; S.dims[d.key] += r.dimRand; g.push(`${d.name}+${r.dimRand}`); }
    if (r.xp) { const lv = ST.gainXp(r.xp); g.push('经验+' + r.xp + (lv ? '（升' + lv + '级）' : '')); }
    return g;
  }

  /* 玩家选择剧情/彩蛋选项 → 推进进度、结算奖励 */
  function resolveStory(storyId, optIdx) {
    const S = ST.S;
    const node = getStoryNodes().find(function (n) { return n.storyId === storyId; });
    if (!node) return { text: '剧情节点不存在', reward: null };
    const opt = (node.options || [])[optIdx];
    if (!opt) return { text: '选项无效', reward: null };
    const eff = opt.effect || {};
    let gained = [];
    if (eff.reward) gained = gained.concat(applyStoryReward(eff.reward));
    if (node.reward) gained = gained.concat(applyStoryReward(node.reward));
    if (eff.flag) S.story.flags[eff.flag] = true;
    const next = (eff.next != null) ? eff.next : node.next;
    if (node.type === 'egg') { if (S.story.eggs.indexOf(storyId) < 0) S.story.eggs.push(storyId); }
    else { if (S.story.done.indexOf(storyId) < 0) S.story.done.push(storyId); }
    let chapterDone = false;
    if (node.type === 'story') {
      const chNodes = getStoryNodes().filter(function (n) { return n.chapter === node.chapter; });
      if (chNodes.length && chNodes.every(function (n) { return S.story.done.indexOf(n.storyId) >= 0; })) {
        chapterDone = node.chapterName || node.chapter;
      }
    }
    ST.save();
    return { text: eff.text || '你做出了选择。', reward: gained, chapterDone: chapterDone, next: next };
  }

  /* ---------- 探索一步 ---------- */
  async function explore(terrainId) {
    const S = ST.S;
    if (S.stamina < C.STAMINA_PER_EXPLORE) return { ok: false, msg: '体力不足' };
    if (S.exploreCount >= C.EXPLORE_DAILY_LIMIT) {
      return { ok: false, needTalisman: true, msg: '今日外出探索次数已用完（' + S.exploreCount + '/' + C.EXPLORE_DAILY_LIMIT + '）' };
    }
    const checkpoint = JSON.stringify(S);
    let mutationAcquired = false;
    try {
      // Acquire before any random roll or inventory mutation. Most exploration
      // results become one normal debounced save; a clue result upgrades this
      // same lease into an atomic personal-save + shared-world transaction.
      await API.beginMutation();
      mutationAcquired = true;
    S.stamina -= C.STAMINA_PER_EXPLORE;
    S.exploreCount++;
    S.stats.exploreTotal++;

    const terr = C.TERRAINS.find(t => t.id === terrainId) || C.TERRAINS[0];
    const storyNodes = availableStoryNodes(terr);
    const eggNodes = availableEggNodes(terr);
    // 加权事件
    const w = {};
    Object.keys(C.EVENT_WEIGHTS).forEach(k => { w[k] = C.EVENT_WEIGHTS[k] * (terr.eventBias[k] || 1); });
    if (storyNodes.length) w.story = STORY_WEIGHT * (terr.eventBias.story || 1);
    if (eggNodes.length) w.egg = EGG_WEIGHT * (terr.eventBias.egg || 1);
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    let r = Math.random() * total, ev = 'adventure';
    for (const k of Object.keys(w)) { r -= w[k]; if (r <= 0) { ev = k; break; } }

    const res = { ok: true, event: ev, terrain: terr };
    if (ev === 'fight') {
      res.enemy = Combat.makeMonster(S.level, terrainId);
    } else if (ev === 'treasure') {
      const luck = S.dims.luc;
      const tier = C.tierOf(S.level);
      const good = Math.random() < Math.min(0.85, 0.4 + luck * 0.01);
      // 黑铁精（基础主材）——宝箱单独结算，不再叠加 dropExploreMaterials，避免重复计数
      const mat = ri(2, 6) + (good ? ri(1, 3) : 0);
      ST.addMat('ht', mat);                          // §8 宝箱产出锻造材料（黑铁精）
      S.inventory.materials += Math.floor(mat / 2);   // 兼容旧精炼系统
      const matList = ['黑铁精+' + mat];
      // 灵金阶主材：2 档起概率出（赤铜精金/灵麻布/月华玉髓），3 档起可出更高档（玄铁/元钨/幽蓝/月隐/神纹晶）
      if (tier >= 2 && Math.random() < Math.min(0.7, 0.3 + luck * 0.005)) {
        const lowOpts = ['ct', 'lm', 'yh', 'qw', 'sh', 'py'];
        const k = lowOpts[Math.floor(Math.random() * lowOpts.length)];
        const n = ri(1, 3); ST.addMat(k, n); S.inventory.materials += n; matList.push(C.EQUIP.MATS[k].name + '+' + n);
      }
      if (tier >= 3 && Math.random() < Math.min(0.7, 0.25 + luck * 0.005)) {
        const hiOpts = ['bl', 'yw', 'yl', 'yh', 'sl', 'wj'];
        const k = hiOpts[Math.floor(Math.random() * hiOpts.length)];
        const n = ri(1, 3); ST.addMat(k, n); S.inventory.materials += n; matList.push(C.EQUIP.MATS[k].name + '+' + n);
      }
      // 至尊神料（高阶解锁后）
      if (ST.highUnlocked() && Math.random() < C.TUNE.highMatChance) {
        const k = ['xlg', 'yhs', 'kong', 'zs'][Math.floor(Math.random() * 4)];
        const n = ri(1, 2); ST.addMat(k, n); matList.push(C.EQUIP.MATS[k].name + '+' + n);
      }
      let runeTxt = '';
      if (good && Math.random() < 0.3) { ST.addRune(); runeTxt = '，符文 +1'; }
      // 淬体丹（永久+1，不可购买）：稀有开出来，概率随气运提升（约 4%~15%）
      const pillChance = Math.min(0.15, 0.04 + luck * 0.002);
      let pillTxt = '';
      if (Math.random() < pillChance) { res.needDim = true; pillTxt = '，🎁淬体丹×1（选维永久+1）'; }
      res.text = `发现宝箱：黑铁精 +${mat}` + runeTxt + pillTxt + (good ? '（好运！）' : '');
      res.reward = {};
      res.matGained = matList;             // 本次锻造材料（带类型，供结果展示）
    } else if (ev === 'train') {
      // 灵气修炼：维度经验
      const xp = ri(8, 20) + Math.round(S.level * 0.5);
      const lv = ST.gainXp(xp);
      res.text = `灵气修炼，获得经验 +${xp}` + (lv ? `，升 ${lv} 级！` : '');
      res.reward = { xp, leveled: lv };
    } else if (ev === 'clue') {
      // 通道线索（指向当前可推的层）
      const target = S.layers.find(l => l.status === 'open') || S.layers.find(l => l.status === 'cleared');
      const k = target ? target.layer : 1;
      const before = S.layers[k - 1].clues;
      S.layers[k - 1].clues++;
      res.text = `发现「通道线索」×1（第 ${k} 层线索 ${before} → ${S.layers[k - 1].clues}）`;
      res.reward = { clue: k };
    } else if (ev === 'realm') {
      res.text = '发现秘境入口！可前往秘境工坊挑战。';
      res.realmHint = true;
    } else if (ev === 'story') {
      const node = pickWeighted(storyNodes);
      res.node = { storyId: node.storyId, title: node.title, desc: node.description, options: node.options, type: 'story' };
    } else if (ev === 'egg') {
      const node = pickWeighted(eggNodes);
      res.node = { storyId: node.storyId, title: node.title, desc: node.description, options: node.options, type: 'egg' };
    } else { // adventure 奇遇
      res.choices = makeAdventure(terr);
    }
    // 探索掉落：改为锻造材料（§8.6 不再掉落成品装备）
    // 统一收集本次获得的「带类型」材料与图纸，交由 UI 单独展示（避免只在文本里一闪而过）
    res.matGained = res.matGained || [];
    res.bpGained = res.bpGained || [];
    if (ev !== 'fight' && ev !== 'realm' && ev !== 'story' && ev !== 'egg' && ev !== 'treasure') {
      const mg = dropExploreMaterials();
      if (mg.length) res.matGained = res.matGained.concat(mg);
    }
    const bg = []; dropBlueprint(bg, C.TUNE.bpExploreRate);
    if (bg.length) res.bpGained = res.bpGained.concat(bg);
    ST.save();
    if (res.reward && res.reward.clue) {
      const layer = res.reward.clue;
      const nl = await API.postClue(layer);
      syncLayer(nl);
      res.text = `发现「通道线索」×1（第 ${layer} 层全服线索已达 ${nl.clues}）`;
    }
    return res;
    } catch (e) {
      if (!mutationAcquired && e && e.code === 'DEMON_TOWER_SOURCE_MUTATION_IN_PROGRESS') {
        return { ok: false, msg: '上一项全服操作仍在确认，请稍候' };
      }
      ST.restoreSnapshot(checkpoint);
      try { ST.applyLayers(await API.getLayers()); } catch (_) {}
      return { ok: false, msg: '探索结果未能安全保存，本次行动已回滚，请重试' };
    } finally {
      if (mutationAcquired) API.endMutation();
    }
  }

  function makeAdventure(terr) {
    const S = ST.S;
    const luck = S.dims.luc;
    const pool = [
      { t: '神秘老者', opt: [
        { label: '求赐教（随机一维 +2）', fn: () => { const d = C.DIMS[ri(0,4)]; S.dims[d.key]+=2; return `老者传授，${d.name} +2`; } },
        { label: '婉拒离开', fn: () => '你躬身告退，平安离开。' }
      ]},
      { t: '残破祭坛', opt: [
        { label: '献祭材料换办公币', fn: () => { if (S.inventory.materials>=3){S.inventory.materials-=3; const g=ri(10,30); S.stone+=g; return `献祭材料，得办公币 +${g}`;} return '材料不足，悻悻而归。'; } },
        { label: '强行破阵（赌伤势）', fn: () => { if (Math.random()<0.5){const g=ri(20,50);S.stone+=g;return `破阵成功，办公币 +${g}`;} S.injury=Math.min(3,S.injury+1); return '阵法反噬，受伤 +1'; } }
      ]},
      { t: '流浪商人', opt: [
        { label: '花 20 办公币买情报', fn: () => { if (S.stone>=20){S.stone-=20; return '商人透露了层守弱点（战力评估已更新）。';} return '囊中羞涩。'; } },
        { label: '无视', fn: () => '你绕道而行。' }
      ]}
    ];
    const base = pool[ri(0, pool.length - 1)];
    // 幸运提升正面权重
    return { title: base.t, options: base.opt };
  }

  function resolveAdventure(choiceFn) {
    const S = ST.S;
    const txt = choiceFn();
    ST.save();
    return txt;
  }

  /* ---------- 秘境 §7.2 ---------- */
  function secretRealm(id) {
    const S = ST.S;
    const r = C.SECRET_REALMS.find(x => x.id === id);
    if (!r) return { ok: false, msg: '无此秘境' };
    if (S.talisman < r.cost) return { ok: false, msg: '探索符不足' };
    if (S.level < r.lvRange[0] || S.level > r.lvRange[1]) return { ok: false, msg: '等级不符' };
    S.talisman -= r.cost;
    S.stats.realmTotal++;
    // 评级抽样
    const tiers = Object.keys(r.drop);
    const total = tiers.reduce((s, t) => s + r.drop[t], 0);
    let x = Math.random() * total, tier = '凡';
    for (const t of tiers) { x -= r.drop[t]; if (x <= 0) { tier = t; break; } }
    const gained = [];   // 本次获得的「带名称」材料明细，供结算弹窗逐项展示
    function give(k, n) {
      n = Math.round(n * mineMult());
      ST.addMat(k, n);
      gained.push(((C.EQUIP.MATS[k] || {}).name || k) + '+' + n);
    }
    let reward = null;
    if (tier === '凡' || tier === '良') {
      const mat = ri(2, 6); give('ht', mat); reward = { tier, materials: mat };
    } else if (tier === '灵') {
      const m = ri(2, 5); give('ct', m);
      reward = { tier, materials: m };
    } else if (tier === '宝') {
      const m = ri(2, 4); give(['ct', 'bl', 'yw', 'yl', 'yh', 'sl', 'wj'][Math.floor(Math.random() * 7)], m);
      reward = { tier, materials: m };
    } else if (tier === '仙') {
      // 灵金主材（仙金仅妖塔第 9 层 Boss，秘境不出）+ 至尊神料辅料（仍可能掉落仙金？否）
      const m1 = ri(2, 4); give(['ct', 'bl', 'yw', 'yl', 'yh', 'sl', 'wj'][Math.floor(Math.random() * 7)], m1);
      const m2 = ri(1, 3); give(['xlg', 'yhs', 'kong', 'zs'][Math.floor(Math.random() * 4)], m2);
      if (Math.random() < 0.2) { const dg = ri(1, 1); give('daoyg', dg); }
      let jin = false;       if (Math.random() < C.TUNE.jinchiSecretRate) { ST.addJinchi(1); gained.push('🔴烬赤源核+1'); jin = true; }
      const bg = []; dropBlueprint(bg, C.TUNE.bpSecretRate);
      reward = { tier, materials: m1 + m2, ...(jin ? { jinchi: 1 } : {}), ...(bg.length ? { blueprints: bg } : {}) };
    }
    ST.save();
    return { ok: true, tier, reward, matGained: gained };
  }

  /* ---------- 推塔（Boss 血池） §4.1/4.2 ---------- */
  function bossGate(layer) {
    const S = ST.S;
    const need = 15 * layer;
    const selfOk = S.level >= need;
    const serverOk = ST.countAtLevel(need) >= need;
    return { need, selfOk, serverOk, ready: selfOk && serverOk };
  }

  /* 用后端返回的层状态覆盖本地（全服共享，保持各端一致） */
  function syncLayer(nl) {
    if (!nl) return;
    const i = (nl.layerId != null ? nl.layerId : nl.layer) - 1;
    if (i < 0 || i >= ST.S.layers.length) return;
    const L = ST.S.layers[i];
    if (nl.status) L.status = nl.status;
    if (nl.bossHp != null) L.bossHp = nl.bossHp;
    if (nl.bossMaxHp != null) L.bossMaxHp = nl.bossMaxHp;
    if (nl.channel != null) L.channel = nl.channel;
    if (nl.channelGoal != null) L.channelGoal = nl.channelGoal;
    if (nl.clues != null) L.clues = nl.clues;
    ST.save();
  }

  async function bossAttack(layer) {
    const S = ST.S;
    const gate = bossGate(layer);
    if (!gate.ready) return { ok: false, gate };
    if (S.stamina < C.STAMINA_PER_BOSS) return { ok: false, msg: '体力不足（需 ' + C.STAMINA_PER_BOSS + '）' };
    if (S.bossCount >= C.BOSS_DAILY_LIMIT) return { ok: false, msg: '今日妖塔 BOSS 次数已用完（' + S.bossCount + '/' + C.BOSS_DAILY_LIMIT + '）' };
    const L = S.layers[layer - 1];
    if (L.bossHp <= 0) return { ok: false, msg: '该层已通关' };
    const checkpoint = JSON.stringify(S);
    let mutationAcquired = false;
    try {
      await API.beginMutation();
      mutationAcquired = true;
      S.stamina -= C.STAMINA_PER_BOSS;
      S.bossCount++;
      const before = L.bossHp;
      const bs = C.bossStats(layer);
      const firstClear = L.status !== 'cleared';
      const enemy = { name: bs.name, dims: { str: bs.str, spd: bs.spd, agi: bs.agi, def: bs.def, luc: bs.luc },
        maxHp: bs.maxHp, hp: L.bossHp, isBoss: true, layer, level: bs.level, bossDefStat: bs.defStat };
      const res = Combat.run({ enemy, isBoss: true, layer, firstClear });
      const dmg = Math.max(0, before - L.bossHp);
      // §8.6 推塔掉落锻造材料（Boss 血池战斗，每次均掉落；高层/世界Boss 概率掉烬赤源核）
      const matGained = dropBossMaterials(layer);
      const bpGained = []; dropBlueprint(bpGained, layer >= 6 ? C.TUNE.bpBossHighRate : C.TUNE.bpBossLowRate);
      // 击败只进入通道建设阶段；下一层由服务端确认通道完成后解锁。
      if (L.bossHp <= 0) { L.status = 'cleared'; res.cleared = true; }
      ST.save();
      // 只有服务端确认后才提交本次角色与掉落存档。
      const nl = await API.postDamage(layer, dmg);
      syncLayer(nl);
      // 本地战斗演算不能宣布全服首领通关；以后端血池状态为准。
      res.cleared = nl.status === 'cleared' || nl.bossHp <= 0;
      return { ok: true, combat: res, gate, dmg, matGained, bpGained };
    } catch (e) {
      if (!mutationAcquired && e && e.code === 'DEMON_TOWER_SOURCE_MUTATION_IN_PROGRESS') {
        return { ok: false, msg: '上一项全服操作仍在确认，请稍候' };
      }
      ST.restoreSnapshot(checkpoint);
      try { ST.applyLayers(await API.getLayers()); } catch (_) {}
      return { ok: false, msg: '全服进度未确认，本次行动已回滚，请重试' };
    } finally {
      if (mutationAcquired) API.endMutation();
    }
  }

  /* ---------- 神秘通道建设 §4.5 ---------- */
  async function channelDonate(layer, materials) {
    const S = ST.S;
    const L = S.layers[layer - 1];
    if (L.status !== 'cleared') return { ok: false, msg: '需先通关本层 Boss' };
    if (L.channel >= L.channelGoal) {
      try { ST.applyLayers(await API.getLayers()); } catch (_) {}
      if (layer < 9 && S.layers[layer].status !== 'locked') return { ok: true, unlocked: layer + 1, msg: '通道已建成，第 ' + (layer + 1) + ' 层已解锁！' };
      return { ok: false, msg: '已是最顶层或已解锁' };
    }
    const give = Math.min(materials, S.inventory.materials);
    if (give <= 0) return { ok: false, msg: '材料不足' };
    const checkpoint = JSON.stringify(S);
    let mutationAcquired = false;
    try {
      await API.beginMutation();
      mutationAcquired = true;
      S.inventory.materials -= give;
      L.channel += give;
      ST.save();
      // 只有服务端确认后才提交扣料和解锁。
      const nl = await API.postChannel(layer, give);
      const accepted = Number.isInteger(nl.accepted) ? Math.max(0, Math.min(give, nl.accepted)) : give;
      if (accepted < give) S.inventory.materials += give - accepted;
      syncLayer(nl);
      // 下一层是否开放完全以后端原子回执为准；随后 UI 会刷新完整层列表。
      const unlocked = Number.isInteger(nl.unlockedLayer) ? nl.unlockedLayer : null;
      return { ok: true, give: accepted, progress: L.channel / L.channelGoal, unlocked: unlocked };
    } catch (e) {
      if (!mutationAcquired && e && e.code === 'DEMON_TOWER_SOURCE_MUTATION_IN_PROGRESS') {
        return { ok: false, msg: '上一项全服操作仍在确认，请稍候' };
      }
      ST.restoreSnapshot(checkpoint);
      try { ST.applyLayers(await API.getLayers()); } catch (_) {}
      return { ok: false, msg: '全服进度未确认，本次捐献已回滚，请重试' };
    } finally {
      if (mutationAcquired) API.endMutation();
    }
  }

  /* ---------- 好友切磋 §7.3 ---------- */
  function friendSpar(friendId) {
    const S = ST.S;
    const f = S.friends.find(x => x.id === friendId);
    if (!f) return { ok: false, msg: '无此好友' };
    if (S.stamina < C.STAMINA_PER_SPAR) return { ok: false, msg: '体力不足（切磋需 ' + C.STAMINA_PER_SPAR + '）' };
    S.stamina -= C.STAMINA_PER_SPAR;
    const fLv = Math.max(1, S.level + f.off);
    // 以玩家有效五维为锚，按 off 浮动（off 越大越难），让切磋有赢有输、可当练手
    const pd = ST.effectiveDims({ equip: true });
    const scale = 1 + f.off * 0.08;            // off∈[-3,4] → 敌方五维 0.76~1.32 倍
    const dims = {};
    C.DIMS.forEach(d => { dims[d.key] = Math.max(1, Math.round((pd[d.key] || 10) * scale)); });
    const maxHp = 100 + S.level * 8 + dims.def * 2;
    const enemy = { name: f.name, dims, maxHp, hp: maxHp, isBoss: false, isSpar: true, level: fLv, bossDefStat: 0 };
    const res = Combat.run({ enemy, isSpar: true });
    // 经验
    if (res.win) {
      const gap = Math.max(0, fLv - S.level);
      let xp = 30 + Math.min(40, gap * 3);
      if (gap >= 10) xp += 11;
      const lv = ST.gainXp(xp);
      res.rewards = { xp, leveled: lv, stamina: C.STAMINA_PER_SPAR };
    } else {
      const lv = ST.gainXp(8);
      res.rewards = { xp: 8, leveled: lv, stamina: C.STAMINA_PER_SPAR };
    }
    ST.save();
    return { ok: true, combat: res, friend: f };
  }

  global.World = { explore, resolveAdventure, secretRealm, bossGate, bossAttack,
    channelDonate, friendSpar, loadStories, resolveStory };
})(window);
