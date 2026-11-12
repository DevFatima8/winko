"use client";

import type { ReactNode } from "react";
import { BET_PRESETS } from "@/lib/betPresets";

import {
  CHIP_STYLES,
  MARKETS,
  MIN_BET,
  OUTCOMES,
  TEAMS,
  WIN_RATE,
  formatCoins,
  formatOvers,
  runRate,
  type ActiveBet,
  type BallRecord,
  type BetRecord,
  type Market,
  type Match,
  type OutcomeId,
  type Phase,
  type Stats,
} from "./lib/engine";

/* ------------------------------------------------------------------ */
/*  Small ball chip                                                    */
/* ------------------------------------------------------------------ */

export function BallChip({
  outcome,
  size = "md",
  ring,
  className = "",
}: {
  outcome: OutcomeId;
  size?: "sm" | "md";
  ring?: "win" | "loss" | null;
  className?: string;
}) {
  const dims = size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm";
  const ringCls =
    ring === "win"
      ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-[#0d1528]"
      : ring === "loss"
        ? "ring-2 ring-red-500 ring-offset-2 ring-offset-[#0d1528]"
        : "";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-extrabold shadow-md ${dims} ${CHIP_STYLES[outcome]} ${ringCls} ${className}`}
    >
      {OUTCOMES[outcome].chip}
    </span>
  );
}

function Card({
  title,
  right,
  children,
  className = "",
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-[#0d1528] ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-2.5">
          <h2 className="text-xs font-extrabold uppercase tracking-[0.16em] text-slate-300">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Scorecard                                                          */
/* ------------------------------------------------------------------ */

export function Scorecard({ match, commentary }: { match: Match; commentary: string }) {
  const team = TEAMS[match.batting];
  const other = TEAMS[match.batting === 0 ? 1 : 0];
  const ballsLeft = 120 - match.balls;
  const need = match.target !== null ? match.target - match.runs : null;
  const slots = Array.from({ length: 6 }, (_, i) => match.thisOver[i] ?? null);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl leading-none">{team.flag}</span>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {team.name} batting · vs {other.code}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black tabular-nums text-white">
                {match.runs}/{match.wickets}
              </span>
              <span className="text-sm font-semibold text-slate-400">({formatOvers(match.balls)} ov)</span>
            </div>
          </div>
        </div>

        <div className="flex gap-5 text-center">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">CRR</div>
            <div className="text-lg font-extrabold tabular-nums text-amber-300">{runRate(match.runs, match.balls)}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {need !== null ? "Need" : "Innings"}
            </div>
            <div className="text-lg font-extrabold tabular-nums text-white">
              {need !== null ? `${Math.max(need, 0)} off ${ballsLeft}` : "1st"}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">This over</div>
          <div className="flex gap-1.5">
            {slots.map((s, i) =>
              s ? (
                <BallChip key={`${match.balls}-${i}`} outcome={s} size="sm" />
              ) : (
                <span
                  key={i}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-white/20 text-[10px] text-slate-600"
                >
                  ·
                </span>
              ),
            )}
          </div>
        </div>
      </div>
      <div className="flex items-start gap-2 border-t border-white/[0.07] bg-black/20 px-4 py-2.5 text-sm text-slate-300">
        <span aria-hidden>🎙️</span>
        <p key={commentary} className="nw-fade-up leading-snug">
          {commentary}
        </p>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Last balls strip                                                   */
/* ------------------------------------------------------------------ */

export function BallStrip({ balls }: { balls: BallRecord[] }) {
  return (
    <Card title="Last balls" right={<Legend />}>
      <div className="nw-scroll flex gap-2.5 overflow-x-auto px-4 py-3.5">
        {balls.map((b, idx) => (
          <BallChip
            key={b.id}
            outcome={b.outcome}
            ring={b.won === null ? null : b.won ? "win" : "loss"}
            className={idx === 0 ? "nw-slide-in" : ""}
          />
        ))}
      </div>
    </Card>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-400">
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-full ring-2 ring-emerald-400" /> Won
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-full ring-2 ring-red-500" />
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Markets                                                            */
/* ------------------------------------------------------------------ */

export function MarketGrid({
  selectedId,
  bet,
  locked,
  onSelect,
}: {
  selectedId: string | null;
  bet: ActiveBet | null;
  locked: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <Card
      title="Next ball · Pick your market"
      right={<span className="text-[10px] font-semibold text-slate-500">Odds shown as multipliers</span>}
    >
      <div className="grid grid-cols-2 gap-2.5 p-3 sm:grid-cols-4">
        {MARKETS.map((m) => {
          const selected = selectedId === m.id;
          const placed = bet?.marketId === m.id;
          return (
            <button
              key={m.id}
              type="button"
              disabled={locked}
              onClick={() => onSelect(m.id)}
              className={`group relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition ${
                placed
                  ? "border-emerald-400 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(52,211,153,0.5),0_0_24px_rgba(52,211,153,0.25)]"
                  : selected
                    ? "border-amber-400 bg-amber-400/10 shadow-[0_0_0_1px_rgba(251,191,36,0.5),0_0_24px_rgba(251,191,36,0.2)]"
                    : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"
              } ${locked && !placed ? "cursor-not-allowed opacity-45" : "cursor-pointer active:scale-[0.98]"}`}
            >
              <div className="flex w-full items-center justify-between">
                <span
                  className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-sm font-black shadow-md ${m.badgeClass}`}
                >
                  {m.badge}
                </span>
                <span className="rounded-md bg-black/40 px-2 py-1 text-sm font-black tabular-nums text-amber-300">
                  {m.odds.toFixed(2)}x
                </span>
              </div>
              <div>
                <div className="text-sm font-extrabold text-white">{m.label}</div>
                <div className="text-[11px] text-slate-400">{m.hint}</div>
              </div>
              {placed && bet && (
                <span className="absolute -top-2 right-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-extrabold text-white shadow">
                  BET {formatCoins(bet.stake)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Bet slip                                                           */
/* ------------------------------------------------------------------ */

const CHIPS: number[] = [...BET_PRESETS];

export function BetSlip({
  phase,
  timeLeft,
  market,
  stake,
  setStake,
  balance,
  bet,
  lastBet,
  onPlace,
  onCancel,
  onRebet,
  onBowlNow,
  onAddCoins,
}: {
  phase: Phase;
  timeLeft: number;
  market: Market | null;
  stake: number;
  setStake: (n: number) => void;
  balance: number;
  bet: ActiveBet | null;
  lastBet: ActiveBet | null;
  onPlace: () => void;
  onCancel: () => void;
  onRebet: () => void;
  onBowlNow: () => void;
  onAddCoins: () => void;
}) {
  const clamp = (n: number) => Math.max(0, Math.floor(n));
  const canBet = phase === "betting" && !bet;
  const insufficient = stake > balance;
  const invalid = !market || stake < MIN_BET || insufficient;
  const potential = market ? Math.round(stake * market.odds) : 0;
  const betMarket = bet ? MARKETS.find((m) => m.id === bet.marketId) : null;

  let cta = "PLACE BET";
  if (!market) cta = "SELECT A MARKET";
  else if (stake < MIN_BET) cta = `MIN BET ${MIN_BET}`;
  else if (insufficient) cta = "NOT ENOUGH Rs.";
  if (phase === "bowling") cta = "BALL IN PLAY…";
  if (phase === "result") cta = "NEXT ROUND STARTING…";

  return (
    <Card
      title="Bet slip"
      right={
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          {phase === "betting" ? `Closes in ${timeLeft}s` : "Bets closed"}
        </span>
      }
    >
      <div className="space-y-4 p-4">
        {/* selection */}
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
          {market ? (
            <>
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-sm font-black ${market.badgeClass}`}
                >
                  {market.badge}
                </span>
                <div>
                  <div className="text-sm font-extrabold text-white">{market.label}</div>
                  <div className="text-[11px] text-slate-400">{market.hint}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Odds</div>
                <div className="text-lg font-black tabular-nums text-amber-300">{market.odds.toFixed(2)}x</div>
              </div>
            </>
          ) : (
            <p className="w-full py-1 text-center text-sm text-slate-400">Tap a market to add it to your slip</p>
          )}
        </div>

        {/* stake */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-slate-400">
            <span>Stake</span>
            <span className="font-semibold normal-case tracking-normal text-slate-500">
              Min {MIN_BET} · Max {formatCoins(Math.floor(balance))}
            </span>
          </div>
          <div className="flex items-center rounded-xl border border-white/10 bg-black/30 focus-within:border-amber-400/70">
            <span className="pl-3 text-sm font-black text-amber-300">Rs.</span>
            <input
              inputMode="numeric"
              disabled={!canBet}
              value={stake ? String(stake) : ""}
              placeholder="0"
              onChange={(e) => setStake(clamp(parseInt(e.target.value.replace(/\D/g, ""), 10) || 0))}
              className="w-full bg-transparent px-2 py-2.5 text-xl font-extrabold tabular-nums text-white outline-none placeholder:text-slate-600 disabled:opacity-50"
            />
            <button
              type="button"
              disabled={!canBet}
              onClick={() => setStake(clamp(stake / 2))}
              className="border-l border-white/10 px-3 py-2.5 text-xs font-extrabold text-slate-300 hover:bg-white/5 disabled:opacity-40"
            >
              ½
            </button>
            <button
              type="button"
              disabled={!canBet}
              onClick={() => setStake(clamp(stake * 2))}
              className="border-l border-white/10 px-3 py-2.5 text-xs font-extrabold text-slate-300 hover:bg-white/5 disabled:opacity-40"
            >
              2×
            </button>
            <button
              type="button"
              disabled={!canBet}
              onClick={() => setStake(clamp(balance))}
              className="rounded-r-xl border-l border-white/10 px-3 py-2.5 text-xs font-extrabold text-amber-300 hover:bg-white/5 disabled:opacity-40"
            >
              MAX
            </button>
          </div>

          <div className="mt-2.5 grid grid-cols-5 gap-1.5">
            {CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                disabled={!canBet}
                onClick={() => setStake(clamp(c))}
                className={`rounded-lg border py-2 text-xs font-extrabold tabular-nums transition disabled:opacity-40 ${
                  stake === c
                    ? "border-amber-400 bg-amber-400/15 text-amber-300"
                    : "border-white/10 bg-white/[0.04] text-slate-200 hover:border-white/30"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* payout preview */}
        <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-emerald-500/10 to-transparent px-3 py-2.5">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Potential win</span>
          <span className="text-lg font-black tabular-nums text-emerald-400">
            {market && stake >= MIN_BET ? `+${formatCoins(potential - stake)}` : "—"}
          </span>
        </div>

        {/* actions */}
        {bet && betMarket ? (
          <div className="space-y-2.5">
            <div className="rounded-xl border border-emerald-400/50 bg-emerald-500/10 p-3 text-center">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-emerald-300">
                ✔ Bet placed
              </div>
              <div className="mt-1 text-sm font-bold text-white">
                {betMarket.label} · {formatCoins(bet.stake)} @ {bet.odds.toFixed(2)}x
              </div>
            </div>
            {phase === "betting" && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-xl border border-rose-500/40 bg-rose-500/20 hover:bg-rose-500/35 hover:border-rose-400 py-2.5 sm:py-3 text-xs sm:text-sm font-extrabold text-rose-300 transition active:scale-95"
                >
                  Cancel bet
                </button>
                <button
                  type="button"
                  onClick={onBowlNow}
                  className="rounded-xl bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 py-2.5 sm:py-3 text-xs sm:text-sm font-extrabold text-white shadow-lg shadow-blue-900/40 transition hover:brightness-110 active:scale-95"
                >
                  Refresh live table ↻
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            <button
              type="button"
              disabled={!canBet || invalid}
              onClick={onPlace}
              className={`w-full rounded-xl py-3.5 text-base font-black tracking-wide transition active:scale-98 disabled:cursor-not-allowed disabled:bg-slate-700/50 disabled:text-slate-400 disabled:shadow-none ${
                !invalid && canBet
                  ? "bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-600 hover:from-emerald-400 hover:to-green-400 text-white shadow-[0_0_25px_rgba(16,185,129,0.5)]"
                  : "bg-gradient-to-r from-amber-400 to-yellow-500 text-black shadow-md"
              }`}
            >
              {cta}
            </button>
            {lastBet && (
              <button
                type="button"
                disabled={!canBet || lastBet.stake > balance}
                onClick={onRebet}
                className="w-full rounded-xl border border-amber-400/40 bg-amber-400/10 hover:bg-amber-400/20 py-2.5 text-xs sm:text-sm font-bold text-amber-300 transition active:scale-95 disabled:opacity-40"
              >
                ↻ Rebet {MARKETS.find((m) => m.id === lastBet.marketId)?.label} · {formatCoins(lastBet.stake)}
              </button>
            )}
            {insufficient && (
              <button
                type="button"
                onClick={onAddCoins}
                className="w-full rounded-xl border border-amber-400/50 bg-amber-400/10 py-2.5 text-sm font-bold text-amber-300 transition hover:bg-amber-400/20"
              >
                Open wallet
              </button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Stats + history                                                    */
/* ------------------------------------------------------------------ */

export function StatsHistory({ stats, history }: { stats: Stats; history: BetRecord[] }) {
  return (
    <Card title="My bets">
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2 text-center">
          <Stat label="Total Bets" value={String(stats.bets)} />
          <Stat label="Match Status" value="LIVE" tone="text-emerald-400" />
        </div>
      </div>

      <div className="nw-scroll max-h-72 overflow-y-auto border-t border-white/[0.07]">
        {history.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">No bets yet. Place your first bet!</p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {history.map((h, index) => (
              <li key={`${h.id}-${index}`} className="nw-fade-up flex items-center gap-3 px-4 py-2.5">
                <BallChip outcome={h.outcome} size="sm" ring={h.win ? "win" : "loss"} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-white">
                    {h.marketLabel} <span className="text-xs font-semibold text-slate-500">@ {h.odds.toFixed(2)}x</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Ball #{h.id} · {OUTCOMES[h.outcome].label} · Stake {formatCoins(h.stake)}
                  </div>
                </div>
                <div className={`text-sm font-black tabular-nums ${h.win ? "text-emerald-400" : "text-red-400"}`}>
                  {h.win ? `+${formatCoins(h.payout - h.stake)}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-black/25 px-1 py-2">
      <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{label}</div>
      <div className={`text-base font-black tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Rules modal                                                        */
/* ------------------------------------------------------------------ */

export function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="nw-fade-up nw-scroll max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#0d1528] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black text-white">How to play · 9 Wickets Live</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-bold text-white hover:bg-white/20"
          >
            ✕
          </button>
        </div>
        <ol className="space-y-2.5 text-sm leading-relaxed text-slate-300">
          <li>
            <b className="text-amber-300">1.</b> Every round you get <b>12 seconds</b> to bet on the result of the next
            ball – a dot ball, 1 run, 2 runs, FOUR, SIX, WICKET, or a combined market.
          </li>
          <li>
            <b className="text-amber-300">2.</b> Choose a market, set your stake with the chips, and press{" "}
            <b>Place bet</b>. You can cancel before the timer ends. Shared rounds start automatically for everyone.
          </li>
          <li>
            <b className="text-amber-300">3.</b> The bowler runs in and the ball is bowled. If your market comes true you
            win <b>stake × odds</b>, otherwise the stake is lost.
          </li>
          <li>
            <b className="text-amber-300">4.</b> The server credits settled payouts after the platform share. Bets after the window closes reserve stakes for the next shared ball.
          </li>
        </ol>

        <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-[11px] uppercase tracking-widest text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">Market</th>
                <th className="px-3 py-2 text-left">Wins when</th>
                <th className="px-3 py-2 text-right">Pays</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-200">
              {MARKETS.map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-1.5 font-bold">{m.label}</td>
                  <td className="px-3 py-1.5 text-slate-400">{m.hint}</td>
                  <td className="px-3 py-1.5 text-right font-black tabular-nums text-amber-300">{m.odds.toFixed(2)}x</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 rounded-lg bg-amber-400/10 px-3 py-2.5 text-xs leading-relaxed text-amber-200">
          All amounts are in <b>Rs.</b> Your balance and wagers are stored on the server and do not reset on refresh. Play responsibly.
        </p>
      </div>
    </div>
  );
}
