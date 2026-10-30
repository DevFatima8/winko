import type { AnimalId, BetKey } from "./lib/game-config";

export type Phase = "betting" | "closed" | "spinning" | "result";

export interface RoundRecord {
  round: number;
  slot: number;
  animal: AnimalId;
  totalBet: number;
  payout: number;
  net: number;
  winningKeys: BetKey[];
  at: number;
}
