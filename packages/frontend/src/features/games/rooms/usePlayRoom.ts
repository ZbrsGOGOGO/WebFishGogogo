import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArcadeGameAction, PlayActionInput, PlayRoomView } from '@stealth-reader/shared';

import { communityGameErrorMessage, communityGameRoomsApi, createPlayRequestId } from '../../../api/community-game-rooms';
import { CommunityApiError, getCommunitySessionGeneration } from '../../../api/community-http';
import { useCommunityAuthStore } from '../../../app/store/community-auth-store';

export function usePlayRoom(roomId: string) {
  const userId = useCommunityAuthStore((state) => state.phase === 'active' ? state.user?.publicId ?? null : null);
  const generation = getCommunitySessionGeneration();
  const sessionKey = `${userId ?? 'guest'}:${generation}:${roomId}`;
  const latestKey = useRef(sessionKey);
  latestKey.current = sessionKey;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [snapshot, setSnapshot] = useState<{ key: string; room: PlayRoomView } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState<PlayActionInput | null>(null);
  const roomRef = useRef<PlayRoomView | null>(null);
  const failedAction = useRef<PlayActionInput | null>(null);
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const queuedCount = useRef(0);

  const isCurrent = useCallback((key: string): boolean => mounted.current && latestKey.current === key && getCommunitySessionGeneration() === generation && useCommunityAuthStore.getState().phase === 'active' && useCommunityAuthStore.getState().user?.publicId === userId, [generation, userId]);
  const accept = useCallback((room: PlayRoomView, key: string): void => {
    if (!isCurrent(key) || room.id !== roomId) return;
    const previous = roomRef.current;
    if (previous && (room.version < previous.version || (room.version === previous.version && Date.parse(room.serverNow) < Date.parse(previous.serverNow)))) return;
    roomRef.current = room;
    setSnapshot({ key, room });
  }, [isCurrent, roomId]);

  useEffect(() => {
    roomRef.current = null; failedAction.current = null; queue.current = Promise.resolve(true); queuedCount.current = 0;
    setSnapshot(null); setError(null); setReadError(null); setLoading(Boolean(userId)); setPending(false); setUncertain(null);
    if (!userId || !roomId) return undefined;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;
    const poll = async (): Promise<void> => {
      if (!active || !isCurrent(sessionKey)) return;
      controller = new AbortController();
      try {
        const room = await communityGameRoomsApi.get(roomId, controller.signal);
        if (!active || !isCurrent(sessionKey)) return;
        accept(room, sessionKey);
        setReadError(null);
      } catch (reason) {
        if (active && isCurrent(sessionKey) && !controller.signal.aborted) setReadError(communityGameErrorMessage(reason));
      } finally {
        if (active && isCurrent(sessionKey)) {
          setLoading(false);
          timer = setTimeout(() => { void poll(); }, document.hidden ? 4000 : roomRef.current?.status === 'running' ? 300 : 1600);
        }
      }
    };
    void poll();
    return () => { active = false; controller?.abort(); if (timer) clearTimeout(timer); };
  }, [userId, roomId, sessionKey, isCurrent, accept]);

  const execute = useCallback(async (input: PlayActionInput, key: string): Promise<boolean> => {
    if (!isCurrent(key)) return false;
    try {
      const result = await communityGameRoomsApi.action(roomId, input);
      if (!isCurrent(key)) return false;
      accept(result, key); failedAction.current = null; setUncertain(null); setError(null);
      return true;
    } catch (reason) {
      if (!isCurrent(key)) return false;
      const unknown = !(reason instanceof CommunityApiError) || reason.status === 0 || reason.status >= 500;
      if (unknown) {
        failedAction.current = input; setUncertain(input);
        setError('这次操作的送达状态待确认。请点击“重试刚才操作”，系统会使用同一个操作编号，不会重复计分。');
      } else {
        if (failedAction.current?.actionId === input.actionId) { failedAction.current = null; setUncertain(null); }
        setError(communityGameErrorMessage(reason));
      }
      return false;
    }
  }, [accept, isCurrent, roomId]);

  const action = useCallback((input: ArcadeGameAction): Promise<boolean> => {
    if (!userId || !isCurrent(sessionKey) || failedAction.current || queuedCount.current >= 6) return Promise.resolve(false);
    const key = sessionKey;
    queuedCount.current += 1;
    const request = queue.current.then(async () => {
      if (!isCurrent(key) || failedAction.current || !roomRef.current || roomRef.current.status !== 'running' || roomRef.current.me.left) return false;
      return execute({ ...input, actionId: createPlayRequestId(), sequence: roomRef.current.me.nextSequence }, key);
    }).finally(() => { if (isCurrent(key)) queuedCount.current = Math.max(0, queuedCount.current - 1); });
    queue.current = request;
    return request;
  }, [execute, isCurrent, sessionKey, userId]);

  const retryAction = useCallback(async (): Promise<void> => {
    const input = failedAction.current;
    if (!input || pending || !isCurrent(sessionKey)) return;
    setPending(true);
    try { await execute(input, sessionKey); }
    finally { if (isCurrent(sessionKey)) setPending(false); }
  }, [execute, isCurrent, pending, sessionKey]);

  const change = useCallback(async (kind: 'ready' | 'start' | 'leave', ready?: boolean): Promise<boolean> => {
    if (pending || !isCurrent(sessionKey)) return false;
    setPending(true); setError(null);
    try {
      const result = kind === 'ready' ? await communityGameRoomsApi.ready(roomId, Boolean(ready)) : kind === 'start' ? await communityGameRoomsApi.start(roomId) : await communityGameRoomsApi.leave(roomId);
      if (!isCurrent(sessionKey)) return false;
      accept(result, sessionKey); return true;
    } catch (reason) { if (isCurrent(sessionKey)) setError(communityGameErrorMessage(reason)); return false; }
    finally { if (isCurrent(sessionKey)) setPending(false); }
  }, [accept, isCurrent, pending, roomId, sessionKey]);

  const setPassword = useCallback(async (password: string): Promise<boolean> => {
    if (pending || !isCurrent(sessionKey) || !roomRef.current) return false;
    const expectedVersion = roomRef.current.version;
    setPending(true); setError(null);
    try {
      const result = await communityGameRoomsApi.setPassword(roomId, { password, expectedVersion });
      if (!isCurrent(sessionKey)) return false;
      accept(result, sessionKey); return true;
    } catch (reason) { if (isCurrent(sessionKey)) setError(communityGameErrorMessage(reason)); return false; }
    finally { if (isCurrent(sessionKey)) setPending(false); }
  }, [accept, isCurrent, pending, roomId, sessionKey]);

  return { room: snapshot?.key === sessionKey ? snapshot.room : null, loading, error: error ?? readError, pending, uncertain: Boolean(uncertain), action, retryAction, change, setPassword };
}
