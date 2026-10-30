"use client";

import { useEffect, useRef, useState } from "react";
import { useGameBalance, usePoolLifecycle } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import "./teen-patti-ak47.css";
import {
  PAIR_PLUS_PAYOUT,
  RiggedDeal,
  WIN_RATE,
  dealRound,
  formatINR,
} from "./lib/teenpatti";
import { sfx, setSoundEnabled } from "./lib/sounds";
import PlayingCard from "./PlayingCard";
import Chip from "./Chip";
import { useLiveTable } from "../teen-patti/useLiveTable";
import { isAK47BrowserDeal } from "@/lib/browserCardGuards";

const STARTING_BALANCE = 10000;
const MIN_BET = 10;
const CHIP_VALUES = BET_PRESETS;
const BALANCE_KEY = "ak47_balance_v1";
const HISTORY_SLOTS = 14;

type Phase = "betting" | "dealing" | "settled";
type BetTarget = "ante" | "pairplus";
type HistoryMark = "W" | "L";

interface RoundResult {
  outcome: "win" | "loss";
  playerLabel: string;
  dealerLabel: string;
  totalReturn: number;
  totalBet: number;
  net: number;
}

function loadBalance(): number {
  if (typeof window === "undefined") return STARTING_BALANCE;
  const raw = window.localStorage.getItem(BALANCE_KEY);
  const parsed = raw === null ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : STARTING_BALANCE;
}

const COIN_EMOJIS = ["🪙", "💰", "⭐", "🤑"];

export default function TeenPattiAK47() {
  const [hydrated, setHydrated] = useState(false);
  const [balance] = useGameBalance("teen-patti-ak47", STARTING_BALANCE);
  const pool = usePoolLifecycle("teen-patti-ak47");
  const [ante, setAnte] = useState(0);
  const [pairPlus, setPairPlus] = useState(0);
  const [betTarget, setBetTarget] = useState<BetTarget>("ante");
  const [phase, setPhase] = useState<Phase>("betting");
  const [deal, setDeal] = useState<RiggedDeal | null>(null);
  const [dealt, setDealt] = useState(false);
  const [playerShown, setPlayerShown] = useState(false);
  const [dealerShown, setDealerShown] = useState(false);
  const [revealedCards, setRevealedCards] = useState(0);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [history, setHistory] = useState<HistoryMark[]>([]);
  const [soundOn, setSoundOn] = useState(true);
  const [showRules, setShowRules] = useState(false);
  const [coinBurst, setCoinBurst] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [customAmt, setCustomAmt] = useState("");

  const timers = useRef<number[]>([]);
  const live = useLiveTable({
    queueNextRound: false,
    phase, balance, draft: { ante, pairplus: pairPlus }, targets: ["ante", "pairplus"],
    validate: (b) => b.ante >= MIN_BET,
    start: () => startDeal(), reset: () => nextRound(),
    apply: (b) => { setAnte(b.ante); setPairPlus(b.pairplus); },
  });

  const later = (ms: number, fn: () => void): void => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const clearTimers = (): void => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  // Hydrate client.
  useEffect(() => {
    setHydrated(true);
  }, []);

  // Persist balance.
  useEffect(() => {
    if (hydrated) window.localStorage.setItem(BALANCE_KEY, String(balance));
  }, [balance, hydrated]);

  // Clean up timers on unmount.
  useEffect(() => clearTimers, []);

  const showToast = (message: string): void => {
    setToast(message);
    later(1800, () => setToast(null));
  };

  const addChip = (value: number): void => {
    if (phase !== "betting") return;
    if (balance < value) {
      showToast("Insufficient balance.");
      sfx.click();
      return;
    }
    if (betTarget === "ante") setAnte((a) => a + value);
    else setPairPlus((p) => p + value);
    sfx.chip();
  };

  const clearBets = (): void => {
    if (phase !== "betting") return;
    setAnte(0);
    setPairPlus(0);
    sfx.click();
  };

  const settleRound = async (round: RiggedDeal, anteBet: number, ppBet: number): Promise<void> => {
    if (anteBet + ppBet <= 0) {
      setPhase("settled");
      return;
    }
    const win = round.outcome === "win";
    const anteReturn = win ? anteBet * 2 : 0; // Ante pays 1:1
    const multiplier = ppBet > 0 ? PAIR_PLUS_PAYOUT[round.playerEval.category] : 0;
    const ppReturn = ppBet > 0 && multiplier > 0 ? (multiplier + 1) * ppBet : 0;
    const totalReturn = anteReturn + ppReturn;
    const totalBet = anteBet + ppBet;

    pool.announce();
    setResult({
      outcome: win ? "win" : "loss",
      playerLabel: round.playerEval.label,
      dealerLabel: round.dealerEval.label,
      totalReturn,
      totalBet,
      net: totalReturn - totalBet,
    });
    const mark: HistoryMark = win ? "W" : "L";
    setHistory((h) => [mark, ...h].slice(0, HISTORY_SLOTS));
    setPhase("settled");
    if (win) {
      sfx.win();
      setCoinBurst((c) => c + 1);
    } else {
      sfx.lose();
    }
  };

  const startDeal = async (rebet = false): Promise<void> => {
    if (phase === "dealing") return;
    if (phase === "settled" && rebet) {
      const next = { ante, pairplus: pairPlus };
      nextRound();
      setAnte(next.ante);
      setPairPlus(next.pairplus);
      return;
    }
    if (phase === "settled" && !rebet) return;
    const accepted = live.begin();
    if (!accepted) return;
    setPhase("dealing");

    clearTimers();
    const anteBet = accepted.ante;
    const ppBet = accepted.pairplus;
    setAnte(anteBet);
    setPairPlus(ppBet);

    let round: RiggedDeal;
    if (anteBet + ppBet > 0) {
      const selection = { ante: anteBet, pairPlus: ppBet };
      if (!await pool.start(anteBet + ppBet, undefined, selection)) { live.release(); setPhase("betting"); return; }
      const confirmed = await pool.resolveServer(selection);
      if (!isAK47BrowserDeal(confirmed)) {
        showToast("Result confirmation failed. Reopen to recover the accepted wager.");
        return;
      }
      round = confirmed;
    } else round = dealRound();
    setDeal(round);
    setDealt(false);
    setPlayerShown(false);
    setDealerShown(false);
    setRevealedCards(0);
    setResult(null);
    setPhase("dealing");
    sfx.deal();

    // Deal-in animation, then flip player cards, then reveal dealer, then settle.
    later(32, () => setDealt(true));
    for (let count = 1; count <= 6; count++) {
      later(1250 + (count - 1) * 750, () => {
        setRevealedCards(count);
        if (count === 3) setPlayerShown(true);
        if (count === 6) setDealerShown(true);
        sfx.flip();
      });
    }
    later(6750, () => settleRound(round, anteBet, ppBet));
  };

  const nextRound = (): void => {
    if (phase === "dealing") return;
    clearTimers();
    setAnte(0);
    setPairPlus(0);
    setDeal(null);
    setDealt(false);
    setPlayerShown(false);
    setDealerShown(false);
    setResult(null);
    setPhase("betting");
    sfx.click();
  };

  const toggleSound = (): void => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) sfx.click();
  };

  const bettingOpen = phase === "betting";
  const winnerSide: "player" | "dealer" | null =
    phase === "settled" && result ? (result.outcome === "win" ? "player" : "dealer") : null;

  const wins = history.filter((m) => m === "W").length;
  const roundsPlayed = history.length;

  return (
    <div className="casino-root ak47-layout">
      {live.controls}
      {/* Header */}
      <header className="casino-header">
        <div className="brand">
          <div className="brand-logo">♠</div>
          <div>
            <div className="brand-title">TEEN PATTI</div>
            <div className="brand-sub">
              <b>AK47</b> • WILD CASINO
            </div>
          </div>
        </div>
        <div className="header-actions">
          <div className="balance-pill" title="Your balance">
            <span>Rs.</span>
            {formatINR(balance)}
          </div>
          <button type="button" className="icon-btn" onClick={toggleSound} aria-label="Toggle sound">
            {soundOn ? "🔊" : "🔇"}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              setShowRules(true);
              sfx.click();
            }}
          >
            ❓ Rules
          </button>
        </div>
      </header>

      {/* Table */}
      <div className="ak47-table">
        <div className="table-inner">
          {/* History strip */}
          <div className="history-strip">
            <div className="dots">
              {Array.from({ length: HISTORY_SLOTS }).map((_, i) => {
                const mark = history[i];
                return (
                  <span
                    key={i}
                    className={`dot ${mark === "W" ? "w" : mark === "L" ? "l" : "empty"}`}
                  >
                    {mark ?? ""}
                  </span>
                );
              })}
            </div>
            <div className="session-stats">
              {roundsPlayed === 0
                ? "No rounds yet — place your first bet!"
                : `Rounds ${roundsPlayed} • Wins ${wins}`}
            </div>
          </div>

          {/* Dealer */}
          <div className={`hand-area dealer${winnerSide === "dealer" ? " winner" : ""}`}>
            <div className="hand-label">
              Dealer
              {dealerShown && deal && <span className="hand-name">{deal.dealerEval.label}</span>}
            </div>
            <div className="hand-cards">
              {deal
                ? deal.dealer.map((card, i) => (
                    <PlayingCard
                      key={`d-${i}`}
                      card={card}
                      faceUp={i + 3 < revealedCards}
                      dealt={dealt}
                      delay={i * 120}
                      glow={winnerSide === "dealer"}
                    />
                  ))
                : [0, 1, 2].map((i) => (
                    <div key={`dg-${i}`} className="card-ghost">
                      ?
                    </div>
                  ))}
            </div>
          </div>

          {/* Pot */}
          <div className="pot-wrap">
            <div className="deck-stack" aria-hidden="true">
              <div className="mini-card-back" />
              <div className="mini-card-back" />
              <div className="mini-card-back" />
            </div>
            <div className="pot-circle">
              <div className="pot-title">ANTE</div>
              <div className="pot-amt">Rs. {formatINR(ante)}</div>
              {pairPlus > 0 && <div className="pot-pp">PAIR PLUS Rs. {formatINR(pairPlus)}</div>}
              {bettingOpen && ante === 0 && pairPlus === 0 && (
                <div className="pot-hint">PLACE YOUR BET</div>
              )}
              {!bettingOpen && phase === "dealing" && <div className="pot-hint">DEALING…</div>}
            </div>
            <div className="deck-stack" aria-hidden="true">
              <div className="mini-card-back" />
              <div className="mini-card-back" />
              <div className="mini-card-back" />
            </div>
          </div>

          {/* Player */}
          <div className={`hand-area player${winnerSide === "player" ? " winner" : ""}`}>
            <div className="hand-cards">
              {deal
                ? deal.player.map((card, i) => (
                    <PlayingCard
                      key={`p-${i}`}
                      card={card}
                      faceUp={i < revealedCards}
                      dealt={dealt}
                      delay={(i + 3) * 120}
                      glow={winnerSide === "player"}
                    />
                  ))
                : [0, 1, 2].map((i) => (
                    <div key={`pg-${i}`} className="card-ghost">
                      ?
                    </div>
                  ))}
            </div>
            <div className="hand-label">
              You
              {playerShown && deal && <span className="hand-name">{deal.playerEval.label}</span>}
            </div>
          </div>

        </div>

        {/* Controls */}
        <div className="controls">
          <div className="seg" role="group" aria-label="Bet type">
            <button
              type="button"
              className={betTarget === "ante" ? "active" : ""}
              disabled={!bettingOpen}
              onClick={() => {
                setBetTarget("ante");
                sfx.click();
              }}
            >
              ANTE
              <small>pays 1 : 1</small>
            </button>
            <button
              type="button"
              className={betTarget === "pairplus" ? "active" : ""}
              disabled={!bettingOpen}
              onClick={() => {
                setBetTarget("pairplus");
                sfx.click();
              }}
            >
              PAIR PLUS
              <small>up to 30 : 1</small>
            </button>
          </div>

          <div className="chips">
            {CHIP_VALUES.map((value) => (
              <Chip
                key={value}
                value={value}
                onClick={() => addChip(value)}
                disabled={!bettingOpen}
              />
            ))}
            <div className="flex items-center gap-1" style={{ flexBasis: "100%", justifyContent: "center" }}>
              <input
                type="number"
                min={10}
                value={customAmt}
                placeholder="Custom amount"
                aria-label="Custom bet amount"
                disabled={!bettingOpen}
                onChange={(e) => setCustomAmt(e.target.value)}
                style={{ width: 120, padding: "6px 8px", borderRadius: 8, textAlign: "center", background: "rgba(0,0,0,.5)", border: "1px solid rgba(250,204,21,.5)", color: "#fde68a", fontWeight: 700 }}
              />
              <button
                type="button"
                className="btn-ghost"
                disabled={!bettingOpen || !(Math.floor(Number(customAmt)) > 0)}
                onClick={() => addChip(Math.floor(Number(customAmt)))}
              >
                ADD
              </button>
            </div>
          </div>

          <div className="bet-actions">
            {bettingOpen && (ante > 0 || pairPlus > 0) && (
              <button type="button" className="btn-ghost" onClick={clearBets}>
                CLEAR BETS
              </button>
            )}
            {phase === "betting" && (
              <button
                type="button"
                className="btn-gold btn-deal"
                onClick={() => startDeal()}
                disabled={ante < MIN_BET}
              >
                DEAL
              </button>
            )}
            {phase === "dealing" && (
              <button type="button" className="btn-gold btn-deal" disabled>
                DEALING…
              </button>
            )}
            {phase === "settled" && (
              <>
                <button type="button" className="btn-gold btn-deal" onClick={() => startDeal(true)}>
                  RE-BET
                </button>
                <button type="button" className="btn-ghost" onClick={nextRound}>
                  NEW BET
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <footer className="casino-footer">
        Entertainment only • No real money • 18+ • A, K, 4 &amp; 7 are wild
      </footer>

      {/* Coin confetti on win */}
      {coinBurst > 0 && (
        <div className="coins-layer" key={coinBurst} aria-hidden="true">
          {Array.from({ length: 26 }).map((_, i) => (
            <span
              key={i}
              className="coin"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 0.7}s`,
                animationDuration: `${2.2 + Math.random() * 1.8}s`,
              }}
            >
              {COIN_EMOJIS[i % COIN_EMOJIS.length]}
            </span>
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}

      {/* Rules modal */}
      {showRules && (
        <div className="modal-overlay" onClick={() => setShowRules(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => {
                setShowRules(false);
                sfx.click();
              }}
              aria-label="Close rules"
            >
              ✕
            </button>
            <h2>♠ TEEN PATTI AK47 — RULES</h2>
            <h3>How to play</h3>
            <p>
              Place an <b>Ante</b> bet (minimum Rs. 10), optionally add a <b>Pair Plus</b> side bet,
              then press <b>DEAL</b>. You are dealt 3 cards, the dealer gets 3 cards. Highest Teen
              Patti hand wins the ante at <b>1 : 1</b>.
            </p>
            <h3>Wild cards</h3>
            <p>
              In the AK47 variant every wild card can become any card — the best possible hand is
              made automatically:
            </p>
            <p>
              <span className="wild-chip">A</span>
              <span className="wild-chip">K</span>
              <span className="wild-chip">4</span>
              <span className="wild-chip">7</span>
            </p>
            <h3>Hand rankings (high → low)</h3>
            <table>
              <tbody>
                <tr>
                  <td>🏆 Trail</td>
                  <td>Three cards of the same rank</td>
                </tr>
                <tr>
                  <td>🥈 Pure Sequence</td>
                  <td>Three suited cards in a row (A-K-Q best, A-2-3 lowest)</td>
                </tr>
                <tr>
                  <td>🥉 Sequence</td>
                  <td>Three cards in a row, mixed suits</td>
                </tr>
                <tr>
                  <td>4️⃣ Color</td>
                  <td>Three cards of the same suit</td>
                </tr>
                <tr>
                  <td>5️⃣ Pair</td>
                  <td>Two cards of the same rank</td>
                </tr>
                <tr>
                  <td>6️⃣ High Card</td>
                  <td>None of the above</td>
                </tr>
              </tbody>
            </table>
            <h3>Pair Plus payouts</h3>
            <table>
              <tbody>
                <tr>
                  <td>Trail</td>
                  <td>30 : 1</td>
                </tr>
                <tr>
                  <td>Pure Sequence</td>
                  <td>6 : 1</td>
                </tr>
                <tr>
                  <td>Sequence</td>
                  <td>5 : 1</td>
                </tr>
                <tr>
                  <td>Color</td>
                  <td>3 : 1</td>
                </tr>
                <tr>
                  <td>Pair</td>
                  <td>1 : 1</td>
                </tr>
              </tbody>
            </table>
            <h3>Table notes</h3>
            <ul>
              <li>Ties go to the dealer.</li>
              <li>Accepted bets use your account wallet. See the pre-game rules for payout policy. 18+.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
