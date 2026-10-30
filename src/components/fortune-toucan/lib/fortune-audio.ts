export type FortuneAudio = {
  resume: () => void;
  click: () => void;
  spinStart: () => void;
  spinStop: () => void;
  land: () => void;
  win: (tier: "win" | "big" | "super" | "mega") => void;
  feature: () => void;
};

export function createFortuneAudio(isEnabled: () => boolean): FortuneAudio {
  let ctx: AudioContext | null = null;
  let spinGain: GainNode | null = null;
  let spinOsc: OscillatorNode | null = null;
  let spinLfo: OscillatorNode | null = null;

  const getCtx = (): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
    }
    return ctx;
  };

  const resume = () => {
    const c = getCtx();
    if (c && c.state === "suspended") void c.resume();
  };

  const tone = (
    freq: number,
    dur: number,
    type: OscillatorType,
    vol = 0.05,
    at = 0,
    slideTo?: number,
  ) => {
    if (!isEnabled()) return;
    const c = getCtx();
    if (!c) return;
    const t0 = c.currentTime + at;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.018);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  };

  return {
    resume,
    click: () => {
      resume();
      tone(920, 0.05, "triangle", 0.035);
    },
    spinStart: () => {
      resume();
      if (!isEnabled()) return;
      const c = getCtx();
      if (!c || spinOsc) return;
      const osc = c.createOscillator();
      const lfo = c.createOscillator();
      const lfoGain = c.createGain();
      const g = c.createGain();
      const filter = c.createBiquadFilter();
      osc.type = "sawtooth";
      osc.frequency.value = 140;
      lfo.type = "sine";
      lfo.frequency.value = 8;
      lfoGain.gain.value = 18;
      filter.type = "lowpass";
      filter.frequency.value = 900;
      g.gain.value = 0.03;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(filter);
      filter.connect(g);
      g.connect(c.destination);
      osc.start();
      lfo.start();
      spinOsc = osc;
      spinLfo = lfo;
      spinGain = g;
    },
    spinStop: () => {
      const c = getCtx();
      if (!c || !spinOsc || !spinGain) return;
      const g = spinGain;
      g.gain.cancelScheduledValues(c.currentTime);
      g.gain.setValueAtTime(g.gain.value, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.12);
      spinOsc.stop(c.currentTime + 0.14);
      spinLfo?.stop(c.currentTime + 0.14);
      spinOsc = null;
      spinLfo = null;
      spinGain = null;
    },
    land: () => {
      resume();
      tone(180, 0.09, "square", 0.04);
      tone(320, 0.07, "triangle", 0.03, 0.02);
    },
    win: (tier) => {
      resume();
      if (tier === "win") {
        tone(523, 0.12, "sine", 0.05);
        tone(659, 0.14, "sine", 0.05, 0.1);
        tone(784, 0.22, "sine", 0.06, 0.2);
        return;
      }
      const base = tier === "mega" ? 392 : tier === "super" ? 349 : 330;
      for (let i = 0; i < 8; i++) {
        tone(base * (1 + i * 0.18), 0.16, "triangle", 0.045, i * 0.09);
      }
      tone(880, 0.4, "sine", 0.05, 0.55);
      tone(1320, 0.5, "sine", 0.04, 0.7);
    },
    feature: () => {
      resume();
      tone(392, 0.2, "sine", 0.05);
      tone(494, 0.22, "sine", 0.05, 0.12);
      tone(587, 0.28, "triangle", 0.06, 0.24);
      tone(784, 0.4, "sine", 0.05, 0.4);
    },
  };
}
