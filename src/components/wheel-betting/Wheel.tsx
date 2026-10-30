"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { sfx } from "./lib/sound";
import {
  SEGMENT_ANGLE,
  SEGMENT_COUNT,
  SEGMENT_MULTIPLIERS,
  segmentLabel,
  segmentStyle,
} from "./lib/wheel";

export type WheelApi = {
  spinTo: (index: number, durationMs: number) => Promise<void>;
  reset: () => void;
};

type WheelProps = {
  onReady: (api: WheelApi) => void;
  onSpinStart?: () => void;
  onSpinEnd?: () => void;
  spinning?: boolean;
  activeIndex?: number | null;
  onCenterSpin?: () => void;
  canSpin?: boolean;
};

const CX = 200;
const CY = 200;
const R_OUTER = 196;
const R_SEGMENT = 170;
const R_INNER = 62;
const BULBS = 28;

function polar(r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)] as const;
}

function slicePath(r0: number, r1: number, a0: number, a1: number) {
  const [x0, y0] = polar(r1, a0);
  const [x1, y1] = polar(r1, a1);
  const [x2, y2] = polar(r0, a1);
  const [x3, y3] = polar(r0, a0);
  return [
    `M ${x0.toFixed(2)} ${y0.toFixed(2)}`,
    `A ${r1} ${r1} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `L ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `A ${r0} ${r0} 0 0 0 ${x3.toFixed(2)} ${y3.toFixed(2)}`,
    "Z",
  ].join(" ");
}

export default function Wheel({
  onReady,
  onSpinStart,
  onSpinEnd,
  spinning = false,
  activeIndex = null,
  onCenterSpin,
  canSpin = true,
}: WheelProps) {
  const rotGroupRef = useRef<SVGGElement | null>(null);
  const pointerRef = useRef<HTMLDivElement | null>(null);
  const rotationRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const tickRef = useRef(0);
  const [lightsOn, setLightsOn] = useState(false);
  const [landing, setLanding] = useState(false);

  const segments = useMemo(
    () =>
      SEGMENT_MULTIPLIERS.map((multiplier, i) => {
        const a0 = i * SEGMENT_ANGLE;
        const a1 = a0 + SEGMENT_ANGLE;
        const mid = a0 + SEGMENT_ANGLE / 2;
        return { multiplier, i, a0, a1, mid };
      }),
    [],
  );

  const applyRotation = useCallback((deg: number) => {
    rotationRef.current = deg;
    const g = rotGroupRef.current;
    if (g) g.setAttribute("transform", `rotate(${deg.toFixed(3)} ${CX} ${CY})`);
  }, []);

  const animate = useCallback(
    (from: number, to: number, duration: number) =>
      new Promise<void>((resolve) => {
        const start = performance.now();
        const ease = (t: number) => 1 - Math.pow(1 - t, 4);

        const step = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          const value = from + (to - from) * ease(t);
          applyRotation(value);

          // peg / tick sound on every segment boundary crossing
          const norm = ((value % 360) + 360) % 360;
          const bucket = Math.floor(norm / SEGMENT_ANGLE);
          if (bucket !== tickRef.current) {
            tickRef.current = bucket;
            const speed = 1 - ease(Math.max(0, t - 0.05));
            sfx.tick(speed);
          }

          if (t < 1) {
            rafRef.current = requestAnimationFrame(step);
          } else {
            applyRotation(to);
            rafRef.current = null;
            resolve();
          }
        };
        rafRef.current = requestAnimationFrame(step);
      }),
    [applyRotation],
  );

  useEffect(() => {
    const api: WheelApi = {
      async spinTo(index, durationMs) {
        setLanding(false);
        onSpinStart?.();
        const target = index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
        const jitter = (Math.random() - 0.5) * SEGMENT_ANGLE * 0.55;
        const desired = -(target + jitter);

        const turns = 5 + Math.random() * 2.5;
        const min = rotationRef.current + turns * 360;
        const n = Math.floor((desired - min) / 360);
        const final = desired - 360 * n;

        await animate(rotationRef.current, final, durationMs);
        setLanding(true);
        onSpinEnd?.();
        window.setTimeout(() => setLanding(false), 700);
      },
      reset() {
        applyRotation(0);
        tickRef.current = 0;
      },
    };
    onReady(api);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [animate, applyRotation, onReady, onSpinEnd, onSpinStart]);

  useEffect(() => {
    setLightsOn(spinning);
  }, [spinning]);

  const bulbList = useMemo(
    () =>
      Array.from({ length: BULBS }, (_, i) => {
        const [x, y] = polar(R_OUTER - 9, (i * 360) / BULBS);
        return { x, y, i };
      }),
    [],
  );

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[280px] sm:max-w-[360px] md:max-w-[440px] select-none">
      {/* ambient glow */}
      <div
        className={`pointer-events-none absolute -inset-6 rounded-full blur-2xl transition-opacity duration-500 ${
          spinning ? "opacity-90" : "opacity-50"
        }`}
        style={{
          background:
            "radial-gradient(circle at 50% 45%, rgba(255,196,84,0.30), rgba(140,90,255,0.16) 45%, transparent 70%)",
        }}
      />

      {/* pointer */}
      <div className="absolute left-1/2 top-[-6px] z-30 -translate-x-1/2">
        <div
          ref={pointerRef}
          className={`origin-bottom transition-transform ${landing ? "scale-110" : "scale-100"}`}
        >
          <svg width="46" height="60" viewBox="0 0 46 60" className="drop-shadow-[0_6px_10px_rgba(0,0,0,0.6)]">
            <defs>
              <linearGradient id="ptr" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#fff3d0" />
                <stop offset="35%" stopColor="#ffcc45" />
                <stop offset="65%" stopColor="#f39c12" />
                <stop offset="100%" stopColor="#b45309" />
              </linearGradient>
            </defs>
            <circle cx="23" cy="12" r="11" fill="url(#ptr)" stroke="#7c3f06" strokeWidth="2" />
            <circle cx="23" cy="12" r="4.5" fill="#fff8e1" />
            <path d="M23 56 L11 16 L35 16 Z" fill="url(#ptr)" stroke="#7c3f06" strokeWidth="2" />
            <path d="M23 52 L16 18 L23 18 Z" fill="rgba(255,255,255,0.35)" />
          </svg>
        </div>
      </div>

      {/* static frame + bulbs */}
      <svg
        viewBox="0 0 400 400"
        className={`absolute inset-0 h-full w-full ${lightsOn ? "bulbs-fast" : ""}`}
      >
        <defs>
          <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5c3a10" />
            <stop offset="22%" stopColor="#ffe08a" />
            <stop offset="45%" stopColor="#c98b1d" />
            <stop offset="68%" stopColor="#ffe9b0" />
            <stop offset="100%" stopColor="#5c3a10" />
          </linearGradient>
          <radialGradient id="innerShade" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.14)" />
            <stop offset="70%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.45)" />
          </radialGradient>
        </defs>

        <circle cx={CX} cy={CY} r={R_OUTER} fill="#0b1020" />
        <circle
          cx={CX}
          cy={CY}
          r={R_OUTER}
          fill="none"
          stroke="url(#rim)"
          strokeWidth="13"
        />
        <circle cx={CX} cy={CY} r={R_OUTER - 7.5} fill="none" stroke="#2a1a05" strokeWidth="3" />

        {bulbList.map(({ x, y, i }) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={4.4}
            className="wheel-bulb"
            style={{ animationDelay: `${(i % 4) * 0.12}s` }}
            fill={i % 2 === 0 ? "#ffd76e" : "#fff6dd"}
          />
        ))}

        {/* rotating wheel body */}
        <g ref={rotGroupRef}>
          <circle cx={CX} cy={CY} r={R_SEGMENT} fill="#0d1220" />
          {segments.map(({ multiplier, i, a0, a1, mid }) => {
            const style = segmentStyle(multiplier);
            const isActive = activeIndex === i;
            return (
              <g key={i}>
                <path
                  d={slicePath(R_INNER, R_SEGMENT, a0, a1)}
                  fill={`url(#seg-${multiplier})`}
                  stroke="#080d18"
                  strokeWidth="1.4"
                />
                {isActive && (
                  <path
                    d={slicePath(R_INNER, R_SEGMENT, a0, a1)}
                    fill="rgba(255,255,255,0.16)"
                    className="wheel-flash"
                  />
                )}
                {/* radial label */}
                <g transform={`rotate(${mid} ${CX} ${CY})`}>
                  <text
                    x={CX}
                    y={CY - (R_INNER + (R_SEGMENT - R_INNER) / 2) - (multiplier > 0 ? 11 : 8)}
                    textAnchor="middle"
                    fontSize={multiplier >= 5 ? 40 : multiplier > 0 ? 34 : 24}
                    fontWeight="900"
                    letterSpacing={multiplier > 0 ? "-1" : "1"}
                    fill={style.text}
                    style={{ fontFamily: "var(--font-num)" }}
                  >
                    {segmentLabel(multiplier)}
                  </text>
                  {multiplier > 0 && (
                    <text
                      x={CX}
                      y={CY - (R_INNER + (R_SEGMENT - R_INNER) / 2) + 18}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="700"
                      letterSpacing="2.4"
                      fill={style.text}
                      opacity="0.75"
                    >
                      PAYS
                    </text>
                  )}
                  {/* peg */}
                  <circle
                    cx={CX}
                    cy={CY - R_SEGMENT + 6}
                    r="4.2"
                    fill={style.peg}
                    stroke="#0a0f1a"
                    strokeWidth="1"
                  />
                </g>
              </g>
            );
          })}
          <circle cx={CX} cy={CY} r={R_SEGMENT} fill="url(#innerShade)" pointerEvents="none" />
          <circle cx={CX} cy={CY} r={R_SEGMENT} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="4" />
        </g>

        {/* segment gradients must live outside the rotating group to stay addressable */}
        <defs>
          {Array.from(new Set(SEGMENT_MULTIPLIERS)).map((m) => {
            const s = segmentStyle(m);
            return (
              <linearGradient key={m} id={`seg-${m}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.from} />
                <stop offset="100%" stopColor={s.to} />
              </linearGradient>
            );
          })}
        </defs>
      </svg>

      {/* center hub / spin button */}
      <button
        type="button"
        onClick={onCenterSpin}
        disabled={!canSpin}
        aria-label="Spin the wheel"
        className="group absolute left-1/2 top-1/2 z-20 flex h-[27%] w-[27%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full transition disabled:cursor-not-allowed"
      >
        <span
          className={`absolute inset-0 rounded-full ${
            spinning
              ? "bg-slate-900 ring-2 ring-slate-700"
              : "bg-[radial-gradient(circle_at_50%_30%,#2b3556,#101728)] ring-2 ring-amber-300/60 shadow-[0_0_28px_rgba(255,200,90,0.35)] group-hover:shadow-[0_0_40px_rgba(255,200,90,0.6)] group-disabled:opacity-80"
          } transition`}
        />
        <span className="pointer-events-none absolute inset-[10%] rounded-full border border-white/10" />
        <span
          className={`relative z-10 text-[clamp(0.7rem,2.1vw,1.05rem)] font-black uppercase tracking-[0.16em] ${
            spinning ? "text-slate-500" : "text-amber-200"
          }`}
          style={{ fontFamily: "var(--font-num)" }}
        >
          {spinning ? "…" : "Spin"}
        </span>
        {!spinning && (
          <span className="relative z-10 mt-0.5 text-[0.55rem] font-bold uppercase tracking-[0.2em] text-slate-400">
            press
          </span>
        )}
      </button>

      <div className="sr-only">{SEGMENT_COUNT} segment wheel</div>
    </div>
  );
}
