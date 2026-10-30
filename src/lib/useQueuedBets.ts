"use client";

import { useCallback, useRef, useState } from "react";

export type QueuedChip = { key: string; amount: number };

export function useQueuedBets() {
  const [items, setItems] = useState<QueuedChip[]>([]);
  const pending = useRef<QueuedChip[]>([]);

  const get = useCallback(() => pending.current, []);
  const replace = useCallback((next: QueuedChip[], balance: number): string | null => {
    const cost = next.reduce((sum, item) => sum + item.amount, 0);
    if (next.some((item) => !Number.isFinite(item.amount) || item.amount <= 0) || !Number.isFinite(cost)) {
      return "Invalid queued bet amount.";
    }
    if (!Number.isFinite(balance) || balance < 0 || cost > balance) return "Insufficient balance for next-round bets.";
    pending.current = next.map((item) => ({ ...item }));
    setItems(pending.current);
    return null;
  }, []);

  const take = useCallback((balance: number) => {
    const next = pending.current;
    pending.current = [];
    setItems([]);
    if (!Number.isFinite(balance) || balance < 0 || next.reduce((sum, item) => sum + item.amount, 0) > balance) {
      return { items: [] as QueuedChip[], error: "Next-round bets cancelled: insufficient balance." };
    }
    return { items: next, error: null };
  }, []);

  return { items, get, replace, take };
}
