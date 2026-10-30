let ctx: AudioContext | null = null;
let enabled = true;

export function setSound(on: boolean) {
  enabled = on;
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType = "sine",
  vol = 0.06,
  delay = 0,
  slideTo?: number,
) {
  if (!enabled) return;
  const c = getCtx();
  if (!c) return;
  try {
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  } catch {
    /* audio is best-effort */
  }
}

export const sfx = {
  click: () => tone(340, 0.05, "triangle", 0.045),
  tick: () => tone(180 + Math.random() * 140, 0.028, "square", 0.014),
  win: () => {
    tone(523.25, 0.1, "sine", 0.07);
    tone(783.99, 0.16, "sine", 0.07, 0.1);
  },
  bigwin: () => {
    tone(523.25, 0.1, "sine", 0.08);
    tone(659.25, 0.1, "sine", 0.08, 0.1);
    tone(783.99, 0.12, "sine", 0.08, 0.2);
    tone(1046.5, 0.3, "sine", 0.09, 0.32);
  },
  loss: () => tone(150, 0.2, "sawtooth", 0.045, 0, 82),
  deny: () => tone(110, 0.16, "square", 0.05),
};
