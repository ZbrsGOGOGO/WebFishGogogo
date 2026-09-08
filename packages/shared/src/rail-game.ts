/** Public contracts for 轨道难题. Engine state / shuffled decks are never API data. */
export type RailTrack = 'A' | 'B';
export type RailPhase = 'placement' | 'buff' | 'decision' | 'rating' | 'round_end' | 'finished';
export type RailCardKind = 'good' | 'bad' | 'buff';
export type RailActionKind = 'place_good' | 'place_bad' | 'place_buff' | 'choose_track' | 'rate' | 'next_round';
export interface RailParticipant { id: string; displayName: string; isBot: boolean }
export interface RailCard { id: string; kind: RailCardKind; title: string; description: string }
export interface RailHand { good: RailCard[]; bad: RailCard[]; buff: RailCard[] }
export interface RailPlayedCharacter {
  id: string;
  card: RailCard;
  ownerId: string;
  track: RailTrack;
  automatic: boolean;
  buff: { card: RailCard; ownerId: string; automatic: boolean } | null;
}
export interface RailPlayerStats {
  survived: number;
  /** Completed non-conductor rounds; the final denominator is totalRounds - 1. */
  eligibleRounds: number;
  rateBasisPoints: number;
  demonTotal: number;
  /** No bot, departure, or missed required action in any round. */
  eligible: boolean;
}
export interface RailPublicPlayer extends RailParticipant, RailPlayerStats {
  seat: number;
  team: RailTrack | null;
  left: boolean;
  placedGood: boolean;
  placedBad: boolean;
  placedBuff: boolean;
  rated: boolean;
}
export interface RailRoundRating { playerId: string; value: number | null; automatic: boolean }
export interface RailRoundResult {
  round: number;
  conductorId: string;
  chosenTrack: RailTrack;
  automaticDecision: boolean;
  survivedPlayerIds: string[];
  passedPlayerIds: string[];
  ratings: RailRoundRating[];
  demonScore: number;
}
export interface RailResultPlayer extends RailParticipant, RailPlayerStats { left: boolean }
export interface RailEngineResult {
  finishedAt: number;
  players: RailResultPlayer[];
  /** All tied eligible participants; empty if nobody completed required actions. */
  survivorMvpIds: string[];
  /** Display only, never a currency reward. Includes ties among participating humans. */
  demonMvpIds: string[];
}
export interface RailGameView {
  gameKey: 'rail';
  phase: RailPhase;
  round: number;
  totalRounds: number;
  roundToken: string;
  startedAt: number;
  deadlineAt: number;
  endsAt: number;
  serverNow: number;
  conductorId: string;
  viewerRole: 'participant' | 'spectator';
  players: RailPublicPlayer[];
  tracks: Record<RailTrack, RailPlayedCharacter[]>;
  chosenTrack: RailTrack | null;
  automaticDecision: boolean;
  me: {
    id: string;
    team: RailTrack | null;
    hand: RailHand;
    availableActions: RailActionKind[];
    myRating: number | null;
  } | null;
  roundResult: RailRoundResult | null;
  history: RailRoundResult[];
  result: RailEngineResult | null;
  rules: string;
}
export type RailActionPayload =
  | { roundToken: string; cardId: string }
  | { roundToken: string; cardId: string; targetId: string }
  | { roundToken: string; track: RailTrack }
  | { roundToken: string; value: number }
  | { roundToken: string };
export interface RailActionInput { actionId: string; sequence: number; kind: RailActionKind; payload: RailActionPayload }
