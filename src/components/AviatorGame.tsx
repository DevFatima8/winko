"use client";

import Link from "next/link";
import { localApi } from "@/lib/client";
import { playGameSound, speakGameVoice } from "@/lib/gameAudio";
import { gameSfx } from "@/lib/gameSfx";
import { broadcastBalanceUpdate } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import { aviatorPayout, validAutoCashout } from "@/lib/aviatorRules";
import { useCallback, useEffect, useRef, useState } from "react";
import { AviatorScenicView } from "./AviatorScenicView";
import { disposeAviatorScenery, drawAviatorScenery } from "@/lib/aviatorScenery";

/* Spribe-style Aviator / Aviator X */
type Table = "aviator" | "aviator-x";
type PoolState = { poolPending?: boolean; poolClaim?: number; poolVersion?: string };
type Bet = PoolState & { id: string; slot: number; bet: number; win: number; outcome: string; data: string | null; flightModel?: string; autoCashout?: number; netProfit?: number };
type FlightProof = { version: string; serverSeedHash: string; clientSeed: string; nonce: number; nextServerSeedHash: string; serverSeed?: string };
export type AviatorState = {
  serverNow: number;
  table: Table;
  config: { name: string; slots: number; minBet: number; maxBet: number; waitMs: number; pauseMs?: number; growth: number; maxMult: number; maxCashout?: number; theoreticalRtp?: number; theoreticalRtpAt199?: number; model?: string };
  round: { id: number; key?: string; status: "waiting" | "running" | "crashed"; idle?: boolean; startsAt: number; endedAt: number | null; crashPoint: number | null; multiplier: number };
  fairness?: FlightProof | null;
  history: { id: number; crashPoint: number; fairness?: FlightProof | null }[];
  bets: (PoolState & { id: string; name: string; bet: number; win: number; outcome: string; data: string | null; mult: number | null })[];
  totals: { count: number; amount: number; cashed: number };
  myBets: Bet[];
  queued: { slot: number; bet: number }[];
  myHistory: (PoolState & { id: string; round: number; bet: number; win: number; outcome: string; at: string })[];
  top: { name: string; bet: number; win: number; mult: number; round: number }[];
  balance: number;
};
type State = AviatorState;
type FlightSnapshot = Pick<State, "serverNow" | "round">;

export function aviatorNextCountdown(round: State["round"], now: number, waitMs: number, pauseMs = 3500, crashedAt: number | null = null) {
  if (round.status !== "crashed" || round.endedAt === null) return 0;
  if (crashedAt !== null && now - crashedAt < CRASH_VISIBLE_MS) return 0;
  const waitingAt = round.endedAt + pauseMs;
  return now >= waitingAt ? Math.ceil(Math.max(0, (waitingAt + waitMs - now) / 1000) * 10) / 10 : 0;
}

export function aviatorApplyBet(state: State, receipt: { round: number; balance: number; bet: Bet }): State {
  if (receipt.round < state.round.id || receipt.round > state.round.id + 1) return state;
  const bet = receipt.bet;
  return receipt.round === state.round.id
    ? { ...state, balance: receipt.balance, myBets: [...state.myBets.filter(item => item.slot !== bet.slot), bet], queued: state.queued.filter(item => item.slot !== bet.slot) }
    : { ...state, balance: receipt.balance, queued: [...state.queued.filter(item => item.slot !== bet.slot), { slot: bet.slot, bet: bet.bet }] };
}

export function aviatorDisplayMultiplier(round: State["round"], projected: number) {
  if (round.status === "crashed") return round.crashPoint ?? round.multiplier;
  // Do not visually outrun the server while the crash update is in transit.
  return Math.min(projected, round.multiplier);
}

type FlightDisplay = {
  round: State["round"];
  id: number;
  startsAt: number;
  /** Flight time (server ms) the counter is showing; it only moves forward. */
  time: number;
  rate: number;
  value: number;
  frame: number;
  crashedAt: number | null;
  /** Latest server-confirmed flight time and the frame it arrived on. */
  safeTime: number;
  safeFrame: number;
  /** Smoothed spacing (ms) between server confirmations. */
  gap: number;
  started: boolean;
};
/**
 * The counter may never show more than the server has confirmed, otherwise it would pass the crash
 * point and have to drop back. It therefore trails the confirmed value only by the measured spacing
 * between live samples (a few hundred ms on a normal connection), not by a fixed delay.
 */
const MIN_HEADROOM_MS = 90;
const MAX_HEADROOM_MS = 1000;
const HEADROOM_PER_GAP = 1.8;
/** Only in the last few ms of confirmed headroom does the counter ease down (a late sample). */
const BRAKE_MS = 40;
const INITIAL_GAP_MS = 200;
const MAX_RATE = 3.5;
/** After a background tab or long outage, skip ahead instead of replaying a long backlog. */
const MAX_BACKLOG_MS = 3000;
/** Pause between lightweight flight reads (one small SELECT each). */
const FLIGHT_POLL_MS = 150;
/** Small reads allowed in flight at once, so one slow reply does not starve the counter. */
const MAX_FLIGHT_READS = 3;
const CRASH_VISIBLE_MS = 1000;
const headroomFor = (gap: number) => Math.min(MAX_HEADROOM_MS, Math.max(MIN_HEADROOM_MS, gap * HEADROOM_PER_GAP));
/** When the screen leaves the countdown and starts counting from 1.00. */
export function aviatorTakeoffAt(round: Pick<State["round"], "startsAt">, previous: Pick<FlightDisplay, "gap"> | null) {
  return round.startsAt + headroomFor(previous?.gap ?? INITIAL_GAP_MS);
}

/**
 * Presentation-only multiplier: a smooth exp(growth·t) curve at normal flight speed, never above the
 * value the server has confirmed (or the crash point), never decreasing, and ending exactly on the crash point.
 */
export function aviatorDisplayFrame(
  round: State["round"],
  now: number,
  config: { growth: number; maxMult: number },
  frame: number,
  previous: FlightDisplay | null,
  history: State["history"] = [],
) {
  if (previous) {
    if (round.id < previous.id || round.id === previous.id && round.startsAt !== previous.startsAt) {
      round = previous.round;
    } else if (round.id !== previous.id) {
      if (previous.crashedAt === null) {
        // A slow full-state read can skip the entire crash pause. Finish that flight before resetting.
        const final = history.find(item => item.id === previous.id);
        round = final ? {
          ...previous.round, status: "crashed", multiplier: final.crashPoint, crashPoint: final.crashPoint,
          endedAt: previous.startsAt + Math.log(final.crashPoint) / config.growth * 1000 + 1,
        } : previous.round;
      } else if (now - previous.crashedAt < CRASH_VISIBLE_MS) {
        round = previous.round;
      }
    } else if (previous.round.status === "crashed" || round.multiplier < previous.round.multiplier) {
      round = previous.round;
    }
  }
  const crashed = round.status === "crashed" && round.crashPoint != null;
  const sameRound = previous && previous.id === round.id && previous.startsAt === round.startsAt ? previous : null;
  const confirmed = Math.min(config.maxMult, aviatorDisplayMultiplier(round, Infinity));
  // Latest flight time the server has proven safe to show.
  const safeTime = round.startsAt + Math.log(Math.max(1, confirmed)) / config.growth * 1000;
  let gap = sameRound ? sameRound.gap : previous?.gap ?? INITIAL_GAP_MS;
  let safeFrame = sameRound ? sameRound.safeFrame : frame;
  if (sameRound && safeTime > sameRound.safeTime) {
    if (!crashed && sameRound.safeTime > round.startsAt) {
      // Widen quickly after a slow sample, narrow slowly: the buffer covers network spikes, not just the average.
      const spacing = Math.min(1500, frame - sameRound.safeFrame);
      gap += (spacing - gap) * (spacing > gap ? 0.5 : 0.08);
    }
    safeFrame = frame;
  }
  const target = headroomFor(gap);
  let time = sameRound ? sameRound.time : Math.max(round.startsAt, safeTime - (crashed ? 0 : target));
  let rate = sameRound ? sameRound.rate : 1;
  // Visual takeoff is a fixed headroom after the server start (the countdown runs to this moment), so the
  // counter starts from 1.00 already holding enough confirmed flight to count on without a pause.
  const started = crashed || (sameRound?.started ?? false)
    || now >= aviatorTakeoffAt(round, previous) && safeTime > round.startsAt;
  if (!started) {
    time = round.startsAt;
    rate = 1;
  } else if (sameRound) {
    const dt = Math.min(100, Math.max(0, frame - sameRound.frame));
    const headroom = safeTime - time;
    if (headroom > MAX_BACKLOG_MS) time = safeTime - (crashed ? 0 : target);
    else {
      // Steer on where the server clock is expected to be now (smooth between samples), but never
      // past what it has actually confirmed. A late sample slows the count gently instead of freezing it.
      const expected = crashed ? headroom : headroom + Math.min(frame - safeFrame, gap * 1.5);
      let want = Math.min(MAX_RATE, Math.max(0, expected / target));
      if (crashed) want = Math.max(1, want);
      else want *= Math.min(1, headroom / BRAKE_MS);
      rate += (want - rate) * Math.min(1, dt / 200);
      time = Math.min(safeTime, time + dt * rate);
    }
  }
  if (now < round.startsAt) time = round.startsAt;
  let value = Math.min(confirmed, Math.exp(config.growth * Math.max(0, time - round.startsAt) / 1000));
  if (sameRound) value = Math.max(sameRound.value, value);
  if (round.status === "waiting" && now < round.startsAt) value = 1;
  // Epoch timestamp rounding can leave exp(log(multiplier)) just below the final value.
  const done = crashed && (time >= safeTime || value >= confirmed - 1e-9);
  if (done) value = confirmed;
  const display: FlightDisplay = {
    round, id: round.id, startsAt: round.startsAt, time, rate, value, frame, safeTime, safeFrame, gap, started,
    crashedAt: done ? sameRound?.crashedAt ?? (sameRound ? now : round.endedAt ?? now) : null,
  };
  const phase: State["round"]["status"] = done ? "crashed"
    : !started || now < round.startsAt ? "waiting" : "running";
  return { display, phase };
}

const THEME = {
  aviator: {
    accent: "#e50539",
    bg: "#0e0e0e",
    panel: "#1b1c1d",
    panel2: "#141516",
    line: "#2c2d30",
    curve: "#e50539",
    fill: "rgba(229,5,57,.28)",
    plane: "#e50539",
    title: "Aviator",
    logo: "text-[#e50539]",
    rays: "rgba(255,255,255,.03)",
  },
  "aviator-x": {
    accent: "#00d1ff",
    bg: "#050914",
    panel: "#0b1226",
    panel2: "#080d1c",
    line: "#1a2748",
    curve: "#00d1ff",
    fill: "rgba(0,209,255,.22)",
    plane: "#ff3d00",
    title: "Aviator X",
    logo: "text-[#00d1ff]",
    rays: "rgba(0,209,255,.05)",
  },
};

const AV = ["#c0392b", "#8e44ad", "#2980b9", "#16a085", "#d35400", "#27ae60", "#7f8c8d", "#f39c12"];
const cpClass = (m: number) =>
  m < 2
    ? "bg-[#34b4ff]/20 text-[#34b4ff] border border-[#34b4ff]/30"
    : m < 10
    ? "bg-[#913ef8]/20 text-[#c274ff] border border-[#913ef8]/30"
    : "bg-[#c017b4]/20 text-[#ff4dd8] border border-[#c017b4]/40 shadow-[0_0_8px_rgba(255,77,216,0.3)]";

const fmt2 = (n: number) =>
  (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type AviatorPanel = {
  tab: "bet" | "auto";
  amount: string;
  customAmount: string;
  autoBet: boolean;
  autoCash: boolean;
  autoCashAt: string;
  busy: boolean;
};
type Panel = AviatorPanel;

const mk = (amount = 100): Panel => ({
  tab: "bet",
  amount: amount.toFixed(2),
  customAmount: amount.toFixed(2),
  autoBet: false,
  autoCash: false,
  autoCashAt: "2.00",
  busy: false,
});

export function AviatorGame({
  table = "aviator",
  backHref = "/",
  isScreenFit = false,
}: {
  table?: Table;
  backHref?: string;
  isScreenFit?: boolean;
}) {
  const T = THEME[table];
  const [state, setState] = useState<State | null>(null);
  const [mult, setMult] = useState(1);
  const [phase, setPhase] = useState<"waiting" | "running" | "crashed">("waiting");
  const [countdown, setCountdown] = useState(0);
  const [panels, setPanels] = useState<Panel[]>(() => Array.from({ length: 3 }, () => mk(table === "aviator" ? BET_PRESETS[0] : 100)));
  const [tab, setTab] = useState<"all" | "prev" | "top">("all");
  const [toast, setToast] = useState<{ t: "ok" | "err"; m: string; sub?: string } | null>(null);
  const [showHist, setShowHist] = useState(false);
  const [menu, setMenu] = useState(false);
  const [rules, setRules] = useState(false);
  const [sound, setSound] = useState(true);
  const [activeMobileSlot, setActiveMobileSlot] = useState(0);
  const [mobileDualView, setMobileDualView] = useState(true);
  const [showMobileBetsDrawer, setShowMobileBetsDrawer] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stRef = useRef<State | null>(null);
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const autoCashFired = useRef<Record<number, number>>({});
  const autoBetDone = useRef<Record<number, number>>({});
  const pendingBets = useRef(new Set<number>());
  const sizeRef = useRef({ w: 640, h: 380, dpr: 1 });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCrashShown = useRef(0);
  const lastLossNotified = useRef(0);
  const lastRoundSound = useRef(0);
  const lastTick = useRef("");
  const targetClockOffset = useRef<number | null>(null);
  const flightClock = useRef<{ now: number; frame: number } | null>(null);
  const flightDisplay = useRef<FlightDisplay | null>(null);
  const flightSnapshot = useRef<FlightSnapshot | null>(null);
  const refreshSequence = useRef(0);
  const acceptedRefresh = useRef(0);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const refreshController = useRef<AbortController | null>(null);
  const refreshMounted = useRef(false);
  const refreshError = useRef(false);

  const showToast = useCallback((t: "ok" | "err", m: string, sub?: string) => {
    setToast({ t, m, sub });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const refresh = useCallback((): Promise<void> => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const controller = new AbortController();
    refreshController.current = controller;
    const timeout = setTimeout(() => controller.abort(new DOMException("Live flight state request timed out.", "TimeoutError")), 15000);
    const request = Promise.resolve().then(async () => {
      const sequence = ++refreshSequence.current;
      const sentAt = performance.now();
      try {
        const r = await localApi(`/api/aviator/state?table=${table}`, { cache: "no-store", signal: controller.signal });
        if (!r.ok) throw new Error(`Game state request failed (${r.status}).`);
        const s: State = await r.json();
        if (controller.signal.aborted || !refreshMounted.current || sequence < acceptedRefresh.current) return;
        if (stRef.current && (s.round.id < stRef.current.round.id || s.serverNow < stRef.current.serverNow)) return;
        refreshError.current = false;
        acceptedRefresh.current = sequence;
        const receivedAt = performance.now();
        targetClockOffset.current = s.serverNow + (receivedAt - sentAt) / 2 - receivedAt;
        const previousBalance = stRef.current?.balance;
        stRef.current = s;
        setState(s);
        if (typeof s.balance === "number" && s.balance !== previousBalance) broadcastBalanceUpdate(s.balance, "Aviator");
      } catch (error) {
        if (refreshMounted.current && refreshController.current === controller && !refreshError.current) {
          refreshError.current = true;
          const message = controller.signal.aborted
            ? "Live connection timed out. Reconnecting; check bet status before playing."
            : "Live connection interrupted. Reconnecting; check bet status before playing.";
          if (controller.signal.aborted) console.warn("[aviator state]", message);
          else console.error("[aviator state]", error);
          showToast("err", "Connecting...");
        }
      } finally {
        clearTimeout(timeout);
        if (refreshController.current === controller) {
          refreshInFlight.current = null;
          refreshController.current = null;
        }
      }
    });
    refreshInFlight.current = request;
    return request;
  }, [table, showToast]);

  useEffect(() => {
    refreshMounted.current = true;
    refresh();
    const id = setInterval(refresh, 600);
    return () => {
      refreshMounted.current = false;
      clearInterval(id);
      refreshController.current?.abort();
      refreshController.current = null;
      refreshInFlight.current = null;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [refresh]);

  useEffect(() => {
    let active = true;
    const controllers = new Set<AbortController>();
    let retry: ReturnType<typeof setTimeout>;
    let reported = false;
    const request = async () => {
      const liveRound = stRef.current?.round;
      const shown = flightDisplay.current;
      const round = shown && shown.id !== liveRound?.id && shown.crashedAt === null ? shown.round : liveRound;
      if (round) {
        const controller = new AbortController();
        controllers.add(controller);
        const timeout = setTimeout(() => controller.abort(new DOMException("Flight update timed out.", "TimeoutError")), 5000);
        try {
          const key = round.key ? `&key=${encodeURIComponent(round.key)}` : "";
          const response = await localApi(`/api/aviator/flight?table=${table}&round=${round.id}${key}`, { cache: "no-store", signal: controller.signal });
          if (!response.ok) throw new Error(`Flight update unavailable (${response.status}).`);
          if (response.status !== 204) {
            const snapshot: FlightSnapshot = await response.json();
            if (active && !controller.signal.aborted && snapshot.round.id === round.id
              && (snapshot.round.id === stRef.current?.round.id || snapshot.round.id === flightDisplay.current?.id)) {
              const current = flightSnapshot.current;
              if (!current || snapshot.round.id > current.round.id
                || snapshot.round.id === current.round.id && snapshot.serverNow >= current.serverNow) flightSnapshot.current = snapshot;
              reported = false;
            }
          }
        } catch (error) {
          if (active && !reported) {
            reported = true;
            console.warn("[aviator flight]", error instanceof Error ? error.message : error);
            showToast("err", "Connecting...");
          }
        } finally {
          clearTimeout(timeout);
          controllers.delete(controller);
        }
      }
    };
    // Overlap a few small reads so one slow response does not pause the counter; the newest sample wins.
    const poll = () => {
      if (!active) return;
      retry = setTimeout(poll, FLIGHT_POLL_MS);
      if (controllers.size < MAX_FLIGHT_READS) return request();
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(retry);
      controllers.forEach(controller => controller.abort());
      flightSnapshot.current = null;
    };
  }, [table, showToast]);

  const api = useCallback(async (url: string, init?: RequestInit) => {
    try {
      const r = await localApi(url, { ...init, signal: AbortSignal.timeout(20000) });
      if (r.status === 401) {
        window.location.href = "/login";
        return null;
      }
      const result = await r.json();
      if (!r.ok && !result.error) throw new Error("Request failed.");
      return result;
    } catch (error) {
      console.error("[aviator request]", error);
      showToast("err", "Connection issue. Check your bet status before trying again.");
      return null;
    }
  }, [showToast]);

  const setPanel = useCallback((i: number, patch: Partial<Panel>) => {
    setPanels((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }, []);

  const placeBet = useCallback(
    async (i: number) => {
      const p = panelsRef.current[i];
      if (p.busy || pendingBets.current.has(i)) return;
      const amount = Number(p.amount);
      const minBet = stRef.current?.config.minBet ?? 10;
      if (!Number.isFinite(amount) || amount < minBet) {
        showToast("err", `Minimum bet is Rs. ${minBet}. Please enter at least ${minBet}.`);
        return;
      }
      const autoCashout = p.autoCash ? Number(p.autoCashAt) : undefined;
      if (autoCashout !== undefined && !validAutoCashout(autoCashout)) {
        showToast("err", "Auto cashout must be 1.01x to 99.98x, with at most two decimal places.");
        return;
      }
      pendingBets.current.add(i);
      setPanel(i, { busy: true });
      try {
      const current = stRef.current;
      const roundNo = current
        ? current.round.id + (current.round.status === "waiting" && performance.now() + (targetClockOffset.current ?? 0) < current.round.startsAt ? 0 : 1)
        : undefined;
      const j = await api("/api/aviator/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, amount, slot: i, roundNo, queueIfClosed: table === "aviator", autoCashout }),
      });
      if (!j) return;
      if (j.error) showToast("err", j.error);
      else {
        if (table === "aviator" && stRef.current) {
          // A read started before this committed receipt must not erase the confirmed reservation.
          acceptedRefresh.current = ++refreshSequence.current;
          const confirmed = aviatorApplyBet(stRef.current, j);
          stRef.current = confirmed;
          setState(confirmed);
          broadcastBalanceUpdate(confirmed.balance, "Aviator");
        }
        showToast("ok", j.queued ? "Bet placed for your next round." : "Bet placed. Flight starts after the countdown.");
      }
      if (table === "aviator") void refresh().then(() => refresh());
      else await refresh();
      } finally {
        pendingBets.current.delete(i);
        setPanel(i, { busy: false });
      }
    },
    [api, table, refresh, setPanel, showToast]
  );

  const cancelBet = useCallback(
    async (i: number) => {
      setPanel(i, { busy: true });
      const current = stRef.current;
      const roundNo = current
        ? current.round.id + (current.queued.some((bet) => bet.slot === i) ? 1 : 0)
        : undefined;
      const reply = await api(`/api/aviator/bet?table=${table}&slot=${i}${roundNo === undefined ? "" : `&roundNo=${roundNo}`}`, { method: "DELETE" });
      if (reply?.error) showToast("err", reply.error);
      setPanel(i, { busy: false });
      await refresh();
    },
    [api, table, refresh, setPanel, showToast]
  );

  const cashOut = useCallback(
    async (i: number) => {
      const p = panelsRef.current[i];
      if (p.busy) return;
      setPanel(i, { busy: true });
      const j = await api("/api/aviator/cashout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, slot: i, roundNo: stRef.current?.round.id }),
      });
      setPanel(i, { busy: false });
      if (!j) return;
      if (j.error) {
        showToast("err", j.error);
      } else {
        if (sound) {
          playGameSound("cashout");
          if (!j.poolPending) speakGameVoice("planeWin");
        }
        window.dispatchEvent(
          new CustomEvent("wx:game-result", {
            detail: { game: "Aviator", bet: Number(p.amount), win: j.win, won: j.win > 0, poolPending: j.poolPending, poolClaim: j.poolClaim },
          })
        );
      }
      await refresh();
    },
    [api, table, refresh, setPanel, showToast, sound]
  );

  const sizeCanvas = useCallback(() => {
    const wrap = wrapRef.current,
      canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const w = wrap.clientWidth,
      h = wrap.clientHeight,
      dpr = Math.min(window.devicePixelRatio || 1, table === "aviator" ? 1.5 : 2);
    if (w < 10 || h < 10) return;
    const pixelWidth = Math.round(w * dpr);
    const pixelHeight = Math.round(h * dpr);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    sizeRef.current = { w, h, dpr };
  }, [table]);

  const canvasReady = state !== null;
  useEffect(() => {
    if (!canvasReady) return;
    sizeCanvas();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sizeCanvas) : null;
    if (wrapRef.current && ro) ro.observe(wrapRef.current);
    window.addEventListener("resize", sizeCanvas);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", sizeCanvas);
    };
  }, [sizeCanvas, canvasReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvasReady || table !== "aviator" || !canvas) return;
    return () => disposeAviatorScenery(canvas);
  }, [canvasReady, table]);

  useEffect(() => {
    let raf = 0;
    const loop = (frame: number) => {
      raf = requestAnimationFrame(loop);
      const fullState = stRef.current,
        canvas = canvasRef.current;
      if (!fullState || !canvas) return;
      const snapshot = flightSnapshot.current;
      const s = snapshot && snapshot.round.id === fullState.round.id && snapshot.serverNow > fullState.serverNow
        ? { ...fullState, ...snapshot } : fullState;
      const targetNow = frame + (targetClockOffset.current ?? 0);
      const previous = flightClock.current;
      const elapsed = previous ? Math.max(0, frame - previous.frame) : 0;
      // Slew small clock corrections instead of teleporting the plane on each poll.
      const predicted = previous ? previous.now + elapsed : targetNow;
      const now = predicted + Math.max(-elapsed * 0.1, Math.min(elapsed * 0.1, targetNow - predicted));
      flightClock.current = { now, frame };
      let ph = s.round.status;
      let m = 1;
      let flightMultiplier = 1;
      if (ph === "waiting") {
        setCountdown(Math.ceil(Math.max(0, (s.round.startsAt - now) / 1000) * 10) / 10);
        const sec = Math.ceil(Math.max(0, (s.round.startsAt - now) / 1000));
        if (sec > 0 && lastTick.current !== `${s.round.id}:${sec}`) {
          lastTick.current = `${s.round.id}:${sec}`;
          if (sound) (sec <= 3 ? gameSfx.tickUrgent : gameSfx.tick)();
        }
        if (now >= s.round.startsAt) ph = "running";
      }
      if (ph === "running") {
        flightMultiplier = Math.min(s.config.maxMult, Math.exp(s.config.growth * Math.max(0, (now - s.round.startsAt) / 1000)));
        m = Math.floor(flightMultiplier * 100) / 100;
      }
      if (ph === "crashed") flightMultiplier = m = s.round.crashPoint ?? m;
      const completed = snapshot?.round.status === "crashed" && snapshot.round.crashPoint !== null
        ? [{ id: snapshot.round.id, crashPoint: snapshot.round.crashPoint }, ...s.history] : s.history;
      const visual = aviatorDisplayFrame(s.round, now, s.config, frame, flightDisplay.current, completed);
      flightDisplay.current = visual.display;
      flightMultiplier = visual.display.value;
      const visualPhase = visual.phase;
      setMult(visualPhase === "crashed" ? flightMultiplier : Math.floor(flightMultiplier * 100) / 100);
      setPhase(visualPhase);
      if (visualPhase === "waiting" && visual.display.id === s.round.id) {
        setCountdown(Math.ceil(Math.max(0, (aviatorTakeoffAt(s.round, visual.display) - now) / 1000) * 10) / 10);
      } else if (table === "aviator") {
        // The next betting window follows the confirmed crash clock, even while the full read is slow.
        const shownRound = visual.display.round;
        const next = aviatorNextCountdown(shownRound, now, s.config.waitMs + aviatorTakeoffAt({ startsAt: 0 }, visual.display), s.config.pauseMs, visual.display.crashedAt);
        // Keep the countdown screen (instead of flipping back to the old crash) until the new round arrives.
        const awaitingRound = next === 0 && shownRound.status === "crashed" && shownRound.endedAt !== null && visual.display.crashedAt !== null
          && now - visual.display.crashedAt >= CRASH_VISIBLE_MS && now >= shownRound.endedAt + (s.config.pauseMs ?? 3500);
        setCountdown(awaitingRound ? 0.01 : next);
      }

      // auto-bet: at waiting phase
      if (ph === "waiting") {
        panelsRef.current.forEach((p, i) => {
          if (i >= s.config.slots || !p.autoBet) return;
          const has = s.myBets.some((b) => b.slot === i);
          if (!has && autoBetDone.current[i] !== s.round.id) {
            autoBetDone.current[i] = s.round.id;
            placeBet(i);
          }
        });
      }

      // auto cash out
      if (ph === "running") {
        panelsRef.current.forEach((p, i) => {
          const mine = s.myBets.find((b) => b.slot === i && b.outcome === "pending");
          const target = parseFloat(p.autoCashAt);
          if (p.autoCash && mine && !mine.flightModel && target >= 1.01 && target <= (s.config.maxCashout ?? 99.98) && m >= target && autoCashFired.current[i] !== s.round.id) {
            autoCashFired.current[i] = s.round.id;
            cashOut(i);
          }
        });
      }

      if (visualPhase === "crashed" && lastCrashShown.current !== visual.display.id) {
        lastCrashShown.current = visual.display.id;
        if (sound) {
          playGameSound("crash");
          speakGameVoice(table === "aviator" ? "planeImpact" : "planeCrash");
        }
      }
      if (visualPhase === "crashed" && visual.display.id === s.round.id && lastLossNotified.current !== s.round.id) {
        const lost = s.myBets.filter((b) => b.outcome === "lose");
        if (lost.length) {
          lastLossNotified.current = s.round.id;
          const legacyLost = lost.filter(bet => !bet.poolPending);
          if (legacyLost.length) window.dispatchEvent(new CustomEvent("wx:game-result", { detail: { game: "Aviator", bet: legacyLost.reduce((sum, bet) => sum + bet.bet, 0), win: 0, won: false } }));
          const poolLost = lost.filter(bet => bet.poolPending);
          if (poolLost.length) window.dispatchEvent(new CustomEvent("wx:game-result", { detail: { game: "Aviator", bet: poolLost.reduce((sum, bet) => sum + bet.bet, 0), win: 0, won: false, poolPending: true, poolClaim: 0 } }));
        }
      }
      if (ph === "running" && lastRoundSound.current !== s.round.id) {
        lastRoundSound.current = s.round.id;
        if (sound) {
          playGameSound("launch");
          speakGameVoice("planeLaunch");
        }
      }
      // The fly-off/crash animation starts on the frame where the final number is shown.
      const visualRound = {
        ...s, round: { ...visual.display.round, endedAt: visual.display.crashedAt ?? visual.display.round.endedAt },
      };
      draw(canvas, sizeRef.current, T, visualPhase, flightMultiplier, now, visualRound);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [T, table, placeBet, cashOut, showToast, sound]);

  if (!state) {
    return (
      <div className="flex h-full w-full flex-1 items-center justify-center text-slate-400" style={{ background: T.bg }}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
          <span className="text-sm font-semibold">Loading {T.title}…</span>
        </div>
      </div>
    );
  }

  const slots = state.config.slots;

  if (table === "aviator") {
    return (
      <AviatorScenicView
        state={state}
        phase={phase}
        multiplier={mult}
        countdown={countdown}
        panels={panels}
        canvasRef={canvasRef}
        wrapRef={wrapRef}
        backHref={backHref}
        sound={sound}
        onSound={() => setSound(!sound)}
        onPanelChange={setPanel}
        onBet={placeBet}
        onCancel={cancelBet}
        onCashout={cashOut}
        toast={toast}
      />
    );
  }

  return (
    <div
      className="relative flex h-full w-full flex-1 min-h-0 flex-col overflow-hidden text-[12px] text-[#bbbfc5] select-none"
      style={{ background: T.bg }}
    >
      {/* ===== 1. TOP HEADER BAR ===== */}
      <header
        className="flex h-9 sm:h-10 shrink-0 items-center justify-between border-b px-2 sm:px-3 z-30"
        style={{ background: T.panel2, borderColor: T.line }}
      >
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <Link
            href={backHref}
            title="Back to Lobby"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] active:bg-[#991b1b] border border-[#ef4444] text-white shadow-md active:translate-y-[1px] transition-all cursor-pointer font-black"
          >
            <span className="text-xs sm:text-sm">←</span>
          </Link>
          <span className={`text-base sm:text-lg font-black italic tracking-tight ${T.logo}`}>
            {T.title}
          </span>
          <span className="hidden min-[480px]:inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold text-emerald-400 bg-[#064e3b] border border-[#059669]">
            <span>🛡️</span> Provably Fair
          </span>
          <button
            type="button"
            onClick={() => setRules(true)}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-[#1e293b] hover:bg-[#2563eb] border border-[#334155] px-2.5 py-1 text-[10px] font-bold text-white shadow-sm active:translate-y-[1px] transition-all cursor-pointer"
          >
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/20 text-[8px] font-black">?</span>
            How to play
          </button>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="flex items-center gap-1 rounded-lg px-2.5 py-1 bg-[#090d16] border border-[#1e293b] shadow-inner">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Balance:</span>
            <span className="text-xs font-black text-[#22c55e]">
              {fmt2(state.balance)} <span className="text-[9px] text-slate-400 font-normal">Rs.</span>
            </span>
          </div>

          <Link
            href="/player/wallet"
            className="rounded-lg bg-[#16a34a] hover:bg-[#15803d] active:bg-[#14532d] px-2.5 py-1 text-[11px] font-black text-white border border-[#22c55e] shadow-md active:translate-y-[1px] transition-all cursor-pointer"
          >
            + Deposit
          </Link>

          <button
            type="button"
            onClick={() => setSound(!sound)}
            title={sound ? "Mute sound" : "Enable sound"}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1e293b] hover:bg-[#334155] border border-[#334155] text-white shadow-sm active:translate-y-[1px] transition-all cursor-pointer"
          >
            <span className="text-xs sm:text-sm">{sound ? "🔊" : "🔇"}</span>
          </button>

          <button
            type="button"
            onClick={() => setMenu((v) => !v)}
            className="flex h-7 w-7 flex-col items-center justify-center gap-[3px] rounded-lg bg-[#1e293b] hover:bg-[#334155] border border-[#334155] text-white shadow-sm active:translate-y-[1px] transition-all cursor-pointer"
            aria-label="menu"
          >
            <span className="h-[2px] w-3 bg-current" />
            <span className="h-[2px] w-3 bg-current" />
            <span className="h-[2px] w-3 bg-current" />
          </button>
        </div>
      </header>

      {/* Popover Menu */}
      {menu && (
        <div
          className="absolute right-2 top-11 z-50 w-56 rounded-xl p-2 text-xs shadow-2xl backdrop-blur-md"
          style={{ background: T.panel, border: `1px solid ${T.line}` }}
        >
          <button
            onClick={() => setSound(!sound)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 hover:bg-white/5 transition"
          >
            <span className="font-semibold text-slate-200">Sound Effects & Voice</span>
            <span className={`h-4 w-8 rounded-full p-0.5 transition ${sound ? "bg-[#28a909]" : "bg-slate-600"}`}>
              <span className={`block h-3 w-3 rounded-full bg-white transition ${sound ? "translate-x-4" : ""}`} />
            </span>
          </button>
          <div className="my-1 border-t" style={{ borderColor: T.line }} />
          <button
            onClick={() => {
              setRules(true);
              setMenu(false);
            }}
            className="block w-full text-left rounded-lg px-3 py-2 hover:bg-white/5 transition text-slate-200"
          >
            Game Rules
          </button>
          <button
            onClick={() => {
              setTab("prev");
              setMenu(false);
              setShowMobileBetsDrawer(true);
            }}
            className="block w-full text-left rounded-lg px-3 py-2 hover:bg-white/5 transition text-slate-200"
          >
            My Bet History
          </button>
          <div className="my-1 border-t" style={{ borderColor: T.line }} />
          <Link href={backHref} className="block rounded-lg px-3 py-2 hover:bg-white/5 transition text-slate-300">
            Back to Lobby
          </Link>
        </div>
      )}

      {/* ===== 2. MULTIPLIER HISTORY PILLS STRIP ===== */}
      <div
        className="relative flex h-7 sm:h-8 shrink-0 items-center justify-between gap-1.5 px-2 z-20 border-b overflow-hidden"
        style={{ background: T.panel2, borderColor: T.line }}
      >
        <div className="flex flex-1 items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          {state.history.slice(0, 30).map((h) => (
            <span
              key={h.id}
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] sm:text-[11px] font-bold ${cpClass(h.crashPoint)}`}
            >
              {fmt2(h.crashPoint)}x
            </span>
          ))}
        </div>
        <button
          onClick={() => setShowHist((v) => !v)}
          title="Round History"
          className="flex h-5 w-7 shrink-0 items-center justify-center rounded-full text-[10px] text-slate-300 hover:text-white transition"
          style={{ background: T.panel, border: `1px solid ${T.line}` }}
        >
          ⏱▾
        </button>

        {showHist && (
          <div
            className="absolute right-2 top-8 z-40 w-[min(94vw,500px)] rounded-xl p-3 shadow-2xl backdrop-blur-md"
            style={{ background: T.panel, border: `1px solid ${T.line}` }}
          >
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-bold text-white">Round Multiplier History</span>
              <button onClick={() => setShowHist(false)} className="text-slate-400 hover:text-white text-sm">
                ✕
              </button>
            </div>
            <div className="flex flex-wrap gap-1 max-h-48 overflow-y-auto pr-1">
              {state.history.map((h) => (
                <span
                  key={h.id}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cpClass(h.crashPoint)}`}
                >
                  {fmt2(h.crashPoint)}x
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ===== 3. MAIN WORKSPACE (SIDEBAR + FLIGHT STAGE & CONTROLS) ===== */}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden flex-col lg:flex-row">
        {/* DESKTOP SIDEBAR: LIVE BETS */}
        <aside
          className="hidden lg:flex w-[260px] xl:w-[290px] 2xl:w-[320px] shrink-0 h-full flex-col min-h-0 border-r"
          style={{ background: T.panel2, borderColor: T.line }}
        >
          <div className="flex gap-1 p-2 shrink-0">
            {(["all", "prev", "top"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex-1 rounded-full py-1 text-xs font-bold transition cursor-pointer ${
                  tab === k
                    ? "bg-[#28a909] text-white border border-[#38c815] shadow-sm"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white border border-transparent"
                }`}
              >
                {k === "all" ? "All Bets" : k === "prev" ? "Previous" : "Top"}
              </button>
            ))}
          </div>

          {tab === "all" && (
            <>
              <div className="flex items-center justify-between px-3 pb-1 shrink-0">
                <div>
                  <div className="text-[10px] uppercase text-slate-500 font-bold">All bets</div>
                  <div className="text-sm font-black text-white">{state.totals.count}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase text-slate-500 font-bold">Cashed Out</div>
                  <div className="text-sm font-black text-[#28a909]">{state.totals.cashed}</div>
                </div>
              </div>
              <div className="px-3 pb-1 shrink-0">
                <div className="h-1 overflow-hidden rounded-full" style={{ background: T.line }}>
                  <div
                    className="h-full bg-[#28a909] transition-all duration-300"
                    style={{
                      width: `${state.totals.count ? (state.totals.cashed / state.totals.count) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-3 py-1 text-[10px] uppercase text-slate-500 font-bold shrink-0">
                <span>User</span>
                <span className="text-right">Bet Rs.</span>
                <span className="text-right">X</span>
                <span className="text-right">Cash out</span>
              </div>
              <ul className="flex-1 min-h-0 space-y-[2px] overflow-y-auto px-2 pb-2">
                {state.bets.map((b) => (
                  <li
                    key={b.id}
                    className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2 rounded px-2 py-1 text-xs"
                    style={{
                      background: b.outcome === "win" ? "rgba(18,55,23,.7)" : T.panel,
                      border: b.outcome === "win" ? "1px solid #427f00" : "1px solid transparent",
                    }}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                        style={{ background: AV[(b.name.charCodeAt(0) + b.name.length) % AV.length] }}
                      >
                        {b.name.slice(0, 1)}
                      </span>
                      <span className="truncate text-slate-300 font-medium">{b.name}</span>
                    </span>
                    <span className="text-right text-slate-200">{fmt2(b.bet)}</span>
                    <span className="text-right">
                      {b.mult ? (
                        <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${cpClass(b.mult)}`}>
                          {fmt2(b.mult)}x
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </span>
                    <span className="text-right font-bold text-emerald-400">
                      {b.poolPending ? "Pool pending" : b.outcome === "win" ? fmt2(b.win) : b.outcome === "lose" ? <span className="text-slate-600">—</span> : ""}
                    </span>
                  </li>
                ))}
                {state.bets.length === 0 && (
                  <li className="py-8 text-center text-xs text-slate-500">Waiting for bets…</li>
                )}
              </ul>
            </>
          )}

          {tab === "prev" && (
            <ul className="flex-1 min-h-0 space-y-[2px] overflow-y-auto px-2 pb-2">
              <li className="grid grid-cols-[auto_1fr_auto_auto] gap-x-2 px-2 py-1 text-[10px] uppercase text-slate-500 font-bold">
                <span>Round</span>
                <span />
                <span className="text-right">Bet</span>
                <span className="text-right">Win</span>
              </li>
              {state.myHistory.map((h) => (
                <li
                  key={h.id}
                  className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-2 rounded px-2 py-1 text-xs"
                  style={{ background: h.outcome === "win" ? "rgba(18,55,23,.7)" : T.panel }}
                >
                  <span className="text-slate-400">#{h.round}</span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(h.at).toLocaleTimeString("en-PK", { timeStyle: "short" })}
                  </span>
                  <span className="text-right text-slate-200">{fmt2(h.bet)}</span>
                  <span className={`text-right font-bold ${h.outcome === "win" ? "text-[#28a909]" : "text-slate-600"}`}>
                    {h.poolPending ? "Pool pending" : h.outcome === "win" ? fmt2(h.win) : "—"}
                  </span>
                </li>
              ))}
              {state.myHistory.length === 0 && (
                <li className="py-8 text-center text-xs text-slate-500">Your bets will appear here</li>
              )}
            </ul>
          )}

          {tab === "top" && (
            <ul className="flex-1 min-h-0 space-y-[2px] overflow-y-auto px-2 pb-2">
              {state.top.map((b, i) => (
                <li key={i} className="rounded px-2 py-1.5 text-xs" style={{ background: T.panel }}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">{b.name}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${cpClass(b.mult)}`}>
                      {fmt2(b.mult)}x
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-[10px] text-slate-400">
                    <span>Bet {fmt2(b.bet)} · #{b.round}</span>
                    <span className="font-bold text-[#28a909]">Win {fmt2(b.win)}</span>
                  </div>
                </li>
              ))}
              {state.top.length === 0 && <li className="py-8 text-center text-xs text-slate-500">No top wins yet</li>}
            </ul>
          )}

          <div
            className="mt-auto shrink-0 flex items-center justify-between px-3 py-1.5 text-[10px] text-slate-500 border-t"
            style={{ borderColor: T.line }}
          >
            <span>
              This game is <span className="text-[#28a909]">Provably Fair</span>
            </span>
            <span>winkox</span>
          </div>
        </aside>

        {/* RIGHT COLUMN: CANVAS + BETTING CONSOLE */}
        <div className="flex flex-1 min-w-0 h-full flex-col overflow-hidden">
          {/* FLIGHT STAGE (CANVAS) */}
          <div
            ref={wrapRef}
            className="relative flex-1 min-h-[140px] w-full overflow-hidden select-none"
            style={{ background: T.bg }}
          >
            <canvas ref={canvasRef} className="block h-full w-full" />

            {/* Flight Center UI */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-2">
              {phase === "waiting" ? (
                <div className="flex flex-col items-center">
                  <svg className="mb-2 h-12 w-12 sm:h-14 sm:w-14 animate-spin text-red-500" viewBox="0 0 64 64">
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      fill="none"
                      stroke={T.accent}
                      strokeWidth="5"
                      strokeDasharray="120 60"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="text-xl sm:text-3xl font-black uppercase tracking-widest text-white">
                    Next Round
                  </div>
                  <div className="mt-1 text-xs sm:text-sm font-bold text-white/90">
                    Starts in {Math.ceil(Math.min(countdown, state.config.waitMs / 1000))}s
                  </div>
                  <div className="mt-2 h-1.5 w-44 sm:w-56 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full transition-all duration-100"
                      style={{
                        width: `${Math.max(0, Math.min(100, 100 - (countdown / (state.config.waitMs / 1000)) * 100))}%`,
                        background: T.accent,
                      }}
                    />
                  </div>
                </div>
              ) : phase === "crashed" ? (
                <div className="flex flex-col items-center">
                  <div className="text-sm sm:text-base font-black uppercase tracking-wider text-white/80">
                    Flew away!
                  </div>
                  <div
                    className="text-5xl sm:text-7xl font-black drop-shadow-[0_0_24px_rgba(229,5,57,.5)]"
                    style={{ color: T.accent }}
                  >
                    {fmt2(mult)}x
                  </div>
                </div>
              ) : (
                <div className="text-5xl sm:text-7xl font-black text-white drop-shadow-[0_2px_14px_rgba(0,0,0,.9)]">
                  {fmt2(mult)}x
                </div>
              )}
            </div>

            {/* Toast overlay */}
            {toast && (
              <div
                className={`absolute left-1/2 top-2 z-30 -translate-x-1/2 rounded-full px-3.5 py-1 text-center shadow-2xl transition-all ${
                  toast.t === "ok"
                    ? "bg-[#123717]/95 text-white ring-2 ring-[#427f00]"
                    : "bg-[#3a0b12]/95 text-white ring-2 ring-[#e50539]"
                }`}
              >
                <div className="text-xs font-bold">{toast.m}</div>
                {toast.sub && (
                  <div className={`text-xs font-black ${toast.t === "ok" ? "text-[#4ade80]" : "text-red-300"}`}>
                    {toast.sub}
                  </div>
                )}
              </div>
            )}

            <div className="absolute left-2 top-2 text-[10px] font-bold text-slate-500">
              Round #{state.round.id}
            </div>
          </div>

          {/* BETTING DOCK (FITS PERFECTLY WITHOUT SCROLLING) */}
          <div
            className="shrink-0 p-1 sm:p-2 border-t z-20"
            style={{ background: T.panel2, borderColor: T.line }}
          >
            {/* Mobile Sub-Header: Switcher & Drawer Toggle */}
            <div className="flex lg:hidden items-center justify-between gap-1 mb-1 px-1">
              {slots > 1 && (
                <div className="flex items-center gap-1">
                  {Array.from({ length: slots }, (_, i) => {
                    const mine = state.myBets.find((b) => b.slot === i);
                    const isPending = mine?.outcome === "pending";
                    const isWon = mine?.outcome === "win";
                    return (
                      <button
                        key={i}
                        onClick={() => setActiveMobileSlot(i)}
                        className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold transition ${
                          activeMobileSlot === i
                            ? "bg-[#28a909] text-white border border-[#38c815] shadow-sm"
                            : "bg-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        <span>Bet {i + 1}</span>
                        {isPending && (
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
                        )}
                        {isWon && (
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        )}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setMobileDualView(!mobileDualView)}
                    title="Toggle 2-Panel View"
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
                      mobileDualView ? "bg-[#28a909] text-white border border-[#38c815]" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {mobileDualView ? "◫ Dual" : "▢ Single"}
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 ml-auto">
                <div className="flex items-center gap-1 text-[10px]">
                  <span className="text-slate-400 font-bold">Bal:</span>
                  <span className="font-black text-[#28a909]">{fmt2(state.balance)}</span>
                </div>
                <button
                  onClick={() => setShowMobileBetsDrawer(true)}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-slate-300 bg-slate-800 hover:text-white transition"
                >
                  <span>👥 ({state.totals.count}) ▾</span>
                </button>
              </div>
            </div>

            {/* Panels Container */}
            <div
              className={`min-w-0 gap-1 sm:gap-2.5 mx-auto w-full ${
                slots === 3
                  ? "flex flex-wrap items-start sm:grid sm:grid-cols-3 max-w-[1020px]"
                  : "grid"
              } ${
                slots === 3
                  ? ""
                  : slots === 1
                  ? "grid-cols-1 max-w-[390px]"
                  : mobileDualView
                  ? "grid-cols-2 lg:grid-cols-2 max-w-[720px] xl:max-w-[760px]"
                  : "grid-cols-1 lg:grid-cols-2 max-w-[720px] xl:max-w-[760px]"
              }`}
            >
              {Array.from({ length: slots }, (_, i) => {
                // If single view active on mobile, hide other panels
                if (!mobileDualView && typeof window !== "undefined" && window.innerWidth < 1024 && i !== activeMobileSlot) {
                  return null;
                }

                const p = panels[i];
                const mine = state.myBets.find((b) => b.slot === i) ?? null;
                const queued = state.queued.find((q) => q.slot === i) ?? null;
                const amount = Number(p.amount) || 0;
                const pending = mine?.outcome === "pending";
                const bet = mine?.bet ?? amount;
                const netWin = Math.floor(bet * mult * 0.98 * 100) / 100;
                const potential = mine?.flightModel ? aviatorPayout(bet, Math.min(mult, mine.autoCashout ?? Infinity, state.config.maxCashout ?? 99.98))
                  : mine?.poolVersion ? Math.round(bet * mult * 100) / 100 : Math.floor((bet + netWin) * 100) / 100;
                const setAmt = (v: number) =>
                  setPanel(i, {
                    amount: Math.max(state.config.minBet, v).toFixed(2),
                  });

                let mode: "bet" | "cancel" | "cashout" | "queued" | "next";
                if (pending && phase === "running") mode = "cashout";
                else if (pending && phase === "waiting") mode = "cancel";
                else if (queued) mode = "queued";
                else if (phase === "waiting") mode = "bet";
                else mode = "next";

                const locked = pending || !!queued;
                const border =
                  mine?.outcome === "win"
                    ? "#16a34a"
                    : pending || queued
                    ? T.accent
                    : T.line;

                return (
                  <div
                    key={i}
                    className={`min-w-0 rounded-xl transition-colors ${
                      slots === 3 ? "basis-[calc(50%-2px)] max-w-[calc(50%-2px)] p-1 sm:basis-auto sm:max-w-none sm:p-2" : "p-1.5 sm:p-2"
                    }`}
                    style={{ background: T.panel, border: `1px solid ${border}` }}
                  >
                    {/* Panel Sub-header: Bet / Auto Tab */}
                    <div className="mb-0.5 sm:mb-1 flex items-center justify-between gap-1">
                      <div className="flex rounded-lg p-0.5 bg-[#090d16] border border-[#334155] shadow-inner">
                        <button
                          type="button"
                          onClick={() => setPanel(i, { tab: "bet" })}
                          className={`rounded-md px-2 sm:px-2.5 py-0.5 text-[9px] sm:text-[10px] font-black transition-all cursor-pointer ${
                            p.tab === "bet"
                              ? "bg-[#16a34a] text-white border border-[#22c55e] shadow-sm"
                              : "text-slate-300 hover:text-white"
                          }`}
                        >
                          Bet
                        </button>
                        <button
                          type="button"
                          onClick={() => setPanel(i, { tab: "auto" })}
                          className={`rounded-md px-2 sm:px-2.5 py-0.5 text-[9px] sm:text-[10px] font-black transition-all cursor-pointer ${
                            p.tab === "auto"
                              ? "bg-[#16a34a] text-white border border-[#22c55e] shadow-sm"
                              : "text-slate-300 hover:text-white"
                          }`}
                        >
                          Auto
                        </button>
                      </div>

                      {slots > 1 && (
                        <span className="text-[8px] sm:text-[10px] font-black text-slate-300 uppercase tracking-tight sm:tracking-wider bg-[#1e293b] px-1.5 sm:px-2 py-0.5 whitespace-nowrap rounded border border-[#334155]">
                          Panel {i + 1}
                        </span>
                      )}
                    </div>

                    {/* Stepper + Action Button */}
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.1fr] gap-1 sm:gap-2 items-center">
                      {/* Left: Amount & Quick Chips */}
                      <div className={`flex flex-col justify-between gap-1 ${locked ? "pointer-events-none opacity-60" : ""}`}>
                        <div
                          className="flex items-center gap-1 rounded-xl bg-[#090d16] px-1.5 py-0.5 border border-[#334155] shadow-inner"
                        >
                          <button
                            type="button"
                            onClick={() => setAmt(amount - 50)}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#1e293b] border border-[#334155] text-xs sm:text-sm font-black text-white hover:bg-[#16a34a] hover:border-[#22c55e] active:translate-y-[1px] transition-all cursor-pointer"
                          >
                            −
                          </button>
                          <div className="flex-1 flex flex-col items-center justify-center min-w-0">
                            <span className="text-[7px] font-bold uppercase tracking-wider text-slate-400 leading-none">Bet</span>
                            <input
                              value={p.amount}
                              onChange={(e) => setPanel(i, { amount: e.target.value })}
                              onBlur={() => setAmt(Number(p.amount) || state.config.minBet)}
                              className="w-full min-w-0 bg-transparent text-center text-xs font-black text-white outline-none"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setAmt(amount + 50)}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#1e293b] border border-[#334155] text-xs sm:text-sm font-black text-white hover:bg-[#16a34a] hover:border-[#22c55e] active:translate-y-[1px] transition-all cursor-pointer"
                          >
                            +
                          </button>
                        </div>

                        {/* Quick Chip Buttons */}
                        <div className="grid grid-cols-5 gap-0.5 sm:gap-1">
                          {BET_PRESETS.map((v) => (
                            <button
                              type="button"
                              key={v}
                              onClick={() => setAmt(v)}
                              className={`rounded-md sm:rounded-lg py-1 sm:py-1 text-[8px] sm:text-[10px] tracking-tighter sm:tracking-normal font-black transition-all cursor-pointer ${
                                amount === v
                                  ? "bg-[#16a34a] text-white border border-[#22c55e] shadow-sm"
                                  : "bg-[#1e293b] text-slate-200 border border-[#334155] hover:bg-[#16a34a] hover:text-white hover:border-[#22c55e] active:translate-y-[1px]"
                              }`}
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Right: Sleek Proportional 3D Action Button */}
                      <div className="flex h-9 sm:h-10.5 md:h-11">
                        {mode === "bet" && (
                          <button
                            type="button"
                            data-action="bet"
                            disabled={p.busy}
                            onClick={() => placeBet(i)}
                            className="group relative flex w-full flex-col items-center justify-center rounded-xl border-2 border-[#22c55e] bg-[#16a34a] hover:bg-[#15803d] active:bg-[#14532d] py-1 text-white shadow-xl active:translate-y-[2px] transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                            style={{ backgroundColor: "#16a34a", color: "#ffffff", borderColor: "#22c55e", boxShadow: "0 4px 15px rgba(22, 163, 74, 0.45)" }}
                          >
                            <span className="text-xs sm:text-sm font-black uppercase tracking-wider leading-none">
                              BET
                            </span>
                            <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-[#14532d] px-2 py-0.5 text-[9px] sm:text-[10px] font-black text-white">
                              Rs. {fmt2(amount)}
                            </span>
                          </button>
                        )}

                        {mode === "next" && (
                          <button
                            type="button"
                            data-action="bet-next"
                            disabled={p.busy}
                            onClick={() => placeBet(i)}
                            className="group relative flex w-full flex-col items-center justify-center rounded-xl border-2 border-[#22c55e] bg-[#16a34a] hover:bg-[#15803d] active:bg-[#14532d] py-1 text-white shadow-xl active:translate-y-[2px] transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                            style={{ backgroundColor: "#16a34a", color: "#ffffff", borderColor: "#22c55e", boxShadow: "0 4px 15px rgba(22, 163, 74, 0.45)" }}
                          >
                            <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider leading-none">
                              BET (NEXT)
                            </span>
                            <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-[#14532d] px-2 py-0.5 text-[9px] sm:text-[10px] font-black text-white">
                              Rs. {fmt2(amount)}
                            </span>
                          </button>
                        )}

                        {mode === "queued" && (
                          <div className="flex w-full flex-col items-center justify-center gap-0.5">
                            <span className="text-[9px] font-bold text-amber-400 animate-pulse">Queued next round</span>
                            <button
                              type="button"
                              data-action="cancel"
                              disabled={p.busy}
                              onClick={() => cancelBet(i)}
                              className="group relative flex w-full flex-col items-center justify-center rounded-xl border-2 border-[#ef4444] bg-[#dc2626] hover:bg-[#b91c1c] active:bg-[#991b1b] py-1 text-white shadow-xl active:translate-y-[1px] transition-all cursor-pointer"
                              style={{ backgroundColor: "#dc2626", color: "#ffffff", borderColor: "#ef4444", boxShadow: "0 4px 15px rgba(220, 38, 38, 0.45)" }}
                            >
                              <span className="text-xs font-black uppercase tracking-wider">CANCEL</span>
                            </button>
                          </div>
                        )}

                        {mode === "cancel" && (
                          <button
                            type="button"
                            data-action="cancel"
                            disabled={p.busy}
                            onClick={() => cancelBet(i)}
                            className="group relative flex w-full flex-col items-center justify-center rounded-xl border-2 border-[#ef4444] bg-[#dc2626] hover:bg-[#b91c1c] active:bg-[#991b1b] py-1 text-white shadow-xl active:translate-y-[2px] transition-all cursor-pointer disabled:opacity-50"
                            style={{ backgroundColor: "#dc2626", color: "#ffffff", borderColor: "#ef4444", boxShadow: "0 4px 15px rgba(220, 38, 38, 0.45)" }}
                          >
                            <span className="text-xs sm:text-sm font-black uppercase tracking-wider leading-none">
                              CANCEL
                            </span>
                            <span className="mt-0.5 text-[8px] sm:text-[9px] font-bold text-red-100">
                              Waiting round…
                            </span>
                          </button>
                        )}

                        {mode === "cashout" && (
                          <button
                            type="button"
                            data-action="cashout"
                            disabled={p.busy}
                            onClick={() => cashOut(i)}
                            className="group relative flex w-full flex-col items-center justify-center rounded-xl border-2 border-[#f59e0b] bg-[#d97706] hover:bg-[#b45309] active:bg-[#92400e] py-1 text-white shadow-xl active:translate-y-[2px] transition-all cursor-pointer"
                            style={{ backgroundColor: "#d97706", color: "#ffffff", borderColor: "#f59e0b", boxShadow: "0 4px 15px rgba(217, 119, 6, 0.45)" }}
                          >
                            <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-white leading-none">
                              {mine?.poolVersion ? "LOCK CLAIM" : "CASH OUT"}
                            </span>
                            <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-[#78350f] px-2 py-0.5 text-[9px] sm:text-[10px] font-black text-amber-100 border border-amber-500/40">
                              Rs. {fmt2(potential)}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Status Badge */}
                    {mine && mine.outcome !== "pending" && (
                      <div
                        className={`mt-1 rounded px-2 py-0.5 text-center text-[9px] font-bold ${
                          mine.outcome === "win" ? "bg-[#123717] text-[#4ade80]" : "bg-[#3a0b12] text-red-300"
                        }`}
                      >
                        {mine.poolPending ? `Claim Rs. ${fmt2(mine.poolClaim ?? 0)} — daily payout pending` : mine.outcome === "win"
                          ? `Cashed out: +Rs. ${fmt2(mine.win)}`
                          : "No win"}
                      </div>
                    )}

                    {/* Auto Tab Settings */}
                    {p.tab === "auto" && (
                      <div
                        className="mt-1 flex flex-wrap items-center justify-between gap-1 rounded-lg px-2 py-0.5 text-[9px]"
                        style={{ background: T.panel2, border: `1px solid ${T.line}` }}
                      >
                        <label className="flex items-center gap-1 cursor-pointer">
                          <span className="text-slate-300">Auto Bet</span>
                          <Toggle on={p.autoBet} onChange={(v) => setPanel(i, { autoBet: v })} />
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <span className="text-slate-300">Auto Cash</span>
                          <Toggle on={p.autoCash} disabled={locked} onChange={(v) => setPanel(i, { autoCash: v })} />
                          <span
                            className="flex items-center rounded-full px-1.5 py-0.2"
                            style={{ background: T.panel, border: `1px solid ${T.line}` }}
                          >
                            <input
                              value={p.autoCashAt}
                              disabled={!p.autoCash || locked}
                              inputMode="decimal"
                              min={1.01}
                              max={state.config.maxCashout ?? 99.98}
                              step={0.01}
                              onChange={(e) => setPanel(i, { autoCashAt: e.target.value })}
                              onBlur={() =>
                                setPanel(i, {
                                  autoCashAt: Math.min(state.config.maxCashout ?? 99.98, Math.max(1.01, Number(p.autoCashAt) || 1.01)).toFixed(2),
                                })
                              }
                              className="w-8 bg-transparent text-center font-bold text-white outline-none disabled:opacity-40"
                            />
                            <span className="text-slate-500 font-bold">x</span>
                          </span>
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ===== 4. MOBILE LIVE BETS DRAWER (BOTTOM SHEET) ===== */}
      {showMobileBetsDrawer && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 lg:hidden backdrop-blur-sm"
          onClick={() => setShowMobileBetsDrawer(false)}
        >
          <div
            className="flex max-h-[75vh] w-full flex-col rounded-t-2xl p-3 shadow-2xl"
            style={{ background: T.panel, border: `1px solid ${T.line}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: T.line }}>
              <div className="flex gap-1">
                {(["all", "prev", "top"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                      tab === k ? "bg-[#28a909] text-white border border-[#38c815]" : "text-[#8b8f96] hover:text-white"
                    }`}
                  >
                    {k === "all" ? "All Bets" : k === "prev" ? "My Bets" : "Top Wins"}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowMobileBetsDrawer(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-2 space-y-1">
              {tab === "all" &&
                state.bets.map((b) => (
                  <div
                    key={b.id}
                    className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2 rounded px-2 py-1.5 text-xs"
                    style={{
                      background: b.outcome === "win" ? "rgba(18,55,23,.7)" : T.panel2,
                      border: b.outcome === "win" ? "1px solid #427f00" : "1px solid transparent",
                    }}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                        style={{ background: AV[(b.name.charCodeAt(0) + b.name.length) % AV.length] }}
                      >
                        {b.name.slice(0, 1)}
                      </span>
                      <span className="truncate text-slate-300 font-medium">{b.name}</span>
                    </span>
                    <span className="text-right text-slate-200">{fmt2(b.bet)}</span>
                    <span className="text-right">
                      {b.mult ? (
                        <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${cpClass(b.mult)}`}>
                          {fmt2(b.mult)}x
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </span>
                    <span className="text-right font-bold text-emerald-400">
                      {b.poolPending ? "Pool pending" : b.outcome === "win" ? fmt2(b.win) : b.outcome === "lose" ? <span className="text-slate-600">—</span> : ""}
                    </span>
                  </div>
                ))}

              {tab === "prev" &&
                state.myHistory.map((h) => (
                  <div
                    key={h.id}
                    className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-2 rounded px-2 py-1.5 text-xs"
                    style={{ background: h.outcome === "win" ? "rgba(18,55,23,.7)" : T.panel2 }}
                  >
                    <span className="text-slate-400">#{h.round}</span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(h.at).toLocaleTimeString("en-PK", { timeStyle: "short" })}
                    </span>
                    <span className="text-right text-slate-200">{fmt2(h.bet)}</span>
                    <span className={`text-right font-bold ${h.outcome === "win" ? "text-[#28a909]" : "text-slate-600"}`}>
                      {h.poolPending ? "Pool pending" : h.outcome === "win" ? fmt2(h.win) : "—"}
                    </span>
                  </div>
                ))}

              {tab === "top" &&
                state.top.map((b, i) => (
                  <div key={i} className="rounded px-2 py-1.5 text-xs" style={{ background: T.panel2 }}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200">{b.name}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${cpClass(b.mult)}`}>
                        {fmt2(b.mult)}x
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-[10px] text-slate-400">
                      <span>Bet {fmt2(b.bet)} · #{b.round}</span>
                      <span className="font-bold text-[#28a909]">Win {fmt2(b.win)}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== 5. HOW TO PLAY RULES MODAL ===== */}
      {rules && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setRules(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl p-5 text-sm text-slate-300 shadow-2xl"
            style={{ background: T.panel, border: `1px solid ${T.line}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className={`text-lg font-black italic ${T.logo}`}>{T.title} — How to play</h3>
              <button
                onClick={() => setRules(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <ol className="list-decimal space-y-2.5 pl-5 text-xs sm:text-sm">
              <li>
                <b className="text-white">Place your bet</b> — Choose your bet amount and press BET during the
                waiting countdown.
              </li>
              <li>
                <b className="text-white">Watch the flight</b> — The plane takes off and the multiplier starts
                increasing from 1.00x upward.
              </li>
              <li>
                <b className="text-white">Cash out in time</b> — Press CASH OUT before the plane flies away! Your
                winnings = Bet × Cash Out Multiplier.
              </li>
              <li>
                <b className="text-white">Auto Bet & Auto Cash Out</b> — Use Auto Bet to repeat your stake each round,
                and set Auto Cash Out before betting, from 1.01x to 99.98x. The server settles your saved target even if you disconnect.
              </li>
              <li>
                <b className="text-white">Crash rules</b> — Crash points range from 1.00x to 99.99x. Cashout must be strictly before the crash; equal targets lose.
                The fixed-target theoretical RTP is approximately 80% before whole-paisa rounding, not a guarantee of session returns.
                {state.config.theoreticalRtpAt199 === 79.6 && " This model crashes strictly below 2x with 60% long-run probability. The 1.99x cashout target has approximately 79.6% RTP before paisa rounding."}
              </li>
              <li>
                <b className="text-white">Seed verification</b> — A SHA-256 seed commitment is published before betting; the seed is revealed after the crash.
                {state.fairness && <span className="mt-1 block break-all text-[10px]">Current seed hash: {state.fairness.serverSeedHash}<br />Model: {state.fairness.version} · Nonce: {state.fairness.nonce}</span>}
                {state.history[0]?.fairness?.serverSeed && <span className="mt-1 block break-all text-[10px]">Last revealed seed: {state.history[0].fairness.serverSeed}<br />Hash: {state.history[0].fairness.serverSeedHash}<br />Public client seed: {state.history[0].fairness.clientSeed} · Nonce: {state.history[0].fairness.nonce}</span>}
              </li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onChange, disabled = false }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`h-4 w-7 rounded-full p-0.5 transition ${on ? "bg-[#28a909]" : "bg-slate-600"}`}
    >
      <span
        className={`block h-3 w-3 rounded-full bg-white transition ${on ? "translate-x-3" : ""}`}
      />
    </button>
  );
}

/* ============ CANVAS RENDERING ENGINE ============ */
function draw(
  canvas: HTMLCanvasElement,
  size: { w: number; h: number; dpr: number },
  T: (typeof THEME)[Table],
  phase: string,
  m: number,
  now: number,
  s: State
) {
  if (s.table === "aviator") {
    drawAviatorScenery(canvas, size.w, size.h, size.dpr, phase, now, s.round.endedAt);
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { w: W, h: H, dpr } = size;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const t = phase === "waiting" ? 0 : Math.max(0, (now - s.round.startsAt) / 1000);
  const pad = 30;
  const cx = pad,
    cy = H - pad;

  // Rays from origin
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((now / 14000) % (Math.PI * 2));
  for (let i = 0; i < 24; i++) {
    ctx.rotate(Math.PI / 12);
    if (i % 2) {
      ctx.fillStyle = T.rays;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, Math.max(W, H) * 2, 0, Math.PI / 12);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();

  if (phase === "crashed") {
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, W);
    g.addColorStop(0, `${T.accent}26`);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Axes dots
  const scroll = (t * 40) % 40;
  ctx.fillStyle = "rgba(255,255,255,.3)";
  for (let x = pad + 40 - scroll; x < W - 8; x += 40) {
    ctx.beginPath();
    ctx.arc(x, H - pad + 10, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let y = H - pad - 40 + (scroll % 40); y > 6; y -= 40) {
    ctx.beginPath();
    ctx.arc(pad - 10, y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, 4);
  ctx.lineTo(pad, H - pad);
  ctx.lineTo(W - 6, H - pad);
  ctx.stroke();

  // Parabolic flight trajectory
  const boxW = Math.max(80, W - pad * 2 - 44);
  // Plane progress follows the live multiplier (not a fixed timer) so the graph and the number move together
  const travel = phase === "waiting" ? 0 : Math.min(1, 1 - 1 / (1 + (m - 1) * 1.1));
  const ex = cx + boxW;
  const ey = pad + 6;

  const qy = (tt: number) => {
    const u = 1 - tt;
    return u * u * cy + 2 * u * tt * cy + tt * tt * ey;
  };
  const qx = (tt: number) => {
    const u = 1 - tt;
    return u * u * cx + 2 * u * tt * ex * 0.55 + tt * tt * ex;
  };

  let px = cx,
    py = cy;
  if (phase !== "waiting") {
    px = qx(travel);
    py = qy(travel);
    px = Math.min(ex + 10, Math.max(cx, px));
    py = Math.max(ey - 4, Math.min(cy, py));
    const hoverStrength = Math.max(0, Math.min(1, (travel - 0.8) / 0.15));
    const hover = phase === "running" ? Math.sin(t * 1.6) * 3 * hoverStrength : 0;
    py += hover;

    // Filled flight curve
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let i = 1; i <= 24; i++) {
      const tt = (i / 24) * travel;
      ctx.lineTo(qx(tt), qy(tt) + (travel > 0 ? hover * tt / travel : 0));
    }
    ctx.lineTo(px, cy);
    ctx.closePath();
    ctx.fillStyle = T.fill;
    ctx.fill();

    // Red leading curve stroke
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let i = 1; i <= 24; i++) {
      const tt = (i / 24) * travel;
      ctx.lineTo(qx(tt), qy(tt) + (travel > 0 ? hover * tt / travel : 0));
    }
    ctx.strokeStyle = T.curve;
    ctx.lineWidth = 3.5;
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  if (phase === "waiting") {
    px = cx + 6;
    py = cy - 6;
  }
  if (phase === "crashed") {
    const dt = s.round.endedAt ? (now - s.round.endedAt) / 1000 : 0;
    px = px + dt * 460;
    py = py - dt * 280;
  }

  // Adaptive plane scale so it looks crisp on both small phone screens and wide monitors
  const planeScale = Math.min(1.2, Math.max(0.55, Math.min(W / 380, H / 260)));
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(phase === "waiting" ? 0 : -0.12);
  ctx.scale(planeScale, planeScale);
  drawPlane(ctx, now, phase === "crashed", T.plane);
  ctx.restore();
}

function drawPlane(ctx: CanvasRenderingContext2D, now: number, crashed: boolean, color: string) {
  ctx.save();
  ctx.scale(1.3, 1.3);
  ctx.shadowColor = crashed ? "transparent" : `${color}55`;
  ctx.shadowBlur = 4;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Side-on propeller biplane: raised tail, open cockpit and swept wings.
  ctx.beginPath();
  ctx.moveTo(-32, 2);
  ctx.lineTo(-36, -11);
  ctx.quadraticCurveTo(-32, -14, -29, -10);
  ctx.lineTo(-23, -1);
  ctx.lineTo(-10, 0);
  ctx.lineTo(-8, -5);
  ctx.lineTo(-2, -5);
  ctx.quadraticCurveTo(-2, 1, 4, 0);
  ctx.lineTo(8, -5);
  ctx.lineTo(23, -4);
  ctx.quadraticCurveTo(31, -3, 32, 1);
  ctx.quadraticCurveTo(27, 7, 15, 7);
  ctx.lineTo(-22, 5);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(-14, -7);
  ctx.lineTo(-20, -11);
  ctx.lineTo(17, -11);
  ctx.quadraticCurveTo(24, -10, 25, -7);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-9, 4);
  ctx.lineTo(-20, 12);
  ctx.lineTo(-8, 13);
  ctx.lineTo(14, 5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-7, -7);
  ctx.lineTo(-3, 3);
  ctx.moveTo(15, -7);
  ctx.lineTo(9, 4);
  ctx.moveTo(7, 7);
  ctx.lineTo(3, 14);
  ctx.lineTo(17, 14);
  ctx.lineTo(15, 7);
  ctx.stroke();
  ctx.fillStyle = "#101014";
  ctx.beginPath();
  ctx.ellipse(9, 14, 4, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-30, 4);
  ctx.lineTo(-36, 7);
  ctx.lineTo(-24, 7);
  ctx.stroke();

  const blade = Math.sin(now / 45) * 12;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.ellipse(33, 1, 1.5, 12, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(33, 1 - blade);
  ctx.lineTo(33, 1 + blade);
  ctx.stroke();
  ctx.restore();
}
