// ─── Tiny WebAudio SFX engine: no assets, all synthesized ───

let ctx: AudioContext | null = null;
let muted = false;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setMuted(m: boolean) {
  muted = m;
}
export function isMuted() {
  return muted;
}

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  delay?: number;
  slide?: number; // Hz change over the note duration
}

function tone(freq: number, dur: number, opts: ToneOpts = {}) {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const { type = "sine", vol = 0.2, delay = 0, slide = 0 } = opts;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function shimmer(dur: number, vol = 0.1, delay = 0) {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = vol;
  const f = c.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 3200;
  src.connect(f);
  f.connect(g);
  g.connect(c.destination);
  src.start(t0);
}

export const sfx = {
  /** Call from a user gesture to unlock the AudioContext. */
  unlock() {
    ac();
  },
  click() {
    tone(700, 0.06, { type: "square", vol: 0.1 });
    tone(1150, 0.05, { vol: 0.07, delay: 0.02 });
  },
  tick() {
    tone(190, 0.035, { type: "square", vol: 0.045 });
  },
  stop() {
    tone(120, 0.12, { type: "square", vol: 0.22, slide: -45 });
    tone(58, 0.16, { vol: 0.2 });
  },
  coin() {
    tone(1250, 0.09, { vol: 0.14 });
    tone(1650, 0.14, { vol: 0.11, delay: 0.06 });
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: "triangle", vol: 0.22, delay: i * 0.09 }));
    this.coin();
  },
  big() {
    [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) =>
      tone(f, 0.22, { type: "triangle", vol: 0.24, delay: i * 0.085 })
    );
    shimmer(0.6, 0.1, 0.3);
    for (let i = 0; i < 6; i++) tone(950 + Math.random() * 900, 0.1, { vol: 0.08, delay: 0.35 + i * 0.09 });
  },
  lose() {
    tone(210, 0.22, { type: "sawtooth", vol: 0.07, slide: -95 });
  },
};
