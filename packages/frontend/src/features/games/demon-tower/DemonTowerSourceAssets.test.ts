import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), 'public/games/demon-tower-source');
const text = (path: string): string => readFileSync(resolve(root, path), 'utf8');

function bridgeHarness() {
  const messages: Array<Record<string, unknown>> = [];
  const listeners: Record<string, Array<(event: Record<string, unknown>) => void>> = {};
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let timerId = 0;
  let uuid = 0;
  const parent = { postMessage: (message: Record<string, unknown>) => messages.push(message) };
  const element = () => ({
    appendChild: () => undefined, addEventListener: () => undefined, setAttribute: () => undefined,
    className: '', id: '', textContent: '', type: '',
  });
  const sandbox: Record<string, unknown> = {
    parent,
    location: { search: '?bridge=test-nonce', reload: () => undefined },
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}` },
    URLSearchParams,
    ST: { S: { level: 2 } },
    document: {
      documentElement: { dataset: {}, scrollHeight: 800, offsetHeight: 800 },
      body: { scrollHeight: 800, offsetHeight: 800, firstChild: null, insertBefore: () => undefined },
      createElement: element,
      addEventListener: () => undefined,
    },
    addEventListener: (name: string, listener: (event: Record<string, unknown>) => void) => { (listeners[name] ??= []).push(listener); },
    setTimeout: (callback: () => void, delay = 0) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id: number) => timers.delete(id),
    setInterval: (callback: () => void, delay = 0) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearInterval: (id: number) => timers.delete(id),
  };
  sandbox.window = sandbox;
  runInNewContext(text('js/api.js'), sandbox);
  const api = (sandbox.API ?? {}) as Record<string, (...args: unknown[]) => Promise<unknown> | void>;
  const receive = (id: string, result: unknown) => listeners.message[0]?.({
    source: parent,
    data: { source: 'webfish-demon-tower-source-v1', nonce: 'test-nonce', kind: 'response', id, ok: true, result },
  });
  const reject = (id: string, error: { message: string; code?: string; status?: number }) => listeners.message[0]?.({
    source: parent,
    data: { source: 'webfish-demon-tower-source-v1', nonce: 'test-nonce', kind: 'response', id, ok: false, error },
  });
  const runDelay = (delay: number) => {
    const match = [...timers.entries()].find(([, timer]) => timer.delay === delay);
    if (!match) throw new Error(`timer ${delay} missing`);
    timers.delete(match[0]); match[1].callback();
  };
  const requests = (method: string) => messages.filter((item) => item.kind === 'request' && item.method === method);
  return { api, messages, receive, reject, runDelay, requests, sandbox };
}

describe('九层妖塔 supplied source assets', () => {
  it('ships only the selected browser runtime and records the exact supplied archive', () => {
    expect(readdirSync(resolve(root, 'js')).sort()).toEqual(['api.js', 'avatar.js', 'combat.js', 'config.js', 'equip.js', 'gacha.js', 'main.js', 'shop.js', 'state.js', 'ui.js', 'world.js']);
    expect(readdirSync(root)).not.toContain('upstream-docs');
    expect(text('SOURCE.md')).toContain('2fe1c88e998f740ad01e8722a2e2c06f58c5eff41824c3aee833bd8b0e76bd2c');
    expect(text('upstream-manifest.sha256').trim().split('\n')).toHaveLength(13);
  });

  it('has no direct network client or inline event attributes inside the opaque sandbox', () => {
    const scripts = readdirSync(resolve(root, 'js')).map((name) => text(`js/${name}`)).join('\n');
    const html = text('index.html');
    expect(scripts).not.toMatch(/\bfetch\s*\(/);
    expect(scripts).not.toMatch(/XMLHttpRequest|axios\b/);
    expect(html).not.toMatch(/\son(?:click|change|input|load)=/i);
    expect(scripts).not.toMatch(/\son(?:click|change|input)=/i);
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("object-src 'none'");
  });

  it('loads the legacy leaderboard link into the source ranking tab and removes unsupported friend injection copy', () => {
    expect(text('js/main.js')).toContain("ALLOWED_TABS.indexOf(requested) >= 0");
    expect(text('js/ui.js')).toContain('暂无可切磋的本站好友，可先在好友页添加');
    expect(text('js/ui.js')).toMatch(/applyAccountName\(\);\s*\/\/[^\n]*\n\s*ST\.save\(\)/);
    expect(text('js/ui.js')).not.toMatch(/JC_FRIENDS|\?pid=|外部网站注入|本地已存/);
    expect(text('js/ui.js')).toContain('API.notifyHydrated()');
    expect(text('js/api.js')).toContain("kind: 'hydrated'");
  });

  it('produces finite combat stats for every one of the nine supplied bosses', () => {
    const sandbox = {} as { window: unknown; CFG?: { bossStats: (layer: number) => Record<string, number> } };
    sandbox.window = sandbox;
    runInNewContext(text('js/config.js'), sandbox);
    for (let layer = 1; layer <= 9; layer += 1) {
      const stats = sandbox.CFG!.bossStats(layer);
      for (const key of ['str', 'spd', 'agi', 'def', 'luc', 'maxHp', 'defStat']) expect(Number.isFinite(stats[key]), `layer ${layer} ${key}`).toBe(true);
    }
  });

  it('keeps world mutations rollback-safe and treats server unlock receipts as authoritative', () => {
    const world = text('js/world.js');
    expect(world.match(/await API\.beginMutation\(\);/g)).toHaveLength(3);
    expect(world).toContain("res.cleared = nl.status === 'cleared' || nl.bossHp <= 0");
    expect(world).toContain('Number.isInteger(nl.unlockedLayer)');
    expect(world).not.toContain("S.layers[layer].status = 'open'");
    expect(text('js/ui.js')).toContain('完成通道建设后解锁下一层');
    expect(text('js/ui.js')).not.toContain('下一层已解锁');
    expect(world).toContain('await API.postClue(layer)');
    expect(world.match(/let mutationAcquired = false;/g)).toHaveLength(3);
    expect(world.match(/if \(mutationAcquired\) API\.endMutation\(\);/g)).toHaveLength(3);
  });

  it('coalesces saves as latest-wins and never persists an A-B-A intermediate snapshot', async () => {
    const bridge = bridgeHarness();
    const progress = bridge.api.getProgress() as Promise<unknown>;
    const get = bridge.requests('getProgress').at(-1)!;
    bridge.receive(String(get.id), { exists: true, version: 1, saveData: '{"level":1}', updatedAt: '2026-10-16T00:00:00.000Z' });
    await progress;
    const first = bridge.api.saveProgress({ level: 2 }) as Promise<unknown>;
    bridge.runDelay(120);
    const inFlight = bridge.requests('saveProgress').at(-1)!;
    const middle = bridge.api.saveProgress({ level: 3 }) as Promise<unknown>;
    const latest = bridge.api.saveProgress({ level: 2 }) as Promise<unknown>;
    bridge.receive(String(inFlight.id), { version: 2 });
    await Promise.all([first, middle, latest]);
    expect(bridge.requests('saveProgress')).toHaveLength(1);
    expect((inFlight.args as Array<{ saveData: string }>)[0].saveData).toBe('{"level":2}');
  });

  it('grants one mutation lease and rejects second and third concurrent acquisitions', async () => {
    const bridge = bridgeHarness();
    const progress = bridge.api.getProgress() as Promise<unknown>;
    const get = bridge.requests('getProgress').at(-1)!;
    bridge.receive(String(get.id), { exists: false, version: 0, saveData: null, updatedAt: null });
    await progress;
    await bridge.api.beginMutation();
    await expect(bridge.api.beginMutation()).rejects.toMatchObject({ code: 'DEMON_TOWER_SOURCE_MUTATION_IN_PROGRESS' });
    await expect(bridge.api.beginMutation()).rejects.toMatchObject({ code: 'DEMON_TOWER_SOURCE_MUTATION_IN_PROGRESS' });
    bridge.api.endMutation();
    await expect(bridge.api.beginMutation()).resolves.toBeUndefined();
    bridge.api.endMutation();
  });

  it('freezes writes after an uncertain world receipt instead of replaying random combat or saving its rollback', async () => {
    const bridge = bridgeHarness();
    const progress = bridge.api.getProgress() as Promise<unknown>;
    const get = bridge.requests('getProgress').at(-1)!;
    bridge.receive(String(get.id), { exists: true, version: 3, saveData: '{"level":1}', updatedAt: '2026-10-16T00:00:00.000Z' });
    await progress;
    await bridge.api.beginMutation();
    const action = bridge.api.postDamage(1, 20) as Promise<unknown>;
    const damage = bridge.requests('postDamage').at(-1)!;
    bridge.reject(String(damage.id), { message: '联网请求超时', status: 0 });
    await expect(action).rejects.toMatchObject({ status: 0 });
    bridge.api.endMutation();
    await expect(bridge.api.saveProgress({ level: 2 })).rejects.toMatchObject({ status: 0 });
    expect(bridge.requests('saveProgress')).toHaveLength(0);
    expect(bridge.requests('postDamage')).toHaveLength(1);
  });

  it('settles the save promise covered by a successful atomic world receipt without sending a second save', async () => {
    const bridge = bridgeHarness();
    const progress = bridge.api.getProgress() as Promise<unknown>;
    const get = bridge.requests('getProgress').at(-1)!;
    bridge.receive(String(get.id), { exists: true, version: 3, saveData: '{"level":1}', updatedAt: '2026-10-16T00:00:00.000Z' });
    await progress;
    await bridge.api.beginMutation();
    const coveredSave = bridge.api.saveProgress({ level: 2 }) as Promise<unknown>;
    const action = bridge.api.postDamage(1, 20) as Promise<unknown>;
    const damage = bridge.requests('postDamage').at(-1)!;
    bridge.receive(String(damage.id), { accepted: 20, profileVersion: 4, layerId: 1 });
    await expect(action).resolves.toMatchObject({ profileVersion: 4 });
    await expect(coveredSave).resolves.toMatchObject({ version: 4 });
    bridge.api.endMutation();
    expect(bridge.requests('saveProgress')).toHaveLength(0);
  });

  it('recognizes the server-side atomic refund after a partial channel receipt', async () => {
    const bridge = bridgeHarness();
    const progress = bridge.api.getProgress() as Promise<unknown>;
    const get = bridge.requests('getProgress').at(-1)!;
    bridge.receive(String(get.id), { exists: true, version: 3, saveData: '{"level":2,"inventory":{"materials":100}}', updatedAt: '2026-10-16T00:00:00.000Z' });
    await progress;
    (bridge.sandbox.ST as { S: Record<string, unknown> }).S = { level: 2, inventory: { materials: 80 } };
    await bridge.api.beginMutation();
    const pending = bridge.api.saveProgress({ level: 2, inventory: { materials: 80 } }) as Promise<unknown>;
    const action = bridge.api.postChannel(1, 20) as Promise<unknown>;
    const channel = bridge.requests('postChannel').at(-1)!;
    bridge.receive(String(channel.id), { accepted: 15, profileVersion: 4, layerId: 1 });
    await action;
    await pending;
    bridge.api.endMutation();
    const state = (bridge.sandbox.ST as { S: { inventory: { materials: number } } }).S;
    state.inventory.materials += 5;
    await expect(bridge.api.saveProgress(state)).resolves.toMatchObject({ unchanged: true, version: 4 });
    expect(bridge.requests('saveProgress')).toHaveLength(0);
  });

  it('gives only this entry document same-origin frame permission in production nginx', () => {
    const nginx = readFileSync(resolve(process.cwd(), '../../deploy/community.nginx.conf'), 'utf8');
    const location = nginx.match(/location = \/games\/demon-tower-source\/index\.html \{([\s\S]*?)\n    \}/)?.[1] ?? '';
    expect(location).toContain('X-Frame-Options "SAMEORIGIN"');
    expect(location).toContain("frame-ancestors 'self'");
    expect(location).toContain("connect-src 'none'");
    expect(location).toContain('try_files $uri =404;');
    const assets = nginx.match(/location \/games\/demon-tower-source\/ \{([\s\S]*?)\n    \}/)?.[1] ?? '';
    expect(assets).toContain('Cache-Control "no-cache"');
    expect(assets).not.toContain('max-age=');
    for (const path of ['progress', 'world/damage', 'world/channel', 'world/clue']) {
      const escaped = path.replace('/', '\\/');
      expect(nginx.match(new RegExp(`location = \/api\/v1\/games\/demon-tower\/source\/${escaped} \\{([\\s\\S]*?)\\n    \\}`))?.[1]).toContain('client_max_body_size 1200k;');
    }
    expect(nginx.match(/location ~ \^\/api\/v1\/games\/demon-tower[^{]+\{([\s\S]*?)\n    \}/)?.[1]).toContain('client_max_body_size 20k;');
  });
});
