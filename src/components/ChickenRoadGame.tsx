"use client";

import { localApi } from "@/lib/client";
import { playGameSound, speakGameVoice } from "@/lib/gameAudio";
import { broadcastBalanceUpdate } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import { drawBarrier as drawDashBarrier, drawGrass, drawTile } from "./ChickenDashGame";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/* ---------------- types ---------------- */
type Difficulty = "easy" | "medium" | "hard" | "hardcore";
type G = {
  poolPending?: boolean; poolClaim?: number; poolVersion?: string;
  id: string; difficulty: Difficulty; bet: number; lanes: number; position: number;
  status: "active" | "cashed" | "dead"; win: number; currentMultiplier: number; nextMultiplier: number | null; crashLane: number | null;
};
type Recent = { id: string; difficulty: string; bet: number; win: number; status: string; position: number; multiplier: number };
type State = {
  game: G | null; balance: number; tables: Record<Difficulty, number[]>;
  difficulties: Record<Difficulty, { cars: number; label: string; lanes: number }>;
  limits: { min: number; max: number }; recent: Recent[];
};
const DIFFS: Difficulty[] = ["easy", "medium", "hard", "hardcore"];

/* ---------------- scene constants ---------------- */
const H = 430, LANE_W = 92, SIDE_W = 130, WALK_W = 64;
const MANHOLE_Y = 262, MANHOLE_R = 27;

type CarType = "taxi" | "fire" | "ice" | "van" | "police";
const CAR_TYPES: CarType[] = ["taxi", "fire", "ice", "van", "police"];
type Car = { type: CarType; y: number; speed: number };
type Parked = { type: CarType; y: number; target: number };
type Coin = { x: number; y: number; vx: number; vy: number; life: number };
type View = { w: number; h: number; scale: number; dpr: number };
type Vis = {
  lanes: number; table: number[]; pos: number; cx: number;
  hop: { fromX: number; toX: number; start: number; dur: number; done?: () => void } | null;
  passed: boolean[]; parked: (Parked | null)[]; moving: Car[][]; nextSpawn: number[];
  killer: { lane: number; y: number; type: CarType; hit: boolean; done?: () => void } | null;
  dead: boolean; coins: Coin[]; camX: number; camInit: boolean;
  status: "idle" | "active" | "cashed" | "dead" | "finished"; lastT: number;
  finishedAt: number | null;
};

const laneX = (l: number) => SIDE_W + (l - 0.5) * LANE_W;
const posX = (p: number, lanes: number) => (p <= 0 ? SIDE_W - 32 : p > lanes ? SIDE_W + lanes * LANE_W + 32 : laneX(p));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const trim = (n: number, d: number) => String(parseFloat(n.toFixed(d)));
export const fmtMult = (m: number) =>
  (m >= 1e6 ? trim(m / 1e6, 1) + "M" : m >= 1e4 ? trim(m / 1e3, 0) + "K" : m >= 1000 ? trim(m / 1e3, 1) + "K" : m >= 100 ? trim(m, 0) : m >= 10 ? trim(m, 1) : trim(m, 2)) + "x";
export function displayedMultiplier(table: number[], position: number, status: Vis["status"]) {
  const displayedPosition = status === "finished" ? table.length : position;
  return displayedPosition > 0 ? fmtMult(table[displayedPosition - 1]) : "1x";
}
const money = (n: number) => "Rs. " + n.toLocaleString("en-PK", { maximumFractionDigits: 2 });

function newVis(table: number[], prev?: Vis | null): Vis {
  const lanes = table.length;
  const moving: Car[][] = Array.from({ length: lanes + 2 }, () => []);
  for (let l = 1; l <= lanes; l++) if (Math.random() < 0.45) moving[l].push({ type: pick(CAR_TYPES), y: rnd(-60, H), speed: rnd(140, 230) });
  return {
    lanes, table, pos: 0, cx: posX(0, lanes), hop: null,
    passed: Array(lanes + 2).fill(false), parked: Array(lanes + 2).fill(null), moving,
    nextSpawn: Array.from({ length: lanes + 2 }, () => performance.now() + rnd(400, 3500)),
    killer: null, dead: false, coins: [], camX: prev?.camX ?? 0, camInit: prev?.camInit ?? false, status: "idle", lastT: 0, finishedAt: null,
  };
}
function applyGame(v: Vis, g: G) {
  v.status = "active"; v.pos = g.position; v.cx = posX(g.position, v.lanes); v.dead = false; v.killer = null; v.hop = null;
  for (let l = 1; l <= v.lanes; l++) {
    const p = l <= g.position;
    v.passed[l] = p;
    const type = CAR_TYPES[(l * 3 + 1) % CAR_TYPES.length];
    const target = parkedStopY(type, { h: H, scale: 1 });
    v.parked[l] = p ? { type, y: target, target } : null;
    if (p) v.moving[l] = [];
  }
}
function blockLane(v: Vis, l: number, view: View) {
  v.passed[l] = true;
  const cars = v.moving[l];
  const ratio = view.h / H;
  const carScale = roadCarScale(view.scale);
  const approaching = cars.filter((car) => car.y * ratio - CAR_SPEC[car.type].h * carScale / 2 <= MANHOLE_Y * ratio - 72 + 30);
  const lead = approaching.length ? approaching.reduce((a, b) => b.y > a.y ? b : a) : null;
  if (!lead) {
    v.parked[l] = null;
    return;
  }
  const target = parkedStopY(lead.type, view);
  v.moving[l] = cars.filter((car) => car !== lead && car.y >= MANHOLE_Y + 50);
  v.parked[l] = { type: lead.type, y: Math.min(lead.y, target), target };
}
function hopTo(v: Vis, p: number, done?: () => void) {
  v.hop = { fromX: v.cx, toX: posX(p, v.lanes), start: performance.now(), dur: 330, done: () => { v.pos = p; done?.(); } };
}
function burst(v: Vis, x: number, y: number) {
  for (let i = 0; i < 18; i++) v.coins.push({ x, y, vx: rnd(-170, 170), vy: rnd(-420, -160), life: 1 });
}

/* ---------------- update / draw ---------------- */
function update(v: Vis, dt: number, now: number, view: View) {
  if (v.status === "finished" && v.finishedAt !== null && now - v.finishedAt >= 1800) {
    Object.assign(v, newVis(v.table, v), { lastT: v.lastT });
  }
  const s = dt / 1000;
  if (v.hop) {
    const t = Math.min(1, (now - v.hop.start) / v.hop.dur);
    const e = t * t * (3 - 2 * t);
    v.cx = v.hop.fromX + (v.hop.toX - v.hop.fromX) * e;
    if (t >= 1) { const d = v.hop.done; v.hop = null; d?.(); }
  }
  for (let l = 1; l <= v.lanes; l++) {
    const cars = v.moving[l];
    if (!v.passed[l] && now >= v.nextSpawn[l]) {
      v.nextSpawn[l] = now + rnd(1800, 5200);
      if (!cars.some((c) => c.y < 140)) cars.push({ type: pick(CAR_TYPES), y: -110, speed: rnd(140, 230) });
    }
    for (const c of cars) c.y += c.speed * s;
    v.moving[l] = cars.filter((c) => c.y < H + 120);
  }
  for (const p of v.parked) if (p) {
    p.target = parkedStopY(p.type, view);
    p.y = Math.min(p.target, p.y + 560 * s);
  }
  if (v.killer) {
    const k = v.killer;
    k.y += 700 * s;
    if (!k.hit && k.y + 32 >= MANHOLE_Y) { k.hit = true; v.dead = true; }
    if (k.y > H + 130) { const d = k.done; v.killer = null; d?.(); }
  }
  for (const c of v.coins) { c.vy += 950 * s; c.x += c.vx * s; c.y += c.vy * s; c.life -= s / 1.1; }
  v.coins = v.coins.filter((c) => c.life > 0);
  const worldW = SIDE_W * 2 + v.lanes * LANE_W;
  const maxCam = worldW - view.w;
  const target = maxCam <= 0 ? maxCam / 2 : Math.max(0, Math.min(maxCam, v.cx - view.w * 0.42));
  if (!v.camInit) { v.camX = target; v.camInit = true; } else v.camX += (target - v.camX) * Math.min(1, s * 7);
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad); ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath();
}
const circle = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };

function drawSidewalk(ctx: CanvasRenderingContext2D, x: number, w: number, h: number) {
  ctx.fillStyle = "#c9c9c9"; ctx.fillRect(x, 0, w, h);
  ctx.strokeStyle = "#b4b4b4"; ctx.lineWidth = 1.5; ctx.beginPath();
  for (let y = 0; y <= h; y += 32) { ctx.moveTo(x, y); ctx.lineTo(x + w, y); }
  ctx.moveTo(x + w / 2, 0); ctx.lineTo(x + w / 2, h); ctx.stroke();
}
function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(x + 5, y + 7, 26, 22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#3c8a36"; circle(ctx, x, y, 27); ctx.fill();
  ctx.fillStyle = "#58a94c"; circle(ctx, x - 7, y - 7, 14); ctx.fill();
  ctx.fillStyle = "#2f7a2b"; circle(ctx, x + 9, y + 9, 7); ctx.fill();
}
function drawBush(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "rgba(0,0,0,.15)"; rr(ctx, x - 16, y - 8, 36, 24, 11); ctx.fill();
  ctx.fillStyle = "#4d9a43"; rr(ctx, x - 18, y - 12, 36, 24, 11); ctx.fill();
  ctx.fillStyle = "#68b65b"; rr(ctx, x - 12, y - 9, 14, 9, 5); ctx.fill();
}
function drawLamp(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "rgba(0,0,0,.2)"; rr(ctx, x - 1, y + 4, 6, 76, 3); ctx.fill();
  ctx.fillStyle = "#8d939a"; rr(ctx, x - 3, y, 6, 76, 3); ctx.fill(); rr(ctx, x, y, 28, 5, 2); ctx.fill();
  const g = ctx.createRadialGradient(x + 30, y + 3, 2, x + 30, y + 3, 24);
  g.addColorStop(0, "rgba(255,240,150,.55)"); g.addColorStop(1, "rgba(255,240,150,0)");
  ctx.fillStyle = g; circle(ctx, x + 30, y + 3, 24); ctx.fill();
  ctx.fillStyle = "#fff3b0"; circle(ctx, x + 30, y + 3, 7); ctx.fill();
}
function drawTrafficLight(ctx: CanvasRenderingContext2D, x: number, y: number, now: number) {
  ctx.fillStyle = "#d8a521"; rr(ctx, x - 3, y - 26, 6, 96, 3); ctx.fill();
  ctx.fillStyle = "#2b2b2b"; rr(ctx, x - 10, y - 34, 20, 52, 6); ctx.fill();
  const on = Math.floor(now / 1500) % 3;
  ctx.fillStyle = on === 0 ? "#ff3b30" : "#5a1a18"; circle(ctx, x, y - 22, 5); ctx.fill();
  ctx.fillStyle = on === 1 ? "#fdd835" : "#5a4d12"; circle(ctx, x, y - 8, 5); ctx.fill();
  ctx.fillStyle = on === 2 ? "#43d060" : "#184d24"; circle(ctx, x, y + 6, 5); ctx.fill();
}
function drawHydrant(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#d32f2f"; rr(ctx, x - 7, y - 10, 14, 24, 5); ctx.fill();
  ctx.fillStyle = "#b71c1c"; circle(ctx, x, y - 11, 6); ctx.fill(); rr(ctx, x - 12, y - 4, 6, 7, 2); ctx.fill(); rr(ctx, x + 6, y - 4, 6, 7, 2); ctx.fill();
}
function drawCrosswalk(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "#6a5a97"; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#f2c12e"; ctx.lineWidth = 4; ctx.setLineDash([12, 10]);
  ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = "#e6e6e6"; ctx.fillRect(x, y, w, 3); ctx.fillRect(x, y + h - 3, w, 3);
}
function drawPedestrian(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(x, y + 16, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#d6d6d6"; ctx.lineWidth = 1.5;
  circle(ctx, x, y + 6, 10); ctx.fill(); ctx.stroke(); circle(ctx, x, y - 6, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#e53935"; for (const dx of [-4, 0, 4]) { circle(ctx, x + dx, y - 14, 2.5); ctx.fill(); }
  ctx.fillStyle = "#111"; rr(ctx, x - 8, y - 9, 16, 5, 2); ctx.fill();
  ctx.fillStyle = "#f5a623"; ctx.beginPath(); ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y - 3); ctx.lineTo(x, y + 1); ctx.closePath(); ctx.fill();
}
function drawManhole(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, passed: boolean, next: boolean, now: number) {
  ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(x + 2, y + 4, MANHOLE_R, MANHOLE_R * 0.92, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#2c2c2c"; circle(ctx, x, y, MANHOLE_R); ctx.fill(); ctx.strokeStyle = "#151515"; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = "#3a3a3a"; circle(ctx, x, y, MANHOLE_R - 6); ctx.fill();
  ctx.strokeStyle = "#1e1e1e"; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.moveTo(x + Math.cos(a) * (MANHOLE_R - 11), y + Math.sin(a) * (MANHOLE_R - 11)); ctx.lineTo(x + Math.cos(a) * (MANHOLE_R - 7), y + Math.sin(a) * (MANHOLE_R - 7)); }
  ctx.stroke();
  if (next) {
    const a = 0.55 + 0.4 * Math.sin(now / 180);
    ctx.strokeStyle = `rgba(255,214,0,${a})`; ctx.lineWidth = 4; circle(ctx, x, y, MANHOLE_R + 7); ctx.stroke();
  }
  ctx.font = `bold ${label.length > 5 ? 12 : 14}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,.8)"; ctx.shadowBlur = 4;
  ctx.fillStyle = passed ? "#9de08a" : "#ffffff"; ctx.fillText(label, x, y + 1);
  ctx.shadowBlur = 0;
}
function drawBarrier(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#8e8e8e"; rr(ctx, x - 21, y, 5, 17, 2); ctx.fill(); rr(ctx, x + 16, y, 5, 17, 2); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,.25)"; rr(ctx, x - 26, y - 3, 54, 12, 3); ctx.fill();
  ctx.save(); rr(ctx, x - 28, y - 7, 56, 13, 3); ctx.clip();
  ctx.fillStyle = "#f2c12e"; ctx.fillRect(x - 28, y - 7, 56, 13);
  ctx.strokeStyle = "#262626"; ctx.lineWidth = 7; ctx.beginPath();
  for (let i = -40; i < 60; i += 16) { ctx.moveTo(x + i, y + 10); ctx.lineTo(x + i + 14, y - 10); }
  ctx.stroke(); ctx.restore();
  ctx.strokeStyle = "#222"; ctx.lineWidth = 1.5; rr(ctx, x - 28, y - 7, 56, 13, 3); ctx.stroke();
}
const CAR_SPEC: Record<CarType, { w: number; h: number; body: string; roof: string }> = {
  taxi: { w: 44, h: 68, body: "#f7c531", roof: "#e0ad1b" },
  fire: { w: 46, h: 88, body: "#d9302f", roof: "#b71c1c" },
  ice: { w: 46, h: 78, body: "#3e9be0", roof: "#2a7fc0" },
  van: { w: 44, h: 76, body: "#5cb85c", roof: "#f4f4f4" },
  police: { w: 44, h: 68, body: "#f5f5f5", roof: "#dcdcdc" },
};
function parkedStopY(type: CarType, view: Pick<View, "h" | "scale">) {
  const ratio = view.h / H;
  return (MANHOLE_Y * ratio - 72 - 28 - 14 / view.scale - CAR_SPEC[type].h * roadCarScale(view.scale) / 2 - 5) / ratio;
}
export function roadCarScale(canvasScale: number) {
  return Math.min(1.5, Math.max(1, 0.6 / canvasScale));
}
function drawCar(ctx: CanvasRenderingContext2D, type: CarType, cx: number, cy: number, size = 1) {
  const { w, h, body, roof } = CAR_SPEC[type];
  const x = cx - w / 2, y = cy - h / 2;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(size, size); ctx.translate(-cx, -cy);
  ctx.fillStyle = "rgba(0,0,0,.28)"; rr(ctx, x + 3, y + 5, w, h, 10); ctx.fill();
  ctx.fillStyle = "#1b1b1b";
  for (const [wx, wy] of [[x - 3, y + 9], [x + w - 4, y + 9], [x - 3, y + h - 25], [x + w - 4, y + h - 25]]) { rr(ctx, wx, wy, 7, 16, 2); ctx.fill(); }
  ctx.fillStyle = body; rr(ctx, x, y, w, h, 9); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = roof; rr(ctx, x + 6, y + 22, w - 12, h - 46, 6); ctx.fill();
  ctx.fillStyle = "#cfe9ff"; rr(ctx, x + 6, y + h - 22, w - 12, 10, 3); ctx.fill(); rr(ctx, x + 6, y + 11, w - 12, 8, 3); ctx.fill();
  ctx.fillStyle = "#fff59d"; rr(ctx, x + 4, y + h - 5, 9, 4, 1); ctx.fill(); rr(ctx, x + w - 13, y + h - 5, 9, 4, 1); ctx.fill();
  ctx.fillStyle = "#ff5252"; rr(ctx, x + 4, y + 1, 9, 4, 1); ctx.fill(); rr(ctx, x + w - 13, y + 1, 9, 4, 1); ctx.fill();
  if (type === "taxi") {
    ctx.fillStyle = "#222"; rr(ctx, cx - 11, cy - 4, 22, 8, 2); ctx.fill();
    ctx.fillStyle = "#f7c531"; for (let i = 0; i < 4; i++) ctx.fillRect(cx - 10 + i * 5.5, cy - 3 + (i % 2) * 3, 2.5, 2.5);
  } else if (type === "fire") {
    ctx.strokeStyle = "#f4f4f4"; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(cx - 6, y + 20); ctx.lineTo(cx - 6, y + h - 28); ctx.moveTo(cx + 6, y + 20); ctx.lineTo(cx + 6, y + h - 28);
    for (let yy = y + 24; yy < y + h - 28; yy += 8) { ctx.moveTo(cx - 6, yy); ctx.lineTo(cx + 6, yy); }
    ctx.stroke();
  } else if (type === "ice") {
    ctx.fillStyle = "#f5b26b"; ctx.beginPath(); ctx.moveTo(cx - 7, cy + 2); ctx.lineTo(cx + 7, cy + 2); ctx.lineTo(cx, cy + 16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ff8ac2"; circle(ctx, cx, cy - 2, 8); ctx.fill(); ctx.fillStyle = "#ffd1e6"; circle(ctx, cx - 3, cy - 5, 3); ctx.fill();
  } else if (type === "police") {
    ctx.fillStyle = "#2f5fd6"; ctx.fillRect(x, cy + 12, w, 6);
    ctx.fillStyle = "#ff3b30"; rr(ctx, x + 8, cy - 5, (w - 16) / 2 - 1, 8, 2); ctx.fill();
    ctx.fillStyle = "#2f7cff"; rr(ctx, cx + 1, cy - 5, (w - 16) / 2 - 1, 8, 2); ctx.fill();
  }
  ctx.restore();
}
function drawChicken(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, dead: boolean) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  if (dead) {
    ctx.fillStyle = "#fff";
    for (const [fx, fy, r] of [[-30, -18, 5], [24, -22, 4], [-22, 18, 4], [30, 12, 5], [4, -30, 4]]) { ctx.beginPath(); ctx.ellipse(fx, fy, r, r * 0.6, 0.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(0, 6, 32, 13, 0, 0, Math.PI * 2); ctx.fillStyle = "#f4f4f4"; ctx.fill(); ctx.strokeStyle = "#cfcfcf"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#e53935"; for (const c of [8, 13, 18]) { circle(ctx, c, -6, 3.5); ctx.fill(); }
    ctx.fillStyle = "#f5a623"; ctx.beginPath(); ctx.moveTo(24, 2); ctx.lineTo(34, 5); ctx.lineTo(24, 8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#222"; ctx.lineWidth = 2;
    for (const ex of [6, 16]) { ctx.beginPath(); ctx.moveTo(ex - 3, 0); ctx.lineTo(ex + 3, 6); ctx.moveTo(ex + 3, 0); ctx.lineTo(ex - 3, 6); ctx.stroke(); }
    ctx.restore(); return;
  }
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(0, 21, 20, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#f0a020"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.beginPath();
  ctx.moveTo(-7, 15); ctx.lineTo(-9, 21); ctx.moveTo(-13, 23); ctx.lineTo(-9, 21); ctx.lineTo(-5, 23);
  ctx.moveTo(6, 15); ctx.lineTo(4, 21); ctx.moveTo(0, 23); ctx.lineTo(4, 21); ctx.lineTo(8, 23); ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#d6d6d6"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(-31, -11); ctx.lineTo(-24, 2); ctx.lineTo(-32, 6); ctx.lineTo(-16, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 3, 21, 16, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#ececec"; ctx.beginPath(); ctx.ellipse(-4, 6, 11, 6, -0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#fff"; circle(ctx, 13, -11, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#e53935"; for (const [cx2, cy2] of [[7, -21], [13, -24], [19, -21]]) { circle(ctx, cx2, cy2, 4.2); ctx.fill(); }
  ctx.fillStyle = "#f5a623"; ctx.beginPath(); ctx.moveTo(23, -13); ctx.lineTo(35, -9); ctx.lineTo(23, -5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#e53935"; circle(ctx, 22, -3, 3.2); ctx.fill();
  ctx.fillStyle = "#1a1a1a"; circle(ctx, 17, -13, 2.8); ctx.fill();
  ctx.fillStyle = "#fff"; circle(ctx, 18, -14, 1); ctx.fill();
  ctx.restore();
}
function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, a: number) {
  ctx.globalAlpha = Math.max(0, Math.min(1, a));
  ctx.fillStyle = "#f7c948"; circle(ctx, x, y, 8); ctx.fill(); ctx.strokeStyle = "#d9a521"; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = "#e6b530"; ctx.lineWidth = 1.5; circle(ctx, x, y, 4.5); ctx.stroke();
  ctx.globalAlpha = 1;
}

export function roadChickenPose(now: number, hopProgress: number | null) {
  const progress = hopProgress === null ? 0 : Math.max(0, Math.min(1, hopProgress));
  const lift = Math.sin(progress * Math.PI);
  const stride = hopProgress === null ? 0 : Math.sin(progress * Math.PI * 2);
  const blinkPhase = ((now % 4600) + 4600) % 4600;
  return {
    lift: lift * 29,
    bob: Math.sin(now / 420) * 0.6,
    stride: stride * 7,
    wing: lift * 0.3,
    lean: -stride * 0.065,
    squash: 1 + Math.sin(progress * Math.PI * 2) * 0.045,
    eye: blinkPhase > 4400 ? Math.max(0.08, Math.abs(blinkPhase - 4500) / 100) : 1,
    shadow: 1 - lift * 0.3,
  };
}

export function roadChickenScale(canvasScale: number) {
  return Math.min(1.4, Math.max(1, 0.58 / canvasScale));
}

export function drawRoadChicken(ctx: CanvasRenderingContext2D, x: number, y: number, now: number, hopProgress: number | null, size = 1) {
  const pose = roadChickenPose(now, hopProgress);
  const oval = (cx: number, cy: number, rx: number, ry: number, fill: string | CanvasGradient, outline = true, angle = 0) => {
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, angle, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    if (outline) { ctx.strokeStyle = "#4b4940"; ctx.lineWidth = 1.5; ctx.stroke(); }
  };
  const shade = (cx: number, cy: number, radius: number, light: string, middle: string, dark: string) => {
    const fill = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.4, radius * 0.1, cx, cy, radius);
    fill.addColorStop(0, light); fill.addColorStop(0.65, middle); fill.addColorStop(1, dark);
    return fill;
  };
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  const shadow = ctx.createRadialGradient(0, 19, 1, 0, 19, 31);
  shadow.addColorStop(0, "rgba(0,0,0,.38)"); shadow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save(); ctx.scale(pose.shadow, 0.3 * pose.shadow); oval(0, 63, 33, 27, shadow, false); ctx.restore();
  ctx.translate(0, -pose.lift + pose.bob);
  ctx.rotate(pose.lean);
  ctx.scale(1 / pose.squash, pose.squash);
  ctx.lineCap = "round"; ctx.lineJoin = "round";

  // Rear foot and tail sit behind the body; the near foot takes the opposite stride.
  for (const [footX, footY, stride] of [[10, 20, -pose.stride], [-8, 22, pose.stride]]) {
    ctx.strokeStyle = "#9a6118"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(footX, 11); ctx.lineTo(footX + stride * 0.45, footY - 2); ctx.stroke();
    oval(footX + stride, footY, 8, 3.8, shade(footX + stride, footY, 9, "#ffe56b", "#f6b831", "#b57414"), true, -stride / 40);
    ctx.strokeStyle = "#bb801a"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(footX + stride + 1, footY - 1); ctx.lineTo(footX + stride + 4, footY + 2); ctx.stroke();
  }
  const feather = shade(-18, -2, 20, "#ffffff", "#f0f7f5", "#adccce");
  for (const [tx, ty, angle] of [[-24, -9, -0.65], [-27, -1, -0.3], [-25, 6, 0]]) oval(tx, ty, 7, 14, feather, true, angle);

  const white = shade(-1, -2, 33, "#ffffff", "#f3faf9", "#b4d0d0");
  oval(0, -1, 29, 23, white);
  oval(10, -12, 23, 24, white);
  oval(4, 12, 23, 7, shade(4, 9, 26, "#ffffff", "#e8f4f3", "#bed5d4"), false);
  for (const [fx, fy] of [[-13, 16], [-2, 19], [9, 18], [20, 13]]) oval(fx, fy, 6, 3.5, "#edf7f5", false, -0.25);

  const comb = shade(3, -36, 21, "#ff6155", "#ec2430", "#a7101e");
  ctx.beginPath(); ctx.moveTo(-11, -27);
  ctx.bezierCurveTo(-24, -34, -15, -42, -5, -37);
  ctx.bezierCurveTo(-13, -50, 9, -49, 17, -39);
  ctx.bezierCurveTo(24, -33, 21, -26, 13, -23);
  ctx.closePath(); ctx.fillStyle = comb; ctx.fill(); ctx.strokeStyle = "#741d22"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-7, -43); ctx.quadraticCurveTo(4, -46, 13, -38); ctx.strokeStyle = "#ffa398"; ctx.lineWidth = 1; ctx.stroke();

  oval(11, -20, 20, 17, shade(6, -24, 25, "#ffffff", "#f8fcf4", "#d8e3bd"));
  // A slightly smaller far eye and overlapping near eye give the face its three-quarter depth.
  for (const [ex, ey, rx, ry] of [[23, -22, 7.5, 10.5], [5, -21, 11, 13.5]]) {
    ctx.save(); ctx.translate(ex, ey); ctx.scale(1, pose.eye);
    oval(0, 0, rx, ry, shade(-2, -2, ry + 2, "#fffdb8", "#ffec75", "#d1b648"));
    oval(2.4, -1, rx * 0.3, ry * 0.43, "#262d28", false);
    oval(3, -3, 1.4, 1.8, "#ffffff", false);
    ctx.restore();
  }
  const beak = shade(24, -10, 13, "#fff286", "#ffc52e", "#d18a11");
  ctx.beginPath(); ctx.moveTo(19, -15); ctx.quadraticCurveTo(31, -19, 35, -9);
  ctx.quadraticCurveTo(30, -4, 23, -5); ctx.lineTo(19, -15); ctx.fillStyle = beak; ctx.fill(); ctx.strokeStyle = "#986c17"; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(24, -6); ctx.quadraticCurveTo(30, -8, 34, -9); ctx.strokeStyle = "#d69619"; ctx.lineWidth = 1; ctx.stroke();
  oval(20, -1, 4.5, 7, shade(19, -2, 8, "#ff7970", "#f33842", "#b21b29"), false, 0.3);

  ctx.save(); ctx.translate(-11, 3); ctx.rotate(-pose.wing);
  oval(0, 0, 15, 10, shade(-2, -4, 20, "#ffffff", "#e8f5f3", "#b6d2d3"), false, -0.3);
  ctx.strokeStyle = "#c1d8d8"; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-12, 2); ctx.bezierCurveTo(-7, 10, 7, 10, 13, 1); ctx.stroke();
  ctx.restore();
  ctx.restore();
}

function draw(ctx: CanvasRenderingContext2D, v: Vis, view: View, now: number) {
  const { w, h } = view;
  const rowY = MANHOLE_Y * h / H;
  ctx.clearRect(0, 0, w, h);
  ctx.save(); ctx.translate(-v.camX, 0);
  const road0 = SIDE_W, road1 = SIDE_W + v.lanes * LANE_W;
  const asphalt = ctx.createLinearGradient(road0, 0, road1, 0);
  asphalt.addColorStop(0, "#56617c"); asphalt.addColorStop(0.5, "#505c77"); asphalt.addColorStop(1, "#56617c");
  ctx.fillStyle = asphalt; ctx.fillRect(v.camX - 20, 0, w + 40, h);
  drawGrass(ctx, 0, road0, h, "l", now);
  drawGrass(ctx, road1, road1 + SIDE_W, h, "r", now);
  for (const edge of [road0 - 10, road1]) for (let y = 0; y < h; y += 36) {
    ctx.fillStyle = y % 72 === 0 ? "#d0d2c0" : "#969e91";
    ctx.fillRect(edge, y, 10, 34);
  }
  ctx.strokeStyle = "rgba(210,220,240,.48)"; ctx.lineWidth = 3; ctx.setLineDash([20, 20]); ctx.beginPath();
  for (let l = 0; l <= v.lanes; l++) { const x = road0 + l * LANE_W; ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  ctx.stroke(); ctx.setLineDash([]);
  // decorations
  drawBush(ctx, road0 - 65, 82);
  drawTree(ctx, road1 + 72, 90);
  // manholes
  const next = v.status === "active" && !v.hop ? v.pos + 1 : -1;
  for (let l = 1; l <= v.lanes; l++) drawTile(ctx, laneX(l), rowY, fmtMult(v.table[l - 1]), v.passed[l], l === next, now, false);
  // parked cars + barriers
  const carScale = roadCarScale(view.scale);
  for (let l = 1; l <= v.lanes; l++) if (v.passed[l]) { const p = v.parked[l]; if (p) drawCar(ctx, p.type, laneX(l), p.y * h / H, carScale); drawDashBarrier(ctx, laneX(l), rowY - 72, now); }
  // moving cars
  for (let l = 1; l <= v.lanes; l++) for (const c of v.moving[l]) drawCar(ctx, c.type, laneX(l), c.y * h / H, carScale);
  // chicken
  const t = v.hop ? Math.min(1, (now - v.hop.start) / v.hop.dur) : 0;
  if (v.dead) drawChicken(ctx, v.cx, rowY, 1, true);
  else drawRoadChicken(ctx, v.cx, rowY, now, v.hop ? t : null, roadChickenScale(view.scale));
  if (v.status === "active" || v.status === "cashed" || v.status === "finished") {
    const label = displayedMultiplier(v.table, v.pos, v.status);
    ctx.font = "900 20px system-ui";
    const width = Math.max(64, ctx.measureText(label).width + 22);
    ctx.fillStyle = "#3b5998"; rr(ctx, v.cx - width / 2, rowY + 34, width, 34, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(v.cx - 9, rowY + 34); ctx.lineTo(v.cx + 9, rowY + 34); ctx.lineTo(v.cx, rowY + 22); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, v.cx, rowY + 50);
  }
  if (v.killer) drawCar(ctx, v.killer.type, laneX(v.killer.lane), v.killer.y * h / H, carScale);
  ctx.restore();
}

/* ---------------- component ---------------- */
export function ChickenRoadGame({ backHref = "/player" }: { backHref?: string }) {
  const [st, setSt] = useState<State | null>(null);
  const [game, setGame] = useState<G | null>(null);
  const [phase, setPhase] = useState<"idle" | "active">("idle");
  const [amount, setAmount] = useState(100);
  const [customAmount, setCustomAmount] = useState(100);
  const [diff, setDiff] = useState<Difficulty>("easy");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; m: string } | null>(null);
  const [showRules, setShowRules] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const visRef = useRef<Vis | null>(null);
  const viewRef = useRef<View>({ w: 860, h: H, scale: 1, dpr: 1 });
  const busyRef = useRef(false);
  const loadedRef = useRef(false);
  const stRef = useRef<State | null>(null);
  const setBusyBoth = (b: boolean) => { busyRef.current = b; setBusy(b); };

  const refresh = useCallback(async () => {
    const r = await localApi("/api/chicken/state", { cache: "no-store" });
    if (!r.ok) return;
    const s: State = await r.json();
    stRef.current = s;
    setSt(s);
    if (typeof s.balance === "number") broadcastBalanceUpdate(s.balance, "Chicken Road 2");
    if (!loadedRef.current) {
      loadedRef.current = true;
      if (s.game?.status === "active" && s.game.bet > 0) {
        const v = newVis(s.tables[s.game.difficulty]);
        applyGame(v, s.game);
        visRef.current = v;
        setGame(s.game); setDiff(s.game.difficulty); setAmount(s.game.bet); setPhase("active");
      } else {
        visRef.current = newVis(s.tables.easy);
        setGame(null); setPhase("idle");
      }
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // resize
  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ro = new ResizeObserver(() => {
      const cssW = wrap.clientWidth;
      const cssAvailH = wrap.clientHeight;
      if (cssW < 1 || cssAvailH < 1) return;
      const scaleW = cssW / 900;
      const scaleH = cssAvailH / H;
      const scale = Math.min(1, Math.max(0.1, Math.min(scaleW, scaleH)));
      const cssH = cssAvailH;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(cssW * dpr)) canvas.width = Math.round(cssW * dpr);
      if (canvas.height !== Math.round(cssH * dpr)) canvas.height = Math.round(cssH * dpr);
      canvas.style.height = cssH + "px";
      viewRef.current = { w: cssW / scale, h: cssH / scale, scale, dpr };
    });
    if (typeof requestAnimationFrame !== "undefined") requestAnimationFrame(() => { try { (window as unknown as Window).dispatchEvent(new Event("resize")); } catch { } }); ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // game loop
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const v = visRef.current, view = viewRef.current;
      if (!v) return;
      const dt = Math.min(50, v.lastT ? now - v.lastT : 16); v.lastT = now;
      update(v, dt, now, view);
      ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, 0, 0);
      draw(ctx, v, view, now);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const post = async (url: string, body?: unknown) => {
    const r = await localApi(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return r.json();
  };

  const start = async () => {
    const s = stRef.current; if (!s || busyRef.current) return;
    setBusyBoth(true); setMsg(null);
    const j = await post("/api/chicken/start", { amount, difficulty: diff });
    if (j.error) { setMsg({ t: "err", m: j.error }); setBusyBoth(false); return; }
    const v = newVis(s.tables[diff], visRef.current); v.status = "active"; visRef.current = v;
    playGameSound("launch"); speakGameVoice("chickenJump");
    setGame(j.game); setPhase("active"); setBusyBoth(false);
    refresh();
  };

  const step = useCallback(async () => {
    const v = visRef.current;
    if (!v || busyRef.current || v.status !== "active" || v.hop) return;
    setBusyBoth(true); setMsg(null);
    playGameSound("jump"); speakGameVoice("chickenJump");
    const j = await post("/api/chicken/step");
    if (j.error) { setMsg({ t: "err", m: j.error }); setBusyBoth(false); return; }
    const g: G = j.game; setGame(g);
    const target = g.position;
    if (j.event === "dead") {
      v.moving[target] = v.moving[target].filter((c) => c.y >= MANHOLE_Y + 50);
      hopTo(v, target, () => {
        v.killer = {
          lane: target, y: -120, type: pick(CAR_TYPES), hit: false, done: () => {
            playGameSound("crash"); speakGameVoice("chickenCrash");
            v.status = "dead"; setPhase("idle"); setBusyBoth(false);
            setMsg({ t: "err", m: g.poolPending ? "Round ended — daily pool payout pending" : "No win" }); refresh();
            window.dispatchEvent(new CustomEvent("wx:game-result", { detail: { game: "Chicken Road 2", bet: g.bet, win: 0, won: false, poolPending: g.poolPending, poolClaim: 0 } }));
          }
        };
      });
    } else {
      blockLane(v, target, viewRef.current);
      hopTo(v, target, () => {
        if (j.event === "finished") {
          hopTo(v, target + 1, () => {
            playGameSound("coin"); if (!g.poolPending) speakGameVoice("chickenWin");
            v.status = "finished"; v.finishedAt = performance.now(); burst(v, v.cx, MANHOLE_Y); setPhase("idle"); setBusyBoth(false);
            setMsg({ t: "ok", m: g.poolPending ? `Road crossed! Claim ${money(g.poolClaim ?? 0)} — daily payout pending` : `Poori road cross! ${money(g.win)} jeete!` }); refresh();
            window.dispatchEvent(new CustomEvent("wx:game-result", { detail: { game: "Chicken Road 2", bet: g.bet, win: g.win ?? 0, won: (g.win ?? 0) > 0, poolPending: g.poolPending, poolClaim: g.poolClaim } }));
          });
        } else setBusyBoth(false);
      });
    }
  }, [refresh]);
  const stepRef = useRef(step); stepRef.current = step;

  const cashout = async () => {
    const v = visRef.current;
    if (!v || busyRef.current || v.status !== "active" || v.hop) return;
    setBusyBoth(true);
    const j = await post("/api/chicken/cashout");
    if (j.error) setMsg({ t: "err", m: j.error });
    else {
      playGameSound("cashout"); if (!j.poolPending) speakGameVoice("chickenWin");
      v.status = "cashed"; burst(v, v.cx, MANHOLE_Y); setGame(j.game); setPhase("idle");
      setMsg({ t: "ok", m: j.poolPending ? `Claim ${money(j.poolClaim)} locked @ ${fmtMult(j.multiplier)} — daily payout pending` : `Cashed out @ ${fmtMult(j.multiplier)} — ${money(j.win)} jeete!` });
      window.dispatchEvent(new CustomEvent("wx:game-result", { detail: { game: "Chicken Road 2", bet: j.game.bet, win: j.win, won: j.win > 0, poolPending: j.poolPending, poolClaim: j.poolClaim } }));
    }
    setBusyBoth(false); refresh();
  };

  // keyboard: Space / → / D / W = GO
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if ([" ", "ArrowRight", "ArrowUp", "d", "D", "w", "W"].includes(e.key)) { e.preventDefault(); stepRef.current(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const v = visRef.current, view = viewRef.current, canvas = canvasRef.current;
    if (!v || !canvas || v.status !== "active") return;
    const rect = canvas.getBoundingClientRect();
    const wx = (e.clientX - rect.left) / view.scale + v.camX;
    const lane = Math.floor((wx - SIDE_W) / LANE_W) + 1;
    if (lane === v.pos + 1) step();
  };

  const changeDiff = (d: Difficulty) => {
    if (phase === "active" || !stRef.current) return;
    setDiff(d);
    visRef.current = newVis(stRef.current.tables[d], visRef.current);
    setMsg(null);
  };

  const balance = st?.balance ?? 0;
  const min = st?.limits.min ?? 10, max = Math.max(min, Math.floor(st?.balance ?? 0));
  const potential = game && phase === "active" ? Math.floor(game.bet * game.currentMultiplier * 100) / 100 : 0;
  const nextWin = game && phase === "active" && game.nextMultiplier ? Math.floor(game.bet * game.nextMultiplier * 100) / 100 : 0;
  const lanesInfo = st ? st.difficulties[diff] : null;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden min-h-0 bg-[#10131b] text-white select-none">
      {/* Top Bar */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-[#2b3140] bg-[#10131b] px-3">
        <div className="flex items-center gap-2">
          <Link
            href={backHref}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#ef4444] bg-[#dc2626] text-xs font-black text-white transition hover:bg-[#b91c1c]"
            aria-label="Back"
          >
            ←
          </Link>
          <div className="flex items-center text-sm sm:text-base font-black tracking-tight text-white">
            <span className="text-[#ffc933]">CHICKEN</span><span className="mx-1">ROAD 2</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {game && phase === "active" && (
            <div className="hidden rounded-lg bg-[#0f1113] px-2.5 py-1 text-xs text-slate-300 sm:block">
              Lane <b className="text-white">{game.position}</b>/{game.lanes} · <b className="text-yellow-400">{fmtMult(game.currentMultiplier)}</b>
            </div>
          )}
          <div className="flex items-center gap-1.5 rounded-lg bg-[#0f1113] px-2.5 py-1 text-xs sm:text-sm font-bold text-white">
            <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-yellow-600 bg-yellow-400" />
            {balance.toLocaleString()}
          </div>
          <button onClick={() => setShowRules((s) => !s)} className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0f1113] text-xs font-bold text-slate-300 hover:text-white transition" title="Rules">i</button>
        </div>
      </header>

      {/* Canvas Stage */}
      <div ref={wrapRef} className="relative flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden bg-[#0d1017]">
        <canvas ref={canvasRef} onClick={onCanvasClick} className={`block w-full ${phase === "active" && !busy ? "cursor-pointer" : ""}`} />
        {!st && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">Loading…</div>}
        {msg && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3 z-10">
            <div className={`rounded-xl px-4 py-1.5 text-center text-xs sm:text-sm font-bold shadow-lg ${msg.t === "ok" ? "bg-emerald-500 text-slate-950" : "bg-red-600 text-white"}`}>{msg.m}</div>
          </div>
        )}
        {phase === "active" && !busy && (
          <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-lg bg-black/60 px-3 py-1 text-[10px] sm:text-xs font-semibold text-white">
            Next manhole par click karein ya <kbd className="rounded bg-white/20 px-1">SPACE</kbd> / <kbd className="rounded bg-white/20 px-1">→</kbd>
          </div>
        )}
        {showRules && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 p-4" onClick={() => setShowRules(false)}>
            <div className="max-w-md rounded-2xl bg-[#1b1f23] p-5 text-sm text-slate-300" onClick={(e) => e.stopPropagation()}>
              <h3 className="mb-2 text-lg font-black text-white">Kaise khelein</h3>
              <ul className="list-disc space-y-1 pl-5">
                <li>Bet aur difficulty select karke <b className="text-emerald-400">PLAY</b> dabayein.</li>
                <li>Har <b className="text-white">GO</b> par chicken agle manhole par jati hai — multiplier barhta hai aur peeche barrier lag jata hai.</li>
                <li>Kisi bhi lane par gaari aa sakti hai — us se pehle <b className="text-yellow-400">CASH OUT</b> karein.</li>
                <li>Poori road cross karne par max multiplier automatically mil jata hai.</li>
                <li>Easy 24 lanes (max 24.5x) · Medium 22 (max 2,254x) · Hard 20 (max 52,067x) · Hardcore 15 (max 3.2M x).</li>
              </ul>
              <button onClick={() => setShowRules(false)} className="mt-4 w-full rounded-xl bg-emerald-500 py-2 font-bold text-slate-950 hover:bg-emerald-400">OK</button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="shrink-0 flex flex-col gap-2 border-t border-[#2b3140]/60 bg-[#10131b] px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center">
        {/* Difficulty */}
        <div className={`order-1 flex w-full items-center gap-1 rounded-xl border border-[#2b3140] bg-[#1f2533] p-1 sm:w-auto ${phase === "active" ? "pointer-events-none opacity-50" : ""}`}>
          {DIFFS.map((d) => {
            const dot = d === "easy" ? "bg-[#3ecf5a]" : d === "medium" ? "bg-[#f5c518]" : d === "hard" ? "bg-[#f97316]" : "bg-[#ef4444]";
            return (
              <button key={d} onClick={() => changeDiff(d)} title={`${d} · ${st?.difficulties[d].lanes ?? ""} lanes`} className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10px] sm:text-xs font-bold capitalize transition lg:flex-none lg:px-2.5 ${diff === d ? "bg-[#2b3136] text-white ring-1 ring-white/20" : "text-slate-400 hover:text-white"}`}>
                <span className={`h-2 w-2 rounded-full ${dot} ${diff === d ? "shadow-[0_0_8px_currentColor]" : "opacity-60"}`} />{d}
              </button>
            );
          })}
        </div>

        {/* Bet Box */}
        <div className={`order-0 w-full rounded-xl border border-[#2b3140] bg-[#1f2533] px-2 py-1.5 sm:w-64 ${phase === "active" ? "pointer-events-none opacity-50" : ""}`}>
          <div className="flex items-center gap-1">
            <button onClick={() => setAmount(min)} className="rounded px-1.5 py-0.5 text-[9px] font-bold text-slate-400 hover:text-white">MIN</button>
            <input type="number" value={amount} min={min} max={max} onChange={(e) => setAmount(Number(e.target.value))} className="w-full min-w-0 flex-1 bg-transparent text-center text-sm sm:text-base font-bold text-white outline-none" />
            <button onClick={() => setAmount(Math.max(min, Math.min(max, Math.floor(balance))))} className="rounded px-1.5 py-0.5 text-[9px] font-bold text-slate-400 hover:text-white">MAX</button>
          </div>
          <div className="mt-1 flex items-center justify-center gap-1">
            {BET_PRESETS.map((v) => (
              <button key={v} onClick={() => setAmount(v)} className={`flex-1 rounded py-0.5 text-[10px] font-bold transition hover:scale-105 ${amount === v ? "bg-emerald-500 text-slate-950 font-black" : "bg-[#2b3136] text-slate-200 hover:bg-[#363d43]"}`}>{v}</button>
            ))}
          </div>
        </div>

        {/* Action Buttons: START -> GREEN, STOP/CASHOUT -> RED/ORANGE */}
        <div className="order-2 flex w-full flex-1 gap-2">
          {phase === "idle" ? (
            <button disabled={busy || !st} onClick={start} className="h-11 sm:h-12 flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-base sm:text-lg font-black text-white shadow-lg shadow-emerald-500/30 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-60 cursor-pointer">
              PLAY
              <span className="ml-2 text-[10px] font-semibold opacity-90">({money(amount)} · max {st ? fmtMult(st.tables[diff][st.tables[diff].length - 1]) : ""})</span>
            </button>
          ) : (
            <>
              <button disabled={busy} onClick={() => step()} className="h-11 sm:h-12 flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-sm sm:text-base font-black text-white shadow-lg shadow-emerald-500/30 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-60 cursor-pointer">
                GO →
                <span className="ml-1 text-[10px] font-semibold opacity-90">{game?.nextMultiplier ? `${fmtMult(game.nextMultiplier)}` : ""}</span>
              </button>
              <button disabled={busy || (game?.position ?? 0) < 1} onClick={cashout} className="h-11 sm:h-12 flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 text-sm sm:text-base font-black shadow-lg shadow-orange-500/40 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40 cursor-pointer">
                {game?.poolVersion ? "LOCK CLAIM" : "CASH OUT"} <span className="text-xs sm:text-sm font-black">{money(potential)}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
