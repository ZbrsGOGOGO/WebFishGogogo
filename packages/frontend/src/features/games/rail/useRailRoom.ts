import { useCallback, useEffect, useRef, useState } from 'react';
import type { RailActionInput, RailRoomView } from '@stealth-reader/shared';

import { CommunityApiError, getCommunitySessionGeneration } from '../../../api/community-http';
import { communityRailApi, railErrorMessage } from '../../../api/community-rail';
import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
import type { RailAction } from './RailGameSurface';

type RoomChange = { kind: 'ready'; ready: boolean } | { kind: 'start' | 'leave' } | { kind: 'bots'; count: number } | { kind: 'password'; password: string };

export function useRailRoom(roomId: string) {
  const userId = useCommunityAuthStore((state) => state.phase === 'active' ? state.user?.publicId ?? null : null);
  const generation = getCommunitySessionGeneration();
  const key = `${userId ?? 'guest'}:${generation}:${roomId}`;
  const latestKey = useRef(key); latestKey.current = key;
  const mounted = useRef(true);
  const roomRef = useRef<RailRoomView | null>(null);
  const failed = useRef<RailActionInput | null>(null);
  const writeBusy = useRef(false);
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const queueSize = useRef(0);
  const [snapshot, setSnapshot] = useState<{ key: string; room: RailRoomView } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = useCallback((requestKey: string): boolean => mounted.current && latestKey.current === requestKey && getCommunitySessionGeneration() === generation && useCommunityAuthStore.getState().phase === 'active' && useCommunityAuthStore.getState().user?.publicId === userId, [generation, userId]);
  const accept = useCallback((room: RailRoomView, requestKey: string): void => {
    if (!current(requestKey) || room.id !== roomId) return;
    const old = roomRef.current;
    if (old && (room.version < old.version || (room.version === old.version && Date.parse(room.serverNow) < Date.parse(old.serverNow)))) return;
    roomRef.current = room; setSnapshot({ key: requestKey, room });
  }, [current, roomId]);
  useEffect(() => {
    roomRef.current = null; failed.current = null; writeBusy.current = false; queue.current = Promise.resolve(true); queueSize.current = 0;
    setSnapshot(null); setError(null); setReadError(null); setPending(false); setUncertain(false);
    if (!userId || !roomId) return undefined;
    let active = true; let timer: ReturnType<typeof setTimeout> | undefined; let controller: AbortController | undefined;
    const poll = async (): Promise<void> => {
      if (!active || !current(key)) return;
      controller = new AbortController();
      try { const room = await communityRailApi.get(roomId, controller.signal); if (active && current(key)) { accept(room, key); setReadError(null); } }
      catch (reason) { if (active && current(key) && !controller.signal.aborted) setReadError(railErrorMessage(reason)); }
      finally { if (active && current(key)) timer = setTimeout(() => { void poll(); }, document.hidden ? 4000 : 1000); }
    };
    void poll();
    return () => { active = false; controller?.abort(); if (timer) clearTimeout(timer); };
  }, [key, userId, roomId, current, accept]);

  const execute = useCallback(async (input: RailActionInput, requestKey: string): Promise<boolean> => {
    if (!current(requestKey)) return false;
    try {
      const room = await communityRailApi.action(roomId, input);
      if (!current(requestKey)) return false;
      accept(room, requestKey); failed.current = null; setUncertain(false); setError(null); return true;
    } catch (reason) {
      if (!current(requestKey)) return false;
      if (!(reason instanceof CommunityApiError) || reason.status === 0 || reason.status >= 500) {
        failed.current = input; setUncertain(true); setError('这次操作是否送达仍待确认。请重试刚才操作；会使用同一编号，不会重复出牌或评分。');
      } else { failed.current = null; setUncertain(false); setError(railErrorMessage(reason)); }
      return false;
    }
  }, [accept, current, roomId]);
  const action = useCallback((input: RailAction): Promise<boolean> => {
    if (!current(key) || failed.current || queueSize.current >= 3 || writeBusy.current) return Promise.resolve(false);
    queueSize.current += 1;
    const request = queue.current.then(async () => {
      const room = roomRef.current;
      if (!current(key) || failed.current || !room || room.me.left || room.me.role !== 'participant' || room.status !== 'running') return false;
      return execute({ ...input, actionId: crypto.randomUUID(), sequence: room.me.nextSequence }, key);
    }).finally(() => { if (current(key)) queueSize.current = Math.max(0, queueSize.current - 1); });
    queue.current = request; return request;
  }, [current, execute, key]);
  const retry = useCallback(async (): Promise<void> => {
    if (!current(key) || writeBusy.current || !failed.current) return;
    writeBusy.current = true; setPending(true);
    try { await execute(failed.current, key); }
    finally { if (current(key)) { writeBusy.current = false; setPending(false); } }
  }, [current, execute, key]);
  const change = useCallback(async (input: RoomChange): Promise<boolean> => {
    const room = roomRef.current;
    if (!current(key) || writeBusy.current || queueSize.current || !room || (failed.current && input.kind !== 'leave')) return false;
    writeBusy.current = true; setPending(true); setError(null);
    try {
      const result = input.kind === 'ready' ? await communityRailApi.ready(roomId, input.ready)
        : input.kind === 'start' ? await communityRailApi.start(roomId)
          : input.kind === 'bots' ? await communityRailApi.bots(roomId, { count: input.count, expectedVersion: room.version })
            : input.kind === 'password' ? await communityRailApi.password(roomId, input.password, room.version)
              : await communityRailApi.leave(roomId);
      if (!current(key)) return false;
      accept(result, key); return true;
    } catch (reason) { if (current(key)) setError(railErrorMessage(reason)); return false; }
    finally { if (current(key)) { writeBusy.current = false; setPending(false); } }
  }, [accept, current, key, roomId]);
  return { room: snapshot?.key === key ? snapshot.room : null, error: error ?? readError, pending, uncertain, action, retry, change, sessionKey: key };
}
