'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useGameBalance, usePoolLifecycle } from "@/lib/walletSync";
import { readBrowserSlotOutcome } from "@/lib/browserSlotTypes";
import "./fortune-gems.css";
import {
  BETS,
  EXTRA_BET_COST,
  PAYLINES,
  START_BALANCE,
  randomMultiplier,
  randomSymbol,
  type LineWin,
  type SymbolId,
} from './game/logic';
import { SymbolDefs, SymbolIcon } from './components/SymbolIcon';
import { Reel } from './components/Reel';
import { sfx } from './game/sound';
import { BET_PRESETS } from "@/lib/betPresets";
import BetAmountInput from "@/components/BetAmountInput";
const bg = '/games/20_Fortune_Gems_1024x700.jpg';

const LINE_COLORS = ['#ff3b3b', '#ffe14a', '#4affb0', '#4ab8ff', '#ff6ad5'];

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n: number) => Math.round(n * 100) / 100;

const initialCols = (): SymbolId[][] =>
  Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => randomSymbol()));

function useCountUp(target: number, duration = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

function BigWin({ amount, title, onClose }: { amount: number; title: string; onClose: () => void }) {
  const v = useCountUp(amount, 1800);
  const coins = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.6,
        dur: 1.6 + Math.random() * 1.6,
        key: i,
      })),
    []
  );
  useEffect(() => {
    const t = setTimeout(onClose, 3800);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-30 bg-black/75 flex flex-col items-center justify-center overflow-hidden" onClick={onClose}>
      <div className="absolute w-[160%] aspect-square rays" />
      {coins.map((c) => (
        <div key={c.key} className="coin" style={{ left: `${c.left}%`, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }} />
      ))}
      <div className="relative popin text-center">
        <div
          className="gold-text glowtext font-black text-5xl tracking-wider leading-none"
          style={{ WebkitTextStroke: '2px #6b3200', fontFamily: 'Impact, Arial Black, sans-serif' }}
        >
          {title}
        </div>
        <div
          className="gold-text font-black text-6xl mt-4"
          style={{ WebkitTextStroke: '2px #6b3200', fontFamily: 'Impact, Arial Black, sans-serif' }}
        >
          {fmt(v)}
        </div>
      </div>
    </div>
  );
}

const CELL = 'min(18vw, 7.8vh, 68px)';
const MCELL_W = `calc(${CELL} * 0.82)`;

export default function FortuneGemsGame({ backHref = "/player" }: { backHref?: string }) {
  const [balance] = useGameBalance("fortune-gems", START_BALANCE);
  const pool = usePoolLifecycle("fortune-gems");
  const [betIdx, setBetIdx] = useState(1);
  const [customBet, setCustomBet] = useState<number | null>(null);
  const [extra, setExtra] = useState(false);
  const [cols, setCols] = useState<SymbolId[][]>(initialCols);
  const [multReel, setMultReel] = useState<number[]>([2, 1, 3]);
  const [spinKey, setSpinKey] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [wins, setWins] = useState<LineWin[]>([]);
  const [lastWin, setLastWin] = useState(0);
  const [turbo, setTurbo] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const [autoMenu, setAutoMenu] = useState(false);
  const [big, setBig] = useState<{ amount: number; title: string } | null>(null);
  const [toast, setToast] = useState<{ msg: string; id: number } | null>(null);

  const stopped = useRef(0);
  const requestInFlight = useRef(false);
  const pendingWin = useRef<{ wins: LineWin[]; total: number; mult: number }>({ wins: [], total: 0, mult: 1 });
  const bet = customBet ?? BETS[betIdx];
  const wager = round2(extra ? bet * EXTRA_BET_COST : bet);

  const showToast = (msg: string) => setToast({ msg, id: Date.now() });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const doSpin = useCallback(async () => {
    if (spinning || big || requestInFlight.current) return;
    if (balance < wager) {
      setAutoLeft(0);
      showToast('Insufficient balance!');
      return;
    }
    requestInFlight.current = true;
    const selection = { extra, baseBet: bet };
    if (!await pool.start(wager, undefined, selection)) { requestInFlight.current = false; return; }
    const outcome = readBrowserSlotOutcome("fortune-gems", await pool.resolveServer(selection), wager);
    requestInFlight.current = false;
    if (!outcome || outcome.extra !== extra || outcome.baseBet !== bet) {
      setAutoLeft(0);
      showToast("Spin confirmation pending — please retry.");
      return;
    }
    const res = outcome.spin;
    setWins([]);
    setLastWin(0);
    stopped.current = 0;
    pendingWin.current = { wins: res.wins, total: outcome.payout, mult: res.multiplier };
    setCols([0, 1, 2].map((c) => [0, 1, 2].map((r) => res.grid[r][c])));
    setMultReel(res.multReel);
    setSpinKey((k) => k + 1);
    setSpinning(true);
    sfx.spin();
  }, [spinning, big, balance, wager, extra, bet]);

  const onReelStop = useCallback(async () => {
    sfx.stop();
    stopped.current += 1;
    if (stopped.current < 4) return; // 3 reels + multiplier reel
    const { wins: w, total } = pendingWin.current;
    setSpinning(false);
    if (pool.enabled) showToast(`Daily payout pending — provisional claim ${total}`);
    if (total > 0) {
      setWins(w);
      setLastWin(total);
      const x = total / bet;
      if (x >= 10) {
        sfx.big();
        setBig({ amount: total, title: pool.enabled ? 'PROVISIONAL CLAIM' : x >= 40 ? 'SUPER WIN' : x >= 20 ? 'MEGA WIN' : 'BIG WIN' });
      } else sfx.win();
    }
  }, [bet]);

  // Auto spin loop
  useEffect(() => {
    if (autoLeft > 0 && !spinning && !big) {
      const t = setTimeout(
        () => {
          setAutoLeft((n) => n - 1);
          doSpin();
        },
        turbo ? 350 : lastWin > 0 ? 1400 : 700
      );
      return () => clearTimeout(t);
    }
  }, [autoLeft, spinning, big, turbo, doSpin, lastWin]);

  const winRowsByCol = (c: number) =>
    spinning ? [] : Array.from(new Set(wins.flatMap((w) => w.cells.filter((x) => x[1] === c).map((x) => x[0]))));

  const changeBet = (d: number) => {
    if (spinning) return;
    sfx.click();
    setCustomBet(null);
    setBetIdx((i) => Math.max(0, Math.min(BETS.length - 1, i + d)));
  };

  const showWin = !spinning && lastWin > 0;

  return (
    <div className="fortune-gems-container relative h-full w-full flex items-center justify-center px-1 sm:px-4 py-1 select-none overflow-hidden">
      <div className="h-full w-full flex items-center justify-center">
        <SymbolDefs />
        <div
          className="relative h-full w-full max-w-[440px] max-h-full overflow-hidden flex flex-col justify-between text-white shadow-[0_0_60px_rgba(20,220,180,.25)] rounded-2xl sm:rounded-3xl"
          style={{ background: `#03130f url(${bg}) center/cover no-repeat` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/15 to-black/60 pointer-events-none" />

          {/* top bar */}
          <div className="relative z-10 flex items-center justify-between px-3 pt-1 sm:pt-2 pb-0.5 shrink-0">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1 rounded-lg border border-yellow-500/40 bg-black/60 hover:bg-black/80 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-semibold text-yellow-300 transition hover:scale-105 active:scale-95 cursor-pointer"
            >
              ← Back
            </Link>
            <div className="text-[9px] sm:text-[10px] tracking-widest text-teal-200/80 uppercase font-bold">
              5 LINES · MULTI x15
            </div>
          </div>

          {/* logo */}
          <div className="relative z-10 flex flex-col items-center pt-0 shrink-0">
            <h1
              className="gold-text glowtext font-black text-[clamp(18px,5vw,30px)] leading-none tracking-wide"
              style={{ WebkitTextStroke: '1.2px #4a2200', fontFamily: 'Impact, Arial Black, sans-serif' }}
            >
              FORTUNE GEMS
            </h1>
          </div>

          {/* reels */}
          <div className="relative z-10 flex-1 flex flex-col items-center justify-center min-h-0 py-1">
            <div className="flex items-stretch gap-1.5 sm:gap-2">
              {/* main frame */}
              <div
                className="relative rounded-[18px] p-[5px]"
                style={{
                  background: 'linear-gradient(160deg,#fff2a0,#e09a00 40%,#8a4b00 70%,#ffd84a)',
                  boxShadow: '0 0 24px rgba(255,190,40,.4), 0 8px 24px rgba(0,0,0,.75)',
                }}
              >
                <div
                  className="relative rounded-xl px-1 py-0.5"
                  style={{ background: 'linear-gradient(180deg,#04201f,#0d4a44 50%,#04201f)', boxShadow: 'inset 0 0 25px rgba(0,0,0,.9)' }}
                >
                  <div className="flex items-center">
                    {[0, 1, 2].map((c) => (
                      <div key={c} className="flex">
                        <Reel<SymbolId>
                          index={c}
                          target={cols[c]}
                          spinKey={spinKey}
                          turbo={turbo}
                          winRows={winRowsByCol(c)}
                          cellW={CELL}
                          cellH={CELL}
                          randomItem={randomSymbol}
                          onStop={onReelStop}
                          render={(s, hi) => (
                            <div className={`w-[80%] h-[80%] ${hi ? 'animate-winpulse' : ''}`}>
                              <SymbolIcon id={s} />
                            </div>
                          )}
                        />
                        {c < 2 && <div className="w-[2px] my-1 bg-gradient-to-b from-transparent via-yellow-500/50 to-transparent" />}
                      </div>
                    ))}
                  </div>

                  {/* payline overlay */}
                  {showWin && (
                    <svg
                      className="absolute pointer-events-none"
                      style={{ left: 4, right: 4, top: 2, bottom: 2, width: 'calc(100% - 8px)', height: 'calc(100% - 4px)' }}
                      viewBox="0 0 3 3"
                      preserveAspectRatio="none"
                    >
                      {wins.map((w) => (
                        <polyline
                          key={w.line}
                          points={PAYLINES[w.line].map((r, c) => `${c + 0.5},${r + 0.5}`).join(' ')}
                          fill="none"
                          stroke={LINE_COLORS[w.line]}
                          strokeWidth="0.045"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity="0.92"
                        />
                      ))}
                    </svg>
                  )}
                </div>

                {/* payline badges */}
                {PAYLINES.map((_, i) => {
                  const left = i % 2 === 0;
                  const top = [50, 16.6, 83.3, 16.6, 83.3][i];
                  return (
                    <div
                      key={i}
                      className="absolute w-3.5 h-3.5 rounded-full text-[8px] font-black text-black flex items-center justify-center border border-white/70"
                      style={{
                        background: LINE_COLORS[i],
                        top: `${top}%`,
                        [left ? 'left' : 'right']: -5,
                        transform: 'translateY(-50%)',
                        opacity: showWin && wins.some((w) => w.line === i) ? 1 : 0.7,
                      }}
                    >
                      {i + 1}
                    </div>
                  );
                })}
              </div>

              {/* multiplier reel */}
              <div className="flex flex-col items-center">
                <div className="text-[8px] font-black tracking-wider text-yellow-200 leading-tight text-center mb-0.5">
                  WIN<br />MULTI
                </div>
                <div
                  className="relative rounded-[15px] p-[4px]"
                  style={{
                    background: 'linear-gradient(160deg,#fff2a0,#e09a00 40%,#8a4b00 70%,#ffd84a)',
                    boxShadow: '0 0 20px rgba(255,190,40,.35), 0 6px 20px rgba(0,0,0,.7)',
                  }}
                >
                  <div
                    className="relative rounded-lg overflow-hidden"
                    style={{ background: 'linear-gradient(180deg,#2a0a45,#5b1a8a 50%,#2a0a45)', boxShadow: 'inset 0 0 20px rgba(0,0,0,.9)' }}
                  >
                    <Reel<number>
                      index={3}
                      target={multReel}
                      spinKey={spinKey}
                      turbo={turbo}
                      winRows={showWin ? [1] : []}
                      cellW={MCELL_W}
                      cellH={CELL}
                      randomItem={() => randomMultiplier(extra)}
                      onStop={onReelStop}
                      render={(m, hi) => (
                        <div
                          className={`font-black leading-none ${hi ? 'animate-winpulse' : ''}`}
                          style={{
                            fontFamily: 'Impact, Arial Black, sans-serif',
                            fontSize: `calc(${CELL} * ${m >= 10 ? 0.36 : 0.42})`,
                            color: m >= 10 ? '#ff7a2f' : m >= 5 ? '#ffd23a' : '#f4f0ff',
                            WebkitTextStroke: '1.2px #2a0a45',
                            textShadow: '0 2px 4px rgba(0,0,0,.6)',
                          }}
                        >
                          x{m}
                        </div>
                      )}
                    />
                    {/* centre selector */}
                    <div
                      className="absolute left-0 right-0 pointer-events-none border-y-[2px] border-yellow-300"
                      style={{
                        top: CELL,
                        height: CELL,
                        boxShadow: 'inset 0 0 14px rgba(255,220,80,.55), 0 0 12px rgba(255,220,80,.6)',
                        background: 'rgba(255,220,80,.1)',
                      }}
                    />
                  </div>
                  {/* arrow */}
                  <div className="absolute -left-2 top-1/2 -translate-y-1/2 text-yellow-300 text-sm leading-none drop-shadow">▶</div>
                </div>
                {extra && <div className="mt-0.5 text-[9px] font-black text-black bg-yellow-300 rounded px-1">EX</div>}
              </div>
            </div>

            {/* win banner */}
            <div className="h-8 sm:h-10 mt-0.5 sm:mt-1 flex items-center justify-center shrink-0">
              {spinning ? (
                <div className="text-teal-100 tracking-[0.25em] text-[11px] sm:text-xs animate-pulse font-bold">GOOD LUCK</div>
              ) : lastWin > 0 ? (
                <div className="popin text-center" key={spinKey}>
                  <div className="text-[9px] sm:text-[10px] tracking-[0.3em] text-yellow-200 font-bold">{pool.enabled ? "PROVISIONAL CLAIM" : "YOU WIN"}</div>
                  <div className="gold-text font-black text-xl sm:text-3xl leading-none" style={{ WebkitTextStroke: '1px #6b3200' }}>
                    {fmt(lastWin)}
                  </div>
                </div>
              ) : (
                <div className="text-teal-100/70 tracking-[0.2em] text-[10px] sm:text-[11px] font-medium">PRESS SPIN TO PLAY</div>
              )}
            </div>
          </div>

          {/* bottom panel */}
          <div
            className="relative z-10 px-2.5 pb-2 pt-1.5 sm:px-3 sm:pb-3 sm:pt-2 rounded-t-2xl border-t-2 border-yellow-500/80 shrink-0"
            style={{ background: 'linear-gradient(180deg,rgba(6,42,40,.96),rgba(2,14,14,.98))', boxShadow: '0 -6px 20px rgba(0,0,0,.6)' }}
          >
            <div className="grid grid-cols-3 gap-1 sm:gap-1.5 mb-1 sm:mb-2">
              <div className="rounded-xl bg-black/50 border border-yellow-600/50 py-0.5 sm:py-1 text-center">
                <div className="text-[8px] sm:text-[9px] tracking-widest text-yellow-300/90 font-bold">BALANCE</div>
                <div className="font-black text-xs sm:text-base tabular-nums">                Rs. {fmt(balance)}</div>
              </div>
              <div className="rounded-xl bg-black/50 border border-yellow-600/50 py-0.5 sm:py-1 text-center">
                <div className="text-[8px] sm:text-[9px] tracking-widest text-yellow-300/90 font-bold">BET{extra ? ` · EX` : ''}</div>
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() => changeBet(-1)}
                    className="w-4.5 h-4.5 sm:w-5 sm:h-5 rounded-full bg-gradient-to-b from-rose-500 to-red-800 border border-white/60 font-black leading-none hover:scale-110 active:scale-90 transition cursor-pointer text-xs"
                  >
                    −
                  </button>
                  <span className="font-black text-xs sm:text-base tabular-nums min-w-[28px] sm:min-w-[34px]">{fmt(bet)}</span>
                  <button
                    onClick={() => changeBet(1)}
                    className="w-4.5 h-4.5 sm:w-5 sm:h-5 rounded-full bg-gradient-to-b from-emerald-500 to-green-800 border border-white/60 font-black leading-none hover:scale-110 active:scale-90 transition cursor-pointer text-xs"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="rounded-xl bg-black/50 border border-yellow-600/50 py-0.5 sm:py-1 text-center">
                <div className="text-[8px] sm:text-[9px] tracking-widest text-yellow-300/90 font-bold">{pool.enabled ? "PROVISIONAL CLAIM" : "WIN"}</div>
                <div className="font-black text-xs sm:text-base tabular-nums text-yellow-300">{fmt(spinning ? 0 : lastWin)}</div>
              </div>
            </div>

            <div className="mb-1 sm:mb-2 flex flex-wrap items-center justify-center gap-1">
              {BET_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={spinning}
                  onClick={() => {
                    sfx.click();
                    setCustomBet(p);
                  }}
                  className={`rounded-full border px-2 py-0.5 text-[10px] sm:text-xs font-black tabular-nums transition disabled:opacity-50 cursor-pointer ${bet === p ? 'border-yellow-300 bg-yellow-400 text-black' : 'border-yellow-600/50 bg-black/50 text-yellow-200'
                    }`}
                >
                  {p}
                </button>
              ))}
              <BetAmountInput value={bet} onChange={setCustomBet} disabled={spinning} />
            </div>

            <div className="flex items-center justify-between">
              {/* extra bet + turbo */}
              <div className="flex flex-col gap-1 sm:gap-1.5">
                <button
                  onClick={() => {
                    if (spinning) return;
                    sfx.click();
                    setExtra((e) => !e);
                    showToast(!extra ? `Extra Bet ON – bet x${EXTRA_BET_COST}` : 'Extra Bet OFF');
                  }}
                  className={`h-7 sm:h-8 w-[50px] sm:w-[60px] rounded-full border-2 flex items-center justify-center gap-0.5 text-[9px] sm:text-[10px] font-black hover:scale-105 active:scale-90 transition cursor-pointer ${extra
                      ? 'border-yellow-300 bg-gradient-to-b from-yellow-300 to-orange-500 text-black shadow-[0_0_12px_rgba(255,200,0,.8)]'
                      : 'border-teal-300/60 bg-gradient-to-b from-[#0f5a55] to-[#062a2a] text-teal-100'
                    }`}
                >
                  <span className="text-[10px] sm:text-xs">EX</span>
                  <span className="text-[7px] sm:text-[8px]">{extra ? 'ON' : 'OFF'}</span>
                </button>
                <button
                  onClick={() => { sfx.click(); setTurbo((t) => !t); }}
                  className={`h-7 sm:h-8 w-[50px] sm:w-[60px] rounded-full border-2 flex items-center justify-center gap-1 text-[9px] sm:text-[10px] font-black hover:scale-105 active:scale-90 transition cursor-pointer ${turbo
                      ? 'border-yellow-300 bg-gradient-to-b from-yellow-300 to-orange-500 text-black shadow-[0_0_12px_rgba(255,200,0,.8)]'
                      : 'border-teal-300/60 bg-gradient-to-b from-[#0f5a55] to-[#062a2a] text-teal-100'
                    }`}
                >
                  ⚡ TURBO
                </button>
              </div>

              {/* spin */}
              <button
                onClick={() => {
                  if (autoLeft > 0) { setAutoLeft(0); return; }
                  doSpin();
                }}
                disabled={spinning && autoLeft === 0}
                className="relative w-16 h-16 sm:w-22 sm:h-22 rounded-full active:scale-95 hover:scale-105 transition-all disabled:opacity-90 flex items-center justify-center cursor-pointer"
                style={{
                  background: autoLeft > 0
                    ? 'radial-gradient(circle at 35% 30%, #ff6b6b, #dc2626 50%, #991b1b)'
                    : 'radial-gradient(circle at 35% 30%, #9dff8a, #22b83a 50%, #0a6a1c)',
                  border: autoLeft > 0 ? '3px solid #fca5a5' : '3px solid #ffd84a',
                  boxShadow: autoLeft > 0
                    ? '0 0 0 2px #7f1d1d, 0 0 18px rgba(239,68,68,.7), 0 4px 10px rgba(0,0,0,.6)'
                    : '0 0 0 2px #7a4300, 0 0 18px rgba(80,255,110,.6), 0 4px 10px rgba(0,0,0,.6)',
                }}
              >
                {autoLeft > 0 ? (
                  <div className="flex flex-col items-center leading-none">
                    <span className="text-[9px] font-black text-white tracking-widest">STOP</span>
                    <span className="text-xl sm:text-2xl font-black text-white drop-shadow">{autoLeft}</span>
                  </div>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    className="w-8 h-8 sm:w-11 sm:h-11 text-white drop-shadow-[0_2px_2px_rgba(0,0,0,.6)]"
                    style={{ animation: spinning ? 'spinbtn 0.7s linear infinite' : 'none' }}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
                    <polyline points="20 3 20 8 15 8" />
                  </svg>
                )}
              </button>

              {/* auto */}
              <div className="relative">
                {autoMenu && (
                  <div className="absolute bottom-[58px] right-0 w-24 sm:w-26 rounded-xl border-2 border-yellow-500 bg-[#06231f] p-1 popin z-20">
                    {[10, 30, 50, 100].map((n) => (
                      <button
                        key={n}
                        className="w-full py-1 rounded-lg font-black text-xs hover:bg-yellow-500/20 text-yellow-200 cursor-pointer"
                        onClick={() => {
                          sfx.click();
                          setAutoMenu(false);
                          setAutoLeft(n);
                        }}
                      >
                        {n} Spins
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => {
                    sfx.click();
                    if (autoLeft > 0) setAutoLeft(0);
                    else setAutoMenu((a) => !a);
                  }}
                  className={`w-[48px] h-[48px] sm:w-[58px] sm:h-[58px] rounded-full border-2 flex flex-col items-center justify-center text-[8px] sm:text-[9px] font-black tracking-wide hover:scale-105 active:scale-90 transition cursor-pointer ${autoLeft > 0
                      ? 'border-yellow-300 bg-gradient-to-b from-yellow-300 to-orange-500 text-black'
                      : 'border-teal-300/60 bg-gradient-to-b from-[#0f5a55] to-[#062a2a] text-teal-100'
                    }`}
                >
                  <span className="text-base sm:text-lg leading-none">🔁</span>
                  AUTO
                </button>
              </div>
            </div>
          </div>

          {toast && (
            <div key={toast.id} className="toast absolute left-1/2 top-14 z-40 px-3 py-1.5 rounded-full bg-black/85 border border-yellow-500 text-yellow-200 text-xs font-bold whitespace-nowrap">
              {toast.msg}
            </div>
          )}
          {big && <BigWin amount={big.amount} title={big.title} onClose={() => setBig(null)} />}
        </div>
      </div>
    </div>
  );
}
