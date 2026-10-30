"use client";

import { useEffect, useMemo, useState } from "react";

import { formatMoney } from "./lib/wheel";

const COLORS = ["#ffd76e", "#00e5a0", "#8b6bff", "#ff6b8b", "#ffffff"];

export default function WinOverlay({
  open,
  payout,
  multiplier,
  bet,
}: {
  open: boolean;
  payout: number;
  multiplier: number;
  bet: number;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShow(true);
    const t = window.setTimeout(() => setShow(false), 2600);
    return () => window.clearTimeout(t);
  }, [open]);

  const particles = useMemo(
    () =>
      Array.from({ length: open ? 46 : 0 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.9,
        duration: 1.5 + Math.random() * 1.3,
        size: 5 + Math.random() * 9,
        color: COLORS[i % COLORS.length],
        rot: Math.random() * 360,
      })),
    [open],
  );

  if (!open && !show) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      {particles.map((p) => (
        <span
          key={p.id}
          className="confetti absolute top-0 block rounded-[2px]"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.7,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}

      <div className="absolute inset-0 grid place-items-center">
        <div className="win-pop text-center">
          <div className="rounded-full bg-black/40 px-4 py-1 text-[0.6rem] font-black uppercase tracking-[0.28em] text-amber-200 backdrop-blur">
            {multiplier >= 5 ? "Jackpot" : "You won"}
          </div>
          <div
            className="mt-1 bg-gradient-to-b from-white via-amber-200 to-amber-500 bg-clip-text text-[clamp(2.4rem,7vw,4.5rem)] font-black leading-none text-transparent drop-shadow-[0_6px_24px_rgba(255,190,80,0.45)]"
            style={{ fontFamily: "var(--font-num)" }}
          >
            {multiplier}×
          </div>
          <div
            className="text-[clamp(1rem,3vw,1.8rem)] font-black text-emerald-300"
            style={{ fontFamily: "var(--font-num)" }}
          >
            +{formatMoney(payout)}
          </div>
          <div
            className="mt-1 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-slate-400"
            style={{ fontFamily: "var(--font-num)" }}
          >
            bet {formatMoney(bet)}
          </div>
        </div>
      </div>
    </div>
  );
}
