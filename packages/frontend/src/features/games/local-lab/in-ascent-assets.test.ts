import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, Script } from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

const ROOT = resolve(process.cwd(), 'public/games/local-lab/in-ascent');
const SCRIPTS = ['js/actions.js', 'js/Planet.js', 'js/Star.js', 'js/TweenFX.js', 'js/app.js', 'js/main.js', 'js/surface.js'] as const;
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

function gameContext(userAgent = 'Desktop test', maxTouchPoints = 0) {
  const host = document.createElement('div');
  host.innerHTML = read('index.html');
  for (const canvas of host.querySelectorAll('canvas')) {
    Object.defineProperty(canvas, 'getContext', { value: () => ({}) });
  }
  const context = createContext({
    document: {
      getElementById: (id: string) => host.querySelector(`#${id}`),
      createElement: (tag: string) => document.createElement(tag),
      hidden: false,
      addEventListener() {},
    },
    window: { addEventListener() {} },
    navigator: { userAgent, maxTouchPoints },
  });
  for (const path of SCRIPTS.slice(1)) new Script(read(path), { filename: path }).runInContext(context);
  return context;
}

function actionContext() {
  let clickHandler: ((event: { target: EventTarget | null }) => void) | undefined;
  const dispatch = vi.fn();
  const context = createContext({
    document: {
      addEventListener: (_event: string, listener: typeof clickHandler) => { clickHandler = listener; },
      dispatchEvent: dispatch,
    },
    Element,
    CustomEvent,
  });
  new Script(read('js/actions.js')).runInContext(context);
  return { dispatch, click: (target: EventTarget | null) => clickHandler?.({ target }) };
}

describe('in ASCENT owned static assets', () => {
  it('loads the pause bridge first, then the CSP-safe delegate and complete classic game source', () => {
    const html = read('index.html');
    const sources = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/gu)].map((m) => m[1]);
    expect(sources).toEqual(['../bridge.js', ...SCRIPTS]);
    expect(readdirSync(resolve(ROOT, 'js')).sort()).toEqual(SCRIPTS.map((s) => s.slice(3)).sort());
    for (const path of SCRIPTS) expect(statSync(resolve(ROOT, path)).isFile()).toBe(true);
    expect(html).not.toMatch(/<script\b(?![^>]*\bsrc=)[^>]*>|\bon\w+\s*=|type="module"/iu);
    expect(html).not.toContain('user-scalable=0');
  });

  it('has no networking, storage, monetization, trackers, audio, workers or dynamic-code execution', () => {
    for (const path of ['index.html', 'style.css', ...SCRIPTS]) {
      const source = read(path);
      expect(source, path).not.toMatch(/https?:\/\/|\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\b|\bimport\s*\(/iu);
      expect(source, path).not.toMatch(/\b(?:localStorage|sessionStorage|indexedDB|monetization|serviceWorker|SoundFX|AudioContext|webkitAudioContext)\b|document\.cookie/iu);
      expect(source, path).not.toMatch(/\beval\s*\(|\bnew\s+(?:Function|Audio|Worker)\b|window\.open\s*\(/u);
      expect(source, path).not.toMatch(/onclick=['"]|onload=['"]|ontouchstart=['"]/iu);
      expect(source, path).not.toMatch(/\/api\/|postMessage|leaderboard/iu);
    }
  });

  it('excludes the unlicensed-font pack and ships only readable source with available system emoji', () => {
    expect(readdirSync(ROOT).sort()).toEqual(['LICENSE.txt', 'index.html', 'js', 'style.css']);
    expect(read('style.css')).not.toMatch(/@font-face|url\s*\(|Twemoji/iu);
    expect(read('style.css')).toContain("'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'");
    expect(read('js/surface.js')).toContain('px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"');
    const byteSize = ['index.html', 'style.css', ...SCRIPTS].reduce((n, path) => n + statSync(resolve(ROOT, path)).size, 0);
    expect(byteSize).toBeGreaterThan(70_000);
    expect(byteSize).toBeLessThan(80_000);
    expect(read('index.html')).toContain('Progress exists only in this open game window');
    expect(read('index.html')).toContain('desktop or landscape touch');
  });

  it('parses every shipped file and the complete source in classic order without installing the upstream toolchain', () => {
    for (const path of SCRIPTS) expect(() => new Script(read(path), { filename: path })).not.toThrow();
    expect(() => new Script(SCRIPTS.map(read).join('\n'))).not.toThrow();
    expect(() => gameContext()).not.toThrow();
  });

  it('preserves ten buildings and five resources, with original free starting states and construction costs', () => {
    const context = gameContext();
    const snapshot = JSON.parse(new Script(`JSON.stringify({
      buildings: buildings.map(building => ({ name: building[6], status: building[4], costs: building.slice(10) })),
      resources: resources.length
    })`).runInContext(context));
    expect(snapshot.resources).toBe(5);
    expect(snapshot.buildings).toHaveLength(10);
    expect(snapshot.buildings.map((building: { name: string }) => building.name)).toEqual([
      'Headquarters', 'Resource Depot', 'Observatory', 'Comsat Station', 'Aramid Factory',
      'Refinery', 'Ore Mine', 'Research Facility', 'Planetarium', 'Launch Site',
    ]);
    expect(snapshot.buildings.map((building: { status: number }) => building.status)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(snapshot.buildings[2].costs).toEqual([5, 10, 5, 1, 0]);
    expect(snapshot.buildings[4].costs).toEqual([15, 5, 25, 8, 3]);
    expect(snapshot.buildings[9].costs).toEqual([50, 25, 20, 10, 0]);
  });

  it('retains terrestrial and outer solar systems, moons and original Earth resource state', () => {
    const context = gameContext();
    const snapshot = JSON.parse(new Script(`
      system = 0; prepareGlobals();
      JSON.stringify({ names: globalPlanets.slice(0, 8).map(planet => planet.name),
        earth: globalPlanets[2].resources, moon: globalPlanets[2].moons[0].name,
        jupiter: globalPlanets[4].moons.map(planet => planet.name) });
    `).runInContext(context));
    expect(snapshot.names).toEqual(['Mercury', 'Venus', 'Earth-Moon system', 'Mars', 'Galilean system', 'Saturn Ringlet system', 'Uranian system', 'Neptunian system']);
    expect(snapshot.earth).toEqual([91, 45, 45, 18, 10]);
    expect(snapshot.moon).toBe('Moon');
    expect(snapshot.jupiter).toEqual(['Io', 'Europa', 'Ganymede', 'Callisto']);
  });

  it('preserves numeric, mission-string and array event details without inline JavaScript or eval', () => {
    const context = gameContext();
    const attributes = new Script(`[
      getInlineClick(3), getInlineClick(JSON.stringify("0Mars"), "misn"),
      getInlineClick("[7,2]", "deal")
    ]`).runInContext(context) as string[];
    const actions = actionContext();
    for (const detail of attributes) {
      const host = document.createElement('div');
      host.innerHTML = `<nav${detail}><b>Interact</b></nav>`;
      expect(host.innerHTML).not.toMatch(/onclick=/iu);
      actions.click(host.querySelector('b'));
    }
    expect(actions.dispatch.mock.calls.map(([event]) => [event.type, event.detail])).toEqual([
      ['head', 3], ['misn', '0Mars'], ['deal', [7, 2]],
    ]);
  });

  it('keeps direct scrolling, tutorial close and trade templates as JSON data attributes', () => {
    const source = read('js/surface.js');
    expect(source).toContain('data-game-event="menu" data-game-detail=\'-1\'');
    expect(source).toContain('data-game-event="menu" data-game-detail=\'1\'');
    expect(source).toContain('data-game-event="deal" data-game-detail=\'[${quant1},${quant2}]\'');
    expect(source).toContain('data-game-event="clos"');
    expect(read('js/app.js')).toContain('data-game-event="clos" data-game-detail=\'1\'');
    const actions = actionContext();
    const host = document.createElement('div');
    host.innerHTML = '<nav data-game-event="clos"><b>Close</b></nav>';
    actions.click(host.querySelector('b'));
    expect(actions.dispatch).toHaveBeenCalledOnce();
    expect(actions.dispatch.mock.calls[0][0]).toMatchObject({ type: 'clos', detail: null });
  });

  it('ignores malformed/unapproved delegate input and safely retains quoted mission names', () => {
    const actions = actionContext();
    for (const markup of [
      '<nav data-game-event="grant" data-game-detail="1">No</nav>',
      '<nav data-game-event="head" data-game-detail="not json">No</nav>',
      '<nav>No</nav>',
    ]) {
      const host = document.createElement('div'); host.innerHTML = markup;
      actions.click(host.querySelector('nav'));
    }
    actions.click(null);
    actions.click(document.createTextNode('not an element'));
    expect(actions.dispatch).not.toHaveBeenCalled();
    const context = gameContext();
    const attrs = new Script('getInlineClick(JSON.stringify("0Mars\u0027s & Moon"), "misn")').runInContext(context);
    const host = document.createElement('div'); host.innerHTML = `<nav${attrs}>Mission</nav>`;
    actions.click(host.querySelector('nav'));
    expect(actions.dispatch.mock.calls[0][0].detail).toBe("0Mars's & Moon");
  });

  it('pauses CSS animations as well as bridge-owned game clocks and keeps original buffer sizes explicit', () => {
    expect(read('style.css')).toContain("html[data-momo-paused='true'] *");
    expect(read('style.css')).toContain('animation-play-state: paused !important');
    const html = read('index.html');
    expect(html).toContain('id="spaceCanvas" width="3840" height="3840"');
    expect(html).toContain('id="gameCanvas" width="1920" height="1080"');
    const provenance = readFileSync(resolve(process.cwd(), '../../third_party/in-ascent/README.md'), 'utf8');
    expect(provenance).toContain('89 MiB');
    expect(provenance).toContain('not measured process/GPU memory');
  });

  it('allows trading with sufficient payment even when the receiving resource starts at zero', () => {
    const context = gameContext();
    const result = JSON.parse(new Script(`
      updateResourcesUI = function () {};
      interactSurface = function () {};
      buildings[1][8] = 0; buildings[1][9] = 1;
      planet = { resources: [0, 4, 10, 20, 30] };
      _deal({ detail: [8, 3] });
      JSON.stringify({ resources: planet.resources, offerCooldown: monthRandom });
    `).runInContext(context));
    expect(result).toEqual({ resources: [8, 1, 10, 20, 30], offerCooldown: -3 });
  });

  it('does not overdraw payment, supports an exact balance and rejects malformed offer quantities', () => {
    const context = gameContext();
    new Script(`
      updateResourcesUI = function () {};
      interactSurface = function () {};
      buildings[1][8] = 0; buildings[1][9] = 1;
      planet = { resources: [100, 2, 10, 20, 30] }; monthRandom = 1;
      _deal({ detail: [8, 3] });
    `).runInContext(context);
    expect(JSON.parse(new Script('JSON.stringify([planet.resources, monthRandom])').runInContext(context)))
      .toEqual([[100, 2, 10, 20, 30], 1]);
    const exact = JSON.parse(new Script(`
      planet.resources[1] = 3; _deal({ detail: [8, 3] });
      JSON.stringify(planet.resources);
    `).runInContext(context));
    expect(exact).toEqual([108, 0, 10, 20, 30]);
    for (const expression of ['null', '{}', '{ detail: [8, -1] }', '{ detail: [8, NaN] }', '{ detail: [8, Infinity] }', '{ detail: [0, 1] }', '{ detail: [8] }']) {
      new Script(`_deal(${expression})`).runInContext(context);
      expect(JSON.parse(new Script('JSON.stringify(planet.resources)').runInContext(context))).toEqual(exact);
    }
  });

  it('supports desktop-UA touch capability without disabling a mouse or trackpad', () => {
    const context = gameContext('Mozilla/5.0 Macintosh Safari', 5);
    const result = JSON.parse(new Script(`
      addListeners();
      JSON.stringify({ touch: mobile, touchStart: game.ontouchstart === touchStartHandler,
        mouseStart: game.onmousedown === touchStartHandler });
    `).runInContext(context));
    expect(result).toEqual({ touch: true, touchStart: true, mouseStart: true });
    expect(() => new Script(`
      tutorial = 0; state = 1; frame.speed = 0;
      touchStartHandler({ target: game, clientX: 100, clientY: 200 });
      if (game.onmousemove !== touchMoveHandler) throw new Error("mouse disabled");
    `).runInContext(context)).not.toThrow();
    const coordinates = JSON.parse(new Script(`
      const gesture = { target: game, changedTouches: [{ clientX: 150, clientY: 250 }] };
      touchStartHandler(gesture);
      JSON.stringify({ x: gesture.clientX, y: gesture.clientY, touchMove: game.ontouchmove === touchMoveHandler });
    `).runInContext(context));
    expect(coordinates).toEqual({ x: 150, y: 250, touchMove: true });
  });

  it('ends a stale gesture on blur without discarding base resources, day, scene position or round state', () => {
    const context = gameContext();
    const result = JSON.parse(new Script(`
      planet = { resources: [11, 22, 33, 44, 55] };
      count = 123; day = 7; state = 3; selectedPlanet = 2; playerX = 400;
      activeStructure = 4; frameDragging = true; interactionDistance = 300;
      frame.speed = 20; frame.killed = false;
      game.ontouchmove = game.ontouchend = game.ontouchcancel = touchMoveHandler;
      game.onmousemove = game.onmouseup = game.onmouseleave = touchMoveHandler;
      endPointerInput();
      JSON.stringify({ resources: planet.resources, count, day, state, selectedPlanet, playerX,
        activeStructure, dragging: frameDragging, distance: interactionDistance,
        speed: frame.speed, killed: frame.killed,
        callbacks: [game.ontouchmove, game.ontouchend, game.ontouchcancel,
          game.onmousemove, game.onmouseup, game.onmouseleave] });
    `).runInContext(context));
    expect(result).toEqual({ resources: [11, 22, 33, 44, 55], count: 123, day: 7, state: 3,
      selectedPlanet: 2, playerX: 400, activeStructure: 4, dragging: false, distance: -1,
      speed: 0, killed: true, callbacks: [null, null, null, null, null, null] });
    const source = read('js/main.js');
    expect(source).toContain('window.addEventListener("blur", endPointerInput)');
    expect(source).toContain('if (document.hidden) endPointerInput()');
  });

  it('preserves the full original MIT license, pinned source and explicit audio/font/loader exclusions', () => {
    const license = read('LICENSE.txt');
    expect(license).toContain('Copyright (c) 2016 Noncho Savov');
    expect(license).toContain('Permission is hereby granted, free of charge');
    expect(readFileSync(resolve(process.cwd(), 'public/licenses/in-ascent-MIT.txt'), 'utf8')).toBe(license);
    expect(readFileSync(resolve(process.cwd(), '../../third_party/in-ascent/LICENSE'), 'utf8')).toBe(license);
    const provenance = readFileSync(resolve(process.cwd(), '../../third_party/in-ascent/README.md'), 'utf8');
    expect(provenance).toContain('a49ce66e81c0fd4e8c77ba511bbaa7ac09446b7c');
    expect(provenance).toContain('https://github.com/foumart/JS.13kGames.2021_inAscent');
    expect(provenance).toContain('resources/loader.js');
    expect(provenance).toContain('src/assets/Twemoji.ttf');
  });
});
