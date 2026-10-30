"use client";

import { useEffect, useRef } from "react";
import { WHEEL_ORDER, colorOf, type Lightning } from "../lib/roulette";

type Props = {
  spin: { number: number; key: number; startedAt: number; resultAt: number; now: number } | null;
  lightning: Lightning;
  restNumber: number;
  onSettled: (n: number) => void;
};

const S = 720;
const C = S / 2;
const R = S / 2 - 4;
const STEP = (Math.PI * 2) / 37;
const TWO_PI = Math.PI * 2;
const TRACK_R = R * 0.865;
const POCKET_R = R * 0.6;

const pocketAngle = (i: number) => i * STEP - Math.PI / 2;

type SpinState = {
  start: number;
  duration: number;
  w0: number;
  wTotal: number;
  b0: number;
  bTotal: number;
  idx: number;
  number: number;
};

type Anim = { wa: number; ba: number; br: number; pocket: number; spin: SpinState | null };

function ballRadius(t: number) {
  if (t < 0.66) return TRACK_R;
  if (t < 0.84) {
    const u = (t - 0.66) / 0.18;
    const s = u * u * (3 - 2 * u);
    return TRACK_R + (POCKET_R - TRACK_R) * s;
  }
  const u = (t - 0.84) / 0.16;
  return POCKET_R + (1 - u) * (1 - u) * R * 0.07 * Math.abs(Math.sin(u * Math.PI * 4));
}

function circle(ctx: CanvasRenderingContext2D, r: number, fill: string | CanvasGradient) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TWO_PI);
  ctx.fillStyle = fill;
  ctx.fill();
}

function draw(ctx: CanvasRenderingContext2D, st: Anim, lightning: Lightning, now: number) {
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.translate(C, C);

  // Outer gold rim
  let g: CanvasGradient = ctx.createLinearGradient(-R, -R, R, R);
  g.addColorStop(0, "#5b3d0e");
  g.addColorStop(0.35, "#f7dd8f");
  g.addColorStop(0.6, "#8a6516");
  g.addColorStop(1, "#f1cf72");
  circle(ctx, R, g);
  circle(ctx, R * 0.975, "#140b06");
  g = ctx.createRadialGradient(0, 0, R * 0.78, 0, 0, R * 0.95);
  g.addColorStop(0, "#07070b");
  g.addColorStop(0.5, "#2c2f3d");
  g.addColorStop(1, "#08080c");
  circle(ctx, R * 0.95, g);

  // Ball track gold lines
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(212,175,55,0.55)";
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.935, 0, TWO_PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.795, 0, TWO_PI);
  ctx.stroke();

  // Deflectors
  for (let i = 0; i < 8; i++) {
    ctx.save();
    ctx.rotate((i * TWO_PI) / 8 + Math.PI / 8);
    ctx.translate(R * 0.865, 0);
    ctx.rotate(Math.PI / 4);
    const d = R * 0.022;
    ctx.fillStyle = "#e9c75d";
    ctx.fillRect(-d, -d, d * 2, d * 2);
    ctx.restore();
  }

  // Gold ring around the wheel head
  circle(ctx, R * 0.78, "#d4af37");
  circle(ctx, R * 0.765, "#050507");

  // Rotating wheel head
  ctx.save();
  ctx.rotate(st.wa);
  const pulse = 0.5 + 0.5 * Math.sin(now / 220);
  for (let i = 0; i < 37; i++) {
    const n = WHEEL_ORDER[i];
    const a0 = pocketAngle(i) - STEP / 2;
    const a1 = a0 + STEP;
    const col = colorOf(n);
    const lm = lightning[n];
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.76, a0, a1);
    ctx.arc(0, 0, R * 0.5, a1, a0, true);
    ctx.closePath();
    if (lm) {
      ctx.save();
      ctx.shadowColor = "#ffd84a";
      ctx.shadowBlur = 8 + pulse * 14;
      ctx.fillStyle = "#f6c630";
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = col === "red" ? "#c1121f" : col === "black" ? "#0b0b0f" : "#0d8a43";
      ctx.fill();
    }
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "#d9b44a";
    ctx.stroke();

    // number
    ctx.save();
    const mid = a0 + STEP / 2;
    ctx.rotate(mid);
    ctx.translate(R * 0.69, 0);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = lm ? "#1b1300" : "#ffffff";
    ctx.font = `bold ${R * 0.09}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(n), 0, 0);
    ctx.restore();

    if (lm) {
      ctx.save();
      ctx.rotate(mid);
      ctx.translate(R * 0.56, 0);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = "#1b1300";
      ctx.font = `bold ${R * 0.036}px Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${lm}x`, 0, 0);
      ctx.restore();
    }
  }

  // Inner cone
  g = ctx.createRadialGradient(0, 0, R * 0.04, 0, 0, R * 0.5);
  g.addColorStop(0, "#fff3b8");
  g.addColorStop(0.45, "#c79a28");
  g.addColorStop(0.75, "#7a5a12");
  g.addColorStop(1, "#d9b44a");
  circle(ctx, R * 0.49, g);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(60,40,5,0.65)";
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.36, 0, TWO_PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.24, 0, TWO_PI);
  ctx.stroke();
  // spokes
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 2 + Math.PI / 4);
    const sg = ctx.createLinearGradient(0, -R * 0.03, 0, R * 0.03);
    sg.addColorStop(0, "#fff0a8");
    sg.addColorStop(1, "#7a5a12");
    ctx.fillStyle = sg;
    ctx.fillRect(R * 0.05, -R * 0.018, R * 0.36, R * 0.036);
    ctx.restore();
  }
  ctx.restore();

  // Ball
  if (st.pocket >= 0 || st.spin) {
    const bx = Math.cos(st.ba) * st.br;
    const by = Math.sin(st.ba) * st.br;
    const br = R * 0.024;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    const bg = ctx.createRadialGradient(bx - br * 0.35, by - br * 0.35, br * 0.1, bx, by, br);
    bg.addColorStop(0, "#ffffff");
    bg.addColorStop(1, "#b9bcc6");
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, TWO_PI);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

export default function Wheel({ spin, lightning, restNumber, onSettled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lightningRef = useRef<Lightning>(lightning);
  const settledRef = useRef(onSettled);
  const clockRef = useRef({ now: 0, at: 0 });
  const sharedRef = useRef(spin);
  const animRef = useRef<Anim>({
    wa: 0,
    ba: 0,
    br: POCKET_R,
    pocket: WHEEL_ORDER.indexOf(restNumber),
    spin: null,
  });

  useEffect(() => {
    lightningRef.current = lightning;
    settledRef.current = onSettled;
    sharedRef.current = spin;
    if (spin) clockRef.current = { now: spin.now, at: performance.now() };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = animRef.current;
      const sp = st.spin;
      if (sp) {
        const shared = sharedRef.current;
        const elapsed = shared ? clockRef.current.now + now - clockRef.current.at - shared.startedAt : now - sp.start;
        const t = Math.max(0, Math.min(1, elapsed / sp.duration));
        st.wa = sp.w0 + sp.wTotal * (1 - Math.pow(1 - t, 3));
        st.ba = sp.b0 - sp.bTotal * (1 - Math.pow(1 - t, 2.6));
        st.br = ballRadius(t);
        if (t >= 1) {
          st.spin = null;
          st.pocket = sp.idx;
          settledRef.current(sp.number);
        }
      } else {
        const shared = sharedRef.current;
        if (shared) {
          const elapsed = Math.max(0, clockRef.current.now + now - clockRef.current.at - shared.resultAt);
          st.wa = TWO_PI * 1.6 + elapsed * 0.3 / 1000;
        } else st.wa += 0.3 * dt;
        if (st.pocket >= 0) {
          st.ba = st.wa + pocketAngle(st.pocket);
          st.br = POCKET_R;
        }
      }
      draw(ctx, st, lightningRef.current, now);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const key = spin?.key;
  useEffect(() => {
    if (!spin) { animRef.current.spin = null; return; }
    const st = animRef.current;
    const idx = WHEEL_ORDER.indexOf(spin.number);
    const wTotal = TWO_PI * 1.6;
    const bTotal = TWO_PI * 9;
    const wEnd = wTotal;
    st.pocket = -1;
    st.spin = {
      start: performance.now(),
      duration: Math.max(1, spin.resultAt - spin.startedAt),
      w0: 0,
      wTotal,
      b0: wEnd + pocketAngle(idx) + bTotal,
      bTotal,
      idx,
      number: spin.number,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <canvas ref={canvasRef} width={S} height={S} className="block h-auto w-full" />;
}
