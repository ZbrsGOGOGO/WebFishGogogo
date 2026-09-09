import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from './runtime/game/Game';
import { getOutlineCacheStats } from './runtime/render/OutlinedMesh';
import { disposeObjectResources } from './runtime/render/disposeResources';

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof THREE>();
  return { ...actual, WebGLRenderer: class {
    shadowMap = { enabled: false }; info = { render: { calls: 0 } }; renderLists = { dispose: vi.fn() };
    setPixelRatio = vi.fn(); setSize = vi.fn(); render = vi.fn(); clearDepth = vi.fn(); dispose = vi.fn(); forceContextLoss = vi.fn();
  } };
});
const games: Game[] = [];
const frames = new Map<number, FrameRequestCallback>();
let serial = 0;
let disconnect: ReturnType<typeof vi.fn>;
let resizeCallback: (() => void) | undefined;
beforeEach(() => {
  frames.clear(); serial = 0; disconnect = vi.fn();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, writable: true, value: null });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++serial, callback); return serial; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resizeCallback = callback; } observe() {} disconnect = disconnect; });
  const context = new Proxy<Record<string, unknown>>({}, { get: (target, key: string) => target[key] ?? (() => undefined), set: (target, key: string, value) => { target[key] = value; return true; } });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => context) as never);
});
afterEach(() => { for (const game of games.splice(0)) game.dispose(); Reflect.deleteProperty(document, 'pointerLockElement'); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fixture() {
  const root = document.createElement('div');
  Object.defineProperties(root, { clientWidth: { value: 520, configurable: true }, clientHeight: { value: 284, configurable: true } });
  const canvas = document.createElement('canvas'); canvas.tabIndex = 0;
  canvas.requestPointerLock = () => { throw new Error('denied for fallback test'); };
  root.append(canvas);
  for (const name of ['game-overlay','overlay-title','overlay-copy','start-button','restart-button','block-stamina','boss-health','wave-banner','wave-banner-title','wave-banner-subtitle','context-tip','hit-marker','damage-indicator','scope-overlay','stage']) {
    const element = document.createElement(name.endsWith('button') ? 'button' : 'div'); element.dataset.bp = name; root.append(element);
  }
  for (const name of ['score','wave','enemies','health','health-bar','ammo','reserve','weapon-name','weapon-description','grapple-bar','block-bar','boss-name','boss-bar']) {
    const element = document.createElement('div'); element.dataset.hud = name; root.append(element);
  }
  document.body.append(root); const onModeChange = vi.fn();
  const onPrivacyPause = vi.fn();
  const game = new Game(canvas, { root, onModeChange, onPrivacyPause }); games.push(game);
  return { root, canvas, game, onModeChange, onPrivacyPause };
}
async function start(root: HTMLElement) { root.querySelector<HTMLButtonElement>('[data-bp="start-button"]')!.click(); await Promise.resolve(); await Promise.resolve(); }
describe('Ballpoint SPA runtime lifecycle (real simulation, mocked GPU)', () => {
  it('covers the window on a browser-consumed Escape / pointer unlock without any keydown', async () => {
    const { root, canvas, game, onPrivacyPause } = fixture(); await start(root);
    Reflect.set(document, 'pointerLockElement', canvas);
    document.dispatchEvent(new Event('pointerlockchange'));
    Reflect.set(document, 'pointerLockElement', null);
    document.dispatchEvent(new Event('pointerlockchange'));
    expect(game.getSnapshot().mode).toBe('paused'); expect(frames.size).toBe(0);
    expect(onPrivacyPause).toHaveBeenCalledOnce();
  });
  it('does not schedule a loop until explicit start and supports pointer-lock denial fallback', async () => {
    const { root, canvas, game } = fixture();
    expect(frames.size).toBe(0); expect(game.getSnapshot().mode).toBe('start');
    await start(root); expect(frames.size).toBe(1); expect(game.getSnapshot().mode).toBe('playing'); expect(document.activeElement).toBe(canvas);
    const [id, tick] = [...frames.entries()][0]!; frames.delete(id); tick(40);
    expect(frames.size).toBe(1); expect(root.querySelector('[data-bp="context-tip"]')).toHaveTextContent('鼠标锁定不可用');
  });
  it('Escape pauses synchronously, bubbles, and restore never resumes automatically', async () => {
    const { root, canvas, game } = fixture(); await start(root);
    const observer = vi.fn(); window.addEventListener('keydown', observer, { once: true });
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    expect(game.getSnapshot().mode).toBe('paused'); expect(frames.size).toBe(0); expect(observer).toHaveBeenCalledOnce();
    game.setActive(false); game.setActive(true); expect(frames.size).toBe(0);
    await start(root); expect(game.getSnapshot().mode).toBe('playing'); expect(frames.size).toBe(1);
  });
  it('typing elsewhere or tab/window hiding pauses without modifying document styling', async () => {
    const { root, game } = fixture(); await start(root);
    const text = document.createElement('textarea'); document.body.append(text); text.focus();
    expect(frames.size).toBe(0); expect(game.getSnapshot().mode).toBe('paused');
    await start(root); window.dispatchEvent(new Event('blur')); expect(frames.size).toBe(0);
    await start(root); vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange')); expect(frames.size).toBe(0);
    expect(document.body.className).toBe(''); expect(document.body.getAttribute('data-reticle')).toBeNull();
  });
  it('resizes to the parent, caps DPR and releases loops, observer, cached outlines and GPU on close', async () => {
    const { root, game } = fixture();
    expect(game.renderer.setSize).toHaveBeenCalledWith(520, 284, false);
    expect(game.renderer.setPixelRatio).toHaveBeenCalledWith(expect.any(Number));
    Object.defineProperty(root, 'clientWidth', { value: 380 }); resizeCallback?.();
    expect(game.renderer.setSize).toHaveBeenLastCalledWith(380, 284, false);
    await start(root); game.dispose(); game.dispose();
    expect(frames.size).toBe(0); expect(disconnect).toHaveBeenCalledOnce();
    expect(game.renderer.dispose).toHaveBeenCalledOnce(); expect(game.renderer.forceContextLoss).toHaveBeenCalledOnce();
    expect(getOutlineCacheStats().references).toBe(0);
    root.querySelector<HTMLButtonElement>('[data-bp="start-button"]')!.click(); expect(frames.size).toBe(0);
  });
  it('disposes shared surface resources once, including texture uniforms, with ownership exclusions', () => {
    const root = new THREE.Group(); const texture = new THREE.Texture();
    const geometry = new THREE.BoxGeometry(); const material = new THREE.ShaderMaterial({ uniforms: { artwork: { value: texture } } });
    root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
    const geometryDispose = vi.spyOn(geometry, 'dispose'); const materialDispose = vi.spyOn(material, 'dispose'); const textureDispose = vi.spyOn(texture, 'dispose');
    disposeObjectResources(root, { geometries: new Set([geometry]), materials: new Set([material]) });
    expect(geometryDispose).not.toHaveBeenCalled(); expect(materialDispose).not.toHaveBeenCalled();
    disposeObjectResources(root);
    expect(geometryDispose).toHaveBeenCalledOnce(); expect(materialDispose).toHaveBeenCalledOnce(); expect(textureDispose).toHaveBeenCalledOnce();
  });
});
