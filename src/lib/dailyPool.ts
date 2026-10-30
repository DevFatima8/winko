import type { GameResultDoc, UserDoc } from "@/models";
import { randomInt } from "node:crypto";
import type { MultiplayerTransaction, MultiplayerTable, MultiplayerFilters } from "./multiplayer-store";
import { DAILY_POOL_VERSION, DAILY_POOL_WIN_CAP, EXACT_CLAIM_POOL_GAMES, TEN_WIN_POOL_GAMES, pakistanDay, type DailyPoolGame } from "./dailyPoolRules";

type Tx = MultiplayerTransaction;
export type PoolFields = { poolVersion?: string; poolPending?: boolean; poolClaim?: number; poolDay?: string };
export type PoolEntry = {
  _id: string; poolId: string; game: DailyPoolGame; day: string; userId: string;
  stakeCents: number; claimCents: number; status: "active" | "closed" | "cancelled" | "settled";
  payoutCents: number; sourceTable?: "chickengames" | "chickendashes" | "cardbets" | "minesgames" | "plinkobets"; sourceId?: string;
  createdAt: Date; updatedAt: Date;
};
type Pool = {
  _id: string; game: DailyPoolGame; day: string; status: "open" | "settled";
  stakeCents: number; outstanding: number; budgetCents?: number; carryIn?: number; carryOut?: number; houseCents?: number;
  settledAt?: Date; updatedAt: Date;
};

export function cents(amount: number) {
  const value = Math.round(amount * 100);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid daily-pool amount.");
  return value;
}

export async function allRows<T extends { _id: string }>(tx: Tx, table: MultiplayerTable, filters: MultiplayerFilters) {
  const rows: T[] = [];
  let cursor = "";
  for (;;) {
    const page = await tx.page<T>(table, filters, cursor);
    rows.push(...page);
    if (page.length < 500) return rows;
    cursor = page[page.length - 1]._id;
  }
}

/** Integer largest-remainder allocation, with a stable ID tie-break and no lost paisa. */
export function allocatePool(budgetCents: number, weights: { id: string; weight: number }[]) {
  if (!Number.isSafeInteger(budgetCents) || budgetCents < 0) throw new Error("Invalid pool budget.");
  if (weights.some(({ weight }) => !Number.isSafeInteger(weight) || weight < 0)) throw new Error("Invalid pool weight.");
  if (new Set(weights.map(row => row.id)).size !== weights.length) throw new Error("Duplicate pool allocation identity.");
  const total = weights.reduce((sum, row) => sum + BigInt(row.weight), BigInt(0));
  if (total === BigInt(0)) throw new Error("Pool has no eligible allocation weights.");
  const allocations = weights.map(({ id, weight }) => {
    const numerator = BigInt(budgetCents) * BigInt(weight);
    return { id, weight, amount: Number(numerator / total), remainder: numerator % total };
  });
  let remaining = budgetCents - allocations.reduce((sum, row) => sum + row.amount, 0);
  const ranked = [...allocations].sort((a, b) => a.remainder === b.remainder ? a.id.localeCompare(b.id) : a.remainder > b.remainder ? -1 : 1);
  for (const row of ranked) if (remaining > 0 && row.weight > 0) { row.amount++; remaining--; }
  if (remaining !== 0) throw new Error("Pool rounding did not balance.");
  return new Map(allocations.map((row) => [row.id, row.amount]));
}

/** Allocates by weight, refilling uncapped wagers with any amount above a cap; the rest is returned as undistributed. */
export function allocateCappedPool(budgetCents: number, weights: { id: string; weight: number }[], caps: Map<string, number>) {
  const allocations = new Map(weights.map(({ id }) => [id, 0]));
  let remaining = budgetCents;
  let open = weights.filter(({ weight }) => weight > 0);
  while (remaining > 0 && open.length) {
    const share = allocatePool(remaining, open);
    const next: typeof open = [];
    for (const row of open) {
      const room = Math.max(0, caps.get(row.id)! - allocations.get(row.id)!);
      const give = Math.min(room, share.get(row.id)!);
      allocations.set(row.id, allocations.get(row.id)! + give);
      remaining -= give;
      if (give < room) next.push(row);
    }
    if (next.length === open.length) break;
    open = next;
  }
  return { allocations, undistributed: remaining };
}

/** 10 of every 100 wagers (at least one) win, chosen at random from positive claims, each targeting 1x–2x of stake. */
export function tenWinTargets(entries: Pick<PoolEntry, "_id" | "stakeCents" | "claimCents">[]) {
  const positive = entries.filter(entry => entry.claimCents > 0);
  const candidates = [...(positive.length ? positive : entries)];
  const count = Math.min(candidates.length, Math.max(1, Math.round(entries.length / 10)));
  const targets = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const [winner] = candidates.splice(randomInt(candidates.length), 1);
    targets.set(winner._id, Math.floor(winner.stakeCents * randomInt(100, 201) / 100));
  }
  return targets;
}

/** Pays each target in full when the budget allows, otherwise shares the budget in proportion to the targets. */
export function payTargets(budgetCents: number, targets: Map<string, number>) {
  const weights = [...targets].filter(([, cents]) => cents > 0).map(([id, weight]) => ({ id, weight }));
  const total = weights.reduce((sum, row) => sum + row.weight, 0);
  if (!weights.length || budgetCents <= 0) return new Map<string, number>();
  return total <= budgetCents ? new Map(weights.map(row => [row.id, row.weight])) : allocatePool(budgetCents, weights);
}

export async function addPoolWager(tx: Tx, game: DailyPoolGame, result: GameResultDoc, source?: Pick<PoolEntry, "sourceTable" | "sourceId">) {
  if (!result.userId || result.betAmount <= 0) throw new Error("Daily pool requires a real accepted wager.");
  const now = await tx.now();
  const day = pakistanDay(now);
  const poolId = `${game}:${day}`;
  const pool = await tx.get<Pool>("dailypools", poolId) ?? {
    _id: poolId, game, day, status: "open" as const, stakeCents: 0, outstanding: 0, updatedAt: new Date(now),
  };
  if (pool.status !== "open") throw new Error("Daily pool is already settled.");
  const stakeCents = cents(result.betAmount);
  if (!Number.isSafeInteger(pool.stakeCents + stakeCents)) throw new Error("Daily pool stake limit exceeded.");
  pool.stakeCents += stakeCents;
  pool.outstanding++;
  pool.updatedAt = new Date(now);
  const entry: PoolEntry = {
    _id: result._id, poolId, game, day, userId: result.userId, stakeCents, claimCents: 0,
    status: "active", payoutCents: 0, ...source, createdAt: new Date(now), updatedAt: new Date(now),
  };
  await tx.insert("dailypoolentries", entry._id, entry);
  await tx.put("dailypools", poolId, pool);
  Object.assign(result, { poolVersion: DAILY_POOL_VERSION, poolPending: true, poolDay: day, poolClaim: 0 });
}

export async function closePoolWager(tx: Tx, resultId: string, claim: number, cancelled = false) {
  const entry = await tx.get<PoolEntry>("dailypoolentries", resultId);
  if (!entry) return false; // Accepted before this version: legacy accounting remains unchanged.
  if (entry.status !== "active") throw new Error("Daily-pool wager has already been processed.");
  const pool = await tx.get<Pool>("dailypools", entry.poolId);
  if (!pool || pool.status !== "open" || pool.outstanding < 1) throw new Error("Daily-pool ledger is inconsistent.");
  entry.claimCents = cancelled ? 0 : cents(claim);
  entry.status = cancelled ? "cancelled" : "closed";
  entry.updatedAt = new Date(await tx.now());
  pool.outstanding--;
  if (cancelled) pool.stakeCents -= entry.stakeCents;
  pool.updatedAt = entry.updatedAt;
  await tx.put("dailypoolentries", entry._id, entry);
  await tx.put("dailypools", pool._id, pool);
  return true;
}

/** Call under the SAME per-game lock used by wager placement, refunds and claims. */
export async function settleDailyPools(tx: Tx, game: DailyPoolGame) {
  const now = await tx.now();
  const today = pakistanDay(now);
  const pools = (await allRows<Pool>(tx, "dailypools", { game, status: "open" }))
    .filter(pool => pool.day < today).sort((a, b) => a.day.localeCompare(b.day));
  const carryId = `${game}:rounding`;
  const carry = await tx.get<{ _id: string; remainder: number }>("dailypools", carryId) ?? { _id: carryId, remainder: 0 };
  if (!Number.isInteger(carry.remainder) || carry.remainder < 0 || carry.remainder >= 100) throw new Error("Daily-pool rounding ledger is inconsistent.");
  for (const pool of pools) {
    if (pool.outstanding !== 0) break;
    const entries = (await allRows<PoolEntry>(tx, "dailypoolentries", { poolId: pool._id })).filter(entry => entry.status !== "cancelled");
    if (entries.some(entry => entry.status !== "closed") || entries.reduce((sum, entry) => sum + entry.stakeCents, 0) !== pool.stakeCents) throw new Error("Daily-pool entries do not reconcile.");
    const numerator = BigInt(pool.stakeCents) * BigInt(35) + BigInt(carry.remainder);
    const budget = Number(numerator / BigInt(100));
    if (!Number.isSafeInteger(budget)) throw new Error("Daily pool budget exceeds safe limits.");
    const hasClaims = entries.some(entry => entry.claimCents > 0);
    const weights = entries.map(entry => ({
      id: entry._id,
      weight: hasClaims ? (entry.claimCents > 0 ? randomInt(1, 1_000_001) : 0) : entry.stakeCents,
    }));
    const winCap = DAILY_POOL_WIN_CAP[game];
    let houseCents = 0;
    let allocations = new Map<string, number>();
    if (entries.length && (TEN_WIN_POOL_GAMES.includes(game) || EXACT_CLAIM_POOL_GAMES.includes(game))) {
      const targets = TEN_WIN_POOL_GAMES.includes(game) ? tenWinTargets(entries) : new Map(entries.map(entry => [entry._id, entry.claimCents]));
      const paid = payTargets(budget, targets);
      allocations = new Map(entries.map(entry => [entry._id, paid.get(entry._id) ?? 0]));
      houseCents = budget - [...allocations.values()].reduce((sum, value) => sum + value, 0);
    } else if (entries.length && winCap) {
      const capped = allocateCappedPool(budget, weights, new Map(entries.map(entry => [entry._id, Math.floor(entry.stakeCents * winCap)])));
      allocations = capped.allocations;
      houseCents = capped.undistributed;
    } else if (entries.length) allocations = allocatePool(budget, weights);
    const users = [...new Set(entries.map(entry => entry.userId))].sort();
    for (const userId of users) {
      const user = await tx.get<UserDoc>("users", userId, true);
      if (!user || !Number.isFinite(user.balance)) throw new Error(`Daily-pool wallet missing: ${userId}. Settlement requires administrator review.`);
      const mine = entries.filter(entry => entry.userId === userId);
      const credit = mine.reduce((sum, entry) => sum + allocations.get(entry._id)!, 0);
      const balanceCents = cents(user.balance) + credit;
      if (!Number.isSafeInteger(balanceCents)) throw new Error("Daily-pool wallet limit exceeded.");
      user.balance = balanceCents / 100;
      user.updatedAt = new Date(now);
      await tx.put("users", userId, user);
      for (const entry of mine) {
        entry.payoutCents = allocations.get(entry._id)!;
        entry.status = "settled";
        entry.updatedAt = new Date(now);
        const result = await tx.get<GameResultDoc & PoolFields>("gameresults", entry._id);
        if (!result) throw new Error("Daily-pool result missing; settlement requires administrator review.");
        if (result.userId !== entry.userId || cents(result.betAmount) !== entry.stakeCents || result.poolVersion !== DAILY_POOL_VERSION || result.poolPending !== true) throw new Error("Daily-pool result does not reconcile with its wager.");
        Object.assign(result, { winAmount: entry.payoutCents / 100, outcome: entry.payoutCents > 0 ? "win" : "lose", poolPending: false, updatedAt: new Date(now) });
        result.resultData = `${result.resultData ?? ""} | Daily pool ${pool.day} settled: Rs. ${(entry.payoutCents / 100).toFixed(2)}`;
        await tx.put("gameresults", result._id, result);
        if (entry.sourceTable && entry.sourceId) {
          const source = await tx.get<PoolFields & { _id: string; userId: string; betAmount?: number; amount?: number; winAmount?: number; payout?: number }>(entry.sourceTable, entry.sourceId);
          if (!source) throw new Error("Daily-pool game record missing.");
          const sourceStake = entry.sourceTable === "cardbets" ? source.amount : source.betAmount;
          if (source.userId !== entry.userId || source.poolVersion !== DAILY_POOL_VERSION || source.poolPending !== true || typeof sourceStake !== "number" || cents(sourceStake) !== entry.stakeCents) throw new Error("Daily-pool game record does not reconcile with its wager.");
          Object.assign(source, { [entry.sourceTable === "cardbets" || entry.sourceTable === "plinkobets" ? "payout" : "winAmount"]: result.winAmount, poolPending: false, updatedAt: new Date(now) });
          if (entry.sourceTable === "cardbets") Object.assign(source, { status: result.winAmount > 0 ? "win" : "lose" });
          await tx.put(entry.sourceTable, source._id, source);
        }
        await tx.put("dailypoolentries", entry._id, entry);
      }
    }
    if (houseCents) pool.houseCents = houseCents;
    Object.assign(pool, { status: "settled", budgetCents: budget, carryIn: carry.remainder, carryOut: Number(numerator % BigInt(100)), settledAt: new Date(now), updatedAt: new Date(now) });
    carry.remainder = pool.carryOut!;
    await tx.put("dailypools", pool._id, pool);
    await tx.put("dailypools", carryId, carry);
  }
}
