"use client";

import { useEffect, useRef, useState } from "react";

export type CardPreviewFrame<T> = { at: number; view: T };

/** Presentation-only rounds. No server, wallet or player-outcome calls belong here. */
export function useIdleCardRound<T>({
  idle, finished, busy = false, paused = false, frames, next, bettingMs = 10000, reviewMs = 3000,
}: {
  idle: boolean;
  finished: boolean;
  busy?: boolean;
  paused?: boolean;
  frames: () => CardPreviewFrame<T>[];
  next: () => void;
  bettingMs?: number;
  reviewMs?: number;
}) {
  const [preview, setPreview] = useState<T | null>(null);
  const [countdown, setCountdown] = useState<number | null>(Math.ceil(bettingMs / 1000));
  const [cycle, setCycle] = useState(0);
  const latest = useRef({ frames, next });
  const watching = useRef(false);
  const claimed = useRef(false);
  const generation = useRef<{ active: boolean } | null>(null);

  useEffect(() => {
    latest.current = { frames, next };
  }, [frames, next]);

  useEffect(() => {
    const token = { active: true };
    generation.current = token;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, fn: () => void) => {
      timers.push(setTimeout(() => {
        if (token.active) fn();
      }, ms));
    };
    if (!idle) {
      watching.current = false;
      claimed.current = false;
      later(0, () => { setPreview(null); setCountdown(null); });
    } else if (!busy && !paused && !claimed.current) {
      later(0, () => setCountdown(Math.ceil(bettingMs / 1000)));
      for (let second = 1; second * 1000 < bettingMs; second++) {
        later(second * 1000, () => setCountdown(Math.ceil(bettingMs / 1000) - second));
      }
      later(bettingMs, () => {
        if (claimed.current) return;
        setCountdown(null);
        const sequence = latest.current.frames();
        if (!sequence.length) return;
        watching.current = true;
        setPreview(sequence[0].view);
        for (const frame of sequence) later(frame.at, () => setPreview(frame.view));
        later(Math.max(...sequence.map(frame => frame.at)) + reviewMs, () => {
          watching.current = false;
          setPreview(null);
          setCycle(value => value + 1);
        });
      });
    }
    if (finished && !busy) later(reviewMs, () => latest.current.next());
    return () => {
      token.active = false;
      timers.forEach(clearTimeout);
    };
  }, [idle, finished, busy, paused, bettingMs, reviewMs, cycle]);

  return {
    countdown: idle && !busy && !paused && preview === null ? countdown : null,
    preview: idle ? preview : null,
    watching: idle && preview !== null,
    claim: () => {
      if (!idle || busy || watching.current || claimed.current) return false;
      claimed.current = true;
      setCountdown(null);
      // Invalidate all spectator timers synchronously, before accepting a wager.
      if (generation.current) generation.current.active = false;
      return true;
    },
    release: () => {
      claimed.current = false;
      setCycle(value => value + 1);
    },
  };
}
