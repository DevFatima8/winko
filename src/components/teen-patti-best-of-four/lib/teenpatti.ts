// ─────────────────────────────────────────────────────────────
// Teen Patti — Best of Four · pure game engine (no database)
// ─────────────────────────────────────────────────────────────

export type Suit = "S" | "H" | "D" | "C";
export const SUITS: Suit[] = ["S", "H", "D", "C"];

export interface PCard {
  rank: number; // 2..14 (J=11, Q=12, K=13, A=14)
  suit: Suit;
  id: string;
}

export const RANK_LABEL: Record<number, string> = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8",
  9: "9", 10: "10", 11: "J", 12: "Q", 13: "K", 14: "A",
};

// 5 = Trail, 4 = Pure Sequence, 3 = Sequence, 2 = Color, 1 = Pair, 0 = High Card
export type Category = 0 | 1 | 2 | 3 | 4 | 5;

export const CATEGORY_NAME: Record<Category, string> = {
  5: "Trail",
  4: "Pure Sequence",
  3: "Sequence",
  2: "Color",
  1: "Pair",
  0: "High Card",
};

export interface HandEval {
  category: Category;
  tiebreak: number[];
  best: PCard[];        // the 3 cards forming the best hand
  leftover: PCard | null; // the unused 4th card (only set by bestOfFour)
}

export function buildDeck(): PCard[] {
  const deck: PCard[] = [];
  for (const s of SUITS) {
    for (let r = 2; r <= 14; r++) deck.push({ rank: r, suit: s, id: `${s}${r}` });
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

export function evaluateThree(cards: PCard[]): HandEval {
  const desc = cards.map((c) => c.rank).sort((a, b) => b - a);
  const asc = [...desc].reverse();
  const sameSuit = cards.every((c) => c.suit === cards[0].suit);
  const isTrail = desc[0] === desc[1] && desc[1] === desc[2];

  // Sequence detection. Order (high → low): A-K-Q, A-2-3, K-Q-J … 4-3-2
  let isSeq = asc[1] === asc[0] + 1 && asc[2] === asc[1] + 1;
  let seqHigh = asc[2];
  if (asc[0] === 2 && asc[1] === 3 && asc[2] === 14) {
    isSeq = true;
    seqHigh = 13.5; // A-2-3 sits just below A-K-Q (14) and above K-Q-J (13)
  }

  let category: Category = 0;
  let tiebreak: number[] = desc;

  if (isTrail) {
    category = 5;
    tiebreak = [desc[0]];
  } else if (isSeq && sameSuit) {
    category = 4;
    tiebreak = [seqHigh];
  } else if (isSeq) {
    category = 3;
    tiebreak = [seqHigh];
  } else if (sameSuit) {
    category = 2;
    tiebreak = desc;
  } else {
    let pairRank = 0;
    if (desc[0] === desc[1]) pairRank = desc[0];
    else if (desc[1] === desc[2]) pairRank = desc[1];
    if (pairRank) {
      category = 1;
      tiebreak = [pairRank, desc.find((r) => r !== pairRank)!];
    }
  }

  return { category, tiebreak, best: cards, leftover: null };
}

export function compareEval(a: HandEval, b: HandEval): number {
  if (a.category !== b.category) return a.category - b.category;
  const n = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < n; i++) {
    const d = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Pick the strongest 3-card hand out of 4 cards. */
export function bestOfFour(cards: PCard[]): HandEval {
  let best: HandEval | null = null;
  for (let drop = 0; drop < 4; drop++) {
    const ev = evaluateThree(cards.filter((_, i) => i !== drop));
    if (!best || compareEval(ev, best) > 0) {
      ev.leftover = cards[drop];
      best = ev;
    }
  }
  return best!;
}

export interface DealResult {
  player: PCard[];
  dealer: PCard[];
  playerEval: HandEval;
  dealerEval: HandEval;
  outcome: "win" | "loss";
}


export function dealRigged(winChance = 0.35): DealResult {
  const playerWins = Math.random() < winChance;
  for (; ;) {
    const deck = shuffle(buildDeck());
    const p = deck.slice(0, 4);
    const d = deck.slice(4, 8);
    const pe = bestOfFour(p);
    const de = bestOfFour(d);
    const cmp = compareEval(pe, de);
    if (cmp === 0) continue; // exact tie → redeal
    const pWins = cmp > 0;
    if (pWins === playerWins) {
      return { player: p, dealer: d, playerEval: pe, dealerEval: de, outcome: playerWins ? "win" : "loss" };
    }
    // swap hands so the pre-decided outcome holds
    return { player: d, dealer: p, playerEval: de, dealerEval: pe, outcome: playerWins ? "win" : "loss" };
  }
}

export const fmtINR = (n: number) => "Rs. " + n.toLocaleString("en-PK");
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
