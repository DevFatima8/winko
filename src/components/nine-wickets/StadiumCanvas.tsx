"use client";

import { useEffect, useRef } from "react";
import { H, W } from "./lib/camera";
import type { OutcomeId } from "./lib/engine";
import { Stage } from "./lib/render";
import { buildScenario, frameAt, makeKits, type Scenario } from "./lib/sim";

interface Props {
  outcome: OutcomeId | null;
  animKey: number;
  batColor: string;
  fieldColor: string;
}

export default function StadiumCanvas({ outcome, animKey, batColor, fieldColor }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef<Props>({ outcome, animKey, batColor, fieldColor });

  useEffect(() => {
    live.current = { outcome, animKey, batColor, fieldColor };
  }, [outcome, animKey, batColor, fieldColor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const stage = new Stage();
    let kitKey = "";
    let kits = makeKits(live.current.batColor, live.current.fieldColor);
    let scn: Scenario | null = null;
    let scnKey = -1;
    let t0 = 0;
    let raf = 0;

    const loop = (now: number) => {
      const L = live.current;
      const key = L.batColor + L.fieldColor;
      if (key !== kitKey) {
        kits = makeKits(L.batColor, L.fieldColor);
        kitKey = key;
      }
      const wall = now / 1000;
      let t = 0;
      if (L.outcome) {
        if (!scn || scnKey !== L.animKey) {
          scn = buildScenario(L.outcome);
          scnKey = L.animKey;
          t0 = now;
        }
        t = (now - t0) / 1000;
      } else {
        scn = null;
        scnKey = -1;
      }
      stage.draw(ctx, frameAt(scn, t, wall, kits), wall);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      className="absolute inset-0 block h-full w-full"
      role="img"
      aria-label="Live cricket stadium"
    />
  );
}
