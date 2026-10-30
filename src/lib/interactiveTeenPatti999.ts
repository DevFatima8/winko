import { randomInt } from "node:crypto";
import { compareHands, createDeck, evaluateHand, pairPlusPays, type Card } from "@/components/teen-patti-999/lib/teenpatti";
import type { EngineStep, InteractiveCardEngine } from "./browserCardInteractiveGames";
import { record, reject, sample, shuffled } from "./interactiveCardUtil";

export const TP999_STAKE_CAP_MULT = 128;
type State = {
  boot: number; player: Card[]; dealer: Card[]; pot: number; playerBet: number; dealerBet: number;
  stake: number; seen: boolean; rounds: number; sideBet: number; folded: boolean; chosen: boolean;
};

const cost = (state: State) => state.seen ? Math.min(state.stake * 2, state.boot * TP999_STAKE_CAP_MULT) : state.stake;
const money = (value: unknown) => typeof value === "number" && Number.isFinite(value) && Math.round(value * 100) === value * 100;

function claimFor(state: State) {
  if (state.folded) return { won: false, ppReturn: 0, claim: 0 };
  const playerScore = evaluateHand(state.player);
  const won = compareHands(playerScore, evaluateHand(state.dealer)) > 0;
  const mult = pairPlusPays(playerScore);
  const ppReturn = state.sideBet > 0 && mult > 0 ? state.sideBet * (mult + 1) : 0;
  return { won, ppReturn, claim: (won ? state.pot : 0) + ppReturn };
}

function step(state: State, phase: string, terminal = false, debit = 0, dealerShows = false): EngineStep<State> {
  const { boot: _boot, chosen: _chosen, ...publicState } = state;
  const reveal = terminal && !state.folded;
  const result = terminal ? claimFor(state) : null;
  return {
    state, phase, debit: debit || undefined, claim: result?.claim,
    view: {
      ...publicState,
      player: state.seen || reveal ? state.player : null,
      dealer: reveal ? state.dealer : null,
      dealerShows,
      ...(result ? { won: result.won, ppReturn: result.ppReturn, net: result.claim - state.playerBet - state.sideBet } : { won: null, ppReturn: 0, net: 0 }),
    },
  };
}

/**
 * Selection { boot, side } must sum to the accepted stake. A winning slot deals a player hand that
 * beats the dealer (and, with a side bet, also pays Pairs Plus); a losing slot deals a beaten hand
 * (with a side bet, a no-pair hand). Packing forfeits both the pot and the side bet.
 */
export const teenPatti999Engine: InteractiveCardEngine<State> = {
  start({ stake, selection, win }) {
    const { boot, side } = record(selection);
    if (!money(boot) || !money(side) || (boot as number) < 10 || (side as number) < 0 || ((side as number) > 0 && (side as number) < 10) ||
        Math.round(((boot as number) + (side as number)) * 100) !== Math.round(stake * 100)) reject("Boot and side bet must match the accepted stake.");
    const hands = sample(() => {
      const deck = shuffled(createDeck());
      return { player: deck.slice(0, 3), dealer: deck.slice(3, 6) };
    }, ({ player, dealer }) => {
      const score = evaluateHand(player);
      const cmp = compareHands(score, evaluateHand(dealer));
      const pays = pairPlusPays(score) > 0;
      return win ? cmp > 0 && ((side as number) === 0 || pays) : cmp < 0 && ((side as number) === 0 || !pays);
    });
    const b = boot as number;
    return step({ boot: b, ...hands, pot: b * 2, playerBet: b, dealerBet: b, stake: b, seen: false, rounds: 0, sideBet: side as number, folded: false, chosen: false }, "choose");
  },
  act(state, move, { selection }) {
    if (move === "pack") return step({ ...state, folded: true }, "result", true);
    if (move === "choose") {
      if (state.chosen) reject("Blind or seen is already chosen.");
      const seen = record(selection).seen;
      if (typeof seen !== "boolean") reject("Choose blind or seen.");
      const amount = seen ? Math.min(state.stake * 2, state.boot * TP999_STAKE_CAP_MULT) : state.stake;
      return step({
        ...state, seen, chosen: true, playerBet: state.playerBet + amount, dealerBet: state.dealerBet + amount,
        pot: state.pot + amount * 2, rounds: 1, stake: Math.min(state.stake * 2, state.boot * TP999_STAKE_CAP_MULT),
      }, "turn", false, amount);
    }
    if (!state.chosen) reject("Choose blind or seen first.");
    const amount = cost(state);
    if (move === "chaal") {
      const next = {
        ...state, playerBet: state.playerBet + amount, dealerBet: state.dealerBet + amount, pot: state.pot + amount * 2,
        rounds: state.rounds + 1, stake: Math.min(state.stake * 2, state.boot * TP999_STAKE_CAP_MULT),
      };
      const shows = randomInt(1_000_000) < Math.round(Math.min(0.85, 0.22 + next.rounds * 0.22) * 1_000_000);
      return shows ? step(next, "result", true, amount, true) : step(next, "turn", false, amount);
    }
    if (move === "show") {
      if (state.rounds < 1) reject("Show is available after the first round.");
      return step({ ...state, playerBet: state.playerBet + amount, dealerBet: state.dealerBet + amount, pot: state.pot + amount * 2 }, "result", true, amount);
    }
    return reject("Unknown Teen Patti 999 action.");
  },
};