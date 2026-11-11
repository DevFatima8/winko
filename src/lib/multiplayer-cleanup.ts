import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { ensureMysqlTable } from "./mysql";
import { MULTIPLAYER_GAMES, type MultiplayerGame } from "./multiplayer-types";
import { flightMs, timings } from "./multiplayer-rules";
import { DAILY_POOL_GAMES, dailyPoolLock } from "./dailyPoolRules";

type CleanupBet = { userId: string; status: string; createdAt?: number; settledAt?: number; cashoutMultiplier?: number };
type CleanupRoom = {
  game: MultiplayerGame; startedAt: number; outcome: { crashPoint?: number };
  roundTimingVersion?: 1 | 2;
  ownerId?: string;
  bets: CleanupBet[]; queuedBets: CleanupBet[];
};
type RoomRow = RowDataPacket & { id: string; data: CleanupRoom | string };

export async function ensureMultiplayerCleanupTables() {
  for (const table of ["multiplayerlocks", "multiplayerrooms", "multiplayerrequests", "dailypools", "dailypoolentries"]) await ensureMysqlTable(table, true);
}

/** Acquire before any wallet lock, matching live room -> wallet transaction order. */
export async function lockMultiplayerCleanupRooms(connection: PoolConnection) {
  const locks = [...new Set([...MULTIPLAYER_GAMES.map(game => `multiplayer:${game}`), ...DAILY_POOL_GAMES.map(dailyPoolLock)])].sort();
  for (const id of locks) {
    await connection.execute("INSERT INTO multiplayerlocks (id, data) VALUES (?, '{}') ON DUPLICATE KEY UPDATE id = VALUES(id)", [id]);
    await connection.execute("SELECT id FROM multiplayerlocks WHERE id = ? FOR UPDATE", [id]);
  }
}

export async function cleanupMultiplayerPlayerData(connection: PoolConnection, {
  userIds, fullReset = false, history,
}: {
  userIds: string[];
  fullReset?: boolean;
  history?: { before: Date | string; from?: Date | string | null };
}): Promise<number> {
  if (!userIds.length) return 0;
  const users = new Set(userIds);
  let deleted = 0;
  const [rows] = await connection.execute<RoomRow[]>(
    `SELECT id, data FROM multiplayerrooms WHERE id IN (${MULTIPLAYER_GAMES.map(() => "?").join(", ")}) OR (JSON_UNQUOTE(JSON_EXTRACT(data, '$.ownerId')) IN (${userIds.map(() => "?").join(", ")}) AND JSON_TYPE(JSON_EXTRACT(data, '$.bets')) = 'ARRAY') ORDER BY id FOR UPDATE`,
    [...MULTIPLAYER_GAMES, ...userIds],
  );
  const timestamp = (value: Date | string) => value instanceof Date ? value.getTime() : new Date(value).getTime();
  const before = history ? timestamp(history.before) : null;
  const from = history?.from ? timestamp(history.from) : null;
  if (history && (!Number.isFinite(before) || from !== null && !Number.isFinite(from))) throw new Error("Invalid multiplayer history cutoff.");
  for (const row of rows) {
    const room: CleanupRoom = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
    if (!history && (fullReset || room.ownerId && users.has(room.ownerId))) {
      const [result] = await connection.execute<ResultSetHeader>("DELETE FROM multiplayerrooms WHERE id = ?", [row.id]);
      deleted += result.affectedRows;
      continue;
    }
    const t = timings(room.game, room.roundTimingVersion ?? 1);
    const resultAt = room.startedAt + t.bettingMs + (room.game === "blast-off" ? flightMs(room.outcome.crashPoint ?? 1) : t.runningMs);
    const remove = (bet: CleanupBet) => {
      if (!users.has(bet.userId)) return false;
      if (!history) return true;
      if (!["win", "lose", "cancelled"].includes(bet.status)) return false;
      // Older room documents predate explicit timestamps; their current round deadline is authoritative.
      const settledAt = bet.settledAt ?? (bet.status === "cancelled" ? bet.createdAt : room.game === "blast-off" && bet.cashoutMultiplier !== undefined ? room.startedAt + t.bettingMs + flightMs(bet.cashoutMultiplier) : resultAt);
      return settledAt !== undefined && settledAt < before! && (from === null || settledAt >= from);
    };
    const bets = room.bets.filter(bet => !remove(bet)), queuedBets = room.queuedBets.filter(bet => !remove(bet));
    const removed = room.bets.length + room.queuedBets.length - bets.length - queuedBets.length;
    if (!removed) continue;
    room.bets = bets;
    room.queuedBets = queuedBets;
    await connection.execute("UPDATE multiplayerrooms SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [JSON.stringify(room), row.id]);
    deleted += removed;
  }
  if (!history) {
    // Legacy opaque receipts have no owner metadata; retain them rather than deleting another player's idempotency key.
    const [result] = await connection.execute<ResultSetHeader>(
      fullReset ? "DELETE FROM multiplayerrequests" : `DELETE FROM multiplayerrequests WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.userId')) IN (${userIds.map(() => "?").join(", ")})`,
      fullReset ? [] : userIds,
    );
    deleted += result.affectedRows;
  }
  return deleted;
}
