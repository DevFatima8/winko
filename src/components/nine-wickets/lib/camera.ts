/* ------------------------------------------------------------------ */
/*  Two fixed broadcast cameras with real perspective projection        */
/*   - "wide": high spider-cam that shows the whole stadium             */
/*   - "main": low camera behind the bowler's arm (classic TV angle)    */
/*  World units are metres: x = right, y = down the pitch, z = up.      */
/*  The bowler's end is at y = -10.06, the batsman's end at y = +10.06. */
/* ------------------------------------------------------------------ */

export const W = 1280;
export const H = 720;

export type V3 = [number, number, number];
export type CamId = "wide" | "main";

interface Basis {
  pos: V3;
  fwd: V3;
  right: V3;
  up: V3;
  focal: number;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

function makeBasis(pos: V3, target: V3, focal: number): Basis {
  const fwd = norm(sub(target, pos));
  const right = norm(cross(fwd, [0, 0, 1]));
  const up = cross(right, fwd);
  return { pos, fwd, right, up, focal };
}

const BASES: Record<CamId, Basis> = {
  wide: makeBasis([0, -112, 68], [0, 12, 0], 630),
  main: makeBasis([0, -46, 16], [0, 9, 1.6], 1050),
};

let B: Basis = BASES.wide;

export function setCam(id: CamId) {
  B = BASES[id];
}

/** vertical squash of circles lying on the ground for the active camera */
export function groundSquash() {
  return Math.min(0.9, Math.abs(B.fwd[2]) * 1.1 + 0.03);
}

export interface Pt {
  /** screen x in the 1280x720 frame */
  x: number;
  /** screen y in the 1280x720 frame */
  y: number;
  /** pixels per metre at that depth */
  s: number;
  /** depth along the view axis (bigger = further away) */
  d: number;
}

export function project(x: number, y: number, z: number): Pt {
  const vx = x - B.pos[0];
  const vy = y - B.pos[1];
  const vz = z - B.pos[2];
  const d = vx * B.fwd[0] + vy * B.fwd[1] + vz * B.fwd[2];
  const xc = vx * B.right[0] + vy * B.right[1] + vz * B.right[2];
  const yc = vx * B.up[0] + vy * B.up[1] + vz * B.up[2];
  const s = B.focal / Math.max(d, 0.5);
  return { x: W / 2 + xc * s, y: H / 2 - yc * s, s, d };
}
