"use client";

import { useEffect, useRef } from "react";

export interface Burst {
  x: number;
  y: number;
  count?: number;
  colors: string[];
  shape: "coin" | "confetti" | "spark";
  power?: number;
}

type Listener = (b: Burst) => void;
const subs = new Set<Listener>();

export function onBurst(l: Listener): () => void {
  subs.add(l);
  return () => {
    subs.delete(l);
  };
}

export function burst(b: Burst) {
  subs.forEach((l) => l(b));
}

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  rot: number;
  vr: number;
  size: number;
  color: string;
  life: number;
  decay: number;
  shape: Burst["shape"];
}

export default function ParticleCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const c = cv.getContext("2d");
    if (!c) return;

    const parts: P[] = [];

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = window.innerWidth * dpr;
      cv.height = window.innerHeight * dpr;
      cv.style.width = window.innerWidth + "px";
      cv.style.height = window.innerHeight + "px";
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const off = onBurst((b) => {
      const n = b.count ?? 30;
      const power = b.power ?? 7;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (0.3 + Math.random() * 0.7) * power;
        parts.push({
          x: b.x,
          y: b.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - power * 0.45,
          g: 0.16 + Math.random() * 0.1,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.35,
          size: b.shape === "coin" ? 5 + Math.random() * 5 : 4 + Math.random() * 6,
          color: b.colors[Math.floor(Math.random() * b.colors.length)],
          life: 1,
          decay: 0.008 + Math.random() * 0.014,
          shape: b.shape,
        });
      }
      if (parts.length > 900) parts.splice(0, parts.length - 900);
    });

    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(2.5, (t - last) / 16.7);
      last = t;
      c.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += p.g * dt;
        p.rot += p.vr * dt;
        p.life -= p.decay * dt;
        if (p.life <= 0 || p.y > window.innerHeight + 50) {
          parts.splice(i, 1);
          continue;
        }
        c.save();
        c.globalAlpha = Math.max(0, Math.min(1, p.life));
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        if (p.shape === "coin") {
          c.fillStyle = p.color;
          c.beginPath();
          c.arc(0, 0, p.size, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = "rgba(255,255,255,0.55)";
          c.beginPath();
          c.arc(-p.size * 0.28, -p.size * 0.3, p.size * 0.32, 0, Math.PI * 2);
          c.fill();
        } else if (p.shape === "confetti") {
          c.fillStyle = p.color;
          c.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        } else {
          c.fillStyle = p.color;
          c.shadowColor = p.color;
          c.shadowBlur = 9;
          c.beginPath();
          c.arc(0, 0, p.size * 0.55, 0, Math.PI * 2);
          c.fill();
        }
        c.restore();
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      off();
    };
  }, []);

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[70]" />;
}
