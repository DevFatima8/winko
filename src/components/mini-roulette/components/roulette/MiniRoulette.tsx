"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useGameBalance, usePoolLifecycle } from "@/lib/walletSync";
import type { BrowserRouletteNumberOutcome } from "@/lib/browserRouletteOutcome";
import { validateBrowserRouletteSelection } from "@/lib/browserRouletteSelection";
import { GameOverOverlay } from "@/components/GameOverOverlay";
import { Wheel, type WheelHandle } from "./Wheel";
import { BettingTable } from "./BettingTable";
import { ChipSvg } from "./Chip";
import {
  IconClose,
  IconInfo,
  IconMenu,
  IconRebet,
  IconShield,
  IconSound,
  IconTrash,
  IconUndo,
  IconWheel,
} from "./icons";
import {
  CHIP_VALUES,
  CURRENCY,
  MIN_BET,
  PAYTABLE,
  START_BALANCE,
  WHEEL_ORDER,
  colorOf,
  formatMoney,
  pickResult,
  round2,
  totalOf,
  winningSpotIds,
  type BetMap,
} from "../../lib/roulette";
import { playChip, playClick, playLose, playWin, unlockAudio } from "../../lib/sounds";

type Phase = "idle" | "spinning" | "result";

const RESULT_MS = 3200;
const LS_BALANCE = "mr_balance";
const LS_SOUND = "mr_sound";
const LS_HISTORY = "mr_history";

export default function MiniRoulette() {
  const wheelRef = useRef<WheelHandle>(null);

  const [balance] = useGameBalance("mini-roulette", START_BALANCE);
  const pool = usePoolLifecycle("mini-roulette");
  const [bets, setBets] = useState<BetMap>({});
  const [undoStack, setUndoStack] = useState<BetMap[]>([]);
  const [lastBets, setLastBets] = useState<BetMap | null>(null);
  const [chip, setChip] = useState<number>(CHIP_VALUES[0]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<number | null>(null);
  const [winAmount, setWinAmount] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [round, setRound] = useState(1);
  const [soundOn, setSoundOn] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [fairOpen, setFairOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [bannerClosed, setBannerClosed] = useState(false);
  const [activeBets, setActiveBets] = useState<BetMap>({});
  const [activeStake, setActiveStake] = useState(0);
  const roundLock = useRef(false);
  const pendingRound = useRef<BetMap | null>(null);
  const acceptedRound = useRef(false);
  const mounted = useRef(false);
  const spinRef = useRef<() => Promise<void>>(async () => {});
  const balanceRef = useRef(balance);
  const queueRef = useRef(bets);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = useMemo(() => totalOf(bets), [bets]);
  const winningSpots = useMemo(
    () => (phase === "result" && result !== null ? new Set(winningSpotIds(activeBets, result)) : new Set<string>()),
    [activeBets, result, phase],
  );
  // Chips can only be edited while betting is open for the upcoming round.
  const betting = phase === "idle";
  const bettingClosed = () => roundLock.current || pendingRound.current !== null;
  const commitBets = (next: BetMap) => {
    queueRef.current = next;
    setBets(next);
  };
  const canSpin = phase === "idle" && total <= balance + 1e-9;
  const outOfFunds = balance < MIN_BET;

  /* ---------- persistence (localStorage only, no database) ---------- */
  useEffect(() => {
    try {
      const s = localStorage.getItem(LS_SOUND);
      if (s !== null) setSoundOn(s === "1");
      const h = localStorage.getItem(LS_HISTORY);
      if (h) {
        const parsed: unknown = JSON.parse(h);
        if (Array.isArray(parsed)) setHistory(parsed.filter((x): x is number => typeof x === "number"));
      }
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(LS_BALANCE, String(balance));
      localStorage.setItem(LS_SOUND, soundOn ? "1" : "0");
      localStorage.setItem(LS_HISTORY, JSON.stringify(history.slice(0, 30)));
    } catch {
      /* ignore */
    }
  }, [balance, soundOn, history, loaded]);

  useEffect(
    () => {
      mounted.current = true;
      const timer = setInterval(() => {
        if (!roundLock.current) void spinRef.current();
      }, 6000);
      return () => {
      mounted.current = false;
      clearInterval(timer);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (resultTimer.current) clearTimeout(resultTimer.current);
      };
    },
    [],
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const sfx = useCallback(
    (fn: () => void) => {
      unlockAudio();
      if (soundOn) fn();
    },
    [soundOn],
  );

  /* ---------- betting actions ---------- */
  const placeBet = (spotId: string) => {
    if (!betting || chip < 1) return;
    if (bettingClosed()) {
      showToast("Round in progress — bet after this round finishes");
      return;
    }
    const current = queueRef.current;
    const next = round2(totalOf(current) + chip);
    if (next > balance + 1e-9) {
      showToast("Not enough balance");
      return;
    }
    setUndoStack((s) => [...s.slice(-49), current]);
    commitBets({ ...current, [spotId]: round2((current[spotId] ?? 0) + chip) });
    sfx(playChip);
  };

  const undo = () => {
    if (!betting || bettingClosed() || undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    commitBets(prev);
    setUndoStack((s) => s.slice(0, -1));
    sfx(playClick);
  };

  const clear = () => {
    if (!betting || bettingClosed() || total === 0) return;
    setUndoStack((s) => [...s.slice(-49), bets]);
    commitBets({});
    sfx(playClick);
  };

  const double = () => {
    if (!betting || bettingClosed() || total === 0) return;
    const next = round2(total * 2);
    if (next > balance + 1e-9) {
      showToast("Not enough balance");
      return;
    }
    setUndoStack((s) => [...s.slice(-49), bets]);
    commitBets(Object.fromEntries(Object.entries(queueRef.current).map(([k, v]) => [k, round2(v * 2)])));
    sfx(playChip);
  };

  const rebet = () => {
    if (!betting || bettingClosed() || !lastBets) return;
    const t = totalOf(lastBets);
    if (t > balance + 1e-9) {
      showToast("Not enough balance");
      return;
    }
    setUndoStack((s) => [...s.slice(-49), bets]);
    commitBets({ ...lastBets });
    sfx(playChip);
  };

  const spin = async () => {
    if (!mounted.current || roundLock.current) return;
    roundLock.current = true;
    unlockAudio();
    const queued = queueRef.current;
    queueRef.current = {};
    const queuedTotal = totalOf(queued);
    const snapshot = pendingRound.current ?? (queuedTotal <= balanceRef.current ? { ...queued } : {});
    const stake = totalOf(snapshot);
    if (queuedTotal > balanceRef.current) showToast("Bet cancelled — insufficient balance");
    let outcome = 1;
    let ret = 0;

    setActiveBets(snapshot);
    setActiveStake(stake);
    if (!pendingRound.current) setBets({});
    setUndoStack([]);
    setPhase("spinning");
    setBannerClosed(false);
    setResult(null);
    setWinAmount(0);
    if (stake > 0) {
      const selection = { bets: snapshot };
      try { validateBrowserRouletteSelection("mini-roulette", stake, selection); }
      catch (error) {
        showToast(error instanceof Error ? error.message : "Invalid roulette allocation.");
        roundLock.current = false; setPhase("idle"); return;
      }
      pendingRound.current = snapshot;
      if (!acceptedRound.current && !await pool.start(stake, () => {}, selection)) { roundLock.current = false; setPhase("idle"); return; }
      acceptedRound.current = true;
      const resolved = await pool.resolveServer(selection) as BrowserRouletteNumberOutcome | null;
      if (!resolved) { showToast("Result pending — retrying the same wager."); roundLock.current = false; setPhase("idle"); return; }
      outcome = resolved.number;
      ret = resolved.payout;
      pendingRound.current = null;
      acceptedRound.current = false;
    } else outcome = pickResult({});
    const pocketIndex = WHEEL_ORDER.indexOf(outcome);

    await wheelRef.current?.spin(pocketIndex);
    if (!mounted.current) return;

    if (stake > 0) pool.announce();
    setResult(outcome);
    setWinAmount(ret);
    setHistory((h) => [outcome, ...h].slice(0, 30));
    if (stake > 0) setLastBets(snapshot);
    setPhase("result");
    if (stake > 0 && soundOn) (ret > 0 ? playWin : playLose)();

    resultTimer.current = setTimeout(() => {
      if (!mounted.current) return;
      setRound((r) => r + 1);
      setPhase("idle");
      roundLock.current = false;
    }, RESULT_MS);
  };
  useEffect(() => {
    balanceRef.current = balance;
    queueRef.current = bets;
    spinRef.current = spin;
  });

  const playAgain = () => {
    setBannerClosed(true);
  };

  const stats = useMemo(() => {
    const n = history.length;
    if (!n) return null;
    const pct = (f: (x: number) => boolean) => Math.round((history.filter(f).length / n) * 100);
    return {
      red: pct((x) => colorOf(x) === "red"),
      black: pct((x) => colorOf(x) === "black"),
      odd: pct((x) => x % 2 === 1),
      even: pct((x) => x % 2 === 0),
      low: pct((x) => x <= 6),
      high: pct((x) => x >= 7),
    };
  }, [history]);

  const phaseLabel = phase === "idle" ? "Place your bets · live round soon" : "Betting reopens after this round";

  return (
    <div className="flex h-full w-full flex-col justify-between overflow-hidden text-white px-1 sm:px-2.5 py-1 select-none">
      {/* ---------- Header ---------- */}
      <header className="shrink-0 border-b border-white/10 bg-[#1b1c1d]/95 backdrop-blur rounded-t-xl">
        <div className="mx-auto flex h-11 sm:h-12 w-full max-w-[1200px] items-center justify-between gap-2 px-3">
          <div className="flex items-center gap-2">
            <IconWheel className="h-7 w-7 sm:h-8 sm:w-8" />
            <div className="leading-none">
              <div className="text-[15px] sm:text-[17px] font-extrabold tracking-wide">
                <span className="text-white">MINI</span> <span className="text-[#e50539]">ROULETTE</span>
              </div>
              <div className="mt-0.5 text-[9px] uppercase tracking-[0.22em] text-white/45">Casino game</div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setFairOpen(true)}
              className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70 transition hover:bg-white/10 sm:flex"
            >
              <IconShield width={14} height={14} className="text-[#28a909]" />
              Server rules
            </button>
            <button
              type="button"
              aria-label={soundOn ? "Mute sounds" : "Unmute sounds"}
              onClick={() => {
                setSoundOn((s) => !s);
                unlockAudio();
              }}
              className="grid h-8 w-8 sm:h-9 sm:w-9 place-items-center rounded-full bg-white/5 text-white/80 transition hover:bg-white/10"
            >
              <IconSound on={soundOn} width={16} height={16} />
            </button>
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-[#111214] px-2.5 py-1 text-xs sm:text-sm font-bold tabular-nums text-[#28a909]">
              {formatMoney(balance)}
              <span className="text-[10px] sm:text-xs font-medium text-white/55">{CURRENCY}</span>
            </div>
            <button
              type="button"
              aria-label="Menu"
              onClick={() => setMenuOpen(true)}
              className="grid h-8 w-8 sm:h-9 sm:w-9 place-items-center rounded-full bg-white/5 text-white/80 transition hover:bg-white/10"
            >
              <IconMenu width={16} height={16} />
            </button>
          </div>
        </div>
      </header>

      {/* ---------- Main ---------- */}
      <main className="mx-auto w-full max-w-[1200px] flex-1 min-h-0 flex flex-col overflow-hidden px-1 sm:px-2 py-1">
        {outOfFunds && (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-[#e50539]/40 bg-[#e50539]/10 px-3 py-1.5 text-xs shrink-0">
            <span>Insufficient balance.</span>
          </div>
        )}

        <div className="grid gap-2 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start auto-rows-min flex-1 min-h-0 overflow-y-auto overflow-x-hidden lg:overflow-hidden">
          {/* Wheel panel */}
          <section className="panel p-2 sm:p-3 shrink-0 flex flex-col justify-between">
            <div className="mb-1.5 flex items-center justify-between text-xs text-white/60">
              <span className="font-semibold">Round #{round}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  phase === "idle"
                    ? "bg-[#28a909]/15 text-[#3ad21a]"
                    : phase === "spinning"
                      ? "bg-[#e50539]/15 text-[#ff4d6d]"
                      : "bg-[#f6dd8a]/15 text-[#f6dd8a]"
                }`}
              >
                {phaseLabel}
              </span>
            </div>

            <div className="relative mx-auto aspect-square w-full max-w-[min(100%,360px)] sm:max-w-[380px] lg:max-w-[300px]">
              <Wheel ref={wheelRef} soundOn={soundOn} className="h-auto w-full drop-shadow-[0_18px_30px_rgba(0,0,0,0.65)]" />
              {activeStake > 0 && phase === "result" && result !== null && !bannerClosed && (
                <GameOverOverlay open
                  winAmount={winAmount}
                  title={pool.enabled ? "Round complete" : winAmount > 0 ? "Congratulations! You win" : ""}
                  result={`Winning number ${result} ${colorOf(result).toUpperCase()}${pool.enabled ? ` · Daily payout pending · provisional claim ${formatMoney(winAmount)} ${CURRENCY}` : winAmount > 0 ? ` · ${formatMoney(winAmount)} ${CURRENCY}` : ""}`}
                  onClose={() => setBannerClosed(true)} onPlayAgain={playAgain} />
              )}
            </div>

            {/* History */}
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-[11px] uppercase tracking-wider text-white/50">
                <span>Last results</span>
                <span>{history.length} rounds</span>
              </div>
              {history.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 px-3 py-2 text-center text-xs text-white/40">
                  No spins yet — place a bet and press SPIN
                </div>
              ) : (
                <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-1">
                  {history.slice(0, 20).map((n, i) => (
                    <span
                      key={`${i}-${n}`}
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${
                        colorOf(n) === "red" ? "bg-[#d7263d]" : "border border-white/20 bg-[#1c1d21]"
                      } ${i === 0 ? "ring-2 ring-[#28a909]" : "opacity-90"}`}
                    >
                      {n}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {stats && (
              <div className="mt-3 grid gap-2">
                <StatBar l={stats.red} r={stats.black} ll="Red" rl="Black" lc="bg-[#d7263d]" rc="bg-[#3a3b40]" />
                <StatBar l={stats.odd} r={stats.even} ll="Odd" rl="Even" lc="bg-[#28a909]" rc="bg-[#1d6fe0]" />
                <StatBar l={stats.low} r={stats.high} ll="1-6" rl="7-12" lc="bg-[#f6dd8a]" rc="bg-[#8e52d2]" />
              </div>
            )}
          </section>

          {/* Table + controls */}
          <section className="flex flex-col gap-3">
            <div className="panel p-2 sm:p-3">
              <BettingTable
                bets={bets}
                disabled={!betting}
                onPlace={placeBet}
                winningNumber={phase === "result" ? result : null}
                winningSpots={winningSpots}
              />
            </div>

            <div className="panel p-3 sm:p-4">
              <div className="mb-2 flex items-center justify-between text-xs text-white/60">
                <span>
                  Chip: <b className="text-white">{formatMoney(chip)}</b>
                </span>
                <span>
                  Total bet:{" "}
                  <b className="text-white">
                    {formatMoney(total)} {CURRENCY}
                  </b>
                </span>
              </div>

              {/* Chip rail */}
              <div className="no-scrollbar -mx-1 flex items-end gap-2 overflow-x-auto px-1 pb-1 pt-3">
                {CHIP_VALUES.map((v) => {
                  const selected = v === chip;
                  return (
                    <button
                      key={v}
                      type="button"
                      aria-label={`Chip ${v}`}
                      aria-pressed={selected}
                      onClick={() => {
                        setChip(v);
                        sfx(playClick);
                      }}
                      className={`relative shrink-0 rounded-full transition-all duration-150 ${
                        selected
                          ? "-translate-y-1.5 scale-110 ring-2 ring-[#28a909] ring-offset-2 ring-offset-[#1b1c1d]"
                          : "opacity-75 hover:-translate-y-0.5 hover:opacity-100"
                      }`}
                    >
                      <svg viewBox="-26 -26 52 52" width={50} height={50} className="block">
                        <ChipSvg r={24} value={v} />
                      </svg>
                    </button>
                  );
                })}
                <input
                  type="number"
                  min={10}
                  inputMode="numeric"
                  value={chip || ""}
                  onChange={(e) => setChip(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
                  aria-label="Custom chip amount"
                  placeholder="Rs."
                  className="ml-1 h-10 w-24 shrink-0 self-center rounded-lg border border-white/25 bg-black/40 px-2 text-sm font-bold text-white outline-none"
                />
              </div>
              <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <div className="grid flex-1 grid-cols-4 gap-1.5 sm:gap-2">
                  <CtrlButton label="Undo" onClick={undo} disabled={!betting || undoStack.length === 0} variant="undo">
                    <IconUndo />
                  </CtrlButton>
                  <CtrlButton label="Clear" onClick={clear} disabled={!betting || total === 0} variant="clear">
                    <IconTrash />
                  </CtrlButton>
                  <CtrlButton label="Rebet" onClick={rebet} disabled={!betting || !lastBets} variant="rebet">
                    <IconRebet />
                  </CtrlButton>
                  <CtrlButton label="Double" onClick={double} disabled={!betting || total === 0} variant="double">
                    <span className="text-base font-extrabold leading-none">x2</span>
                  </CtrlButton>
                </div>
                <button
                  type="button"
                  onClick={spin}
                  disabled={!canSpin}
                  className={`flex h-12 sm:h-14 w-full flex-col items-center justify-center rounded-xl text-black font-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 sm:w-[170px] ${
                    canSpin
                      ? "bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500 shadow-lg shadow-emerald-500/40 hover:brightness-110"
                      : "bg-white/10 text-white/40"
                  }`}
                >
                  <span className="text-lg font-black tracking-[0.16em]">
                    {phase === "spinning" ? "SPINNING" : "SPIN"}
                  </span>
                  <span className="text-[10px] font-bold opacity-90">
                    {formatMoney(total)} {CURRENCY}
                  </span>
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/45">
                <span>
                  Min {formatMoney(MIN_BET)} · Max {formatMoney(Math.floor(balance))} {CURRENCY} per round
                </span>
                <button
                  type="button"
                  onClick={() => setRulesOpen(true)}
                  className="flex items-center gap-1 text-white/70 underline-offset-2 hover:underline"
                >
                  <IconInfo width={13} height={13} /> How to play & payouts
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-white/5 px-3 py-3 text-center text-[11px] text-white/35">
        <p>Server results · 10 winning slots per 100 distinct players · total gross return capped at 2x stake, stake included.</p>
        Straight 11.64x · Split 5.82x · Street 3.88x · Corner / Column 2.91x · Red / Black / Odd / Even / 1-6 / 7-12 1.94x
      </footer>

      {/* ---------- Toast ---------- */}
      {toast && (
        <div className="toast-in fixed bottom-6 left-1/2 z-50 rounded-full border border-white/10 bg-[#2c2d30] px-4 py-2 text-sm font-medium shadow-xl">
          {toast}
        </div>
      )}

      {/* ---------- Menu drawer ---------- */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setMenuOpen(false)}>
          <aside
            className="drawer-in absolute right-0 top-0 flex h-full w-[290px] max-w-[85vw] flex-col border-l border-white/10 bg-[#1b1c1d]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="font-bold">Menu</span>
              <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="text-white/70">
                <IconClose />
              </button>
            </div>
            <div className="px-4 py-3 text-xs text-white/50">
              Balance
              <div className="text-lg font-bold text-[#28a909]">
                {formatMoney(balance)} <span className="text-xs text-white/60">{CURRENCY}</span>
              </div>
            </div>
            <nav className="flex flex-col">
              <MenuItem onClick={() => setSoundOn((s) => !s)} icon={<IconSound on={soundOn} />}>
                <span className="flex-1">Sound</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${soundOn ? "bg-[#28a909]" : "bg-white/15"}`}>
                  {soundOn ? "ON" : "OFF"}
                </span>
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  setRulesOpen(true);
                }}
                icon={<IconInfo />}
              >
                Game rules & payouts
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  setFairOpen(true);
                }}
                icon={<IconShield />}
              >
                Server rules & limits
              </MenuItem>
            </nav>
            <div className="mt-auto px-4 py-3 text-[11px] text-white/35">Mini Roulette · Demo mode · 18+ Play responsibly</div>
          </aside>
        </div>
      )}

      {/* ---------- Rules modal ---------- */}
      {rulesOpen && (
        <Modal title="How to play" onClose={() => setRulesOpen(false)}>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Select a chip value from the chip rail.</li>
            <li>
              Tap the table to place chips: single numbers, splits (line between two numbers), streets (bottom edge of
              a column of 3 numbers), corners (intersection of 4 numbers), columns and outside bets.
            </li>
            <li>
              Press <b>SPIN</b>. The ball lands on one of the 12 numbers.
            </li>
            <li>Standard returns below are added for covered winning bets, then the total gross return is capped at 2x the round stake (stake included). Server results use 10 winning slots per 100 distinct players. Allocations covering every number are rejected before a slot is consumed.</li>
          </ol>

          <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-white/50">Paytable</h3>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-white/45">
              <tr>
                <th className="py-1.5 font-semibold">Bet</th>
                <th className="py-1.5 font-semibold">Covers</th>
                <th className="py-1.5 text-right font-semibold">Pays</th>
              </tr>
            </thead>
            <tbody>
              {PAYTABLE.map((p) => (
                <tr key={p.label} className="border-t border-white/5">
                  <td className="py-1.5">{p.label}</td>
                  <td className="py-1.5 text-white/60">{p.covers}</td>
                  <td className="py-1.5 text-right font-bold text-[#3ad21a]">{p.multiplier}x before total 2x cap</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-white/50">Controls</h3>
          <ul className="space-y-1 text-white/80">
            <li>
              <b>Undo</b> – removes the last placed chip.
            </li>
            <li>
              <b>Clear</b> – removes all chips from the table.
            </li>
            <li>
              <b>Rebet</b> – places the same bets as the previous round.
            </li>
            <li>
              <b>x2</b> – doubles every bet on the table.
            </li>
          </ul>
          <p className="mt-4 text-xs text-white/45">
            Red numbers: 1, 3, 5, 8, 10, 12. Black numbers: 2, 4, 6, 7, 9, 11. Min bet {formatMoney(MIN_BET)}, max{" "}
            {formatMoney(Math.floor(balance))} {CURRENCY} per round.
          </p>
        </Modal>
      )}

      {/* ---------- Fairness / limits modal ---------- */}
      {fairOpen && (
        <Modal title="Server rules & game limits" onClose={() => setFairOpen(false)}>
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-[#28a909]/30 bg-[#28a909]/10 p-3">
              <IconShield className="mt-0.5 shrink-0 text-[#28a909]" />
              <p>
                Accepted wagers are resolved on the server: 10 winning slots per 100 distinct players, with a maximum total gross return of 2x your stake. Repeated players cannot claim another winning slot in the same cycle. Leave at least one losing number uncovered.
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-white/50">Current round</dt>
              <dd className="text-right font-semibold">#{round}</dd>
              <dt className="text-white/50">Wheel</dt>
              <dd className="text-right font-semibold">12 numbers (1-12)</dd>
              <dt className="text-white/50">Minimum bet</dt>
              <dd className="text-right font-semibold">
                {formatMoney(MIN_BET)} {CURRENCY}
              </dd>
              <dt className="text-white/50">Maximum bet / round</dt>
              <dd className="text-right font-semibold">
                {formatMoney(Math.floor(balance))} {CURRENCY}
              </dd>
              <dt className="text-white/50">Maximum win</dt>
              <dd className="text-right font-semibold">2x gross (stake included)</dd>
              <dt className="text-white/50">Currency</dt>
              <dd className="text-right font-semibold">{CURRENCY}</dd>
            </dl>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------- small presentational helpers ---------- */

function CtrlButton({
  label,
  onClick,
  disabled,
  children,
  variant,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  variant?: "undo" | "clear" | "rebet" | "double";
}) {
  const variantStyles = {
    undo: "border-slate-500/50 bg-gradient-to-b from-slate-700 to-slate-900 text-slate-200 hover:from-slate-600 hover:to-slate-800",
    clear: "border-rose-500/50 bg-gradient-to-b from-rose-700 to-red-950 text-rose-200 shadow-rose-950/40 hover:from-rose-600 hover:to-red-900",
    rebet: "border-cyan-500/50 bg-gradient-to-b from-cyan-700 to-cyan-950 text-cyan-200 shadow-cyan-950/40 hover:from-cyan-600 hover:to-cyan-900",
    double: "border-indigo-500/50 bg-gradient-to-b from-indigo-700 to-indigo-950 text-indigo-200 shadow-indigo-950/40 hover:from-indigo-600 hover:to-indigo-900",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-11 sm:h-13 flex-col items-center justify-center gap-0.5 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35 ${
        variant ? variantStyles[variant] : "border-white/10 bg-[#2c2d30] text-white/85 hover:bg-[#35363a]"
      }`}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

function MenuItem({ onClick, icon, children }: { onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 border-b border-white/5 px-4 py-3 text-left text-sm text-white/85 transition hover:bg-white/5"
    >
      <span className="text-white/60">{icon}</span>
      {children}
    </button>
  );
}

function StatBar({
  l,
  r,
  ll,
  rl,
  lc,
  rc,
}: {
  l: number;
  r: number;
  ll: string;
  rl: string;
  lc: string;
  rc: string;
}) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[10px] text-white/55">
        <span>
          {ll} <b className="text-white/85">{l}%</b>
        </span>
        <span>
          <b className="text-white/85">{r}%</b> {rl}
        </span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={`${lc} transition-all`} style={{ width: `${l}%` }} />
        <div className={`${rc} transition-all`} style={{ width: `${r}%` }} />
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-[#1b1c1d] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-white/10 bg-[#1b1c1d] px-4 py-3">
          <h2 className="font-bold">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="text-white/70 hover:text-white">
            <IconClose />
          </button>
        </div>
        <div className="p-4 text-sm text-white/85">{children}</div>
      </div>
    </div>
  );
}
