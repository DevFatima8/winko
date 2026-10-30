/** Tiny WebAudio synth — no audio assets needed. */

type ToneOpts = {
  freq: number;
  end?: number;
  dur?: number;
  type?: OscillatorType;
  vol?: number;
  delay?: number;
};

class SoundEngine {
  enabled = true;
  private ctx: AudioContext | null = null;

  unlock() {
    try {
      if (!this.ctx) {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext });
        this.ctx = new AC();
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      /* ignore */
    }
  }

  setEnabled(v: boolean) {
    this.enabled = v;
  }

  private tone({ freq, end, dur = 0.12, type = "sine", vol = 0.16, delay = 0 }: ToneOpts) {
    if (!this.enabled) return;
    try {
      this.unlock();
      if (!this.ctx) return;
      const t0 = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (end) osc.frequency.exponentialRampToValueAtTime(end, t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch {
      /* ignore */
    }
  }

  private noise(dur = 0.25, vol = 0.08, delay = 0, freq = 1200) {
    if (!this.enabled) return;
    try {
      this.unlock();
      if (!this.ctx) return;
      const t0 = this.ctx.currentTime + delay;
      const len = Math.max(1, (dur * this.ctx.sampleRate) | 0);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = freq;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter).connect(gain).connect(this.ctx.destination);
      src.start(t0);
    } catch {
      /* ignore */
    }
  }

  click() {
    this.tone({ freq: 740, dur: 0.06, type: "triangle", vol: 0.12 });
  }

  button() {
    this.tone({ freq: 520, end: 780, dur: 0.09, type: "triangle", vol: 0.14 });
  }

  bet() {
    this.tone({ freq: 440, dur: 0.07, type: "square", vol: 0.07 });
    this.tone({ freq: 660, dur: 0.08, type: "square", vol: 0.07, delay: 0.06 });
  }

  spin() {
    this.noise(0.35, 0.1, 0, 900);
    this.tone({ freq: 160, end: 420, dur: 0.3, type: "sawtooth", vol: 0.05 });
  }

  reelStop(i: number) {
    this.tone({ freq: 200 + i * 30, dur: 0.08, type: "triangle", vol: 0.16 });
    this.noise(0.06, 0.06, 0, 2400);
  }

  scatter() {
    [880, 1174, 1568].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.16, type: "sine", vol: 0.14, delay: i * 0.09 }),
    );
  }

  winSmall() {
    this.tone({ freq: 660, dur: 0.12, type: "triangle", vol: 0.16 });
    this.tone({ freq: 880, dur: 0.18, type: "triangle", vol: 0.16, delay: 0.1 });
  }

  winBig() {
    [523, 659, 784, 1046, 1318].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.22, type: "triangle", vol: 0.16, delay: i * 0.11 }),
    );
    this.noise(0.8, 0.05, 0.2, 4000);
  }

  fanfare() {
    [392, 523, 659, 784, 1046, 784, 1046].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.2, type: "square", vol: 0.06, delay: i * 0.12 }),
    );
  }

  coin() {
    this.tone({ freq: 1568, end: 2093, dur: 0.09, type: "sine", vol: 0.1 });
  }
}

export const sound = new SoundEngine();
