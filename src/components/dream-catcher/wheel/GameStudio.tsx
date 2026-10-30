"use client";

import "../dream-catcher.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMultiplayerGame } from "@/lib/useMultiplayerGame";
import { poolRoundMessage } from "@/lib/multiplayer-types";
import { LiveMultiplayerBets } from "@/components/LiveMultiplayerBets";
import type { DreamOutcome } from "@/lib/multiplayer-rules";
import { BET_PRESETS } from "@/lib/betPresets";
import MoneyWheel, { type WheelHandle } from "./MoneyWheel";
import BettingBoard from "./BettingBoard";
import { Chip } from "./Chip";
import {
  HistoryRail,
  RulesModal,
  StatsPanel,
  type HistoryEntry,
  type SessionStats,
} from "./SidePanels";
import {
  ALL_SPOTS,
  CHIP_DENOMS,
  PAYOUT,
  SPOT_THEME,
  formatMoney,
  type SpotId,
} from "../game/config";
import { tableAudio } from "../game/audio";
import type { Bets } from "../game/engine";

type Phase = "betting" | "spinning" | "settling";

type Banner =
  | { kind: "wait" | "spin" | "multiplier" | "win" | "loss"; title: string; sub?: string; amount?: number }
  | null;

export default function GameStudio({ backHref = "/player" }: { backHref?: string }) {
  const live = useMultiplayerGame<DreamOutcome>("dream-catcher");
  const serverRound = live.state?.round;
  const balance = live.state?.balance ?? 0;
  const phase: Phase = !serverRound || serverRound.phase === "betting" ? "betting" : serverRound.phase === "running" ? "spinning" : "settling";
  const bettingOpen = !!serverRound && phase === "betting" && live.now < serverRound.bettingEndsAt - 500;
  const activeBets = live.state?.myBets.filter((bet) => bet.status !== "cancelled") ?? [];
  const queued = live.state?.myQueuedBets.filter((bet) => bet.status === "pending") ?? [];
  const placements = bettingOpen ? activeBets : queued;
  const bets: Bets = {};
  for (const bet of placements) {
    const spot = bet.option as SpotId;
    bets[spot] = (bets[spot] ?? 0) + bet.amount;
  }
  const [chip, setChip] = useState<number>(BET_PRESETS[0]);
  const outcome = serverRound?.result;
  const duration = serverRound ? Math.max(1, serverRound.resultAt - serverRound.bettingEndsAt) : 1;
  const stepDuration = outcome ? duration / outcome.steps.length : duration;
  const elapsed = serverRound ? Math.max(0, live.now - serverRound.bettingEndsAt) : 0;
  const stepIndex = outcome ? Math.min(outcome.steps.length - 1, Math.floor(elapsed / stepDuration)) : 0;
  const step = phase !== "betting" ? outcome?.steps[stepIndex] : undefined;
  const progress = Math.max(0, Math.min(1, (elapsed - stepIndex * stepDuration) / stepDuration));
  const highlightIndex = step && progress >= 1 ? step.index : null;
  const winningSpot: SpotId | null = phase === "settling" ? outcome?.finalSpot ?? null : null;
  const tableMultiplier = outcome && phase !== "betting"
    ? outcome.steps.slice(0, phase === "settling" ? outcome.steps.length : stepIndex).reduce((product, item) => product * item.multiplier, 1) : 1;
  const stake = activeBets.reduce((sum, bet) => sum + bet.amount, 0);
  const payout = activeBets.reduce((sum, bet) => sum + bet.payout, 0);
  const poolMessage = poolRoundMessage(activeBets);
  const countdown = serverRound ? Math.max(0, Math.ceil((serverRound.bettingEndsAt - live.now) / 1000)) : 0;
  const banner: Banner = phase === "betting" ? { kind: "wait", title: serverRound ? `PLACE YOUR BETS · ${countdown}s` : "CONNECTING TO LIVE TABLE" }
    : phase === "spinning" ? { kind: "spin", title: stepIndex ? "RE-SPIN" : "SPINNING", sub: `Shared round #${serverRound?.roundNo}${tableMultiplier > 1 ? ` · Table ×${tableMultiplier}` : ""}` }
    : {
      kind: stake > 0 && !poolMessage ? payout > stake ? "win" : "loss" : "wait",
      title: poolMessage ?? (stake <= 0 ? `LIVE RESULT · ${outcome?.finalSpot ?? "…"}`
        : payout >= stake * 10 ? "MEGA WIN" : payout >= stake * 3 ? "BIG WIN" : payout > stake ? "WINNER" : payout > 0 ? "PUSH" : "No win"),
      sub: `${outcome?.finalSpot ?? "…"} · Table ×${tableMultiplier} · Place bets for next round`,
      ...(stake > 0 && !poolMessage ? { amount: payout } : {}),
    };
  const history: HistoryEntry[] = live.state?.history.map((entry) => ({
    id: entry.roundNo, spot: entry.result.finalSpot, multiplier: entry.result.totalMultiplier,
    stake: 0, payout: 0,
  })) ?? [];
  const [stats, setStats] = useState<SessionStats>({ rounds: 0, wins: 0, wagered: 0, returned: 0 });
  const floaters: Array<{ id: number; text: string; tone: "win" | "loss" }> = phase === "settling" && stake > 0 && !poolMessage
    ? [{ id: serverRound!.roundNo, text: payout > 0 ? `+${formatMoney(payout)}` : "No win", tone: payout > stake ? "win" : "loss" }] : [];
  const confetti = phase === "settling" && payout > stake && stake > 0;
  const [muted, setMuted] = useState(false);
  const [autoSpin, setAutoSpin] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const wheelRef = useRef<WheelHandle | null>(null);
  const lastBetsRef = useRef<Bets>({});
  const mounted = useRef(false);
  const actionLock = useRef(false);
  const autoRound = useRef<number | null>(null);
  const settledRound = useRef<number | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  const totalBet = ALL_SPOTS.reduce((sum, spot) => sum + (bets[spot] ?? 0), 0);
  const available = balance;
  const maxPotential = ALL_SPOTS.reduce((best, spot) =>
    Math.max(best, (bets[spot] ?? 0) * (PAYOUT[spot] + 1) * tableMultiplier), 0);

  /* ------------------------------- boot ------------------------------- */
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const flash = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  /* ------------------------------ betting ----------------------------- */
  const submitBets = useCallback(async (items: { option: string; amount: number }[]) => {
    if (!mounted.current || actionLock.current || live.busy || !live.state) return;
    actionLock.current = true;
    try {
      for (const item of items) {
        if (!mounted.current) break;
        const reply = await live.place(item.option, item.amount);
        if (!mounted.current) break;
        if ("error" in reply) { setAutoSpin(false); flash(reply.error); break; }
        tableAudio.chipDrop();
      }
    } finally { actionLock.current = false; }
  }, [live.busy, live.state, live.place, flash]);
  const placeChip = (spot: SpotId) => {
      if (!Number.isFinite(chip) || chip < 1) return;
      tableAudio.unlock();
      if (chip > available) {
        flash("Not enough balance for that chip");
        return;
      }
      void submitBets([{ option: spot, amount: chip }]);
  };
  const removeChip = (spot: SpotId) => {
    const last = placements.filter((bet) => bet.option === spot).at(-1);
    if (last && !live.busy && !actionLock.current) void live.cancel(last.roundNo, last.id);
  };
  const undo = () => {
    const last = placements.at(-1);
    if (last && !live.busy && !actionLock.current) void live.cancel(last.roundNo, last.id);
  };
  const clearBets = () => {
    if (serverRound && !live.busy && !actionLock.current) void live.cancel(serverRound.roundNo + (bettingOpen ? 0 : 1));
  };
  const repeatBets = () => {
    const last = lastBetsRef.current;
    const spots = ALL_SPOTS.filter((s) => (last[s] ?? 0) > 0);
    if (spots.length === 0) {
      flash("No previous bet to repeat");
      return;
    }
    const total = spots.reduce((sum, s) => sum + (last[s] ?? 0), 0);
    if (total > balance) {
      flash("Balance too low to repeat that bet");
      return;
    }
    void submitBets(spots.map((option) => ({ option, amount: last[option] ?? 0 })));
  };

  useEffect(() => {
    if (!live.state) return;
    const state = live.state;
    let active = true;
    const placed = live.state.myBets.filter((bet) => bet.status !== "cancelled" && bet.amount > 0);
    queueMicrotask(() => {
      if (!active) return;
      if (placed.length && state.round.phase !== "betting") {
        const previous: Bets = {};
        for (const bet of placed) {
          const spot = bet.option as SpotId;
          previous[spot] = (previous[spot] ?? 0) + bet.amount;
        }
        lastBetsRef.current = previous;
      }
      if (state.round.phase !== "result" || settledRound.current === state.round.roundNo) return;
      settledRound.current = state.round.roundNo;
      if (!placed.length) return;
      const poolPending = placed.some(bet => bet.poolPending);
      const wagered = placed.reduce((sum, bet) => sum + bet.amount, 0);
      const returned = placed.reduce((sum, bet) => sum + bet.payout, 0);
      window.dispatchEvent(new CustomEvent("wx:game-result", { detail: {
        game: "Dream Catcher", bet: wagered, win: poolPending ? 0 : returned, won: !poolPending && returned > wagered,
        poolPending, poolClaim: placed.reduce((sum, bet) => sum + (bet.poolClaim ?? 0), 0),
      } }));
      if (poolPending) return;
      setStats((previous) => ({
        rounds: previous.rounds + 1, wins: previous.wins + Number(returned > wagered),
        wagered: previous.wagered + wagered, returned: previous.returned + returned,
      }));
      if (returned > wagered) tableAudio.win(returned >= wagered * 3);
      else tableAudio.lose();
    });
    return () => { active = false; };
  }, [live.state]);

  useEffect(() => {
    if (!autoSpin || !live.state || !bettingOpen || live.busy || actionLock.current) return;
    const roundNo = live.state.round.roundNo;
    if (autoRound.current === roundNo) return;
    autoRound.current = roundNo;
    if (live.state.myBets.some((bet) => bet.status === "pending")) return;
    const items = Object.entries(lastBetsRef.current).map(([option, amount]) => ({ option, amount }));
    if (items.length) void submitBets(items);
  }, [autoSpin, live.state, live.busy, bettingOpen, submitBets]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    tableAudio.setMuted(next);
  };

  const resetSession = () => {
    setStats({ rounds: 0, wins: 0, wagered: 0, returned: 0 });
    lastBetsRef.current = {};
    setAutoSpin(false);
    flash("Display stats reset. Live wallet and bets are unchanged.");
  };

  const locked = live.busy || !live.state;
  const statusText =
    phase === "betting"
      ? autoSpin
        ? "AUTO SPIN ARMED"
        : "PLACE YOUR BETS"
      : phase === "spinning"
        ? "BETS QUEUE FOR NEXT ROUND"
        : "NEXT ROUND BETTING OPEN";

  return (
    <div className="studio-stage relative flex h-full w-full flex-col justify-between overflow-y-auto overflow-x-hidden sm:overflow-hidden px-2 sm:px-4 py-1.5 select-none text-white">
      {/* light beams */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-[8%] h-[520px] w-40 rotate-[18deg] bg-gradient-to-b from-fuchsia-400/20 to-transparent blur-2xl" />
        <div className="absolute -top-32 right-[8%] h-[520px] w-40 -rotate-[18deg] bg-gradient-to-b from-cyan-300/20 to-transparent blur-2xl" />
      </div>

      {confetti ? <Confetti /> : null}

      {/* ------------------------------ top bar ------------------------------ */}
      <header className="panel flex shrink-0 items-center justify-between gap-2 rounded-xl px-3 py-1.5 z-10">
        <div className="flex items-center gap-2">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-slate-300 hover:bg-white/15 hover:text-white transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <div className="flex items-center gap-2">
            <BrandMark />
            <div className="leading-tight">
              <div className="gold-text text-base sm:text-lg font-black tracking-wider">DREAM WHEEL</div>
              <div className="text-[8px] font-bold tracking-[0.2em] text-violet-200/50 uppercase hidden sm:block">
                54 Segments · 35:1
              </div>
            </div>
          </div>
          <StatusPill text={statusText} active={locked} />
        </div>

        <div className="flex items-center gap-2">
          <details className="relative">
            <summary className={`cursor-pointer rounded-lg border border-white/20 bg-black/40 px-2 py-1 text-[10px] ${live.error ? "text-amber-300" : ""}`}>
              Players · {live.state?.bets.filter((bet) => bet.status !== "cancelled").length ?? 0}
            </summary>
            <div className="absolute right-0 top-full z-50 mt-1 w-72 max-w-[85vw] bg-black/95">
              <LiveMultiplayerBets state={live.state} error={live.error} />
            </div>
          </details>
          <div className="panel-flat flex items-center gap-1.5 rounded-xl border border-yellow-500/30 bg-black/50 px-3 py-1 text-right">
            <div className="text-[9px] font-black tracking-[0.18em] text-violet-200/50 uppercase">Balance</div>
            <div className="text-sm sm:text-base font-black text-emerald-300 tabular-nums">
              {formatMoney(balance)}
            </div>
          </div>
          <IconButton label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>
            {muted ? "🔇" : "🔊"}
          </IconButton>
          <IconButton label="Stats & Paytable" onClick={() => setStatsOpen(true)}>
            📊
          </IconButton>
          <IconButton label="Rules" onClick={() => setRulesOpen(true)}>
            ⓘ
          </IconButton>
          <IconButton label="Reset" onClick={resetSession} danger>
            ⟲
          </IconButton>
        </div>
      </header>

      {/* ------------------------------ stage center ------------------------------ */}
      <main className="flex-1 sm:min-h-0 flex flex-col justify-between sm:overflow-hidden gap-1.5 py-1 z-10">
        <section className="studio-floor relative flex shrink-0 sm:shrink sm:flex-1 sm:min-h-0 flex-col items-center justify-center sm:overflow-hidden rounded-2xl border border-violet-300/15 p-1.5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px gold-rule" />

          <div className="relative flex w-[min(100%,92vw)] max-w-[440px] sm:w-auto sm:max-w-none sm:h-full sm:max-h-[220px] md:max-h-[260px] lg:max-h-[280px] aspect-square items-center justify-center">
            <MoneyWheel
              ref={wheelRef}
              highlightIndex={highlightIndex}
              dimmed={banner?.kind === "loss"}
              sharedSpin={step && serverRound ? {
                key: `${serverRound.roundNo}-${stepIndex}`, index: step.index,
                fromIndex: stepIndex > 0 ? outcome!.steps[stepIndex - 1].index : 0,
                startedAt: serverRound.bettingEndsAt + stepIndex * stepDuration,
                endsAt: serverRound.bettingEndsAt + (stepIndex + 1) * stepDuration, now: live.now,
              } : null}
            />

            {/* floating numbers */}
            <div className="pointer-events-none absolute inset-x-0 top-[38%] flex flex-col items-center gap-1">
              {floaters.map((f) => (
                <span
                  key={f.id}
                  className={`float-up text-2xl sm:text-3xl font-black drop-shadow-[0_3px_10px_rgba(0,0,0,0.8)] ${
                    f.tone === "win" ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {f.text}
                </span>
              ))}
            </div>

            <BannerOverlay banner={banner} />
          </div>

          {/* Compact recent history row */}
          <div className="flex items-center gap-1 overflow-x-auto py-0.5 max-w-full">
            <span className="text-[9px] font-bold uppercase tracking-wider text-violet-200/50 shrink-0">History:</span>
            {history.length === 0 ? (
              <span className="text-[10px] text-violet-200/40">No spins yet</span>
            ) : (
              history.slice(0, 10).map((entry, idx) => {
                const theme = SPOT_THEME[entry.spot];
                return (
                  <span
                    key={entry.id || idx}
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-black ring-1 ring-white/20 shadow-sm"
                    style={{ background: theme.face, color: theme.text }}
                    title={`${entry.spot} (x${entry.multiplier})`}
                  >
                    {entry.spot}
                  </span>
                );
              })
            )}
          </div>
        </section>

        {/* --------------------------- betting table --------------------------- */}
        <BettingBoard
          bets={bets}
          locked={locked}
          winningSpot={phase === "spinning" ? null : winningSpot}
          tableMultiplier={tableMultiplier}
          balance={available}
          onPlace={placeChip}
          onRemove={removeChip}
        />

        {/* --------------------------- bottom controls --------------------------- */}
        <section className="panel flex shrink-0 flex-col gap-2 rounded-2xl p-2 sm:p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black tracking-[0.2em] text-violet-200/55 uppercase">Chip</span>
              <div className="flex items-end gap-1">
                {CHIP_DENOMS.map((denom) => (
                  <button
                    key={denom}
                    type="button"
                    disabled={locked}
                    onClick={() => {
                      setChip(denom);
                      tableAudio.unlock();
                      tableAudio.chipDrop();
                    }}
                    className={`transition-all duration-150 ${locked ? "opacity-50" : "hover:-translate-y-1 hover:brightness-110 active:scale-95"}`}
                    title={`${denom} credit chip`}
                  >
                    <Chip value={denom} size={chip === denom ? 38 : 32} selected={chip === denom} />
                  </button>
                ))}
                <input
                  type="number"
                  min={10}
                  inputMode="numeric"
                  aria-label="Custom bet amount"
                  placeholder="Custom"
                  disabled={locked}
                  value={chip || ""}
                  onChange={(e) => setChip(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
                  className="ml-1 h-8 w-16 rounded-md border border-white/20 bg-black/40 text-center text-xs font-bold text-white outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <ActionButton variant="amber" onClick={undo} disabled={locked || placements.length === 0}>
                Undo
              </ActionButton>
              <ActionButton variant="red" onClick={clearBets} disabled={locked || totalBet === 0}>
                Clear
              </ActionButton>
              <ActionButton variant="blue" onClick={repeatBets} disabled={locked}>
                Repeat
              </ActionButton>
              <ActionButton
                variant={autoSpin ? "red" : "cyan"}
                onClick={() => setAutoSpin((v) => !v)}
                active={autoSpin}
                disabled={false}
              >
                Auto {autoSpin ? "On" : "Off"}
              </ActionButton>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 rounded-xl bg-black/40 px-3 py-1.5 ring-1 ring-white/5">
            <div className="flex items-center justify-around sm:justify-start gap-4 sm:gap-6 text-center sm:text-left w-full sm:w-auto">
              <Metric label="Total bet" value={formatMoney(totalBet)} tone="gold" />
              <Metric label="Max win" value={formatMoney(maxPotential)} tone="cyan" />
              <Metric label="Rounds" value={`${stats.rounds}`} tone="violet" />
            </div>
            <button
              type="button"
              disabled={!serverRound}
              onClick={() => flash("The shared wheel spins automatically when betting closes.")}
              className={`shimmer relative w-full sm:w-auto min-w-[150px] overflow-hidden rounded-xl px-7 py-2 text-base font-black tracking-[0.16em] uppercase transition-all
                ${
                  locked || totalBet === 0
                    ? "cursor-not-allowed bg-white/10 text-white/35 shadow-none"
                    : "bg-gradient-to-b from-emerald-400 via-emerald-500 to-green-700 text-white shadow-lg shadow-emerald-950/50 hover:from-emerald-300 hover:to-green-600 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                }`}
            >
              {phase === "betting" ? `Bets close ${countdown}s` : phase === "spinning" ? "Spinning…" : "Next round bets"}
            </button>
          </div>
        </section>
      </main>

      {toast ? (
        <div className="banner-in fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-black/85 px-5 py-2.5 text-sm font-bold text-amber-200 ring-1 ring-amber-300/40">
          {toast}
        </div>
      ) : null}

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <StatsModal
        open={statsOpen}
        onClose={() => setStatsOpen(false)}
        stats={stats}
        history={history}
      />
    </div>
  );
}

/* ------------------------------ presentational bits ------------------------------ */

function StatsModal({
  open,
  onClose,
  stats,
  history,
}: {
  open: boolean;
  onClose: () => void;
  stats: SessionStats;
  history: HistoryEntry[];
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-violet-400/30 bg-slate-900/95 p-5 text-white shadow-2xl thin-scroll">
        <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
          <h3 className="text-lg font-black text-amber-300">Session Stats & Paytable</h3>
          <button
            onClick={onClose}
            className="rounded-lg bg-white/10 px-3 py-1 text-sm font-bold hover:bg-white/20 cursor-pointer"
          >
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-4">
          <StatsPanel stats={stats} />
          <HistoryRail history={history} />
          <div className="panel rounded-2xl p-4">
            <h2 className="mb-2 text-[11px] font-black tracking-[0.22em] text-violet-200/70 uppercase">
              Paytable
            </h2>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
              {ALL_SPOTS.map((spot) => {
                const theme = SPOT_THEME[spot];
                return (
                  <div
                    key={spot}
                    className="rounded-md px-1 py-1.5 text-center ring-1 ring-white/10"
                    style={{ background: `linear-gradient(180deg, ${theme.face}33, ${theme.faceDeep}55)` }}
                  >
                    <div className="text-sm font-black" style={{ color: theme.edge }}>
                      {spot}
                    </div>
                    <div className="text-[9px] font-bold text-violet-100/60">
                      {spot === "2x" || spot === "7x" ? "re-spin" : `${PAYOUT[spot]}:1`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <svg width="42" height="42" viewBox="0 0 48 48" aria-hidden>
      <defs>
        <linearGradient id="brandGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff3c4" />
          <stop offset="55%" stopColor="#f4c542" />
          <stop offset="100%" stopColor="#a2690c" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="21" r="14" fill="none" stroke="url(#brandGold)" strokeWidth="2.6" />
      <circle cx="24" cy="21" r="9" fill="none" stroke="url(#brandGold)" strokeWidth="1.4" opacity="0.8" />
      <circle cx="24" cy="21" r="4" fill="none" stroke="url(#brandGold)" strokeWidth="1.2" opacity="0.6" />
      <g stroke="#29c5d6" strokeWidth="1.8" strokeLinecap="round">
        <line x1="18" y1="34" x2="16" y2="42" />
        <line x1="24" y1="35" x2="24" y2="45" />
        <line x1="30" y1="34" x2="32" y2="42" />
      </g>
      <g fill="#29c5d6" opacity="0.75">
        <ellipse cx="16" cy="43" rx="2" ry="3.4" />
        <ellipse cx="24" cy="46" rx="2" ry="3.4" />
        <ellipse cx="32" cy="43" rx="2" ry="3.4" />
      </g>
    </svg>
  );
}

function IconButton({
  children,
  label,
  onClick,
  danger,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`panel-flat grid h-9 w-9 place-items-center rounded-xl text-sm font-black transition-colors hover:bg-white/10 cursor-pointer ${
        danger ? "text-rose-300" : "text-violet-100"
      }`}
    >
      {children}
    </button>
  );
}

function StatusPill({ text, active }: { text: string; active: boolean }) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black tracking-[0.2em] uppercase ring-1 transition-colors ${
        active
          ? "bg-rose-500/15 text-rose-200 ring-rose-300/40"
          : "bg-emerald-400/15 text-emerald-200 ring-emerald-300/40"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-rose-400" : "animate-pulse bg-emerald-400"}`} />
      {text}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  active,
  variant = "default",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  variant?: "default" | "red" | "green" | "amber" | "blue" | "cyan";
}) {
  const variantClass =
    variant === "red"
      ? "bg-gradient-to-b from-rose-600 via-rose-700 to-red-800 text-white ring-rose-500/40 hover:from-rose-500 hover:to-red-700 shadow-sm shadow-rose-950/30"
      : variant === "amber"
      ? "bg-gradient-to-b from-amber-600 via-amber-700 to-orange-800 text-white ring-amber-500/40 hover:from-amber-500 hover:to-orange-700 shadow-sm shadow-amber-950/30"
      : variant === "blue"
      ? "bg-gradient-to-b from-blue-600 via-indigo-700 to-indigo-800 text-white ring-blue-500/40 hover:from-blue-500 hover:to-indigo-700 shadow-sm shadow-blue-950/30"
      : variant === "cyan"
      ? "bg-gradient-to-b from-teal-600 via-cyan-700 to-cyan-800 text-white ring-cyan-500/40 hover:from-teal-500 hover:to-cyan-700 shadow-sm shadow-cyan-950/30"
      : "bg-white/10 text-violet-50 ring-white/20 hover:bg-white/20";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-2.5 py-1.5 text-[10px] sm:text-[11px] font-black tracking-[0.12em] uppercase ring-1 transition-all cursor-pointer hover:scale-[1.02] active:scale-95 ${
        disabled
          ? "cursor-not-allowed bg-white/5 text-white/25 ring-white/10 opacity-50 shadow-none hover:scale-100"
          : variantClass
      }`}
    >
      {children}
    </button>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "gold" | "cyan" | "violet" }) {
  const color = tone === "gold" ? "text-amber-200" : tone === "cyan" ? "text-cyan-200" : "text-violet-200";
  return (
    <div>
      <div className="text-[9px] font-black tracking-[0.2em] text-violet-200/45 uppercase">{label}</div>
      <div className={`text-lg font-black tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function BannerOverlay({ banner }: { banner: Banner }) {
  if (!banner) return null;
  const isWin = banner.kind === "win";
  const isMulti = banner.kind === "multiplier";
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[6%] flex justify-center px-4">
      <div
        className={`banner-in max-w-full rounded-2xl px-6 py-3 text-center ring-1 backdrop-blur-sm ${
          isWin
            ? "bg-gradient-to-b from-amber-300/95 to-amber-600/90 ring-amber-100/70 text-[#2a1c00]"
            : isMulti
              ? "bg-cyan-400/90 ring-cyan-100/70 text-[#03262c]"
              : banner.kind === "loss"
                ? "bg-black/75 ring-rose-300/30 text-rose-100"
                : "bg-black/70 ring-white/20 text-white"
        }`}
      >
        <div
          className={`text-xl font-black tracking-[0.16em] uppercase sm:text-2xl ${isWin ? "" : isMulti ? "" : ""}`}
        >
          {banner.title}
        </div>
        {banner.amount ? (
          <div className="text-3xl font-black tabular-nums sm:text-4xl">+{formatMoney(banner.amount)}</div>
        ) : null}
        {banner.sub ? <div className="mt-0.5 text-[11px] font-bold opacity-80">{banner.sub}</div> : null}
      </div>
    </div>
  );
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.6,
        duration: 2.6 + Math.random() * 2.2,
        color: ["#f4c542", "#29c5d6", "#8b4fe0", "#20b463", "#e03a4c", "#ffffff"][i % 6],
      })),
    [],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
