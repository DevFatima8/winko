"use client";
import { useLiveTable } from "../teen-patti/useLiveTable";
import { gameSfx } from "@/lib/gameSfx";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import { makeRound, type Card, type Round, type Side } from "./lib/hukam";

const SUITS = ["♠", "♥", "♣", "♦"];
const RN: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };
const rankName = (r: number) => RN[r] ?? String(r);
const HAND_NAMES = ["", "High Card", "Pair", "Color", "Sequence", "Pure Sequence", "Trail"];
const PAYOUT = 1.98;
const BET_TIME = 12;
const CHIPS = BET_PRESETS;
const CHIP_COLORS: Record<number, string> = {
  50: "from-emerald-400 to-emerald-700",
  100: "from-rose-400 to-rose-700",
  200: "from-sky-400 to-sky-700",
  500: "from-violet-400 to-violet-700",
  1000: "from-amber-300 to-amber-600",
};

function CardView({ c, show, hukam, delay = 0 }: { c?: Card; show: boolean; hukam?: number; delay?: number }) {
  const red = c && (c.s === 1 || c.s === 3);
  const wild = c && hukam === c.r;
  return (
    <div className="h-[56px] w-[40px] sm:h-[76px] sm:w-[54px] [perspective:600px]">
      <div
        className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]"
        style={{ transform: show ? "rotateY(180deg)" : "none", transitionDelay: `${delay}ms` }}
      >
        <div className="absolute inset-0 rounded-md border-2 border-white bg-[repeating-linear-gradient(45deg,#7f1d1d_0_6px,#991b1b_6px_12px)] shadow-lg [backface-visibility:hidden]" />
        <div
          className={`absolute inset-0 flex flex-col justify-between rounded-md bg-white p-1 shadow-lg [backface-visibility:hidden] [transform:rotateY(180deg)] ${red ? "text-red-600" : "text-black"
            } ${wild ? "ring-4 ring-yellow-400" : ""}`}
        >
          {c && (
            <>
              <div className="text-sm font-bold leading-none sm:text-base">
                {rankName(c.r)}
                <div>{SUITS[c.s]}</div>
              </div>
              <div className="self-center text-2xl sm:text-3xl">{SUITS[c.s]}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

type Phase = "betting" | "dealing" | "result";

export default function Game() {
  const [balance, setBalance] = useGameBalance("teen-patti-hukam", 10000);
  const pool = usePoolLifecycle("teen-patti-hukam");
  const [chip, setChip] = useState(100);
  const [bets, setBets] = usePoolRoundState<{ A: number; B: number }>("teen-patti-hukam", "bets", { A: 0, B: 0 });
  const [phase, setPhase] = useState<Phase>("betting");
  const [timer, setTimer] = useState(BET_TIME);
  const [round, setRound] = useState<Round | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [history, setHistory] = useState<Side[]>([]);
  const [msg, setMsg] = useState<{ text: string; win: boolean } | null>(null);
  const [roundNo, setRoundNo] = useState(() => 100000 + Math.floor(Math.random() * 900000));
  const betsRef = useRef(bets);
  betsRef.current = bets;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const live = useLiveTable({
    queueNextRound: false,
    phase, balance, draft: bets, targets: ["A", "B"], prepaid: true, autoStart: false,
    start: () => deal(),
    apply: async (b) => { pool.checkpoint({ bets: b }); if (b.A + b.B > 0 && !await pool.stake(b.A + b.B)) return; setBets(b); betsRef.current = b; },
  });

  const deal = useCallback(async () => {
    if (pool.busy) return;
    if (!live.begin()) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    gameSfx.deal();
    const b = betsRef.current;
    setPhase("dealing");
    const r = b.A + b.B > 0
      ? await pool.resolveServer({ bets: b }) as (Round & { payout: number }) | null
      : { ...makeRound(), payout: 0 };
    if (!r) { live.release(); setTimer(BET_TIME); setPhase("betting"); return; }
    setRound(r);
    setPhase("dealing");
    setRevealed(0);
    const steps = 7;
    for (let i = 1; i <= steps; i++) later(() => { setRevealed(i); gameSfx.flip(); }, i * 850);
    later(async () => {
      const won = r.payout;
      const total = b.A + b.B;
      if (total > 0) pool.announce();
      if (won > 0) gameSfx.win(); else if (total > 0) gameSfx.lose();
      setMsg(total === 0 ? null : pool.enabled ? { text: `Daily payout pending — provisional claim Rs. ${won.toFixed(0)}`, win: won > 0 } : won > 0 ? { text: `You Win Rs. ${won.toFixed(0)}`, win: true } : { text: "No win", win: false });
      setHistory((h) => [r.winner, ...h].slice(0, 20));
      setPhase("result");
    }, steps * 850 + 1600);
    later(() => {
      setBets({ A: 0, B: 0 });
      setRound(null);
      setMsg(null);
      setRevealed(0);
      setRoundNo((n) => n + 1);
      setTimer(BET_TIME);
      setPhase("betting");
    }, steps * 850 + 5100);
  }, []);

  useEffect(() => {
    if (phase !== "betting") return;
    if (timer > 0) { if (timer <= 3) gameSfx.tickUrgent(); else gameSfx.tick(); }
    if (timer <= 0) {
      deal();
      return;
    }
    const t = setTimeout(() => setTimer((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, timer, deal]);

  const placeBet = async (side: Side) => {
    if (phase !== "betting" || timer < 1) return;
    gameSfx.chip();
    if (balance < chip || chip <= 0) return;
    pool.checkpoint({ bets: { ...bets, [side]: bets[side] + chip } });
    if (!await pool.stake(chip)) return;
    setBets((b) => ({ ...b, [side]: b[side] + chip }));
  };
  const clearBets = async () => {
    if (phase !== "betting") return;
    if (bets.A + bets.B > 0 && !await pool.refund()) return;
    setBets({ A: 0, B: 0 });
  };

  const handLabel = (sc?: number[]) => (sc ? HAND_NAMES[sc[0]] : "");

  return (
    <main className="h-full w-full overflow-hidden bg-[#0b0f1a] text-white flex flex-col justify-between px-1 sm:px-2 md:px-3 select-none">
      {live.controls}
      <div className="mx-auto flex h-full w-full max-w-xl flex-col justify-between py-1">
        {/* Header */}
        <header className="flex items-center justify-between bg-gradient-to-r from-[#3b0a0a] via-[#7a1010] to-[#3b0a0a] px-3 py-1.5 rounded-xl shadow-md">
          <div>
            <div className="text-base font-extrabold tracking-wide text-yellow-300">TEEN PATTI HUKAM</div>
            <div className="text-[9px] text-yellow-100/70">Round #{roundNo}</div>
          </div>
          <div className="rounded-full border border-yellow-400/60 bg-black/60 px-3 py-0.5 text-xs font-bold text-yellow-300 shadow-[0_0_12px_rgba(250,204,21,0.25)]">
            Rs. {balance.toLocaleString()}
          </div>
        </header>

        {/* Table */}
        <section className="relative my-1 overflow-hidden rounded-xl sm:rounded-2xl border-2 sm:border-4 border-[#a0702a] bg-[radial-gradient(ellipse_at_center,#1f7a3a_0%,#0e4d22_60%,#06301a_100%)] p-2 shadow-[inset_0_0_30px_rgba(0,0,0,0.6)] flex-1 min-h-0 flex flex-col justify-between">
          {/* Timer */}
          <div className="absolute right-2 top-2 flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full border-2 border-yellow-400 bg-black/70 text-xs sm:text-sm font-bold shadow-[0_0_10px_rgba(250,204,21,0.4)]">
            {phase === "betting" ? timer : "⏳"}
          </div>
          <div className="text-center text-[11px] font-semibold uppercase tracking-wider text-yellow-200/80">
            {phase === "betting" ? "Place your bets" : phase === "dealing" ? "Dealing..." : "Result"}
          </div>

          {/* Hukam */}
          <div className="flex flex-col items-center">
            <div className="mb-0.5 rounded bg-yellow-400 px-2 text-[9px] font-extrabold text-black">HUKAM (WILD)</div>
            <CardView c={round?.hukam} show={revealed >= 1} />
          </div>

          {/* Players */}
          <div className="grid grid-cols-2 gap-2 my-1">
            {(["A", "B"] as Side[]).map((side, si) => {
              const cards = side === "A" ? round?.a : round?.b;
              const sc = side === "A" ? round?.sa : round?.sb;
              const isWin = phase === "result" && round?.winner === side;
              return (
                <div
                  key={side}
                  className={`rounded-xl border p-1 sm:p-2 text-center transition ${isWin ? "border-yellow-300 bg-yellow-300/20 shadow-[0_0_20px_rgba(250,204,21,0.6)]" : "border-white/20 bg-black/30"
                    }`}
                >
                  <div className={`mb-1 text-xs font-bold ${side === "A" ? "text-sky-300" : "text-rose-300"}`}>Player {side}</div>
                  <div className="flex justify-center gap-1">
                    {[0, 1, 2].map((i) => (
                      <CardView key={i} c={cards?.[i]} hukam={round?.hukam.r} show={revealed >= 2 + i * 2 + si} />
                    ))}
                  </div>
                  <div className="mt-0.5 h-3.5 text-[10px] text-yellow-200">{phase === "result" ? handLabel(sc) : ""}</div>
                  {isWin && <div className="text-[10px] font-extrabold text-yellow-300">WINNER</div>}
                </div>
              );
            })}
          </div>

        </section>

        {/* History */}
        <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-black/50 px-2 py-1 my-0.5">
          <span className="mr-1 text-[9px] text-white/60">LAST:</span>
          {history.length === 0 && <span className="text-[10px] text-white/40">—</span>}
          {history.slice(-10).map((h, i) => (
            <span
              key={i}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${h === "A" ? "bg-sky-500 shadow-[0_0_6px_rgba(14,165,233,0.5)]" : "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.5)]"
                }`}
            >
              {h}
            </span>
          ))}
        </div>

        {/* Bet boxes */}
        <div className="grid grid-cols-2 gap-2 my-1">
          {(["A", "B"] as Side[]).map((side) => (
            <button
              key={side}
              onClick={() => placeBet(side)}
              disabled={phase !== "betting"}
              className={`rounded-xl border p-2 text-center transition active:scale-95 disabled:opacity-60 ${side === "A"
                  ? "border-sky-400 bg-gradient-to-b from-sky-600 via-sky-700 to-sky-950 shadow-[0_0_15px_rgba(56,189,248,0.35)] hover:brightness-110"
                  : "border-rose-400 bg-gradient-to-b from-rose-600 via-rose-700 to-rose-950 shadow-[0_0_15px_rgba(244,63,94,0.35)] hover:brightness-110"
                }`}
            >
              <div className="text-sm sm:text-base font-extrabold tracking-wide">PLAYER {side}</div>
              <div className="text-[10px] text-white/70">1 : {PAYOUT}</div>
              <div className="mt-0.5 text-xs font-bold text-yellow-300">Rs. {bets[side]}</div>
            </button>
          ))}
        </div>

        {/* Chips */}
        <div className="flex flex-wrap items-center justify-between gap-1 rounded-xl bg-gradient-to-r from-[#3b0a0a] to-[#1a0505] p-1.5 my-0.5">
          {CHIPS.map((c) => (
            <button
              key={c}
              onClick={() => setChip(c)}
              className={`flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full border-2 border-dashed border-white/80 bg-gradient-to-b text-[10px] sm:text-xs font-extrabold shadow-md transition ${CHIP_COLORS[c]} ${chip === c ? "-translate-y-1 ring-2 ring-yellow-300 shadow-[0_0_10px_rgba(250,204,21,0.5)]" : ""
                }`}
            >
              {c >= 1000 ? `${c / 1000}K` : c}
            </button>
          ))}
          <input
            type="number"
            min={10}
            value={chip || ""}
            placeholder="Custom"
            aria-label="Custom bet amount"
            onChange={(e) => setChip(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            className="h-9 w-20 rounded-lg border border-yellow-400/50 bg-black/60 text-center text-xs font-bold text-yellow-300"
          />
        </div>
        <div className="flex gap-2 my-1">
          <button
            onClick={clearBets}
            disabled={phase !== "betting"}
            className="flex-1 rounded-lg bg-gradient-to-r from-rose-600 to-red-700 py-1.5 text-xs font-black uppercase text-white shadow-[0_0_12px_rgba(244,63,94,0.35)] transition active:scale-95 disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </div>
    </main>
  );
}
