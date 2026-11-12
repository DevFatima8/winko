import { randomInt } from "node:crypto";
import { ANIMALS, PLAYER_WIN_RATE, WHEEL, evaluateBets, totalOf, type Bets } from "@/components/birds-beasts/lib/game-config";
import type { MultiplayerTransaction } from "./multiplayer-store";

type Category = "regular" | "x8" | "x12" | "goldenShark" | "silverShark";
type RoundCycle = { _id: string; remaining: Category[]; targets: boolean[] };
const ID = "birds-beasts:rounds-20-target:v2";
const quotas: Record<Category, number> = { regular: 94, x8: 2, x12: 2, goldenShark: 1, silverShark: 1 };

function shuffle<T>(values: T[]): T[] {
  for (let i = values.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

function fresh(): RoundCycle {
  const nonSharks = shuffle<Category>([
    ...Array<Category>(94).fill("regular"), "x8", "x8", "x12", "x12",
  ]);
  return {
    _id: ID,
    remaining: [...nonSharks.slice(0, 90), ...shuffle<Category>([...nonSharks.slice(90), "goldenShark", "silverShark"])],
    targets: shuffle([...Array<boolean>(Math.round(100 * PLAYER_WIN_RATE)).fill(true),
      ...Array<boolean>(100 - Math.round(100 * PLAYER_WIN_RATE)).fill(false)]),
  };
}

function categoryOf(slot: number): Category {
  const animal = WHEEL[slot];
  if (animal === "goldenShark" || animal === "silverShark") return animal;
  const multiplier = ANIMALS[animal].multiplier;
  return multiplier === 8 ? "x8" : multiplier === 12 ? "x12" : "regular";
}

/** Call under dailyPoolLock("birds-beasts"), in the same transaction as settlement or idle-request deduplication. */
export async function resolveBirdsBeastsRound(tx: MultiplayerTransaction, bets: Bets) {
  const cycle = await tx.get<RoundCycle>("multiplayerrooms", ID) ?? fresh();
  const valid = Array.isArray(cycle.remaining) && cycle.remaining.length > 0 && cycle.remaining.length <= 100 &&
    cycle.remaining.every(category => Object.hasOwn(quotas, category)) &&
    Object.entries(quotas).every(([category, count]) => cycle.remaining.filter(value => value === category).length <= count) &&
    cycle.remaining.every((category, index) => category !== "goldenShark" && category !== "silverShark" ||
      100 - cycle.remaining.length + index >= 90) &&
    Array.isArray(cycle.targets) && cycle.targets.length === cycle.remaining.length &&
    cycle.targets.every(value => typeof value === "boolean") &&
    cycle.targets.filter(Boolean).length <= 20 && cycle.targets.filter(value => !value).length <= 80;
  if (!valid) throw new Error("Birds & Beasts round cycle is invalid. Contact support.");

  const category = cycle.remaining[0];
  const wantWin = cycle.targets[0];
  const slots = WHEEL.flatMap((_, slot) => categoryOf(slot) === category ? [slot] : []);
  const matching = slots.filter(slot => (evaluateBets(bets, slot).net > 0) === wantWin);
  // Fixed appearance quotas take priority when the player's bets cannot produce the target result.
  const eligible = matching.length ? matching : slots;
  const slot = eligible[randomInt(eligible.length)];
  const result = evaluateBets(bets, slot);
  cycle.remaining.shift();
  cycle.targets.shift();
  await tx.put("multiplayerrooms", ID, cycle.remaining.length ? cycle : fresh());
  return {
    claim: result.payout,
    outcome: { slot, animal: WHEEL[slot], outcome: totalOf(bets) <= 0 ? "idle" : result.net > 0 ? "win" : "lose" },
  };
}
