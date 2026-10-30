// ─────────────────────────────────────────────────────────────
// Rummy Royale — pure client-side game engine
// ─────────────────────────────────────────────────────────────

export type Suit = "S" | "H" | "D" | "C";

export interface Card {
  id: string;
  rank: number; // 2..14 (14 = Ace, high only in runs)
  suit: Suit;
}

export type GroupType = "set" | "run";

export interface Group {
  type: GroupType;
  cards: Card[];
}

export const SUITS: Suit[] = ["S", "H", "D", "C"];

export const SUIT_SYMBOL: Record<Suit, string> = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
};

export const RANK_LABEL: Record<number, string> = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

/** Casino point value of a card (face cards & Ace = 10). */
export function cardValue(c: Card): number {
  if (c.rank >= 11 || c.rank === 14) return 10;
  return c.rank;
}

export function handValue(cards: Card[]): number {
  return cards.reduce((s, c) => s + cardValue(c), 0);
}

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ id: `${rank}${suit}`, rank, suit });
    }
  }
  return deck;
}

export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ── Meld validation (for player-selected cards) ──────────────

export function isSet(cards: Card[]): boolean {
  if (cards.length < 3 || cards.length > 4) return false;
  return cards.every((c) => c.rank === cards[0].rank);
}

export function isRun(cards: Card[]): boolean {
  if (cards.length < 3) return false;
  const s = cards[0].suit;
  if (!cards.every((c) => c.suit === s)) return false;
  const r = cards.map((c) => c.rank).sort((a, b) => a - b);
  if (r[r.length - 1] > 14) return false;
  for (let i = 1; i < r.length; i++) if (r[i] !== r[i - 1] + 1) return false;
  return true;
}

export function meldType(cards: Card[]): GroupType | null {
  if (isSet(cards)) return "set";
  if (isRun(cards)) return "run";
  return null;
}

// ── Solver: can ALL these cards be partitioned into sets/runs? ─

function dfs(cards: Card[]): Group[] | null {
  if (cards.length === 0) return [];

  const byId = (c: Card) => c.id;
  const first = cards[0];

  const maxLen = Math.min(cards.length, 15 - first.rank);
  for (let len = maxLen; len >= 3; len--) {
    const end = first.rank + len - 1;
    const run: Card[] = [];
    let ok = true;
    for (let r = first.rank; r <= end; r++) {
      const c = cards.find((x) => x.rank === r && x.suit === first.suit);
      if (!c) {
        ok = false;
        break;
      }
      run.push(c);
    }
    if (ok) {
      const runIds = new Set(run.map(byId));
      const rest = cards.filter((c) => !runIds.has(c.id));
      const sub = dfs(rest);
      if (sub) return [{ type: "run", cards: run }, ...sub];
    }
  }

  const same = cards.filter((c) => c.rank === first.rank);
  if (same.length >= 3) {
    const others = same.slice(1);
    const combos: Card[][] = [];
    for (let i = 0; i < others.length; i++)
      for (let j = i + 1; j < others.length; j++) combos.push([others[i], others[j]]);
    if (others.length === 3) combos.push([...others]);

    for (const combo of combos) {
      const set = [first, ...combo];
      const setIds = new Set(set.map(byId));
      const rest = cards.filter((c) => !setIds.has(c.id));
      const sub = dfs(rest);
      if (sub) return [{ type: "set", cards: set }, ...sub];
    }
  }

  return null;
}

/** Returns a full partition of `cards` into sets/runs, or null if impossible. */
export function solve(cards: Card[]): Group[] | null {
  const sorted = [...cards].sort(
    (a, b) => a.rank - b.rank || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit)
  );
  return dfs(sorted);
}

// ── Deal generation ──────────────────────────────────────────

const key = (rank: number, suit: Suit) => `${rank}${suit}`;

export function generateWinnableHand(rng: () => number = Math.random): Card[] {
  for (let attempt = 0; attempt < 200; attempt++) {
    const used = new Set<string>();
    const usedRank = new Map<number, number>();
    const cards: Card[] = [];
    let remaining = 13;
    let ok = true;

    const bump = (c: Card) => {
      used.add(key(c.rank, c.suit));
      usedRank.set(c.rank, (usedRank.get(c.rank) ?? 0) + 1);
      cards.push(c);
    };

    while (remaining > 0) {
      const sizes = [3, 4, 5, 6, 7].filter((g) => remaining === g || remaining - g >= 3);
      if (sizes.length === 0) {
        ok = false;
        break;
      }
      const size = pick(sizes, rng);
      const wantRun = size > 4 ? true : rng() < 0.62;
      let placed = false;

      if (wantRun) {
        const maxStart = 15 - size;
        for (let t = 0; t < 12 && !placed; t++) {
          const suit = pick(SUITS, rng);
          const start = 2 + Math.floor(rng() * (maxStart - 1));
          const run: Card[] = [];
          let clash = false;
          for (let r = start; r < start + size; r++) {
            const c: Card = { id: key(r, suit), rank: r, suit };
            if (used.has(c.id)) clash = true;
            run.push(c);
          }
          if (!clash) {
            run.forEach(bump);
            placed = true;
          }
        }
      }

      if (!placed) {
        const kOptions = [3, 4].filter(
          (k) => (k <= size || size <= 4) && (remaining - k === 0 || remaining - k >= 3)
        );
        const k = kOptions.length ? pick(kOptions, rng) : -1;
        if (k > 0) {
          const ranks = [] as number[];
          for (let r = 2; r <= 14; r++) if (4 - (usedRank.get(r) ?? 0) >= k) ranks.push(r);
          if (ranks.length) {
            const rank = pick(ranks, rng);
            const freeSuits = shuffle(SUITS.filter((s) => !used.has(key(rank, s))), rng);
            if (freeSuits.length >= k) {
              freeSuits.slice(0, k).forEach((s) => bump({ id: key(rank, s), rank, suit: s }));
              placed = true;
            }
          }
        }
        if (!placed) {
          ok = false;
          break;
        }
      }
      remaining = 13 - cards.length;
    }

    if (!ok || cards.length !== 13) continue;
    if (!solve(cards)) continue;
    return cards;
  }

  const fb: Card[] = [];
  const add = (rank: number, suit: Suit) => fb.push({ id: key(rank, suit), rank, suit });
  [[2, "S"], [3, "S"], [4, "S"]].forEach(([r, s]) => add(r as number, s as Suit));
  [[5, "H"], [6, "H"], [7, "H"]].forEach(([r, s]) => add(r as number, s as Suit));
  [[8, "D"], [9, "D"], [10, "D"]].forEach(([r, s]) => add(r as number, s as Suit));
  [[11, "C"], [12, "C"], [13, "C"]].forEach(([r, s]) => add(r as number, s as Suit));
  add(14, "S");
  add(14, "H");
  add(14, "D");
  return fb;
}

export function generateUnwinnableHand(rng: () => number = Math.random): Card[] {
  for (let attempt = 0; attempt < 300; attempt++) {
    const hand = shuffle(buildDeck(), rng).slice(0, 13);
    if (!solve(hand)) return hand;
  }
  const ranks = [2, 4, 6, 8, 10, 12, 14];
  const hand: Card[] = [];
  let i = 0;
  for (const r of ranks) {
    hand.push({ id: key(r, "S"), rank: r, suit: "S" });
    hand.push({ id: key(r, "H"), rank: r, suit: "H" });
    i += 2;
    if (i === 13) break;
  }
  return hand;
}

export interface Deal {
  hand: Card[];
  winnable: boolean;
}

export const WIN_CHANCE = 0.35;

export function deal(rng: () => number = Math.random): Deal {
  const winnable = rng() < WIN_CHANCE;
  const cards = winnable ? generateWinnableHand(rng) : generateUnwinnableHand(rng);
  return { hand: shuffle(cards, rng), winnable };
}

export function rankLabel(rank: number): string {
  return RANK_LABEL[rank];
}
