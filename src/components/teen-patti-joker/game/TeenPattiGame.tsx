"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveTable } from "../../teen-patti/useLiveTable";
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import {
  Coins, Crown, History, Info, RotateCcw, Trash2, Volume2, VolumeX, X, Zap,
} from "lucide-react";
import { PlayingCard, CardGhost } from "./PlayingCard";
import { Chip } from "./Chip";
import { BetZone, type ZoneState } from "./BetZone";
import { AnimatedNumber, HandBadge, HistoryDots, type ResultInfo } from "./Overlays";
import { sfx } from "../lib/sfx";
import {
  buildRound, CHIP_VALUES, formatChips,
  MIN_BET, STARTING_BALANCE, totalBet, TIE_PAYOUT,
  type Bets, type Round, type Zone,
} from "../lib/teen-patti";

type Phase = "betting" | "dealing" | "result";

const LS_BALANCE = "tpj_balance_v1";
const LS_HISTORY = "tpj_history_v1";

type Stacks = Record<Zone, number[]>;
const EMPTY_BETS: Bets = { player: 0, dealer: 0, tie: 0 };
const EMPTY_STACKS: Stacks = { player: [], dealer: [], tie: [] };

function decompose(amount: number): number[] {
  const out: number[] = [];
  let rest = amount;
  const denoms = [...CHIP_VALUES].sort((a, b) => b - a);
  for (const d of denoms) while (rest >= d) { out.push(d); rest -= d; }
  return out;
}

function fireConfetti(big: boolean, later: (ms: number, fn: () => void) => void) {
  const colors = ["#f5c451", "#d4af37", "#fff3c4", "#fbbf24", "#ffffff"];
  confetti({ particleCount: big ? 140 : 80, spread: big ? 90 : 65, origin: { y: 0.35 }, colors, ticks: 220, scalar: 1.05 });
  if (big) {
    later(220, () => confetti({ particleCount: 90, angle: 60, spread: 70, origin: { x: 0, y: 0.5 }, colors }));
    later(380, () => confetti({ particleCount: 90, angle: 120, spread: 70, origin: { x: 1, y: 0.5 }, colors }));
  }
}

export default function TeenPattiGame() {
  const [balance] = useGameBalance("teen-patti-joker", STARTING_BALANCE);
  const pool = usePoolLifecycle("teen-patti-joker");
  const [hydrated, setHydrated] = useState(false);
  const [bets, setBets] = usePoolRoundState<Bets>("teen-patti-joker", "bets", EMPTY_BETS);
  const [stacks, setStacks] = useState<Stacks>(EMPTY_STACKS);
  const [lastBets, setLastBets] = useState<Bets | null>(null);
  const [chipValue, setChipValue] = useState<number>(50);
  const [phase, setPhase] = useState<Phase>("betting");
  const [round, setRound] = useState<Round | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [revealedCards, setRevealedCards] = useState(0);
  const [zoneStates, setZoneStates] = useState<Record<Zone, ZoneState>>({ player: "idle", dealer: "idle", tie: "idle" });
  const [result, setResult] = useState<ResultInfo | null>(null);
  const [history, setHistory] = useState<Zone[]>([]);
  const [lastWin, setLastWin] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [busted, setBusted] = useState(false);

  const timeouts = useRef<number[]>([]);
  const live = useLiveTable({
    queueNextRound: false,
    phase, balance, draft: bets, targets: ["player", "dealer", "tie"], prepaid: true,
    start: () => deal(),
    apply: async (b) => {
      pool.checkpoint({ bets: b });
      if (totalBet(b) > 0 && !await pool.stake(totalBet(b))) return;
      setBets(b);
      setStacks({ player: decompose(b.player), dealer: decompose(b.dealer), tie: decompose(b.tie) });
    },
  });

  /* ── persistence ── */
  useEffect(() => {
    setStacks({ player: decompose(bets.player), dealer: decompose(bets.dealer), tie: decompose(bets.tie) });
    try {
      const h = localStorage.getItem(LS_HISTORY);
      if (h) setHistory(JSON.parse(h) as Zone[]);
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_BALANCE, String(balance));
      localStorage.setItem(LS_HISTORY, JSON.stringify(history.slice(-24)));
    } catch { /* ignore */ }
  }, [balance, history, hydrated]);

  useEffect(() => () => timeouts.current.forEach(clearTimeout), []);

  const total = totalBet(bets);
  const locked = phase !== "betting";

  /* ── betting actions ── */
  const placeBet = async (zone: Zone) => {
    if (locked || chipValue <= 0) return;
    if (chipValue > balance) return;
    pool.checkpoint({ bets: { ...bets, [zone]: bets[zone] + chipValue } });
    if (!await pool.stake(chipValue)) return;
    sfx.play("chip");
    setBets((b) => ({ ...b, [zone]: b[zone] + chipValue }));
    setStacks((s) => ({ ...s, [zone]: [...s[zone], chipValue] }));
  };

  const clearBets = async () => {
    if (locked || total === 0) return;
    if (!await pool.refund()) return;
    sfx.play("click");
    setBets(EMPTY_BETS);
    setStacks(EMPTY_STACKS);
  };

  const rebet = async () => {
    if (locked || !lastBets) return;
    const t = totalBet(lastBets);
    if (t === 0 || t > balance + total) return;
    if (total > 0 && !await pool.refund()) return;
    pool.checkpoint({ bets: lastBets });
    if (!await pool.start(t)) return;
    sfx.play("chip");
    setBets(lastBets);
    setStacks({ player: decompose(lastBets.player), dealer: decompose(lastBets.dealer), tie: decompose(lastBets.tie) });
  };

  /* ── the deal: rigged outcome → choreographed reveal ── */
  const deal = useCallback(async () => {
    const accepted = live.begin();
    if (!accepted) return;
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];

    const snapshot = accepted;
    const t = totalBet(snapshot);
    setPhase("dealing");
    if (t > 0) {
      setLastBets(snapshot);
    }
    const newRound = t > 0
      ? await pool.resolveServer({ bets: snapshot }) as (Round & { payout: number }) | null
      : { ...buildRound("player"), payout: 0 };
    if (!newRound) { live.release(); setPhase("betting"); return; }
    const outcome = newRound.outcome;
    const returns = newRound.payout;
    const net = returns - t;
    const afterBalance = balance + returns;
    setRound(newRound);
    setRevealed(false);
    setRevealedCards(0);
    setResult(null);
    setZoneStates({ player: "idle", dealer: "idle", tie: "idle" });
    setPhase("dealing");

    const later = (ms: number, fn: () => void) => timeouts.current.push(window.setTimeout(fn, ms));

    // card fly-out sounds
    for (let k = 0; k < 6; k++) later(120 + k * 160, () => sfx.play("card"));

    for (let count = 1; count <= 6; count++) {
      later(1500 + (count - 1) * 750, () => {
        setRevealedCards(count);
        if (count === 6) setRevealed(true);
        sfx.play("flip");
      });
    }

    // result
    later(7000, async () => {
      const z: Record<Zone, ZoneState> = { player: "idle", dealer: "idle", tie: "idle" };
      if (outcome === "tie") {
        z.tie = "win";
        if (snapshot.player > 0) z.player = "push";
        if (snapshot.dealer > 0) z.dealer = "push";
      } else {
        z[outcome] = "win";
        const other: Zone = outcome === "player" ? "dealer" : "player";
        if (snapshot[other] > 0) z[other] = "lose";
        if (snapshot.tie > 0) z.tie = "lose";
      }
      setZoneStates(z);
      if (t > 0) pool.announce();
      setHistory((h) => [...h, outcome].slice(-24));
      setPhase("result");
      if (t <= 0) return;
      if (net > 0) setLastWin(net);

      const kind: ResultInfo["kind"] = net > 0 ? "win" : net < 0 ? "lose" : "push";
      const headline =
        pool.enabled ? "DAILY PAYOUT PENDING — INDICATIVE GAME NET (NOT PAID)" : kind === "win" ? "YOU WIN"
          : kind === "push" ? "TIE — PUSH"
            : "No win";
      setResult({
        kind,
        amount: net,
        headline,
        detail: `Player ${newRound.playerEval.shortName}  vs  Dealer ${newRound.dealerEval.shortName}`,
      });

      if (kind === "win") {
        sfx.play(net >= t * 3 ? "bigwin" : "win");
        fireConfetti(net >= t * 2, later);
      } else if (kind === "push") {
        sfx.play("push");
      } else {
        sfx.play("lose");
      }
    });

    // reset for next round
    later(10500, () => {
      setPhase("betting");
      setResult(null);
      setBets(EMPTY_BETS);
      setStacks(EMPTY_STACKS);
      setZoneStates({ player: "idle", dealer: "idle", tie: "idle" });
      setRound(null);
      setRevealed(false);
      if (t > 0 && afterBalance < MIN_BET) setBusted(true);
    });
  }, [phase, total, bets, balance]);

  const toggleSound = () => {
    sfx.enabled = !soundOn;
    setSoundOn(!soundOn);
    if (!soundOn) sfx.play("click");
  };

  const phaseMessage =
    phase === "betting" ? (total > 0 ? "BETS LOCKED? PRESS DEAL" : "PLACE YOUR BETS")
      : phase === "dealing" && !revealed ? "NO MORE BETS"
        : phase === "dealing" ? "SHOWDOWN" : "";

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#030c07] text-white flex flex-col justify-between px-1 sm:px-2 md:px-3 select-none">
      {live.controls}
      {/* ── ambient background ── */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_18%,#0d4f2c_0%,#052415_48%,#020b06_100%)]" />
        <div className="absolute inset-0 opacity-[0.35] [background:radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.75)_100%)]" />
        <div className="noise-layer absolute inset-0 opacity-[0.05]" />
        <motion.div
          className="absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl"
          animate={{ y: [0, 30, 0], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -right-24 top-1/2 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl"
          animate={{ y: [0, -34, 0], opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* ── header ── */}
      <motion.header
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 120, damping: 16 }}
        className="relative z-20 flex items-center justify-between border-b border-amber-200/10 bg-black/50 px-2 py-1.5 backdrop-blur-md rounded-b-xl"
      >
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/joker-emblem.png"
            alt="Joker emblem"
            className="h-8 w-8 rounded-full object-cover ring-1 ring-amber-300/50 [mix-blend-mode:screen]"
          />
          <div className="leading-tight">
            <div className="text-[8px] font-bold uppercase tracking-wider text-amber-200/60">Teen Patti</div>
            <div className="bg-gradient-to-b from-amber-100 via-amber-300 to-amber-600 bg-clip-text font-cinzel text-base font-black tracking-wider text-transparent">
              JOKER
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 md:flex">
            <History className="h-3 w-3 text-white/40" />
            <HistoryDots history={history.slice(-8)} />
          </div>
          {lastWin > 0 && (
            <div className="hidden rounded-full border border-amber-300/20 bg-amber-400/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-amber-200/80 lg:block">
              Won Rs. {formatChips(lastWin)}
            </div>
          )}
          <div className="flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-[linear-gradient(180deg,rgba(245,196,81,0.14),rgba(245,196,81,0.04))] py-1 pl-2.5 pr-3 shadow-[inset_0_1px_0_rgba(245,196,81,0.25)]">
            <Coins className="h-3.5 w-3.5 text-amber-300" />
            <span className="text-[9px] font-semibold uppercase text-white/40">Rs.</span>
            <AnimatedNumber value={balance} className="font-cinzel text-xs sm:text-sm font-bold text-amber-100" />
          </div>
          <button onClick={toggleSound} aria-label="Toggle sound" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white">
            {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => { sfx.play("click"); setShowHelp(true); }} aria-label="How to play" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white">
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>
      </motion.header>

      {/* ── table ── */}
      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 min-h-0 flex-col items-center justify-between px-1 py-1 overflow-hidden">
        <motion.section
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 90, damping: 16, delay: 0.1 }}
          className="relative w-full"
        >
          {/* gold rim */}
          <div className="rounded-[2rem] bg-[linear-gradient(180deg,#8f6b1f,#3d2c08_30%,#171004_70%,#6b4d12)] p-[3px] shadow-[0_30px_80px_rgba(0,0,0,0.7)] md:rounded-[3rem] md:p-1.5">
            <div className="rounded-[1.4rem] bg-[linear-gradient(180deg,#241a05,#0d0902)] p-1.5 md:rounded-[2.6rem] md:p-2">
              {/* felt */}
              <div className="relative overflow-hidden rounded-[1.2rem] md:rounded-[2.2rem]">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_75%_at_50%_38%,#12784a_0%,#0a4d2d_45%,#053018_78%,#03200f_100%)]" />
                <div className="noise-layer absolute inset-0 opacity-[0.07]" />
                <div className="pointer-events-none absolute inset-3 rounded-[1rem] border border-white/[0.07] md:inset-5 md:rounded-[1.8rem]" />

                {/* watermark emblem */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/joker-emblem.png"
                  alt=""
                  className="pointer-events-none absolute left-1/2 top-[46%] w-52 -translate-x-1/2 -translate-y-1/2 opacity-[0.16] [mix-blend-mode:screen] md:w-80"
                />

                {/* arc print */}
                <svg viewBox="0 0 600 130" className="pointer-events-none absolute left-1/2 top-2 w-[70%] -translate-x-1/2 opacity-50 md:top-3 md:w-[46%]">
                  <defs>
                    <path id="betArc" d="M70,118 A260,260 0 0 1 530,118" fill="none" />
                  </defs>
                  <text className="fill-amber-200/70 font-cinzel" fontSize="15" letterSpacing="6" fontWeight="700">
                    <textPath href="#betArc" startOffset="50%" textAnchor="middle">
                      TIE PAYS {TIE_PAYOUT} TO 1
                    </textPath>
                  </text>
                </svg>

                {/* phase message */}
                <div className="pointer-events-none absolute left-1/2 top-[16%] z-10 -translate-x-1/2 md:top-[19%]">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={phaseMessage}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      className="whitespace-nowrap font-cinzel text-[11px] font-bold tracking-[0.4em] text-amber-100/90 [text-shadow:0_0_18px_rgba(245,196,81,0.5)] md:text-base"
                    >
                      {phaseMessage}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* result banner overlay */}

                {/* main grid */}
                <div className="relative z-10 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-1 px-1.5 pb-2 pt-12 sm:gap-3 sm:px-4 sm:pt-16 md:gap-8 md:px-8">
                  {/* ── PLAYER side ── */}
                  <div className="flex flex-col items-center gap-2 md:gap-3">
                    <div className="flex h-24 items-center justify-center sm:h-28 md:h-32">
                      <AnimatePresence mode="popLayout">
                        {round ? (
                          <div className="flex -space-x-6 sm:-space-x-8 md:-space-x-10" key="ph">
                            {round.playerHand.map((c, i) => (
                              <PlayingCard
                                key={c.id}
                                card={c}
                                dealt
                                revealed={i * 2 < revealedCards}
                                dealOrder={i * 2}
                                flipOrder={i + 3}
                                winnerDim={phase === "result" && round.outcome === "dealer"}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="flex -space-x-6 sm:-space-x-8 md:-space-x-10" key="pg">
                            <CardGhost /><CardGhost /><CardGhost />
                          </div>
                        )}
                      </AnimatePresence>
                    </div>
                    <HandBadge
                      name={round?.playerEval.name ?? ""}
                      visible={!!round && revealed}
                      winner={phase === "result" && round?.outcome === "player"}
                    />
                    <BetZone
                      zone="player"
                      title="PLAYER"
                      payout="Pays 1 to 1"
                      accent="blue"
                      bet={bets.player}
                      stack={stacks.player}
                      state={zoneStates.player}
                      locked={locked}
                      onPlace={() => placeBet("player")}
                    />
                  </div>

                  {/* ── CENTER column ── */}
                  <div className="flex w-[4.5rem] flex-col items-center gap-3 min-[420px]:w-24 sm:w-28 md:w-40 md:gap-4">
                    {/* deck pile */}
                    <div className="relative mb-1 h-16 w-12 sm:h-[4.5rem] sm:w-14 md:h-20 md:w-16">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          animate={phase === "dealing" ? { rotate: [-4 + i * 4, -4 + i * 4] } : { rotate: -4 + i * 4, y: [0, -2, 0] }}
                          transition={phase === "dealing" ? {} : { duration: 3 + i, repeat: Infinity, ease: "easeInOut" }}
                          className="absolute inset-0 overflow-hidden rounded-md border border-amber-200/50 shadow-[0_6px_14px_rgba(0,0,0,0.5)]"
                          style={{ zIndex: i }}
                        >
                          <div className="absolute inset-0 bg-[linear-gradient(135deg,#7a1020,#3d0a18_55%,#7a1020)]" />
                          <div
                            className="absolute inset-[2px] rounded-sm opacity-70"
                            style={{
                              backgroundImage:
                                "repeating-linear-gradient(45deg,rgba(245,196,81,0.25) 0 1.5px,transparent 1.5px 6px),repeating-linear-gradient(-45deg,rgba(245,196,81,0.25) 0 1.5px,transparent 1.5px 6px)",
                            }}
                          />
                        </motion.div>
                      ))}
                      <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] font-bold uppercase tracking-[0.3em] text-white/30 md:text-[9px]">
                        54 cards · 2 jokers
                      </div>
                    </div>

                    <div className="mt-4 w-full md:mt-5">
                      <BetZone
                        zone="tie"
                        title="TIE"
                        payout={`Pays ${TIE_PAYOUT} to 1`}
                        accent="gold"
                        bet={bets.tie}
                        stack={stacks.tie}
                        state={zoneStates.tie}
                        locked={locked}
                        onPlace={() => placeBet("tie")}
                      />
                    </div>

                    <div className="hidden text-center md:block">
                      <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-amber-100/35">Main bets push on tie</div>
                    </div>
                  </div>

                  {/* ── DEALER side ── */}
                  <div className="flex flex-col items-center gap-2 md:gap-3">
                    <div className="flex h-24 items-center justify-center sm:h-28 md:h-32">
                      <AnimatePresence mode="popLayout">
                        {round ? (
                          <div className="flex -space-x-6 sm:-space-x-8 md:-space-x-10" key="dh">
                            {round.dealerHand.map((c, i) => (
                              <PlayingCard
                                key={c.id}
                                card={c}
                                dealt
                                revealed={i * 2 + 1 < revealedCards}
                                dealOrder={i * 2 + 1}
                                flipOrder={i}
                                winnerDim={phase === "result" && round.outcome === "player"}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="flex -space-x-6 sm:-space-x-8 md:-space-x-10" key="dg">
                            <CardGhost /><CardGhost /><CardGhost />
                          </div>
                        )}
                      </AnimatePresence>
                    </div>
                    <HandBadge
                      name={round?.dealerEval.name ?? ""}
                      visible={!!round && revealed}
                      winner={phase === "result" && round?.outcome === "dealer"}
                    />
                    <BetZone
                      zone="dealer"
                      title="DEALER"
                      payout="Pays 1 to 1"
                      accent="red"
                      bet={bets.dealer}
                      stack={stacks.dealer}
                      state={zoneStates.dealer}
                      locked={locked}
                      onPlace={() => placeBet("dealer")}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* limits plaque */}
          <div className="pointer-events-none absolute -bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-amber-300/30 bg-[linear-gradient(180deg,#241a05,#0d0902)] px-4 py-1 text-[9px] font-bold uppercase tracking-[0.25em] text-amber-200/70 shadow-lg md:text-[10px]">
            Min Rs. {MIN_BET} · Max Rs. {formatChips(Math.floor(balance))}
          </div>
        </motion.section>

        {/* history road (hidden on mobile to fit screen) */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="hidden"
        >
          <History className="h-3.5 w-3.5 shrink-0 text-white/40" />
          <HistoryDots history={history.slice(-12)} />
        </motion.div>
      </main>

      {/* ── control dock ── */}
      <motion.footer
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 90, damping: 16, delay: 0.25 }}
        className="relative z-20 w-full max-w-5xl pb-1 pt-0.5"
      >
        <div className="mx-auto w-full px-1 sm:px-3">
          <div className="rounded-xl border border-amber-200/15 bg-[linear-gradient(180deg,rgba(20,14,4,0.85),rgba(8,6,2,0.92))] p-2 sm:p-3 shadow-xl backdrop-blur-xl">
            <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
              {/* chip rack */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-1 md:gap-2.5 md:pb-0">
                {CHIP_VALUES.map((v) => (
                  <Chip
                    key={v}
                    value={v}
                    selected={chipValue === v}
                    onClick={() => { setChipValue(v); sfx.play("click"); }}
                    disabled={false}
                  />
                ))}
                <input
                  type="number"
                  min={10}
                  value={chipValue || ""}
                  placeholder="Custom"
                  aria-label="Custom bet amount"
                  onChange={(e) => setChipValue(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                  className="h-10 w-20 shrink-0 rounded-lg border border-amber-300/40 bg-black/60 text-center text-sm font-bold text-amber-200"
                />
              </div>

              {/* total + actions */}
              <div className="flex items-center justify-between gap-1.5 md:justify-end md:gap-2.5">
                <div className="rounded-lg border border-white/10 bg-black/50 px-2.5 py-1 text-center">
                  <div className="text-[7px] sm:text-[8px] font-bold uppercase tracking-wider text-white/40">Total bet</div>
                  <div className="font-cinzel text-xs sm:text-base font-bold text-amber-200">Rs. {formatChips(total)}</div>
                </div>
                <button
                  onClick={clearBets}
                  disabled={locked || total === 0}
                  className="grid h-8 w-8 sm:h-10 sm:w-10 place-items-center rounded-lg border border-rose-500/50 bg-rose-950/40 text-rose-300 hover:bg-rose-900/60 shadow-[0_0_10px_rgba(244,63,94,0.3)] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Clear bets"
                >
                  <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </button>
                <button
                  onClick={rebet}
                  disabled={locked || !lastBets || totalBet(lastBets) > balance + total}
                  className="grid h-8 w-8 sm:h-10 sm:w-10 place-items-center rounded-lg border border-sky-500/50 bg-sky-950/40 text-sky-300 hover:bg-sky-900/60 shadow-[0_0_10px_rgba(56,189,248,0.3)] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Rebet"
                >
                  <RotateCcw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </button>
                <motion.button
                  onClick={deal}
                  disabled={phase !== "betting" || total === 0}
                  whileTap={phase === "betting" && total > 0 ? { scale: 0.94 } : undefined}
                  className="deal-shine relative h-8 sm:h-10 overflow-hidden rounded-lg bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 px-4 sm:px-7 font-cinzel text-xs sm:text-sm font-black tracking-wider text-[#1a0f00] shadow-[0_0_18px_rgba(251,191,36,0.6)] transition disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="relative z-10 flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5" fill="currentColor" />
                    {phase === "dealing" ? "DEALING" : "DEAL"}
                  </span>
                </motion.button>
              </div>
            </div>
          </div>
        </div>
      </motion.footer>

      {/* ── help modal ── */}
      <AnimatePresence>
        {showHelp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={() => setShowHelp(false)}
          >
            <motion.div
              initial={{ scale: 0.85, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md overflow-hidden rounded-3xl border border-amber-300/25 bg-[linear-gradient(170deg,#101c14,#060d09)] shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-amber-300" />
                  <span className="font-cinzel text-sm font-black tracking-[0.2em] text-amber-200">HAND RANKINGS</span>
                </div>
                <button onClick={() => setShowHelp(false)} className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-white/50 hover:bg-white/10">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-2 px-5 py-4 text-sm">
                {[
                  ["TRAIL / SET", "Three of a kind — A-A-A is highest"],
                  ["PURE SEQUENCE", "Straight flush — e.g. 4-5-6 same suit"],
                  ["SEQUENCE", "Straight — e.g. 9-10-J mixed suits"],
                  ["COLOR", "Flush — all three cards same suit"],
                  ["PAIR", "Two cards of same rank"],
                  ["HIGH CARD", "Nothing made — highest card wins"],
                ].map(([name, desc], i) => (
                  <div key={name} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3.5 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className={`font-cinzel text-xs font-black ${i === 0 ? "text-amber-300" : "text-white/70"}`}>{i + 1}.</span>
                      <span className={`font-cinzel text-xs font-bold tracking-wider ${i === 0 ? "text-amber-300" : "text-white/85"}`}>{name}</span>
                    </div>
                    <span className="text-right text-[10px] leading-tight text-white/40">{desc}</span>
                  </div>
                ))}
                <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-400/5 px-3.5 py-3 text-[11px] leading-relaxed text-amber-100/70">
                  Jokers are wild — they become the best possible card for the hand. Player &amp; Dealer pay 1:1, Tie pays {TIE_PAYOUT}:1. On a tie, Player/Dealer bets are pushed back.
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── busted modal ── */}
      <AnimatePresence>
        {busted && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.7, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 240, damping: 18 }}
              className="w-full max-w-sm rounded-3xl border border-amber-300/30 bg-[linear-gradient(170deg,#1a1206,#0a0703)] p-8 text-center shadow-2xl"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/joker-emblem.png" alt="" className="mx-auto h-20 w-20 rounded-full object-cover [mix-blend-mode:screen]" />
              <div className="mt-4 font-cinzel text-2xl font-black tracking-wider text-white">OUT OF CHIPS</div>
              <p className="mt-2 text-sm text-white/50">Insufficient balance.</p>
              <motion.button
                onClick={() => setBusted(false)}
                whileTap={{ scale: 0.94 }}
                className="deal-shine relative mt-6 w-full overflow-hidden rounded-xl border border-amber-200/60 bg-[linear-gradient(180deg,#f9dd8a,#d4af37_45%,#8a6d1f)] py-3 font-cinzel text-sm font-black tracking-[0.2em] text-[#241a05] shadow-[0_6px_24px_rgba(212,175,55,0.4)]"
              >
                <span className="relative z-10">CLOSE</span>
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
