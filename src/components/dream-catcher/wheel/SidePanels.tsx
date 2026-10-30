"use client";

import type { ReactNode } from "react";
import { SPOT_THEME, formatMoney, type SpotId } from "../game/config";

export type HistoryEntry = {
  id: number;
  spot: SpotId;
  multiplier: number;
  stake: number;
  payout: number;
};

export type SessionStats = {
  rounds: number;
  wins: number;
  wagered: number;
  returned: number;
};

export function HistoryRail({ history }: { history: HistoryEntry[] }) {
  return (
    <div className="panel rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[11px] font-black tracking-[0.22em] text-violet-200/70 uppercase">
          Last results
        </h2>
        <span className="text-[10px] font-bold text-violet-200/45">{history.length} rounds</span>
      </div>
      {history.length === 0 ? (
        <p className="py-4 text-center text-xs text-violet-200/45">
          No spins yet — drop a chip and hit SPIN.
        </p>
      ) : (
        <div className="thin-scroll flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
          {history.map((entry) => {
            const theme = SPOT_THEME[entry.spot];
            const won = entry.payout > entry.stake;
            return (
              <div
                key={entry.id}
                className="flex items-center gap-2 rounded-lg bg-black/30 px-2 py-1.5 ring-1 ring-white/5"
              >
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-black ring-2 ring-white/25"
                  style={{ background: theme.face, color: theme.text }}
                >
                  {entry.spot}
                </span>
                {entry.multiplier > 1 ? (
                  <span className="rounded bg-cyan-400/20 px-1.5 py-0.5 text-[10px] font-black text-cyan-200">
                    ×{entry.multiplier}
                  </span>
                ) : null}
                <span className="ml-auto text-[11px] font-bold tabular-nums">
                  <span className="text-violet-200/50">bet {formatMoney(entry.stake)}</span>
                  <span className={won ? "ml-2 text-emerald-300" : "ml-2 text-rose-300/80"}>
                    {won ? `+${formatMoney(entry.payout - entry.stake)}` : "No win"}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function StatsPanel({ stats }: { stats: SessionStats }) {
  const net = stats.returned - stats.wagered;

  return (
    <div className="panel rounded-2xl p-4">
      <h2 className="mb-3 text-[11px] font-black tracking-[0.22em] text-violet-200/70 uppercase">
        Session telemetry
      </h2>

      <div className="grid grid-cols-2 gap-2 text-center">
        <Stat label="Rounds" value={String(stats.rounds)} />
        <Stat label="Wins" value={String(stats.wins)} />
        <Stat label="Wagered" value={formatMoney(stats.wagered)} />
        <Stat
          label="Result"
          value={net > 0 ? `+${formatMoney(net)}` : "No win"}
          tone={net >= 0 ? "good" : "bad"}
        />
      </div>

    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="panel-flat rounded-lg px-2 py-2">
      <div className="text-[9px] font-black tracking-[0.18em] text-violet-200/50 uppercase">{label}</div>
      <div
        className={`mt-0.5 text-sm font-black tabular-nums ${
          tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : "text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="panel banner-in max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl p-6 thin-scroll"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="gold-text text-2xl font-black tracking-tight">How the wheel works</h2>
            <p className="text-xs text-violet-200/60">Dream Wheel — money wheel studio format</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-bold text-white ring-1 ring-white/20 hover:bg-white/20"
          >
            ✕
          </button>
        </div>

        <ul className="space-y-3 text-sm text-violet-100/85">
          <Rule n="1" title="Back a number">
            The wheel carries 54 segments: twenty-two <b>1</b>, fifteen <b>2</b>, seven <b>5</b>, four{" "}
            <b>10</b>, two <b>20</b>, one <b>40</b>, plus two <b>2x</b> and one <b>7x</b> multiplier
            segments. A winning number bet pays that value to 1, plus your stake back.
          </Rule>
          <Rule n="2" title="Multipliers re-spin the wheel">
            If the pointer stops on <b>2x</b> or <b>7x</b>, every chip on the table is multiplied by that
            value and the wheel spins again — up to two chains in a row (a 14x table is possible).
          </Rule>
          <Rule n="3" title="Casino Payouts">
            Every round is spun using the wheel&apos;s natural segment distribution. Numbers pay out their face
            value (e.g. 10 pays 10 to 1, 40 pays 40 to 1) plus returned stakes on winning spots.
          </Rule>
          <Rule n="4" title="Table limits">
            Chips run 1 / 5 / 25 / 100 / 500. Max {formatMoney(5000)} per spot. Right-click a spot to pull
            a chip back off, or use UNDO / CLEAR.
          </Rule>
        </ul>

        <p className="mt-5 rounded-lg bg-black/40 p-3 text-[11px] leading-relaxed text-violet-200/55">
          Play-money simulator for entertainment and UI study. No real currency, no deposits, no withdrawals.
          Balance and history are stored only in your browser.
        </p>
      </div>
    </div>
  );
}

function Rule({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-400/20 text-[11px] font-black text-amber-200 ring-1 ring-amber-300/40">
        {n}
      </span>
      <span>
        <span className="block text-sm font-black text-white">{title}</span>
        <span className="block text-[13px] leading-relaxed text-violet-100/70">{children}</span>
      </span>
    </li>
  );
}
