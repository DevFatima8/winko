"use client";

import { useEffect, useState } from "react";

type CountSource<T> = {
  url: string;
  parse: (data: Record<string, unknown>) => T;
  events: readonly string[];
  label: string;
};

export function useAdminCounts<T>(userId: string | undefined, source: CountSource<T>) {
  const [state, setState] = useState<{ userId?: string; counts: T | null; error: string | null }>({ counts: null, error: null });
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
      const timeout = window.setTimeout(() => controller.abort(new DOMException(`${source.label} request timed out.`, "TimeoutError")), 15000);
      try {
        const response = await fetch(source.url, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? `${source.label} unavailable. Retrying...`);
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`Invalid ${source.label}.`);
        const counts = source.parse(data);
        if (!disposed) setState({ userId, counts, error: null });
      } catch (error) {
        if (!disposed) {
          const message = controller.signal.aborted ? `${source.label} request timed out. Retrying...` : error instanceof Error ? error.message : `${source.label} unavailable. Retrying...`;
          if (controller.signal.aborted) console.warn(`[${source.label}] Request timed out; retrying.`);
          else console.error(`[${source.label}]`, error);
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
    for (const event of source.events) window.addEventListener(event, onRefresh);
    window.addEventListener("focus", onRefresh);
    window.addEventListener("online", onRefresh);
    document.addEventListener("visibilitychange", onRefresh);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      active?.abort(new DOMException(`${source.label} request cancelled.`, "AbortError"));
      for (const event of source.events) window.removeEventListener(event, onRefresh);
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener("online", onRefresh);
      document.removeEventListener("visibilitychange", onRefresh);
    };
  }, [userId, source]);
  return state.userId === userId ? state : { counts: null, error: null };
}
