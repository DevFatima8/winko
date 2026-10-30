"use client";

import { useEffect, useRef, useState } from "react";

type Wagers = Record<string, number>;
const sum = (bets: object): number => Object.values(bets).reduce((a: number, b: number) => a + b, 0);

export function useLiveTable<T extends { [K in keyof T]: number }>({
  phase, balance, draft, targets, start, reset, apply, prepaid = false,
  minBet = 10, maxBet = Infinity, singleTarget = false,
  autoStart = true, validate, queueNextRound = true,
}: {
  phase: string;
  balance: number;
  draft: T;
  targets: readonly string[];
  start: () => void;
  reset?: () => void;
  apply: (bets: T) => void;
  prepaid?: boolean;
  minBet?: number;
  maxBet?: number;
  singleTarget?: boolean;
  autoStart?: boolean;
  validate?: (bets: T) => boolean;
  queueNextRound?: boolean;
}) {
  const [queued, setQueued] = useState<T | null>(null);
  const [target, setTarget] = useState(targets[0]);
  const [amount, setAmount] = useState("50");
  const [notice, setNotice] = useState("");
  const [active, setActive] = useState(0);
  const queuedRef = useRef<T | null>(null);
  const locked = useRef(false);
  const latest = useRef({ start, reset, apply, balance });
  const current = useRef({ phase, draft, balance, prepaid, minBet, maxBet, validate });
  const hasReset = reset !== undefined;
  useEffect(() => {
    latest.current = { start, reset, apply, balance };
    current.current = { phase, draft, balance, prepaid, minBet, maxBet, validate };
  });

  useEffect(() => {
    if (phase === "betting") {
      const activate = setTimeout(() => {
        locked.current = false;
        setActive(0);
        const next = queuedRef.current;
        queuedRef.current = null;
        setQueued(null);
        if (next) {
          if (sum(next) <= latest.current.balance) {
            latest.current.apply(next);
            setNotice("Next-round bet activated");
          } else setNotice("Queued bet cancelled: insufficient balance");
        }
      }, 0);
      const timer = autoStart ? setTimeout(() => latest.current.start(), 5000) : null;
      return () => {
        clearTimeout(activate);
        if (timer !== null) clearTimeout(timer);
      };
    }
    if (hasReset && (phase === "result" || phase === "settled" || phase === "revealed")) {
      const timer = setTimeout(() => latest.current.reset?.(), 2800);
      return () => clearTimeout(timer);
    }
  }, [phase, hasReset, autoStart]); // Callbacks are read at the round boundary, not when a bet is queued.

  const begin = (wagers?: T) => {
    const { phase, draft, balance, prepaid, minBet, maxBet, validate } = current.current;
    if (phase !== "betting" || locked.current) return null;
    let snapshot = { ...(wagers ?? draft) };
    const stake = sum(snapshot);
    if (Object.values(snapshot as Wagers).some((n) => !Number.isFinite(n) || n < 0) ||
        (!prepaid && stake > balance) ||
        (stake > 0 && (stake < minBet || stake > maxBet || (validate && !validate(snapshot))))) {
      snapshot = Object.fromEntries(Object.keys(snapshot).map((key) => [key, 0])) as T;
      setNotice("Bet rejected: insufficient funds or table limit — spectating");
    }
    locked.current = true;
    setActive(sum(snapshot));
    return snapshot;
  };

  const queue = () => {
    if (!queueNextRound) return;
    const value = Number(amount);
    const next = { ...(queuedRef.current ?? Object.fromEntries(targets.map((key) => [key, 0]))) } as T;
    if (!Number.isFinite(value) || value <= 0) {
      setNotice("Enter a positive bet");
      return;
    }
    (next as Wagers)[target] = ((next as Wagers)[target] ?? 0) + value;
    if (sum(next) < minBet || sum(next) > maxBet ||
        (singleTarget && Object.values(next as Wagers).filter((n) => n > 0).length > 1) ||
        (validate && !validate(next))) {
      setNotice(`Choose one valid bet (${minBet}–${maxBet === Infinity ? "table limit" : maxBet})`);
      return;
    }
    if (sum(next) > balance) {
      setNotice("Insufficient balance for next round");
      return;
    }
    queuedRef.current = next;
    setQueued(next);
    setNotice("Queued for the next round only — not charged");
  };

  const controls = queueNextRound ? (
    <div className="shrink-0 flex flex-wrap items-center justify-center gap-1 text-[10px] text-amber-200" aria-label="Live round bets">
      <span>Live · Active Rs. {active} · Next Rs. {queued ? sum(queued) : 0} (not charged)</span>
      <select aria-label="Next round target" value={target} onChange={(e) => setTarget(e.target.value)} className="bg-slate-900 rounded">
        {targets.map((key) => <option key={key} value={key}>{key}</option>)}
      </select>
      <input aria-label="Next round amount" type="number" min={minBet} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-16 bg-slate-900 rounded px-1" />
      <button type="button" onClick={queue}>Queue next round</button>
      <button type="button" disabled={!queued} onClick={() => {
        queuedRef.current = null;
        setQueued(null);
        setNotice("Queued bet cancelled");
      }}>Cancel queued</button>
      <span role="status">{notice}</span>
    </div>
  ) : null;
  const release = () => {
    locked.current = false;
    setActive(0);
  };
  return { begin, release, controls };
}
