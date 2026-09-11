import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { OfficeHubOverview, OfficeReliefReceipt } from '@stealth-reader/shared';
import { officeHubApi, officeBossError } from '../../api/office-hub';
import { CommunityApiError, getCommunitySessionGeneration } from '../../api/community-http';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';

type Request = { action: string; data: Record<string, unknown>; requestId: string };
type State = {
  view: OfficeHubOverview | null;
  error: string;
  busy: boolean;
  pending: Request | null;
  receipt: OfficeReliefReceipt | null;
};
type Entry = { owner: string; generation: number; state: State; readSerial: number; listeners: Set<() => void> };
// Memory only: route changes keep an uncertain request, explicit login/logout
// boundaries never carry it to another session. GETs never acknowledge a write.
const entries = new Map<string, Entry>();
function getEntry(owner: string, generation: number): Entry {
  const key = `${owner}:${generation}`;
  for (const previous of entries.keys()) if (previous !== key) entries.delete(previous);
  let entry = entries.get(key);
  if (!entry) {
    entry = { owner, generation, readSerial: 0, listeners: new Set(), state: { view: null, error: '', busy: false, pending: null, receipt: null } };
    entries.set(key, entry);
  }
  return entry;
}
function current(entry: Entry): boolean {
  const auth = useCommunityAuthStore.getState();
  return entry.generation === getCommunitySessionGeneration() && auth.user?.publicId === entry.owner && auth.phase === 'active';
}
function publish(entry: Entry, patch: Partial<State>): void {
  if (!current(entry)) return;
  const previous = entry.state.view?.relief;
  if (patch.view?.relief && previous && patch.view.relief.version < previous.version) {
    patch = { ...patch, view: { ...patch.view, relief: previous } };
  }
  entry.state = { ...entry.state, ...patch };
  entry.listeners.forEach(listener => listener());
}
function definiteRejection(error: unknown): boolean {
  return error instanceof CommunityApiError && [400, 403, 404, 409, 422, 429].includes(error.status);
}
async function read(entry: Entry): Promise<void> {
  if (!current(entry) || entry.state.busy) return;
  const serial = ++entry.readSerial;
  try {
    const view = await officeHubApi.overview();
    if (serial !== entry.readSerial) return;
    // Preserve a pending write and its warning even when the latest balances load.
    publish(entry, { view, ...(entry.state.pending ? {} : { error: '' }) });
  } catch (error) {
    if (serial === entry.readSerial && !entry.state.pending) publish(entry, { error: officeBossError(error) });
  }
}
async function send(entry: Entry, request: Request): Promise<boolean> {
  if (!current(entry) || entry.state.busy) return false;
  ++entry.readSerial;
  publish(entry, { busy: true, pending: request, error: '' });
  try {
    const view = await officeHubApi.action(request.action, request.data, request.requestId);
    if (!current(entry)) return false;
    const receipt = view.reliefReceipt;
    if (request.action.startsWith('relief_') && (!receipt || receipt.requestId !== request.requestId)) {
      publish(entry, { view, error: '服务器回执尚未匹配。请核对原请求，不要重新消耗机会。' });
      return false;
    }
    publish(entry, { view, pending: null, receipt: receipt ?? null, error: '' });
    return true;
  } catch (error) {
    if (!current(entry)) return false;
    if (definiteRejection(error)) {
      publish(entry, { pending: null, error: `${officeBossError(error)}。本次未提交，请刷新核对后重新确认。` });
    } else {
      publish(entry, { error: `${officeBossError(error)}。结果尚未确认，请只核对原请求；不会另扣一次机会。` });
    }
    return false;
  } finally {
    publish(entry, { busy: false });
  }
}

export function useOfficeBoss(owner: string, generation: number, suspended: boolean) {
  const entry = getEntry(owner, generation);
  const subscribe = useCallback((listener: () => void) => { entry.listeners.add(listener); return () => { entry.listeners.delete(listener); }; }, [entry]);
  const snapshot = useCallback(() => entry.state, [entry]);
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    void read(entry);
    const timer = window.setInterval(() => { if (!document.hidden && !suspended) void read(entry); }, 15000);
    return () => window.clearInterval(timer);
  }, [entry, suspended]);
  const refresh = useCallback(() => read(entry), [entry]);
  const command = useCallback((action: string, data: Record<string, unknown> = {}): Promise<boolean> => {
    if (!current(entry) || entry.state.busy || entry.state.pending) return Promise.resolve(false);
    return send(entry, { action, data: { ...data }, requestId: crypto.randomUUID() });
  }, [entry]);
  const retry = useCallback((): Promise<boolean> => entry.state.pending ? send(entry, entry.state.pending) : Promise.resolve(false), [entry]);
  return { ...state, command, retry, refresh };
}
