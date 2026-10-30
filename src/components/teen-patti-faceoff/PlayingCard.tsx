"use client";

import { cn } from "./lib/cn";
import { rankLabel, SUIT_IS_RED, SUIT_SYMBOL, type Card } from "./lib/teenpatti";

export type CardSize = "sm" | "md" | "lg";

const SIZES: Record<CardSize, string> = {
  sm: "w-[36px] h-[52px] sm:w-[50px] sm:h-[72px]",
  md: "w-[44px] h-[63px] sm:w-[66px] sm:h-[95px] lg:w-[78px] lg:h-[112px]",
  lg: "w-[46px] h-[66px] sm:w-[76px] sm:h-[109px] lg:w-[90px] lg:h-[130px]",
};

const CENTER_SIZES: Record<CardSize, string> = {
  sm: "text-[20px] sm:text-[26px]",
  md: "text-[24px] sm:text-[36px]",
  lg: "text-[24px] sm:text-[44px]",
};

interface PlayingCardProps {
  card?: Card | null;
  faceUp?: boolean;
  size?: CardSize;
  highlight?: boolean;
  dimmed?: boolean;
  dealDelay?: number;
  className?: string;
}

export function PlayingCard({
  card,
  faceUp = false,
  size = "md",
  highlight = false,
  dimmed = false,
  dealDelay = 0,
  className,
}: PlayingCardProps) {
  const red = card ? SUIT_IS_RED[card.suit] : false;

  return (
    <div
      className={cn("tp-perspective shrink-0 transition-opacity duration-300", SIZES[size], dimmed && "opacity-45", className)}
    >
      <div
        className={cn("tp-card-inner", faceUp && "tp-flipped")}
        style={{ transitionDelay: `${dealDelay}ms` }}
      >
        {/* back */}
        <div className="tp-card-face tp-card-back">
          <div className="absolute inset-[6px] rounded-[5px] border border-amber-200/30" />
          <div className="absolute inset-0 grid place-items-center">
            <span className="text-[10px] font-black tracking-[0.2em] text-amber-100/70 sm:text-xs">TP</span>
          </div>
        </div>
        {/* front */}
        <div
          className={cn(
            "tp-card-face tp-card-front",
            highlight && "ring-2 ring-amber-300 ring-offset-0",
          )}
        >
          {card ? (
            <div className={cn("flex h-full w-full flex-col justify-between p-[4px] sm:p-[6px]", red ? "text-rose-600" : "text-slate-900")}>
              <div className="flex flex-col items-center leading-none">
                <span className="text-[11px] font-black sm:text-[16px]">{rankLabel(card.rank)}</span>
                <span className="text-[9px] leading-none sm:text-[13px]">{SUIT_SYMBOL[card.suit]}</span>
              </div>
              <div className={cn("grid place-items-center", CENTER_SIZES[size])}>
                <span className="leading-none">{SUIT_SYMBOL[card.suit]}</span>
              </div>
              <div className="flex rotate-180 flex-col items-center leading-none">
                <span className="text-[11px] font-black sm:text-[16px]">{rankLabel(card.rank)}</span>
                <span className="text-[9px] leading-none sm:text-[13px]">{SUIT_SYMBOL[card.suit]}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CardSlot({ size = "md", className }: { size?: CardSize; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-white/10 bg-black/25 shadow-[inset_0_2px_10px_rgba(0,0,0,0.45)]",
        SIZES[size],
        className,
      )}
    />
  );
}
