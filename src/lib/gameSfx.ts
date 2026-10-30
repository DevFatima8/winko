"use client";

// Shared WebAudio sound effects (no audio files). Safe to call from any game; silently no-ops on the server.
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined" || document.hidden) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.08, delay = 0, slideTo?: number) {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

export const gameSfx = {
  stop: () => {
    const current = ctx;
    ctx = null;
    if (current && current.state !== "closed") {
      void current.close().catch(error => console.error("[game audio] Could not close sound context.", error));
    }
  },
  /** Call on first user gesture if you need to unlock audio early. */
  unlock: () => { getCtx(); },
  click: () => tone(900, 0.05, "triangle", 0.06),
  chip: () => { tone(1400, 0.05, "triangle", 0.08); tone(900, 0.06, "square", 0.03, 0.02); },
  /** Betting countdown tick – play once per second while the timer runs. */
  tick: () => tone(1000, 0.07, "square", 0.05),
  /** Louder, higher tick for the final 3 seconds. */
  tickUrgent: () => { tone(1500, 0.1, "square", 0.07); tone(750, 0.1, "triangle", 0.04, 0.02); },
  /** Round start / "go" cue after countdown ends. */
  go: () => { tone(660, 0.12, "triangle", 0.08); tone(990, 0.2, "triangle", 0.08, 0.1); },
  deal: () => tone(700, 0.06, "triangle", 0.06, 0, 300),
  flip: () => { tone(500, 0.08, "triangle", 0.07, 0, 900); tone(900, 0.07, "triangle", 0.05, 0.08, 400); },
  spin: () => { for (let i = 0; i < 8; i++) tone(500 + i * 60, 0.05, "triangle", 0.04, i * 0.1); },
  land: () => { tone(300, 0.12, "square", 0.05); tone(600, 0.1, "triangle", 0.05, 0.08); },
  win: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, "triangle", 0.08, i * 0.09)); },
  lose: () => { tone(330, 0.2, "sawtooth", 0.05); tone(220, 0.35, "sawtooth", 0.05, 0.18); },
  gameOver: () => { tone(392, 0.2, "triangle", 0.07); tone(330, 0.2, "triangle", 0.07, 0.18); tone(262, 0.4, "triangle", 0.07, 0.36); },
  coin: () => { tone(880, 0.08, "square", 0.04); tone(1320, 0.14, "square", 0.03, 0.07); },
  rise: () => tone(300, 0.15, "sine", 0.03, 0, 600),
  crash: () => { tone(190, 0.3, "sawtooth", 0.06); tone(75, 0.42, "triangle", 0.05, 0.12); },
};
