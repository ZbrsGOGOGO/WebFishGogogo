import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OfficeReliefReceipt } from '@stealth-reader/shared';
import { getCommunitySessionGeneration, setCommunitySessionTokens } from '../../api/community-http';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../app/store/community-auth-store';
import { TOWER_TEST_USER } from '../games/demon-tower/test-fixtures';
import { useOfficeBossSound } from './useOfficeBossSound';

const parameter = () => ({ setValueAtTime: vi.fn<(value: number, time: number) => void>(), linearRampToValueAtTime: vi.fn<(value: number, time: number) => void>() });
const createVoice = () => ({ type: '', frequency: parameter(), connect: vi.fn(), disconnect: vi.fn(), start: vi.fn<(when?: number) => void>(), stop: vi.fn<(when?: number) => void>(), onended: null as (() => void) | null });
const createVolume = () => ({ gain: parameter(), connect: vi.fn(), disconnect: vi.fn() });
class FakeAudio {
  static instances: FakeAudio[] = [];
  state: AudioContextState = 'suspended';
  currentTime = 1;
  destination = {};
  oscillators: Array<ReturnType<typeof createVoice>> = [];
  gains: Array<ReturnType<typeof createVolume>> = [];
  constructor() { FakeAudio.instances.push(this); }
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  createOscillator = () => {
    const node = createVoice();
    this.oscillators.push(node); return node;
  };
  createGain = () => {
    const gain = createVolume();
    this.gains.push(gain); return gain;
  };
}
function receipt(id = 'receipt-1', kind: 'coin' | 'loss' | 'title' | 'purchase' | 'claim' = 'coin', replayed = false): OfficeReliefReceipt {
  return { requestId: id, replayed, outcome: { id: `${id}-outcome`, at: '2026-09-11T08:00:00Z', kind, tokenDelta: 100, message: '服务器确认' } };
}
function props(overrides: Partial<Parameters<typeof useOfficeBossSound>[0]> = {}) {
  return { owner: TOWER_TEST_USER.publicId, generation: getCommunitySessionGeneration(), covered: false, active: true, receipt: null, ...overrides };
}
async function enable(result: { current: ReturnType<typeof useOfficeBossSound> }) { act(() => result.current.toggle()); await waitFor(() => expect(result.current.enabled).toBe(true)); }
beforeEach(() => {
  resetCommunityAuthStoreForTests(); setCommunitySessionTokens('synthetic-sound-session');
  useCommunityAuthStore.setState({ phase: 'active', user: { ...TOWER_TEST_USER } });
  FakeAudio.instances = [];
  vi.stubGlobal('AudioContext', FakeAudio);
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); resetCommunityAuthStoreForTests(); });

describe('office boss gesture-only short sound', () => {
  it('times out an indefinitely pending resume and ignores its late completion', async () => {
    vi.useFakeTimers(); let complete!: () => void;
    class PendingAudio extends FakeAudio { override resume = vi.fn(() => new Promise<void>(resolve => { complete = resolve; })); }
    vi.stubGlobal('AudioContext', PendingAudio);
    const initial = props(), hook = renderHook(input => useOfficeBossSound(input), { initialProps: initial });
    act(() => hook.result.current.toggle()); expect(hook.result.current.starting).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(hook.result.current.starting).toBe(false); expect(hook.result.current.enabled).toBe(false);
    expect(hook.result.current.available).toBe(false); expect(hook.result.current.message).toContain('启动超时');
    expect(FakeAudio.instances[0].close).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    await act(async () => complete()); hook.rerender({ ...initial, receipt: receipt('after-timeout') });
    expect(hook.result.current.enabled).toBe(false); expect(FakeAudio.instances[0].oscillators).toHaveLength(0);
  });
  it('clears the startup deadline after successful resume without muting later', async () => {
    vi.useFakeTimers(); const hook = renderHook(() => useOfficeBossSound(props()));
    await act(async () => hook.result.current.toggle()); expect(hook.result.current.enabled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(hook.result.current.enabled).toBe(true); expect(hook.result.current.message).toBe('');
  });
  it('clears a pending startup deadline on privacy cover without a later timeout error', async () => {
    vi.useFakeTimers();
    class PendingAudio extends FakeAudio { override resume = vi.fn(() => new Promise<void>(() => {})); }
    vi.stubGlobal('AudioContext', PendingAudio);
    const initial = props(), hook = renderHook(input => useOfficeBossSound(input), { initialProps: initial });
    act(() => hook.result.current.toggle()); hook.rerender({ ...initial, covered: true });
    expect(vi.getTimerCount()).toBe(0); expect(FakeAudio.instances[0].close).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(hook.result.current.starting).toBe(false); expect(hook.result.current.message).toBe('');
  });
  it('is silent without constructing a context on mount or new server receipts', () => {
    const initial = props(), hook = renderHook(input => useOfficeBossSound(input), { initialProps: initial });
    expect(hook.result.current.enabled).toBe(false); expect(FakeAudio.instances).toHaveLength(0);
    hook.rerender({ ...initial, receipt: receipt() });
    expect(FakeAudio.instances).toHaveLength(0);
  });
  it('only enables after explicit toggle and does not play the preceding receipt or a stored GET result', async () => {
    const initial = props({ receipt: receipt() });
    const hook = renderHook(input => useOfficeBossSound(input), { initialProps: initial });
    await enable(hook.result);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].oscillators).toHaveLength(0);
    hook.rerender({ ...initial, receipt: receipt() });
    expect(FakeAudio.instances[0].oscillators).toHaveLength(0);
  });
  it.each([['coin', 2], ['loss', 1], ['title', 3]] as const)('uses short low-level local sine tones for a new %s result', async (kind, count) => {
    const initial = props(), hook = renderHook(input => useOfficeBossSound(input), { initialProps: initial });
    await enable(hook.result);
    hook.rerender({ ...initial, receipt: receipt('new', kind) });
    const audio = FakeAudio.instances[0]; expect(audio.oscillators).toHaveLength(count);
    for (const oscillator of audio.oscillators) {
      expect(oscillator.type).toBe('sine'); expect(oscillator.start).toHaveBeenCalledOnce(); expect(oscillator.stop).toHaveBeenCalledOnce();
      const start = oscillator.start.mock.calls[0][0] as number, stop = oscillator.stop.mock.calls[0][0] as number;
      expect(stop - start).toBeLessThan(.14); expect(stop - audio.currentTime).toBeLessThan(.22);
    }
    for (const gain of audio.gains) expect(gain.gain.linearRampToValueAtTime.mock.calls.every(call => (call[0] as number) <= .022)).toBe(true);
    hook.rerender({ ...initial, receipt: receipt('new', kind) }); expect(audio.oscillators).toHaveLength(count);
  });
  it.each([receipt('replayed', 'coin', true), receipt('purchase', 'purchase'), receipt('claim', 'claim'), { requestId: 'empty', replayed: false, outcome: null }])('does not sound for replayed or non-challenge receipts %j', async value => {
    const initial = props(), hook = renderHook(input => useOfficeBossSound(input), { initialProps: initial });
    await enable(hook.result); hook.rerender({ ...initial, receipt: value });
    expect(FakeAudio.instances[0].oscillators).toHaveLength(0);
  });
  it('closes and disconnects immediately on manual mute, with no replay when enabled again', async () => {
    const initial = props(), hook = renderHook(input => useOfficeBossSound(input), { initialProps: initial });
    await enable(hook.result); hook.rerender({ ...initial, receipt: receipt() });
    const audio = FakeAudio.instances[0]; act(() => hook.result.current.toggle());
    expect(hook.result.current.enabled).toBe(false); expect(audio.close).toHaveBeenCalledOnce();
    for (const oscillator of audio.oscillators) { expect(oscillator.stop).toHaveBeenCalledTimes(2); expect(oscillator.disconnect).toHaveBeenCalledOnce(); }
    await enable(hook.result); expect(FakeAudio.instances[1].oscillators).toHaveLength(0);
  });
  it.each(['cover', 'daily', 'blur', 'hidden', 'unmount'] as const)('releases the context on %s and never reopens it on return', async boundary => {
    const initial = props(), hook = renderHook(input => useOfficeBossSound(input), { initialProps: initial });
    await enable(hook.result); hook.rerender({ ...initial, receipt: receipt() });
    const audio = FakeAudio.instances[0];
    if (boundary === 'cover') hook.rerender({ ...initial, covered: true, receipt: receipt('covered') });
    else if (boundary === 'daily') hook.rerender({ ...initial, active: false });
    else if (boundary === 'blur') act(() => window.dispatchEvent(new Event('blur')));
    else if (boundary === 'hidden') { vi.mocked(Object.getOwnPropertyDescriptor(document, 'hidden')!.get!).mockReturnValue(true); act(() => document.dispatchEvent(new Event('visibilitychange'))); }
    else hook.unmount();
    expect(audio.close).toHaveBeenCalledOnce(); expect(audio.oscillators.every(oscillator => oscillator.stop.mock.calls.length === 2)).toBe(true);
    if (boundary !== 'unmount') {
      expect(hook.result.current.enabled).toBe(false);
      hook.rerender({ ...initial, receipt: receipt('return') });
      act(() => window.dispatchEvent(new Event('focus')));
      expect(hook.result.current.enabled).toBe(false); expect(FakeAudio.instances).toHaveLength(1);
    }
  });
  it('invalidates pending startup when the page becomes covered and cannot later enable or play', async () => {
    let complete!: () => void;
    class DelayedAudio extends FakeAudio { override resume = vi.fn(() => new Promise<void>(resolve => { complete = () => { this.state = 'running'; resolve(); }; })); }
    vi.stubGlobal('AudioContext', DelayedAudio);
    const initial = props(), hook = renderHook(input => useOfficeBossSound(input), { initialProps: initial });
    act(() => hook.result.current.toggle()); expect(hook.result.current.starting).toBe(true);
    hook.rerender({ ...initial, covered: true });
    await act(async () => complete());
    expect(hook.result.current.enabled).toBe(false); expect(FakeAudio.instances[0].close).toHaveBeenCalledOnce();
    hook.rerender({ ...initial, receipt: receipt('later') }); expect(FakeAudio.instances[0].oscillators).toHaveLength(0);
  });
  it('releases on account/session changes and rejects callbacks after the auth generation changes', async () => {
    const initial = props(), hook = renderHook(input => useOfficeBossSound(input), { initialProps: initial });
    await enable(hook.result);
    act(() => { setCommunitySessionTokens('other-session'); useCommunityAuthStore.setState({ user: { ...TOWER_TEST_USER, publicId: 'sound-other' } }); });
    hook.rerender({ ...initial, owner: 'sound-other', generation: getCommunitySessionGeneration(), receipt: receipt('other') });
    expect(hook.result.current.enabled).toBe(false); expect(FakeAudio.instances[0].close).toHaveBeenCalledOnce(); expect(FakeAudio.instances[0].oscillators).toHaveLength(0);
    // An old control cannot create a context with a no-longer-current generation.
    hook.rerender(initial); act(() => hook.result.current.toggle()); expect(FakeAudio.instances).toHaveLength(1);
  });
  it('does not couple the explicit sound choice to reduced-motion preferences', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    const initial = props(), hook = renderHook(input => useOfficeBossSound(input), { initialProps: initial });
    await enable(hook.result); hook.rerender({ ...initial, receipt: receipt() });
    expect(hook.result.current.enabled).toBe(true); expect(FakeAudio.instances[0].oscillators).toHaveLength(2);
  });
  it('disables unsupported sound without affecting receipts or creating resources', () => {
    vi.stubGlobal('AudioContext', undefined);
    const initial = props(), hook = renderHook(input => useOfficeBossSound(input), { initialProps: initial });
    expect(hook.result.current.available).toBe(false); expect(hook.result.current.message).toContain('不支持音效');
    act(() => hook.result.current.toggle()); hook.rerender({ ...initial, receipt: receipt() }); expect(FakeAudio.instances).toHaveLength(0);
  });
  it('handles rejected resume and broken sound nodes locally without throwing into game actions', async () => {
    class RejectedAudio extends FakeAudio { override resume = vi.fn(async () => { throw new Error('no output'); }); }
    vi.stubGlobal('AudioContext', RejectedAudio);
    const initial = props(), hook = renderHook(input => useOfficeBossSound(input), { initialProps: initial });
    act(() => hook.result.current.toggle()); await waitFor(() => expect(hook.result.current.available).toBe(false));
    expect(hook.result.current.message).toContain('挑战不受影响'); expect(FakeAudio.instances[0].close).toHaveBeenCalledOnce();
    hook.unmount();
    class BrokenAudio extends FakeAudio { override createOscillator = (): ReturnType<typeof createVoice> => { throw new Error('no node'); }; }
    vi.stubGlobal('AudioContext', BrokenAudio);
    const other = renderHook(input => useOfficeBossSound(input), { initialProps: initial }); await enable(other.result);
    expect(() => other.rerender({ ...initial, receipt: receipt() })).not.toThrow();
    expect(other.result.current.message).toContain('本次挑战结果仍然有效'); expect(other.result.current.enabled).toBe(false);
  });
});
