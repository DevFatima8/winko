// Muflis (Lowball) Teen Patti game logic
// In Muflis, the LOWEST hand wins. The normal Teen Patti hand ranking is reversed.

export type Suit = "S" | "H" | "D" | "C";

export interface Card {
  rank: number; // 2..14 (11=J,12=Q,13=K,14=A)
  suit: Suit;
}

export type HandCategory =
  | "High Card"
  | "Pair"
  | "Color"
  | "Sequence"
  | "Pure Sequence"
  | "Trail";

const SUITS: Suit[] = ["S", "H", "D", "C"];

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

export const SUIT_SYMBOL: Record<Suit, string> = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
};

export const SUIT_IS_RED: Record<Suit, boolean> = {
  S: false,
  H: true,
  D: true,
  C: false,
};

// Build and shuffle a full 52-card deck
export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Normal Teen Patti category strength (higher = stronger in NORMAL play)
const CATEGORY_STRENGTH: Record<HandCategory, number> = {
  "High Card": 1,
  Pair: 2,
  Color: 3,
  Sequence: 4,
  "Pure Sequence": 5,
  Trail: 6,
};

export interface EvaluatedHand {
  cards: Card[];
  category: HandCategory;
  // tiebreak ranks sorted descending (normal comparison)
  ranks: number[];
}

function isSequence(sorted: number[]): boolean {
  // sorted descending
  // Special case A-2-3
  if (sorted[0] === 14 && sorted[1] === 3 && sorted[2] === 2) return true;
  return sorted[0] - 1 === sorted[1] && sorted[1] - 1 === sorted[2];
}

export function evaluateHand(cards: Card[]): EvaluatedHand {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);
  const seq = isSequence(ranks);

  const counts: Record<number, number> = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const countValues = Object.values(counts).sort((a, b) => b - a);

  let category: HandCategory;
  let tieRanks = ranks;

  if (countValues[0] === 3) {
    category = "Trail";
  } else if (seq && isFlush) {
    category = "Pure Sequence";
    // normalize A-2-3 as low straight for tiebreak
    if (ranks[0] === 14 && ranks[1] === 3 && ranks[2] === 2) tieRanks = [3, 2, 1];
  } else if (seq) {
    category = "Sequence";
    if (ranks[0] === 14 && ranks[1] === 3 && ranks[2] === 2) tieRanks = [3, 2, 1];
  } else if (isFlush) {
    category = "Color";
  } else if (countValues[0] === 2) {
    category = "Pair";
    // order: pair rank first, then kicker
    const pairRank = Number(
      Object.keys(counts).find((k) => counts[Number(k)] === 2)
    );
    const kicker = Number(
      Object.keys(counts).find((k) => counts[Number(k)] === 1)
    );
    tieRanks = [pairRank, pairRank, kicker];
  } else {
    category = "High Card";
  }

  return { cards, category, ranks: tieRanks };
}

// Compare two hands under MUFLIS rules.
// Returns > 0 if hand A WINS (is lower/weaker), < 0 if hand B wins, 0 if tie.
export function compareMuflis(a: EvaluatedHand, b: EvaluatedHand): number {
  const sa = CATEGORY_STRENGTH[a.category];
  const sb = CATEGORY_STRENGTH[b.category];
  // Lower normal strength wins in Muflis
  if (sa !== sb) return sb - sa;
  // Same category: lower ranks win in Muflis -> compare ascending
  for (let i = 0; i < 3; i++) {
    if (a.ranks[i] !== b.ranks[i]) return b.ranks[i] - a.ranks[i];
  }
  return 0;
}

export interface DealResult {
  playerHand: EvaluatedHand;
  dealerHand: EvaluatedHand;
  playerWins: boolean;
}

// Deal a rigged round with the desired outcome for the player.
// If tie occurs, re-deal until decisive.
export function dealRigged(playerShouldWin: boolean): DealResult {
  // Guard against infinite loop
  for (let attempt = 0; attempt < 200; attempt++) {
    const deck = shuffle(buildDeck());
    const handA = evaluateHand(deck.slice(0, 3));
    const handB = evaluateHand(deck.slice(3, 6));
    const cmp = compareMuflis(handA, handB); // >0 => A wins
    if (cmp === 0) continue; // tie, re-deal

    const aWins = cmp > 0;
    // We want player outcome === playerShouldWin.
    // Assign the winning hand to whoever should win.
    let playerHand: EvaluatedHand;
    let dealerHand: EvaluatedHand;
    if (playerShouldWin) {
      playerHand = aWins ? handA : handB;
      dealerHand = aWins ? handB : handA;
    } else {
      dealerHand = aWins ? handA : handB;
      playerHand = aWins ? handB : handA;
    }
    return { playerHand, dealerHand, playerWins: playerShouldWin };
  }
  throw new Error("Muflis could not deal a decisive hand. Retry the same wager.");
}

export const WIN_PROBABILITY = 0.35;

export function decideOutcome(): boolean {
  return Math.random() < WIN_PROBABILITY;
}
