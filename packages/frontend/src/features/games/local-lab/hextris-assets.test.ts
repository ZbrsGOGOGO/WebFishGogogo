import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, Script } from 'node:vm';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(process.cwd(), 'public/games/local-lab/hextris');
const CORE = ['save-state', 'view', 'wavegen', 'math', 'Block', 'Hex', 'Text', 'comboTimer', 'checking', 'update', 'render', 'input', 'main', 'initialization'];
const read = (file: string) => readFileSync(resolve(ROOT, file), 'utf8');

describe('Hextris original self-hosted static program', () => {
  it('loads the pause bridge before local classic scripts, with no inline execution or external resources', () => {
    const html = read('index.html');
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/gu)].map((m) => m[1]);
    expect(scripts).toEqual(['../bridge.js', 'vendor/jquery-1.9.1.js', 'vendor/keypress.js', 'storage.js', ...CORE.map((n) => `js/${n}.js`)]);
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("script-src 'self'");
    expect(html).toContain("img-src 'self' data: blob:");
    expect(html).not.toMatch(/<script\b(?![^>]*src=)|\bon\w+\s*=|type="module"|https?:\/\//iu);
    for (const file of scripts) expect(statSync(resolve(ROOT, file)).isFile(), file).toBe(true);
  });

  it('retains every complete readable original core file and parses all shipped JavaScript', () => {
    expect(readdirSync(resolve(ROOT, 'js')).sort()).toEqual(CORE.map((n) => `${n}.js`).sort());
    for (const file of ['storage.js', 'vendor/jquery-1.9.1.js', 'vendor/keypress.js', ...CORE.map((n) => `js/${n}.js`)]) {
      expect(() => new Script(read(file), { filename: file })).not.toThrow();
    }
    expect(read('js/wavegen.js')).toContain('this.spiralGeneration');
    expect(read('js/wavegen.js')).toContain('this.crosswiseGeneration');
    expect(read('js/wavegen.js')).toContain('this.doubleGeneration');
    expect(read('js/Hex.js')).toContain('this.sides = 6;');
    expect(read('js/Hex.js')).toContain('this.doesBlockCollide');
  });

  it('removes trackers, advertisements, cookie writes, score uploads, audio and code evaluation paths', () => {
    const source = ['storage.js', ...CORE.map((n) => `js/${n}.js`)].map(read).join('\n');
    expect(source).not.toMatch(/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\b|\$\.(get|post|ajax)\s*\(|document\.cookie|Cookies\.|JSONfn|createElement\(['"]script|54\.183\.184\.126|hextris\.io\/a\.js|google-analytics|adsbygoogle|\bga\s*\(/iu);
    for (const file of ['vendor/jquery-1.9.1.js', 'vendor/keypress.js', ...CORE.map((n) => `js/${n}.js`)]) {
      expect(read(file), file).not.toMatch(/\beval\s*\(|\bnew\s+Function\b|window\s*\[\s*['"]eval['"]\s*\]|\b(?:Howler|Howl|AudioContext|webkitAudioContext)\b|\bnew\s+Audio\s*\(/u);
    }
    expect(read('vendor/jquery-1.9.1.js')).toContain('Script evaluation is disabled');
  });

  it('catches denied opaque-origin storage getters and does not fake durable saves', () => {
    const context = createContext({});
    context.window = context;
    Object.defineProperty(context, 'localStorage', { get() { throw new Error('SecurityError'); } });
    new Script(read('storage.js')).runInContext(context);
    expect(new Script('hextrisRead("score")').runInContext(context)).toBeNull();
    expect(() => new Script('hextrisWrite("score", "80")').runInContext(context)).not.toThrow();
    expect(new Script('hextrisRead("score")').runInContext(context)).toBeNull();
    expect(CORE.map((n) => read(`js/${n}.js`)).join('\n')).not.toContain('localStorage.');
    expect(read('index.html')).toContain('不会永久保存');
  });

  it('keeps real adjacent three-block flood filling, wraparound and original squared combo scoring', () => {
    const context = createContext({
      score: 0, settings: { comboTime: 240, creationSpeedModifier: 1 },
      waveone: { nextGen: 2700 },
      findCenterOfBlocks() { return { x: 0, y: 0 }; },
      Text: function () {}, fadeUpAndOut() {},
    });
    new Script(read('js/checking.js')).runInContext(context);
    const result = new Script(`
      function block(color) { return { color:color, deleted:0 }; }
      MainHex = {sides:6,blocks:[[block('red')],[],[],[],[],[block('red'),block('red')]],ct:0,lastCombo:-240,comboMultiplier:0,texts:[],x:0,y:0};
      consolidateBlocks(MainHex,0,0);
      var first=score;
      MainHex.ct=10; MainHex.blocks=[[block('green'),block('green'),block('green')],[],[],[],[],[]];
      consolidateBlocks(MainHex,0,0);
      JSON.stringify({first:first,total:score,multiplier:MainHex.comboMultiplier,deleted:MainHex.blocks[0].map(function(b){return b.deleted;})});
    `).runInContext(context);
    expect(JSON.parse(result)).toEqual({ first: 9, total: 27, multiplier: 2, deleted: [1, 1, 1] });
  });

  it('does not delete a pair or diagonally touching colors', () => {
    const context = createContext({ score: 0 });
    new Script(read('js/checking.js')).runInContext(context);
    expect(new Script(`var h={sides:6,blocks:[[{color:'red',deleted:0}],[{color:'blue',deleted:0},{color:'red',deleted:0}],[],[],[],[]]}; consolidateBlocks(h,0,0); JSON.stringify(h.blocks[0]);`).runInContext(context)).toBe('[{"color":"red","deleted":0}]');
    expect(context.score).toBe(0);
  });

  it('preserves keyboard directions, rush/release, pause and left/right touch controls', () => {
    const combos = new Map<string, { on_keydown(): void; on_keyup?(): void }>();
    const turns: number[] = [];
    const context = createContext({
      navigator: { userAgent: 'test' }, gameState: 1, rush: 1, trueCanvas: { width: 390, height: 600 },
      MainHex: { rotate(n: number) { turns.push(n); } },
      settings: { speedModifier: 1, speedUpKeyHeld: false, hexWidth: 87 },
      keypress: { register_combo(combo: { keys: string; on_keydown(): void }) { combos.set(combo.keys, combo); } },
      $() { return { on() {}, is() { return false; } }; }, pause() { context.paused = true; },
    });
    context.window = context;
    context.innerWidth = 390;
    new Script(read('js/input.js')).runInContext(context);
    new Script('addKeyListeners()').runInContext(context);
    expect([...combos.keys()]).toEqual(expect.arrayContaining(['left', 'right', 'a', 'd', 'down', 's', 'p', 'space']));
    combos.get('left')!.on_keydown(); combos.get('right')!.on_keydown();
    combos.get('down')!.on_keydown(); expect(context.rush).toBe(4);
    combos.get('down')!.on_keyup!(); expect(context.rush).toBe(1);
    new Script('handleClickTap(140,300);handleClickTap(300,300)').runInContext(context);
    expect(turns).toEqual([1, -1, 1, -1]);
    combos.get('space')!.on_keydown(); expect(context.paused).toBe(true);
  });

  it('executes actual original Hex rotation, six-side wrapping and attached-block angles', () => {
    const context = createContext({ trueCanvas: { width: 390, height: 600 }, settings: { comboTime: 240, scale: 1 }, gameState: 1, history: {}, navigator: { userAgent: 'Android' } });
    context.window = context;
    new Script(read('js/Hex.js')).runInContext(context);
    const result = new Script(`
      MainHex=new Hex(70); MainHex.blocks[0].push({targetAngle:30});
      MainHex.rotate(-1); var afterLeft={position:MainHex.position,hexAngle:MainHex.targetAngle,blockAngle:MainHex.blocks[0][0].targetAngle};
      MainHex.rotate(1); var afterRight={position:MainHex.position,hexAngle:MainHex.targetAngle,blockAngle:MainHex.blocks[0][0].targetAngle};
      gameState=2;MainHex.rotate(1);
      JSON.stringify({sides:MainHex.sides,left:afterLeft,right:afterRight,whenEnded:MainHex.position});
    `).runInContext(context);
    expect(JSON.parse(result)).toEqual({ sides: 6, left: { position: 5, hexAngle: 90, blockAngle: 90 }, right: { position: 0, hexAngle: 30, blockAngle: 30 }, whenEnded: 0 });
  });

  it('keeps original escalating speed with hard limits and multiple generated wave patterns', () => {
    const context = createContext({ waveone: { nextGen: 2700, difficulty: 1 }, settings: { creationSpeedModifier: 1, speedModifier: 1 }, colors: ['red'] });
    new Script(read('js/wavegen.js')).runInContext(context);
    new Script('blockDestroyed()').runInContext(context);
    expect(context.waveone.nextGen).toBe(2670);
    expect(context.waveone.difficulty).toBeCloseTo(1.085);
    new Script('waveone.nextGen=599; waveone.difficulty=36;blockDestroyed()').runInContext(context);
    expect(context.waveone).toEqual({ nextGen: 600, difficulty: 35 });
  });

  it('ships only four licensed original SVG controls and no fonts, brands, audio or unused libraries', () => {
    expect(readdirSync(resolve(ROOT, 'images')).sort()).toEqual(['btn_back.svg', 'btn_help.svg', 'btn_pause.svg', 'btn_restart.svg']);
    expect(readdirSync(resolve(ROOT, 'vendor')).sort()).toEqual(['jquery-1.9.1.js', 'jquery-MIT.txt', 'keypress-Apache-2.0.txt', 'keypress.coffee', 'keypress.js']);
    expect(read('style/style.css')).not.toMatch(/@font-face|FontAwesome|\bExo\b|https?:\/\//iu);
    expect(read('js/render.js')).toContain('ctx.lineTo(14, 8)');
    expect(read('style/style.css')).toContain("html[data-momo-paused='true'] *::after");
    expect(read('style/style.css')).toContain('animation-play-state: paused !important');
  });

  it('publishes complete GPL and vendor texts, readable preferred source, exact provenance and current hashes', () => {
    const license = read('LICENSE.md');
    expect(license).toContain('GNU GENERAL PUBLIC LICENSE');
    expect(license).toContain('Version 3, 29 June 2007');
    expect(readFileSync(resolve(process.cwd(), 'public/licenses/hextris-GPL-3.0.txt'), 'utf8')).toBe(license);
    expect(readFileSync(resolve(process.cwd(), '../../third_party/hextris/LICENSE.md'), 'utf8')).toBe(license);
    const provenance = readFileSync(resolve(process.cwd(), '../../third_party/hextris/README.md'), 'utf8');
    expect(provenance).toContain('3f4847dc8fd7dab3d1c87e6324b9159d92fbd396');
    expect(provenance).toContain('bf614b749cf5340293e5c2b61c2afe869034e690');
    expect(read('SOURCE.md')).toContain('完整可读首选源码');
    expect(read('index.html')).not.toMatch(/href="(?:SOURCE\.md|LICENSE\.md)"/u);
    expect(read('index.html')).toContain('源码及依赖许可请在父页操作、存档与来源说明中打开');
    expect(read('vendor/jquery-MIT.txt')).toContain('Copyright 2012 jQuery Foundation');
    expect(read('vendor/keypress-Apache-2.0.txt')).toContain('Apache License');
    expect(read('vendor/keypress.coffee')).toContain('Copyright');
    const manifest = JSON.parse(read('ASSET_MANIFEST.json')) as { files: { file: string; bytes: number; sha256: string }[] };
    for (const entry of manifest.files) {
      const bytes = readFileSync(resolve(ROOT, entry.file));
      expect(bytes.length, entry.file).toBe(entry.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), entry.file).toBe(entry.sha256);
    }
    for (const [, link] of read('SOURCE.md').matchAll(/\]\(([^)]+)\)/gu)) expect(statSync(resolve(ROOT, link)).isFile(), link).toBe(true);
  });

  it('mechanically normalizes only line endings/EOF without changing CoffeeScript indentation', () => {
    for (const file of ['style/style.css', 'vendor/keypress.coffee', 'vendor/keypress.js', ...CORE.map((n) => `js/${n}.js`)]) {
      const text = read(file);
      expect(text, file).not.toMatch(/[\t ]+$/mu);
      expect(text.endsWith('\n'), file).toBe(true);
      expect(text.endsWith('\n\n'), file).toBe(false);
    }
    expect(read('js/view.js')).not.toMatch(/^ +\t/mu);
    expect(read('SOURCE.md')).toContain('仅机械规范化');
    expect(JSON.parse(read('ASSET_MANIFEST.json')).commit).toBe('3f4847dc8fd7dab3d1c87e6324b9159d92fbd396');
  });
});
