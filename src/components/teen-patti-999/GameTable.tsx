"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import PlayingCard from "./PlayingCard";
import type { TableInfo } from "./TeenPatti999";
import {
  evaluateHand,
  handName,
  createDeck,
  shuffle,
  type Card,
  type HandScore,
} from "./lib/teenpatti";
import { cardMove, restoreCardRound } from "@/lib/interactiveCardClient";
import { cn, formatINR } from "./lib/utils";
import { sfx } from "./lib/sounds";
import { BET_PRESETS } from "@/lib/betPresets";
import { usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import { useIdleCardRound } from "../teen-patti/useIdleCardRound";

type Phase = "idle" | "dealing" | "choose" | "turn" | "dealer" | "reveal" | "result";

interface RoundState {
  player: Card[];
  dealer: Card[];
  playerScore: HandScore;
  dealerScore: HandScore;
  pot: number;
  playerBet: number;
  dealerBet: number;
  stake: number;
  seen: boolean;
  rounds: number;
  sideBet: number;
  ppReturn: number;
  net: number;
  folded: boolean;
  won: boolean | null;
}

interface GameTableProps {
  table: TableInfo;
  balance: number;
  onGameEnd: (r: { won: boolean; net: number }) => void;
  onExit: () => void;
  muted: boolean;
  onToggleMute: () => void;
  onOpenRules: () => void;
}

type ServerRound = Omit<RoundState, "player" | "dealer" | "playerScore" | "dealerScore"> & {
  player: Card[] | null; dealer: Card[] | null; dealerShows?: boolean;
};
const HIDDEN: Card[] = [0, 1, 2].map(() => ({ rank: 2, suit: "spade" }));
const HIDDEN_SCORE: HandScore = { rank: 1, tie: [] };
const toRound = (view: ServerRound): RoundState => ({
  ...view,
  player: view.player ?? HIDDEN,
  dealer: view.dealer ?? HIDDEN,
  playerScore: view.player ? evaluateHand(view.player) : HIDDEN_SCORE,
  dealerScore: view.dealer ? evaluateHand(view.dealer) : HIDDEN_SCORE,
});

// The stake (chaal amount) doubles every round, capped at boot * STAKE_CAP_MULT.
const STAKE_CAP_MULT = 128;

function chipClass(amount: number): string {
  if (amount >= 500) return "chip-500";
  if (amount >= 100) return "chip-100";
  if (amount >= 50) return "chip-50";
  return "chip-10";
}

export default function GameTable({
  table,
  balance,
  onGameEnd,
  onExit,
  muted,
  onToggleMute,
  onOpenRules,
}: GameTableProps) {
  const pool = usePoolLifecycle("teen-patti-999");
  const [resumePhase] = usePoolRoundState<Phase>("teen-patti-999", "phase", "idle");
  const [wagerPhase, setPhase] = useState<Phase>(resumePhase);
  const [wagerRound, setRound] = usePoolRoundState<RoundState | null>("teen-patti-999", "round", null);
  const [roundId, setRoundId] = useState(0);
  const [sideBetOn, setSideBetOn] = useState(false);
  const [sideBetAmount, setSideBetAmount] = useState(100);
  const [message, setMessage] = useState("Set your Pairs Plus side bet and press DEAL");
  const [confetti, setConfetti] = useState<ReactNode>(null);
  const [wagerRevealedCards, setRevealedCards] = useState(0);
  const moveBusy = useRef(false);
  const idleRound = useIdleCardRound({
    idle: wagerPhase === "idle", finished: wagerPhase === "result", busy: pool.busy,
    frames: () => {
      const deck = shuffle(createDeck());
      const player = deck.slice(0, 3), dealer = deck.slice(3, 6);
      const round: RoundState = {
        player, dealer, playerScore: evaluateHand(player), dealerScore: evaluateHand(dealer),
        pot: 0, playerBet: 0, dealerBet: 0, stake: 0, seen: true, rounds: 0, sideBet: 0,
        ppReturn: 0, net: 0, folded: false, won: null,
      };
      return Array.from({ length: 7 }, (_, count) => ({
        at: count === 0 ? 0 : 400 + (count - 1) * 750, view: { round, revealed: count },
      }));
    },
    next: () => nextRound(),
  });
  const phase: Phase = idleRound.watching ? "reveal" : wagerPhase;
  const round = idleRound.preview?.round ?? wagerRound;
  const revealedCards = idleRound.preview?.revealed ?? wagerRevealedCards;

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const roundRef = useRef<RoundState | null>(wagerRound);
  const balanceRef = useRef(balance);

  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);
  useEffect(() => {
    roundRef.current = wagerRound;
  }, [wagerRound]);
  useEffect(() => () => {
    timers.current.forEach((t) => clearTimeout(t));
  }, []);

  const later = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const cap = table.boot * STAKE_CAP_MULT;
  const chaalCost = !round
    ? table.boot
    : round.seen
      ? Math.min(round.stake * 2, cap)
      : round.stake;

  const buildConfetti = (): ReactNode => {
    const colors = ["#fbbf24", "#f87171", "#34d399", "#60a5fa", "#f472b6", "#a78bfa"];
    return Array.from({ length: 40 }).map((_, i) => (
      <span
        key={i}
        className="confetti-piece"
        style={{
          left: `${Math.random() * 100}%`,
          background: colors[i % colors.length],
          width: 6 + Math.random() * 8,
          height: 10 + Math.random() * 10,
          animationDuration: `${2.2 + Math.random() * 1.8}s`,
          animationDelay: `${Math.random() * 0.5}s`,
        }}
      />
    ));
  };

  const apply = (view: ServerRound) => {
    const nr = toRound(view);
    setRound(nr);
    roundRef.current = nr;
    return nr;
  };

  useEffect(() => {
    let disposed = false;
    void restoreCardRound<ServerRound>("teen-patti-999", pool).then(async restored => {
      if (disposed || !restored) return;
      const live = restored.phase === "accepted" ? await cardMove<ServerRound>(pool, "deal", { boot: restored.stake, side: 0 }) : restored;
      if (disposed || !live || live.phase === "result") return;
      apply(live.view);
      setMessage(live.phase === "choose" ? "Cards dealt — play BLIND or SEEN" : "Your move");
      setPhase(live.phase === "choose" ? "choose" : "turn");
    });
    return () => { disposed = true; };
    // Restore once on mount; the wallet lifecycle replays any unconfirmed move first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const beginRound = async () => {
    const boot = table.boot;
    const side = sideBetOn ? sideBetAmount : 0;
    if (balanceRef.current < boot + side) {
      setMessage("Insufficient balance.");
      return;
    }
    if (!idleRound.claim()) return;
    if (!await pool.start(boot + side)) { idleRound.release(); return; }
    const dealt = await cardMove<ServerRound>(pool, "deal", { boot, side });
    if (!dealt) return;
    apply(dealt.view);
    setRoundId((id) => id + 1);
    setMessage("Cards dealt — play BLIND or SEEN");
    setPhase("dealing");
    sfx.deal();
    later(1500, () => setPhase("choose"));
  };

  const choose = async (seen: boolean) => {
    if (wagerPhase !== "choose" || moveBusy.current) return;
    const r = roundRef.current;
    if (!r) return;
    const cost = seen ? Math.min(r.stake * 2, cap) : r.stake;
    if (balanceRef.current < cost) {
      setMessage("Insufficient balance.");
      return;
    }
    moveBusy.current = true;
    const reply = await cardMove<ServerRound>(pool, "choose", { seen });
    moveBusy.current = false;
    if (!reply) return;
    apply(reply.view);
    if (seen) sfx.flip();
    setMessage(seen ? "You're SEEN — your cards are revealed!" : "You're playing BLIND");
    setPhase("turn");
  };

  const chaal = async () => {
    if (wagerPhase !== "turn" || moveBusy.current) return;
    const r = roundRef.current;
    if (!r) return;
    const cost = r.seen ? Math.min(r.stake * 2, cap) : r.stake;
    if (balanceRef.current < cost) {
      setMessage("Insufficient balance.");
      return;
    }
    moveBusy.current = true;
    const reply = await cardMove<ServerRound>(pool, "chaal");
    moveBusy.current = false;
    if (!reply) return;
    const finished = reply.phase === "result";
    const nr = apply(reply.view);
    // Keep the cards face-down while the dealer decides; the reveal flips them.
    if (finished) setRound({ ...nr });
    sfx.chip();
    setPhase("dealer");
    setMessage("Dealer is thinking");
    later(1300, () => {
      if (finished) {
        reveal();
      } else {
        setMessage("Dealer chaals — your move");
        setPhase("turn");
      }
    });
  };

  const show = async () => {
    if (wagerPhase !== "turn" || moveBusy.current) return;
    const r = roundRef.current;
    if (!r || r.rounds < 1) return;
    const cost = r.seen ? Math.min(r.stake * 2, cap) : r.stake;
    if (balanceRef.current < cost) {
      setMessage("Insufficient balance.");
      return;
    }
    moveBusy.current = true;
    const reply = await cardMove<ServerRound>(pool, "show");
    moveBusy.current = false;
    if (!reply) return;
    apply(reply.view);
    sfx.chip();
    reveal();
  };

  const pack = async () => {
    if (wagerPhase !== "turn" || moveBusy.current) return;
    const r = roundRef.current;
    if (!r) return;
    moveBusy.current = true;
    const reply = await cardMove<ServerRound>(pool, "pack");
    moveBusy.current = false;
    if (!reply) return;
    apply(reply.view);
    setMessage("You packed — Dealer takes the pot");
    setPhase("dealer");
    later(1500, resolveRound);
  };

  const reveal = () => {
    setPhase("reveal");
    setRevealedCards(0);
    setMessage("Showdown!");
    for (let count = 1; count <= 6; count++) {
      later(400 + (count - 1) * 750, () => { setRevealedCards(count); sfx.flip(); });
    }
    later(5900, resolveRound);
  };

  const resolveRound = () => {
    const r = roundRef.current;
    if (!r) return;
    const won = r.won === true;
    const net = r.net;
    if (won) {
      sfx.win();
    } else {
      sfx.lose();
    }
    setPhase("result");
    if (pool.enabled) setMessage("Provisional claim recorded; daily pool settlement pending.");
    onGameEnd({ won, net });
    if (won) setConfetti(buildConfetti());
  };

  const nextRound = () => {
    setConfetti(null);
    setRound(null);
    roundRef.current = null;
    setPhase("idle");
    setMessage("Set your Pairs Plus side bet and press DEAL");
  };

  const playerFaceDown =
    !!round && !round.seen && phase !== "reveal" && phase !== "result";
  const dealerFaceDown = phase !== "reveal" && phase !== "result";
  const flipPlayer = !!round && (round.seen || phase === "reveal" || phase === "result");
  const flipDealer = !!round && (phase === "reveal" || phase === "result");

  return (
    <div className="relative mx-auto flex h-full w-full max-w-xl flex-col justify-between bg-slate-950 overflow-hidden px-1 sm:px-2 md:px-3 select-none">
      {/* Top bar */}
      <header className="flex items-center gap-2 border-b border-amber-500/20 bg-slate-900/90 px-3 py-1.5 rounded-b-xl">
        <button
          onClick={onExit}
          className="rounded-lg bg-slate-800 px-2 py-1 text-xs font-bold text-slate-200"
        >
          ← Lobby
        </button>
        <div className="min-w-0 flex-1">
          <p className="gold-text truncate font-serif text-sm font-black">
            TEEN PATTI 999
          </p>
          <p className="truncate text-[10px] text-slate-400">
            {table.name} • Boot {formatINR(table.boot)}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-slate-800 px-2 py-1 text-xs font-bold text-amber-300">
          🪙 {formatINR(balance)}
        </div>
        <button
          onClick={onToggleMute}
          aria-label="Toggle sound"
          className="grid h-7 w-7 place-items-center rounded-full bg-slate-800 text-sm"
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <button
          onClick={onOpenRules}
          aria-label="Rules"
          className="grid h-7 w-7 place-items-center rounded-full bg-slate-800 text-sm font-black text-amber-300"
        >
          ?
        </button>
      </header>

      {/* Felt table */}
      <main className="flex min-h-0 flex-1 flex-col justify-between overflow-hidden">
        <div className="felt relative my-1 sm:my-2 flex min-h-0 flex-1 flex-col justify-between overflow-hidden rounded-xl sm:rounded-2xl p-2 sm:p-3">
          <div className="felt-watermark">TEEN PATTI 999</div>

          {/* Dealer */}
          <div className="relative flex flex-col items-center">
            <div className="flex items-center gap-2">
              <div className="avatar">🤵</div>
              <div>
                <p className="text-xs font-black text-white">Dealer</p>
                <p className="text-[10px] text-emerald-200">Banker&apos;s table</p>
              </div>
            </div>
            <div key={`d-${roundId}`} className="mt-2 flex -space-x-3">
              {[0, 1, 2].map((i) => (
                <PlayingCard
                  key={i}
                  card={round?.dealer[i]}
                  faceDown={dealerFaceDown || phase === "reveal" && i * 2 + 1 >= revealedCards}
                  flip={flipDealer && (phase !== "reveal" || i * 2 + 1 < revealedCards)}
                  size="sm"
                  delayMs={i * 130}
                  highlight={
                    phase === "result" && round
                      ? round.won
                        ? "lose"
                        : "win"
                      : null
                  }
                />
              ))}
            </div>
            {phase === "result" && round && (
              <p className="mt-1.5 rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-bold text-amber-200">
                {handName(round.dealerScore)}
              </p>
            )}
          </div>

          {/* Pot + message */}
          <div className="relative my-3 flex flex-col items-center gap-1 text-center">
            <div className="rounded-2xl border border-amber-300/50 bg-black/45 px-5 py-1.5 shadow-inner">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-200">
                Total Pot
              </p>
              <p className="gold-text text-xl font-black">
                {formatINR(round ? round.pot : table.boot * 2)}
              </p>
            </div>
            <p className="min-h-[1rem] text-[11px] font-semibold text-emerald-50">
              {message}
            </p>
            {round && phase !== "idle" && (
              <p className="text-[10px] text-emerald-200">
                Round {round.rounds + 1} • Chaaal {formatINR(chaalCost)}
                {round.seen ? " (seen)" : " (blind)"} • Your bet{" "}
                {formatINR(round.playerBet)}
              </p>
            )}
          </div>

          {/* Player */}
          <div className="relative flex flex-col items-center">
            <div key={`p-${roundId}`} className="flex -space-x-4">
              {[0, 1, 2].map((i) => (
                <PlayingCard
                  key={i}
                  card={round?.player[i]}
                  faceDown={playerFaceDown || phase === "reveal" && !round?.seen && i * 2 >= revealedCards}
                  flip={flipPlayer && (phase !== "reveal" || !!round?.seen || i * 2 < revealedCards)}
                  size="lg"
                  delayMs={250 + i * 130}
                  highlight={
                    phase === "result" && round
                      ? round.won
                        ? "win"
                        : "lose"
                      : null
                  }
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="avatar">😎</div>
              <div>
                <p className="text-xs font-black text-white">You</p>
                <p className="text-[10px] text-emerald-200">
                  {round
                    ? round.seen || phase === "reveal" || phase === "result"
                      ? handName(round.playerScore)
                      : "??? • Hidden (blind)"
                    : "Waiting for next round"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="border-t border-amber-500/20 bg-slate-900/95 px-2 sm:px-3 pb-2 pt-1.5 rounded-t-xl">
          {phase === "idle" && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-slate-800/80 p-2">
                <div className="min-w-0">
                  <p className="text-xs font-black text-amber-300">
                    PAIRS PLUS{" "}
                    <span className="text-[10px] font-bold text-slate-400">
                      (side bet)
                    </span>
                  </p>
                  <p className="truncate text-[10px] text-slate-400">
                    Pair 1:1 • Color 3:1 • Seq 4:1 • Pure 5:1 • Trail 10:1
                  </p>
                </div>
                <button
                  onClick={() => setSideBetOn((v) => !v)}
                  aria-label="Toggle Pairs Plus side bet"
                  className={cn(
                    "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                    sideBetOn ? "bg-emerald-500" : "bg-slate-600"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
                      sideBetOn ? "left-6" : "left-1"
                    )}
                  />
                </button>
              </div>
              {sideBetOn && (
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {BET_PRESETS.map((a) => (
                    <button
                      key={a}
                      onClick={() => setSideBetAmount(a)}
                      className={cn(
                        "chip h-9 w-9 text-[11px]",
                        chipClass(a),
                        sideBetAmount === a && "selected"
                      )}
                    >
                      {a}
                    </button>
                  ))}
                  <input
                    type="number"
                    min={10}
                    value={sideBetAmount || ""}
                    placeholder="Custom"
                    aria-label="Custom side bet amount"
                    onChange={(e) =>
                      setSideBetAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))
                    }
                    className="h-9 w-20 rounded-lg border border-amber-400/40 bg-slate-800 text-center text-xs font-bold text-amber-200"
                  />
                  <span className="text-[10px] text-slate-400">side bet</span>
                </div>
              )}
              <button onClick={beginRound} className="btn btn-gold w-full py-3 text-base">
                DEAL • ANTE {formatINR(table.boot)}
                {sideBetOn ? ` + PP ${formatINR(sideBetAmount)}` : ""}
              </button>
            </div>
          )}

          {phase === "choose" && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => choose(false)} className="btn btn-blind py-3">
                BLIND
                <span className="block text-[11px] font-bold">
                  {formatINR(table.boot)}
                </span>
              </button>
              <button onClick={() => choose(true)} className="btn btn-seen py-3">
                SEEN
                <span className="block text-[11px] font-bold">
                  {formatINR(table.boot * 2)}
                </span>
              </button>
            </div>
          )}

          {phase === "turn" && (
            <div className="grid grid-cols-3 gap-2">
              <button onClick={pack} className="btn btn-pack py-3">
                PACK
              </button>
              <button
                onClick={chaal}
                disabled={balance < chaalCost}
                className="btn btn-gold py-3"
              >
                CHAAL
                <span className="block text-[11px] font-bold">
                  {formatINR(chaalCost)}
                </span>
              </button>
              <button
                onClick={show}
                disabled={balance < chaalCost}
                className="btn btn-show py-3"
              >
                SHOW
                <span className="block text-[11px] font-bold">
                  {formatINR(chaalCost)}
                </span>
              </button>
            </div>
          )}

          {(phase === "dealing" || phase === "dealer" || phase === "reveal") && (
            <div className="py-3 text-center text-sm font-bold text-amber-200">
              {phase === "dealing" && "Dealing cards"}
              {phase === "dealer" && "Dealer is thinking"}
              {phase === "reveal" && "Revealing cards"}
              <span className="dots">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            </div>
          )}
        </div>
      </main>

      {/* Keep next-round controls available after the common result popup closes. */}
      {phase === "result" && round && (
        <div className="shrink-0 grid gap-2 p-2">
          <button
            onClick={nextRound}
            disabled={balance < table.boot}
            className="btn btn-gold w-full py-3 text-base"
          >
            NEXT ROUND
          </button>
          <button onClick={onExit} className="btn btn-pack w-full py-2 text-xs">
            BACK TO LOBBY
          </button>
        </div>
      )}
    </div>
  );
}
