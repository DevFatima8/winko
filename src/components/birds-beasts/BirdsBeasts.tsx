"use client";

import { notifyGameResult } from "@/lib/gameResultNotice";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import { QueuedWager, useRoundQueue } from "../blast-off/useRoundQueue";
import {
  ANIMALS,
  BET_SECONDS,
  RESULT_MS,
  SLOT_COUNT,
  START_BALANCE,
  START_BANNER_MS,
  TIMES_UP_MS,
  WHEEL,
  evaluateBets,
  formatMoney,
  round2,
  slotsCoveredBy,
  totalOf,
  type BetKey,
  type Bets,
} from "./lib/game-config";
import { useSounds } from "./hooks/useSounds";
import "./birds-beasts.css";
import Wheel from "./Wheel";
import BetBoard from "./BetBoard";
import ChipRail from "./ChipRail";
import HistoryStrip from "./HistoryStrip";
import RulesModal from "./RulesModal";
import type { Phase, RoundRecord } from "./types";

const LS = { balance: "bb_balance", history: "bb_history", round: "bb_round" } as const;

interface Placement {
  key: BetKey;
  amount: number;
}

interface Toast {
  id: number;
  text: string;
  kind: "info" | "error" | "win";
}

function isRecord(value: unknown): value is RoundRecord {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.round === "number" &&
    typeof v.slot === "number" &&
    typeof v.animal === "string" &&
    typeof v.totalBet === "number" &&
    typeof v.payout === "number" &&
    typeof v.net === "number"
  );
}

export default function BirdsBeasts({ backHref = "/player" }: { backHref?: string }) {
  const sounds = useSounds();

  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("betting");
  const [round, setRound] = useState(1);
  const [secondsLeft, setSecondsLeft] = useState(BET_SECONDS);
  const [showStartBanner, setShowStartBanner] = useState(true);
  const [balance] = useGameBalance("birds-beasts", START_BALANCE);
  const pool = usePoolLifecycle("birds-beasts");
  const [bets, setBetsState] = usePoolRoundState<Bets>("birds-beasts", "bets", {});
  const [lastBets, setLastBets] = useState<Bets>({});
  const [undoStack, setUndoStack] = usePoolRoundState<Placement[]>("birds-beasts", "undoStack", []);
  const [chip, setChip] = useState<number>(50);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [resultSlot, setResultSlot] = useState<number | null>(null);
  const [result, setResult] = useState<RoundRecord | null>(null);
  const [lastResult, setLastResult] = useState<RoundRecord | null>(null);
  const [history, setHistory] = useState<RoundRecord[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const betsRef = useRef<Bets>(bets);
  const roundRef = useRef(1);
  const positionRef = useRef(0);
  const targetRef = useRef(0);
  const idleRoundRef = useRef<{ round: number; id: string } | null>(null);
  const phaseRef = useRef<Phase>("betting");
  const settledRoundRef = useRef(0);
  const toastTimer = useRef<number | null>(null);
  const queue = useRoundQueue<Placement>();
  const balanceRef = useRef(balance);
  useEffect(() => { balanceRef.current = balance; }, [balance]);
  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);

  const setBets = useCallback((next: Bets) => {
    betsRef.current = next;
    setBetsState(next);
  }, []);

  const showToast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    setToast({ id: Date.now(), text, kind });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }, []);

  /* ---------- load persisted state ---------- */
  useEffect(() => {
    try {
      const h: unknown = JSON.parse(window.localStorage.getItem(LS.history) ?? "[]");
      if (Array.isArray(h)) setHistory(h.filter(isRecord).slice(0, 50));
      const r = Number(window.localStorage.getItem(LS.round));
      if (Number.isFinite(r) && r >= 1) {
        roundRef.current = Math.floor(r);
        setRound(Math.floor(r));
      }
    } catch {
      /* ignore corrupted storage */
    }
    const t = window.setTimeout(() => setReady(true), 900);
    return () => window.clearTimeout(t);
  }, []);

  /* ---------- persist ---------- */
  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(LS.balance, String(balance));
    } catch {
      /* ignore */
    }
  }, [balance, bets, ready]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(LS.history, JSON.stringify(history.slice(0, 50)));
    } catch {
      /* ignore */
    }
  }, [history, ready]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(LS.round, String(round));
    } catch {
      /* ignore */
    }
  }, [round, ready]);

  /* ---------- round state machine ---------- */
  useEffect(() => {
    if (!ready) return;
    const timers: number[] = [];
    let cancelled = false;
    const later = (fn: () => void, ms: number) => {
      timers.push(window.setTimeout(fn, ms));
    };
    const cleanup = () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };

    if (phase === "betting") {
      setSecondsLeft(BET_SECONDS);
      setShowStartBanner(true);
      later(() => setShowStartBanner(false), START_BANNER_MS);

      const endAt = Date.now() + BET_SECONDS * 1000;
      let shown = BET_SECONDS;
      const interval = window.setInterval(() => {
        const remain = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
        if (remain !== shown) {
          shown = remain;
          setSecondsLeft(remain);
          if (remain > 0 && remain <= 3) sounds.countdown();
        }
        if (remain <= 0) {
          if (pool.busy) return;
          window.clearInterval(interval);
          phaseRef.current = "closed";
          setPhase("closed");
        }
      }, 100);

      return () => {
        window.clearInterval(interval);
        cleanup();
      };
    }

    if (phase === "closed") {
      sounds.timesUp();
      const snapshot: Bets = { ...betsRef.current };
      if (totalOf(snapshot) > 0) setLastBets(snapshot);
      const pending = totalOf(snapshot) > 0
        ? pool.resolveServer({ bets: snapshot }, { holdBalance: true }).then(outcome => {
          if (!outcome) throw new Error("Server result confirmation failed. Retry before betting.");
          return (outcome as { slot: number }).slot;
        }) : (async () => {
          if (idleRoundRef.current?.round !== roundRef.current) {
            idleRoundRef.current = { round: roundRef.current, id: crypto.randomUUID() };
          }
          const response = await fetch("/api/spin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roundId: idleRoundRef.current.id }),
          });
          const outcome = await response.json();
          if (!response.ok) throw new Error(outcome.error || "Server result unavailable.");
          if (!Number.isInteger(outcome.slot) || outcome.slot < 0 || outcome.slot >= SLOT_COUNT) {
            throw new Error("Invalid server round result.");
          }
          return outcome.slot as number;
        })();
      void Promise.all([pending, new Promise<void>(resolve => later(resolve, TIMES_UP_MS))])
        .then(([slot]) => {
          if (cancelled) return;
          targetRef.current = slot;
          phaseRef.current = "spinning";
          setPhase("spinning");
        }).catch(error => {
          if (!cancelled) showToast(error instanceof Error ? error.message : "Server result unavailable.", "error");
        });
      return cleanup;
    }

    if (phase === "spinning") {
      const target = targetRef.current;
      const start = positionRef.current;
      const steps = 2 * SLOT_COUNT + ((target - start + SLOT_COUNT) % SLOT_COUNT);
      let k = 0;

      const step = () => {
        if (cancelled) return;
        k += 1;
        const pos = (start + k) % SLOT_COUNT;
        positionRef.current = pos;
        setActiveSlot(pos);
        sounds.tick();
        if (k >= steps) {
          sounds.stop();
          later(() => {
            if (!cancelled) {
              phaseRef.current = "result";
              setPhase("result");
            }
          }, 500);
          return;
        }
        const p = k / steps;
        later(step, 26 + 290 * p * p * p);
      };

      later(step, 120);
      return cleanup;
    }

    if (phase === "result") {
      const slot = positionRef.current;
      const currentRound = roundRef.current;

      if (settledRoundRef.current !== currentRound) {
        settledRoundRef.current = currentRound;
        const ev = evaluateBets(betsRef.current, slot);
        const record: RoundRecord = {
          round: currentRound,
          slot,
          animal: WHEEL[slot],
          totalBet: ev.totalBet,
          payout: ev.payout,
          net: ev.net,
          winningKeys: ev.winningKeys,
          at: Date.now(),
        };
        setResultSlot(slot);
        setResult(record);
        setLastResult(record);
        setHistory((h) => [record, ...h].slice(0, 50));
        pool.releaseBalance();

        if (ev.totalBet > 0) {
          notifyGameResult("birds-beasts", String(currentRound), ev.payout, pool.enabled);
          if (ev.net > 0) {
            if (ev.payout >= ev.totalBet * 8) sounds.bigWin();
            else sounds.win();
          } else {
            sounds.lose();
          }
        }
      }

      later(async () => {
        if (cancelled) return;
        setBets({});
        setUndoStack([]);
        const queued = queue.consume();
        if (queued) {
          if (Number.isFinite(queued.amount) && queued.amount >= 50 && queued.amount <= balanceRef.current) {
            if (!await pool.start(queued.amount)) return;
            setBets({ [queued.key]: queued.amount });
            setUndoStack([queued]);
            queue.setStatus("Bet accepted for this round");
          } else queue.setStatus("Queued bet rejected — invalid stake or insufficient balance");
        }
        setResultSlot(null);
        setActiveSlot(null);
        setResult(null);
        roundRef.current = currentRound + 1;
        setRound(roundRef.current);
        phaseRef.current = "betting";
        setPhase("betting");
      }, RESULT_MS);
      return cleanup;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, ready]);

  /* ---------- betting actions ---------- */
  const placeBet = async (key: BetKey) => {
    sounds.unlock();
    if (!Number.isFinite(chip) || chip < 50) {
      sounds.error();
      showToast("Minimum bet is Rs. 50. Please place at least Rs. 50.", "error");
      return;
    }
    if (chip > balanceRef.current) {
      sounds.error();
      showToast("Insufficient balance", "error");
      return;
    }
    if (phaseRef.current !== "betting") {
      queue.enqueue({ key, amount: chip });
      return;
    }
    pool.checkpoint({ bets: { ...betsRef.current, [key]: round2((betsRef.current[key] ?? 0) + chip) }, undoStack: [...undoStack, { key, amount: chip }] });
    if (!await pool.stake(chip)) return;
    setBets({ ...betsRef.current, [key]: round2((betsRef.current[key] ?? 0) + chip) });
    setUndoStack((s) => [...s, { key, amount: chip }]);
    sounds.chip();
  };

  const undoBet = async () => {
    if (phase !== "betting" || undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    const next: Bets = { ...betsRef.current };
    const remaining = round2((next[last.key] ?? 0) - last.amount);
    if (remaining > 0) next[last.key] = remaining;
    else delete next[last.key];
    pool.checkpoint({ bets: next, undoStack: undoStack.slice(0, -1) });
    if (!await pool.reduce(last.amount)) return;
    setBets(next);
    setUndoStack((s) => s.slice(0, -1));
    sounds.click();
  };

  const clearBets = async () => {
    if (phase !== "betting") return;
    const refund = totalOf(betsRef.current);
    if (refund <= 0) return;
    if (!await pool.refund()) return;
    setBets({});
    setUndoStack([]);
    sounds.click();
  };

  const rebet = async () => {
    if (phase !== "betting") return;
    const total = totalOf(lastBets);
    if (total <= 0) return;
    if (total < 50) {
      sounds.error();
      showToast("Minimum bet is Rs. 50. Please place at least Rs. 50.", "error");
      return;
    }
    if (total > balanceRef.current) {
      sounds.error();
      showToast("Insufficient balance for rebet", "error");
      return;
    }
    const next: Bets = { ...betsRef.current };
    const added: Placement[] = [];
    for (const [key, amount] of Object.entries(lastBets) as [BetKey, number | undefined][]) {
      if (!amount) continue;
      next[key] = round2((next[key] ?? 0) + amount);
      added.push({ key, amount });
    }
    pool.checkpoint({ bets: next, undoStack: [...undoStack, ...added] });
    if (!await pool.stake(total)) return;
    setBets(next);
    setUndoStack((s) => [...s, ...added]);
    sounds.chip();
  };

  const doubleBets = async () => {
    if (phase !== "betting") return;
    const total = totalOf(betsRef.current);
    if (total <= 0) return;
    if (total > balanceRef.current) {
      sounds.error();
      showToast("Insufficient balance to double", "error");
      return;
    }
    const next: Bets = {};
    const added: Placement[] = [];
    for (const [key, amount] of Object.entries(betsRef.current) as [BetKey, number | undefined][]) {
      if (!amount) continue;
      next[key] = round2(amount * 2);
      added.push({ key, amount });
    }
    pool.checkpoint({ bets: next, undoStack: [...undoStack, ...added] });
    if (!await pool.stake(total)) return;
    setBets(next);
    setUndoStack((s) => [...s, ...added]);
    sounds.chip();
  };

  const toggleMute = () => {
    sounds.unlock();
    sounds.setMuted(!sounds.muted);
  };

  const coveredSlots = useMemo(() => {
    const set = new Set<number>();
    for (const [key, amount] of Object.entries(bets) as [BetKey, number | undefined][]) {
      if (amount) slotsCoveredBy(key).forEach((i) => set.add(i));
    }
    return set;
  }, [bets]);

  const totalBet = totalOf(bets);
  const locked = phase !== "betting";

  /* ---------- splash ---------- */
  if (!ready) {
    return (
      <main className="flex h-full w-full flex-1 min-h-0 flex-col items-center justify-center gap-3 px-6 text-center select-none bg-[#071a13]">
        <div className="splash-ring" />
        <h1 className="font-display text-gold text-2xl sm:text-3xl font-bold tracking-wide">Birds &amp; Beasts</h1>
        <p className="text-xs sm:text-sm uppercase tracking-[0.3em] text-emerald-200/70">Loading game…</p>
      </main>
    );
  }

  return (
    <main className="game-root relative flex h-full w-full     flex-1 min-h-0 flex-col overflow-y-auto overflow-x-hidden lg:overflow-hidden select-none bg-[#071a13] [-webkit-overflow-scrolling:touch]">
      {/* ---------- top header bar ---------- */}
      <header
        className="flex h-9 sm:h-10 shrink-0 items-center justify-between border-b px-2 sm:px-3 z-30"
        style={{ background: "rgba(4, 26, 18, 0.95)", borderColor: "rgba(255, 255, 255, 0.1)" }}
      >
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <Link
            href={backHref}
            title="Back / Exit"
            className="flex h-6.5 w-6.5 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] active:bg-[#991b1b] border border-[#ef4444] text-white shadow-md active:translate-y-[1px] transition-all cursor-pointer"
          >
            <span className="text-xs sm:text-sm font-black">←</span>
          </Link>

          <div className="relative h-7 w-8 sm:h-8 sm:w-9 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/animals/eagle.png" alt="" className="absolute left-0 top-0 h-6 w-6 sm:h-7 sm:w-7 rounded-full object-cover ring-2 ring-sky-400" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/animals/lion.png" alt="" className="absolute bottom-0 right-0 h-6 w-6 sm:h-7 sm:w-7 rounded-full object-cover ring-2 ring-rose-400" />
          </div>

          <div className="min-w-0 leading-none">
            <h1 className="font-display text-gold whitespace-nowrap text-xs sm:text-sm md:text-base font-bold tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
              Birds &amp; Beasts
            </h1>
            <span className="block whitespace-nowrap text-[8px] sm:text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-200/60">
              Round #{round}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <div className="balance-pill !h-6.5 sm:!h-7 !text-[11px] sm:!text-xs">
            <span className="coin !h-4.5 !w-4.5 !text-[8px] font-black">Rs.</span>
            <span className="tabular-nums font-bold">{formatMoney(balance)}</span>
          </div>

          <button
            type="button"
            onClick={toggleMute}
            className="icon-btn !h-6.5 !w-6.5 sm:!h-7 sm:!w-7 hover:border-emerald-400 hover:bg-emerald-600/40 hover:text-white transition cursor-pointer"
            aria-label={sounds.muted ? "Unmute" : "Mute"}
          >
            {sounds.muted ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3 3-3-1.4-1.4-3 3-3-3L10.7 9l3 3-3 3 1.4 1.4 3-3 3 3 1.4-1.4-3-3z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06A9 9 0 0 0 14 3.23z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            className="icon-btn !h-6.5 !w-6.5 sm:!h-7 sm:!w-7 hover:border-blue-400 hover:bg-blue-600/40 hover:text-white transition cursor-pointer"
            aria-label="Rules"
          >
            <span className="font-display text-xs sm:text-sm font-bold">?</span>
          </button>
        </div>
      </header>

      {/* ---------- main interactive workspace ---------- */}
      <div className="flex flex-none lg:flex-1 lg:min-h-0 w-full lg:overflow-hidden flex-col lg:flex-row gap-2 lg:gap-4 p-1.5 pb-24 sm:p-2 sm:pb-24 lg:pb-2">
        {/* LEFT: WHEEL + HISTORY */}
        <section className="relative flex flex-col items-center justify-between min-h-0 shrink-0 lg:shrink lg:flex-1 lg:max-w-[48%] xl:max-w-[46%]">
          <div className="relative h-[min(78vw,320px)] flex-none lg:h-auto lg:flex-1 lg:min-h-[130px] lg:max-h-[calc(100%-52px)] w-full flex items-center justify-center select-none">
            <Wheel
              phase={phase}
              secondsLeft={secondsLeft}
              round={round}
              activeSlot={activeSlot}
              resultSlot={resultSlot}
              result={result}
              showStartBanner={showStartBanner}
              coveredSlots={coveredSlots}
            />
          </div>

          <div className="w-full shrink-0 max-w-[480px]">
            <HistoryStrip history={history} />
          </div>

          {toast && (
            <div
              key={toast.id}
              className={`toast ${toast.kind === "error" ? "toast-error" : toast.kind === "win" ? "toast-win" : ""}`}
              role="status"
            >
              {toast.text}
            </div>
          )}
        </section>

        {/* RIGHT: BETTING CONSOLE */}
        <section className="flex flex-none lg:flex-1 lg:min-h-0 flex-col justify-between lg:overflow-hidden max-w-[620px] w-full mx-auto gap-1.5 lg:gap-0">
          <div className="shrink-0 mb-0.5 sm:mb-1 flex items-center justify-between px-1">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-200/70">
              {phase === "betting" ? "Place your bets" : phase === "closed" ? "Time's up" : phase === "spinning" ? "Good luck!" : "Result"}
            </span>
            <span className="text-[10px] sm:text-[11px] font-semibold text-white/60">
              Total bet: <span className="text-gold font-bold tabular-nums">{formatMoney(totalBet)} Rs.</span>
            </span>
          </div>

          <div className="flex-none lg:flex-1 lg:min-h-0 flex flex-col justify-center">
            <BetBoard
              bets={bets}
              phase={phase}
              winningKeys={result?.winningKeys ?? []}
              resultAnimal={result?.animal ?? null}
              onBet={placeBet}
            />
            <QueuedWager {...queue} />
          </div>

          <div className="shrink-0">
            <ChipRail
              selected={chip}
              locked={locked}
              canUndo={undoStack.length > 0}
              canClear={totalBet > 0}
              canRebet={totalOf(lastBets) > 0}
              canDouble={totalBet > 0}
              onSelect={(value) => {
                sounds.unlock();
                sounds.click();
                setChip(value);
              }}
              onUndo={undoBet}
              onClear={clearBets}
              onRebet={rebet}
              onDouble={doubleBets}
            />
          </div>

          <div className="panel shrink-0 mt-1 sm:mt-1.5 grid grid-cols-3 divide-x divide-white/10 py-1 sm:py-1.5 text-center">
            <Stat label="Total Bet" value={formatMoney(totalBet)} />
            <Stat
              label={pool.enabled ? "Provisional claim" : "Last Win"}
              value={lastResult && lastResult.payout > 0 ? `+${formatMoney(lastResult.payout)}` : "—"}
              tone={lastResult && lastResult.payout > 0 ? "win" : "default"}
            />
            <Stat label="Last Result" value={lastResult ? ANIMALS[lastResult.animal].name : "—"} />
          </div>
        </section>
      </div>

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </main>
  );
}

function Stat({
  label,
  value,
  tone = "default",
  capitalize = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "win";
  capitalize?: boolean;
}) {
  return (
    <div className="flex flex-col items-center px-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">{label}</span>
      <span
        className={`font-display truncate text-base font-bold tabular-nums ${tone === "win" ? "text-emerald-300" : "text-white"} ${capitalize ? "capitalize" : ""
          }`}
      >
        {value}
      </span>
    </div>
  );
}
