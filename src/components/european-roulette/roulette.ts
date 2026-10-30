// Shared European Roulette logic (used by both client and server). No database.

export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29,
  7, 28, 12, 35, 3, 26,
];

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type Color = "red" | "black" | "green";
export const colorOf = (n: number): Color => (n === 0 ? "green" : RED.has(n) ? "red" : "black");

export type BetKind =
  | "straight"
  | "split"
  | "street"
  | "trio"
  | "corner"
  | "basket"
  | "sixline"
  | "dozen"
  | "column"
  | "even";

export interface BetDef {
  id: string;
  kind: BetKind;
  numbers: number[];
  /** position in table grid units (x: 0 = left edge of zero cell, y: 0 = top edge) */
  x: number;
  y: number;
  /** hotspot size (grid units) for inner bets */
  hw: number;
  hh: number;
  label: string;
}

const rowOf = (n: number) => 2 - ((n - 1) % 3); // 0 = top row (3,6,9..), 2 = bottom row (1,4,7..)
const colOf = (n: number) => Math.floor((n - 1) / 3);
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

function build(): BetDef[] {
  const list: BetDef[] = [];
  const add = (
    id: string,
    kind: BetKind,
    numbers: number[],
    x: number,
    y: number,
    hw = 1,
    hh = 1,
    label = id,
  ) => list.push({ id, kind, numbers, x, y, hw, hh, label });

  // Straight
  add("s0", "straight", [0], 0.5, 1.5, 1, 1, "0");
  for (let n = 1; n <= 36; n++) add(`s${n}`, "straight", [n], 1.5 + colOf(n), rowOf(n) + 0.5, 1, 1, String(n));

  // Zero splits / trios / basket
  add("sp-0-1", "split", [0, 1], 1, 2.5, 0.28, 0.5);
  add("sp-0-2", "split", [0, 2], 1, 1.5, 0.28, 0.5);
  add("sp-0-3", "split", [0, 3], 1, 0.5, 0.28, 0.5);
  add("tr-0-1-2", "trio", [0, 1, 2], 1, 2, 0.28, 0.28);
  add("tr-0-2-3", "trio", [0, 2, 3], 1, 1, 0.28, 0.28);
  add("bk", "basket", [0, 1, 2, 3], 1, 3, 0.28, 0.28);

  // Horizontal splits (n, n+3)
  for (let n = 1; n <= 33; n++) add(`sp-${n}-${n + 3}`, "split", [n, n + 3], 2 + colOf(n), rowOf(n) + 0.5, 0.28, 0.5);
  // Vertical splits (n, n+1)
  for (let n = 1; n <= 35; n++) {
    if (n % 3 !== 0) add(`sp-${n}-${n + 1}`, "split", [n, n + 1], 1.5 + colOf(n), rowOf(n), 0.5, 0.28);
  }
  // Streets
  for (let c = 0; c < 12; c++) add(`st-${c}`, "street", range(3 * c + 1, 3 * c + 3), 1.5 + c, 3, 0.5, 0.28);
  // Corners
  for (let n = 1; n <= 32; n++) {
    if (n % 3 !== 0) add(`co-${n}`, "corner", [n, n + 1, n + 3, n + 4], 2 + colOf(n), rowOf(n), 0.28, 0.28);
  }
  // Six lines
  for (let c = 0; c < 11; c++) add(`sl-${c}`, "sixline", range(3 * c + 1, 3 * c + 6), 2 + c, 3, 0.28, 0.28);

  // Columns (2 to 1)
  add("c1", "column", range(1, 36).filter((n) => n % 3 === 1), 13.5, 2.5, 1, 1, "2:1");
  add("c2", "column", range(1, 36).filter((n) => n % 3 === 2), 13.5, 1.5, 1, 1, "2:1");
  add("c3", "column", range(1, 36).filter((n) => n % 3 === 0), 13.5, 0.5, 1, 1, "2:1");

  // Dozens
  add("d1", "dozen", range(1, 12), 3, 3.5, 1, 1, "1st 12");
  add("d2", "dozen", range(13, 24), 7, 3.5, 1, 1, "2nd 12");
  add("d3", "dozen", range(25, 36), 11, 3.5, 1, 1, "3rd 12");

  // Even-money
  const all = range(1, 36);
  add("low", "even", range(1, 18), 2, 4.5, 1, 1, "1-18");
  add("even", "even", all.filter((n) => n % 2 === 0), 4, 4.5, 1, 1, "EVEN");
  add("red", "even", all.filter((n) => colorOf(n) === "red"), 6, 4.5, 1, 1, "RED");
  add("black", "even", all.filter((n) => colorOf(n) === "black"), 8, 4.5, 1, 1, "BLACK");
  add("odd", "even", all.filter((n) => n % 2 === 1), 10, 4.5, 1, 1, "ODD");
  add("high", "even", range(19, 36), 12, 4.5, 1, 1, "19-36");

  return list;
}

export const BET_LIST: BetDef[] = build();
export const CATALOG: Record<string, BetDef> = Object.fromEntries(BET_LIST.map((b) => [b.id, b]));

/** Total return multiplier (stake included): straight = 36x, split = 18x, ... */
export const returnMultiplier = (def: BetDef) => 36 / def.numbers.length;

export interface PlacedBet {
  id: string;
  amount: number;
}

export function payoutFor(bets: PlacedBet[], n: number): number {
  let total = 0;
  for (const b of bets) {
    const def = CATALOG[b.id];
    if (def && def.numbers.includes(n)) total += b.amount * returnMultiplier(def);
  }
  return total;
}

export const totalStake = (bets: PlacedBet[]) => bets.reduce((s, b) => s + b.amount, 0);

export const WIN_RATE = 0.35;

export function pickOutcome(bets: PlacedBet[], roll: number, pick: (len: number) => number): number {
  const stake = totalStake(bets);
  const winners: number[] = [];
  const losers: number[] = [];
  for (let n = 0; n <= 36; n++) {
    if (payoutFor(bets, n) > stake) winners.push(n);
    else losers.push(n);
  }
  const wantWin = roll < WIN_RATE;
  const pool = wantWin ? (winners.length ? winners : losers) : losers.length ? losers : winners;
  return pool[pick(pool.length)];
}
