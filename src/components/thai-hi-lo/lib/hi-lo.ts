import { BET_PRESETS } from "@/lib/betPresets";

export type BetType = "high" | "low" | "odd" | "even" | "triple";

export interface BetOption {
  id: BetType;
  labelTh: string;
  labelEn: string;
  descriptionTh: string;
  /** profit multiplier (stake is returned on top of this) */
  payout: number;
}

export const BET_OPTIONS: BetOption[] = [
  {
    id: "low",
    labelTh: "LOW",
    labelEn: "SUM 4–10",
    descriptionTh: "Total 4–10 (triple loses)",
    payout: 1,
  },
  {
    id: "high",
    labelTh: "HIGH",
    labelEn: "SUM 11–17",
    descriptionTh: "Total 11–17 (triple loses)",
    payout: 1,
  },
  {
    id: "odd",
    labelTh: "ODD",
    labelEn: "ODD TOTAL",
    descriptionTh: "Total is an odd number",
    payout: 1,
  },
  {
    id: "even",
    labelTh: "EVEN",
    labelEn: "EVEN TOTAL",
    descriptionTh: "Total is an even number",
    payout: 1,
  },
  {
    id: "triple",
    labelTh: "TRIPLE",
    labelEn: "ALL 3 SAME",
    descriptionTh: "All three dice match",
    payout: 1,
  },
];

/** Legacy preview probability; paid outcomes use the server's distinct-player cycle. */
export const WIN_RATE = 0.35;
export const LOSE_RATE = 1 - WIN_RATE;

export const MIN_BET = 10;
export const STARTING_BALANCE = 1000;

export const CHIP_VALUES = BET_PRESETS;

export type DiceRoll = [number, number, number];

export type HiLoOutcome = { dice: DiceRoll; won: boolean; payout: number };
export function isHiLoOutcome(value: unknown): value is HiLoOutcome {
  return value !== null && typeof value === "object" &&
    "dice" in value && Array.isArray(value.dice) && value.dice.length === 3 &&
    value.dice.every(die => typeof die === "number" && Number.isInteger(die) && die >= 1 && die <= 6) &&
    "won" in value && typeof value.won === "boolean" &&
    "payout" in value && typeof value.payout === "number" && Number.isFinite(value.payout) && value.payout >= 0;
}

/** All 216 possible outcomes of three dice. */
export const ALL_COMBOS: DiceRoll[] = (() => {
  const combos: DiceRoll[] = [];
  for (let a = 1; a <= 6; a++) {
    for (let b = 1; b <= 6; b++) {
      for (let c = 1; c <= 6; c++) {
        combos.push([a, b, c]);
      }
    }
  }
  return combos;
})();

export function sumOf(dice: DiceRoll): number {
  return dice[0] + dice[1] + dice[2];
}

export function isTriple(dice: DiceRoll): boolean {
  return dice[0] === dice[1] && dice[1] === dice[2];
}

/** Authentic Thai Hi-Lo (Sic Bo) rules: any triple beats High/Low. */
export function isWin(bet: BetType, dice: DiceRoll): boolean {
  const total = sumOf(dice);
  const triple = isTriple(dice);
  switch (bet) {
    case "high":
      return total >= 11 && total <= 17 && !triple;
    case "low":
      return total >= 4 && total <= 10 && !triple;
    case "odd":
      return total % 2 === 1;
    case "even":
      return total % 2 === 0;
    case "triple":
      return triple;
  }
}

function partitionByBet(bet: BetType): { wins: DiceRoll[]; losses: DiceRoll[] } {
  const wins: DiceRoll[] = [];
  const losses: DiceRoll[] = [];
  for (const combo of ALL_COMBOS) {
    (isWin(bet, combo) ? wins : losses).push(combo);
  }
  return { wins, losses };
}

const POOLS: Record<BetType, { wins: DiceRoll[]; losses: DiceRoll[] }> = {
  high: partitionByBet("high"),
  low: partitionByBet("low"),
  odd: partitionByBet("odd"),
  even: partitionByBet("even"),
  triple: partitionByBet("triple"),
};

/**
 * Generates the next dice roll.
 * A weighted coin first decides win (35%) or loss (65%); the dice are then
 * drawn uniformly from the matching pool so the long-run win rate is exactly
 * the configured ratio while every individual roll still looks natural.
 */
export function generateOutcome(
  bet: BetType,
  rng: () => number = Math.random,
): DiceRoll {
  const shouldWin = rng() < WIN_RATE;
  const pool = shouldWin ? POOLS[bet].wins : POOLS[bet].losses;
  const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[index];
}

/** Fair-odds sanity data: how many combos win for each bet. */
export function winComboCount(bet: BetType): number {
  return POOLS[bet].wins.length;
}
