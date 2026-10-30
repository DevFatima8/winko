"use client";

import { BET_PRESETS } from "@/lib/betPresets";

export const CHIP_DENOMS = BET_PRESETS;

const CHIP_CLASSES: Record<number, string> = {
  50: "chip-5",
  100: "chip-100",
  200: "chip-25",
  500: "chip-500",
  1000: "chip-1 chip-light",
};

interface ChipProps {
  value: number;
  selected: boolean;
  disabled?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  onClick: () => void;
}

export default function Chip({ value, selected, disabled = false, size = "md", onClick }: ChipProps) {
  const sizeClass =
    size === "sm" ? "chip-sm" : size === "md" ? "chip-md" : size === "xl" ? "chip-xl" : "chip-lg";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`Select Rs. ${value} chip`}
      className={`chip ${CHIP_CLASSES[value] ?? "chip-100"} ${selected ? "chip-selected" : ""} ${sizeClass}`}
    >
      <span className="chip-inner">{value >= 1000 ? `${value / 1000}K` : value}</span>
    </button>
  );
}
