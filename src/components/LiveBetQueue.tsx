"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

export type QueuedBet<K extends string = string> = { id: number; key: K; amount: number };
export type QueueActivation<K extends string = string> = { accepted: QueuedBet<K>[]; rejected: QueuedBet<K>[]; total: number };
export type EnqueueResult<K extends string = string> = { ok: true; bet: QueuedBet<K>; total: number } | { ok: false; error: string };

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Explicit bets placed while a live round is already running/closed. Nothing is debited while queued;
 * activate() hands the bets over exactly once when the next betting window opens, re-validating funds.
 */
export class LiveBetQueue<K extends string = string> {
  private items: QueuedBet<K>[] = [];
  private seq = 0;
  private listeners = new Set<() => void>();

  get bets(): readonly QueuedBet<K>[] {
    return this.items;
  }

  get total(): number {
    return r2(this.items.reduce((s, b) => s + b.amount, 0));
  }

  amountFor(key: K): number {
    return r2(this.items.filter((b) => b.key === key).reduce((s, b) => s + b.amount, 0));
  }

  /** `available` is the spendable balance right now (active-round stakes are already deducted from it). */
  enqueue(key: K, amount: number, available: number): EnqueueResult<K> {
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter a valid bet amount." };
    if (!Number.isFinite(available) || r2(this.total + amount) > r2(available)) {
      return { ok: false, error: "Insufficient balance for this queued bet." };
    }
    const bet = { id: ++this.seq, key, amount: r2(amount) };
    this.items = [...this.items, bet];
    this.emit();
    return { ok: true, bet, total: this.total };
  }

  /** Removes every queued bet (nothing was debited, so nothing needs refunding). */
  cancel(): QueuedBet<K>[] {
    const removed = this.items;
    if (!removed.length) return [];
    this.items = [];
    this.emit();
    return removed;
  }

  /** Drains the queue once; accepts bets in order while the balance covers them. */
  activate(available: number): QueueActivation<K> {
    const pending = this.items;
    if (!pending.length) return { accepted: [], rejected: [], total: 0 };
    this.items = [];
    const accepted: QueuedBet<K>[] = [];
    const rejected: QueuedBet<K>[] = [];
    let total = 0;
    for (const bet of pending) {
      if (Number.isFinite(available) && r2(total + bet.amount) <= r2(available)) {
        accepted.push(bet);
        total = r2(total + bet.amount);
      } else rejected.push(bet);
    }
    this.emit();
    return { accepted, rejected, total };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }
}

/** Sums accepted queued bets per key, e.g. to merge into a game's bet map. */
export function sumByKey<K extends string>(bets: readonly QueuedBet<K>[]): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const b of bets) out[b.key] = r2((out[b.key] ?? 0) + b.amount);
  return out;
}

export function activationNotice(act: QueueActivation, money: (n: number) => string): string | null {
  const rejected = r2(act.rejected.reduce((s, b) => s + b.amount, 0));
  if (act.accepted.length && rejected > 0) return `Queued bets placed: ${money(act.total)}. ${money(rejected)} dropped — insufficient balance.`;
  if (act.accepted.length) return `Queued bets placed for this round: ${money(act.total)}.`;
  if (rejected > 0) return `Queued bets of ${money(rejected)} dropped — insufficient balance.`;
  return null;
}

export function useLiveBetQueue<K extends string>() {
  const [queue] = useState(() => new LiveBetQueue<K>());
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const [notice, setNoticeState] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => queue.subscribe(rerender), [queue]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const setNotice = useCallback((text: string | null, tone: "info" | "error" = "info") => {
    if (timer.current) clearTimeout(timer.current);
    setNoticeState(text ? { text, tone } : null);
    if (text) timer.current = setTimeout(() => setNoticeState(null), 4200);
  }, []);

  return { queue, bets: queue.bets, total: queue.total, notice, setNotice };
}

/** Floating status for queued next-round bets; fixed-position so it never shifts the game layout. */
export function LiveBetQueueBar<K extends string>({
  bets,
  total,
  notice,
  onCancel,
  labelFor,
  money,
}: {
  bets: readonly QueuedBet<K>[];
  total: number;
  notice: { text: string; tone: "info" | "error" } | null;
  onCancel: () => void;
  labelFor: (key: K) => string;
  money: (n: number) => string;
}) {
  if (!bets.length && !notice) return null;
  const byKey = sumByKey(bets);
  const parts = (Object.keys(byKey) as K[]).map((k) => `${labelFor(k)} ${money(byKey[k] ?? 0)}`);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto fixed left-1/2 top-16 z-[80] w-[min(92vw,26rem)] -translate-x-1/2 rounded-xl border border-sky-300/60 bg-slate-950/95 px-3 py-2 text-[11px] text-sky-100 shadow-2xl backdrop-blur"
    >
      {bets.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <span>
            <b className="text-white">Next round queue: {money(total)}</b>
            <span className="block text-[10px] text-sky-200/80">{parts.join(" · ")} — not charged yet · joins next round only</span>
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-lg border border-rose-400 bg-rose-600 px-2.5 py-1 text-[10px] font-black text-white hover:bg-rose-500 active:scale-95"
          >
            Cancel queue
          </button>
        </div>
      )}
      {notice && <p className={`${bets.length ? "mt-1 " : ""}font-semibold ${notice.tone === "error" ? "text-rose-300" : "text-emerald-200"}`}>{notice.text}</p>}
    </div>
  );
}
