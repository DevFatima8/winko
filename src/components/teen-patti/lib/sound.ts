// Tiny WebAudio sound-effects engine — no audio files required.
// All sounds are synthesized with oscillators and only play after user
// gestures, so browser autoplay policies are respected.

let ctx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function getMuted(): boolean {
  return muted;
}

function tone(
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.08,
  slideTo?: number,
): void {
  if (muted) return;
  try {
    const c = getCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    const t0 = c.currentTime + start;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  } catch {
    // Audio is best-effort only.
  }
}

export const sfx = {
  click: () => tone(620, 0, 0.06, "triangle", 0.05),
  chip: () => {
    tone(880, 0, 0.05, "sine", 0.06);
    tone(1320, 0.03, 0.06, "sine", 0.05);
  },
  deal: () => {
    tone(240, 0, 0.07, "sine", 0.05);
    tone(190, 0.06, 0.08, "sine", 0.05);
    tone(160, 0.13, 0.09, "sine", 0.05);
  },
  flip: () => tone(520, 0, 0.08, "square", 0.03),
  win: () => {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
      tone(f, i * 0.09, 0.28, "triangle", 0.09),
    );
  },
  lose: () => {
    tone(220, 0, 0.14, "sawtooth", 0.045, 110);
    tone(110, 0.13, 0.35, "sawtooth", 0.045, 55);
  },
  coin: () => tone(1568, 0, 0.09, "sine", 0.05, 2093),
};
