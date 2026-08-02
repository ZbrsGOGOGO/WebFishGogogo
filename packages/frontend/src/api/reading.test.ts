import { beforeEach, describe, expect, it, vi } from 'vitest';

import { http } from './http';
import {
  endReadingSession,
  heartbeatReadingSession,
  startReadingSession,
} from './reading';

describe('trusted reading session API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('starts a session with the document, client id and active state', async () => {
    const post = vi.spyOn(http, 'post').mockResolvedValue({
      id: 'session-1',
      state: 'active',
      heartbeatIntervalSeconds: 12,
      idleTimeoutSeconds: 90,
      effectiveSeconds: 8,
      qualified: false,
      eventQueued: true,
    });

    await expect(
      startReadingSession('doc/中文', 'client-1', 'active'),
    ).resolves.toEqual({
      sessionId: 'session-1',
      state: 'active',
      heartbeatIntervalMs: 12_000,
      idleTimeoutMs: 90_000,
      effectiveSeconds: 8,
      qualified: false,
      eventQueued: true,
    });
    expect(post).toHaveBeenCalledWith('/v1/reading/sessions', {
      documentId: 'doc/中文',
      clientSessionId: 'client-1',
      state: 'active',
    });
  });

  it('sends monotonic heartbeat data and normalizes millisecond values', async () => {
    const post = vi.spyOn(http, 'post').mockResolvedValue({
      sessionId: 'session-1',
      state: 'hidden',
      heartbeatIntervalMs: 20_000,
      idleTimeoutMs: 180_000,
      effectiveSeconds: 30,
      qualified: true,
      eventQueued: false,
    });

    await expect(
      heartbeatReadingSession('session/1', 3, 'hidden'),
    ).resolves.toMatchObject({
      sessionId: 'session-1',
      state: 'hidden',
      heartbeatIntervalMs: 20_000,
      idleTimeoutMs: 180_000,
      effectiveSeconds: 30,
      qualified: true,
    });
    expect(post).toHaveBeenCalledWith(
      '/v1/reading/sessions/session%2F1/heartbeat',
      { sequence: 3, state: 'hidden' },
    );
  });

  it('uses a keepalive request when ending and applies safe defaults', async () => {
    const post = vi.spyOn(http, 'post').mockResolvedValue({
      sessionId: 'session-1',
      state: 'boss',
    });

    await expect(
      endReadingSession('session 1', 4, 'boss'),
    ).resolves.toEqual({
      sessionId: 'session-1',
      state: 'boss',
      heartbeatIntervalMs: 15_000,
      idleTimeoutMs: 120_000,
      effectiveSeconds: 0,
      qualified: false,
      eventQueued: false,
    });
    expect(post).toHaveBeenCalledWith(
      '/v1/reading/sessions/session%201/end',
      { sequence: 4, state: 'boss' },
      { keepalive: true },
    );
  });

  it('rejects malformed session responses instead of running untracked', async () => {
    vi.spyOn(http, 'post').mockResolvedValue({
      state: 'active',
      heartbeatIntervalMs: -1,
    });

    await expect(
      startReadingSession('doc-1', 'client-1', 'active'),
    ).rejects.toThrow('阅读会话响应缺少 sessionId');
  });
});
