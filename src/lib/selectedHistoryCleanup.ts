import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getMysqlPool } from "./mysql";
import type { HistorySelection } from "./historySelection";
import { cleanupMultiplayerPlayerData, ensureMultiplayerCleanupTables, lockMultiplayerCleanupRooms } from "./multiplayer-cleanup";

export async function deleteSelectedHistory({ userId, selection, actorId, actorName }: {
  userId?: string; selection: HistorySelection; actorId: string; actorName: string;
}) {
  const pool = await getMysqlPool();
  if (!pool) throw new Error("MySQL unavailable. No history was deleted.");
  const gamesSelected = selection.categories.includes("games");
  if (gamesSelected) await ensureMultiplayerCleanupTables();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (gamesSelected) await lockMultiplayerCleanupRooms(connection);
    const [players] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM users WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.role')) IN ('client', 'agent')${userId ? " AND id = ?" : ""} ORDER BY id FOR UPDATE`,
      userId ? [userId] : [],
    );
    if (!players.length) throw new Error("Player not found. Staff history cannot be deleted here.");
    const playerScope = userId ? "SELECT id FROM users WHERE id = ?" : "SELECT id FROM users WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.role')) IN ('client', 'agent')";
    const scopeValues = userId ? [userId] : [];
    const field = (key: string) => `JSON_UNQUOTE(JSON_EXTRACT(data, '$.${key}'))`;
    const scope = `${field("userId")} IN (${playerScope})`;
    const dateSql = `created_at < ?${selection.from ? " AND created_at >= ?" : ""}`;
    const dateValues = selection.from ? [selection.before, selection.from] : [selection.before];
    let deleted = 0;
    if (gamesSelected) deleted += await cleanupMultiplayerPlayerData(connection, { userIds: players.map(player => String(player.id)), history: { before: selection.before, from: selection.from } });
    const remove = async (table: string, where = scope, values = scopeValues) => {
      const [result] = await connection.execute<ResultSetHeader>(
        `DELETE FROM \`${table}\` WHERE (${where}) AND ${dateSql}`, [...values, ...dateValues],
      );
      deleted += result.affectedRows;
    };
    for (const category of selection.categories) {
      if (category === "games") {
        await remove("gameresults", `${scope} AND ${field("outcome")} IN ('win', 'lose') AND COALESCE(${field("poolPending")}, 'false') <> 'true'`);
        await remove("plinkobets", `${scope} AND COALESCE(${field("poolPending")}, 'false') <> 'true'`);
        for (const table of ["minesgames", "chickengames", "chickendashes"]) {
          await remove(table, `${scope} AND ${field("status")} IN ('cashed', 'dead') AND COALESCE(${field("poolPending")}, 'false') <> 'true'`);
        }
        await remove("cardbets", `${scope} AND ${field("status")} IN ('win', 'lose', 'push') AND COALESCE(${field("poolPending")}, 'false') <> 'true'`);
      } else if (category === "deposits" || category === "withdrawals") {
        await remove("transactions", `${scope} AND ${field("type")} = ? AND ${field("status")} IN ('approved', 'rejected')`, [...scopeValues, category === "deposits" ? "deposit" : "withdraw"]);
      } else if (category === "commissions") {
        await remove("commissions", `${field("fromUserId")} IN (${playerScope}) OR ${field("beneficiaryId")} IN (${playerScope})`, [...scopeValues, ...scopeValues]);
      } else if (category === "support") {
        const [threads] = await connection.execute<RowDataPacket[]>(
          `SELECT id FROM supportthreads WHERE ${scope} AND ${dateSql} FOR UPDATE`, [...scopeValues, ...dateValues],
        );
        for (const thread of threads) {
          const [result] = await connection.execute<ResultSetHeader>("DELETE FROM supportmessages WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.threadId')) = ?", [String(thread.id)]);
          deleted += result.affectedRows;
        }
        await remove("supportthreads");
      } else if (category === "gateway") {
        await remove("gatewaysessions", `${scope} AND ${field("status")} IN ('paid', 'failed', 'expired', 'cancelled')`);
      } else {
        const tables = { login: "loginevents", notifications: "notifications", feedback: "feedbacks" } as const;
        await remove(tables[category]);
      }
    }
    const id = crypto.randomUUID(), now = new Date().toISOString();
    await connection.execute("INSERT INTO adminlogs (id, data) VALUES (?, ?)", [id, JSON.stringify({
      _id: id, actorId, actorName, actorRole: "owner", action: "delete_selected_history", target: userId ?? "all-players",
      details: JSON.stringify({ categories: selection.categories, from: selection.from ?? null, before: selection.before, deleted, balancesUnchanged: true }),
      createdAt: now, updatedAt: now,
    })]);
    await connection.commit();
    return { deleted };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
