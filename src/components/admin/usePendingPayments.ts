"use client";

import { useEffect, useState } from "react";

type PendingCounts = { deposits: number; withdrawals: number };

export function usePendingPayments(userId?: string) {
  const [state, setState] = useState<{ userId?: string; counts: PendingCounts | null; error: string | null }>({ counts: null, error: null });
  useEffect(() => {
    if (!userId) return;
    let disposed = false;
    let active: AbortController | null = null;
    let refreshQueued = false;
    const refresh = async () => {
      if (disposed || document.hidden) return;
      if (active) { refreshQueued = true; return; }
      const controller = new AbortController();
      active = controller;
      const timeout = window.setTimeout(() => controller.abort(new DOMException("Pending payment counts request timed out.", "TimeoutError")), 15000);
      try {
        const response = await fetch("/api/admin/pending-payments", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Pending payment counts load nahi ho sake.");
        if (!Number.isSafeInteger(data.deposits) || data.deposits < 0 || !Number.isSafeInteger(data.withdrawals) || data.withdrawals < 0) {
          throw new Error("Invalid pending payment counts.");
        }
        if (!disposed) setState({ userId, counts: { deposits: data.deposits, withdrawals: data.withdrawals }, error: null });
      } catch (error) {
        if (!disposed) {
          const message = controller.signal.aborted ? "Payment counts request timed out. Retrying..." : error instanceof Error ? error.message : "Payment counts unavailable. Retrying...";
          if (controller.signal.aborted) console.warn("[Pending payment counts] Request timed out; retrying.");
          else console.error("[Pending payment counts]", error);
          setState((previous) => ({ userId, counts: previous.userId === userId ? previous.counts : null, error: message }));
        }
      } finally {
        window.clearTimeout(timeout);
        active = null;
        if (refreshQueued && !disposed) { refreshQueued = false; void refresh(); }
      }
    };
    const onRefresh = () => { void refresh(); };
    void refresh();
    const timer = window.setInterval(onRefresh, 5000);
    window.addEventListener("wx:admin-refresh", onRefresh);
    window.addEventListener("focus", onRefresh);
    window.addEventListener("online", onRefresh);
    document.addEventListener("visibilitychange", onRefresh);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      active?.abort(new DOMException("Pending payment counts request cancelled.", "AbortError"));
      window.removeEventListener("wx:admin-refresh", onRefresh);
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener("online", onRefresh);
      document.removeEventListener("visibilitychange", onRefresh);
    };
  }, [userId]);
  return state.userId === userId ? state : { counts: null, error: null };
}
