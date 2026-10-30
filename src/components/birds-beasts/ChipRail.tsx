"use client";

import { formatShort } from "./lib/game-config";
import { BET_PRESETS } from "@/lib/betPresets";
import BetAmountInput from "@/components/BetAmountInput";

interface ChipRailProps {
  selected: number;
  locked: boolean;
  canUndo: boolean;
  canClear: boolean;
  canRebet: boolean;
  canDouble: boolean;
  onSelect: (value: number) => void;
  onUndo: () => void;
  onClear: () => void;
  onRebet: () => void;
  onDouble: () => void;
}

const CHIP_COLORS: Record<number, string> = {
  10: "#94a3b8",
  50: "#dc2626",
  100: "#2563eb",
  500: "#16a34a",
  200: "#0891b2",
  1000: "#7c3aed",
};

export default function ChipRail({
  selected,
  locked,
  canUndo,
  canClear,
  canRebet,
  canDouble,
  onSelect,
  onUndo,
  onClear,
  onRebet,
  onDouble,
}: ChipRailProps) {
  return (
    <div className="mt-1 sm:mt-1.5 flex flex-col gap-1 sm:gap-2">
      <div className="flex items-end justify-between gap-1 px-1 pt-1">
        {BET_PRESETS.map((value) => {
          const active = value === selected;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onSelect(value)}
              aria-pressed={active}
              className={`chip ${active ? "chip-selected" : ""}`}
              style={{ ["--c" as string]: CHIP_COLORS[value] }}
            >
              <span className="chip-label">{formatShort(value)}</span>
            </button>
          );
        })}
      </div>

      <div className="flex justify-center">
        <BetAmountInput value={selected} onChange={onSelect} disabled={locked} />
      </div>

      <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
        <ActionButton label="Undo" icon="↶" disabled={locked || !canUndo} onClick={onUndo} />
        <ActionButton label="Clear" icon="✕" disabled={locked || !canClear} onClick={onClear} tone="danger" />
        <ActionButton label="Rebet" icon="↻" disabled={locked || !canRebet} onClick={onRebet} tone="rebet" />
        <ActionButton label="Double" icon="x2" disabled={locked || !canDouble} onClick={onDouble} tone="gold" />
      </div>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  disabled,
  onClick,
  tone = "default",
}: {
  label: string;
  icon: string;
  disabled: boolean;
  onClick: () => void;
  tone?: "default" | "danger" | "rebet" | "gold";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`action-btn ${tone === "danger" ? "action-danger" : tone === "rebet" ? "action-rebet" : tone === "gold" ? "action-gold" : ""}`}
    >
      <span className="text-xs sm:text-sm font-black leading-none">{icon}</span>
      <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}
