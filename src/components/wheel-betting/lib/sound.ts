"use client";

/**
 * Tiny WebAudio based sound engine — no asset files needed.
 */

let ctx: AudioContext | null = null;
let enabled = true;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

export function setSoundEnabled(next: boolean) {
  enabled = next;
}

export function primeAudio() {
  const a = audio();
  if (a && a.state === "suspended") void a.resume();
}

type ToneOptions = {
  freq: number;
  duration?: number;
  type?: OscillatorType;
  gain?: number;
  at?: number;
  sweepTo?: number;
};

function tone({ freq, duration = 0.12, type = "triangle", gain = 0.08, at = 0, sweepTo }: ToneOptions) {
  if (!enabled) return;
  const a = audio();
  if (!a) return;
  const start = a.currentTime + at;
  const osc = a.createOscillator();
  const amp = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), start + duration);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp).connect(a.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export const sfx = {
  tick(speed = 1) {
    tone({
      freq: 900 + speed * 180,
      duration: 0.035,
      type: "square",
      gain: 0.035,
    });
  },
  start() {
    tone({ freq: 180, sweepTo: 620, duration: 0.35, type: "sawtooth", gain: 0.05 });
  },
  win(multiplier: number) {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    const count = multiplier >= 5 ? 5 : 4;
    for (let i = 0; i < count; i += 1) {
      tone({ freq: notes[i], duration: 0.28, type: "triangle", gain: 0.09, at: i * 0.09 });
    }
  },
  jackpot() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
    notes.forEach((n, i) => tone({ freq: n, duration: 0.4, type: "square", gain: 0.07, at: i * 0.08 }));
  },
  lose() {
    tone({ freq: 260, sweepTo: 90, duration: 0.45, type: "sawtooth", gain: 0.06 });
  },
  chip() {
    tone({ freq: 1400, duration: 0.05, type: "square", gain: 0.05 });
  },
  click() {
    tone({ freq: 700, duration: 0.04, type: "square", gain: 0.04 });
  },
};
