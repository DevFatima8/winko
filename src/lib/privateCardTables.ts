import { randomInt } from "node:crypto";
import type { MultiplayerTransaction } from "./multiplayer-store";
import type { MultiplayerGame } from "./multiplayer-types";
import { createOutcome, grossPayout, type Cards32Outcome, type MultiplayerOutcome } from "./multiplayer-rules";
import { nextPlayerWin } from "./playerWinCycle";

export class PrivateCardError extends Error {}
export const isPrivateCardTable = (game: string) =>
  game === "baccarat" || game === "speed-baccarat" || game === "32-cards";
export type PrivateCardPrize = "win" | "even" | "odd" | null;
type ParityCycle = { _id: string; players: string[]; remaining: ("even" | "odd" | null)[] };

export async function privateCardPrize(
  tx: MultiplayerTransaction, game: MultiplayerGame, userId: string, option: string,
): Promise<PrivateCardPrize> {
  if (game !== "32-cards") return await nextPlayerWin(tx, game, userId) ? "win" : null;
  const id = "32-cards:private-parity-cycle:v1";
  const fresh = (): ParityCycle["remaining"] => [...Array<"even">(8).fill("even"), "odd", "odd", ...Array<null>(90).fill(null)];
  const saved = await tx.get<ParityCycle>("multiplayerrooms", id);
  if (saved && (!Array.isArray(saved.players) || !Array.isArray(saved.remaining) ||
      saved.players.length + saved.remaining.length !== 100 || !saved.remaining.length ||
      saved.players.some(player => typeof player !== "string" || !player) ||
      new Set(saved.players).size !== saved.players.length ||
      saved.remaining.some(slot => slot !== null && slot !== "even" && slot !== "odd") ||
      saved.remaining.filter(slot => slot === "even").length > 8 ||
      saved.remaining.filter(slot => slot === "odd").length > 2 ||
      saved.remaining.filter(slot => slot === null).length > 90)) {
    throw new Error("32 Cards parity cycle is invalid. Contact support.");
  }
  if (saved?.players.includes(userId)) return null;
  const remaining = [...saved?.remaining ?? fresh()];
  const eligible = remaining.map((slot, index) => ({ slot, index })).filter(({ slot }) =>
    slot === null || option !== "ODD" && option !== "EVEN" || slot === option.toLowerCase());
  if (!eligible.length) throw new PrivateCardError("Only the other parity's winning slots remain in this cycle. Choose another spot before betting.");
  const { slot, index } = eligible[randomInt(eligible.length)];
  remaining.splice(index, 1);
  await tx.put("multiplayerrooms", id, remaining.length
    ? { _id: id, players: [...saved?.players ?? [], userId], remaining }
    : { _id: id, players: [], remaining: fresh() });
  return slot;
}

export function privateCardOutcome(game: MultiplayerGame, option: string, prize: PrivateCardPrize): MultiplayerOutcome {
  for (let attempt = 0; attempt < 10000; attempt++) {
    const outcome = createOutcome(game);
    const gross = grossPayout(game, option, 100, outcome);
    if (prize === null) {
      if (gross === 0) return outcome;
    } else if (gross > 100) {
      if (game !== "32-cards") return outcome;
      const cards = outcome as Cards32Outcome;
      if (cards.totals[cards.winner] % 2 === (prize === "even" ? 0 : 1)) return outcome;
    }
  }
  throw new Error("Unable to deal a matching private card round. Retry without changing the wager.");
}

export function privateCardGross(game: MultiplayerGame, option: string, stake: number, outcome: MultiplayerOutcome) {
  return Math.min(grossPayout(game, option, stake, outcome), Math.round(stake * 200) / 100);
}
