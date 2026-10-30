"use client";
import { GameOverOverlay } from "@/components/GameOverOverlay";
import { gameSfx } from "@/lib/gameSfx";

import { useEffect, useRef, useState } from "react";
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import type { Card, Outcome } from "./lib/war";
import { dealRound, warRound } from "./lib/war";
import { useIdleCardRound } from "../teen-patti/useIdleCardRound";
import BetAmountInput from "@/components/BetAmountInput";
import { BurnPile, EmptySlot, PlayingCard } from "./PlayingCard";
import { CHIPS, Chip, ChipStack } from "./Chip";
import "./casino-war.css";

type Phase = "betting" | "dealing" | "tie" | "war" | "result";
type Spot = "ante" | "tie";
type Tone = "info" | "win" | "lose" | "tie";
type RoundData = { result: Outcome; player: Card; dealer: Card };
type ServerRound = { phase: string; view: RoundData & { phase: string; tiePayout: number; war?: RoundData; decision?: "war" | "surrender" }; stake: number };

const START_BALANCE = 10000;
const STORAGE_KEY = "casino-war-balance";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmt = (n: number) => `Rs. ${n.toLocaleString("en-US")}`;

export default function CasinoWar() {
  const [balance] = useGameBalance("casino-war", START_BALANCE);
  const pool = usePoolLifecycle("casino-war");
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<number>(100);
  const [bets, setBets] = usePoolRoundState("casino-war", "bets", { ante: 0, tie: 0 });
  const [history, setHistory] = usePoolRoundState<{ spot: Spot; amt: number }[]>("casino-war", "history", []);
  const [savedPhase] = usePoolRoundState<Phase>("casino-war", "phase", "betting");
  const [phase, setPhase] = useState<Phase>(savedPhase);
  const [raise, setRaise] = useState(0);

  const [wagerPlayer, setPlayer] = useState<Card | null>(null);
  const [wagerDealer, setDealer] = useState<Card | null>(null);
  const [wagerShowP, setShowP] = useState(false);
  const [wagerShowD, setShowD] = useState(false);

  const [warOn, setWarOn] = useState(false);
  const [warP, setWarP] = useState<Card | null>(null);
  const [warD, setWarD] = useState<Card | null>(null);
  const [showWP, setShowWP] = useState(false);
  const [showWD, setShowWD] = useState(false);

  const [message, setMessage] = useState<{ text: string; sub?: string; tone: Tone }>({
    text: "PLACE YOUR BETS",
    tone: "info",
  });
  const [lastWin, setLastWin] = useState(0);
  const [endDismissed, setEndDismissed] = useState(false);
  const lastBet = useRef({ ante: 0, tie: 0 });
  const roundBusy = useRef(false);
  const idleRound = useIdleCardRound({
    idle: phase === "betting", finished: phase === "result", busy: pool.busy,
    paused: bets.ante + bets.tie > 0,
    frames: () => {
      const cards = dealRound();
      const final = cards.result === "tie" ? warRound() : cards;
      return [
        { at: 0, view: { ...cards, showP: false, showD: false } },
        { at: 700, view: { ...cards, showP: false, showD: true } },
        { at: 1350, view: { ...cards, showP: true, showD: true } },
        { at: cards.result === "tie" ? 4700 : 2250, view: { ...final, showP: true, showD: true } },
      ];
    },
    next: () => {
      setBets({ ante: 0, tie: 0 });
      setHistory([]);
      resetTable();
    },
  });
  const player = idleRound.preview?.player ?? wagerPlayer;
  const dealer = idleRound.preview?.dealer ?? wagerDealer;
  const showP = idleRound.preview?.showP ?? wagerShowP;
  const showD = idleRound.preview?.showD ?? wagerShowD;

  useEffect(() => {
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, String(balance));
  }, [balance, loaded]);

  useEffect(() => {
    if (!loaded || !localStorage.getItem("wx:browser-active:casino-war:main")) return;
    let disposed = false;
    void (async () => {
      await pool.resume();
      if (disposed) return;
      if (!localStorage.getItem("wx:browser-active:casino-war:main")) {
        setBets({ ante: 0, tie: 0 });
        setHistory([]);
        resetTable();
        return;
      }
      const restored = await pool.cardAction("state", {}) as ServerRound | null;
      if (disposed || !restored?.view || restored.view.phase !== "tie") return;
      const data = restored.view;
      setDealer(data.dealer);
      setPlayer(data.player);
      setShowD(true);
      setShowP(true);
      setPhase("tie");
      setMessage({ text: "TIE!", sub: "Go to war or surrender?", tone: "tie" });
    })();
    return () => { disposed = true; };
  }, [loaded]);

  const totalBet = bets.ante + bets.tie + raise;
  const canBet = !idleRound.watching && (phase === "betting" || phase === "result");

  function resetTable() {
    roundBusy.current = false;
    setPlayer(null);
    setDealer(null);
    setShowP(false);
    setShowD(false);
    setWarOn(false);
    setWarP(null);
    setWarD(null);
    setShowWP(false);
    setShowWD(false);
    setRaise(0);
    setLastWin(0);
    setMessage({ text: "PLACE YOUR BETS", tone: "info" });
    setPhase("betting");
  }

  function flash(text: string) {
    setMessage({ text, tone: "info" });
  }

  async function placeChip(spot: Spot) {
    if (!canBet || roundBusy.current) return;
    gameSfx.chip();
    if (selected > balance) {
      flash("NOT ENOUGH BALANCE");
      return;
    }
    const fresh = phase === "result";
    const base = fresh ? { ante: 0, tie: 0 } : bets;
    pool.checkpoint({ bets: { ...base, [spot]: base[spot] + selected }, phase: "betting", history: [...(fresh ? [] : history), { spot, amt: selected }] });
    if (!await pool.stake(selected)) return;
    if (fresh) resetTable();
    setBets({ ...base, [spot]: base[spot] + selected });
    setHistory((h) => [...(fresh ? [] : h), { spot, amt: selected }]);
  }

  async function undo() {
    if (phase !== "betting" || idleRound.watching || roundBusy.current || history.length === 0) return;
    const last = history[history.length - 1];
    pool.checkpoint({ bets: { ...bets, [last.spot]: bets[last.spot] - last.amt }, history: history.slice(0, -1) });
    if (!await pool.reduce(last.amt)) return;
    setHistory(history.slice(0, -1));
    setBets((b) => ({ ...b, [last.spot]: b[last.spot] - last.amt }));
  }

  async function clearBets() {
    if (idleRound.watching || roundBusy.current) return;
    if (phase === "result") {
      setBets({ ante: 0, tie: 0 });
      setHistory([]);
      resetTable();
      return;
    }
    if (phase !== "betting") return;
    if (bets.ante + bets.tie > 0 && !await pool.refund()) return;
    setBets({ ante: 0, tie: 0 });
    setHistory([]);
  }

  async function rebet() {
    if (!canBet) return;
    const { ante, tie } = lastBet.current;
    const refund = phase === "betting" ? bets.ante + bets.tie : 0;
    if (ante <= 0) return;
    if (ante + tie > balance + refund) {
      flash("NOT ENOUGH BALANCE TO REBET");
      return;
    }
    if (phase === "result") resetTable();
    if (refund > 0 && !await pool.refund()) return;
    pool.checkpoint({ bets: { ante, tie }, phase: "betting" });
    if (!await pool.start(ante + tie)) return;
    setBets({ ante, tie });
    setHistory([
      ...(ante ? [{ spot: "ante" as Spot, amt: ante }] : []),
      ...(tie ? [{ spot: "tie" as Spot, amt: tie }] : []),
    ]);
  }

  async function deal() {
    if (pool.busy || idleRound.watching || roundBusy.current) return;
    if (phase !== "betting" || bets.ante <= 0) {
      if (phase === "betting") flash("PLACE AN ANTE BET FIRST");
      return;
    }
    gameSfx.deal();
    roundBusy.current = true;
    const { ante, tie } = bets;
    lastBet.current = { ante, tie };
    setPhase("dealing");
    setMessage({ text: "DEALING...", tone: "info" });

    const reply = await pool.cardAction("deal", { ante, tie }) as ServerRound | null;
    if (!reply) { roundBusy.current = false; setPhase("betting"); return; }
    const data = reply.view;
    if (data.result === "tie") {
      pool.checkpoint({ bets: { ante, tie: 0 }, phase: "tie", round: data });
    }

    setDealer(data.dealer);
    setPlayer(data.player);
    await sleep(700);
    setShowD(true);
    await sleep(650);
    setShowP(true);
    await sleep(900);
    roundBusy.current = false;

    if (data.result === "win") {
      gameSfx.win();
      const payout = ante * 2;
      pool.announce();
      setLastWin(ante);
      setMessage({ text: pool.enabled ? "PROVISIONAL CLAIM" : "YOU WIN!", sub: `+${fmt(pool.enabled ? payout : ante)}`, tone: "win" });
      setEndDismissed(false);
      setPhase("result");
    } else if (data.result === "lose") {
      pool.announce();
      gameSfx.lose();
      setLastWin(0);
      setMessage({ text: pool.enabled ? "DAILY PAYOUT PENDING — PROVISIONAL CLAIM 0" : "No win", tone: "lose" });
      setEndDismissed(false);
    setPhase("result");
    } else {
      // tie
      setLastWin(tie * 10);
      setMessage({
        text: "TIE!",
        sub: tie > 0 ? pool.enabled ? `Provisional tie claim ${fmt(tie * 11)} • Go to war or surrender?` : `Tie bet pays ${fmt(tie * 10)} • Go to war or surrender?` : "Go to war or surrender?",
        tone: "tie",
      });
      setBets((b) => ({ ...b, tie: 0 }));
      setPhase("tie");
    }
  }

  async function surrender() {
    if (phase !== "tie" || pool.busy || roundBusy.current) return;
    roundBusy.current = true;
    const back = Math.floor(bets.ante / 2);
    if (!await pool.cardAction("surrender", {})) { roundBusy.current = false; return; }
    pool.announce();
    setMessage({
      text: pool.enabled ? "DAILY PAYOUT PENDING" : "SURRENDERED",
      sub: pool.enabled ? `Provisional claim ${fmt(back)} (plus any tie claim)` : `Half of ante returned (${fmt(back)})`,
      tone: "lose",
    });
    setEndDismissed(false);
    setPhase("result");
  }

  async function goToWar() {
    if (phase !== "tie" || pool.busy || roundBusy.current) return;
    const ante = bets.ante;
    if (ante > balance) {
      flash("NOT ENOUGH BALANCE FOR WAR - SURRENDER");
      return;
    }
    roundBusy.current = true;
    const reply = await pool.cardAction("war", {}) as ServerRound | null;
    const data = reply?.view.war;
    if (!data) { roundBusy.current = false; return; }
    setRaise(ante);
    setPhase("war");
    setMessage({ text: "WAR!", sub: "Burning 3 cards...", tone: "tie" });

    setWarOn(true);
    await sleep(1100);
    setWarD(data.dealer);
    setWarP(data.player);
    await sleep(700);
    setShowWD(true);
    await sleep(650);
    setShowWP(true);
    await sleep(900);
    roundBusy.current = false;

    if (data.result === "win") {
      const payout = ante * 3; // ante pushes, raise pays 1:1
      pool.announce();
      setLastWin((w) => w + ante);
      setMessage({ text: pool.enabled ? "DAILY PAYOUT PENDING" : "YOU WIN THE WAR!", sub: pool.enabled ? `Provisional claim ${fmt(payout)} (plus any tie claim)` : `+${fmt(ante)}`, tone: "win" });
    } else {
      pool.announce();
      setLastWin(0);
      setMessage({ text: pool.enabled ? "DAILY PAYOUT PENDING — PROVISIONAL CLAIM 0 (plus any tie claim)" : "No win", tone: "lose" });
    }
    setEndDismissed(false);
    setPhase("result");
  }

  const bannerColor: Record<Tone, string> = {
    info: "text-yellow-100 border-yellow-300/40",
    win: "text-emerald-300 border-emerald-300/70",
    lose: "text-red-300 border-red-400/70",
    tie: "text-amber-300 border-amber-300/70",
  };


  return (
    <div className="casino-war-wrap mx-auto flex h-full w-full max-w-5xl flex-col gap-1.5 sm:gap-2 overflow-y-auto overflow-x-hidden px-1.5 sm:px-3 py-1 pb-4">
      {/* Top bar */}
      <header className="flex flex-wrap items-center justify-between gap-1.5 rounded-xl border border-yellow-500/30 bg-black/50 px-3 py-1 sm:py-1.5 backdrop-blur shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xl sm:text-2xl text-amber-300">♠</span>
          <h1 className="font-display text-lg sm:text-xl font-bold tracking-widest gold-text">
            CASINO WAR
          </h1>
        </div>
        <div className="flex gap-1.5 text-center sm:gap-3">
          <Stat label="BALANCE" value={fmt(balance)} highlight />
          <Stat label="TOTAL BET" value={fmt(totalBet)} />
          <Stat label={pool.enabled ? "GAME RETURN (NOT PAID)" : "LAST WIN"} value={fmt(lastWin)} />
        </div>
      </header>

      {/* Table */}
      <div
        className="table-rail p-2 sm:p-3 shrink-0 flex flex-col"
        style={{ borderRadius: "20px 20px 36% 36% / 20px 20px 18% 18%" }}
      >
        <div
          className="table-felt relative flex flex-col items-center justify-between gap-2 px-2 py-3 pb-6 sm:px-4 sm:py-4 sm:pb-8"
          style={{ borderRadius: "16px 16px 36% 36% / 16px 16px 18% 18%" }}
        >
          {/* Dealer */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <Label>DEALER</Label>
            <div className="flex min-h-[90px] sm:min-h-[110px] items-start gap-2.5 sm:gap-4">
              {dealer ? <PlayingCard card={dealer} revealed={showD} /> : <EmptySlot />}
              {warOn && <BurnPile />}
              {warD && <PlayingCard card={warD} revealed={showWD} />}
            </div>
          </div>

          {/* Center */}
          <div className="relative my-1 flex h-[70px] sm:h-[90px] w-full max-w-[540px] items-center justify-center shrink-0">
            <svg
              viewBox="0 0 640 150"
              className={`absolute inset-0 h-full w-full transition-opacity ${
                phase === "betting" ? "opacity-100" : "opacity-25"
              }`}
            >
              <defs>
                <path id="arc1" d="M 70 110 Q 320 10 570 110" fill="none" />
                <path id="arc2" d="M 40 145 Q 320 45 600 145" fill="none" />
                <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#fff3b0" />
                  <stop offset="0.5" stopColor="#f4c542" />
                  <stop offset="1" stopColor="#b8861b" />
                </linearGradient>
              </defs>
              <text fill="url(#g)" fontSize="42" fontWeight="bold" fontFamily="Georgia, serif" letterSpacing="8">
                <textPath href="#arc1" startOffset="50%" textAnchor="middle">
                  CASINO WAR
                </textPath>
              </text>
              <text fill="#f7e9a8" fontSize="14" fontFamily="Georgia, serif" letterSpacing="3" opacity="0.9">
                <textPath href="#arc2" startOffset="50%" textAnchor="middle">
                  PAYS 1 TO 1 • TIE PAYS 10 TO 1 • ACE HIGH
                </textPath>
              </text>
            </svg>

            <div
              key={message.text + (message.sub ?? "")}
              className={`banner-pop relative z-10 rounded-xl border bg-black/75 px-4 py-1 text-center shadow-xl backdrop-blur ${bannerColor[message.tone]} ${
                phase === "betting" && message.tone === "info" && message.text === "PLACE YOUR BETS"
                  ? "opacity-0"
                  : ""
              }`}
            >
              <div className="font-display text-base font-bold tracking-wider sm:text-2xl">
                {message.text}
              </div>
              {message.sub && <div className="text-[10px] font-semibold opacity-90 sm:text-xs">{message.sub}</div>}
            </div>
          </div>

          {/* Player */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className="flex min-h-[90px] sm:min-h-[110px] items-start gap-2.5 sm:gap-4">
              {player ? <PlayingCard card={player} revealed={showP} /> : <EmptySlot />}
              {warOn && <BurnPile />}
              {warP && <PlayingCard card={warP} revealed={showWP} />}
            </div>
            <Label>PLAYER</Label>
          </div>

          {/* Bet spots */}
          <div className="mt-2 flex w-full items-end justify-center gap-3 sm:gap-8 shrink-0">
            <BetSpot
              label="TIE"
              sub="PAYS 10:1"
              amount={bets.tie}
              onClick={() => placeChip("tie")}
              size="sm"
              active={canBet}
            />
            <BetSpot
              label="ANTE"
              sub="PAYS 1:1"
              amount={bets.ante}
              onClick={() => placeChip("ante")}
              size="lg"
              active={canBet}
            />
            <BetSpot label="WAR" sub="RAISE = ANTE" amount={raise} size="sm" active={false} dashed />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="rounded-xl border border-yellow-500/30 bg-black/60 p-2.5 sm:p-3 backdrop-blur shrink-0">
        {phase === "tie" ? (
          <div className="flex flex-col items-center gap-2">
            <p className="font-display text-sm sm:text-base tracking-wide text-amber-200">
              Tie! Go to War (raise {fmt(bets.ante)}) or Surrender (lose half)?
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={goToWar}
                className="pulse-gold rounded-full bg-gradient-to-r from-red-600 to-rose-700 px-6 py-2 text-sm sm:text-base font-black tracking-widest shadow-lg shadow-red-600/40 transition hover:brightness-110 active:scale-95"
              >
                GO TO WAR
              </button>
              <button
                onClick={surrender}
                className="rounded-full bg-gradient-to-r from-slate-600 to-zinc-700 px-6 py-2 text-sm sm:text-base font-bold tracking-widest shadow-lg transition hover:brightness-110 active:scale-95"
              >
                SURRENDER
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 sm:gap-2.5">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
              {CHIPS.map((v) => (
                <Chip
                  key={v}
                  value={v}
                  size={46}
                  selected={selected === v}
                  onClick={() => setSelected(v)}
                  className={v > balance ? "opacity-40" : ""}
                />
              ))}
              <BetAmountInput value={selected} onChange={setSelected} />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2.5">
              <Btn variant="undo" onClick={undo} disabled={phase !== "betting" || history.length === 0}>
                UNDO
              </Btn>
              <Btn variant="clear" onClick={clearBets} disabled={!canBet || (bets.ante + bets.tie === 0 && phase === "betting")}>
                CLEAR
              </Btn>
              <Btn variant="rebet" onClick={rebet} disabled={!canBet || lastBet.current.ante === 0}>
                REBET
              </Btn>
              <button
                onClick={deal}
                disabled={phase !== "betting" || bets.ante <= 0}
                className={`rounded-full bg-gradient-to-b from-yellow-300 via-amber-400 to-amber-600 px-7 sm:px-9 py-2 sm:py-2.5 text-sm sm:text-base font-black tracking-widest text-black shadow-lg shadow-amber-500/30 transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 border border-yellow-200 ${
                  phase === "betting" && bets.ante > 0 ? "pulse-gold" : ""
                }`}
              >
                DEAL
              </button>
            </div>
          </div>
        )}
      </div>

      <GameOverOverlay open={phase === "result" && !endDismissed} winAmount={message.tone === "win" ? lastWin : 0} result={message.text} onPlayAgain={clearBets} onClose={() => setEndDismissed(true)} />
      <footer className="hidden sm:block pb-0.5 text-center text-[10px] text-yellow-100/40 shrink-0">
        Play-money game for entertainment only. Highest card wins — Ace is high.
      </footer>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="min-w-[78px] rounded-lg border border-white/10 bg-white/5 px-3 py-1">
      <div className="text-[10px] tracking-widest text-yellow-100/60">{label}</div>
      <div className={`text-base font-bold sm:text-lg ${highlight ? "text-yellow-300" : "text-white"}`}>
        {value}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-display text-xs font-bold tracking-[0.4em] text-yellow-200/80 sm:text-sm">
      {children}
    </span>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  variant = "undo",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "undo" | "clear" | "rebet";
}) {
  const styles =
    variant === "clear"
      ? "border-rose-500/50 bg-gradient-to-r from-rose-600 to-red-700 text-white shadow-rose-600/30"
      : variant === "rebet"
      ? "border-cyan-500/50 bg-gradient-to-r from-cyan-600 to-blue-700 text-white shadow-cyan-600/30"
      : "border-slate-500/50 bg-gradient-to-r from-slate-700 to-zinc-800 text-slate-200 shadow-slate-700/30";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-4 py-2 text-xs font-black tracking-widest shadow-md transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 ${styles}`}
    >
      {children}
    </button>
  );
}

function BetSpot({
  label,
  sub,
  amount,
  onClick,
  size,
  active,
  dashed,
}: {
  label: string;
  sub: string;
  amount: number;
  onClick?: () => void;
  size: "sm" | "lg";
  active: boolean;
  dashed?: boolean;
}) {
  const dim = size === "lg" ? "h-[104px] w-[104px] sm:h-[132px] sm:w-[132px]" : "h-[82px] w-[82px] sm:h-[104px] sm:w-[104px]";
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={!active}
        className={`relative flex items-center justify-center rounded-full border-[3px] ${
          dashed ? "border-dashed" : ""
        } border-yellow-300/70 bg-black/15 transition ${dim} ${
          active ? "cursor-pointer hover:bg-yellow-200/15" : "cursor-default"
        }`}
      >
        {amount > 0 ? (
          <ChipStack amount={amount} size={size === "lg" ? 56 : 46} />
        ) : (
          <span className="font-display text-sm font-bold tracking-widest text-yellow-200/70 sm:text-lg">
            {label}
          </span>
        )}
      </button>
      <div className="text-center leading-tight">
        <div className="font-display text-[10px] tracking-widest text-yellow-200/80 sm:text-xs">
          {amount > 0 ? `${label} ${fmt(amount)}` : sub}
        </div>
      </div>
    </div>
  );
}
