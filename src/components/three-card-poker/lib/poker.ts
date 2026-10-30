export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank =
  | "A"
  | "K"
  | "Q"
  | "J"
  | "10"
  | "9"
  | "8"
  | "7"
  | "6"
  | "5"
  | "4"
  | "3"
  | "2";

export type HandName =
  | "Mini Royal"
  | "Straight Flush"
  | "Three of a Kind"
  | "Straight"
  | "Flush"
  | "Pair"
  | "High Card";

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string;
}

export interface EvaluatedHand {
  name: HandName;
  category: number;
  tiebreakers: number[];
  qualifies: boolean;
}

export type RoundOutcome = "player" | "dealer" | "push";

export const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
export const RANKS: Rank[] = [
  "A",
  "K",
  "Q",
  "J",
  "10",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
];

export const RANK_VALUE: Record<Rank, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export const PAIR_PLUS_PAY: Record<HandName, number> = {
  "Mini Royal": 50,
  "Straight Flush": 40,
  "Three of a Kind": 30,
  Straight: 6,
  Flush: 3,
  Pair: 1,
  "High Card": 0,
};

export const ANTE_BONUS_PAY: Record<HandName, number> = {
  "Mini Royal": 5,
  "Straight Flush": 5,
  "Three of a Kind": 4,
  Straight: 1,
  Flush: 0,
  Pair: 0,
  "High Card": 0,
};

export const PLAYER_WIN_RATE = 0.35;

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${rank}_of_${suit}` });
    }
  }
  return shuffle(deck);
}

function isStraight(values: number[]): { straight: boolean; high: number } {
  const sorted = [...values].sort((a, b) => b - a);
  const a = sorted[0] ?? 0;
  const b = sorted[1] ?? 0;
  const c = sorted[2] ?? 0;
  if (a === 14 && b === 3 && c === 2) {
    return { straight: true, high: 3 };
  }
  if (a === b + 1 && b === c + 1) {
    return { straight: true, high: a };
  }
  return { straight: false, high: 0 };
}

export function evaluateHand(cards: Card[]): EvaluatedHand {
  const values = cards.map((card) => RANK_VALUE[card.rank]).sort((a, b) => b - a);
  const suits = cards.map((card) => card.suit);
  const flush = suits[0] === suits[1] && suits[1] === suits[2];
  const { straight, high: straightHigh } = isStraight(values);
  const v0 = values[0] ?? 0;
  const v1 = values[1] ?? 0;
  const v2 = values[2] ?? 0;

  let hand: EvaluatedHand;

  if (v0 === v1 && v1 === v2) {
    hand = { name: "Three of a Kind", category: 5, tiebreakers: [v0], qualifies: true };
  } else if (straight && flush) {
    if (straightHigh === 14) {
      hand = { name: "Mini Royal", category: 7, tiebreakers: [14], qualifies: true };
    } else {
      hand = {
        name: "Straight Flush",
        category: 6,
        tiebreakers: [straightHigh],
        qualifies: true,
      };
    }
  } else if (straight) {
    hand = { name: "Straight", category: 4, tiebreakers: [straightHigh], qualifies: true };
  } else if (flush) {
    hand = { name: "Flush", category: 3, tiebreakers: [v0, v1, v2], qualifies: true };
  } else if (v0 === v1) {
    hand = { name: "Pair", category: 2, tiebreakers: [v0, v2], qualifies: true };
  } else if (v1 === v2) {
    hand = { name: "Pair", category: 2, tiebreakers: [v1, v0], qualifies: true };
  } else {
    hand = { name: "High Card", category: 1, tiebreakers: [v0, v1, v2], qualifies: v0 >= 12 };
  }

  return hand;
}

export function compareHands(a: EvaluatedHand, b: EvaluatedHand): number {
  if (a.category !== b.category) return a.category - b.category;
  const len = Math.max(a.tiebreakers.length, b.tiebreakers.length);
  for (let i = 0; i < len; i++) {
    const av = a.tiebreakers[i] ?? 0;
    const bv = b.tiebreakers[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

export function dealerQualifies(hand: EvaluatedHand): boolean {
  return hand.qualifies;
}

export function outcomeVsDealer(
  player: EvaluatedHand,
  dealer: EvaluatedHand,
): RoundOutcome {
  if (!dealerQualifies(dealer)) return "player";
  const cmp = compareHands(player, dealer);
  if (cmp > 0) return "player";
  if (cmp < 0) return "dealer";
  return "push";
}

export function shouldPlay(hand: EvaluatedHand): boolean {
  if (hand.category > 1) return true;
  const a = hand.tiebreakers[0] ?? 0;
  const b = hand.tiebreakers[1] ?? 0;
  const c = hand.tiebreakers[2] ?? 0;
  if (a > 12) return true;
  if (a < 12) return false;
  if (b > 6) return true;
  if (b < 6) return false;
  return c >= 4;
}

function randomDistinct(deck: Card[], count: number): Card[] {
  const picked: Card[] = [];
  const used = new Set<number>();
  while (picked.length < count && used.size < deck.length) {
    const idx = Math.floor(Math.random() * deck.length);
    if (used.has(idx)) continue;
    used.add(idx);
    const card = deck[idx];
    if (card) picked.push(card);
  }
  return picked;
}

export function selectDealerHand(
  playerCards: Card[],
  remaining: Card[],
  playerShouldWin: boolean,
): Card[] {
  const playerEval = evaluateHand(playerCards);
  const found: Card[][] = [];
  const seen = new Set<string>();

  for (let t = 0; t < 1400 && found.length < 16; t++) {
    const pick = randomDistinct(remaining, 3);
    if (pick.length < 3) break;
    const key = pick
      .map((card) => card.id)
      .sort()
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const outcome = outcomeVsDealer(playerEval, evaluateHand(pick));
    if (playerShouldWin && outcome === "player") found.push(pick);
    if (!playerShouldWin && outcome === "dealer") found.push(pick);
  }

  if (found.length > 0) {
    return found[Math.floor(Math.random() * found.length)]!;
  }

  const n = remaining.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const pick = [remaining[i]!, remaining[j]!, remaining[k]!];
        const outcome = outcomeVsDealer(playerEval, evaluateHand(pick));
        if (playerShouldWin && outcome === "player") return pick;
        if (!playerShouldWin && outcome === "dealer") return pick;
      }
    }
  }

  return remaining.slice(0, 3) as Card[];
}

export function dealRound(): { player: Card[]; dealer: Card[] } {
  const deck = createDeck();
  const player = [deck[0]!, deck[1]!, deck[2]!];
  const remaining = deck.slice(3);
  const playerShouldWin = Math.random() < PLAYER_WIN_RATE;
  const dealer = selectDealerHand(player, remaining, playerShouldWin);
  return { player, dealer };
}

export function rankLabel(rank: Rank): string {
  return rank;
}

export function formatMoney(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rs. ${Math.abs(Math.round(value)).toLocaleString("en-US")}`;
}

export function chipBreakdown(amount: number): number[] {
  const denoms = [1000, 500, 200, 100, 50, 25, 5];
  const chips: number[] = [];
  let left = amount;
  for (const denom of denoms) {
    while (left >= denom && chips.length < 8) {
      chips.push(denom);
      left -= denom;
    }
  }
  if (chips.length === 0 && amount > 0) chips.push(5);
  return chips;
}

export type SettlementLine = {
  label: string;
  status: "win" | "lose" | "push" | "bonus" | "even";
  amount: number;
};

export function settleRound(options: {
  ante: number;
  pairPlus: number;
  play: number;
  folded: boolean;
  playerHand: EvaluatedHand;
  dealerHand: EvaluatedHand;
}): { returned: number; profit: number; lines: SettlementLine[]; headline: string } {
  const { ante, pairPlus, play, folded, playerHand, dealerHand } = options;
  const lines: SettlementLine[] = [];
  let returned = 0;
  const staked = ante + pairPlus + play;

  if (pairPlus > 0) {
    const mult = PAIR_PLUS_PAY[playerHand.name];
    if (mult > 0) {
      const payout = pairPlus * mult;
      returned += pairPlus + payout;
      lines.push({ label: "Pair Plus", status: "win", amount: payout });
    } else {
      lines.push({ label: "Pair Plus", status: "lose", amount: -pairPlus });
    }
  }

  if (ante > 0) {
    if (folded) {
      lines.push({ label: "Ante", status: "lose", amount: -ante });
    } else {
      const outcome = outcomeVsDealer(playerHand, dealerHand);
      const bonus = ANTE_BONUS_PAY[playerHand.name];

      if (outcome === "player") {
        if (!dealerQualifies(dealerHand)) {
          returned += ante * 2;
          returned += play;
          lines.push({ label: "Ante", status: "win", amount: ante });
          if (play > 0) lines.push({ label: "Play", status: "push", amount: 0 });
        } else {
          returned += ante * 2 + play * 2;
          lines.push({ label: "Ante", status: "win", amount: ante });
          if (play > 0) lines.push({ label: "Play", status: "win", amount: play });
        }
      } else if (outcome === "push") {
        returned += ante + play;
        lines.push({ label: "Ante", status: "push", amount: 0 });
        if (play > 0) lines.push({ label: "Play", status: "push", amount: 0 });
      } else {
        lines.push({ label: "Ante", status: "lose", amount: -ante });
        if (play > 0) lines.push({ label: "Play", status: "lose", amount: -play });
      }

      if (bonus > 0) {
        const bonusWin = ante * bonus;
        returned += bonusWin;
        lines.push({ label: "Ante Bonus", status: "bonus", amount: bonusWin });
      }
    }
  }

  const profit = returned - staked;
  let headline = "PUSH";
  if (folded && ante > 0) headline = "No win";
  else if (ante > 0 && !folded && !dealerQualifies(dealerHand)) {
    headline = "DEALER DOES NOT QUALIFY";
  } else if (profit > 0) headline = "PLAYER WINS";
  else if (profit < 0) headline = "No win";

  if (pairPlus > 0 && ante === 0 && PAIR_PLUS_PAY[playerHand.name] > 0) {
    headline = "PAIR PLUS WIN";
  } else if (pairPlus > 0 && ante === 0 && PAIR_PLUS_PAY[playerHand.name] === 0) {
    headline = "No win";
  }

  return { returned, profit, lines, headline };
}
