import { randomInt } from "node:crypto";
import { isWinOutcome } from "./outcomes";

const unit = () => randomInt(0, 2 ** 47) / 2 ** 47;

/** Sample the saved crash point from the game's survival curve, independently of the player. */
export function sampleCrashLane(survival: readonly number[]): number {
  if (survival.length < 2 || survival[0] !== 1 ||
      survival.some((value, index) => !Number.isFinite(value) || value < 0 || value > 1 ||
        index > 0 && value > survival[index - 1])) {
    throw new Error("Invalid crash survival curve.");
  }
  const roll = unit();
  for (let lane = 1; lane < survival.length; lane++) {
    if (roll >= survival[lane]) return lane;
  }
  return survival.length;
}

function pickWeighted(entries: [lane: number, weight: number][], fallback: number) {
  const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
  if (!(total > 0)) return fallback;
  let r = unit() * total;
  for (const [lane, w] of entries) {
    if (w <= 0) continue;
    r -= w;
    if (r < 0) return lane;
  }
  for (let i = entries.length - 1; i >= 0; i--) if (entries[i][1] > 0) return entries[i][0];
  return fallback;
}

/**
 * Secret crash lane for step games; lanes+1 means the road is cleared.
 * `survival[k]` = the game's own chance of surviving k steps (survival[0] = 1).
 * Winning rounds (35%) always pass `firstProfitLane`, then follow the road's own risk (they may still be hit later or clear it).
 * Losing rounds (65%) are hit somewhere on the road, weighted by that same per-step risk, so the out point can be the
 * first lane, just after the start, the middle or right before the end and cannot be guessed from the position.
 */
export function spreadCrashLane(survival: readonly number[], firstProfitLane: number): number {
  const lanes = Math.max(1, survival.length - 1);
  const s = (k: number) => Math.min(1, Math.max(0, survival[Math.min(k, lanes)] ?? 0));
  const hit = (k: number) => Math.max(0, s(k - 1) - s(k));
  const profit = Math.min(lanes, Math.max(1, Math.floor(firstProfitLane)));
  const flat = (from: number, to: number) => from + randomInt(0, Math.max(1, to - from + 1));

  if (isWinOutcome()) {
    const entries: [number, number][] = [];
    for (let k = profit + 1; k <= lanes; k++) entries.push([k, hit(k)]);
    entries.push([lanes + 1, s(lanes)]);
    return pickWeighted(entries, lanes + 1);
  }
  const entries: [number, number][] = [];
  for (let k = 1; k <= lanes; k++) entries.push([k, hit(k)]);
  return pickWeighted(entries, flat(1, lanes));
}
