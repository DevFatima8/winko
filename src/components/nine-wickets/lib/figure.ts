/* ------------------------------------------------------------------ */
/*  Articulated human figures (skeleton + 2-bone IK) projected into    */
/*  the broadcast camera. No sprites – every pose is computed.         */
/* ------------------------------------------------------------------ */

import { project, type V3 } from "./camera";

export interface Kit {
  shirt: string;
  pants: string;
  skin: string;
  head: string;
  shoes: string;
  glove: string | null;
  pads: boolean;
}

export type ArmsMode =
  | "swing"
  | "hips"
  | "knees"
  | "up"
  | "keeper"
  | "bowl"
  | "throw"
  | "wave"
  | "finger"
  | "bat";

export interface FigureState {
  id: number;
  kit: Kit;
  x: number;
  y: number;
  /** direction the legs / hips face (radians, 0 = +x, PI/2 = +y) */
  heading: number;
  /** running phase */
  gait: number;
  /** running amplitude 0..1 */
  run: number;
  crouch: number;
  lean: number;
  /** upper body rotation relative to the hips */
  twist: number;
  /** head yaw relative to the upper body */
  look: number;
  jump: number;
  arms: ArmsMode;
  armsT: number;
  /** world position of the bat handle (arms === "bat") */
  batH?: V3;
  /** unit vector handle -> toe of the bat */
  bat?: V3;
  scale: number;
}

export interface Prim {
  kind: 0 | 1; // 0 = capsule, 1 = sphere
  ax: number;
  ay: number;
  bx: number;
  by: number;
  w: number;
  color: string;
  edge: string;
  d: number;
}

export interface Shadow {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/* ------------------------------ colour ------------------------------ */

const shadeCache = new Map<string, string>();

export function shade(hex: string, k: number): string {
  const key = hex + k;
  const hit = shadeCache.get(key);
  if (hit) return hit;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * k)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * k)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * k)));
  const out = "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  shadeCache.set(key, out);
  return out;
}

/* -------------------------------- IK -------------------------------- */

function ik(s: V3, h: V3, l1: number, l2: number, pole: V3): [V3, V3] {
  let dx = h[0] - s[0];
  let dy = h[1] - s[1];
  let dz = h[2] - s[2];
  let dist = Math.hypot(dx, dy, dz);
  const maxD = (l1 + l2) * 0.996;
  if (dist > maxD) {
    const k = maxD / dist;
    dx *= k;
    dy *= k;
    dz *= k;
    dist = maxD;
  }
  if (dist < 0.06) {
    dist = 0.06;
    dz -= 0.06;
  }
  const nx = dx / dist;
  const ny = dy / dist;
  const nz = dz / dist;
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const hh = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  const pd = pole[0] * nx + pole[1] * ny + pole[2] * nz;
  let px = pole[0] - pd * nx;
  let py = pole[1] - pd * ny;
  let pz = pole[2] - pd * nz;
  const pl = Math.hypot(px, py, pz) || 1;
  px /= pl;
  py /= pl;
  pz /= pl;
  return [
    [s[0] + nx * a + px * hh, s[1] + ny * a + py * hh, s[2] + nz * a + pz * hh],
    [s[0] + dx, s[1] + dy, s[2] + dz],
  ];
}

/* ------------------------------ builder ----------------------------- */

const cs = Math.cos;
const sn = Math.sin;

export function buildFigure(f: FigureState, out: Prim[], shadows: Shadow[], minW: number) {
  const S = f.scale;
  const psi = f.heading;
  const k = f.kit;

  const loc = (u: number, v: number, w: number, ang = psi): V3 => {
    const c = cs(ang);
    const s = sn(ang);
    return [f.x + (u * c - v * s) * S, f.y + (u * s + v * c) * S, w * S];
  };

  const cap = (a: V3, b: V3, ra: number, rb: number, color: string, bias = 0) => {
    const pa = project(a[0], a[1], a[2]);
    const pb = project(b[0], b[1], b[2]);
    const w = Math.max(ra * pa.s + rb * pb.s, minW);
    out.push({
      kind: 0,
      ax: pa.x,
      ay: pa.y,
      bx: pb.x,
      by: pb.y,
      w,
      color,
      edge: shade(color, 0.5),
      d: (pa.d + pb.d) / 2 - bias,
    });
  };

  const ball = (c: V3, r: number, color: string, bias = 0) => {
    const p = project(c[0], c[1], c[2]);
    const w = Math.max(2 * r * p.s, minW);
    out.push({
      kind: 1,
      ax: p.x,
      ay: p.y,
      bx: p.x,
      by: p.y,
      w,
      color,
      edge: shade(color, 0.5),
      d: p.d - bias,
    });
  };

  /* ground shadow */
  {
    const p = project(f.x, f.y, 0);
    shadows.push({ x: p.x, y: p.y, rx: 0.62 * S * p.s, ry: 0.62 * S * p.s * 0.5 });
  }

  /* ---------------------------- legs ---------------------------- */
  const h = 0.92 - 0.1 * f.run - 0.26 * f.crouch + f.jump;
  const hipC = loc(0, 0, h);
  const fwd: V3 = [cs(psi), sn(psi), 0.15];
  const knees: V3[] = [];

  for (const s of [1, -1]) {
    const ph = f.gait + (s > 0 ? 0 : Math.PI);
    const fx = -0.5 * cs(ph) * f.run + s * 0.12 * f.crouch;
    const lift = f.run * 0.3 * Math.max(0, sn(ph));
    const hip = loc(0, s * 0.1, h);
    const ankle = loc(fx, s * (0.11 + 0.09 * f.crouch), 0.07 + lift + f.jump);
    const [knee, an] = ik(hip, ankle, 0.46 * S, 0.44 * S, fwd);
    knees.push(knee);
    const toe: V3 = [an[0] + cs(psi) * 0.17 * S, an[1] + sn(psi) * 0.17 * S, Math.max(an[2] - 0.04 * S, 0.02)];

    cap(hip, knee, 0.085 * S, 0.07 * S, k.pants);
    cap(knee, an, 0.06 * S, 0.048 * S, k.pads ? "#f1f5f9" : k.pants);
    cap(an, toe, 0.05 * S, 0.045 * S, k.shoes, 0.01);
  }

  /* pelvis + torso */
  const hipL = loc(0, 0.1, h);
  const hipR = loc(0, -0.1, h);
  cap(hipL, hipR, 0.105 * S, 0.105 * S, k.pants, -0.01);

  const lean = f.lean + f.crouch * 0.25;
  const sC = loc(0.52 * sn(lean), 0, h + 0.52 * cs(lean));
  const ang2 = psi + f.twist;
  const lat: [number, number] = [-sn(ang2), cs(ang2)];
  const shL: V3 = [sC[0] + lat[0] * 0.19 * S, sC[1] + lat[1] * 0.19 * S, sC[2]];
  const shR: V3 = [sC[0] - lat[0] * 0.19 * S, sC[1] - lat[1] * 0.19 * S, sC[2]];

  cap(hipC, sC, 0.175 * S, 0.19 * S, k.shirt, 0.02);
  cap(shL, shR, 0.09 * S, 0.09 * S, k.shirt, 0.03);

  /* head */
  const lookA = ang2 + f.look;
  const headC: V3 = [
    sC[0] + cs(ang2) * 0.06 * S * sn(lean) + cs(lookA) * 0.04 * S,
    sC[1] + sn(ang2) * 0.06 * S * sn(lean) + sn(lookA) * 0.04 * S,
    sC[2] + 0.27 * S * cs(lean * 0.5),
  ];
  cap([sC[0], sC[1], sC[2] + 0.05 * S], headC, 0.055 * S, 0.05 * S, k.skin, 0.03);

  /* ----------------------------- arms ---------------------------- */
  const upFrame = (sh: V3, u: number, v: number, w: number): V3 => {
    const c = cs(ang2);
    const s = sn(ang2);
    return [sh[0] + (u * c - v * s) * S, sh[1] + (u * s + v * c) * S, sh[2] + w * S];
  };

  let handL: V3 = shL;
  let handR: V3 = shR;

  for (const s of [1, -1]) {
    const sh = s > 0 ? shL : shR;
    const outward: V3 = [lat[0] * s, lat[1] * s, -0.45];
    let target: V3;
    const ph = f.gait + (s > 0 ? Math.PI : 0);
    const A = f.run;

    switch (f.arms) {
      case "hips":
        target = upFrame(sh, 0.02, s * 0.17, -0.44);
        break;
      case "knees": {
        const kn = knees[s > 0 ? 0 : 1];
        target = [kn[0], kn[1], kn[2] + 0.07 * S];
        break;
      }
      case "up": {
        const wv = sn(f.armsT * 13 + (s > 0 ? 0 : 1.7));
        target = upFrame(sh, 0.05, s * (0.24 + 0.03 * wv), 0.56 + 0.06 * wv);
        break;
      }
      case "keeper": {
        const p = Math.min(Math.max(f.armsT, 0), 1);
        target = upFrame(sh, 0.4 + 0.18 * p, s * 0.13, -0.6 + 0.16 * p);
        break;
      }
      case "bowl": {
        const al = f.armsT;
        if (s < 0) {
          target = upFrame(sh, 0.58 * sn(al), 0.02, -0.58 * cs(al));
        } else {
          const p = Math.min(Math.max((-al - 3.23) / 2.0, 0), 1);
          const be = 2.5 * (1 - p) * (1 - p) + 0.05;
          target = upFrame(sh, 0.4 * sn(be), s * 0.1, -0.4 * cs(be));
        }
        break;
      }
      case "throw": {
        const p = Math.min(Math.max(f.armsT, 0), 1);
        if (s < 0) {
          const al = -1.3 + 3.5 * p;
          target = upFrame(sh, 0.56 * sn(al), -0.08, -0.56 * cs(al));
        } else {
          target = upFrame(sh, 0.42, 0.1, 0.05);
        }
        break;
      }
      case "wave":
        target =
          s < 0
            ? upFrame(sh, 0.12, -0.05 + 0.4 * sn(f.armsT * 10), 0.42)
            : upFrame(sh, 0.02, 0.2, -0.5);
        break;
      case "finger":
        target = s < 0 ? upFrame(sh, 0.0, -0.05, 0.57) : upFrame(sh, 0.02, 0.2, -0.5);
        break;
      case "bat": {
        const bh = f.batH ?? shR;
        const b = f.bat ?? [0, 0, -1];
        target = s < 0 ? bh : [bh[0] - b[0] * 0.11 * S, bh[1] - b[1] * 0.11 * S, bh[2] - b[2] * 0.11 * S];
        break;
      }
      default: {
        // swing: natural arm swing that scales with running
        const u = 0.06 + A * 0.3 * sn(ph);
        const w = -0.52 + A * (0.2 + 0.16 * sn(ph));
        target = upFrame(sh, u, s * (0.2 - 0.05 * A), w);
      }
    }

    const [elbow, hand] = ik(sh, target, 0.3 * S, 0.28 * S, outward);
    cap(sh, elbow, 0.058 * S, 0.05 * S, k.shirt, 0.02);
    cap(elbow, hand, 0.048 * S, 0.04 * S, k.skin);
    ball(hand, 0.05 * S, k.glove ?? k.skin, -0.01);
    if (s > 0) handL = hand;
    else handR = hand;
  }

  /* bat */
  if (f.bat) {
    const b = f.bat;
    const g: V3 = handR;
    const len = 1.15 * S;
    const p1: V3 = [g[0] + b[0] * 0.05 * len, g[1] + b[1] * 0.05 * len, g[2] + b[2] * 0.05 * len];
    const p2: V3 = [g[0] + b[0] * 0.3 * len, g[1] + b[1] * 0.3 * len, g[2] + b[2] * 0.3 * len];
    const p3: V3 = [g[0] + b[0] * len, g[1] + b[1] * len, g[2] + b[2] * len];
    cap(p1, p2, 0.018 * S, 0.018 * S, "#222b3a", -0.03);
    cap(p2, p3, 0.06 * S, 0.062 * S, "#ecd49a", -0.03);
  }
  void handL;

  /* head + headgear (drawn last so it sorts on top) */
  const faceDir: [number, number] = [cs(lookA), sn(lookA)];
  const face: V3 = [headC[0] + faceDir[0] * 0.035 * S, headC[1] + faceDir[1] * 0.035 * S, headC[2] - 0.005 * S];
  const topC: V3 = [headC[0], headC[1], headC[2] + 0.03 * S];
  ball(topC, 0.128 * S, k.head, 0.06);
  ball(face, 0.092 * S, k.skin, 0.061 + (0.02 * (faceDir[1] > 0 ? -1 : 1)));
}
