import { buildDeck, compareHands, evaluateHand, type PlayingCard } from "@/components/teen-patti/lib/teenpatti";
import type { InteractiveCardEngine } from "./browserCardInteractiveGames";
import { record, reject, sample, shuffled } from "./interactiveCardUtil";

type Hand = [PlayingCard, PlayingCard, PlayingCard];
type State = { stake: number; player: Hand; dealer: Hand };

const names = (state: State) => ({ playerHand: evaluateHand(state.player).name, dealerHand: evaluateHand(state.dealer).name });

/** Ties go to the dealer, so a winning slot needs a strictly better player hand. */
export const teenPattiEngine: InteractiveCardEngine<State> = {
  start({ stake, win }) {
    const state = sample(() => {
      const deck = shuffled(buildDeck());
      return { stake, player: deck.slice(0, 3) as Hand, dealer: deck.slice(3, 6) as Hand };
    }, value => compareHands(evaluateHand(value.player), evaluateHand(value.dealer)) > 0 === win);
    return { state, phase: "dealt", view: { player: state.player, playerHand: evaluateHand(state.player).name } };
  },
  act(state, move, { selection }) {
    if (move === "fold") {
      return { state, phase: "result", view: { player: state.player, playerHand: evaluateHand(state.player).name, choice: "fold", win: false }, claim: 0 };
    }
    if (move !== "play") reject("Unknown Teen Patti action.");
    const choice = record(selection).choice;
    if (choice !== "blind" && choice !== "seen") reject("Choose blind or seen.");
    const won = compareHands(evaluateHand(state.player), evaluateHand(state.dealer)) > 0;
    return {
      state, phase: "result", claim: won ? state.stake * 2 : 0,
      view: { player: state.player, dealer: state.dealer, ...names(state), choice, win: won },
    };
  },
};