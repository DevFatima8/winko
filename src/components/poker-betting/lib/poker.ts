export type Suit = "♠" | "♥" | "♦" | "♣";
export interface Card {
  rank: number; // 2..14 (14 = Ace)
  suit: Suit;
}

export const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
export const RANK_LABEL: Record<number, string> = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10",
  11: "J", 12: "Q", 13: "K", 14: "A",
};

export const HAND_NAMES = [
  "High Card",
  "One Pair",
  "Two Pair",
  "Three of a Kind",
  "Straight",
  "Flush",
  "Full House",
  "Four of a Kind",
  "Straight Flush",
  "Royal Flush",
];

// Payout multipliers on win (based on the player's hand strength)
export const PAYOUTS = [1, 1, 2, 3, 4, 6, 9, 25, 50, 100];

export const WIN_RATE = 0.35;

export function newDeck(): Card[] {
  const d: Card[] = [];
  for (const suit of SUITS) for (let r = 2; r <= 14; r++) d.push({ rank: r, suit });
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export interface HandScore {
  category: number; // index in HAND_NAMES
  tiebreak: number[];
  value: number; // comparable numeric value
}

export function evaluate(cards: Card[]): HandScore {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const isFlush = cards.every((c) => c.suit === cards[0].suit);
  const uniq = [...new Set(ranks)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq.join(",") === "14,5,4,3,2") straightHigh = 5;
  }
  const isStraight = straightHigh > 0;

  let category = 0;
  let tiebreak: number[] = ranks;
  if (isStraight && isFlush) {
    category = straightHigh === 14 ? 9 : 8;
    tiebreak = [straightHigh];
  } else if (groups[0][1] === 4) {
    category = 7;
    tiebreak = [groups[0][0], groups[1][0]];
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    category = 6;
    tiebreak = [groups[0][0], groups[1][0]];
  } else if (isFlush) {
    category = 5;
  } else if (isStraight) {
    category = 4;
    tiebreak = [straightHigh];
  } else if (groups[0][1] === 3) {
    category = 3;
    tiebreak = [groups[0][0], ...groups.slice(1).map((g) => g[0])];
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    category = 2;
    tiebreak = [groups[0][0], groups[1][0], groups[2][0]];
  } else if (groups[0][1] === 2) {
    category = 1;
    tiebreak = [groups[0][0], ...groups.slice(1).map((g) => g[0])];
  }
  let value = category;
  for (const t of tiebreak) value = value * 15 + t;
  for (let i = tiebreak.length; i < 5; i++) value = value * 15;
  return { category, tiebreak, value };
}

export interface DealResult {
  player: Card[];
  dealer: Card[];
  playerScore: HandScore;
  dealerScore: HandScore;
  playerWins: boolean;
}

/**
 * Deals a round where the house edge is enforced:
 * the player wins exactly WIN_RATE (35%) of the time on average.
 */
export function dealRound(shouldWin = Math.random() < WIN_RATE): DealResult {
  for (let attempt = 0; attempt < 50; attempt++) {
    const deck = newDeck();
    let a = deck.slice(0, 5);
    let b = deck.slice(5, 10);
    let sa = evaluate(a);
    let sb = evaluate(b);
    if (sa.value === sb.value) continue; // avoid ties, redeal
    const aBetter = sa.value > sb.value;
    if (aBetter !== shouldWin) {
      [a, b] = [b, a];
      [sa, sb] = [sb, sa];
    }
    return { player: a, dealer: b, playerScore: sa, dealerScore: sb, playerWins: shouldWin };
  }
  throw new Error("Poker could not deal a decisive hand. Retry the same wager.");
}
