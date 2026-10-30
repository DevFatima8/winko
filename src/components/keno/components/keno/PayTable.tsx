"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  MAX_PICKS,
  RISK_LEVELS,
  type RiskLevel,
  formatMultiplier,
  getTable,
  hitProbability,
} from "@/lib/keno";

type Props = {
  risk: RiskLevel;
  picks: number;
  lastHits: number | null;
  lastWin: boolean;
};

function shortMult(v: number) {
  if (!v) return "—";
  if (v >= 1000) return `${Math.round(v / 100) / 10}k`;
  if (v >= 100) return String(Math.round(v));
  if (v >= 10) return v.toFixed(0);
  return String(Number(v.toFixed(2)));
}

export default function PayTable({ risk, picks, lastHits, lastWin }: Props) {
  const [view, setView] = useState<"list" | "all">("list");
  const table = getTable(risk, picks);
  const count = Math.max(picks, 1);

  return (
    <div className="flex w-full shrink-0 flex-col rounded-lg bg-[#0f212e] p-3 xl:w-[254px]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#b1c2cf]">
            Paytable
          </span>
          <span className="rounded bg-[#1a2c38] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {risk}
          </span>
        </div>
        <div className="flex gap-1">
          {(["list", "all"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={cn(
                "rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors",
                view === mode
                  ? "bg-[#1a2c38] text-white"
                  : "text-[#b1c2cf] hover:bg-[#1a2c38] hover:text-white",
              )}
            >
              {mode === "list" ? "Picks" : "All"}
            </button>
          ))}
        </div>
      </div>

      {view === "list" ? (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center justify-between px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#6f8f9f]">
            <span>Hits</span>
            <span>Chance</span>
            <span>Multiplier</span>
          </div>
          {Array.from({ length: count + 1 }, (_, i) => count - i).map((hits) => {
            const mult = table[hits] ?? 0;
            const chance = hitProbability(count, hits);
            const active = lastHits !== null && lastHits === hits;
            return (
              <div
                key={hits}
                className={cn(
                  "flex items-center justify-between rounded px-2 py-1 text-[13px] font-semibold tabular-nums transition-colors",
                  active
                    ? lastWin
                      ? "bg-[#00e701]/15 text-white ring-1 ring-[#00e701]/50"
                      : "bg-[#ed3333]/10 text-white ring-1 ring-[#ed3333]/40"
                    : "text-[#b1c2cf]",
                )}
              >
                <span className="w-10">
                  {hits}
                  <span className="text-[#6f8f9f]">/{count}</span>
                </span>
                <span className="text-[11px] text-[#6f8f9f]">
                  {(chance * 100).toFixed(chance < 0.001 ? 4 : 2)}%
                </span>
                <span
                  className={cn(
                    "w-16 text-right",
                    mult >= 1 ? "text-[#00e701]" : mult > 0 ? "text-[#ffcd3c]" : "",
                  )}
                >
                  {formatMultiplier(mult)}
                </span>
              </div>
            );
          })}
          <p className="mt-2 px-1 text-[10px] leading-relaxed text-[#6f8f9f]">
            10 of 40 tiles are drawn every round. Green multipliers pay more than your
            stake, yellow pay a partial refund.
          </p>
        </div>
      ) : (
        <div className="keno-scroll -mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[420px] border-collapse text-[11px] tabular-nums">
            <thead>
              <tr>
                <th className="p-0.5 text-left font-bold uppercase tracking-wider text-[#6f8f9f]">
                  H/P
                </th>
                {Array.from({ length: MAX_PICKS }, (_, i) => i + 1).map((p) => (
                  <th
                    key={p}
                    className={cn(
                      "p-0.5 text-center font-bold",
                      p === picks ? "text-[#00e701]" : "text-[#6f8f9f]",
                    )}
                  >
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: MAX_PICKS + 1 }, (_, i) => MAX_PICKS - i).map(
                (hits) => (
                  <tr key={hits}>
                    <td className="p-0.5 text-left font-bold text-[#6f8f9f]">
                      {hits}
                    </td>
                    {Array.from({ length: MAX_PICKS }, (_, i) => i + 1).map((p) => {
                      const table2 = getTable(risk, p);
                      const mult = hits <= p ? (table2[hits] ?? 0) : 0;
                      const active = p === picks && lastHits === hits;
                      return (
                        <td
                          key={p}
                          className={cn(
                            "p-0.5 text-center",
                            p === picks ? "bg-[#1a2c38]" : "",
                            active ? "rounded bg-[#00e701]/25 font-bold text-white" : "",
                          )}
                        >
                          <span
                            className={
                              mult >= 1
                                ? "text-[#00e701]"
                                : mult > 0
                                  ? "text-[#ffcd3c]"
                                  : "text-[#3d5566]"
                            }
                          >
                            {hits <= p ? shortMult(mult) : ""}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ),
              )}
            </tbody>
          </table>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#6f8f9f]">
            {RISK_LEVELS.map((level) => (
              <span
                key={level}
                className={cn(
                  "capitalize",
                  level === risk ? "font-bold text-[#00e701]" : "",
                )}
              >
                {level}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
