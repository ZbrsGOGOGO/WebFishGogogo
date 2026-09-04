import { communityHttp } from './community-http';

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

export interface ArcadeLeaderboard {
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

export function startArcadeRun(gameKey: ArcadeGameKey): Promise<ArcadeRun> {
  return communityHttp.post('/v1/games/arcade/runs', { gameKey }, { retryAfterRefresh: false });
}

export function finishArcadeRun(
  runId: string,
  score: number,
  metrics: Record<string, unknown>,
): Promise<ArcadeFinishResult> {
  return communityHttp.post(
    `/v1/games/arcade/runs/${encodeURIComponent(runId)}/finish`,
    { score, metrics },
    { retryAfterRefresh: false },
  );
}

export function getArcadeLeaderboard(gameKey: ArcadeGameKey): Promise<ArcadeLeaderboard> {
  return communityHttp.get(`/v1/games/arcade/leaderboards/${gameKey}`, {
    auth: false,
    query: { limit: 20 },
  });
}
