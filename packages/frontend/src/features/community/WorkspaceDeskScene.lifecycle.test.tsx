import { act, fireEvent, render, screen } from '@testing-library/react';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceDeskScene from './WorkspaceDeskScene';

const rendererCalls = vi.hoisted(() => ({ setPixelRatio: vi.fn(), setClearColor: vi.fn(), setSize: vi.fn(), render: vi.fn(), dispose: vi.fn(), forceContextLoss: vi.fn() }));
vi.mock('three', async importOriginal => {
  const original = await importOriginal<typeof import('three')>();
  return { ...original, WebGLRenderer: class { domElement = document.createElement('canvas'); setPixelRatio = rendererCalls.setPixelRatio; setClearColor = rendererCalls.setClearColor; setSize = rendererCalls.setSize; render = rendererCalls.render; dispose = rendererCalls.dispose; forceContextLoss = rendererCalls.forceContextLoss; } };
});

describe('WorkspaceDeskScene rendering lifecycle', () => {
  let frames: Map<number, FrameRequestCallback>, nextFrame: number;
  let intersection: IntersectionObserverCallback;
  let mediaChange: () => void;
  const resizeDisconnect = vi.fn(), intersectionDisconnect = vi.fn();
  let media: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    Object.values(rendererCalls).forEach(call => call.mockClear()); resizeDisconnect.mockClear(); intersectionDisconnect.mockClear();
    frames = new Map(); nextFrame = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = ++nextFrame; frames.set(id, callback); return id; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
    vi.stubGlobal('devicePixelRatio', 3);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(260);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 300, height: 260, left: 0, top: 0, right: 300, bottom: 260, x: 0, y: 0, toJSON: () => ({}) });
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    media = { matches: false, addEventListener: vi.fn((_name, callback) => { mediaChange = callback; }), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', () => media);
    vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); disconnect = resizeDisconnect; });
    vi.stubGlobal('IntersectionObserver', class { constructor(callback: IntersectionObserverCallback) { intersection = callback; } observe = vi.fn(); disconnect = intersectionDisconnect; });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  const tick = (time: number): void => { const [id, callback] = frames.entries().next().value as [number, FrameRequestCallback]; frames.delete(id); act(() => callback(time)); };
  it('caps DPR and rendering, pauses hidden/offscreen, supports lamp interaction and releases all GPU resources', () => {
    const disposeGeometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const disposeMaterial = vi.spyOn(THREE.Material.prototype, 'dispose');
    const { unmount, container } = render(<WorkspaceDeskScene />);
    expect(rendererCalls.setPixelRatio).toHaveBeenCalledWith(1.5);
    expect(rendererCalls.render).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    const host = container.querySelector('canvas')!.parentElement!;
    act(() => host.dispatchEvent(new MouseEvent('pointermove', { clientX: 300 })));
    tick(0); expect(rendererCalls.render).toHaveBeenCalledTimes(2);
    tick(16); expect(rendererCalls.render).toHaveBeenCalledTimes(2);
    tick(34); expect(rendererCalls.render).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByRole('button', { name: /熄灭台灯/ })); tick(68);
    const scene = rendererCalls.render.mock.calls.at(-1)?.[0] as THREE.Scene;
    const light = scene.getObjectByProperty('type', 'PointLight') as THREE.PointLight;
    expect(light.intensity).toBe(0);
    expect(screen.getByRole('button', { name: /点亮台灯/ })).toHaveAttribute('aria-pressed', 'false');
    for (let index = 0; index < 100 && frames.size > 0; index += 1) tick(102 + index * 34);
    expect(frames.size).toBe(0); // No idle animation loop remains once the turn has settled.
    const settledRenderCount = rendererCalls.render.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /点亮台灯/ })); tick(10_000);
    expect(rendererCalls.render).toHaveBeenCalledTimes(settledRenderCount + 1);
    expect(frames.size).toBe(0); // A lamp click renders once and returns to sleep.
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange'))); expect(frames.size).toBe(0);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    act(() => document.dispatchEvent(new Event('visibilitychange'))); expect(frames.size).toBe(1);
    act(() => intersection([{ isIntersecting: false, intersectionRatio: 0 } as IntersectionObserverEntry], {} as IntersectionObserver)); expect(frames.size).toBe(0);
    act(() => intersection([{ isIntersecting: true, intersectionRatio: .01 } as IntersectionObserverEntry], {} as IntersectionObserver)); expect(frames.size).toBe(0);
    act(() => intersection([{ isIntersecting: true, intersectionRatio: .5 } as IntersectionObserverEntry], {} as IntersectionObserver)); expect(frames.size).toBe(1);
    act(() => intersection([{ isIntersecting: false, intersectionRatio: 0 } as IntersectionObserverEntry], {} as IntersectionObserver)); expect(frames.size).toBe(0);
    act(() => intersection([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)); expect(frames.size).toBe(1);
    unmount(); expect(frames.size).toBe(0);
    expect(rendererCalls.dispose).toHaveBeenCalledTimes(1); expect(rendererCalls.forceContextLoss).toHaveBeenCalledTimes(1);
    expect(disposeGeometry).toHaveBeenCalled(); expect(disposeMaterial).toHaveBeenCalled();
    expect(resizeDisconnect).toHaveBeenCalledTimes(1); expect(intersectionDisconnect).toHaveBeenCalledTimes(1);
  });
  it('reacts to a reduced-motion preference change by stopping and disposing the active scene', () => {
    render(<WorkspaceDeskScene />);
    act(() => { media.matches = true; mediaChange(); });
    expect(screen.getByText('已开启减少动效')).toBeInTheDocument();
    expect(frames.size).toBe(0);
    expect(rendererCalls.dispose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /台灯/ })).not.toBeInTheDocument();
  });
  it('preserves a switched-off lamp in the first render after reduced-motion mode rebuilds the scene', () => {
    render(<WorkspaceDeskScene />);
    fireEvent.click(screen.getByRole('button', { name: /熄灭台灯/ })); tick(0);
    act(() => { media.matches = true; mediaChange(); });
    expect(rendererCalls.dispose).toHaveBeenCalledTimes(1);
    act(() => { media.matches = false; mediaChange(); });
    const rebuiltScene = rendererCalls.render.mock.calls.at(-1)?.[0] as THREE.Scene;
    const rebuiltLamp = rebuiltScene.getObjectByProperty('type', 'PointLight') as THREE.PointLight;
    expect(rebuiltLamp.intensity).toBe(0);
    const screenMaterials = new Set<THREE.MeshStandardMaterial>();
    rebuiltScene.traverse(object => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial && object.material.emissive.getHex() === 0x3879a1) screenMaterials.add(object.material);
    });
    expect(screenMaterials.size).toBe(1);
    expect([...screenMaterials][0]?.emissiveIntensity).toBe(.05);
    expect(screen.getByRole('button', { name: /点亮台灯/ })).toHaveAttribute('aria-pressed', 'false');
    expect(frames.size).toBe(0);
  });
});
