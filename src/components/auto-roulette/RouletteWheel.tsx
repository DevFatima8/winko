"use client";

import { useEffect, useRef } from "react";
import { WHEEL_ORDER, colorOf } from "@/lib/roulette";

const STEP = 360 / 37;
const C = 200;
const IDLE_SPEED = 9; // deg/s
const SPIN_MS = 9500;
const TRACK_R = 168;
const POCKET_R = 123;

const pt = (r: number, a: number): [number, number] => {
  const rad = (a * Math.PI) / 180;
  return [C + r * Math.sin(rad), C - r * Math.cos(rad)];
};

function wedge(i: number, r1: number, r2: number) {
  const a0 = (i - 0.5) * STEP;
  const a1 = (i + 0.5) * STEP;
  const [x1, y1] = pt(r2, a0);
  const [x2, y2] = pt(r2, a1);
  const [x3, y3] = pt(r1, a1);
  const [x4, y4] = pt(r1, a0);
  return `M${x1} ${y1} A${r2} ${r2} 0 0 1 ${x2} ${y2} L${x3} ${y3} A${r1} ${r1} 0 0 0 ${x4} ${y4}Z`;
}

const easeOutBounce = (x: number) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
};

type SpinReq = { id: number; target: number; startedAt: number; resultAt: number; now: number } | null;

type Props = {
  spin: SpinReq;
  highlight: number | null;
  onEnd: (n: number) => void;
  onDrop?: () => void;
};

const fillOf = (n: number) => {
  const c = colorOf(n);
  return c === "green" ? "url(#gGreen)" : c === "red" ? "url(#gRed)" : "url(#gBlack)";
};

export default function RouletteWheel({ spin, highlight, onEnd, onDrop }: Props) {
  const wheelRef = useRef<SVGGElement>(null);
  const ballRef = useRef<SVGCircleElement>(null);
  const ballShine = useRef<SVGCircleElement>(null);
  const onEndRef = useRef(onEnd);
  const onDropRef = useRef(onDrop);
  const lastId = useRef<number | null>(null);
  const clockRef = useRef({ now: 0, at: 0, startedAt: 0, duration: SPIN_MS });
  const st = useRef({
    angle: 0,
    rel: 0,
    visible: false,
    spinning: false,
    dropped: false,
    start: 0,
    pocket: 0,
    turns: 8,
    target: 0,
  });

  useEffect(() => {
    onEndRef.current = onEnd;
    onDropRef.current = onDrop;
  });

  useEffect(() => {
    if (!spin) {
      st.current.spinning = false;
      st.current.visible = false;
      lastId.current = null;
      return;
    }
    clockRef.current = { now: spin.now, at: performance.now(), startedAt: spin.startedAt, duration: Math.max(1, spin.resultAt - spin.startedAt) };
    if (lastId.current === spin.id) return;
    lastId.current = spin.id;
    const s = st.current;
    s.spinning = true;
    s.dropped = false;
    s.pocket = WHEEL_ORDER.indexOf(spin.target) * STEP;
    s.turns = 8;
    s.target = spin.target;
  }, [spin]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = st.current;
      let speed = IDLE_SPEED;
      let r = POCKET_R;
      let rel = s.rel;
      let op = s.visible ? 1 : 0;

      if (s.spinning) {
        const clock = clockRef.current;
        const elapsed = Math.max(0, clock.now + now - clock.at - clock.startedAt);
        const p = Math.min(1, elapsed / clock.duration);
        const e = 1 - Math.pow(1 - p, 3);
        speed = IDLE_SPEED + 60 * Math.pow(1 - p, 2);
        let wob = 0;
        if (p > 0.6 && p < 0.92) wob = (Math.sin((p - 0.6) * 95) * 7 * (0.92 - p)) / 0.32;
        rel = s.pocket + s.turns * 360 * (1 - e) + wob;
        if (p < 0.04) r = POCKET_R + (TRACK_R - POCKET_R) * (p / 0.04);
        else if (p < 0.6) r = TRACK_R;
        else if (p < 0.86) {
          const q = (p - 0.6) / 0.26;
          r = TRACK_R + (POCKET_R - TRACK_R) * easeOutBounce(q);
          if (!s.dropped && q > 0.35) {
            s.dropped = true;
            onDropRef.current?.();
          }
        } else r = POCKET_R;
        op = p < 0.03 ? p / 0.03 : 1;
        if (p >= 1) {
          s.spinning = false;
          s.rel = s.pocket;
          s.visible = true;
          onEndRef.current(s.target);
        }
      }

      if (lastId.current !== null) {
        const clock = clockRef.current;
        const elapsed = Math.max(0, clock.now + now - clock.at - clock.startedAt);
        const p = Math.min(1, elapsed / clock.duration);
        s.angle = ((clock.startedAt + elapsed) * IDLE_SPEED / 1000 + 20 * clock.duration / 1000 * (1 - Math.pow(1 - p, 3))) % 360;
      } else s.angle = (s.angle + speed * dt) % 360;
      wheelRef.current?.setAttribute("transform", `rotate(${s.angle} ${C} ${C})`);
      const [bx, by] = pt(r, s.angle + rel);
      const ball = ballRef.current;
      if (ball) {
        ball.setAttribute("cx", `${bx}`);
        ball.setAttribute("cy", `${by}`);
        ball.setAttribute("opacity", `${op}`);
      }
      const shine = ballShine.current;
      if (shine) {
        shine.setAttribute("cx", `${bx - 1.6}`);
        shine.setAttribute("cy", `${by - 1.8}`);
        shine.setAttribute("opacity", `${op}`);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <svg viewBox="0 0 400 400" className="h-full w-full select-none drop-shadow-[0_18px_30px_rgba(0,0,0,0.65)]">
      <defs>
        <radialGradient id="gWood" cx="50%" cy="50%" r="50%">
          <stop offset="88%" stopColor="#3b1d0a" />
          <stop offset="96%" stopColor="#7a4420" />
          <stop offset="100%" stopColor="#2a1305" />
        </radialGradient>
        <radialGradient id="gTrack" cx="50%" cy="50%" r="50%">
          <stop offset="70%" stopColor="#0d0d10" />
          <stop offset="84%" stopColor="#2a2a31" />
          <stop offset="93%" stopColor="#17171b" />
          <stop offset="100%" stopColor="#3a3a42" />
        </radialGradient>
        <linearGradient id="gGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff2b0" />
          <stop offset="40%" stopColor="#e2b23c" />
          <stop offset="100%" stopColor="#8a5d10" />
        </linearGradient>
        <radialGradient id="gRed" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#ff3b3b" />
          <stop offset="100%" stopColor="#a30f1c" />
        </radialGradient>
        <radialGradient id="gBlack" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#3a3a3f" />
          <stop offset="100%" stopColor="#08080a" />
        </radialGradient>
        <radialGradient id="gGreen" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#0a6b2e" />
        </radialGradient>
        <radialGradient id="gCone" cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#7a4a25" />
          <stop offset="55%" stopColor="#3d210d" />
          <stop offset="100%" stopColor="#1a0d04" />
        </radialGradient>
        <radialGradient id="gInner" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor="#1a0d04" />
          <stop offset="100%" stopColor="#4a2a12" />
        </radialGradient>
        <radialGradient id="gBall" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#d9dce3" />
          <stop offset="100%" stopColor="#8c919c" />
        </radialGradient>
        <radialGradient id="gGlass" cx="35%" cy="25%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* outer wood + gold rims */}
      <circle cx={C} cy={C} r="198" fill="url(#gWood)" />
      <circle cx={C} cy={C} r="196" fill="none" stroke="url(#gGold)" strokeWidth="2.5" />
      <circle cx={C} cy={C} r="189" fill="url(#gTrack)" />
      <circle cx={C} cy={C} r="187" fill="none" stroke="url(#gGold)" strokeWidth="1.5" opacity="0.8" />

      {/* ball track detail */}
      <circle cx={C} cy={C} r="176" fill="none" stroke="#ffffff" strokeOpacity="0.05" strokeWidth="1" />
      <circle cx={C} cy={C} r="160" fill="none" stroke="#ffffff" strokeOpacity="0.06" strokeWidth="1" />

      {/* static deflectors */}
      {Array.from({ length: 8 }).map((_, k) => {
        const a = k * 45 + 22.5;
        const [x, y] = pt(163, a);
        return (
          <g key={k} transform={`rotate(${a} ${x} ${y})`}>
            <path d={`M${x} ${y - 7} L${x + 3.2} ${y} L${x} ${y + 7} L${x - 3.2} ${y} Z`} fill="url(#gGold)" stroke="#5c3d0a" strokeWidth="0.5" />
          </g>
        );
      })}

      {/* rotating part */}
      <g ref={wheelRef}>
        <circle cx={C} cy={C} r="150" fill="#0b0b0d" />
        {WHEEL_ORDER.map((n, i) => (
          <path key={n} d={wedge(i, 100, 148)} fill={fillOf(n)} stroke="#d8b24a" strokeWidth="0.9" />
        ))}
        {WHEEL_ORDER.map((n, i) => (
          <text
            key={`t${n}`}
            x={C}
            y={C - 135}
            transform={`rotate(${i * STEP} ${C} ${C})`}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="11.5"
            fontWeight="700"
            fill="#fff"
            fontFamily="Arial, Helvetica, sans-serif"
          >
            {n}
          </text>
        ))}
        {/* winning pocket highlight */}
        {highlight !== null && (
          <path
            d={wedge(WHEEL_ORDER.indexOf(highlight), 100, 148)}
            fill="rgba(255,255,255,0.18)"
            stroke="#fff"
            strokeWidth="2.2"
            filter="url(#glow)"
          />
        )}
        {/* pocket floor ring */}
        <circle cx={C} cy={C} r="100" fill="url(#gInner)" stroke="url(#gGold)" strokeWidth="2.5" />
        <circle cx={C} cy={C} r="150" fill="none" stroke="url(#gGold)" strokeWidth="2.5" />
        {/* inner wooden ring w/ pattern */}
        {Array.from({ length: 37 }).map((_, i) => {
          const [x1, y1] = pt(100, i * STEP + STEP / 2);
          const [x2, y2] = pt(78, i * STEP + STEP / 2);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000" strokeOpacity="0.35" strokeWidth="1" />;
        })}
        <circle cx={C} cy={C} r="78" fill="url(#gCone)" stroke="#000" strokeOpacity="0.5" />
        <circle cx={C} cy={C} r="60" fill="none" stroke="url(#gGold)" strokeWidth="1" opacity="0.6" />
        {/* spokes */}
        {[0, 90, 180, 270].map((a) => (
          <g key={a} transform={`rotate(${a + 45} ${C} ${C})`}>
            <rect x={C - 3.5} y={C - 70} width="7" height="50" rx="3" fill="url(#gGold)" stroke="#5c3d0a" strokeWidth="0.6" />
            <circle cx={C} cy={C - 72} r="6" fill="url(#gGold)" stroke="#5c3d0a" strokeWidth="0.6" />
          </g>
        ))}
        {/* turret */}
        <circle cx={C} cy={C} r="20" fill="url(#gGold)" stroke="#5c3d0a" strokeWidth="1" />
        <circle cx={C} cy={C} r="12" fill="#c99a2a" stroke="#fff2b0" strokeWidth="0.8" />
        <circle cx={C - 3} cy={C - 3} r="4" fill="#fff8d6" opacity="0.8" />
      </g>

      {/* ball */}
      <circle ref={ballRef} r="6.2" fill="url(#gBall)" stroke="rgba(0,0,0,0.35)" strokeWidth="0.6" cx={C} cy={C} opacity="0" style={{ filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.7))" }} />
      <circle ref={ballShine} r="1.6" fill="#fff" cx={C} cy={C} opacity="0" />

      {/* glass reflection */}
      <circle cx={C} cy={C} r="189" fill="url(#gGlass)" pointerEvents="none" />
    </svg>
  );
}
