import {
  createContext,
  useContext,
  useEffect,
  type JSX,
  type ReactNode,
} from 'react';

export type ArcadeGameKey = 'tetris' | 'tank' | 'zhesi';

export interface ArcadeRun {
  runId: string;
  gameKey: ArcadeGameKey;
  startedAt: string;
  expiresAt: string;
}

export interface ArcadeFinishResult {
  gameKey: ArcadeGameKey;
  score: number;
  bestScore: number;
  isPersonalBest: boolean;
  rank: number;
}

export interface ArcadeLeaderboardData {
  gameKey: ArcadeGameKey;
  formulaVersion: string;
  items: Array<{
    rank: number;
    publicId: string;
    displayName: string;
    score: number;
    achievedAt: string;
  }>;
}

/**
 * Optional online capabilities for otherwise local-only games.
 *
 * The public build intentionally has no default implementation. Community mode
 * injects its API-backed adapter at the route boundary, keeping auth and API
 * modules outside public game chunks.
 */
export interface ArcadeAdapter {
  signedIn: boolean;
  restoreSession: () => void | Promise<void>;
  startRun: (gameKey: ArcadeGameKey) => Promise<ArcadeRun>;
  finishRun: (
    runId: string,
    score: number,
    metrics: Record<string, unknown>,
  ) => Promise<ArcadeFinishResult>;
  getLeaderboard: (gameKey: ArcadeGameKey) => Promise<ArcadeLeaderboardData>;
}

const ArcadeAdapterContext = createContext<ArcadeAdapter | null>(null);

export function ArcadeAdapterProvider({
  adapter,
  children,
}: {
  adapter: ArcadeAdapter;
  children: ReactNode;
}): JSX.Element {
  useEffect(() => {
    void adapter.restoreSession();
  }, [adapter.restoreSession]);

  return (
    <ArcadeAdapterContext.Provider value={adapter}>
      {children}
    </ArcadeAdapterContext.Provider>
  );
}

export function useArcadeAdapter(): ArcadeAdapter | null {
  return useContext(ArcadeAdapterContext);
}
