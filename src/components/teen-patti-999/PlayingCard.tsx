"use client";

import type { Card } from "./lib/teenpatti";
import { RANK_LABEL, SUIT_SYMBOL } from "./lib/teenpatti";
import { cn } from "./lib/utils";

interface PlayingCardProps {
  card?: Card;
  faceDown?: boolean;
  flip?: boolean;
  size?: "sm" | "lg";
  delayMs?: number;
  highlight?: "win" | "lose" | null;
  onClick?: () => void;
}

const SIZE_CLASSES = {
  sm: "w-11 h-16 rounded-md text-[9px]",
  lg: "w-[4.4rem] h-[6.3rem] rounded-xl text-sm",
} as const;

export default function PlayingCard({
  card,
  faceDown = false,
  flip = false,
  size = "lg",
  delayMs = 0,
  highlight = null,
  onClick,
}: PlayingCardProps) {
  const red = !!card && (card.suit === "heart" || card.suit === "diamond");
  return (
    <div
      className={cn(
        "t999-card",
        SIZE_CLASSES[size],
        faceDown && "t999-card-back",
        flip && "t999-flip",
        highlight === "win" &&
          "ring-2 ring-amber-300 shadow-[0_0_20px_rgba(251,191,36,.85)]",
        highlight === "lose" && "opacity-50 grayscale",
        onClick && "cursor-pointer transition-transform active:scale-95"
      )}
      style={{ animationDelay: `${delayMs}ms` }}
      onClick={onClick}
    >
      {!faceDown && card && (
        <>
          <div
            className={cn(
              "absolute left-1.5 top-1 flex flex-col items-center font-black leading-none",
              red ? "text-rose-600" : "text-slate-900"
            )}
          >
            <span>{RANK_LABEL[card.rank]}</span>
            <span className="text-[0.75em]">{SUIT_SYMBOL[card.suit]}</span>
          </div>
          <div
            className={cn(
              "absolute inset-0 grid place-items-center font-black",
              size === "lg" ? "text-4xl" : "text-2xl",
              red ? "text-rose-500" : "text-slate-800"
            )}
          >
            {SUIT_SYMBOL[card.suit]}
          </div>
          <div
            className={cn(
              "absolute bottom-1 right-1.5 flex rotate-180 flex-col items-center font-black leading-none",
              red ? "text-rose-600" : "text-slate-900"
            )}
          >
            <span>{RANK_LABEL[card.rank]}</span>
            <span className="text-[0.75em]">{SUIT_SYMBOL[card.suit]}</span>
          </div>
        </>
      )}
      {faceDown && <div className="t999-card-back-inner">♠ ♥ ♦ ♣</div>}
    </div>
  );
}
