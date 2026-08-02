// 平台成长总览与每日签到 API。

import { http } from './http';

/** 当前用户的全站成长信息。 */
export interface PlatformProfileOverview {
  level: number;
  /** 当前累计 EXP。 */
  exp: number;
  /** 距离下一等级还需的 EXP；满级时为 null。 */
  expToNextLevel: number | null;
  title: string;
  energy: number;
  energyCap: number;
}

/** 可在工作台展示的基础经济余额。 */
export interface PlatformBalances {
  officeCoin: number;
  decorationCoin: number;
  water: number;
  sunlight: number;
  fertilizer: number;
}

export interface PlatformCheckinOverview {
  checkedInToday: boolean;
}

/** GET /v1/platform/overview 的响应。 */
export interface PlatformOverview {
  profile: PlatformProfileOverview;
  balances: PlatformBalances;
  checkin: PlatformCheckinOverview;
}

/** POST /v1/checkins/today 的响应；奖励结构允许后端逐步扩展。 */
export interface CheckinResult {
  checkedInToday: true;
  checkedInAt?: string;
  rewards?: Partial<PlatformBalances> & { exp?: number; energy?: number };
}

export function getPlatformOverview(): Promise<PlatformOverview> {
  return http.get<PlatformOverview>('/v1/platform/overview');
}

export function checkInToday(): Promise<CheckinResult> {
  return http.post<CheckinResult>('/v1/checkins/today');
}

export const platformApi = {
  getOverview: getPlatformOverview,
  checkInToday,
};
