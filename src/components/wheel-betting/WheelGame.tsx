"use client";

import { notifyGameResult } from "@/lib/gameResultNotice";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGameBalance, useBrowserWager, useDailyPoolMode } from "@/lib/walletSync";
import "./wheel-betting.css";

import BetPanel from "./BetPanel";
import { HistoryTable, ResultStrip } from "./HistoryPanels";
import Wheel, { type WheelApi } from "./Wheel";
import WinOverlay from "./WinOverlay";
import { primeAudio, setSoundEnabled, sfx } from "./lib/sound";
import type { BetRecord, Stats } from "./lib/types";
import {
  MIN_BET,
  SEGMENT_MULTIPLIERS,
  formatMoney,
  multiplierChipClass,
  segmentLabel,
} from "./lib/wheel";

const START_BALANCE = 1000;

const LS = {
  balance: "luckywheel.balance",
  bet: "luckywheel.bet",
  history: "luckywheel.history",
  stats: "luckywheel.stats",
  sound: "luckywheel.sound",
  turbo: "luckywheel.turbo",
};

const EMPTY_STATS: Stats = {
  spins: 0,
  wins: 0,
  losses: 0,
  wagered: 0,
  returned: 0,
  bestWin: 0,
  biggestMultiplier: 0,
};

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

function paytable() {
  const counts = new Map<number, number>();
  SEGMENT_MULTIPLIERS.forEach((m) => counts.set(m, (counts.get(m) ?? 0) + 1));
  const total = SEGMENT_MULTIPLIERS.length;
  return [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([multiplier, count]) => ({
      multiplier,
      count,
      chance: (count / total) * 100,
    }));
}

export default function WheelGame() {
  const [balance, setBalance] = useGameBalance("wheel-betting", START_BALANCE);
  const { playServer } = useBrowserWager("wheel-betting", START_BALANCE);
  const poolEnabled = useDailyPoolMode();
  const [bet, setBet] = useState(10);
  const [spinning, setSpinning] = useState(false);
  const [records, setRecords] = useState<BetRecord[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [soundOn, setSoundOn] = useState(true);
  const [turbo, setTurbo] = useState(false);
  const [autoCount, setAutoCount] = useState(10);
  const [autoActive, setAutoActive] = useState(false);
  const [autoRemaining, setAutoRemaining] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [overlay, setOverlay] = useState<{ payout: number; multiplier: number; bet: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [lastRound, setLastRound] = useState<BetRecord | null>(null);

  const wheelRef = useRef<WheelApi | null>(null);
  const lockRef = useRef(false);
  const autoRef = useRef({ active: false, remaining: 0 });
  const betRef = useRef(bet);
  const balanceRef = useRef(balance);
  const [hydrated, setHydrated] = useState(false);
  const [queuedBet, setQueuedBet] = useState<number | null>(null);
  const queuedRef = useRef<number | null>(null);
  const mounted = useRef(false);
  const roundRef = useRef<() => Promise<void>>(async () => {});


  /* ---------------- persistence ---------------- */
  useEffect(() => {
    try {
      const bt = window.localStorage.getItem(LS.bet);
      const h = window.localStorage.getItem(LS.history);
      const st = window.localStorage.getItem(LS.stats);
      const sd = window.localStorage.getItem(LS.sound);
      const tb = window.localStorage.getItem(LS.turbo);
      if (bt !== null) setBet(Math.max(MIN_BET, Number(bt) || MIN_BET));
      if (h) {
        const parsed = JSON.parse(h) as BetRecord[];
        if (Array.isArray(parsed)) setRecords(parsed.slice(0, 60));
      }
      if (st) {
        const parsed = JSON.parse(st) as Stats;
        if (parsed && typeof parsed.spins === "number") setStats({ ...EMPTY_STATS, ...parsed });
      }
      if (sd !== null) setSoundOn(sd === "1");
      if (tb !== null) setTurbo(tb === "1");
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(LS.balance, String(balance));
  }, [balance, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(LS.bet, String(bet));
  }, [bet, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(LS.history, JSON.stringify(records.slice(0, 60)));
  }, [records, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(LS.stats, JSON.stringify(stats));
  }, [stats, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(LS.sound, soundOn ? "1" : "0");
    setSoundEnabled(soundOn);
  }, [soundOn, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(LS.turbo, turbo ? "1" : "0");
  }, [turbo, hydrated]);

  useEffect(() => {
    setSoundEnabled(soundOn);
  }, [soundOn]);

  const stopAuto = useCallback(() => {
    autoRef.current.active = false;
    autoRef.current.remaining = 0;
    setAutoActive(false);
    setAutoRemaining(0);
  }, []);

  /* ---------------- spin ---------------- */
  const doSpin = useCallback(async () => {
    if (!mounted.current) return;
    const wager = round2(betRef.current);
    if (!Number.isFinite(wager) || wager < MIN_BET || wager > balanceRef.current) {
      setError("Not enough balance or invalid bet.");
      return;
    }
    queuedRef.current = wager;
    setQueuedBet(wager);
    setError(null);
  }, []);

  const runRound = useCallback(async () => {
    if (!mounted.current || lockRef.current) return;
    let wager = queuedRef.current ?? 0;
    queuedRef.current = null;
    setQueuedBet(null);
    if (wager === 0 && autoRef.current.active && autoRef.current.remaining > 0) {
      wager = round2(Math.max(MIN_BET, betRef.current || MIN_BET));
      autoRef.current.remaining -= 1;
      setAutoRemaining(autoRef.current.remaining);
      if (autoRef.current.remaining === 0) {
        autoRef.current.active = false;
        setAutoActive(false);
      }
    }
    if (wager > balanceRef.current) {
      setError("Not enough balance for this bet.");
      stopAuto();
      wager = 0;
    }

    lockRef.current = true;
    setError(null);
    setActiveIndex(null);
    setOverlay(null);
    setSpinning(true);
    primeAudio();
    sfx.start();

    try {
      const accepted = wager > 0 ? await playServer(wager, {}) : null;
      let outcome: unknown = accepted?.outcome;
      if (!accepted) {
        const res = await fetch("/api/wheel-betting/spin", { method: "GET", cache: "no-store" });
        if (!res.ok) throw new Error("Spectator result unavailable.");
        outcome = await res.json();
      }
      const data = outcome as {
        index: number;
        multiplier: number;
        win: boolean;
        payout: number;
        profit: number;
        hash: string;
      };
      if (!mounted.current) return;

      await wheelRef.current?.spinTo(data.index, turbo ? 2400 : 6200);
      if (!mounted.current) return;

      setActiveIndex(data.index);
      if (wager <= 0) return;
      const profit = round2(data.payout - wager);
      setActiveIndex(data.index);

      const record: BetRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        bet: wager,
        multiplier: data.multiplier,
        payout: round2(data.payout),
        profit,
        win: data.win,
        hash: data.hash,
        at: Date.now(),
      };

      setRecords((prev) => [record, ...prev].slice(0, 60));
      if (accepted) notifyGameResult("wheel-betting", accepted.wagerId, accepted.claim, accepted.poolPending);
      setStats((prev) => ({
        spins: prev.spins + 1,
        wins: prev.wins + (data.win ? 1 : 0),
        losses: prev.losses + (data.win ? 0 : 1),
        wagered: round2(prev.wagered + wager),
        returned: round2(prev.returned + data.payout),
        bestWin: Math.max(prev.bestWin, data.payout),
        biggestMultiplier: Math.max(prev.biggestMultiplier, data.multiplier),
      }));
      setLastRound(record);

      if (data.win) {
        if (accepted?.poolPending) setError(`Provisional claim Rs. ${round2(data.payout)}; daily pool settlement pending.`);
        else setOverlay({ payout: round2(data.payout), multiplier: data.multiplier, bet: wager });
        if (data.multiplier >= 5) sfx.jackpot();
        else sfx.win(data.multiplier);
      } else {
        sfx.lose();
      }
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : "Something went wrong.");
      stopAuto();
    } finally {
      if (mounted.current) setSpinning(false);
      lockRef.current = false;
    }
  }, [stopAuto, turbo]);

  useEffect(() => {
    betRef.current = bet;
    balanceRef.current = balance;
    roundRef.current = runRound;
  });

  /* Public rounds keep running whether or not a wager is queued. */
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => {
      if (!lockRef.current) void roundRef.current();
    }, 6000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, []);

  /* ---------------- keyboard ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        void doSpin();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doSpin, spinning]);

  const handleReady = useCallback((api: WheelApi) => {
    wheelRef.current = api;
  }, []);

  const table = useMemo(paytable, []);
  const broke = balance < MIN_BET;

  const statCards = [
    { label: "Total spins", value: stats.spins.toLocaleString() },
    { label: "Wins", value: stats.wins.toLocaleString() },
    { label: "Wagered", value: formatMoney(stats.wagered) },
    { label: poolEnabled ? "Best provisional claim" : "Best win", value: formatMoney(stats.bestWin) },
    { label: "Top multi", value: segmentLabel(stats.biggestMultiplier) },
  ];

  return (
    <div className="wheel-container h-full w-full text-slate-200 flex flex-col gap-2 px-1 sm:px-2 md:px-3 py-1 select-none">
      {/* ---------------- top bar ---------------- */}
      <header className="shrink-0 border-b border-white/10 bg-[#070b16]/85 backdrop-blur-xl rounded-xl">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-2 px-2 py-1.5 sm:px-4">
          <div className="flex items-center gap-2">
            <div className="relative grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-amber-300 to-orange-600 text-sm shadow-[0_0_22px_rgba(255,180,70,0.4)]">
              <span className="absolute inset-[2px] rounded-lg bg-[#0b1020]" />
              <span className="relative text-sm">🎡</span>
            </div>
            <div className="leading-tight">
              <h1 className="text-xs sm:text-sm font-black uppercase tracking-[0.14em] text-white">
                Lucky<span className="text-amber-300">Wheel</span>
              </h1>
              <p className="text-[0.55rem] font-semibold uppercase tracking-[0.2em] text-slate-500 hidden sm:block">
                Casino
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/35 px-2.5 py-1">
              <span className="text-[0.55rem] font-bold uppercase tracking-[0.16em] text-slate-500">
                Bal
              </span>
              <span
                className="text-xs sm:text-sm font-black tabular-nums text-emerald-300"
                style={{ fontFamily: "var(--font-num)" }}
              >
                {formatMoney(balance)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSoundOn((v) => !v);
                primeAudio();
              }}
              aria-label={soundOn ? "Mute sounds" : "Unmute sounds"}
              className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-white/5 text-sm transition hover:bg-white/10 active:scale-95"
            >
              {soundOn ? "🔊" : "🔇"}
            </button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-[1280px] min-w-0 w-full shrink-0 p-1 sm:p-2 flex flex-col gap-3">
        {error && (
          <div className="toast-in mb-2 flex items-center justify-between gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200">
            <span>⚠️ {error}</span>
            <button type="button" onClick={() => setError(null)} className="text-rose-300/70 hover:text-rose-100">
              ✕
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 min-w-0 gap-2 sm:gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,1fr)] items-start">
          {/* ---------------- wheel stage ---------------- */}
          <section className="relative overflow-hidden rounded-2xl sm:rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_50%_0%,rgba(124,92,255,0.12),transparent_60%),linear-gradient(180deg,rgba(19,25,44,0.85),rgba(8,11,22,0.9))] p-2 sm:p-3 shadow-[0_16px_50px_rgba(0,0,0,0.5)] flex flex-col justify-between">
            <WinOverlay
              open={overlay !== null && overlay.bet > 0}
              payout={overlay?.payout ?? 0}
              multiplier={overlay?.multiplier ?? 0}
              bet={overlay?.bet ?? 0}
            />

            <div className="mb-1 sm:mb-2 flex flex-wrap items-center justify-between gap-1">
              <div>
                <h2 className="text-xs sm:text-sm font-black uppercase tracking-[0.1em] text-white">
                  Spin the wheel
                </h2>
                <p className="text-[0.6rem] text-slate-400 hidden sm:block">
                  20 segments · land a multiplier to win · 0× loses
                </p>
              </div>
            </div>

            <div className="relative flex justify-center items-center">
              <Wheel
                onReady={handleReady}
                spinning={spinning}
                activeIndex={activeIndex}
                canSpin={balance >= bet}
                onCenterSpin={() => {
                  void doSpin();
                }}
              />
            </div>

            {/* last round ribbon */}
            <div className="mt-2 grid gap-1.5 sm:gap-2 grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-black/25 p-1.5 sm:p-2 text-center">
                <p className="text-[0.55rem] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Last result
                </p>
                <p
                  className="mt-0.5 text-xs sm:text-base font-black tabular-nums text-white"
                  style={{ fontFamily: "var(--font-num)" }}
                >
                  {lastRound ? segmentLabel(lastRound.multiplier) : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 p-1.5 sm:p-2 text-center">
                <p className="text-[0.55rem] font-bold uppercase tracking-[0.14em] text-slate-500">
                  {poolEnabled ? "Provisional claim · daily payout pending" : "Last payout"}
                </p>
                <p
                  className={`mt-0.5 text-xs sm:text-base font-black tabular-nums ${
                    lastRound && lastRound.payout > 0 ? "text-emerald-300" : "text-slate-300"
                  }`}
                  style={{ fontFamily: "var(--font-num)" }}
                >
                  {lastRound ? formatMoney(lastRound.payout) : formatMoney(0)}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 p-1.5 sm:p-2 text-center">
                <p className="text-[0.55rem] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Hash
                </p>
                <p
                  className="mt-0.5 truncate text-[0.55rem] sm:text-[0.65rem] font-semibold text-slate-400"
                  title={lastRound?.hash ?? ""}
                >
                  {lastRound ? `${lastRound.hash.slice(0, 10)}…` : "—"}
                </p>
              </div>
            </div>

            {broke && (
              <div className="float-up mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/25 bg-amber-300/10 px-2.5 py-1.5">
                <p className="text-[0.65rem] font-semibold text-amber-200">
                  Out of credits. Top up to keep spinning.
                </p>
              </div>
            )}
          </section>

          {/* ---------------- bet panel ---------------- */}
          <div className="flex flex-col gap-2 sm:gap-3">
            <BetPanel
              bet={bet}
              onBetChange={(v) => setBet(Math.max(0, round2(v)))}
              balance={balance}
              spinning={spinning}
              autoActive={autoActive}
              autoRemaining={autoRemaining}
              turbo={turbo}
              onTurboChange={setTurbo}
              autoCount={autoCount}
              onAutoCountChange={setAutoCount}
              onStartAuto={() => {
                if (bet > balance) {
                  setError("Not enough balance for this bet.");
                  return;
                }
                autoRef.current.active = true;
                autoRef.current.remaining = autoCount - 1;
                setAutoActive(true);
                setAutoRemaining(autoCount - 1);
                void doSpin();
              }}
              onStopAuto={stopAuto}
              onSpin={() => {
                if (bet > balance) {
                  setError("Not enough balance for this bet.");
                  return;
                }
                void doSpin();
              }}
            />
            <div className="flex items-center justify-between text-xs text-slate-300" aria-live="polite">
              <span>{queuedBet !== null ? `Next round queued: ${formatMoney(queuedBet)}` : "Live rounds · no bet queued"}</span>
              {queuedBet !== null && <button type="button" onClick={() => {
                queuedRef.current = null;
                setQueuedBet(null);
              }}>Cancel queued bet</button>}
            </div>

            <ResultStrip records={records} />
          </div>
        </div>

        {/* ---------------- lower grid (visible on large screens) ---------------- */}
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <HistoryTable records={records} />

          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur">
              <h3 className="mb-2 text-[0.65rem] font-black uppercase tracking-[0.2em] text-slate-400">
                Your session
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {statCards.map((s) => (
                  <div key={s.label} className="rounded-xl border border-white/10 bg-black/25 p-2.5">
                    <p className="text-[0.55rem] font-bold uppercase tracking-[0.14em] text-slate-500">
                      {s.label}
                    </p>
                    <p
                      className="mt-0.5 truncate text-xs font-black tabular-nums text-slate-100"
                      style={{ fontFamily: "var(--font-num)" }}
                    >
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-slate-400">
                  Paytable
                </h3>
                <span className="text-[0.6rem] font-semibold text-slate-600">20 segments</span>
              </div>
              <div className="overflow-hidden rounded-xl border border-white/10">
                {table.map((row, i) => (
                  <div
                    key={row.multiplier}
                    className={`flex items-center justify-between gap-2 px-3 py-1.5 ${
                      i % 2 === 0 ? "bg-black/25" : "bg-transparent"
                    }`}
                  >
                    <span
                      className={`inline-flex h-7 min-w-12 items-center justify-center rounded-lg px-2 text-xs font-black ${multiplierChipClass(
                        row.multiplier,
                      )}`}
                      style={{ fontFamily: "var(--font-num)" }}
                    >
                      {segmentLabel(row.multiplier)}
                    </span>
                    <span className="text-[0.7rem] font-semibold text-slate-400">
                      {row.count} segment{row.count > 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <footer className="hidden sm:flex shrink-0 mt-1 flex-col items-center gap-0.5 border-t border-white/5 pt-1 text-center">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Play money only · no real currency
          </p>
        </footer>
      </main>
    </div>
  );
}
