"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMultiplayerGame } from "@/lib/useMultiplayerGame";
import { LiveMultiplayerBets } from "@/components/LiveMultiplayerBets";
import type { SpeedBaccaratOutcome } from "@/lib/multiplayer-rules";
import BetAmountInput from "@/components/BetAmountInput";
import BetSpot from "./BetSpot";
import { Chip } from "./Chip";
import Confetti from "./Confetti";
import DealerFeed from "./DealerFeed";
import Roadmap from "./Roadmap";
import StatsPanel from "./StatsPanel";
import TimerRing from "./TimerRing";
import { Hand, CardSlot } from "./PlayingCard";
import { IconBolt, IconClear, IconClub, IconDiamond, IconInfo, IconRepeat, IconSound, IconSpade } from "./icons";
import type { Side } from "./lib/baccarat";
import {
  applyRound,
  BET_META as LEGACY_BET_META,
  CHIP_VALUES,
  EMPTY_BETS,
  EMPTY_STATS,
  money,
  totalStake,
  type BetKey,
  type Bets,
  type HistoryEntry,
  type RoundResult,
  type Stats,
} from "./lib/game";
import { sound } from "./lib/sound";
import "./speed-baccarat.css";

type Phase = "betting" | "dealing" | "result";
type FeedItem = { id: number; winner: Side; pTotal: number; bTotal: number; net: number; graded: RoundResult["graded"] };
type SeatBet = { id: string; name: string; side: BetKey; amount: number; won: boolean | null; profit: number };

const BET_MS = 10000;
const START_BALANCE = 1000;

const MAIN_SPOTS: BetKey[] = ["player", "tie", "banker"];
const SIDE_SPOTS: BetKey[] = ["playerPair", "bankerPair"];

const PHASE_COPY: Record<Phase, string> = {
  betting: "Place your bets",
  dealing: "Dealing",
  result: "Payout",
};

export default function SpeedBaccaratGame() {
  const live = useMultiplayerGame<SpeedBaccaratOutcome>("speed-baccarat");
  const personalTable = live.state?.tableMode === "personal";
  const BET_META = Object.fromEntries(Object.entries(LEGACY_BET_META).map(([key, meta]) => [
    key, personalTable && meta.payout > 1 ? { ...meta, payout: 1, note: "Pays 1 : 1 · capped at 2x gross return" } : meta,
  ])) as typeof LEGACY_BET_META;
  const [chip, setChip] = useState<number>(50);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [muted, setMuted] = useState(false);
  const [auto, setAuto] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string; tone: "win" | "lose" | "info" }[]>([]);
  const [mobileTab, setMobileTab] = useState<"table" | "roadmap" | "dealer">("table");
  const previous = useRef<Bets | null>(null);
  const notified = useRef<number | null>(null);
  const autoRound = useRef<number | null>(null);
  const toastId = useRef(0);
  const state = live.state;
  const balance = state?.balance ?? 0;
  const phase: Phase = state?.round.phase === "running" ? "dealing" : state?.round.phase ?? "betting";
  const msLeft = Math.max(0, (state?.round.bettingEndsAt ?? live.now) - live.now);
  const roundId = { current: state?.round.roundNo ?? 0 };
  const personal = useMemo(() => state?.myBets.filter((bet) => bet.status !== "cancelled") ?? [], [state]);
  const bets = useMemo(() => personal.reduce<Bets>((sum, bet) => {
    if (bet.option in sum) sum[bet.option as BetKey] += bet.amount;
    return sum;
  }, { ...EMPTY_BETS }), [personal]);
  const round = useMemo<RoundResult | null>(() => {
    const result = state?.round.result;
    if (!result) return null;
    const stakes = (Object.keys(bets) as BetKey[]).filter((key) => bets[key] > 0 && !personal.some(bet => bet.poolPending)).map((key) => {
      const profit = personal.filter((bet) => bet.option === key).reduce((sum, bet) => sum + bet.payout - bet.amount, 0);
      return { key, amount: bets[key], won: profit > 0, profit };
    });
    const net = stakes.reduce((sum, stake) => sum + stake.profit, 0);
    return { ...result, id: state.round.roundNo, stakes, bet: totalStake(bets), net, graded: !stakes.length ? "watched" : net > 0 ? "win" : net < 0 ? "loss" : "push", forced: "random" };
  }, [state, personal, bets]);
  const elapsed = state?.round.phase === "result" ? Math.max(0, live.now - state.round.resultAt) : 0;
  const revealed = round ? Math.floor(elapsed / 300) + 1 : 0;
  const revealP = round ? Math.min(round.player.length, Math.ceil(revealed / 2)) : 0;
  const revealB = round ? Math.min(round.banker.length, Math.floor(revealed / 2)) : 0;
  const history: HistoryEntry[] = (state?.history ?? []).slice().reverse().map(({ roundNo, result }) => ({ ...result, id: roundNo }));
  const feed: FeedItem[] = history.slice(-8).reverse().map((hand) => ({ ...hand, net: 0, graded: "watched" }));
  const seats: SeatBet[] = (state?.bets ?? []).filter((bet) => bet.status !== "cancelled").map((bet) => ({
    id: bet.id, name: bet.name, side: bet.option as BetKey, amount: bet.amount,
    won: bet.status === "pending" ? null : bet.payout > bet.amount, profit: bet.status === "pending" ? 0 : bet.payout - bet.amount,
  }));
  const shaking = phase === "result" && round?.graded === "loss" && elapsed < 560;

  useEffect(() => {
    sound.setMuted(muted);
  }, [muted]);

  const pushToast = useCallback((text: string, tone: "win" | "lose" | "info") => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev.slice(-3), { id, text, tone }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2600);
  }, []);

  const placeBet = useCallback(async (key: BetKey, amount = chip) => {
    sound.unlock();
    const reply = await live.place(key, amount);
    if (!("error" in reply)) sound.chip();
  }, [live, chip]);

  const clearBets = useCallback(() => {
    if (!state || live.busy) return;
    void live.cancel(state.round.roundNo + (state.round.phase === "betting" && live.now < state.round.bettingEndsAt ? 0 : 1));
  }, [state, live]);

  const rebet = useCallback(async () => {
    if (!state || live.busy || !previous.current) return;
    if (state.round.phase !== "betting" || live.now >= state.round.bettingEndsAt) {
      pushToast("Betting is closed. Wait for the next round to begin.", "info");
      return;
    }
    const repeat = { ...previous.current };
    const current = state.round.phase === "betting" && live.now < state.round.bettingEndsAt;
    const target = state.round.roundNo + (current ? 0 : 1);
    if ((current ? state.myBets : state.myQueuedBets).some((bet) => bet.status === "pending")) {
      const cleared = await live.cancel(target);
      if ("error" in cleared) return;
    }
    for (const key of Object.keys(repeat) as BetKey[]) {
      if (repeat[key] > 0) {
        const reply = await live.place(key, repeat[key]);
        if ("error" in reply) break;
      }
    }
  }, [state, live, pushToast]);

  const clearSpot = async (key: BetKey) => {
    if (!state || live.busy) return;
    const current = state.round.phase === "betting" && live.now < state.round.bettingEndsAt;
    const pending = (current ? state.myBets : state.myQueuedBets).filter((bet) => bet.option === key && bet.status === "pending");
    for (const bet of pending) {
      const reply = await live.cancel(bet.roundNo, bet.id);
      if ("error" in reply) break;
    }
  };

  const dealNow = useCallback(() => { void live.refresh(); }, [live]);
  const reloadBank = () => { window.location.assign("/player/deposit"); };
  const resetSession = () => { setStats(EMPTY_STATS); };

  useEffect(() => {
    if (totalStake(bets) > 0) previous.current = bets;
    if (!state || state.round.phase !== "result" || !round || !round.stakes.length || notified.current === state.round.roundNo) return;
    notified.current = state.round.roundNo;
    setStats((s) => applyRound(s, round));
    if (round.graded === "win") {
      pushToast(`${round.winner.toUpperCase()} ${round.pTotal}-${round.bTotal} · you win ${money(round.net)}`, "win");
      sound.win();
    } else if (round.graded === "loss") {
      pushToast("No win", "lose");
      sound.lose();
    } else {
      pushToast("Tie — main bets pushed", "info");
      sound.push();
    }
  }, [state, bets, round, pushToast]);

  useEffect(() => {
    if (!auto || !state || state.round.phase !== "betting" || autoRound.current === state.round.roundNo || !previous.current) return;
    autoRound.current = state.round.roundNo;
    if (personal.length || live.busy || live.now >= state.round.bettingEndsAt) return;
    const repeat = { ...previous.current };
    void (async () => {
      for (const key of Object.keys(repeat) as BetKey[]) {
        if (repeat[key] > 0) {
          const reply = await live.place(key, repeat[key]);
          if ("error" in reply) {
            setAuto(false);
            break;
          }
        }
      }
    })();
  }, [auto, state, personal.length, live]);

  /* --------------------------------------------------------- keyboard   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (showRules) {
        if (e.key === "Escape") setShowRules(false);
        return;
      }
      const k = e.key.toLowerCase();
      if (k >= "1" && k <= "5") {
        setChip(CHIP_VALUES[Number(k) - 1]);
        sound.flip();
      } else if (k === "p") placeBet("player");
      else if (k === "b") placeBet("banker");
      else if (k === "t") placeBet("tie");
      else if (k === "u") placeBet("playerPair");
      else if (k === "i") placeBet("bankerPair");
      else if (k === "c") clearBets();
      else if (k === "r") rebet();
      else if (k === "a") setAuto((v) => !v);
      else if (k === "m") setMuted((v) => !v);
      else if (e.key === "Enter") dealNow();
      else if (e.key === "?") setShowRules(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showRules, placeBet, clearBets, rebet, dealNow]);

  /* ------------------------------------------------------------ derived */
  const bet = totalStake(bets);
  const locked = !state || phase !== "betting" || live.now >= state.round.bettingEndsAt || live.busy;
  const winning = phase === "result" && round?.graded === "win";
  const losing = phase === "result" && round?.graded === "loss";
  const showResult = phase === "result";

  const profitBy = useMemo(() => {
    const map = new Map<BetKey, { amount: number; profit: number; won: boolean }>();
    round?.stakes.forEach((s) => map.set(s.key, s));
    return map;
  }, [round]);

  const seatBySpot = useMemo(() => {
    const map = new Map<BetKey, { amount: number; seats: SeatBet[] }>();
    seats.forEach((s) => {
      const cur = map.get(s.side) ?? { amount: 0, seats: [] };
      cur.amount += s.amount;
      cur.seats.push(s);
      map.set(s.side, cur);
    });
    return map;
  }, [seats]);
  const seatWins = useMemo(
    () => seats.filter((s) => s.profit > 0).sort((a, b) => b.profit - a.profit).slice(0, 3),
    [seats],
  );
  const onLayout = useMemo(() => seats.reduce((sum, s) => sum + s.amount, 0), [seats]);

  const spotState = (key: BetKey): "win" | "lose" | "push" | null => {
    if (!showResult || !round || round.graded === "watched") return null;
    const s = profitBy.get(key);
    if (!s) return null;
    if (s.profit > 0) return "win";
    if (s.profit < 0) return "lose";
    return "push";
  };

  const winnerLabel =
    round?.winner === "player" ? "PLAYER WINS" : round?.winner === "banker" ? "BANKER WINS" : "TIE — NO WINNER";

  const handsIntoShoe = roundId.current % 78;
  const shoePct = Math.round((handsIntoShoe / 78) * 100);

  const broke = balance + bet < 1;

  return (
    <div className="speed-baccarat-game w-full h-full overflow-hidden flex flex-col px-1 sm:px-2 md:px-3">
    <div className="shrink-0 max-h-28 overflow-y-auto">
      <LiveMultiplayerBets state={live.state} error={live.error} labels={Object.fromEntries(Object.values(BET_META).map((spot) => [spot.key, spot.label]))} />
      {!!state?.myQueuedBets.some((bet) => bet.status === "pending") && <button onClick={() => void live.cancel(state.round.roundNo + 1)} disabled={live.busy} className="text-xs text-amber-300">Cancel next-round bets</button>}
    </div>
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden justify-between">
      {/* ------------------------------------------------------------ top bar */}
      <header className="relative z-30 shrink-0 border-b border-[rgba(231,200,119,.18)] bg-[linear-gradient(180deg,rgba(4,15,12,.96),rgba(3,10,9,.82))] backdrop-blur">
        <div className="mx-auto flex flex-wrap w-full max-w-[1500px] items-center gap-3 px-2 py-1.5 sm:px-4">
          <div className="flex items-center gap-2">
            <span className="relative grid h-7 w-7 sm:h-9 sm:w-9 place-items-center rounded-md bg-[linear-gradient(150deg,#f7e6ae,#8a6415)] text-[#1a1204] shadow-[0_6px_18px_-8px_rgba(231,200,119,.9)]">
              <IconSpade className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
            <div className="leading-none">
              <h1 className="font-display gold-text text-[15px] font-black uppercase sm:text-[18px]" style={{ fontWeight: 900 }}>
                Speed Baccarat
              </h1>
              <p className="font-num mt-0.5 text-[8px] uppercase tracking-[0.24em] text-white/40">
                Live casino · Table 3
              </p>
            </div>
          </div>

          <span className="ml-1 hidden items-center gap-1.5 rounded-full border border-[rgba(255,90,79,.45)] bg-[rgba(255,90,79,.1)] px-2 py-[2px] sm:inline-flex">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#ff5a4f]" />
            <span className="font-num text-[8.5px] font-bold uppercase tracking-[0.2em] text-[#ffb1ac]">live now</span>
          </span>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <div className="hidden items-center gap-3 rounded-md border border-white/8 bg-black/40 px-3 py-1 lg:flex">
              <span className="font-num text-[9px] uppercase tracking-[0.16em] text-white/40">
                min <span className="text-white/75">Rs. 1</span>
              </span>
              <span className="h-3 w-px bg-white/10" />
              <span className="font-num text-[9px] uppercase tracking-[0.16em] text-white/40">
                round <span className="text-white/75">#{roundId.current || 1}</span>
              </span>
            </div>

            <div className="flex items-center gap-1 rounded-md border border-[rgba(231,200,119,.28)] bg-black/45 px-2 py-1">
              <IconDiamond className="h-3 w-3 text-[#e7c877]" />
              <span className="font-num text-[8px] uppercase tracking-[0.16em] text-white/45 hidden sm:inline">balance</span>
              <span className="font-num text-[12px] sm:text-[13px] font-bold text-[#ffe9a8]">{money(balance)}</span>
            </div>

            <button
              type="button"
              onClick={() => {
                setMuted((v) => !v);
                sound.unlock();
              }}
              title={muted ? "Unmute table audio (M)" : "Mute table audio (M)"}
              className="grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-md border border-white/10 bg-black/40 text-white/60 transition hover:border-[rgba(231,200,119,.55)] hover:text-[#ffe9a8]"
            >
              <IconSound className="h-3.5 w-3.5" muted={muted} />
            </button>
            <button
              type="button"
              onClick={() => setShowRules(true)}
              className="flex items-center gap-1 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-white/60 transition hover:border-[rgba(231,200,119,.55)] hover:text-[#ffe9a8]"
            >
              <IconInfo className="h-3.5 w-3.5" />
              <span className="font-num text-[8.5px] uppercase tracking-[0.16em]">rules</span>
            </button>
          </div>
        </div>
        <div className="hairline" />
      </header>

      {/* mobile navigation tabs */}
      <div className="flex xl:hidden w-full items-center justify-center gap-1.5 px-2 pt-1 shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab("table")}
          className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition ${
            mobileTab === "table"
              ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
              : "bg-black/50 text-white/50 border border-white/5"
          }`}
        >
          Baccarat Table
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("roadmap")}
          className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition ${
            mobileTab === "roadmap"
              ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
              : "bg-black/50 text-white/50 border border-white/5"
          }`}
        >
          Roadmap & Stats
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("dealer")}
          className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition ${
            mobileTab === "dealer"
              ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
              : "bg-black/50 text-white/50 border border-white/5"
          }`}
        >
          Dealer Feed
        </button>
      </div>

      {/* --------------------------------------------------------------- main */}
      <main className="mx-auto grid w-full max-w-[1500px] flex-1 min-h-0 gap-2 px-1 py-1 sm:px-3 grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(240px,270px)_minmax(0,1fr)_minmax(280px,310px)] overflow-hidden">
        {/* left rail */}
        <div className={`order-2 flex-col gap-2 lg:order-1 overflow-y-auto ${mobileTab === "dealer" ? "flex" : "hidden xl:flex"}`}>
          <DealerFeed round={showResult || phase === "dealing" ? round : null} phaseLabel={PHASE_COPY[phase]} betting={phase === "betting"} />

          <section className="gold-rim rounded-xl p-3">
            <h2 className="font-display mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#e7c877]">{personalTable ? "Personal live table" : "Shared live table"}</h2>
            <div className="grid grid-cols-3 gap-1 text-center text-[9px] uppercase text-[#ffe9a8]">
              <span>Live rounds</span><span>Real wagers</span><span>{personalTable ? "Your result" : "Shared result"}</span>
            </div>
            <p className="font-num mt-2 text-[8.5px] leading-[1.6] text-white/35">
              Everyone watches the same server-dealt hand. Bets after the cutoff reserve your stake for the next round.
            </p>
            <button
              type="button"
              onClick={() => {
                setAuto((v) => !v);
                sound.flip();
              }}
              className={`font-num mt-2.5 flex w-full items-center justify-between rounded-[5px] border px-2.5 py-2 text-[9.5px] uppercase tracking-[0.16em] transition ${
                auto ? "border-[rgba(143,240,182,.6)] bg-[rgba(15,174,106,.14)] text-[#8ff0b6]" : "border-white/10 text-white/45 hover:text-white/75"
              }`}
            >
              <span>auto rebet</span>
              <span className={`h-2.5 w-2.5 rounded-full ${auto ? "bg-[#8ff0b6] shadow-[0_0_10px_#8ff0b6]" : "bg-white/20"}`} />
            </button>
          </section>

          <section className="gold-rim flex min-h-0 flex-col rounded-xl p-3">
            <h2 className="font-display mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.22em] text-[#e7c877]">
              Table feed
              <span className="font-num text-[8.5px] tracking-[0.14em] text-white/35">last 8 hands</span>
            </h2>
            {feed.length === 0 ? (
              <p className="font-num text-[10px] leading-relaxed text-white/35">
                No hands recorded yet. Place a bet to start the shoe — or let it run and watch the road.
              </p>
            ) : (
              <ul className="thin-scroll max-h-[188px] space-y-1 overflow-auto pr-1">
                {feed.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center gap-2 rounded-[5px] border border-white/5 bg-[rgba(255,255,255,.025)] px-2 py-1.5"
                  >
                    <span className="font-num text-[8px] text-white/25">#{f.id}</span>
                    <span
                      className="font-display text-[9.5px] font-bold uppercase tracking-[0.12em]"
                      style={{
                        color:
                          f.winner === "player" ? "#7db3ff" : f.winner === "banker" ? "#ff8b8f" : "#5ce6a8",
                      }}
                    >
                      {f.winner} {f.pTotal}-{f.bTotal}
                    </span>
                    <span
                      className={`font-num ml-auto text-[10px] font-bold ${
                        f.net > 0 ? "text-[#8ff0b6]" : f.net < 0 ? "text-[#ff9a94]" : "text-white/35"
                      }`}
                    >
                      {f.graded === "watched" ? "— no action" : f.net < 0 ? "No win" : `${f.net > 0 ? "+" : ""}${money(f.net)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ------------------------------------------------------ the table */}
        <div className={`order-1 lg:order-2 flex-1 min-h-0 flex-col overflow-y-auto ${mobileTab === "table" ? "flex" : "hidden xl:flex"} ${shaking ? "shake" : ""}`}>
          <section className="baccarat-table gold-rim felt vignette relative flex flex-col overflow-hidden rounded-2xl p-2 sm:p-4 flex-1 shrink-0">
            <Confetti trigger={winning && round ? round.id : 0} tone="gold" />

            {/* toasts */}
            <div className="pointer-events-none absolute right-3 top-3 z-40 flex w-[220px] flex-col items-end gap-1.5">
              {toasts.map((t) => (
                <div
                  key={t.id}
                  className={`toast-life rounded-md border px-2.5 py-1.5 text-right font-num text-[10px] shadow-xl backdrop-blur ${
                    t.tone === "win"
                      ? "border-[rgba(143,240,182,.5)] bg-[rgba(6,40,28,.92)] text-[#8ff0b6]"
                      : t.tone === "lose"
                        ? "border-[rgba(255,154,148,.45)] bg-[rgba(48,8,12,.92)] text-[#ff9a94]"
                        : "border-[rgba(231,200,119,.4)] bg-[rgba(10,20,18,.92)] text-[#ffe9a8]"
                  }`}
                >
                  {t.text}
                </div>
              ))}
            </div>

            {/* header strip + countdown bar */}
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <IconClub className="h-3.5 w-3.5 text-[rgba(231,200,119,.65)]" />
                <span className="font-display text-[11px] font-bold uppercase tracking-[0.3em] text-[rgba(255,240,194,.75)]">
                  Speed baccarat
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2 py-[3px] sm:inline-flex">
                  <span className="font-num text-[8px] uppercase tracking-[0.18em] text-white/35">shoe</span>
                  <span className="relative block h-[3px] w-12 overflow-hidden rounded-full bg-white/10">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,#b58d3a,#ffe9a8)]"
                      style={{ width: `${shoePct}%` }}
                    />
                  </span>
                  <span className="font-num text-[9px] text-white/55">{handsIntoShoe}/78</span>
                </span>
                <span
                  className={`font-num rounded-full border px-2.5 py-[3px] text-[9px] uppercase tracking-[0.2em] ${
                    phase === "dealing"
                      ? "border-[rgba(255,90,79,.6)] bg-[rgba(255,90,79,.12)] text-[#ffb1ac]"
                      : phase === "betting"
                        ? "border-[rgba(231,200,119,.5)] bg-[rgba(231,200,119,.1)] text-[#ffe9a8]"
                        : "border-white/12 bg-black/40 text-white/55"
                  }`}
                >
                  {PHASE_COPY[phase]}
                </span>
              </div>
            </div>

            <div className="relative z-10 mt-2 h-[3px] w-full overflow-hidden rounded-full bg-black/50">
              <div
                className="h-full rounded-full transition-[width,background] duration-100"
                style={{
                  width: phase === "betting" ? `${Math.min(100, (msLeft / BET_MS) * 100)}%` : "100%",
                  background:
                    phase === "betting"
                      ? msLeft <= 4000
                        ? "linear-gradient(90deg,#ff5a4f,#ffb1ac)"
                        : "linear-gradient(90deg,#e7c877,#fff6d0)"
                      : "linear-gradient(90deg,rgba(231,200,119,.25),rgba(231,200,119,.25))",
                }}
              />
            </div>

            {/* hands + centre column */}
            <div className="baccarat-hands relative z-10 mt-3 grid flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-1 sm:gap-3">
              {(
                [
                  { side: "player" as const, cards: round?.player ?? [], revealed: revealP, total: round?.pTotal ?? 0 },
                  { side: "banker" as const, cards: round?.banker ?? [], revealed: revealB, total: round?.bTotal ?? 0 },
                ] as const
              ).map((zone, zi) => {
                  const isWinner = Boolean(showResult && round?.winner === zone.side);
                  const isLoser = Boolean(showResult && round && round.winner !== "tie" && round.winner !== zone.side);
                const color = zone.side === "player" ? "#3d8bff" : "#ff4d54";
                const pairHit = zone.side === "player" ? round?.playerPair : round?.bankerPair;
                return (
                  <div
                    key={zone.side}
                    className={`relative flex flex-col items-center justify-between gap-2 rounded-xl border p-1 sm:p-2.5 min-w-0 transition ${
                      isWinner ? "winner-glow" : ""
                    } ${isLoser ? "opacity-80" : ""}`}
                    style={{
                      borderColor: isWinner ? `${color}` : "rgba(255,255,255,.07)",
                      background: isWinner
                        ? `radial-gradient(70% 70% at 50% 40%, ${color}33, rgba(0,0,0,.28))`
                        : "linear-gradient(180deg, rgba(0,0,0,.22), rgba(0,0,0,.34))",
                      order: zi === 0 ? 1 : 3,
                    }}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span
                        className="font-display text-[9px] font-bold uppercase tracking-[0.1em] sm:text-[10px] sm:tracking-[0.28em]"
                        style={{ color: isWinner ? "#fff6d0" : "rgba(255,255,255,.45)" }}
                      >
                        {zone.side}
                      </span>
                      {pairHit && (
                        <span className="font-num rounded-full border border-[rgba(255,240,194,.5)] bg-[rgba(255,240,194,.14)] px-1.5 py-[1px] text-[8px] uppercase tracking-[0.14em] text-[#ffe9a8]">
                          pair
                        </span>
                      )}
                      <span
                        className={`font-num total-pop grid h-7 min-w-[28px] place-items-center rounded-md px-1.5 text-[15px] font-bold ${
                          zone.revealed >= 2 ? "" : "opacity-25"
                        }`}
                        style={{
                          background: zone.revealed >= 2 ? `linear-gradient(160deg,${color}cc,${color}55)` : "rgba(255,255,255,.06)",
                          color: "#fff8e6",
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,.25)",
                        }}
                      >
                        {zone.revealed >= 2 ? zone.total : "–"}
                      </span>
                    </div>

                    <div className="flex min-h-[72px] w-full items-center justify-center sm:min-h-[128px]">
                      {zone.cards.length > 0 ? (
                        <Hand cards={zone.cards} revealed={zone.revealed} dim={isLoser} />
                      ) : (
                        <div className="flex items-center gap-1 opacity-45">
                          <CardSlot />
                          <CardSlot />
                        </div>
                      )}
                    </div>

                    <div className="font-num w-full text-center text-[8px] uppercase tracking-[0.2em] text-white/25">
                      {zone.side === "player" ? "1 : 1 · pushes on tie" : "1.95 : 1 · 5 % commission"}
                    </div>
                  </div>
                );
              })}

              {/* centre column */}
              <div
                className="baccarat-center flex w-[76px] flex-col items-center gap-2 self-stretch rounded-xl border border-[rgba(231,200,119,.14)] bg-[rgba(2,12,10,.55)] p-1 sm:p-2 sm:w-[124px] md:w-[148px]"
                style={{ order: 2 }}
              >
                <TimerRing seconds={msLeft / 1000} total={BET_MS / 1000} locked={locked} />
                <div className="w-full rounded-md border border-white/8 bg-black/45 px-2 py-1.5 text-center">
                  <div className="font-num text-[8px] uppercase tracking-[0.2em] text-white/40">total bet</div>
                  <div className="font-num text-[15px] font-bold text-[#ffe9a8]">{money(bet)}</div>
                </div>
                <div
                  className={`w-full rounded-md border px-2 py-1.5 text-center transition ${
                    winning
                      ? "border-[rgba(143,240,182,.55)] bg-[rgba(15,174,106,.16)]"
                      : losing
                        ? "border-[rgba(255,154,148,.5)] bg-[rgba(216,32,47,.14)]"
                        : "border-white/8 bg-black/35"
                  }`}
                >
                  <div className="font-num text-[8px] uppercase tracking-[0.2em] text-white/40">
                    {round && round.graded !== "watched" ? (winning ? "you win" : losing ? "No win" : "push") : "no action"}
                  </div>
                  <div
                    className={`font-num text-[16px] font-bold ${
                      winning ? "text-[#8ff0b6]" : losing ? "text-[#ff9a94]" : "text-white/50"
                    }`}
                  >
                    {round && round.graded !== "watched" ? (round.net < 0 ? "No win" : `${round.net > 0 ? "+" : ""}${money(round.net)}`) : money(0)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={dealNow}
                  disabled={phase !== "betting"}
                  className="font-num flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-400 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 px-1 py-2 text-[9px] font-black uppercase tracking-[0.04em] sm:px-3 sm:text-[10px] sm:tracking-[0.18em] text-slate-950 shadow-lg shadow-amber-500/30 transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:border-white/8 disabled:bg-slate-800 disabled:text-white/25 disabled:shadow-none"
                >
                  <IconBolt className="h-3.5 w-3.5" />
                  bets placed
                </button>
              </div>
            </div>

            {/* result banner */}
            {showResult && round && (
              <div className="pointer-events-none absolute inset-x-0 top-[38%] z-30 flex flex-col items-center">
                <div className="banner-in flex flex-col items-center">
                  <div className="relative overflow-hidden rounded-lg border border-[rgba(231,200,119,.55)] bg-[rgba(3,14,11,.86)] px-6 py-2.5 backdrop-blur-sm sheen">
                    <span
                      className="font-display text-[26px] font-black uppercase leading-none tracking-[0.14em] sm:text-[34px]"
                      style={{
                        color:
                          round.winner === "player" ? "#7db3ff" : round.winner === "banker" ? "#ff8b8f" : "#5ce6a8",
                        textShadow: "0 4px 26px rgba(0,0,0,.85)",
                        fontWeight: 900,
                      }}
                    >
                      {winnerLabel}
                    </span>
                    <div className="font-num mt-1.5 text-center text-[11px] tracking-[0.18em] text-white/55">
                      {round.winner === "tie" ? `${round.pTotal} — ${round.bTotal} · ties pay ${personalTable ? "1" : "8"} : 1` : `PLAYER ${round.pTotal} — ${round.bTotal} BANKER`}
                    </div>
                  </div>
                  {round.graded !== "watched" && (
                    <div
                      className={`font-num mt-2 rounded-full border px-3.5 py-1 text-[12px] font-bold shadow-lg ${
                        winning
                          ? "border-[rgba(143,240,182,.65)] bg-[rgba(6,40,28,.92)] text-[#8ff0b6]"
                          : losing
                            ? "border-[rgba(255,154,148,.6)] bg-[rgba(48,8,12,.92)] text-[#ff9a94]"
                            : "border-white/25 bg-black/70 text-white/65"
                      }`}
                    >
                      {winning ? `+${money(round.net)}` : losing ? "No win" : "bets returned"}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* no more bets band */}
            {phase === "dealing" && (
              <div className="pointer-events-none absolute inset-x-0 top-1/2 z-30 -translate-y-1/2">
                <div className="no-bets border-y border-[rgba(255,90,79,.5)] bg-[rgba(70,4,10,.55)] py-2 text-center backdrop-blur-[2px]">
                  <span className="font-display text-[15px] font-bold uppercase text-[#ffd9d6] sm:text-[18px]">no more bets</span>
                </div>
              </div>
            )}

            {/* betting board */}
            <div className="relative z-10 mt-3 rounded-xl border border-[rgba(231,200,119,.14)] bg-[rgba(0,0,0,.28)] p-2.5 sm:p-3">
              <div className="flex flex-wrap items-end justify-center gap-3 sm:gap-6">
                {MAIN_SPOTS.map((key) => {
                  const s = profitBy.get(key);
                  return (
                    <div key={key} className="relative">
                      {showResult && s && (
                        <span
                          className={`float-up font-num pointer-events-none absolute left-1/2 top-1 z-40 whitespace-nowrap rounded-full border px-2 py-[2px] text-[11px] font-bold shadow-lg ${
                            s.profit > 0
                              ? "border-[rgba(143,240,182,.6)] bg-[rgba(6,40,28,.95)] text-[#8ff0b6]"
                              : s.profit < 0
                                ? "border-[rgba(255,154,148,.55)] bg-[rgba(48,8,12,.95)] text-[#ff9a94]"
                                : "border-white/25 bg-black/80 text-white/70"
                          }`}
                        >
                          {s.profit > 0 ? `+${money(s.profit)}` : s.profit < 0 ? "No win" : "push"}
                        </span>
                      )}
                      <BetSpot
                        meta={BET_META[key]}
                        amount={bets[key]}
                        disabled={locked}
                        state={spotState(key)}
                        onClick={() => placeBet(key)}
                        onClear={() => void clearSpot(key)}
                      />
                      {seatBySpot.get(key) && (
                        <div className="mt-1 flex items-center justify-center gap-1">
                          {seatBySpot.get(key)!.seats.slice(0, 5).map((s) => (
                            <span
                              key={s.id}
                              title={`${s.name} · ${money(s.amount)}`}
                              className="h-1.5 w-1.5 rounded-full transition-colors"
                              style={{
                                background:
                                  s.won === true
                                    ? "#8ff0b6"
                                    : s.won === false
                                      ? "rgba(255,154,148,.65)"
                                      : "rgba(231,200,119,.55)",
                              }}
                            />
                          ))}
                          <span className="font-num text-[8px] tracking-[0.08em] text-white/30">
                            {money(seatBySpot.get(key)!.amount)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-2.5 flex flex-wrap items-end justify-center gap-4 border-t border-white/5 pt-2.5 sm:gap-8">
                {SIDE_SPOTS.map((key) => {
                  const s = profitBy.get(key);
                  return (
                    <div key={key} className="relative">
                      {showResult && s && (
                        <span
                          className={`float-up font-num pointer-events-none absolute left-1/2 top-0 z-40 whitespace-nowrap rounded-full border px-2 py-[1px] text-[10px] font-bold ${
                            s.profit > 0
                              ? "border-[rgba(143,240,182,.6)] bg-[rgba(6,40,28,.95)] text-[#8ff0b6]"
                              : "border-[rgba(255,154,148,.5)] bg-[rgba(48,8,12,.95)] text-[#ff9a94]"
                          }`}
                        >
                          {s.profit > 0 ? `+${money(s.profit)}` : s.profit < 0 ? "No win" : money(s.profit)}
                        </span>
                      )}
                      <BetSpot
                        meta={BET_META[key]}
                        amount={bets[key]}
                        disabled={locked}
                        size="sm"
                        state={spotState(key)}
                        onClick={() => placeBet(key)}
                        onClear={() => void clearSpot(key)}
                      />
                    </div>
                  );
                })}
                <div className="hidden max-w-[190px] pb-1 text-left sm:block">
                  <div className="font-num text-[8.5px] uppercase tracking-[0.18em] text-[rgba(231,200,119,.7)]">side bets</div>
                  <p className="font-num mt-1 text-[9px] leading-[1.6] text-white/35">
                    Any pair in the first two cards of that hand pays {personalTable ? "1" : "11"} : 1. Side bets lose when that hand has no pair.
                  </p>
                </div>
              </div>
            </div>

            {/* other seats */}
            <div className="relative z-10 mt-2 flex items-center gap-2 overflow-hidden rounded-lg border border-white/5 bg-[rgba(0,0,0,.26)] px-2.5 py-1.5">
              <span className="font-num shrink-0 text-[8px] uppercase tracking-[0.2em] text-[rgba(231,200,119,.7)]">
                table
              </span>
              <span className="font-num truncate text-[9.5px] tracking-[0.04em] text-white/40">
                {seats.length} bet{seats.length === 1 ? "" : "s"} in hand · {money(onLayout)} on layout
              </span>
              {seatWins.length > 0 && (
                <span className="font-num ml-auto hidden items-center gap-2.5 text-[9.5px] text-white/45 sm:flex">
                  {seatWins.map((s) => (
                    <span key={s.id} className="whitespace-nowrap">
                      {s.name} <span className="font-bold text-[#8ff0b6]">+{money(s.profit)}</span>
                    </span>
                  ))}
                </span>
              )}
            </div>

            {/* chip rail */}
            <div className="relative z-10 mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[rgba(231,200,119,.14)] bg-[rgba(2,12,10,.6)] px-2.5 py-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {CHIP_VALUES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setChip(v);
                      sound.flip();
                    }}
                    title={`Select ${money(v)} chip (key ${CHIP_VALUES.indexOf(v) + 1})`}
                    className={`relative grid place-items-center rounded-full transition ${
                      chip === v ? "-translate-y-1.5 scale-110" : "opacity-70 hover:-translate-y-0.5 hover:opacity-100"
                    }`}
                    style={{
                      filter: chip === v ? "drop-shadow(0 6px 14px rgba(255,233,168,.4))" : "drop-shadow(0 3px 6px rgba(0,0,0,.6))",
                    }}
                  >
                    <Chip value={v} size={40} />
                    {chip === v && <span className="absolute -bottom-1.5 h-[3px] w-6 rounded-full bg-[#ffe9a8]" />}
                  </button>
                ))}
                <BetAmountInput value={chip} onChange={setChip} disabled={locked} />
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-num hidden text-[8.5px] uppercase tracking-[0.18em] text-white/30 md:inline">
                  selected {money(chip)}
                </span>
                <button
                  type="button"
                  onClick={rebet}
                  disabled={locked}
                  className="font-num flex items-center gap-1.5 rounded-lg border border-cyan-400/50 bg-gradient-to-r from-cyan-600 to-teal-600 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white shadow-md shadow-cyan-500/20 transition hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:border-white/10 disabled:bg-slate-800"
                >
                  <IconRepeat className="h-3.5 w-3.5" /> rebet
                </button>
                <button
                  type="button"
                  onClick={clearBets}
                  disabled={locked || bet <= 0}
                  className="font-num flex items-center gap-1.5 rounded-lg border border-rose-400/50 bg-gradient-to-r from-rose-600 to-red-600 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white shadow-md shadow-rose-500/20 transition hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:border-white/10 disabled:bg-slate-800"
                >
                  <IconClear className="h-3.5 w-3.5" /> clear
                </button>
                {broke && (
                  <button
                    type="button"
                    onClick={reloadBank}
                    className="font-num rounded-lg border border-emerald-400 bg-gradient-to-r from-emerald-600 to-teal-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white shadow-md shadow-emerald-500/30 transition hover:brightness-110 active:scale-95"
                  >
                    Deposit
                  </button>
                )}
              </div>
            </div>
          </section>

          <p className="font-num mt-1 text-center text-[8.5px] leading-tight tracking-[0.04em] text-white/30 hidden sm:block">
            Play-money simulation · keys: P player · B banker · T tie · U / I pairs · 1-6 chip · C clear · R rebet · A auto ·
            Enter refresh · M mute
          </p>
        </div>

        {/* right rail */}
        <div className={`order-3 col-span-1 flex-col gap-2 overflow-y-auto lg:col-span-2 lg:grid lg:grid-cols-2 lg:items-start xl:col-span-1 xl:flex xl:flex-col xl:items-stretch ${mobileTab === "roadmap" ? "flex" : "hidden xl:flex"}`}>
          <Roadmap history={history} />
          <StatsPanel stats={stats} balance={balance} initialBalance={START_BALANCE} onReset={resetSession} />
        </div>
      </main>

      {/* ------------------------------------------------------------ rules */}
      {showRules && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/78 p-4 backdrop-blur-sm" onClick={() => setShowRules(false)}>
          <div
            className="gold-rim max-h-[86vh] w-full max-w-[720px] overflow-auto rounded-2xl p-5 thin-scroll"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display gold-text text-[22px] font-black uppercase tracking-[0.12em]" style={{ fontWeight: 900 }}>
                  Speed Baccarat
                </h2>
                <p className="font-num mt-1 text-[10px] uppercase tracking-[0.2em] text-white/40">
                  8-deck shoe · no commission on 6 · side bets
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRules(false)}
                className="font-num rounded-md border border-white/15 px-2.5 py-1 text-[9px] uppercase tracking-[0.16em] text-white/50 hover:text-white"
              >
                close
              </button>
            </div>

            <div className="hairline my-4" />

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-[#e7c877]">Hand values</h3>
                <p className="font-num mt-1.5 text-[11px] leading-[1.8] text-white/55">
                  Tens and face cards count 0, Aces count 1, all others count their face value. Only the last digit of the total
                  matters, so 7 + 8 = 5. A first two-card total of 8 or 9 is a natural and nobody draws.
                </p>
                <h3 className="font-display mt-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[#e7c877]">Third-card rule</h3>
                <p className="font-num mt-1.5 text-[11px] leading-[1.8] text-white/55">
                  Player draws on 0-5 and stands on 6 or 7. Banker then plays its own tableau against the player’s third card,
                  which is why a Banker 3 still stands on a player 8.
                </p>
              </div>
              <div>
                <h3 className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-[#e7c877]">Paytable</h3>
                <ul className="mt-1.5 space-y-1">
                  {(Object.keys(BET_META) as BetKey[]).map((key) => (
                    <li key={key} className="flex items-center justify-between rounded-md bg-black/30 px-2.5 py-1.5">
                      <span className="font-num text-[10px] uppercase tracking-[0.14em] text-white/70">{BET_META[key].label}</span>
                      <span className="font-num text-[11px] font-bold text-[#ffe9a8]">
                        {BET_META[key].payout === 0.95 ? "1.95 : 1" : `${BET_META[key].payout} : 1`}
                      </span>
                    </li>
                  ))}
                </ul>
                <h3 className="font-display mt-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[#e7c877]">{personalTable ? "Personal rounds" : "Shared rounds"}</h3>
                <p className="font-num mt-1.5 text-[11px] leading-[1.8] text-white/55">
                  Every player receives the same server-dealt cards, countdown and result. Only confirmed bets affect your
                  wallet. Bets placed after the cutoff reserve a stake for the next hand; cancel them before that hand closes.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="border-t border-white/5 bg-black/40 py-2">
        <div className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center justify-between gap-2 px-4">
          <span className="font-num text-[9px] uppercase tracking-[0.18em] text-white/25">
            {personalTable ? "Personal live table · server-settled wagers · maximum 2x gross return" : "Shared live table · server-settled wagers · masked player names"}
          </span>
          <span className="font-num flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-white/25">
            <IconSpade className="h-3 w-3" /> synchronized multiplayer
          </span>
        </div>
      </footer>
    </div>
    </div>
  );
}
