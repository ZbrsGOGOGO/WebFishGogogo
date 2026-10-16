/* =========================================================================
 * 九层妖塔 · 商店 (shop.js)  §6.2 物资库 / 秘市
 * ========================================================================= */
(function (global) {
  'use strict';
  const C = global.CFG, ST = global.ST;

  function curName(c) { return '办公币'; }
  function curVal(c) { return ST.S.stone; }
  function curAdd(c, v) { ST.S.stone += v; }

  function boughtCount(item) {
    const S = ST.S;
    S._supplyBought = S._supplyBought || {};
    S._weekBought = S._weekBought || {};
    S._dayBought = S._dayBought || {};
    if (item.week) return S._weekBought[item.id] || 0;
    if (item.day) return S._dayBought[item.id] || 0;
    return S._supplyBought[item.id] || 0;
  }

  function buy(item) {
    const S = ST.S;
    const cnt = boughtCount(item);
    if (item.limit && cnt >= item.limit) return { ok: false, msg: '已达购买上限' };
    if (curVal(item.cur) < item.price) return { ok: false, msg: curName(item.cur) + '不足' };
    curAdd(item.cur, -item.price);
    if (item.week) { S._weekBought[item.id] = (S._weekBought[item.id] || 0) + 1; }
    else if (item.day) { S._dayBought[item.id] = (S._dayBought[item.id] || 0) + 1; }
    else { S._supplyBought[item.id] = (S._supplyBought[item.id] || 0) + 1; }

    const g = item.gain;
    if (g.stamina) S.stamina = Math.min(S.staminaMax, S.stamina + g.stamina);
    if (g.materials) S.inventory.materials += g.materials;
    if (g.mat) { for (const k in g.mat) { S.mat[k] = (S.mat[k] || 0) + g.mat[k]; } }
    if (g.injuryClear) S.injury = 0;
    if (g.pill) { ST.save(); return { ok: true, needPill: true, item }; }
    if (g.dimPerm) { ST.save(); return { ok: true, needDim: true, item }; }
    if (g.daoYun) S.daoYun += g.daoYun;
    if (g.box) {
      const r = Gacha.openBox(g.box);
      ST.addRune(r.runeKind);
      ST.save();
      return { ok: true, box: 'rune', result: r };
    }
    ST.save();
    return { ok: true };
  }

  global.Shop = { buy, curName, curVal, boughtCount };
})(window);
