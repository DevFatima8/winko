"use client";

import React, { useState } from "react";
import { GamePhase } from "./lib/crashEngine";
import { soundEngine } from "./lib/soundEngine";
import { CheckCircle2, Flame, Minus, Plus, Zap } from "lucide-react";
import { useDailyPoolMode } from "@/lib/walletSync";

export interface BetPanelState {
  status?: string;
  stake: number;
  isBetPlaced: boolean; // Active in the current round
  isBetQueued: boolean; // Queued for the next round
  cashedOutAt: number | null;
  winAmount: number | null;
  autoBet: boolean;
  autoCashoutEnabled: boolean;
  autoCashoutTarget: number;
}

interface BetControlPanelProps {
  panelId: 1 | 2;
  phase: GamePhase;
  currentMultiplier: number;
  balance: number;
  state: BetPanelState;
  onUpdateState: (
    panelId: 1 | 2,
    updater: (prev: BetPanelState) => BetPanelState
  ) => void;
  onPlaceOrQueueBet: (panelId: 1 | 2) => void;
  onCancelBet: (panelId: 1 | 2) => void;
  onCashOut: (panelId: 1 | 2) => void;
}

import { BET_PRESETS } from "@/lib/betPresets";

export default function BetControlPanel({
  panelId,
  phase,
  currentMultiplier,
  balance,
  state,
  onUpdateState,
  onPlaceOrQueueBet,
  onCancelBet,
  onCashOut,
}: BetControlPanelProps) {
  const poolEnabled = useDailyPoolMode();
  const [tabMode, setTabMode] = useState<"MANUAL" | "AUTO">("MANUAL");

  const isLocked = state.isBetPlaced && !state.cashedOutAt;

  const setStakeSafe = (val: number) => {
    if (isLocked || state.isBetQueued) return;
    soundEngine.playClick();
    const clamped = Math.max(10, Math.round(val));
    onUpdateState(panelId, (prev) => ({ ...prev, stake: clamped }));
  };

  const adjustAutoTarget = (delta: number) => {
    soundEngine.playClick();
    onUpdateState(panelId, (prev) => {
      const next = Number(
        Math.max(1.1, Math.min(100, prev.autoCashoutTarget + delta)).toFixed(2)
      );
      return { ...prev, autoCashoutTarget: next };
    });
  };

  // Determine main action button appearance & handler
  const liveCashoutValue = Number((state.stake * currentMultiplier).toFixed(2));
  const canCashOutNow =
    phase === "IN_FLIGHT" && state.isBetPlaced && state.cashedOutAt === null;

  return (
    <div
      className={`relative rounded-xl bg-[#131C2E] border transition-all duration-200 p-3 sm:p-3.5 flex flex-col justify-between gap-2.5 ${
        canCashOutNow
          ? "border-[#FFB800] shadow-[0_0_25px_rgba(255,184,0,0.18)]"
          : state.cashedOutAt !== null
          ? "border-[#00E701]/70 shadow-[0_0_20px_rgba(0,231,1,0.15)]"
          : state.isBetPlaced || state.isBetQueued
          ? "border-[#FF2A4B]/60"
          : "border-[#1E2D4A]"
      }`}
    >
      {state.status && <div role="status" className="text-xs text-slate-300">{state.status}</div>}
      {/* Top Row: Panel Badge + Manual / Auto Switcher Pill */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              panelId === 1 ? "bg-[#00E701]" : "bg-[#38BDF8]"
            }`}
          />
          <span className="font-display font-bold text-xs uppercase tracking-wider text-[#94A3B8]">
            BET PANEL #{panelId}
          </span>
          {state.autoBet && (
            <span className="px-1.5 py-0.5 rounded bg-[#38BDF8]/15 border border-[#38BDF8]/40 text-[10px] font-mono-tabular text-[#38BDF8] font-semibold">
              AUTO-BET ON
            </span>
          )}
        </div>

        <div className="flex items-center bg-[#0B111E] p-0.5 rounded-lg border border-[#1E2D4A]">
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setTabMode("MANUAL");
            }}
            className={`px-3 py-1 rounded-md text-xs font-display font-bold uppercase tracking-wider transition-all ${
              tabMode === "MANUAL"
                ? "bg-[#1E2D4A] text-[#F8FAFC] shadow"
                : "text-[#94A3B8] hover:text-[#F8FAFC]"
            }`}
          >
            Bet
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setTabMode("AUTO");
            }}
            className={`px-3 py-1 rounded-md text-xs font-display font-bold uppercase tracking-wider transition-all flex items-center gap-1 ${
              tabMode === "AUTO"
                ? "bg-[#1E2D4A] text-[#38BDF8] shadow"
                : "text-[#94A3B8] hover:text-[#F8FAFC]"
            }`}
          >
            <Zap className="w-3 h-3" />
            Auto
          </button>
        </div>
      </div>

      {/* Middle Core Grid: Left Stake Controls + Right Big Casino Button */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-stretch">
        {/* Stake Stepper & Quick Chips (7 cols) */}
        <div className="sm:col-span-7 flex flex-col justify-between gap-2">
          {/* Stepper Input */}
          <div className="flex items-center justify-between bg-[#0B111E] border border-[#1E2D4A] rounded-lg px-2 py-1.5">
            <button
              type="button"
              disabled={isLocked || state.isBetQueued}
              onClick={() => setStakeSafe(state.stake - 50)}
              className="w-7 h-7 rounded-md bg-[#131C2E] hover:bg-[#1E2D4A] disabled:opacity-40 text-[#F8FAFC] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-center gap-1">
              <span className="text-xs font-mono-tabular text-[#94A3B8] font-semibold">
                Rs.
              </span>
              <input
                type="number"
                disabled={isLocked || state.isBetQueued}
                value={state.stake}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) {
                    onUpdateState(panelId, (prev) => ({
                      ...prev,
                      stake: Math.max(1, val),
                    }));
                  }
                }}
                className="w-20 text-center bg-transparent font-mono-tabular font-bold text-base text-[#F8FAFC] focus:outline-none disabled:opacity-60"
              />
            </div>

            <button
              type="button"
              disabled={isLocked || state.isBetQueued}
              onClick={() => setStakeSafe(state.stake + 50)}
              className="w-7 h-7 rounded-md bg-[#131C2E] hover:bg-[#1E2D4A] disabled:opacity-40 text-[#F8FAFC] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Chips Row */}
          <div className="grid grid-cols-7 gap-1">
            {BET_PRESETS.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={isLocked || state.isBetQueued}
                onClick={() => setStakeSafe(chip)}
                className="py-1 rounded bg-cyan-950/40 hover:bg-cyan-500/25 border border-cyan-500/40 text-[11px] font-mono-tabular font-bold text-cyan-300 disabled:opacity-40 transition-colors cursor-pointer"
              >
                {chip}
              </button>
            ))}
            <button
              type="button"
              disabled={isLocked || state.isBetQueued}
              onClick={() => setStakeSafe(state.stake * 2)}
              className="py-1 rounded bg-indigo-950/40 hover:bg-indigo-500/25 border border-indigo-500/40 text-[11px] font-mono-tabular font-bold text-indigo-300 disabled:opacity-40 transition-colors cursor-pointer"
            >
              2X
            </button>
            <button
              type="button"
              disabled={isLocked || state.isBetQueued}
              onClick={() => setStakeSafe(Math.floor(balance))}
              className="py-1 rounded bg-amber-950/40 hover:bg-amber-500/25 border border-amber-500/50 text-[11px] font-mono-tabular font-bold text-amber-300 disabled:opacity-40 transition-colors cursor-pointer"
            >
              MAX
            </button>
          </div>
        </div>

        {/* Primary Action Button (5 cols) */}
        <div className="sm:col-span-5 flex">
          {canCashOutNow ? (
            <button
              type="button"
              onClick={() => onCashOut(panelId)}
              className="w-full min-h-[76px] rounded-xl bg-gradient-to-b from-[#FFB800] to-[#E68A00] hover:from-[#FFC933] hover:to-[#F59E0B] text-[#070B14] font-display font-extrabold uppercase tracking-wider shadow-[0_6px_24px_rgba(255,184,0,0.45)] active:translate-y-0.5 transition-all flex flex-col items-center justify-center px-3 cursor-pointer border border-[#FEF08A]/60"
            >
              <span className="text-xs tracking-widest opacity-90 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 fill-current" />
                CASH OUT
              </span>
              <span className="font-mono-tabular text-lg sm:text-xl font-extrabold leading-tight">
                Rs.{" "}
                {liveCashoutValue.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="text-[10px] font-mono-tabular font-bold opacity-80">
                @ {currentMultiplier.toFixed(2)}x
              </span>
            </button>
          ) : state.cashedOutAt !== null ? (
            <div className="w-full min-h-[76px] rounded-xl bg-[#00E701]/15 border-2 border-[#00E701] text-[#00E701] flex flex-col items-center justify-center px-3 text-center">
              <div className="flex items-center gap-1 text-xs font-display font-bold uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4" />
                {poolEnabled ? "PENDING CLAIM @" : "WON @"} {state.cashedOutAt.toFixed(2)}x
              </div>
              <div className="font-mono-tabular text-base sm:text-lg font-extrabold text-[#F8FAFC] mt-0.5">
                +Rs.{" "}
                {(state.winAmount || 0).toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
          ) : state.isBetPlaced || state.isBetQueued ? (
            <button
              type="button"
              onClick={() => onCancelBet(panelId)}
              className="w-full min-h-[76px] rounded-xl bg-gradient-to-b from-[#FF2A4B] to-[#C81E3A] hover:from-[#FF4764] hover:to-[#E11D48] text-white font-display font-bold uppercase tracking-wider shadow-[0_6px_20px_rgba(255,42,75,0.35)] active:translate-y-0.5 transition-all flex flex-col items-center justify-center px-3 cursor-pointer border border-[#FDA4AF]/40"
            >
              <span className="text-base sm:text-lg font-extrabold leading-tight">
                CANCEL
              </span>
              <span className="text-[11px] font-mono-tabular opacity-90 mt-0.5">
                {state.isBetQueued
                  ? "Waiting for Next Over"
                  : `Rs. ${state.stake.toLocaleString("en-IN")} Staked`}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onPlaceOrQueueBet(panelId)}
              className="w-full min-h-[76px] rounded-xl bg-gradient-to-b from-[#00E701] to-[#00B801] hover:from-[#22FF22] hover:to-[#00D101] text-[#070B14] font-display font-extrabold uppercase tracking-wider shadow-[0_6px_24px_rgba(0,231,1,0.35)] active:translate-y-0.5 transition-all flex flex-col items-center justify-center px-3 cursor-pointer border border-[#86EFAC]/60"
            >
              <span className="text-lg sm:text-xl font-extrabold leading-tight">
                BET
              </span>
              <span className="font-mono-tabular text-xs sm:text-sm font-bold opacity-90">
                Rs. {state.stake.toLocaleString("en-IN")}
              </span>
              {phase !== "BETTING" && (
                <span className="text-[10px] uppercase tracking-wider opacity-75">
                  (Next Delivery)
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Bottom Bar: Auto Cash Out & Auto Bet Controls (Always visible in AUTO tab, compact in MANUAL tab) */}
      <div className="pt-2 border-t border-[#1E2D4A]/80 flex flex-wrap items-center justify-between gap-2 text-xs">
        {/* Auto Bet Switch */}
        {tabMode === "AUTO" && (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={state.autoBet}
              onChange={(e) => {
                soundEngine.playClick();
                onUpdateState(panelId, (prev) => ({
                  ...prev,
                  autoBet: e.target.checked,
                }));
              }}
              className="sr-only peer"
            />
            <div className="w-8 h-4 bg-[#0B111E] border border-[#1E2D4A] rounded-full peer peer-checked:bg-[#00E701] peer-checked:border-[#00E701] relative transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:after:translate-x-4" />
            <span className="text-[#94A3B8] font-medium">Auto Bet</span>
          </label>
        )}

        {/* Auto Cashout Toggle + Target Multiplier Input */}
        <div className="flex items-center justify-between w-full sm:w-auto flex-1 gap-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={state.autoCashoutEnabled}
              onChange={(e) => {
                soundEngine.playClick();
                onUpdateState(panelId, (prev) => ({
                  ...prev,
                  autoCashoutEnabled: e.target.checked,
                }));
              }}
              className="sr-only peer"
            />
            <div className="w-8 h-4 bg-[#0B111E] border border-[#1E2D4A] rounded-full peer peer-checked:bg-[#38BDF8] peer-checked:border-[#38BDF8] relative transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:after:translate-x-4" />
            <span className="text-[#94A3B8] font-medium">Auto Cash Out</span>
          </label>

          <div className="flex items-center gap-1 bg-[#0B111E] border border-[#1E2D4A] rounded-md px-1.5 py-0.5">
            <button
              type="button"
              onClick={() => adjustAutoTarget(-0.1)}
              className="text-[#94A3B8] hover:text-[#F8FAFC] px-1 cursor-pointer"
            >
              -
            </button>
            <input
              type="number"
              step="0.1"
              min="1.1"
              max="100"
              value={state.autoCashoutTarget}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) {
                  onUpdateState(panelId, (prev) => ({
                    ...prev,
                    autoCashoutTarget: Math.max(1.05, Math.min(100, val)),
                  }));
                }
              }}
              className="w-12 text-center bg-transparent font-mono-tabular font-bold text-xs text-[#38BDF8] focus:outline-none"
            />
            <span className="text-[11px] font-mono-tabular text-[#94A3B8]">
              x
            </span>
            <button
              type="button"
              onClick={() => adjustAutoTarget(0.1)}
              className="text-[#94A3B8] hover:text-[#F8FAFC] px-1 cursor-pointer"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
