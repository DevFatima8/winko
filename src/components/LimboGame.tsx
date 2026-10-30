"use client";

import { localApi } from "@/lib/client";
import { playGameSound, speakGameVoice } from "@/lib/gameAudio";
import { broadcastBalanceUpdate } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type PoolResult = { poolPending?: boolean; poolClaim?: number };
type State = { dailyPoolEnabled?: boolean; balance: number; limits: { min: number; max: number; minTarget: number; maxTarget: number; rtp: number }; recent: ({ id: string; bet: number; win: number; outcome: string; result: number; target: number } & PoolResult)[] };
const fmt2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function LimboGame({ backHref = "/player" }: { backHref?: string }) {
  const [st, setSt] = useState<State | null>(null);
  const [amount, setAmount] = useState("50.00");
  const [customAmount, setCustomAmount] = useState(50);
  const [target, setTarget] = useState("2.00");
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [autoN, setAutoN] = useState(10);
  const [autoLeft, setAutoLeft] = useState(0);
  const [display, setDisplay] = useState(1);
  const [last, setLast] = useState<({ result: number; won: boolean; payout: number } & PoolResult) | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hist, setHist] = useState<({ result: number; won: boolean } & PoolResult)[]>([]);
  const autoRef = useRef({ on: false, left: 0 });
  const rafRef = useRef(0);
  const requestRef = useRef<{ requestId: string; amount: number; target: number } | null>(null);

  const load = useCallback(async () => { const r = await localApi("/api/limbo", { cache: "no-store" }); if (r.ok) setSt(await r.json()); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (st && hist.length === 0 && st.recent.length) setHist(st.recent.slice(0, 12).reverse().map((r) => ({ result: r.result, won: r.outcome === "win", poolPending: r.poolPending, poolClaim: r.poolClaim }))); }, [st, hist.length]);

  const tgt = Math.max(1.01, Number(target) || 1.01);
  const chance = 20;
  const amt = Number(amount) || 0;
  const profit = Math.floor(amt * tgt * 100) / 100 - amt;

  const animateTo = (val: number) => new Promise<void>((res) => {
    cancelAnimationFrame(rafRef.current);
    const start = performance.now(), dur = 900, from = 1;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur); const e = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (val - from) * e);
      if (p < 1) rafRef.current = requestAnimationFrame(tick); else res();
    };
    rafRef.current = requestAnimationFrame(tick);
  });

  const play = useCallback(async () => {
    if (busy) return;
    const betVal = Number(amount);
    if (!betVal || isNaN(betVal) || betVal < 10) {
      setErr("Minimum bet is Rs. 10. Please enter at least 10.");
      autoRef.current.on = false;
      setAutoLeft(0);
      return;
    }
    setBusy(true); setErr(null); setLast(null);
    const request = requestRef.current ?? { requestId: crypto.randomUUID(), amount: betVal, target: tgt };
    requestRef.current = request;
    let r: Response;
    try { r = await localApi("/api/limbo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }); }
    catch { setErr("Connection interrupted. Bet again to safely retry the same wager."); setBusy(false); autoRef.current.on = false; setAutoLeft(0); return; }
    if (r.status === 401) { window.location.href = "/login"; return; }
    const j = await r.json();
    if (r.status < 500) requestRef.current = null;
    if (j.error) { setErr(j.error); setBusy(false); autoRef.current.on = false; setAutoLeft(0); return; }
    setSt((s) => (s ? { ...s, balance: j.balance } : s));
    broadcastBalanceUpdate(j.balance, "Limbo");
    await animateTo(j.result);
    if (!j.poolPending) { if (j.won) { playGameSound("coin"); speakGameVoice("limboWin"); } else { playGameSound("crash"); } }
    setLast({ result: j.result, won: j.won, payout: j.payout, poolPending: j.poolPending, poolClaim: j.poolClaim });
    window.dispatchEvent(new CustomEvent("wx:game-result", { detail: { game: "Limbo", bet: request.amount, win: j.payout, won: !j.poolPending && j.won, poolPending: j.poolPending, poolClaim: j.poolClaim } }));
    setHist((h) => [...h.slice(-11), { result: j.result, won: j.won, poolPending: j.poolPending, poolClaim: j.poolClaim }]);
    setBusy(false);
  }, [busy, amount, tgt]);

  // autobet loop
  useEffect(() => {
    if (autoLeft <= 0 || !autoRef.current.on) return;
    if (busy) return;
    const id = setTimeout(async () => { await play(); autoRef.current.left--; setAutoLeft(autoRef.current.left); }, 350);
    return () => clearTimeout(id);
  }, [autoLeft, busy, play]);

  const startAuto = () => {
    const betVal = Number(amount);
    if (!betVal || isNaN(betVal) || betVal < 10) {
      setErr("Minimum bet is Rs. 10. Please enter at least 10.");
      return;
    }
    autoRef.current = { on: true, left: autoN };
    setAutoLeft(autoN);
  };
  const stopAuto = () => { autoRef.current.on = false; setAutoLeft(0); };

  if (!st) return <div className="flex h-[60vh] items-center justify-center rounded-2xl bg-[#0f212e] text-slate-400">Loading Limbo…</div>;
  const input = "w-full rounded-md border border-[#2f4553] bg-[#0f212e] px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-[#557086]";
  const resultColor = last?.poolPending ? "#fbbf24" : last ? (last.won ? "#00e701" : "#ff4d4d") : "#fff";

  return (
    <div className="h-full w-full flex flex-col justify-between overflow-hidden rounded-xl sm:rounded-2xl border border-[#213743] bg-[#0f212e] text-white select-none shadow-2xl">
      {/* top bar */}
      <div className="shrink-0 flex items-center justify-between border-b border-[#213743] bg-[#09151e] px-3 py-2">
        <div className="flex items-center gap-2">
          {backHref && (
            <Link href={backHref} className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] active:bg-[#991b1b] border border-[#ef4444] text-xs font-black text-white shadow-md active:translate-y-[1px] transition-all" title="Back">
              ←
            </Link>
          )}
          <span className="flex items-center gap-1.5 text-base font-black">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-[#16a34a] text-[10px] text-white font-black">↑</span>
            Limbo
          </span>
        </div>
        <span className="rounded-lg bg-[#1e293b] border border-[#334155] px-2.5 py-1 text-xs font-black text-white">{fmt2(st.balance)} <span className="text-[10px] text-slate-400">Rs.</span></span>
      </div>

      <div className="flex-1 min-h-0 flex flex-col-reverse lg:flex-row overflow-hidden">
        {/* sidebar */}
        <aside className="w-full lg:w-[290px] xl:w-[320px] shrink-0 flex flex-col justify-between bg-[#15232c] p-2.5 sm:p-3 overflow-y-auto lg:overflow-y-hidden border-t lg:border-t-0 lg:border-r border-[#213743] gap-2 text-xs">
          {/* mode switcher */}
          <div className="grid grid-cols-2 rounded-xl bg-[#09151e] border-2 border-[#334155] p-1 text-xs font-black shrink-0 gap-1.5 shadow-inner">
            <button
              type="button"
              onClick={() => { setMode("manual"); stopAuto(); }}
              className={`rounded-lg py-2.5 text-xs font-black transition-all cursor-pointer shadow-md uppercase tracking-wide border-2 ${mode === "manual"
                ? "bg-[#16a34a] hover:bg-[#15803d] text-white border-[#22c55e] shadow-green-900/30"
                : "bg-[#1e293b] hover:bg-[#334155] text-slate-200 border-[#475569]"
                }`}
              style={{
                backgroundColor: mode === "manual" ? "#16a34a" : "#1e293b",
                color: "#ffffff",
                borderColor: mode === "manual" ? "#22c55e" : "#475569",
              }}
            >
              Manual
            </button>
            <button
              type="button"
              onClick={() => setMode("auto")}
              className={`rounded-lg py-2.5 text-xs font-black transition-all cursor-pointer shadow-md uppercase tracking-wide border-2 ${mode === "auto"
                ? "bg-[#16a34a] hover:bg-[#15803d] text-white border-[#22c55e] shadow-green-900/30"
                : "bg-[#1e293b] hover:bg-[#334155] text-slate-200 border-[#475569]"
                }`}
              style={{
                backgroundColor: mode === "auto" ? "#16a34a" : "#1e293b",
                color: "#ffffff",
                borderColor: mode === "auto" ? "#22c55e" : "#475569",
              }}
            >
              Auto
            </button>
          </div>

          <div className="space-y-2.5 shrink-0">
            <label className="block">
              <span className="mb-1 flex justify-between text-[11px] font-bold text-slate-200">
                <span>Bet Amount (Min 10)</span>
                <span className="text-emerald-400 font-extrabold">Rs. {fmt2(amt)}</span>
              </span>
              <div className="flex overflow-hidden rounded-xl bg-[#09151e] border-2 border-[#334155] shadow-inner">
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onBlur={() => setAmount(Math.max(10, Number(amount) || 50).toFixed(2))}
                  className="w-full min-w-0 bg-transparent px-3 py-2 text-sm font-black outline-none text-white"
                />
                <button
                  type="button"
                  onClick={() => setAmount(Math.max(10, amt / 2).toFixed(2))}
                  className="border-l-2 border-slate-700 px-4 text-xs font-black text-white transition active:scale-95 cursor-pointer shadow-sm hover:brightness-110"
                  style={{ backgroundColor: "#2563eb", color: "#ffffff", borderLeftColor: "#334155" }}
                  title="Half Bet"
                >
                  ½
                </button>
                <button
                  type="button"
                  onClick={() => setAmount(Math.min(Math.max(10, Math.floor(st.balance)), Math.max(10, amt * 2)).toFixed(2))}
                  className="border-l-2 border-slate-700 px-4 text-xs font-black text-white transition active:scale-95 cursor-pointer shadow-sm hover:brightness-110"
                  style={{ backgroundColor: "#7c3aed", color: "#ffffff", borderLeftColor: "#334155" }}
                  title="Double Bet"
                >
                  2×
                </button>
              </div>
            </label>

            {/* Quick chips */}
            <div>
              <span className="mb-1 block text-[10px] font-bold text-slate-300">              Quick Bet (Rs.)</span>
              <div className="grid grid-cols-5 gap-1.5">
                {BET_PRESETS.map((v) => {
                  const isSelected = Math.round(amt) === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAmount(String(v))}
                      className={`rounded-lg py-2.5 text-xs font-black transition-all cursor-pointer shadow-md border-2 active:scale-95 ${isSelected
                        ? "text-white scale-105 shadow-green-900/40"
                        : "text-white hover:brightness-110"
                        }`}
                      style={{
                        backgroundColor: isSelected ? "#16a34a" : "#1e293b",
                        color: "#ffffff",
                        borderColor: isSelected ? "#22c55e" : "#475569",
                        boxShadow: isSelected ? "0 0 10px rgba(34, 197, 94, 0.45)" : undefined,
                      }}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom bet input */}
            <div className="flex items-center gap-2 rounded-xl border-2 border-[#334155] bg-[#09151e] p-1.5 shadow-inner">
              <input
                type="number"
                min={10}
                max={Math.max(10, Math.floor(st.balance))}
                value={customAmount}
                onChange={(e) => setCustomAmount(Math.max(10, Math.min(Math.max(10, Math.floor(st.balance)), Number(e.target.value) || 50)))}
                className="w-20 bg-transparent text-center text-xs font-black text-white outline-none"
              />
              <button
                type="button"
                onClick={() => setAmount(String(customAmount))}
                className={`flex-1 rounded-lg py-2 text-xs font-black transition-all cursor-pointer shadow-md border-2 uppercase tracking-wide active:scale-95 ${Math.round(amt) === customAmount
                  ? "text-white"
                  : "text-white hover:brightness-110"
                  }`}
                style={{
                  backgroundColor: Math.round(amt) === customAmount ? "#16a34a" : "#2563eb",
                  color: "#ffffff",
                  borderColor: Math.round(amt) === customAmount ? "#22c55e" : "#3b82f6",
                }}
              >
                Set Custom
              </button>
            </div>

            <label className="block">
              <input readOnly title="Maximum indicative net. Actual payout is limited by the available game payout budget." value={`Up to Rs. ${fmt2(Math.max(0, profit))}`} className={input + " py-2 text-xs text-emerald-400 font-extrabold"} />
            </label>
          </div>

          {mode === "auto" && (
            <div className="shrink-0 space-y-1.5">
              <span className="block text-[10px] font-bold text-slate-300">Number of Bets</span>
              <div className="grid grid-cols-4 gap-1.5">
                {[10, 25, 50, 100].map((n) => {
                  const isSelected = autoN === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setAutoN(n)}
                      className={`rounded-lg py-2 text-xs font-black transition-all cursor-pointer shadow-md border-2 active:scale-95 ${isSelected ? "text-white scale-105" : "text-white hover:brightness-110"
                        }`}
                      style={{
                        backgroundColor: isSelected ? "#16a34a" : "#1e293b",
                        color: "#ffffff",
                        borderColor: isSelected ? "#22c55e" : "#475569",
                        boxShadow: isSelected ? "0 0 8px rgba(34, 197, 94, 0.4)" : undefined,
                      }}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="shrink-0 pt-1">
            {mode === "manual" ? (
              <button
                type="button"
                disabled={busy}
                onClick={play}
                className="w-full rounded-xl py-4 text-base sm:text-lg font-black text-white shadow-xl transition-all active:scale-[.98] disabled:opacity-50 cursor-pointer tracking-widest uppercase border-2 hover:brightness-110"
                style={{
                  backgroundColor: "#16a34a",
                  color: "#ffffff",
                  borderColor: "#22c55e",
                  boxShadow: "0 6px 20px rgba(22, 163, 74, 0.45)",
                }}
              >
                {busy ? "Rolling…" : "Bet"}
              </button>
            ) : autoLeft > 0 ? (
              <button
                type="button"
                onClick={stopAuto}
                className="w-full rounded-xl py-4 text-base sm:text-lg font-black text-white shadow-xl transition-all active:scale-[.98] cursor-pointer tracking-widest uppercase border-2 hover:brightness-110"
                style={{
                  backgroundColor: "#dc2626",
                  color: "#ffffff",
                  borderColor: "#ef4444",
                  boxShadow: "0 6px 20px rgba(220, 38, 38, 0.45)",
                }}
              >
                Stop Autobet ({autoLeft})
              </button>
            ) : (
              <button
                type="button"
                onClick={startAuto}
                className="w-full rounded-xl py-4 text-base sm:text-lg font-black text-white shadow-xl transition-all active:scale-[.98] cursor-pointer tracking-widest uppercase border-2 hover:brightness-110"
                style={{
                  backgroundColor: "#16a34a",
                  color: "#ffffff",
                  borderColor: "#22c55e",
                  boxShadow: "0 6px 20px rgba(22, 163, 74, 0.45)",
                }}
              >
                Start Autobet
              </button>
            )}
          </div>

          {err && (
            <div
              className="rounded-lg bg-[#dc2626] border-2 border-[#ef4444] px-3 py-2 text-xs font-black text-white shrink-0 shadow-lg text-center"
              style={{ backgroundColor: "#dc2626", color: "#ffffff" }}
            >
              {err}
            </div>
          )}
          <div className="rounded-lg bg-[#09151e] border border-[#334155] p-2 text-[10px] text-slate-400 shrink-0">
            <div className="flex justify-between"><span>Max multiplier</span><b className="text-white">{st.limits.maxTarget.toLocaleString()}x</b></div>
          </div>
        </aside>

        {/* stage */}
        <div className="relative flex-1 min-h-0 flex flex-col justify-between bg-[#0f212e] overflow-hidden">
          <div className="shrink-0 flex justify-end gap-1.5 overflow-x-auto p-2 sm:p-2.5">
            {hist.map((h, i) => <span key={i} className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] sm:text-xs font-bold ${h.poolPending ? "bg-amber-500/20 text-amber-200" : h.won ? "bg-[#00e701] text-slate-950" : "bg-[#2f4553] text-slate-200"}`}>{fmt2(h.result)}×{h.poolPending ? " · Pending" : ""}</span>)}
          </div>
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-4 py-2">
            <div className={`text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black leading-none tracking-tight transition-colors ${busy ? "opacity-90" : ""}`} style={{ color: resultColor, textShadow: last?.won ? "0 0 48px rgba(0,231,1,.4)" : "none" }}>
              {fmt2(display)}<span className="text-4xl sm:text-5xl lg:text-7xl">×</span>
            </div>
          </div>
          <div className="shrink-0 grid grid-cols-2 gap-2 sm:gap-3 bg-[#213743] px-3 py-2 sm:px-4 sm:py-2.5 text-xs">
            <label className="block"><span className="mb-1 block font-semibold text-slate-300 text-[10px]">Target Multiplier</span><div className="relative"><input value={target} onChange={(e) => setTarget(e.target.value)} onBlur={() => setTarget(Math.min(st.limits.maxTarget, Math.max(st.limits.minTarget, Number(target) || 1.01)).toFixed(2))} className="w-full rounded-md border border-[#2f4553] bg-[#0f212e] px-2.5 py-1.5 text-xs sm:text-sm font-bold text-white outline-none focus:border-[#557086]" /><span className="absolute right-2.5 top-1.5 text-xs text-slate-400">×</span></div></label>
            <label className="block"><span className="mb-1 block font-semibold text-slate-300 text-[10px]">Win Chance</span><div className="relative"><input readOnly value={chance.toFixed(4)} className="w-full rounded-md border border-[#2f4553] bg-[#0f212e] px-2.5 py-1.5 text-xs sm:text-sm font-bold text-slate-200 outline-none" /><span className="absolute right-2.5 top-1.5 text-xs text-slate-400">%</span></div></label>
          </div>
        </div>
      </div>
    </div>
  );
}
