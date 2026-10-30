"use client";

import { useMemo } from "react";

const CONFETTI_COLORS = ["#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#a855f7", "#facc15", "#fb7185"];

interface ConfettiProps {
  show: boolean;
}

export default function Confetti({ show }: ConfettiProps) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.35,
        duration: 1.7 + Math.random() * 1.3,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 6 + Math.random() * 7,
        drift: (Math.random() - 0.5) * 240,
      })),
    [],
  );

  if (!show) return null;

  return (
    <div className="confetti-layer" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 0.55,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              "--drift": `${p.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
