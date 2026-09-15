import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, Script } from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

const ROOT = resolve(process.cwd(), 'public/games/local-lab/radius-raid');
const SCRIPTS = [
  'js/boot.js', 'js/util.js', 'js/ease.js', 'js/storage.js',
  'js/definitions.js', 'js/audio.js', 'js/text.js', 'js/hero.js',
  'js/enemy.js', 'js/bullet.js', 'js/explosion.js', 'js/powerup.js',
  'js/particle.js', 'js/particleemitter.js', 'js/textpop.js',
  'js/levelpop.js', 'js/button.js', 'js/game.js', 'js/accessible-controls.js',
] as const;
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

function gameContext(host?: HTMLElement) {
  const context = createContext({
    window: { addEventListener() {} },
    document: host ? { getElementById: (id: string) => host.querySelector(`#${id}`) } : {},
  });
  for (const path of SCRIPTS) new Script(read(path), { filename: path }).runInContext(context);
  return context;
}

function accessibleMenu() {
  const host = document.createElement('div'); host.innerHTML = read('index.html');
  const context = gameContext(host);
  new Script(`
    let resetCalls = 0;
    $.reset = function () { resetCalls++; };
    $.Button = function (options) { Object.assign(this, options); this.ey = 0; };
    $.buttons = []; $.mouse = {}; $.cw = 800; $.ch = 600; $.pt = null;
    $.setupStorage(); $.storage.score = 42;
    $.setState("menu");
    $.setupAccessibleControls();
  `).runInContext(context);
  return { host, context, start: host.querySelector<HTMLButtonElement>('#lab-start')!,
    menu: host.querySelector<HTMLButtonElement>('#lab-menu')!,
    canvas: host.querySelector<HTMLCanvasElement>('#cmg')! };
}

describe('Radius Raid owned static assets', () => {
  it('loads the shared pause bridge before every locally shipped classic game script', () => {
    const html = read('index.html');
    const sources = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/gu)]
      .map((match) => match[1]);
    expect(sources).toEqual(['../bridge.js', ...SCRIPTS]);
    expect(readdirSync(resolve(ROOT, 'js')).sort()).toEqual(SCRIPTS.map((s) => s.slice(3)).sort());
    for (const source of SCRIPTS) expect(statSync(resolve(ROOT, source)).isFile()).toBe(true);
    expect(html).toContain('<link rel="stylesheet" href="style.css">');
    expect(html).not.toMatch(/<script\b(?![^>]*\bsrc=)[^>]*>|\bon\w+\s*=|type="module"/iu);
  });

  it('contains no network, browser storage, injected code, trackers or real audio engine', () => {
    const assets = ['index.html', 'style.css', ...SCRIPTS];
    for (const path of assets) {
      const source = read(path);
      expect(source, path).not.toMatch(/https?:\/\/|\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\b|\bimport\s*\(/iu);
      expect(source, path).not.toMatch(/\b(?:localStorage|sessionStorage|indexedDB)\b|Storage\.prototype|document\.cookie/iu);
      expect(source, path).not.toMatch(/\beval\s*\(|\bnew\s+Function\b|\bwindow\.open\s*\(/u);
      expect(source, path).not.toMatch(/\b(?:Howler|Howl|AudioContext|webkitAudioContext)\b|\bnew\s+Audio\s*\(/u);
    }
  });

  it('ships only readable game text and no unaudited sprites, sounds, fonts or icons', () => {
    expect(readdirSync(ROOT).sort()).toEqual(['LICENSE.txt', 'index.html', 'js', 'style.css']);
    for (const file of readdirSync(resolve(ROOT, 'js'))) expect(file).toMatch(/\.js$/u);
    expect(read('style.css')).not.toMatch(/@font-face|url\s*\(/iu);
    expect(read('style.css')).toContain("html[data-momo-paused='true'] *");
    expect(read('style.css')).toContain('animation-play-state: paused !important');
    const byteSize = ['index.html', 'style.css', ...SCRIPTS]
      .reduce((size, path) => size + statSync(resolve(ROOT, path)).size, 0);
    expect(byteSize).toBeGreaterThan(120_000);
    expect(byteSize).toBeLessThan(145_000);
  });

  it('parses each shipped file and the complete classic-script bundle without compilation', () => {
    for (const path of SCRIPTS) expect(() => new Script(read(path), { filename: path })).not.toThrow();
    expect(() => new Script(SCRIPTS.map(read).join('\n'))).not.toThrow();
    expect(() => gameContext()).not.toThrow();
  });

  it('preserves all thirteen enemies, escalating distributions and five original powerups', () => {
    const context = gameContext();
    const snapshot = JSON.parse(new Script(`JSON.stringify({
      enemies: $.definitions.enemies.length,
      levels: $.definitions.levels.map(level => ({ kills: level.killsToLevel, spawns: level.distribution.length })),
      powerups: $.definitions.powerups.map(powerup => powerup.title),
      letters: Object.keys($.definitions.letters)
    })`).runInContext(context));
    expect(snapshot.enemies).toBe(13);
    expect(snapshot.levels).toEqual(Array.from({ length: 13 }, (_, index) => ({ kills: 5 + (index + 1) * 7, spawns: index + 1 })));
    expect(snapshot.powerups).toEqual(['HEALTH PACK', 'SLOW ENEMIES', 'FAST SHOT', 'TRIPLE SHOT', 'PIERCE SHOT']);
    expect(snapshot.letters).toEqual(expect.arrayContaining(['A', 'Z', '0', '9']));
  });

  it('keeps the real health, slow, fast, triple and piercing effects and expiration', () => {
    const context = gameContext();
    const active = JSON.parse(new Script(`
      $.dt = 1;
      $.hero = { life: 0.5, weapon: { bullet: {} } };
      $.powerupTimers = [3, 3, 3, 3, 3];
      $.updatePowerupTimers();
      JSON.stringify({ life: $.hero.life, slow: $.slow, count: $.hero.weapon.count,
        rate: $.hero.weapon.fireRateTickMax, piercing: $.hero.weapon.bullet.piercing,
        timers: $.powerupTimers });
    `).runInContext(context));
    expect(active).toMatchObject({ life: 0.501, slow: 1, count: 3, rate: 2, piercing: 1, timers: [2, 2, 2, 2, 2] });
    const expired = JSON.parse(new Script(`
      $.powerupTimers = [0, 0, 0, 0, 0];
      $.updatePowerupTimers();
      JSON.stringify({ slow: $.slow, count: $.hero.weapon.count,
        rate: $.hero.weapon.fireRateTickMax, piercing: $.hero.weapon.bullet.piercing });
    `).runInContext(context));
    expect(expired).toEqual({ slow: 0, count: 1, rate: 5, piercing: 0 });
  });

  it('keeps audio calls safely chainable while no audio API is accessed', () => {
    const context = createContext({ $: {} });
    Object.defineProperty(context, 'Audio', { get() { throw new Error('audio denied'); } });
    Object.defineProperty(context, 'AudioContext', { get() { throw new Error('audio denied'); } });
    new Script(read('js/audio.js')).runInContext(context);
    expect(new Script('const silent = $.audio.play("hit"); silent.rate(2).rate(1) === silent').runInContext(context)).toBe(true);
  });

  it('retains session statistics without accessing denied opaque-origin storage', () => {
    const context = createContext({ $: {} });
    for (const key of ['Storage', 'localStorage', 'sessionStorage']) {
      Object.defineProperty(context, key, { get() { throw new Error('storage denied'); } });
    }
    new Script(read('js/storage.js')).runInContext(context);
    const retained = JSON.parse(new Script(`
      $.setupStorage(); $.storage.score = 42; $.storage.rounds = 2; $.updateStorage();
      JSON.stringify($.storage);
    `).runInContext(context));
    expect(retained).toEqual({ mute: true, score: 42, level: 0, rounds: 2, kills: 0, bullets: 0, powerups: 0, time: 0 });
    const reset = JSON.parse(new Script('$.clearStorage(); JSON.stringify($.storage)').runInContext(context));
    expect(reset.score).toBe(0);
    expect(reset.rounds).toBe(0);
    expect(reset.mute).toBe(true);
  });

  it('makes fit and silence truthful and does not pretend iframe scores are site rankings', () => {
    const game = read('js/game.js');
    expect(game).toContain('$.shouldScale = 1;');
    expect(game).toContain('$.mute = true;');
    expect(game).toContain('text: "MOVE\\nAIM/FIRE\\nPAUSE\\nFIT"');
    expect(game).toContain('text: "WASD/ARROWS\\nMOUSE\\nP/ESC\\nF"');
    expect(game).toContain('Closing the window also clears them.');
    expect(SCRIPTS.map(read).join('\n')).not.toMatch(/\/api\/|postMessage|leaderboard/iu);
    expect(read('index.html')).toContain('Keyboard and mouse required');
  });

  it('provides named keyboard-accessible Chinese actions and a combat focus target without inline handlers', () => {
    const host = document.createElement('div'); host.innerHTML = read('index.html');
    const start = host.querySelector<HTMLButtonElement>('#lab-start')!;
    const menu = host.querySelector<HTMLButtonElement>('#lab-menu')!;
    expect(start.textContent).toBe('开始波次'); expect(menu.textContent).toBe('返回菜单');
    expect(start.disabled).toBe(true); expect(menu.disabled).toBe(true);
    const canvas = host.querySelector<HTMLCanvasElement>('#cmg')!;
    expect(canvas.tabIndex).toBe(0);
    expect(canvas.getAttribute('aria-label')).toContain('WASD 或方向键移动');
    expect(canvas.getAttribute('aria-describedby')).toBe('lab-controls-help');
    expect(host.querySelector('#lab-controls-help')?.textContent).toContain('返回菜单会结束当前波次');
    expect(read('style.css')).toContain('min-height: 44px');
    expect(read('style.css')).toContain('#cmg:focus-visible');
  });

  it('starts through the original reset/play state and only user action focuses the canvas', () => {
    const { context, start, menu, canvas } = accessibleMenu();
    const focus = vi.spyOn(canvas, 'focus');
    expect(start.disabled).toBe(false); expect(menu.disabled).toBe(true);
    expect(focus).not.toHaveBeenCalled();
    // Repeated setup must not bind a second start action.
    new Script('$.setupAccessibleControls()').runInContext(context);
    const before = new Script('resetCalls').runInContext(context);
    start.click();
    expect(new Script('resetCalls').runInContext(context)).toBe(before + 1);
    expect(new Script('$.state').runInContext(context)).toBe('play');
    expect(start.disabled).toBe(true); expect(menu.disabled).toBe(false);
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(new Script('$.storage.score').runInContext(context)).toBe(42);
    const original = read('js/game.js');
    expect(original).toContain('title: "PLAY"');
    expect(read('js/accessible-controls.js')).toContain('$.reset();');
    expect(read('js/accessible-controls.js')).toContain('$.setState("play");');
  });

  it('never resets a non-menu wave even if a synthetic click bypasses native disabled controls', () => {
    const { context, start } = accessibleMenu();
    const before = new Script('resetCalls').runInContext(context);
    for (const state of ['play', 'pause', 'gameover', 'stats', 'credits']) {
      new Script(`$.state = ${JSON.stringify(state)}; $.syncAccessibleControls();`).runInContext(context);
      expect(start.disabled, state).toBe(true);
      start.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(new Script('resetCalls').runInContext(context), state).toBe(before);
      expect(new Script('$.state').runInContext(context), state).toBe(state);
    }
  });

  it('requires explicit return to the original menu before another HTML start and retains session statistics', () => {
    const { context, start, menu } = accessibleMenu();
    start.click();
    const before = new Script('resetCalls').runInContext(context);
    start.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(new Script('resetCalls').runInContext(context)).toBe(before);
    menu.click();
    expect(new Script('$.state').runInContext(context)).toBe('menu');
    expect(start.disabled).toBe(false); expect(menu.disabled).toBe(true);
    expect(new Script('$.storage.score').runInContext(context)).toBe(42);
    start.click();
    expect(new Script('$.state').runInContext(context)).toBe('play');
    expect(new Script('resetCalls').runInContext(context)).toBe(before + 2);
  });

  it('fits the original combat coordinates into remaining stage space without toolbar covering the HUD', () => {
    const { context, host } = accessibleMenu();
    const stage = host.querySelector('#stage')!;
    Object.defineProperty(stage, 'clientWidth', { value: 400 });
    Object.defineProperty(stage, 'clientHeight', { value: 300 });
    new Script(`
      window.innerWidth = 1600; window.innerHeight = 1200;
      window.setTimeout = function (callback) { callback(); };
      $.wrap = document.getElementById("wrap"); $.cmg = document.getElementById("cmg");
      $.cratio = 800 / 600; $.shouldScale = 1; $.resizecb();
    `).runInContext(context);
    expect(new Script('$.gameScale').runInContext(context)).toBe(.5);
    expect(host.querySelector<HTMLElement>('#wrap')?.style.transform).toBe('scale(0.5)');
  });

  it('preserves the exact original MIT notice and pinned-source provenance in public and source locations', () => {
    const license = read('LICENSE.txt');
    expect(license).toContain('Copyright (c) 2014 Jack Rugile');
    expect(license).toContain('Permission is hereby granted, free of charge');
    expect(readFileSync(resolve(process.cwd(), 'public/licenses/radius-raid-MIT.txt'), 'utf8')).toBe(license);
    expect(readFileSync(resolve(process.cwd(), '../../third_party/radius-raid/LICENSE'), 'utf8')).toBe(license);
    const provenance = readFileSync(resolve(process.cwd(), '../../third_party/radius-raid/README.md'), 'utf8');
    expect(provenance).toContain('016cb866b6078672e37a1691bd9fe555364dbf58');
    expect(provenance).toContain('https://github.com/jackrugile/radius-raid');
    expect(provenance).toContain('Stack Overflow-derived');
  });
});
