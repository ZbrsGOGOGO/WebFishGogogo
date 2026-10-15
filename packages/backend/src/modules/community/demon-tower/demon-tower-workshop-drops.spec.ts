import { emptyTowerWorkshop } from '@stealth-reader/shared';
import { grantDemonTowerBossWorkshopDrops, grantDemonTowerExplorationWorkshopDrops } from './demon-tower-workshop-drops';
import { actDemonTower, createDemonTowerState } from './demon-tower.engine';
import { demonTowerWorldView, initialDemonTowerWorld } from './demon-tower.rules';

const DATE = '2026-09-23';
const GREEN = ['qw', 'sh', 'py'] as const;
const HIGH = ['xlg', 'yhs', 'kong', 'zs'] as const;

describe('owner-source workshop material supply adaptation', () => {
  it('starts renewable green-equipment staples at level 16 and yields every 1-3 unit material', () => {
    const earlySeen = new Set<string>(), seen = new Set<string>();
    for (let index = 0; index < 256; index += 1) {
      const early = grantDemonTowerExplorationWorkshopDrops(emptyTowerWorkshop(DATE), `green-material-${index}`, 1, 1, 15, true);
      const workshop = emptyTowerWorkshop(DATE);
      const drops = grantDemonTowerExplorationWorkshopDrops(workshop, `green-material-${index}`, 1, 1, 16, true);
      for (const id of GREEN) if (drops[id]) {
        seen.add(id);
        expect(drops[id]).toBeGreaterThanOrEqual(1);
        expect(drops[id]).toBeLessThanOrEqual(3);
        expect(workshop.materials[id]).toBe(drops[id]);
      }
      for (const id of GREEN) if (early[id]) earlySeen.add(id);
    }
    expect(earlySeen).toEqual(new Set());
    expect(seen).toEqual(new Set(GREEN));
  });

  it('gates all four 1-2 unit high materials by selected exploration floor seven', () => {
    const lowSeen = new Set<string>(), highSeen = new Set<string>();
    for (let index = 0; index < 512; index += 1) {
      const low = grantDemonTowerExplorationWorkshopDrops(emptyTowerWorkshop(DATE), `high-material-${index}`, 1, 6, 120, true);
      const high = grantDemonTowerExplorationWorkshopDrops(emptyTowerWorkshop(DATE), `high-material-${index}`, 1, 7, 120, true);
      for (const id of HIGH) {
        if (low[id]) lowSeen.add(id);
        if (high[id]) {
          highSeen.add(id);
          expect(high[id]).toBeGreaterThanOrEqual(1);
          expect(high[id]).toBeLessThanOrEqual(2);
        }
      }
    }
    expect(lowSeen).toEqual(new Set());
    expect(highSeen).toEqual(new Set(HIGH));
  });

  it('includes every scarce material in the floor-seven boss stream with a 1-2 unit grant', () => {
    const seen = new Set<string>();
    for (let index = 0; index < 512; index += 1) {
      const drops = grantDemonTowerBossWorkshopDrops(emptyTowerWorkshop(DATE), `boss-material-${index}`, DATE, 1, 7);
      for (const id of HIGH) if (drops[id]) {
        seen.add(id);
        expect(drops[id]).toBeGreaterThanOrEqual(1);
        expect(drops[id]).toBeLessThanOrEqual(2);
      }
    }
    expect(seen).toEqual(new Set(HIGH));
  });

  it('is replay deterministic and clips every material at the shared resource ceiling', () => {
    const first = emptyTowerWorkshop(DATE), second = emptyTowerWorkshop(DATE);
    const a = grantDemonTowerExplorationWorkshopDrops(first, 'deterministic-material-stream', 42, 7, 120, true);
    const b = grantDemonTowerExplorationWorkshopDrops(second, 'deterministic-material-stream', 42, 7, 120, true);
    expect(a).toEqual(b);
    expect(first).toEqual(second);

    const capped = emptyTowerWorkshop(DATE);
    for (const id of ['ht', 'mt', 'ct', 'lm', 'yh', 'cuijl', 'qw', 'sh', 'py', 'bl', 'yw', 'yl', 'sl', 'wj', 'ningz', ...HIGH]) capped.materials[id] = 1_000_000;
    expect(grantDemonTowerExplorationWorkshopDrops(capped, 'capped-material-stream', 42, 7, 120, true)).toEqual({});
    expect(grantDemonTowerBossWorkshopDrops(capped, 'capped-material-stream', DATE, 1, 7)).toEqual({});
    expect(Object.values(capped.materials).every(value => value === 1_000_000)).toBe(true);
  });

  it('settles the newly added progression materials only for non-battle exploration outcomes', () => {
    const blocked = grantDemonTowerExplorationWorkshopDrops(emptyTowerWorkshop(DATE), 'battle-material-stream', 1, 7, 120, false);
    expect([...GREEN, ...HIGH].every(id => blocked[id] === undefined)).toBe(true);

    const now = Date.parse('2026-09-23T02:00:00Z');
    const world = demonTowerWorldView(initialDemonTowerWorld(new Date(now)));
    let checkedBattle = false, checkedReward = false;
    for (let index = 0; index < 512 && (!checkedBattle || !checkedReward); index += 1) {
      const state = createDemonTowerState(now, DATE, `progression-material-fixture-${index}`);
      state.level = 16;
      const result = actDemonTower(state, { kind: 'explore', payload: {} }, { now, serviceDate: DATE, world, expansionEnabled: true });
      const materials = result.state.workshop!.materials;
      if (result.exploration?.outcome === 'battle') {
        expect(GREEN.every(id => materials[id] === undefined)).toBe(true);
        checkedBattle = true;
      } else if (GREEN.some(id => (materials[id] ?? 0) > 0)) {
        expect(actDemonTower(state, { kind: 'explore', payload: {} }, { now, serviceDate: DATE, world, expansionEnabled: true }).state.workshop).toEqual(result.state.workshop);
        checkedReward = true;
      }
    }
    expect({ checkedBattle, checkedReward }).toEqual({ checkedBattle: true, checkedReward: true });
  });

  it('does not advance or otherwise perturb the existing encounter RNG stream', () => {
    const now = Date.parse('2026-09-23T02:00:00Z');
    const world = demonTowerWorldView(initialDemonTowerWorld(new Date(now)));
    let compared = false;
    for (let index = 0; index < 64 && !compared; index += 1) {
      const state = createDemonTowerState(now, DATE, `encounter-stream-fixture-${index}`);
      const plain = actDemonTower(state, { kind: 'explore', payload: {} }, { now, serviceDate: DATE, world, expansionEnabled: false });
      if (plain.exploration?.outcome !== 'battle') continue;
      const workshop = actDemonTower(state, { kind: 'explore', payload: {} }, { now, serviceDate: DATE, world, expansionEnabled: true });
      expect(workshop.exploration).toMatchObject({ outcome: plain.exploration.outcome, floor: plain.exploration.floor });
      expect(workshop.state.rngCounter).toBe(plain.state.rngCounter);
      expect(workshop.state.battle).toMatchObject({
        id: plain.state.battle!.id,
        floor: plain.state.battle!.floor,
        enemies: plain.state.battle!.enemies.map(enemy => ({ id: enemy.id, name: enemy.name, hp: enemy.hp, maxHp: enemy.maxHp })),
      });
      compared = true;
    }
    expect(compared).toBe(true);
  });
});
