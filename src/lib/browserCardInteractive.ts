import { createHash } from "node:crypto";
import type { MultiplayerTransaction } from "./multiplayer-store";
import { cents } from "./dailyPool";
import { nextPlayerWin } from "./playerWinCycle";
import {
  InteractiveMoveError, isInteractiveBrowserCardGame,
  type CardActionInput, type CardActionReply, type EngineStep, type InteractiveCardEngine,
} from "./browserCardInteractiveGames";

export { InteractiveMoveError, InteractiveMoveError as InteractiveCardError } from "./browserCardInteractiveGames";

type Receipt = { move: string; selection: string };
type CardState = {
  v: 1; win: boolean; engine: unknown; phase: string; view: unknown;
  ops: Record<string, Receipt>; credited: number; closed: boolean;
};
type CardResult = {
  _id: string; userId: string; browserGame: string; browserStatus: "active" | "closed" | "refunded";
  browserTotalStake: number; browserCompletedClaim?: number; browserServerRequired?: boolean; poolVersion?: string; poolPending?: boolean;
  browserCardState?: CardState; browserOutcome?: unknown; browserServerInput?: string;
};

const ID = /^[a-f0-9-]{36}$/i;
const money = (value: number) => cents(value) / 100;

/** Stable lifecycle identities derived from one card action, so a retry replays rather than repeats. */
function derived(operationId: string, part: string) {
  const hex = createHash("sha256").update(`card-action:${operationId}:${part}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function engineFor(game: string): Promise<InteractiveCardEngine<unknown>> {
  switch (game) {
    case "blackjack": return (await import("./interactiveBlackjack")).blackjackEngine as InteractiveCardEngine<unknown>;
    case "monster-hilo": return (await import("./interactiveMonsterHilo")).monsterHiloEngine as InteractiveCardEngine<unknown>;
    case "rummy": return (await import("./interactiveRummy")).rummyEngine as InteractiveCardEngine<unknown>;
    case "teen-patti": return (await import("./interactiveTeenPatti")).teenPattiEngine as InteractiveCardEngine<unknown>;
    case "teen-patti-999": return (await import("./interactiveTeenPatti999")).teenPatti999Engine as InteractiveCardEngine<unknown>;
    case "texas-holdem": return (await import("./interactiveTexasHoldem")).texasHoldemEngine as InteractiveCardEngine<unknown>;
    case "three-card-poker": return (await import("./interactiveThreeCardPoker")).threeCardPokerEngine as InteractiveCardEngine<unknown>;
    case "casino-war": return (await import("./casinoWarInteractive")).casinoWarEngine as InteractiveCardEngine<unknown>;
    default: throw new InteractiveMoveError("Unsupported interactive card table.");
  }
}

function checkAmount(value: number | undefined, label: string) {
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || money(value) !== value) {
    throw new Error(`Card engine produced an invalid ${label}.`);
  }
  return value;
}

function reply(result: CardResult, balance: number, wagerId: string, replay: boolean): CardActionReply {
  const state = result.browserCardState;
  const closed = result.browserStatus !== "active";
  const claim = result.browserCompletedClaim ?? 0;
  return {
    ok: true, wagerId, balance, status: closed ? "closed" : "active", poolPending: result.poolPending === true, replay,
    outcome: {
      phase: state?.phase ?? "accepted", view: state?.view ?? null, stake: result.browserTotalStake,
      payout: closed ? claim : state?.credited ?? 0,
    },
    ...(closed ? { claim } : {}),
  };
}

/**
 * Runs one validated table action for an accepted card wager inside the game's
 * transaction. Cards are generated only by the server engine; the win slot is
 * drawn once at the deal; every extra stake is an instant debit and the single
 * terminal claim is credited once through the accepted-wager lifecycle.
 */
export async function actInteractiveCard(
  tx: MultiplayerTransaction, userId: string, input: CardActionInput, enabled: boolean,
): Promise<CardActionReply> {
  const { game, wagerId, operationId, move } = input;
  if (!isInteractiveBrowserCardGame(game)) throw new InteractiveMoveError("Unsupported interactive card table.");
  if (typeof wagerId !== "string" || typeof operationId !== "string" || !ID.test(wagerId) || !ID.test(operationId)) {
    throw new InteractiveMoveError("Valid wager and operation identities are required.");
  }
  if (typeof move !== "string" || !/^[a-z][a-z-]{0,23}$/.test(move)) throw new InteractiveMoveError("Invalid table action.");
  const selection = JSON.stringify(input.selection ?? null);
  if (selection.length > 4000) throw new InteractiveMoveError("Invalid table action.");
  const id = createHash("sha256").update(`browser-active:${userId}:${game}:${wagerId}`).digest("hex");
  const loaded = await tx.get<CardResult>("gameresults", id);
  if (!loaded || loaded.userId !== userId || loaded.browserGame !== game) throw new InteractiveMoveError("Accepted wager not found.");
  const user = await tx.get<{ _id: string; balance: number }>("users", userId, true);
  if (!user || !Number.isFinite(user.balance)) throw new Error("Player wallet unavailable.");
  const saved = loaded.browserCardState;
  const receipt = saved?.ops[operationId];
  if (receipt) {
    if (receipt.move !== move || receipt.selection !== selection) throw new InteractiveMoveError("Operation identity was reused with a different table action.");
    return reply(loaded, user.balance, wagerId, true);
  }
  if (move === "state") return reply(loaded, user.balance, wagerId, false);
  if (loaded.browserStatus !== "active" || saved?.closed) throw new InteractiveMoveError("This wager has already finished.");
  const engine = await engineFor(game);
  let step: EngineStep<unknown>;
  let win: boolean;
  {
    if (!saved) {
      if (move !== "deal") throw new InteractiveMoveError("Deal the accepted wager before any table action.");
      // The winning slot is assigned once, at the deal, and never redrawn by later moves.
      win = await nextPlayerWin(tx, game, userId);
      step = engine.start({ stake: loaded.browserTotalStake, selection: input.selection ?? null, win, balance: user.balance });
    } else {
      if (move === "deal") throw new InteractiveMoveError("This wager is already dealt.");
      win = saved.win;
      step = engine.act(saved.engine, move, { selection: input.selection ?? null, stake: loaded.browserTotalStake, balance: user.balance });
    }
  }
  const debit = checkAmount(step.debit, "stake");
  const credit = checkAmount(step.credit, "award");
  const terminal = step.claim !== undefined;
  const claim = checkAmount(step.claim, "claim");
  const { browserPoolLifecycle } = await import("./dailyPoolBrowser");
  const base = { game, wagerId };
  let balance = user.balance;
  if (debit > 0) {
    if (cents(user.balance) < cents(debit)) throw new InteractiveMoveError("Insufficient balance.");
    balance = (await browserPoolLifecycle(tx, userId, { ...base, operationId: derived(operationId, "debit"), action: "increment", amount: debit, poolVersion: loaded.poolVersion }, enabled, true)).balance;
  }
  if (credit > 0) {
    balance = (await browserPoolLifecycle(tx, userId, { ...base, operationId: derived(operationId, "award"), action: "award", amount: credit }, enabled, true)).balance;
  }
  if (terminal) {
    balance = (await browserPoolLifecycle(tx, userId, { ...base, operationId: derived(operationId, "complete"), action: "complete", amount: claim }, enabled, true)).balance;
  }
  const result = await tx.get<CardResult>("gameresults", id);
  if (!result) throw new Error("Card wager result is missing.");
  const credited = money((saved?.credited ?? 0) + credit + claim);
  result.browserCardState = {
    v: 1, win, engine: step.state, phase: step.phase, view: step.view,
    ops: { ...saved?.ops ?? {}, [operationId]: { move, selection } }, credited, closed: terminal,
  };
  // Once the server has dealt, even a legacy wager may only be settled by verified table actions.
  result.browserServerRequired = true;
  if (terminal) {
    result.browserOutcome = { phase: step.phase, view: step.view, stake: result.browserTotalStake, payout: result.browserCompletedClaim ?? credited };
    result.browserServerInput = "interactive";
  }
  await tx.put("gameresults", id, result);
  return reply(result, balance, wagerId, false);
}