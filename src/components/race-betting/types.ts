export type Suit = 'SPADE' | 'HEART' | 'CLUB' | 'DIAMOND';

export type CardRank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q';

export interface Card {
  id: string;
  suit: Suit;
  rank: CardRank;
  value: number; // A=1, 2-10=face value, J=11, Q=12
  color: 'RED' | 'BLACK';
}

export type GamePhase = 'BETTING' | 'CLOSED' | 'DEALING' | 'RESULT';

export type BetType =
  | 'SUIT_BACK'
  | 'SUIT_LAY'
  | 'COLOR_RED'
  | 'COLOR_BLACK'
  | 'TOTAL_CARDS_OVER'
  | 'TOTAL_CARDS_UNDER'
  | 'TOTAL_CARDS_ODD'
  | 'TOTAL_CARDS_EVEN'
  | 'TOTAL_POINTS_OVER'
  | 'TOTAL_POINTS_UNDER'
  | 'TOTAL_POINTS_ODD'
  | 'TOTAL_POINTS_EVEN'
  | 'CARDS_5_8'
  | 'CARDS_9_12'
  | 'CARDS_13_17';

export interface Bet {
  id: string;
  type: BetType;
  target?: Suit; // For SUIT_BACK, SUIT_LAY
  targetLabel: string;
  odds: number;
  stake: number;
  potentialProfit: number;
  liability?: number; // for lay bets
  isLay?: boolean;
}

export interface RoundResult {
  roundId: string;
  winningSuit: Suit;
  totalCards: number;
  totalPoints: number;
  cardsSequence: Card[];
  suitCards: Record<Suit, Card[]>;
  timestamp: number;
}

export interface SettledBet extends Bet {
  won: boolean;
  payout: number;
  profit: number;
  roundId: string;
}

export interface GameStats {
  totalRounds: number;
  playerRounds: number;
  playerWins: number;
  playerLosses: number;
  totalWonAmount: number;
  totalLostAmount: number;
  suitCounts: Record<Suit, number>;
}
