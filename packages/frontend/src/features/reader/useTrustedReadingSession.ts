import { useEffect, useRef, useState } from 'react';

import {
  readingApi,
  type ReadingSessionSnapshot,
  type ReadingSessionState,
} from '../../api';
import { markReadingEngagementPending } from '../../app/engagement-sync';

export type ReadingSessionConnection =
  | 'inactive'
  | 'starting'
  | 'connected'
  | 'error';

export interface UseTrustedReadingSessionOptions {
  enabled: boolean;
  bossActive: boolean;
}

export interface UseTrustedReadingSessionResult {
  state: ReadingSessionState;
  connection: ReadingSessionConnection;
  effectiveSeconds: number;
  qualified: boolean;
  eventQueued: boolean;
  error: string | null;
}

const FALLBACK_IDLE_TIMEOUT_MS = 120_000;
const START_RETRY_MS = 5_000;

function createClientSessionId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : '阅读计时暂时无法同步';
}

/**
 * 可信阅读会话只上报状态和顺序号，不提交客户端计算的阅读时长。
 * 服务端根据及时、连续且有上限的心跳计算有效阅读时间。
 */
export function useTrustedReadingSession(
  docId: string | undefined,
  options: UseTrustedReadingSessionOptions,
): UseTrustedReadingSessionResult {
  const { enabled, bossActive } = options;
  const bossControllerRef = useRef<((active: boolean) => void) | null>(null);
  const [result, setResult] = useState<UseTrustedReadingSessionResult>({
    state: 'active',
    connection: 'inactive',
    effectiveSeconds: 0,
    qualified: false,
    eventQueued: false,
    error: null,
  });

  useEffect(() => {
    if (!docId || !enabled) {
      setResult((current) => ({
        ...current,
        connection: 'inactive',
        error: null,
      }));
      bossControllerRef.current = null;
      return undefined;
    }

    let disposed = false;
    let ending = false;
    let endSent = false;
    let session: ReadingSessionSnapshot | null = null;
    let sequence = 0;
    let desiredState: ReadingSessionState = 'active';
    let boss = bossActive;
    let windowFocused = true;
    let lastActivityAt = Date.now();
    let idleTimeoutMs = FALLBACK_IDLE_TIMEOUT_MS;
    let heartbeatTimer: number | null = null;
    let idleTimer: number | null = null;
    let retryTimer: number | null = null;
    let startQueued = false;
    let operations = Promise.resolve();
    // 同一个 effect 生命周期内固定幂等键；网络超时后的重试必须让服务端
    // 能够重放第一次可能已经成功落库的启动请求。
    const clientSessionId = createClientSessionId();

    const update = (
      patch: Partial<UseTrustedReadingSessionResult>,
    ): void => {
      if (!disposed) {
        setResult((current) => ({ ...current, ...patch }));
      }
    };

    const clearTimer = (timer: number | null): void => {
      if (timer != null) window.clearTimeout(timer);
    };

    const clearScheduled = (): void => {
      clearTimer(heartbeatTimer);
      clearTimer(idleTimer);
      heartbeatTimer = null;
      idleTimer = null;
    };

    const applySnapshot = (next: ReadingSessionSnapshot): void => {
      session = next;
      idleTimeoutMs = next.idleTimeoutMs;
      if (next.eventQueued) {
        markReadingEngagementPending();
      }
      update({
        connection: 'connected',
        effectiveSeconds: next.effectiveSeconds,
        qualified: next.qualified,
        eventQueued: next.eventQueued,
        error: null,
      });
    };

    const enqueue = (operation: () => Promise<void>): void => {
      operations = operations.then(operation, operation);
    };

    const currentState = (): ReadingSessionState => {
      if (boss) return 'boss';
      if (
        document.visibilityState === 'hidden' ||
        !windowFocused
      ) {
        return 'hidden';
      }
      if (Date.now() - lastActivityAt >= idleTimeoutMs) return 'idle';
      return 'active';
    };

    let scheduleHeartbeat = (): void => {};
    let scheduleIdle = (): void => {};
    let ensureStarted = (): void => {};

    const sendHeartbeat = (state: ReadingSessionState): void => {
      if (!session || ending) return;
      clearTimer(heartbeatTimer);
      heartbeatTimer = null;
      const requestSequence = ++sequence;
      const sessionId = session.sessionId;
      enqueue(async () => {
        if (ending) return;
        try {
          const next = await readingApi.heartbeatSession(
            sessionId,
            requestSequence,
            state,
          );
          applySnapshot(next);
        } catch (error) {
          update({ connection: 'error', error: errorMessage(error) });
        } finally {
          if (!ending && desiredState === 'active') {
            scheduleHeartbeat();
          }
        }
      });
    };

    scheduleHeartbeat = (): void => {
      clearTimer(heartbeatTimer);
      heartbeatTimer = null;
      if (!session || ending || desiredState !== 'active') return;
      heartbeatTimer = window.setTimeout(
        () => sendHeartbeat('active'),
        session.heartbeatIntervalMs,
      );
    };

    scheduleIdle = (): void => {
      clearTimer(idleTimer);
      idleTimer = null;
      if (ending || desiredState !== 'active') return;
      const remaining = Math.max(
        0,
        idleTimeoutMs - (Date.now() - lastActivityAt),
      );
      idleTimer = window.setTimeout(() => {
        transition(currentState());
      }, remaining);
    };

    ensureStarted = (): void => {
      if (
        session ||
        startQueued ||
        ending ||
        desiredState !== 'active'
      ) {
        return;
      }
      startQueued = true;
      update({ connection: 'starting', error: null });
      enqueue(async () => {
        try {
          const next = await readingApi.startSession(
            docId,
            clientSessionId,
            'active',
          );
          applySnapshot(next);
          scheduleIdle();
          if (desiredState === 'active') {
            scheduleHeartbeat();
          } else {
            sendHeartbeat(desiredState);
          }
        } catch (error) {
          update({ connection: 'error', error: errorMessage(error) });
          clearTimer(retryTimer);
          retryTimer = window.setTimeout(() => {
            retryTimer = null;
            startQueued = false;
            ensureStarted();
          }, START_RETRY_MS);
        } finally {
          if (!retryTimer) startQueued = false;
        }
      });
    };

    function transition(nextState: ReadingSessionState): void {
      if (ending || nextState === desiredState) {
        if (nextState === 'active') scheduleIdle();
        return;
      }
      desiredState = nextState;
      update({ state: nextState });
      clearScheduled();
      if (nextState === 'active') {
        scheduleIdle();
        if (session) sendHeartbeat('active');
        else ensureStarted();
      } else if (session) {
        sendHeartbeat(nextState);
      }
    }

    const evaluate = (): void => transition(currentState());
    const markActivity = (): void => {
      lastActivityAt = Date.now();
      evaluate();
      scheduleIdle();
    };
    const onVisibilityChange = (): void => evaluate();
    const onFocus = (): void => {
      windowFocused = true;
      lastActivityAt = Date.now();
      evaluate();
    };
    const onBlur = (): void => {
      windowFocused = false;
      evaluate();
    };

    const endOnce = (): void => {
      if (endSent) return;
      endSent = true;
      ending = true;
      clearScheduled();
      clearTimer(retryTimer);
      if (!session) return;
      const endingSession = session;
      void readingApi
        .endSession(endingSession.sessionId, ++sequence, desiredState)
        .then((next) => {
          if (next.eventQueued || next.qualified) {
            markReadingEngagementPending();
          }
        })
        .catch(() => {
          // 服务端会通过心跳过期回收未显式结束的会话。
        });
    };

    const onPageHide = (): void => endOnce();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('scroll', markActivity, { passive: true });
    window.addEventListener('wheel', markActivity, { passive: true });
    window.addEventListener('pointerdown', markActivity, { passive: true });
    window.addEventListener('keydown', markActivity);
    window.addEventListener('touchstart', markActivity, { passive: true });

    bossControllerRef.current = (active: boolean) => {
      boss = active;
      evaluate();
    };

    desiredState = currentState();
    setResult({
      state: desiredState,
      connection: 'inactive',
      effectiveSeconds: 0,
      qualified: false,
      eventQueued: false,
      error: null,
    });
    if (desiredState === 'active') {
      ensureStarted();
      scheduleIdle();
    }

    return () => {
      endOnce();
      disposed = true;
      bossControllerRef.current = null;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('scroll', markActivity);
      window.removeEventListener('wheel', markActivity);
      window.removeEventListener('pointerdown', markActivity);
      window.removeEventListener('keydown', markActivity);
      window.removeEventListener('touchstart', markActivity);
    };
  }, [docId, enabled]);

  useEffect(() => {
    bossControllerRef.current?.(bossActive);
  }, [bossActive]);

  return result;
}
