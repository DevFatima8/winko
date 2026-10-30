import type { MultiplayerTransaction } from "./multiplayer-store";
import { InteractiveMoveError } from "./browserCardInteractiveGames";
import { BrowserWagerError } from "./dailyPoolBrowser";

export type BrowserCardActionInput = {
  game: string;
  wagerId: string;
  operationId: string;
  move: string;
  selection?: unknown;
};

/** Dispatch inside the same per-game transaction used for wager acceptance. */
export async function actBrowserCard(
  tx: MultiplayerTransaction, userId: string, input: BrowserCardActionInput, enabled: boolean,
) {
  try {
    if (input.game === "casino-war") {
      const { actCasinoWar } = await import("./browserCasinoWar");
      return await actCasinoWar(tx, userId, input, enabled);
    }
    const { actInteractiveCard } = await import("./browserCardInteractive");
    return await actInteractiveCard(tx, userId, input, enabled);
  } catch (error) {
    if (error instanceof InteractiveMoveError) throw new BrowserWagerError(error.message);
    throw error;
  }
}
