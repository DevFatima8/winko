"use client";
import { gameSfx } from "@/lib/gameSfx";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMultiplayerGame } from "@/lib/useMultiplayerGame";
import { poolRoundMessage } from "@/lib/multiplayer-types";
import { LiveMultiplayerBets } from "@/components/LiveMultiplayerBets";
import type { SevenOutcome } from "@/lib/multiplayer-rules";
import { BET_PRESETS } from "@/lib/betPresets";
import DiceFace from "./DiceFace";
import Chip from "./Chip";
import { sfx } from "./lib/sound";
import "./7-up-down.css";

type BetArea = "down" | "lucky" | "up";
type Phase = "betting" | "rolling" | "result";

type Bet = {
  area: BetArea;
  amount: number;
};

type RoundResult = {
  id: number;
  dice: [number, number];
  total: number;
  bets: Bet[];
  payout: number; // net (positive = win, negative = loss)
  outcome: "win" | "loss" | "tie";
  poolMessage?: string;
};

const CHIP_VALUES: number[] = [...BET_PRESETS];
const BET_DURATION = 10;

export default function SevenUpDown({ backHref }: { backHref?: string }) {
  const live = useMultiplayerGame<SevenOutcome>("7-up-down");
  const [chipValue, setChipValue] = useState<number>(BET_PRESETS[0]);
  const [history, setHistory] = useState<RoundResult[]>([]);
  const [score, setScore] = useState({ wins: 0, losses: 0 });
  const [showRules, setShowRules] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const seen = useRef(new Set<number>());
  const balance = live.state?.balance ?? 0;
  const phase: Phase = live.state?.round.phase === "running" ? "rolling" : live.state?.round.phase ?? "betting";
  const roundNo = live.state?.round.roundNo ?? 0;
  const timeLeft = Math.max(0, Math.ceil(((live.state?.round.bettingEndsAt ?? live.now) - live.now) / 1000));
  const diceValues: [number, number] = live.state?.round.result?.dice ?? live.state?.history[0]?.result.dice ?? [1, 1];
  const current = live.state?.myBets.filter(b => b.status !== "cancelled") ?? [];
  const queued = live.state?.myQueuedBets.filter(b => b.status === "pending") ?? [];
  const bets: Bet[] = current.map(b => ({ area: b.option as BetArea, amount: b.amount }));
  const totalWagered = bets.reduce((sum, b) => sum + b.amount, 0);
  const lastResult = phase === "result" ? history.find(h => h.id === roundNo) ?? null : null;
  const { wins, losses } = score;

  useEffect(() => {
    const state = live.state;
    if (!state?.round.result || seen.current.has(state.round.roundNo)) return;
    const personal = state.myBets.filter(b => (b.status === "win" || b.status === "lose") && b.amount > 0);
    if (!personal.length) return;
    const outcome = state.round.result;
    const timer = setTimeout(() => {
      if (seen.current.has(state.round.roundNo)) return;
      seen.current.add(state.round.roundNo);
      const payout = personal.reduce((sum, b) => sum + b.payout - b.amount, 0);
      const result: RoundResult = { id: state.round.roundNo, dice: outcome.dice, total: outcome.total,
        bets: personal.map(b => ({ area: b.option as BetArea, amount: b.amount })), payout,
        outcome: payout > 0 ? "win" : payout < 0 ? "loss" : "tie", poolMessage: poolRoundMessage(personal) ?? undefined };
      setHistory(h => [result, ...h].slice(0, 30));
      if (result.poolMessage) return;
      setScore(s => ({ wins: s.wins + (payout > 0 ? 1 : 0), losses: s.losses + (payout < 0 ? 1 : 0) }));
      if (soundOn) { if (payout > 0) gameSfx.win(); else if (payout < 0) gameSfx.lose(); }
    }, 0);
    return () => clearTimeout(timer);
  }, [live.state, soundOn]);

  async function placeBet(area: BetArea) {
    if (live.busy || !live.state) return;
    const reply = await live.place(area, chipValue);
    if (!("error" in reply) && soundOn) sfx.chip();
  }
  function undoLastBet() {
    const bet = current[current.length - 1];
    if (bet && phase === "betting") void live.cancel(roundNo, bet.id);
  }
  function clearBets() { if (phase === "betting") void live.cancel(roundNo); }
  function newRound() { void live.refresh(); }
  // Helpers
  const betOn = (area: BetArea) => bets.filter((b) => b.area === area).reduce((s, b) => s + b.amount, 0);
  const totalPlaced = bets.length;

  const progressPct = Math.min(100, (timeLeft / BET_DURATION) * 100);

  return (
    <div className="seven-up-down-container h-full w-full flex flex-col min-h-0 overflow-y-auto overflow-x-hidden text-white">
      <div className="shrink-0 px-2 py-1"><LiveMultiplayerBets state={live.state} error={live.error} />
        {queued.length > 0 && <button type="button" disabled={live.busy} onClick={() => void live.cancel(roundNo + 1)}>Cancel next-round bets</button>}
      </div>
      {/* Top bar */}
      <header className="flex-shrink-0 w-full bg-black/40 border-b border-white/10 px-3 py-2 sm:px-6 sm:py-3 z-10 backdrop-blur">
        <div className="mx-auto max-w-6xl flex flex-wrap gap-2 items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href={backHref || "/player"}
              className="flex items-center gap-1 text-xs font-semibold text-amber-300/90 hover:text-amber-200 bg-white/5 hover:bg-white/10 border border-amber-400/30 px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
            >
              ← <span className="hidden sm:inline">Back</span>
            </Link>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-yellow-300 to-amber-600 grid place-items-center text-black font-extrabold shadow-lg text-sm sm:text-base">
              7
            </div>
            <div>
              <h1 className="text-base sm:text-xl font-extrabold tracking-wide">
                7 <span className="text-yellow-300">UP</span> DOWN
              </h1>
              <p className="hidden text-[10px] uppercase text-white/50 sm:block">Dice Casino</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setShowRules((s) => !s)}
              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white/80 border border-white/10 transition-all active:scale-95"
            >
              {showRules ? "Close" : "Rules"}
            </button>
            <button
              onClick={() => setSoundOn((s) => !s)}
              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white/80 border border-white/10 transition-all active:scale-95"
              aria-label="Toggle sound"
            >
              {soundOn ? "🔊" : "🔇"}
            </button>
            <div className="px-3 py-1 rounded-lg bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-400/30 text-xs sm:text-sm">
              <span className="text-white/60 mr-1">Balance:</span>
              <span className="font-bold text-yellow-300">Rs. {balance.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Rules panel */}
      {showRules && (
        <div className="flex-shrink-0 mx-auto max-w-6xl w-full px-3 pt-2">
          <div className="rounded-xl bg-black/80 border border-white/10 p-3 text-xs text-white/80">
            <h2 className="text-sm font-bold text-yellow-300 mb-1">How to Play</h2>
            <ul className="space-y-0.5 list-disc list-inside">
              <li>Two dice are rolled. Predict if their total is <b>below 7</b>, <b>exactly 7</b>, or <b>above 7</b>.</li>
              <li><b>7 Down</b> (2–6) pays <b>1:1</b>. <b>7 Up</b> (8–12) pays <b>1:1</b>. <b>Lucky 7</b> pays <b>4:1</b>.</li>
              <li>You have <b>{BET_DURATION}s</b> to place bets each round, then the dice roll automatically.</li>
            </ul>
          </div>
        </div>
      )}

      {/* Main game area */}
      <main className="flex-1 min-h-0 overflow-y-auto px-2 sm:px-4 py-2 sm:py-3 mx-auto max-w-6xl w-full">
        {/* Felt table */}
        <div className="felt rounded-2xl sm:rounded-3xl p-3 sm:p-5 border border-yellow-700/40 relative overflow-hidden">
          {/* corner light */}
          <div className="pointer-events-none absolute -top-20 -left-20 w-72 h-72 rounded-full bg-yellow-300/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -right-20 w-72 h-72 rounded-full bg-emerald-300/10 blur-3xl" />

          {/* Header row inside felt */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-black/40 border border-white/10 text-[11px] uppercase tracking-wider">
                Round #{roundNo}
              </span>
              <PhaseBadge phase={phase} />
            </div>
            {phase === "betting" && (
              <Countdown timeLeft={timeLeft} progressPct={progressPct} />
            )}
          </div>

          {/* Betting table grid: 7 Down | Lucky 7 | 7 Up */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <BetCell
              label="7 DOWN"
              sub="Total 2 – 6"
              color="from-rose-600 to-rose-800"
              ring="ring-rose-400/40"
              active={!!live.state && !live.busy}
              placed={betOn("down")}
              onClick={() => placeBet("down")}
              payout="1 : 1"
              winning={lastResult?.total !== undefined && lastResult.total < 7}
              losing={lastResult?.total !== undefined && lastResult.total > 7}
            />
            <BetCell
              label="LUCKY 7"
              sub="Total = 7"
              color="from-yellow-500 to-amber-700"
              ring="ring-yellow-300/50"
              active={!!live.state && !live.busy}
              placed={betOn("lucky")}
              onClick={() => placeBet("lucky")}
              payout="4 : 1"
              highlight
              winning={lastResult?.total === 7}
              losing={lastResult?.total !== undefined && lastResult.total !== 7}
            />
            <BetCell
              label="7 UP"
              sub="Total 8 – 12"
              color="from-emerald-600 to-emerald-800"
              ring="ring-emerald-400/40"
              active={!!live.state && !live.busy}
              placed={betOn("up")}
              onClick={() => placeBet("up")}
              payout="1 : 1"
              winning={lastResult?.total !== undefined && lastResult.total > 7}
              losing={lastResult?.total !== undefined && lastResult.total < 7}
            />
          </div>

          {/* Dice and result display */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
            <div className="md:col-span-2 flex flex-col items-center justify-center bg-black/35 rounded-xl py-4 sm:py-5 border border-white/10 relative">
              <div className="absolute inset-0 rounded-xl pointer-events-none">
                {lastResult && lastResult.outcome === "win" && <div className="win-flash absolute inset-0 rounded-xl" />}
                {lastResult && lastResult.outcome === "loss" && <div className="lose-flash absolute inset-0 rounded-xl" />}
              </div>
              <div className="flex gap-4 sm:gap-8 items-center justify-center">
                <DiceFace value={diceValues[0]} rolling={phase === "rolling"} size={72} />
                <DiceFace value={diceValues[1]} rolling={phase === "rolling"} size={72} />
              </div>
              <div className="mt-3 text-center">
                {phase === "betting" && (
                  <p className="text-white/70 text-xs sm:text-sm">Place your bets — {timeLeft}s</p>
                )}
                {phase === "rolling" && (
                  <p className="text-yellow-300 font-bold tracking-widest animate-pulse text-sm">ROLLING…</p>
                )}
                {phase === "result" && lastResult && (
                  <ResultBanner result={lastResult} />
                )}
              </div>
            </div>

            {/* Bet summary / actions */}
            <div className="bg-black/45 rounded-xl p-3 sm:p-4 border border-white/10">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] uppercase tracking-wider text-white/60">Current Bets</span>
                <span className="text-[11px] text-white/60">{totalPlaced} chips</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-white/70 text-xs">Wagered</span>
                <span className="text-xl font-extrabold text-yellow-300">Rs. {totalWagered.toLocaleString()}</span>
              </div>
              <div className="mt-2.5 flex gap-2">
                <button
                  onClick={undoLastBet}
                  disabled={live.busy || phase !== "betting" || bets.length === 0}
                  className="flex-1 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-slate-200 border border-slate-500/40 transition-all active:scale-95"
                >
                  ↶ Undo
                </button>
                <button
                  onClick={clearBets}
                  disabled={phase !== "betting" || bets.length === 0}
                  className="flex-1 py-1.5 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-rose-300 border border-rose-500/40 transition-all active:scale-95"
                >
                  🗑 Clear
                </button>
              </div>
              {phase === "result" && (
                <button
                  onClick={newRound}
                  className="mt-2.5 w-full py-2.5 rounded-lg bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-black font-extrabold text-xs sm:text-sm shadow-[0_0_15px_rgba(245,158,11,0.5)] transition-all active:scale-95"
                >
                  ↻ Refresh live table
                </button>
              )}
              {phase === "betting" && totalPlaced > 0 && (
                <button
                  disabled
                  className="mt-2.5 w-full py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-600 hover:from-emerald-400 hover:to-green-400 text-white font-black text-xs sm:text-sm shadow-[0_0_20px_rgba(16,185,129,0.5)] transition-all active:scale-95"
                >
                  🔒 Shared round starts automatically
                </button>
              )}
            </div>
          </div>

          {/* Chip tray */}
          <div className="mt-3 bg-black/45 rounded-xl p-2.5 border border-white/10">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-wider text-white/60">Chip Tray</span>
              <span className="text-[10px] text-white/60">
                Selected: <span className="text-yellow-300 font-bold">Rs. {chipValue}</span>
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2.5 justify-center">
              {CHIP_VALUES.map((v) => (
                <Chip key={v} value={v} selected={chipValue === v} onClick={() => setChipValue(v)} />
              ))}
              <input
                type="number"
                min={10}
                inputMode="numeric"
                aria-label="Custom bet amount"
                placeholder="Custom"
                value={chipValue || ""}
                onChange={(e) => setChipValue(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
                className="w-20 h-10 rounded-lg bg-black/50 border border-white/20 text-center text-sm text-yellow-300 font-bold outline-none"
              />
            </div>
          </div>
        </div>

        {/* History */}
        <div className="mt-3 bg-black/40 rounded-xl p-3 border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white/80">Recent Rounds</h3>
            <span className="text-[10px] text-white/50">{history.length} / 30</span>
          </div>
          {history.length === 0 ? (
            <p className="text-white/40 text-xs">No rounds yet. Place a bet to begin!</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 scrollbar-thin">
              {history.map((r) => (
                <HistoryCard key={r.id} r={r} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  const color =
    tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : "text-yellow-300";
  return (
    <div className="bg-black/40 rounded-2xl p-3 border border-white/10 flex items-center justify-between">
      <span className="text-xs uppercase tracking-wider text-white/60">{label}</span>
      <span className={`text-2xl font-extrabold ${color}`}>{value}</span>
    </div>
  );
}

function Countdown({ timeLeft, progressPct }: { timeLeft: number; progressPct: number }) {
  const urgent = timeLeft <= 5;
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-32 sm:w-48 h-2.5 bg-black/50 rounded-full overflow-hidden border border-white/10">
        <div
          className={`h-full ${urgent ? "bg-gradient-to-r from-rose-400 to-rose-600" : "bg-gradient-to-r from-emerald-400 to-emerald-600"} transition-all`}
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <span className={`font-mono font-bold ${urgent ? "text-rose-300" : "text-emerald-300"}`}>
        {timeLeft}s
      </span>
    </div>
  );
}

function PhaseBadge({ phase }: { phase: Phase }) {
  const map: Record<Phase, { text: string; cls: string }> = {
    betting: { text: "BETTING OPEN", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30" },
    rolling: { text: "ROLLING", cls: "bg-yellow-500/20 text-yellow-300 border-yellow-400/30" },
    result: { text: "RESULT", cls: "bg-sky-500/20 text-sky-300 border-sky-400/30" },
  };
  const m = map[phase];
  return (
    <span className={`px-2 py-1 rounded-md text-xs font-bold border ${m.cls}`}>{m.text}</span>
  );
}

function BetCell({
  label,
  sub,
  color,
  ring,
  active,
  placed,
  onClick,
  payout,
  highlight,
  winning,
  losing,
}: {
  label: string;
  sub: string;
  color: string;
  ring: string;
  active: boolean;
  placed: number;
  onClick: () => void;
  payout: string;
  highlight?: boolean;
  winning?: boolean;
  losing?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`bet-cell relative rounded-2xl bg-gradient-to-br ${color} ${ring} ring-1 px-3 sm:px-4 py-6 sm:py-8 text-center overflow-hidden border border-white/10 ${
        active ? "cursor-pointer hover:brightness-110" : "cursor-default"
      } ${winning ? "glow-gold" : ""}`}
      aria-label={active ? `Bet on ${label}` : `Queue bet on ${label} for next round`}
    >
      {/* highlight lucky 7 */}
      {highlight && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 rounded-2xl ring-4 ring-yellow-300/50 pulse-ring" />
        </div>
      )}
      <div className="text-2xl sm:text-4xl font-black drop-shadow-md">{label}</div>
      <div className="mt-1 text-[11px] sm:text-xs uppercase tracking-wider text-white/80">{sub}</div>
      <div className="mt-2 inline-block px-2 py-0.5 rounded-full bg-black/40 border border-white/20 text-[11px] font-bold">
        Pays {payout}
      </div>
      {placed > 0 && (
        <div className="absolute top-2 right-2 chip-pop">
          <div className="w-7 h-7 rounded-full bg-yellow-300 text-black grid place-items-center text-xs font-extrabold border-2 border-white shadow-lg">
            Rs. {placed}
          </div>
        </div>
      )}
      {winning && (
        <div className="absolute inset-0 grid place-items-center bg-yellow-300/15 backdrop-blur-[1px]">
          <span className="px-3 py-1 rounded-full bg-yellow-300 text-black font-extrabold text-sm shadow-lg">WON</span>
        </div>
      )}
      {losing && (
        <div className="absolute inset-0 grid place-items-center bg-black/30">
          <span className="px-3 py-1 rounded-full bg-rose-500 text-white font-bold text-xs shadow-lg">{""}</span>
        </div>
      )}
    </button>
  );
}

function ResultBanner({ result }: { result: RoundResult }) {
  const win = result.outcome === "win";
  return (
    <div className="space-y-1">
      <p className="text-white/70 text-xs uppercase tracking-widest">
        Total = <span className="text-white font-bold">{result.total}</span>
      </p>
      {result.poolMessage ? <p className="text-sm text-amber-200">{result.poolMessage}</p> : result.bets.length === 0 ? null : win ? (
        <p className="text-2xl font-extrabold text-emerald-300">
          YOU WIN <span className="text-yellow-300">+Rs. {result.payout.toLocaleString()}</span>
        </p>
      ) : (
        <p className="text-2xl font-extrabold text-rose-300">{""}</p>
      )}
    </div>
  );
}

function HistoryCard({ r }: { r: RoundResult }) {
  const win = r.outcome === "win";
  return (
    <div
      className={`rounded-xl p-3 border ${
        win ? "bg-emerald-500/10 border-emerald-400/30" : "bg-rose-500/10 border-rose-400/30"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <DiceFace value={r.dice[0]} size={28} />
          <DiceFace value={r.dice[1]} size={28} />
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase text-white/60">Total</div>
          <div className="text-lg font-extrabold">{r.total}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-white/70">
          {r.bets.map((b) => b.area.toUpperCase()).join(", ")}
        </span>
        <span className={`text-xs font-bold ${win ? "text-emerald-300" : "text-rose-300"}`}>
          {r.poolMessage ? "Pool pending" : win ? `+Rs. ${r.payout}` : "—"}
        </span>
      </div>
    </div>
  );
}
