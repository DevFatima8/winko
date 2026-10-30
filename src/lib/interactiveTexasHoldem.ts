import { bestHand, compareScores, createDeck, type Card } from "@/components/texas-holdem/cards";
import {
  BB, MAX_RAISES, computeTurn, dealerAct, initialState, playerCall, playerFold, playerRaiseTo, SB, startNextHand, type GameState,
} from "@/components/texas-holdem/holdem";
import type { EngineStep, InteractiveCardEngine } from "./browserCardInteractiveGames";
import { record, reject, sample, secureRandom, shuffled } from "./interactiveCardUtil";

type State = { win: boolean; game: GameState; grossCap?: number };
const HIDDEN: Card = { rank: 2, suit: "S" };
const GROSS_CAP = 2;

/** Public table: the undealt deck is never sent and the house cards stay hidden until revealed. */
export function publicHoldem(game: GameState): GameState {
  return { ...game, deck: [], dealerCards: game.revealDealer ? game.dealerCards : game.dealerCards.map(() => HIDDEN) };
}

function advance(game: GameState, win: boolean, frames: GameState[]) {
  let next = game;
  for (let guard = 0; computeTurn(next) === "dealer" && guard < 12; guard++) {
    next = dealerAct(next, secureRandom(), !win);
    frames.push(publicHoldem(next));
  }
  return next;
}

function step(before: GameState | null, game: GameState, win: boolean, frames: GameState[], grossCap?: number): EngineStep<State> {
  if (game.refundedStake > 0) reject("That raise exceeds the house stack.");
  const over = game.phase === "handOver";
  if (over && game.result?.winner === "tie") throw new Error("Hold'em showdown tied despite a strict deal.");
  if (over && grossCap !== undefined && game.grossReturn > game.acceptedStake * grossCap) {
    const grossReturn = game.acceptedStake * grossCap;
    game = {
      ...game, grossReturn, playerChips: game.playerChips - (game.grossReturn - grossReturn),
      result: game.result ? { ...game.result, amount: grossReturn } : null,
      log: [...game.log.slice(0, -1), `You win Rs. ${grossReturn.toLocaleString("en-US")}!`],
    };
    frames[frames.length - 1] = publicHoldem(game);
  }
  const debit = before ? game.acceptedStake - before.acceptedStake : 0;
  return {
    state: { win, game, ...(grossCap === undefined ? {} : { grossCap }) }, phase: over ? "handOver" : game.phase, debit: debit > 0 ? debit : undefined,
    claim: over ? game.grossReturn : undefined, view: { state: publicHoldem(game), frames },
  };
}

/**
 * Heads-up against the house AI using the table's own state machine. The nine cards are dealt so the
 * showdown has a strict winner matching the slot; a house assigned to win never folds. A player in a
 * winning slot can still fold (forfeit); a house in a losing slot may fold, which is a genuine win.
 */
export const texasHoldemEngine: InteractiveCardEngine<State> = {
  start({ stake, selection, win, balance }) {
    const openingBet = record(selection).openingBet;
    if (openingBet !== stake || typeof openingBet !== "number" || !Number.isSafeInteger(openingBet) ||
        !Number.isSafeInteger(openingBet * 100 * GROSS_CAP) || openingBet < SB) {
      reject("Opening bet must match the accepted stake.");
    }
    const deck = sample(() => shuffled(createDeck()), d => {
      const community = d.slice(4, 9);
      const cmp = compareScores(bestHand([d[0]!, d[2]!, ...community]), bestHand([d[1]!, d[3]!, ...community]));
      return win ? cmp > 0 : cmp < 0;
    });
    const initial = initialState();
    const game = startNextHand({
      ...initial, playerChips: balance + stake, dealerChips: Math.max(initial.dealerChips, balance + stake, BB),
    }, stake, deck);
    if (game.acceptedStake !== stake) reject("Opening bet must match the accepted stake.");
    const frames = [publicHoldem(game)];
    return step(null, advance(game, win, frames), win, frames, GROSS_CAP);
  },
  act(state, move, { selection, balance }) {
    if (computeTurn(state.game) !== "player") reject("It is not your turn.");
    const before = { ...state.game, playerChips: balance };
    let next: GameState;
    if (move === "fold") next = playerFold(before);
    else if (move === "call") next = playerCall(before);
    else if (move === "raise") {
      const to = record(selection).to;
      const maxTotal = Math.min(before.playerBet + balance, before.dealerBet + before.dealerChips);
      const minTotal = Math.min(before.currentBet > 0 ? before.currentBet * 2 : BB, maxTotal);
      if (typeof to !== "number" || !Number.isSafeInteger(to) ||
          !Number.isSafeInteger((before.acceptedStake + to - before.playerBet) * 100 * GROSS_CAP)) reject("Choose a valid raise amount.");
      if (before.raises >= MAX_RAISES || to <= before.currentBet || to < minTotal || to > maxTotal) {
        reject(`Raise to an amount from Rs. ${minTotal} to Rs. ${maxTotal}; use Call or Check otherwise.`);
      }
      next = playerRaiseTo(before, to);
    } else return reject("Unknown Hold'em action.");
    const frames = [publicHoldem(next)];
    return step(before, advance(next, state.win, frames), state.win, frames, state.grossCap);
  },
};