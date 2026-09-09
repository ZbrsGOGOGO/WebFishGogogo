import type { PaperArenaRoomSummary, PaperArenaRoomView, PaperTeam } from '@stealth-reader/shared';
import { communityHttp } from '../../../api/community-http';
import { API_BASE_URL } from '../../../api/config';
const ROOT='/v1/games/paper-arena';
export const paperArenaApi={
  rooms:(signal?:AbortSignal):Promise<{rooms:PaperArenaRoomSummary[];currentRoomId:string|null;enabled:boolean}>=>communityHttp.get(`${ROOT}/rooms`,{signal}),
  create:(input:{requestId:string;name:string;maxPlayers:number;targetKills:number;password:string}):Promise<PaperArenaRoomView>=>communityHttp.post(`${ROOT}/rooms`,input,{retryAfterRefresh:false}),
  join:(roomId:string,password:string):Promise<PaperArenaRoomView>=>communityHttp.post(`${ROOT}/rooms/join`,{roomId,password},{retryAfterRefresh:false}),
  room:(roomId:string,signal?:AbortSignal):Promise<PaperArenaRoomView>=>communityHttp.get(`${ROOT}/rooms/${encodeURIComponent(roomId)}`,{signal}),
  start:(roomId:string):Promise<PaperArenaRoomView>=>communityHttp.post(`${ROOT}/rooms/${encodeURIComponent(roomId)}/start`,{},{retryAfterRefresh:false}),
  leave:(roomId:string):Promise<unknown>=>communityHttp.post(`${ROOT}/rooms/${encodeURIComponent(roomId)}/leave`,{},{retryAfterRefresh:false}),
  team:(roomId:string,team:PaperTeam):Promise<PaperArenaRoomView>=>communityHttp.post(`${ROOT}/rooms/${encodeURIComponent(roomId)}/team`,{team},{retryAfterRefresh:false}),
  ticket:(roomId:string,signal?:AbortSignal):Promise<{ticket:string;expiresAt:string;wsPath:string}>=>communityHttp.post(`${ROOT}/rooms/${encodeURIComponent(roomId)}/ticket`,{},{retryAfterRefresh:false,signal}),
};
export function paperArenaSocketUrl(path:string):string{
  if(path!=='/ws/paper-arena')throw new Error('Unexpected room socket path');
  const url=new URL(API_BASE_URL,window.location.href);url.pathname=path;url.search='';url.hash='';url.protocol=url.protocol==='https:'?'wss:':'ws:';return url.toString();
}
