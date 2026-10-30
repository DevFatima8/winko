"use client";

import { Card, RANK_LABEL, SUIT_SYMBOL, SUIT_IS_RED } from "./lib/muflis";

interface Props {
  card?: Card;
  faceUp: boolean;
  delay?: number;
  highlight?: boolean;
}

export default function PlayingCard({ card, faceUp, delay = 0, highlight }: Props) {
  return (
    <div
      className="animate-deal"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className={`relative h-24 w-16 sm:h-28 sm:w-20 rounded-lg select-none transition-transform duration-300 ${
          highlight ? "ring-2 ring-yellow-400 -translate-y-2" : ""
        }`}
      >
        {faceUp && card ? (
          <div
            className="card-face animate-flip h-full w-full rounded-lg bg-white shadow-[0_6px_14px_rgba(0,0,0,0.45)] flex flex-col justify-between p-1.5"
          >
            <div
              className={`text-left leading-none ${
                SUIT_IS_RED[card.suit] ? "text-red-600" : "text-slate-900"
              }`}
            >
              <div className="text-sm sm:text-base font-bold">{RANK_LABEL[card.rank]}</div>
              <div className="text-sm sm:text-base">{SUIT_SYMBOL[card.suit]}</div>
            </div>
            <div
              className={`text-center text-2xl sm:text-3xl font-bold ${
                SUIT_IS_RED[card.suit] ? "text-red-600" : "text-slate-900"
              }`}
            >
              {SUIT_SYMBOL[card.suit]}
            </div>
            <div
              className={`text-right leading-none rotate-180 ${
                SUIT_IS_RED[card.suit] ? "text-red-600" : "text-slate-900"
              }`}
            >
              <div className="text-sm sm:text-base font-bold">{RANK_LABEL[card.rank]}</div>
              <div className="text-sm sm:text-base">{SUIT_SYMBOL[card.suit]}</div>
            </div>
          </div>
        ) : (
          <div className="h-full w-full rounded-lg bg-gradient-to-br from-indigo-800 to-indigo-950 shadow-[0_6px_14px_rgba(0,0,0,0.45)] border border-indigo-400/30 flex items-center justify-center overflow-hidden">
            <div className="h-[85%] w-[85%] rounded-md border border-yellow-400/40 bg-[repeating-linear-gradient(45deg,rgba(244,197,66,0.15)_0px,rgba(244,197,66,0.15)_4px,transparent_4px,transparent_8px)] flex items-center justify-center">
              <span className="text-yellow-400/80 text-lg font-black tracking-tighter">M</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
