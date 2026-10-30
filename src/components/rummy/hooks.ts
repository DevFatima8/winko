"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ── Persistent state (localStorage, SSR-safe) ─────────────────

export function usePersistentState<T>(
  key: string,
  initial: T
): [T, (v: T | ((p: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) {
        const v = JSON.parse(raw) as T;
        if (v !== null && v !== undefined) return v;
      }
    } catch {
      /* corrupted value — fall back */
    }
    return initial;
  });

  const set = useCallback(
    (v: T | ((p: T) => T)) => {
      setState((prev) => {
        const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* storage unavailable */
        }
        return next;
      });
    },
    [key]
  );

  return [state, set];
}

// ── Tiny WebAudio synth for game feel ─────────────────────────

type ToneOpts = {
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  slideTo?: number;
};

export function useSound(muted: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);

  const ensure = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      try {
        ctxRef.current = new AC();
      } catch {
        return null;
      }
    }
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const tone = useCallback(
    (freq: number, dur: number, opts: ToneOpts = {}) => {
      if (muted) return;
      const ctx = ensure();
      if (!ctx) return;
      const t0 = ctx.currentTime + (opts.delay ?? 0);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = opts.type ?? "sine";
      o.frequency.setValueAtTime(freq, t0);
      if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
      const peak = opts.gain ?? 0.12;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.06);
    },
    [muted, ensure]
  );

  return useMemo(
    () => ({
      tap: () => tone(660, 0.06, { type: "triangle", gain: 0.08 }),
      unselect: () => tone(430, 0.05, { type: "triangle", gain: 0.05 }),
      place: () => {
        tone(310, 0.1, { type: "triangle", gain: 0.14 });
        tone(180, 0.16, { type: "sine", gain: 0.1, delay: 0.02 });
      },
      invalid: () => tone(160, 0.2, { type: "sawtooth", gain: 0.07, slideTo: 85 }),
      chip: () => tone(1250, 0.04, { type: "square", gain: 0.045 }),
      deal: () => {
        for (let i = 0; i < 13; i++) {
          tone(880 + Math.random() * 340, 0.035, {
            type: "triangle",
            gain: 0.04,
            delay: i * 0.045,
          });
        }
      },
      win: () => {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          tone(f, 0.22, { type: "triangle", gain: 0.14, delay: i * 0.09 })
        );
        tone(1318.5, 0.5, { type: "sine", gain: 0.1, delay: 0.38 });
      },
      lose: () => {
        tone(220, 0.25, { type: "sawtooth", gain: 0.06, slideTo: 110 });
        tone(110, 0.4, { type: "sine", gain: 0.1, delay: 0.12, slideTo: 55 });
      },
    }),
    [tone]
  );
}
