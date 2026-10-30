export const MULTIPLAYER_GAMES = [
  "baccarat", "speed-baccarat", "dream-catcher", "football-studio",
  "auto-roulette", "lightning-roulette", "sic-bo", "blast-off",
  "nine-wickets", "7-up-down", "tai-xiu", "32-cards",
] as const;

export type MultiplayerGame = typeof MULTIPLAYER_GAMES[number];
export type MultiplayerPhase = "betting" | "running" | "result";
export type MultiplayerBet = {
  id: string;
  name: string;
  option: string;
  amount: number;
  roundNo: number;
  status: "pending" | "win" | "lose" | "cancelled";
  payout: number;
  poolPending?: boolean;
  poolClaim?: number;
  poolVersion?: string;
  mine: boolean;
  autoCashout?: number;
  cashoutMultiplier?: number;
};
export type MultiplayerRound<R = unknown> = {
  roundNo: number;
  phase: MultiplayerPhase;
  bettingEndsAt: number;
  resultAt: number;
  endsAt: number;
  result: R | null;
  multiplier?: number;
};
export type MultiplayerState<R = unknown> = {
  game: MultiplayerGame;
  tableMode?: "personal" | "shared";
  serverNow: number;
  balance: number | null;
  round: MultiplayerRound<R>;
  bets: MultiplayerBet[];
  queuedBets: MultiplayerBet[];
  myBets: MultiplayerBet[];
  myQueuedBets: MultiplayerBet[];
  history: { roundNo: number; result: R }[];
};
export type MultiplayerAction = {
  poolRulesVersion?: string;
  action: "bet" | "cancel" | "cashout";
  requestId: string;
  roundNo: number;
  option?: string;
  amount?: number;
  autoCashout?: number;
  betId?: string;
};
export type MultiplayerReply = { ok: true; roundNo: number; queued?: boolean } | { error: string };

export function poolRoundMessage(bets: readonly Pick<MultiplayerBet, "poolPending" | "poolClaim">[]) {
  if (!bets.some(bet => bet.poolPending)) return null;
  const claim = bets.reduce((sum, bet) => sum + (bet.poolPending ? bet.poolClaim ?? 0 : 0), 0);
  return `Round complete. Provisional claim Rs. ${claim.toFixed(2)} — daily pool payout pending; no winnings credited yet.`;
}
