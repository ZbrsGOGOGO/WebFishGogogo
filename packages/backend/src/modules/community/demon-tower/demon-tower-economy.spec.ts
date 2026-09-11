import { DEMON_TOWER_ATTRIBUTE_KEYS, DEMON_TOWER_WEAPONS, type DemonTowerAction, type DemonTowerAffix, type DemonTowerShopOfferId } from '@stealth-reader/shared';
import { actDemonTower, advanceDemonTowerState, createDemonTowerState, demonTowerEffectiveAttributes, demonTowerMaxHp, demonTowerProfileView, demonTowerSocialBuild, grantDemonTowerBossSpirit, type DemonTowerEngineState } from './demon-tower.engine';
import { demonTowerAction, demonTowerWorldView, initialDemonTowerWorld } from './demon-tower.rules';

const NOW = Date.UTC(2026, 8, 11, 8), DATE = '2026-09-11';
const context = { now: NOW, serviceDate: DATE, world: demonTowerWorldView(initialDemonTowerWorld(new Date(NOW))), expansionEnabled: true };
const act = (state: DemonTowerEngineState, action: DemonTowerAction, extra: Partial<typeof context> = {}) => actDemonTower(state, action, { ...context, ...extra });
const buy = (state: DemonTowerEngineState, offerId: DemonTowerShopOfferId, quantity = 1) => act(state, { kind: 'shop_purchase', payload: { offerId, quantity } });
function fresh(seed = 'synthetic-economy-safe-seed'): DemonTowerEngineState {
  const state = act(createDemonTowerState(NOW, DATE, seed), { kind: 'choose_innate', payload: { attribute: 'STR' } }).state;
  state.economy!.balance = 1000; state.materials.soul = 1000; return state;
}
function battle(state = fresh()): DemonTowerEngineState {
  for (let attempt = 0; attempt < 30; attempt++) {
    state = act(state, { kind: 'explore', payload: {} }).state;
    if (state.battle) return state;
  }
  throw new Error('Expected seeded encounter');
}
function win(state: DemonTowerEngineState, extra: Partial<typeof context> = {}): DemonTowerEngineState {
  state.battle!.player.attributes = { STR: 10000, DEF: 10000, SPD: 10000, AGI: 10000, LUCK: 10000 };
  for (const enemy of state.battle!.enemies) { enemy.hp = 1; enemy.shield = 0; enemy.effects = []; enemy.attributes.DEF = 0; enemy.attributes.AGI = 0; }
  for (let index = 0; index < 20 && state.battle; index++) state = act(state, { kind: 'attack', payload: { targetId: state.battle.enemies.find(enemy => enemy.hp > 0)!.id } }, extra).state;
  expect(state.battle).toBeNull(); expect(state.lastReport?.outcome).toBe('victory'); return state;
}

describe('Bound tower economy and manual requisitions', () => {
  it('projects zero balances for old saves without RNG, growth or database-adapter writes', () => {
    const old = createDemonTowerState(NOW, DATE, 'old-economy-fixture');
    const before = structuredClone(old);
    const view = demonTowerProfileView(old, NOW, 1, 0, true);
    expect(view.economy).toMatchObject({ version: 1, balance: 0, dailyEarned: 0, bossEarned: 0, ledger: [] });
    expect(view.availableActions).toEqual(expect.arrayContaining(['shop_purchase', 'use_rune']));
    expect(old).toEqual(before); expect(old.economy).toBeUndefined();
    expect(demonTowerProfileView(old, NOW, 1).economy).toBeUndefined();
    const adapted = act(old, { kind: 'choose_innate', payload: { attribute: 'STR' } }).state;
    expect(adapted.economy?.balance).toBe(0); expect(adapted.materials).toEqual(old.materials);
    expect(() => buy(old, 'permanent_STR')).toThrow('NOT_ENOUGH_SOUL'); expect(old).toEqual(before);
  });

  it.each(['shop_purchase', 'use_rune'] as const)('requires the existing expansion gate for %s and retains the action envelope validation', kind => {
    const action: DemonTowerAction = kind === 'shop_purchase' ? { kind, payload: { offerId: 'pill_STR', quantity: 1 } } : { kind, payload: { rune: 'critical', itemId: 'w1' } };
    expect(() => act(fresh(), action, { expansionEnabled: false })).toThrow('EXPANSION_DISABLED');
    expect(demonTowerAction({ ...action, expectedVersion: 1, requestId: '11111111-1111-4111-8111-111111111111' }).kind).toBe(kind);
  });

  it('pauses new rewards and temporary bonuses when expansion is disabled without deleting bound assets or in-flight snapshots', () => {
    const boosted = buy(buy(buy(fresh(), 'pill_STR', 3).state, 'pill_DEF', 3).state, 'permanent_DEF', 2).state;
    const balance = boosted.economy!.balance;
    const started = battle(boosted), snapshot = structuredClone(started.battle!);
    const pausedView = demonTowerProfileView(started, NOW, 1, 0, false);
    expect(pausedView.maxHp).toBe(snapshot.player.maxHp); expect(pausedView.effectiveAttributes).toEqual(snapshot.player.attributes);
    const result = win(started, { expansionEnabled: false });
    expect(result.economy!.balance).toBe(started.economy!.balance); expect(result.economy!.buffs).toEqual(boosted.economy!.buffs);
    expect(result.economy!.permanent.DEF).toBe(2);
    const idleView = demonTowerProfileView(boosted, NOW, 1, 0, false);
    expect(idleView.economy).toBeUndefined(); expect(idleView.effectiveAttributes).toEqual(demonTowerEffectiveAttributes(boosted, false));
    expect(idleView.maxHp).toBe(demonTowerMaxHp(boosted, false));
    const rift = act(boosted, { kind: 'expedition', payload: { mode: 'rift' } }).state;
    expect(win(rift, { expansionEnabled: false }).economy!.balance).toBe(balance);
    let sawEvent = false, sawBattle = false;
    for (let index = 0; index < 30 && (!sawEvent || !sawBattle); index++) {
      const state = buy(buy(fresh(`gate-fixture-seed-${index}`), 'pill_LUCK', 3).state, 'permanent_DEF', 2).state;
      const next = act(state, { kind: 'explore', payload: {} }, { expansionEnabled: false }).state;
      expect(next.economy!.balance).toBe(state.economy!.balance); expect(next.economy!.ledger).toEqual(state.economy!.ledger);
      if (next.battle) {
        sawBattle = true; expect(next.battle.economyVersion).toBeUndefined();
        expect(next.battle.player.attributes).toEqual(demonTowerEffectiveAttributes(next, false));
        expect(next.battle.player.maxHp).toBe(demonTowerMaxHp(next, false));
      } else sawEvent = true;
    }
    expect(sawEvent).toBe(true); expect(sawBattle).toBe(true);
  });

  it.each([0, -1, 1.5, 6, Number.MAX_SAFE_INTEGER])('rejects invalid purchase quantity %s without mutating balance, counters or RNG', quantity => {
    const state = fresh(), before = structuredClone(state);
    expect(() => buy(state, 'pill_STR', quantity)).toThrow('SHOP_QUANTITY_INVALID'); expect(state).toEqual(before);
  });

  it('rejects forged offer, extra server-owned price, excessive quota and insufficient funds atomically', () => {
    const state = fresh(), before = structuredClone(state);
    expect(() => actDemonTower(state, { kind: 'shop_purchase', payload: { offerId: '__proto__', quantity: 1 } }, context)).toThrow('INVALID_SHOP_OFFER');
    expect(() => actDemonTower(state, { kind: 'shop_purchase', payload: { offerId: 'pill_STR', quantity: 1, price: 0 } }, context)).toThrow('INVALID_ACTION');
    expect(() => buy(state, 'pill_STR', 4)).toThrow('SHOP_LIMIT_REACHED'); expect(state).toEqual(before);
    state.economy!.balance = 14; expect(() => buy(state, 'pill_STR')).toThrow('NOT_ENOUGH_SPIRIT_STONES');
    expect(state.economy!.balance).toBe(14); expect(state.economy!.dailyPurchases).toEqual({});
  });

  it('deducts exact prices, applies each temporary dimension and prevents a fourth pill', () => {
    let state = fresh(); const base = demonTowerEffectiveAttributes(state);
    for (const key of DEMON_TOWER_ATTRIBUTE_KEYS) state = buy(state, `pill_${key}`, 3).state;
    expect(state.economy!.balance).toBe(775);
    for (const key of DEMON_TOWER_ATTRIBUTE_KEYS) { expect(demonTowerEffectiveAttributes(state)[key]).toBe(base[key] + 15); expect(() => buy(state, `pill_${key}`)).toThrow('SHOP_LIMIT_REACHED'); }
    expect(state.economy!.ledger).toHaveLength(5); expect(state.economy!.ledger.every(entry => entry.amount === -45)).toBe(true);
    expect(state.rngCounter).toBe(fresh().rngCounter);
  });

  it('refuses partial stamina overflow and full healing, preserves free regeneration', () => {
    const state = fresh(), before = structuredClone(state);
    expect(() => buy(state, 'stamina_small')).toThrow('STAMINA_SPACE_REQUIRED');
    expect(() => buy(state, 'heal')).toThrow('HEALTH_FULL'); expect(state).toEqual(before);
    state.stamina = 98; expect(() => buy(state, 'stamina_small')).toThrow('STAMINA_SPACE_REQUIRED');
    state.stamina = 89; const small = buy(state, 'stamina_small').state;
    expect(small.stamina).toBe(92); expect(small.economy!.balance).toBe(980);
    const large = buy(small, 'stamina_large').state; expect(large.stamina).toBe(100); expect(large.economy!.balance).toBe(935);
    large.hp = 1; const healed = buy(large, 'heal').state; expect(healed.hp).toBe(demonTowerMaxHp(healed)); expect(healed.economy!.balance).toBe(905);
    const hurt = fresh(); hurt.hp = 1; hurt.stamina = 50;
    const restored = advanceDemonTowerState(hurt, NOW + 180_000, DATE); expect(restored.hp).toBeGreaterThan(1); expect(restored.stamina).toBe(51); expect(restored.economy!.balance).toBe(1000);
  });

  it('keeps permanent bonuses separate from free-point resets and limits each attribute for lifetime', () => {
    let state = fresh(); state = act(state, { kind: 'allocate', payload: { attribute: 'STR', points: 3 } }).state;
    for (const key of DEMON_TOWER_ATTRIBUTE_KEYS) state = buy(state, `permanent_${key}`, 5).state;
    expect(state.materials.soul).toBe(250); const beforeReset = demonTowerEffectiveAttributes(state);
    const reset = act(state, { kind: 'reset_attributes', payload: {} }).state;
    expect(reset.unspentPoints).toBe(3); expect(reset.attributes.STR).toBe(10); expect(demonTowerEffectiveAttributes(reset).STR).toBe(beforeReset.STR - 3);
    expect(reset.economy!.permanent).toEqual({ STR: 5, SPD: 5, AGI: 5, DEF: 5, LUCK: 5 });
    expect(() => buy(reset, 'permanent_STR')).toThrow('SHOP_LIMIT_REACHED');
    const nextWeek = advanceDemonTowerState(reset, NOW + 7 * 86_400_000, '2026-09-18'); expect(nextWeek.economy!.permanent).toEqual(reset.economy!.permanent);
  });

  it('resets daily/weekly quotas at Beijing boundaries, keeps lifetime assets and a pure GET', () => {
    const state = buy(buy(fresh(), 'pill_DEF', 3).state, 'rune_box').state;
    state.hp = demonTowerMaxHp(state); const before = structuredClone(state);
    const midnight = Date.parse('2026-09-12T00:00:00+08:00');
    const view = demonTowerProfileView(state, midnight, 1, 0, true).economy!;
    expect(view.buffs.DEF).toBe(0); expect(view.offers.find(offer => offer.id === 'pill_DEF')!.purchased).toBe(0);
    expect(view.offers.find(offer => offer.id === 'rune_box')!.purchased).toBe(1); expect(state).toEqual(before);
    const maintenance = demonTowerProfileView(state, midnight, 1, 0, true);
    expect(maintenance.effectiveAttributes.DEF).toBe(demonTowerEffectiveAttributes(state).DEF - 15);
    expect(maintenance.hp).toBeLessThanOrEqual(maintenance.maxHp); expect(state).toEqual(before);
    const tomorrow = advanceDemonTowerState(state, midnight, '2026-09-12');
    expect(tomorrow.economy!.balance).toBe(state.economy!.balance); expect(tomorrow.hp).toBe(demonTowerMaxHp(tomorrow));
    expect(tomorrow.hp).toBeLessThan(state.hp); expect(tomorrow.economy!.runes).toEqual(state.economy!.runes);
    const monday = advanceDemonTowerState(tomorrow, Date.parse('2026-09-14T00:00:00+08:00'), '2026-09-14');
    expect(monday.economy!.week).toBe('2026-09-14'); expect(monday.economy!.weeklyPurchases).toEqual({}); expect(monday.economy!.ledger).toEqual(state.economy!.ledger);
  });

  it('retains midnight-crossing combat snapshots but excludes temporary stats and HP from social builds', () => {
    const plain = fresh(), buffed = buy(buy(plain, 'pill_DEF', 3).state, 'pill_STR', 3).state;
    expect(demonTowerSocialBuild(buffed).attributes).toEqual(demonTowerSocialBuild(plain).attributes);
    expect(demonTowerSocialBuild(buffed).maxHp).toBe(demonTowerSocialBuild(plain).maxHp);
    const permanent = buy(buffed, 'permanent_DEF').state; expect(demonTowerSocialBuild(permanent).attributes.DEF).toBe(demonTowerSocialBuild(plain).attributes.DEF + 1);
    const started = battle(buffed), snapshot = structuredClone(started.battle);
    const next = advanceDemonTowerState(started, Date.parse('2026-09-12T00:00:00+08:00'), '2026-09-12');
    expect(next.economy!.buffs.DEF).toBe(0); expect(next.battle).toEqual(snapshot);
    const fightingView = demonTowerProfileView(next, Date.parse('2026-09-12T00:00:00+08:00'), 1, 0, true);
    expect(fightingView.maxHp).toBe(snapshot!.player.maxHp); expect(fightingView.effectiveAttributes).toEqual(snapshot!.player.attributes);
    expect(fightingView.hp).toBeLessThanOrEqual(fightingView.maxHp);
    const ended = win(next, { now: Date.parse('2026-09-12T00:00:00+08:00'), serviceDate: '2026-09-12' });
    expect(ended.hp).toBeLessThanOrEqual(demonTowerMaxHp(ended));
    expect(ended.economy!.buffs.DEF).toBe(0);
  });

  it('charges materials only when every possible draw fits, and grants exactly three per pack', () => {
    const state = fresh(), before = { ...state.materials }, result = buy(state, 'materials', 3).state;
    expect((result.materials.ore - before.ore) + (result.materials.clue - before.clue)).toBe(9); expect(result.economy!.balance).toBe(925);
    const full = fresh(); full.materials.ore = 999_998; const snapshot = structuredClone(full);
    expect(() => buy(full, 'materials')).toThrow('RESOURCE_FULL'); expect(full).toEqual(snapshot);
  });

  it('uses only eligible fine weapons and does not alter old weapon-box prices or pity', () => {
    const state = fresh(); expect(() => buy(state, 'fine_weapon_box')).toThrow('LOOT_LEVEL_REQUIRED'); state.level = 16;
    const result = buy(state, 'fine_weapon_box').state; expect(result.materials.soul).toBe(992); expect(result.expansion!.weaponBoxPity).toBe(0);
    const added = result.weapons.filter(weapon => !state.weapons.some(old => old.id === weapon.id));
    for (const weapon of added) expect(DEMON_TOWER_WEAPONS.find(def => def.id === weapon.id)).toMatchObject({ rarity: '精', requiredLevel: 16 });
    expect(() => buy(result, 'fine_weapon_box')).toThrow('SHOP_LIMIT_REACHED');
    expect(act(state, { kind: 'market', payload: { offer: 'weapon_box' } }).state.materials.soul).toBe(988);
    const full = fresh(); full.level = 16; full.weapons[0].qualityExperience = 1_000_000; expect(() => buy(full, 'fine_weapon_box')).toThrow('RESOURCE_FULL');
  });

  it('grants two bound runes, limits storage and requires legitimate unlocked weapon slots', () => {
    const state = buy(fresh(), 'rune_box').state;
    expect(Object.values(state.economy!.runes).reduce((sum, count) => sum + count, 0)).toBe(2); expect(state.materials.soul).toBe(960);
    expect(() => buy(state, 'rune_box')).toThrow('SHOP_LIMIT_REACHED');
    const rune = Object.keys(state.economy!.runes)[0] as DemonTowerAffix;
    const use: DemonTowerAction = { kind: 'use_rune', payload: { rune, itemId: 'w1' } };
    expect(() => act(state, use)).toThrow('RUNE_QUALITY_REQUIRED'); state.weapons[0].quality = 3;
    const applied = act(state, use).state; expect(applied.weapons[0].affixes).toEqual([rune]); expect(applied.economy!.runes[rune]).toBe(state.economy!.runes[rune]! - 1);
    const other = (['critical', 'dodge', 'leech', 'boss_damage', 'penetration'] as const).find(key => key !== rune)!;
    applied.economy!.runes[other] = 2;
    expect(() => act(applied, { kind: 'use_rune', payload: { rune: other, itemId: 'w1' } })).toThrow('RUNE_REPLACEMENT_REQUIRED');
    expect(() => act(applied, { kind: 'use_rune', payload: { rune: other, itemId: 'w1', replace: other } })).toThrow('RUNE_REPLACEMENT_INVALID');
    const replaced = act(applied, { kind: 'use_rune', payload: { rune: other, itemId: 'w1', replace: rune } }).state;
    expect(replaced.weapons[0].affixes).toEqual([other]); expect(replaced.economy!.runes[other]).toBe(1);
    expect(() => act(replaced, { kind: 'use_rune', payload: { rune: other, itemId: 'w1' } })).toThrow('RUNE_ALREADY_APPLIED');
    const full = fresh(); full.economy!.runes.critical = 98; expect(() => buy(full, 'rune_box')).toThrow('RUNE_STORAGE_FULL'); expect(full.materials.soul).toBe(1000);
  });

  it('never purchases during battle, and offers explain the same server-side reason', () => {
    const state = battle(), before = structuredClone(state);
    expect(() => buy(state, 'pill_STR')).toThrow('BATTLE_IN_PROGRESS'); expect(state).toEqual(before);
    const view = demonTowerProfileView(state, NOW, 1, 0, true);
    expect(view.availableActions).not.toContain('shop_purchase'); expect(view.economy!.offers.every(offer => !offer.available && offer.reason === 'BATTLE_IN_PROGRESS')).toBe(true);
  });

  it('credits exploration only on settlement, never per turn, loss, fleeing or old battle backfill', () => {
    const started = battle(), initial = started.economy!.balance;
    const ongoing = structuredClone(started); ongoing.battle!.enemies[0].hp = 100_000; ongoing.battle!.enemies[0].maxHp = 100_000;
    const stepped = act(ongoing, { kind: 'attack', payload: { targetId: ongoing.battle!.enemies[0].id } }).state;
    expect(stepped.battle).not.toBeNull(); expect(stepped.economy!.balance).toBe(initial);
    const won = win(structuredClone(started)); expect(won.economy!.balance - initial).toBeGreaterThanOrEqual(2); expect(won.economy!.balance - initial).toBeLessThanOrEqual(4);
    const old = structuredClone(started); delete old.battle!.economyVersion; const finished = win(old); expect(finished.economy!.balance).toBe(initial);
    const fled = act(started, { kind: 'flee', payload: {} }).state; expect(fled.economy!.balance).toBe(initial);
    const lost = structuredClone(started); lost.battle!.player.hp = 0; const ended = act(lost, { kind: 'attack', payload: { targetId: lost.battle!.enemies[0].id } }).state;
    expect(ended.lastReport!.outcome).toBe('defeat'); expect(ended.economy!.balance).toBe(initial);
  });

  it('credits event and rift ranges once while leaving the old combat RNG stream unchanged', () => {
    let eventSeen = false;
    for (let index = 0; index < 30 && !eventSeen; index++) {
      const state = fresh(`event-unchanged-seed-${index}`), without = structuredClone(state); delete without.economy;
      const result = act(state, { kind: 'explore', payload: {} });
      const baseline = act(without, { kind: 'explore', payload: {} }, { expansionEnabled: false });
      expect(result.state.rngCounter).toBe(baseline.state.rngCounter);
      if (!result.state.battle) { eventSeen = true; expect(result.state.economy!.balance - state.economy!.balance).toBeGreaterThanOrEqual(5); expect(result.state.economy!.balance - state.economy!.balance).toBeLessThanOrEqual(15); }
    }
    expect(eventSeen).toBe(true);
    const rift = act(fresh(), { kind: 'expedition', payload: { mode: 'rift' } }).state, before = rift.economy!.balance, won = win(rift);
    expect(won.economy!.balance - before).toBeGreaterThanOrEqual(20); expect(won.economy!.balance - before).toBeLessThanOrEqual(40);
  });

  it('grants world boss stones only via effective settlement helper and enforces nested daily caps', () => {
    const state = fresh(), challenged = act(state, { kind: 'challenge_boss', payload: { floor: 1 } });
    expect(challenged.state.economy!.balance).toBe(state.economy!.balance); expect(challenged.worldEffect?.amount).toBeGreaterThan(0);
    const settled = challenged.state; expect(grantDemonTowerBossSpirit(settled, 19, NOW, DATE, [])).toBe(9);
    expect(grantDemonTowerBossSpirit(settled, 1000, NOW, DATE, [])).toBe(91); expect(grantDemonTowerBossSpirit(settled, 1000, NOW, DATE, [])).toBe(0);
    expect(settled.economy!.bossEarned).toBe(100); expect(settled.economy!.dailyEarned).toBe(100);
    const capped = fresh(); capped.economy!.dailyEarned = 199;
    expect(grantDemonTowerBossSpirit(capped, 20, NOW, DATE, [])).toBe(1); expect(capped.economy!.dailyEarned).toBe(200);
    expect(grantDemonTowerBossSpirit(capped, 0, NOW, DATE, [])).toBe(0);
    expect(() => grantDemonTowerBossSpirit(capped, -1, NOW, DATE, [])).toThrow('INVALID_ECONOMY_REWARD');
    const full = fresh(); full.economy!.balance = 1_000_000; expect(grantDemonTowerBossSpirit(full, 200, NOW, DATE, [])).toBe(0);
  });

  it('caps every non-boss settlement at the shared daily ceiling without consuming spending quota', () => {
    const started = battle(); started.economy!.dailyEarned = 199; const initial = started.economy!.balance;
    const capped = win(started); expect(capped.economy!.balance).toBe(initial + 1); expect(capped.economy!.dailyEarned).toBe(200);
    const spent = buy(capped, 'pill_STR').state; expect(spent.economy!.dailyEarned).toBe(200);
    const exhausted = battle(spent), next = win(exhausted); expect(next.economy!.balance).toBe(spent.economy!.balance);
    expect(next.economy!.dailyEarned).toBe(200); expect(next.economy!.bossEarned).toBe(0);
  });

  it('bounds private ledger history, exposes only safe copies, and rejects corrupted economy saves', () => {
    let state = fresh();
    for (let day = 0; day < 40; day++) {
      const now = NOW + day * 86_400_000, date = new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
      state = advanceDemonTowerState(state, now, date); grantDemonTowerBossSpirit(state, 2, now, date, []);
    }
    expect(state.economy!.ledger).toHaveLength(30); expect(state.economy!.ledgerSequence).toBe(40);
    const view = demonTowerProfileView(state, NOW + 39 * 86_400_000, 1, 0, true).economy!;
    expect(view.ledger[0].id).toBe('40'); expect(JSON.stringify(view)).not.toContain(state.rngSeed); expect(view).not.toHaveProperty('ledgerSequence');
    view.ledger[0].description = 'client mutation'; expect(state.economy!.ledger.at(-1)!.description).not.toBe('client mutation');
    const corrupt = fresh(); corrupt.economy!.balance = -1; expect(() => advanceDemonTowerState(corrupt, NOW, DATE)).toThrow('INVALID_ECONOMY_STATE');
    const mismatch = fresh(); mismatch.economy!.buffs.STR = 15; expect(() => advanceDemonTowerState(mismatch, NOW, DATE)).toThrow('INVALID_ECONOMY_STATE');
  });

  it('safely resumes after a rollback client advanced outer dates while preserving unknown economy JSON', () => {
    const state = buy(buy(buy(fresh(), 'pill_STR', 3).state, 'permanent_DEF', 2).state, 'rune_box').state;
    const original = structuredClone(state.economy!);
    // Old builds know daily progress but not this additive optional economy key.
    state.daily.serviceDate = '2026-09-14'; state.lastActionAt = NOW + 3 * 86_400_000;
    const resumed = advanceDemonTowerState(state, NOW + 3 * 86_400_000, '2026-09-14');
    expect(resumed.economy).toMatchObject({ serviceDate: '2026-09-14', week: '2026-09-14', balance: original.balance, buffs: { STR: 0 }, permanent: { DEF: 2 }, dailyPurchases: {}, weeklyPurchases: {} });
    expect(resumed.economy!.runes).toEqual(original.runes); expect(resumed.economy!.ledger).toEqual(original.ledger);
    expect(state.economy).toEqual(original);
    const future = fresh(); future.economy!.serviceDate = '2026-09-12';
    expect(() => advanceDemonTowerState(future, NOW, DATE)).toThrow('INVALID_ECONOMY_STATE');
  });
});
