export type Sfx = "chip" | "card" | "deal" | "win" | "lose" | "joker";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (typeof window === "undefined") return null;
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

function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
  const c = getCtx();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    const t0 = c.currentTime + delay;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  } catch {
    /* audio is best-effort */
  }
}

export function playSfx(kind: Sfx) {
  try {
    switch (kind) {
      case "chip":
        tone(1250, 0.07, "square", 0.045);
        tone(1650, 0.05, "square", 0.03, 0.035);
        break;
      case "card":
        tone(300, 0.05, "triangle", 0.14);
        tone(480, 0.04, "triangle", 0.07, 0.02);
        break;
      case "deal":
        tone(210, 0.1, "sine", 0.12);
        tone(260, 0.12, "sine", 0.1, 0.08);
        break;
      case "win":
        [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, "triangle", 0.11, i * 0.09));
        break;
      case "lose":
        tone(196, 0.28, "sawtooth", 0.05);
        tone(147, 0.34, "sawtooth", 0.05, 0.14);
        break;
      case "joker":
        [880, 1175, 1319, 1760, 2349].forEach((f, i) => tone(f, 0.2, "square", 0.06, i * 0.08));
        break;
    }
  } catch {
    /* audio is best-effort */
  }
}
