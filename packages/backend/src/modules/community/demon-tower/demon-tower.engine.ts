import { createHash, createHmac } from 'node:crypto';
import {
  DEMON_TOWER_ATTRIBUTE_KEYS, DEMON_TOWER_CATALOG, DEMON_TOWER_FLOORS, DEMON_TOWER_SKILLS,
  DEMON_TOWER_WEAPONS, DEMON_TOWER_INNATES, DEMON_TOWER_RARITY_ORDER, demonTowerLootPool, demonTowerUpgradeCost,
} from '@stealth-reader/shared';
import type {
  DemonTowerAction, DemonTowerActionKind, DemonTowerAttribute, DemonTowerAttributes, DemonTowerBattleReport,
  DemonTowerBattleView, DemonTowerCombatantView, DemonTowerCombatLog, DemonTowerEffectView,
  DemonTowerLoadout, DemonTowerMaterials, DemonTowerOwnedSkill, DemonTowerOwnedWeapon,
  DemonTowerProfileView, DemonTowerSkillId, DemonTowerWeaponId, DemonTowerWorldView, DemonTowerInnateId, DemonTowerRarity,
} from '@stealth-reader/shared';

const RULES = DEMON_TOWER_CATALOG.rules;
const MAX_RESOURCE = 1_000_000;
const MAX_XP = 1_000_000_000;
const MAX_LOG = 100;
type EffectId = 'strength' | 'all' | 'illusion' | 'slow' | 'poison' | 'shred' | 'stun' | 'shield' | 'charge_warning' | 'charge_ready' | 'venom_warning' | 'venom_ready' | 'guard_warning';
type EnemyMechanic = 'charge' | 'guard' | 'venom';
interface Effect { id: EffectId; magnitude: number; turns: number }
interface Fighter {
  id: string; name: string; hp: number; maxHp: number; shield: number; attributes: DemonTowerAttributes;
  effects: Effect[]; elite: boolean; boss: boolean; mechanic?: EnemyMechanic;
}
interface Battle {
  /** Absent means the persisted pre-growth rules; never change a battle in flight. */
  rulesVersion?: 2; innates?: DemonTowerInnateId[]; feignUsed?: boolean;
  id: string; kind: 'explore' | 'boss'; floor: number; turn: number; roundLimit: number;
  player: Fighter; enemies: Fighter[]; cooldowns: Partial<Record<DemonTowerSkillId, number>>;
  usedRevive: boolean; reviveArmed: boolean; firstAttack: boolean; untouchedTurns: number;
  totalDamage: number; bossDamage: number; playerDamageTaken: number; landedPlayerHits: number; log: DemonTowerCombatLog[];
}
/** Private JSON only. Never spread state or battle into API responses. */
export interface DemonTowerEngineState {
  growth?: { rulesVersion: 2; chosenAttribute: DemonTowerAttribute | null; innates: DemonTowerInnateId[]; misses: { ling: number; xian: number } };
  schemaVersion: 1; createdAt: number; lastActionAt: number; rngSeed: string; rngCounter: number;
  level: number; experience: number; totalExperience: number; attributes: DemonTowerAttributes; unspentPoints: number;
  /** Optional for saves created before free attribute resets were available. */
  lastAttributeResetAt?: number | null;
  hp: number; stamina: number; staminaAt: number; healingAt: number;
  materials: DemonTowerMaterials; weapons: DemonTowerOwnedWeapon[]; skills: DemonTowerOwnedSkill[];
  loadout: DemonTowerLoadout; selectedFloor: number; battle: Battle | null; lastReport: DemonTowerBattleReport | null;
  lootPity: { stepsSinceGuarantee: number; nextKind: 'weapon' | 'skill' };
  daily: { serviceDate: string; activity: number; bossAttempts: number; rewardClaimed: boolean };
}
export interface DemonTowerEngineContext { now: number; serviceDate: string; world: DemonTowerWorldView }
export interface DemonTowerWorldEffect { kind: 'boss_damage' | 'construction'; floor: number; amount: number }
export interface DemonTowerEngineResult {
  state: DemonTowerEngineState; events: string[]; worldEffect: DemonTowerWorldEffect | null;
  /** Proposed ordinary payout only. Service applies the 200/day cap and ledger in the same transaction. */
  officeCoinIntent: number;
}
export class DemonTowerEngineError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'DemonTowerEngineError'; }
}
function fail(code: string): never { throw new DemonTowerEngineError(code); }
const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const clone = <T>(input: T): T => JSON.parse(JSON.stringify(input)) as T;
const emptyMaterials = (): DemonTowerMaterials => ({ ore: 0, herb: 0, soul: 0, clue: 0 });
const copyAttributes = (input: DemonTowerAttributes): DemonTowerAttributes => ({ STR: input.STR, SPD: input.SPD, AGI: input.AGI, DEF: input.DEF, LUCK: input.LUCK });
const copyMaterials = (input: DemonTowerMaterials): DemonTowerMaterials => ({ ore: input.ore, herb: input.herb, soul: input.soul, clue: input.clue });
const bound = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const integer = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
function clock(now: number, serviceDate?: string): void {
  if (!integer(now, 0, 8_640_000_000_000_000 - 86_400_000)) fail('INVALID_TIME');
  if (serviceDate !== undefined && (typeof serviceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) ||
    new Date(now + 8 * 3_600_000).toISOString().slice(0, 10) !== serviceDate)) fail('INVALID_SERVICE_DATE');
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('INVALID_ACTION');
  const object = value as Record<string, unknown>;
  if (Reflect.ownKeys(object).some((key) => typeof key !== 'string' || !keys.includes(key) || !Object.getOwnPropertyDescriptor(object, key)?.enumerable || !('value' in Object.getOwnPropertyDescriptor(object, key)!))) fail('INVALID_ACTION');
  return object;
}
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const object = record(value, keys);
  if (Object.keys(object).length !== keys.length || keys.some((key) => !own(object, key))) fail('INVALID_ACTION');
  return object;
}
const weaponDefinition = (id: string) => DEMON_TOWER_WEAPONS.find((item) => item.id === id) ?? fail('INVALID_WEAPON');
const skillDefinition = (id: string) => DEMON_TOWER_SKILLS.find((item) => item.id === id) ?? fail('INVALID_SKILL');
const floorDefinition = (floor: number) => DEMON_TOWER_FLOORS.find((item) => item.floor === floor) ?? fail('INVALID_FLOOR');
function random(state: DemonTowerEngineState): number {
  if (!integer(state.rngCounter, 0, Number.MAX_SAFE_INTEGER - 1)) fail('INVALID_STATE');
  const value = createHmac('sha256', state.rngSeed).update(`roll:${state.rngCounter++}`).digest();
  return value.readUInt32BE(0) / 0x1_0000_0000;
}
function identifier(state: DemonTowerEngineState, kind: string): string {
  return createHmac('sha256', state.rngSeed).update(`${kind}:${state.rngCounter++}`).digest('hex').slice(0, 24);
}
const weaponOwned = (state: DemonTowerEngineState, id: DemonTowerWeaponId) => state.weapons.find((item) => item.id === id) ?? fail('WEAPON_NOT_OWNED');
const skillOwned = (state: DemonTowerEngineState, id: DemonTowerSkillId) => state.skills.find((item) => item.id === id) ?? fail('SKILL_NOT_OWNED');
const hasWeapon = (state: DemonTowerEngineState, id: DemonTowerWeaponId): boolean => state.loadout.mainHand === id || state.loadout.artifact === id;
const hasPassive = (state: DemonTowerEngineState, id: DemonTowerSkillId): boolean => state.loadout.passiveSkills.includes(id);
const weaponScale = (state: DemonTowerEngineState, id: DemonTowerWeaponId): number => 1 + weaponOwned(state, id).quality * 0.15;
const skillScale = (state: DemonTowerEngineState, id: DemonTowerSkillId): number => 1 + skillOwned(state, id).quality * 0.12;
const battleInnate = (battle: Battle, id: DemonTowerInnateId): boolean => battle.rulesVersion === 2 && Boolean(battle.innates?.includes(id));
function unlockInnates(state: DemonTowerEngineState): void {
  const growth = state.growth;
  if (!growth?.chosenAttribute) return;
  const first = DEMON_TOWER_INNATES.find(item => item.attribute === growth.chosenAttribute)!;
  // Recompute from the immutable first choice and level, never trust client-supplied trait lists.
  growth.innates = [first.id, ...DEMON_TOWER_INNATES.filter(item => item.id !== first.id).map(item => item.id)]
    .slice(0, Math.min(8, 1 + Math.floor((state.level - 1) / 15)));
}
/** Write-path-only additive migration. GET and old in-flight battles never persist or advance this adapter. */
function enableGrowth(state: DemonTowerEngineState): void {
  if (state.battle || state.growth) return;
  state.growth = { rulesVersion: 2, chosenAttribute: null, innates: [], misses: { ling: 0, xian: 0 } };
  for (const item of state.weapons) { item.star = 1; item.favor = 0; item.levelExempt = true; }
  for (const item of state.skills) item.levelExempt = true;
}
function chance(state: DemonTowerEngineState, probability: number): boolean { return random(state) < bound(probability, 0, 1); }
function effect(fighter: Fighter, id: EffectId): Effect | undefined { return fighter.effects.find((item) => item.id === id && item.turns > 0); }
function putEffect(fighter: Fighter, id: EffectId, magnitude: number, turns: number): void {
  fighter.effects = fighter.effects.filter((item) => item.id !== id);
  fighter.effects.push({ id, magnitude, turns });
}
function dimensions(fighter: Fighter): DemonTowerAttributes {
  const result = copyAttributes(fighter.attributes);
  const all = effect(fighter, 'all')?.magnitude ?? 0;
  for (const key of DEMON_TOWER_ATTRIBUTE_KEYS) result[key] += all;
  result.STR += effect(fighter, 'strength')?.magnitude ?? 0;
  result.SPD = Math.floor(result.SPD * (1 - (effect(fighter, 'slow')?.magnitude ?? 0)));
  result.DEF = Math.floor(result.DEF * (1 - (effect(fighter, 'shred')?.magnitude ?? 0)));
  return result;
}
export function demonTowerEffectiveAttributes(state: DemonTowerEngineState): DemonTowerAttributes {
  const result = copyAttributes(state.attributes);
  for (const id of [state.loadout.mainHand, state.loadout.artifact]) {
    if (!id) continue;
    const item = weaponDefinition(id), owned = weaponOwned(state, id);
    result[item.attribute] += Math.round(item.baseBonus * (1 + owned.quality * 0.1));
  }
  if (hasWeapon(state, 'w8')) result.AGI += Math.round(15 * weaponScale(state, 'w8'));
  if (hasWeapon(state, 'w20')) result.LUCK += Math.round(15 * weaponScale(state, 'w20'));
  if (hasPassive(state, 's8')) result.LUCK += Math.round(8 * skillScale(state, 's8'));
  if (hasPassive(state, 's11')) result.SPD += Math.round(8 * skillScale(state, 's11'));
  for (const innate of DEMON_TOWER_INNATES) if (innate.attribute && state.growth?.innates.includes(innate.id)) result[innate.attribute] += 8;
  return result;
}
export function demonTowerMaxHp(state: DemonTowerEngineState): number {
  return 80 + state.level * 5 + demonTowerEffectiveAttributes(state).DEF * 4;
}
export function demonTowerExperienceToNext(level: number): number {
  if (!integer(level, 1, RULES.maxLevel)) fail('INVALID_LEVEL');
  return level === RULES.maxLevel ? 0 : 30 + level * 10 + Math.floor(level * level / 25);
}
export function demonTowerPersonalUnlockedFloor(level: number): number {
  return DEMON_TOWER_FLOORS.filter((floor) => floor.requiredLevel <= level).at(-1)?.floor ?? 1;
}
function inherentAttributes(level: number): DemonTowerAttributes {
  if (!integer(level, 1, RULES.maxLevel)) fail('INVALID_STATE');
  const attributes: DemonTowerAttributes = { STR: 10, SPD: 10, AGI: 10, DEF: 10, LUCK: 10 };
  for (let previousLevel = 1; previousLevel < level; previousLevel += 1) {
    attributes[DEMON_TOWER_ATTRIBUTE_KEYS[(previousLevel * 2) % 5]] += 1;
    attributes[DEMON_TOWER_ATTRIBUTE_KEYS[(previousLevel * 2 + 1) % 5]] += 1;
  }
  return attributes;
}
function gainXp(state: DemonTowerEngineState, amount: number, events: string[]): number {
  const granted = Math.min(MAX_XP - state.totalExperience, Math.max(0, Math.round(amount)));
  state.totalExperience += granted;
  if (state.level === RULES.maxLevel) return granted;
  state.experience += granted;
  while (state.level < RULES.maxLevel && state.experience >= demonTowerExperienceToNext(state.level)) {
    state.experience -= demonTowerExperienceToNext(state.level);
    const next = state.level++;
    state.attributes[DEMON_TOWER_ATTRIBUTE_KEYS[(next * 2) % 5]] += 1;
    state.attributes[DEMON_TOWER_ATTRIBUTE_KEYS[(next * 2 + 1) % 5]] += 1;
    state.unspentPoints += 2;
    state.hp = Math.min(demonTowerMaxHp(state), state.hp + 15);
    events.push(`提升至妖塔 Lv.${state.level}，获得2点自由属性。`);
  }
  if (state.level === RULES.maxLevel) state.experience = 0;
  unlockInnates(state);
  return granted;
}
function gainMaterials(state: DemonTowerEngineState, materials: Partial<DemonTowerMaterials>): DemonTowerMaterials {
  const granted = emptyMaterials();
  for (const key of Object.keys(granted) as Array<keyof DemonTowerMaterials>) {
    granted[key] = Math.min(MAX_RESOURCE - state.materials[key], Math.max(0, Math.round(materials[key] ?? 0)));
    state.materials[key] += granted[key];
  }
  return granted;
}
function activity(state: DemonTowerEngineState): void { state.daily.activity = Math.min(10_000, state.daily.activity + 1); }
export function createDemonTowerState(now: number, serviceDate: string, seed: string): DemonTowerEngineState {
  clock(now, serviceDate);
  if (typeof seed !== 'string' || seed.length < 16 || seed.length > 512) fail('INVALID_SEED');
  const state: DemonTowerEngineState = {
    schemaVersion: 1, createdAt: now, lastActionAt: now, rngSeed: createHash('sha256').update(seed).digest('hex'), rngCounter: 0,
    level: 1, experience: 0, totalExperience: 0, attributes: { STR: 10, SPD: 10, AGI: 10, DEF: 10, LUCK: 10 }, unspentPoints: 3,
    lastAttributeResetAt: null,
    hp: 125, stamina: RULES.staminaCap, staminaAt: now, healingAt: now,
    materials: { ore: 12, herb: 10, soul: 4, clue: 0 },
    weapons: DEMON_TOWER_CATALOG.starter.weapons.map((id) => ({ id, quality: 0, spareCopies: 0 })),
    skills: DEMON_TOWER_CATALOG.starter.skills.map((id) => ({ id, quality: 0, spareCopies: 0 })),
    loadout: clone(DEMON_TOWER_CATALOG.starter.loadout),
    selectedFloor: 1, battle: null, lastReport: null, lootPity: { stepsSinceGuarantee: 0, nextKind: 'weapon' },
    daily: { serviceDate, activity: 0, bossAttempts: 0, rewardClaimed: false },
  };
  enableGrowth(state);
  state.hp = demonTowerMaxHp(state);
  return state;
}
export function advanceDemonTowerState(input: DemonTowerEngineState, now: number, serviceDate: string): DemonTowerEngineState {
  clock(now, serviceDate);
  if (input.schemaVersion !== 1 || now < Math.max(input.lastActionAt, input.staminaAt, input.healingAt) || serviceDate < input.daily.serviceDate) fail('INVALID_TIME');
  if (input.growth && (input.growth.rulesVersion !== 2 || !integer(input.growth.misses?.ling, 0, 20) || !integer(input.growth.misses?.xian, 0, 50) ||
    (input.growth.chosenAttribute !== null && !DEMON_TOWER_ATTRIBUTE_KEYS.includes(input.growth.chosenAttribute)) || !Array.isArray(input.growth.innates) ||
    input.growth.innates.some(id => !DEMON_TOWER_INNATES.some(item => item.id === id)))) fail('INVALID_GROWTH_STATE');
  if (input.battle?.rulesVersion !== undefined && input.battle.rulesVersion !== 2) fail('INVALID_GROWTH_STATE');
  const state = clone(input);
  const elapsed = Math.max(0, now - state.staminaAt);
  const restored = Math.floor(elapsed / RULES.staminaRestoreMs);
  if (state.stamina >= RULES.staminaCap) state.staminaAt = now;
  else if (restored > 0) {
    state.stamina = Math.min(RULES.staminaCap, state.stamina + restored);
    state.staminaAt = state.stamina === RULES.staminaCap ? now : state.staminaAt + restored * RULES.staminaRestoreMs;
  }
  const maxHp = demonTowerMaxHp(state);
  const interval = Math.max(1, Math.floor(RULES.healingRestoreMs / (hasPassive(state, 's12') ? 1 + 0.3 * skillScale(state, 's12') : 1)));
  if (state.battle || state.hp >= maxHp) state.healingAt = now;
  else {
    const points = Math.floor(Math.max(0, now - state.healingAt) / interval);
    state.hp = Math.min(maxHp, state.hp + points);
    state.healingAt = state.hp === maxHp ? now : state.healingAt + points * interval;
  }
  if (state.daily.serviceDate !== serviceDate) state.daily = { serviceDate, activity: 0, bossAttempts: 0, rewardClaimed: false };
  return state;
}
function spendStamina(state: DemonTowerEngineState, cost: number, now: number): void {
  if (state.stamina < cost) fail('NOT_ENOUGH_STAMINA');
  if (state.stamina === RULES.staminaCap) state.staminaAt = now;
  state.stamina -= cost;
}
function log(battle: Battle, actor: DemonTowerCombatLog['actor'], kind: DemonTowerCombatLog['kind'], text: string, amount?: number, targetId?: string): void {
  battle.log.push({ turn: battle.turn, actor, kind, text, ...(amount !== undefined ? { amount } : {}), ...(targetId ? { targetId } : {}) });
  if (battle.log.length > MAX_LOG) battle.log.splice(0, battle.log.length - MAX_LOG);
}
function heal(battle: Battle, fighter: Fighter, amount: number, label: string): void {
  const actual = Math.min(fighter.maxHp - fighter.hp, Math.max(0, Math.round(amount)));
  fighter.hp += actual;
  if (actual > 0) log(battle, fighter.id === 'player' ? 'player' : 'enemy', 'heal', `${label}恢复${actual}生命。`, actual, fighter.id);
}
/** Damage primitive always clamps shielding before HP. Reflected/poison damage cannot grow HP. */
function damage(battle: Battle, target: Fighter, amount: number, actor: 'player' | 'enemy', label: string): number {
  const safe = Math.max(0, Math.round(amount));
  const absorbed = Math.min(Math.max(0, target.shield), safe);
  target.shield -= absorbed;
  const temporaryShield = effect(target, 'shield');
  if (temporaryShield) temporaryShield.magnitude = Math.max(0, temporaryShield.magnitude - absorbed);
  const actual = Math.min(target.hp, Math.max(0, safe - absorbed));
  target.hp -= actual;
  if (actor === 'player') {
    battle.totalDamage += actual;
    if (target.boss) battle.bossDamage += actual;
  }
  if (target.id === 'player') battle.playerDamageTaken += actual;
  log(battle, actor, 'damage', `${label}：${target.name}损失${actual}生命${absorbed ? `，护盾吸收${absorbed}` : ''}。`, actual, target.id);
  if (target.hp <= 0) log(battle, actor, 'defeat', `${target.name}暂时退场。`, 0, target.id);
  return actual;
}
function revive(battle: Battle): void {
  if (battle.player.hp <= 0 && battleInnate(battle, 'feign') && !battle.feignUsed) {
    battle.feignUsed = true; battle.player.hp = 1;
    log(battle, 'player', 'heal', '装死触发：本场第一次致命伤保留1生命；后续攻击仍会结算。', 1, 'player');
    return;
  }
  if (battle.player.hp <= 0 && battle.reviveArmed) {
    battle.reviveArmed = false;
    battle.player.hp = Math.ceil(battle.player.maxHp / 2);
    log(battle, 'player', 'heal', '续命丹心触发，恢复至50%生命。', battle.player.hp, 'player');
  }
}
function directHit(state: DemonTowerEngineState, battle: Battle, source: Fighter, target: Fighter, base: number, label: string, forcedCritical = false): number {
  if (source.hp <= 0 || target.hp <= 0) return 0;
  const playerSource = source.id === 'player', attributes = dimensions(source), defensive = dimensions(target);
  const illusion = effect(target, 'illusion')?.magnitude ?? 0;
  const confuse = hasWeapon(state, 'w17') ? 0.15 * weaponScale(state, 'w17') : 0;
  const evade = bound(defensive.AGI * 0.0015 + illusion * 0.8 - (playerSource ? confuse : 0), 0, 0.6);
  const accuracy = bound(0.96 + attributes.SPD * 0.0005 - (playerSource ? 0 : confuse), 0.55, 0.99);
  if (!chance(state, accuracy) || chance(state, evade)) {
    log(battle, playerSource ? 'player' : 'enemy', 'dodge', `${target.name}避开了${label}。`, 0, target.id);
    if (!playerSource && hasWeapon(state, 'w7') && target.hp > 0) damage(battle, source, defensive.AGI * weaponScale(state, 'w7'), 'player', '残影反击');
    return 0;
  }
  if (!playerSource && hasWeapon(state, 'w16') && chance(state, 0.1 * weaponScale(state, 'w16'))) {
    log(battle, 'player', 'shield', '绝对防御完全抵消此次攻击。', 0, 'player');
    return 0;
  }
  const penetration = playerSource && hasWeapon(state, 'w11') ? Math.min(0.65, 0.25 * weaponScale(state, 'w11')) : 0;
  let value = Math.max(1, base - defensive.DEF * 0.45 * (1 - penetration));
  if (playerSource && hasWeapon(state, 'w1') && defensive.DEF >= attributes.STR) value *= 1 + 0.15 * weaponScale(state, 'w1');
  const critical = forcedCritical || chance(state, Math.min(0.75, 0.05 + attributes.LUCK * 0.001 + (effect(source, 'illusion')?.magnitude ?? 0) + (playerSource && battleInnate(battle, 'agility') ? 0.05 : 0)));
  value *= (0.95 + random(state) * 0.1) * (critical ? 1.6 : 1);
  if (!playerSource && hasWeapon(state, 'w13')) value *= 1 - Math.min(0.6, 0.2 * weaponScale(state, 'w13'));
  if (!playerSource && battleInnate(battle, 'defense')) value *= 0.9;
  const actual = damage(battle, target, value, playerSource ? 'player' : 'enemy', `${label}${critical ? '·暴击' : ''}`);
  if (playerSource) battle.landedPlayerHits += 1;
  if (playerSource && actual > 0) {
    if (hasWeapon(state, 'w4')) heal(battle, source, actual * Math.min(0.6, 0.2 * weaponScale(state, 'w4')), '镇魂钺');
    if (hasWeapon(state, 'w2') && target.hp > 0 && chance(state, 0.2 * weaponScale(state, 'w2'))) {
      putEffect(target, 'stun', 1, 2);
      log(battle, 'player', 'effect', `${target.name}受到震慑。`, undefined, target.id);
    }
  }
  if (!playerSource && actual > 0 && hasWeapon(state, 'w14')) damage(battle, source, actual * Math.min(0.75, 0.25 * weaponScale(state, 'w14')), 'player', '反震');
  revive(battle);
  return actual;
}
function mainAttack(state: DemonTowerEngineState, battle: Battle, target: Fighter, playerFirst: boolean): void {
  const player = battle.player, attributes = dimensions(player), main = weaponDefinition(state.loadout.mainHand);
  let base = attributes[main.attribute] * 0.85 + attributes.STR * 0.3 + state.level * 0.3;
  const mastery = battle.rulesVersion === 2 ? (1 + ((weaponOwned(state, main.id).star ?? 1) - 1) * 0.1) * (battleInnate(battle, 'master') ? 1.2 : 1) : 1;
  base *= mastery;
  if (hasWeapon(state, 'w3') && battle.untouchedTurns >= 3) {
    base *= 1 + 0.4 * weaponScale(state, 'w3'); battle.untouchedTurns = 0;
    log(battle, 'player', 'effect', '裂岳斧蓄力完成。');
  }
  const forced = hasWeapon(state, 'w5') && battle.firstAttack && playerFirst;
  const priorHits = battle.landedPlayerHits;
  battle.firstAttack = false;
  const targets = hasWeapon(state, 'w10') ? battle.enemies.filter((enemy) => enemy.hp > 0) : [target];
  for (const enemy of targets) {
    if (hasWeapon(state, 'w8')) {
      directHit(state, battle, player, enemy, base * 0.65, '双匕一式', forced);
      directHit(state, battle, player, enemy, base * 0.65, '双匕二式');
    } else directHit(state, battle, player, enemy, base, main.name, forced);
  }
  if (hasWeapon(state, 'w6') && battle.landedPlayerHits > priorHits && target.hp > 0 && chance(state, 0.3 * weaponScale(state, 'w6'))) directHit(state, battle, player, target, attributes.AGI * 0.5 * weaponScale(state, 'w6') * mastery, '秋水连击');
  if (hasWeapon(state, 'w12')) {
    directHit(state, battle, player, target, base * 0.5, '龙吟追击');
    for (const enemy of battle.enemies.filter((candidate) => candidate.id !== target.id && candidate.hp > 0)) directHit(state, battle, player, enemy, base * 0.4 * weaponScale(state, 'w12'), '龙吟溅射');
  }
  if (target.hp > 0 && battleInnate(battle, 'speed') && chance(state, 0.3)) directHit(state, battle, player, target, attributes.SPD * mastery, '疾如雷电·追击');
  if (battle.rulesVersion === 2) {
    // Count normal-attack actions, never individual hits or targets. Attached healing attack counts once.
    for (const id of [state.loadout.mainHand, state.loadout.artifact]) {
      if (!id) continue;
      const owned = weaponOwned(state, id), star = owned.star ?? 1;
      if (star >= 5) continue;
      owned.star = star; owned.favor = (owned.favor ?? 0) + 1;
      if (owned.favor >= star * 15) {
        owned.star += 1; owned.favor = 0;
        log(battle, 'player', 'reward', `${weaponDefinition(id).name}熟练度达标，免费升至${owned.star}星；品质+${owned.quality}保留。`);
      }
    }
  }
}
function cooldown(state: DemonTowerEngineState, id: DemonTowerSkillId): number {
  const definition = skillDefinition(id);
  return definition.cooldown === 0 ? 0 : Math.max(1, definition.cooldown - Math.floor(skillOwned(state, id).quality / 3));
}
function usableSkill(state: DemonTowerEngineState, battle: Battle, id: DemonTowerSkillId): boolean {
  return state.loadout.activeSkills.includes(id) && (battle.cooldowns[id] ?? 0) === 0 && !(id === 's13' && battle.usedRevive);
}
function castSkill(state: DemonTowerEngineState, battle: Battle, id: DemonTowerSkillId, target: Fighter): void {
  if (!usableSkill(state, battle, id)) fail('SKILL_NOT_READY');
  const attributes = dimensions(battle.player), scale = skillScale(state, id), player = battle.player;
  battle.cooldowns[id] = cooldown(state, id) + 1;
  log(battle, 'player', 'info', `施展${skillDefinition(id).name}。`);
  switch (id) {
    case 's1': heal(battle, player, (20 + 2 * attributes.LUCK) * scale, '回春术'); break;
    case 's2': {
      const actual = directHit(state, battle, player, target, 2 * attributes.STR * scale, '裂地斩');
      if (battle.rulesVersion === 2 && actual > 0 && target.hp > 0 && !target.boss && chance(state, 0.2)) {
        putEffect(target, 'stun', 1, 2); log(battle, 'player', 'effect', '裂地斩震慑目标一次。', undefined, target.id);
      }
      putEffect(player, 'slow', 0.25, 2); break;
    }
    case 's3': {
      const shield = Math.round(1.5 * attributes.DEF * scale);
      player.shield += shield; putEffect(player, 'shield', shield, 2);
      log(battle, 'player', 'shield', `铁壁获得${shield}护盾，持续2回合。`, shield, 'player'); break;
    }
    case 's4': putEffect(player, 'strength', Math.round(10 * scale), 3); break;
    case 's5': for (let i = 0; i < 3; i += 1) directHit(state, battle, player, target, 0.6 * attributes.SPD * scale, `疾影连刺·${i + 1}`); break;
    case 's6': directHit(state, battle, player, target, 0.5 * attributes.AGI * scale, '毒刃'); if (target.hp > 0) putEffect(target, 'poison', Math.round(0.3 * attributes.AGI * scale), 2); break;
    case 's7': putEffect(player, 'illusion', Math.min(0.5, 0.25 * scale), 2); break;
    case 's10': directHit(state, battle, player, target, 1.5 * attributes.STR * scale * (target.elite || target.boss ? 1.5 : 1), '灭却斩'); break;
    case 's13': {
      battle.usedRevive = true; battle.reviveArmed = true;
      heal(battle, player, Math.max(0, Math.round(player.maxHp * Math.min(0.9, 0.5 * scale)) - player.hp), '续命丹心'); break;
    }
    case 's14': putEffect(player, 'all', Math.round(5 * scale), 2); break;
    case 's15': {
      if (battle.rulesVersion === 2 && !target.boss && target.hp > 1 && chance(state, 0.08)) {
        const actual = target.hp - 1; target.hp = 1; battle.totalDamage += actual;
        log(battle, 'player', 'damage', '气运一击逆转：非首领目标生命降至1，护盾保留。', actual, target.id);
      } else {
        if (battle.rulesVersion === 2 && target.boss) log(battle, 'system', 'info', '共享首领免疫压血，气运一击按正常幸运伤害结算。');
        directHit(state, battle, player, target, (1 + random(state) * 3) * attributes.LUCK * scale, '气运一击');
      }
      break;
    }
    case 's16': directHit(state, battle, player, target, 3 * attributes.STR * scale, '崩山击'); if (target.hp > 0) putEffect(target, 'shred', Math.min(0.6, 0.3 * scale), 2); break;
    default: fail('PASSIVE_SKILL');
  }
}
function guardAmount(fighter: Fighter, floor: number): number {
  // A shared boss can have hundreds of thousands of HP: never scale its personal-run shield from that pool.
  return fighter.boss ? Math.max(6, Math.round((8 + floorDefinition(floor).requiredLevel * 0.65) * 0.6)) : Math.max(1, Math.round(fighter.maxHp * 0.18));
}
function enemyTurn(state: DemonTowerEngineState, battle: Battle, actor: Fighter): void {
  const enraged = actor.boss && actor.hp <= actor.maxHp / 2;
  const attributes = dimensions(actor);
  const base = (attributes.STR * 0.95 + battle.floor * 2) * (enraged ? 1.3 : 1);
  if (actor.mechanic === 'guard' && battle.turn === 4) {
    const amount = guardAmount(actor, battle.floor);
    const granted = Math.max(0, Math.min(amount, amount * 2 - actor.shield));
    actor.shield += granted;
    log(battle, 'enemy', 'shield', `${actor.name}举起护势，增加${granted}护盾，本次不攻击。`, granted, actor.id);
    return;
  }
  if (actor.mechanic === 'charge') {
    const charged = effect(actor, 'charge_ready');
    if (charged) {
      actor.effects = actor.effects.filter((item) => item.id !== 'charge_ready');
      directHit(state, battle, actor, battle.player, base * charged.magnitude, '蓄力重击');
      return;
    }
    if (battle.turn % 3 === 1) {
      const multiplier = battle.floor === 1 ? 1.35 : 1.8;
      putEffect(actor, 'charge_ready', multiplier, 2);
      log(battle, 'enemy', 'effect', `${actor.name}正在蓄力，本次不攻击；下次行动重击，可提前防护或以震慑打断。`, undefined, actor.id);
      return;
    }
  }
  if (actor.mechanic === 'venom') {
    const ready = effect(actor, 'venom_ready');
    if (ready) {
      actor.effects = actor.effects.filter((item) => item.id !== 'venom_ready');
      const actual = directHit(state, battle, actor, battle.player, base * 0.75, '毒雾侵袭');
      if (actual > 0 && battle.player.hp > 0) {
        putEffect(battle.player, 'poison', ready.magnitude, 2);
        log(battle, 'enemy', 'effect', `毒雾穿透防护，每回合末${ready.magnitude}毒伤，持续2回合；不叠层，可由护盾吸收。`, ready.magnitude, 'player');
      }
      return;
    }
    if (battle.turn % 3 === 1) {
      const dose = Math.min(45, Math.max(2, Math.round((4 + floorDefinition(battle.floor).requiredLevel * 0.3) * (actor.boss ? 1.1 : 1))));
      putEffect(actor, 'venom_ready', dose, 2);
      log(battle, 'enemy', 'effect', `${actor.name}散出毒雾预兆，下次弱攻击若穿透护盾将附带短时毒伤。`, undefined, actor.id);
    }
  }
  directHit(state, battle, actor, battle.player, base, actor.name);
}
function resolveTurn(state: DemonTowerEngineState, battle: Battle, selected: { skillId?: DemonTowerSkillId; targetId: string }): void {
  const target = battle.enemies.find((enemy) => enemy.id === selected.targetId && enemy.hp > 0) ?? fail('INVALID_TARGET');
  if (selected.skillId && !usableSkill(state, battle, selected.skillId)) fail('SKILL_NOT_READY');
  const playerDamageTaken = battle.playerDamageTaken;
  battle.turn += 1;
  const actors = [battle.player, ...battle.enemies.filter((enemy) => enemy.hp > 0)].sort((a, b) => {
    const initiative = (fighter: Fighter) => dimensions(fighter).SPD + (fighter.id === 'player' && hasWeapon(state, 'w9') ? 15 * weaponScale(state, 'w9') : 0);
    return initiative(b) - initiative(a) || (a.id === 'player' ? -1 : b.id === 'player' ? 1 : a.id.localeCompare(b.id));
  });
  const playerFirst = actors[0].id === 'player';
  for (const actor of actors) {
    if (actor.hp <= 0 || battle.player.hp <= 0 || battle.enemies.every((enemy) => enemy.hp <= 0)) continue;
    if (effect(actor, 'stun')) {
      const interrupted = effect(actor, 'charge_ready') || effect(actor, 'venom_ready');
      actor.effects = actor.effects.filter((item) => !['stun', 'charge_ready', 'venom_ready'].includes(item.id));
      log(battle, actor.id === 'player' ? 'player' : 'enemy', 'effect', `${actor.name}受到震慑，本次无法行动${interrupted ? '，预备招式已被打断' : ''}。`); continue;
    }
    if (actor.id === 'player') {
      const liveTarget = target.hp > 0 ? target : battle.enemies.find((enemy) => enemy.hp > 0)!;
      if (selected.skillId) {
        castSkill(state, battle, selected.skillId, liveTarget);
        if (selected.skillId === 's1' && battle.rulesVersion === 2 && liveTarget.hp > 0) mainAttack(state, battle, liveTarget, playerFirst);
      }
      else mainAttack(state, battle, liveTarget, playerFirst);
    } else enemyTurn(state, battle, actor);
  }
  for (const enemy of battle.enemies) {
    const poison = effect(enemy, 'poison');
    if (poison && enemy.hp > 0) damage(battle, enemy, poison.magnitude, 'player', '毒伤');
  }
  const playerPoison = effect(battle.player, 'poison');
  if (playerPoison && battle.player.hp > 0) {
    damage(battle, battle.player, playerPoison.magnitude, 'enemy', '毒雾余毒');
    revive(battle);
  }
  if (battle.player.hp > 0 && hasWeapon(state, 'w18') && battle.turn % 2 === 0) {
    const enemy = battle.enemies.find((item) => item.hp > 0);
    if (enemy) damage(battle, enemy, dimensions(battle.player).LUCK * 0.5 * weaponScale(state, 'w18'), 'player', '召灵');
  }
  if (battle.player.hp > 0 && hasPassive(state, 's9')) heal(battle, battle.player, dimensions(battle.player).LUCK * 0.5 * skillScale(state, 's9'), '疗伤真气');
  battle.untouchedTurns = battle.playerDamageTaken === playerDamageTaken ? battle.untouchedTurns + 1 : 0;
  for (const fighter of [battle.player, ...battle.enemies]) {
    for (const item of fighter.effects) {
      item.turns -= 1;
      if (item.turns <= 0 && item.id === 'shield') fighter.shield = Math.max(0, fighter.shield - item.magnitude);
    }
    fighter.effects = fighter.effects.filter((item) => item.turns > 0);
  }
  for (const id of Object.keys(battle.cooldowns) as DemonTowerSkillId[]) battle.cooldowns[id] = Math.max(0, (battle.cooldowns[id] ?? 0) - 1);
}
function newBattle(state: DemonTowerEngineState, kind: Battle['kind'], floor: number, world: DemonTowerWorldView): Battle {
  const definition = floorDefinition(floor), lv = definition.requiredLevel;
  const hp = demonTowerMaxHp(state), attributes = demonTowerEffectiveAttributes(state);
  const player: Fighter = { id: 'player', name: '我', hp: state.hp, maxHp: hp, shield: 0, attributes, effects: [], elite: false, boss: false };
  if (hasWeapon(state, 'w15')) player.shield = Math.round(1.5 * attributes.DEF * weaponScale(state, 'w15'));
  if (state.growth?.innates.includes('shield')) player.shield += attributes.DEF;
  const count = kind === 'boss' ? 1 : random(state) < 0.22 && floor > 1 ? 2 : 1;
  const enemies: Fighter[] = [];
  for (let i = 0; i < count; i += 1) {
    const boss = kind === 'boss', elite = boss || random(state) < 0.15;
    const base = Math.round(boss ? 8 + lv * 0.65 : 10 + lv * 0.8);
    const maxHp = boss ? world.boss.hp : Math.round((66 + lv * 10 + floor * 8) * (elite ? 1.35 : 1) * (count > 1 ? 0.75 : 1));
    const mechanic: EnemyMechanic | undefined = elite ? (['charge', 'venom', 'guard', 'venom', 'charge', 'guard', 'charge', 'venom', 'guard'] as const)[floor - 1] : undefined;
    const enemy: Fighter = { id: boss ? 'boss' : `enemy-${i + 1}`, name: boss ? definition.bossName : `${elite ? '精英·' : ''}${definition.enemyNames[Math.floor(random(state) * definition.enemyNames.length)]}`,
      hp: maxHp, maxHp: boss ? world.boss.maxHp : maxHp, shield: 0,
      attributes: { STR: Math.round(base * (boss ? 1.4 : elite ? 1.38 : 1.2)), SPD: base, AGI: Math.round(base * 0.75), DEF: Math.round(base * (boss ? 1 : 0.8)), LUCK: Math.round(base * 0.5) },
      effects: [], elite, boss, ...(mechanic ? { mechanic } : {}) };
    if (mechanic === 'charge') putEffect(enemy, 'charge_warning', floor === 1 ? 1.35 : 1.8, 1);
    if (mechanic === 'venom') putEffect(enemy, 'venom_warning', 2, 1);
    if (mechanic === 'guard') {
      enemy.shield = guardAmount(enemy, floor);
      putEffect(enemy, 'guard_warning', enemy.shield, 4);
    }
    enemies.push(enemy);
  }
  return { id: identifier(state, 'battle'), kind, floor, turn: 0, roundLimit: kind === 'boss' ? RULES.bossRoundLimit : RULES.combatRoundLimit,
    ...(state.growth ? { rulesVersion: 2 as const, innates: [...state.growth.innates], feignUsed: false } : {}),
    player, enemies, cooldowns: {}, usedRevive: false, reviveArmed: false, firstAttack: true, untouchedTurns: 0,
    totalDamage: 0, bossDamage: 0, playerDamageTaken: 0, landedPlayerHits: 0, log: [] };
}
function weighted<T extends { weight: number }>(items: readonly T[], roll: number): T {
  if (!items.length || !Number.isFinite(roll) || roll < 0 || roll >= 1) fail('INVALID_LOOT_POOL');
  let point = roll * items.reduce((sum, item) => sum + item.weight, 0);
  for (const item of items) { point -= item.weight; if (point < 0) return item; }
  return items[items.length - 1];
}
/** Pure two-stage draw shared by the engine's real loot path and frequency/eligibility tests. */
export function demonTowerWeightedLoot(kind: 'weapon' | 'skill', level: number, minimum: DemonTowerRarity, rarityRoll: number, itemRoll: number, unowned?: readonly string[]) {
  const group = weighted(demonTowerLootPool(kind, level, minimum), rarityRoll);
  const missing = unowned ? group.items.filter(item => unowned.includes(item.id)) : [];
  return weighted(missing.length ? missing : group.items, itemRoll);
}
function growthLoot(state: DemonTowerEngineState, events: string[]): void {
  const growth = state.growth!, misses = growth.misses;
  const lingEligible = state.level >= 16, xianEligible = state.level >= 31;
  const minimum: DemonTowerRarity = xianEligible && misses.xian >= 50 ? '仙' : lingEligible && misses.ling >= 20 ? '灵' : '凡';
  state.lootPity.stepsSinceGuarantee += 1;
  const scheduled = state.lootPity.stepsSinceGuarantee >= RULES.lootGuaranteeEvery;
  const forced = minimum !== '凡' || scheduled;
  const probability = Math.min(0.7, 0.2 + demonTowerEffectiveAttributes(state).LUCK * 0.001 + (hasWeapon(state, 'w20') ? 0.1 * weaponScale(state, 'w20') : 0));
  let rank = -1;
  if (forced || chance(state, probability)) {
    let kind: 'weapon' | 'skill' = scheduled ? state.lootPity.nextKind : random(state) < 0.5 ? 'weapon' : 'skill';
    // A guarantee may need the other kind: Lv16 weapons can be 灵 while skills cannot until Lv31.
    if (!demonTowerLootPool(kind, state.level, minimum).length) kind = kind === 'weapon' ? 'skill' : 'weapon';
    const owned = kind === 'weapon' ? state.weapons : state.skills;
    const definitions = kind === 'weapon' ? DEMON_TOWER_WEAPONS : DEMON_TOWER_SKILLS;
    const missing = definitions.filter(item => !owned.some(existing => existing.id === item.id)).map(item => item.id);
    const item = demonTowerWeightedLoot(kind, state.level, minimum, random(state), random(state), scheduled ? missing : undefined);
    const existing = owned.find(entry => entry.id === item.id);
    if (existing) existing.spareCopies = Math.min(MAX_RESOURCE, existing.spareCopies + 1);
    else if (kind === 'weapon') state.weapons.push({ id: item.id as DemonTowerWeaponId, quality: 0, spareCopies: 0, star: 1, favor: 0 });
    else state.skills.push({ id: item.id as DemonTowerSkillId, quality: 0, spareCopies: 0 });
    rank = DEMON_TOWER_RARITY_ORDER.indexOf(item.rarity);
    events.push(`获得${item.rarity}·${item.name}${existing ? '副本，保留用于免费升阶' : ''}。`);
    if (minimum !== '凡') events.push(`已兑现${minimum}以上免费保底（仅统计达到获取等级后的探索结算）。`);
    if (scheduled) {
      state.lootPity.stepsSinceGuarantee = 0; state.lootPity.nextKind = kind === 'weapon' ? 'skill' : 'weapon';
      events.push('已触发每4次探索物品保底，所抽稀有度内优先未收录。');
    }
  }
  if (lingEligible) misses.ling = rank >= 2 ? 0 : Math.min(20, misses.ling + 1);
  if (xianEligible) misses.xian = rank >= 3 ? 0 : Math.min(50, misses.xian + 1);
}
function loot(state: DemonTowerEngineState, events: string[]): void {
  if (state.growth) { growthLoot(state, events); return; }
  const lucky = demonTowerEffectiveAttributes(state).LUCK;
  const probability = Math.min(0.7, 0.2 + lucky * 0.001 + (hasWeapon(state, 'w20') ? 0.1 * weaponScale(state, 'w20') : 0));
  state.lootPity.stepsSinceGuarantee += 1;
  const guaranteed = state.lootPity.stepsSinceGuarantee >= RULES.lootGuaranteeEvery;
  if (!guaranteed && !chance(state, probability)) return;
  const missingWeapons = DEMON_TOWER_WEAPONS.filter((item) => item.legacyRequiredLevel <= state.level && !state.weapons.some((owned) => owned.id === item.id));
  const missingSkills = DEMON_TOWER_SKILLS.filter((item) => item.legacyRequiredLevel <= state.level && !state.skills.some((owned) => owned.id === item.id));
  const kind = guaranteed ? (state.lootPity.nextKind === 'weapon' ? missingWeapons.length > 0 || missingSkills.length === 0 ? 'weapon' : 'skill' : missingSkills.length > 0 || missingWeapons.length === 0 ? 'skill' : 'weapon') : random(state) < 0.5 ? 'weapon' : 'skill';
  if (kind === 'weapon') {
    const available = DEMON_TOWER_WEAPONS.filter((item) => item.legacyRequiredLevel <= state.level);
    const item = guaranteed && missingWeapons.length > 0 ? missingWeapons[0] : available[Math.floor(random(state) * available.length)];
    const existing = state.weapons.find((owned) => owned.id === item.id);
    if (existing) existing.spareCopies = Math.min(MAX_RESOURCE, existing.spareCopies + 1);
    else state.weapons.push({ id: item.id, quality: 0, spareCopies: 0 });
    events.push(`获得${item.name}${existing ? '副本，已保留用于升阶' : ''}。`);
  } else {
    const available = DEMON_TOWER_SKILLS.filter((item) => item.legacyRequiredLevel <= state.level);
    const item = guaranteed && missingSkills.length > 0 ? missingSkills[0] : available[Math.floor(random(state) * available.length)];
    const existing = state.skills.find((owned) => owned.id === item.id);
    if (existing) existing.spareCopies = Math.min(MAX_RESOURCE, existing.spareCopies + 1);
    else state.skills.push({ id: item.id, quality: 0, spareCopies: 0 });
    events.push(`获得${item.name}${existing ? '副本，已保留用于升阶' : ''}。`);
  }
  if (guaranteed) {
    state.lootPity.stepsSinceGuarantee = 0;
    state.lootPity.nextKind = kind === 'weapon' ? 'skill' : 'weapon';
    events.push('已触发免费探索掉落保底。');
  }
}
function finishBattle(state: DemonTowerEngineState, battle: Battle, outcome: DemonTowerBattleReport['outcome'], now: number, events: string[]): number {
  state.hp = bound(battle.player.hp, 0, demonTowerMaxHp(state));
  state.healingAt = now;
  let experience = 0, materials = emptyMaterials(), coins = 0;
  if (outcome === 'victory' && battle.kind === 'explore') {
    experience = gainXp(state, 32 + battle.floor * 13, events);
    materials = gainMaterials(state, { ore: 2 + battle.floor, herb: 1, soul: 1 + Math.floor(battle.floor / 3), clue: random(state) < 0.25 ? 1 : 0 });
    coins = 3 + Math.floor(battle.floor / 3); loot(state, events); activity(state);
  } else if (battle.kind === 'boss' && battle.bossDamage > 0) {
    experience = gainXp(state, 20 + battle.floor * 8, events);
    materials = gainMaterials(state, { soul: 2 + battle.floor, ore: 2, clue: 1 });
    coins = 5; activity(state);
  }
  state.lastReport = { id: battle.id, kind: battle.kind, floor: battle.floor, outcome, turns: battle.turn,
    damage: battle.kind === 'boss' ? battle.bossDamage : battle.totalDamage, experience, materials,
    log: clone(battle.log), completedAt: now };
  state.battle = null;
  events.push(outcome === 'victory' ? '本次探索获胜。' : outcome === 'contributed' ? '本次讨伐已完成，伤害将计入共享进度。' : outcome === 'fled' ? '已安全撤离，未获得战斗奖励。' : '本次战斗结束，可以休整后再出发。');
  return coins;
}
function validateWorld(world: DemonTowerWorldView): void {
  if (!world || !integer(world.currentFloor, 1, 9) || !integer(world.unlockedFloor, 1, 9) || world.currentFloor > world.unlockedFloor ||
    !['boss', 'passage', 'complete'].includes(world.phase) || !world.boss || !integer(world.boss.hp, 0, 1_000_000_000) ||
    !integer(world.boss.maxHp, 1, 1_000_000_000) || world.boss.hp > world.boss.maxHp || !world.passage ||
    !integer(world.passage.current, 0, 1_000_000_000) || !integer(world.passage.required, 1, 1_000_000_000) || world.passage.current > world.passage.required) fail('INVALID_WORLD');
}
function validateLoadout(state: DemonTowerEngineState, payload: unknown): DemonTowerLoadout {
  const value = exact(payload, ['mainHand', 'artifact', 'activeSkills', 'passiveSkills']);
  if (typeof value.mainHand !== 'string' || (value.artifact !== null && typeof value.artifact !== 'string') ||
    !Array.isArray(value.activeSkills) || !Array.isArray(value.passiveSkills) || value.activeSkills.length > RULES.activeSkillSlots || value.passiveSkills.length > RULES.passiveSkillSlots) fail('INVALID_LOADOUT');
  const main = weaponDefinition(value.mainHand);
  if (main.requiredLevel > state.level && !weaponOwned(state, main.id).levelExempt) fail('WEAPON_LEVEL_REQUIRED');
  weaponOwned(state, main.id);
  if (value.artifact !== null) {
    const artifact = weaponDefinition(value.artifact as string);
    if (artifact.type !== '法器' || (artifact.requiredLevel > state.level && !weaponOwned(state, artifact.id).levelExempt)) fail('WEAPON_LEVEL_REQUIRED');
    if (artifact.id === main.id) fail('DUPLICATE_EQUIPMENT');
    weaponOwned(state, artifact.id);
  }
  const seen = new Set<string>();
  for (const [values, kind] of [[value.activeSkills, 'active'], [value.passiveSkills, 'passive']] as const) {
    for (const id of values) {
      if (typeof id !== 'string' || seen.has(id)) fail('INVALID_LOADOUT');
      const definition = skillDefinition(id);
      if (definition.kind !== kind || (definition.requiredLevel > state.level && !skillOwned(state, definition.id).levelExempt)) fail('SKILL_LEVEL_REQUIRED');
      skillOwned(state, definition.id); seen.add(id);
    }
  }
  return clone(value) as unknown as DemonTowerLoadout;
}
/** Pure, deterministic policy; it does not spend resources, advance RNG or bypass actDemonTower. */
export function demonTowerAutomaticAction(state: DemonTowerEngineState): DemonTowerAction {
  if (!state.battle) return { kind: 'explore', payload: {} };
  const battle = state.battle;
  if (battle.kind !== 'explore') fail('INVALID_BATTLE');
  const targetId = battle.enemies.find(enemy => enemy.hp > 0)?.id ?? fail('INVALID_TARGET');
  const skillId = state.loadout.activeSkills.find(id => usableSkill(state, battle, id) &&
    (id !== 's1' || battle.player.hp < battle.player.maxHp * 0.75) &&
    (id !== 's13' || battle.player.hp < battle.player.maxHp * 0.5) &&
    (id !== 's4' || !effect(battle.player, 'strength')) && (id !== 's7' || !effect(battle.player, 'illusion')));
  return skillId ? { kind: 'skill', payload: { skillId, targetId } } : { kind: 'attack', payload: { targetId } };
}
export function actDemonTower(input: DemonTowerEngineState, raw: unknown, context: DemonTowerEngineContext): DemonTowerEngineResult {
  const root = exact(raw, ['kind', 'payload']);
  if (typeof root.kind !== 'string') fail('INVALID_ACTION');
  const allowed: DemonTowerActionKind[] = ['enroll', 'explore', 'attack', 'skill', 'flee', 'train', 'rest', 'equip', 'allocate', 'reset_attributes', 'choose_innate', 'upgrade', 'select_floor', 'challenge_boss', 'donate', 'claim_reward'];
  if (!allowed.includes(root.kind as DemonTowerActionKind)) fail('INVALID_ACTION');
  validateWorld(context.world);
  const state = advanceDemonTowerState(input, context.now, context.serviceDate), events: string[] = [];
  enableGrowth(state);
  const result: DemonTowerEngineResult = { state, events, worldEffect: null, officeCoinIntent: 0 };
  if (root.kind === 'enroll') fail('ALREADY_ENROLLED');
  if (state.battle && !['attack', 'skill', 'flee'].includes(root.kind)) fail('BATTLE_IN_PROGRESS');
  if (!state.battle && ['attack', 'skill', 'flee'].includes(root.kind)) fail('NO_BATTLE');
  if (['explore', 'train', 'rest', 'flee', 'claim_reward', 'reset_attributes'].includes(root.kind)) exact(root.payload, []);
  switch (root.kind as DemonTowerAction['kind']) {
    case 'explore': {
      if (state.hp <= 0) fail('REST_REQUIRED');
      if (state.selectedFloor > context.world.unlockedFloor || state.selectedFloor > demonTowerPersonalUnlockedFloor(state.level)) fail('FLOOR_LOCKED');
      spendStamina(state, RULES.exploreCost, context.now);
      const roll = random(state), floor = state.selectedFloor;
      if (roll < 0.7) {
        gainXp(state, 6 + floor * 2, events);
        state.battle = newBattle(state, 'explore', floor, context.world);
        events.push(`进入${floorDefinition(floor).name}，遭遇${state.battle.enemies.map((enemy) => enemy.name).join('、')}。`);
      } else {
        const blessing = hasPassive(state, 's8') ? 1 + 0.2 * skillScale(state, 's8') : 1;
        gainXp(state, (20 + floor * 10) * blessing, events);
        gainMaterials(state, { ore: Math.round((3 + floor) * blessing), herb: 2, clue: roll > 0.92 ? 1 : 0 });
        loot(state, events); activity(state); result.officeCoinIntent = 2;
        events.push(roll < 0.85 ? '找到旧日宝匣，收集了经验与材料。' : '循着灵脉修行，获得了经验与材料。');
      }
      break;
    }
    case 'attack':
    case 'skill': {
      const value = root.kind === 'attack' ? exact(root.payload, ['targetId']) : record(root.payload, ['skillId', 'targetId']);
      if (root.kind === 'skill' && (!own(value, 'skillId') || typeof value.skillId !== 'string')) fail('INVALID_ACTION');
      if (root.kind === 'attack' && typeof value.targetId !== 'string') fail('INVALID_ACTION');
      if (own(value, 'targetId') && (typeof value.targetId !== 'string' || value.targetId.length > 32)) fail('INVALID_TARGET');
      const battle = state.battle!;
      const skillId = root.kind === 'skill' ? skillDefinition(value.skillId as string).id : undefined;
      const targetId = value.targetId as string | undefined ?? battle.enemies.find((enemy) => enemy.hp > 0)?.id ?? fail('INVALID_TARGET');
      resolveTurn(state, battle, { targetId, ...(skillId ? { skillId } : {}) });
      state.hp = battle.player.hp;
      if (battle.player.hp <= 0) finishBattle(state, battle, 'defeat', context.now, events);
      else if (battle.enemies.every((enemy) => enemy.hp <= 0)) result.officeCoinIntent = finishBattle(state, battle, 'victory', context.now, events);
      else if (battle.turn >= battle.roundLimit) finishBattle(state, battle, 'timeout', context.now, events);
      break;
    }
    case 'flee': finishBattle(state, state.battle!, 'fled', context.now, events); break;
    case 'train': {
      spendStamina(state, RULES.trainCost, context.now);
      const worldLevel = floorDefinition(context.world.unlockedFloor).requiredLevel;
      const catchup = 1 + bound((worldLevel - state.level) / 50, 0, 1.5);
      const weaponBonus = hasWeapon(state, 'w19') ? 1 + 0.3 * weaponScale(state, 'w19') : 1;
      const xp = gainXp(state, (25 + state.selectedFloor * 12) * catchup * weaponBonus, events);
      gainMaterials(state, { herb: 1 }); activity(state); events.push(`静心修炼，获得${xp}妖塔经验${catchup > 1 ? '（已含世界进度追赶加成）' : ''}。`); break;
    }
    case 'rest': {
      if (state.hp >= demonTowerMaxHp(state)) fail('HEALTH_ALREADY_FULL');
      spendStamina(state, RULES.restCost, context.now);
      const before = state.hp;
      state.hp = Math.min(demonTowerMaxHp(state), state.hp + Math.ceil(demonTowerMaxHp(state) * RULES.restHealingPercent / 100));
      state.healingAt = context.now; events.push(`休整恢复${state.hp - before}生命。`); break;
    }
    case 'equip': {
      const next = validateLoadout(state, root.payload);
      const sameOrder = (left: readonly string[], right: readonly string[]) => left.length === right.length && left.every((id, index) => id === right[index]);
      if (next.mainHand === state.loadout.mainHand && next.artifact === state.loadout.artifact &&
        sameOrder(next.activeSkills, state.loadout.activeSkills) && sameOrder(next.passiveSkills, state.loadout.passiveSkills)) fail('LOADOUT_UNCHANGED');
      state.loadout = next;
      state.hp = Math.min(state.hp, demonTowerMaxHp(state)); state.healingAt = context.now;
      events.push('配装已更新；首领讨伐按主动技能排列顺序使用可用技能。'); break;
    }
    case 'allocate': {
      const value = exact(root.payload, ['attribute', 'points']);
      if (typeof value.attribute !== 'string' || !DEMON_TOWER_ATTRIBUTE_KEYS.includes(value.attribute as DemonTowerAttribute) || !integer(value.points, 1, 1000)) fail('INVALID_ALLOCATION');
      if (state.unspentPoints < value.points) fail('NOT_ENOUGH_ATTRIBUTE_POINTS');
      state.attributes[value.attribute as DemonTowerAttribute] += value.points; state.unspentPoints -= value.points;
      events.push(`已分配${value.points}点${DEMON_TOWER_CATALOG.attributes[value.attribute as DemonTowerAttribute]}。`); break;
    }
    case 'choose_innate': {
      const value = exact(root.payload, ['attribute']);
      if (typeof value.attribute !== 'string' || !DEMON_TOWER_ATTRIBUTE_KEYS.includes(value.attribute as DemonTowerAttribute)) fail('INVALID_INNATE');
      if (!state.growth || state.growth.chosenAttribute !== null) fail('INNATE_ALREADY_CHOSEN');
      state.growth.chosenAttribute = value.attribute as DemonTowerAttribute; unlockInnates(state);
      state.hp = Math.min(state.hp, demonTowerMaxHp(state)); state.healingAt = context.now;
      events.push(`心性已确定，永久命格${state.growth.innates.length}/8已生效；不消耗资源、不额外恢复生命。`); break;
    }
    case 'reset_attributes': {
      const inherent = inherentAttributes(state.level), earnedFreePoints = 3 + 2 * (state.level - 1);
      if (!integer(state.unspentPoints, 0, earnedFreePoints)) fail('INVALID_STATE');
      let allocated = 0;
      for (const key of DEMON_TOWER_ATTRIBUTE_KEYS) {
        if (!integer(state.attributes[key], inherent[key], inherent[key] + earnedFreePoints)) fail('INVALID_STATE');
        allocated += state.attributes[key] - inherent[key];
      }
      // Validate the actual saved attributes, never equipment bonuses or a client-supplied refund.
      if (allocated + state.unspentPoints !== earnedFreePoints ||
        (state.lastAttributeResetAt != null && !integer(state.lastAttributeResetAt, state.createdAt, context.now))) fail('INVALID_STATE');
      if (allocated === 0) fail('ATTRIBUTES_UNCHANGED');
      if (state.lastAttributeResetAt != null && context.now < state.lastAttributeResetAt + RULES.attributeResetCooldownMs) fail('ATTRIBUTE_RESET_COOLDOWN');
      state.attributes = inherent; state.unspentPoints += allocated;
      state.hp = Math.min(state.hp, demonTowerMaxHp(state)); state.healingAt = context.now;
      state.lastAttributeResetAt = context.now;
      events.push(`已免费返还${allocated}点自由属性，固有属性保留；未提供治疗或额外资源，24小时后可再次重置。`); break;
    }
    case 'upgrade': {
      const value = exact(root.payload, ['itemType', 'itemId']);
      if (!['weapon', 'skill'].includes(value.itemType as string) || typeof value.itemId !== 'string') fail('INVALID_ACTION');
      const type = value.itemType as 'weapon' | 'skill';
      const owned = type === 'weapon' ? weaponOwned(state, weaponDefinition(value.itemId).id) : skillOwned(state, skillDefinition(value.itemId).id);
      const cost = demonTowerUpgradeCost(type, owned.id, owned.quality, owned.spareCopies, state.level, owned.levelExempt);
      if (!cost.available) fail(cost.reason === 'max_quality' ? 'QUALITY_MAXIMUM' : 'UPGRADE_LEVEL_REQUIRED');
      for (const key of Object.keys(cost.materials) as Array<keyof DemonTowerMaterials>) if (state.materials[key] < cost.materials[key]) fail('NOT_ENOUGH_MATERIALS');
      owned.spareCopies -= cost.spareCopies;
      for (const key of Object.keys(cost.materials) as Array<keyof DemonTowerMaterials>) state.materials[key] -= cost.materials[key];
      owned.quality += 1; events.push(`升阶成功，品质提升至+${owned.quality}；没有随机失败或副本丢失。`); break;
    }
    case 'select_floor': {
      const value = exact(root.payload, ['floor']);
      if (!integer(value.floor, 1, 9)) fail('INVALID_FLOOR');
      if (value.floor > context.world.unlockedFloor || floorDefinition(value.floor).requiredLevel > state.level) fail('FLOOR_LOCKED');
      if (value.floor === state.selectedFloor) fail('FLOOR_UNCHANGED');
      state.selectedFloor = value.floor; events.push(`已前往${floorDefinition(value.floor).name}。`); break;
    }
    case 'challenge_boss': {
      const value = exact(root.payload, ['floor']);
      if (!integer(value.floor, 1, 9)) fail('INVALID_FLOOR');
      if (value.floor !== context.world.currentFloor) fail('WORLD_FLOOR_CHANGED');
      if (context.world.phase !== 'boss' || context.world.boss.hp <= 0) fail('BOSS_UNAVAILABLE');
      const floor = context.world.currentFloor;
      if (floorDefinition(floor).requiredLevel > state.level) fail('FLOOR_LOCKED');
      if (state.hp <= 0) fail('REST_REQUIRED');
      if (state.daily.bossAttempts >= RULES.bossAttemptsPerDay) fail('BOSS_DAILY_LIMIT');
      spendStamina(state, RULES.bossCost, context.now); state.daily.bossAttempts += 1;
      const battle = newBattle(state, 'boss', floor, context.world);
      while (battle.turn < battle.roundLimit && battle.player.hp > 0 && battle.enemies.some((enemy) => enemy.hp > 0)) {
        const skillId = state.loadout.activeSkills.find((id) => usableSkill(state, battle, id) &&
          (id !== 's1' || battle.player.hp < battle.player.maxHp * 0.75) &&
          (id !== 's13' || battle.player.hp < battle.player.maxHp * 0.5) &&
          (id !== 's4' || !effect(battle.player, 'strength')) && (id !== 's7' || !effect(battle.player, 'illusion')));
        resolveTurn(state, battle, { targetId: battle.enemies.find((enemy) => enemy.hp > 0)!.id, ...(skillId ? { skillId } : {}) });
      }
      result.officeCoinIntent = finishBattle(state, battle, battle.player.hp <= 0 ? 'defeat' : 'contributed', context.now, events);
      result.worldEffect = { kind: 'boss_damage', floor, amount: Math.min(context.world.boss.hp, battle.bossDamage) };
      break;
    }
    case 'donate': {
      const value = exact(root.payload, ['floor', 'material', 'amount']);
      if (!integer(value.floor, 1, 9)) fail('INVALID_FLOOR');
      if (value.floor !== context.world.currentFloor) fail('WORLD_FLOOR_CHANGED');
      if (!['ore', 'clue'].includes(value.material as string) || !integer(value.amount, 1, 1000)) fail('INVALID_DONATION');
      if (context.world.phase !== 'passage' || context.world.passage.current >= context.world.passage.required) fail('PASSAGE_UNAVAILABLE');
      if (floorDefinition(context.world.currentFloor).requiredLevel > state.level) fail('FLOOR_LOCKED');
      const material = value.material as 'ore' | 'clue', ratio = RULES.donationValues[material];
      const progress = Math.min(context.world.passage.required - context.world.passage.current, value.amount * ratio);
      const consumed = Math.ceil(progress / ratio);
      if (state.materials[material] < consumed) fail('NOT_ENOUGH_MATERIALS');
      state.materials[material] -= consumed;
      result.worldEffect = { kind: 'construction', floor: context.world.currentFloor, amount: progress };
      events.push(`投入${consumed}${DEMON_TOWER_CATALOG.materials[material]}，增加${progress}通道进度；建设不计讨伐奖金榜。`); break;
    }
    case 'claim_reward': {
      if (state.daily.rewardClaimed) fail('DAILY_REWARD_CLAIMED');
      if (state.daily.activity < RULES.dailyActivityTarget) fail('DAILY_REWARD_NOT_READY');
      state.daily.rewardClaimed = true; result.officeCoinIntent = RULES.dailyActivityCoins;
      events.push('每日修行奖励已申请，由统一钱包按妖塔日常上限结算。'); break;
    }
    default: fail('INVALID_ACTION');
  }
  state.lastActionAt = context.now;
  return result;
}
const effectNames: Record<EffectId, string> = { strength: '力量祝福', all: '全维淬炼', illusion: '幻身', slow: '蓄势迟缓', poison: '毒伤', shred: '破防', stun: '震慑', shield: '铁壁护盾',
  charge_warning: '即将蓄力（随后重击）', charge_ready: '下次行动重击（可震慑打断）', venom_warning: '即将预备毒雾', venom_ready: '下次攻击带毒（护盾可阻止）', guard_warning: '第4回合举盾并放弃攻击' };
function logView(entries: DemonTowerCombatLog[]): DemonTowerCombatLog[] {
  return entries.slice(-MAX_LOG).map((entry) => ({ turn: entry.turn, actor: entry.actor, kind: entry.kind, text: entry.text,
    ...(entry.amount !== undefined ? { amount: entry.amount } : {}), ...(entry.targetId !== undefined ? { targetId: entry.targetId } : {}) }));
}
function reportView(report: DemonTowerBattleReport): DemonTowerBattleReport {
  return { id: report.id, kind: report.kind, floor: report.floor, outcome: report.outcome, turns: report.turns,
    damage: report.damage, experience: report.experience, materials: copyMaterials(report.materials),
    log: logView(report.log), completedAt: report.completedAt };
}
function fighterView(fighter: Fighter): DemonTowerCombatantView {
  return { id: fighter.id, name: fighter.name, hp: fighter.hp, maxHp: fighter.maxHp, shield: fighter.shield,
    attributes: dimensions(fighter), effects: fighter.effects.map((item): DemonTowerEffectView => ({ id: item.id, name: effectNames[item.id], remainingTurns: item.turns, magnitude: item.magnitude })) };
}
function battleView(state: DemonTowerEngineState): DemonTowerBattleView | null {
  const battle = state.battle;
  if (!battle) return null;
  return { id: battle.id, kind: 'explore', floor: battle.floor, turn: battle.turn, roundLimit: battle.roundLimit,
    player: fighterView(battle.player), enemies: battle.enemies.map(fighterView),
    availableSkills: state.loadout.activeSkills.map((id) => ({ id, cooldownRemaining: battle.cooldowns[id] ?? 0, usable: usableSkill(state, battle, id) })), log: logView(battle.log) };
}
export function demonTowerProfileView(state: DemonTowerEngineState, now: number, version: number, officeCoinsEarned = 0): DemonTowerProfileView {
  clock(now);
  if (!integer(version, 0, Number.MAX_SAFE_INTEGER) || !integer(officeCoinsEarned, 0, RULES.dailyOfficeCoinCap)) fail('INVALID_VIEW_CONTEXT');
  const availableActions: DemonTowerActionKind[] = state.battle ? ['attack', 'skill', 'flee'] : ['explore', 'train', 'rest', 'equip', 'allocate', 'reset_attributes', 'upgrade', 'select_floor', 'challenge_boss', 'donate', 'claim_reward'];
  if (!state.battle && !state.growth?.chosenAttribute) availableActions.push('choose_innate');
  return {
    growth: { rulesVersion: 2, pendingLegacyBattle: Boolean(state.battle && state.battle.rulesVersion !== 2),
      chosenAttribute: state.growth?.chosenAttribute ?? null, innates: [...(state.growth?.innates ?? [])],
      unlockedCount: Math.min(8, 1 + Math.floor((state.level - 1) / 15)), nextInnateLevel: state.level >= 106 ? null : (Math.floor((state.level - 1) / 15) + 1) * 15 + 1,
      misses: { ling: state.growth?.misses.ling ?? 0, xian: state.growth?.misses.xian ?? 0 }, eligible: { ling: state.level >= 16, xian: state.level >= 31 } },
    version, level: state.level, experience: state.experience, experienceToNext: demonTowerExperienceToNext(state.level), totalExperience: state.totalExperience,
    attributes: copyAttributes(state.attributes), effectiveAttributes: demonTowerEffectiveAttributes(state), unspentPoints: state.unspentPoints,
    attributeReset: { allocatedPoints: bound(3 + 2 * (state.level - 1) - state.unspentPoints, 0, 3 + 2 * (state.level - 1)),
      eligibleAt: state.lastAttributeResetAt == null ? null : state.lastAttributeResetAt + RULES.attributeResetCooldownMs },
    hp: state.hp, maxHp: demonTowerMaxHp(state), stamina: state.stamina, staminaMax: RULES.staminaCap,
    nextStaminaAt: state.stamina >= RULES.staminaCap ? null : state.staminaAt + RULES.staminaRestoreMs,
    materials: copyMaterials(state.materials), weapons: state.weapons.map((item) => ({ id: item.id, quality: item.quality, spareCopies: item.spareCopies,
      star: item.star ?? 1, favor: item.favor ?? 0, levelExempt: !state.growth || item.levelExempt === true })),
    skills: state.skills.map((item) => ({ id: item.id, quality: item.quality, spareCopies: item.spareCopies, levelExempt: !state.growth || item.levelExempt === true })),
    loadout: { mainHand: state.loadout.mainHand, artifact: state.loadout.artifact, activeSkills: [...state.loadout.activeSkills], passiveSkills: [...state.loadout.passiveSkills] },
    selectedFloor: state.selectedFloor, personalUnlockedFloor: demonTowerPersonalUnlockedFloor(state.level),
    daily: { serviceDate: state.daily.serviceDate, activity: state.daily.activity, activityTarget: RULES.dailyActivityTarget,
      rewardClaimed: state.daily.rewardClaimed, bossAttempts: state.daily.bossAttempts, bossAttemptsMax: RULES.bossAttemptsPerDay,
      officeCoinsEarned, officeCoinCap: RULES.dailyOfficeCoinCap },
    battle: battleView(state), lastReport: state.lastReport ? reportView(state.lastReport) : null, availableActions, createdAt: state.createdAt,
  };
}
