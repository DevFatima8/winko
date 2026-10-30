"use client";

import { useState } from "react";
import { getCurrentUser } from "@/lib/auth";
import { RefreshIcon } from "./Icons";

export function PkFlag({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <span role="img" aria-label="Pakistan" className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/25 bg-[#01411c] ${className}`}>
      <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden="true">
        <path fill="#fff" d="M0 0h9v32H0z" />
        <circle cx="21" cy="16" r="8" fill="#fff" />
        <circle cx="24" cy="13.5" r="7" fill="#01411c" />
        <path fill="#fff" d="m24 7 1 2.8h3l-2.4 1.8.9 2.8-2.5-1.7-2.4 1.7.9-2.8-2.4-1.8h3z" />
      </svg>
    </span>
  );
}

export function PlayerBalance({ initial }: { initial: number }) {
  const [balance, setBalance] = useState<{ initial: number; value: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const shown = balance?.initial === initial ? balance.value : initial;
  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const user = await getCurrentUser(true);
      if (!user) throw new Error("Please sign in again to refresh your balance.");
      setBalance({ initial, value: user.balance });
    } catch (error) {
      console.error("[player balance refresh]", error);
      setError(error instanceof Error ? error.message : "Balance refresh failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-[12px] font-bold text-slate-200 sm:text-[13px]">Balance:</span>
        <div className="flex min-w-0 items-center gap-1.5 rounded-full border border-[#ffc933]/45 bg-black/30 py-1 pl-1 pr-1">
          <PkFlag className="h-7 w-7" />
          <span className="whitespace-nowrap text-[14px] font-bold tabular-nums text-[#ffcf4a] sm:text-[16px]">PKR: {Number(shown).toLocaleString("en-PK", { maximumFractionDigits: 2 })}</span>
          <button type="button" aria-label="Refresh balance" disabled={busy} onClick={() => void refresh()} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10 disabled:opacity-60">
            <RefreshIcon size={17} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}
