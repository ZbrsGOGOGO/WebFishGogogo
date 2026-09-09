import { DEMON_TOWER_ARENA_SKILLS, DEMON_TOWER_WEAPONS, DEMON_TOWER_AFFIXES, type DemonTowerAffix, type DemonTowerArenaSkillId, type DemonTowerAttributes,
  type DemonTowerOwnedWeapon, type DemonTowerSkillId, type DemonTowerInnateId } from '@stealth-reader/shared';

/** Server-created snapshot. Never accept this structure from a request or expose RNG/profile JSON. */
export interface DemonTowerSocialBuild {
  level: number; maxHp: number; attributes: DemonTowerAttributes; weapons: DemonTowerOwnedWeapon[];
  active: DemonTowerSkillId[]; passive: DemonTowerSkillId[]; innates: DemonTowerInnateId[]; arenaSkills: DemonTowerArenaSkillId[];
}
interface DuelFighter { hp: number; maxHp: number; shield: number; build: DemonTowerSocialBuild; cooldown: Record<string, number>; poison: number; poisonTurns: number; shred: number; revived: boolean; feigned: boolean; tempo: number; tempoTurns: number }
export const demonTowerArenaRank = (rating: number) => rating >= 500 ? '妖王' as const : rating >= 250 ? '黄金' as const : rating >= 100 ? '白银' as const : '青铜' as const;
export function simulateDemonTowerDuel(first: DemonTowerSocialBuild, second: DemonTowerSocialBuild, roll: () => number) {
  const entries: string[] = [];
  const fighters = [first, second].map(input => {
    const build: DemonTowerSocialBuild = JSON.parse(JSON.stringify(input));
    if (build.arenaSkills.includes('str2')) build.attributes.STR += 8;
    if (build.arenaSkills.includes('spd2')) build.attributes.SPD += 12;
    const shieldWeapon = build.weapons.find(item => item.id === 'w15' || item.id === 'w16' && (item.star ?? 1) === 5);
    return { hp: build.maxHp, maxHp: build.maxHp, shield: (shieldWeapon ? build.attributes.DEF * 1.5 : 0) + (build.innates.includes('shield') ? build.attributes.DEF : 0), build, cooldown: {}, poison: 0, poisonTurns: 0, shred: 0, revived: false, feigned: false, tempo: 0, tempoTurns: 0 } as DuelFighter;
  });
  const has = (fighter: DuelFighter, id: DemonTowerArenaSkillId) => fighter.build.arenaSkills.includes(id);
  const weapon = (fighter: DuelFighter, id: string) => fighter.build.weapons.find(item => item.id === id);
  const scale = (fighter: DuelFighter, id: string) => 1 + (weapon(fighter, id)?.quality ?? 0) * 0.15;
  const affix = (fighter: DuelFighter, id: DemonTowerAffix) => fighter.build.weapons.reduce((sum, item) => sum + (item.affixes ?? []).slice(0, Math.floor(item.quality / 3)).filter(key => key === id).length * DEMON_TOWER_AFFIXES[id].value, 0);
  const survive = (fighter: DuelFighter, label: string) => {
    if (fighter.hp > 0) return;
    if (!fighter.feigned && (fighter.build.innates.includes('feign') || has(fighter, 'luck2') && roll() < 0.2)) { fighter.hp = 1; fighter.feigned = true; entries.push(`${label}免死保留1生命。`); }
    else if (!fighter.revived && fighter.build.active.includes('s13')) { fighter.hp = Math.ceil(fighter.maxHp * 0.5); fighter.revived = true; entries.push(`${label}续命丹心复起。`); }
  };
  const hit = (source: DuelFighter, target: DuelFighter, base: number, label: string, guaranteed = false) => {
    const evade = Math.min(0.5, target.build.attributes.AGI * 0.0015 + (has(target, 'spd2') ? 0.15 : 0) + (has(target, 'agi2') ? 0.1 : 0) + affix(target, 'dodge'));
    if (!guaranteed && (roll() > 0.97 || roll() < evade)) { entries.push(`${label}被闪避。`); return; }
    if (weapon(target, 'w16') && roll() < Math.min(0.5, 0.1 * scale(target, 'w16'))) { entries.push('不动明王盾免伤。'); return; }
    const penetration = Math.min(0.75, (weapon(source, 'w11') ? 0.25 * scale(source, 'w11') : 0) + affix(source, 'penetration'));
    const critical = roll() < Math.min(0.65, 0.05 + source.build.attributes.LUCK * 0.001 + (has(source, 'agi2') ? 0.2 : 0) + affix(source, 'critical'));
    let damage = Math.max(1, Math.round((base - target.build.attributes.DEF * 0.45 * (target.shred ? 0.7 : 1) * (1 - penetration)) * (critical ? 1.6 : 1)));
    if (weapon(target, 'w13')) damage = Math.ceil(damage * (1 - Math.min(0.6, 0.2 * scale(target, 'w13'))));
    if (target.build.innates.includes('defense')) damage = Math.ceil(damage * 0.9);
    const absorbed = Math.min(target.shield, damage); target.shield -= absorbed;
    const lost = Math.min(target.hp, damage - absorbed); target.hp -= lost;
    entries.push(`${label}${critical ? '暴击' : ''}造成${lost}伤害${absorbed ? `，护盾吸收${absorbed}` : ''}。`);
    const leech = (weapon(source, 'w4') ? Math.min(0.6, 0.2 * scale(source, 'w4')) : 0) + affix(source, 'leech');
    if (leech) source.hp = Math.min(source.maxHp, source.hp + Math.round(lost * leech));
    if (has(target, 'def2') || weapon(target, 'w14')) { source.hp = Math.max(0, source.hp - Math.round(lost * (has(target, 'def2') ? 0.3 : Math.min(0.75, 0.25 * scale(target, 'w14'))))); survive(source, '攻击者'); }
    survive(target, '受击者');
  };
  let rounds = 0;
  for (let round = 1; round <= 30 && fighters.every(item => item.hp > 0); round += 1) {
    rounds = round;
    const initiative = (fighter: DuelFighter) => fighter.build.attributes.SPD + fighter.tempo;
    const order = initiative(fighters[0]) >= initiative(fighters[1]) ? [0, 1] : [1, 0];
    for (const index of order) {
      const actor = fighters[index], target = fighters[1 - index]; if (actor.hp <= 0 || target.hp <= 0) continue;
      const stats = actor.build.attributes, main = actor.build.weapons[0], definition = DEMON_TOWER_WEAPONS.find(item => item.id === main?.id)!;
      const basic = () => hit(actor, target, (stats[definition?.attribute ?? 'STR'] * 0.85 + stats.STR * 0.3) * (1 + ((main?.star ?? 1) - 1) * 0.1) * (has(actor, 'str2') ? 1.1 : 1), `${index === 0 ? '我方' : '对手'}普攻`);
      const skill = actor.build.arenaSkills.find(id => DEMON_TOWER_ARENA_SKILLS.find(entry => entry.id === id)?.kind !== 'passive' && !actor.cooldown[id] && (id !== 'luck1' || actor.hp < actor.maxHp * 0.8));
      if (!skill) basic();
      else {
        const definition = DEMON_TOWER_ARENA_SKILLS.find(item => item.id === skill)!;
        actor.cooldown[skill] = definition.kind === 'ultimate' ? 5 : 3;
        const label = `${index === 0 ? '我方' : '对手'}${definition.name}`;
        switch (skill) {
          case 'str1': hit(actor, target, stats.STR * 2, label); actor.tempo = -Math.ceil(stats.SPD * 0.25); actor.tempoTurns = 2; break;
          case 'str3': hit(actor, target, stats.STR * 3, label); target.shred = 3; break;
          case 'spd1': for (let count = 0; count < 3 && target.hp > 0 && actor.hp > 0; count += 1) hit(actor, target, stats.SPD * 0.6, label); break;
          case 'spd3': hit(actor, target, stats.SPD * 2.8, label); actor.tempo = 10000; actor.tempoTurns = 2; break;
          case 'agi1': hit(actor, target, stats.AGI * 0.8, label); target.poison = Math.round(stats.AGI * 0.3); target.poisonTurns = 2; break;
          case 'agi3': hit(actor, target, stats.AGI * 2.8, label, true); break;
          case 'def1': actor.shield += Math.round(stats.DEF * 1.5); hit(actor, target, stats.DEF * 0.8, label); break;
          case 'def3': actor.shield += stats.DEF * 2; actor.hp = Math.min(actor.maxHp, actor.hp + Math.round(actor.maxHp * 0.2)); entries.push(`${label}获得护盾并恢复生命。`); break;
          case 'luck1': actor.hp = Math.min(actor.maxHp, actor.hp + 20 + stats.LUCK * 2); entries.push(`${label}恢复生命。`); basic(); break;
          case 'luck3': hit(actor, target, stats.LUCK * (1 + roll() * 3), label); break;
        }
      }
    }
    for (const fighter of fighters) {
      if (fighter.hp > 0 && fighter.poisonTurns > 0) { const absorbed = Math.min(fighter.shield, fighter.poison); fighter.shield -= absorbed; fighter.hp = Math.max(0, fighter.hp - fighter.poison + absorbed); fighter.poisonTurns -= 1; survive(fighter, '中毒者'); }
      if (fighter.hp > 0 && fighter.build.passive.includes('s9')) fighter.hp = Math.min(fighter.maxHp, fighter.hp + Math.round(fighter.build.attributes.LUCK * 0.5));
      fighter.shred = Math.max(0, fighter.shred - 1);
      fighter.tempoTurns = Math.max(0, fighter.tempoTurns - 1); if (!fighter.tempoTurns) fighter.tempo = 0;
      for (const key of Object.keys(fighter.cooldown)) fighter.cooldown[key] = Math.max(0, fighter.cooldown[key] - 1);
    }
  }
  const margin = fighters[0].hp / fighters[0].maxHp - fighters[1].hp / fighters[1].maxHp;
  return { outcome: Math.abs(margin) < 0.000001 ? 'draw' as const : margin > 0 ? 'victory' as const : 'defeat' as const, rounds, log: entries.slice(-100) };
}
