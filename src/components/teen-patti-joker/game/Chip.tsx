"use client";

import { motion } from "framer-motion";
import { betLabel } from "../lib/teen-patti";

const CHIP_THEME: Record<number, { base: string; dark: string; text: string; glow: string }> = {
  10: { base: "#2563eb", dark: "#0e2a66", text: "#dbeafe", glow: "rgba(59,130,246,0.55)" },
  25: { base: "#059669", dark: "#053d2a", text: "#d1fae5", glow: "rgba(16,185,129,0.55)" },
  200: { base: "#0891b2", dark: "#083344", text: "#cffafe", glow: "rgba(34,211,238,0.55)" },
  50: { base: "#dc2626", dark: "#5c0d0d", text: "#fee2e2", glow: "rgba(239,68,68,0.55)" },
  100: { base: "#1f2937", dark: "#030712", text: "#e5e7eb", glow: "rgba(148,163,184,0.5)" },
  500: { base: "#7c3aed", dark: "#2e1065", text: "#ede9fe", glow: "rgba(167,139,250,0.55)" },
  1000: { base: "#d4a017", dark: "#5f430a", text: "#fff7d6", glow: "rgba(245,196,81,0.6)" },
};

interface ChipProps {
  value: number;
  size?: number;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

export function Chip({ value, size = 58, selected, onClick, disabled }: ChipProps) {
  const theme = CHIP_THEME[value] ?? CHIP_THEME[100];
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.88 }}
      whileHover={disabled ? undefined : { y: -6 }}
      animate={{ y: selected ? -10 : 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      className="relative shrink-0 cursor-pointer rounded-full disabled:cursor-not-allowed disabled:opacity-40"
      style={{ width: size, height: size, filter: selected ? `drop-shadow(0 0 14px ${theme.glow}) drop-shadow(0 10px 12px rgba(0,0,0,0.5))` : "drop-shadow(0 8px 10px rgba(0,0,0,0.45))" }}
    >
      {selected && (
        <motion.span
          layoutId="chip-pointer"
          className="absolute -top-3.5 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[6px] border-t-8 border-x-transparent border-t-amber-300"
        />
      )}
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: `repeating-conic-gradient(${theme.base} 0deg 30deg, #f5f1e6 30deg 45deg), ${theme.base}`,
        }}
      />
      <span
        className="absolute rounded-full"
        style={{
          inset: size * 0.14,
          background: `radial-gradient(circle at 34% 30%, ${theme.base}, ${theme.dark} 78%)`,
          boxShadow: `inset 0 2px 5px rgba(255,255,255,0.35), inset 0 -3px 6px rgba(0,0,0,0.5)`,
        }}
      />
      <span
        className="absolute grid place-items-center rounded-full font-cinzel font-bold leading-none"
        style={{
          inset: size * 0.27,
          background: "radial-gradient(circle at 40% 35%, #fffdf4, #ddd5bd)",
          color: theme.dark,
          fontSize: value >= 1000 ? size * 0.2 : size * 0.24,
          boxShadow: "inset 0 1px 3px rgba(0,0,0,0.4)",
        }}
      >
        {betLabel(value)}
      </span>
    </motion.button>
  );
}

/** Small static chip used inside bet stacks. */
export function MiniChip({ value, offset }: { value: number; offset: number }) {
  const theme = CHIP_THEME[value] ?? CHIP_THEME[100];
  const size = 34;
  return (
    <motion.span
      initial={{ y: -24, opacity: 0, scale: 0.5 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      className="absolute rounded-full"
      style={{
        width: size,
        height: size,
        bottom: offset * 6,
        left: `calc(50% - ${size / 2}px + ${(offset % 2 === 0 ? -1 : 1) * Math.min(offset, 3) * 2}px)`,
        background: `repeating-conic-gradient(${theme.base} 0deg 30deg, #f5f1e6 30deg 45deg)`,
        boxShadow: "0 4px 8px rgba(0,0,0,0.5)",
      }}
    >
      <span
        className="absolute grid place-items-center rounded-full font-cinzel text-[9px] font-bold"
        style={{
          inset: size * 0.26,
          background: `radial-gradient(circle at 40% 35%, ${theme.base}, ${theme.dark} 80%)`,
          color: theme.text,
          boxShadow: "inset 0 1px 2px rgba(255,255,255,0.35)",
        }}
      >
        {betLabel(value)}
      </span>
    </motion.span>
  );
}
