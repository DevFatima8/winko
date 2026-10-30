"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "./treasure-bowl.css";
import { useGameBalance, usePoolLifecycle } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";

type SymbolId = "coin" | "lantern" | "peach" | "jade" | "ingot" | "bowl";
type ResultKind = "idle" | "win" | "loss" | "huge";

type SymbolTile = {
  id: SymbolId;
  label: string;
  mark: string;
  tone: string;
  payout: string;
};

const SYMBOLS: SymbolTile[] = [
  { id: "coin", label: "Golden coin", mark: "Rs", tone: "coin", payout: "2x" },
  { id: "lantern", label: "Lucky lantern", mark: "✦", tone: "lantern", payout: "3x" },
  { id: "peach", label: "Fortune peach", mark: "♣", tone: "peach", payout: "5x" },
  { id: "jade", label: "Jade ring", mark: "◉", tone: "jade", payout: "8x" },
  { id: "ingot", label: "Golden ingot", mark: "◆", tone: "ingot", payout: "12x" },
  { id: "bowl", label: "Treasure bowl", mark: "⌂", tone: "bowl", payout: "25x" },
];

const STARTING_REELS: SymbolId[] = [
  "coin",
  "jade",
  "lantern",
  "ingot",
  "bowl",
  "peach",
  "lantern",
  "coin",
  "jade",
];

const BETS: number[] = [...BET_PRESETS];

function randomReels() {
  return Array.from({ length: 9 }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].id);
}

function getSymbol(id: SymbolId) {
  return SYMBOLS.find((symbol) => symbol.id === id) ?? SYMBOLS[0];
}

type SpinOutcome = { isWin: boolean; isHuge: boolean; payout: number; finalReels: SymbolId[] };
function isSpinOutcome(value: unknown): value is SpinOutcome {
  if (!value || typeof value !== "object") return false;
  return "isWin" in value && typeof value.isWin === "boolean" &&
    "isHuge" in value && typeof value.isHuge === "boolean" &&
    "payout" in value && typeof value.payout === "number" && Number.isFinite(value.payout) && value.payout >= 0 &&
    "finalReels" in value && Array.isArray(value.finalReels) && value.finalReels.length === 9 &&
    value.finalReels.every(id => SYMBOLS.some(symbol => symbol.id === id));
}

function formatCredits(value: number) {
  return "Rs. " + new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function BowlIcon({ small = false }: { small?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={small ? "bowl-icon bowl-icon--small" : "bowl-icon"}
      viewBox="0 0 64 64"
      fill="none"
    >
      <path d="M11 21h42l-4 11c-2.5 7.1-8.6 12-17 12s-14.5-4.9-17-12L11 21Z" fill="currentColor" opacity=".95" />
      <path d="M11 21c.8 15.6 8.1 25 21 25s20.2-9.4 21-25" stroke="#fff3b0" strokeWidth="2.5" />
      <path d="M16 17c0-6 7.2-10 16-10s16 4 16 10" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M8 18h48" stroke="#fff3b0" strokeWidth="3" strokeLinecap="round" />
      <path d="M21 52h22M26 46v6m12-6v6" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <circle cx="32" cy="16" r="3" fill="#fff3b0" />
    </svg>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 10v4h3l4 3V7l-4 3H4Z" fill="currentColor" stroke="none" />
      {muted ? <path d="m16 10 4 4m0-4-4 4" strokeLinecap="round" /> : <path d="M15 9.5a4 4 0 0 1 0 5M17.5 7a7.5 7.5 0 0 1 0 10" strokeLinecap="round" />}
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" strokeLinecap="round" />
    </svg>
  );
}

function SymbolCard({ id, winning, spinning }: { id: SymbolId; winning?: boolean; spinning?: boolean }) {
  const symbol = getSymbol(id);
  return (
    <div className={`symbol-card symbol-card--${symbol.tone} ${winning ? "symbol-card--winner" : ""} ${spinning ? "symbol-card--spinning" : ""}`}>
      <span className="symbol-card__shine" />
      <span className="symbol-card__mark" aria-label={symbol.label}>{symbol.mark}</span>
      <span className="symbol-card__label">{symbol.label}</span>
    </div>
  );
}

export default function HomePage() {
  const [credits, setCredits] = useGameBalance("treasure-bowl", 1000);
  const pool = usePoolLifecycle("treasure-bowl");
  const [stake, setStake] = useState(BET_PRESETS[0]);
  const [reels, setReels] = useState<SymbolId[]>(STARTING_REELS);
  const [isSpinning, setIsSpinning] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [muted, setMuted] = useState(false);
  const [resultKind, setResultKind] = useState<ResultKind>("idle");
  const [resultText, setResultText] = useState("CHOOSE YOUR STAKE");
  const [winAmount, setWinAmount] = useState(0);
  const [spinCount, setSpinCount] = useState(0);
  const [history, setHistory] = useState<ResultKind[]>(["win", "loss", "loss", "win", "loss"]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    intervalRef.current = null;
    timeoutRef.current = null;
  }, []);

  const spin = useCallback(async () => {
    if (isSpinning || !Number.isFinite(stake) || stake < 10 || credits < stake) {
      if (!Number.isFinite(stake) || stake < 10) setResultText("Minimum bet is Rs. 10.");
      if (credits < stake) {
        setAutoMode(false);
        setResultText("INSUFFICIENT BALANCE — CHOOSE A SMALLER STAKE");
      }
      return;
    }

    if (!await pool.start(stake, () => setCredits((value) => value - stake))) return;
    setIsSpinning(true);
    setResultKind("idle");
    setResultText("THE REELS ARE TURNING...");
    setWinAmount(0);
    setSpinCount((value) => value + 1);

    intervalRef.current = setInterval(() => {
      setReels(randomReels());
    }, 75);

    timeoutRef.current = setTimeout(async () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;

      const outcome = await pool.resolveServer({});
      if (!isSpinOutcome(outcome)) {
        setAutoMode(false);
        setIsSpinning(false);
        setResultText("Result confirmation failed. Please retry or reopen the game.");
        return;
      }
      const { isWin, isHuge, payout, finalReels } = outcome;
      const nextResult: ResultKind = isHuge ? "huge" : isWin ? "win" : "loss";

      setReels(finalReels);
      setIsSpinning(false);
      setResultKind(nextResult);
      setResultText(pool.enabled ? `PROVISIONAL CLAIM ${payout} — daily settlement pending` : isHuge ? "X-HUGE TREASURE!" : isWin ? "LUCKY HIT!" : "TRY YOUR LUCK AGAIN");
      setWinAmount(payout);
      setHistory((items) => [nextResult, ...items].slice(0, 7));
    }, 850);
  }, [credits, isSpinning, stake, setCredits]);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  useEffect(() => {
    if (!autoMode || isSpinning || stake < 10 || credits < stake) return;
    const timer = setTimeout(spin, 1100);
    return () => clearTimeout(timer);
  }, [autoMode, credits, isSpinning, spin, stake]);

  const adjustStake = (direction: number) => {
    const next =
      direction > 0 ? BETS.find((b) => b > stake) : [...BETS].reverse().find((b) => b < stake);
    if (next !== undefined) setStake(next);
  };

  const resetDemo = () => {
    clearTimers();
    setStake(100);
    setReels(STARTING_REELS);
    setIsSpinning(false);
    setAutoMode(false);
    setResultKind("idle");
    setResultText("CHOOSE YOUR STAKE");
    setWinAmount(0);
    setHistory(["win", "loss", "loss", "win", "loss"]);
  };

  return (
    <main className="treasure-bowl-app">
      <div className="ambient-glow ambient-glow--left" />
      <div className="ambient-glow ambient-glow--right" />
      <section className="treasure-bowl-shell" aria-label="Treasure Bowl X-Huge demo game">
        <header className="topbar">
          <div className="brand-lockup">
            <div className="brand-mark"><BowlIcon /></div>
            <div>
              <div className="brand-name">TREASURE <span>BOWL</span></div>
              <div className="brand-subtitle">X-HUGE <i /> FORTUNE REELS</div>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="demo-badge"><span /> DEMO MODE</div>
            <button className="icon-button" onClick={() => setMuted((value) => !value)} aria-label={muted ? "Unmute game" : "Mute game"}><SpeakerIcon muted={muted} /></button>
            <button className="icon-button" aria-label="Game information"><InfoIcon /></button>
            <button className="avatar-button" aria-label="Player profile">P</button>
          </div>
        </header>

        <div className="game-layout">
          <div className="play-column">
            <div className="session-strip">
              <div className="session-strip__item"><span className="live-dot" /> LIVE DEMO SESSION</div>
              <div className="session-strip__item session-strip__item--muted">SPIN <strong>#{String(spinCount).padStart(4, "0")}</strong></div>
              <div className="session-strip__item session-strip__item--muted">MAX WIN <strong>25,000</strong></div>
            </div>

            <section className={`reel-stage ${resultKind === "huge" ? "reel-stage--huge" : ""}`}>
              <div className="stage-corner stage-corner--tl" /><div className="stage-corner stage-corner--tr" /><div className="stage-corner stage-corner--bl" /><div className="stage-corner stage-corner--br" />
              <div className="stage-heading">
                <span className="eyebrow">THE GOLDEN REEL</span>
                <h1>{resultKind === "huge" ? "X-HUGE" : "TREASURE BOWL"}</h1>
                <span className="heading-rule"><i /><b /><i /></span>
              </div>
              <div className="reel-window-wrap">
                <div className="reel-window-glow" />
                <div className="reel-window" role="group" aria-label="Three by three treasure reel">
                  <div className="payline payline--top" />
                  <div className="payline payline--middle"><span>✦</span><span>✦</span></div>
                  <div className="payline payline--bottom" />
                  {reels.map((symbol, index) => (
                    <SymbolCard key={`${index}-${symbol}`} id={symbol} spinning={isSpinning} winning={!isSpinning && resultKind !== "loss" && (resultKind === "huge" || index < 3)} />
                  ))}
                </div>
              </div>
              <div className={`result-banner result-banner--${resultKind}`} aria-live="polite">
                <span className="result-banner__ornament">◆</span>
                <span>{resultText}</span>
                {winAmount > 0 && <strong>+{formatCredits(winAmount)}</strong>}
                <span className="result-banner__ornament">◆</span>
              </div>
              <div className="stage-footnote"><span>✦</span> LAND 3 MATCHING SYMBOLS TO WIN <span>✦</span></div>
            </section>

            <section className="control-deck" aria-label="Game controls">
              <div className="control-deck__top">
                <button className={`auto-button ${autoMode ? "auto-button--active" : ""}`} onClick={() => setAutoMode((value) => !value)} disabled={isSpinning && !autoMode}>
                  <span className="auto-button__icon">↻</span>
                  <span><b>{autoMode ? "AUTO ON" : "AUTO PLAY"}</b><small>{autoMode ? "tap to stop" : "10 spins"}</small></span>
                </button>
                <div className="stake-control">
                  <button onClick={() => adjustStake(-1)} disabled={isSpinning || stake === BETS[0]} aria-label="Decrease stake">−</button>
                  <div className="stake-value"><small>STAKE</small><strong>{formatCredits(stake)}</strong></div>
                  <button onClick={() => adjustStake(1)} disabled={isSpinning || stake === BETS[BETS.length - 1]} aria-label="Increase stake">+</button>
                </div>
                <button className="spin-button" onClick={spin} disabled={isSpinning || stake < 10 || credits < stake} aria-label="Spin the treasure reels">
                  <span className="spin-button__ring" /><span className="spin-button__label">{isSpinning ? "..." : "SPIN"}</span><span className="spin-button__spark">✦</span>
                </button>
              </div>
              <div className="stake-chips">
                {BETS.map((b) => (
                  <button key={b} type="button" className="stake-chip" disabled={isSpinning} onClick={() => setStake(b)} style={{ borderRadius: 8, border: stake === b ? "1px solid #ffd76a" : "1px solid rgba(255,255,255,0.25)", background: stake === b ? "rgba(255,215,106,0.25)" : "rgba(0,0,0,0.35)", color: "#fff", fontWeight: 700, fontSize: 12 }}>{b}</button>
                ))}
                <input type="number" min={10} inputMode="numeric" aria-label="Custom stake" placeholder="Custom" disabled={isSpinning} value={stake || ""} onChange={(e) => setStake(Math.max(0, Math.floor(Number(e.target.value)) || 0))} className="stake-chips__custom" style={{ borderRadius: 8, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(0,0,0,0.45)", color: "#fff", fontWeight: 700, fontSize: 12, textAlign: "center" }} />
              </div>
              <div className="control-deck__bottom">
                <div className="balance-readout"><span>DEMO BALANCE</span><strong>{formatCredits(credits)}</strong><small>virtual balance</small></div>
                <div className="progress-track"><span style={{ width: `${Math.min(100, (credits / 10000) * 100)}%` }} /></div>
                <button className="reset-button" onClick={resetDemo}>RESET DEMO</button>
              </div>
            </section>
          </div>

          <aside className="side-panel">
            <div className="panel-title"><span className="panel-title__icon">✦</span><div><span className="eyebrow">YOUR SESSION</span><h2>FORTUNE BOARD</h2></div></div>
            <div className="session-card">
              <div className="session-card__label">CURRENT BALANCE</div>
              <div className="session-card__amount"><span>◈</span> {formatCredits(credits)}</div>
              <div className="session-card__note"><span className="positive-dot" /> demo credits only</div>
            </div>
            <div className="panel-divider"><span>RECENT SPINS</span></div>
            <div className="history-row" aria-label="Recent spin results">
              {history.map((item, index) => <span key={`${item}-${index}`} className={`history-chip history-chip--${item}`} title={item === "loss" ? "No win" : item}>{item === "huge" ? "✦" : item === "win" ? "✓" : "×"}</span>)}
              <span className="history-caption">last {history.length}</span>
            </div>
            <div className="panel-divider"><span>PAYTABLE</span></div>
            <div className="paytable">
              {SYMBOLS.slice().reverse().map((symbol) => <div className="paytable-row" key={symbol.id}><div className={`paytable-symbol paytable-symbol--${symbol.tone}`}>{symbol.mark}</div><span>{symbol.label}</span><strong>{symbol.payout}</strong></div>)}
            </div>
            <div className="feature-card"><div className="feature-card__icon"><BowlIcon small /></div><div><strong>X-HUGE FEATURE</strong><p>Three treasure bowls unlock the royal reel.</p></div><span className="feature-card__multiplier">25x</span></div>
          </aside>
        </div>
        <footer className="game-footer"><span>© 2026 TREASURE BOWL</span><span className="footer-pips"><i /><i /><i /></span><span>ENTERTAINMENT DEMO · PLAY RESPONSIBLY</span></footer>
      </section>
    </main>
  );
}
