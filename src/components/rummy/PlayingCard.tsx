import type { CSSProperties } from "react";
import type { Card } from "./engine";
import { RANK_LABEL, SUIT_SYMBOL } from "./engine";

interface Props {
  card: Card;
  size?: "hand" | "slot";
  className?: string;
  style?: CSSProperties;
}

/** Pure presentational playing card face. */
export function PlayingCard({ card, size = "hand", className = "", style }: Props) {
  const red = card.suit === "H" || card.suit === "D";
  const tone = red ? "text-[#b23a2c]" : "text-[#2b2924]";
  const rankCls = size === "hand" ? "text-[13px] sm:text-[15px]" : "text-[10px]";
  const suitCls = size === "hand" ? "text-[11px] sm:text-[12px]" : "text-[8px]";
  const pipCls =
    size === "hand"
      ? "text-[30px] leading-none sm:text-[38px] md:text-[44px]"
      : "text-[15px] leading-none";

  return (
    <div
      style={style}
      className={`relative aspect-[5/7] select-none overflow-hidden rounded-[7px] border border-[#cfc3a0] bg-gradient-to-br from-[#fdfaf1] via-[#f9f3e3] to-[#ece1c4] shadow-[0_8px_18px_rgba(0,0,0,0.35),0_2px_3px_rgba(0,0,0,0.3)] ${className}`}
    >
      <div className={`absolute left-[9%] top-[5%] flex flex-col items-center leading-none ${tone}`}>
        <span className={`font-display font-bold ${rankCls}`}>{RANK_LABEL[card.rank]}</span>
        <span className={suitCls}>{SUIT_SYMBOL[card.suit]}</span>
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`${pipCls} ${tone}`}>{SUIT_SYMBOL[card.suit]}</span>
      </div>
      <div
        className={`absolute bottom-[5%] right-[9%] flex rotate-180 flex-col items-center leading-none ${tone}`}
      >
        <span className={`font-display font-bold ${rankCls}`}>{RANK_LABEL[card.rank]}</span>
        <span className={suitCls}>{SUIT_SYMBOL[card.suit]}</span>
      </div>
      {/* inner hairline */}
      <div className="pointer-events-none absolute inset-[5px] rounded-[5px] border border-[#d8cda9]/60" />
    </div>
  );
}
