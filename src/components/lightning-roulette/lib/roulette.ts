export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7,
  28, 12, 35, 3, 26,
];

export const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type NumColor = "red" | "black" | "green";
export const colorOf = (n: number): NumColor => (n === 0 ? "green" : RED_NUMBERS.has(n) ? "red" : "black");

export const WIN_PROBABILITY = 0.35;

export type SpotKind =
  | "straight"
  | "split"
  | "street"
  | "trio"
  | "corner"
  | "line"
  | "column"
  | "dozen"
  | "outside";

export type Spot = {
  id: string;
  kind: SpotKind;
  label: string;
  numbers: number[];
  payout: number;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
};

export const TABLE_W = 14;
export const TABLE_H = 4.6;

const numPos = (n: number) => ({ x: 1 + Math.floor((n - 1) / 3), y: 2 - ((n - 1) % 3) });

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

function buildSpots(): Spot[] {
  const spots: Spot[] = [];
  const add = (s: Spot) => spots.push(s);

  // Zero
  add({ id: "n-0", kind: "straight", label: "0", numbers: [0], payout: 35, x: 0, y: 0, w: 1, h: 3, z: 1 });

  // Straight numbers
  for (let n = 1; n <= 36; n++) {
    const p = numPos(n);
    add({ id: `n-${n}`, kind: "straight", label: String(n), numbers: [n], payout: 35, x: p.x, y: p.y, w: 1, h: 1, z: 1 });
  }

  // Columns (2 to 1)
  const colNums = [
    range(1, 36).filter((n) => n % 3 === 0),
    range(1, 36).filter((n) => n % 3 === 2),
    range(1, 36).filter((n) => n % 3 === 1),
  ];
  colNums.forEach((numbers, r) =>
    add({ id: `col-${r}`, kind: "column", label: "2 to 1", numbers, payout: 2, x: 13, y: r, w: 1, h: 1, z: 1 }),
  );

  // Dozens
  ["1st 12", "2nd 12", "3rd 12"].forEach((label, i) =>
    add({
      id: `doz-${i}`,
      kind: "dozen",
      label,
      numbers: range(i * 12 + 1, i * 12 + 12),
      payout: 2,
      x: 1 + i * 4,
      y: 3,
      w: 4,
      h: 0.8,
      z: 1,
    }),
  );

  // Outside / even chances
  const outside: { id: string; label: string; numbers: number[] }[] = [
    { id: "low", label: "1 to 18", numbers: range(1, 18) },
    { id: "even", label: "EVEN", numbers: range(1, 36).filter((n) => n % 2 === 0) },
    { id: "red", label: "RED", numbers: range(1, 36).filter((n) => RED_NUMBERS.has(n)) },
    { id: "black", label: "BLACK", numbers: range(1, 36).filter((n) => !RED_NUMBERS.has(n)) },
    { id: "odd", label: "ODD", numbers: range(1, 36).filter((n) => n % 2 === 1) },
    { id: "high", label: "19 to 36", numbers: range(19, 36) },
  ];
  outside.forEach((o, i) =>
    add({ id: `out-${o.id}`, kind: "outside", label: o.label, numbers: o.numbers, payout: 1, x: 1 + i * 2, y: 3.8, w: 2, h: 0.8, z: 1 }),
  );

  // ---- Hotspots (splits, streets, corners, lines) ----
  const hs = (id: string, kind: SpotKind, numbers: number[], cx: number, cy: number, w: number, h: number, payout: number, z: number) =>
    add({ id, kind, label: "", numbers, payout, x: cx - w / 2, y: cy - h / 2, w, h, z });

  // Horizontal-neighbour splits (n, n+3)
  for (let n = 1; n <= 33; n++) {
    const p = numPos(n);
    hs(`sp-${n}-${n + 3}`, "split", [n, n + 3], p.x + 1, p.y + 0.5, 0.26, 0.5, 17, 3);
  }
  // Vertical-neighbour splits (n, n+1)
  for (let n = 1; n <= 35; n++) {
    if (n % 3 === 0) continue;
    const p = numPos(n);
    hs(`sp-${n}-${n + 1}`, "split", [n, n + 1], p.x + 0.5, p.y, 0.5, 0.26, 17, 3);
  }
  // Corners
  for (let n = 1; n <= 32; n++) {
    if (n % 3 === 0) continue;
    const p = numPos(n);
    hs(`co-${n}`, "corner", [n, n + 1, n + 3, n + 4], p.x + 1, p.y, 0.3, 0.3, 8, 5);
  }
  // Streets
  for (let n = 1; n <= 34; n += 3) {
    const p = numPos(n);
    hs(`st-${n}`, "street", [n, n + 1, n + 2], p.x + 0.5, 2.88, 0.5, 0.24, 11, 4);
  }
  // Six lines
  for (let n = 1; n <= 31; n += 3) {
    const p = numPos(n);
    hs(`li-${n}`, "line", range(n, n + 5), p.x + 1, 2.88, 0.3, 0.24, 5, 5);
  }
  // Zero splits & trios
  hs("sp-0-1", "split", [0, 1], 1, 2.5, 0.26, 0.5, 17, 3);
  hs("sp-0-2", "split", [0, 2], 1, 1.5, 0.26, 0.5, 17, 3);
  hs("sp-0-3", "split", [0, 3], 1, 0.5, 0.26, 0.5, 17, 3);
  hs("tr-0-1-2", "trio", [0, 1, 2], 1, 2, 0.3, 0.3, 11, 5);
  hs("tr-0-2-3", "trio", [0, 2, 3], 1, 1, 0.3, 0.3, 11, 5);

  return spots;
}

export const SPOTS: Spot[] = buildSpots();
export const SPOT_MAP: Record<string, Spot> = Object.fromEntries(SPOTS.map((s) => [s.id, s]));

export type Bets = Record<string, number>;
export type Lightning = Record<number, number>;

export const totalOf = (bets: Bets) => Object.values(bets).reduce((a, b) => a + b, 0);

/** Total returned to the player (stake + winnings) if `n` is the winning number. */
export function returnFor(n: number, bets: Bets, lightning: Lightning): number {
  let ret = 0;
  for (const [id, amount] of Object.entries(bets)) {
    const spot = SPOT_MAP[id];
    if (!spot || !spot.numbers.includes(n)) continue;
    const mult = spot.kind === "straight" && lightning[n] ? lightning[n] : spot.payout;
    ret += amount * (mult + 1);
  }
  return ret;
}

const MULTS = [
  { m: 50, w: 30 },
  { m: 100, w: 25 },
  { m: 200, w: 20 },
  { m: 300, w: 13 },
  { m: 400, w: 8 },
  { m: 500, w: 4 },
];

/** 1 to 5 random Lightning numbers with 50x - 500x multipliers. */
export function generateLightning(): Lightning {
  const count = 1 + Math.floor(Math.random() * 5);
  const pool = range(0, 36);
  const out: Lightning = {};
  const totalW = MULTS.reduce((a, b) => a + b.w, 0);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    const n = pool.splice(idx, 1)[0];
    let r = Math.random() * totalW;
    let mult = MULTS[0].m;
    for (const o of MULTS) {
      if ((r -= o.w) < 0) {
        mult = o.m;
        break;
      }
    }
    out[n] = mult;
  }
  return out;
}

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/**
 * 65% as a player LOSS (based on the bets currently on the table).
 */
export function pickOutcome(bets: Bets, lightning: Lightning): number {
  const all = range(0, 36);
  const total = totalOf(bets);
  if (total === 0) return pick(all);

  const returns = all.map((n) => returnFor(n, bets, lightning));
  const shouldWin = Math.random() < WIN_PROBABILITY;

  if (shouldWin) {
    const profit = all.filter((n) => returns[n] > total);
    if (profit.length) return pick(profit);
    const max = Math.max(...returns);
    return pick(all.filter((n) => returns[n] === max));
  }
  const zero = all.filter((n) => returns[n] === 0);
  if (zero.length) return pick(zero);
  const loss = all.filter((n) => returns[n] < total);
  if (loss.length) return pick(loss);
  const min = Math.min(...returns);
  return pick(all.filter((n) => returns[n] === min));
}
