export type Side = "andar" | "bahar";
export type Suit = "spades" | "hearts" | "clubs" | "diamonds";

export interface CardT {
  id: string;
  rank: string;
  suit: Suit;
  glyph: string;
  red: boolean;
}

export interface DealtCard extends CardT {
  side: Side;
  isPoint: boolean;
}

export interface Hand {
  first: CardT;
  cards: DealtCard[];
  winner: Side | "joker";
}

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

const SUITS: { s: Suit; g: string; red: boolean }[] = [
  { s: "spades", g: "\u2660", red: false },
  { s: "hearts", g: "\u2665", red: true },
  { s: "clubs", g: "\u2663", red: false },
  { s: "diamonds", g: "\u2666", red: true },
];

let uid = 0;

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function makeCard(rank: string, suitIdx: number): CardT {
  const su = SUITS[suitIdx % SUITS.length];
  uid += 1;
  return { id: `card-${uid}`, rank, suit: su.s, glyph: su.g, red: su.red };
}

export function randomCard(excludeRank?: string): CardT {
  let rank = rand(RANKS);
  let guard = 0;
  while (excludeRank && rank === excludeRank && guard < 24) {
    rank = rand(RANKS);
    guard += 1;
  }
  return makeCard(rank, Math.floor(Math.random() * SUITS.length));
}

/**
 * Builds a realistic Andar Bahar deal.
 * Cards alternate: 1st dealt -> ANDAR, 2nd -> BAHAR, 3rd -> ANDAR ...
 * The point card (same rank as dealer card) lands on `target`.
 * `joker` = second card itself is the point card (tie, 11x for joker bets).
 */
export function buildHand(target: Side, joker: boolean): Hand {
  const first = randomCard();
  const cards: DealtCard[] = [];
  const remaining = RANKS.filter(rank => rank !== first.rank).flatMap(rank =>
    SUITS.map((_, suit) => makeCard(rank, suit)),
  );
  const drawOther = () => remaining.splice(Math.floor(Math.random() * remaining.length), 1)[0];

  if (joker) {
    const firstSuit = SUITS.findIndex((x) => x.s === first.suit);
    const p = makeCard(first.rank, firstSuit + 1);
    cards.push({ ...p, side: "bahar", isPoint: true });
    return { first, cards, winner: "joker" };
  }

  const positions: number[] = [];
  const start = target === "andar" ? 1 : 2;
  for (let p = start; p <= 10; p += 2) positions.push(p);
  const pointPos = rand(positions);

  for (let i = 1; i < pointPos; i += 1) {
    const side: Side = i % 2 === 1 ? "andar" : "bahar";
    cards.push({ ...drawOther(), side, isPoint: false });
  }

  const firstSuit = SUITS.findIndex((x) => x.s === first.suit);
  const pt = makeCard(first.rank, firstSuit + 1);
  cards.push({ ...pt, side: target, isPoint: true });

  return { first, cards, winner: target };
}
