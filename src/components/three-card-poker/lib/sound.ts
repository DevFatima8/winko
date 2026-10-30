let audioCtx: AudioContext | null = null;
let muted = false;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return null;
    audioCtx = new AudioCtor();
  }
  return audioCtx;
}

export function setMuted(value: boolean) {
  muted = value;
}

export function isMuted() {
  return muted;
}

function tone(
  frequency: number,
  duration: number,
  type: OscillatorType,
  volume = 0.06,
  delay = 0,
) {
  if (muted) return;
  const ac = ctx();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
  const start = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0008, start + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration);
}

export function playChip() {
  tone(720, 0.07, "triangle", 0.05);
  tone(980, 0.05, "square", 0.02, 0.02);
}

export function playDeal() {
  tone(220, 0.08, "sawtooth", 0.03);
  tone(340, 0.06, "triangle", 0.04, 0.02);
}

export function playFlip() {
  tone(480, 0.09, "triangle", 0.04);
}

export function playWin() {
  tone(523, 0.12, "triangle", 0.06, 0);
  tone(659, 0.12, "triangle", 0.06, 0.1);
  tone(784, 0.18, "triangle", 0.07, 0.2);
  tone(1046, 0.25, "sine", 0.05, 0.32);
}

export function playLose() {
  tone(196, 0.22, "sawtooth", 0.04);
  tone(146, 0.28, "triangle", 0.05, 0.12);
}

export function playClick() {
  tone(640, 0.04, "square", 0.025);
}
