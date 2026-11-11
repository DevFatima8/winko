"use client";

import Link from "next/link";
import { useEffect, useState, type RefObject } from "react";
import { ArrowLeft, Menu, Signal, Volume2, VolumeX, X } from "lucide-react";
import { BET_PRESETS } from "@/lib/betPresets";
import { aviatorPayout } from "@/lib/aviatorRules";
import type { AviatorPanel, AviatorState } from "./AviatorGame";

type Props = {
  state: AviatorState;
  phase: "waiting" | "running" | "crashed";
  multiplier: number;
  countdown: number;
  panels: AviatorPanel[];
  canvasRef: RefObject<HTMLCanvasElement | null>;
  wrapRef: RefObject<HTMLDivElement | null>;
  backHref: string;
  sound: boolean;
  onSound: () => void;
  onPanelChange: (slot: number, patch: Partial<AviatorPanel>) => void;
  onBet: (slot: number) => void;
  onCancel: (slot: number) => void;
  onCashout: (slot: number) => void;
  toast: { t: "ok" | "err"; m: string; sub?: string } | null;
};
const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const historyColor = (value: number) => value < 2 ? "text-sky-300" : value < 10 ? "text-purple-300" : "text-pink-300";

export function AviatorScenicView({
  state, phase, multiplier, countdown, panels, canvasRef, wrapRef, backHref,
  sound, onSound, onPanelChange, onBet, onCancel, onCashout, toast,
}: Props) {
  const [section, setSection] = useState<"game" | "results" | "rules">("game");
  const [activity, setActivity] = useState<"live" | "mine" | "top">("live");
  const [menu, setMenu] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState(false);
  const [graphicsError, setGraphicsError] = useState("");
  const showCountdown = phase === "waiting" || phase === "crashed" && countdown > 0;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const failed = (event: Event) => setGraphicsError(event instanceof ErrorEvent ? event.message : "3D graphics interrupted. Waiting for your browser to restore the display.");
    const restored = () => setGraphicsError("");
    canvas.addEventListener("aviator-render-error", failed);
    canvas.addEventListener("webglcontextlost", failed);
    canvas.addEventListener("webglcontextrestored", restored);
    return () => {
      canvas.removeEventListener("aviator-render-error", failed);
      canvas.removeEventListener("webglcontextlost", failed);
      canvas.removeEventListener("webglcontextrestored", restored);
    };
  }, [canvasRef]);
  return (
    <div data-aviator-ui="scenic" className="relative h-full min-h-0 w-full flex-1 overflow-y-auto overscroll-contain bg-black text-white">
      <div className="mx-auto w-full max-w-[1100px]">
        <header className="relative z-30 flex min-h-10 items-center justify-between gap-1 border-b border-[#2c2d30] bg-[#141516] px-2 py-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <Link href={backHref} aria-label="Back to Lobby" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#ef4444] bg-[#dc2626] text-white shadow-md"><ArrowLeft size={16} /></Link>
            <span className="text-base font-black italic tracking-tight text-[#e50539]">Aviator</span>
          </div>
          <div className="flex min-w-0 items-center gap-1">
            <div className="min-w-0 rounded-lg border border-[#1e293b] bg-[#090d16] px-1.5 py-1 text-right text-[10px]">
              <span className="mr-1 hidden text-[9px] font-bold uppercase text-slate-400 min-[400px]:inline">Balance:</span>
              <strong className="break-all tabular-nums text-[#22c55e]">{money(state.balance)} <span className="text-[8px] font-normal text-slate-400">Rs.</span></strong>
            </div>
            <Link href="/player/wallet" className="shrink-0 rounded-lg border border-[#22c55e] bg-[#16a34a] px-1.5 py-1 text-[10px] font-bold">+ Deposit</Link>
            <button type="button" aria-label={sound ? "Mute sound" : "Enable sound"} onClick={onSound} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#334155] bg-[#1e293b]">{sound ? <Volume2 size={14} /> : <VolumeX size={14} />}</button>
            <button type="button" aria-label="Game menu" aria-expanded={menu} onClick={() => setMenu(!menu)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#334155] bg-[#1e293b]"><Menu size={14} /></button>
          </div>
          {menu && <div className="absolute right-2 top-11 z-40 w-52 rounded border border-[#2c2d30] bg-[#1b1c1d] p-2 text-sm shadow-xl">
            <button type="button" className="w-full p-2 text-left" onClick={() => { setSection("results"); setActivity("mine"); setMenu(false); }}>My Bet History</button>
            <button type="button" className="w-full p-2 text-left" onClick={() => { setSection("rules"); setMenu(false); }}>How to Play</button>
          </div>}
        </header>
        <nav aria-label="Aviator sections" className="mx-2 flex h-10 items-center justify-between border border-[#94733b] bg-gradient-to-b from-[#383638] to-[#151416] px-2">
          <span className="text-sm">AVIATOR</span>
          <div className="flex overflow-hidden rounded border border-[#0ba580]">
            {(["game", "results", "rules"] as const).map(tab => <button type="button" key={tab} aria-pressed={section === tab} onClick={() => setSection(tab)} className={`px-2.5 py-1 text-xs capitalize ${section === tab ? "bg-[#151a1c]" : "bg-[#009d78]"}`}>{tab}</button>)}
          </div>
        </nav>

        <div className={section === "game" ? "block" : "hidden"}>
          <div ref={wrapRef} className="relative mx-2 h-[clamp(280px,44svh,470px)] overflow-hidden border-x border-[#94733b] bg-[#143635] md:h-[clamp(300px,calc(100dvh-360px),640px)]">
            <canvas ref={canvasRef} aria-label="3D red plane flying over a continuous forest and city landscape" className="block h-full w-full" />
            {graphicsError && <div role="alert" className="absolute inset-x-2 bottom-12 z-20 rounded bg-red-950/95 p-3 text-center text-xs">{graphicsError} Your bets still follow the live server round.</div>}
            <div className="absolute left-2 top-1 rounded-full bg-black/45 px-2 py-0.5 text-[10px]">{state.totals.count} live bets</div>
            <Signal aria-label="Live game" size={23} className="absolute right-1 top-1 text-[#43e844]" />
            <div aria-live="polite" className="pointer-events-none absolute inset-x-0 top-6 flex flex-col items-center text-center">
              {showCountdown ? <>
                <strong className="mt-6 text-3xl font-black tracking-wide text-white drop-shadow-[0_2px_2px_#000]">NEXT ROUND</strong>
                <span className="mt-1 text-lg font-bold drop-shadow-[0_2px_2px_#000]">Starts in {Math.ceil(Math.min(countdown, state.config.waitMs / 1000))}s</span>
                <div className="mt-3 h-1.5 w-36 overflow-hidden rounded bg-black/50"><div className="h-full bg-[#26ca65]" style={{ width: `${Math.max(0, Math.min(100, countdown / (state.config.waitMs / 1000) * 100))}%` }} /></div>
              </> : <>
                {phase === "crashed" && <strong className="text-4xl font-black tracking-wide text-[#d50e38] [-webkit-text-stroke:1px_white]">CRASHED!</strong>}
                <strong aria-live="off" className={`text-[clamp(52px,15vw,84px)] font-black leading-tight tabular-nums drop-shadow-[0_3px_2px_#000] ${phase === "crashed" ? "mt-4 text-[#d50e38] [-webkit-text-stroke:1px_white]" : "text-white"}`}>{money(multiplier)} x</strong>
              </>}
            </div>
            {toast && <div role={toast.t === "err" ? "alert" : "status"} className={`absolute inset-x-2 bottom-10 rounded px-3 py-2 text-center text-xs shadow-lg ${toast.t === "err" ? "bg-red-950/95" : "bg-green-950/95"}`}>{toast.m}{toast.sub && <div className="mt-1 font-bold">{toast.sub}</div>}</div>}
          </div>
          <div className="mx-2 flex min-h-9 items-stretch border border-[#94733b] bg-gradient-to-b from-[#373737] to-[#161616]">
            <div className="flex min-w-0 flex-1 overflow-hidden">
              {state.history.slice(0, 5).map(row => <span key={row.id} className={`flex min-w-0 flex-1 items-center justify-center border-r border-white/60 px-1 text-[10px] tabular-nums ${historyColor(row.crashPoint)}`}>{row.crashPoint.toFixed(2)}</span>)}
              {!state.history.length && <span className="p-2 text-[10px] text-white/60">Round history appears after play</span>}
            </div>
            <button type="button" aria-expanded={expandedHistory} onClick={() => setExpandedHistory(!expandedHistory)} className="shrink-0 px-3 py-1 text-[10px]">History</button>
          </div>
          {expandedHistory && <div className="mx-2 flex flex-wrap gap-2 border border-[#94733b] bg-[#252125] p-3 text-xs">{state.history.map(row => <span key={row.id} className={historyColor(row.crashPoint)}>#{row.id}: {row.crashPoint.toFixed(2)}x</span>)}</div>}

          <div className="mx-2 grid grid-cols-2 gap-2 bg-[#392b30] px-1 py-2 sm:gap-3 sm:p-3">
            {panels.slice(0, state.config.slots).map((panel, slot) => {
              const mine = state.myBets.find(bet => bet.slot === slot);
              const queued = state.queued.find(bet => bet.slot === slot);
              const pending = mine?.outcome === "pending";
              const locked = pending || !!queued;
              const amount = Number(panel.amount) || 0;
              const setAmount = (value: number) => onPanelChange(slot, { amount: Math.max(state.config.minBet, value).toFixed(2) });
              const cashout = pending && phase === "running";
              const cancel = !!queued || pending && phase === "waiting";
              const betAmount = mine?.bet ?? amount;
              const net = Math.floor(betAmount * multiplier * 0.98 * 100) / 100;
              const potential = mine?.flightModel ? aviatorPayout(betAmount, Math.min(multiplier, mine.autoCashout ?? Infinity, state.config.maxCashout ?? 99.98))
                : mine?.poolVersion ? Math.round(betAmount * multiplier * 100) / 100 : Math.floor((betAmount + net) * 100) / 100;
              return <section key={slot} aria-label={`Bet panel ${slot + 1}`} className="min-w-0">
                <div className="flex h-12 items-center rounded-2xl border border-[#ded7d9] bg-[#30252b]">
                  <button type="button" aria-label={`Decrease bet ${slot + 1}`} disabled={locked} onClick={() => setAmount(amount - 50)} className="h-11 w-9 shrink-0 text-2xl text-white/70 disabled:opacity-40">−</button>
                  <input aria-label={`Bet amount ${slot + 1}`} inputMode="decimal" value={panel.amount} disabled={locked} onChange={event => onPanelChange(slot, { amount: event.target.value })} onBlur={() => setAmount(Number(panel.amount) || state.config.minBet)} className="w-full min-w-0 bg-transparent text-center text-lg font-bold text-white outline-none disabled:opacity-60" />
                  <button type="button" aria-label={`Increase bet ${slot + 1}`} disabled={locked} onClick={() => setAmount(amount + 50)} className="h-11 w-9 shrink-0 text-2xl text-white/70 disabled:opacity-40">+</button>
                </div>
                <div className="my-2 grid grid-cols-3 gap-1 md:grid-cols-5">
                  {BET_PRESETS.map(value => <button type="button" key={value} disabled={locked} onClick={() => setAmount(value)} className="min-h-8 min-w-0 break-all rounded-sm border border-[#bfb4b8] px-1 text-xs disabled:opacity-40">{value}</button>)}
                </div>
                <button type="button" data-action={cashout ? "cashout" : cancel ? "cancel" : phase === "waiting" ? "bet" : "bet-next"} disabled={panel.busy} onClick={() => cashout ? onCashout(slot) : cancel ? onCancel(slot) : onBet(slot)} className={`flex min-h-11 w-full flex-col items-center justify-center rounded-sm px-1 text-base text-white disabled:opacity-50 ${cashout ? "bg-[#d58a13]" : cancel ? "bg-[#c42c3c]" : "bg-[#209b39]"}`}>
                  {panel.busy ? "Confirming..." : cashout ? mine?.poolVersion ? "Lock Claim" : "Cash Out" : cancel ? "Cancel" : showCountdown ? "Bet" : "Next"}
                  {cashout && <span className="text-xs">Rs. {money(potential)}</span>}
                </button>
                {queued && <div className="mt-1 text-center text-[10px] text-amber-200">Reserved for next round</div>}
                {mine && mine.outcome !== "pending" && <div className={`mt-1 text-center text-[10px] ${mine.outcome === "win" ? "text-green-300" : "text-red-300"}`}>{mine.poolPending ? `Claim Rs. ${money(mine.poolClaim ?? 0)} · Daily payout pending` : mine.outcome === "win" ? `Paid: Rs. ${money(mine.win)}` : "No win"}</div>}
                <div className="mt-1 space-y-1 text-[11px] sm:text-xs md:flex md:flex-wrap md:items-center md:gap-x-4 md:space-y-0">
                  <label className="flex min-h-7 cursor-pointer items-center gap-1"><input type="checkbox" aria-label={`Auto Bet ${slot + 1}`} checked={panel.autoBet} onChange={event => onPanelChange(slot, { autoBet: event.target.checked })} className="peer sr-only" /><span className="h-5 w-10 shrink-0 rounded-full border-2 border-[#ad2533] bg-[#473940] p-px peer-checked:border-[#219b39] peer-checked:bg-[#219b39] peer-focus-visible:outline-2 peer-focus-visible:outline-white"><span className={`block h-3.5 w-3.5 rounded-full bg-white transition-transform ${panel.autoBet ? "translate-x-5" : ""}`} /></span>Auto Bet</label>
                  <label className="flex min-h-7 cursor-pointer items-center gap-1"><input type="checkbox" aria-label={`Auto Cashout ${slot + 1}`} checked={panel.autoCash} disabled={locked} onChange={event => onPanelChange(slot, { autoCash: event.target.checked })} className="sr-only" /><span className={`h-5 w-10 shrink-0 rounded-full border-2 p-px ${panel.autoCash ? "border-[#219b39] bg-[#219b39]" : "border-[#ad2533] bg-[#473940]"}`}><span className={`block h-3.5 w-3.5 rounded-full bg-white transition-transform ${panel.autoCash ? "translate-x-5" : ""}`} /></span>Auto Cashout</label>
                  {panel.autoCash && <label className="flex items-center gap-1">At <input aria-label={`Auto Cashout multiplier ${slot + 1}`} inputMode="decimal" min={1.01} max={state.config.maxCashout ?? 99.98} step={0.01} disabled={locked} value={panel.autoCashAt} onChange={event => onPanelChange(slot, { autoCashAt: event.target.value })} onBlur={() => onPanelChange(slot, { autoCashAt: Math.min(state.config.maxCashout ?? 99.98, Math.max(1.01, Number(panel.autoCashAt) || 1.01)).toFixed(2) })} className="w-16 rounded border border-white/40 bg-black/25 p-1 text-center" />x</label>}
                </div>
                <details className="mt-1 text-[10px] text-white/70"><summary className="cursor-pointer py-1">More amounts</summary><div className="grid grid-cols-3 gap-1 py-1">{BET_PRESETS.map(value => <button type="button" key={value} disabled={locked} onClick={() => setAmount(value)} className="rounded border border-white/30 py-1 disabled:opacity-40">{value}</button>)}</div></details>
              </section>;
            })}
          </div>
        </div>

        {section === "rules" ? <section className="m-2 rounded border border-[#94733b] bg-[#292227] p-4 text-sm leading-relaxed">
          <h2 className="mb-3 text-lg font-bold">How to Play</h2>
          <ol className="list-decimal space-y-3 pl-4"><li>Choose your amount and press Bet during the NEXT ROUND countdown. Your stake is reserved immediately.</li><li>The multiplier increases when the plane takes off. Cash out strictly before it crashes. Gross payout is stake times multiplier, rounded down to whole paisa; otherwise payout is zero.</li><li>Next reserves a bet for the following round. Cancel it before that round starts.</li><li>Auto Bet repeats your selected stake. Set Auto Cashout before betting, from 1.01x to 99.98x. The server settles the saved target even after a disconnect.</li><li>Crash points range from 1.00x to 99.99x and never reach 100x. An equal crash/cashout target loses. The fixed-target theoretical RTP is approximately 80% before rounding; actual returns vary.</li></ol>
          {state.fairness && <details className="mt-3 break-all text-xs"><summary>Seed verification</summary><p>Model: {state.fairness.version}<br />Current seed hash: {state.fairness.serverSeedHash}<br />Public client seed: {state.fairness.clientSeed}<br />Nonce: {state.fairness.nonce}<br />Next seed hash: {state.fairness.nextServerSeedHash}</p>{state.history[0]?.fairness?.serverSeed && <p className="mt-2">Last revealed seed: {state.history[0].fairness.serverSeed}<br />Hash: {state.history[0].fairness.serverSeedHash}<br />Nonce: {state.history[0].fairness.nonce}</p>}</details>}
        </section> : <section className="mx-2 mb-4 bg-[#edf2fa] text-[#152332]">
          <div className="flex items-center justify-between bg-[#203e57] px-2 py-1.5 text-xs text-white"><strong>Live Bets: {state.totals.count}</strong><select aria-label="Bet activity" value={activity} onChange={event => { const value = event.target.value; if (value === "live" || value === "mine" || value === "top") setActivity(value); }} className="rounded border border-white/30 bg-[#203e57] px-1 py-1"><option value="live">Live Bets</option><option value="mine">My History</option><option value="top">Top Wins</option></select></div>
          <div className="flex flex-wrap justify-end gap-1 bg-[#e0e6e8] px-2 py-1 text-[10px]"><span>Cashed out: {state.totals.cashed}</span></div>
          {section === "results" && <div className="flex flex-wrap gap-2 border-b border-slate-300 bg-[#30252b] p-2 text-xs">{state.history.map(row => <span key={row.id} className={historyColor(row.crashPoint)}>#{row.id} {row.crashPoint.toFixed(2)}x</span>)}</div>}
          <table className="w-full table-fixed text-left text-xs">
            <thead className="bg-[#d3d8d6]"><tr>{["User", "Size", "Price", "Profit"].map(label => <th key={label} className="px-2 py-2 font-bold">{label}</th>)}</tr></thead>
            <tbody>
              {activity === "live" && state.bets.map(bet => <tr key={bet.id} className="border-b border-slate-200"><td className="truncate px-2 py-3">{bet.name}</td><td className="break-words px-2">{money(bet.bet)}</td><td className="px-2">{bet.mult ? `${bet.mult.toFixed(2)}x` : "--"}</td><td className="break-words px-2">{bet.poolPending ? "Pool pending" : bet.outcome === "win" ? money(bet.win) : "--"}</td></tr>)}
              {activity === "mine" && state.myHistory.map(bet => <tr key={bet.id} className="border-b border-slate-200"><td className="px-2 py-3">You<br /><span className="text-[9px]">#{bet.round}</span></td><td className="break-words px-2">{money(bet.bet)}</td><td className="px-2">{bet.poolPending ? "Pool pending" : bet.outcome === "lose" ? "No win" : bet.outcome}</td><td className="break-words px-2">{bet.poolPending ? `Claim ${money(bet.poolClaim ?? 0)}` : bet.outcome === "lose" ? "—" : money(bet.win)}</td></tr>)}
              {activity === "top" && state.top.map((bet, index) => <tr key={`${bet.round}-${index}`} className="border-b border-slate-200"><td className="truncate px-2 py-3">{bet.name}</td><td className="break-words px-2">{money(bet.bet)}</td><td className="px-2">{bet.mult.toFixed(2)}x</td><td className="break-words px-2">{money(bet.win)}</td></tr>)}
              {!(activity === "live" ? state.bets.length : activity === "mine" ? state.myHistory.length : state.top.length) && <tr><td colSpan={4} className="p-6 text-center text-slate-500">{activity === "live" ? "No bets placed in this round yet" : "No records yet"}</td></tr>}
            </tbody>
          </table>
          {state.queued.length > 0 && <div className="border-t border-slate-300 px-2 py-2 text-xs">Your next-round reservations: Rs. {money(state.queued.reduce((sum, bet) => sum + bet.bet, 0))}</div>}
        </section>}
        {section !== "game" && <button type="button" onClick={() => setSection("game")} className="mx-2 mb-4 flex items-center gap-2 rounded border border-[#94733b] px-3 py-2 text-sm"><X size={14} /> Back to Game</button>}
      </div>
    </div>
  );
}
