"use client";
import { gameSfx } from "@/lib/gameSfx";
import { GameOverOverlay } from "@/components/GameOverOverlay";

import { useEffect, useRef, useState } from "react";
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import BetAmountInput from "@/components/BetAmountInput";
import { cardMove, restoreCardRound } from "@/lib/interactiveCardClient";
import { useIdleCardRound } from "../teen-patti/useIdleCardRound";
import "./blackjack.css";

type Suit = "♠" | "♥" | "♦" | "♣";
type Card = { rank: string; suit: Suit; value: number; id: number };
type RoundStatus = "idle" | "playing" | "settled";
type Outcome = "win" | "loss";
type IconName = "table" | "chart" | "rules" | "arrow" | "minus" | "plus" | "chip" | "sparkle" | "close" | "shield" | "refresh";
type SessionStats = {
  wins: number;
  losses: number;
  net: number;
  recent: Outcome[];
};

const CHIP_VALUES = BET_PRESETS;
const STARTING_CREDITS = 1_000;
const MIN_BET = 10;
const CARD_REVIEW_MS = 1100;
const OPENING_CARD_GAP_MS = 650;
const OPENING_DEAL_MS = OPENING_CARD_GAP_MS * 4;
const RESULT_REVIEW_MS = 3000;

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const shared = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "table":
      return <svg {...shared}><rect x="3.5" y="5" width="17" height="14" rx="6" /><path d="M8 5c0 3.1 1.7 5 4 5s4-1.9 4-5M8 19c0-3.1 1.7-5 4-5s4 1.9 4 5" /><circle cx="12" cy="12" r="1" /></svg>;
    case "chart":
      return <svg {...shared}><path d="M4 19.5h16M6.5 16v-4M11.5 16V7M16.5 16v-6" /><path d="m5 8 5-3 5 3 4-4" /></svg>;
    case "rules":
      return <svg {...shared}><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.3 2.3 0 1 1 3.9 1.7c-1.1 1-1.7 1.5-1.7 2.8M12 16.8v.1" /></svg>;
    case "arrow":
      return <svg {...shared}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
    case "minus":
      return <svg {...shared}><path d="M5 12h14" /></svg>;
    case "plus":
      return <svg {...shared}><path d="M12 5v14M5 12h14" /></svg>;
    case "chip":
      return <svg {...shared}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5.2" /><path d="M12 3v3M12 18v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1" /></svg>;
    case "sparkle":
      return <svg {...shared}><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></svg>;
    case "close":
      return <svg {...shared}><path d="m6 6 12 12M18 6 6 18" /></svg>;
    case "shield":
      return <svg {...shared}><path d="M12 3 19 6v5c0 4.5-2.8 7.8-7 10-4.2-2.2-7-5.5-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
    case "refresh":
      return <svg {...shared}><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 11.9-3" /></svg>;
  }
}

function createShoe(): Card[] {
  const suits: Suit[] = ["♠", "♥", "♦", "♣"];
  const ranks = [
    { rank: "A", value: 11 },
    { rank: "2", value: 2 },
    { rank: "3", value: 3 },
    { rank: "4", value: 4 },
    { rank: "5", value: 5 },
    { rank: "6", value: 6 },
    { rank: "7", value: 7 },
    { rank: "8", value: 8 },
    { rank: "9", value: 9 },
    { rank: "10", value: 10 },
    { rank: "J", value: 10 },
    { rank: "Q", value: 10 },
    { rank: "K", value: 10 },
  ];
  const shoe: Card[] = [];
  let id = 0;

  for (let deck = 0; deck < 6; deck += 1) {
    for (const suit of suits) {
      for (const { rank, value } of ranks) {
        shoe.push({ rank, suit, value, id: id++ });
      }
    }
  }

  for (let index = shoe.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shoe[index], shoe[swapIndex]] = [shoe[swapIndex], shoe[index]];
  }

  return shoe;
}

type TableView = { bet: number; player: Card[]; dealer: Card[]; hidden: boolean; outcome?: Outcome; natural?: boolean; payout?: number };
const HOLE: Card = { rank: "?", suit: "\u2660" as Suit, value: 0, id: -1 };
const shownDealer = (view: TableView) => view.hidden ? [...view.dealer, HOLE] : view.dealer;

function handValue(cards: Card[]): number {
  let total = cards.reduce((sum, card) => sum + card.value, 0);
  let aces = cards.filter((card) => card.rank === "A").length;

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return total;
}

function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards) === 21;
}

function formatCredits(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function PlayingCard({ card, hidden = false, delayMs = 0 }: { card?: Card; hidden?: boolean; delayMs?: number }) {
  if (hidden) {
    return (
      <div key="hidden" className="playing-card card-back" aria-label="Dealer's hidden card" style={{ animationDelay: `${delayMs}ms` }}>
        <div className="card-back-inner"><span>21</span></div>
      </div>
    );
  }

  if (!card) {
    return <div className="playing-card card-placeholder" aria-hidden="true"><span>✦</span></div>;
  }

  const isRed = card.suit === "♥" || card.suit === "♦";
  return (
    <div key={card.id} className={`playing-card ${isRed ? "card-red" : "card-black"}`} style={{ animationDelay: `${delayMs}ms` }} aria-label={`${card.rank} ${card.suit}`}>
      <span className="card-corner card-corner-top"><b>{card.rank}</b><i>{card.suit}</i></span>
      <span className="card-center-suit">{card.suit}</span>
      <span className="card-corner card-corner-bottom"><b>{card.rank}</b><i>{card.suit}</i></span>
    </div>
  );
}

import Link from "next/link";

export default function BlackjackGame({ backHref = "/player" }: { backHref?: string }) {
  const [savedShoe, setSavedShoe] = usePoolRoundState<Card[]>("blackjack", "shoe", []);
  const shoeRef = useRef<Card[]>(savedShoe);
  const [credits] = useGameBalance("blackjack", STARTING_CREDITS);
  const pool = usePoolLifecycle("blackjack");
  const [bet, setBet] = useState(50);
  const [activeBet, setActiveBet] = usePoolRoundState("blackjack", "activeBet", 0);
  const [wagerPlayerCards, setPlayerCards] = usePoolRoundState<Card[]>("blackjack", "playerCards", []);
  const [wagerDealerCards, setDealerCards] = usePoolRoundState<Card[]>("blackjack", "dealerCards", []);
  const [status, setStatus] = usePoolRoundState<RoundStatus>("blackjack", "status", "idle");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [endDismissed, setEndDismissed] = useState(false);
  const [overlayReady, setOverlayReady] = useState(false);
  const [wagerDealerRevealed, setDealerRevealed] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [openingDeal, setOpeningDeal] = useState(false);
  const actionLock = useRef(false);
  const pauseRef = useRef<{ timer: ReturnType<typeof setTimeout>; resolve: (active: boolean) => void } | null>(null);
  const [targetOutcome, setTargetOutcome] = usePoolRoundState<Outcome | null>("blackjack", "targetOutcome", null);
  const [notice, setNotice] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [stats, setStats] = useState<SessionStats>({ wins: 0, losses: 0, net: 0, recent: [] });
  const idleRound = useIdleCardRound({
    idle: status === "idle", finished: status === "settled" && overlayReady && !actionBusy,
    busy: pool.busy || actionBusy,
    frames: () => {
      const shoe = createShoe();
      const player = shoe.slice(0, 2), dealer = shoe.slice(2, 4);
      return [
        { at: 0, view: { player: [] as Card[], dealer: [] as Card[], revealed: false } },
        { at: 650, view: { player: player.slice(0, 1), dealer: [] as Card[], revealed: false } },
        { at: 1300, view: { player: player.slice(0, 1), dealer: [dealer[0]], revealed: false } },
        { at: 1950, view: { player, dealer: [dealer[0], HOLE], revealed: false } },
        { at: 3700, view: { player, dealer, revealed: true } },
      ];
    },
    next: () => {
      setActiveBet(0);
      setPlayerCards([]);
      setDealerCards([]);
      setOutcome(null);
      setOverlayReady(false);
      setDealerRevealed(false);
      setStatus("idle");
    },
  });
  const playerCards = idleRound.preview?.player ?? wagerPlayerCards;
  const dealerCards = idleRound.preview?.dealer ?? wagerDealerCards;
  const dealerRevealed = idleRound.preview?.revealed ?? wagerDealerRevealed;

  const playerTotal = handValue(playerCards);
  const dealerTotal = handValue(dealerCards);
  const rounds = stats.wins + stats.losses;

  useEffect(() => () => {
    if (pauseRef.current) {
      clearTimeout(pauseRef.current.timer);
      pauseRef.current.resolve(false);
      pauseRef.current = null;
    }
  }, []);

  function pause(duration: number) {
    return new Promise<boolean>(resolve => {
      const timer = setTimeout(() => {
        pauseRef.current = null;
        resolve(true);
      }, duration);
      pauseRef.current = { timer, resolve };
    });
  }

  async function runAction(action: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true;
    setActionBusy(true);
    try {
      await action();
    } finally {
      actionLock.current = false;
      setActionBusy(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setRulesOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function finishRound(view: TableView, opening = false) {
    const selectedOutcome: Outcome = view.outcome ?? "loss";
    const finalPlayer = view.player;
    const finalDealer = view.dealer;
    const wager = view.bet;
    const natural = view.natural === true;
    const payout = view.payout ?? 0;
    const netChange = payout - wager;
    setActiveBet(wager);
    setPlayerCards(finalPlayer);
    if (opening) {
      if (!await pause(OPENING_DEAL_MS)) return;
      setOpeningDeal(false);
    }
    // Let the player see their last card, then reveal the dealer one card at a time.
    if (!await pause(CARD_REVIEW_MS)) return;
    setDealerRevealed(true);
    setDealerCards(finalDealer.slice(0, 2));
    if (!await pause(CARD_REVIEW_MS)) return;
    for (let count = 3; count <= finalDealer.length; count++) {
      gameSfx.flip();
      setDealerCards(finalDealer.slice(0, count));
      if (!await pause(CARD_REVIEW_MS)) return;
    }

    if (selectedOutcome === "win") gameSfx.win(); else gameSfx.lose();
    setPlayerCards(finalPlayer);
    setDealerCards(finalDealer);
    setOutcome(selectedOutcome);
    setEndDismissed(false);
    setStatus("settled");
    setNotice(
      pool.enabled ? `Provisional claim Rs. ${payout}; daily pool settlement pending.` : selectedOutcome === "win"
        ? natural
          ? "Blackjack — your hand paid 3:2."
          : "A winning hand ? your winnings are on the way."
        : ""
    );
    setStats((current) => ({
      wins: current.wins + (selectedOutcome === "win" ? 1 : 0),
      losses: current.losses + (selectedOutcome === "loss" ? 1 : 0),
      net: current.net + netChange,
      recent: [selectedOutcome, ...current.recent].slice(0, 8),
    }));
    if (!await pause(RESULT_REVIEW_MS)) return;
    setOverlayReady(true);
  }

  function showTable(view: TableView) {
    setActiveBet(view.bet);
    setPlayerCards(view.player);
    setDealerCards(shownDealer(view));
  }

  useEffect(() => {
    let disposed = false;
    void restoreCardRound<TableView>("blackjack", pool).then(async restored => {
      if (disposed || !restored) return;
      const round = restored.phase === "accepted" ? await cardMove<TableView>(pool, "deal") : restored;
      if (disposed || !round) return;
      setOutcome(null);
      setOverlayReady(false);
      setDealerRevealed(false);
      setStatus("playing");
      showTable(round.view);
      if (round.phase === "settled") await finishRound(round.view);
      else setNotice("Your turn — hit, stand, or double down.");
    });
    return () => { disposed = true; };
    // Restore once on mount; the wallet lifecycle replays any unconfirmed move first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function dealRound() {
    if (status !== "idle" || !idleRound.claim()) return;
    await runAction(async () => {
      gameSfx.deal();
      if (bet < MIN_BET) {
        idleRound.release();
        setNotice("Minimum bet is Rs. 50. Players must place at least Rs. 50.");
        return;
      }
      if (bet > credits) {
        idleRound.release();
        setNotice("Insufficient balance.");
        return;
      }

      gameSfx.deal();
      if (!await pool.start(bet)) { idleRound.release(); return; }
      const round = await cardMove<TableView>(pool, "deal");
      if (!round) return;
      setOpeningDeal(true);
      setOutcome(null);
      setOverlayReady(false);
      setDealerRevealed(false);
      setStatus("playing");
      setNotice("Your turn — hit, stand, or double down.");
      if (round.phase === "settled") {
        setActiveBet(round.view.bet);
        setPlayerCards(round.view.player);
        setDealerCards([round.view.dealer[0]!, HOLE]);
        await finishRound(round.view, true);
      } else {
        showTable(round.view);
        if (!await pause(OPENING_DEAL_MS)) return;
        setOpeningDeal(false);
      }
    });
  }

  async function hit() {
    if (status !== "playing") return;
    await runAction(async () => {
      gameSfx.flip();
      const round = await cardMove<TableView>(pool, "hit");
      if (!round) return;
      setPlayerCards(round.view.player);
      if (round.phase === "settled") {
        await finishRound(round.view);
      } else {
        setNotice("Good card. Hit again or lock in your hand with stand.");
        await pause(CARD_REVIEW_MS);
      }
    });
  }

  async function stand() {
    if (status !== "playing") return;
    await runAction(async () => {
      gameSfx.click();
      const round = await cardMove<TableView>(pool, "stand");
      if (round) await finishRound(round.view);
    });
  }

  async function doubleDown() {
    if (status !== "playing" || playerCards.length !== 2 || credits < activeBet) return;
    await runAction(async () => {
      const round = await cardMove<TableView>(pool, "double");
      if (!round) return;
      setActiveBet(round.view.bet);
      setPlayerCards(round.view.player);
      await finishRound(round.view);
    });
  }

  function adjustBet(amount: number) {
    if (status !== "idle" || idleRound.watching) return;
    setBet((current) => Math.min(credits, Math.max(MIN_BET, current + amount)));
  }

  function chooseBet(amount: number) {
    if (status !== "idle" || idleRound.watching) return;
    setBet(Math.min(credits, Math.max(MIN_BET, amount)));
  }

  return (
    <main className="app-shell h-full w-full flex flex-col overflow-hidden">
      {idleRound.countdown !== null && <p className="shrink-0 text-center text-xs text-amber-200" role="status">Next round in {idleRound.countdown}s</p>}
      <div className="app-main h-full w-full flex flex-col min-h-0 overflow-hidden" id="top">
        <header className="topbar shrink-0 flex items-center justify-between px-3 sm:px-4 py-2 border-b border-[#e7d9b1]/10 bg-[#090c0b]/80">
          <div className="flex items-center gap-2 sm:gap-3">
            {backHref && (
              <Link href={backHref} className="flex h-7 w-7 items-center justify-center rounded-full bg-[#dc2626] hover:bg-[#b91c1c] active:bg-[#991b1b] border border-[#ef4444] text-xs font-black text-white shadow transition-colors" title="Back / Exit">
                ←
              </Link>
            )}
            <div className="wordmark flex items-center gap-2">
              <span className="wordmark-icon">V</span>
              <span className="text-xs sm:text-sm font-black tracking-wider text-[#f4f0e7]">VELVET <b className="text-[#d3b372]">21</b></span>
            </div>
            <span className="hidden md:inline-flex practice-pill"><i />PRACTICE</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-[#ddcfaa]/20 bg-[#151c18] px-2.5 py-1 text-xs text-[#f5efdd]">
              <span className="text-[10px] text-[#9da18f] hidden sm:inline">BALANCE:</span>
              <strong className="font-bold text-[#ead59b]"><small className="text-[9px]">Rs.</small> {formatCredits(credits)}</strong>
            </div>
            <button className="rules-link text-xs flex items-center gap-1 text-[#ead59b] hover:text-[#fff1c6]" type="button" onClick={() => setRulesOpen(true)}>
              <Icon name="rules" size={15} /> <span className="hidden sm:inline">RULES</span>
            </button>
          </div>
        </header>

        <div className="page-content flex-1 min-h-0 w-full flex flex-col p-2 sm:p-3 overflow-hidden">
          <section className="game-layout flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_290px] xl:grid-cols-[1fr_310px] gap-2 sm:gap-3 overflow-hidden" aria-label="Blackjack game">
            <section className="felt-table h-full flex-1 min-h-0 flex flex-col justify-between overflow-hidden rounded-xl sm:rounded-2xl border border-[#cfb379]/50 shadow-2xl" id="table" aria-label="Blackjack table">
              <div className="felt-grain" />
              <div className="table-topline shrink-0 px-3 py-1.5 flex items-center justify-between text-[10px] text-yellow-100/70">
                <span><i className="table-live-dot" /> TABLE NO. 07</span>
                <span>6 DECKS <b>·</b> DEALER STANDS ON 17</span>
              </div>
              <div className="felt-ornament felt-ornament-one" />
              <div className="felt-ornament felt-ornament-two" />
              <div className="watermark">21</div>

              <div className="felt-content flex-1 min-h-0 flex flex-col justify-between py-1 px-4 sm:py-2">
                {/* Dealer zone */}
                <div className="hand-zone dealer-zone shrink-0">
                  <div className="hand-label-row mb-1">
                    <div className="hand-label"><span className="hand-dot dealer-dot" /><span>DEALER</span></div>
                    <div className="hand-total">{dealerCards.length === 0 ? "—" : status === "playing" && !dealerRevealed ? `${handValue([dealerCards[0]])} + ?` : dealerTotal}</div>
                  </div>
                  <div className="cards-row dealer-cards">
                    {dealerCards.length === 0 ? <><PlayingCard /><PlayingCard /></> : dealerCards.map((card, index) => <PlayingCard key={card.id} card={card} hidden={status === "playing" && !dealerRevealed && index === 1} delayMs={openingDeal ? (index * 2 + 1) * OPENING_CARD_GAP_MS : 0} />)}
                  </div>
                </div>

                {/* Center marker & result banner */}
                <div className="relative my-auto flex flex-col items-center justify-center py-1">
                  <div className="table-center-mark pointer-events-none opacity-40">
                    <span className="center-diamond">✦</span>
                    <b className="tracking-widest">BLACKJACK</b>
                    <span className="text-[8px]">21 • ALL CLASS</span>
                  </div>
                  {status === "settled" && outcome && (
                    <div className={`round-result result-${outcome} z-10`} role="status">
                      <span className="result-icon">{outcome === "win" ? "✦" : "♠"}</span>
                      <span>
                        <b>{pool.enabled ? "DAILY PAYOUT PENDING" : outcome === "win" ? "NICE HAND" : ""}</b>
                        <small>{pool.enabled ? `Provisional claim Rs. ${formatCredits(outcome === "win" ? Math.round(activeBet * (isBlackjack(playerCards) ? 2.5 : 2)) : 0)}` : outcome === "win" ? `+Rs. ${formatCredits(Math.round(activeBet * (isBlackjack(playerCards) ? 1.5 : 1)))} · WIN` : "TRY AGAIN"}</small>
                      </span>
                    </div>
                  )}
                </div>

                {/* Player zone */}
                <div className="hand-zone player-zone shrink-0">
                  <div className="hand-label-row mb-1">
                    <div className="hand-label"><span className="hand-dot player-dot" /><span>YOUR HAND</span></div>
                    <div className={`hand-total ${playerTotal > 21 ? "total-bust" : ""}`}>
                      {playerCards.length ? playerTotal : "—"}
                      {playerCards.length > 0 && playerTotal === 21 && status === "playing" ? <span className="twenty-one ml-1">21</span> : null}
                    </div>
                  </div>
                  <div className="cards-row player-cards">
                    {playerCards.length === 0 ? <><PlayingCard /><PlayingCard /></> : playerCards.map((card, index) => <PlayingCard key={card.id} card={card} delayMs={openingDeal ? index * 2 * OPENING_CARD_GAP_MS : 0} />)}
                  </div>
                </div>
              </div>

              <div className="felt-footer shrink-0 px-3 py-1 flex items-center justify-between text-[9px] text-yellow-100/60">
                <span><Icon name="shield" size={12} /> SIMULATED GAMEPLAY</span>
                <span>GOOD LUCK, GOOD TASTE.</span>
              </div>
            </section>

            <aside className="right-rail h-full shrink-0 flex flex-col justify-between gap-2 overflow-y-auto lg:overflow-y-hidden">
              <section className="bet-panel flex-1 flex flex-col justify-between rounded-xl p-3 bg-[#111714] border border-[#ded0a3]/15 shadow-xl" aria-label="Bet and game controls">
                <div className="panel-heading flex items-center justify-between">
                  <div>
                    <span className="panel-kicker text-[8px] uppercase tracking-wider text-[#9da18f]">ROUND CONTROLS</span>
                    <h2 className="text-sm sm:text-base font-semibold text-[#f2eee3]">{status === "playing" ? "Your move." : status === "settled" ? "Another hand?" : "Place your bet."}</h2>
                  </div>
                  <span className="round-number text-xs text-[#ead59b]">#{rounds + 1}</span>
                </div>

                <div className="bet-display my-2 flex items-center justify-between rounded-lg p-2 bg-[#d3b372]/10 border border-[#d3b372]/20">
                  <span className="text-[9px] text-[#9b9d8e] tracking-wider">{status === "playing" ? "IN PLAY" : "YOUR WAGER"}</span>
                  <strong className="text-base sm:text-lg text-[#f5edda] font-bold"><small className="text-[10px]">Rs.</small> {formatCredits(status === "playing" ? activeBet : bet)}</strong>
                </div>

                {status !== "playing" ? (
                  <div className="flex flex-col gap-2">
                    <div className="bet-stepper h-9 flex items-center justify-between px-2 rounded-lg bg-[#0f172a] border border-slate-700">
                      <button type="button" onClick={() => adjustBet(-50)} disabled={bet <= MIN_BET || idleRound.watching || status !== "idle"} aria-label="Decrease bet"><Icon name="minus" size={15} /></button>
                      <span className="text-xs font-bold text-white"><small className="text-[#858a7f]">Rs.</small> {formatCredits(bet)}</span>
                      <button type="button" onClick={() => adjustBet(50)} disabled={bet >= credits || idleRound.watching || status !== "idle"} aria-label="Increase bet"><Icon name="plus" size={15} /></button>
                    </div>

                    <div className="chip-picker grid grid-cols-5 gap-1.5 my-1">
                      {CHIP_VALUES.map((value, index) => (
                        <button type="button" key={value} onClick={() => chooseBet(value)} disabled={idleRound.watching || status !== "idle"} className={`chip-option chip-option-${index} ${bet === value ? "chip-selected" : ""} py-1.5 text-xs font-bold rounded-lg border transition`} aria-pressed={bet === value}>
                          <span>{value}</span>
                        </button>
                      ))}
                    </div>
                    <BetAmountInput value={bet} onChange={chooseBet} disabled={idleRound.watching || status !== "idle"} max={credits} className="self-center" />

                    <button className="primary-action w-full h-11 flex items-center justify-center gap-2 rounded-lg bg-[#16a34a] hover:bg-[#15803d] active:bg-[#14532d] border border-[#22c55e] text-white font-black text-xs tracking-wider transition-all shadow hover:scale-[1.01] active:scale-[0.98] disabled:opacity-40 cursor-pointer" type="button" onClick={dealRound} disabled={actionBusy || idleRound.watching || status !== "idle" || credits < MIN_BET || bet > credits}>
                      <span>{status === "settled" ? "DEAL AGAIN" : "DEAL THE CARDS"}</span>
                      <Icon name="arrow" size={16} />
                    </button>
                    {notice && <div className={`mt-1.5 rounded-lg px-2.5 py-1.5 text-xs text-center font-bold ${notice.includes("Minimum bet") || outcome === "loss" ? "bg-[#dc2626] text-white border border-[#ef4444]" : outcome === "win" ? "bg-[#16a34a] text-white border border-[#22c55e]" : "bg-[#0284c7] text-white border border-[#38bdf8]"}`}>{notice}</div>}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="action-buttons grid grid-cols-2 gap-2">
                      <button className="action-button h-12 flex flex-col items-center justify-center rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] active:bg-[#1e40af] border border-[#3b82f6] text-white transition-all shadow cursor-pointer" type="button" onClick={hit} disabled={actionBusy}>
                        <span className="font-black text-xs text-white">HIT</span>
                        <small className="text-[9px] text-blue-100 font-semibold">Take a card</small>
                      </button>
                      <button className="action-button action-stand h-12 flex flex-col items-center justify-center rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] active:bg-[#991b1b] border border-[#ef4444] text-white transition-all shadow cursor-pointer" type="button" onClick={stand} disabled={actionBusy}>
                        <span className="font-black text-xs text-white">STAND</span>
                        <small className="text-[9px] text-red-100 font-semibold">Keep hand</small>
                      </button>
                    </div>
                    <button className="double-action w-full h-10 flex items-center justify-center gap-2 rounded-lg bg-[#d97706] hover:bg-[#b45309] active:bg-[#92400e] border border-[#f59e0b] text-white text-xs font-bold transition-all shadow disabled:opacity-40 cursor-pointer" type="button" onClick={doubleDown} disabled={actionBusy || playerCards.length !== 2 || credits < activeBet}>
                      <span className="font-black text-white">DOUBLE DOWN</span>
                      <small className="text-[9px] text-amber-100 font-semibold">(2x bet · 1 card)</small>
                    </button>
                    <div className="in-play-tip text-[10px] text-center text-[#8c9487] flex items-center justify-center gap-1">
                      <Icon name="sparkle" size={12} /> {playerCards.length === 2 ? "Hit, stand, or double down." : "Hit to draw or stand to hold."}
                    </div>
                  </div>
                )}
              </section>

              <section className="session-panel shrink-0 rounded-xl p-2.5 bg-[#111714] border border-[#ded0a3]/15 flex items-center justify-between text-xs" id="session" aria-label="Session statistics">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#82887c]">HANDS:</span>
                  <strong className="font-bold text-white">{formatCredits(rounds)}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#82887c]">WINS:</span>
                  <strong className="font-bold text-emerald-400">{stats.wins}</strong>
                </div>
              </section>
            </aside>
          </section>
        </div>
      </div>

      {rulesOpen && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRulesOpen(false); }}>
          <section className="rules-modal max-w-md w-full rounded-2xl bg-[#111714] border border-[#d3b372]/40 p-5 text-sm text-[#c0c0b4] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="rules-title">
            <div className="modal-topline flex items-center justify-between pb-3 border-b border-white/10 text-xs text-[#ead59b]">
              <span>VELVET 21 · RULES</span>
              <button type="button" onClick={() => setRulesOpen(false)} aria-label="Close rules" className="text-white hover:text-rose-400 font-bold">✕</button>
            </div>
            <div className="rules-list my-3 flex flex-col gap-2 text-xs">
              <div><b>01</b> <span>Pick a wager from Rs. 50 to Rs. 1000.</span></div>
              <div><b>02</b> <span>Hit to draw, stand to hold, or double your wager for one card.</span></div>
              <div><b>03</b> <span>A natural blackjack pays 3:2. Dealer stands on 17.</span></div>
              <div><b>04</b> <span>All balances are for entertainment only.</span></div>
            </div>
            <button className="modal-done w-full py-2.5 rounded-lg bg-[#16a34a] hover:bg-[#15803d] border border-[#22c55e] text-white font-black text-xs tracking-wider transition-colors shadow cursor-pointer" type="button" onClick={() => setRulesOpen(false)}>
              GOT IT
            </button>
          </section>
        </div>
      )}
      <GameOverOverlay open={overlayReady && status === "settled" && !!outcome && !endDismissed} title={outcome === "win" ? "Congratulations! You win" : ""} winAmount={outcome === "win" ? Math.round(activeBet * (isBlackjack(playerCards) ? 2.5 : 2)) : 0} result={pool.enabled ? "Daily payout pending. This hand records a provisional claim, not a wallet payment." : outcome === "win" ? "You won this hand." : ""} onPlayAgain={dealRound} onClose={() => setEndDismissed(true)} />
    </main>
  );
}
