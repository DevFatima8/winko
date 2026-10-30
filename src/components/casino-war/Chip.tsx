"use client";

import { BET_PRESETS } from "@/lib/betPresets";

export const CHIPS = BET_PRESETS;

const CHIP_COLOR: Record<number, string> = {
  50: "#d62b3a",
  100: "#1c1c22",
  200: "#2b6fd6",
  500: "#7a2bd6",
  1000: "#e08a12",
};

export function chipLabel(v: number) {
  return v >= 1000 ? `${v / 1000}K` : String(v);
}

export function Chip({
  value,
  size = 64,
  selected = false,
  onClick,
  className = "",
}: {
  value: number;
  size?: number;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const bg = CHIP_COLOR[value] ?? "#444";
  return (
    <div
      role={onClick ? "button" : undefined}
      onClick={onClick}
      className={`chip ${onClick ? "chip-btn" : ""} ${selected ? "chip-selected" : ""} ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.3,
        background: `radial-gradient(circle at 35% 30%, ${bg} 0%, ${bg} 55%, rgba(0,0,0,0.55) 130%)`,
      }}
    >
      <span>{chipLabel(value)}</span>
    </div>
  );
}

export function breakdown(amount: number): number[] {
  const out: number[] = [];
  let rest = amount;
  for (const v of [...CHIPS].reverse()) {
    while (rest >= v) {
      out.push(v);
      rest -= v;
    }
  }
  if (out.length === 0 && amount > 0) out.push(CHIPS[0]);
  return out;
}

export function ChipStack({ amount, size = 52 }: { amount: number; size?: number }) {
  if (amount <= 0) return null;
  const chips = breakdown(amount).reverse().slice(-7);
  return (
    <div className="relative flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size + (chips.length - 1) * 5 }}>
        {chips.map((v, i) => (
          <div key={i} className="chip-drop absolute left-0" style={{ bottom: i * 5 }}>
            <Chip value={v} size={size} />
          </div>
        ))}
      </div>
    </div>
  );
}
