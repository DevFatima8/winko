"use client";

import { notifyGameResult } from "@/lib/gameResultNotice";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useLiveTable } from "../teen-patti/useLiveTable";
import { useGameBalance, useBrowserWager, useDailyPoolMode } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import { Coin, CoinFace } from "./Coin";
import "./head-tail.css";
import {
  EMPTY_STATS,
  FLIP_MS,

  MIN_BET,
  PAYOUT_MULTIPLIER,
  START_BALANCE,

  fmt,
  round2,
  type FlipResponse,
  type RoundItem,
  type Side,
  type Stats,
} from "./lib/game";
import {
  playClick,
  playFlip,
  playLose,
  playWin,
  unlockAudio,
} from "./lib/sound";

const STORAGE_KEY = "head-tail-casino-v1";
const QUICK_CHIPS: readonly number[] = BET_PRESETS;
const CONFETTI_COLORS = ["#f5b301", "#22c55e", "#6366f1", "#ec4899", "#38bdf8", "#fff1a6"];

type Confetti = {
  id: number;
  left: number;
  delay: number;
  dur: number;
  size: number;
  drift: number;
  rot: number;
  color: string;
};

function parseAmount(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? round2(n) : 0;
}

export default function HeadTailGame({ backHref = "/player" }: { backHref?: string }) {
  const [balance] = useGameBalance("head-tail", START_BALANCE);
  const { playServer } = useBrowserWager("head-tail", START_BALANCE);
  const poolEnabled = useDailyPoolMode();
  const [side, setSide] = useState<Side>("head");
  const [amountStr, setAmountStr] = useState("10");
  const [history, setHistory] = useState<RoundItem[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [flipping, setFlipping] = useState(false);
  const [tossing, setTossing] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [lastRound, setLastRound] = useState<RoundItem | null>(null);
  const [confetti, setConfetti] = useState<Confetti[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);

  const mutedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundIdRef = useRef(0);
  const [livePhase, setLivePhase] = useState("betting");
  const [nextBet, setNextBet] = useState({ head: 0, tail: 0 });
  const alive = useRef(true);
  const request = useRef<AbortController | null>(null);
  const live = useLiveTable({
    phase: livePhase, balance, draft: nextBet, targets: ["head", "tail"],
    minBet: MIN_BET, singleTarget: true,
    start: () => { void handleFlip(true); },
    reset: () => { setNextBet({ head: 0, tail: 0 }); setLivePhase("betting"); },
    apply: setNextBet,
  });

  /* ---------- persistence (localStorage only, no database) ---------- */
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as {
            balance?: number;
            history?: RoundItem[];
            stats?: Stats;
            muted?: boolean;
          };
          if (Array.isArray(saved.history)) {
            setHistory(saved.history);
            roundIdRef.current = saved.history.reduce(
              (max, h) => Math.max(max, h.id),
              0,
            );
          }
          if (saved.stats) setStats(saved.stats);
          if (typeof saved.muted === "boolean") {
            setMuted(saved.muted);
            mutedRef.current = saved.muted;
          }
        }
      } catch {
        /* ignore corrupted storage */
      }
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ balance, history, stats, muted }),
      );
    } catch {
      /* storage unavailable */
    }
  }, [balance, history, stats, muted, hydrated]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  /* ---------- derived values ---------- */
  const amount = parseAmount(amountStr);
  const winAmount = round2(amount * PAYOUT_MULTIPLIER);
  const cap = Math.max(MIN_BET, balance);
  const outOfFunds = balance < MIN_BET;
  const recent = history.slice(0, 12);


  const sfx = useCallback((fn: () => void) => {
    if (!mutedRef.current) fn();
  }, []);

  /* ---------- amount controls ---------- */
  const setAmount = (n: number) => {
    setError(null);
    setAmountStr(String(round2(n)));
  };

  const onAmountChange = (value: string) => {
    if (/^\d*\.?\d{0,2}$/.test(value)) {
      setError(null);
      setAmountStr(value);
    }
  };

  /* ---------- game actions ---------- */
  const handleFlip = async (spectator = false) => {
    if (flipping) return;
    setError(null);
    let wager = spectator ? nextBet : { head: side === "head" ? amount : 0, tail: side === "tail" ? amount : 0 };
    let stake = wager.head + wager.tail;

    if ((!stake || stake < MIN_BET) && !spectator) {
      setError(`Minimum bet is ${fmt(MIN_BET)}`);
      return;
    }
    if (stake > balance && !spectator) {
      setError("Insufficient balance for this bet");
      return;
    }
    const accepted = live.begin(wager);
    if (!accepted) return;
    wager = accepted;
    stake = wager.head + wager.tail;

    unlockAudio();
    const pick: Side = wager.head > 0 ? "head" : wager.tail > 0 ? "tail" : side;
    const roundAmount = stake;
    setLivePhase("spinning");
    setFlipping(true);
    setLastRound(null);
    setConfetti([]);

    let data: FlipResponse;
    let notice: { wagerId: string; claim: number; poolPending: boolean } | null = null;
    try {
      if (roundAmount === 0) {
        data = { result: Math.random() < 0.5 ? "head" : "tail", win: false };
      } else {
      const accepted = await playServer(roundAmount, { choice: pick });
      notice = accepted;
      data = accepted.outcome as FlipResponse;
      if (accepted.poolPending) setError("Provisional claim only. Wallet payment awaits daily pool settlement.");
      }
    } catch {
      if (!alive.current) return;
      setFlipping(false);
      setLivePhase("result");
      setError("Wager confirmation failed. Retry the saved wager before placing another bet; no refund or win is assumed.");
      return;
    }
    if (!alive.current) return;

    // Work out the rotation so the coin lands on the correct face.
    const base = rotation + 360 * 6;
    const mod = ((base % 360) + 360) % 360;
    const target = data.result === "head" ? 0 : 180;
    const nextRotation = base + ((target - mod + 360) % 360);

    setTossing(true);
    setRotation(nextRotation);
    sfx(() => playFlip(FLIP_MS));

    timerRef.current = setTimeout(() => {
      if (roundAmount === 0) {
        setTossing(false);
        setFlipping(false);
        setLivePhase("result");
        return;
      }
      const item: RoundItem = {
        id: ++roundIdRef.current,
        time: Date.now(),
        pick,
        result: data.result,
        amount: roundAmount,
        win: data.win,
      };

      if (data.win) {
        setConfetti(
          Array.from({ length: 38 }, (_, i) => ({
            id: i,
            left: Math.random() * 100,
            delay: Math.random() * 0.5,
            dur: 1.6 + Math.random() * 1.2,
            size: 6 + Math.random() * 8,
            drift: (Math.random() - 0.5) * 160,
            rot: (Math.random() - 0.5) * 900,
            color:
              CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          })),
        );
        sfx(playWin);
      } else {
        sfx(playLose);
      }

      setHistory((h) => [item, ...h].slice(0, 50));
      setStats((s) => ({
        bets: s.bets + 1,
        wins: s.wins + (data.win ? 1 : 0),
        losses: s.losses + (data.win ? 0 : 1),
        wagered: round2(s.wagered + roundAmount),
        net: round2(s.net + (data.win ? roundAmount * (PAYOUT_MULTIPLIER - 1) : -roundAmount)),
      }));
      setLastRound(item);
      if (notice) notifyGameResult("head-tail", notice.wagerId, notice.claim, notice.poolPending);
      setTossing(false);
      setFlipping(false);
      setLivePhase("result");
    }, FLIP_MS + 120);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    if (!next) {
      unlockAudio();
      playClick();
    }
  };

  const chooseSide = (s: Side) => {
    if (flipping) return;
    setSide(s);
    sfx(playClick);
  };

  const statusText = useMemo(() => {
    if (flipping) return "Flipping the coin…";
    if (lastRound) return null;
    return "Pick Head or Tail, enter your bet and flip the coin!";
  }, [flipping, lastRound]);

  return (
    <div className="head-tail-container relative h-full w-full flex flex-col justify-between overflow-y-auto overflow-x-hidden md:overflow-hidden px-2 sm:px-4 py-1.5 select-none font-sans text-slate-100">
      {live.controls}
      {/* ================= HEADER ================= */}
      <header className="z-30 border-b border-white/10 bg-[#070b18]/85 backdrop-blur-xl rounded-xl px-2.5 sm:px-4 py-1.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 px-2.5 py-1 text-xs font-semibold text-white transition hover:scale-105 active:scale-95 cursor-pointer shrink-0"
            >
              ← Back
            </Link>
            <CoinFace side="head" className="h-6 w-6 sm:h-8 sm:w-8 drop-shadow-[0_0_10px_rgba(245,179,1,0.5)] shrink-0" />
            <div className="leading-tight">
              <p className="text-xs sm:text-base font-extrabold tracking-wide">
                <span className="gold-text">HEAD</span> <span className="text-slate-300">&amp;</span> <span className="gold-text">TAIL</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 sm:px-3 sm:py-1">
              <WalletIcon />
              <div className="leading-tight text-right">
                <p className="text-[8px] uppercase tracking-widest text-slate-400">Balance</p>
                <p className="text-xs sm:text-sm font-bold text-gold tabular-nums leading-tight" data-testid="balance">{fmt(balance)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowRulesModal(true)}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] sm:text-[11px] font-semibold text-slate-300 hover:bg-white/10 hover:scale-105 active:scale-95 transition cursor-pointer"
            >
              ⓘ Rules
            </button>
            <button
              type="button"
              onClick={() => setShowHistoryModal(true)}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] sm:text-[11px] font-semibold text-slate-300 hover:bg-white/10 hover:scale-105 active:scale-95 transition cursor-pointer"
            >
              📜 History
            </button>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "Unmute sounds" : "Mute sounds"}
              className="grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:scale-105 active:scale-95 transition cursor-pointer"
            >
              {muted ? <SoundOffIcon /> : <SoundOnIcon />}
            </button>
          </div>
        </div>
      </header>

      {/* ================= MAIN STAGE & CONTROLS ================= */}
      <main className="flex-1 md:min-h-0 flex flex-col md:flex-row items-stretch justify-between gap-1.5 sm:gap-3 max-w-5xl mx-auto w-full my-auto md:overflow-hidden">
        {/* Game Stage (Order 1 on mobile, Order 2 on desktop) */}
        <section
          className={`stage-bg relative order-1 md:order-2 flex-1 min-h-[250px] md:min-h-0 overflow-hidden rounded-2xl border border-white/10 shadow-xl flex flex-col justify-between p-2 sm:p-3 ${
            lastRound && !lastRound.win ? "shake" : ""
          }`}
        >
          <div className="table-arc" />

          {/* Confetti */}
          {confetti.map((c) => (
            <span
              key={c.id}
              className="confetti-piece"
              style={
                {
                  left: `${c.left}%`,
                  width: c.size,
                  height: c.size * 0.55,
                  background: c.color,
                  "--delay": `${c.delay}s`,
                  "--dur": `${c.dur}s`,
                  "--drift": `${c.drift}px`,
                  "--rot": `${c.rot}deg`,
                } as CSSProperties
              }
            />
          ))}

          {/* Top Stage Bar */}
          <div className="relative z-10 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-widest text-slate-400">Recent:</span>
              <div className="flex items-center gap-1">
                {recent.length === 0 && <span className="text-[9px] text-slate-500">None</span>}
                {recent.slice(0, 7).map((r) => (
                  <span
                    key={r.id}
                    title={`${r.result.toUpperCase()} · ${r.win ? "Win" : ""}`}
                    className={`grid h-4.5 w-4.5 sm:h-5 sm:w-5 place-items-center rounded-full border text-[8px] sm:text-[9px] font-black ${
                      r.win ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-300" : "border-red-400/60 bg-red-500/15 text-red-300"
                    }`}
                  >
                    {r.result === "head" ? "H" : "T"}
                  </span>
                ))}
              </div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[8.5px] sm:text-[10px] font-bold uppercase tracking-wider ${
              side === "head" ? "bg-amber-400/15 text-amber-300" : "bg-indigo-400/15 text-indigo-300"
            }`}>
              Pick: {side}
            </span>
          </div>

          {/* Coin Stage */}
          <div className="relative z-10 flex flex-1 items-center justify-center min-h-[140px] sm:min-h-[150px] my-auto py-2">
            <Coin rotation={rotation} durationMs={FLIP_MS} tossing={tossing} />
          </div>

          {/* Result message */}
          <div className="relative z-10 flex items-center justify-center min-h-[34px] sm:min-h-[46px] shrink-0">
            {statusText && (
              <p className={`text-center text-[11px] sm:text-xs font-semibold text-slate-300 ${flipping ? "soft-pulse" : ""}`}>
                {statusText}
              </p>
            )}
            {!flipping && lastRound && (
              <div
                key={lastRound.id}
                className={`pop-in rounded-xl border px-2.5 py-0.5 sm:px-3 sm:py-1 text-center shadow-lg ${
                  lastRound.win ? "glow-win border-emerald-400/50 bg-emerald-500/15" : "border-red-400/40 bg-red-500/15"
                }`}
              >
                <p className={`text-[11px] sm:text-sm font-black uppercase tracking-wider leading-tight ${lastRound.win ? "text-emerald-400" : "text-red-400"}`}>
                  {poolEnabled ? "DAILY PAYOUT PENDING" : lastRound.win ? "🎉 You Won!" : ""}
                </p>
                <p className="text-[9px] sm:text-[10px] text-slate-300 leading-tight">
                  Landed on <strong className="text-white uppercase">{lastRound.result}</strong> · {poolEnabled ? `Provisional claim ${fmt(lastRound.win ? lastRound.amount * PAYOUT_MULTIPLIER : 0)}` : lastRound.win ? `+${fmt(lastRound.amount * (PAYOUT_MULTIPLIER - 1))}` : ""}
                </p>
              </div>
            )}
          </div>

          {/* Odds & Stats bar */}
          <div className="relative z-10 border-t border-white/10 bg-black/30 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-xl flex items-center justify-between text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-400 shrink-0">
            <span>Flips: <strong className="text-white">{stats.bets}</strong></span>
            <span>Wagered: <strong className="text-gold">{fmt(stats.wagered)}</strong></span>
            <span className="text-emerald-400">Fair Play</span>
          </div>
        </section>

        {/* Bet Panel (Order 2 on mobile, Order 1 on desktop) */}
        <aside className="order-2 md:order-1 w-full md:w-[310px] lg:w-[340px] rounded-2xl border border-white/10 bg-panel p-2 sm:p-3.5 shadow-xl flex flex-col justify-between shrink-0">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-xs sm:text-sm font-bold text-white">Choose Side</h2>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[8px] sm:text-[9px] font-semibold text-slate-400">
                Min {fmt(MIN_BET)} · Max {fmt(cap)}
              </span>
            </div>

            {/* Side selection */}
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              {(["head", "tail"] as const).map((s) => {
                const active = side === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => chooseSide(s)}
                    disabled={flipping}
                    aria-pressed={active}
                    className={`relative flex flex-col items-center gap-0.5 sm:gap-1 rounded-xl border-2 px-1.5 py-1 sm:py-2.5 transition cursor-pointer hover:scale-[1.02] active:scale-95 ${
                      active
                        ? "border-gold bg-gold/15 shadow-[0_0_18px_-4px_rgba(245,179,1,0.6)]"
                        : "border-white/10 bg-panel-2 hover:border-white/25"
                    } ${flipping && !active ? "opacity-50" : ""}`}
                  >
                    {active && (
                      <span className="absolute right-1.5 top-1.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-gold text-[#2a1700]">
                        <CheckIcon />
                      </span>
                    )}
                    <CoinFace side={s} className="h-7 w-7 sm:h-11 sm:w-11" />
                    <span className={`text-[11px] sm:text-xs font-extrabold tracking-widest ${active ? "text-gold" : "text-slate-300"}`}>
                      {s === "head" ? "HEAD" : "TAIL"}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Bet Amount */}
            <p className="mb-0.5 mt-1 sm:mt-2 text-[9px] sm:text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Bet Amount
            </p>
            <div className="flex items-center overflow-hidden rounded-xl border border-white/10 bg-panel-2 focus-within:border-gold/70">
              <span className="px-2 text-xs sm:text-sm font-bold text-gold">Rs.</span>
              <input
                type="text"
                inputMode="decimal"
                value={amountStr}
                disabled={flipping}
                onChange={(e) => onAmountChange(e.target.value)}
                placeholder="0.00"
                aria-label="Bet amount"
                className="w-full bg-transparent py-1 pr-2 text-xs sm:text-sm font-bold text-white placeholder:text-slate-600 disabled:opacity-60"
              />
            </div>

            <div className="mt-1 grid grid-cols-4 gap-1">
              <QuickBtn disabled={flipping} onClick={() => setAmount(MIN_BET)}>Min</QuickBtn>
              <QuickBtn disabled={flipping} onClick={() => setAmount(Math.max(MIN_BET, amount / 2))}>½</QuickBtn>
              <QuickBtn disabled={flipping} onClick={() => setAmount(Math.min(cap, Math.max(MIN_BET, amount * 2)))}>2×</QuickBtn>
              <QuickBtn disabled={flipping} onClick={() => setAmount(cap)}>Max</QuickBtn>
            </div>

            <div className="mt-1 grid grid-cols-4 gap-1">
              {QUICK_CHIPS.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={flipping}
                  onClick={() => setAmount(c)}
                  className={`rounded-lg border px-1 py-0.5 text-[10px] sm:text-[11px] font-bold transition hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-50 ${
                    amount === c
                      ? "border-gold/70 bg-gold/20 text-gold"
                      : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="mt-1.5 flex items-center justify-between rounded-xl border border-white/5 bg-panel-2 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[10px] sm:text-[11px]">
              <span className="text-slate-400">Payout: <strong className="text-white">{PAYOUT_MULTIPLIER.toFixed(2)}x</strong></span>
              <span className="text-slate-400">Win: <strong className="text-gold">{fmt(winAmount)}</strong></span>
            </div>
          </div>

          {/* Action Button */}
          <div className="mt-1.5 sm:mt-2">
            {outOfFunds && !flipping ? (
              <p role="status" className="text-center text-xs text-rose-300">Insufficient balance</p>
            ) : (
              <button
                type="button"
                onClick={() => { void handleFlip(); }}
                disabled={flipping}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-600 hover:from-emerald-400 hover:to-green-500 text-white font-black uppercase tracking-wider py-1.5 sm:py-2.5 text-xs sm:text-sm shadow-lg shadow-green-600/30 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                {flipping ? (
                  <>
                    <span className="spinner inline-block h-3.5 w-3.5 rounded-full border-[2px] border-white/30 border-t-white" />
                    Flipping…
                  </>
                ) : (
                  <>🪙 Flip Coin</>
                )}
              </button>
            )}
            {error && (
              <p role="alert" className="mt-0.5 text-center text-[9px] sm:text-[10px] text-red-400 font-semibold">{error}</p>
            )}
          </div>
        </aside>
      </main>

      <footer className="shrink-0 text-center text-[9px] text-white/35 py-0.5 hidden sm:block">
        Demo entertainment with virtual credits only — no real money. Pick Head or Tail for 2x multipliers.
      </footer>

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3" onClick={() => setShowHistoryModal(false)}>
          <div className="max-h-[85vh] w-full max-w-xl overflow-hidden rounded-2xl border border-white/15 bg-panel p-4 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
              <h3 className="text-base font-bold text-white">Game History</h3>
              <button onClick={() => setShowHistoryModal(false)} className="rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1 text-xs text-white cursor-pointer">✕ Close</button>
            </div>
            <div className="overflow-y-auto flex-1 my-2">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-panel text-[10px] uppercase text-slate-400 border-b border-white/10">
                  <tr>
                    <th className="py-2 px-2">#</th>
                    <th className="py-2 px-2">Pick</th>
                    <th className="py-2 px-2">Result</th>
                    <th className="py-2 px-2">Bet</th>
                    <th className="py-2 px-2">Outcome</th>
                    <th className="py-2 px-2 text-right">{poolEnabled ? "Provisional claim" : "Profit"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {history.length === 0 ? (
                    <tr><td colSpan={6} className="py-8 text-center text-slate-500">No rounds played yet.</td></tr>
                  ) : (
                    history.map((r) => (
                      <tr key={r.id}>
                        <td className="py-1.5 px-2 text-slate-500">{r.id}</td>
                        <td className="py-1.5 px-2"><SideTag side={r.pick} /></td>
                        <td className="py-1.5 px-2"><SideTag side={r.result} /></td>
                        <td className="py-1.5 px-2">{fmt(r.amount)}</td>
                        <td className="py-1.5 px-2"><span className={r.win ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>{r.win ? "Win" : ""}</span></td>
                        <td className={`py-1.5 px-2 text-right font-bold ${r.win ? "text-emerald-400" : "text-rose-400"}`}>
                          {poolEnabled ? fmt(r.win ? r.amount * PAYOUT_MULTIPLIER : 0) : r.win ? `+${fmt(r.amount * (PAYOUT_MULTIPLIER - 1))}` : ""}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Rules Modal */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3" onClick={() => setShowRulesModal(false)}>
          <div className="max-h-[85vh] w-full max-w-md overflow-hidden rounded-2xl border border-white/15 bg-panel p-4 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
              <h3 className="text-base font-bold text-white">How to Play</h3>
              <button onClick={() => setShowRulesModal(false)} className="rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1 text-xs text-white cursor-pointer">✕ Close</button>
            </div>
            <div className="overflow-y-auto flex-1 my-3 space-y-3 text-xs text-slate-300">
              <p><strong>1. Choose your side:</strong> Select Head or Tail before you flip.</p>
              <p><strong>2. Set your bet:</strong> Enter any amount from {fmt(MIN_BET)} up to your balance.</p>
              <p><strong>3. Flip the coin:</strong> Hit Flip Coin. If your side lands, you win {PAYOUT_MULTIPLIER}x your bet!</p>
              <div className="rounded-xl bg-white/5 p-3 text-[11px] text-slate-400">
                Certified RNG fair-play coin simulation with 50/50 probability. Virtual demo credits only.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= small UI helpers ================= */

function QuickBtn({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-white/10 bg-white/5 py-2 text-sm font-bold text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function StatCard({
  label,
  value,
  tone,
  className = "",
}: {
  label: string;
  value: string;
  tone?: "green" | "red" | "gold";
  className?: string;
}) {
  const color =
    tone === "green"
      ? "text-emerald-400"
      : tone === "red"
        ? "text-red-400"
        : tone === "gold"
          ? "text-gold"
          : "text-white";
  return (
    <div className={`rounded-xl border border-white/10 bg-panel px-4 py-4 ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-xl font-extrabold ${color}`}>{value}</p>
    </div>
  );
}

function SideTag({ side }: { side: Side }) {
  return (
    <span className="inline-flex items-center gap-2">
      <CoinFace side={side} className="h-6 w-6" />
      <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
        {side}
      </span>
    </span>
  );
}

/* ================= icons ================= */

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-gold" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" />
      <path d="M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3" />
      <path d="M21 10h-5a2 2 0 0 0 0 4h5z" />
    </svg>
  );
}

function SoundOnIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

function SoundOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="m22 9-6 6" />
      <path d="m16 9 6 6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}
