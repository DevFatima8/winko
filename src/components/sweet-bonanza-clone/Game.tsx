"use client";
import { gameSfx } from "@/lib/gameSfx";
import { GameOverOverlay } from "@/components/GameOverOverlay";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameBalance, usePoolLifecycle } from "@/lib/walletSync";
import { notifyGameResult } from "@/lib/gameResultNotice";
import { BET_PRESETS } from "@/lib/betPresets";
import BetAmountInput from "@/components/BetAmountInput";
import "./sweet-bonanza.css";

type CandyTile = {
  id: number;
  symbol: number;
  featured: boolean;
  fresh?: boolean;
  popping?: boolean;
};

type SpinPhase = "idle" | "spin" | "drop" | "pop" | "refill";

type RoundRecord = {
  id: number;
  won: boolean;
  bet: number;
  payout: number;
};

function isServerOutcome(value: unknown): value is { won: boolean; multiplier: number; payout: number } {
  return typeof value === "object" && value !== null &&
    "won" in value && typeof value.won === "boolean" &&
    "multiplier" in value && typeof value.multiplier === "number" &&
    (value.won ? [1.2, 1.4, 1.6].includes(value.multiplier) : value.multiplier === 0) &&
    "payout" in value && typeof value.payout === "number" && Number.isFinite(value.payout) &&
    (value.won ? value.payout > 0 : value.payout === 0);
}

const CANDIES = [
  { emoji: "🍓", name: "Berry", color: "berry" },
  { emoji: "🍋", name: "Lemon", color: "lemon" },
  { emoji: "🍇", name: "Grape", color: "grape" },
  { emoji: "🍉", name: "Melon", color: "melon" },
  { emoji: "🍊", name: "Orange", color: "orange" },
  { emoji: "🍬", name: "Sweet", color: "sweet" },
  { emoji: "🍭", name: "Lollipop", color: "lollipop" },
  { emoji: "💎", name: "Gem", color: "gem" },
] as const;

const BET_SIZES: number[] = [...BET_PRESETS];
const STARTING_CREDITS = 1000;
const STORAGE_KEY = "candy-comet-play-credits-v1";
const STARTER_SYMBOLS = [
  0, 2, 4, 1, 6, 3,
  5, 1, 7, 2, 0, 4,
  3, 6, 2, 5, 1, 7,
  4, 0, 5, 3, 7, 2,
  1, 6, 3, 4, 5, 0,
];

const STARTER_BOARD: CandyTile[] = STARTER_SYMBOLS.map((symbol, index) => ({
  id: index,
  symbol,
  featured: false,
}));

const formatCredits = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

let tileCounter = 100;
const nextTileId = () => {
  tileCounter += 1;
  return tileCounter;
};

function makeBoard(isWin: boolean, fresh = true): CandyTile[] {
  const board: CandyTile[] = Array.from({ length: 30 }, () => ({
    id: nextTileId(),
    symbol: Math.floor(Math.random() * CANDIES.length),
    featured: false,
    fresh,
  }));

  if (isWin) {
    const winningSymbol = 5 + Math.floor(Math.random() * 3);
    for (let row = 1; row <= 3; row += 1) {
      for (let column = 1; column <= 3; column += 1) {
        board[row * 6 + column] = { id: nextTileId(), symbol: winningSymbol, featured: true, fresh };
      }
    }
  }

  return board;
}

export default function SweetBonanzaGamePage() {
  const [credits] = useGameBalance("sweet-bonanza", STARTING_CREDITS);
  const pool = usePoolLifecycle("sweet-bonanza");
  const [bet, setBet] = useState(100);
  const [board, setBoard] = useState(STARTER_BOARD);
  const [isSpinning, setIsSpinning] = useState(false);
  const [autoRemaining, setAutoRemaining] = useState(0);
  const [round, setRound] = useState(0);
  const [lastWin, setLastWin] = useState(0);
  const [result, setResult] = useState<"ready" | "win" | "loss">("ready");
  const [endDismissed, setEndDismissed] = useState(false);
  const [message, setMessage] = useState("Pick a wager, then give it a spin.");
  const [history, setHistory] = useState<RoundRecord[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const spinningRef = useRef(false);
  const mounted = useRef(true);
  const timeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const [phase, setPhase] = useState<SpinPhase>("idle");
  const clearTimers = useCallback(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  }, []);
  const runSpinRef = useRef<(automatic?: boolean) => void>(() => undefined);

  useEffect(() => {
    mounted.current = true;
    setHydrated(true);
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(credits));
    } catch {
      // Credits remain in memory for this session if storage is unavailable.
    }
  }, [credits, hydrated]);

  const runSpin = useCallback(
    async (automatic = false) => {
      if (spinningRef.current) return;

      if (credits < bet) {
        setMessage("Not quite enough Rs. for that wager. Try a smaller bet.");
        setAutoRemaining(0);
        return;
      }

      gameSfx.spin();
      setEndDismissed(false);
      spinningRef.current = true;
      if (!await pool.start(bet)) { spinningRef.current = false; setAutoRemaining(0); return; }
      const outcome = await pool.resolveServer({});
      if (!isServerOutcome(outcome)) {
        spinningRef.current = false;
        setAutoRemaining(0);
        setMessage("Result confirmation failed. Please retry or reopen the game.");
        return;
      }
      if (!mounted.current) return;
      const { won, payout } = outcome;
      const finalBoard = makeBoard(won);
      const noticeId = crypto.randomUUID();
      setIsSpinning(true);
      setPhase("spin");
      setResult("ready");
      setLastWin(0);
      setMessage(automatic ? "Next round is on its way…" : "The candies are tumbling…");
      setBoard(makeBoard(false));

      if (automatic) {
        setAutoRemaining((remaining) => Math.max(0, remaining - 1));
      } else {
        setAutoRemaining(0);
      }

      clearTimers();
      intervalRef.current = window.setInterval(() => setBoard(makeBoard(false)), 130);

      const later = (ms: number, fn: () => void) => {
        timeoutRef.current = window.setTimeout(fn, ms);
      };

      later(900, async () => {
        if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
        intervalRef.current = null;

        setBoard(finalBoard);
        setPhase("drop");
        const finish = () => {
          notifyGameResult("sweet-bonanza", noticeId, payout, pool.enabled);
          setLastWin(payout);
          if (won) gameSfx.win(); else gameSfx.lose();
          setResult(won ? "win" : "loss");
          setMessage(
            pool.enabled ? `Provisional claim Rs. ${formatCredits(payout)}; daily settlement pending.` : won
              ? `Lovely cluster! 8+ matching candies connected — Rs. ${formatCredits(payout)} paid.`
              : "",
          );
          setRound((current) => current + 1);
          setHistory((current) =>
            [{ id: Date.now() + Math.random(), won, bet, payout }, ...current].slice(0, 5),
          );
          setPhase("idle");
          spinningRef.current = false;
          setIsSpinning(false);
        };

        if (!won) {
          later(700, finish);
          return;
        }

        const winningSymbol = finalBoard.find((tile) => tile.featured)?.symbol ?? 5;
        later(1000, () => {
          setPhase("pop");
          setBoard((current) => current.map((tile) => (tile.featured ? { ...tile, popping: true } : tile)));
          later(600, () => {
            setPhase("refill");
            setBoard((current) =>
              current.map((tile) => {
                if (!tile.featured) return { ...tile, fresh: false };
                let symbol = Math.floor(Math.random() * CANDIES.length);
                if (symbol === winningSymbol) symbol = (symbol + 1) % CANDIES.length;
                return { id: nextTileId(), symbol, featured: false, fresh: true };
              }),
            );
            later(700, finish);
          });
        });
      });
    },
    [bet, credits, clearTimers],
  );

  useEffect(() => {
    runSpinRef.current = runSpin;
  }, [runSpin]);

  useEffect(() => {
    if (autoRemaining <= 0 || isSpinning) return;
    const timer = window.setTimeout(() => runSpinRef.current(true), 420);
    return () => window.clearTimeout(timer);
  }, [autoRemaining, isSpinning]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowRules(false);
      if (
        event.code === "Space" &&
        !showRules &&
        !event.repeat &&
        !(event.target instanceof HTMLElement && ["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName))
      ) {
        event.preventDefault();
        runSpinRef.current(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showRules]);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    },
    [],
  );

  const adjustBet = (direction: -1 | 1) => {
    setBet((current) =>
      direction === 1
        ? BET_SIZES.find((b) => b > current) ?? BET_SIZES[BET_SIZES.length - 1]
        : [...BET_SIZES].reverse().find((b) => b < current) ?? BET_SIZES[0],
    );
  };

  const startAuto = () => {
    if (autoRemaining > 0) {
      setAutoRemaining(0);
      setMessage("Auto play stopped.");
      return;
    }
    if (credits < bet) {
      setMessage("Insufficient balance. Choose a smaller wager.");
      return;
    }
    setAutoRemaining(5);
    setMessage("Five automatic rounds queued. You can stop them any time.");
  };

  const formattedCredits = hydrated ? formatCredits(credits) : formatCredits(STARTING_CREDITS);
  const isAffordable = credits >= bet;

  return (
    <main className="site-shell candy-comet">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="topbar">
        <a className="brand" href="#top" aria-label="Candy Comet home">
          <span className="brand-mark" aria-hidden="true">
            <span>✦</span>
          </span>
          <span className="brand-copy">
            <strong>CANDY COMET</strong>
            <small>ARCADE · PLAY FOR FUN</small>
          </span>
        </a>

        <nav className="main-nav" aria-label="Main navigation">
          <a className="nav-link nav-link-active" href="#game">THE GAME</a>
          <button className="nav-link" type="button" onClick={() => setShowRules(true)}>HOW TO PLAY</button>
        </nav>

        <div className="topbar-right">
          <span className="play-mode"><span className="online-dot" /> FREE PLAY</span>
          <div className="wallet" aria-label={`Rs. ${formattedCredits}`}>
            <span className="wallet-icon" aria-hidden="true">✧</span>
            <span className="wallet-copy">
              <small>YOUR BALANCE (Rs.)</small>
              <strong>{formattedCredits}</strong>
            </span>
          </div>
        </div>
      </header>

      <section className="intro" id="top">
        <div className="intro-copy">
          <div className="eyebrow"><span className="eyebrow-star">✦</span> A BRIGHT LITTLE ARCADE GAME</div>
          <h1>Chase the <span>candy</span> comet.</h1>
          <p>A little color, a little sparkle, and a fresh roll every time.</p>
        </div>
        <div className="intro-note">
          <span className="note-sparkle" aria-hidden="true">✧</span>
          <span><strong>Just here for fun.</strong><small>All amounts are in Rs.</small></span>
        </div>
      </section>

      <section className="game-layout" id="game" aria-label="Candy Comet game">
        <section className="machine-card" aria-labelledby="game-title">
          <div className="machine-heading">
            <div>
              <div className="machine-kicker"><span className="tiny-star">✦</span> COLORFUL CLUSTERS</div>
              <h2 id="game-title">Candy Comet</h2>
            </div>
            <div className="round-counter">
              <span>ROUND</span>
              <strong>{String(round + 1).padStart(2, "0")}</strong>
            </div>
          </div>

          <div className={`board-frame ${isSpinning ? "board-spinning" : ""} ${result === "win" ? "board-win" : ""}`}>
            <div className="board-topline">
              <span><span className="board-live-dot" /> 6 × 5 CANDY GRID</span>
              <span className="board-streak">✦&nbsp; MATCH 8 OR MORE</span>
            </div>
            <div className="game-grid" role="grid" aria-label="Candy symbols">
              {board.map((tile, index) => {
                const candy = CANDIES[tile.symbol];
                const motion = phase === "spin" ? " tile-tumbling" : tile.fresh && phase !== "idle" ? " tile-drop" : "";
                return (
                  <div
                    className={`candy-tile tile-${candy.color}${tile.featured ? " tile-featured" : ""}${tile.popping ? " tile-popping" : ""}${motion}`}
                    role="gridcell"
                    aria-label={`${candy.name}${tile.featured ? ", matching cluster" : ""}`}
                    key={`${index}-${tile.id}`}
                    style={{ animationDelay: `${(index % 6) * 45 + Math.floor(index / 6) * 12}ms` }}
                  >
                    <span className="tile-sheen" aria-hidden="true" />
                    <span className="tile-emoji" aria-hidden="true">{candy.emoji}</span>
                    {tile.featured && <span className="tile-twinkle" aria-hidden="true">✦</span>}
                  </div>
                );
              })}
            </div>
            <div className={`board-message message-${result}`} aria-live="polite">
              <span className="message-status" aria-hidden="true">{isSpinning ? "✧" : result === "win" ? "✦" : result === "loss" ? "·" : "✧"}</span>
              <span>{isSpinning ? "Candy tumble in progress…" : message}</span>
              {lastWin > 0 && !isSpinning && <strong>+{formatCredits(lastWin)}</strong>}
            </div>
          </div>

          <div className="machine-footer">
            <div className="cluster-tip">
              <span className="tip-icon" aria-hidden="true">✿</span>
              <span><strong>Look for a cluster</strong><small>Eight matching candies make a winning round.</small></span>
            </div>
            <button className="rules-inline" type="button" onClick={() => setShowRules(true)}>
              See game rules <span aria-hidden="true">↗</span>
            </button>
          </div>
        </section>

        <aside className="side-column" aria-label="Game controls and odds">
          <section className="control-card">
            <div className="card-heading">
              <div><span className="section-overline">SET YOUR PACE</span><h2>Wager controls</h2></div>
              <span className="demo-tag">DEMO</span>
            </div>

            <div className="bet-label-row">
              <label htmlFor="bet-value">BET PER SPIN</label>
              <span className="bet-currency">Rs.</span>
            </div>
            <div className="bet-stepper">
              <button type="button" onClick={() => adjustBet(-1)} disabled={isSpinning || bet <= BET_SIZES[0]} aria-label="Decrease wager">−</button>
              <div className="bet-value" id="bet-value" aria-live="polite">
                <strong>{formatCredits(bet)}</strong><span>Rs.</span>
              </div>
              <button type="button" onClick={() => adjustBet(1)} disabled={isSpinning || bet >= BET_SIZES[BET_SIZES.length - 1]} aria-label="Increase wager">+</button>
            </div>

            <div className="bet-presets" aria-label="Choose a wager">
              {BET_SIZES.map((amount) => (
                <button
                  type="button"
                  key={amount}
                  className={bet === amount ? "preset-active" : ""}
                  onClick={() => setBet(amount)}
                  disabled={isSpinning}
                  aria-pressed={bet === amount}
                >
                  {amount}
                </button>
              ))}
            </div>
            <BetAmountInput value={bet} onChange={setBet} disabled={isSpinning} max={Math.max(1, Math.floor(credits))} />

            <button
              className="spin-button"
              type="button"
              onClick={() => runSpin(false)}
              disabled={isSpinning || !isAffordable}
              aria-label={`Spin for Rs. ${formatCredits(bet)}`}
            >
              <span className="spin-button-sparkle" aria-hidden="true">✦</span>
              <span className="spin-button-main">{isSpinning ? "SPINNING" : "SPIN"}</span>
              <span className="spin-button-cost">{isSpinning ? "GOOD LUCK" : `− Rs. ${formatCredits(bet)}`}</span>
              <span className="spin-button-arrow" aria-hidden="true">{isSpinning ? "✧" : "↗"}</span>
            </button>

            <button className={`auto-button ${autoRemaining > 0 ? "auto-active" : ""}`} type="button" onClick={startAuto} disabled={isSpinning && autoRemaining === 0}>
              <span aria-hidden="true">{autoRemaining > 0 ? "Ⅱ" : "⟳"}</span>
              {autoRemaining > 0 ? `STOP AUTO · ${autoRemaining} LEFT` : "AUTO PLAY · 5 ROUNDS"}
            </button>

            {!isAffordable && <p className="insufficient-note">Your Rs. balance is below this wager.</p>}

            <div className="balance-row">
              <span><span className="balance-dot" /> DEMO BALANCE</span>
            </div>
          </section>

          <section className="history-card" aria-labelledby="history-title">
            <div className="history-heading"><h2 id="history-title">Recent rounds</h2><span>{history.length ? `LAST ${history.length}` : "NEW"}</span></div>
            {history.length === 0 ? (
              <div className="history-empty"><span aria-hidden="true">✧</span><p>Your rounds will show up here.</p></div>
            ) : (
              <ul className="history-list">
                {history.map((record) => {
                  const net = record.won ? record.payout - record.bet : -record.bet;
                  return (
                    <li key={record.id}>
                      <span className={`history-result ${record.won ? "history-win" : "history-loss"}`} aria-hidden="true">{record.won ? "✦" : "·"}</span>
                      <span className="history-round"><strong>{record.won ? "Cluster hit" : ""}</strong><small>Bet {formatCredits(record.bet)}</small></span>
                      <strong className={`history-net ${net >= 0 ? "net-positive" : "net-negative"}`}>{net >= 0 ? `+${formatCredits(net)}` : "—"}</strong>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </section>

      <footer className="page-footer">
        <span>✦&nbsp; CANDY COMET ARCADE</span>
        <p>Play for fun only · All amounts in Rs.</p>
        <button type="button" onClick={() => setShowRules(true)}>PLAY RESPONSIBLY</button>
      </footer>

      {showRules && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowRules(false); }}>
          <section className="rules-modal" role="dialog" aria-modal="true" aria-labelledby="rules-title">
            <button className="modal-close" type="button" onClick={() => setShowRules(false)} aria-label="Close game rules">×</button>
            <div className="modal-icon" aria-hidden="true">✦</div>
            <span className="section-overline">A QUICK GUIDE</span>
            <h2 id="rules-title">How to play</h2>
            <p className="modal-lead">Pick a wager in Rs. and tap spin. Every round gets its own independent roll.</p>
            <ul className="rules-list">
              <li><span>01</span><p>Choose a wager from the five preset amounts.</p></li>
              <li><span>02</span><p>A winning round shows a candy cluster and adds a random Rs. payout.</p></li>
              <li><span>03</span><p>Auto play runs up to five rounds and can be stopped at any time.</p></li>
            </ul>
            <div className="modal-disclaimer"><span aria-hidden="true">ⓘ</span><p>This is a free-to-play entertainment demo. Amounts are shown in Rs.</p></div>
            <button className="modal-done" type="button" onClick={() => setShowRules(false)}>GOT IT, LET&apos;S PLAY</button>
          </section>
        </div>
      )}
    </main>
  );
}
