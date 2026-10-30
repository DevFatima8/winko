"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import { readBrowserSlotOutcome } from "@/lib/browserSlotTypes";
import { readSlotPresentation, saveSlotPresentation } from "@/lib/browserSlotPresentation";
import { createLossGrid, randomGrid, REGULAR_SYMBOLS, prepareServerSpin as legacyBonusSpin, type Cell, type SymbolId, type SpinResult } from "./game/engine";
import { BET_PRESETS } from "@/lib/betPresets";
import BetAmountInput from "@/components/BetAmountInput";
import "./gates-of-olympus.css";

type Modal = "help" | "settings" | "menu" | "auto" | null;

const SYMBOLS: Record<SymbolId, { glyph: string; name: string; className: string; payout: string }> = {
  ruby: { glyph: "◆", name: "Ruby", className: "ruby", payout: "8+ pays 1.5×" },
  sapphire: { glyph: "◆", name: "Sapphire", className: "sapphire", payout: "8+ pays 1.2×" },
  emerald: { glyph: "◆", name: "Emerald", className: "emerald", payout: "8+ pays 1×" },
  amethyst: { glyph: "◆", name: "Amethyst", className: "amethyst", payout: "8+ pays 0.8×" },
  crown: { glyph: "♛", name: "Royal Crown", className: "crown", payout: "8+ pays 3×" },
  goblet: { glyph: "♜", name: "Golden Goblet", className: "goblet", payout: "8+ pays 2.5×" },
  hourglass: { glyph: "⌛", name: "Hourglass", className: "hourglass", payout: "8+ pays 2×" },
  bolt: { glyph: "ϟ", name: "Storm Bolt", className: "bolt", payout: "4+ awards 6 free spins" },
};

const BETS: number[] = [...BET_PRESETS];
const STARTING_BALANCE = 1000;

function Icon({ name }: { name: "sound" | "mute" | "info" | "settings" | "menu" | "fullscreen" | "turbo" | "close" | "auto" }) {
  const paths: Record<typeof name, React.ReactNode> = {
    sound: <><path d="M5 10v4h3l4 3V7L8 10H5Z"/><path d="M15 9.5a4 4 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10"/></>,
    mute: <><path d="M5 10v4h3l4 3V7L8 10H5Z"/><path d="m16 10 5 5m0-5-5 5"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
    fullscreen: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></>,
    turbo: <><path d="m13 2-8 12h6l-1 8 9-13h-6V2Z"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    auto: <><path d="M20 11a8 8 0 0 0-14.9-3M4 4v5h5M4 13a8 8 0 0 0 14.9 3M20 20v-5h-5"/></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function GatesOfOlympusGame({ backHref = "/player" }: { backHref?: string }) {
  const [grid, setGrid] = useState<Cell[]>(() => {
    const saved = readSlotPresentation("gates-of-olympus");
    return saved?.outcome.spins[Math.max(0, saved.cursor - 1)]?.grid ?? createLossGrid();
  });
  const [balance] = useGameBalance("gates-of-olympus", STARTING_BALANCE);
  const pool = usePoolLifecycle("gates-of-olympus");
  const [bet, setBet] = usePoolRoundState<number>("gates-of-olympus", "bet", 100);
  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState<SymbolId | null>(null);
  const [winAmount, setWinAmount] = useState(0);
  const [message, setMessage] = useState("PLACE YOUR BET");
  const [sound, setSound] = useState(true);
  const [turbo, setTurbo] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [autoRemaining, setAutoRemaining] = useState<number | null>(null);
  const [prepared, setPrepared] = useState<{ stake: number; spins: SpinResult[] } | null>(() => {
    const saved = readSlotPresentation("gates-of-olympus");
    const spins = saved?.outcome.spins.slice(saved.cursor) ?? [];
    return saved && spins.length ? { stake: saved.outcome.stake, spins } : null;
  });
  const [legacyFreeSpins, setLegacyFreeSpins] = usePoolRoundState("gates-of-olympus", "freeSpins", 0);
  const freeSpins = prepared?.spins.length ?? legacyFreeSpins;
  const [showOdds, setShowOdds] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const spinTimer = useRef<number | null>(null);
  const busyRef = useRef(false);

  const playTone = useCallback((frequency: number, duration = 0.08, type: OscillatorType = "sine") => {
    if (!sound || typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = audioContext.current ?? new AudioCtx();
      audioContext.current = context;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, context.currentTime);
      gain.gain.setValueAtTime(0.055, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    } catch {
      // Audio is an optional enhancement and may be blocked by the browser.
    }
  }, [sound]);

  const spin = useCallback(async () => {
    if (isSpinning || busyRef.current) return;
    const isFree = freeSpins > 0;
    if (!isFree && balance < bet) {
      setMessage("NOT ENOUGH Rs.");
      setAutoRemaining(null);
      playTone(150, 0.18, "sawtooth");
      return;
    }

    busyRef.current = true;
    let result: SpinResult;
    const legacy = isFree && !prepared && legacyFreeSpins > 0;
    if (isFree && prepared) {
      result = prepared.spins[0];
      setPrepared(prepared.spins.length > 1 ? { ...prepared, spins: prepared.spins.slice(1) } : null);
      const saved = readSlotPresentation("gates-of-olympus");
      if (saved) saveSlotPresentation("gates-of-olympus",
        prepared.spins.length > 1 ? { ...saved, cursor: saved.cursor + 1 } : null);
    } else if (legacy) {
      // Only an active pre-migration snapshot can restore this counter.
      result = legacyBonusSpin(bet, Math.random() < 0.35);
      const remaining = legacyFreeSpins - 1;
      pool.checkpoint({ bet, freeSpins: remaining });
      const steps: { action: "award" | "complete"; amount: number }[] = [];
      if (result.amount > 0) steps.push({ action: "award", amount: result.amount });
      if (!remaining) steps.push({ action: "complete", amount: 0 });
      if (steps.length) pool.queue(steps);
      setLegacyFreeSpins(remaining);
    } else {
      if (!await pool.start(bet, undefined, {})) { busyRef.current = false; return; }
      const outcome = readBrowserSlotOutcome("gates-of-olympus", await pool.resolveServer({}), bet);
      if (!outcome) {
        setMessage("SPIN CONFIRMATION PENDING — PLEASE RETRY");
        setAutoRemaining(null);
        busyRef.current = false;
        return;
      }
      result = outcome.spins[0];
      setPrepared(outcome.spins.length > 1 ? { stake: bet, spins: outcome.spins.slice(1) } : null);
      saveSlotPresentation("gates-of-olympus", outcome.spins.length > 1 ? { outcome, cursor: 1 } : null);
    }
    const bonus = result.bonus;
    const amount = result.amount;
    setIsSpinning(true);
    setWinner(null);
    setWinAmount(0);
    setMessage(isFree ? "FREE SPIN" : "GOOD LUCK!");
    playTone(210, 0.12, "triangle");

    const shuffleEvery = window.setInterval(() => setGrid(randomGrid()), turbo ? 55 : 95);
    const duration = turbo ? 430 : 950;
    spinTimer.current = window.setTimeout(async () => {
      window.clearInterval(shuffleEvery);
      if (legacy && amount > 0 && !await pool.award(amount) ||
          legacy && legacyFreeSpins === 1 && !await pool.complete(0)) {
        setAutoRemaining(null);
        busyRef.current = false;
        setIsSpinning(false);
        return;
      }
      setGrid(result.grid);
      if (bonus || amount > 0) {
        if (bonus) {
          setWinner("bolt");
          setMessage("4 STORM BOLTS — 6 FREE SPINS");
          playTone(659, 0.24, "sine");
          window.setTimeout(() => playTone(988, 0.35, "sine"), 180);
        } else {
          setWinner(result.winner);
          setWinAmount(amount);
          setMessage(pool.enabled ? `PROVISIONAL CLAIM ${amount} — daily settlement pending` : `${result.count} ${result.winner ? SYMBOLS[result.winner].name.toUpperCase() : ""} — ${result.multiplier > 1 ? `${result.multiplier}× ` : ""}WIN`);
          playTone(523, 0.2, "sine");
          window.setTimeout(() => playTone(784, 0.28, "sine"), 150);
        }
      } else {
        setMessage(pool.enabled ? "DAILY PAYOUT PENDING — PROVISIONAL CLAIM 0" : "NO WIN — TRY AGAIN");
        playTone(170, 0.12, "triangle");
      }
      busyRef.current = false;
      setIsSpinning(false);
    }, duration);
  }, [balance, bet, freeSpins, prepared, legacyFreeSpins, isSpinning, playTone, turbo, setPrepared, setLegacyFreeSpins]);

  useEffect(() => () => {
    if (spinTimer.current) window.clearTimeout(spinTimer.current);
  }, []);

  useEffect(() => {
    if (autoRemaining === null || isSpinning || modal) return;
    if (autoRemaining === 0) {
      setAutoRemaining(null);
      return;
    }
    const timer = window.setTimeout(() => {
      if (autoRemaining > 0) setAutoRemaining((value) => value === null ? null : value - 1);
      spin();
    }, turbo ? 300 : 750);
    return () => window.clearTimeout(timer);
  }, [autoRemaining, isSpinning, modal, spin, turbo]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !modal) {
        event.preventDefault();
        spin();
      }
      if (event.code === "Escape") setModal(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal, spin]);

  const winningCells = useMemo(() => new Set(grid.flatMap((cell, index) => winner && cell.symbol === winner ? [index] : [])), [grid, winner]);

  const changeBet = (direction: -1 | 1) => {
    if (isSpinning) return;
    setBet((current) => direction === 1
      ? BETS.find((b) => b > current) ?? BETS[BETS.length - 1]
      : [...BETS].reverse().find((b) => b < current) ?? BETS[0]);
    setWinAmount(0);
    playTone(320, 0.05);
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch { /* Fullscreen may not be available in embedded previews. */ }
  };

  return (
    <div className="gates-of-olympus-container relative h-full w-full flex flex-col justify-between overflow-hidden px-1 sm:px-4 py-1 select-none">
    <main className="game-shell">
      <header className="topbar">
        <div className="flex items-center gap-2">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 rounded-lg border border-yellow-500/40 bg-black/60 hover:bg-black/80 px-2.5 py-1 text-xs font-semibold text-yellow-300 transition hover:scale-105 active:scale-95 cursor-pointer shrink-0"
          >
            ← Back
          </Link>
          <button className="brand" onClick={() => setModal("menu")} aria-label="Open game menu">
            <span className="brand-mark">V</span>
            <span><b>VAULT</b><small>PLAY</small></span>
          </button>
        </div>
        <div className="demo-pill"><span>DEMO</span> Rs.</div>
        <div className="top-actions">
          <button className={`icon-button ${sound ? "active" : ""}`} onClick={() => setSound((value) => !value)} aria-label={sound ? "Mute sound" : "Enable sound"}><Icon name={sound ? "sound" : "mute"}/></button>
          <button className="icon-button" onClick={() => setModal("help")} aria-label="Game information"><Icon name="info"/></button>
          <button className="icon-button" onClick={() => setModal("settings")} aria-label="Settings"><Icon name="settings"/></button>
          <button className="icon-button desktop-only" onClick={toggleFullscreen} aria-label="Fullscreen"><Icon name="fullscreen"/></button>
        </div>
      </header>

      <section className="game-stage" aria-label="Thunder Vault demo slot game">
        <div className="lightning-flash one" />
        <div className="lightning-flash two" />
        <div className="game-title" aria-label="Thunder Vault">
          <span className="title-small">THE</span>
          <span className="title-main">THUNDER</span>
          <span className="title-vault">VAULT</span>
        </div>

        <div className="machine-wrap">
          <div className="wing left-wing" aria-hidden="true">ϟ</div>
          <div className="wing right-wing" aria-hidden="true">ϟ</div>
          <div className="machine">
            <div className="machine-crown"><span>◆</span><b>STORM PAYS ANYWHERE</b><span>◆</span></div>
            <div className={`reels ${isSpinning ? "spinning" : ""}`}>
              {grid.map((cell, index) => {
                const symbol = SYMBOLS[cell.symbol];
                return (
                  <div
                    className={`symbol ${symbol.className} ${winningCells.has(index) ? "winning" : ""}`}
                    style={{ "--delay": `${(index % 6) * 45 + Math.floor(index / 6) * 18}ms` } as React.CSSProperties}
                    key={cell.id}
                    aria-label={symbol.name}
                  >
                    <span className="symbol-shine" />
                    {cell.symbol === "bolt" ? <span className="scatter-label">SCATTER</span> : null}
                    <span className="glyph">{symbol.glyph}</span>
                    {cell.multiplier ? <span className="multiplier">{cell.multiplier}×</span> : null}
                  </div>
                );
              })}
              {winAmount > 0 && !isSpinning ? <div className="win-burst" aria-hidden="true">{pool.enabled ? "CLAIM" : "WIN!"}</div> : null}
            </div>
            <div className="machine-status">
              <span className={winAmount > 0 || freeSpins > 0 ? "status-win" : ""}>{freeSpins > 0 ? `FREE SPINS ${freeSpins} · ` : ""}{message}</span>


            </div>
          </div>
        </div>

        <aside className="feature-card left-card">
          <span className="feature-icon">ϟ</span>
          <b>4+ SCATTERS</b>
          <small>6 FREE SPINS</small>
        </aside>
        <aside className="feature-card right-card">
          <span className="feature-icon">×</span>
          <b>STORM ORBS</b>
          <small>UP TO 10×</small>
        </aside>
      </section>

      <div className="flex flex-wrap items-center justify-center gap-1.5 px-2 py-1 relative z-10">
        {BETS.map((b) => (
          <button
            key={b}
            type="button"
            disabled={isSpinning}
            onClick={() => { setBet(b); setWinAmount(0); }}
            className={`rounded-full border px-3 py-1 text-xs font-bold ${bet === b ? "border-yellow-300 bg-yellow-400 text-black" : "border-yellow-500/40 bg-black/60 text-yellow-200"}`}
          >
            {b}
          </button>
        ))}
        <BetAmountInput value={bet} onChange={setBet} disabled={isSpinning} max={Math.max(1, Math.floor(balance))} className="w-32" />
      </div>

      <section className="control-deck">
        <div className="account-stat balance-stat">
          <small>BALANCE</small>
          <strong>Rs. {balance.toFixed(2)}</strong>
        </div>

        <div className="bet-control">
          <button onClick={() => changeBet(-1)} disabled={bet <= BETS[0] || isSpinning} aria-label="Decrease bet">−</button>
          <div><small>BET</small><strong>Rs. {bet.toFixed(0)}</strong></div>
          <button onClick={() => changeBet(1)} disabled={bet >= BETS[BETS.length - 1] || isSpinning} aria-label="Increase bet">+</button>
        </div>

        <div className="spin-cluster">
          <button className={`turbo-button ${turbo ? "active" : ""}`} onClick={() => setTurbo((value) => !value)} aria-label="Toggle turbo spin"><Icon name="turbo"/><small>TURBO</small></button>
          <button
            className={`spin-button ${isSpinning ? "is-spinning" : ""} ${autoRemaining !== null ? "is-stop" : ""}`}
            onClick={() => autoRemaining !== null ? setAutoRemaining(null) : spin()}
            disabled={isSpinning && autoRemaining === null}
            aria-label={autoRemaining !== null ? "Stop auto spin" : "Spin reels"}
          >
            <span className="spin-ring"><Icon name="auto"/></span>
            <b>{autoRemaining !== null ? "STOP" : isSpinning ? "" : "SPIN"}</b>
          </button>
          <button className={`auto-button ${autoRemaining !== null ? "active" : ""}`} onClick={() => autoRemaining !== null ? setAutoRemaining(null) : setModal("auto")} aria-label="Auto spin">
            <Icon name="auto"/><small>{autoRemaining === -1 ? "∞" : autoRemaining ?? "AUTO"}</small>
          </button>
        </div>

        <div className="account-stat win-stat">
          <small>{pool.enabled ? "PROVISIONAL CLAIM" : "LAST WIN"}</small>
          <strong className={winAmount ? "won" : ""}>Rs. {winAmount.toFixed(2)}</strong>
        </div>

        <button className="deck-menu" onClick={() => setModal("menu")} aria-label="Open menu"><Icon name="menu"/><small>MENU</small></button>
      </section>

      <footer className="legal-bar">
        <span>THUNDER VAULT™ ORIGINAL DEMO</span>
        <span>18+ · FOR ENTERTAINMENT</span>
        <span>SPACE TO SPIN</span>
      </footer>

      {modal ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setModal(null)}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <button className="modal-close" onClick={() => setModal(null)} aria-label="Close"><Icon name="close"/></button>
            {modal === "help" ? (
              <>
                <p className="eyebrow">GAME GUIDE</p>
                <h2 id="modal-title">How to play</h2>
                <p>Choose a bet in Rs. and press Spin. Eight or more matching symbols anywhere on the 6×5 board award a prize. Storm Orbs boost that spin.</p>
                <div className="paytable">
                  {REGULAR_SYMBOLS.map((id) => <div key={id}><span className={`mini-symbol ${SYMBOLS[id].className}`}>{SYMBOLS[id].glyph}</span><span><b>{SYMBOLS[id].name}</b><small>{SYMBOLS[id].payout}</small></span></div>)}
                </div>
                <div className="fair-note"><b>Server-settled outcomes</b><span>10 winning players per 100 distinct players. Maximum combined return is 2× the paid stake, including all six free spins. Every displayed prize matches the board.</span></div>
              </>
            ) : null}
            {modal === "settings" ? (
              <>
                <p className="eyebrow">PREFERENCES</p><h2 id="modal-title">Game settings</h2>
                <button className="setting-row" onClick={() => setSound((value) => !value)}><span>Game sounds<small>Short interface and win tones</small></span><i className={sound ? "on" : ""}>{sound ? "ON" : "OFF"}</i></button>
                <button className="setting-row" onClick={() => setTurbo((value) => !value)}><span>Turbo mode<small>Faster reel animations</small></span><i className={turbo ? "on" : ""}>{turbo ? "ON" : "OFF"}</i></button>
                <button className="setting-row" onClick={toggleFullscreen}><span>Fullscreen<small>Expand the game to your display</small></span><Icon name="fullscreen"/></button>
              </>
            ) : null}
            {modal === "auto" ? (
              <>
                <p className="eyebrow">AUTOPLAY</p><h2 id="modal-title">Choose auto spins</h2>
                <p>Autoplay stops if your virtual balance is too low. Press the Auto button again to stop at any time.</p>
                <div className="auto-options">
                  {[10, 25, 50, 100, -1].map((count) => <button key={count} onClick={() => { setAutoRemaining(count); setModal(null); }}>{count === -1 ? "∞" : count}<small>SPINS</small></button>)}
                </div>
              </>
            ) : null}
            {modal === "menu" ? (
              <>
                <p className="eyebrow">THUNDER VAULT</p><h2 id="modal-title">Game menu</h2>
                <div className="menu-grid">
                  <button onClick={() => setModal("help")}><Icon name="info"/><span>Rules & paytable</span></button>
                  <button onClick={() => setModal("settings")}><Icon name="settings"/><span>Settings</span></button>
                </div>
                <div className="fair-note"><b>For entertainment only</b><span>This original game has no purchases or accounts; amounts are in Rs.</span></div>
              </>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
    </div>
  );
}
