/**
 * Tiny WebAudio synth for table sounds — no audio files, no dependencies.
 * Everything is generated on the fly and only starts after a user gesture.
 */

type Ctx = AudioContext & { _unlocked?: boolean };

let ctx: Ctx | null = null;
let master: GainNode | null = null;
let muted = false;
let armed = false;

/** Browsers only allow audio after a gesture — stay silent until one happens. */
function arm() {
  armed = true;
  if (typeof window !== "undefined") {
    window.removeEventListener("pointerdown", arm);
    window.removeEventListener("keydown", arm);
  }
}
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", arm, { once: true, passive: true });
  window.addEventListener("keydown", arm, { once: true });
}

function ensure(): Ctx | null {
  if (typeof window === "undefined" || !armed) return null;
  const AC: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC() as Ctx;
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  dur: number,
  opts: { type?: OscillatorType; gain?: number; delay?: number; slideTo?: number; sweep?: number } = {},
) {
  if (muted) return;
  const ac = ensure();
  if (!ac || !master) return;
  const t0 = ac.currentTime + (opts.delay ?? 0);
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + dur);
  const peak = opts.gain ?? 0.2;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.03, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, opts: { gain?: number; delay?: number; hp?: number; lp?: number } = {}) {
  if (muted) return;
  const ac = ensure();
  if (!ac || !master) return;
  const t0 = ac.currentTime + (opts.delay ?? 0);
  const frames = Math.floor(ac.sampleRate * dur);
  const buffer = ac.createBuffer(1, Math.max(1, frames), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = opts.hp ?? 800;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = opts.lp ?? 9000;
  const g = ac.createGain();
  g.gain.setValueAtTime(opts.gain ?? 0.18, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(hp).connect(lp).connect(g).connect(master);
  src.start(t0);
}

export const sound = {
  unlock() {
    armed = true;
    ensure();
  },
  setMuted(value: boolean) {
    muted = value;
  },
  isMuted() {
    return muted;
  },
  tick() {
    tone(1180, 0.05, { type: "square", gain: 0.05 });
  },
  chip() {
    noise(0.08, { gain: 0.16, hp: 2400, lp: 11000 });
    tone(760, 0.05, { type: "triangle", gain: 0.05 });
  },
  deny() {
    tone(180, 0.14, { type: "sawtooth", gain: 0.12, slideTo: 110 });
  },
  card(i = 0) {
    noise(0.13, { gain: 0.14, delay: i * 0.02, hp: 1400, lp: 8000 });
  },
  lock() {
    tone(420, 0.16, { type: "sawtooth", gain: 0.12 });
    tone(300, 0.22, { type: "square", gain: 0.08, delay: 0.11 });
  },
  shuffle() {
    for (let i = 0; i < 10; i++) noise(0.07, { gain: 0.07, delay: i * 0.045, hp: 2000, lp: 9000 });
  },
  win() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => tone(f, 0.42, { type: "triangle", gain: 0.16, delay: i * 0.075 }));
    tone(261.63, 0.9, { type: "sine", gain: 0.1, delay: 0.1 });
  },
  bigWin() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98, 2093];
    notes.forEach((f, i) => tone(f, 0.55, { type: "triangle", gain: 0.17, delay: i * 0.07 }));
    for (let i = 0; i < 14; i++) noise(0.05, { gain: 0.05, delay: 0.15 + i * 0.03, hp: 4000, lp: 14000 });
  },
  lose() {
    tone(196, 0.36, { type: "sine", gain: 0.16, slideTo: 96 });
    noise(0.2, { gain: 0.09, hp: 200, lp: 1200 });
  },
  push() {
    tone(440, 0.18, { type: "sine", gain: 0.1 });
    tone(440, 0.18, { type: "sine", gain: 0.08, delay: 0.16 });
  },
  flip() {
    tone(880, 0.08, { type: "triangle", gain: 0.07 });
  },
};
