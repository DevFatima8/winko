"use client";

const pending = new Map<string, number | null>();
let owner: string | null = null;
let displayed: number | null = null;
let authoritative: number | null = null;
let revision = 0;
const money = (amount: number) => Math.max(0, Math.round(amount * 100) / 100);

export function setWalletRevealOwner(next: string | null) {
  if (owner === next) return;
  const firstOwner = owner === null && next !== null;
  owner = next;
  if (!firstOwner) {
    pending.clear();
    displayed = authoritative = null;
  }
  revision++;
}

export function walletRevealRevision() { return revision; }

export function presentedWalletBalance(balance: number, userId?: string, readRevision?: number) {
  if (userId !== undefined && owner !== null && userId !== owner) return money(balance);
  if (readRevision !== undefined && readRevision !== revision) return displayed ?? money(balance);
  if ([...pending.values()].some(amount => amount === null)) return displayed ?? money(balance);
  const hidden = [...pending.values()].reduce<number>((sum, amount) => sum + (amount ?? 0), 0);
  return money(balance - hidden);
}

export function recordWalletBalance(balance: number) {
  authoritative = balance;
  displayed = presentedWalletBalance(balance);
  return displayed;
}

export function beginWalletReveal(key: string, balance: number | null) {
  if (pending.has(key)) return;
  if (displayed === null && balance !== null) displayed = balance;
  pending.set(key, null);
  revision++;
}

export function confirmWalletReveal(key: string, credit: number) {
  if (!Number.isFinite(credit) || credit < 0) throw new Error("Invalid confirmed wallet return.");
  if (!pending.has(key)) return;
  if (credit > 0) pending.set(key, money(credit));
  else pending.delete(key);
  revision++;
}

/** Releasing presentation never submits a payout or changes the server wallet. */
export function finishWalletReveal(key: string, amount?: number): number | null {
  if (!pending.has(key)) return null;
  const credit = pending.get(key);
  if (credit === undefined) return null;
  if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) throw new Error("Invalid revealed wallet return.");
  const released = amount === undefined ? credit : Math.min(credit ?? 0, money(amount));
  if (credit !== null && amount !== undefined && credit - (released ?? 0) > 0) pending.set(key, money(credit - (released ?? 0)));
  else pending.delete(key);
  revision++;
  if (authoritative === null) return null;
  if (credit !== null && [...pending.values()].some(amount => amount === null)) {
    displayed = money((displayed ?? 0) + (released ?? 0));
    return displayed;
  }
  displayed = presentedWalletBalance(authoritative);
  return displayed;
}
