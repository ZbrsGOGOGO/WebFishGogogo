/** Original authoritative team arena. Only input intent travels from the browser. */
export type PaperTeam = 'red' | 'blue';
export interface PaperArenaInput {
  seq: number; forward: number; strafe: number; yaw: number; pitch: number; fire: boolean; reload: boolean;
}
export interface PaperArenaPlayer {
  id: string; name: string; publicId: string | null; team: PaperTeam; isBot: boolean; connected: boolean;
  x: number; z: number; yaw: number; pitch: number; hp: number; ammo: number;
  reloadingUntil: number; respawnAt: number; protectedUntil: number; kills: number; deaths: number; shotSeq: number;
}
export interface PaperArenaShot { id: number; team: PaperTeam; x: number; z: number; y: number; endX: number; endZ: number; endY: number; at: number }
export interface PaperArenaRoomSummary {
  id: string; name: string; maxPlayers: number; targetKills: number; requiresPassword: boolean;
  status: 'waiting' | 'running' | 'finished'; humans: number; expiresAt: number;
}
export interface PaperArenaRoomView extends PaperArenaRoomSummary {
  hostPlayerId: string | null; myPlayerId: string; players: PaperArenaPlayer[]; serverNow: number;
  game: { tick: number; elapsedMs: number; scores: Record<PaperTeam, number>; winner: PaperTeam | 'draw' | null; shots: PaperArenaShot[] };
  rules: string;
}
export const PAPER_ARENA_RULES = {
  tickMs: 50, broadcastMs: 100, playerRadius: .38, playerSpeed: 5.2, maxHp: 100,
  damage: 25, fireIntervalMs: 180, magazine: 24, reloadMs: 1300, respawnMs: 2500,
  spawnProtectionMs: 1500, inputExpiryMs: 300, maxDurationMs: 15 * 60_000,
} as const;
export const PAPER_ARENA_MAP = {
  size: 36, wallHeight: 3,
  obstacles: [
    { x: -8, z: -8, w: 4, d: 3, h: 2.4 }, { x: 8, z: 8, w: 4, d: 3, h: 2.4 },
    { x: -8, z: 8, w: 4, d: 3, h: 2.4 }, { x: 8, z: -8, w: 4, d: 3, h: 2.4 },
    { x: 0, z: 0, w: 3, d: 5, h: 2.5 }, { x: -13, z: 0, w: 2, d: 6, h: 1.9 },
    { x: 13, z: 0, w: 2, d: 6, h: 1.9 }, { x: 0, z: -13, w: 6, d: 2, h: 1.9 },
    { x: 0, z: 13, w: 6, d: 2, h: 1.9 },
  ],
} as const;
/** Private simulation state. Do not serialize inputs or random state to clients. */
export interface PaperArenaEngine {
  tick: number; elapsedMs: number; targetKills: number; scores: Record<PaperTeam, number>; winner: PaperTeam | 'draw' | null;
  players: PaperArenaPlayer[]; shots: PaperArenaShot[]; rng: number; nextShotId: number;
  controls: Record<string, { input: PaperArenaInput; lastInputAt: number; lastShotAt: number; botWaypoint: { x: number; z: number }; botThinkAt: number }>;
}
const R = PAPER_ARENA_RULES;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const wrap = (value: number) => ((value + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const emptyInput = (): PaperArenaInput => ({ seq: -1, forward: 0, strafe: 0, yaw: 0, pitch: 0, fire: false, reload: false });
function random(state: PaperArenaEngine): number {
  let value = state.rng | 0; value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  state.rng = value >>> 0; return state.rng / 4294967296;
}
export function isPaperArenaInput(value: unknown): value is PaperArenaInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  const keys = ['seq', 'forward', 'strafe', 'yaw', 'pitch', 'fire', 'reload'];
  return Object.keys(input).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(input, key))
    && typeof input.seq === 'number' && Number.isSafeInteger(input.seq) && input.seq >= 0 && input.seq <= 2_147_483_647
    && ['forward', 'strafe'].every(key => typeof input[key] === 'number' && Number.isFinite(input[key]) && Math.abs(input[key] as number) <= 1)
    && typeof input.yaw === 'number' && Number.isFinite(input.yaw) && Math.abs(input.yaw) <= Math.PI * 2
    && typeof input.pitch === 'number' && Number.isFinite(input.pitch) && Math.abs(input.pitch) <= 1.2
    && typeof input.fire === 'boolean' && typeof input.reload === 'boolean';
}
export function paperArenaWalkable(x: number, z: number, radius: number = R.playerRadius): boolean {
  const edge = PAPER_ARENA_MAP.size / 2 - radius;
  return Number.isFinite(x) && Number.isFinite(z) && Math.abs(x) <= edge && Math.abs(z) <= edge
    && !PAPER_ARENA_MAP.obstacles.some(box => Math.abs(x - box.x) < box.w / 2 + radius && Math.abs(z - box.z) < box.d / 2 + radius);
}
export function createPaperArenaEngine(capacity: number, targetKills: number, seed: number): PaperArenaEngine {
  if (!Number.isInteger(capacity) || capacity < 4 || capacity > 8 || !Number.isInteger(targetKills) || targetKills < 20 || targetKills > 100) throw new Error('Invalid arena settings');
  const state: PaperArenaEngine = { tick: 0, elapsedMs: 0, targetKills, scores: { red: 0, blue: 0 }, winner: null, players: [], shots: [], rng: seed >>> 0 || 1, nextShotId: 1, controls: {} };
  for (let index = 0; index < capacity; index++) {
    const id = `seat-${index + 1}`;
    const player: PaperArenaPlayer = { id, name: `协作 AI ${index + 1}`, publicId: null, team: index % 2 ? 'blue' : 'red', isBot: true, connected: false,
      x: 0, z: 0, yaw: 0, pitch: 0, hp: R.maxHp, ammo: R.magazine, reloadingUntil: 0, respawnAt: 0, protectedUntil: R.spawnProtectionMs, kills: 0, deaths: 0, shotSeq: 0 };
    state.players.push(player);
    state.controls[id] = { input: emptyInput(), lastInputAt: -1000, lastShotAt: -1000, botWaypoint: { x: 0, z: 0 }, botThinkAt: 0 };
    respawnPaperArenaPlayer(state, player);
  }
  return state;
}
/** Reconnect resets the sequence boundary only; it never restores health/ammo. */
export function resetPaperArenaInput(state: PaperArenaEngine, playerId: string): void {
  const control = state.controls[playerId];
  if (control) { control.input = emptyInput(); control.lastInputAt = -1000; }
}
export function acceptPaperArenaInput(state: PaperArenaEngine, playerId: string, input: PaperArenaInput): boolean {
  const control = state.controls[playerId];
  const player = state.players.find(actor => actor.id === playerId);
  if (!control || !player || !player.connected || player.isBot || state.winner || !isPaperArenaInput(input) || input.seq <= control.input.seq) return false;
  control.input = { ...input, yaw: wrap(input.yaw) }; control.lastInputAt = state.elapsedMs; return true;
}
export function respawnPaperArenaPlayer(state: PaperArenaEngine, player: PaperArenaPlayer): void {
  const candidates: { x: number; z: number; safety: number }[] = [];
  for (let count = 0; count < 80; count++) {
    const x = (random(state) - .5) * 32, z = (random(state) - .5) * 32;
    if (!paperArenaWalkable(x, z, .65)) continue;
    const others = state.players.filter(actor => actor !== player && actor.hp > 0);
    if (others.some(actor => Math.hypot(actor.x - x, actor.z - z) < 1.2)) continue;
    const enemies = others.filter(actor => actor.team !== player.team);
    const safety = enemies.length ? Math.min(...enemies.map(actor => Math.hypot(actor.x - x, actor.z - z))) : 30;
    candidates.push({ x, z, safety });
  }
  // Fixed fallback corners are all validated map space; choose the least crowded.
  if (!candidates.length) for (const x of [-16, 16]) for (const z of [-16, 16]) candidates.push({ x, z, safety: Math.min(30, ...state.players.filter(actor => actor !== player && actor.hp > 0).map(actor => Math.hypot(actor.x - x, actor.z - z))) });
  candidates.sort((a, b) => b.safety - a.safety);
  const safest = candidates.filter(candidate => candidate.safety >= candidates[0].safety * .85).slice(0, 5);
  const chosen = safest[Math.floor(random(state) * safest.length)];
  player.x = chosen.x; player.z = chosen.z; player.yaw = Math.atan2(-chosen.x, -chosen.z); player.pitch = 0;
  player.hp = R.maxHp; player.ammo = R.magazine; player.respawnAt = 0; player.reloadingUntil = 0; player.protectedUntil = state.elapsedMs + R.spawnProtectionMs;
  const control = state.controls[player.id];
  if (control) { resetPaperArenaInput(state, player.id); control.botThinkAt = 0; control.lastShotAt = state.elapsedMs; }
}
/** Ray/axis-aligned box intersection shared with the renderer's fixed map. */
function boxDistance(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number): number {
  let near = 0, far = 80;
  for (const [origin, direction, min, max] of [[ox, dx, minX, maxX], [oy, dy, minY, maxY], [oz, dz, minZ, maxZ]]) {
    if (Math.abs(direction) < .000001) { if (origin < min || origin > max) return Infinity; continue; }
    const a = (min - origin) / direction, b = (max - origin) / direction;
    near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
    if (near > far) return Infinity;
  }
  return far >= 0 ? near : Infinity;
}
function obstacleDistance(player: PaperArenaPlayer, dx: number, dy: number, dz: number): number {
  let distance = 70;
  for (const box of PAPER_ARENA_MAP.obstacles) distance = Math.min(distance, boxDistance(player.x, 1.4, player.z, dx, dy, dz, box.x - box.w / 2, box.x + box.w / 2, 0, box.h, box.z - box.d / 2, box.z + box.d / 2));
  return distance;
}
function shoot(state: PaperArenaEngine, player: PaperArenaPlayer): void {
  const control = state.controls[player.id];
  if (player.ammo <= 0 || player.reloadingUntil || state.elapsedMs - control.lastShotAt < R.fireIntervalMs) return;
  player.ammo--; player.shotSeq++; player.protectedUntil = 0; control.lastShotAt = state.elapsedMs;
  const dx = Math.sin(player.yaw) * Math.cos(player.pitch), dz = Math.cos(player.yaw) * Math.cos(player.pitch), dy = Math.sin(player.pitch);
  let distance = obstacleDistance(player, dx, dy, dz), victim: PaperArenaPlayer | undefined;
  for (const other of state.players) {
    if (other === player || other.hp <= 0) continue;
    const hit = boxDistance(player.x, 1.4, player.z, dx, dy, dz, other.x - .38, other.x + .38, .15, 1.8, other.z - .38, other.z + .38);
    // Teammates and protected bodies block rays but cannot be damaged.
    if (hit < distance) { distance = hit; victim = other; }
  }
  state.shots.push({ id: state.nextShotId++, team: player.team, x: player.x, z: player.z, y: 1.4, endX: player.x + dx * distance, endZ: player.z + dz * distance, endY: 1.4 + dy * distance, at: state.elapsedMs });
  if (!victim || victim.team === player.team || victim.protectedUntil > state.elapsedMs) return;
  victim.hp = Math.max(0, victim.hp - R.damage);
  if (victim.hp === 0) {
    victim.deaths++; player.kills++; state.scores[player.team]++;
    victim.respawnAt = state.elapsedMs + R.respawnMs; resetPaperArenaInput(state, victim.id);
    if (state.scores[player.team] >= state.targetKills) state.winner = player.team;
  }
}
function botControl(state: PaperArenaEngine, player: PaperArenaPlayer): PaperArenaInput {
  const control = state.controls[player.id];
  const enemies = state.players.filter(other => other.team !== player.team && other.hp > 0).sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z));
  const enemy = enemies[0];
  if (!enemy) return { ...emptyInput(), yaw: player.yaw };
  const dx = enemy.x - player.x, dz = enemy.z - player.z, distance = Math.hypot(dx, dz);
  const aim = Math.atan2(dx, dz);
  const visible = obstacleDistance(player, Math.sin(aim), 0, Math.cos(aim)) > distance;
  if (visible) {
    // Human-like turn speed, reaction/cadence and intentionally imperfect aim.
    const turn = clamp(wrap(aim - player.yaw), -.13, .13);
    const yaw = wrap(player.yaw + turn + Math.sin(state.tick * .07 + Number(player.id.slice(5))) * .006);
    return { seq: state.tick, forward: distance > 8 ? .65 : distance < 4 ? -.4 : 0, strafe: Math.sin(state.elapsedMs / 900 + player.id.length) * .35, yaw, pitch: 0,
      fire: Math.abs(wrap(aim - yaw)) < .09 && state.elapsedMs % 700 < 400, reload: player.ammo < 3 };
  }
  if (state.elapsedMs >= control.botThinkAt || Math.hypot(control.botWaypoint.x - player.x, control.botWaypoint.z - player.z) < 1) {
    const points = [-15, -11, -5, 5, 11, 15];
    const options: { x: number; z: number; distance: number }[] = [];
    for (const x of points) for (const z of points) {
      if (!paperArenaWalkable(x, z, .6)) continue;
      const angle = Math.atan2(x - player.x, z - player.z);
      if (obstacleDistance(player, Math.sin(angle), 0, Math.cos(angle)) < Math.hypot(x - player.x, z - player.z) + .6) continue;
      options.push({ x, z, distance: Math.hypot(x - enemy.x, z - enemy.z) + random(state) * 5 });
    }
    options.sort((a, b) => a.distance - b.distance);
    control.botWaypoint = options[0] ?? { x: player.x + Math.sin(aim + Math.PI / 2) * 4, z: player.z + Math.cos(aim + Math.PI / 2) * 4 };
    control.botThinkAt = state.elapsedMs + 1300;
  }
  const yaw = Math.atan2(control.botWaypoint.x - player.x, control.botWaypoint.z - player.z);
  return { seq: state.tick, forward: .8, strafe: 0, yaw, pitch: 0, fire: false, reload: player.ammo < 12 };
}
/** A deadline compares only server-owned scores; it never invents catch-up kills. */
export function finishPaperArenaAtDeadline(state: PaperArenaEngine): void {
  if (state.winner) return;
  state.elapsedMs = R.maxDurationMs;
  state.winner = state.scores.red === state.scores.blue ? 'draw' : state.scores.red > state.scores.blue ? 'red' : 'blue';
}
/** Exactly one 50ms step, independent of the caller's frame rate and timestamps. */
export function stepPaperArena(state: PaperArenaEngine): void {
  if (state.winner) return;
  state.tick++; state.elapsedMs = state.tick * R.tickMs;
  state.shots = state.shots.filter(shot => state.elapsedMs - shot.at < 220).slice(-32);
  if (state.elapsedMs >= R.maxDurationMs) { finishPaperArenaAtDeadline(state); return; }
  // Alternate first mover so fixed slot order does not favor one team forever.
  const players = state.tick % 2 ? state.players : [...state.players].reverse();
  for (const player of players) {
    if (state.winner) break;
    if (player.hp <= 0) { if (state.elapsedMs >= player.respawnAt) respawnPaperArenaPlayer(state, player); continue; }
    const control = state.controls[player.id];
    if (player.reloadingUntil && state.elapsedMs >= player.reloadingUntil) { player.ammo = R.magazine; player.reloadingUntil = 0; }
    const input = player.isBot || !player.connected ? botControl(state, player) : state.elapsedMs - control.lastInputAt <= R.inputExpiryMs ? control.input : { ...emptyInput(), yaw: player.yaw, pitch: player.pitch };
    player.yaw = input.yaw; player.pitch = input.pitch;
    const magnitude = Math.max(1, Math.hypot(input.forward, input.strafe));
    const forward = input.forward / magnitude, strafe = input.strafe / magnitude;
    const speed = R.playerSpeed * R.tickMs / 1000;
    const x = player.x + (Math.sin(player.yaw) * forward + Math.cos(player.yaw) * strafe) * speed;
    const z = player.z + (Math.cos(player.yaw) * forward - Math.sin(player.yaw) * strafe) * speed;
    if (paperArenaWalkable(x, player.z)) player.x = x;
    if (paperArenaWalkable(player.x, z)) player.z = z;
    if ((input.reload || player.ammo === 0) && !player.reloadingUntil && player.ammo < R.magazine) player.reloadingUntil = state.elapsedMs + R.reloadMs;
    if (input.fire) shoot(state, player);
  }
}
