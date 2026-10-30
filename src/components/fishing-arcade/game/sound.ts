// Tiny synthesized sound effects (WebAudio) – no audio files needed.

let ctx: AudioContext | null = null;
let enabled = true;

export function initAudio() {
  if (typeof window === "undefined") return;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
}

export function setSoundEnabled(v: boolean) {
  enabled = v;
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType = "sine",
  vol = 0.15,
  slideTo?: number,
  delay = 0,
) {
  if (!ctx || !enabled) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol = 0.1, delay = 0, freq = 1800) {
  if (!ctx || !enabled) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t0);
}

export const sfx = {
  shoot() {
    tone(520, 0.14, "square", 0.06, 140);
    noise(0.09, 0.07, 0, 2600);
  },
  net() {
    noise(0.22, 0.07, 0, 900);
    tone(220, 0.15, "sine", 0.05, 120);
  },
  hit() {
    tone(180, 0.1, "triangle", 0.08, 90);
  },
  win(mult: number) {
    const base = 660;
    const steps = mult >= 6 ? 5 : 3;
    for (let i = 0; i < steps; i++) {
      tone(base * Math.pow(1.2599, i), 0.16, "triangle", 0.12, undefined, i * 0.07);
    }
    noise(0.3, 0.06, 0, 1200);
  },
  coin() {
    tone(1318, 0.07, "square", 0.04);
    tone(1760, 0.12, "square", 0.04, undefined, 0.06);
  },
  bigWin() {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((n, i) => tone(n, 0.22, "triangle", 0.15, undefined, i * 0.11));
    tone(130, 0.9, "sawtooth", 0.08, 65);
  },
  click() {
    tone(900, 0.05, "square", 0.05);
  },
  error() {
    tone(160, 0.18, "sawtooth", 0.08, 90);
  },
};
