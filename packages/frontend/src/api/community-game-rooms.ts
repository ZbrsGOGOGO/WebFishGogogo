import type { ArcadeGameKey, PlayActionInput, PlayCatalog, PlayCreateInput, PlayJoinInput, PlayLeaderboard, PlayOfficeCoinLeaderboard, PlayRoomList, PlayRoomView } from '@stealth-reader/shared';

import { CommunityApiError, communityHttp } from './community-http';

const ROOT = '/v1/games/play';
const segment = encodeURIComponent;
const writeOptions = { retryAfterRefresh: false } as const;

export const communityGameRoomsApi = {
  catalog: (signal?: AbortSignal): Promise<PlayCatalog> => communityHttp.get(`${ROOT}/catalog`, { auth: false, signal }),
  list: (gameKey?: ArcadeGameKey, signal?: AbortSignal): Promise<PlayRoomList> => communityHttp.get(`${ROOT}/rooms`, { query: { gameKey }, signal }),
  create: (input: PlayCreateInput): Promise<PlayRoomView> => communityHttp.post(`${ROOT}/rooms`, input, writeOptions),
  join: (input: PlayJoinInput): Promise<PlayRoomView> => communityHttp.post(`${ROOT}/rooms/join`, input, writeOptions),
  get: (roomId: string, signal?: AbortSignal): Promise<PlayRoomView> => communityHttp.get(`${ROOT}/rooms/${segment(roomId)}`, { signal }),
  ready: (roomId: string, ready: boolean): Promise<PlayRoomView> => communityHttp.post(`${ROOT}/rooms/${segment(roomId)}/ready`, { ready }, writeOptions),
  start: (roomId: string): Promise<PlayRoomView> => communityHttp.post(`${ROOT}/rooms/${segment(roomId)}/start`, {}, writeOptions),
  action: (roomId: string, input: PlayActionInput): Promise<PlayRoomView> => communityHttp.post(`${ROOT}/rooms/${segment(roomId)}/actions`, input, writeOptions),
  leave: (roomId: string): Promise<PlayRoomView> => communityHttp.post(`${ROOT}/rooms/${segment(roomId)}/leave`, {}, writeOptions),
  leaderboard: (gameKey: ArcadeGameKey, date?: string, signal?: AbortSignal): Promise<PlayLeaderboard> => communityHttp.get(`${ROOT}/leaderboards/${segment(gameKey)}`, { query: { date }, signal }),
  officeCoinsLeaderboard: (signal?: AbortSignal): Promise<PlayOfficeCoinLeaderboard> => communityHttp.get(`${ROOT}/leaderboards/office-coins`, { signal }),
};

export function createPlayRequestId(): string {
  return globalThis.crypto.randomUUID();
}

const PLAY_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  PLAY_ACTIVE_ACCOUNT_REQUIRED: '登录状态已变化，请重新登录有效账号。',
  PLAY_ACTIVE_ROOM: '你还有一个进行中的赛局，请先返回当前房间，或退出后再开新局。',
  PLAY_CREATE_LIMIT: '24 小时最多新建 60 局，今天已经玩了不少，稍后再来吧。',
  PLAY_SERVER_BUSY: '当前游戏房间较多，请稍后再试。',
  PLAY_ROOM_NOT_FOUND: '房间不存在，或你当前无法访问这个房间。',
  PLAY_ROOM_NOT_WAITING: '房间状态已经变化，请查看最新赛局状态。',
  PLAY_ROOM_NOT_RUNNING: '本局尚未开始或已经结束，不能继续操作。',
  PLAY_ROOM_LEFT: '你已退出这个房间，不能重新加入，请参加下一局。',
  PLAY_ROOM_FULL: '房间人数已满，请选择其他房间。',
  PLAY_HOST_REQUIRED: '只有房主可以开始这场游戏。',
  PLAY_PLAYERS_NOT_READY: '人数还不够，或有成员尚未准备。',
  PLAY_JOIN_INVALID: '请输入房主提供的 12 位邀请码。',
  PLAY_TITLE_INVALID: '房间名称请使用 1～40 个正常文字字符。',
  PLAY_CAPACITY_INVALID: '这个游戏的房间人数设置不符合规则。',
  PLAY_DATE_INVALID: '请选择有效的今天或历史日期。',
  PLAY_SEQUENCE_CONFLICT: '操作顺序已更新，正在同步最新房间，请稍后继续。',
  PLAY_IDEMPOTENCY_CONFLICT: '操作编号与内容不一致，请刷新房间后继续。',
  PLAY_ACTION_RATE_LIMIT: '操作太密集了，请稍慢一点再继续。',
  PLAY_ACTION_TOO_FAST: '操作稍快，请放慢一点。',
  PLAY_ACTION_LIMIT: '本局操作次数已达到上限，请等待结算。',
  PLAY_STALE_TURN: '已经进入下一回合，请查看新回合再选择。',
  PLAY_STALE_ROUND: '已经进入下一轮，刚才的操作未计入新一轮。',
  PLAY_WRONG_PHASE: '当前阶段已经变化，请按最新提示操作。',
  PLAY_ALREADY_CHOSEN: '本回合已经选择，请等待回合结束。',
  PLAY_ALREADY_GUESSED: '本轮已经猜对，等待下一轮吧。',
  PLAY_ALREADY_DESCRIBED: '本轮描述已经提交，不能修改。',
  PLAY_ALREADY_VOTED: '本轮投票已经提交，不能修改。',
  PLAY_DO_NOT_REVEAL_WORD: '描述中不要直接写出自己的词语，请换一种说法。',
  PLAY_NOT_THE_DRAWER: '当前不是你的绘画回合。',
  PLAY_DRAWER_CANNOT_GUESS: '当前由你绘画，其他成员负责猜词。',
  PLAY_PLAYER_ELIMINATED: '你已出局，可以继续旁观本局。',
  PLAY_GAME_FINISHED: '你的本局挑战已结束，请查看结算与日榜。',
  PLAY_CANVAS_FULL: '本轮画板笔画已满，可以清空后继续画。',
  PLAY_INVALID_TEXT: '请输入有效文字，猜词最多 40 字，描述最多 80 字。',
  PLAY_INVALID_TARGET: '请选择仍在场的其他玩家进行投票。',
  PLAY_INVALID_STROKE: '这次笔画未能识别，请重新画一笔。',
};

export function communityGameErrorMessage(error: unknown): string {
  if (error instanceof CommunityApiError) {
    const body = error.body;
    const code = body && typeof body === 'object' && 'code' in body ? String((body as { code?: unknown }).code) : '';
    if (PLAY_ERROR_MESSAGES[code]) return PLAY_ERROR_MESSAGES[code];
    if (code.startsWith('PLAY_')) return '这次游戏操作不符合当前规则，请同步房间后再试。';
    if (error.status === 401) return '登录状态已失效，请重新登录。';
    if (error.status === 429) return '请求稍多，请稍后再试。';
    if (error.status === 0) return '网络暂时不可用，请检查连接后重试。';
  }
  return error instanceof Error && error.message ? error.message : '连接暂时中断，请稍后重试。';
}
