"use client";

import { chipBreakdown, formatMoney } from "./lib/poker";
import { MiniChip } from "./ChipButton";

type BettingSpotProps = {
  label: string;
  sub?: string;
  amount: number;
  active?: boolean;
  disabled?: boolean;
  accent?: "gold" | "blue" | "red";
  onClick: () => void;
  onClear?: () => void;
};

export function BettingSpot({
  label,
  sub,
  amount,
  active,
  disabled,
  accent = "gold",
  onClick,
  onClear,
}: BettingSpotProps) {
  const chips = amount > 0 ? chipBreakdown(amount) : [];

  return (
    <div className={`bet-spot accent-${accent} ${active ? "is-active" : ""} ${amount > 0 ? "has-bet" : ""}`}>
      <button type="button" className="bet-hit" disabled={disabled} onClick={onClick}>
        <span className="bet-label">{label}</span>
        {sub ? <span className="bet-sub">{sub}</span> : null}
        <span className="bet-chip-stack">
          {chips.map((chip, i) => (
            <span key={`${chip}-${i}`} className="bet-chip-wrap" style={{ bottom: i * 5 }}>
              <MiniChip value={chip} />
            </span>
          ))}
        </span>
      </button>
      {amount > 0 ? (
        <div className="bet-amount-row">
          <span className="bet-amount">{formatMoney(amount)}</span>
          {onClear && !disabled ? (
            <button type="button" className="bet-clear" onClick={onClear} aria-label={`Clear ${label}`}>
              ×
            </button>
          ) : null}
        </div>
      ) : (
        <div className="bet-amount-row">
          <span className="bet-amount ghost">Rs. 0</span>
        </div>
      )}
    </div>
  );
}
