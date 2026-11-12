"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameBalance, usePoolLifecycle } from "@/lib/walletSync";
import BetAmountInput from "@/components/BetAmountInput";
import { useLiveTable } from "@/components/teen-patti/useLiveTable";
import "./thai-hi-lo.css";
import DiceFace from "./dice-face";
import {
  BET_OPTIONS,
  CHIP_VALUES,
  MIN_BET,
  STARTING_BALANCE,
  isHiLoOutcome,
  isTriple,
  isWin,
  sumOf,
  type BetType,
  type DiceRoll,
} from "./lib/hi-lo";

type Phase = "idle" | "rolling" | "result";

interface HistoryEntry {
  id: number;
  dice: DiceRoll;
  sum: number;
  bet: BetType;
  won: boolean;
  profit: number;
}

interface RoundResult {
  won: boolean;
  profit: number;
  sum: number;
  claim: number;
}

interface SessionStats {
  wagered: number;
  wins: number;
  losses: number;
  profit: number;
}

const MAX_HISTORY = 12;
const ROLL_MS = 1300;
const HOLD_MS = 1800;
const STORAGE_BALANCE = "thai-hilo:balance";
const STORAGE_HISTORY = "thai-hilo:history";

const randDie = () => 1 + Math.floor(Math.random() * 6);

const formatMoney = (n: number) => n.toLocaleString("en-US");

const BET_META: Record<BetType, { name: string; tileClass: string }> = {
  low: { name: "LOW", tileClass: "hilo-tile--low" },
  high: { name: "HIGH", tileClass: "hilo-tile--high" },
  odd: { name: "ODD", tileClass: "hilo-tile--odd" },
  even: { name: "EVEN", tileClass: "hilo-tile--even" },
  triple: { name: "TRIPLE", tileClass: "hilo-tile--triple" },
};

const CHIP_CLASSES = [
  "hilo-chip--10",
  "hilo-chip--50",
  "hilo-chip--100",
  "hilo-chip--500",
  "hilo-chip--1000",
];

function useSound(muted: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);

  const tone = useCallback(
    (freq: number, delay: number, duration: number, type: OscillatorType, volume: number) => {
      if (muted) return;
      try {
        if (!ctxRef.current) ctxRef.current = new window.AudioContext();
        const ctx = ctxRef.current;
        if (ctx.state === "suspended") void ctx.resume();
        const t0 = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + duration + 0.05);
      } catch {
        /* audio unavailable */
      }
    },
    [muted],
  );

  const playClick = useCallback(() => tone(880, 0, 0.05, "square", 0.05), [tone]);
  const playSelect = useCallback(() => tone(660, 0, 0.08, "triangle", 0.09), [tone]);
  const playRoll = useCallback(() => {
    for (let i = 0; i < 6; i++) tone(180 + i * 40, i * 0.07, 0.06, "square", 0.045);
  }, [tone]);
  const playWin = useCallback(() => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.22, "sine", 0.14));
  }, [tone]);
  const playLose = useCallback(() => {
    [392, 329.63, 261.63].forEach((f, i) => tone(f, i * 0.1, 0.24, "sine", 0.12));
  }, [tone]);

  return { playClick, playSelect, playRoll, playWin, playLose };
}

export default function HiLoGame() {
  const [balance] = useGameBalance("thai-hi-lo", STARTING_BALANCE);
  const pool = usePoolLifecycle("thai-hi-lo");
  const [betType, setBetType] = useState<BetType | null>(null);
  const [betAmount, setBetAmount] = useState<number>(MIN_BET);
  const [phase, setPhase] = useState<Phase>("idle");
  const [displayDice, setDisplayDice] = useState<DiceRoll>([4, 5, 6]);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [stats, setStats] = useState<SessionStats>({ wagered: 0, wins: 0, losses: 0, profit: 0 });
  const [muted, setMuted] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const timersRef = useRef<number[]>([]);
  const intervalRef = useRef<number | null>(null);
  const acceptedRef = useRef<Record<string, number> | null>(null);
  const roundLock = useRef(false);
  const live = useLiveTable({
    phase: phase === "idle" ? "betting" : phase, balance, draft: {} as Record<string, number>,
    targets: BET_OPTIONS.map((option) => option.id), minBet: MIN_BET, singleTarget: true,
    start: () => runRound(true),
    apply: (bets) => { acceptedRef.current = bets; },
  });

  const sound = useSound(muted);

  /* ---- persistence (localStorage only — no database) ---- */
  useEffect(() => {
    try {
      const savedHistory = window.localStorage.getItem(STORAGE_HISTORY);
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory) as HistoryEntry[];
        if (Array.isArray(parsed)) setHistory(parsed.slice(0, MAX_HISTORY));
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_BALANCE, String(balance));
    } catch {
      /* ignore */
    }
  }, [balance, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_HISTORY, JSON.stringify(history));
    } catch {
      /* ignore */
    }
  }, [history, hydrated]);

  /* ---- cleanup timers on unmount ---- */
  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    };
  }, []);

  const canRoll =
    phase === "idle" && betType !== null && Number.isSafeInteger(betAmount) && betAmount >= MIN_BET && betAmount <= balance;

  const handleSelectBet = (bet: BetType) => {
    if (phase === "rolling") return;
    sound.playSelect();
    setBetType(bet);
  };

  const handleChip = (value: number) => {
    if (phase === "rolling") return;
    sound.playClick();
    setBetAmount(Math.min(value, Math.max(MIN_BET, balance)));
  };

  const handleClear = () => {
    if (phase === "rolling") return;
    sound.playClick();
    setBetType(null);
    setBetAmount(MIN_BET);
  };

  const settleRound = (outcome: DiceRoll, bet: BetType, wager: number, payout: number) => {
    const won = wager > 0 && isWin(bet, outcome);
    const profit = payout - wager;
    if (wager > 0) pool.announce();
    setDisplayDice(outcome);
    setPhase("result");
    timersRef.current.push(window.setTimeout(() => {
      setRoundResult(null);
      setBetType(null);
      setPhase("idle");
    }, HOLD_MS));
    if (wager <= 0) return;
    const total = sumOf(outcome);

    setStats((s) => ({
      wagered: s.wagered + wager,
      wins: s.wins + (won ? 1 : 0),
      losses: s.losses + (won ? 0 : 1),
      profit: s.profit + profit,
    }));
    setHistory((h) =>
      [{ id: Date.now(), dice: outcome, sum: total, bet, won, profit }, ...h].slice(0, MAX_HISTORY),
    );
    setRoundResult({ won, profit, sum: total, claim: payout });
    setPhase("result");
    if (won) sound.playWin();
    else sound.playLose();

  };

  const runRound = async (spectator: boolean) => {
    if (pool.busy || roundLock.current) return;
    if (phase !== "idle") return;
    if (!spectator && (!canRoll || betType === null)) return;
    const next = spectator ? acceptedRef.current ?? {} : { [betType!]: betAmount };
    const snapshot = live.begin(next);
    if (!snapshot) return;
    acceptedRef.current = null;
    const entry = Object.entries(snapshot).find(([, amount]) => amount > 0);
    const bet = (entry?.[0] ?? "low") as BetType;
    const wager = entry?.[1] ?? 0;
    roundLock.current = true;
    setRoundResult(null);
    setPhase("rolling");
    let outcome: DiceRoll = [randDie(), randDie(), randDie()];
    let payout = 0;
    try {
      if (wager > 0) {
        const selection = { bet };
        if (!await pool.start(wager, () => {}, selection)) {
          live.release();
          setPhase("idle");
          return;
        }
        const reply = await pool.resolveServer(selection);
        if (!isHiLoOutcome(reply) || reply.won !== isWin(bet, reply.dice) ||
            reply.payout !== (reply.won ? Math.round(wager * 200) / 100 : 0)) {
          if (reply !== null) window.dispatchEvent(new CustomEvent("wx:wallet-error", {
            detail: { error: "Thai Hi-Lo result could not be verified. Please reopen the game." },
          }));
          live.release();
          setPhase("idle");
          return;
        }
        outcome = reply.dice;
        payout = reply.payout;
      }
    } finally {
      roundLock.current = false;
    }
    sound.playRoll();

    intervalRef.current = window.setInterval(() => {
      setDisplayDice([randDie(), randDie(), randDie()]);
    }, 90);

    timersRef.current.push(
      window.setTimeout(() => {
        if (intervalRef.current !== null) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        settleRound(outcome, bet, wager, payout);
      }, ROLL_MS),
    );
  };
  const handleRoll = () => runRound(false);

  /* ---- derived view values ---- */
  const total = sumOf(displayDice);
  const triple = isTriple(displayDice);
  const totalClass = triple ? "hilo-sum--triple" : total >= 11 ? "hilo-sum--high" : "hilo-sum--low";
  const selectedOption = betType ? BET_OPTIONS.find((o) => o.id === betType) ?? null : null;
  const rounds = stats.wins + stats.losses;

  const rollLabel =
    phase === "rolling"
      ? "🎲 Rolling..."
      : betType === null
        ? "SELECT A SIDE TO BET"
        : betAmount > balance
          ? "INSUFFICIENT BALANCE"
          : `PLACE BET / ROLL · Rs. ${formatMoney(betAmount)}`;

  const marqueeText =
    "🎲 HI-LO 🎲 ";

  return (
    <main className="hilo-page">
      {live.controls}
      <div className="hilo-marquee" aria-hidden="true">
        <div className="hilo-marquee__track">
          <span>{marqueeText}</span>
          <span>{marqueeText}</span>
        </div>
      </div>

      <header className="hilo-header">
        <div className="hilo-header__inner">
          <div className="hilo-brand">
            <span className="hilo-brand__logo">🎲</span>
            <div>
              <h1 className="hilo-brand__title hilo-gold-text">HI-LO</h1>
              <p className="hilo-brand__sub">HI-LO · SIC BO · 3 DICE</p>
            </div>
          </div>
          <div className="hilo-header__actions">
            <div className="hilo-balance" title="Balance">
              <span className="hilo-balance__coin">Rs.</span>
              <span className="hilo-balance__amount">{formatMoney(balance)}</span>
            </div>
            <button
              type="button"
              className="hilo-icon-btn"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? "🔇" : "🔊"}
            </button>
            <button
              type="button"
              className="hilo-icon-btn"
              onClick={() => setShowRules(true)}
              aria-label="Rules"
            >
              ❓
            </button>
          </div>
        </div>
      </header>

      <div className="hilo-layout">
        {/* ---------- TABLE ---------- */}
        <section className="hilo-table">
          <div className="hilo-stage">
            <div className="hilo-stage__dice">
              {displayDice.map((value, i) => (
                <DiceFace
                  key={i}
                  value={value}
                  rolling={phase === "rolling"}
                  highlight={
                    phase === "result" && roundResult !== null
                      ? roundResult.won
                        ? "win"
                        : "lose"
                      : null
                  }
                />
              ))}
            </div>

            <div className={`hilo-sum ${totalClass}`}>{triple ? "TRIPLE" : total}</div>
            <p className="hilo-stage__hint">
              {triple
                ? "TRIPLE!"
                : total >= 11
                  ? "HIGH 11–17"
                  : "LOW 4–10"}
            </p>

            {roundResult !== null && (
              <div
                className={`hilo-flash ${roundResult.won ? "hilo-flash--win" : "hilo-flash--lose"} hilo-pop`}
              >
                <span className="hilo-flash__title">
                  {pool.enabled ? "DAILY PAYOUT PENDING" : roundResult.won ? "🎉 YOU WIN!" : ""}
                </span>
                <span className="hilo-flash__amount">
                  {pool.enabled ? `Provisional claim Rs. ${formatMoney(roundResult.claim)}` : roundResult.won
                    ? `+Rs. ${formatMoney(roundResult.profit)}`
                    : ""}
                </span>
              </div>
            )}
          </div>

          <div className="hilo-history">
            <div className="hilo-history__head">
              <span>History</span>
              <span>
                Win {stats.wins}
              </span>
            </div>
            <div className="hilo-history__strip">
              {history.length === 0 && (
                <span className="hilo-history__empty">
                  No history yet — place your first bet!
                </span>
              )}
              {history.map((h) => (
                <div
                  key={h.id}
                  className={`hilo-history__chip ${h.won ? "hilo-history__chip--win" : "hilo-history__chip--lose"}`}
                >
                  <span className="hilo-history__sum">{h.sum}</span>
                  <span className="hilo-history__dice">{h.dice.join(" · ")}</span>
                  <span className="hilo-history__bet">{BET_META[h.bet].name}</span>
                  <span className="hilo-history__profit">
                    {h.won ? `+${formatMoney(h.profit)}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- BETTING PANEL ---------- */}
        <aside className="hilo-panel">
          <div>
            <p className="hilo-label">1 · Choose chip</p>
            <div className="hilo-chips">
              {CHIP_VALUES.map((value, i) => (
                <button
                  key={value}
                  type="button"
                  className={`hilo-chip ${CHIP_CLASSES[i]} ${betAmount === value ? "hilo-chip--active" : ""}`}
                  onClick={() => handleChip(value)}
                  disabled={phase === "rolling"}
                >
                  Rs. {value}
                </button>
              ))}
            </div>
            <div className="hilo-custom-bet">
              <BetAmountInput
                value={betAmount}
                onChange={setBetAmount}
                label="Bet Rs."
                className="hilo-amount-input"
                disabled={phase === "rolling"}
              />
            </div>
          </div>

          <div>
            <p className="hilo-label">2 · Place bet</p>
            <div className="hilo-board">
              {BET_OPTIONS.map((option) => {
                const meta = BET_META[option.id];
                const selected = betType === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`hilo-tile ${meta.tileClass} ${selected ? "hilo-tile--selected" : ""}`}
                    onClick={() => handleSelectBet(option.id)}
                    disabled={phase === "rolling"}
                  >
                    <span className="hilo-tile__th">{option.labelTh}</span>
                    <span className="hilo-tile__en">{option.labelEn}</span>
                    <span className="hilo-tile__desc">{option.descriptionTh}</span>
                    <span className="hilo-tile__payout">Returns 2x</span>
                    {selected && (
                      <span className="hilo-tile__wager">Rs. {formatMoney(betAmount)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="hilo-summary">
            <div className="hilo-summary__row">
              <span>Your bet</span>
              <span>
                {selectedOption
                  ? `${selectedOption.labelTh} (${selectedOption.labelEn})`
                  : "—"}
              </span>
            </div>
            <div className="hilo-summary__row">
              <span>Amount</span>
              <span>Rs. {formatMoney(betAmount)}</span>
            </div>
            <div className="hilo-summary__row">
              <span>Profit if win</span>
              <span className="hilo-summary__pos">
                +Rs. {formatMoney(selectedOption ? betAmount : 0)}
              </span>
            </div>
          </div>

          <div className="hilo-actions">
            <button
              type="button"
              className="hilo-btn hilo-btn--ghost"
              onClick={handleClear}
              disabled={phase === "rolling"}
            >
              Clear
            </button>
            <button
              type="button"
              className="hilo-btn hilo-btn--roll"
              onClick={handleRoll}
              disabled={!canRoll}
            >
              {rollLabel}
            </button>
          </div>

          <div className="hilo-stats">
            <div className="hilo-stat">
              <span>Rounds</span>
              <strong>{rounds}</strong>
            </div>
            <div className="hilo-stat">
              <span>Wagered</span>
              <strong>Rs. {formatMoney(stats.wagered)}</strong>
            </div>
          </div>
        </aside>
      </div>

      {showRules && (
        <div className="hilo-modal" onClick={() => setShowRules(false)}>
          <div className="hilo-modal__card hilo-pop" onClick={(e) => e.stopPropagation()}>
            <h2 className="hilo-gold-text">How to play</h2>
            <ul>
              <li>Roll 3 dice — the total is between 3 and 18</li>
              <li>
                <b>LOW</b> total 4–10 — pays 1:1 (triple loses)
              </li>
              <li>
                <b>HIGH</b> total 11–17 — pays 1:1 (triple loses)
              </li>
              <li>
                <b>ODD / EVEN</b> total is odd or even — pays 1:1
              </li>
              <li>
                <b>TRIPLE</b> all three dice match — pays 1:1
              </li>
              <li>Accepted bets use your account wallet. See the pre-game rules for payout policy.</li>
            </ul>
            <button
              type="button"
              className="hilo-btn hilo-btn--roll"
              onClick={() => setShowRules(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <footer className="hilo-footer">
        Play responsibly. 18+.
      </footer>
    </main>
  );
}
