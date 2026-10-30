import { useState } from "react";
import { SYMBOLS, type SymbolId } from "../game/config";
import { cn } from "../lib/cn";

interface Props {
  id: SymbolId;
  spinning?: boolean;
  dim?: boolean;
  win?: boolean;
  scatterWin?: boolean;
}

const CARD_STYLE: Record<string, { glyph: string; sub: string; icon?: string }> = {
  wild: { glyph: "貂", sub: "WILD", icon: "🌸" },
  lubu: { glyph: "布", sub: "LU BU", icon: "👑" },
  dong: { glyph: "卓", sub: "DONG", icon: "⚔️" },
  soldier: { glyph: "兵", sub: "GUARD", icon: "🛡️" },
  rings: { glyph: "玉", sub: "JADE", icon: "💍" },
  lotus: { glyph: "蓮", sub: "LOTUS", icon: "🪷" },
  scatter: { glyph: "令", sub: "BONUS", icon: "⭐" },
  A: { glyph: "A", sub: "甲" },
  K: { glyph: "K", sub: "王" },
  Q: { glyph: "Q", sub: "后" },
  J: { glyph: "J", sub: "將" },
  T: { glyph: "10", sub: "十" },
  N: { glyph: "9", sub: "九" },
};

export default function SlotSymbol({ id, spinning, dim, win, scatterWin }: Props) {
  const meta = SYMBOLS[id];
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className={cn(
        "relative flex h-full w-full items-center justify-center transition-all duration-200",
        dim && "opacity-25 grayscale-[0.6]",
        spinning && "slot-flicker",
        win && "slot-win-pop",
      )}
    >
      {meta.img && !imgError ? (
        <div className={cn("relative h-[92%] w-[92%]", win && "slot-win-glow")}>
          <img
            src={meta.img}
            alt={meta.name}
            draggable={false}
            onError={() => setImgError(true)}
            className={cn(
              "h-full w-full rounded-lg object-cover",
              id === "scatter" ? "rounded-full" : "rounded-lg",
              scatterWin && "slot-scatter-glow",
            )}
          />
          {id === "wild" && (
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-sm bg-gradient-to-b from-[#ffdf8e] via-[#c9922e] to-[#8a5a00] px-1.5 py-px text-[8px] font-black tracking-[0.18em] text-[#3d0a0a] shadow-[0_1px_4px_rgba(0,0,0,0.7)]">
              WILD
            </div>
          )}
          {id === "scatter" && (
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-gradient-to-b from-[#ffd2ec] via-[#c33d9e] to-[#6d0f52] px-1.5 py-px text-[7px] font-black tracking-[0.14em] text-white shadow-[0_1px_4px_rgba(0,0,0,0.7)]">
              SCATTER
            </div>
          )}
        </div>
      ) : (
        <div
          className={cn(
            "flex h-[86%] w-[86%] flex-col items-center justify-center rounded-2xl",
            id === "wild"
              ? "bg-[radial-gradient(circle_at_35%_30%,#8b1538,#3a0614_75%)] border-2 border-[#ffdf8e]"
              : id === "scatter"
              ? "bg-[radial-gradient(circle_at_35%_30%,#6d0f52,#200418_75%)] border-2 border-[#ff8ecb]"
              : id === "lubu" || id === "dong"
              ? "bg-[radial-gradient(circle_at_35%_30%,#7a3512,#2b1006_75%)] border-2 border-[#f5c445]"
              : "bg-[radial-gradient(circle_at_35%_30%,#7a1620,#2b060b_75%)] border-2 border-[#d9a441]",
            "shadow-[inset_0_2px_6px_rgba(0,0,0,0.8),0_2px_8px_rgba(0,0,0,0.6)]",
            win && "slot-win-glow",
          )}
        >
          {CARD_STYLE[id]?.icon && (
            <span className="text-base leading-none mb-0.5">{CARD_STYLE[id]?.icon}</span>
          )}
          <span
            className={cn(
              "font-display font-black leading-none text-transparent",
              "bg-gradient-to-b from-[#fff3c4] via-[#f5c445] to-[#9c6207] bg-clip-text",
              "drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)]",
              (CARD_STYLE[id]?.glyph.length ?? 0) > 1 ? "text-lg" : "text-xl",
            )}
          >
            {CARD_STYLE[id]?.glyph ?? id}
          </span>
          <span className="text-[7.5px] font-black tracking-wider leading-none text-[#e8b64c]/90 mt-0.5 uppercase">
            {CARD_STYLE[id]?.sub}
          </span>
        </div>
      )}
    </div>
  );
}
