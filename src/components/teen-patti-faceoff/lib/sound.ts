"use client";

/**
 * Tiny WebAudio synth so the game has real casino sound effects
 * without shipping any audio assets.
 */

type Tone = {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  sweepTo?: number;
};

const LIBRARY: Record<string, Tone[]> = {
  chip: [{ freq: 880, duration: 0.07, type: "triangle", gain: 0.16, sweepTo: 1500 }],
  click: [{ freq: 420, duration: 0.05, type: "square", gain: 0.07 }],
  card: [{ freq: 200, duration: 0.09, type: "sawtooth", gain: 0.06, sweepTo: 90 }],
  flip: [{ freq: 620, duration: 0.06, type: "sine", gain: 0.1, sweepTo: 1100 }],
  tick: [{ freq: 1200, duration: 0.03, type: "sine", gain: 0.06 }],
  tickUrgent: [
    { freq: 1700, duration: 0.08, type: "square", gain: 0.1 },
    { freq: 950, duration: 0.08, type: "triangle", gain: 0.06, delay: 0.02 },
  ],
  push: [
    { freq: 520, duration: 0.12, type: "sine", gain: 0.12 },
    { freq: 520, duration: 0.12, type: "sine", gain: 0.1, delay: 0.16 },
  ],
  lose: [
    { freq: 320, duration: 0.16, type: "sawtooth", gain: 0.1 },
    { freq: 220, duration: 0.28, type: "sawtooth", gain: 0.1, delay: 0.14 },
  ],
  win: [
    { freq: 523, duration: 0.12, type: "triangle", gain: 0.14 },
    { freq: 659, duration: 0.12, type: "triangle", gain: 0.14, delay: 0.1 },
    { freq: 784, duration: 0.22, type: "triangle", gain: 0.15, delay: 0.2 },
  ],
  bigwin: [
    { freq: 523, duration: 0.12, type: "triangle", gain: 0.16 },
    { freq: 659, duration: 0.12, type: "triangle", gain: 0.16, delay: 0.09 },
    { freq: 784, duration: 0.12, type: "triangle", gain: 0.16, delay: 0.18 },
    { freq: 1046, duration: 0.3, type: "triangle", gain: 0.18, delay: 0.27 },
    { freq: 1318, duration: 0.4, type: "triangle", gain: 0.14, delay: 0.4 },
  ],
};

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  isMuted() {
    return this.muted;
  }

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (this.ctx) return this.ctx;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    return this.ctx;
  }

  unlock() {
    const ctx = this.ensure();
    if (ctx && ctx.state === "suspended") void ctx.resume();
  }

  play(name: keyof typeof LIBRARY) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const tones = LIBRARY[name];
    if (!tones) return;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + (tone.delay ?? 0);
      osc.type = tone.type ?? "sine";
      osc.frequency.setValueAtTime(tone.freq, start);
      if (tone.sweepTo) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(30, tone.sweepTo), start + tone.duration);
      }
      const peak = tone.gain ?? 0.12;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + tone.duration + 0.02);
    }
  }
}

export const sound = new SoundEngine();
