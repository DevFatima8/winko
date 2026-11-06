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

export function summarizeReferralCommission(user: Pick<UserDoc, "pendingReferralCommission" | "pendingReferralCommissionByUnlock">, now: number) {
  const total = pendingReferralCommission(user);
  const remaining: Record<string, number> = {};
  let trackedCents = 0, lockedCents = 0;
  for (const [unlock, amount] of Object.entries(user.pendingReferralCommissionByUnlock ?? {})) {
    if (!/^\d+$/.test(unlock) || !Number.isSafeInteger(Number(unlock)) || !Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER / 100) {
      throw new Error("Invalid referral commission unlock bucket.");
    }
    const cents = Math.round(amount * 100);
    trackedCents += cents;
    if (Number(unlock) > now) {
      lockedCents += cents;
      remaining[unlock] = amount;
    }
  }
  if (!Number.isSafeInteger(trackedCents) || trackedCents > Math.round(total * 100)) throw new Error("Referral commission buckets exceed pending amount.");
  return { locked: lockedCents / 100, claimable: (Math.round(total * 100) - lockedCents) / 100, remaining };
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

export type ClaimKind = "winnings" | "referral";

export async function claimWinningsTransaction(tx: MultiplayerTransaction, userId: string, kind: ClaimKind = "winnings") {
  const user = await tx.get<UserDoc>("users", userId, true);
  if (!user || !user.isActive || (user.role !== "client" && user.role !== "agent")) throw new Error("Active player account required.");
  if (!Number.isFinite(user.balance) || user.balance < 0 || user.balance > Number.MAX_SAFE_INTEGER / 100) throw new Error("Wallet balance is outside claim limits.");
  const now = await tx.now();
  const eligible: WinHoldDoc[] = [];
  if (kind === "winnings") {
    let after = "";
    for (;;) {
      const page = await tx.page<WinHoldDoc>("winholds", { userId }, after);
      for (const row of page) {
        if (!row.claimed) eligible.push(row);
      }
      if (page.length < 500) break;
      after = String(page[page.length - 1]._id);
    }
  }
  const amounts = kind === "winnings" ? summarizeWinHolds(eligible, now) : { locked: 0, claimable: 0 };
  const referral = kind === "referral" ? summarizeReferralCommission(user, now) : null;
  const total = referral ? referral.claimable : Math.round((amounts.locked + amounts.claimable) * 100) / 100;
  if (!total) return { claimed: 0 };
  const balance = Number((user.balance + total).toFixed(6));
  if (!Number.isFinite(balance) || balance < 0 || balance > Number.MAX_SAFE_INTEGER / 100) throw new Error("Wallet balance is outside claim limits.");
  for (const row of eligible) {
    await tx.put("winholds", row._id, { ...row, claimed: true, claimedAt: new Date(now), updatedAt: new Date(now) });
  }
  await tx.put("users", userId, {
    ...user, balance, updatedAt: new Date(now),
    ...(referral ? { pendingReferralCommission: referral.locked, pendingReferralCommissionByUnlock: referral.remaining } : {}),
  });
  return { claimed: total };
}
