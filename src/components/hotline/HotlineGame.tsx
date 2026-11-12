"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useGameBalance, usePoolLifecycle } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import { playGameSound, speakGameVoice } from "@/lib/gameAudio";

// Game constants
const ANIMATION_DURATION = 2200; // 2.2 seconds for the line to run
const BOX_SIZE = 58;
const BOX_GAP = 6;
const START_BALANCE = 10000;
const STORAGE_KEY = "wx_hotline_balance";

export type Color = "red" | "black" | "fire";

interface Box {
  id: number;
  color: Color;
}

const generateBoxes = (count: number): Box[] => {
  const boxes: Box[] = [];
  for (let i = 0; i < count; i++) {
    const random = Math.random();
    let color: Color = "red";
    if (random < 0.45) {
      color = "red";
    } else if (random < 0.9) {
      color = "black";
    } else {
      color = "fire";
    }
    boxes.push({ id: i, color });
  }
  return boxes;
};

type HotlineOutcome = { color: Color; won: boolean; multiplier: number; amount: number; payout: number };
function isHotlineOutcome(value: unknown): value is HotlineOutcome {
  return value !== null && typeof value === "object" &&
    "color" in value && ["red", "black", "fire"].includes(String(value.color)) &&
    "won" in value && typeof value.won === "boolean" &&
    "multiplier" in value && typeof value.multiplier === "number" && Number.isFinite(value.multiplier) &&
    "amount" in value && typeof value.amount === "number" && Number.isFinite(value.amount) && value.amount >= 0 &&
    "payout" in value && value.payout === value.amount;
}

const fmtMoney = (n: number) =>
  "Rs. " + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export default function HotlineGame() {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const controlsLocked = isRunning || confirming;
  const [selectedColor, setSelectedColor] = useState<Color | null>(null);
  const [betAmount, setBetAmount] = useState(100);
  const [balance] = useGameBalance("hotline", START_BALANCE);
  const pool = usePoolLifecycle("hotline");
  const acceptedResult = useRef<{ color: Color; won: boolean; multiplier: number; amount: number } | null>(null);
  const accepting = useRef(false);
  const [result, setResult] = useState<{ color: Color; won: boolean; multiplier: number; amount: number } | null>(null);
  const [position, setPosition] = useState(0);
  const [highRiskMode, setHighRiskMode] = useState(false);
  const [history, setHistory] = useState<{ color: Color; won: boolean; bet: number; result: number }[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [lastWinColor, setLastWinColor] = useState<Color | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize boxes
  useEffect(() => {
    setBoxes(generateBoxes(180));
  }, []);

  // Animation loop
  useEffect(() => {
    if (!isRunning) return;

    let startTime: number | null = null;
    let animationFrameId: number;

    const animate = async (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / ANIMATION_DURATION, 1);

      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const totalDist = (boxes.length - 15) * (BOX_SIZE + BOX_GAP) + BOX_SIZE / 2 -
        boxes.length * (BOX_SIZE + BOX_GAP) / 2;
      const newPosition = Math.floor(ease * totalDist);
      setPosition(newPosition);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        // Animation finished, settle result
        if (selectedColor) {
          const saved = acceptedResult.current;
          if (!saved) { setIsRunning(false); return; }
          const { color: winningColor, multiplier, won, amount: winAmount } = saved;
          pool.announce();

          setResult({
            color: winningColor,
            won,
            multiplier,
            amount: winAmount,
          });
          setLastWinColor(winningColor);

          if (won) {
            playGameSound("coin");
            speakGameVoice("limboWin");
          } else {
            playGameSound("crash");
          }

          setHistory((prev) => [
            { color: winningColor, won, bet: betAmount, result: winAmount },
            ...prev.slice(0, 19),
          ]);
        }
        setIsRunning(false);
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isRunning, selectedColor, betAmount, boxes.length, highRiskMode, balance]);

  const handleBet = useCallback(
    async (color: Color) => {
      if (accepting.current || isRunning || betAmount < 10 || balance < betAmount) return;
      accepting.current = true;
      setConfirming(true);
      try {
        const selection = { color, highRisk: highRiskMode };
        if (!await pool.start(betAmount, () => {}, selection)) return;
        const outcome = await pool.resolveServer(selection);
        if (!isHotlineOutcome(outcome)) {
          if (outcome !== null) window.dispatchEvent(new CustomEvent("wx:wallet-error", {
            detail: { error: "Hotline result could not be verified. Please reopen the game." },
          }));
          return;
        }
        acceptedResult.current = outcome;
        setSelectedColor(color);
        setResult(null);
        setPosition(0);
        const nextBoxes = generateBoxes(180);
        nextBoxes[nextBoxes.length - 15] = { ...nextBoxes[nextBoxes.length - 15], color: outcome.color };
        setBoxes(nextBoxes);
        setIsRunning(true);
        playGameSound("click");
      } finally {
        accepting.current = false;
        setConfirming(false);
      }
    },
    [isRunning, betAmount, balance, highRiskMode]
  );

  const handleBetAmountChange = (delta: number) => {
    if (controlsLocked) return;
    setBetAmount((prev) => Math.max(10, Math.min(balance, prev + delta)));
  };

  const setExactBet = (amount: number) => {
    if (controlsLocked) return;
    setBetAmount(Math.max(10, Math.min(balance, amount)));
  };

  return (
    <div
      className="w-full h-full max-w-5xl mx-auto flex flex-col justify-between overflow-hidden rounded-2xl bg-[#060814] border border-[#00f2ff]/30 shadow-2xl shadow-[#00f2ff]/10 px-2 sm:px-4 py-2 text-white select-none"
      style={{ backgroundImage: 'url("/inner-games/hotline.png")', backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" }}
    >
      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-gradient-to-tr from-[#ff007f] to-[#00f2ff] flex items-center justify-center font-black text-lg shadow-lg shadow-[#ff007f]/40">
            🔥
          </div>
          <div>
            <h1 className="text-base sm:text-xl font-black tracking-wider bg-gradient-to-r from-[#00f2ff] via-[#ff007f] to-[#ffb703] bg-clip-text text-transparent drop-shadow-md">
              HOTLINE CASINO
            </h1>
            <p className="text-[9px] sm:text-xs text-slate-400">Miami High-Speed Line Betting</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-cyan-500/40 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/50 transition-colors"
          >
            {showHistory ? "Close" : "📜 History"}
          </button>
          <div className="px-3 py-1 rounded-xl bg-[#030610] border border-[#00f2ff]/30 text-right">
            <div className="text-[9px] uppercase font-bold text-slate-400">Balance</div>
            <div className="text-xs sm:text-sm font-black text-[#00e5a0]">{fmtMoney(balance)}</div>
          </div>
        </div>
      </div>

      {/* Main Track Cabinet */}
      <div className="relative rounded-2xl bg-[#020510] border-2 border-[#00f2ff]/40 shadow-inner overflow-hidden mb-2 p-2 sm:p-3 shrink-0">
        {/* Track neon frame */}
        <div className="relative h-20 sm:h-24 overflow-hidden rounded-xl bg-gradient-to-r from-[#050b1a] via-[#0b1430] to-[#050b1a] border border-[#00f2ff]/20">
          {/* Moving boxes container */}
          <div
            ref={containerRef}
            className="absolute top-1/2 -translate-y-1/2 left-1/2 flex items-center"
            style={{
              transform: `translate(calc(-50% - ${position}px), -50%)`,
              transition: isRunning ? "none" : "transform 0.4s ease-out",
            }}
          >
            {boxes.map((box, index) => {
              const isFire = box.color === "fire";
              const isRed = box.color === "red";
              return (
                <div
                  key={`${box.id}-${index}`}
                  className="flex-shrink-0 flex items-center justify-center"
                  style={{
                    width: BOX_SIZE,
                    height: BOX_SIZE,
                    marginRight: BOX_GAP,
                  }}
                >
                  <div
                    className={`w-full h-full rounded-xl flex items-center justify-center font-black text-xs transition-transform shadow-lg ${isFire
                        ? "bg-gradient-to-tr from-[#ff8800] via-[#ffd000] to-[#ff0055] text-slate-950 shadow-[#ffaa00]/60 border border-yellow-300"
                        : isRed
                          ? "bg-gradient-to-br from-[#ff0055] to-[#99002b] text-white shadow-[#ff0055]/50 border border-red-400/50"
                          : "bg-gradient-to-br from-[#1e293b] to-[#020617] text-slate-300 shadow-black/80 border border-slate-700"
                      }`}
                  >
                    {isFire ? "🔥 2x" : isRed ? "RED" : "BLK"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Center Target Indicator Needle */}
          <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-1.5 bg-gradient-to-b from-[#00f2ff] via-white to-[#00f2ff] shadow-[0_0_16px_#00f2ff] z-20" />
          <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[14px] border-t-[#00f2ff] z-30" />
          <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-b-[14px] border-b-[#00f2ff] z-30" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#020510] via-transparent to-[#020510] opacity-80 z-10" />

          {/* Status Badges */}
          {lastWinColor && !isRunning && (
            <div className="absolute top-1.5 left-2 z-30 flex items-center gap-1.5 bg-black/60 backdrop-blur px-2.5 py-0.5 rounded-lg border border-white/10 text-[10px] sm:text-xs">
              <span className="text-slate-400 font-bold">Last:</span>
              <span
                className={`font-black uppercase ${lastWinColor === "fire"
                    ? "text-[#ffd000]"
                    : lastWinColor === "red"
                      ? "text-[#ff3b69]"
                      : "text-slate-300"
                  }`}
              >
                {lastWinColor === "fire" ? "🔥 FIRE (2x)" : lastWinColor}
              </span>
            </div>
          )}

          {highRiskMode && (
            <div className="absolute top-1.5 right-2 z-30 bg-gradient-to-r from-red-600 to-amber-600 text-white font-black text-[9px] sm:text-[10px] px-2 py-0.5 rounded-md shadow-md animate-pulse">
              ⚡ HIGH RISK (FIRE 2x)
            </div>
          )}
        </div>
      </div>

      {/* Result Announcement Strip */}
      {result && !isRunning && (
        <div
          className={`mb-2 p-2 sm:p-2.5 rounded-xl border-2 flex items-center justify-between gap-3 shrink-0 transition-all ${result.won
              ? "bg-[#00e5a0]/15 border-[#00e5a0] shadow-lg shadow-[#00e5a0]/20"
              : "bg-[#ff0055]/15 border-[#ff0055] shadow-lg shadow-[#ff0055]/20"
            }`}
        >
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center font-black text-base shadow-md ${result.color === "fire"
                  ? "bg-gradient-to-tr from-amber-400 to-rose-500 text-black"
                  : result.color === "red"
                    ? "bg-gradient-to-br from-red-600 to-rose-900 text-white"
                    : "bg-gradient-to-br from-slate-700 to-slate-950 text-white"
                }`}
            >
              {result.color === "fire" ? "🔥" : result.color === "red" ? "♦" : "♠"}
            </div>
            <div>
              <div
                className={`text-sm sm:text-base font-black tracking-wide ${result.won ? "text-[#00e5a0]" : "text-[#ff3b69]"
                  }`}
              >
                {pool.enabled ? "DAILY PAYOUT PENDING" : result.won ? "🎉 YOU WON!" : null}
              </div>
              <div className="text-[10px] text-slate-400">
                Landed on <b className="uppercase text-white">{result.color}</b> · Multiplier:{" "}
                <b className="text-[#00f2ff]">{result.multiplier.toFixed(2)}x</b>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-400">{pool.enabled ? "Provisional claim" : "Payout"}</div>
            <div className={`text-sm sm:text-base font-black ${result.won ? "text-[#00e5a0]" : "text-slate-400"}`}>
              {pool.enabled ? fmtMoney(result.won ? result.amount : 0) : result.won ? `+${fmtMoney(result.amount)}` : null}
            </div>
          </div>
        </div>
      )}

      {/* Betting Controls & Color Selection */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-2 flex-1 min-h-0">
        {/* RED OPTION */}
        <button
          onClick={() => handleBet("red")}
          disabled={controlsLocked || balance < betAmount}
          className={`group relative overflow-hidden rounded-xl sm:rounded-2xl p-2.5 sm:p-4 border-2 text-left flex flex-col justify-between transition-all ${selectedColor === "red" && isRunning
              ? "ring-4 ring-[#ff007f] scale-[1.02] border-[#ff007f]"
              : "border-red-500/40 hover:border-red-400"
            } bg-gradient-to-br from-[#7f002b] via-[#450017] to-[#1a0008] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <div>
            <div className="flex justify-between items-start mb-1">
              <span className="text-[9px] sm:text-xs font-black tracking-widest text-red-300 uppercase">RED</span>
              <span className="px-1.5 py-0.5 rounded bg-red-500/30 text-white font-mono text-[10px] sm:text-xs font-black">
                x{highRiskMode ? "2.00" : "1.95"}
              </span>
            </div>
            <div className="text-sm sm:text-xl font-black text-white">RED COLOR</div>
            <div className="text-[9px] sm:text-[11px] text-red-200/70 hidden sm:block">Instant Cashout</div>
          </div>
          <div className="mt-2 py-1.5 sm:py-2.5 px-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-black text-center text-[10px] sm:text-xs shadow-md shadow-red-600/50 transition active:scale-95">
            {isRunning && selectedColor === "red" ? "SPINNING…" : `BET RED (${fmtMoney(betAmount)})`}
          </div>
        </button>

        {/* BLACK OPTION */}
        <button
          onClick={() => handleBet("black")}
          disabled={controlsLocked || balance < betAmount}
          className={`group relative overflow-hidden rounded-xl sm:rounded-2xl p-2.5 sm:p-4 border-2 text-left flex flex-col justify-between transition-all ${selectedColor === "black" && isRunning
              ? "ring-4 ring-cyan-400 scale-[1.02] border-cyan-400"
              : "border-slate-700 hover:border-slate-500"
            } bg-gradient-to-br from-[#1e293b] via-[#0f172a] to-[#020617] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <div>
            <div className="flex justify-between items-start mb-1">
              <span className="text-[9px] sm:text-xs font-black tracking-widest text-slate-300 uppercase">BLACK</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-700 text-white font-mono text-[10px] sm:text-xs font-black">
                x{highRiskMode ? "2.00" : "1.95"}
              </span>
            </div>
            <div className="text-sm sm:text-xl font-black text-white">BLACK COLOR</div>
            <div className="text-[9px] sm:text-[11px] text-slate-400 hidden sm:block">Instant Cashout</div>
          </div>
          <div className="mt-2 py-1.5 sm:py-2.5 px-2 rounded-xl bg-gradient-to-r from-slate-800 via-indigo-900 to-slate-800 hover:from-slate-700 hover:to-indigo-800 text-cyan-300 font-black text-center text-[10px] sm:text-xs shadow-md shadow-indigo-900/50 border border-cyan-500/30 transition active:scale-95">
            {isRunning && selectedColor === "black" ? "SPINNING…" : `BET BLACK (${fmtMoney(betAmount)})`}
          </div>
        </button>

        {/* FIRE OPTION */}
        <button
          onClick={() => handleBet("fire")}
          disabled={controlsLocked || balance < betAmount}
          className={`group relative overflow-hidden rounded-xl sm:rounded-2xl p-2.5 sm:p-4 border-2 text-left flex flex-col justify-between transition-all ${selectedColor === "fire" && isRunning
              ? "ring-4 ring-yellow-400 scale-[1.02] border-yellow-400"
              : "border-yellow-500/50 hover:border-yellow-400"
            } bg-gradient-to-br from-[#7a4800] via-[#4a2600] to-[#1c0c00] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <div>
            <div className="flex justify-between items-start mb-1">
              <span className="text-[9px] sm:text-xs font-black tracking-widest text-amber-300 uppercase">FIRE</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-mono text-[10px] sm:text-xs font-black animate-pulse">
                x2.00
              </span>
            </div>
            <div className="text-sm sm:text-xl font-black text-amber-300">🔥 FIRE JACKPOT</div>
            <div className="text-[9px] sm:text-[11px] text-amber-200/70 hidden sm:block">Rare Multiplier · Huge Win</div>
          </div>
          <div className="mt-2 py-1.5 sm:py-2.5 px-2 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-rose-500 hover:brightness-110 text-slate-950 font-black text-center text-[10px] sm:text-xs shadow-lg shadow-amber-500/50 transition active:scale-95">
            {isRunning && selectedColor === "fire" ? "SPINNING…" : `BET FIRE (${fmtMoney(betAmount)})`}
          </div>
        </button>
      </div>

      {/* Stake Adjuster & High-Risk Toggle Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 sm:p-3 rounded-2xl bg-[#030612] border border-white/10 shrink-0">
        {/* Bet Chips & Adjusters */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] sm:text-xs font-bold text-slate-400 mr-1">STAKE:</span>
          <button
            onClick={() => handleBetAmountChange(-50)}
            disabled={controlsLocked}
            className="px-2 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 text-[11px] font-bold border border-rose-500/40 text-rose-300 transition active:scale-95"
          >
            -50
          </button>
          <button
            onClick={() => handleBetAmountChange(-10)}
            disabled={controlsLocked}
            className="px-2 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 text-[11px] font-bold border border-rose-500/40 text-rose-300 transition active:scale-95"
          >
            -10
          </button>
          <input
            type="number"
            min={10}
            inputMode="numeric"
            aria-label="Custom bet amount"
            disabled={controlsLocked}
            value={betAmount || ""}
            onChange={(e) => setBetAmount(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
            onBlur={() => setExactBet(betAmount)}
            className="w-20 px-2 py-1 rounded-lg bg-[#0a1126] border border-[#00f2ff]/40 text-xs sm:text-sm font-mono font-black text-white text-center outline-none"
          />
          <button
            onClick={() => handleBetAmountChange(10)}
            disabled={controlsLocked}
            className="px-2 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 text-[11px] font-bold border border-emerald-500/40 text-emerald-300 transition active:scale-95"
          >
            +10
          </button>
          <button
            onClick={() => handleBetAmountChange(50)}
            disabled={controlsLocked}
            className="px-2 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 text-[11px] font-bold border border-emerald-500/40 text-emerald-300 transition active:scale-95"
          >
            +50
          </button>
          <button
            onClick={() => handleBetAmountChange(200)}
            disabled={controlsLocked}
            className="px-2 py-1 rounded-lg bg-teal-950/60 hover:bg-teal-900/60 text-[11px] font-bold border border-teal-500/40 text-teal-300 transition active:scale-95"
          >
            +200
          </button>

          <div className="h-5 w-px bg-white/10 mx-0.5" />

          {BET_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setExactBet(p)}
              disabled={controlsLocked}
              className="px-2 py-1 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/60 text-[11px] font-bold border border-cyan-500/40 text-cyan-300 transition active:scale-95"
            >
              {p}
            </button>
          ))}

          <div className="h-5 w-px bg-white/10 mx-0.5" />

          <button
            onClick={() => setExactBet(Math.floor(betAmount * 2))}
            disabled={controlsLocked}
            className="px-2 py-1 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/60 text-[11px] font-bold border border-indigo-500/40 text-indigo-300 transition active:scale-95"
          >
            2X
          </button>
          <button
            onClick={() => setExactBet(Math.floor(betAmount / 2))}
            disabled={controlsLocked}
            className="px-2 py-1 rounded-lg bg-amber-950/60 hover:bg-amber-900/60 text-[11px] font-bold border border-amber-500/40 text-amber-300 transition active:scale-95"
          >
            ½
          </button>
        </div>

        {/* High Risk Toggle */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <span className="text-[10px] sm:text-xs font-bold text-slate-300">High Risk Mode</span>
            <input
              type="checkbox"
              checked={highRiskMode}
              disabled={controlsLocked}
              onChange={(e) => setHighRiskMode(e.target.checked)}
              className="w-4 h-4 rounded text-red-500 accent-red-500 cursor-pointer"
            />
          </label>
        </div>
      </div>

      {/* History Drawer */}
      {showHistory && (
        <div className="mt-2 p-2 sm:p-3 rounded-2xl bg-[#030612] border border-white/10 max-h-32 overflow-y-auto shrink-0">
          <h3 className="text-xs font-black text-white uppercase tracking-wider mb-2">Round History</h3>
          {history.length === 0 ? (
            <div className="text-[11px] text-slate-500 text-center py-2">No rounds played yet. Place a bet above!</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-1.5">
              {history.map((h, i) => (
                <div
                  key={i}
                  className={`p-1.5 rounded-lg border flex items-center justify-between text-[11px] font-bold ${h.won
                      ? "bg-green-500/10 border-green-500/30 text-green-400"
                      : "bg-red-500/10 border-red-500/30 text-red-400"
                    }`}
                >
                  <div className="flex items-center gap-1">
                    <span>{h.color === "fire" ? "🔥" : h.color === "red" ? "♦" : "♠"}</span>
                    <span className="uppercase text-[9px]">{h.color}</span>
                  </div>
                  <div>{pool.enabled ? `Provisional claim ${h.result}` : h.won ? `+${h.result}` : null}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
