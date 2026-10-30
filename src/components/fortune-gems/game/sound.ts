let ctx: AudioContext | null = null;
export let soundOn = true;
export const setSound = (v: boolean) => {
  soundOn = v;
};

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.08, delay = 0, slideTo?: number) {
  if (!soundOn) return;
  const c = getCtx();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime + delay;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur);
}

export const sfx = {
  click: () => tone(600, 0.06, 'square', 0.04),
  spin: () => {
    tone(300, 0.25, 'sawtooth', 0.04, 0, 700);
  },
  stop: () => tone(180, 0.1, 'triangle', 0.1, 0, 90),
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.09, i * 0.09));
  },
  big: () => {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.25, 'square', 0.06, i * 0.1));
  },
  coin: () => {
    tone(1200, 0.06, 'square', 0.03);
    tone(1600, 0.08, 'square', 0.03, 0.05);
  },
};
