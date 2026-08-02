import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useBossKey, DEFAULT_BOSS_KEY } from './useBossKey';
import { getPreferences } from '../../api/preferences';

vi.mock('../../api/preferences', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../api/preferences')>();
  return {
    ...actual,
    getPreferences: vi.fn(),
  };
});

const getPreferencesMock = getPreferences as unknown as ReturnType<
  typeof vi.fn
>;

function makePrefs(bossKey: string) {
  return {
    userId: 'u1',
    activeSkin: 'csdn',
    fontSize: 16,
    lineHeight: '1.8',
    theme: 'light',
    bossKey,
    profession: null,
    settings: {},
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

/** 派发一次全局 keydown。 */
function pressKey(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  });
}

describe('useBossKey (Req 9.1, 9.3, 9.4)', () => {
  beforeEach(() => {
    getPreferencesMock.mockReset();
    getPreferencesMock.mockResolvedValue(makePrefs(DEFAULT_BOSS_KEY));
  });

  it('defaults to Escape and toggles active on key press (Req 9.1/9.3/9.4)', async () => {
    const { result } = renderHook(() => useBossKey());

    await waitFor(() => {
      expect(result.current.bossKey).toBe('Escape');
    });
    expect(result.current.active).toBe(false);

    // 首次按下切换到正经页面（Req 9.1）。
    pressKey('Escape');
    expect(result.current.active).toBe(true);

    // 再次按下恢复阅读界面（Req 9.3）。
    pressKey('Escape');
    expect(result.current.active).toBe(false);
  });

  it('uses a custom boss key from preferences (Req 9.4)', async () => {
    getPreferencesMock.mockResolvedValue(makePrefs('F2'));
    const { result } = renderHook(() => useBossKey());

    await waitFor(() => {
      expect(result.current.bossKey).toBe('F2');
    });

    // 默认键不再触发。
    pressKey('Escape');
    expect(result.current.active).toBe(false);

    // 自定义键触发（大小写不敏感）。
    pressKey('f2');
    expect(result.current.active).toBe(true);
  });

  it('honors an explicit bossKey override without loading prefs', () => {
    const { result } = renderHook(() => useBossKey({ bossKey: 'b' }));

    expect(result.current.bossKey).toBe('b');
    expect(getPreferencesMock).not.toHaveBeenCalled();

    pressKey('b');
    expect(result.current.active).toBe(true);
  });

  it('exposes manual activate/deactivate/toggle', () => {
    const { result } = renderHook(() => useBossKey({ bossKey: 'x' }));

    act(() => result.current.activate());
    expect(result.current.active).toBe(true);

    act(() => result.current.deactivate());
    expect(result.current.active).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.active).toBe(true);
  });

  it('does not toggle while typing in an input (unless already active)', () => {
    const { result } = renderHook(() => useBossKey({ bossKey: 'k' }));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', bubbles: true }),
      );
    });
    expect(result.current.active).toBe(false);

    document.body.removeChild(input);
  });
});
