"use client";

import { motion } from "framer-motion";
import { MiniChip } from "./Chip";
import { formatChips, type Zone } from "../lib/teen-patti";

export type ZoneState = "idle" | "win" | "lose" | "push";

interface BetZoneProps {
  zone: Zone;
  title: string;
  payout: string;
  accent: "blue" | "gold" | "red";
  bet: number;
  stack: number[]; // chip denominations placed here (visual only)
  state: ZoneState;
  locked: boolean;
  onPlace: () => void;
}

const ACCENTS = {
  blue: {
    ring: "border-sky-400/50",
    text: "text-sky-300",
    glowWin: "0 0 0 2px rgba(56,189,248,0.8), 0 0 46px rgba(56,189,248,0.55)",
    bg: "from-sky-500/10",
  },
  gold: {
    ring: "border-amber-300/50",
    text: "text-amber-300",
    glowWin: "0 0 0 2px rgba(245,196,81,0.9), 0 0 46px rgba(245,196,81,0.55)",
    bg: "from-amber-400/10",
  },
  red: {
    ring: "border-rose-400/50",
    text: "text-rose-300",
    glowWin: "0 0 0 2px rgba(251,113,133,0.8), 0 0 46px rgba(251,113,133,0.55)",
    bg: "from-rose-500/10",
  },
} as const;

export function BetZone({ title, payout, accent, bet, stack, state, locked, onPlace }: BetZoneProps) {
  const a = ACCENTS[accent];

  return (
    <motion.button
      type="button"
      onClick={onPlace}
      disabled={locked}
      whileTap={locked ? undefined : { scale: 0.96 }}
      animate={
        state === "win"
          ? { boxShadow: a.glowWin, scale: [1, 1.04, 1] }
          : state === "lose"
            ? { opacity: 0.45, filter: "saturate(0.3)" }
            : { boxShadow: "0 0 0 0 rgba(0,0,0,0)", opacity: 1, filter: "saturate(1)" }
      }
      transition={{ duration: 0.5 }}
      className={`group relative flex h-24 w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 bg-gradient-to-b md:h-28 ${a.ring} ${a.bg} to-black/30 backdrop-blur-[2px] transition-colors ${
        locked ? "cursor-default" : "hover:bg-white/5"
      }`}
    >
      {/* chip stack */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 top-0">
        {stack.slice(0, 7).map((v, i) => (
          <MiniChip key={`${v}-${i}`} value={v} offset={i} />
        ))}
        {bet > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full border border-amber-200/70 bg-black/80 px-2.5 py-0.5 font-cinzel text-[11px] font-bold text-amber-200 shadow-lg md:text-xs"
          >
            Rs. {formatChips(bet)}
          </motion.div>
        )}
      </div>

      <div className={`pointer-events-none relative z-10 mt-auto pb-2 text-center ${bet > 0 ? "opacity-0" : "opacity-100"} transition-opacity`}>
        <div className={`font-cinzel text-sm font-black tracking-[0.25em] md:text-base ${a.text}`}>{title}</div>
        <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.28em] text-white/45 md:text-[10px]">{payout}</div>
      </div>

      {state === "win" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.6, 1] }}
          transition={{ duration: 0.8 }}
          className="pointer-events-none absolute inset-0 rounded-2xl bg-white/10"
        />
      )}
    </motion.button>
  );
}
