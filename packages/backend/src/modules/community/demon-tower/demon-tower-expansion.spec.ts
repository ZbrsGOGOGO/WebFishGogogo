import { DEMON_TOWER_ARENA_SKILLS, DEMON_TOWER_SOURCE_WEIGHTS, DEMON_TOWER_SKILLS, DEMON_TOWER_WEAPONS, DEMON_TOWER_ULTIMATES,
  demonTowerItemRarity, demonTowerLootPool, demonTowerQualityLimit, demonTowerStrengthRating, demonTowerUpgradeCost,
  type DemonTowerAction, type DemonTowerLootSource, type DemonTowerWeaponId } from '@stealth-reader/shared';
import { actDemonTower, advanceDemonTowerState, createDemonTowerState, demonTowerEffectiveAttributes, demonTowerMaxHp, demonTowerProfileView, demonTowerSocialBuild, demonTowerWeightedLoot, grantDemonTowerBossClear, type DemonTowerEngineState } from './demon-tower.engine';
import { demonTowerWorldView, initialDemonTowerWorld } from './demon-tower.rules';
import { simulateDemonTowerDuel } from './demon-tower-social.engine';
import { initialDemonTowerSquad, stepDemonTowerSquad } from './demon-tower-squad.engine';

const NOW = Date.UTC(2026, 8, 9, 9), DATE = '2026-09-09';
const world = demonTowerWorldView(initialDemonTowerWorld(new Date(NOW)));
const context = { now: NOW, serviceDate: DATE, world, expansionEnabled: true };
const act = (state: DemonTowerEngineState, action: DemonTowerAction, extra: Partial<typeof context> = {}) => actDemonTower(state, action, { ...context, ...extra });
function fresh(level = 1, seed = 'expansion-synthetic-seed'): DemonTowerEngineState {
  const state = createDemonTowerState(NOW, DATE, seed); state.level = level; state.hp = demonTowerMaxHp(state); state.materials = { ore: 1000, herb: 1000, soul: 1000, clue: 0 };
  return act(state, { kind: 'arena_enroll', payload: { enabled: true } }).state;
}
function battle(id: DemonTowerWeaponId, star = 5): DemonTowerEngineState {
  let state = fresh(120); state.weapons = DEMON_TOWER_WEAPONS.map(item => ({ id: item.id, quality: 0, spareCopies: 0, star: item.id === id ? star : 1, favor: 0 }));
  state.skills = DEMON_TOWER_SKILLS.map(item => ({ id: item.id, quality: 0, spareCopies: 0, star: 1, favor: 0 }));
  state.loadout = { mainHand: id, artifact: null, activeSkills: ['s1'], passiveSkills: ['s9'] }; state.hp = demonTowerMaxHp(state);
  state = act(state, { kind: 'expedition', payload: { mode: 'rift' } }).state;
  Object.assign(state.battle!.player, { hp: 500, maxHp: 1000, attributes: { STR: 40, SPD: 1000, AGI: 40, DEF: 40, LUCK: 40 } });
  for (const enemy of state.battle!.enemies) Object.assign(enemy, { hp: 100_000, maxHp: 100_000, shield: 0, effects: [], mechanic: undefined, boss: false, attributes: { STR: 20, SPD: 0, AGI: 0, DEF: 0, LUCK: 0 } });
  return state;
}
const attack = (state: DemonTowerEngineState) => act(state, { kind: 'attack', payload: { targetId: state.battle!.enemies.find(enemy => enemy.hp > 0)!.id } }).state;

describe('Demon tower free expansion rules', () => {
  it('defaults to off, rejects every new action when disabled, and pure GET never adapts inventory or RNG', () => {
    const state = createDemonTowerState(NOW, DATE, 'legacy-safe-synthetic-seed'); state.weapons[0].spareCopies = 20;
    const before = structuredClone(state);
    for (const action of [{ kind: 'expedition', payload: { mode: 'rift' } }, { kind: 'arena_enroll', payload: { enabled: true } }, { kind: 'market', payload: { offer: 'skill_box' } }] as DemonTowerAction[]) expect(() => act(state, action, { expansionEnabled: false })).toThrow('EXPANSION_DISABLED');
    const view = demonTowerProfileView(state, NOW, 1, 0, true);
    expect(view.expansion?.skillPages).toBe(0); expect(state).toEqual(before); expect(state.expansion).toBeUndefined();
    expect(demonTowerProfileView(state, NOW, 1).expansion).toBeUndefined();
  });
  it('migrates old duplicates once and never reduces older high quality or star assets', () => {
    const state = createDemonTowerState(NOW, DATE, 'legacy-assets-safe'); state.weapons[0].quality = 5; state.weapons[0].spareCopies = 50; state.weapons[0].star = 4; state.weapons[0].favor = 38;
    const migrated = act(state, { kind: 'arena_enroll', payload: { enabled: true } }).state;
    expect(migrated.weapons[0]).toMatchObject({ quality: 5, qualityExperience: 50, spareCopies: 0, star: 4, favor: 38 });
    const again = act(migrated, { kind: 'arena_enroll', payload: { enabled: false } }).state;
    expect(again.weapons).toEqual(migrated.weapons); expect(state.weapons[0].spareCopies).toBe(50);
  });
  it('does not charge an unconfirmed extra upgrade when first-write adaptation already fulfills the requested upgrade', () => {
    const state = createDemonTowerState(NOW, DATE, 'legacy-upgrade-consent'); state.level = 16; state.weapons[0].spareCopies = 1;
    const result = act(state, { kind: 'upgrade', payload: { itemType: 'weapon', itemId: 'w1' } }).state;
    expect(result.weapons[0].quality).toBe(1); expect(result.materials).toEqual(state.materials);
  });
  it.each([[1, '精', 3], [15, '精', 3], [16, '精', 5], [30, '灵', 0], [31, '灵', 7], [46, '仙', 9], [60, '神', 0], [61, '神', 9]] as const)('uses v0.6 realm table Lv%i %s +%i', (level, rarity, cap) => expect(demonTowerQualityLimit(rarity, level)).toBe(cap));
  it('uses +5 at Lv16 rather than the old Lv24 formula; stores future experience then applies on level boundary', () => {
    expect(demonTowerUpgradeCost('weapon', 'w1', 4, 0, 16, false, '精')).toMatchObject({ available: true, requiredLevel: 16 });
    let state = fresh(15); state.weapons[0].quality = 3; state.weapons[0].qualityExperience = 8; state.experience = 100000;
    state = act(state, { kind: 'train', payload: {} }).state;
    expect(state.weapons[0]).toMatchObject({ quality: 5, qualityExperience: 6 });
  });
  it.each(Object.keys(DEMON_TOWER_SOURCE_WEIGHTS) as DemonTowerLootSource[])('publishes and samples source %s using two-stage non-empty level-filtered pools', source => {
    for (const kind of ['weapon', 'skill'] as const) {
      const pool = demonTowerLootPool(kind, 120, '凡', source);
      if (!pool.length) { expect(source).toBe('meditation'); expect(kind).toBe('weapon'); continue; }
      for (let i = 0; i < 100; i += 1) {
        const chosen = demonTowerWeightedLoot(kind, 120, '凡', i / 100, (99 - i) / 100, undefined, source);
        expect(pool.some(group => group.items.some(item => item.id === chosen.id))).toBe(true);
      }
    }
  });
  it('checks 100,000 real weighted draws per source and kind within 0.3 percentage points of every published item probability', () => {
    let seed = 918273;
    const roll = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x1_0000_0000; };
    for (const source of Object.keys(DEMON_TOWER_SOURCE_WEIGHTS) as DemonTowerLootSource[]) for (const kind of ['weapon', 'skill'] as const) {
      const pool = demonTowerLootPool(kind, 120, '凡', source); if (!pool.length) continue;
      const count: Record<string, number> = {};
      for (let i = 0; i < 100_000; i += 1) { const item = demonTowerWeightedLoot(kind, 120, '凡', roll(), roll(), undefined, source); count[item.id] = (count[item.id] ?? 0) + 1; }
      const totalWeight = pool.reduce((sum, group) => sum + group.weight, 0);
      for (const group of pool) for (const item of group.items) {
        const expected = group.weight / totalWeight * item.weight / group.items.reduce((sum, entry) => sum + entry.weight, 0);
        expect(Math.abs((count[item.id] ?? 0) / 100_000 - expected)).toBeLessThan(0.003);
      }
    }
  }, 30_000);
  it('meditation grants skills/pages only, uses its own counters and never changes ordinary guarantee state', () => {
    const state = fresh(1), result = act(state, { kind: 'expedition', payload: { mode: 'meditate' } });
    expect(result.state.weapons).toEqual(state.weapons); expect(result.state.expansion!.skillPages).toBeGreaterThanOrEqual(1);
    expect(result.state.expansion!.skillPages).toBeLessThanOrEqual(3); expect(result.state.lootPity).toEqual(state.lootPity);
    expect(result.state.growth!.misses).toEqual(state.growth!.misses); expect(result.state.stamina).toBe(state.stamina - 2);
    result.state.expansion!.meditationsToday = 10; expect(() => act(result.state, { kind: 'expedition', payload: { mode: 'meditate' } })).toThrow('EXPEDITION_DAILY_LIMIT');
  });
  it('runs durable rift combat and rewards only victory, not starting or fleeing', () => {
    const state = fresh(61), started = act(state, { kind: 'expedition', payload: { mode: 'rift' } }).state;
    expect(started.battle).toMatchObject({ source: 'rift', expansionVersion: 1 }); expect(started.battle!.enemies).toHaveLength(2);
    expect(started.weapons).toEqual(state.weapons); expect(started.expansion!.skillPages).toBe(0);
    const fled = act(started, { kind: 'flee', payload: {} }).state;
    expect(fled.expansion!.riftsToday).toBe(1); expect(fled.expansion!.skillPages).toBe(0);
    const winning = structuredClone(started); winning.battle!.player.attributes = { STR: 10000, SPD: 10000, AGI: 1, DEF: 500, LUCK: 1 }; winning.loadout.mainHand = 'w1';
    for (const enemy of winning.battle!.enemies) { enemy.hp = 1; enemy.attributes.AGI = 0; }
    let end = winning; for (let i = 0; i < 8 && end.battle; i += 1) end = attack(end);
    expect(end.battle).toBeNull(); expect(end.lastReport?.source).toBe('rift'); expect(end.expansion).toMatchObject({ skillPages: 2, essences: 1 });
    expect(end.lootPity).toEqual(state.lootPity);
  });
  it('week and day counters reset at Beijing boundaries without resetting boxes or reward ownership', () => {
    const state = fresh(); state.expansion!.riftsToday = 5; state.expansion!.weeklyBossAttempts = 3; state.expansion!.weaponBoxPity = 8; state.expansion!.claimedBossFloors = [1];
    const now = Date.UTC(2026, 8, 13, 16), next = advanceDemonTowerState(state, now, '2026-09-14');
    expect(next.expansion).toMatchObject({ riftsToday: 0, weeklyBossAttempts: 0, weaponBoxPity: 8, claimedBossFloors: [1], week: '2026-09-14' });
  });
  it('honors weapon box guarantee every tenth purchase, fails low-level before debit, and preserves normal pity', () => {
    expect(() => act(fresh(1), { kind: 'market', payload: { offer: 'weapon_box' } })).toThrow('LOOT_LEVEL_REQUIRED');
    let state = fresh(16); const ordinary = structuredClone(state.lootPity);
    for (let i = 0; i < 10; i += 1) state = act(state, { kind: 'market', payload: { offer: 'weapon_box' } }).state;
    expect(state.expansion).toMatchObject({ weaponBoxes: 10, weaponBoxPity: 0 }); expect(state.materials.soul).toBe(880);
    expect(state.weapons.some(owned => DEMON_TOWER_WEAPONS.find(item => item.id === owned.id)!.rarity === '灵')).toBe(true); expect(state.lootPity).toEqual(ordinary);
  });
  it('lets exactly 30 pages choose a legal named celestial skill and rejects forged/underlevel selection', () => {
    const state = fresh(46); state.expansion!.skillPages = 30;
    const result = act(state, { kind: 'market', payload: { offer: 'skill_selection', itemId: 's13' } }).state;
    expect(result.skills.some(item => item.id === 's13')).toBe(true); expect(result.expansion!.skillPages).toBe(0);
    expect(() => act(result, { kind: 'market', payload: { offer: 'skill_selection', itemId: 's13' } })).toThrow('NOT_ENOUGH_SKILL_PAGES');
    state.level = 45; expect(() => act(state, { kind: 'market', payload: { offer: 'skill_selection', itemId: 's13' } })).toThrow('SKILL_LEVEL_REQUIRED');
    expect(() => act(state, { kind: 'market', payload: { offer: 'skill_selection', itemId: 'w4' } })).toThrow('INVALID_SKILL');
  });
  it('enlightenment never charges if all level-eligible skills are owned and charges exactly once otherwise', () => {
    const state = fresh(1); state.skills = DEMON_TOWER_SKILLS.filter(item => item.requiredLevel <= 1).map(item => ({ id: item.id, quality: 0, spareCopies: 0 }));
    expect(() => act(state, { kind: 'market', payload: { offer: 'enlightenment' } })).toThrow('ALL_ELIGIBLE_SKILLS_OWNED');
    state.skills.pop(); const after = act(state, { kind: 'market', payload: { offer: 'enlightenment' } }).state;
    expect(after.skills).toHaveLength(4); expect(after.materials.soul).toBe(965);
  });
  it('first kill contribution claims are proven by service context, once per floor, with equipment/tokens/title', () => {
    const state = fresh(31), claim = { kind: 'claim_boss_loot', payload: { floor: 1 } } as const;
    expect(() => act(state, claim)).toThrow('BOSS_CONTRIBUTION_REQUIRED');
    const resolved = actDemonTower(state, claim, { ...context, world: { ...world, phase: 'passage', boss: { ...world.boss, hp: 0 } }, contributedFloors: [1] });
    expect(resolved.state.expansion).toMatchObject({ claimedBossFloors: [1], passageTokens: 1, essences: 2 });
    expect(resolved.state.expansion!.titles).toHaveLength(1); expect(resolved.state.weapons.some(owned => ['灵', '仙'].includes(DEMON_TOWER_WEAPONS.find(item => item.id === owned.id)!.rarity))).toBe(true);
    const before = structuredClone(resolved.state); grantDemonTowerBossClear(resolved.state, 1, []); expect(resolved.state).toEqual(before);
  });
  it('breakthrough consumes exact bound resources, adds second main stat and preserves quality', () => {
    const state = fresh(31); state.weapons[0].quality = 5; state.expansion!.essences = 10;
    const before = demonTowerEffectiveAttributes(state), result = act(state, { kind: 'breakthrough', payload: { itemId: 'w1' } }).state;
    expect(result.weapons[0]).toMatchObject({ quality: 5, breakthrough: 1 }); expect(result.expansion!.essences).toBe(6); expect(result.materials.ore).toBe(980);
    expect(demonTowerEffectiveAttributes(result).STR).toBe(before.STR + 3); expect(demonTowerEffectiveAttributes(result).SPD).toBe(before.SPD + 4);
    expect(demonTowerItemRarity('精', 1)).toBe('灵');
  });
  it('unlocks exactly three distinct affixes at +3/+6/+9 without rerolling on later writes', () => {
    const state = createDemonTowerState(NOW, DATE, 'affix-slot-fixture'); state.level = 120; state.weapons.push({ id: 'w4', quality: 9, spareCopies: 0 });
    let migrated = act(state, { kind: 'arena_enroll', payload: { enabled: true } }).state;
    const affixes = migrated.weapons.find(item => item.id === 'w4')!.affixes!;
    expect(affixes).toHaveLength(3); expect(new Set(affixes).size).toBe(3);
    migrated = act(migrated, { kind: 'arena_enroll', payload: { enabled: false } }).state;
    expect(migrated.weapons.find(item => item.id === 'w4')!.affixes).toEqual(affixes);
  });
  it.each(['w4', 'w8', 'w12', 'w16', 'w20'] as const)('activates independent five-star ultimate %s once per encounter', id => {
    let state = battle(id); state = attack(state); state = attack(state);
    expect(state.battle!.log.some(log => log.text.includes(DEMON_TOWER_ULTIMATES[id]!.name))).toBe(true);
    if (id !== 'w16') expect(state.battle!.log.filter(log => log.text.includes('已觉醒，本场仅触发一次') && log.text.includes(DEMON_TOWER_ULTIMATES[id]!.name))).toHaveLength(1);
    const lower = attack(battle(id, 4)); expect(lower.battle!.log.some(log => log.text.includes(DEMON_TOWER_ULTIMATES[id]!.name))).toBe(false);
  });
  it('skill stars grow independently, including passive mastery, and bound skills need no fake inventory unlock', () => {
    const state = battle('w3', 1); state.skills = state.skills.filter(item => item.id !== 's16');
    expect(demonTowerProfileView(state, NOW, 1, 0, true).battle!.availableSkills.some(item => item.id === 's16' && item.usable)).toBe(true);
    const own = state.skills.find(item => item.id === 's1')!; own.favor = 14; own.quality = 2;
    state.skills.find(item => item.id === 's9')!.favor = 14;
    const after = act(state, { kind: 'skill', payload: { skillId: 's1' } }).state;
    expect(after.skills.find(item => item.id === 's1')).toMatchObject({ star: 2, favor: 0, quality: 2 });
    expect(after.skills.find(item => item.id === 's9')).toMatchObject({ star: 2, favor: 0 });
    const bound = act(state, { kind: 'skill', payload: { skillId: 's16' } }).state;
    expect(bound.skills.some(item => item.id === 's16')).toBe(false); expect(bound.battle!.totalDamage).toBeGreaterThan(0);
  });
  it('free star symbols never reduce star, quality, favor on failure and max star never spends', () => {
    for (let index = 0; index < 80; index += 1) {
      const state = fresh(61, `star-probability-${index}`); state.weapons[0].star = 4; state.weapons[0].favor = 37;
      const after = act(state, { kind: 'star_up', payload: { itemType: 'weapon', itemId: 'w1' } }).state;
      expect(after.weapons[0].star).toBeGreaterThanOrEqual(4); expect(after.weapons[0].quality).toBe(0);
      expect(after.weapons[0].favor).toBe(after.weapons[0].star === 4 ? 37 : 0); expect(after.materials.soul).toBe(960);
    }
    const maxed = fresh(); maxed.weapons[0].star = 5;
    expect(() => act(maxed, { kind: 'star_up', payload: { itemType: 'weapon', itemId: 'w1' } })).toThrow('STAR_MAXIMUM');
  });
  it('recycles only explicitly selected stored experience, never consumes equipment or existing +N', () => {
    const state = fresh(); state.weapons[0].quality = 5; state.weapons[0].qualityExperience = 4;
    const after = act(state, { kind: 'market', payload: { offer: 'recycle_quality', itemId: 'w1' } }).state;
    expect(after.weapons[0]).toMatchObject({ quality: 5, qualityExperience: 3 }); expect(after.materials.soul).toBe(1003);
  });
  it('projects no RNG, private matchup list or build snapshots, even with expansion enabled', () => {
    const state = fresh(); state.arenaOpponentsToday = ['private-cooldown-id'];
    const view = JSON.stringify(demonTowerProfileView(state, NOW, 1, 0, true));
    expect(view).not.toMatch(/rngSeed|rngCounter|arenaOpponentsToday|private-cooldown-id|requestHash/);
  });
  it('publishes an exact recomputable weighted strength rubric for all 36 items', () => {
    for (const [kind, items] of [['weapon', DEMON_TOWER_WEAPONS], ['skill', DEMON_TOWER_SKILLS]] as const) for (const item of items) {
      const rating = demonTowerStrengthRating(kind, item.id)!;
      expect(rating.score).toBe(Math.round(rating.numeric * 0.35 + rating.permanent * 0.25 + rating.utility * 0.25 + rating.breadth * 0.15));
    }
  });
});

describe('Demon tower opt-in social pure rules', () => {
  it('learns the five three-step SP trees and enforces prerequisites/loadout limits without resetting progression on re-enrollment', () => {
    let state = fresh(61); expect(DEMON_TOWER_ARENA_SKILLS).toHaveLength(15);
    expect(() => act(state, { kind: 'arena_learn', payload: { skillId: 'str3' } })).toThrow('ARENA_PREREQUISITE_REQUIRED');
    state = act(state, { kind: 'arena_learn', payload: { skillId: 'str1' } }).state;
    expect(state.expansion!.arena!.skillPoints).toBe(2);
    expect(() => act(state, { kind: 'arena_equip', payload: { skills: ['str1', 'str1'] } })).toThrow('INVALID_ARENA_LOADOUT');
    state = act(state, { kind: 'arena_equip', payload: { skills: ['str1'] } }).state;
    state = act(state, { kind: 'arena_enroll', payload: { enabled: false } }).state;
    state = act(state, { kind: 'arena_enroll', payload: { enabled: true } }).state;
    expect(state.expansion!.arena!.skillPoints).toBe(2); expect(state.expansion!.arena!.loadout).toEqual(['str1']);
  });
  it('uses server-only opponent snapshots and refuses the same opponent twice in a day', () => {
    const state = fresh(61), other = fresh(1), original = structuredClone(other);
    const action = { kind: 'arena_challenge', payload: { opponentPublicId: 'opponent-public-id' } } as const;
    expect(() => act(state, action)).toThrow('ARENA_OPPONENT_UNAVAILABLE');
    const ctx = { ...context, arenaOpponent: { publicId: 'opponent-public-id', displayName: '同事', build: demonTowerSocialBuild(other) } };
    const result = actDemonTower(state, action, ctx);
    expect(result.state.expansion!.arena!.attemptsToday).toBe(1); expect(other).toEqual(original);
    expect(() => actDemonTower(result.state, action, ctx)).toThrow('ARENA_OPPONENT_ALREADY_CHALLENGED');
    expect(result.officeCoinIntent).toBe(0); expect(result.state.expansion!.arena!.lastReport!.rounds).toBeLessThanOrEqual(30);
  });
  it('keeps duel calculation deterministic, bounded, independent from account HP and supports every arena active', () => {
    for (const skill of DEMON_TOWER_ARENA_SKILLS.filter(item => item.kind !== 'passive')) {
      const left = demonTowerSocialBuild(fresh(61)), right = demonTowerSocialBuild(fresh(61)); left.arenaSkills = [skill.id];
      const before = structuredClone(left), result = simulateDemonTowerDuel(left, right, () => 0.5);
      expect(result.rounds).toBeLessThanOrEqual(30); expect(result.log.length).toBeLessThanOrEqual(100);
      expect(result).toEqual(simulateDemonTowerDuel(left, right, () => 0.5)); expect(left).toEqual(before);
    }
  });
  it('squad engine requires all explicit ready builds, enforces max rounds and resolves actual damage/guards/summons', () => {
    const state = initialDemonTowerSquad('one', 'squad-test-seed'); expect(() => stepDemonTowerSquad(state, 1)).toThrow();
    const build = demonTowerSocialBuild(fresh(61)); build.attributes.STR = 10; build.attributes.SPD = 5; build.attributes.AGI = 0; build.attributes.DEF = 100; build.maxHp = 1000;
    state.members = ['one', 'two'].map(userId => ({ userId, ready: true, build, hp: 1000, maxHp: 1000, damage: 0, claimed: false, revived: false }));
    state.bossHp = state.bossMaxHp = 5000;
    let result = { state, status: 'active' as 'active' | 'victory' | 'defeat' };
    for (let i = 0; i < 20 && result.status === 'active'; i += 1) result = stepDemonTowerSquad(result.state, 1);
    expect(result.status).toBe('defeat'); expect(result.state.round).toBe(20); expect(result.state.members[0].damage).toBeGreaterThan(0);
    expect(result.state.log.some(text => text.includes('助灵'))).toBe(true); expect(state.round).toBe(0);
  });
  it('squad support can revive a fallen ally once rather than only healing the acting player', () => {
    const state = initialDemonTowerSquad('healer', 'squad-revive'); const build = demonTowerSocialBuild(fresh(61)); build.active = ['s13'];
    state.members = ['healer', 'ally'].map(userId => ({ userId, ready: true, build, hp: userId === 'ally' ? 0 : 100, maxHp: 100, damage: 0, claimed: false, revived: false }));
    state.bossHp = state.bossMaxHp = 10000;
    const after = stepDemonTowerSquad(state, 1).state;
    expect(after.members[0].revived).toBe(true); expect(after.log.some(text => text.includes('复活队员2'))).toBe(true);
  });
});
