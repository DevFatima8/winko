import type { MultiplayerTransaction } from "./multiplayer-store";
import { nextPlayerWin } from "./playerWinCycle";
import { prepareServerSpin as oxSpin } from "@/components/fortune-ox/lib/fortuneOx";
import { prepareServerSpin as gemsSpin } from "@/components/fortune-gems/game/logic";
import { prepareServerSpin as toucanSpin } from "@/components/fortune-toucan/lib/fortune";
import { prepareServerSequence as gatesSpins } from "@/components/gates-of-olympus/game/engine";
import { prepareServerSequence as diaoSpins } from "@/components/diao-chan/game/engine";
import { readBrowserSlotOutcome, type BrowserSlotGame, type BrowserSlotOutcome } from "./browserSlotTypes";
export type { BrowserSlotGame, BrowserSlotOutcome, BrowserSlotOutcomes, BrowserSlotSelection } from "./browserSlotTypes";

export const SERVER_BROWSER_SLOT_GAMES = [
  "fortune-ox", "fortune-gems", "fortune-toucan", "gates-of-olympus", "diao-chan",
] as const;
export function isServerBrowserSlotGame(game: string): game is BrowserSlotGame {
  return (SERVER_BROWSER_SLOT_GAMES as readonly string[]).includes(game);
}
export class BrowserSlotSelectionError extends Error {}
const money = (amount: number) => Math.round(amount * 100) / 100;

export async function serverSlotOutcome(
  tx: MultiplayerTransaction, userId: string, game: string, stake: number, selection: unknown,
): Promise<{ claim: number; outcome: BrowserSlotOutcome }> {
  if (!isServerBrowserSlotGame(game) || !Number.isFinite(stake) || stake < 10 || money(stake) !== stake ||
      stake > Number.MAX_SAFE_INTEGER / 100 || !selection || typeof selection !== "object" || Array.isArray(selection)) {
    throw new BrowserSlotSelectionError("Invalid slot wager.");
  }
  const input = selection as Record<string, unknown>;
  let extra = false;
  let baseBet = stake;
  if (game === "fortune-gems") {
    if (Object.keys(input).some(key => !["extra", "baseBet"].includes(key)) ||
        typeof input.extra !== "boolean" || typeof input.baseBet !== "number" ||
        !Number.isFinite(input.baseBet) || input.baseBet < 10 || money(input.baseBet) !== input.baseBet ||
        money(input.baseBet * (input.extra ? 1.5 : 1)) !== stake) {
      throw new BrowserSlotSelectionError("Extra Bet must match the accepted stake.");
    }
    extra = input.extra;
    baseBet = input.baseBet;
  } else if (Object.keys(input).length) {
    throw new BrowserSlotSelectionError("This slot has no selectable outcome.");
  }
  const won = await nextPlayerWin(tx, game, userId);
  let outcome: BrowserSlotOutcome;
  switch (game) {
    case "fortune-ox": {
      const spin = oxSpin(stake, won);
      outcome = { game, stake, payout: spin.total, spin };
      break;
    }
    case "fortune-gems": {
      const spin = gemsSpin(extra, won, baseBet);
      outcome = { game, stake, payout: money(spin.payMultiplier * baseBet), spin, extra, baseBet };
      break;
    }
    case "fortune-toucan": {
      const spin = toucanSpin(stake, won);
      outcome = { game, stake, payout: spin.totalWin, spin };
      break;
    }
    case "gates-of-olympus": {
      const spins = gatesSpins(stake, won);
      outcome = { game, stake, payout: money(spins.reduce((sum, spin) => sum + spin.amount, 0)), spins };
      break;
    }
    case "diao-chan": {
      const sequence = diaoSpins(stake, won);
      const free = sequence.singleMode ? sequence.freeModes[sequence.singleMode] ?? [] : [];
      outcome = { game, stake, payout: money(sequence.spin.totalWin + free.reduce((sum, spin) => sum + spin.totalWin, 0)), ...sequence };
      break;
    }
  }
  if (!readBrowserSlotOutcome(game, outcome, stake) || (outcome.payout > 0) !== won) {
    throw new Error("The slot engine could not prepare a supported capped result.");
  }
  return { claim: outcome.payout, outcome };
}
