"use client";

import type { ReactNode } from "react";

import { BET_PRESETS } from "@/lib/betPresets";
import { sfx } from "./lib/sound";
import { MIN_BET, formatMoney } from "./lib/wheel";

const CHIPS: readonly number[] = BET_PRESETS;

type BetPanelProps = {
  bet: number;
  onBetChange: (value: number) => void;
  balance: number;
  spinning: boolean;
  autoActive: boolean;
  autoRemaining: number;
  turbo: boolean;
  onTurboChange: (v: boolean) => void;
  autoCount: number;
  onAutoCountChange: (v: number) => void;
  onStartAuto: () => void;
  onStopAuto: () => void;
  onSpin: () => void;
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </span>
      {children}
    </div>
  );
}

export default function BetPanel({
  bet,
  onBetChange,
  balance,
  spinning,
  autoActive,
  autoRemaining,
  turbo,
  onTurboChange,
  autoCount,
  onAutoCountChange,
  onStartAuto,
  onStopAuto,
  onSpin,
}: BetPanelProps) {
  const clamp = (v: number) => Math.max(MIN_BET, Math.round(v * 100) / 100);

  const set = (v: number) => {
    sfx.chip();
    onBetChange(clamp(v));
  };

  const disabled = bet > balance || balance < MIN_BET;

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3.5 rounded-2xl sm:rounded-3xl border border-white/10 bg-[linear-gradient(160deg,rgba(30,40,68,0.9),rgba(12,17,32,0.92))] p-3 sm:p-4 shadow-[0_20px_50px_rgba(0,0,0,0.45)] backdrop-blur">
      <div className="flex items-center justify-between">
        <h2 className="text-xs sm:text-sm font-black uppercase tracking-[0.2em] text-slate-200">Place your bet</h2>
      </div>

      {/* bet amount */}
      <div className="rounded-xl sm:rounded-2xl border border-white/10 bg-black/30 p-2 sm:p-2.5">
        <Row label="Bet amount">
          <span className="text-[0.6rem] font-semibold text-slate-500">
            max {formatMoney(Math.max(0, Math.floor(balance)))}
          </span>
        </Row>
        <div className="mt-1.5 flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            aria-label="Decrease bet"
            onClick={() => set(bet - 1)}
            className="grid h-8 sm:h-9 w-8 sm:w-9 shrink-0 place-items-center rounded-lg sm:rounded-xl bg-white/5 text-base sm:text-lg font-bold text-slate-300 ring-1 ring-white/10 transition hover:bg-white/10 active:scale-95"
          >
            −
          </button>
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs sm:text-sm font-bold text-slate-500">
              Rs
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={MIN_BET}
              max={Math.max(MIN_BET, Math.floor(balance))}
              value={Number.isFinite(bet) ? bet : ""}
              onChange={(e) => onBetChange(Number(e.target.value))}
              onBlur={() => set(bet || MIN_BET)}
              className="h-8 sm:h-9 w-full rounded-lg sm:rounded-xl border border-white/10 bg-[#0a0f1c] pl-6 pr-2.5 text-right text-sm sm:text-base font-bold tabular-nums text-white outline-none transition focus:border-amber-300/50 focus:ring-2 focus:ring-amber-300/20"
              style={{ fontFamily: "var(--font-num)" }}
            />
          </div>
          <button
            type="button"
            aria-label="Increase bet"
            onClick={() => set(bet + 1)}
            className="grid h-8 sm:h-9 w-8 sm:w-9 shrink-0 place-items-center rounded-lg sm:rounded-xl bg-white/5 text-base sm:text-lg font-bold text-slate-300 ring-1 ring-white/10 transition hover:bg-white/10 active:scale-95"
          >
            +
          </button>
        </div>

        <div className="mt-2 grid grid-cols-5 gap-1">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => set(c)}
              className="rounded-lg bg-gradient-to-b from-white/10 to-white/5 py-1 sm:py-1.5 text-[0.65rem] sm:text-[0.7rem] font-bold text-slate-200 border border-white/15 transition hover:border-amber-400/60 hover:text-amber-300 active:scale-95"
              style={{ fontFamily: "var(--font-num)" }}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-3 gap-1">
          <button
            type="button"
            onClick={() => set(bet / 2)}
            className="rounded-lg bg-white/5 py-1 text-[0.65rem] font-bold text-slate-300 ring-1 ring-white/10 transition hover:bg-white/10 active:scale-95"
          >
            ½
          </button>
          <button
            type="button"
            onClick={() => set(bet * 2)}
            className="rounded-lg bg-white/5 py-1 text-[0.65rem] font-bold text-slate-300 ring-1 ring-white/10 transition hover:bg-white/10 active:scale-95"
          >
            2×
          </button>
          <button
            type="button"
            onClick={() => set(Math.floor(balance))}
            className="rounded-lg bg-white/5 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-slate-300 ring-1 ring-white/10 transition hover:bg-white/10 active:scale-95"
          >
            Max
          </button>
        </div>
      </div>

      {/* payout preview */}
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { m: 2, tone: "text-emerald-300", bg: "from-emerald-500/10 to-transparent" },
          { m: 3, tone: "text-violet-300", bg: "from-violet-500/10 to-transparent" },
          { m: 5, tone: "text-amber-300", bg: "from-amber-500/10 to-transparent" },
        ].map(({ m, tone, bg }) => (
          <div
            key={m}
            className={`rounded-xl border border-white/10 bg-gradient-to-b ${bg} bg-black/25 px-1.5 py-1.5 text-center`}
          >
            <div className={`text-[0.65rem] sm:text-xs font-black ${tone}`} style={{ fontFamily: "var(--font-num)" }}>
              {m}×
            </div>
            <div
              className="mt-0.5 truncate text-[0.65rem] sm:text-[0.7rem] font-bold text-slate-300"
              style={{ fontFamily: "var(--font-num)" }}
            >
              {formatMoney(bet * m)}
            </div>
          </div>
        ))}
      </div>

      {/* options */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={() => {
            sfx.click();
            onTurboChange(!turbo);
          }}
          className={`flex-1 rounded-xl px-2.5 py-2 text-[0.62rem] sm:text-[0.68rem] font-bold uppercase tracking-[0.14em] ring-1 transition ${turbo
              ? "bg-gradient-to-r from-amber-500/25 to-yellow-500/25 text-amber-200 ring-amber-300/50 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
              : "bg-white/5 text-slate-400 ring-white/10 hover:bg-white/10"
            }`}
        >
          ⚡ Turbo
        </button>
        <div className="flex items-center gap-1.5 rounded-xl bg-white/5 px-2 py-1.5 ring-1 ring-white/10">
          <span className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-slate-400">
            Auto
          </span>
          <select
            value={autoCount}
            onChange={(e) => onAutoCountChange(Number(e.target.value))}
            className="rounded-md bg-[#0a0f1c] px-1.5 py-0.5 text-[0.65rem] sm:text-[0.7rem] font-bold text-slate-200 outline-none ring-1 ring-white/10"
            style={{ fontFamily: "var(--font-num)" }}
          >
            {[5, 10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* main action */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSpin}
          disabled={disabled}
          className="relative flex-1 overflow-hidden rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 text-xs sm:text-sm font-black uppercase tracking-[0.18em] text-[#20140a] shadow-[0_0_24px_rgba(255,190,80,0.55)] border border-amber-300/60 transition active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          style={{ background: "linear-gradient(180deg,#ffe9a8,#ffbf3c 45%,#e08a0c)" }}
        >
          <span className="relative z-10">
            {bet > balance ? "Low Balance" : spinning ? "Queue Next Round" : "Place Bet"}
          </span>
          <span className="absolute inset-0 bg-[linear-gradient(115deg,transparent_35%,rgba(255,255,255,0.6)_50%,transparent_65%)] bg-[length:250%_100%] animate-shine" />
        </button>
        {autoActive ? (
          <button
            type="button"
            onClick={onStopAuto}
            className="rounded-xl sm:rounded-2xl bg-gradient-to-r from-rose-600 via-red-600 to-pink-600 px-3 sm:px-4 py-2.5 sm:py-3.5 text-xs font-black uppercase tracking-[0.14em] text-white shadow-[0_0_16px_rgba(225,29,72,0.5)] border border-rose-400/50 transition hover:brightness-110 active:scale-95"
          >
            Stop {autoRemaining > 0 ? autoRemaining : ""}
          </button>
        ) : (
          <button
            type="button"
            onClick={onStartAuto}
            disabled={disabled}
            className="rounded-xl sm:rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-blue-600 px-3 sm:px-4 py-2.5 sm:py-3.5 text-xs font-black uppercase tracking-[0.14em] text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] border border-indigo-400/50 transition hover:brightness-110 disabled:opacity-40 active:scale-95"
          >
            Auto ▶
          </button>
        )}
      </div>
    </div>
  );
}
