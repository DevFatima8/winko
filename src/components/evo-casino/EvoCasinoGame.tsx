"use client";
import { gameSfx } from "@/lib/gameSfx";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import BetAmountInput from "@/components/BetAmountInput";
import './evo-casino.css';
import { useLiveTable } from "../teen-patti/useLiveTable";

type Spot = number | 'odd' | 'even' | 'storm' | 'x';
type Bet = { spot: Spot; amount: number };
type Phase = 'betting' | 'spinning' | 'result';

const VALUES: number[] = [...BET_PRESETS];
const WHEEL_NUMBERS = Array.from({ length: 20 }, (_, i) => i + 1);
const STORM_NUMBERS = [3, 6, 9, 12, 15, 18];
const X_NUMBERS = [7, 14, 20];
const money = (n: number) => `Rs. ${n.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;

function payout(bets: Bet[], number: number) {
  return bets.reduce((total, bet) => {
    if (typeof bet.spot === 'number') return total + (bet.spot === number ? bet.amount * 18 : 0);
    if (bet.spot === 'odd') return total + (number % 2 === 1 ? bet.amount * 1.85 : 0);
    if (bet.spot === 'even') return total + (number % 2 === 0 ? bet.amount * 1.85 : 0);
    if (bet.spot === 'storm') return total + (STORM_NUMBERS.includes(number) ? bet.amount * 2.7 : 0);
    return total + (X_NUMBERS.includes(number) ? bet.amount * 7.8 : 0);
  }, 0);
}

function chooseResult(bets: Bet[]) {
  const stake = bets.reduce((sum, bet) => sum + bet.amount, 0);
  const winners = WHEEL_NUMBERS.filter((n) => payout(bets, n) > stake);
  const losers = WHEEL_NUMBERS.filter((n) => payout(bets, n) <= stake);
  const preferred = Math.random() < 0.35 ? winners : losers;
  const pool = preferred.length ? preferred : (winners.length ? winners : losers);
  return pool[Math.floor(Math.random() * pool.length)];
}

function Chip({ value, selected, onClick }: { value: number; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`chip chip-${value} ${selected ? 'chip-selected' : ''}`} onClick={onClick} aria-label={`Select ${money(value)} chip`} aria-pressed={selected}>
      <span className="chip-inner"><span>{value >= 1000 ? '1K' : value}</span></span>
    </button>
  );
}

export default function EvoCasinoGame({ backHref = "/player" }: { backHref?: string }) {
  const [balance] = useGameBalance("evo-casino", 10000);
  const pool = usePoolLifecycle("evo-casino");
  const [selectedChip, setSelectedChip] = useState(50);
  const [bets, setBets] = usePoolRoundState<Bet[]>("evo-casino", "bets", []);
  const [phase, setPhase] = useState<Phase>('betting');
  const [result, setResult] = useState<number | null>(null);
  const [lastWin, setLastWin] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [rotation, setRotation] = useState(0);
  const [notice, setNotice] = useState('PLACE YOUR BETS');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stake = useMemo(() => bets.reduce((sum, bet) => sum + bet.amount, 0), [bets]);
  const live = useLiveTable({
    phase, balance, draft: Object.fromEntries(bets.map((b) => [String(b.spot), amountOn(b.spot)])),
    targets: [...WHEEL_NUMBERS.map(String), "odd", "even", "storm", "x"], prepaid: true,
    start: () => spin(),
    apply: async (b) => {
      const next = Object.entries(b).filter(([, n]) => n > 0).map(([spot, amount]) => ({
        spot: (/^\d+$/.test(spot) ? Number(spot) : spot) as Spot, amount,
      }));
      const amount = next.reduce((s, bet) => s + bet.amount, 0);
      pool.checkpoint({ bets: next });
      if (amount > 0 && !await pool.stake(amount)) return;
      setBets(next);
    },
  });

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function amountOn(spot: Spot) { return bets.filter((b) => b.spot === spot).reduce((sum, b) => sum + b.amount, 0); }

  const placeBet = async (spot: Spot) => {
    if (phase !== 'betting') return;
    gameSfx.chip();
    if (!Number.isFinite(selectedChip) || selectedChip <= 0 || balance < selectedChip) { setNotice('NOT ENOUGH BALANCE'); return; }
    pool.checkpoint({ bets: [...bets, { spot, amount: selectedChip }] });
    if (!await pool.stake(selectedChip)) return;
    setBets((prev) => [...prev, { spot, amount: selectedChip }]);
    setNotice('PLACE YOUR BETS');
  };

  const undo = async () => {
    if (phase !== 'betting' || bets.length === 0) return;
    pool.checkpoint({ bets: bets.slice(0, -1) });
    if (!await pool.reduce(bets[bets.length - 1].amount)) return;
    setBets((prev) => prev.slice(0, -1));
  };

  const double = async () => {
    if (phase !== 'betting' || !bets.length) return;
    if (balance < stake) { setNotice('NOT ENOUGH BALANCE'); return; }
    pool.checkpoint({ bets: [...bets, ...bets.map(bet => ({ ...bet }))] });
    if (!await pool.stake(stake)) return;
    setBets((prev) => [...prev, ...prev.map((bet) => ({ ...bet }))]);
  };

  const spin = () => {
    if (pool.busy) return;
    if (!live.begin()) return;
    gameSfx.spin();
    const number = chooseResult(bets);
    const win = payout(bets, number);
    if (stake > 0) pool.plan(win, { number, bets });
    setPhase('spinning');
    setNotice('NO MORE BETS');
    setResult(null);
    // Five turns plus the target segment under the fixed top pointer.
    setRotation((prev) => {
      const current = ((prev % 360) + 360) % 360;
      const target = (360 - (number - 1) * 18) % 360;
      return prev + 360 * 5 + ((target - current + 360) % 360);
    });
    timer.current = setTimeout(async () => {
      if (stake > 0) {
        if (!await pool.complete(win)) return;
        if (win > stake) gameSfx.win(); else gameSfx.lose();
        setLastWin(win);
      }
      setResult(number);
      setHistory((prev) => [number, ...prev].slice(0, 8));
      setBets([]);
      setPhase('result');
      setNotice(stake === 0 ? `NUMBER ${number}` : pool.enabled ? `PROVISIONAL CLAIM ${money(win)} — daily settlement pending` : win > stake ? `YOU WON ${money(win - stake)}` : `NUMBER ${number} - NO WIN`);
      timer.current = setTimeout(() => { setPhase('betting'); setNotice('PLACE YOUR BETS'); }, 2800);
    }, 4700);
  };

  return (
    <div className="evo-casino-container relative z-10 mx-auto max-w-6xl w-full h-full flex flex-col justify-between overflow-hidden px-1 sm:px-3 py-1">
      {live.controls}
      <main className="page-shell h-full w-full flex justify-center overflow-hidden">
        <div className="game-stage">
          <div className="studio-shade" />
          <div className="top-line">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Link
                href={backHref}
                className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-black/60 px-2 py-0.5 text-xs font-bold text-slate-200 hover:bg-white/20 hover:text-white transition"
              >
                ← Back
              </Link>
              <div className="demo-badge">DEMO PLAY</div>
            </div>
            <div className="balance-display"><span>BALANCE</span><strong>{money(balance)}</strong></div>
          </div>

          <div className="wheel-assembly">
            <div className="wheel-outer">
              <div className="wheel-lights" />
              <div className="wheel-face" style={{ transform: `rotate(${rotation}deg)` }}>
                <div className="wheel-segments" />
                <div className="wheel-dark-ring" />
                {WHEEL_NUMBERS.map((number, index) => {
                  const angle = index * 18;
                  return <span key={number} className="wheel-number" style={{ transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(calc(var(--wheel-size) * -.365)) rotate(${-angle}deg)` }}>{number}</span>;
                })}
                <div className="wheel-center-disc" />
              </div>
              <div className="wheel-pointer" />
              <div className="brand-mark">
                <div className="bolt">ϟ</div>
                <div className="brand-first">LIGHTNING</div>
                <div className="brand-second">STORM</div>
              </div>
            </div>
          </div>

          <div className="game-hud">
            <div className="progress-area">
              <div className="progress-track"><div className={`progress-fill ${phase === 'spinning' ? 'progress-active' : ''}`} /></div>
              <button
                className="spin-trigger"
                onClick={spin}
                disabled={phase === 'spinning'}
                aria-label="Spin wheel"
              >
                {phase === 'spinning' ? '...' : 'SPIN'}
              </button>
              <div className={`phase-message ${phase === 'result' && lastWin > 0 ? 'phase-win' : ''}`}>{notice}</div>
            </div>

            <div className="table-wrap">
              <button className={`side-bet side-left ${amountOn('odd') + amountOn('even') > 0 ? 'has-bet' : ''}`} onClick={() => placeBet('odd')} aria-label="Bet on odd numbers">
                <span className="leaf-symbol">◕</span><span>1:1</span>
              </button>
              <div className="number-grid">
                {WHEEL_NUMBERS.map((number) => (
                  <button key={number} className={`number-cell ${result === number ? 'winning-cell' : ''}`} onClick={() => placeBet(number)} aria-label={`Bet on number ${number}`}>
                    <span>{number}</span>
                    {amountOn(number) > 0 && <span className="placed-chip">{amountOn(number) >= 1000 ? `${amountOn(number) / 1000}K` : amountOn(number)}</span>}
                  </button>
                ))}
              </div>
              <div className="outside-bets">
                <button className={`outside-bet ${amountOn('odd') > 0 ? 'has-bet' : ''}`} onClick={() => placeBet('odd')}>ALL<br />ODD{amountOn('odd') > 0 && <small>{money(amountOn('odd'))}</small>}</button>
                <button className={`outside-bet ${amountOn('even') > 0 ? 'has-bet' : ''}`} onClick={() => placeBet('even')}>ALL<br />EVEN{amountOn('even') > 0 && <small>{money(amountOn('even'))}</small>}</button>
              </div>
            </div>

            <div className="chasers">
              <button className={`chaser storm-chaser ${amountOn('storm') > 0 ? 'chaser-selected' : ''}`} onClick={() => placeBet('storm')}>
                <span className="chaser-icon">ϟ</span><span className="chaser-info"><b>STORM CHASER</b><small>2.7 × ✺ {amountOn('storm') > 0 ? `• ${money(amountOn('storm'))}` : ''}</small></span>
              </button>
              <div className="chaser-divider">⌃</div>
              <button className={`chaser x-chaser ${amountOn('x') > 0 ? 'chaser-selected' : ''}`} onClick={() => placeBet('x')}>
                <span className="big-x">X</span><span className="chaser-info"><b>X CHASER</b><small>7.8 × ✺ {amountOn('x') > 0 ? `• ${money(amountOn('x'))}` : ''}</small></span>
              </button>
            </div>

            <div className="bottom-controls">
              <button
                className="undo-circle hover:scale-105 active:scale-95 transition-all"
                onClick={undo}
                disabled={phase !== 'betting' || bets.length === 0}
                aria-label="Undo last bet"
                style={{ background: 'linear-gradient(135deg, #b45309, #78350f)', borderColor: '#f59e0b', color: '#fff' }}
              >
                ↶
              </button>
              <button className="text-control" onClick={undo} disabled={phase !== 'betting' || bets.length === 0}>UNDO</button>
              <div className="chip-row" style={{ flexWrap: 'wrap' }}>{VALUES.map((value) => <Chip key={value} value={value} selected={selectedChip === value} onClick={() => setSelectedChip(value)} />)}<BetAmountInput value={selectedChip} onChange={(n) => setSelectedChip(Math.max(1, n))} disabled={phase !== 'betting'} /></div>
              <button className="text-control" onClick={double} disabled={phase !== 'betting' || bets.length === 0}>DOUBLE</button>
              <button
                className="double-circle hover:scale-105 active:scale-95 transition-all"
                onClick={double}
                disabled={phase !== 'betting' || bets.length === 0}
                style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', borderColor: '#60a5fa', color: '#fff' }}
              >
                ×2
              </button>
            </div>
          </div>

          <div className="tiny-footer">
            <span>BET {money(stake)}</span>
            <span>{result !== null ? pool.enabled ? `LAST ${result} · PROVISIONAL CLAIM ${money(lastWin)} · DAILY PAYOUT PENDING` : `LAST ${result} · ${money(lastWin)} PAID` : history.length ? `LAST ${history.join('  ·  ')}` : 'SELECT CHIP & PLACE BET'}</span>
          </div>
        </div>
      </main>
    </div>
  );
}
