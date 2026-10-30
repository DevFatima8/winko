/**
 * Tiny Web-Audio synthesizer for game sounds (no audio assets required).
 */

let ctx: AudioContext | null = null;

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as AudioWindow).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function unlockAudio(): void {
  getCtx();
}

function blip(freq: number, dur: number, vol: number, type: OscillatorType = "sine", when = 0, slideTo?: number) {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.03);
}

/** Ball passing a pocket fret. */
export const playTick = (vol = 0.12) => blip(1700 + Math.random() * 500, 0.028, vol, "square");

/** Ball leaving the track. */
export const playBallDrop = () => blip(420, 0.14, 0.18, "triangle", 0, 180);

/** Chip placed on the table. */
export const playChip = () => {
  blip(880, 0.05, 0.1, "triangle");
  blip(1320, 0.045, 0.07, "triangle", 0.025);
};

export const playClick = () => blip(600, 0.04, 0.07, "square");

export const playWin = () => {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => blip(f, 0.26, 0.16, "triangle", i * 0.1));
  blip(1318.5, 0.5, 0.12, "sine", 0.42);
};

export const playLose = () => blip(200, 0.28, 0.1, "sine", 0, 120);
