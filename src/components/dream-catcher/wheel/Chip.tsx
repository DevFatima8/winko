"use client";

import { CHIP_STYLE } from "../game/config";

export function Chip({
  value,
  size = 56,
  selected = false,
  dimmed = false,
}: {
  value: number;
  size?: number;
  selected?: boolean;
  dimmed?: boolean;
}) {
  const style = CHIP_STYLE[value] ?? CHIP_STYLE[1];
  const r = size / 2;
  const edges = Array.from({ length: 8 }, (_, i) => i * 45);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`drop-shadow-[0_6px_10px_rgba(0,0,0,0.55)] transition-transform duration-150 ${
        selected ? "scale-110" : ""
      } ${dimmed ? "opacity-40 grayscale" : ""}`}
      aria-hidden
    >
      <circle cx={r} cy={r} r={r - 1} fill={style.bg} stroke="rgba(0,0,0,0.35)" strokeWidth={1} />
      <g fill={style.ring} opacity={0.95}>
        {edges.map((deg) => (
          <rect
            key={deg}
            x={r - size * 0.055}
            y={1}
            width={size * 0.11}
            height={size * 0.16}
            rx={size * 0.02}
            transform={`rotate(${deg} ${r} ${r})`}
          />
        ))}
      </g>
      <circle cx={r} cy={r} r={r * 0.72} fill="none" stroke={style.ring} strokeWidth={size * 0.035} strokeDasharray={`${size * 0.09} ${size * 0.06}`} opacity={0.8} />
      <circle cx={r} cy={r} r={r * 0.58} fill={style.bg} stroke="rgba(0,0,0,0.25)" strokeWidth={1} />
      <text
        x={r}
        y={r}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size * (value >= 100 ? 0.26 : 0.32)}
        fontWeight={900}
        fill={style.text}
        style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
      >
        {value}
      </text>
      <ellipse cx={r} cy={r * 0.55} rx={r * 0.62} ry={r * 0.3} fill="rgba(255,255,255,0.18)" />
    </svg>
  );
}

export function ChipStack({ amount, size = 26 }: { amount: number; size?: number }) {
  if (amount <= 0) return null;
  const layers = Math.min(5, 1 + Math.floor(Math.log10(Math.max(1, amount))));
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-1 flex flex-col items-center">
      <div className="relative" style={{ height: size + layers * 3 }}>
        {Array.from({ length: layers }, (_, i) => (
          <div
            key={i}
            className="chip-pop absolute left-1/2 -translate-x-1/2"
            style={{ bottom: i * 3, animationDelay: `${i * 25}ms` }}
          >
            <Chip value={amount} size={size} />
          </div>
        ))}
      </div>
      <span className="mt-0.5 rounded-full bg-black/75 px-2 py-[1px] text-[11px] font-extrbold text-amber-200 tabular-nums ring-1 ring-amber-300/40">
        {amount.toLocaleString("en-US")}
      </span>
    </div>
  );
}
