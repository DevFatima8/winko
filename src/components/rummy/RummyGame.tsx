"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import BetAmountInput from "@/components/BetAmountInput";
import { AnimatePresence, motion } from "framer-motion";
import type { Card, Group } from "./engine";
import { handValue, meldType, RANK_LABEL, solve, buildDeck, shuffle } from "./engine";
import { useIdleCardRound } from "../teen-patti/useIdleCardRound";
import { cardMove, restoreCardRound } from "@/lib/interactiveCardClient";
import { PlayingCard } from "./PlayingCard";
import { usePersistentState, useSound } from "./hooks";
import "./rummy.css";

type Phase = "bet" | "play" | "result";

interface Stats {
  wins: number;
  losses: number;
  best: number;
  streak: number;
}

const CHIP_OPTIONS: number[] = [...BET_PRESETS];
const CHIP_COLORS: Partial<Record<number, string>> = {
  10: "#d9d1b8",
  20: "#d9d1b8",
  50: "#d9d1b8",
  100: "#4a7fc9",
  200: "#3f9d6c",
  500: "#9b59b6",
  1000: "#c0392b",
};
const CHIP_LABEL: Partial<Record<number, string>> = {
  50: "50",
  100: "100",
  200: "200",
  500: "500",
  1000: "1K",
};
const MIN_BET = 10;
const TOP_UP = 10000;
const MAX_HINTS = 3;

// ── Presentational Chip ──────────────────────────────────────────

function Chip({
  value,
  selected,
  size = 64,
  onClick,
  dim,
}: {
  value: number;
  selected?: boolean;
  size?: number;
  onClick?: () => void;
  dim?: boolean;
}) {
  const label = CHIP_LABEL[value] ?? String(value);
  const color = CHIP_COLORS[value] ?? "#d9d1b8";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={`Bet ${value} chips`}
      className={`rounded-full outline-none transition-transform duration-150 ${
        onClick ? "cursor-pointer hover:-translate-y-1" : ""
      } ${selected ? "-translate-y-2 scale-110" : ""} ${dim ? "opacity-50" : ""}`}
      style={{
        width: size,
        height: size,
        filter: selected
          ? "drop-shadow(0 0 14px rgba(240,210,125,.7))"
          : "drop-shadow(0 5px 10px rgba(0,0,0,.45))",
      }}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <circle cx="50" cy="50" r="47" fill={color} stroke="rgba(0,0,0,0.4)" strokeWidth="2" />
        <circle
          cx="50"
          cy="50"
          r="41"
          fill="none"
          stroke="#f7f1de"
          strokeWidth="9"
          strokeDasharray="10 15.8"
          opacity="0.9"
        />
        <circle cx="50" cy="50" r="28" fill="#f7f1de" fillOpacity="0.16" stroke="#f7f1de" strokeWidth="1.6" />
        <text
          x="50"
          y="52"
          textAnchor="middle"
          dominantBaseline="central"
          fill="#f7f1de"
          fontSize={label.length > 2 ? 19 : 22}
          fontWeight="700"
          fontFamily="sans-serif"
        >
          {label}
        </text>
      </svg>
    </button>
  );
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        dur: 1.3 + Math.random() * 1.3,
        color: ["#f6e3a1", "#e7bc55", "#fdfaf1", "#5aa986", "#f0d27d"][i % 5],
        rot: Math.random() * 360,
        w: 6 + Math.random() * 8,
      })),
    []
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-[-6%] block rounded-[2px]"
          style={{ left: `${p.left}%`, width: p.w, height: p.w * 0.45, backgroundColor: p.color }}
          initial={{ y: -50, opacity: 1, rotate: p.rot }}
          animate={{ y: "115vh", opacity: [1, 1, 0.9, 0], rotate: p.rot + 560 }}
          transition={{ duration: p.dur, delay: p.delay, ease: "easeIn" }}
        />
      ))}
    </div>
  );
}

function SpadeMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border-2 border-[#e7bc55]/60 bg-[#0a382a]/80 text-[#f0d27d] ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-[62%] w-[62%]" fill="currentColor">
        <path
          d="M12 2.2C10.6 5.4 7.9 7.5 5.4 9.4 3.2 11 2.2 12.6 2.2 14.3c0 2.5 2 4.4 4.5 4.4 1.3 0 2.5-.5 3.4-1.4-.3-.9-.9-1.7-1.7-2.4 1 .1 2 .4 2.9 1 1.6-1.3 3.9-2.9 5.6-4.2 2.2-1.6 3.9-2.9 3.9-4.6 0-3.3-2.3-5.2-4.2-5.2-1.7 0-3 1-3.6 2.1l-1-2Z"
          transform="scale(0.92) translate(1 -1)"
        />
      </svg>
    </span>
  );
}

function groupLabel(g: Group): string {
  if (g.type === "set") return `SET · ${RANK_LABEL[g.cards[0].rank]}`;
  const rs = g.cards.map((c) => c.rank).sort((a, b) => a - b);
  return `RUN · ${RANK_LABEL[rs[0]]}–${RANK_LABEL[rs[rs.length - 1]]}`;
}

// ── Main Rummy Component ─────────────────────────────────────────

export default function RummyGame() {
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = usePersistentState("rr_muted", false);
  const [balance] = useGameBalance("rummy", TOP_UP);
  const pool = usePoolLifecycle("rummy");
  const [bet, setBet] = usePersistentState("rr_bet", 500);
  const [stats, setStats] = usePersistentState<Stats>("rr_stats", {
    wins: 0,
    losses: 0,
    best: 0,
    streak: 0,
  });
  const sfx = useSound(muted);

  const [wagerPhase, setPhase] = usePoolRoundState<Phase>("rummy", "phase", "bet");
  const [wagerHand, setHand] = usePoolRoundState<Card[]>("rummy", "hand", []);
  const [wagerGroups, setGroups] = usePoolRoundState<Group[]>("rummy", "groups", []);
  const [selected, setSelected] = useState<string[]>([]);
  const [hintIds, setHintIds] = useState<string[]>([]);
  const [hintsLeft, setHintsLeft] = useState(MAX_HINTS);
  const [result, setResult] = useState<{ win: boolean; reason: string } | null>(null);
  const [dealKey, setDealKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const lockRef = useRef(false);
  const settledRef = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleRound = useIdleCardRound({
    idle: wagerPhase === "bet", finished: wagerPhase === "result", busy: pool.busy,
    frames: () => {
      const cards = shuffle(buildDeck()).slice(0, 13);
      return Array.from({ length: 14 }, (_, count) => ({ at: count * 45, view: cards.slice(0, count) }));
    },
    next: () => {
      setHand([]);
      setGroups([]);
      setResult(null);
      setSelected([]);
      lockRef.current = false;
      setPhase("bet");
    },
  });
  const phase = idleRound.watching ? "play" : wagerPhase;
  const hand = idleRound.preview ?? wagerHand;
  const groups = idleRound.watching ? [] : wagerGroups;

  useEffect(() => setReady(true), []);

  const placedIds = useMemo(() => {
    const s = new Set<string>();
    groups.forEach((g) => g.cards.forEach((c) => s.add(c.id)));
    return s;
  }, [groups]);

  const freeCards = useMemo(() => hand.filter((c) => !placedIds.has(c.id)), [hand, placedIds]);
  const canDeal = balance >= bet && balance > 0;

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2300);
  };

  const startDeal = async () => {
    if (wagerPhase !== "bet" || balance < bet || !idleRound.claim()) return;
    if (!await pool.start(bet)) { idleRound.release(); return; }
    const dealt = await cardMove<{ hand: Card[] }>(pool, "deal");
    if (!dealt) return;
    const d = { hand: dealt.view.hand };
    settledRef.current = false;
    lockRef.current = true;
    setHand(d.hand);
    setGroups([]);
    setSelected([]);
    setHintIds([]);
    setHintsLeft(MAX_HINTS);
    setResult(null);
    setPhase("play");
    setDealKey((k) => k + 1);
    sfx.deal();
    setTimeout(() => {
      lockRef.current = false;
    }, 13 * 45 + 700);
  };

  useEffect(() => {
    let disposed = false;
    void restoreCardRound<{ hand: Card[] }>("rummy", pool).then(async restored => {
      if (disposed || !restored) return;
      const round = restored.phase === "accepted" ? await cardMove<{ hand: Card[] }>(pool, "deal") : restored;
      if (disposed || !round || round.phase !== "play") return;
      settledRef.current = false;
      lockRef.current = false;
      setHand(round.view.hand);
      setGroups([]);
      setPhase("play");
    });
    return () => { disposed = true; };
    // Restore once on mount; the wallet lifecycle replays any unconfirmed move first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = async (win: boolean, reason: string, melds: Group[] = []) => {
    if (idleRound.watching || settledRef.current) return;
    settledRef.current = true;
    const reply = await cardMove<{ win: boolean }>(pool, win ? "declare" : "forfeit",
      win ? { groups: melds.map((g) => g.cards.map((c) => c.id)) } : undefined);
    if (!reply) { settledRef.current = false; lockRef.current = false; return; }
    win = reply.view.win;
    settledRef.current = true;
    lockRef.current = true;
    setResult({ win, reason });
    if (win) {
      setStats((s) => ({
        wins: s.wins + 1,
        losses: s.losses,
        best: Math.max(s.best, bet),
        streak: s.streak + 1,
      }));
      sfx.win();
    } else {
      setStats((s) => ({ wins: s.wins, losses: s.losses + 1, best: s.best, streak: 0 }));
      sfx.lose();
    }
    setTimeout(
      () => {
        setPhase("result");
        lockRef.current = true;
      },
      win ? 950 : 550
    );
  };

  const selectCard = (id: string) => {
    if (idleRound.watching || lockRef.current) return;
    if (selected.includes(id)) {
      setSelected((s) => s.filter((x) => x !== id));
      sfx.unselect();
    } else {
      setSelected((s) => [...s, id]);
      sfx.tap();
    }
  };

  const addMeld = () => {
    if (idleRound.watching || lockRef.current) return;
    const cards = hand.filter((c) => selected.includes(c.id));
    if (cards.length < 3) {
      sfx.invalid();
      showToast("Select 3 or more cards first");
      return;
    }
    const t = meldType(cards);
    if (!t) {
      sfx.invalid();
      setShake(true);
      setTimeout(() => setShake(false), 450);
      showToast("Not a valid SET or RUN — check rules");
      return;
    }
    const covered = new Set<string>(placedIds);
    cards.forEach((c) => covered.add(c.id));
    setGroups((g) => [...g, { type: t, cards }]);
    setSelected([]);
    setHintIds((h) => h.filter((id) => !cards.some((c) => c.id === id)));
    sfx.place();
    if (covered.size === hand.length) {
      lockRef.current = true;
      const melds = [...groups, { type: t, cards }];
      setTimeout(() => finish(true, "All 13 cards arranged — clean rummy!", melds), 620);
    }
  };

  const autoArrange = () => {
    if (idleRound.watching || lockRef.current) return;
    const sol = solve(hand);
    if (!sol) {
      sfx.invalid();
      showToast("No full arrangement exists — this hand is busted");
      return;
    }
    lockRef.current = true;
    setSelected([]);
    setHintIds([]);
    setGroups([]);
    sol.forEach((g, i) => {
      setTimeout(() => {
        setGroups((prev) => [...prev, g]);
        sfx.place();
      }, 260 * (i + 1));
    });
    setTimeout(() => finish(true, "Auto-arrange found the full layout", sol), 260 * (sol.length + 1) + 420);
  };

  const useHint = () => {
    if (idleRound.watching || lockRef.current || hintsLeft <= 0) return;
    const sol = solve(freeCards);
    if (!sol) {
      sfx.invalid();
      showToast("Stuck? Tap a placed meld to take it back");
      return;
    }
    setHintIds(sol[0].cards.map((c) => c.id));
    setHintsLeft((h) => h - 1);
    sfx.tap();
  };

  const takeBack = (cardId: string) => {
    if (idleRound.watching || lockRef.current) return;
    setGroups((gs) => gs.filter((g) => !g.cards.some((c) => c.id === cardId)));
    setHintIds([]);
    sfx.tap();
  };

  const forfeit = () => {
    if (idleRound.watching || lockRef.current) return;
    finish(false, "You folded the hand");
  };

  const clampBet = (v: number) => Math.max(MIN_BET, Math.floor(v / 50) * 50);
  const changeBet = (fn: (b: number) => number) => {
    if (wagerPhase !== "bet" || idleRound.watching) return;
    setBet((b) => clampBet(fn(b)));
    sfx.chip();
  };

  const outOfChips = balance < MIN_BET;

  return (
    <div className="rummy-wrapper rummy-felt-bg relative flex h-full max-w-5xl mx-auto w-full flex-col justify-between overflow-hidden rounded-2xl border border-[#e7bc55]/30 shadow-2xl select-none text-[#f7f1de] px-1 sm:px-2 py-0.5">
      {idleRound.countdown !== null && <p className="relative z-20 shrink-0 text-center text-xs text-amber-200" role="status">Next round in {idleRound.countdown}s</p>}
      <div className="rummy-table-ring pointer-events-none absolute inset-0 rounded-2xl" />

      {/* ── Header ── */}
      <header className="relative z-20 flex items-center justify-between gap-2 px-2 pt-1 pb-1 sm:px-4 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <SpadeMark className="h-8 w-8 sm:h-9 sm:w-9" />
          <div className="leading-tight">
            <h1 className="font-display gold-text text-base font-black tracking-[0.14em] sm:text-xl">
              RUMMY ROYALE
            </h1>
            <p className="text-[9px] font-semibold tracking-[0.42em] text-[#9fd0b8]/80 sm:text-[10px]">
              CASINO EDITION · 13 CARDS
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 rounded-full border border-[#e7bc55]/40 bg-[#072b20]/80 py-1.5 pr-4 pl-2 shadow-[0_4px_14px_rgba(0,0,0,0.35)]">
            <span className="flex h-6 w-6 items-center justify-center">
              <Chip value={100} size={24} />
            </span>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={ready ? balance : -1}
                initial={{ scale: 1.25, opacity: 0.4 }}
                animate={{ scale: 1, opacity: 1 }}
                className="min-w-[72px] text-right text-sm font-bold tabular-nums text-[#f6e3a1] sm:text-base"
              >
                {ready ? `Rs. ${balance.toLocaleString()}` : "—"}
              </motion.span>
            </AnimatePresence>
          </div>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "Unmute" : "Mute"}
            className="rummy-btn-dark flex h-9 w-9 items-center justify-center rounded-full sm:h-10 sm:w-10"
          >
            {muted ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M4 9v6h4l5 4V5L8 9H4z" />
                <path d="M16.5 9.5 21 15M21 9.5 16.5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M4 9v6h4l5 4V5L8 9H4z" />
                <path
                  d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowRules(true)}
            aria-label="Rules"
            className="rummy-btn-dark flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold sm:h-10 sm:w-10"
          >
            ?
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <main className="relative z-10 flex min-h-0 flex-1 flex-col p-2">
        <AnimatePresence mode="wait">
          {phase === "bet" && (
            <motion.section
              key="bet"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -18 }}
              transition={{ duration: 0.25 }}
              className="flex h-full flex-1 min-h-0 flex-col items-center justify-around gap-2 px-2 py-2 sm:gap-4"
            >
              <p className="font-display text-xs font-bold tracking-[0.3em] text-[#9fd0b8]/90 sm:text-sm">
                CHOOSE BET &amp; DEAL
              </p>

              {outOfChips ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#e7bc55]/30 bg-[#072b20]/80 px-6 py-4 text-center shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
                  <p className="text-base font-semibold text-[#f6e3a1]">You are out of chips</p>
                </div>
              ) : (
                <>
                  <div className="flex items-end gap-2.5 sm:gap-4 flex-wrap justify-center">
                    {CHIP_OPTIONS.map((v) => (
                      <Chip
                        key={v}
                        value={v}
                        size={52}
                        selected={bet === v}
                        dim={v > balance}
                        onClick={() => {
                          setBet(v);
                          sfx.chip();
                        }}
                      />
                    ))}
                    <BetAmountInput
                      value={bet}
                      onChange={(n) => setBet(Math.max(1, Math.floor(n)))}
                      max={balance}
                    />
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-center">
                    <button
                      type="button"
                      onClick={() => changeBet((b) => b - 100)}
                      className="rummy-btn-dark h-8 w-8 sm:h-9 sm:w-9 rounded-full text-base font-bold"
                      aria-label="Decrease bet"
                    >
                      −
                    </button>
                    <div className="min-w-[120px] rounded-xl border border-[#e7bc55]/40 bg-[#072b20]/80 px-4 py-1.5 text-center shadow-[0_6px_18px_rgba(0,0,0,0.4)]">
                      <p className="text-[8px] font-semibold tracking-[0.25em] text-[#9fd0b8]/80">BET AMOUNT</p>
                      <p className="font-display text-base sm:text-lg font-bold text-[#f6e3a1] tabular-nums">
                        Rs. {bet.toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => changeBet((b) => b + 100)}
                      className="rummy-btn-dark h-8 w-8 sm:h-9 sm:w-9 rounded-full text-base font-bold"
                      aria-label="Increase bet"
                    >
                      +
                    </button>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => changeBet((b) => b / 2)}
                        className="rounded-lg border border-amber-400/40 bg-gradient-to-r from-amber-600/30 to-amber-500/30 px-2 py-1 text-xs font-bold text-amber-200 transition hover:brightness-110 active:scale-95"
                      >
                        ½
                      </button>
                      <button
                        type="button"
                        onClick={() => changeBet((b) => b * 2)}
                        className="rounded-lg border border-indigo-400/40 bg-gradient-to-r from-indigo-600/30 to-blue-600/30 px-2 py-1 text-xs font-bold text-indigo-200 transition hover:brightness-110 active:scale-95"
                      >
                        2×
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBet(clampBet(balance));
                          sfx.chip();
                        }}
                        className="rounded-lg border border-emerald-400/40 bg-gradient-to-r from-emerald-600/30 to-teal-600/30 px-2 py-1 text-xs font-bold text-emerald-200 transition hover:brightness-110 active:scale-95"
                      >
                        MAX
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={startDeal}
                    disabled={!canDeal}
                    className="rummy-btn-gold rounded-xl px-10 py-2.5 font-display text-lg font-black tracking-[0.16em] sm:px-14 sm:text-xl shadow-lg shadow-amber-500/25 active:scale-95 transition-transform"
                  >
                    DEAL 13 CARDS
                  </button>

                  <p className="max-w-md text-center text-[10px] sm:text-xs leading-relaxed text-[#9fd0b8]/70">
                    Arrange all <span className="font-bold text-[#f6e3a1]">13 cards</span> into SETs &amp; RUNs to win <span className="font-bold text-[#f6e3a1]">2X Payout</span>.
                  </p>
                </>
              )}

              <p className="text-[9px] tracking-[0.16em] text-[#9fd0b8]/50">
                WINS {stats.wins} · BEST WIN Rs. {stats.best.toLocaleString()}
              </p>
            </motion.section>
          )}

          {(phase === "play" || phase === "result") && (
            <motion.section
              key="table"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full min-h-0 flex-1 flex-col justify-between py-1 overflow-hidden"
            >
              {/* top strip */}
              <div className="flex items-center justify-center gap-1.5 px-2 pt-0.5 sm:gap-3 flex-wrap shrink-0">
                <span className="rounded-full border border-[#e7bc55]/40 bg-[#072b20]/80 px-3 py-0.5 text-xs font-bold tracking-[0.12em] text-[#f6e3a1]">
                  BET Rs. {bet.toLocaleString()}
                </span>
                <span className="rounded-full border border-[#5aa986]/30 bg-[#072b20]/60 px-3 py-0.5 text-xs font-semibold tracking-[0.12em] text-[#9fd0b8]">
                  HAND {handValue(hand)} PTS
                </span>
                <button
                  type="button"
                  onClick={forfeit}
                  className="rounded-full border border-rose-500/50 bg-gradient-to-r from-rose-950/70 to-red-950/70 px-3 py-0.5 text-xs font-bold tracking-[0.12em] text-rose-300 transition hover:brightness-110 active:scale-95"
                >
                  FORFEIT
                </button>
              </div>

              {/* melds */}
              <div className="flex min-h-[55px] sm:min-h-[80px] flex-wrap content-center items-center justify-center gap-x-3 gap-y-2 px-2 my-1 overflow-y-auto shrink-0">
                <AnimatePresence initial={false}>
                  {groups.map((g) => (
                    <motion.div
                      key={g.cards.map((c) => c.id).join("")}
                      initial={{ scale: 0.6, y: 16, opacity: 0 }}
                      animate={{ scale: 1, y: 0, opacity: 1 }}
                      exit={{ scale: 0.7, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 320, damping: 22 }}
                      className="relative"
                    >
                      <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[#d6a63a] px-2 py-0.2 text-[8px] sm:text-[9px] font-black tracking-[0.1em] text-[#072b20] whitespace-nowrap shadow">
                        {groupLabel(g)}
                      </span>
                      <div className="flex rounded-lg border border-[#e7bc55]/35 bg-[#072b20]/70 p-1.5 pt-2.5 shadow-[0_6px_16px_rgba(0,0,0,0.4)]">
                        {g.cards.map((c, i) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => takeBack(c.id)}
                            title="Take meld back"
                            className={`w-7 sm:w-8 ${i > 0 ? "-ml-3 sm:-ml-3.5" : ""} cursor-pointer transition-transform hover:-translate-y-1`}
                          >
                            <PlayingCard card={c} size="slot" />
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {groups.length === 0 && (
                  <p className="text-[11px] tracking-[0.2em] text-[#9fd0b8]/40 text-center">
                    YOUR MELDS APPEAR HERE
                  </p>
                )}
              </div>

              {/* hand */}
              <motion.div
                animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : { x: 0 }}
                transition={{ duration: 0.4 }}
                className="flex items-end justify-center px-2 pb-1 overflow-x-auto my-auto"
              >
                <AnimatePresence initial={false}>
                  {freeCards.map((c, i) => {
                    const isSel = selected.includes(c.id);
                    const isHint = hintIds.includes(c.id);
                    return (
                      <motion.button
                        key={`${dealKey}-${c.id}`}
                        type="button"
                        initial={{ y: -80, opacity: 0, rotate: -8 }}
                        animate={{ y: isSel ? -16 : 0, opacity: 1, rotate: 0 }}
                        exit={{ y: -60, scale: 0.6, opacity: 0, transition: { duration: 0.2 } }}
                        transition={{ delay: i * 0.045, type: "spring", stiffness: 300, damping: 24 }}
                        onClick={() => selectCard(c.id)}
                        style={{ zIndex: isSel ? 60 : i }}
                        className={`w-[36px] cursor-pointer sm:w-[48px] md:w-[56px] ${
                          i > 0 ? "-ml-2.5 sm:-ml-3.5 md:-ml-4" : ""
                        } rounded-[7px] ${isHint ? "card-hint" : ""}`}
                        aria-label={`${RANK_LABEL[c.rank]} of ${c.suit}`}
                      >
                        <PlayingCard card={c} />
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              </motion.div>

              {/* action bar */}
              <div className="flex items-center justify-center gap-1.5 px-2 pb-1 sm:gap-2.5 flex-wrap shrink-0">
                <button
                  type="button"
                  onClick={useHint}
                  disabled={hintsLeft <= 0}
                  className="rounded-xl border border-purple-400/40 bg-gradient-to-r from-purple-900/50 to-indigo-900/50 px-3.5 py-1.5 text-xs font-bold tracking-[0.1em] text-purple-200 transition hover:brightness-110 active:scale-95 disabled:opacity-30"
                >
                  HINT ({hintsLeft})
                </button>
                <button
                  type="button"
                  onClick={autoArrange}
                  className="rounded-xl border border-cyan-400/40 bg-gradient-to-r from-cyan-900/50 to-blue-900/50 px-3.5 py-1.5 text-xs font-bold tracking-[0.1em] text-cyan-200 transition hover:brightness-110 active:scale-95"
                >
                  AUTO ARRANGE
                </button>
                <button
                  type="button"
                  onClick={addMeld}
                  disabled={selected.length < 3}
                  className="rummy-btn-gold rounded-xl px-4 py-1.5 font-display text-xs font-bold tracking-[0.12em] sm:px-6 sm:text-sm active:scale-95 transition-transform"
                >
                  ADD MELD{selected.length ? ` (${selected.length})` : ""}
                </button>
              </div>
              <p className="pb-0.5 text-center text-[9px] tracking-[0.14em] text-[#9fd0b8]/45 shrink-0">
                TAP CARDS TO SELECT · TAP PLACED MELD TO TAKE BACK
              </p>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* Keep replay controls without a second result dialog. */}
      {phase === "result" && result && (
        <div className="shrink-0 flex flex-wrap justify-center gap-2 p-2">
          <button
            type="button"
            onClick={() => {
              if (balance >= bet && balance > 0) startDeal();
              else setPhase("bet");
            }}
            className="rummy-btn-gold flex-1 whitespace-nowrap rounded-xl px-3 py-2 font-display text-xs font-black tracking-[0.08em]"
          >
            DEAL AGAIN
          </button>
          <button
            type="button"
            onClick={() => setPhase("bet")}
            className="rummy-btn-dark flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold tracking-[0.08em]"
          >
            CHANGE BET
          </button>
        </div>
      )}

      {/* ── Rules modal ── */}
      <AnimatePresence>
        {showRules && (
          <motion.div
            key="rules"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-[3px]"
            onClick={() => setShowRules(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[86vh] w-full max-w-md overflow-y-auto rounded-3xl border-2 border-[#e7bc55]/50 bg-[#072b20] p-6 shadow-[0_30px_70px_rgba(0,0,0,0.6)] sm:p-8"
            >
              <h3 className="font-display gold-text text-2xl font-black tracking-[0.12em]">HOW TO PLAY</h3>
              <ol className="mt-5 space-y-4 text-sm leading-relaxed text-[#f7f1de]/85">
                <li>
                  <span className="font-bold text-[#f6e3a1]">1 · Bet:</span> Pick your chip bet and deal 13 cards.
                </li>
                <li>
                  <span className="font-bold text-[#f6e3a1]">2 · Arrange:</span> Tap cards to select them, then press{" "}
                  <span className="font-bold text-[#f6e3a1]">ADD MELD</span>. A{" "}
                  <span className="font-bold text-[#f6e3a1]">SET</span> is 3–4 cards of the same rank. A{" "}
                  <span className="font-bold text-[#f6e3a1]">RUN</span> is 3+ consecutive cards of the same suit (Ace is high only).
                </li>
                <li>
                  <span className="font-bold text-[#f6e3a1]">3 · Win:</span> Put all 13 cards into valid melds and your bet
                  pays back <span className="font-bold text-[#f6e3a1]">1:1 (2x)</span>. Stuck on a partial? Tap the meld to take it back.
                </li>
                <li>
                  <span className="font-bold text-[#f6e3a1]">4 · Help:</span> Use a {MAX_HINTS}-use{" "}
                  <span className="font-bold text-[#f6e3a1]">HINT</span> to highlight a playable meld, or{" "}
                  <span className="font-bold text-[#f6e3a1]">AUTO ARRANGE</span> to find the full layout when one exists.
                </li>
                <li>
                  <span className="font-bold text-[#f6e3a1]">5 · Fold:</span> If the hand is busted, press{" "}
                  <span className="font-bold text-[#b23a2c]">FORFEIT</span> to surrender and deal the next hand.
                </li>
                <li>The server deals 30 fully meldable hands per 100 dealt wagers, including repeat players. Correct declaration is required; forfeiting a winning hand still pays zero.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowRules(false)}
                className="rummy-btn-gold mt-6 w-full rounded-xl px-6 py-3 font-display text-base font-bold tracking-[0.16em]"
              >
                GOT IT
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast}
            initial={{ opacity: 0, y: 14, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[#e7bc55]/40 bg-[#041e16]/95 px-5 py-2 text-sm font-semibold text-[#f6e3a1] shadow-[0_10px_30px_rgba(0,0,0,0.5)] whitespace-nowrap"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
