"use client";

import { useEffect, useRef, useState } from "react";
import { GameOverOverlay } from "@/components/GameOverOverlay";
import { useGameBalance, usePoolLifecycle } from "@/lib/walletSync";
import BetPanel, { type AutoConfig } from "./BetPanel";
import Board from "./Board";
import PayTable from "./PayTable";
import TopBar from "./TopBar";
import { cn } from "@/lib/cn";
import {
  MAX_PICKS,
  formatMoney,
  formatMultiplier,
  getMultiplier,
  playRound,
  randomSelection,
  type HistoryEntry,
  type RiskLevel,
  type RoundOutcome,
} from "@/lib/keno";
import { setMuted, sfx } from "../../lib/sound";
import "../../keno.css";

const START_BALANCE = 10000;
const STORAGE_KEY = "keno.game.v1";

type Stats = {
  bets: number;
  wins: number;
  losses: number;
  wagered: number;
  profit: number;
};

const DEFAULT_STATS: Stats = { bets: 0, wins: 0, losses: 0, wagered: 0, profit: 0 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const SPEEDS: Record<AutoConfig["speed"], number> = {
  normal: 240,
  fast: 55,
  turbo: 22,
};
const PAUSE: Record<AutoConfig["speed"], number> = {
  normal: 430,
  fast: 180,
  turbo: 45,
};

export default function KenoGame() {
  const [balance, setBalance] = useGameBalance("keno", START_BALANCE);
  const pool = usePoolLifecycle("keno");
  const [selected, setSelected] = useState<number[]>([3, 11, 17, 26, 34]);
  const [risk, setRisk] = useState<RiskLevel>("classic");
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [bet, setBet] = useState("10.00");
  const [auto, setAuto] = useState<AutoConfig>({
    numberOfBets: "25",
    onWinReset: true,
    onWinPercent: "0",
    onLossReset: true,
    onLossPercent: "0",
    stopOnProfit: "0",
    stopOnLoss: "0",
    speed: "fast",
  });

  const [drawn, setDrawn] = useState<number[]>([]);
  const [revealIndex, setRevealIndex] = useState(0);
  const [result, setResult] = useState<RoundOutcome | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoProgress, setAutoProgress] = useState({ played: 0, profit: 0 });
  const [muted, setMutedState] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [bigWin, setBigWin] = useState<{ multiplier: number; profit: number } | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const [resultOpen, setResultOpen] = useState(false);

  const busyRef = useRef(false);
  const autoRef = useRef(false);
  const balanceRef = useRef(balance);
  const stateRef = useRef({ selected, risk, bet, auto });
  const idRef = useRef(1);

  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  useEffect(() => {
    stateRef.current = { selected, risk, bet, auto };
  });

  // hydrate persisted state
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          balance?: number;
          selected?: number[];
          risk?: RiskLevel;
          bet?: string;
          history?: HistoryEntry[];
          stats?: Stats;
          muted?: boolean;
        };
        if (Array.isArray(saved.selected) && saved.selected.length) {
          setSelected(saved.selected.slice(0, MAX_PICKS));
        }
        if (
          saved.risk === "classic" ||
          saved.risk === "low" ||
          saved.risk === "medium" ||
          saved.risk === "high"
        ) {
          setRisk(saved.risk);
        }
        if (typeof saved.bet === "string" && saved.bet) setBet(saved.bet);
        if (Array.isArray(saved.history)) setHistory(saved.history.slice(0, 24));
        if (saved.stats) setStats({ ...DEFAULT_STATS, ...saved.stats });
        if (typeof saved.muted === "boolean") {
          setMutedState(saved.muted);
          setMuted(saved.muted);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  // persist
  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          balance,
          selected,
          risk,
          bet,
          history: history.slice(0, 24),
          stats,
          muted,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [balance, selected, risk, bet, history, stats, muted]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!bigWin) return;
    const t = setTimeout(() => setBigWin(null), 2400);
    return () => clearTimeout(t);
  }, [bigWin]);

  const picks = selected.length;
  const betValue = Math.max(0, Number(bet) || 0);
  const topMultiplier = picks > 0 ? getMultiplier(risk, picks, picks) : 0;
  const profitOnWin = betValue * topMultiplier - betValue;
  const canBet = picks > 0 && betValue > 0 && betValue <= balance && !busy;

  function toggleTile(tile: number) {
    if (autoRef.current) return;
    sfx.select();
    setSelected((current) => {
      if (current.includes(tile)) return current.filter((t) => t !== tile);
      if (current.length >= MAX_PICKS) {
        setError(`You can only pick ${MAX_PICKS} tiles`);
        return current;
      }
      setError(null);
      return [...current, tile].sort((a, b) => a - b);
    });
  }

  function autoPick() {
    if (autoRef.current) return;
    sfx.click();
    setSelected(randomSelection());
    setError(null);
  }

  function clearPicks() {
    if (autoRef.current) return;
    sfx.click();
    setSelected([]);
  }

  function clampBet(value: number) {
    return Math.max(0.01, Math.round(value * 100) / 100);
  }

  function validate(amount: number): string | null {
    if (stateRef.current.selected.length === 0) return "Select at least 1 tile";
    if (!amount || amount <= 0) return "Enter a bet amount";
    if (amount > balanceRef.current) return "Insufficient balance";
    return null;
  }

  async function reveal(outcome: RoundOutcome, speed: AutoConfig["speed"]) {
    setDrawn(outcome.drawn);
    setRevealIndex(0);
    const perBall = SPEEDS[speed];
    for (let i = 1; i <= outcome.drawn.length; i++) {
      await sleep(perBall);
      setRevealIndex(i);
      const tile = outcome.drawn[i - 1];
      if (stateRef.current.selected.includes(tile)) sfx.hit();
      else sfx.ball(i);
    }
    await sleep(speed === "turbo" ? 40 : 180);
  }

  async function runBet(amount: number, speed: AutoConfig["speed"]) {
    const picksNow = stateRef.current.selected;
    const riskNow = stateRef.current.risk;
    const outcome = playRound(picksNow, riskNow, amount);
    pool.plan(Math.round(outcome.payout * 100) / 100, outcome);

    busyRef.current = true;
    setBusy(true);
    if (!await pool.start(amount, () => setBalance((b) => Math.round((b - amount) * 100) / 100))) { busyRef.current = false; setBusy(false); return; }
    setResult(null);
    setBigWin(null);
    await reveal(outcome, speed);

    const roundedPayout = Math.round(outcome.payout * 100) / 100;
    if (!await pool.complete(roundedPayout, () => { if (roundedPayout > 0) setBalance((b) => Math.round((b + roundedPayout) * 100) / 100); })) { busyRef.current = false; setBusy(false); return; }

    const entry: HistoryEntry = {
      id: idRef.current++,
      multiplier: outcome.multiplier,
      bet: amount,
      payout: roundedPayout,
      profit: Math.round((roundedPayout - amount) * 100) / 100,
      win: outcome.win,
      hits: outcome.hits,
      picks: picksNow.length,
      risk: riskNow,
      drawn: outcome.drawn,
      selected: picksNow,
    };

    setResult({ ...outcome, payout: roundedPayout });
    setHistory((h) => [entry, ...h].slice(0, 24));
    setStats((s) => ({
      bets: s.bets + 1,
      wins: s.wins + (outcome.win ? 1 : 0),
      losses: s.losses + (outcome.win ? 0 : 1),
      wagered: Math.round((s.wagered + amount) * 100) / 100,
      profit: Math.round((s.profit + entry.profit) * 100) / 100,
    }));

    if (outcome.multiplier >= 10) {
      sfx.jackpot();
      setBigWin({ multiplier: outcome.multiplier, profit: entry.profit });
    } else if (outcome.win) {
      sfx.win();
    } else {
      sfx.lose();
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("wx:game-result", {
          detail: {
            game: "Keno",
            bet: amount,
            win: pool.enabled ? 0 : roundedPayout,
            won: outcome.win,
            poolPending: pool.enabled,
            poolClaim: roundedPayout,
          },
        })
      );
    }

    busyRef.current = false;
    setBusy(false);
    return { ...outcome, payout: roundedPayout, profit: entry.profit };
  }

  async function handleBet() {
    if (busyRef.current || autoRef.current) return;
    const amount = Math.round((Number(bet) || 0) * 100) / 100;
    const problem = validate(amount);
    if (problem) {
      setError(problem);
      sfx.lose();
      return;
    }
    setError(null);
    sfx.click();
    setResultOpen(false);
    await runBet(amount, "normal");
    setResultOpen(true);
  }

  async function startAuto() {
    if (autoRef.current || busyRef.current) return;
    const cfg = stateRef.current.auto;
    const base = Math.round((Number(stateRef.current.bet) || 0) * 100) / 100;
    const problem = validate(base);
    if (problem) {
      setError(problem);
      return;
    }

    autoRef.current = true;
    setAutoRunning(true);
    setError(null);
    setAutoProgress({ played: 0, profit: 0 });

    const maxBets = Math.max(0, Math.floor(Number(cfg.numberOfBets) || 0));
    const stopProfit = Math.max(0, Number(cfg.stopOnProfit) || 0);
    const stopLoss = Math.max(0, Number(cfg.stopOnLoss) || 0);
    let current = base;
    let played = 0;
    let profit = 0;

    try {
      while (autoRef.current) {
        if (maxBets > 0 && played >= maxBets) break;
        if (stateRef.current.selected.length === 0) {
          setError("Select at least 1 tile");
          break;
        }
        if (current > balanceRef.current) {
          setError("Insufficient balance — autobet stopped");
          break;
        }

        const outcome = await runBet(current, cfg.speed);
        if (!outcome) { setError("Wager confirmation failed — autobet stopped"); break; }
        played += 1;
        profit = Math.round((profit + outcome.profit) * 100) / 100;
        setAutoProgress({ played, profit });

        if (outcome.win) {
          current =
            cfg.onWinReset || !Number(cfg.onWinPercent)
              ? base
              : clampBet(current * (1 + Number(cfg.onWinPercent) / 100));
        } else {
          current =
            cfg.onLossReset || !Number(cfg.onLossPercent)
              ? base
              : clampBet(current * (1 + Number(cfg.onLossPercent) / 100));
        }
        setBet(current.toFixed(2));

        if (stopProfit > 0 && profit >= stopProfit) break;
        if (stopLoss > 0 && profit <= -stopLoss) break;

        await sleep(PAUSE[cfg.speed]);
      }
    } finally {
      autoRef.current = false;
      setAutoRunning(false);
    }
  }

  function stopAuto() {
    autoRef.current = false;
    setAutoRunning(false);
  }

  function resetGame() {
    setStats(DEFAULT_STATS);
    setHistory([]);
    setResult(null);
    setDrawn([]);
    setRevealIndex(0);
    setBigWin(null);
    setToast("Stats and history reset.");
    setWalletOpen(false);
  }

  const broke = balance < 0.01 && !busy && !autoRunning;

  return (
    <div className="h-full w-full flex flex-col justify-between overflow-hidden bg-[#1a2c38] px-1 sm:px-2.5 py-1 select-none">
      <TopBar
        balance={balance}
        muted={muted}
        onToggleMute={() => {
          const next = !muted;
          setMutedState(next);
          setMuted(next);
          if (!next) sfx.click();
        }}
        onWallet={() => setWalletOpen(true)}
      />

      <main className="mx-auto w-full max-w-[1180px] flex-1 min-h-0 flex flex-col overflow-hidden px-1 sm:px-2 pt-1">
        <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden rounded-lg bg-[#0f212e] shadow-[0_18px_50px_rgba(0,0,0,0.45)] flex flex-col">
          <div className="flex flex-col lg:flex-row shrink-0 lg:shrink lg:flex-1 lg:min-h-0">
            <div className="border-b border-[#2f4553] lg:border-b-0 lg:border-r shrink-0">
              <BetPanel
                mode={mode}
                onModeChange={setMode}
                bet={bet}
                onBetChange={(v) => {
                  setBet(v);
                  setError(null);
                }}
                onHalve={() => setBet(clampBet((Number(bet) || 0) / 2).toFixed(2))}
                onDouble={() => setBet(clampBet((Number(bet) || 0) * 2).toFixed(2))}
                onMax={() => setBet(Math.max(0, balance).toFixed(2))}
                risk={risk}
                onRiskChange={(r) => {
                  setRisk(r);
                  sfx.click();
                }}
                picks={picks}
                profitOnWin={profitOnWin}
                canBet={canBet}
                busy={busy || autoRunning}
                autoRunning={autoRunning}
                onBet={handleBet}
                onStartAuto={startAuto}
                onStopAuto={stopAuto}
                auto={auto}
                onAutoChange={(patch) => setAuto((a) => ({ ...a, ...patch }))}
                error={error}
              />
            </div>

            <div className="relative flex flex-1 flex-col items-center justify-between gap-2 bg-[#1a2c38] p-2 sm:p-4 lg:min-h-0 lg:overflow-hidden">
              <div className="flex h-8 w-full max-w-[560px] items-center justify-between gap-2 shrink-0">
                {busy && drawn.length > 0 ? (
                  <div className="flex items-center gap-2 rounded-md bg-[#0f212e] px-2.5 py-1 text-xs font-bold text-[#b1c2cf]">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[#00e701]" />
                    Drawing {revealIndex}/{drawn.length}
                  </div>
                ) : null}
                {!busy && result ? (
                  <div
                    className={cn(
                      "keno-chip-in flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-bold",
                      result.win
                        ? "bg-[#00e701]/15 text-[#00e701]"
                        : "bg-[#ed3333]/10 text-[#ff6b6b]",
                    )}
                  >
                    <span>
                      {result.hits}/{picks} hits
                    </span>
                    <span className="opacity-60">•</span>
                    <span>{formatMultiplier(result.multiplier)}</span>
                    <span className="opacity-60">•</span>
                    <span>
                      {result.profit >= 0 ? `+Rs. ${formatMoney(result.profit)}` : "No win"}
                    </span>
                  </div>
                ) : !busy ? (
                  <span className="text-xs font-semibold text-[#6f8f9f]">
                    Pick 1-{MAX_PICKS} tiles, then hit Bet
                  </span>
                ) : null}
                <span className="shrink-0 rounded bg-[#0f212e] px-2 py-0.5 text-[11px] font-bold text-[#b1c2cf]">
                  {picks}/{MAX_PICKS} picked
                </span>
              </div>

              {drawn.length > 0 ? (
                <div className="flex w-full max-w-[560px] shrink-0 flex-wrap items-center justify-center gap-1">
                  {drawn.slice(0, revealIndex).map((n, i) => {
                    const hit = selected.includes(n);
                    return (
                      <span
                        key={`${n}-${i}`}
                        className={cn(
                          "keno-ball-in flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black tabular-nums sm:h-7 sm:w-7 sm:text-xs",
                          hit
                            ? "bg-[#ffcd3c] text-[#05212d] ring-2 ring-white"
                            : "bg-[#b1c2cf] text-[#0f212e]",
                        )}
                      >
                        {n}
                      </span>
                    );
                  })}
                </div>
              ) : null}

              <div className="w-full flex-1 lg:min-h-0 flex items-center justify-center">
                <Board
                  selected={selected}
                  drawn={drawn}
                  revealIndex={revealIndex}
                  locked={busy || autoRunning}
                  onToggle={toggleTile}
                />
              </div>

              <div className="flex w-full max-w-[560px] flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={autoPick}
                  disabled={busy || autoRunning}
                  className="rounded-lg bg-gradient-to-r from-cyan-600/40 to-blue-600/40 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/20 hover:from-cyan-500/50 hover:to-blue-500/50 transition-all active:scale-95 disabled:opacity-50"
                >
                  Auto Pick
                </button>
                <button
                  type="button"
                  onClick={clearPicks}
                  disabled={busy || autoRunning}
                  className="rounded-lg bg-gradient-to-r from-rose-600/30 to-red-600/30 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-rose-300 border border-rose-500/40 shadow-sm shadow-rose-500/20 hover:from-rose-500/40 hover:to-red-500/40 transition-all active:scale-95 disabled:opacity-50"
                >
                  Clear
                </button>
                <div className="ml-auto flex items-center gap-1.5">
                  {history.slice(0, 5).map((entry) => (
                    <span
                      key={entry.id}
                      className={cn(
                        "keno-chip-in rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums",
                        entry.win
                          ? "bg-[#00e701]/15 text-[#00e701] border border-emerald-500/30"
                          : "bg-[#ed3333]/10 text-[#ff6b6b] border border-red-500/20",
                      )}
                    >
                      {formatMultiplier(entry.multiplier)}
                    </span>
                  ))}
                </div>
              </div>

              {bigWin ? (
                <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
                  <div className="keno-chip-in rounded-xl bg-[#0f212e]/90 px-8 py-5 text-center ring-2 ring-[#00e701]">
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#00e701]">
                      {pool.enabled ? "Provisional claim" : "Big Win"}
                    </p>
                    <p className="mt-1 font-mono text-4xl font-black text-white">
                      {formatMultiplier(bigWin.multiplier)}
                    </p>
                    <p className="mt-1 font-mono text-sm font-bold text-[#00e701]">
                      {pool.enabled ? `Claim Rs. ${formatMoney(result?.payout ?? 0)}` : `+Rs. ${formatMoney(bigWin.profit)}`}
                    </p>
                  </div>
                </div>
              ) : null}

              {resultOpen && result && !busy && !autoRunning ? (
                <GameOverOverlay open
                  winAmount={result.win ? Math.max(0, result.profit) : 0}
                  title={pool.enabled ? "Round complete" : result.win ? "Congratulations! You win" : "You lose"}
                  result={`${result.hits}/${picks} hits · ${formatMultiplier(result.multiplier)} · ${pool.enabled ? `Daily payout pending · Claim Rs. ${formatMoney(result.payout)}` : result.profit >= 0 ? `+Rs. ${formatMoney(result.profit)}` : "You lose"}`}
                  onClose={() => setResultOpen(false)} />
              ) : null}

              {broke ? (
                <div className="absolute inset-0 z-20 grid place-items-center bg-[#0f212e]/85 p-6">
                  <div className="text-center">
                    <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#ff6b6b]">
                      Out of chips
                    </p>
                    <p className="mt-2 text-xs text-[#b1c2cf]">
                      Your balance hit Rs. 0.00.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-[#2f4553] p-3 sm:p-4 xl:w-[254px] xl:border-l xl:border-t-0">
              <PayTable
                risk={risk}
                picks={picks}
                lastHits={result ? result.hits : null}
                lastWin={result ? result.win : false}
              />
            </div>
          </div>

          {/* footer strip */}
          <div className="flex flex-col gap-3 border-t border-[#2f4553] bg-[#0f212e] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#6f8f9f]">
                Recent
              </span>
              {history.length === 0 ? (
                <span className="text-[11px] text-[#6f8f9f]">No bets yet</span>
              ) : (
                history.slice(0, 16).map((entry) => (
                  <span
                    key={entry.id}
                    title={`${entry.hits}/${entry.picks} hits • ${entry.risk} • ${entry.win ? "Win" : "No win"
                      }`}
                    className={cn(
                      "keno-chip-in flex h-7 min-w-9 items-center justify-center rounded-full px-2 font-mono text-[10px] font-bold tabular-nums",
                      entry.win
                        ? "bg-[#00e701]/15 text-[#00e701]"
                        : "bg-[#ed3333]/10 text-[#ff6b6b]",
                    )}
                  >
                    {formatMultiplier(entry.multiplier)}
                  </span>
                ))
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
              <Stat label="Bets" value={String(stats.bets)} />
              <Stat label="Wins" value={String(stats.wins)} />
              <Stat
                label="Wagered"
                value={`Rs. ${formatMoney(stats.wagered)}`}
              />
              <Stat
                label={pool.enabled ? "Game net (not paid)" : "Profit"}
                value={stats.profit >= 0 ? `+Rs. ${formatMoney(stats.profit)}` : "No win"}
                tone={stats.profit > 0 ? "win" : stats.profit < 0 ? "lose" : "flat"}
              />
            </div>
          </div>
        </div>

        {autoRunning ? (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-[#0f212e] px-4 py-3 text-xs font-semibold text-[#b1c2cf] ring-1 ring-[#2f4553]">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#00e701]" />
              Autobet running — {autoProgress.played} bets
            </span>
            <span
              className={cn(
                "font-mono",
                autoProgress.profit >= 0 ? "text-[#00e701]" : "text-[#ff6b6b]",
              )}
            >
              {autoProgress.profit >= 0 ? `${pool.enabled ? "Game net (not paid): " : ""}+Rs. ${formatMoney(autoProgress.profit)}` : "No win"}
            </span>
          </div>
        ) : null}

        <p className="mt-4 text-center text-[11px] leading-relaxed text-[#6f8f9f]">
          Keno — 40 tiles, 10 drawn, 1-10 picks, 4 risk levels.
        </p>
      </main>

      {toast ? (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-md bg-[#0f212e] px-4 py-2.5 text-xs font-bold text-white shadow-[0_10px_30px_rgba(0,0,0,0.5)] ring-1 ring-[#2f4553]">
          {toast}
        </div>
      ) : null}

      {walletOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={() => setWalletOpen(false)}
        >
          <div
            className="w-full max-w-[360px] rounded-lg bg-[#0f212e] p-5 ring-1 ring-[#2f4553]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-[0.12em] text-white">
                Wallet
              </h2>
              <button
                type="button"
                onClick={() => setWalletOpen(false)}
                className="grid h-7 w-7 place-items-center rounded text-[#b1c2cf] hover:bg-[#1a2c38] hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 rounded-md bg-[#1a2c38] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#6f8f9f]">
                Balance
              </p>
              <p className="font-mono text-2xl font-black text-[#00e701]">
                Rs. {formatMoney(balance)}
              </p>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={resetGame}
                className="rounded-md bg-[#1a2c38] py-2.5 text-sm font-bold text-[#b1c2cf] transition-colors hover:text-white"
              >
                Reset stats & history
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "flat",
}: {
  label: string;
  value: string;
  tone?: "win" | "lose" | "flat";
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[#6f8f9f]">{label}</span>
      <span
        className={cn(
          "font-mono font-bold tabular-nums",
          tone === "win" ? "text-[#00e701]" : tone === "lose" ? "text-[#ff6b6b]" : "text-white",
        )}
      >
        {value}
      </span>
    </span>
  );
}
