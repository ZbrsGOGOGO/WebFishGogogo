/** Viewer-scoped arcade state. Seeds, answer banks and other players' secrets never cross this boundary. */
export type ArcadeGameKey = 'snake' | 'tetris' | 'tank' | 'zhesi' | 'draw' | 'undercover';
export type ArcadeGameMode = 'solo' | 'room';
export type ArcadeDirection = 'up' | 'down' | 'left' | 'right';
export interface ArcadePoint { x: number; y: number }
export interface ArcadeParticipant { id: string; displayName: string }
export interface ArcadePlayerScore extends ArcadeParticipant { score: number; finished: boolean; isBot: boolean }
export interface ArcadeStroke { points: ArcadePoint[]; color: '#334155' | '#dc2626' | '#2563eb' | '#16a34a'; width: 2 | 4 | 8 }
export interface ArcadeSnakeBoard { snake: ArcadePoint[]; food: ArcadePoint | null; direction: ArcadeDirection; status: string; width: number; height: number }
export interface ArcadeTetrisBoard { board: (string | null)[][]; activePiece: { type: string; shape: number[][]; row: number; column: number }; nextPiece: string; lines: number; level: number; status: string }
export interface ArcadeTankBoard { player: ArcadePoint & { direction: ArcadeDirection; lives: number }; enemies: (ArcadePoint & { id: string; direction: ArcadeDirection })[]; bullets: (ArcadePoint & { id: string; owner: 'player' | 'enemy'; direction: ArcadeDirection })[]; walls: ArcadePoint[]; status: string; width: number; height: number }
export interface ArcadeZhesiBoard { turn: number; maxTurns: number; health: number; energy: number; power: number; enemyHealth: number; enemyIntent: 'attack' | 'charge' | 'recover'; chosen: boolean; turnEndsAt: number; log: string[]; status: 'running' | 'finished' }
export interface ArcadeDrawBoard { round: number; totalRounds: number; drawerId: string; roundEndsAt: number; strokes: ArcadeStroke[]; wordLength: number; word: string | null; guessedPlayerIds: string[]; messages: { playerId: string; text: string; correct: boolean }[]; practicePartner: boolean }
export interface ArcadeUndercoverBoard { round: number; phase: 'describe' | 'vote' | 'finished'; phaseEndsAt: number; word: string | null; alivePlayerIds: string[]; descriptions: { playerId: string; text: string; round: number }[]; votedPlayerIds: string[]; myVote: string | null; eliminatedPlayerIds: string[]; outcome: 'civilian' | 'undercover' | null; reveals: { playerId: string; word: string; role: 'civilian' | 'undercover' }[]; practicePartner: boolean }
export interface ArcadeViewBase { version: 1; gameKey: ArcadeGameKey; mode: ArcadeGameMode; phase: 'running' | 'finished'; startedAt: number; endsAt: number; serverNow: number; players: ArcadePlayerScore[]; viewerId: string; instructions: string }
export type ArcadeGameView = ArcadeViewBase & (
  | { gameKey: 'snake'; board: ArcadeSnakeBoard }
  | { gameKey: 'tetris'; board: ArcadeTetrisBoard }
  | { gameKey: 'tank'; board: ArcadeTankBoard }
  | { gameKey: 'zhesi'; board: ArcadeZhesiBoard }
  | { gameKey: 'draw'; board: ArcadeDrawBoard }
  | { gameKey: 'undercover'; board: ArcadeUndercoverBoard }
);
/** The transport wraps this with an action ID/sequence; scores are never accepted. */
export type ArcadeGameAction =
  | { kind: 'direction'; payload: { direction: ArcadeDirection } }
  | { kind: 'tetris'; payload: { move: 'left' | 'right' | 'rotate' | 'softDrop' | 'hardDrop' } }
  | { kind: 'fire'; payload: Record<string, never> }
  | { kind: 'choice'; payload: { choice: 'strike' | 'guard' | 'train'; turn: number } }
  | { kind: 'stroke'; payload: ArcadeStroke & { round: number } }
  | { kind: 'clear'; payload: { round: number } }
  | { kind: 'guess'; payload: { text: string; round: number } }
  | { kind: 'describe'; payload: { text: string; round: number } }
  | { kind: 'vote'; payload: { targetId: string; round: number } };
export interface ArcadeEngineResult { scores: { userId: string; score: number }[]; finishedAt: number }
