import type { ArcadeGameAction, ArcadeGameKey, ArcadeGameMode, ArcadeGameView } from './arcade-game-state';

export const PLAY_GAME_KEYS: readonly ArcadeGameKey[] = ['snake', 'tetris', 'tank', 'zhesi', 'draw', 'undercover'];
export const PLAY_DAILY_CHAMPION_COINS = 100;
export const PLAY_GAME_NAMES: Record<ArcadeGameKey, string> = {
  snake: '贪食蛇', tetris: '俄罗斯方块', tank: '坦克大战', zhesi: '遮司', draw: '你画我猜', undercover: '谁是卧底',
};
export interface PlayGameDefinition {
  gameKey: ArcadeGameKey;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  soloDescription: string;
  roomDescription: string;
  dailyChampionCoins: number;
}
export interface PlayCatalog {
  games: PlayGameDefinition[];
  rankingRules: string;
  rewardRules: string;
  settlementTime: string;
  historyNotice: string;
}
export type PlayRoomStatus = 'waiting' | 'running' | 'finished' | 'closed';
export interface PlayPerson { publicId: string; username: string | null; displayName: string }
export interface PlayRoomSummary {
  id: string;
  title: string;
  gameKey: ArcadeGameKey;
  mode: ArcadeGameMode;
  visibility: 'public' | 'invite';
  status: PlayRoomStatus;
  host: PlayPerson | null;
  memberCount: number;
  maxPlayers: number;
  createdAt: string;
}
export interface PlayRoomMember extends PlayPerson {
  ready: boolean;
  left: boolean;
  score: number | null;
  joinedAt: string;
}
export interface PlayRoomView extends PlayRoomSummary {
  version: number;
  joinCode: string;
  members: PlayRoomMember[];
  me: { publicId: string; isHost: boolean; ready: boolean; left: boolean; nextSequence: number };
  game: ArcadeGameView | null;
  serverNow: string;
  expiresAt: string;
  leaderboardDate: string | null;
  rankingNotice: string;
}
export interface PlayRoomList {
  items: PlayRoomSummary[];
  activeRoom: PlayRoomSummary | null;
}
export interface PlayCreateInput {
  clientRequestId: string;
  gameKey: ArcadeGameKey;
  mode: ArcadeGameMode;
  visibility?: 'public' | 'invite';
  maxPlayers?: number;
  title?: string;
}
export interface PlayJoinInput { roomId?: string; code?: string }
export type PlayActionInput = ArcadeGameAction & { actionId: string; sequence: number };
export interface PlayLeaderboardEntry extends PlayPerson {
  rank: number;
  score: number;
  mode: ArcadeGameMode;
  achievedAt: string;
}
export interface PlayLeaderboard {
  gameKey: ArcadeGameKey;
  date: string;
  items: PlayLeaderboardEntry[];
  award: { status: 'pending' | 'awarded' | 'no_eligible_score'; winner: PlayPerson | null; coins: number; awardedAt: string | null };
  rules: string;
  dailyChampionCoins: number;
}
export interface PlayOfficeCoinLeaderboard {
  items: (PlayPerson & { rank: number; balance: number })[];
  me: { rank: number; balance: number } | null;
  updatedAt: string;
  rules: string;
}
