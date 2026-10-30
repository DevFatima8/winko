"use client";

/** Tiny WebAudio helper — no assets, all synthesised. */

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(value: boolean) {
  muted = value;
}

export function isMuted() {
  return muted;
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (muted) return null;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

type ToneOptions = {
  freq: number;
  duration?: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  sweepTo?: number;
};

function tone({
  freq,
  duration = 0.08,
  type = "sine",
  gain = 0.06,
  delay = 0,
  sweepTo,
}: ToneOptions) {
  const audio = getCtx();
  if (!audio) return;
  const start = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const vol = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, start + duration);
  vol.gain.setValueAtTime(0.0001, start);
  vol.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  vol.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(vol).connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export const sfx = {
  click: () => tone({ freq: 320, duration: 0.05, type: "triangle", gain: 0.035 }),
  select: () => tone({ freq: 620, duration: 0.05, type: "triangle", gain: 0.04 }),
  ball: (index: number) =>
    tone({
      freq: 420 + index * 26,
      duration: 0.07,
      type: "square",
      gain: 0.022,
    }),
  hit: () =>
    tone({ freq: 880, duration: 0.1, type: "triangle", gain: 0.05, sweepTo: 1320 }),
  win: () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) =>
      tone({ freq, duration: 0.18, type: "triangle", gain: 0.05, delay: i * 0.075 }),
    );
  },
  lose: () =>
    tone({ freq: 240, duration: 0.16, type: "sawtooth", gain: 0.025, sweepTo: 130 }),
  jackpot: () => {
    [659.25, 783.99, 987.77, 1318.5, 1567.98].forEach((freq, i) =>
      tone({ freq, duration: 0.22, type: "triangle", gain: 0.055, delay: i * 0.08 }),
    );
  },
};
