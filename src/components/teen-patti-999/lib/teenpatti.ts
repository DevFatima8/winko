// Teen Patti (Indian 3-card poker) game engine.
// NOTE: This is a for-fun simulation with virtual chips only — no real money.

export type Suit = "spade" | "heart" | "diamond" | "club";

export interface Card {
  rank: number; // 2..14  (11=J, 12=Q, 13=K, 14=A)
  suit: Suit;
}

export const SUIT_SYMBOL: Record<Suit, string> = {
  spade: "♠",
  heart: "♥",
  diamond: "♦",
  club: "♣",
};

export const RANK_LABEL: Record<number, string> = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of ["spade", "heart", "diamond", "club"] as Suit[]) {
    for (let rank = 2; rank <= 14; rank++) deck.push({ rank, suit });
  }
  return deck;
}

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export type HandRank = 1 | 2 | 3 | 4 | 5 | 6;
// 1 = High card, 2 = Pair, 3 = Color (flush), 4 = Sequence (straight),
// 5 = Pure sequence (straight flush), 6 = Trail (three of a kind)

export interface HandScore {
  rank: HandRank;
  tie: number[]; // tie-breakers, compared lexicographically
}

export function evaluateHand(cards: Card[]): HandScore {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const flush = new Set(cards.map((c) => c.suit)).size === 1;
  const trail = ranks[0] === ranks[1] && ranks[1] === ranks[2];
  const pair = ranks[0] === ranks[1] || ranks[1] === ranks[2];

  const uniq = [...new Set(ranks)].sort((a, b) => a - b);
  const aceLow = uniq.length === 3 && uniq[0] === 2 && uniq[1] === 3 && uniq[2] === 14; // A-2-3
  const straight = uniq.length === 3 && (aceLow || uniq[2] - uniq[0] === 2);
  // In Teen Patti A-2-3 is the highest sequence; otherwise ranked by top card.
  const seqValue = aceLow ? 15 : uniq[2];

  if (trail) return { rank: 6, tie: [ranks[0]] };
  if (straight && flush) return { rank: 5, tie: [seqValue] };
  if (straight) return { rank: 4, tie: [seqValue] };
  if (flush) return { rank: 3, tie: ranks };
  if (pair) {
    const pairRank = ranks[0] === ranks[1] ? ranks[0] : ranks[2];
    const kicker = ranks[0] === ranks[1] ? ranks[2] : ranks[0];
    return { rank: 2, tie: [pairRank, kicker] };
  }
  return { rank: 1, tie: ranks };
}

/** > 0 means a beats b, < 0 means b beats a, 0 is a tie. */
export function compareHands(a: HandScore, b: HandScore): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const len = Math.max(a.tie.length, b.tie.length);
  for (let i = 0; i < len; i++) {
    const d = (a.tie[i] ?? 0) - (b.tie[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function handName(score: HandScore): string {
  switch (score.rank) {
    case 6:
      return "Trail (Three of a Kind)";
    case 5:
      return "Pure Sequence";
    case 4:
      return "Sequence";
    case 3:
      return "Color (Flush)";
    case 2:
      return `Pair of ${RANK_LABEL[score.tie[0]]}s`;
    default:
      return `${RANK_LABEL[score.tie[0]]} High`;
  }
}

/**
 * Pairs Plus side-bet multiplier (profit odds — the stake is returned on a win).
 * Trail 10:1, Pure Sequence 5:1, Sequence 4:1, Color 3:1, Pair 1:1.
 */
export function pairPlusPays(score: HandScore): number {
  switch (score.rank) {
    case 6:
      return 10;
    case 5:
      return 5;
    case 4:
      return 4;
    case 3:
      return 3;
    case 2:
      return 1;
    default:
      return 0;
  }
}

/**
 * The deal is weighted so the showdown outcome matches that ratio
 * (exact ties are re-dealt so the ratio stays exact).
 */
export const WIN_RATIO = 0.35;

export interface DealResult {
  player: Card[];
  dealer: Card[];
  playerScore: HandScore;
  dealerScore: HandScore;
  playerWins: boolean;
}

export function dealRound(winRatio: number = WIN_RATIO): DealResult {
  const player = shuffle(createDeck()).slice(0, 3);
  const playerScore = evaluateHand(player);
  let playerWins = Math.random() < winRatio;
  // A trail of aces is the absolute nuts — it can never be beaten, so the
  // player must win; otherwise the weighted re-deal below would never end.
  if (playerScore.rank === 6 && playerScore.tie[0] === 14) playerWins = true;

  const rest = createDeck().filter(
    (c) => !player.some((p) => p.rank === c.rank && p.suit === c.suit)
  );

  // Re-deal the dealer's hand until it matches the intended outcome (no ties).
  let attempts = 0;
  for (; ;) {
    const dealer = shuffle(rest).slice(0, 3);
    const dealerScore = evaluateHand(dealer);
    const cmp = compareHands(playerScore, dealerScore);
    if (playerWins && cmp > 0) {
      return { player, dealer, playerScore, dealerScore, playerWins };
    }
    if (!playerWins && cmp < 0) {
      return { player, dealer, playerScore, dealerScore, playerWins };
    }
    // Safety net: after many tries, flip the intended outcome.
    if (++attempts > 1000) playerWins = !playerWins;
  }
}
