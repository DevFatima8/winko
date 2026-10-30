import { useEffect, useRef } from "react";

type P = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; color: string; life: number };

const GOLD = ["#ffe9a8", "#e7c877", "#c99a34", "#fff6d0", "#8ff0b6"];
const RED = ["#ff5a5f", "#d8202f", "#7a1017", "#ffb1b1"];

/** Lightweight canvas particle burst — fires whenever `trigger` changes to a new value. */
export default function Confetti({ trigger, tone }: { trigger: number; tone: "gold" | "red" }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const parts = useRef<P[]>([]);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (!trigger) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, rect.width * dpr);
    canvas.height = Math.max(1, rect.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const palette = tone === "gold" ? GOLD : RED;
    const count = tone === "gold" ? 150 : 46;
    const cx = rect.width / 2;
    const cy = rect.height * 0.42;

    parts.current = Array.from({ length: count }, () => {
      const a = Math.random() * Math.PI * 2;
      const sp = tone === "gold" ? 3 + Math.random() * 9 : 1.5 + Math.random() * 4;
      return {
        x: cx + (Math.random() - 0.5) * rect.width * 0.4,
        y: cy + (Math.random() - 0.5) * 60,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (tone === "gold" ? 4.5 : 1.5),
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        size: tone === "gold" ? 3 + Math.random() * 6 : 2 + Math.random() * 3,
        color: palette[Math.floor(Math.random() * palette.length)],
        life: 1,
      };
    });

    let frame = 0;
    const loop = () => {
      ctx.clearRect(0, 0, rect.width, rect.height);
      frame += 1;
      let alive = 0;
      for (const p of parts.current) {
        if (p.life <= 0) continue;
        alive += 1;
        p.vy += 0.24;
        p.vx *= 0.992;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (frame > 40) p.life -= 0.014;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      if (alive > 0 && frame < 260) raf.current = requestAnimationFrame(loop);
      else ctx.clearRect(0, 0, rect.width, rect.height);
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [trigger, tone]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-40 h-full w-full" />;
}
