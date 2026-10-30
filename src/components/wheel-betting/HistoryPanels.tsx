"use client";

import type { BetRecord } from "./lib/types";
import { formatMoney, multiplierChipClass, segmentLabel } from "./lib/wheel";
import { useDailyPoolMode } from "@/lib/walletSync";

export function ResultStrip({ records }: { records: BetRecord[] }) {
  const poolEnabled = useDailyPoolMode();
  const items = records.slice(0, 18);
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[0.68rem] font-black uppercase tracking-[0.2em] text-slate-400">
          Recent spins
        </h3>
        <span className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-slate-600">
          newest first
        </span>
      </div>
      {items.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-500">
          No spins yet — place a bet and hit spin.
        </p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {items.map((r) => (
            <div
              key={r.id}
              className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl text-[0.8rem] font-black ${multiplierChipClass(
                r.multiplier,
              )}`}
              style={{ fontFamily: "var(--font-num)" }}
              title={poolEnabled ? `Daily payout pending · provisional claim ${formatMoney(r.payout)}` : r.profit > 0 ? `Won ${formatMoney(r.profit)}` : "No win"}
            >
              {segmentLabel(r.multiplier)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function HistoryTable({ records }: { records: BetRecord[] }) {
  const poolEnabled = useDailyPoolMode();
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur">
      <h3 className="mb-3 text-[0.68rem] font-black uppercase tracking-[0.2em] text-slate-400">
        Bet history
      </h3>
      <div className="max-h-[280px] overflow-y-auto pr-1">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-[#0b1020] text-[0.6rem] uppercase tracking-[0.14em] text-slate-500">
            <tr>
              <th className="py-2 pr-2 font-bold">Round</th>
              <th className="py-2 pr-2 text-right font-bold">Bet</th>
              <th className="py-2 pr-2 text-right font-bold">Multi</th>
              <th className="py-2 pr-2 text-right font-bold">{poolEnabled ? "Provisional claim" : "Payout"}</th>
              <th className="py-2 text-right font-bold">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {records.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500">
                  Your settled bets will show up here.
                </td>
              </tr>
            )}
            {records.map((r, i) => (
              <tr key={r.id} className="text-slate-300">
                <td className="py-2 pr-2 font-semibold text-slate-500" style={{ fontFamily: "var(--font-num)" }}>
                  #{records.length - i}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums" style={{ fontFamily: "var(--font-num)" }}>
                  {formatMoney(r.bet)}
                </td>
                <td
                  className="py-2 pr-2 text-right font-bold tabular-nums"
                  style={{ fontFamily: "var(--font-num)" }}
                >
                  {segmentLabel(r.multiplier)}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums" style={{ fontFamily: "var(--font-num)" }}>
                  {formatMoney(r.payout)}
                </td>
                <td
                  className={`py-2 text-right font-bold tabular-nums ${
                    r.profit > 0 ? "text-emerald-400" : r.profit < 0 ? "text-rose-400" : "text-slate-400"
                  }`}
                  style={{ fontFamily: "var(--font-num)" }}
                >
                  {poolEnabled ? "Daily payout pending" : r.profit > 0 ? `+${formatMoney(r.profit)}` : "No win"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
