"use client";
import { GameOverOverlay } from "@/components/GameOverOverlay";
import { gameSfx } from "@/lib/gameSfx";
import { isMuflisBrowserDeal } from "@/lib/browserCardGuards";

import { useState, useCallback, useRef, useEffect } from "react";
import { useLiveTable } from "../teen-patti/useLiveTable";
import { useGameBalance, usePoolLifecycle } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import BetAmountInput from "@/components/BetAmountInput";
import PlayingCard from "./PlayingCard";
import {
  DealResult,
  dealRigged,
  decideOutcome,
  EvaluatedHand,
} from "./lib/muflis";
import "./muflis.css";

type Phase = "betting" | "dealing" | "revealed";

const CHIP_STYLES = [
  { color: "from-emerald-400 to-emerald-600", ring: "ring-emerald-200" },
  { color: "from-violet-400 to-violet-600", ring: "ring-violet-200" },
  { color: "from-sky-400 to-sky-600", ring: "ring-sky-200" },
  { color: "from-rose-400 to-rose-600", ring: "ring-rose-200" },
  { color: "from-amber-400 to-amber-600", ring: "ring-amber-200" },
];
const CHIPS = BET_PRESETS.map((value, i) => ({ value: value as number, ...CHIP_STYLES[i] }));

const START_BALANCE = 5000;

export default function MuflisGame({ backHref = "/player" }: { backHref?: string }) {
  const [balance] = useGameBalance("muflis", START_BALANCE);
  const pool = usePoolLifecycle("muflis");
  const [bet, setBet] = useState(0);
  const [phase, setPhase] = useState<Phase>("betting");
  const [endDismissed, setEndDismissed] = useState(false);
  const [result, setResult] = useState<DealResult | null>(null);
  const [revealedCards, setRevealedCards] = useState(0);
  const [message, setMessage] = useState("Apni bet lagayein aur DEAL dabayein");
  const [floatText, setFloatText] = useState<{ text: string; win: boolean } | null>(null);
  const [lastWin, setLastWin] = useState<number>(0);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mounted = useRef(false);
  const live = useLiveTable({
    queueNextRound: false,
    phase, balance, draft: { bet }, targets: ["bet"],
    start: () => deal(), reset: () => nextRound(), apply: (b) => setBet(b.bet),
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const addChip = (v: number) => {
    if (phase !== "betting") return;
    gameSfx.chip();
    if (bet + v > balance) {
      setMessage("Itni chips nahi hain!");
      return;
    }
    setBet((b) => b + v);
  };

  const clearBet = () => {
    if (phase !== "betting") return;
    setBet(0);
  };

  const maxBet = () => {
    if (phase !== "betting") return;
    setBet(balance);
  };

  const deal = useCallback(async () => {
    if (pool.busy) return;
    if (phase !== "betting") return;
    gameSfx.deal();
    const accepted = live.begin();
    if (!accepted) return;
    setPhase("dealing");
    const wager = accepted.bet;
    setBet(wager);
    timers.current.forEach(clearTimeout);
    timers.current = [];

    let dealt: DealResult;
    if (wager > 0) {
      if (!await pool.start(wager)) { live.release(); setPhase("betting"); return; }
      const confirmed = await pool.resolveServer({});
      if (!isMuflisBrowserDeal(confirmed)) {
        setMessage("Result confirmation failed. Reopen to recover the accepted wager.");
        return;
      }
      dealt = confirmed;
    } else dealt = dealRigged(decideOutcome());
    if (!mounted.current) return;
    setPhase("dealing");
    setRevealedCards(0);
    setFloatText(null);
    setMessage("Cards baant rahe hain...");

    setResult(dealt);

    // Alternate player/dealer cards, then leave both hands visible before settling.
    for (let count = 1; count <= 6; count++) {
      timers.current.push(setTimeout(() => {
        setRevealedCards(count);
        gameSfx.flip();
      }, 300 + (count - 1) * 650));
    }
    const t1 = setTimeout(async () => {
      if (wager <= 0) {
        setEndDismissed(false);
        setPhase("revealed");
        setMessage(dealt.playerWins ? "Player wins" : "Dealer wins");
        return;
      }
      if (!mounted.current) return;
      setEndDismissed(false);
      setPhase("revealed");

      if (dealt.playerWins) {
        gameSfx.win();
        const payout = wager * 2;
        setLastWin(payout);
        setWins((w) => w + 1);
        setMessage(pool.enabled ? `Daily payout pending — provisional claim Rs. ${payout}` : "Aap jeet gaye! Sabse chhota haath jeeta 🎉");
        setFloatText({ text: pool.enabled ? `Provisional claim Rs. ${payout}` : `+Rs. ${payout}`, win: true });
      } else {
        gameSfx.lose();
        setLastWin(0);
        setLosses((l) => l + 1);
        setMessage(pool.enabled ? "Daily payout pending — provisional claim Rs. 0" : "");
        setFloatText({ text: pool.enabled ? "Provisional claim Rs. 0" : "", win: false });
      }
    }, 5000);
    timers.current.push(t1);
  }, [bet, balance, phase]);

  const nextRound = () => {
    if (phase === "dealing") return;
    setBet(0);
    setPhase("betting");
    setResult(null);
    setRevealedCards(0);
    setFloatText(null);
    setMessage(
      balance <= 0 ? "Insufficient balance." : "Apni bet lagayein aur DEAL dabayein"
    );
  };

  const totalGames = wins + losses;

  return (
    <div className="muflis-container relative h-full w-full overflow-hidden select-none">
      <main className="felt h-full w-full text-white flex flex-col justify-between overflow-hidden">
        {live.controls}
        <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-2 sm:px-4 py-1.5 sm:py-2.5 justify-between overflow-hidden">
          {/* Header */}
          <header className="flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <a
                href={backHref}
                className="inline-flex items-center gap-1 rounded-lg border border-yellow-500/40 bg-black/60 hover:bg-black/80 px-2.5 py-1 text-xs font-semibold text-yellow-300 transition hover:scale-105 active:scale-95 cursor-pointer"
              >
                ← Back
              </a>
              <div>
                <h1 className="gold-text text-xl sm:text-3xl font-black tracking-wide drop-shadow leading-tight">
                  MUFLIS
                </h1>
                <p className="text-[9px] sm:text-xs uppercase tracking-[0.2em] text-yellow-200/70">
                  Lowball · Sabse Chhota Haath Jeeta
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-xl border border-yellow-500/30 bg-black/50 px-2.5 py-1 text-center backdrop-blur">
                <div className="text-[8px] sm:text-[9px] uppercase tracking-widest text-yellow-200/60 font-bold">Balance</div>
                <div className="text-sm sm:text-base font-black text-yellow-300 tabular-nums">
                  Rs. {balance.toLocaleString()}
                </div>
              </div>
            </div>
          </header>

          {/* Table */}
          <section className="relative my-1 flex-1 min-h-0 rounded-2xl border-2 border-yellow-600/30 bg-black/20 p-2 sm:p-3 shadow-inner flex flex-col justify-between overflow-hidden">
            {/* Floating win/loss */}
            {floatText && (
              <div
                className={`animate-float pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 text-2xl sm:text-4xl font-black ${
                  floatText.win ? "text-green-300" : "text-red-300"
                }`}
                style={{ textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}
              >
                {floatText.text}
              </div>
            )}

            {/* Dealer */}
            <HandRow
              label="DEALER"
              hand={result?.dealerHand}
              revealedCount={Math.floor(revealedCards / 2)}
              phase={phase}
              isWinner={phase === "revealed" && !!result && !result.playerWins}
            />

            {/* Center info */}
            <div className="my-1 flex flex-col items-center justify-center gap-0.5 shrink-0">
              <div className="rounded-full border border-yellow-500/40 bg-black/60 px-3 py-1 text-center text-xs sm:text-sm font-semibold text-yellow-100 backdrop-blur">
                {message}
              </div>
              {bet > 0 && (
                <div className="mt-0.5 flex items-center gap-1.5 rounded-full bg-yellow-500/20 px-2.5 py-0.5 text-xs font-bold text-yellow-200">
                  POT: Rs. {bet.toLocaleString()}
                </div>
              )}
            </div>

            {/* Player */}
            <HandRow
              label="AAP (PLAYER)"
              hand={result?.playerHand}
              revealedCount={Math.ceil(revealedCards / 2)}
              phase={phase}
              isWinner={phase === "revealed" && !!result && result.playerWins}
            />
          </section>

          {/* Controls */}
          <section className="shrink-0 pt-1">
            {/* Chips */}
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  onClick={() => addChip(chip.value)}
                  disabled={phase !== "betting" || bet + chip.value > balance}
                  className={`group relative h-10 w-10 sm:h-13 sm:w-13 rounded-full bg-gradient-to-b ${chip.color} font-black text-white shadow-lg ring-2 ${chip.ring} transition-transform hover:-translate-y-1 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 cursor-pointer`}
                >
                  <span className="absolute inset-0.5 rounded-full border border-dashed border-white/50" />
                  <span className="relative text-xs sm:text-sm drop-shadow">{chip.value}</span>
                </button>
              ))}
              <BetAmountInput
                value={bet}
                onChange={(n) => setBet(Math.min(n, balance))}
                max={balance}
                disabled={phase !== "betting"}
              />
            </div>

            {/* Buttons */}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2.5">
              <button
                onClick={clearBet}
                disabled={phase !== "betting" || bet === 0}
                className="rounded-xl border border-rose-500/40 bg-gradient-to-b from-rose-950/60 to-rose-900/40 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold uppercase tracking-wide text-rose-200 transition hover:from-rose-900/80 hover:to-rose-800/60 hover:scale-105 active:scale-95 disabled:opacity-40 cursor-pointer"
              >
                Clear
              </button>
              <button
                onClick={maxBet}
                disabled={phase !== "betting" || balance === 0}
                className="rounded-xl border border-amber-400/50 bg-gradient-to-b from-amber-600 to-orange-700 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-black uppercase tracking-wide text-white transition hover:from-amber-500 hover:to-orange-600 hover:scale-105 active:scale-95 disabled:opacity-40 cursor-pointer"
              >
                Max
              </button>

              {phase === "revealed" ? (
                <button
                  onClick={nextRound}
                  className="chip-pulse rounded-xl border-2 border-yellow-200 bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-500 px-6 sm:px-8 py-2 sm:py-2.5 text-sm sm:text-base font-black uppercase tracking-wider text-slate-950 shadow-lg transition hover:brightness-110 hover:scale-105 active:scale-95 cursor-pointer"
                >
                  Next Round ▶
                </button>
              ) : (
                <button
                  onClick={deal}
                  disabled={phase !== "betting" || bet <= 0}
                  className="rounded-xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-500 to-green-700 px-7 sm:px-10 py-2 sm:py-2.5 text-sm sm:text-base font-black uppercase tracking-wider text-white shadow-[0_0_15px_rgba(16,185,129,0.5)] transition hover:brightness-110 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  {phase === "dealing" ? "..." : "Deal"}
                </button>
              )}

            </div>

            {/* Stats */}
            <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2 text-center text-[10px] sm:text-xs">
              <Stat label="Total Rounds" value={totalGames} color="text-slate-200" />
              <Stat label="Status" value="Live Active" color="text-emerald-300" />
              <Stat label={pool.enabled ? "Provisional claim" : "Last Win"} value={lastWin > 0 ? `${pool.enabled ? "" : "+"}Rs. ${lastWin}` : "—"} color="text-yellow-200" />
            </div>
          </section>
        </div>
      </main>
      <GameOverOverlay open={phase === "revealed" && bet > 0 && !!result && !endDismissed} winAmount={result?.playerWins ? lastWin : 0} result={pool.enabled ? "Daily payout pending. This hand records a provisional claim, not a wallet payment." : result?.playerWins ? "You won this hand." : ""} onPlayAgain={nextRound} onClose={() => setEndDismissed(true)} />
    </div>
  );
}

function HandRow({
  label,
  hand,
  revealedCount,
  phase,
  isWinner,
}: {
  label: string;
  hand?: EvaluatedHand;
  revealedCount: number;
  phase: Phase;
  isWinner: boolean;
}) {
  const showPlaceholders = phase === "betting" || !hand;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <span
          className={`text-xs sm:text-sm font-bold uppercase tracking-widest ${
            isWinner ? "text-green-300" : "text-yellow-100/70"
          }`}
        >
          {label}
        </span>
        {isWinner && (
          <span className="animate-pop rounded-full bg-green-500/90 px-2 py-0.5 text-[10px] font-black text-black">
            WINNER 🏆
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        {showPlaceholders
          ? [0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-24 w-16 sm:h-28 sm:w-20 rounded-lg border-2 border-dashed border-white/15 bg-white/5"
              />
            ))
          : hand!.cards.map((c, i) => (
              <PlayingCard
                key={`${c.rank}-${c.suit}-${i}`}
                card={c}
                faceUp={i < revealedCount}
                delay={i * 150}
                highlight={isWinner && i < revealedCount}
              />
            ))}
      </div>
      {phase === "revealed" && hand && revealedCount === hand.cards.length && (
        <div
          className={`animate-pop rounded-full px-3 py-0.5 text-[10px] sm:text-xs font-bold ${
            isWinner ? "bg-green-500/20 text-green-200" : "bg-black/30 text-yellow-100/80"
          }`}
        >
          {hand.category}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-lg bg-black/25 px-3 py-1.5 backdrop-blur">
      <div className="text-[9px] uppercase tracking-widest text-white/50">{label}</div>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}
