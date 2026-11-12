"use client";
import { gameSfx } from "@/lib/gameSfx";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useGameBalance, usePoolLifecycle } from "@/lib/walletSync";
import { BET_PRESETS } from "@/lib/betPresets";
import type { BrowserRouletteNumberOutcome } from "@/lib/browserRouletteOutcome";
import { validateBrowserRouletteSelection } from "@/lib/browserRouletteSelection";
import Wheel, { type WheelHandle } from "./Wheel";
import { BET_LIST, CATALOG, colorOf, type BetDef, type Color, type PlacedBet, pickOutcome } from "./roulette";

const CHIPS: number[] = [...BET_PRESETS];
const START_BANK = 1000;

const CHIP_COLORS: Record<number, { bg: string; text: string }> = {
  50: { bg: "#dc2626", text: "#ffffff" },
  100: { bg: "#1f2937", text: "#ffffff" },
  200: { bg: "#16a34a", text: "#ffffff" },
  500: { bg: "#7e22ce", text: "#ffffff" },
  1000: { bg: "#d97706", text: "#ffffff" },
};

const money = (n: number) => `Rs. ${Math.round(n).toLocaleString("en-US")}`;
const short = (n: number) => (n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(n));
const chipFor = (amount: number) => [...CHIPS].reverse().find((c) => c <= amount) ?? CHIPS[0];

const NUM_BG: Record<Color, string> = { red: "#c1121f", black: "#111111", green: "#0a7a3d" };

interface Action {
  id: string;
  amount: number;
}
interface Result {
  number: number;
  payout: number;
  total: number;
}

function Chip({ value, size, label, selected }: { value: number; size: string; label?: string; selected?: boolean }) {
  const c = CHIP_COLORS[value] ?? { bg: "#0891b2", text: "#ffffff" };
  return (
    <div
      className="flex items-center justify-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.35), transparent 55%), ${c.bg}`,
        color: c.text,
        border: "3px dashed rgba(255,255,255,0.9)",
        boxShadow: `0 3px 6px rgba(0,0,0,0.55), inset 0 0 0 3px ${c.bg}${selected ? ", 0 0 0 3px #facc15, 0 0 18px #facc15" : ""}`,
        fontSize: `calc(${size} * 0.34)`,
        lineHeight: 1,
        fontFamily: "Georgia, serif",
      }}
    >
      {label ?? value}
    </div>
  );
}

function Table({
  bets,
  hover,
  setHover,
  onBet,
  onRemove,
  winNum,
  disabled,
}: {
  bets: Record<string, number>;
  hover: number[];
  setHover: (n: number[]) => void;
  onBet: (id: string) => void;
  onRemove: (id: string) => void;
  winNum: number | null;
  disabled: boolean;
}) {
  const vars = {
    "--w": "clamp(24px, calc((100vw - 44px) / 15), 44px)",
    "--h": "calc(var(--w) * 1.05)",
  } as CSSProperties;

  const border = "1.5px solid rgba(255,255,255,0.75)";
  const hl = (n: number) => hover.includes(n);

  const cellProps = (id: string) => ({
    onClick: () => onBet(id),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      onRemove(id);
    },
    onMouseEnter: () => setHover(CATALOG[id].numbers),
    onMouseLeave: () => setHover([]),
    disabled,
  });

  const inner = BET_LIST.filter((b) => ["split", "street", "trio", "corner", "basket", "sixline"].includes(b.kind));
  const pos = (b: BetDef): CSSProperties => ({
    left: `calc(var(--w) * ${b.x})`,
    top: `calc(var(--h) * ${b.y})`,
  });

  const numberCell = (n: number) => {
    const col = Math.floor((n - 1) / 3);
    const row = 2 - ((n - 1) % 3);
    const win = winNum === n;
    return (
      <button
        key={n}
        {...cellProps(`s${n}`)}
        className="relative flex cursor-pointer items-center justify-center transition-colors"
        style={{ gridColumn: col + 2, gridRow: row + 1, border, background: hl(n) ? "rgba(250,204,21,0.45)" : win ? "rgba(250,204,21,0.55)" : "transparent" }}
      >
        <span
          className={`flex items-center justify-center font-bold text-white ${win ? "animate-pulse" : ""}`}
          style={{
            width: "86%",
            height: "92%",
            background: NUM_BG[colorOf(n)],
            clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)",
            fontSize: "calc(var(--w) * 0.34)",
            fontFamily: "Georgia, serif",
          }}
        >
          {n}
        </span>
      </button>
    );
  };

  const outside = (id: string, col: string, row: number, content: React.ReactNode) => (
    <button
      key={id}
      {...cellProps(id)}
      className="flex cursor-pointer items-center justify-center font-bold tracking-wide text-white transition-colors hover:bg-white/15"
      style={{ gridColumn: col, gridRow: row, border, fontSize: "calc(var(--w) * 0.27)", fontFamily: "Georgia, serif" }}
    >
      {content}
    </button>
  );

  const diamond = (color: string) => (
    <span
      style={{ width: "calc(var(--w) * 0.8)", height: "calc(var(--h) * 0.62)", background: color, clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)" }}
    />
  );

  return (
    <div className="overflow-x-auto pb-2">
      <div
        className="relative mx-auto"
        style={{ ...vars, width: "calc(var(--w) * 14)", height: "calc(var(--h) * 5)" }}
      >
        <div
          className="absolute inset-0 grid"
          style={{ gridTemplateColumns: "repeat(14, var(--w))", gridTemplateRows: "repeat(5, var(--h))" }}
        >
          {/* Zero */}
          <button
            {...cellProps("s0")}
            className="relative flex cursor-pointer items-center justify-center font-bold text-white transition-colors"
            style={{
              gridColumn: 1,
              gridRow: "1 / 4",
              border,
              borderRadius: "60% 0 0 60% / 22% 0 0 22%",
              background: hl(0) || winNum === 0 ? "rgba(250,204,21,0.5)" : "#0a7a3d",
              fontSize: "calc(var(--w) * 0.5)",
              fontFamily: "Georgia, serif",
            }}
          >
            <span className={winNum === 0 ? "animate-pulse" : ""}>0</span>
          </button>

          {Array.from({ length: 36 }, (_, i) => numberCell(i + 1))}

          {outside("c3", "14", 1, "≤2x")}
          {outside("c2", "14", 2, "≤2x")}
          {outside("c1", "14", 3, "≤2x")}

          {outside("d1", "2 / 6", 4, "1st 12")}
          {outside("d2", "6 / 10", 4, "2nd 12")}
          {outside("d3", "10 / 14", 4, "3rd 12")}

          {outside("low", "2 / 4", 5, "1-18")}
          {outside("even", "4 / 6", 5, "EVEN")}
          {outside("red", "6 / 8", 5, diamond("#c1121f"))}
          {outside("black", "8 / 10", 5, diamond("#111111"))}
          {outside("odd", "10 / 12", 5, "ODD")}
          {outside("high", "12 / 14", 5, "19-36")}
        </div>

        {/* Inner-bet hotspots */}
        {inner.map((b) => (
          <button
            key={b.id}
            disabled={disabled}
            onClick={() => onBet(b.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              onRemove(b.id);
            }}
            onMouseEnter={() => setHover(b.numbers)}
            onMouseLeave={() => setHover([])}
            className="absolute z-10 cursor-pointer rounded-md hover:bg-white/35"
            style={{
              ...pos(b),
              width: `calc(var(--w) * ${b.hw})`,
              height: `calc(var(--h) * ${b.hh})`,
              transform: "translate(-50%, -50%)",
            }}
            aria-label={`Bet on ${b.numbers.join(", ")}`}
          />
        ))}

        {/* Chips on table */}
        {Object.entries(bets).map(([id, amount]) => {
          const b = CATALOG[id];
          return (
            <div
              key={id}
              className="pointer-events-none absolute z-20"
              style={{ ...pos(b), transform: "translate(-50%, -50%)" }}
            >
              <Chip value={chipFor(amount)} size="calc(var(--w) * 0.62)" label={short(amount)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function RouletteGame({ backHref = "/player" }: { backHref?: string }) {
  const wheelRef = useRef<WheelHandle>(null);
  const [bank] = useGameBalance("european-roulette", START_BANK);
  const pool = usePoolLifecycle("european-roulette");
  const [actions, setActions] = useState<Action[]>([]);
  const [lastActions, setLastActions] = useState<Action[]>([]);
  const [chip, setChip] =   useState<number>(BET_PRESETS[0]);
  const [spinning, setSpinning] = useState(false);
  const [history, setHistory] = useState<number[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [hover, setHover] = useState<number[]>([]);
  const [message, setMessage] = useState("Place your bets");
  const [lastWin, setLastWin] = useState(0);
  const roundLock = useRef(false);
  const pendingRound = useRef<Action[] | null>(null);
  const acceptedRound = useRef(false);
  const mounted = useRef(false);
  const spinRef = useRef<() => Promise<void>>(async () => {});
  const bankRef = useRef(bank);
  const queueRef = useRef(actions);
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => {
      if (!roundLock.current) void spinRef.current();
    }, 6000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, []);

  const bets = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of actions) m[a.id] = (m[a.id] ?? 0) + a.amount;
    return m;
  }, [actions]);
  const total = useMemo(() => actions.reduce((s, a) => s + a.amount, 0), [actions]);
  const balance = bank - total;

  const fresh = () => {
    if (result) setResult(null);
  };

  // Bets are editable only while betting is open; a running or unresolved round
  // never collects chips for a later round.
  const bettingClosed = () => roundLock.current || pendingRound.current !== null;
  const commitActions = (next: Action[]) => {
    queueRef.current = next;
    setActions(next);
  };

  const placeBet = (id: string) => {
    if (!Number.isFinite(chip) || chip <= 0) return;
    if (bettingClosed()) {
      setMessage("Round in progress — bet after this round finishes");
      return;
    }
    gameSfx.chip();
    if (balance < chip) {
      setMessage("Insufficient balance for this chip");
      return;
    }
    fresh();
    setMessage("Place your bets");
    commitActions([...queueRef.current, { id, amount: chip }]);
  };

  const removeBet = (id: string) => {
    if (bettingClosed()) return;
    const a = queueRef.current;
    const i = a.map((x) => x.id).lastIndexOf(id);
    if (i >= 0) commitActions(a.filter((_, k) => k !== i));
  };

  const undo = () => { if (!bettingClosed()) commitActions(queueRef.current.slice(0, -1)); };
  const clear = () => { if (!bettingClosed()) commitActions([]); };

  const double = () => {
    if (total === 0 || bettingClosed()) return;
    if (balance < total) {
      setMessage("Insufficient balance to double");
      return;
    }
    commitActions([...queueRef.current, ...queueRef.current]);
  };

  const rebet = () => {
    if (lastActions.length === 0 || bettingClosed()) return;
    const t = lastActions.reduce((s, a) => s + a.amount, 0);
    if (bank < t) {
      setMessage("Insufficient balance to repeat last bet");
      return;
    }
    fresh();
    commitActions(lastActions);
    setMessage("Place your bets");
  };

  const spin = async () => {
    if (!mounted.current || roundLock.current) return;
    roundLock.current = true;
    gameSfx.spin();
    const queued = queueRef.current;
    queueRef.current = [];
    const queuedTotal = queued.reduce((sum, a) => sum + a.amount, 0);
    const snapshot = pendingRound.current ?? (queuedTotal <= bankRef.current ? queued.map((a) => ({ ...a })) : []);
    const stake = Math.round(snapshot.reduce((sum, a) => sum + a.amount, 0) * 100) / 100;
    const placed: PlacedBet[] = snapshot.map(({ id, amount }) => ({ id, amount }));
    if (!pendingRound.current) setActions([]);
    setSpinning(true);
    setResult(null);
    setMessage(queuedTotal > bankRef.current ? "Bet cancelled — insufficient balance" : "Live round · betting reopens after the result");

    let number = 0;
    let payout = 0;
    if (stake > 0) {
      const allocation: Record<string, number> = {};
      for (const bet of placed) allocation[bet.id] = Math.round(((allocation[bet.id] ?? 0) + bet.amount) * 100) / 100;
      const selection = { bets: allocation };
      try { validateBrowserRouletteSelection("european-roulette", stake, selection); }
      catch (error) {
        setMessage(error instanceof Error ? error.message : "Invalid roulette allocation.");
        setSpinning(false); roundLock.current = false; return;
      }
      pendingRound.current = snapshot;
      if (!acceptedRound.current && !await pool.start(stake, () => {}, selection)) { setSpinning(false); roundLock.current = false; return; }
      acceptedRound.current = true;
      const resolved = await pool.resolveServer(selection) as BrowserRouletteNumberOutcome | null;
      if (!resolved) { setMessage("Result confirmation pending — retrying the same wager."); setSpinning(false); roundLock.current = false; return; }
      number = resolved.number;
      payout = resolved.payout;
      pendingRound.current = null;
      acceptedRound.current = false;
    } else number = pickOutcome([], Math.random(), len => Math.floor(Math.random() * len));
    await wheelRef.current?.spin(number);
    if (!mounted.current) return;

    if (stake > 0) {
      pool.announce();
      setLastWin(payout);
      setLastActions(snapshot);
      if (payout > stake) gameSfx.win(); else if (payout === 0) gameSfx.lose();
    }
    setHistory((h) => [number, ...h].slice(0, 20));
    setResult({ number, payout, total: stake });
    setMessage(stake === 0 ? "Live result · place bets for next round" : pool.enabled ? `Provisional claim ${money(payout)} — daily settlement pending` : payout > stake ? `You win ${money(payout - stake)}!` : payout > 0 ? `Returned ${money(payout)}` : "");
    setSpinning(false);
    roundLock.current = false;
  };
  useEffect(() => {
    bankRef.current = bank;
    queueRef.current = actions;
    spinRef.current = spin;
  });

  const counts = useMemo(() => {
    const c = { red: 0, black: 0, green: 0 };
    for (const n of history) c[colorOf(n)]++;
    return c;
  }, [history]);

  const won = result ? result.payout > result.total : false;

  return (
    <div
      className="relative flex h-full w-full flex-col justify-between overflow-hidden px-2 sm:px-4 py-1.5 select-none text-white"
      style={{ background: "radial-gradient(ellipse at 50% 0%, #0f3d27 0%, #07150e 55%, #020805 100%)" }}
    >
      <div className="flex flex-1 min-h-0 flex-col justify-between overflow-hidden gap-1.5 w-full max-w-6xl mx-auto">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-yellow-700/40 bg-black/40 px-3 py-1.5">
          <div className="flex items-center gap-2">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-slate-300 hover:bg-white/15 hover:text-white transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </Link>
            <div>
              <h1
                className="text-base sm:text-lg font-bold uppercase tracking-[0.16em] text-transparent"
                style={{
                  fontFamily: "Georgia, serif",
                  backgroundImage: "linear-gradient(180deg,#fff3b0,#d9a93a 55%,#8c611a)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                }}
              >
                European Roulette
              </h1>
              <p className="text-[9px] uppercase tracking-[0.25em] text-emerald-200/60 hidden sm:block">
                Single zero · 37 pockets · maximum 2x gross return
              </p>
            </div>
          </div>
        </header>
        <p className="text-center text-[10px] text-emerald-200/80">Server results · 10 winning slots per 100 distinct players · total gross return capped at 2x stake (stake included). Standard bet returns apply before the total cap. All-number coverage is not allowed.</p>

        {/* Main Wheel + Table area */}
        <main className="flex-1 min-h-0 flex flex-col justify-between overflow-hidden gap-1.5 py-1">
          {/* Wheel + info */}
          <section className="grid gap-2 grid-cols-[minmax(0,210px)_minmax(0,1fr)] sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)] md:grid-cols-[300px_minmax(0,1fr)] items-center">
            <div className="relative mx-auto aspect-square w-[min(54vw,210px)] sm:w-[min(48vw,260px)] md:w-[300px] md:max-w-[300px]">
              <Wheel ref={wheelRef} />
              {result && (
                <div
                  className="pop absolute left-1/2 top-1/2 flex h-[24%] w-[24%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-yellow-300 text-[clamp(1rem,3.5vw,1.8rem)] font-bold text-white shadow-[0_0_20px_rgba(250,204,21,0.8)]"
                  style={{ background: NUM_BG[colorOf(result.number)], fontFamily: "Georgia, serif" }}
                >
                  {result.number}
                </div>
              )}
            </div>

            <div className="flex flex-col justify-between gap-1 rounded-xl border border-yellow-700/40 bg-black/40 p-2">
              <div className="grid grid-cols-2 gap-1.5 text-center">
                {[
                  ["Total bet", money(total)],
                  [pool.enabled ? "Provisional claim" : "Last win", money(lastWin)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-white/10 bg-black/40 px-2 py-1">
                    <div className="text-[8px] uppercase tracking-[0.16em] text-emerald-200/60">{k}</div>
                    <div className="text-xs sm:text-sm font-bold text-yellow-300" style={{ fontFamily: "Georgia, serif" }}>
                      {v}
                    </div>
                  </div>
                ))}
              </div>

              <div
                className={`flex min-h-[34px] items-center justify-center rounded-lg border px-3 py-1 text-center text-xs sm:text-sm font-bold uppercase tracking-wider ${
                  result
                    ? won
                      ? "border-yellow-400 bg-yellow-500/15 text-yellow-300"
                      : "border-white/15 bg-white/5 text-slate-200"
                    : "border-white/10 bg-black/30 text-emerald-100"
                }`}
                style={{ fontFamily: "Georgia, serif" }}
              >
                {spinning ? (
                  "Spinning · betting reopens after this round"
                ) : result ? (
                  <span className="flex flex-wrap items-center justify-center gap-1.5">
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-white"
                      style={{ background: NUM_BG[colorOf(result.number)] }}
                    >
                      {result.number}
                    </span>
                    <span className="capitalize">{colorOf(result.number)}</span>
                    <span>· {message}</span>
                  </span>
                ) : (
                  message
                )}
              </div>

              <div className="flex items-center justify-between gap-2 overflow-x-auto">
                <div className="flex items-center gap-1 shrink-0 text-[8px] sm:text-[9px] uppercase tracking-wider text-emerald-200/60">
                  <span className="text-red-400 font-bold">R {counts.red}</span> ·{" "}
                  <span className="text-slate-300 font-bold">B {counts.black}</span> ·{" "}
                  <span className="text-emerald-400 font-bold">G {counts.green}</span>
                </div>
                <div className="flex items-center gap-1 overflow-x-auto thin-scroll py-0.5">
                  {history.length === 0 && <span className="text-[10px] text-slate-400">No spins yet</span>}
                  {history.slice(0, 10).map((n, i) => (
                    <span
                      key={i}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/40 text-[9px] font-bold text-white shadow-sm"
                      style={{
                        background: NUM_BG[colorOf(n)],
                        opacity: i === 0 ? 1 : 0.85,
                        boxShadow: i === 0 ? "0 0 0 1.5px #facc15" : undefined,
                      }}
                    >
                      {n}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Table */}
          <section
            className="rounded-xl p-1 sm:p-2 max-w-full overflow-x-auto thin-scroll flex items-center justify-center"
            style={{
              background: "linear-gradient(145deg,#5a2d0c,#2a1305)",
              boxShadow: "0 0 0 2px #c9972f, 0 10px 30px rgba(0,0,0,0.6)",
            }}
          >
            <div
              className="rounded-lg p-1 sm:p-2 w-full flex items-center justify-center"
              style={{
                background: "radial-gradient(ellipse at 50% 40%, #138a4a 0%, #0b6035 60%, #084a29 100%)",
                boxShadow: "inset 0 0 25px rgba(0,0,0,0.5)",
              }}
            >
              <Table
                bets={bets}
                hover={hover}
                setHover={setHover}
                onBet={placeBet}
                onRemove={removeBet}
                winNum={result ? result.number : null}
                disabled={spinning}
              />
            </div>
          </section>

          {/* Controls */}
          <section className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-yellow-700/40 bg-black/40 p-2">
            <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5">
              {CHIPS.map((c) => (
                <button
                  key={c}
                  onClick={() => setChip(c)}
                  disabled={false}
                  className={`cursor-pointer transition-all duration-150 hover:-translate-y-1 hover:brightness-110 active:scale-95 ${
                    chip === c ? "-translate-y-1 ring-2 ring-yellow-400 rounded-full" : "opacity-90"
                  }`}
                  aria-label={`Chip ${c}`}
                >
                  <Chip value={c} size="36px" selected={chip === c} />
                </button>
              ))}
              <input
                type="number"
                min={10}
                inputMode="numeric"
                value={chip || ""}
                disabled={false}
                onChange={(e) => setChip(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
                aria-label="Custom chip amount"
                placeholder="Rs."
                className="w-20 rounded-lg border border-yellow-600/50 bg-black/50 px-2 py-1.5 text-xs font-bold text-yellow-300 outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <button
                onClick={undo}
                disabled={total === 0}
                className="cursor-pointer rounded-lg px-2.5 py-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all duration-150 active:scale-95 hover:scale-[1.02] bg-gradient-to-b from-amber-600 to-orange-700 text-white shadow-sm shadow-amber-950/40 hover:from-amber-500 hover:to-orange-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              >
                Undo
              </button>
              <button
                onClick={clear}
                disabled={total === 0}
                className="cursor-pointer rounded-lg px-2.5 py-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all duration-150 active:scale-95 hover:scale-[1.02] bg-gradient-to-b from-rose-600 via-rose-700 to-red-800 text-white shadow-sm shadow-rose-950/40 hover:from-rose-500 hover:to-red-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              >
                Clear
              </button>
              <button
                onClick={double}
                disabled={total === 0}
                className="cursor-pointer rounded-lg px-2.5 py-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all duration-150 active:scale-95 hover:scale-[1.02] bg-gradient-to-b from-blue-600 via-blue-700 to-indigo-800 text-white shadow-sm shadow-blue-950/40 hover:from-blue-500 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              >
                Double
              </button>
              <button
                onClick={rebet}
                disabled={lastActions.length === 0}
                className="cursor-pointer rounded-lg px-2.5 py-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all duration-150 active:scale-95 hover:scale-[1.02] bg-gradient-to-b from-purple-600 via-purple-700 to-violet-800 text-white shadow-sm shadow-purple-950/40 hover:from-purple-500 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              >
                Rebet
              </button>

                <button
                  onClick={spin}
                  disabled={spinning || total === 0}
                  className="cursor-pointer rounded-xl px-6 py-2 text-sm sm:text-base font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-950/50 transition-all duration-150 hover:brightness-110 active:scale-95 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none bg-gradient-to-b from-emerald-400 via-emerald-500 to-green-700"
                >
                  {spinning ? "Spinning" : "Spin"}
                </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
