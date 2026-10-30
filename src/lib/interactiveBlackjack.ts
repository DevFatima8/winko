import { randomInt } from "node:crypto";
import type { EngineStep, InteractiveCardEngine } from "./browserCardInteractiveGames";
import { reject, shuffled } from "./interactiveCardUtil";

const SUITS = ["\u2660", "\u2665", "\u2666", "\u2663"] as const;
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
const SHOE = 6 * 52;
export type BlackjackCard = { rank: string; suit: string; value: number; id: number };
type State = {
  bet: number; win: boolean; shoe: number[]; player: number[]; dealer: number[]; hole: number | null;
  dealerNatural: boolean; doubled: boolean;
};

export const card = (id: number): BlackjackCard => {
  const index = id % 13;
  return { rank: RANKS[index]!, suit: SUITS[Math.floor((id % 52) / 13)]!, value: index === 0 ? 11 : Math.min(10, index + 1), id };
};
const rankOf = (id: number) => id % 13;
const valueOfRank = (index: number) => index === 0 ? 11 : Math.min(10, index + 1);

export function handTotal(ids: number[]) {
  let total = 0, aces = 0;
  for (const id of ids) { total += valueOfRank(rankOf(id)); if (rankOf(id) === 0) aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}
const natural = (ids: number[]) => ids.length === 2 && handTotal(ids) === 21;

/** Take a random remaining shoe card whose rank satisfies `allow`. */
function take(shoe: number[], allow: (rank: number) => boolean): number | null {
  const options = shoe.filter(id => allow(rankOf(id)));
  if (!options.length) return null;
  const id = options[randomInt(options.length)]!;
  shoe.splice(shoe.indexOf(id), 1);
  return id;
}

/** Randomized search for the dealer's hole card and draws (dealer stands on all 17s) ending where `goal` holds. */
function finishDealer(shoe: number[], dealer: number[], needHole: boolean, goal: (total: number) => boolean): number[] | null {
  const search = (hand: number[], pool: number[], hole: boolean, depth: number): number[] | null => {
    if (!hole && handTotal(hand) >= 17) return goal(handTotal(hand)) ? hand : null;
    if (depth > 10) return null;
    for (const rank of shuffled([...Array(13).keys()])) {
      if (hole && natural([hand[0]!, rank])) continue;
      const index = pool.findIndex(id => rankOf(id) === rank);
      if (index < 0) continue;
      const next = [...pool];
      const [id] = next.splice(index, 1);
      const found = search([...hand, id!], next, false, depth + 1);
      if (found) return found;
    }
    return null;
  };
  return search(dealer, shuffled(shoe), needHole, 0);
}

function view(state: State, terminal: boolean, payout?: number) {
  const dealer = terminal ? [...state.dealer, ...(state.hole === null ? [] : [state.hole])] : state.dealer;
  return {
    bet: state.bet, player: state.player.map(card), dealer: dealer.map(card), hidden: !terminal,
    ...(terminal ? { outcome: payout && payout > 0 ? "win" : "loss", natural: natural(state.player), payout } : {}),
  };
}

function settle(state: State): EngineStep<State> {
  const total = handTotal(state.player);
  let dealer = state.hole === null ? state.dealer : [...state.dealer, state.hole];
  const shoe = [...state.shoe];
  if (total <= 21 && !state.dealerNatural) {
    const goal = state.win ? (value: number) => value > 21 || value < total : (value: number) => value <= 21 && value > total;
    const found = finishDealer(shoe, dealer, state.hole === null, goal);
    if (!found) throw new Error("Unable to finish the dealer hand for the assigned round.");
    for (const id of found.slice(dealer.length)) shoe.splice(shoe.indexOf(id), 1);
    dealer = found;
  } else if (state.hole === null) {
    // A busted player only sees the dealer's hole card; it never forms a hidden natural.
    const hole = take(shoe, rank => !natural([state.dealer[0]!, rank]));
    dealer = [...dealer, hole!];
  }
  const dealerTotal = handTotal(dealer);
  const won = total <= 21 && !state.dealerNatural && (dealerTotal > 21 || dealerTotal < total);
  if (won !== state.win) throw new Error("Blackjack settlement did not match the assigned round.");
  const payout = won ? Math.round(state.bet * (natural(state.player) ? 2.5 : 2)) : 0;
  const next: State = { ...state, shoe, dealer: dealer.slice(0, 1), hole: null };
  const finalState = { ...next, dealer };
  return { state: finalState, phase: "settled", claim: payout, view: { ...view(finalState, true, payout) } };
}

function hitCard(state: State): number {
  const total = handTotal(state.player);
  const shoe = state.shoe;
  const card = take(shoe, rank => {
    const after = handTotal([...state.player, rank]);
    return state.win ? after <= 21 : after !== 21;
  });
  if (card === null) throw new Error("No card matches the assigned round.");
  void total;
  return card;
}

/**
 * Six-deck shoe, dealer stands on 17, natural pays 3:2, no pushes or splits (as the table UI).
 * A winning slot never busts the player on a hit and finishes the dealer below the player's
 * total or bust; a losing slot never lets the player make 21 and finishes the dealer above.
 * The hole card is chosen only when revealed, and only cards still in the shoe are used.
 */
export const blackjackEngine: InteractiveCardEngine<State> = {
  start({ stake, win }) {
    const shoe = [...Array(SHOE).keys()];
    let player: number[], up: number, dealerNatural = false, hole: number | null = null;
    for (;;) {
      const draw = shuffled(shoe).slice(0, 3);
      player = [draw[0]!, draw[2]!];
      up = draw[1]!;
      if (natural(player) && !win) continue;
      break;
    }
    for (const id of [...player, up]) shoe.splice(shoe.indexOf(id), 1);
    if (!win && valueOfRank(rankOf(up)) >= 10 && randomInt(3) === 0) {
      hole = take(shoe, rank => natural([up, rank]));
      dealerNatural = hole !== null;
    }
    const state: State = { bet: stake, win, shoe, player, dealer: [up], hole, dealerNatural, doubled: false };
    if (natural(player) || dealerNatural) return settle(state);
    return { state, phase: "playing", view: view(state, false) };
  },
  act(state, move, { balance }) {
    if (move === "stand") return settle(state);
    if (move === "hit") {
      const next = { ...state, shoe: [...state.shoe] };
      next.player = [...state.player, hitCard(next)];
      if (handTotal(next.player) >= 21) return settle(next);
      return { state: next, phase: "playing", view: view(next, false) };
    }
    if (move === "double") {
      if (state.player.length !== 2) reject("Double is only available on the first two cards.");
      if (balance < state.bet) reject("Insufficient balance.");
      const next = { ...state, shoe: [...state.shoe], bet: state.bet * 2, doubled: true };
      next.player = [...state.player, hitCard(next)];
      return { ...settle(next), debit: state.bet };
    }
    return reject("Unknown blackjack action.");
  },
};