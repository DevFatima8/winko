"use client";

import { notifyGameResult } from "@/lib/gameResultNotice";
import { gameSfx } from "@/lib/gameSfx";
import { GameOverOverlay } from "@/components/GameOverOverlay";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useBrowserWager } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import "./rock-paper-scissors.css";

type Move = "rock" | "paper" | "scissors";
type Result = "win" | "lose";

const MOVES: Move[] = ["rock", "paper", "scissors"];
const EMOJI: Record<Move, string> = { rock: "✊", paper: "✋", scissors: "✌️" };
const LABEL: Record<Move, string> = { rock: "ROCK", paper: "PAPER", scissors: "SCISSORS" };

// what beats X
const BEATS: Record<Move, Move> = { rock: "scissors", paper: "rock", scissors: "paper" };
const LOSES_TO: Record<Move, Move> = { rock: "paper", paper: "scissors", scissors: "rock" };

const WIN_CHANCE = 0.35;
const PAYOUT = 1.96;
const CHIPS: number[] = [...BET_PRESETS];

type HistoryItem = {
  id: number;
  player: Move;
  house: Move;
  result: Result;
  bet: number;
  delta: number;
};

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RockPaperScissorsGame({ backHref }: { backHref?: string }) {
  const { balance, play: submitWager, pending, error, retry } = useBrowserWager("rock-paper-scissors", 1000);
  const [poolPending, setPoolPending] = useState(false);
  const [lastClaim, setLastClaim] = useState(0);
  const [bet, setBet] = useState(50);
  const [player, setPlayer] = useState<Move | null>(null);
  const [house, setHouse] = useState<Move | null>(null);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [endDismissed, setEndDismissed] = useState(false);
  const [delta, setDelta] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [spin, setSpin] = useState<Move>("rock");
  const [settling, setSettling] = useState(false);
  const idRef = useRef(1);
  const timers = useRef<number[]>([]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  useEffect(() => {
    if (!rolling) return;
    const t = setInterval(() => {
      setSpin(MOVES[Math.floor(Math.random() * 3)]);
    }, 90);
    return () => clearInterval(t);
  }, [rolling]);

  const canPlay = !rolling && !settling && !pending && !error && bet > 0 && bet <= balance;

  const play = useCallback(
    async (choice: Move) => {
      if (rolling || settling || pending || error) return;
      if (bet <= 0 || bet > balance) return;

      const stake = bet;
      const win = Math.random() < WIN_CHANCE;
      const houseMove: Move = win ? BEATS[choice] : LOSES_TO[choice];
      const payout = win ? Math.round(stake * PAYOUT * 100) / 100 : 0;
      let accepted;
      try {
        accepted = await submitWager(stake, payout);
      } catch {
        return;
      }
      setPoolPending(accepted.poolPending);
      setLastClaim(payout);
      setPlayer(choice);
      setResult(null);
      setEndDismissed(false);
      setHouse(null);
      setSettling(true);
      setRolling(true);

      // Let the house hand shuffle, land visibly, then show win/no win.
      timers.current.push(window.setTimeout(() => {
        setRolling(false);
        setHouse(houseMove);
        gameSfx.flip();
      }, 2600));

      timers.current.push(window.setTimeout(() => {
        setSettling(false);
        const d = payout - stake;
        setDelta(d);
        if (win) gameSfx.win(); else gameSfx.lose();
        setResult(win ? "win" : "lose");
        notifyGameResult("rock-paper-scissors", accepted.wagerId, accepted.claim, accepted.poolPending);
        if (win) setWins((w) => w + 1);
        else setLosses((l) => l + 1);
        setHistory((h) =>
          [
            {
              id: idRef.current++,
              player: choice,
              house: houseMove,
              result: (win ? "win" : "lose") as Result,
              bet: stake,
              delta: d,
            },
            ...h,
          ].slice(0, 12),
        );
      }, 3900));
    },
    [bet, balance, rolling, settling, pending, error, submitWager],
  );

  const total = wins + losses;

  return (
    <div className="rock-paper-scissors-container h-full w-full flex flex-col min-h-0 bg-[radial-gradient(ellipse_at_top,#1b2a5e_0%,#0b1020_55%,#05070f_100%)] text-white overflow-hidden">
      {error && <div role="alert" className="p-2 text-sm text-rose-300">{error} <button onClick={() => void retry()}>Retry confirmation</button></div>}
      {poolPending && <div role="status" className="px-3 text-xs text-amber-200">Results are provisional pool claims, not wallet winnings. Daily settlement determines payment.</div>}
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-3 py-2 sm:px-6 sm:py-3 shadow-md z-10 backdrop-blur">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href={backHref || "/player"}
            className="flex items-center gap-1 text-xs font-semibold text-amber-300/90 hover:text-amber-200 bg-white/5 hover:bg-white/10 border border-amber-400/30 px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
          >
            ← <span className="hidden sm:inline">Back</span>
          </Link>
          <div className="grid h-8 w-8 sm:h-10 sm:w-10 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-amber-400 text-lg sm:text-2xl shadow-lg shadow-fuchsia-500/30">
            🎰
          </div>
          <div>
            <h1 className="text-sm font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-fuchsia-400 to-cyan-300 sm:text-lg">
              RPS CASINO
            </h1>
            <p className="hidden text-[10px] uppercase tracking-[0.2em] text-white/40 sm:block">
              Rock · Paper · Scissors
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-right sm:px-4 sm:py-1.5 shadow-inner">
            <div className="text-[9px] uppercase tracking-widest text-emerald-300/70">Balance</div>
            <div className="text-sm font-bold text-emerald-300 sm:text-lg">Rs. {fmt(balance)}</div>
          </div>
          <button
            onClick={() => {
              setWins(0);
              setLosses(0);
              setHistory([]);
              setPlayer(null);
              setHouse(null);
              setResult(null);
            }}
            className="rounded-lg border border-white/15 bg-slate-800/80 hover:bg-slate-700 px-2.5 py-1.5 text-xs font-semibold text-white/80 transition-all hover:text-white active:scale-95"
          >
            RESET
          </button>
        </div>
      </header>

      {/* Main Game Layout */}
      <main className="flex-1 min-h-0 w-full max-w-5xl mx-auto p-2 sm:p-4 overflow-y-auto lg:overflow-hidden grid lg:grid-cols-[1.5fr_1fr] gap-3">
        {/* Table Felt */}
        <section className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0f1630]/90 p-3 sm:p-5 shadow-2xl shadow-black/50">
          <div className="rounded-xl border border-emerald-500/20 bg-[radial-gradient(ellipse_at_center,#10603f_0%,#0a3a28_60%,#06231a_100%)] p-3 sm:p-4">
            <div className="grid grid-cols-3 items-center gap-1 sm:gap-2">
              <Pad label="YOU" move={player} glow="cyan" />
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-black text-amber-300 drop-shadow">VS</div>
                <div className="mt-1 text-[9px] sm:text-[10px] uppercase tracking-widest text-white/50">
                  Payout {PAYOUT}x
                </div>
              </div>
              <Pad label="HOUSE" move={rolling ? spin : house} glow="fuchsia" shaking={rolling} />
            </div>

            <div className="mt-3 sm:mt-4 min-h-[44px] flex items-center justify-center">
              {rolling && (
                <div className="animate-pulse text-center text-sm sm:text-base font-bold tracking-widest text-amber-300">
                  ROLLING...
                </div>
              )}
              {!rolling && result === "win" && (
                <div className="w-full rounded-lg border border-emerald-400/40 bg-emerald-400/15 py-2 text-center text-sm sm:text-base font-black tracking-wider text-emerald-300 shadow-md">
                  {poolPending ? `PROVISIONAL CLAIM Rs. ${fmt(lastClaim)}` : `🎉 YOU WIN +Rs. ${fmt(delta)}`}
                </div>
              )}
              {!rolling && result === "lose" && (
                <div className="w-full rounded-lg border border-rose-400/40 bg-rose-400/15 py-2 text-center text-sm sm:text-base font-black tracking-wider text-rose-300 shadow-md">
                  {poolPending ? "DAILY PAYOUT PENDING — PROVISIONAL CLAIM Rs. 0" : ""}
                </div>
              )}
              {!rolling && settling && (
                <div className="text-center text-sm sm:text-base font-bold tracking-widest text-amber-300">
                  {player && house ? `${LABEL[player]} vs ${LABEL[house]}` : ""}
                </div>
              )}
              {!rolling && !settling && result === null && (
                <div className="text-center text-xs tracking-widest text-white/40">
                  PLACE BET & PICK A HAND BELOW
                </div>
              )}
            </div>
          </div>

          {/* Bet controls */}
          <div className="mt-3 sm:mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 sm:p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-widest text-white/50">Bet Amount</span>
              <span className="text-xs sm:text-sm font-bold text-amber-300 font-mono">
                Rs. <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  aria-label="Custom bet amount"
                  disabled={rolling}
                  value={bet || ""}
                  placeholder="0"
                  onChange={(e) => setBet(Math.min(Math.floor(balance), Math.max(0, Math.floor(Number(e.target.value)) || 0)))}
                  className="w-24 rounded-md border border-white/20 bg-black/40 px-2 py-0.5 text-right text-amber-300 outline-none"
                />
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {CHIPS.map((c) => (
                <button
                  key={c}
                  disabled={rolling}
                  onClick={() => setBet(Math.min(Math.floor(balance), c))}
                  className={`h-9 w-9 sm:h-11 sm:w-11 rounded-full border-2 border-dashed text-[10px] sm:text-xs font-black text-white shadow-md transition-all duration-150 hover:scale-105 active:scale-95 disabled:opacity-40 bg-gradient-to-br ${c === 50
                      ? "from-sky-500 to-sky-700 border-sky-300"
                      : c === 100
                        ? "from-emerald-500 to-emerald-700 border-emerald-300"
                        : c === 200
                          ? "from-rose-500 to-rose-700 border-rose-300"
                          : c === 500
                            ? "from-purple-500 to-purple-700 border-purple-300"
                            : "from-amber-500 to-amber-700 border-amber-300"
                    }`}
                >
                  {c}
                </button>
              ))}
              <div className="flex items-center gap-1 ml-auto">
                <button
                  disabled={rolling}
                  onClick={() => setBet((b) => Math.max(1, Math.floor(b / 2)))}
                  className="rounded-lg border border-slate-600 bg-slate-700/60 hover:bg-slate-600 px-2 py-1 text-[11px] font-bold text-slate-200 transition-all active:scale-95 disabled:opacity-40"
                >
                  ½
                </button>
                <button
                  disabled={rolling}
                  onClick={() => setBet((b) => Math.min(balance, b * 2))}
                  className="rounded-lg border border-indigo-500/40 bg-indigo-600/30 hover:bg-indigo-600/50 px-2 py-1 text-[11px] font-bold text-indigo-200 transition-all active:scale-95 disabled:opacity-40"
                >
                  2×
                </button>
                <button
                  disabled={rolling}
                  onClick={() => setBet(Math.floor(balance))}
                  className="rounded-lg border border-amber-500/50 bg-amber-600/30 hover:bg-amber-600/50 px-2.5 py-1 text-[11px] font-bold text-amber-200 transition-all active:scale-95 disabled:opacity-40"
                >
                  MAX
                </button>
                <button
                  disabled={rolling}
                  onClick={() => setBet(0)}
                  className="rounded-lg border border-rose-500/40 bg-rose-600/30 hover:bg-rose-600/50 px-2 py-1 text-[11px] font-bold text-rose-200 transition-all active:scale-95 disabled:opacity-40"
                >
                  CLEAR
                </button>
              </div>
            </div>

            <input
              type="range"
              min={0}
              max={Math.max(10, Math.floor(balance))}
              value={Math.min(bet, Math.max(10, Math.floor(balance)))}
              disabled={rolling}
              onChange={(e) => setBet(Number(e.target.value))}
              className="mt-2 w-full accent-amber-400 h-1.5 bg-black/40 rounded-lg cursor-pointer"
            />
          </div>

          {/* Move buttons */}
          <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
            {MOVES.map((m) => {
              const colorClasses =
                m === "rock"
                  ? "from-blue-600/35 via-indigo-700/40 to-blue-900/50 border-blue-400/50 hover:border-blue-300 hover:shadow-[0_0_20px_rgba(59,130,246,0.6)] text-blue-200"
                  : m === "paper"
                    ? "from-emerald-600/35 via-teal-700/40 to-emerald-900/50 border-emerald-400/50 hover:border-emerald-300 hover:shadow-[0_0_20px_rgba(16,185,129,0.6)] text-emerald-200"
                    : "from-amber-600/35 via-orange-700/40 to-amber-900/50 border-amber-400/50 hover:border-amber-300 hover:shadow-[0_0_20px_rgba(245,158,11,0.6)] text-amber-200";

              return (
                <button
                  key={m}
                  disabled={!canPlay}
                  onClick={() => play(m)}
                  className={`group relative rounded-xl border bg-gradient-to-b py-3 sm:py-4 transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 shadow-lg ${colorClasses}`}
                >
                  <div className="text-3xl sm:text-4xl transition-transform duration-200 group-hover:scale-115 drop-shadow">
                    {EMOJI[m]}
                  </div>
                  <div className="mt-1 text-[11px] sm:text-xs font-black tracking-wider uppercase">
                    {LABEL[m]}
                  </div>
                </button>
              );
            })}
          </div>
          {bet > balance && (
            <p className="mt-1.5 text-center text-xs text-rose-400 font-semibold">Insufficient balance</p>
          )}
        </section>

        {/* Sidebar */}
        <aside className="flex flex-col gap-2.5 sm:gap-3 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Rounds" value={String(total)} color="text-slate-200" />
          </div>

          <div className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] p-3 shadow-md">
            <h2 className="mb-2 text-[10px] uppercase tracking-[0.2em] text-white/50 font-bold">History</h2>
            {history.length === 0 ? (
              <p className="py-4 text-center text-xs text-white/30">No rounds yet</p>
            ) : (
              <ul className="max-h-[220px] sm:max-h-[280px] space-y-1.5 overflow-y-auto pr-1">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs ${h.result === "win"
                        ? "border-emerald-400/30 bg-emerald-400/10"
                        : "border-rose-400/30 bg-rose-400/10"
                      }`}
                  >
                    <span className="text-base">
                      {EMOJI[h.player]} <span className="text-[10px] text-white/40">vs</span>{" "}
                      {EMOJI[h.house]}
                    </span>
                    <span
                      className={`font-mono font-bold ${h.result === "win" ? "text-emerald-300" : "text-rose-300"
                        }`}
                    >
                      {h.delta < 0 ? "" : `${poolPending ? "Indicative game net (not paid): " : ""}+Rs. ${fmt(h.delta)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </main>
      <GameOverOverlay open={!!result && !endDismissed} winAmount={result === "win" ? delta : 0} result={poolPending ? "Daily payout pending. The game outcome is not a final wallet payment." : result === "win" ? "You won this hand." : ""} onPlayAgain={() => { if (player) void play(player); }} onClose={() => setEndDismissed(true)} />
    </div>
  );
}

function Pad({
  label,
  move,
  glow,
  shaking,
}: {
  label: string;
  move: Move | null;
  glow: "cyan" | "fuchsia";
  shaking?: boolean;
}) {
  const ring =
    glow === "cyan"
      ? "shadow-[0_0_15px_rgba(6,182,212,0.3)] border-cyan-400/50"
      : "shadow-[0_0_15px_rgba(217,70,239,0.3)] border-fuchsia-400/50";
  return (
    <div className="text-center">
      <div className="mb-1 text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-white/60 font-semibold">{label}</div>
      <div
        className={`mx-auto grid h-16 w-16 sm:h-22 sm:w-22 place-items-center rounded-xl border bg-black/40 text-3xl sm:text-4xl shadow-xl transition-all ${ring} ${shaking ? "animate-bounce" : ""
          }`}
      >
        {move ? EMOJI[move] : "❔"}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-center shadow-sm">
      <div className="text-[9px] uppercase tracking-widest text-white/40">{label}</div>
      <div className={`text-base sm:text-lg font-black ${color}`}>{value}</div>
    </div>
  );
}
