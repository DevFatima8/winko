/**
 * Tiny Web-Audio synth so the table has real arcade feedback without
 * shipping any audio assets.
 */
class TableAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  unlock() {
    this.ensure();
  }

  setMuted(value: boolean) {
    this.muted = value;
    if (this.master) this.master.gain.value = value ? 0 : 0.5;
  }

  private blip(freq: number, duration: number, type: OscillatorType, volume: number, slideTo?: number) {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.muted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  tick() {
    this.blip(1500 + Math.random() * 260, 0.045, "square", 0.05);
  }

  chipDrop() {
    this.blip(420, 0.09, "triangle", 0.14, 260);
  }

  spinStart() {
    this.blip(180, 0.5, "sawtooth", 0.09, 900);
  }

  multiplier() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => window.setTimeout(() => this.blip(n, 0.28, "triangle", 0.16), i * 90));
  }

  win(big: boolean) {
    const notes = big ? [523, 659, 784, 1046, 1318] : [659, 880, 1046];
    notes.forEach((n, i) => window.setTimeout(() => this.blip(n, 0.34, "square", 0.1), i * 110));
  }

  lose() {
    this.blip(300, 0.22, "sine", 0.12, 180);
    window.setTimeout(() => this.blip(190, 0.34, "sine", 0.1, 110), 150);
  }
}

export const tableAudio = new TableAudio();
