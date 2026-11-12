"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { GameOverOverlay } from "@/components/GameOverOverlay";
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import { cardMove, restoreCardRound } from "@/lib/interactiveCardClient";
import { useIdleCardRound } from "../teen-patti/useIdleCardRound";
import {
  ArrowDown,
  ArrowDownRight,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  ChevronRight,
  Coins,
  Flame,
  History,
  Info,
  ShieldCheck,
  Volume2,
  VolumeX,
  Wallet,
  X,
  Zap,
  Expand,
  Dices,
} from "lucide-react";

const suits = ["â™ ", "â™¥", "â™£", "â™¦"] as const;
type Suit = (typeof suits)[number];
type CardData = { rank: number; suit: Suit };
type Direction = "higher" | "lower";
type Phase = "ready" | "playing" | "lost" | "cashed";
type Round = {
  id: number;
  amount: number;
  result: "Win" | "Loss";
  multiplier: number;
  time: string;
};

const ranks = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const initialCard: CardData = { rank: 8, suit: "â™¥" };
type ServerCard = { rank: number; suit: number };
type HiloView = { card: ServerCard; previous: ServerCard | null; streak: number; trail: ServerCard[]; payout?: number };
const fromServer = (card: ServerCard): CardData => ({ rank: card.rank, suit: suits[card.suit] ?? suits[0] });

function PlayingCard({
  card,
  back = false,
  small = false,
  faded = false,
}: {
  card?: CardData;
  back?: boolean;
  small?: boolean;
  faded?: boolean;
}) {
  if (back || !card) {
    return (
      <div
        className={`relative rounded-xl overflow-hidden shadow-2xl transition-all duration-300 ${small ? "w-12 h-16" : "w-28 h-40 md:w-32 md:h-44"
          } ${faded ? "opacity-40" : "opacity-100"} bg-gradient-to-br from-[#7e22ce] via-[#581c87] to-[#3b0764] border-2 border-[#d8b4fe] p-1.5 flex items-center justify-center`}
      >
        <div className="w-full h-full rounded-lg border border-[#c084fc]/50 flex flex-col items-center justify-center bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(255,255,255,0.08)_6px,rgba(255,255,255,0.08)_12px)]">
          <span className="text-xs text-[#e9d5ff]">âœ¦</span>
          <span className={`font-black italic text-[#b9f757] drop-shadow-md ${small ? "text-base" : "text-3xl"}`}>M</span>
          <span className="text-xs text-[#e9d5ff]">âœ¦</span>
        </div>
      </div>
    );
  }

  const isRed = card.suit === "â™¥" || card.suit === "â™¦";
  return (
    <div
      className={`relative rounded-xl overflow-hidden shadow-2xl transition-all duration-300 select-none ${small ? "w-12 h-16 p-1" : "w-28 h-40 md:w-32 md:h-44 p-2.5"
        } ${faded ? "opacity-40" : "opacity-100"} bg-gradient-to-br from-white to-[#f1f5f9] border-2 border-white text-slate-900 flex flex-col justify-between`}
    >
      {/* Top Left Corner */}
      <div className={`flex flex-col items-center leading-none ${isRed ? "text-rose-600" : "text-slate-900"}`}>
        <span className={`font-bold font-serif ${small ? "text-xs" : "text-lg md:text-xl"}`}>
          {ranks[card.rank]}
        </span>
        <span className={`${small ? "text-[10px]" : "text-sm"}`}>{card.suit}</span>
      </div>

      {/* Center Big Suit */}
      <div
        className={`absolute inset-0 flex items-center justify-center pointer-events-none select-none ${isRed ? "text-rose-600/90" : "text-slate-900/90"
          } ${small ? "text-2xl" : "text-5xl md:text-6xl"}`}
      >
        {card.suit}
      </div>

      {/* Bottom Right Corner (inverted) */}
      <div
        className={`flex flex-col items-center leading-none self-end rotate-180 ${isRed ? "text-rose-600" : "text-slate-900"
          }`}
      >
        <span className={`font-bold font-serif ${small ? "text-xs" : "text-lg md:text-xl"}`}>
          {ranks[card.rank]}
        </span>
        <span className={`${small ? "text-[10px]" : "text-sm"}`}>{card.suit}</span>
      </div>
    </div>
  );
}

export default function MonsterHiloGame() {
  const [balance] = useGameBalance("monster-hilo", 10000);
  const pool = usePoolLifecycle("monster-hilo");
  const [bet, setBet] = usePoolRoundState("monster-hilo", "bet", "100");
  const [phase, setPhase] = usePoolRoundState<Phase>("monster-hilo", "phase", "ready");
  const [wagerCard, setCard] = usePoolRoundState<CardData>("monster-hilo", "card", initialCard);
  const [wagerPrevious, setPrevious] = useState<CardData | null>(null);
  const [streak, setStreak] = usePoolRoundState("monster-hilo", "streak", 0);
  const [history, setHistory] = useState<Round[]>([]);
  const [wagerCardTrail, setCardTrail] = usePoolRoundState<CardData[]>("monster-hilo", "cardTrail", []);
  const [lastResult, setLastResult] = useState<"win" | "loss" | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [sound, setSound] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [showOver, setShowOver] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const moveBusy = useRef(false);
  const idleRound = useIdleCardRound({
    idle: phase === "ready", finished: phase === "lost" || phase === "cashed", busy: pool.busy || revealing,
    frames: () => {
      const first: CardData = { rank: 2 + Math.floor(Math.random() * 13), suit: suits[Math.floor(Math.random() * 4)] };
      const next: CardData = { rank: 2 + Math.floor(Math.random() * 13), suit: suits[Math.floor(Math.random() * 4)] };
      return [
        { at: 0, view: { card: first, previous: first, trail: [first], revealed: false } },
        { at: 1400, view: { card: next, previous: first, trail: [first, next], revealed: true } },
      ];
    },
    next: () => {
      setShowOver(false);
      setPrevious(null);
      setCardTrail([]);
      setStreak(0);
      setLastResult(null);
      setPhase("ready");
    },
  });
  const card = idleRound.preview?.card ?? wagerCard;
  const previous = idleRound.preview?.previous ?? wagerPrevious;
  const cardTrail = idleRound.preview?.trail ?? wagerCardTrail;

  const betAmount = Math.max(10, Number(bet) || 10);
  const multiplier = Math.pow(1.85, streak);
  const cashoutValue = Math.round(betAmount * multiplier);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("wx_monster_hilo");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.history)) {
          setHistory(parsed.history.slice(0, 10));
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("wx_monster_hilo", JSON.stringify({ balance, history }));
    } catch {
      /* ignore */
    }
  }, [balance, history]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    let disposed = false;
    void restoreCardRound<HiloView>("monster-hilo", pool).then(async restored => {
      if (disposed || !restored) return;
      const round = restored.phase === "accepted" ? await cardMove<HiloView>(pool, "deal") : restored;
      if (disposed || !round || round.phase !== "playing") return;
      setCard(fromServer(round.view.card));
      setPrevious(round.view.previous ? fromServer(round.view.previous) : null);
      setCardTrail(round.view.trail.map(fromServer));
      setStreak(round.view.streak);
      setPhase("playing");
    });
    return () => { disposed = true; };
    // Restore once on mount; pool methods are stable for this table.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playTone = useCallback(
    (frequency: number, duration = 0.14) => {
      if (!sound) return;
      try {
        if (!audioContext.current) audioContext.current = new AudioContext();
        const ctx = audioContext.current;
        if (ctx.state === "suspended") ctx.resume();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start();
        oscillator.stop(ctx.currentTime + duration);
      } catch {
        /* audio optional */
      }
    },
    [sound]
  );

  const addHistory = (amount: number, result: "Win" | "Loss", multi: number) => {
    setHistory((prev) => [
      {
        id: Date.now(),
        amount,
        result,
        multiplier: multi,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
      ...prev.slice(0, 9),
    ]);
  };

  const changeBet = (val: number) => {
    if (phase !== "ready" || idleRound.watching) return;
    setBet(String(Math.max(10, Math.min(balance, Math.round(val)))));
  };

  const startGame = async () => {
    if (betAmount < 10) {
      setToast("Minimum bet is Rs. 10");
      return;
    }
    if (betAmount > balance) {
      setToast("Insufficient balance.");
      return;
    }
    if (!idleRound.claim()) return;
    if (!await pool.start(betAmount)) { idleRound.release(); return; }
    const dealt = await cardMove<HiloView>(pool, "deal");
    if (!dealt) return;
    const firstCard = fromServer(dealt.view.card);
    setCard(firstCard);
    setPrevious(null);
    setCardTrail([firstCard]);
    setStreak(0);
    setLastResult(null);
    setPhase("playing");
    playTone(400);
    setTimeout(() => playTone(560), 100);
  };

  const guess = async (direction: Direction) => {
    if (phase !== "playing" || revealing || moveBusy.current) return;
    const canWin = direction === "higher" ? card.rank < 14 : card.rank > 2;
    if (!canWin) {
      setToast(`No card can be ${direction} than ${ranks[card.rank]}. Choose the other side!`);
      return;
    }
    setRevealing(true);
    moveBusy.current = true;
    setLastResult(null);

    const reply = await cardMove<HiloView>(pool, "guess", { direction });
    if (!reply) { moveBusy.current = false; setRevealing(false); return; }
    const won = reply.phase === "playing";
    const next = fromServer(reply.view.card);
    const oldCard = card;

    setTimeout(() => {
      setPrevious(oldCard);
      setCard(next);
      setCardTrail((prev) => [...prev, next].slice(-5));
      setLastResult(won ? "win" : "loss");
      setRevealing(false);
      moveBusy.current = false;

      if (won) {
        setStreak((v) => v + 1);
        playTone(680);
        setTimeout(() => playTone(880), 110);
      } else {
        setPhase("lost");
        setShowOver(true);
        addHistory(betAmount, "Loss", 0);
        playTone(220, 0.35);
      }
    }, 450);
  };

  const cashout = async () => {
    if (phase !== "playing" || streak === 0 || revealing || moveBusy.current) return;
    moveBusy.current = true;
    const reply = await cardMove<HiloView>(pool, "cashout");
    moveBusy.current = false;
    if (!reply) return;
    const payout = reply.payout;
    addHistory(payout, "Win", multiplier);
    setPhase("cashed");
    setShowOver(true);
    setLastResult("win");
    playTone(750);
    setTimeout(() => playTone(1050), 120);
  };

  return (
    <div className="w-full h-full max-w-5xl mx-auto flex flex-col overflow-y-auto overflow-x-hidden rounded-2xl bg-gradient-to-b from-[#10131f] via-[#161a29] to-[#0a0d17] border border-[#a855f7]/30 shadow-2xl shadow-[#a855f7]/10 px-2 sm:px-4 py-2 text-white select-none">
      {idleRound.countdown !== null && <p className="shrink-0 text-center text-xs text-amber-200" role="status">Next round in {idleRound.countdown}s</p>}
      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-gradient-to-tr from-[#9333ea] to-[#b9f757] flex items-center justify-center font-black text-lg shadow-lg shadow-[#9333ea]/40">
            ðŸ‘¾
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-base sm:text-xl font-black tracking-wider bg-gradient-to-r from-[#b9f757] via-[#c084fc] to-[#e879f9] bg-clip-text text-transparent">
                MONSTER HILO
              </h1>
              <span className="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-full bg-[#9333ea]/30 text-[#d8b4fe] border border-[#9333ea]/50">
                ORIGINAL
              </span>
            </div>
            <p className="text-[9px] sm:text-[11px] text-slate-400">Guess Higher or Lower Â· Beat the Monster for big multipliers!</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setHelpOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg border border-purple-500/30 bg-purple-950/40 text-purple-200 hover:bg-purple-900/50 transition-colors"
          >
            <BookOpen size={13} className="text-[#c084fc]" /> Rules
          </button>
          <button
            onClick={() => setSound((s) => !s)}
            className="p-1.5 text-xs font-bold rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 transition-colors"
            title={sound ? "Mute" : "Unmute"}
          >
            {sound ? <Volume2 size={15} className="text-[#b9f757]" /> : <VolumeX size={15} className="text-slate-400" />}
          </button>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#090b14] border border-[#a855f7]/30">
            <div className="text-right">
              <div className="text-[8px] uppercase font-bold text-slate-400">Balance</div>
              <div className="text-xs sm:text-sm font-black text-[#b9f757]">
                Rs. {balance.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Game Arena */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mb-2 shrink-0">
        {/* Left Column: Bet Settings & Controls */}
        <div className="lg:col-span-4 flex flex-col justify-between gap-3 rounded-xl bg-[#0b0e1b] border border-[#a855f7]/30 p-2.5 sm:p-3 shrink-0">
          <div>
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 text-xs font-black uppercase tracking-wider text-slate-300">
              <span className="flex items-center gap-1 text-[#c084fc]">
                <Zap size={13} /> Bet Settings
              </span>
              <span className="text-[9px] text-slate-500">Rs.</span>
            </div>

            {/* Bet Input */}
            <div className="mb-2">
              <label className="block text-[10px] font-bold text-slate-400 mb-1">
                Bet Amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#b9f757]">
                  Rs.
                </span>
                <input
                  type="number"
                  min="10"
                  step="10"
                  value={bet}
                  disabled={phase !== "ready" || idleRound.watching}
                  onChange={(e) => { if (phase === "ready" && !idleRound.watching) setBet(e.target.value); }}
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[#13182b] border border-white/10 text-white font-black text-xs sm:text-sm focus:outline-none focus:border-[#b9f757] disabled:opacity-50"
                />
              </div>

              {/* Quick Bet Buttons */}
              <div className="grid grid-cols-5 gap-1.5 mt-1.5">
                {BET_PRESETS.map((p) => (
                  <button
                    key={p}
                    disabled={phase !== "ready" || idleRound.watching}
                    onClick={() => changeBet(p)}
                    className="py-1 rounded-lg bg-[#13182b] hover:bg-[#1b2240] text-slate-200 disabled:opacity-40 text-xs font-black border border-white/15 transition-all active:scale-95"
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                <button
                  disabled={phase !== "ready" || idleRound.watching}
                  onClick={() => changeBet(betAmount / 2)}
                  className="py-1 rounded-lg bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 disabled:opacity-40 text-xs font-black border border-amber-500/40 transition-all active:scale-95"
                >
                  Â½
                </button>
                <button
                  disabled={phase !== "ready" || idleRound.watching}
                  onClick={() => changeBet(betAmount * 2)}
                  className="py-1 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 disabled:opacity-40 text-xs font-black border border-indigo-500/40 transition-all active:scale-95"
                >
                  2Ã—
                </button>
                <button
                  disabled={phase !== "ready" || idleRound.watching}
                  onClick={() => changeBet(balance)}
                  className="py-1 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-slate-950 disabled:opacity-40 text-xs font-black shadow-md shadow-emerald-500/30 transition-all active:scale-95"
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Payout & Multiplier Box */}
            <div className="rounded-xl bg-[#121629] border border-white/10 p-2 sm:p-2.5 mb-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-0.5">
                <span>Potential Payout</span>
                <span className="text-[#b9f757] font-black">
                  {phase === "playing" ? `${multiplier.toFixed(2)}Ã—` : "1.85Ã—"}
                </span>
              </div>
              <div className="text-base sm:text-lg font-black text-white">
                Rs. {phase === "playing" ? cashoutValue.toLocaleString() : Math.round(betAmount * 1.85).toLocaleString()}
              </div>
              <div className="text-[9px] text-slate-500">
                {phase === "playing"
                  ? "Cash out anytime after winning a guess"
                  : "Each correct call increases multiplier by 1.85Ã—"}
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div>
            {phase === "playing" ? (
              <button
                onClick={cashout}
                disabled={streak === 0 || revealing}
                className="w-full py-2.5 sm:py-3 px-3 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-1.5 bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:brightness-110 disabled:opacity-50 text-white shadow-lg shadow-pink-500/30 transition-all cursor-pointer active:scale-95"
              >
                <Wallet size={16} /> Cash Out (Rs. {cashoutValue.toLocaleString()})
              </button>
            ) : (
              <button
                onClick={startGame}
                disabled={idleRound.watching || phase !== "ready"}
                className="w-full py-2.5 sm:py-3 px-3 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-1.5 bg-gradient-to-r from-[#b9f757] via-emerald-400 to-[#10b981] hover:brightness-110 text-slate-950 shadow-lg shadow-[#b9f757]/30 transition-all cursor-pointer active:scale-95"
              >
                <Zap size={16} fill="currentColor" /> {phase === "ready" ? "Place Bet" : "Play Again"}
              </button>
            )}

            <div className="flex items-center justify-center gap-1 text-[9px] text-slate-500 mt-2">
              <ShieldCheck size={12} className="text-[#b9f757]" /> Provably Fair Random Game
            </div>
          </div>
        </div>

        {/* Right Column: Game Stage Arena */}
        <div className="lg:col-span-8 relative rounded-xl bg-[#090c18] border-2 border-[#a855f7]/40 shadow-inner overflow-hidden p-3 sm:p-4 flex flex-col justify-between shrink-0 min-h-[430px]">
          {/* Neon background aura */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-[#9333ea]/20 blur-3xl pointer-events-none" />

          {/* Stage Top Bar */}
          <div className="relative z-10 flex items-center justify-between pb-2 border-b border-white/10 text-xs font-bold shrink-0">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#b9f757] animate-pulse" />
              <span className="text-slate-300 tracking-wider font-black text-[10px] sm:text-[11px]">ROUND IN PROGRESS</span>
            </div>
            <div className="flex items-center gap-1 text-[#fbbf24] font-black text-xs">
              <Flame size={14} fill="currentColor" /> STREAK: {streak}
            </div>
          </div>

          {/* Cards Arena */}
          <div className="relative z-10 my-2 sm:my-3 flex flex-col items-center">
            {/* Monster Mascot Banner */}
            <div className="text-center mb-2">
              <div className="text-[9px] uppercase font-black tracking-widest text-[#c084fc]">
                CAN YOU BEAT THE MONSTER?
              </div>
              <div className="text-2xl sm:text-3xl font-black italic tracking-tight text-white drop-shadow-md">
                HI<span className="text-[#b9f757]">LO</span><i>!</i>
              </div>
            </div>

            {/* Cards Showcase */}
            <div className="flex items-center justify-center gap-3 md:gap-6">
              {/* Current Card */}
              <div className="flex flex-col items-center gap-1">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                  Current
                </span>
                <PlayingCard card={(phase === "lost" || idleRound.watching) && previous ? previous : card} />
              </div>

              {/* Animated Arrow */}
              <div className="flex flex-col items-center justify-center gap-1 text-[#c084fc]">
                <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-[#a855f7]/20 border border-[#a855f7]/40 flex items-center justify-center shadow-lg shadow-[#a855f7]/20">
                  <ArrowRight size={18} className="text-[#b9f757]" />
                </div>
              </div>

              {/* Next Card */}
              <div className="flex flex-col items-center gap-1">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                  Next
                </span>
                <div className={revealing ? "animate-[bounce_0.4s_ease-in-out]" : ""}>
                  <PlayingCard back={phase !== "lost" && !idleRound.preview?.revealed} card={card} />
                </div>
              </div>
            </div>

            {/* Stage Feedback Message */}
            <div className="h-6 flex items-center justify-center text-[11px] font-black tracking-wide mt-2">
              {revealing ? (
                <span className="text-[#b9f757] flex items-center gap-1.5 animate-pulse">
                  Revealing card...
                </span>
              ) : lastResult === "loss" ? (
                <span className="text-rose-400">{""}</span>
              ) : phase === "cashed" ? (
                <span className="text-[#b9f757]">
                  Nice cash out! Collected Rs. {cashoutValue.toLocaleString()}.
                </span>
              ) : lastResult === "win" ? (
                <span className="text-[#b9f757]">Great call! Keep going or Cash Out.</span>
              ) : phase === "playing" ? (
                <span className="text-slate-300">Will the next card be higher or lower?</span>
              ) : (
                <span className="text-slate-500">Place a bet to start the game!</span>
              )}
            </div>

            {/* HIGHER / LOWER Buttons */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 w-full max-w-md mt-1 sm:mt-2">
              <button
                onClick={() => guess("higher")}
                disabled={phase !== "playing" || revealing || card.rank === 14}
                className="py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl flex items-center justify-between bg-gradient-to-r from-[#b9f757] via-emerald-400 to-[#10b981] hover:brightness-110 disabled:opacity-40 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-[#b9f757]/30 transition-all cursor-pointer active:scale-95"
              >
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="p-1 rounded-lg bg-black/15">
                    <ArrowUp size={16} strokeWidth={3} />
                  </div>
                  <div className="text-left">
                    <div>HIGHER</div>
                    <div className="text-[9px] opacity-75 font-bold">Goes up</div>
                  </div>
                </div>
                <ArrowUpRight size={15} />
              </button>

              <button
                onClick={() => guess("lower")}
                disabled={phase !== "playing" || revealing || card.rank === 2}
                className="py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl flex items-center justify-between bg-gradient-to-r from-[#a855f7] via-purple-600 to-[#7c3aed] hover:brightness-110 disabled:opacity-40 text-white font-black text-xs sm:text-sm shadow-lg shadow-[#a855f7]/30 transition-all cursor-pointer active:scale-95"
              >
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="p-1 rounded-lg bg-white/15">
                    <ArrowDown size={16} strokeWidth={3} />
                  </div>
                  <div className="text-left">
                    <div>LOWER</div>
                    <div className="text-[9px] opacity-75 font-bold">Goes down</div>
                  </div>
                </div>
                <ArrowDownRight size={15} />
              </button>
            </div>
          </div>

          {showOver && (phase === "lost" || phase === "cashed") && (
            <GameOverOverlay open
              winAmount={phase === "cashed" ? cashoutValue : 0}
              result={pool.enabled ? `Daily payout pending — provisional claim Rs. ${(phase === "cashed" ? cashoutValue : 0).toLocaleString()}` : phase === "cashed" ? `You won Rs. ${cashoutValue.toLocaleString()}` : ""}
              onClose={() => setShowOver(false)} onPlayAgain={startGame} />
          )}

          {/* Stage Bottom Footnote */}
          <div className="relative z-10 flex items-center justify-between pt-2 border-t border-white/10 text-[9px] text-slate-400 font-bold shrink-0">
            <span>Deck: 2 to Ace</span>
          </div>
        </div>
      </div>

      {/* Under Game: Card Trail & Session Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 shrink-0">
        {/* Card Trail */}
        <div className="rounded-xl bg-[#0b0e1b] border border-white/10 p-2 sm:p-2.5">
          <div className="flex items-center justify-between mb-1.5 text-xs font-bold text-slate-300">
            <span className="flex items-center gap-1.5 text-[#c084fc]">
              <History size={13} /> Card History
            </span>
            <span className="text-[9px] text-slate-500">RECENT</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {cardTrail.length > 0 ? (
              cardTrail.map((c, i) => (
                <PlayingCard key={`${i}-${c.rank}-${c.suit}`} card={c} small />
              ))
            ) : (
              <>
                <PlayingCard card={{ rank: 5, suit: "â™ " }} small faded />
                <PlayingCard card={{ rank: 10, suit: "â™¦" }} small faded />
                <PlayingCard card={{ rank: 7, suit: "â™£" }} small faded />
              </>
            )}
          </div>
        </div>

        {/* Session Stats */}
        <div className="rounded-xl bg-[#0b0e1b] border border-white/10 p-2 sm:p-2.5">
          <div className="flex items-center justify-between mb-1.5 text-xs font-bold text-slate-300">
            <span className="flex items-center gap-1.5 text-[#b9f757]">
              <BarChart3 size={13} /> Session Stats
            </span>
            <span className="text-[9px] text-slate-500">SUMMARY</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="p-1 rounded-lg bg-white/5">
              <div className="text-[9px] text-slate-400">Rounds</div>
              <div className="text-xs sm:text-sm font-black text-white">{history.length}</div>
            </div>
            <div className="p-2 rounded-lg bg-white/5">
              <div className="text-[9px] text-slate-400">Best Win</div>
              <div className="text-xs sm:text-sm font-black text-[#b9f757]">
                Rs. {Math.max(0, ...history.filter((h) => h.result === "Win").map((h) => h.amount)).toLocaleString()}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-white/5">
              <div className="text-[9px] text-slate-400">Streak</div>
              <div className="text-xs sm:text-sm font-black text-[#fbbf24] flex items-center justify-center gap-1">
                <Flame size={12} fill="currentColor" /> {streak}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Round History Table */}
      <div className="rounded-2xl bg-[#0b0e1b] border border-white/10 p-4">
        <h3 className="text-xs font-black text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Dices size={15} className="text-[#c084fc]" /> Recent Bets
        </h3>
        {history.length === 0 ? (
          <div className="text-xs text-slate-500 text-center py-4">No rounds played yet. Place a bet above!</div>
        ) : (
          <div className="space-y-2">
            {history.slice(0, 5).map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 text-xs font-bold"
              >
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">{h.time}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${h.result === "Win" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                      }`}
                  >
                    {h.result === "Win" ? "Win" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-slate-400">
                    {h.multiplier > 0 ? `${h.multiplier.toFixed(2)}Ã—` : "â€”"}
                  </span>
                  <span className={h.result === "Win" ? "text-emerald-400 font-black" : "text-rose-400 font-black"}>
                    {h.result === "Win" ? `+Rs. ${h.amount.toLocaleString()}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-[#1e2338] border border-white/20 text-white text-xs shadow-2xl animate-fade-in">
          <Info size={16} className="text-[#b9f757]" />
          <span>{toast}</span>
          <button onClick={() => setToast("")} className="ml-2 text-slate-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Rules Modal */}
      {helpOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[#161a2e] border border-[#a855f7]/40 p-6 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                ðŸ‘¾ How to Play Monster HiLo
              </h2>
              <button onClick={() => setHelpOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="font-bold text-[#b9f757] mb-1">1. Place Your Bet</div>
                <div>Select your bet amount and click Place Bet. Your first card is dealt.</div>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="font-bold text-[#c084fc] mb-1">2. Call Higher or Lower</div>
                <div>Cards rank from 2 (lowest) to Ace (highest). Guess whether the next card will be higher or lower!</div>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="font-bold text-[#fbbf24] mb-1">3. Cash Out or Build Streak</div>
                <div>Every correct guess multiplies your payout by 1.85Ã—. You can cash out anytime!</div>
              </div>
            </div>
            <button
              onClick={() => setHelpOpen(false)}
              className="mt-5 w-full py-2.5 rounded-xl bg-[#b9f757] text-slate-950 font-black text-xs uppercase"
            >
              Got it, letâ€™s play!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ArrowRight(props: { size?: number; className?: string }) {
  return (
    <svg
      width={props.size || 16}
      height={props.size || 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}
