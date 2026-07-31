import {
  act,
  cleanup,
  renderHook,
} from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  readingApi,
  type ReadingSessionSnapshot,
  type ReadingSessionState,
} from '../../api';
import { markReadingEngagementPending } from '../../app/engagement-sync';
import { useTrustedReadingSession } from './useTrustedReadingSession';

vi.mock('../../app/engagement-sync', () => ({
  markReadingEngagementPending: vi.fn(),
}));

const markPendingMock = vi.mocked(markReadingEngagementPending);

function snapshot(
  state: ReadingSessionState = 'active',
  overrides: Partial<ReadingSessionSnapshot> = {},
): ReadingSessionSnapshot {
  return {
    sessionId: 'session-1',
    state,
    heartbeatIntervalMs: 15_000,
    idleTimeoutMs: 120_000,
    effectiveSeconds: 0,
    qualified: false,
    eventQueued: false,
    ...overrides,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

async function flushOperations(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  });
}

describe('useTrustedReadingSession', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T02:00:00.000Z'));
    setVisibility('visible');
    markPendingMock.mockReset();
    vi.spyOn(readingApi, 'startSession').mockResolvedValue(snapshot());
    vi.spyOn(readingApi, 'heartbeatSession').mockImplementation(
      async (_sessionId, _sequence, state) => snapshot(state),
    );
    vi.spyOn(readingApi, 'endSession').mockResolvedValue(snapshot());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('starts once and serializes periodic heartbeats', async () => {
    const firstHeartbeat = deferred<ReadingSessionSnapshot>();
    const heartbeat = vi
      .spyOn(readingApi, 'heartbeatSession')
      .mockImplementationOnce(() => firstHeartbeat.promise)
      .mockResolvedValue(snapshot('active', { effectiveSeconds: 30 }));

    const { result, unmount } = renderHook(() =>
      useTrustedReadingSession('doc-1', {
        enabled: true,
        bossActive: false,
      }),
    );
    await flushOperations();

    expect(readingApi.startSession).toHaveBeenCalledTimes(1);
    expect(readingApi.startSession).toHaveBeenCalledWith(
      'doc-1',
      expect.any(String),
      'active',
    );
    expect(result.current.connection).toBe('connected');

    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    await flushOperations();
    expect(heartbeat).toHaveBeenCalledWith('session-1', 1, 'active');

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    await flushOperations();
    expect(heartbeat).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstHeartbeat.resolve(
        snapshot('active', {
          effectiveSeconds: 15,
          eventQueued: true,
        }),
      );
      await firstHeartbeat.promise;
      await Promise.resolve();
    });
    expect(result.current.effectiveSeconds).toBe(15);
    expect(markPendingMock).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    await flushOperations();
    expect(heartbeat).toHaveBeenLastCalledWith(
      'session-1',
      2,
      'active',
    );

    unmount();
  });

  it('reuses the client session id when a start request is retried', async () => {
    const start = vi
      .spyOn(readingApi, 'startSession')
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce(snapshot());
    const { result, unmount } = renderHook(() =>
      useTrustedReadingSession('doc-1', {
        enabled: true,
        bossActive: false,
      }),
    );
    await flushOperations();

    expect(result.current.connection).toBe('error');
    expect(start).toHaveBeenCalledTimes(1);
    const firstClientSessionId = start.mock.calls[0][1];

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    await flushOperations();

    expect(start).toHaveBeenCalledTimes(2);
    expect(start.mock.calls[1][1]).toBe(firstClientSessionId);
    expect(result.current.connection).toBe('connected');

    unmount();
  });

  it('pauses immediately for hidden tabs and window blur, then resumes', async () => {
    const heartbeat = vi.spyOn(readingApi, 'heartbeatSession');
    const { result, unmount } = renderHook(() =>
      useTrustedReadingSession('doc-1', {
        enabled: true,
        bossActive: false,
      }),
    );
    await flushOperations();

    act(() => {
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flushOperations();
    expect(result.current.state).toBe('hidden');
    expect(heartbeat).toHaveBeenLastCalledWith(
      'session-1',
      1,
      'hidden',
    );

    act(() => {
      setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flushOperations();
    expect(result.current.state).toBe('active');
    expect(heartbeat).toHaveBeenLastCalledWith(
      'session-1',
      2,
      'active',
    );

    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    await flushOperations();
    expect(result.current.state).toBe('hidden');
    expect(heartbeat).toHaveBeenLastCalledWith(
      'session-1',
      3,
      'hidden',
    );

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await flushOperations();
    expect(result.current.state).toBe('active');
    expect(heartbeat).toHaveBeenLastCalledWith(
      'session-1',
      4,
      'active',
    );

    unmount();
  });

  it('pauses and resumes when the boss screen changes', async () => {
    const heartbeat = vi.spyOn(readingApi, 'heartbeatSession');
    const { result, rerender, unmount } = renderHook(
      ({ bossActive }: { bossActive: boolean }) =>
        useTrustedReadingSession('doc-1', {
          enabled: true,
          bossActive,
        }),
      { initialProps: { bossActive: false } },
    );
    await flushOperations();

    rerender({ bossActive: true });
    await flushOperations();
    expect(result.current.state).toBe('boss');
    expect(heartbeat).toHaveBeenLastCalledWith(
      'session-1',
      1,
      'boss',
    );

    rerender({ bossActive: false });
    await flushOperations();
    expect(result.current.state).toBe('active');
    expect(heartbeat).toHaveBeenLastCalledWith(
      'session-1',
      2,
      'active',
    );

    unmount();
  });

  it('pauses after the server-provided idle timeout and activity resumes it', async () => {
    vi.spyOn(readingApi, 'startSession').mockResolvedValue(
      snapshot('active', {
        heartbeatIntervalMs: 30_000,
        idleTimeoutMs: 1_000,
      }),
    );
    const heartbeat = vi.spyOn(readingApi, 'heartbeatSession');
    const { result, unmount } = renderHook(() =>
      useTrustedReadingSession('doc-1', {
        enabled: true,
        bossActive: false,
      }),
    );
    await flushOperations();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    await flushOperations();
    expect(result.current.state).toBe('idle');
    expect(heartbeat).toHaveBeenLastCalledWith(
      'session-1',
      1,
      'idle',
    );

    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
    });
    await flushOperations();
    expect(result.current.state).toBe('active');
    expect(heartbeat).toHaveBeenLastCalledWith(
      'session-1',
      2,
      'active',
    );

    unmount();
  });

  it('ends only once across pagehide and unmount', async () => {
    const end = vi.spyOn(readingApi, 'endSession');
    const { unmount } = renderHook(() =>
      useTrustedReadingSession('doc-1', {
        enabled: true,
        bossActive: false,
      }),
    );
    await flushOperations();

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(end).toHaveBeenCalledWith('session-1', 1, 'active');

    unmount();
    expect(end).toHaveBeenCalledTimes(1);
  });
});
