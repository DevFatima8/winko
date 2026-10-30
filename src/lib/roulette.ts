// European (single zero) roulette logic – purely client side, no database.

export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18,
  29, 7, 28, 12, 35, 3, 26,
];

export const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type NumColor = "red" | "black" | "green";

export const colorOf = (n: number): NumColor => (n === 0 ? "green" : RED_NUMBERS.has(n) ? "red" : "black");

/** Chance (0..1) that a round in which the player has bets ends in a WIN for the player. */
export const WIN_RATE = 0.35;

export const CHIP_VALUES = [1, 5, 10, 25, 100, 500] as const;

export type Placement = { key: string; amount: number };

export type BetInfo = { numbers: number[]; payout: number; label: string };

/** number at grid column c (0-11) and row r (0 = top row) */
export const gridNumber = (c: number, r: number) => c * 3 + (3 - r);

export const makeKey = (type: string, nums: number[]) => `${type}:${[...nums].sort((a, b) => a - b).join("-")}`;

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export function betInfo(key: string): BetInfo {
  const [type, rest] = key.split(":");
  const nums = rest ? rest.split("-").map(Number) : [];
  switch (type) {
    case "n":
      return { numbers: nums, payout: 35, label: `Straight ${nums[0]}` };
    case "sp":
      return { numbers: nums, payout: 17, label: `Split ${nums.join("/")}` };
    case "st":
      return { numbers: nums, payout: 11, label: `Street ${nums.join("/")}` };
    case "tr":
      return { numbers: nums, payout: 11, label: `Trio ${nums.join("/")}` };
    case "co":
      return { numbers: nums, payout: 8, label: `Corner ${nums.join("/")}` };
    case "fo":
      return { numbers: nums, payout: 8, label: "First Four" };
    case "sl":
      return { numbers: nums, payout: 5, label: `Line ${nums[0]}-${nums[5]}` };
    case "dz": {
      const d = nums[0];
      return { numbers: range((d - 1) * 12 + 1, d * 12), payout: 2, label: `${d === 1 ? "1st" : d === 2 ? "2nd" : "3rd"} 12` };
    }
    case "col": {
      const c = nums[0];
      return { numbers: range(1, 36).filter((n) => n % 3 === (c === 3 ? 0 : c)), payout: 2, label: "2 to 1" };
    }
    case "low":
      return { numbers: range(1, 18), payout: 1, label: "1-18" };
    case "high":
      return { numbers: range(19, 36), payout: 1, label: "19-36" };
    case "even":
      return { numbers: range(1, 36).filter((n) => n % 2 === 0), payout: 1, label: "Even" };
    case "odd":
      return { numbers: range(1, 36).filter((n) => n % 2 === 1), payout: 1, label: "Odd" };
    case "red":
      return { numbers: range(1, 36).filter((n) => colorOf(n) === "red"), payout: 1, label: "Red" };
    case "black":
      return { numbers: range(1, 36).filter((n) => colorOf(n) === "black"), payout: 1, label: "Black" };
    default:
      return { numbers: [], payout: 0, label: "" };
  }
}

export type Hotspot = { key: string; x: number; y: number };

/** Inner-bet hotspots. x in columns (0..12), y in rows (0..3) inside the 12x3 number grid. */
export function buildHotspots(): Hotspot[] {
  const out: Hotspot[] = [];
  for (let c = 0; c < 12; c++) {
    for (let r = 0; r < 3; r++) {
      if (c < 11) out.push({ key: makeKey("sp", [gridNumber(c, r), gridNumber(c + 1, r)]), x: c + 1, y: r + 0.5 });
      if (r < 2) out.push({ key: makeKey("sp", [gridNumber(c, r), gridNumber(c, r + 1)]), x: c + 0.5, y: r + 1 });
      if (c < 11 && r < 2)
        out.push({
          key: makeKey("co", [gridNumber(c, r), gridNumber(c + 1, r), gridNumber(c, r + 1), gridNumber(c + 1, r + 1)]),
          x: c + 1,
          y: r + 1,
        });
    }
    out.push({ key: makeKey("st", [c * 3 + 1, c * 3 + 2, c * 3 + 3]), x: c + 0.5, y: 3 });
    if (c < 11) out.push({ key: makeKey("sl", range(c * 3 + 1, c * 3 + 6)), x: c + 1, y: 3 });
  }
  // zero related
  out.push({ key: makeKey("sp", [0, 3]), x: 0, y: 0.5 });
  out.push({ key: makeKey("sp", [0, 2]), x: 0, y: 1.5 });
  out.push({ key: makeKey("sp", [0, 1]), x: 0, y: 2.5 });
  out.push({ key: makeKey("tr", [0, 2, 3]), x: 0, y: 1 });
  out.push({ key: makeKey("tr", [0, 1, 2]), x: 0, y: 2 });
  out.push({ key: makeKey("fo", [0, 1, 2, 3]), x: 0, y: 3 });
  return out;
}

export function aggregate(placements: Placement[]): Record<string, number> {
  const agg: Record<string, number> = {};
  for (const p of placements) agg[p.key] = (agg[p.key] ?? 0) + p.amount;
  return agg;
}

export const totalOf = (placements: Placement[]) => placements.reduce((s, p) => s + p.amount, 0);

/** Total money returned (stake included) for the bets if `n` is the winning number. */
export function returnFor(agg: Record<string, number>, n: number): number {
  let ret = 0;
  for (const [key, amount] of Object.entries(agg)) {
    const info = betInfo(key);
    if (info.numbers.includes(n)) ret += amount * (info.payout + 1);
  }
  return ret;
}

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/**
 * Chooses the winning number.
 * - No bets: fully random.
 */
export function pickOutcome(agg: Record<string, number>): number {
  const all = range(0, 36);
  const stake = Object.values(agg).reduce((s, a) => s + a, 0);
  if (stake <= 0) return pick(all);

  const winners = all.filter((n) => returnFor(agg, n) > stake);
  const losers = all.filter((n) => returnFor(agg, n) < stake);
  const wantWin = Math.random() < WIN_RATE;

  if (wantWin && winners.length) return pick(winners);
  if (!wantWin && losers.length) return pick(losers);
  if (losers.length) return pick(losers);
  if (winners.length) return pick(winners);
  return pick(all);
}

export const fmtMoney = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export const fmtChip = (n: number) => (n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : `${n}`);
