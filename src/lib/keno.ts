/**
 * Keno engine — 40 tile board, 10 balls drawn, 1-10 picks, 4 risk levels.
 *
 * The RNG is a *controlled* engine: every round is decided as a win (payout >= bet)
 * with probability 0.35, or a loss with probability 0.65. The number of hits is then
 * sampled from the real hypergeometric distribution conditioned on that outcome, so the
 * game looks and feels 100% natural.
 */

export const POOL_SIZE = 40;
export const DRAW_COUNT = 10;
export const MAX_PICKS = 10;
export const WIN_RATE = 0.35;
export const TARGET_RTP = 0.96;

export type RiskLevel = "classic" | "low" | "medium" | "high";

export const RISK_LEVELS: RiskLevel[] = ["classic", "low", "medium", "high"];

/** PAYOUTS[risk][picks][hits] => multiplier of the bet */
export const PAYOUTS: Record<RiskLevel, Record<number, number[]>> = {
  classic: {
    1: [0, 2.74],
    2: [0, 0.58, 2.31],
    3: [0, 0.56, 1.8, 6.75],
    4: [0, 0.48, 1.69, 4.1, 18.1],
    5: [0, 0.25, 1.41, 4.14, 16.6, 36.3],
    6: [0, 0, 1.53, 4.17, 9.74, 22.3, 55.7],
    7: [0, 0, 0.41, 1.65, 4.14, 9.93, 24.8, 49.6],
    8: [0, 0, 0, 1.61, 4.29, 10.7, 26.8, 48.2, 75],
    9: [0, 0, 0, 1.34, 4.01, 9.35, 20, 40.1, 66.8, 114],
    10: [0, 0, 0, 1.96, 2.8, 5.6, 14, 35, 70, 112, 140],
  },
  low: {
    1: [0, 2.74],
    2: [0, 0.67, 2.23],
    3: [0, 0, 2.25, 8.26],
    4: [0, 0, 1.97, 4.48, 44.8],
    5: [0, 0, 1.53, 4.27, 13.2, 305],
    6: [0, 0, 1.42, 3.56, 9.48, 71.1, 474],
    7: [0, 0, 1.4, 3.08, 7, 28, 168, 700],
    8: [0, 0, 0.59, 1.32, 2.94, 8.83, 36.8, 147, 515],
    9: [0, 0, 0.51, 1.28, 2.56, 6.82, 25.6, 85.2, 341, 724],
    10: [0, 0, 2.22, 2.46, 3.08, 5.13, 10.3, 30.8, 513, 800, 1000],
  },
  medium: {
    1: [0, 2.74],
    2: [0, 0.76, 2.17],
    3: [0, 0, 2.2, 8.81],
    4: [0, 0, 1.92, 5.12, 38.4],
    5: [0, 0, 1.42, 4.07, 14.2, 397],
    6: [0, 0, 1.31, 3.81, 10.9, 54.5, 545],
    7: [0, 0, 1.2, 3, 8.41, 30, 180, 721],
    8: [0, 0, 0.51, 1.28, 3.2, 9.6, 38.4, 160, 480],
    9: [0, 0, 0.42, 1.26, 2.8, 7, 28, 105, 350, 630],
    10: [0, 0, 0, 1.86, 2.9, 5.8, 13.9, 34.8, 348, 696, 1000],
  },
  high: {
    1: [0, 2.74],
    2: [0, 0, 2.74],
    3: [0, 0, 1.33, 18.6],
    4: [0, 0, 1.14, 5.68, 102],
    5: [0, 0, 0, 1.26, 13.5, 42],
    6: [0, 0, 0, 1.52, 5.05, 50.5, 121],
    7: [0, 0, 0, 1.6, 4.01, 20.1, 120, 217],
    8: [0, 0, 0, 1.48, 3.95, 11.8, 49.4, 237, 296],
    9: [0, 0, 0, 1.39, 3.48, 9.28, 29, 116, 315, 394],
    10: [0, 0, 0, 0, 1.7, 4.24, 12.7, 33.9, 184, 230, 288],
  },
};

export function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/** P(exactly `hits` of your `picks` are drawn) — hypergeometric */
export function hitProbability(picks: number, hits: number): number {
  if (picks < 1 || picks > MAX_PICKS) return 0;
  if (hits < 0 || hits > picks) return 0;
  return (
    (comb(picks, hits) * comb(POOL_SIZE - picks, DRAW_COUNT - hits)) /
    comb(POOL_SIZE, DRAW_COUNT)
  );
}

export function getTable(risk: RiskLevel, picks: number): number[] {
  return PAYOUTS[risk][Math.min(Math.max(picks, 1), MAX_PICKS)] ?? [];
}

export function getMultiplier(risk: RiskLevel, picks: number, hits: number): number {
  const table = getTable(risk, picks);
  return table[hits] ?? 0;
}

export function configRtp(risk: RiskLevel, picks: number): number {
  const table = getTable(risk, picks);
  let winMass = 0;
  let lossMass = 0;
  for (let h = 0; h <= picks; h++) {
    const p = hitProbability(picks, h);
    if ((table[h] ?? 0) >= 1) winMass += p;
    else lossMass += p;
  }
  if (winMass <= 0 || lossMass <= 0) return 0;
  let rtp = 0;
  for (let h = 0; h <= picks; h++) {
    const p = hitProbability(picks, h);
    const m = table[h] ?? 0;
    if (m >= 1) rtp += WIN_RATE * (p / winMass) * m;
    else rtp += (1 - WIN_RATE) * (p / lossMass) * m;
  }
  return rtp;
}

function shuffle<T>(input: T[]): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sampleMany<T>(pool: T[], count: number): T[] {
  return shuffle(pool).slice(0, count);
}

function weightedPick(weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let roll = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

export type HistoryEntry = {
  id: number;
  multiplier: number;
  bet: number;
  payout: number;
  profit: number;
  win: boolean;
  hits: number;
  picks: number;
  risk: RiskLevel;
  drawn: number[];
  selected: number[];
};

export type RoundOutcome = {
  /** the 10 drawn tiles, in draw order */
  drawn: number[];
  hits: number;
  multiplier: number;
  bet: number;
  payout: number;
  profit: number;
  win: boolean;
};

export function playRound(
  selected: number[],
  risk: RiskLevel,
  bet: number,
): RoundOutcome {
  const picks = selected.length;
  const table = getTable(risk, picks);

  const probabilities: number[] = [];
  for (let h = 0; h <= picks; h++) probabilities.push(hitProbability(picks, h));

  let winMass = 0;
  let lossMass = 0;
  for (let h = 0; h <= picks; h++) {
    if ((table[h] ?? 0) >= 1) winMass += probabilities[h];
    else lossMass += probabilities[h];
  }
  if (winMass <= 0) winMass = 1;
  if (lossMass <= 0) lossMass = 1;

  const shouldWin = Math.random() < WIN_RATE;

  const weights: number[] = [];
  for (let h = 0; h <= picks; h++) {
    const isWinCell = (table[h] ?? 0) >= 1;
    const mass = isWinCell ? winMass : lossMass;
    weights.push(shouldWin === isWinCell ? probabilities[h] / mass : 0);
  }

  let hits = weightedPick(weights);
  if (shouldWin && (table[hits] ?? 0) < 1) hits = table.findIndex((m) => m >= 1);
  if (!shouldWin && (table[hits] ?? 0) >= 1) hits = 0;
  hits = Math.min(Math.max(hits, 0), picks);

  // Build the draw: `hits` of the player's tiles + (10 - hits) from the rest.
  const rest: number[] = [];
  for (let n = 1; n <= POOL_SIZE; n++) {
    if (!selected.includes(n)) rest.push(n);
  }
  const hitTiles = sampleMany(selected, hits);
  const missTiles = sampleMany(rest, DRAW_COUNT - hits);
  const drawn = shuffle([...hitTiles, ...missTiles]);

  const multiplier = table[hits] ?? 0;
  const payout = bet * multiplier;

  return {
    drawn,
    hits,
    multiplier,
    bet,
    payout,
    profit: payout - bet,
    win: payout >= bet,
  };
}

export function randomSelection(count?: number): number[] {
  const target =
    count ?? Math.max(1, Math.floor(Math.random() * MAX_PICKS) + 1);
  const pool = Array.from({ length: POOL_SIZE }, (_, i) => i + 1);
  return sampleMany(pool, Math.min(Math.max(target, 1), MAX_PICKS)).sort(
    (a, b) => a - b,
  );
}

export function formatMoney(value: number, decimals = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatMultiplier(multiplier: number): string {
  if (multiplier >= 100) return `${Math.round(multiplier)}x`;
  if (multiplier >= 10) return `${multiplier.toFixed(1)}x`;
  return `${multiplier.toFixed(2)}x`;
}
