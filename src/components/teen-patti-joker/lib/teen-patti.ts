// ─── Teen Patti Joker — core game engine ─────────────────────────────────────
import { BET_PRESETS } from "@/lib/betPresets";

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Zone = "player" | "dealer" | "tie";

export interface PlayingCardData {
  id: string;
  rank: number; // 2..14 (11=J, 12=Q, 13=K, 14=A). 0 for joker.
  suit: Suit | null; // null => joker
  isJoker: boolean;
}

export interface Bets {
  player: number;
  dealer: number;
  tie: number;
}

export const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];

export const RANK_LABELS: Record<number, string> = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10",
  11: "J", 12: "Q", 13: "K", 14: "A",
};

export const CHIP_VALUES = BET_PRESETS;
export const MIN_BET = 10;
export const STARTING_BALANCE = 10000;
export const TIE_PAYOUT = 8; // 8 to 1
export const MAIN_PAYOUT = 1; // 1 to 1
export const WIN_RATE = 0.35;

// ─── Hand evaluation ─────────────────────────────────────────────────────────

export type HandCategory = 1 | 2 | 3 | 4 | 5 | 6;

export interface HandEval {
  category: HandCategory;
  name: string;
  shortName: string;
  tiebreak: number[];
}

const CATEGORY_NAMES: Record<HandCategory, string> = {
  6: "TRAIL / SET",
  5: "PURE SEQUENCE",
  4: "SEQUENCE",
  3: "COLOR",
  2: "PAIR",
  1: "HIGH CARD",
};

const CATEGORY_SHORT: Record<HandCategory, string> = {
  6: "TRAIL",
  5: "PURE SEQ",
  4: "SEQ",
  3: "COLOR",
  2: "PAIR",
  1: "HIGH",
};

interface ConcreteCard {
  rank: number;
  suit: Suit;
}

function evaluateConcrete(cards: ConcreteCard[]): HandEval {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a); // desc
  const flush = cards.every((c) => c.suit === cards[0].suit);

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const countVals = [...counts.values()].sort((a, b) => b - a);

  // sequence detection (A-2-3 allowed as lowest run)
  const uniqAsc = [...counts.keys()].sort((a, b) => a - b);
  let sequence = false;
  let seqTop = 0;
  if (uniqAsc.length === 3) {
    if (uniqAsc[2] - uniqAsc[0] === 2) {
      sequence = true;
      seqTop = uniqAsc[2];
    } else if (uniqAsc[0] === 2 && uniqAsc[1] === 3 && uniqAsc[2] === 14) {
      sequence = true;
      seqTop = 3;
    } else if (uniqAsc[0] === 2 && uniqAsc[1] === 13 && uniqAsc[2] === 14) {
      // K-A-2 is NOT a sequence in classic teen patti rules → left false
    }
  }

  let category: HandCategory;
  let tiebreak: number[];

  if (countVals[0] === 3) {
    category = 6;
    tiebreak = [ranks[0]];
  } else if (sequence && flush) {
    category = 5;
    tiebreak = [seqTop];
  } else if (sequence) {
    category = 4;
    tiebreak = [seqTop];
  } else if (flush) {
    category = 3;
    tiebreak = ranks;
  } else if (countVals[0] === 2) {
    category = 2;
    const pairRank = [...counts.entries()].find(([, v]) => v === 2)![0];
    const kicker = [...counts.entries()].find(([, v]) => v === 1)![0];
    tiebreak = [pairRank, kicker];
  } else {
    category = 1;
    tiebreak = ranks;
  }

  return { category, name: CATEGORY_NAMES[category], shortName: CATEGORY_SHORT[category], tiebreak };
}

/** Compare two evaluated hands. >0 a wins, <0 b wins, 0 exact tie. */
export function compareEvals(a: HandEval, b: HandEval): number {
  if (a.category !== b.category) return a.category - b.category;
  const len = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < len; i++) {
    const d = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Evaluate a 3-card hand; jokers act as wild cards becoming the best card possible. */
export function evaluateHand(cards: PlayingCardData[]): HandEval {
  const naturals: ConcreteCard[] = cards
    .filter((c) => !c.isJoker)
    .map((c) => ({ rank: c.rank, suit: c.suit as Suit }));
  const jokerCount = cards.length - naturals.length;

  if (jokerCount === 0) return evaluateConcrete(naturals);

  // Impossible with a 2-joker deck, but keep it safe: all wilds = best possible.
  if (jokerCount >= 3) {
    return { category: 6, name: CATEGORY_NAMES[6], shortName: CATEGORY_SHORT[6], tiebreak: [14] };
  }

  const candidates: ConcreteCard[] = [];
  for (let r = 2; r <= 14; r++) for (const s of SUITS) candidates.push({ rank: r, suit: s });

  let best: HandEval | null = null;
  const consider = (ev: HandEval) => {
    if (!best || compareEvals(ev, best) > 0) best = ev;
  };

  if (jokerCount === 1) {
    for (const c1 of candidates) consider(evaluateConcrete([...naturals, c1]));
  } else {
    for (const c1 of candidates) {
      for (const c2 of candidates) consider(evaluateConcrete([...naturals, c1, c2]));
    }
  }

  return best ?? evaluateConcrete([...naturals, ...naturals]);
}

// ─── Deck & dealing ──────────────────────────────────────────────────────────

let uidCounter = 0;
const uid = () => `c${++uidCounter}_${Math.random().toString(36).slice(2, 8)}`;

function buildDeck(withJokers: boolean): PlayingCardData[] {
  const deck: PlayingCardData[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ id: uid(), rank, suit, isJoker: false });
    }
  }
  if (withJokers) {
    deck.push({ id: uid(), rank: 0, suit: null, isJoker: true });
    deck.push({ id: uid(), rank: 0, suit: null, isJoker: true });
  }
  return deck;
}

function draw(deck: PlayingCardData[]): PlayingCardData {
  const i = Math.floor(Math.random() * deck.length);
  return deck.splice(i, 1)[0];
}

function drawHand(deck: PlayingCardData[]): PlayingCardData[] {
  return [draw(deck), draw(deck), draw(deck)];
}

const nextSuit = (s: Suit): Suit => SUITS[(SUITS.indexOf(s) + 1) % SUITS.length];

export interface Round {
  playerHand: PlayingCardData[];
  dealerHand: PlayingCardData[];
  playerEval: HandEval;
  dealerEval: HandEval;
  outcome: Zone;
}

/** Build two hands whose result matches the desired (rigged) outcome. */
export function buildRound(outcome: Zone): Round {
  if (outcome === "tie") {
    // Mirror one hand through a suit rotation → identical strength, unique cards.
    // Jokers excluded so the mirror stays exact.
    for (let attempt = 0; attempt < 400; attempt++) {
      const deck = buildDeck(false);
      const hand = drawHand(deck);
      const mirror: PlayingCardData[] = hand.map((c) => ({
        id: uid(),
        rank: c.rank,
        suit: nextSuit(c.suit as Suit),
        isJoker: false,
      }));
      if (mirror.some(card => hand.some(other => other.rank === card.rank && other.suit === card.suit))) continue;
      const pe = evaluateHand(hand);
      const de = evaluateHand(mirror);
      if (compareEvals(pe, de) === 0) {
        return { playerHand: hand, dealerHand: mirror, playerEval: pe, dealerEval: de, outcome };
      }
    }
    throw new Error("Unable to deal matching tie hands. Retry the same wager.");
  }

  // player or dealer wins → redraw until the two hands differ, assign accordingly
  for (let attempt = 0; attempt < 400; attempt++) {
    const deck = buildDeck(true); // jokers live in the pack
    const a = drawHand(deck);
    const b = drawHand(deck);
    const ae = evaluateHand(a);
    const be = evaluateHand(b);
    const cmp = compareEvals(ae, be);
    if (cmp === 0) continue;

    const playerWins = cmp > 0;
    const wantPlayer = outcome === "player";
    const playerHand = playerWins === wantPlayer ? a : b;
    const dealerHand = playerWins === wantPlayer ? b : a;
    const playerEval = playerWins === wantPlayer ? ae : be;
    const dealerEval = playerWins === wantPlayer ? be : ae;
    return { playerHand, dealerHand, playerEval, dealerEval, outcome };
  }

  // Virtually unreachable fallback — force a deterministic winner.
  const deck = buildDeck(false);
  const strong: PlayingCardData[] = [14, 14, 14].map((r, i) => ({
    id: uid(), rank: r, suit: SUITS[i], isJoker: false,
  }));
  const weak: PlayingCardData[] = [
    { id: uid(), rank: 2, suit: "spades", isJoker: false },
    { id: uid(), rank: 5, suit: "hearts", isJoker: false },
    { id: uid(), rank: 9, suit: "clubs", isJoker: false },
  ];
  void deck;
  const se = evaluateHand(strong);
  const we = evaluateHand(weak);
  return outcome === "player"
    ? { playerHand: strong, dealerHand: weak, playerEval: se, dealerEval: we, outcome }
    : { playerHand: weak, dealerHand: strong, playerEval: we, dealerEval: se, outcome };
}


export function totalBet(b: Bets): number {
  return b.player + b.dealer + b.tie;
}

/** Total chips returned to the player for a given outcome (stake included). */
export function returnsForOutcome(b: Bets, outcome: Zone): number {
  if (outcome === "player") return b.player * (MAIN_PAYOUT + 1);
  if (outcome === "dealer") return b.dealer * (MAIN_PAYOUT + 1);
  // tie → tie bets pay 8:1, player/dealer bets push (returned)
  return b.tie * (TIE_PAYOUT + 1) + b.player + b.dealer;
}

export function netForOutcome(b: Bets, outcome: Zone): number {
  return returnsForOutcome(b, outcome) - totalBet(b);
}

export function decideOutcome(b: Bets): Zone {
  const zones: Zone[] = ["player", "dealer", "tie"];
  const winning = zones.filter((z) => netForOutcome(b, z) > 0);
  const losing = zones.filter((z) => netForOutcome(b, z) <= 0);
  const roll = Math.random();

  if (roll < WIN_RATE && winning.length > 0) {
    // player wins — land on their most profitable bet zone
    return winning.sort((x, y) => netForOutcome(b, y) - netForOutcome(b, x))[0];
  }
  if (losing.length > 0) {
    // house wins — land on the player's worst outcome
    return losing.sort((x, y) => netForOutcome(b, x) - netForOutcome(b, y))[0];
  }
  // edge case: every zone is covered profitably → random
  return zones[Math.floor(Math.random() * zones.length)];
}

// ─── Formatting helpers ─────────────────────────────────────────────────────

export function formatChips(n: number): string {
  return n.toLocaleString("en-PK");
}

export function betLabel(v: number): string {
  return v >= 1000 ? `${v / 1000}K` : `${v}`;
}
