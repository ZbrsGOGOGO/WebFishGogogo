import type { WordFrontV2Action, WordFrontV2State } from '@stealth-reader/shared';
import { CommunityApiError, communityHttp } from './community-http';

export type WordFrontRoomMove = WordFrontV2Action extends infer A ? A extends { tick: number } ? Omit<A, 'tick'> : never : never;
export interface WordFrontRoomSummary {
  id: string; name: string; chapter: number; status: 'waiting' | 'running' | 'finished';
  requiresPassword: boolean; players: number; capacity: 2; expiresAt: number;
}
export interface WordFrontRoomView extends WordFrontRoomSummary {
  protocolVersion: 1; rulesVersion: 2; sequence: number; serverNow: number; rules: string;
  isHost: boolean; mySide: 'red' | 'blue';
  me: { publicId: string; displayName: string };
  opponent: { publicId: string; displayName: string } | null;
  /** The authoritative board omits its hidden RNG seed before serialization. */
  board: Omit<WordFrontV2State, 'seed'> | null;
  opposingBoard: Pick<WordFrontV2State, 'status' | 'coreHp' | 'wave' | 'completedWaves' | 'kills' | 'score' | 'units' | 'enemies' | 'pendingSpawns' | 'tick'> | null;
  winner: 'red' | 'blue' | 'draw' | null;
}
export interface WordFrontRoomList { currentRoomId: string | null; rooms: WordFrontRoomSummary[] }

const ROOT = '/v1/games/word-front/rooms';
const writeOptions = { retryAfterRefresh: false } as const;
const roomPath = (id: string) => `${ROOT}/${encodeURIComponent(id)}`;

export const wordFrontRoomsApi = {
  list: (signal?: AbortSignal): Promise<WordFrontRoomList> => communityHttp.get(ROOT, { signal }),
  get: (id: string, signal?: AbortSignal): Promise<WordFrontRoomView> => communityHttp.get(roomPath(id), { signal }),
  create: (input: { requestId: string; name: string; chapter: number; password: string }): Promise<WordFrontRoomView> => communityHttp.post(ROOT, input, writeOptions),
  join: (roomId: string, password: string): Promise<WordFrontRoomView> => communityHttp.post(`${ROOT}/join`, { roomId, password }, writeOptions),
  start: (id: string): Promise<WordFrontRoomView> => communityHttp.post(`${roomPath(id)}/start`, {}, writeOptions),
  action: (id: string, action: WordFrontRoomMove, actionId: string): Promise<WordFrontRoomView> => communityHttp.post(`${roomPath(id)}/action`, { actionId, action }, writeOptions),
  leave: (id: string): Promise<{ left: true }> => communityHttp.post(`${roomPath(id)}/leave`, {}, writeOptions),
};

const MESSAGES: Record<string, string> = {
  WORD_ROOM_DISABLED: '文字战线玩家房间暂未开放。',
  WORD_ROOM_NOT_FOUND: '房间不存在、已过期，或你无法访问。',
  WORD_ROOM_ALREADY_JOINED: '你已经在另一个文字战线房间里。',
  WORD_ROOM_FULL: '这个房间已经开始或满员。',
  WORD_ROOM_PASSWORD_INVALID: '密码不正确，请向房主确认。',
  WORD_ROOM_HOST_REQUIRED: '只有房主可以开始。',
  WORD_ROOM_NOT_READY: '需要两位真人就位后才能开始。',
  WORD_ROOM_ACTION_INVALID: '当前棋盘不能执行这一步；已重新同步。',
  WORD_ROOM_ACTION_RATE: '操作太快了，请稍后再试。',
  WORD_ROOM_OPERATION_PENDING: '上一步还在处理中，请稍候。',
};
export function wordFrontRoomError(error: unknown): string {
  if (error instanceof CommunityApiError) {
    const body = error.body;
    const code = body && typeof body === 'object' && 'code' in body ? String((body as { code?: unknown }).code) : '';
    if (MESSAGES[code]) return MESSAGES[code];
    if (error.status === 401) return '登录状态已失效，请重新登录。';
    if (error.status === 429) return '操作稍密集，请过一会儿再试。';
    if (error.status === 0) return '连接暂时中断，请检查网络后重试。';
  }
  return error instanceof Error && error.message ? error.message : '操作未完成，请稍后重试。';
}
