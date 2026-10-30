export type BetRecord = {
  id: string;
  bet: number;
  multiplier: number;
  payout: number;
  profit: number;
  win: boolean;
  hash: string;
  at: number;
};

export type Stats = {
  spins: number;
  wins: number;
  losses: number;
  wagered: number;
  returned: number;
  bestWin: number;
  biggestMultiplier: number;
};
