import { randomInt } from "node:crypto";
import { cents } from "./dailyPool";
import type { MultiplayerTransaction } from "./multiplayer-store";
import { nextPlayerWin } from "./playerWinCycle";
import { isRemainingDealCardGame, RemainingDealCardError, serverRemainingDealCardOutcome } from "./browserCardRemainingDeals";

export class BrowserCardSelectionError extends Error {}

function selectionObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BrowserCardSelectionError("Invalid card selection.");
  return value as Record<string, unknown>;
}

export async function serverCardOutcome(tx: MultiplayerTransaction, userId: string, game: string, stake: number, selection: unknown) {
  if (isRemainingDealCardGame(game)) {
    try { return await serverRemainingDealCardOutcome(tx, userId, game, stake, selection); }
    catch (error) {
      if (error instanceof RemainingDealCardError) throw new BrowserCardSelectionError(error.message);
      throw error;
    }
  }
  if (game === "poker-betting") {
    const engine = await import("@/components/poker-betting/lib/poker");
    const round = engine.dealRound(await nextPlayerWin(tx, game, userId));
    const payout = round.playerWins ? cents(stake * (1 + engine.PAYOUTS[round.playerScore.category])) / 100 : 0;
    return { claim: payout, outcome: { ...round, payout } };
  }
  if (game === "muflis") {
    const engine = await import("@/components/muflis/lib/muflis");
    const round = engine.dealRigged(await nextPlayerWin(tx, game, userId));
    const payout = round.playerWins ? cents(stake * 2) / 100 : 0;
    return { claim: payout, outcome: { ...round, payout } };
  }
  if (game === "teen-patti-best-of-four") {
    const engine = await import("@/components/teen-patti-best-of-four/lib/teenpatti");
    const round = engine.dealRigged(await nextPlayerWin(tx, game, userId) ? 1 : 0);
    const payout = round.outcome === "win" ? cents(stake * 2) / 100 : 0;
    return { claim: payout, outcome: { ...round, payout } };
  }
  const input = selectionObject(selection);
  if (game === "teen-patti-ak47") {
    const ante = input.ante;
    const pairPlus = input.pairPlus;
    if (typeof ante !== "number" || typeof pairPlus !== "number" ||
        !Number.isFinite(ante) || !Number.isFinite(pairPlus) ||
        ante < 10 || pairPlus < 0 || cents(ante) / 100 !== ante || cents(pairPlus) / 100 !== pairPlus ||
        cents(ante) + cents(pairPlus) !== cents(stake)) throw new BrowserCardSelectionError("Invalid AK47 bet allocation.");
    const engine = await import("@/components/teen-patti-ak47/lib/teenpatti");
    const won = await nextPlayerWin(tx, game, userId);
    // A losing ante can still have a legitimately winning Pair Plus hand.
    // Deal a hand with no side award for a losing cycle slot, never erase its payout.
    for (let attempt = 0; attempt < 1000; attempt++) {
      const round = engine.dealRound(won);
      const multiplier = engine.PAIR_PLUS_PAYOUT[round.playerEval.category];
      if (!won && pairPlus > 0 && multiplier > 0) continue;
      const payout = cents((won ? ante * 2 : 0) + (pairPlus > 0 && multiplier > 0 ? pairPlus * (1 + multiplier) : 0)) / 100;
      return { claim: payout, outcome: { ...round, payout } };
    }
    throw new Error("AK47 could not deal a matching hand. Retry the same wager.");
  }
  if (game === "red-vs-black") {
    if (input.color !== "red" && input.color !== "black") throw new BrowserCardSelectionError("Choose one card colour.");
    const isWin = await nextPlayerWin(tx, game, userId);
    const winningColor = isWin ? input.color : input.color === "red" ? "black" : "red";
    const suits = winningColor === "red" ? ["♥", "♦"] : ["♠", "♣"];
    const values = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const payout = isWin ? cents(stake * 2) / 100 : 0;
    return { claim: payout, outcome: { isWin, winningColor, suit: suits[randomInt(2)], value: values[randomInt(13)], payout } };
  }
  if (game === "three-cards") {
    if (!Number.isInteger(input.picked) || Number(input.picked) < 0 || Number(input.picked) > 2) throw new BrowserCardSelectionError("Choose a card.");
    const picked = Number(input.picked);
    const win = await nextPlayerWin(tx, game, userId);
    const aceIndex = win ? picked : [0, 1, 2].filter(index => index !== picked)[randomInt(2)];
    const cards = [
      { rank: "7", suit: "♥", color: "text-red-600" },
      { rank: "4", suit: "♦", color: "text-red-600" },
      { rank: "9", suit: "♣", color: "text-black" },
    ];
    cards[aceIndex] = { rank: "A", suit: "♠", color: "text-black" };
    const payout = win ? Math.round(stake * 2.8) : 0;
    return { claim: payout, outcome: { win, picked, cards, payout } };
  }
  throw new Error("Unsupported server card engine.");
}
