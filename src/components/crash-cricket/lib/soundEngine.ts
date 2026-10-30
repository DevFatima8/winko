"use client";

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private flightOsc: OscillatorNode | null = null;
  private flightGain: GainNode | null = null;
  private active = false;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined" || !this.active || document.hidden) return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.stopFlightSound();
    }
  }

  public setActive(active: boolean) {
    this.active = active;
    if (!active) {
      this.stopFlightSound();
      const ctx = this.ctx;
      this.ctx = null;
      if (ctx && ctx.state !== "closed") {
        void ctx.close().catch(error => console.error("[crash-cricket audio] Could not close sound context.", error));
      }
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  // Subtle button click
  public playClick() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(680, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.045);
    } catch {
      // Ignore audio context errors prior to user interaction
    }
  }

  // Countdown tick (last 3 seconds)
  public playTick(final: boolean = false) {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(final ? 880 : 520, ctx.currentTime);

      gain.gain.setValueAtTime(0.09, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch {}
  }

  // Crisp Willow Bat hitting Leather Ball CRACK + Crowd Roar swell
  public playBatHit() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Woody bat impact thud + crack
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(95, now + 0.12);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);

      // High-frequency leather snap noise burst
      const bufferSize = ctx.sampleRate * 0.08;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1600, now);
      filter.Q.setValueAtTime(1.5, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.32, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(now);
    } catch {}
  }

  // Start rising flight whirr sound
  public startFlightSound() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    this.stopFlightSound();

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(140, ctx.currentTime);

      gain.gain.setValueAtTime(0.01, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.055, ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      this.flightOsc = osc;
      this.flightGain = gain;
    } catch {}
  }

  // Update pitch based on current multiplier
  public updateFlightPitch(multiplier: number) {
    if (this.isMuted || !this.flightOsc || !this.ctx) return;
    try {
      const targetFreq = Math.min(880, 140 + Math.log2(Math.max(1, multiplier)) * 115);
      this.flightOsc.frequency.setTargetAtTime(
        targetFreq,
        this.ctx.currentTime,
        0.05
      );
    } catch {}
  }

  public stopFlightSound() {
    try {
      if (this.flightOsc) {
        this.flightOsc.stop();
        this.flightOsc.disconnect();
        this.flightOsc = null;
      }
      if (this.flightGain) {
        this.flightGain.disconnect();
        this.flightGain = null;
      }
    } catch {}
  }

  // Cashout Win Fanfare Chime
  public playCashoutWin() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [587.33, 783.99, 1046.5, 1318.51]; // D5, G5, C6, E6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + idx * 0.055);

        gain.gain.setValueAtTime(0.18, now + idx * 0.055);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.055 + 0.32);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.055);
        osc.stop(now + idx * 0.055 + 0.34);
      });
    } catch {}
  }

  // Wicket / Ball Burst Crash Explosion
  public playCrashWicket() {
    this.stopFlightSound();
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Low sub boom + descending buzzer
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.42);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.46);

      // Wooden stumps clatter burst
      const bufferSize = ctx.sampleRate * 0.25;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(950, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.28, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.005, now + 0.25);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(now);
    } catch {}
  }
}

export const soundEngine = new SoundEngine();
