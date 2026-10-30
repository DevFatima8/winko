// Poker Roulette — core game logic.
// Pure client-side module: card model, hand evaluation, hand construction

export type Suit = 0 | 1 | 2 | 3; // 0 ♠, 1 ♥, 2 ♦, 3 ♣

export interface CardData {
  rank: number; // 2..14 (11=J, 12=Q, 13=K, 14=A)
  suit: Suit;
}

export const SUIT_SYMBOL = ["♠", "♥", "♦", "♣"] as const;

export function rankLabel(rank: number): string {
  switch (rank) {
    case 14:
      return "A";
    case 13:
      return "K";
    case 12:
      return "Q";
    case 11:
      return "J";
    default:
      return String(rank);
  }
}

// Hand categories (higher = better).
export const CAT_HIGH = 0;
export const CAT_PAIR = 1;
export const CAT_TWO_PAIR = 2;
export const CAT_TRIPS = 3;
export const CAT_STRAIGHT = 4;
export const CAT_FLUSH = 5;
export const CAT_FULL_HOUSE = 6;
export const CAT_QUADS = 7;
export const CAT_STR_FLUSH = 8;
export const CAT_ROYAL = 9;

export const CATEGORY_NAMES = [
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
] as const;

// Profit odds for betting on a spot — the bet wins when the dealt hand is
// equal to or better than the spot's hand ranking.
export const CATEGORY_ODDS: Record<number, number> = {
  [CAT_PAIR]: 1,
  [CAT_TWO_PAIR]: 2,
  [CAT_TRIPS]: 3,
  [CAT_STRAIGHT]: 5,
  [CAT_FLUSH]: 7,
  [CAT_FULL_HOUSE]: 10,
  [CAT_QUADS]: 40,
  [CAT_STR_FLUSH]: 100,
  [CAT_ROYAL]: 250,
};

export const WIN_RATE = 0.35;

// ---------------- deck helpers ----------------

function cardId(rank: number, suit: number): number {
  return rank * 4 + suit;
}

function randRank(): number {
  return 2 + Math.floor(Math.random() * 13); // 2..14
}

function randRankExcept(excluded: number[]): number {
  let r = randRank();
  while (excluded.includes(r)) r = randRank();
  return r;
}

function pickDistinctRanks(excluded: number[], count: number): number[] {
  const out: number[] = [];
  while (out.length < count) {
    const r = randRankExcept(excluded);
    if (!out.includes(r)) out.push(r);
  }
  return out;
}

function isStraightRanks(ranks: number[]): boolean {
  const s = [...ranks].sort((a, b) => a - b);
  // Wheel: A-2-3-4-5 (ace plays low).
  if (s[0] === 2 && s[1] === 3 && s[2] === 4 && s[3] === 5 && s[4] === 14) return true;
  return s[4] - s[0] === 4 && new Set(s).size === 5;
}

function pickNonStraightRanks(): number[] {
  while (true) {
    const ranks = pickDistinctRanks([], 5);
    if (!isStraightRanks(ranks)) return ranks;
  }
}

/** Draw a random still-available card matching `pred` from a fresh deck map. */
function draw(deck: boolean[], pred: (c: CardData) => boolean): CardData {
  const options: CardData[] = [];
  for (let r = 2; r <= 14; r++) {
    for (let s = 0; s < 4; s++) {
      const c: CardData = { rank: r, suit: s as Suit };
      if (!deck[cardId(r, s)] && pred(c)) options.push(c);
    }
  }
  const c = options[Math.floor(Math.random() * options.length)];
  deck[cardId(c.rank, c.suit)] = true;
  return c;
}

/**
 * If all five cards share a suit (would be a flush), switch the last card's
 * suit so pairs / two pair / trips / straights never turn into flushes.
 */
function ensureNotFlush(cards: CardData[], deck: boolean[]): void {
  const suits = new Set(cards.map((c) => c.suit));
  if (suits.size > 1) return;
  const last = cards[cards.length - 1];
  const altSuit = ([0, 1, 2, 3] as Suit[]).find((s) => s !== last.suit) as Suit;
  deck[cardId(last.rank, last.suit)] = false;
  const next: CardData = { rank: last.rank, suit: altSuit };
  deck[cardId(next.rank, next.suit)] = true;
  cards[cards.length - 1] = next;
}

// ---------------- hand constructors ----------------

function straightRanks(low: number): number[] {
  if (low === 14) return [14, 2, 3, 4, 5]; // wheel
  return [low, low + 1, low + 2, low + 3, low + 4];
}

/** Construct one exact hand of the given category from a fresh deck. */
export function constructHand(category: number): CardData[] {
  const deck = new Array<boolean>(15 * 4).fill(false);
  const cards: CardData[] = [];

  switch (category) {
    case CAT_HIGH: {
      for (const r of pickNonStraightRanks()) cards.push(draw(deck, (c) => c.rank === r));
      ensureNotFlush(cards, deck);
      break;
    }
    case CAT_PAIR: {
      const r = randRank();
      cards.push(draw(deck, (c) => c.rank === r), draw(deck, (c) => c.rank === r));
      for (const kr of pickDistinctRanks([r], 3)) cards.push(draw(deck, (c) => c.rank === kr));
      ensureNotFlush(cards, deck);
      break;
    }
    case CAT_TWO_PAIR: {
      const r1 = randRank();
      const r2 = randRankExcept([r1]);
      cards.push(draw(deck, (c) => c.rank === r1), draw(deck, (c) => c.rank === r1));
      cards.push(draw(deck, (c) => c.rank === r2), draw(deck, (c) => c.rank === r2));
      const kr = randRankExcept([r1, r2]);
      cards.push(draw(deck, (c) => c.rank === kr));
      ensureNotFlush(cards, deck);
      break;
    }
    case CAT_TRIPS: {
      const r = randRank();
      for (let i = 0; i < 3; i++) cards.push(draw(deck, (c) => c.rank === r));
      for (const kr of pickDistinctRanks([r], 2)) cards.push(draw(deck, (c) => c.rank === kr));
      ensureNotFlush(cards, deck);
      break;
    }
    case CAT_STRAIGHT: {
      // Wheel (A-2-3-4-5) or a straight starting 2..10.
      const low = Math.random() < 0.1 ? 14 : 2 + Math.floor(Math.random() * 9);
      for (const r of straightRanks(low)) cards.push(draw(deck, (c) => c.rank === r));
      ensureNotFlush(cards, deck);
      break;
    }
    case CAT_FLUSH: {
      const suit = Math.floor(Math.random() * 4) as Suit;
      for (const r of pickNonStraightRanks()) cards.push(draw(deck, (c) => c.rank === r && c.suit === suit));
      break;
    }
    case CAT_FULL_HOUSE: {
      const rA = randRank();
      const rB = randRankExcept([rA]);
      for (let i = 0; i < 3; i++) cards.push(draw(deck, (c) => c.rank === rA));
      cards.push(draw(deck, (c) => c.rank === rB), draw(deck, (c) => c.rank === rB));
      break;
    }
    case CAT_QUADS: {
      const r = randRank();
      for (const s of [0, 1, 2, 3]) cards.push(draw(deck, (c) => c.rank === r && c.suit === s));
      const kr = randRankExcept([r]);
      cards.push(draw(deck, (c) => c.rank === kr));
      break;
    }
    case CAT_STR_FLUSH: {
      const suit = Math.floor(Math.random() * 4) as Suit;
      // Wheel or a straight flush starting 2..9 (10-high is a royal flush).
      const low = Math.random() < 1 / 9 ? 14 : 2 + Math.floor(Math.random() * 8);
      for (const r of straightRanks(low)) cards.push(draw(deck, (c) => c.rank === r && c.suit === suit));
      break;
    }
    case CAT_ROYAL: {
      const suit = Math.floor(Math.random() * 4) as Suit;
      for (const r of [10, 11, 12, 13, 14]) cards.push(draw(deck, (c) => c.rank === r && c.suit === suit));
      break;
    }
    default: {
      for (const r of pickNonStraightRanks()) cards.push(draw(deck, (c) => c.rank === r));
      ensureNotFlush(cards, deck);
    }
  }

  return cards;
}

// ---------------- evaluation ----------------

export function evaluateHand(cards: CardData[]): number {
  const ranks = cards.map((c) => c.rank).sort((a, b) => a - b);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const freq = [...counts.values()].sort((a, b) => b - a);
  const straight = isStraightRanks(ranks);

  if (flush && straight) return ranks[0] === 10 && ranks[4] === 14 ? CAT_ROYAL : CAT_STR_FLUSH;
  if (freq[0] === 4) return CAT_QUADS;
  if (freq[0] === 3 && freq[1] === 2) return CAT_FULL_HOUSE;
  if (flush) return CAT_FLUSH;
  if (straight) return CAT_STRAIGHT;
  if (freq[0] === 3) return CAT_TRIPS;
  if (freq[0] === 2 && freq[1] === 2) return CAT_TWO_PAIR;
  if (freq[0] === 2) return CAT_PAIR;
  return CAT_HIGH;
}

// ---------------- house-tuned dealing engine ----------------

// Conditional on a winning round, weight how far above the bet the hand lands
// (index = distance above the player's highest betting spot).
const WIN_DISTANCE_WEIGHTS = [1, 0.55, 0.24, 0.11, 0.05, 0.025, 0.012, 0.006, 0.003];

function loseWeight(distanceFromTop: number): number {
  // Closest losses are most likely so the board always feels alive.
  return distanceFromTop + 1;
}

function weightedPick<T>(items: { item: T; weight: number }[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let x = Math.random() * total;
  for (const i of items) {
    x -= i.weight;
    if (x <= 0) return i.item;
  }
  return items[items.length - 1].item;
}

export interface RoundOutcome {
  cards: CardData[];
  category: number;
  won: boolean;
}

/**
 * Deal one round. The deck is tuned so the player wins exactly WIN_RATE
 * (35%) of rounds: a win lands on or above the player's highest betting
 * spot, a loss lands strictly below the lowest betting spot.
 */
export function dealRound(betCategories: number[]): RoundOutcome {
  const cats = betCategories.filter((c) => c >= CAT_PAIR && c <= CAT_ROYAL);
  const maxBet = cats.length > 0 ? Math.max(...cats) : CAT_PAIR;
  const minBet = cats.length > 0 ? Math.min(...cats) : CAT_PAIR;

  const won = Math.random() < WIN_RATE;
  let target: number;

  if (won) {
    const items: { item: number; weight: number }[] = [];
    for (let i = 0; i < WIN_DISTANCE_WEIGHTS.length; i++) {
      const cat = maxBet + i;
      if (cat > CAT_ROYAL) break;
      items.push({ item: cat, weight: WIN_DISTANCE_WEIGHTS[i] });
    }
    target = weightedPick(items);
  } else {
    const top = Math.max(CAT_HIGH, minBet - 1);
    const items: { item: number; weight: number }[] = [];
    for (let cat = top; cat >= CAT_HIGH; cat--) {
      items.push({ item: cat, weight: loseWeight(top - cat) });
    }
    target = weightedPick(items);
  }

  const cards = constructHand(target);
  return { cards, category: evaluateHand(cards), won };
}
