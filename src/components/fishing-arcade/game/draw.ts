import { CANNON, H, W, type Species } from "./config";

const TAU = Math.PI * 2;

type Ctx = CanvasRenderingContext2D;

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

function lin(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, c1: string, c2: string) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  return g;
}

/* ------------------------------------------------------------------ */
/*  Background                                                         */
/* ------------------------------------------------------------------ */

function branch(
  g: Ctx,
  rand: () => number,
  x: number,
  y: number,
  ang: number,
  len: number,
  wd: number,
  depth: number,
  color: string,
  tip: string,
) {
  if (depth <= 0 || len < 5) {
    g.fillStyle = tip;
    g.beginPath();
    g.arc(x, y, Math.max(2.5, wd * 0.9), 0, TAU);
    g.fill();
    return;
  }
  const x2 = x + Math.cos(ang) * len;
  const y2 = y + Math.sin(ang) * len;
  g.strokeStyle = color;
  g.lineWidth = wd;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x2, y2);
  g.stroke();
  branch(g, rand, x2, y2, ang - 0.4 - rand() * 0.25, len * 0.76, wd * 0.72, depth - 1, color, tip);
  branch(g, rand, x2, y2, ang + 0.4 + rand() * 0.25, len * 0.76, wd * 0.72, depth - 1, color, tip);
}

function rock(g: Ctx, x: number, y: number, w: number, h: number, c1: string, c2: string) {
  g.beginPath();
  g.moveTo(x - w / 2, y);
  g.bezierCurveTo(x - w * 0.5, y - h * 0.9, x - w * 0.15, y - h * 1.1, x + w * 0.05, y - h);
  g.bezierCurveTo(x + w * 0.35, y - h * 1.05, x + w * 0.52, y - h * 0.5, x + w / 2, y);
  g.closePath();
  g.fillStyle = lin(g, x, y - h, x, y, c1, c2);
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.25)";
  g.lineWidth = 2;
  g.stroke();
}

function starfish(g: Ctx, x: number, y: number, r: number, color: string) {
  g.save();
  g.translate(x, y);
  g.fillStyle = color;
  g.strokeStyle = "rgba(0,0,0,0.25)";
  g.lineWidth = 1.5;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

export function makeBackground(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const rand = mulberry32(7);

  // water
  g.fillStyle = lin(g, 0, 0, 0, H, "#43d0ee", "#06295a");
  const water = g.createLinearGradient(0, 0, 0, H);
  water.addColorStop(0, "#47d3f0");
  water.addColorStop(0.3, "#1c9ad2");
  water.addColorStop(0.65, "#0e5ea6");
  water.addColorStop(1, "#06295a");
  g.fillStyle = water;
  g.fillRect(0, 0, W, H);

  // sun glow
  const glow = g.createRadialGradient(W * 0.5, -120, 30, W * 0.5, -120, 760);
  glow.addColorStop(0, "rgba(220,255,255,0.7)");
  glow.addColorStop(1, "rgba(220,255,255,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  // far reef silhouette
  g.fillStyle = "rgba(9,78,140,0.55)";
  g.beginPath();
  g.moveTo(0, H);
  g.lineTo(0, 520);
  g.bezierCurveTo(120, 470, 200, 560, 330, 520);
  g.bezierCurveTo(460, 480, 520, 560, 650, 535);
  g.bezierCurveTo(800, 500, 860, 570, 980, 520);
  g.bezierCurveTo(1100, 470, 1180, 540, W, 500);
  g.lineTo(W, H);
  g.closePath();
  g.fill();

  // far corals (blurry)
  for (let i = 0; i < 9; i++) {
    const x = 60 + i * 150 + rand() * 60;
    branch(g, rand, x, 600, -Math.PI / 2 + (rand() - 0.5) * 0.4, 46 + rand() * 24, 9, 4, "rgba(20,110,170,0.5)", "rgba(40,140,200,0.5)");
  }

  // mid reef
  g.fillStyle = "rgba(6,52,108,0.8)";
  g.beginPath();
  g.moveTo(0, H);
  g.lineTo(0, 600);
  g.bezierCurveTo(160, 570, 280, 630, 430, 600);
  g.bezierCurveTo(600, 570, 700, 640, 860, 605);
  g.bezierCurveTo(1000, 575, 1120, 630, W, 590);
  g.lineTo(W, H);
  g.closePath();
  g.fill();

  // rocks
  rock(g, 90, 676, 190, 110, "#5b6f8a", "#2a3a56");
  rock(g, 190, 686, 120, 70, "#6c82a0", "#33466a");
  rock(g, 1180, 680, 210, 120, "#5b6f8a", "#2a3a56");
  rock(g, 1070, 690, 110, 60, "#6c82a0", "#33466a");

  // sand floor
  const sand = g.createLinearGradient(0, 650, 0, H);
  sand.addColorStop(0, "#f3d79a");
  sand.addColorStop(1, "#b98c50");
  g.fillStyle = sand;
  g.beginPath();
  g.moveTo(0, H);
  g.lineTo(0, 684);
  g.bezierCurveTo(220, 664, 420, 700, 640, 680);
  g.bezierCurveTo(860, 662, 1060, 700, W, 676);
  g.lineTo(W, H);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(255,255,255,0.35)";
  g.lineWidth = 3;
  g.stroke();

  // pebbles
  for (let i = 0; i < 46; i++) {
    const x = rand() * W;
    const y = 700 + rand() * 18;
    g.fillStyle = `rgba(${120 + rand() * 60},${90 + rand() * 40},${50 + rand() * 30},0.5)`;
    g.beginPath();
    g.ellipse(x, y, 3 + rand() * 6, 2 + rand() * 3, 0, 0, TAU);
    g.fill();
  }

  // foreground corals left / right
  const coralColors: [string, string][] = [
    ["#ff5c8a", "#ffb3c8"],
    ["#ff9a3c", "#ffd29a"],
    ["#b05cff", "#e0b8ff"],
    ["#ff6a4a", "#ffc0a8"],
  ];
  const place = (x: number, ci: number, sc: number) => {
    const [c1, c2] = coralColors[ci % coralColors.length];
    branch(g, rand, x, 700, -Math.PI / 2 + (rand() - 0.5) * 0.3, 52 * sc, 11 * sc, 5, c1, c2);
  };
  place(30, 0, 1.2);
  place(130, 1, 1);
  place(255, 2, 0.9);
  place(360, 3, 0.7);
  place(W - 40, 2, 1.25);
  place(W - 150, 0, 1);
  place(W - 270, 1, 0.9);
  place(W - 380, 3, 0.7);

  starfish(g, 300, 708, 15, "#ff8a5c");
  starfish(g, W - 330, 706, 13, "#ffb04a");
  starfish(g, 560, 706, 10, "#ff6a8a");

  return c;
}

export function makeVignette(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.75);
  v.addColorStop(0, "rgba(0,10,40,0)");
  v.addColorStop(1, "rgba(0,10,40,0.55)");
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
  return c;
}

export function drawRays(ctx: Ctx, t: number) {
  ctx.save();
  for (let i = 0; i < 7; i++) {
    const x0 = -60 + i * 215 + Math.sin(t * 0.35 + i * 1.7) * 50;
    const wTop = 60 + (i % 3) * 25;
    const grad = ctx.createLinearGradient(0, 0, 0, H * 0.9);
    const a = 0.09 + 0.05 * Math.sin(t * 0.6 + i);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0 + wTop, 0);
    ctx.lineTo(x0 + wTop + 200, H * 0.9);
    ctx.lineTo(x0 + 40, H * 0.9);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

const WEEDS = [
  { x: 250, h: 120, c: "#2fae5c", p: 0 },
  { x: 275, h: 90, c: "#3cc96b", p: 1.2 },
  { x: 420, h: 100, c: "#2fae5c", p: 2.1 },
  { x: 880, h: 105, c: "#3cc96b", p: 0.7 },
  { x: 905, h: 80, c: "#2fae5c", p: 2.9 },
  { x: 1010, h: 125, c: "#2fae5c", p: 1.6 },
];

export function drawSeaweed(ctx: Ctx, t: number) {
  ctx.save();
  ctx.lineCap = "round";
  for (const s of WEEDS) {
    const sway = Math.sin(t * 1.3 + s.p) * 16;
    const base = 700;
    ctx.strokeStyle = s.c;
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(s.x, base);
    ctx.bezierCurveTo(s.x - sway * 0.6, base - s.h * 0.35, s.x + sway * 0.9, base - s.h * 0.7, s.x + sway * 0.3, base - s.h);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(s.x - 2, base);
    ctx.bezierCurveTo(s.x - sway * 0.6 - 2, base - s.h * 0.35, s.x + sway * 0.9 - 2, base - s.h * 0.7, s.x + sway * 0.3 - 2, base - s.h);
    ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  Fish                                                               */
/* ------------------------------------------------------------------ */

export interface FishView {
  sp: Species;
  x: number;
  y: number;
  dir: 1 | -1;
  tilt: number;
  phase: number;
  flash: number;
  alpha: number;
  spin: number;
  dying: boolean;
}

function drawEye(ctx: Ctx, x: number, y: number, r: number) {
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(x + r * 0.22, y, r * 0.62, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x + r * 0.38, y - r * 0.25, r * 0.25, 0, TAU);
  ctx.fill();
}

const OUTLINE = "rgba(0,0,0,0.35)";

function drawGeneric(ctx: Ctx, sp: Species, t: number, ph: number) {
  const w = sp.w;
  const h = sp.h;
  const golden = sp.kind === "golden";
  const wag = Math.sin(t * (golden ? 6 : 9) + ph) * 0.3;
  const tk = golden ? 1.45 : 1;

  // tail
  ctx.save();
  ctx.translate(-w * 0.2, 0);
  ctx.rotate(wag);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-w * 0.1 * tk, -h * 0.12, -w * 0.3 * tk, -h * 0.46 * tk);
  ctx.quadraticCurveTo(-w * 0.2 * tk, 0, -w * 0.3 * tk, h * 0.46 * tk);
  ctx.quadraticCurveTo(-w * 0.1 * tk, h * 0.12, 0, 0);
  ctx.closePath();
  ctx.fillStyle = golden ? lin(ctx, 0, 0, -w * 0.4, 0, "#ff9a1a", "#ff4a1a") : sp.accent;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.restore();

  // dorsal fin
  ctx.beginPath();
  ctx.moveTo(-w * 0.14, -h * 0.4);
  ctx.quadraticCurveTo(w * 0.04, -h * (golden ? 1 : 0.86), w * 0.24, -h * 0.4);
  ctx.closePath();
  ctx.fillStyle = golden ? "#ff7a1a" : sp.accent;
  ctx.fill();
  ctx.stroke();

  // bottom fin
  ctx.beginPath();
  ctx.moveTo(-w * 0.02, h * 0.42);
  ctx.quadraticCurveTo(w * 0.03, h * 0.74, w * 0.16, h * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (golden) {
    // horns
    ctx.fillStyle = "#ff6a1a";
    ctx.beginPath();
    ctx.moveTo(w * 0.22, -h * 0.44);
    ctx.lineTo(w * 0.17, -h * 0.78);
    ctx.lineTo(w * 0.33, -h * 0.46);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // body
  ctx.beginPath();
  ctx.ellipse(w * 0.08, 0, w * 0.38, h * 0.5, 0, 0, TAU);
  ctx.fillStyle = lin(ctx, 0, -h * 0.5, 0, h * 0.5, sp.c1, sp.c2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();

  ctx.save();
  ctx.clip();
  if (sp.id === "clown") {
    const band = (x: number, wd: number) => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(x, -h * 0.6, wd, h * 1.2);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x - 2, -h * 0.6, 2, h * 1.2);
      ctx.fillRect(x + wd, -h * 0.6, 2, h * 1.2);
    };
    band(w * 0.2, w * 0.08);
    band(-w * 0.12, w * 0.07);
  } else if (sp.id === "tang") {
    ctx.strokeStyle = "#071a6e";
    ctx.lineWidth = h * 0.2;
    ctx.beginPath();
    ctx.moveTo(-w * 0.28, -h * 0.05);
    ctx.quadraticCurveTo(w * 0.05, -h * 0.5, w * 0.3, -h * 0.02);
    ctx.quadraticCurveTo(w * 0.1, h * 0.15, -w * 0.05, h * 0.05);
    ctx.stroke();
  } else if (golden) {
    ctx.strokeStyle = "rgba(170,80,0,0.4)";
    ctx.lineWidth = 1.6;
    for (let i = -3; i <= 4; i++) {
      for (let j = -2; j <= 2; j++) {
        const cx = i * w * 0.09 + (j % 2 ? w * 0.045 : 0);
        const cy = j * h * 0.2;
        ctx.beginPath();
        ctx.arc(cx, cy, w * 0.06, Math.PI * 0.5, Math.PI * 1.5);
        ctx.stroke();
      }
    }
  }
  // top shine
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.ellipse(w * 0.1, -h * 0.25, w * 0.28, h * 0.14, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // gill
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(w * 0.16, 0, h * 0.4, Math.PI * 0.62, Math.PI * 1.38);
  ctx.stroke();

  // pectoral fin
  ctx.save();
  ctx.translate(w * 0.1, h * 0.1);
  ctx.rotate(0.5 + Math.sin(t * 7 + ph) * 0.3);
  ctx.beginPath();
  ctx.ellipse(-w * 0.06, 0, w * 0.1, h * 0.1, 0, 0, TAU);
  ctx.fillStyle = golden ? "#ffb02a" : sp.accent;
  ctx.globalAlpha *= 0.9;
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  if (golden) {
    // whiskers
    ctx.strokeStyle = "#ffd34d";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(w * 0.45, h * 0.06);
      ctx.quadraticCurveTo(w * 0.58, h * (0.1 + s * 0.2) + Math.sin(t * 4 + ph) * 4, w * 0.66, h * (0.05 + s * 0.28) + Math.sin(t * 4 + ph + 1) * 6);
      ctx.stroke();
    }
  }

  // eye + mouth
  drawEye(ctx, w * 0.3, -h * 0.1, Math.max(5, h * (golden ? 0.12 : 0.15)));
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.46, h * 0.07);
  ctx.quadraticCurveTo(w * 0.42, h * 0.12, w * 0.37, h * 0.1);
  ctx.stroke();
}

function drawPuffer(ctx: Ctx, sp: Species, t: number, ph: number) {
  const r = sp.h * 0.42;
  const infl = 1 + Math.sin(t * 3 + ph) * 0.05;
  ctx.save();
  ctx.scale(infl, infl);

  const wag = Math.sin(t * 10 + ph) * 0.35;
  ctx.save();
  ctx.translate(-r * 0.85, 0);
  ctx.rotate(wag);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-r * 0.7, -r * 0.5);
  ctx.quadraticCurveTo(-r * 0.45, 0, -r * 0.7, r * 0.5);
  ctx.closePath();
  ctx.fillStyle = sp.accent;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.restore();

  // spikes
  ctx.fillStyle = "#a8701a";
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - 0.12) * r * 0.95, Math.sin(a - 0.12) * r * 0.95);
    ctx.lineTo(Math.cos(a) * r * 1.28, Math.sin(a) * r * 1.28);
    ctx.lineTo(Math.cos(a + 0.12) * r * 0.95, Math.sin(a + 0.12) * r * 0.95);
    ctx.closePath();
    ctx.fill();
  }

  // body
  const rg = ctx.createRadialGradient(-r * 0.2, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
  rg.addColorStop(0, "#fff3a0");
  rg.addColorStop(0.55, sp.c1);
  rg.addColorStop(1, sp.c2);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = rg;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();

  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#fff6d6";
  ctx.beginPath();
  ctx.ellipse(r * 0.1, r * 0.75, r * 0.9, r * 0.5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(140,80,10,0.5)";
  for (const [dx, dy, rr] of [
    [-0.3, -0.5, 0.11],
    [0.05, -0.62, 0.09],
    [-0.55, -0.15, 0.08],
    [-0.1, -0.25, 0.07],
    [0.3, -0.45, 0.06],
  ]) {
    ctx.beginPath();
    ctx.arc(dx * r, dy * r, rr * r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // fin
  ctx.save();
  ctx.translate(-r * 0.05, r * 0.25);
  ctx.rotate(0.4 + Math.sin(t * 9 + ph) * 0.4);
  ctx.beginPath();
  ctx.ellipse(-r * 0.15, 0, r * 0.28, r * 0.15, 0, 0, TAU);
  ctx.fillStyle = sp.accent;
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // mouth + cheeks
  ctx.fillStyle = "#d4563a";
  ctx.beginPath();
  ctx.ellipse(r * 0.98, r * 0.18, r * 0.12, r * 0.09, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,120,120,0.45)";
  ctx.beginPath();
  ctx.arc(r * 0.5, r * 0.28, r * 0.13, 0, TAU);
  ctx.fill();
  drawEye(ctx, r * 0.5, -r * 0.18, r * 0.24);
  ctx.restore();
}

function drawJelly(ctx: Ctx, sp: Species, t: number, ph: number) {
  const w = sp.w;
  const h = sp.h;
  const pulse = Math.sin(t * 3 + ph);
  const rx = w * 0.45 * (1 - pulse * 0.06);
  const ry = h * 0.32 * (1 + pulse * 0.1);
  const topY = -h * 0.14;

  // glow
  const gl = ctx.createRadialGradient(0, topY, 4, 0, topY, w * 0.8);
  gl.addColorStop(0, "rgba(255,160,240,0.4)");
  gl.addColorStop(1, "rgba(255,160,240,0)");
  ctx.fillStyle = gl;
  ctx.beginPath();
  ctx.arc(0, topY, w * 0.8, 0, TAU);
  ctx.fill();

  // tentacles
  ctx.lineCap = "round";
  for (let i = 0; i < 7; i++) {
    const x0 = -rx * 0.8 + (i * rx * 1.6) / 6;
    ctx.strokeStyle = i % 2 ? "rgba(255,196,242,0.8)" : "rgba(214,150,255,0.8)";
    ctx.lineWidth = i % 2 ? 3 : 4;
    ctx.beginPath();
    ctx.moveTo(x0, topY);
    const len = h * (i % 2 ? 0.55 : 0.7);
    for (let s = 1; s <= 8; s++) {
      const k = s / 8;
      ctx.lineTo(x0 + Math.sin(t * 4 + ph + i + s * 0.8) * 6 * k, topY + k * len);
    }
    ctx.stroke();
  }

  // dome
  ctx.beginPath();
  ctx.moveTo(-rx, topY);
  ctx.ellipse(0, topY, rx, ry, 0, Math.PI, TAU);
  const n = 7;
  for (let k = 0; k < n; k++) {
    const xs = rx - (k * 2 * rx) / n;
    const xe = xs - (2 * rx) / n;
    ctx.quadraticCurveTo((xs + xe) / 2, topY + ry * 0.4, xe, topY);
  }
  ctx.closePath();
  const dg = ctx.createLinearGradient(0, topY - ry, 0, topY + ry * 0.4);
  dg.addColorStop(0, "rgba(255,160,235,0.95)");
  dg.addColorStop(1, "rgba(150,80,255,0.8)");
  ctx.fillStyle = dg;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.ellipse(-rx * 0.3, topY - ry * 0.55, rx * 0.35, ry * 0.18, -0.3, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  for (const [dx, dy] of [
    [0.2, -0.3],
    [0.45, -0.1],
    [-0.1, -0.15],
    [0.05, -0.55],
  ]) {
    ctx.beginPath();
    ctx.arc(rx * dx, topY + ry * dy, 3.5, 0, TAU);
    ctx.fill();
  }
  // eyes
  ctx.fillStyle = "#3b1466";
  ctx.beginPath();
  ctx.arc(-rx * 0.28, topY - ry * 0.05, 4, 0, TAU);
  ctx.arc(rx * 0.28, topY - ry * 0.05, 4, 0, TAU);
  ctx.fill();
}

function drawTurtle(ctx: Ctx, sp: Species, t: number, ph: number) {
  const w = sp.w;
  const h = sp.h;
  const flap = Math.sin(t * 3.2 + ph);
  const dark = "#2a8f48";

  // back flipper
  ctx.save();
  ctx.translate(-w * 0.2, h * 0.14);
  ctx.rotate(0.7 + flap * 0.3);
  ctx.beginPath();
  ctx.ellipse(-w * 0.07, 0, w * 0.11, h * 0.06, 0, 0, TAU);
  ctx.fillStyle = dark;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.restore();

  // tail
  ctx.beginPath();
  ctx.moveTo(-w * 0.28, -h * 0.02);
  ctx.lineTo(-w * 0.42, h * 0.04);
  ctx.lineTo(-w * 0.28, h * 0.08);
  ctx.closePath();
  ctx.fillStyle = dark;
  ctx.fill();

  // far flipper
  ctx.save();
  ctx.translate(w * 0.15, -h * 0.16);
  ctx.rotate(-0.9 - flap * 0.45);
  ctx.beginPath();
  ctx.ellipse(w * 0.1, 0, w * 0.17, h * 0.065, 0, 0, TAU);
  ctx.fillStyle = dark;
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // neck + head
  ctx.fillStyle = "#9bdc6a";
  ctx.beginPath();
  ctx.ellipse(w * 0.3, -h * 0.02, w * 0.1, h * 0.09, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w * 0.4, -h * 0.04, h * 0.17, h * 0.14, 0, 0, TAU);
  ctx.fillStyle = lin(ctx, 0, -h * 0.2, 0, h * 0.1, "#b6ec7a", "#6fc24a");
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  drawEye(ctx, w * 0.45, -h * 0.08, h * 0.05);
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, -h * 0.01);
  ctx.quadraticCurveTo(w * 0.46, h * 0.03, w * 0.42, h * 0.02);
  ctx.stroke();

  // shell
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.02, w * 0.3, h * 0.35, 0, 0, TAU);
  ctx.fillStyle = lin(ctx, 0, -h * 0.35, 0, h * 0.33, "#8a5a22", "#4a2a0c");
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#e0b36a";
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = "rgba(255,220,150,0.65)";
  ctx.lineWidth = 2.2;
  const hr = h * 0.13;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    const px = Math.cos(a) * hr;
    const py = Math.sin(a) * hr - h * 0.02;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
    ctx.moveTo(px, py);
    ctx.lineTo(Math.cos(a) * w * 0.4, Math.sin(a) * h * 0.5 - h * 0.02);
    ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.ellipse(-w * 0.05, -h * 0.2, w * 0.15, h * 0.07, -0.2, 0, TAU);
  ctx.fill();
  ctx.restore();

  // near flipper
  ctx.save();
  ctx.translate(w * 0.14, h * 0.15);
  ctx.rotate(0.85 + flap * 0.45);
  ctx.beginPath();
  ctx.ellipse(w * 0.1, 0, w * 0.18, h * 0.07, 0, 0, TAU);
  ctx.fillStyle = "#4fb85a";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.restore();
}

function drawShark(ctx: Ctx, sp: Species, t: number, ph: number) {
  const w = sp.w;
  const h = sp.h;
  const wag = Math.sin(t * 5 + ph) * 0.18;

  // tail (crescent)
  ctx.save();
  ctx.translate(-w * 0.3, 0);
  ctx.rotate(wag);
  ctx.beginPath();
  ctx.moveTo(w * 0.04, -h * 0.03);
  ctx.quadraticCurveTo(-w * 0.1, -h * 0.1, -w * 0.2, -h * 0.5);
  ctx.quadraticCurveTo(-w * 0.12, -h * 0.05, -w * 0.15, 0);
  ctx.quadraticCurveTo(-w * 0.12, h * 0.1, -w * 0.15, h * 0.3);
  ctx.quadraticCurveTo(-w * 0.08, h * 0.1, w * 0.04, h * 0.04);
  ctx.closePath();
  ctx.fillStyle = sp.accent;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.restore();

  // dorsal fin
  ctx.beginPath();
  ctx.moveTo(w * 0.08, -h * 0.3);
  ctx.quadraticCurveTo(-w * 0.02, -h * 0.55, -w * 0.12, -h * 0.72);
  ctx.quadraticCurveTo(-w * 0.14, -h * 0.5, -w * 0.18, -h * 0.28);
  ctx.closePath();
  ctx.fillStyle = sp.accent;
  ctx.fill();
  ctx.stroke();

  // body
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.06);
  ctx.bezierCurveTo(w * 0.32, -h * 0.4, -w * 0.1, -h * 0.4, -w * 0.32, -h * 0.07);
  ctx.lineTo(-w * 0.32, h * 0.07);
  ctx.bezierCurveTo(-w * 0.1, h * 0.3, w * 0.3, h * 0.36, w * 0.5, h * 0.06);
  ctx.closePath();
  ctx.fillStyle = lin(ctx, 0, -h * 0.4, 0, h * 0.35, "#8ea3b8", "#3b4b61");
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();

  ctx.save();
  ctx.clip();
  // belly
  ctx.fillStyle = "#e6eef5";
  ctx.beginPath();
  ctx.ellipse(w * 0.12, h * 0.34, w * 0.5, h * 0.2, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.ellipse(w * 0.1, -h * 0.2, w * 0.28, h * 0.08, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // gills
  ctx.strokeStyle = "rgba(20,30,45,0.55)";
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(w * (0.12 - i * 0.03), -h * 0.12);
    ctx.quadraticCurveTo(w * (0.09 - i * 0.03), h * 0.0, w * (0.12 - i * 0.03), h * 0.1);
    ctx.stroke();
  }

  // pectoral fin
  ctx.beginPath();
  ctx.moveTo(w * 0.1, h * 0.1);
  ctx.quadraticCurveTo(w * 0.02 + Math.sin(t * 3 + ph) * 4, h * 0.38, -w * 0.1, h * 0.48);
  ctx.quadraticCurveTo(-w * 0.06, h * 0.25, -w * 0.02, h * 0.1);
  ctx.closePath();
  ctx.fillStyle = sp.accent;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();

  // mouth + teeth
  ctx.strokeStyle = "rgba(20,10,10,0.8)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.49, h * 0.1);
  ctx.quadraticCurveTo(w * 0.4, h * 0.2, w * 0.28, h * 0.14);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 4; i++) {
    const x = w * (0.45 - i * 0.04);
    ctx.beginPath();
    ctx.moveTo(x, h * 0.13 + i * 0.5);
    ctx.lineTo(x - w * 0.012, h * 0.19);
    ctx.lineTo(x - w * 0.024, h * 0.15);
    ctx.closePath();
    ctx.fill();
  }

  // eye
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(w * 0.34, -h * 0.07, h * 0.055, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#101820";
  ctx.beginPath();
  ctx.arc(w * 0.35, -h * 0.07, h * 0.035, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(w * 0.36, -h * 0.085, h * 0.012, 0, TAU);
  ctx.fill();
}

function drawStar(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const rr = i % 2 === 0 ? r : r * 0.28;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

export function drawFish(ctx: Ctx, f: FishView, t: number) {
  const sp = f.sp;
  ctx.save();
  const jx = f.flash > 0 ? (Math.random() - 0.5) * 5 : 0;
  const jy = f.flash > 0 ? (Math.random() - 0.5) * 5 : 0;
  ctx.translate(f.x + jx, f.y + jy);
  ctx.globalAlpha = Math.max(0, f.alpha);

  if (sp.kind === "golden" && !f.dying) {
    const g = ctx.createRadialGradient(0, 0, 10, 0, 0, sp.w * 0.8);
    const p = 0.32 + Math.sin(t * 4) * 0.08;
    g.addColorStop(0, `rgba(255,230,100,${p})`);
    g.addColorStop(1, "rgba(255,200,60,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, sp.w * 0.8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#fff6b0";
    for (let i = 0; i < 4; i++) {
      const a = t * 1.2 + i * 1.6;
      const s = 0.5 + 0.5 * Math.sin(t * 5 + i * 2);
      drawStar(ctx, Math.cos(a) * sp.w * 0.5, Math.sin(a * 1.3) * sp.h * 0.6, 4 + s * 5);
    }
  }

  ctx.scale(sp.kind === "jelly" ? 1 : f.dir, 1);
  if (sp.kind !== "jelly") ctx.rotate(f.tilt);
  if (f.dying) {
    ctx.rotate(f.spin);
    const s = Math.max(0.5, f.alpha);
    ctx.scale(s, s);
  }

  switch (sp.kind) {
    case "puffer":
      drawPuffer(ctx, sp, t, f.phase);
      break;
    case "jelly":
      drawJelly(ctx, sp, t, f.phase);
      break;
    case "turtle":
      drawTurtle(ctx, sp, t, f.phase);
      break;
    case "shark":
      drawShark(ctx, sp, t, f.phase);
      break;
    default:
      drawGeneric(ctx, sp, t, f.phase);
  }

  if (f.flash > 0) {
    ctx.globalAlpha = Math.min(1, f.flash * 4) * 0.5 * Math.max(0, f.alpha);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(0, 0, sp.w * sp.hit[0] * 1.05, sp.h * sp.hit[1] * 1.05, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Static preview used inside the paytable. */
export function drawSpeciesPreview(ctx: Ctx, sp: Species, boxW: number, boxH: number, t: number) {
  const pad = sp.kind === "jelly" ? 6 : 10;
  const extra = sp.kind === "golden" ? 1.5 : sp.kind === "shark" ? 1.12 : 1.15;
  const s = Math.min((boxW - pad) / (sp.w * extra), (boxH - pad) / (sp.h * extra));
  ctx.save();
  ctx.translate(boxW / 2, boxH / 2);
  ctx.scale(s, s);
  drawFish(
    ctx,
    { sp, x: 0, y: 0, dir: 1, tilt: 0, phase: 0, flash: 0, alpha: 1, spin: 0, dying: false },
    t,
  );
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  Cannon / bullets / nets / coins / popups                           */
/* ------------------------------------------------------------------ */

export const CANNON_STYLES = [
  { main: "#4cc3ff", dark: "#1767b5", glow: "#9fe6ff" },
  { main: "#4cf0b0", dark: "#13885e", glow: "#a8ffd8" },
  { main: "#b4ee45", dark: "#5a8f12", glow: "#e2ff9a" },
  { main: "#ffd23a", dark: "#b4750a", glow: "#fff0a0" },
  { main: "#ff9a3a", dark: "#b24510", glow: "#ffd0a0" },
  { main: "#ff5a7a", dark: "#a8123a", glow: "#ffb0c0" },
  { main: "#c25cff", dark: "#5a1aa8", glow: "#e6b0ff" },
];

export function drawCannon(ctx: Ctx, angle: number, level: number, recoil: number, t: number) {
  const st = CANNON_STYLES[Math.min(level, CANNON_STYLES.length - 1)];
  const barrels = level >= 6 ? 3 : level >= 4 ? 2 : 1;
  const offsets = barrels === 1 ? [0] : barrels === 2 ? [-10, 10] : [-16, 0, 16];
  const bw = barrels === 1 ? 20 + level * 3 : barrels === 2 ? 17 : 15;
  const len = 66 + level * 4;

  ctx.save();
  ctx.translate(CANNON.x, CANNON.y);

  // glow under turret
  const gg = ctx.createRadialGradient(0, 0, 10, 0, 0, 100);
  gg.addColorStop(0, "rgba(255,255,255,0.28)");
  gg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.arc(0, 0, 100, 0, TAU);
  ctx.fill();

  // side hubs
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sx * 52, 12, 17, 0, TAU);
    ctx.fillStyle = lin(ctx, 0, -5, 0, 30, "#ffe27a", "#b9770a");
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#5a3205";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sx * 52, 12, 7, 0, TAU);
    ctx.fillStyle = st.main;
    ctx.fill();
  }

  // barrels
  ctx.save();
  ctx.rotate(angle);
  ctx.translate(-recoil, 0);
  for (const off of offsets) {
    ctx.save();
    ctx.translate(0, off);
    const g = ctx.createLinearGradient(0, -bw / 2, 0, bw / 2);
    g.addColorStop(0, st.dark);
    g.addColorStop(0.35, st.glow);
    g.addColorStop(0.55, st.main);
    g.addColorStop(1, st.dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(8, -bw / 2, len, bw, 6);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#0b2a4a";
    ctx.stroke();
    // bands
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(8 + len * 0.3, -bw / 2, 4, bw);
    ctx.fillRect(8 + len * 0.55, -bw / 2, 4, bw);
    // muzzle
    ctx.fillStyle = lin(ctx, 0, -bw / 2, 0, bw / 2, "#ffe27a", "#b9770a");
    ctx.beginPath();
    ctx.roundRect(8 + len - 4, -bw / 2 - 4, 14, bw + 8, 5);
    ctx.fill();
    ctx.strokeStyle = "#5a3205";
    ctx.lineWidth = 2;
    ctx.stroke();
    if (recoil > 1) {
      const mg = ctx.createRadialGradient(8 + len + 14, 0, 2, 8 + len + 14, 0, 30);
      mg.addColorStop(0, "rgba(255,255,220,0.95)");
      mg.addColorStop(1, "rgba(255,200,60,0)");
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(8 + len + 14, 0, 30, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();

  // turret body
  ctx.beginPath();
  ctx.arc(0, 0, 40, 0, TAU);
  ctx.fillStyle = lin(ctx, 0, -40, 0, 40, "#fff0a8", "#b9770a");
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#5a3205";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, TAU);
  const tg = ctx.createRadialGradient(-8, -10, 3, 0, 0, 32);
  tg.addColorStop(0, st.glow);
  tg.addColorStop(0.6, st.main);
  tg.addColorStop(1, st.dark);
  ctx.fillStyle = tg;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#0b2a4a";
  ctx.stroke();
  // gem
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, TAU);
  ctx.fillStyle = lin(ctx, -8, -8, 8, 8, "#ffffff", st.main);
  ctx.globalAlpha = 0.85 + Math.sin(t * 4) * 0.1;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

export function drawBullet(ctx: Ctx, x: number, y: number, vx: number, vy: number, level: number) {
  const st = CANNON_STYLES[Math.min(level, CANNON_STYLES.length - 1)];
  const sp = Math.hypot(vx, vy) || 1;
  const nx = vx / sp;
  const ny = vy / sp;
  ctx.save();
  const tl = ctx.createLinearGradient(x, y, x - nx * 44, y - ny * 44);
  tl.addColorStop(0, st.glow);
  tl.addColorStop(1, "rgba(255,255,255,0)");
  ctx.strokeStyle = tl;
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - nx * 44, y - ny * 44);
  ctx.stroke();
  const g = ctx.createRadialGradient(x, y, 1, x, y, 20);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.3, st.glow);
  g.addColorStop(0.6, st.main);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 20, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function drawNet(ctx: Ctx, x: number, y: number, r: number, p: number, win: boolean) {
  const grow = 0.35 + 0.65 * Math.min(1, p * 4.5);
  const alpha = 1 - Math.max(0, (p - 0.45) / 0.55);
  const rr = r * grow;
  const col = win ? "255,224,90" : "170,230,255";
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = Math.max(0, alpha);
  const g = ctx.createRadialGradient(0, 0, rr * 0.1, 0, 0, rr);
  g.addColorStop(0, `rgba(${col},0.05)`);
  g.addColorStop(1, `rgba(${col},0.38)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rr, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = `rgba(${col},0.95)`;
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.rotate(Math.PI / 4 + p * 0.5);
  ctx.strokeStyle = `rgba(${col},0.75)`;
  ctx.lineWidth = 1.6;
  const step = Math.max(12, rr / 3.2);
  ctx.beginPath();
  for (let k = -rr; k <= rr; k += step) {
    ctx.moveTo(k, -rr);
    ctx.lineTo(k, rr);
    ctx.moveTo(-rr, k);
    ctx.lineTo(rr, k);
  }
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

export function drawCoin(ctx: Ctx, x: number, y: number, r: number, t: number) {
  const sx = Math.max(0.15, Math.abs(Math.cos(t * 9)));
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * sx, r, 0, 0, TAU);
  ctx.fillStyle = lin(ctx, -r, -r, r, r, "#fff3a0", "#e69a0a");
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#8a5205";
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, r * sx * 0.62, r * 0.62, 0, 0, TAU);
  ctx.strokeStyle = "rgba(138,82,5,0.7)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

export function drawPopup(ctx: Ctx, x: number, y: number, text: string, size: number, alpha: number, scale: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.font = `900 ${size}px "Arial Black", Impact, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = size * 0.26;
  ctx.strokeStyle = "#5a2a00";
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = lin(ctx, 0, -size / 2, 0, size / 2, "#fff6a8", "#ffb81f");
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export function drawLock(ctx: Ctx, x: number, y: number, r: number, t: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "#ff4a4a";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#ff0000";
  ctx.shadowBlur = 8;
  ctx.rotate(t * 1.6);
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.rotate(-t * 1.6);
  ctx.beginPath();
  for (const a of [0, 1, 2, 3]) {
    const ang = (a * Math.PI) / 2;
    ctx.moveTo(Math.cos(ang) * (r - 8), Math.sin(ang) * (r - 8));
    ctx.lineTo(Math.cos(ang) * (r + 10), Math.sin(ang) * (r + 10));
  }
  ctx.stroke();
  ctx.restore();
}

export function drawCrosshair(ctx: Ctx, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2.5;
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, TAU);
  ctx.moveTo(-22, 0);
  ctx.lineTo(-8, 0);
  ctx.moveTo(22, 0);
  ctx.lineTo(8, 0);
  ctx.moveTo(0, -22);
  ctx.lineTo(0, -8);
  ctx.moveTo(0, 22);
  ctx.lineTo(0, 8);
  ctx.stroke();
  ctx.restore();
}
