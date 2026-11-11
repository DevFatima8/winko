"use client";
import { gameSfx } from "@/lib/gameSfx";
import { visibleAnimationFrame } from "@/lib/visibleAnimationFrame";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import { QueuedWager, useRoundQueue } from "../blast-off/useRoundQueue";
import { BET_PRESETS } from "@/lib/betPresets";
import { cashoutLimitReached } from "@/lib/crashCashoutLimit";
import "./crash-bonus.css";

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */
const BETTING_MS = 10000;
const CRASHED_MS = 3200;
const WIN_RATE = 0.35;
const GROWTH = 0.15; // multiplier = e^(GROWTH * seconds)
const START_BALANCE = 1000;

type Phase = "betting" | "running" | "crashed";
type BetStatus = "pending" | "active" | "won" | "lost";

type Bet = {
  amount: number;
  auto: number | null;
  status: BetStatus;
  cashout?: number;
  profit?: number;
};

type FakeBet = { id: number; name: string; amount: number; target: number };

type MyRound = {
  id: number;
  amount: number;
  cashout: number | null;
  profit: number;
  crash: number;
};

const floor2 = (n: number) => Math.floor(n * 100) / 100;
const fmt = (n: number) => n.toFixed(2);
const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function rollCrash(hasBet: boolean, auto: number | null): number {
  if (!hasBet) {
    const r = Math.random();
    return floor2(Math.min(100, Math.max(1, 0.96 / (1 - r))));
  }
  const win = Math.random() < WIN_RATE;
  if (win) {
    if (auto) return floor2(auto * (1.03 + Math.random() * 0.6) + 0.02);
    return floor2(1.8 + Math.pow(Math.random(), 2) * 8);
  }
  let c = 1 + Math.pow(Math.random(), 2) * 0.1;
  if (auto && c >= auto) c = 1 + (auto - 1) * Math.random() * 0.9;
  return floor2(Math.max(1, c));
}

function genFakes(): FakeBet[] {
  const letters = "abcdefghjkmnpqrstuvwxyz";
  const amounts = [10, 20, 25, 50, 100, 150, 200, 500, 1000, 2000];
  const count = 22 + Math.floor(Math.random() * 20);
  const list: FakeBet[] = [];
  for (let i = 0; i < count; i++) {
    const a = letters[Math.floor(Math.random() * letters.length)];
    const b = letters[Math.floor(Math.random() * letters.length)];
    const d = Math.floor(Math.random() * 10);
    const r = Math.random();
    list.push({
      id: i,
      name: `${a}***${b}${d}`,
      amount: amounts[Math.floor(Math.random() * amounts.length)],
      target: floor2(Math.min(40, 1.05 + (0.97 / (1 - r) - 1) * 1.1)),
    });
  }
  return list.sort((x, y) => y.amount - x.amount);
}

/* ------------------------------------------------------------------ */
/*  Canvas drawing                                                     */
/* ------------------------------------------------------------------ */
function drawScene(
  canvas: HTMLCanvasElement,
  t: number,
  m: number,
  phase: Phase,
  time: number
) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // rotating sunburst background
  ctx.save();
  ctx.translate(0, h);
  ctx.rotate(time / 9000);
  const rays = 18;
  for (let i = 0; i < rays; i++) {
    if (i % 2 === 0) continue;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    const a1 = (i / rays) * Math.PI * 2;
    const a2 = ((i + 1) / rays) * Math.PI * 2;
    const R = Math.max(w, h) * 2;
    ctx.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
    ctx.lineTo(Math.cos(a2) * R, Math.sin(a2) * R);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.025)";
    ctx.fill();
  }
  ctx.restore();

  const padL = 52;
  const padB = 32;
  const padT = 20;
  const padR = 34;
  const pw = w - padL - padR;
  const ph = h - padB - padT;

  const tMax = Math.max(6, t * 1.2);
  const mMax = Math.max(2, m * 1.25);
  const X = (tt: number) => padL + (tt / tMax) * pw;
  const Y = (mm: number) => h - padB - ((mm - 1) / (mMax - 1)) * ph;

  // axes
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, h - padB);
  ctx.lineTo(w - padR + 10, h - padB);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "right";
  const steps = [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200];
  const yStep = steps.find((s) => (mMax - 1) / s <= 6) ?? 200;
  for (let v = 1 + yStep; v < mMax; v += yStep) {
    const y = Y(v);
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.fillText(`${v.toFixed(v % 1 === 0 ? 0 : 2)}x`, padL - 8, y + 4);
  }
  ctx.fillText("1x", padL - 8, h - padB + 4);

  ctx.textAlign = "center";
  const xStep = tMax > 40 ? 10 : tMax > 18 ? 5 : 2;
  for (let s = xStep; s < tMax; s += xStep) {
    ctx.fillText(`${s}s`, X(s), h - padB + 18);
  }

  if (phase === "betting" || t <= 0) return;

  // curve
  const n = 90;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const tt = (t * i) / n;
    pts.push([X(tt), Y(Math.exp(GROWTH * tt))]);
  }
  const crashed = phase === "crashed";

  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.lineTo(pts[pts.length - 1][0], h - padB);
  ctx.lineTo(pts[0][0], h - padB);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, padT, 0, h - padB);
  grad.addColorStop(0, crashed ? "rgba(148,163,184,0.25)" : "rgba(239,68,68,0.38)");
  grad.addColorStop(1, "rgba(239,68,68,0.02)");
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.strokeStyle = crashed ? "#64748b" : "#ef4444";
  ctx.shadowColor = crashed ? "transparent" : "#ef4444";
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // rocket / explosion
  const tipX = pts[n][0];
  const tipY = pts[n][1];
  const dx = 1 / tMax * pw;
  const dy = (-(GROWTH * m) / (mMax - 1)) * ph;
  const ang = Math.atan2(dy, dx);
  ctx.save();
  ctx.translate(tipX, tipY);
  if (crashed) {
    ctx.font = "44px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("💥", 0, 14);
  } else {
    ctx.rotate(ang + Math.PI / 4);
    ctx.font = "36px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🚀", 0, 12);
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function CrashGame() {
  const [savedMachine] = usePoolRoundState<{ phase: Phase; started: number; ends: number; crash: number; round: number } | null>("crash-bonus", "machine", null);
  const [phase, setPhase] = useState<Phase>(savedMachine?.phase ?? "betting");
  const [mult, setMult] = useState(1);
  const [countdown, setCountdown] = useState(BETTING_MS / 1000);
  const [balance, setBalance] = useGameBalance("crash-bonus", START_BALANCE);
  const pool = usePoolLifecycle("crash-bonus");
  const [bet, setBetState] = usePoolRoundState<Bet | null>("crash-bonus", "bet", null);
  const [history, setHistory] = useState<number[]>([]);
  const [myRounds, setMyRounds] = useState<MyRound[]>([]);
  const [fakes, setFakes] = useState<FakeBet[]>([]);
  const [stats, setStats] = useState({ wins: 0, losses: 0 });
  const [toast, setToast] = useState<{ text: string; win: boolean } | null>(null);

  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [amount, setAmount] = useState("10");
  const [autoCashOn, setAutoCashOn] = useState(false);
  const [autoCash, setAutoCash] = useState("2.00");
  const [autoBet, setAutoBet] = useState(false);
  const [tab, setTab] = useState<"all" | "my">("all");

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const phaseRef = useRef<Phase>(savedMachine?.phase ?? "betting");
  const balanceRef = useRef(balance);
  const betRef = useRef<Bet | null>(bet);
  const multRef = useRef(1);
  const fakesRef = useRef<FakeBet[]>([]);
  const crashRef = useRef(savedMachine?.crash ?? 1);
  const startRef = useRef(savedMachine ? performance.now() - (Date.now() - savedMachine.started) : 0);
  const betEndRef = useRef(0);
  const lastTickSecondRef = useRef(BETTING_MS / 1000);
  const nextAtRef = useRef(0);
  const roundIdRef = useRef(savedMachine?.round ?? 0);
  const amountRef = useRef(amount);
  const autoCashRef = useRef(autoCash);
  const autoCashOnRef = useRef(autoCashOn);
  const autoBetRef = useRef(autoBet);
  const modeRef = useRef(mode);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRoundQueue<Bet>();
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

  useEffect(() => {
    betRef.current = bet;
    balanceRef.current = balance;
    amountRef.current = amount;
    autoCashRef.current = autoCash;
    autoCashOnRef.current = autoCashOn;
    autoBetRef.current = autoBet;
    modeRef.current = mode;
  });

  const setBet = useCallback((b: Bet | null) => {
    betRef.current = b;
    setBetState(b);
  }, []);

  const showToast = useCallback((text: string, win: boolean) => {
    setToast({ text, win });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const acceptBet = useCallback(async (next: Bet) => {
    if (!Number.isFinite(next.amount) || next.amount < 10 || next.amount > balanceRef.current) {
      queue.setStatus("Bet rejected — invalid stake or insufficient balance");
      return;
    }
    pool.checkpoint({
      bet: next, machine: {
        phase: "betting", started: Date.now(), ends: Date.now() + Math.max(0, betEndRef.current - performance.now()),
        crash: 1, round: roundIdRef.current,
      }
    });
    if (!await pool.start(next.amount)) return;
    setBet(next);
    queue.setStatus("Bet accepted for this round");
  }, [setBalance, setBet, queue.setStatus]);

  const placeBet = useCallback(() => {
    const cur = betRef.current;
    if (phaseRef.current === "betting" && cur && (cur.status === "pending" || cur.status === "active")) return;
    gameSfx.chip();
    const amt = parseFloat(amountRef.current);
    if (!Number.isFinite(amt) || !(amt >= 10)) {
      showToast("Minimum bet is Rs. 10.00", false);
      return;
    }
    if (amt > balanceRef.current) {
      showToast("Insufficient balance", false);
      return;
    }
    let auto: number | null = null;
    if (autoCashOnRef.current) {
      const a = parseFloat(autoCashRef.current);
      if (a > 1.0) auto = floor2(a);
    }
    const next: Bet = { amount: amt, auto, status: "pending" };
    if (phaseRef.current !== "betting") queue.enqueue(next);
    else acceptBet(next);
  }, [acceptBet, queue.enqueue, showToast]);

  const cancelBet = useCallback(async () => {
    const cur = betRef.current;
    if (cur && cur.status === "pending") {
      if (!await pool.refund()) return;
      setBet(null);
      queue.setStatus("Bet cancelled — stake returned");
    }
  }, [setBalance, setBet]);

  const cashOut = useCallback(
    async (at?: number) => {
      const cur = betRef.current;
      if (!cur || cur.status !== "active" || phaseRef.current !== "running") return;
      const value = at ?? floor2(multRef.current);
      const payout = cur.amount * value;
      gameSfx.win();
      const profit = payout - cur.amount;
      if (!await pool.complete(payout)) return;
      setBet({ ...cur, status: "won", cashout: value, profit });
      setStats((s) => ({ ...s, wins: s.wins + 1 }));
      const id = roundIdRef.current;
      setMyRounds((r) =>
        [{ id, amount: cur.amount, cashout: value, profit, crash: 0 }, ...r].slice(0, 50)
      );
      if (!activeRef.current) return;
      showToast(pool.enabled ? `Provisional claim Rs. ${money(payout)} — daily settlement pending` : `You won Rs. ${money(payout)} @ ${fmt(value)}x`, true);
    },
    [setBalance, setBet, showToast]
  );

  const cashOutRef = useRef(cashOut);
  const placeBetRef = useRef(placeBet);
  useEffect(() => {
    cashOutRef.current = cashOut;
    placeBetRef.current = placeBet;
  });

  /* ---------------------------- game loop ---------------------------- */
  useEffect(() => {
    let disposed = false;
    let lossRetryAt = 0;
    const now0 = performance.now();
    betEndRef.current = savedMachine?.phase === "betting"
      ? now0 + Math.max(0, savedMachine.ends - Date.now()) : now0 + BETTING_MS;
    setFakes(fakesRef.current = genFakes());

    const startBetting = (now: number) => {
      if (pool.busy || betRef.current?.status === "active") return;
      phaseRef.current = "betting";
      betEndRef.current = now + BETTING_MS;
      lastTickSecondRef.current = BETTING_MS / 1000;
      multRef.current = 1;
      setMult(1);
      setPhase("betting");
      setFakes(fakesRef.current = genFakes());
      const b = betRef.current;
      if (b && (b.status === "won" || b.status === "lost")) setBet(null);
      const queued = queue.consume();
      if (queued) acceptBet(queued);
      else if (autoBetRef.current && modeRef.current === "auto") placeBetRef.current();
    };

    const startRound = (now: number) => {
      if (pool.busy) return;
      gameSfx.go();
      const b = betRef.current;
      if (b && b.status === "pending") {
        b.status = "active";
        setBet({ ...b, status: "active" });
      }
      const active = betRef.current?.status === "active";
      crashRef.current = rollCrash(active, betRef.current?.auto ?? null);
      startRef.current = now;
      roundIdRef.current += 1;
      pool.checkpoint({ machine: { phase: "running", started: Date.now(), ends: 0, crash: crashRef.current, round: roundIdRef.current } });
      phaseRef.current = "running";
      setPhase("running");
    };

    const closeCrashLoss = async () => {
      lossRetryAt = performance.now() + 1000;
      while (!disposed && pool.busy) await new Promise(resolve => setTimeout(resolve, 50));
      if (disposed) return;
      const b = betRef.current;
      if (b && b.status === "active") {
        if (!await pool.complete(0)) return;
        if (disposed) return;
        const c = crashRef.current;
        setBet({ ...b, status: "lost", profit: -b.amount });
        setStats((s) => ({ ...s, losses: s.losses + 1 }));
        const id = roundIdRef.current;
        setMyRounds((r) =>
          [{ id, amount: b.amount, cashout: null, profit: -b.amount, crash: c }, ...r].slice(0, 50)
        );
        showToast(pool.enabled ? "Daily payout pending — provisional claim Rs. 0" : "No win", false);
      }
      nextAtRef.current = performance.now() + CRASHED_MS;
    };

    const crashRound = () => {
      gameSfx.crash();
      phaseRef.current = "crashed";
      const c = crashRef.current;
      multRef.current = c;
      setMult(c);
      setPhase("crashed");
      setHistory((h) => [c, ...h].slice(0, 30));
      nextAtRef.current = Number.POSITIVE_INFINITY;
      void closeCrashLoss();
    };

    const loop = (now: number) => {
      if (pool.busy) {
        return;
      }
      const ph = phaseRef.current;
      let t = 0;
      let m = 1;

      if (ph === "betting") {
        const remain = betEndRef.current - now;
        setCountdown(Math.max(0, remain / 1000));
        if (remain <= 0) startRound(now);
      } else if (ph === "running") {
        t = (now - startRef.current) / 1000;
        m = Math.exp(GROWTH * t);
        const automatic = betRef.current;
        if (automatic?.status === "active" && automatic.auto && automatic.auto < crashRef.current && m >= automatic.auto && !pool.busy) {
          void cashOutRef.current(automatic.auto);
        }
        const shown = floor2(m);
        const mine = betRef.current?.status;
        const cashed = fakesRef.current.filter((f) => f.target <= shown).length + (mine === "won" ? 1 : 0);
        const players = fakesRef.current.length + (mine === "active" || mine === "won" ? 1 : 0);
        if (shown + 0.01 < crashRef.current && cashoutLimitReached(cashed, players)) {
          crashRef.current = floor2(shown + 0.01);
          pool.checkpoint({ machine: { phase: "running", started: Date.now() - (now - startRef.current), ends: 0, crash: crashRef.current, round: roundIdRef.current } });
        }
        if (m >= crashRef.current) {
          crashRound();
          t = Math.log(crashRef.current) / GROWTH;
          m = crashRef.current;
        } else {
          multRef.current = floor2(m);
          setMult(floor2(m));
          const b = betRef.current;
          if (b && b.status === "active" && b.auto && floor2(m) >= b.auto) {
            cashOutRef.current(b.auto);
          }
        }
      } else {
        t = Math.log(Math.max(1.0001, crashRef.current)) / GROWTH;
        m = crashRef.current;
        if (betRef.current?.status === "active" && !pool.busy && now >= lossRetryAt) void closeCrashLoss();
        if (now >= nextAtRef.current) startBetting(now);
      }

      if (canvasRef.current) drawScene(canvasRef.current, t, m, phaseRef.current, now);
    };
    const stopLoop = visibleAnimationFrame(loop);
    return () => {
      disposed = true;
      stopLoop();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [acceptBet, queue.consume, setBet, showToast]);

  /* ----------------------------- UI helpers ----------------------------- */
  const amt = parseFloat(amount) || 0;
  const setAmt = (v: number) => setAmount(String(Math.max(10, floor2(v))));

  const multColor =
    phase === "crashed"
      ? "text-red-500"
      : mult >= 10
        ? "text-pink-400"
        : mult >= 2
          ? "text-purple-400"
          : "text-white";

  const chip = (v: number) =>
    v >= 10
      ? "text-pink-400 bg-pink-500/10 border-pink-500/30"
      : v >= 2
        ? "text-purple-400 bg-purple-500/10 border-purple-500/30"
        : "text-sky-400 bg-sky-500/10 border-sky-500/30";

  const hasLive = bet && (bet.status === "pending" || bet.status === "active");

  // main button state
  let btnLabel = "";
  let btnSub = "";
  let btnClass = "bg-gradient-to-r from-emerald-500 via-green-400 to-teal-500 text-slate-950 font-black border-emerald-300 shadow-lg shadow-emerald-500/40 hover:brightness-110 active:scale-95";
  let btnAction: () => void = placeBet;
  if (bet?.status === "active" && phase === "running") {
    btnLabel = "CASH OUT";
    btnSub = `Rs. ${money(bet.amount * mult)}`;
    btnClass = "bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 font-black border-amber-300 shadow-lg shadow-amber-500/50 animate-pulse hover:brightness-110 active:scale-95";
    btnAction = () => cashOut();
  } else if (bet?.status === "pending") {
    btnLabel = "CANCEL";
    btnSub = phase === "betting" ? "Waiting for round start" : "Waiting for next round";
    btnClass = "bg-gradient-to-r from-rose-600 to-red-600 text-white font-black border-rose-300 shadow-lg shadow-rose-600/40 hover:brightness-110 active:scale-95";
    btnAction = cancelBet;
  } else if (phase === "betting") {
    btnLabel = "BET";
    btnSub = `Rs. ${money(amt)}`;
    btnClass = "bg-gradient-to-r from-emerald-500 via-green-400 to-teal-500 text-slate-950 font-black border-emerald-300 shadow-lg shadow-emerald-500/40 hover:brightness-110 active:scale-95";
  } else {
    btnLabel = "BET";
    btnSub = `Rs. ${money(amt)} · next round`;
    btnClass = "bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 text-white font-black border-sky-300 shadow-lg shadow-sky-500/40 hover:brightness-110 active:scale-95";
  }

  // live bets list
  const fakeRows = fakes.map((f) => {
    let state: "wait" | "playing" | "won" | "lost" = "wait";
    if (phase === "running") state = f.target <= mult ? "won" : "playing";
    if (phase === "crashed") state = f.target < mult ? "won" : "lost";
    return { ...f, state };
  });
  const totalBets = fakes.length + (hasLive || bet ? 1 : 0);
  const totalAmount =
    fakes.reduce((s, f) => s + f.amount, 0) + (bet ? bet.amount : 0);

  return (
    <div className="crash-bonus-layout h-full w-full flex flex-col justify-between overflow-hidden bg-[#0b0e17] text-slate-200 px-1.5 sm:px-3 py-1 selection:bg-red-500/30">
      {/* Header */}
      <header className="shrink-0 border-b border-white/5 bg-[#0f1322]/90 backdrop-blur py-1.5 px-2 sm:px-3">
        <div className="mx-auto flex flex-wrap max-w-[1300px] items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-orange-500 text-base sm:text-lg shadow-lg shadow-red-500/30">
              🚀
            </div>
            <div className="leading-tight">
              <div className="text-base sm:text-lg font-extrabold tracking-wide text-white">
                CRASH <span className="text-red-500">BONUS</span>
              </div>
              <div className="hidden text-[9px] uppercase tracking-[0.2em] text-slate-500 sm:block">
                Fly high · Cash out in time
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <div className="rounded-lg bg-black/40 px-2.5 py-1 text-right ring-1 ring-white/5">
              <div className="text-[8px] uppercase tracking-widest text-slate-500">Balance</div>
              <div className="text-xs sm:text-sm font-bold text-emerald-400">
                Rs. {money(balance)}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="crash-main mx-auto flex flex-col lg:grid max-w-[1300px] w-full flex-1 min-h-0 gap-2 px-1 py-1 lg:grid-cols-[280px_minmax(0,1fr)] overflow-hidden">
        {/* Right column (game) shown first on mobile */}
        <section className="crash-play order-1 flex min-w-0 flex-1 flex-col gap-1.5 sm:gap-2 overflow-hidden lg:order-2">
          {/* History */}
          <div className="flex items-center gap-1.5 overflow-hidden rounded-xl bg-[#121729] p-1.5 ring-1 ring-white/5 shrink-0">
            <div className="shrink-0 px-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-500">
              History
            </div>
            <div className="flex flex-1 gap-1 overflow-hidden">
              {history.length === 0 && (
                <span className="text-xs text-slate-600">No rounds yet…</span>
              )}
              {history.slice(0, 18).map((h, i) => (
                <span
                  key={`${i}-${h}`}
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${chip(h)}`}
                >
                  {fmt(h)}x
                </span>
              ))}
            </div>
          </div>

          {/* Game screen */}
          <div className="crash-screen relative flex-1 min-h-[160px] sm:min-h-[220px] overflow-hidden rounded-2xl bg-gradient-to-b from-[#151a2e] to-[#0c0f1b] ring-1 ring-white/10">
            <canvas ref={canvasRef} className="block h-full w-full" />

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              {phase === "betting" ? (
                <div className="text-center">
                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-slate-400">
                    Waiting for next round
                  </div>
                  <div className="text-5xl font-black text-white sm:text-6xl">
                    {Math.ceil(countdown)}
                    <span className="text-2xl text-slate-500">s</span>
                  </div>
                  <div className="mx-auto mt-4 h-1.5 w-56 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400"
                      style={{ width: `${(countdown / (BETTING_MS / 1000)) * 100}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  {phase === "crashed" && (
                    <div className="mb-1 text-sm font-extrabold uppercase tracking-[0.35em] text-red-500 sm:text-base">
                      Crashed
                    </div>
                  )}
                  <div
                    className={`text-6xl font-black tabular-nums drop-shadow-[0_0_25px_rgba(255,255,255,0.15)] sm:text-8xl ${multColor}`}
                  >
                    {fmt(mult)}x
                  </div>
                  {bet?.status === "won" && phase === "running" && (
                    <div className="mt-2 text-sm font-bold text-emerald-400">
                      Cashed out @ {fmt(bet.cashout ?? 0)}x
                    </div>
                  )}
                </div>
              )}
            </div>

            {toast && (
              <div
                className={`absolute left-1/2 top-4 -translate-x-1/2 rounded-full px-5 py-2 text-sm font-bold shadow-xl ${toast.win
                  ? "bg-emerald-500 text-white shadow-emerald-500/30"
                  : "bg-rose-600 text-white shadow-rose-600/30"
                  }`}
              >
                {toast.text}
              </div>
            )}

            {hasLive && (
              <div className="absolute bottom-10 left-4 rounded-md bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-slate-300 ring-1 ring-white/10">
                Your bet: Rs. {money(bet!.amount)}
                {bet!.auto ? ` · auto @ ${fmt(bet!.auto)}x` : ""}
              </div>
            )}
          </div>

          {/* Bet panel */}
          <div className="shrink-0 rounded-2xl bg-[#121729] p-3 ring-1 ring-white/5 sm:p-4">
            <div className="mb-3 inline-flex rounded-full bg-black/40 p-1 text-xs font-bold">
              {(["manual", "auto"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    if (m === "manual") setAutoBet(false);
                  }}
                  className={`rounded-full px-5 py-1.5 capitalize transition ${mode === m ? "bg-slate-600 text-white" : "text-slate-400 hover:text-white"
                    }`}
                >
                  {m === "manual" ? "Bet" : "Auto"}
                </button>
              ))}
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
              {/* Amount */}
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Bet Amount
                </div>
                <div className="flex items-center rounded-xl bg-black/40 p-1 ring-1 ring-white/10">
                  <button
                    onClick={() => setAmt(amt - (amt > 50 ? 10 : 1))}
                    disabled={!!hasLive}
                    className="h-9 w-9 rounded-lg bg-white/5 text-lg font-bold hover:bg-white/10 disabled:opacity-40"
                  >
                    −
                  </button>
                  <input
                    value={amount}
                    disabled={!!hasLive}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    className="min-w-0 flex-1 bg-transparent text-center text-lg font-extrabold text-white outline-none disabled:opacity-60"
                    inputMode="decimal"
                  />
                  <button
                    onClick={() => setAmt(amt + (amt >= 50 ? 10 : 1))}
                    disabled={!!hasLive}
                    className="h-9 w-9 rounded-lg bg-white/5 text-lg font-bold hover:bg-white/10 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
                <div className="mt-1.5 grid grid-cols-4 gap-1 sm:gap-1.5">
                  {[
                    { l: "½", f: () => setAmt(amt / 2) },
                    { l: "2×", f: () => setAmt(amt * 2) },
                    { l: "Min", f: () => setAmt(10) },
                    { l: "Max", f: () => setAmt(balance) },
                  ].map((q) => (
                    <button
                      key={q.l}
                      disabled={!!hasLive}
                      onClick={q.f}
                      className="rounded-lg bg-indigo-950/40 border border-indigo-500/40 py-1 text-xs font-bold text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-40 transition-colors"
                    >
                      {q.l}
                    </button>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-5 gap-1 sm:gap-1.5">
                  {BET_PRESETS.map((v) => (
                    <button
                      key={v}
                      disabled={!!hasLive}
                      onClick={() => setAmt(v)}
                      className="rounded-lg bg-cyan-950/40 border border-cyan-500/40 py-1 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-40 transition-colors"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto options */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Auto Cash Out
                  </div>
                  <Toggle on={autoCashOn} onChange={setAutoCashOn} disabled={!!hasLive} />
                </div>
                <div
                  className={`flex items-center rounded-xl bg-black/40 p-1 ring-1 ring-white/10 ${autoCashOn ? "" : "opacity-50"
                    }`}
                >
                  <input
                    value={autoCash}
                    disabled={!autoCashOn || !!hasLive}
                    onChange={(e) => setAutoCash(e.target.value.replace(/[^0-9.]/g, ""))}
                    className="min-w-0 flex-1 bg-transparent px-3 py-1.5 text-base sm:text-lg font-extrabold text-white outline-none"
                    inputMode="decimal"
                  />
                  <span className="pr-3 font-bold text-slate-500">x</span>
                </div>
                <div className="mt-1.5 grid grid-cols-4 gap-1 sm:gap-1.5">
                  {["1.50", "2.00", "5.00", "10.00"].map((v) => (
                    <button
                      key={v}
                      disabled={!!hasLive}
                      onClick={() => {
                        setAutoCash(v);
                        setAutoCashOn(true);
                      }}
                      className="rounded-lg bg-amber-950/40 border border-amber-500/40 py-1 text-xs font-bold text-amber-300 hover:bg-amber-500/20 disabled:opacity-40 transition-colors"
                    >
                      {v}x
                    </button>
                  ))}
                </div>

                {mode === "auto" && (
                  <div className="mt-2 flex items-center justify-between rounded-xl bg-black/30 px-3 py-1.5 ring-1 ring-white/5">
                    <div>
                      <div className="text-xs font-bold text-slate-200">Auto Bet</div>
                      <div className="text-[10px] text-slate-500">Bet every round</div>
                    </div>
                    <Toggle
                      on={autoBet}
                      onChange={(v) => {
                        setAutoBet(v);
                        if (v && phaseRef.current === "betting") placeBetRef.current();
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Main button */}
              <button
                onClick={btnAction}
                className={`flex min-h-[75px] sm:min-h-[90px] flex-col items-center justify-center rounded-2xl border-b-4 px-4 py-2 sm:py-3 text-center shadow-lg transition active:translate-y-0.5 active:border-b-2 ${btnClass}`}
              >
                <span className="text-2xl sm:text-3xl font-black tracking-wide">{btnLabel}</span>
                <span className="mt-0.5 text-xs sm:text-sm font-semibold opacity-90">{btnSub}</span>
              </button>
              <QueuedWager {...queue} />
            </div>
          </div>
        </section>

        {/* Left column (bets) */}
        <aside className="order-2 hidden lg:flex min-w-0 flex-col overflow-hidden rounded-2xl bg-[#121729] ring-1 ring-white/5 lg:order-1 h-full">
          <div className="flex gap-1 p-2">
            {(
              [
                ["all", "All Bets"],
                ["my", "My Bets"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex-1 rounded-full py-1.5 text-xs font-bold transition ${tab === k ? "bg-slate-600 text-white" : "bg-black/30 text-slate-400 hover:text-white"
                  }`}
              >
                {l}
              </button>
            ))}
          </div>

          {tab === "all" ? (
            <>
              <div className="flex items-center justify-between px-4 pb-2 pt-1 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-500">Bets</div>
                  <div className="text-lg font-extrabold text-white">{totalBets}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500">
                    Total Bet
                  </div>
                  <div className="text-lg font-extrabold text-emerald-400">
                    Rs. {money(totalAmount)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-[1.2fr_0.8fr_0.6fr_1fr] px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <span>Player</span>
                <span className="text-right">Bet</span>
                <span className="text-right">X</span>
                <span className="text-right">Win</span>
              </div>
              <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-2 [scrollbar-width:thin] max-lg:max-h-[360px]">
                {bet && (
                  <Row
                    name="You"
                    amount={bet.amount}
                    mult={bet.status === "won" ? bet.cashout : undefined}
                    win={bet.status === "won" ? bet.amount * (bet.cashout ?? 0) : undefined}
                    state={
                      bet.status === "won" ? "won" : bet.status === "lost" ? "lost" : "playing"
                    }
                    me
                  />
                )}
                {fakeRows.map((f) => (
                  <Row
                    key={f.id}
                    name={f.name}
                    amount={f.amount}
                    mult={f.state === "won" ? f.target : undefined}
                    win={f.state === "won" ? f.amount * f.target : undefined}
                    state={f.state === "wait" ? "playing" : f.state}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 px-3 pb-2">
                <Stat label="Rounds Played" value={String(myRounds.length)} color="text-slate-200" />
                <Stat label="Session Status" value="ACTIVE" color="text-emerald-400" />
              </div>
              <div className="grid grid-cols-[0.8fr_0.8fr_0.7fr_1fr] px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <span>Bet</span>
                <span className="text-right">X</span>
                <span className="text-right">Crash</span>
                <span className="text-right">{pool.enabled ? "Game net (not paid)" : "Profit"}</span>
              </div>
              <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-2 max-lg:max-h-[360px]">
                {myRounds.length === 0 && (
                  <div className="py-10 text-center text-sm text-slate-600">
                    You haven&apos;t played yet. Place your first bet!
                  </div>
                )}
                {myRounds.map((r, i) => (
                  <div
                    key={`${r.id}-${i}`}
                    className={`grid grid-cols-[0.8fr_0.8fr_0.7fr_1fr] items-center rounded-lg px-2 py-2 text-xs ${r.cashout ? "bg-emerald-500/10 ring-1 ring-emerald-500/20" : "bg-black/30"
                      }`}
                  >
                    <span className="font-semibold text-slate-300">Rs. {money(r.amount)}</span>
                    <span className="text-right font-bold text-slate-200">
                      {r.cashout ? `${fmt(r.cashout)}x` : "—"}
                    </span>
                    <span className="text-right text-slate-500">
                      {r.crash ? `${fmt(r.crash)}x` : ""}
                    </span>
                    <span
                      className={`text-right font-bold ${r.profit >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                    >
                      {r.profit >= 0 ? `+${money(r.profit)}` : "No win"}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>
      </main>

      <footer className="pb-6 pt-2 text-center text-[11px] text-slate-600">
        Demo game · virtual money only · 18+ play responsibly
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small pieces                                                       */
/* ------------------------------------------------------------------ */
function Toggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 rounded-full transition disabled:opacity-40 ${on ? "bg-emerald-500" : "bg-slate-600"
        }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"
          }`}
      />
    </button>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl bg-black/30 px-2 py-2 text-center ring-1 ring-white/5">
      <div className="text-[9px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className={`text-lg font-extrabold ${color}`}>{value}</div>
    </div>
  );
}

function Row({
  name,
  amount,
  mult,
  win,
  state,
  me,
}: {
  name: string;
  amount: number;
  mult?: number;
  win?: number;
  state: "playing" | "won" | "lost";
  me?: boolean;
}) {
  const base =
    state === "won"
      ? "bg-emerald-500/10 ring-1 ring-emerald-500/25"
      : state === "lost"
        ? "bg-black/30 opacity-60"
        : "bg-black/30";
  return (
    <div
      className={`grid grid-cols-[1.2fr_0.8fr_0.6fr_1fr] items-center rounded-lg px-2 py-1.5 text-xs ${base} ${me ? "ring-1 !ring-amber-400/50" : ""
        }`}
    >
      <span className="flex items-center gap-1.5 truncate">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${me ? "bg-amber-400 text-black" : "bg-slate-700 text-slate-300"
            }`}
        >
          {name[0].toUpperCase()}
        </span>
        <span className={me ? "font-bold text-amber-300" : "text-slate-300"}>{name}</span>
      </span>
      <span className="text-right text-slate-300">{money(amount)}</span>
      <span className="text-right">
        {mult ? (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${mult >= 10
              ? "bg-pink-500/20 text-pink-400"
              : mult >= 2
                ? "bg-purple-500/20 text-purple-400"
                : "bg-sky-500/20 text-sky-400"
              }`}
          >
            {fmt(mult)}x
          </span>
        ) : (
          ""
        )}
      </span>
      <span className="text-right font-bold text-emerald-400">{win ? money(win) : ""}</span>
    </div>
  );
}
