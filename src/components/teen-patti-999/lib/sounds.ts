// Tiny WebAudio sound-effects helper (no audio assets needed).

let ctx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setMuted(m: boolean): void {
  muted = m;
}

export function isMuted(): boolean {
  return muted;
}

function tone(
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType = "sine",
  vol = 0.08
): void {
  const ac = getCtx();
  if (!ac || muted) return;
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

export const sfx = {
  click: () => tone(880, 0, 0.06, "square", 0.03),
  deal: () => {
    tone(220, 0, 0.09, "triangle", 0.05);
    tone(330, 0.03, 0.09, "triangle", 0.05);
  },
  flip: () => {
    tone(520, 0, 0.08, "sine", 0.05);
    tone(780, 0.04, 0.1, "sine", 0.05);
  },
  chip: () => {
    tone(1320, 0, 0.05, "sine", 0.06);
    tone(1760, 0.03, 0.07, "sine", 0.05);
  },
  pop: () => {
    tone(660, 0, 0.05, "sine", 0.05);
    tone(990, 0.05, 0.08, "sine", 0.06);
  },
  win: () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(f, i * 0.09, 0.22, "triangle", 0.09)
    );
  },
  lose: () => {
    [392, 311.13, 261.63, 196].forEach((f, i) =>
      tone(f, i * 0.1, 0.2, "sawtooth", 0.05)
    );
  },
};
