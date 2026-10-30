import { randomInt } from "node:crypto";
import type { Card, Outcome, Suit } from "@/components/casino-war/lib/war";
import { InteractiveMoveError, type EngineStep, type InteractiveCardEngine } from "./browserCardInteractiveGames";

type Deal = { result: Outcome; player: Card; dealer: Card };
type WarState = {
  phase: "tie" | "done";
  ante: number;
  tie: number;
  initial: Deal;
  war: Deal;
  credit: number;
  decision?: "war" | "surrender";
};
const money = (amount: number) => Math.round(amount * 100) / 100;
const suits: Suit[] = ["S", "H", "D", "C"];

function pair(result: Outcome, excluded: Card[] = []): Deal {
  const cards: Card[] = [];
  for (const suit of suits) for (let rank = 2; rank <= 14; rank++) {
    if (!excluded.some(card => card.rank === rank && card.suit === suit)) cards.push({ rank, suit });
  }
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  for (const player of cards) for (const dealer of cards) {
    if (player === dealer) continue;
    if (result === "tie" ? player.rank === dealer.rank : result === "win" ? player.rank > dealer.rank : player.rank < dealer.rank) {
      return { result, player, dealer };
    }
  }
  throw new Error("Unable to deal Casino War cards.");
}

function view(state: WarState) {
  return {
    ...state.initial, phase: state.phase, ante: state.ante, tie: state.tie,
    tiePayout: state.credit,
    ...(state.decision === "war" ? { war: state.war } : {}),
    ...(state.decision ? { decision: state.decision } : {}),
  };
}

export const casinoWarEngine: InteractiveCardEngine<WarState> = {
  start({ stake, selection, win }): EngineStep<WarState> {
    if (!selection || typeof selection !== "object" || Array.isArray(selection)) throw new InteractiveMoveError("Choose ante and tie bets.");
    const { ante, tie } = selection as { ante: unknown; tie: unknown };
    if (typeof ante !== "number" || typeof tie !== "number" || !Number.isFinite(ante) || !Number.isFinite(tie) ||
        ante <= 0 || tie < 0 || money(ante) !== ante || money(tie) !== tie || money(ante + tie) !== stake) {
      throw new InteractiveMoveError("Casino War bets must match the accepted stake; an ante is required.");
    }
    // A paid tie must remain a genuine net win even when the player surrenders.
    // Ante-only losing ties still offer the unchanged war/surrender choice.
    const paidTieWins = money(tie * 11 + Math.floor(ante / 2)) > stake;
    const tieRound = win
      ? paidTieWins && (money(ante * 2) <= stake || randomInt(100) < 8)
      : tie === 0 && randomInt(100) < 8;
    const initial = pair(tieRound ? "tie" : win ? "win" : "lose");
    const war = pair(win ? "win" : "lose", [initial.player, initial.dealer]);
    const credit = tieRound ? money(tie * 11) : 0;
    const state: WarState = { phase: tieRound ? "tie" : "done", ante, tie, initial, war, credit };
    if (tieRound) return { state, phase: "tie", view: view(state), ...(credit > 0 ? { credit } : {}) };
    return { state, phase: "done", view: view(state), claim: win ? money(ante * 2) : 0 };
  },
  act(state, move): EngineStep<WarState> {
    if (state.phase !== "tie") throw new InteractiveMoveError("This Casino War round has already finished.");
    if (move === "surrender") {
      const next: WarState = { ...state, phase: "done", decision: "surrender" };
      return { state: next, phase: "done", view: view(next), claim: Math.floor(state.ante / 2) };
    }
    if (move === "war") {
      const next: WarState = { ...state, phase: "done", decision: "war" };
      return { state: next, phase: "done", view: view(next), debit: state.ante, claim: state.war.result === "win" ? money(state.ante * 3) : 0 };
    }
    throw new InteractiveMoveError("Choose war or surrender.");
  },
};
