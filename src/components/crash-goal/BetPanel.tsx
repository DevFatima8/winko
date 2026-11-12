import { useEffect, useRef, useState } from "react";
import { formatMoney, formatMultiplier } from "./lib/crash";
import { useDailyPoolMode } from "@/lib/walletSync";

export interface BetPanelProps {
  index: number;
  amount: number;
  autoTarget: number;
  autoEnabled: boolean;
  placed: boolean;
  cashedOutAt: number | null;
  phase: "betting" | "flying" | "crashed";
  balance: number;
  onAmountChange: (value: number) => void;
  onTargetChange: (value: number) => void;
  onToggleAuto: () => void;
  onPrimaryAction: () => void;
}

import { BET_PRESETS } from "@/lib/betPresets";

function CycleIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
    >
      <path d="M3.5 12a8.5 8.5 0 1 0 2.9-6.4" />
      <path d="M3 3.2v5h5" />
    </svg>
  );
}

export function BetPanel({
  amount,
  autoTarget,
  autoEnabled,
  placed,
  cashedOutAt,
  phase,
  balance,
  onAmountChange,
  onTargetChange,
  onToggleAuto,
  onPrimaryAction,
}: BetPanelProps) {
  const poolEnabled = useDailyPoolMode();
  const [editing, setEditing] = useState<"amount" | "target" | null>(null);
  const [draftAmount, setDraftAmount] = useState(String(amount));
  const [draftTarget, setDraftTarget] = useState(autoTarget.toFixed(2));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) return;
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setEditing(null);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [editing]);

  const flying = phase === "flying";
  const isCashOut = placed && flying && cashedOutAt === null;
  const isCancel = placed && phase === "betting";
  const disabled = false;

  /** Big green button label — matches the reference art. */
  const label = isCashOut ? "Cash Out" : isCancel ? "Cancel" : phase !== "betting" ? "Bet next round" : "Start";

  const commitAmount = (raw: string) => {
    const next = Number(raw.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(next) && next > 0) {
      onAmountChange(Math.round(next * 100) / 100);
    }
    setEditing(null);
  };

  const commitTarget = (raw: string) => {
    const next = Number(raw.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(next) && next >= 1.01) {
      onTargetChange(Math.min(500, Math.round(next * 100) / 100));
    }
    setEditing(null);
  };

  /* ---- big action button gradient ---- */
  const greenStyle: React.CSSProperties = disabled
    ? {
        background: "linear-gradient(180deg,#334155 0%,#1e293b 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 0 rgba(0,0,0,0.3)",
      }
    : isCashOut
      ? {
          background: "linear-gradient(180deg,#fde047 0%,#f59e0b 50%,#d97706 100%)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.7), 0 5px 0 #b45309, 0 10px 25px rgba(245,158,11,0.55)",
        }
      : isCancel
        ? {
            background: "linear-gradient(180deg,#f87171 0%,#ef4444 50%,#b91c1c 100%)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.6), 0 5px 0 #991b1b, 0 10px 22px rgba(239,68,68,0.45)",
          }
        : {
            background: "linear-gradient(180deg,#4ade80 0%,#22c55e 50%,#15803d 100%)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.65), 0 5px 0 #166534, 0 10px 24px rgba(34,197,94,0.45)",
          };

  return (
    <div ref={rootRef} className="relative w-full min-w-0 max-w-[228px]">
      {/* big green action button */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label={label}
        onClick={() => !disabled && onPrimaryAction()}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPrimaryAction();
          }
        }}
        className={`w-full select-none rounded-[14px] transition-transform duration-100 active:translate-y-[3px] ${
          isCashOut ? "animate-[cg-pulse_1.1s_ease-in-out_infinite]" : ""
        } ${disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
        style={greenStyle}
      >
        <div className="flex flex-col items-center justify-center px-3 pb-2.5 pt-2">
          <span className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-white/95">
            {label}
          </span>
          <button
            type="button"
            title="Edit bet amount"
            onClick={(e) => {
              e.stopPropagation();
              setDraftAmount(String(amount));
              setEditing(editing === "amount" ? null : "amount");
            }}
            className="mt-0.5 rounded px-2 text-[24px] font-black leading-none tabular-nums text-white underline-offset-4 hover:underline focus:underline focus:outline-none"
          >
            {formatMoney(amount)}
          </button>
        </div>
      </div>

      {/* status line */}
      <div className="mt-1.5 h-[16px] text-center text-[11px] font-bold">
        {placed && cashedOutAt !== null && (
          <span className="text-emerald-700">
            {poolEnabled ? "Daily payout pending · claim" : "WON"} {formatMoney(amount * cashedOutAt)} @ {formatMultiplier(cashedOutAt)}x
          </span>
        )}
        {placed && phase === "crashed" && cashedOutAt === null && (
          <span className="text-rose-600">{poolEnabled ? "Daily payout pending · provisional claim 0" : ""}</span>
        )}
        {!placed && phase === "betting" && amount > balance && (
          <span className="text-amber-600">Not enough balance</span>
        )}
      </div>

      {/* blue cash-out row */}
      <button
        type="button"
        onClick={() => {
          setDraftTarget(autoTarget.toFixed(2));
          setEditing(editing === "target" ? null : "target");
        }}
        className="mt-1 flex w-full items-center justify-between rounded-lg border border-[#b6d4ea] bg-[#e2eef9] px-2.5 py-1.5 text-[11px] font-bold text-[#1b4f86] transition-colors hover:border-[#8fbfe4] hover:bg-[#d3e7f8]"
      >
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3.2 2" strokeLinecap="round" />
          </svg>
          Cash Out
        </span>
        <span
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-black tabular-nums ${
            autoEnabled ? "bg-[#1b4f86] text-white" : "bg-[#c3d6e6] text-[#4a6b88]"
          }`}
        >
          {autoEnabled ? `${formatMultiplier(autoTarget)}x` : "OFF"}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
            <circle cx="12" cy="12" r="3.1" />
            <path
              d="M12 2.6v3M12 18.4v3M21.4 12h-3M5.6 12h-3M18.6 5.4l-2.1 2.1M7.5 16.5l-2.1 2.1M18.6 18.6l-2.1-2.1M7.5 7.5L5.4 5.4"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </button>

      {/* editor popover */}
      {editing && (
        <div className="absolute bottom-[calc(100%+10px)] left-1/2 z-50 w-[252px] -translate-x-1/2 rounded-xl border border-[#c6d9ea] bg-white p-3 shadow-[0_18px_40px_rgba(15,45,80,0.28)]">
          {editing === "amount" ? (
            <>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                Bet amount
              </div>
              <div className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(0.1, Math.round((amount / 2) * 100) / 100);
                    onAmountChange(next);
                    setDraftAmount(String(next));
                  }}
                  className="h-9 w-9 shrink-0 rounded-lg bg-[#e2eef9] text-[15px] font-black text-[#1b4f86]"
                >
                  ½
                </button>
                <input
                  autoFocus
                  value={draftAmount}
                  onChange={(e) => setDraftAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitAmount(draftAmount);
                  }}
                  className="h-9 w-full rounded-lg border border-[#c6d9ea] bg-[#f6fafe] px-2 text-center text-[15px] font-extrabold tabular-nums text-slate-800 outline-none focus:border-[#2f92dd]"
                  inputMode="decimal"
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.round(amount * 2 * 100) / 100;
                    onAmountChange(next);
                    setDraftAmount(String(next));
                  }}
                  className="h-9 w-9 shrink-0 rounded-lg bg-[#e2eef9] text-[15px] font-black text-[#1b4f86]"
                >
                  2×
                </button>
              </div>
              <div className="flex gap-1.5">
                {BET_PRESETS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      onAmountChange(q);
                      setDraftAmount(String(q));
                    }}
                    className="flex-1 rounded-md bg-[#eaf2fa] py-1.5 text-[11px] font-bold text-[#1b4f86] hover:bg-[#dbeaf8]"
                  >
                    {q}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.floor(balance * 100) / 100;
                    onAmountChange(next);
                    setDraftAmount(String(next));
                  }}
                  className="flex-1 rounded-md bg-[#2f92dd] py-1.5 text-[11px] font-bold text-white hover:bg-[#2b83c8]"
                >
                  MAX
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  Auto cash out
                </span>
                <button
                  type="button"
                  onClick={onToggleAuto}
                  className={`rounded-md px-2 py-0.5 text-[10px] font-black ${
                    autoEnabled ? "bg-[#22a447] text-white" : "bg-[#dfe8f0] text-slate-500"
                  }`}
                >
                  {autoEnabled ? "ON" : "OFF"}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(1.01, Math.round((autoTarget - 0.1) * 100) / 100);
                    onTargetChange(next);
                    setDraftTarget(next.toFixed(2));
                  }}
                  className="h-9 w-9 shrink-0 rounded-lg bg-[#e2eef9] text-[17px] font-black text-[#1b4f86]"
                >
                  −
                </button>
                <input
                  autoFocus
                  value={draftTarget}
                  onChange={(e) => setDraftTarget(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitTarget(draftTarget);
                  }}
                  className="h-9 w-full rounded-lg border border-[#c6d9ea] bg-[#f6fafe] px-2 text-center text-[15px] font-extrabold tabular-nums text-slate-800 outline-none focus:border-[#2f92dd]"
                  inputMode="decimal"
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.min(500, Math.round((autoTarget + 0.1) * 100) / 100);
                    onTargetChange(next);
                    setDraftTarget(next.toFixed(2));
                  }}
                  className="h-9 w-9 shrink-0 rounded-lg bg-[#e2eef9] text-[17px] font-black text-[#1b4f86]"
                >
                  +
                </button>
              </div>
              <div className="mt-2 flex gap-1.5">
                {[1.5, 2, 3, 5, 10].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      onTargetChange(q);
                      setDraftTarget(q.toFixed(2));
                    }}
                    className="flex-1 rounded-md bg-[#eaf2fa] py-1.5 text-[11px] font-bold text-[#1b4f86] hover:bg-[#dbeaf8]"
                  >
                    {q.toFixed(2)}x
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Round edge buttons flanking the two bet panels. */
export function EdgeButton({ onClick }: { side?: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Repeat last bet"
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#b6d4ea] bg-[#e2eef9] text-[#1b4f86] shadow-[0_3px_10px_rgba(20,60,100,0.18)] transition-transform hover:scale-105 active:scale-95"
    >
      <CycleIcon size={18} />
    </button>
  );
}
