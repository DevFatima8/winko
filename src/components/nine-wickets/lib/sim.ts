/* ------------------------------------------------------------------ */
/*  Ball-by-ball match simulation: bowler run-up, delivery, bat swing,  */
/*  real ball physics, fielders chasing, batsmen running, celebrations  */
/* ------------------------------------------------------------------ */

import { W, H, project, setCam, type CamId, type V3 } from "./camera";
import { shade, type FigureState, type Kit } from "./figure";
import type { OutcomeId } from "./engine";

export const SCALE = 1.3;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

export const T_RELEASE = 1.55;
export const T_HIT = 2.33;

const BAT_X = 0.1;
const BAT_Y = 8.95;
const NS_X = 1.75;
const NS_Y = -9.3;
const RB = 65; // boundary rope radius

/* ------------------------------ helpers ----------------------------- */

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const smooth = (u: number) => {
  const x = clamp01(u);
  return x * x * (3 - 2 * x);
};
const easeOut = (u: number) => 1 - (1 - clamp01(u)) * (1 - clamp01(u));
const wrap = (a: number) => {
  let x = a;
  while (x > Math.PI) x -= TAU;
  while (x < -Math.PI) x += TAU;
  return x;
};
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/* -------------------------------- kits ------------------------------ */

const SKINS = ["#c68a5a", "#8d5a36", "#d9a273", "#a3683f", "#b9794b", "#e0ac7c"];

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return 0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255);
}

/** One kit per figure id (0..14) */
export function makeKits(batColor: string, fieldColor: string): Kit[] {
  const fieldPants = luminance(fieldColor) > 130 ? "#14532d" : shade(fieldColor, 0.5);
  const kits: Kit[] = [];
  for (let id = 0; id < 15; id++) {
    const skin = SKINS[id % SKINS.length];
    if (id === 11 || id === 12) {
      kits.push({
        shirt: batColor,
        pants: shade(batColor, 0.55),
        skin,
        head: shade(batColor, 0.8),
        shoes: "#f8fafc",
        glove: "#f8fafc",
        pads: true,
      });
    } else if (id === 1) {
      kits.push({
        shirt: fieldColor,
        pants: fieldPants,
        skin,
        head: fieldPants,
        shoes: "#f8fafc",
        glove: "#e8d9a8",
        pads: true,
      });
    } else if (id === 13 || id === 14) {
      kits.push({
        shirt: "#f4f4f0",
        pants: "#1f2937",
        skin,
        head: "#f1f5f9",
        shoes: "#111827",
        glove: null,
        pads: false,
      });
    } else {
      kits.push({
        shirt: fieldColor,
        pants: fieldPants,
        skin,
        head: fieldPants,
        shoes: "#f8fafc",
        glove: null,
        pads: false,
      });
    }
  }
  return kits;
}

/* ------------------------------ fielders ---------------------------- */

interface FieldPos {
  n: string;
  x: number;
  y: number;
}

export const FIELDERS: FieldPos[] = [
  { n: "slip", x: -3.3, y: 15.8 },
  { n: "point", x: -19, y: 8.5 },
  { n: "cover", x: -27, y: -4 },
  { n: "midoff", x: -17, y: -26 },
  { n: "midon", x: 16, y: -27 },
  { n: "midwicket", x: 28, y: -4 },
  { n: "deepsq", x: 45, y: 9 },
  { n: "fineleg", x: 20, y: 52 },
  { n: "thirdman", x: -25, y: 50 },
];

/* ------------------------------ scenario ---------------------------- */

export type Kind = "defend" | "beaten" | "run" | "four" | "six" | "bowled" | "caught";

export interface Scenario {
  outcome: OutcomeId;
  kind: Kind;
  runs: number;
  dir: [number, number];
  /** where the ball meets the bat (or passes the batsman) at T_HIT */
  E: V3;
  gc: number;
  gf: number;
  swing: number;
  dist: number;
  T: number;
  apex: number;
  zEnd: number;
  end: [number, number];
  ropeT: number;
  ropePt: [number, number];
  fielder: number;
  meet: [number, number];
  tPick: number;
  walkOff: [number, number];
}

function batGeom(dir: [number, number], gamma: number): { h: V3; b: V3 } {
  const gh = gamma * 0.7;
  const scx = BAT_X - 0.15;
  return {
    h: [scx + dir[0] * 0.44 * Math.sin(gh), BAT_Y + dir[1] * 0.44 * Math.sin(gh), 1.72 - 0.52 * Math.cos(gh)],
    b: [dir[0] * Math.sin(gamma), dir[1] * Math.sin(gamma), -Math.cos(gamma)],
  };
}

function contactPoint(dir: [number, number], gc: number): V3 {
  const { h, b } = batGeom(dir, gc);
  const l = 0.62 * 1.15 * SCALE;
  return [h[0] + b[0] * l, h[1] + b[1] * l, Math.max(h[2] + b[2] * l, 0.3)];
}

function unit(dx: number, dy: number): [number, number] {
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}

function angleDir(deg: number): [number, number] {
  return [Math.sin(deg * DEG), -Math.cos(deg * DEG)];
}

/** distance along a ray from (px,py) in direction d until |p| = R */
function rayCircle(px: number, py: number, d: [number, number], R: number) {
  const b = px * d[0] + py * d[1];
  const c = px * px + py * py - R * R;
  return -b + Math.sqrt(Math.max(b * b - c, 0));
}

function nearestFielder(x: number, y: number, only?: number[]) {
  let best = 0;
  let bd = Infinity;
  FIELDERS.forEach((f, i) => {
    if (only && !only.includes(i)) return;
    const d = Math.hypot(f.x - x, f.y - y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

export function buildScenario(outcome: OutcomeId): Scenario {
  const scn: Scenario = {
    outcome,
    kind: "defend",
    runs: 0,
    dir: [0, -1],
    E: [0, 9, 0.6],
    gc: 40 * DEG,
    gf: 170 * DEG,
    swing: 0,
    dist: 0,
    T: 2.5,
    apex: 0,
    zEnd: 0,
    end: [0, 0],
    ropeT: 0,
    ropePt: [0, 0],
    fielder: 0,
    meet: [0, 0],
    tPick: 0,
    walkOff: [-14, 34],
  };

  if (outcome === "dot") {
    if (Math.random() < 0.55) {
      scn.kind = "defend";
      scn.dir = [0.05, -1];
      scn.gc = 28 * DEG;
      scn.gf = 42 * DEG;
      scn.E = contactPoint(scn.dir, scn.gc);
      const a = rnd(8, 34) * (Math.random() < 0.5 ? -1 : 1);
      scn.dist = rnd(5, 8);
      scn.T = 1.6;
      const d = angleDir(a);
      scn.end = [scn.E[0] + d[0] * scn.dist, scn.E[1] + d[1] * scn.dist];
      scn.dir = d;
    } else {
      scn.kind = "beaten";
      scn.dir = [0, -1];
      scn.gf = 150 * DEG;
      scn.swing = -0.42;
      scn.E = [0.05, 9.15, 0.62];
      scn.end = [0.3, 14.3];
    }
  } else if (outcome === "single" || outcome === "two") {
    scn.kind = "run";
    scn.runs = outcome === "single" ? 1 : 2;
    const idx = pick(outcome === "single" ? [1, 2, 3, 4, 5] : [6, 7, 8, 2, 5]);
    scn.fielder = idx;
    const base = FIELDERS[idx];
    const u = unit(base.x - BAT_X, base.y - BAT_Y);
    const side = Math.random() < 0.5 ? 1 : -1;
    const q: [number, number] = [base.x - u[1] * 5.5 * side + u[0] * 3, base.y + u[0] * 5.5 * side + u[1] * 3];
    let dir = unit(q[0] - BAT_X, q[1] - BAT_Y);
    let E = contactPoint(dir, scn.gc);
    dir = unit(q[0] - E[0], q[1] - E[1]);
    E = contactPoint(dir, scn.gc);
    scn.dir = dir;
    scn.E = E;
    scn.end = q;
    scn.dist = Math.hypot(q[0] - E[0], q[1] - E[1]);
    scn.T = outcome === "single" ? 2.9 : 3.4;
    scn.tPick = 0.684 * scn.T;
    scn.meet = [E[0] + dir[0] * scn.dist * 0.9, E[1] + dir[1] * scn.dist * 0.9];
  } else if (outcome === "four") {
    scn.kind = "four";
    const a = pick([-8, 8, -46, -38, 44, 52, 78, -78, 128, -128]) + rnd(-3, 3);
    const dir = angleDir(a);
    scn.dir = dir;
    scn.E = contactPoint(dir, scn.gc);
    const rope = rayCircle(scn.E[0], scn.E[1], dir, RB);
    scn.dist = rope + 3.2;
    scn.T = 2.4;
    const q = rope / scn.dist;
    const u = (1.32 - Math.sqrt(1.7424 - 1.28 * q)) / 0.64;
    scn.ropeT = u * scn.T;
    scn.ropePt = [scn.E[0] + dir[0] * rope, scn.E[1] + dir[1] * rope];
    scn.end = [scn.E[0] + dir[0] * scn.dist, scn.E[1] + dir[1] * scn.dist];
    scn.fielder = nearestFielder(scn.ropePt[0], scn.ropePt[1]);
    scn.meet = [scn.E[0] + dir[0] * (rope - 1.5), scn.E[1] + dir[1] * (rope - 1.5)];
    scn.tPick = scn.ropeT + 0.35;
  } else if (outcome === "six") {
    scn.kind = "six";
    scn.gc = 30 * DEG;
    scn.gf = 215 * DEG;
    const a = pick([-50, -40, 40, 55, 75, -75, 130, -130, 145]) + rnd(-3, 3);
    const dir = angleDir(a);
    scn.dir = dir;
    scn.E = contactPoint(dir, scn.gc);
    const rope = rayCircle(scn.E[0], scn.E[1], dir, RB);
    scn.dist = rope + rnd(9, 22);
    scn.T = 3.0;
    scn.apex = rnd(20, 27);
    scn.end = [scn.E[0] + dir[0] * scn.dist, scn.E[1] + dir[1] * scn.dist];
    const r = Math.hypot(scn.end[0], scn.end[1]);
    scn.zEnd = clamp(1.5 + ((r - 72) / 3.4) * 3.0, 3, 24);
    scn.ropePt = [scn.E[0] + dir[0] * rope, scn.E[1] + dir[1] * rope];
    scn.ropeT = 1.6;
    scn.fielder = nearestFielder(scn.end[0], scn.end[1]);
  } else {
    // wicket
    if (Math.random() < 0.55) {
      scn.kind = "bowled";
      scn.E = [0.0, 10.02, 0.45];
      scn.dir = [0.05, -1];
      scn.gf = 135 * DEG;
      scn.swing = 0.15;
      scn.end = [0.7, 13.6];
    } else {
      scn.kind = "caught";
      scn.gc = 32 * DEG;
      scn.gf = 200 * DEG;
      const idx = pick([2, 3, 4, 5, 6, 1]);
      scn.fielder = idx;
      const base = FIELDERS[idx];
      const L: [number, number] = [base.x + rnd(-2.5, 2.5), base.y + rnd(-2.5, 2.5)];
      let dir = unit(L[0] - BAT_X, L[1] - BAT_Y);
      let E = contactPoint(dir, scn.gc);
      dir = unit(L[0] - E[0], L[1] - E[1]);
      E = contactPoint(dir, scn.gc);
      scn.dir = dir;
      scn.E = E;
      scn.end = L;
      scn.dist = Math.hypot(L[0] - E[0], L[1] - E[1]);
      scn.T = 1.9 + scn.dist * 0.02;
      scn.apex = 11 + scn.dist * 0.2;
      scn.zEnd = 2.3;
      scn.meet = L;
      scn.tPick = scn.T;
    }
  }
  return scn;
}

/* ----------------------------- frame types -------------------------- */

export interface Seg {
  a: V3;
  b: V3;
  r: number;
  color: string;
}

export interface Fx {
  kind: "ring" | "flare" | "rope" | "dust";
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  big: number;
}

export interface Cam {
  zoom: number;
  x: number;
  y: number;
  shake: number;
}

export interface Frame {
  camId: CamId;
  /** seconds since the last camera cut (drives the cut transition) */
  cut: number;
  figs: FigureState[];
  ball: V3 | null;
  trail: V3[];
  stumps: Seg[];
  cam: Cam;
  fx: Fx[];
  flash: number;
}

/* ----------------------------- base pose ---------------------------- */

function mk(id: number, kit: Kit, x: number, y: number, heading: number): FigureState {
  return {
    id,
    kit,
    x,
    y,
    heading,
    gait: 0,
    run: 0,
    crouch: 0,
    lean: 0,
    twist: 0,
    look: 0,
    jump: 0,
    arms: "swing",
    armsT: 0,
    scale: SCALE,
  };
}

function baseFigs(kits: Kit[], wall: number): FigureState[] {
  const figs: FigureState[] = [];
  figs.push(mk(0, kits[0], 1.6, -22, Math.PI / 2 - 0.12)); // bowler
  const keeper = mk(1, kits[1], 0.35, 14.7, -Math.PI / 2);
  keeper.crouch = 0.85;
  keeper.lean = 0.45;
  keeper.arms = "keeper";
  keeper.armsT = 0;
  figs.push(keeper);

  FIELDERS.forEach((p, i) => {
    const f = mk(2 + i, kits[2 + i], p.x, p.y, Math.atan2(BAT_Y - p.y, BAT_X - p.x));
    if (i === 0) {
      f.crouch = 0.6;
      f.lean = 0.4;
      f.arms = "knees";
    } else {
      f.crouch = 0.3 + 0.03 * Math.sin(wall * 1.6 + i);
      f.lean = 0.35;
      f.arms = "knees";
    }
    figs.push(f);
  });

  const striker = mk(11, kits[11], BAT_X, BAT_Y, Math.PI);
  striker.crouch = 0.3;
  striker.lean = 0.35;
  striker.look = Math.PI / 2;
  striker.arms = "bat";
  {
    const g = batGeom([0, -1], -8 * DEG);
    striker.batH = g.h;
    striker.bat = g.b;
  }
  figs.push(striker);

  const ns = mk(12, kits[12], NS_X, NS_Y, Math.PI / 2);
  ns.lean = 0.12;
  ns.arms = "hips";
  ns.bat = unit3([0.1, 0.35, -0.93]);
  figs.push(ns);

  const u1 = mk(13, kits[13], -1.8, -11.7, Math.PI / 2);
  figs.push(u1);
  const u2 = mk(14, kits[14], 14, 9.5, Math.PI);
  figs.push(u2);
  return figs;
}

function unit3(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/* ------------------------------ movement ---------------------------- */

function moveTo(
  f: FigureState,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  t: number,
  t0: number,
  t1: number,
  ease: (u: number) => number = smooth,
): boolean {
  const u = clamp01((t - t0) / (t1 - t0));
  const e = ease(u);
  f.x = ax + (bx - ax) * e;
  f.y = ay + (by - ay) * e;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len > 0.05 && u > 0) f.heading = Math.atan2(dy, dx);
  const moving = u > 0 && u < 1 && len > 0.05;
  if (moving) {
    const speed = len / (t1 - t0);
    f.run = clamp(0.12 + speed / 8.5, 0.12, 1);
    f.gait = (t - t0) * TAU * (1.5 + 1.7 * f.run) + f.id * 1.3;
    f.lean = 0.12 + 0.16 * f.run;
    f.crouch = 0;
    f.arms = "swing";
  }
  return moving;
}

function carryBat(f: FigureState) {
  f.bat = unit3([Math.cos(f.heading) * 0.3, Math.sin(f.heading) * 0.3, -0.94]);
}

/* ------------------------------- bowler ----------------------------- */

function bowlerXY(t: number): [number, number] {
  if (t <= 1.5) {
    const u = clamp01((t - 0.05) / 1.45);
    const e = Math.pow(u, 1.35);
    return [lerp(1.6, 0.45, e), lerp(-22, -10.55, e)];
  }
  const u2 = clamp01((t - 1.5) / 1.0);
  return [0.45 - 0.25 * easeOut(u2), -10.55 + 3.55 * easeOut(u2)];
}

function bowlerAlpha(t: number) {
  return clamp(-8.08 * (t - 1.15), -6.6, 0);
}

function handBall(t: number): V3 {
  const [bx, by] = bowlerXY(t);
  const al = bowlerAlpha(t);
  if (t < 1.15) return [bx + 0.3, by + 0.05, 1.15];
  return [bx + 0.24, by + 0.725 * Math.sin(al), 1.7 - 0.725 * Math.cos(al)];
}

/* ------------------------------ ball path --------------------------- */

const RELEASE: V3 = [0.69, -10.45, 2.4];
const BOUNCE: V3 = [0.1, 3.9, 0];

function delivery(scn: Scenario, t: number): V3 {
  const tau = t - T_RELEASE;
  const T1 = 0.52;
  const T2 = T_HIT - T_RELEASE - T1;
  if (tau <= T1) {
    const u = tau / T1;
    return [lerp(RELEASE[0], BOUNCE[0], u), lerp(RELEASE[1], BOUNCE[1], u), RELEASE[2] * Math.pow(1 - u, 1.8)];
  }
  const u = clamp01((tau - T1) / T2);
  const E = scn.E;
  return [lerp(BOUNCE[0], E[0], u), lerp(BOUNCE[1], E[1], u), E[2] * (1 - (1 - u) * (1 - u))];
}

function groundZ(tau: number) {
  return 0.04 + 0.45 * Math.abs(Math.sin(tau * 7.5)) * Math.exp(-1.7 * tau);
}

function airPos(scn: Scenario, tau: number): V3 {
  const u = clamp01(tau / scn.T);
  return [
    lerp(scn.E[0], scn.end[0], u),
    lerp(scn.E[1], scn.end[1], u),
    scn.E[2] + (scn.zEnd - scn.E[2]) * u + 4 * scn.apex * u * (1 - u),
  ];
}

export function ballAt(scn: Scenario, t: number): V3 | null {
  if (t < T_RELEASE) return handBall(t);
  if (t < T_HIT) return delivery(scn, t);
  const tau = t - T_HIT;
  const E = scn.E;

  switch (scn.kind) {
    case "defend": {
      const u = clamp01(tau / scn.T);
      const s = easeOut(u);
      return [E[0] + (scn.end[0] - E[0]) * s, E[1] + (scn.end[1] - E[1]) * s, groundZ(tau) * 0.6];
    }
    case "beaten": {
      const u = clamp01(tau / 0.3);
      if (tau < 0.3) return [lerp(E[0], scn.end[0], u), lerp(E[1], scn.end[1], u), lerp(E[2], 0.75, u)];
      const up = smooth((tau - 0.9) / 0.5);
      return [scn.end[0], scn.end[1], 0.75 + 0.35 * up];
    }
    case "bowled": {
      const u = clamp01(tau / 1.3);
      const s = easeOut(u);
      return [
        lerp(E[0], scn.end[0], s),
        lerp(E[1], scn.end[1], s),
        0.05 + 0.5 * Math.abs(Math.sin(tau * 6)) * Math.exp(-2.2 * tau),
      ];
    }
    case "four": {
      const u = clamp01(tau / scn.T);
      const s = scn.dist * (u * (1.32 - 0.32 * u));
      return [E[0] + scn.dir[0] * s, E[1] + scn.dir[1] * s, groundZ(tau)];
    }
    case "six": {
      if (tau > scn.T + 0.12) return null;
      return airPos(scn, tau);
    }
    case "caught": {
      if (tau <= scn.T) return airPos(scn, tau);
      return [scn.end[0], scn.end[1], scn.zEnd - 0.1];
    }
    case "run": {
      const tp = scn.tPick;
      if (tau <= tp) {
        const u = clamp01(tau / scn.T);
        const s = scn.dist * (1 - (1 - u) * (1 - u));
        return [E[0] + scn.dir[0] * s, E[1] + scn.dir[1] * s, groundZ(tau) * 0.8];
      }
      const rel = tp + 0.45;
      const target: V3 = scn.runs === 1 ? [0, -10.06, 0.7] : [0.35, 14.2, 0.95];
      const from: V3 = [scn.meet[0], scn.meet[1], 1.0];
      if (tau <= rel) return from;
      const u = clamp01((tau - rel) / 0.95);
      return [lerp(from[0], target[0], u), lerp(from[1], target[1], u), lerp(from[2], target[2], u) + 2.6 * u * (1 - u)];
    }
  }
}

/* ------------------------------- stumps ----------------------------- */

const STUMP_H = 0.71;
const STUMP_X = [-0.114, 0, 0.114];
const STUMP_COL = "#f4efe0";
const BAIL_COL = "#f7e3a0";

function stumpsFrame(scn: Scenario | null, t: number): Seg[] {
  const segs: Seg[] = [];
  // bowler's end
  for (const x of STUMP_X) segs.push({ a: [x, -10.06, 0], b: [x, -10.06, STUMP_H], r: 0.05, color: STUMP_COL });
  segs.push({ a: [-0.114, -10.06, STUMP_H + 0.02], b: [-0.008, -10.06, STUMP_H + 0.02], r: 0.03, color: BAIL_COL });
  segs.push({ a: [0.008, -10.06, STUMP_H + 0.02], b: [0.114, -10.06, STUMP_H + 0.02], r: 0.03, color: BAIL_COL });

  // batsman's end
  const tau = scn && scn.kind === "bowled" ? t - T_HIT : -1;
  if (tau <= 0) {
    for (const x of STUMP_X) segs.push({ a: [x, 10.06, 0], b: [x, 10.06, STUMP_H], r: 0.05, color: STUMP_COL });
    segs.push({ a: [-0.114, 10.06, STUMP_H + 0.02], b: [-0.008, 10.06, STUMP_H + 0.02], r: 0.03, color: BAIL_COL });
    segs.push({ a: [0.008, 10.06, STUMP_H + 0.02], b: [0.114, 10.06, STUMP_H + 0.02], r: 0.03, color: BAIL_COL });
    return segs;
  }

  const vx = [-1.3, 0.5, 2.3];
  const vy = [3.6, 4.4, 3.1];
  const vz = [2.3, 3.1, 1.9];
  const om = [7, -9, 11];
  const ax: [number, number][] = [
    [-0.5, 0.86],
    [0.92, 0.3],
    [0.6, 0.8],
  ];
  for (let i = 0; i < 3; i++) {
    const cz = Math.max(0.06, 0.355 + vz[i] * tau - 4.9 * tau * tau);
    const cx = STUMP_X[i] + (vx[i] * (1 - Math.exp(-1.8 * tau))) / 1.8;
    const cy = 10.06 + (vy[i] * (1 - Math.exp(-1.8 * tau))) / 1.8;
    const th = clamp(om[i] * tau, -1.45, 1.45) * (om[i] < 0 ? 1 : 1);
    const dx = Math.sin(th) * ax[i][0];
    const dy = Math.sin(th) * ax[i][1];
    const dz = Math.cos(th);
    const half = 0.355;
    segs.push({
      a: [cx - dx * half, cy - dy * half, Math.max(cz - dz * half, 0.03)],
      b: [cx + dx * half, cy + dy * half, Math.max(cz + dz * half, 0.03)],
      r: 0.05,
      color: STUMP_COL,
    });
  }
  const bv: V3[] = [
    [-2.6, 2.0, 3.6],
    [2.9, 2.6, 3.9],
  ];
  for (let j = 0; j < 2; j++) {
    const z = Math.max(0.04, STUMP_H + 0.02 + bv[j][2] * tau - 4.9 * tau * tau);
    const px = (j === 0 ? -0.06 : 0.06) + bv[j][0] * tau * 0.8;
    const py = 10.06 + bv[j][1] * tau * 0.8;
    const rot = tau * (j === 0 ? 14 : -16);
    segs.push({
      a: [px, py, z],
      b: [px + Math.cos(rot) * 0.11, py + Math.sin(rot) * 0.11, z + 0.02],
      r: 0.03,
      color: BAIL_COL,
    });
  }
  return segs;
}

/* ------------------------------- camera ----------------------------- */

function focusPt(y: number, z = 0.6) {
  const p = project(0, y, z);
  return { x: p.x, y: p.y };
}

function idleCam(wall: number): Cam {
  return {
    zoom: 1.03 + 0.012 * Math.sin(wall * 0.25),
    x: W / 2 + 7 * Math.sin(wall * 0.13),
    y: H / 2,
    shake: 0,
  };
}

/** when the director cuts from the low main camera to the high wide camera */
function cutTime(scn: Scenario): number {
  switch (scn.kind) {
    case "defend":
    case "beaten":
      return T_HIT + 1.5;
    case "bowled":
      return T_HIT + 1.7;
    default:
      return T_HIT + 0.42;
  }
}

function camAt(scn: Scenario, t: number): { cam: Cam; camId: CamId; cut: number } {
  const tc = cutTime(scn);
  const since = t - T_HIT;

  let shake = 0;
  if (since > 0 && since < 0.7 && (scn.kind === "four" || scn.kind === "six" || scn.kind === "bowled")) {
    shake = (scn.kind === "six" ? 4 : 3) * Math.exp(-since * 8);
  }

  /* --- main camera: low, behind the bowler's arm --- */
  if (t < tc) {
    setCam("main");
    const push = 1.08 + 0.27 * smooth(t / 1.5) + 0.5 * smooth((t - 1.5) / 0.85) + (scn.kind === "bowled" ? 0.18 * smooth(since / 1.4) : 0);
    return { cam: { zoom: push, x: W / 2 + 2, y: 365, shake }, camId: "main", cut: t };
  }

  /* --- wide camera: follows the ball flight, then pulls back to the whole stadium --- */
  setCam("wide");
  const start = focusPt(0);
  const w0 = 2.6;
  let outStart = tc + 0.25;
  let outDur = 1.1;
  let outZoom = 1.03;
  let finalStart = Infinity;
  switch (scn.kind) {
    case "defend":
    case "beaten":
      outZoom = 1.5;
      finalStart = T_HIT + 2.8;
      break;
    case "bowled":
      outZoom = 2.3;
      outDur = 1.5;
      finalStart = T_HIT + 3.2;
      break;
    case "run":
      outStart = tc + 0.3;
      outZoom = 1.75;
      finalStart = T_HIT + (scn.runs === 2 ? 4.9 : 3.1);
      break;
    case "four":
      outZoom = 1.4;
      finalStart = T_HIT + 3.6;
      break;
    case "caught":
      outZoom = 1.4;
      finalStart = T_HIT + scn.T + 1.6;
      break;
    default:
      // six: pull all the way out so the ball is seen landing in the stands
      outDur = 0.9;
      break;
  }
  const u = smooth((t - outStart) / outDur);
  let zoom = lerp(w0, outZoom, u);
  const wf = outZoom > 1.1 ? focusPt(scn.kind === "bowled" ? 6 : 3) : { x: W / 2, y: H / 2 };
  let fx = lerp(start.x, wf.x, u);
  let fy = lerp(start.y, wf.y, u);
  if (t > finalStart) {
    const u2 = smooth((t - finalStart) / 1.3);
    zoom = lerp(zoom, 1.03, u2);
    fx = lerp(fx, W / 2, u2);
    fy = lerp(fy, H / 2, u2);
  }
  return { cam: { zoom, x: fx, y: fy, shake: 0 }, camId: "wide", cut: t - tc };
}

/* ------------------------------- bat pose --------------------------- */

const G0 = -8 * DEG;
const GB = -140 * DEG;
const backAt = (x: number) => lerp(G0, GB, smooth((x - 1.35) / 0.7));

function gammaAt(scn: Scenario, t: number): number {
  const ts = T_HIT + scn.swing;
  const s0 = ts - 0.27;
  if (t < s0) return backAt(t);
  const g0 = backAt(s0);
  if (scn.kind === "bowled" || scn.kind === "beaten") {
    const u = clamp01((t - s0) / 0.33);
    return lerp(g0, scn.gf, Math.pow(u, 1.4));
  }
  if (t < ts) {
    const u = (t - s0) / 0.27;
    return lerp(g0, scn.gc, Math.pow(u, 1.5));
  }
  return lerp(scn.gc, scn.gf, easeOut((t - ts) / 0.35));
}

/* ------------------------------- the ball --------------------------- */

export function frameAt(scn: Scenario | null, t: number, wall: number, kits: Kit[]): Frame {
  const figs = baseFigs(kits, wall);
  const frame: Frame = {
    camId: "wide",
    cut: 99,
    figs,
    ball: null,
    trail: [],
    stumps: stumpsFrame(scn, t),
    cam: idleCam(wall),
    fx: [],
    flash: 0.35,
  };
  if (!scn) return frame;

  const B = figs[0];
  const K = figs[1];
  const S = figs[11];
  const N = figs[12];
  const U1 = figs[13];
  const fx = frame.fx;
  const since = t - T_HIT;
  const bounce = (t0: number, rate = 9) => 0.09 * Math.abs(Math.sin((t - t0) * rate));

  /* ---------- bowler ---------- */
  {
    const [bx, by] = bowlerXY(t);
    B.x = bx;
    B.y = by;
    B.heading = Math.PI / 2 - 0.12 * (1 - clamp01((t - 0.3) / 1.2));
    const sp = t < 1.5 ? smooth((t - 0.05) / 0.45) : 1 - smooth((t - 1.6) / 1.0);
    B.run = clamp01(sp);
    B.gait = t * TAU * 3.3;
    B.lean =
      t < 1.3
        ? 0.12
        : t < 1.5
          ? lerp(0.12, -0.2, smooth((t - 1.3) / 0.2))
          : t < 2.0
            ? lerp(-0.2, 0.62, smooth((t - 1.5) / 0.2))
            : lerp(0.62, 0.22, smooth((t - 2.0) / 0.6));
    if (t >= 1.15 && t < 2.1) {
      B.arms = "bowl";
      B.armsT = bowlerAlpha(t);
    } else B.arms = "swing";
    B.look = 0;
    if (t > 2.6) {
      B.run = 0;
      B.arms = "hips";
      B.lean = 0.15;
      B.heading = Math.atan2(BAT_Y - B.y, BAT_X - B.x);
    }
    if (scn.kind === "bowled" && since > 0.3) {
      B.run = 0;
      B.arms = "up";
      B.armsT = t;
      B.jump = 0.1 * Math.abs(Math.sin((t - T_HIT) * 8));
      B.lean = -0.05;
    }
    if (scn.kind === "caught" && t > T_HIT + scn.T + 0.15) {
      B.arms = "up";
      B.armsT = t;
      B.jump = 0.08 * Math.abs(Math.sin(t * 8));
    }
  }

  /* ---------- wicket keeper ---------- */
  {
    if (scn.kind === "beaten") {
      K.arms = "keeper";
      K.armsT = clamp01((t - (T_HIT + 0.05)) / 0.25);
      K.crouch = 0.85 - 0.6 * smooth((since - 0.7) / 0.6);
    } else if (scn.kind === "run" && since > 1.0) {
      K.crouch = 0.85 - 0.6 * smooth((since - 1.0) / 0.6);
      K.arms = "hips";
      K.lean = 0.2;
    } else if (scn.kind === "bowled" && since > 0.3) {
      K.crouch = 0.85 - 0.6 * smooth((since - 0.3) / 0.5);
      K.arms = "up";
      K.armsT = t;
    } else if ((scn.kind === "four" || scn.kind === "six") && since > 0.5) {
      K.crouch = 0.85 - 0.6 * smooth((since - 0.5) / 0.6);
      K.arms = "hips";
      K.lean = 0.2;
    }
    if (scn.kind === "bowled" && since > 0.3) K.jump = 0.06 * Math.abs(Math.sin((t - T_HIT) * 8));
  }

  /* ---------- striker ---------- */
  {
    const ts = T_HIT + scn.swing;
    const g = gammaAt(scn, t);
    const dirA = Math.atan2(scn.dir[1], scn.dir[0]);
    const twTarget = clamp(wrap(dirA - Math.PI), -1.3, 1.3) * 0.8;
    const tw = twTarget * smooth((t - (ts - 0.3)) / 0.4);
    S.twist = tw;
    S.crouch = 0.3 + 0.22 * smooth((t - (ts - 0.3)) / 0.3);
    S.lean = 0.35;
    const target = t < ts + 0.05 ? -Math.PI / 2 : dirA;
    S.look = wrap(target - (Math.PI + tw));
    const geom = batGeom(t < ts - 0.3 ? [0, -1] : scn.dir, g);
    S.arms = "bat";
    S.batH = geom.h;
    S.bat = geom.b;

    const runStart = T_HIT + 0.3;
    const runDur = 1.75;
    const lanes = { s: -0.55, n: 0.55 };

    if (scn.kind === "run" && t >= runStart) {
      carryBat(S);
      S.arms = "swing";
      const sx0 = BAT_X;
      const first = moveTo(S, sx0, BAT_Y, lanes.s, -9.3, t, runStart, runStart + runDur);
      const second =
        scn.runs === 2 ? moveTo(S, lanes.s, -9.3, lanes.s + 1.1, BAT_Y, t, runStart + runDur + 0.2, runStart + 2 * runDur + 0.2) : false;
      if (t > runStart + runDur && scn.runs === 1) {
        S.x = lanes.s;
        S.y = -9.3;
        S.heading = -Math.PI / 2;
        S.arms = "hips";
        S.lean = 0.15;
        S.run = 0;
      }
      if (scn.runs === 2 && t > runStart + runDur && t <= runStart + runDur + 0.2) {
        S.x = lanes.s;
        S.y = -9.3;
        S.run = 0;
        S.arms = "hips";
      }
      if (scn.runs === 2 && t > runStart + 2 * runDur + 0.2) {
        S.x = lanes.s + 1.1;
        S.y = BAT_Y;
        S.run = 0;
        S.arms = "hips";
        S.heading = Math.PI / 2;
      }
      void first;
      void second;
    } else if (scn.kind === "four" && since > 1.2) {
      S.arms = "swing";
      carryBat(S);
      moveTo(S, BAT_X, BAT_Y, 0.4, 3.0, t, T_HIT + 1.2, T_HIT + 3.2);
      if (since > 3.2) {
        S.arms = "up";
        S.armsT = t;
      }
    } else if (scn.kind === "six" && since > 1.6) {
      S.arms = "up";
      S.armsT = t;
      S.bat = unit3([0.2, 0.0, 1]);
      S.twist = 0;
      S.jump = 0.06 * Math.abs(Math.sin(t * 7));
    } else if (scn.kind === "bowled" && since > 0.55) {
      S.arms = "swing";
      carryBat(S);
      S.lean = 0.3;
      S.look = 0.6;
      moveTo(S, BAT_X, BAT_Y, scn.walkOff[0] * 0.3, BAT_Y + 12, t, T_HIT + 0.55, T_HIT + 8, (u) => u);
      S.run = 0.28;
    } else if (scn.kind === "caught" && since > scn.T + 0.15) {
      S.arms = "swing";
      carryBat(S);
      S.lean = 0.3;
      moveTo(S, BAT_X, BAT_Y, scn.walkOff[0] * 0.3, BAT_Y + 12, t, T_HIT + scn.T + 0.15, T_HIT + scn.T + 8, (u) => u);
      S.run = 0.28;
    }
  }

  /* ---------- non-striker ---------- */
  {
    const runStart = T_HIT + 0.3;
    const runDur = 1.75;
    if (scn.kind === "run" && t >= runStart) {
      carryBat(N);
      moveTo(N, NS_X, NS_Y, 0.55, BAT_Y + 0.4, t, runStart, runStart + runDur);
      if (t > runStart + runDur && scn.runs === 1) {
        N.x = 0.55;
        N.y = BAT_Y + 0.4;
        N.heading = Math.PI / 2;
        N.arms = "hips";
        N.run = 0;
        N.lean = 0.15;
      }
      if (scn.runs === 2) {
        const t2 = runStart + runDur + 0.2;
        if (t > runStart + runDur && t <= t2) {
          N.x = 0.55;
          N.y = BAT_Y + 0.4;
          N.run = 0;
          N.arms = "hips";
        }
        if (t > t2) {
          moveTo(N, 0.55, BAT_Y + 0.4, 1.75, NS_Y, t, t2, t2 + runDur);
          if (t > t2 + runDur) {
            N.x = 1.75;
            N.y = NS_Y;
            N.heading = -Math.PI / 2;
            N.arms = "hips";
            N.run = 0;
          }
        }
      }
    } else if (scn.kind === "four" && since > 1.4) {
      carryBat(N);
      moveTo(N, NS_X, NS_Y, 0.9, -3.4, t, T_HIT + 1.4, T_HIT + 3.4);
      if (since > 3.4) {
        N.arms = "up";
        N.armsT = t + 1;
      }
    } else if (scn.kind === "six" && since > 1.8) {
      N.arms = "up";
      N.armsT = t;
      N.jump = 0.05 * Math.abs(Math.sin(t * 7 + 1));
    }
  }

  /* ---------- umpire (bowler's end) ---------- */
  {
    if (scn.kind === "four" && since > scn.ropeT) {
      U1.arms = "wave";
      U1.armsT = t;
    } else if (scn.kind === "six" && since > scn.T * 0.7) {
      U1.arms = "up";
      U1.armsT = t * 0.5;
    } else if (scn.kind === "bowled" && since > 0.5) {
      U1.arms = "finger";
    } else if (scn.kind === "caught" && since > scn.T + 0.25) {
      U1.arms = "finger";
    }
  }

  /* ---------- fielders ---------- */
  const converge = (center: [number, number], startT: number, maxDist: number, exclude: number) => {
    let j = 0;
    const eligible: number[] = [];
    FIELDERS.forEach((p, i) => {
      if (i !== exclude && Math.hypot(p.x - center[0], p.y - center[1]) < maxDist) eligible.push(i);
    });
    eligible.forEach((i) => {
      const F = figs[2 + i];
      const p = FIELDERS[i];
      const ang = (j / Math.max(eligible.length, 1)) * TAU + 0.6;
      const tx = center[0] + Math.cos(ang) * 2.5;
      const ty = center[1] + Math.sin(ang) * 2.5;
      const dur = clamp(Math.hypot(tx - p.x, ty - p.y) / 7.5, 0.8, 2.6);
      const mv = moveTo(F, p.x, p.y, tx, ty, t, startT, startT + dur);
      if (!mv && t >= startT + dur) {
        F.arms = "up";
        F.armsT = t + i;
        F.run = 0;
        F.crouch = 0;
        F.jump = 0.11 * Math.abs(Math.sin(t * 8 + i));
        F.heading = Math.atan2(center[1] - ty, center[0] - tx);
      }
      j++;
    });
    FIELDERS.forEach((p, i) => {
      if (i === exclude || eligible.includes(i)) return;
      const F = figs[2 + i];
      F.arms = "up";
      F.armsT = t + i;
      F.crouch = 0;
      F.lean = 0.05;
      F.jump = 0.08 * Math.abs(Math.sin(t * 7 + i * 1.3));
    });
  };

  if (scn.kind === "run") {
    const i = scn.fielder;
    const F = figs[2 + i];
    const p = FIELDERS[i];
    const tP = T_HIT + scn.tPick;
    const mv = moveTo(F, p.x, p.y, scn.meet[0], scn.meet[1], t, T_HIT + 0.25, tP);
    if (!mv && t >= tP) {
      F.x = scn.meet[0];
      F.y = scn.meet[1];
      const target: [number, number] = scn.runs === 1 ? [0, -10.06] : [0.35, 14.2];
      F.heading = Math.atan2(target[1] - F.y, target[0] - F.x);
      F.run = 0;
      F.crouch = 0.05;
      F.lean = 0.1;
      F.arms = "throw";
      F.armsT = clamp01((t - tP) / 0.5);
    } else if (!mv && t < T_HIT + 0.25) {
      F.arms = "knees";
    }
  } else if (scn.kind === "four") {
    const i = scn.fielder;
    const F = figs[2 + i];
    const p = FIELDERS[i];
    const endT = T_HIT + scn.tPick + 0.4;
    const mv = moveTo(F, p.x, p.y, scn.meet[0], scn.meet[1], t, T_HIT + 0.2, endT);
    if (!mv && t >= endT) {
      F.run = 0;
      F.crouch = 0;
      F.lean = 0.08;
      F.arms = "hips";
    }
  } else if (scn.kind === "six") {
    const i = scn.fielder;
    const F = figs[2 + i];
    const p = FIELDERS[i];
    const tx = p.x + (scn.end[0] - p.x) * 0.12;
    const ty = p.y + (scn.end[1] - p.y) * 0.12;
    const mv = moveTo(F, p.x, p.y, tx, ty, t, T_HIT + 0.3, T_HIT + scn.T - 0.2);
    F.heading = Math.atan2(scn.end[1] - F.y, scn.end[0] - F.x);
    if (!mv) {
      F.run = 0;
      F.crouch = 0;
      F.lean = -0.1;
      F.arms = since > scn.T ? "hips" : "swing";
    }
  } else if (scn.kind === "bowled") {
    converge([0.45, -6.5], T_HIT + 0.45, 40, -1);
  } else if (scn.kind === "caught") {
    const i = scn.fielder;
    const F = figs[2 + i];
    const p = FIELDERS[i];
    const tc = T_HIT + scn.T;
    const mv = moveTo(F, p.x, p.y, scn.end[0], scn.end[1], t, T_HIT + 0.35, tc);
    F.heading = Math.atan2(scn.end[1] - p.y, scn.end[0] - p.x);
    if (!mv && t >= tc - 0.05) {
      F.x = scn.end[0];
      F.y = scn.end[1];
      F.run = 0;
      F.crouch = 0;
      F.lean = -0.08;
      F.arms = "up";
      F.armsT = t;
      F.jump = t > tc + 0.1 ? 0.14 * Math.abs(Math.sin((t - tc) * 7)) : 0;
    } else if (!mv) {
      F.arms = "up";
      F.armsT = 0;
    }
    if (t > tc + 0.25) converge([scn.end[0], scn.end[1]], tc + 0.25, 32, i);
  }

  /* ---------- ball, trail, effects ---------- */
  frame.ball = ballAt(scn, t);
  const trailN = scn.kind === "six" ? 16 : 10;
  const step = scn.kind === "six" ? 0.03 : 0.024;
  if (t > T_RELEASE) {
    for (let k = trailN; k >= 1; k--) {
      const p = ballAt(scn, t - k * step);
      if (p && t - k * step > T_RELEASE) frame.trail.push(p);
    }
  }

  if (since > 0 && since < 0.45) {
    fx.push({
      kind: "ring",
      x: scn.E[0],
      y: scn.E[1],
      z: scn.E[2],
      age: since,
      life: 0.45,
      big: scn.kind === "six" ? 1.6 : scn.kind === "four" ? 1.25 : scn.kind === "bowled" ? 0.7 : 0.9,
    });
  }
  if (scn.kind === "four" && since > scn.ropeT && since < scn.ropeT + 1.5) {
    fx.push({ kind: "rope", x: scn.ropePt[0], y: scn.ropePt[1], z: 0.2, age: since - scn.ropeT, life: 1.5, big: 1 });
  }
  if (scn.kind === "six" && since > scn.T && since < scn.T + 1.3) {
    fx.push({ kind: "flare", x: scn.end[0], y: scn.end[1], z: scn.zEnd, age: since - scn.T, life: 1.3, big: 1 });
  }
  if (scn.kind === "bowled" && since > 0 && since < 1.0) {
    fx.push({ kind: "dust", x: 0, y: 10.06, z: 0.2, age: since, life: 1.0, big: 1 });
  }
  if (scn.kind === "caught" && since > scn.T && since < scn.T + 0.7) {
    fx.push({ kind: "ring", x: scn.end[0], y: scn.end[1], z: 2.2, age: since - scn.T, life: 0.7, big: 0.8 });
  }

  /* crowd excitement */
  frame.flash =
    scn.kind === "six"
      ? 0.4 + 0.6 * smooth(since / 0.5) * (1 - smooth((since - 3.5) / 2))
      : scn.kind === "four"
        ? 0.4 + 0.5 * smooth((since - scn.ropeT + 0.3) / 0.4) * (1 - smooth((since - 3.5) / 2))
        : scn.kind === "bowled" || scn.kind === "caught"
          ? 0.4 + 0.4 * smooth(since / 0.6)
          : 0.4;

  const dir = camAt(scn, t);
  frame.cam = dir.cam;
  frame.camId = dir.camId;
  frame.cut = dir.cut;
  void bounce;
  return frame;
}
