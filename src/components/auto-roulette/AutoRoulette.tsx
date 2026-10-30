"use client";
import { gameSfx } from "@/lib/gameSfx";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMultiplayerGame } from "@/lib/useMultiplayerGame";
import { LiveMultiplayerBets } from "@/components/LiveMultiplayerBets";
import type { RouletteOutcome } from "@/lib/multiplayer-rules";
import { BET_PRESETS } from "@/lib/betPresets";
import RouletteWheel from "./RouletteWheel";
import "./auto-roulette.css";
import {
  Hotspot,
  Placement,
  WHEEL_ORDER,
  aggregate,
  betInfo,
  buildHotspots,
  colorOf,
  fmtChip,
  fmtMoney,
  gridNumber,
  totalOf,
} from "@/lib/roulette";
import { sfx } from "@/lib/sound";

const BET_TIME = 20;

type Phase = "betting" | "closing" | "spinning" | "result";

const CHIP_VALUES: number[] = [...BET_PRESETS];

const CHIP_STYLE: Record<number, { bg: string; edge: string; text: string }> = {
  50: { bg: "#dc2626", edge: "#fecaca", text: "#ffffff" },
  100: { bg: "#111827", edge: "#9ca3af", text: "#ffffff" },
  200: { bg: "#16a34a", edge: "#bbf7d0", text: "#ffffff" },
  500: { bg: "#7c3aed", edge: "#ddd6fe", text: "#ffffff" },
  1000: { bg: "#d97706", edge: "#fde68a", text: "#ffffff" },
};

function chipStyleFor(amount: number) {
  let v = 50;
  for (const c of [50, 100, 200, 500, 1000]) if (amount >= c) v = c;
  return CHIP_STYLE[v];
}

function Chip({
  label,
  value,
  size = 48,
  selected,
  onClick,
  disabled,
}: {
  label?: string;
  value: number;
  size?: number;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const s = chipStyleFor(value);
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      disabled={onClick ? disabled : undefined}
      className={`relative flex shrink-0 items-center justify-center rounded-full font-bold transition-transform ${
        onClick ? "cursor-pointer hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50" : ""
      } ${selected ? "-translate-y-2 scale-110" : ""}`}
      style={{
        width: size,
        height: size,
        color: s.text,
        fontSize: size * 0.3,
        background: `radial-gradient(circle at 35% 30%, ${s.bg} 0%, ${s.bg} 55%, rgba(0,0,0,0.45) 130%)`,
        border: `${Math.max(2, size * 0.09)}px dashed ${s.edge}`,
        boxShadow: selected
          ? `0 0 0 2px #fbbf24, 0 0 18px 3px rgba(251,191,36,0.75), 0 5px 8px rgba(0,0,0,0.6)`
          : `0 3px 5px rgba(0,0,0,0.6), inset 0 0 0 ${Math.max(1, size * 0.05)}px rgba(255,255,255,0.15)`,
      }}
    >
      <span
        className="flex items-center justify-center rounded-full"
        style={{
          width: size * 0.66,
          height: size * 0.66,
          border: `1px solid ${s.edge}`,
          background: "rgba(0,0,0,0.12)",
          textShadow: "0 1px 1px rgba(0,0,0,0.5)",
        }}
      >
        {label ?? fmtChip(value)}
      </span>
    </Tag>
  );
}

const numBg = (n: number) =>
  colorOf(n) === "red"
    ? "linear-gradient(160deg,#e11d2e,#9b0e1b)"
    : colorOf(n) === "black"
      ? "linear-gradient(160deg,#26262b,#050506)"
      : "linear-gradient(160deg,#16a34a,#0a6b2e)";

const badgeBg = (n: number) => (colorOf(n) === "red" ? "#d91f2e" : colorOf(n) === "black" ? "#16161a" : "#12913f");

function NumBadge({ n, size = 30, ring }: { n: number; size?: number; ring?: boolean }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: badgeBg(n),
        border: ring ? "2px solid #fbbf24" : "1.5px solid rgba(255,255,255,0.35)",
        boxShadow: ring ? "0 0 14px rgba(251,191,36,0.8)" : "0 2px 3px rgba(0,0,0,0.5)",
      }}
    >
      {n}
    </span>
  );
}

const HOTSPOTS: Hotspot[] = buildHotspots();
const ROW_H = 54;

export default function AutoRoulette({ backHref }: { backHref?: string }) {
  const live = useMultiplayerGame<RouletteOutcome>("auto-roulette");
  const personalTable = live.state?.tableMode === "personal";
  const balance = live.state?.balance ?? 0;
  const serverRound = live.state?.round;
  const phase: Phase = !serverRound || serverRound.phase === "betting" ? "betting"
    : serverRound.phase === "running" ? live.now < serverRound.bettingEndsAt + 500 ? "closing" : "spinning" : "result";
  const timeLeft = serverRound ? Math.max(0, Math.ceil((serverRound.bettingEndsAt - live.now) / 1000)) : 0;
  const round = serverRound?.roundNo ?? 0;
  const activeBets = live.state?.myBets.filter((bet) => bet.status !== "cancelled") ?? [];
  const placements: Placement[] = activeBets.map((bet) => ({ key: bet.option, amount: bet.amount }));
  const queued = live.state?.myQueuedBets.filter((bet) => bet.status === "pending") ?? [];
  const bettingOpen = phase === "betting" && timeLeft > 0 && !!serverRound && live.now < serverRound.bettingEndsAt;
  const editableBets = bettingOpen ? activeBets : queued;
  const editing: Placement[] = editableBets.map((bet) => ({ key: bet.option, amount: bet.amount }));
  const [lastBets, setLastBets] = useState<Placement[]>([]);
  const [chip, setChip] = useState<number>(BET_PRESETS[0]);
  const result = phase === "result" ? serverRound?.result?.number ?? null : null;
  const spin = serverRound?.result && phase !== "betting" ? {
    id: round, target: serverRound.result.number,
    startedAt: serverRound.bettingEndsAt, resultAt: serverRound.resultAt, now: live.now,
  } : null;
  const history = live.state?.history.map((entry) => entry.result.number) ?? [];
  const lastWin = phase === "result" ? activeBets.reduce((sum, bet) => sum + bet.payout, 0) : 0;
  const roundNet = phase === "result" && placements.length && !activeBets.some(bet => bet.poolPending) ? lastWin - totalOf(placements) : null;
  const [hover, setHover] = useState<Set<number>>(new Set());
  const [muted, setMuted] = useState(false);
  const [session, setSession] = useState({ played: 0, won: 0 });
  const [toast, setToast] = useState<string | null>(null);
  const settledRound = useRef<number | null>(null);
  const actionLock = useRef(false);
  const mounted = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const play = useCallback((name: keyof typeof sfx | "tickUrgent") => {
    if (mutedRef.current) return;
    if (name === "tickUrgent") gameSfx.tickUrgent(); else sfx[name]();
  }, []);

  const agg = aggregate(editing);
  const totalBet = totalOf(placements);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => {
    if (!live.state) return;
    let active = true;
    const placed = live.state.myBets.filter((bet) => bet.status !== "cancelled" && bet.amount > 0);
    queueMicrotask(() => {
      if (!active) return;
      if (placed.length && phase !== "betting") setLastBets(placed.map((bet) => ({ key: bet.option, amount: bet.amount })));
      if (phase !== "result" || settledRound.current === round) return;
      settledRound.current = round;
      if (placed.length) {
        const poolPending = placed.some(bet => bet.poolPending);
        const won = !poolPending && placed.reduce((sum, bet) => sum + bet.payout - bet.amount, 0) > 0;
        if (!poolPending) setSession((previous) => ({ played: previous.played + 1, won: previous.won + Number(won) }));
        window.dispatchEvent(new CustomEvent("wx:game-result", { detail: {
          game: "Auto Roulette", bet: placed.reduce((sum, bet) => sum + bet.amount, 0),
          win: poolPending ? 0 : placed.reduce((sum, bet) => sum + bet.payout, 0), won,
          poolPending, poolClaim: placed.reduce((sum, bet) => sum + (bet.poolClaim ?? 0), 0),
        } }));
        if (won) play("win");
      }
    });
    return () => { active = false; };
  }, [live.state, phase, round, play]);

  /* ---------- actions ---------- */
  const submitBets = async (items: Placement[]) => {
    if (actionLock.current || live.busy || !mounted.current) return;
    if (!live.state) {
      flash("Live table is connecting. Please wait.");
      return;
    }
    if (!bettingOpen) {
      flash("Betting is closed. Wait for the next round to begin.");
      return;
    }
    if (items.some((item) => !Number.isFinite(item.amount) || item.amount < 10)) {
      flash("Minimum bet is Rs. 10.");
      return;
    }
    actionLock.current = true;
    try {
      for (const item of items) {
        if (!mounted.current) break;
        const reply = await live.place(item.key, item.amount);
        if (!mounted.current) break;
        if ("error" in reply) { flash(reply.error); break; }
        play("chip");
      }
    } finally { actionLock.current = false; }
  };
  const placeBet = (key: string) => {
    if (!Number.isFinite(chip) || chip < 10) return flash("Minimum bet is Rs. 10.");
    if (chip > balance) return flash("Insufficient balance.");
    void submitBets([{ key, amount: chip }]);
  };

  const undo = () => {
    const last = editableBets.at(-1);
    if (!live.busy && !actionLock.current && last) void live.cancel(last.roundNo, last.id);
  };

  const clearAll = () => {
    if (!live.busy && !actionLock.current && serverRound) void live.cancel(round + (bettingOpen ? 0 : 1));
  };

  const rebet = () => {
    void submitBets(lastBets);
  };

  const doubleBets = () => {
    void submitBets(editing);
  };

  const addFunds = () => {
    flash("Add funds from your wallet.");
  };

  /* ---------- stats ---------- */
  const stats = useMemo(() => {
    const counts = new Array(37).fill(0) as number[];
    history.forEach((n) => counts[n]++);
    const sorted = counts.map((c, n) => ({ n, c })).sort((a, b) => b.c - a.c || a.n - b.n);
    const hot = sorted.slice(0, 5);
    const cold = [...sorted].reverse().slice(0, 5);
    const total = history.length || 1;
    const red = history.filter((n) => colorOf(n) === "red").length;
    const black = history.filter((n) => colorOf(n) === "black").length;
    const green = history.filter((n) => n === 0).length;
    return { hot, cold, red: (red / total) * 100, black: (black / total) * 100, green: (green / total) * 100 };
  }, [history]);

  const hoverOn = (key: string) => setHover(new Set(betInfo(key).numbers));
  const hoverOff = () => setHover(new Set());

  const isLit = (n: number) => hover.has(n);
  const isWin = (n: number) => phase === "result" && result === n;

  /* ---------- table pieces ---------- */
  const BetChip = ({ k, size = 28 }: { k: string; size?: number }) =>
    agg[k] ? (
      <span className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
        <Chip value={agg[k]} size={size} />
      </span>
    ) : null;

  const cellCls = (lit: boolean, win = false) =>
    `relative flex items-center justify-center border border-white/50 text-white font-semibold transition-[filter,box-shadow] ${
      "cursor-pointer hover:brightness-125"
    } ${lit ? "brightness-150 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.85)]" : ""} ${win ? "win-glow z-10" : ""}`;

  const outsideCell = (key: string, content: React.ReactNode, cls = "") => (
    <button
      key={key}
      onClick={() => placeBet(key)}
      disabled={!bettingOpen || live.busy}
      onMouseEnter={() => hoverOn(key)}
      onMouseLeave={hoverOff}
      className={`${cellCls(false)} ${cls} h-full`}
      style={{ background: "rgba(0,0,0,0.12)" }}
    >
      {content}
      <BetChip k={key} />
    </button>
  );

  const statusText =
    phase === "betting"
      ? "PLACE YOUR BETS"
      : phase === "closing"
        ? "NO MORE BETS"
        : phase === "spinning"
          ? "SPINNING..."
          : "WINNING NUMBER";

  const won = phase === "result" && roundNet !== null && roundNet > 0;
  const lost = phase === "result" && roundNet !== null && roundNet < 0;

  const R = 30;
  const CIRC = 2 * Math.PI * R;
  const frac = phase === "betting" ? timeLeft / BET_TIME : 0;

  return (
    <div className="auto-roulette-container h-full w-full flex flex-col min-h-0 text-white overflow-hidden" style={{ background: "radial-gradient(ellipse at 50% -10%, #0f3d2a 0%, #071a12 45%, #020806 100%)" }}>
      {/* Top bar */}
      <header className="flex-shrink-0 flex items-center justify-between border-b border-amber-500/20 bg-black/60 px-3 py-2 backdrop-blur z-10 md:px-8">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href={backHref || "/player"}
            className="flex items-center gap-1 text-xs font-semibold text-amber-300/90 hover:text-amber-200 bg-white/5 hover:bg-white/10 border border-amber-400/30 px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
          >
            ← <span className="hidden sm:inline">Back</span>
          </Link>
          <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full border-2 border-amber-400 bg-gradient-to-br from-red-600 to-red-900 text-xs sm:text-sm font-black shadow-[0_0_12px_rgba(251,191,36,0.5)]">
            0
          </div>
          <div className="leading-tight">
            <div className="text-base font-black tracking-[0.15em] text-amber-300 sm:text-lg md:text-xl">AUTO ROULETTE</div>
            <div className="flex items-center gap-2 text-[9px] sm:text-[10px] uppercase tracking-widest text-white/60">
              <span className="flex items-center gap-1 text-red-400">
                <span className="inline-block h-1.5 w-1.5 sm:h-2 sm:w-2 animate-pulse rounded-full bg-red-500" /> Live
              </span>
              <span>Round #{round}</span>
              <span className="hidden sm:inline">• European</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <div className="hidden rounded-md border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 sm:block">
            Won <b className="text-amber-300">{session.won}</b> / {session.played} rounds
          </div>
          <button
            onClick={() => setMuted((m) => !m)}
            className="rounded-md border border-white/15 bg-white/5 hover:bg-white/10 px-2.5 py-1 text-xs font-semibold transition active:scale-95"
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
      </header>

      <main className="auto-roulette-main flex-1 min-h-0 overflow-y-auto mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-4 p-2 sm:p-4 xl:grid-cols-[400px_1fr]">
        {/* LEFT: wheel */}
        <section className="auto-roulette-wheel-panel flex flex-col gap-3 sm:gap-4">
          <div className="relative rounded-2xl border border-amber-500/25 bg-gradient-to-b from-black/50 to-black/20 p-4 shadow-[0_10px_40px_rgba(0,0,0,0.6)]">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div
                  className={`text-sm font-black tracking-[0.2em] ${
                    phase === "betting" ? "text-emerald-300" : phase === "result" ? "text-amber-300" : "text-red-400"
                  }`}
                >
                  {statusText}
                </div>
                <div className="text-[11px] text-white/50">
                  {phase === "betting" ? "Chips can be placed until the timer ends" : "Current bets locked; wait for the next round"}
                </div>
              </div>
              <div className="relative h-[72px] w-[72px]">
                <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
                  <circle cx="36" cy="36" r={R} fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
                  <circle
                    cx="36"
                    cy="36"
                    r={R}
                    fill="none"
                    stroke={timeLeft <= 5 && phase === "betting" ? "#ef4444" : "#34d399"}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={CIRC}
                    strokeDashoffset={CIRC * (1 - frac)}
                    style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-2xl font-black tabular-nums">
                  {phase === "betting" ? timeLeft : phase === "result" ? "✓" : "⏳"}
                </div>
              </div>
            </div>

            <div className="relative mx-auto aspect-square w-full max-w-[400px]">
              <RouletteWheel spin={spin} highlight={phase === "result" ? result : null} onEnd={() => play("land")} onDrop={() => play("land")} />
              {phase === "closing" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="rounded-lg bg-black/75 px-5 py-2 text-lg font-black tracking-widest text-red-400 shadow-lg ring-1 ring-red-500/60">
                    NO MORE BETS
                  </div>
                </div>
              )}
              {phase === "result" && result !== null && (
                <div className="pop-in absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center rounded-2xl bg-black/80 px-6 py-3 shadow-2xl ring-2 ring-amber-400/70 backdrop-blur-sm">
                    <NumBadge n={result} size={64} ring />
                    <div className="mt-1 text-[11px] uppercase tracking-widest text-white/70">
                      {colorOf(result)} {result !== 0 && `• ${result % 2 ? "odd" : "even"}`}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Result banner */}
            <div className="mt-3 h-14">
              {phase === "result" && roundNet !== null ? (
                <div
                  className={`pop-in flex h-full items-center justify-between rounded-xl px-4 font-bold ${
                    won
                      ? "bg-gradient-to-r from-amber-500/30 to-emerald-500/30 ring-1 ring-amber-400"
                      : "bg-red-900/40 ring-1 ring-red-500/50"
                  }`}
                >
                  <span className={`text-lg tracking-widest ${won ? "text-amber-300" : "text-red-300"}`}>
                    {won ? "YOU WIN!" : lost ? "No win" : "PUSH"}
                  </span>
                  <span className={`text-xl tabular-nums ${won ? "text-emerald-300" : "text-red-300"}`}>
                    {won ? `+Rs. ${fmtMoney(roundNet)}` : lost ? "" : `Rs. ${fmtMoney(Math.abs(roundNet))}`}
                  </span>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xs uppercase tracking-widest text-white/40">
                  {phase === "result" ? activeBets.some(bet => bet.poolPending) ? "Round complete · daily pool payout pending" : "No bets placed this round" : "Good luck!"}
                </div>
              )}
            </div>
          </div>

          <LiveMultiplayerBets state={live.state} error={live.error} />

          {/* History */}
          <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
            <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">
              <span>Last Numbers</span>
              <span className="text-white/30">{history.length} spins</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {history.slice(0, 16).map((n, i) => (
                <NumBadge key={`${i}-${n}-${history.length}`} n={n} size={i === 0 ? 40 : 30} ring={i === 0} />
              ))}
              {!history.length && <span className="text-xs text-white/40">No results yet</span>}
            </div>
          </div>

          {/* Statistics */}
          <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">Statistics</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1.5 text-[11px] font-semibold text-orange-400">🔥 HOT</div>
                <div className="flex flex-wrap gap-1">
                  {stats.hot.map((h) => (
                    <div key={h.n} className="flex flex-col items-center gap-0.5">
                      <NumBadge n={h.n} size={28} />
                      <span className="text-[10px] text-white/50">{h.c}x</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-[11px] font-semibold text-sky-400">❄ COLD</div>
                <div className="flex flex-wrap gap-1">
                  {stats.cold.map((h) => (
                    <div key={h.n} className="flex flex-col items-center gap-0.5">
                      <NumBadge n={h.n} size={28} />
                      <span className="text-[10px] text-white/50">{h.c}x</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3 flex h-5 overflow-hidden rounded-full text-[10px] font-bold">
              <div className="flex items-center justify-center bg-red-600" style={{ width: `${stats.red}%` }}>
                {Math.round(stats.red)}%
              </div>
              <div className="flex items-center justify-center bg-green-600" style={{ width: `${stats.green}%` }} />
              <div className="flex items-center justify-center bg-neutral-800" style={{ width: `${stats.black}%` }}>
                {Math.round(stats.black)}%
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT: table */}
        <section className="auto-roulette-bet-panel flex min-w-0 flex-col gap-4">
          <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-b from-[#3a2410] to-[#1c1006] p-2 shadow-[0_10px_40px_rgba(0,0,0,0.6)] md:p-3">
            <div
              className="overflow-x-auto rounded-xl p-3 md:p-5"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 30%, #0e8a4c 0%, #08683a 55%, #054d2a 100%)",
                boxShadow: "inset 0 0 40px rgba(0,0,0,0.55)",
              }}
            >
              <div className="min-w-[760px] pb-1 pt-3 pr-4">
                {/* main grid */}
                <div className="flex" style={{ height: ROW_H * 3 }}>
                  {/* zero */}
                  <button
                    onClick={() => placeBet("n:0")}
                    disabled={!bettingOpen || live.busy}
                    onMouseEnter={() => hoverOn("n:0")}
                    onMouseLeave={hoverOff}
                    className={`${cellCls(isLit(0), isWin(0))} rounded-l-[40px] text-2xl`}
                    style={{ width: "7%", background: numBg(0) }}
                  >
                    0
                    <BetChip k="n:0" size={32} />
                  </button>

                  {/* numbers 12 x 3 */}
                  <div className="relative" style={{ width: "85%" }}>
                    <div className="grid h-full grid-cols-12 grid-rows-3">
                      {[0, 1, 2].flatMap((r) =>
                        Array.from({ length: 12 }, (_, c) => {
                          const n = gridNumber(c, r);
                          const k = `n:${n}`;
                          return (
                            <button
                              key={n}
                              onClick={() => placeBet(k)}
                              disabled={!bettingOpen || live.busy}
                              onMouseEnter={() => hoverOn(k)}
                              onMouseLeave={hoverOff}
                              className={`${cellCls(isLit(n), isWin(n))} text-xl`}
                              style={{ background: numBg(n), gridColumn: c + 1, gridRow: r + 1 }}
                            >
                              <span className="rounded-full border border-white/25 px-1.5 py-0.5 leading-none">{n}</span>
                              <BetChip k={k} />
                            </button>
                          );
                        }),
                      )}
                    </div>
                    {/* inner-bet hotspots */}
                    {HOTSPOTS.map((h) => (
                        <button
                          key={h.key}
                          aria-label={betInfo(h.key).label}
                          title={`${betInfo(h.key).label} (${personalTable ? "round gross return capped at 2x total stake" : `pays ${betInfo(h.key).payout}:1`})`}
                          onClick={() => placeBet(h.key)}
                          disabled={!bettingOpen || live.busy}
                          onMouseEnter={() => hoverOn(h.key)}
                          onMouseLeave={hoverOff}
                          className="absolute z-10 h-[16px] w-[16px] -translate-x-1/2 -translate-y-1/2 rounded-full hover:bg-white/40 hover:ring-2 hover:ring-white"
                          style={{ left: `${(h.x / 12) * 100}%`, top: `${(h.y / 3) * 100}%` }}
                        />
                      ))}
                    {/* chips on inner hotspots */}
                    {HOTSPOTS.filter((h) => agg[h.key]).map((h) => (
                      <span
                        key={`c-${h.key}`}
                        className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2"
                        style={{ left: `${(h.x / 12) * 100}%`, top: `${(h.y / 3) * 100}%` }}
                      >
                        <Chip value={agg[h.key]} size={26} />
                      </span>
                    ))}
                  </div>

                  {/* 2 to 1 */}
                  <div className="grid grid-rows-3" style={{ width: "8%" }}>
                    {[3, 2, 1].map((col) =>
                      outsideCell(
                        `col:${col}`,
                        <span className="-rotate-0 text-xs font-bold leading-none md:text-sm">2 to 1</span>,
                      ),
                    )}
                  </div>
                </div>

                {/* dozens */}
                <div className="grid grid-cols-3" style={{ marginLeft: "7%", marginRight: "8%", height: 46 }}>
                  {[1, 2, 3].map((d) =>
                    outsideCell(`dz:${d}`, <span className="text-sm font-bold tracking-wide md:text-base">{d === 1 ? "1st" : d === 2 ? "2nd" : "3rd"} 12</span>),
                  )}
                </div>

                {/* outside bets */}
                <div className="grid grid-cols-6" style={{ marginLeft: "7%", marginRight: "8%", height: 50 }}>
                  {outsideCell("low", <span className="text-sm font-bold md:text-base">1-18</span>)}
                  {outsideCell("even", <span className="text-sm font-bold tracking-wide md:text-base">EVEN</span>)}
                  {outsideCell(
                    "red",
                    <span className="h-7 w-12 rounded-[50%] border border-white/40" style={{ background: "linear-gradient(160deg,#e11d2e,#9b0e1b)", transform: "skewX(-20deg)" }} />,
                  )}
                  {outsideCell(
                    "black",
                    <span className="h-7 w-12 rounded-[50%] border border-white/40" style={{ background: "linear-gradient(160deg,#2b2b30,#050506)", transform: "skewX(-20deg)" }} />,
                  )}
                  {outsideCell("odd", <span className="text-sm font-bold tracking-wide md:text-base">ODD</span>)}
                  {outsideCell("high", <span className="text-sm font-bold md:text-base">19-36</span>)}
                </div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="rounded-2xl border border-white/10 bg-black/50 p-4 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
            <p role="status" className="mb-2 text-center text-xs text-amber-200">
              {!bettingOpen ? "Betting is closed. Wait for the next round to begin." : !editing.length
                ? "Choose a chip, then tap a table selection to place a bet."
                : `Selected bets: Rs. ${fmtMoney(totalOf(editing))}.`}
              {!bettingOpen && queued.length > 0 && ` Previously reserved: Rs. ${fmtMoney(totalOf(editing))}.`}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 lg:justify-between">
              {/* chips */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                {CHIP_VALUES.map((v) => (
                  <Chip key={v} value={v} size={54} selected={chip === v} onClick={() => setChip(v)} label={`${v}`} />
                ))}
                <input
                  type="number"
                  min={10}
                  inputMode="numeric"
                  value={chip || ""}
                  onChange={(e) => setChip(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
                  aria-label="Custom chip amount"
                  placeholder="Rs."
                  className="w-24 rounded-lg border border-amber-400/50 bg-black/50 px-2 py-2 text-sm font-bold text-amber-300 outline-none"
                />
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {[
                  { label: "↶ Undo", fn: undo, dis: !editing.length, color: "border-slate-500/40 bg-slate-700/60 hover:bg-slate-600 text-slate-200" },
                  { label: "⟳ Rebet", fn: rebet, dis: !bettingOpen || !lastBets.length, color: "border-amber-400/40 bg-amber-500/25 hover:bg-amber-500/45 text-amber-200" },
                  { label: "2x Double", fn: doubleBets, dis: !bettingOpen || !editing.length, color: "border-purple-500/40 bg-purple-600/30 hover:bg-purple-600/50 text-purple-200" },
                  { label: "✕ Clear", fn: clearAll, dis: !editing.length, color: "border-rose-500/40 bg-rose-600/30 hover:bg-rose-600/50 text-rose-200" },
                ].map((b) => (
                  <button
                    key={b.label}
                    onClick={b.fn}
                    disabled={b.dis || live.busy || !live.state}
                    className={`rounded-lg border px-3.5 py-2 text-xs sm:text-sm font-bold shadow transition hover:brightness-120 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 ${b.color}`}
                  >
                    {b.label}
                  </button>
                ))}
                <div
                  role="status"
                  className="rounded-lg bg-gradient-to-r from-emerald-500/45 via-green-500/45 to-emerald-600/45 px-4 sm:px-5 py-2 text-center text-xs sm:text-sm font-black tracking-wider text-white/70 shadow-[0_0_18px_rgba(16,185,129,0.2)]"
                >
                  {bettingOpen ? `STARTS IN ${timeLeft}s` : "SHARED ROUND · AUTO SPIN"}
                </div>
              </div>
            </div>

            {/* stats bar */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2">
                <div className="text-[10px] uppercase tracking-widest text-white/50">Balance</div>
                <div className="flex items-center justify-between">
                  <div className="text-lg font-black tabular-nums text-amber-300 md:text-2xl">Rs. {fmtMoney(balance)}</div>
                  {balance < 5 && (
                    <button onClick={addFunds} className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold hover:bg-emerald-500">
                      + ADD
                    </button>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2">
                <div className="text-[10px] uppercase tracking-widest text-white/50">Total Bet</div>
                <div className="text-lg font-black tabular-nums md:text-2xl">Rs. {fmtMoney(phase === "betting" || phase === "closing" || phase === "spinning" || phase === "result" ? totalBet : 0)}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2">
                <div className="text-[10px] uppercase tracking-widest text-white/50">Win</div>
                <div className={`text-lg font-black tabular-nums md:text-2xl ${lastWin > 0 ? "text-emerald-300" : "text-white/70"}`}>Rs. {fmtMoney(lastWin)}</div>
              </div>
            </div>
          </div>

          {/* Payout info */}
          <div className="grid grid-cols-2 gap-2 text-center text-[11px] text-white/60 sm:grid-cols-4 lg:grid-cols-7">
            {[
              ["Straight", "35:1"],
              ["Split", "17:1"],
              ["Street", "11:1"],
              ["Corner", "8:1"],
              ["Line", "5:1"],
              ["Dozen / Column", "2:1"],
              ["Red/Black/Odd/Even", "1:1"],
            ].map(([a, b]) => (
              <div key={a} className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5">
                <div className="font-bold text-amber-300">{personalTable ? "Round cap 2x" : b}</div>
                <div>{a}</div>
              </div>
            ))}
          </div>

          {/* Wheel order helper (real wheel sequence) */}
          <div className="hidden text-[10px] text-white/20 xl:block">{WHEEL_ORDER.length} pockets • Single zero</div>
        </section>
      </main>

      {toast && (
        <div className="pop-in fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-black/85 px-5 py-2.5 text-sm font-semibold text-amber-200 ring-1 ring-amber-400/60">
          {toast}
        </div>
      )}

      {won && (
        <div className="pointer-events-none fixed inset-x-0 top-24 z-40 flex justify-center">
          <div className="win-banner rounded-2xl bg-gradient-to-b from-amber-300 to-amber-600 px-10 py-4 text-center text-black shadow-[0_0_60px_rgba(251,191,36,0.8)]">
            <div className="text-xs font-black tracking-[0.4em]">BIG WIN</div>
            <div className="text-4xl font-black tabular-nums">Rs. {fmtMoney(lastWin)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
