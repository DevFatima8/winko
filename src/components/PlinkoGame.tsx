"use client";

import { localApi } from "@/lib/client";
import { playGameSound, speakGameVoice } from "@/lib/gameAudio";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { broadcastBalanceUpdate, getStoredWalletBalance } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";

type Risk = "low" | "medium" | "high";
type PoolResult = { poolPending?: boolean; poolClaim?: number };
type Recent = { id: string; bet: number; risk: string; rows: number; multiplier: number; payout: number; bucket: number } & PoolResult;
type State = { dailyPoolEnabled?: boolean; balance: number; limits: { min: number; max: number }; rows: number[]; tables: Record<Risk, Record<number, number[]>>; recent: Recent[] };

const money = (n: number) => "Rs. " + n.toLocaleString("en-PK", { maximumFractionDigits: 2 });
const fmtMult = (m: number) => (m >= 100 ? m.toFixed(0) : m >= 10 ? String(parseFloat(m.toFixed(1))) : String(parseFloat(m.toFixed(2)))) + "x";

/* ---------- bucket colors: yellow center → red edges (original palette) ---------- */
function bucketColor(i: number, n: number) {
  const center = (n - 1) / 2;
  const d = center === 0 ? 0 : Math.abs(i - center) / center;
  const g = Math.round(192 * (1 - d));
  const b = Math.round(63 * d);
  return { top: `rgb(255,${g},${b})`, side: `rgb(170,${Math.round(g * 0.6)},${Math.round(b * 0.6)})` };
}

/* ---------- geometry (canvas units) ---------- */
const W = 760, H = 640, PAD_TOP = 46, PAD_BOTTOM = 72, STEP = 190;
function geom(rows: number) {
  const gapY = (H - PAD_TOP - PAD_BOTTOM) / rows;
  const gapX = Math.min(gapY * 1.05, (W - 140) / (rows + 2));
  const pegR = Math.max(3, gapX * 0.12);
  const ballR = Math.max(6, gapX * 0.3);
  const peg = (row: number, i: number) => ({ x: W / 2 + (i - (row + 2) / 2) * gapX, y: PAD_TOP + row * gapY }); // row r has r+3 pegs
  const bucketX = (k: number) => W / 2 + (k - rows / 2) * gapX;
  const bucketY = PAD_TOP + rows * gapY + 6;
  const bw = gapX * 0.86, bh = Math.max(22, Math.min(34, gapX * 0.62));
  return { gapX, gapY, pegR, ballR, peg, bucketX, bucketY, bw, bh };
}

type Ball = { path: number[]; rows: number; start: number; col: number; id: number; landed?: boolean; flashed: Set<number> };
type Vis = { rows: number; table: number[]; balls: Ball[]; hitPegs: Map<string, number>; bucketBounce: Map<number, number> };

export function PlinkoGame({ backHref = "/player" }: { backHref?: string }) {
  const [st, setSt] = useState<State | null>(null);
  const [amount, setAmount] = useState(100);
  const [customAmount, setCustomAmount] = useState(100);
  const [risk, setRisk] = useState<Risk>("medium");
  const [rows, setRows] = useState(16);
  const [msg, setMsg] = useState<string | null>(null);
  const [results, setResults] = useState<({ id: number; m: number; payout: number } & PoolResult)[]>([]);
  const [auto, setAuto] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const [autoCount, setAutoCount] = useState(10);
  const [inflight, setInflight] = useState(0);
  const [balance, setBalance] = useState<number>(() => getStoredWalletBalance() ?? 0);

  useEffect(() => {
    const onSync = (ev: Event) => {
      const b = (ev as CustomEvent).detail?.balance;
      if (typeof b === "number") setBalance(b);
    };
    window.addEventListener("wx:balance-update", onSync);
    return () => window.removeEventListener("wx:balance-update", onSync);
  }, []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const visRef = useRef<Vis>({ rows: 16, table: [], balls: [], hitPegs: new Map(), bucketBounce: new Map() });
  const scaleRef = useRef({ dpr: 1, scale: 1 });
  const idRef = useRef(1);
  const autoRef = useRef({ on: false, left: 0 });
  const inflightRef = useRef(0);
  const retryRef = useRef<{ requestId: string; amount: number; risk: Risk; rows: number }[]>([]);

  const refresh = useCallback(async () => {
    const r = await localApi("/api/plinko/state", { cache: "no-store" });
    if (!r.ok) return;
    const s: State = await r.json();
    setSt(s); setBalance(s.balance);
    broadcastBalanceUpdate(s.balance, "Plinko");
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    visRef.current.rows = rows;
    visRef.current.table = st?.tables[risk][rows] ?? [];
  }, [rows, risk, st]);

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    // Size by width so the controls cannot squeeze the board on short screens.
    const ro = new ResizeObserver(() => {
      const scale = Math.min(1, Math.max(1, wrap.clientWidth) / W);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(W * scale * dpr);
      canvas.height = Math.round(H * scale * dpr);
      canvas.style.width = Math.round(W * scale) + "px";
      canvas.style.height = Math.round(H * scale) + "px";
      scaleRef.current = { dpr, scale };
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const { dpr, scale } = scaleRef.current;
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
      drawScene(ctx, visRef.current, now);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const dropBall = useCallback(async () => {
    if (!st || inflightRef.current >= 10) return;
    inflightRef.current++; setInflight(inflightRef.current);
    setMsg(null);
    playGameSound("ballDrop"); speakGameVoice("ballDrop");
    const request = retryRef.current.shift() ?? { requestId: crypto.randomUUID(), amount, risk, rows };
    setBalance((b) => b - request.amount);
    let r: Response;
    try { r = await localApi("/api/plinko/drop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }); }
    catch {
      retryRef.current.push(request); setMsg("Connection interrupted. Drop again to safely retry the same wager.");
      inflightRef.current--; setInflight(inflightRef.current); autoRef.current.on = false; setAuto(false); setAutoLeft(0); refresh(); return;
    }
    const j = await r.json();
    if (r.status >= 500) retryRef.current.push(request);
    if (j.error) {
      setMsg(j.error); refresh();
      inflightRef.current--; setInflight(inflightRef.current);
      autoRef.current.on = false; setAuto(false); setAutoLeft(0);
      return;
    }
    const id = idRef.current++;
    visRef.current.balls.push({ path: j.path, rows: request.rows, start: performance.now(), col: j.bucket, id, flashed: new Set() });
    setTimeout(() => {
      setResults((rs) => [{ id, m: j.multiplier, payout: j.payout, poolPending: j.poolPending, poolClaim: j.poolClaim }, ...rs].slice(0, 6));
      window.dispatchEvent(new CustomEvent("wx:game-result", { detail: { game: "Plinko", bet: request.amount, win: j.payout, won: !j.poolPending && j.payout > 0, poolPending: j.poolPending, poolClaim: j.poolClaim } }));
      if (!j.poolPending && j.multiplier >= 1.5) { playGameSound("coin"); speakGameVoice("cardWin"); }
      setBalance(j.balance);
      broadcastBalanceUpdate(j.balance, "Plinko");
      inflightRef.current--; setInflight(inflightRef.current);
      if (inflightRef.current === 0) refresh();
    }, (request.rows + 1) * STEP + 200);
  }, [st, amount, risk, rows, refresh]);

  useEffect(() => {
    if (!auto) return;
    autoRef.current = { on: true, left: autoCount };
    setAutoLeft(autoCount);
    const id = setInterval(() => {
      if (!autoRef.current.on || autoRef.current.left <= 0) { clearInterval(id); setAuto(false); setAutoLeft(0); return; }
      autoRef.current.left--; setAutoLeft(autoRef.current.left);
      dropBall();
    }, 380);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const stopAuto = () => { autoRef.current.on = false; setAuto(false); setAutoLeft(0); };
  const min = st?.limits.min ?? 10, max = Math.max(min, Math.floor(st?.balance ?? 0));
  const table = st?.tables[risk][rows] ?? [];
  const locked = auto || inflight > 0;

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto overflow-x-hidden min-h-0 bg-[#0f212e] text-white p-1.5 sm:p-2 select-none">
      {/* Top Bar */}
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-[#213743] px-2 pb-1.5">
        <div className="flex items-center gap-2">
          <Link
            href={backHref}
            className="flex h-7 items-center gap-1 rounded-lg border border-white/20 bg-[#1a2c38] px-2 text-xs font-bold text-white transition hover:bg-white/20"
          >
            ← Back
          </Link>
          <span className="inline-block h-3.5 w-3.5 rounded-full bg-gradient-to-br from-[#ff7a90] to-[#e4003a] shadow-[0_0_10px_rgba(255,59,92,.8)]" />
          <h1 className="text-sm sm:text-base font-black tracking-tight text-white">PLINKO</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-[#1a2c38] px-2.5 py-1 text-xs sm:text-sm font-black text-[#00e701]">
            {money(balance)}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="shrink-0 lg:grow flex flex-col-reverse lg:flex-row gap-2 my-1">
        <aside className="w-full lg:w-72 shrink-0 flex flex-col justify-between bg-[#213743] p-2.5 sm:p-3 rounded-xl gap-2">
          <div className="grid grid-cols-2 rounded-lg bg-[#0f212e] p-1 text-xs font-bold">
            <button onClick={stopAuto} className={`rounded-md py-1.5 transition ${!auto ? "bg-[#2f4553] text-white shadow" : "text-slate-400 hover:text-white"}`}>Manual</button>
            <button onClick={() => !auto && st && setAuto(true)} className={`rounded-md py-1.5 transition ${auto ? "bg-[#2f4553] text-white shadow" : "text-slate-400 hover:text-white"}`}>Auto</button>
          </div>

          <label className="block">
            <span className="mb-1 flex justify-between text-[11px] font-semibold text-slate-300"><span>Bet Amount</span><span className="text-slate-400">{money(amount)}</span></span>
            <div className="flex overflow-hidden rounded-md bg-[#0f212e] ring-1 ring-[#2f4553] focus-within:ring-[#557086]">
              <input type="number" min={min} max={max} value={amount} disabled={auto} onChange={(e) => setAmount(Number(e.target.value))} className="w-full min-w-0 bg-transparent px-2.5 py-1.5 text-xs sm:text-sm font-bold text-white outline-none" />
              <button disabled={auto} onClick={() => setAmount((a) => Math.max(min, Math.floor(a / 2)))} className="border-l border-[#213743] bg-[#2f4553] px-2.5 text-xs font-bold text-white hover:bg-[#3d5564]">½</button>
              <button disabled={auto} onClick={() => setAmount((a) => Math.min(max, a * 2))} className="border-l border-[#213743] bg-[#2f4553] px-2.5 text-xs font-bold text-white hover:bg-[#3d5564]">2×</button>
            </div>
          </label>
          <div className="grid grid-cols-5 gap-1">{BET_PRESETS.map((v) => <button key={v} disabled={auto} onClick={() => setAmount(v)} className={`rounded py-1 text-[10px] font-bold transition hover:scale-105 ${amount === v ? "bg-[#00e701] text-slate-950 font-black" : "bg-[#0f212e] text-slate-300 ring-1 ring-[#2f4553]"}`}>{v}</button>)}</div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-0.5 block text-[10px] font-semibold text-slate-300">Risk</span>
              <select value={risk} disabled={locked} onChange={(e) => setRisk(e.target.value as Risk)} className="w-full rounded-md border border-[#2f4553] bg-[#0f212e] px-2 py-1.5 text-xs font-bold capitalize text-white outline-none focus:border-[#557086] disabled:opacity-60">
                {(["low", "medium", "high"] as Risk[]).map((r) => <option key={r} value={r} className="capitalize">{r[0].toUpperCase() + r.slice(1)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[10px] font-semibold text-slate-300">Rows</span>
              <select value={rows} disabled={locked} onChange={(e) => setRows(Number(e.target.value))} className="w-full rounded-md border border-[#2f4553] bg-[#0f212e] px-2 py-1.5 text-xs font-bold text-white outline-none focus:border-[#557086] disabled:opacity-60">
                {[8, 9, 10, 11, 12, 13, 14, 15, 16].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>

          {auto && (
            <div>
              <span className="mb-0.5 block text-[10px] font-semibold text-slate-300">Number of Bets</span>
              <div className="grid grid-cols-4 gap-1">
                {[10, 25, 50, 100].map((n) => <button key={n} disabled={autoLeft > 0} onClick={() => setAutoCount(n)} className={`rounded py-1 text-[10px] font-bold ${autoCount === n ? "bg-[#00e701] text-slate-950 font-black" : "bg-[#0f212e] text-slate-300 ring-1 ring-[#2f4553]"}`}>{n}</button>)}
              </div>
            </div>
          )}

          {/* Action Button: Bet / Stop / Start */}
          <div className="mt-1">
            {!auto ? (
              <button disabled={!st || inflight >= 10} onClick={dropBall} className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 py-3 text-sm sm:text-base font-black text-slate-950 shadow-lg shadow-emerald-500/40 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer disabled:opacity-50">Bet</button>
            ) : autoLeft > 0 ? (
              <button onClick={stopAuto} className="w-full rounded-xl bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 py-3 text-sm sm:text-base font-black text-white shadow-lg shadow-rose-900/50 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer">Stop Autobet ({autoLeft})</button>
            ) : (
              <button onClick={() => { autoRef.current = { on: true, left: autoCount }; setAuto(false); setTimeout(() => setAuto(true), 0); }} className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 py-3 text-sm sm:text-base font-black text-slate-950 shadow-lg shadow-emerald-500/40 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer">Start Autobet</button>
            )}
          </div>
          {msg && <p className="rounded-md bg-red-500/15 px-2 py-1 text-[11px] text-red-300">{msg}</p>}

          <div className="rounded-md bg-[#0f212e] p-2 text-[10px] text-slate-400">
            <div className="flex justify-between"><span>{st?.dailyPoolEnabled ? "Max claim weight" : "Max payout"}</span><b className="text-white">{table.length ? fmtMult(Math.max(...table.filter(multiplier => multiplier < 25))) : "-"}</b></div>
            {st?.dailyPoolEnabled && <p className="mt-1 text-[10px] text-amber-200">daily pool · Multipliers are provisional claims, not immediate payouts.</p>}
            {!st?.dailyPoolEnabled && <div className="flex justify-between"><span>Positive returns</span><b className="text-white">10% per drop</b></div>}
          </div>
        </aside>

        {/* Canvas Display */}
        <div className="relative min-w-0 w-full shrink-0 lg:w-auto lg:flex-1 flex items-center justify-center bg-[#0f212e] rounded-xl overflow-hidden">
          <div ref={wrapRef} className="relative mx-auto flex w-full max-w-[760px] aspect-[760/640] items-center justify-center">
            <canvas ref={canvasRef} aria-label="Plinko board" className="block max-w-full" />
          </div>
          <div className="pointer-events-none absolute right-2 top-2 flex w-12 flex-col gap-1 sm:right-3">
            {results.slice(0, 5).map((r) => {
              const idx = table.findIndex((m) => m === r.m);
              const c = bucketColor(idx < 0 ? 0 : idx, table.length || 1);
              return <div key={r.id} title={r.poolPending ? `Daily pool pending · Provisional claim ${money(r.poolClaim ?? 0)}` : money(r.payout)} className="animate-[pop_.25s_ease-out] rounded py-0.5 text-center text-[10px] font-black text-slate-950 shadow" style={{ background: r.poolPending ? "#fbbf24" : c.top }}>{fmtMult(r.m)}{r.poolPending && <span className="block text-[8px]">Pending</span>}</div>;
            })}
          </div>
          <style>{`@keyframes pop{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}`}</style>
        </div>
      </div>

      {/* Fairness & Recent Strip */}
      <footer className="shrink-0 flex items-center justify-between border-t border-[#213743] bg-[#0f212e] px-3 py-1 text-[10px] text-slate-400">
        <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto max-w-[60%]">
          {st?.recent?.slice(0, 6).map((r) => (
            <span key={r.id} className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${r.poolPending ? "bg-amber-500/20 text-amber-200" : r.payout >= r.bet ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-700/40 text-slate-400"}`}>{fmtMult(r.multiplier)}{r.poolPending ? " · Pending" : ""}</span>
          ))}
        </div>
      </footer>
    </div>
  );
}

/* ---------- canvas drawing ---------- */
function ballPos(b: Ball, g: ReturnType<typeof geom>, now: number, v: Vis) {
  const t = now - b.start;
  const seg = Math.floor(t / STEP); // 0 = initial fall, 1..rows = bounce after hitting row seg-1
  const f = Math.max(0, Math.min(1, t / STEP - seg));
  const rightsBefore = (row: number) => { let n = 0; for (let i = 0; i < row; i++) n += b.path[i]; return n; };
  const P = (s: number) => {
    if (s < 0) return { x: W / 2, y: PAD_TOP - g.gapY * 0.9 };
    if (s < b.rows) { const p = g.peg(s, 1 + rightsBefore(s)); return { x: p.x, y: p.y - g.ballR - g.pegR }; }
    return { x: g.bucketX(rightsBefore(b.rows)), y: g.bucketY - g.ballR + 2 };
  };
  if (seg > b.rows) return { ...P(b.rows), finished: t > (b.rows + 1) * STEP + 260 };
  const a = P(seg - 1), c = P(seg);
  if (seg >= 1 && !b.flashed.has(seg)) { b.flashed.add(seg); v.hitPegs.set(`${seg - 1}-${1 + rightsBefore(seg - 1)}`, now); }
  if (seg === b.rows && f > 0.97 && !b.landed) { b.landed = true; v.bucketBounce.set(b.col, now); }
  const x = a.x + (c.x - a.x) * f;
  const y = seg === 0 ? a.y + (c.y - a.y) * f * f : a.y + (c.y - a.y) * f * f - Math.sin(Math.PI * f) * g.gapY * 0.32;
  return { x, y, finished: false };
}

function drawScene(ctx: CanvasRenderingContext2D, v: Vis, now: number) {
  const { rows, table } = v;
  const g = geom(rows);
  ctx.clearRect(0, 0, W, H);

  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < r + 3; i++) {
      const p = g.peg(r, i);
      const hitAt = v.hitPegs.get(`${r}-${i}`);
      const glow = hitAt !== undefined && now - hitAt < 320 ? 1 - (now - hitAt) / 320 : 0;
      if (glow > 0) { ctx.fillStyle = `rgba(255,255,255,${0.4 * glow})`; ctx.beginPath(); ctx.arc(p.x, p.y, g.pegR * (1 + 2.4 * glow), 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(p.x, p.y, g.pegR * (1 + 0.3 * glow), 0, Math.PI * 2); ctx.fill();
    }
  }

  for (let k = 0; k <= rows; k++) {
    const cx = g.bucketX(k);
    const bounceAt = v.bucketBounce.get(k);
    const dy = bounceAt !== undefined && now - bounceAt < 320 ? Math.sin(((now - bounceAt) / 320) * Math.PI) * 8 : 0;
    const c = bucketColor(k, rows + 1);
    const x = cx - g.bw / 2, y = g.bucketY + dy;
    ctx.fillStyle = c.side; rr(ctx, x, y + 4, g.bw, g.bh, 5); ctx.fill();
    ctx.fillStyle = c.top; rr(ctx, x, y, g.bw, g.bh, 5); ctx.fill();
    const label = fmtMult(table[k] ?? 0) + (table[k] === 25 ? "*" : "");
    ctx.fillStyle = "#1a1a1a";
    ctx.font = `900 ${Math.max(8, g.bw * (label.length > 4 ? 0.24 : 0.3))}px system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, cx, y + g.bh / 2 + 1);
  }

  const keep: Ball[] = [];
  for (const b of v.balls) {
    const { x, y, finished } = ballPos(b, g, now, v);
    if (finished) continue;
    keep.push(b);
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.arc(x + 2, y + 3, g.ballR, 0, Math.PI * 2); ctx.fill();
    const grad = ctx.createRadialGradient(x - g.ballR * 0.35, y - g.ballR * 0.35, g.ballR * 0.15, x, y, g.ballR);
    grad.addColorStop(0, "#ff8fa3"); grad.addColorStop(1, "#e4003a");
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, g.ballR, 0, Math.PI * 2); ctx.fill();
  }
  v.balls = keep;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.arcTo(x + w, y, x + w, y + h, rad); ctx.arcTo(x + w, y + h, x, y + h, rad); ctx.arcTo(x, y + h, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath();
}
