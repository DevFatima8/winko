let ctx: AudioContext | null = null;

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
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}

function tone(
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.12,
  endFreq?: number,
) {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) {
    osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + duration);
  }
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function unlockAudio() {
  getCtx();
}

export function playClick() {
  tone(660, 0, 0.06, "triangle", 0.08);
}

export function playFlip(totalMs: number) {
  const total = totalMs / 1000;
  const ticks = 16;
  for (let i = 0; i < ticks; i++) {
    const t = total * 0.92 * Math.pow(i / ticks, 1.7);
    const f = 1700 + Math.random() * 700;
    tone(f, t, 0.07, "triangle", 0.07, f * 0.7);
  }
  tone(320, 0, 0.25, "sine", 0.08, 720);
}

export function playWin() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((n, i) => tone(n, i * 0.1, 0.32, "triangle", 0.14));
  tone(1318.5, 0.42, 0.5, "sine", 0.1);
}

export function playLose() {
  tone(392, 0, 0.28, "sawtooth", 0.07, 300);
  tone(311, 0.2, 0.34, "sawtooth", 0.07, 200);
  tone(220, 0.42, 0.5, "sawtooth", 0.07, 130);
}
