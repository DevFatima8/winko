"use client";

import { localApi } from "@/lib/client";
import { playGameSound, speakGameVoice } from "@/lib/gameAudio";
import { broadcastBalanceUpdate } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

/* Spribe Mines replica: blue theme, stars/bombs, green BET & CASH OUT */
type PoolResult = { poolPending?: boolean; poolClaim?: number };
type G = { id: string; bet: number; mines: number; revealed: number[]; status: "active" | "cashed" | "dead"; win: number; multiplier: number; potential: number; next: number; safeLeft: number; mineCells: number[] | null } & PoolResult;
type State = { dailyPoolEnabled?: boolean; game: G | null; balance: number; limits: { min: number; max: number; minMines: number; maxMines: number; rtp: number }; recent: ({ id: string; bet: number; mines: number; win: number; status: string; safe: number; multiplier: number } & PoolResult)[] };
const fmt2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function mult(mines: number, safe: number, rtp: number) { if (safe <= 0) return 1; let m = 1; for (let i = 0; i < safe; i++) m *= (25 - i) / (25 - mines - i); return Math.floor(m * rtp * 100) / 100; }

const C = { bg: "#0b1a30", panel: "#0f2240", tile: "#1e3a6b", tileTop: "#2a4d8a", line: "#1b3560", green: "#28a909", greenHover: "#36cb12", text: "#c7d2e8" };

export function MinesGame({ backHref = "/player" }: { backHref?: string }) {
  const [st, setSt] = useState<State | null>(null);
  const [amount, setAmount] = useState("100.00");
  const [customAmount, setCustomAmount] = useState(100);
  const [mines, setMines] = useState(3);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ cell: number; kind: "star" | "mine" } | null>(null);
  const [banner, setBanner] = useState<({ mult: number; win: number } & PoolResult) | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoCash, setAutoCash] = useState(false);
  const [autoCashAt, setAutoCashAt] = useState("2.00");
  const [rules, setRules] = useState(false);

  const load = useCallback(async () => { const r = await localApi("/api/mines", { cache: "no-store" }); if (r.ok) { const j: State = await r.json(); setSt(j); if (typeof j.balance === "number") broadcastBalanceUpdate(j.balance, "Mines"); if (j.game) { setMines(j.game.mines); setAmount(j.game.bet.toFixed(2)); } } }, []);
  useEffect(() => { load(); }, [load]);
  const post = async (body: unknown) => {
    try {
      const r = await localApi("/api/mines", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (r.status === 401) { window.location.href = "/login"; return null; }
      return await r.json();
    } catch {
      await load().catch(() => { });
      return { error: "Connection interrupted. Current round refreshed; check its state before continuing." };
    }
  };

  const start = async () => {
    const betAmt = Number(amount);
    if (!betAmt || isNaN(betAmt) || betAmt < 10) {
      setErr("Minimum bet is Rs. 10. Please enter at least 10.");
      return;
    }
    setBusy(true); setErr(null); setBanner(null); setFlash(null);
    const j = await post({ action: "start", amount: betAmt, mines });
    setBusy(false);
    if (!j) return;
    if (j.error) { setErr(j.error); return; }
    playGameSound("launch");
    setSt((s) => (s ? { ...s, game: j.game, balance: typeof j.balance === "number" ? j.balance : s.balance - betAmt } : s));
    if (st) broadcastBalanceUpdate(typeof j.balance === "number" ? j.balance : st.balance - betAmt, "Mines");
  };
  const cashout = useCallback(async () => { setBusy(true); const j = await post({ action: "cashout" }); setBusy(false); if (!j) return; if (j.error) { setErr(j.error); return; } if (!j.poolPending) { playGameSound("cashout"); speakGameVoice("gemFound"); } setBanner({ mult: j.multiplier, win: j.win, poolPending: j.poolPending, poolClaim: j.poolClaim }); window.dispatchEvent(new CustomEvent("wx:game-result", { detail: { game: "Mines", bet: j.game.bet, win: j.win, won: !j.poolPending && j.win > 0, poolPending: j.poolPending, poolClaim: j.poolClaim } })); setSt((s) => (s ? { ...s, game: j.game } : s)); load(); }, [load]);
  const reveal = async (cell: number) => {
    if (!st?.game || st.game.status !== "active" || busy || st.game.revealed.includes(cell)) return;
    setBusy(true); const j = await post({ action: "reveal", cell }); setBusy(false); if (!j) return;
    if (j.error) { setErr(j.error); return; }
    setFlash({ cell, kind: j.event === "mine" ? "mine" : "star" });
    if (j.event === "mine") { playGameSound("crash"); speakGameVoice("mineHit"); } else { playGameSound("coin"); speakGameVoice("gemFound"); }
    setSt((s) => (s ? { ...s, game: j.game } : s));
    if (j.event === "cleared") { setBanner({ mult: j.game.multiplier, win: j.game.win, poolPending: j.game.poolPending, poolClaim: j.game.poolClaim }); window.dispatchEvent(new CustomEvent("wx:game-result", { detail: { game: "Mines", bet: j.game.bet, win: j.game.win, won: !j.game.poolPending && j.game.win > 0, poolPending: j.game.poolPending, poolClaim: j.game.poolClaim } })); load(); }
    if (j.event === "mine") window.dispatchEvent(new CustomEvent("wx:game-result", { detail: { game: "Mines", bet: j.game.bet, win: 0, won: false, poolPending: j.game.poolPending, poolClaim: 0 } }));
    if (j.event === "mine") setTimeout(load, 300);
    if (j.event === "gem" && autoCash && j.game.multiplier >= Number(autoCashAt)) setTimeout(cashout, 200);
  };
  const random = () => { if (!st?.game) return; const free = Array.from({ length: 25 }, (_, i) => i).filter((c) => !st.game!.revealed.includes(c)); reveal(free[Math.floor(Math.random() * free.length)]); };

  if (!st) return <div className="flex h-[60vh] items-center justify-center rounded-2xl text-slate-400" style={{ background: C.bg }}>Loading Mines…</div>;
  const g = st.game; const active = g?.status === "active";
  const poolMode = active ? g.poolPending : st.dailyPoolEnabled;
  const amt = Number(amount) || 0;
  const nextM = mult(mines, (g?.revealed.length ?? 0) + 1, st.limits.rtp);
  const setAmt = (v: number) => setAmount(Math.max(10, Math.min(Math.max(10, Math.floor(st.balance)), v)).toFixed(2));

  return (
    <div className="h-full w-full flex flex-col justify-between overflow-y-auto overflow-x-hidden lg:overflow-hidden rounded-xl sm:rounded-2xl border border-[#1b3560] select-none" style={{ background: C.bg, color: C.text }}>
      {/* top bar */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2" style={{ background: C.panel, borderBottom: `1px solid ${C.line}` }}>
        <div className="flex items-center gap-2">
          {backHref && (
            <Link href={backHref} className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] active:bg-[#991b1b] border border-[#ef4444] text-xs font-black text-white shadow-md active:translate-y-[1px] transition-all cursor-pointer" title="Back">
              ←
            </Link>
          )}
          <span className="text-lg sm:text-xl font-black italic tracking-tight text-white">Mines</span>
          <button onClick={() => setRules(true)} className="ml-1 hidden items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-bold text-white sm:flex bg-[#1e3a6b] hover:bg-[#2563eb] border border-[#2a4d8a] transition cursor-pointer">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/20 text-[8px] font-black">?</span> How to play
          </button>
        </div>
        <span className="rounded-lg bg-[#0b1a30] border border-[#1b3560] px-2.5 py-1 text-xs sm:text-sm font-black text-[#22c55e]">{fmt2(st.balance)} <span className="text-[10px] text-slate-400 font-normal">Rs.</span></span>
      </div>

      <div className="flex-1 lg:min-h-0 flex flex-col lg:grid lg:grid-cols-[1fr_310px] xl:grid-cols-[1fr_330px] lg:overflow-hidden">
        {/* grid */}
        <div className="relative shrink-0 lg:shrink lg:flex-1 lg:min-h-0 flex flex-col items-center justify-center p-2 sm:p-4 lg:overflow-hidden">
          {/* mines selector + multiplier bar */}
          <div className="mb-2 flex w-full max-w-[min(380px,100%)] lg:max-w-[min(380px,50vh)] items-center justify-between gap-2 shrink-0">
            <label className={`flex items-center gap-2 rounded-full px-2.5 py-1 text-xs ${active ? "opacity-60" : ""}`} style={{ background: C.panel, border: `1px solid ${C.line}` }}>
              <BombIcon size={14} /><span className="text-slate-300">Mines</span>
              <select value={mines} disabled={active} onChange={(e) => setMines(Number(e.target.value))} className="bg-transparent font-bold text-white outline-none">
                {Array.from({ length: st.limits.maxMines }, (_, i) => i + 1).map((n) => <option key={n} value={n} className="bg-[#0f2240]">{n}</option>)}
              </select>
            </label>
            <div className="flex items-center gap-2 rounded-full px-2.5 py-1 text-xs" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
              <StarIcon size={14} /><span className="text-slate-300">Next</span><b className="text-white">{fmt2(nextM)}x</b>
            </div>
          </div>

          <div className="grid w-full max-w-[min(380px,100%)] lg:max-w-[min(380px,50vh)] grid-cols-5 gap-1.5 sm:gap-2 aspect-square">
            {Array.from({ length: 25 }, (_, c) => {
              const opened = g?.revealed.includes(c) ?? false;
              const ended = g && g.status !== "active";
              const isMine = ended && g?.mineCells?.includes(c);
              const hit = flash?.cell === c;
              const showStar = opened || (ended && !isMine);
              return (
                <button key={c} onClick={() => reveal(c)} disabled={!active || opened || busy}
                  className={`relative aspect-square rounded-xl transition-all duration-150 ${!opened && active ? "hover:brightness-125 active:scale-95" : ""} ${hit ? "scale-105" : ""}`}
                  style={{ background: showStar ? (opened ? "#0b1a30" : "#0d1f3a") : isMine ? "#3b0d16" : `linear-gradient(180deg, ${C.tileTop}, ${C.tile})`, boxShadow: showStar || isMine ? `inset 0 0 0 2px ${C.line}` : "0 3px 0 #142a52, inset 0 1px 0 rgba(255,255,255,.12)", opacity: ended && !opened && !isMine ? 0.55 : 1 }}>
                  {showStar && <StarIcon size={0} big dim={!opened} pop={hit && flash?.kind === "star"} />}
                  {isMine && <BombIcon size={0} big boom={hit && flash?.kind === "mine"} />}
                </button>
              );
            })}
          </div>
          {banner && <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10"><div className="rounded-2xl border-4 border-[#28a909] px-6 py-4 text-center shadow-2xl" style={{ background: "rgba(11,26,48,.96)" }}><div className="text-xs font-semibold uppercase tracking-widest text-slate-300">{banner.poolPending ? "Daily pool pending" : "You won!"}</div><div className="text-3xl sm:text-4xl font-black text-[#28a909]">{fmt2(banner.mult)}x</div><div className="mt-1 text-sm font-bold text-white">{banner.poolPending ? "Provisional claim " : ""}Rs. {fmt2(banner.poolPending ? banner.poolClaim ?? 0 : banner.win)}</div>{banner.poolPending && <div className="mt-1 text-[10px] text-amber-200">Not an instant payment</div>}</div></div>}
          {g?.status === "dead" && !banner && <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center z-10"><div className="rounded-full bg-[#cb011a] px-3 py-1 text-xs font-black text-white shadow-xl">Boom! You hit a mine</div></div>}
        </div>

        {/* controls */}
        <aside className="shrink-0 lg:w-[310px] xl:w-[330px] flex flex-col justify-between p-2.5 sm:p-3 overflow-y-auto lg:overflow-y-hidden border-t lg:border-t-0 lg:border-l border-[#1b3560] bg-[#0f2240] text-xs gap-2">
          <div className="flex justify-center shrink-0">
            <div className="flex rounded-lg p-0.5 bg-[#0b1a30] border border-[#1b3560] text-[10px] font-semibold">
              <button onClick={() => setAutoOpen(false)} className={`rounded-md px-3 py-1 font-bold transition cursor-pointer ${!autoOpen ? "bg-[#1e3a6b] text-white border border-[#2a4d8a]" : "text-slate-400 hover:text-white"}`}>Bet</button>
              <button onClick={() => setAutoOpen(true)} className={`rounded-md px-3 py-1 font-bold transition cursor-pointer ${autoOpen ? "bg-[#1e3a6b] text-white border border-[#2a4d8a]" : "text-slate-400 hover:text-white"}`}>Auto</button>
            </div>
          </div>

          <div className={active ? "pointer-events-none opacity-60 shrink-0" : "shrink-0"}>
            <div className="mb-1 text-[9px] uppercase tracking-wider text-slate-300 font-bold">Bet amount (Min 10)</div>
            <div className="flex items-center gap-1 rounded-xl px-1.5 py-1 bg-[#0b1a30] border border-[#1b3560]">
              <button onClick={() => setAmt(amt - 50)} className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#1e3a6b] hover:bg-[#2563eb] border border-[#2a4d8a] text-sm font-black text-white transition cursor-pointer">−</button>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} onBlur={() => setAmt(Number(amount) || 50)} className="w-full min-w-0 bg-transparent text-center text-sm font-bold text-white outline-none" />
              <button onClick={() => setAmt(amt + 50)} className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#1e3a6b] hover:bg-[#2563eb] border border-[#2a4d8a] text-sm font-black text-white transition cursor-pointer">+</button>
            </div>
            <div className="mt-1.5 grid grid-cols-5 gap-1">
              {BET_PRESETS.map((v) => (
                <button key={v} onClick={() => setAmt(v)} className={`rounded-lg py-1 text-[10px] font-black transition cursor-pointer ${amt === v ? "bg-[#16a34a] text-white border border-[#22c55e]" : "bg-[#1e3a6b] text-slate-200 border border-[#2a4d8a] hover:bg-[#2563eb] hover:text-white"}`}>{v}</button>
              ))}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 rounded-lg px-2 py-1 bg-[#0b1a30] border border-[#1b3560]">
              <input type="number" min={10} max={Math.max(10, Math.floor(st.balance))} value={customAmount} onChange={(e) => setCustomAmount(Math.max(10, Math.min(Math.max(10, Math.floor(st.balance)), Number(e.target.value) || 50)))} className="w-14 bg-transparent text-center text-[10px] font-bold text-white outline-none" />
              <button onClick={() => setAmt(customAmount)} className={`rounded-md px-2.5 py-0.5 text-[9px] font-black transition cursor-pointer ${Number(amount) === customAmount ? "bg-[#16a34a] text-white" : "bg-[#2563eb] hover:bg-[#1d4ed8] text-white"}`}>Custom</button>
            </div>
          </div>

          {autoOpen && (
            <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[10px] shrink-0 bg-[#0b1a30] border border-[#1b3560]">
              <span className="text-slate-300 font-semibold">Auto Cash Out</span>
              <span className="flex items-center gap-1.5">
                <button type="button" onClick={() => setAutoCash(!autoCash)} className={`h-4 w-7 rounded-full p-0.5 transition ${autoCash ? "bg-[#16a34a]" : "bg-slate-600"}`}>
                  <span className={`block h-3 w-3 rounded-full bg-white transition ${autoCash ? "translate-x-3" : ""}`} />
                </button>
                <span className="flex items-center rounded-full px-1.5 bg-[#0f2240] border border-[#1b3560]">
                  <input value={autoCashAt} disabled={!autoCash} onChange={(e) => setAutoCashAt(e.target.value)} className="w-10 bg-transparent py-0.5 text-center font-bold text-white outline-none disabled:opacity-40" />
                  <span className="text-slate-500 text-[10px]">x</span>
                </span>
              </span>
            </div>
          )}

          {active && g ? (
            <div className="flex flex-col gap-1.5 shrink-0">
              <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
                <div className="rounded-lg p-1 bg-[#0b1a30] border border-[#1b3560]"><div className="text-slate-400">Stars</div><div className="font-black text-white">{g.safeLeft}</div></div>
                <div className="rounded-lg p-1 bg-[#0b1a30] border border-[#1b3560]"><div className="text-slate-400">Mines</div><div className="font-black text-white">{g.mines}</div></div>
                <div className="rounded-lg p-1 bg-[#0b1a30] border border-[#1b3560]"><div className="text-slate-400">Current</div><div className="font-black text-[#22c55e]">{fmt2(g.multiplier)}x</div></div>
              </div>
              <button onClick={random} disabled={busy} className="w-full rounded-xl py-2 text-xs font-black text-white bg-[#2563eb] hover:bg-[#1d4ed8] border-2 border-[#3b82f6] shadow-md transition active:scale-[0.98] cursor-pointer" style={{ backgroundColor: "#2563eb", color: "#ffffff" }}>Random pick</button>
              <button data-action="cashout" onClick={cashout} disabled={busy || g.revealed.length === 0} className="flex w-full flex-col items-center justify-center rounded-xl py-3 bg-[#d97706] hover:bg-[#b45309] active:bg-[#92400e] border-2 border-[#f59e0b] text-white shadow-xl transition active:scale-[0.98] disabled:opacity-50 cursor-pointer" style={{ backgroundColor: "#d97706", color: "#ffffff", borderColor: "#f59e0b" }}>
                <span className="text-base font-black uppercase leading-none">{g.poolPending ? "Lock claim" : "Cash out"}</span>
                <span className="mt-0.5 text-sm font-bold">Rs. {fmt2(g.potential)}</span>
              </button>
            </div>
          ) : (
            <div className="shrink-0">
              <button data-action="bet" onClick={start} disabled={busy} className="flex w-full flex-col items-center justify-center rounded-xl py-3.5 bg-[#16a34a] hover:bg-[#15803d] active:bg-[#14532d] border-2 border-[#22c55e] text-white shadow-xl transition active:scale-[0.98] disabled:opacity-50 cursor-pointer uppercase tracking-wider" style={{ backgroundColor: "#16a34a", color: "#ffffff", borderColor: "#22c55e", boxShadow: "0 6px 20px rgba(22, 163, 74, 0.45)" }}>
                <span className="text-base sm:text-lg font-black uppercase leading-none">Bet</span>
                <span className="mt-1 text-sm font-bold">Rs. {fmt2(amt)}</span>
              </button>
            </div>
          )}
          {err && <p className="rounded-lg bg-[#7f1d1d] border border-[#dc2626] px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">{err}</p>}

          <div className="rounded-lg p-2 text-[10px] shrink-0" style={{ background: C.bg }}>
            <div className="mb-1 flex items-center justify-between text-slate-400"><span>Multipliers ({mines} mines)</span><span>{poolMode ? "daily pool" : ""}</span></div>
            <div className="flex flex-wrap gap-1">{Array.from({ length: Math.min(8, 25 - mines) }, (_, i) => mult(mines, (g?.revealed.length ?? 0) + i + 1, st.limits.rtp)).map((m, i) => <span key={i} className={`rounded-full px-1.5 py-0.5 font-bold ${i === 0 ? "bg-[#28a909] text-white" : "text-slate-200"}`} style={i === 0 ? {} : { background: C.tile }}>{fmt2(m)}x</span>)}</div>
          </div>
          <div className="flex items-center justify-between text-[9px] text-slate-500 shrink-0"><span>Provably Fair</span><span>Powered by winkox</span></div>
        </aside>
      </div>

      {st.recent.length > 0 && (
        <div className="shrink-0 px-3 py-1 text-[10px] border-t border-[#1b3560] bg-[#0b1a30]">
          <div className="flex flex-wrap gap-1 items-center">
            {st.recent.slice(0, 10).map((r) => (
              <span key={r.id} className={`rounded-full px-2 py-0.5 font-bold ${r.status === "cashed" ? "bg-[#28a909]/20 text-[#4ade80]" : "bg-red-500/15 text-red-300"}`}>
                {r.poolPending ? `Pending · Claim Rs. ${fmt2(r.poolClaim ?? 0)}` : r.status === "cashed" ? `${fmt2(r.multiplier)}x` : `✕ ${r.safe}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {rules && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={() => setRules(false)}>
          <div className="w-full max-w-md rounded-2xl p-4 text-xs text-slate-300" style={{ background: C.panel, border: `1px solid ${C.line}` }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between"><h3 className="text-base font-black italic text-white">Mines — How to play</h3><button onClick={() => setRules(false)} className="text-slate-400 hover:text-white font-bold">✕</button></div>
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>Choose bet amount and number of mines (1–24) hidden in the 5×5 field.</li>
              <li>Press BET and open tiles. Each star increases your multiplier.</li>
              {/* <li>{poolMode ? "Cash out locks bet × multiplier as a provisional claim, not an immediate wallet payment. A mine ends your round with no successful claim." : "Press CASH OUT any time to collect bet × multiplier. Hit a mine — the bet is lost."}</li>
              <li>{poolMode ? "35% of each game's accepted stakes is shared after the UTC+5 day closes and all wagers finish. If no one succeeds, all accepted stakes share the pool, including losses." : "Auto Cash Out collects automatically at your target multiplier. RTP 97%."}</li> */}
            </ol>
            <button onClick={() => setRules(false)} className="mt-3 w-full rounded-lg bg-[#28a909] py-1.5 font-bold text-white">GOT IT</button>
          </div>
        </div>
      )}
    </div>
  );
}

function StarIcon({ size, big, dim, pop }: { size: number; big?: boolean; dim?: boolean; pop?: boolean }) {
  const cls = big ? "mx-auto h-[64%] w-[64%]" : "";
  return (
    <svg viewBox="0 0 64 64" width={big ? undefined : size} height={big ? undefined : size} className={`${cls} ${pop ? "animate-[pop_.35s_ease-out]" : ""}`} style={{ opacity: dim ? 0.35 : 1, filter: dim || !big ? "none" : "drop-shadow(0 0 10px rgba(255,214,0,.7))" }}>
      <defs><linearGradient id="st" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff3a8" /><stop offset="1" stopColor="#f5b400" /></linearGradient></defs>
      <path d="M32 4l8.6 18.4L60 25.2 45.6 39l3.7 20L32 49.4 14.7 59l3.7-20L4 25.2l19.4-2.8z" fill="url(#st)" stroke="#c98a00" strokeWidth="2" strokeLinejoin="round" />
      <style>{`@keyframes pop{0%{transform:scale(.3)}60%{transform:scale(1.2)}100%{transform:scale(1)}}`}</style>
    </svg>
  );
}
function BombIcon({ size, big, boom }: { size: number; big?: boolean; boom?: boolean }) {
  const cls = big ? "mx-auto h-[66%] w-[66%]" : "";
  return (
    <svg viewBox="0 0 64 64" width={big ? undefined : size} height={big ? undefined : size} className={`${cls} ${boom ? "animate-[shake_.4s_ease-in-out]" : ""}`} style={{ filter: big ? "drop-shadow(0 0 12px rgba(239,68,68,.8))" : "none" }}>
      {boom && <circle cx="32" cy="34" r="30" fill="rgba(239,68,68,.35)" />}
      <circle cx="30" cy="38" r="20" fill="#1f2937" stroke="#0b0f19" strokeWidth="2" /><circle cx="24" cy="32" r="6" fill="#4b5563" />
      <rect x="36" y="12" width="10" height="10" rx="2" fill="#4b5563" transform="rotate(-30 41 17)" /><path d="M46 14 Q54 6 58 10" stroke="#f59e0b" strokeWidth="3" fill="none" /><circle cx="59" cy="9" r="4" fill="#fbbf24" />
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}`}</style>
    </svg>
  );
}
