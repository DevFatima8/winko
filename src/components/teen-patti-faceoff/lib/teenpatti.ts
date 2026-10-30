/**
 * Teen Patti Face Off — game engine
 * ---------------------------------
 * Pure, dependency-free logic: deck handling, 3-card (Teen Patti) hand
 * evaluation, 5-of-6 bonus evaluation, paytables, bet settlement and the
 */

export type Suit = "S" | "H" | "D" | "C";

export interface Card {
  /** 2..14 (14 = Ace) */
  rank: number;
  suit: Suit;
  /** stable id, e.g. "14S" */
  id: string;
}

export const SUITS: Suit[] = ["S", "H", "D", "C"];

export const SUIT_SYMBOL: Record<Suit, string> = {
  S: "\u2660",
  H: "\u2665",
  D: "\u2666",
  C: "\u2663",
};

export const SUIT_IS_RED: Record<Suit, boolean> = {
  S: false,
  H: true,
  D: true,
  C: false,
};

export function rankLabel(rank: number): string {
  if (rank === 14) return "A";
  if (rank === 13) return "K";
  if (rank === 12) return "Q";
  if (rank === 11) return "J";
  return String(rank);
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank += 1) {
      deck.push({ rank, suit, id: `${rank}${suit}` });
    }
  }
  return deck;
}

export function shuffle<T>(input: T[]): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr;
}

/* ------------------------------------------------------------------ */
/* 3-card (Teen Patti) evaluation                                      */
/* ------------------------------------------------------------------ */

export type Hand3Category =
  | "trail"
  | "pure_sequence"
  | "sequence"
  | "colour"
  | "pair"
  | "high_card";

const CATEGORY_RANK: Record<Hand3Category, number> = {
  trail: 6,
  pure_sequence: 5,
  sequence: 4,
  colour: 3,
  pair: 2,
  high_card: 1,
};

const CATEGORY_LABEL: Record<Hand3Category, string> = {
  trail: "Trail",
  pure_sequence: "Pure Sequence",
  sequence: "Sequence",
  colour: "Colour",
  pair: "Pair",
  high_card: "High Card",
};

export interface Hand3Eval {
  category: Hand3Category;
  label: string;
  orderedRanks: number[];
  score: number;
  isRoyal: boolean;
}

function score3(category: Hand3Category, ordered: number[]): number {
  const [a = 0, b = 0, c = 0] = ordered;
  return CATEGORY_RANK[category] * 100000 + a * 10000 + b * 100 + c;
}

export function evaluate3(cards: Card[]): Hand3Eval {
  const desc = cards.map((c) => c.rank).sort((x, y) => y - x);
  const [a = 0, b = 0, c = 0] = desc;
  const isFlush = new Set(cards.map((card) => card.suit)).size === 1;
  const isAceWheel = a === 14 && b === 3 && c === 2;
  const isStraight = a - b === 1 && b - c === 1;
  const straightRanks = isAceWheel ? [3, 2, 1] : desc;
  const isTrips = a === b && b === c;
  const isPair = a === b || b === c;

  if (isTrips) {
    return {
      category: "trail",
      label: `${rankLabel(a)} Trail`,
      orderedRanks: [a, a, a],
      score: score3("trail", [a, a, a]),
      isRoyal: false,
    };
  }
  if (isStraight && isFlush) {
    const royal = a === 14 && b === 13 && c === 12;
    return {
      category: "pure_sequence",
      label: royal ? "Royal Flush" : "Pure Sequence",
      orderedRanks: straightRanks,
      score: score3("pure_sequence", straightRanks),
      isRoyal: royal,
    };
  }
  if (isStraight || isAceWheel) {
    return {
      category: "sequence",
      label: "Sequence",
      orderedRanks: straightRanks,
      score: score3("sequence", straightRanks),
      isRoyal: false,
    };
  }
  if (isFlush) {
    return {
      category: "colour",
      label: "Colour",
      orderedRanks: desc,
      score: score3("colour", desc),
      isRoyal: false,
    };
  }
  if (isPair) {
    const pairRank = a === b ? a : b;
    const kicker = a === b ? c : a;
    const ordered = [pairRank, pairRank, kicker];
    return {
      category: "pair",
      label: `Pair of ${rankLabel(pairRank)}s`,
      orderedRanks: ordered,
      score: score3("pair", ordered),
      isRoyal: false,
    };
  }
  return {
    category: "high_card",
    label: `${rankLabel(a)} High`,
    orderedRanks: desc,
    score: score3("high_card", desc),
    isRoyal: false,
  };
}

/** Pair Plus paytable (to 1). 0 = losing hand. */
export const PAIR_PLUS_PAYOUT: Record<Hand3Category, number> = {
  pure_sequence: 40, // royal flush detected separately
  trail: 30,
  sequence: 5,
  colour: 4,
  pair: 1,
  high_card: 0,
};

export const ROYAL_FLUSH_PAYOUT = 100;

export function pairPlusMultiplier(evaluation: Hand3Eval): number {
  if (evaluation.isRoyal) return ROYAL_FLUSH_PAYOUT;
  return PAIR_PLUS_PAYOUT[evaluation.category] ?? 0;
}

/* ------------------------------------------------------------------ */
/* 5-card evaluation (for the 3+3 Bonus side bet)                      */
/* ------------------------------------------------------------------ */

export type Hand5Category =
  | "royal_flush"
  | "straight_flush"
  | "four_of_a_kind"
  | "full_house"
  | "flush"
  | "straight"
  | "three_of_a_kind"
  | "two_pair"
  | "pair"
  | "high_card";

const HAND5_RANK: Record<Hand5Category, number> = {
  royal_flush: 10,
  straight_flush: 9,
  four_of_a_kind: 8,
  full_house: 7,
  flush: 6,
  straight: 5,
  three_of_a_kind: 4,
  two_pair: 3,
  pair: 2,
  high_card: 1,
};

const HAND5_LABEL: Record<Hand5Category, string> = {
  royal_flush: "Royal Flush",
  straight_flush: "Straight Flush",
  four_of_a_kind: "Four of a Kind",
  full_house: "Full House",
  flush: "Flush",
  straight: "Straight",
  three_of_a_kind: "Three of a Kind",
  two_pair: "Two Pair",
  pair: "Pair",
  high_card: "High Card",
};

export interface Hand5Eval {
  category: Hand5Category;
  label: string;
  score: number;
  ordered: number[];
}

function score5(category: Hand5Category, ordered: number[]): number {
  let score = HAND5_RANK[category] * 10000000;
  for (let i = 0; i < ordered.length; i += 1) {
    score += (ordered[i] ?? 0) * Math.pow(15, 4 - i);
  }
  return score;
}

export function evaluate5(cards: Card[]): Hand5Eval {
  const desc = cards.map((c) => c.rank).sort((x, y) => y - x);
  const isFlush = new Set(cards.map((card) => card.suit)).size === 1;

  const counts = new Map<number, number>();
  for (const rank of desc) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  const groups = Array.from(counts.entries())
    .map(([rank, count]) => ({ rank, count }))
    .sort((x, y) => (y.count - x.count) || (y.rank - x.rank));
  const ordered = groups.map((g) => g.rank);

  const unique = groups.length === 5;
  const a = desc[0] ?? 0;
  const e = desc[4] ?? 0;
  const isRun = unique && a - e === 4;
  const isWheel = unique && a === 14 && (desc[1] ?? 0) === 5 && e === 2;
  const straightHigh = isWheel ? 5 : a;
  const isStraight = isRun || isWheel;

  if (isStraight && isFlush) {
    const royal = isRun && a === 14;
    const cat: Hand5Category = royal ? "royal_flush" : "straight_flush";
    return {
      category: cat,
      label: HAND5_LABEL[cat],
      score: score5(cat, [straightHigh]),
      ordered: [straightHigh],
    };
  }
  if (groups[0]?.count === 4) {
    return { category: "four_of_a_kind", label: HAND5_LABEL.four_of_a_kind, score: score5("four_of_a_kind", ordered), ordered };
  }
  if (groups[0]?.count === 3 && groups[1]?.count === 2) {
    return { category: "full_house", label: HAND5_LABEL.full_house, score: score5("full_house", ordered), ordered };
  }
  if (isFlush) {
    return { category: "flush", label: HAND5_LABEL.flush, score: score5("flush", desc), ordered: desc };
  }
  if (isStraight) {
    return { category: "straight", label: HAND5_LABEL.straight, score: score5("straight", [straightHigh]), ordered: [straightHigh] };
  }
  if (groups[0]?.count === 3) {
    return { category: "three_of_a_kind", label: HAND5_LABEL.three_of_a_kind, score: score5("three_of_a_kind", ordered), ordered };
  }
  if (groups[0]?.count === 2 && groups[1]?.count === 2) {
    return { category: "two_pair", label: HAND5_LABEL.two_pair, score: score5("two_pair", ordered), ordered };
  }
  if (groups[0]?.count === 2) {
    return { category: "pair", label: HAND5_LABEL.pair, score: score5("pair", ordered), ordered };
  }
  return { category: "high_card", label: HAND5_LABEL.high_card, score: score5("high_card", desc), ordered: desc };
}

/** Best 5-card poker hand that can be made out of the six dealt cards. */
export function best5of6(cards: Card[]): Hand5Eval {
  let best: Hand5Eval | null = null;
  for (let skip = 0; skip < cards.length; skip += 1) {
    const hand = cards.filter((_, index) => index !== skip);
    if (hand.length !== 5) continue;
    const evaluation = evaluate5(hand);
    if (!best || evaluation.score > best.score) best = evaluation;
  }
  return (
    best ?? { category: "high_card", label: HAND5_LABEL.high_card, score: 0, ordered: [] }
  );
}

export const BONUS_PAYOUT: Partial<Record<Hand5Category, number>> = {
  royal_flush: 1000,
  straight_flush: 200,
  four_of_a_kind: 100,
  full_house: 20,
  flush: 15,
  straight: 10,
  three_of_a_kind: 7,
};

export function bonusMultiplier(evaluation: Hand5Eval): number {
  return BONUS_PAYOUT[evaluation.category] ?? 0;
}

/* ------------------------------------------------------------------ */
/* Bets & settlement                                                   */
/* ------------------------------------------------------------------ */

export const BET_SPOTS = ["A", "B", "TIE", "PP_A", "PP_B", "BONUS"] as const;
export type BetSpotId = (typeof BET_SPOTS)[number];

export type Bets = Record<BetSpotId, number>;

export const EMPTY_BETS: Bets = { A: 0, B: 0, TIE: 0, PP_A: 0, PP_B: 0, BONUS: 0 };

export const MAIN_PAYOUT = 0.95; // Player A / Player B
export const TIE_PAYOUT = 50; // to 1

export const MIN_BET = 10;

export interface SpotOutcome {
  spot: BetSpotId;
  stake: number;
  status: "win" | "lose" | "push";
  /** total return multiple including stake (0 when lost) */
  returnMultiple: number;
  returned: number;
  profit: number;
  reason?: string;
}

export interface RoundOutcome {
  handA: Card[];
  handB: Card[];
  evalA: Hand3Eval;
  evalB: Hand3Eval;
  winner: "A" | "B" | "TIE";
  best5: Hand5Eval;
  spots: SpotOutcome[];
  totalStake: number;
  totalReturned: number;
  net: number;
  playerWon: boolean;
}

export function compareHands(a: Hand3Eval, b: Hand3Eval): number {
  return a.score - b.score;
}

export function settle(handA: Card[], handB: Card[], bets: Bets): RoundOutcome {
  const evalA = evaluate3(handA);
  const evalB = evaluate3(handB);
  const diff = compareHands(evalA, evalB);
  const winner: "A" | "B" | "TIE" = diff > 0 ? "A" : diff < 0 ? "B" : "TIE";
  const best5 = best5of6([...handA, ...handB]);

  const ppA = pairPlusMultiplier(evalA);
  const ppB = pairPlusMultiplier(evalB);
  const bonus = bonusMultiplier(best5);

  const spots: SpotOutcome[] = [];

  const mainOutcome = (spot: BetSpotId, stake: number, isWinner: boolean): SpotOutcome => {
    if (stake <= 0) {
      return { spot, stake, status: "lose", returnMultiple: 0, returned: 0, profit: 0 };
    }
    if (winner === "TIE") {
      return { spot, stake, status: "push", returnMultiple: 1, returned: stake, profit: 0, reason: "Tie — bet returned" };
    }
    if (isWinner) {
      const returned = stake * (1 + MAIN_PAYOUT);
      return { spot, stake, status: "win", returnMultiple: 1 + MAIN_PAYOUT, returned, profit: returned - stake };
    }
    return { spot, stake, status: "lose", returnMultiple: 0, returned: 0, profit: -stake };
  };

  spots.push(mainOutcome("A", bets.A, winner === "A"));
  spots.push(mainOutcome("B", bets.B, winner === "B"));

  const tieOutcome: SpotOutcome =
    bets.TIE <= 0
      ? { spot: "TIE", stake: 0, status: "lose", returnMultiple: 0, returned: 0, profit: 0 }
      : winner === "TIE"
        ? { spot: "TIE", stake: bets.TIE, status: "win", returnMultiple: 1 + TIE_PAYOUT, returned: bets.TIE * (1 + TIE_PAYOUT), profit: bets.TIE * TIE_PAYOUT }
        : { spot: "TIE", stake: bets.TIE, status: "lose", returnMultiple: 0, returned: 0, profit: -bets.TIE };

  spots.push(tieOutcome);

  const sideOutcome = (spot: BetSpotId, stake: number, multiplier: number, reason?: string): SpotOutcome => {
    if (stake <= 0) {
      return { spot, stake, status: "lose", returnMultiple: 0, returned: 0, profit: 0 };
    }
    if (multiplier > 0) {
      const returned = stake * (1 + multiplier);
      return { spot, stake, status: "win", returnMultiple: 1 + multiplier, returned, profit: returned - stake, reason };
    }
    return { spot, stake, status: "lose", returnMultiple: 0, returned: 0, profit: -stake };
  };

  spots.push(sideOutcome("PP_A", bets.PP_A, ppA, evalA.label));
  spots.push(sideOutcome("PP_B", bets.PP_B, ppB, evalB.label));
  spots.push(sideOutcome("BONUS", bets.BONUS, bonus, best5.label));

  const totalStake = BET_SPOTS.reduce((sum, spot) => sum + (bets[spot] ?? 0), 0);
  const totalReturned = spots.reduce((sum, spot) => sum + spot.returned, 0);

  return {
    handA,
    handB,
    evalA,
    evalB,
    winner,
    best5,
    spots,
    totalStake,
    totalReturned,
    net: totalReturned - totalStake,
    playerWon: totalStake > 0 && totalReturned > totalStake,
  };
}


export const WIN_RATE_TARGET = 0.35;
export const LOSS_RATE_TARGET = 0.65;

export interface SessionStats {
  rounds: number;
  wins: number;
  losses: number;
  pushes: number;
  wagered: number;
  returned: number;
}

export const EMPTY_STATS: SessionStats = {
  rounds: 0,
  wins: 0,
  losses: 0,
  pushes: 0,
  wagered: 0,
  returned: 0,
};


export function winProbability(stats: SessionStats): number {
  const decided = stats.wins + stats.losses;
  if (decided < 4) return WIN_RATE_TARGET;
  const drift = stats.wins - WIN_RATE_TARGET * decided; // > 0 => too many wins
  const correction = drift * 0.08;
  return Math.min(0.6, Math.max(0.12, WIN_RATE_TARGET - correction));
}

export type Target = "win" | "lose";

export function pickTarget(stats: SessionStats): Target {
  return Math.random() < winProbability(stats) ? "win" : "lose";
}

export interface Deal {
  handA: Card[];
  handB: Card[];
}

export function randomDeal(): Deal {
  const deck = shuffle(createDeck());
  return {
    handA: deck.slice(0, 3),
    handB: deck.slice(3, 6),
  };
}

/**
 * Produces a shuffled-deal whose settlement matches the requested target.
 * The deck itself is always fully random — we only re-roll until the
 * outcome class (net win / net loss for the placed bets) matches.
 */
export function dealForTarget(bets: Bets, target: Target, attempts = 900): Deal {
  const totalStake = BET_SPOTS.reduce((sum, spot) => sum + (bets[spot] ?? 0), 0);
  let fallback = randomDeal();
  if (totalStake <= 0) return fallback;

  for (let i = 0; i < attempts; i += 1) {
    const deal = i === 0 ? fallback : randomDeal();
    const outcome = settle(deal.handA, deal.handB, bets);
    const isWin = outcome.totalReturned > outcome.totalStake + 1e-9;
    if (isWin === (target === "win")) return deal;
    fallback = deal;
  }
  return fallback;
}

/* ------------------------------------------------------------------ */
/* misc helpers                                                        */
/* ------------------------------------------------------------------ */

export function formatChips(value: number): string {
  const rounded = Math.round(value);
  return rounded.toLocaleString("en-US");
}

export function totalBet(bets: Bets): number {
  return BET_SPOTS.reduce((sum, spot) => sum + (bets[spot] ?? 0), 0);
}

export function isBetsEmpty(bets: Bets): boolean {
  return totalBet(bets) === 0;
}
