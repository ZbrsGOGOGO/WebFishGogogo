import type { RailActionInput, RailBotsInput, RailCatalog, RailChatMessage, RailChatPage, RailChatSendInput, RailCreateInput, RailJoinInput, RailLeaderboard, RailPersonalStats, RailRoomList, RailRoomView } from '@stealth-reader/shared';

import { CommunityApiError, communityHttp } from './community-http';

const ROOT = '/v1/games/rail';
const segment = encodeURIComponent;
const writeOptions = { retryAfterRefresh: false } as const;

export const communityRailApi = {
  catalog: (signal?: AbortSignal): Promise<RailCatalog> => communityHttp.get(`${ROOT}/catalog`, { auth: false, signal }),
  list: (signal?: AbortSignal): Promise<RailRoomList> => communityHttp.get(`${ROOT}/rooms`, { signal }),
  create: (input: RailCreateInput): Promise<RailRoomView> => communityHttp.post(`${ROOT}/rooms`, input, writeOptions),
  join: (input: RailJoinInput): Promise<RailRoomView> => communityHttp.post(`${ROOT}/rooms/join`, input, writeOptions),
  get: (roomId: string, signal?: AbortSignal): Promise<RailRoomView> => communityHttp.get(`${ROOT}/rooms/${segment(roomId)}`, { signal }),
  ready: (roomId: string, ready: boolean): Promise<RailRoomView> => communityHttp.post(`${ROOT}/rooms/${segment(roomId)}/ready`, { ready }, writeOptions),
  bots: (roomId: string, input: RailBotsInput): Promise<RailRoomView> => communityHttp.post(`${ROOT}/rooms/${segment(roomId)}/bots`, input, writeOptions),
  password: (roomId: string, password: string, expectedVersion: number): Promise<RailRoomView> => communityHttp.post(`${ROOT}/rooms/${segment(roomId)}/password`, { password, expectedVersion }, writeOptions),
  start: (roomId: string): Promise<RailRoomView> => communityHttp.post(`${ROOT}/rooms/${segment(roomId)}/start`, {}, writeOptions),
  action: (roomId: string, input: RailActionInput): Promise<RailRoomView> => communityHttp.post(`${ROOT}/rooms/${segment(roomId)}/actions`, input, writeOptions),
  leave: (roomId: string): Promise<RailRoomView> => communityHttp.post(`${ROOT}/rooms/${segment(roomId)}/leave`, {}, writeOptions),
  chat: (roomId: string, afterSequence?: number, signal?: AbortSignal): Promise<RailChatPage> => communityHttp.get(`${ROOT}/rooms/${segment(roomId)}/chat`, { query: { afterSequence }, signal }),
  sendChat: (roomId: string, input: RailChatSendInput): Promise<RailChatMessage> => communityHttp.post(`${ROOT}/rooms/${segment(roomId)}/chat`, input, writeOptions),
  withdrawChat: (roomId: string, messageId: string): Promise<RailChatMessage> => communityHttp.post(`${ROOT}/rooms/${segment(roomId)}/chat/${segment(messageId)}/withdraw`, {}, writeOptions),
  leaderboard: (date?: string, signal?: AbortSignal): Promise<RailLeaderboard> => communityHttp.get(`${ROOT}/leaderboard`, { auth: false, query: { date }, signal }),
  stats: (signal?: AbortSignal): Promise<RailPersonalStats> => communityHttp.get(`${ROOT}/me`, { signal }),
};

const MESSAGES: Readonly<Record<string, string>> = {
  RAIL_ACTIVE_ACCOUNT_REQUIRED: '账号状态已变化，请重新登录有效账号。',
  RAIL_ROOM_NOT_FOUND: '房间不存在，或你当前无法访问。',
  RAIL_ACTIVE_ROOM: '你还有一个进行中的轨道房间，请先返回或退出该房间。',
  RAIL_ROOM_FULL: '玩家席位已满，可以选择旁观。',
  RAIL_SPECTATORS_FULL: '观众席已满，请稍后再来。',
  RAIL_ROOM_NOT_WAITING: '本局已经开始或结束，请同步最新状态。',
  RAIL_ROOM_NOT_RUNNING: '本局未开始或已结束。',
  RAIL_ROOM_LEFT: '你已经离开这场游戏，不能再次参与本局。',
  RAIL_HOST_REQUIRED: '这项操作需要由房主进行。',
  RAIL_PLAYERS_NOT_READY: '至少需要 3 个席位，且所有真人成员均已准备。',
  RAIL_PASSWORD_REQUIRED: '这是密码房，请输入房主设置的密码。',
  RAIL_PASSWORD_INVALID: '房间密码不正确，请向房主确认。',
  RAIL_PASSWORD_INCORRECT: '房间密码不正确，请向房主确认。',
  ROOM_PASSWORD_INVALID: '房间密码需要 4–64 个字符；留空表示无需密码。',
  RAIL_PASSWORD_CHANGED: '房主刚刚更新了密码，请确认新密码后重新加入。',
  RAIL_ACTIVE_PLAY_ROOM: '你正在参加另一款小游戏，请先返回或退出原房间。',
  RAIL_VERSION_CONFLICT: '房间已更新，请根据最新人数和设置重试。',
  RAIL_SEQUENCE_CONFLICT: '操作顺序已变化，正在同步最新房间。',
  RAIL_STALE_ROUND: '已经进入下一回合，请查看新手牌后再操作。',
  RAIL_WRONG_PHASE: '当前阶段已变化，请按最新提示操作。',
  RAIL_INVALID_CARD: '这张牌已不可用，请查看最新手牌。',
  RAIL_INVALID_TARGET: '请选择当前轨道上尚无条件的人物。',
  RAIL_ALREADY_PLAYED: '这个阶段已完成这次出牌，请等待下一步。',
  RAIL_ALREADY_PLACED: '这一类牌已经放置，请完成另一类操作或等待下一步。',
  RAIL_CARD_NOT_OWNED: '这张牌已不在你的手牌中，请查看最新手牌。',
  RAIL_TARGET_ALREADY_BUFFED: '该人物已有附加条件，请换一个目标。',
  RAIL_NOT_THE_CONDUCTOR: '只有本轮列车长可以操作，请等待当前列车长。',
  RAIL_CANNOT_RATE_SELF: '列车长不能给自己评分。',
  RAIL_ALREADY_RATED: '本轮评分已提交，请等待回合结束。',
  RAIL_ACTION_RATE_LIMIT: '操作稍快，请放慢一点。',
  RAIL_CHAT_CHANNEL_FORBIDDEN: '只能在自己的身份频道发言，但两个频道都可以阅读。',
  RAIL_CHAT_DISABLED: '当前房间暂时不能发言。',
  RAIL_CHAT_READ_ONLY: '当前房间已只读，不能再发送消息。',
  RAIL_CHAT_SLOW_MODE: '消息发送稍快，请等几秒再发。',
  RAIL_CHAT_BODY_INVALID: '请输入 1–600 个有效文字字符。',
  RAIL_CHAT_MODERATION_REJECTED: '消息未通过内容检查，请调整后再发送。',
  RAIL_CHAT_ROOM_LIMIT: '本房间消息数量已达到上限，暂时只读。',
  RAIL_CREATE_LIMIT: '今天创建的房间已较多，请稍后再来。',
};

export function railErrorMessage(error: unknown): string {
  if (error instanceof CommunityApiError) {
    const code = error.body && typeof error.body === 'object' && 'code' in error.body ? String(error.body.code) : '';
    if (MESSAGES[code]) return MESSAGES[code];
    if (error.status === 401) return '登录状态已失效，请重新登录。';
    if (error.status === 429) return '请求较多，请稍后再试。';
    if (error.status === 0 || error.status >= 500) return '连接暂时不稳定，请稍后重试。';
    if (code.startsWith('RAIL_')) return '操作不符合当前房间规则，请同步后重试。';
  }
  return error instanceof Error && error.message ? error.message : '连接暂时中断，请稍后重试。';
}
