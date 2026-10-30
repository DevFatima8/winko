"use client";

import { motion } from "framer-motion";
import { Club, Diamond, Heart, Spade, Star } from "lucide-react";
import { RANK_LABELS, type PlayingCardData, type Suit } from "../lib/teen-patti";

const SUIT_ICON: Record<Suit, typeof Spade> = {
  spades: Spade,
  hearts: Heart,
  diamonds: Diamond,
  clubs: Club,
};

const SUIT_COLOR: Record<Suit, string> = {
  spades: "text-slate-900",
  clubs: "text-slate-900",
  hearts: "text-red-600",
  diamonds: "text-red-600",
};

interface Props {
  card: PlayingCardData;
  dealt: boolean;
  revealed: boolean;
  dealOrder: number; // 0..5 order in which card flies out of the deck
  flipOrder: number; // stagger of the reveal flip
  winnerDim?: boolean;
}

export function PlayingCard({ card, dealt, revealed, dealOrder, flipOrder, winnerDim }: Props) {
  const flyDelay = 0.12 + dealOrder * 0.16;
  const flipDelay = 0.15 + flipOrder * 0.16;
  const SuitIcon = card.suit ? SUIT_ICON[card.suit] : null;
  const suitColor = card.suit ? SUIT_COLOR[card.suit] : "";

  return (
    <motion.div
      className="relative h-[4.5rem] w-[3.25rem] min-[420px]:h-24 min-[420px]:w-[4.35rem] sm:h-28 sm:w-20 md:h-32 md:w-[5.5rem]"
      style={{ perspective: 900 }}
      initial={{ y: -260, x: dealOrder % 2 === 0 ? 40 : -40, rotate: -14, opacity: 0, scale: 0.7 }}
      animate={
        dealt
          ? { y: 0, x: 0, rotate: 0, opacity: 1, scale: 1 }
          : { y: -260, rotate: -14, opacity: 0, scale: 0.7 }
      }
      transition={{ delay: flyDelay, type: "spring", stiffness: 260, damping: 22 }}
    >
      <motion.div
        className="absolute inset-0 [transform-style:preserve-3d]"
        initial={{ rotateY: 0 }}
        animate={{ rotateY: revealed ? 180 : 0, opacity: winnerDim ? 0.55 : 1 }}
        transition={{
          rotateY: { delay: flipDelay, duration: 0.55, ease: [0.35, 0.1, 0.2, 1] },
          opacity: { duration: 0.5 },
        }}
      >
        {/* ── card back ── */}
        <div className="absolute inset-0 overflow-hidden rounded-lg border border-amber-200/60 shadow-[0_10px_24px_rgba(0,0,0,0.55)] [backface-visibility:hidden]">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,#7a1020,#3d0a18_55%,#7a1020)]" />
          <div
            className="absolute inset-[3px] rounded-md opacity-70"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg,rgba(245,196,81,0.22) 0 2px,transparent 2px 8px),repeating-linear-gradient(-45deg,rgba(245,196,81,0.22) 0 2px,transparent 2px 8px)",
            }}
          />
          <div className="absolute inset-[7px] grid place-items-center rounded-sm border border-amber-300/50">
            <span className="font-cinzel text-[10px] font-bold tracking-[0.2em] text-amber-300/90 md:text-xs">TPJ</span>
          </div>
        </div>

        {/* ── card front ── */}
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          {card.isJoker ? (
            <div className="absolute inset-0 overflow-hidden rounded-lg border border-amber-300/70 bg-[linear-gradient(160deg,#1b1038,#0c0618_60%,#2a1146)] shadow-[0_10px_24px_rgba(0,0,0,0.55)]">
              <div className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_50%_35%,rgba(245,196,81,0.7),transparent_60%)]" />
              <div className="absolute left-1 top-1 flex flex-col items-center text-amber-300">
                <Star className="h-2.5 w-2.5 md:h-3 md:w-3" fill="currentColor" />
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                <Star className="h-6 w-6 text-amber-300 drop-shadow-[0_0_10px_rgba(245,196,81,0.9)] md:h-8 md:w-8" fill="currentColor" />
                <span className="bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 bg-clip-text font-cinzel text-[9px] font-black tracking-[0.18em] text-transparent md:text-[11px]">
                  JOKER
                </span>
              </div>
              <div className="absolute bottom-1 right-1 rotate-180 text-amber-300">
                <Star className="h-2.5 w-2.5 md:h-3 md:w-3" fill="currentColor" />
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 overflow-hidden rounded-lg border border-slate-300/80 bg-[linear-gradient(155deg,#ffffff,#e9e6df_70%,#d9d4c7)] shadow-[0_10px_24px_rgba(0,0,0,0.55)]">
              {SuitIcon && (
                <>
                  <div className={`absolute left-1 top-1 flex flex-col items-center leading-none md:left-1.5 md:top-1.5 ${suitColor}`}>
                    <span className="text-[11px] font-extrabold md:text-sm">{RANK_LABELS[card.rank]}</span>
                    <SuitIcon className="mt-0.5 h-2.5 w-2.5 md:h-3 md:w-3" fill="currentColor" strokeWidth={1.5} />
                  </div>
                  <div className="absolute inset-0 grid place-items-center">
                    <div className={`flex flex-col items-center ${suitColor}`}>
                      {card.rank >= 11 ? (
                        <>
                          <span className="font-cinzel text-2xl font-black leading-none drop-shadow-sm md:text-4xl">
                            {RANK_LABELS[card.rank]}
                          </span>
                          <SuitIcon className="mt-1 h-4 w-4 opacity-90 md:h-5 md:w-5" fill="currentColor" strokeWidth={1.5} />
                        </>
                      ) : (
                        <>
                          <SuitIcon className="h-7 w-7 opacity-90 md:h-10 md:w-10" fill="currentColor" strokeWidth={1.2} />
                          <span className="mt-0.5 font-cinzel text-[10px] font-bold md:text-xs">{RANK_LABELS[card.rank]}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className={`absolute bottom-1 right-1 rotate-180 flex flex-col items-center leading-none md:bottom-1.5 md:right-1.5 ${suitColor}`}>
                    <span className="text-[11px] font-extrabold md:text-sm">{RANK_LABELS[card.rank]}</span>
                    <SuitIcon className="mt-0.5 h-2.5 w-2.5 md:h-3 md:w-3" fill="currentColor" strokeWidth={1.5} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Empty dashed slot shown before cards are dealt. */
export function CardGhost() {
  return (
    <div className="h-[4.5rem] w-[3.25rem] min-[420px]:h-24 min-[420px]:w-[4.35rem] rounded-lg border-2 border-dashed border-white/10 bg-black/10 sm:h-28 sm:w-20 md:h-32 md:w-[5.5rem]" />
  );
}
