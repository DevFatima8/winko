"use client";

import { localApi } from "@/lib/client";
import { playGameSound, speakGameVoice } from "@/lib/gameAudio";
import { broadcastBalanceUpdate } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Sym = "seven" | "bar3" | "bar2" | "bar1" | "bell" | "cherry" | "lemon" | "orange" | "plum";
type PoolResult = { poolPending?: boolean; poolClaim?: number };
type State = { dailyPoolEnabled?: boolean; balance: number; limits: { min: number; max: number }; paytable: { combo: string; label: string; mult: number }[]; recent: ({ id: string; bet: number; win: number; data: string | null } & PoolResult)[] };
const ORDER: Sym[] = ["seven", "bar3", "bar2", "bar1", "bell", "cherry", "lemon", "orange", "plum"];
const fmt2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SYM_H = 80;

function Symbol({ s, size = 60 }: { s: Sym; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 100 100" };
  switch (s) {
    case "seven": return <svg {...common}><defs><linearGradient id="g7" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ff6b6b" /><stop offset="1" stopColor="#c8102e" /></linearGradient></defs><text x="50" y="82" textAnchor="middle" fontSize="88" fontWeight="900" fontFamily="Impact, Arial Black, sans-serif" fill="url(#g7)" stroke="#7f0a1a" strokeWidth="3">7</text></svg>;
    case "bar3": return <svg {...common}>{[14, 40, 66].map((y) => <g key={y}><rect x="10" y={y} width="80" height="22" rx="4" fill="#111827" stroke="#fbbf24" strokeWidth="2" /><text x="50" y={y + 16} textAnchor="middle" fontSize="14" fontWeight="900" fill="#fbbf24" fontFamily="Arial Black, sans-serif">BAR</text></g>)}</svg>;
    case "bar2": return <svg {...common}>{[26, 54].map((y) => <g key={y}><rect x="10" y={y} width="80" height="22" rx="4" fill="#111827" stroke="#fbbf24" strokeWidth="2" /><text x="50" y={y + 16} textAnchor="middle" fontSize="14" fontWeight="900" fill="#fbbf24" fontFamily="Arial Black, sans-serif">BAR</text></g>)}</svg>;
    case "bar1": return <svg {...common}><rect x="10" y="39" width="80" height="24" rx="4" fill="#111827" stroke="#fbbf24" strokeWidth="2" /><text x="50" y="57" textAnchor="middle" fontSize="16" fontWeight="900" fill="#fbbf24" fontFamily="Arial Black, sans-serif">BAR</text></svg>;
    case "bell": return <svg {...common}><path d="M50 14 C36 14 28 26 28 42 v18 l-10 12 h64 l-10 -12 v-18 c0-16-8-28-22-28z" fill="#fbbf24" stroke="#b45309" strokeWidth="3" /><circle cx="50" cy="86" r="7" fill="#b45309" /><circle cx="50" cy="12" r="5" fill="#b45309" /></svg>;
    case "cherry": return <svg {...common}><path d="M50 14 Q40 40 30 58 M50 14 Q66 40 70 58" stroke="#16a34a" strokeWidth="5" fill="none" strokeLinecap="round" /><circle cx="30" cy="66" r="16" fill="#dc2626" stroke="#7f1d1d" strokeWidth="2" /><circle cx="70" cy="66" r="16" fill="#ef4444" stroke="#7f1d1d" strokeWidth="2" /><circle cx="25" cy="60" r="4" fill="#fecaca" /><circle cx="65" cy="60" r="4" fill="#fecaca" /></svg>;
    case "lemon": return <svg {...common}><ellipse cx="50" cy="54" rx="34" ry="24" fill="#facc15" stroke="#a16207" strokeWidth="3" transform="rotate(-20 50 54)" /><circle cx="18" cy="42" r="5" fill="#eab308" /><circle cx="82" cy="66" r="5" fill="#eab308" /></svg>;
    case "orange": return <svg {...common}><circle cx="50" cy="56" r="30" fill="#f97316" stroke="#9a3412" strokeWidth="3" /><path d="M50 26 q4 -14 16 -14" stroke="#16a34a" strokeWidth="5" fill="none" strokeLinecap="round" /><ellipse cx="60" cy="18" rx="10" ry="5" fill="#22c55e" /></svg>;
    case "plum": return <svg {...common}><circle cx="50" cy="58" r="28" fill="#7c3aed" stroke="#4c1d95" strokeWidth="3" /><path d="M50 30 q2 -14 12 -16" stroke="#16a34a" strokeWidth="5" fill="none" strokeLinecap="round" /><path d="M44 40 q-10 8 -8 24" stroke="#c4b5fd" strokeWidth="3" fill="none" opacity=".6" /></svg>;
  }
}

function Reel({ target, spinning, delay, onStop }: { target: Sym; spinning: boolean; delay: number; onStop: () => void }) {
  const [pos, setPos] = useState(0); // in symbol units (float)
  const posRef = useRef(0); const velRef = useRef(0); const raf = useRef(0); const stopping = useRef(false); const done = useRef(true);
  useEffect(() => {
    if (!spinning) return;
    done.current = false; stopping.current = false; velRef.current = 0;
    const start = performance.now();
    const targetIdx = ORDER.indexOf(target);
    const tick = (now: number) => {
      const el = now - start;
      if (!stopping.current) {
        velRef.current = Math.min(0.55, velRef.current + 0.02);
        posRef.current += velRef.current;
        if (el > 900 + delay) {
          // choose a landing position: nearest future multiple where (pos mod 9) == targetIdx
          const cur = posRef.current; const base = Math.floor(cur / ORDER.length) * ORDER.length + targetIdx;
          const land = base + (base - cur < 3 ? ORDER.length * 2 : ORDER.length);
          stopping.current = true; (tick as unknown as { land: number }).land = land; (tick as unknown as { t0: number }).t0 = now; (tick as unknown as { p0: number }).p0 = cur;
        }
      } else {
        const T = tick as unknown as { land: number; t0: number; p0: number };
        const dur = 700; const p = Math.min(1, (now - T.t0) / dur); const e = 1 - Math.pow(1 - p, 3);
        posRef.current = T.p0 + (T.land - T.p0) * e;
        if (p >= 1) { posRef.current = T.land; setPos(posRef.current); done.current = true; onStop(); return; }
      }
      setPos(posRef.current);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning]);
  useEffect(() => { if (!spinning && done.current) { const idx = ORDER.indexOf(target); posRef.current = idx; setPos(idx); } }, [target, spinning]);
  const frac = pos % ORDER.length;
  const items = [-1, 0, 1].map((k) => ORDER[(((Math.floor(frac) + k) % ORDER.length) + ORDER.length) % ORDER.length]);
  const offset = (frac - Math.floor(frac)) * SYM_H;
  return (
    <div className="relative h-[230px] w-[90px] overflow-hidden rounded-lg bg-gradient-to-b from-[#f8fafc] via-white to-[#e2e8f0] shadow-[inset_0_0_24px_rgba(0,0,0,.25)] sm:w-[108px]">
      <div className="absolute inset-x-0" style={{ top: `calc(50% - ${SYM_H * 1.5}px - ${offset}px)` }}>
        {items.map((s, i) => <div key={i} className="flex items-center justify-center" style={{ height: SYM_H }}><Symbol s={s} /></div>)}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/40 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/40 to-transparent" />
    </div>
  );
}

export function Slot777Game({ backHref = "/player" }: { backHref?: string }) {
  const [st, setSt] = useState<State | null>(null);
  const [amount, setAmount] = useState(100);
  const [reels, setReels] = useState<Sym[]>(["seven", "seven", "seven"]);
  const [spinning, setSpinning] = useState(false);
  const [stopped, setStopped] = useState(0);
  const [result, setResult] = useState<({ win: { label: string; mult: number } | null; payout: number; balance: number } & PoolResult) | null>(null);
  const [show, setShow] = useState<{ label: string; mult: number; payout: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const [lever, setLever] = useState(false);
  const requestRef = useRef<{ requestId: string; amount: number } | null>(null);
  const submitting = useRef(false);

  const load = useCallback(async () => { const r = await localApi("/api/slot777", { cache: "no-store" }); if (r.ok) setSt(await r.json()); }, []);
  useEffect(() => { load(); }, [load]);

  const spin = useCallback(async () => {
    if (spinning || !st || submitting.current) return;
    submitting.current = true;
    setErr(null); setShow(null); setLever(true); setTimeout(() => setLever(false), 500);
    const request = requestRef.current ?? { requestId: crypto.randomUUID(), amount };
    requestRef.current = request;
    let r: Response;
    try { r = await localApi("/api/slot777", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }); }
    catch { submitting.current = false; setErr("Connection interrupted. Spin again to safely retry the same wager."); setAuto(false); return; }
    if (r.status === 401) { window.location.href = "/login"; return; }
    const j = await r.json();
    submitting.current = false;
    if (r.status < 500) requestRef.current = null;
    if (j.error) { setErr(j.error); setAuto(false); return; }
    setSt((s) => (s ? { ...s, balance: j.balance } : s));
    setReels(j.reels); setResult({ win: j.win, payout: j.payout, balance: j.balance, poolPending: j.poolPending, poolClaim: j.poolClaim }); setStopped(0); setSpinning(true);
    playGameSound("launch");
  }, [spinning, st, amount]);

  const onStop = useCallback(() => setStopped((n) => n + 1), []);
  useEffect(() => {
    if (spinning && stopped >= 3) {
      setSpinning(false);
      if (result) { setSt((s) => (s ? { ...s, balance: result.balance } : s)); broadcastBalanceUpdate(result.balance, "Lucky 777"); window.dispatchEvent(new CustomEvent("wx:game-result", { detail: { game: "Lucky 777", bet: amount, win: result.payout, won: !result.poolPending && !!result.win, poolPending: result.poolPending, poolClaim: result.poolClaim } })); if (result.win && !result.poolPending) { playGameSound("coin"); speakGameVoice("slotWin"); setShow({ ...result.win, payout: result.payout }); } }
      if (auto) setTimeout(() => spin(), 900);
    }
  }, [stopped, spinning, result, auto, spin]);

  if (!st) return <div className="flex h-full items-center justify-center rounded-2xl bg-[#1a0b0b] text-slate-400">Loading Lucky 777…</div>;

  return (
    <div className="flex h-full w-full flex-col justify-between overflow-hidden min-h-0 bg-[radial-gradient(ellipse_at_top,#4a1010,#1a0606_70%)] text-white p-1.5 sm:p-2 select-none">
      {/* Top Bar */}
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-[#5b1a1a] px-2 pb-1.5">
        <div className="flex items-center gap-2">
          <Link
            href={backHref}
            className="flex h-7 items-center gap-1 rounded-lg border border-white/20 bg-black/40 px-2 text-xs font-bold text-white transition hover:bg-white/10"
          >
            ← Back
          </Link>
          <span className="text-sm sm:text-base font-black tracking-wide">
            <span className="text-[#fbbf24]">LUCKY</span> <span className="text-[#ef4444]">777</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-black/50 px-2.5 py-1 text-xs sm:text-sm font-black text-[#fbbf24]">
            Rs. {fmt2(st.balance)}
          </span>
        </div>
      </header>

      {/* Main Machine Grid */}
      <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[1fr_240px] gap-2 sm:gap-3 p-1 overflow-hidden items-center justify-center">
        {/* Machine */}
        <div className="relative mx-auto w-full max-w-[500px] flex flex-col justify-center">
          {/* Marquee Lights */}
          <div className="mx-auto mb-1.5 flex justify-center gap-1.5">
            {Array.from({ length: 14 }, (_, i) => (
              <span
                key={i}
                className={`h-2 w-2 rounded-full ${spinning ? "animate-pulse" : ""}`}
                style={{ background: i % 2 ? "#fbbf24" : "#ef4444", boxShadow: "0 0 6px currentColor", animationDelay: `${i * 80}ms` }}
              />
            ))}
          </div>

          <div className="relative rounded-2xl sm:rounded-3xl border-4 border-[#b45309] bg-gradient-to-b from-[#7c2d12] to-[#431407] p-2.5 sm:p-4 shadow-[0_16px_40px_rgba(0,0,0,.6)]">
            <div className="rounded-xl bg-black/50 p-2 shadow-inner">
              <div className="relative flex justify-center gap-1.5 sm:gap-2.5">
                {reels.map((s, i) => <Reel key={i} target={s} spinning={spinning} delay={i * 350} onStop={onStop} />)}
                {/* Payline */}
                <div className="pointer-events-none absolute inset-x-1 top-1/2 h-[3px] -translate-y-1/2 bg-[#ef4444]/80 shadow-[0_0_10px_#ef4444]" />
                <span className="pointer-events-none absolute -left-1.5 top-1/2 -translate-y-1/2 text-xs text-[#ef4444]">▶</span>
                <span className="pointer-events-none absolute -right-1.5 top-1/2 -translate-y-1/2 text-xs text-[#ef4444]">◀</span>
              </div>
            </div>

            {/* Win Display */}
            <div className={`mt-2 rounded-lg border px-2 py-1 text-center ${show ? "border-[#fbbf24] bg-[#fbbf24]/15" : "border-[#7c2d12] bg-black/30"}`}>
              {result?.poolPending && !spinning ? <div className="text-xs text-amber-200">Daily pool pending · Claim Rs. {fmt2(result.poolClaim ?? 0)}<div className="text-[10px]">Provisional weight, not an instant payment.</div></div> : show ? (
                <>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#fbbf24]">{show.label} · ×{show.mult}</div>
                  <div className="text-lg sm:text-xl font-black text-white">WIN Rs. {fmt2(show.payout)}</div>
                </>
              ) : (
                <div className="text-xs text-slate-400">{spinning ? "Spinning…" : result && !result.win ? "..." : "Place bet & spin"}</div>
              )}
            </div>

            {/* Lever */}
            <button onClick={spin} disabled={spinning} className="absolute -right-3 top-6 hidden h-36 w-8 sm:block cursor-pointer" aria-label="Pull lever">
              <span className={`absolute left-1/2 top-0 h-24 w-1.5 -translate-x-1/2 rounded bg-slate-400 transition-transform duration-300 ${lever ? "origin-bottom rotate-[60deg]" : ""}`} />
              <span className={`absolute left-1/2 -top-2.5 h-7 w-7 -translate-x-1/2 rounded-full bg-[#ef4444] shadow-lg transition-transform duration-300 ${lever ? "translate-y-20" : ""}`} />
              <span className="absolute bottom-4 left-1/2 h-7 w-5 -translate-x-1/2 rounded bg-[#b45309]" />
            </button>
          </div>

          {/* Controls: Green SPIN button, colorful actions */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 rounded-xl bg-black/40 p-2 sm:grid sm:grid-cols-[1fr_auto_1fr]">
            <div className="flex items-center gap-1">
              <button onClick={() => setAmount((a) => Math.max(st.limits.min, a - 10))} className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-amber-700 hover:bg-amber-600 text-lg font-black text-white transition active:scale-95 cursor-pointer">−</button>
              <div className="flex-1 text-center"><div className="text-[9px] uppercase text-slate-400">Bet</div><div className="text-sm sm:text-base font-black text-white">{amount}</div></div>
              <button onClick={() => setAmount((a) => Math.min(Math.max(st.limits.min, Math.floor(st.balance)), a + 10))} className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-amber-700 hover:bg-amber-600 text-lg font-black text-white transition active:scale-95 cursor-pointer">+</button>
            </div>

            {/* SPIN: Emerald Green Vibrant button */}
            <button onClick={spin} disabled={spinning} className="h-11 sm:h-12 w-24 sm:w-32 shrink-0 rounded-xl bg-gradient-to-b from-emerald-400 via-emerald-500 to-green-700 hover:from-emerald-300 hover:to-green-600 text-base sm:text-lg font-black text-white shadow-[0_4px_0_#064e3b] hover:shadow-[0_2px_0_#064e3b] hover:translate-y-0.5 active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 cursor-pointer">{spinning ? "…" : "SPIN"}</button>

            <div className="flex min-w-0 max-w-full flex-col items-center gap-1 sm:items-end">
              <div className="flex flex-wrap justify-center gap-1">{BET_PRESETS.map((v) => <button key={v} onClick={() => setAmount(v)} className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition hover:scale-105 cursor-pointer ${amount === v ? "bg-amber-400 text-slate-950 font-black" : "bg-[#431407] text-slate-200 hover:bg-[#5a1c09]"}`}>{v}</button>)}</div>
              <div className="flex flex-wrap items-center justify-center gap-1">
                <button onClick={() => setAuto((a) => !a)} className={`rounded px-2 py-0.5 text-[10px] font-bold transition hover:scale-105 cursor-pointer ${auto ? "bg-rose-600 hover:bg-rose-500 text-white font-black" : "bg-emerald-700 hover:bg-emerald-600 text-white"}`}>{auto ? "STOP" : "AUTO"}</button>
              </div>
            </div>
          </div>
          {err && <p className="mt-1 rounded-lg bg-red-500/20 px-2 py-1 text-center text-xs text-red-200">{err}</p>}
        </div>

        {/* Paytable */}
        <aside className="rounded-xl bg-black/40 p-2 sm:p-2.5 max-h-[140px] lg:max-h-none overflow-y-auto min-h-0 w-full">
          <div className="mb-1 text-center text-xs font-black uppercase tracking-widest text-[#fbbf24]">{st.dailyPoolEnabled ? "Claim weights" : "Paytable"}</div>
          {st.dailyPoolEnabled && <p className="mb-2 text-center text-[10px] text-amber-200">daily pool · Provisional claims, not instant payouts. Settles after the UTC+5 day closes.</p>}
          <ul className="space-y-1 text-[11px]">
            {st.paytable.map((p) => (
              <li key={p.combo} className={`flex items-center justify-between rounded px-1.5 py-0.5 ${show?.label === p.label ? "bg-[#fbbf24]/20 ring-1 ring-[#fbbf24]" : "bg-white/5"}`}>
                <span className="flex items-center gap-1">{p.combo.includes(",") ? p.combo.split(",").map((s, i) => <Symbol key={i} s={s as Sym} size={16} />) : p.combo === "anybar" ? <><Symbol s="bar1" size={16} /><Symbol s="bar2" size={16} /><Symbol s="bar3" size={16} /></> : p.combo === "cherry2" ? <><Symbol s="cherry" size={16} /><Symbol s="cherry" size={16} /></> : <Symbol s="cherry" size={16} />}<span className="ml-1 text-slate-300">{p.label}</span></span>
                <b className="text-[#fbbf24]">×{p.mult}</b>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
