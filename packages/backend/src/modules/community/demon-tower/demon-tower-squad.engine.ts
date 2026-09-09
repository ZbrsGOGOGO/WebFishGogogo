import { createHmac } from 'node:crypto';
import type { DemonTowerSocialBuild } from './demon-tower-social.engine';

export interface DemonTowerSquadMember { userId: string; ready: boolean; build: DemonTowerSocialBuild | null; hp: number; maxHp: number; damage: number; claimed: boolean; revived: boolean }
export interface DemonTowerSquadState { version: 1; members: DemonTowerSquadMember[]; round: number; bossHp: number; bossMaxHp: number; minions: number; log: string[]; rngSeed: string; rngCounter: number }
const roll = (state: DemonTowerSquadState) => createHmac('sha256', state.rngSeed).update(String(state.rngCounter++)).digest().readUInt32BE(0) / 0x1_0000_0000;
export function initialDemonTowerSquad(userId: string, seed: string): DemonTowerSquadState {
  return { version: 1, members: [{ userId, ready: false, build: null, hp: 0, maxHp: 0, damage: 0, claimed: false, revived: false }], round: 0, bossHp: 0, bossMaxHp: 0, minions: 0, log: [], rngSeed: seed, rngCounter: 0 };
}
export function stepDemonTowerSquad(input: DemonTowerSquadState, floor: number): { state: DemonTowerSquadState; status: 'active' | 'victory' | 'defeat' } {
  const state = JSON.parse(JSON.stringify(input)) as DemonTowerSquadState;
  if (state.version !== 1 || state.members.length < 2 || state.members.length > 4 || state.members.some(member => !member.ready || !member.build) || state.round >= 20 || state.bossHp <= 0) throw new Error('Invalid squad battle state');
  state.round += 1;
  const label = (member: DemonTowerSquadMember) => `队员${state.members.indexOf(member) + 1}`;
  const note = (text: string) => state.log.push(`第${state.round}回合 ${text}`);
  const living = () => state.members.filter(member => member.hp > 0);
  for (const member of [...state.members].sort((a, b) => b.build!.attributes.SPD - a.build!.attributes.SPD)) {
    if (member.hp <= 0 || state.bossHp <= 0) continue;
    const build = member.build!, stats = build.attributes;
    const fallen = state.members.find(candidate => candidate.hp <= 0);
    if (fallen && build.active.includes('s13') && !member.revived) {
      member.revived = true; fallen.hp = Math.ceil(fallen.maxHp * 0.5); note(`${label(member)}以续命丹心复活${label(fallen)}。`);
    }
    const weakest = [...living()].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (build.active.includes('s1') && state.round % 3 === 1 && weakest && weakest.hp < weakest.maxHp * 0.75) {
      const healing = Math.min(weakest.maxHp - weakest.hp, 20 + stats.LUCK * 2); weakest.hp += healing;
      note(`${label(member)}回春帮助${label(weakest)}恢复${healing}生命，并继续攻击。`);
    }
    const main = build.weapons[0];
    let value = Math.round((stats.STR * 0.8 + Math.max(stats.SPD, stats.AGI) * 0.3 + build.level * 0.3) * (1 + 0.1 * state.members.length) * (1 + ((main?.star ?? 1) - 1) * 0.1) * (0.9 + roll(state) * 0.2));
    if (state.round % 3 === 1 && build.active.includes('s2')) value = Math.round(value * 1.5);
    if (state.round % 4 === 1 && build.active.includes('s16')) value = Math.round(value * 1.8);
    if (state.minions > 0) {
      const group = build.weapons.some(weapon => weapon.id === 'w10' || weapon.id === 'w12');
      const defeated = group ? state.minions : 1; state.minions -= defeated; note(`${label(member)}清除${defeated}只召唤助灵。`);
      if (!group) continue;
    }
    const damage = Math.min(state.bossHp, Math.max(1, value - floor * 3)); state.bossHp -= damage; member.damage += damage;
    note(`${label(member)}造成${damage}首领伤害（含${state.members.length * 10}%协作加成）。`);
    if (build.weapons.some(weapon => weapon.id === 'w4')) member.hp = Math.min(member.maxHp, member.hp + Math.round(damage * 0.2));
    if (build.passive.includes('s9')) member.hp = Math.min(member.maxHp, member.hp + Math.round(stats.LUCK * 0.5));
  }
  if (state.bossHp > 0 && living().length) {
    const enraged = state.bossHp <= state.bossMaxHp / 2;
    if (!enraged && state.round % 3 === 0) { state.minions = Math.min(4, state.minions + 2); note('守关者召唤2只助灵，下回合须先清助灵；横扫武器可同时伤害首领。'); }
    const hurt = (member: DemonTowerSquadMember, base: number) => {
      const build = member.build!;
      if (roll(state) < Math.min(0.35, build.attributes.AGI * 0.002)) { note(`${label(member)}闪避冲击。`); return; }
      let damage = Math.max(1, Math.round(base - build.attributes.DEF * 0.4));
      if (build.active.includes('s3') && state.round % 3 === 1) damage = Math.max(0, damage - Math.round(build.attributes.DEF * 0.75));
      if (build.innates.includes('defense')) damage = Math.round(damage * 0.9);
      member.hp = Math.max(0, member.hp - damage); note(`${label(member)}承受${damage}伤害。`);
    };
    const base = (16 + floor * 5) * (enraged ? 1.3 : 1);
    if (enraged && state.round % 2 === 0) { note('狂暴踏地怒吼，全员受到群体冲击。'); for (const member of living()) hurt(member, base * 0.8); }
    else {
      const slowest = [...living()].sort((a, b) => a.build!.attributes.SPD - b.build!.attributes.SPD)[0];
      const guard = [...living()].filter(member => member !== slowest).sort((a, b) => b.build!.attributes.DEF - a.build!.attributes.DEF)[0];
      note('冲锋锁定速度最低者，防御最高的队友分摊一半冲击。');
      hurt(slowest, base * 1.5 * (guard ? 0.5 : 1)); if (guard) hurt(guard, base * 1.5 * 0.5);
    }
  }
  state.log = state.log.slice(-100);
  return { state, status: state.bossHp <= 0 ? 'victory' : living().length === 0 || state.round >= 20 ? 'defeat' : 'active' };
}
