"use client";

import { useEffect, useRef, useState } from "react";
import {
  RACE_DURATION,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  type Horse,
  type RacePhase,
  type RacePlan,
} from "./lib/derby";
import { PixelDerbyRenderer, drawHorsePortrait, type RunnerLocation } from "./lib/pixel-derby";

type Props = {
  phase: RacePhase;
  plan: RacePlan | null;
  countdown: number;
  selectedHorseId: number;
  onSelectHorse: (horseId: number) => void;
  onProgress: (progress: number) => void;
  onComplete: (plan: RacePlan) => void;
};

function ControlIcon({ name }: { name: "pause" | "play" | "fullscreen" | "sound" | "muted" }) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      {name === "pause" && <><path d="M6 4v10M12 4v10" strokeWidth="3" /></>}
      {name === "play" && <path d="m5 3 10 6-10 6Z" />}
      {name === "fullscreen" && <path d="M7 3H3v4m8-4h4v4M3 11v4h4m8-4v4h-4" />}
      {(name === "sound" || name === "muted") && <><path d="M3 7h3l4-3v10l-4-3H3Z" />{name === "sound" ? <path d="M13 6a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10" /> : <path d="m13 7 4 4m0-4-4 4" />}</>}
    </svg>
  );
}

export function HorsePortrait({ horse }: { horse: Horse }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const context = ref.current?.getContext("2d");
    if (context) drawHorsePortrait(context, horse);
  }, [horse]);

  return <canvas ref={ref} className="horse-portrait" width={88} height={72} aria-hidden="true" />;
}

export default function DerbyTrack(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const locationsRef = useRef<RunnerLocation[]>([]);
  const [previewPlaying, setPreviewPlaying] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [controlMessage, setControlMessage] = useState("");
  const audioRef = useRef<AudioContext | null>(null);
  const settings = { ...props, previewPlaying, reducedMotion };
  const latest = useRef(settings);

  useEffect(() => {
    latest.current = settings;
  }, [settings]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReducedMotion(query.matches);
    change();
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    const element = canvasRef.current;
    const context = element?.getContext("2d", { alpha: false });
    if (!element || !context) return;

    const renderer = new PixelDerbyRenderer(context);
    let frame = 0;
    let activeRaceId: string | null = null;
    let completedRaceId: string | null = null;
    let startedAt = 0;
    let previousFrameAt = -100;
    let reportedAt = -100;
    const previewStart = performance.now();

    const paint = (now: number) => {
      const current = latest.current;
      let progress = current.phase === "result" ? 1 : 0;
      if (current.phase === "racing" && current.plan) {
        if (activeRaceId !== current.plan.id) {
          activeRaceId = current.plan.id;
          startedAt = now;
          reportedAt = -100;
        }
        progress = Math.min((now - startedAt) / RACE_DURATION, 1);
      }

      if (now - previousFrameAt >= 1000 / 30) {
        locationsRef.current = renderer.draw({
          phase: current.phase,
          progress,
          time: (now - previewStart) / 1000,
          plan: current.plan,
          countdown: current.countdown,
          selectedHorseId: current.selectedHorseId,
          animatePreview: current.previewPlaying,
          reducedMotion: current.reducedMotion,
        });
        previousFrameAt = now;
      }

      if (current.phase === "racing" && current.plan) {
        if (now - reportedAt >= 120) {
          current.onProgress(progress);
          reportedAt = now;
        }
        if (progress >= 1 && completedRaceId !== current.plan.id) {
          completedRaceId = current.plan.id;
          current.onProgress(1);
          current.onComplete(current.plan);
        }
      }
      frame = window.requestAnimationFrame(paint);
    };

    frame = window.requestAnimationFrame(paint);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const change = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!soundOn || !audio) return;

    function tone(frequency: number, duration: number, volume = 0.025, delay = 0, type: OscillatorType = "square") {
      if (!audio || audio.state === "closed") return;
      const at = audio.currentTime + delay;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(volume, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + duration + 0.02);
    }

    if ((props.phase === "idle" || props.phase === "countdown") && props.countdown > 0 && props.countdown <= 3) tone(440 + (3 - props.countdown) * 110, 0.13);
    if (props.phase === "result" && props.plan) {
      const melody = props.plan.stake <= 0 ? [] : props.plan.playerWon ? [523, 659, 784, 1047] : [440, 349, 294];
      melody.forEach((frequency, index) => tone(frequency, 0.2, 0.02, index * 0.13));
    }
    if (props.phase !== "racing") return;

    tone(880, 0.16);
    let beat = 0;
    const hooves = window.setInterval(() => {
      tone(beat % 2 ? 95 : 130, 0.07, 0.022, 0, "triangle");
      beat++;
    }, 125);
    return () => window.clearInterval(hooves);
  }, [soundOn, props.phase, props.countdown, props.plan]);

  useEffect(() => {
    return () => { void audioRef.current?.close(); };
  }, []);

  async function toggleSound() {
    if (soundOn) {
      setSoundOn(false);
      return;
    }
    if (!("AudioContext" in window)) {
      setControlMessage("Audio is not supported in this browser.");
      return;
    }
    try {
      if (!audioRef.current || audioRef.current.state === "closed") audioRef.current = new AudioContext();
      await audioRef.current.resume();
      setSoundOn(true);
      setControlMessage("");
    } catch {
      setControlMessage("Your browser could not enable game audio.");
    }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (stageRef.current?.requestFullscreen) {
        await stageRef.current.requestFullscreen();
      } else {
        setControlMessage("Fullscreen is not supported in this browser.");
      }
    } catch {
      setControlMessage("Fullscreen is unavailable here. Try opening the game in its own tab.");
    }
  }

  function chooseHorse(event: React.PointerEvent<HTMLCanvasElement>) {
    if (props.phase !== "idle") return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * SCREEN_WIDTH;
    const y = ((event.clientY - box.top) / box.height) * SCREEN_HEIGHT;
    const hit = [...locationsRef.current].reverse().find((horse) => (
      x >= horse.x + 14 && x <= horse.x + horse.width &&
      y >= horse.y - horse.height * 0.9 && y <= horse.y
    ));
    if (hit) props.onSelectHorse(hit.id);
  }

  const status = props.phase === "racing" ? "RACING" : props.phase === "countdown" ? "GET READY" : props.phase === "result" ? "FINISHED" : `NEXT RACE ${props.countdown}s`;

  return (
    <div className="arcade-cabinet">
      <div className="cabinet-topbar">
        <div className="cabinet-title"><span className="pixel-led" /><span>DERBY RACE</span><span className="cabinet-edition">ARCADE CLASSIC</span></div>
        <span className={`screen-status screen-status-${props.phase}`}><span />{status}</span>
      </div>
      <div className="pixel-stage" ref={stageRef}>
        <canvas
          className={`pixel-race-canvas ${props.phase === "idle" ? "canvas-selectable" : ""}`}
          ref={canvasRef}
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
          onPointerDown={chooseHorse}
          role="img"
          aria-label="Retro pixel-art horse race: six brightly colored horses and animated jockeys on a golden dirt track, with green grass, trees, fences, and six diagonal numbered starting gates. Choose a horse using the buttons beside the track."
        />
      </div>
      <div className="cabinet-controls">
        <span className="screen-help"><span className="screen-help-dot" />{props.phase === "idle" ? "Click a horse or press 1–6 to pick" : props.phase === "countdown" ? "At the gate. The flag is about to drop." : props.phase === "racing" ? "And they’re off! Watch the finish." : "Photo finish. Ready for another race?"}</span>
        <div className="screen-buttons">
          <button type="button" className="screen-control" onClick={() => setPreviewPlaying((playing) => !playing)} disabled={props.phase !== "idle" || reducedMotion} aria-label={previewPlaying ? "Pause preview animation" : "Play preview animation"} title={previewPlaying ? "Pause preview" : "Play preview"} aria-pressed={!previewPlaying}>
            <ControlIcon name={previewPlaying ? "pause" : "play"} />
          </button>
          <button type="button" className={`screen-control ${soundOn ? "control-active" : ""}`} onClick={() => void toggleSound()} aria-label={soundOn ? "Mute game sound" : "Enable game sound"} title={soundOn ? "Sound on" : "Sound off"} aria-pressed={soundOn}>
            <ControlIcon name={soundOn ? "sound" : "muted"} />
          </button>
          <button type="button" className="screen-control" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} title="Fullscreen">
            <ControlIcon name="fullscreen" />
          </button>
        </div>
      </div>
      {controlMessage && <p className="control-message" role="status">{controlMessage}</p>}
    </div>
  );
}
