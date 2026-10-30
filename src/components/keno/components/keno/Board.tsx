"use client";

import { cn } from "@/lib/cn";
import { POOL_SIZE } from "@/lib/keno";

type Props = {
  selected: number[];
  drawn: number[];
  revealIndex: number; // how many balls have been revealed
  locked: boolean;
  onToggle: (tile: number) => void;
};

export default function Board({
  selected,
  drawn,
  revealIndex,
  locked,
  onToggle,
}: Props) {
  const revealed = drawn.slice(0, revealIndex);
  const tiles = Array.from({ length: POOL_SIZE }, (_, i) => i + 1);

  return (
    <div className="grid w-full max-w-[560px] grid-cols-8 gap-1.5 sm:gap-2">
      {tiles.map((tile) => {
        const isSelected = selected.includes(tile);
        const isDrawn = revealed.includes(tile);
        const isHit = isDrawn && isSelected;

        return (
          <button
            key={tile}
            type="button"
            disabled={locked}
            onClick={() => onToggle(tile)}
            className={cn(
              "keno-grid-tile keno-tile relative flex aspect-square items-center justify-center rounded-[6px] text-[13px] font-bold tabular-nums sm:text-base",
              isDrawn && "keno-ball-in",
              isHit
                ? "keno-hit-pulse z-10 bg-[#ffcd3c] text-[#05212d] ring-2 ring-white"
                : isDrawn
                  ? "bg-[#b1c2cf] text-[#0f212e]"
                  : isSelected
                    ? "bg-[#00e701] text-[#05212d]"
                    : "bg-[#2f4553] text-white hover:bg-[#3c566a]",
              locked && !isDrawn && "cursor-default",
            )}
          >
            {tile}
          </button>
        );
      })}
    </div>
  );
}
