import { getCommunitySessionGeneration } from '../../../api/community-http';
import { useCommunityAuthStore } from '../../../app/store/community-auth-store';

/** Optional-auth boards still contain a private `me` projection. */
export function towerSessionKey(): string {
  const state = useCommunityAuthStore.getState();
  return `${state.phase === 'active' ? state.user?.publicId ?? 'guest' : 'guest'}:${getCommunitySessionGeneration()}`;
}

export function useTowerSessionKey(): string {
  useCommunityAuthStore((state) => state.phase);
  useCommunityAuthStore((state) => state.user);
  return towerSessionKey();
}
