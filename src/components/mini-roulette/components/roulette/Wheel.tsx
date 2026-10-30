"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { POCKET_ANGLE, WHEEL_ORDER, colorOf } from "../../lib/roulette";
import { playBallDrop, playTick } from "../../lib/sounds";

export interface WheelHandle {
  /** Spins the wheel and lands the ball in the given pocket index (index in WHEEL_ORDER). */
  spin: (pocketIndex: number) => Promise<void>;
}

interface WheelProps {
  soundOn: boolean;
  className?: string;
}

const C = 210;
const R_OUT = 206;
const R_RIM_IN = 190;
const R_TRACK_IN = 172;
const R_POCKET_OUT = 160;
const R_POCKET_IN = 112;
const R_BALL_TRACK = 181;
const R_BALL_REST = 127;
const R_NUM = 138;
const R_DEFLECT = 166;
const BALL_R = 7;
const SPIN_MS = 7600;

function pt(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function sectorPath(i: number, rOut: number, rIn: number): string {
  const a0 = i * POCKET_ANGLE - POCKET_ANGLE / 2;
  const a1 = a0 + POCKET_ANGLE;
  const [x0, y0] = pt(rOut, a0);
  const [x1, y1] = pt(rOut, a1);
  const [x2, y2] = pt(rIn, a1);
  const [x3, y3] = pt(rIn, a0);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${rOut} ${rOut} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(
    2,
  )} ${y2.toFixed(2)} A${rIn} ${rIn} 0 0 0 ${x3.toFixed(2)} ${y3.toFixed(2)} Z`;
}

const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const easeOutQuart = (p: number) => 1 - Math.pow(1 - p, 4);

export const Wheel = forwardRef<WheelHandle, WheelProps>(function Wheel({ soundOn, className }, ref) {
  const wheelG = useRef<SVGGElement>(null);
  const ballG = useRef<SVGGElement>(null);
  const ball = useRef<SVGCircleElement>(null);
  const ballShadow = useRef<SVGEllipseElement>(null);
  const angles = useRef({ w: 0, b: 0 });
  const raf = useRef<number | null>(null);
  const soundRef = useRef(soundOn);

  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    },
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      spin(pocketIndex: number) {
        return new Promise<void>((resolve) => {
          const { w: w0, b: b0 } = angles.current;
          // Wheel: 2+ turns clockwise.
          const w1 = w0 + 720 + Math.random() * 360;
          // Ball: at least 7 turns counter-clockwise, ending exactly on the pocket.
          const jitter = (Math.random() - 0.5) * POCKET_ANGLE * 0.45;
          const target = w1 + pocketIndex * POCKET_ANGLE + jitter;
          const q = Math.ceil((target - b0 + 360 * 7) / 360);
          const b1 = target - 360 * q;

          const t0 = performance.now();
          let lastPocket = -1;
          let dropped = false;

          const apply = (w: number, b: number, r: number) => {
            wheelG.current?.setAttribute("transform", `rotate(${w} ${C} ${C})`);
            ballG.current?.setAttribute("transform", `rotate(${b} ${C} ${C})`);
            ball.current?.setAttribute("cy", String(C - r));
            ballShadow.current?.setAttribute("cy", String(C - r + 3));
          };

          const frame = (now: number) => {
            const p = Math.min(1, (now - t0) / SPIN_MS);
            const w = w0 + (w1 - w0) * easeOutCubic(p);
            const b = b0 + (b1 - b0) * easeOutQuart(p);

            let r = R_BALL_TRACK;
            if (p > 0.62) {
              const q2 = (p - 0.62) / 0.38;
              const drop = Math.min(1, q2 * q2 * 1.25);
              r = R_BALL_TRACK - (R_BALL_TRACK - R_BALL_REST) * drop;
              if (q2 > 0.42 && q2 < 1) r += Math.abs(Math.sin(q2 * Math.PI * 3.5)) * (1 - q2) * 7;
              if (!dropped) {
                dropped = true;
                if (soundRef.current) playBallDrop();
              }
            }
            apply(w, b, r);

            const rel = (((b - w) % 360) + 360) % 360;
            const pocket = Math.floor((rel + POCKET_ANGLE / 2) / POCKET_ANGLE) % WHEEL_ORDER.length;
            if (pocket !== lastPocket) {
              if (lastPocket !== -1 && p > 0.18 && p < 0.985 && soundRef.current) playTick(0.04 + p * 0.12);
              lastPocket = pocket;
            }

            if (p < 1) {
              raf.current = requestAnimationFrame(frame);
            } else {
              angles.current = { w: w1 % 360, b: ((b1 % 360) + 360) % 360 };
              apply(w1, b1, R_BALL_REST);
              raf.current = null;
              resolve();
            }
          };

          if (raf.current) cancelAnimationFrame(raf.current);
          raf.current = requestAnimationFrame(frame);
        });
      },
    }),
    [],
  );

  return (
    <svg viewBox="0 0 420 420" className={className} role="img" aria-label="Roulette wheel">
      <defs>
        <linearGradient id="mr-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8a5a2b" />
          <stop offset="0.5" stopColor="#4a2d12" />
          <stop offset="1" stopColor="#8a5a2b" />
        </linearGradient>
        <linearGradient id="mr-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6dd8a" />
          <stop offset="0.5" stopColor="#b8860b" />
          <stop offset="1" stopColor="#f6dd8a" />
        </linearGradient>
        <radialGradient id="mr-cone" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#4b4c52" />
          <stop offset="0.65" stopColor="#202126" />
          <stop offset="1" stopColor="#101114" />
        </radialGradient>
        <radialGradient id="mr-track" cx="50%" cy="50%" r="50%">
          <stop offset="0.86" stopColor="#0a0a0c" />
          <stop offset="1" stopColor="#1c1d22" />
        </radialGradient>
        <radialGradient id="mr-ball" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#dcdcdc" />
          <stop offset="1" stopColor="#7f7f85" />
        </radialGradient>
      </defs>

      {/* Static body */}
      <circle cx={C} cy={C} r={R_OUT} fill="url(#mr-rim)" stroke="url(#mr-gold)" strokeWidth={3} />
      <circle cx={C} cy={C} r={R_RIM_IN} fill="url(#mr-track)" stroke="url(#mr-gold)" strokeWidth={2} />
      <circle cx={C} cy={C} r={R_TRACK_IN} fill="#17181c" stroke="#2c2d33" strokeWidth={1.5} />
      {Array.from({ length: 8 }).map((_, k) => {
        const a = k * 45 + 22.5;
        const [x, y] = pt(R_DEFLECT, a);
        return (
          <polygon
            key={k}
            points="0,-7 4.5,0 0,7 -4.5,0"
            transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${a})`}
            fill="url(#mr-gold)"
          />
        );
      })}

      {/* Rotating wheel head */}
      <g ref={wheelG} transform={`rotate(0 ${C} ${C})`}>
        {WHEEL_ORDER.map((n, i) => (
          <path
            key={n}
            d={sectorPath(i, R_POCKET_OUT, R_POCKET_IN)}
            fill={colorOf(n) === "red" ? "#c8102e" : "#1a1b1f"}
          />
        ))}
        {WHEEL_ORDER.map((_, i) => {
          const a = i * POCKET_ANGLE - POCKET_ANGLE / 2;
          const [x1, y1] = pt(R_POCKET_IN, a);
          const [x2, y2] = pt(R_POCKET_OUT, a);
          return (
            <line
              key={i}
              x1={x1.toFixed(2)}
              y1={y1.toFixed(2)}
              x2={x2.toFixed(2)}
              y2={y2.toFixed(2)}
              stroke="#d8b25a"
              strokeWidth={2}
            />
          );
        })}
        <circle cx={C} cy={C} r={R_POCKET_OUT} fill="none" stroke="url(#mr-gold)" strokeWidth={3} />
        {WHEEL_ORDER.map((n, i) => (
          <text
            key={n}
            x={C}
            y={C - R_NUM}
            transform={`rotate(${i * POCKET_ANGLE} ${C} ${C})`}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={21}
            fontWeight={700}
            fill="#ffffff"
            fontFamily="Arial, Helvetica, sans-serif"
          >
            {n}
          </text>
        ))}
        <circle cx={C} cy={C} r={R_POCKET_IN} fill="url(#mr-cone)" stroke="url(#mr-gold)" strokeWidth={2.5} />
        <circle cx={C} cy={C} r={56} fill="none" stroke="url(#mr-gold)" strokeWidth={1.5} opacity={0.8} />
        {[0, 90, 180, 270].map((a) => (
          <g key={a} transform={`rotate(${a} ${C} ${C})`}>
            <line x1={C} y1={C - 16} x2={C} y2={C - 52} stroke="url(#mr-gold)" strokeWidth={7} strokeLinecap="round" />
            <circle cx={C} cy={C - 56} r={6} fill="url(#mr-gold)" />
          </g>
        ))}
        <circle cx={C} cy={C} r={18} fill="url(#mr-gold)" />
        <circle cx={C} cy={C} r={8} fill="#2b1d05" />
      </g>

      {/* Ball */}
      <g ref={ballG} transform={`rotate(0 ${C} ${C})`}>
        <ellipse
          ref={ballShadow}
          cx={C}
          cy={C - R_BALL_REST + 3}
          rx={BALL_R + 1}
          ry={BALL_R * 0.6}
          fill="#000"
          opacity={0.4}
        />
        <circle ref={ball} cx={C} cy={C - R_BALL_REST} r={BALL_R} fill="url(#mr-ball)" />
      </g>
    </svg>
  );
});
