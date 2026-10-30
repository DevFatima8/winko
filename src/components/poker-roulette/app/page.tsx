"use client";
import { useLiveTable } from "../../teen-patti/useLiveTable";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGameBalance, usePoolLifecycle } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import type { BrowserPokerRouletteOutcome } from "@/lib/browserRouletteOutcome";
import { validateBrowserRouletteSelection } from "@/lib/browserRouletteSelection";
import {
  CATEGORY_NAMES,
  CATEGORY_ODDS,
  CAT_PAIR,
  CAT_QUADS,
  CAT_ROYAL,
  CardData,
  dealRound,
} from "../lib/poker";
import PlayingCard from "../components/PlayingCard";
import Chip, { CHIP_DENOMS } from "../components/Chip";
import BettingSpot from "../components/BettingSpot";
import Confetti from "../components/Confetti";
import { sfx } from "../lib/sounds";

type Phase = "betting" | "dealing" | "result";

const SPOT_ORDER = [9, 8, 7, 6, 5, 4, 3, 2, 1]; // Royal Flush -> Pair
const DEAL_STEP_MS = 340;
const REVEAL_TOTAL_MS = DEAL_STEP_MS * 5 + 650;

const PLACEHOLDER_HAND: CardData[] = [
  { rank: 2, suit: 0 },
  { rank: 2, suit: 0 },
  { rank: 2, suit: 0 },
  { rank: 2, suit: 0 },
  { rank: 2, suit: 0 },
];

const LS_BALANCE = "poker-roulette-balance";
const LS_STATS = "poker-roulette-stats";

interface RoundResult {
  category: number;
  payout: number;
  winners: number[];
}

function loadNumber(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

export default function HomePage() {
  const [balance] = useGameBalance("poker-roulette", 1000);
  const pool = usePoolLifecycle("poker-roulette");
  const [bets, setBets] = useState<Record<number, number>>({});
  const [chip, setChip] = useState<number>(BET_PRESETS[0]);
  const [phase, setPhase] = useState<Phase>("betting");
  const [hand, setHand] = useState<CardData[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [stats, setStats] = useState<{ played: number; won: number }>({ played: 0, won: 0 });
  const [lastBets, setLastBets] = useState<Record<number, number>>({});
  const [muted, setMuted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [roundId, setRoundId] = useState(0);
  const [showStatsModal, setShowStatsModal] = useState(false);

  const timerRef = useRef<number | null>(null);
  const animationTimers = useRef<number[]>([]);
  const pendingRound = useRef<Record<number, number> | null>(null);
  const acceptedRound = useRef(false);
  const roundLock = useRef(false);
  const live = useLiveTable({
    phase, balance, draft: bets, targets: Object.keys(CATEGORY_ODDS),
    start: () => startRound(bets), reset: () => newBet(), apply: setBets,
    // Hands keep dealing without a wager, but bets open only between hands.
    queueNextRound: false,
  });

  // Hydrate balance + stats from localStorage (client-side only, no database).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_STATS);
      if (raw) {
        const parsed = JSON.parse(raw) as { played?: unknown; won?: unknown };
        if (Number.isFinite(parsed.played) && Number.isFinite(parsed.won)) {
          setStats({ played: Number(parsed.played), won: Number(parsed.won) });
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_BALANCE, String(balance));
    } catch {
      /* ignore */
    }
  }, [balance]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_STATS, JSON.stringify(stats));
    } catch {
      /* ignore */
    }
  }, [stats]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      animationTimers.current.forEach(clearTimeout);
    };
  }, []);

  const totalBet = useMemo(() => Object.values(bets).reduce((s, v) => s + v, 0), [bets]);
  const betCats = useMemo(
    () => Object.keys(bets).map(Number).filter((c) => (bets[c] ?? 0) > 0),
    [bets],
  );
  const lastTotal = useMemo(() => Object.values(lastBets).reduce((s, v) => s + v, 0), [lastBets]);

  const spotOutcome = useCallback(
    (cat: number): "win" | "lose" | null => {
      if (phase !== "result" || !result) return null;
      if (!(cat in bets)) return null;
      return result.winners.includes(cat) ? "win" : "lose";
    },
    [phase, result, bets],
  );

  const placeBet = (cat: number) => {
    if (phase !== "betting") return;
    if (roundLock.current || pendingRound.current) {
      setNotice("Round in progress — bet after this hand finishes.");
      return;
    }
    setNotice(null);
    if (totalBet + chip > balance) {
      setNotice("Insufficient balance — pick a smaller chip.");
      return;
    }
    setBets((b) => ({ ...b, [cat]: (b[cat] ?? 0) + chip }));
    if (!muted) sfx.chip();
  };

  const startRound = useCallback(
    async (activeBets: Record<number, number>) => {
      if (phase !== "betting" || roundLock.current) return;
      const accepted = pendingRound.current ?? live.begin(activeBets);
      if (!accepted) return;
      roundLock.current = true;
      activeBets = accepted;

      const cats = Object.keys(activeBets)
        .map(Number)
        .filter((c) => (activeBets[c] ?? 0) > 0);
      const total = Math.round(cats.reduce((s, c) => s + (activeBets[c] ?? 0), 0) * 100) / 100;

      animationTimers.current.forEach(clearTimeout);
      animationTimers.current = [];

      let round: Pick<BrowserPokerRouletteOutcome, "cards" | "category">;
      let winners: number[] = [];
      let payout = 0;
      if (total > 0) {
        const snapshot = Object.fromEntries(cats.map(cat => [String(cat), activeBets[cat]]));
        const selection = { bets: snapshot };
        try { validateBrowserRouletteSelection("poker-roulette", total, selection); }
        catch (error) {
          setNotice(error instanceof Error ? error.message : "Invalid roulette allocation.");
          roundLock.current = false; live.release(); return;
        }
        pendingRound.current = { ...activeBets };
        if (!acceptedRound.current && !await pool.start(total, () => {}, selection)) {
          roundLock.current = false; live.release(); return;
        }
        acceptedRound.current = true;
        const resolved = await pool.resolveServer(selection) as BrowserPokerRouletteOutcome | null;
        if (!resolved) {
          setNotice("Result pending — retry the same wager.");
          roundLock.current = false; live.release(); return;
        }
        round = resolved;
        winners = resolved.winners;
        payout = resolved.payout;
        pendingRound.current = null;
        acceptedRound.current = false;
      } else round = dealRound([]);
      setBets(activeBets);
      if (total > 0) setLastBets(activeBets);
      setNotice(null);

      setResult(null);
      setHand(round.cards);
      setRevealed(false);
      setRoundId((id) => id + 1);
      setPhase("dealing");

      // Flip the cards on the next paint so the dealing animation is visible.
      animationTimers.current.push(window.setTimeout(() => setRevealed(true), 80));
      for (let i = 0; i < 5; i++) {
        animationTimers.current.push(window.setTimeout(() => {
          if (!muted) sfx.flip();
        }, 140 + i * DEAL_STEP_MS));
      }

      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(async () => {
        if (total > 0) pool.announce();
        setResult({ category: round.category, payout, winners });
        if (total > 0) setStats((s) => ({ played: s.played + 1, won: s.won + (payout > 0 ? 1 : 0) }));
        setPhase("result");
        roundLock.current = false;
        if (total > 0 && !muted) {
          if (payout > 0) {
            if (round.category >= CAT_QUADS) sfx.bigWin();
            else sfx.win();
          } else {
            sfx.lose();
          }
        }
      }, REVEAL_TOTAL_MS);
    },
    [phase, balance, muted, live],
  );

  const deal = useCallback(() => startRound(bets), [startRound, bets]);

  const clearBets = () => {
    if (phase !== "betting" || roundLock.current || pendingRound.current) return;
    setBets({});
    setNotice(null);
    if (!muted) sfx.click();
  };

  const newBet = () => {
    if (phase === "dealing") return;
    setBets({});
    setResult(null);
    setHand(null);
    setRevealed(false);
    setPhase("betting");
    setNotice(null);
    if (!muted) sfx.click();
  };

  const primaryDisabled =
    phase === "dealing" || (phase === "result" && (lastTotal <= 0 || lastTotal > balance));

  const primaryAction = () => {
    if (phase === "betting") {
      deal();
      return;
    }
    if (phase === "result") {
      newBet();
      setBets(lastBets);
    }
  };

  const showConfetti =
    phase === "result" &&
    !!result &&
    result.payout > 0 &&
    (result.payout >= Math.max(totalBet, 1) * 4 || result.category >= CAT_QUADS);

  return (
    <main className="felt-bg h-full w-full overflow-hidden text-white flex flex-col justify-between px-1 sm:px-2 md:px-3 py-1 select-none">
      {live.controls}
      <p className="shrink-0 text-center text-[10px] text-emerald-100/80">Server results · 10 winning slots per 100 distinct players · standard category returns summed, then capped at 2x total stake gross (stake included).</p>
      <Confetti show={showConfetti} />

      <div className="mx-auto w-full max-w-5xl h-full flex flex-col justify-between overflow-hidden">
        {/* ---------- header ---------- */}
        <header className="flex items-center justify-between gap-1.5 sm:gap-3 shrink-0 py-0.5">
          <div>
            <h1 className="gold-text text-base sm:text-xl font-black tracking-[0.14em] leading-tight">
              POKER ROULETTE
            </h1>
            <p className="hidden xs:block text-[8px] sm:text-[9px] uppercase tracking-[0.2em] text-emerald-100/70">
              5 Cards · Equal or Better Wins
            </p>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <div className="stat-box !py-0.5 !px-1.5 sm:!py-1 sm:!px-2">
              <span className="stat-label">Balance</span>
              <span className="stat-value text-xs sm:text-sm font-black">Rs. {balance.toLocaleString()}</span>
            </div>
            <div className="stat-box !py-0.5 !px-1.5 sm:!py-1 sm:!px-2">
              <span className="stat-label">Total Bet</span>
              <span className={`stat-value text-xs sm:text-sm font-black ${totalBet > 0 ? "text-amber-300" : ""}`}>
                Rs. {totalBet.toLocaleString()}
              </span>
            </div>
            {result && result.payout > 0 && (
              <div className="stat-box !py-0.5 !px-1.5 sm:!py-1 sm:!px-2 hidden xs:flex">
                <span className="stat-label">Win</span>
                <span className="stat-value text-xs sm:text-sm font-black text-emerald-300">
                  +Rs. {result.payout.toLocaleString()}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowStatsModal(true)}
              className="btn-ghost !px-2 !py-1 text-[10px] font-semibold"
              title="Session Statistics"
            >
              Stats
            </button>
            <button
              type="button"
              onClick={() => {
                setMuted((m) => !m);
                if (!muted) sfx.click();
              }}
              className="btn-ghost !px-2 !py-1 text-[10px]"
              aria-label={muted ? "Unmute sounds" : "Mute sounds"}
            >
              {muted ? "🔇" : "🔊"}
            </button>
          </div>
        </header>

        {notice && (
          <div className="my-0.5 shrink-0 rounded-lg border border-amber-300/40 bg-amber-400/10 px-2 py-1 text-center text-xs font-semibold text-amber-200">
            {notice}
          </div>
        )}

        {/* ---------- dealer table ---------- */}
        <section className="table-panel my-0.5 p-1.5 sm:p-2.5 shrink-0 flex flex-col justify-center">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-100/80">
              Dealer
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.14em] ${
                phase === "result" && result
                  ? result.payout > 0
                    ? "bg-emerald-400/20 text-emerald-300"
                    : "bg-rose-500/15 text-rose-300"
                  : "bg-white/5 text-white/50"
              }`}
            >
              {phase === "result" && result
                ? result.payout > 0
                  ? `Winner · ${CATEGORY_NAMES[result.category]}`
                  : `Hand · ${CATEGORY_NAMES[result.category]}`
                : phase === "dealing"
                  ? "Dealing…"
                  : "Place your bets"}
            </span>
          </div>

          <div className="my-1 grid grid-cols-5 gap-1.5 sm:gap-2.5 max-w-sm sm:max-w-md mx-auto w-full">
            {(hand ?? PLACEHOLDER_HAND).map((c, i) => (
              <PlayingCard
                key={hand ? `round-${roundId}-${i}` : `slot-${i}`}
                card={c}
                revealed={revealed}
                flipDelay={i * DEAL_STEP_MS}
              />
            ))}
          </div>

          <div className="h-5 sm:h-6 flex items-center justify-center">
            {phase === "result" && totalBet > 0 && result && (
              result.payout > 0 ? (
                <div className="win-banner text-sm sm:text-base font-black">
                  {pool.enabled ? `Daily payout pending — provisional claim Rs. ${result.payout.toLocaleString()}` : `WINNER! +Rs. ${result.payout.toLocaleString()}`}
                </div>
              ) : (
                <div className="lose-banner text-[10px] sm:text-xs">
                  {pool.enabled ? "Daily payout pending — provisional claim Rs. 0" : "No win"}
                </div>
              )
            )}
          </div>
        </section>

        {/* ---------- betting board ---------- */}
        <section className="table-panel my-0.5 p-1.5 sm:p-2 flex-1 min-h-0 flex flex-col justify-around">
          <div className="mb-1 flex items-center justify-between gap-1 shrink-0">
            <h2 className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-100/80">
              Betting Board
            </h2>
            <span className="text-[8px] sm:text-[9px] uppercase tracking-wider text-white/40">
              Wins on equal or higher rank
            </span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-1 sm:gap-1.5 w-full">
            {SPOT_ORDER.map((cat) => (
              <BettingSpot
                key={cat}
                category={cat}
                bet={bets[cat] ?? 0}
                phase={phase}
                outcome={spotOutcome(cat)}
                onPlaceBet={placeBet}
              />
            ))}
          </div>
        </section>

        {/* ---------- controls ---------- */}
        <section className="table-panel my-0.5 p-1.5 sm:p-2 shrink-0 flex flex-col xs:flex-row items-center justify-between gap-1.5 sm:gap-3">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-[9px] font-bold uppercase tracking-wider text-white/50">
              Chip
            </span>
            <div className="flex items-center gap-1 sm:gap-1.5">
              {CHIP_DENOMS.map((d) => (
                <Chip
                  key={d}
                  value={d}
                  selected={chip === d}
                  disabled={phase === "dealing"}
                  size="sm"
                  onClick={() => {
                    setChip(d);
                    if (!muted) sfx.click();
                  }}
                />
              ))}
              <input
                type="number"
                min={10}
                inputMode="numeric"
                value={chip || ""}
                disabled={phase === "dealing"}
                onChange={(e) => setChip(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
                aria-label="Custom chip amount"
                placeholder="Rs."
                className="w-16 rounded-md border border-white/25 bg-black/40 px-1.5 py-1 text-[11px] font-bold text-white outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 w-full xs:w-auto justify-end">
            <button
              type="button"
              onClick={phase === "result" ? newBet : clearBets}
              disabled={phase === "dealing" || (phase === "result" ? false : totalBet === 0)}
              className={phase === "result" ? "btn-new-bet" : "btn-clear"}
            >
              {phase === "result" ? "New Bet" : "Clear"}
            </button>
            <button
              type="button"
              onClick={primaryAction}
              disabled={phase === "betting" ? totalBet <= 0 : primaryDisabled}
              className="btn-gold min-w-[130px] sm:min-w-[170px]"
            >
              {phase === "betting"
                ? `Deal${totalBet > 0 ? ` · Rs. ${totalBet.toLocaleString()}` : ""}`
                : phase === "dealing"
                  ? "Dealing…"
                  : `Rebet · Rs. ${lastTotal.toLocaleString()}`}
            </button>
          </div>
        </section>

        {/* ---------- Stats Modal ---------- */}
        {showStatsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-gradient-to-b from-[#0c4028] to-[#042416] p-4 text-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
                <h3 className="font-bold text-base">Session Statistics</h3>
                <button
                  type="button"
                  onClick={() => setShowStatsModal(false)}
                  className="rounded-lg bg-white/10 px-2 py-1 text-xs font-bold text-white/70 hover:bg-white/20"
                >
                  ✕ Close
                </button>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-black/40 p-2">
                    <div className="text-lg font-black">{stats.played}</div>
                    <div className="text-[9px] uppercase text-white/50">Hands</div>
                  </div>
                  <div className="rounded-lg bg-black/40 p-2">
                    <div className="text-lg font-black text-emerald-400">{stats.won}</div>
                    <div className="text-[9px] uppercase text-white/50">Wins</div>
                  </div>
                </div>

                <p className="text-[10px] text-center text-white/40 pt-1">
                  For entertainment only · No real money
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
