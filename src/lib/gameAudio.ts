"use client";

let audioContext: AudioContext | null = null;

function getContext() {
    if (typeof window === "undefined") return null;
    audioContext ??= new AudioContext();
    if (audioContext.state === "suspended") void audioContext.resume();
    return audioContext;
}

function tone(frequency: number, duration: number, type: OscillatorType, volume: number, delay = 0) {
    const ctx = getContext();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
}

export type GameSound = "jump" | "coin" | "danger" | "crash" | "launch" | "cashout" | "click" | "ballDrop" | "notification";

export function unlockGameAudio() {
    const ctx = getContext();
    if (ctx?.state === "suspended") void ctx.resume();
}

export type GameVoice = "chickenJump" | "chickenCrash" | "chickenWin" | "planeLaunch" | "planeCrash" | "planeImpact" | "planeWin" | "ballDrop" | "gemFound" | "mineHit" | "slotWin" | "cardWin" | "limboWin";

export function speakGameVoice(voice: GameVoice) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const lines: Record<GameVoice, { text: string; pitch: number; rate: number }> = {
        chickenJump: { text: "Go chicken!", pitch: 1.35, rate: 1.15 },
        chickenCrash: { text: "Oh no!", pitch: 0.75, rate: 1.05 },
        chickenWin: { text: "Great crossing!", pitch: 1.5, rate: 1.05 },
        planeLaunch: { text: "Take off!", pitch: 1.2, rate: 1.1 },
        planeCrash: { text: "Flew away!", pitch: 0.7, rate: 0.95 },
        planeImpact: { text: "Crashed!", pitch: 0.7, rate: 0.95 },
        planeWin: { text: "Cash out!", pitch: 1.45, rate: 1.1 },
        ballDrop: { text: "Drop!", pitch: 1, rate: 1.2 },
        gemFound: { text: "Gem found!", pitch: 1.55, rate: 1.1 },
        mineHit: { text: "Mine!", pitch: 0.65, rate: 1.15 },
        slotWin: { text: "Winner!", pitch: 1.5, rate: 1.05 },
        cardWin: { text: "You win!", pitch: 1.35, rate: 1.05 },
        limboWin: { text: "Multiplier win!", pitch: 1.4, rate: 1.05 },
    };
    const line = lines[voice];
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(line.text);
    utterance.pitch = line.pitch;
    utterance.rate = line.rate;
    utterance.volume = 0.75;
    window.speechSynthesis.speak(utterance);
}

export function playGameSound(sound: GameSound) {
    switch (sound) {
        case "jump":
            tone(260, 0.12, "sine", 0.05);
            tone(520, 0.16, "sine", 0.035, 0.07);
            break;
        case "coin":
            tone(880, 0.08, "square", 0.035);
            tone(1320, 0.14, "square", 0.025, 0.07);
            break;
        case "danger":
            tone(180, 0.18, "sawtooth", 0.045);
            tone(130, 0.22, "sawtooth", 0.035, 0.12);
            break;
        case "crash":
            tone(190, 0.3, "sawtooth", 0.06);
            tone(75, 0.42, "triangle", 0.05, 0.12);
            break;
        case "launch":
            tone(220, 0.16, "sine", 0.04);
            tone(440, 0.24, "sine", 0.045, 0.1);
            tone(660, 0.3, "sine", 0.04, 0.2);
            break;
        case "cashout":
            tone(520, 0.1, "sine", 0.04);
            tone(780, 0.12, "sine", 0.04, 0.08);
            tone(1040, 0.2, "sine", 0.035, 0.16);
            break;
        case "click":
            tone(340, 0.05, "square", 0.018);
            break;
        case "ballDrop":
            tone(180, 0.08, "triangle", 0.03);
            tone(280, 0.12, "triangle", 0.025, 0.07);
            break;
        case "notification":
            tone(740, 0.14, "sine", 0.09);
            tone(988, 0.2, "sine", 0.08, 0.14);
            tone(1175, 0.26, "sine", 0.07, 0.32);
            break;
    }
}