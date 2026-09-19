import { communityHttp } from './community-http';
export interface WordFrontMapDraft { key:string; name:string; cells:string[]; version:number; updatedAt:string }
export interface WordFrontMapDraftList { rulesVersion:4; width:8; height:10; symbols:Record<string,string>; items:WordFrontMapDraft[] }
export interface WordFrontBalance { periodDays:number; generatedAt:string; rows:Array<{map:string|null;outcome:string;runs:number;averageWave:string|null}> }
const ROOT='/v1/games/word-front/maps/admin';
export const wordFrontMapsApi={ list:(signal?:AbortSignal):Promise<WordFrontMapDraftList>=>communityHttp.get(ROOT,{signal}), balance:(signal?:AbortSignal):Promise<WordFrontBalance>=>communityHttp.get(`${ROOT}/balance`,{signal}), save:(key:string,input:{name:string;cells:string[];expectedVersion:number}):Promise<WordFrontMapDraft>=>communityHttp.post(`${ROOT}/${encodeURIComponent(key)}`,input,{retryAfterRefresh:false}) };
