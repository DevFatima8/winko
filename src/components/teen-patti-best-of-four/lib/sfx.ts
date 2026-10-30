// Tiny WebAudio synth for casino SFX — no audio files needed.

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean) {
  enabled = v;
}

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

interface ToneOpts {
  delay?: number;
  dur?: number;
  type?: OscillatorType;
  vol?: number;
  slideTo?: number;
}

function tone(freq: number, o: ToneOpts = {}) {
  if (!enabled) return;
  const a = ac();
  if (!a) return;
  const t = a.currentTime + (o.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t);
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + (o.dur ?? 0.1));
  const dur = o.dur ?? 0.1;
  const vol = o.vol ?? 0.08;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function whoosh(o: { delay?: number; dur?: number; from?: number; to?: number; vol?: number } = {}) {
  if (!enabled) return;
  const a = ac();
  if (!a) return;
  const dur = o.dur ?? 0.16;
  const t = a.currentTime + (o.delay ?? 0);
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const bp = a.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(o.from ?? 500, t);
  bp.frequency.exponentialRampToValueAtTime(o.to ?? 2600, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(o.vol ?? 0.16, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(a.destination);
  src.start(t);
}

export const sfx = {
  click() {
    tone(1150, { dur: 0.05, type: "square", vol: 0.045 });
  },
  chip() {
    tone(1500, { dur: 0.045, type: "square", vol: 0.05 });
    tone(2100, { delay: 0.035, dur: 0.05, type: "square", vol: 0.04 });
  },
  deal(i: number) {
    whoosh({ delay: i * 0.09, dur: 0.15, from: 600, to: 2400, vol: 0.13 });
  },
  flip(i = 0) {
    tone(1900, { delay: i * 0.08, dur: 0.05, type: "triangle", vol: 0.07 });
  },
  badge() {
    tone(880, { dur: 0.09, type: "triangle", vol: 0.08 });
    tone(1174.66, { delay: 0.07, dur: 0.12, type: "triangle", vol: 0.08 });
  },
  win() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(f, { delay: i * 0.09, dur: 0.22, type: "triangle", vol: 0.12 })
    );
    tone(1318.51, { delay: 0.38, dur: 0.42, type: "triangle", vol: 0.11 });
    whoosh({ delay: 0.1, dur: 0.5, from: 1200, to: 5000, vol: 0.05 });
  },
  lose() {
    [233.08, 196, 155.56].forEach((f, i) =>
      tone(f, { delay: i * 0.13, dur: 0.24, type: "sawtooth", vol: 0.07 })
    );
  },
};
