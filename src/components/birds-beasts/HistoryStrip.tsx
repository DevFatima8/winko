"use client";

import { ANIMALS } from "./lib/game-config";
import type { RoundRecord } from "./types";

interface HistoryStripProps {
  history: RoundRecord[];
}

export default function HistoryStrip({ history }: HistoryStripProps) {
  const recent = history.slice(0, 14);
  const sample = history.slice(0, 50);
  const birds = sample.filter((r) => ANIMALS[r.animal].group === "birds").length;
  const beasts = sample.filter((r) => ANIMALS[r.animal].group === "beasts").length;
  const sharks = sample.filter((r) => ANIMALS[r.animal].group === "shark").length;
  const n = sample.length || 1;

  return (
    <div className="panel mt-1 sm:mt-1.5 px-2.5 py-1 sm:py-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-200/70">Results</span>
        <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-[11px] font-semibold">
          <span className="text-sky-300">
            Birds {sample.length ? Math.round((birds / n) * 100) : 0}%
          </span>
          <span className="text-rose-300">
            Beasts {sample.length ? Math.round((beasts / n) * 100) : 0}%
          </span>
          <span className="text-gold">Shark {sharks}</span>
        </div>
      </div>

      <div className="mt-1 flex items-center gap-1 sm:gap-1.5 overflow-hidden">
        {recent.length === 0 && (
          <span className="py-0.5 text-xs text-white/40">Waiting for first result…</span>
        )}
        {recent.map((r, i) => {
          const a = ANIMALS[r.animal];
          const ring =
            a.group === "birds" ? "ring-sky-400" : a.group === "beasts" ? "ring-rose-400" : "ring-yellow-300";
          return (
            <div
              key={`${r.round}-${r.at}`}
              className={`relative shrink-0 ${i === 0 ? "history-latest" : ""}`}
              title={`Round #${r.round}: ${a.name} x${a.multiplier}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.image}
                alt={a.name}
                draggable={false}
                className={`h-6 w-6 sm:h-7 sm:w-7 md:h-8 md:w-8 rounded-full object-cover ring-2 ${ring} ${i === 0 ? "" : "opacity-80"}`}
              />
              {r.net > 0 && (
                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-emerald-400 ring-1 ring-[#06231a]" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
