import { useMemo, type JSX } from 'react';

import {
  finishArcadeRun,
  getArcadeLeaderboard,
  startArcadeRun,
} from '../../api/community-arcade';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import {
  ArcadeAdapterProvider,
  type ArcadeAdapter,
} from './ArcadeAdapter';
import { CommunityGameWorkspaceLayout } from './rooms/CommunityGameWorkspaceLayout';

/** Community-only composition root for online arcade sessions and rankings. */
export function CommunityArcadeGameLayout(): JSX.Element {
  const signedIn = useCommunityAuthStore((state) => state.phase === 'active');
  const publicId = useCommunityAuthStore((state) => state.user?.publicId);
  const restoreSession = useCommunityAuthStore((state) => state.restoreSession);
  const adapter = useMemo<ArcadeAdapter>(() => ({
    signedIn,
    restoreSession,
    startRun: startArcadeRun,
    finishRun: finishArcadeRun,
    getLeaderboard: getArcadeLeaderboard,
  }), [publicId, restoreSession, signedIn]);

  return (
    <ArcadeAdapterProvider adapter={adapter}>
      <CommunityGameWorkspaceLayout />
    </ArcadeAdapterProvider>
  );
}
