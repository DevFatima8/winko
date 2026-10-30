import { evaluateBets, PLAYER_WIN_RATE, SLOT_COUNT, totalOf, type Bets } from "./game-config";

export type Outcome = "win" | "lose" | "idle";

export interface Decision {
  /** Index (0-23) of the light the machine stops on */
  slot: number;
  outcome: Outcome;
}

/**
 * Decide where the light stops.
 *
 * the actual light is picked uniformly across all matching slots of the wheel,
 * so frequent animals (Chicken / Rabbit) still show up more often than rare ones.
 *
 * If the player has no bets, the result is purely random (24 equally likely lights).
 */
export function decideOutcome(bets: Bets, rng: () => number = Math.random): Decision {
  const total = totalOf(bets);
  if (total <= 0) {
    return { slot: Math.floor(rng() * SLOT_COUNT) % SLOT_COUNT, outcome: "idle" };
  }

  const winSlots: number[] = [];
  const loseSlots: number[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const { net } = evaluateBets(bets, i);
    if (net > 0) winSlots.push(i);
    else loseSlots.push(i);
  }

  const wantWin = rng() < PLAYER_WIN_RATE;
  let pool: number[];
  if (wantWin) pool = winSlots.length > 0 ? winSlots : loseSlots;
  else pool = loseSlots.length > 0 ? loseSlots : winSlots;

  const slot = pool[Math.floor(rng() * pool.length) % pool.length];
  return { slot, outcome: winSlots.includes(slot) ? "win" : "lose" };
}
