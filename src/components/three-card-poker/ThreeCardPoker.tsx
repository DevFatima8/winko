"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import "./three-card-poker.css";
import { BettingSpot } from "./BettingSpot";
import { ChipButton } from "./ChipButton";
import { BET_PRESETS } from "@/lib/betPresets";
import BetAmountInput from "@/components/BetAmountInput";
import { PlayingCard } from "./PlayingCard";
import {
  type Card,
  type EvaluatedHand,
  type SettlementLine,
  dealerQualifies,
  evaluateHand,
  formatMoney,
  settleRound,
  shouldPlay,
  dealRound,
} from "./lib/poker";
import { playChip, playClick, playDeal, playFlip, playLose, playWin, setMuted } from "./lib/sound";
import { cardMove, restoreCardRound } from "@/lib/interactiveCardClient";
import { useIdleCardRound } from "../teen-patti/useIdleCardRound";

type TableView = { ante: number; pairPlus: number; play: number; player: Card[]; dealer?: Card[]; folded?: boolean };
const HIDDEN: Card[] = [0, 1, 2].map((i) => ({ suit: "spades", rank: "2", id: `hidden-${i}` } as Card));

type Phase = "betting" | "dealing" | "decision" | "reveal" | "result";
type HistoryMark = "W" | "L" | "P";

const CHIPS = BET_PRESETS;
const STARTING_BANKROLL = 5000;
const MIN_BET = 10;
const STORAGE_KEY = "tcp-bankroll";

type LastBets = { ante: number; pairPlus: number };

export function ThreeCardPoker() {
  const [balance] = useGameBalance("three-card-poker", STARTING_BANKROLL);
  const pool = usePoolLifecycle("three-card-poker");
  const [ante, setAnte] = usePoolRoundState("three-card-poker", "ante", 0);
  const [pairPlus, setPairPlus] = usePoolRoundState("three-card-poker", "pairPlus", 0);
  const [playBet, setPlayBet] = useState(0);
  const [chip, setChip] = useState<number>(BET_PRESETS[0]);
  const [savedPhase] = usePoolRoundState<Phase>("three-card-poker", "phase", "betting");
  const [phase, setPhase] = useState<Phase>(savedPhase);
  const [wagerPlayerCards, setPlayerCards] = usePoolRoundState<Card[]>("three-card-poker", "playerCards", []);
  const [wagerDealerCards, setDealerCards] = usePoolRoundState<Card[]>("three-card-poker", "dealerCards", []);
  const [wagerPlayerRevealed, setPlayerRevealed] = useState(savedPhase === "decision" ? 3 : 0);
  const [wagerDealerRevealed, setDealerRevealed] = useState(savedPhase === "decision" ? 3 : 0);
  const [wagerDealerFaceUp, setDealerFaceUp] = useState(false);
  const [message, setMessage] = useState("PLACE YOUR BETS");
  const [subMessage, setSubMessage] = useState("Ante to play the dealer Â· Pair Plus optional");
  const [playerHand, setPlayerHand] = useState<EvaluatedHand | null>(null);
  const [dealerHand, setDealerHand] = useState<EvaluatedHand | null>(null);
  const [lines, setLines] = useState<SettlementLine[]>([]);
  const [profit, setProfit] = useState(0);
  const [headline, setHeadline] = useState("");
  const [muted, setMutedState] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [sheetClosed, setSheetClosed] = useState(false);
  const [history, setHistory] = useState<HistoryMark[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const lastBets = useRef<LastBets>({ ante: 0, pairPlus: 0 });
  const timers = useRef<number[]>([]);
  const dealLock = useRef(false);
  const decisionLock = useRef(false);
  const bettingLock = useRef(false);
  const idleRound = useIdleCardRound({
    idle: phase === "betting", finished: phase === "result", busy: pool.busy,
    paused: ante + pairPlus > 0,
    frames: () => {
      const hands = dealRound();
      return Array.from({ length: 7 }, (_, count) => ({
        at: count === 0 ? 0 : count <= 3 ? 400 + (count - 1) * 750 : 4250 + (count - 4) * 750,
        view: { ...hands, playerShown: Math.min(count, 3), dealerShown: Math.max(0, count - 3) },
      }));
    },
    next: () => newHand(),
  });
  const playerCards = idleRound.preview?.player ?? wagerPlayerCards;
  const dealerCards = idleRound.preview?.dealer ?? wagerDealerCards;
  const playerRevealed = idleRound.preview?.playerShown ?? wagerPlayerRevealed;
  const dealerRevealed = idleRound.preview?.dealerShown ?? wagerDealerRevealed;
  const dealerFaceUp = idleRound.preview ? idleRound.preview.dealerShown > 0 : wagerDealerFaceUp;

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  };

  useEffect(() => {
    setHydrated(true);
    return () => clearTimers();
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, String(balance));
  }, [balance, hydrated]);

  const busy = phase === "dealing" || phase === "reveal";
  const betting = phase === "betting";
  const totalBet = ante + pairPlus + playBet;

  const addToSpot = async (spot: "ante" | "pairPlus") => {
    if (!betting || busy || pool.busy || bettingLock.current || idleRound.watching) return;
    if (!Number.isSafeInteger(chip) || chip < MIN_BET) {
      setSubMessage("Enter a valid bet amount of Rs. 10 or more.");
      return;
    }
    if (balance < chip) {
      setSubMessage("Insufficient balance for this bet.");
      return;
    }
    const firstBet = ante + pairPlus === 0;
    if (firstBet && !idleRound.claim()) return;
    bettingLock.current = true;
    try {
      const current = spot === "ante" ? ante : pairPlus;
      pool.checkpoint({ ante, pairPlus, [spot]: current + chip, phase: "betting" });
      if (!await pool.stake(chip)) {
        if (firstBet) idleRound.release();
        return;
      }
      playChip();
      if (spot === "ante") setAnte(current + chip);
      else setPairPlus(current + chip);
      setSubMessage("Ante to play the dealer; Pair Plus optional. Press Deal when ready.");
    } finally {
      bettingLock.current = false;
    }
  };

  const clearSpot = async (spot: "ante" | "pairPlus") => {
    if (!betting || pool.busy || bettingLock.current || idleRound.watching) return;
    const amount = spot === "ante" ? ante : pairPlus;
    pool.checkpoint({ ante, pairPlus, [spot]: 0, phase: "betting" });
    if (amount > 0 && !await pool.reduce(amount)) return;
    playClick();
    if (spot === "ante") {
      setAnte(0);
    } else {
      setPairPlus(0);
    }
    if (ante + pairPlus === amount) idleRound.release();
  };

  const clearAll = async () => {
    if (!betting || pool.busy || bettingLock.current || idleRound.watching) return;
    playClick();
    if (ante + pairPlus > 0 && !await pool.refund()) return;
    setAnte(0);
    setPairPlus(0);
    idleRound.release();
  };

  const finishRound = useCallback(
    async (folded: boolean, pCards: Card[], dCards: Card[], anteAmt: number, ppAmt: number, playAmt: number) => {
      const pHand = evaluateHand(pCards);
      const dHand = evaluateHand(dCards);
      const settled = settleRound({
        ante: anteAmt,
        pairPlus: ppAmt,
        play: playAmt,
        folded,
        playerHand: pHand,
        dealerHand: dHand,
      });
      // The server already settled this exact hand with the same rules and credited the return.
      setPlayerHand(pHand);
      setDealerHand(dHand);
      setLines(settled.lines);
      setProfit(settled.profit);
      setHeadline(pool.enabled ? "DAILY PAYOUT PENDING" : settled.headline);
      setMessage(pool.enabled ? "DAILY PAYOUT PENDING" : settled.headline);
      if (settled.profit > 0) {
        setSubMessage(pool.enabled ? `Provisional claim ${formatMoney(settled.returned)}; daily settlement pending` : `You won ${formatMoney(settled.profit)}`);
        playWin();
      } else if (settled.profit < 0) {
        setSubMessage(pool.enabled ? `Daily payout pending — provisional claim ${formatMoney(settled.returned)}` : "No win");
        playLose();
      } else {
        setSubMessage(pool.enabled ? `Daily payout pending — provisional claim ${formatMoney(settled.returned)}` : "Bets returned");
      }
      const mark: HistoryMark = settled.profit > 0 ? "W" : settled.profit < 0 ? "L" : "P";
      setHistory((h) => [...h.slice(-11), mark]);
      setPhase("result");
      dealLock.current = false;
    },
    [],
  );

  const revealDealerThenSettle = useCallback(
    (folded: boolean, pCards: Card[], dCards: Card[], anteAmt: number, ppAmt: number, playAmt: number) => {
      setPhase("reveal");
      setMessage(folded && anteAmt > 0 ? "FOLD" : "DEALER REVEALS");
      setSubMessage("Queen or better to qualify");
      dCards.forEach((_, i) => {
        later(400 + i * 750, () => {
          playFlip();
          setDealerRevealed(i + 1);
          setDealerFaceUp(true);
        });
      });
      later(400 + 3 * 750 + 1000, () => {
        finishRound(folded, pCards, dCards, anteAmt, ppAmt, playAmt);
      });
    },
    [finishRound],
  );

  useEffect(() => {
    let disposed = false;
    void restoreCardRound<TableView>("three-card-poker", pool).then(round => {
      if (disposed || !round || round.phase !== "decision") return;
      setAnte(round.view.ante);
      setPairPlus(round.view.pairPlus);
      setPlayerCards(round.view.player);
      setDealerCards(HIDDEN);
      setPlayerRevealed(3);
      setDealerRevealed(3);
      setPlayerHand(evaluateHand(round.view.player));
      setPhase("decision");
      setMessage("PLAY OR FOLD");
    });
    return () => { disposed = true; };
    // Restore once on mount; the wallet lifecycle replays any unconfirmed move first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDeal = async (nextAnte = ante, nextPP = pairPlus) => {
    if (pool.busy || bettingLock.current || idleRound.watching) return;
    if (dealLock.current) return;
    if (nextAnte < MIN_BET && nextPP < MIN_BET) return;
    if (nextAnte > 0 && nextAnte < MIN_BET) return;
    dealLock.current = true;
    setPhase("dealing");
    lastBets.current = { ante: nextAnte, pairPlus: nextPP };
    clearTimers();
    const reply = await cardMove<TableView>(pool, "deal", { ante: nextAnte, pairPlus: nextPP });
    if (!reply) { dealLock.current = false; setPhase("betting"); return; }
    const dealt = { player: reply.view.player, dealer: reply.view.dealer ?? HIDDEN };
    setPlayerCards(dealt.player);
    setDealerCards(dealt.dealer);
    setPlayerRevealed(0);
    setDealerRevealed(0);
    setDealerFaceUp(false);
    setPlayerHand(null);
    setDealerHand(null);
    setLines([]);
    setProfit(0);
    setHeadline("");
    setPlayBet(0);
    setPhase("dealing");
    setSheetClosed(false);
    setMessage("DEALING");
    setSubMessage("Three cards each â€” player vs dealer");

    dealt.player.forEach((_, i) => {
      later(300 + i * 650, () => {
        playDeal();
        setPlayerRevealed(i + 1);
      });
    });
    dealt.dealer.forEach((_, i) => {
      later(2200 + i * 350, () => {
        playDeal();
        setDealerRevealed(i + 1);
      });
    });

    later(2200 + 3 * 350 + 500, () => {
      const pHand = evaluateHand(dealt.player);
      setPlayerHand(pHand);
      if (nextAnte <= 0) {
        setMessage("PAIR PLUS ONLY");
        setSubMessage(pHand.name);
        revealDealerThenSettle(false, dealt.player, dealt.dealer, 0, nextPP, 0);
        return;
      }
      const hint = shouldPlay(pHand)
        ? "Recommended: PLAY  (Q-6-4 or better)"
        : "Recommended: FOLD  (below Q-6-4)";
      setPhase("decision");
      setMessage("PLAY OR FOLD");
      setSubMessage(hint);
    });
  };

  const onPlay = async () => {
    if (phase !== "decision" || decisionLock.current) return;
    if (balance < ante) {
      setSubMessage("Insufficient balance for Play, which must equal Ante.");
      return;
    }
    decisionLock.current = true;
    playChip();
    const reply = await cardMove<TableView>(pool, "play");
    decisionLock.current = false;
    if (!reply?.view.dealer) return;
    setDealerCards(reply.view.dealer);
    setPlayBet(ante);
    setMessage("PLAY");
    revealDealerThenSettle(false, playerCards, reply.view.dealer, ante, pairPlus, ante);
  };

  const onFold = async () => {
    if (phase !== "decision" || decisionLock.current) return;
    decisionLock.current = true;
    playClick();
    const reply = await cardMove<TableView>(pool, "fold");
    decisionLock.current = false;
    if (!reply?.view.dealer) return;
    setDealerCards(reply.view.dealer);
    setPlayBet(0);
    revealDealerThenSettle(true, playerCards, reply.view.dealer, ante, pairPlus, 0);
  };

  const newHand = () => {
    if (phase !== "result") return;
    playClick();
    clearTimers();
    setAnte(0);
    setPairPlus(0);
    setPlayBet(0);
    setPlayerCards([]);
    setDealerCards([]);
    setPlayerRevealed(0);
    setDealerRevealed(0);
    setDealerFaceUp(false);
    setPlayerHand(null);
    setDealerHand(null);
    setLines([]);
    setProfit(0);
    setHeadline("");
    setPhase("betting");
    setMessage("PLACE YOUR BETS");
    setSubMessage("Ante to play the dealer Â· Pair Plus optional");
  };

  const rebetDeal = async () => {
    if (phase !== "result") return;
    const nextAnte = lastBets.current.ante;
    const nextPP = lastBets.current.pairPlus;
    const need = nextAnte + nextPP;
    if (need <= 0 || balance < need) return;
    playChip();
    pool.checkpoint({ ante: nextAnte, pairPlus: nextPP, phase: "betting", playerCards: [], dealerCards: [] });
    if (!await pool.start(need)) return;
    setAnte(nextAnte);
    setPairPlus(nextPP);
    setPlayBet(0);
    setPlayerCards([]);
    setDealerCards([]);
    setPlayerRevealed(0);
    setDealerRevealed(0);
    setDealerFaceUp(false);
    setPlayerHand(null);
    setDealerHand(null);
    setLines([]);
    void startDeal(nextAnte, nextPP);
  };

  const canDeal = betting && (ante >= MIN_BET || pairPlus >= MIN_BET);
  const canPlay = phase === "decision" && balance >= ante;
  const resultWin = phase === "result" && profit > 0;
  const resultLose = phase === "result" && profit < 0;

  const dealerStatus = useMemo(() => {
    if (!dealerHand || !dealerFaceUp || phase === "dealing" || phase === "decision") return "QUEEN OR BETTER TO QUALIFY";
    if (!dealerQualifies(dealerHand)) return "DEALER DOES NOT QUALIFY";
    return dealerHand.name.toUpperCase();
  }, [dealerHand, dealerFaceUp, phase]);

  return (
    <div className="casino-shell">
      <div className="casino-vignette" />

      <header className="casino-top">
        <div className="brand">
          <span className="brand-mark">â™ </span>
          <div>
            <p className="brand-kicker">Diamond Room</p>
            <h1>Three Card Poker</h1>
          </div>
        </div>

        <div className="history-strip" aria-label="Recent hands">
          {history.length === 0 ? (
            <span className="history-empty">No hands yet</span>
          ) : (
            history.map((mark, i) => (
              <span key={`${mark}-${i}`} className={`hist hist-${mark}`}>
                {mark}
              </span>
            ))
          )}
        </div>

        <div className="top-stats">
          <div className="stat-box">
            <span>Bankroll</span>
            <strong>{formatMoney(balance)}</strong>
          </div>
          <div className="stat-box">
            <span>Total bet</span>
            <strong>{formatMoney(totalBet)}</strong>
          </div>
          <button type="button" className="icon-btn" onClick={() => setRulesOpen(true)} aria-label="Rules">
            ?
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              const next = !muted;
              setMutedState(next);
              setMuted(next);
              playClick();
            }}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? "ðŸ”‡" : "ðŸ”Š"}
          </button>
        </div>
      </header>

      <div className="table-rail">
        <div className="felt">
          <div className="felt-shine" />
          <p className="felt-title">Three Card Poker</p>

          <aside className="felt-pay left-pay">
            <h3>Pair Plus</h3>
            <ul>
              <li>
                <span>Mini Royal</span>
                <b>50 to 1</b>
              </li>
              <li>
                <span>Straight Flush</span>
                <b>40 to 1</b>
              </li>
              <li>
                <span>3 of a Kind</span>
                <b>30 to 1</b>
              </li>
              <li>
                <span>Straight</span>
                <b>6 to 1</b>
              </li>
              <li>
                <span>Flush</span>
                <b>3 to 1</b>
              </li>
              <li>
                <span>Pair</span>
                <b>1 to 1</b>
              </li>
            </ul>
          </aside>

          <aside className="felt-pay right-pay">
            <h3>Ante Bonus</h3>
            <ul>
              <li>
                <span>Straight Flush</span>
                <b>5 to 1</b>
              </li>
              <li>
                <span>3 of a Kind</span>
                <b>4 to 1</b>
              </li>
              <li>
                <span>Straight</span>
                <b>1 to 1</b>
              </li>
            </ul>
            <p className="qualify-note">Dealer plays Queen or better</p>
          </aside>

          <div className="shoe" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>

          <section className="dealer-area">
            <p className="seat-tag">Dealer</p>
            <div className="card-row">
              {[0, 1, 2].map((i) => (
                <PlayingCard
                  key={`d-${dealerCards[i]?.id ?? i}`}
                  card={dealerCards[i]}
                  dealt={dealerRevealed > i}
                  faceDown={!dealerFaceUp}
                  delay={i * 80}
                  highlight={phase === "result" && profit < 0}
                  dim={phase === "result" && profit > 0}
                />
              ))}
            </div>
            <p className="hand-caption">{dealerStatus}</p>
            {dealerHand && dealerFaceUp && phase !== "dealing" ? (
              <p className="hand-name gold">{dealerHand.name}</p>
            ) : null}
          </section>

          <div className={`table-banner ${resultWin ? "is-win" : ""} ${resultLose ? "is-lose" : ""}`}>
            <p className="banner-main">{idleRound.watching ? "ROUND IN PROGRESS" : message}</p>
            <p className="banner-sub">{idleRound.watching ? "Place your bets when the next betting window opens." : subMessage}</p>
          </div>

          <section className="spots-row">
            <BettingSpot
              label="Pair Plus"
              sub="Hand pays"
              amount={pairPlus}
              accent="blue"
              active={betting}
              disabled={!betting || idleRound.watching}
              onClick={() => addToSpot("pairPlus")}
              onClear={() => clearSpot("pairPlus")}
            />
            <BettingSpot
              label="Ante"
              sub="Vs dealer"
              amount={ante}
              accent="gold"
              active={betting}
              disabled={!betting || idleRound.watching}
              onClick={() => addToSpot("ante")}
              onClear={() => clearSpot("ante")}
            />
            <BettingSpot
              label="Play"
              sub="Equals ante"
              amount={playBet}
              accent="red"
              active={phase === "decision"}
              disabled={!canPlay}
              onClick={onPlay}
            />
          </section>

          <section className="player-area">
            <div className="card-row">
              {[0, 1, 2].map((i) => (
                <PlayingCard
                  key={`p-${playerCards[i]?.id ?? i}`}
                  card={playerCards[i]}
                  dealt={playerRevealed > i}
                  faceDown={false}
                  delay={i * 80}
                  highlight={phase === "result" && profit > 0}
                />
              ))}
            </div>
            <p className="seat-tag">Player</p>
            {playerHand && playerRevealed >= 3 ? <p className="hand-name">{playerHand.name}</p> : null}
          </section>

        </div>
      </div>

      <footer className="casino-dock">
        <div className="chip-rack">
          {CHIPS.map((value) => (
            <ChipButton
              key={value}
              value={value}
              selected={chip === value}
              disabled={!betting || balance < value}
              onClick={() => {
                playClick();
                setChip(value);
              }}
            />
          ))}
          <BetAmountInput value={chip} onChange={setChip} disabled={!betting || idleRound.watching} />
        </div>

        <div className="action-row">
          {betting ? (
            <>
              <button type="button" className="btn ghost" onClick={clearAll} disabled={ante + pairPlus === 0}>
                Clear
              </button>
              <button type="button" className="btn gold" onClick={() => startDeal()} disabled={!canDeal}>
                Deal
              </button>
            </>
          ) : null}

          {phase === "decision" ? (
            <>
              <button type="button" className="btn ghost danger" onClick={onFold}>
                Fold
              </button>
              <button type="button" className="btn gold" onClick={onPlay} disabled={!canPlay}>
                Play {formatMoney(ante)}
              </button>
            </>
          ) : null}

          {phase === "result" ? (
            <>
              <button type="button" className="btn ghost" onClick={newHand}>
                New Hand
              </button>
              <button
                type="button"
                className="btn gold"
                onClick={rebetDeal}
                disabled={balance < lastBets.current.ante + lastBets.current.pairPlus}
              >
                Rebet &amp; Deal
              </button>
            </>
          ) : null}

          {busy ? <button type="button" className="btn gold" disabled>Dealingâ€¦</button> : null}

        </div>

        <p className="limits">Min {formatMoney(MIN_BET)} Â· Max {formatMoney(Math.floor(balance))} Â· Play equals Ante</p>
      </footer>

      {rulesOpen ? (
        <div className="modal-back" onClick={() => setRulesOpen(false)} role="presentation">
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="rules-title">
            <button type="button" className="modal-x" onClick={() => setRulesOpen(false)} aria-label="Close">
              Ã—
            </button>
            <h2 id="rules-title">How to Play</h2>
            <ol>
              <li>Place an Ante to play against the dealer. Pair Plus is optional and pays on your own three-card hand.</li>
              <li>You and the dealer each receive three cards. Only you can look at your cards first.</li>
              <li>Fold and lose the Ante, or Play by betting an amount equal to the Ante.</li>
              <li>Dealer needs Queen-high or better to qualify. If not, Ante pays 1:1 and Play pushes.</li>
              <li>If the dealer qualifies, the higher three-card hand wins even money on Ante and Play. Ties push.</li>
              <li>Ante Bonus pays on Straight or better even if the dealer wins, as long as you played.</li>
              <li>Pair Plus pays according to the felt regardless of the dealer&apos;s hand.</li>
            </ol>
            <div className="rules-pays">
              <div>
                <h3>Pair Plus</h3>
                <p>Mini Royal 50:1 Â· SF 40:1 Â· Trips 30:1 Â· Straight 6:1 Â· Flush 3:1 Â· Pair 1:1</p>
              </div>
              <div>
                <h3>Ante Bonus</h3>
                <p>Straight Flush 5:1 Â· Three of a Kind 4:1 Â· Straight 1:1</p>
              </div>
            </div>
            <p className="modal-note">
              Hand ranks (high to low): Mini Royal Â· Straight Flush Â· Three of a Kind Â· Straight Â· Flush Â· Pair Â· High Card.
              In three-card poker a straight beats a flush. Basic strategy: play Q-6-4 or better, otherwise fold.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
