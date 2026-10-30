"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import type { Phase } from "./lib/engine";

export type DrawState = {
  phase: Phase;
  t: number;
  multiplier: number;
  crashPoint: number;
  countdown: number;
  betPlaced: boolean;
};

export type FlightDeckHandle = {
  draw: (s: DrawState) => void;
};

type Star = { x: number; y: number; z: number; r: number };

/* ---- world scale: fixed px per second / per multiplier unit ---- */
const PX_PER_SEC = 48;
const PX_PER_MULT = 28;

const C = {
  hair: "rgba(47, 230, 255, 0.10)",
  hairStrong: "rgba(47, 230, 255, 0.22)",
  cyan: "#2fe6ff",
  launch: "#ff5a1f",
  crimson: "#ff3b57",
  mist: "#7f8eae",
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function niceStep(raw: number, candidates: number[]): number {
  for (const c of candidates) if (c >= raw) return c;
  return candidates[candidates.length - 1];
}

const FlightDeck = forwardRef<FlightDeckHandle, { reduced: boolean }>(function FlightDeck({ reduced }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const starsRef = useRef<Star[]>([]);
  const bgRef = useRef<HTMLImageElement | null>(null);
  const flashRef = useRef(0);
  const camRef = useRef({ x: 0, y: 0 });
  const lastPhase = useRef<Phase>("betting");
  const rafRef = useRef<number>(0);
  const stateRef = useRef<DrawState>({
    phase: "betting",
    t: 0,
    multiplier: 1,
    crashPoint: 2,
    countdown: 6,
    betPlaced: false,
  });

  useImperativeHandle(ref, () => ({
    draw(s: DrawState) {
      if (s.phase === "crashed" && lastPhase.current !== "crashed") flashRef.current = 1;
      if (s.phase === "betting" && lastPhase.current !== "betting") {
        // new launch window — reset the chase camera to the pad
        camRef.current.x = 0;
        camRef.current.y = 0;
      }
      lastPhase.current = s.phase;
      stateRef.current = s;
    },
  }));

  useEffect(() => {
    const img = new Image();
    img.src = "images/space.jpg";
    img.onload = () => {
      bgRef.current = img;
    };

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const buildStars = (w: number, h: number) => {
      const n = Math.round((w * h) / 5200);
      starsRef.current = Array.from({ length: Math.min(280, Math.max(80, n)) }, () => ({
        x: Math.random(),
        y: Math.random(),
        z: 0.25 + Math.random() * 0.95,
        r: Math.random() < 0.86 ? 0.6 + Math.random() * 1.1 : 1.8 + Math.random() * 1.6,
      }));
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(320, Math.floor(rect.width * dpr));
      canvas.height = Math.max(240, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildStars(rect.width, rect.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      render(ctx, canvas, stateRef.current, starsRef.current, bgRef.current, flashRef, camRef.current, dt, reduced);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [reduced]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
});

function render(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  s: DrawState,
  stars: Star[],
  bg: HTMLImageElement | null,
  flashRef: { current: number },
  cam: { x: number; y: number },
  dt: number,
  reduced: boolean,
) {
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);

  /* ---- material layer: space plate + graphite wash ---- */
  if (bg && bg.complete && bg.naturalWidth > 0) {
    const scale = Math.max(w / bg.naturalWidth, h / bg.naturalHeight);
    const bw = bg.naturalWidth * scale;
    const bh = bg.naturalHeight * scale;
    ctx.globalAlpha = 0.5;
    ctx.drawImage(bg, (w - bw) / 2, (h - bh) / 2 - bh * 0.06, bw, bh);
    ctx.globalAlpha = 1;
    const wash = ctx.createLinearGradient(0, 0, 0, h);
    wash.addColorStop(0, "rgba(7, 11, 20, 0.72)");
    wash.addColorStop(0.55, "rgba(7, 11, 20, 0.55)");
    wash.addColorStop(1, "rgba(7, 11, 20, 0.92)");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
  } else {
    const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
    g.addColorStop(0, "#0a1120");
    g.addColorStop(1, "#060a12");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /* ---- starfield: drifts with the camera so the world feels like it moves ---- */
  const drift = reduced ? 0 : dt;
  const starOffsetY = (cam.y * 0.012) % h;
  const starOffsetX = (cam.x * 0.012) % w;
  ctx.fillStyle = "#cfe4ff";
  for (const st of stars) {
    st.y += drift * 0.006 * st.z;
    if (st.y > 1.02) st.y = -0.02;
    const sx = (((st.x * w - starOffsetX) % w) + w) % w;
    const sy = (((st.y * h + starOffsetY) % h) + h) % h;
    ctx.globalAlpha = (0.45 + st.z * 0.55) * 0.85;
    ctx.beginPath();
    ctx.arc(sx, sy, st.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* ---- plot frame (keeps clear of the roster panel on desktop) ---- */
  const desktop = w >= 1024;
  const rosterInset = desktop ? 300 : 0;
  const padL = 58;
  const padR = 26 + rosterInset;
  const padT = 26;
  const padB = 42;
  const plotW = Math.max(160, w - padL - padR);
  const plotH = Math.max(140, h - padT - padB);
  const plotL = padL;
  const plotR = padL + plotW;
  const plotTop = padT;
  const plotBot = padT + plotH;

  const flying = s.phase === "flying" || s.phase === "crashed";
  const tNow = flying ? s.t : 0;
  const mNow = flying ? s.multiplier : 1;

  // Keep the desktop launch pad to the right of the 400px bet console.
  // This gives the rocket and its nose a clear safety gap as soon as a round starts.
  const launchX = desktop
    ? Math.min(plotR - 72, Math.max(500, plotL + plotW * 0.54))
    : plotL + plotW * 0.13;
  const launchWorldX = launchX - plotL;

  /* ---- chase camera: keep the rocket inside a comfortable box ---- */
  const worldX = launchWorldX + tNow * PX_PER_SEC;
  const worldY = Math.max(0, mNow - 1) * PX_PER_MULT;

  // the flight line sits a little above the floor of the plot, so the rocket
  // never starts jammed against the bottom edge
  const baseY = plotBot - plotH * 0.14;

  const safeLeft = launchX;
  const safeRight = desktop
    ? Math.max(launchX + 24, Math.min(plotR - 48, launchX + plotW * 0.34))
    : plotL + plotW * 0.62;
  const safeTop = plotTop + plotH * 0.17;

  // screenX = plotL + worldX - cam.x      -> raising cam.x slides the world left
  // screenY = baseY - worldY + cam.y      -> raising cam.y slides the world down
  let targetX = cam.x;
  let targetY = cam.y;
  const screenX = plotL + (worldX - cam.x);
  const screenY = baseY - (worldY - cam.y);
  if (screenX > safeRight) targetX += screenX - safeRight;
  else if (screenX < safeLeft) targetX += screenX - safeLeft;
  if (screenY < safeTop) targetY += safeTop - screenY;

  const ease = reduced ? 1 : 1 - Math.exp(-9 * dt);
  cam.x += (targetX - cam.x) * ease;
  cam.y += (targetY - cam.y) * ease;

  const X = (t: number) => plotL + (launchWorldX + t * PX_PER_SEC - cam.x);
  const Y = (m: number) => baseY - ((m - 1) * PX_PER_MULT - cam.y);

  /* ---- grid ---- */
  const tStep = niceStep((plotW * 0.18) / PX_PER_SEC, [0.5, 1, 2, 5, 10, 20]);
  const mStep = niceStep((plotH * 0.16) / PX_PER_MULT, [0.5, 1, 2, 5, 10, 20, 50, 100]);

  ctx.lineWidth = 1;
  ctx.font = "500 10px 'JetBrains Mono', monospace";
  ctx.fillStyle = C.mist;
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";

  const tMin = Math.max(0, (cam.x - launchWorldX) / PX_PER_SEC);
  const tMax = (cam.x + plotW - launchWorldX) / PX_PER_SEC;
  const mMin = 1 + cam.y / PX_PER_MULT;
  const mMax = 1 + (cam.y + plotH) / PX_PER_MULT;

  ctx.beginPath();
  for (let t = Math.floor(tMin / tStep) * tStep; t <= tMax + tStep; t += tStep) {
    const x = X(t);
    if (x < plotL - 0.5 || x > plotR + 0.5) continue;
    ctx.moveTo(x, plotTop);
    ctx.lineTo(x, plotBot);
  }
  for (let m = Math.floor(mMin / mStep) * mStep; m <= mMax + mStep; m += mStep) {
    const y = Y(m);
    if (y < plotTop - 0.5 || y > plotBot + 0.5) continue;
    ctx.moveTo(plotL, y);
    ctx.lineTo(plotR, y);
  }
  ctx.stroke();

  for (let t = Math.floor(tMin / tStep) * tStep; t <= tMax + tStep; t += tStep) {
    if (t < -0.001) continue;
    const x = X(t);
    if (x < plotL + 12 || x > plotR - 12) continue;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`${t % 1 === 0 ? t.toFixed(0) : t.toFixed(1)}s`, x, plotBot + 12);
  }
  for (let m = Math.floor(mMin / mStep) * mStep; m <= mMax + mStep; m += mStep) {
    if (m < 0.999) continue;
    const y = Y(m);
    if (y < plotTop + 8 || y > plotBot - 8) continue;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(`${m.toFixed(mStep < 1 ? 2 : 0)}x`, plotL - 10, y);
  }

  /* ---- frame chrome ---- */
  ctx.strokeStyle = C.hairStrong;
  ctx.beginPath();
  ctx.moveTo(plotL, plotTop - 6);
  ctx.lineTo(plotL, plotBot);
  ctx.lineTo(plotR, plotBot);
  ctx.stroke();

  if (flying && (s.t > 0.001 || s.phase === "crashed")) {
    /* ---- ascent curve in world space ---- */
    const steps = 160;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = (tNow / steps) * i;
      pts.push({ x: X(t), y: Y(Math.exp(0.155 * t)) });
    }

    const fillBase = Math.min(plotBot + 400, Y(1) + 260);
    const area = ctx.createLinearGradient(0, plotTop, 0, fillBase);
    area.addColorStop(0, "rgba(47, 230, 255, 0.22)");
    area.addColorStop(1, "rgba(47, 230, 255, 0.015)");
    ctx.beginPath();
    ctx.moveTo(pts[0].x, fillBase);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.lineTo(pts[pts.length - 1].x, fillBase);
    ctx.closePath();
    ctx.fillStyle = area;
    ctx.fill();

    const stroke = ctx.createLinearGradient(plotL, plotBot, plotR, plotTop);
    stroke.addColorStop(0, C.cyan);
    stroke.addColorStop(0.62, "#7fd6ff");
    stroke.addColorStop(1, C.launch);
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = stroke;
    ctx.shadowColor = "rgba(47, 230, 255, 0.55)";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.shadowBlur = 0;

    /* ---- rocket head ---- */
    const head = pts[pts.length - 1];
    const prev = pts[Math.max(0, pts.length - 12)];
    const ang = Math.atan2(head.y - prev.y, head.x - prev.x);

    const flick = reduced ? 1 : 0.82 + Math.sin(performance.now() / 42) * 0.18;
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(ang);
    const flameLen = 34 + 18 * flick * Math.min(1.6, s.multiplier / 2);
    const flame = ctx.createLinearGradient(-8, 0, -flameLen * 2.4, 0);
    flame.addColorStop(0, "rgba(255, 244, 214, 0.95)");
    flame.addColorStop(0.35, "rgba(255, 122, 34, 0.8)");
    flame.addColorStop(1, "rgba(255, 90, 31, 0)");
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-6, -6);
    ctx.quadraticCurveTo(-flameLen, -3.2 * flick, -flameLen * 2.1, 0);
    ctx.quadraticCurveTo(-flameLen, 3.2 * flick, -6, 6);
    ctx.closePath();
    ctx.fill();

    if (s.phase === "flying") {
      const hull = ctx.createLinearGradient(-14, -8, 18, 8);
      hull.addColorStop(0, "#e9f2ff");
      hull.addColorStop(0.55, "#9db1cf");
      hull.addColorStop(1, "#43526c");
      ctx.fillStyle = hull;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.quadraticCurveTo(6, -7.5, -9, -6.2);
      ctx.lineTo(-13, -3.4);
      ctx.lineTo(-13, 3.4);
      ctx.lineTo(-9, 6.2);
      ctx.quadraticCurveTo(6, 7.5, 18, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C.launch;
      ctx.beginPath();
      ctx.moveTo(-6, -5.4);
      ctx.lineTo(-14, -12.5);
      ctx.lineTo(-11.5, -4.2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-6, 5.4);
      ctx.lineTo(-14, 12.5);
      ctx.lineTo(-11.5, 4.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#0b1626";
      ctx.beginPath();
      ctx.arc(4.5, -1.4, 3.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(47, 230, 255, 0.85)";
      ctx.beginPath();
      ctx.arc(4.5, -1.4, 1.7, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const r = 30 + (1 - flashRef.current) * 60;
      const ex = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
      ex.addColorStop(0, "rgba(255, 236, 196, 0.95)");
      ex.addColorStop(0.35, "rgba(255, 90, 31, 0.75)");
      ex.addColorStop(1, "rgba(255, 59, 87, 0)");
      ctx.fillStyle = ex;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 90, 31, 0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.25, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    /* ---- crosshair on the head ---- */
    if (s.phase === "flying") {
      ctx.strokeStyle = "rgba(255, 90, 31, 0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(head.x, Math.max(plotTop, head.y + 26));
      ctx.lineTo(head.x, head.y);
      ctx.moveTo(plotL, head.y);
      ctx.lineTo(head.x, head.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    /* ---- live readout chip next to the rocket ---- */
    if (s.phase === "flying") {
      const label = `${s.multiplier.toFixed(2)}x`;
      ctx.font = "700 12px 'JetBrains Mono', monospace";
      const tw = ctx.measureText(label).width + 16;
      const lx = Math.min(head.x + 18, plotR - tw - 4);
      const ly = Math.max(plotTop + 4, head.y - 30);
      ctx.fillStyle = "rgba(7, 11, 20, 0.82)";
      roundRect(ctx, lx, ly, tw, 22, 3);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 90, 31, 0.55)";
      ctx.lineWidth = 1;
      roundRect(ctx, lx, ly, tw, 22, 3);
      ctx.stroke();
      ctx.fillStyle = "#ffb08a";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, lx + tw / 2, ly + 11);
    }
  } else {
    /* ---- idle: rocket on the pad, engine glow breathing ---- */
    const px = launchX;
    const py = baseY;
    const pulse = reduced ? 0.5 : 0.36 + Math.sin(performance.now() / 520) * 0.18;
    const glow = ctx.createRadialGradient(px - 10, py + 10, 2, px - 10, py + 10, 74);
    glow.addColorStop(0, `rgba(255, 90, 31, ${0.42 * pulse})`);
    glow.addColorStop(1, "rgba(255, 90, 31, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(px - 10, py + 10, 74, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-Math.PI / 2.6);
    const hull = ctx.createLinearGradient(-14, -8, 18, 8);
    hull.addColorStop(0, "#dfe9f8");
    hull.addColorStop(1, "#43526c");
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.quadraticCurveTo(6, -7.5, -9, -6.2);
    ctx.lineTo(-13, -3.4);
    ctx.lineTo(-13, 3.4);
    ctx.lineTo(-9, 6.2);
    ctx.quadraticCurveTo(6, 7.5, 18, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.launch;
    ctx.beginPath();
    ctx.moveTo(-6, -5.4);
    ctx.lineTo(-14, -12.5);
    ctx.lineTo(-11.5, -4.2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-6, 5.4);
    ctx.lineTo(-14, 12.5);
    ctx.lineTo(-11.5, 4.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    /* countdown ring, inside the plot so it never sits under the roster */
    const cx = plotL + plotW * 0.82;
    const cy = plotTop + plotH * 0.3;
    const rad = 44;
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(47, 230, 255, 0.14)";
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.stroke();
    const frac = Math.max(0, Math.min(1, s.countdown / 6));
    ctx.strokeStyle = frac > 0.34 ? C.cyan : C.launch;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
    ctx.lineCap = "butt";
    ctx.fillStyle = "#e8eefb";
    ctx.font = "700 22px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${Math.max(0, s.countdown).toFixed(1)}`, cx, cy - 4);
    ctx.font = "500 9px 'Space Grotesk', sans-serif";
    ctx.fillStyle = C.mist;
    ctx.fillText("T-MINUS", cx, cy + 18);
  }

  /* ---- vignette + crash flash ---- */
  const vig = ctx.createRadialGradient(w * 0.5, h * 0.45, Math.min(w, h) * 0.25, w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(3, 6, 12, 0.72)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  if (flashRef.current > 0) {
    flashRef.current = Math.max(0, flashRef.current - dt * 3.6);
    ctx.fillStyle = `rgba(255, 59, 87, ${flashRef.current * 0.3})`;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = `rgba(255, 90, 31, ${flashRef.current * 0.85})`;
    ctx.lineWidth = 3;
    roundRect(ctx, 2, 2, w - 4, h - 4, 4);
    ctx.stroke();
  }
}

export default FlightDeck;
