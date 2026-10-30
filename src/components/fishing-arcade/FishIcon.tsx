"use client";

import { useEffect, useRef } from "react";
import type { Species } from "./game/config";
import { drawSpeciesPreview } from "./game/draw";

export default function FishIcon({
  sp,
  width = 130,
  height = 84,
}: {
  sp: Species;
  width?: number;
  height?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = 2;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    let raf = 0;
    const loop = (ms: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      drawSpeciesPreview(ctx, sp, width, height, ms / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sp, width, height]);

  return <canvas ref={ref} style={{ width, height }} />;
}
