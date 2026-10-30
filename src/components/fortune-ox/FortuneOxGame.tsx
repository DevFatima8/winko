"use client";
import { gameSfx } from "@/lib/gameSfx";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useGameBalance, usePoolLifecycle } from "@/lib/walletSync";
import { readBrowserSlotOutcome } from "@/lib/browserSlotTypes";
import {
  Grid,
  LINES,
  PAYLINES,
  SYMBOLS,
  SYMBOL_LIST,
  SymbolId,
  randomGrid,
  type SpinResult,
} from "./lib/fortuneOx";
import { BET_PRESETS } from "@/lib/betPresets";
import BetAmountInput from "@/components/BetAmountInput";
import "./fortune-ox.css";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function SymbolTile({ id, highlight, dim, size = "normal" }: { id: SymbolId; highlight?: boolean; dim?: boolean; size?: "normal" | "small" }) {
  const s = SYMBOLS[id];
  const isLetter = s.glyph.length === 1;
  return (
    <div
      className={`relative flex items-center justify-center rounded-xl border-2 transition-all duration-150 select-none ${
        size === "small" ? "h-12 w-12" : "h-full w-full"
      } ${highlight ? "border-yellow-200 scale-105 z-10 shadow-[0_0_24px_6px_rgba(255,220,80,.85)]" : "border-[#7a0d0d]/70"} ${
        dim ? "opacity-30" : "opacity-100"
      }`}
      style={{ background: s.bg }}
    >
      <div className="absolute inset-1 rounded-lg border border-white/30 pointer-events-none" />
      <span
        className={`${isLetter ? "font-black" : ""} drop-shadow-[0_2px_2px_rgba(0,0,0,.6)]`}
        style={{
          fontSize: size === "small" ? (isLetter ? 20 : 22) : isLetter ? "clamp(1.4rem,4.5vw,2.2rem)" : "clamp(1.6rem,5vw,2.4rem)",
          color: isLetter ? "#fff8dc" : undefined,
          fontFamily: isLetter ? "Georgia, 'Times New Roman', serif" : undefined,
          WebkitTextStroke: isLetter ? "1px #5a0000" : undefined,
        }}
      >
        {s.glyph}
      </span>
      {id === "WILD" && (
        <span className="absolute bottom-0.5 rounded bg-[#7a0d0d] px-1 text-[8px] font-extrabold tracking-widest text-yellow-200">WILD</span>
      )}
    </div>
  );
}

const SPIN_STRIP = 14;

export default function FortuneOxGame({ backHref = "/player" }: { backHref?: string }) {
  const [balance] = useGameBalance("fortune-ox", 1000);
  const pool = usePoolLifecycle("fortune-ox");
  const [bet, setBet] = useState<number>(100);
  const [grid, setGrid] = useState<Grid>(() => randomGrid());
  const [spinning, setSpinning] = useState<boolean[]>([false, false, false]);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [winDisplay, setWinDisplay] = useState(0);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [turbo, setTurbo] = useState(false);
  const [auto, setAuto] = useState(false);
  const [showBet, setShowBet] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [bigWin, setBigWin] = useState<null | "BIG" | "MEGA" | "SUPER">(null);
  const [message, setMessage] = useState("GOOD LUCK!");
  const [strips, setStrips] = useState<SymbolId[][]>([[], [], []]);
  const autoRef = useRef(false);
  const busyRef = useRef(false);

  const isBusy = spinning.some(Boolean) || !!bigWin;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const doSpin = useCallback(async () => {
    if (busyRef.current) return;
    if (balance < bet) {
      setMessage("INSUFFICIENT BALANCE");
      setAuto(false);
      autoRef.current = false;
      return;
    }
    busyRef.current = true;
    if (!await pool.start(bet, undefined, {})) { busyRef.current = false; return; }
    const outcome = readBrowserSlotOutcome("fortune-ox", await pool.resolveServer({}), bet);
    if (!outcome) {
      setMessage("SPIN CONFIRMATION PENDING — PLEASE RETRY");
      setAuto(false);
      autoRef.current = false;
      busyRef.current = false;
      return;
    }
    const res = outcome.spin;
    setResult(null);
    setWinDisplay(0);
    setActiveLine(null);
    setMessage("GOOD LUCK!");

    gameSfx.spin();
    setStrips([0, 1, 2].map(() => Array.from({ length: SPIN_STRIP }, () => SYMBOL_LIST[Math.floor(Math.random() * SYMBOL_LIST.length)].id)));
    setSpinning([true, true, true]);

    const base = turbo ? 350 : 900;
    const gap = turbo ? 120 : 350;
    for (let reel = 0; reel < 3; reel++) {
      await sleep(reel === 0 ? base : gap);
      setGrid((g) => {
        const ng = g.map((r) => [...r]);
        ng[reel] = res.grid[reel];
        return ng;
      });
      setSpinning((s) => {
        const ns = [...s];
        ns[reel] = false;
        return ns;
      });
    }

    if (res.total > 0) gameSfx.win(); else gameSfx.lose();
    setResult(res);
    if (res.total > 0) {
      const ratio = res.total / bet;
      const tier = ratio >= 50 ? "SUPER" : ratio >= 25 ? "MEGA" : ratio >= 10 ? "BIG" : null;
      if (tier) {
        setBigWin(tier);
        await sleep(turbo ? 1500 : 2600);
        setBigWin(null);
      }
      // count up
      const steps = turbo ? 10 : 25;
      for (let i = 1; i <= steps; i++) {
        setWinDisplay(+((res.total * i) / steps).toFixed(2));
        await sleep(turbo ? 25 : 45);
      }
      setWinDisplay(res.total);
      setMessage(pool.enabled ? `PROVISIONAL CLAIM ${fmt(res.total)} — daily settlement pending` : res.fullWild ? "FULL WILD! x10 MULTIPLIER!" : `WIN ${fmt(res.total)}`);
      await sleep(turbo ? 300 : 700);
    } else {
      setMessage(pool.enabled ? "DAILY PAYOUT PENDING — PROVISIONAL CLAIM 0" : "GOOD LUCK!");
      await sleep(turbo ? 100 : 350);
    }
    busyRef.current = false;
    if (autoRef.current) setTimeout(() => void doSpin(), 200);
  }, [balance, bet, turbo]);

  // cycle through winning lines
  useEffect(() => {
    if (!result || result.wins.length === 0) {
      setActiveLine(null);
      return;
    }
    let i = 0;
    setActiveLine(result.wins[0].line);
    const t = setInterval(() => {
      i = (i + 1) % result.wins.length;
      setActiveLine(result.wins[i].line);
    }, 1100);
    return () => clearInterval(t);
  }, [result]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        void doSpin();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [doSpin]);

  const toggleAuto = () => {
    const next = !auto;
    setAuto(next);
    autoRef.current = next;
    if (next && !busyRef.current) void doSpin();
  };

  const winPositions = new Set<string>();
  if (result && activeLine !== null) {
    const w = result.wins.find((x) => x.line === activeLine);
    w?.positions.forEach(([r, c]) => winPositions.add(`${r}-${c}`));
  }
  const hasWin = !!result && result.wins.length > 0;

  return (
    <div className="fortune-ox-container relative h-full w-full flex items-center justify-center overflow-hidden px-1 sm:px-4 py-1 select-none">
      <div className="ox-device relative mx-auto flex h-full w-full max-w-[440px] max-h-full flex-col justify-between overflow-hidden text-white" style={{ fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif" }}>
        {/* Top header */}
        <div className="relative z-10 flex w-full flex-wrap gap-1 items-center justify-between px-2 pt-1 text-[11px] font-semibold text-yellow-100/80 shrink-0">
          <div className="flex items-center gap-1.5">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1 rounded-lg border border-yellow-400/50 bg-black/60 hover:bg-black/80 px-2.5 py-1 text-xs font-semibold text-yellow-300 transition hover:scale-105 active:scale-95 cursor-pointer"
            >
              ← Back
            </Link>
            <button onClick={() => setShowPay(true)} className="rounded-lg border border-yellow-400/50 bg-black/50 hover:bg-black/70 px-2 py-1 text-[10px] text-yellow-200 transition cursor-pointer">
              ⓘ Paytable
            </button>
          </div>
          <span className="tracking-[0.2em] font-black text-yellow-300 text-xs sm:text-sm">FORTUNE OX</span>
          <span className="rounded-lg border border-yellow-400/50 bg-black/50 px-2 py-1 text-[10px] text-yellow-200 font-bold">10 LINES</span>
        </div>

        {/* Ox statue */}
        <div className="relative z-10 -mb-3 sm:-mb-5 mt-0.5 flex w-full justify-center shrink-0">
          <div className="relative">
            <div className="absolute inset-0 -z-10 rounded-full bg-yellow-400/30 blur-2xl" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/games/21_Fortune_Ox_1024x700.jpg" alt="Fortune Ox" className={`h-11 w-11 sm:h-18 sm:w-18 object-cover rounded-full border-2 sm:border-3 border-yellow-500 shadow-md ${hasWin ? "animate-bounce" : ""}`} />
            {/* lanterns */}
            <span className="absolute -left-8 sm:-left-12 top-0.5 text-lg sm:text-2xl animate-[swing_3s_ease-in-out_infinite]">🏮</span>
            <span className="absolute -right-8 sm:-right-12 top-0.5 text-lg sm:text-2xl animate-[swing_3s_ease-in-out_infinite_reverse]">🏮</span>
          </div>
        </div>

        {/* Machine frame */}
        <div className="ox-machine relative z-0 w-full flex-1 min-h-0 flex flex-col justify-between rounded-2xl border-2 sm:border-4 border-[#f2c14e] bg-gradient-to-b from-[#8f0f0f] via-[#6b0a0a] to-[#4a0505] p-1.5 sm:p-2 pt-3.5 sm:pt-6 shadow-xl overflow-hidden my-0.5">
          {/* Ornaments */}
          <div className="pointer-events-none absolute -top-2 left-1/2 flex -translate-x-1/2 gap-1 text-sm">
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-yellow-300 shadow-[0_0_6px_#ffd700]" style={{ animation: `blink 1s ${i * 0.12}s infinite alternate` }} />
            ))}
          </div>

          {/* Message */}
          <div className="mb-0.5 sm:mb-1 text-center shrink-0">
            <span className="rounded-full bg-black/40 px-2.5 py-0.5 text-[9px] sm:text-[10px] font-bold tracking-widest text-yellow-200">{message}</span>
          </div>

          {/* Reels */}
          <div className="ox-reel-window relative rounded-xl border-2 sm:border-3 border-[#d4a017] bg-[#3a0303] p-1 sm:p-1.5 shadow-[inset_0_0_25px_rgba(0,0,0,.9)] flex-1 min-h-0 flex flex-col justify-center">
            {/* line number badges */}
            <div className="absolute -left-3.5 sm:-left-4 top-0 flex h-full flex-col justify-around text-[8px] sm:text-[9px] font-bold">
              {[2, 1, 3].map((n) => (
                <span key={n} className={`flex h-3.5 w-3.5 sm:h-4 sm:w-4 items-center justify-center rounded-full border ${activeLine !== null && PAYLINES[activeLine][0] === [2, 1, 3].indexOf(n) ? "bg-yellow-300 text-red-900 border-yellow-100" : "bg-red-950 text-yellow-300 border-yellow-600"}`}>{n}</span>
              ))}
            </div>
            <div className="absolute -right-3.5 sm:-right-4 top-0 flex h-full flex-col justify-around text-[8px] sm:text-[9px] font-bold">
              {[6, 10, 7].map((n, i) => (
                <span key={n} className={`flex h-3.5 w-3.5 sm:h-4 sm:w-4 items-center justify-center rounded-full border ${activeLine !== null && PAYLINES[activeLine][2] === i ? "bg-yellow-300 text-red-900 border-yellow-100" : "bg-red-950 text-yellow-300 border-yellow-600"}`}>{n}</span>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-1 sm:gap-2 h-full">
              {[0, 1, 2].map((reel) => (
                <div key={reel} className="relative overflow-hidden rounded-lg bg-gradient-to-b from-[#5a0606] via-[#8a1010] to-[#5a0606] h-full">
                  {spinning[reel] ? (
                    <div className="absolute inset-0 flex flex-col justify-between gap-1 p-0.5 animate-[reelspin_.35s_linear_infinite] blur-[1px]">
                      {strips[reel].map((s, i) => (
                        <div key={i} className="aspect-square w-full shrink-0">
                          <SymbolTile id={s} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex flex-col justify-between gap-1 p-0.5">
                      {grid[reel].map((s, row) => (
                        <div key={row} className="aspect-square w-full shrink-0">
                          <SymbolTile id={s} highlight={winPositions.has(`${reel}-${row}`)} dim={hasWin && activeLine !== null && !winPositions.has(`${reel}-${row}`)} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Payline overlay */}
            {activeLine !== null && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 300 300" preserveAspectRatio="none">
                <polyline
                  points={PAYLINES[activeLine].map((row, reel) => `${reel * 100 + 50},${row * 100 + 50}`).join(" ")}
                  fill="none"
                  stroke="#ffe066"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ filter: "drop-shadow(0 0 6px #ffd700)" }}
                />
              </svg>
            )}

            {/* Full wild overlay */}
            {result?.fullWild && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="animate-pulse rounded-2xl bg-black/60 px-4 py-2 text-2xl sm:text-3xl font-black text-yellow-300 drop-shadow-[0_0_20px_gold]">x10</span>
              </div>
            )}
          </div>

          {/* Win box */}
          <div className="mt-0.5 sm:mt-1 flex items-center justify-center shrink-0">
            <div className="min-w-[140px] sm:min-w-[170px] rounded-full border border-yellow-500 bg-black/60 px-3 py-0.5 text-center">
              <div className="text-[8px] sm:text-[9px] tracking-widest text-yellow-200/70 font-bold">{pool.enabled ? "PROVISIONAL CLAIM" : "WIN"}</div>
              <div className={`text-xs sm:text-base font-black ${winDisplay > 0 ? "text-yellow-300" : "text-yellow-100/60"}`}>{fmt(winDisplay)}</div>
            </div>
          </div>
        </div>

        {/* Bottom control bar */}
        <div className="shrink-0 w-full bg-gradient-to-b from-[#2b0202] to-black px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl border border-yellow-600/30">
          <div className="mb-0.5 sm:mb-1 flex items-center justify-between text-xs">
            <div>
              <div className="text-[8px] sm:text-[9px] tracking-widest text-yellow-200/60 font-bold">BALANCE</div>
              <div className="text-xs sm:text-base font-bold text-yellow-100 leading-tight">Rs. {fmt(balance)}</div>
            </div>
            <div className="text-center">
              <div className="text-[8px] sm:text-[9px] tracking-widest text-yellow-200/60 font-bold">BET</div>
              <div className="text-xs sm:text-base font-bold text-yellow-100 leading-tight">Rs. {fmt(bet)}</div>
            </div>
            <div className="text-right">
              <div className="text-[8px] sm:text-[9px] tracking-widest text-yellow-200/60 font-bold">{pool.enabled ? "PROVISIONAL CLAIM" : "WIN"}</div>
              <div className="text-xs sm:text-base font-bold text-yellow-100 leading-tight">Rs. {fmt(winDisplay)}</div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-1">
            <button
              onClick={() => setTurbo((t) => !t)}
              className={`flex h-9 w-9 sm:h-12 sm:w-12 flex-col items-center justify-center rounded-full border-2 text-[7px] sm:text-[9px] font-bold hover:scale-105 active:scale-95 transition cursor-pointer ${
                turbo
                  ? "border-amber-300 bg-gradient-to-b from-amber-400 to-yellow-600 text-slate-950 shadow-md shadow-amber-500/30"
                  : "border-yellow-600/50 bg-black/50 text-yellow-200"
              }`}
            >
              <span className="text-sm sm:text-lg leading-none">⚡</span>TURBO
            </button>
            <button
              onClick={() => !isBusy && setShowBet(true)}
              disabled={isBusy}
              className="flex h-9 w-9 sm:h-12 sm:w-12 flex-col items-center justify-center rounded-full border-2 border-yellow-500/60 bg-gradient-to-b from-amber-900/60 to-black text-[7px] sm:text-[9px] font-bold text-yellow-200 disabled:opacity-40 hover:scale-105 active:scale-95 transition cursor-pointer"
            >
              <span className="text-sm sm:text-lg leading-none">🪙</span>BET
            </button>

            {/* Spin / Stop button */}
            <button
              onClick={() => {
                if (auto) {
                  toggleAuto();
                  return;
                }
                void doSpin();
              }}
              disabled={isBusy && !auto}
              className={`relative flex h-14 w-14 sm:h-20 sm:w-20 items-center justify-center rounded-full border-3 sm:border-4 hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-70 ${
                auto
                  ? "border-rose-300 bg-gradient-to-b from-rose-500 to-red-700 text-white shadow-[0_0_20px_rgba(239,68,68,.7)]"
                  : "border-emerald-300 bg-gradient-to-b from-emerald-400 via-green-500 to-emerald-700 text-white shadow-[0_0_24px_rgba(34,197,94,.7)]"
              }`}
            >
              {auto ? (
                <div className="flex flex-col items-center leading-none">
                  <span className="text-lg sm:text-2xl font-black">■</span>
                  <span className="text-[7px] sm:text-[8px] font-black tracking-widest mt-0.5">STOP</span>
                </div>
              ) : (
                <div className="flex flex-col items-center leading-none">
                  <span className={`text-xl sm:text-3xl font-black ${isBusy ? "animate-spin" : ""}`}>↻</span>
                  <span className="text-[7px] sm:text-[8px] font-black tracking-widest mt-0.5">SPIN</span>
                </div>
              )}
            </button>

            <button
              onClick={toggleAuto}
              className={`flex h-9 w-9 sm:h-12 sm:w-12 flex-col items-center justify-center rounded-full border-2 text-[7px] sm:text-[9px] font-bold hover:scale-105 active:scale-95 transition cursor-pointer ${
                auto
                  ? "border-amber-300 bg-gradient-to-b from-amber-400 to-orange-500 text-black shadow-md shadow-amber-500/30"
                  : "border-teal-500/60 bg-teal-950/60 text-teal-200"
              }`}
            >
              <span className="text-sm sm:text-lg leading-none">{auto ? "■" : "▶"}</span>AUTO
            </button>
          </div>
        </div>

      {/* Big win overlay */}
      {bigWin && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70">
          <div className="animate-[pop_.6s_ease-out] text-center">
            <div className="text-6xl">🎉</div>
            <div className="bg-gradient-to-b from-yellow-100 via-yellow-400 to-orange-600 bg-clip-text text-6xl font-black tracking-wider text-transparent drop-shadow-[0_0_30px_gold]">{pool.enabled ? "PROVISIONAL CLAIM" : `${bigWin} WIN`}</div>
            <div className="mt-3 text-3xl font-bold text-yellow-200">Rs. {fmt(result?.total ?? 0)}</div>
          </div>
        </div>
      )}

      {/* Bet panel */}
      {showBet && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70" onClick={() => setShowBet(false)}>
          <div className="w-full max-w-[520px] rounded-t-3xl border-t-4 border-yellow-500 bg-gradient-to-b from-[#6b0a0a] to-[#2b0202] p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-center text-lg font-black tracking-widest text-yellow-300">BET SETTINGS</h3>
            <div className="mb-3 grid grid-cols-5 gap-1.5">
              {BET_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setBet(p)}
                  className={`rounded-full border-2 py-2 text-xs font-black ${bet === p ? "border-yellow-300 bg-yellow-400 text-red-900" : "border-yellow-500 bg-black/40 text-yellow-200"}`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="mb-4 flex items-center justify-between">
              <span className="w-24 text-xs font-bold text-yellow-100/80">CUSTOM</span>
              <BetAmountInput value={bet} onChange={setBet} />
            </div>
            <div className="mb-4 flex items-center justify-between">
              <span className="w-24 text-xs font-bold text-yellow-100/80">LINES</span>
              <span className="text-xl font-black text-yellow-200">{LINES}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl border-2 border-yellow-500 bg-black/40 px-4 py-3">
              <span className="text-xs font-bold tracking-widest text-yellow-100/80">TOTAL BET</span>
              <span className="text-2xl font-black text-yellow-300">Rs. {fmt(bet)}</span>
            </div>
            <div className="mt-4 flex gap-2">
                            <button onClick={() => setBet(Math.max(1, Math.floor(balance)))} className="flex-1 rounded-full border-2 border-yellow-500 bg-black/40 py-2 text-xs font-bold text-yellow-200">MAX BET</button>
              <button onClick={() => setShowBet(false)} className="flex-1 rounded-full bg-yellow-400 py-2 text-xs font-black text-red-900">CONFIRM</button>
            </div>
          </div>
        </div>
      )}

      {/* Paytable */}
      {showPay && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4" onClick={() => setShowPay(false)}>
          <div className="max-h-[90vh] w-full max-w-[480px] overflow-y-auto rounded-3xl border-4 border-yellow-500 bg-gradient-to-b from-[#6b0a0a] to-[#2b0202] p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-center text-xl font-black tracking-widest text-yellow-300">PAYTABLE</h3>
            <p className="mb-4 text-center text-[11px] text-yellow-100/70">3 of a kind on a payline · Wild substitutes all symbols · All 9 Wilds = x10</p>
            <p className="mb-4 text-center text-[11px] text-yellow-100/70">Server-settled reels: 10 winning players per 100 distinct players. Eligible reel results return at most 2× the paid stake in total.</p>
            <div className="grid grid-cols-3 gap-3">
              {SYMBOL_LIST.map((s) => (
                <div key={s.id} className="flex flex-col items-center rounded-xl bg-black/30 p-2">
                  <SymbolTile id={s.id} size="small" />
                  <span className="mt-1 text-[10px] text-yellow-100/70">{s.name}</span>
                  <span className="text-sm font-black text-yellow-300">{s.pay3}x</span>
                </div>
              ))}
            </div>
            <h4 className="mt-5 mb-2 text-center text-sm font-black tracking-widest text-yellow-300">PAYLINES ({LINES})</h4>
            <div className="grid grid-cols-5 gap-2">
              {PAYLINES.map((line, i) => (
                <div key={i} className="rounded-lg bg-black/30 p-1">
                  <div className="grid grid-cols-3 gap-[2px]">
                    {[0, 1, 2].map((row) =>
                      [0, 1, 2].map((reel) => <div key={`${row}${reel}`} className={`aspect-square rounded-sm ${line[reel] === row ? "bg-yellow-400" : "bg-red-950"}`} />)
                    )}
                  </div>
                  <div className="mt-1 text-center text-[9px] font-bold text-yellow-200">{i + 1}</div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowPay(false)} className="mt-5 w-full rounded-full bg-yellow-400 py-2 text-xs font-black text-red-900">CLOSE</button>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
