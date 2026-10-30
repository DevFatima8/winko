"use client";

import type { CSSProperties } from "react";
import type { Card } from "./lib/war";

const SUIT_SYMBOL: Record<Card["suit"], string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

export function rankLabel(rank: number) {
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  if (rank === 14) return "A";
  return String(rank);
}

const SIZE = "w-[72px] h-[104px] sm:w-[98px] sm:h-[140px]";

export function PlayingCard({ card, revealed }: { card: Card; revealed: boolean }) {
  const red = card.suit === "H" || card.suit === "D";
  const color = red ? "text-red-600" : "text-slate-900";
  const label = rankLabel(card.rank);
  const symbol = SUIT_SYMBOL[card.suit];

  return (
    <div className={`card-scene deal-in ${SIZE}`}>
      <div className={`card-inner ${revealed ? "" : "is-back"}`}>
        <div className={`card-face card-front ${color}`}>
          <div className="absolute left-1.5 top-1 flex flex-col items-center leading-none font-bold">
            <span className="text-lg sm:text-2xl">{label}</span>
            <span className="text-base sm:text-xl">{symbol}</span>
          </div>
          <div className="absolute inset-0 flex items-center justify-center text-5xl sm:text-7xl">
            {symbol}
          </div>
          <div className="absolute bottom-1 right-1.5 flex rotate-180 flex-col items-center leading-none font-bold">
            <span className="text-lg sm:text-2xl">{label}</span>
            <span className="text-base sm:text-xl">{symbol}</span>
          </div>
        </div>
        <div className="card-face card-back" />
      </div>
    </div>
  );
}

export function CardBack({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`card-scene ${SIZE} ${className}`} style={style}>
      <div className="card-inner is-back">
        <div className="card-face card-front" />
        <div className="card-face card-back" />
      </div>
    </div>
  );
}

export function BurnPile() {
  return (
    <div className="relative h-[104px] w-[72px] sm:h-[140px] sm:w-[98px]">
      {[0, 1, 2].map((i) => (
        <CardBack
          key={i}
          className="deal-in absolute"
          style={{
            left: i * 7,
            top: i * 3,
            transform: `rotate(${(i - 1) * 4}deg)`,
            animationDelay: `${i * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}

export function EmptySlot() {
  return (
    <div
      className={`${SIZE} rounded-[10px] border-2 border-dashed border-yellow-300/30 bg-black/10`}
    />
  );
}
