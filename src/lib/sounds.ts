// Tiny WebAudio sound-effects engine — no audio files needed.

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(value: boolean): void {
  enabled = value;
}

export function isSoundEnabled(): boolean {
  return enabled;
}

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType = "sine",
  gain = 0.15,
  slideTo?: number,
): void {
  if (!enabled) return;
  const audio = getContext();
  if (!audio) return;
  try {
    const t0 = audio.currentTime + start;
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + duration);
    }
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(amp);
    amp.connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  } catch {
    // Audio is best-effort only.
  }
}

export const sfx = {
  click: (): void => tone(720, 0, 0.05, "square", 0.05),
  chip: (): void => {
    tone(980, 0, 0.06, "triangle", 0.12);
    tone(1320, 0.03, 0.07, "triangle", 0.1);
  },
  deal: (): void => {
    tone(170, 0, 0.09, "sine", 0.2, 90);
    tone(150, 0.08, 0.09, "sine", 0.18, 80);
  },
  flip: (): void => {
    tone(540, 0, 0.05, "triangle", 0.09);
    tone(760, 0.02, 0.06, "triangle", 0.07);
  },
  win: (): void => {
    tone(660, 0, 0.12, "triangle", 0.16);
    tone(880, 0.12, 0.12, "triangle", 0.16);
    tone(1174, 0.24, 0.14, "triangle", 0.16);
    tone(1568, 0.38, 0.35, "triangle", 0.18);
  },
  lose: (): void => {
    tone(230, 0, 0.18, "sawtooth", 0.09, 120);
    tone(120, 0.18, 0.32, "sawtooth", 0.09, 70);
  },
};
