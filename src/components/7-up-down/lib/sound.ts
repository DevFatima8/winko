"use client";

// Lightweight Web Audio sound effects — no external assets.
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq: number, duration: number, type: OscillatorType = "sine", volume = 0.18, delay = 0) {
  const c = getCtx();
  if (!c) return;
  const start = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

export const sfx = {
  chip: () => tone(880, 0.08, "triangle", 0.18),
  roll: () => {
    const c = getCtx();
    if (!c) return;
    // Dice clatter — short bursts of noise
    for (let i = 0; i < 7; i++) {
      const noiseDur = 0.04;
      const start = c.currentTime + i * 0.07;
      const buffer = c.createBuffer(1, c.sampleRate * noiseDur, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let j = 0; j < data.length; j++) data[j] = (Math.random() * 2 - 1) * 0.5;
      const src = c.createBufferSource();
      src.buffer = buffer;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + noiseDur);
      src.connect(gain).connect(c.destination);
      src.start(start);
    }
  },
  win: () => {
    tone(660, 0.15, "triangle", 0.2, 0);
    tone(880, 0.18, "triangle", 0.22, 0.12);
    tone(1320, 0.25, "triangle", 0.22, 0.24);
  },
  lose: () => {
    tone(220, 0.18, "sawtooth", 0.18, 0);
    tone(165, 0.25, "sawtooth", 0.16, 0.12);
  },
  tick: () => tone(1200, 0.04, "square", 0.08),
  bigWin: () => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, "triangle", 0.22, i * 0.08));
  },
};
