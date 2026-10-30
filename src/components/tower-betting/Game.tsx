"use client";
import { gameSfx } from "@/lib/gameSfx";
import { GameOverOverlay } from "@/components/GameOverOverlay";

import { useState } from "react";
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";

// ===== Game config =====
const WIN_CHANCE = 0.35;
const ROWS = 9;

type Difficulty = "easy" | "medium" | "hard" | "expert" | "master";

const DIFF: Record<Difficulty, { cols: number; safe: number; mults: number[] }> = {
  easy: { cols: 4, safe: 3, mults: [1.31, 1.74, 2.32, 3.1, 4.13, 5.51, 7.34, 9.79, 13.05] },
  medium: { cols: 3, safe: 2, mults: [1.47, 2.21, 3.31, 4.96, 7.44, 11.16, 16.74, 25.11, 37.67] },
  hard: { cols: 2, safe: 1, mults: [1.96, 3.92, 7.84, 15.68, 31.36, 62.72, 125.44, 250.88, 501.76] },
  expert: { cols: 3, safe: 1, mults: [2.94, 8.82, 26.46, 79.38, 238.14, 714.42, 2143.26, 6429.78, 19289.34] },
  master: { cols: 4, safe: 1, mults: [3.92, 15.68, 62.72, 250.88, 1003.52, 4014.08, 16056.32, 64225.28, 256901.12] },
};

type Cell = "hidden" | "egg" | "dragon" | "egg-dim" | "dragon-dim";

function emptyBoard(cols: number): Cell[][] {
  return Array.from({ length: ROWS }, () => Array<Cell>(cols).fill("hidden"));
}

function Egg({ dim }: { dim?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" className={`h-8 w-8 ${dim ? "opacity-40" : ""}`}>
      <ellipse cx="20" cy="22" rx="11" ry="14" fill="#2ee86a" />
      <ellipse cx="16" cy="16" rx="3" ry="5" fill="#b9ffcf" opacity=".7" />
      <path d="M11 24 l4 -3 4 3 4 -3 4 3 3 -2" stroke="#0a7a32" strokeWidth="2" fill="none" />
    </svg>
  );
}

function Dragon({ dim }: { dim?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" className={`h-8 w-8 ${dim ? "opacity-40" : ""}`}>
      <path d="M8 30 Q6 14 16 10 L14 4 L20 9 L26 4 L24 10 Q34 14 32 30 Z" fill="#ff3b4e" />
      <circle cx="15" cy="18" r="2.5" fill="#ffe14d" />
      <circle cx="25" cy="18" r="2.5" fill="#ffe14d" />
      <path d="M14 26 Q20 30 26 26" stroke="#7a0010" strokeWidth="2" fill="none" />
    </svg>
  );
}

export default function TowerGame() {
  const [balance, setBalance] = useGameBalance("tower-betting", 1000);
  const pool = usePoolLifecycle("tower-betting");
  const [betInput, setBetInput] = useState("10.00");
  const [difficulty, setDifficulty] = usePoolRoundState<Difficulty>("tower-betting", "difficulty", "easy");
  const [board, setBoard] = usePoolRoundState<Cell[][]>("tower-betting", "board", emptyBoard(4));
  const [playing, setPlaying] = usePoolRoundState("tower-betting", "playing", false);
  const [level, setLevel] = usePoolRoundState("tower-betting", "level", 0);
  const [bet, setBet] = usePoolRoundState("tower-betting", "bet", 0);
  const [result, setResult] = useState<{ win: boolean; mult: number; amount: number } | null>(null);
  const [endDismissed, setEndDismissed] = useState(false);
  const [tab, setTab] = useState<"manual" | "auto">("manual");

  const cfg = DIFF[difficulty];
  const currentMult = level > 0 ? cfg.mults[level - 1] : 1;
  const nextMult = cfg.mults[Math.min(level, ROWS - 1)];

  const changeDifficulty = (d: Difficulty) => {
    if (playing) return;
    setDifficulty(d);
    setBoard(emptyBoard(DIFF[d].cols));
    setResult(null);
  };

  const revealRest = (b: Cell[][], cfgL = cfg) =>
    b.map((row) => {
      if (row.some((c) => c !== "hidden")) {
        return row.map((c) => (c === "hidden" ? "dragon-dim" : c)) as Cell[];
      }
      const safeIdx = new Set<number>();
      while (safeIdx.size < cfgL.safe) safeIdx.add(Math.floor(Math.random() * cfgL.cols));
      return row.map((_, i) => (safeIdx.has(i) ? "egg-dim" : "dragon-dim")) as Cell[];
    });

  const startGame = async () => {
    gameSfx.click();
    const amt = Math.max(0, parseFloat(betInput) || 0);
    if (amt <= 0 || amt > balance) return;
    pool.checkpoint({ difficulty, board: emptyBoard(cfg.cols), playing: true, level: 0, bet: amt });
    if (!await pool.start(amt, () => setBalance((b) => +(b - amt).toFixed(2)))) return;
    setBet(amt);
    setBoard(emptyBoard(cfg.cols));
    setLevel(0);
    setResult(null);
    setEndDismissed(false);
    setPlaying(true);
  };

  const cashout = async (lvl = level, b = board) => {
    if (!playing || lvl === 0) return;
    const mult = cfg.mults[lvl - 1];
    const win = +(bet * mult).toFixed(2);
    if (!await pool.complete(win, () => setBalance((x) => +(x + win).toFixed(2)))) return;
    setBoard(revealRest(b));
    gameSfx.win();
    setEndDismissed(false);
    setResult({ win: true, mult, amount: win });
    setPlaying(false);
  };

  const pick = async (rowIdx: number, col: number) => {
    if (!playing || rowIdx !== level) return;
    gameSfx.click();
    const safe = Math.random() < WIN_CHANCE;
    const nb = board.map((r) => [...r]);
    const row = nb[rowIdx];
    // fill rest of the row
    const others = [...Array(cfg.cols).keys()].filter((i) => i !== col).sort(() => Math.random() - 0.5);
    let safeLeft = safe ? cfg.safe - 1 : cfg.safe;
    for (const i of others) {
      row[i] = safeLeft > 0 ? "egg-dim" : "dragon-dim";
      if (safeLeft > 0) safeLeft--;
    }
    row[col] = safe ? "egg" : "dragon";

    if (!safe) {
      pool.plan(0, { board: nb });
      if (!await pool.complete(0)) return;
      setBoard(revealRest(nb));
      gameSfx.lose();
      setEndDismissed(false);
      setResult({ win: false, mult: 0, amount: 0 });
      setPlaying(false);
      return;
    }
    const newLevel = level + 1;
    setBoard(nb);
    setLevel(newLevel);
    if (newLevel === ROWS) cashout(newLevel, nb);
  };

  const randomPick = () => {
    if (!playing) return;
    pick(level, Math.floor(Math.random() * cfg.cols));
  };

  const adjustBet = (f: number) => {
    if (playing) return;
    const v = Math.max(0, (parseFloat(betInput) || 0) * f);
    setBetInput(Math.min(v, balance).toFixed(2));
  };

  return (
    <div className="h-full w-full overflow-hidden bg-[#1a2c38] font-sans text-white rounded-xl sm:rounded-2xl border border-[#213743] flex flex-col justify-between px-1 sm:px-2 md:px-3 py-1 select-none">
      {/* Top bar */}
      <header className="flex shrink-0 h-10 sm:h-12 items-center justify-between bg-[#1a2c38] px-3 sm:px-5 border-b border-white/5">
        <span className="text-lg sm:text-2xl font-extrabold italic tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">TOWER</span>
        <div className="flex items-center overflow-hidden rounded-lg bg-[#0f212e] border border-white/10 shadow-sm">
          <span className="px-3 py-1 text-xs sm:text-sm font-bold text-emerald-300">Rs. {balance.toFixed(2)}</span>
        </div>
      </header>

      <main className="mx-auto flex flex-1 min-h-0 w-full max-w-6xl flex-col justify-between p-1 sm:p-2 overflow-hidden">
        <div className="flex flex-col-reverse md:flex-row flex-1 min-h-0 overflow-hidden rounded-lg gap-2">
          {/* Sidebar */}
          <aside className="w-full bg-[#213743] p-2 sm:p-3 md:w-[280px] lg:w-[320px] shrink-0 flex flex-col justify-between overflow-y-auto rounded-lg">
            <div>
              <div className="mb-2 flex rounded-full bg-[#0f212e] p-1">
                {(["manual", "auto"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex-1 rounded-full py-1.5 text-xs font-bold capitalize transition ${tab === t ? "bg-[#2f4553] text-white shadow-sm" : "text-slate-400 hover:text-white"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <label className="mb-1 flex justify-between text-[11px] font-semibold text-[#b1bad3]">
                <span>Bet Amount</span>
                <span>Rs. {(parseFloat(betInput) || 0).toFixed(2)}</span>
              </label>
              <div className="mb-2 flex rounded-lg bg-[#2f4553] p-0.5 shadow">
                <input
                  value={betInput}
                  disabled={playing}
                  onChange={(e) => setBetInput(e.target.value)}
                  className="w-full rounded-l border border-[#2f4553] bg-[#0f212e] px-2 py-1.5 text-xs sm:text-sm font-semibold outline-none focus:border-[#557086]"
                />
                <button onClick={() => adjustBet(0.5)} className="px-2.5 text-xs font-bold hover:bg-[#557086]">½</button>
                <div className="my-1.5 w-0.5 bg-[#1a2c38]" />
                <button onClick={() => adjustBet(2)} className="px-2.5 text-xs font-bold hover:bg-[#557086]">2×</button>
              </div>
              <div className="mb-2 grid grid-cols-5 gap-1">
                {BET_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={playing}
                    onClick={() => setBetInput(Math.min(p, balance).toFixed(2))}
                    className="rounded-md bg-[#0f212e] border border-[#2f4553] py-1 text-[11px] font-bold text-[#b1bad3] hover:border-[#557086] hover:text-white disabled:opacity-40 active:scale-95"
                  >
                    {p}
                  </button>
                ))}
              </div>

              <label className="mb-1 block text-[11px] font-semibold text-[#b1bad3]">Difficulty</label>
              <select
                value={difficulty}
                disabled={playing}
                onChange={(e) => changeDifficulty(e.target.value as Difficulty)}
                className="mb-2 w-full rounded-lg border border-[#2f4553] bg-[#0f212e] px-2 py-1.5 text-xs sm:text-sm font-semibold capitalize outline-none"
              >
                {Object.keys(DIFF).map((d) => (
                  <option key={d} value={d} className="capitalize">{d[0].toUpperCase() + d.slice(1)}</option>
                ))}
              </select>
            </div>

            <div className="pt-2">
              {playing ? (
                <>
                  <button
                    onClick={randomPick}
                    className="mb-2 w-full rounded-xl bg-gradient-to-r from-indigo-600 to-blue-700 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-white shadow-[0_0_12px_rgba(99,102,241,0.4)] border border-indigo-400/40 hover:brightness-110 active:scale-95 transition"
                  >
                    Random Pick
                  </button>
                  <button
                    onClick={() => cashout()}
                    disabled={level === 0}
                    className="w-full rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 py-2.5 sm:py-3.5 text-xs sm:text-sm font-extrabold text-slate-950 shadow-[0_0_20px_rgba(251,191,36,0.6)] border border-amber-300/70 hover:brightness-110 active:scale-95 disabled:opacity-40 transition"
                  >
                    Cashout (Rs. {(bet * currentMult).toFixed(2)})
                  </button>
                  <label className="mb-1 mt-2 flex justify-between text-[11px] font-semibold text-[#b1bad3]">
                    <span>Total profit ({currentMult.toFixed(2)}×)</span>
                    <span className="text-emerald-400 font-bold">Rs. {(bet * currentMult - bet).toFixed(2)}</span>
                  </label>
                </>
              ) : (
                <button
                  onClick={startGame}
                  disabled={(parseFloat(betInput) || 0) > balance}
                  className="w-full rounded-xl bg-gradient-to-r from-emerald-400 via-emerald-500 to-green-600 py-2.5 sm:py-3.5 text-xs sm:text-sm font-extrabold text-slate-950 shadow-[0_0_18px_rgba(16,185,129,0.5)] border border-emerald-300/60 hover:brightness-110 active:scale-95 disabled:opacity-40 transition"
                >
                  Bet
                </button>
              )}
            </div>
          </aside>

          {/* Game area */}
          <section className="relative flex flex-1 min-h-0 items-center justify-center bg-[#0f212e] p-1 sm:p-3 overflow-hidden rounded-lg">
            <div
              className="relative w-full max-w-[460px] rounded-xl border-2 sm:border-4 border-[#2f4553] bg-[#1a2c38] p-2"
              style={{ backgroundImage: "radial-gradient(circle at 50% 0%, #24414f 0%, #1a2c38 70%)" }}
            >
              <div className="mb-1.5 flex justify-center">
                <div className="rounded-t-full bg-[#2f4553] px-6 py-0.5 text-[10px] sm:text-xs font-bold text-amber-300">🐉 TOWER</div>
              </div>
              <div className="flex flex-col-reverse gap-1 sm:gap-1.5">
                {board.map((row, r) => {
                  const active = playing && r === level;
                  return (
                    <div key={r} className="flex gap-1 sm:gap-1.5">
                      {row.map((cell, c) => (
                        <button
                          key={c}
                          onClick={() => pick(r, c)}
                          disabled={!active}
                          className={`flex h-6 sm:h-8 md:h-9 flex-1 items-center justify-center rounded transition-all ${
                            cell === "egg"
                              ? "bg-[#00e701]/20 ring-2 ring-[#00e701]"
                              : cell === "dragon"
                                ? "bg-[#ff3b4e]/20 ring-2 ring-[#ff3b4e]"
                                : cell !== "hidden"
                                  ? "bg-[#213743]"
                                  : active
                                    ? "-translate-y-0.5 bg-[#557086] shadow-[0_2px_0_#2f4553] hover:bg-[#6b8aa1]"
                                    : "bg-[#2f4553] shadow-[0_2px_0_#213743]"
                          }`}
                        >
                          {cell === "hidden" && (
                            <span className={`text-[10px] sm:text-xs font-bold ${active ? "text-white" : "text-[#7c93a5]"}`}>
                              {cfg.mults[r].toFixed(2)}×
                            </span>
                          )}
                          {cell === "egg" && <Egg />}
                          {cell === "egg-dim" && <Egg dim />}
                          {cell === "dragon" && <Dragon />}
                          {cell === "dragon-dim" && <Dragon dim />}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>

              {result && result.win && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="rounded-xl border-4 border-[#00e701] bg-[#1a2c38] px-8 py-4 text-center shadow-2xl">
                    <div className="text-2xl sm:text-3xl font-extrabold text-[#00e701]">{result.mult.toFixed(2)}×</div>
                    <div className="my-1.5 h-0.5 bg-[#2f4553]" />
                    <div className="font-semibold text-sm sm:text-base text-[#00e701]">Rs. {result.amount.toFixed(2)}</div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Footer bar */}
        <div className="hidden sm:flex shrink-0 items-center justify-between rounded-b-lg border-t border-[#213743] bg-[#0f212e] px-3 py-1.5 text-xs text-[#b1bad3]">
          <span>⚙️ ⛶ 📊</span>
          <span className="font-bold text-white">Stake</span>
          <span>{playing ? `Next: ${nextMult.toFixed(2)}×` : "Fairness"}</span>
        </div>
      </main>
      <GameOverOverlay open={!!result && !endDismissed} winAmount={result?.win ? result.amount : 0} result={pool.enabled ? `Provisional claim Rs. ${(result?.amount ?? 0).toFixed(2)}. Daily pool settlement pending.` : result?.win ? `You won Rs. ${result.amount.toFixed(2)}.` : "No win"} onPlayAgain={startGame} onClose={() => setEndDismissed(true)} />
    </div>
  );
}
