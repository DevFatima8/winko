import { randomUUID } from "node:crypto";
import type { ChickenGameDoc, ChickenDashDoc, GameResultDoc, UserDoc, WinHoldDoc } from "@/models";
import * as road from "./chicken";
import * as dash from "./chickendash";
import { checkGameAccess } from "./gameAccess";
import { mysqlMultiplayerStore, type MultiplayerTransaction } from "./multiplayer-store";
import { addPoolWager, closePoolWager, settleDailyPools, cents, type PoolFields } from "./dailyPool";
import { DAILY_POOL_VERSION, dailyPoolLock } from "./dailyPoolRules";
import { MAX_MULTIPLIER, payoutAfterHouseShare } from "./outcomes";
import { dailyPoolEnabled } from "./dailyPoolConfig";
import { heldPortion } from "./winHold";

type ChickenSlug = "chicken-road-2" | "chicken-dash";
type Chicken = (ChickenGameDoc | ChickenDashDoc) & { playerCycleVersion?: string; crashModel?: string };
const tableFor = (slug: ChickenSlug) => slug === "chicken-road-2" ? "chickengames" as const : "chickendashes" as const;
const publicGame = (g: Chicken) => "difficulty" in g ? road.publicState(g) : dash.pub(g);

async function transact<T>(slug: ChickenSlug, fn: (tx: MultiplayerTransaction) => Promise<T>) {
  return mysqlMultiplayerStore.transact(dailyPoolLock(slug), async tx => {
    await settleDailyPools(tx, slug);
    return fn(tx);
  });
}

export async function startPoolChicken(userId: string, slug: ChickenSlug, amount: number, level: string) {
  const config = slug === "chicken-road-2" ? road : dash;
  if (!Number.isFinite(amount) || amount < config.MIN_BET) return { error: `Minimum bet Rs. ${config.MIN_BET} hai.` };
  if (slug === "chicken-road-2" ? !road.isDifficulty(level) : !dash.isLevel(level)) return { error: "Valid difficulty select karein." };
  const denied = await checkGameAccess(userId, slug);
  if (denied) return { error: denied };
  amount = Math.floor(amount);
  const gid = slug === "chicken-road-2" ? await road.gameId() : await dash.gameId();
  return transact(slug, async tx => {
    const table = tableFor(slug);
    const active = await tx.findWhere<Chicken>(table, { userId, status: "active" }, 1);
    if (active.length) return { error: "Pehle wali game abhi chal rahi hai." };
    const user = await tx.get<UserDoc>("users", userId, true);
    if (!user || !user.isActive || user.role !== "client" || user.blockedGames?.includes(slug)) return { error: "This account cannot bet on this game." };
    if (user.balance < amount) return { error: "Insufficient balance." };
    const now = new Date(await tx.now());
    const pooled = dailyPoolEnabled();
    const result: GameResultDoc & PoolFields = {
      _id: randomUUID(), gameId: gid, userId, roundNo: null, betSlot: 0, betAmount: amount,
      winAmount: 0, outcome: "pending", resultData: pooled ? "Daily pool wager started" : "Chicken wager started", createdAt: now, updatedAt: now,
    };
    const base = {
      _id: randomUUID(), userId, resultId: result._id, betAmount: amount, position: 0, status: "active" as const,
      winAmount: 0, crashModel: "independent-lanes-v1",
      ...(pooled ? { poolVersion: DAILY_POOL_VERSION, poolPending: true, poolClaim: 0 } : {}),
      createdAt: now, updatedAt: now,
    };
    let game: Chicken;
    if (slug === "chicken-road-2" && road.isDifficulty(level)) {
      game = { ...base, difficulty: level, lanes: road.lanesFor(level), crashLane: road.rollCrashLane(level) };
    } else if (dash.isLevel(level)) {
      game = { ...base, level, lanes: dash.LEVELS[level].steps, crashLane: dash.rollCrashLane(level), ...dash.bagFor(level), bagCollected: false, dashes: [] };
    } else throw new Error("Invalid daily-pool chicken difficulty.");
    if (pooled) await addPoolWager(tx, slug, result, { sourceTable: table, sourceId: game._id });
    user.balance = (cents(user.balance) - cents(amount)) / 100;
    user.updatedAt = now;
    await tx.put("users", userId, user);
    await tx.insert("gameresults", result._id, result);
    await tx.insert(table, game._id, game);
    return { ok: true, game: publicGame(game) };
  });
}

/** Resolve current and previously accepted wagers under the same game lock. */
export async function actPoolChicken(userId: string, slug: ChickenSlug, action: "step" | "cashout") {
  return transact(slug, async tx => {
    const table = tableFor(slug);
    const game = (await tx.findWhere<Chicken>(table, { userId, status: "active" }, 1))[0];
    if (!game || game.betAmount <= 0) return null;
    if (game.poolVersion && game.poolVersion !== DAILY_POOL_VERSION ||
        game.playerCycleVersion && game.playerCycleVersion !== "ten-player-wins-v1" ||
        game.crashModel && game.crashModel !== "independent-lanes-v1") throw new Error("Unsupported chicken wager version.");
    if (action === "cashout" && game.position < 1) return { error: "Cash out ke liye kam az kam ek lane cross karein." };
    const now = new Date(await tx.now());
    let event: "dead" | "safe" | "dash" | "finished" | "cashed" = "cashed";
    let bagNow = false, dashed = false;
    if (action === "step") {
      const next = game.position + 1;
      if (next >= game.crashLane) {
        game.position = next;
        game.status = "dead";
        event = "dead";
      } else {
        let to = next;
        if ("level" in game && Math.random() < dash.DASH_P) {
          const end = game.position + 2 + Math.floor(Math.random() * 2);
          if (end < game.crashLane && end <= game.lanes && !(game.bagLane && game.bagLane > game.position && game.bagLane < end)) {
            to = end; dashed = true; game.dashes.push({ from: game.position, to });
          }
        }
        game.position = to;
        if ("level" in game && game.bagLane && !game.bagCollected && game.bagLane <= to) {
          game.bagCollected = true; bagNow = true;
        }
        event = to >= game.lanes ? "finished" : dashed ? "dash" : "safe";
      }
    }
    const multiplier = "difficulty" in game ? road.multiplierAt(game.difficulty, game.position) : dash.multiplierAt(game.level, game.position);
    const terminal = action === "cashout" || event === "finished" || event === "dead";
    if (terminal) {
      const bonus = "bagCollected" in game && game.bagCollected ? game.bagMult : 0;
      const gross = event === "dead" ? 0 : game.betAmount * Math.min(MAX_MULTIPLIER, multiplier + bonus);
      const claim = cents(gross) / 100;
      const pooled = game.poolVersion === DAILY_POOL_VERSION;
      const legacy = !game.playerCycleVersion && !game.poolVersion && !game.crashModel;
      const payout = pooled ? 0 : payoutAfterHouseShare(legacy ? gross : claim);
      const result = await tx.get<GameResultDoc & PoolFields>("gameresults", game.resultId);
      if (!result || result.userId !== userId || result.outcome !== "pending" ||
          (result.poolVersion ?? null) !== (game.poolVersion ?? null)) throw new Error("Chicken result missing or inconsistent.");
      if (pooled) {
        if (!await closePoolWager(tx, game.resultId, claim)) throw new Error("Daily-pool chicken entry missing.");
        game.poolClaim = claim;
      }
      game.winAmount = payout;
      if (event !== "dead") game.status = "cashed";
      Object.assign(result, {
        outcome: claim > 0 && (!legacy || slug !== "chicken-dash" || payout > game.betAmount) ? "win" : "lose", ...(pooled ? { poolClaim: claim } : {}), winAmount: payout,
        resultData: pooled ? `${event === "dead" ? "Round ended" : `Provisional claim @ ${multiplier.toFixed(2)}x`} | Pending daily pool settlement`
          : event === "dead" ? "Round ended" : `Cashed out @ ${multiplier.toFixed(2)}x`,
        updatedAt: now,
      });
      await tx.put("gameresults", result._id, result);
      if (!pooled && payout > 0) {
        const user = await tx.get<UserDoc>("users", userId, true);
        if (!user) throw new Error("Chicken wallet unavailable.");
        const balanceCents = cents(user.balance) + cents(payout);
        if (!Number.isSafeInteger(balanceCents)) throw new Error("Chicken wallet balance exceeds safe precision.");
        user.balance = balanceCents / 100;
        user.updatedAt = now;
        await tx.put("users", userId, user);
        const holdAmount = heldPortion(legacy ? gross : claim);
        if (holdAmount > 0) {
          const id = randomUUID();
          const hold: WinHoldDoc = { _id: id, userId, amount: holdAmount, claimed: false, claimedAt: null, unlockAt: now, createdAt: now, updatedAt: now };
          await tx.insert("winholds", id, hold);
        }
      }
    }
    game.updatedAt = now;
    await tx.put(table, game._id, game);
    return { ok: true, event, dash: dashed, bagNow, game: publicGame(game), multiplier, win: game.winAmount,
      poolPending: game.poolVersion === DAILY_POOL_VERSION, poolClaim: game.poolClaim };
  });
}
