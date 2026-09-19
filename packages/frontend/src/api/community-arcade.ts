import { communityHttp } from './community-http';

export type ArcadeGameKey = 'tetris' | 'tank' | 'zhesi' | 'word_story' | 'word_endless' | 'word_story_v2' | 'word_endless_v2' | 'word_story_v3' | 'word_endless_v3' | 'word_story_v4' | 'word_endless_v4';

export interface ArcadeRun {
  runId: string;
  gameKey: ArcadeGameKey;
  startedAt: string;
  expiresAt: string;
  seed?: number;
  rulesVersion?: 1 | 2 | 3 | 4;
  chapter?: number;
}

export interface ArcadeFinishResult {
  gameKey: ArcadeGameKey;
  score: number;
  bestScore: number;
  isPersonalBest: boolean;
  rank: number;
  progression?: { merit: number; earned: number; wins: number; losses: number; unlocks: string[] };
}

export interface WordFrontProgress { merit:number; wins:number; losses:number; dailyEarned:number; dailyCap:number; unlocks:string[]; shop:Array<{id:string;name:string;cost:number;description:string;owned:boolean}> }
export const getWordFrontProgress = ():Promise<WordFrontProgress> => communityHttp.get('/v1/games/word-front/progress');
export const buyWordFrontCosmetic = (itemId:string):Promise<WordFrontProgress> => communityHttp.post('/v1/games/word-front/progress/shop',{itemId},{retryAfterRefresh:false});

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

export function startArcadeRun(gameKey: ArcadeGameKey, rulesVersion?: 1 | 2 | 3 | 4, chapter?: number): Promise<ArcadeRun> {
  return communityHttp.post('/v1/games/arcade/runs', { gameKey, ...(rulesVersion === undefined ? {} : { rulesVersion }),
    ...(chapter === undefined ? {} : { chapter }) }, { retryAfterRefresh: false });
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
