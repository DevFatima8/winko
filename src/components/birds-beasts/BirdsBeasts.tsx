"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useMultiplayerGame } from "@/lib/useMultiplayerGame";
import { usePoolLifecycle } from "@/lib/walletSync";
import type { BirdsBeastsOutcome } from "@/lib/multiplayer-rules";
import type { MultiplayerBet, MultiplayerState } from "@/lib/multiplayer-types";
import {
  ANIMALS, MIN_BET, SLOT_COUNT, TIMES_UP_MS, WHEEL,
  evaluateBets, formatMoney, isBetKey, slotsCoveredBy, totalOf, type BetKey, type Bets,
} from "./lib/game-config";
import { useSounds } from "./hooks/useSounds";
import Wheel from "./Wheel";
import BetBoard from "./BetBoard";
import ChipRail from "./ChipRail";
import HistoryStrip from "./HistoryStrip";
import RulesModal from "./RulesModal";
import type { Phase, RoundRecord } from "./types";
import "./birds-beasts.css";

function selections(bets: MultiplayerBet[]): Bets {
  const result: Bets = {};
  for (const bet of bets) {
    if (bet.status !== "cancelled" && isBetKey(bet.option)) result[bet.option] = (result[bet.option] ?? 0) + bet.amount;
  }
  return result;
}

function record(round: number, outcome: BirdsBeastsOutcome, bets: Bets = {}): RoundRecord {
  return { round, slot: outcome.slot, animal: outcome.animal, ...evaluateBets(bets, outcome.slot), at: 0 };
}

const legacyKey = "wx:browser-active:birds-beasts:main";
const hasLegacyWager = () => Boolean(localStorage.getItem(legacyKey) || localStorage.getItem(`${legacyKey}:request`));
function subscribeLegacy(onChange: () => void) {
  window.addEventListener("wx:browser-resumed", onChange);
  window.addEventListener("wx:balance-update", onChange);
  return () => {
    window.removeEventListener("wx:browser-resumed", onChange);
    window.removeEventListener("wx:balance-update", onChange);
  };
}

export default function BirdsBeasts({ backHref = "/player" }: { backHref?: string }) {
  const legacy = usePoolLifecycle("birds-beasts");
  const sounds = useSounds();
  const [chip, setChip] = useState<number>(MIN_BET);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [lastBets, setLastBets] = useState<Bets>({});
  const [lastResult, setLastResult] = useState<RoundRecord | null>(null);
  const recovering = useSyncExternalStore(subscribeLegacy, hasLegacyWager, () => false);
  const reportedRound = useRef(0);
  const lastTick = useRef(-1);
  const previousSlot = useRef<number | null>(null);
  const onState = useCallback((snapshot: MultiplayerState<BirdsBeastsOutcome>) => {
    if (snapshot.round.phase !== "result" || !snapshot.round.result || reportedRound.current === snapshot.round.roundNo) return;
    reportedRound.current = snapshot.round.roundNo;
    const accepted = selections(snapshot.myBets);
    const settled = record(snapshot.round.roundNo, snapshot.round.result, accepted);
    setLastResult(settled);
    lastTick.current = -1;
    if (settled.totalBet > 0) {
      setLastBets(accepted);
      if (settled.net > 0) sounds.win();
      else sounds.lose();
    }
  }, [sounds]);
  const live = useMultiplayerGame<BirdsBeastsOutcome>("birds-beasts", onState);
  const state = live.state;
  const round = state?.round;
  const bets = useMemo(() => selections(state?.myBets ?? []), [state?.myBets]);
  const totalBet = totalOf(bets);
  const now = live.now;
  const phase: Phase = !round || round.phase === "betting" ? "betting"
    : round.phase === "result" ? "result"
      : now < round.bettingEndsAt + TIMES_UP_MS ? "closed" : "spinning";
  const secondsLeft = round ? Math.max(0, Math.ceil((round.bettingEndsAt - now) / 1000)) : 0;
  const outcome = round?.result;
  const progress = round ? Math.max(0, Math.min(1,
    (now - round.bettingEndsAt - TIMES_UP_MS) / (round.resultAt - round.bettingEndsAt - TIMES_UP_MS),
  )) : 0;
  const activeSlot = phase === "spinning" && outcome
    ? Math.floor((2 * SLOT_COUNT + outcome.slot) * (1 - Math.pow(1 - progress, 3))) % SLOT_COUNT : null;
  const result = phase === "result" && round && outcome ? record(round.roundNo, outcome, bets) : null;
  const history = (state?.history ?? []).map(item =>
    lastResult?.round === item.roundNo ? lastResult : record(item.roundNo, item.result),
  );
  const coveredSlots = useMemo(() => {
    const slots = new Set<number>();
    for (const key of Object.keys(bets)) if (isBetKey(key)) slotsCoveredBy(key).forEach(slot => slots.add(slot));
    return slots;
  }, [bets]);
  const locked = !state || phase !== "betting" || live.busy || recovering;
  const poolPending = state?.myBets.some(bet => bet.poolPending) ?? false;

  const recover = async () => {
    if (legacy.busy) return;
    try {
      await legacy.resume();
      const key = "wx:browser-active:birds-beasts:main";
      if (localStorage.getItem(key)) {
        const saved = JSON.parse(localStorage.getItem(`${key}:snapshot`) ?? "{}");
        if (!saved.bets || totalOf(saved.bets) <= 0) throw new Error("Saved animal stakes are missing. Contact support.");
        if (!await legacy.resolveServer({ bets: saved.bets })) return;
        legacy.releaseBalance();
      }
      if (localStorage.getItem(`${key}:request`)) throw new Error("Saved wager still needs confirmation. Retry after reconnecting.");
      setMessage("Saved wager confirmed. Join the next open round.");
      void live.refresh();
    } catch (error) {
      console.error("[birds saved wager]", error);
      setMessage(error instanceof Error ? error.message : "Saved wager recovery failed.");
    }
  };

  useEffect(() => {
    if (!round || phase !== "betting" || secondsLeft > 3 || secondsLeft <= 0 || lastTick.current === secondsLeft) return;
    lastTick.current = secondsLeft;
    sounds.countdown();
  }, [round, phase, secondsLeft, sounds]);

  useEffect(() => {
    if (activeSlot !== null && activeSlot !== previousSlot.current) sounds.tick();
    previousSlot.current = activeSlot;
  }, [activeSlot, sounds]);

  const placeBet = async (key: BetKey, amount = chip) => {
    sounds.unlock();
    if (locked) { setMessage("Betting is closed or a request is pending. Wait for the next open round."); return; }
    if (!Number.isFinite(amount) || amount < MIN_BET) { setMessage(`Minimum bet is Rs. ${MIN_BET}.`); return; }
    const reply = await live.place(key, amount);
    if ("ok" in reply) { sounds.chip(); setMessage("Bet accepted."); }
  };
  const cancel = async (lastOnly: boolean) => {
    if (locked || !state) return;
    const last = state.myBets.filter(bet => bet.status === "pending").at(-1);
    if (lastOnly && !last) return;
    await live.cancel(state.round.roundNo, lastOnly ? last?.id : undefined);
  };
  const repeat = async (source: Bets) => {
    if (locked) return;
    if (totalOf(source) > (state?.balance ?? 0)) { setMessage("Insufficient balance."); return; }
    for (const [key, amount] of Object.entries(source)) {
      if (!isBetKey(key) || !amount) continue;
      const reply = await live.place(key, amount);
      if ("error" in reply) { setMessage(reply.error); return; }
    }
    sounds.chip();
  };

  return (
    <main className="game-root relative flex h-full min-h-0 w-full flex-col overflow-y-auto bg-[#071a13] text-white lg:overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#041a12] px-3 py-2">
        <div className="flex items-center gap-2">
          <Link href={backHref} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-bold">Back</Link>
          <div><h1 className="font-display text-gold text-sm font-bold">Birds &amp; Beasts</h1>
            <p className="text-[10px] text-emerald-200">LIVE / Round #{round?.roundNo ?? "-"}</p></div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold text-yellow-200">Rs. {formatMoney(state?.balance ?? 0)}</span>
          <button type="button" onClick={() => sounds.setMuted(!sounds.muted)} className="icon-btn" aria-label="Toggle sound">{sounds.muted ? "Off" : "On"}</button>
          <button type="button" onClick={() => setRulesOpen(true)} className="icon-btn" aria-label="Rules">?</button>
        </div>
      </header>
      {(recovering || live.error || message) && <div role="status" className="shrink-0 bg-black/40 px-3 py-1 text-center text-xs text-yellow-200">
        {recovering ? "Confirm your saved wager before joining the live table." : live.error || message}
        {recovering && <button type="button" onClick={() => void recover()} className="ml-2 underline">Confirm saved wager</button>}
      </div>}
      {!state ? <div role="status" className="grid flex-1 place-content-center gap-3 text-center">
        <p>Connecting to the live table...</p>
        <button type="button" onClick={() => void live.refresh()} className="rounded bg-emerald-800 px-4 py-2">Retry connection</button>
      </div> : <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 pb-12 lg:flex-row lg:pb-2">
        <section className="flex shrink-0 flex-col items-center lg:min-h-0 lg:flex-1">
          <div className="relative flex h-[min(78vw,320px)] w-full items-center justify-center lg:min-h-0 lg:flex-1">
            <Wheel phase={phase} secondsLeft={secondsLeft} round={state.round.roundNo} activeSlot={activeSlot}
              resultSlot={result?.slot ?? null} result={result} showStartBanner={phase === "betting" && secondsLeft >= 9} coveredSlots={coveredSlots} />
          </div>
          <div className="w-full max-w-[480px] shrink-0"><HistoryStrip history={history} /></div>
        </section>
        <section className="mx-auto flex w-full max-w-[620px] flex-col gap-2 lg:min-h-0 lg:flex-1">
          <div className="flex shrink-0 justify-between text-xs text-emerald-200">
            <span>{phase === "betting" ? `Place your bets / ${secondsLeft}s` : "Betting closed / wait for next round"}</span>
            <span>Bet: Rs. {formatMoney(totalBet)}</span>
          </div>
          <div className="flex flex-1 flex-col justify-center lg:min-h-0">
            <BetBoard bets={bets} phase={phase} winningKeys={result?.winningKeys ?? []}
              resultAnimal={result?.animal ?? null} onBet={key => void placeBet(key)} />
          </div>
          <ChipRail selected={chip} locked={locked} canUndo={totalBet > 0} canClear={totalBet > 0}
            canRebet={totalOf(lastBets) > 0} canDouble={totalBet > 0} onSelect={setChip}
            onUndo={() => void cancel(true)} onClear={() => void cancel(false)}
            onRebet={() => void repeat(lastBets)} onDouble={() => void repeat(bets)} />
          <div className="panel grid shrink-0 grid-cols-3 gap-1 py-2 text-center text-xs">
            <div>Bet<br />Rs. {formatMoney(totalBet)}</div>
            <div>{poolPending ? "Provisional claim" : "Last return"}<br />Rs. {formatMoney(lastResult?.payout ?? 0)}</div>
            <div>Last result<br />{lastResult ? ANIMALS[WHEEL[lastResult.slot]].name : "-"}</div>
          </div>
        </section>
      </div>}
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </main>
  );
}
