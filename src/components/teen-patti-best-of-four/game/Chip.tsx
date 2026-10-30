"use client";

import { motion } from "framer-motion";
import { BET_PRESETS } from "@/lib/betPresets";

export interface ChipDef {
  value: number;
  label: string;
  face: string;   // centre colour
  edge: string;   // stripe colour
  ink: string;    // text colour
}

const CHIP_STYLE: Record<number, Omit<ChipDef, "value" | "label">> = {
  50: { face: "#c9822b", edge: "#f7ead8", ink: "#fff5e6" },
  100: { face: "#2f6fb4", edge: "#dfe8f2", ink: "#eef4fb" },
  200: { face: "#0e8f9c", edge: "#dff3f5", ink: "#eafcfd" },
  500: { face: "#b03030", edge: "#f4e3e3", ink: "#fdecec" },
  1000: { face: "#2e8b57", edge: "#e6f4ec", ink: "#eafaf1" },
};

export const CHIPS: ChipDef[] = BET_PRESETS.map((value) => ({
  value,
  label: value >= 1000 ? `${value / 1000}K` : String(value),
  ...CHIP_STYLE[value],
}));

interface Props {
  def: ChipDef;
  disabled?: boolean;
  onClick?: (v: number) => void;
  size?: number;
  bare?: boolean;
}

export default function Chip({ def, disabled, onClick, size = 62, bare }: Props) {
  const body = (
    <div
      className="relative rounded-full shadow-[0_5px_12px_rgba(0,0,0,0.55)]"
      style={{
        width: size,
        height: size,
        background: `repeating-conic-gradient(from 0deg, ${def.edge} 0deg 14deg, ${def.face} 14deg 28deg)`,
      }}
    >
      <div
        className="absolute rounded-full"
        style={{
          inset: size * 0.16,
          background: `radial-gradient(circle at 34% 30%, ${def.face}, ${def.face})`,
          boxShadow: "inset 0 2px 5px rgba(255,255,255,0.35), inset 0 -3px 6px rgba(0,0,0,0.45)",
          border: `2px dashed ${def.edge}55`,
        }}
      />
      <span
        className="absolute inset-0 grid place-items-center font-extrabold"
        style={{ color: def.ink, fontSize: size * 0.26, textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
      >
        {def.label}
      </span>
    </div>
  );

  if (bare) return body;

  return (
    <motion.button
      type="button"
      onClick={() => onClick?.(def.value)}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -7, scale: 1.07 }}
      whileTap={disabled ? undefined : { scale: 0.92 }}
      className="rounded-full outline-none transition disabled:cursor-not-allowed disabled:opacity-35 disabled:saturate-50 focus-visible:ring-2 focus-visible:ring-amber-300"
      aria-label={`Bet chip Rs. ${def.value}`}
    >
      {body}
    </motion.button>
  );
}
