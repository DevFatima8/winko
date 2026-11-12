import { randomInt } from "node:crypto";
import type { MultiplayerTransaction } from "./multiplayer-store";
import { isCardGame } from "./cardGameRules";
import { isRouletteGame, isWheelGame } from "./rouletteGameRules";

type Cycle = { _id: string; players: string[]; remaining: boolean[] };

/** Each new resolved wager counts, including repeat players; call within the game's settlement transaction. */
export async function nextBetWin(tx: MultiplayerTransaction, game: string, winners: number, total = 100) {
  if (!Number.isSafeInteger(total) || total < 1 || !Number.isSafeInteger(winners) || winners < 0 || winners > total) {
    throw new Error("Invalid bet win cycle.");
  }
  const id = `${game}:bet-wins-${winners}-of-${total}:v1`;
  const saved = await tx.get<{ remaining: boolean[] }>("multiplayerrooms", id);
  if (saved && (!Array.isArray(saved.remaining) || !saved.remaining.length || saved.remaining.length > total ||
      saved.remaining.some(value => typeof value !== "boolean") ||
      saved.remaining.filter(Boolean).length > winners || saved.remaining.filter(value => !value).length > total - winners)) {
    throw new Error(`${game} bet win cycle is invalid. Contact support.`);
  }
  const fresh = () => [...Array<boolean>(winners).fill(true), ...Array<boolean>(total - winners).fill(false)];
  const remaining = saved ? [...saved.remaining] : fresh();
  const [won] = remaining.splice(randomInt(remaining.length), 1);
  await tx.put("multiplayerrooms", id, { _id: id, remaining: remaining.length ? remaining : fresh() });
  return won;
}

/** Called under the game's transaction lock, only after validating an accepted wager. */
export async function nextPlayerWin(tx: MultiplayerTransaction, game: string, userId: string) {
  if (isCardGame(game) || isRouletteGame(game) || isWheelGame(game)) return nextBetWin(tx, game, 30);
  const winners = 10;
  const id = `${game}:ten-player-wins:v1`;
  const saved = await tx.get<Cycle>("multiplayerrooms", id);
  if (saved && (!Array.isArray(saved.players) || !Array.isArray(saved.remaining) ||
    saved.players.length + saved.remaining.length !== 100 || !saved.remaining.length ||
    saved.players.some(player => typeof player !== "string" || !player) ||
    new Set(saved.players).size !== saved.players.length ||
    saved.remaining.some(slot => typeof slot !== "boolean") ||
    saved.remaining.filter(Boolean).length > winners || saved.remaining.filter(slot => !slot).length > 100 - winners)) {
    throw new Error(`${game} player win cycle is invalid. Contact support.`);
  }
  if (saved?.players.includes(userId)) return false;
  const fresh = () => [...Array<boolean>(winners).fill(true), ...Array<boolean>(100 - winners).fill(false)];
  const remaining = saved ? [...saved.remaining] : fresh();
  const index = randomInt(remaining.length);
  const [win] = remaining.splice(index, 1);
  await tx.put("multiplayerrooms", id, remaining.length ? {
    _id: id, players: [...saved?.players ?? [], userId], remaining,
  } : { _id: id, players: [], remaining: fresh() });
  return win;
}

export async function nextPlayerPrize<T extends string>(
  tx: MultiplayerTransaction, game: string, userId: string, prizes: readonly T[],
): Promise<T | null> {
  if (prizes.length !== 10) throw new Error("A player prize cycle must contain ten prizes.");
  if (!await nextPlayerWin(tx, game, userId)) return null;
  const id = `${game}:player-prizes:v1`;
  const saved = await tx.get<{ _id: string; remaining: T[] }>("multiplayerrooms", id);
  if (saved && (!Array.isArray(saved.remaining) || !saved.remaining.length ||
      saved.remaining.some(prize => !prizes.includes(prize)) ||
      prizes.some(prize => saved.remaining.filter(value => value === prize).length >
        prizes.filter(value => value === prize).length))) {
    throw new Error(`${game} player prize cycle is invalid. Contact support.`);
  }
  const remaining = [...saved?.remaining ?? prizes];
  const [prize] = remaining.splice(randomInt(remaining.length), 1);
  await tx.put("multiplayerrooms", id, { _id: id, remaining: remaining.length ? remaining : [...prizes] });
  return prize;
}
