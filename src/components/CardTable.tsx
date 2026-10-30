"use client";

import { localApi } from "@/lib/client";
import { playGameSound, speakGameVoice } from "@/lib/gameAudio";
import { broadcastBalanceUpdate } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import styles from "./CardTable.module.css";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { UsersIcon, XIcon } from "@/components/Icons";
import { LiveBetActivity } from "@/components/LiveMultiplayerBets";
import type { MultiplayerBet } from "@/lib/multiplayer-types";

type Table = "dragon-tiger" | "andar-bahar";
type Card = { r: number; s: number };
type DTResult = { kind: "dragon-tiger"; dragon: Card; tiger: Card; winner: "dragon" | "tiger" | "tie" };
type ABResult = { kind: "andar-bahar"; joker: Card; andar: Card[]; bahar: Card[]; winner: "andar" | "bahar"; dealMs: number };
type Result = DTResult | ABResult;
type Opt = { label: string; pays: string; mult: number };
type State = {
  serverNow: number; table: Table; tableMode: "personal" | "shared";
  config: { name: string; betMs: number; options: Record<string, Opt>; min: number; max: number };
  round: { roundNo: number; status: "betting" | "revealing" | "settled"; bettingEndsAt: number; revealEndsAt: number; result: Result | null };
  myBets: { option: string; amount: number; status: string; payout: number }[];
  myTotal: number; myExpected: number;
  poolPending?: boolean; poolClaim?: number;
  queued?: { roundNo: number; bets: { option: string; amount: number }[]; total: number };
  totals: Record<string, { total: number; players: number }>;
  liveBets?: MultiplayerBet[];
  liveQueuedBets?: MultiplayerBet[];
  history: { roundNo: number; winner: string }[];
  stats: Record<string, number>;
  balance: number;
};

const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = ["♠", "♥", "♦", "♣"];
const CHIPS: number[] = [...BET_PRESETS];
const money = (n: number) => "Rs. " + n.toLocaleString("en-PK", { maximumFractionDigits: 2 });

const ZONE: Record<string, { bg: string; ring: string; text: string; bead: string; short: string }> = {
  dragon: { bg: "bg-[#dc2626]", ring: "ring-[#f87171]", text: "text-[#fca5a5]", bead: "bg-[#ef4444]", short: "D" },
  tie: { bg: "bg-[#16a34a]", ring: "ring-[#4ade80]", text: "text-[#86efac]", bead: "bg-[#22c55e]", short: "T" },
  tiger: { bg: "bg-[#d97706]", ring: "ring-[#fde047]", text: "text-[#fef08a]", bead: "bg-[#f59e0b]", short: "T" },
  andar: { bg: "bg-[#0284c7]", ring: "ring-[#38bdf8]", text: "text-[#7dd3fc]", bead: "bg-[#0ea5e9]", short: "A" },
  bahar: { bg: "bg-[#e11d48]", ring: "ring-[#fb7185]", text: "text-[#fda4af]", bead: "bg-[#f43f5e]", short: "B" },
};

/* ---------------- playing card ---------------- */
function PlayingCard({ card, faceUp, size = "md", glow, dim }: { card?: Card | null; faceUp: boolean; size?: "sm" | "md" | "lg"; glow?: boolean; dim?: boolean }) {
  const dims = size === "lg" ? "h-36 w-[6.5rem]" : size === "md" ? "h-28 w-20" : "h-[4.6rem] w-[3.3rem]";
  const red = card ? card.s === 1 || card.s === 2 : false;
  const fs = size === "lg" ? { corner: "text-lg", big: "text-5xl" } : size === "md" ? { corner: "text-sm", big: "text-4xl" } : { corner: "text-[10px]", big: "text-xl" };
  return (
    <div className={`relative shrink-0 ${dims} ${dim ? "opacity-60" : ""}`} style={{ perspective: 800 }}>
      <div className="absolute inset-0 transition-transform duration-500 ease-out" style={{ transformStyle: "preserve-3d", transform: faceUp ? "rotateY(180deg)" : "rotateY(0deg)" }}>
        {/* back */}
        <div className="absolute inset-0 overflow-hidden rounded-lg border-2 border-white bg-[#1d4ed8] shadow-lg" style={{ backfaceVisibility: "hidden" }}>
          <div className="absolute inset-1 rounded-md border border-white/60 bg-[repeating-linear-gradient(45deg,#1e40af_0_6px,#2563eb_6px_12px)]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-black tracking-tight text-blue-800">WG</span>
          </div>
        </div>
        {/* face */}
        <div className={`absolute inset-0 flex flex-col justify-between rounded-lg border bg-white p-1 shadow-xl ${red ? "text-red-600" : "text-slate-900"} ${glow ? "ring-4 ring-yellow-300 shadow-[0_0_28px_rgba(253,224,71,.8)]" : "border-slate-300"}`} style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
          {card && (
            <>
              <div className={`${fs.corner} font-black leading-none`}>{RANKS[card.r]}<div className="-mt-0.5">{SUITS[card.s]}</div></div>
              <div className={`${fs.big} text-center leading-none`}>{SUITS[card.s]}</div>
              <div className={`${fs.corner} rotate-180 font-black leading-none`}>{RANKS[card.r]}<div className="-mt-0.5">{SUITS[card.s]}</div></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- component ---------------- */
export function CardTable({ table, backHref = "/player" }: { table: Table; backHref?: string }) {
  const [st, setSt] = useState<State | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [chip, setChip] = useState(BET_PRESETS[0]);
  const [customAmount, setCustomAmount] = useState(BET_PRESETS[0]);
  const [dragonAmountText, setDragonAmountText] = useState(String(BET_PRESETS[0]));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err" | "info"; m: string } | null>(null);
  const [toast, setToast] = useState<{ roundNo: number; text: string; win: boolean } | null>(null);
  const lastBetsRef = useRef<{ option: string; amount: number }[]>([]);
  const shownRef = useRef<number>(0);
  const stRef = useRef<State | null>(null);
  const postBusy = useRef(false);
  const refreshController = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (refreshController.current) return;
    const controller = new AbortController();
    refreshController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const r = await localApi(`/api/cards/state?table=${table}`, { cache: "no-store", signal: controller.signal });
      if (!r.ok) throw new Error(`Game state request failed (${r.status}).`);
      const s: State = await r.json();
      if (controller.signal.aborted || refreshController.current !== controller) return;
      setOffset(s.serverNow - Date.now());
      const previousBalance = stRef.current?.balance;
      stRef.current = s;
      setSt(s);
      if (typeof s.balance === "number" && previousBalance !== s.balance) broadcastBalanceUpdate(s.balance, table);
      if (s.myBets.length && s.round.status === "betting") lastBetsRef.current = s.myBets.map((b) => ({ option: b.option, amount: b.amount }));
    } catch (error) {
      if (refreshController.current === controller) {
        console.error("[card table state]", error);
        setMsg({ t: "err", m: "Live connection interrupted. Reconnecting; check bet status before playing." });
      }
    } finally {
      clearTimeout(timeout);
      if (refreshController.current === controller) refreshController.current = null;
    }
  }, [table]);

  useEffect(() => {
    setSt(null); stRef.current = null; shownRef.current = 0; setToast(null); setMsg(null);
    refresh();
    const id = setInterval(refresh, 800);
    return () => {
      clearInterval(id);
      refreshController.current?.abort();
      refreshController.current = null;
    };
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  const post = useCallback(async (method: "POST" | "DELETE", body?: unknown, scope?: "queued") => {
    if (postBusy.current) return { error: "Request already in progress. Please wait." };
    postBusy.current = true;
    setBusy(true);
    const expectedRound = scope === "queued" ? stRef.current?.queued?.roundNo : stRef.current?.round.roundNo;
    try {
      const payload = body && typeof body === "object" ? { ...body, requestId: crypto.randomUUID() } : body;
      const r = await localApi(`/api/cards/bet${method === "DELETE" ? `?table=${table}${scope ? `&scope=${scope}` : ""}${expectedRound ? `&roundNo=${expectedRound}` : ""}` : ""}`, { method, headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000), body: payload ? JSON.stringify(payload) : undefined });
      return await r.json().catch(() => ({ error: "Server response samajh nahi aaya. Dobara try karein." }));
    } catch {
      return { error: "Connection issue. Bet status check karein before trying again." };
    } finally {
      postBusy.current = false;
      setBusy(false);
    }
  }, [table]);

  const handleBet = useCallback(async (option: string, amount = chip) => {
    if (busy) return;
    if (amount < 10) {
      setMsg({ t: "err", m: "Minimum bet is Rs. 10. Please place at least 10." });
      return;
    }
    const s = stRef.current;
    if (!s) return;
    if (amount > s.balance) {
      setMsg({ t: "err", m: "Insufficient balance. Pehle deposit karein." });
      return;
    }
    const open = s.round.status === "betting" && Date.now() + offset < s.round.bettingEndsAt;
    if (!open) {
      setMsg({ t: "err", m: "Betting is closed. Wait for the next round to begin." });
      return;
    }
    const targetRound = s.round.roundNo;
    const j = await post("POST", { table, option, amount, targetRound });
    if (j.error) setMsg({ t: "err", m: j.error });
    else if (j.queued) setMsg({ t: "info", m: `${money(amount)} ${s.config.options[option]?.label ?? option} round #${j.roundNo} ke liye queue ho gaya — current round mein settle nahi hoga.` });
    else setMsg(null);
    refresh();
  }, [busy, chip, offset, post, refresh, table]);
  const cancel = async () => {
    const j = await post("DELETE");
    if (j.error) setMsg({ t: "err", m: j.error });
    else setMsg({ t: "info", m: `Bets cancel — ${money(j.refunded)} wapas.` });
    refresh();
  };
  const cancelQueued = async () => {
    if (busy) return;
    const j = await post("DELETE", undefined, "queued");
    if (j.error) setMsg({ t: "err", m: j.error });
    else setMsg({ t: "info", m: `Queued bets cancel — ${money(j.refunded)} wapas.` });
    refresh();
  };
  const rebet = async () => {
    if (!lastBetsRef.current.length || busy) return;
    const current = stRef.current?.round;
    if (!current || current.status !== "betting" || Date.now() + offset >= current.bettingEndsAt) {
      setMsg({ t: "err", m: "Betting is closed. Wait for the next round to begin." });
      return;
    }
    if (lastBetsRef.current.some((b) => b.amount < 10)) {
      setMsg({ t: "err", m: "Minimum bet is Rs. 10. Please place at least 10." });
      return;
    }
    for (const b of lastBetsRef.current) {
      const reply = await post("POST", { table, option: b.option, amount: b.amount, targetRound: current.roundNo });
      if (reply.error) {
        setMsg({ t: "err", m: reply.error });
        break;
      }
    }
    refresh();
  };

  const sNow = now + offset;
  const round = st?.round;
  const inBetting = !!round && round.status === "betting" && sNow < round.bettingEndsAt;
  const remaining = round ? Math.max(0, (round.bettingEndsAt - sNow) / 1000) : 0;
  const revealT = round ? sNow - round.bettingEndsAt : -1; // ms since reveal started
  const result = round?.result ?? null;
  const revealDone = (() => {
    if (!result) return false;
    if (result.kind === "dragon-tiger") return revealT >= 2700;
    return revealT >= 1400 + (result.andar.length + result.bahar.length) * result.dealMs + 300;
  })();

  // result toast after animation completes
  useEffect(() => {
    if (!st || !round || !result || !revealDone || shownRef.current === round.roundNo) return;
    shownRef.current = round.roundNo;
    if (st.myTotal > 0) {
      const win = st.myExpected > 0;
      if (st.poolPending) playGameSound("click");
      else if (win) { playGameSound("coin"); speakGameVoice("cardWin"); } else { playGameSound("crash"); }
      window.dispatchEvent(new CustomEvent("wx:game-result", { detail: { game: table === "dragon-tiger" ? "Dragon Tiger" : "Andar Bahar", bet: st.myTotal, win: st.myExpected, won: win, poolPending: st.poolPending, poolClaim: st.poolClaim } }));
      setToast({ roundNo: round.roundNo, text: st.poolPending ? ` ${money(st.poolClaim ?? 0)} — daily payout` : win ? `Aap jeete ${money(st.myExpected)}` : "No win", win: !st.poolPending && win });
    }
    const id = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(id);
  }, [st, round, result, revealDone]);

  if (!st || !round) return <div className="py-24 text-center text-slate-400">Loading table…</div>;

  const opts = Object.keys(st.config.options);
  const winner = result && revealDone ? result.winner : null;
  const hasRoundBet = st.myTotal > 0;
  const myBy = (o: string) => st.myBets.filter((b) => b.option === o).reduce((s, b) => s + b.amount, 0);
  const queued = st.queued && st.queued.total > 0 ? st.queued : null;
  const queuedBy = (o: string) => (queued ? queued.bets.filter((b) => b.option === o).reduce((s, b) => s + b.amount, 0) : 0);
  const histTotal = st.history.length || 1;

  return (
    <div className="h-full w-full flex flex-col overflow-y-auto overflow-x-hidden rounded-xl sm:rounded-2xl border border-[#3a2470] bg-[#0d0718] select-none shadow-2xl">
      {/* header / top bar */}
      <div className="shrink-0 flex items-center justify-between bg-[#1b1038] px-3 py-1.5 border-b border-[#3a2470]">
        <div className="flex items-center gap-2 sm:gap-3">
          {backHref && (
            <Link href={backHref} className="flex h-7 w-7 items-center justify-center rounded-full bg-[#dc2626] hover:bg-[#b91c1c] active:bg-[#991b1b] border border-[#ef4444] text-xs font-black text-white shadow transition-colors" title="Back / Exit">
              ←
            </Link>
          )}
          <div className="rounded bg-gradient-to-br from-[#ffd45a] to-[#ff8a00] px-1.5 py-0.5 text-[10px] font-black text-slate-950">WG CARDS</div>
          <div>
            <span className="text-xs sm:text-sm font-bold text-white">{st.config.name}</span>
            <span className="ml-1.5 text-[10px] text-[#b8a7e6]">#{round.roundNo}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* table tabs */}
          <div className="flex items-center gap-1 rounded-lg bg-[#0b0716] p-0.5">
            {(["dragon-tiger", "andar-bahar"] as Table[]).map((t) => (
              <Link key={t} href={`/player/games/${t}`} className={`rounded px-2.5 py-1 text-[10px] sm:text-xs font-black transition-colors ${t === table ? "bg-[#7c3aed] text-white shadow" : "bg-[#1e1b4b] text-slate-300 hover:text-white hover:bg-[#312e81]"}`}>
                {t === "dragon-tiger" ? "Dragon Tiger" : "Andar Bahar"}
              </Link>
            ))}
          </div>
          <div className="rounded-lg bg-[#0b0716] px-2.5 py-1 text-xs font-black text-[#ffb800]">{money(st.balance)}</div>
        </div>
      </div>

      <div className="flex-1 min-h-fit flex flex-col lg:grid lg:grid-cols-12 gap-2 p-2 sm:p-2.5">
        {/* left: felt table */}
        <div className="lg:col-span-7 xl:col-span-8 shrink-0 flex flex-col justify-between min-h-fit relative rounded-xl sm:rounded-2xl border-[3px] sm:border-[4px] shadow-2xl border-[#7a5a1e] bg-[#120809]">
          {table === "dragon-tiger" && (
            <>
              <div className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-[url('/games/07_Dragon_Tiger_1024x700.jpg')] bg-cover bg-[center_30%] opacity-90" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[url('/games/07_Dragon_Tiger_1024x700.jpg')] bg-cover bg-[center_30%] opacity-90" />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(60,8,12,.55)_0%,rgba(20,6,8,.85)_50%,rgba(60,30,5,.55)_100%)]" />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.55)_0%,rgba(0,0,0,0)_35%,rgba(0,0,0,0)_60%,rgba(0,0,0,.6)_100%)]" />
            </>
          )}
          <div className="pointer-events-none absolute inset-1.5 rounded-[18px] border border-yellow-200/20" />

          {/* history road */}
          <div className="shrink-0 flex items-center gap-1 overflow-x-auto px-3 pt-2">
            <span className="mr-1 shrink-0 text-[9px] font-bold uppercase tracking-wider text-white/60">Last {st.history.length}</span>
            {st.history.map((h) => (
              <span key={h.roundNo} title={`#${h.roundNo}`} className={`flex h-4 w-4 sm:h-5 sm:w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-black text-white ${ZONE[h.winner]?.bead ?? "bg-slate-500"}`}>
                {h.winner === "tie" ? "=" : ZONE[h.winner]?.short}
              </span>
            ))}
            {st.history.length === 0 && <span className="text-[9px] text-white/50">Pehla round…</span>}
          </div>

          {/* timer / status */}
          <div className="shrink-0 flex justify-center py-1">
            {inBetting ? (
              <div className="relative flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center">
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="rgba(0,0,0,.35)" stroke="rgba(255,255,255,.15)" strokeWidth="5" />
                  <circle cx="32" cy="32" r="28" fill="none" stroke={remaining < 5 ? "#ef4444" : "#ffb800"} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 28}`} strokeDashoffset={`${2 * Math.PI * 28 * (1 - remaining / (st.config.betMs / 1000))}`} />
                </svg>
                <div className="text-center"><div className="text-sm sm:text-base font-black leading-none text-white">{Math.ceil(remaining)}</div><div className="text-[7px] uppercase text-white/70">bet</div></div>
              </div>
            ) : (
              <div className="rounded-full bg-black px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                {winner && hasRoundBet ? "Result" : winner ? "Round complete" : "Dealing…"}
              </div>
            )}
          </div>

          {/* cards area */}
          <div className="flex-1 shrink-0 flex items-center justify-center px-2 py-3 sm:px-4">
            {table === "dragon-tiger" ? (
              <DragonTigerStage result={result as DTResult | null} revealT={revealT} winner={winner} />
            ) : (
              <AndarBaharStage key={round.roundNo} result={result as ABResult | null} revealT={revealT} winner={winner} />
            )}
          </div>

          {/* winner banner */}
          {winner && hasRoundBet && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center z-20">
              <div className={`animate-[pop_.4s_ease-out] rounded-xl px-6 py-2 text-lg sm:text-xl font-black uppercase tracking-wider text-white shadow-2xl ${ZONE[winner].bg}`}>
                {winner === "tie" ? "TIE!" : `${st.config.options[winner].label} wins!`}
              </div>
            </div>
          )}
          {toast && (
            <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-3 z-20">
              <div className={`rounded-lg px-3 py-1 text-xs font-black shadow-xl ${toast.win ? "bg-[#eab308] text-slate-950" : "bg-[#0f172a] text-white border border-slate-700"}`}>{toast.text}</div>
            </div>
          )}
          <style>{`@keyframes pop{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}`}</style>
        </div>

        {/* right: betting controls */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col justify-between min-h-0 overflow-y-auto gap-1.5 sm:gap-2">
          <LiveBetActivity
            personal={st.tableMode === "personal"}
            roundNo={round.roundNo}
            bets={st.liveBets ?? []}
            queuedBets={st.liveQueuedBets ?? []}
            labels={Object.fromEntries(opts.map((option) => [option, st.config.options[option].label]))}
          />
          {/* bet zones */}
          <div className={`grid gap-1.5 ${opts.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {opts.map((o) => {
              const z = ZONE[o]; const cfg = st.config.options[o]; const tot = st.totals[o]; const mine = myBy(o); const next = queuedBy(o);
              const isWin = hasRoundBet && winner === o;
              return (
                <button
                  key={o}
                  disabled={busy || !inBetting}
                  onClick={() => handleBet(o)}
                  title={inBetting ? undefined : "Betting is closed. Wait for the next round to begin."}
                  className={`relative overflow-hidden rounded-xl p-2 text-left text-white shadow-lg transition-transform duration-100 ${z.bg} ${inBetting ? "hover:brightness-110 active:scale-[.98] cursor-pointer" : "opacity-90"} ${isWin ? `ring-4 ${z.ring}` : ""} ${hasRoundBet && winner && !isWin ? "opacity-50" : ""} disabled:cursor-not-allowed`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs sm:text-sm font-black uppercase truncate text-white">{cfg.label}</span>
                    <span className="rounded bg-black px-1.5 py-0.5 text-[9px] font-black text-white">{cfg.pays}</span>
                  </div>
                  <div className="mt-1 text-[9px] font-bold text-white/90">Pool {money(tot?.total ?? 0)}</div>
                  <div className="mt-1 flex h-5 items-center gap-1">
                    {mine > 0 ? (
                      <>
                        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-black bg-[#fbbf24] text-[8px] font-black text-slate-950">{mine >= 1000 ? `${Math.floor(mine / 1000)}K` : mine}</span>
                        <span className="text-[10px] font-black text-white">{money(mine)}</span>
                      </>
                    ) : next > 0 ? (
                      <span className="rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-black text-white">Next round: {money(next)}</span>
                    ) : (
                      <span className="text-[9px] font-bold text-white/80">{inBetting ? `Tap: +${chip}` : `Queue next: +${chip}`}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* chips + actions */}
          <div className="rounded-xl border border-[#3a2470] bg-[#1b1038] p-2 sm:p-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {CHIPS.map((c) => (
                <button key={c} onClick={() => {
                  setChip(c);
                  if (table === "dragon-tiger") {
                    setCustomAmount(c);
                    setDragonAmountText(String(c));
                  }
                }} className={`flex h-9 min-w-9 px-1.5 items-center justify-center rounded-full text-[10px] font-black transition-all ${chip === c ? "scale-105 border-2 border-white bg-[#eab308] text-slate-950 shadow-md" : "border border-slate-600 bg-[#1e293b] text-white hover:bg-[#334155]"}`}>
                  {c}
                </button>
              ))}
              <div className="flex items-center gap-1 rounded-full border border-slate-600 bg-[#0f172a] px-2 py-1">
                <input
                  type="number"
                  min={10}
                  max={Math.max(10, Math.floor(st.balance))}
                  value={table === "dragon-tiger" ? dragonAmountText : customAmount}
                  onChange={(e) => {
                    setCustomAmount(Number(e.target.value) || 0);
                    if (table === "dragon-tiger") {
                      setDragonAmountText(e.target.value.replace(/^0+(?=\d)/, ""));
                    }
                  }}
                  onFocus={(e) => {
                    if (table === "dragon-tiger") e.currentTarget.select();
                  }}
                  onBlur={() => {
                    if (customAmount < 10) setCustomAmount(10);
                    if (table === "dragon-tiger") setDragonAmountText(String(Math.max(10, customAmount)));
                  }}
                  className="w-12 bg-transparent text-center text-[10px] font-black text-white outline-none"
                />
                <button
                  onClick={() => {
                    if (customAmount < 10) {
                      setMsg({ t: "err", m: "Minimum bet is Rs. 10. Please enter at least 10." });
                      return;
                    }
                    setChip(customAmount);
                  }}
                  className={`rounded px-2 py-0.5 text-[9px] font-black transition-colors ${chip === customAmount ? "bg-[#eab308] text-slate-950" : "bg-[#2563eb] hover:bg-[#1d4ed8] text-white"}`}
                >
                  Set
                </button>
              </div>
              <div className="ml-auto flex gap-1">
                {table !== "dragon-tiger" && <button disabled={!inBetting || busy || !lastBetsRef.current.length || st.myTotal > 0} onClick={rebet} className="rounded-lg bg-[#16a34a] hover:bg-[#15803d] active:bg-[#14532d] border border-[#22c55e] px-3 py-1.5 text-[10px] font-black text-white shadow hover:scale-105 active:scale-95 transition-all disabled:opacity-40 cursor-pointer">Rebet</button>}
                <button disabled={!inBetting || busy || st.myTotal === 0} onClick={cancel} className="rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] active:bg-[#991b1b] border border-[#ef4444] px-3 py-1.5 text-[10px] font-black text-white shadow hover:scale-105 active:scale-95 transition-all disabled:opacity-40 cursor-pointer">Cancel</button>
              </div>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-[#b8a7e6]">
              <span>Round bet: <b className="text-white">{money(st.myTotal)}</b>{result && st.myTotal > 0 && revealDone ? <> → <b className={st.myExpected > 0 ? "text-emerald-400" : "text-red-400"}>{money(st.myExpected)}</b></> : null}</span>
              <span>Min {st.config.min} · Max {Math.floor(st.balance).toLocaleString()}</span>
            </div>
            {queued && (
              <div role="status" className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-[#38bdf8] bg-[#0c4a6e] px-2.5 py-1 text-[10px] text-[#e0f2fe]">
                <span>
                  Queued for round #{queued.roundNo}: <b className="text-white">{money(queued.total)}</b>{" "}
                  <span className="text-[#bae6fd]">({opts.filter((o) => queuedBy(o) > 0).map((o) => `${st.config.options[o].label} ${queuedBy(o)}`).join(", ")})</span>
                </span>
                <button disabled={busy} onClick={cancelQueued} className="shrink-0 rounded bg-[#dc2626] hover:bg-[#b91c1c] border border-[#ef4444] px-2 py-0.5 text-[10px] font-black text-white disabled:opacity-40 cursor-pointer">Cancel queued</button>
              </div>
            )}
            {msg && <p className={`mt-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold ${msg.t === "err" ? "bg-[#dc2626] text-white border border-[#ef4444]" : "bg-[#0284c7] text-white border border-[#38bdf8]"}`}>{msg.m}</p>}
          </div>

          {/* stats */}
          <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
            {opts.map((o) => (
              <div key={o} className="rounded-lg bg-[#1b1038] px-1.5 py-1">
                <div className={`font-black uppercase text-[9px] ${ZONE[o].text}`}>{st.config.options[o].label}</div>
                <div className="text-white">{Math.round(((st.stats[o] ?? 0) / histTotal) * 100)}% <span className="text-[#6f5fa3]">({st.stats[o] ?? 0})</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- stages ---------------- */
function DragonTigerStage({ result, revealT, winner }: { result: DTResult | null; revealT: number; winner: string | null }) {
  const dealing = !!result && revealT >= 0;
  const dIn = dealing && revealT >= 100, tIn = dealing && revealT >= 600;
  const dUp = dealing && revealT >= 1300, tUp = dealing && revealT >= 2200;
  const slot = (inn: boolean) => `transition-all duration-500 ${inn ? "translate-y-0 opacity-100" : "-translate-y-10 opacity-0"}`;
  return (
    <div className="relative my-auto flex flex-col justify-center">
      <div className="mx-auto mb-2 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-yellow-200">
        <span className="inline-block h-2.5 w-1.5 rounded-sm bg-blue-600 ring-1 ring-white" />8-deck shoe
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-6">
        <div className="flex flex-col items-center gap-1">
          <span className="rounded-full bg-red-600/80 px-2.5 py-0.5 text-[10px] sm:text-xs font-black uppercase tracking-widest text-white shadow">Dragon</span>
          <div className={`relative h-28 w-20 sm:h-32 sm:w-24 ${slot(dIn)}`}>
            {!dealing && <div className="absolute inset-0 rounded-lg border-2 border-dashed border-white/30" />}
            {dealing && <PlayingCard card={result?.dragon} faceUp={dUp} size="md" glow={winner === "dragon" || winner === "tie"} dim={winner === "tiger"} />}
          </div>
          {dUp && result && <span className="text-[10px] font-bold text-red-200">Value {result.dragon.r}</span>}
        </div>
        <div className="flex flex-col items-center">
          <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full border-2 border-yellow-300 bg-gradient-to-b from-yellow-400 to-amber-600 text-sm sm:text-base font-black text-slate-950 shadow-[0_0_20px_rgba(251,191,36,.6)]">VS</div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="rounded-full bg-amber-500/90 px-2.5 py-0.5 text-[10px] sm:text-xs font-black uppercase tracking-widest text-slate-950 shadow">Tiger</span>
          <div className={`relative h-28 w-20 sm:h-32 sm:w-24 ${slot(tIn)}`}>
            {!dealing && <div className="absolute inset-0 rounded-lg border-2 border-dashed border-white/30" />}
            {dealing && <PlayingCard card={result?.tiger} faceUp={tUp} size="md" glow={winner === "tiger" || winner === "tie"} dim={winner === "dragon"} />}
          </div>
          {tUp && result && <span className="text-[10px] font-bold text-amber-200">Value {result.tiger.r}</span>}
        </div>
      </div>
    </div>
  );
}

function AndarBaharRow({ side, cards, n, dealt, total, winner }: { side: "andar" | "bahar"; cards: Card[]; n: number; dealt: number; total: number; winner: string | null }) {
  return (
    <div className={`rounded-xl border px-2 py-1.5 ${winner === side ? `${ZONE[side].ring} ring-2 border-transparent bg-white/10` : "border-white/15 bg-black/20"}`}>
      <div className={`mb-1 text-[10px] font-black uppercase tracking-widest ${ZONE[side].text}`}>{side} <span className="text-white/50">({n})</span></div>
      <div className="flex min-h-[5.2rem] items-center overflow-x-auto py-1">
        {cards.slice(0, n).map((c, i) => {
          const isLast = i === n - 1 && total === dealt && winner === side;
          return <div key={i} className={`${styles.dealtCard} ${i === 0 ? "" : "-ml-8"}`}><PlayingCard card={c} faceUp size="sm" glow={isLast} /></div>;
        })}
        {n === 0 && <span className="text-[11px] text-white/40">—</span>}
      </div>
    </div>
  );
}

function AndarBaharStage({ result, revealT, winner }: { result: ABResult | null; revealT: number; winner: string | null }) {
  const jokerUp = !!result && revealT >= 300;
  const dealt = result ? Math.max(0, Math.min(result.andar.length + result.bahar.length, Math.floor((revealT - 1400) / result.dealMs) + 1)) : 0;
  const andarN = Math.ceil(dealt / 2), baharN = Math.floor(dealt / 2);
  const total = result ? result.andar.length + result.bahar.length : 0;
  return (
    <div className="w-full min-w-0 space-y-2">
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] font-black uppercase tracking-widest text-yellow-200">Joker</span>
        <PlayingCard card={result?.joker} faceUp={jokerUp} size="md" glow={!!winner} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <AndarBaharRow side="andar" cards={result?.andar ?? []} n={result ? andarN : 0} dealt={dealt} total={total} winner={winner} />
        <AndarBaharRow side="bahar" cards={result?.bahar ?? []} n={result ? baharN : 0} dealt={dealt} total={total} winner={winner} />
      </div>
    </div>
  );
}
