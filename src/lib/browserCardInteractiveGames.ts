/** Zero-import registry and engine contract for server-driven interactive card tables. */
export const INTERACTIVE_BROWSER_CARD_GAMES = [
  "blackjack", "monster-hilo", "rummy", "teen-patti", "teen-patti-999", "texas-holdem", "three-card-poker", "casino-war",
] as const;
export type InteractiveBrowserCardGame = typeof INTERACTIVE_BROWSER_CARD_GAMES[number];
export const isInteractiveBrowserCardGame = (game: string): game is InteractiveBrowserCardGame =>
  INTERACTIVE_BROWSER_CARD_GAMES.some(value => value === game);

/** A rejected table action; the route maps it to HTTP 409 without touching the wallet. */
export class InteractiveMoveError extends Error {}

export type EngineStep<S> = {
  state: S;
  phase: string;
  /** Public table state only. Undealt and hidden cards must never be included. */
  view: unknown;
  /** Extra stake (server-computed) debited with this action. */
  debit?: number;
  /** Immediate verified award (e.g. a side bet) credited before the round ends. */
  credit?: number;
  /** Present only on the terminal action: remaining gross credit (excluding earlier credits), 0 for a loss or fold. */
  claim?: number;
};

export type InteractiveCardEngine<S> = {
  start(input: { stake: number; selection: unknown; win: boolean; balance: number }): EngineStep<S>;
  /** `stake` is the total accepted so far; `balance` is the authoritative wallet before this action. */
  act(state: S, move: string, input: { amount?: number; selection?: unknown; stake: number; balance: number }): EngineStep<S>;
};

export type CardActionInput = { game: string; wagerId: string; operationId: string; move: string; selection?: unknown };
export type CardActionReply = {
  ok: true; wagerId: string; balance: number; status: "active" | "closed";
  /** Public table state; `payout` is the gross credited so far (the final claim once closed). */
  outcome: { phase: string; view: unknown; stake: number; payout: number };
  claim?: number; poolPending: boolean; replay: boolean;
};


