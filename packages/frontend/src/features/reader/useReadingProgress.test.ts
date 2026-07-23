import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReadingProgress } from '@stealth-reader/shared';

import { useReadingProgress, clampPercent } from './useReadingProgress';
import { readingApi } from '../../api';

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    readingApi: {
      ...actual.readingApi,
      saveProgress: vi.fn(),
    },
  };
});

const saveProgressMock = readingApi.saveProgress as unknown as ReturnType<
  typeof vi.fn
>;

function makeProgress(overrides: Partial<ReadingProgress> = {}): ReadingProgress {
  return {
    documentId: 'd1',
    chapterIdx: 2,
    charOffset: 150,
    percent: 42,
    ...overrides,
  };
}

describe('clampPercent', () => {
  it('clamps to [0, 100] (Req 7.4)', () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(37)).toBe(37);
    expect(clampPercent(Number.NaN)).toBe(0);
  });
});

describe('useReadingProgress (Req 7.1, 7.2)', () => {
  beforeEach(() => {
    saveProgressMock.mockReset();
    saveProgressMock.mockResolvedValue(undefined);
  });

  it('restores the last saved chapter and offset (Req 7.2)', () => {
    const { result } = renderHook(() =>
      useReadingProgress('d1', makeProgress()),
    );

    expect(result.current.restored).toBe(true);
    expect(result.current.progress).toEqual({
      chapterIdx: 2,
      charOffset: 150,
      percent: 42,
    });
    // Restoring must not trigger a save.
    expect(saveProgressMock).not.toHaveBeenCalled();
  });

  it('debounce-saves progress when position changes (Req 7.1)', async () => {
    const { result } = renderHook(() =>
      useReadingProgress('d1', makeProgress(), { delay: 20 }),
    );

    act(() => {
      result.current.reportProgress({ charOffset: 300, percent: 60 });
    });

    await waitFor(() => {
      expect(saveProgressMock).toHaveBeenCalledTimes(1);
    });
    expect(saveProgressMock).toHaveBeenCalledWith('d1', {
      chapterIdx: 2,
      charOffset: 300,
      percent: 60,
    });
  });

  it('does not save while paused (Req 9.2 pause hook)', async () => {
    const { result } = renderHook(() =>
      useReadingProgress('d1', makeProgress(), { delay: 10, paused: true }),
    );

    act(() => {
      result.current.reportProgress({ charOffset: 500 });
    });

    await new Promise((r) => setTimeout(r, 40));
    expect(saveProgressMock).not.toHaveBeenCalled();
  });

  it('clamps saved percent into [0, 100] (Req 7.4)', async () => {
    const { result } = renderHook(() =>
      useReadingProgress('d1', makeProgress(), { delay: 10 }),
    );

    act(() => {
      result.current.reportProgress({ percent: 250 });
    });

    await waitFor(() => {
      expect(saveProgressMock).toHaveBeenCalledTimes(1);
    });
    expect(saveProgressMock.mock.calls[0][1].percent).toBe(100);
  });
});
