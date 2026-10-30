// Teen Patti game engine — pure client-side logic, no database.
// Hand rankings follow standard Teen Patti rules:
// Trail > Pure Sequence > Sequence > Color > Pair > High Card (ties go to dealer).

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

export interface PlayingCard {
  rank: number; // 2..14 (11=J, 12=Q, 13=K, 14=A)
  suit: Suit;
  id: string;
}

export type HandCategory = 0 | 1 | 2 | 3 | 4 | 5;

export interface HandScore {
  category: HandCategory;
  kickers: number[];
  name: string;
}

export interface DealtHands {
  player: [PlayingCard, PlayingCard, PlayingCard];
  dealer: [PlayingCard, PlayingCard, PlayingCard];
  playerScore: HandScore;
  dealerScore: HandScore;
  playerWins: boolean;
}

export const WIN_RATIO = 0.35;
export const ANTE = 10; // fixed boot amount per round (house fee)
export const MIN_BET = 10;
export const STARTING_BALANCE = 10000;
export const CHIP_VALUES = [10, 50, 100, 500, 1000, 5000] as const;

export const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

const RANK_LABELS: Record<number, string> = {
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

export function rankLabel(rank: number): string {
  return RANK_LABELS[rank] ?? String(rank);
}

export function isRedSuit(suit: Suit): boolean {
  return suit === "hearts" || suit === "diamonds";
}

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];

export function buildDeck(): PlayingCard[] {
  const deck: PlayingCard[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ rank, suit, id: `${rank}-${suit}` });
    }
  }
  return deck;
}

export function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function evaluateHand(
  cards: [PlayingCard, PlayingCard, PlayingCard],
): HandScore {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);
  const isTrail = ranks[0] === ranks[2];
  const isPair = ranks[0] === ranks[1] || ranks[1] === ranks[2];

  // Sequence: three consecutive ranks; A-2-3 (wheel) counts, high card = 3.
  let isSequence = false;
  let sequenceHigh = 0;
  const unique = [...new Set(ranks)];
  if (unique.length === 3) {
    if (ranks[0] - ranks[2] === 2) {
      isSequence = true;
      sequenceHigh = ranks[0];
    } else if (ranks[0] === 14 && ranks[1] === 3 && ranks[2] === 2) {
      isSequence = true;
      sequenceHigh = 3; // 5-high beats the wheel
    }
  }

  if (isTrail) {
    return { category: 5, kickers: [ranks[0]], name: "Trail" };
  }
  if (isSequence && isFlush) {
    return { category: 4, kickers: [sequenceHigh], name: "Pure Sequence" };
  }
  if (isSequence) {
    return { category: 3, kickers: [sequenceHigh], name: "Sequence" };
  }
  if (isFlush) {
    return { category: 2, kickers: ranks, name: "Color" };
  }
  if (isPair) {
    const pairRank = ranks[0] === ranks[1] ? ranks[0] : ranks[1];
    const kicker = ranks.find((r) => r !== pairRank) ?? 0;
    return { category: 1, kickers: [pairRank, kicker], name: "Pair" };
  }
  return { category: 0, kickers: ranks, name: "High Card" };
}

/** Positive => a beats b, negative => b beats a, 0 => tie (dealer wins). */
export function compareHands(a: HandScore, b: HandScore): number {
  if (a.category !== b.category) return a.category - b.category;
  const len = Math.max(a.kickers.length, b.kickers.length);
  for (let i = 0; i < len; i++) {
    const diff = (a.kickers[i] ?? 0) - (b.kickers[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Deals player vs dealer hands. The outcome is weighted so the player wins
 * WIN_RATIO (35%) of the time and loses 65% of the time. Hands are still
 * dealt naturally from a shuffled deck — the losing side is re-dealt until
 * the weighted outcome is satisfied, so card play always looks fair.
 */
export function dealHands(winRatio: number = WIN_RATIO): DealtHands {
  const shouldWin = Math.random() < winRatio;

  for (let attempt = 0; attempt < 1000; attempt++) {
    const deck = shuffle(buildDeck());
    const player = [deck[0], deck[1], deck[2]] as [
      PlayingCard,
      PlayingCard,
      PlayingCard,
    ];
    const dealer = [deck[3], deck[4], deck[5]] as [
      PlayingCard,
      PlayingCard,
      PlayingCard,
    ];
    const playerScore = evaluateHand(player);
    const dealerScore = evaluateHand(dealer);
    const playerWins = compareHands(playerScore, dealerScore) > 0;

    if (playerWins === shouldWin || attempt === 999) {
      return { player, dealer, playerScore, dealerScore, playerWins };
    }
  }

  // Unreachable, but keeps the type checker happy.
  const deck = shuffle(buildDeck());
  const player = [deck[0], deck[1], deck[2]] as [
    PlayingCard,
    PlayingCard,
    PlayingCard,
  ];
  const dealer = [deck[3], deck[4], deck[5]] as [
    PlayingCard,
    PlayingCard,
    PlayingCard,
  ];
  const playerScore = evaluateHand(player);
  const dealerScore = evaluateHand(dealer);
  return {
    player,
    dealer,
    playerScore,
    dealerScore,
    playerWins: compareHands(playerScore, dealerScore) > 0,
  };
}

export function formatINR(amount: number): string {
  return `Rs. ${amount.toLocaleString("en-PK")}`;
}

export const HAND_RANKINGS: { name: string; desc: string; example: string }[] = [
  {
    name: "Trail",
    desc: "Three cards of the same rank — the strongest hand",
    example: "Q♠ Q♥ Q♦",
  },
  {
    name: "Pure Sequence",
    desc: "Three consecutive cards of the same suit",
    example: "A♥ 2♥ 3♥",
  },
  {
    name: "Sequence",
    desc: "Three consecutive cards of mixed suits (A-2-3 counts)",
    example: "7♠ 8♦ 9♣",
  },
  {
    name: "Color",
    desc: "Three cards of the same suit, not in sequence",
    example: "K♣ 9♣ 2♣",
  },
  {
    name: "Pair",
    desc: "Two cards of the same rank",
    example: "J♦ J♠ 5♥",
  },
  {
    name: "High Card",
    desc: "None of the above — highest card decides",
    example: "A♠ 7♦ 2♣",
  },
];
