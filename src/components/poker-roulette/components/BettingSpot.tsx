"use client";

import { CATEGORY_NAMES, CATEGORY_ODDS } from "../lib/poker";

interface BettingSpotProps {
  category: number;
  bet: number;
  phase: "betting" | "dealing" | "result";
  outcome: "win" | "lose" | null;
  onPlaceBet: (category: number) => void;
}

export default function BettingSpot({ category, bet, phase, outcome, onPlaceBet }: BettingSpotProps) {
  const disabled = phase !== "betting";
  const odds = CATEGORY_ODDS[category];

  return (
    <button
      type="button"
      onClick={() => onPlaceBet(category)}
      disabled={disabled}
      aria-label={`Bet on ${CATEGORY_NAMES[category]}, standard odds ${odds} to 1 before total 2x gross return cap, current bet Rs. ${bet}`}
      className={[
        "betting-spot",
        bet > 0 ? "has-bet" : "",
        outcome === "win" ? "spot-win" : "",
        outcome === "lose" && bet > 0 ? "spot-lose" : "",
      ].join(" ")}
    >
      <span className="spot-name">{CATEGORY_NAMES[category]}</span>
      <span className="spot-odds">{odds}:1 · TOTAL ≤2x</span>
      <span className="spot-stack">
        {bet > 0 ? (
          <>
            <span className="chip-stack" aria-hidden="true">
              {Array.from({ length: Math.min(4, Math.max(1, Math.ceil(bet / 100))) }).map((_, i) => (
                <span key={i} className="chip-disc" style={{ bottom: `${i * 5}px` }} />
              ))}
            </span>
            <span className="spot-bet">Rs. {bet.toLocaleString()}</span>
          </>
        ) : (
          <span className="spot-empty">Place bet</span>
        )}
      </span>
    </button>
  );
}
