/* =========================================================================
 * 九层妖塔 · 抽取系统 (gacha.js)  §5.4 概率 / 保底；§5.3 +N 品质
 * ========================================================================= */
(function (global) {
  'use strict';
  const C = global.CFG, ST = global.ST;

  function weightedPick(list, wf) {
    const total = list.reduce((s, x) => s + wf(x), 0);
    let r = Math.random() * total;
    for (const x of list) { r -= wf(x); if (r <= 0) return x; }
    return list[list.length - 1];
  }

  /* 升级抽取 §9.1：每升 1 级免费随机 1 发——40% 材料 / 60% 天赋；
     武器品质由等级档位决定（§5.4）；天赋按领悟等级解锁，重复领悟+1 级、满级转化为天赋点 */
  function grantRandom() {
    if (Math.random() < 0.40) {
      // §8 升级不再掉成品武器，改为掉落锻造材料（旧「预设武器」系统已由打造工作台取代）
      const S = ST.S, tier = C.tierOf(S.level), mats = {};
      const t1 = ri(4, 10); ST.addMat('ht', t1); mats.ht = t1;
      if (tier >= 2 && Math.random() < 0.7) { const n = ri(2, 6); ST.addMat('ct', n); mats.ct = n; }
      if (tier >= 3 && Math.random() < 0.5) { const n = ri(1, 4); const k = ['lh', 'hx', 'dj', 'wj', 'yl'][Math.floor(Math.random() * 5)]; ST.addMat(k, n); mats[k] = n; }
      if (ST.highUnlocked() && Math.random() < 0.2) { const n = ri(1, 2); const k = ['xlg', 'yhs', 'kong', 'zs'][Math.floor(Math.random() * 4)]; ST.addMat(k, n); mats[k] = n; }
      ST.save();
      return { kind: 'mat', name: '锻造材料', mats: mats };
    }
    const pool = C.TALENTS.filter(t => t.learnLv <= ST.S.level);
    const t = pool.length ? pool[Math.floor(Math.random() * pool.length)] : C.TALENTS[0];
    const res = ST.addTalent(t.id);
    return { kind: 'talent', icon: t.icon, name: t.name, cat: t.cat, desc: t.desc, eff: t.eff,
      max: t.max, dup: res.dup, plus: res.plus, converted: res.converted, jing: res.jing };
  }

  /* 获取途径预览（装备页）：仅展示天赋解锁进度 */
  function oddsPreview() {
    const tier = C.tierOf(ST.S.level);
    const lv = ST.S.level;
    const talOpen = C.TALENTS.filter(t => t.learnLv <= lv).length;
    const nextTal = C.TALENTS.reduce((m, t) => t.learnLv > lv ? Math.min(m, t.learnLv) : m, 999);
    return { tier: tier, talOpen: talOpen, talTotal: C.TALENTS.length, nextTal: nextTal };
  }

  /* 开箱：仅符文箱 */
  function openBox(kind) {
    const k = C.RUNE_POOL[ri(0, C.RUNE_POOL.length - 1)];
    return { runeKind: k, runeName: C.RUNE_KINDS[k].name, runeDesc: C.RUNE_KINDS[k].desc };
  }

  function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

  global.Gacha = { openBox, grantRandom, oddsPreview };
})(window);
