import { generateUnwinnableHand, generateWinnableHand, meldType, shuffle, solve, type Card, type Group } from "@/components/rummy/engine";
import type { EngineStep, InteractiveCardEngine } from "./browserCardInteractiveGames";
import { record, reject, secureRandom } from "./interactiveCardUtil";

type State = { stake: number; hand: Card[] };

/** A winning slot deals a hand that can be fully melded; a losing slot deals one that cannot. */
export const rummyEngine: InteractiveCardEngine<State> = {
  start({ stake, win }) {
    let hand = win ? generateWinnableHand(secureRandom) : generateUnwinnableHand(secureRandom);
    if (Boolean(solve(hand)) !== win) {
      if (win) throw new Error("Rummy deal did not match the assigned round.");
      hand = generateUnwinnableHand(secureRandom);
      if (solve(hand)) throw new Error("Rummy deal did not match the assigned round.");
    }
    hand = shuffle(hand, secureRandom);
    return { state: { stake, hand }, phase: "play", view: { hand } };
  },
  act(state, move, { selection }): EngineStep<State> {
    if (move === "forfeit") return { state, phase: "result", view: { hand: state.hand, win: false, groups: [] }, claim: 0 };
    if (move !== "declare") reject("Unknown rummy action.");
    const raw = record(selection).groups;
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > 5) reject("Declare every card in valid melds.");
    const byId = new Map(state.hand.map(card => [card.id, card]));
    const used = new Set<string>();
    const groups: Group[] = [];
    for (const ids of raw) {
      if (!Array.isArray(ids)) reject("Declare every card in valid melds.");
      const cards = ids.map(id => {
        const card = typeof id === "string" ? byId.get(id) : undefined;
        if (!card || used.has(card.id)) reject("Declared melds must use each dealt card once.");
        used.add(card.id);
        return card;
      });
      const type = meldType(cards);
      if (!type) reject("Not a valid SET or RUN.");
      groups.push({ type, cards });
    }
    if (used.size !== state.hand.length) reject("Every dealt card must be in a meld.");
    return { state, phase: "result", view: { hand: state.hand, win: true, groups }, claim: state.stake * 2 };
  },
};