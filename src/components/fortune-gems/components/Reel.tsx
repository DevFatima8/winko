'use client';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface Props<T> {
  target: T[]; // 3 items top -> bottom
  spinKey: number;
  index: number; // stop order
  turbo: boolean;
  winRows: number[];
  cellW: string;
  cellH: string;
  randomItem: () => T;
  render: (item: T, highlighted: boolean) => ReactNode;
  onStop: (index: number) => void;
}

export function Reel<T>({ target, spinKey, index, turbo, winRows, cellW, cellH, randomItem, render, onStop }: Props<T>) {
  const [strip, setStrip] = useState<T[]>(target);
  const [spinning, setSpinning] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const current = useRef<T[]>(target);
  const pending = useRef<{ dur: number; delay: number; final: T[]; len: number } | null>(null);
  const lastKey = useRef(spinKey);

  useEffect(() => {
    if (spinKey === lastKey.current) return;
    lastKey.current = spinKey;
    const fillers = (turbo ? 6 : 12) + index * (turbo ? 2 : 5);
    const mid = Array.from({ length: fillers }, () => randomItem());
    const newStrip = [...target, ...mid, ...current.current];
    pending.current = {
      dur: turbo ? 380 + index * 130 : 900 + index * 380,
      delay: turbo ? 0 : index * 60,
      final: target,
      len: newStrip.length,
    };
    setSpinning(true);
    setStrip(newStrip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey]);

  useLayoutEffect(() => {
    const p = pending.current;
    const el = stripRef.current;
    if (!p || !el) return;
    pending.current = null;
    const startPct = ((p.len - 3) / p.len) * 100;
    const anim = el.animate(
      [
        { transform: `translateY(-${startPct}%)`, easing: 'cubic-bezier(.25,.55,.3,1)' },
        { transform: `translateY(calc(${cellH} * 0.14))`, offset: 0.9, easing: 'ease-in-out' },
        { transform: 'translateY(0)' },
      ],
      { duration: p.dur, delay: p.delay, fill: 'both' }
    );
    anim.onfinish = () => {
      current.current = p.final;
      anim.cancel();
      setStrip(p.final);
      setSpinning(false);
      onStop(index);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strip]);

  return (
    <div className="relative overflow-hidden" style={{ width: cellW, height: `calc(${cellH} * 3)` }}>
      <div ref={stripRef} className="will-change-transform" style={{ filter: spinning ? 'blur(1.6px)' : 'none' }}>
        {strip.map((s, i) => {
          const hi = !spinning && i < 3 && winRows.includes(i);
          return (
            <div key={i} className="flex items-center justify-center" style={{ width: cellW, height: cellH }}>
              {render(s, hi)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
