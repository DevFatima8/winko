"use client";

import {
  ALL_SPOTS,
  MULTIPLIER_SPOTS,
  PAYOUT,
  SPOT_THEME,
  formatMoney,
  type SpotId,
} from "../game/config";
import { ChipStack } from "./Chip";
import type { Bets } from "../game/engine";
import type { CSSProperties } from "react";

type Props = {
  bets: Bets;
  locked: boolean;
  winningSpot: SpotId | null;
  tableMultiplier: number;
  balance: number;
  onPlace: (spot: SpotId) => void;
  onRemove: (spot: SpotId) => void;
};

export default function BettingBoard({
  bets,
  locked,
  winningSpot,
  tableMultiplier,
  balance,
  onPlace,
  onRemove,
}: Props) {
  const totalBet = ALL_SPOTS.reduce((sum, s) => sum + (bets[s] ?? 0), 0);

  return (
    <div className="panel rounded-2xl p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-black tracking-[0.22em] text-violet-200/70 uppercase">
            Betting spots
          </span>
          {tableMultiplier > 1 ? (
            <span className="rounded-full bg-cyan-400/20 px-2 py-0.5 text-[11px] font-black text-cyan-200 ring-1 ring-cyan-300/50">
              TABLE ×{tableMultiplier}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-[11px] font-bold tracking-wide text-violet-200/70">
          <span>
            ON TABLE:{" "}
            <span className="text-amber-200 tabular-nums">{formatMoney(totalBet)}</span>
          </span>
          <span className="hidden sm:inline">
            AVAILABLE:{" "}
            <span className="text-emerald-300 tabular-nums">{formatMoney(balance)}</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5 sm:gap-2 lg:grid-cols-8">
        {ALL_SPOTS.map((spot) => {
          const theme = SPOT_THEME[spot];
          const stake = bets[spot] ?? 0;
          const isMultiplier = (MULTIPLIER_SPOTS as string[]).includes(spot);
          const isWinner = winningSpot === spot;
          const affordable = stake > 0 || balance > 0;
          return (
            <button
              key={spot}
              type="button"
              disabled={locked || !affordable}
              onClick={() => onPlace(spot)}
              onContextMenu={(event) => {
                event.preventDefault();
                onRemove(spot);
              }}
              style={
                {
                  "--tile-glow": theme.glow,
                  background: `linear-gradient(175deg, ${theme.face} 0%, ${theme.faceDeep} 100%)`,
                } as CSSProperties
              }
              className={`group relative h-14 sm:h-16 md:h-18 overflow-hidden rounded-xl border border-white/25 pb-1 transition-all duration-150
                ${isWinner ? "tile-live z-10 scale-[1.04]" : "shadow-[0_4px_12px_-4px_rgba(0,0,0,0.8)]"}
                ${locked ? "cursor-not-allowed opacity-80" : "hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"}
              `}
            >
              <span
                className="pointer-events-none absolute inset-0 opacity-70"
                style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 45%)" }}
              />
              <span className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-black/25" />
              <span
                className="relative block pt-1 text-center text-xl sm:text-2xl md:text-3xl font-black tracking-tight"
                style={{ color: theme.text, textShadow: "0 2px 0 rgba(0,0,0,0.25)" }}
              >
                {spot}
              </span>
              <span
                className="relative block text-center text-[8px] sm:text-[9px] font-extrabold tracking-[0.1em] uppercase opacity-80"
                style={{ color: theme.text }}
              >
                {isMultiplier ? "mult" : `${PAYOUT[spot]}:1`}
              </span>
              <ChipStack amount={stake} size={22} />
              {isWinner ? (
                <span className="pointer-events-none absolute inset-0 rounded-xl bg-white/25 mix-blend-overlay" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
