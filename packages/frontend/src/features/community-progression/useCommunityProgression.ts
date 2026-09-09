import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommunityProgressionCatalog, CommunityProgressionView, CommunityTitleInput } from '@stealth-reader/shared';
import { communityProgressionApi, progressionErrorMessage, progressionUncertain } from '../../api/community-progression';
import { getCommunitySessionGeneration } from '../../api/community-http';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';

export function useCommunityProgression() {
  const owner = useCommunityAuthStore((state) => state.user?.publicId);
  const generation = getCommunitySessionGeneration();
  const scope = `${owner}:${generation}`;
  const alive = useRef(true); const currentScope = useRef(scope); currentScope.current = scope;
  const [catalog, setCatalog] = useState<CommunityProgressionCatalog | null>(null);
  const [data, setData] = useState<{ scope: string; value: CommunityProgressionView } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<CommunityTitleInput | null>(null);
  const pendingRef = useRef<CommunityTitleInput | null>(null);
  const lock = useRef(false); const epoch = useRef(0);
  const controllers = useRef(new Set<AbortController>());
  const current = useCallback(() => alive.current && currentScope.current === scope && getCommunitySessionGeneration() === generation && useCommunityAuthStore.getState().phase === 'active' && useCommunityAuthStore.getState().user?.publicId === owner, [scope, generation, owner]);
  const apply = useCallback((next: CommunityProgressionView) => {
    if (!current()) return;
    setData((previous) => previous?.scope === scope && (previous.value.presentation.version > next.presentation.version || (previous.value.presentation.version === next.presentation.version && previous.value.serverNow > next.serverNow)) ? previous : { scope, value: next });
  }, [current, scope]);
  const request = useCallback(async <T,>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController(); controllers.current.add(controller);
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try { return await operation(controller.signal); } finally { clearTimeout(timeout); controllers.current.delete(controller); }
  }, []);
  const reload = useCallback(async (): Promise<void> => {
    if (!owner || !current() || lock.current) return;
    const readEpoch = ++epoch.current; setLoading(true);
    try {
      const nextCatalog = await request(communityProgressionApi.catalog);
      if (!current() || readEpoch !== epoch.current) return;
      setCatalog(nextCatalog);
      if (nextCatalog.enabled) {
        const next = await request(communityProgressionApi.me);
        if (!current() || readEpoch !== epoch.current) return;
        apply(next);
      }
      if (!pendingRef.current) setError(null);
    } catch (reason) { if (current() && readEpoch === epoch.current) setError(progressionErrorMessage(reason)); }
    finally { if (current() && readEpoch === epoch.current) setLoading(false); }
  }, [owner, current, request, apply]);
  useEffect(() => {
    alive.current = true; lock.current = false; pendingRef.current = null;
    setPending(null); setData(null); setError(null); setNotice(null); setBusy(false);
    void reload();
    return () => { alive.current = false; epoch.current += 1; controllers.current.forEach((item) => item.abort()); };
  }, [scope, reload]);
  const sendTitle = async (input: CommunityTitleInput): Promise<void> => {
    if (!current() || lock.current) return;
    lock.current = true; epoch.current += 1; setLoading(false); setBusy(true); setError(null); setNotice(null);
    pendingRef.current = input; setPending(input);
    try {
      const result = await request((signal) => communityProgressionApi.title(input, signal));
      if (!current()) return;
      apply(result.overview); pendingRef.current = null; setPending(null);
      setNotice(result.replayed ? '原佩戴操作已确认，没有重复处理。' : input.titleKey ? '称号已佩戴，重新加载个人页与聊天记录可看到当前称号。' : '称号已卸下，重新加载记录可看到最新状态。');
    } catch (reason) {
      if (!current()) return;
      if (!progressionUncertain(reason)) { pendingRef.current = null; setPending(null); }
      setError(progressionErrorMessage(reason, true));
    } finally { if (current()) { lock.current = false; setBusy(false); } }
  };
  const overview = data?.scope === scope ? data.value : null;
  return { catalog, overview, error, notice, busy, loading, pending, reload,
    equip: async (titleKey: string | null): Promise<void> => {
      if (!overview?.writesEnabled || !overview.enabled || pendingRef.current || lock.current || !current()) return;
      await sendTitle({ requestId: crypto.randomUUID(), expectedVersion: overview.presentation.version, titleKey });
    },
    retry: async (): Promise<void> => { if (pendingRef.current) await sendTitle(pendingRef.current); },
    sync: async (): Promise<void> => {
      if (!current() || lock.current || pendingRef.current || !overview?.writesEnabled) return;
      lock.current = true; epoch.current += 1; setLoading(false); setBusy(true); setNotice(null); setError(null);
      try {
        const result = await request(communityProgressionApi.refresh);
        if (!current()) return;
        apply(result.overview); setNotice(result.newlyUnlocked.length ? `已解锁 ${result.newlyUnlocked.length} 项成就，无需逐个领奖。` : '成就进度已同步，暂时没有新增解锁。');
      } catch (reason) { if (current()) setError(progressionErrorMessage(reason)); }
      finally { if (current()) { lock.current = false; setBusy(false); } }
    },
  };
}
