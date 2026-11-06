"use client";

import Link from "next/link";
import { useState } from "react";
import { DEFAULT_BET_PRESETS, MAX_BET_PRESET, normalizeBetPresets, saveBetPresets } from "@/lib/betPresets";
import { usePage } from "@/lib/useDb";

export function BetPresetSettings({ userId, initial }: { userId: string; initial?: number[] }) {
  const [amounts, setAmounts] = useState<string[]>(() => (normalizeBetPresets(initial) ?? [...DEFAULT_BET_PRESETS]).map(String));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const invalid = !normalizeBetPresets(amounts);
  const save = async () => {
    const betPresets = normalizeBetPresets(amounts);
    if (!betPresets || pending) return;
    setPending(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/player/bet-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betPresets }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Bet amounts save nahi ho sakin.");
      saveBetPresets(userId, result.betPresets);
      setMessage("Bet amounts saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Bet amounts save nahi ho sakin.");
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="wx-card space-y-3 rounded-xl p-4">
      <h1 className="text-sm font-bold text-white">Customize bet amounts</h1>
      <p className="text-xs text-slate-400">Your saved quick-bet amounts. API games currently use provider bet options; these settings do not change them.</p>
      <p className="text-xs text-slate-400">Enter five different amounts from 10 to Rs. {MAX_BET_PRESET.toLocaleString()}.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {amounts.map((amount, index) => (
          <label key={index} className="min-w-0">
            <span className="mb-1 block text-[10px] font-semibold text-slate-400">Amount {index + 1}</span>
            <input type="number" min="10" max={MAX_BET_PRESET} step="0.01" inputMode="decimal" value={amount}
              onChange={event => {
                setAmounts(current => current.map((value, i) => i === index ? event.target.value : value));
                setMessage("");
                setError("");
              }}
              className="w-full rounded-lg border border-[#3a2470] bg-black/30 px-2 py-2 text-center text-xs font-bold text-white outline-none focus:border-[#d946ef]"
              aria-label={`Quick bet amount ${index + 1}`} />
          </label>
        ))}
      </div>
      {invalid && <p role="alert" className="text-xs text-red-300">Enter five different amounts from 10 to Rs. {MAX_BET_PRESET.toLocaleString()}.</p>}
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      {message && <p role="status" className="text-xs text-emerald-300">{message}</p>}
      <button type="button" onClick={save} disabled={pending || invalid} className="btn-gold w-full rounded-lg py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50">
        {pending ? "Saving..." : "Save bet amounts"}
      </button>
    </section>
  );
}

export default function BetAmountsPageClient() {
  return usePage(async signal => {
    const response = await fetch("/api/player/profile", { cache: "no-store", signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Bet settings load nahi ho sakin.");
    return (
      <div className="mx-auto w-full max-w-2xl space-y-3 pb-6">
        <Link href="/player/profile" className="inline-block text-sm text-[#ffb800]">Back to Profile</Link>
        <BetPresetSettings userId={data.me.id} initial={data.me.betPresets} />
      </div>
    );
  }, []);
}
