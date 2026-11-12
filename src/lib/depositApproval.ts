import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import type { TransactionDoc, UserDoc } from "@/models";
import { getMysqlPool } from "./mysql";

type ApprovalDetails = {
  adminNote: string | null;
  processedById: string;
  processedByName: string;
  accountName: string | null;
};
type DataRow<T> = RowDataPacket & { data: T | string };
const parseData = <T,>(row: DataRow<T>): T => typeof row.data === "string" ? JSON.parse(row.data) : row.data;

export const FIRST_DEPOSIT_BONUS_TITLE = "Congratulations! First deposit bonus received";

/** Commit approval, principal, first-deposit bonus and its notice together. */
export async function approveDeposit(id: string, userId: string, details: ApprovalDetails, actorRole?: string) {
  const pool = await getMysqlPool();
  if (!pool) throw new Error("Deposit approval requires the configured database.");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [users] = await connection.query<DataRow<UserDoc>[]>("SELECT data FROM users WHERE id = ? FOR UPDATE", [userId]);
    if (!users[0]) throw new Error("Deposit account not found.");
    const user = parseData(users[0]);
    const [transactions] = await connection.query<DataRow<TransactionDoc>[]>("SELECT data FROM transactions WHERE id = ? FOR UPDATE", [id]);
    const transaction = transactions[0] ? parseData(transactions[0]) : null;
    if (!transaction || transaction.userId !== userId || transaction.type !== "deposit" || transaction.status !== "pending") {
      await connection.rollback();
      return null;
    }
    if (!Number.isFinite(transaction.amount) || transaction.amount <= 0 || !Number.isFinite(user.balance)) {
      throw new Error("Invalid deposit or wallet amount.");
    }
    const [previous] = await connection.query<RowDataPacket[]>(
      "SELECT id FROM transactions WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.userId')) = ? AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.type')) = 'deposit' AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.status')) = 'approved' LIMIT 1",
      [userId],
    );
    const eligible = previous.length === 0 && !(user.totalDeposited > 0) && !user.firstDepositBonusTransactionId;
    const bonus = eligible ? Math.round(transaction.amount * 5) / 100 : 0;
    const now = new Date();
    transaction.status = "approved";
    Object.assign(transaction, details, { processedAt: now, updatedAt: now, firstDepositBonus: bonus });
    user.balance = Math.round((user.balance + transaction.amount + bonus) * 100) / 100;
    user.updatedAt = now;
    if (eligible) user.firstDepositBonusTransactionId = id;
    await connection.execute("UPDATE users SET data = ?, updated_at = ? WHERE id = ?", [JSON.stringify(user), now, userId]);
    await connection.execute("UPDATE transactions SET data = ?, updated_at = ? WHERE id = ?", [JSON.stringify(transaction), now, id]);
    if (bonus > 0 && actorRole !== "owner") {
      const noticeId = randomUUID();
      const notification = {
        _id: noticeId, title: FIRST_DEPOSIT_BONUS_TITLE,
        body: `Your first deposit of Rs. ${transaction.amount.toLocaleString("en-PK")} is approved! Your 5% bonus of Rs. ${bonus.toLocaleString("en-PK")} has been added to your balance.`,
        type: "success", audience: "user", userId, href: "/player/wallet", isActive: true, readBy: [], createdAt: now, updatedAt: now,
      };
      await connection.execute("INSERT INTO notifications (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)", [noticeId, JSON.stringify(notification), now, now]);
    }
    await connection.commit();
    return { transaction, bonus };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
