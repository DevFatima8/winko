"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { WHEEL_ORDER, colorOf } from "./roulette";

export interface WheelHandle {
  spin: (target: number) => Promise<void>;
}

const S = 360 / WHEEL_ORDER.length;
const C = 200;
const TRACK_R = 174;
const POCKET_R = 126;
const f = (n: number) => n.toFixed(2);
const pt = (r: number, a: number) => {
  const rad = (a * Math.PI) / 180;
  return [C + r * Math.sin(rad), C - r * Math.cos(rad)] as const;
};

function slice(i: number, r1: number, r2: number) {
  const a0 = (i - 0.5) * S;
  const a1 = (i + 0.5) * S;
  const [x1, y1] = pt(r2, a0);
  const [x2, y2] = pt(r2, a1);
  const [x3, y3] = pt(r1, a1);
  const [x4, y4] = pt(r1, a0);
  return `M${f(x1)} ${f(y1)} A${r2} ${r2} 0 0 1 ${f(x2)} ${f(y2)} L${f(x3)} ${f(y3)} A${r1} ${r1} 0 0 0 ${f(x4)} ${f(y4)} Z`;
}

const FILL = { red: "#c1121f", black: "#141414", green: "#0a7a3d" } as const;
const FILL_DARK = { red: "#8f0d17", black: "#000000", green: "#06552a" } as const;

const easeOut = (t: number, p: number) => 1 - Math.pow(1 - t, p);
const smooth = (q: number) => q * q * (3 - 2 * q);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export default function Wheel({ ref }: { ref?: Ref<WheelHandle> }) {
  const wheelRef = useRef<SVGGElement>(null);
  const ballRef = useRef<SVGCircleElement>(null);
  const ballShadowRef = useRef<SVGCircleElement>(null);
  const wheelAngle = useRef(0);
  const ballRel = useRef(0);
  const raf = useRef<number | null>(null);

  const placeBall = (abs: number, r: number) => {
    const [x, y] = pt(r, abs);
    ballRef.current?.setAttribute("cx", f(x));
    ballRef.current?.setAttribute("cy", f(y));
    ballShadowRef.current?.setAttribute("cx", f(x + 1.5));
    ballShadowRef.current?.setAttribute("cy", f(y + 2));
  };

  useEffect(() => {
    placeBall(wheelAngle.current + ballRel.current, POCKET_R);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    spin(target: number) {
      return new Promise<void>((resolve) => {
        const idx = WHEEL_ORDER.indexOf(target);
        const pocketAngle = idx * S;
        const DURATION = 7500;

        const w0 = wheelAngle.current;
        const wEnd = w0 + 360 * 3 + Math.random() * 120;
        const psi0 = ballRel.current;
        const m = (((psi0 - pocketAngle) % 360) + 360) % 360;
        const D = -(360 * 9 + m);
        const start = performance.now();

        const frame = (now: number) => {
          const t = clamp01((now - start) / DURATION);
          const w = w0 + (wEnd - w0) * easeOut(t, 3);
          const psi = psi0 + D * easeOut(t, 3.2);

          let r: number;
          if (t < 0.05) r = POCKET_R + (TRACK_R - POCKET_R) * smooth(t / 0.05);
          else if (t < 0.6) r = TRACK_R;
          else if (t < 0.88) r = TRACK_R - (TRACK_R - POCKET_R - 6) * smooth((t - 0.6) / 0.28);
          else {
            const q = (t - 0.88) / 0.12;
            r = POCKET_R + (1 - q) * 6 * (1 + Math.sin(q * Math.PI * 4)) * 0.6 + (1 - q) * 3;
          }

          wheelRef.current?.setAttribute("transform", `rotate(${f(w)} ${C} ${C})`);
          placeBall(w + psi, r);

          if (t < 1) {
            raf.current = requestAnimationFrame(frame);
          } else {
            wheelAngle.current = w;
            ballRel.current = pocketAngle;
            placeBall(w + pocketAngle, POCKET_R);
            raf.current = null;
            resolve();
          }
        };
        raf.current = requestAnimationFrame(frame);
      });
    },
  }));

  const deflectors = Array.from({ length: 8 }, (_, i) => i * 45 + 22.5);

  return (
    <svg viewBox="0 0 400 400" className="h-full w-full select-none drop-shadow-[0_18px_30px_rgba(0,0,0,0.65)]">
      <defs>
        <radialGradient id="wood" cx="50%" cy="50%" r="50%">
          <stop offset="85%" stopColor="#3b1c08" />
          <stop offset="93%" stopColor="#7a3f14" />
          <stop offset="100%" stopColor="#2a1305" />
        </radialGradient>
        <radialGradient id="track" cx="50%" cy="50%" r="50%">
          <stop offset="80%" stopColor="#1b0e05" />
          <stop offset="90%" stopColor="#4a2a10" />
          <stop offset="100%" stopColor="#8a5a22" />
        </radialGradient>
        <radialGradient id="cone" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff3b0" />
          <stop offset="35%" stopColor="#d9a93a" />
          <stop offset="75%" stopColor="#8c611a" />
          <stop offset="100%" stopColor="#3d2a0c" />
        </radialGradient>
        <radialGradient id="innerRing" cx="50%" cy="50%" r="50%">
          <stop offset="70%" stopColor="#2b1608" />
          <stop offset="100%" stopColor="#5e3412" />
        </radialGradient>
        <radialGradient id="turret" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#fff7cf" />
          <stop offset="55%" stopColor="#e0b240" />
          <stop offset="100%" stopColor="#7a5514" />
        </radialGradient>
        <radialGradient id="ball" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#dcdcdc" />
          <stop offset="100%" stopColor="#8d8d8d" />
        </radialGradient>
      </defs>

      {/* Outer wooden bowl */}
      <circle cx={C} cy={C} r="199" fill="url(#wood)" />
      <circle cx={C} cy={C} r="196" fill="none" stroke="#e5be5a" strokeWidth="2.5" />
      <circle cx={C} cy={C} r="190" fill="url(#track)" />
      <circle cx={C} cy={C} r="190" fill="none" stroke="#c9972f" strokeWidth="1.5" />
      <circle cx={C} cy={C} r="160" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

      {/* Rotating wheel */}
      <g ref={wheelRef}>
        <circle cx={C} cy={C} r="160" fill="#c9972f" />
        {WHEEL_ORDER.map((n, i) => (
          <g key={n}>
            <path d={slice(i, 134, 158)} fill={FILL[colorOf(n)]} stroke="#d9ae44" strokeWidth="0.8" />
            <path d={slice(i, 116, 134)} fill={FILL_DARK[colorOf(n)]} stroke="#d9ae44" strokeWidth="0.8" />
            <text
              x={C}
              y={C - 141}
              transform={`rotate(${f(i * S)} ${C} ${C})`}
              fill="#fff"
              fontSize="24"
              fontWeight="700"
              textAnchor="middle"
              fontFamily="Georgia, serif"
              stroke="#080604"
              strokeWidth="0.8"
              paintOrder="stroke"
            >
              {n}
            </text>
          </g>
        ))}
        <circle cx={C} cy={C} r="134" fill="none" stroke="#e5be5a" strokeWidth="1.5" />
        <circle cx={C} cy={C} r="116" fill="url(#innerRing)" stroke="#e5be5a" strokeWidth="2" />
        {Array.from({ length: 37 }, (_, i) => {
          const [x, y] = pt(108, i * S);
          return <circle key={i} cx={f(x)} cy={f(y)} r="1.6" fill="#e5be5a" opacity="0.8" />;
        })}
        <circle cx={C} cy={C} r="98" fill="url(#cone)" stroke="#5c3d0e" strokeWidth="2" />
        <circle cx={C} cy={C} r="70" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
        <circle cx={C} cy={C} r="45" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
        {[0, 90, 180, 270].map((a) => (
          <g key={a} transform={`rotate(${a} ${C} ${C})`}>
            <line x1={C} y1={C - 20} x2={C} y2={C - 80} stroke="url(#turret)" strokeWidth="7" strokeLinecap="round" />
            <circle cx={C} cy={C - 80} r="7" fill="url(#turret)" stroke="#6a4810" strokeWidth="1" />
          </g>
        ))}
        <circle cx={C} cy={C} r="22" fill="url(#turret)" stroke="#6a4810" strokeWidth="2" />
        <circle cx={C} cy={C} r="7" fill="#fff7cf" stroke="#8a6416" strokeWidth="1" />
      </g>

      {/* Ball track deflectors (static) */}
      {deflectors.map((a) => {
        const [x, y] = pt(176, a);
        return (
          <rect
            key={a}
            x={f(x - 4)}
            y={f(y - 7)}
            width="8"
            height="14"
            rx="2"
            fill="#e5be5a"
            stroke="#7a5514"
            strokeWidth="0.8"
            transform={`rotate(${a + 45} ${f(x)} ${f(y)})`}
          />
        );
      })}

      {/* Ball */}
      <circle ref={ballShadowRef} r="6" fill="rgba(0,0,0,0.5)" />
      <circle ref={ballRef} r="6" fill="url(#ball)" />
    </svg>
  );
}
