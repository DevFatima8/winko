"use client";
import { gameSfx } from "@/lib/gameSfx";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMultiplayerGame } from "@/lib/useMultiplayerGame";
import { poolRoundMessage } from "@/lib/multiplayer-types";
import { LiveMultiplayerBets } from "@/components/LiveMultiplayerBets";
import type { Card, Cards32Outcome } from "@/lib/multiplayer-rules";
import { BET_PRESETS } from "@/lib/betPresets";
import "./32-cards.css";

type BetKey = "A" | "B" | "C" | "D" | "ODD" | "EVEN";

const PLAYERS = [
  { key: "A" as const, name: "Player 8", base: 8, odds: 12.2, color: "from-red-700 to-red-900" },
  { key: "B" as const, name: "Player 9", base: 9, odds: 6.2, color: "from-blue-700 to-blue-900" },
  { key: "C" as const, name: "Player 10", base: 10, odds: 3.25, color: "from-emerald-700 to-emerald-900" },
  { key: "D" as const, name: "Player 11", base: 11, odds: 2.05, color: "from-amber-600 to-amber-800" },
];
const SIDE = [
  { key: "ODD" as const, name: "ODD (Winner)", odds: 1.95 },
  { key: "EVEN" as const, name: "EVEN (Winner)", odds: 1.95 },
];
const CHIPS = BET_PRESETS;
const CHIP_COLOR: Record<number, string> = {
  50: "bg-red-600", 100: "bg-green-600", 200: "bg-sky-500", 500: "bg-purple-600", 1000: "bg-yellow-500",
};
type Round = Cards32Outcome;
function betWins(k: BetKey, r: Round) {
  const t = r.totals[r.winner];
  if (k === "ODD") return t % 2 === 1;
  if (k === "EVEN") return t % 2 === 0;
  return PLAYERS[r.winner].key === k;
}

function PlayingCard({ c, hidden }: { c?: Card; hidden?: boolean }) {
  if (!c || hidden)
    return <div className="w-10 h-14 sm:w-12 sm:h-16 rounded-md border-2 border-yellow-400/60 bg-[repeating-linear-gradient(45deg,#7f1d1d_0_6px,#991b1b_6px_12px)] shadow" />;
  const red = c.suit === "♥" || c.suit === "♦";
  return (
    <div className={`card-in w-10 h-14 sm:w-12 sm:h-16 rounded-md bg-white shadow-lg flex flex-col justify-between p-1 ${red ? "text-red-600" : "text-black"}`}>
      <span className="text-xs sm:text-sm font-bold leading-none">{c.rank}</span>
      <span className="text-lg sm:text-xl text-center leading-none">{c.suit}</span>
      <span className="text-xs sm:text-sm font-bold leading-none self-end rotate-180">{c.rank}</span>
    </div>
  );
}

export default function Game({ backHref }: { backHref?: string }) {
  const live = useMultiplayerGame<Round>("32-cards");
  const [chip, setChip] = useState(100);
  const lastBets = useRef<Partial<Record<BetKey, number>>>({});
  const notified = useRef<number | null>(null);
  const state = live.state;
  const balance = state?.balance ?? 0;
  const phase = state?.round.phase === "running" ? "dealing" : state?.round.phase ?? "betting";
  const round = state?.round.result ?? null;
  const timer = Math.max(0, Math.ceil(((state?.round.bettingEndsAt ?? live.now) - live.now) / 1000));
  const bettingOpen = !!state && phase === "betting" && live.now < state.round.bettingEndsAt && !live.busy;
  const roundNo = state?.round.roundNo ?? 0;
  const totalCards = round ? round.draws.reduce((sum, draw) => sum + draw.length, 0) : 0;
  // Deal every card during the closed-betting phase; the winner is announced only once all are on the table.
  const dealSpan = state ? state.round.resultAt - state.round.bettingEndsAt - 800 : 0;
  const perCard = totalCards ? Math.min(900, Math.max(250, dealSpan / totalCards)) : 0;
  const shown = !round || !state ? 0 : phase === "result" ? totalCards :
    Math.min(totalCards, Math.max(0, Math.floor((live.now - state.round.bettingEndsAt - 300) / perCard) + 1));
  const personal = state?.myBets.filter((bet) => bet.status !== "cancelled") ?? [];
  const bets = personal.reduce<Partial<Record<BetKey, number>>>((sum, bet) => {
    const key = bet.option as BetKey;
    sum[key] = (sum[key] ?? 0) + bet.amount;
    return sum;
  }, {});
  const payout = personal.reduce((sum, bet) => sum + bet.payout, 0);
  const poolMessage = poolRoundMessage(personal);
  const history = (state?.history ?? []).slice(0, 40).map(({ result }) => ({ w: result.winner, t: result.totals[result.winner] }));
  const labelOf = (k: BetKey) => PLAYERS.find((p) => p.key === k)?.name ?? SIDE.find((s) => s.key === k)!.name;

  const totalBet = Object.values(bets).reduce((a, b) => a + (b ?? 0), 0);
  const msg = !state ? "Connecting to live table…" : !round || phase !== "result" ? "NO MORE BETS" : totalBet > 0 ?
    poolMessage ?? (payout > 0 ? `YOU WIN Rs. ${payout.toLocaleString()}` : "No win") : `${PLAYERS[round.winner].name} WINS`;

  useEffect(() => {
    if (!state || !personal.length) return;
    lastBets.current = bets;
    if (state.round.phase !== "result" || notified.current === roundNo) return;
    notified.current = roundNo;
    if (poolMessage) return;
    if (payout > totalBet) gameSfx.win();
    else if (payout < totalBet) gameSfx.lose();
  }, [state, personal.length, bets, roundNo, payout, totalBet, poolMessage]);

  async function place(k: BetKey) {
    const reply = await live.place(k, chip);
    if (!("error" in reply)) gameSfx.chip();
  }
  function clear() {
    if (!state || live.busy) return;
    void live.cancel(roundNo + (phase === "betting" && live.now < state.round.bettingEndsAt ? 0 : 1));
  }
  async function rebet() {
    if (!state || !bettingOpen) return;
    const previous = { ...lastBets.current };
    const current = phase === "betting" && live.now < state.round.bettingEndsAt;
    if ((current ? state.myBets : state.myQueuedBets).some((bet) => bet.status === "pending")) {
      const reply = await live.cancel(roundNo + (current ? 0 : 1));
      if ("error" in reply) return;
    }
    for (const key of Object.keys(previous) as BetKey[]) {
      if (previous[key]) {
        const placed = await live.place(key, previous[key]!);
        if ("error" in placed) break;
      }
    }
  }
  async function double() {
    if (!state || !bettingOpen) return;
    for (const key of Object.keys(bets) as BetKey[]) {
      if (bets[key]) {
        const reply = await live.place(key, bets[key]!);
        if ("error" in reply) break;
      }
    }
  }

  // card visible if dealt in order: row-by-row across players
  function visibleCards(pi: number) {
    if (!round) return [];
    const out: Card[] = [];
    let idx = 0;
    const maxLen = Math.max(...round.draws.map((d) => d.length));
    for (let row = 0; row < maxLen; row++)
      for (let p = 0; p < 4; p++) {
        if (round.draws[p][row]) { idx++; if (p === pi && idx <= shown) out.push(round.draws[p][row]); }
      }
    return out;
  }
  function liveTotal(pi: number) {
    return PLAYERS[pi].base + visibleCards(pi).reduce((s, c) => s + c.value, 0);
  }

  const letter = ["8", "9", "10", "11"];
  const hColor = ["bg-red-600", "bg-blue-600", "bg-emerald-600", "bg-amber-500"];

  return (
    <div className="thirtytwo-cards-container h-full w-full flex flex-col min-h-0 bg-[radial-gradient(ellipse_at_top,#14532d,#052e16_60%,#020a05)] text-white select-none overflow-hidden">
      <div className="shrink-0 max-h-28 overflow-y-auto">
        <LiveMultiplayerBets state={live.state} error={live.error} labels={Object.fromEntries([...PLAYERS, ...SIDE].map((p) => [p.key, labelOf(p.key)]))} />
        {!!state?.myQueuedBets.some((bet) => bet.status === "pending") && <button onClick={() => void live.cancel(roundNo + 1)} disabled={live.busy} className="text-xs text-amber-300">Cancel next-round bets</button>}
      </div>
      {/* Top bar */}
      <header className="flex-shrink-0 flex items-center justify-between px-3 py-2 sm:px-6 sm:py-2.5 bg-black/60 border-b border-yellow-600/40 z-10">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href={backHref || "/player"}
            className="flex items-center gap-1 text-xs font-semibold text-amber-300/90 hover:text-amber-200 bg-white/5 hover:bg-white/10 border border-amber-400/30 px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
          >
            ← <span className="hidden sm:inline">Back</span>
          </Link>
          <div className="text-yellow-400 font-extrabold text-base sm:text-xl tracking-wider">32 CARDS</div>
          <span className="text-[11px] text-white/60 hidden sm:inline">Round #{roundNo.toString().padStart(6, "0")}</span>
        </div>
        <div className="text-xs text-white/70 hidden md:block">Min Rs. 10 · Max Rs. 50,000</div>
        <div className="bg-black/70 border border-yellow-500/50 rounded-full px-3 py-1 text-xs sm:text-sm">
          Balance: <span className="text-yellow-400 font-bold">Rs. {balance.toLocaleString()}</span>
        </div>
      </header>

      {/* History road */}
      <div className="flex-shrink-0 flex gap-1 px-3 py-1.5 overflow-x-auto bg-black/40 border-b border-white/5">
        <span className="text-[10px] text-white/60 mr-2 self-center shrink-0 font-bold uppercase">LAST RESULTS</span>
        {history.length === 0 && <span className="text-xs text-white/40 self-center">—</span>}
        {history.map((h, i) => (
          <div key={i} className={`shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full ${hColor[h.w]} text-[10px] sm:text-[11px] font-bold flex items-center justify-center border border-white/30`} title={`Total ${h.t}`}>
            {letter[h.w]}
          </div>
        ))}
      </div>

      <main className="flex-1 min-h-0 overflow-y-auto max-w-6xl w-full mx-auto p-2 sm:p-4">
        {/* Dealer area */}
        <div className="relative rounded-2xl sm:rounded-[36px] border-4 border-yellow-700/70 bg-[radial-gradient(ellipse_at_center,#166534,#14532d_70%)] shadow-[inset_0_0_60px_rgba(0,0,0,.6)] p-3 sm:p-5">
          <div className="text-center mb-2.5">
            {phase === "betting" ? (
              <div className="inline-flex items-center gap-2 sm:gap-3">
                <span className="text-yellow-300 font-bold tracking-widest text-xs sm:text-sm">PLACE YOUR BETS</span>
                <span className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full border-3 sm:border-4 flex items-center justify-center text-base sm:text-lg font-extrabold ${timer <= 5 ? "border-red-500 text-red-400 animate-pulse" : "border-green-400 text-green-300"}`}>{timer}</span>
              </div>
            ) : (
              <span className={`text-base sm:text-xl font-extrabold tracking-widest ${msg.startsWith("YOU WIN") ? "text-yellow-300 animate-bounce inline-block" : "text-white"}`}>{msg}</span>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            {PLAYERS.map((p, i) => {
              const cards = visibleCards(i);
              const isWin = phase === "result" && round?.winner === i;
              const lost = phase === "result" && round?.winner !== i;
              return (
                <div key={p.key} className={`rounded-xl bg-gradient-to-b ${p.color} p-2.5 sm:p-3 border-2 transition-all ${isWin ? "border-yellow-300 shadow-[0_0_25px_rgba(250,204,21,.8)] scale-103" : "border-white/20"} ${lost ? "opacity-50" : ""}`}>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs sm:text-sm">{p.name}</span>
                    <span className="bg-black/50 rounded px-1.5 sm:px-2 text-xs sm:text-sm text-yellow-300 font-extrabold">{liveTotal(i)}</span>
                  </div>
                  <div className="flex gap-1 mt-1.5 min-h-12 sm:min-h-16 flex-wrap">
                    {cards.length ? cards.map((c, j) => <PlayingCard key={j} c={c} />) : <PlayingCard hidden />}
                  </div>
                  {isWin && <div className="mt-1 text-center text-[10px] sm:text-xs font-extrabold text-yellow-300">WINNER</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Betting board */}
        <div className="mt-3 sm:mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {PLAYERS.map((p) => (
            <BetBox key={p.key} label={p.name} odds={state?.tableMode === "personal" ? Math.min(2, p.odds) : p.odds} amount={bets[p.key]} onClick={() => place(p.key)} disabled={!bettingOpen} color={p.color}
              win={phase === "result" && round ? betWins(p.key, round) : undefined} />
          ))}
        </div>
        <div className="mt-2 sm:mt-3 grid grid-cols-2 gap-2 sm:gap-3">
          {SIDE.map((s) => (
            <BetBox key={s.key} label={s.name} odds={s.odds} amount={bets[s.key]} onClick={() => place(s.key)} disabled={!bettingOpen} color="from-slate-700 to-slate-900"
              win={phase === "result" && round ? betWins(s.key, round) : undefined} />
          ))}
        </div>

        {/* Chips & controls */}
        <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 bg-black/50 rounded-2xl p-2.5 sm:p-3 border border-yellow-600/30">
          <div className="flex gap-1.5 sm:gap-2 flex-wrap justify-center">
            {CHIPS.map((c) => (
              <button key={c} onClick={() => setChip(c)}
                className={`w-10 h-10 sm:w-13 sm:h-13 rounded-full ${CHIP_COLOR[c]} border-2 sm:border-4 border-dashed border-white font-extrabold text-[11px] sm:text-xs shadow-lg transition active:scale-95 ${chip === c ? "-translate-y-1 ring-3 sm:ring-4 ring-yellow-300 scale-105" : "opacity-80 hover:opacity-100 hover:scale-105"}`}>
                {c >= 1000 ? `${c / 1000}K` : c}
              </button>
            ))}
            <input type="number" min={10} inputMode="numeric" value={chip} aria-label="Custom bet amount"
              onChange={(e) => setChip(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
              className="w-20 h-10 rounded-lg bg-black/60 border border-yellow-500/50 text-center text-sm font-bold text-yellow-300" />
          </div>
          <div className="flex gap-1.5 sm:gap-2 items-center flex-wrap justify-center">
            <span className="text-xs sm:text-sm mr-1">Total: <b className="text-yellow-400 font-mono">Rs. {totalBet.toLocaleString()}</b></span>
            <Ctrl onClick={clear} label="UNDO ALL" variant="rose" />
            <Ctrl onClick={rebet} label="REBET" variant="amber" />
            <Ctrl onClick={double} label="2X" variant="emerald" />
          </div>
        </div>
        {msg && phase === "betting" && <div className="text-center text-red-400 mt-2 text-xs font-semibold">{msg}</div>}

        <div className="mt-3 text-[11px] text-white/50 leading-relaxed text-center sm:text-left">
          <b className="text-white/70">How to play:</b> 32-card deck (6 to K). Player 8, 9, 10 and 11 each draw a card; card value (6-13, J=11, Q=12, K=13) is added to the player&apos;s base number. Highest total wins.
        </div>
      </main>
    </div>
  );
}

function BetBox(props: { label: string; odds: number; amount?: number; onClick: () => void; disabled: boolean; color: string; win?: boolean }) {
  return (
    <button onClick={props.onClick} disabled={props.disabled}
      className={`relative h-20 sm:h-24 rounded-xl bg-gradient-to-b ${props.color} border-2 ${props.win ? "border-yellow-300 animate-pulse" : "border-yellow-600/50"} hover:brightness-120 hover:scale-[1.02] active:scale-98 transition-all disabled:cursor-not-allowed flex flex-col items-center justify-center shadow-lg`}>
      <span className="font-bold text-xs sm:text-sm">{props.label}</span>
      <span className="text-yellow-300 text-xs sm:text-sm font-extrabold">{props.odds.toFixed(2)}</span>
      {props.amount ? (
        <span className="absolute -top-2.5 -right-1.5 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-yellow-500 border-2 sm:border-3 border-dashed border-white text-black text-[9px] sm:text-[10px] font-extrabold flex items-center justify-center shadow">
          {props.amount >= 1000 ? `${(props.amount / 1000).toFixed(1)}K` : props.amount}
        </span>
      ) : null}
    </button>
  );
}

function Ctrl({ onClick, label, variant = "default" }: { onClick: () => void; label: string; variant?: "rose" | "amber" | "emerald" | "default" }) {
  const color =
    variant === "rose"
      ? "border border-rose-500/40 bg-rose-600/30 hover:bg-rose-600/50 text-rose-200"
      : variant === "amber"
      ? "border border-amber-400/40 bg-amber-500/25 hover:bg-amber-500/45 text-amber-200"
      : variant === "emerald"
      ? "border border-emerald-500/40 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200"
      : "bg-yellow-600 hover:bg-yellow-500 text-black";
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition active:scale-95 shadow-sm ${color}`}
    >
      {label}
    </button>
  );
}
