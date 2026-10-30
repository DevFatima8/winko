import { randomInt } from "node:crypto";
import type { MultiplayerTransaction } from "./multiplayer-store";
import { nextPlayerWin } from "./playerWinCycle";
export { isBrowserRouletteGame } from "./rouletteGameRules";
import { validateBrowserRouletteSelection } from "./browserRouletteSelection";
export { BrowserRouletteSelectionError, validateBrowserRouletteSelection } from "./browserRouletteSelection";
export type { BrowserRouletteSelection } from "./browserRouletteSelection";
import { constructHand, evaluateHand, type CardData } from "@/components/poker-roulette/lib/poker";

export type BrowserRouletteGame = "european-roulette" | "mini-roulette" | "poker-roulette";
export type BrowserRouletteNumberOutcome = { number: number; payout: number };
export type BrowserPokerRouletteOutcome = { cards: CardData[]; category: number; winners: number[]; payout: number };
export type BrowserRouletteOutcome = BrowserRouletteNumberOutcome | BrowserPokerRouletteOutcome;

export async function serverBrowserRouletteOutcome(
  tx: MultiplayerTransaction, userId: string, game: string, stake: number, selection: unknown,
): Promise<{ claim: number; outcome: BrowserRouletteOutcome }> {
  const { bets, wins, losses } = validateBrowserRouletteSelection(game, stake, selection);
  // Validation precedes slot consumption; the caller holds the game lock and settles in this transaction.
  const choices = await nextPlayerWin(tx, game, userId) ? wins : losses;
  const chosen = choices[randomInt(choices.length)];
  if (game === "poker-roulette") {
    const cards = constructHand(chosen.value);
    const category = evaluateHand(cards);
    if (category !== chosen.value) throw new Error("Roulette hand construction failed. Retry the same wager.");
    return { claim: chosen.payout, outcome: {
      cards, category, winners: Object.keys(bets).map(Number).filter(cat => category >= cat), payout: chosen.payout,
    } };
  }
  return { claim: chosen.payout, outcome: { number: chosen.value, payout: chosen.payout } };
}
