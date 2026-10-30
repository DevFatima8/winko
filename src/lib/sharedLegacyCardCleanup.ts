import type { PoolConnection, ResultSetHeader } from "mysql2/promise";

/** Reset runs under both card-game locks and deletes these rooms alongside the player's wager ledger. */
export async function cleanupPersonalLegacyCardRooms(connection: PoolConnection, userIds: string[]) {
  if (!userIds.length) return 0;
  const rooms = userIds.flatMap(userId => ["dragon-tiger", "andar-bahar"].map(table => `${table}:personal:v1:player:${userId}`));
  const slots = rooms.map(() => "?").join(", ");
  const [rounds] = await connection.execute<ResultSetHeader>(
    `DELETE FROM cardrounds WHERE BINARY JSON_UNQUOTE(JSON_EXTRACT(data, '$.table')) IN (${slots})`,
    rooms,
  );
  const [metadata] = await connection.execute<ResultSetHeader>(
    `DELETE FROM multiplayerrooms WHERE id IN (${slots}) AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.game')) IN ('dragon-tiger', 'andar-bahar') AND JSON_TYPE(JSON_EXTRACT(data, '$.bets')) IS NULL`,
    rooms,
  );
  return rounds.affectedRows + metadata.affectedRows;
}
