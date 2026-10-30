// Teen Patti AK47 — core game logic (pure, no database).
// In the AK47 variant, every A, K, 4 and 7 is a WILD (joker) card.

export type Suit = 0 | 1 | 2 | 3; // ♠ ♥ ♦ ♣

export interface Card {
  rank: number; // 2..14 (11=J, 12=Q, 13=K, 14=A)
  suit: Suit;
}

export const RANK_LABELS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const SUIT_SYMBOLS: readonly string[] = ["♠", "♥", "♦", "♣"];

export const WIN_RATE = 0.35;

/** Teen Patti hand categories (higher = stronger). */
export type HandCategory = 1 | 2 | 3 | 4 | 5 | 6;

export interface HandEval {
  category: HandCategory;
  tiebreak: number[];
  label: string;
  score: number;
}

const CATEGORY_LABELS: Record<HandCategory, string> = {
  1: "High Card",
  2: "Pair",
  3: "Color",
  4: "Sequence",
  5: "Pure Sequence",
  6: "Trail",
};

/** Pair Plus side-bet payout multiplier (wins paid as multiplier:1, stake returned too). */
export const PAIR_PLUS_PAYOUT: Record<HandCategory, number> = {
  1: 0,
  2: 1,
  3: 3,
  4: 5,
  5: 6,
  6: 30,
};

/** A, K, 4 and 7 are wild in the AK47 variant. */
export function isWild(card: Card): boolean {
  return card.rank === 14 || card.rank === 13 || card.rank === 4 || card.rank === 7;
}

export function cardKey(card: Card): number {
  return card.rank * 4 + card.suit;
}

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (let rank = 2; rank <= 14; rank++) {
    for (let suit = 0; suit < 4; suit++) {
      deck.push({ rank, suit: suit as Suit });
    }
  }
  return deck;
}

export function shuffle<T>(input: readonly T[]): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Evaluate 3 cards with NO wilds. */
export function evaluateHand(cards: readonly Card[]): HandEval {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const trail = ranks[0] === ranks[2];

  let sequence = false;
  let seqHigh = 0;
  if (ranks[0] - ranks[1] === 1 && ranks[1] - ranks[2] === 1) {
    sequence = true;
    seqHigh = ranks[0];
  } else if (ranks[0] === 14 && ranks[1] === 3 && ranks[2] === 2) {
    // A-2-3 "wheel" — the lowest sequence in Teen Patti.
    sequence = true;
    seqHigh = 3;
  }

  let category: HandCategory;
  let tiebreak: number[];
  if (trail) {
    category = 6;
    tiebreak = [ranks[0]];
  } else if (sequence && flush) {
    category = 5;
    tiebreak = [seqHigh];
  } else if (sequence) {
    category = 4;
    tiebreak = [seqHigh];
  } else if (flush) {
    category = 3;
    tiebreak = ranks;
  } else if (ranks[0] === ranks[1] || ranks[1] === ranks[2]) {
    category = 2;
    tiebreak = ranks[0] === ranks[1] ? [ranks[0], ranks[2]] : [ranks[1], ranks[0]];
  } else {
    category = 1;
    tiebreak = ranks;
  }

  const score =
    ((category * 15 + tiebreak[0]) * 15 + (tiebreak[1] ?? 0)) * 15 + (tiebreak[2] ?? 0);

  return { category, tiebreak, label: CATEGORY_LABELS[category], score };
}

/** Evaluate 3 cards where A/K/4/7 are wild — picks the best possible made hand. */
export function evaluateWithWilds(cards: readonly Card[]): HandEval {
  const wildIndexes = cards.map((c, i) => (isWild(c) ? i : -1)).filter((i) => i >= 0);
  if (wildIndexes.length === 0) return evaluateHand(cards);

  const used = new Set(cards.filter((c) => !isWild(c)).map(cardKey));
  const allCards = buildDeck();
  const current: Card[] = cards.slice();
  const found: HandEval[] = [];

  const search = (k: number): void => {
    if (k === wildIndexes.length) {
      const ev = evaluateHand(current);
      if (found.length === 0 || ev.score > found[0].score) found[0] = ev;
      return;
    }
    for (const candidate of allCards) {
      const key = cardKey(candidate);
      if (used.has(key)) continue;
      used.add(key);
      current[wildIndexes[k]] = candidate;
      search(k + 1);
      used.delete(key);
    }
  };

  search(0);
  return found[0];
}

export type DealOutcome = "win" | "loss";

export interface RiggedDeal {
  player: Card[];
  dealer: Card[];
  outcome: DealOutcome;
  playerEval: HandEval;
  dealerEval: HandEval;
}

/**
 * Deals one round with a fixed outcome ratio:
 * the player wins exactly WIN_RATE (35%) of rounds and loses 65%.
 * Ties count as dealer wins (standard Teen Patti rule).
 */
export function dealRound(wantWin = Math.random() < WIN_RATE): RiggedDeal {

  for (let attempt = 0; attempt < 1000; attempt++) {
    const deck = shuffle(buildDeck());
    const player = deck.splice(0, 3);
    const dealer = deck.splice(0, 3);
    const playerEval = evaluateWithWilds(player);
    const dealerEval = evaluateWithWilds(dealer);
    const playerWins = playerEval.score > dealerEval.score;
    if (playerWins === wantWin) {
      return { player, dealer, outcome: wantWin ? "win" : "loss", playerEval, dealerEval };
    }
  }

  // Guaranteed fallback (practically unreachable): construct the result by hand.
  const aces: Card[] = [
    { rank: 14, suit: 0 },
    { rank: 14, suit: 1 },
    { rank: 14, suit: 2 },
  ];
  const low: Card[] = [
    { rank: 9, suit: 0 },
    { rank: 5, suit: 1 },
    { rank: 2, suit: 2 },
  ];
  if (wantWin) {
    return {
      player: aces,
      dealer: low,
      outcome: "win",
      playerEval: evaluateWithWilds(aces),
      dealerEval: evaluateWithWilds(low),
    };
  }
  return {
    player: low,
    dealer: aces,
    outcome: "loss",
    playerEval: evaluateWithWilds(low),
    dealerEval: evaluateWithWilds(aces),
  };
}

export function formatINR(amount: number): string {
  return amount.toLocaleString("en-PK");
}
