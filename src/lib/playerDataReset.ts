import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { ensureMysqlReady, getMysqlPool } from "./mysql";
import { cleanupMultiplayerPlayerData, ensureMultiplayerCleanupTables, lockMultiplayerCleanupRooms } from "./multiplayer-cleanup";
import { cleanupPersonalLegacyCardRooms } from "./sharedLegacyCardCleanup";
import type { PoolEntry } from "./dailyPool";

type ResetOptions = { userId?: string; deleteAccount?: boolean; actorId: string; actorName: string };

export async function resetPlayerData({ userId, deleteAccount = false, actorId, actorName }: ResetOptions) {
  if (deleteAccount && !userId) throw new Error("Choose one player account to delete.");
  if (!await ensureMysqlReady()) throw new Error("Player data reset requires the configured MySQL database.");
  const pool = await getMysqlPool();
  if (!pool) throw new Error("MySQL is unavailable. Nothing was deleted.");
  await ensureMultiplayerCleanupTables();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await lockMultiplayerCleanupRooms(connection);
    const [players] = await connection.execute<RowDataPacket[]>(
      `SELECT id, data FROM users WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.role')) IN ('client', 'agent')${userId ? " AND id = ?" : ""} ORDER BY id FOR UPDATE`,
      userId ? [userId] : [],
    );
    if (userId && players.length !== 1) throw new Error("Player not found. Staff accounts cannot be reset or deleted here.");
    if (!players.length) throw new Error("No player accounts to reset.");
    const accounts = players.map((row) => {
      const data: { isActive?: boolean } = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
      return { id: String(row.id), active: data.isActive !== false };
    });
    const activeCount = accounts.filter((account) => account.active).length;
    if (activeCount) throw new Error(`${activeCount} selected player account(s) are still active. Block ${userId ? "this player" : "all player/referral-agent accounts under All Users"} first, wait for ongoing requests to finish, then retry. No data was deleted.`);
    const ids = accounts.map((account) => account.id);
    const slots = ids.map(() => "?").join(", ");
    let deleted = 0;
    deleted += await cleanupMultiplayerPlayerData(connection, { userIds: ids, fullReset: !userId });
    deleted += await cleanupPersonalLegacyCardRooms(connection, ids);
    const remove = async (table: string, where: string, values: string[]) => {
      const [result] = await connection.execute<ResultSetHeader>(`DELETE FROM \`${table}\` WHERE ${where}`, values);
      deleted += result.affectedRows;
    };
    const userField = "JSON_UNQUOTE(JSON_EXTRACT(data, '$.userId'))";
    if (userId) {
      const [entries] = await connection.execute<RowDataPacket[]>(
        `SELECT id, data FROM dailypoolentries WHERE ${userField} IN (${slots}) AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.status')) IN ('active', 'closed') ORDER BY id FOR UPDATE`,
        ids,
      );
      const removals = new Map<string, { stakeCents: number; outstanding: number }>();
      for (const row of entries) {
        const entry: PoolEntry = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
        const totals = removals.get(entry.poolId) ?? { stakeCents: 0, outstanding: 0 };
        totals.stakeCents += entry.stakeCents;
        if (entry.status === "active") totals.outstanding++;
        if (!Number.isSafeInteger(totals.stakeCents) || totals.stakeCents < 0) throw new Error("Daily-pool stake ledger is inconsistent. Nothing was deleted.");
        removals.set(entry.poolId, totals);
      }
      for (const [poolId, totals] of [...removals].sort(([a], [b]) => a.localeCompare(b))) {
        const [rows] = await connection.execute<RowDataPacket[]>("SELECT id, data FROM dailypools WHERE id = ? FOR UPDATE", [poolId]);
        const ledger: { status: string; stakeCents: number; outstanding: number; updatedAt?: string } | undefined =
          rows[0] && (typeof rows[0].data === "string" ? JSON.parse(rows[0].data) : rows[0].data);
        if (!ledger || ledger.status !== "open" || !Number.isSafeInteger(ledger.stakeCents) ||
            !Number.isSafeInteger(ledger.outstanding) || ledger.stakeCents < totals.stakeCents || ledger.outstanding < totals.outstanding) {
          throw new Error("Daily-pool ledger is inconsistent. Nothing was deleted.");
        }
        ledger.stakeCents -= totals.stakeCents;
        ledger.outstanding -= totals.outstanding;
        ledger.updatedAt = new Date().toISOString();
        await connection.execute("UPDATE dailypools SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [JSON.stringify(ledger), poolId]);
      }
    }
    await remove("dailypoolentries", userId ? `${userField} IN (${slots})` : "1 = 1", userId ? ids : []);
    if (!userId) await remove("dailypools", "1 = 1", []);
    const [threads] = await connection.execute<RowDataPacket[]>(`SELECT id FROM supportthreads WHERE ${userField} IN (${slots}) FOR UPDATE`, ids);
    if (threads.length) {
      const threadIds = threads.map((thread) => String(thread.id));
      await remove("supportmessages", `JSON_UNQUOTE(JSON_EXTRACT(data, '$.threadId')) IN (${threadIds.map(() => "?").join(", ")})`, threadIds);
    }
    const commissionWhere = userId ? `JSON_UNQUOTE(JSON_EXTRACT(data, '$.fromUserId')) IN (${slots}) OR JSON_UNQUOTE(JSON_EXTRACT(data, '$.beneficiaryId')) IN (${slots})` : "1 = 1";
    const commissionValues = userId ? [...ids, ...ids] : [];
    const [commissions] = await connection.execute<RowDataPacket[]>(
      `SELECT JSON_UNQUOTE(JSON_EXTRACT(data, '$.beneficiaryId')) AS beneficiaryId, SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.amount')) AS DECIMAL(20,2))) AS amount FROM commissions WHERE ${commissionWhere} GROUP BY beneficiaryId`,
      commissionValues,
    );
    await remove("commissions", commissionWhere, commissionValues);
    for (const commission of commissions) {
      if (ids.includes(String(commission.beneficiaryId))) continue;
      await connection.execute(
        `UPDATE users SET data = JSON_SET(data, '$.commissionEarned', GREATEST(0, COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.commissionEarned')) AS DECIMAL(20,2)), 0) - ?), '$.updatedAt', ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [Number(commission.amount), new Date().toISOString(), String(commission.beneficiaryId)],
      );
    }
    for (const table of ["gameresults", "plinkobets", "minesgames", "chickengames", "chickendashes", "cardbets", "transactions", "gatewaysessions", "winholds"]) {
      await remove(table, userId ? `${userField} IN (${slots})` : "1 = 1", userId ? ids : []);
    }
    for (const table of ["loginevents", "devicesessions", "notifications", "supportthreads", "feedbacks"]) {
      await remove(table, `${userField} IN (${slots})`, ids);
    }
    if (userId) {
      await remove("aviatorrounds", "JSON_UNQUOTE(JSON_EXTRACT(data, '$.table')) IN (?, ?)", [`aviator:${userId}`, `aviator-x:${userId}`]);
    } else {
      await remove("aviatorrounds", "1 = 1", []);
      await remove("cardrounds", "1 = 1", []);
    }
    if (deleteAccount) {
      await remove("users", "id = ?", [ids[0]]);
      await connection.execute(
        "UPDATE users SET data = JSON_SET(data, '$.referredBy', NULL, '$.updatedAt', ?), updated_at = CURRENT_TIMESTAMP WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.referredBy')) = ?",
        [new Date().toISOString(), ids[0]],
      );
    } else {
      await connection.execute(
        `UPDATE users SET data = JSON_REMOVE(JSON_SET(data, '$.balance', 0, '$.totalDeposited', 0, '$.totalWithdrawn', 0, '$.commissionEarned', 0, '$.pendingReferralCommission', 0, '$.vipLevel', 0, '$.vipBetPoints', 0, '$.vipPointsWelcomePending', JSON_EXTRACT('false', '$'), '$.lastLoginAt', NULL, '$.lastLoginIp', NULL, '$.historicalIps', JSON_ARRAY(), '$.updatedAt', ?), '$.firstDepositBonusTransactionId', '$.pendingReferralCommissionByUnlock'), updated_at = CURRENT_TIMESTAMP WHERE id IN (${slots})`,
        [new Date().toISOString(), ...ids],
      );
    }
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await connection.execute(
      "INSERT INTO adminlogs (id, data) VALUES (?, ?)",
      [id, JSON.stringify({ _id: id, actorId, actorName, actorRole: "owner", action: deleteAccount ? "delete_player_and_history" : "reset_player_history", target: userId ?? "all-players", details: `${ids.length} player(s); ${deleted} records deleted; wallet and totals reset; pending wagers and unpaid pool claims removed without refund or payout`, createdAt: now, updatedAt: now })],
    );
    await connection.commit();
    return { players: ids.length, deleted };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
