import { DEMON_TOWER_FLOORS, DEMON_TOWER_SKILLS } from '@stealth-reader/shared';
import type { DemonTowerAction, DemonTowerWorldView } from '@stealth-reader/shared';
import {
  actDemonTower, advanceDemonTowerState, createDemonTowerState, demonTowerAutomaticAction,
  demonTowerMaxHp, demonTowerProfileView, type DemonTowerEngineState,
} from './demon-tower.engine';

const NOW = Date.UTC(2026, 8, 14, 6);
const DATE = '2026-09-14';
const floor = DEMON_TOWER_FLOORS[0];
const world: DemonTowerWorldView = { version: 1, unlockedFloor: 1, currentFloor: 1, phase: 'boss',
  boss: { name: floor.bossName, hp: floor.bossMaxHp, maxHp: floor.bossMaxHp },
  passage: { current: 0, required: floor.passageRequired }, completedFloors: [], updatedAt: NOW };
const act = (state: DemonTowerEngineState, action: DemonTowerAction) => actDemonTower(state, action, { now: NOW, serviceDate: DATE, world, expansionEnabled: true }).state;

function ownedNewPassives(seed: string): DemonTowerEngineState {
  const state = createDemonTowerState(NOW, DATE, seed);
  state.level = 60; state.attributes = { STR: 100, SPD: 100, AGI: 100, DEF: 100, LUCK: 100 };
  state.hp = demonTowerMaxHp(state);
  state.skills.push({ id: 's17', quality: 2, spareCopies: 0, star: 2, favor: 3 },
    { id: 's18', quality: 2, spareCopies: 0, star: 2, favor: 3 });
  state.loadout.passiveSkills = ['s17', 's18'];
  // Produced by the forward app; the bridge must preserve these optional fields.
  Object.assign(state.daily, { exploreVictories: 1 });
  state.lastReport = { id: 'new-report', kind: 'explore', floor: 1, outcome: 'victory', grade: 'flawless',
    turns: 2, damage: 100, experience: 15, materials: { ore: 1, herb: 1, soul: 0, clue: 0 }, log: [], completedAt: NOW } as DemonTowerEngineState['lastReport'];
  return state;
}

describe('rollback bridge for forward-only free skills', () => {
  it('reads and advances a forward save with s19/s20 equipped, without granting them to old saves', () => {
    const old = createDemonTowerState(NOW, DATE, 'bridge-old-active-save-seed');
    const oldAfter = act(old, { kind: 'train', payload: {} });
    expect(oldAfter.skills.some(item => item.id === 's19' || item.id === 's20')).toBe(false);

    let state = createDemonTowerState(NOW, DATE, 'bridge-new-active-save-seed');
    state.level = 60; state.attributes = { STR: 100, SPD: 100, AGI: 100, DEF: 100, LUCK: 100 };
    state.hp = demonTowerMaxHp(state);
    state.skills.push({ id: 's19', quality: 2, spareCopies: 0, star: 2, favor: 3 },
      { id: 's20', quality: 2, spareCopies: 0, star: 2, favor: 3 });
    state.loadout.activeSkills = ['s19', 's20'];
    const read = demonTowerProfileView(advanceDemonTowerState(state, NOW, DATE), NOW, 1, 0, true);
    expect(read.skills.filter(item => ['s19', 's20'].includes(item.id))).toHaveLength(2);
    expect(read.loadout.activeSkills).toEqual(['s19', 's20']);
    state = act(state, { kind: 'train', payload: {} });
    for (let tries = 0; tries < 12 && !state.battle; tries += 1) {
      state.stamina = 100; state = act(state, { kind: 'explore', payload: {} });
    }
    expect(state.battle).not.toBeNull();
    state.battle!.enemies = [state.battle!.enemies[0]];
    state.battle!.enemies[0].hp = 10_000; state.battle!.enemies[0].maxHp = 10_000;
    state.battle!.enemies[0].attributes = { STR: 0, SPD: 0, AGI: 0, DEF: 0, LUCK: 0 };
    state.battle!.enemies[0].mechanic = undefined; state.battle!.enemies[0].effects = [];
    state.battle!.player.hp = 50;
    const targetId = state.battle!.enemies[0].id;
    state = act(state, { kind: 'skill', payload: { skillId: 's19', targetId } });
    expect(state.battle?.log.some(entry => entry.text.includes('施展嗜血'))).toBe(true);
    state = act(state, { kind: 'skill', payload: { skillId: 's20', targetId } });
    expect(state.battle?.log.some(entry => entry.text.includes('施展镇魂喝'))).toBe(true);
    state = act(state, { kind: 'flee', payload: {} });
    expect(state.battle).toBeNull();
    expect(state.skills.filter(item => ['s19', 's20'].includes(item.id))).toHaveLength(2);
    expect(state.loadout.activeSkills).toEqual(['s19', 's20']);
  });
  it('loads profile, trains, unequips, re-equips and starts exploration without deleting owned assets', () => {
    const original = ownedNewPassives('bridge-save-profile-seed');
    const read = demonTowerProfileView(advanceDemonTowerState(original, NOW, DATE), NOW, 1, 0, true);
    expect(read.skills.filter(item => ['s17', 's18'].includes(item.id))).toHaveLength(2);
    expect(read.combatPower?.parts.skills).toBeGreaterThan(0);
    expect(original.loadout.passiveSkills).toEqual(['s17', 's18']);
    let state = act(original, { kind: 'train', payload: {} });
    expect(state.skills.filter(item => ['s17', 's18'].includes(item.id))).toHaveLength(2);
    state = act(state, { kind: 'equip', payload: { ...state.loadout, passiveSkills: [] } });
    expect(state.loadout.passiveSkills).toEqual([]);
    state = act(state, { kind: 'equip', payload: { ...state.loadout, passiveSkills: ['s17', 's18'] } });
    expect(state.loadout.passiveSkills).toEqual(['s17', 's18']);
    for (let tries = 0; tries < 12 && !state.battle; tries += 1) {
      state.stamina = 100;
      state = act(state, { kind: 'explore', payload: {} });
    }
    expect(state.battle).not.toBeNull();
    expect(state.skills.filter(item => ['s17', 's18'].includes(item.id))).toHaveLength(2);
    const automatic = demonTowerAutomaticAction(state);
    expect(['attack', 'skill']).toContain(automatic.kind);
    const advanced = act(state, automatic);
    expect(advanced.battle?.turn ?? advanced.lastReport?.turns).toBeGreaterThan(0);
    expect(advanced.skills.filter(item => ['s17', 's18'].includes(item.id))).toHaveLength(2);
  });

  it('retains real combat behavior and complete catalog definitions for both IDs', () => {
    expect(DEMON_TOWER_SKILLS.filter(item => ['s17', 's18'].includes(item.id)).map(item => item.name)).toEqual(['皮糙肉厚', '无影手']);
    let reductionSeen = false, followUpSeen = false;
    for (let index = 0; index < 80; index += 1) {
      let state = ownedNewPassives(`bridge-passive-combat-seed-${index}`);
      for (let tries = 0; tries < 12 && !state.battle; tries += 1) {
        state.stamina = 100; state = act(state, { kind: 'explore', payload: {} });
      }
      if (!state.battle) throw new Error('synthetic battle unavailable');
      state.battle.enemies = [state.battle.enemies[0]];
      state.battle.enemies[0].hp = 10000; state.battle.enemies[0].maxHp = 10000;
      state.battle.enemies[0].attributes = { STR: 80, SPD: 0, AGI: 0, DEF: 0, LUCK: 0 };
      state.battle.enemies[0].effects = []; state.battle.enemies[0].mechanic = undefined;
      state.battle.player.shield = 0;
      const plain = structuredClone(state); plain.loadout.passiveSkills = [];
      const plainNext = act(plain, { kind: 'attack', payload: { targetId: state.battle.enemies[0].id } });
      const next = act(state, { kind: 'attack', payload: { targetId: state.battle.enemies[0].id } });
      if (next.battle && plainNext.battle && next.battle.playerDamageTaken < plainNext.battle.playerDamageTaken) reductionSeen = true;
      if ((next.battle?.log ?? next.lastReport?.log ?? []).some(entry => entry.text.includes('无影手追击'))) followUpSeen = true;
      if (reductionSeen && followUpSeen) break;
    }
    expect(reductionSeen).toBe(true);
    expect(followUpSeen).toBe(true);
  });
});
