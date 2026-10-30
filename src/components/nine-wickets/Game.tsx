"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMultiplayerGame } from "@/lib/useMultiplayerGame";
import { LiveMultiplayerBets } from "@/components/LiveMultiplayerBets";
import type { CricketOutcome } from "@/lib/multiplayer-rules";
import Stadium from "./Stadium";
import { BallStrip, BetSlip, MarketGrid, RulesModal, Scorecard, StatsHistory } from "./Panels";
import { playSound } from "./lib/sound";
import {
  BETTING_SECONDS,
  INITIAL_MATCH,
  MARKETS,
  TEAMS,
  formatCoins,
  formatOvers,
  type ActiveBet,
  type BallRecord,
  type BetRecord,
  type Phase,
} from "./lib/engine";
import "./nine-wickets.css";

const TICKER = [
  "🏏 PAK vs IND · T20 Live Cricket",
  "⚡ Ball-by-ball betting every 12 seconds",
  "🎯 Bet on Dot · 1 · 2 · FOUR · SIX · WICKET",
  "🔥 Boundary market pays 3.20x",
  "💎 SIX pays 9.00x",
  "Play with Rs. balance",
];

export default function NineWicketsGame({ backHref }: { backHref?: string }) {
  const live = useMultiplayerGame<CricketOutcome>("nine-wickets");
  const [selectedId, setSelectedId] = useState<string | null>("six");
  const [stake, setStake] = useState(100);
  const [lastBet, setLastBet] = useState<ActiveBet | null>(null);
  const [history, setHistory] = useState<BetRecord[]>([]);
  const [stats, setStats] = useState({ bets: 0, wins: 0, wagered: 0, returned: 0 });
  const [muted, setMuted] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const seen = useRef(new Set<string>());
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const balance = live.state?.balance ?? 0;
  const phase: Phase = live.state?.round.phase === "running" ? "bowling" : live.state?.round.phase ?? "betting";
  const round = live.state?.round.roundNo ?? 0;
  const animKey = round;
  const timeLeft = Math.max(0, Math.ceil(((live.state?.round.bettingEndsAt ?? live.now) - live.now) / 1000));
  const selected = MARKETS.find(m => m.id === selectedId) ?? null;
  const personal = live.state?.myBets.filter(b => b.status !== "cancelled") ?? [];
  const queued = live.state?.myQueuedBets.filter(b => b.status === "pending") ?? [];
  const currentBet = personal.find(b => b.status === "pending");
  const market = MARKETS.find(m => m.id === currentBet?.option);
  const bet: ActiveBet | null = currentBet && market ? { marketId: market.id, stake: currentBet.amount, odds: market.odds } : null;
  const tableHistory = [...(live.state?.history ?? [])];
  if (live.state?.round.result && !tableHistory.some(h => h.roundNo === round)) tableHistory.unshift({ roundNo: round, result: live.state.round.result });
  const match = live.state?.round.result?.match ?? tableHistory.find(h => h.result.match)?.result.match ?? INITIAL_MATCH;
  const balls: BallRecord[] = tableHistory.slice(0, 20).map(h => ({ id: h.roundNo, outcome: h.result.outcome,
    won: history.find(b => b.id === h.roundNo)?.win ?? null }));
  const stageOutcome = phase === "result" ? live.state?.round.result?.outcome ?? null : null;
  const settledBet = phase === "result" ? history.find(h => h.id === round) : null;
  const settled = settledBet ? { outcome: settledBet.outcome, win: settledBet.win, payout: settledBet.payout,
    bet: { stake: settledBet.stake } } : null;
  const commentary = stageOutcome ? `Shared ball #${round}: ${stageOutcome.toUpperCase()}` : phase === "bowling" ? "Ball in play — bets now enter the next shared round." : `Place your bet for shared ball #${round}.`;
  const batTeam = TEAMS[match.batting];
  const playerBets = live.state?.bets.filter(b => b.status !== "cancelled").length ?? 0;

  useEffect(() => {
    const state = live.state;
    if (!state?.round.result) return;
    const result = state.round.result;
    const timer = setTimeout(() => {
      const rows: BetRecord[] = [];
      for (const b of state.myBets) {
        if (b.poolPending || (b.status !== "win" && b.status !== "lose") || b.amount <= 0 || seen.current.has(b.id)) continue;
        seen.current.add(b.id);
        const market = MARKETS.find(m => m.id === b.option);
        rows.push({ id: b.roundNo, marketLabel: market?.label ?? b.option, stake: b.amount, odds: market?.odds ?? 0,
          outcome: result.outcome, win: b.status === "win", payout: b.payout });
      }
      if (rows.length) {
        setHistory(h => [...rows, ...h].slice(0, 40));
        setStats(s => rows.reduce((total, r) => ({ bets: total.bets + 1, wins: total.wins + (r.win ? 1 : 0),
          wagered: total.wagered + r.stake, returned: total.returned + r.payout }), s));
        if (!muted) playSound(rows.some(r => r.win) ? "win" : "lose");
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [live.state, muted]);
  async function placeBet(marketId: string, amount: number) {
    if (live.busy || !live.state) return;
    const reply = await live.place(marketId, amount);
    const market = MARKETS.find(m => m.id === marketId);
    if (mounted.current && !("error" in reply) && market) { setLastBet({ marketId, stake: amount, odds: market.odds }); if (!muted) playSound("chip"); }
  }
  function cancelBet() { if (currentBet && phase === "betting") void live.cancel(round, currentBet.id); }
  function rebet() { if (lastBet) { setSelectedId(lastBet.marketId); setStake(lastBet.stake); void placeBet(lastBet.marketId, lastBet.stake); } }
  function selectMarket(id: string) { setSelectedId(id); }
  function startBowl() { void live.refresh(); }

  return (
    <div className="nine-wickets-container h-full w-full flex flex-col min-h-0 bg-[#060a14] text-slate-100 overflow-hidden">
      {/* header */}
      <header className="flex-shrink-0 z-40 border-b border-white/10 bg-[#0a1020]/95 backdrop-blur shadow-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2 sm:px-5">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <Link
              href={backHref || "/player"}
              className="flex items-center gap-1 text-xs font-semibold text-amber-300/90 hover:text-amber-200 bg-white/5 hover:bg-white/10 border border-amber-400/30 px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
            >
              ← <span className="hidden sm:inline">Back</span>
            </Link>
            <span className="relative flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 via-amber-500 to-orange-600 shadow-md">
              <svg viewBox="0 0 24 24" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" stroke="#3b1d00" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="8.5" fill="#dc2626" stroke="#7f1d1d" />
                <path d="M6.2 8.2c3.2 1.6 3.2 6 0 7.6M17.8 8.2c-3.2 1.6-3.2 6 0 7.6" stroke="#fee2e2" strokeWidth="1.4" />
              </svg>
            </span>
            <div className="leading-none">
              <div className="text-base sm:text-xl font-black italic tracking-tight text-white">
                <span className="bg-gradient-to-b from-amber-200 to-amber-500 bg-clip-text text-transparent">9</span>{" "}
                WICKETS
              </div>
              <div className="hidden sm:block mt-1 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">Live Cricket Casino</div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-1.5 rounded-xl border border-amber-400/30 bg-black/40 px-2.5 py-1 sm:px-3 sm:py-1.5">
              <span className="text-sm sm:text-lg leading-none">🪙</span>
              <div className="leading-none">
                <div className="text-[8px] sm:text-[9px] font-bold uppercase tracking-widest text-slate-400">Balance</div>
                <div className="mt-0.5 text-xs sm:text-base font-black tabular-nums text-amber-300">{formatCoins(balance)}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { window.location.href = "/player/deposit"; }}
              className="hidden rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-xs font-extrabold text-white transition active:scale-95 sm:block"
            >
              + Rs.
            </button>
            <button
              type="button"
              onClick={() => {
                setMuted((m) => !m);
              }}
              aria-label={muted ? "Unmute" : "Mute"}
              className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-1.5 text-base sm:text-lg transition active:scale-95"
            >
              {muted ? "🔇" : "🔊"}
            </button>
            <button
              type="button"
              onClick={() => setShowRules(true)}
              aria-label="How to play"
              className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs sm:text-sm font-black text-slate-200 transition active:scale-95"
            >
              ?
            </button>
          </div>
        </div>

        {/* ticker */}
        <div className="overflow-hidden border-t border-white/[0.06] bg-black/30 py-1">
          <div className="nw-marquee flex w-max gap-10 whitespace-nowrap text-[10px] sm:text-[11px] font-semibold text-slate-400">
            {[...TICKER, ...TICKER].map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>
        </div>
      </header>

      {/* main scrollable body */}
      <main className="flex-1 min-h-0 overflow-y-auto mx-auto grid max-w-7xl gap-3 sm:gap-4 px-2 sm:px-5 py-2 sm:py-3 lg:grid-cols-[minmax(0,1fr)_370px] w-full">
        <div className="min-w-0 space-y-3 sm:space-y-4">
          <Stadium
            phase={phase}
            outcome={stageOutcome}
            animKey={animKey}
            timeLeft={timeLeft}
            total={BETTING_SECONDS}
            batColor={batTeam.color}
            fieldColor={TEAMS[match.batting === 0 ? 1 : 0].color}
            title={`${TEAMS[0].name} vs ${TEAMS[1].name} · T20`}
            bug={{
              code: batTeam.code,
              flag: batTeam.flag,
              score: `${match.runs}/${match.wickets}`,
              overs: formatOvers(match.balls),
              chase:
                match.target !== null
                  ? `NEED ${Math.max(match.target - match.runs, 0)} OFF ${120 - match.balls}`
                  : null,
            }}
            viewers={playerBets}
            result={
              settled?.bet
                ? { win: settled.win, payout: settled.payout, stake: settled.bet.stake }
                : null
            }
          />
          <Scorecard match={match} commentary={commentary} />
          <BallStrip balls={balls} />
          <MarketGrid selectedId={selectedId} bet={bet} locked={live.busy || !live.state} onSelect={selectMarket} />
        </div>

        <aside className="min-w-0 space-y-3 sm:space-y-4 lg:sticky lg:top-0 lg:self-start">
          <BetSlip
            phase={phase}
            timeLeft={timeLeft}
            market={selected}
            stake={stake}
            setStake={setStake}
            balance={balance}
            bet={bet}
            lastBet={lastBet}
            onPlace={() => selected && placeBet(selected.id, stake)}
            onCancel={cancelBet}
            onRebet={rebet}
            onBowlNow={startBowl}
            onAddCoins={() => { window.location.href = "/player/deposit"; }}
          />
          {phase !== "betting" && <button type="button" onClick={() => selected && placeBet(selected.id, stake)} className="w-full rounded-xl bg-emerald-600 p-2 font-bold">Bet next round</button>}
          <LiveMultiplayerBets state={live.state} error={live.error} />{queued.length > 0 && <button type="button" disabled={live.busy} onClick={() => void live.cancel(round + 1)}>Cancel next-round bets</button>}
          <StatsHistory stats={stats} history={history} />
        </aside>
      </main>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}
