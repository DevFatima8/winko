"use client";
import { GameOverOverlay } from "@/components/GameOverOverlay";
import { gameSfx } from "@/lib/gameSfx";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMultiplayerGame } from "@/lib/useMultiplayerGame";
import { poolRoundMessage } from "@/lib/multiplayer-types";
import { LiveMultiplayerBets } from "@/components/LiveMultiplayerBets";
import type { BetType } from "./lib/baccarat";
import type { BaccaratOutcome } from "@/lib/multiplayer-rules";
import { BET_PRESETS } from "@/lib/betPresets";
import BetAmountInput from "@/components/BetAmountInput";
import { PlayingCard } from "./PlayingCard";
import "./baccarat.css";

const CHIP_STYLES = [
  { color: "from-red-400 to-red-600", ring: "ring-red-300", text: "text-white" },
  { color: "from-emerald-400 to-emerald-600", ring: "ring-emerald-300", text: "text-white" },
  { color: "from-sky-400 to-sky-600", ring: "ring-sky-300", text: "text-white" },
  { color: "from-violet-400 to-violet-600", ring: "ring-violet-300", text: "text-white" },
  { color: "from-amber-300 to-amber-500", ring: "ring-amber-200", text: "text-amber-950" },
];
const CHIPS = BET_PRESETS.map((value, i) => ({ value: value as number, ...CHIP_STYLES[i] }));

const BET_TIME = 10;
const money = (n: number) => `Rs. ${n.toLocaleString()}`;
const BET_LABEL: Record<BetType, string> = { player: "PLAYER", banker: "BANKER", tie: "TIE" };

export default function Baccarat({ backHref = "/player" }: { backHref?: string }) {
  const live = useMultiplayerGame<BaccaratOutcome>("baccarat");
  const [selectedChip, setSelectedChip] = useState(50);
  const [selectedSpot, setSelectedSpot] = useState<BetType>("player");
  const [dismissedRound, setDismissedRound] = useState<number | null>(null);
  const notified = useRef<number | null>(null);
  const state = live.state;
  const balance = state?.balance ?? 0;
  const phase = state?.round.phase === "running" ? "dealing" : state?.round.phase ?? "betting";
  const round = state?.round.result ?? null;
  const timeLeft = Math.max(0, Math.ceil(((state?.round.bettingEndsAt ?? live.now) - live.now) / 1000));
  const bettingOpen = !!state && phase === "betting" && live.now < state.round.bettingEndsAt && !live.busy;
  const revealCount = !state || !round ? 0 : phase === "result" ? 6 :
    Math.max(0, Math.floor((live.now - state.round.bettingEndsAt - 300) / 650) + 1);
  const personal = state?.myBets.filter((bet) => bet.status !== "cancelled") ?? [];
  const bets = personal.reduce((sum, bet) => {
    if (bet.option in sum) sum[bet.option as BetType] += bet.amount;
    return sum;
  }, { player: 0, banker: 0, tie: 0 });
  const totalBet = bets.player + bets.banker + bets.tie;
  const lastNet = personal.reduce((sum, bet) => sum + bet.payout - bet.amount, 0);
  const poolMessage = poolRoundMessage(personal);
  const messageType = phase === "result" && totalBet > 0 && !poolMessage ? lastNet > 0 ? "win" : lastNet < 0 ? "lose" : "neutral" : "neutral";
  const message = !state ? "Connecting to live table…" : phase === "betting" ? "Place your bets" : !round || phase !== "result" ? "No more bets" :
    phase === "result" && poolMessage ? poolMessage : `${BET_LABEL[round.winner]} WINS${totalBet > 0 ? lastNet > 0 ? `! You won ${money(lastNet)}` : lastNet < 0 ? "" : " · Push" : ""}`;
  const history = (state?.history ?? []).slice(0, 24).reverse().map(({ result }) => ({ winner: result.winner === "player" ? "P" : result.winner === "banker" ? "B" : "T" }));
  const stats = { p: history.filter((h) => h.winner === "P").length, b: history.filter((h) => h.winner === "B").length, t: history.filter((h) => h.winner === "T").length };

  useEffect(() => {
    if (!state || state.round.phase !== "result" || !personal.length || notified.current === state.round.roundNo) return;
    notified.current = state.round.roundNo;
    if (poolMessage) return;
    if (lastNet > 0) gameSfx.win();
    else if (lastNet < 0) gameSfx.lose();
  }, [state, personal.length, lastNet, poolMessage]);

  async function placeChip(type: BetType) {
    setSelectedSpot(type);
    if (!state || live.busy) return;
    const reply = await live.place(type, selectedChip);
    if (!("error" in reply)) gameSfx.chip();
  }

  function clearBets() {
    if (!state || live.busy) return;
    const target = state.round.roundNo + (state.round.phase === "betting" && live.now < state.round.bettingEndsAt ? 0 : 1);
    void live.cancel(target);
  }

  function nextRound() {
    setDismissedRound(state?.round.roundNo ?? null);
  }

  // Determine reveal for each card slot
  const pCards = round?.playerCards ?? [];
  const bCards = round?.bankerCards ?? [];
  // Interleave reveal: cards dealt P,B,P,B,(P3),(B3)
  const revealedPlayer = (index: number) => {
    // order: index0 -> 1st, banker0 -> 2nd, player1 -> 3rd, banker1 -> 4th ...
    const order = index === 0 ? 1 : index === 1 ? 3 : 5;
    return revealCount >= order;
  };
  const revealedBanker = (index: number) => {
    const order = index === 0 ? 2 : index === 1 ? 4 : pCards.length === 3 ? 6 : 5;
    return revealCount >= order;
  };

  const showTotals = phase === "result";

  return (
    <div className="flex h-full w-full flex-col justify-between overflow-y-auto overflow-x-hidden min-h-0 bg-[radial-gradient(circle_at_top,#0f3d2e_0%,#08231a_55%,#04120d_100%)] p-2 sm:p-3 text-white select-none">
      <div className="shrink-0 max-h-28 overflow-y-auto">
        <LiveMultiplayerBets state={live.state} error={live.error} labels={BET_LABEL} />
        {!!state?.myQueuedBets.some((bet) => bet.status === "pending") && <button onClick={() => void live.cancel(state.round.roundNo + 1)} disabled={live.busy} className="text-xs text-amber-300">Cancel next-round bets</button>}
      </div>
      {/* Compact Top Bar */}
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-white/10 px-1 pb-1">
        <div className="flex items-center gap-2">
          <Link
            href={backHref}
            className="flex h-7 items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-2 text-xs font-bold text-white transition hover:bg-white/20"
          >
            ← Back
          </Link>
          <span className="text-lg">🃏</span>
          <h1 className="text-sm sm:text-base font-black tracking-widest text-amber-300 drop-shadow">
            BACCARAT
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-black/50 px-3 py-1">
            <span className="text-[10px] uppercase tracking-wider text-amber-200/70">Balance</span>
            <span className="text-xs sm:text-sm font-bold text-amber-300">
              Rs. {balance.toLocaleString()}
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex flex-1 shrink-0 flex-col justify-between py-1">
        {/* Road / History */}
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto rounded-lg border border-white/10 bg-black/30 px-2 py-1">
          <div className="flex shrink-0 gap-2 px-1 text-[11px] font-semibold">
            <span className="text-sky-400 font-bold">P {stats.p}</span>
            <span className="text-rose-400 font-bold">B {stats.b}</span>
            <span className="text-emerald-400 font-bold">T {stats.t}</span>
          </div>
          <div className="mx-1 h-4 w-px bg-white/15" />
          <div className="flex min-h-[20px] flex-1 items-center gap-1">
            {history.length === 0 && (
              <span className="text-[11px] text-white/40">No rounds yet</span>
            )}
            {history.map((h, i) => (
              <span
                key={`${state?.round.roundNo}-${i}-${revealedPlayer(i)}`}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
                  h.winner === "P"
                    ? "bg-sky-500 text-white"
                    : h.winner === "B"
                      ? "bg-rose-500 text-white"
                      : "bg-emerald-500 text-white"
                }`}
              >
                {h.winner}
              </span>
            ))}
          </div>
        </div>

        {/* Felt Table */}
        <div className="relative my-auto flex flex-1 min-h-0 flex-col justify-center overflow-hidden rounded-2xl border-2 border-amber-900/50 bg-[radial-gradient(ellipse_at_center,#166e50_0%,#0c4634_70%,#083325_100%)] p-2 sm:p-3 shadow-2xl">
          <div className="pointer-events-none absolute inset-1.5 rounded-xl border border-amber-400/20" />

          {/* Cards Area */}
          <div className="relative flex flex-row items-center justify-around py-1">
            {/* Player */}
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-1.5">
                <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] sm:text-xs font-bold uppercase tracking-widest text-sky-300">
                  Player
                </span>
                {showTotals && (
                  <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-bold text-white">
                    {round?.playerTotal}
                  </span>
                )}
              </div>
              <div className="flex min-h-[5.5rem] items-center gap-1.5">
                {pCards.length === 0 ? (
                  <>
                    <div className="h-20 w-14 rounded-lg border-2 border-dashed border-white/20 sm:h-24 sm:w-16" />
                    <div className="h-20 w-14 rounded-lg border-2 border-dashed border-white/20 sm:h-24 sm:w-16" />
                  </>
                ) : (
                  pCards.map((c, i) => (
                    <PlayingCard
                      key={`${state?.round.roundNo}-${i}-${revealedBanker(i)}`}
                      card={c}
                      faceDown={!revealedPlayer(i)}
                      delay={i * 60}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="text-sm sm:text-base font-black text-amber-400/60">VS</div>

            {/* Banker */}
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-1.5">
                <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] sm:text-xs font-bold uppercase tracking-widest text-rose-300">
                  Banker
                </span>
                {showTotals && (
                  <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-bold text-white">
                    {round?.bankerTotal}
                  </span>
                )}
              </div>
              <div className="flex min-h-[5.5rem] items-center gap-1.5">
                {bCards.length === 0 ? (
                  <>
                    <div className="h-20 w-14 rounded-lg border-2 border-dashed border-white/20 sm:h-24 sm:w-16" />
                    <div className="h-20 w-14 rounded-lg border-2 border-dashed border-white/20 sm:h-24 sm:w-16" />
                  </>
                ) : (
                  bCards.map((c, i) => (
                    <PlayingCard
                      key={i}
                      card={c}
                      faceDown={!revealedBanker(i)}
                      delay={i * 60}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Message Bar */}
          <div className="my-1 flex justify-center">
            <div
              className={`rounded-full px-4 py-1 text-center text-xs sm:text-sm font-bold tracking-wide transition-all ${
                messageType === "win"
                  ? "bg-emerald-500/30 text-emerald-300 ring-1 ring-emerald-400/50"
                  : messageType === "lose"
                    ? "bg-rose-500/30 text-rose-300 ring-1 ring-rose-400/50"
                    : "bg-black/40 text-amber-200"
              }`}
            >
              {message}
              {phase === "betting" && ` · ${timeLeft}s`}
            </div>
          </div>

          {/* Betting Spots */}
          <div className="mt-1 grid grid-cols-3 gap-2">
            <BetSpot
              label="PLAYER"
              sub="1 : 1"
              amount={bets.player}
              accent="sky"
              active={round?.winner === "player" && phase === "result"}
              selected={selectedSpot === "player"}
              onClick={() => placeChip("player")}
              disabled={!bettingOpen}
            />
            <BetSpot
              label="TIE"
              sub={state?.tableMode === "personal" ? "1 : 1" : "8 : 1"}
              amount={bets.tie}
              accent="emerald"
              active={round?.winner === "tie" && phase === "result"}
              selected={selectedSpot === "tie"}
              onClick={() => placeChip("tie")}
              disabled={!bettingOpen}
            />
            <BetSpot
              label="BANKER"
              sub="0.95 : 1"
              amount={bets.banker}
              accent="rose"
              active={round?.winner === "banker" && phase === "result"}
              selected={selectedSpot === "banker"}
              onClick={() => placeChip("banker")}
              disabled={!bettingOpen}
            />
          </div>
        </div>

        {/* Chips Selector */}
        <div className="shrink-0 flex flex-wrap items-center justify-center gap-2 py-1">
          {CHIPS.map((chip) => (
            <button
              key={chip.value}
              onClick={() => setSelectedChip(chip.value)}
              className={`relative flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-gradient-to-br ${chip.color} ${chip.text} text-xs font-black shadow-lg ring-2 transition-all disabled:opacity-40 cursor-pointer ${
                selectedChip === chip.value
                  ? `scale-110 ${chip.ring} ring-offset-2 ring-offset-[#08231a]`
                  : "ring-white/30 hover:scale-105"
              }`}
            >
              <span className="absolute inset-1 rounded-full border border-dashed border-white/40" />
              {chip.value >= 1000 ? `${chip.value / 1000}K` : chip.value}
            </button>
          ))}
          <BetAmountInput
            value={selectedChip}
            onChange={setSelectedChip}
          />
        </div>

        {/* Action Buttons: START -> GREEN, STOP/CLEAR -> RED */}
        <div className="shrink-0 flex items-center justify-center gap-2 pt-1">
          {phase === "betting" && (
            <>
              <button
                onClick={clearBets}
                disabled={totalBet === 0}
                className="flex items-center justify-center rounded-xl bg-gradient-to-r from-rose-600 to-red-700 px-5 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wider text-white shadow-md shadow-rose-950/40 transition-all hover:from-rose-500 hover:to-red-600 hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-30 cursor-pointer"
              >
                Clear
              </button>
              <button
                onClick={() => void placeChip(selectedSpot)}
                disabled={!bettingOpen || selectedChip < 10}
                className="flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-4 sm:px-8 py-2.5 text-xs sm:text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-950/50 transition-all hover:from-emerald-400 hover:to-green-500 hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-30 cursor-pointer"
              >
                {live.busy ? "Placing…" : `Place bet · ${BET_LABEL[selectedSpot]} · Rs. ${selectedChip.toLocaleString()}`}
              </button>
            </>
          )}

          {phase === "dealing" && (
            <div className="rounded-xl bg-black/60 px-8 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-widest text-amber-200 ring-1 ring-white/10">
              Dealing cards...
            </div>
          )}

          {phase === "result" && (
            <button
              onClick={nextRound}
              className="flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-8 py-2.5 text-xs sm:text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-950/50 transition-all hover:from-emerald-400 hover:to-green-500 hover:scale-105 active:scale-95 cursor-pointer"
            >
              Continue watching
            </button>
          )}
        </div>

        <div className="shrink-0 pt-1 text-center text-[11px] font-bold text-amber-200" role="status">
          Bets placed · {money(totalBet)}
          {live.error && <span className="block text-rose-300">{live.error}</span>}
        </div>

        {balance <= 0 && phase !== "dealing" && (
          <div className="mt-1 flex items-center justify-between rounded-xl border border-rose-500/40 bg-rose-950/60 px-3 py-1.5 text-center">
            <p className="text-xs font-bold text-rose-300">Out of chips!</p>
            <Link
              href="/player/deposit"
              className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 cursor-pointer"
            >
              Deposit
            </Link>
          </div>
        )}
      </div>
      <GameOverOverlay open={phase === "result" && totalBet > 0 && !!round && dismissedRound !== state?.round.roundNo} winAmount={lastNet > 0 ? lastNet : 0} result={message} onPlayAgain={nextRound} onClose={nextRound} />
    </div>
  );
}

function BetSpot({
  label,
  sub,
  amount,
  accent,
  active,
  selected = false,
  onClick,
  disabled,
}: {
  label: string;
  sub: string;
  amount: number;
  accent: "sky" | "rose" | "emerald";
  active: boolean;
  selected?: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  const accentMap = {
    sky: "border-sky-400/50 hover:border-sky-300 text-sky-200",
    rose: "border-rose-400/50 hover:border-rose-300 text-rose-200",
    emerald: "border-emerald-400/50 hover:border-emerald-300 text-emerald-200",
  } as const;

  const glowMap = {
    sky: "shadow-[0_0_25px_rgba(56,189,248,0.6)] border-sky-300 bg-sky-500/20",
    rose: "shadow-[0_0_25px_rgba(251,113,133,0.6)] border-rose-300 bg-rose-500/20",
    emerald:
      "shadow-[0_0_25px_rgba(52,211,153,0.6)] border-emerald-300 bg-emerald-500/20",
  } as const;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative flex flex-col items-center justify-center gap-1 rounded-2xl border-2 bg-black/25 px-2 py-5 transition disabled:cursor-not-allowed ${
        active ? glowMap[accent] : accentMap[accent]
      } ${!disabled ? "hover:bg-black/40 active:scale-[0.98]" : ""} ${selected && !active ? "ring-2 ring-amber-300" : ""}`}
    >
      <span className="text-base font-black tracking-wider sm:text-lg">
        {label}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-white/50">
        {sub}
      </span>
      {amount > 0 && (
        <span className="mt-1 flex h-8 min-w-8 items-center justify-center rounded-full bg-amber-400 px-2 text-xs font-black text-amber-950 shadow">
          Rs. {amount.toLocaleString()}
        </span>
      )}
    </button>
  );
}
