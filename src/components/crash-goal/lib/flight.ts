import { secondsFor } from "./crash";

export const BALL_SIZE = 54;

export interface FlightGeometry {
  w: number;
  h: number;
  controlsHeight: number;
}

export function flightFrame(multiplier: number, g: FlightGeometry, seed: number) {
  const variation = (Math.abs(seed) % 997) / 997;
  const seconds = secondsFor(Math.max(1, multiplier));
  const speed = 0.85 + variation * 0.3;
  const left = Math.min(96, Math.max(34, g.w * 0.12));
  const right = Math.min(66, Math.max(34, g.w * 0.08));
  const top = Math.min(76, Math.max(34, g.h * 0.14));
  const bottom = Math.max(top, g.h - g.controlsHeight - 36);
  const width = Math.max(1, g.w - left - right);
  const height = Math.max(1, bottom - top);
  const t = seconds * speed;
  const ball = {
    x: left + width * (1 - Math.cos(t * 0.42)) / 2,
    y: bottom - height * (1 - Math.cos(t * 0.29)) / 2,
  };
  const worldPoint = (time: number) => ({
    x: left + width * time * 0.26,
    y: bottom - height * (time * 0.16 + time * time * 0.001),
  });
  const world = worldPoint(t);
  const camera = { x: world.x - ball.x, y: ball.y - world.y };
  const parts: string[] = [];
  for (let i = 0; i <= 42; i++) {
    // Project the whole trail through the current camera, not past camera positions.
    const point = worldPoint(t * i / 42);
    parts.push(`${(point.x - camera.x).toFixed(1)} ${(point.y + camera.y).toFixed(1)}`);
  }
  return { ball, camera, path: `M${parts.join(" L")}` };
}
