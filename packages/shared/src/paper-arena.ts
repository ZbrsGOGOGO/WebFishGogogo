/** Original authoritative team arena. Only input intent travels from the browser. */
export const PAPER_ARENA_PROTOCOL_VERSION = 2 as const;
export const PAPER_ARENA_MAP_VERSION = 'office-expanded-v2' as const;
export type PaperTeam = 'red' | 'blue';
export type PaperWeaponId = 'rifle' | 'shotgun' | 'revolver' | 'sniper' | 'katana';
export const PAPER_ARENA_WEAPON_IDS: readonly PaperWeaponId[] = ['rifle', 'shotgun', 'revolver', 'sniper', 'katana'];
export interface PaperWeaponDefinition {
  id: PaperWeaponId; slot: number; label: string; fireMode: 'automatic' | 'semi' | 'melee';
  fireInterval: number; fireIntervalMs: number; damage: number; spread: number; magazineSize: number | null; initialReserve: number | null;
  reloadDuration: number; reloadMs: number; recoil: number; range: number; adsFov: number; knockback: number;
  switchDuration: number; switchMs: number; pellets?: number; actionDuration?: number;
}
// Authored numeric weapon specifications from the locally vendored Apache-2.0
// Ballpoint Breach definitions. This is independent server simulation, not the
// client WeaponSystem or a client damage callback.
export const PAPER_ARENA_WEAPONS: Readonly<Record<PaperWeaponId, PaperWeaponDefinition>> = {
  rifle: { id: 'rifle', slot: 1, label: 'RIFLE', fireMode: 'automatic', fireInterval: .095, fireIntervalMs: 95, damage: 24, spread: .009, magazineSize: 30, initialReserve: 150, reloadDuration: 1.55, reloadMs: 1550, recoil: .68, range: 120, adsFov: 48, knockback: 2.8, switchDuration: .36, switchMs: 360 },
  shotgun: { id: 'shotgun', slot: 2, label: 'SHOTGUN', fireMode: 'semi', fireInterval: .78, fireIntervalMs: 780, damage: 15, spread: .072, magazineSize: 6, initialReserve: 30, reloadDuration: 1.9, reloadMs: 1900, recoil: 1.75, range: 34, adsFov: 58, knockback: 14, pellets: 9, actionDuration: .58, switchDuration: .4, switchMs: 400 },
  revolver: { id: 'revolver', slot: 3, label: 'REVOLVER', fireMode: 'semi', fireInterval: .44, fireIntervalMs: 440, damage: 68, spread: .0045, magazineSize: 6, initialReserve: 36, reloadDuration: 1.82, reloadMs: 1820, recoil: 1.42, range: 95, adsFov: 44, knockback: 7, switchDuration: .3, switchMs: 300 },
  sniper: { id: 'sniper', slot: 4, label: 'SNIPER', fireMode: 'semi', fireInterval: 1.08, fireIntervalMs: 1080, damage: 150, spread: .00075, magazineSize: 5, initialReserve: 25, reloadDuration: 2.25, reloadMs: 2250, recoil: 2.05, range: 240, adsFov: 24, knockback: 12, actionDuration: .82, switchDuration: .46, switchMs: 460 },
  katana: { id: 'katana', slot: 5, label: 'KATANA', fireMode: 'melee', fireInterval: .42, fireIntervalMs: 420, damage: 110, spread: 0, magazineSize: null, initialReserve: null, reloadDuration: 0, reloadMs: 0, recoil: .4, range: 4.4, adsFov: 68, knockback: 9, actionDuration: .42, switchDuration: .28, switchMs: 280 },
};
export interface PaperArenaInput {
  seq: number; forward: number; strafe: number; yaw: number; pitch: number; fire: boolean; reload: boolean;
  weapon?: PaperWeaponId; aim?: boolean; jump?: boolean; sprint?: boolean;
}
export interface PaperArenaPlayer {
  id: string; name: string; publicId: string | null; team: PaperTeam; isBot: boolean; connected: boolean;
  x: number; y: number; z: number; vy: number; grounded: boolean; yaw: number; pitch: number; hp: number; ammo: number; reserve: number;
  weapon: PaperWeaponId; arsenal: Record<PaperWeaponId, { ammo: number; reserve: number }>;
  aiming: boolean; blocking: boolean; sprinting: boolean; blockStamina: number; lastBlockAt: number;
  switchingUntil: number; actionUntil: number; lastShotAt: number;
  reloadingUntil: number; respawnAt: number; protectedUntil: number; kills: number; deaths: number; shotSeq: number;
}
export interface PaperArenaShot { id: number; team: PaperTeam; weapon: PaperWeaponId; shooterId: string; pelletIndex: number; reflected: boolean; x: number; z: number; y: number; endX: number; endZ: number; endY: number; at: number }
export interface PaperArenaRoomSummary {
  id: string; name: string; maxPlayers: number; targetKills: number; requiresPassword: boolean;
  status: 'waiting' | 'running' | 'finished'; humans: number; expiresAt: number;
}
export interface PaperArenaRoomView extends PaperArenaRoomSummary {
  protocolVersion: typeof PAPER_ARENA_PROTOCOL_VERSION; mapVersion: typeof PAPER_ARENA_MAP_VERSION;
  hostPlayerId: string | null; myPlayerId: string; players: PaperArenaPlayer[]; serverNow: number;
  game: { tick: number; elapsedMs: number; scores: Record<PaperTeam, number>; winner: PaperTeam | 'draw' | null; shots: PaperArenaShot[] };
  rules: string;
}
export const PAPER_ARENA_RULES = {
  tickMs: 50, broadcastMs: 100, playerRadius: .38, playerSpeed: 8.4, sprintSpeed: 10.2, playerHeight: 1.8, eyeHeight: 1.55, stepHeight: .46, gravity: 25, jumpSpeed: 8.3, maxHp: 100,
  damage: 24, fireIntervalMs: 95, magazine: 30, reloadMs: 1550, respawnMs: 2500,
  spawnProtectionMs: 1500, inputExpiryMs: 300, maxDurationMs: 15 * 60_000,
} as const;
import { PAPER_ARENA_MAP, getPaperArenaNavigation, paperArenaMapBodyClear, paperArenaMapFloor, paperArenaMapNavEdge } from './paper-arena-map';
export { PAPER_ARENA_MAP, getPaperArenaNavigation };
interface Control {
  input: PaperArenaInput; lastInputAt: number; triggerPending: boolean; jumpPending: boolean; reloadPending: boolean;
  nextFireAt: Record<PaperWeaponId, number>; meleeAt: number; blockExhausted: boolean; blockRegenAt: number;
  impulseX: number; impulseZ: number; botThinkAt: number; botWeaponAt: number; botWeapon: PaperWeaponId;
  botPath: number[]; botPathCursor: number; botLastX: number; botLastZ: number; botStuckAt: number;
}
/** Private simulation state. Never serialize input, paths, random state or timing queues. */
export interface PaperArenaEngine {
  tick: number; elapsedMs: number; targetKills: number; scores: Record<PaperTeam, number>; winner: PaperTeam | 'draw' | null;
  players: PaperArenaPlayer[]; shots: PaperArenaShot[]; rng: number; nextShotId: number; controls: Record<string, Control>;
}
const R = PAPER_ARENA_RULES;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const wrap = (value: number) => ((value + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const emptyInput = (): PaperArenaInput => ({ seq: -1, forward: 0, strafe: 0, yaw: 0, pitch: 0, fire: false, reload: false, aim: false, jump: false, sprint: false });
function random(state: PaperArenaEngine): number {
  let value = state.rng | 0; value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  state.rng = value >>> 0; return state.rng / 4294967296;
}
function weaponRecord<T>(make: (id: PaperWeaponId) => T): Record<PaperWeaponId, T> {
  return Object.fromEntries(PAPER_ARENA_WEAPON_IDS.map(id => [id, make(id)])) as Record<PaperWeaponId, T>;
}
function freshArsenal(): PaperArenaPlayer['arsenal'] { return weaponRecord(id => ({ ammo: PAPER_ARENA_WEAPONS[id].magazineSize ?? 0, reserve: PAPER_ARENA_WEAPONS[id].initialReserve ?? 0 })); }
function syncAmmo(player: PaperArenaPlayer): void { player.ammo = player.arsenal[player.weapon].ammo; player.reserve = player.arsenal[player.weapon].reserve; }
export function isPaperArenaInput(value: unknown): value is PaperArenaInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>, required = ['seq', 'forward', 'strafe', 'yaw', 'pitch', 'fire', 'reload'];
  const optional = ['weapon', 'aim', 'jump', 'sprint'];
  return required.every(key => Object.prototype.hasOwnProperty.call(input, key)) && Object.keys(input).every(key => required.includes(key) || optional.includes(key))
    && typeof input.seq === 'number' && Number.isSafeInteger(input.seq) && input.seq >= 0 && input.seq <= 2_147_483_647
    && ['forward', 'strafe'].every(key => typeof input[key] === 'number' && Number.isFinite(input[key]) && Math.abs(input[key] as number) <= 1)
    && typeof input.yaw === 'number' && Number.isFinite(input.yaw) && Math.abs(input.yaw) <= Math.PI * 2
    && typeof input.pitch === 'number' && Number.isFinite(input.pitch) && Math.abs(input.pitch) <= 1.2
    && typeof input.fire === 'boolean' && typeof input.reload === 'boolean'
    && (!Object.prototype.hasOwnProperty.call(input, 'weapon') || PAPER_ARENA_WEAPON_IDS.includes(input.weapon as PaperWeaponId))
    && ['aim', 'jump', 'sprint'].every(key => !Object.prototype.hasOwnProperty.call(input, key) || typeof input[key] === 'boolean');
}
/** y is feet height, not the old obstacle height or camera coordinate. */
export function paperArenaWalkable(x: number, z: number, radius: number = R.playerRadius, y = 0, allowStep = false): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) && paperArenaMapBodyClear(x, y, z, radius, R.playerHeight, allowStep);
}
export function createPaperArenaEngine(capacity: number, targetKills: number, seed: number): PaperArenaEngine {
  if (!Number.isInteger(capacity) || capacity < 4 || capacity > 8 || !Number.isInteger(targetKills) || targetKills < 20 || targetKills > 100) throw new Error('Invalid arena settings');
  const state: PaperArenaEngine = { tick: 0, elapsedMs: 0, targetKills, scores: { red: 0, blue: 0 }, winner: null, players: [], shots: [], rng: seed >>> 0 || 1, nextShotId: 1, controls: {} };
  for (let index = 0; index < capacity; index++) {
    const id = 'seat-' + (index + 1);
    const player: PaperArenaPlayer = { id, name: '协作 AI ' + (index + 1), publicId: null, team: index % 2 ? 'blue' : 'red', isBot: true, connected: false,
      x: 0, y: 0, z: 0, vy: 0, grounded: true, yaw: 0, pitch: 0, hp: R.maxHp, ammo: 30, reserve: 150,
      weapon: 'rifle', arsenal: freshArsenal(), aiming: false, blocking: false, sprinting: false, blockStamina: 100, lastBlockAt: -1000,
      switchingUntil: 0, actionUntil: 0, lastShotAt: -1000, reloadingUntil: 0, respawnAt: 0, protectedUntil: R.spawnProtectionMs, kills: 0, deaths: 0, shotSeq: 0 };
    state.players.push(player);
    state.controls[id] = { input: emptyInput(), lastInputAt: -1000, triggerPending: false, jumpPending: false, reloadPending: false, nextFireAt: weaponRecord(() => 0), meleeAt: 0, blockExhausted: false, blockRegenAt: 0,
      impulseX: 0, impulseZ: 0, botThinkAt: 0, botWeaponAt: 0, botWeapon: 'rifle', botPath: [], botPathCursor: 0, botLastX: 0, botLastZ: 0, botStuckAt: 0 };
    respawnPaperArenaPlayer(state, player);
  }
  return state;
}
/** Sequence/input reset only. Health, arsenal, shot cooldown and action remain server-owned. */
export function resetPaperArenaInput(state: PaperArenaEngine, playerId: string): void {
  const control = state.controls[playerId];
  if (control) { control.input = emptyInput(); control.lastInputAt = -1000; control.triggerPending = false; control.jumpPending = false; control.reloadPending = false; }
}
export function acceptPaperArenaInput(state: PaperArenaEngine, playerId: string, input: PaperArenaInput): boolean {
  const control = state.controls[playerId], player = state.players.find(actor => actor.id === playerId);
  if (!control || !player || !player.connected || player.isBot || state.winner || !isPaperArenaInput(input) || input.seq <= control.input.seq) return false;
  control.triggerPending ||= input.fire && !control.input.fire;
  control.jumpPending ||= Boolean(input.jump && !control.input.jump);
  control.reloadPending ||= input.reload && !control.input.reload;
  control.input = { ...input, yaw: wrap(input.yaw) }; control.lastInputAt = state.elapsedMs; return true;
}
export function respawnPaperArenaPlayer(state: PaperArenaEngine, player: PaperArenaPlayer): void {
  const nodes = getPaperArenaNavigation().nodes;
  const candidates: { x: number; y: number; z: number; safety: number }[] = [];
  // Only connected, capsule-validated navigation space can become a spawn.
  for (let attempt = 0; attempt < 100; attempt++) {
    const node = nodes[Math.floor(random(state) * nodes.length)];
    if (!node || node.y > .5 || !paperArenaWalkable(node.x, node.z, R.playerRadius, node.y)) continue;
    const others = state.players.filter(actor => actor !== player && actor.hp > 0);
    if (others.some(actor => Math.hypot(actor.x - node.x, actor.z - node.z) < 1.5)) continue;
    const enemies = others.filter(actor => actor.team !== player.team);
    const safety = enemies.length ? Math.min(...enemies.map(actor => Math.hypot(actor.x - node.x, actor.z - node.z))) : 40;
    candidates.push({ x: node.x, y: node.y, z: node.z, safety });
  }
  if (!candidates.length) {
    for (const node of nodes) {
      if (node.y > .5 || !paperArenaWalkable(node.x, node.z, R.playerRadius, node.y)) continue;
      const others = state.players.filter(actor => actor !== player && actor.hp > 0);
      const safety = Math.min(100, ...others.map(actor => Math.hypot(actor.x - node.x, actor.z - node.z)));
      if (safety >= 1.5) candidates.push({ x: node.x, y: node.y, z: node.z, safety });
    }
  }
  if (!candidates.length) throw new Error('No validated arena spawn space');
  candidates.sort((a, b) => b.safety - a.safety);
  const safest = candidates.filter(candidate => candidate.safety >= candidates[0].safety * .85).slice(0, 8);
  const chosen = safest[Math.floor(random(state) * safest.length)];
  player.x = chosen.x; player.y = chosen.y; player.z = chosen.z; player.vy = 0; player.grounded = true;
  player.yaw = Math.atan2(-chosen.x, -chosen.z); player.pitch = 0; player.hp = R.maxHp; player.arsenal = freshArsenal(); player.weapon = 'rifle'; syncAmmo(player);
  player.respawnAt = 0; player.reloadingUntil = 0; player.switchingUntil = 0; player.actionUntil = 0;
  player.aiming = player.blocking = player.sprinting = false; player.blockStamina = 100; player.lastBlockAt = -1000; player.protectedUntil = state.elapsedMs + R.spawnProtectionMs;
  const control = state.controls[player.id];
  if (control) {
    resetPaperArenaInput(state, player.id); control.botThinkAt = 0; control.botPath = []; control.botPathCursor = 0; control.botWeapon = 'rifle'; control.botWeaponAt = state.elapsedMs + 1500;
    control.nextFireAt = weaponRecord(id => state.elapsedMs + PAPER_ARENA_WEAPONS[id].fireIntervalMs);
    control.meleeAt = 0; control.blockExhausted = false; control.blockRegenAt = 0; control.impulseX = control.impulseZ = 0; control.botStuckAt = state.elapsedMs;
  }
}
/** Exact 3D slab intersection. Finite range is server-authored for each weapon. */
function boxDistance(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number, range: number): number {
  let near = 0, far = range;
  for (const [origin, direction, min, max] of [[ox, dx, minX, maxX], [oy, dy, minY, maxY], [oz, dz, minZ, maxZ]]) {
    if (Math.abs(direction) < .000001) { if (origin < min || origin > max) return Infinity; continue; }
    const a = (min - origin) / direction, b = (max - origin) / direction;
    near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
    if (near > far) return Infinity;
  }
  return far >= 0 ? near : Infinity;
}
export function paperArenaWallDistance(x: number, y: number, z: number, dx: number, dy: number, dz: number, range = 240): number {
  let distance = range;
  for (const box of PAPER_ARENA_MAP.raycastBoxes) distance = Math.min(distance, boxDistance(x, y, z, dx, dy, dz, box.x - box.w / 2, box.x + box.w / 2, box.y - box.h / 2, box.y + box.h / 2, box.z - box.d / 2, box.z + box.d / 2, range));
  if (dy < -.000001 && y >= 0) distance = Math.min(distance, y / -dy);
  return distance;
}
function targetRay(state: PaperArenaEngine, player: PaperArenaPlayer, dx: number, dy: number, dz: number, range: number): { distance: number; victim?: PaperArenaPlayer } {
  let distance = paperArenaWallDistance(player.x, player.y + R.eyeHeight, player.z, dx, dy, dz, range), victim: PaperArenaPlayer | undefined;
  for (const other of state.players) {
    if (other === player || other.hp <= 0) continue;
    const hit = boxDistance(player.x, player.y + R.eyeHeight, player.z, dx, dy, dz, other.x - R.playerRadius, other.x + R.playerRadius, other.y + .05, other.y + R.playerHeight, other.z - R.playerRadius, other.z + R.playerRadius, range);
    // Teammates and protected players occlude hits, never damage-through.
    if (hit < distance) { distance = hit; victim = other; }
  }
  return { distance, victim };
}
function recordShot(state: PaperArenaEngine, player: PaperArenaPlayer, weapon: PaperWeaponId, dx: number, dy: number, dz: number, distance: number, pelletIndex = 0, reflected = false): void {
  state.shots.push({ id: state.nextShotId++, team: player.team, weapon, shooterId: player.id, pelletIndex, reflected, x: player.x, z: player.z, y: player.y + R.eyeHeight,
    endX: player.x + dx * distance, endZ: player.z + dz * distance, endY: player.y + R.eyeHeight + dy * distance, at: state.elapsedMs });
  if (state.shots.length > 96) state.shots.splice(0, state.shots.length - 96);
}
function damage(state: PaperArenaEngine, attacker: PaperArenaPlayer, victim: PaperArenaPlayer, amount: number, dx: number, dz: number, knockback: number): void {
  if (state.winner || victim.hp <= 0 || victim.team === attacker.team || victim.protectedUntil > state.elapsedMs) return;
  victim.hp = Math.max(0, victim.hp - amount);
  const control = state.controls[victim.id];
  control.impulseX = clamp(control.impulseX + dx * knockback * .25, -5, 5); control.impulseZ = clamp(control.impulseZ + dz * knockback * .25, -5, 5);
  if (victim.hp === 0) {
    victim.deaths++; attacker.kills++; state.scores[attacker.team]++; victim.respawnAt = state.elapsedMs + R.respawnMs;
    victim.aiming = victim.blocking = victim.sprinting = false; control.meleeAt = 0; resetPaperArenaInput(state, victim.id);
    if (state.scores[attacker.team] >= state.targetKills) state.winner = attacker.team;
  }
}
function ballistic(state: PaperArenaEngine, player: PaperArenaPlayer, weapon: PaperWeaponId, dx: number, dy: number, dz: number, pelletIndex: number, reflected = false, reflectedDamage?: number): void {
  const definition = PAPER_ARENA_WEAPONS[weapon], ray = targetRay(state, player, dx, dy, dz, definition.range);
  recordShot(state, player, weapon, dx, dy, dz, ray.distance, pelletIndex, reflected);
  const victim = ray.victim;
  if (!victim || victim.team === player.team || victim.protectedUntil > state.elapsedMs || state.winner) return;
  const facing = Math.sin(victim.yaw) * -dx + Math.cos(victim.yaw) * -dz;
  if (!reflected && victim.weapon === 'katana' && victim.blocking && victim.blockStamina >= 14 && facing >= .34) {
    victim.blockStamina -= 14; victim.lastBlockAt = state.elapsedMs; victim.protectedUntil = 0;
    const control = state.controls[victim.id]; control.blockRegenAt = state.elapsedMs + 680;
    if (victim.blockStamina <= 0) { victim.blocking = false; control.blockExhausted = true; }
    // One server-traced return shot, never recursive reflections or client hit reports.
    const rx = Math.sin(victim.yaw) * Math.cos(victim.pitch), rz = Math.cos(victim.yaw) * Math.cos(victim.pitch), ry = Math.sin(victim.pitch);
    ballistic(state, victim, weapon, rx, ry, rz, pelletIndex, true, definition.damage);
    return;
  }
  damage(state, player, victim, reflectedDamage ?? definition.damage, dx, dz, definition.knockback);
}
function slash(state: PaperArenaEngine, player: PaperArenaPlayer): void {
  const definition = PAPER_ARENA_WEAPONS.katana, seen = new Set<string>();
  // Targets in the 104-degree authored arc. Each contact must separately pass a
  // real nearest-body + map ray, so neither walls nor friendly bodies are bypassed.
  for (const other of state.players) {
    if (other === player || other.hp <= 0 || state.winner) continue;
    const dx = other.x - player.x, dz = other.z - player.z, dy = other.y + .9 - player.y - R.eyeHeight, distance = Math.hypot(dx, dy, dz);
    if (distance > definition.range || distance < .001 || (Math.sin(player.yaw) * dx + Math.cos(player.yaw) * dz) / Math.hypot(dx, dz) < Math.cos(52 * Math.PI / 180)) continue;
    const ray = targetRay(state, player, dx / distance, dy / distance, dz / distance, definition.range);
    if (!ray.victim || seen.has(ray.victim.id)) continue;
    seen.add(ray.victim.id); recordShot(state, player, 'katana', dx / distance, dy / distance, dz / distance, ray.distance);
    damage(state, player, ray.victim, definition.damage, dx / distance, dz / distance, definition.knockback);
  }
}
function shoot(state: PaperArenaEngine, player: PaperArenaPlayer, input: PaperArenaInput): void {
  const control = state.controls[player.id], definition = PAPER_ARENA_WEAPONS[player.weapon], runtime = player.arsenal[player.weapon];
  const triggered = definition.fireMode === 'automatic' ? input.fire : control.triggerPending;
  // A trigger edge is consumed even during an animation/cooldown; a held semi
  // trigger never becomes a delayed repeating firearm after expiry or switching.
  control.triggerPending = false;
  if (!triggered || player.reloadingUntil > state.elapsedMs || player.switchingUntil > state.elapsedMs || player.actionUntil > state.elapsedMs || player.blocking || player.sprinting || state.elapsedMs < control.nextFireAt[player.weapon]) return;
  if (definition.fireMode !== 'melee' && runtime.ammo <= 0) return;
  if (definition.fireMode !== 'melee') runtime.ammo--;
  player.shotSeq++; player.lastShotAt = state.elapsedMs; player.protectedUntil = 0;
  // Never bank missed rounds during idle/reload/switch. At 20 Hz authored
  // intervals round upward to the next simulation tick (rifle 95ms -> 100ms).
  control.nextFireAt[player.weapon] = state.elapsedMs + definition.fireIntervalMs;
  player.actionUntil = state.elapsedMs + (definition.actionDuration ?? 0) * 1000;
  if (definition.fireMode === 'melee') { control.meleeAt = state.elapsedMs + 100; syncAmmo(player); return; }
  const spread = definition.spread * (player.aiming ? .3 : 1);
  for (let pellet = 0; pellet < (definition.pellets ?? 1) && !state.winner; pellet++) {
    const yaw = player.yaw + (random(state) - .5) * 2 * spread, pitch = player.pitch + (random(state) - .5) * 2 * spread;
    ballistic(state, player, player.weapon, Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch), pellet);
  }
  syncAmmo(player);
}
function updateWeapon(state: PaperArenaEngine, player: PaperArenaPlayer, input: PaperArenaInput): void {
  const control = state.controls[player.id];
  if (player.switchingUntil && state.elapsedMs >= player.switchingUntil) player.switchingUntil = 0;
  if (player.actionUntil && state.elapsedMs >= player.actionUntil) player.actionUntil = 0;
  if (player.reloadingUntil && state.elapsedMs >= player.reloadingUntil) {
    const definition = PAPER_ARENA_WEAPONS[player.weapon], runtime = player.arsenal[player.weapon];
    const transfer = Math.min((definition.magazineSize ?? 0) - runtime.ammo, runtime.reserve);
    runtime.ammo += Math.max(0, transfer); runtime.reserve -= Math.max(0, transfer); player.reloadingUntil = 0;
  }
  if (input.weapon && input.weapon !== player.weapon && !player.switchingUntil && !player.actionUntil && !player.blocking) {
    player.switchingUntil = state.elapsedMs + Math.max(PAPER_ARENA_WEAPONS[player.weapon].switchMs, PAPER_ARENA_WEAPONS[input.weapon].switchMs);
    player.weapon = input.weapon; player.reloadingUntil = 0; control.meleeAt = 0; player.aiming = false;
  }
  const definition = PAPER_ARENA_WEAPONS[player.weapon], runtime = player.arsenal[player.weapon];
  if ((input.reload || control.reloadPending || runtime.ammo === 0) && definition.magazineSize !== null && runtime.ammo < definition.magazineSize && runtime.reserve > 0 && !player.reloadingUntil && !player.switchingUntil && !player.actionUntil) player.reloadingUntil = state.elapsedMs + definition.reloadMs;
  control.reloadPending = false;
  if (!input.aim) control.blockExhausted = false;
  const canAim = Boolean(input.aim && !player.switchingUntil && !player.reloadingUntil && (!player.actionUntil || player.weapon !== 'katana' && player.weapon !== 'sniper'));
  player.aiming = canAim && player.weapon !== 'katana';
  const wasBlocking = player.blocking;
  player.blocking = canAim && player.weapon === 'katana' && !control.blockExhausted && player.blockStamina > 0;
  if (player.blocking) {
    player.blockStamina = Math.max(0, player.blockStamina - 18 * R.tickMs / 1000); control.blockRegenAt = state.elapsedMs + 680;
    if (player.blockStamina <= 0) { player.blocking = false; control.blockExhausted = true; }
  } else {
    if (wasBlocking) control.blockRegenAt = state.elapsedMs + 680;
    if (state.elapsedMs >= control.blockRegenAt) player.blockStamina = Math.min(100, player.blockStamina + 30 * R.tickMs / 1000);
  }
  syncAmmo(player);
}
function movePlayer(state: PaperArenaEngine, player: PaperArenaPlayer, input: PaperArenaInput): void {
  const control = state.controls[player.id], dt = R.tickMs / 1000;
  player.yaw = input.yaw; player.pitch = input.pitch;
  player.sprinting = Boolean(input.sprint && input.forward > .1 && !input.aim && !input.fire && !player.reloadingUntil && !player.switchingUntil);
  // Grounded stair tolerance must not become mid-air wall penetration under a
  // low overhang: the strict capsule must have room before leaving support.
  if (control.jumpPending && player.grounded && paperArenaWalkable(player.x, player.z, R.playerRadius, player.y)) { player.vy = R.jumpSpeed; player.grounded = false; }
  control.jumpPending = false;
  const magnitude = Math.max(1, Math.hypot(input.forward, input.strafe)), forward = input.forward / magnitude, strafe = input.strafe / magnitude;
  const speed = (player.sprinting ? R.sprintSpeed : R.playerSpeed) * (player.aiming || player.blocking ? .65 : 1);
  const dx = ((Math.sin(player.yaw) * forward + Math.cos(player.yaw) * strafe) * speed + control.impulseX) * dt;
  const dz = ((Math.cos(player.yaw) * forward - Math.sin(player.yaw) * strafe) * speed + control.impulseZ) * dt;
  // Substeps prevent 10.2m/s sprint/knockback from tunnelling through thin props.
  const count = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / .16));
  const horizontal = (x: number, z: number) => {
    let y = player.y;
    if (player.grounded) { const floor = paperArenaMapFloor(x, z, player.y + R.stepHeight); if (floor !== null && floor >= player.y - .08) y = floor; }
    if (paperArenaWalkable(x, z, R.playerRadius, y, player.grounded)) { player.x = x; player.z = z; player.y = y; }
  };
  for (let step = 0; step < count; step++) { horizontal(player.x + dx / count, player.z); horizontal(player.x, player.z + dz / count); }
  control.impulseX *= .72; control.impulseZ *= .72;
  const oldY = player.y; player.vy -= R.gravity * dt;
  let nextY = oldY + player.vy * dt;
  if (player.vy > 0) {
    for (const box of PAPER_ARENA_MAP.colliders) {
      if (Math.abs(player.x - box.x) >= box.w / 2 + R.playerRadius || Math.abs(player.z - box.z) >= box.d / 2 + R.playerRadius) continue;
      const bottom = box.y - box.h / 2;
      if (bottom >= oldY + R.playerHeight - .001 && nextY + R.playerHeight >= bottom) { nextY = bottom - R.playerHeight; player.vy = 0; }
    }
  }
  const floor = paperArenaMapFloor(player.x, player.z, oldY + .02);
  if (player.vy <= 0 && floor !== null && nextY <= floor && oldY >= floor - .03) { player.y = floor; player.vy = 0; player.grounded = true; }
  else { player.y = nextY; player.grounded = false; }
  // Bound defensive fallback without healing/ammunition changes.
  if (!Number.isFinite(player.y) || player.y < -8) { const floorAt = paperArenaMapFloor(player.x, player.z, 0); player.y = floorAt ?? 0; player.vy = 0; player.grounded = true; }
}
function nearestNode(x: number, y: number, z: number, reachable = false): number {
  const nodes = getPaperArenaNavigation().nodes; let selected = 0, best = Infinity;
  const candidates: { index: number; distance: number }[] = [];
  for (let i = 0; i < nodes.length; i++) { const n = nodes[i], d = Math.hypot(n.x - x, n.z - z) + Math.abs(n.y - y) * 5; if (d < best) { best = d; selected = i; } if (reachable && d < 8) candidates.push({ index: i, distance: d }); }
  if (reachable) {
    candidates.sort((a, b) => a.distance - b.distance);
    const match = candidates.slice(0, 64).find(candidate => paperArenaMapNavEdge({ x, y, z }, nodes[candidate.index]));
    if (match) return match.index;
  }
  return selected;
}
/** Bounded A* over offline capsule-validated navigation edges; no wall shortcuts. */
function findPath(start: number, goal: number): number[] {
  const nodes = getPaperArenaNavigation().nodes;
  if (start === goal) return [goal];
  const costs = new Map<number, number>([[start, 0]]), parents = new Map<number, number>(), closed = new Set<number>();
  const heap: { id: number; value: number }[] = [];
  const heuristic = (id: number) => Math.hypot(nodes[id].x - nodes[goal].x, nodes[id].z - nodes[goal].z) + Math.abs(nodes[id].y - nodes[goal].y);
  const push = (id: number, value: number) => { heap.push({ id, value }); let i = heap.length - 1; while (i > 0) { const parent = (i - 1) >> 1; if (heap[parent].value <= value) break; [heap[i], heap[parent]] = [heap[parent], heap[i]]; i = parent; } };
  const pop = () => { const result = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const left = i * 2 + 1, right = left + 1; if (left >= heap.length) break; const smallest = right < heap.length && heap[right].value < heap[left].value ? right : left; if (heap[i].value <= heap[smallest].value) break; [heap[i], heap[smallest]] = [heap[smallest], heap[i]]; i = smallest; } } return result; };
  push(start, heuristic(start)); let closest = start, expanded = 0;
  while (heap.length && expanded++ < 6000) {
    const current = pop().id; if (closed.has(current)) continue; closed.add(current);
    if (heuristic(current) < heuristic(closest)) closest = current;
    if (current === goal) { closest = goal; break; }
    for (const next of nodes[current].neighbors) {
      if (closed.has(next)) continue;
      const cost = costs.get(current)! + Math.hypot(nodes[next].x - nodes[current].x, nodes[next].z - nodes[current].z, nodes[next].y - nodes[current].y);
      if (cost >= (costs.get(next) ?? Infinity)) continue;
      costs.set(next, cost); parents.set(next, current); push(next, cost + heuristic(next));
    }
  }
  const path = [closest]; while (parents.has(path[0]) && path.length < 512) path.unshift(parents.get(path[0])!);
  return path.slice(1);
}
function botControl(state: PaperArenaEngine, player: PaperArenaPlayer): PaperArenaInput {
  const control = state.controls[player.id];
  const enemies = state.players.filter(other => other.team !== player.team && other.hp > 0).sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z, a.y - player.y) - Math.hypot(b.x - player.x, b.z - player.z, b.y - player.y));
  const enemy = enemies[0]; if (!enemy) return { ...emptyInput(), yaw: player.yaw, pitch: player.pitch };
  const dx = enemy.x - player.x, dz = enemy.z - player.z, dy = enemy.y + .95 - player.y - R.eyeHeight, distance = Math.hypot(dx, dz, dy), aim = Math.atan2(dx, dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz)), visible = paperArenaWallDistance(player.x, player.y + R.eyeHeight, player.z, dx / distance, dy / distance, dz / distance, distance) >= distance - .05;
  if (state.elapsedMs >= control.botWeaponAt) {
    const preferred: PaperWeaponId = distance < 3.5 ? 'katana' : distance < 10 ? 'shotgun' : distance > 32 ? 'sniper' : 'rifle';
    control.botWeapon = [preferred, 'rifle', 'revolver', 'shotgun', 'sniper', 'katana'].find(id => id === 'katana' || player.arsenal[id as PaperWeaponId].ammo + player.arsenal[id as PaperWeaponId].reserve > 0) as PaperWeaponId;
    control.botWeaponAt = state.elapsedMs + 2200;
  }
  if (visible) {
    const yaw = wrap(player.yaw + clamp(wrap(aim - player.yaw), -.2, .2) + Math.sin(state.tick * .07 + Number(player.id.slice(5))) * .003);
    const p = clamp(player.pitch + clamp(pitch - player.pitch, -.12, .12), -1.2, 1.2), definition = PAPER_ARENA_WEAPONS[player.weapon];
    return { seq: state.tick, forward: distance > 13 ? .8 : distance < 3 && player.weapon !== 'katana' ? -.25 : player.weapon === 'katana' && distance > 2 ? .8 : 0, strafe: distance < 24 && player.weapon !== 'katana' ? Math.sin(state.elapsedMs / 1300 + Number(player.id.slice(5))) * .18 : 0,
      yaw, pitch: p, weapon: control.botWeapon, aim: distance > 18, fire: Math.abs(wrap(aim - yaw)) < .09 && Math.abs(pitch - p) < .08 && distance <= definition.range && (definition.fireMode === 'automatic' ? state.elapsedMs % 850 < 650 : state.tick % 2 === 0), reload: player.ammo === 0, jump: false, sprint: false };
  }
  const nodes = getPaperArenaNavigation().nodes;
  if (Math.hypot(player.x - control.botLastX, player.z - control.botLastZ) > .5) { control.botLastX = player.x; control.botLastZ = player.z; control.botStuckAt = state.elapsedMs; }
  if (state.elapsedMs >= control.botThinkAt || control.botPathCursor >= control.botPath.length) {
    const start = nearestNode(player.x, player.y, player.z, true);
    control.botPath = [start, ...findPath(start, nearestNode(enemy.x, enemy.y, enemy.z))]; control.botPathCursor = 0; control.botThinkAt = state.elapsedMs + 2000;
  }
  let point = nodes[control.botPath[control.botPathCursor]];
  while (point && Math.hypot(point.x - player.x, point.z - player.z) < .3 && Math.abs(point.y - player.y) < .5) point = nodes[control.botPath[++control.botPathCursor]];
  if (!point) return { ...emptyInput(), seq: state.tick, yaw: player.yaw, pitch: 0, weapon: control.botWeapon, reload: player.ammo < (PAPER_ARENA_WEAPONS[player.weapon].magazineSize ?? 0) / 2 };
  const yaw = Math.atan2(point.x - player.x, point.z - player.z), stuck = state.elapsedMs - control.botStuckAt > 1500;
  return { seq: state.tick, forward: Math.min(.9, Math.hypot(point.x - player.x, point.z - player.z) / (R.playerSpeed * R.tickMs / 1000)), strafe: 0, yaw, pitch: 0, weapon: control.botWeapon, fire: false, aim: false, reload: player.ammo === 0, jump: stuck && state.tick % 10 === 0, sprint: false };
}
/** A deadline uses only existing server scores, never artificial catch-up kills. */
export function finishPaperArenaAtDeadline(state: PaperArenaEngine): void {
  if (state.winner) return;
  state.elapsedMs = R.maxDurationMs; state.winner = state.scores.red === state.scores.blue ? 'draw' : state.scores.red > state.scores.blue ? 'red' : 'blue';
}
/** One fixed 50ms step; all transforms, weapons and damage remain server-owned. */
export function stepPaperArena(state: PaperArenaEngine): void {
  if (state.winner) return;
  state.tick++; state.elapsedMs = state.tick * R.tickMs;
  state.shots = state.shots.filter(shot => state.elapsedMs - shot.at < 220).slice(-96);
  if (state.elapsedMs >= R.maxDurationMs) { finishPaperArenaAtDeadline(state); return; }
  const players = state.tick % 2 ? state.players : [...state.players].reverse(), active = new Map<string, PaperArenaInput>();
  for (const player of players) {
    if (player.hp <= 0) { if (state.elapsedMs >= player.respawnAt) respawnPaperArenaPlayer(state, player); continue; }
    const control = state.controls[player.id], automated = player.isBot || !player.connected;
    const input = automated ? botControl(state, player) : state.elapsedMs - control.lastInputAt <= R.inputExpiryMs ? control.input : { ...emptyInput(), yaw: player.yaw, pitch: player.pitch };
    if (automated) { control.triggerPending = input.fire && !control.input.fire; control.jumpPending = Boolean(input.jump && !control.input.jump); control.input = input; }
    if (!automated && state.elapsedMs - control.lastInputAt > R.inputExpiryMs) { control.triggerPending = false; control.jumpPending = false; control.reloadPending = false; }
    updateWeapon(state, player, input); movePlayer(state, player, input); active.set(player.id, input);
  }
  // Everyone's current guarding/movement intent is applied before damage order.
  for (const player of players) {
    if (state.winner) break; if (player.hp <= 0 || !active.has(player.id)) continue;
    const control = state.controls[player.id];
    if (control.meleeAt && state.elapsedMs >= control.meleeAt) { control.meleeAt = 0; if (player.weapon === 'katana') slash(state, player); }
    if (!state.winner) shoot(state, player, active.get(player.id)!);
  }
}
