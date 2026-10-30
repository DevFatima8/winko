"use client";

import { useEffect } from "react";
import StadiumCanvas from "./StadiumCanvas";
import { BANNER_DELAY, OUTCOMES, formatCoins, type OutcomeId, type Phase } from "./lib/engine";

export interface StageResult {
  win: boolean;
  payout: number;
  stake: number;
}

export interface ScoreBug {
  code: string;
  flag: string;
  score: string;
  overs: string;
  chase?: string | null;
}

interface StadiumProps {
  phase: Phase;
  outcome: OutcomeId | null;
  animKey: number;
  timeLeft: number;
  total: number;
  title: string;
  viewers: number;
  result: StageResult | null;
  bug: ScoreBug;
  batColor: string;
  fieldColor: string;
}

/* real close-up photos used by the small "replay cam" inset */
const PIP_BOWLER = "/nine-wickets/bowler-release.jpg";
const PIP_OUTCOME: Record<OutcomeId, string> = {
  dot: "/nine-wickets/shot-dot.jpg",
  single: "/nine-wickets/shot-run.jpg",
  two: "/nine-wickets/shot-run.jpg",
  four: "/nine-wickets/shot-four.jpg",
  six: "/nine-wickets/shot-six.jpg",
  wicket: "/nine-wickets/wicket-bowled.jpg",
};
const PRELOAD = [
  PIP_BOWLER,
  "/nine-wickets/shot-dot.jpg",
  "/nine-wickets/shot-run.jpg",
  "/nine-wickets/shot-four.jpg",
  "/nine-wickets/shot-six.jpg",
  "/nine-wickets/wicket-bowled.jpg",
];

const BANNER_STYLE: Record<OutcomeId, { text: string; glow: string; burst: string }> = {
  six: {
    text: "from-yellow-200 via-amber-400 to-orange-500",
    glow: "drop-shadow-[0_0_28px_rgba(251,191,36,0.9)]",
    burst: "radial-gradient(circle at 50% 55%, rgba(251,191,36,0.42), rgba(217,70,239,0.2) 45%, transparent 70%)",
  },
  four: {
    text: "from-cyan-200 via-sky-400 to-blue-600",
    glow: "drop-shadow-[0_0_26px_rgba(56,189,248,0.9)]",
    burst: "radial-gradient(circle at 50% 55%, rgba(56,189,248,0.38), rgba(37,99,235,0.18) 45%, transparent 70%)",
  },
  wicket: {
    text: "from-red-200 via-red-500 to-red-700",
    glow: "drop-shadow-[0_0_28px_rgba(239,68,68,0.95)]",
    burst: "radial-gradient(circle at 50% 60%, rgba(239,68,68,0.42), rgba(127,29,29,0.22) 45%, transparent 70%)",
  },
  dot: {
    text: "from-slate-100 via-slate-300 to-slate-500",
    glow: "drop-shadow-[0_0_16px_rgba(203,213,225,0.6)]",
    burst: "radial-gradient(circle at 50% 55%, rgba(148,163,184,0.16), transparent 65%)",
  },
  single: {
    text: "from-sky-100 via-sky-300 to-sky-500",
    glow: "drop-shadow-[0_0_18px_rgba(56,189,248,0.7)]",
    burst: "radial-gradient(circle at 50% 55%, rgba(56,189,248,0.16), transparent 65%)",
  },
  two: {
    text: "from-emerald-100 via-emerald-300 to-emerald-500",
    glow: "drop-shadow-[0_0_18px_rgba(52,211,153,0.7)]",
    burst: "radial-gradient(circle at 50% 55%, rgba(52,211,153,0.2), transparent 65%)",
  },
};

const CONFETTI_COLORS = ["#fbbf24", "#f472b6", "#38bdf8", "#4ade80", "#f87171", "#a78bfa"];

export default function Stadium({
  phase,
  outcome,
  animKey,
  timeLeft,
  total,
  title,
  viewers,
  result,
  bug,
  batColor,
  fieldColor,
}: StadiumProps) {
  const o = phase !== "betting" ? outcome : null;
  const info = o ? OUTCOMES[o] : null;
  const urgent = phase === "betting" && timeLeft <= 3 && timeLeft > 0;
  const bannerDelay = o ? BANNER_DELAY[o] : 0;

  useEffect(() => {
    PRELOAD.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black/60">
      {/* the live stadium (canvas) */}
      <div className="relative aspect-video w-full overflow-hidden bg-[#050914]">
        <StadiumCanvas outcome={o} animKey={animKey} batColor={batColor} fieldColor={fieldColor} />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/70 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />
      </div>

      {/* replay cam (real close-up photos) */}
      {o && (
        <div
          key={`pip-${animKey}`}
          className="nw-pip pointer-events-none absolute right-2.5 top-11 hidden w-[24%] overflow-hidden rounded-lg border border-white/25 shadow-2xl sm:right-3 sm:top-12 sm:block"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={PIP_BOWLER} alt="" draggable={false} className="block aspect-video w-full object-cover" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={PIP_OUTCOME[o]}
            alt=""
            draggable={false}
            className="nw-pip-b absolute inset-0 h-full w-full object-cover"
          />
          <span className="absolute left-1 top-1 rounded bg-red-600 px-1.5 py-0.5 text-[8px] font-extrabold tracking-widest text-white">
            REPLAY CAM
          </span>
        </div>
      )}

      {/* burst flash on big moments */}
      {o && (o === "six" || o === "four" || o === "wicket") && (
        <div
          key={`burst-${animKey}`}
          className="nw-burst pointer-events-none absolute inset-0"
          style={{ background: BANNER_STYLE[o].burst, animationDelay: `${bannerDelay - 0.1}s` }}
        />
      )}

      {/* outcome banner */}
      {o && info && (
        <div key={`banner-${animKey}`} className="pointer-events-none absolute inset-x-0 top-[16%] flex justify-center">
          <div className="nw-banner-pop relative text-center" style={{ animationDelay: `${bannerDelay}s` }}>
            <div className="absolute inset-x-[-12%] inset-y-[-25%] -z-10 rounded-full bg-black/40 blur-2xl" />
            <div
              className={`bg-gradient-to-b bg-clip-text text-5xl font-black italic tracking-wider text-transparent sm:text-7xl md:text-8xl ${BANNER_STYLE[o].text} ${BANNER_STYLE[o].glow}`}
            >
              {info.banner}
            </div>
          </div>
        </div>
      )}

      {/* confetti for a winning bet */}
      {phase === "result" && result?.win && (
        <div key={`confetti-${animKey}`} className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 34 }).map((_, i) => (
            <span
              key={i}
              className="nw-confetti rounded-[2px]"
              style={{
                left: `${(i * 29 + 7) % 100}%`,
                width: 6 + (i % 3) * 3,
                height: 9 + (i % 4) * 3,
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                animationDelay: `${(i % 9) * 0.08}s`,
                animationDuration: `${1.5 + (i % 5) * 0.25}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5 sm:p-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-1 text-[10px] font-extrabold tracking-widest text-white shadow-lg sm:text-xs">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-80" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </span>
            LIVE
          </span>
          <span className="hidden rounded-md bg-black/60 px-2 py-1 text-[10px] font-semibold text-slate-200 backdrop-blur sm:inline sm:text-xs">
            {title}
          </span>
        </div>

        <div className="flex flex-col items-center">
          <div
            className={`rounded-full border px-3 py-1 text-[10px] font-extrabold tracking-wider backdrop-blur sm:px-4 sm:text-xs ${
              phase === "betting"
                ? urgent
                  ? "nw-timer-urgent border-red-400/60 bg-red-600/80 text-white"
                  : "border-amber-300/50 bg-black/65 text-amber-300"
                : phase === "bowling"
                  ? "border-sky-300/40 bg-black/65 text-sky-200"
                  : "border-white/20 bg-black/65 text-white"
            }`}
          >
            {phase === "betting" && <>PLACE YOUR BETS · 0:{String(Math.max(timeLeft, 0)).padStart(2, "0")}</>}
            {phase === "bowling" && <>BALL IN PLAY…</>}
            {phase === "result" && <>BALL RESULT</>}
          </div>
        </div>

        <div className="rounded-md bg-black/60 px-2 py-1 text-[10px] font-semibold text-slate-200 backdrop-blur sm:text-xs">
          🏏 {formatCoins(viewers)} live bets
        </div>
      </div>

      {/* TV score bug */}
      <div className="nw-bug pointer-events-none absolute bottom-3 left-2.5 sm:bottom-4 sm:left-3">
        <div className="flex items-stretch overflow-hidden rounded-md border border-white/15 bg-black/70 shadow-xl backdrop-blur">
          <div className="flex items-center gap-1.5 bg-gradient-to-b from-blue-600 to-blue-800 px-2 py-1 sm:px-2.5 sm:py-1.5">
            <span className="text-sm leading-none sm:text-base">{bug.flag}</span>
            <span className="text-[11px] font-black tracking-wider text-white sm:text-xs">{bug.code}</span>
          </div>
          <div className="flex items-baseline gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1.5">
            <span className="text-sm font-black tabular-nums text-white sm:text-base">{bug.score}</span>
            <span className="text-[10px] font-semibold text-slate-300 sm:text-[11px]">({bug.overs})</span>
          </div>
          {bug.chase && (
            <div className="hidden items-center border-l border-white/10 bg-amber-400/15 px-2 text-[10px] font-bold text-amber-300 sm:flex">
              {bug.chase}
            </div>
          )}
        </div>
      </div>

      {/* bet result pill */}
      {phase === "result" && result && (
        <div className="pointer-events-none absolute bottom-3 right-2.5 flex justify-end sm:bottom-4 sm:right-3">
          <div
            key={`res-${animKey}`}
            className={`nw-result-pop rounded-2xl border px-4 py-2 text-center shadow-2xl backdrop-blur sm:px-5 sm:py-2.5 ${
              result.win
                ? "border-emerald-300/60 bg-emerald-600/85 text-white"
                : "border-red-300/40 bg-red-700/80 text-white"
            }`}
          >
            <div className="text-[10px] font-bold tracking-[0.2em] opacity-90 sm:text-xs">
              {result.win ? "YOU WON" : "No win"}
            </div>
            {result.win && (
              <div className="text-xl font-black sm:text-3xl">
                {`+${formatCoins(result.payout - result.stake)}`}
                <span className="ml-1 text-xs font-bold opacity-80 sm:text-sm">Rs.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* betting timer bar */}
      {phase === "betting" && (
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/50">
          <div
            className={`h-full ${urgent ? "bg-red-500" : "bg-amber-400"}`}
            style={{ width: `${(Math.max(timeLeft, 0) / total) * 100}%`, transition: "width 1s linear" }}
          />
        </div>
      )}
    </div>
  );
}
