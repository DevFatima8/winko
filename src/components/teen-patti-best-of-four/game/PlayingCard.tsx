"use client";

import { Club, Diamond, Heart, Spade } from "lucide-react";
import { motion } from "framer-motion";
import type { PCard, Suit } from "../lib/teenpatti";
import { RANK_LABEL } from "../lib/teenpatti";

const SUIT_ICON = { S: Spade, H: Heart, D: Diamond, C: Club } as const;
const RED: Record<Suit, boolean> = { S: false, H: true, D: true, C: false };

export function SuitGlyph({ suit, className }: { suit: Suit; className?: string }) {
  const Icon = SUIT_ICON[suit];
  return <Icon className={className} fill="currentColor" strokeWidth={0} aria-hidden />;
}

interface Props {
  card: PCard | null;          // null → empty slot placeholder
  faceUp: boolean;
  flyDelay?: number;           // stagger when dealt from the deck
  lift?: boolean;              // part of the best hand → raised + glowing
  cut?: boolean;               // the unused 4th card
  dim?: boolean;
}

export default function PlayingCard({ card, faceUp, flyDelay = 0, lift, cut, dim }: Props) {
  if (!card) {
    return (
      <div className="tp-slot">
        <Spade className="h-5 w-5 text-amber-200/20" fill="currentColor" strokeWidth={0} />
      </div>
    );
  }

  const isRed = RED[card.suit];
  const ink = isRed ? "text-[#c01f2e]" : "text-[#182333]";
  const label = RANK_LABEL[card.rank];

  return (
    <motion.div
      className="relative"
      initial={{ x: 190, y: -300, rotate: 18, opacity: 0, scale: 0.8 }}
      animate={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 1 }}
      transition={{ delay: flyDelay, type: "spring", stiffness: 280, damping: 25, mass: 0.9 }}
    >
      <div
        className={[
          "transition-all duration-500",
          lift ? "-translate-y-2 tp-card-glow" : "",
          cut ? "translate-y-1 opacity-60 saturate-50" : "",
          dim ? "opacity-45 saturate-0" : "",
        ].join(" ")}
      >
        <div className="tp-card">
          <div className={`tp-card-inner ${faceUp ? "is-up" : ""}`}>
            {/* BACK */}
            <div className="tp-face tp-back-face">
              <div className="tp-back-pattern">
                <div className="tp-back-medal">
                  <Spade className="h-[28%] w-[28%] text-amber-300/90" fill="currentColor" strokeWidth={0} />
                </div>
              </div>
            </div>
            {/* FRONT */}
            <div className="tp-face tp-front-face">
              <div className={`tp-corner left-[7%] top-[5%] ${ink}`}>
                <span className="tp-rank">{label}</span>
                <SuitGlyph suit={card.suit} className="tp-corner-suit" />
              </div>
              <div className={`tp-center ${ink}`}>
                <SuitGlyph suit={card.suit} className="tp-center-suit" />
                <span className="tp-center-rank">{label}</span>
              </div>
              <div className={`tp-corner bottom-[5%] right-[7%] rotate-180 ${ink}`}>
                <span className="tp-rank">{label}</span>
                <SuitGlyph suit={card.suit} className="tp-corner-suit" />
              </div>
            </div>
          </div>
        </div>
      </div>
      {cut && (
        <div className="absolute inset-x-0 -bottom-2 flex justify-center">
          <span className="rounded-full bg-black/70 px-2 py-px text-[9px] font-bold uppercase tracking-[0.15em] text-amber-200/80 ring-1 ring-amber-200/30">
            cut
          </span>
        </div>
      )}
    </motion.div>
  );
}
