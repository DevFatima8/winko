"use client";

import "./dice.css";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useBrowserWager } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import { notifyGameResult } from "@/lib/gameResultNotice";
import {
  MIN_BET,
  START_BALANCE,
  clamp,
  emptyStats,
  fmt,
  payoutFor,
  round2,
  rollDice,
  targetForChance,
  winChanceFor,
  type Dir,
  type RollRecord,
  type Stats,
} from "./dice";
import { setSound, sfx } from "./audio";
import { useLocalStorage } from "./useLocalStorage";
import {
  IconCoin,
  IconDice,
  IconHelp,
  IconPlus,
  IconSoundOff,
  IconSoundOn,
  IconStop,
  IconTrash,
  IconX,
} from "./icons";

type Toast = { id: number; msg: string; kind: "error" | "success" | "info" };
type BalanceFloat = { id: number; txt: string; win: boolean };
type Auto = {
  on: boolean;
  count: number;
  remaining: number;
  stopWin: boolean;
  stopLoss: boolean;
};

const AUTO_INIT: Auto = {
  on: false,
  count: 10,
  remaining: 10,
  stopWin: false,
  stopLoss: false,
};

const ROLL_ANIMATION_MS = 1500;
const RESULT_REVIEW_MS = 1800;

const STORAGE_KEYS = [
  "dc.balance",
  "dc.bet",
  "dc.target",
  "dc.dir",
  "dc.history",
  "dc.stats",
];

const toastStyles: Record<Toast["kind"], string> = {
  error: "border-loss/50 bg-[#241219] text-loss",
  success: "border-win/50 bg-[#0e2118] text-win",
  info: "border-line2 bg-panel text-text",
};

export default function DiceGame({ backHref = "/player" }: { backHref?: string }) {
  const { balance, play: submitWager, pending, error, retry } = useBrowserWager("dice", START_BALANCE);
  const [poolPending, setPoolPending] = useState(false);
  const [betStr, setBetStr] = useLocalStorage<string>("dc.bet", "10.00");
  const [target, setTarget] = useLocalStorage<number>("dc.target", 50);
  const [dir, setDir] = useLocalStorage<Dir>("dc.dir", "under");
  const [history, setHistory] = useLocalStorage<RollRecord[]>("dc.history", []);
  const [, setStats] = useLocalStorage<Stats>("dc.stats", emptyStats);
  const [soundOn, setSoundOn] = useLocalStorage<boolean>("dc.sound", true);

  const [auto, setAuto] = useState<Auto>(AUTO_INIT);
  const [rolling, setRolling] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [last, setLast] = useState<RollRecord | null>(() => history[0] ?? null);
  const [display, setDisplay] = useState<number | null>(null);
  const [flash, setFlash] = useState<"win" | "loss" | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [floats, setFloats] = useState<BalanceFloat[]>([]);
  const [bigWin, setBigWin] = useState<string | null>(null);
  const [modal, setModal] = useState<"reset" | "help" | null>(null);

  const rollingRef = useRef(false);
  const animationRef = useRef<number | undefined>(undefined);
  const revealRef = useRef<number | undefined>(undefined);
  const reviewRef = useRef<number | undefined>(undefined);
  const sessionRef = useRef(0);
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const dataRef = useRef({ balance, betStr, target, dir });
  dataRef.current = { balance, betStr, target, dir };

  useEffect(() => {
    setSound(soundOn);
  }, [soundOn]);

  useEffect(() => () => {
    sessionRef.current += 1;
    window.clearInterval(animationRef.current);
    window.clearTimeout(revealRef.current);
    window.clearTimeout(reviewRef.current);
  }, []);

  /* ---------- derived ---------- */
  const chance = winChanceFor(target, dir);
  const payout = payoutFor(chance);
  const betNum = clamp(round2(parseFloat(betStr) || 0), 0, 99_999_999);
  const winAmt = round2(betNum * (payout - 1));
  const outOfChips = balance < MIN_BET;
  const marker = display !== null ? display : last ? last.value : null;
  const winOnLeft = dir === "under";

  /* ---------- helpers ---------- */
  const toast = useCallback(
    (msg: string, kind: Toast["kind"] = "info") => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-2), { id, msg, kind }]);
      window.setTimeout(
        () => setToasts((t) => t.filter((x) => x.id !== id)),
        2800,
      );
    },
    [],
  );

  const addFloat = useCallback((amt: number, win: boolean) => {
    const id = Date.now() + Math.random();
    setFloats((f) => [
      ...f.slice(-3),
      { id, txt: win ? `+Rs. ${fmt(amt)}` : "", win },
    ]);
    window.setTimeout(
      () => setFloats((f) => f.filter((x) => x.id !== id)),
      1500,
    );
  }, []);

  const stopAuto = useCallback(
    () => setAuto((a) => ({ ...a, on: false })),
    [],
  );

  /* ---------- core roll ---------- */
  const doRoll = useCallback(async () => {
    if (rollingRef.current || pending || error) return;
    const d = dataRef.current;
    const b = clamp(round2(parseFloat(d.betStr) || 0), 0, 99_999_999);
    if (b < MIN_BET) {
      toast(`Minimum bet is Rs. ${MIN_BET.toFixed(2)}`, "error");
      sfx.deny();
      if (autoRef.current.on) setAuto((a) => ({ ...a, on: false }));
      return;
    }
    if (b > d.balance) {
      toast("Not enough balance for this bet", "error");
      sfx.deny();
      if (autoRef.current.on) setAuto((a) => ({ ...a, on: false }));
      return;
    }

    rollingRef.current = true;
    setRolling(true);
    const session = sessionRef.current;
    const { value, win } = rollDice(d.target, d.dir);
    const ch = winChanceFor(d.target, d.dir);
    const pay = payoutFor(ch);
    const claimAmount = win ? round2(b + round2(b * (pay - 1))) : 0;
    let accepted;
    try {
      accepted = await submitWager(b, claimAmount);
      if (sessionRef.current !== session) return;
      setPoolPending(accepted.poolPending);
    } catch {
      rollingRef.current = false;
      setRolling(false);
      setAuto(a => ({ ...a, on: false }));
      return;
    }

    animationRef.current = window.setInterval(() => {
      setDisplay(round2(Math.random() * 100));
      sfx.tick();
    }, 85);

    revealRef.current = window.setTimeout(() => {
      window.clearInterval(animationRef.current);
      if (sessionRef.current !== session) {
        rollingRef.current = false;
        setRolling(false);
        return;
      }
      const profit = win ? round2(b * (pay - 1)) : -b;
      const newBal = accepted.balance;
      const rec: RollRecord = {
        id: Date.now() + Math.random(),
        value,
        win,
        dir: d.dir,
        target: d.target,
        bet: b,
        payout: pay,
        profit,
        ts: Date.now(),
      };

      setDisplay(value);
      notifyGameResult("dice", accepted.wagerId, accepted.claim, accepted.poolPending);
      setLast(rec);
      setHistory((h) => [rec, ...h].slice(0, 40));
      setStats((s) => ({
        rolls: s.rolls + 1,
        wins: s.wins + (win ? 1 : 0),
        wagered: round2(s.wagered + b),
        biggestWin: Math.max(s.biggestWin, win ? profit : 0),
        biggestLoss: Math.min(s.biggestLoss, win ? 0 : profit),
        profit: round2(s.profit + profit),
      }));
      if (!accepted.poolPending) addFloat(profit, win);
      setFlash(win ? "win" : "loss");
      window.setTimeout(() => setFlash(null), 700);

      if (!accepted.poolPending && win && (profit >= b * 2 || profit >= 100)) {
        sfx.bigwin();
        setBigWin(fmt(profit));
        window.setTimeout(() => setBigWin(null), 1750);
      } else if (win) {
        sfx.win();
      } else {
        sfx.loss();
      }

      const a = autoRef.current;
      if (a.on) {
        const rem = a.remaining - 1;
        let stop = false;
        let why = "";
        if (win && a.stopWin) {
          stop = true;
          why = "stopped on a win";
        } else if (!win && a.stopLoss) {
          stop = true;
          why = "stopped on zero payout";
        } else if (rem <= 0) {
          stop = true;
          why = "finished the set rounds";
        } else if (newBal < b) {
          stop = true;
          why = "ran out of chips";
        }
        if (stop) {
          setAuto((x) => ({ ...x, on: false, remaining: 0 }));
          toast("Auto " + why, "info");
        } else {
          setAuto((x) => ({ ...x, remaining: rem }));
        }
      }

      setRolling(false);
      setReviewing(true);
      reviewRef.current = window.setTimeout(() => {
        rollingRef.current = false;
        setReviewing(false);
      }, RESULT_REVIEW_MS);
    }, ROLL_ANIMATION_MS);
  }, [addFloat, submitWager, pending, error, setHistory, setStats, toast]);

  /* auto loop */
  useEffect(() => {
    if (!auto.on || rolling || reviewing) return;
    const t = window.setTimeout(() => {
      void doRoll();
    }, 620);
    return () => window.clearTimeout(t);
  }, [auto.on, rolling, reviewing, doRoll]);

  /* ---------- handlers ---------- */
  const onTarget = (v: number) => {
    if (Number.isFinite(v)) setTarget(clamp(round2(v), 1, 99));
  };

  const onChanceInput = (v: number) => {
    if (!Number.isFinite(v)) return;
    setTarget(targetForChance(clamp(v, 0.01, 99.99), dir));
  };

  const toggleDir = (nd: Dir) => {
    if (nd === dir) return;
    setDir(nd);
    setTarget((t) => round2(clamp(100 - t, 1, 99)));
    sfx.click();
  };

  const applyBet = (fn: (n: number) => number) => {
    setBetStr((s) => {
      const cur = parseFloat(s) || 0;
      return round2(clamp(fn(cur), 0, 99_999_999)).toFixed(2);
    });
    sfx.click();
  };

  const claim = () => {
    toast("Use the wallet deposit page to add funds.", "info");
  };

  const resetGame = () => {
    sessionRef.current += 1;
    try {
      STORAGE_KEYS.forEach((k) => window.localStorage.removeItem(k));
    } catch {
      /* noop */
    }
    setBetStr("10.00");
    setTarget(50);
    setDir("under");
    setHistory([]);
    setStats(emptyStats);
    setLast(null);
    setDisplay(null);
    setFlash(null);
    setBigWin(null);
    setAuto(AUTO_INIT);
    setModal(null);
    toast("Game preferences reset. Wallet balance unchanged.", "info");
  };

  const onRollClick = () => {
    if (outOfChips && !rolling) {
      claim();
      return;
    }
    if (auto.on) {
      stopAuto();
      toast("Auto stopped", "info");
      sfx.click();
      return;
    }
    void doRoll();
  };

  const toggleAuto = () => {
    sfx.click();
    setAuto((a) => {
      if (a.on) return { ...a, on: false };
      const count = clamp(Math.round(a.count) || 1, 1, 999);
      return { ...a, on: true, count, remaining: count };
    });
  };

  const setCount = (v: number) => {
    if (!Number.isFinite(v)) return;
    const c = clamp(Math.round(v), 1, 999);
    setAuto((a) => ({ ...a, count: c, remaining: a.on ? a.remaining : c }));
  };

  /* ================= render ================= */
  return (
    <div className="dice-game flex h-full w-full flex-col overflow-y-auto overflow-x-hidden min-h-0 bg-[#07090e] p-1.5 sm:p-2 text-text select-none">
      {error && <div role="alert" className="p-2 text-sm text-rose-300">{error} <button onClick={() => void retry()}>Retry confirmation</button></div>}
      {poolPending && <div role="status" className="px-2 text-xs text-amber-200">Provisional pool claims only. History and indicative game returns are not wallet credits; payment awaits daily settlement.</div>}
      {/* ---------- header ---------- */}
      <header className="flex min-h-10 shrink-0 flex-wrap gap-2 items-center justify-between border-b border-line px-2 pb-1.5">
        <div className="flex items-center gap-1.5">
          <Link
            href={backHref}
            className="flex h-7 items-center gap-1 rounded-lg border border-line bg-panel px-2 text-xs font-bold text-text transition hover:border-line2"
          >
            ← Back
          </Link>
          <div className="hidden min-[400px]:grid h-7 w-7 place-items-center rounded-lg bg-[linear-gradient(160deg,#2fd975,#0e8f4d)] text-[#04220f] shadow-sm">
            <IconDice className="h-4 w-4" />
          </div>
          <div className="text-sm sm:text-base font-bold tracking-[0.08em] text-white">
            DICE<span className="text-win">.</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <HeaderBtn
            onClick={() => {
              setSoundOn(!soundOn);
              sfx.click();
            }}
            title={soundOn ? "Mute sounds" : "Enable sounds"}
          >
            {soundOn ? (
              <IconSoundOn className="h-4 w-4" />
            ) : (
              <IconSoundOff className="h-4 w-4" />
            )}
          </HeaderBtn>
          <HeaderBtn
            onClick={() => {
              setModal("help");
              sfx.click();
            }}
            title="How to play"
          >
            <IconHelp className="h-4 w-4" />
          </HeaderBtn>

          <div className="relative flex items-center gap-1 rounded-xl border border-line bg-panel px-1.5 py-1">
            <IconCoin className="h-4 w-4 text-gold" />
            <div className="flex items-baseline gap-1">
              <span className="text-[9px] font-bold text-mut uppercase">Bal</span>
              <span className="font-mono text-xs sm:text-sm font-bold text-text tabular-nums">
                Rs. {fmt(balance)}
              </span>
            </div>
            <button
              onClick={claim}
              title="Wallet information"
              aria-label="Wallet information"
              className="ml-1 text-xs font-bold text-win hover:underline"
            >
              +
            </button>
            {floats.map((f) => (
              <span
                key={f.id}
                className={`float-up pointer-events-none absolute -top-1 left-1/2 font-mono text-xs font-bold ${
                  f.win ? "text-win" : "text-loss"
                }`}
              >
                {f.txt}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* ---------- main grid ---------- */}
      <div className="dice-layout flex-1 min-h-fit grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_340px] my-1">
        {/* ===== dice card ===== */}
        <section
          className={`dice-board relative rounded-2xl border bg-panel p-3 sm:p-4 transition-all duration-300 ${
            flash === "win"
              ? "border-win/70 shadow-[0_0_50px_-10px_rgba(47,217,117,0.35)]"
              : flash === "loss"
                ? "border-loss/70 shadow-[0_0_50px_-10px_rgba(244,69,95,0.3)]"
                : "border-line"
          }`}
        >
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-win/10 px-2 py-1 text-[10px] font-bold tracking-[0.2em] text-win">
                DICE
              </span>
              <span className="text-[10px] font-semibold tracking-[0.18em] text-mut">
                OVER / UNDER
              </span>
            </div>
            <div className="rounded-md bg-panel2 px-2.5 py-1 font-mono text-xs text-mut">
              PAYOUT <span className="font-bold text-text">x{payout.toFixed(2)}</span>
            </div>
          </div>

          {/* last roll readout */}
          <div className="mb-1 flex items-end justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-bold tracking-[0.22em] text-mut">
                LAST ROLL
              </div>
              <div
                className={`font-mono text-3xl font-bold leading-tight tabular-nums md:text-6xl ${
                  rolling
                    ? "text-text"
                    : last
                      ? last.win
                        ? "text-win"
                        : "text-loss"
                      : "text-mut"
                }`}
              >
                {display !== null
                  ? display.toFixed(2)
                  : last
                    ? last.value.toFixed(2)
                    : "—.—"}
              </div>
            </div>
            <div className="min-w-0 text-right" role="status" aria-live="polite">
              {last && !rolling ? (
                <>
                  <div className="text-[10px] font-bold tracking-[0.18em] text-mut">
                    {last.dir.toUpperCase()} {last.target.toFixed(2)} · x
                    {last.payout.toFixed(2)}
                  </div>
                  <div
                    className={`break-words font-mono text-lg sm:text-2xl font-bold tabular-nums ${
                      last.win ? "text-win" : "text-loss"
                    }`}
                  >
                    {poolPending ? `Claim Rs. ${fmt(last.win ? round2(last.bet * last.payout) : 0)}` : last.win ? `+Rs. ${fmt(last.profit)}` : ""}
                  </div>
                </>
              ) : (
                <div className="text-sm text-mut">
                  {rolling ? "Rolling the dice…" : "Roll the dice to play"}
                </div>
              )}
            </div>
          </div>

          {/* slider */}
          <div>
            <div className="mb-1 flex items-center justify-between text-[9px] sm:text-[10px] font-bold tracking-[0.1em]">
              <span className={winOnLeft ? "text-win" : "text-loss"}>
                {winOnLeft
                  ? `WIN · UNDER ${target.toFixed(2)}`
                  : `${target.toFixed(2)}`}
              </span>
              <span className={!winOnLeft ? "text-win" : "text-loss"}>
                {!winOnLeft
                  ? `WIN · OVER ${target.toFixed(2)}`
                  : `${target.toFixed(2)}`}
              </span>
            </div>

            <div className="relative h-7 sm:h-12 select-none">
              <div className="absolute inset-0 overflow-hidden rounded-lg border border-line bg-panel2">
                <div
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${target}%`,
                    background: winOnLeft
                      ? "linear-gradient(180deg,#2fd975,#149a54)"
                      : "linear-gradient(180deg,#4a1b26,#2b0f17)",
                  }}
                />
                <div
                  className="absolute inset-y-0"
                  style={{
                    left: `${target}%`,
                    right: 0,
                    background: winOnLeft
                      ? "linear-gradient(180deg,#4a1b26,#2b0f17)"
                      : "linear-gradient(180deg,#2fd975,#149a54)",
                  }}
                />
                {marker !== null && (
                  <div
                    className="absolute inset-y-0 w-[3px] bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]"
                    style={{ left: `calc(${marker}% - 1.5px)` }}
                  />
                )}
              </div>
              {marker !== null && (
                <div
                  className="absolute -bottom-5 -translate-x-1/2 rounded bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink"
                  style={{ left: `clamp(20px, ${marker}%, calc(100% - 20px))` }}
                >
                  {marker.toFixed(2)}
                </div>
              )}
              <input
                type="range"
                min={1}
                max={99}
                step={0.01}
                value={target}
                onChange={(e) => onTarget(parseFloat(e.target.value))}
                className="dice-range absolute inset-0 z-10 h-full w-full"
                aria-label="Target number"
              />
            </div>
            <div className="mt-6 flex justify-between font-mono text-[9px] sm:text-[10px] text-mut">
              {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => (
                <span key={n}>{n}</span>
              ))}
            </div>
          </div>

          {/* out of chips overlay */}
          {outOfChips && !rolling && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-2xl bg-ink/85 backdrop-blur-[3px]">
              <p className="text-sm font-semibold text-mut">
                You&apos;re out of chips
              </p>
              <button
                onClick={claim}
                className="rounded-xl bg-gold px-6 py-3 text-sm font-bold tracking-[0.12em] text-[#241503] transition hover:brightness-110 active:scale-95"
              >
                CLAIM Rs. 1,000 FREE
              </button>
            </div>
          )}
        </section>

        {/* ===== bet panel ===== */}
        <aside className="dice-bet-panel flex min-w-0 h-fit flex-col rounded-2xl border border-line bg-panel p-3 sm:p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[10px] font-bold tracking-[0.22em] text-mut">
              PLACE A BET
            </h2>
            <span className="rounded bg-gold/10 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.18em] text-gold">
              DEMO
            </span>
          </div>

          <label className="text-[10px] font-bold tracking-[0.18em] text-mut">
            BET AMOUNT
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center rounded-lg border border-line bg-panel2 px-2 transition focus-within:border-win/60">
              <span className="mr-1 font-mono text-sm text-mut">Rs</span>
              <input
                value={betStr}
                onChange={(e) =>
                  setBetStr(e.target.value.replace(/[^0-9.]/g, "").slice(0, 12))
                }
                inputMode="decimal"
                aria-label="Bet amount"
                className="h-9 min-w-0 w-full bg-transparent font-mono text-sm font-bold text-text outline-none"
              />
            </div>
            <button
              onClick={() => applyBet((n) => n - 1)}
              aria-label="Decrease bet"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-panel2 text-lg font-bold text-mut transition hover:border-line2 hover:text-text active:scale-95"
            >
              −
            </button>
            <button
              onClick={() => applyBet((n) => n + 1)}
              aria-label="Increase bet"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-panel2 text-lg font-bold text-mut transition hover:border-line2 hover:text-text active:scale-95"
            >
              +
            </button>
          </div>
          <div className="mt-1.5 grid grid-cols-5 gap-1">
            {BET_PRESETS.map((p) => (
              <ChipBtn key={p} onClick={() => applyBet(() => p)}>
                {p}
              </ChipBtn>
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-1">
            <ChipBtn onClick={() => applyBet((n) => n * 0.5)}>1/2</ChipBtn>
            <ChipBtn onClick={() => applyBet((n) => n * 2)}>2X</ChipBtn>
            <ChipBtn
              onClick={() => applyBet(() => Math.floor(balance * 100) / 100)}
            >
              MAX
            </ChipBtn>
          </div>

          <div className="order-3 mt-2 grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <label
                htmlFor="winchance"
                className="text-[10px] font-bold tracking-[0.18em] text-mut"
              >
                WIN CHANCE
              </label>
              <div className="mt-1.5 flex items-center rounded-lg border border-line bg-panel2 px-3 transition focus-within:border-win/60">
                <input
                  id="winchance"
                  type="number"
                  min={0.01}
                  max={99.99}
                  step={0.1}
                  value={Number(chance.toFixed(2))}
                  onChange={(e) => onChanceInput(e.target.valueAsNumber)}
                  className="h-9 min-w-0 w-full bg-transparent font-mono text-sm font-bold text-text outline-none"
                />
                <span className="font-mono text-sm text-mut">%</span>
              </div>
            </div>
            <div className="min-w-0 rounded-lg border border-line bg-panel2 px-2 py-1.5">
              <div className="text-[10px] font-bold tracking-[0.18em] text-mut">
                PAYOUT / WIN AMT
              </div>
              <div className="mt-1 flex flex-wrap gap-x-2 font-mono text-xs font-bold">
                <span>x{payout.toFixed(2)}</span>
                <span className="break-all text-win">+Rs. {fmt(winAmt)}</span>
              </div>
            </div>
          </div>

          {/* direction */}
          <div className="order-1 mt-2 grid grid-cols-2 gap-1 rounded-lg bg-panel2 p-1">
            {(["under", "over"] as Dir[]).map((d) => (
              <button
                key={d}
                onClick={() => toggleDir(d)}
                className={`h-8 rounded-md text-[11px] font-bold tracking-[0.1em] transition ${
                  dir === d
                    ? "bg-win text-[#04220f]"
                    : "text-mut hover:text-text"
                }`}
              >
                ROLL {d.toUpperCase()}
              </button>
            ))}
          </div>

          {/* auto */}
          <div className="order-4 mt-2 border-t border-line pt-2">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-[9px] font-bold tracking-[0.1em] text-mut">
                AUTO PLAY
              </span>
              <button
                role="switch"
                aria-checked={auto.on}
                aria-label="Toggle auto play"
                onClick={toggleAuto}
                className={`relative h-6 w-11 rounded-full transition ${
                  auto.on ? "bg-win" : "bg-line"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                    auto.on ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-semibold text-mut">ROUNDS</span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={auto.count}
                  onChange={(e) => setCount(e.target.valueAsNumber)}
                  aria-label="Auto rounds"
                  className="h-7 w-12 rounded-md border border-line bg-panel2 px-1 text-center font-mono text-xs font-bold text-text outline-none transition focus:border-win/60"
                />
              </div>
            </div>
            <div
              className={`mt-1.5 space-y-1.5 transition-opacity ${
                auto.on ? "opacity-100" : "opacity-50"
              }`}
            >
              <div className="grid grid-cols-2 gap-2">
                <Pill
                  active={auto.stopWin}
                  onClick={() => setAuto((a) => ({ ...a, stopWin: !a.stopWin }))}
                >
                  STOP ON WIN
                </Pill>
                <Pill
                  active={auto.stopLoss}
                  onClick={() => setAuto((a) => ({ ...a, stopLoss: !a.stopLoss }))}
                >
                  STOP ON ZERO PAYOUT
                </Pill>
              </div>
              {auto.on && (
                <div className="font-mono text-[11px] text-mut">
                  Remaining:{" "}
                  <span className="font-bold text-text">{auto.remaining}</span>
                </div>
              )}
            </div>
          </div>

          {/* roll button */}
          <div className="order-2 mt-2" data-dice-roll-action>
            <button
              onClick={onRollClick}
              disabled={!auto.on && (rolling || reviewing || pending || Boolean(error))}
              className={`flex h-10 sm:h-11 w-full items-center justify-center gap-2 rounded-xl font-black transition cursor-pointer active:scale-[0.985] disabled:cursor-wait ${
                auto.on
                  ? "bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white shadow-lg shadow-rose-950/50 hover:scale-[1.02]"
                  : outOfChips
                    ? "bg-[linear-gradient(180deg,#ffd36b,#e09a1f)] text-[#241503] shadow-[0_10px_30px_-10px_rgba(242,178,62,0.5)]"
                    : "bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-slate-950 shadow-lg shadow-emerald-500/40 hover:scale-[1.02]"
              } ${rolling && !auto.on ? "opacity-80" : ""}`}
            >
              {auto.on ? (
                <>
                  <IconStop className="h-5 w-5" />
                  <span className="text-base sm:text-lg tracking-[0.2em]">STOP</span>
                </>
              ) : outOfChips ? (
                <>
                  <IconPlus className="h-5 w-5" />
                  <span className="text-sm sm:text-base tracking-[0.1em]">
                    GET Rs. 1,000 CHIPS
                  </span>
                </>
              ) : rolling ? (
                <>
                  <IconDice className="spin h-6 w-6" />
                  <span className="text-base sm:text-lg tracking-[0.2em]">ROLLING</span>
                </>
              ) : (
                <>
                  <span className="font-mono text-xl sm:text-2xl">x{payout.toFixed(2)}</span>
                  <span className="text-base sm:text-lg tracking-[0.25em]">ROLL</span>
                </>
              )}
            </button>
          </div>
        </aside>
      </div>

      {/* ---------- compact footer history & stats ---------- */}
      <footer className="shrink-0 flex items-center justify-between border-t border-line px-2 py-1 text-[10px] text-mut">
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-[65%]">
          <span className="text-[9px] uppercase tracking-wider text-mut shrink-0 font-bold">History:</span>
          {history.length === 0 ? (
            <span className="text-mut text-[10px]">No rolls yet</span>
          ) : (
            history.slice(0, 10).map((r) => (
              <span
                key={r.id}
                className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-bold shrink-0 ${
                  r.win ? "bg-win/15 text-win" : "bg-loss/15 text-loss"
                }`}
              >
                {r.value.toFixed(2)}
              </span>
            ))
          )}
        </div>
      </footer>

      {/* ---------- big win ---------- */}
      {bigWin && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
          <div className="bigwin-anim px-4 text-center font-sans text-5xl font-bold text-gold drop-shadow-[0_0_30px_rgba(242,178,62,0.55)] md:text-7xl">
            BIG WIN
            <span className="mt-2 block font-mono text-3xl md:text-5xl">
              +Rs. {bigWin}
            </span>
          </div>
        </div>
      )}

      {/* ---------- toasts ---------- */}
      <div className="fixed right-4 top-4 z-50 flex flex-col items-end gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-in rounded-lg border px-3.5 py-2.5 text-sm font-semibold shadow-xl ${toastStyles[t.kind]}`}
          >
            {t.msg}
          </div>
        ))}
      </div>

      {/* ---------- modals ---------- */}
      {modal === "reset" && (
        <Overlay onClose={() => setModal(null)}>
          <h3 className="text-lg font-bold">Reset the game?</h3>
          <p className="mt-2 text-sm text-mut">
            Your balance returns to Rs. 1,000.00 and all history, stats and
            settings are wiped.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setModal(null)}
              className="h-10 rounded-lg border border-line px-4 text-sm font-semibold text-mut transition hover:text-text"
            >
              Cancel
            </button>
            <button
              onClick={resetGame}
              className="h-10 rounded-lg bg-loss px-4 text-sm font-bold text-white transition hover:brightness-110"
            >
              Reset
            </button>
          </div>
        </Overlay>
      )}

      {modal === "help" && (
        <Overlay onClose={() => setModal(null)}>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">How Dice works</h3>
            <button
              onClick={() => setModal(null)}
              aria-label="Close"
              className="text-mut transition hover:text-text"
            >
              <IconX className="h-5 w-5" />
            </button>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-mut">
            <li>
              Pick <b className="text-text">ROLL UNDER</b> — you win if the
              dice lands <b className="text-win">below</b> the target.
            </li>
            <li>
              Pick <b className="text-text">ROLL OVER</b> — you win if the dice
              lands <b className="text-win">above</b> the target.
            </li>
            <li>
              Drag the slider (or set the win chance) to move the target
              between 1.00 and 99.00.
            </li>
            <li>
              Payout is x99 ÷ win chance. A win pays your stake × payout.
            </li>
            <li>
              Use Auto play to run a set number of rounds, optionally stopping
              on a win or a loss.
            </li>
          </ul>
        </Overlay>
      )}
    </div>
  );
}

/* ================= sub-components ================= */

function HeaderBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-panel text-mut transition hover:border-line2 hover:text-text active:scale-95"
    >
      {children}
    </button>
  );
}

function ChipBtn({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="h-8 min-w-0 rounded-md border border-line bg-panel2 text-xs font-bold text-mut transition hover:border-line2 hover:text-text active:scale-95"
    >
      {children}
    </button>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`min-h-8 min-w-0 rounded-md border px-1 py-1 text-[9px] font-bold tracking-[0.06em] transition ${
        active
          ? "border-win/50 bg-win/15 text-win"
          : "border-line bg-panel2 text-mut hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "win" | "loss";
}) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3">
      <div className="text-[10px] font-semibold tracking-[0.18em] text-mut">
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-lg font-bold tabular-nums ${
          tone === "win"
            ? "text-win"
            : tone === "loss"
              ? "text-loss"
              : "text-text"
        }`}
      >
        {value}
      </div>
      {sub && <div className="font-mono text-[11px] text-mut">{sub}</div>}
    </div>
  );
}

function Overlay({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="toast-in w-full max-w-md rounded-2xl border border-line bg-panel p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
