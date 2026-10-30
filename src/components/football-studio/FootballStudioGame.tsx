"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMultiplayerGame } from "@/lib/useMultiplayerGame";
import { poolRoundMessage } from "@/lib/multiplayer-types";
import { LiveMultiplayerBets } from "@/components/LiveMultiplayerBets";
import type { FootballOutcome } from "@/lib/multiplayer-rules";
import { BET_PRESETS } from "@/lib/betPresets";
import BetAmountInput from "@/components/BetAmountInput";
import { gameSfx } from "@/lib/gameSfx";
import "./football-studio.css";

/* ================= Types & constants ================= */

type Outcome = "HOME" | "DRAW" | "AWAY";

interface PlayingCard {
  rank: number; // 2..14 (A high)
  suit: "♠" | "♥" | "♦" | "♣";
}

interface Bets {
  HOME: number;
  DRAW: number;
  AWAY: number;
}

const EMPTY_BETS: Bets = { HOME: 0, DRAW: 0, AWAY: 0 };
const CHIPS: number[] = [...BET_PRESETS];
const BET_SECONDS = 12;

const RANK_LABEL: Record<number, string> = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9",
  10: "10", 11: "J", 12: "Q", 13: "K", 14: "A",
};

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

function chipColor(v: number) {
  if (v >= 5000) return "bg-gradient-to-b from-amber-300 to-amber-600 text-amber-950";
  if (v >= 1000) return "bg-gradient-to-b from-fuchsia-400 to-fuchsia-700 text-white";
  if (v >= 500) return "bg-gradient-to-b from-violet-400 to-violet-700 text-white";
  if (v >= 100) return "bg-gradient-to-b from-emerald-400 to-emerald-700 text-white";
  if (v >= 50) return "bg-gradient-to-b from-sky-400 to-sky-700 text-white";
  return "bg-gradient-to-b from-rose-400 to-rose-700 text-white";
}

function chipLabel(v: number) {
  return v >= 1000 ? `${v / 1000}K` : `${v}`;
}

/* ================= Small components ================= */

function CardView({
  card,
  flipped,
  glow,
}: {
  card: PlayingCard | null;
  flipped: boolean;
  glow: boolean;
}) {
  const red = card?.suit === "♥" || card?.suit === "♦";
  const showFront = flipped && !!card;
  const sizeStyle = { width: "clamp(64px, 20vw, 104px)", height: "clamp(92px, 29vw, 148px)" };
  return (
    <div className="fs-card-wrap" style={sizeStyle}>
      {!showFront ? (
        <div
          key={card ? "back-dealt" : "back-idle"}
          className={`fs-card-face card-back-pattern border-2 border-emerald-900/80 shadow-xl shadow-black/50 flex items-center justify-center ${card ? "fs-deal-in" : ""}`}
        >
          <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-emerald-950/70 border border-emerald-400/30 flex items-center justify-center text-base">
            ⚽
          </div>
        </div>
      ) : (
        <div
          key="front"
          className={`fs-card-face fs-flip-in bg-gradient-to-br from-white to-slate-200 shadow-xl shadow-black/50 flex flex-col justify-between p-1.5 sm:p-2 ${
            glow ? "winner-glow" : ""
          }`}
        >
          <div className={`text-left leading-none font-extrabold ${red ? "text-red-600" : "text-slate-900"}`}>
            <div className="text-lg sm:text-2xl">{RANK_LABEL[card.rank]}</div>
            <div className="text-sm sm:text-lg -mt-0.5">{card.suit}</div>
          </div>
          <div className={`text-center text-3xl sm:text-5xl font-bold ${red ? "text-red-600" : "text-slate-900"}`}>
            {card.suit}
          </div>
          <div className={`text-right leading-none font-extrabold rotate-180 ${red ? "text-red-600" : "text-slate-900"}`}>
            <div className="text-lg sm:text-2xl">{RANK_LABEL[card.rank]}</div>
            <div className="text-sm sm:text-lg -mt-0.5">{card.suit}</div>
          </div>
        </div>
      )}
    </div>
  );
}
function HistoryBubble({ o, latest }: { o: Outcome; latest: boolean }) {
  const map = {
    HOME: "bg-gradient-to-b from-red-500 to-red-800 text-white",
    AWAY: "bg-gradient-to-b from-blue-500 to-blue-800 text-white",
    DRAW: "bg-gradient-to-b from-amber-300 to-amber-600 text-amber-950",
  } as const;
  return (
    <div
      className={`${map[o]} ${latest ? "bubble-in ring-2 ring-white/70" : ""} h-7 w-7 sm:h-8 sm:w-8 shrink-0 rounded-full flex items-center justify-center text-[11px] sm:text-xs font-black shadow-md shadow-black/40`}
    >
      {o[0]}
    </div>
  );
}

function Confetti() {
  const pieces = Array.from({ length: 36 });
  const colors = ["#e8c158", "#ef4444", "#3b82f6", "#22c55e", "#f472b6", "#ffffff"];
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((_, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${(i * 97) % 100}%`,
            width: 6 + (i % 3) * 3,
            height: 10 + (i % 4) * 3,
            background: colors[i % colors.length],
            animationDuration: `${2 + (i % 5) * 0.4}s`,
            animationDelay: `${(i % 10) * 0.12}s`,
            borderRadius: i % 2 ? "2px" : "50%",
          }}
        />
      ))}
    </div>
  );
}

/* ================= Main page ================= */

export default function FootballStudioGame({ backHref = "/player" }: { backHref?: string }) {
  const live = useMultiplayerGame<FootballOutcome>("football-studio");
  const [chip, setChip] = useState(100);
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome>("HOME");
  const [lastBets, setLastBets] = useState<Bets>({ ...EMPTY_BETS });
  const [stats, setStats] = useState({ rounds: 0, wins: 0, losses: 0 });
  const notified = useRef<number | null>(null);
  const state = live.state;
  const balance = state?.balance ?? 0;
  const phase = state?.round.phase === "running" ? "dealing" : state?.round.phase ?? "betting";
  const timeLeft = Math.max(0, Math.ceil(((state?.round.bettingEndsAt ?? live.now) - live.now) / 1000));
  const cards = state?.round.result ?? { home: null, away: null };
  const homeFlipped = phase === "result" && !!state && live.now >= state.round.resultAt;
  const awayFlipped = phase === "result" && !!state && live.now >= state.round.resultAt + 500;
  const outcome = state?.round.result?.outcome ?? null;
  const history = (state?.history ?? []).slice(0, 30).map(({ result }) => result.outcome);
  const personal = state?.myBets.filter((bet) => bet.status !== "cancelled") ?? [];
  const bets = personal.reduce((sum, bet) => {
    if (bet.option in sum) sum[bet.option as Outcome] += bet.amount;
    return sum;
  }, { ...EMPTY_BETS });
  const totalBet = bets.HOME + bets.DRAW + bets.AWAY;
  if (totalBet > 0 && (bets.HOME !== lastBets.HOME || bets.DRAW !== lastBets.DRAW || bets.AWAY !== lastBets.AWAY)) {
    setLastBets(bets);
  }
  const poolMessage = poolRoundMessage(personal);
  const roundNet = phase === "result" && personal.length && !poolMessage ? personal.reduce((sum, bet) => sum + bet.payout - bet.amount, 0) : null;
  const showConfetti = roundNet !== null && roundNet > 0 && !!state && live.now < state.round.resultAt + 2600;
  const canBet = !!state && !live.busy;
  const canPlaceBet = canBet && chip >= 10 && chip <= balance;

  useEffect(() => {
    if (!state || !personal.length) return;
    if (state.round.phase !== "result" || notified.current === state.round.roundNo) return;
    notified.current = state.round.roundNo;
    if (poolMessage) return;
    if (roundNet !== null && roundNet > 0) gameSfx.win();
    else if (roundNet !== null && roundNet < 0) gameSfx.lose();
    setStats((s) => ({ rounds: s.rounds + 1, wins: s.wins + (roundNet !== null && roundNet > 0 ? 1 : 0), losses: s.losses + (roundNet !== null && roundNet < 0 ? 1 : 0) }));
  }, [state, personal.length, bets, roundNet, poolMessage]);

  const placeBet = async (o: Outcome) => {
    setSelectedOutcome(o);
    if (chip < 10 || chip > balance) return;
    const reply = await live.place(o, chip);
    if (!("error" in reply)) gameSfx.chip();
  };

  const undoAll = () => {
    if (!state || live.busy) return;
    void live.cancel(state.round.roundNo + (state.round.phase === "betting" && live.now < state.round.bettingEndsAt - 500 ? 0 : 1));
  };

  const rebet = async () => {
    if (!state || live.busy) return;
    const previous = { ...lastBets };
    const current = state.round.phase === "betting" && live.now < state.round.bettingEndsAt - 500;
    if ((current ? state.myBets : state.myQueuedBets).some((bet) => bet.status === "pending")) {
      const reply = await live.cancel(state.round.roundNo + (current ? 0 : 1));
      if ("error" in reply) return;
    }
    for (const option of Object.keys(previous) as Outcome[]) {
      if (previous[option] > 0) {
        const placed = await live.place(option, previous[option]);
        if ("error" in placed) break;
      }
    }
  };

  const doubleBet = async () => {
    if (!state || live.busy) return;
    for (const option of Object.keys(bets) as Outcome[]) {
      if (bets[option] > 0) {
        const reply = await live.place(option, bets[option]);
        if ("error" in reply) break;
      }
    }
  };

  const cancelQueue = () => {
    if (state) void live.cancel(state.round.roundNo + 1);
  };

  const spotBase =
    "bet-spot relative flex-1 rounded-xl sm:rounded-2xl border backdrop-blur-sm px-2 py-2.5 sm:px-4 sm:py-4 text-center select-none cursor-pointer";

  const betWon = roundNet !== null && roundNet > 0;

  return (
    <div className="football-studio-container relative h-full w-full flex flex-col justify-between overflow-hidden px-2 sm:px-4 py-1.5 select-none">
      {/* background */}
      <div
        className="fixed inset-0 -z-20 bg-cover bg-center"
        style={{ backgroundImage: "url('/games/19_Football_Studio_1024x700.jpg')" }}
      />
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-black/80 via-emerald-950/75 to-black/90" />

      {showConfetti && <Confetti />}
      <div className="shrink-0 max-h-28 overflow-y-auto">
        <LiveMultiplayerBets state={live.state} error={live.error} />
        {!!state?.myQueuedBets.some((bet) => bet.status === "pending") && <button onClick={cancelQueue} disabled={live.busy} className="text-xs text-amber-300">Cancel next-round bets</button>}
      </div>

      {/* ===== Header ===== */}
      <header className="flex items-center justify-between gap-2 px-2 sm:px-4 py-1.5 border-b border-amber-300/20 bg-black/45 backdrop-blur-md rounded-xl shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 px-2.5 py-1 text-xs font-semibold text-white transition hover:scale-105 active:scale-95 shrink-0"
          >
            ← Back
          </Link>
          <div className="h-7 w-7 sm:h-9 sm:w-9 rounded-full bg-gradient-to-b from-amber-300 to-amber-600 flex items-center justify-center text-sm sm:text-lg shadow-md shadow-amber-500/30 shrink-0">
            ⚽
          </div>
          <div>
            <h1 className="text-xs sm:text-base font-black tracking-wider text-amber-300 uppercase leading-tight">
              Football Studio Royale
            </h1>
            <p className="hidden sm:block text-[9px] sm:text-[10px] text-emerald-200/70 tracking-widest uppercase">
              Home · Draw · Away — Top card wins
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-black/50 border border-amber-300/25 px-2.5 py-1 text-right">
            <div className="text-[8px] sm:text-[9px] uppercase tracking-widest text-emerald-200/70">Balance</div>
            <div className="text-xs sm:text-base font-black text-amber-300 leading-tight">Rs. {fmt(balance)}</div>
          </div>
          <div className="rounded-xl bg-black/50 border border-white/10 px-2.5 py-1 text-right">
            <div className="text-[8px] sm:text-[9px] uppercase tracking-widest text-emerald-200/70">Bet</div>
            <div className="text-xs sm:text-base font-black text-white leading-tight">Rs. {fmt(totalBet)}</div>
          </div>
        </div>
      </header>

      {/* ===== Center Game Area ===== */}
      <main className="flex-1 min-h-0 flex flex-col justify-between w-full max-w-4xl mx-auto gap-1 sm:gap-2 my-auto">
        {/* Status strip */}
        <div className="flex items-center justify-center shrink-0 min-h-[28px]">
          {phase === "betting" && (
            <div className="w-full max-w-xs sm:max-w-md">
              <div className="flex items-center justify-between text-[10px] sm:text-xs font-bold uppercase tracking-widest text-emerald-100 mb-0.5">
                <span className="text-amber-300">Place your bets</span>
                <span className={timeLeft <= 3 ? "text-red-400 font-extrabold" : "text-emerald-200"}>{timeLeft}s</span>
              </div>
              <div className="h-1.5 sm:h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  key={`bar-${stats.rounds}-${history.length}`}
                  className={`h-full rounded-full ${timeLeft <= 3 ? "bg-red-500" : "bg-gradient-to-r from-amber-300 to-amber-500"}`}
                  style={{ animation: `shrinkBar ${BET_SECONDS}s linear forwards` }}
                />
              </div>
            </div>
          )}
          {phase === "dealing" && (
            <div className="rounded-full bg-black/60 border border-amber-300/30 px-4 py-1 text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] text-amber-200 animate-pulse">
              Dealing cards…
            </div>
          )}
          {phase === "result" && outcome && (
            <div
              className={`pop-in rounded-xl px-4 py-1 border text-center shadow-lg ${
                outcome === "HOME"
                  ? "bg-red-600/90 border-red-300/50"
                  : outcome === "AWAY"
                  ? "bg-blue-600/90 border-blue-300/50"
                  : "bg-amber-500/95 border-amber-200/60 text-amber-950"
              }`}
            >
              <div className="text-xs sm:text-sm font-black uppercase tracking-wider leading-tight">
                {outcome === "DRAW" ? "It's a Draw!" : `${outcome} Wins!`}
              </div>
              {roundNet !== null && (
                <div className={`text-[10px] sm:text-xs font-bold leading-tight ${betWon ? "text-emerald-100" : outcome === "DRAW" ? "text-red-800" : "text-red-100"}`}>
                  {betWon ? `🎉 Won Rs. ${fmt(roundNet)}` : roundNet < 0 ? "No win" : `Rs. ${fmt(Math.abs(roundNet))}`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pitch & Cards */}
        <section className="relative rounded-2xl sm:rounded-3xl border border-amber-300/20 bg-emerald-950/65 backdrop-blur-md shadow-xl shadow-black/60 overflow-hidden shrink-0">
          <div className="absolute inset-0 pitch-lines pointer-events-none" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-28 w-28 sm:h-44 sm:w-44 pitch-circle pointer-events-none" />

          {/* Cards */}
          <div className="relative flex items-center justify-center gap-4 sm:gap-12 pt-2.5 pb-2 sm:pt-4 sm:pb-3">
            <div className="flex flex-col items-center gap-1">
              <span className="text-[9px] sm:text-xs font-black uppercase tracking-[0.25em] text-red-400">Home</span>
              <CardView card={cards.home} flipped={homeFlipped} glow={phase === "result" && outcome === "HOME"} />
            </div>
            <div className="flex flex-col items-center">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-black/60 border border-amber-300/30 flex items-center justify-center text-amber-300 font-black text-[10px] sm:text-xs shadow-inner">
                VS
              </div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-[9px] sm:text-xs font-black uppercase tracking-[0.25em] text-blue-400">Away</span>
              <CardView card={cards.away} flipped={awayFlipped} glow={phase === "result" && outcome === "AWAY"} />
            </div>
          </div>

          {/* Bet Spots */}
          <div className="relative flex gap-1.5 sm:gap-3 px-2 sm:px-4 pb-2.5 sm:pb-3.5">
            {/* HOME */}
            <button
              onClick={() => placeBet("HOME")}
              disabled={!canPlaceBet}
              aria-pressed={selectedOutcome === "HOME"}
              className={`${spotBase} ${!canPlaceBet ? "spot-disabled" : ""} ${selectedOutcome === "HOME" ? "ring-2 ring-amber-300" : ""} bg-gradient-to-b from-red-700/80 to-red-950/80 border-red-400/40 hover:scale-[1.02] active:scale-95 transition-all ${
                phase === "result" && outcome === "HOME" ? "winner-glow" : ""
              }`}
            >
              <div className="text-sm sm:text-xl font-black uppercase tracking-wider text-red-100">Home</div>
              <div className="text-[9px] sm:text-[11px] font-bold text-red-200/80 uppercase">Pays 1 : 1</div>
              {bets.HOME > 0 && (
                <div className="mt-1 flex justify-center">
                  <div className={`chip chip-mini h-7 w-7 sm:h-9 sm:w-9 text-[9px] sm:text-[11px] ${chipColor(bets.HOME)}`}>
                    {bets.HOME >= 1000 ? `${(bets.HOME / 1000).toFixed(bets.HOME % 1000 ? 1 : 0)}K` : bets.HOME}
                  </div>
                </div>
              )}
            </button>

            {/* DRAW */}
            <button
              onClick={() => placeBet("DRAW")}
              disabled={!canPlaceBet}
              aria-pressed={selectedOutcome === "DRAW"}
              className={`${spotBase} ${!canPlaceBet ? "spot-disabled" : ""} ${selectedOutcome === "DRAW" ? "ring-2 ring-amber-300" : ""} max-w-[32%] bg-gradient-to-b from-amber-500/80 to-amber-800/85 border-amber-200/50 hover:scale-[1.02] active:scale-95 transition-all ${
                phase === "result" && outcome === "DRAW" ? "winner-glow" : ""
              }`}
            >
              <div className="text-sm sm:text-xl font-black uppercase tracking-wider text-amber-50">Draw</div>
              <div className="text-[9px] sm:text-[11px] font-bold text-amber-100/90 uppercase">Pays 11 : 1</div>
              {bets.DRAW > 0 && (
                <div className="mt-1 flex justify-center">
                  <div className={`chip chip-mini h-7 w-7 sm:h-9 sm:w-9 text-[9px] sm:text-[11px] ${chipColor(bets.DRAW)}`}>
                    {bets.DRAW >= 1000 ? `${(bets.DRAW / 1000).toFixed(bets.DRAW % 1000 ? 1 : 0)}K` : bets.DRAW}
                  </div>
                </div>
              )}
            </button>

            {/* AWAY */}
            <button
              onClick={() => placeBet("AWAY")}
              disabled={!canPlaceBet}
              aria-pressed={selectedOutcome === "AWAY"}
              className={`${spotBase} ${!canPlaceBet ? "spot-disabled" : ""} ${selectedOutcome === "AWAY" ? "ring-2 ring-amber-300" : ""} bg-gradient-to-b from-blue-700/80 to-blue-950/80 border-blue-400/40 hover:scale-[1.02] active:scale-95 transition-all ${
                phase === "result" && outcome === "AWAY" ? "winner-glow" : ""
              }`}
            >
              <div className="text-sm sm:text-xl font-black uppercase tracking-wider text-blue-100">Away</div>
              <div className="text-[9px] sm:text-[11px] font-bold text-blue-200/80 uppercase">Pays 1 : 1</div>
              {bets.AWAY > 0 && (
                <div className="mt-1 flex justify-center">
                  <div className={`chip chip-mini h-7 w-7 sm:h-9 sm:w-9 text-[9px] sm:text-[11px] ${chipColor(bets.AWAY)}`}>
                    {bets.AWAY >= 1000 ? `${(bets.AWAY / 1000).toFixed(bets.AWAY % 1000 ? 1 : 0)}K` : bets.AWAY}
                  </div>
                </div>
              )}
            </button>
          </div>
        </section>

        {/* ===== Chips & Action Buttons ===== */}
        <section className="rounded-xl border border-white/10 bg-black/50 backdrop-blur-md px-2 sm:px-4 py-2 shrink-0">
          <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2.5">
            {CHIPS.map((v) => (
              <button
                key={v}
                onClick={() => setChip(v)}
                disabled={v > balance && chip !== v}
                className={`chip h-9 w-9 sm:h-11 sm:w-11 text-[10px] sm:text-xs ${chipColor(v)} ${
                  chip === v ? "chip-selected" : ""
                } ${v > balance ? "opacity-40" : ""}`}
              >
                {chipLabel(v)}
              </button>
            ))}
            <BetAmountInput value={chip} onChange={(n) => setChip(Math.max(1, n))} disabled={!canBet} />
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2.5">
            <button
              onClick={undoAll}
              disabled={!canBet || totalBet === 0}
              className="rounded-xl bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-bold uppercase tracking-wider text-white shadow-md shadow-rose-900/40 hover:scale-[1.02] active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed transition cursor-pointer"
            >
              ↩ Clear
            </button>
            <button
              onClick={rebet}
              disabled={!canBet || !(lastBets.HOME + lastBets.DRAW + lastBets.AWAY)}
              className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-bold uppercase tracking-wider text-white shadow-md shadow-blue-900/40 hover:scale-[1.02] active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed transition cursor-pointer"
            >
              🔁 Rebet
            </button>
            <button
              onClick={doubleBet}
              disabled={!canBet || totalBet === 0 || totalBet > balance}
              className="rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-black uppercase tracking-wider text-amber-950 shadow-md shadow-amber-900/30 hover:scale-[1.02] active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed transition cursor-pointer"
            >
              ✕2 Double
            </button>
            <button
              onClick={() => placeBet(selectedOutcome)}
              disabled={!canPlaceBet}
              className="rounded-xl bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-600 hover:from-emerald-400 hover:to-green-500 px-5 py-1.5 sm:px-6 sm:py-2 text-xs sm:text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-green-500/30 hover:scale-105 active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed transition cursor-pointer"
            >
              ✓ Place {selectedOutcome} · Rs. {fmt(chip)}
            </button>
          </div>

          <div className="mt-1 text-center text-[10px] sm:text-xs text-emerald-200/60">
            Selected chip: <span className="font-bold text-            amber-300">Rs. {fmt(chip)}</span> · Total bet:{" "}
                        <span className="font-bold text-white">Rs. {fmt(totalBet)}</span>
          </div>
        </section>

        {/* ===== Bottom History & Session strip ===== */}
        <section className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/45 backdrop-blur-md px-2.5 py-1.5 shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto min-w-0">
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-emerald-200/70 shrink-0">
              History:
            </span>
            <div className="flex items-center gap-1 overflow-x-auto">
              {history.length === 0 ? (
                <span className="text-[10px] text-white/40">No rounds yet</span>
              ) : (
                history.slice(0, 15).map((o, i) => <HistoryBubble key={`${history.length}-${i}`} o={o} latest={i === 0} />)
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-white/70">Rounds: <strong className="text-white">{stats.rounds}</strong></span>
            {balance < 10 && (
              <Link
                href="/player/deposit"
                className="rounded-lg bg-gradient-to-r from-emerald-400 to-green-600 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-950 hover:brightness-110 transition cursor-pointer"
              >
                Deposit
              </Link>
            )}
          </div>
        </section>
      </main>

      <footer className="shrink-0 text-center text-[9px] text-white/35 py-0.5">
        Shared live table. Higher card wins: A is high, 2 is low.
      </footer>
    </div>
  );
}
