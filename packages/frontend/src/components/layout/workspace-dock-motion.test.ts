import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachWorkspaceDockMotion } from './workspace-dock-motion';

describe('on-demand workspace dock motion', () => {
  let root: HTMLElement, item: HTMLElement, dispose: () => void;
  let frames: Map<number, FrameRequestCallback>, seq: number;
  let media: Array<{ matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> }>;
  const advance = (count = 120) => {
    for (let step = 1; step <= count && frames.size; step++) {
      const ready = [...frames.values()]; frames.clear(); ready.forEach(callback => callback(step * 1000 / 60));
    }
  };
  beforeEach(() => {
    seq = 0; frames = new Map();
    media = [false, true].map(matches => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.stubGlobal('matchMedia', vi.fn(query => media[query.includes('reduced') ? 0 : 1]));
    vi.stubGlobal('requestAnimationFrame', vi.fn(callback => { frames.set(++seq, callback); return seq; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn(id => frames.delete(id)));
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    root = document.createElement('nav'); item = document.createElement('a'); item.dataset.dockItem = ''; item.setAttribute('href', '/games'); root.append(item); document.body.append(root);
    Object.defineProperty(root, 'clientWidth', { value: 300 });
    vi.spyOn(item, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 100 } as DOMRect);
    dispose = attachWorkspaceDockMotion(root);
  });
  afterEach(() => { dispose(); root.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('has no idle frames and settles both proximity and leave animations', () => {
    expect(frames.size).toBe(0);
    const move = new Event('pointermove'); Object.defineProperty(move, 'clientX', { value: 50 }); root.dispatchEvent(move);
    expect(frames.size).toBe(1); advance();
    expect(Number(item.style.getPropertyValue('--dock-influence'))).toBe(1);
    expect(frames.size).toBe(0);
    root.dispatchEvent(new Event('pointerleave')); advance();
    expect(Number(item.style.getPropertyValue('--dock-influence'))).toBe(0); expect(frames.size).toBe(0);
  });
  it('respects keyboard link behavior and releases every frame and media listener', () => {
    item.focus(); expect(frames.size).toBe(1);
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }); item.dispatchEvent(enter); expect(enter.defaultPrevented).toBe(false);
    dispose(); expect(frames.size).toBe(0); expect(item.style.getPropertyValue('--dock-influence')).toBe('');
    root.dispatchEvent(new Event('pointerleave')); expect(frames.size).toBe(0);
    media.forEach(query => expect(query.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function)));
  });
  it('stops hidden tabs and never animates reduced-motion or coarse input', () => {
    item.focus(); vi.spyOn(document, 'hidden', 'get').mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange')); expect(frames.size).toBe(0);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    media[0].matches = true; root.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); expect(frames.size).toBe(0);
    media[0].matches = false; media[1].matches = false; root.dispatchEvent(new Event('pointerleave')); expect(frames.size).toBe(0);
  });
});
