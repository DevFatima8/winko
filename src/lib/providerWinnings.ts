import type { UserDoc, WinHoldDoc } from "@/models";
import type { MultiplayerTransaction } from "./multiplayer-store";

export function nextPakistanMidnight(now: number) {
  const offset = 5 * 3600000;
  return new Date((Math.floor((now + offset) / 86400000) + 1) * 86400000 - offset);
}

export function pendingReferralCommission(user: Pick<UserDoc, "pendingReferralCommission">) {
  const amount = user.pendingReferralCommission ?? 0;
  if (!Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER / 100) throw new Error("Invalid pending referral commission.");
  return Math.round(amount * 100) / 100;
}

export function summarizeWinHolds(rows: readonly WinHoldDoc[], now: number) {
  let locked = 0, claimable = 0;
  for (const row of rows) {
    if (row.claimed) continue;
    if (!Number.isFinite(row.amount) || row.amount < 0 || row.amount > Number.MAX_SAFE_INTEGER / 100) throw new Error("Invalid stored winning amount.");
    if (row.provider === "gregmorn") {
      const unlock = new Date(row.unlockAt).getTime();
      if (!Number.isFinite(unlock)) throw new Error("Invalid winning unlock date.");
      if (unlock > now) { locked += row.amount; continue; }
    }
    if (locked > Number.MAX_SAFE_INTEGER / 100 || claimable > Number.MAX_SAFE_INTEGER / 100) throw new Error("Winning amount is outside claim limits.");
    claimable += row.amount;
  }
  return { locked: Math.round(locked * 100) / 100, claimable: Math.round(claimable * 100) / 100 };
}

export async function claimWinningsTransaction(tx: MultiplayerTransaction, userId: string) {
  const user = await tx.get<UserDoc>("users", userId, true);
  if (!user || !user.isActive || (user.role !== "client" && user.role !== "agent")) throw new Error("Active player account required.");
  if (!Number.isFinite(user.balance) || user.balance < 0 || user.balance > Number.MAX_SAFE_INTEGER / 100) throw new Error("Wallet balance is outside claim limits.");
  const now = await tx.now();
  const eligible: WinHoldDoc[] = [];
  let after = "";
  for (;;) {
    const page = await tx.page<WinHoldDoc>("winholds", { userId }, after);
    for (const row of page) {
      if (!row.claimed && summarizeWinHolds([row], now).claimable > 0) eligible.push(row);
    }
    if (page.length < 500) break;
    after = String(page[page.length - 1]._id);
  }
  const total = Math.round((summarizeWinHolds(eligible, now).claimable + pendingReferralCommission(user)) * 100) / 100;
  if (!total) return { claimed: 0 };
  const balance = Number((user.balance + total).toFixed(6));
  if (!Number.isFinite(balance) || balance < 0 || balance > Number.MAX_SAFE_INTEGER / 100) throw new Error("Wallet balance is outside claim limits.");
  for (const row of eligible) {
    await tx.put("winholds", row._id, { ...row, claimed: true, claimedAt: new Date(now), updatedAt: new Date(now) });
  }
  await tx.put("users", userId, { ...user, balance, pendingReferralCommission: 0, updatedAt: new Date(now) });
  return { claimed: total };
}
