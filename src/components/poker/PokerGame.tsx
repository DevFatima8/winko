"use client";
import { GameOverOverlay } from "@/components/GameOverOverlay";
import { gameSfx } from "@/lib/gameSfx";
import { useLiveTable } from "../teen-patti/useLiveTable";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGameBalance, usePoolLifecycle } from "@/lib/walletSync";
import {
  Card,
  DealResult,
  HAND_NAMES,
  PAYOUTS,
  RANK_LABEL,
  isDealResult,
  dealRound,
} from "./lib/poker";
import { BET_PRESETS } from "@/lib/betPresets";
import BetAmountInput from "@/components/BetAmountInput";
import "./poker.css";

import Link from "next/link";

const CHIPS = BET_PRESETS;
const START_BALANCE = 5000;

type Phase = "betting" | "dealing" | "result";

interface HistoryItem {
  id: number;
  bet: number;
  win: boolean;
  amount: number;
  hand: string;
}

function chipColor(v: number) {
  switch (v) {
    case 10: return "from-sky-500 to-sky-700 border-sky-300 shadow-sky-900/50";
    case 50: return "from-emerald-500 to-emerald-700 border-emerald-300 shadow-emerald-900/50";
    case 200: return "from-sky-500 to-sky-700 border-sky-300 shadow-sky-900/50";
    case 100: return "from-rose-500 to-rose-700 border-rose-300 shadow-rose-900/50";
    case 500: return "from-purple-500 to-purple-700 border-purple-300 shadow-purple-900/50";
    default: return "from-amber-400 to-amber-600 border-amber-200 shadow-amber-900/50";
  }
}

function PlayingCard({ card, hidden, delay = 0 }: { card?: Card; hidden?: boolean; delay?: number }) {
  const red = card && (card.suit === "♥" || card.suit === "♦");
  return (
    <div
      className="card-enter relative h-[clamp(56px,9.5vh,88px)] w-[clamp(38px,6.8vw,60px)] sm:h-28 sm:w-20 md:h-34 md:w-24"
      style={{ animationDelay: `${delay}ms`, perspective: "800px" }}
    >
      <div
        className="relative h-full w-full transition-transform duration-500"
        style={{ transformStyle: "preserve-3d", transform: hidden ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        {/* front */}
        <div
          className={`absolute inset-0 flex flex-col justify-between rounded-lg bg-white p-1 sm:p-2 shadow-[0_4px_14px_rgba(0,0,0,0.45)] ${red ? "text-red-600" : "text-slate-900"}`}
          style={{ backfaceVisibility: "hidden" }}
        >
          <div className="text-left text-[11px] font-bold leading-none sm:text-base">
            {card ? RANK_LABEL[card.rank] : ""}
            <div className="text-[9px] sm:text-sm">{card?.suit}</div>
          </div>
          <div className="text-center text-xl sm:text-3xl md:text-5xl">{card?.suit}</div>
          <div className="rotate-180 text-left text-[11px] font-bold leading-none sm:text-base">
            {card ? RANK_LABEL[card.rank] : ""}
            <div className="text-[9px] sm:text-sm">{card?.suit}</div>
          </div>
        </div>
        {/* back */}
        <div
          className="absolute inset-0 rounded-lg border-2 border-white/80 shadow-[0_4px_14px_rgba(0,0,0,0.45)]"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background:
              "repeating-linear-gradient(45deg,#7f1d1d 0 6px,#991b1b 6px 12px), #7f1d1d",
          }}
        >
          <div className="absolute inset-1 rounded-md border border-amber-300/70" />
          <div className="absolute inset-0 grid place-items-center text-xl text-amber-300/90 sm:text-3xl">♠</div>
        </div>
      </div>
    </div>
  );
}

export default function PokerGame({ backHref }: { backHref?: string }) {
  const [balance] = useGameBalance("poker", START_BALANCE);
  const pool = usePoolLifecycle("poker");
  const dealing = useRef(false);
  const [bet, setBet] = useState(0);
  const [phase, setPhase] = useState<Phase>("betting");
  const [endDismissed, setEndDismissed] = useState(false);
  const [round, setRound] = useState<DealResult | null>(null);
  const [revealed, setRevealed] = useState({ player: 0, dealer: 0 });
  const [showDealer, setShowDealer] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [payout, setPayout] = useState(0);
  const [msg, setMsg] = useState("Place your bet to start");
  const live = useLiveTable({
    queueNextRound: false, phase, balance, draft: { bet }, targets: ["bet"],
    start: () => deal(), reset: () => nextRound(false), apply: b => setBet(b.bet),
  });

  const stats = useMemo(() => {
    const wins = history.filter((h) => h.win).length;
    const total = history.length;
    const net = history.reduce((s, h) => s + (h.win ? h.amount : -h.amount), 0);
    return { wins, losses: total - wins, total, net, rate: total ? Math.round((wins / total) * 100) : 0 };
  }, [history]);

  const addChip = (v: number) => {
    if (phase !== "betting") return;
    gameSfx.chip();
    if (bet + v > balance) return;
    setBet((b) => b + v);
  };
  const clearBet = () => phase === "betting" && setBet(0);
  const allIn = () => phase === "betting" && setBet(balance);

  const deal = useCallback(async () => {
    if (dealing.current || pool.busy || phase !== "betting") return;
    const accepted = live.begin();
    if (!accepted) return;
    const wager = accepted.bet;
    setBet(wager);
    dealing.current = true;
    setPhase("dealing");
    setMsg("Dealing...");
    try {
      if (wager > 0 && (!await pool.resume() || !await pool.start(wager))) {
        live.release();
        setPhase("betting");
        setMsg("Bet confirmation failed. Retry before playing.");
        return;
      }
      const r = wager > 0 ? await pool.resolveServer({}) : dealRound(Math.random() < 0.5);
      if (!isDealResult(r)) {
        setPhase("betting");
        setMsg("Result confirmation failed. Retry or reopen the game to recover the accepted wager.");
        return;
      }
      gameSfx.deal();
      setShowDealer(false);
      setRevealed({ player: 0, dealer: 0 });
      setRound(r);
    } finally {
      dealing.current = false;
    }
  }, [bet, balance, phase]);

  // card reveal sequence
  useEffect(() => {
    if (phase !== "dealing" || !round) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= 5; i++) {
      timers.push(setTimeout(() => setRevealed((s) => ({ ...s, player: i })), i * 220));
      timers.push(setTimeout(() => setRevealed((s) => ({ ...s, dealer: i })), 1100 + i * 220));
    }
    timers.push(
      setTimeout(async () => {
        setShowDealer(true);
        if (bet <= 0) {
          setMsg(round.playerWins ? "Player wins" : "Dealer wins");
          setPhase("result");
          return;
        }
        const mult = round.playerWins ? PAYOUTS[round.playerScore.category] : 0;
        const won = round.playerWins ? bet + bet * mult : 0;
        setPayout(won);
        if (round.playerWins) {
          gameSfx.win();
          setMsg(pool.enabled ? `Provisional claim Rs. ${won}; daily settlement pending` : `You win with ${HAND_NAMES[round.playerScore.category]}! +Rs. ${(bet * mult).toLocaleString()}`);
        } else {
          gameSfx.lose();
          setMsg(pool.enabled ? "Daily payout pending — provisional claim Rs. 0" : "No win");
        }
        setHistory((h) => [
          {
            id: Date.now(),
            bet,
            win: round.playerWins,
            amount: round.playerWins ? bet * mult : bet,
            hand: HAND_NAMES[round.playerScore.category],
          },
          ...h,
        ].slice(0, 12));
        setEndDismissed(false);
    setPhase("result");
      }, 2700),
    );
    return () => timers.forEach(clearTimeout);
  }, [phase, round, bet]);

  const nextRound = (rebet: boolean) => {
    if (phase === "dealing") return;
    setPhase("betting");
    setRound(null);
    setShowDealer(false);
    setPayout(0);
    const nb = rebet ? Math.min(bet, balance) : 0;
    setBet(nb);
    setMsg(nb > 0 ? "Bet placed. Deal when ready." : "Place your bet to start");
  };

  const busted = balance <= 0 && bet === 0 && phase === "betting";

  return (
    <div className="poker-container h-full w-full flex flex-col min-h-0 bg-[#0b0f1a] text-white overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-[#111827] via-[#1a1030] to-[#111827] px-3 py-2 sm:px-6 sm:py-3 shadow-md z-10">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href={backHref || "/player"}
            className="flex items-center gap-1 text-xs font-semibold text-amber-300/90 hover:text-amber-200 bg-white/5 hover:bg-white/10 border border-amber-400/30 px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
          >
            ← <span className="hidden sm:inline">Back</span>
          </Link>
          <div className="grid h-8 w-8 sm:h-10 sm:w-10 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-amber-600 text-base sm:text-xl font-black text-black shadow-[0_0_15px_rgba(251,191,36,0.6)]">
            ♠
          </div>
          <div>
            <h1 className="text-sm font-extrabold tracking-wide sm:text-xl">
              <span className="bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-500 bg-clip-text text-transparent">
                ROYAL POKER
              </span>{" "}
              <span className="text-white/70">CASINO</span>
            </h1>
            <p className="hidden text-[9px] uppercase tracking-[0.2em] text-white/40 sm:block">Beat the dealer · 5 card showdown</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="rounded-xl border border-amber-400/40 bg-black/50 px-2.5 py-1 text-right sm:px-4 sm:py-1.5 shadow-inner">
            <div className="text-[9px] uppercase tracking-widest text-amber-300/70">Balance</div>
            <div className="text-sm font-black text-amber-300 sm:text-xl">Rs. {balance.toLocaleString()}</div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 w-full max-w-7xl mx-auto p-2 sm:p-4 overflow-y-auto lg:overflow-hidden grid lg:grid-cols-[1fr_310px] gap-3">
        {/* Table Felt */}
        <section className="relative overflow-hidden rounded-2xl sm:rounded-[2rem] border-[6px] sm:border-[8px] border-[#3b2412] shadow-[0_15px_50px_rgba(0,0,0,0.8),inset_0_0_60px_rgba(0,0,0,0.7)] flex flex-col justify-between p-3 sm:p-6 min-h-[380px] lg:min-h-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,#0f7a4a_0%,#0a5c37_50%,#053d24_100%)] pointer-events-none" />
          <div className="absolute inset-2 sm:inset-3 rounded-xl sm:rounded-[1.6rem] border border-amber-300/25 pointer-events-none" />
          <div className="pointer-events-none absolute inset-0 select-none grid place-items-center text-7xl sm:text-9xl font-black text-white/[0.03]">
            ♠♥
          </div>

          {/* Dealer Area */}
          <div className="relative z-10 flex flex-col items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-2 text-[10px] sm:text-xs uppercase tracking-[0.25em] text-white/70 font-semibold">
              <span className="h-px w-6 sm:w-10 bg-white/30" /> Dealer <span className="h-px w-6 sm:w-10 bg-white/30" />
            </div>
            <div className="flex justify-center gap-1.5 sm:gap-2.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <PlayingCard
                  key={round ? `${round.dealer[i].rank}${round.dealer[i].suit}-${i}` : `empty-d-${i}`}
                  card={round?.dealer[i]}
                  hidden={!round || revealed.dealer <= i || !showDealer}
                  delay={i * 60}
                />
              ))}
            </div>
            <div className={`h-5 text-xs sm:text-sm font-semibold transition-opacity duration-300 ${showDealer && round ? "text-amber-200" : "text-transparent"}`}>
              {round ? HAND_NAMES[round.dealerScore.category] : "-"}
            </div>
          </div>

          {/* Center message / pot */}
          <div className="relative z-10 my-1 flex flex-col items-center gap-2">
            <div
              className={`rounded-full px-4 py-1.5 text-center text-xs sm:text-base font-bold shadow-lg backdrop-blur transition-all duration-300 ${
                phase === "result"
                  ? round?.playerWins
                    ? "bg-amber-400 text-black shadow-[0_0_25px_rgba(251,191,36,0.8)] result-pop font-black"
                    : "bg-red-700 text-white shadow-[0_0_25px_rgba(185,28,28,0.7)] result-pop"
                  : "bg-black/50 border border-white/10 text-white/90"
              }`}
            >
              {msg}
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="rounded-xl border border-white/20 bg-black/60 px-3 py-1 sm:px-4 sm:py-1.5 text-center shadow-md">
                <div className="text-[9px] uppercase tracking-widest text-white/50">Current Bet</div>
                <div className="text-base sm:text-lg font-black text-amber-300">Rs. {bet.toLocaleString()}</div>
              </div>
              {phase === "result" && round?.playerWins && (
                <div className="rounded-xl border border-amber-300/60 bg-amber-400/20 px-3 py-1 sm:px-4 sm:py-1.5 text-center result-pop shadow-md">
                  <div className="text-[9px] uppercase tracking-widest text-amber-200/80">Payout</div>
                  <div className="text-base sm:text-lg font-black text-amber-200">Rs. {payout.toLocaleString()}</div>
                </div>
              )}
            </div>
          </div>

          {/* Player Area */}
          <div className="relative z-10 flex flex-col items-center gap-1.5 sm:gap-2">
            <div className={`h-5 text-xs sm:text-sm font-semibold transition-opacity duration-300 ${round && revealed.player === 5 ? "text-amber-200" : "text-transparent"}`}>
              {round ? `${HAND_NAMES[round.playerScore.category]} · pays ${PAYOUTS[round.playerScore.category]}:1` : "-"}
            </div>
            <div className="flex justify-center gap-1.5 sm:gap-2.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <PlayingCard
                  key={round ? `${round.player[i].rank}${round.player[i].suit}-${i}` : `empty-p-${i}`}
                  card={round?.player[i]}
                  hidden={!round || revealed.player <= i}
                  delay={i * 60}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 text-[10px] sm:text-xs uppercase tracking-[0.25em] text-white/70 font-semibold">
              <span className="h-px w-6 sm:w-10 bg-white/30" /> You <span className="h-px w-6 sm:w-10 bg-white/30" />
            </div>
          </div>
        </section>

        {/* Controls and Side panel */}
        <aside className="flex flex-col gap-2.5 sm:gap-3 overflow-y-auto pr-1">
          {/* Chips & Quick Actions */}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 shadow-md">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-white/70">Select Chip</h2>
              <span className="text-[10px] text-amber-400/80 font-mono">Min Rs. 10</span>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {CHIPS.map((c) => (
                <button
                  key={c}
                  disabled={phase !== "betting" || bet + c > balance}
                  onClick={() => addChip(c)}
                  className={`chip grid h-11 w-11 sm:h-12 sm:w-12 place-items-center rounded-full border-2 border-dashed bg-gradient-to-br text-xs font-black text-white shadow-lg transition duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 ${chipColor(c)}`}
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-black/40">{c >= 1000 ? "1K" : c}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-white/50">Custom bet</span>
              <BetAmountInput
                value={bet}
                onChange={(n) => setBet(Math.min(n, balance))}
                max={balance}
                disabled={phase !== "betting"}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={clearBet}
                disabled={phase !== "betting" || bet === 0}
                className="rounded-lg border border-rose-500/30 bg-rose-500/15 py-2 text-xs font-bold text-rose-300 transition-all hover:bg-rose-500/30 hover:border-rose-400 active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
              >
                Clear Bet
              </button>
              <button
                onClick={allIn}
                disabled={phase !== "betting" || balance === 0}
                className="rounded-lg border border-purple-500/40 bg-purple-600/25 py-2 text-xs font-bold text-purple-200 transition-all hover:bg-purple-600/45 hover:border-purple-300 active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
              >
                All In
              </button>
            </div>
          </div>

          {/* Big Action Buttons */}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 shadow-md">
            {phase === "betting" && !busted && (
              <button
                onClick={deal}
                disabled={bet <= 0}
                className="w-full rounded-xl bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-600 hover:from-emerald-400 hover:to-green-400 py-3.5 text-base sm:text-lg font-black uppercase tracking-widest text-white shadow-[0_0_25px_rgba(16,185,129,0.5)] transition-all duration-200 hover:shadow-[0_0_35px_rgba(16,185,129,0.7)] active:scale-98 disabled:opacity-35 disabled:shadow-none disabled:pointer-events-none"
              >
                DEAL
              </button>
            )}
            {phase === "dealing" && (
              <button disabled className="w-full animate-pulse rounded-xl bg-slate-700/60 border border-slate-600 py-3.5 text-base font-black uppercase tracking-widest text-white/70">
                Dealing…
              </button>
            )}
            {phase === "result" && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => nextRound(true)}
                  disabled={balance <= 0}
                  className="rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 py-3 text-xs sm:text-sm font-black uppercase tracking-wider text-black shadow-[0_0_15px_rgba(245,158,11,0.4)] transition-all duration-150 active:scale-95 disabled:opacity-30"
                >
                  Rebet
                </button>
                <button
                  onClick={() => nextRound(false)}
                  className="rounded-xl border border-white/25 bg-slate-800/80 hover:bg-slate-700 py-3 text-xs sm:text-sm font-black uppercase tracking-wider text-white transition-all active:scale-95"
                >
                  New Bet
                </button>
              </div>
            )}
            {busted && (
              <div className="text-center">
                <p className="mb-2 text-xs font-semibold text-rose-300">Out of chips!</p>
              </div>
            )}
          </div>

          {/* Quick Paytable and Stats in Accordion or Compact */}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 shadow-md">
            <h2 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-white/60">Pay Table (Winning Hand)</h2>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
              {[...HAND_NAMES].map((n, i) => ({ n, i })).reverse().slice(0, 6).map(({ n, i }) => (
                <div key={n} className="flex justify-between border-b border-white/5 py-0.5">
                  <span className="text-white/60 truncate pr-1">{n}</span>
                  <span className="font-mono font-bold text-amber-300">{PAYOUTS[i]}:1</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>
      <GameOverOverlay open={phase === "result" && bet > 0 && !!round && !endDismissed} winAmount={round?.playerWins ? payout : 0} result={pool.enabled ? "Daily payout pending. This hand records a provisional claim, not a wallet payment." : round?.playerWins ? "You won this hand." : "No win"} onPlayAgain={() => nextRound(false)} onClose={() => setEndDismissed(true)} />
    </div>
  );
}