import type { RailGameView, RailParticipant } from './rail-game';
import type { PlayPerson } from './game-rooms';

export const RAIL_DAILY_CHAMPION_COINS = 100;
export type RailRoomRole = 'participant' | 'spectator';
export type RailChatChannel = 'player' | 'spectator';
export interface RailCatalog {
  gameKey: 'rail'; name: string; description: string;
  minPlayers: number; maxPlayers: number; maxBots: number; maxSpectators: number;
  dailyChampionCoins: number; rewardRules: string; rules: string;
}
export interface RailRoomSummary {
  id: string; title: string; mode: 'practice' | 'room'; hasPassword: boolean;
  status: 'waiting' | 'running' | 'finished' | 'closed'; host: PlayPerson | null;
  playerCount: number; botCount: number; spectatorCount: number; maxPlayers: number; createdAt: string;
}
export interface RailRoomMember extends PlayPerson {
  role: RailRoomRole; ready: boolean; left: boolean; joinedAt: string;
}
export interface RailRoomView extends RailRoomSummary {
  version: number; members: RailRoomMember[]; bots: RailParticipant[];
  me: { publicId: string; role: RailRoomRole; ready: boolean; left: boolean; isHost: boolean; nextSequence: number };
  game: RailGameView | null; serverNow: string; expiresAt: string; leaderboardDate: string | null;
  rankingEligible: boolean; rankingNotice: string; chatEnabled: boolean; chatCanWrite: boolean;
}
export interface RailRoomList { items: RailRoomSummary[]; activeRoom: RailRoomSummary | null }
export interface RailCreateInput {
  clientRequestId: string; mode: 'practice' | 'room'; title?: string; password?: string;
  maxPlayers?: number; botCount?: number;
}
export interface RailJoinInput { roomId: string; password?: string; role?: RailRoomRole }
export interface RailBotsInput { count: number; expectedVersion: number }
export interface RailPasswordInput { password: string; expectedVersion: number }
export interface RailChatMessage {
  id: string; sequence: number; channel: RailChatChannel; author: PlayPerson;
  body: string | null; status: 'visible' | 'withdrawn'; createdAt: string;
}
export interface RailChatPage { items: RailChatMessage[]; latestSequence: number; hasMore: boolean }
export interface RailChatSendInput { clientMessageId: string; channel: RailChatChannel; body: string }
export interface RailLeaderboardEntry extends PlayPerson {
  rank: number; survived: number; eligibleRounds: number; rateBasisPoints: number; demonTotal: number; achievedAt: string;
}
export interface RailLeaderboard {
  date: string; items: RailLeaderboardEntry[]; dailyChampionCoins: number; rules: string;
  award: { status: 'pending' | 'awarded' | 'no_eligible_score'; winner: PlayPerson | null; coins: number; awardedAt: string | null };
}
export interface RailPersonalStats {
  completedGames: number; survived: number; eligibleRounds: number; rateBasisPoints: number;
  demonTotal: number; demonMvpCount: number; rankedGames: number;
}
