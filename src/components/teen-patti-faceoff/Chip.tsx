"use client";

import { cn } from "./lib/cn";
import { formatChips } from "./lib/teenpatti";
import { BET_PRESETS } from "@/lib/betPresets";

export const CHIP_VALUES = BET_PRESETS;

export const CHIP_COLORS: Record<number, string> = {
  50: "#15803d",
  100: "#1f2937",
  200: "#1d4ed8",
  500: "#b91c1c",
  1000: "#6d28d9",
  5000: "#b45309",
};

export function chipLabel(value: number): string {
  if (value >= 1000) return `${value / 1000}K`;
  return String(value);
}

interface ChipProps {
  value: number;
  active?: boolean;
  disabled?: boolean;
  size?: number;
  onClick?: () => void;
  className?: string;
  plain?: boolean;
}

export function Chip({ value, active, disabled, size = 56, onClick, className, plain }: ChipProps) {
  const color = CHIP_COLORS[value] ?? "#1f2937";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Select chip ${chipLabel(value)}`}
      className={cn(
        "tp-chip tp-no-select relative grid shrink-0 place-items-center rounded-full transition-all duration-150",
        !disabled && "hover:-translate-y-1 hover:brightness-110 active:translate-y-0",
        active && "-translate-y-1.5 ring-[3px] ring-amber-300 ring-offset-2 ring-offset-[#0a1016]",
        disabled && "cursor-not-allowed opacity-40",
        className,
      )}
      style={{ width: size, height: size, ["--chip" as string]: color }}
    >
      <span
        className="tp-chip-inner grid place-items-center rounded-full text-[11px] font-black text-white drop-shadow sm:text-xs"
        style={{ width: size * 0.66, height: size * 0.66, background: plain ? color : undefined }}
      >
        {chipLabel(value)}
      </span>
    </button>
  );
}

/** Small stacked chip used on the betting spots. */
export function BetChipStack({ amount, size = 34 }: { amount: number; size?: number }) {
  const layers = Math.min(4, Math.max(1, Math.ceil(amount / 250)));
  const color = CHIP_COLORS[5000] ?? "#b45309";
  return (
    <div className="tp-pop relative grid place-items-center" style={{ width: size, height: size }}>
      {Array.from({ length: layers }).map((_, index) => (
        <span
          key={index}
          className="tp-chip absolute rounded-full"
          style={{
            width: size,
            height: size,
            ["--chip" as string]: color,
            transform: `translateY(${-index * 3}px)`,
          }}
        />
      ))}
      <span
        className="tp-chip-inner absolute grid place-items-center rounded-full bg-amber-500 text-[10px] font-black text-black"
        style={{ width: size * 0.68, height: size * 0.68, transform: `translateY(${-(layers - 1) * 1.5}px)` }}
      >
        {formatChips(amount)}
      </span>
    </div>
  );
}
