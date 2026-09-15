import { createHash, webcrypto } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, Script } from 'node:vm';
import { pathToFileURL } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(process.cwd(), 'public/games/local-lab/whatajong');
const read = (file: string) => readFileSync(resolve(ROOT, file), 'utf8');
const source = (file: string) => read(`source/src/renderer/${file}`);

function moduleContext(file: string, dependencies: Record<string, unknown> = {}) {
  const context = createContext({ exports: {}, require(name: string) { return dependencies[name] ?? {}; } });
  const compiled = ts.transpileModule(source(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  return { context, execute() { new Script(compiled, { filename: file }).runInContext(context); return context.exports; } };
}

function shippedRules() {
  // Exercise the actual shipped original bundle/dependencies without mounting a
  // renderer. This test-only exposure is never written to a published game.
  let bundle = read('game.js');
  const file = ts.createSourceFile('game.js', bundle, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  let mount: ts.ExpressionStatement | undefined;
  function visit(node: ts.Node) {
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(file) === 'render') mount = node;
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!mount) throw new Error('Original renderer mount not found');
  bundle = bundle.slice(0, mount.getStart(file)) + bundle.slice(mount.end);
  bundle = bundle.replace(/\}\)\(\);\s*$/u, 'window.rules={generateRound,getLevels,initialRunState,generateItems,buyTile,upgradeTile,getNextMaterial,getTransformation,Database,deckTileIndexes,cardsMatch,initTileDb,gameOverCondition,isFree,selectTile,createTileActivation,getTileA11yLabel};})();');
  const context = createContext({
    document: { body: { addEventListener() {}, removeEventListener() {} }, getElementById() { return null; }, addEventListener() {}, removeEventListener() {} },
    navigator: { userAgent: 'test', language: 'en', platform: 'Linux' }, crypto: webcrypto,
    setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    history: { state: null, replaceState() { throw new Error('SecurityError'); } }, addEventListener() {}, removeEventListener() {},
  });
  context.window = context;
  Object.defineProperty(context, 'localStorage', { get() { throw new Error('SecurityError'); } });
  new Script(bundle, { filename: 'actual-whatajong-test-exposure.js' }).runInContext(context);
  return context.rules;
}

describe('Whatajong original self-hosted static program', () => {
  it('loads the pause bridge before the local classic IIFE and has restrictive child CSP', () => {
    const html = read('index.html');
    expect([...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/gu)].map((m) => m[1])).toEqual(['../bridge.js', 'game.js']);
    expect(html).not.toMatch(/<script\b(?![^>]*src=)|\bon\w+\s*=|type="module"|https?:\/\//iu);
    expect(html).toContain("script-src 'self'");
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("img-src 'self' data: blob:");
    expect(() => new Script(read('game.js'))).not.toThrow();
    expect(read('game.js')).not.toMatch(/^\s*import\s|\bimport\s*\(|\beval\s*\(|\bnew\s+Function\b/mu);
    expect(statSync(resolve(ROOT, '../bridge.js')).isFile()).toBe(true);
  });

  it('contains no external transport, tracking, audio/font loader or undefined image requests', () => {
    const js = read('game.js');
    expect(js).not.toMatch(/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\b|posthog|i\.posthog\.com|document\.cookie|\b(?:Howler|Howl|AudioContext|webkitAudioContext)\b|\bnew\s+Audio\s*\(/iu);
    expect(js).not.toMatch(/\.mp3\b|\.otf\b|\.ttf\b|\.woff2?\b|@fontsource/iu);
    const css = read('game.css');
    expect(css).not.toMatch(/@font-face|@import|url\(undefined\)|url\(["']?https?:|\.mp3\b|\.otf\b|\.ttf\b|\.woff2?\b/iu);
    expect(css).toContain('data:image/webp;base64,');
    expect(css).toContain("html[data-momo-paused='true'] *::after");
    expect(css).toContain('animation-play-state: paused !important');
    expect(source('lib/observability.ts')).not.toMatch(/posthog|fetch|sendBeacon|https?:\/\//iu);
  });

  it('retains actual original card families and special frog/lotus, flower and exact-card matching', () => {
    const game = moduleContext('lib/game.ts', {
      remeda: { indexBy(values: { id: string }[], key: (value: { id: string }) => string) { return Object.fromEntries(values.map((value) => [key(value), value])); } },
    }).execute();
    expect(game.bams).toHaveLength(9); expect(game.cracks).toHaveLength(9); expect(game.dots).toHaveLength(9);
    expect(game.dragons).toHaveLength(4); expect(game.phoenixes).toHaveLength(1); expect(game.frogs).toHaveLength(3);
    expect(game.elements).toHaveLength(4); expect(game.shadows).toHaveLength(3); expect(game.jokers).toHaveLength(1);
    expect(game.cardsMatch('bam1', 'bam1')).toBe(true);
    expect(game.cardsMatch('bam1', 'bam2')).toBe(false);
    expect(game.cardsMatch('frogr', 'lotusr')).toBe(true);
    expect(game.cardsMatch('lotusr', 'frogr')).toBe(true);
    expect(game.cardsMatch('frogr', 'lotusb')).toBe(false);
    expect(game.cardsMatch('flower1', 'flower3')).toBe(true);
    expect(game.getMaterialPoints('jade')).toBe(2);
    expect(game.getMaterialPoints('ruby')).toBe(24);
    expect(game.getMaterialPoints('emerald')).toBe(48);
  });

  it('keeps original full progression, shop construction, resolver modules and responsive/tap board', () => {
    const run = source('state/runState.tsx');
    const progression = run.slice(run.indexOf('return createLevels(['), run.indexOf('export function generateItems'));
    expect([...progression.matchAll(/^\s*\[[^\n]+\],$/gmu)]).toHaveLength(24);
    expect(run).toContain('export function generateItems');
    expect(run).toContain('export function buyTile');
    expect(source('routes/run/runShop.tsx')).toContain('const DECK_CAPACITY = 163');
    for (const module of ['resolveDragons', 'resolvePhoenixes', 'resolveJokers', 'resolveMutations', 'resolveGems', 'resolveWinds']) {
      expect(statSync(resolve(ROOT, `source/src/renderer/lib/${module}.ts`)).isFile()).toBe(true);
    }
    expect(source('lib/game.ts')).toContain('RESPONSIVE_MAP');
    expect(source('components/game/tileComponent.tsx')).toContain('onPointerDown');
    expect(source('components/layout.tsx')).not.toMatch(/shouldRotate|rotate\.webp|BraveGates\.otf|<Show/iu);
  });

  it('executes the actual bundled original 24-level seeded progression, round objectives and shop draws', () => {
    const api = shippedRules();
    const easy = api.initialRunState('Eseed');
    const hard = api.initialRunState('Hseed');
    expect(easy.difficulty).toBe('easy'); expect(hard.difficulty).toBe('hard');
    const levels = api.getLevels('Eseed');
    expect(levels).toHaveLength(24);
    expect(levels.map((level: { level: number }) => level.level)).toEqual(Array.from({ length: 24 }, (_, index) => index));
    expect(levels[1].rewards).toBe(4);
    expect(api.generateItems(easy, levels)).toHaveLength(5);
    const first = api.generateItems(easy, levels);
    expect(api.generateItems(easy, levels)).toEqual(first);
    easy.items.push(first[0]);
    expect(api.generateItems(easy, levels).map((item: { id: string }) => item.id)).not.toContain(first[0].id);
    const early = api.generateRound(1, easy);
    const late = api.generateRound(20, easy);
    expect(late.pointObjective).toBeGreaterThan(early.pointObjective);
    expect(early.timerPoints).toBeGreaterThan(0);
  });

  it('executes actual bundle purchases, rejection before mutation, reward and three-bone upgrade', () => {
    const api = shippedRules();
    const deck = new api.Database(api.deckTileIndexes);
    const run = api.initialRunState('Eseed');
    const item = { id: 'buy-1', type: 'tile', cardId: 'bam1', cost: 3 };
    expect(() => api.buyTile({ run, item, deck })).toThrow("You don't have enough money");
    expect(run.items).toHaveLength(0); expect(deck.all).toHaveLength(0);
    run.money = 10;
    api.buyTile({ run, item, deck });
    expect(run.money).toBe(7); expect(deck.all).toHaveLength(1);
    api.buyTile({ run, item: { ...item, id: 'reward-1' }, deck, reward: true });
    expect(run.money).toBe(7); expect(deck.all).toHaveLength(2);
    expect(api.getNextMaterial(deck.all, 'r')).toBe('garnet');
    api.upgradeTile({ run, item: { ...item, id: 'upgrade-1' }, deck, path: 'r' });
    expect(run.money).toBe(4); expect(deck.all).toHaveLength(1);
    expect(deck.all[0].material).toBe('garnet');
    expect(run.items).toHaveLength(3);
    expect(api.cardsMatch('flower1', 'flower2')).toBe(true);
    expect(api.cardsMatch('frogb', 'lotusb')).toBe(true);
  });

  it('uses original memory routing, preserves bridge hash, and tolerates denied history depth writes', () => {
    const entry = source('index.tsx');
    expect(entry).toContain('<MemoryRouter root={Layout} preload={false}>');
    expect(entry).not.toContain('HashRouter');
    expect(source('routes/home.tsx')).toContain('href="/play"');
    const lifecycle = source('vendor/solid-router/lifecycle.js');
    const compiled = ts.transpileModule(lifecycle, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, allowJs: true } }).outputText;
    const context = createContext({ exports: {}, require() { return { isServer: false }; }, window: { history: { state: null, replaceState() { throw new Error('SecurityError'); } } } });
    expect(() => new Script(compiled).runInContext(context)).not.toThrow();
    expect(source('vendor/solid-router/routers/MemoryRouter.js')).not.toMatch(/location\.hash|pushState|replaceState/iu);
  });

  it('uses the actual bundled activation gate: covered tiles reject, held/repeated keys cannot toggle twice', () => {
    const api = shippedRules();
    const base = { x: 0, y: 0, material: 'bone', selected: false, deleted: false, cardId: 'bam1' };
    const db = api.initTileDb({ hidden: { ...base, id: 'hidden', z: 0 }, cover: { ...base, id: 'cover', z: 1 } });
    const game = { points: 0, coins: 0, time: 0, pause: false };
    let animating = false;
    const activation = api.createTileActivation(() => !api.isFree(db, db.get('hidden'), game) || animating || game.pause,
      () => api.selectTile({ tileDb: db, game, tileId: 'hidden' }));
    const event = (key: string, repeat = false) => ({ key, repeat, preventDefault() {}, stopPropagation() {} });
    activation.pointer({ button: 0 });
    expect(db.get('hidden').selected).toBe(false);
    activation.keyDown(event('Enter'));
    expect(db.get('hidden').selected).toBe(false);
    activation.keyUp(event('Enter'));
    db.del('cover');
    expect(api.isFree(db, db.get('hidden'), game)).toBe(true);
    activation.keyDown(event('Enter'));
    expect(db.get('hidden').selected).toBe(true);
    activation.keyDown(event('Enter')); activation.keyDown(event('Enter', true)); activation.click({ detail: 0 });
    expect(db.get('hidden').selected).toBe(true);
    activation.keyUp(event('Enter'));
    activation.keyDown(event(' '));
    expect(db.get('hidden').selected).toBe(false);
    activation.keyUp(event(' '));
    animating = true; activation.pointer({ button: 0 }); activation.click({ detail: 0 });
    expect(db.get('hidden').selected).toBe(false);
    animating = false; game.pause = true; activation.keyDown(event('Enter'));
    expect(db.get('hidden').selected).toBe(false);
    activation.blur(); game.pause = false;
    activation.pointer({ button: 0 }); activation.click({ detail: 1 });
    expect(db.get('hidden').selected).toBe(true);
    activation.pointer({ button: 2 });
    expect(db.get('hidden').selected).toBe(true);
  });

  it('names only the original visible face, exposes unique IDs, and wires accurate disabled keyboard semantics', () => {
    const api = moduleContext('components/game/tileInteraction.ts').execute();
    const card = { id: 'bam1', suit: 'bam', rank: '1' };
    expect(api.getTileA11yLabel('tile-1', card, true)).toBe('牌 条 1 · 编号 tile-1');
    expect(api.getTileA11yLabel('tile-2', card, false)).toBe('不可选择的牌 · 编号 tile-2');
    const component = source('components/game/tileComponent.tsx');
    expect(component).toContain('role="button"');
    expect(component).toContain('aria-disabled={!canActivate()}');
    expect(component).toContain('tabindex={canActivate() ? 0 : -1}');
    expect(component).toContain('!props.tile.deleted && !animation() && !game.pause && !game.endCondition');
    expect(component).toContain('onKeyDown={interaction.keyDown}');
    expect(component).toContain('onPointerDown={interaction.pointer}');
    expect(component).not.toMatch(/data-card-id|data-available-pair|hint-pair/iu);
    expect(source('components/game/tileComponent.css.ts')).toContain('&:focus-visible');
  });

  it('publishes deterministic whitespace postprocessing with reproducible exact output hashes', async () => {
    const postprocess = await import(pathToFileURL(resolve(ROOT, 'source/postprocess.mjs')).href);
    expect(postprocess.normalizeGameText('one  \r\n\t two\t\n\n')).toBe('one\n\t two\n');
    expect(postprocess.assembleGameCss('.a {color: red;}._b {color: blue;}\n', '')).toBe(postprocess.assembleGameCss('.a {color: red;}\n._b {color: blue;}\n', ''));
    const protectedCss = '.a{content:"}.foo";--icon:"}#bar";background:url("data:image/svg+xml,%3Csvg%3E}.image%3C/svg%3E");}/* }.comment */._b{content:"}@media";}';
    const protectedOutput = postprocess.assembleGameCss(protectedCss, '');
    expect(protectedOutput).toContain('content:"}.foo";--icon:"}#bar";background:url("data:image/svg+xml,%3Csvg%3E}.image%3C/svg%3E")');
    expect(protectedOutput).toContain('/* }.comment */');
    expect(protectedOutput).toContain('content:"}@media"');
    expect(postprocess.normalizeGameText(read('game.js'))).toBe(read('game.js'));
    expect(postprocess.normalizeGameText(read('game.css'))).toBe(read('game.css'));
    expect(read('source/local.css')).toBe(read('local.css'));
    const local = postprocess.normalizeGameText(read('local.css'));
    const css = read('game.css');
    expect(css.endsWith(local)).toBe(true);
    const generated = css.slice(0, -local.length - 1);
    expect(postprocess.assembleGameCss(generated, local)).toBe(css);
    const manifest = JSON.parse(read('ASSET_MANIFEST.json')) as { build: { outputs: { file: string; bytes: number; sha256: string }[] } };
    for (const output of manifest.build.outputs) {
      const bytes = readFileSync(resolve(ROOT, output.file));
      expect(bytes.length, output.file).toBe(output.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), output.file).toBe(output.sha256);
    }
    expect(JSON.parse(read('source/package.json')).scripts.build).toContain('&& node postprocess.mjs');
  });

  it('keeps legal notices in normal settings flow instead of covering board counters or navigating the sandbox', () => {
    expect(read('index.html')).not.toContain('id="localLegal"');
    const settings = source('routes/settings.tsx');
    expect(settings).toContain('<p id="localLegal">Whatajong © 2025 Pao Ramon');
    expect(settings).toContain('源码及依赖许可请在父页操作、存档与来源说明中打开');
    expect(read('local.css')).toContain('#localLegal { position: static;');
    expect(settings).not.toMatch(/href="(?:SOURCE\.md|LICENSE\.txt|THIRD_PARTY_NOTICES\.txt)"/u);
  });

  it('tolerates denied storage getters and keeps only the real current mutable state', () => {
    const module = moduleContext('state/persistantMutable.ts', {
      'solid-js': { createEffect(callback: () => void) { callback(); } },
      'solid-js/store': { createMutable(value: unknown) { return value; } },
    });
    Object.defineProperty(module.context, 'localStorage', { get() { throw new Error('SecurityError'); } });
    const api = module.execute();
    const state = api.createPersistantMutable({ namespace: 'test', init: () => ({ round: 1, points: 0 }) });
    expect(state).toEqual({ round: 1, points: 0 });
    state.points = 88;
    expect(state.points).toBe(88);
    const independent = api.createPersistantMutable({ namespace: 'test', init: () => ({ round: 1, points: 0 }) });
    expect(independent.points).toBe(0);
  });

  it('ignores malformed optional saved JSON and initializes denied database storage without exception', () => {
    const mutable = moduleContext('state/persistantMutable.ts', {
      'solid-js': { createEffect(callback: () => void) { callback(); } },
      'solid-js/store': { createMutable(value: unknown) { return value; } },
    });
    mutable.context.localStorage = { getItem() { return '{broken'; }, setItem() { throw new Error('SecurityError'); } };
    expect(mutable.execute().createPersistantMutable({ namespace: 'test', init: () => ({ round: 1 }) })).toEqual({ round: 1 });
    const database = moduleContext('state/persistentDatabase.ts', { 'solid-js': { createEffect(callback: () => void) { callback(); } } });
    Object.defineProperty(database.context, 'localStorage', { get() { throw new Error('SecurityError'); } });
    let initialized = 0;
    expect(() => database.execute().createPersistentDatabase({ namespace: 'test', db: { byId: {} }, init() { initialized += 1; } })).not.toThrow();
    expect(initialized).toBe(1);
  });

  it('keeps safe silent calls and truthful UI rather than nonfunctional volume controls', () => {
    const audio = moduleContext('components/audio.tsx');
    for (const name of ['Audio', 'AudioContext', 'Howler']) Object.defineProperty(audio.context, name, { get() { throw new Error('audio denied'); } });
    const api = audio.execute();
    expect(() => { api.play('music'); api.useMusic('click'); api.musicVolume(1); }).not.toThrow();
    expect(source('routes/settings.tsx')).toContain('Audio is not included.');
    expect(source('routes/settings.tsx')).not.toContain('<VolumeSlider');
    expect(source('routes/settings.tsx')).toContain('不会永久保存');
    expect(source('routes/settings.tsx')).toContain('MIT');
    expect(read('game.js')).not.toMatch(/\/api\/|postMessage|officeCoins|accessToken/iu);
  });

  it('records exactly the retained 94 accompanying MIT-declared graphics and authentic bytes/hashes', () => {
    const manifest = JSON.parse(read('ASSET_MANIFEST.json')) as { basis: string; graphics: { file: string; bytes: number; sha256: string }[] };
    expect(manifest.basis).toContain('not individual image-author certification');
    expect(manifest.graphics).toHaveLength(94);
    for (const graphic of manifest.graphics) {
      expect(graphic.file).toMatch(/^source\/src\/renderer\/assets\/(tiles|backgrounds|textures|sprites)\/[^/]+\.webp$/u);
      const bytes = readFileSync(resolve(ROOT, graphic.file));
      expect(bytes.length, graphic.file).toBe(graphic.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), graphic.file).toBe(graphic.sha256);
    }
    expect(readdirSync(resolve(ROOT, 'source/src/renderer/assets')).sort()).toEqual(['assets.ts', 'backgrounds', 'sprites', 'textures', 'tiles']);
    expect(manifest.graphics.reduce((sum, graphic) => sum + graphic.bytes, 0)).toBe(1_995_630);
  });

  it('publishes original MIT and all actual runtime notices, not merely the game root license', () => {
    const license = read('LICENSE.txt');
    expect(license).toContain('Copyright (c) 2025 Pao Ramon');
    expect(readFileSync(resolve(process.cwd(), 'public/licenses/whatajong-MIT.txt'), 'utf8')).toBe(license);
    expect(readFileSync(resolve(process.cwd(), '../../third_party/whatajong/LICENSE'), 'utf8')).toBe(license);
    const runtime = JSON.parse(read('RUNTIME_LICENSES.json')) as { name: string; version: string; license: string; notice: string }[];
    expect(runtime).toHaveLength(30);
    expect(runtime.find((module) => module.name === '@solidjs/router')?.version).toBe('0.15.1');
    for (const module of runtime) {
      expect(['MIT', 'Apache-2.0']).toContain(module.license);
      expect(read(module.notice)).toMatch(/Permission is hereby granted|Apache License/u);
    }
    const notices = read('THIRD_PARTY_NOTICES.txt');
    expect(notices).toContain('COPYRIGHT AND PERMISSION NOTICE (ICU 58 and later)');
    expect(notices).toContain('Ecma International');
    expect(notices).toContain('Apache License');
    expect(notices).toContain('Copyright (c) 2018 remeda');
  });

  it('ships a fixed web-only build with original matching compiler, complete lock and existing source links', () => {
    const pkg = JSON.parse(read('source/package.json'));
    const lock = JSON.parse(read('source/package-lock.json'));
    expect(pkg.dependencies['solid-js']).toBe('1.9.4');
    expect(pkg.overrides['babel-preset-solid']).toBe('1.9.3');
    expect(pkg.overrides['babel-plugin-jsx-dom-expressions']).toBe('0.39.6');
    expect(lock.packages['node_modules/solid-js'].version).toBe('1.9.4');
    expect(lock.packages['node_modules/babel-preset-solid'].version).toBe('1.9.3');
    expect(lock.packages['node_modules/babel-plugin-jsx-dom-expressions'].version).toBe('0.39.6');
    expect(Object.keys(pkg.dependencies).join(' ')).not.toMatch(/electron|howler|posthog|fontsource/iu);
    expect(read('source/tsconfig.json')).not.toContain('tsconfig.node.json');
    expect(read('source/web.vite.config.mjs')).toContain("formats: ['iife']");
    expect(read('SOURCE.md')).toContain('45fe3da7a7d1e87a66ae41b72ee74cc4e0a920d5');
    for (const [, link] of read('SOURCE.md').matchAll(/\]\(([^)]+)\)/gu)) expect(statSync(resolve(ROOT, link)).isFile(), link).toBe(true);
  });
});
