import type { WorkstationCommand, WorkstationJob, WorkstationMode, WorkstationOverview, WorkstationTalents } from '@stealth-reader/shared';
import { communityHttp } from '../../api/community-http';
const ROOT = '/v1/games/workstation';
export interface WorkstationRanking { mode: WorkstationMode; date: string; dailyChampionCoins: number; rules: string; items: { publicId: string; displayName: string; score: number; waves: number; streak: number; rank: number }[] }
export const workstationApi = {
  overview: (signal?: AbortSignal): Promise<WorkstationOverview> => communityHttp.get(`${ROOT}/overview`, { signal }),
  start: (input: { requestId: string; mode: WorkstationMode; chapter: number; job: WorkstationJob }): Promise<WorkstationOverview> => communityHttp.post(`${ROOT}/start`,input,{retryAfterRefresh:false}),
  sync: (): Promise<WorkstationOverview> => communityHttp.post(`${ROOT}/sync`,{}, {retryAfterRefresh:false}),
  command: (runId: string,revision: number,command: WorkstationCommand): Promise<WorkstationOverview> => communityHttp.post(`${ROOT}/command`,{runId,revision,command},{retryAfterRefresh:false}),
  talents: (input: WorkstationTalents): Promise<WorkstationOverview> => communityHttp.post(`${ROOT}/talents`,input,{retryAfterRefresh:false}),
  formation: (): Promise<WorkstationOverview> => communityHttp.post(`${ROOT}/formation`,{}, {retryAfterRefresh:false}),
  leaderboard: (mode: WorkstationMode, date?: string, signal?: AbortSignal): Promise<WorkstationRanking> => communityHttp.get(`${ROOT}/leaderboard`,{query:{mode,date},signal}),
};
