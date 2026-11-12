"use client";
import { useLiveTable } from "../teen-patti/useLiveTable";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import "./teen-patti-faceoff.css";
import { cn } from "./lib/cn";
import { sound } from "./lib/sound";
import {
  EMPTY_BETS,
  EMPTY_STATS,
  MIN_BET,
  dealForTarget,
  type BetSpotId,
  type Bets,
  type Card,
  type RoundOutcome,
  type SessionStats,
  formatChips,
  isBetsEmpty,
  settle,
  totalBet,
} from "./lib/teenpatti";
import { BetSpot } from "./BetSpot";
import { Chip, CHIP_VALUES } from "./Chip";
import { HistoryPanel, type HistoryEntry } from "./HistoryPanel";
import { InfoModal } from "./InfoModal";
import { CardSlot, PlayingCard } from "./PlayingCard";

type Phase = "betting" | "dealing" | "reveal" | "result";

const START_BALANCE = 10000;
const BET_SECONDS = 10;
const DEAL_STEP = 300;
const FLIP_STEP = 750;
const FLIP_START = 520;
const REVEAL_HOLD = 1500;
const RESULT_HOLD = 4600;

const STORAGE_KEY = "teenpatti-faceoff:v1";

interface SavedState {
  balance?: number;
  stats?: SessionStats;
  history?: HistoryEntry[];
  muted?: boolean;
}

interface DealRecord {
  handA: Card[];
  handB: Card[];
}

export function GameTable() {
  /* ---------------------------- state ---------------------------- */
  const [balance] = useGameBalance("teen-patti-faceoff", START_BALANCE);
  const pool = usePoolLifecycle("teen-patti-faceoff");
  const [bets, setBets] = usePoolRoundState<Bets>("teen-patti-faceoff", "bets", { ...EMPTY_BETS });
  const [betStack, setBetStack] = usePoolRoundState<{ spot: BetSpotId; amount: number }[]>("teen-patti-faceoff", "betStack", []);
  const [lastBets, setLastBets] = useState<Bets | null>(null);
  const [selectedChip, setSelectedChip] = useState<number>(100);
  const [phase, setPhase] = useState<Phase>("betting");
  const [secondsLeft, setSecondsLeft] = useState(BET_SECONDS);
  const [deal, setDeal] = useState<DealRecord | null>(null);
  const [outcome, setOutcome] = useState<RoundOutcome | null>(null);
  const [dealtCount, setDealtCount] = useState(0);
  const [revealedCount, setRevealedCount] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [stats, setStats] = useState<SessionStats>({ ...EMPTY_STATS });
  const [muted, setMuted] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [winPopup, setWinPopup] = useState<{ amount: number; key: number } | null>(null);
  const [roundId, setRoundId] = useState(1);

  /* ---------------------------- refs ---------------------------- */
  const timers = useRef<number[]>([]);
  const betsRef = useRef<Bets>(bets);
  const statsRef = useRef<SessionStats>(stats);
  const roundStarted = useRef(false);
  const flashTimer = useRef<number | null>(null);
  const live = useLiveTable({
    queueNextRound: false,
    phase, balance, draft: bets, targets: Object.keys(EMPTY_BETS), prepaid: true, autoStart: false,
    start: () => startRound(),
    apply: async (b) => {
      pool.checkpoint({ bets: b });
      if (totalBet(b) > 0 && !await pool.stake(totalBet(b))) return;
      setBets(b);
      betsRef.current = b;
      setBetStack((Object.keys(b) as BetSpotId[]).filter((spot) => b[spot] > 0).map((spot) => ({ spot, amount: b[spot] })));
    },
  });

  useEffect(() => {
    betsRef.current = bets;
  }, [bets]);
  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(() => () => {
    clearTimers();
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, [clearTimers]);

  const notify = useCallback((message: string) => {
    setFlash(message);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1800);
  }, []);

  /* ------------------------ persistence ------------------------ */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as SavedState;
        if (saved.stats) setStats({ ...EMPTY_STATS, ...saved.stats });
        if (Array.isArray(saved.history)) setHistory(saved.history.slice(0, 30));
        if (typeof saved.muted === "boolean") setMuted(saved.muted);
      }
    } catch {
      /* ignore corrupt storage */
    }
    setLastBets(null);
  }, []);

  useEffect(() => {
    const payload: SavedState = { balance, stats, history, muted };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* storage may be unavailable */
    }
  }, [balance, stats, history, muted]);

  useEffect(() => {
    sound.setMuted(muted);
  }, [muted]);

  /* ------------------------- bet actions ------------------------- */
  const canBet = phase === "betting" && secondsLeft > 0;

  const placeBet = useCallback(
    async (spot: BetSpotId) => {
      if (phase !== "betting" || secondsLeft <= 0) return;
      sound.unlock();
      const amount = Math.min(selectedChip, balance);
      if (amount <= 0) {
        notify("Insufficient balance.");
        return;
      }
      pool.checkpoint({ bets: { ...bets, [spot]: bets[spot] + amount }, betStack: [...betStack, { spot, amount }] });
      if (!await pool.stake(amount)) return;
      setBets((prev) => ({ ...prev, [spot]: prev[spot] + amount }));
      setBetStack((prev) => [...prev, { spot, amount }]);
      sound.play("chip");
    },
    [balance, bets, betStack, notify, phase, secondsLeft, selectedChip],
  );

  const undoBet = useCallback(async () => {
    if (phase !== "betting" || betStack.length === 0) return;
    const last = betStack[betStack.length - 1];
    if (!last) return;
    pool.checkpoint({ bets: { ...bets, [last.spot]: Math.max(0, bets[last.spot] - last.amount) }, betStack: betStack.slice(0, -1) });
    if (!await pool.reduce(last.amount)) return;
    setBetStack((stack) => stack.slice(0, -1));
    setBets((prev) => ({ ...prev, [last.spot]: Math.max(0, prev[last.spot] - last.amount) }));
    sound.play("click");
  }, [betStack, phase]);

  const clearBets = useCallback(async () => {
    if (phase !== "betting") return;
    const total = totalBet(bets);
    if (total > 0 && !await pool.refund()) return;
    setBets({ ...EMPTY_BETS });
    setBetStack([]);
    sound.play("click");
  }, [bets, phase]);

  const doubleBets = useCallback(async () => {
    if (phase !== "betting") return;
    const total = totalBet(bets);
    if (total === 0) {
      notify("Place a bet first");
      return;
    }
    if (total > balance) {
      notify("Not enough chips to double");
      return;
    }
    pool.checkpoint({ bets: Object.fromEntries(Object.entries(bets).map(([spot, amount]) => [spot, amount * 2])) });
    if (!await pool.stake(total)) return;
    setBets((prev) => {
      const next = { ...prev };
      (Object.keys(next) as BetSpotId[]).forEach((spot) => {
        next[spot] = next[spot] * 2;
      });
      return next;
    });
    setBetStack((stack) => [...stack, ...stack]);
    sound.play("chip");
  }, [balance, bets, notify, phase]);

  const rebet = useCallback(async () => {
    if (phase !== "betting" || !lastBets) return;
    const total = totalBet(lastBets);
    if (total === 0) return;
    if (total > balance) {
      notify("Not enough chips to repeat");
      return;
    }
    pool.checkpoint({ bets: { ...lastBets } });
    if (!await pool.stake(total)) return;
    setBets({ ...lastBets });
    setBetStack(
      (Object.keys(lastBets) as BetSpotId[])
        .filter((spot) => lastBets[spot] > 0)
        .map((spot) => ({ spot, amount: lastBets[spot] })),
    );
    sound.play("chip");
  }, [balance, lastBets, notify, phase]);

  /* --------------------------- round --------------------------- */
  const finishRound = useCallback(async (result: RoundOutcome) => {
    const played = result.totalStake > 0;
    if (played) pool.announce();
    const entry: HistoryEntry = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      winner: result.winner,
      handLabel: result.winner === "A" ? result.evalA.label : result.winner === "B" ? result.evalB.label : result.evalA.label,
      wagered: result.totalStake,
      net: result.net,
      playerWon: result.playerWon,
      played,
    };

    setHistory((prev) => [entry, ...prev].slice(0, 30));
    setStats((prev) => {
      const next: SessionStats = { ...prev };
      if (played) {
        next.rounds = prev.rounds + 1;
        next.wagered = prev.wagered + result.totalStake;
        next.returned = prev.returned + result.totalReturned;
        if (result.totalReturned > result.totalStake) next.wins = prev.wins + 1;
        else if (Math.abs(result.totalReturned - result.totalStake) < 0.01) next.pushes = prev.pushes + 1;
        else next.losses = prev.losses + 1;
      }
      return next;
    });


    if (played) {
      if (result.net > 0) {
        setWinPopup({ amount: result.net, key: Date.now() });
        const big = result.net >= result.totalStake * 5;
        sound.play(big ? "bigwin" : "win");
      } else if (Math.abs(result.net) < 0.01) {
        sound.play("push");
      } else {
        sound.play("lose");
      }
    }

    setPhase("result");
    after(RESULT_HOLD, () => {
      setPhase("betting");
      setSecondsLeft(BET_SECONDS);
      setDeal(null);
      setOutcome(null);
      setDealtCount(0);
      setRevealedCount(0);
      setWinPopup(null);
      setBets({ ...EMPTY_BETS });
      setBetStack([]);
      setRoundId((prev) => prev + 1);
      roundStarted.current = false;
    });
  }, [after]);

  const startRound = useCallback(async () => {
    if (pool.busy) return;
    if (roundStarted.current) return;
    if (!live.begin()) return;
    roundStarted.current = true;
    clearTimers();
    setPhase("dealing");

    const activeBets = betsRef.current;
    const result = totalBet(activeBets) > 0
      ? await pool.resolveServer({ bets: activeBets }) as (RoundOutcome & { payout: number }) | null
      : (() => { const round = dealForTarget(activeBets, "lose"); return settle(round.handA, round.handB, activeBets); })();
    if (!result) { roundStarted.current = false; live.release(); setSecondsLeft(BET_SECONDS); setPhase("betting"); return; }
    const round = result;

    if (totalBet(activeBets) > 0) setLastBets({ ...activeBets });
    setDeal({ handA: round.handA, handB: round.handB });
    setOutcome(result);
    setDealtCount(0);
    setRevealedCount(0);
    setWinPopup(null);
    setPhase("dealing");

    for (let i = 0; i < 6; i += 1) {
      after(280 + i * DEAL_STEP, () => {
        setDealtCount(i + 1);
        sound.play("card");
      });
    }
    for (let i = 0; i < 6; i += 1) {
      after(280 + 6 * DEAL_STEP + FLIP_START + i * FLIP_STEP, () => {
        setRevealedCount(i + 1);
        sound.play("flip");
      });
    }
    const revealAt = 280 + 6 * DEAL_STEP + FLIP_START + 6 * FLIP_STEP + 250;
    after(revealAt, () => setPhase("reveal"));
    after(revealAt + REVEAL_HOLD, () => finishRound(result));
  }, [after, clearTimers, finishRound]);

  /* countdown */
  useEffect(() => {
    if (phase !== "betting") return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) return 0;
        if (prev <= 3) sound.play("tickUrgent");
        else if (prev <= 6) sound.play("tick");
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "betting" && secondsLeft <= 0 && !roundStarted.current) {
      startRound();
    }
  }, [phase, secondsLeft, startRound]);

  /* keyboard shortcuts */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      const key = event.key.toLowerCase();
      if (key === "u") undoBet();
      else if (key === "c") clearBets();
      else if (key === "d") doubleBets();
      else if (key === "r") rebet();
      else if (key === " " && phase === "betting") {
        event.preventDefault();
        startRound();
      } else if (key === "m") setMuted((prev) => !prev);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearBets, doubleBets, phase, rebet, startRound, undoBet]);

  /* --------------------------- derived --------------------------- */
  const totalStake = useMemo(() => totalBet(bets), [bets]);
  const cards = useMemo(() => {
    if (!deal) return [];
    return [
      deal.handA[0] ?? null,
      deal.handB[0] ?? null,
      deal.handA[1] ?? null,
      deal.handB[1] ?? null,
      deal.handA[2] ?? null,
      deal.handB[2] ?? null,
    ];
  }, [deal]);

  const hand = (which: "A" | "B"): (Card | null)[] => {
    const indexes = which === "A" ? [0, 2, 4] : [1, 3, 5];
    return indexes.map((index) => cards[index] ?? null);
  };

  const revealPhase = phase === "reveal" || phase === "result";
  const winnerHand = revealPhase && outcome ? outcome.winner : null;

  const spotOutcome = (spot: BetSpotId) =>
    revealPhase && outcome ? outcome.spots.find((entry) => entry.spot === spot) ?? null : null;

  const statusText =
    phase === "betting"
      ? secondsLeft > 0
        ? "PLACE YOUR BETS"
        : "NO MORE BETS"
      : phase === "dealing"
        ? "DEALING…"
        : phase === "reveal"
          ? "REVEALING CARDS"
          : outcome && outcome.totalStake > 0
            ? pool.enabled ? "DAILY PAYOUT PENDING" : outcome.net > 0
              ? pool.enabled ? "PROVISIONAL CLAIM" : "YOU WIN"
              : Math.abs(outcome.net) < 0.01
                ? "BETS RETURNED"
                : ""
            : "ROUND COMPLETE";

  const progress = secondsLeft / BET_SECONDS;

  /* --------------------------- render --------------------------- */
  return (
    <div className="tp-faceoff flex h-full min-h-0 w-full shrink-0 flex-col overflow-x-hidden overflow-y-auto bg-[#05090c] px-1 sm:px-2 md:px-3 select-none">
      {live.controls}
      {/* top bar */}
      <header className="z-30 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-gradient-to-b from-[#0d141c] to-[#070c11] px-2 py-1.5 sm:px-4 sm:py-2 rounded-b-xl">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-amber-300/50 bg-gradient-to-b from-amber-300 to-amber-600 text-base font-black text-black shadow sm:h-9 sm:w-9 sm:text-lg">
            ♠
          </div>
          <div className="min-w-0">
            <h1 className="tp-gold-text truncate text-[13px] font-black uppercase leading-none tracking-[0.06em] sm:text-lg">
              Teen Patti Face Off
            </h1>
            <div className="mt-0.5 flex items-center gap-2 text-[8px] uppercase tracking-[0.16em] text-white/40 sm:text-[10px]">
              <span className="flex items-center gap-1 text-rose-400">
                <span className="tp-blink inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
                Live
              </span>
              <span className="hidden sm:inline">Table TY-204</span>
              <span>#{roundId}</span>
            </div>
          </div>
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <span className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] uppercase tracking-widest text-white/50">
            Min Rs. {formatChips(MIN_BET)} · Max Rs. {formatChips(Math.floor(balance))}
          </span>
          <div className="flex items-center gap-3 rounded-md border border-white/10 bg-black/40 px-3 py-1 text-[10px] uppercase tracking-widest text-white/50">
            <span>A {history.filter((h) => h.winner === "A").length}</span>
            <span>B {history.filter((h) => h.winner === "B").length}</span>
            <span>T {history.filter((h) => h.winner === "TIE").length}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="flex flex-col items-end rounded-lg border border-amber-300/30 bg-black/50 px-2.5 py-0.5 sm:px-3">
            <span className="text-[8px] uppercase tracking-[0.18em] text-amber-200/60 sm:text-[9px]">Balance</span>
            <span className="tp-nums text-sm font-black leading-none text-amber-200 sm:text-base">
              Rs. {formatChips(balance)}
            </span>
          </div>
          <IconButton label={muted ? "Unmute" : "Mute"} onClick={() => setMuted((prev) => !prev)}>
            {muted ? "🔇" : "🔊"}
          </IconButton>
          <IconButton label="Rules & payouts" onClick={() => setInfoOpen(true)}>
            ⓘ
          </IconButton>
        </div>
      </header>

      {/* main */}
      <div className="relative flex flex-1 shrink-0">
        {/* history rail */}
        <aside className="hidden w-[228px] shrink-0 border-r border-white/10 bg-black/40 p-2 xl:block">
          <HistoryPanel history={history} stats={stats} />
        </aside>

        {/* table */}
        <main className="relative flex min-w-0 flex-1 flex-col tp-studio justify-between">
          <div className="relative flex min-h-[260px] flex-1 shrink-0 flex-col items-center justify-center px-2 py-3 sm:min-h-[320px] sm:px-6">
            {/* live studio backdrop */}
            <div
              className="pointer-events-none absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: 'url("/images/studio.jpg")' }}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#04080b]/85 via-[#04080b]/55 to-[#04080b]/90" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.8)_100%)]" />

            {/* felt */}
            <div className="tp-felt relative w-full max-w-[1080px] flex-1 overflow-hidden rounded-[28px] border-2 border-amber-500/25 px-3 py-4 sm:px-8 sm:py-6">
              <div className="tp-felt-ring pointer-events-none absolute inset-0" />

              {phase === "result" && outcome && outcome.totalStake > 0 ? (
                <div
                  className={cn(
                    "tp-fade-in pointer-events-none absolute inset-0",
                    outcome.net > 0
                      ? "bg-[radial-gradient(ellipse_at_center,rgba(245,196,81,0.22),transparent_70%)]"
                      : "bg-[radial-gradient(ellipse_at_center,rgba(244,63,94,0.16),transparent_70%)]",
                  )}
                />
              ) : null}

              {phase === "result" && outcome && outcome.net > 0 && outcome.net >= outcome.totalStake * 4
                ? Array.from({ length: 14 }).map((_, index) => (
                    <span
                      key={index}
                      className="tp-confetti pointer-events-none absolute top-0 h-2 w-1.5 rounded-sm bg-amber-300"
                      style={{
                        left: `${5 + index * 6.6}%`,
                        ["--cx" as string]: `${(index % 2 === 0 ? 1 : -1) * (18 + (index % 5) * 14)}px`,
                        animationDelay: `${(index % 7) * 90}ms`,
                      }}
                    />
                  ))
                : null}
              <div className="absolute inset-x-0 top-2 flex flex-wrap items-center justify-center gap-1.5 sm:top-3">
                <span className="rounded-full border border-amber-300/25 bg-black/35 px-3 py-0.5 text-center text-[8px] font-bold uppercase tracking-[0.28em] text-amber-200/70 sm:text-[10px]">
                  Teen Patti Face Off · 6 cards · single deck
                </span>
                <span className="hidden rounded-full border border-white/15 bg-black/35 px-2.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.2em] text-white/40 sm:inline sm:text-[10px]">
                  Shoe 52 · shuffled
                </span>
              </div>

              <p aria-live="polite" className="sr-only">
                {phase === "result" && outcome
                  ? `${outcome.winner === "TIE" ? "Tie" : `Player ${outcome.winner} wins`}. ${
                      outcome.totalStake > 0
                        ? pool.enabled ? `Daily payout pending — provisional claim Rs. ${formatChips(outcome.totalReturned)}` : outcome.net > 0
                          ? `${pool.enabled ? "Provisional claim" : "You won"} Rs. ${formatChips(pool.enabled ? outcome.totalReturned : outcome.net)}`
                          : Math.abs(outcome.net) < 0.01
                            ? "Bets returned"
                            : ""
                        : "No bets placed"
                    }`
                  : ""}
              </p>

              <div className="tp-faceoff-hands relative mt-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 sm:mt-8 sm:gap-4">
                <HandArea
                  label="Player A"
                  accent="rose"
                  cards={hand("A")}
                  dealt={[0, 2, 4].map((index) => index < dealtCount)}
                  faceUp={[0, 2, 4].map((index) => index < revealedCount)}
                  isWinner={winnerHand === "A"}
                  isLoser={winnerHand === "B"}
                  isTie={winnerHand === "TIE"}
                  evaluation={revealPhase && outcome ? outcome.evalA.label : null}
                  pairPlus={revealPhase && outcome ? outcome.spots.find((s) => s.spot === "PP_A") ?? null : null}
                />

                {/* centre roundel */}
                <div className="tp-faceoff-roundel flex w-[58px] flex-col items-center justify-center gap-2 sm:w-[132px] lg:w-[150px]">
                  {phase === "betting" ? (
                    <>
                      <div className="relative grid h-[54px] w-[54px] place-items-center sm:h-[92px] sm:w-[92px]">
                        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
                          <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="7" />
                          <circle
                            cx="50"
                            cy="50"
                            r="44"
                            fill="none"
                            stroke={secondsLeft <= 5 ? "#f43f5e" : "#f5c451"}
                            strokeWidth="7"
                            strokeLinecap="round"
                            strokeDasharray={2 * Math.PI * 44}
                            strokeDashoffset={2 * Math.PI * 44 * (1 - progress)}
                            style={{ transition: "stroke-dashoffset 900ms linear" }}
                          />
                        </svg>
                        <div className="grid place-items-center">
                          <span
                            className={cn(
                              "tp-nums text-lg font-black sm:text-3xl",
                              secondsLeft <= 5 ? "text-rose-400" : "text-amber-200",
                            )}
                          >
                            {secondsLeft}
                          </span>
                          <span className="text-[6px] uppercase tracking-[0.14em] text-white/40 sm:text-[9px]">sec</span>
                        </div>
                      </div>
                      <p className="text-center text-[8px] font-bold uppercase tracking-[0.2em] text-amber-200/80 sm:text-[10px]">
                        {secondsLeft > 0 ? "Bets open" : "No more bets"}
                      </p>
                    </>
                  ) : phase === "dealing" ? (
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="tp-glow-pulse grid h-12 w-12 place-items-center rounded-lg border-2 border-amber-300/60 bg-gradient-to-b from-rose-800 to-rose-950 text-[10px] font-black tracking-widest text-amber-100">
                        TP
                      </div>
                      <p className="text-center text-[8px] font-bold uppercase tracking-[0.18em] text-amber-200/80 sm:text-[10px]">
                        Dealing
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5">
                      <div
                        className={cn(
                          "grid h-11 w-11 place-items-center rounded-full border-2 text-base font-black sm:h-14 sm:w-14 sm:text-xl",
                          outcome?.winner === "TIE"
                            ? "border-emerald-300 text-emerald-200"
                            : "border-amber-300/70 bg-black/40 text-amber-200",
                        )}
                      >
                        {outcome?.winner === "A" ? "A" : outcome?.winner === "B" ? "B" : "="}
                      </div>
                      <p className="text-center text-[8px] font-bold uppercase tracking-[0.18em] text-white/50 sm:text-[10px]">
                        {outcome?.winner === "TIE" ? "Tie" : "Winner"}
                      </p>
                      {outcome ? (
                        <p className="hidden max-w-[130px] text-center text-[10px] font-bold uppercase tracking-wider text-emerald-200/90 sm:block">
                          {(outcome.winner === "A" ? outcome.evalA.label : outcome.winner === "B" ? outcome.evalB.label : outcome.evalA.label)}
                        </p>
                      ) : null}
                      {outcome && bonusWinLabel(outcome) ? (
                        <p className="rounded-full border border-amber-300/40 bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-200">
                          {bonusWinLabel(outcome)}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>

                <HandArea
                  label="Player B"
                  accent="sky"
                  cards={hand("B")}
                  dealt={[1, 3, 5].map((index) => index < dealtCount)}
                  faceUp={[1, 3, 5].map((index) => index < revealedCount)}
                  isWinner={winnerHand === "B"}
                  isLoser={winnerHand === "A"}
                  isTie={winnerHand === "TIE"}
                  evaluation={revealPhase && outcome ? outcome.evalB.label : null}
                  pairPlus={revealPhase && outcome ? outcome.spots.find((s) => s.spot === "PP_B") ?? null : null}
                />
              </div>

            </div>

            {/* status strip */}
            <div className="mt-2 flex w-full max-w-[1080px] flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.22em] sm:text-[11px]",
                    phase === "betting" && secondsLeft > 0
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-rose-500/20 text-rose-300",
                  )}
                >
                  {statusText}
                </span>
                <span className="hidden text-[10px] uppercase tracking-[0.18em] text-white/35 sm:inline">
                  Player A 0.95:1 · Tie 50:1 · Player B 0.95:1
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/45">
                <span className="tp-nums">Total bet Rs. {formatChips(totalStake)}</span>
                <span className="tp-nums text-amber-200/80">
                  Last {history.length > 0 ? `${history[0]?.winner === "TIE" ? "TIE" : `P${history[0]?.winner}`}` : "—"}
                </span>
              </div>
            </div>

            {flash ? (
              <div className="tp-fade-in absolute bottom-2 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-rose-400/40 bg-rose-950/90 px-3 py-1.5 text-[11px] font-semibold text-rose-200 shadow-lg">
                {flash}
              </div>
            ) : null}
          </div>

          {/* betting dock */}
          <div className="z-20 shrink-0 border-t border-white/10 bg-gradient-to-b from-[#0b1219] to-[#050a0e] px-2 pb-2 pt-2 sm:px-4">
            <div className="mx-auto w-full max-w-[1080px]">
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5">
                <BetSpot
                  spot="A"
                  title="Player A"
                  odds="0.95:1"
                  variant="A"
                  amount={bets.A}
                  disabled={!canBet}
                  outcome={spotOutcome("A")}
                  onSelect={placeBet}
                />
                <BetSpot
                  spot="TIE"
                  title="Tie"
                  subtitle="same rank"
                  odds="50:1"
                  variant="tie"
                  amount={bets.TIE}
                  disabled={!canBet}
                  outcome={spotOutcome("TIE")}
                  onSelect={placeBet}
                />
                <BetSpot
                  spot="B"
                  title="Player B"
                  odds="0.95:1"
                  variant="B"
                  amount={bets.B}
                  disabled={!canBet}
                  outcome={spotOutcome("B")}
                  onSelect={placeBet}
                />
              </div>

              <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:mt-2 sm:gap-2.5">
                <BetSpot
                  spot="PP_A"
                  title="Pair Plus A"
                  subtitle="player A hand"
                  odds="up to 100:1"
                  variant="side"
                  amount={bets.PP_A}
                  disabled={!canBet}
                  outcome={spotOutcome("PP_A")}
                  compact
                  onSelect={placeBet}
                />
                <BetSpot
                  spot="BONUS"
                  title="3+3 Bonus"
                  subtitle="best 5 of 6"
                  odds="up to 1000:1"
                  variant="bonus"
                  amount={bets.BONUS}
                  disabled={!canBet}
                  outcome={spotOutcome("BONUS")}
                  compact
                  onSelect={placeBet}
                />
                <BetSpot
                  spot="PP_B"
                  title="Pair Plus B"
                  subtitle="player B hand"
                  odds="up to 100:1"
                  variant="side"
                  amount={bets.PP_B}
                  disabled={!canBet}
                  outcome={spotOutcome("PP_B")}
                  compact
                  onSelect={placeBet}
                />
              </div>

              {/* chips + controls */}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/40 px-2 py-2 sm:px-3">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5">
                  {CHIP_VALUES.map((value) => (
                    <Chip
                      key={value}
                      value={value}
                      size={44}
                      active={selectedChip === value}
                      disabled={value > balance && balance > 0}
                      onClick={() => {
                        sound.unlock();
                        setSelectedChip(value);
                        sound.play("click");
                      }}
                    />
                  ))}
                  <input
                    type="number"
                    min={10}
                    value={selectedChip || ""}
                    placeholder="Custom"
                    aria-label="Custom bet amount"
                    onChange={(e) => setSelectedChip(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                    className="h-10 w-20 rounded-lg border border-amber-300/40 bg-black/60 text-center text-sm font-bold text-amber-200"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                  <ActionButton onClick={undoBet} disabled={!canBet || betStack.length === 0} variant="undo">
                    Undo
                  </ActionButton>
                  <ActionButton onClick={clearBets} disabled={!canBet || isBetsEmpty(bets)} variant="clear">
                    Clear
                  </ActionButton>
                  <ActionButton onClick={doubleBets} disabled={!canBet || isBetsEmpty(bets)} variant="double">
                    Double
                  </ActionButton>
                  <ActionButton onClick={rebet} disabled={!canBet || !lastBets || isBetsEmpty(lastBets)} variant="rebet">
                    Rebet
                  </ActionButton>
                  <button
                    type="button"
                    onClick={() => {
                      sound.unlock();
                      startRound();
                    }}
                    disabled={phase !== "betting"}
                    className={cn(
                      "relative overflow-hidden rounded-lg px-4 py-1.5 sm:py-2 text-[11px] font-black uppercase tracking-[0.16em] transition sm:px-6 sm:text-xs",
                      phase === "betting"
                        ? "tp-shine bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-black shadow-[0_0_18px_rgba(251,191,36,0.6)] hover:brightness-110 active:scale-95"
                        : "cursor-not-allowed bg-white/10 text-white/40",
                    )}
                  >
                    {phase === "betting" ? "Deal now" : "In play"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* mobile history hidden to fit screen */}
          <div className="border-t border-white/10 bg-black/50 px-2 py-2 hidden">
            <div className="mx-auto max-w-[1080px]">
              <HistoryPanel history={history} stats={stats} />
            </div>
          </div>
        </main>
      </div>

      <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}

/* ---------------------------- sub views ---------------------------- */

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/5 text-sm text-white/70 transition hover:bg-white/15 hover:text-white sm:h-9 sm:w-9"
    >
      {children}
    </button>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "undo" | "clear" | "double" | "rebet" | "default";
}) {
  const variantStyles = {
    undo: "border-sky-500/50 bg-sky-950/40 text-sky-300 hover:bg-sky-900/60 shadow-[0_0_10px_rgba(56,189,248,0.25)]",
    clear: "border-rose-500/50 bg-rose-950/40 text-rose-300 hover:bg-rose-900/60 shadow-[0_0_10px_rgba(244,63,94,0.25)]",
    double: "border-amber-500/50 bg-amber-950/40 text-amber-300 hover:bg-amber-900/60 shadow-[0_0_10px_rgba(251,191,36,0.25)]",
    rebet: "border-indigo-500/50 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/60 shadow-[0_0_10px_rgba(99,102,241,0.25)]",
    default: "border-emerald-500/50 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60 shadow-[0_0_10px_rgba(16,185,129,0.25)]",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] transition sm:px-3 sm:py-1.5 sm:text-[11px]",
        disabled
          ? "cursor-not-allowed border-white/10 bg-white/5 text-white/30"
          : variantStyles[variant],
      )}
    >
      {children}
    </button>
  );
}

interface HandAreaProps {
  label: string;
  accent: "rose" | "sky";
  cards: (Card | null)[];
  dealt: boolean[];
  faceUp: boolean[];
  isWinner: boolean;
  isLoser: boolean;
  isTie: boolean;
  evaluation: string | null;
  pairPlus: { status: string; profit: number; stake: number } | null;
}

function HandArea({
  label,
  accent,
  cards,
  dealt,
  faceUp,
  isWinner,
  isLoser,
  isTie,
  evaluation,
  pairPlus,
}: HandAreaProps) {
  const accentText = accent === "rose" ? "text-rose-200" : "text-sky-200";
  const accentBg =
    accent === "rose"
      ? "from-rose-500/25 to-rose-900/10 border-rose-300/40"
      : "from-sky-500/25 to-sky-900/10 border-sky-300/40";

  return (
    <div
      className={cn(
        "tp-faceoff-hand flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border bg-gradient-to-b px-1 py-2 transition-all duration-500 sm:gap-2 sm:px-3 sm:py-3",
        accentBg,
        isWinner && "border-amber-300 shadow-[0_0_36px_rgba(245,196,81,0.45)]",
        isLoser && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <span className={cn("text-[10px] font-black uppercase tracking-[0.2em] sm:text-sm", accentText)}>
          {label}
        </span>
        {isWinner ? (
          <span className="tp-pop rounded bg-amber-300 px-1.5 py-[1px] text-[8px] font-black uppercase tracking-wider text-black sm:text-[9px]">
            Winner
          </span>
        ) : null}
        {isTie ? (
          <span className="tp-pop rounded bg-emerald-300 px-1.5 py-[1px] text-[8px] font-black uppercase tracking-wider text-black sm:text-[9px]">
            Tie
          </span>
        ) : null}
      </div>

      <div className="tp-faceoff-cards grid w-full grid-cols-3 items-center gap-1 sm:gap-2">
        {cards.map((card, index) => (
          <div key={index} className="relative min-w-0">
            {dealt[index] && card ? (
              <div className="tp-deal-in">
                <PlayingCard
                  card={card}
                  faceUp={faceUp[index]}
                  size="lg"
                  className="tp-faceoff-card"
                  highlight={isWinner}
                  dealDelay={30}
                />
              </div>
            ) : (
              <CardSlot size="lg" className="tp-faceoff-card" />
            )}
          </div>
        ))}
      </div>

      <div className="flex min-h-5 flex-wrap items-center justify-center gap-2 text-center">
        {evaluation ? (
          <span className="tp-fade-in text-[9px] font-bold uppercase tracking-[0.14em] text-amber-100/90 sm:text-xs">
            {evaluation}
          </span>
        ) : (
          <span className="text-[9px] uppercase tracking-[0.14em] text-white/25 sm:text-xs">waiting</span>
        )}
        {pairPlus && pairPlus.stake > 0 && pairPlus.status === "win" ? (
          <span className="rounded bg-amber-400/90 px-1.5 text-[8px] font-black uppercase text-black">
            pp +{formatChips(pairPlus.profit)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function bonusWinLabel(outcome: RoundOutcome): string | null {
  const bonus = outcome.spots.find((entry) => entry.spot === "BONUS");
  if (!bonus || bonus.stake <= 0 || bonus.status !== "win") return null;
  return `3+3 ${outcome.best5.label}`;
}
