import { acceptPaperArenaInput, createPaperArenaEngine, getPaperArenaNavigation, PAPER_ARENA_MAP, PAPER_ARENA_RULES, PAPER_ARENA_WEAPONS, paperArenaWalkable, stepPaperArena } from '@stealth-reader/shared';

describe('paper arena expanded map: real authority navigation and natural outcomes', () => {
  it.each([4, 8].flatMap(capacity => [1, 21, 997].map(seed => ({ capacity, seed }))))('reaches exactly 100 natural kills without wall/asset invariants failing: %j', ({ capacity, seed }) => {
    const state = createPaperArenaEngine(capacity, 100, seed);
    while (!state.winner) {
      stepPaperArena(state);
      for (const player of state.players) {
        if (!paperArenaWalkable(player.x, player.z, .38, player.y, player.grounded)) throw new Error(`Capsule intrusion: seed=${seed} tick=${state.tick} seat=${player.id}`);
        for (const id of ['rifle', 'shotgun', 'revolver', 'sniper', 'katana'] as const) {
          const ammo = player.arsenal[id], definition = PAPER_ARENA_WEAPONS[id];
          if (!Number.isInteger(ammo.ammo) || ammo.ammo < 0 || ammo.ammo > (definition.magazineSize ?? 0) || !Number.isInteger(ammo.reserve) || ammo.reserve < 0 || ammo.reserve > (definition.initialReserve ?? 0)) throw new Error('Ammunition conservation boundary');
        }
      }
      if (state.shots.length > 96) throw new Error('Bounded snapshot shot history');
    }
    expect(Math.max(state.scores.red, state.scores.blue)).toBe(100); expect(state.elapsedMs).toBeLessThan(PAPER_ARENA_RULES.maxDurationMs);
    expect(state.players.reduce((sum, player) => sum + player.kills, 0)).toBe(state.scores.red + state.scores.blue);
    expect(state.players.reduce((sum, player) => sum + player.deaths, 0)).toBe(state.scores.red + state.scores.blue);
  }, 30000);
  it('walks the actual authoritative capsule from the outer ground to the original 7.74m roof and back', () => {
    expect(PAPER_ARENA_MAP.width).toBe(96); expect(PAPER_ARENA_MAP.depth).toBe(102);
    const nodes = getPaperArenaNavigation().nodes;
    const start = nodes.findIndex(n => n.x === -45 && n.z === 0 && n.y === 0), goal = nodes.findIndex(n => n.x === -34 && n.z === -16 && n.y > 7);
    expect(start).toBeGreaterThanOrEqual(0); expect(goal).toBeGreaterThanOrEqual(0);
    const queue = [start], previous = new Map([[start, -1]]);
    for (let i = 0; i < queue.length && !previous.has(goal); i++) for (const next of nodes[queue[i]].neighbors) if (!previous.has(next)) { previous.set(next, queue[i]); queue.push(next); }
    expect(previous.has(goal)).toBe(true); const path = [goal]; while (previous.get(path[0]) !== -1) path.unshift(previous.get(path[0])!);
    const state = createPaperArenaEngine(4, 100, 1); state.players.forEach(p => { p.isBot = false; p.connected = true; }); const player = state.players[0];
    Object.assign(player, { x: nodes[start].x, y: nodes[start].y, z: nodes[start].z, grounded: true });
    let sequence = 0;
    for (const route of [path.slice(1), [...path].reverse().slice(1)]) {
      let cursor = 0, budget = 3000;
      while (cursor < route.length && budget-- > 0) {
        const node = nodes[route[cursor]], distance = Math.hypot(node.x - player.x, node.z - player.z);
        if (distance < .14 && Math.abs(node.y - player.y) < .47) { cursor++; continue; }
        expect(acceptPaperArenaInput(state, player.id, { seq: sequence++, forward: Math.min(.65, distance / (8.4 * .05)), strafe: 0, yaw: Math.atan2(node.x - player.x, node.z - player.z), pitch: 0, fire: false, reload: false })).toBe(true);
        stepPaperArena(state); expect(paperArenaWalkable(player.x, player.z, .38, player.y, player.grounded)).toBe(true);
      }
      expect(cursor).toBe(route.length); expect(Math.abs(player.y - nodes[route.at(-1)!].y)).toBeLessThan(.47);
    }
    expect(player.y).toBe(0); expect(player.arsenal.rifle).toEqual({ ammo: 30, reserve: 150 }); expect(state.scores).toEqual({ red: 0, blue: 0 });
  });
});
