export type Side = "head" | "tail";

export const WIN_CHANCE = 0.35;
export const LOSS_CHANCE = 1 - WIN_CHANCE;

/** Total return on a winning bet (stake x multiplier). */
export const PAYOUT_MULTIPLIER = 2;

export const MIN_BET = 10;
export const START_BALANCE = 1000;

/** Duration of the coin flip animation in ms. */
export const FLIP_MS = 2800;

export type FlipResponse = {
  win: boolean;
  result: Side;
};

export type RoundItem = {
  id: number;
  time: number;
  pick: Side;
  result: Side;
  amount: number;
  win: boolean;
};

export type Stats = {
  bets: number;
  wins: number;
  losses: number;
  wagered: number;
  net: number;
};

export const EMPTY_STATS: Stats = {
  bets: 0,
  wins: 0,
  losses: 0,
  wagered: 0,
  net: 0,
};

export function isSide(value: unknown): value is Side {
  return value === "head" || value === "tail";
}

export function otherSide(side: Side): Side {
  return side === "head" ? "tail" : "head";
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const currency = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function fmt(n: number): string {
  return n < 0 ? `-Rs. ${currency.format(-n)}` : `Rs. ${currency.format(n)}`;
}
