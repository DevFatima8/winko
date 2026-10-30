"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, animate, motion } from "framer-motion";
import { Frown, Handshake, Trophy } from "lucide-react";
import { formatChips, type Zone } from "../lib/teen-patti";

/* ── Animated balance number ───────────────────────────────────────────────── */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);

  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = formatChips(Math.round(v));
      },
    });
    prev.current = value;
    return () => controls.stop();
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {formatChips(value)}
    </span>
  );
}

/* ── Hand rank badge under each hand ──────────────────────────────────────── */
export function HandBadge({ name, visible, winner }: { name: string; visible: boolean; winner: boolean }) {
  return (
    <div className="flex h-8 items-center justify-center">
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ scale: 0, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 18 }}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-cinzel text-[10px] font-bold tracking-[0.18em] md:text-xs ${
              winner
                ? "border-amber-300/80 bg-amber-400/15 text-amber-200 shadow-[0_0_18px_rgba(245,196,81,0.35)]"
                : "border-white/15 bg-black/50 text-white/60"
            }`}
          >
            {winner && <Trophy className="h-3 w-3" />}
            {name}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Result banner ─────────────────────────────────────────────────────────── */
export interface ResultInfo {
  kind: "win" | "lose" | "push";
  amount: number; // net change
  headline: string;
  detail: string;
}

export function ResultBanner({ result }: { result: ResultInfo | null }) {
  return (
    <AnimatePresence>
      {result && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-30 grid place-items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ scale: 0.4, y: 40, opacity: 0, rotate: -4 }}
            animate={{ scale: 1, y: 0, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.6, opacity: 0, y: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className={`relative overflow-hidden rounded-3xl border-2 px-10 py-6 text-center backdrop-blur-md md:px-16 md:py-8 ${
              result.kind === "win"
                ? "border-amber-300/80 bg-[linear-gradient(160deg,rgba(64,45,5,0.92),rgba(20,14,2,0.94))] shadow-[0_0_80px_rgba(245,196,81,0.45)]"
                : result.kind === "push"
                  ? "border-slate-300/40 bg-[linear-gradient(160deg,rgba(30,34,44,0.92),rgba(10,11,16,0.94))] shadow-[0_0_60px_rgba(148,163,184,0.3)]"
                  : "border-rose-500/60 bg-[linear-gradient(160deg,rgba(64,8,18,0.92),rgba(18,3,8,0.94))] shadow-[0_0_70px_rgba(239,68,68,0.35)]"
            }`}
          >
            {result.kind === "win" && (
              <motion.div
                className="pointer-events-none absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-amber-100/25 to-transparent"
                initial={{ x: "-120%" }}
                animate={{ x: "120%" }}
                transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 0.6 }}
                style={{ width: "45%" }}
              />
            )}
            <div className="flex items-center justify-center gap-3">
              {result.kind === "win" ? (
                <Trophy className="h-7 w-7 text-amber-300 md:h-9 md:w-9" />
              ) : result.kind === "push" ? (
                <Handshake className="h-7 w-7 text-slate-300 md:h-9 md:w-9" />
              ) : (
                <Frown className="h-7 w-7 text-rose-400 md:h-9 md:w-9" />
              )}
              <span
                className={`font-cinzel text-3xl font-black tracking-wide md:text-5xl ${
                  result.kind === "win"
                    ? "bg-gradient-to-b from-amber-100 via-amber-300 to-amber-600 bg-clip-text text-transparent"
                    : result.kind === "push"
                      ? "text-slate-200"
                      : "text-rose-400"
                }`}
              >
                {result.headline}
              </span>
            </div>
            <div
              className={`mt-1 font-cinzel text-xl font-bold md:text-2xl ${
                result.kind === "win" ? "text-amber-200" : result.kind === "push" ? "text-slate-300" : "text-rose-300/90"
              }`}
            >
              {result.amount < 0 ? "No win" : `+Rs. ${formatChips(result.amount)}`}
            </div>
            <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/50 md:text-xs">
              {result.detail}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── History road ──────────────────────────────────────────────────────────── */
export function HistoryDots({ history }: { history: Zone[] }) {
  const color = (z: Zone) =>
    z === "player"
      ? "bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.7)]"
      : z === "dealer"
        ? "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.7)]"
        : "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.7)]";
  const label = (z: Zone) => (z === "player" ? "P" : z === "dealer" ? "D" : "T");

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {history.length === 0 && <span className="text-[10px] uppercase tracking-[0.25em] text-white/25">No rounds yet</span>}
      {history.map((z, i) => (
        <motion.span
          key={`${i}-${z}`}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full font-cinzel text-[10px] font-black text-black/80 ${color(z)} ${
            i === history.length - 1 ? "ring-2 ring-white/70" : "opacity-80"
          }`}
        >
          {label(z)}
        </motion.span>
      ))}
    </div>
  );
}
