import { PaymentAccount, Transaction, User, type PaymentAccountDoc, type TransactionDoc, type UserDoc } from "@/models";
import { isMysqlEnabled } from "./mysql";
import { mysqlMultiplayerStore, type MultiplayerTable, type MultiplayerTransaction, type JsonDocument } from "./multiplayer-store";

type AssignmentUser = Pick<UserDoc, "_id" | "referredBy" | "assignedAccounts" | "paymentAssignmentTransactions">;
type AssignmentAccount = Pick<PaymentAccountDoc, "_id" | "provider" | "ownerId" | "isActive" | "qrImage">;
type AssignmentDeposit = Pick<TransactionDoc, "_id" | "provider" | "paymentAccountId" | "paymentMethod" | "createdAt">;
const methods = ["jazzcash", "easypaisa", "raast", "qr"] as const;

export function planPaymentAssignments(user: AssignmentUser, accounts: AssignmentAccount[], users: AssignmentUser[], deposits: AssignmentDeposit[]) {
  const assigned: Record<string, string> = {};
  const consumed = { ...user.paymentAssignmentTransactions };
  for (const method of methods) {
    const eligible = accounts.filter(account => account.isActive && (method === "qr" ? !!account.qrImage : account.provider === method));
    const own = user.referredBy ? eligible.filter(account => String(account.ownerId ?? "") === String(user.referredBy)) : [];
    const pool = own.length ? own : eligible.filter(account => !account.ownerId);
    if (!pool.length) continue;
    const current = user.assignedAccounts?.[method];
    const latest = deposits.filter(deposit => (deposit.paymentMethod === "qr" ? "qr" : deposit.provider) === method)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || b._id.localeCompare(a._id))[0];
    const rotate = !!latest && consumed[method] !== latest._id && latest.paymentAccountId === current;
    if (latest) consumed[method] = latest._id;
    if (!rotate && current && pool.some(account => account._id === current)) {
      assigned[method] = current;
      continue;
    }
    const candidates = pool.length > 1 ? pool.filter(account => account._id !== current) : pool;
    const loads = candidates.map(account => ({
      account,
      count: users.filter(other => other._id !== user._id && other.assignedAccounts?.[method] === account._id).length,
    }));
    const minimum = Math.min(...loads.map(item => item.count));
    const balanced = loads.filter(item => item.count === minimum);
    assigned[method] = balanced[Math.floor(Math.random() * balanced.length)].account._id;
  }
  return { assignedAccounts: assigned, paymentAssignmentTransactions: consumed };
}

async function all<T extends JsonDocument>(tx: MultiplayerTransaction, table: MultiplayerTable, filters: Record<string, string> = {}) {
  const rows: T[] = [];
  let after = "";
  for (;;) {
    const page = await tx.page<T>(table, filters, after);
    rows.push(...page);
    if (page.length < 500) return rows;
    after = String(page[page.length - 1]._id);
  }
}

let localQueue: Promise<unknown> = Promise.resolve();

export async function assignAccounts(userId: string) {
  if (isMysqlEnabled()) {
    return mysqlMultiplayerStore.transact("payments:assign", async tx => {
      const user = await tx.get<UserDoc>("users", userId, true);
      if (!user) throw new Error("Payment assignment user not found.");
      const [accounts, users, deposits] = await Promise.all([
        all<PaymentAccountDoc>(tx, "paymentaccounts"),
        all<UserDoc>(tx, "users"),
        all<TransactionDoc>(tx, "transactions", { userId, type: "deposit" }),
      ]);
      const next = planPaymentAssignments(user, accounts, users, deposits);
      if (JSON.stringify(user.assignedAccounts) !== JSON.stringify(next.assignedAccounts) ||
          JSON.stringify(user.paymentAssignmentTransactions) !== JSON.stringify(next.paymentAssignmentTransactions)) {
        await tx.put("users", userId, { ...user, ...next, updatedAt: new Date(await tx.now()) });
      }
      return next.assignedAccounts;
    });
  }
  const run = localQueue.then(async () => {
    const user = await User.findById(userId).lean();
    if (!user) throw new Error("Payment assignment user not found.");
    const [accounts, users, deposits] = await Promise.all([
      PaymentAccount.find({ isActive: true }).lean(),
      User.find({ role: { $in: ["client", "agent"] } }).lean(),
      Transaction.find({ userId, type: "deposit" }).lean(),
    ]);
    const next = planPaymentAssignments(user, accounts, users, deposits);
    if (JSON.stringify(user.assignedAccounts) !== JSON.stringify(next.assignedAccounts) ||
        JSON.stringify(user.paymentAssignmentTransactions) !== JSON.stringify(next.paymentAssignmentTransactions)) {
      await User.updateOne({ _id: userId }, { $set: next });
    }
    return next.assignedAccounts;
  });
  localQueue = run.catch(() => undefined);
  return run;
}
