/* ------------------------------------------------------------------ */
/*  Canvas renderer for the stadium broadcast (two cameras)            */
/* ------------------------------------------------------------------ */

import { W, H, project, setCam, groundSquash, type CamId } from "./camera";
import { buildFigure, shade, type Prim, type Shadow } from "./figure";
import type { Frame } from "./sim";

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

type Ctx = CanvasRenderingContext2D;
type Pt2 = [number, number];

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const P = (x: number, y: number, z = 0): Pt2 => {
  const p = project(x, y, z);
  return [p.x, p.y];
};

function circle(r: number, n: number, z = 0): Pt2[] {
  const out: Pt2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    out.push(P(r * Math.cos(a), r * Math.sin(a), z));
  }
  return out;
}

function arc(r: number, a0: number, a1: number, n: number, z = 0): Pt2[] {
  const out: Pt2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push(P(r * Math.cos(a), r * Math.sin(a), z));
  }
  return out;
}

/** turns an arc (right -> left on screen) into a polygon that fills everything below it */
function fillBelow(pts: Pt2[]): Pt2[] {
  const first = pts[0];
  const last = pts[pts.length - 1];
  return [
    ...pts,
    [last[0] - 4000, last[1]],
    [last[0] - 4000, H + 4000],
    [first[0] + 4000, H + 4000],
    [first[0] + 4000, first[1]],
  ];
}

function path(c: Ctx, pts: Pt2[], close = true) {
  c.beginPath();
  pts.forEach((p, i) => (i === 0 ? c.moveTo(p[0], p[1]) : c.lineTo(p[0], p[1])));
  if (close) c.closePath();
}

/* ------------------------------------------------------------------ */
/*  Static background (sky, stands, crowd, boards, floodlights)        */
/* ------------------------------------------------------------------ */

interface Flash {
  x: number;
  y: number;
  phase: number;
  period: number;
}

const CROWD = [
  "#2b62d9",
  "#1d4ed8",
  "#3b82f6",
  "#f5c518",
  "#f59e0b",
  "#e5e7eb",
  "#f8fafc",
  "#dc2626",
  "#16a34a",
  "#111827",
  "#7c3aed",
  "#38bdf8",
  "#1d4ed8",
  "#f5c518",
];
const SKIN = ["#c68a5a", "#8d5a36", "#d9a273", "#a3683f", "#5b3a24"];
const AD = ["#d7263d", "#0b5fff", "#16a34a", "#f59e0b", "#7c3aed", "#0ea5e9", "#e11d48"];

const R_APRON = 72;
const R_BOARD = 67.6;
const TIERS = 9;
const R0 = 72;
const DR = 3.4;
const Z0 = 1.5;
const DZ = 3.0;

function paintBackground(c: Ctx, flashes: Flash[], id: CamId) {
  const rand = mulberry32(id === "wide" ? 90210 : 4711);
  const wide = id === "wide";
  const th0 = (wide ? -30 : 12) * DEG;
  const th1 = (wide ? 330 : 168) * DEG;
  const step = (wide ? 2 : 0.8) * DEG;

  /* sky */
  const sky = c.createLinearGradient(0, 0, 0, 300);
  sky.addColorStop(0, "#02040b");
  sky.addColorStop(0.55, "#0a1330");
  sky.addColorStop(1, "#16264b");
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);

  const glow = c.createRadialGradient(W / 2, 170, 10, W / 2, 170, 520);
  glow.addColorStop(0, "rgba(80,110,200,0.28)");
  glow.addColorStop(1, "rgba(80,110,200,0)");
  c.fillStyle = glow;
  c.fillRect(0, 0, W, 400);

  /* ground apron beyond the rope */
  path(c, wide ? circle(R_APRON, 220) : fillBelow(arc(R_APRON, th0, th1, 80)));
  c.fillStyle = "#0d3f21";
  c.fill();

  /* advertising boards */
  const N = wide ? 96 : 200;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * TAU;
    const a1 = ((i + 1) / N) * TAU;
    if (!wide && (a0 < th0 || a1 > th1)) continue;
    const p0 = P(R_BOARD * Math.cos(a0), R_BOARD * Math.sin(a0), 0);
    const p1 = P(R_BOARD * Math.cos(a1), R_BOARD * Math.sin(a1), 0);
    const p2 = P(R_BOARD * Math.cos(a1), R_BOARD * Math.sin(a1), 1.2);
    const p3 = P(R_BOARD * Math.cos(a0), R_BOARD * Math.sin(a0), 1.2);
    const col = AD[Math.floor((i * (96 / N)) / 4) % AD.length];
    path(c, [p0, p1, p2, p3]);
    c.fillStyle = col;
    c.fill();
    path(c, [p3, p2, [p2[0], p2[1] + 1.2], [p3[0], p3[1] + 1.2]]);
    c.fillStyle = "rgba(255,255,255,0.35)";
    c.fill();
    if (Math.floor(i * (96 / N)) % 4 === 1 && (i * (96 / N)) % 1 < 0.9 && Math.sin(a0) > 0.05) {
      // make the text run left -> right on screen
      const flip = p1[0] < p0[0];
      const bs = flip ? p1 : p0;
      const be = flip ? p0 : p1;
      const ts = flip ? p2 : p3;
      c.save();
      c.transform(be[0] - bs[0], be[1] - bs[1], ts[0] - bs[0], ts[1] - bs[1], bs[0], bs[1]);
      c.font = "800 100px sans-serif";
      const w = c.measureText("9 WICKETS").width;
      c.translate(0.08, 0.24);
      c.scale(0.84 / w, -0.56 / 72);
      c.fillStyle = "rgba(255,255,255,0.92)";
      c.fillText("9 WICKETS", 0, 0);
      c.restore();
    }
  }

  /* sight screen */
  {
    const q: Pt2[] = [P(-9, 69.5, 0), P(9, 69.5, 0), P(9, 69.5, 6.8), P(-9, 69.5, 6.8)];
    const g = c.createLinearGradient(0, q[3][1], 0, q[0][1]);
    g.addColorStop(0, "#f8fafc");
    g.addColorStop(1, "#c7d2e0");
    path(c, q);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = "#64748b";
    c.lineWidth = 1;
    c.stroke();
  }

  /* stands */
  for (let k = TIERS - 1; k >= 0; k--) {
    const r1 = R0 + k * DR;
    const r2 = r1 + DR;
    const z1 = Z0 + k * DZ;
    const z2 = z1 + DZ;
    const poly: Pt2[] = [];
    for (let a = th0; a <= th1; a += step) poly.push(P(r2 * Math.cos(a), r2 * Math.sin(a), z2));
    for (let a = th1; a >= th0; a -= step) poly.push(P(r1 * Math.cos(a), r1 * Math.sin(a), z1));
    path(c, poly);
    const l = 9 + k * 0.7;
    c.fillStyle = `hsl(226,28%,${l}%)`;
    c.fill();

    for (let row = 0; row < 2; row++) {
      const rr = r1 + DR * (row === 0 ? 0.28 : 0.72);
      const zz = z1 + DZ * (row === 0 ? 0.28 : 0.72) + 0.85;
      const dth = (wide ? 0.95 : 0.8) / rr;
      for (let a = th0; a <= th1; a += dth) {
        const jitter = (rand() - 0.5) * dth * 0.6;
        const aa = a + jitter;
        const p = project(rr * Math.cos(aa), rr * Math.sin(aa), zz);
        const bright =
          (0.5 + 0.55 * rand()) *
          (0.7 + 0.3 * Math.sin(((aa - th0) / (th1 - th0)) * Math.PI)) *
          (1.08 - k * 0.035);
        const col = CROWD[Math.floor(rand() * CROWD.length)];
        c.fillStyle = shade(col, bright);
        c.beginPath();
        c.ellipse(p.x, p.y, 0.44 * p.s, 0.5 * p.s, 0, 0, TAU);
        c.fill();
        c.fillStyle = shade(SKIN[Math.floor(rand() * SKIN.length)], bright * 0.9);
        c.beginPath();
        c.arc(p.x, p.y - 0.66 * p.s, 0.21 * p.s, 0, TAU);
        c.fill();
        if (rand() < 0.012 && flashes.length < 34) {
          flashes.push({ x: p.x, y: p.y - 0.4 * p.s, phase: rand() * 6, period: 2.2 + rand() * 3.4 });
        }
      }
    }
  }

  /* roof canopy */
  {
    const poly: Pt2[] = [];
    for (let a = th0; a <= th1; a += step) poly.push(P(99 * Math.cos(a), 99 * Math.sin(a), 25.6));
    for (let a = th1; a >= th0; a -= step) poly.push(P(112 * Math.cos(a), 112 * Math.sin(a), 33));
    path(c, poly);
    c.fillStyle = "#070b16";
    c.fill();
    c.fillStyle = "rgba(255,244,214,0.9)";
    for (let a = th0; a <= th1; a += 1.6 * DEG) {
      const p = project(99 * Math.cos(a), 99 * Math.sin(a), 25.4);
      c.beginPath();
      c.arc(p.x, p.y, Math.max(0.7, 0.14 * p.s), 0, TAU);
      c.fill();
    }
  }

  /* floodlight towers */
  const towers = wide ? [-8, 38, 78, 102, 142, 188] : [38, 78, 102, 142];
  for (const deg of towers) {
    const a = deg * DEG;
    const x = 116 * Math.cos(a);
    const y = 116 * Math.sin(a);
    const base = project(x, y, 0);
    const top = project(x, y, 48);
    if (top.y < -260) continue;
    c.strokeStyle = "#0b1020";
    c.lineWidth = Math.max(1.5, 0.9 * top.s);
    c.beginPath();
    c.moveTo(base.x, base.y);
    c.lineTo(top.x, top.y);
    c.stroke();
    const hw = 11 * top.s;
    const hh = 6 * top.s;
    c.fillStyle = "#1a2236";
    c.fillRect(top.x - hw / 2, top.y - hh / 2, hw, hh);
    c.fillStyle = "#fff8e0";
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        c.beginPath();
        c.arc(top.x - hw / 2 + (hw / 6) * (i + 0.5), top.y - hh / 2 + (hh / 3) * (j + 0.5), Math.max(0.9, hw / 16), 0, TAU);
        c.fill();
      }
    }
    c.globalCompositeOperation = "lighter";
    const gr = wide ? 120 : 200;
    const rg = c.createRadialGradient(top.x, top.y, 2, top.x, top.y, gr);
    rg.addColorStop(0, "rgba(255,246,220,0.85)");
    rg.addColorStop(0.25, "rgba(255,236,190,0.28)");
    rg.addColorStop(1, "rgba(255,236,190,0)");
    c.fillStyle = rg;
    c.fillRect(top.x - gr - 10, top.y - gr - 10, gr * 2 + 20, gr * 2 + 20);
    c.globalCompositeOperation = "source-over";
  }

  /* haze over the stands for depth */
  const hy0 = wide ? 120 : 0;
  const hy1 = wide ? 290 : 230;
  const haze = c.createLinearGradient(0, hy0, 0, hy1);
  haze.addColorStop(0, "rgba(10,20,50,0.35)");
  haze.addColorStop(1, "rgba(10,20,50,0)");
  c.fillStyle = haze;
  c.fillRect(0, hy0, W, hy1 - hy0);
}

/* ------------------------------------------------------------------ */
/*  Field geometry (projected once per camera)                         */
/* ------------------------------------------------------------------ */

interface Geo {
  grass: Pt2[];
  rope: Pt2[];
  ropeClosed: boolean;
  ring30: Pt2[];
  stripes: Pt2[][];
  pitch: Pt2[];
  worn: Pt2[][];
  lines: [Pt2, Pt2][];
  lightC: Pt2;
  lightR: number;
  pitchTop: Pt2;
  pitchBottom: Pt2;
}

function buildGeo(id: CamId): Geo {
  const wide = id === "wide";
  const a0 = 12 * DEG;
  const a1 = 168 * DEG;
  const stripes: Pt2[][] = [];
  const y0 = wide ? -70 : -40;
  for (let y = y0, i = 0; y < 70; y += 6, i++) {
    if (i % 2 === 0) stripes.push([P(-72, y), P(72, y), P(72, y + 6), P(-72, y + 6)]);
  }
  const wornCircle = (cx: number, cy: number, r: number): Pt2[] => {
    const pts: Pt2[] = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU;
      pts.push(P(cx + r * 0.75 * Math.cos(a), cy + r * Math.sin(a)));
    }
    return pts;
  };
  const lines: [Pt2, Pt2][] = [];
  for (const s of [1, -1]) {
    lines.push([P(-1.32, s * 8.84), P(1.32, s * 8.84)]);
    lines.push([P(-1.32, s * 10.06), P(1.32, s * 10.06)]);
    lines.push([P(-1.32, s * 8.84), P(-1.32, s * 11.3)]);
    lines.push([P(1.32, s * 8.84), P(1.32, s * 11.3)]);
  }
  return {
    grass: wide ? circle(65, 200) : fillBelow(arc(65, a0, a1, 90)),
    rope: wide ? circle(65, 240) : arc(65, a0, a1, 120),
    ropeClosed: wide,
    ring30: circle(27.4, 120),
    stripes,
    pitch: [P(-1.55, -12), P(1.55, -12), P(1.55, 12), P(-1.55, 12)],
    worn: [wornCircle(0, -8.6, 1.5), wornCircle(0, 8.4, 1.6), wornCircle(0, 4.2, 1.2), wornCircle(0, -4.2, 1.1)],
    lines,
    lightC: P(0, 4, 0),
    lightR: wide ? 470 : 1100,
    pitchTop: P(0, 12),
    pitchBottom: P(0, -12),
  };
}

/* ------------------------------------------------------------------ */
/*  Stage                                                              */
/* ------------------------------------------------------------------ */

interface Assets {
  bg: HTMLCanvasElement;
  geo: Geo;
  flashes: Flash[];
}

export class Stage {
  private assets = {} as Record<CamId, Assets>;
  private noise: CanvasPattern | null = null;

  constructor() {
    for (const id of ["wide", "main"] as CamId[]) {
      setCam(id);
      const bg = document.createElement("canvas");
      bg.width = W * 2;
      bg.height = H * 2;
      const flashes: Flash[] = [];
      const c = bg.getContext("2d");
      if (c) {
        c.scale(2, 2);
        paintBackground(c, flashes, id);
      }
      this.assets[id] = { bg, geo: buildGeo(id), flashes };
    }
    setCam("wide");

    const n = document.createElement("canvas");
    n.width = 160;
    n.height = 160;
    const nc = n.getContext("2d");
    if (nc) {
      const r = mulberry32(7);
      for (let i = 0; i < 1500; i++) {
        nc.fillStyle = r() > 0.5 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.10)";
        nc.fillRect(r() * 160, r() * 160, 1 + r() * 1.5, 1 + r() * 1.5);
      }
      this.noise = nc.createPattern(n, "repeat");
    }
  }

  draw(ctx: Ctx, frame: Frame, wall: number) {
    setCam(frame.camId);
    const A = this.assets[frame.camId];
    const g = A.geo;
    const cam = frame.cam;
    const z = cam.zoom;
    const tx = clamp(W / 2 - cam.x * z, W - W * z, 0);
    const ty = clamp(H / 2 - cam.y * z, H - H * z, 0);
    const shx = cam.shake ? (Math.random() - 0.5) * cam.shake * 2 : 0;
    const shy = cam.shake ? (Math.random() - 0.5) * cam.shake * 2 : 0;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#03050b";
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(z, 0, 0, z, tx + shx, ty + shy);

    /* background stadium */
    const vx = -tx / z;
    const vy = -ty / z;
    ctx.drawImage(A.bg, vx * 2, vy * 2, (W / z) * 2, (H / z) * 2, vx, vy, W / z, H / z);

    /* ---------- grass ---------- */
    ctx.save();
    path(ctx, g.grass);
    ctx.fillStyle = "#1c6a35";
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = "rgba(112,210,120,0.11)";
    for (const s of g.stripes) {
      path(ctx, s);
      ctx.fill();
    }
    if (this.noise) {
      this.noise.setTransform(new DOMMatrix().scale(1 / z));
      ctx.fillStyle = this.noise;
      ctx.fillRect(-W, -H, W * 3, H * 3);
    }
    const lc = g.lightC;
    const light = ctx.createRadialGradient(lc[0], lc[1] - 10, 20, lc[0], lc[1], g.lightR);
    light.addColorStop(0, "rgba(255,255,210,0.16)");
    light.addColorStop(0.55, "rgba(0,0,0,0)");
    light.addColorStop(1, "rgba(0,8,14,0.5)");
    ctx.fillStyle = light;
    ctx.fillRect(-W, -H, W * 3, H * 3);

    /* 30-yard circle */
    path(ctx, g.ring30);
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = Math.max(0.8, 0.09 * project(0, 27, 0).s);
    ctx.setLineDash([5, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    /* pitch */
    const pg = ctx.createLinearGradient(0, g.pitchTop[1], 0, g.pitchBottom[1]);
    pg.addColorStop(0, "#b99b68");
    pg.addColorStop(0.5, "#d3b988");
    pg.addColorStop(1, "#bb9c68");
    path(ctx, g.pitch);
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.fillStyle = "rgba(110,80,40,0.2)";
    for (const w of g.worn) {
      path(ctx, w);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = Math.max(0.7, 0.06 * project(0, 0, 0).s);
    for (const [a, b] of g.lines) {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    ctx.restore();

    /* boundary rope */
    path(ctx, g.rope, g.ropeClosed);
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = Math.max(1.4, 0.32 * project(0, 65, 0).s);
    ctx.stroke();

    /* ---------- scene objects ---------- */
    const prims: Prim[] = [];
    const shadows: Shadow[] = [];
    const minW = 1.0 / z;
    for (const f of frame.figs) buildFigure(f, prims, shadows, minW);
    for (const s of frame.stumps) {
      const a = project(s.a[0], s.a[1], s.a[2]);
      const b = project(s.b[0], s.b[1], s.b[2]);
      prims.push({
        kind: 0,
        ax: a.x,
        ay: a.y,
        bx: b.x,
        by: b.y,
        w: Math.max(s.r * 2 * (a.s + b.s) * 0.5, minW),
        color: s.color,
        edge: "#8a8574",
        d: (a.d + b.d) / 2 - 0.4,
      });
    }
    prims.sort((p, q) => q.d - p.d);

    ctx.fillStyle = "rgba(0,0,0,0.34)";
    for (const s of shadows) {
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, TAU);
      ctx.fill();
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const e = 0.9 / z;
    for (const p of prims) {
      if (p.kind === 0) {
        ctx.beginPath();
        ctx.moveTo(p.ax, p.ay);
        ctx.lineTo(p.bx, p.by);
        ctx.strokeStyle = p.edge;
        ctx.lineWidth = p.w + e * 2;
        ctx.stroke();
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.w;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.ax, p.ay, p.w / 2, 0, TAU);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.lineWidth = e;
        ctx.strokeStyle = p.edge;
        ctx.stroke();
      }
    }

    /* ---------- ball ---------- */
    this.drawBall(ctx, frame, z);

    /* ---------- effects ---------- */
    this.drawFx(ctx, frame, z);
    this.drawFlashes(ctx, A.flashes, frame.flash, wall);

    /* ---------- post ---------- */
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const vg = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.4, W / 2, H * 0.5, W * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    /* camera cut: quick dip to black */
    if (frame.cut < 0.2) {
      ctx.fillStyle = `rgba(0,0,0,${(1 - frame.cut / 0.2) * 0.8})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  private drawBall(ctx: Ctx, frame: Frame, z: number) {
    const b = frame.ball;
    if (!b) return;

    /* trail */
    const tr = frame.trail;
    if (tr.length > 1) {
      const pts = tr.map((p) => project(p[0], p[1], p[2]));
      const last = project(b[0], b[1], b[2]);
      pts.push(last);
      for (let i = 1; i < pts.length; i++) {
        const u = i / pts.length;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.strokeStyle = `rgba(255,120,90,${0.16 * u})`;
        ctx.lineWidth = (3.6 * u + 1) / z + 2;
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${0.7 * u})`;
        ctx.lineWidth = (1.7 * u + 0.4) / z;
        ctx.stroke();
      }
    }

    const p = project(b[0], b[1], b[2]);
    const r = Math.max(0.13 * p.s, 2.8 / z);

    /* ground shadow gives the height */
    if (b[2] > 0.12) {
      const sp = project(b[0], b[1], 0);
      ctx.fillStyle = `rgba(0,0,0,${0.42 / (1 + b[2] * 0.07)})`;
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, r * 1.25, r * 1.25 * groundSquash(), 0, 0, TAU);
      ctx.fill();
    }

    const gl = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
    gl.addColorStop(0, "rgba(255,255,255,0.65)");
    gl.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 4, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "#e11d2a";
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath();
    ctx.arc(p.x - r * 0.3, p.y - r * 0.3, r * 0.38, 0, TAU);
    ctx.fill();
  }

  private drawFx(ctx: Ctx, frame: Frame, z: number) {
    for (const f of frame.fx) {
      const u = clamp(f.age / f.life, 0, 1);
      const p = project(f.x, f.y, f.z);
      if (f.kind === "ring") {
        const rad = (0.5 + 3.6 * u * f.big) * p.s;
        ctx.strokeStyle = `rgba(255,255,255,${(1 - u) * 0.9})`;
        ctx.lineWidth = 2.2 / z;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, TAU);
        ctx.stroke();
        if (u < 0.5) {
          ctx.fillStyle = `rgba(255,240,200,${(0.5 - u) * 1.4})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, (0.5 + 1.2 * f.big) * p.s * (1 - u), 0, TAU);
          ctx.fill();
        }
      } else if (f.kind === "flare") {
        ctx.globalCompositeOperation = "lighter";
        const rad = (5 + 26 * u) * p.s;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
        g.addColorStop(0, `rgba(255,240,170,${(1 - u) * 0.95})`);
        g.addColorStop(0.35, `rgba(255,170,70,${(1 - u) * 0.45})`);
        g.addColorStop(1, "rgba(255,120,40,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      } else if (f.kind === "rope") {
        const a = Math.atan2(f.y, f.x);
        const span = 8 / 65;
        const pts: Pt2[] = [];
        for (let i = 0; i <= 14; i++) {
          const aa = a - span + (i / 14) * span * 2;
          pts.push(P(65 * Math.cos(aa), 65 * Math.sin(aa), 0.15));
        }
        const al = (1 - u) * (0.65 + 0.35 * Math.sin(f.age * 24));
        path(ctx, pts, false);
        ctx.strokeStyle = `rgba(255,220,90,${al * 0.5})`;
        ctx.lineWidth = 9 / z;
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,230,${al})`;
        ctx.lineWidth = 3 / z;
        ctx.stroke();
      } else {
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU;
          const q = project(f.x + Math.cos(a) * u * 2.6, f.y + Math.sin(a) * u * 2.6, f.z + u * 1.4);
          ctx.fillStyle = `rgba(214,194,152,${(1 - u) * 0.4})`;
          ctx.beginPath();
          ctx.arc(q.x, q.y, (0.3 + u * 1.0) * q.s, 0, TAU);
          ctx.fill();
        }
      }
    }
  }

  private drawFlashes(ctx: Ctx, flashes: Flash[], intensity: number, wall: number) {
    ctx.globalCompositeOperation = "lighter";
    const rate = 0.6 + intensity * 2.6;
    for (const f of flashes) {
      const ph = (wall * rate + f.phase) % f.period;
      if (ph > 0.14) continue;
      const a = 1 - ph / 0.14;
      const r = 5 + 5 * a;
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }
}
