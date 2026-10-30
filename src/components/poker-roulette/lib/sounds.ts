// Tiny WebAudio sound effects — no assets needed.

"use client";

let audioCtx: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = "sine", volume = 0.06) {
  const ctx = context();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + start;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  } catch {
    /* ignore */
  }
}

export const sfx = {
  chip() {
    tone(950, 0, 0.07, "square", 0.04);
    tone(1400, 0.05, 0.06, "square", 0.028);
  },
  flip() {
    tone(520, 0, 0.05, "triangle", 0.045);
  },
  click() {
    tone(700, 0, 0.04, "square", 0.028);
  },
  win() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.16, "sine", 0.07));
  },
  bigWin() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) =>
      tone(f, i * 0.08, 0.2, "triangle", 0.075),
    );
  },
  lose() {
    tone(196, 0, 0.2, "sawtooth", 0.035);
    tone(147, 0.12, 0.28, "sawtooth", 0.035);
  },
};
