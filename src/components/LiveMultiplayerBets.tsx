"use client";

import type { MultiplayerBet, MultiplayerState } from "@/lib/multiplayer-types";
import { poolRoundMessage } from "@/lib/multiplayer-types";

export function LiveMultiplayerBets({
  state, error, labels = {},
}: {
  state: MultiplayerState<unknown> | null;
  error?: string;
  labels?: Record<string, string>;
}) {
  const pending = state && state.round.phase === "result" ? poolRoundMessage(state.myBets) : null;
  return <div className="min-w-0">{pending && <p className="mb-2 rounded-lg border border-amber-300/30 bg-black/40 p-2 text-xs text-amber-200">{pending}</p>}<LiveBetActivity personal={state?.tableMode === "personal"} roundNo={state?.round.roundNo} bets={state?.bets ?? []} queuedBets={state?.queuedBets ?? []} error={error} labels={labels} /></div>;
}

export function LiveBetActivity({
  roundNo, bets: current, queuedBets = [], error, labels = {}, personal = false,
}: {
  roundNo?: number;
  bets: MultiplayerBet[];
  queuedBets?: MultiplayerBet[];
  error?: string;
  labels?: Record<string, string>;
  personal?: boolean;
}) {
  const bets = current.filter((bet) => bet.status !== "cancelled");
  const queued = queuedBets.filter((bet) => bet.status !== "cancelled");
  return (
    <section aria-label={personal ? "Your personal table bets" : "Real players live bets"} className="w-full min-w-0 rounded-xl border border-white/15 bg-black/30 p-2 text-white">
      <div className="flex flex-wrap items-center justify-between gap-1 text-xs font-bold">
        <span><span className="text-emerald-400">{personal ? "PERSONAL" : "LIVE"}</span> · {roundNo !== undefined ? `Round #${roundNo}` : "Connecting…"}</span>
        <span>{bets.length} bets · Rs. {bets.reduce((total, bet) => total + bet.amount, 0).toLocaleString("en-PK")}</span>
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-amber-300">{error}</p>}
      {roundNo !== undefined && bets.length === 0 && <p className="mt-1 text-xs text-white/60">{personal ? "No bets on your round yet." : "No player bets this round yet."}</p>}
      <div className="mt-1 max-h-36 overflow-y-auto overscroll-contain">
        {[...bets, ...queued].map((bet) => (
          <div key={bet.id} className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 border-t border-white/10 py-1 text-xs ${bet.mine ? "text-amber-200" : ""}`}>
            <span className="truncate">{bet.name}{bet.mine ? " (you)" : ""}</span>
            <span className="truncate">{labels[bet.option] ?? bet.option}{bet.roundNo > (roundNo ?? 0) ? " · next" : ""}</span>
            <span>Rs. {bet.amount.toLocaleString("en-PK")}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
