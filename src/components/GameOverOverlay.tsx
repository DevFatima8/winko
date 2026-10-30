"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Great_Vibes } from "next/font/google";
import styles from "./GameOverOverlay.module.css";

const resultFont = Great_Vibes({ subsets: ["latin"], weight: "400", display: "swap" });
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

export function GameResultMessage({ title, result, winAmount, onDismiss, children }: {
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
  const isLoss = title === "You lose";
  const amount = isWin && typeof winAmount === "number" && Number.isFinite(winAmount) && winAmount > 0
    ? `Rs. ${winAmount.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[120] flex items-center justify-center px-4" role="status" aria-live="polite">
      <div className={`${styles.message} w-full max-w-sm text-center`}>
        <h2 className={`${styles.heading} ${isLoss ? styles.loss : ""}`} style={{ fontWeight: isLoss ? 800 : 400 }}>
          {isWin ? <><span className={`${styles.congratulations} ${resultFont.className} block`} style={{ fontWeight: 400 }}>Congratulations!</span><span className={`${styles.winnings} block`} style={{ fontWeight: 800 }}>{amount ? `You won ${amount}` : "You won"}</span></> : title}
        </h2>
        {!isLoss && result && (!isWin || !amount || /\b(pending|provisional)\b/i.test(result)) && <p className={`${styles.detail} mt-2 text-pretty text-xs font-semibold leading-relaxed text-white sm:text-sm`}>{result}</p>}
        {!isLoss && children}
      </div>
    </div>
  );
}

export function GameOverOverlay({ open, result, title, winAmount, children }: GameOverOverlayProps) {
  const shared = useContext(SharedGameResults);
  if (shared || !open) return null;
  const heading = title ?? (/\b(pending|provisional|claim)\b/i.test(result) ? "Round complete"
    : /\byou (win|won)\b/i.test(result) ? "Congratulations! You win"
    : /\b(no win|you lose)\b/i.test(result) ? "You lose" : "Round complete");
  return (
    <GameResultMessage key={`${heading}:${result}:${winAmount ?? ""}`} title={heading} winAmount={winAmount} result={/^(no win|you lose)[.!]?$/i.test(result.trim()) ? "" : result}>{children}</GameResultMessage>
  );
}
