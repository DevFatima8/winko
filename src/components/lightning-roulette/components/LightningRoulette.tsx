"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMultiplayerGame } from "@/lib/useMultiplayerGame";
import { GameOverOverlay } from "@/components/GameOverOverlay";
import { LiveMultiplayerBets } from "@/components/LiveMultiplayerBets";
import type { RouletteOutcome } from "@/lib/multiplayer-rules";
import { BET_PRESETS } from "@/lib/betPresets";
import { gameSfx } from "@/lib/gameSfx";
import Wheel from "./Wheel";
import {
  SPOTS,
  SPOT_MAP,
  TABLE_H,
  TABLE_W,
  colorOf,
  totalOf,
  type Bets,
  type Lightning,
} from "../lib/roulette";
import "../lightning-roulette.css";

type Phase = "betting" | "lightning" | "spinning" | "result";

const BET_TIME = 25;
const CHIPS: number[] = [...BET_PRESETS];

const CHIP_STYLE = {
  10: { bg: "#d92d2d", text: "#ffffff" },
  20: { bg: "#d92d2d", text: "#ffffff" },
  50: { bg: "#d92d2d", text: "#ffffff" },
  100: { bg: "#18181b", text: "#f6d36b" },
  200: { bg: "#16a34a", text: "#ffffff" },
  500: { bg: "#7c3aed", text: "#ffffff" },
  1000: { bg: "#d97706", text: "#ffffff" },
} as const;

const fmt = (n: number) => n.toLocaleString("en-US");
const short = (n: number) => (n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : String(n));
const chipFor = (amount: number) => {
  let c: keyof typeof CHIP_STYLE = 10;
  for (const v of [10, 20, 50, 100, 200, 500, 1000] as const) if (amount >= v) c = v;
  return CHIP_STYLE[c];
};

const NUM_BG = {
  red: "linear-gradient(160deg,#e11d2e,#8f0b16)",
  black: "linear-gradient(160deg,#2a2a33,#050507)",
  green: "linear-gradient(160deg,#12a957,#07582c)",
};

function Chip({ amount, size = "max(15px, 3.3cqw)", glow = false }: { amount: number; size?: string; glow?: boolean }) {
  const s = chipFor(amount);
  return (
    <div
      className={`chip-token ${glow ? "chip-win" : ""}`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,.35), transparent 45%), ${s.bg}`,
        color: s.text,
        fontSize: `max(6px, calc(${size} * 0.36))`,
      }}
    >
      {short(amount)}
    </div>
  );
}

export default function LightningRoulette() {
  const live = useMultiplayerGame<RouletteOutcome>("lightning-roulette");
  const personalTable = live.state?.tableMode === "personal";
  const balance = live.state?.balance ?? 0;
  const serverRound = live.state?.round;
  const phase: Phase = !serverRound || serverRound.phase === "betting" ? "betting"
    : serverRound.phase === "running" ? live.now < serverRound.bettingEndsAt + 1200 ? "lightning" : "spinning" : "result";
  const timer = serverRound ? Math.max(0, Math.ceil((serverRound.bettingEndsAt - live.now) / 1000)) : 0;
  const activeBets = live.state?.myBets.filter((bet) => bet.status !== "cancelled") ?? [];
  const bets: Bets = {};
  for (const bet of activeBets) bets[bet.option] = (bets[bet.option] ?? 0) + bet.amount;
  const undoStack = activeBets;
  const queued = live.state?.myQueuedBets.filter((bet) => bet.status === "pending") ?? [];
  const bettingOpen = phase === "betting" && timer > 0 && !!serverRound && live.now < serverRound.bettingEndsAt;
  const editableBets = bettingOpen ? activeBets : queued;
  const editingBets: Bets = {};
  for (const bet of editableBets) editingBets[bet.option] = (editingBets[bet.option] ?? 0) + bet.amount;
  const [lastBets, setLastBets] = useState<Bets>({});
  const [chip, setChip] = useState<number>(BET_PRESETS[0]);
  const lightning: Lightning = serverRound?.result?.lightning ?? {};
  const result = phase === "result" ? serverRound?.result?.number ?? null : null;
  const spinReq = serverRound?.result && phase !== "betting" ? {
    number: serverRound.result.number, key: serverRound.roundNo,
    startedAt: serverRound.bettingEndsAt, resultAt: serverRound.resultAt, now: live.now,
  } : null;
  const history = live.state?.history.map((entry) => entry.result.number) ?? [];
  const lastWin = phase === "result" ? activeBets.reduce((sum, bet) => sum + bet.payout, 0) : 0;
  const roundWin = phase === "result" && activeBets.length && !activeBets.some(bet => bet.poolPending) ? lastWin : null;
  const [hover, setHover] = useState<number[]>([]);
  const [flash, setFlash] = useState(0);
  const [resultOpen, setResultOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const actionLock = useRef(false);
  const mounted = useRef(false);
  const settledRound = useRef<number | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const totalBet = totalOf(bets);
  const editingTotal = totalOf(editingBets);

  const submitBets = async (items: { option: string; amount: number }[]) => {
    if (actionLock.current || live.busy || !live.state || !mounted.current) return;
    if (!bettingOpen) {
      setNotice("Betting is closed. Wait for the next round to begin.");
      return;
    }
    actionLock.current = true;
    try {
      for (const item of items) {
        if (!mounted.current) break;
        const reply = await live.place(item.option, item.amount);
        if (!mounted.current) break;
        if ("error" in reply) { setNotice(reply.error); break; }
        gameSfx.chip();
      }
    } finally { actionLock.current = false; }
  };

  /* ---------------- Betting actions ---------------- */
  const placeBet = (id: string) => {
    if (!Number.isFinite(chip) || chip < 1) return setNotice("Enter a valid chip amount.");
    setNotice(null);
    void submitBets([{ option: id, amount: chip }]);
  };

  const undo = () => {
    const last = editableBets.at(-1);
    if (!live.busy && !actionLock.current && last) void live.cancel(last.roundNo, last.id);
  };

  const clearBets = () => {
    if (!live.busy && !actionLock.current && serverRound) void live.cancel(serverRound.roundNo + (bettingOpen ? 0 : 1));
  };

  const doubleBets = () => {
    void submitBets(Object.entries(editingBets).map(([option, amount]) => ({ option, amount })));
  };

  const rebet = () => {
    if (editingTotal > 0) return;
    void submitBets(Object.entries(lastBets).map(([option, amount]) => ({ option, amount })));
  };

  const playAgain = () => {
    setResultOpen(false);
    rebet();
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
        for (const bet of placed) previous[bet.option] = (previous[bet.option] ?? 0) + bet.amount;
        setLastBets(previous);
      }
      if (state.round.phase !== "result") { setResultOpen(false); return; }
      if (settledRound.current === state.round.roundNo) return;
      settledRound.current = state.round.roundNo;
      if (placed.some(bet => bet.poolPending)) {
        setResultOpen(false);
        window.dispatchEvent(new CustomEvent("wx:game-result", { detail: {
          game: "Lightning Roulette", bet: placed.reduce((sum, bet) => sum + bet.amount, 0),
          win: 0, won: false, poolPending: true, poolClaim: placed.reduce((sum, bet) => sum + (bet.poolClaim ?? 0), 0),
        } }));
        return;
      }
      setResultOpen(placed.length > 0);
      if (placed.length) {
        const stake = placed.reduce((sum, bet) => sum + bet.amount, 0);
        const payout = placed.reduce((sum, bet) => sum + bet.payout, 0);
        window.dispatchEvent(new CustomEvent("wx:game-result", { detail: {
          game: "Lightning Roulette", bet: stake, win: payout, won: payout > stake,
        } }));
      }
      if (placed.reduce((sum, bet) => sum + bet.payout - bet.amount, 0) > 0) {
        setFlash((value) => value + 1);
        gameSfx.win();
      }
    });
    return () => { active = false; };
  }, [live.state]);
  const onSettled = useCallback(() => { gameSfx.land(); }, []);

  /* ---------------- Derived ---------------- */
  const stats = useMemo(() => {
    const h = history.slice(0, 50);
    const c = { red: 0, black: 0, green: 0 };
    h.forEach((n) => c[colorOf(n)]++);
    const t = h.length || 1;
    return {
      red: Math.round((c.red / t) * 100),
      black: Math.round((c.black / t) * 100),
      green: Math.round((c.green / t) * 100),
    };
  }, [history]);

  const winningSpots = new Set(phase === "result" && result !== null
    ? Object.keys(bets).filter((id) => SPOT_MAP[id].numbers.includes(result)) : []);

  const lightningEntries = Object.entries(lightning)
    .map(([n, m]) => [Number(n), m] as const)
    .sort((a, b) => b[1] - a[1]);

  const banner =
    phase === "betting"
      ? "PLACE YOUR BETS"
      : phase === "lightning"
        ? "LIGHTNING STRIKES!"
        : phase === "spinning"
          ? "NO MORE BETS"
          : result !== null
            ? `${result} ${colorOf(result).toUpperCase()}`
            : "";

  const lastResult = history[0] ?? 0;

  return (
    <div className="lr-root text-white h-full w-full flex flex-col justify-between overflow-hidden px-1 sm:px-2 py-1 select-none">
      {flash > 0 && <div key={flash} className="lightning-flash pointer-events-none fixed inset-0 z-50" />}

      <div className="lr-grid flex-1 min-h-0 w-full overflow-hidden">
        {/* Header */}
        <header className="a-head flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="bolt-glow h-6 w-6 sm:h-8 sm:w-8" aria-hidden>
              <path d="M13.5 1 4 13.5h6.2L8.8 23 20 9.8h-6.4L13.5 1Z" fill="url(#bg1)" />
              <defs>
                <linearGradient id="bg1" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#fff3b0" />
                  <stop offset="1" stopColor="#e0a30b" />
                </linearGradient>
              </defs>
            </svg>
            <div className="leading-none">
              <div className="gold-text font-serif text-[15px] font-bold tracking-[0.16em] sm:text-[22px]">LIGHTNING</div>
              <div className="mt-0.5 text-[8px] font-semibold tracking-[0.55em] text-amber-200/80 sm:text-[10px]">ROULETTE</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] sm:gap-3 sm:text-xs">
            <details className="relative">
              <summary className={`cursor-pointer rounded-full border border-white/20 bg-black/40 px-2 py-1 ${live.error ? "text-amber-300" : ""}`}>
                Players · {live.state?.bets.filter((bet) => bet.status !== "cancelled").length ?? 0}
              </summary>
              <div className="absolute right-0 top-full z-50 mt-1 w-72 max-w-[85vw] bg-black/95">
                <LiveMultiplayerBets state={live.state} error={live.error} />
              </div>
            </details>
            <div className="hidden rounded-full border border-amber-400/30 bg-black/40 px-3 py-0.5 text-amber-100/80 sm:block">
              Max Win <span className="font-bold text-amber-300">{personalTable ? "x2 gross" : "x500"}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-red-500/40 bg-black/40 px-2.5 py-0.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
              <span className="font-semibold tracking-wider">LIVE</span>
            </div>
          </div>
        </header>

        {/* Compact strip (phones / small screens) */}
        <div className="a-strip strip">
          <div className="strip-hist">
            {history.slice(0, 16).map((n, i) => (
              <div key={`${n}-${i}`} className="hist-ball mini" style={{ background: NUM_BG[colorOf(n)] }}>
                {n}
              </div>
            ))}
          </div>
          <div className="strip-light">
            {lightningEntries.length === 0 ? (
              <span className="text-[10px] text-amber-200/60">{personalTable ? "Round return capped at 2x" : "⚡ 50x–500x"}</span>
            ) : (
              lightningEntries.map(([n, m]) => (
                <span key={n} className="light-pill">
                  <b>{n}</b>
                  <i>{m}x</i>
                </span>
              ))
            )}
          </div>
        </div>

        {/* Statistics */}
        <aside className="a-left">
          <div className="panel">
            <div className="panel-title">STATISTICS</div>
            <div className="grid grid-cols-10 gap-1 p-2.5">
              {history.slice(0, 20).map((n, i) => (
                <div key={`${n}-${i}`} className={`hist-ball ${i === 0 ? "hist-new" : ""}`} style={{ background: NUM_BG[colorOf(n)] }}>
                  {n}
                </div>
              ))}
            </div>
            <div className="space-y-2 px-3 pb-3 text-[11px] font-semibold tracking-wide">
              {(
                [
                  ["RED", stats.red, "#d81b2b"],
                  ["BLACK", stats.black, "#3b3b46"],
                  ["ZERO", stats.green, "#0f9d4f"],
                ] as const
              ).map(([label, val, color]) => (
                <div key={label}>
                  <div className="mb-1 flex justify-between text-amber-100/80">
                    <span>{label}</span>
                    <span>{val}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${val}%`, background: color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Wheel */}
        <section className="a-wheel">
          <div className={`banner ${phase === "lightning" ? "banner-storm" : ""}`}>
            <span>{banner}</span>
          </div>

          <div className="wheel-box relative" style={{ containerType: "inline-size" }}>
            <div className="wheel-glow absolute inset-[3%] rounded-full" />
            <div className="relative">
              <Wheel spin={spinReq} lightning={lightning} restNumber={lastResult} onSettled={onSettled} />

              {/* Centre display */}
              <div className="pointer-events-none absolute left-1/2 top-1/2 flex h-[27%] w-[27%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full">
                {phase === "betting" && (
                  <div className="timer-ring" style={{ ["--p" as string]: `${(timer / BET_TIME) * 100}%` }}>
                    <span className="font-bold tabular-nums" style={{ fontSize: "10cqw" }}>{timer}</span>
                  </div>
                )}
                {phase === "lightning" && (
                  <svg viewBox="0 0 24 24" className="bolt-glow h-3/4 w-3/4 animate-pulse" aria-hidden>
                    <path d="M13.5 1 4 13.5h6.2L8.8 23 20 9.8h-6.4L13.5 1Z" fill="#ffd84a" />
                  </svg>
                )}
                {phase === "result" && result !== null && (
                  <div className="result-pop flex h-full w-full items-center justify-center rounded-full border-[3px] border-amber-300 font-bold" style={{ background: NUM_BG[colorOf(result)], fontSize: "11cqw" }}>
                    {result}
                  </div>
                )}
              </div>

              {phase === "result" && roundWin !== null && roundWin > 0 && (
                <div className="win-popup absolute bottom-[4%] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-amber-300 bg-black/80 px-[5cqw] py-[1.2cqw] text-center shadow-[0_0_40px_rgba(255,200,50,.6)]">
                  <div className="font-semibold tracking-[0.35em] text-amber-200" style={{ fontSize: "max(7px, 1.8cqw)" }}>YOU WIN</div>
                  <div className="gold-text font-bold" style={{ fontSize: "max(14px, 5cqw)" }}>{fmt(roundWin)}</div>
                </div>
              )}
              {phase === "result" && roundWin === 0 && (
                <div className="win-popup absolute bottom-[4%] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/20 bg-black/75 px-[4cqw] py-[1cqw] tracking-[0.3em] text-white/70" style={{ fontSize: "max(8px, 2.2cqw)" }}>
                  BETTER LUCK NEXT SPIN
                </div>
              )}
            </div>
          </div>
        </section>

        {phase === "result" && resultOpen && roundWin !== null && (
          <GameOverOverlay key={live.state?.round.roundNo} open
            winAmount={roundWin > 0 ? roundWin : 0}
            title={roundWin > 0 ? "Congratulations! You win" : "You lose"}
            result={`${roundWin > 0 ? `YOU WIN ${fmt(roundWin)}` : ""}${result !== null ? ` · Number ${result} ${colorOf(result).toUpperCase()}` : ""}`}
            onClose={() => setResultOpen(false)} onPlayAgain={playAgain} />
        )}

        {/* Lightning panel */}
        <aside className="a-right">
          <div className="panel">
            <div className="panel-title flex items-center justify-center gap-2">
              <span className="text-amber-300">⚡</span> LIGHTNING NUMBERS
            </div>
            <div className="space-y-1.5 p-2.5">
              {lightningEntries.length === 0 ? (
                <p className="py-3 text-center text-[11px] leading-relaxed text-amber-100/50">
                  {personalTable ? "Lightning marks 1 to 5 numbers. Base boosts do not override the 2x total-stake gross cap." : <>Lightning will strike 1 to 5 lucky numbers once betting is over. Straight-up wins pay <b className="text-amber-300">50x</b> to{" "}<b className="text-amber-300">500x</b>!</>}
                </p>
              ) : (
                lightningEntries.map(([n, m], i) => (
                  <div key={n} className="lightning-row flex items-center justify-between rounded-lg border border-amber-300/50 bg-gradient-to-r from-amber-500/25 to-amber-900/10 px-3 py-1" style={{ animationDelay: `${i * 0.25}s` }}>
                    <div className="flex items-center gap-2.5">
                      <div className="hist-ball !h-8 !w-8 !text-sm" style={{ background: NUM_BG[colorOf(n)] }}>
                        {n}
                      </div>
                      <span className="text-[10px] tracking-widest text-amber-100/70">STRAIGHT UP</span>
                    </div>
                    <div className="gold-text text-lg font-extrabold">{personalTable ? `${m}x base · 2x cap` : `${m}x`}</div>
                  </div>
                ))
              )}
            </div>
            <div className="payouts">
              <div className="panel-title !text-[11px]">PAYOUTS</div>
              <ul className="divide-y divide-white/5 p-1 text-xs">
                {[
                  ["Straight Up", "35:1"],
                  ["Split", "17:1"],
                  ["Street", "11:1"],
                  ["Corner", "8:1"],
                  ["Six Line", "5:1"],
                  ["Dozen / Column", "2:1"],
                  ["Red / Black / Odd / Even", "1:1"],
                ].map(([a, b]) => (
                  <li key={a} className="flex justify-between px-3 py-1 text-amber-50/80">
                    <span>{a}</span>
                    <span className="font-bold text-amber-300">{personalTable ? "Round cap 2x" : b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>

        {/* Betting table */}
        <section className="a-table">
          <div className="table-frame">
            <div className="relative w-full" style={{ aspectRatio: `${TABLE_W} / ${TABLE_H}`, containerType: "inline-size" }}>
              {[...SPOTS].sort((a, b) => a.z - b.z).map((s) => {
                const style: React.CSSProperties = {
                  left: `${(s.x / TABLE_W) * 100}%`,
                  top: `${(s.y / TABLE_H) * 100}%`,
                  width: `${(s.w / TABLE_W) * 100}%`,
                  height: `${(s.h / TABLE_H) * 100}%`,
                  zIndex: s.z,
                };
                const bet = editingBets[s.id];
                const isMain = s.z === 1;
                const isNumber = s.kind === "straight";
                const num = isNumber ? Number(s.label) : -1;
                const lm = isNumber ? lightning[num] : undefined;
                const lit = hover.length > 0 && isNumber && hover.includes(num);
                const isWinNum = phase === "result" && result === num && isNumber;

                return (
                  <div
                    key={s.id}
                    className={`lr-spot ${isMain ? "spot-main" : "spot-hot"} cursor-pointer`}
                    style={style}
                    onClick={() => { if (bettingOpen && !live.busy) placeBet(s.id); }}
                    aria-disabled={!bettingOpen || live.busy}
                    onMouseEnter={() => setHover(s.numbers)}
                    onMouseLeave={() => setHover([])}
                  >
                    {isMain && isNumber && (
                      <div className="flex h-full w-full items-center justify-center">
                        <div
                          className={`num-oval ${lm ? "num-lightning" : ""} ${isWinNum ? "num-win" : ""}`}
                          style={{
                            background: lm ? "linear-gradient(160deg,#ffe27a,#d99a06)" : NUM_BG[colorOf(num)],
                            color: lm ? "#1b1300" : "#fff",
                            fontSize: "max(8px, 2.4cqw)",
                            aspectRatio: "1 / 1",
                            height: s.h > 1 ? "min(45%, 7.2cqw)" : "min(80%, 7cqw)",
                          }}
                        >
                          <span className="leading-none">{s.label}</span>
                          {lm && <span className="font-extrabold leading-none" style={{ fontSize: "max(5px, 1.1cqw)" }}>⚡{lm}x</span>}
                        </div>
                      </div>
                    )}
                    {isMain && !isNumber && (
                      <div className="flex h-full w-full items-center justify-center">
                        {s.id === "out-red" ? (
                          <div className="diamond" style={{ background: NUM_BG.red }} />
                        ) : s.id === "out-black" ? (
                          <div className="diamond" style={{ background: NUM_BG.black }} />
                        ) : (
                          <span className="whitespace-nowrap font-serif font-bold tracking-wider text-amber-100" style={{ fontSize: s.kind === "outside" || s.kind === "dozen" ? "max(7px, 1.6cqw)" : "max(6px, 1.4cqw)" }}>
                            {s.label}
                          </span>
                        )}
                      </div>
                    )}
                    {!isMain && hover.length > 0 && hover.length === s.numbers.length && s.numbers.every((n) => hover.includes(n)) && (
                      <div className="hot-dot" />
                    )}
                    {lit && <div className="absolute inset-0 bg-white/15" />}
                    {bet ? (
                      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
                        <Chip amount={bet} glow={winningSpots.has(s.id)} />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Control bar */}
        <footer className="a-ctrl control-bar">
          {(!bettingOpen || notice) && (
            <p role={notice ? "alert" : "status"} className="text-center text-xs text-amber-200">
              {notice ?? `Betting is closed. Wait for the next round to begin.${queued.length ? ` Previously reserved: Rs. ${fmt(editingTotal)}. Clear cancels.` : ""}`}
            </p>
          )}
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            <Stat label="BALANCE" value={`Rs. ${fmt(balance)}`} />
            <Stat label="TOTAL BET" value={`Rs. ${fmt(totalBet)}`} />
            <Stat label="WIN" value={`Rs. ${fmt(phase === "result" ? lastWin : 0)}`} gold={phase === "result" && lastWin > 0} />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2.5">
            {CHIPS.map((v) => (
              <button
                key={v}
                onClick={() => setChip(v)}
                aria-label={`Chip ${v}`}
                className={`chip-btn ${chip === v ? "chip-selected" : ""}`}
                style={{
                  background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,.4), transparent 45%), ${chipFor(v).bg}`,
                  color: chipFor(v).text,
                }}
              >
                {v}
              </button>
            ))}
            <input
              type="number"
              min={10}
              inputMode="numeric"
              value={chip || ""}
              onChange={(e) => setChip(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
              aria-label="Custom chip amount"
              placeholder="Rs."
              className="w-20 rounded-lg border border-amber-300/50 bg-black/50 px-2 py-1.5 text-xs font-bold text-amber-300 outline-none"
            />
          </div>

          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            <Btn onClick={undo} disabled={live.busy || (bettingOpen ? !undoStack.length : !queued.length)} variant="undo">
              UNDO
            </Btn>
            <Btn onClick={rebet} disabled={!bettingOpen || live.busy || totalOf(lastBets) === 0 || editingTotal > 0 || balance < totalOf(lastBets)} variant="rebet">
              REBET
            </Btn>
            <Btn onClick={doubleBets} disabled={!bettingOpen || live.busy || editingTotal === 0 || balance < editingTotal} variant="double">
              2X
            </Btn>
            <Btn onClick={clearBets} disabled={live.busy || editingTotal === 0} variant="clear">
              CLEAR
            </Btn>
            <Btn onClick={() => setNotice(`The ${personalTable ? "personal" : "shared"} wheel spins automatically when betting closes.`)} disabled={!bettingOpen} variant="spin">
              {bettingOpen ? `${timer}s` : "LIVE"}
            </Btn>
          </div>
        </footer>
      </div>

      {notice === "Insufficient balance." && balance < 1 && totalBet === 0 && phase === "betting" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80">
          <div className="panel p-8 text-center">
            <div className="gold-text mb-2 text-2xl font-bold">OUT OF FUNDS</div>
            <button className="btn-primary rounded-lg px-6 py-2 font-bold text-black" onClick={() => setNotice("Add funds from your wallet.")}>
              ADD FUNDS FROM WALLET
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="stat-box">
      <div className="stat-label">{label}</div>
      <div className={`stat-value font-bold tabular-nums ${gold ? "gold-text win-blink" : "text-white"}`}>{value}</div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  primary,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  variant?: "undo" | "rebet" | "double" | "clear" | "spin";
}) {
  const variantStyles = {
    undo: "!border-slate-500/50 !bg-gradient-to-b !from-slate-700 !to-slate-900 !text-slate-200",
    rebet: "!border-cyan-500/50 !bg-gradient-to-b !from-cyan-700 !to-cyan-950 !text-cyan-200 !shadow-[0_0_10px_rgba(6,182,212,0.25)]",
    double: "!border-indigo-500/50 !bg-gradient-to-b !from-indigo-700 !to-indigo-950 !text-indigo-200 !shadow-[0_0_10px_rgba(99,102,241,0.25)]",
    clear: "!border-rose-500/50 !bg-gradient-to-b !from-rose-700 !to-red-950 !text-rose-200 !shadow-[0_0_10px_rgba(244,63,94,0.25)]",
    spin: "!border-yellow-200 !bg-gradient-to-r !from-amber-400 !via-yellow-300 !to-amber-500 !text-black !font-black !shadow-[0_0_20px_rgba(251,191,36,0.6)] animate-pulse",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`ctl-btn active:scale-95 transition-all ${
        variant ? variantStyles[variant] : primary ? "btn-primary !text-black" : ""
      }`}
    >
      {children}
    </button>
  );
}
