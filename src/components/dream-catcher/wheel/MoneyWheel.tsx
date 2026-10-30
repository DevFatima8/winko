"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import {
  SEGMENT_ANGLE,
  SEGMENT_COUNT,
  SPOT_THEME,
  WHEEL_SEQUENCE,
  type SpotId,
} from "../game/config";

const SIZE = 640;
const C = SIZE / 2;
const R_RIM_OUT = 316;
const R_RIM_IN = 296;
const R_SEG_OUT = 294;
const R_SEG_IN = 140;
const R_LABEL = 220;
const R_LED = 306;

function polar(angleDeg: number, radius: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: C + radius * Math.cos(rad), y: C + radius * Math.sin(rad) };
}

function sectorPath(startAngle: number, endAngle: number, rInner: number, rOuter: number) {
  const a = polar(startAngle, rOuter);
  const b = polar(endAngle, rOuter);
  const c = polar(endAngle, rInner);
  const d = polar(startAngle, rInner);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${a.x.toFixed(3)} ${a.y.toFixed(3)}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${b.x.toFixed(3)} ${b.y.toFixed(3)}`,
    `L ${c.x.toFixed(3)} ${c.y.toFixed(3)}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${d.x.toFixed(3)} ${d.y.toFixed(3)}`,
    "Z",
  ].join(" ");
}

export type WheelHandle = {
  spinToIndex: (
    index: number,
    options?: { duration?: number; turns?: number; onTick?: (index: number) => void },
  ) => Promise<void>;
  stop: () => void;
};

type Props = {
  highlightIndex: number | null;
  dimmed?: boolean;
  sharedSpin?: { key: string; index: number; fromIndex: number; startedAt: number; endsAt: number; now: number } | null;
};

const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4.2);

const MoneyWheel = forwardRef<WheelHandle, Props>(function MoneyWheel({ highlightIndex, dimmed, sharedSpin }, ref) {
  const discRef = useRef<SVGGElement | null>(null);
  const pointerRef = useRef<SVGGElement | null>(null);
  const rotationRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const sharedRef = useRef(sharedSpin);
  const clockRef = useRef({ now: 0, at: 0 });

  const paint = useCallback((degrees: number) => {
    discRef.current?.setAttribute("transform", `rotate(${degrees.toFixed(3)} ${C} ${C})`);
  }, []);

  useEffect(() => {
    sharedRef.current = sharedSpin;
    if (sharedSpin) clockRef.current = { now: sharedSpin.now, at: performance.now() };
  }, [sharedSpin]);

  const sharedKey = sharedSpin?.key;
  useEffect(() => {
    if (!sharedKey) return;
    let raf = 0;
    const frame = (now: number) => {
      const spin = sharedRef.current;
      if (!spin) return;
      const elapsed = clockRef.current.now + now - clockRef.current.at - spin.startedAt;
      const progress = Math.max(0, Math.min(1, elapsed / Math.max(1, spin.endsAt - spin.startedAt)));
      const from = ((-spin.fromIndex * SEGMENT_ANGLE % 360) + 360) % 360;
      const desired = ((-spin.index * SEGMENT_ANGLE % 360) + 360) % 360;
      const delta = ((desired - from) % 360 + 360) % 360;
      const rotation = from + (6 * 360 + delta) * easeOutQuart(progress);
      rotationRef.current = rotation;
      paint(rotation);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [sharedKey, paint]);

  const kickPointer = useCallback(() => {
    const node = pointerRef.current;
    if (!node) return;
    node.classList.remove("pointer-kick");
    // force reflow so the animation restarts
    void node.getBoundingClientRect();
    node.classList.add("pointer-kick");
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      stop() {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      },
      spinToIndex(index, options) {
        const duration = options?.duration ?? 6800;
        const turns = options?.turns ?? 5;
        const onTick = options?.onTick;

        return new Promise<void>((resolve) => {
          if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

          const from = rotationRef.current;
          const currentMod = ((from % 360) + 360) % 360;
          const desiredMod = (((-index * SEGMENT_ANGLE) % 360) + 360) % 360;
          let delta = desiredMod - currentMod;
          const jitter = (Math.random() * 2 - 1) * SEGMENT_ANGLE * 0.3;
          delta += jitter;
          delta = ((delta % 360) + 360) % 360;
          const target = from + turns * 360 + delta;

          const start = performance.now();
          let lastTick = Math.round(-from / SEGMENT_ANGLE);
          let lastTickAt = 0;

          const frame = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            const current = from + (target - from) * easeOutQuart(t);
            rotationRef.current = current;
            paint(current);

            const tickIndex = Math.round(-current / SEGMENT_ANGLE);
            if (tickIndex !== lastTick && now - lastTickAt > 26) {
              lastTick = tickIndex;
              lastTickAt = now;
              const normalized = ((tickIndex % SEGMENT_COUNT) + SEGMENT_COUNT) % SEGMENT_COUNT;
              kickPointer();
              onTick?.(normalized);
            }

            if (t < 1) {
              rafRef.current = requestAnimationFrame(frame);
            } else {
              rafRef.current = null;
              paint(target);
              resolve();
            }
          };

          rafRef.current = requestAnimationFrame(frame);
        });
      },
    }),
    [kickPointer, paint],
  );

  const segments = WHEEL_SEQUENCE.map((spot, i) => {
    const start = i * SEGMENT_ANGLE - SEGMENT_ANGLE / 2;
    const end = start + SEGMENT_ANGLE;
    const theme = SPOT_THEME[spot];
    const label = spot;
    const isMulti = label === "2x" || label === "7x";
    return (
      <g key={`${spot}-${i}`}>
        <path d={sectorPath(start, end, R_SEG_IN, R_SEG_OUT)} fill={`url(#grad-${label})`} />
        <path
          d={sectorPath(start, end, R_SEG_IN, R_SEG_OUT)}
          fill="none"
          stroke={theme.edge}
          strokeOpacity={0.35}
          strokeWidth={1}
        />
        <path d={sectorPath(start, start + 0.35, R_SEG_IN, R_SEG_OUT)} fill="rgba(0,0,0,0.28)" />
        <g transform={`rotate(${i * SEGMENT_ANGLE} ${C} ${C})`}>
          <text
            x={C}
            y={C - R_LABEL}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={isMulti ? 27 : 34}
            fontWeight={900}
            fill={theme.text}
            stroke="rgba(0,0,0,0.25)"
            strokeWidth={0.8}
            style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", letterSpacing: "-0.5px" }}
          >
            {isMulti ? label.toUpperCase() : label}
          </text>
          <rect
            x={C - 15}
            y={C - R_LABEL + 21}
            width={30}
            height={3}
            rx={1.5}
            fill={theme.text}
            opacity={0.45}
          />
        </g>
        {highlightIndex === i ? (
          <path
            className="segment-win"
            d={sectorPath(start, end, R_SEG_IN, R_SEG_OUT)}
            fill="#ffffff"
          />
        ) : null}
      </g>
    );
  });

  const frets = Array.from({ length: SEGMENT_COUNT }, (_, i) => {
    const angle = i * SEGMENT_ANGLE - SEGMENT_ANGLE / 2;
    const outer = polar(angle, R_SEG_OUT - 3);
    const inner = polar(angle, R_SEG_IN + 3);
    return (
      <g key={`fret-${i}`}>
        <line
          x1={inner.x}
          y1={inner.y}
          x2={outer.x}
          y2={outer.y}
          stroke="rgba(255,255,255,0.5)"
          strokeWidth={1.6}
        />
        <circle cx={outer.x} cy={outer.y} r={3.4} fill="#f4c542" opacity={0.9} />
      </g>
    );
  });

  const leds = Array.from({ length: SEGMENT_COUNT }, (_, i) => {
    const p = polar(i * SEGMENT_ANGLE, R_LED);
    const warm = i % 2 === 0;
    return (
      <circle
        key={`led-${i}`}
        className="wheel-led"
        cx={p.x}
        cy={p.y}
        r={4.2}
        fill={warm ? "#ffe9a8" : "#8ef4ff"}
        style={{ animationDelay: `${(i % 12) * 0.11}s` }}
      />
    );
  });

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="h-full w-full select-none"
      style={{ filter: dimmed ? "saturate(0.75) brightness(0.82)" : undefined }}
      role="img"
      aria-label="Money wheel"
    >
      <defs>
        {(Object.keys(SPOT_THEME) as SpotId[]).map((spot) => {
          const theme = SPOT_THEME[spot];
          return (
            <radialGradient key={spot} id={`grad-${spot}`} cx="50%" cy="50%" r="50%">
              <stop offset="0.42" stopColor={theme.edge} />
              <stop offset="0.5" stopColor={theme.face} />
              <stop offset="0.78" stopColor={theme.face} />
              <stop offset="0.94" stopColor={theme.faceDeep} />
            </radialGradient>
          );
        })}
        <linearGradient id="rimGold" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fff3c4" />
          <stop offset="35%" stopColor="#f4c542" />
          <stop offset="70%" stopColor="#a2690c" />
          <stop offset="100%" stopColor="#ffe08a" />
        </linearGradient>
        <radialGradient id="hubGrad" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#3a2168" />
          <stop offset="65%" stopColor="#170d31" />
          <stop offset="100%" stopColor="#0a0518" />
        </radialGradient>
        <radialGradient id="haloGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0.55" stopColor="rgba(244,197,66,0.45)" />
          <stop offset="1" stopColor="rgba(244,197,66,0)" />
        </radialGradient>
        <linearGradient id="glass" x1="0%" y1="0%" x2="60%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
          <stop offset="42%" stopColor="rgba(255,255,255,0.03)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>

      <circle className="wheel-halo" cx={C} cy={C} r={R_RIM_OUT + 6} fill="url(#haloGrad)" />

      {/* rotating disc */}
      <g ref={discRef}>
        <circle cx={C} cy={C} r={R_SEG_OUT} fill="#0a0518" />
        {segments}
        {frets}
        <circle cx={C} cy={C} r={R_SEG_IN} fill="url(#hubGrad)" />
        <circle cx={C} cy={C} r={R_SEG_IN} fill="none" stroke="url(#rimGold)" strokeWidth={5} />
        <circle cx={C} cy={C} r={R_SEG_IN - 16} fill="none" stroke="rgba(244,197,66,0.35)" strokeWidth={1.5} />
        {/* original dream-web emblem */}
        <g stroke="rgba(244,197,66,0.75)" fill="none" strokeWidth={2}>
          <circle cx={C} cy={C} r={62} />
          <circle cx={C} cy={C} r={44} strokeOpacity={0.6} />
          <circle cx={C} cy={C} r={26} strokeOpacity={0.45} />
          {Array.from({ length: 8 }, (_, i) => {
            const p = polar(i * 45, 62);
            return <line key={i} x1={C} y1={C} x2={p.x} y2={p.y} strokeOpacity={0.4} />;
          })}
        </g>
        <g stroke="rgba(41,197,214,0.85)" strokeWidth={2.4} strokeLinecap="round">
          <line x1={C - 18} y1={C + 62} x2={C - 22} y2={C + 92} />
          <line x1={C} y1={C + 62} x2={C} y2={C + 100} />
          <line x1={C + 18} y1={C + 62} x2={C + 22} y2={C + 92} />
        </g>
        <g fill="rgba(41,197,214,0.5)">
          <ellipse cx={C - 24} cy={C + 100} rx={6} ry={13} />
          <ellipse cx={C} cy={C + 108} rx={6.5} ry={14} />
          <ellipse cx={C + 24} cy={C + 100} rx={6} ry={13} />
        </g>
      </g>

      {/* static housing */}
      <circle cx={C} cy={C} r={(R_RIM_OUT + R_RIM_IN) / 2} fill="none" stroke="url(#rimGold)" strokeWidth={R_RIM_OUT - R_RIM_IN} />
      <circle cx={C} cy={C} r={R_RIM_IN - 1} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={3} />
      <circle cx={C} cy={C} r={R_RIM_OUT - 1} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={2} />
      {leds}
      <circle cx={C} cy={C} r={R_SEG_OUT - 2} fill="url(#glass)" pointerEvents="none" />

      {/* pointer */}
      <g ref={pointerRef}>
        <path
          d={`M ${C - 26} 6 L ${C + 26} 6 L ${C + 16} 40 L ${C} 74 L ${C - 16} 40 Z`}
          fill="url(#rimGold)"
          stroke="#3a2405"
          strokeWidth={2}
        />
        <circle cx={C} cy={22} r={7} fill="#2a1a02" opacity={0.55} />
      </g>
    </svg>
  );
});

export default MoneyWheel;
