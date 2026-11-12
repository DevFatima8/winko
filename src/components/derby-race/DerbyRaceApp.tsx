"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import { QueuedWager, useRoundQueue } from "../blast-off/useRoundQueue";
import { BET_PRESETS } from "@/lib/betPresets";
import DerbyTrack, { HorsePortrait } from "./derby-track";
import {
  HORSES,
  PAYOUT_MULTIPLIER,
  RACE_DURATION,
  STARTING_BALANCE,
  formatCoins,
  getRacePositions,
  makeRacePlan,
  settleRace,
  type RacePhase,
  type RacePlan,
  type RaceResult,
} from "./lib/derby";

const QUICK_STAKES: number[] = [...BET_PRESETS];

function Coin({ small = false }: { small?: boolean }) {
  return <span className={`coin-icon${small ? " coin-small" : ""}`} aria-hidden="true">C</span>;
}

function ArrowIcon() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M3 9h11m-5-5 5 5-5 5" /></svg>;
}

export default function HomePage() {
  const [balance, setBalance] = useGameBalance("derby-race", STARTING_BALANCE);
  const pool = usePoolLifecycle("derby-race");
  const [selectedHorseId, setSelectedHorseId] = useState(1);
  const [stake, setStake] = useState(BET_PRESETS[0]);
  const [round, setRound] = useState(7);
  const [phase, setPhase] = useState<RacePhase>("idle");
  const [countdown, setCountdown] = useState(10);
  const [progress, setProgress] = useState(0);
  const [plan, setPlan] = usePoolRoundState<RacePlan | null>("derby-race", "plan", null);
  const [lastResult, setLastResult] = useState<RaceResult | null>(null);
  const [history, setHistory] = useState<RaceResult[]>([]);
  const phaseRef = useRef<RacePhase>("idle");
  const roundRef = useRef(7);
  const planRef = useRef<RacePlan | null>(plan);
  const balanceRef = useRef(balance);
  const [bet, setBet] = usePoolRoundState<{ horseId: number; amount: number; round?: number } | null>("derby-race", "bet", null);
  const betRef = useRef(bet);
  const queue = useRoundQueue<{ horseId: number; amount: number }>();
  const settledRace = useRef<string | null>(null);
  const rulesRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { balanceRef.current = balance; }, [balance]);

  const selectedHorse = HORSES.find((horse) => horse.id === selectedHorseId) ?? HORSES[0];
  const potentialReturn = Number((stake * PAYOUT_MULTIPLIER).toFixed(2));
  const canBet = Number.isSafeInteger(stake) && stake >= 10 && stake <= balance;
  const canEdit = !bet && !queue.queued;
  const winner = lastResult ? HORSES.find((horse) => horse.id === lastResult.winningHorseId) : null;

  const selectHorse = useCallback((horseId: number) => {
    if (canEdit && HORSES.some((horse) => horse.id === horseId)) setSelectedHorseId(horseId);
  }, [canEdit]);

  const completeRace = useCallback(async (racePlan: RacePlan) => {
    if (phaseRef.current !== "racing" || planRef.current?.id !== racePlan.id || settledRace.current === racePlan.id) return;
    settledRace.current = racePlan.id;
    const result = settleRace(racePlan);
    if (betRef.current) {
      pool.releaseBalance();
      pool.announce();
      setHistory((current) => [result, ...current].slice(0, 5));
    }
    setLastResult(result);
    setProgress(1);
    setPhase("result");
    phaseRef.current = "result";
  }, [setBalance]);

  const reportProgress = useCallback((value: number) => setProgress(value), []);

  const acceptBet = useCallback(async (wager: { horseId: number; amount: number }) => {
    if (betRef.current) return;
    if (!Number.isSafeInteger(wager.amount) || wager.amount < 10 || wager.amount > balanceRef.current ||
      !HORSES.some((horse) => horse.id === wager.horseId)) {
      queue.setStatus("Bet rejected — invalid stake or insufficient balance");
      return;
    }
    const selection = { horseId: wager.horseId, round: roundRef.current };
    const acceptedWager = { ...wager, round: selection.round };
    pool.checkpoint({ bet: acceptedWager });
    if (!await pool.start(wager.amount, () => {}, selection)) return;
    betRef.current = acceptedWager;
    setBet(acceptedWager);
    const outcome = await pool.resolveServer(selection, { holdBalance: true });
    if (!outcome) { queue.setStatus("Waiting for server race confirmation"); return; }
    const next = outcome as RacePlan;
    pool.checkpoint({ bet: acceptedWager, plan: next });
    planRef.current = next;
    queue.setStatus("Bet accepted for this race");
  }, [queue.setStatus, setBalance]);

  const primaryAction = useCallback(() => {
    const wager = { horseId: selectedHorseId, amount: stake };
    if (phaseRef.current === "idle") acceptBet(wager);
    else queue.enqueue(wager);
  }, [acceptBet, queue.enqueue, selectedHorseId, stake]);

  useEffect(() => {
    if (phase === "idle") {
      let timer: ReturnType<typeof setTimeout>;
      let disposed = false;
      const startRace = async () => {
        if (disposed) return;
        if (pool.busy) {
          queue.setStatus("Waiting for wallet confirmation");
          timer = setTimeout(startRace, 200);
          return;
        }
        const wager = betRef.current;
        if (wager && !planRef.current) {
          const outcome = await pool.resolveServer({ horseId: wager.horseId, round: wager.round ?? roundRef.current }, { holdBalance: true });
          if (disposed) return;
          if (!outcome) {
            queue.setStatus("Waiting for server race confirmation");
            timer = setTimeout(startRace, 1000);
            return;
          }
          planRef.current = outcome as RacePlan;
          pool.checkpoint({ bet: wager, plan: planRef.current });
        }
        // Spectator plans use the existing race engine with zero financial stake.
        const horseId = wager?.horseId ?? HORSES[Math.floor(Math.random() * HORSES.length)].id;
        const next = planRef.current ?? makeRacePlan(horseId, wager?.amount ?? 0, roundRef.current);
        planRef.current = next;
        setPlan(next);
        setCountdown(0);
        phaseRef.current = "racing";
        setPhase("racing");
      };
      const ticks = Array.from({ length: 9 }, (_, i) =>
        setTimeout(() => setCountdown(9 - i), (i + 1) * 1000));
      timer = setTimeout(startRace, 10000);
      return () => { disposed = true; clearTimeout(timer); ticks.forEach(clearTimeout); };
    }
    if (phase === "racing") {
      const timer = window.setTimeout(() => {
        if (planRef.current) completeRace(planRef.current);
      }, RACE_DURATION + 100);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      roundRef.current += 1;
      setRound(roundRef.current);
      planRef.current = null;
      betRef.current = null;
      setBet(null);
      setPlan(null);
      setProgress(0);
      setLastResult(null);
      setCountdown(10);
      const queued = queue.consume();
      if (queued) acceptBet(queued);
      phaseRef.current = "idle";
      setPhase("idle");
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [acceptBet, completeRace, phase, queue.consume]);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      const element = event.target;
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || rulesRef.current?.open) return;
      if (element instanceof HTMLElement && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName))) return;
      if (/^[1-6]$/.test(event.key)) {
        event.preventDefault();
        selectHorse(Number(event.key));
      }
      if (event.code === "Space" && !(element instanceof HTMLElement && element.tagName === "BUTTON")) {
        event.preventDefault();
        primaryAction();
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [phase, primaryAction, selectHorse]);

  const raceOrder = useMemo(() => {
    if (lastResult) return lastResult.order;
    if (!plan || phase !== "racing") return [];
    const distances = getRacePositions(progress, plan);
    return HORSES.map((horse, index) => ({ id: horse.id, distance: distances[index] }))
      .sort((a, b) => b.distance - a.distance)
      .map((horse) => horse.id);
  }, [lastResult, plan, phase, progress]);

  function updateStake(value: string) {
    const amount = value === "" ? 0 : Math.floor(Number(value));
    setStake(Number.isSafeInteger(amount) ? Math.max(0, amount) : 0);
  }

  return (
    <main className="app-shell h-full w-full flex flex-col justify-between overflow-hidden px-1.5 sm:px-3 py-1">
      <header className="site-header shrink-0 py-1">
        <div className="header-inner w-full flex items-center justify-between">
          <a className="brand" href="#top" aria-label="Derby Race home">
            <span className="brand-flag" aria-hidden="true"><span /></span>
            <span className="brand-name">DERBY<span>RACE</span><small className="hidden sm:inline">THE ARCADE CLUB</small></span>
          </a>
          <div className="header-actions">
            <button type="button" className="how-to-button" onClick={() => rulesRef.current?.showModal()}><span className="question-mark">?</span> How to play</button>
            <span className="practice-pill hidden sm:inline-flex"><span />DEMO MODE</span>
            <div className="wallet-pill">
              <Coin />
              <span className="wallet-copy"><small>BALANCE</small><strong>Rs. {formatCoins(balance)}</strong></span>
            </div>
            <span className="player-tag hidden sm:inline" aria-label="Player one">P1</span>
          </div>
        </div>
      </header>

      <div className="main-wrap flex-1 min-h-0 w-full flex flex-col overflow-y-auto overflow-x-hidden" id="top">
        <div className="game-layout w-full flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_340px] gap-3">
          <div className="race-column flex flex-col gap-1.5 min-w-0">
            <div className="w-full min-w-0">
              <DerbyTrack
                phase={phase}
                plan={plan}
                countdown={countdown}
                selectedHorseId={selectedHorseId}
                onSelectHorse={selectHorse}
                onProgress={reportProgress}
                onComplete={completeRace}
              />
            </div>

            <section className="race-ticker shrink-0 py-1.5 px-3 min-h-0" aria-label="Current race information">
              <div className="ticker-race"><span className="mini-checker" aria-hidden="true" /><div><strong>RACE {String(round).padStart(2, "0")}</strong><small>1,200 M <span>·</span> DIRT</small></div></div>
              <div className="ticker-middle">
                <span className="ticker-section-label">{phase === "result" ? "FINAL PLACES" : phase === "racing" ? "LIVE POSITIONS" : "YOUR RUNNER"}</span>
                {raceOrder.length > 0 ? (
                  <div className="podium-line">
                    {raceOrder.slice(0, 3).map((id, index) => {
                      const horse = HORSES.find((entry) => entry.id === id)!;
                      return <span className="podium-entry" key={id}><small>{index + 1}{index === 0 ? "ST" : index === 1 ? "ND" : "RD"}</small><i style={{ background: horse.accent }}>{id}</i><strong>{horse.colorName}</strong></span>;
                    })}
                  </div>
                ) : <span className="ticker-selection"><i style={{ background: selectedHorse.accent }} />#{selectedHorse.id} {selectedHorse.name}</span>}
              </div>
              <div className="ticker-distance"><strong>{phase === "racing" || phase === "result" ? `${Math.min(1200, Math.floor(progress * 1200))}m` : "AT GATE"}</strong><div className="race-progress"><span style={{ width: `${progress * 100}%` }} /></div></div>
            </section>
          </div>

          <aside className="bet-panel flex flex-col justify-between p-2.5 sm:p-3 shrink-0 rounded-xl border border-[#3b493d] bg-gradient-to-b from-[#202922] to-[#17201e]" aria-labelledby="bet-heading">
            <div className="bet-panel-topline"><span>BET SLIP</span><span className={`slip-status ${canEdit ? "slip-open" : ""}`}><span />{canEdit ? "OPEN" : phase === "result" ? "SETTLED" : "LOCKED"}</span></div>

            <div className="section-heading mt-1"><span>SELECT RUNNER</span><span>6 HORSES</span></div>
            <div className="runner-options grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1.5 mt-1" role="group" aria-label="Choose your horse">
              {HORSES.map((horse) => (
                <button
                  key={horse.id}
                  type="button"
                  className={`runner-option py-1 px-1.5 rounded-lg border transition-all ${selectedHorseId === horse.id
                    ? "ring-2 ring-lime-400 border-lime-400 bg-lime-950/40"
                    : "border-white/10 bg-black/30 hover:border-white/30"
                    }`}
                  onClick={() => selectHorse(horse.id)}
                  disabled={!canEdit}
                  aria-pressed={selectedHorseId === horse.id}
                  style={{ "--horse-accent": horse.accent } as CSSProperties}
                >
                  <span className="option-number text-xs font-black" style={{ color: horse.accent }}>#{horse.id}</span>
                  <span className="option-copy"><strong className="text-[11px] truncate">{horse.name}</strong></span>
                  <span className="option-odds text-[10px] font-bold text-amber-300">2.75x</span>
                </button>
              ))}
            </div>

            <div className="stake-section mt-1.5">
              <div className="section-heading"><label htmlFor="wager-amount">WAGER</label><span>MIN Rs. 1</span></div>
              <div className="stake-input-wrap mt-1 py-0.5 px-2.5 min-h-0 h-8 rounded-lg border border-white/20 bg-black/40"><Coin small /><input id="wager-amount" type="number" min={10} max={Math.floor(balance)} step={1} inputMode="numeric" value={stake || ""} onChange={(event) => updateStake(event.currentTarget.value)} disabled={!canEdit} aria-describedby="wager-help" className="text-sm font-bold" /><span>Rs.</span></div>
              <div className="quick-stakes grid grid-cols-5 gap-1 mt-1" aria-label="Quick wager amounts">
                {QUICK_STAKES.map((amount) => (
                  <button
                    type="button"
                    key={amount}
                    className={`quick-stake py-0.5 text-xs font-bold rounded border transition-colors ${stake === amount
                      ? "border-amber-400 bg-amber-400/25 text-amber-300"
                      : "border-cyan-500/40 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-500/20"
                      }`}
                    onClick={() => setStake(amount)}
                    disabled={!canEdit}
                    aria-pressed={stake === amount}
                  >
                    {amount}
                  </button>
                ))}
              </div>
            </div>

            <div className="payout-preview mt-1 py-1 px-2.5 rounded-lg border border-lime-500/30 bg-lime-950/20 flex items-center justify-between">
              <span className="text-[10px] text-lime-300/80 font-bold">RETURN:</span>
              <strong className="text-sm font-black text-lime-300"><Coin small />Rs. {formatCoins(potentialReturn)}</strong>
            </div>

            {lastResult && winner && bet && (
              <div className={`result-callout mt-1 py-1 px-2 rounded-lg border text-xs font-bold ${lastResult.won ? "border-lime-500/60 bg-lime-950/40 text-lime-300" : "border-amber-500/60 bg-amber-950/40 text-amber-300"}`}>
                {pool.enabled ? `Daily payout pending — provisional claim Rs. ${formatCoins(lastResult.payout)}` : lastResult.won ? `★ Won! +Rs. ${formatCoins(lastResult.payout)}!` : `⚑ #${winner.id} ${winner.colorName} won.`}
              </div>
            )}

            <button
              type="button"
              className="place-bet-button mt-1.5 w-full py-2.5 px-3 rounded-xl !bg-gradient-to-r !from-emerald-400 !via-lime-400 !to-yellow-400 !text-slate-950 font-black shadow-lg shadow-lime-500/30 hover:brightness-110 active:scale-95 border !border-lime-300 transition-all cursor-pointer flex items-center justify-between"
              onClick={primaryAction}
              disabled={!canBet || queue.queued || (phase === "idle" && bet !== null)}
            >
              <span>
                <strong className="text-sm font-black uppercase">
                  {queue.queued ? "BET QUEUED" : phase !== "idle" ? "BET NEXT RACE" : bet ? "BET ACCEPTED" : "PLACE BET"}
                </strong>
              </span>
              {phase === "racing" || phase === "countdown" ? <span className="button-loading">•••</span> : <ArrowIcon />}
            </button>
            <QueuedWager {...queue} />
          </aside>
        </div>
      </div>

      <dialog ref={rulesRef} className="rules-dialog" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
        <div className="rules-topline"><span>THE ARCADE CLUB</span><button type="button" aria-label="Close game instructions" onClick={() => rulesRef.current?.close()}>×</button></div>
        <h2>Welcome to the Derby.</h2>
        <p className="rules-subtitle">A retro race. A virtual wager. All for fun.</p>
        <ol><li><strong>Pick a runner.</strong> Click a coloured horse or use keys 1–6. The number on its yellow saddlecloth is its race number.</li><li><strong>Set your wager.</strong> Use the quick amounts or enter whole coins from your balance.</li><li>        <strong>Place a bet.</strong> Press Place Bet or Space during the ten-second betting window. Races run continuously, even without a wager. A bet placed after betting closes queues one next-race wager, uncharged until the next window and subject to available funds. Cancel it using the queued-bet control.</li><li><strong>Watch the finish.</strong> If your accepted horse wins, you receive 2.75× your stake in total. Bets do not repeat automatically.</li></ol>
        <button type="button" className="rules-done" onClick={() => rulesRef.current?.close()}>LET&apos;S RACE <ArrowIcon /></button>
      </dialog>
    </main>
  );
}
