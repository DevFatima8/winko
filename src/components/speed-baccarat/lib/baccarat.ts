/**
 * Baccarat rules engine.
 * Pure functions, no side effects, no persistence — an 8-deck style infinite shoe
 * approximation (each card drawn independently, which matches a live shoe closely).
 */

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export type Side = "player" | "banker" | "tie";

export type Card = {
  rank: Rank;
  suit: Suit;
  value: number;
  key: string;
};

export const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];

const VALUE_TO_RANKS: Record<number, Rank[]> = {
  0: ["10", "J", "Q", "K"],
  1: ["A"],
  2: ["2"],
  3: ["3"],
  4: ["4"],
  5: ["5"],
  6: ["6"],
  7: ["7"],
  8: ["8"],
  9: ["9"],
};

let seq = 0;

export function rankValue(rank: Rank): number {
  if (rank === "A") return 1;
  if (rank === "10" || rank === "J" || rank === "Q" || rank === "K") return 0;
  return Number.parseInt(rank, 10);
}

export function makeCard(rank: Rank, suit?: Suit): Card {
  const s = suit ?? SUITS[Math.floor(Math.random() * SUITS.length)];
  return { rank, suit: s, value: rankValue(rank), key: `${rank}-${s}-${seq++}` };
}

function randomRank(): Rank {
  return RANKS[Math.floor(Math.random() * RANKS.length)];
}

export function handTotal(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + c.value, 0) % 10;
}

export function isPair(firstTwo: Card[]): boolean {
  return firstTwo.length >= 2 && firstTwo[0].rank === firstTwo[1].rank;
}

export function winnerOf(pTotal: number, bTotal: number): Side {
  if (pTotal > bTotal) return "player";
  if (bTotal > pTotal) return "banker";
  return "tie";
}

/** Banker third-card table. `playerThird` is the value of the player's third card (null if none). */
function bankerDraws(bTotal: number, playerThird: number | null): boolean {
  if (playerThird === null) return bTotal <= 5;
  if (bTotal <= 2) return true;
  if (bTotal === 3) return playerThird !== 8;
  if (bTotal === 4) return playerThird >= 2 && playerThird <= 7;
  if (bTotal === 5) return playerThird >= 4 && playerThird <= 7;
  if (bTotal === 6) return playerThird === 6 || playerThird === 7;
  return false;
}

/** Deal one complete hand following full tableau rules. */
export function playHand(): { player: Card[]; banker: Card[] } {
  const player = [makeCard(randomRank()), makeCard(randomRank())];
  const banker = [makeCard(randomRank()), makeCard(randomRank())];

  let pTotal = handTotal(player);
  const bTotal0 = handTotal(banker);

  // Natural — nobody draws.
  if (pTotal >= 8 || bTotal0 >= 8) return { player, banker };

  let playerThird: number | null = null;
  if (pTotal <= 5) {
    const card = makeCard(randomRank());
    player.push(card);
    playerThird = card.value;
    pTotal = handTotal(player);
  }

  if (bankerDraws(bTotal0, playerThird)) banker.push(makeCard(randomRank()));

  return { player, banker };
}

/** All card values that, doubled, produce `total` (mod 10) — only even totals can be pairs. */
function pairValues(total: number): number[] {
  if (total % 2 !== 0) return [];
  return [total / 2, (total / 2 + 5) % 10];
}

/** Build exactly two cards totalling `total` (mod 10), optionally forced to be / not be a pair. */
function twoCardsFor(total: number, pair: boolean | null): Card[] {
  if (pair === true) {
    const values = pairValues(total);
    const value = values.length ? values[Math.floor(Math.random() * values.length)] : 0;
    const ranks = VALUE_TO_RANKS[value] ?? ["10"];
    const rank = ranks[Math.floor(Math.random() * ranks.length)];
    const s1 = SUITS[Math.floor(Math.random() * 4)];
    let s2 = SUITS[Math.floor(Math.random() * 4)];
    while (s2 === s1) s2 = SUITS[Math.floor(Math.random() * 4)];
    return [makeCard(rank, s1), makeCard(rank, s2)];
  }

  for (let attempt = 0; attempt < 80; attempt++) {
    const v1 = Math.floor(Math.random() * 10);
    const v2 = (total - v1 + 10) % 10;
    const ranks1 = VALUE_TO_RANKS[v1] ?? [];
    const ranks2 = VALUE_TO_RANKS[v2] ?? [];
    if (!ranks1.length || !ranks2.length) continue;
    const r1 = ranks1[Math.floor(Math.random() * ranks1.length)];
    const r2 = ranks2[Math.floor(Math.random() * ranks2.length)];
    if (pair === false && r1 === r2) continue;
    return [makeCard(r1), makeCard(r2)];
  }

  const fallback = VALUE_TO_RANKS[total]?.[0] ?? "A";
  return [makeCard(fallback), makeCard("J")];
}

/** Two-card-only hands that are legal under the tableau (naturals, or 6/7 standoff). */
function constructHand(target: Side, playerPair: boolean | null, bankerPair: boolean | null) {
  const combos: { p: number; b: number }[] = [];
  for (let p = 0; p <= 9; p++) {
    for (let b = 0; b <= 9; b++) {
      const natural = p >= 8 || b >= 8;
      const standoff = p >= 6 && p <= 7 && b >= 6 && b <= 7;
      if (!natural && !standoff) continue;
      if (winnerOf(p, b) !== target) continue;
      if (playerPair === true && p % 2 !== 0) continue;
      if (bankerPair === true && b % 2 !== 0) continue;
      combos.push({ p, b });
    }
  }
  const chosen = combos.length ? combos[Math.floor(Math.random() * combos.length)] : { p: 9, b: 3 };
  const player = twoCardsFor(chosen.p, playerPair);
  const banker = twoCardsFor(chosen.b, bankerPair);
  // never allow a 3rd card to break legality of the constructed hand
  return { player, banker };
}

export type DealConstraints = {
  winner: Side;
  /** true = must be a pair, false = must not be a pair, null/undefined = don't care */
  playerPair?: boolean | null;
  bankerPair?: boolean | null;
};

/**
 * Deal a hand whose winner (and optionally pair results) is constrained.
 * Uses real rule-driven simulations first so the card flow looks authentic,
 * falling back to a constructed but tableau-legal hand.
 */
export function dealConstrained(constraints: DealConstraints): { player: Card[]; banker: Card[] } {
  const { winner, playerPair = null, bankerPair = null } = constraints;

  for (let attempt = 0; attempt < 400; attempt++) {
    const hand = playHand();
    const pTotal = handTotal(hand.player);
    const bTotal = handTotal(hand.banker);
    if (winnerOf(pTotal, bTotal) !== winner) continue;
    if (playerPair !== null && isPair(hand.player) !== playerPair) continue;
    if (bankerPair !== null && isPair(hand.banker) !== bankerPair) continue;
    return hand;
  }

  return constructHand(winner, playerPair, bankerPair);
}

/** Completely neutral random hand (used when nobody has money on the table). */
export function dealRandom(): { player: Card[]; banker: Card[] } {
  return playHand();
}
