"use client";

import { localApi } from "@/lib/client";
import { playGameSound, speakGameVoice } from "@/lib/gameAudio";
import { broadcastBalanceUpdate } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/* ---------------- types ---------------- */
type Level = "easy" | "normal" | "hard";
type G = {
  poolPending?: boolean; poolClaim?: number; poolVersion?: string;
  id: string; level: Level; bet: number; lanes: number; position: number; status: "active" | "cashed" | "dead"; win: number;
  multiplier: number; nextMultiplier: number | null; potential: number; bagLane: number | null; bagMult: number; bagCollected: boolean;
  crashLane: number | null; dashes: { from: number; to: number }[];
};
type Recent = { id: string; level: string; bet: number; win: number; status: string; position: number; multiplier: number };
type State = {
  game: G | null; balance: number; ladders: Record<Level, number[]>;
  levels: Record<Level, { label: string; steps: number; max: number }>; limits: { min: number; max: number }; recent: Recent[];
};
const LEVELS: Level[] = ["easy", "normal", "hard"];

/* ---------------- scene constants ---------------- */
const H = 440, LANE_W = 84, SIDE_W = 150, ROW_Y = 250, TILE = 60;
type CarType = "sedan" | "taxi" | "pickup" | "bus" | "truck";
const CAR_TYPES: CarType[] = ["sedan", "taxi", "pickup", "bus", "truck", "sedan", "sedan"];
const CAR_COLORS = ["#ff5a4d", "#2aa9e9", "#ffc633", "#35c46b", "#ff8a3d", "#9b6bff", "#ff4d7d", "#16c5b8"];
type Car = { type: CarType; color: string; y: number; speed: number; dir: 1 | -1 };
type Fx = { x: number; y: number; vx: number; vy: number; life: number; kind: "feather" | "coin" | "spark"; rot: number };
type Van = { lane: number; y: number; dropped: boolean } | null;
type View = { w: number; h: number; scale: number; dpr: number };
type Vis = {
  lanes: number; ladder: number[]; pos: number; cx: number;
  hop: { fromX: number; toX: number; start: number; dur: number; dash?: boolean; done?: () => void } | null;
  passed: boolean[]; traffic: Car[][]; nextSpawn: number[]; dir: (1 | -1)[];
  killer: { lane: number; y: number; type: CarType; color: string; hit: boolean; done?: () => void } | null;
  dead: boolean; ghostT: number; fx: Fx[]; camX: number; camInit: boolean; lastT: number;
  status: "idle" | "active" | "cashed" | "dead" | "finished";
  finishedAt: number | null;
  bagLane: number; bagMult: number; bagVisible: boolean; bagCollected: boolean; van: Van;
  floats: { x: number; y: number; text: string; color: string; life: number }[];
  dashUntil: number;
};

const laneX = (l: number) => SIDE_W + (l - 0.5) * LANE_W;
const posX = (p: number, lanes: number) => (p <= 0 ? SIDE_W - 46 : p > lanes ? SIDE_W + lanes * LANE_W + 46 : laneX(p));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const trim = (n: number, d: number) => String(parseFloat((n ?? 0).toFixed(d)));
const fmtMult = (m: number) => { m = m ?? 0; return "x" + (m >= 10000 ? trim(m / 1000, 1) + "K" : m >= 1000 ? m.toLocaleString("en-US", { maximumFractionDigits: 0 }) : m >= 100 ? trim(m, 1) : trim(m, 2)); };
const money = (n: number) => "Rs. " + n.toLocaleString("en-PK", { maximumFractionDigits: 2 });

function newVis(ladder: number[], prev?: Vis | null): Vis {
  const lanes = ladder.length;
  const traffic: Car[][] = Array.from({ length: lanes + 2 }, () => []);
  const dir: (1 | -1)[] = Array.from({ length: lanes + 2 }, () => 1);
  for (let l = 1; l <= lanes; l++) if (Math.random() < 0.5) traffic[l].push({ type: pick(CAR_TYPES), color: pick(CAR_COLORS), y: rnd(-40, H + 40), speed: rnd(120, 210), dir: dir[l] });
  return {
    lanes, ladder, pos: 0, cx: posX(0, lanes), hop: null, passed: Array(lanes + 2).fill(false), traffic,
    nextSpawn: Array.from({ length: lanes + 2 }, () => performance.now() + rnd(300, 3000)), dir,
    killer: null, dead: false, ghostT: 0, fx: [], camX: prev?.camX ?? 0, camInit: prev?.camInit ?? false, lastT: 0, status: "idle", finishedAt: null,
    bagLane: 0, bagMult: 0, bagVisible: false, bagCollected: false, van: null, floats: [], dashUntil: 0,
  };
}
function applyGame(v: Vis, g: G) {
  v.status = "active"; v.pos = g.position; v.cx = posX(g.position, v.lanes); v.dead = false; v.killer = null; v.hop = null;
  for (let l = 1; l <= v.lanes; l++) v.passed[l] = l <= g.position;
  v.bagLane = g.bagLane ?? 0; v.bagMult = g.bagMult; v.bagCollected = g.bagCollected; v.bagVisible = !!g.bagLane && !g.bagCollected && g.bagLane > g.position;
}
function hopTo(v: Vis, p: number, dash: boolean, done?: () => void) {
  v.hop = { fromX: v.cx, toX: posX(p, v.lanes), start: performance.now(), dur: dash ? 260 + 120 * Math.abs(p - v.pos) : 330, dash, done: () => { v.pos = p; done?.(); } };
}
function burst(v: Vis, x: number, y: number, kind: Fx["kind"], n: number) {
  for (let i = 0; i < n; i++) v.fx.push({ x, y, vx: rnd(-190, 190), vy: kind === "feather" ? rnd(-260, -40) : rnd(-430, -150), life: 1, kind, rot: rnd(0, 6.28) });
}
function float(v: Vis, x: number, y: number, text: string, color: string) { v.floats.push({ x, y, text, color, life: 1 }); }

/* ---------------- update ---------------- */
function update(v: Vis, dt: number, now: number, view: View) {
  if (v.status === "finished" && v.finishedAt !== null && now - v.finishedAt >= 1800) {
    Object.assign(v, newVis(v.ladder, v), { lastT: v.lastT });
  }
  const s = dt / 1000;
  if (v.hop) {
    const t = Math.min(1, (now - v.hop.start) / v.hop.dur);
    const e = t * t * (3 - 2 * t);
    v.cx = v.hop.fromX + (v.hop.toX - v.hop.fromX) * e;
    if (t >= 1) { const d = v.hop.done; v.hop = null; d?.(); }
  }
  const chickenLane = v.hop ? -1 : v.pos;
  for (let l = 1; l <= v.lanes; l++) {
    const cars = v.traffic[l];
    const dashing = now < v.dashUntil && l > chickenLane && l <= chickenLane + 3;
    if (now >= v.nextSpawn[l]) {
      v.nextSpawn[l] = now + rnd(1500, 4800);
      const blocked = (v.passed[l] && l !== v.lanes + 1) || dashing || l === v.pos;
      if (!blocked && !cars.some((c) => (v.dir[l] === 1 ? c.y < 120 : c.y > H - 120)))
        cars.push({ type: pick(CAR_TYPES), color: pick(CAR_COLORS), y: v.dir[l] === 1 ? -120 : H + 120, speed: rnd(120, 210), dir: v.dir[l] });
    }
    for (const c of cars) {
      const heightRatio = view.h / H;
      const barrierY = ROW_Y * heightRatio - 70;
      const halfHeight = CAR_DIMS[c.type][1] / 2;
      const stopY = (barrierY - 28 - 14 / view.scale - halfHeight - 5) / heightRatio;
      const carRear = c.y * heightRatio - halfHeight - 1;
      const mustStop = (v.passed[l] || l === v.pos) && carRear <= barrierY + 30;
      if (mustStop) {
        const stopAt = stopY;
        c.y = Math.min(c.y, stopAt);
        const gap = stopAt - c.y;
        const sp = Math.min(c.speed, Math.max(0, gap * 3));
        c.y = Math.min(stopAt, c.y + sp * s);
      } else c.y += c.speed * s * c.dir;
    }
    v.traffic[l] = cars.filter((c) => c.y > -160 && c.y < H + 160);
  }
  if (v.killer) {
    const k = v.killer;
    k.y += 760 * s;
    if (!k.hit && k.y + 36 >= ROW_Y) { k.hit = true; v.dead = true; burst(v, v.cx, ROW_Y, "feather", 16); }
    if (k.y > H + 140) { const d = k.done; v.killer = null; d?.(); }
  }
  if (v.dead) v.ghostT += s;
  if (v.van) {
    v.van.y += 300 * s;
    if (!v.van.dropped && v.van.y >= ROW_Y - 6) { v.van.dropped = true; v.bagVisible = true; float(v, laneX(v.van.lane), ROW_Y - 50, "BONUS BAG!", "#fbbf24"); }
    if (v.van.y > H + 140) v.van = null;
  }
  for (const f of v.fx) { f.vy += (f.kind === "feather" ? 260 : 980) * s; f.x += f.vx * s; f.y += f.vy * s; f.rot += s * 4; f.life -= s / (f.kind === "feather" ? 1.6 : 1.1); }
  v.fx = v.fx.filter((f) => f.life > 0);
  for (const f of v.floats) { f.y -= 40 * s; f.life -= s / 1.4; }
  v.floats = v.floats.filter((f) => f.life > 0);
  const worldW = SIDE_W * 2 + v.lanes * LANE_W;
  const maxCam = worldW - view.w;
  const target = maxCam <= 0 ? maxCam / 2 : Math.max(0, Math.min(maxCam, v.cx - view.w * 0.4));
  if (!v.camInit) { v.camX = target; v.camInit = true; } else v.camX += (target - v.camX) * Math.min(1, s * 6);
}

/* ---------------- drawing helpers ---------------- */
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.arcTo(x + w, y, x + w, y + h, rad); ctx.arcTo(x + w, y + h, x, y + h, rad); ctx.arcTo(x, y + h, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath();
}
const circle = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, r = 24) {
  ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(x + 5, y + 6, r, r * .85, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#2f8f3a"; circle(ctx, x, y, r); ctx.fill();
  ctx.fillStyle = "#4db056"; circle(ctx, x - r * .3, y - r * .3, r * .5); ctx.fill();
  ctx.fillStyle = "#227a2e"; circle(ctx, x + r * .35, y + r * .3, r * .28); ctx.fill();
}
function drawBush(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#3c9a46"; rr(ctx, x - 18, y - 10, 36, 22, 11); ctx.fill();
  ctx.fillStyle = "#5cb86a"; rr(ctx, x - 12, y - 8, 14, 9, 5); ctx.fill();
}
function drawFence(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number) {
  ctx.fillStyle = "#c98a4b";
  for (let y = y0; y < y1; y += 22) { rr(ctx, x - 3, y, 6, 16, 2); ctx.fill(); }
  ctx.fillStyle = "#b8783c"; ctx.fillRect(x - 4, y0 + 4, 8, y1 - y0 - 4);
}
function drawCoop(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "rgba(0,0,0,.2)"; rr(ctx, x - 30, y - 10, 66, 52, 6); ctx.fill();
  ctx.fillStyle = "#d9534f"; ctx.beginPath(); ctx.moveTo(x - 36, y); ctx.lineTo(x, y - 32); ctx.lineTo(x + 36, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#f2c66d"; rr(ctx, x - 30, y, 60, 42, 4); ctx.fill();
  ctx.fillStyle = "#6b3e1e"; rr(ctx, x - 9, y + 14, 18, 28, 3); ctx.fill();
  ctx.fillStyle = "#fff7d6"; circle(ctx, x + 18, y + 14, 6); ctx.fill();
}
function drawFlag(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#6b7280"; rr(ctx, x - 2, y - 44, 4, 60, 2); ctx.fill();
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { ctx.fillStyle = (i + j) % 2 ? "#111" : "#fff"; ctx.fillRect(x + 2 + i * 8, y - 44 + j * 8, 8, 8); }
}
export function drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, passed: boolean, next: boolean, now: number, isBag: boolean) {
  // metal manhole cover (reference art)
  const R = 30;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.30)"; ctx.beginPath(); ctx.arc(x + 2, y + 4, R, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(x - 8, y - 8, 4, x, y, R);
  g.addColorStop(0, "#657499"); g.addColorStop(0.55, "#4b587b"); g.addColorStop(1, "#354263");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = "#8798c0"; ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.beginPath(); ctx.arc(x, y, R - 7, 0, Math.PI * 2); ctx.stroke();
  if (next) { const a = .55 + .45 * Math.sin(now / 150); ctx.lineWidth = 3; ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.arc(x, y, R + 3, 0, Math.PI * 2); ctx.stroke(); }
  // multiplier label in centre (white bold like the reference)
  ctx.fillStyle = passed ? "#b9f6c4" : "#ffffff";
  ctx.font = "700 15px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.strokeText(label, x, y + 1);
  ctx.fillText(label, x, y + 1);
  ctx.restore();
  void isBag;
}

export function drawBarrier(ctx: CanvasRenderingContext2D, x: number, y: number, now: number) {
  ctx.save(); ctx.translate(x, y);
  const w = 76, h = 24;
  // legs
  ctx.fillStyle = "#aab4c4"; rr(ctx, -28, h / 2 - 2, 10, 20, 3); ctx.fill(); rr(ctx, 18, h / 2 - 2, 10, 20, 3); ctx.fill();
  // Blue construction barriers with dark diagonal slats.
  ctx.fillStyle = "#35b8f0"; rr(ctx, -w / 2, -h / 2 - 14, w, 10, 4); ctx.fill(); rr(ctx, -w / 2, h / 2 - 14, w, 10, 4); ctx.fill();
  // hazard middle
  ctx.fillStyle = "#4a5568"; rr(ctx, -w / 2, -6, w, 12, 2); ctx.fill();
  ctx.save(); rr(ctx, -w / 2, -6, w, 12, 2); ctx.clip();
  ctx.fillStyle = "#35b8f0";
  for (let i = -3; i < 5; i++) { ctx.save(); ctx.translate(i * 22, 0); ctx.rotate(-0.6); ctx.fillRect(-5, -14, 10, 30); ctx.restore(); }
  ctx.restore();
  // metal clamps
  ctx.fillStyle = "#cdd6e3"; rr(ctx, -30, -h / 2 - 16, 8, h + 4, 2); ctx.fill(); rr(ctx, 22, -h / 2 - 16, 8, h + 4, 2); ctx.fill();
  ctx.restore();
  void now;
}

function drawBag(ctx: CanvasRenderingContext2D, x: number, y: number, bob: number) {
  const yy = y + Math.sin(bob) * 3;
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(x, yy + 14, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#b07a3b"; ctx.beginPath(); ctx.ellipse(x, yy + 2, 15, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#8f5f2a"; rr(ctx, x - 7, yy - 15, 14, 8, 3); ctx.fill();
  ctx.fillStyle = "#d9a15e"; ctx.beginPath(); ctx.ellipse(x - 4, yy - 1, 5, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fef3c7"; ctx.font = "900 14px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("Rs", x, yy + 3);
}
const CAR_DIMS: Record<CarType, [number, number]> = { sedan: [42, 70], taxi: [42, 70], pickup: [44, 82], bus: [46, 118], truck: [46, 128] };
function drawCar(ctx: CanvasRenderingContext2D, c: { type: CarType; color: string; dir: 1 | -1 }, cx: number, cy: number) {
  const [w, h] = CAR_DIMS[c.type];
  ctx.save(); ctx.translate(cx, cy); if (c.dir === -1) ctx.rotate(Math.PI);
  const x = -w / 2, y = -h / 2;
  ctx.fillStyle = "rgba(0,0,0,.28)"; rr(ctx, x + 3, y + 5, w, h, 9); ctx.fill();
  ctx.fillStyle = "#151515"; for (const [wx, wy] of [[x - 3, y + 10], [x + w - 4, y + 10], [x - 3, y + h - 26], [x + w - 4, y + h - 26]]) { rr(ctx, wx, wy, 7, 16, 2); ctx.fill(); }
  const body = c.type === "taxi" ? "#facc15" : c.type === "bus" ? "#2563eb" : c.type === "truck" ? "#e5e7eb" : c.color;
  ctx.fillStyle = body; rr(ctx, x, y, w, h, 9); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 1.5; ctx.stroke();
  if (c.type === "truck") {
    ctx.fillStyle = c.color; rr(ctx, x + 2, y + 34, w - 4, h - 38, 5); ctx.fill();
    ctx.fillStyle = "#93c5fd"; rr(ctx, x + 6, y + 8, w - 12, 12, 3); ctx.fill();
  } else if (c.type === "bus") {
    ctx.fillStyle = "#bfdbfe"; for (let yy = y + 16; yy < y + h - 20; yy += 16) { rr(ctx, x + 5, yy, 8, 10, 2); ctx.fill(); rr(ctx, x + w - 13, yy, 8, 10, 2); ctx.fill(); }
    ctx.fillStyle = "#93c5fd"; rr(ctx, x + 6, y + 4, w - 12, 10, 3); ctx.fill();
  } else if (c.type === "pickup") {
    ctx.fillStyle = "rgba(0,0,0,.35)"; rr(ctx, x + 5, y + 40, w - 10, h - 46, 4); ctx.fill();
    ctx.fillStyle = "#cfe9ff"; rr(ctx, x + 6, y + 12, w - 12, 9, 3); ctx.fill(); rr(ctx, x + 6, y + 30, w - 12, 6, 2); ctx.fill();
  } else {
    ctx.fillStyle = "#cfe9ff"; rr(ctx, x + 6, y + 12, w - 12, 12, 3); ctx.fill(); rr(ctx, x + 6, y + h - 24, w - 12, 9, 3); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.18)"; rr(ctx, x + 7, y + 26, w - 14, h - 52, 5); ctx.fill();
    if (c.type === "taxi") { ctx.fillStyle = "#111"; rr(ctx, -10, -4, 20, 8, 2); ctx.fill(); ctx.fillStyle = "#facc15"; for (let i = 0; i < 4; i++) ctx.fillRect(-9 + i * 5, -3 + (i % 2) * 3, 2.5, 2.5); }
  }
  ctx.fillStyle = "#fff9c4"; rr(ctx, x + 4, y + 1, 9, 4, 1); ctx.fill(); rr(ctx, x + w - 13, y + 1, 9, 4, 1); ctx.fill();
  ctx.fillStyle = "#ff5252"; rr(ctx, x + 4, y + h - 5, 9, 4, 1); ctx.fill(); rr(ctx, x + w - 13, y + h - 5, 9, 4, 1); ctx.fill();
  ctx.restore();
}
function drawVan(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const w = 48, h = 86, x = cx - w / 2, y = cy - h / 2;
  ctx.fillStyle = "rgba(0,0,0,.28)"; rr(ctx, x + 3, y + 5, w, h, 9); ctx.fill();
  ctx.fillStyle = "#151515"; for (const [wx, wy] of [[x - 3, y + 12], [x + w - 4, y + 12], [x - 3, y + h - 28], [x + w - 4, y + h - 28]]) { rr(ctx, wx, wy, 7, 16, 2); ctx.fill(); }
  // sky-blue ice cream truck (reference art)
  ctx.fillStyle = "#7dd3fc"; rr(ctx, x, y, w, h, 9); ctx.fill(); ctx.strokeStyle = "rgba(0,60,100,.35)"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = "#38bdf8"; rr(ctx, x + 5, y + 4, w - 10, 16, 4); ctx.fill();
  ctx.fillStyle = "#bae6fd"; rr(ctx, x + 7, y + 7, w - 14, 9, 2); ctx.fill();
  // white/pink candy stripe on side
  ctx.fillStyle = "#fff"; rr(ctx, x + 4, y + 24, 7, h - 46, 2); ctx.fill();
  ctx.save(); rr(ctx, x + 4, y + 24, 7, h - 46, 2); ctx.clip();
  ctx.strokeStyle = "#f9a8d4"; ctx.lineWidth = 4;
  for (let i = -2; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x + 12 + i * 7, y + 20); ctx.lineTo(x - 2 + i * 7, y + h - 18); ctx.stroke(); }
  ctx.restore();
  // big ice cream on the cargo area: cone + scoops
  ctx.fillStyle = "#fb923c"; ctx.beginPath(); ctx.moveTo(cx - 9, y + 46); ctx.lineTo(cx + 9, y + 46); ctx.lineTo(cx, y + 66); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#fdba74"; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(cx - 9 + i * 6, y + 50); ctx.lineTo(cx - 6 + i * 6, y + 64); ctx.lineTo(cx - 4 + i * 6, y + 50); ctx.stroke(); }
  ctx.fillStyle = "#f472b6"; ctx.beginPath(); ctx.arc(cx, y + 38, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f9a8d4"; ctx.beginPath(); ctx.arc(cx - 5, y + 34, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#c084fc"; ctx.beginPath(); ctx.arc(cx + 5, y + 30, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fb923c"; ctx.beginPath(); ctx.moveTo(cx, y + 22); ctx.lineTo(cx + 4, y + 28); ctx.lineTo(cx - 4, y + 28); ctx.closePath(); ctx.fill();
  // grille
  ctx.fillStyle = "#0c4a6e"; rr(ctx, x + 8, y + h - 20, w - 16, 8, 2); ctx.fill();
  for (let i = 0; i < 4; i++) { ctx.strokeStyle = "#0ea5e9"; ctx.beginPath(); ctx.moveTo(x + 10 + i * 7, y + h - 20); ctx.lineTo(x + 10 + i * 7, y + h - 12); ctx.stroke(); }
}
function drawChick(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, dead: boolean, ghostT: number) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  if (dead) {
    // flattened chick + rising ghost
    ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(0, 16, 30, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.ellipse(0, 12, 30, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#e0a800"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#ff8a00"; ctx.beginPath(); ctx.moveTo(24, 8); ctx.lineTo(36, 12); ctx.lineTo(24, 15); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#222"; ctx.lineWidth = 2; for (const ex of [6, 16]) { ctx.beginPath(); ctx.moveTo(ex - 3, 6); ctx.lineTo(ex + 3, 12); ctx.moveTo(ex + 3, 6); ctx.lineTo(ex - 3, 12); ctx.stroke(); }
    const gy = -20 - ghostT * 45, ga = Math.max(0, 1 - ghostT / 2.2);
    ctx.globalAlpha = ga * .85;
    ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(0, gy, 16, Math.PI, 0); ctx.lineTo(16, gy + 18); ctx.lineTo(10, gy + 12); ctx.lineTo(4, gy + 18); ctx.lineTo(-2, gy + 12); ctx.lineTo(-8, gy + 18); ctx.lineTo(-16, gy + 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#222"; circle(ctx, -5, gy - 2, 2); ctx.fill(); circle(ctx, 5, gy - 2, 2); ctx.fill();
    ctx.fillStyle = "#ff8a00"; ctx.beginPath(); ctx.moveTo(-3, gy + 4); ctx.lineTo(3, gy + 4); ctx.lineTo(0, gy + 8); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1; ctx.restore(); return;
  }
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(0, 22, 20, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#ff8a00"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.beginPath();
  ctx.moveTo(-6, 14); ctx.lineTo(-7, 22); ctx.moveTo(-11, 24); ctx.lineTo(-7, 22); ctx.lineTo(-3, 24); ctx.moveTo(6, 14); ctx.lineTo(5, 22); ctx.moveTo(1, 24); ctx.lineTo(5, 22); ctx.lineTo(9, 24); ctx.stroke();
  ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.ellipse(0, 4, 20, 17, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#e0a800"; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = "#ffe98a"; ctx.beginPath(); ctx.ellipse(2, 9, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f5c518"; ctx.beginPath(); ctx.ellipse(-12, 4, 8, 5, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#ffd23f"; circle(ctx, 9, -12, 14); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#e53935"; for (const [cx2, cy2] of [[4, -25], [9, -28], [14, -25]]) { circle(ctx, cx2, cy2, 3.5); ctx.fill(); }
  ctx.fillStyle = "#ff8a00"; ctx.beginPath(); ctx.moveTo(21, -14); ctx.lineTo(34, -10); ctx.lineTo(21, -6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#fff"; circle(ctx, 14, -14, 5); ctx.fill(); ctx.fillStyle = "#1a1a1a"; circle(ctx, 15, -14, 3); ctx.fill(); ctx.fillStyle = "#fff"; circle(ctx, 16, -15, 1); ctx.fill();
  ctx.fillStyle = "#ffb3b3"; circle(ctx, 20, -7, 2.5); ctx.fill();
  ctx.restore();
}

function drawSky(ctx: CanvasRenderingContext2D, road0: number, road1: number, w: number, h: number, camX: number, now: number) {
  // sunny cartoon sky gradient
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#34d3f2"); g.addColorStop(0.55, "#8fe8f7"); g.addColorStop(1, "#d7f6c4");
  ctx.fillStyle = g; ctx.fillRect(camX - 20, 0, w + 40, h);
  // sun (right side)
  const sx = road1 + 96, sy = 64;
  const glow = ctx.createRadialGradient(sx, sy, 6, sx, sy, 70);
  glow.addColorStop(0, "rgba(255,236,150,.95)"); glow.addColorStop(1, "rgba(255,236,150,0)");
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(sx, sy, 70, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffe169"; ctx.beginPath(); ctx.arc(sx, sy, 26, 0, Math.PI * 2); ctx.fill();
  // fluffy clouds drifting slowly
  const cloud = (x: number, y: number, sc: number) => {
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.beginPath();
    ctx.arc(x, y, 13 * sc, 0, Math.PI * 2); ctx.arc(x + 15 * sc, y - 6 * sc, 16 * sc, 0, Math.PI * 2);
    ctx.arc(x + 32 * sc, y, 12 * sc, 0, Math.PI * 2); ctx.arc(x + 15 * sc, y + 5 * sc, 15 * sc, 0, Math.PI * 2);
    ctx.fill();
  };
  const drift = (now / 60) % 600;
  for (let i = -1; i < 4; i++) {
    const bx = camX + i * 300 - drift;
    cloud(bx + 40, 56 + (i % 2) * 46, 0.9);
  }
  // birds
  ctx.strokeStyle = "rgba(30,60,90,.55)"; ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const bx = ((camX * 0.4 + i * 180 + now / 25) % (w + 200)) - 100, by = 120 + i * 26;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + 8, by - 7, bx + 16, by); ctx.quadraticCurveTo(bx + 24, by - 7, bx + 32, by); ctx.stroke();
  }
}
export function drawGrass(ctx: CanvasRenderingContext2D, x0: number, x1: number, h: number, side: "l" | "r", now: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#8fd35e"); g.addColorStop(1, "#5cab3c");
  ctx.fillStyle = g; ctx.fillRect(x0, 0, x1 - x0, h);
  // darker grass tufts + flowers (parallax-ish)
  const start = Math.floor(x0 / 46) * 46;
  for (let x = start; x < x1; x += 46) {
    ctx.strokeStyle = "rgba(46,110,38,.55)"; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const gx = x + 8 + i * 12, gy = ROW_Y + 34 + ((x + i * 7) % 60) - 30; ctx.beginPath(); ctx.moveTo(gx, gy + 8); ctx.lineTo(gx + (i - 1) * 2, gy); ctx.stroke(); }
    if ((x / 46) % 3 === 0) {
      const fx = x + 20, fy = 110 + ((x * 3) % 260);
      ctx.strokeStyle = "#3f8f33"; ctx.beginPath(); ctx.moveTo(fx, fy + 8); ctx.lineTo(fx, fy); ctx.stroke();
      const col = ["#ff7eb6", "#ffe169", "#fff", "#ff9f68"][Math.abs(x) % 4];
      ctx.fillStyle = col; for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2; ctx.beginPath(); ctx.arc(fx + Math.cos(a) * 3.4, fy + Math.sin(a) * 3.4, 3.4, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = "#ffd84d"; ctx.beginPath(); ctx.arc(fx, fy, 2.6, 0, Math.PI * 2); ctx.fill();
    }
  }
  void now;
}

/* Cartoon chicken (the hero from the Chicken Dash art): white body, red comb, wings that flap while hopping */
export function drawChicken(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, dead: boolean, ghostT: number, flap: number, now: number, moving: boolean) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  if (dead) {
    // feathers flying off
    // (fx particles handled separately; here draw the squashed chicken with X eyes)
    ctx.save(); ctx.rotate(-0.25);
    ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(0, 26, 34, 7, 0, 0, Math.PI * 2); ctx.fill();
    // legs kicked up
    ctx.strokeStyle = "#ff8a00"; ctx.lineWidth = 3.4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-6, 12); ctx.lineTo(-18, 0); ctx.lineTo(-23, 4); ctx.moveTo(8, 12); ctx.lineTo(20, -2); ctx.lineTo(25, 4); ctx.stroke();
    // wings out
    ctx.fillStyle = "#f2ead9";
    ctx.beginPath(); ctx.ellipse(-20, 8, 13, 7, 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(20, 8, 13, 7, -0.7, 0, Math.PI * 2); ctx.fill();
    // tail feathers splayed
    ctx.fillStyle = "#fbf6ea";
    for (let i = 0; i < 3; i++) { ctx.save(); ctx.translate(-20, -2 + i * 5); ctx.rotate(0.9 + i * 0.3); ctx.beginPath(); ctx.ellipse(-8, 0, 13 - i * 2, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    // body (lying)
    ctx.fillStyle = "#fffdf7"; ctx.strokeStyle = "#e3dcc9"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 8, 27, 22, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // head tilted
    ctx.beginPath(); ctx.arc(2, -10, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // comb flopped
    ctx.fillStyle = "#e53935"; ctx.beginPath(); ctx.ellipse(-6, -25, 8, 4, -0.5, 0, Math.PI * 2); ctx.fill();
    // X X eyes
    ctx.strokeStyle = "#2b2b2b"; ctx.lineWidth = 2.4;
    for (const ex of [-3, 8]) { ctx.beginPath(); ctx.moveTo(ex - 4, -15); ctx.lineTo(ex + 4, -7); ctx.moveTo(ex + 4, -15); ctx.lineTo(ex - 4, -7); ctx.stroke(); }
    // open beak
    ctx.fillStyle = "#ffb02e"; ctx.beginPath(); ctx.moveTo(14, -6); ctx.lineTo(26, -2); ctx.lineTo(14, 0); ctx.closePath(); ctx.fill();
    // wattle
    ctx.fillStyle = "#e53935"; ctx.beginPath(); ctx.ellipse(12, 2, 3, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    // hash marks (dizzy)
    ctx.strokeStyle = "#2b2b2b"; ctx.lineWidth = 1.6;
    for (const [hx, hy] of [[-8, 10], [6, 14]]) { ctx.beginPath(); ctx.moveTo(hx - 4, hy - 4); ctx.lineTo(hx + 4, hy + 4); ctx.moveTo(hx + 4, hy - 4); ctx.lineTo(hx - 4, hy + 4); ctx.stroke(); }
    ctx.restore();
    ctx.restore();
    return;
  }
  const hop = Math.max(0, flap);
  const gait = moving ? Math.sin(now / 48) : 0;
  const breath = moving ? 0 : Math.sin(now / 420) * 0.7;
  ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(0, 24 - hop * 6, 22 - hop * 4, 6 - hop, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(0, -hop * 18 + breath);
  ctx.scale(1, 1.08);
  // tail feathers
  ctx.fillStyle = "#fbf6ea";
  for (let i = 0; i < 3; i++) { ctx.save(); ctx.translate(-19, -2 + i * 6); ctx.rotate(0.5 + i * 0.28); ctx.beginPath(); ctx.ellipse(-10, 0, 16 - i * 2, 4.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "rgba(180,170,150,.5)"; ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); }
  // wing flapping
  const wing = moving ? Math.sin(now / 65) * 0.55 : Math.sin(now / 550) * 0.06;
  ctx.save(); ctx.translate(-2, 2); ctx.rotate(-0.25 + wing * 0.7);
  ctx.fillStyle = "#f2ead9"; ctx.beginPath(); ctx.ellipse(-12, -4, 15, 7, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(170,160,140,.6)"; ctx.lineWidth = 1.5;
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(-20, -6 + i * 3); ctx.quadraticCurveTo(-12, -8 + i * 3, -2, -2 + i * 2); ctx.stroke(); }
  ctx.restore();
  // run legs
  ctx.strokeStyle = "#ff8a00"; ctx.lineWidth = 3; ctx.lineCap = "round";
  const lp = gait * 9;
  ctx.beginPath(); ctx.moveTo(-6, 14); ctx.lineTo(-7 + lp * .5, 25 - Math.max(0, gait) * 4); ctx.lineTo(-1 + lp, 26 - Math.max(0, gait) * 4);
  ctx.moveTo(6, 14); ctx.lineTo(6 - lp * .5, 25 - Math.max(0, -gait) * 4); ctx.lineTo(12 - lp, 26 - Math.max(0, -gait) * 4); ctx.stroke();
  // body
  ctx.fillStyle = "#fffdf7"; ctx.strokeStyle = "#e3dcc9"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 6, 26, 21, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.beginPath(); ctx.ellipse(4, 12, 14, 10, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fffdf7"; ctx.beginPath(); ctx.ellipse(11, -15, 10.5, 20, -0.12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.translate(moving ? gait * 1.3 : 0, -12);
  ctx.fillStyle = "#fffdf7"; ctx.beginPath(); ctx.arc(14, -17, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#e53935";
  for (const [cx2, cy2, r] of [[9, -28, 4.6], [14, -31, 5.2], [19, -28, 4.4]]) { ctx.beginPath(); ctx.arc(cx2, cy2, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = "#e53935"; ctx.beginPath(); ctx.ellipse(20, -7, 3.4, 5.2, 0.2, 0, Math.PI * 2); ctx.fill();
  // big cartoon eye
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#d8d1c0"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(16, -18, 7.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#1a1a1a"; ctx.beginPath(); ctx.arc(17.5, -18, 3.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(19, -20, 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(8, -19, 4.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#1a1a1a"; ctx.beginPath(); ctx.arc(9, -19, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffb02e"; ctx.beginPath(); ctx.moveTo(22, -14); ctx.lineTo(35, -11); ctx.lineTo(22, -8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#ff8a00"; ctx.beginPath(); ctx.moveTo(22, -7); ctx.lineTo(33, -9); ctx.lineTo(22, -4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(255,150,120,.45)"; ctx.beginPath(); ctx.arc(11, -10, 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}


function draw(ctx: CanvasRenderingContext2D, v: Vis, view: View, now: number) {
  const { w, h } = view;
  const rowY = ROW_Y * h / H;
  ctx.clearRect(0, 0, w, h);
  ctx.save(); ctx.translate(-v.camX, 0);
  const road0 = SIDE_W, road1 = SIDE_W + v.lanes * LANE_W;
  // full grey asphalt background (reference look)
  const asphalt = ctx.createLinearGradient(road0, 0, road1, 0);
  asphalt.addColorStop(0, "#56617c"); asphalt.addColorStop(0.5, "#505c77"); asphalt.addColorStop(1, "#56617c");
  ctx.fillStyle = asphalt; ctx.fillRect(v.camX - 20, 0, w + 40, h);
  drawGrass(ctx, 0, road0, h, "l", now);
  drawGrass(ctx, road1, road1 + SIDE_W, h, "r", now);
  for (const edge of [road0 - 10, road1]) {
    for (let y = 0; y < h; y += 36) {
      ctx.fillStyle = y % 72 === 0 ? "#d0d2c0" : "#969e91";
      ctx.fillRect(edge, y, 10, 34);
    }
  }
  drawBush(ctx, road0 - 65, 82);
  drawTree(ctx, road1 + 72, 90, 30);
  // faint asphalt speckle
  ctx.fillStyle = "rgba(255,255,255,.04)";
  for (let i = 0; i < 40; i++) { const xx = ((i * 137 + Math.floor(v.camX)) % Math.max(1, road1 - road0)) + road0; const yy = (i * 71) % h; ctx.fillRect(xx, yy, 2, 2); }
  // white dashed lane lines, full height
  ctx.strokeStyle = "rgba(210,220,240,.48)"; ctx.lineWidth = 3; ctx.setLineDash([20, 20]); ctx.lineDashOffset = 0;
  ctx.beginPath();
  for (let l = 0; l <= v.lanes; l++) { const x = road0 + l * LANE_W; ctx.moveTo(x, -20); ctx.lineTo(x, h + 20); }
  ctx.stroke(); ctx.setLineDash([]);
  // edge solid white lines
  ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(road0 + 4, 0); ctx.lineTo(road0 + 4, h); ctx.moveTo(road1 - 4, 0); ctx.lineTo(road1 - 4, h); ctx.stroke();
  // construction barriers across the top of the lanes (reference look):
  // shown above the tile the chicken is about to cross / currently on
  if (v.status === "active" || v.status === "cashed" || v.status === "dead" || v.status === "finished") {
    for (let l = 1; l <= v.lanes; l++) {
      if (v.passed[l]) drawBarrier(ctx, laneX(l), rowY - 70, now);
    }
  }
  // finish checker banner on far right
  drawFlag(ctx, road1 - 18, rowY + 6);
  // tiles
  const next = v.status === "active" && !v.hop ? v.pos + 1 : -1;
  for (let l = 1; l <= v.lanes; l++) drawTile(ctx, laneX(l), rowY, fmtMult(v.ladder[l - 1]).slice(1) + "x", v.passed[l], l === next, now, v.bagVisible && v.bagLane === l);
  if (v.bagVisible && v.bagLane) drawBag(ctx, laneX(v.bagLane), rowY - 16, now / 300);
  // traffic (cartoon cars, top-down-ish but rounded and glossy)
  for (let l = 1; l <= v.lanes; l++) for (const c of v.traffic[l]) drawCar(ctx, c, laneX(l), c.y * h / H);
  if (v.van) drawVan(ctx, laneX(v.van.lane), v.van.y * h / H);
  // dash speed streaks
  if (v.hop?.dash) { ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 3; for (let i = 0; i < 6; i++) { const yy = rowY - 26 + i * 9; ctx.beginPath(); ctx.moveTo(v.cx - 26 - i * 12, yy); ctx.lineTo(v.cx - 64 - i * 20, yy); ctx.stroke(); } }
  // hero chicken
  const t = v.hop ? Math.min(1, (now - v.hop.start) / v.hop.dur) : 0;
  drawChicken(ctx, v.cx, rowY, 1, v.dead, v.ghostT, v.hop ? Math.sin(Math.PI * t) : 0, now, !!v.hop);
  // blue speech-bubble multiplier chip (reference)
  if (v.status === "active" || v.status === "cashed" || v.status === "finished") {
    const lbl = fmtMult(v.pos > 0 ? v.ladder[v.pos - 1] : 1);
    ctx.font = "900 20px system-ui"; const tw = Math.max(64, ctx.measureText(lbl).width + 22);
    const bx = v.cx, by = rowY + 34, bh = 34;
    // pointer triangle
    ctx.fillStyle = "#3b5998";
    ctx.beginPath(); ctx.moveTo(bx - 9, by); ctx.lineTo(bx + 9, by); ctx.lineTo(bx, by - 12); ctx.closePath(); ctx.fill();
    rr(ctx, bx - tw / 2, by, tw, bh, 7); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.25)"; rr(ctx, bx - tw / 2, by + bh - 6, tw, 6, 4); ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(lbl, bx, by + bh / 2 - 1);
  }
  if (v.killer) drawCar(ctx, { type: v.killer.type, color: v.killer.color, dir: 1 }, laneX(v.killer.lane), v.killer.y * h / H);
  // fx (feathers/coins/sparks)
  for (const f of v.fx) {
    if (f.kind === "coin") continue;
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.4)); ctx.translate(f.x, rowY + f.y - ROW_Y); ctx.rotate(f.rot);
    if (f.kind === "feather") { ctx.fillStyle = "#fff4b8"; ctx.beginPath(); ctx.ellipse(0, 0, 7, 3, 0, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.fillStyle = "#fff"; ctx.fillRect(-2, -2, 4, 4); }
    ctx.restore();
  }
  for (const f of v.floats) { ctx.globalAlpha = Math.max(0, f.life); ctx.font = "900 20px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.strokeText(f.text, f.x, rowY + f.y - ROW_Y); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, rowY + f.y - ROW_Y); ctx.globalAlpha = 1; }
  ctx.restore();
}

/* ---------------- component ---------------- */
export function ChickenDashGame({ backHref = "/player" }: { backHref?: string }) {
  const [st, setSt] = useState<State | null>(null);
  const [game, setGame] = useState<G | null>(null);
  const [phase, setPhase] = useState<"idle" | "active">("idle");
  const [amount, setAmount] = useState(100);
  const [customAmount, setCustomAmount] = useState(100);
  const [level, setLevel] = useState<Level>("easy");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; m: string } | null>(null);
  const [showRules, setShowRules] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const visRef = useRef<Vis | null>(null);
  const viewRef = useRef<View>({ w: 900, h: H, scale: 1, dpr: 1 });
  const busyRef = useRef(false);
  const loadedRef = useRef(false);
  const stRef = useRef<State | null>(null);
  const setBusyBoth = (b: boolean) => { busyRef.current = b; setBusy(b); };

  const refresh = useCallback(async () => {
    const r = await localApi("/api/chickendash/state", { cache: "no-store" });
    if (!r.ok) return;
    const s: State = await r.json();
    stRef.current = s; setSt(s);
    if (typeof s.balance === "number") broadcastBalanceUpdate(s.balance, "Chicken Dash");
    if (!loadedRef.current) {
      loadedRef.current = true;
      if (s.game?.status === "active" && s.game.bet > 0) {
        const v = newVis(s.ladders[s.game.level]); applyGame(v, s.game); visRef.current = v;
        setGame(s.game); setLevel(s.game.level); setAmount(s.game.bet); setPhase("active");
      } else {
        visRef.current = newVis(s.ladders.easy);
        setGame(null); setPhase("idle");
      }
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

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
      const pixelWidth = Math.round(cssW * dpr), pixelHeight = Math.round(cssH * dpr);
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      canvas.style.height = cssH + "px";
      viewRef.current = { w: cssW / scale, h: cssH / scale, scale, dpr };
    });
    if (typeof requestAnimationFrame !== "undefined") requestAnimationFrame(() => { try { (window as unknown as Window).dispatchEvent(new Event("resize")); } catch { } }); ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const v = visRef.current, view = viewRef.current; if (!v) return;
      const dt = Math.min(50, v.lastT ? now - v.lastT : 16); v.lastT = now;
      update(v, dt, now, view);
      ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, 0, 0);
      draw(ctx, v, view, now);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const post = async (url: string, body?: unknown) => (await localApi(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })).json();

  const start = async () => {
    const s = stRef.current; if (!s || busyRef.current) return;
    if (amount < 10) {
      setMsg({ t: "err", m: "Minimum bet is Rs. 10. Please enter at least 10." });
      return;
    }
    setBusyBoth(true); setMsg(null);
    const j = await post("/api/chickendash/start", { amount, level });
    if (j.error) { setMsg({ t: "err", m: j.error }); setBusyBoth(false); return; }
    const g: G = j.game;
    const v = newVis(s.ladders[level], visRef.current); v.status = "active";
    if (g.bagLane) { v.bagLane = g.bagLane; v.bagMult = g.bagMult; v.van = { lane: g.bagLane, y: -140, dropped: false }; v.traffic[g.bagLane] = []; }
    visRef.current = v; setGame(g); setPhase("active"); setBusyBoth(false); refresh();
  };

  const step = useCallback(async () => {
    const v = visRef.current;
    if (!v || busyRef.current || v.status !== "active" || v.hop) return;
    setBusyBoth(true); setMsg(null);
    const j = await post("/api/chickendash/step");
    if (j.error) { setMsg({ t: "err", m: j.error }); setBusyBoth(false); return; }
    const g: G = j.game; setGame(g);
    const target = g.position;
    if (j.event === "dead") {
      playGameSound("crash"); speakGameVoice("chickenCrash");
      v.traffic[target] = v.traffic[target].filter((c) => c.y >= ROW_Y + 60);
      hopTo(v, target, false, () => {
        v.passed[target] = false;
        v.killer = {
          lane: target, y: -140, type: pick(CAR_TYPES), color: pick(CAR_COLORS), hit: false, done: () => {
            v.status = "dead"; setPhase("idle"); setBusyBoth(false);
            setMsg({ t: "err", m: g.poolPending ? "Round ended — daily pool payout pending" : "" }); refresh();
            window.dispatchEvent(new CustomEvent("wx:game-result", { detail: { game: "Chicken Dash", bet: g.bet, win: 0, won: false, poolPending: g.poolPending, poolClaim: 0 } }));
          }
        };
      });
      return;
    }
    const dash = j.event === "dash" || (j.dash && j.event === "finished");
    if (dash) { v.dashUntil = performance.now() + 900; for (let l = v.pos + 1; l <= target; l++) v.traffic[l] = v.traffic[l].filter((c) => Math.abs(c.y - ROW_Y) > 90); float(v, v.cx + 60, ROW_Y - 70, "DASH!", "#7dd3fc"); }
    for (let l = v.pos + 1; l <= target; l++) v.passed[l] = true;
    hopTo(v, target, dash, () => {
      if (j.bagNow) { v.bagVisible = false; v.bagCollected = true; burst(v, v.cx, ROW_Y - 10, "coin", 12); float(v, v.cx, ROW_Y - 60, `+${g.bagMult}x BONUS`, "#fbbf24"); }
      if (j.event === "finished") {
        playGameSound("coin"); if (!g.poolPending) speakGameVoice("chickenWin");
        hopTo(v, target + 1, false, () => {
          v.status = "finished"; v.finishedAt = performance.now(); burst(v, v.cx, ROW_Y, "coin", 22); setPhase("idle"); setBusyBoth(false);
          setMsg({ t: "ok", m: g.poolPending ? `Highway crossed! Claim ${money(g.poolClaim ?? 0)} — daily payout pending` : `Highway cross! ${money(g.win)} jeete!` }); refresh();
          window.dispatchEvent(new CustomEvent("wx:game-result", { detail: { game: "Chicken Dash", bet: g.bet, win: g.win ?? 0, won: (g.win ?? 0) > 0, poolPending: g.poolPending, poolClaim: g.poolClaim } }));
        });
      } else setBusyBoth(false);
    });
  }, [refresh]);
  const stepRef = useRef(step); stepRef.current = step;

  const cashout = async () => {
    const v = visRef.current;
    if (!v || busyRef.current || v.status !== "active" || v.hop) return;
    setBusyBoth(true);
    const j = await post("/api/chickendash/cashout");
    if (j.error) setMsg({ t: "err", m: j.error });
    else {
      const won = j.win > j.game.bet;
      playGameSound("cashout");
      if (won) speakGameVoice("chickenWin");
      v.status = "cashed"; burst(v, v.cx, ROW_Y, "coin", 18); setGame(j.game); setPhase("idle");
      setMsg(j.poolPending ? { t: "ok", m: `Claim ${money(j.poolClaim)} locked @ ${fmtMult(j.multiplier)} — daily payout pending` } : won ? { t: "ok", m: `Cashed out @ ${fmtMult(j.multiplier)} — ${money(j.win)} jeete!` } : { t: "err", m: "" });
      window.dispatchEvent(new CustomEvent("wx:game-result", { detail: { game: "Chicken Dash", bet: j.game.bet, win: j.win, won, poolPending: j.poolPending, poolClaim: j.poolClaim } }));
    }
    setBusyBoth(false); refresh();
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if ([" ", "ArrowRight", "d", "D", "w", "W"].includes(e.key)) { e.preventDefault(); stepRef.current(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const changeLevel = (l: Level) => {
    if (phase === "active" || !stRef.current) return;
    setLevel(l); visRef.current = newVis(stRef.current.ladders[l], visRef.current); setMsg(null);
  };

  const balance = st?.balance ?? 0;
  const min = st?.limits.min ?? 10, max = Math.max(min, Math.floor(st?.balance ?? 0));
  const potential = game && phase === "active" ? game.potential : 0;
  const nextWin = game && phase === "active" && game.nextMultiplier ? Math.floor(game.bet * game.nextMultiplier * 100) / 100 : 0;
  const lvlColor: Record<Level, string> = { easy: "bg-[#22c55e] text-slate-950", normal: "bg-[#f59e0b] text-slate-950", hard: "bg-[#ef4444] text-white" };

  return (
    <div className="h-full w-full flex flex-col justify-between overflow-hidden rounded-xl sm:rounded-2xl border border-[#2b3140] bg-[#171b26] shadow-2xl select-none">
      {/* top bar */}
      <div className="shrink-0 flex items-center justify-between bg-[#10131b] px-3 py-2 border-b border-[#2b3140]/60">
        <div className="flex items-center gap-2">
          {backHref && (
            <Link href={backHref} className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] active:bg-[#991b1b] border border-[#ef4444] text-xs font-black text-white shadow-md active:translate-y-[1px] transition-all cursor-pointer" title="Back">
              ←
            </Link>
          )}
          <span className="text-sm sm:text-base font-black tracking-tight"><span className="text-[#fbbf24]">CHICKEN</span> <span className="text-white">DASH</span></span>
        </div>
        <div className="flex items-center gap-2">
          {game && phase === "active" && <div className="rounded-lg bg-[#1f2533] border border-[#2b3140] px-2.5 py-0.5 text-xs text-slate-300">Tile <b className="text-white">{game.position}</b>/{game.lanes}{game.bagCollected ? <> · <b className="text-yellow-400">+{game.bagMult}x</b></> : null}</div>}
          <div className="flex items-center gap-1.5 rounded-lg bg-[#1f2533] border border-[#2b3140] px-2.5 py-1 text-xs font-bold text-white"><span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-yellow-600 bg-yellow-400" />{balance.toLocaleString()}</div>
          <button onClick={() => setShowRules((s) => !s)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1f2533] hover:bg-[#2b3140] border border-[#2b3140] text-xs font-bold text-slate-300 hover:text-white transition cursor-pointer">?</button>
        </div>
      </div>

      {/* canvas */}
      <div ref={wrapRef} className="relative flex-1 min-h-0 w-full overflow-hidden flex items-center justify-center bg-[#0d1017]">
        <canvas ref={canvasRef} onClick={() => step()} className={`block w-full ${phase === "active" && !busy ? "cursor-pointer" : ""}`} />
        {!st && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">Loading…</div>}
        {msg?.m && <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3 z-20"><div className={`rounded-xl px-4 py-1.5 text-center text-xs font-bold shadow-lg ${msg.t === "ok" ? "bg-[#16a34a] border border-[#22c55e] text-white" : "bg-[#dc2626] border border-[#ef4444] text-white"}`}>{msg.m}</div></div>}
        {phase === "active" && !busy && <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-lg bg-black/80 px-3 py-1 text-[10px] font-semibold text-white">Tap road ya <kbd className="rounded bg-white/20 px-1">SPACE</kbd> = aage barho</div>}
        {showRules && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-4" onClick={() => setShowRules(false)}>
            <div className="max-w-md w-full rounded-2xl bg-[#171b26] border border-[#2b3140] p-4 text-xs text-slate-300 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-black text-white">Chicken Dash — Rules</h3>
                <button onClick={() => setShowRules(false)} className="text-slate-400 hover:text-white font-bold">✕</button>
              </div>
              <ul className="list-disc space-y-1 pl-4">
                <li>Bet aur level select karke <b className="text-emerald-400">START</b> dabayein. Chicken curb se pehli tile par jump karti hai.</li>
                <li>Har tile par multiplier barhta hai. Kisi bhi waqt <b className="text-yellow-400">CASH OUT</b> karein. Gaari se takraye to sab khatam.</li>
                <li><b className="text-sky-300">Dash:</b> kabhi kabhi chicken 2–3 safe tiles ek saath sprint karti hai — un lanes mein koi gaari nahi aati.</li>
                <li><b className="text-yellow-300">Bonus Bag:</b> ek van road par money bag girati hai. Us tile tak pahunch kar cash out karein to bonus bhi milta hai.</li>
                <li>Easy 28 tiles · Normal 24 · Hard 20.</li>
              </ul>
              <button onClick={() => setShowRules(false)} className="mt-3 w-full rounded-lg bg-[#16a34a] py-2 font-bold text-white hover:bg-[#15803d]">OK</button>
            </div>
          </div>
        )}
      </div>

      {/* controls */}
      <div className="shrink-0 flex flex-col sm:flex-row items-center gap-2 bg-[#10131b] px-3 py-2 border-t border-[#2b3140]/60">
        <div className={`rounded-xl bg-[#1f2533] border border-[#2b3140] p-1.5 w-full sm:w-auto sm:min-w-[200px] lg:min-w-[220px] ${phase === "active" ? "pointer-events-none opacity-50" : ""}`}>
          <div className="flex items-center justify-between mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-300">
            <span>Bet (Min 10)</span>
            <span className="text-white font-bold">Rs. {amount}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setAmount((a) => Math.max(10, a - 50))} className="h-7 w-7 rounded-lg bg-[#2b3140] hover:bg-[#374151] active:bg-[#1f2937] text-sm font-black text-white transition cursor-pointer">−</button>
            <input type="number" value={amount} min={10} max={max} onChange={(e) => setAmount(Number(e.target.value))} onBlur={() => setAmount((a) => Math.max(10, a || 50))} className="w-full min-w-0 flex-1 bg-transparent text-center text-sm font-bold text-white outline-none" />
            <button onClick={() => setAmount((a) => Math.min(max, a + 50))} className="h-7 w-7 rounded-lg bg-[#2b3140] hover:bg-[#374151] active:bg-[#1f2937] text-sm font-black text-white transition cursor-pointer">+</button>
          </div>
          <div className="mt-1.5 grid grid-cols-7 gap-1">
            {[["Min", 10], ...BET_PRESETS.map((p) => [String(p), p]), ["Max", Math.max(10, Math.min(max, Math.floor(balance)))]].map(([l, v]) => (
              <button key={String(l)} onClick={() => setAmount(Number(v))} className="rounded bg-[#2b3140] hover:bg-[#374151] py-0.5 text-[9px] font-bold text-slate-200 transition cursor-pointer">{l}</button>
            ))}
          </div>
        </div>

        <div className={`grid grid-cols-3 gap-1 w-full sm:w-auto sm:min-w-[210px] lg:min-w-[230px] ${phase === "active" ? "pointer-events-none opacity-50" : ""}`}>
          {LEVELS.map((l) => (
            <button key={l} onClick={() => changeLevel(l)} className={`rounded-xl px-2 py-1.5 text-xs font-black capitalize transition cursor-pointer ${level === l ? lvlColor[l] : "bg-[#1f2533] text-slate-300 hover:bg-[#2b3140] border border-[#2b3140]"}`}>
              {l}
              {st && <div className="text-[8px] font-semibold opacity-90">{st.levels[l].steps} tiles · max {fmtMult(st.levels[l].max)}</div>}
            </button>
          ))}
        </div>

        <div className="flex flex-1 w-full gap-2">
          {phase === "idle" ? (
            <button
              disabled={busy || !st}
              onClick={start}
              className="h-12 sm:h-14 flex-1 rounded-xl bg-[#16a34a] hover:bg-[#15803d] active:bg-[#14532d] border-2 border-[#22c55e] text-lg sm:text-xl font-black text-white shadow-xl transition active:scale-[0.98] disabled:opacity-50 cursor-pointer uppercase tracking-wider"
              style={{ backgroundColor: "#16a34a", color: "#ffffff", borderColor: "#22c55e", boxShadow: "0 6px 20px rgba(22, 163, 74, 0.45)" }}
            >
              START
              <div className="text-[10px] font-semibold opacity-90">{money(amount)} · {st?.levels[level].label}</div>
            </button>
          ) : (
            <>
              <button
                disabled={busy}
                onClick={() => step()}
                className="h-12 sm:h-14 flex-1 rounded-xl bg-[#16a34a] hover:bg-[#15803d] active:bg-[#14532d] border-2 border-[#22c55e] text-base sm:text-lg font-black text-white shadow-xl transition active:scale-[0.98] disabled:opacity-50 cursor-pointer uppercase tracking-wider"
                style={{ backgroundColor: "#16a34a", color: "#ffffff", borderColor: "#22c55e", boxShadow: "0 6px 20px rgba(22, 163, 74, 0.45)" }}
              >
                GO →
                <div className="text-[10px] font-semibold opacity-90">{game?.nextMultiplier ? `next ${fmtMult(game.nextMultiplier)} = ${money(nextWin)}` : ""}</div>
              </button>
              <button
                disabled={busy || (game?.position ?? 0) < 1}
                onClick={cashout}
                className="h-12 sm:h-14 flex-1 rounded-xl bg-[#d97706] hover:bg-[#b45309] active:bg-[#92400e] border-2 border-[#f59e0b] text-base sm:text-lg font-black text-white shadow-xl transition active:scale-[0.98] disabled:opacity-40 cursor-pointer uppercase tracking-wider"
                style={{ backgroundColor: "#d97706", color: "#ffffff", borderColor: "#f59e0b", boxShadow: "0 6px 20px rgba(217, 119, 6, 0.45)" }}
              >
                {game?.poolVersion ? "LOCK CLAIM" : "CASH OUT"}
                <div className="text-xs font-black">{money(potential)}{game?.bagCollected ? " " : ""}</div>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
