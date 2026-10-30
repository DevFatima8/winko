"use client";

import { useRef, type ReactNode } from "react";

export function HotSlider({ hot, rest, onPhase, onEnd }: {
  hot: ReactNode[];
  rest: ReactNode[];
  onPhase: (inRest: boolean) => void;
  onEnd?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const restRef = useRef<HTMLDivElement>(null);
  const last = useRef(false);
  const onScroll = () => {
    const box = ref.current, first = restRef.current;
    if (!box) return;
    const inRest = hot.length === 0 || Boolean(first && first.getBoundingClientRect().left <= box.getBoundingClientRect().left + 2);
    if (inRest !== last.current) { last.current = inRest; onPhase(inRest); }
    if (box.scrollWidth - box.scrollLeft - box.clientWidth < box.clientWidth) onEnd?.();
  };
  return (
    <div className="min-w-0 space-y-2">
      <div ref={ref} onScroll={onScroll} role="region" aria-label="Slide through provider games" tabIndex={0}
        className="relative grid snap-x snap-proximity auto-cols-[calc((100%-1rem)/3)] grid-flow-col grid-rows-2 gap-x-2 gap-y-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:auto-cols-[calc((100%-1.5rem)/4)] md:auto-cols-[calc((100%-3rem)/5)] md:gap-x-3 lg:auto-cols-[calc((100%-3.75rem)/6)] xl:auto-cols-[calc((100%-5.25rem)/8)]">
        {hot}
        {rest.map((node, index) => index === 0 ? <div key="first" ref={restRef} className="snap-start">{node}</div> : node)}
      </div>
      <div className="flex justify-end gap-2">
        {([-1, 1] as const).map(direction => (
          <button key={direction} type="button" aria-label={direction < 0 ? "Previous games" : "Next games"} onClick={() => {
            const box = ref.current;
            if (!box) return;
            const gap = Number.parseFloat(getComputedStyle(box).columnGap) || 0;
            box.scrollBy({ left: direction * (box.clientWidth + gap), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
          }} className="flex h-8 w-10 items-center justify-center rounded-full border border-[#8b5cf6]/40 bg-[#8b5cf6]/20 text-lg text-[#c4b5fd]">
            {direction < 0 ? "\u2039" : "\u203a"}
          </button>
        ))}
      </div>
    </div>
  );
}
