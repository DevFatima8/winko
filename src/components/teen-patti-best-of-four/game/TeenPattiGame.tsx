"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveTable } from "../../teen-patti/useLiveTable";
import { isFourBrowserDeal } from "@/lib/browserCardGuards";
import { useGameBalance, usePoolLifecycle } from "@/lib/walletSync";
import "./teen-patti-best-of-four.css";
import { AnimatePresence, motion } from "framer-motion";
import {
  Club, Diamond, Heart, Info, Spade, Volume2, VolumeX, X,
} from "lucide-react";
import Chip, { CHIPS, type ChipDef } from "./Chip";
import PlayingCard, { SuitGlyph } from "./PlayingCard";
import {
  CATEGORY_NAME, dealRigged, fmtINR,
  type DealResult, type HandEval,
} from "../lib/teenpatti";
import { setSoundEnabled, sfx } from "../lib/sfx";

// ── Game config ───────────────────────────────────────────────
const START_BALANCE = 100_000;
const MIN_BET = 10;
const WIN_CHANCE = 0.35;
const LS_KEY = "tp-best-of-four-v1";

type Phase = "betting" | "dealing" | "settled";
type BannerT = { outcome: "win" | "loss"; amount: number } | null;

// ── Small pieces ──────────────────────────────────────────────

function Meter({ label, value, accent }: { label: string; value: string; accent?: "gold" | "green" }) {
  return (
    <div className="min-w-[84px] rounded-xl border border-amber-200/15 bg-black/50 px-3 py-1.5 text-center shadow-inner">
      <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-amber-100/50">{label}</div>
      <div
        key={value}
        className={`tp-pop font-display text-sm font-bold sm:text-base ${accent === "green" ? "text-emerald-300" : "text-gold"
          }`}
      >
        {value}
      </div>
    </div>
  );
}

function SidePlate({ label, win }: { label: string; win?: boolean }) {
  return (
    <div
      className={`pointer-events-none select-none rounded-full border px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.3em] transition-all duration-500 sm:text-xs ${win
        ? "border-amber-300 bg-amber-300/15 text-amber-200 shadow-[0_0_18px_rgba(233,196,106,0.45)]"
        : "border-white/15 bg-black/40 text-white/55"
        }`}
    >
      {label}
    </div>
  );
}

function EvalBadge({ ev }: { ev: HandEval }) {
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0, y: 6 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 18 }}
      className="flex items-center gap-2 rounded-full border border-amber-300/40 bg-black/65 py-1 pl-3 pr-2 shadow-[0_4px_14px_rgba(0,0,0,0.5)] backdrop-blur"
    >
      <span className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-gold sm:text-xs">
        {CATEGORY_NAME[ev.category]}
      </span>
      <span className="flex items-center gap-1">
        {ev.best.map((c) => (
          <span
            key={c.id}
            className={`flex items-center gap-px rounded bg-white/10 px-1 py-px text-[10px] font-bold ${c.suit === "H" || c.suit === "D" ? "text-rose-300" : "text-slate-200"
              }`}
          >
            {c.rank === 14 ? "A" : c.rank === 13 ? "K" : c.rank === 12 ? "Q" : c.rank === 11 ? "J" : c.rank}
            <SuitGlyph suit={c.suit} className="h-2.5 w-2.5" />
          </span>
        ))}
      </span>
    </motion.div>
  );
}

function chipBreakdown(amount: number): { def: ChipDef; count: number }[] {
  const out: { def: ChipDef; count: number }[] = [];
  let rest = amount;
  for (const def of [...CHIPS].sort((a, b) => b.value - a.value)) {
    const n = Math.floor(rest / def.value);
    if (n > 0) {
      out.push({ def, count: n });
      rest -= n * def.value;
    }
  }
  return out;
}

const RANK_ROWS: { name: string; ex: { r: string; s: "S" | "H" | "D" | "C" }[] }[] = [
  { name: "Trail / Trio", ex: [{ r: "A", s: "S" }, { r: "A", s: "H" }, { r: "A", s: "D" }] },
  { name: "Pure Sequence", ex: [{ r: "A", s: "S" }, { r: "K", s: "S" }, { r: "Q", s: "S" }] },
  { name: "Sequence", ex: [{ r: "A", s: "S" }, { r: "K", s: "H" }, { r: "Q", s: "D" }] },
  { name: "Color / Flush", ex: [{ r: "A", s: "S" }, { r: "J", s: "S" }, { r: "8", s: "S" }] },
  { name: "Pair", ex: [{ r: "A", s: "S" }, { r: "A", s: "H" }, { r: "K", s: "D" }] },
  { name: "High Card", ex: [{ r: "A", s: "S" }, { r: "K", s: "H" }, { r: "J", s: "D" }] },
];

// ── Main game ─────────────────────────────────────────────────

export default function TeenPattiGame() {
  const [balance] = useGameBalance("teen-patti-best-of-four", START_BALANCE);
  const pool = usePoolLifecycle("teen-patti-best-of-four");
  const [bet, setBet] = useState(0);
  const [phase, setPhase] = useState<Phase>("betting");
  const [round, setRound] = useState<DealResult | null>(null);
  const [dealerUp, setDealerUp] = useState(false);
  const [revealedCards, setRevealedCards] = useState(0);
  const [showPlayerEval, setShowPlayerEval] = useState(false);
  const [banner, setBanner] = useState<BannerT>(null);
  const [lastWin, setLastWin] = useState(0);
  const [history, setHistory] = useState<("W" | "L")[]>([]);
  const [rounds, setRounds] = useState(0);
  const [wins, setWins] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const roundRef = useRef(0);
  const waits = useRef<ReturnType<typeof setTimeout>[]>([]);
  const sleep = (ms: number) => new Promise<void>((resolve) => {
    waits.current.push(setTimeout(resolve, ms));
  });
  const live = useLiveTable({
    queueNextRound: false,
    phase, balance, draft: { bet }, targets: ["bet"], minBet: MIN_BET,
    start: () => { void deal(bet); }, reset: () => newBet(),
    apply: (b) => setBet(b.bet),
  });
  useEffect(() => () => {
    roundRef.current++;
    waits.current.forEach(clearTimeout);
  }, []);

  // ── persistence (localStorage — no database) ──
  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const s = JSON.parse(raw) as {
          balance?: number; history?: ("W" | "L")[]; rounds?: number; wins?: number; soundOn?: boolean;
        };
        if (Array.isArray(s.history)) setHistory(s.history);
        if (typeof s.rounds === "number") setRounds(s.rounds);
        if (typeof s.wins === "number") setWins(s.wins);
        if (typeof s.soundOn === "boolean") {
          setSoundOn(s.soundOn);
          setSoundEnabled(s.soundOn);
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ balance, history, rounds, wins, soundOn }));
    } catch { /* ignore */ }
  }, [balance, history, rounds, wins, soundOn, mounted]);

  useEffect(() => setSoundEnabled(soundOn), [soundOn]);

  // ── derived ──
  const settled = phase === "settled";
  const playerWon = settled && banner?.outcome === "win";
  const dealerWon = settled && banner?.outcome === "loss";

  const playerBest = useMemo(
    () => new Set(round?.playerEval.best.map((c) => c.id) ?? []),
    [round]
  );
  const dealerBest = useMemo(
    () => new Set(round?.dealerEval.best.map((c) => c.id) ?? []),
    [round]
  );

  const canDeal = phase === "betting" && bet >= MIN_BET && bet <= balance;
  const canRebet = settled && bet >= MIN_BET && bet <= balance;
  const broke = balance < MIN_BET && phase === "betting";

  // ── actions ──
  function addChip(v: number) {
    if (phase !== "betting") return;
    if (bet + v > balance) return;
    setBet((b) => b + v);
    sfx.chip();
  }

  function clearBet() {
    if (phase !== "betting" || bet === 0) return;
    setBet(0);
    sfx.click();
  }

  async function deal(amount: number) {
    const accepted = live.begin({ bet: amount });
    if (!accepted) return;
    amount = accepted.bet;
    setBet(amount);
    waits.current.forEach(clearTimeout);
    waits.current = [];
    const id = ++roundRef.current;
    const alive = () => roundRef.current === id;
    sfx.click();
    setPhase("dealing");
    setBanner(null);
    setLastWin(0);
    setRound(null);
    setDealerUp(false);
    setShowPlayerEval(false);
    let result: DealResult;
    if (amount > 0) {
      if (!await pool.start(amount)) { live.release(); setPhase("betting"); return; }
      const confirmed = await pool.resolveServer({});
      if (!isFourBrowserDeal(confirmed)) { live.release(); setPhase("betting"); return; }
      result = confirmed;
    } else result = dealRigged(WIN_CHANCE);
    await sleep(650); // shuffle
    if (!alive()) return;
    setRound(result);
    setRevealedCards(0);
    for (let i = 0; i < 8; i++) sfx.deal(i);

    await sleep(1150); // cards fly in (face down)
    if (!alive()) return;
    for (let i = 0; i < 4; i++) {
      setRevealedCards(i + 1);
      sfx.flip(0);
      await sleep(750);
      if (!alive()) return;
    }
    setShowPlayerEval(true);
    sfx.badge();

    await sleep(1050);
    if (!alive()) return;
    for (let i = 0; i < 4; i++) {
      setRevealedCards(i + 5);
      sfx.flip(0);
      await sleep(750);
      if (!alive()) return;
    }
    setDealerUp(true);
    await sleep(1500);
    if (!alive()) return;

    const win = result.outcome === "win";
    if (amount > 0) pool.announce();
    if (amount > 0 && win) {
      setLastWin(amount);
      sfx.win();
    } else if (amount > 0) {
      sfx.lose();
    }
    if (amount > 0) setBanner({ outcome: result.outcome, amount });
    const tag: "W" | "L" = win ? "W" : "L";
    if (amount > 0) {
      setHistory((h) => [tag, ...h].slice(0, 14));
      setRounds((r) => r + 1);
      if (win) setWins((w) => w + 1);
    }
    setPhase("settled");
  }

  function newBet() {
    if (phase === "dealing") return;
    setBet(0);
    setPhase("betting");
    setRound(null);
    setRevealedCards(0);
    setBanner(null);
    setDealerUp(false);
    setShowPlayerEval(false);
    setLastWin(0);
    sfx.click();
  }

  const status = (() => {
    if (phase === "betting") return bet > 0 ? "Press DEAL to play" : "Place your bet";
    if (phase === "dealing") {
      if (!round) return "Shuffling…";
      if (!dealerUp) return showPlayerEval ? "Dealer's turn…" : "Your best of four…";
      return "Showdown!";
    }
    if (!banner) return "Round complete — next round shortly";
    return banner.outcome === "win" ? "You take the pot!" : "Dealer takes it";
  })();

  // shared card row renderer
  function cardRow(side: "player" | "dealer") {
    const cards = round ? (side === "player" ? round.player : round.dealer) : [null, null, null, null];
    const best = side === "player" ? playerBest : dealerBest;
    const showEval = side === "player" ? showPlayerEval : dealerUp;
    const won = side === "player" ? playerWon : dealerWon;
    const lost = side === "player" ? dealerWon : playerWon;
    const evalObj = side === "player" ? round?.playerEval : round?.dealerEval;

    return (
      <div className={`flex items-center justify-center gap-1.5 sm:gap-3 ${lost ? "opacity-90" : ""}`}>
        {cards.map((c, i) => {
          if (!c) return <PlayingCard key={`empty-${side}-${i}`} card={null} faceUp={false} />;
          const isBest = best.has(c.id);
          const isCut = showEval && evalObj?.leftover?.id === c.id;
          return (
            <PlayingCard
              key={`${c.id}-${round ? "r" : ""}`}
              card={c}
              faceUp={(side === "player" ? i : i + 4) < revealedCards}
              flyDelay={(side === "player" ? i * 2 : i * 2 + 1) * 0.09}
              lift={showEval && isBest && !lost}
              cut={isCut}
              dim={lost && !isBest}
            />
          );
        })}
      </div>
    );
  }

  const stack = chipBreakdown(bet);

  return (
    <div className="tp-scope flex h-full w-full flex-col justify-between overflow-hidden px-1 sm:px-2 md:px-3 select-none">
      {/* ── Header ── */}
      <header className="z-40 border-b border-amber-200/15 bg-black/60 backdrop-blur-md rounded-b-xl">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-1 px-2 py-1">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-b from-amber-300 to-amber-600 shadow-[0_0_12px_rgba(233,196,106,0.5)]">
              <Spade className="h-4 w-4 text-[#2a0a0e]" fill="currentColor" strokeWidth={0} />
            </div>
            <div className="leading-tight">
              <div className="font-display text-xs sm:text-sm font-extrabold tracking-wider text-gold">
                TEEN PATTI <span className="text-[10px] text-amber-200/70 font-normal">Best of 4</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
            <Meter label="Balance" value={fmtINR(balance)} />
            <Meter label="Bet" value={fmtINR(bet)} />
            <Meter label="Won" value={fmtINR(lastWin)} accent="green" />
            <button
              type="button"
              onClick={() => { setSoundOn((s) => !s); }}
              className="tp-icon-btn"
              aria-label="Toggle sound"
            >
              {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            </button>
            <button type="button" onClick={() => setRulesOpen(true)} className="tp-icon-btn" aria-label="Hand rankings">
              <Info className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Table ── */}
      {live.controls}
      <main className="tp-main relative flex flex-1 min-h-0 items-stretch justify-center px-0.5 py-1 sm:px-2 overflow-hidden">
        <div className="tp-table-frame relative mx-auto flex w-full max-w-4xl flex-col h-full overflow-hidden p-1 sm:p-2 rounded-2xl">
          <div className="tp-felt relative flex flex-1 flex-col justify-between gap-1 overflow-hidden rounded-xl sm:rounded-2xl px-2 py-2 sm:px-6">
            {/* felt print */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-1/2 top-1/2 h-[130%] w-[110%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-amber-200/10" />
              <div className="absolute left-1/2 top-1/2 h-[95%] w-[88%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-amber-200/15" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none whitespace-nowrap font-display text-[11vw] font-black tracking-[0.3em] text-amber-100/[0.045] sm:text-7xl">
                TEEN PATTI
              </div>
            </div>

            {/* deck */}
            <div className={`absolute right-4 top-5 sm:right-8 ${phase === "dealing" && !round ? "tp-shuffling" : ""}`}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="absolute rounded-lg border border-amber-200/40 bg-gradient-to-br from-[#6d1620] to-[#3d0b12] shadow-md"
                  style={{
                    width: 34, height: 47,
                    transform: `translate(${-i * 3}px, ${-i * 3}px) rotate(${(i - 1) * 4}deg)`,
                  }}
                >
                  <div className="tp-back-pattern h-full w-full rounded-lg opacity-80" />
                </div>
              ))}
              <div style={{ width: 34, height: 47 }} />
            </div>

            {/* DEALER */}
            <div className="relative z-10 flex flex-col items-center gap-2">
              <SidePlate label="Dealer" win={dealerWon} />
              {cardRow("dealer")}
              <div className="flex h-9 items-center">
                {dealerUp && round ? (
                  <EvalBadge ev={round.dealerEval} />
                ) : (
                  <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-100/25">
                    {round && !dealerUp ? "• • • •" : ""}
                  </span>
                )}
              </div>
            </div>

            {/* CENTER — bet spot */}
            <div className="relative z-10 flex flex-col items-center gap-1.5 py-1">
              <button
                type="button"
                onClick={() => phase === "betting" && canDeal && deal(bet)}
                className="group relative grid h-24 w-24 place-items-center rounded-full border-2 border-dashed border-amber-200/40 bg-black/25 shadow-[inset_0_0_28px_rgba(0,0,0,0.6)] transition sm:h-28 sm:w-28"
                aria-label="Bet spot"
              >
                {bet > 0 ? (
                  <div className="flex flex-col items-center">
                    <div className="flex -space-x-4">
                      {stack.slice(0, 3).map(({ def, count }, i) => (
                        <div key={def.value} className="relative" style={{ transform: `translateY(${-i * 4}px)` }}>
                          <Chip def={def} bare size={34} />
                          {count > 1 && (
                            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-amber-300 px-0.5 text-[9px] font-black text-black">
                              {count}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    <span className="mt-1 font-display text-xs font-bold text-gold sm:text-sm">{fmtINR(bet)}</span>
                  </div>
                ) : (
                  <span className="px-3 text-center text-[9px] font-bold uppercase leading-relaxed tracking-[0.25em] text-amber-100/40">
                    Place<br />Bet
                  </span>
                )}
                <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-amber-100/10" />
              </button>
              <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-100/70 sm:text-xs">
                {status}
              </div>
              <div className="text-[9px] uppercase tracking-[0.25em] text-amber-100/35">
                min {fmtINR(MIN_BET)} · pays 1 : 1
              </div>
            </div>

            {/* PLAYER */}
            <div className="relative z-10 flex flex-col items-center gap-2">
              <div className="flex h-9 items-center">
                {showPlayerEval && round ? (
                  <EvalBadge ev={round.playerEval} />
                ) : (
                  <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-100/25">
                    {phase === "dealing" && round ? "your best 3 of 4" : ""}
                  </span>
                )}
              </div>
              {cardRow("player")}
              <SidePlate label="You" win={playerWon} />
            </div>

          </div>
        </div>
      </main>

      {/* ── History strip ── */}
      <div className="border-t border-amber-200/10 bg-black/45">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-1.5">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span className="mr-1 shrink-0 text-[9px] font-bold uppercase tracking-[0.25em] text-amber-100/40">
              Last rounds
            </span>
            {history.length === 0 && (
              <span className="text-[10px] text-white/25">—</span>
            )}
            {history.map((h, i) => (
              <span
                key={i}
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-black ${h === "W"
                  ? "bg-gradient-to-b from-amber-300 to-amber-600 text-[#2a1200]"
                  : "bg-gradient-to-b from-rose-500 to-rose-800 text-rose-50"
                  } ${i === 0 ? "ring-2 ring-white/40" : "opacity-80"}`}
              >
                {h}
              </span>
            ))}
          </div>
          <div className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-100/40">
            {rounds > 0 ? `${rounds} rounds` : "first round!"}
          </div>
        </div>
      </div>

      {/* ── Controls ── */}
      <footer className="z-40 border-t border-amber-200/15 bg-gradient-to-b from-[#160b08] to-black rounded-t-xl">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-1.5 px-2 py-1.5 sm:flex-row sm:justify-between sm:gap-4 sm:px-4">
          {/* chips */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2.5">
            {CHIPS.map((def) => (
              <Chip
                key={def.value}
                def={def}
                size={52}
                disabled={phase !== "betting" || bet + def.value > balance}
                onClick={addChip}
              />
            ))}
            <input
              type="number"
              min={10}
              value={bet || ""}
              placeholder="Custom"
              aria-label="Custom bet amount"
              disabled={phase !== "betting"}
              onChange={(e) =>
                setBet(Math.min(balance, Math.max(0, Math.floor(Number(e.target.value) || 0))))
              }
              className="h-10 w-20 rounded-lg border border-amber-200/30 bg-black/50 text-center text-sm font-bold text-amber-200 disabled:opacity-40"
            />
          </div>

          {/* bet + actions */}
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <div className="flex items-center gap-2 rounded-full border border-amber-200/20 bg-black/50 py-1.5 pl-4 pr-1.5">
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-amber-100/50">Bet</span>
              <span key={bet} className="tp-pop min-w-16 text-right font-display text-lg font-extrabold text-gold">
                {fmtINR(bet)}
              </span>
              <button
                type="button"
                onClick={clearBet}
                disabled={phase !== "betting" || bet === 0}
                className="grid h-7 w-7 place-items-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                aria-label="Clear bet"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {broke ? (
              <p className="text-sm text-amber-200">Insufficient balance.</p>
            ) : phase === "settled" ? (
              <>
                <button type="button" onClick={newBet} className="tp-btn-ghost">
                  Change Bet
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!canRebet) return;
                    const repeat = bet;
                    newBet();
                    setBet(repeat);
                  }}
                  disabled={!canRebet}
                  className="tp-btn-gold"
                >
                  Rebet &amp; Deal
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => canDeal && deal(bet)}
                disabled={!canDeal}
                className="tp-btn-gold min-w-32"
              >
                {phase === "dealing" ? "Dealing…" : "Deal"}
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* ── Rules modal ── */}
      <AnimatePresence>
        {rulesOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={() => setRulesOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 22 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-3xl border border-amber-200/25 bg-[#120a07] p-6 shadow-2xl"
            >
              <div className="mb-1 flex items-center justify-between">
                <h2 className="font-display text-lg font-extrabold tracking-[0.15em] text-gold">
                  HAND RANKINGS
                </h2>
                <button
                  type="button"
                  onClick={() => setRulesOpen(false)}
                  className="text-white/40 transition hover:text-white"
                  aria-label="Close rules"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mb-4 text-[11px] leading-relaxed text-amber-100/50">
                Four cards are dealt — your strongest 3-card hand plays. Sequence order: A-K-Q &gt; A-2-3 &gt; K-Q-J …
                Win pays 1 : 1.
              </p>
              <div className="space-y-1.5">
                {RANK_ROWS.map((row, i) => (
                  <div
                    key={row.name}
                    className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-300/15 text-[10px] font-black text-amber-300">
                        {i + 1}
                      </span>
                      <span className="text-sm font-bold text-amber-50">{row.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {row.ex.map((c, j) => (
                        <span
                          key={j}
                          className={`flex items-center gap-0.5 rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-bold ${c.s === "H" || c.s === "D" ? "text-rose-300" : "text-slate-200"
                            }`}
                        >
                          {c.r}
                          <SuitGlyph suit={c.s} className="h-3 w-3" />
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
