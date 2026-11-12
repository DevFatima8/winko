"use client";

import { cn } from "./lib/cn";
import { formatChips, type BetSpotId, type SpotOutcome } from "./lib/teenpatti";
import { BetChipStack } from "./Chip";

export type SpotVariant = "A" | "B" | "tie" | "side" | "bonus";

const VARIANTS: Record<SpotVariant, { face: string; ring: string; text: string }> = {
  A: {
    face: "from-rose-900/85 via-rose-950/85 to-black/80 border-rose-400/40 text-rose-50",
    ring: "shadow-[inset_0_0_28px_rgba(244,63,94,0.35)]",
    text: "text-rose-100",
  },
  B: {
    face: "from-sky-900/85 via-sky-950/85 to-black/80 border-sky-400/40 text-sky-50",
    ring: "shadow-[inset_0_0_28px_rgba(56,189,248,0.35)]",
    text: "text-sky-100",
  },
  tie: {
    face: "from-emerald-900/85 via-emerald-950/85 to-black/80 border-emerald-400/40 text-emerald-50",
    ring: "shadow-[inset_0_0_28px_rgba(16,185,129,0.35)]",
    text: "text-emerald-100",
  },
  side: {
    face: "from-indigo-900/80 via-slate-950/85 to-black/80 border-indigo-400/35 text-indigo-50",
    ring: "shadow-[inset_0_0_22px_rgba(99,102,241,0.28)]",
    text: "text-indigo-100",
  },
  bonus: {
    face: "from-amber-900/75 via-yellow-950/80 to-black/80 border-amber-400/40 text-amber-50",
    ring: "shadow-[inset_0_0_22px_rgba(245,196,81,0.28)]",
    text: "text-amber-100",
  },
};

interface BetSpotProps {
  spot: BetSpotId;
  title: string;
  odds: string;
  subtitle?: string;
  variant: SpotVariant;
  amount: number;
  disabled?: boolean;
  outcome?: SpotOutcome | null;
  compact?: boolean;
  onSelect: (spot: BetSpotId) => void;
}

export function BetSpot({
  spot,
  title,
  odds,
  subtitle,
  variant,
  amount,
  disabled,
  outcome,
  compact,
  onSelect,
}: BetSpotProps) {
  const style = VARIANTS[variant];
  const won = outcome?.status === "win" && (outcome.stake ?? 0) > 0;
  const lost = outcome?.status === "lose" && (outcome.stake ?? 0) > 0;
  const pushed = outcome?.status === "push" && (outcome.stake ?? 0) > 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(spot)}
      disabled={disabled}
      className={cn(
        "tp-no-select group relative flex flex-col items-center justify-center overflow-hidden rounded-xl border bg-gradient-to-b px-2 py-2 transition-all duration-200 sm:rounded-2xl sm:px-3 sm:py-3",
        style.face,
        style.ring,
        compact ? "min-h-[62px] sm:min-h-[70px]" : "min-h-[76px] sm:min-h-[96px]",
        !disabled && "hover:-translate-y-0.5 hover:brightness-115 active:translate-y-0",
        disabled && "cursor-not-allowed",
        won && "tp-glow-pulse border-amber-300",
        lost && "opacity-55 grayscale-[0.35]",
        pushed && "border-slate-300/60",
      )}
    >
      <span className="relative z-10 text-center text-[10px] font-bold uppercase leading-tight tracking-[0.14em] sm:text-[12px]">
        {title}
      </span>
      {subtitle ? (
        <span className="relative z-10 mt-0.5 text-center text-[8px] uppercase tracking-[0.18em] text-white/45 sm:text-[9px]">
          {subtitle}
        </span>
      ) : null}
      <span
        className={cn(
          "relative z-10 mt-1 rounded-full border border-white/20 bg-black/45 px-2 py-[1px] text-[9px] font-bold sm:text-[11px]",
          style.text,
        )}
      >
        {odds}
      </span>

      {amount > 0 ? (
        <span className="absolute inset-0 z-20 grid place-items-center">
          <BetChipStack amount={amount} size={compact ? 32 : 40} />
        </span>
      ) : null}

      {won && outcome ? (
        <span className="tp-pop absolute right-1 top-1 z-30 rounded-md bg-amber-400 px-1.5 py-[1px] text-[9px] font-black text-black shadow sm:text-[10px]">
          +{formatChips(outcome.profit)}
        </span>
      ) : null}
      {pushed ? (
        <span className="tp-pop absolute right-1 top-1 z-30 rounded-md bg-slate-300 px-1.5 py-[1px] text-[9px] font-black text-black sm:text-[10px]">
          PUSH
        </span>
      ) : null}
      {lost ? (
        <span className="tp-pop absolute right-1 top-1 z-30 rounded-md bg-rose-600/90 px-1.5 py-[1px] text-[9px] font-black text-white sm:text-[10px]">
          {""}
        </span>
      ) : null}
    </button>
  );
}
