"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { BET_PRESETS } from "@/lib/betPresets";
import { MAX_PICKS, RISK_LEVELS, type RiskLevel } from "@/lib/keno";

export type AutoConfig = {
  numberOfBets: string;
  onWinReset: boolean;
  onWinPercent: string;
  onLossReset: boolean;
  onLossPercent: string;
  stopOnProfit: string;
  stopOnLoss: string;
  speed: "normal" | "fast" | "turbo";
};

type Props = {
  mode: "manual" | "auto";
  onModeChange: (mode: "manual" | "auto") => void;
  bet: string;
  onBetChange: (value: string) => void;
  onHalve: () => void;
  onDouble: () => void;
  onMax: () => void;
  risk: RiskLevel;
  onRiskChange: (risk: RiskLevel) => void;
  picks: number;
  profitOnWin: number;
  canBet: boolean;
  busy: boolean;
  autoRunning: boolean;
  onBet: () => void;
  onStartAuto: () => void;
  onStopAuto: () => void;
  auto: AutoConfig;
  onAutoChange: (patch: Partial<AutoConfig>) => void;
  error: string | null;
};

function FieldLabel({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1 flex items-end justify-between">
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#b1c2cf]">
        {children}
      </span>
      {hint ? (
        <span className="text-[10px] font-semibold text-[#6f8f9f]">{hint}</span>
      ) : null}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-[#2f4553] bg-[#0f212e] px-3 py-2 font-mono text-sm font-semibold tabular-nums text-white outline-none transition-colors focus:border-[#00e701] disabled:opacity-60";

function NumberInput({
  value,
  onChange,
  disabled,
  min = 0,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  min?: number;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min={min}
      step="any"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
    />
  );
}

function RiskSelect({
  value,
  onChange,
  disabled,
}: {
  value: RiskLevel;
  onChange: (v: RiskLevel) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md border border-[#2f4553] bg-[#0f212e] px-3 py-2 text-sm font-semibold capitalize text-white transition-colors hover:border-[#4a6d80] disabled:opacity-60"
      >
        {value}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={cn("transition-transform", open && "rotate-180")}
        >
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>
      {open ? (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-md bg-[#1a2c38] py-1 shadow-[0_10px_30px_rgba(0,0,0,0.5)] ring-1 ring-[#2f4553]">
          {RISK_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => {
                onChange(level);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold capitalize transition-colors hover:bg-[#2f4553]",
                level === value ? "text-[#00e701]" : "text-[#b1c2cf]",
              )}
            >
              {level}
              {level === value ? <span className="text-xs">✓</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1 rounded-md bg-[#0f212e] p-1 ring-1 ring-[#2f4553]">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex-1 rounded px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors disabled:opacity-50",
            value === option.value
              ? "bg-[#1a2c38] text-white"
              : "text-[#b1c2cf] hover:text-white",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function BetPanel(props: Props) {
  const {
    mode,
    onModeChange,
    bet,
    onBetChange,
    onHalve,
    onDouble,
    onMax,
    risk,
    onRiskChange,
    picks,
    profitOnWin,
    canBet,
    busy,
    autoRunning,
    onBet,
    onStartAuto,
    onStopAuto,
    auto,
    onAutoChange,
    error,
  } = props;

  return (
    <div className="flex w-full shrink-0 flex-col gap-3 p-3 sm:p-4 lg:w-[320px]">
      <div className="flex gap-1 rounded-md bg-[#0f212e] p-1 ring-1 ring-[#2f4553]">
        {(["manual", "auto"] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={autoRunning}
            onClick={() => onModeChange(m)}
            className={cn(
              "flex-1 rounded py-2 text-sm font-bold transition-colors disabled:opacity-50",
              mode === m
                ? "bg-[#1a2c38] text-white"
                : "text-[#b1c2cf] hover:bg-[#1a2c38]/60 hover:text-white",
            )}
          >
            {m === "manual" ? "Manual" : "Auto"}
          </button>
        ))}
      </div>

      <div>
        <FieldLabel hint="Rs.">Bet Amount</FieldLabel>
        <div className="flex items-stretch overflow-hidden rounded-md border border-[#2f4553] bg-[#0f212e] focus-within:border-[#00e701]">
          <span className="grid w-8 place-items-center text-sm font-bold text-[#b1c2cf]">
            Rs
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={bet}
            disabled={autoRunning}
            onChange={(e) => onBetChange(e.target.value)}
            className="min-w-0 flex-1 bg-transparent py-2 font-mono text-sm font-semibold tabular-nums text-white outline-none"
          />
          <button
            type="button"
            disabled={autoRunning}
            onClick={onHalve}
            className="border-l border-[#0f212e] bg-amber-950/60 px-2.5 text-xs font-bold text-amber-300 transition-colors hover:bg-amber-900/60 active:scale-95 disabled:opacity-50"
          >
            ½
          </button>
          <button
            type="button"
            disabled={autoRunning}
            onClick={onDouble}
            className="border-l border-[#0f212e] bg-indigo-950/60 px-2.5 text-xs font-bold text-indigo-300 transition-colors hover:bg-indigo-900/60 active:scale-95 disabled:opacity-50"
          >
            2×
          </button>
          <button
            type="button"
            disabled={autoRunning}
            onClick={onMax}
            className="border-l border-[#0f212e] bg-emerald-950/60 px-2.5 text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-900/60 active:scale-95 disabled:opacity-50"
          >
            Max
          </button>
        </div>
        <div className="mt-1.5 grid grid-cols-5 gap-1">
          {BET_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={autoRunning}
              onClick={() => onBetChange(String(p))}
              className="rounded-md border border-[#2f4553] bg-[#0f212e] py-1.5 text-xs font-bold text-[#b1c2cf] transition-colors hover:border-[#00e701] hover:text-white active:scale-95 disabled:opacity-50"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel hint={`${picks}/${MAX_PICKS} selected`}>Risk</FieldLabel>
        <RiskSelect value={risk} onChange={onRiskChange} disabled={autoRunning} />
      </div>

      <div>
        <FieldLabel hint="all picks hit">Profit on Win</FieldLabel>
        <div className="flex items-center rounded-md border border-[#2f4553] bg-[#0f212e]/60 px-3 py-2">
          <span className="mr-1 text-sm font-bold text-[#b1c2cf]">Rs</span>
          <span className="font-mono text-sm font-semibold tabular-nums text-white">
            {profitOnWin.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
      </div>

      {mode === "auto" ? (
        <>
          <div>
            <FieldLabel hint="0 = ∞">Number of Bets</FieldLabel>
            <NumberInput
              value={auto.numberOfBets}
              onChange={(v) => onAutoChange({ numberOfBets: v })}
              disabled={autoRunning}
              min={0}
            />
          </div>

          <div className="flex flex-col gap-2 rounded-md bg-[#0f212e]/50 p-2.5 ring-1 ring-[#2f4553]/60">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#6f8f9f]">
              Advanced
            </span>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-[#b1c2cf]">On Win</span>
              <Segmented
                options={[
                  { value: "reset", label: "Reset" },
                  { value: "increase", label: "Increase" },
                ]}
                value={auto.onWinReset ? "reset" : "increase"}
                onChange={(v) => onAutoChange({ onWinReset: v === "reset" })}
                disabled={autoRunning}
              />
              {!auto.onWinReset ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <NumberInput
                      value={auto.onWinPercent}
                      onChange={(v) => onAutoChange({ onWinPercent: v })}
                      disabled={autoRunning}
                    />
                  </div>
                  <span className="text-xs font-bold text-[#b1c2cf]">% bet</span>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-[#b1c2cf]">On Loss</span>
              <Segmented
                options={[
                  { value: "reset", label: "Reset" },
                  { value: "increase", label: "Increase" },
                ]}
                value={auto.onLossReset ? "reset" : "increase"}
                onChange={(v) => onAutoChange({ onLossReset: v === "reset" })}
                disabled={autoRunning}
              />
              {!auto.onLossReset ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <NumberInput
                      value={auto.onLossPercent}
                      onChange={(v) => onAutoChange({ onLossPercent: v })}
                      disabled={autoRunning}
                    />
                  </div>
                  <span className="text-xs font-bold text-[#b1c2cf]">% bet</span>
                </div>
              ) : null}
            </div>

            <div>
              <FieldLabel>Stop on Profit</FieldLabel>
              <NumberInput
                value={auto.stopOnProfit}
                onChange={(v) => onAutoChange({ stopOnProfit: v })}
                disabled={autoRunning}
              />
            </div>

            <div>
              <FieldLabel>Stop on Loss</FieldLabel>
              <NumberInput
                value={auto.stopOnLoss}
                onChange={(v) => onAutoChange({ stopOnLoss: v })}
                disabled={autoRunning}
              />
            </div>

            <div>
              <FieldLabel>Speed</FieldLabel>
              <Segmented
                options={[
                  { value: "normal", label: "Normal" },
                  { value: "fast", label: "Fast" },
                  { value: "turbo", label: "Turbo" },
                ]}
                value={auto.speed}
                onChange={(v) =>
                  onAutoChange({ speed: v as AutoConfig["speed"] })
                }
                disabled={autoRunning}
              />
            </div>
          </div>
        </>
      ) : null}

      {error ? (
        <p className="rounded-md bg-[#ed3333]/10 px-2 py-1.5 text-[11px] font-semibold text-[#ff6b6b]">
          {error}
        </p>
      ) : null}

      {mode === "manual" ? (
        <button
          type="button"
          onClick={onBet}
          disabled={!canBet || busy}
          className="mt-auto h-11 sm:h-[50px] w-full rounded-xl bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 text-[15px] font-black uppercase tracking-[0.08em] text-slate-950 shadow-lg shadow-emerald-500/30 transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Bet
        </button>
      ) : (
        <button
          type="button"
          onClick={autoRunning ? onStopAuto : onStartAuto}
          disabled={!autoRunning && !canBet}
          className={cn(
            "mt-auto h-11 sm:h-[50px] w-full rounded-xl text-[15px] font-black uppercase tracking-[0.08em] shadow-lg transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
            autoRunning
              ? "bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-rose-600/30 hover:brightness-110"
              : "bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 text-slate-950 shadow-emerald-500/30 hover:brightness-110",
          )}
        >
          {autoRunning ? "Stop Autobet" : "Start Autobet"}
        </button>
      )}
    </div>
  );
}
