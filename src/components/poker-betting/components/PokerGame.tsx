"use client";
import { gameSfx } from "@/lib/gameSfx";
import { isPokerBrowserDeal } from "@/lib/browserCardGuards";
import { GameOverOverlay } from "@/components/GameOverOverlay";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveTable } from "../../teen-patti/useLiveTable";
import { useGameBalance, usePoolLifecycle } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import BetAmountInput from "@/components/BetAmountInput";
import {
  Card,
  DealResult,
  HAND_NAMES,
  PAYOUTS,
  RANK_LABEL,
  dealRound,
} from "../lib/poker";

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
    case 10: return "from-sky-400 to-sky-600 border-sky-200";
    case 50: return "from-emerald-400 to-emerald-600 border-emerald-200";
    case 200: return "from-sky-400 to-sky-600 border-sky-200";
    case 100: return "from-rose-400 to-rose-600 border-rose-200";
    case 500: return "from-violet-400 to-violet-600 border-violet-200";
    default: return "from-amber-300 to-amber-500 border-amber-100";
  }
}

function PlayingCard({ card, hidden, delay = 0 }: { card?: Card; hidden?: boolean; delay?: number }) {
  const red = card && (card.suit === "♥" || card.suit === "♦");
  return (
    <div
      className="card-enter relative shrink-0 h-16 w-11 xs:h-20 xs:w-14 sm:h-26 sm:w-18 md:h-30 md:w-22"
      style={{ animationDelay: `${delay}ms`, perspective: "800px" }}
    >
      <div
        className="relative h-full w-full transition-transform duration-500"
        style={{ transformStyle: "preserve-3d", transform: hidden ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        {/* front */}
        <div
          className={`absolute inset-0 flex flex-col justify-between rounded-md sm:rounded-lg bg-white p-1 sm:p-1.5 shadow-[0_4px_14px_rgba(0,0,0,0.45)] ${red ? "text-red-600" : "text-slate-900"}`}
          style={{ backfaceVisibility: "hidden" }}
        >
          <div className="text-left text-[9px] font-bold leading-none sm:text-xs md:text-sm">
            {card ? RANK_LABEL[card.rank] : ""}
            <div className="text-[8px] sm:text-[10px] md:text-xs">{card?.suit}</div>
          </div>
          <div className="text-center text-xl sm:text-3xl md:text-4xl leading-none">{card?.suit}</div>
          <div className="rotate-180 text-left text-[9px] font-bold leading-none sm:text-xs md:text-sm">
            {card ? RANK_LABEL[card.rank] : ""}
            <div className="text-[8px] sm:text-[10px] md:text-xs">{card?.suit}</div>
          </div>
        </div>
        {/* back */}
        <div
          className="absolute inset-0 rounded-md sm:rounded-lg border sm:border-2 border-white/80 shadow-[0_4px_14px_rgba(0,0,0,0.45)]"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background:
              "repeating-linear-gradient(45deg,#7f1d1d 0 5px,#991b1b 5px 10px), #7f1d1d",
          }}
        >
          <div className="absolute inset-1 rounded border border-amber-300/70" />
          <div className="absolute inset-0 grid place-items-center text-lg sm:text-2xl text-amber-300/90">♠</div>
        </div>
      </div>
    </div>
  );
}

export default function PokerGame() {
  const [balance] = useGameBalance("poker-betting", START_BALANCE);
  const pool = usePoolLifecycle("poker-betting");
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
    queueNextRound: false,
    phase, balance, draft: { bet }, targets: ["bet"],
    start: () => deal(), reset: () => nextRound(false), apply: (b) => setBet(b.bet),
  });

  const [activeModal, setActiveModal] = useState<"paytable" | "stats" | "history" | null>(null);

  const stats = useMemo(() => {
    const wins = history.filter((h) => h.win).length;
    const total = history.length;
    return { wins, total };
  }, [history]);

  const addChip = (v: number) => {
    if (phase !== "betting") return;
    if (bet + v > balance) return;
    gameSfx.chip();
    setBet((b) => b + v);
  };
  const clearBet = () => phase === "betting" && setBet(0);
  const allIn = () => phase === "betting" && setBet(balance);

  const deal = useCallback(async () => {
    if (pool.busy) return;
    const accepted = live.begin();
    if (!accepted) return;
    setPhase("dealing");
    setBet(accepted.bet);
    gameSfx.deal();
    let r: DealResult;
    if (accepted.bet > 0) {
      if (!await pool.start(accepted.bet)) { live.release(); setPhase("betting"); return; }
      const confirmed = await pool.resolveServer({});
      if (!isPokerBrowserDeal(confirmed)) {
        setMsg("Result confirmation failed. Reopen to recover the accepted wager.");
        return;
      }
      r = confirmed;
    } else r = dealRound();
    setRound(r);
    setPhase("dealing");
    setShowDealer(false);
    setRevealed({ player: 0, dealer: 0 });
    setMsg("Dealing...");
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
          setMsg(pool.enabled ? `Provisional claim Rs. ${won}; daily settlement pending` : `You win with ${HAND_NAMES[round.playerScore.category]}! +Rs. ${(bet * mult).toLocaleString()}`);
        } else {
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
    <div className="h-full min-h-0 w-full flex flex-col overflow-x-hidden overflow-y-auto bg-[#0b0f1a] text-white px-1 sm:px-2 md:px-3 py-1 select-none">
      {live.controls}
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-gradient-to-r from-[#111827] via-[#1a1030] to-[#111827] px-2 sm:px-4 py-1.5 rounded-xl shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="grid h-8 w-8 sm:h-9 sm:w-9 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-amber-600 text-base sm:text-lg font-black text-black shadow-[0_0_15px_rgba(251,191,36,0.6)]">
            ♠
          </div>
          <div>
            <h1 className="text-sm font-extrabold tracking-wide sm:text-lg leading-tight">
              <span className="bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-500 bg-clip-text text-transparent">
                ROYAL POKER
              </span>{" "}
              <span className="text-white/60">CASINO</span>
            </h1>
            <p className="hidden xs:block text-[9px] uppercase tracking-[0.2em] text-white/40">5 Card Showdown</p>
          </div>
        </div>

        {/* Modal shortcuts */}
        <div className="order-last flex w-full items-center justify-center gap-1 sm:order-none sm:w-auto sm:gap-1.5">
          <button
            onClick={() => setActiveModal(activeModal === "paytable" ? null : "paytable")}
            className={`rounded-lg px-2 py-1 text-[10px] sm:text-xs font-semibold transition border ${
              activeModal === "paytable"
                ? "bg-amber-500/20 text-amber-300 border-amber-400/50"
                : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10"
            }`}
          >
            Pay Table
          </button>
          <button
            onClick={() => setActiveModal(activeModal === "stats" ? null : "stats")}
            className={`rounded-lg px-2 py-1 text-[10px] sm:text-xs font-semibold transition border ${
              activeModal === "stats"
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/50"
                : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10"
            }`}
          >
            Stats
          </button>
          <button
            onClick={() => setActiveModal(activeModal === "history" ? null : "history")}
            className={`rounded-lg px-2 py-1 text-[10px] sm:text-xs font-semibold transition border ${
              activeModal === "history"
                ? "bg-purple-500/20 text-purple-300 border-purple-400/50"
                : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10"
            }`}
          >
            History
          </button>
        </div>

        {/* Balance */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          <div className="rounded-lg sm:rounded-xl border border-amber-400/40 bg-black/40 px-2.5 py-1 text-right">
            <div className="text-[8px] sm:text-[9px] uppercase tracking-widest text-amber-300/70">Balance</div>
            <div className="text-xs sm:text-base font-black text-amber-300">Rs. {balance.toLocaleString()}</div>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 shrink-0 grid grid-rows-[minmax(min-content,1fr)_auto] gap-2 py-1.5 lg:grid-cols-[minmax(0,1fr)_280px] lg:grid-rows-1 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Poker Table Section */}
        <section className="relative min-w-0 flex flex-col justify-between overflow-hidden rounded-2xl sm:rounded-3xl border-4 sm:border-[6px] border-[#3b2412] shadow-[0_15px_40px_rgba(0,0,0,0.7),inset_0_0_50px_rgba(0,0,0,0.6)] p-2 sm:p-3">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,#0f7a4a_0%,#0a5c37_45%,#053d24_100%)] pointer-events-none" />
          <div className="absolute inset-1.5 sm:inset-2.5 rounded-xl sm:rounded-2xl border border-amber-300/25 pointer-events-none" />
          <div className="pointer-events-none absolute inset-0 select-none grid place-items-center text-7xl sm:text-9xl font-black text-white/[0.03]">
            ♠♥
          </div>

          <div className="relative flex-1 flex flex-col justify-between items-center gap-2 z-10">
            {/* Dealer Row */}
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className="flex items-center gap-2 text-[10px] sm:text-xs uppercase tracking-[0.25em] text-white/70 font-semibold">
                <span className="h-px w-6 sm:w-10 bg-white/30" /> Dealer <span className="h-px w-6 sm:w-10 bg-white/30" />
              </div>
              <div className="flex gap-1.5 sm:gap-2.5 justify-center">
                {[0, 1, 2, 3, 4].map((i) => (
                  <PlayingCard
                    key={round ? `${round.dealer[i].rank}${round.dealer[i].suit}-${i}` : `empty-d-${i}`}
                    card={round?.dealer[i]}
                    hidden={!round || revealed.dealer <= i || !showDealer}
                    delay={i * 50}
                  />
                ))}
              </div>
              <div className={`h-4 sm:h-5 text-xs font-semibold ${showDealer && round ? "text-amber-200" : "text-transparent"}`}>
                {round ? HAND_NAMES[round.dealerScore.category] : "-"}
              </div>
            </div>

            {/* Center Pot / Message */}
            <div className="my-auto flex flex-col items-center gap-1 sm:gap-1.5 shrink-0">
              <div
                className={`rounded-full px-3 py-1 sm:px-5 sm:py-1.5 text-center text-xs sm:text-sm font-bold shadow-md backdrop-blur ${
                  phase === "result"
                    ? round?.playerWins
                      ? "bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 font-black shadow-[0_0_20px_rgba(251,191,36,0.7)] result-pop"
                      : "bg-gradient-to-r from-rose-700 to-red-700 text-white shadow-[0_0_20px_rgba(185,28,28,0.6)] result-pop"
                    : "bg-black/60 text-white/90 border border-white/10"
                }`}
              >
                {msg}
              </div>
              <div className="flex flex-wrap justify-center items-center gap-2">
                <div className="rounded-lg border border-white/20 bg-black/50 px-2.5 py-0.5 sm:py-1 text-center">
                  <span className="text-[8px] uppercase tracking-wider text-white/50 mr-1.5">Bet</span>
                  <span className="text-xs sm:text-sm font-black text-amber-300">Rs. {bet.toLocaleString()}</span>
                </div>
                {phase === "result" && bet > 0 && round?.playerWins && (
                  <div className="rounded-lg border border-amber-300/50 bg-amber-400/20 px-2.5 py-0.5 sm:py-1 text-center result-pop">
                    <span className="text-[8px] uppercase tracking-wider text-amber-200/70 mr-1.5">{pool.enabled ? "Provisional claim" : "Win"}</span>
                    <span className="text-xs sm:text-sm font-black text-amber-200">+Rs. {payout.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Player Row */}
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className={`h-4 sm:h-5 text-xs font-semibold ${round && revealed.player === 5 ? "text-amber-200" : "text-transparent"}`}>
                {round ? `${HAND_NAMES[round.playerScore.category]} · pays ${PAYOUTS[round.playerScore.category]}:1` : "-"}
              </div>
              <div className="flex gap-1.5 sm:gap-2.5 justify-center">
                {[0, 1, 2, 3, 4].map((i) => (
                  <PlayingCard
                    key={round ? `${round.player[i].rank}${round.player[i].suit}-${i}` : `empty-p-${i}`}
                    card={round?.player[i]}
                    hidden={!round || revealed.player <= i}
                    delay={i * 50}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 text-[10px] sm:text-xs uppercase tracking-[0.25em] text-white/70 font-semibold">
                <span className="h-px w-6 sm:w-10 bg-white/30" /> You <span className="h-px w-6 sm:w-10 bg-white/30" />
              </div>
            </div>
          </div>
        </section>

        {/* Side / Bottom Controls Panel */}
        <aside className="min-w-0 shrink-0 flex flex-col justify-between gap-1.5">
          {/* Chips Selection */}
          <div className="rounded-xl border border-white/10 bg-black/40 p-2 sm:p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-white/60">Chips</span>
              <div className="flex gap-1.5">
                <button
                  onClick={clearBet}
                  disabled={phase !== "betting" || bet === 0}
                  className="rounded-md border border-rose-500/40 bg-gradient-to-r from-rose-950/60 to-red-950/60 px-2 py-0.5 text-[10px] font-bold text-rose-300 transition hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
                >
                  Clear
                </button>
                <button
                  onClick={allIn}
                  disabled={phase !== "betting" || balance === 0}
                  className="rounded-md border border-amber-500/50 bg-gradient-to-r from-amber-950/60 to-orange-950/60 px-2 py-0.5 text-[10px] font-bold text-amber-200 transition hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
                >
                  All In
                </button>
              </div>
            </div>
            <div className="flex justify-center gap-1.5 sm:gap-2">
              {CHIPS.map((c) => (
                <button
                  key={c}
                  disabled={phase !== "betting" || bet + c > balance}
                  onClick={() => addChip(c)}
                  className={`chip grid h-10 w-10 sm:h-12 sm:w-12 place-items-center rounded-full border-2 sm:border-[3px] border-dashed bg-gradient-to-br text-[10px] sm:text-xs font-black text-white shadow-md transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 ${chipColor(c)}`}
                >
                  <span className="grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-full bg-black/35 font-bold">
                    {c >= 1000 ? "1K" : c}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-1.5 flex justify-center">
              <BetAmountInput
                value={bet}
                onChange={(n) => setBet(Math.min(n, balance))}
                max={balance}
                disabled={phase !== "betting"}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="rounded-xl border border-white/10 bg-black/40 p-2 sm:p-3">
            {phase === "betting" && !busted && (
              <button
                onClick={deal}
                disabled={bet <= 0}
                className="w-full rounded-xl bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 py-2.5 sm:py-3.5 text-sm sm:text-base font-black uppercase tracking-widest text-slate-950 shadow-lg shadow-amber-500/30 transition hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:shadow-none"
              >
                Deal {bet > 0 ? `· Rs. ${bet.toLocaleString()}` : ""}
              </button>
            )}
            {phase === "dealing" && (
              <button disabled className="w-full animate-pulse rounded-xl bg-white/10 py-2.5 sm:py-3.5 text-sm sm:text-base font-black uppercase tracking-widest text-white/60">
                Dealing…
              </button>
            )}
            {phase === "result" && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => nextRound(true)}
                  disabled={balance <= 0}
                  className="rounded-xl bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 py-2.5 sm:py-3 text-xs sm:text-sm font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:brightness-110 active:scale-95 disabled:opacity-30"
                >
                  Rebet (Rs. {Math.min(bet, balance)})
                </button>
                <button
                  onClick={() => nextRound(false)}
                  className="rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 border border-cyan-400/40 py-2.5 sm:py-3 text-xs sm:text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-cyan-600/30 transition hover:brightness-110 active:scale-95"
                >
                  New Bet
                </button>
              </div>
            )}
            {busted && (
              <div className="text-center">
                <p className="mb-1 text-xs text-rose-300 font-semibold">You&apos;re out of chips!</p>
              </div>
            )}
          </div>

          {/* Desktop Preview Stats */}
          <div className="hidden lg:block rounded-xl border border-white/10 bg-black/40 p-2.5">
            <div className="grid grid-cols-2 gap-1 mt-2 text-center text-[10px]">
              <div className="rounded bg-white/5 p-1">
                <div className="text-white/50 text-[8px]">HANDS</div>
                <div className="font-bold">{stats.total}</div>
              </div>
              <div className="rounded bg-white/5 p-1">
                <div className="text-emerald-400 text-[8px]">WINS</div>
                <div className="font-bold text-emerald-400">{stats.wins}</div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Info Modals / Drawers */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md max-h-[80vh] flex flex-col rounded-2xl border border-white/15 bg-gradient-to-b from-[#171f34] to-[#0c1220] p-4 shadow-2xl text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-3">
              <h3 className="font-bold text-base sm:text-lg">
                {activeModal === "paytable" && "Payout Table"}
                {activeModal === "stats" && "Session Statistics"}
                {activeModal === "history" && "Recent Hands"}
              </h3>
              <button
                onClick={() => setActiveModal(null)}
                className="rounded-lg bg-white/10 px-2 py-1 text-xs font-bold text-white/70 hover:bg-white/20"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              {activeModal === "paytable" && (
                <ul className="space-y-1.5 text-xs">
                  {[...HAND_NAMES].map((n, i) => ({ n, i })).reverse().map(({ n, i }) => (
                    <li key={n} className="flex justify-between items-center rounded-lg bg-white/5 px-3 py-1.5">
                      <span className="text-white/80 font-medium">{n}</span>
                      <span className="font-mono font-bold text-amber-300">{PAYOUTS[i]}:1</span>
                    </li>
                  ))}
                </ul>
              )}

              {activeModal === "stats" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-lg bg-black/40 p-2">
                      <div className="text-base font-black">{stats.total}</div>
                      <div className="text-[9px] uppercase text-white/50">Hands</div>
                    </div>
                    <div className="rounded-lg bg-black/40 p-2">
                      <div className="text-base font-black text-emerald-400">{stats.wins}</div>
                      <div className="text-[9px] uppercase text-white/50">Wins</div>
                    </div>
                  </div>
                </div>
              )}

              {activeModal === "history" && (
                <div>
                  {history.length === 0 ? (
                    <p className="text-center text-xs text-white/40 py-6">No hands played yet</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {history.map((h) => (
                        <li key={h.id} className="flex items-center justify-between rounded-lg bg-black/40 px-3 py-2 text-xs">
                          <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${h.win ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                            {h.win ? "WIN" : "No win"}
                          </span>
                          <span className="text-white/70">{h.hand}</span>
                          <span className={`font-mono font-bold ${h.win ? "text-emerald-300" : "text-rose-300"}`}>
                            {h.win ? `+Rs. ${h.amount.toLocaleString()}` : "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <GameOverOverlay open={phase === "result" && bet > 0 && !!round && !endDismissed} winAmount={round?.playerWins ? payout : 0} result={pool.enabled ? "Daily payout pending. This hand records a provisional claim, not a wallet payment." : round?.playerWins ? "You won this hand." : "No win"} onPlayAgain={() => nextRound(false)} onClose={() => setEndDismissed(true)} />
    </div>
  );
}