"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const SharedGameResults = createContext(false);

type GameOverOverlayProps = {
  open: boolean;
  result: string;
  title?: string;
  winAmount?: number;
  children?: ReactNode;
  onPlayAgain?: () => void;
  onClose?: () => void;
};

export function GameResultMessage({ title, result, winAmount, onDismiss }: {
  title: string;
  result: string;
  winAmount?: number;
  onDismiss?: () => void;
  children?: ReactNode;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, 2000);
    return () => clearTimeout(timer);
  }, [onDismiss]);
  if (!visible) return null;
  const isWin = title === "Congratulations! You win";
  const amount = isWin && typeof winAmount === "number" && Number.isFinite(winAmount) && winAmount > 0
    ? `Rs. ${winAmount.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;
  return amount ? (
    <div className="pointer-events-none fixed right-4 top-20 z-[120] max-w-[calc(100vw-2rem)] text-right text-xs font-semibold text-green-400" role="status" aria-live="polite">
      {`Win ${amount}`}
      {/\b(pending|provisional)\b/i.test(result) && <p className="mt-1 text-[10px] text-white">{result}</p>}
    </div>
  ) : null;
}

export function GameOverOverlay({ open, result, title, winAmount, children }: GameOverOverlayProps) {
  const shared = useContext(SharedGameResults);
  if (shared || !open) return null;
  const heading = title ?? (/\b(pending|provisional|claim)\b/i.test(result) ? "Round complete"
    : /\byou (win|won)\b/i.test(result) ? "Congratulations! You win"
    : /\b(no win|you lose)\b/i.test(result) ? "You lose" : "Round complete");
  if (heading === "You lose") return null;
  return (
    <GameResultMessage key={`${heading}:${result}:${winAmount ?? ""}`} title={heading} winAmount={winAmount} result={/^(no win|you lose)[.!]?$/i.test(result.trim()) ? "" : result}>{children}</GameResultMessage>
  );
}
