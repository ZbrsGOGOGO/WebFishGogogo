// 小游戏中心 / 午休斗技场 API 客户端。

import { http } from './http';

export type ArenaOfferTier = 'easy' | 'even' | 'risky';
export type ArenaBattleOutcome = 'win' | 'loss';
export type ArenaWinnerSide = 'player' | 'opponent';

export interface ArenaAttributes {
  focus: number;
  inspiration: number;
  mindset: number;
  slacking: number;
  execution: number;
}

export interface ArenaProfile {
  level: number;
  title: string;
  energy: number;
  energyCap: number;
  battleClass: string | null;
  attributes: ArenaAttributes;
}

export interface ArenaOffer {
  id: string;
  tier: ArenaOfferTier;
  opponentName: string;
  opponentLevel: number;
  power: number;
  expiresAt: string;
}

export interface ArenaRecentBattle {
  id: string;
  result: ArenaBattleOutcome;
  opponentName: string;
  createdAt: string;
}

export interface ArenaBootstrap {
  serverTime: string;
  unlocked: boolean;
  unlockLevel: number;
  profile: ArenaProfile;
  offers: ArenaOffer[];
  recentBattles: ArenaRecentBattle[];
}

export type ArenaBattleLog =
  | string
  | {
      round?: number;
      text: string;
    };

export interface ArenaBattleResult {
  battle: {
    id: string;
    winnerSide: ArenaWinnerSide;
    result: ArenaBattleOutcome;
    roundsPlayed: number;
    logs: ArenaBattleLog[];
  };
  reward: {
    experience: number;
    currencies?: Record<string, number>;
  };
  /** 本次战斗结算后的剩余精力。 */
  energy: number;
}

function createIdempotencyKey(offerId: string): string {
  // 一个邀约只能结算一次。让同一邀约的网络重试复用同一键，可避免服务端
  // 已完成结算但响应中断时，用户再次点击造成重复扣除。
  return `arena-battle-${offerId}`;
}

export function getArenaBootstrap(): Promise<ArenaBootstrap> {
  return http.get<ArenaBootstrap>('/v1/games/arena/bootstrap');
}

export function startArenaBattle(
  offerId: string,
): Promise<ArenaBattleResult> {
  return http.post<ArenaBattleResult>(
    '/v1/games/arena/battles',
    { offerId },
    {
      headers: {
        'Idempotency-Key': createIdempotencyKey(offerId),
      },
    },
  );
}

export const arenaApi = {
  getBootstrap: getArenaBootstrap,
  startBattle: startArenaBattle,
};
