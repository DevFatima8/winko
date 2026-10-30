"use client";

import { useEffect } from "react";

const TARGET = "button, a.btn-gold, a.btn-violet, a.btn-outline, [role='button']";
const GAME_SCOPE = ".wx-game, .game-surface";

let audioCtx: AudioContext | null = null;

// Short synthesized tick, no audio file needed.
function playClick() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx ??= new Ctx();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.07);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  } catch { }
}

// Tap ripple drawn in a fixed overlay so it never changes any button's layout.
export function ButtonFx() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const onDown = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.(TARGET) as HTMLElement | null;
      if (!el || el.closest(GAME_SCOPE) || (el as HTMLButtonElement).disabled) return;
      if (/^\/(player\/)?games\//.test(window.location.pathname)) return;
      playClick();
      if (reduce) return;
      const rect = el.getBoundingClientRect();
      const size = Math.min(Math.max(rect.width, rect.height) * 1.4, 160);
      const dot = document.createElement("span");
      dot.className = "wx-ripple";
      dot.style.cssText = `left:${e.clientX - size / 2}px;top:${e.clientY - size / 2}px;width:${size}px;height:${size}px`;
      document.body.appendChild(dot);
      dot.addEventListener("animationend", () => dot.remove(), { once: true });
      window.setTimeout(() => dot.remove(), 900);
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);
  return null;
}
