"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { DailyPoolGame } from "@/lib/dailyPoolRules";
import { broadcastBalanceUpdate } from "@/lib/walletSync";
import { isUnsupportedBrowserPoolGame } from "@/lib/dailyPoolBrowserGames";

export function DailyPoolNotice({ game, children }: { game: DailyPoolGame; children: ReactNode }) {
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [walletError, setWalletError] = useState("");
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    const load = async () => {
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 12000);
      try {
        const response = await fetch(`/api/player/daily-pool?game=${game}`, { cache: "no-store", signal: controller.signal });
        if (response.status === 401) {
          if (alive) { setEnabled(false); setLoaded(true); setError(""); }
          return;
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Game status unavailable.");
        if (alive) {
          setEnabled(data.enabled); setLoaded(true); setError("");
          if (typeof data.balance === "number") broadcastBalanceUpdate(data.balance);
        }
      } catch (reason) {
        if (alive) setError(controller.signal.aborted ? "Game status timed out. Retrying..." : reason instanceof Error ? reason.message : "Game status unavailable.");
      } finally {
        clearTimeout(timeout);
        if (alive) timer = setTimeout(load, 15000);
      }
    };
    void load();
    return () => { alive = false; controller?.abort(); clearTimeout(timer); };
  }, [game]);
  useEffect(() => {
    const onError = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; error?: string } | string>).detail;
      setWalletError(typeof detail === "string" ? detail : detail?.error ?? detail?.message ?? "Wager synchronization failed. Please retry before placing another bet.");
    };
    window.addEventListener("wx:wallet-error", onError);
    return () => window.removeEventListener("wx:wallet-error", onError);
  }, []);
  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      {walletError && <div role="alert" className="flex shrink-0 items-start justify-between gap-2 bg-red-950 p-2 text-xs text-red-200"><span>{walletError}</span><button type="button" onClick={() => setWalletError("")} className="shrink-0 underline">Dismiss</button></div>}
      <div className="flex min-h-0 flex-1 flex-col">{loaded && enabled && isUnsupportedBrowserPoolGame(game) ? <p role="alert" className="p-4 text-sm text-amber-200">New betting is unavailable for this game while its wager integration is being completed. No stake has been accepted.</p> : children}</div>
      {error && <p role="alert" className="shrink-0 bg-[#21152e] p-2 text-xs text-amber-200">{error}</p>}
    </div>
  );
}
