import { acceptPaperArenaInput, createPaperArenaEngine, PAPER_ARENA_WEAPONS, PAPER_ARENA_WEAPON_IDS, PAPER_ARENA_RULES, isPaperArenaInput, resetPaperArenaInput, respawnPaperArenaPlayer, stepPaperArena, type PaperArenaInput, type PaperWeaponId } from '@stealth-reader/shared';

type Engine = ReturnType<typeof createPaperArenaEngine>;
const intent = (seq: number, patch: Partial<PaperArenaInput> = {}): PaperArenaInput => ({ seq, forward: 0, strafe: 0, yaw: 0, pitch: 0, fire: false, reload: false, ...patch });
function fixture(weapon: PaperWeaponId = 'rifle') {
  const state = createPaperArenaEngine(4, 20, 137);
  state.players.forEach((p, i) => { p.isBot = false; p.connected = true; p.x = -33 + i; p.y = 0; p.z = 42; p.protectedUntil = 0; });
  const [a, b, c, d] = state.players; a.x = b.x = -46; a.z = -10; b.z = -3; a.weapon = weapon; a.yaw = 0; b.yaw = Math.PI;
  state.controls[a.id].nextFireAt[weapon] = 0;
  return { state, a, b, c, d };
}
function send(state: Engine, id: string, patch: Partial<PaperArenaInput> = {}) {
  const next = Math.max(state.tick, state.controls[id].input.seq) + 1;
  expect(acceptPaperArenaInput(state, id, intent(next, patch))).toBe(true);
}
function ticks(state: Engine, n: number) { for (let i = 0; i < n; i++) stepPaperArena(state); }

describe('paper arena v2 authoritative five-weapon combat', () => {
  it.each([
    ['rifle', 30, 150, 24, 95, 1550], ['shotgun', 6, 30, 15, 780, 1900], ['revolver', 6, 36, 68, 440, 1820], ['sniper', 5, 25, 150, 1080, 2250], ['katana', null, null, 110, 420, 0],
  ] as const)('preserves original %s weapon parameters and isolated ammunition', (weapon, magazine, reserve, damage, interval, reload) => {
    expect(PAPER_ARENA_WEAPONS[weapon]).toMatchObject({ magazineSize: magazine, initialReserve: reserve, damage, fireIntervalMs: interval, reloadMs: reload });
    const { a } = fixture(weapon); expect(a.arsenal[weapon]).toEqual({ ammo: magazine ?? 0, reserve: reserve ?? 0 });
    expect(Object.keys(a.arsenal)).toHaveLength(5);
  });
  it.each(['shotgun', 'revolver', 'sniper', 'katana'] as const)('%s is edge-triggered, never automatic while held', weapon => {
    const { state, a, b } = fixture(weapon); b.protectedUntil = 100000;
    for (let i = 0; i < 70; i++) { send(state, a.id, { fire: true }); stepPaperArena(state); }
    expect(a.shotSeq).toBe(1); expect(a.arsenal[weapon].ammo).toBe((PAPER_ARENA_WEAPONS[weapon].magazineSize ?? 1) - 1);
    send(state, a.id, { fire: false }); stepPaperArena(state); send(state, a.id, { fire: true }); stepPaperArena(state); expect(a.shotSeq).toBe(2);
  });
  it('preserves a quick press/release between server ticks but queues at most one shot', () => {
    const { state, a } = fixture('revolver');
    for (let n = 0; n < 20; n++) { send(state, a.id, { fire: true }); send(state, a.id, { fire: false }); }
    stepPaperArena(state); expect(a.shotSeq).toBe(1); expect(a.ammo).toBe(5); ticks(state, 12); expect(a.shotSeq).toBe(1);
  });
  it('rifle automatic cadence is fixed-clock and rate-flooding cannot accelerate it', () => {
    const { state, a } = fixture();
    for (let tick = 0; tick < 20; tick++) { for (let flood = 0; flood < 100; flood++) send(state, a.id, { fire: true }); stepPaperArena(state); }
    expect(a.shotSeq).toBe(10); expect(a.ammo).toBe(20); expect(a.arsenal.shotgun).toEqual({ ammo: 6, reserve: 30 });
  });
  it('long idle cannot bank an immediate second rifle round, and switch/reset preserve each cooldown', () => {
    const { state, a } = fixture(); ticks(state, 100);
    send(state, a.id, { fire: true }); stepPaperArena(state); expect(a.shotSeq).toBe(1);
    const first = a.lastShotAt, ready = state.controls[a.id].nextFireAt.rifle; expect(ready).toBe(first + 95);
    send(state, a.id, { fire: true }); stepPaperArena(state); expect(a.shotSeq).toBe(1);
    send(state, a.id, { fire: true }); stepPaperArena(state); expect(a.shotSeq).toBe(2); expect(a.lastShotAt - first).toBe(100);
    const cooldown = state.controls[a.id].nextFireAt.rifle;
    resetPaperArenaInput(state, a.id); send(state, a.id, { weapon: 'revolver' }); stepPaperArena(state); expect(state.controls[a.id].nextFireAt.rifle).toBe(cooldown);
    send(state, a.id, { weapon: 'rifle', fire: true }); stepPaperArena(state); expect(a.shotSeq).toBe(2); expect(a.weapon).toBe('revolver');
  });
  it.each([['rifle', 76], ['revolver', 32], ['sniper', 0]] as const)('%s applies only its server-owned damage and consumes exactly one round', (weapon, remaining) => {
    const { state, a, b } = fixture(weapon); send(state, a.id, { fire: true }); stepPaperArena(state);
    expect(b.hp).toBe(remaining); expect(a.arsenal[weapon].ammo).toBe(PAPER_ARENA_WEAPONS[weapon].magazineSize! - 1);
  });
  it('shotgun emits nine bounded rays for one shell and never double-counts a victim', () => {
    const { state, a, b } = fixture('shotgun'); b.z = -8;
    send(state, a.id, { fire: true }); stepPaperArena(state);
    expect(a.ammo).toBe(5); expect(state.shots.filter(x => x.shooterId === a.id)).toHaveLength(9); expect(new Set(state.shots.map(x => x.pelletIndex)).size).toBe(9);
    expect(b.hp).toBe(0); expect(b.deaths).toBe(1); expect(a.kills).toBe(1); expect(state.scores.red).toBe(1);
  });
  it('sniper does not damage through a teammate body or a real high cover box', () => {
    for (const mode of ['teammate', 'wall']) {
      const { state, a, b, c } = fixture('sniper');
      if (mode === 'teammate') { c.x = -46; c.z = -6; c.team = a.team; }
      else { a.x = b.x = -40; a.z = -42; b.z = -32; }
      send(state, a.id, { fire: true }); stepPaperArena(state); expect(b.hp).toBe(100); expect(c.hp).toBe(100); expect(state.scores.red).toBe(0);
    }
  });
  it('switching has an enforced server delay and preserves each weapon magazine', () => {
    const { state, a } = fixture(); a.arsenal.rifle.ammo = 7; a.arsenal.revolver.ammo = 3;
    send(state, a.id, { weapon: 'revolver', fire: true }); stepPaperArena(state);
    expect(a.weapon).toBe('revolver'); expect(a.switchingUntil).toBe(410); expect(a.ammo).toBe(3); expect(a.shotSeq).toBe(0);
    ticks(state, 8); expect(a.shotSeq).toBe(0);
    send(state, a.id); stepPaperArena(state); send(state, a.id, { fire: true }); stepPaperArena(state); expect(a.ammo).toBe(2);
    send(state, a.id, { weapon: 'rifle' }); stepPaperArena(state); expect(a.ammo).toBe(7); expect(a.arsenal.revolver.ammo).toBe(2);
  });
  it('cancelled reload transfers nothing, later reload uses finite reserve without inventing rounds', () => {
    const { state, a } = fixture(); a.arsenal.rifle = { ammo: 5, reserve: 8 };
    send(state, a.id, { reload: true }); stepPaperArena(state); expect(a.reloadingUntil).toBe(1600);
    send(state, a.id, { weapon: 'shotgun' }); stepPaperArena(state); expect(a.reloadingUntil).toBe(0); expect(a.arsenal.rifle).toEqual({ ammo: 5, reserve: 8 });
    ticks(state, 10); send(state, a.id, { weapon: 'rifle' }); stepPaperArena(state); ticks(state, 10);
    send(state, a.id, { reload: true }); stepPaperArena(state); const end = a.reloadingUntil;
    while (state.elapsedMs < end) stepPaperArena(state);
    expect(a.arsenal.rifle).toEqual({ ammo: 13, reserve: 0 }); send(state, a.id, { reload: true }); stepPaperArena(state); expect(a.reloadingUntil).toBe(0);
  });
  it('no-ammunition gun cannot auto-reload from nothing, and katana never consumes firearm ammo', () => {
    const { state, a } = fixture(); a.arsenal.rifle = { ammo: 0, reserve: 0 }; send(state, a.id, { fire: true, reload: true }); ticks(state, 6);
    expect(a.shotSeq).toBe(0); expect(a.reloadingUntil).toBe(0);
    send(state, a.id, { weapon: 'katana' }); stepPaperArena(state); ticks(state, 8); send(state, a.id); stepPaperArena(state); send(state, a.id, { fire: true }); stepPaperArena(state);
    expect(a.shotSeq).toBe(1); expect(a.arsenal.rifle).toEqual({ ammo: 0, reserve: 0 }); expect(a.arsenal.katana).toEqual({ ammo: 0, reserve: 0 });
  });
  it('a quick reload edge survives its release but is cleared on reset or expiry', () => {
    for (const mode of ['quick', 'reset', 'expired']) {
      const { state, a } = fixture(); a.arsenal.rifle.ammo = 12;
      send(state, a.id, { reload: true }); send(state, a.id, { reload: false });
      if (mode === 'reset') resetPaperArenaInput(state, a.id);
      if (mode === 'expired') state.tick = 10;
      stepPaperArena(state); expect(a.reloadingUntil > 0).toBe(mode === 'quick');
      expect(a.arsenal.rifle.ammo).toBe(12); expect(a.arsenal.rifle.reserve).toBe(150);
    }
  });
  it('reconnect/reset never refill or reset firing/reload timing; only a genuine respawn restores the loadout', () => {
    const { state, a } = fixture('sniper'); send(state, a.id, { fire: true }); stepPaperArena(state);
    const before = { hp: a.hp, arsenal: JSON.stringify(a.arsenal), action: a.actionUntil, cooldown: state.controls[a.id].nextFireAt.sniper };
    for (let i = 0; i < 20; i++) resetPaperArenaInput(state, a.id);
    expect({ hp: a.hp, arsenal: JSON.stringify(a.arsenal), action: a.actionUntil, cooldown: state.controls[a.id].nextFireAt.sniper }).toEqual(before);
    respawnPaperArenaPlayer(state, a); expect(a.arsenal.sniper).toEqual({ ammo: 5, reserve: 25 }); expect(a.weapon).toBe('rifle');
  });
  it('ADS reduces server-generated spread to 30 percent, not client-reported accuracy', () => {
    const deviations = (aim: boolean) => { const { state, a, b } = fixture(); b.protectedUntil = 100000; const values: number[] = [];
      for (let i = 0; i < 20; i++) { send(state, a.id, { fire: true, aim }); stepPaperArena(state); for (const shot of state.shots.filter(x => x.at === state.elapsedMs && x.shooterId === a.id)) values.push(Math.atan2(shot.endX - shot.x, shot.endZ - shot.z)); } return values; };
    const hip = deviations(false), aimed = deviations(true); expect(aimed).toHaveLength(hip.length); aimed.forEach((v, i) => expect(v).toBeCloseTo(hip[i] * .3, 8));
  });
  it('katana slash waits for contact, has finite range and cannot slash through real cover', () => {
    for (const mode of ['near', 'far', 'wall', 'friend']) {
      const { state, a, b, c } = fixture('katana'); b.z = mode === 'far' ? -3 : -7;
      if (mode === 'wall') { a.x = b.x = -30; a.z = -52.8; b.z = -49.2; }
      if (mode === 'friend') { c.x = -46; c.z = -8.5; c.team = a.team; }
      send(state, a.id, { fire: true }); stepPaperArena(state); expect(b.hp).toBe(100); stepPaperArena(state); expect(b.hp).toBe(100); stepPaperArena(state);
      expect(b.hp).toBe(mode === 'near' ? 0 : 100); expect(c.hp).toBe(100);
    }
  });
  it('katana front guard consumes stamina and performs one server-traced return, never recursive loops', () => {
    const { state, a, b } = fixture('sniper'); b.weapon = 'katana'; send(state, b.id, { aim: true, yaw: Math.PI }); send(state, a.id, { fire: true }); stepPaperArena(state);
    expect(b.hp).toBe(100); expect(a.hp).toBe(0); expect(b.blockStamina).toBeCloseTo(85.1); expect(b.lastBlockAt).toBe(50); expect(state.scores.blue).toBe(1);
    expect(state.shots).toHaveLength(2); expect(state.shots.filter(s => s.reflected)).toHaveLength(1);
  });
  it.each(['back', 'exhausted'] as const)('katana guard cannot provide invulnerability from %s', mode => {
    const { state, a, b } = fixture('sniper'); b.weapon = 'katana'; if (mode === 'exhausted') b.blockStamina = 13;
    send(state, b.id, { aim: true, yaw: mode === 'back' ? 0 : Math.PI }); send(state, a.id, { fire: true }); stepPaperArena(state); expect(b.hp).toBe(0); expect(a.hp).toBe(100);
  });
  it('holding guard exhausts it and must release before using regenerated stamina', () => {
    const { state, a } = fixture('katana'); for (let i = 0; i < 140; i++) { send(state, a.id, { aim: true }); stepPaperArena(state); }
    expect(a.blocking).toBe(false); expect(a.blockStamina).toBeGreaterThan(0); send(state, a.id); stepPaperArena(state); send(state, a.id, { aim: true }); stepPaperArena(state); expect(a.blocking).toBe(true);
  });
  it('jump/gravity and sprint are server-owned and held input expires', () => {
    const { state, a } = fixture(); send(state, a.id, { jump: true }); stepPaperArena(state); expect(a.y).toBeGreaterThan(0); expect(a.grounded).toBe(false);
    let peak = a.y; for (let i = 0; i < 20; i++) { send(state, a.id, { jump: i % 2 === 0 }); stepPaperArena(state); peak = Math.max(peak, a.y); if (a.grounded) break; }
    expect(peak).toBeGreaterThan(1); expect(peak).toBeLessThan(1.5); expect(a.y).toBe(0); expect(a.vy).toBe(0);
    const z = a.z; send(state, a.id, { sprint: true, forward: 1 }); stepPaperArena(state); expect(a.z - z).toBeCloseTo(PAPER_ARENA_RULES.sprintSpeed * .05); expect(a.sprinting).toBe(true);
    ticks(state, 9); expect(a.sprinting).toBe(false); const stopped = [a.x, a.y, a.z]; stepPaperArena(state); expect([a.x, a.y, a.z]).toEqual(stopped);
  });
  it('jumping from a tolerated stair edge below a low ceiling cannot turn into wall penetration', () => {
    const { state, a } = fixture(); Object.assign(a, { x: -23.42296166496131, y: .44600000357627867, z: .37437948484816475, vy: 0, grounded: true });
    send(state, a.id, { jump: true, forward: .9, yaw: 1.724097182474357 }); stepPaperArena(state);
    expect(a.grounded).toBe(true); expect(a.y).toBeCloseTo(.44600000357627867); expect(a.vy).toBe(0);
  });
  it.each([{ y: 10 }, { vy: 100 }, { hp: 1000 }, { ammo: 999 }, { reserve: 999 }, { weapon: 'rocket' }, { aim: 1 }, { jump: 'true' }, { sprint: null }, { weapon: undefined }])('rejects v2 authority forgery %j', patch => {
    expect(isPaperArenaInput({ ...intent(1), ...patch })).toBe(false);
  });
  it('all five weapons are selectable but no client-supplied arsenal or projectiles exist', () => {
    for (const weapon of PAPER_ARENA_WEAPON_IDS) expect(isPaperArenaInput(intent(1, { weapon, aim: true, jump: true, sprint: true }))).toBe(true);
    expect(isPaperArenaInput({ ...intent(1), arsenal: {} })).toBe(false); expect(isPaperArenaInput({ ...intent(1), target: 'seat-2', damage: 999 })).toBe(false);
  });
});
