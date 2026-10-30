"use client";

import type { Card } from "./lib/baccarat";

export function PlayingCard({
  card,
  faceDown = false,
  delay = 0,
}: {
  card?: Card;
  faceDown?: boolean;
  delay?: number;
}) {
  const isRed = card?.suit === "♥" || card?.suit === "♦";

  return (
    <div
      className="baccarat-card-enter"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className={`relative flex h-24 w-16 select-none flex-col justify-between rounded-lg border shadow-lg sm:h-28 sm:w-20 ${
          faceDown || !card
            ? "border-yellow-700/40 bg-gradient-to-br from-rose-800 to-rose-950"
            : "border-slate-300 bg-white"
        }`}
      >
        {faceDown || !card ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="h-16 w-9 rounded border border-yellow-500/40 bg-[repeating-linear-gradient(45deg,rgba(234,179,8,0.25)_0,rgba(234,179,8,0.25)_4px,transparent_4px,transparent_8px)] sm:h-20 sm:w-12" />
          </div>
        ) : (
          <>
            <div
              className={`px-1.5 pt-1 text-left text-base font-bold leading-none sm:text-lg ${
                isRed ? "text-rose-600" : "text-slate-900"
              }`}
            >
              {card.rank}
              <div className="text-sm sm:text-base">{card.suit}</div>
            </div>
            <div
              className={`text-center text-2xl font-bold sm:text-3xl ${
                isRed ? "text-rose-600" : "text-slate-900"
              }`}
            >
              {card.suit}
            </div>
            <div
              className={`rotate-180 px-1.5 pb-1 text-left text-base font-bold leading-none sm:text-lg ${
                isRed ? "text-rose-600" : "text-slate-900"
              }`}
            >
              {card.rank}
              <div className="text-sm sm:text-base">{card.suit}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
