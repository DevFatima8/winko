/**
 * Mini Roulette core logic.
 * 12-number wheel (1-12, no zero), Spribe-style multipliers.
 *
 * for the player and 65% are losing rounds (see WIN_RATE / pickResult).
 */

import { BET_PRESETS } from "@/lib/betPresets";

export const WIN_RATE = 0.35;

export const NUMBERS: number[] = Array.from({ length: 12 }, (_, i) => i + 1);
export const RED_NUMBERS: ReadonlySet<number> = new Set([1, 3, 5, 8, 10, 12]);
/** Order of the pockets on the wheel, clockwise starting at the top. */
export const WHEEL_ORDER: number[] = [1, 6, 3, 9, 12, 4, 10, 7, 8, 2, 5, 11];
export const POCKET_ANGLE = 360 / WHEEL_ORDER.length;

export type NumColor = "red" | "black";
export const colorOf = (n: number): NumColor => (RED_NUMBERS.has(n) ? "red" : "black");

export type BetType =
  | "straight"
  | "split"
  | "street"
  | "corner"
  | "column"
  | "low"
  | "high"
  | "red"
  | "black"
  | "odd"
  | "even";

/** Multipliers are total return (stake included), like the original game. */
export const MULTIPLIERS: Record<BetType, number> = {
  straight: 11.64,
  split: 5.82,
  street: 3.88,
  corner: 2.91,
  column: 2.91,
  low: 1.94,
  high: 1.94,
  red: 1.94,
  black: 1.94,
  odd: 1.94,
  even: 1.94,
};

export const PAYTABLE: { label: string; covers: string; multiplier: number }[] = [
  { label: "Straight up", covers: "1 number", multiplier: MULTIPLIERS.straight },
  { label: "Split", covers: "2 numbers", multiplier: MULTIPLIERS.split },
  { label: "Street", covers: "3 numbers", multiplier: MULTIPLIERS.street },
  { label: "Corner", covers: "4 numbers", multiplier: MULTIPLIERS.corner },
  { label: "Column", covers: "4 numbers", multiplier: MULTIPLIERS.column },
  { label: "Red / Black", covers: "6 numbers", multiplier: MULTIPLIERS.red },
  { label: "Odd / Even", covers: "6 numbers", multiplier: MULTIPLIERS.odd },
  { label: "1-6 / 7-12", covers: "6 numbers", multiplier: MULTIPLIERS.low },
];

export interface BetSpot {
  id: string;
  type: BetType;
  numbers: number[];
  label: string;
}

/** spotId -> amount */
export type BetMap = Record<string, number>;

export const CHIP_VALUES: number[] = [...BET_PRESETS];
export const MIN_BET = 10;
export const START_BALANCE = 10000;
export const CURRENCY = "Rs.";

export const GRID_COLS = 4;
export const GRID_ROWS = 3;
/** Table grid: column c (0..3), row r (0 = top). Top row is 3,6,9,12 ... bottom row 1,4,7,10 */
export const numberAt = (col: number, row: number): number => col * 3 + (GRID_ROWS - row);

export function buildSpots(): Record<string, BetSpot> {
  const spots: Record<string, BetSpot> = {};
  const add = (s: BetSpot) => {
    spots[s.id] = s;
  };

  for (const n of NUMBERS) add({ id: `s-${n}`, type: "straight", numbers: [n], label: `${n}` });

  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      const n = numberAt(c, r);
      if (c < GRID_COLS - 1) {
        const m = numberAt(c + 1, r);
        add({ id: `sp-${n}-${m}`, type: "split", numbers: [n, m], label: `${n} / ${m}` });
      }
      if (r < GRID_ROWS - 1) {
        const m = numberAt(c, r + 1);
        add({ id: `sp-${m}-${n}`, type: "split", numbers: [m, n], label: `${m} / ${n}` });
      }
      if (c < GRID_COLS - 1 && r < GRID_ROWS - 1) {
        const nums = [numberAt(c, r + 1), numberAt(c, r), numberAt(c + 1, r + 1), numberAt(c + 1, r)].sort(
          (a, b) => a - b,
        );
        add({ id: `c-${nums.join("-")}`, type: "corner", numbers: nums, label: nums.join(" / ") });
      }
    }
  }

  for (let c = 0; c < GRID_COLS; c++) {
    const nums = [c * 3 + 1, c * 3 + 2, c * 3 + 3];
    add({ id: `st-${c}`, type: "street", numbers: nums, label: `${nums[0]}-${nums[2]}` });
  }

  for (let r = 0; r < GRID_ROWS; r++) {
    const nums = Array.from({ length: GRID_COLS }, (_, c) => numberAt(c, r));
    add({ id: `col-${r}`, type: "column", numbers: nums, label: `Column ${nums.join("/")}` });
  }

  add({ id: "low", type: "low", numbers: NUMBERS.filter((n) => n <= 6), label: "1-6" });
  add({ id: "high", type: "high", numbers: NUMBERS.filter((n) => n >= 7), label: "7-12" });
  add({ id: "red", type: "red", numbers: NUMBERS.filter((n) => RED_NUMBERS.has(n)), label: "Red" });
  add({ id: "black", type: "black", numbers: NUMBERS.filter((n) => !RED_NUMBERS.has(n)), label: "Black" });
  add({ id: "odd", type: "odd", numbers: NUMBERS.filter((n) => n % 2 === 1), label: "Odd" });
  add({ id: "even", type: "even", numbers: NUMBERS.filter((n) => n % 2 === 0), label: "Even" });

  return spots;
}

export const SPOTS: Record<string, BetSpot> = buildSpots();

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export const totalOf = (bets: BetMap): number =>
  round2(Object.values(bets).reduce((a, b) => a + (b > 0 ? b : 0), 0));

/** Total amount returned to the player (stake included) if `result` comes out. */
export function returnFor(bets: BetMap, result: number): number {
  let total = 0;
  for (const [id, amount] of Object.entries(bets)) {
    const spot = SPOTS[id];
    if (!spot || amount <= 0) continue;
    if (spot.numbers.includes(result)) total += amount * MULTIPLIERS[spot.type];
  }
  return round2(total);
}

export function winningSpotIds(bets: BetMap, result: number): string[] {
  return Object.entries(bets)
    .filter(([id, amount]) => amount > 0 && SPOTS[id]?.numbers.includes(result))
    .map(([id]) => id);
}

function rand(): number {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 4294967296;
  }
  return Math.random();
}

const pickFrom = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

interface Outcome {
  number: number;
  payout: number;
}

const firstNonEmpty = (...pools: Outcome[][]): Outcome[] => pools.find((p) => p.length > 0) ?? [];

/**
 * Decide the winning number for a round.
 * With probability WIN_RATE (35%) a number is chosen that gives the player a
 * net profit; otherwise (65%) a number that makes the player lose.
 * Falls back gracefully when a category is impossible for the given bets.
 */
export function pickResult(bets: BetMap): number {
  const total = totalOf(bets);
  if (total <= 0) return pickFrom(NUMBERS);

  const outcomes: Outcome[] = NUMBERS.map((n) => ({ number: n, payout: returnFor(bets, n) }));
  const eps = 0.005;
  const wins = outcomes.filter((o) => o.payout > total + eps);
  const losses = outcomes.filter((o) => o.payout < total - eps);
  const pushes = outcomes.filter((o) => Math.abs(o.payout - total) <= eps);

  const wantWin = rand() < WIN_RATE;
  const pool = wantWin ? firstNonEmpty(wins, pushes, losses) : firstNonEmpty(losses, pushes, wins);
  const chosen = pool.length > 0 ? pickFrom(pool) : outcomes[0];
  return chosen.number;
}

export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatChip(n: number): string {
  if (n >= 1000) return `${+(n / 1000).toFixed(1)}K`;
  if (Number.isInteger(n)) return `${n}`;
  return `${+n.toFixed(2)}`;
}
