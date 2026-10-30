export type Dir = "over" | "under";

export const WIN_RATE = 0.35;

export const MIN_BET = 10;
export const MAX_BET = 99_999_999;
export const START_BALANCE = 1000;
export const CHIP_REFILL = 1000;

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

export const fmt = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Displayed win chance in % — standard dice math (1% house edge on payout). */
export function winChanceFor(target: number, dir: Dir): number {
  const c = dir === "over" ? 100 - target : target;
  return round2(clamp(c, 0.01, 99.99));
}

/** Convert a win chance (%) back to the slider target for the given direction. */
export function targetForChance(chance: number, dir: Dir): number {
  return round2(clamp(dir === "over" ? 100 - chance : chance, 1, 99));
}

/** Standard dice payout: 99 / win chance, floored to 2 decimals. */
export function payoutFor(chance: number): number {
  return Math.floor((99 / chance) * 100) / 100;
}

const randBetween = (min: number, max: number) =>
  round2(min + Math.random() * (max - min));

export interface RollResult {
  value: number;
  win: boolean;
}

/**
 * Roll engine.
 *
 * The win/lose outcome is drawn against the house ratio (WIN_RATE) first,
 * then the dice value is generated inside the winning or losing band for
 * the player's current target. The session therefore converges to a
 * while the shown values still look like an even 0.00–100.00 dice roll.
 */
export function rollDice(target: number, dir: Dir): RollResult {
  const win = Math.random() < WIN_RATE;
  let value: number;
  if (dir === "under") {
    // win when value < target
    value = win
      ? randBetween(0, Math.max(target - 0.01, 0.01))
      : randBetween(target + 0.01, 100);
  } else {
    // win when value > target
    value = win
      ? randBetween(target + 0.01, 100)
      : randBetween(0, Math.max(target - 0.01, 0.01));
  }
  return { value: clamp(value, 0, 100), win };
}

export interface RollRecord {
  id: number;
  value: number;
  win: boolean;
  dir: Dir;
  target: number;
  bet: number;
  payout: number;
  profit: number; // signed
  ts: number;
}

export interface Stats {
  rolls: number;
  wins: number;
  wagered: number;
  biggestWin: number;
  biggestLoss: number; // most negative, or 0
  profit: number; // signed net
}

export const emptyStats: Stats = {
  rolls: 0,
  wins: 0,
  wagered: 0,
  biggestWin: 0,
  biggestLoss: 0,
  profit: 0,
};
