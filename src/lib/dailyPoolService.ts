import { allRows, settleDailyPools, type PoolEntry } from "./dailyPool";
import { mysqlMultiplayerStore } from "./multiplayer-store";
import { dailyPoolLock, type DailyPoolGame } from "./dailyPoolRules";
import { sharedFlightState, sharedCardState } from "./sharedLegacyTables";
import type { GameResultDoc, UserDoc } from "@/models";
import { getGameId } from "./aviator";
import { AVIATOR_MODELS } from "./aviatorRules";
import { isMultiplayerGame, multiplayer } from "./multiplayer";

export async function processDailyPool(game: DailyPoolGame) {
  if (game === "aviator") {
    await sharedFlightState(null);
  }
  if (game === "aviator-x") {
    const gameId = await getGameId(game);
    const users = await mysqlMultiplayerStore.transact(dailyPoolLock(game), async tx => {
      const legacy = await allRows<PoolEntry>(tx, "dailypoolentries", { game, status: "active" });
      const pending: GameResultDoc[] = [];
      for (const model of AVIATOR_MODELS) {
        pending.push(...await allRows<GameResultDoc>(tx, "gameresults", { gameId, outcome: "pending", flightModel: model }));
      }
      return [...new Set([...legacy.map(entry => entry.userId), ...pending.map(bet => bet.userId)])];
    });
    for (const userId of users) await sharedFlightState(userId, game);
  }
  if (isMultiplayerGame(game)) await multiplayer.read(game);
  if (game === "dragon-tiger" || game === "andar-bahar") await sharedCardState(null, game);
  await mysqlMultiplayerStore.transact(dailyPoolLock(game), tx => settleDailyPools(tx, game));
}

export async function playerPoolStatus(userId: string, game: DailyPoolGame) {
  return mysqlMultiplayerStore.transact(dailyPoolLock(game), async tx => {
    await settleDailyPools(tx, game);
    const entries = await tx.findWhere<PoolEntry>("dailypoolentries", { userId, game }, 30, { field: "createdAt", direction: "desc" });
    const recent = entries.filter(entry => entry.status !== "cancelled");
    const user = await tx.get<UserDoc>("users", userId);
    if (!user || !Number.isFinite(user.balance)) throw new Error("Player wallet unavailable.");
    return {
      balance: user.balance,
      entries: recent.map(entry => ({
        id: entry._id, day: entry.day, stake: entry.stakeCents / 100, claim: entry.claimCents / 100,
        payout: entry.payoutCents / 100, status: entry.status,
      })),
    };
  });
}
