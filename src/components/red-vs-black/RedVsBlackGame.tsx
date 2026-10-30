"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import BetAmountInput from "@/components/BetAmountInput";
import { gameSfx } from "@/lib/gameSfx";
import { isColourBrowserDeal } from "@/lib/browserCardGuards";
import "./red-vs-black.css";

const CHIP_VALUES = BET_PRESETS;
const INITIAL_BALANCE = 5000;
const BET_TIME = 10;
const NEXT_ROUND_MS = 3500;
type Phase = "betting" | "spinning" | "result";

interface GameResult {
  winningColor: "red" | "black";
  card: { suit: string; value: string };
  isWin: boolean;
  payout: number;
  betAmount: number;
  betColor: string;
  staked: boolean;
}

interface HistoryEntry {
  color: "red" | "black";
  card: string;
  isWin: boolean;
}

export default function RedVsBlackGame() {
  const [balance, setBalance] = useGameBalance("red-vs-black", INITIAL_BALANCE);
  const pool = usePoolLifecycle("red-vs-black");
  const [selectedChip, setSelectedChip] = useState(50);
  const [currentBet, setCurrentBet] = usePoolRoundState<{ color: "red" | "black"; amount: number } | null>("red-vs-black", "currentBet", null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState<GameResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [winMessage, setWinMessage] = useState<string | null>(null);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; color: string }[]>([]);
  const particleId = useRef(0);
  const [otherCard, setOtherCard] = useState<{ suit: string; value: string } | null>(null);

  // Balance synced via useGameBalance

  useEffect(() => {
    try {
      localStorage.setItem("wx_red_vs_black_bal", String(balance));
    } catch {
      /* ignore */
    }
  }, [balance]);

  const [phase, setPhase] = useState<Phase>("betting");
  const [timeLeft, setTimeLeft] = useState(BET_TIME);
  const spinningRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const placeBet = useCallback(
    async (color: "red" | "black") => {
      if (phase !== "betting" || spinningRef.current) return;
      if (currentBet && currentBet.color !== color) {
        setWinMessage("One colour per round");
        setTimeout(() => setWinMessage(null), 2000);
        return;
      }
      if (balance < selectedChip) {
        setWinMessage("Insufficient balance!");
        setTimeout(() => setWinMessage(null), 2000);
        return;
      }
      gameSfx.chip();
      pool.checkpoint({ currentBet: { color, amount: (currentBet?.amount ?? 0) + selectedChip } });
      if (!await pool.stake(selectedChip)) return;
      setCurrentBet((prev) => ({ color, amount: (prev?.amount ?? 0) + selectedChip }));
    },
    [phase, currentBet, balance, selectedChip, setBalance]
  );

  const spawnParticles = useCallback((winColor: string) => {
    const newParticles = Array.from({ length: 24 }, () => ({
      id: particleId.current++,
      x: 50 + (Math.random() - 0.5) * 40,
      y: 40 + (Math.random() - 0.5) * 30,
      color: winColor === "red" ? "#ef4444" : "#eab308",
    }));
    setParticles(newParticles);
    setTimeout(() => setParticles([]), 2000);
  }, []);

  /** Deals one live round. `bet === null` is a no-stake spectator round: public card only, no wallet/stats/history. */
  const spin = useCallback(async (bet: { color: "red" | "black"; amount: number } | null) => {
    if (pool.busy) return;
    if (spinningRef.current) return;
    spinningRef.current = true;

    setIsSpinning(true);
    setPhase("spinning");
    gameSfx.deal();
    setShowResult(false);
    setCardFlipped(false);
    setResult(null);

    try {
      const suits = {
        red: ["♥", "♦"],
        black: ["♠", "♣"],
      };
      const values = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
      const confirmed = bet ? await pool.resolveServer({ color: bet.color }) : null;
      if (bet && !isColourBrowserDeal(confirmed)) {
        setWinMessage("Result confirmation failed. Reopen to recover the accepted wager.");
        return;
      }
      const winningColor: "red" | "black" = isColourBrowserDeal(confirmed)
        ? confirmed.winningColor : Math.random() < 0.5 ? "red" : "black";
      const suit = isColourBrowserDeal(confirmed) ? confirmed.suit : suits[winningColor][Math.floor(Math.random() * 2)];
      const value = isColourBrowserDeal(confirmed) ? confirmed.value : values[Math.floor(Math.random() * values.length)];
      const isWin = isColourBrowserDeal(confirmed) && confirmed.isWin;
      const payout = isColourBrowserDeal(confirmed) ? confirmed.payout : 0;
      await new Promise((resolve) => setTimeout(resolve, 1400));
      if (!mountedRef.current) return;

      const data: GameResult = {
        winningColor,
        card: { suit, value },
        isWin,
        payout,
        betAmount: bet?.amount ?? 0,
        betColor: bet?.color ?? "",
        staked: !!bet,
      };

      const otherColor = winningColor === "red" ? "black" : "red";
      setOtherCard({
        suit: suits[otherColor][Math.floor(Math.random() * 2)],
        value: values[Math.floor(Math.random() * values.length)],
      });
      gameSfx.flip();
      setCardFlipped(true);
      await new Promise((resolve) => setTimeout(resolve, 600));
      if (!mountedRef.current) return;

      setResult(data);
      setShowResult(true);

      if (bet) {
        if (data.isWin) gameSfx.win();
        else gameSfx.lose();
        if (data.isWin) {
          setWinMessage(pool.enabled ? `Provisional claim Rs. ${data.payout}; daily settlement pending` : `You won Rs. ${data.payout}!`);
          if (mountedRef.current) spawnParticles(data.winningColor);
        } else {
          setWinMessage(pool.enabled ? "Daily payout pending — provisional claim Rs. 0" : "No win");
        }

        setHistory((prev) => [
          { color: data.winningColor, card: `${data.card.value}${data.card.suit}`, isWin: data.isWin },
          ...prev.slice(0, 19),
        ]);
      }
    } catch {
      if (bet) {
        const refunded = await pool.refund();
        setWinMessage(refunded ? "Round cancelled; bet refunded." : "Refund confirmation failed. Retry before betting.");
      }
    } finally {
      if (mountedRef.current) {
        setIsSpinning(false);
        setPhase("result");
      }
    }
  }, [spawnParticles, setBalance]);

  // Live table countdown: deal automatically, with or without a stake.
  useEffect(() => {
    if (phase !== "betting") return;
    if (timeLeft <= 0) {
      void spin(currentBet);
      return;
    }
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeft]);

  const newRound = useCallback(async () => {
    if (!mountedRef.current || !spinningRef.current) return;
    spinningRef.current = false;
    setWinMessage(null);
    setResult(null);
    setShowResult(false);
    setCardFlipped(false);
    setOtherCard(null);
    setCurrentBet(null);
    setTimeLeft(BET_TIME);
    setPhase("betting");
  }, [setBalance]);

  useEffect(() => {
    if (phase !== "result") return;
    const id = setTimeout(newRound, NEXT_ROUND_MS);
    return () => clearTimeout(id);
  }, [phase, newRound]);

  const totalWins = history.filter((h) => h.isWin).length;

  return (
    <div className="w-full h-full max-w-4xl mx-auto rounded-2xl bg-gradient-to-b from-[#140606] via-[#1a0a00] to-[#0a0606] border border-red-500/30 shadow-2xl px-2 sm:px-4 py-1.5 flex flex-col justify-between items-center overflow-y-auto overflow-x-hidden relative text-white select-none">
      {/* Particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="particle"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            backgroundColor: p.color,
          }}
        />
      ))}

      {/* Header & Balance Bar */}
      <header className="w-full shrink-0 flex items-center justify-between border-b border-white/10 pb-1.5 px-1">
        <div className="flex items-center gap-2">
          <h1 className="text-base sm:text-xl font-black tracking-wider leading-none">
            <span className="text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]">RED</span>
            <span className="text-white mx-1.5 text-xs sm:text-sm">VS</span>
            <span className="text-slate-300 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">BLACK</span>
          </h1>
          <span className="hidden xs:inline text-[9px] text-amber-400 font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">
            2X Payout
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-gradient-to-r from-amber-600/20 to-amber-500/20 border border-amber-500/40 rounded-xl px-2.5 py-1 flex items-center gap-2">
            <div>
              <p className="text-amber-300/80 text-[8px] font-bold uppercase tracking-wider leading-none">Balance</p>
              <p className="text-white text-xs sm:text-sm font-black tabular-nums leading-tight">
                Rs. {balance.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Game Card Area */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md px-2 py-1 my-auto">
        {/* Card Display */}
        <div className="relative my-auto">
          <div
            className={`absolute inset-0 blur-2xl rounded-full transition-all duration-1000 ${showResult && result?.staked
                ? result.isWin
                  ? "bg-emerald-500/30 scale-125"
                  : "bg-rose-500/20 scale-110"
                : isSpinning
                  ? "bg-amber-500/20 scale-110 animate-pulse"
                  : "bg-white/5 scale-100"
              }`}
          />

          {/* Cards */}
          <div className="flex items-end justify-center gap-3 sm:gap-6 relative z-10">
            {(["red", "black"] as const).map((side) => {
              const isWinner = showResult && result?.winningColor === side;
              const face = result ? (result.winningColor === side ? result.card : otherCard) : null;
              const isRed = side === "red";
              return (
                <div key={side} className="flex flex-col items-center gap-1">
                  <span className={`text-[10px] sm:text-xs font-black uppercase tracking-widest ${isRed ? "text-red-400" : "text-slate-300"}`}>
                    {side}
                  </span>
                  <div className={`rvb-card ${isSpinning ? "spinning" : ""} ${cardFlipped ? "flipped" : ""} ${isWinner ? "rvb-winner" : ""}`}>
                    <div className="rvb-card-inner">
                      <div className="rvb-face rvb-back">
                        <div className="rvb-pattern">
                          <div className="rvb-pattern-inner" />
                        </div>
                        <span className="text-xl font-black text-amber-400 z-10">RVB</span>
                      </div>
                      <div
                        className={`rvb-face rvb-front ${isRed
                            ? "bg-gradient-to-br from-red-600 to-red-800 text-white"
                            : "bg-gradient-to-br from-slate-800 to-slate-950 text-slate-100"
                          }`}
                      >
                        {face && (
                          <div className="flex flex-col items-center justify-center h-full">
                            <span className="text-3xl sm:text-5xl font-black leading-none">{face.value}</span>
                            <span className="text-2xl sm:text-4xl mt-1 leading-none">{face.suit}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Spinning Overlay */}
          {isSpinning && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="spinning-ring" />
            </div>
          )}
        </div>

        {/* Result Message */}
        <div className="h-8 sm:h-9 flex items-center justify-center shrink-0">
          {winMessage && (
            <div className={`text-center result-pop ${result?.isWin ? "text-emerald-400" : "text-rose-400"}`}>
              <p className="text-base sm:text-lg font-black leading-tight">{winMessage}</p>
              {result?.isWin && (
                <p className="text-emerald-300 text-[10px] font-bold">+Rs. {result.payout}</p>
              )}
            </div>
          )}
          {!winMessage && phase === "betting" && (
            <p className="text-white/40 text-xs font-semibold">
              {currentBet
                ? `Rs. ${currentBet.amount} on ${currentBet.color.toUpperCase()} · dealing in ${timeLeft}s`
                : `Choose RED or BLACK to place bet · next deal in ${timeLeft}s`}
            </p>
          )}
          {isSpinning && (
            <p className="text-amber-400 text-xs font-bold animate-pulse">Dealing Card...</p>
          )}
        </div>

        {/* Bet Buttons */}
        <div className="flex gap-3 w-full max-w-xs my-1 shrink-0">
          <button
            onClick={() => placeBet("red")}
            disabled={phase !== "betting" || isSpinning || balance < selectedChip}
            className="flex-1 relative group cursor-pointer"
          >
            <div className="bet-button-red group-hover:scale-[1.02] group-active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed">
              <div className="text-xl sm:text-2xl leading-none">♥</div>
              <div className="text-sm sm:text-base font-black tracking-wider leading-tight">RED</div>
              <div className="text-xs font-bold" aria-label="Amount on red">Rs. {currentBet?.color === "red" ? currentBet.amount : 0}</div>
              <div className="text-red-200/80 text-[10px] leading-none">2x Win</div>
            </div>
          </button>
          <button
            onClick={() => placeBet("black")}
            disabled={phase !== "betting" || isSpinning || balance < selectedChip}
            className="flex-1 relative group cursor-pointer"
          >
            <div className="bet-button-black group-hover:scale-[1.02] group-active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed">
              <div className="text-xl sm:text-2xl leading-none">♠</div>
              <div className="text-sm sm:text-base font-black tracking-wider leading-tight">BLACK</div>
              <div className="text-xs font-bold" aria-label="Amount on black">Rs. {currentBet?.color === "black" ? currentBet.amount : 0}</div>
              <div className="text-slate-300/80 text-[10px] leading-none">2x Win</div>
            </div>
          </button>
        </div>

        {/* Chip Selection */}
        <div className="w-full max-w-sm shrink-0 my-1">
          <div className="flex justify-center gap-1.5 flex-wrap">
            {CHIP_VALUES.map((value) => (
              <button
                key={value}
                onClick={() => setSelectedChip(value)}
                className={`rvb-chip ${selectedChip === value ? "rvb-chip-selected" : ""} ${balance < value ? "opacity-30 cursor-not-allowed" : ""
                  }`}
              >
                <span className="text-[10px] sm:text-xs font-black">{value}</span>
              </button>
            ))}
            <BetAmountInput value={selectedChip} onChange={setSelectedChip} />
          </div>
        </div>
      </div>

      {/* History & Stats Bar */}
      <div className="w-full shrink-0 flex items-center justify-between border-t border-white/10 pt-1 px-1">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-emerald-400 font-bold">W: {totalWins}</span>
        </div>

        {/* History Strip */}
        <div className="flex gap-1 overflow-x-auto max-w-[200px] sm:max-w-xs scrollbar-hide py-0.5">
          {history.slice(0, 10).map((h, i) => (
            <div
              key={i}
              className={`flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold border ${h.color === "red"
                  ? "bg-red-500/20 border-red-500/40 text-red-400"
                  : "bg-slate-700/30 border-slate-600/50 text-slate-300"
                }`}
            >
              {h.card}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
