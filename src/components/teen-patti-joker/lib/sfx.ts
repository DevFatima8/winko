// Tiny WebAudio synth for casino sounds — no audio assets needed.

type SfxKind = "chip" | "card" | "flip" | "click" | "win" | "bigwin" | "lose" | "push";

class SoundFX {
  private ctx: AudioContext | null = null;
  enabled = true;

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private tone(ctx: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, vol: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    gain.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + dur + 0.05);
  }

  private noise(ctx: AudioContext, start: number, dur: number, vol: number, filterFreq: number) {
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(ctx.currentTime + start);
  }

  play(kind: SfxKind) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      switch (kind) {
        case "click":
          this.tone(ctx, 620, 0, 0.07, "triangle", 0.12);
          break;
        case "chip":
          this.noise(ctx, 0, 0.05, 0.3, 3800);
          this.tone(ctx, 1900, 0, 0.05, "square", 0.05);
          this.tone(ctx, 1400, 0.03, 0.05, "square", 0.04);
          break;
        case "card":
          this.noise(ctx, 0, 0.09, 0.22, 1600);
          break;
        case "flip":
          this.noise(ctx, 0, 0.07, 0.18, 2600);
          this.tone(ctx, 900, 0.02, 0.06, "triangle", 0.05);
          break;
        case "win":
          [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(ctx, f, i * 0.09, 0.28, "triangle", 0.14));
          break;
        case "bigwin":
          [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.tone(ctx, f, i * 0.08, 0.3, "triangle", 0.16));
          [523.25, 659.25].forEach((f, i) => this.tone(ctx, f, 0.5 + i * 0.1, 0.4, "sine", 0.12));
          break;
        case "lose":
          [220, 185, 147].forEach((f, i) => this.tone(ctx, f, i * 0.13, 0.26, "sawtooth", 0.07));
          break;
        case "push":
          [440, 440].forEach((f, i) => this.tone(ctx, f, i * 0.12, 0.16, "triangle", 0.1));
          break;
      }
    } catch {
      /* audio not available */
    }
  }
}

export const sfx = new SoundFX();
