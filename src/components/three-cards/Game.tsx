"use client";
import { gameSfx } from "@/lib/gameSfx";
import { isThreeCardsBrowserDeal } from "@/lib/browserCardGuards";
import { GameOverOverlay } from "@/components/GameOverOverlay";

import { useEffect, useRef, useState } from "react";
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import { useIdleCardRound } from "../teen-patti/useIdleCardRound";

type Phase = "idle" | "shuffling" | "picking" | "reveal";
type Card = { rank: string; suit: string; color: string };

const MULTIPLIER = 2.8;
const CHIPS = BET_PRESETS;

const WIN_CARD: Card = { rank: "A", suit: "♠", color: "text-black" };
const LOSE_CARDS: Card[] = [
  { rank: "7", suit: "♥", color: "text-red-600" },
  { rank: "4", suit: "♦", color: "text-red-600" },
  { rank: "9", suit: "♣", color: "text-black" },
  { rank: "2", suit: "♥", color: "text-red-600" },
  { rank: "5", suit: "♣", color: "text-black" },
];

function randLose(): Card {
  return LOSE_CARDS[Math.floor(Math.random() * LOSE_CARDS.length)];
}

export default function Home() {
  const [balance, setBalance] = useGameBalance("three-cards", 10000);
  const pool = usePoolLifecycle("three-cards");
  const [savedBet, setSavedBet] = usePoolRoundState("three-cards", "acceptedBet", 0);
  const acceptedBet = useRef(savedBet);
  const [bet, setBet] = useState(100);
  const [resumePhase] = usePoolRoundState<Phase>("three-cards", "phase", "idle");
  const [phase, setPhase] = useState<Phase>(resumePhase);
  const [wagerCards, setCards] = useState<Card[]>([WIN_CARD, randLose(), randLose()]);
  const [wagerFaceUp, setFaceUp] = useState(true);
  const [picked, setPicked] = useState<number | null>(null);
  const [message, setMessage] = useState("Place your bet and press PLAY");
  const [lastWin, setLastWin] = useState<number | null>(null);
  const [endDismissed, setEndDismissed] = useState(false);
  const [history, setHistory] = useState<{ win: boolean; amt: number }[]>([]);
  const [wagerOffsets, setOffsets] = useState([0, 0, 0]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pickBusy = useRef(false);
  const idleRound = useIdleCardRound({
    idle: phase === "idle", finished: phase === "reveal", busy: pool.busy,
    frames: () => {
      const cards = [WIN_CARD, randLose(), randLose()].sort(() => Math.random() - 0.5);
      return [
        { at: 0, view: { cards, faceUp: true, offsets: [0, 0, 0] } },
        ...Array.from({ length: 11 }, (_, count) => ({
          at: 1000 + count * 220,
          view: { cards, faceUp: false, offsets: [0, 1, 2].sort(() => Math.random() - 0.5).map((position, index) => (position - index) * 100) },
        })),
        { at: 3420, view: { cards, faceUp: true, offsets: [0, 0, 0] } },
      ];
    },
    next: () => {
      setSavedBet(0);
      acceptedBet.current = 0;
      setPicked(null);
      setLastWin(null);
      setOffsets([0, 0, 0]);
      setMessage("Place your bet and press PLAY");
      setPhase("idle");
    },
  });
  const cards = idleRound.preview?.cards ?? wagerCards;
  const faceUp = idleRound.preview?.faceUp ?? wagerFaceUp;
  const offsets = idleRound.preview?.offsets ?? wagerOffsets;

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const play = async () => {
    if (phase !== "idle") return;
    gameSfx.deal();
    if (bet <= 0 || bet > balance) {
      setMessage("Insufficient balance!");
      return;
    }
    if (!idleRound.claim()) return;
    pool.checkpoint({ acceptedBet: bet, phase: "picking" });
    if (!await pool.start(bet, () => setBalance((b) => b - bet))) { idleRound.release(); return; }
    setSavedBet(bet);
    acceptedBet.current = bet;
    setLastWin(null);
    setEndDismissed(false);
    setPicked(null);
    setCards([WIN_CARD, randLose(), randLose()]);
    setFaceUp(true);
    setMessage("Watch the Ace of Spades...");
    setPhase("shuffling");
    setTimeout(() => {
      setFaceUp(false);
      let n = 0;
      timer.current = setInterval(() => {
        n++;
        const pos = [0, 1, 2].sort(() => Math.random() - 0.5);
        setOffsets(pos.map((p, i) => (p - i) * 100));
        if (n > 10) {
          if (timer.current) clearInterval(timer.current);
          setOffsets([0, 0, 0]);
          setPhase("picking");
          setMessage("Find the Ace! Pick a card");
        }
      }, 220);
    }, 1000);
  };

  const pick = async (i: number) => {
    if (phase !== "picking" || pool.busy || pickBusy.current) return;
    pickBusy.current = true;
    gameSfx.flip();
    const confirmed = await pool.resolveServer({ picked: i });
    pickBusy.current = false;
    if (!isThreeCardsBrowserDeal(confirmed)) {
      setMessage("Result confirmation failed. Retry the same card or reopen to recover.");
      return;
    }
    const { win, payout } = confirmed;
    setCards(confirmed.cards);
    setPicked(confirmed.picked);
    setFaceUp(true);
    setPhase("reveal");
    setEndDismissed(false);
    if (win) {
      gameSfx.win();
      const amt = payout;
      setLastWin(amt);
      setMessage(pool.enabled ? `CLAIM Rs. ${amt} — daily settlement pending` : `YOU WIN Rs. ${amt}!`);
    } else {
      gameSfx.lose();
      setMessage(pool.enabled ? "Daily payout pending — provisional claim Rs. 0" : "No win");
    }
    setHistory((h) => [{ win, amt: win ? Math.round(bet * MULTIPLIER) : bet }, ...h].slice(0, 12));
  };

  const busy = phase === "shuffling" || phase === "picking" || idleRound.watching;

  return (
    <main className="h-full w-full overflow-hidden bg-gradient-to-b from-[#0b1a2e] via-[#10233f] to-[#050c18] text-white flex flex-col justify-between items-center px-1 sm:px-2 md:px-3 py-1 select-none">
      {idleRound.countdown !== null && <p className="shrink-0 text-center text-xs text-amber-200" role="status">Next round in {idleRound.countdown}s</p>}
      {/* Header */}
      <header className="w-full max-w-4xl flex shrink-0 items-center justify-between px-2 sm:px-4 py-1 sm:py-2 border-b border-yellow-500/30">
        <h1 className="text-base sm:text-2xl font-black tracking-wider bg-gradient-to-r from-yellow-300 via-yellow-500 to-orange-500 bg-clip-text text-transparent">
          WIN THREE CARDS
        </h1>
        <div className="flex items-center gap-1.5 bg-black/40 border border-yellow-500/50 rounded-full px-3 py-1 shadow-sm">
          <span className="text-yellow-400 text-sm">💰</span>
          <span className="font-bold text-sm sm:text-base">Rs. {balance.toLocaleString()}</span>
        </div>
      </header>

      {/* History */}
      <div className="w-full max-w-4xl flex shrink-0 gap-1.5 px-2 py-1 overflow-x-auto">
        {history.length === 0 && <span className="text-[10px] text-white/40">No rounds yet</span>}
        {history.map((h, i) => (
          <span key={i} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${h.win ? "bg-emerald-600 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-rose-700 shadow-[0_0_8px_rgba(225,29,72,0.4)]"}`}>
            {h.win ? `+${h.amt}` : "No win"}
          </span>
        ))}
      </div>

      {/* Table */}
      <section className="relative flex-1 min-h-0 w-full max-w-3xl my-1 flex flex-col justify-between items-center rounded-2xl sm:rounded-[40px] bg-[radial-gradient(ellipse_at_center,#1f8a4c_0%,#0f5b30_60%,#083d20_100%)] border-4 sm:border-8 border-[#6b3a12] shadow-[0_0_40px_rgba(0,0,0,0.8),inset_0_0_30px_rgba(0,0,0,0.6)] py-2 sm:py-4 px-2 sm:px-4 overflow-hidden">
        <div className="absolute inset-1.5 sm:inset-3 rounded-xl sm:rounded-[36px] border border-yellow-400/30 pointer-events-none" />
        <p className="text-center text-yellow-300/80 text-[10px] sm:text-xs tracking-[0.3em] shrink-0">PAYS {MULTIPLIER}x</p>
        <p className={`text-center font-extrabold text-sm sm:text-xl my-1 shrink-0 ${lastWin ? "text-yellow-300 animate-pulse" : phase === "reveal" ? "text-rose-300" : "text-white"}`}>
          {message}
        </p>
        <div className="flex justify-center items-center gap-2 sm:gap-6 md:gap-10 my-auto">
          {cards.map((c, i) => (
            <button
              key={i}
              onClick={() => pick(i)}
              disabled={phase !== "picking"}
              style={{ transform: `translateX(${offsets[i]}%)`, perspective: 800 }}
              className={`relative w-20 h-28 sm:w-28 sm:h-40 md:w-32 md:h-44 transition-transform duration-200 ${phase === "picking" ? "cursor-pointer hover:-translate-y-2" : ""} ${picked === i ? "ring-4 ring-yellow-400 rounded-xl" : ""}`}
            >
              <div
                className="absolute inset-0 transition-transform duration-500 [transform-style:preserve-3d]"
                style={{ transform: faceUp ? "rotateY(0deg)" : "rotateY(180deg)" }}
              >
                {/* front */}
                <div className="absolute inset-0 bg-white rounded-xl shadow-xl [backface-visibility:hidden] flex flex-col justify-between p-1.5 sm:p-2 border border-slate-300">
                  <span className={`text-left text-sm sm:text-xl font-bold leading-none ${c.color}`}>{c.rank}<br />{c.suit}</span>
                  <span className={`text-3xl sm:text-5xl md:text-6xl text-center ${c.color}`}>{c.suit}</span>
                  <span className={`text-right text-sm sm:text-xl font-bold leading-none rotate-180 ${c.color}`}>{c.rank}<br />{c.suit}</span>
                </div>
                {/* back */}
                <div className="absolute inset-0 rounded-xl shadow-xl [backface-visibility:hidden] [transform:rotateY(180deg)] bg-gradient-to-br from-red-700 to-red-900 border-2 sm:border-4 border-white flex items-center justify-center">
                  <div className="w-[85%] h-[88%] rounded-lg border-2 border-yellow-400/70 bg-[repeating-linear-gradient(45deg,#7f1d1d_0_6px,#991b1b_6px_12px)] flex items-center justify-center">
                    <span className="text-yellow-300 text-2xl sm:text-3xl">♠</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
        <div className="shrink-0 h-1 sm:h-2" />
      </section>

      {/* Controls */}
      <section className="w-full max-w-3xl shrink-0 px-2 py-1 sm:py-2 flex flex-col items-center gap-1.5 sm:gap-2">
        <div className="flex gap-2 flex-wrap justify-center">
          {CHIPS.map((v) => (
            <button
              key={v}
              disabled={busy}
              onClick={() => setBet(v)}
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full font-black text-xs sm:text-sm border-2 sm:border-4 border-dashed shadow-md transition active:scale-95 ${bet === v ? "scale-105 ring-2 ring-yellow-300 shadow-[0_0_12px_rgba(253,224,71,0.6)]" : ""} ${v === 50 ? "bg-emerald-600 border-emerald-200" : v === 100 ? "bg-rose-600 border-rose-200" : v === 200 ? "bg-blue-600 border-blue-200" : v === 500 ? "bg-purple-700 border-purple-200" : "bg-black border-yellow-400"
                } disabled:opacity-50`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button disabled={busy} onClick={() => setBet((b) => Math.max(10, Math.floor(b / 2)))} className="px-2.5 py-1 bg-white/10 rounded-lg text-xs font-bold hover:bg-white/20 active:scale-95 disabled:opacity-50">½</button>
          <input
            type="number"
            value={bet}
            disabled={busy}
            onChange={(e) => setBet(Math.max(0, Math.floor(Number(e.target.value))))}
            className="w-24 sm:w-28 text-center bg-black/50 border border-yellow-500/50 rounded-lg py-1 font-bold text-sm text-yellow-300 outline-none"
          />
          <button disabled={busy} onClick={() => setBet((b) => Math.min(balance, b * 2))} className="px-2.5 py-1 bg-white/10 rounded-lg text-xs font-bold hover:bg-white/20 active:scale-95 disabled:opacity-50">2x</button>
        </div>
        <button
          onClick={play}
          disabled={busy}
          className="w-56 sm:w-64 py-2 sm:py-2.5 rounded-full text-base sm:text-lg font-black tracking-widest bg-gradient-to-r from-amber-400 via-yellow-500 to-orange-500 text-slate-950 border border-yellow-200/60 shadow-[0_0_20px_rgba(245,158,11,0.6)] active:scale-95 disabled:opacity-50 transition hover:brightness-110"
        >
          {phase === "reveal" ? "PLAY AGAIN" : "PLAY"}
        </button>
      </section>
      <GameOverOverlay open={phase === "reveal" && !endDismissed} winAmount={lastWin ?? 0} result={message} onPlayAgain={play} onClose={() => setEndDismissed(true)} />
    </main>
  );
}
