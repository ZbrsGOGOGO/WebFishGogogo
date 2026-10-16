/* =========================================================================
 * 九层妖塔 · 战斗引擎 (combat.js)  §2.4 五维回合制
 * 纯客户端模拟，返回逐回合日志与结算。Boss 血池跨场保留（写入 S.layers）。
 * ========================================================================= */
(function (global) {
  'use strict';
  const C = global.CFG, ST = global.ST;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function ri(a, b) { return Math.floor(rnd(a, b + 1)); }

  /* 玩家战斗快照 */
  function playerSnapshot(opts) {
    const S = ST.S;
    const ed = ST.effectiveDims({ equip: true });
    let critRune = 0, bonusHp = 0;
    const weapon = null, faqi = null;
    // 天赋加成 §9.2：属性类进五维，生命进上限
    const tal = {};
    (S.talents || []).forEach(t => { tal[t.id] = t.lv; });
    ed.str += (tal.tStr || 0) + (tal.tAll || 0);
    ed.agi += (tal.tAgi || 0) + (tal.tAll || 0);
    ed.spd += (tal.tSpd || 0) + (tal.tAll || 0);
    const maxHp = 100 + S.level * 8 + ed.def * 2 + bonusHp + 5 * (tal.tHp || 0);
    const qiMax = 14 + (tal.tStr || 0) + (tal.tAgi || 0) + (tal.tSpd || 0) + (tal.tHp || 0) + (tal.tAll || 0);
    const player = { name: S.name, dims: ed, level: S.level, maxHp, hp: maxHp, weapon, faqi, tal,
      destiny: S.destiny, str: ed.str, spd: ed.spd, agi: ed.agi, def: ed.def, luc: ed.luc, critRune: critRune,
      qi: 0, qiMax, qiRegen: 2, qiShield: 0,
      diLi: 0, jiFeng: 0, fengJin: 0, chanJin: 0, leiZhi: 0, cuoL: 0, youSi: 0, lueY: 0,
      tuYu: false, shiYuan: 0, xvYing: 0, suppressWeapon: 0, noConsumeQi: 0, passiveDelay: 0,
      nixiCost: 2, chainedFirst: false, stealQiNext: false, qiStop: 0, noQiGainNext: false,
      ghostTurns: 0, stealDeb: false, _cd: {}, _tu: {}, dodgeBuff: 0, hitDebuff: 0, critBuff: 0,
      dodgeBonus: 0, reduction: 0, lifesteal: 0, affixDefPct: 0, setDefPct: 0, reduAll: 0, reflect: 0, ignoreDefHit: 0,
      enemyAtkDown: 0, dodgeFollowup: 0, atkStackEnabled: false, atkStackMax: 3, atkStackMul: 1, atkStacks: 0,
      survive1: false, surviveThreshold: 0, shieldStart: 0, debuffHalf: 0, daozheDmg: 0, killAtkUp: 0,
      fenjiProc: 0, fenjiMul: 0, zdIgnoreDefChance: 0, zdIgnoreDefPct: 0, zdDispelChance: 0,
      setBonus: null, activeSet: null, _survived: false, _dodgeAtkBonus: 0, _defDownHit: 1 };
    ST.applyEquipToPlayer(player, ST.S);
    ST.applySectToPlayer(player, ST.S);   // §8 穿戴装备覆盖武器并叠加词条/符文
    ST.applyGongfaToPlayer(player, ST.S, { isSpar: opts && opts.isSpar });  // §11 功法（仅1套生效）
    // 功法五维并入后刷新顶层属性（strike 直接读取顶层 str/spd/agi/def/luc）
    player.str = player.dims.str; player.spd = player.dims.spd; player.agi = player.dims.agi;
    player.def = player.dims.def; player.luc = player.dims.luc;
    return player;
  }

  /* 从任意存档计算有效五维（好友/怪物通用，不依赖全局 S） */
  function dimsOf(save, opts) {
    const dims = (save && save.dims) || { str: 10, spd: 10, agi: 10, def: 10, luc: 10 };
    const d = {};
    C.DIMS.forEach(x => {
      const base = dims[x.key] || 0;
      const perm = (save.dimPerm && save.dimPerm[x.key]) || 0;
      const pill = (save.inventory && save.inventory.pills && save.inventory.pills[x.key]) || 0;
      d[x.key] = base + perm + pill;
    });
    (save.destiny || []).forEach(g => { if (['str', 'spd', 'agi', 'def', 'luc'].indexOf(g) >= 0) d[g] += 8; });
    return d;
  }

  /* 从经过本站裁剪的好友档案构造异步切磋角色。 */
  function snapshotFromSave(save) {
    save = save || {};
    const ed = dimsOf(save, { equip: true });
    let critRune = 0, bonusHp = 0;
    const weapon = null, faqi = null;
    const tal = {};
    (save.talents || []).forEach(t => { tal[t.id] = t.lv; });
    ed.str += (tal.tStr || 0) + (tal.tAll || 0);
    ed.agi += (tal.tAgi || 0) + (tal.tAll || 0);
    ed.spd += (tal.tSpd || 0) + (tal.tAll || 0);
    const maxHp = 100 + (save.level || 1) * 8 + ed.def * 2 + bonusHp + 5 * (tal.tHp || 0);
    const qiMax = 14 + (tal.tStr || 0) + (tal.tAgi || 0) + (tal.tSpd || 0) + (tal.tHp || 0) + (tal.tAll || 0);
    const enemy = { name: save.name || '对手', isPlayer: false, dims: ed, level: save.level || 1, maxHp, hp: maxHp, weapon, faqi, tal,
      destiny: save.destiny || [], str: ed.str, spd: ed.spd, agi: ed.agi, def: ed.def, luc: ed.luc, critRune: critRune,
      qi: 0, qiMax, qiRegen: 2, qiShield: 0,
      diLi: 0, jiFeng: 0, fengJin: 0, chanJin: 0, leiZhi: 0, cuoL: 0, youSi: 0, lueY: 0,
      tuYu: false, shiYuan: 0, xvYing: 0, suppressWeapon: 0, noConsumeQi: 0, passiveDelay: 0,
      nixiCost: 2, chainedFirst: false, stealQiNext: false, qiStop: 0, noQiGainNext: false,
      ghostTurns: 0, stealDeb: false, _cd: {}, _tu: {}, dodgeBuff: 0, hitDebuff: 0, critBuff: 0,
      dodgeBonus: 0, reduction: 0, lifesteal: 0, affixDefPct: 0, setDefPct: 0, reduAll: 0, reflect: 0, ignoreDefHit: 0,
      enemyAtkDown: 0, dodgeFollowup: 0, atkStackEnabled: false, atkStackMax: 3, atkStackMul: 1, atkStacks: 0,
      survive1: false, surviveThreshold: 0, shieldStart: 0, debuffHalf: 0, daozheDmg: 0, killAtkUp: 0,
      fenjiProc: 0, fenjiMul: 0, zdIgnoreDefChance: 0, zdIgnoreDefPct: 0, zdDispelChance: 0,
      setBonus: null, activeSet: null, _survived: false, _dodgeAtkBonus: 0, _defDownHit: 1 };
    ST.applyEquipToPlayer(enemy, save);    // §8 穿戴装备（好友存档通常无，安全跳过）
    return enemy;
  }

  /* 一次攻击结算（围绕「气机」资源重制 §2.4） */
  function strike(att, attWeapon, defSide, def, opts) {
    opts = opts || {};
    const T = att.tal || {}, DT = def.tal || {};
    let dmg, blocked = false, canceled = false, counter = 0, reflect = 0;
    const notes = [];
    const canConsume = (s) => (s.noConsumeQi || 0) <= 0 && (s.passiveDelay || 0) <= 0;

    // —— 玄力铸筋：地力满 3，下一击撕裂气脉（延迟敌方被动 1 回合），无伤害 ——
    if (T.tStr && att.diLi >= 3) {
      att.diLi = 0;
      def.passiveDelay = Math.max(def.passiveDelay || 0, 1);
      notes.push('  🪨【玄力铸筋】地力满盈，撕裂对方气脉，被动延迟 1 回合！');
      return { dodged: false, dmg: 0, crit: false, blocked: false, tear: true, notes };
    }
    // —— 锋器通悟：锋劲满 3，下一击无视敌方一半气垣格挡；满重抑制对手武器武势 ——
    let ignoreHalfBlock = false;
    if (T.tWeapon && att.fengJin >= 3) {
      att.fengJin = 0; ignoreHalfBlock = true;
      if (T.tWeapon >= 5) def.suppressWeapon = Math.max(def.suppressWeapon || 0, 1);
    }

    // —— 心兆逆击（受击方 preempt 反击，取消本次攻击）——
    if (DT.tCounter && canConsume(def) && def.qi >= def.nixiCost &&
        (def.stun || 0) <= 0 && Math.random() < 0.4 + 0.1 * DT.tCounter) {
      def.qi -= def.nixiCost; def.nixiCost = Math.min(def.nixiCost + 3, 8);
      counter = Math.max(1, Math.round(def.str * 0.6 + def.agi * 0.3));
      att.hp -= counter;
      notes.push(`  🔮【心兆逆击】${def.name} 抢先逆击 -${counter} HP，取消你的攻势！`);
      return { dodged: false, dmg: 0, crit: false, blocked: false, canceled: true, counter, notes };
    }

    // 证道武器·道威：攻击有概率驱散敌方 1 层套装增益
    if (att.zdDispelChance && def.setBonus && Math.random() < att.zdDispelChance) {
      dispelSet(def); notes.push(`  🔱【道威】${att.name} 驱散 ${def.name} 的套装增益！`);
    }
    // 伤害计算
    if (attWeapon) {
      dmg = att.str * 0.7 + att.agi * 0.2;
      const starMul = 1 + (attWeapon.star - 1) * 0.1;
      const plusMul = 1 + (attWeapon.plus || 0) * 0.1;
      dmg *= starMul * plusMul;
      if (attWeapon.runeAtkMul) dmg *= attWeapon.runeAtkMul;   // 符文/洗练攻击%
      if (att.ghostTurns > 0) dmg *= 1.10;                     // 残影
      if (att.xvYing > 0) dmg *= 1.10;                         // 虚身残影
      if (att.destiny && att.destiny.includes('arms')) dmg *= 1.2;       // 兵器通神
      if (attWeapon.type === 'str') dmg += att.str * 0.3;
      else if (attWeapon.type === 'spd') dmg += att.spd * 0.3;
      else if (attWeapon.type === 'agi') dmg += att.agi * 0.3;
      else if (attWeapon.type === 'def') dmg += att.def * 0.2;
      else if (attWeapon.type === 'luc') dmg += att.luc * 0.3;
    } else {
      dmg = att.str * 1.2 + att.level * 1.5 + rnd(2, 6);
      if (T.tUnarmed) dmg *= 1 + 0.04 * T.tUnarmed;            // 赤手搏道（小幅）
      if (T.stealDeb) dmg *= 0.8;                              // 被夺械
    }
    // 追猎词条已并入通用增伤，不再单独处理
    // §11 功法：攻击方增益（攻击前结算）
    if (att.gongfa) {
      const g = att.gongfa;
      if (att._dodgeAtkBonus) { dmg *= 1 + att._dodgeAtkBonus; att._dodgeAtkBonus = 0; }   // 诡影·闪避后追伤
      if (g.allDmg) dmg *= 1 + g.allDmg;                                                    // 万象·全伤害+
      if (g.atkHpAbove && att.hp > att.maxHp * g.atkHpAbove.hpPct) dmg *= 1 + g.atkHpAbove.mul; // 荒古·血气增伤
      if (g.bleedBonus && def._bleed) dmg *= 1 + g.bleedBonus;                              // 镇狱·对流血增伤
      if (g.towerBonus && defSide.isBoss) dmg *= 1 + g.towerBonus;                          // 妖塔本源·对塔增伤
      if (g.lowHpStr) dmg += att.str * g.lowHpStr * (1 - att.hp / att.maxHp);               // 蛮兽·血越低力越高
      if (g.huangguBurst && att.hp < att.maxHp * 0.3) dmg *= 1.2;                           // 荒古·圣体爆发
      if (att._enemyDmgDown) dmg *= att._enemyDmgDown;                                      // 镇狱·被压制期间降伤
      if (att._qiCut) dmg *= att._qiCut;                                                    // 幽影·削灵降其攻击
      if (att._openSuppress && !att._openSuppressUsed) { dmg *= att._openSuppress; att._openSuppressUsed = true; } // 镇狱·开局压制
      if (g.perHigherDim) { let n = 0; C.DIMS.forEach(x => { if ((att.dims[x.key] || 0) > (def.dims[x.key] || 0)) n++; }); if (n > 0) dmg *= 1 + g.perHigherDim * n; } // 万象·属性压制
    }
    // 镇岳（单件）/ 风行（每回合攻击叠层）
    if (def.enemyAtkDown) dmg *= 1 - Math.min(0.3, def.enemyAtkDown);   // 镇岳：敌人攻击你时敌方攻击降
    if (att.atkStackMul) dmg *= att.atkStackMul;                        // 风行：每回合攻击叠层
    // 暴击（幸运）
    let critRate = Math.min(0.6, 0.03 + att.luc * 0.006);
    if (att.destiny && att.destiny.includes('agi')) critRate += 0.05;     // 身轻如燕
    if (att.critRune) critRate += att.critRune;
    if (opts.critBuff) critRate += opts.critBuff;
    if (att.gongfa && att.gongfa.lowHpAtkChance && att.hp < att.maxHp * att.gongfa.lowHpAtkChance.hpPct) critRate += att.gongfa.lowHpAtkChance.crit; // 疾风·残血攻击概率+
    let crit = Math.random() < critRate;
    if (att.gongfa && att.gongfa.enemyLowHp25Crit && def.hp < def.maxHp * 0.25) crit = true;  // 疾风·敌残血必暴
    if (crit && def.gongfa && def.gongfa.immuneOneCrit && !def._immuneCritUsed) { crit = false; def._immuneCritUsed = true; notes.push(`  🛡️【诡影千变】${def.name} 免疫此次暴击！`); } // 诡影·免疫暴击
    if (crit) {
      dmg *= 1.8 * (1 + (att.critDmgAdd || 0));         // 暴击 + 套装/词条暴伤
      if (att.gongfa && att.gongfa.firstHitDmg && opts.firstStrike) dmg *= 1 + att.gongfa.firstHitDmg;  // 奔雷·首击增伤
      if (att.gongfa && att.gongfa.critCutEnemyQi) { def._qiCut = Math.min(def._qiCut || 1, 1 - att.gongfa.critCutEnemyQi); def.qi = Math.max(0, def.qi - 2); }  // 幽影·削灵降敌
    }
    // 闪避（纯敏捷博弈，流影遁身改为气机争夺）
    let dodge = Math.min(0.40, (def.agi - att.agi) * 0.02);
    if (opts.hitDebuff) dodge += opts.hitDebuff;
    if (opts.dodgeBonus) dodge += opts.dodgeBonus;
    if (def.dodgeBonus) dodge += def.dodgeBonus;     // §8 装备闪避词条
    if (def.dodgeTurn1 && opts.firstStrike) dodge += def.dodgeTurn1;   // 首回合闪避（套装/幽影噬神）
    if (def.gongfa && def.gongfa.dodgeChance) dodge += def.gongfa.dodgeChance;  // 诡影·常态闪避
    if (Math.random() < dodge) {
      if (DT.tAgi) def.jiFeng = 1;                              // 灵眸锻巧：闪避成功获【机锋】
      if (DT.tDodge && att.qi > 0 && def.qi < def.qiMax) {     // 流影遁身：闪避成功夺走 1 气机
        att.qi -= 1; def.qi = Math.min(def.qiMax, def.qi + 1);
        notes.push(`  🌫️【流影遁身】${def.name} 闪避并夺走你 1 点气机！`);
      }
      if (def.gongfa && def.gongfa.dodgeThenNextAtk) att._dodgeAtkBonus = def.gongfa.dodgeThenNextAtk;  // 诡影·闪避后下次追伤
      if (def.dodgeFollowup) def._dodgeAtkBonus = (def._dodgeAtkBonus || 0) + def.dodgeFollowup;   // 套装/虚空遁：闪避成功后下一击追伤
      return { dodged: true, crit, canceled, counter, reflect, notes };
    }
    // 器灵护主（本命帝器·器生微灵）：90 级后概率自主格挡
    if (def.zdGuard && Math.random() < 0.15) {
      notes.push(`  🛡️【器灵护主】本命帝器自主格挡，伤害全免！`);
      return { dodged: false, dmg: 0, crit: false, blocked: true, canceled: false, counter: 0, reflect: 0, notes };
    }
    // 流影遁身：闪避失败自身流失 1 气机（五象融身处于劣势时不流失）
    if (DT.tDodge && def.qi > 0 && !(def.tal.tAll && (def.stun || 0) > 0)) def.qi -= 1;
    // 减伤（防御 + 装备/套装防御%）
    let effDef = def.def * (1 + (def.affixDefPct || 0) + (def.setDefPct || 0));   // 装备/套装防御%
    if (def._liejia > 0) effDef *= 0.92;                                        // 裂甲：防御 -8%
    if (att.ignoreDef) effDef -= effDef * Math.min(0.5, att.ignoreDef);          // 破甲（套装/霸皇开山）
    if (att.ignoreDefHit && dmg > 0) def._defDownHit = Math.max(0.5, (def._defDownHit || 1) * (1 - att.ignoreDefHit)); // 破甲词条：命中降敌防御
    if (att.zdIgnoreDefChance && Math.random() < att.zdIgnoreDefChance) { effDef *= (1 - att.zdIgnoreDefPct); notes.push(`  🗡️【证道·无视防御】${att.name} 触发道痕/道威，无视敌方 ${Math.round(att.zdIgnoreDefPct * 100)}% 防御！`); } // 证道武器
    effDef *= (def._defDownHit || 1);                                            // 破甲 debuff 持续至回合末
    if (att.gongfa && att.gongfa.firstStrikeIgnoreDef && opts.firstStrike) effDef *= 1 - att.gongfa.firstStrikeIgnoreDef; // 奔雷·先手破防
    dmg -= effDef * 0.4;
    if (DT.tArmor) dmg *= 1 - Math.min(0.5, 0.005 * DT.tArmor + 0.02 * def.qi);  // 气机越多减伤越强，归零则近乎消失
    if (def.destiny && def.destiny.includes('def')) dmg *= 0.9;           // 钢筋铁骨
    if (def.reduction) dmg *= 1 - Math.min(0.6, def.reduction);            // §8 装备减伤词条
    if (def.reduAll) dmg *= 1 - Math.min(0.6, def.reduAll);             // 万钧镇山：受到伤害减免（全局）
    if (def.critReduc && crit) dmg *= 1 - Math.min(0.5, def.critReduc);   // 韧身/套装：受暴击伤害降低
    if (def.gongfa && def.gongfa.allRedu) dmg *= 1 - Math.min(0.6, def.gongfa.allRedu);   // 万象·全减伤
    if (def.shield > 0 && def.gongfa && def.gongfa.shieldExtraRedu) dmg *= 1 - def.gongfa.shieldExtraRedu;  // 万甲·护盾减伤
    if (def.gongfa && def.gongfa.perDebuffRedu) { const dn = def._debuffCount || 0; if (dn > 0) dmg *= 1 - Math.min(0.5, def.gongfa.perDebuffRedu * dn); }  // 地藏·每负面减伤
    // 帝威震慑已并入通用压制，不再单独处理
    if (defSide.bossDefStat) dmg -= defSide.bossDefStat * 0.3;
    if (defSide.shield > 0) { const ab = Math.min(defSide.shield, dmg); defSide.shield -= ab; dmg -= ab; }
    if (def.qiShield > 0) { const ab = Math.min(def.qiShield, dmg); def.qiShield -= ab; dmg -= ab; }  // 气盾
    // 气垣御身（消耗 2 气机触发格挡；成则减半并回 1 气机，败则流失）
    if (DT.tBlock && canConsume(def) && def.qi >= 2 && !opts.suppressBlock) {
      def.qi -= 2;
      if (Math.random() < 0.20 + 0.02 * DT.tBlock) { dmg *= 0.5; blocked = true; def.qi = Math.min(def.qiMax, def.qi + 1); notes.push(`  🛡️【气垣御身】${def.name} 格挡成功，伤害减半并回复 1 气机`); }
      else { notes.push(`  🛡️【气垣御身】${def.name} 格挡失败，气机流失`); }
    }
    if (ignoreHalfBlock && blocked) { dmg *= 2; blocked = false; notes.push('  ⚔️【锋器通悟】无视半数气垣格挡'); }
    dmg = Math.max(1, Math.round(dmg));
    // 道则伤害（帝尊道装二阶）：基于自身五维总值
    if (att.daozheDmg && dmg > 0) {
      const dw = Math.round((att.str + att.spd + att.agi + att.def + att.luc) * att.daozheDmg);
      dmg += dw; notes.push(`  ☯️【道则】${att.name} 附带道则伤害 ${dw}`);
    }
    // 焚击（焚天战魂二阶）：每次攻击 15% 概率附加目标当前生命 10%
    if (att.fenjiProc && dmg > 0 && Math.random() < att.fenjiProc) {
      const extra = Math.round(def.hp * att.fenjiMul);
      dmg += extra; notes.push(`  🔥【焚击】${att.name} 触发焚天战魂，附加当前生命 ${extra} 额外伤害！`);
    }
    dmg = Math.max(1, Math.round(dmg));
    // 保命：不灭道体（保留 30% 生命）/ 御灵（保留 1 点），单局各 1 次
    if (def.hp - dmg <= 0) {
      if (!def._survived) {
        if (def.surviveThreshold) { def.hp = Math.round(def.maxHp * def.surviveThreshold); def._survived = true; dmg = 0; notes.push(`  🛡️【不灭道体】${def.name} 触发保命，保留 ${Math.round(def.surviveThreshold * 100)}% 生命！`); }
        else if (def.survive1) { def.hp = 1; def._survived = true; dmg = 0; notes.push(`  ✨【御灵】${def.name} 触发护命，残血续战！`); }
      }
      if (def.hp - dmg <= 0 && def.gongfa && def.gongfa.flags && def.gongfa.flags.xuangui_feign && !def._xuanguiUsed) { def.hp = 1; def._xuanguiUsed = true; dmg = 0; notes.push(`  🐢【玄龟守道】${def.name} 龟息留命 1 点！`); }
    }
    // 吸血（装备/套装/功法，总吸血上限 30%）
    if (att.lifesteal && dmg > 0) {
      const heal = Math.round(dmg * Math.min(0.30, att.lifesteal));
      att.hp = Math.min(att.maxHp, att.hp + heal);
      notes.push(`  🩸【吸血】${att.name} 吸取 ${heal} 生命`);
    }
    // 反伤（玄骨单件 / 万钧镇山二阶），反弹比例上限 50%
    if (def.reflect && dmg > 0) {
      const rb = Math.round(dmg * Math.min(0.5, def.reflect));
      if (rb > 0) { reflect += rb; notes.push(`  ↩️【反伤】${def.name} 反弹 ${rb} 伤害`); }
    }
    // 潮劲回涌（天赋：受击方消耗 3 气机反弹全额，下回合格止恢复）
    if (DT.tReflect && canConsume(def) && def.qi >= 3 && Math.random() < 0.5) {
      def.qi -= 3; reflect = dmg; def.qiStop = Math.max(def.qiStop || 0, 1);
      notes.push(`  🌊【潮劲回涌】${def.name} 引潮反弹 ${dmg} 伤害（下回合格止恢复）`);
    }
    // §11 功法：命中后效果（吸血/回血/暗影追伤/压制/灼烧/削力）
    if (dmg > 0) {
      if (att.gongfa) {
        const g = att.gongfa;
        if (g.lifesteal && opts.isBasic) { const h = Math.round(dmg * g.lifesteal); att.hp = Math.min(att.maxHp, att.hp + h); notes.push(`  🩸【血影杀道】${att.name} 吸血 ${h}`); }
        if (g.basicHitHeal) { const h = Math.round(att.maxHp * g.basicHitHeal); att.hp = Math.min(att.maxHp, att.hp + h); notes.push(`  🍖【蛮兽吞山】${att.name} 普攻回血 ${h}`); }
        if (g.critExtraShadow && crit) { const sd = Math.round(dmg * g.critExtraShadow); def.hp -= sd; notes.push(`  🌑【血影杀道】暗影追伤 -${sd}`); }
        if (g.hitReduceEnemyAllDmg) { def._enemyDmgDown = Math.min(def._enemyDmgDown || 1, 1 - g.hitReduceEnemyAllDmg); def._debuffCount = (def._debuffCount || 0) + 1; }
        if (g.burnOnHit && Math.random() < g.burnOnHit.prob && !(def.gongfa && def.gongfa.highHp70ImmuneBleed && def.hp > def.maxHp * 0.7)) {
          let turns = g.burnOnHit.turns + (g.bleedTurnsBonus || 0); if (def.debuffHalf) turns = Math.ceil(turns * (1 - def.debuffHalf));  // 帝尊道装：负面时长减半
          const dm = Math.round(def.maxHp * g.burnOnHit.dmg * (1 + (g.dotDmg || 0)));
          def.dot = { dmg: dm, turns: turns }; def._bleed = true;
          notes.push(`  🔥【焚天离火】${def.name} 被灼烧，每回合流失 ${dm} 生命（${turns}回合）`);
        }
      }
      if (def.gongfa && def.gongfa.strUpOnHit && Math.random() < def.gongfa.strUpOnHit) { def.str += 2; def.dims.str += 2; notes.push(`  💪【荒古圣体】${def.name} 受击激发圣力 +2`); }
    }
    return { dodged: false, dmg, crit, blocked, canceled, counter, reflect, notes };
  }


  // 驱散目标套装增益（证道武器·道威），回退数值类加成并清空触发类
  function dispelSet(def) {
    const b = def.setBonus; if (!b) return;
    if (b.lifesteal) def.lifesteal -= b.lifesteal;
    if (b.dodge) def.dodgeBonus -= b.dodge;
    if (b.defPct) def.setDefPct -= b.defPct;
    if (b.reduAll) def.reduAll -= b.reduAll;
    if (b.reflect) def.reflect -= b.reflect;
    if (b.atkPct && def.weapon) def.weapon.atkMul -= b.atkPct;
    ['shieldStart', 'surviveThreshold', 'debuffHalf', 'daozheDmg', 'killAtkUp', 'dodgeFollowup', 'fenjiProc', 'fenjiMul'].forEach(k => { if (b[k] != null) def[k] = 0; });
    def.setBonus = null; def.activeSet = null;
  }

  /* 主战斗循环 */
  function run(opts) {
    const S = ST.S;
    const player = playerSnapshot({ isSpar: opts.isSpar });
    player.shield = 0;
    if (player.destiny.includes('iron')) player.shield += Math.round(player.def * 1.0); // 金刚不坏
    const enemy = opts.enemy;
    enemy.hp = enemy.hp != null ? enemy.hp : enemy.maxHp;
    enemy.bossDefStat = enemy.bossDefStat || 0;
    enemy.destiny = enemy.destiny || [];
    enemy.tal = enemy.tal || {};
    enemy.shield = 0;
    if (player.shieldStart) player.shield += Math.round(player.maxHp * player.shieldStart);   // 不灭道体·开局护盾
    if (enemy.shieldStart) enemy.shield += Math.round(enemy.maxHp * enemy.shieldStart);
    // 把五维归一为顶层字段（strike 直接读取顶层 agi/def/luc）
    enemy.str = enemy.dims.str; enemy.spd = enemy.dims.spd;
    enemy.agi = enemy.dims.agi; enemy.def = enemy.dims.def;
    enemy.luc = enemy.dims.luc;
    // §11 功法：敌方面板应用（含 PVP 减半），并刷新顶层五维
    ST.applyGongfaToPlayer(enemy, opts.enemy, { isSpar: opts.isSpar });
    enemy.str = enemy.dims.str; enemy.spd = enemy.dims.spd;
    enemy.agi = enemy.dims.agi; enemy.def = enemy.dims.def;
    enemy.luc = enemy.dims.luc;

    player.rage = 0; enemy.rage = 0;
    const log = [];
    log.push(`⚔ 战斗开始：${player.name} (Lv${player.level}) VS ${enemy.name}` +
      (enemy.isBoss ? ` 【第${enemy.layer}层 · 公共血池 ${enemy.hp}/${enemy.maxHp}】` : ''));
    log.push('⚡先手规则：速度高者先手且首击+15%压制；每回合积累怒气，满100触发💥怒气爆发(伤害×1.5)');

    // §11 功法开局处理：神魂护盾、开局压制、抢先技能
    [player, enemy].forEach(who => {
      const g = who.gongfa; if (!g) return;
      const shieldBoost = 1 + (g.shieldMul || 0) + (g.healShieldMul || 0);
      if (g.startShield) {
        const amt = Math.round(who.maxHp * g.startShield * shieldBoost);
        who.shield += amt;
        log.push(`  🛡️【清心御道】${who.name} 开局获得神魂护盾 ${amt}`);
      }
      if (g.flags && g.flags.zhenyu_suppress) {
        const t = (who === player) ? enemy : player; t._openSuppress = 0.92;
        log.push(`  🔗【镇狱魔功】${who.name} 开局压制 ${t.name}，其首次攻击 -8%`);
      }
    });

    let round = 0;
    let prevFirst = '';
    const MAX = 30;

    /* 免死：命格【装死】与天赋【假死】分别独立，每场各 1 次 */
    const usedF = { pf: false, pt: false, ef: false, et: false };
    function tryFeign(who) {
      if (who === player) {
        if (player.destiny.includes('feign') && !usedF.pf) usedF.pf = true;
        else if (player.tal && player.tal.tFeign && !usedF.pt) { usedF.pt = true; player.qi = 0; player.noConsumeQi = 2; }
        else return false;
      } else {
        if (enemy.destiny.includes('feign') && !usedF.ef) usedF.ef = true;
        else if (enemy.tal && enemy.tal.tFeign && !usedF.et) { usedF.et = true; enemy.qi = 0; enemy.noConsumeQi = 2; }
        else return false;
      }
      who.hp = 1;
      log.push(`  ${who.name} 触发【装死/假死】，免死回 1 命！`);
      return true;
    }

    /* 武诀主动技（消耗气机释放，每场 1 次；除「夺械折锋失败」外占用本回合）
       释放顺序随机化（A）：同回合多个可放技能时，按权重随机挑选其一，而非永远取固定优先级最高者。
       玩家与敌人通用（C）：被敌人/Boss/切磋对手调用，怪物无天赋则自然只普攻。 */
    function tryTalent(me, foe, round, log) {
      const T = me.tal || {};
      if (!me._tu) me._tu = {};
      const u = me._tu;
      const locked = (me.noConsumeQi || 0) > 0;          // 黏丝缚机 / 枯荣假蜕后无法消耗气机
      const hit = (base, tag) => { const d = Math.max(1, Math.round(base)); foe.hp -= d; log.push(`${tag} 造成 ${d} 伤害`); };
      const pay = (n) => { me.qi = Math.max(0, me.qi - n); };     // 消耗气机
      const can = (n) => !locked && me.qi >= n;

      // —— 收集本回合可释放的候选技能（带权重；weight 可后续调参）——
      const cands = [];
      const add = (key, weight, cond, cost) => { if (cond && can(cost)) cands.push({ key, weight }); };
      add('steal',   1, T.tSteal      && !u.steal    && round >= 2, 0); // 夺械：无气机也尝试（失败占回合，与旧逻辑一致）
      add('potion',  1, T.tPotion     && !u.potion   && me.hp < me.maxHp * 0.6, 2);
      add('glue',    1, T.tGlue       && !u.glue     && round >= 2 && !(foe.stun > 0), 4);
      add('chimeMax',1, T.tChimeMax   && !u.chimeMax, 5);
      add('chime',   1, T.tChime      && !u.chime, 2);
      add('palm',    1, T.tPalm       && !u.palm, 6);
      add('thunder', 1, T.tThunder    && !u.tThunder, 3);
      add('kick',    1, T.tKick       && !u.tKick, 4);
      add('wind',    1, T.tWind       && !u.wind, 5);
      add('wing',    1, T.tWing       && !u.wing, 3);
      add('tick',    1, T.tShadowTick && !u.tick, 4);
      add('throw',   1, T.tThrow      && !u.throw && me.weapon && me.weapon.type === 'throw', 4);
      add('vip',     1, T.tVip        && !u.vip && me.qi >= 1, 0);
      if (!cands.length) return false;

      // —— 加权随机挑选（实现 A：释放顺序随机化）——
      let total = 0; cands.forEach(c => total += c.weight);
      let r = Math.random() * total, key = cands[0].key;
      for (const c of cands) { r -= c.weight; if (r < 0) { key = c.key; break; } }

      // —— 执行 ——
      switch (key) {
        case 'steal': {
          if (can(3) && Math.random() < 0.5) {
            u.steal = true; pay(3); foe.stealDeb = true;
            log.push(`  ⚔️【夺械折锋】夺械成功！${foe.name} 攻势-20%（本场有效），本回合不再获得气机`);
            me.noQiGainNext = true; return true;
          }
          u.steal = true; log.push(`  ⚔️【夺械折锋】探查失败（不消耗气机）`); return false;
        }
        case 'potion': {
          if (!can(2)) return false;
          u.potion = true; pay(2);
          const heal = Math.max(25, Math.round(me.maxHp * 0.25 * (me.healMul || 1)));
          if (me.hp < me.maxHp) { me.hp = Math.min(me.maxHp, me.hp + heal); log.push(`  🧃【百草续元】恢复 ${heal} HP`); }
          else { me.qiShield = Math.min(Math.round(me.maxHp * 0.2), me.qiShield + heal); log.push(`  🧃【百草续元】生机已满，化为气盾 +${heal}`); }
          me.noQiGainNext = true; return true;
        }
        case 'glue': {
          if (!can(4)) return false;
          u.glue = true; pay(4); foe.noConsumeQi = Math.max(foe.noConsumeQi || 0, 3);
          foe.stun = Math.max(foe.stun || 0, 3 - (foe.tal.tAll ? 1 : 0));   // 五象融身负面-1
          log.push(`  🧴【黏丝缚机】黏缚 ${foe.name} 气机脉络 3 回合（无法消耗气机/积攒新机）`);
          return true;
        }
        case 'chimeMax': {
          if (!can(5)) return false;
          u.chimeMax = true; pay(5); foe.stun = Math.max(foe.stun || 0, 2 - (foe.tal.tAll ? 1 : 0));
          foe.qi = 0; hit(35, `  🦅【灵籁震脉·极】封滞 2 回合、清空气机，`);
          return true;
        }
        case 'chime': {
          if (!can(2)) return false;
          u.chime = true; pay(2); foe.stun = Math.max(foe.stun || 0, 1 - (foe.tal.tAll ? 1 : 0));
          foe.fengJin = 0; foe.diLi = 0;
          hit(15 * (1 + 0.1 * (T.tChime - 1)), `  🦢【灵籁震脉】震脉打断，`);
          return true;
        }
        case 'palm': {
          if (!can(6)) return false;
          u.palm = true; pay(6);
          if (foe.isBoss && Math.random() < 0.3) log.push(`  🖐️【巨灵掌印】BOSS 免疫！`);
          else { const d = Math.max(1, Math.round(foe.hp / 2)); foe.hp -= d; log.push(`  🖐️【巨灵掌印】打掉 ${d} HP（半血）`); }
          me.qiStop = Math.max(me.qiStop || 0, 1); return true;
        }
        case 'thunder': {
          if (!can(3)) return false;
          u.tThunder = true; pay(3);
          hit(15 + T.tThunder * 1.5, `  ⚡【雷芒奔踏】`);
          foe.leiZhi = Math.max(foe.leiZhi || 0, 2); log.push(`  · 雷滞：${foe.name} 每耗气机额外流失 1 点（2 回合）`);
          return true;
        }
        case 'kick': {
          if (!can(4)) return false;
          u.tKick = true; pay(4);
          hit(30 + me.str * 0.5, `  🦶【玄影连蹴】`);
          const cap = 2 + Math.floor(me.str / 20);
          foe.cuoL = Math.max(foe.cuoL || 0, cap); log.push(`  · 挫力：降低 ${foe.name} 膂力（${cap} 层，2 回合）`);
          return true;
        }
        case 'wind': {
          if (!can(5)) return false;
          u.wind = true; pay(5);
          const broke = (foe.qiShield > 0 ? 1 : 0) + (foe.suppressWeapon > 0 ? 1 : 0);
          foe.qiShield = 0; foe.suppressWeapon = 0;
          hit((20 + me.str * 0.9) + broke * 8, `  🌪️【罡风摧山】击碎 ${broke} 层气垣`);
          if (me.str >= 40) { foe.stun = Math.max(foe.stun || 0, 1 - (foe.tal.tAll ? 1 : 0)); log.push(`  · 高膂力附带短暂眩晕`); }
          return true;
        }
        case 'wing': {
          if (!can(3)) return false;
          u.wing = true; pay(3);
          hit(15 + me.agi * 1.0, `  👼【羽翎突袭】`);
          if (Math.random() < 0.3 + 0.1 * T.tWing) { me.jiFeng = 1; log.push(`  · 突进后获得机锋`); }
          return true;
        }
        case 'tick': {
          if (!can(4)) return false;
          u.tick = true; pay(4); foe.youSi = Math.max(foe.youSi || 0, 6);
          log.push(`  🪶【幽丝缠元】布幽丝 6 回合：每回合抽 1 气机转生机（你气机归零下断裂）`);
          return true;
        }
        case 'throw': {
          if (!can(4)) return false;
          u.throw = true; pay(4);
          const n = 3; hit((me.str * 0.7 + me.agi * 0.2) * n, `  💦【飞兵叠击】连投 ${n} 件`);
          me.lueY = Math.max(me.lueY || 0, n); log.push(`  · 掠影：${me.name} 闪避提升（${n} 回合）`);
          return true;
        }
        case 'vip': {
          if (me.qi < 1) return false;
          u.vip = true; const spent = me.qi; pay(spent);
          hit(50, `  💀【玄渊脉冲】耗 ${spent} 气机`);
          me.suppressWeapon = Math.max(me.suppressWeapon || 0, 2);
          log.push(`  · 脉冲余威：武势触发权重提升（2 回合）`);
          return true;
        }
      }
      return false;
    }

    while (round < MAX) {
      round++;
    if (player._liejia > 0) player._liejia--;     // 裂甲 debuff 计时
    if (enemy._liejia > 0) enemy._liejia--;
      // 先手
      const playerFirst = player.spd >= enemy.spd;
      const order = playerFirst ? [player, enemy] : [enemy, player];
      player.rage += playerFirst ? 15 : 10;
      enemy.rage += playerFirst ? 10 : 15;
      // 气机自然恢复（潮劲回涌后停；厚土养躯残血减半）
      [player, enemy].forEach(s => {
        if (s.qiStop > 0) return;
        let r = s.qiRegen || 2;
        if (s.tuYu && s.hp < s.maxHp * 0.5) r = Math.round(r / 2);
        s.qi = Math.min(s.qiMax, s.qi + r);
        if (s.gongfa && s.gongfa.regen) s.hp = Math.min(s.maxHp, s.hp + s.maxHp * s.gongfa.regen);   // 万甲·每回合回血
        if (s.gongfa && s.gongfa.flags && s.gongfa.flags.manshou_recover && !s._manshouUsed && s.hp < s.maxHp * 0.3) { s.hp = Math.min(s.maxHp, s.hp + s.maxHp * 0.15); s._manshouUsed = true; log.push(`  💉【蛮兽吞山】${s.name} 残血激发，回复 15% 生命`); }  // 蛮兽·首次残血回血
        if (s._enemyDmgDown) s._enemyDmgDown = 1;   // 镇狱压制每回合重置
        if (s.atkStackEnabled) { s.atkStacks = Math.min(s.atkStackMax, (s.atkStacks || 0) + 1); s.atkStackMul = 1 + 0.03 * s.atkStacks; }  // 风行：每回合攻击叠层
      });
      // 踏风根行：先手者获 2 气机；连续两回合先手 → 下次攻击剥夺对手 1 气机
      if (playerFirst) {
        if (player.tal.tSpd) player.qi = Math.min(player.qiMax, player.qi + 2);
        if (prevFirst === 'p' && player.tal.tSpd) player.stealQiNext = true;
        prevFirst = 'p';
      } else {
        if (enemy.tal.tSpd) enemy.qi = Math.min(enemy.qiMax, enemy.qi + 2);
        if (prevFirst === 'e' && enemy.tal.tSpd) enemy.stealQiNext = true;
        prevFirst = 'e';
      }
      log.push(`— 第 ${round} 回合（${playerFirst ? '我先手' : '敌先手'}）—`);

      for (const actor of order) {
        const me = actor === player ? player : enemy;
        const foe = actor === player ? enemy : player;
        // 被动回血（疗伤真气）在回合末统一处理
        if (me.hp <= 0) continue;
        // 持续蚀害（灵影侵扰）
        if (me.dot && me.dot.turns > 0) {
          me.hp -= me.dot.dmg; me.dot.turns--;
          log.push(`  ${me.name} 受持续蚀害 -${me.dot.dmg} HP`);
          if (me.hp <= 0 && !tryFeign(me)) return finish(player, enemy, opts, log, round, me === enemy);
        }
        // 眩晕/黏滞
        if (me.stun > 0) { me.stun--; log.push(`  ${me.name} 无法行动！`); continue; }
        if (me.hp <= 0) continue;
        // 天赋主动/增益（玩家与敌人通用：均会释放武诀与虚身残影，C）
        if (!me._tu) me._tu = {};
        const MT = me.tal || {};
        if (MT.tGhost && !me._tu.ghost && round >= 2 && me.qi >= 4 && (me.noConsumeQi || 0) <= 0) {
          me._tu.ghost = true; me.qi -= 4; me.xvYing = 2;
          me.spd = Math.round(me.spd * 1.5);
          log.push(`  💨【虚身残影】${me.name} 化虚影 2 回合：速度+50%、伤害+10%，耗 4 气机`);
        }
        if (tryTalent(me, foe, round, log)) {
          if (foe.hp <= 0 && !tryFeign(foe)) return finish(player, enemy, opts, log, round, foe === enemy);
          continue;
        }
        // 普攻
        const w = actor === player ? player.weapon : null;
        const firstStrike = round === 1 && ((playerFirst && actor === player) || (!playerFirst && actor === enemy));
        const res = strike(me, w, foe, foe, {
          critBuff: me.critBuff || 0,
          dodgeBonus: (foe.dodgeBuff || 0) - (me.hitDebuff || 0),
          isBasic: true,
          firstStrike: firstStrike
        });
        if (res.notes) res.notes.forEach(n => log.push(n));
        if (res.dodged) {
          log.push(`  ${me.name} 攻击 → ${foe.name} 闪避！`);
        } else if (res.canceled) {
          // 心兆逆击已对攻击者造成反击（res.counter），本次攻势取消
          if (me.hp <= 0 && !tryFeign(me)) return finish(player, enemy, opts, log, round, me === enemy);
        } else {
          let dmg = res.dmg;
          let burst = false;
          if (me.rage >= 100) { dmg = Math.round(dmg * 1.5); me.rage = 0; burst = true; }
          if (firstStrike) dmg = Math.round(dmg * 1.15);
          // 天斩（4% 命运一击）：每次普攻命中后判定，无视本次伤害直接斩落对手至 1 血（已≤1血不触发）；运气好起手即可触发
          if (!res.dodged && !res.canceled && foe.hp > 1 && Math.random() < 0.04) {
            log.push(`  💥【天斩】${me.name} 把握天命，一击将 ${foe.name} 斩落至 1 血！`);
            foe.hp = 1;
          } else {
            foe.hp -= dmg;
            let note = res.crit ? '（暴击）' : '';
            if (res.blocked) note += ' 🛡格挡';
            if (burst) note += ' 💥怒气爆发';
            if (firstStrike) note += ' ⚡先手压制';
            log.push(`  ${me.name} 攻击 → ${foe.name} -${dmg} HP${note}`);
          }
          // §11 功法：击杀特效（霸皇叠力 / 血影回血）
          if (foe.hp <= 0) {
            if (me.gongfa && me.gongfa.killStackStr) { me.str *= (1 + me.gongfa.killStackStr); me.dims.str = me.str; log.push(`  💪【霸皇开山】${me.name} 击杀永久 +5% 力量`); }
            if (me.gongfa && me.gongfa.killHeal8) { me.hp = Math.min(me.maxHp, me.hp + me.maxHp * me.gongfa.killHeal8); log.push(`  🩸【血影杀道】${me.name} 击杀回复 8% 生命`); }
            if (me.killAtkUp) { me.atkStackMul *= (1 + me.killAtkUp); log.push(`  ⚔️【血甲·击杀】${me.name} 击杀后本回合攻击 +${Math.round(me.killAtkUp * 100)}%`); }  // 荒古血甲二阶
            if (me.killHeal) { me.hp = Math.min(me.maxHp, me.hp + Math.round(me.maxHp * me.killHeal)); log.push(`  🩸【吞元·击杀】${me.name} 击杀回复 ${Math.round(me.killHeal * 100)}% 生命`); }  // 吞元
          }
          // —— 气机资源积攒 ——
          if (!me.noQiGainNext) me.qi = Math.min(me.qiMax, me.qi + 1);   // 普攻积攒气机
          me.noQiGainNext = false;
          if (me.tal.tStr) me.diLi = Math.min(3, me.diLi + 1);            // 玄力铸筋：地力
          if (w && me.tal.tWeapon) me.fengJin = Math.min(3, me.fengJin + 1); // 锋器通悟：锋劲
          if (!w && me.tal.tUnarmed) foe.chanJin = 2;                    // 赤手搏道：缠劲
          if (w && me.tal.tLightHeavy && foe.qi > 0) { foe.qi -= 1; me.qi = Math.min(me.qiMax, me.qi + 1); } // 轻重随势窃取
          if (me.stealQiNext && foe.qi > 0) { foe.qi -= 1; me.qi = Math.min(me.qiMax, me.qi + 1); me.stealQiNext = false; } // 踏风剥夺
          if (foe.tal.tHp && foe.hp < foe.maxHp * 0.3) { foe.tuYu = true; foe.qi = Math.min(foe.qiMax, foe.qi + 1); } // 厚土养躯土御
          // 连环破势：连击权重累积，触发时第二击续控不增伤
          if (me.tal.tCombo) me.comboWeight = Math.min(0.1, (me.comboWeight || 0) + 0.01 * me.tal.tCombo);
          if (me.tal.tCombo && Math.random() < (0.02 * me.tal.tCombo + (me.comboWeight || 0))) {
            const d2 = Math.max(1, Math.round(dmg * 0.5));
            foe.hp -= d2; log.push(`  👋【连环破势】追击 -${d2} HP（续控，不增伤）`);
            if (foe.chanJin > 0) foe.chanJin = 2;   // 刷新缠劲
          }
          // 隙窍斩：目标≥2 种负面状态时压血至 1 并清空负面标记
          if (me.tal.tExecute && foe.hp > 1) {
            const neg = (foe.chanJin > 0) + (foe.leiZhi > 0) + (foe.cuoL > 0) + (foe.youSi > 0) + ((foe.stun || 0) > 0) + (foe.suppressWeapon > 0) + ((foe.noConsumeQi || 0) > 0) + (foe.stealDeb ? 1 : 0);
            if (neg >= 2) {
              foe.hp = 1; foe.chanJin = 0; foe.leiZhi = 0; foe.cuoL = 0; foe.youSi = 0; foe.stun = 0; foe.suppressWeapon = 0; foe.noConsumeQi = 0; foe.stealDeb = false;
              log.push(`  ✨【隙窍斩】${foe.name} 生机压至 1 点，负面标记全清！`);
            }
          }
          // 血络汲元：耗 2 气机，伤害转生机，溢出化气盾（≤20% 最大生机）
          if (me.tal.tLeech && me.qi >= 2 && (me.noConsumeQi || 0) <= 0 && (me.passiveDelay || 0) <= 0) {
            me.qi -= 2;
            const newHp = me.hp + dmg, over = Math.max(0, newHp - me.maxHp);
            me.hp = Math.min(me.maxHp, newHp);
            const cap = Math.round(me.maxHp * 0.2);
            if (over > 0) me.qiShield = Math.min(cap, me.qiShield + over);
            log.push(`  🩸【血络汲元】转化 ${dmg} 生机为治疗${over > 0 ? `（气盾+${over}）` : ''}`);
          }
          // 潮劲回涌反弹（穿透枯荣假蜕）
          if (res.reflect > 0) {
            me.hp -= res.reflect;
            if (me.hp <= 0) { log.push(`  ${me.name} 被潮劲反弹击溃！`); return finish(player, enemy, opts, log, round, me === enemy); }
          }
          // 死亡判定（对手）
          if (foe.hp <= 0) {
            if (!tryFeign(foe)) { log.push(`  ${foe.name} 倒下！`); return finish(player, enemy, opts, log, round, foe === enemy); }
          }
        }
        // 攻击者反弹/逆击致死判定
        if (me.hp <= 0 && !res.canceled) {
          if (!tryFeign(me)) return finish(player, enemy, opts, log, round, me === enemy);
        }
      }
      // 回合末：状态衰减 + 幽丝抽气机
      [player, enemy].forEach(s => {
        const o = s === player ? enemy : player;
        if (s.youSi > 0) {                                  // 幽丝缠元：被缠者每回合失 1 气机，施术者回血；气机归零断裂
          if (s.qi > 0) { s.qi -= 1; o.hp = Math.min(o.maxHp, o.hp + 5); }
          if (s.qi <= 0) s.youSi = 0; else s.youSi--;
        }
        ['chanJin', 'leiZhi', 'cuoL', 'lueY', 'suppressWeapon', 'noConsumeQi', 'passiveDelay', 'jiFeng', 'qiStop'].forEach(k => { if (s[k] > 0) s[k]--; });
        if (s.xvYing > 0) { s.xvYing--; if (s.xvYing === 0) s.qi = Math.floor(s.qi / 2); }  // 残影结束清半数气机
        if (s.atkStackEnabled) { s.atkStacks = 0; s.atkStackMul = 1; }  // 风行：回合末清空叠层
      });
      // 速度压制：速度差≥5 且回合>3 → 快方额外行动
      const diff = Math.abs(player.spd - enemy.spd);
      if (diff >= 5 && round > 3) {
        const fast = player.spd > enemy.spd ? player : enemy;
        const slow = fast === player ? enemy : player;
        log.push(`  「速度压制」${fast.name} 抢先再动一次！`);
        const w = fast === player ? player.weapon : null;
        const res = strike(fast, w, slow, slow, { dodgeBonus: (slow.dodgeBuff || 0) - (fast.hitDebuff || 0) });
        if (res.notes) res.notes.forEach(n => log.push(n));
        if (res.dodged) log.push(`    ${fast.name} 攻击 → ${slow.name} 闪避！`);
        else {
          let d2 = res.dmg;
          if (fast.rage >= 100) { d2 = Math.round(d2 * 1.5); fast.rage = 0; log.push(`    💥${fast.name} 怒气爆发！`); }
          slow.hp -= d2; log.push(`    ${fast.name} 攻击 → ${slow.name} -${d2} HP`);
          if (res.reflect > 0) { fast.hp -= res.reflect; if (fast.hp <= 0) return finish(player, enemy, opts, log, round, fast === enemy); }
          if (slow.hp <= 0 && !tryFeign(slow)) return finish(player, enemy, opts, log, round, slow === enemy);
        }
      }
      // 每回合末：展示双方剩余血量
      log.push(`  （血量：${player.name} ${Math.max(0, Math.round(player.hp))} ｜ ${enemy.name} ${Math.max(0, Math.round(enemy.hp))}）`);
    }
    // 30 回合平局：按剩余 HP% 判
    const win = (player.hp / player.maxHp) >= (enemy.hp / enemy.maxHp);
    log.push(`  30 回合耗尽，按剩余血量判定：${win ? '胜利' : '失败'}`);
    return finish(player, enemy, opts, log, round, win);
  }

  function finish(player, enemy, opts, log, round, playerWonEnemy) {
    const S = ST.S;
    // 写回 Boss 血池
    if (opts.isBoss && opts.layer) {
      S.layers[opts.layer - 1].bossHp = Math.max(0, Math.round(enemy.hp));
      S.stats.bossDamage += (enemy.maxHp - S.layers[opts.layer - 1].bossHp);
    }
    // 胜负判定：敌方血池清空=胜；否则（含 30 回合平局）按传入结果 ——
    // 普通战/切磋按剩余血量% 判定，Boss 必须血池清空才算胜（避免平局被误判）
    const killed = enemy.hp <= 0;
    const finalWin = killed ? true : (!opts.isBoss && playerWonEnemy);
    log.push(finalWin ? '🏆 胜利！' : '💀 战败（已施加的伤害仍计入血池）');
    let rewards = null;
    if (finalWin && !opts.isSpar) {
      if (opts.isBoss) {
        rewards = { stone: 30, firstClear: opts.firstClear };
        S.stone += 30;
        if (opts.firstClear) { rewards.stone += 20; S.stone += 20; }
      } else {
        const xp = Math.max(4, Math.round(10 + 5 * (1 + 0.1 * Math.max(0, (enemy.level || S.level) - S.level))));
        const lv = ST.gainXp(xp);
        const stone = ri(5, 15), mat = ri(0, 3);
        S.stone += stone; S.inventory.materials += mat;
        rewards = { xp, leveled: lv, stone, materials: mat };
      }
    } else if (!finalWin && !opts.isSpar) {
      // 战败：伤势 +1（探索战斗）
      if (!opts.isBoss) S.injury = Math.min(3, S.injury + 1);
    }
    ST.save();
    return { win: finalWin, log,
      playerName: player.name, playerHp: player.hp, playerMaxHp: player.maxHp,
      enemyName: enemy.name, enemyHp: enemy.hp, enemyMaxHp: enemy.maxHp,
      rewards, round };
  }

  /* 生成普通探索怪物（自适应玩家等级/五维，保证新玩家可战胜 §2.3） */
  function makeMonster(level, terrain) {
    const S = ST.S || {};
    // 以玩家有效五维（含装备/词条/功法加成）为基准，避免怪物绝对数值碾压低等级玩家
    const pd = (ST.effectiveDims && ST.effectiveDims({ equip: true })) || (S.dims || { str: 10, spd: 10, agi: 10, def: 10, luc: 10 });
    const lv = Math.max(1, level + ri(-1, 1));                 // 等级紧贴玩家，最多 ±1 级，杜绝越级碾压
    const t = terrain || 'plain';
    const riskMul = (t === 'mount' || t === 'ocean') ? 1.12 : (t === 'plain' ? 0.95 : 1.0);
    const scale = (0.85 + Math.random() * 0.15) * riskMul;     // 怪物五维 ≈ 玩家 0.80~1.05 倍（高危地形略升）
    const dims = {};
    C.DIMS.forEach(d => { dims[d.key] = Math.max(5, Math.round((pd[d.key] || 10) * scale)); });
    const playerMaxHp = 100 + level * 8 + (pd.def || 10) * 2;
    const maxHp = Math.round(playerMaxHp * (0.65 + Math.random() * 0.2) * (t === 'mount' || t === 'ocean' ? 1.1 : 1));
    const name = '塔灵守卫·' + (t === 'mount' ? '山魈' : t === 'ocean' ? '潮鬼' : t === 'lake' ? '水魅' : '游魂');
    return { name, dims, maxHp, hp: maxHp, level: lv, isBoss: false };
  }

  global.Combat = { run, makeMonster, playerSnapshot, snapshotFromSave };
})(window);
