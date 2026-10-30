"use client";

import { cn } from "./lib/cn";
import { formatChips, type SessionStats } from "./lib/teenpatti";
import { useDailyPoolMode } from "@/lib/walletSync";

export interface HistoryEntry {
  id: number;
  winner: "A" | "B" | "TIE";
  handLabel: string;
  wagered: number;
  net: number;
  playerWon: boolean;
  played: boolean;
}

const WINNER_STYLE: Record<"A" | "B" | "TIE", { bg: string; label: string }> = {
  A: { bg: "bg-rose-600/90 border-rose-300/70", label: "A" },
  B: { bg: "bg-sky-600/90 border-sky-300/70", label: "B" },
  TIE: { bg: "bg-emerald-600/90 border-emerald-300/70", label: "T" },
};

export function HistoryPanel({
  history,
  stats,
  className,
}: {
  history: HistoryEntry[];
  stats: SessionStats;
  className?: string;
}) {
  const poolEnabled = useDailyPoolMode();
  const aCount = history.filter((h) => h.winner === "A").length;
  const bCount = history.filter((h) => h.winner === "B").length;
  const tCount = history.filter((h) => h.winner === "TIE").length;
  const total = history.length || 1;

  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-2", className)}>
      <div className="tp-panel rounded-xl p-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/80">Roadmap</h3>
          <span className="text-[9px] uppercase tracking-widest text-white/35">Last 30</span>
        </div>
        <div className="tp-scroll mt-2 grid max-h-[168px] grid-cols-6 gap-1.5 overflow-y-auto pr-0.5">
          {history.length === 0
            ? Array.from({ length: 18 }).map((_, index) => (
                <div key={index} className="aspect-square rounded-full border border-white/10 bg-white/5" />
              ))
            : history.map((entry) => (
                <div
                  key={entry.id}
                  title={`${entry.winner === "TIE" ? "Tie" : `Player ${entry.winner}`} · ${entry.handLabel}`}
                  className={cn(
                    "tp-pop grid aspect-square place-items-center rounded-full border text-[10px] font-black text-white shadow",
                    WINNER_STYLE[entry.winner].bg,
                    entry.played && entry.playerWon && "ring-2 ring-amber-300",
                  )}
                >
                  {WINNER_STYLE[entry.winner].label}
                </div>
              ))}
        </div>
      </div>

      <div className="tp-panel rounded-xl p-2.5">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/80">Hand Stats</h3>
        <div className="mt-2 space-y-1.5">
          <StatBar label="Player A" value={aCount} total={total} color="bg-rose-500" />
          <StatBar label="Player B" value={bCount} total={total} color="bg-sky-500" />
          <StatBar label="Tie" value={tCount} total={total} color="bg-emerald-500" />
        </div>
      </div>

      <div className="tp-panel rounded-xl p-2.5">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/80">Session</h3>
        <dl className="mt-2 space-y-1 text-[11px]">
          <Row label="Rounds" value={formatChips(stats.rounds)} />
          <Row label="Wagered" value={formatChips(stats.wagered)} />
          <Row label={poolEnabled ? "Provisional claims" : "Returned"} value={formatChips(stats.returned)} />
        </dl>

      </div>
    </div>
  );
}

function StatBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = (value / total) * 100;
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] text-white/60">
        <span>{label}</span>
        <span className="tp-nums">{pct.toFixed(0)}%</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/60">
        <div className={cn("h-full", color)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-white/45">{label}</dt>
      <dd className={cn("tp-nums font-semibold", accent ?? "text-white/90")}>{value}</dd>
    </div>
  );
}
