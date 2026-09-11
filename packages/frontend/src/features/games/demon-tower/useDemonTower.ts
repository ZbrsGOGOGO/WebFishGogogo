import { useCallback, useEffect, useRef, useState } from 'react';
import type { DemonTowerAction, DemonTowerActionInput, DemonTowerActionReceipt, DemonTowerCatalog, DemonTowerOverview } from '@stealth-reader/shared';

import { communityDemonTowerApi, demonTowerErrorCode, demonTowerErrorMessage, demonTowerReadErrorMessage, demonTowerOutcomeUncertain } from '../../../api/community-demon-tower';
import { getCommunitySessionGeneration } from '../../../api/community-http';
import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { beginCommunityWalletObservation, finishCommunityWalletObservation, markCommunityWalletObservationFailed, refreshCommunityWallet } from '../../../app/store/community-wallet-store';

interface Scoped<T> { key: string; value: T }
interface PendingAction { key: string; input: DemonTowerActionInput; status: 'sending' | 'uncertain' }
export interface DemonTowerActionExpectation { expectedVersion: number; serviceDate: string }
export type DemonTowerActionHandler = (action: DemonTowerAction, expectation?: DemonTowerActionExpectation) => Promise<boolean>;

export interface DemonTowerState {
  catalog: DemonTowerCatalog | null;
  overview: DemonTowerOverview | null;
  receipt: DemonTowerActionReceipt | null;
  loading: boolean;
  refreshing: boolean;
  busy: boolean;
  pending: boolean;
  stale: boolean;
  error: string | null;
  ownerId: string | null;
  displayName: string;
  now: number;
  act: DemonTowerActionHandler;
  retry: () => Promise<boolean>;
  refresh: () => Promise<void>;
  dismissReceipt: () => void;
  observeOverview: (next: DemonTowerOverview) => void;
}

export function useDemonTower(): DemonTowerState {
  const user = useCommunityAuthStore((state) => state.user);
  const phase = useCommunityAuthStore((state) => state.phase);
  const ownerId = phase === 'active' ? user?.publicId ?? null : null;
  const generation = getCommunitySessionGeneration();
  const key = `${ownerId ?? 'guest'}:${generation}`;
  const currentKey = useRef(key); currentKey.current = key;
  const alive = useRef(true);
  const [catalog, setCatalog] = useState<DemonTowerCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Scoped<DemonTowerOverview> | null>(null);
  const snapshotRef = useRef<Scoped<DemonTowerOverview> | null>(null);
  const [receipt, setReceipt] = useState<Scoped<DemonTowerActionReceipt> | null>(null);
  const [error, setError] = useState<(Scoped<string> & { source: 'read' | 'action' }) | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const pendingRef = useRef<PendingAction | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const serverClock = useRef({ key, offset: 0 });
  const readRef = useRef<{ key: string; promise: Promise<void>; controller: AbortController } | null>(null);
  const epochRef = useRef(0);

  useEffect(() => { alive.current = true; return () => { alive.current = false; readRef.current?.controller.abort(); }; }, []);
  const isCurrent = useCallback((requestKey: string): boolean => {
    const auth = useCommunityAuthStore.getState();
    return alive.current && currentKey.current === requestKey && getCommunitySessionGeneration() === generation &&
      auth.phase === 'active' && auth.user?.publicId === ownerId;
  }, [generation, ownerId]);

  const apply = useCallback((next: DemonTowerOverview, requestKey: string): void => {
    if (!isCurrent(requestKey)) return;
    const previous = snapshotRef.current?.key === requestKey ? snapshotRef.current.value : null;
    if (previous && (next.profile?.version ?? 0) < (previous.profile?.version ?? 0)) return;
    if (previous && next.world.version < previous.world.version && (next.profile?.version ?? 0) <= (previous.profile?.version ?? 0)) return;
    if (previous && next.serverNow < previous.serverNow && (next.profile?.version ?? 0) <= (previous.profile?.version ?? 0) && next.world.version <= previous.world.version) return;
    // The personal save and shared world advance independently. A receipt may
    // contain a newer character without being the newest world observation.
    let value = previous && next.world.version < previous.world.version ? { ...next, world: previous.world, serverNow: Math.max(previous.serverNow, next.serverNow) } : next;
    const oldRun = previous?.autoExplore; const nextRun = value.autoExplore;
    if (oldRun && (nextRun === undefined || nextRun && (oldRun.id === nextRun.id && oldRun.version > nextRun.version || oldRun.createdAt > nextRun.createdAt))) value = { ...value, autoExplore: oldRun };
    const state = { key: requestKey, value };
    snapshotRef.current = state; setSnapshot(state);
    serverClock.current = { key: requestKey, offset: value.serverNow - Date.now() };
    setStale(false);
  }, [isCurrent]);

  const refresh = useCallback((): Promise<void> => {
    if (!ownerId || !isCurrent(key) || pendingRef.current?.status === 'sending') return Promise.resolve();
    if (readRef.current?.key === key) return readRef.current.promise;
    const controller = new AbortController(); const readEpoch = epochRef.current;
    setRefreshing(true);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const promise = (async () => {
      timeout = setTimeout(() => controller.abort(), 25_000);
      try {
        const data = await communityDemonTowerApi.overview(controller.signal);
        if (isCurrent(key) && readEpoch === epochRef.current) { apply(data, key); if (!pendingRef.current) setError((previous) => previous?.source === 'action' ? previous : null); }
      } catch (reason) {
        if (isCurrent(key) && readEpoch === epochRef.current) { setStale(true); if (!pendingRef.current) setError({ key, value: demonTowerReadErrorMessage(reason, snapshotRef.current?.key === key), source: 'read' }); }
      } finally {
        if (timeout) clearTimeout(timeout);
        if (readRef.current?.controller === controller) { readRef.current = null; if (isCurrent(key)) setRefreshing(false); }
      }
    })();
    readRef.current = { key, promise, controller };
    return promise;
  }, [ownerId, isCurrent, key, apply]);

  useEffect(() => {
    let active = true; const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    void communityDemonTowerApi.catalog(controller.signal)
      .then((next) => { if (active) { setCatalog(next); setCatalogError(null); } })
      .catch((reason) => { if (active) setCatalogError(controller.signal.aborted ? '规则资料读取超时，请同步重试。' : demonTowerReadErrorMessage(reason)); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, []);

  const manualCatalogRead = useRef<Promise<void> | null>(null);
  const manualRefresh = useCallback((): Promise<void> => {
    if (manualCatalogRead.current) return manualCatalogRead.current;
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 25_000);
    const promise = (async () => {
      try {
        const next = await communityDemonTowerApi.catalog(controller.signal);
        if (!alive.current) return;
        setCatalog(next); setCatalogError(null);
        // First activation starts the scoped poll effect; do not race it with another read.
        if (catalog?.enabled && next.enabled) await refresh();
      } catch (reason) { if (alive.current) setCatalogError(controller.signal.aborted ? '规则资料读取超时，请同步重试。' : demonTowerReadErrorMessage(reason)); }
      finally { clearTimeout(timeout); manualCatalogRead.current = null; }
    })();
    manualCatalogRead.current = promise;
    return promise;
  }, [catalog?.enabled, refresh]);

  useEffect(() => {
    epochRef.current += 1; readRef.current?.controller.abort(); readRef.current = null;
    snapshotRef.current = null; pendingRef.current = null; setSnapshot(null); setPending(null); setReceipt(null); setError(null); setStale(false); setRefreshing(false);
    serverClock.current = { key, offset: 0 };
    if (!ownerId || catalog?.enabled !== true) return undefined;
    let active = true; let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (): Promise<void> => {
      await refresh();
      if (active && isCurrent(key)) timer = setTimeout(() => { void poll(); }, document.hidden ? 15_000 : 5000);
    };
    void poll();
    const visible = (): void => { if (!document.hidden && active) void refresh(); };
    window.addEventListener('focus', visible); window.addEventListener('online', visible); document.addEventListener('visibilitychange', visible);
    return () => { active = false; if (timer) clearTimeout(timer); readRef.current?.controller.abort(); window.removeEventListener('focus', visible); window.removeEventListener('online', visible); document.removeEventListener('visibilitychange', visible); };
  }, [key, ownerId, catalog?.enabled, refresh, isCurrent]);

  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);

  const send = useCallback(async (operation: PendingAction): Promise<boolean> => {
    if (!isCurrent(operation.key) || pendingRef.current?.status === 'sending') return false;
    epochRef.current += 1; readRef.current?.controller.abort(); readRef.current = null; setRefreshing(false);
    const inFlight = { ...operation, status: 'sending' as const }; pendingRef.current = inFlight; setPending(inFlight); setError(null); setReceipt(null);
    const observation = beginCommunityWalletObservation('mutation');
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 30_000);
    let successful = false;
    try {
      const result = await communityDemonTowerApi.action(operation.input, controller.signal);
      if (!isCurrent(operation.key)) return false;
      apply(result.overview, operation.key); setReceipt({ key: operation.key, value: result });
      pendingRef.current = null; setPending(null); setError(null); successful = true;
      return true;
    } catch (reason) {
      if (!isCurrent(operation.key)) return false;
      markCommunityWalletObservationFailed(observation);
      if (demonTowerOutcomeUncertain(reason)) { const uncertain = { ...operation, status: 'uncertain' as const }; pendingRef.current = uncertain; setPending(uncertain); }
      else { pendingRef.current = null; setPending(null); }
      const code = demonTowerErrorCode(reason);
      if (code === 'DEMON_TOWER_DISABLED') setCatalog((previous) => previous ? { ...previous, enabled: false } : previous);
      if (code === 'COMMUNITY_WRITES_DISABLED' && snapshotRef.current?.key === operation.key) apply({ ...snapshotRef.current.value, writesEnabled: false }, operation.key);
      setError({ key: operation.key, value: demonTowerErrorMessage(reason), source: 'action' }); setStale(true);
      return false;
    } finally {
      clearTimeout(timeout); finishCommunityWalletObservation(observation);
      if (isCurrent(operation.key)) {
        // A receipt can be an idempotent replay. Never publish its historical wallet field.
        void refreshCommunityWallet();
        if (!successful && !pendingRef.current) void refresh();
      }
    }
  }, [isCurrent, apply, refresh]);

  const act = useCallback((action: DemonTowerAction, expectation?: DemonTowerActionExpectation): Promise<boolean> => {
    const current = snapshotRef.current;
    if (!ownerId || !isCurrent(key) || pendingRef.current || current?.key !== key || !current.value.writesEnabled || catalog?.enabled !== true) return Promise.resolve(false);
    if (current.value.autoExplore?.status === 'running' || (action.kind === 'enroll' ? current.value.profile !== null : !current.value.profile?.availableActions.includes(action.kind))) return Promise.resolve(false);
    if (expectation) {
      const now = Date.now() + (serverClock.current.key === key ? serverClock.current.offset : 0);
      const today = new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
      if (expectation.expectedVersion !== current.value.profile?.version || expectation.serviceDate !== today ||
        expectation.serviceDate !== (current.value.profile?.provisions?.serviceDate ?? current.value.profile?.daily.serviceDate)) {
        setError({ key, source: 'action', value: '确认后档案或自然日已变化，请关闭确认窗口并同步后重试。' });
        return Promise.resolve(false);
      }
    }
    return send({ key, status: 'uncertain', input: { ...action, requestId: crypto.randomUUID(), expectedVersion: current.value.profile?.version ?? 0 } });
  }, [ownerId, isCurrent, key, catalog?.enabled, send]);
  const retry = useCallback((): Promise<boolean> => {
    const operation = pendingRef.current;
    return operation?.key === key && operation.status === 'uncertain' ? send(operation) : Promise.resolve(false);
  }, [key, send]);

  const overview = snapshot?.key === key ? snapshot.value : null;
  const observeOverview = useCallback((next: DemonTowerOverview): void => {
    if (!isCurrent(key)) return;
    const previous = snapshotRef.current?.key === key ? snapshotRef.current.value : null;
    apply(next, key);
    // Auto-run receipts contain cumulative grants, not a new wallet balance.
    if ((next.profile?.version ?? 0) > (previous?.profile?.version ?? 0)) void refreshCommunityWallet();
  }, [apply, isCurrent, key]);
  return {
    catalog, overview, receipt: receipt?.key === key ? receipt.value : null,
    loading: !catalog && !catalogError || Boolean(ownerId && catalog?.enabled && !overview && !error), refreshing,
    busy: pending?.key === key && pending.status === 'sending', pending: pending?.key === key,
    stale, error: error?.key === key ? error.value : catalogError, ownerId,
    displayName: ownerId ? user?.displayName ?? '寻道者' : '寻道者',
    now: clock + (serverClock.current.key === key ? serverClock.current.offset : 0),
    act, retry, refresh: manualRefresh, dismissReceipt: () => setReceipt(null), observeOverview,
  };
}
