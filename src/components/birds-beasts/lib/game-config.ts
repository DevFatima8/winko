/**
 * Birds & Beasts – shared game configuration (safe for client + server).
 */

export type Group = "birds" | "beasts" | "shark";

export const ANIMAL_IDS = [
  "eagle",
  "owl",
  "ostrich",
  "chicken",
  "lion",
  "panda",
  "monkey",
  "rabbit",
  "goldenShark",
  "silverShark",
] as const;

export type AnimalId = (typeof ANIMAL_IDS)[number];

export const GROUP_BET_KEYS = ["birds", "beasts"] as const;
export type GroupBetKey = (typeof GROUP_BET_KEYS)[number];

/** Anything a player can put a chip on. */
export type BetKey = AnimalId | GroupBetKey;
export type Bets = Partial<Record<BetKey, number>>;

export interface Animal {
  id: AnimalId;
  name: string;
  shortName: string;
  group: Group;
  /** Profit multiplier – stake is returned on top (x12 => stake * 13 back). */
  multiplier: number;
  image: string;
}

export const ANIMALS: Record<AnimalId, Animal> = {
  eagle: { id: "eagle", name: "Eagle", shortName: "Eagle", group: "birds", multiplier: 12, image: "/animals/eagle.png" },
  owl: { id: "owl", name: "Owl", shortName: "Owl", group: "birds", multiplier: 8, image: "/animals/owl.png" },
  ostrich: { id: "ostrich", name: "Ostrich", shortName: "Ostrich", group: "birds", multiplier: 6, image: "/animals/ostrich.png" },
  chicken: { id: "chicken", name: "Chicken", shortName: "Chicken", group: "birds", multiplier: 4, image: "/animals/chicken.png" },
  lion: { id: "lion", name: "Lion", shortName: "Lion", group: "beasts", multiplier: 12, image: "/animals/lion.png" },
  panda: { id: "panda", name: "Panda", shortName: "Panda", group: "beasts", multiplier: 8, image: "/animals/panda.png" },
  monkey: { id: "monkey", name: "Monkey", shortName: "Monkey", group: "beasts", multiplier: 6, image: "/animals/monkey.png" },
  rabbit: { id: "rabbit", name: "Rabbit", shortName: "Rabbit", group: "beasts", multiplier: 4, image: "/animals/rabbit.png" },
  goldenShark: { id: "goldenShark", name: "Golden Shark", shortName: "G. Shark", group: "shark", multiplier: 50, image: "/animals/golden.png" },
  silverShark: { id: "silverShark", name: "Silver Shark", shortName: "S. Shark", group: "shark", multiplier: 25, image: "/animals/silver.png" },
};

export const BIRDS: AnimalId[] = ["eagle", "owl", "ostrich", "chicken"];
export const BEASTS: AnimalId[] = ["lion", "panda", "monkey", "rabbit"];
export const SHARKS: AnimalId[] = ["goldenShark", "silverShark"];

/** Birds / Beasts side bets pay 1 : 0.95 */
export const GROUP_MULTIPLIER = 0.95;

/**
 * The 24 lights of the machine, clockwise starting from the top.
 * Frequencies: Chicken/Rabbit x5, Ostrich/Monkey x3, Owl/Panda x2, Eagle/Lion x1, each Shark x1.
 */
export const WHEEL: AnimalId[] = [
  "chicken", // 0
  "rabbit", // 1
  "owl", // 2
  "monkey", // 3
  "chicken", // 4
  "goldenShark", // 5
  "rabbit", // 6
  "ostrich", // 7
  "panda", // 8
  "chicken", // 9
  "lion", // 10
  "ostrich", // 11
  "rabbit", // 12
  "chicken", // 13
  "monkey", // 14
  "owl", // 15
  "rabbit", // 16
  "silverShark", // 17
  "ostrich", // 18
  "panda", // 19
  "chicken", // 20
  "eagle", // 21
  "rabbit", // 22
  "monkey", // 23
];

export const SLOT_COUNT = WHEEL.length;

export const MIN_BET = 10;
export const CHIPS = [50, 100, 500, 1000, 5000] as const;

/** Round timings */
export const BET_SECONDS = 15;
export const TIMES_UP_MS = 1400;
export const RESULT_MS = 5000;
export const START_BANNER_MS = 1600;

/** House setting: share of rounds (with bets placed) that end as a net win for the player. */
export const PLAYER_WIN_RATE = 0.35;

export const START_BALANCE = 10000;

export function isBetKey(value: string): value is BetKey {
  return (ANIMAL_IDS as readonly string[]).includes(value) || (GROUP_BET_KEYS as readonly string[]).includes(value);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function totalOf(bets: Bets): number {
  let sum = 0;
  for (const v of Object.values(bets)) sum += v ?? 0;
  return round2(sum);
}

export interface Evaluation {
  totalBet: number;
  /** Total returned to the player (stake + profit of winning bets) */
  payout: number;
  /** payout - totalBet */
  net: number;
  winningKeys: BetKey[];
}

/** Evaluate what a set of bets returns if the light stops on `slot`. */
export function evaluateBets(bets: Bets, slot: number): Evaluation {
  const animal = ANIMALS[WHEEL[slot]];
  let totalBet = 0;
  let payout = 0;
  const winningKeys: BetKey[] = [];

  for (const [key, amount] of Object.entries(bets) as [BetKey, number | undefined][]) {
    if (!amount || amount <= 0) continue;
    totalBet += amount;
    if (key === animal.id) {
      payout += amount * (1 + animal.multiplier);
      winningKeys.push(key);
    } else if ((key === "birds" || key === "beasts") && animal.group === key) {
      payout += amount * (1 + GROUP_MULTIPLIER);
      winningKeys.push(key);
    }
  }

  totalBet = round2(totalBet);
  payout = round2(payout);
  return { totalBet, payout, net: round2(payout - totalBet), winningKeys };
}

/** Which wheel slots does a bet key cover? */
export function slotsCoveredBy(key: BetKey): number[] {
  const out: number[] = [];
  WHEEL.forEach((id, i) => {
    if (key === id) out.push(i);
    else if ((key === "birds" || key === "beasts") && ANIMALS[id].group === key) out.push(i);
  });
  return out;
}

export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return formatMoney(n);
}
