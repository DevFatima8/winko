export type RacePhase = "idle" | "countdown" | "racing" | "result";

export type Horse = {
  id: number;
  name: string;
  colorName: string;
  coat: string;
  highlight: string;
  shadow: string;
  jersey: string;
  helmet: string;
  accent: string;
};

export type RacePlan = {
  id: string;
  round: number;
  winnerId: number;
  selectedHorseId: number;
  stake: number;
  playerWon: boolean;
  finishingPaces: number[];
  seed: number;
};

export type RaceResult = {
  raceId: string;
  round: number;
  winningHorseId: number;
  selectedHorseId: number;
  won: boolean;
  stake: number;
  payout: number;
  order: number[];
};

export const STARTING_BALANCE = 1_000;
export const WIN_PROBABILITY = 0.35;
export const PAYOUT_MULTIPLIER = 2.75;
export const RACE_DURATION = 12_000;
export const RACE_DISTANCE = 1_800;
export const SCREEN_WIDTH = 480;
export const SCREEN_HEIGHT = 360;

export const HORSES: Horse[] = [
  { id: 1, name: "White Lightning", colorName: "White", coat: "#f4f6ec", highlight: "#ffffff", shadow: "#adcada", jersey: "#faf7e9", helmet: "#f35121", accent: "#e8eef3" },
  { id: 2, name: "Pink Panther", colorName: "Pink", coat: "#e535d4", highlight: "#fc75ee", shadow: "#a51499", jersey: "#d55be7", helmet: "#9644d8", accent: "#ed73dc" },
  { id: 3, name: "Red Rocket", colorName: "Red", coat: "#e92224", highlight: "#ff5951", shadow: "#9b131a", jersey: "#ef2929", helmet: "#ef3332", accent: "#fa7874" },
  { id: 4, name: "Blue Thunder", colorName: "Blue", coat: "#303ce4", highlight: "#6f7cff", shadow: "#142092", jersey: "#f5df26", helmet: "#303acb", accent: "#8799ff" },
  { id: 5, name: "Golden Glory", colorName: "Yellow", coat: "#f3e928", highlight: "#fff878", shadow: "#b69c18", jersey: "#3d36dd", helmet: "#eeb5de", accent: "#f2df66" },
  { id: 6, name: "Green Machine", colorName: "Green", coat: "#41cc45", highlight: "#8ce961", shadow: "#228833", jersey: "#dd67db", helmet: "#4fba3d", accent: "#90d988" },
];

function randomUnit(): number {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const value = crypto.getRandomValues(new Uint32Array(1))[0];
    return value / 4_294_967_296;
  }
  return Math.random();
}

export function makeRacePlan(selectedHorseId: number, stake: number, round: number): RacePlan {
  const playerWon = randomUnit() < WIN_PROBABILITY;
  const rivals = HORSES.filter((horse) => horse.id !== selectedHorseId);
  const winnerId = playerWon
    ? selectedHorseId
    : rivals[Math.floor(randomUnit() * rivals.length)].id;

  return {
    id: `${round}-${Date.now()}-${Math.floor(randomUnit() * 1_000_000)}`,
    round,
    winnerId,
    selectedHorseId,
    stake,
    playerWon,
    finishingPaces: HORSES.map((horse) => horse.id === winnerId ? 1 : 0.916 + randomUnit() * 0.062),
    seed: randomUnit() * 100,
  };
}

export function getRacePositions(progress: number, plan: RacePlan): number[] {
  const t = Math.max(0, Math.min(1, progress));
  return HORSES.map((horse, index) => {
    const pace = plan.finishingPaces[index] ?? 0.95;
    const surge = Math.sin(Math.PI * t) * (
      Math.sin(t * 11 + index * 1.6 + plan.seed) * 0.02 +
      Math.sin(t * 22 + index * 0.8) * 0.008
    );
    return Math.max(0, Math.min(horse.id === plan.winnerId ? 1 : 0.995, t * pace + surge));
  });
}

export function settleRace(plan: RacePlan): RaceResult {
  const order = HORSES
    .map((horse, index) => ({ id: horse.id, pace: plan.finishingPaces[index] }))
    .sort((a, b) => b.pace - a.pace)
    .map((horse) => horse.id);

  return {
    raceId: plan.id,
    round: plan.round,
    winningHorseId: plan.winnerId,
    selectedHorseId: plan.selectedHorseId,
    won: plan.playerWon,
    stake: plan.stake,
    payout: plan.playerWon ? Number((plan.stake * PAYOUT_MULTIPLIER).toFixed(2)) : 0,
    order,
  };
}

export function formatCoins(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}
