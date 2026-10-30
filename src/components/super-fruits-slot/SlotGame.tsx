"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameBalance, usePoolLifecycle } from "@/lib/walletSync";
import { notifyGameResult } from "@/lib/gameResultNotice";
import { BET_PRESETS } from "@/lib/betPresets";
import BetAmountInput from "@/components/BetAmountInput";
import { FRUITS, LINES, fruitOf, type FruitId, type SpinResult } from "./lib/slots";
import { sfx, setMuted } from "./lib/sound";
import ParticleCanvas, { burst } from "./Particles";
import "./super-fruits.css";

// ─── machine geometry (px) ───
const CELL_W = 88;
const CELL_H = 80;
const GAP = 8;
const PAD = 6; // decorative reel rows above/below the visible 3
const GRID_W = CELL_W * 3 + GAP * 2; // 280
const GRID_H = CELL_H * 3; // 240
const DUR = [850, 1150, 1450]; // ms per reel

const BETS: number[] = [...BET_PRESETS];
const START_BALANCE = 1000;
const KEY_BAL = "super-fruits-balance";
const KEY_MUTE = "super-fruits-muted";

const fmt = (n: number) => n.toLocaleString("en-US");
const cx = (i: number) => (i % 3) * (CELL_W + GAP) + CELL_W / 2;
const cy = (i: number) => Math.floor(i / 3) * CELL_H + CELL_H / 2;
const randFruit = (): FruitId => FRUITS[Math.floor(Math.random() * FRUITS.length)].id;

function isServerSpin(value: unknown): value is SpinResult & { payout: number } {
  return typeof value === "object" && value !== null &&
    "grid" in value && Array.isArray(value.grid) && value.grid.length === 9 &&
    value.grid.every(id => FRUITS.some(fruit => fruit.id === id)) &&
    "winFruit" in value && (value.winFruit === null || FRUITS.some(fruit => fruit.id === value.winFruit)) &&
    "winLine" in value && (value.winLine === null ||
      typeof value.winLine === "number" && Number.isInteger(value.winLine) && value.winLine >= 0 && value.winLine < LINES.length) &&
    "payout" in value && typeof value.payout === "number" && Number.isFinite(value.payout) && value.payout >= 0;
}

// ─── inline SVG icons (no emoji in buttons) ───
const CoinIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <circle cx="12" cy="12" r="10" fill="#ffd54a" stroke="#8a5a00" strokeWidth="1.6" />
    <circle cx="12" cy="12" r="7" fill="none" stroke="#c98a10" strokeWidth="1.2" />
    <polygon
      points="12,8.2 12.9,10.7 15.6,10.9 13.6,12.6 14.2,15.2 12,13.8 9.8,15.2 10.4,12.6 8.4,10.9 11.1,10.7"
      fill="#a86e00"
    />
  </svg>
);

const SpeakerIcon = ({ muted, className = "w-5 h-5" }: { muted: boolean; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none" />
    {muted ? (
      <>
        <line x1="16" y1="9" x2="22" y2="15" />
        <line x1="22" y1="9" x2="16" y2="15" />
      </>
    ) : (
      <>
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9.5 9.5 0 0 1 0 13" />
      </>
    )}
  </svg>
);

const InfoIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="11" x2="12" y2="16.5" />
    <circle cx="12" cy="7.5" r="0.6" fill="currentColor" />
  </svg>
);

const StarIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <polygon
      points="12,2 14.9,8.6 22,9.3 16.7,14.2 18.2,21.2 12,17.5 5.8,21.2 7.3,14.2 2,9.3 9.1,8.6"
      fill="#ffd54a"
      stroke="#8a5a00"
      strokeWidth="1"
    />
  </svg>
);

const PlusIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const MinusIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const FLOATY: { e: string; x: string; y: string; s: number; d: number }[] = [
  { e: "🍒", x: "4%", y: "12%", s: 54, d: 0 },
  { e: "🍋", x: "82%", y: "8%", s: 46, d: 0.8 },
  { e: "🍉", x: "88%", y: "62%", s: 58, d: 1.6 },
  { e: "🍇", x: "6%", y: "68%", s: 50, d: 2.2 },
  { e: "🍊", x: "78%", y: "86%", s: 44, d: 1.1 },
  { e: "⭐", x: "12%", y: "88%", s: 40, d: 0.5 },
  { e: "🍒", x: "48%", y: "4%", s: 36, d: 2.8 },
];

export default function SlotGame() {
  const [screen, setScreen] = useState<"start" | "game">("start");
  const [balance] = useGameBalance("super-fruits", START_BALANCE);
  const pool = usePoolLifecycle("super-fruits");
  const [loaded, setLoaded] = useState(false);
  const [bet, setBet] = useState(100);
  const [grid, setGrid] = useState<FruitId[]>(["melon", "cherry", "lemon", "star", "grape", "orange", "lemon", "orange", "cherry"]);
  const [strips, setStrips] = useState<FruitId[][]>([]);
  const [spinId, setSpinId] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [win, setWin] = useState<{ line: number; fruit: FruitId; amount: number; big: boolean } | null>(null);
  const [lastWin, setLastWin] = useState(0);
  const [stats, setStats] = useState({ spins: 0, wins: 0, biggest: 0 });
  const [muted, setMutedState] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [broke, setBroke] = useState(false);
  const [shake, setShake] = useState<"" | "sm" | "lg">("");
  const [balanceFlash, setBalanceFlash] = useState(false);

  const timers = useRef<number[]>([]);
  const tickRef = useRef<number | null>(null);
  const balanceRef = useRef(balance);
  balanceRef.current = balance;
  const gridBox = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const mounted = useRef(true);

  const later = useCallback((fn: () => void, ms: number) => {
    const t = window.setTimeout(fn, ms);
    timers.current.push(t);
  }, []);

  // load persisted state
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY_MUTE) === "1") {
        setMutedState(true);
        setMuted(true);
      }
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(KEY_BAL, String(balance));
    } catch {
      /* ignore */
    }
  }, [balance, loaded]);

  useEffect(() => {
    setMuted(muted);
    try {
      localStorage.setItem(KEY_MUTE, muted ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [muted]);

  useEffect(
    () => {
      mounted.current = true;
      return () => {
        mounted.current = false;
        timers.current.forEach((t) => clearTimeout(t));
        if (tickRef.current !== null) clearInterval(tickRef.current);
      };
    },
    []
  );

  const start = () => {
    sfx.unlock();
    sfx.click();
    setScreen("game");
  };

  const doSpin = useCallback(async () => {
    if (busyRef.current) return;
    const pre = balanceRef.current;
    if (pre < bet) {
      setBroke(true);
      return;
    }
    sfx.unlock();
    sfx.click();
    busyRef.current = true;

    if (!await pool.start(bet)) { busyRef.current = false; return; }
    const res = await pool.resolveServer({});
    if (!isServerSpin(res)) {
      busyRef.current = false;
      if (res !== null) window.dispatchEvent(new CustomEvent("wx:wallet-error", {
        detail: { error: "Spin result could not be verified. Please reopen the game." },
      }));
      return;
    }
    if (!mounted.current) return;
    const amount = res.payout;
    const noticeId = crypto.randomUUID();
    setWin(null);
    setLastWin(0);
    setBalanceFlash(false);

    const s: FruitId[][] = [[], [], []];
    for (let c = 0; c < 3; c++) {
      const col: FruitId[] = [];
      for (let r = 0; r < PAD; r++) col.push(randFruit());
      col.push(res.grid[c], res.grid[c + 3], res.grid[c + 6]);
      for (let r = 0; r < PAD; r++) col.push(randFruit());
      s[c] = col;
    }
    setStrips(s);
    setSpinId((id) => id + 1);
    setSpinning(true);

    tickRef.current = window.setInterval(() => {
      if (!busyRef.current) return;
      sfx.tick();
    }, 110);

    DUR.forEach((d, i) => {
      later(() => {
        sfx.stop();
        if (i === 1) {
          setShake("sm");
          later(() => setShake(""), 350);
        }
      }, d * 0.8);
    });

    later(async () => {
      if (tickRef.current !== null) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      notifyGameResult("super-fruits", noticeId, amount, pool.enabled);
      busyRef.current = false;
      setGrid(res.grid);
      setSpinning(false);
      setStats((st) => ({
        spins: st.spins + 1,
        wins: st.wins + (amount > 0 ? 1 : 0),
        biggest: Math.max(st.biggest, amount),
      }));

      if (amount > 0) {
        setBalanceFlash(true);
        setLastWin(amount);
        setWin({ line: res.winLine!, fruit: res.winFruit!, amount, big: amount >= bet * 3.5 });
        const rect = gridBox.current?.getBoundingClientRect();
        if (rect) {
          const mx = rect.left + rect.width / 2;
          const my = rect.top + rect.height / 2;
          burst({ x: mx, y: my, count: 28, shape: "coin", colors: ["#ffd54a", "#ffb300", "#fff2b0"], power: 6.5 });
          burst({ x: mx, y: my, count: 16, shape: "spark", colors: ["#ffe27a", "#fff7cf"], power: 4 });
        }
        if (winBig(amount, bet)) {
          burst({
            x: window.innerWidth / 2,
            y: -10,
            count: 70,
            shape: "confetti",
            colors: ["#ff2e4d", "#43e0ff", "#2dff8e", "#ffd54a", "#b06bff"],
            power: 9,
          });
          sfx.big();
          setShake("lg");
          later(() => setShake(""), 620);
        } else {
          sfx.win();
        }
        later(() => setBalanceFlash(false), 900);
      } else {
        sfx.lose();
      }

      const finalBal = pre - bet + amount;
      if (finalBal < BETS[0]) {
        later(() => setBroke(true), 1500);
      }
    }, DUR[2] * 0.8 + 180);
  }, [bet, later]);

  const winBig = (amount: number, b: number) => amount >= b * 3.5;

  const incBet = () => {
    if (spinning) return;
    sfx.click();
    setBet(BETS.find((b) => b > bet) ?? BETS[BETS.length - 1]);
  };
  const decBet = () => {
    if (spinning) return;
    sfx.click();
    setBet([...BETS].reverse().find((b) => b < bet) ?? BETS[0]);
  };
  const maxBet = () => {
    if (spinning) return;
    sfx.click();
    setBet([...BETS].reverse().find((b) => b <= balanceRef.current) ?? BETS[0]);
  };

  const winLine = win ? LINES[win.line] : null;

  return (
    <div className="super-fruits-game relative h-full w-full overflow-hidden bg-[#0b0417] text-white select-none rounded-2xl flex flex-col justify-between items-center px-1 sm:px-3 py-1">
      <div className="bg-casino absolute inset-0" />
      <div className="bg-dots absolute inset-0 opacity-50" />
      <ParticleCanvas />

      {/* ══════════════ START SCREEN ══════════════ */}
      {screen === "start" && (
        <div className="relative z-10 flex h-full min-h-0 flex-1 flex-col items-center justify-center px-4 py-2">
          {FLOATY.map((f, i) => (
            <span
              key={i}
              className="floaty pointer-events-none absolute text-5xl"
              style={{ left: f.x, top: f.y, animationDelay: `${f.d}s`, fontSize: f.s }}
            >
              {f.e}
            </span>
          ))}

          <div className="mb-2 flex items-center gap-3">
            <StarIcon className="h-6 w-6 -rotate-12" />
            <span className="rounded-full border border-[#4b2d85] bg-[#180a2e]/80 px-3 py-1 text-[10px] font-bold tracking-[0.3em] text-[#b7a6d9]">
              FRUIT SLOTS
            </span>
            <StarIcon className="h-6 w-6 rotate-12" />
          </div>

          <h1 className="font-display title-super -rotate-2 text-[48px] sm:text-[70px] leading-none">SUPER</h1>
          <h1 className="font-display title-gold -rotate-2 text-[56px] sm:text-[80px] leading-none">FRUITS</h1>
          <p className="mt-2 text-[10px] sm:text-xs font-bold tracking-[0.35em] text-[#8f7bb8]">3×3 REELS · 5 PAYLINES · MATCH 3</p>

          <div className="mt-4 flex items-end gap-2.5">
            {FRUITS.map((f, i) => (
              <span key={f.id} className="bounce-fruit text-4xl sm:text-5xl" style={{ animationDelay: `${i * 0.14}s` }}>
                {f.emoji}
              </span>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-2 rounded-2xl border border-[#3d2566] bg-[#150a2b]/90 px-4 py-2">
            <CoinIcon className="h-5 w-5" />
            <div className="leading-tight">
              <div className="text-[8px] font-bold tracking-[0.3em] text-[#8f7bb8]">BALANCE</div>
              <div className="font-display text-xl text-[#ffd54a]">{fmt(balance)}</div>
            </div>
          </div>

          <button onClick={start} className="btn-gold font-display mt-5 px-10 py-3 text-3xl">
            PLAY
          </button>
        </div>
      )}

      {/* ══════════════ GAME SCREEN ══════════════ */}
      {screen === "game" && (
        <div
          className={`relative z-10 mx-auto flex w-full max-w-[420px] flex-1 min-h-0 flex-col items-center justify-between px-2 py-1 ${
            shake === "sm" ? "shake-sm" : shake === "lg" ? "shake-lg" : ""
          }`}
        >
          {/* top HUD */}
          <div className="flex w-full items-center justify-between">
            <div
              className={`flex items-center gap-2 rounded-xl border bg-[#150a2b]/90 px-3 py-1.5 transition-colors ${
                balanceFlash ? "border-[#2dff8e] shadow-[0_0_18px_rgba(45,255,142,0.45)]" : "border-[#3d2566]"
              }`}
            >
              <CoinIcon />
              <div className="leading-tight">
                <div className="text-[9px] font-bold tracking-[0.28em] text-[#8f7bb8]">BALANCE</div>
                <div className={`font-display text-lg leading-none ${balanceFlash ? "text-[#2dff8e]" : "text-[#ffd54a]"}`}>
                  Rs. {fmt(balance)}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  sfx.click();
                  setMutedState((m) => !m);
                }}
                className="hud-btn"
                aria-label="Toggle sound"
              >
                <SpeakerIcon muted={muted} />
              </button>
              <button
                onClick={() => {
                  sfx.click();
                  setShowPay(true);
                }}
                className="hud-btn"
                aria-label="Paytable"
              >
                <InfoIcon />
              </button>
            </div>
          </div>

          {/* title */}
          <div className="mt-2 flex items-center gap-2">
            <StarIcon className="h-4 w-4" />
            <h1 className="font-display title-gold text-3xl leading-none">SUPER FRUITS</h1>
            <StarIcon className="h-4 w-4" />
          </div>

          {/* machine */}
          <div ref={gridBox} className="machine-panel relative mt-1 sm:mt-2 p-2 sm:p-3 origin-center scale-[0.85] sm:scale-100">
            <div className="relative flex gap-2" style={{ width: GRID_W, height: GRID_H }}>
              {[0, 1, 2].map((c) => (
                <div key={c} className="reel-window">
                  {spinning && strips[c] ? (
                    <div key={spinId} className="reel-strip spin" style={{ animationDuration: `${DUR[c]}ms` }}>
                      {strips[c].map((f, j) => (
                        <div key={j} className="reel-cell">
                          {fruitOf(f).emoji}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="reel-strip">
                      {[0, 1, 2].map((r) => (
                        <div key={r} className="reel-cell">
                          {fruitOf(grid[c + r * 3]).emoji}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="reel-shade" />
                </div>
              ))}

              {/* winning cell rings */}
              {win && !spinning && winLine &&
                winLine.map((i) => (
                  <div
                    key={i}
                    className="win-ring absolute z-10"
                    style={{ left: cx(i) - CELL_W / 2, top: cy(i) - CELL_H / 2, width: CELL_W, height: CELL_H }}
                  />
                ))}

              {/* payline */}
              {win && !spinning && winLine && (
                <svg
                  className="pointer-events-none absolute inset-0 z-20"
                  width={GRID_W}
                  height={GRID_H}
                  viewBox={`0 0 ${GRID_W} ${GRID_H}`}
                >
                  <defs>
                    <linearGradient id="wgl" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0" stopColor="#ffd54a" />
                      <stop offset="0.5" stopColor="#fff3c4" />
                      <stop offset="1" stopColor="#ffd54a" />
                    </linearGradient>
                    <filter id="wglow" x="-60%" y="-60%" width="220%" height="220%">
                      <feGaussianBlur stdDeviation="4" result="b" />
                      <feMerge>
                        <feMergeNode in="b" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <line
                    x1={cx(winLine[0])}
                    y1={cy(winLine[0])}
                    x2={cx(winLine[2])}
                    y2={cy(winLine[2])}
                    stroke="url(#wgl)"
                    strokeWidth="7"
                    strokeLinecap="round"
                    filter="url(#wglow)"
                    className="winline"
                  />
                  <circle cx={cx(winLine[0])} cy={cy(winLine[0])} r="7" fill="#fff3c4" filter="url(#wglow)" />
                  <circle cx={cx(winLine[2])} cy={cy(winLine[2])} r="7" fill="#fff3c4" filter="url(#wglow)" />
                </svg>
              )}
            </div>
          </div>

          {/* win display */}
          <div className="mt-1 sm:mt-2 flex h-8 sm:h-10 w-full items-center justify-center rounded-xl border border-[#3d2566] bg-[#150a2b]/80">
            <span className="mr-3 text-[10px] font-bold tracking-[0.3em] text-[#8f7bb8]">{pool.enabled ? "DAILY PAYOUT PENDING · CLAIM" : "WIN"}</span>
            <span className={`font-display text-lg sm:text-xl leading-none ${lastWin > 0 ? "text-[#2dff8e]" : "text-[#5a4680]"}`}>
              {pool.enabled ? fmt(lastWin) : lastWin > 0 ? `+${fmt(lastWin)}` : "—"}
            </span>
          </div>

          {/* bet controls */}
          <div className="mt-1.5 sm:mt-2.5 flex w-full items-center justify-center gap-2">
            <button onClick={decBet} disabled={spinning || bet <= BETS[0]} className="bet-btn" aria-label="Decrease bet">
              <MinusIcon className="h-5 w-5" />
            </button>
            <div className="flex min-w-[95px] items-center justify-center gap-1.5 rounded-xl border border-[#3d2566] bg-[#150a2b] px-3 py-1 sm:py-1.5">
              <span className="text-[10px] font-bold tracking-[0.25em] text-[#8f7bb8]">BET</span>
              <span className="font-display text-lg sm:text-xl leading-none text-[#ffd54a]">Rs. {bet}</span>
            </div>
            <button onClick={incBet} disabled={spinning || bet >= BETS[BETS.length - 1]} className="bet-btn" aria-label="Increase bet">
              <PlusIcon className="h-5 w-5" />
            </button>
            <button onClick={maxBet} disabled={spinning} className="bet-btn max-btn font-display text-sm">
              MAX
            </button>
          </div>
          <div className="mt-1.5 flex w-full flex-wrap items-center justify-center gap-1.5">
            {BETS.map((b) => (
              <button
                key={b}
                type="button"
                disabled={spinning}
                onClick={() => {
                  sfx.click();
                  setBet(b);
                }}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${bet === b ? "border-[#ffd54a] bg-[#ffd54a] text-black" : "border-[#3d2566] bg-[#150a2b] text-[#ffd54a]"}`}
              >
                {b}
              </button>
            ))}
            <BetAmountInput value={bet} onChange={setBet} disabled={spinning} max={Math.max(1, Math.floor(balance))} className="w-28" />
          </div>

          {/* spin */}
          <button
            onClick={doSpin}
            disabled={spinning || balance < bet}
            className="spin-btn font-display mt-2 sm:mt-3 w-full"
          >
            {spinning ? "SPINNING" : "SPIN"}
          </button>

          {/* stats */}
          <div className="mt-1 sm:mt-2 text-[9px] sm:text-[10px] font-semibold tracking-[0.22em] text-[#8f7bb8]">
            SPINS {fmt(stats.spins)}&nbsp;&nbsp;·&nbsp;&nbsp;WINS {fmt(stats.wins)}&nbsp;&nbsp;·&nbsp;&nbsp;BEST +
            {fmt(stats.biggest)}
          </div>
        </div>
      )}

      {/* ══════════════ WIN POPUP ══════════════ */}
      {win && !spinning && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
          <div className="win-pop flex flex-col items-center px-8 py-5">
            <div className={`font-display ${win.big ? "bigwin-text text-6xl" : "gold-text text-5xl"}`}>
              {pool.enabled ? "PROVISIONAL CLAIM" : win.big ? "BIG WIN!" : "WIN!"}
            </div>
            <div className="my-1 text-5xl drop-shadow-[0_0_14px_rgba(255,213,74,0.6)]">{fruitOf(win.fruit).emoji}</div>
            <div className="font-display text-4xl text-[#2dff8e] drop-shadow-[0_2px_0_rgba(0,60,20,0.8)]">
              +{fmt(win.amount)}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ PAYTABLE MODAL ══════════════ */}
      {showPay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm"
          onClick={() => setShowPay(false)}
        >
          <div
            className="win-pop w-full max-w-[320px] rounded-2xl border border-[#4b2d85] bg-[#180a2e] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-display gold-text text-center text-2xl">PAYTABLE</div>
            <p className="mb-3 mt-1 text-center text-[11px] text-[#8f7bb8]">3 matching fruits on a line pay:</p>
            <div className="space-y-2">
              {FRUITS.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between rounded-lg border border-[#3d2566] bg-[#150a2b] px-3 py-2"
                >
                  <span className="text-2xl">{f.emoji}</span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#b7a6d9]">{f.name}</span>
                  <span className="font-display text-lg text-[#ffd54a]">×{f.pay}</span>
                </div>
              ))}
            </div>
            <button
              className="btn-gold font-display mt-4 w-full py-2.5 text-xl"
              onClick={() => {
                sfx.click();
                setShowPay(false);
              }}
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      {/* ══════════════ OUT OF COINS MODAL ══════════════ */}
      {broke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-6 backdrop-blur-sm">
          <div className="win-pop w-full max-w-[320px] rounded-2xl border border-[#4b2d85] bg-[#180a2e] p-6 text-center">
            <div className="text-5xl">🪙</div>
            <div className="font-display gold-text mt-2 text-3xl">OUT OF Rs.</div>
            <p className="mt-2 text-xs leading-relaxed text-[#8f7bb8]">
              Your balance is below this wager. Choose a smaller bet to continue.
            </p>
            <button onClick={() => setBroke(false)} className="btn-gold font-display mt-5 w-full py-3 text-2xl">
              CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
