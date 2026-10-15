import { emptyTowerWorkshop, towerWorkshopBonuses, towerWorkshopSets, TOWER_WORKSHOP_SOURCE as C, type TowerForgedItem } from '@stealth-reader/shared';
import { workshopAction, workshopState } from './demon-tower-workshop.engine';
import { actDemonTower, advanceDemonTowerState, createDemonTowerState } from './demon-tower.engine';
import { demonTowerWorldView, initialDemonTowerWorld } from './demon-tower.rules';

const fail = (code: string): never => { throw new Error(code); };
const date = '2026-09-23';
const white = { slot: 'weapon', quality: '白', grade: '原矿', set: '', weaponType: 'zhong' };
describe('September 23 owner-source workshop adaptation', () => {
  it('preserves old saves on read, tops up once at Beijing midnight and never discards purchased passes', () => {
    const now = Date.parse('2026-09-23T15:59:59Z');
    const old = createDemonTowerState(now, date, 'workshop-midnight-fixture'), before = structuredClone(old);
    old.stamina = 1;
    const next = advanceDemonTowerState(old, now + 1000, '2026-09-24');
    expect(next.stamina).toBe(100); expect(next.provisions?.passes).toBe(5);
    expect(old.provisions).toBeUndefined(); expect(old.weapons).toEqual(before.weapons);
    next.stamina = 70; next.provisions!.passes = 12;
    const sameDay = advanceDemonTowerState(next, now + 2000, '2026-09-24');
    expect(sameDay.stamina).toBe(70); expect(sameDay.provisions!.passes).toBe(12);
    expect(advanceDemonTowerState(sameDay, now + 86401000, '2026-09-25').provisions!.passes).toBe(12);
  });
  it('keeps rejected workshop commands from mutating the account and rejects them during combat', () => {
    const now = Date.parse('2026-09-23T02:00:00Z'), state = createDemonTowerState(now, date, 'workshop-transaction-fixture');
    const context = { now, serviceDate: date, expansionEnabled: true, world: demonTowerWorldView(initialDemonTowerWorld(new Date(now))) };
    const before = structuredClone(state);
    expect(() => actDemonTower(state, { kind: 'workshop_forge', payload: white }, context)).toThrow('WORKSHOP_MATERIALS_REQUIRED');
    expect(state).toEqual(before);
    const purchased = actDemonTower(state, { kind: 'workshop_purchase', payload: { material: 'ht', quantity: 3 } }, context);
    expect(purchased.officeCoinCost).toBe(24); expect(state).toEqual(before);
    expect(purchased.state.workshop!.materials.ht).toBe(3);
  });
  it('uses flat rolled dimensions and activates only the highest-count set at its strongest tier', () => {
    const w = emptyTowerWorkshop(date), id = C.SET_LIST[0];
    C.SLOTS.slice(0, 5).forEach((slot, i) => {
      const item: TowerForgedItem = { id: String(i + 1), slot: slot.key, quality: '蓝', name: 'fixture', requiredLevel: 25, weaponType: null, set: id,
        affixes: [{ id: 'duangu', name: '锻骨', stat: 'dimPct', key: 'str', value: 5, description: '' }] };
      w.items.push(item); w.equipped[item.slot] = item.id;
    });
    expect(towerWorkshopBonuses(w).dim_str).toBe(25);
    expect(towerWorkshopSets(w).filter(s => s.active)).toEqual([expect.objectContaining({ id, count: 5, tier: 't5' })]);
    for (const [key, value] of Object.entries(C.SETS[id].t5.bonus)) expect(towerWorkshopBonuses(w)[key]).toBe(value);
  });
  it('rejects corrupt saved items and a backwards daily quota date', () => {
    const w = emptyTowerWorkshop(date); w.materials.ht = 3;
    workshopAction(w, 'workshop_forge', white, 1, () => 0, fail);
    expect(workshopState(w, date, fail)).toEqual(w);
    expect(() => workshopState(w, '2026-09-22', fail)).toThrow('INVALID_WORKSHOP_STATE');
    w.items[0].affixes[0].value = Number.NaN;
    expect(() => workshopState(w, date, fail)).toThrow('INVALID_WORKSHOP_STATE');
  });
  it('keeps raw and refined inventories distinct and charges the exact 3/6, 3/9, 3/12 recipes', () => {
    const w = emptyTowerWorkshop(date); w.materials = { ht: 6, mt: 27 };
    for (const grade of ['粗炼', '精炼', '纯净']) workshopAction(w, 'workshop_refine', { grade, material: 'ht', batches: 1 }, 1, () => 0, fail);
    expect(w.materials).toEqual({ ht: 3, mt: 0 });
    expect(w.refined).toEqual({ 粗炼: { ht: 0 }, 精炼: { ht: 0 }, 纯净: { ht: 3 } });
    workshopAction(w, 'workshop_forge', { ...white, grade: '纯净' }, 1, () => 0, fail);
    expect(w.materials.ht).toBe(3); expect(w.refined['纯净'].ht).toBe(1);
  });
  it('does not partially consume ore when charcoal is insufficient', () => {
    const w = emptyTowerWorkshop(date); w.materials = { ht: 3, mt: 5 }; const before = structuredClone(w);
    expect(() => workshopAction(w, 'workshop_refine', { grade: '粗炼', material: 'ht', batches: 1 }, 1, () => 0, fail)).toThrow('WORKSHOP_MATERIALS_REQUIRED');
    expect(w).toEqual(before);
  });
  it('records the actual random numeric affix and material cost in the forge receipt', () => {
    const w = emptyTowerWorkshop(date); w.materials.ht = 3;
    workshopAction(w, 'workshop_forge', white, 1, () => 0, fail);
    expect(w.materials.ht).toBe(0); expect(w.items[0].affixes).toEqual([expect.objectContaining({ id: 'duangu', value: 1 })]);
    expect(w.lastForge).toMatchObject({ failed: false, successPercent: 100, cost: { ht: 3 }, item: w.items[0] });
    expect(w.items[0].set).toBeNull();
  });
  it('consumes materials on failure, records the residual white item and never returns a refund', () => {
    const w = emptyTowerWorkshop(date); w.materials.qw = 3;
    workshopAction(w, 'workshop_forge', { ...white, quality: '绿', set: 'dizun' }, 10, () => .99, fail);
    expect(w.materials.qw).toBe(0); expect(w.items).toHaveLength(1);
    expect(w.lastForge).toMatchObject({ failed: true, successPercent: 70, item: { quality: '白', set: null } });
  });
  it('debits auxiliary consumables from raw stock even when forging with refined ores', () => {
    const w = emptyTowerWorkshop(date); w.refined['粗炼'] = { qw: 3 }; w.materials.cuijl = 2;
    workshopAction(w, 'workshop_forge', { ...white, quality: '绿', grade: '粗炼', auxiliary: 'cuijl', auxiliaryCount: 2 }, 10, () => .99, fail);
    expect(w.refined['粗炼'].qw).toBe(0); expect(w.materials.cuijl).toBe(0);
    expect(w.lastForge).toMatchObject({ failed: true, successPercent: 84, cost: { qw: 3, cuijl: 2 } });
  });
  it('uses fixed server prices and one daily bucket per material', () => {
    const w = emptyTowerWorkshop(date);
    expect(workshopAction(w, 'workshop_purchase', { material: 'ht', quantity: 20 }, 1, () => 0, fail).cost).toBe(160);
    expect(() => workshopAction(w, 'workshop_purchase', { material: 'ht', quantity: 1 }, 1, () => 0, fail)).toThrow('WORKSHOP_DAILY_LIMIT');
    expect(workshopAction(w, 'workshop_purchase', { material: 'mt', quantity: 20 }, 1, () => 0, fail).cost).toBe(100);
    workshopState(w, '2026-09-24', fail); expect(w.dailyBought).toEqual({}); expect(w.materials).toEqual({ ht: 20, mt: 20 });
  });
  it.each([
    ['workshop_purchase', { material: 'ht', quantity: 1, price: 0 }],
    ['workshop_purchase', { material: 'ht', quantity: -1 }],
    ['workshop_refine', { material: '__proto__', grade: '粗炼', batches: 1 }],
    ['workshop_refine', { material: 'ht', grade: '粗炼', batches: 1.5 }],
    ['workshop_forge', { ...white, grade: '__proto__' }],
    ['workshop_forge', { ...white, set: 'constructor' }],
  ])('rejects forged %s payload before mutation', (kind, payload) => {
    const w = emptyTowerWorkshop(date), before = structuredClone(w);
    expect(() => workshopAction(w, kind as string, payload, 90, () => 0, fail)).toThrow('INVALID_WORKSHOP_ACTION'); expect(w).toEqual(before);
  });
});
