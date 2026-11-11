"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import BetAmountInput from "@/components/BetAmountInput";
import PlayingCard from "./PlayingCard";
import { buildHand, type CardT, type DealtCard, type Hand, type Side } from "./lib/engine";
import { playSfx, type Sfx } from "./lib/sound";
import "./bollywood.css";

type Phase = "betting" | "dealing" | "settled";
type Zone = "andar" | "joker" | "bahar";

interface Bets {
  andar: number;
  bahar: number;
  joker: number;
}
interface HistoryItem {
  winner: Side | "joker";
  net: number;
}
interface Stats {
  hands: number;
  wins: number;
  losses: number;
  net: number;
}
interface Persisted {
  balance: number;
  stats: Stats;
  history: HistoryItem[];
  sound: boolean;
}

const CHIP_CLS = ["chip-red", "chip-blue", "chip-gold", "chip-green", "chip-purple"];
const CHIP_DEFS = BET_PRESETS.map((v, i) => ({
  v: v as number,
  cls: CHIP_CLS[i],
  label: v >= 1000 ? `${v / 1000}K` : String(v),
}));
const BET_TIME = 10;
const START_BALANCE = 10000;
const LS_KEY = "bollywood-casino-v1";

const CONFETTI_COLORS = ["#f2c14e", "#ff5e5b", "#2fa763", "#4d7fd6", "#b07fe0", "#fff6dc"];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const fmt = (n: number) => "Rs. " + new Intl.NumberFormat("en-PK").format(Math.round(n));

const DEFAULT_STATS: Stats = { hands: 0, wins: 0, losses: 0, net: 0 };
const DEFAULTS: Persisted = { balance: START_BALANCE, stats: DEFAULT_STATS, history: [], sound: true };

function loadPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<Persisted>;
    return {
      balance: typeof p.balance === "number" && isFinite(p.balance) ? p.balance : DEFAULTS.balance,
      stats: p.stats && typeof p.stats.hands === "number" ? p.stats : DEFAULT_STATS,
      history: Array.isArray(p.history) ? p.history.slice(0, 20) : [],
      sound: p.sound !== false,
    };
  } catch {
    return DEFAULTS;
  }
}

/* ---------------- icons ---------------- */

function SpadeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2C9.2 5.7 3.5 8.5 3.5 12.6c0 2.7 2.1 4.8 4.7 4.8 1 0 2-.36 2.7-1-.24 1.9-1 3.6-2.2 4.5-.3.24-.1.9.35.9h6.9c.45 0 .65-.66.35-.9-1.2-.9-1.96-2.6-2.2-4.5.7.64 1.7 1 2.7 1 2.6 0 4.7-2.1 4.7-4.8C20.5 8.5 14.8 5.7 12 2z" />
    </svg>
  );
}

function CoinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 7.5h7M8.5 10.8h7M10 7.5l4.5 9h-6" />
    </svg>
  );
}

function SoundOnIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SoundOffIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------- confetti ---------------- */

function Confetti({ seed }: { seed: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        id: `${seed}-${i}`,
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        dur: 1.5 + Math.random(),
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        w: 6 + Math.random() * 5,
        h: 10 + Math.random() * 6,
      })),
    [seed]
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: p.w,
            height: p.h,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ---------------- main game ---------------- */

export default function CasinoGame() {
  const [balance] = useGameBalance("bollywood-casino", START_BALANCE);
  const pool = usePoolLifecycle("bollywood-casino");
  const [sound, setSound] = useState(true);
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const [phase, setPhase] = useState<Phase>("betting");
  const [bets, setBets] = usePoolRoundState<Bets>("bollywood-casino", "bets", { andar: 0, bahar: 0, joker: 0 });
  const [selChip, setSelChip] = useState(50);
  const [timeLeft, setTimeLeft] = useState(BET_TIME);

  const [firstCard, setFirstCard] = useState<CardT | null>(null);
  const [firstRevealed, setFirstRevealed] = useState(false);
  const [cards, setCards] = useState<DealtCard[]>([]);
  const [revealed, setRevealed] = useState(0);
  const [confetti, setConfetti] = useState(0);

  const dealGuard = useRef(false);
  const mountedRef = useRef(false);
  const restartedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const sfx = useCallback((k: Sfx) => {
    if (soundRef.current) playSfx(k);
  }, []);

  const total = bets.andar + bets.bahar + bets.joker;
  const busted = phase === "betting" && total === 0 && balance < CHIP_DEFS[0].v;

  /* restore persisted state once on mount */
  useEffect(() => {
    const p = loadPersisted();
    setStats(p.stats);
    setHistory(p.history);
    setSound(p.sound);
  }, []);

  /* persist */
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ balance, stats, history, sound }));
    } catch {
      /* storage best-effort */
    }
  }, [balance, stats, history, sound]);

  const newHand = useCallback(async () => {
    if (!mountedRef.current || phase !== "settled" || restartedRef.current) return;
    restartedRef.current = true;
    setBets({ andar: 0, bahar: 0, joker: 0 });
    setFirstCard(null);
    setFirstRevealed(false);
    setCards([]);
    setRevealed(0);
    setTimeLeft(BET_TIME);
    setPhase("betting");
  }, [phase]);

  /** `spectator`: no-stake live hand that keeps the table running without any wallet/stat/history effect. */
  const startDeal = useCallback(async (spectator = false) => {
    if (pool.busy) return;
    if (dealGuard.current || phase !== "betting") return;
    const totalNow = bets.andar + bets.bahar + bets.joker;
    if (totalNow <= 0 && !spectator) return;
    const staked = totalNow > 0;
    dealGuard.current = true;
    restartedRef.current = false;
    setPhase("dealing");
    sfx("deal");

    const hand = staked
      ? await pool.resolveServer({ bets }) as (Hand & { payout: number }) | null
      : { ...buildHand(Math.random() < 0.5 ? "andar" : "bahar", Math.random() < 0.03), payout: 0 };
    if (!hand) { setTimeLeft(BET_TIME); setPhase("betting"); dealGuard.current = false; return; }

    await sleep(400);
    if (!mountedRef.current) return;
    setFirstCard(hand.first);
    await sleep(350);
    if (!mountedRef.current) return;
    setFirstRevealed(true);
    sfx("card");
    await sleep(650);
    if (!mountedRef.current) return;

    for (let i = 0; i < hand.cards.length; i += 1) {
      const c = hand.cards[i];
      setCards((prev) => [...prev, c]);
      sfx("card");
      await sleep(300);
      if (!mountedRef.current) return;
      setRevealed((r) => r + 1);
      await sleep(c.isPoint ? 800 : 230);
      if (!mountedRef.current) return;
    }

    if (!staked) {
      setPhase("settled");
      dealGuard.current = false;
      return;
    }

    const winAmt = hand.payout;

    const net = winAmt - totalNow;
    const won = net > 0;
    pool.announce();
    sfx(won ? (hand.winner === "joker" ? "joker" : "win") : "lose");
    if (won) setConfetti((x) => x + 1);
    setHistory((h) => [{ winner: hand.winner, net }, ...h].slice(0, 20));
    setStats((s) => ({
      hands: s.hands + 1,
      wins: s.wins + (won ? 1 : 0),
      losses: s.losses + (won ? 0 : 1),
      net: s.net + net,
    }));
    setPhase("settled");
    dealGuard.current = false;
  }, [bets, phase, sfx]);

  /* betting countdown */
  useEffect(() => {
    if (phase !== "betting") return;
    const id = setInterval(() => setTimeLeft((t) => Math.max(0, t - 0.1)), 100);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "betting" && timeLeft <= 0) {
      void startDeal(total <= 0);
    }
  }, [timeLeft, phase, total, startDeal]);

  /* auto next hand */
  useEffect(() => {
    if (phase !== "settled") return;
    const id = setTimeout(newHand, 6500);
    return () => clearTimeout(id);
  }, [phase, newHand]);

  /* confetti cleanup */
  useEffect(() => {
    if (!confetti) return;
    const id = setTimeout(() => setConfetti(0), 2400);
    return () => clearTimeout(id);
  }, [confetti]);

  /* ---- bet actions ---- */
  const place = async (zone: Zone) => {
    if (phase !== "betting" || dealGuard.current) return;
    if (balance < selChip) return;
    pool.checkpoint({ bets: { ...bets, [zone]: bets[zone] + selChip } });
    if (!await pool.stake(selChip)) return;
    setBets((b) => ({ ...b, [zone]: b[zone] + selChip }));
    sfx("chip");
  };

  const clearBets = async () => {
    if (phase !== "betting" || total === 0) return;
    if (!await pool.refund()) return;
    setBets({ andar: 0, bahar: 0, joker: 0 });
    sfx("chip");
  };

  const doubleBets = async () => {
    if (phase !== "betting" || total === 0 || total > balance) return;
    pool.checkpoint({ bets: { andar: bets.andar * 2, bahar: bets.bahar * 2, joker: bets.joker * 2 } });
    if (!await pool.stake(total)) return;
    setBets((b) => ({ andar: b.andar * 2, bahar: b.bahar * 2, joker: b.joker * 2 }));
    sfx("chip");
  };

  const sideCards = (side: Side) =>
    cards.map((c, i) => ({ c, i })).filter((x) => x.c.side === side);
  const andItems = sideCards("andar");
  const bahItems = sideCards("bahar");

  const renderZone = (zone: "andar" | "bahar") => (
    <section
      className={`zone ${phase === "betting" ? "can-bet" : ""} ${bets[zone] > 0 ? "zone-live" : ""}`}
      onClick={() => place(zone)}
      role="button"
      aria-label={`Bet on ${zone}`}
    >
      <div className="text-center">
        <div className="zone-title">{zone === "andar" ? "ANDAR" : "BAHAR"}</div>
        <div className="zone-payout">1 : 1 PAYOUT</div>
      </div>
      <div className="cards-row">
        {(zone === "andar" ? andItems : bahItems).map(({ c, i }) => (
          <PlayingCard key={c.id} card={c} variant="m" revealed={i < revealed} point={c.isPoint} />
        ))}
      </div>
      {bets[zone] > 0 ? (
        <div className="bet-tag">{fmt(bets[zone])}</div>
      ) : (
        <div className="bet-tag bet-tag-empty">TAP TO BET</div>
      )}
    </section>
  );

  return (
    <div className="bollywood-wrap h-full w-full flex flex-col justify-between overflow-y-auto overflow-x-hidden px-1.5 sm:px-3 py-1">
      {confetti > 0 && <Confetti seed={confetti} />}

      {/* ---------- header ---------- */}
      <header className="mx-auto w-full max-w-[1240px] px-2 pt-1 pb-1 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="logo-badge">
              <SpadeIcon className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div>
              <h1 className="font-display text-[18px] sm:text-[24px] leading-none tracking-wider text-[#f2c14e]">
                BOLLYWOOD <span className="text-[#ff8a5c]">CASINO</span>
              </h1>
              <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.25em] text-[#c9a25f]/70">
                Royal Andar Bahar Table
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="balance-pill py-1 px-2 sm:px-3">
              <CoinIcon className="h-5 w-5 sm:h-6 sm:w-6 text-[#f2c14e]" />
              <div className="leading-tight">
                <div className="stat-label text-[8px] sm:text-[10px]">Banka</div>
                <span key={balance} className="balance-tick block text-[13px] sm:text-[15px] font-extrabold text-[#ffe9b0]">
                  {fmt(balance)}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setSound((s) => !s)}
              aria-label="Toggle sound"
              title={sound ? "Sound on" : "Sound off"}
            >
              {sound ? <SoundOnIcon className="h-4 w-4 sm:h-5 sm:w-5" /> : <SoundOffIcon className="h-4 w-4 sm:h-5 sm:w-5" />}
            </button>
          </div>
        </div>
        <div className="marquee mt-1.5 hidden sm:flex" aria-hidden="true">
          {Array.from({ length: 28 }).map((_, i) => (
            <span key={i} className="bulb" />
          ))}
        </div>
      </header>

      {/* ---------- main ---------- */}
      <main className="mx-auto flex flex-col lg:grid w-full max-w-[1240px] flex-1 items-stretch gap-2 px-1 py-1 lg:grid-cols-[minmax(0,1fr)_280px]">
        {/* table */}
        <div className="felt relative flex flex-col justify-between overflow-hidden rounded-[18px] sm:rounded-[22px] p-2 sm:p-4 flex-1 shrink-0">
          {/* betting timer bar */}
          <div className="absolute left-0 right-0 top-0 h-1.5 bg-black/30">
            <div
              className={`h-full transition-[width] duration-100 ease-linear ${timeLeft <= 5 ? "bg-red-500" : "bg-[#f2c14e]"}`}
              style={{ width: `${(timeLeft / BET_TIME) * 100}%` }}
            />
          </div>
          {phase === "betting" && (
            <span className="absolute right-3 top-2.5 z-10 text-[11px] font-bold text-[#ffe9b0]/75">
              {Math.ceil(timeLeft)}s
            </span>
          )}

          <div className="grid grid-cols-3 gap-2 pt-2 sm:gap-4">
            {renderZone("andar")}

            {/* joker / dealer card */}
            <section
              className={`zone ${phase === "betting" ? "can-bet" : ""} ${bets.joker > 0 ? "zone-live" : ""}`}
              onClick={() => place("joker")}
              role="button"
              aria-label="Bet on joker"
            >
              <div className="text-center">
                <div className="zone-title">JOKER</div>
                <div className="zone-payout">11 : 1 PAYOUT</div>
              </div>
              <div className="flex flex-1 items-center justify-center">
                <div className="joker-frame">
                  <div className="joker-frame-inner">
                    {firstCard ? (
                      <PlayingCard card={firstCard} variant="j" revealed={firstRevealed} />
                    ) : (
                      <div className="joker-empty">
                        <SpadeIcon className="h-7 w-7 opacity-40" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {bets.joker > 0 ? (
                <div className="bet-tag">{fmt(bets.joker)}</div>
              ) : (
                <div className="bet-tag bet-tag-empty">TAP TO BET</div>
              )}
            </section>

            {renderZone("bahar")}
          </div>

          {/* controls */}
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {CHIP_DEFS.map((c) => (
                <button
                  key={c.v}
                  type="button"
                  disabled={phase !== "betting" || balance < c.v}
                  onClick={() => setSelChip(c.v)}
                  className={`chip shrink-0 ${c.cls} ${selChip === c.v && balance >= c.v ? "chip-sel" : ""}`}
                  aria-label={`Select ${fmt(c.v)} chip`}
                >
                  <span>{c.label}</span>
                </button>
              ))}
              <BetAmountInput
                value={selChip}
                onChange={(n) => setSelChip(Math.max(1, n))}
                disabled={phase !== "betting"}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-ghost !bg-gradient-to-r !from-indigo-600 !to-purple-600 !text-white !border-indigo-400/50 shadow-md hover:brightness-110 font-bold active:scale-95 py-2 px-3.5 text-xs rounded-xl"
                disabled={phase !== "betting" || total === 0 || total > balance}
                onClick={doubleBets}
              >
                2&times;
              </button>
              <button
                type="button"
                className="btn-ghost !bg-gradient-to-r !from-rose-600 !to-red-600 !text-white !border-rose-400/50 shadow-md hover:brightness-110 font-bold active:scale-95 py-2 px-3.5 text-xs rounded-xl"
                disabled={phase !== "betting" || total === 0}
                onClick={clearBets}
              >
                CLEAR
              </button>
              <button
                type="button"
                className="btn-gold !bg-gradient-to-r !from-amber-400 !via-yellow-500 !to-amber-600 !text-slate-950 !border !border-amber-300 font-black shadow-lg shadow-amber-500/40 hover:brightness-110 active:scale-95 py-2 px-5 text-sm rounded-xl"
                disabled={phase !== "betting" || total === 0}
                onClick={() => {
                  void startDeal();
                }}
              >
                <SpadeIcon className="h-4 w-4" />
                <span>{phase === "dealing" ? "DEALING\u2026" : total > 0 ? `DEAL \u00B7 ${fmt(total)}` : "DEAL"}</span>
              </button>
            </div>
          </div>

          {/* busted overlay */}
          {busted && (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[22px] bg-black/80 p-4 backdrop-blur-[3px]">
              <div className="result-card">
                <SpadeIcon className="mx-auto h-10 w-10 text-[#f2c14e]" />
                <div className="result-big !text-[24px] text-[#f2c14e] sm:!text-[30px]">BANKA KHALI HO GAYA!</div>
                <p className="mt-2 text-[13px] text-[#ffe9b0]/70">
                  Insufficient balance.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* sidebar */}
        <aside className="hidden lg:grid gap-2.5 overflow-y-auto">
          <div className="panel p-3">
            <h3 className="text-xs mb-1 font-bold">RECENT HANDS</h3>
            {history.length === 0 ? (
              <p className="text-[11px] text-[#ffe9b0]/50">Abhi koi hand nahi kheli — pehla bet lagao!</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {history.slice(0, 15).map((h, i) => (
                  <span
                    key={`${history.length}-${i}`}
                    className={`pill ${h.winner === "andar" ? "pill-a" : h.winner === "bahar" ? "pill-b" : "pill-j"}`}
                  >
                    {h.winner === "andar" ? "A" : h.winner === "bahar" ? "B" : "J"}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="panel p-3">
            <h3 className="text-xs mb-1 font-bold">TABLE INFO</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="stat-cell p-2">
                <div className="stat-label text-[10px]">Hands Played</div>
                <div className="stat-value text-sm">{stats.hands}</div>
              </div>
              <div className="stat-cell p-2">
                <div className="stat-label text-[10px]">Table Status</div>
                <div className="stat-value text-sm text-[#7fe3ac]">LIVE</div>
              </div>
            </div>
          </div>

          <div className="panel p-3">
            <h3 className="text-xs mb-1 font-bold">PAYOUTS</h3>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-[#ffe9b0]/80">ANDAR</span>
                <span className="font-bold text-[#f2c14e]">1 : 1</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#ffe9b0]/80">BAHAR</span>
                <span className="font-bold text-[#f2c14e]">1 : 1</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#ffe9b0]/80">JOKER</span>
                <span className="font-bold text-[#f2c14e]">11 : 1</span>
              </div>
            </div>
          </div>
        </aside>
      </main>

      <footer className="hidden sm:block mx-auto w-full max-w-[1240px] px-4 pb-1 pt-0.5 text-center text-[10px] tracking-wide text-[#ffe9b0]/35 shrink-0">
        18+ &middot; Demo balance only &middot; Play responsibly
      </footer>
    </div>
  );
}
