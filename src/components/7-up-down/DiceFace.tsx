"use client";

import type { ReactNode } from "react";

type DiceProps = {
  value: number;
  rolling?: boolean;
  size?: number;
};

// Renders a casino-style dice face using SVG.
// Values 1..6 map to standard pip layouts.
export default function DiceFace({ value, rolling = false, size = 88 }: DiceProps) {
  const v = ((value - 1) % 6) + 1;
  const pip = (x: number, y: number): ReactNode => (
    <circle key={`${x}-${y}`} cx={x} cy={y} r={size * 0.075} fill="#dc2626" />
  );

  // pip positions (in 100x100 viewbox coords)
  const layout: Record<number, ReactNode[]> = {
    1: [pip(50, 50)],
    2: [pip(30, 30), pip(70, 70)],
    3: [pip(30, 30), pip(50, 50), pip(70, 70)],
    4: [pip(30, 30), pip(70, 30), pip(30, 70), pip(70, 70)],
    5: [pip(30, 30), pip(70, 30), pip(50, 50), pip(30, 70), pip(70, 70)],
    6: [pip(30, 28), pip(70, 28), pip(30, 50), pip(70, 50), pip(30, 72), pip(70, 72)],
  };

  return (
    <div
      className={`relative rounded-2xl bg-white shadow-[0_8px_24px_rgba(0,0,0,0.55)] border border-slate-200 ${rolling ? "dice-rolling" : ""}`}
      style={{ width: size, height: size }}
      aria-label={`Dice showing ${v}`}
    >
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <defs>
          <radialGradient id={`grad-${v}`} cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#e5e7eb" />
          </radialGradient>
        </defs>
        <rect x={3} y={3} width={94} height={94} rx={16} ry={16} fill={`url(#grad-${v})`} stroke="#cbd5e1" strokeWidth={1.5} />
        {layout[v]}
      </svg>
    </div>
  );
}
