/**
 * Each game engine draws from winBand()/lossBand() so the platform-wide ratio holds.
 * Values below 1.01 are never returned for a crash-out / cash-out style game (min 1.01).
 */

export function isWinOutcome(): boolean {
  return Math.random() < 0.35;
}

export const MAX_MULTIPLIER = 100;

/** Retain the platform's share of a gross winning payout and return the player's net amount. */
export const payoutAfterHouseShare = (grossPayout: number) =>
  Math.floor(Math.max(0, grossPayout) * 0.98 * 100) / 100;

/** Uniform float in [a,b) */
export const urand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Weighted multiplier in the WIN band (>= minWin). Distribution: mostly 1.5–5,
 * some 5–20, rare big multipliers.
 */
export function winMultiplier(minWin = 1.5, maxWin = 50): number {
  const r = Math.random();
  let m: number;
  if (r < 0.62) m = urand(minWin, 3.0);
  else if (r < 0.88) m = urand(3.0, 8.0);
  else if (r < 0.98) m = urand(8.0, 25);
  else m = urand(25, maxWin);
  return Math.min(MAX_MULTIPLIER, Math.max(1.01, Math.round(m * 100) / 100));
}

/** Multiplier in the LOSS band (1.01 .. below 1.5 or a hazard before the player can profit). */
export function lossMultiplier(stopAt = 1.45): number {
  return Math.max(1.01, Math.round(urand(1.01, stopAt) * 100) / 100);
}

/**
 * Choose a losing lane/hazard index for stepping games given the player's position
 * and number of lanes.
 * safeLanes (arrays per step) can be used to make hazards feel natural (in front of player).
 */
export function pickHazardLane(lanes: number, avoid: number[] = []): number | null {
  if (isWinOutcome()) return null;
  const pool = [];
  for (let l = 1; l <= lanes; l++) if (!avoid.includes(l)) pool.push(l);
  const list = pool.length ? pool : Array.from({ length: lanes }, (_, i) => i + 1);
  return list[Math.floor(Math.random() * list.length)];
}

/** For tile/cell games (Mines): number of safe reveals possible before a hazard, 0 means immediate loss */
export function safeReveals(maxSafe: number): number {
  // 65% → capped early/late according to each game; engine uses its own cap
  if (isWinOutcome()) return maxSafe; // full run possible; player decides cashout
  return Math.floor(Math.random() * (maxSafe + 1));
}

export function surviveTo(target: number, maxTarget: number): boolean {
  return isWinOutcome() ? target <= maxTarget : false;
}
