import { describe, expect, it } from 'vitest';
import * as e from './tower-defense-logic';

function economicState(state: e.TowerDefenseState) {
  const { lastAction: _feedback, ...unchanged } = state;
  return unchanged;
}

describe('explicit restock purchase transactions', () => {
  it.each([0, 1, 2, 3, 4])('keeps bought slot %i and all other offers intact without consuming RNG', (index) => {
    const original = e.createTowerDefenseState(31);
    const serialized = JSON.stringify(original);
    const offer = original.shop[index];
    const purchase = e.buyTowerShopOffer(original, offer.id);
    expect(purchase.ok).toBe(true);
    expect(JSON.stringify(original)).toBe(serialized);
    expect(purchase.state.shop.map((entry) => entry.id)).toEqual(original.shop.map((entry) => entry.id));
    expect(purchase.state.shop[index]).toEqual({ ...offer, soldOut: true });
    expect(purchase.state.rngSeed).toBe(original.rngSeed);
    expect(purchase.state.nextOfferId).toBe(original.nextOfferId);
    for (let slot = 0; slot < 5; slot++) if (slot !== index) expect(purchase.state.shop[slot]).toBe(original.shop[slot]);
    const retry = e.buyTowerShopOffer(purchase.state, offer.id);
    expect(retry.ok).toBe(false);
    expect(economicState(retry.state)).toEqual(economicState(purchase.state));
    const refreshed = e.refreshTowerDefenseShop(purchase.state);
    expect(refreshed.ok).toBe(true);
    expect(refreshed.state.credits).toBe(original.credits - offer.cost - e.TOWER_SHOP_REFRESH_COST);
    expect(refreshed.state.shop.every((entry) => !entry.soldOut)).toBe(true);
    expect(refreshed.state.shop.every((entry) => !original.shop.some((old) => old.id === entry.id))).toBe(true);
    const oldRetry = e.buyTowerShopOffer(refreshed.state, offer.id);
    expect(oldRetry.ok).toBe(false);
    expect(economicState(oldRetry.state)).toEqual(economicState(refreshed.state));
  });

  it('changing focused preferences back and forth cannot manufacture new stock or advance RNG', () => {
    let state = e.createTowerDefenseState();
    state = e.buyTowerShopOffer(state, state.shop[4].id).state;
    const bought = state;
    for (const type of ['slow', 'splash', 'push', 'shred', 'single', 'slow'] as const) {
      state = e.setTowerShopFocus(state, type).state;
      expect(state.shop).toEqual(bought.shop);
      expect(state.shopFocus).toBe(type);
      expect(state.credits).toBe(bought.credits);
      expect(state.rngSeed).toBe(bought.rngSeed);
      expect(state.nextOfferId).toBe(bought.nextOfferId);
      expect(e.buyTowerShopOffer(state, state.shop[4].id).ok).toBe(false);
    }
    const refreshed = e.refreshTowerDefenseShop(state);
    expect(refreshed.state.shop[4]).toMatchObject({ type: 'slow', source: 'focused' });
    expect(refreshed.state.shop[4].soldOut).not.toBe(true);
  });

  it.each(['paused', 'won', 'lost'] as const)('rejects purchase, refresh, and focus changes atomically while %s', (status) => {
    const state = { ...e.createTowerDefenseState(), status };
    for (const operation of [e.buyTowerShopOffer(state, state.shop[0].id), e.refreshTowerDefenseShop(state), e.setTowerShopFocus(state, 'slow')]) {
      expect(operation.ok).toBe(false);
      expect(economicState(operation.state)).toEqual(economicState(state));
    }
  });

  it('insufficient funds and full inventory do not mark an unbought offer sold out', () => {
    const initial = e.createTowerDefenseState();
    // Boundary fixtures, not a balance simulation or seeded player account.
    const noFunds = { ...initial, credits: 0 };
    for (const failed of [e.buyTowerShopOffer(noFunds, initial.shop[0].id), e.refreshTowerDefenseShop(noFunds)]) {
      expect(failed.ok).toBe(false); expect(economicState(failed.state)).toEqual(economicState(noFunds));
    }
    const full = { ...initial, inventory: Array.from({ length: e.TOWER_INVENTORY_CAPACITY }, (_, index) => ({
      id: `full-${index}`, type: 'slow' as const, tier: 3 as const, invested: 180,
    })) };
    const failed = e.buyTowerShopOffer(full, full.shop[0].id);
    expect(failed.code).toBe('inventory_full');
    expect(economicState(failed.state)).toEqual(economicState(full));
  });
});

function buyThree(state: e.TowerDefenseState, type: e.TowerType, slot: number): e.TowerDefenseState {
  state = e.setTowerShopFocus(state, type).state;
  for (let part = 0; part < 3; part++) {
    if (state.shop[4].soldOut) {
      const refresh = e.refreshTowerDefenseShop(state);
      expect(refresh.ok).toBe(true); state = refresh.state;
    }
    const purchase = e.buyTowerShopOffer(state, state.shop[4].id);
    expect(purchase.ok).toBe(true); state = purchase.state;
    expect(state.credits).toBeGreaterThanOrEqual(0);
  }
  const item = state.inventory.find((entry) => entry.type === type && entry.tier === 2);
  expect(item).toBeDefined();
  const deployed = e.deployInventoryTower(state, item!.id, slot);
  expect(deployed.ok).toBe(true); return deployed.state;
}

describe('real-resource restock challenge balance', () => {
  it.each([0, 1, 31, 77, 2027, 314159, 0xffffffff])('keeps a real opening and active control strategy viable without injected funds, seed %s', (seed) => {
    let state = e.upgradeTowerDefensePlant(e.createTowerDefenseState(seed)).state;
    for (const offer of state.shop.slice(0, 3)) {
      const bought = e.buyTowerShopOffer(state, offer.id);
      expect(bought.ok).toBe(true); state = bought.state;
    }
    state = e.deployInventoryTower(state, state.inventory[0].id, 4).state;
    state = e.startTowerDefense(state);
    let steps = 0;
    while (state.status === 'running' && steps++ < 1000) state = e.stepTowerDefense(state);
    expect(state.status).toBe('intermission');
    expect(state.coreHp).toBe(10);
    expect(state.credits).toBe(110 + e.TOWER_INTERMISSION_CREDIT_BONUS);
    const before = state.credits;
    state = buyThree(state, 'slow', 2);
    state = buyThree(state, 'push', 6);
    const parts = 3 * (e.focusedTowerPartCost('slow') + e.focusedTowerPartCost('push'));
    expect(state.credits).toBe(before - parts - 5 * e.TOWER_SHOP_REFRESH_COST);
    const heroStart = { x: state.hero.x, y: state.hero.y };
    let pulses = 0;
    state = e.startNextTowerDefenseWave(state);
    while (state.status === 'running' && steps++ < 1000) {
      // Model a player actively using the existing pulse, not an auto-play feature.
      const pulsed = e.triggerFocusPulse(state);
      if (pulsed !== state) pulses++;
      state = e.stepTowerDefense(pulsed);
      expect(state.credits).toBeGreaterThanOrEqual(0);
    }
    expect(state.status).toBe('won');
    expect(state.coreHp).toBe(6);
    expect(state.defeated).toBe(29);
    expect(state.breached).toBe(1);
    expect(pulses).toBeGreaterThan(0);
    expect(state.hero).toMatchObject(heroStart);
    expect(state.tick * e.TOWER_DEFENSE_TICK_MS).toBeGreaterThanOrEqual(90_000);
    expect(state.tick * e.TOWER_DEFENSE_TICK_MS).toBeLessThanOrEqual(180_000);
    const completed = JSON.stringify(state);
    expect(e.stepTowerDefense(state)).toBe(state);
    expect(e.startNextTowerDefenseWave(state)).toBe(state);
    expect(JSON.stringify(state)).toBe(completed);
  });

  it.each([0, 31, 77, 2027, 314159, 0xffffffff])('rewards an actively used third-tier armor-break build with a complete clear, seed %s', (seed) => {
    let state = e.upgradeTowerDefensePlant(e.createTowerDefenseState(seed)).state;
    for (const offer of state.shop.slice(0, 3)) state = e.buyTowerShopOffer(state, offer.id).state;
    state = e.deployInventoryTower(state, state.inventory[0].id, 4).state;
    state = e.startTowerDefense(state);
    let ticks = 0;
    while (state.status === 'running' && ticks++ < 1000) state = e.stepTowerDefense(state);
    expect(state.status).toBe('intermission');
    expect(state.credits).toBe(210);
    for (let part = 0; part < 6; part++) {
      if (state.shop[4].soldOut) {
        const refreshed = e.refreshTowerDefenseShop(state);
        expect(refreshed.ok).toBe(true); state = refreshed.state;
      }
      const bought = e.buyTowerShopOffer(state, state.shop[4].id);
      expect(bought.ok).toBe(true); state = bought.state;
    }
    const merged = e.mergeDeployedTower(state, 4);
    expect(merged.ok).toBe(true); state = merged.state;
    expect(state.credits).toBe(210 - 6 * e.focusedTowerPartCost('single') - 5 * e.TOWER_SHOP_REFRESH_COST);
    state = e.startNextTowerDefenseWave(state);
    while (state.status === 'running' && ticks++ < 1000) state = e.stepTowerDefense(e.triggerFocusPulse(state));
    expect(state.status).toBe('won'); expect(state.coreHp).toBe(10);
    expect(state.defeated).toBe(30); expect(state.breached).toBe(0);
    expect(state.tick * e.TOWER_DEFENSE_TICK_MS).toBeGreaterThanOrEqual(90_000);
    expect(state.tick * e.TOWER_DEFENSE_TICK_MS).toBeLessThanOrEqual(180_000);
  });
});
