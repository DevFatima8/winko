import { randomInt } from "node:crypto";
import type { EngineStep, InteractiveCardEngine } from "./browserCardInteractiveGames";
import { pick, record, reject } from "./interactiveCardUtil";

/** Suit is an index into the component's own suit symbols. Ranks are 2..14 (14 = Ace high). */
export type HiloCard = { rank: number; suit: number };
type State = { stake: number; card: HiloCard; trail: HiloCard[]; previous: HiloCard | null; streak: number; correctLeft: number };

export const HILO_MULTIPLIER = 1.85;
export const hiloCashout = (stake: number, streak: number) => Math.round(stake * Math.pow(HILO_MULTIPLIER, streak));

function step(state: State, phase: string, claim?: number): EngineStep<State> {
  return {
    state, phase, claim,
    view: { card: state.card, previous: state.previous, streak: state.streak, trail: state.trail, ...(claim === undefined ? {} : { payout: claim }) },
  };
}

/**
 * A winning slot allows 1-3 correct guesses (fixed at the deal and never revealed); the guess
 * after that, or any guess in a losing slot, is wrong. Cashing out after a correct guess is the
 * only way to profit, so a winning-slot player who keeps guessing can still lose.
 */
export const monsterHiloEngine: InteractiveCardEngine<State> = {
  start({ stake, win }) {
    const card = { rank: 3 + randomInt(11), suit: randomInt(4) };
    return step({ stake, card, trail: [card], previous: null, streak: 0, correctLeft: win ? 1 + randomInt(3) : 0 }, "playing");
  },
  act(state, move, { selection }) {
    if (move === "cashout") {
      if (state.streak < 1) reject("Win at least one guess before cashing out.");
      return step(state, "cashed", hiloCashout(state.stake, state.streak));
    }
    if (move !== "guess") reject("Unknown Monster Hilo action.");
    const direction = record(selection).direction;
    if (direction !== "higher" && direction !== "lower") reject("Choose higher or lower.");
    const rank = state.card.rank;
    if (direction === "higher" ? rank >= 14 : rank <= 2) reject("No card can beat that guess.");
    const correct = state.correctLeft > 0;
    const options: number[] = [];
    for (let value = 2; value <= 14; value++) {
      const higher = value > rank, lower = value < rank;
      if (correct ? (direction === "higher" ? higher : lower) : (direction === "higher" ? !higher : !lower)) options.push(value);
    }
    const next = { rank: pick(options), suit: randomInt(4) };
    const nextState: State = {
      ...state, previous: state.card, card: next, trail: [...state.trail, next].slice(-5),
      streak: correct ? state.streak + 1 : state.streak, correctLeft: correct ? state.correctLeft - 1 : 0,
    };
    return correct ? step(nextState, "playing") : step(nextState, "lost", 0);
  },
};