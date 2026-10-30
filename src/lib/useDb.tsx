"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentUser, type CurrentUser } from "./auth";
import { activateBetPresets } from "./betPresets";

/** Run an async server-backed loader on mount and whenever it is explicitly refreshed. */
export function useDb<T>(loader: (signal: AbortSignal) => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const ref = useRef(loader);
  useEffect(() => { ref.current = loader; }, [loader]);
  useEffect(() => {
    let alive = true;
    let timedOut = false;
    let timeoutId: number | undefined;
    const controller = new AbortController();
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error("Page request timed out. Please retry."));
      }, 20000);
    });
    Promise.race([ref.current(controller.signal), timeout])
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive && (timedOut || !controller.signal.aborted)) setError(String(e?.message ?? e)); })
      .finally(() => { if (timeoutId !== undefined) window.clearTimeout(timeoutId); });
    return () => {
      alive = false;
      controller.abort();
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    window.addEventListener("wx:admin-refresh", refresh);
    window.addEventListener("wx:data-refresh", refresh);
    return () => { window.removeEventListener("wx:admin-refresh", refresh); window.removeEventListener("wx:data-refresh", refresh); };
  }, []);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, reload };
}

/** Current logged-in user (undefined = loading, null = guest). Re-reads on auth changes. */
export function useSession() {
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let retryTimer: number | undefined;
    getCurrentUser().then((u) => {
      if (!alive) return;
      if (u?.role === "client" && activateBetPresets(u.id, u.betPresets)) {
        window.location.reload();
        return;
      }
      setUser(u);
      setError(null);
    }).catch((reason: unknown) => {
      if (!alive) return;
      setError(reason instanceof Error ? reason.message : "Session check temporarily failed.");
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(retry, 5));
      retryTimer = window.setTimeout(() => setRetry((count) => count + 1), delay);
    });
    return () => {
      alive = false;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [tick, retry]);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("wx:session", bump);
    window.addEventListener("wx:balance-update", bump);
    return () => {
      window.removeEventListener("wx:session", bump);
      window.removeEventListener("wx:balance-update", bump);
    };
  }, []);
  return { user, loading: user === undefined, error, refresh: () => setTick((t) => t + 1) };
}

/* ---------- page loader helper (client pages that used to be async server components) ---------- */
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
export const NOT_FOUND = "__NOT_FOUND__" as const;
export const REDIRECT = (to: string) => ({ __redirect: to });
export type PageResult = ReactNode | typeof NOT_FOUND | { __redirect: string };

export function PageLoadingSkeleton({ message = "Loading page content..." }: { message?: string }) {
  return (
    <div className="space-y-5" role="status" aria-busy="true" aria-label={message}>
      <span className="sr-only">{message}</span>
      <div className="flex items-center justify-between gap-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-white/10" />
        <div className="h-9 w-28 animate-pulse rounded-xl bg-white/10" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
            <div className="h-7 w-28 animate-pulse rounded bg-white/10" />
          </div>
        ))}
      </div>
      <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <div className="h-5 w-40 animate-pulse rounded bg-white/10" />
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 border-b border-white/5 pb-3 last:border-0">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-white/10" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-2/5 animate-pulse rounded bg-white/10" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-white/[0.06]" />
            </div>
            <div className="h-7 w-16 animate-pulse rounded-lg bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function usePage(loader: (signal: AbortSignal) => Promise<PageResult>, deps: unknown[] = [], loadingView: ReactNode = <PageLoadingSkeleton />): ReactNode {
  const { data, error, reload } = useDb(loader, deps);
  const redirectTo = data && typeof data === "object" && "__redirect" in (data as object) ? (data as { __redirect: string }).__redirect : null;
  useEffect(() => { if (redirectTo) window.location.replace(redirectTo); }, [redirectTo]);
  if (error) return (
    <div className="space-y-4">
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200" role="alert">
        Page data load nahi ho saka: {error}
      </div>
      <button onClick={reload} className="btn-violet rounded-xl px-4 py-2 text-sm font-bold">Try again</button>
    </div>
  );
  if (data === NOT_FOUND) notFound();
  if (data === null || redirectTo) return loadingView;
  return <>{data as ReactNode}</>;
}
