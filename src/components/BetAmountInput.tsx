"use client";

import { useEffect, useState } from "react";

interface BetAmountInputProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  max?: number;
  className?: string;
  label?: string;
}

/** Free custom bet amount (Rs.) shown next to the quick chips. */
export default function BetAmountInput({
  value,
  onChange,
  disabled,
  max,
  className = "",
  label = "Rs.",
}: BetAmountInputProps) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  return (
    <label
      className={`inline-flex items-center gap-1 rounded-lg border border-white/25 bg-black/50 px-2 py-1 text-xs font-bold text-white ${className}`}
    >
      <span className="text-amber-300">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={10}
        max={max}
        step={1}
        disabled={disabled}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Math.floor(Number(e.target.value));
          if (Number.isFinite(n) && n >= 10) onChange(max ? Math.min(n, max) : n);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setText(String(value));
        }}
        aria-label="Custom bet amount"
        className="w-20 bg-transparent text-right text-white outline-none disabled:opacity-40"
      />
    </label>
  );
}
