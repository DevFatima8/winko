/**
 * Crash Goal — core game maths.
 *
 * The round is decided the moment it starts:
 *     player's cash-out target, so a cash-out (manual or auto) wins.
 *     player's cash-out target, so the stake is lost.
 *
 */

export const WIN_RATIO = 0.35;
export const LOSS_RATIO = 0.65;

/** Maximum multiplier of the game (matches the original: x500). */
export const MAX_MULTIPLIER = 500;

/** Ball climb speed: multiplier = e^(GROWTH * seconds). */
export const GROWTH = 0.22;

export type RoundOutcome = "win" | "loss";

/** Rolls the fixed 35 / 65 outcome. */
export function rollOutcome(): RoundOutcome {
  return Math.random() < WIN_RATIO ? "win" : "loss";
}

/** Multiplier reached after `seconds` of flight. */
export function multiplierAt(seconds: number): number {
  return Math.exp(GROWTH * seconds);
}

/** Seconds of flight needed to reach `multiplier`. */
export function secondsFor(multiplier: number): number {
  return Math.log(multiplier) / GROWTH;
}

export interface CrashRoll {
  outcome: RoundOutcome;
  crashPoint: number;
}

/**
 * Builds the crash point for a round.
 *
 * `targets` are the player's active auto cash-out values.
 *   • winning round  -> the ball always flies past the HIGHEST target
 *   • losing round   -> the ball always bursts before the LOWEST target
 *
 */
export function generateCrashPoint(targets: (number | null)[]): CrashRoll {
  const outcome = rollOutcome();
  const active = targets.filter((t): t is number => typeof t === "number" && t > 1.01);
  const low = active.length ? Math.min(...active) : 3;
  const high = active.length ? Math.max(...active) : 3;

  let crashPoint: number;
  if (outcome === "win") {
    // Winning round — always clears every active target.
    crashPoint = high + 0.25 + Math.pow(Math.random(), 2) * (high * 1.8 + 2);
  } else {
    // Losing round — always bursts before the first target.
    crashPoint = 1.01 + Math.pow(Math.random(), 1.3) * (low - 1.01) * 0.985;
  }

  crashPoint = Math.min(MAX_MULTIPLIER, Math.max(1.01, crashPoint));
  return { outcome, crashPoint };
}

/** 1.9 -> "1.90", 12.34 -> "12.34", 123.4 -> "123.4" */
export function formatMultiplier(value: number): string {
  if (value >= 100) return value.toFixed(1);
  return value.toFixed(2);
}

/** 2000 -> "2,000.00" */
export function formatMoney(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Colour bucket used by the history pills / table. */
export function multiplierTone(value: number): "low" | "mid" | "high" {
  if (value < 2) return "low";
  if (value < 10) return "mid";
  return "high";
}
