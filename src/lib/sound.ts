let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.08, delay = 0) {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  chip: () => {
    tone(1400, 0.05, "triangle", 0.09);
    tone(900, 0.06, "square", 0.03, 0.02);
  },
  remove: () => tone(500, 0.07, "triangle", 0.07),
  noMore: () => {
    tone(440, 0.15, "sawtooth", 0.05);
    tone(330, 0.25, "sawtooth", 0.05, 0.15);
  },
  spin: () => {
    for (let i = 0; i < 6; i++) tone(700 + i * 60, 0.05, "triangle", 0.04, i * 0.12);
  },
  land: () => {
    tone(300, 0.12, "square", 0.05);
    tone(600, 0.1, "triangle", 0.05, 0.08);
  },
  win: () => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, "triangle", 0.08, i * 0.09));
  },
  tick: () => tone(1000, 0.04, "square", 0.03),
};
