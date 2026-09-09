import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputManager, attemptPointerLock } from './runtime/input/InputManager';
import { AudioSystem } from './runtime/audio/AudioSystem';
import { shouldIgnoreGameKeyboard } from '../game-input';

const instances: InputManager[] = [];
afterEach(() => { for (const input of instances.splice(0)) input.dispose(); document.body.replaceChildren(); vi.restoreAllMocks(); });
function fixture() {
  const canvas = document.createElement('canvas'); canvas.tabIndex = 0;
  const text = document.createElement('textarea');
  document.body.append(canvas, text);
  const input = new InputManager(canvas); instances.push(input);
  input.setPointerFallback(true); canvas.focus();
  return { canvas, text, input };
}
describe('Ballpoint isolated office controls', () => {
  it('makes existing background games ignore the floating canvas without ignoring their own boards', () => {
    const canvas = document.createElement('canvas'); canvas.dataset.exclusiveGameInput = 'ballpoint';
    expect(shouldIgnoreGameKeyboard(canvas)).toBe(true);
    expect(shouldIgnoreGameKeyboard(document.createElement('div'))).toBe(false);
  });
  it('accepts WASD only on the focused canvas and leaves text/browser shortcuts alone', () => {
    const { canvas, text, input } = fixture();
    const key = new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', bubbles: true, cancelable: true });
    canvas.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true); expect(input.consumeFrame().moveZ).toBe(1);
    canvas.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
    text.focus();
    const typed = new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', bubbles: true, cancelable: true });
    text.dispatchEvent(typed);
    expect(typed.defaultPrevented).toBe(false); expect(input.consumeFrame().moveZ).toBe(0);
    canvas.focus();
    const shortcut = new KeyboardEvent('keydown', { code: 'KeyR', ctrlKey: true, bubbles: true, cancelable: true });
    canvas.dispatchEvent(shortcut);
    expect(shortcut.defaultPrevented).toBe(false); expect(input.consumeFrame().reloadPressed).toBe(false);
  });
  it('does not consume context menus/wheels or mouse attacks outside its canvas', () => {
    const { canvas, text, input } = fixture();
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    const wheel = new WheelEvent('wheel', { deltaY: 20, bubbles: true, cancelable: true });
    text.dispatchEvent(menu); text.dispatchEvent(wheel);
    text.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    expect(menu.defaultPrevented).toBe(false); expect(wheel.defaultPrevented).toBe(false);
    expect(input.consumeFrame()).toMatchObject({ primary: false, weaponWheel: 0 });
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    expect(input.consumeFrame().primary).toBe(true);
  });
  it('clears one-shot actions, movement and held attacks when paused or disposed', () => {
    const { canvas, input } = fixture();
    for (const code of ['Space', 'KeyR', 'KeyQ', 'Digit3']) canvas.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    input.setEnabled(false); input.setEnabled(true);
    expect(input.consumeFrame()).toMatchObject({ jumpPressed: false, reloadPressed: false, grapplePressed: false, weaponSelection: null });
    input.dispose();
    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    expect(input.consumeFrame().moveZ).toBe(0);
  });
  it('does not stop the Escape event from reaching the website privacy handler', () => {
    const { canvas, input } = fixture(); const observer = vi.fn();
    window.addEventListener('keydown', observer, { once: true });
    const escape = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
    canvas.dispatchEvent(escape);
    expect(observer).toHaveBeenCalledOnce(); expect(escape.defaultPrevented).toBe(false);
    expect(input.consumeFrame().pausePressed).toBe(true);
  });
  it('cancels pending pointer requests and releases a late successful lock', async () => {
    const canvas = document.createElement('canvas'); const controller = new AbortController();
    let resolve!: () => void;
    canvas.requestPointerLock = () => new Promise<void>(done => { resolve = done; });
    const pointerDocument = { pointerLockElement: null as Element | null, addEventListener: vi.fn(), removeEventListener: vi.fn(), exitPointerLock: vi.fn() };
    const result = attemptPointerLock(canvas, pointerDocument, 350, controller.signal);
    controller.abort(); expect(await result).toBe(false);
    pointerDocument.pointerLockElement = canvas; resolve(); await Promise.resolve();
    expect(pointerDocument.exitPointerLock).toHaveBeenCalledOnce();
    expect(pointerDocument.removeEventListener).toHaveBeenCalledTimes(2);
  });
  it('never creates audio nodes, even after a start gesture or a shot', () => {
    const constructor = vi.fn(); vi.stubGlobal('AudioContext', constructor);
    const sound = new AudioSystem(); sound.resume(); sound.play('rifle'); sound.suspend(); sound.dispose();
    expect(constructor).not.toHaveBeenCalled(); vi.unstubAllGlobals();
  });
});
