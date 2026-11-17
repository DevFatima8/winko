"use client";

type CardPool = { busy: boolean; resume: () => Promise<boolean>; cardAction: (move: string, selection?: unknown) => Promise<unknown> };
export type CardOutcome<V> = { phase: string; view: V; stake: number; payout: number };

/**
 * Restores an accepted server-dealt card round after a reload. Saved requests are replayed first by
 * the wallet lifecycle; only a still-active wager is asked for its public table state.
 */
export async function restoreCardRound<V>(game: string, pool: CardPool, slot = "main", requireConfirmation = false): Promise<CardOutcome<V> | null> {
  const key = `wx:browser-active:${game}:${slot}`;
  if (typeof window === "undefined" || !localStorage.getItem(key) && !localStorage.getItem(`${key}:request`)) return null;
  await pool.resume();
  for (let waited = 0; pool.busy && waited < 15000; waited += 100) await new Promise(resolve => setTimeout(resolve, 100));
  const uncertain = () => new Error("The saved hand could not be checked. Retry before starting a new game.");
  const pending = localStorage.getItem(`${key}:request`);
  if (requireConfirmation && (pool.busy || pending)) throw uncertain();
  if (pending || !localStorage.getItem(key)) return null;
  const round = await pool.cardAction("state") as CardOutcome<V> | null;
  if (!round && requireConfirmation) throw uncertain();
  return round;
}

export async function cardMove<V>(pool: CardPool, move: string, selection?: unknown) {
  return await pool.cardAction(move, selection) as CardOutcome<V> | null;
}