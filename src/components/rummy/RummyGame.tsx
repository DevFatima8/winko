"use client";
import { MAX_GAME_BET } from "@/lib/gameBetLimits";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import Image from "next/image";
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import BetAmountInput from "@/components/BetAmountInput";
import { useDb, useSession } from "@/lib/useDb";
import { avatarSrc, isAvatar } from "@/lib/avatars";
import { AnimatePresence, motion } from "framer-motion";
import type { Card, Group } from "./engine";
import { handValue, meldType, RANK_LABEL, SUITS, SUIT_SYMBOL, solve, buildDeck, shuffle } from "./engine";
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
const ENTRY_CARDS: Card[] = [
  { id: "14S", rank: 14, suit: "S" },
  { id: "13H", rank: 13, suit: "H" },
  { id: "12S", rank: 12, suit: "S" },
];

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

function Dealer({ dealing }: { dealing: boolean }) {
  return <div className={`rummy-dealer ${dealing ? "rummy-dealing" : ""}`} role="img" aria-label={dealing ? "Dealer distributing 13 cards" : "Table dealer"}>
    <svg viewBox="0 0 120 130" aria-hidden="true">
      <path d="M29 70Q11 4 58 3Q106 0 94 79Z" fill="#40251f" />
      <path d="M48 53V74H72V53" fill="#cc926e" />
      <ellipse cx="60" cy="33" rx="22" ry="28" fill="#efbb94" />
      <path d="M34 37Q31 3 60 4Q88 4 85 34Q66 28 57 13Q47 31 34 37" fill="#4a2a23" />
      <path d="M48 34h5m15 0h5" stroke="#382325" strokeWidth="2" strokeLinecap="round" />
      <path d="M54 46q6 5 12 0" fill="none" stroke="#a9444d" strokeWidth="2" />
      <path d="M39 64L22 111L44 123L76 123L98 111L81 64L68 76L51 75Z" fill="#14101d" />
      <path d="M39 68L20 105Q18 114 28 115L58 109M81 68L100 105Q102 114 92 115L62 109" fill="none" stroke="#efbb94" strokeWidth="12" strokeLinecap="round" />
      <path d="M48 64l12 6l12-6v15l-12-6l-12 6Z" fill="#faf2db" />
      <rect x="49" y="101" width="22" height="28" rx="2" fill="#e1e1ce" transform="rotate(-12 60 115)" />
      <rect x="53" y="104" width="14" height="20" rx="1" fill="#295574" transform="rotate(-12 60 115)" />
    </svg>
    {dealing && <><i className="rummy-dealt-card rummy-dealt-left" /><i className="rummy-dealt-card rummy-dealt-right" /><i className="rummy-dealt-card rummy-dealt-you" /></>}
  </div>;
}

// ── Main Rummy Component ─────────────────────────────────────────

export default function RummyGame() {
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = usePersistentState("rr_muted", false);
  const [balance] = useGameBalance("rummy", TOP_UP);
  const pool = usePoolLifecycle("rummy");
  const { user: player } = useSession();
  const { data: lobby, error: lobbyError, reload: reloadLobby } = useDb(async () => {
    const response = await fetch("/api/player/rummy", { cache: "no-store" });
    const reply = await response.json();
    if (!response.ok) throw new Error(reply.error || "Rummy levels could not be loaded.");
    if (!Number.isInteger(reply.unlockedLevel) || reply.unlockedLevel < 1 || reply.unlockedLevel > 5) throw new Error("Invalid Rummy level progress.");
    return reply as { unlockedLevel: number };
  });
  const [level, setLevel] = useState(1);
  const [dealing, setDealing] = useState(false);
  const [turn, setTurn] = useState({ seat: 0, until: 0 });
  const [seconds, setSeconds] = useState(30);
  const [botMoves, setBotMoves] = useState([0, 0]);
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
  const [actionBusy, setActionBusy] = useState(false);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);

  const lockRef = useRef(false);
  const meldZone = useRef<HTMLDivElement>(null);
  const pointerDrag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const settledRef = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnAction = useRef<() => void>(() => {});
  const dealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleRound = useIdleCardRound({
    idle: wagerPhase === "bet", finished: wagerPhase === "result", busy: pool.busy, paused: true,
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
  useEffect(() => () => {
    if (dealTimer.current) clearTimeout(dealTimer.current);
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);
  useEffect(() => {
    if (wagerPhase !== "play" || dealing || !turn.until) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((turn.until - Date.now()) / 1000));
      setSeconds(remaining);
      if (remaining > 0) return;
      clearInterval(timer);
      if (turn.seat === 0) turnAction.current();
      else {
        setBotMoves(previous => previous.map((moves, index) => index === turn.seat - 1 ? moves + 1 : moves));
        const seat = (turn.seat + 1) % 3;
        setSeconds(seat === 0 ? 30 : 2);
        setTurn({ seat, until: Date.now() + (seat === 0 ? 30000 : 1500) });
      }
    }, 100);
    return () => clearInterval(timer);
  }, [wagerPhase, dealing, turn]);

  const placedIds = useMemo(() => {
    const s = new Set<string>();
    groups.forEach((g) => g.cards.forEach((c) => s.add(c.id)));
    return s;
  }, [groups]);

  const freeCards = useMemo(() => hand.filter((c) => !placedIds.has(c.id)), [hand, placedIds]);
  const canDeal = !!lobby && balance >= bet && bet >= MIN_BET && bet <= MAX_GAME_BET && !actionBusy;
  const playerTurn = !dealing && turn.seat === 0;
  const endPlayerTurn = useCallback(() => {
    setSeconds(2);
    setTurn({ seat: 1, until: Date.now() + 1500 });
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2300);
  };

  const startDeal = async (stake = bet, chosenLevel = level) => {
    if (!["bet", "result"].includes(wagerPhase) || actionBusy || pool.busy || !lobby ||
        chosenLevel > lobby.unlockedLevel || stake < MIN_BET || stake > MAX_GAME_BET || balance < stake ||
        wagerPhase === "bet" && !idleRound.claim()) return;
    setActionBusy(true);
    try {
      if (!await pool.start(stake)) { idleRound.release(); return; }
      const dealt = await cardMove<{ hand: Card[] }>(pool, "deal", { level: chosenLevel });
      if (!dealt) return;
      setBet(stake);
      setLevel(chosenLevel);
      setDealing(true);
      setBotMoves([0, 0]);
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
      dealTimer.current = setTimeout(() => {
        lockRef.current = false;
        setDealing(false);
        setSeconds(30);
        setTurn({ seat: 0, until: Date.now() + 30000 });
      }, 13 * 45 + 700);
    } finally {
      setActionBusy(false);
    }
  };

  useEffect(() => {
    let disposed = false;
    void restoreCardRound<{ hand: Card[]; level?: number }>("rummy", pool).then(async restored => {
      if (disposed || !restored) return;
      const round = restored.phase === "accepted" ? await cardMove<{ hand: Card[]; level?: number }>(pool, "deal") : restored;
      if (disposed || !round || round.phase !== "play") return;
      settledRef.current = false;
      lockRef.current = false;
      setHand(round.view.hand);
      setGroups([]);
      setPhase("play");
      setLevel(round.view.level ?? 1);
      setTurn({ seat: 0, until: Date.now() + 30000 });
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
    reloadLobby();
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
        pool.announce();
        setPhase("result");
        lockRef.current = true;
      },
      win ? 950 : 550
    );
  };

  const selectCard = (id: string) => {
    if (idleRound.watching || lockRef.current || !playerTurn) return;
    if (selected.includes(id)) {
      setSelected((s) => s.filter((x) => x !== id));
      sfx.unselect();
    } else {
      setSelected((s) => [...s, id]);
      sfx.tap();
    }
  };

  const addMeld = (ids = selected) => {
    if (idleRound.watching || lockRef.current || !playerTurn) return;
    const cards = freeCards.filter((c) => ids.includes(c.id));
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
    } else endPlayerTurn();
  };

  const autoArrange = () => {
    if (idleRound.watching || lockRef.current || !playerTurn) return;
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
    if (idleRound.watching || lockRef.current || !playerTurn || hintsLeft <= 0) return;
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
    if (idleRound.watching || lockRef.current || !playerTurn) return;
    setGroups((gs) => gs.filter((g) => !g.cards.some((c) => c.id === cardId)));
    setHintIds([]);
    sfx.tap();
  };

  const forfeit = () => {
    if (idleRound.watching || lockRef.current) return;
    finish(false, "You folded the hand");
  };

  const sortHand = () => {
    if (idleRound.watching || lockRef.current || !playerTurn || actionBusy) return;
    setHand([...wagerHand].sort((a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || a.rank - b.rank));
    setSelected([]);
    sfx.tap();
  };

  const beginDrag = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    if (idleRound.watching || lockRef.current || !playerTurn || phase !== "play") return;
    suppressClick.current = false;
    pointerDrag.current = { id, x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const start = pointerDrag.current;
    if (!start) return;
    const x = event.clientX - start.x, y = event.clientY - start.y;
    if (Math.hypot(x, y) > 8) start.moved = true;
    if (start.moved) setDrag({ id: start.id, x, y });
  };

  const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const start = pointerDrag.current;
    pointerDrag.current = null;
    setDrag(null);
    if (!start?.moved) return;
    suppressClick.current = true;
    const area = meldZone.current?.getBoundingClientRect();
    if (area && event.clientX >= area.left && event.clientX <= area.right && event.clientY >= area.top && event.clientY <= area.bottom) {
      addMeld(selected.includes(start.id) ? selected : [...selected, start.id]);
    }
  };

  useEffect(() => {
    turnAction.current = () => {
      if (lockRef.current || settledRef.current) {
        setTurn({ seat: 0, until: Date.now() + 30000 });
        return;
      }
      const candidate = selected.length >= 3 && meldType(freeCards.filter(card => selected.includes(card.id)))
        ? selected : solve(freeCards)?.[0]?.cards.map(card => card.id);
      if (candidate) addMeld(candidate);
      else { setSelected([]); endPlayerTurn(); }
    };
  });

  const clampBet = (v: number) => Math.min(MAX_GAME_BET, Math.max(MIN_BET, Math.floor(v / 50) * 50));
  const changeBet = (fn: (b: number) => number) => {
    if (wagerPhase !== "bet" || idleRound.watching || actionBusy) return;
    setBet((b) => clampBet(fn(b)));
    sfx.chip();
  };

  const outOfChips = balance < MIN_BET;

  return (
    <div className="rummy-wrapper rummy-room relative flex h-full mx-auto w-full flex-col overflow-hidden rounded-2xl border border-[#e7bc55]/30 shadow-2xl select-none text-[#f7f1de] px-1 sm:px-2 py-0.5">
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
      <main className="rummy-main relative z-10 flex min-h-0 flex-1 flex-col">
        <AnimatePresence mode="wait">
          {phase === "bet" && (
            <motion.section
              key="bet"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -18 }}
              transition={{ duration: 0.25 }}
              className="rummy-entry"
            >
              <div className="rummy-entry-art" aria-hidden="true">
                <div className="rummy-entry-fan">
                  {ENTRY_CARDS.map((card, index) => (
                    <div key={card.id} style={{ rotate: `${(index - 1) * 17}deg`, translate: `${(index - 1) * 46}px 0` }}>
                      <PlayingCard card={card} />
                    </div>
                  ))}
                </div>
                <h2 className="font-display gold-text">Rummy</h2>
                <p>13 CARDS · SETS &amp; RUNS</p>
              </div>
              <div className="rummy-entry-content">
                <h2 className="rummy-section-title">CHOOSE YOUR TABLE</h2>
                <div className="rummy-levels" aria-label="Bet amount tables">
                  {BET_PRESETS.map((value, index) => (
                    <button
                      type="button"
                      key={value}
                      disabled={actionBusy || !lobby || index + 1 > lobby.unlockedLevel}
                      aria-pressed={level === index + 1}
                      aria-label={`Level ${index + 1}, stake Rs. ${value.toLocaleString()}${lobby && index + 1 > lobby.unlockedLevel ? ", locked" : ", join"}`}
                      className={`rummy-level rummy-level-${index + 1}`}
                      onClick={() => { sfx.chip(); void startDeal(value, index + 1); }}
                    >
                      <span className="rummy-level-title">LV{index + 1}</span>
                      <span className="rummy-level-coin" aria-hidden="true">Rs</span>
                      <span>Entry stake</span>
                      <strong>Rs. {value.toLocaleString()}</strong>
                      <span className="rummy-level-join">{lobby && index + 1 <= lobby.unlockedLevel ? "JOIN" : "LOCKED"}</span>
                    </button>
                  ))}
                </div>
                <div className="rummy-quick-amounts" aria-label="Bet amount presets">
                  {BET_PRESETS.map(value => <button key={value} type="button" disabled={actionBusy} aria-pressed={bet === value} onClick={() => setBet(value)}>Rs. {value.toLocaleString()}</button>)}
                </div>
                <div className="rummy-entry-controls">
                  <div className="rummy-custom-amount"><span className="rummy-stake-shortcuts">Custom stake
                    <span>
                      <button type="button" onClick={() => changeBet((value) => value - 50)} disabled={actionBusy} aria-label="Decrease bet by 50">-</button>
                      <button type="button" onClick={() => changeBet((value) => value + 50)} disabled={actionBusy} aria-label="Increase bet by 50">+</button>
                      <button type="button" onClick={() => changeBet(() => Math.min(balance, MAX_GAME_BET))} disabled={actionBusy}>MAX</button>
                    </span>
                  </span>
                    <BetAmountInput value={bet} onChange={(value) => { if (!actionBusy) setBet(value); }} disabled={actionBusy} max={Math.min(balance, MAX_GAME_BET)} />
                  </div>
                  <button type="button" onClick={() => changeBet((value) => value / 2)} disabled={actionBusy} className="rummy-btn-dark rounded-lg px-3 py-2" aria-label="Halve bet">½</button>
                  <button type="button" onClick={() => changeBet((value) => value * 2)} disabled={actionBusy} className="rummy-btn-dark rounded-lg px-3 py-2">2×</button>
                  <button type="button" onClick={() => void startDeal()} disabled={!canDeal} className="rummy-btn-gold rummy-deal-button">
                    {actionBusy ? "DEALING…" : "DEAL 13 CARDS"}
                  </button>
                </div>
                <p className="rummy-entry-note" role="status">{outOfChips ? "Not enough balance. Minimum stake Rs. 10." : bet > balance ? "Not enough balance for this stake." : "Arrange all 13 cards into SETs & RUNs · Gross payout 2x, including stake"}</p>
                <p className="rummy-entry-note">Win a level to unlock the next. Progress is saved to your account.</p>
                {lobbyError && <p role="alert" className="rummy-entry-note">{lobbyError} <button type="button" onClick={reloadLobby}>Retry</button></p>}
              </div>
              <div className="rummy-player-strip"><span className="rummy-profile-avatar">{player && isAvatar(player.avatar) ? <Image src={avatarSrc(player.avatar)} alt="Your profile avatar" width={42} height={42} unoptimized /> : "Y"}</span><span>{player?.name ?? "YOU"}</span><strong>Rs. {ready ? balance.toLocaleString() : "—"}</strong><span>WINS {stats.wins} · BEST Rs. {stats.best.toLocaleString()}</span></div>
            </motion.section>
          )}

          {(phase === "play" || phase === "result") && (
            <motion.section
              key="table"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rummy-table-view"
            >
              <div className="rummy-table-toolbar">
                <span>BET <strong>Rs. {bet.toLocaleString()}</strong></span>
                <span>LV{level} · {phase === "result" ? "HAND COMPLETE" : dealing ? "DEALING" : turn.seat === 0 ? `YOUR TURN · ${seconds}s` : "COMPUTER TURN"}</span>
                <button type="button" onClick={forfeit} disabled={idleRound.watching || phase !== "play" || actionBusy} className="rummy-drop-button">DROP / FORFEIT</button>
              </div>
              <div className="rummy-oval-area">
                <Dealer dealing={dealing} />
                <div className="rummy-oval">
                  {[1, 2].map(seat => <div key={seat} className={`rummy-computer-seat rummy-computer-seat-${seat} ${turn.seat === seat && phase === "play" ? "rummy-seat-active" : ""}`} aria-label={`Computer-controlled seat ${seat}`} title="Computer-controlled seat">
                    <span className="rummy-avatar" aria-hidden="true"><svg viewBox="0 0 40 40"><circle cx="20" cy="14" r="8" fill="currentColor" /><path d="M5 38Q5 23 20 23Q35 23 35 38" fill="currentColor" /></svg></span>
                    <span className="rummy-computer-cards" aria-label="Computer arranging cards">{[0, 1, 2].map(card => <i key={card} style={{ rotate: `${(card - 1) * 12}deg` }} />)}</span>
                    <span className="rummy-computer-meld" key={botMoves[seat - 1]}>{botMoves[seat - 1] > 0 ? "SET / RUN" : ""}</span>
                    {turn.seat === seat && phase === "play" && <small className="rummy-computer-timer">{seconds}s</small>}
                  </div>)}
                  <div className="rummy-table-watermark" aria-hidden="true">RUMMY</div>
                  <div className="rummy-table-instruction" role="status">{dealing ? "Dealer is distributing cards" : !playerTurn ? "Computer arranging cards" : groups.length ? "Your turn: place a meld or take a group back" : "Your turn: select cards, then place a SET or RUN"}</div>
                  <div ref={meldZone} className={`rummy-meld-zone ${drag ? "rummy-drop-ready" : ""}`} aria-label="Place selected meld here">
                <AnimatePresence initial={false}>
                  {groups.map((g) => (
                    <motion.div
                      key={g.cards.map((c) => c.id).join("")}
                      initial={{ scale: 0.6, y: 16, opacity: 0 }}
                      animate={{ scale: 1, y: 0, opacity: 1 }}
                      exit={{ scale: 0.7, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 320, damping: 22 }}
                      className="rummy-placed-group"
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
                            disabled={phase !== "play" || idleRound.watching || !playerTurn}
                            aria-label={`Take back ${groupLabel(g)}`}
                            className={`rummy-meld-card ${i > 0 ? "rummy-meld-overlap" : ""}`}
                          >
                            <PlayingCard card={c} size="slot" />
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {groups.length === 0 && (
                  <div className="rummy-empty-table">
                    <div className="rummy-card-back" aria-hidden="true"><SpadeMark className="h-9 w-9" /></div>
                    <p>13 dealt cards<br /><span>Place your melds here</span></p>
                    <div className="rummy-table-card" aria-hidden="true"><PlayingCard card={hand[0] ?? { id: "14S", rank: 14, suit: "S" }} /></div>
                  </div>
                )}
                  </div>
                  <div className={`rummy-table-player ${playerTurn && phase === "play" ? "rummy-seat-active" : ""}`}>
                    <span className="rummy-avatar" style={{ "--turn-progress": `${seconds / 30 * 100}%` } as CSSProperties}>
                      {player && isAvatar(player.avatar) ? <Image src={avatarSrc(player.avatar)} alt="Your profile avatar" width={56} height={56} unoptimized /> : "Y"}
                    </span>
                    <div>
                      <span className="rummy-account-label" title={player?.id}>{player?.username ?? player?.name ?? "YOU"} · {handValue(freeCards)} POINTS</span>
                      <strong>Rs. {ready ? balance.toLocaleString() : "—"}</strong>
                      <span>{phase === "play" ? dealing ? "DEALING" : playerTurn ? `${seconds}s · YOUR TURN` : "WAIT FOR YOUR TURN" : "HAND COMPLETE"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* hand */}
              <motion.div
                animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : { x: 0 }}
                transition={{ duration: 0.4 }}
                className="rummy-hand-tray"
              >
                <div className="rummy-hand-heading"><span>{freeCards.length} CARDS IN HAND</span><button type="button" onClick={sortHand} disabled={idleRound.watching || phase !== "play" || actionBusy || !playerTurn}>AUTO SORT</button></div>
                <div className="rummy-hand-cards" style={{ "--card-count": Math.max(1, freeCards.length) } as CSSProperties}>
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
                          onClick={() => {
                            if (suppressClick.current) { suppressClick.current = false; return; }
                            selectCard(c.id);
                          }}
                          onPointerDown={(event) => beginDrag(event, c.id)}
                          onPointerMove={moveDrag}
                          onPointerUp={endDrag}
                          onPointerCancel={() => { pointerDrag.current = null; setDrag(null); suppressClick.current = true; }}
                          style={{ zIndex: drag?.id === c.id ? 100 : isSel ? 60 : i, translate: drag?.id === c.id ? `${drag.x}px ${drag.y}px` : undefined }}
                          className={`rummy-hand-card ${isSel ? "rummy-card-selected" : ""} ${isHint ? "card-hint" : ""}`}
                          disabled={idleRound.watching || phase !== "play" || !playerTurn}
                          aria-pressed={isSel}
                          aria-label={`${RANK_LABEL[c.rank]} of ${SUIT_SYMBOL[c.suit]}`}
                        >
                          <PlayingCard card={c} />
                        </motion.button>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </motion.div>

              {/* action bar */}
              <div className="rummy-table-actions">
                <button
                  type="button"
                  onClick={useHint}
                  disabled={hintsLeft <= 0 || phase !== "play" || idleRound.watching || !playerTurn}
                  className="rounded-xl border border-purple-400/40 bg-gradient-to-r from-purple-900/50 to-indigo-900/50 px-3.5 py-1.5 text-xs font-bold tracking-[0.1em] text-purple-200 transition hover:brightness-110 active:scale-95 disabled:opacity-30"
                >
                  HINT ({hintsLeft})
                </button>
                <button
                  type="button"
                  onClick={autoArrange}
                  disabled={phase !== "play" || idleRound.watching || !playerTurn}
                  className="rounded-xl border border-cyan-400/40 bg-gradient-to-r from-cyan-900/50 to-blue-900/50 px-3.5 py-1.5 text-xs font-bold tracking-[0.1em] text-cyan-200 transition hover:brightness-110 active:scale-95"
                >
                  AUTO ARRANGE
                </button>
                <button
                  type="button"
                  onClick={() => addMeld()}
                  disabled={selected.length < 3 || phase !== "play" || idleRound.watching || !playerTurn}
                  className="rummy-btn-gold rounded-xl px-4 py-1.5 font-display text-xs font-bold tracking-[0.12em] sm:px-6 sm:text-sm active:scale-95 transition-transform"
                >
                  PLACE MELD{selected.length ? ` (${selected.length})` : ""}
                </button>
                <button type="button" className="rummy-btn-dark rounded-xl px-3 py-1.5 text-xs" disabled={phase !== "play" || !playerTurn} onClick={endPlayerTurn}>PASS TURN</button>
              </div>
              <p className="pb-0.5 text-center text-[9px] tracking-[0.14em] text-[#9fd0b8]/45 shrink-0">
                FIXED SET/RUN · 2 COMPUTER SEATS · 30s AUTO MOVE OR PASS · NO TIMEOUT LOSS
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
                  <span className="font-bold text-[#f6e3a1]">PLACE MELD</span>, or drag the selected cards onto the table. A{" "}
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
                <li>Correct declaration is required; forfeiting a winning hand still pays zero.</li>
                <li>Two computer-controlled seats take short arranging turns between yours; they are not online players and place no wallet bets. Your turn lasts 30 seconds. On timeout, a valid selected/available meld is placed, otherwise the turn passes without an extra stake or automatic loss.</li>
                <li>Win the joined level to unlock the next one. Unlocks are verified and saved to your account. Cards stay in the existing fixed SET/RUN game; no deck draw/discard is added.</li>
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
