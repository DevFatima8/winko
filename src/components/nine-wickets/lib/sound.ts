export type SoundName = "chip" | "tick" | "bowl" | "hit" | "boundary" | "wicket" | "win" | "lose";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(
  c: AudioContext,
  freq: number,
  duration: number,
  type: OscillatorType,
  volume: number,
  delay = 0,
  slideTo?: number,
) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  const t0 = c.currentTime + delay;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

export function playSound(name: SoundName) {
  const c = getCtx();
  if (!c) return;
  try {
    switch (name) {
      case "chip":
        tone(c, 880, 0.08, "square", 0.05);
        tone(c, 1320, 0.1, "square", 0.04, 0.05);
        break;
      case "tick":
        tone(c, 660, 0.06, "sine", 0.06);
        break;
      case "bowl":
        tone(c, 300, 0.35, "sawtooth", 0.04, 0, 90);
        break;
      case "hit":
        tone(c, 180, 0.12, "square", 0.08, 0, 90);
        break;
      case "boundary":
        tone(c, 180, 0.12, "square", 0.08, 0, 90);
        tone(c, 523, 0.15, "triangle", 0.07, 0.12);
        tone(c, 659, 0.15, "triangle", 0.07, 0.24);
        tone(c, 784, 0.25, "triangle", 0.07, 0.36);
        break;
      case "wicket":
        tone(c, 220, 0.2, "sawtooth", 0.08, 0, 70);
        tone(c, 140, 0.35, "square", 0.06, 0.12, 50);
        break;
      case "win":
        [523, 659, 784, 1047].forEach((f, i) => tone(c, f, 0.22, "triangle", 0.08, i * 0.1));
        break;
      case "lose":
        tone(c, 330, 0.25, "triangle", 0.07, 0, 200);
        tone(c, 220, 0.4, "triangle", 0.07, 0.2, 120);
        break;
    }
  } catch {
    /* audio is optional */
  }
}
