import { create } from 'zustand';

import { communityFarmApi, type CommunityFarmOverview } from '../../api/community-farm';
import { getCommunitySessionGeneration } from '../../api/community-http';
import { useCommunityAuthStore } from './community-auth-store';

type WalletStatus = 'idle' | 'loading' | 'ready' | 'stale' | 'error';
interface CommunityWalletState {
  ownerId: string | null;
  sessionGeneration: number;
  officeCoins: number | null;
  serverTime: string | null;
  status: WalletStatus;
}
export interface CommunityWalletObservation {
  ownerId: string;
  sessionGeneration: number;
  requestId: number;
  mutationEpoch: number;
  kind: 'read' | 'mutation';
  startedDuringMutation: boolean;
}

// This cache is memory-only. A guest/demo balance is never an account asset.
export const useCommunityWalletStore = create<CommunityWalletState>(() => ({
  ownerId: null, sessionGeneration: -1, officeCoins: null, serverTime: null, status: 'idle',
}));
let requestSequence = 0;
let appliedRequest = 0;
let mutationEpoch = 0;
const pendingMutations = new Set<number>();
let pendingRefresh: { ownerId: string; generation: number; promise: Promise<void> } | null = null;

export function synchronizeCommunityWalletSession(): void {
  const auth = useCommunityAuthStore.getState();
  const ownerId = auth.phase === 'active' ? auth.user?.publicId ?? null : null;
  const generation = getCommunitySessionGeneration();
  const current = useCommunityWalletStore.getState();
  if (current.ownerId === ownerId && current.sessionGeneration === generation) return;
  mutationEpoch += 1;
  appliedRequest = ++requestSequence;
  pendingMutations.clear();
  pendingRefresh = null;
  useCommunityWalletStore.setState({
    ownerId, sessionGeneration: generation, officeCoins: null, serverTime: null, status: 'idle',
  });
}

useCommunityAuthStore.subscribe(synchronizeCommunityWalletSession);

export function beginCommunityWalletObservation(
  kind: CommunityWalletObservation['kind'] = 'read',
): CommunityWalletObservation | null {
  synchronizeCommunityWalletSession();
  const current = useCommunityWalletStore.getState();
  if (!current.ownerId) return null;
  const startedDuringMutation = pendingMutations.size > 0;
  const requestId = ++requestSequence;
  if (kind === 'mutation') {
    mutationEpoch += 1;
    pendingMutations.add(requestId);
    pendingRefresh = null;
  }
  return {
    ownerId: current.ownerId, sessionGeneration: current.sessionGeneration,
    requestId, mutationEpoch, kind, startedDuringMutation,
  };
}

function belongsToCurrentSession(observation: CommunityWalletObservation): boolean {
  synchronizeCommunityWalletSession();
  const current = useCommunityWalletStore.getState();
  return current.ownerId === observation.ownerId &&
    current.sessionGeneration === observation.sessionGeneration;
}

export function publishCommunityWalletOverview(
  observation: CommunityWalletObservation | null,
  overview: CommunityFarmOverview,
): void {
  if (!observation || !belongsToCurrentSession(observation)) return;
  if (observation.mutationEpoch !== mutationEpoch || observation.requestId < appliedRequest) return;
  if (observation.kind === 'read' && (observation.startedDuringMutation || pendingMutations.size > 0)) return;
  const balance = overview.growth.officeCoins;
  const timestamp = Date.parse(overview.serverTime);
  if (!Number.isSafeInteger(balance) || balance < 0 || !Number.isFinite(timestamp)) {
    markCommunityWalletObservationFailed(observation);
    return;
  }
  const current = useCommunityWalletStore.getState();
  if (current.serverTime && timestamp < Date.parse(current.serverTime)) {
    // An idempotency replay is a historical receipt, not a fresh balance read.
    markCommunityWalletObservationFailed(observation);
    return;
  }
  appliedRequest = observation.requestId;
  useCommunityWalletStore.setState({ officeCoins: balance, serverTime: overview.serverTime, status: 'ready' });
}

export function markCommunityWalletObservationFailed(observation: CommunityWalletObservation | null): void {
  if (!observation || !belongsToCurrentSession(observation) || observation.mutationEpoch !== mutationEpoch || observation.requestId < appliedRequest) return;
  useCommunityWalletStore.setState((state) => ({ status: state.officeCoins === null ? 'error' : 'stale' }));
}

export function finishCommunityWalletObservation(observation: CommunityWalletObservation | null): void {
  if (!observation || !belongsToCurrentSession(observation) || observation.kind !== 'mutation') return;
  if (pendingMutations.delete(observation.requestId) && observation.mutationEpoch === mutationEpoch) {
    // Reads started before/during a purchase must not restore its old balance.
    mutationEpoch += 1;
  }
}

export function refreshCommunityWallet(): Promise<void> {
  synchronizeCommunityWalletSession();
  const current = useCommunityWalletStore.getState();
  if (!current.ownerId || pendingMutations.size > 0) return Promise.resolve();
  if (pendingRefresh?.ownerId === current.ownerId && pendingRefresh.generation === current.sessionGeneration) return pendingRefresh.promise;
  const observation = beginCommunityWalletObservation();
  if (!observation) return Promise.resolve();
  if (current.officeCoins === null) useCommunityWalletStore.setState({ status: 'loading' });
  const promise = communityFarmApi.getOverview()
    .then((overview) => publishCommunityWalletOverview(observation, overview))
    .catch(() => markCommunityWalletObservationFailed(observation))
    .finally(() => {
      if (pendingRefresh?.promise === promise) pendingRefresh = null;
    });
  pendingRefresh = { ownerId: observation.ownerId, generation: observation.sessionGeneration, promise };
  return promise;
}

export function resetCommunityWalletStoreForTests(): void {
  mutationEpoch += 1;
  appliedRequest = ++requestSequence;
  pendingMutations.clear();
  pendingRefresh = null;
  useCommunityWalletStore.setState({ ownerId: null, sessionGeneration: -1, officeCoins: null, serverTime: null, status: 'idle' });
}
