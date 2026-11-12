"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import "./teen-patti-royale.css";
import {
  HAND_RANKINGS,
  MIN_BET,
  STARTING_BALANCE,
  SUIT_SYMBOLS,
  formatINR,
  isRedSuit,
  rankLabel,
  dealHands,
  type PlayingCard,
} from "./lib/teenpatti";
import { getMuted, setMuted, sfx } from "./lib/sound";
import { cardMove, restoreCardRound } from "@/lib/interactiveCardClient";
import { useIdleCardRound } from "./useIdleCardRound";

type TableView = { player: PlayingCard[]; dealer?: PlayingCard[]; playerHand: string; dealerHand?: string; win?: boolean };
const HIDDEN: PlayingCard[] = [0, 1, 2].map((i) => ({ rank: 2, suit: "spades", id: `hidden-${i}` }));

type Phase = "betting" | "dealing" | "dealt" | "reveal" | "result";
type PlayChoice = "blind" | "seen" | "fold";

interface RoundResult {
  win: boolean;
  choice: PlayChoice;
  amount: number; // net balance change for this round
  claim: number;
}

const CHIP_STYLES: Record<number, string> = {
  10: "from-slate-100 to-slate-300 text-slate-900 border-slate-400",
  200: "from-cyan-500 to-cyan-700 text-white border-cyan-800",
  50: "from-red-500 to-red-700 text-white border-red-800",
  100: "from-emerald-500 to-emerald-700 text-white border-emerald-800",
  500: "from-blue-500 to-blue-700 text-white border-blue-800",
  1000: "from-violet-500 to-violet-700 text-white border-violet-800",
  5000: "from-amber-400 to-amber-600 text-amber-950 border-amber-700",
};

function CardView({
  card,
  faceDown,
  delayMs = 0,
  empty,
}: {
  card: PlayingCard | null;
  faceDown?: boolean;
  delayMs?: number;
  empty?: boolean;
}) {
  if (empty || !card) {
    return (
      <div
        className="tpr-card"
        style={{ animationDelay: `${delayMs}ms` }}
        aria-hidden
      >
        <div className="tpr-card-slot" />
      </div>
    );
  }
  const red = isRedSuit(card.suit);
  return (
    <div className="tpr-card" style={{ animationDelay: `${delayMs}ms` }}>
      <div className={`tpr-card-inner ${faceDown ? "tpr-flipped" : ""}`}>
        <div className="tpr-card-face tpr-card-back" />
        <div
          className={`tpr-card-face tpr-card-front ${red ? "tpr-red" : "tpr-black"}`}
        >
          <div className="tpr-corner tpr-tl">
            <span>{rankLabel(card.rank)}</span>
            <span>{SUIT_SYMBOLS[card.suit]}</span>
          </div>
          <div className="tpr-center-suit">{SUIT_SYMBOLS[card.suit]}</div>
          <div className="tpr-corner tpr-br">
            <span>{rankLabel(card.rank)}</span>
            <span>{SUIT_SYMBOLS[card.suit]}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TeenPattiGame() {
  const [balance, setBalance] = useGameBalance("teen-patti", STARTING_BALANCE);
  const pool = usePoolLifecycle("teen-patti");
  const [bet, setBet] = usePoolRoundState("teen-patti", "bet", BET_PRESETS[0]);
  const [savedPhase] = usePoolRoundState<Phase>("teen-patti", "phase", "betting");
  const [phase, setPhase] = useState<Phase>(savedPhase);
  const [round, setRound] = useState(0);

  const [wagerPlayerCards, setPlayerCards] = usePoolRoundState<(PlayingCard | null)[]>("teen-patti", "playerCards", [
    null,
    null,
    null,
  ]);
  const [wagerDealerCards, setDealerCards] = usePoolRoundState<(PlayingCard | null)[]>("teen-patti", "dealerCards", [
    null,
    null,
    null,
  ]);
  const [wagerDealerFaceDown, setDealerFaceDown] = useState(true);
  const [wagerPlayerRevealed, setPlayerRevealed] = useState(savedPhase === "betting" ? 0 : 3);
  const [wagerDealerRevealed, setDealerRevealed] = useState(0);
  const [playerHandName, setPlayerHandName] = useState<string | null>(null);
  const [dealerHandName, setDealerHandName] = useState<string | null>(null);

  const [choice, setChoice] = useState<PlayChoice | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [history, setHistory] = useState<("W" | "L")[]>([]);
  const [coins, setCoins] = useState<{ id: number; left: number; delay: number; dur: number }[]>([]);
  const [muted, setMutedState] = useState(true);
  const [showRankings, setShowRankings] = useState(false);

  const [savedWin] = usePoolRoundState("teen-patti", "pendingWin", false);
  const pendingWinRef = useRef(savedWin);
  const betRef = useRef(bet);
  betRef.current = bet;
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const decisionBusy = useRef(false);
  const idleRound = useIdleCardRound({
    idle: phase === "betting", finished: phase === "result", busy: pool.busy,
    frames: () => {
      const hands = dealHands(0.5);
      return Array.from({ length: 7 }, (_, count) => ({
        at: count === 0 ? 0 : count <= 3 ? 600 + (count - 1) * 750 : 3750 + (count - 4) * 750,
        view: { player: hands.player, dealer: hands.dealer, playerShown: Math.min(count, 3), dealerShown: Math.max(0, count - 3) },
      }));
    },
    next: () => {
      setBet(0);
      setResult(null);
      setChoice(null);
      setPlayerCards([null, null, null]);
      setDealerCards([null, null, null]);
      setPlayerRevealed(0);
      setDealerRevealed(0);
      setDealerFaceDown(true);
      setPlayerHandName(null);
      setDealerHandName(null);
      setCoins([]);
      setPhase("betting");
    },
  });
  const playerCards = idleRound.preview?.player ?? wagerPlayerCards;
  const dealerCards = idleRound.preview?.dealer ?? wagerDealerCards;
  const playerRevealed = idleRound.preview?.playerShown ?? wagerPlayerRevealed;
  const dealerRevealed = idleRound.preview?.dealerShown ?? wagerDealerRevealed;
  const dealerFaceDown = idleRound.preview ? idleRound.preview.dealerShown === 0 : wagerDealerFaceDown;

  useEffect(() => {
    setMutedState(getMuted());
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  const schedule = (fn: () => void, ms: number) => {
    timeoutsRef.current.push(setTimeout(fn, ms));
  };

  const stats = useMemo(() => {
    const spins = history.length;
    const wins = history.filter((h) => h === "W").length;
    return { spins, wins };
  }, [history]);

  const pot = bet * 2;
  const canDeal =
    phase === "betting" && !idleRound.watching && bet >= MIN_BET && bet <= balance;

  const addChip = (value: number) => {
    if (idleRound.watching) return;
    if (phase === "result") {
      sfx.chip();
      setResult(null);
      setChoice(null);
      setPlayerCards([null, null, null]);
      setDealerCards([null, null, null]);
      setPlayerHandName(null);
      setDealerHandName(null);
      setDealerFaceDown(true);
      setCoins([]);
      setBet(Math.min(Math.max(0, balance), value));
      setPhase("betting");
      return;
    }
    if (phase !== "betting") return;
    sfx.chip();
    setBet(Math.min(Math.max(0, balance), value));
  };

  const clearBet = () => {
    if (phase !== "betting" || idleRound.watching) return;
    sfx.click();
    setBet(0);
  };

  const deal = async () => {
    if (!canDeal || !idleRound.claim()) return;
    decisionBusy.current = false;
    sfx.deal();
    if (!await pool.start(bet)) { idleRound.release(); return; }
    const dealt = await cardMove<TableView>(pool, "deal");
    if (!dealt) return;
    const hands = { player: dealt.view.player, dealer: HIDDEN, playerScore: { name: dealt.view.playerHand } };
    setRound((r) => r + 1);
    setResult(null);
    setChoice(null);
    setCoins([]);
    setPlayerHandName(null);
    setDealerHandName(null);
    setDealerFaceDown(true);

    setPlayerRevealed(0);
    setDealerRevealed(0);
    setPlayerCards(hands.player);
    setDealerCards(hands.dealer);
    setPlayerHandName(hands.playerScore.name);
    setDealerHandName(null);
    setPhase("dealing");
    for (let count = 1; count <= 3; count++) {
      schedule(() => { setPlayerRevealed(count); sfx.flip(); }, 600 + (count - 1) * 750);
    }
    schedule(() => setPhase("dealt"), 3200);
  };

  useEffect(() => {
    let disposed = false;
    void restoreCardRound<TableView>("teen-patti", pool).then(async restored => {
      if (disposed || !restored) return;
      const round = restored.phase === "accepted" ? await cardMove<TableView>(pool, "deal") : restored;
      if (disposed || !round || round.phase !== "dealt") return;
      setBet(round.stake);
      setPlayerCards(round.view.player);
      setDealerCards(HIDDEN);
      setPlayerHandName(round.view.playerHand);
      setDealerHandName(null);
      setDealerFaceDown(true);
      setPlayerRevealed(3);
      setDealerRevealed(0);
      setPhase("dealt");
    });
    return () => { disposed = true; };
    // Restore once on mount; the wallet lifecycle replays any unconfirmed move first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const play = async (playChoice: "blind" | "seen") => {
    if (phase !== "dealt" || decisionBusy.current) return;
    decisionBusy.current = true;
    sfx.click();
    const reply = await cardMove<TableView>(pool, "play", { choice: playChoice });
    if (!reply?.view.dealer) { decisionBusy.current = false; return; }
    pendingWinRef.current = reply.view.win === true;
    setDealerCards(reply.view.dealer);
    setDealerHandName(reply.view.dealerHand ?? null);
    setChoice(playChoice);
    setPhase("reveal");
    for (let count = 1; count <= 3; count++) {
      schedule(() => {
        setDealerFaceDown(false);
        setDealerRevealed(count);
        sfx.flip();
      }, 550 + (count - 1) * 750);
    }
    schedule(() => resolveRound(pendingWinRef.current, playChoice), 3800);
  };

  const fold = async () => {
    if (phase !== "dealt" || decisionBusy.current) return;
    decisionBusy.current = true;
    sfx.click();
    if (!await cardMove<TableView>(pool, "fold")) { decisionBusy.current = false; return; }
    setChoice("fold");
    setResult({ win: false, choice: "fold", amount: -betRef.current, claim: 0 });
    setHistory((h) => ["L" as const, ...h].slice(0, 40));
    sfx.lose();
    setPhase("result");
  };

  const resolveRound = async (win: boolean, playChoice: "blind" | "seen") => {
    const currentBet = betRef.current;
    if (win) {
      // Bets are paid 1:1 — stake comes back plus an equal amount from the dealer.
      setResult({ win: true, choice: playChoice, amount: currentBet, claim: currentBet * 2 });
      setHistory((h) => ["W" as const, ...h].slice(0, 40));
      sfx.win();
      setCoins(
        Array.from({ length: 26 }, (_, i) => ({
          id: round * 100 + i,
          left: Math.random() * 100,
          delay: Math.random() * 0.6,
          dur: 1.6 + Math.random() * 1.2,
        })),
      );
    } else {
      setResult({ win: false, choice: playChoice, amount: -currentBet, claim: 0 });
      setHistory((h) => ["L" as const, ...h].slice(0, 40));
      sfx.lose();
    }
    setPhase("result");
  };

  const rebet = (double: boolean) => {
    if (phase !== "result") return;
    sfx.click();
    const nextBet = double
      ? betRef.current * 2
      : betRef.current;
    setBet(nextBet >= MIN_BET ? nextBet : MIN_BET);
    setResult(null);
    setChoice(null);
    setPlayerCards([null, null, null]);
    setDealerCards([null, null, null]);
    setPlayerHandName(null);
    setDealerHandName(null);
    setDealerFaceDown(true);
    setCoins([]);
    setPhase("betting");
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) sfx.click();
  };

  const broke = balance < MIN_BET;

  return (
    <main className="tpr-felt relative h-full w-full overflow-hidden text-slate-100 flex flex-col justify-between px-1 sm:px-2 md:px-3 py-1 select-none">
      {idleRound.countdown !== null && <p className="relative z-20 shrink-0 text-center text-xs text-amber-200" role="status">Next round in {idleRound.countdown}s</p>}
      {/* falling coins on win */}
      {coins.map((c) => (
        <div
          key={c.id}
          className="tpr-coin"
          style={{
            left: `${c.left}%`,
            animationDelay: `${c.delay}s`,
            animationDuration: `${c.dur}s`,
          }}
        >
          Rs
        </div>
      ))}

      {/* Header */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-2 py-1">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-amber-300 to-amber-600 text-base font-black text-amber-950 shadow-md">
            ♠
          </div>
          <div>
            <h1 className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-base sm:text-xl font-extrabold tracking-wide text-transparent">
              TEEN PATTI <span className="text-amber-400">ROYALE</span>
            </h1>
            <p className="text-[10px] tracking-wider text-emerald-200/80 uppercase hidden sm:block">
              Dealer vs You
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setShowRankings(true)}
            className="rounded-full border border-amber-300/40 bg-emerald-900/60 px-2.5 py-1 text-[11px] font-semibold text-amber-200 uppercase transition hover:bg-emerald-800/70"
          >
            Rankings
          </button>
          <button
            onClick={toggleMute}
            className="rounded-full border border-amber-300/40 bg-emerald-900/60 px-2.5 py-1 text-[11px] font-semibold text-amber-200 transition hover:bg-emerald-800/70"
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <div className="rounded-full border border-amber-400/60 bg-emerald-950/90 px-3 py-1 shadow-[0_0_12px_rgba(251,191,36,0.25)]">
            <span className="text-[9px] tracking-wider text-emerald-200/70 uppercase">
              Bal:
            </span>
            <span className="ml-1 text-xs sm:text-sm font-bold text-amber-300">
              {formatINR(balance)}
            </span>
          </div>
        </div>
      </header>

      {/* Table */}
      <section className="mx-auto flex-1 min-h-0 w-full max-w-5xl flex flex-col justify-between my-0.5 sm:my-1 px-1 sm:px-3">
        <div className="relative h-full flex flex-col justify-between overflow-hidden rounded-xl sm:rounded-2xl border border-amber-300/20 bg-emerald-950/40 shadow-[inset_0_0_60px_rgba(0,0,0,0.5),0_15px_30px_rgba(0,0,0,0.4)] py-1.5 sm:py-3">
          {/* watermark */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 grid select-none place-items-center text-[6rem] font-black text-white/[0.03] sm:text-[10rem]"
          >
            ♠♥♦♣
          </div>

          {/* Dealer row */}
          <div className="relative flex flex-col items-center gap-1 sm:gap-2 px-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-red-600/90 px-3 py-0.5 text-[10px] font-bold tracking-widest uppercase shadow">
                Dealer
              </span>
              {dealerHandName && dealerRevealed === 3 && (
                <span className="tpr-pop rounded-full bg-slate-900/80 px-2.5 py-0.5 text-[10px] font-semibold text-slate-200 ring-1 ring-slate-500/50">
                  {dealerHandName}
                </span>
              )}
            </div>
            <div className="flex -space-x-2.5 sm:-space-x-3 scale-90 sm:scale-100 origin-center">
              {dealerCards.map((card, i) => (
                <CardView
                  key={`dealer-${round}-${i}`}
                  card={card}
                  faceDown={dealerFaceDown || i >= dealerRevealed}
                  delayMs={i * 140}
                />
              ))}
            </div>
          </div>

          {/* Center: pot + status */}
          <div className="relative mx-auto flex max-w-xl flex-col items-center gap-1.5 px-2 py-0.5 text-center">
            <div className="rounded-full border border-amber-300/30 bg-emerald-900/70 px-4 py-1 shadow-inner">
              <span className="text-[9px] tracking-wider text-emerald-200/70 uppercase">
                {phase === "betting" ? "Bet" : "Pot"}
              </span>
              <span className="ml-2 text-base sm:text-lg font-extrabold text-amber-300">
                {formatINR(phase === "betting" ? bet : pot)}
              </span>
            </div>


            {!result && phase === "dealt" && (
              <p className="animate-pulse text-xs font-semibold tracking-wider text-amber-200/90 uppercase">
                Choose how to play
              </p>
            )}
            {!result && phase === "reveal" && (
              <p className="animate-pulse text-xs font-semibold tracking-wider text-amber-200/90 uppercase">
                Revealing cards…
              </p>
            )}

            {/* history dots */}
            <div className="flex min-h-4 flex-wrap justify-center gap-1">
              {history.slice(-8).map((h, i) => (
                <span
                  key={`${h}-${i}`}
                  title={h === "W" ? "Win" : ""}
                  className={`h-2 w-2 rounded-full ${
                    h === "W" ? "bg-amber-400" : "bg-slate-600"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Player row */}
          <div className="relative flex flex-col items-center gap-1 sm:gap-2 px-2">
            <div className="flex -space-x-2.5 sm:-space-x-3 scale-90 sm:scale-100 origin-center">
              {playerCards.map((card, i) => (
                <CardView
                  key={`player-${round}-${i}`}
                  card={card}
                  faceDown={i >= playerRevealed}
                  delayMs={350 + i * 140}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-3 py-0.5 text-[10px] font-bold tracking-wider text-amber-950 uppercase shadow">
                You
              </span>
              {playerHandName && playerRevealed === 3 && phase !== "betting" && (
                <span className="tpr-pop rounded-full bg-slate-900/80 px-2.5 py-0.5 text-[10px] font-semibold text-slate-200 ring-1 ring-slate-500/50">
                  {playerHandName}
                </span>
              )}
              {choice && choice !== "fold" && (
                <span className="rounded-full bg-emerald-600/90 px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-emerald-100 uppercase">
                  {choice}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Controls */}
      <section className="mx-auto w-full max-w-5xl px-1 sm:px-3 pt-1 pb-1">
        <div className="rounded-xl sm:rounded-2xl border border-amber-300/15 bg-slate-950/80 p-2 sm:p-3 shadow-xl backdrop-blur">
          {/* chips */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2.5">
            {BET_PRESETS.map((value) => {
              const style = CHIP_STYLES[value] ?? CHIP_STYLES[10];
              const disabled = idleRound.watching || phase !== "betting" && phase !== "result";
              return (
                <button
                  key={value}
                  onClick={() => addChip(value)}
                  disabled={disabled}
                  className={`h-9 w-9 sm:h-11 sm:w-11 rounded-full border-b-2 bg-gradient-to-br text-[11px] sm:text-xs font-black shadow-md transition ${
                    disabled
                      ? "cursor-not-allowed opacity-35 grayscale"
                      : "hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.4)] active:translate-y-0"
                  } ${style}`}
                >
                  {value}
                </button>
              );
            })}
            {phase === "betting" && (
              <input
                type="number"
                min={MIN_BET}
                max={Math.max(MIN_BET, Math.floor(balance))}
                value={bet || ""}
                placeholder="Custom"
                aria-label="Custom bet amount"
                disabled={idleRound.watching}
                onChange={(e) => {
                  if (idleRound.watching) return;
                  setBet(
                    Math.min(
                      Math.max(0, balance),
                      Math.max(0, Math.floor(Number(e.target.value) || 0)),
                    ),
                  );
                }}
                className="h-9 w-20 sm:h-11 sm:w-24 rounded-lg border border-amber-300/40 bg-emerald-950/80 text-center text-xs sm:text-sm font-bold text-amber-200"
              />
            )}
          </div>

          {/* bet readout + actions */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-emerald-950/80 px-2.5 py-1 ring-1 ring-emerald-600/50">
                <span className="text-[9px] tracking-wider text-emerald-200/70 uppercase">
                  Bet:
                </span>
                <span className="ml-1.5 text-sm sm:text-base font-bold text-white">
                  {formatINR(bet)}
                </span>
              </div>
              {phase === "betting" && (
                <button
                  onClick={clearBet}
                  className="rounded-lg border border-rose-500/50 bg-rose-950/40 px-2.5 py-1 text-xs font-bold tracking-wider text-rose-300 uppercase transition hover:bg-rose-900/60 shadow-[0_0_10px_rgba(244,63,94,0.2)]"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {phase === "betting" && (
                <button
                  onClick={deal}
                  disabled={!canDeal}
                  className={`rounded-xl px-7 py-2 sm:px-9 sm:py-2.5 text-sm sm:text-base font-black tracking-widest uppercase shadow-lg transition active:scale-95 ${
                    canDeal
                      ? "bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-amber-950 shadow-[0_0_18px_rgba(251,191,36,0.5)] hover:brightness-110"
                      : "cursor-not-allowed bg-slate-800 text-slate-500 border border-slate-700"
                  }`}
                >
                  Deal
                </button>
              )}

              {phase === "dealt" && (
                <>
                  <button
                    onClick={() => play("blind")}
                    className="rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 sm:px-6 sm:py-2.5 text-xs sm:text-sm font-black tracking-wider text-white uppercase shadow-[0_0_15px_rgba(99,102,241,0.4)] transition hover:brightness-110 active:scale-95"
                  >
                    Play Blind
                  </button>
                  <button
                    onClick={() => play("seen")}
                    className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2 sm:px-6 sm:py-2.5 text-xs sm:text-sm font-black tracking-wider text-white uppercase shadow-[0_0_15px_rgba(16,185,129,0.4)] transition hover:brightness-110 active:scale-95"
                  >
                    Play Seen
                  </button>
                  <button
                    onClick={fold}
                    className="rounded-xl bg-gradient-to-r from-rose-600 to-red-700 px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-black tracking-wider text-white uppercase shadow-[0_0_15px_rgba(244,63,94,0.4)] transition hover:brightness-110 active:scale-95"
                  >
                    Fold
                  </button>
                </>
              )}

              {phase === "result" && (
                <>
                  <button
                    onClick={() => rebet(false)}
                    disabled={bet > balance}
                    className={`rounded-xl px-5 py-2 text-xs sm:text-sm font-black tracking-wider uppercase shadow-lg transition active:scale-95 ${
                      bet > balance
                        ? "cursor-not-allowed bg-slate-800 text-slate-500"
                        : "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)] hover:brightness-110"
                    }`}
                  >
                    Rebet
                  </button>
                  <button
                    onClick={() => rebet(true)}
                    disabled={bet * 2 > balance}
                    className={`rounded-xl px-5 py-2 text-xs sm:text-sm font-black tracking-wider uppercase shadow-lg transition active:scale-95 ${
                      bet * 2 > balance
                        ? "cursor-not-allowed bg-slate-800 text-slate-500"
                        : "bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(52,211,153,0.5)] hover:brightness-110"
                    }`}
                  >
                    Double Up
                  </button>
                </>
              )}
            </div>
          </div>

          {broke && phase !== "dealt" && phase !== "reveal" && (
            <p className="mt-1.5 text-center text-xs font-semibold text-rose-400">
              Insufficient balance.
            </p>
          )}

          {/* stats strip on larger screens */}
          <div className="mt-2 hidden sm:grid grid-cols-3 gap-1.5 border-t border-slate-800 pt-2 text-center md:grid-cols-6">
            {(
              [
                ["Spins", stats.spins],
                ["Wins", stats.wins],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="rounded-lg bg-emerald-950/40 px-1.5 py-1 ring-1 ring-emerald-800/40"
              >
                <div className="text-[9px] tracking-wider text-emerald-200/60 uppercase">
                  {label}
                </div>
                <div className="text-xs font-bold text-amber-200">
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Rankings modal */}
      {showRankings && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setShowRankings(false)}
        >
          <div
            className="tpr-pop max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-amber-300/30 bg-slate-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text text-xl font-extrabold text-transparent">
                Teen Patti Hand Rankings
              </h2>
              <button
                onClick={() => setShowRankings(false)}
                className="rounded-full bg-slate-800 px-3 py-1 text-sm font-bold text-slate-200 hover:bg-slate-700"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Strongest at the top — dealer wins ties.
            </p>
            <ol className="mt-4 space-y-2">
              {HAND_RANKINGS.map((hand, i) => (
                <li
                  key={hand.name}
                  className="flex items-center gap-3 rounded-xl bg-slate-800/70 p-3 ring-1 ring-slate-700"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-amber-600 text-sm font-black text-amber-950">
                    {HAND_RANKINGS.length - i}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-amber-200">
                      {hand.name}
                    </div>
                    <div className="text-xs text-slate-400">{hand.desc}</div>
                  </div>
                  <span className="shrink-0 font-mono text-xs font-semibold text-slate-300">
                    {hand.example}
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-4 rounded-xl bg-emerald-900/40 p-3 text-xs text-emerald-100/80 ring-1 ring-emerald-800/60">
              <strong className="text-amber-300">Table rules:</strong> Your selected
              bet is charged once with no extra boot charge. The dealer matches
              the bet. Play blind or seen; folding ends the hand with no win.
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
