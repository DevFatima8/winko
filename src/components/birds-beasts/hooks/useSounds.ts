"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

/**
 * Tiny synthesized sound effects via the Web Audio API (no audio files needed).
 * All player functions are stable references (safe to call inside timers).
 */
export function useSounds() {
  const ctxRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("bb_muted");
      if (saved === "1") {
        mutedRef.current = true;
        setMuted(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const api = useMemo(() => {
    const getCtx = (): AudioContext | null => {
      if (typeof window === "undefined") return null;
      if (!ctxRef.current) {
        const AC = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
        if (!AC) return null;
        try {
          ctxRef.current = new AC();
        } catch {
          return null;
        }
      }
      if (ctxRef.current.state === "suspended") {
        ctxRef.current.resume().catch(() => {});
      }
      return ctxRef.current;
    };

    const tone = (
      freq: number,
      duration: number,
      type: OscillatorType = "sine",
      gain = 0.12,
      delay = 0,
      slideTo?: number,
    ) => {
      if (mutedRef.current) return;
      const ctx = getCtx();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const t0 = ctx.currentTime + delay;
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + duration + 0.05);
      } catch {
        /* ignore audio errors */
      }
    };

    return {
      /** Call on first user gesture so the browser allows audio */
      unlock: () => {
        getCtx();
      },
      setMuted: (value: boolean) => {
        mutedRef.current = value;
        setMuted(value);
        try {
          window.localStorage.setItem("bb_muted", value ? "1" : "0");
        } catch {
          /* ignore */
        }
      },
      isMuted: () => mutedRef.current,
      tick: () => tone(1450, 0.045, "square", 0.035),
      chip: () => {
        tone(520, 0.05, "triangle", 0.1);
        tone(1040, 0.07, "triangle", 0.09, 0.035);
      },
      click: () => tone(700, 0.04, "triangle", 0.06),
      countdown: () => tone(880, 0.1, "sine", 0.1),
      timesUp: () => {
        tone(660, 0.18, "sawtooth", 0.07);
        tone(440, 0.28, "sawtooth", 0.07, 0.16);
      },
      stop: () => tone(300, 0.25, "square", 0.08, 0, 120),
      win: () => {
        [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, "triangle", 0.12, i * 0.1));
        tone(1319, 0.5, "triangle", 0.12, 0.42);
      },
      bigWin: () => {
        [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.25, "triangle", 0.13, i * 0.09));
        [0.6, 0.75, 0.9].forEach((d) => tone(2093, 0.28, "sine", 0.1, d));
      },
      lose: () => {
        tone(240, 0.28, "sine", 0.1);
        tone(170, 0.45, "sine", 0.1, 0.24);
      },
      error: () => tone(180, 0.14, "square", 0.05),
    };
  }, []);

  return { ...api, muted };
}

export type Sounds = ReturnType<typeof useSounds>;
