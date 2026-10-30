import { createDeck, evaluateHand, settleRound, shouldPlay, type Card } from "@/components/three-card-poker/lib/poker";
import type { EngineStep, InteractiveCardEngine } from "./browserCardInteractiveGames";
import { record, reject, sample, shuffled } from "./interactiveCardUtil";

type State = { ante: number; pairPlus: number; player: Card[]; dealer: Card[] };

const isMoney = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && Math.round(value * 100) === value * 100;
const settle = (state: State, folded: boolean) => settleRound({
  ante: state.ante, pairPlus: state.pairPlus, play: folded ? 0 : state.ante, folded,
  playerHand: evaluateHand(state.player), dealerHand: evaluateHand(state.dealer),
});

function finish(state: State, folded: boolean, debit = 0): EngineStep<State> {
  const settled = settle(state, folded);
  return {
    state, phase: "result", debit: debit || undefined, claim: settled.returned,
    view: { ante: state.ante, pairPlus: state.pairPlus, play: folded ? 0 : state.ante, folded, player: state.player, dealer: state.dealer, ...settled },
  };
}

/**
 * Selection { ante, pairPlus } must equal the chips already accepted. A winning slot deals a hand
 * the recommended strategy plays for a profit (Pair Plus profit when there is no ante); a losing
 * slot deals one that loses money whether the player plays or folds. Pushes are never counted as wins.
 */
export const threeCardPokerEngine: InteractiveCardEngine<State> = {
  start({ stake, selection, win }) {
    const { ante, pairPlus } = record(selection);
    if (!isMoney(ante) || !isMoney(pairPlus) || (ante > 0 && ante < 10) || (pairPlus > 0 && pairPlus < 10) || ante + pairPlus < 10 ||
        Math.round((ante + pairPlus) * 100) !== Math.round(stake * 100)) reject("Ante and Pair Plus must match the accepted chips.");
    const state = sample(() => {
      const deck = shuffled(createDeck());
      return { ante, pairPlus, player: deck.slice(0, 3), dealer: deck.slice(3, 6) };
    }, value => {
      if (ante === 0) return settle(value, false).profit > 0 === win;
      if (win) return shouldPlay(evaluateHand(value.player)) && settle(value, false).profit > 0;
      return settle(value, false).profit < 0 && settle(value, true).profit < 0;
    });
    if (ante === 0) return finish(state, false);
    return { state, phase: "decision", view: { ante, pairPlus, play: 0, player: state.player } };
  },
  act(state, move, { balance }) {
    if (move === "fold") return finish(state, true);
    if (move !== "play") reject("Unknown Three Card Poker action.");
    if (balance < state.ante) reject("Insufficient balance.");
    return finish(state, false, state.ante);
  },
};