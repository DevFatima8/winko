"use client";

import { useEffect, useRef, useState } from "react";
import FlightDeck, { type FlightDeckHandle } from "./FlightDeck";
import { Mark, Wordmark } from "./Mark";
import { fmtCredits, secondsForMultiplier, type Phase, type RosterEntry } from "./lib/engine";
import "./blast-off.css";
import { BET_PRESETS } from "@/lib/betPresets";
import { useMultiplayerGame } from "@/lib/useMultiplayerGame";
import { LiveMultiplayerBets } from "@/components/LiveMultiplayerBets";
import type { BlastOutcome } from "@/lib/multiplayer-rules";
import type { MultiplayerBet } from "@/lib/multiplayer-types";
import { gameSfx } from "@/lib/gameSfx";
import { GameOverOverlay } from "@/components/GameOverOverlay";

type CrashRec = { id: number; m: number; at: number; bet: number | null; result: "win" | "loss" | "none" };

type Stats = {
  rounds: number;
  wins: number;
  losses: number;
  biggest: number;
  best: number;
  streak: number;
  net: number;
};

type BetState = {
  poolPending?: boolean;
  poolClaim?: number;
  amount: number;
  target: number;
  auto: boolean;
  active: boolean;
  cashed: boolean;
  cashedAt: number;
  payout: number;
};

type Engine = {
  phase: Phase;
  cd: number;
  hold: number;
  t: number;
  multiplier: number;
  crashPoint: number;
  round: number;
  roster: RosterEntry[];
  bet: BetState | null;
  balance: number;
  stats: Stats;
  history: CrashRec[];
  notice: string;
  sound: boolean;
};

export default function BlastOff() {
  const live = useMultiplayerGame<BlastOutcome>("blast-off");
  const deckRef = useRef<FlightDeckHandle | null>(null);
  const joltRef = useRef<HTMLDivElement | null>(null);
  const [stake, setStake] = useState(100);
  const [target, setTarget] = useState(2);
  const [auto, setAuto] = useState(true);
  const [sound, setSound] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [closedRound, setClosedRound] = useState(-1);
  const [settlements, setSettlements] = useState<(MultiplayerBet & { cashoutMultiplier?: number })[]>([]);
  const seen = useRef(new Set<string>());
  const state = live.state;
  const phase: Phase = state?.round.phase === "running" ? "flying" : state?.round.phase === "result" ? "crashed" : "betting";
  const current = state?.myBets.filter(b => b.status !== "cancelled") ?? [];
  const queued = state?.myQueuedBets.filter(b => b.status === "pending") ?? [];
  const own = (current.find(b => b.status === "pending") ?? current[0]) as (MultiplayerBet & { cashoutMultiplier?: number }) | undefined;
  const multiplier = phase === "crashed" ? state?.round.result?.crashPoint ?? 1 : phase === "flying" ? Math.min(250, Math.exp(.155 * Math.max(0, live.now - (state?.round.bettingEndsAt ?? live.now)) / 1000)) : 1;
  const bet: BetState | null = own ? { amount: own.amount, target: own.autoCashout ?? 0, auto: own.autoCashout !== undefined,
    active: own.status === "pending", cashed: own.status === "win", cashedAt: own.cashoutMultiplier ?? 0, payout: own.payout, poolPending: own.poolPending, poolClaim: own.poolClaim } : null;
  const stats: Stats = settlements.reduce((s, b) => ({ rounds: s.rounds + 1, wins: s.wins + (b.status === "win" ? 1 : 0),
    losses: s.losses + (b.status === "lose" ? 1 : 0), biggest: Math.max(s.biggest, b.payout),
    best: Math.max(s.best, b.cashoutMultiplier ?? 0), streak: b.status === "win" ? Math.max(0, s.streak) + 1 : Math.min(0, s.streak) - 1,
    net: s.net + b.payout - b.amount }), { rounds: 0, wins: 0, losses: 0, biggest: 0, best: 0, streak: 0, net: 0 });
  const history: CrashRec[] = (state?.history ?? []).map(h => {
    const own = settlements.find(b => b.roundNo === h.roundNo);
    return { id: h.roundNo, m: h.result.crashPoint, at: 0, bet: own?.amount ?? null, result: own ? own.status === "win" ? "win" : "loss" : "none" };
  });
  const roster: RosterEntry[] = (state?.bets ?? []).filter(b => b.status !== "cancelled").map(b => {
    const won = b as MultiplayerBet & { cashoutMultiplier?: number };
    return { id: b.id, name: b.name, stake: b.amount, target: b.autoCashout ?? 0, cashoutAt: null,
      cashedAt: b.status === "win" ? won.cashoutMultiplier ?? null : null, isYou: b.mine };
  });
  const e: Engine = { phase, cd: Math.max(0, ((state?.round.bettingEndsAt ?? live.now) - live.now) / 1000),
    hold: phase === "crashed" ? Math.max(0, ((state?.round.endsAt ?? live.now) - live.now) / 1000) : 0,
    t: phase === "betting" ? 0 : secondsForMultiplier(multiplier), multiplier,
    crashPoint: state?.round.result?.crashPoint ?? multiplier, round: state?.round.roundNo ?? 0,
    roster, bet, balance: state?.balance ?? 0, stats, history,
    notice: live.error || (own?.poolPending && own.status !== "pending" ? `Provisional claim Rs. ${(own.poolClaim ?? 0).toFixed(2)} — daily payout pending` : phase === "betting" ? "PLACE YOUR BET — LAUNCH WINDOW OPEN" : phase === "flying" ? "FLIGHT LIVE — NEXT ROUND BETTING OPEN" : "SHARED CRASH RESULT — NEXT ROUND BETTING OPEN"), sound };
  const actions = {
    placeBet: () => { if (!live.busy) void live.place("main", stake, auto ? target : undefined); },
    cashOut: () => { if (!live.busy && own?.status === "pending" && phase === "flying") void live.cashout(own.id); },
    cancelBet: () => { if (!live.busy && own && phase === "betting") void live.cancel(e.round, own.id); },
    refuel: () => { window.location.href = "/player/deposit"; },
    toggleSound: () => setSound(s => !s),
  };
  const actionsRef = useRef(actions);
  useEffect(() => { actionsRef.current = actions; });
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useEffect(() => {
    const rows = (state?.myBets ?? []).filter(b => !b.poolPending && (b.status === "win" || b.status === "lose") && b.amount > 0 && !seen.current.has(b.id));
    if (!rows.length) return;
    for (const b of rows) seen.current.add(b.id);
    setSettlements(s => [...s, ...rows]);
    if (sound) { if (rows.some(b => b.status === "win")) gameSfx.win(); else gameSfx.lose(); }
  }, [state, sound]);
  const betPlaced = !!bet;
  useEffect(() => {
    deckRef.current?.draw({ phase: e.phase, t: e.t, multiplier: e.multiplier, crashPoint: e.crashPoint, countdown: e.cd, betPlaced });
  }, [e.phase, e.t, e.multiplier, e.crashPoint, e.cd, betPlaced]);
  const activeRef = useRef(false);
  useEffect(() => { activeRef.current = phase === "flying" && !!bet?.active; }, [phase, bet?.active]);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.code !== "Space" || ["INPUT", "TEXTAREA", "BUTTON", "SELECT"].includes((ev.target as HTMLElement | null)?.tagName ?? "")) return;
      ev.preventDefault();
      if (activeRef.current) actionsRef.current.cashOut(); else actionsRef.current.placeBet();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------------- view ---------------- */
  const flying = e.phase === "flying";
  const betting = e.phase === "betting";
  const crashed = e.phase === "crashed";

  const bigColor = crashed
    ? "text-crimson"
    : flying
      ? e.multiplier >= 10
        ? "text-launch"
        : e.multiplier >= 2.5
          ? "text-signal"
          : "text-white"
      : "text-white/65";

  const btnLabel = betting
    ? bet
      ? "BET LOCKED — CANCEL"
      : `PLACE BET · ${fmtCredits(stake)}`
    : flying
      ? bet && bet.active && !bet.cashed
        ? `CASH OUT ${fmtCredits(bet.amount * e.multiplier)}`
        : bet && bet.cashed
          ? bet.poolPending ? `CLAIM ${fmtCredits(bet.poolClaim ?? 0)} · PENDING` : `BAGGED ${fmtCredits(bet.payout)}`
          : "BET NEXT ROUND"
      : "BET NEXT ROUND";

  const btnAction = () => {
    const a = actionsRef.current;
    if (!a) return;
    if (betting && !bet) a.placeBet();
    else if (flying && bet && bet.active && !bet.cashed) a.cashOut();
    else if (betting && bet) a.cancelBet();
    else a.placeBet();
  };

  const btnTone =
    flying && bet && bet.active && !bet.cashed
      ? "bg-gradient-to-r from-emerald-500 via-green-400 to-emerald-500 text-slate-950 font-black shadow-lg shadow-emerald-500/50 hover:brightness-110 active:scale-[0.98] animate-pulse"
      : betting && bet
        ? "border-2 border-amber-500/80 bg-amber-500/25 text-amber-300 font-bold hover:bg-amber-500/35"
        : "bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-400 text-slate-950 font-black shadow-lg shadow-orange-500/50 hover:brightness-110 active:scale-[0.98]";

  return (
    <div ref={joltRef} className="blast-off-wrap h-full w-full flex flex-col overflow-hidden px-1 sm:px-2.5">
      {/* ================= TOP BAR ================= */}
      <header className="shrink-0 border-b border-hair bg-void/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1500px] items-center gap-2 sm:gap-4 px-2 py-1.5 sm:px-4 sm:py-2">
          <Mark className="h-7 w-7 sm:h-8 sm:w-8 shrink-0" />
          <div className="flex flex-col gap-0.5">
            <Wordmark />
            <span className="legend hidden sm:block text-[9px]">Rocket crash · Rs. · v1.4</span>
          </div>

          {/* Inline Ticker on header */}
          <div className="hidden md:flex items-center gap-1.5 overflow-hidden max-w-[400px] mx-2">
            {e.history.slice(0, 6).map((h, i) => (
              <span
                key={`${h.id}-${i}`}
                className="num text-[11px] font-bold px-1.5 py-0.5 rounded border border-white/10 bg-black/40"
                style={{ color: h.m >= 10 ? "#c6ff3d" : h.m >= 2 ? "#ff9a3c" : "#ff3b57" }}
              >
                {h.m.toFixed(2)}×
              </span>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => actionsRef.current?.toggleSound()}
              className="chip px-2.5 py-1 text-[10px] tracking-[0.14em] font-bold border border-violet-500/40 bg-violet-950/40 text-violet-300 hover:bg-violet-500/20 uppercase"
              aria-pressed={e.sound}
            >
              {e.sound ? "Snd on" : "Snd off"}
            </button>
            <button
              type="button"
              onClick={() => actionsRef.current?.refuel()}
              className="btn border border-emerald-500/50 bg-emerald-500/20 px-2.5 py-1 text-[10px] tracking-[0.14em] font-bold text-emerald-300 uppercase hover:bg-emerald-500/30"
            >
              + Refuel
            </button>
            <div className="panel-solid flex items-baseline gap-1.5 px-2.5 py-1 border border-amber-500/30 bg-amber-500/10 rounded">
              <span className="legend hidden md:inline text-[9px] text-amber-200">Balance</span>
              <span className="num text-[14px] sm:text-[16px] leading-none font-bold text-amber-300">{fmtCredits(e.balance)}</span>
              <span className="legend text-[9px] text-amber-200">Rs.</span>
            </div>
          </div>
        </div>
      </header>

      {/* ================= FLIGHT DECK ================= */}
      <section className="relative flex flex-1 min-h-0 w-full flex-col overflow-y-auto overflow-x-hidden sm:block sm:overflow-hidden">
        <div className="relative h-[clamp(250px,40dvh,380px)] w-full shrink-0 overflow-hidden sm:h-full">
          <FlightDeck ref={deckRef} reduced={reduced} />
          <div className="scanlines pointer-events-none absolute inset-0" />

          {crashed && bet && closedRound !== e.round ? (
            <GameOverOverlay key={e.round} open
              winAmount={bet.cashed ? bet.payout - bet.amount : 0}
              title={bet.poolPending ? "Round complete" : bet.cashed ? "Congratulations! You win" : "You lose"}
              result={`${bet.poolPending ? `Claim ${fmtCredits(bet.poolClaim ?? 0)} · Daily payout pending` : bet.cashed ? `Won +${fmtCredits(bet.payout - bet.amount)} · ` : ""} Crashed at ${e.crashPoint.toFixed(2)}×`}
              onClose={() => setClosedRound(e.round)} />
          ) : null}

          <div className="absolute top-2 left-2 z-10 flex flex-wrap items-center gap-1.5 sm:top-4 sm:left-4">
            <span
              className={`flex items-center gap-1.5 border px-2 py-1 text-[9px] sm:text-[10px] tracking-[0.2em] uppercase font-bold rounded ${
                flying
                  ? "border-launch/60 bg-launch/20 text-launch"
                  : crashed
                    ? "border-crimson/60 bg-crimson/20 text-crimson"
                    : "border-inst/50 bg-inst/12 text-inst"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${flying ? "bg-launch blink" : crashed ? "bg-crimson" : "bg-inst blink"}`}
              />
              {flying ? "In flight" : crashed ? "Hull breach" : "Betting open"}
            </span>
            <span className="border border-hair bg-void/70 px-2.5 py-1.5 text-[10px] tracking-[0.2em] text-mist uppercase">
              Round #{String(e.round).padStart(4, "0")}
            </span>
            <span className="hidden border border-hair bg-void/70 px-2.5 py-1.5 text-[10px] tracking-[0.14em] text-mist uppercase sm:inline">
              Round {e.round}
            </span>
          </div>

          {/* the multiplier — kept compact so the bet console can never cover it */}
          <div className="pointer-events-none absolute top-[12%] left-3 z-10 max-w-[calc(100%-1.5rem)] sm:top-[14%] sm:left-8 lg:top-[9%] lg:left-12">
            <div className="legend mb-1">{crashed ? "Crashed at" : flying ? "Live multiplier" : "Last round"}</div>
            <div
              className={`num font-extrabold leading-[0.88] tracking-[-0.045em] whitespace-nowrap ${bigColor}`}
              style={{ fontSize: "clamp(2.6rem, 11vw, 4.5rem)" }}
            >
              {crashed ? e.crashPoint.toFixed(2) : e.multiplier.toFixed(2)}
              <span className="align-top text-[0.42em] tracking-normal opacity-70">×</span>
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <span className="legend">
                Stake <span className="num text-[13px] text-white">{bet ? fmtCredits(bet.amount) : "—"}</span>
              </span>
              <span className="legend">
                Auto cash{" "}
                <span className="num text-[13px] text-inst">{bet ? `${bet.target.toFixed(2)}×` : "—"}</span>
              </span>
              <span className="legend">
                {bet?.poolPending ? "Claim" : bet && bet.cashed ? "Banked" : "Potential"}{" "}
                <span className="num text-[13px] text-signal">
                  {bet && bet.cashed
                    ? fmtCredits(bet.poolPending ? bet.poolClaim ?? 0 : bet.payout)
                    : bet
                      ? fmtCredits(bet.amount * bet.target)
                      : "—"}
                </span>
              </span>
            </div>
            <div className="mt-2 hidden max-w-[32ch] text-[12px] leading-relaxed text-mist sm:block sm:text-[13px]">{e.notice}</div>
          </div>

          {/* roster */}
          <aside className="absolute top-5 right-5 bottom-5 z-10 hidden w-[268px] flex-col border border-hair bg-void/75 backdrop-blur-sm lg:flex">
            <div className="flex items-center justify-between border-b border-hair px-3 py-2.5">
              <span className="legend">Cabin roster</span>
              <span className="num text-[11px] text-mist">{e.roster.length} aboard</span>
            </div>
            <div className="thin-scroll flex-1 overflow-y-auto">
              {e.roster.length === 0 ? (
                <div className="px-3 py-6 text-[11px] leading-relaxed text-mist/70">
                  Manifest empty. Passengers board when the launch window closes.
                </div>
              ) : (
                e.roster.map((r) => (
                  <div
                    key={r.id}
                    className={`flex items-center gap-2 border-b border-hair/60 px-3 py-2 ${
                      r.isYou ? "border-l-2 border-l-launch bg-launch/12" : ""
                    }`}
                  >
                    <span
                      className={`num w-[86px] truncate text-[11px] ${r.isYou ? "font-bold text-white" : "text-mist"}`}
                    >
                      {r.name}
                    </span>
                    <span className="num ml-auto text-[11px] text-white/80">{fmtCredits(r.stake)}</span>
                    <span
                      className={`num w-[52px] text-right text-[11px] ${
                        r.cashedAt ? "text-signal" : flying ? "text-mist/60" : "text-crimson/70"
                      }`}
                    >
                      {r.cashedAt ? `${r.cashedAt.toFixed(2)}×` : "—"}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-hair px-3 py-2.5">
              <div className="flex items-baseline justify-between">
                <span className="legend">Flight Engine</span>
                <span className="num text-[11px] text-signal">ONLINE</span>
              </div>
            </div>
          </aside>
        </div>

        {/* ---- bet console: docked neatly inside the deck ---- */}
        <div className="z-30 shrink-0 p-2 sm:absolute sm:left-auto sm:right-4 sm:bottom-4 sm:w-[380px] sm:p-0">
          <div className="panel relative rounded-xl border border-hair bg-void/90 p-3 sm:p-4 backdrop-blur-md shadow-2xl">
            <div className="mb-2 text-[11px] leading-snug text-mist sm:hidden">{e.notice}</div>
            <div className="mb-2 flex items-center gap-1.5 overflow-hidden md:hidden">
              <span className="legend text-[9px]">History</span>
              {e.history.length === 0 ? (
                <span className="text-[10px] text-mist/70">—</span>
              ) : (
                e.history.slice(0, 7).map((h, i) => (
                  <span
                    key={`${h.id}-${i}`}
                    className="num rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-[10px] font-bold"
                    style={{ color: h.m >= 10 ? "#c6ff3d" : h.m >= 2 ? "#ff9a3c" : "#ff3b57" }}
                  >
                    {h.m.toFixed(2)}×
                  </span>
                ))
              )}
            </div>
            <div className="flex items-center justify-between border-b border-hair pb-2 mb-2">
              <span className="legend flex items-center gap-1.5 text-white/90 text-[10px]">
                <span className="h-1.5 w-1.5 rounded-full bg-inst" /> Launch Console
              </span>
              <span className="legend text-[9px] text-mist/80">Flight #{e.round}</span>
            </div>

            <div>
              <div className="mb-2">
                <div className="mb-1 flex items-baseline justify-between">
                  <label htmlFor="stake" className="legend text-[9px]">
                    Stake (Rs.)
                  </label>
                  <span className="legend text-mist/70 text-[9px]">Min 10</span>
                </div>
                <div className="flex items-stretch gap-1.5">
                  <button
                    type="button"
                    className="chip w-9 shrink-0 font-bold border border-hair bg-[#0b1322] text-white hover:border-inst"
                    onClick={() => setStake((s) => Math.max(10, Math.round(s / 2)))}
                    aria-label="Halve stake"
                  >
                    −
                  </button>
                  <input
                    id="stake"
                    className="field min-w-0 flex-1 px-2.5 py-1.5 text-[15px] font-bold rounded bg-[#070d18] border border-hair text-white text-center"
                    inputMode="numeric"
                    value={stake}
                    onChange={(ev) => {
                      const n = Number(ev.target.value.replace(/[^\d]/g, ""));
                      setStake(Number.isFinite(n) ? n : 0);
                    }}
                  />
                  <button
                    type="button"
                    className="chip w-9 shrink-0 font-bold border border-hair bg-[#0b1322] text-white hover:border-inst"
                    onClick={() => setStake((s) => Math.round(s * 2))}
                    aria-label="Double stake"
                  >
                    +
                  </button>
                </div>
                <div className="mt-1.5 grid grid-cols-6 gap-1">
                  {BET_PRESETS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`chip num py-1 text-[10px] font-bold rounded border transition-colors ${
                        stake === v
                          ? "border-amber-400 bg-amber-400/25 text-amber-300"
                          : "border-cyan-500/40 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-500/20"
                      }`}
                      data-on={stake === v}
                      onClick={() => setStake(v)}
                    >
                      {v}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="chip num py-1 text-[10px] font-bold rounded border border-emerald-500/40 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-500/20"
                    onClick={() => setStake(Math.max(10, Math.floor(e.balance)))}
                  >
                    MAX
                  </button>
                </div>
              </div>

              <div className="mb-2">
                <div className="mb-1 flex items-baseline justify-between">
                  <label htmlFor="target" className="legend text-[9px]">
                    Auto cash-out
                  </label>
                  <button
                    type="button"
                    onClick={() => setAuto((a) => !a)}
                    className="legend text-[9px] font-bold"
                    style={{ color: auto ? "#c6ff3d" : "#7f8eae" }}
                    aria-pressed={auto}
                  >
                    {auto ? "● Armed" : "○ Manual"}
                  </button>
                </div>
                <div className="flex items-stretch gap-1.5">
                  <input
                    id="target"
                    className="field min-w-0 flex-1 px-2.5 py-1.5 text-[15px] font-bold rounded bg-[#070d18] border border-hair text-white text-center"
                    inputMode="decimal"
                    value={target}
                    onChange={(ev) => {
                      const n = Number(ev.target.value.replace(/[^\d.]/g, ""));
                      setTarget(Number.isFinite(n) ? Math.min(200, n) : 1.01);
                    }}
                  />
                  <span className="flex items-center rounded border border-hair bg-[#070d18] px-2 text-[12px] text-mist">×</span>
                  <button type="button" className="chip px-2.5 py-1 text-[10px] font-bold rounded border border-indigo-500/40 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-500/20" onClick={() => setTarget(1.5)}>
                    1.5
                  </button>
                  <button type="button" className="chip px-2.5 py-1 text-[10px] font-bold rounded border border-indigo-500/40 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-500/20" onClick={() => setTarget(2)}>
                    2
                  </button>
                  <button type="button" className="chip px-2.5 py-1 text-[10px] font-bold rounded border border-indigo-500/40 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-500/20" onClick={() => setTarget(5)}>
                    5
                  </button>
                </div>
              </div>

              <div className="mb-2 flex items-baseline justify-between border-t border-hair pt-2">
                <span className="legend text-[9px]">{bet?.poolPending ? "Provisional claim" : bet && bet.cashed ? "Banked" : "Potential return"}</span>
                <span className="num text-[14px] font-bold text-signal">
                  {bet?.poolPending && bet.cashed ? `${fmtCredits(bet.poolClaim ?? 0)} Rs. · pending` : bet && bet.cashed ? `${fmtCredits(bet.payout)} Rs.` : `${fmtCredits(stake * (target || 1))} Rs.`}
                </span>
              </div>

              <button
                type="button"
                onClick={btnAction}
                disabled={live.busy || !state || (betting && !bet && stake > e.balance)}
                className={`btn w-full py-2.5 sm:py-3 text-[14px] font-black tracking-[0.1em] rounded-lg uppercase transition-all ${btnTone}`}
              >
                {btnLabel}
              </button>
              <LiveMultiplayerBets state={live.state} error={live.error} />{queued.length > 0 && <button type="button" disabled={live.busy} onClick={() => void live.cancel(e.round + 1)}>Cancel next-round bets</button>}

              <div className="mt-1.5 flex items-center justify-between text-[9px]">
                <span className="legend text-[9px]">
                  {betting
                    ? `Launch in ${e.cd.toFixed(1)}s`
                    : flying
                      ? `Altitude ${e.t.toFixed(1)}s`
                      : `Crashed ${e.crashPoint.toFixed(2)}×`}
                </span>
                <span className="legend text-[9px] text-mist/70">Space bar = act</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
