"use client";
import { gameSfx } from "@/lib/gameSfx";
import { visibleAnimationFrame } from "@/lib/visibleAnimationFrame";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cashoutLimitReached } from "@/lib/crashCashoutLimit";
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import { QueuedWager, useRoundQueue } from "../blast-off/useRoundQueue";
import { TopBar } from "./TopBar";
import { Sidebar, type SidebarTab, type MyRow } from "./Sidebar";
import { Stadium } from "./Stadium";
import { SoccerBall, MiniBall } from "./SoccerBall";
import { BetPanel, EdgeButton } from "./BetPanel";
import {
  MAX_MULTIPLIER,
  formatMoney,
  formatMultiplier,
  generateCrashPoint,
  multiplierAt,
} from "./lib/crash";
import { assignTargets, createRoster, randomRoundId, type BotPlayer } from "./lib/players";

/* ------------------------------------------------------------------ */
/* constants                                                            */
/* ------------------------------------------------------------------ */

const BETTING_MS = 7000;
const CRASHED_MS = 2800;
const BALL_SIZE = 54;
const START_BALANCE = 2000;
const BALANCE_KEY = "crash-goal:balance";
const INITIAL_HISTORY = [2.69, 1.26, 6.42, 8.19, 1.41, 1.23, 1.64];

const PAD = { left: 96, right: 66, top: 76, bottom: 156 };

type Phase = "betting" | "flying" | "crashed";

interface Slot {
  amount: number;
  autoTarget: number;
  autoEnabled: boolean;
  placed: boolean;
  cashedOutAt: number | null;
  outcome: "win" | "loss" | null;
}

interface FloatBadge {
  key: number;
  name: string;
  multiplier: number;
  mine?: boolean;
}

const initialSlots = (): Slot[] => [
  { amount: 50, autoTarget: 3, autoEnabled: true, placed: false, cashedOutAt: null, outcome: null },
  { amount: 50, autoTarget: 3, autoEnabled: true, placed: false, cashedOutAt: null, outcome: null },
];

/* ------------------------------------------------------------------ */
/* geometry helpers                                                     */
/* ------------------------------------------------------------------ */

interface Geom {
  w: number;
  h: number;
}

function pointFor(multiplier: number, crashPoint: number, g: Geom) {
  const xFrac = Math.log(Math.max(1, multiplier)) / Math.log(crashPoint);
  const yCap = Math.max(3, crashPoint * 1.2);
  const yFrac = Math.min(1, Math.log(Math.max(1, multiplier)) / Math.log(yCap));
  const x = PAD.left + xFrac * Math.max(1, g.w - PAD.left - PAD.right);
  const y = g.h - PAD.bottom - Math.pow(yFrac, 0.85) * Math.max(1, g.h - PAD.bottom - PAD.top);
  return { x, y };
}

function trailPath(current: number, crashPoint: number, g: Geom): string {
  const steps = 42;
  const parts: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const m = 1 + (current - 1) * (i / steps);
    const p = pointFor(m, crashPoint, g);
    parts.push(`${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
  }
  return `M${parts.join(" L")}`;
}

/* ------------------------------------------------------------------ */
/* component                                                            */
/* ------------------------------------------------------------------ */

export function CrashGoal() {
  type SavedRound = { phase: Phase; started: number; crash: number; slots: Slot[] };
  const [savedOne] = usePoolRoundState<SavedRound | null>("crash-goal", "machine", null, "panel-1");
  const [savedTwo] = usePoolRoundState<SavedRound | null>("crash-goal", "machine", null, "panel-2");
  const recovered = savedOne ?? savedTwo;
  const stageRef = useRef<HTMLDivElement>(null);
  const geomRef = useRef<Geom>({ w: 1200, h: 700 });
  const ballRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<SVGPathElement>(null);
  const coreRef = useRef<SVGPathElement>(null);
  const glowRef = useRef<SVGPathElement>(null);
  const burstRef = useRef<HTMLDivElement>(null);
  const multNumRef = useRef<HTMLSpanElement>(null);
  const multBoxRef = useRef<HTMLDivElement>(null);
  const crashRef = useRef<HTMLDivElement>(null);

  const phaseRef = useRef<Phase>(recovered?.phase ?? "betting");
  const phaseStartRef = useRef<number>(recovered ? performance.now() - (Date.now() - recovered.started) : 0);
  const crashPointRef = useRef<number>(recovered?.crash ?? 2);
  const slotsRef = useRef<Slot[]>(recovered?.slots ?? initialSlots());
  const botsRef = useRef<BotPlayer[]>([]);
  const floatKeyRef = useRef(0);
  const lastAmountRef = useRef(50);
  const timerShownRef = useRef<number | null>(null);
  const closingRound = useRef(recovered?.phase === "crashed");
  const closeRetryAt = useRef(0);

  const [phase, setPhase] = useState<Phase>(recovered?.phase ?? "betting");
  const [history, setHistory] = useState<number[]>(INITIAL_HISTORY);
  const [balance] = useGameBalance("crash-goal", START_BALANCE);
  const poolOne = usePoolLifecycle("crash-goal", "panel-1");
  const poolTwo = usePoolLifecycle("crash-goal", "panel-2");
  const pools = [poolOne, poolTwo];
  const balanceRef = useRef(balance);

  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  const [slots, setSlots] = useState<Slot[]>(recovered?.slots ?? initialSlots());
  const [bots, setBots] = useState<BotPlayer[]>([]);
  const [crashValue, setCrashValue] = useState(1);
  const [roundTimer, setRoundTimer] = useState<number | null>(BETTING_MS / 1000);
  const [roundId, setRoundId] = useState("0000000000000000");
  const [tab, setTab] = useState<SidebarTab>("all");
  const [floats, setFloats] = useState<FloatBadge[]>([]);
  const [myHistory, setMyHistory] = useState<MyRow[]>([]);
  const [recentCashouts, setRecentCashouts] = useState<
    { multiplier: number; amount: number }[]
  >([
    { multiplier: 2.48, amount: 123 },
    { multiplier: 3.24, amount: 112 },
    { multiplier: 2.16, amount: 23 },
    { multiplier: 4.6, amount: 20 },
    { multiplier: 1.25, amount: 20 },
  ]);
  const [stats, setStats] = useState({ bets: 0, wins: 0, losses: 0 });

  const myKeyRef = useRef(0);
  const queue = useRoundQueue<{ index: number; slot: Slot }>();
  const floatTimers = useRef<Set<number>>(new Set());
  useEffect(() => () => floatTimers.current.forEach(window.clearTimeout), []);
  const activeRef = useRef(false);
  useEffect(() => {
    activeRef.current = true;
    const onVisibility = () => { if (document.hidden) gameSfx.stop(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", gameSfx.stop);
    return () => {
      activeRef.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", gameSfx.stop);
      gameSfx.stop();
    };
  }, []);

  const recordMyBet = useCallback((row: Omit<MyRow, "id">) => {
    myKeyRef.current += 1;
    const id = `me-${myKeyRef.current}`;
    setMyHistory((prev) => [{ ...row, id }, ...prev].slice(0, 14));
  }, []);

  /* ---------------- geometry ---------------- */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const r = stage.getBoundingClientRect();
      geomRef.current = { w: r.width, h: r.height };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  /* ---------------- helpers ---------------- */
  const saveMachine = (list = slotsRef.current) => {
    const machine: SavedRound = {
      phase: phaseRef.current, started: Date.now() - (performance.now() - phaseStartRef.current),
      crash: crashPointRef.current, slots: list,
    };
    pools.forEach(pool => pool.checkpoint({ machine }));
  };
  const syncSlots = useCallback((updater: (list: Slot[]) => Slot[]) => {
    const next = updater(slotsRef.current.map((s) => ({ ...s })));
    saveMachine(next);
    slotsRef.current = next;
    setSlots(next.map((s) => ({ ...s })));
  }, []);

  const pushFloat = useCallback((name: string, multiplier: number, mine = false) => {
    floatKeyRef.current += 1;
    const key = floatKeyRef.current;
    setFloats((prev) => [...prev.slice(-5), { key, name, multiplier, mine }]);
    const timer = window.setTimeout(() => {
      floatTimers.current.delete(timer);
      setFloats((prev) => prev.filter((f) => f.key !== key));
    }, 2400);
    floatTimers.current.add(timer);
  }, []);

  const resetVisuals = useCallback(() => {
    if (ballRef.current) {
      ballRef.current.style.opacity = "0";
      ballRef.current.style.transform = "translate3d(-200px,-200px,0)";
    }
    if (burstRef.current) {
      burstRef.current.style.opacity = "0";
      burstRef.current.classList.remove("cg-burst-go");
    }
    if (trailRef.current) trailRef.current.setAttribute("d", "");
    if (coreRef.current) coreRef.current.setAttribute("d", "");
    if (glowRef.current) glowRef.current.setAttribute("d", "");
    if (crashRef.current) crashRef.current.style.opacity = "0";
    if (multBoxRef.current) multBoxRef.current.style.opacity = "0";
  }, []);

  const paint = useCallback(
    (multiplier: number, crashPoint: number) => {
      const g = geomRef.current;
      const p = pointFor(multiplier, crashPoint, g);
      const ball = ballRef.current;
      if (ball) {
        ball.style.opacity = "1";
        ball.style.transform = `translate3d(${(p.x - BALL_SIZE / 2).toFixed(1)}px, ${(
          p.y -
          BALL_SIZE / 2
        ).toFixed(1)}px, 0)`;
      }
      const d = trailPath(multiplier, crashPoint, g);
      if (trailRef.current) trailRef.current.setAttribute("d", d);
      if (coreRef.current) coreRef.current.setAttribute("d", d);
      if (glowRef.current) glowRef.current.setAttribute("d", d);

      const box = multBoxRef.current;
      if (box) {
        box.style.opacity = "1";
        const tx = Math.max(14, Math.min(g.w - 200, p.x - 205));
        const ty = Math.max(8, Math.min(g.h - 92, p.y - 122));
        box.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0)`;
      }
      const num = multNumRef.current;
      if (num) num.textContent = formatMultiplier(multiplier);
    },
    [],
  );

  /* ---------------- cash out ---------------- */
  const cashOut = useCallback(
    async (index: number, multiplier: number) => {
      const slot = slotsRef.current[index];
      if (phaseRef.current !== "flying" || !slot || !slot.placed || slot.cashedOutAt !== null) return;
      const payout = Math.round(slot.amount * multiplier * 100) / 100;
      saveMachine(slotsRef.current.map((s, i) => i === index ? { ...s, cashedOutAt: multiplier, outcome: "win" } : s));
      if (!await pools[index].complete(payout)) return;
      syncSlots((list) => {
        const copy = [...list];
        copy[index] = { ...copy[index], cashedOutAt: multiplier, outcome: "win" };
        return copy;
      });
      if (!activeRef.current) return;
      gameSfx.win();
      pushFloat("YOU", multiplier, true);
      setRecentCashouts((prev) =>
        [{ multiplier, amount: payout }, ...prev].slice(0, 6),
      );
    },
    [pushFloat, syncSlots],
  );

  /* ---------------- round machine ---------------- */
  const enterBetting = useCallback(async () => {
    if (closingRound.current || pools.some(pool => pool.busy)) return;
    phaseRef.current = "betting";
    phaseStartRef.current = performance.now();
    setPhase("betting");
    setCrashValue(1);
    setRoundTimer(BETTING_MS / 1000);
    setFloats([]);
    botsRef.current = createRoster(14);
    setBots(botsRef.current.map((b) => ({ ...b })));
    setRoundId(randomRoundId());
    syncSlots((list) =>
      list.map((s) => ({ ...s, placed: false, cashedOutAt: null, outcome: null })),
    );
    const queued = queue.consume();
    if (queued) {
      const { index, slot } = queued;
      if (Number.isFinite(slot.amount) && slot.amount > 0 && slot.amount <= balanceRef.current) {
        saveMachine(slotsRef.current.map((s, i) => i === index ? { ...slot, placed: true, cashedOutAt: null, outcome: null } : s));
        if (!await pools[index].start(slot.amount)) return;
        syncSlots((list) => list.map((s, i) => i === index ? { ...slot, placed: true, cashedOutAt: null, outcome: null } : s));
        queue.setStatus("Bet accepted for this round");
      } else queue.setStatus("Queued bet rejected — invalid stake or insufficient balance");
    }
    timerShownRef.current = null;
    resetVisuals();

    // park the ball on the pitch while players place their bets
    const g = geomRef.current;
    const p = pointFor(1, 2, g);
    if (ballRef.current) {
      ballRef.current.style.opacity = "1";
      ballRef.current.style.transform = `translate3d(${(p.x - BALL_SIZE / 2).toFixed(1)}px, ${(
        p.y -
        BALL_SIZE / 2
      ).toFixed(1)}px, 0)`;
    }
  }, [queue.consume, queue.setStatus, resetVisuals, syncSlots]);

  const enterFlying = useCallback(() => {
    if (pools.some(pool => pool.busy)) return;
    gameSfx.go();
    const list = slotsRef.current;
    const targets = list.map((s) => (s.autoEnabled ? s.autoTarget : null));
    const { crashPoint } = generateCrashPoint(targets);
    crashPointRef.current = crashPoint;
    assignTargets(botsRef.current, crashPoint);
    setBots(botsRef.current.map((b) => ({ ...b })));
    phaseRef.current = "flying";
    phaseStartRef.current = performance.now();
    saveMachine();
    setPhase("flying");
    setRoundTimer(null);
  }, []);

  const enterCrashed = useCallback(async () => {
    closingRound.current = true;
    closeRetryAt.current = performance.now() + 1000;
    gameSfx.crash();
    const cp = crashPointRef.current;
    phaseRef.current = "crashed";
    phaseStartRef.current = performance.now();
    setPhase("crashed");
    setCrashValue(cp);
    setHistory((prev) => [cp, ...prev].slice(0, 14));
    saveMachine();
    while (activeRef.current && pools.some(pool => pool.busy)) await new Promise(resolve => setTimeout(resolve, 50));
    if (!activeRef.current) return;
    for (let index = 0; index < slotsRef.current.length; index++) {
      const slot = slotsRef.current[index];
      if (slot.placed && slot.cashedOutAt === null && slot.outcome === null) {
        saveMachine(slotsRef.current.map((s, i) => i === index ? { ...s, outcome: "loss" } : s));
        if (!await pools[index].complete(0)) return;
        if (!activeRef.current) return;
      }
    }
    closingRound.current = false;

    // resolve any bet that never cashed out
    let lost = 0;
    let won = 0;
    const list = slotsRef.current.map((s) => {
      if (!s.placed) return s;
      recordMyBet({
        name: "YOU",
        tone: "from-amber-300 to-orange-600",
        bet: s.amount,
        cashoutMultiplier: s.cashedOutAt,
        payout: s.cashedOutAt ? Math.round(s.amount * s.cashedOutAt * 100) / 100 : 0,
      });
      if (s.cashedOutAt !== null) {
        won += 1;
        return s;
      }
      lost += 1;
      return { ...s, outcome: "loss" as const };
    });
    if (lost > 0 || won > 0) {
      slotsRef.current = list;
      setSlots(list.map((s) => ({ ...s })));
      setStats((s) => ({
        bets: s.bets + won + lost,
        wins: s.wins + won,
        losses: s.losses + lost,
      }));
    }

    if (crashRef.current) {
      crashRef.current.style.opacity = "1";
      const g = geomRef.current;
      const p = pointFor(cp, cp, g);
      const tx = Math.max(14, Math.min(g.w - 220, p.x - 215));
      const ty = Math.max(8, Math.min(g.h - 92, p.y - 122));
      crashRef.current.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0)`;
    }
    // explode the ball into a visible burst
    const geo = geomRef.current;
    const bp = pointFor(cp, cp, geo);
    if (burstRef.current) {
      burstRef.current.style.opacity = "1";
      burstRef.current.style.transform = `translate3d(${(bp.x - 120).toFixed(1)}px, ${(
        bp.y - 120
      ).toFixed(1)}px, 0)`;
      // force reflow so the animation restarts on every round
      void burstRef.current.offsetWidth;
      burstRef.current.classList.add("cg-burst-go");
    }
    if (ballRef.current) ballRef.current.style.opacity = "0";
  }, [recordMyBet]);

  /* ---------------- main loop ---------------- */
  useEffect(() => {
    const loop = (now: number) => {
      if (pools.some(pool => pool.busy)) return;
      const phase = phaseRef.current;
      const elapsed = now - phaseStartRef.current;

      if (phase === "betting") {
        const remaining = Math.max(0, BETTING_MS - elapsed);
        const tenths = Math.ceil(remaining / 100) / 10;
        if (tenths !== timerShownRef.current) {
          timerShownRef.current = tenths;
          setRoundTimer(tenths);
        }
        if (remaining <= 0) enterFlying();
        return;
      }

      if (phase === "flying") {
        const seconds = elapsed / 1000;
        const m = multiplierAt(seconds);
        const cp = crashPointRef.current;

        // bots auto cash-out
        let botChanged = false;
        const fresh: { multiplier: number; amount: number }[] = [];
        for (const bot of botsRef.current) {
          if (!bot.cashedOut && m >= bot.target) {
            bot.cashedOut = true;
            bot.cashoutMultiplier = bot.target;
            bot.payout = Math.round(bot.bet * bot.target * 100) / 100;
            botChanged = true;
            pushFloat(bot.name, bot.target);
            fresh.push({ multiplier: bot.target, amount: bot.payout });
          }
        }
        if (botChanged) {
          setBots(botsRef.current.map((b) => ({ ...b })));
          if (fresh.length) {
            setRecentCashouts((prev) => [...fresh.reverse(), ...prev].slice(0, 6));
          }
        }

        // player auto cash-out
        const list = slotsRef.current;
        for (let i = 0; i < list.length; i += 1) {
          const slot = list[i];
          if (slot.placed && slot.cashedOutAt === null && slot.autoEnabled && slot.autoTarget <= cp && m >= slot.autoTarget) {
            cashOut(i, Math.min(slot.autoTarget, cp));
          }
        }

        const placed = list.filter((s) => s.placed);
        const cashed = botsRef.current.filter((b) => b.cashedOut).length + placed.filter((s) => s.cashedOutAt !== null).length;
        if (m < cp && cashoutLimitReached(cashed, botsRef.current.length + placed.length)) {
          crashPointRef.current = m;
          paint(m, m);
          enterCrashed();
          return;
        }

        if (m >= cp) {
          paint(cp, cp);
          enterCrashed();
          return;
        }
        paint(m, cp);
        return;
      }

      // crashed
      if (closingRound.current && !pools.some(pool => pool.busy) && now >= closeRetryAt.current) {
        void enterCrashed();
        return;
      }
      if (elapsed >= CRASHED_MS) enterBetting();
    };

    return visibleAnimationFrame(loop);
  }, [cashOut, enterBetting, enterCrashed, enterFlying, paint, pushFloat]);

  /* ---------------- bootstrap ---------------- */
  useEffect(() => {
    botsRef.current = createRoster(14);
    setBots(botsRef.current.map((b) => ({ ...b })));
    if (!recovered) phaseStartRef.current = performance.now();
    setRoundId(randomRoundId());
    if (recovered?.phase === "crashed") void enterCrashed();
  }, []);

  /* ---------------- player actions ---------------- */
  const primaryAction = useCallback(
    async (index: number) => {
      const slot = slotsRef.current[index];
      const currentPhase = phaseRef.current;

      if (currentPhase === "flying" && slot.placed && slot.cashedOutAt === null) {
        const m = multiplierAt((performance.now() - phaseStartRef.current) / 1000);
        cashOut(index, Math.min(m, crashPointRef.current));
        return;
      }
      if (currentPhase !== "betting") {
        queue.enqueue({ index, slot: { ...slot } });
        return;
      }

      if (currentPhase === "betting") {
        if (slot.placed) {
          // cancel -> refund
          if (!await pools[index].refund()) return;
          syncSlots((list) => {
            const copy = [...list];
            copy[index] = { ...copy[index], placed: false, outcome: null };
            return copy;
          });
          queue.setStatus("Bet cancelled — stake returned");
          return;
        }
        if (!Number.isFinite(slot.amount) || slot.amount <= 0 || slot.amount > balanceRef.current) {
          queue.setStatus("Bet rejected — invalid stake or insufficient balance");
          return;
        }
        saveMachine(slotsRef.current.map((s, i) => i === index ? { ...s, placed: true, cashedOutAt: null, outcome: null } : s));
        if (!await pools[index].start(slot.amount)) return;
        lastAmountRef.current = slot.amount;
        syncSlots((list) => {
          const copy = [...list];
          gameSfx.chip();
          copy[index] = { ...copy[index], placed: true, cashedOutAt: null, outcome: null };
          return copy;
        });
      }
    },
    [cashOut, queue.enqueue, queue.setStatus, syncSlots],
  );

  const setSlotAmount = useCallback(
    (index: number, value: number) => {
      if (slotsRef.current[index].placed) return;
      syncSlots((list) => {
        const copy = [...list];
        copy[index] = { ...copy[index], amount: value };
        return copy;
      });
    },
    [syncSlots],
  );

  const setSlotTarget = useCallback(
    (index: number, value: number) => {
      syncSlots((list) => {
        const copy = [...list];
        copy[index] = { ...copy[index], autoTarget: value, autoEnabled: true };
        return copy;
      });
    },
    [syncSlots],
  );

  const toggleSlotAuto = useCallback(
    (index: number) => {
      syncSlots((list) => {
        const copy = [...list];
        copy[index] = { ...copy[index], autoEnabled: !copy[index].autoEnabled };
        return copy;
      });
    },
    [syncSlots],
  );

  /** Repeats the stake used on the previous round. */
  const repeatLast = useCallback(() => {
    const amount = lastAmountRef.current;
    syncSlots((list) => list.map((s) => s.placed ? s : ({ ...s, amount })));
  }, [syncSlots]);

  /* ---------------- derived ---------------- */
  const totalStaked = useMemo(
    () => bots.reduce((sum, b) => sum + b.bet, 0) + slots.reduce((s, x) => s + (x.placed ? x.amount : 0), 0),
    [bots, slots],
  );
  const totalBets = useMemo(
    () => bots.length + slots.filter((s) => s.placed).length,
    [bots, slots],
  );

  const myRows: MyRow[] = useMemo(() => {
    const current = slots
      .filter((s) => s.placed)
      .map((s, i) => ({
        id: `me-live-${i}`,
        name: "YOU",
        tone: "from-amber-300 to-orange-600",
        bet: s.amount,
        cashoutMultiplier: s.cashedOutAt,
        payout: s.cashedOutAt ? Math.round(s.amount * s.cashedOutAt * 100) / 100 : 0,
      }));
    return [...current, ...myHistory];
  }, [slots, myHistory]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#05070f] text-white px-1 sm:px-2.5">
      <TopBar
        history={history}
        balance={balance}
        roundTimer={roundTimer}
        recent={recentCashouts}
      />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          tab={tab}
          onTabChange={setTab}
          bots={bots}
          totalBets={totalBets}
          totalStaked={totalStaked}
          myRows={myRows}
          ladderValue={slots[0].amount}
          onLadderPick={(v) => {
            setSlotAmount(0, v);
            setSlotAmount(1, v);
          }}
        />

        {/* ---------------- stage ---------------- */}
        <main ref={stageRef} className="relative min-w-0 flex-1 overflow-hidden">
          <Stadium />

          {/* MAX badge */}
          <div className="absolute left-3 top-2.5 z-10 rounded bg-black/35 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/70 backdrop-blur-sm">
            Max {MAX_MULTIPLIER}x
          </div>

          {/* betting countdown */}
          {phase === "betting" && (
            <div className="absolute left-1/2 top-6 z-20 -translate-x-1/2 text-center">
              <div className="text-[11px] font-black uppercase tracking-[0.3em] text-sky-200/80">
                Next kick-off in
              </div>
              <div className="mt-0.5 text-[30px] font-black italic leading-none tabular-nums text-white drop-shadow-[0_3px_10px_rgba(0,0,0,0.6)]">
                {(roundTimer ?? 0).toFixed(1)}s
              </div>
            </div>
          )}

          {/* flight trail */}
          <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full">
            <defs>
              {/* rainbow exhaust — matches the reference streak */}
              <linearGradient id="cg-trail" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor="#7b2ff7" stopOpacity="0.12" />
                <stop offset="16%" stopColor="#2b6cf6" stopOpacity="0.55" />
                <stop offset="34%" stopColor="#16c8d8" stopOpacity="0.8" />
                <stop offset="52%" stopColor="#3ddc63" stopOpacity="0.9" />
                <stop offset="70%" stopColor="#ffd23f" stopOpacity="0.97" />
                <stop offset="86%" stopColor="#ff8b2b" stopOpacity="1" />
                <stop offset="100%" stopColor="#ff4d4d" stopOpacity="1" />
              </linearGradient>
              <linearGradient id="cg-trail-core" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.05" />
                <stop offset="55%" stopColor="#fff3c4" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
              </linearGradient>
              <filter id="cg-blur" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="14" />
              </filter>
            </defs>
            <path
              ref={glowRef}
              d=""
              fill="none"
              stroke="#ff8b2b"
              strokeOpacity="0.42"
              strokeWidth="34"
              strokeLinecap="round"
              filter="url(#cg-blur)"
            />
            <path
              ref={trailRef}
              d=""
              fill="none"
              stroke="url(#cg-trail)"
              strokeWidth="11"
              strokeLinecap="round"
            />
            <path
              ref={coreRef}
              d=""
              fill="none"
              stroke="url(#cg-trail-core)"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          </svg>

          {/* multiplier read-out */}
          <div
            ref={multBoxRef}
            className="pointer-events-none absolute left-0 top-0 z-20 opacity-0 will-change-transform"
          >
            <div className="flex items-end gap-1 font-black italic leading-none">
              <span
                ref={multNumRef}
                className="text-[clamp(38px,6vw,64px)] text-white"
                style={{ textShadow: "0 3px 0 rgba(20,50,100,0.35), 0 8px 22px rgba(20,50,100,0.45)" }}
              >
                {phase === "crashed" ? formatMultiplier(crashValue) : "1.00"}
              </span>
              <span
                className="pb-2 text-[28px] font-black italic text-white/90"
                style={{ textShadow: "0 3px 12px rgba(20,50,100,0.5)" }}
              >
                x
              </span>
            </div>
          </div>

          {/* crashed banner */}
          <div
            ref={crashRef}
            className="pointer-events-none absolute left-0 top-0 z-20 opacity-0 will-change-transform"
          >
            <div className="flex flex-col items-start">
              <span
                className="text-[13px] font-black uppercase tracking-[0.22em] text-white"
                style={{ textShadow: "0 2px 10px rgba(20,50,100,0.6)" }}
              >
                Burst
              </span>
              <span
                className="text-[46px] font-black italic leading-none text-white"
                style={{ textShadow: "0 3px 0 rgba(190,40,40,0.55), 0 10px 24px rgba(120,20,20,0.5)" }}
              >
                {formatMultiplier(crashValue)}x
              </span>
            </div>
          </div>

          {/* crash burst */}
          <div
            ref={burstRef}
            className="pointer-events-none absolute left-0 top-0 z-30 opacity-0"
            style={{ width: 240, height: 240 }}
          >
            <div className="relative h-full w-full">
              {/* shockwave rings */}
              <span className="cg-ring cg-ring-1" />
              <span className="cg-ring cg-ring-2" />
              <span className="cg-ring cg-ring-3" />
              {/* hot flash */}
              <span className="cg-flash" />
              {/* sparks */}
              <span className="cg-spark cg-spark-a" />
              <span className="cg-spark cg-spark-b" />
              <span className="cg-spark cg-spark-c" />
              <span className="cg-spark cg-spark-d" />
              <span className="cg-spark cg-spark-e" />
              <span className="cg-spark cg-spark-f" />
            </div>
          </div>

          {/* ball */}
          <div
            ref={ballRef}
            className="pointer-events-none absolute left-0 top-0 z-20 opacity-0 will-change-transform"
          >
            <div className="relative">
              <div
                className="absolute left-1/2 top-1/2 -z-10 h-[110px] w-[110px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-xl"
                style={{ background: "radial-gradient(circle,rgba(255,196,90,0.55) 0%,rgba(255,140,60,0) 70%)" }}
              />
              {/* spinning ball */}
              <div className="cg-spin">
                <SoccerBall size={BALL_SIZE} />
              </div>
            </div>
          </div>

          {/* floating cash-outs */}
          <div className="pointer-events-none absolute right-3 top-[34%] z-20 flex flex-col items-end gap-1.5">
            {floats.map((f) => (
              <div
                key={f.key}
                className={`flex items-center gap-1.5 rounded-full border px-2 py-1 backdrop-blur-sm ${f.mine
                    ? "border-emerald-400/70 bg-emerald-500/20"
                    : "border-white/20 bg-black/35"
                  }`}
                style={{ animation: "cg-float 2.4s ease-out forwards" }}
              >
                <MiniBall size={13} />
                <span className={`text-[10px] font-black ${f.mine ? "text-emerald-300" : "text-white/85"}`}>
                  {f.name}
                </span>
                <span className="text-[10px] font-black tabular-nums text-amber-300">
                  {formatMultiplier(f.multiplier)}x
                </span>
              </div>
            ))}
          </div>

          {/* bottom controls */}
          <div className="absolute inset-x-0 bottom-0 z-30 flex items-end justify-center gap-2 px-2 pb-3 sm:gap-5 sm:px-3 sm:pb-4">
            <div className="hidden sm:block">
              <EdgeButton side="left" onClick={repeatLast} />
            </div>
            {slots.map((slot, i) => (
              <BetPanel
                key={i}
                index={i}
                amount={slot.amount}
                autoTarget={slot.autoTarget}
                autoEnabled={slot.autoEnabled}
                placed={slot.placed}
                cashedOutAt={slot.cashedOutAt}
                phase={phase}
                balance={balance}
                onAmountChange={(v) => setSlotAmount(i, v)}
                onTargetChange={(v) => setSlotTarget(i, v)}
                onToggleAuto={() => toggleSlotAuto(i)}
                onPrimaryAction={() => primaryAction(i)}
              />
            ))}
            <div className="hidden sm:block">
              <EdgeButton side="right" onClick={repeatLast} />
            </div>
          </div>
        </main>
      </div>

      <QueuedWager {...queue} />
    </div>
  );
}
