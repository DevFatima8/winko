import { createHash, randomUUID } from "node:crypto";
import type { GameDoc, GameResultDoc, MinesGameDoc, UserDoc } from "@/models";
import { mysqlMultiplayerStore, type MultiplayerTransaction } from "./multiplayer-store";
import { addPoolWager, cents, closePoolWager, settleDailyPools, type PoolFields } from "./dailyPool";
import { DAILY_POOL_VERSION, dailyPoolLock } from "./dailyPoolRules";

type Slug = "plinko" | "limbo" | "lucky-777" | "mines";
type Mine = MinesGameDoc & PoolFields;
type Instant = {
  claim: number;
  data: string;
  response: Record<string, unknown>;
  plinko?: { risk: "low" | "medium" | "high"; rows: number; path: number[]; bucket: number; multiplier: number };
};
type RequestRecord = { _id: string; fingerprint: string; response: Record<string, unknown>; resultId: string; createdAt: Date };
const names: Record<Slug, string> = { plinko: "Plinko", limbo: "Limbo", "lucky-777": "Lucky 777", mines: "Mines" };

export async function dedicatedTransaction<T>(slug: Slug, fn: (tx: MultiplayerTransaction) => Promise<T>) {
  return mysqlMultiplayerStore.transact(dailyPoolLock(slug), async tx => {
    await settleDailyPools(tx, slug);
    return fn(tx);
  });
}

async function gameId(tx: MultiplayerTransaction, slug: Slug, now: Date) {
  const existing = (await tx.findWhere<GameDoc>("games", { slug }, 1))[0];
  if (existing) return existing._id;
  const id = randomUUID();
  await tx.insert("games", id, { _id: id, name: names[slug], slug, description: "", icon: "", category: "original", isActive: true, createdAt: now, updatedAt: now });
  return id;
}

async function wallet(tx: MultiplayerTransaction, userId: string, slug: Slug, amount: number) {
  const user = await tx.get<UserDoc>("users", userId, true);
  if (!user || !user.isActive || user.role !== "client" || user.blockedGames?.includes(slug)) return { error: "This account cannot bet on this game." } as const;
  if (cents(user.balance) < cents(amount)) return { error: "Insufficient balance." } as const;
  return { user };
}

function requestKey(slug: Slug, userId: string, requestId: string) {
  return createHash("sha256").update(`dedicated:${slug}:${userId}:${requestId}`).digest("hex");
}

function resultDocument(id: string, gid: string, userId: string, amount: number, now: Date, data: string): GameResultDoc {
  return { _id: id, gameId: gid, userId, roundNo: null, betSlot: 0, betAmount: amount, winAmount: 0, outcome: "pending", resultData: data, createdAt: now, updatedAt: now };
}

/** The result, stake debit, claim and replay response commit together or not at all. */
export async function acceptDedicatedInstant(slug: Exclude<Slug, "mines">, userId: string, amount: number, requestId: string, fingerprint: string, outcome: Instant | ((tx: MultiplayerTransaction) => Promise<Instant>)) {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(requestId)) return { error: "A valid wager request ID is required." };
  return dedicatedTransaction(slug, async tx => {
    const key = requestKey(slug, userId, requestId);
    const previous = await tx.get<RequestRecord>("multiplayerrequests", key);
    if (previous) {
      if (previous.fingerprint !== fingerprint) return { error: "Request ID already belongs to a different wager." };
      const result = await tx.get<GameResultDoc>("gameresults", previous.resultId);
      const user = await tx.get<UserDoc>("users", userId, true);
      if (!result || !user) throw new Error("Daily-pool replay record is incomplete.");
      return { ...previous.response, payout: result.winAmount, poolPending: result.poolPending, poolClaim: result.poolClaim, balance: user.balance };
    }
    const account = await wallet(tx, userId, slug, amount);
    if ("error" in account) return account;
    const instant = typeof outcome === "function" ? await outcome(tx) : outcome;
    const now = new Date(await tx.now());
    const result = resultDocument(randomUUID(), await gameId(tx, slug, now), userId, amount, now, instant.data);
    const sourceId = instant.plinko ? randomUUID() : undefined;
    await addPoolWager(tx, slug, result, sourceId ? { sourceTable: "plinkobets", sourceId } : undefined);
    await closePoolWager(tx, result._id, instant.claim);
    Object.assign(result, { poolClaim: instant.claim, resultData: `${instant.data} | Pending daily pool settlement` });
    account.user.balance = (cents(account.user.balance) - cents(amount)) / 100;
    account.user.updatedAt = now;
    await tx.put("users", userId, account.user);
    await tx.insert("gameresults", result._id, result);
    if (sourceId && instant.plinko) {
      await tx.insert("plinkobets", sourceId, { _id: sourceId, userId, resultId: result._id, betAmount: amount, ...instant.plinko, payout: 0, poolVersion: DAILY_POOL_VERSION, poolPending: true, poolClaim: instant.claim, createdAt: now, updatedAt: now });
    }
    const response = { ...instant.response, ok: true, id: sourceId ?? result._id, payout: 0, poolPending: true, poolClaim: instant.claim, poolDay: result.poolDay, balance: account.user.balance };
    await tx.insert("multiplayerrequests", key, { _id: key, fingerprint, response, resultId: result._id, createdAt: now });
    return response;
  });
}

export async function acceptPoolMines(userId: string, amount: number, mines: number, mineCells: number[], publish: (g: Mine) => unknown) {
  return dedicatedTransaction("mines", async tx => {
    if ((await tx.findWhere<Mine>("minesgames", { userId, status: "active" }, 1)).length) return { error: "Pehle wali game abhi chal rahi hai." };
    const account = await wallet(tx, userId, "mines", amount);
    if ("error" in account) return account;
    const now = new Date(await tx.now());
    const result = resultDocument(randomUUID(), await gameId(tx, "mines", now), userId, amount, now, `${mines} mines · started`);
    const game: Mine = { _id: randomUUID(), userId, resultId: result._id, betAmount: amount, mines, mineCells, revealed: [], status: "active", winAmount: 0, poolVersion: DAILY_POOL_VERSION, poolPending: true, poolClaim: 0, createdAt: now, updatedAt: now };
    await addPoolWager(tx, "mines", result, { sourceTable: "minesgames", sourceId: game._id });
    account.user.balance = (cents(account.user.balance) - cents(amount)) / 100;
    account.user.updatedAt = now;
    await tx.put("users", userId, account.user);
    await tx.insert("gameresults", result._id, result);
    await tx.insert("minesgames", game._id, game);
    return { ok: true, game: publish(game), balance: account.user.balance };
  });
}

/** Only pre-version accepted active Mines may fall through to legacy accounting. */
export async function actPoolMines(userId: string, action: "reveal" | "cashout", cell: number, multiplier: (mines: number, safe: number) => number, publish: (g: Mine) => unknown) {
  return dedicatedTransaction("mines", async tx => {
    const game = (await tx.findWhere<Mine>("minesgames", { userId, status: "active" }, 1))[0];
    if (!game || game.poolVersion !== DAILY_POOL_VERSION) return null;
    if (action === "reveal" && (!Number.isInteger(cell) || cell < 0 || cell >= 25 || game.revealed.includes(cell))) return { error: "Invalid cell." };
    if (action === "cashout" && !game.revealed.length) return { error: "Kam az kam ek gem kholen." };
    let event: "mine" | "gem" | "cleared" | "cashed" = "cashed";
    if (action === "reveal") {
      if (game.mineCells.includes(cell)) { game.status = "dead"; event = "mine"; }
      else {
        game.revealed.push(cell);
        event = game.revealed.length >= 25 - game.mines ? "cleared" : "gem";
      }
    }
    const m = multiplier(game.mines, game.revealed.length);
    const now = new Date(await tx.now());
    if (event !== "gem") {
      const claim = event === "mine" ? 0 : cents(game.betAmount * m) / 100;
      if (event !== "mine") game.status = "cashed";
      game.poolClaim = claim;
      await closePoolWager(tx, game.resultId, claim);
      const result = await tx.get<GameResultDoc>("gameresults", game.resultId);
      if (!result || result.poolVersion !== DAILY_POOL_VERSION) throw new Error("Daily-pool Mines result missing.");
      Object.assign(result, { poolClaim: claim, winAmount: 0, outcome: "pending", resultData: `${game.mines} mines · ${event} @ ${m}x | Pending daily pool settlement`, updatedAt: now });
      await tx.put("gameresults", result._id, result);
    }
    game.updatedAt = now;
    await tx.put("minesgames", game._id, game);
    const user = await tx.get<UserDoc>("users", userId, true);
    return { ok: true, event, cell, multiplier: m, win: 0, poolPending: true, poolClaim: game.poolClaim, game: publish(game), balance: user?.balance ?? 0 };
  });
}
