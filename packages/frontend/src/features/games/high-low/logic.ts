export type HighLowPrediction = 'player' | 'computer' | 'tie';
export type HighLowOutcome = HighLowPrediction;

export interface HighLowRound {
  playerCard: number;
  computerCard: number;
  outcome: HighLowOutcome;
  won: boolean;
}

export function drawCard(random: () => number = Math.random): number {
  const value = random();
  const normalized = Number.isFinite(value)
    ? Math.min(Math.max(value, 0), 0.999999999)
    : 0;
  return Math.floor(normalized * 13) + 1;
}

export function compareCards(
  playerCard: number,
  computerCard: number,
): HighLowOutcome {
  if (playerCard === computerCard) {
    return 'tie';
  }
  return playerCard > computerCard ? 'player' : 'computer';
}

export function playHighLowRound(
  prediction: HighLowPrediction,
  random: () => number = Math.random,
): HighLowRound {
  const playerCard = drawCard(random);
  const computerCard = drawCard(random);
  const outcome = compareCards(playerCard, computerCard);
  return {
    playerCard,
    computerCard,
    outcome,
    won: prediction === outcome,
  };
}

export function cardLabel(value: number): string {
  if (value === 1) return 'A';
  if (value === 11) return 'J';
  if (value === 12) return 'Q';
  if (value === 13) return 'K';
  return String(value);
}
