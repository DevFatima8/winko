"use client";
import { gameSfx } from "@/lib/gameSfx";

import { useEffect, useMemo, useRef, useState } from 'react';
import { getStoredWalletBalance, fetchServerBalance, useGameBalance, usePoolLifecycle, usePoolRoundState } from '@/lib/walletSync';
import PlayingCard from './PlayingCard';
import { BET_PRESETS } from '@/lib/betPresets';
import BetAmountInput from '@/components/BetAmountInput';
import { describeScore, rankLabel, createDeck, shuffle } from './cards';
import { useIdleCardRound } from '../teen-patti/useIdleCardRound';
import {
  BB, MAX_RAISES, SB, computeTurn, fmt, initialState, pushLog,
  type GameState, type Phase,
} from './holdem';
import { cardMove, restoreCardRound } from '@/lib/interactiveCardClient';

type TableView = { state: GameState; frames: GameState[] };

/* --------------------------------- UI ---------------------------------- */

const PHASE_LABEL: Record<Phase, string> = {
  preflop: 'Pre-Flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  handOver: 'Hand Over',
};

function ChipPill({ amount, label, tone }: { amount: number; label: string; tone: 'amber' | 'sky' }) {
  if (amount <= 0) return null;
  const color = tone === 'amber' ? 'border-amber-300/60 text-amber-200' : 'border-sky-300/60 text-sky-200';
  return (
    <div className={`animate-pop rounded-full border bg-slate-900/70 px-3 py-1 text-xs font-semibold sm:text-sm ${color}`}>
      {label} Rs. {fmt(amount)}
    </div>
  );
}

export default function App() {
  const pool = usePoolLifecycle("texas-holdem");
  const [walletBalance] = useGameBalance("texas-holdem", 0);
  const [committedState, setState] = usePoolRoundState<GameState>("texas-holdem", "state", initialState);
  const [rebuyNeeded, setRebuyNeeded] = useState(false);
  const [openingBet, setOpeningBet] = useState<number>(SB);
  const [handError, setHandError] = useState<string | null>(null);
  const [customRaise, setCustomRaise] = useState<number>(BET_PRESETS[0]);
  const [presentation, setPresentation] = useState<GameState | null>(null);
  const [wagerDealerRevealed, setDealerRevealed] = useState(0);
  const idleRound = useIdleCardRound({
    idle: committedState.phase === "handOver" && !presentation, finished: false, busy: pool.busy,
    frames: () => {
      const deck = shuffle(createDeck());
      const base: GameState = {
        ...committedState, playerCards: deck.slice(0, 2), dealerCards: deck.slice(2, 4), community: [],
        pot: 0, playerBet: 0, dealerBet: 0, currentBet: 0, acceptedStake: 0, grossReturn: 0,
        phase: "preflop", result: null, revealDealer: false, folded: null,
        log: ["Watching the table — no wager placed."],
      };
      return [
        { at: 0, view: { state: base, revealed: 0 } },
        ...Array.from({ length: 5 }, (_, index) => ({
          at: 1500 + index * 850,
          view: { state: { ...base, community: deck.slice(4, 5 + index), phase: (index >= 4 ? "river" : index >= 3 ? "turn" : "flop") as Phase }, revealed: 0 },
        })),
        { at: 6600, view: { state: { ...base, community: deck.slice(4, 9), phase: "river" as Phase, revealDealer: true }, revealed: 1 } },
        { at: 7450, view: { state: { ...base, community: deck.slice(4, 9), phase: "river" as Phase, revealDealer: true }, revealed: 2 } },
      ];
    },
    next: () => {},
  });
  const state = idleRound.preview?.state ?? presentation ?? committedState;
  const dealerRevealed = idleRound.preview?.revealed ?? wagerDealerRevealed;
  const waits = useRef<ReturnType<typeof setTimeout>[]>([]);
  const wait = (ms: number) => new Promise<void>(resolve => {
    waits.current.push(setTimeout(resolve, ms));
  });
  useEffect(() => () => waits.current.forEach(clearTimeout), []);
  const logRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(committedState);
  const financialBusy = useRef(false);

  // Plays back the server-authored frames (player move, then each house decision) with the table's pacing.
  const present = async (view: TableView) => {
    let shown = stateRef.current;
    try {
      for (const [index, frame] of view.frames.entries()) {
        if (index > 0) await wait(1500);
        if (frame.community.length > shown.community.length || frame.phase === "handOver") {
          const preview = {
            ...frame, result: null, phase: shown.phase, community: [...shown.community], revealDealer: shown.revealDealer,
            pot: frame.phase === "handOver" ? shown.pot : frame.pot, log: shown.log,
          };
          setDealerRevealed(shown.revealDealer ? 2 : 0);
          setPresentation({ ...preview });
          for (let i = shown.community.length; i < frame.community.length; i++) {
            await wait(850);
            preview.community = frame.community.slice(0, i + 1);
            preview.phase = i >= 4 ? "river" : i >= 3 ? "turn" : "flop";
            setPresentation({ ...preview });
            gameSfx.flip();
          }
          if (frame.revealDealer && !shown.revealDealer) {
            for (let count = 1; count <= frame.dealerCards.length; count++) {
              await wait(850);
              preview.revealDealer = true;
              preview.dealerCards = frame.dealerCards;
              setDealerRevealed(count);
              setPresentation({ ...preview });
              gameSfx.flip();
            }
          }
          if (frame.phase === "handOver") await wait(1600);
        }
        shown = frame;
        setPresentation(frame);
      }
    } finally { setPresentation(null); }
    const next = { ...view.state };
    const wallet = getStoredWalletBalance();
    if (wallet !== null) next.playerChips = wallet;
    if (pool.enabled && next.phase === "handOver") next.log = pushLog(next.log, `Provisional claim Rs. ${next.grossReturn}; daily pool settlement pending.`);
    pool.checkpoint({ state: next });
    stateRef.current = next;
    setState(next);
  };

  useEffect(() => {
    let disposed = false;
    void restoreCardRound<TableView>("texas-holdem", pool).then(round => {
      if (disposed) return;
      if (round?.view?.state && round.phase !== "handOver") {
        stateRef.current = round.view.state;
        setState(round.view.state);
      } else if (!round && stateRef.current.phase !== "handOver") {
        // Unfinished local snapshot with no live server wager: the hand is closed server-side.
        const closed = { ...stateRef.current, phase: "handOver" as const };
        stateRef.current = closed;
        setState(closed);
      }
    });
    return () => { disposed = true; };
    // Restore once on mount; the wallet lifecycle replays any unconfirmed move first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const beginHand = async () => {
    if (financialBusy.current || pool.busy || stateRef.current.phase !== "handOver") return;
    if (!idleRound.claim()) return;
    financialBusy.current = true;
    let accepted = false;
    try {
      const wallet = await fetchServerBalance();
      if (wallet === null) { setHandError("Wallet could not be loaded. Please retry."); return; }
      if (!Number.isSafeInteger(openingBet) || !Number.isSafeInteger(openingBet * 200) || openingBet < SB || openingBet > wallet) {
        setHandError(`Choose a bet from Rs. ${SB} up to your wallet balance.`);
        return;
      }
      setHandError(null);
      if (!await pool.start(openingBet)) return;
      accepted = true;
      const dealt = await cardMove<TableView>(pool, "deal", { openingBet });
      if (!dealt) return;
      stateRef.current = { ...dealt.view.frames[0]!, log: dealt.view.frames[0]!.log };
      setState(stateRef.current);
      await present({ ...dealt.view, frames: dealt.view.frames.slice(1) });
    } finally {
      financialBusy.current = false;
      if (!accepted) idleRound.release();
    }
  };

  const act = async (kind: "fold" | "call" | "raise", requested = 0) => {
    if (financialBusy.current || pool.busy || computeTurn(stateRef.current) !== "player") return;
    financialBusy.current = true;
    try {
      const reply = await cardMove<TableView>(pool, kind, kind === "raise" ? { to: requested } : undefined);
      if (reply) await present(reply.view);
    } finally { financialBusy.current = false; }
  };

  useEffect(() => {
    stateRef.current = committedState;
  }, [committedState]);

  const lastSoundedHandRef = useRef(0);

  useEffect(() => {
    if (state.handNumber > lastSoundedHandRef.current) {
      gameSfx.deal();
      lastSoundedHandRef.current = state.handNumber;
    }
    if (state.phase === 'handOver' && state.result) {
      if (state.result.winner === 'player') gameSfx.win();
      else if (state.result.winner === 'dealer') gameSfx.lose();
    }
  }, [state.phase, state.result, state.playerChips]);

  const turn = useMemo(() => presentation || idleRound.watching ? "none" : computeTurn(state), [state, presentation, idleRound.watching]);

  // open the rebuy modal when the player is broke
  useEffect(() => {
    if (state.handNumber > 0 && state.phase === 'handOver' && walletBalance < SB) setRebuyNeeded(true);
  }, [state.phase, state.handNumber, walletBalance]);

  // keep the log scrolled to the latest entry
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [state.log]);

  const nextHand = () => {
    if (walletBalance < SB) {
      setRebuyNeeded(true);
      return;
    }
    void beginHand();
  };

  /* ------------------------- derived control values ------------------------- */

  const callAmount = Math.min(Math.max(0, state.currentBet - state.playerBet), state.playerChips);
  const canCheck = state.currentBet === state.playerBet;
  const maxTotal = Math.min(state.playerBet + state.playerChips, state.dealerBet + state.dealerChips);
  const minTotal = state.currentBet > 0 ? Math.min(state.currentBet * 2, maxTotal) : Math.min(BB, maxTotal);
  const potIfCall = state.pot + callAmount + Math.max(0, state.currentBet - state.dealerBet);
  const raiseOptions = [
    { label: 'Min', value: minTotal },
    { label: '½ Pot', value: Math.min(maxTotal, state.currentBet + callAmount + Math.floor(potIfCall / 2)) },
    { label: 'Pot', value: Math.min(maxTotal, state.currentBet + callAmount + potIfCall) },
    { label: 'All-In', value: maxTotal },
  ].filter((o, i, arr) => arr.findIndex((x) => x.value === o.value) === i);
  const canRaise = state.raises < MAX_RAISES && maxTotal > state.currentBet;
  const controlsDisabled = turn !== 'player';

  const playerTurn = turn === 'player';
  const dealerTurn = turn === 'dealer';

  const playerHandDesc =
    state.result?.playerScore != null
      ? `${describeScore(state.result.playerScore)} (${state.result.playerScore.ranks.map(rankLabel).join(' ')})`
      : null;
  const dealerHandDesc =
    state.result?.dealerScore != null
      ? `${describeScore(state.result.dealerScore)} (${state.result.dealerScore.ranks.map(rankLabel).join(' ')})`
      : null;

  const btnBase =
    'rounded-xl px-4 py-2.5 text-sm font-bold shadow-md transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100';

  return (
    <div className="flex h-full min-h-0 w-full shrink-0 flex-col overflow-x-hidden overflow-y-auto bg-slate-950 text-slate-100 px-1 sm:px-2 md:px-3 py-1 select-none">
      {/* header */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 px-2 py-1.5 sm:px-4">
        <div className="flex items-center gap-1.5">
          <span className="text-xl sm:text-2xl text-amber-400">♠♥</span>
          <div>
            <h1 className="text-base sm:text-lg font-extrabold tracking-wide text-amber-300">
              TEXAS HOLD'EM
            </h1>
            <p className="text-[10px] text-slate-400">Choose your bet • Minimum Rs. 10</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm">
          <span className="text-slate-400">
            Hand <b className="text-slate-200">#{state.handNumber}</b>
          </span>
          <span className="rounded-full border border-emerald-400/50 bg-emerald-950/70 px-2.5 py-0.5 font-bold text-emerald-300 shadow-sm">
            Wallet Rs. {fmt(walletBalance)}
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 shrink-0 flex-col gap-1.5 sm:gap-3 p-1 sm:p-2 lg:flex-row">
        {/* table */}
        <section className="relative min-w-0 flex-1 flex flex-col justify-between">
          <div
            className="relative flex flex-1 flex-col justify-between gap-3 sm:gap-4 rounded-2xl sm:rounded-[2.5rem] border-4 sm:border-8 border-amber-900/70 p-2 pb-4 sm:p-4 sm:pb-5 shadow-2xl [&>div]:shrink-0"
            style={{
              background: 'radial-gradient(circle at 50% 25%, #17a05e 0%, #0c7a45 45%, #07532e 100%)',
            }}
          >
            <div className="pointer-events-none absolute inset-1.5 sm:inset-3 rounded-xl sm:rounded-[1.75rem] border border-white/10" />

            {/* dealer */}
            <div
              className={`flex flex-col items-center gap-1 rounded-xl p-1 transition ${
                dealerTurn ? 'ring-2 sm:ring-4 ring-amber-300' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 sm:h-9 sm:w-9 items-center justify-center rounded-full border border-amber-400 bg-slate-900 text-xs sm:text-sm font-bold text-amber-300">
                  H
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs sm:text-sm font-bold tracking-widest text-slate-100">HOUSE</span>
                  <span className="text-[10px] sm:text-xs text-emerald-100/80">Stack Rs. {fmt(state.dealerChips)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                {state.dealerCards.length === 0
                  ? [0, 1].map((i) => (
                      <div
                        key={i}
                        className="h-16 w-11 sm:h-24 sm:w-16 md:h-28 md:w-20 rounded-lg border-2 border-dashed border-white/20"
                      />
                    ))
                  : state.dealerCards.map((c, i) => (
                      <PlayingCard
                        key={`${state.handNumber}-d-${i}`}
                        card={c}
                        hidden={!state.revealDealer || (!!presentation || idleRound.watching) && i >= dealerRevealed}
                        delay={i * 120}
                      />
                    ))}
              </div>
              <ChipPill amount={state.dealerBet} label="House bet" tone="sky" />
              {dealerHandDesc && (
                <div className="animate-pop rounded-md bg-slate-900/80 px-2 py-0.5 text-[10px] sm:text-xs font-semibold text-sky-200">
                  House: {dealerHandDesc}
                </div>
              )}
            </div>

            {/* community + pot */}
            <div className="flex flex-col items-center gap-1 sm:gap-1.5">
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-amber-300/60 bg-amber-950/80 px-2.5 py-0.5 text-xs sm:text-sm font-extrabold tracking-wider text-amber-200 shadow-sm">
                  POT Rs. {fmt(state.pot)}
                </span>
                <span className="rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] sm:text-xs font-semibold tracking-wider text-slate-300">
                  {PHASE_LABEL[state.phase]}
                </span>
              </div>
              <div className="grid w-full max-w-[432px] grid-cols-5 items-center gap-1 sm:gap-2 [&>*]:!h-auto [&>*]:!w-full [&>*]:aspect-[5/7]">
                {[0, 1, 2, 3, 4].map((i) =>
                  state.community[i] ? (
                    <PlayingCard
                      key={`${state.handNumber}-c-${i}`}
                      card={state.community[i]}
                      delay={i * 100}
                    />
                  ) : (
                    <div
                      key={i}
                      className="h-16 w-11 sm:h-24 sm:w-16 md:h-28 md:w-20 rounded-lg border-2 border-dashed border-white/20"
                    />
                  ),
                )}
              </div>
            </div>

            {/* player */}
            <div
              className={`flex flex-col items-center gap-1 rounded-xl p-1 transition ${
                playerTurn ? 'ring-2 sm:ring-4 ring-emerald-300' : ''
              }`}
            >
              <div className="flex items-center gap-1.5 sm:gap-2">
                {state.playerCards.length === 0
                  ? [0, 1].map((i) => (
                      <div
                        key={i}
                        className="h-16 w-11 sm:h-24 sm:w-16 md:h-28 md:w-20 rounded-lg border-2 border-dashed border-white/20"
                      />
                    ))
                  : state.playerCards.map((c, i) => (
                      <PlayingCard
                        key={`${state.handNumber}-p-${i}`}
                        card={c}
                        delay={i * 120}
                      />
                    ))}
              </div>
              <ChipPill amount={state.playerBet} label="Your bet" tone="amber" />
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 sm:h-9 sm:w-9 items-center justify-center rounded-full border border-emerald-400 bg-slate-900 text-xs sm:text-sm font-bold text-emerald-300">
                  ♣
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs sm:text-sm font-bold tracking-widest text-slate-100">YOU</span>
                  <span className="text-[10px] sm:text-xs text-emerald-100/80">Wallet Rs. {fmt(walletBalance)}</span>
                </div>
              </div>
              {playerHandDesc && (
                <div className="animate-pop rounded-md bg-slate-900/80 px-2 py-0.5 text-[10px] sm:text-xs font-semibold text-emerald-200">
                  You: {playerHandDesc}
                </div>
              )}
            </div>

          </div>

          {/* controls */}
          <div className="mt-1 sm:mt-2 flex shrink-0 flex-wrap items-center justify-center gap-1.5 sm:gap-2.5 rounded-xl sm:rounded-2xl border border-slate-700/80 bg-slate-900/90 p-1.5 sm:p-2.5 shadow-lg">
            {handError && <p role="alert" className="w-full text-center text-xs text-rose-300">{handError}</p>}
            {state.phase === 'handOver' ? (
              <>
              <p className="w-full text-center text-xs text-slate-300">Choose your opening bet, then deal. Use Call, Check or Raise during the hand.</p>
              <div className="flex w-full flex-wrap items-center justify-center gap-2" role="group" aria-label="Opening bet">
                {BET_PRESETS.map(amount => (
                  <button key={amount} type="button" onClick={() => setOpeningBet(amount)}
                    aria-pressed={openingBet === amount}
                    className={`rounded-lg border px-3 py-2 text-sm font-bold ${openingBet === amount ? 'border-amber-300 bg-amber-400 text-slate-950' : 'border-slate-600 bg-slate-800 text-amber-200'}`}>
                    Rs. {amount}
                  </button>
                ))}
                <BetAmountInput value={openingBet} onChange={setOpeningBet} />
              </div>
              <button
                onClick={nextHand}
                className="rounded-xl px-5 py-2 text-xs sm:text-sm font-extrabold uppercase tracking-wide bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-slate-950 shadow-[0_0_15px_rgba(251,191,36,0.5)] transition hover:brightness-110 active:scale-95"
              >
                ▶ Deal — Bet Rs. {fmt(openingBet)}
              </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => act("fold")}
                  disabled={controlsDisabled}
                  className="rounded-xl px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold bg-gradient-to-r from-rose-600 to-red-700 text-white shadow-[0_0_12px_rgba(244,63,94,0.4)] border border-rose-500/40 transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                >
                  ✕ Fold
                </button>
                {canCheck ? (
                  <button
                    onClick={() => act("call")}
                    disabled={controlsDisabled}
                    className="rounded-xl px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold bg-gradient-to-r from-slate-700 to-slate-800 text-white shadow-[0_0_10px_rgba(100,116,139,0.3)] border border-slate-600 transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    ✓ Check
                  </button>
                ) : (
                  <button
                    onClick={() => act("call")}
                    disabled={controlsDisabled}
                    className="rounded-xl px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)] border border-emerald-400/40 transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    Call Rs. {fmt(callAmount)}
                  </button>
                )}
                {canRaise &&
                  raiseOptions.map((o) => (
                    <button
                      key={o.label}
                      onClick={() =>
                        act("raise", o.value)
                      }
                      disabled={controlsDisabled || o.value <= state.currentBet}
                      className="rounded-xl px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm font-extrabold bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.4)] border border-amber-300/50 transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                    >
                      {o.label} Rs. {fmt(o.value)}
                    </button>
                  ))}
                {canRaise && (
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    {BET_PRESETS.map((p) => (
                      <button
                        key={p}
                        onClick={() => act("raise", state.currentBet + p)}
                        disabled={controlsDisabled}
                        className="rounded-full px-2.5 py-1 text-xs font-bold bg-slate-800 text-amber-300 border border-amber-400/40 transition hover:brightness-125 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                      >
                        +Rs. {p}
                      </button>
                    ))}
                    <BetAmountInput value={customRaise} onChange={setCustomRaise} disabled={controlsDisabled} />
                    <button
                      onClick={() => act("raise", customRaise)}
                      disabled={controlsDisabled}
                      className="rounded-xl px-2.5 py-1 text-xs font-extrabold bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-950 border border-amber-300/50 transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                    >
                      Raise to
                    </button>
                  </div>
                )}
                {dealerTurn && (
                  <span className="animate-pulse text-xs sm:text-sm font-semibold text-amber-300">
                    House thinking…
                  </span>
                )}
              </>
            )}
          </div>
        </section>

        {/* log */}
        <aside className="hidden lg:flex w-full flex-col rounded-2xl border border-slate-700 bg-slate-900/80 p-3 lg:w-72 overflow-hidden">
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">
            Table Log
          </div>
          <div
            ref={logRef}
            className="flex-1 space-y-1 overflow-y-auto text-sm max-lg:max-h-40"
          >
            {state.log.map((m, i) => (
              <div key={i} className="border-b border-slate-800/70 pb-1 text-slate-300">
                {m}
              </div>
            ))}
          </div>
        </aside>
      </main>

      <footer className="hidden sm:block shrink-0 border-t border-slate-800/80 px-2 py-1 text-center text-[10px] text-slate-500">
        Account wallet betting • Minimum opening bet Rs. 10 • See pre-game rules for payout policy.
      </footer>

      {/* rebuy modal */}
      {rebuyNeeded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="animate-pop w-full max-w-sm rounded-2xl border border-amber-300/70 bg-slate-900 p-6 text-center shadow-2xl">
            <div className="text-4xl">🪙</div>
            <div className="mt-2 text-xl font-extrabold text-slate-100">Insufficient wallet balance</div>
            <p className="mt-2 text-sm text-slate-300">
              Wallet Rs. {fmt(walletBalance)}. At least Rs. {SB} is needed to start a hand. Add funds using your existing wallet options.
            </p>
            <button
              onClick={() => setRebuyNeeded(false)}
              className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-extrabold text-slate-900 shadow-md transition hover:bg-emerald-400 active:scale-95"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
