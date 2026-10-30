"use client";

import { useEffect } from "react";
import { cn } from "./lib/cn";

const MAIN_BETS = [
  { label: "Player A", odds: "0.95 : 1", note: "Wins if Player A has the stronger hand" },
  { label: "Player B", odds: "0.95 : 1", note: "Wins if Player B has the stronger hand" },
  { label: "Tie", odds: "50 : 1", note: "Wins if both hands are exactly equal in rank" },
];

const HAND_RANKS = [
  { name: "Trail (Three of a Kind)", example: "A♠ A♥ A♦" },
  { name: "Pure Sequence (Straight Flush)", example: "A♠ K♠ Q♠" },
  { name: "Sequence (Straight)", example: "9♣ 8♦ 7♥" },
  { name: "Colour (Flush)", example: "K♥ 9♥ 4♥" },
  { name: "Pair", example: "Q♠ Q♦ 7♣" },
  { name: "High Card", example: "A♠ J♦ 8♣" },
];

const PAIR_PLUS = [
  { hand: "Royal Flush", odds: "100 : 1" },
  { hand: "Straight Flush / Pure Sequence", odds: "40 : 1" },
  { hand: "Three of a Kind / Trail", odds: "30 : 1" },
  { hand: "Straight / Sequence", odds: "5 : 1" },
  { hand: "Flush / Colour", odds: "4 : 1" },
  { hand: "Pair", odds: "1 : 1" },
];

const BONUS = [
  { hand: "Royal Flush", odds: "1000 : 1" },
  { hand: "Straight Flush", odds: "200 : 1" },
  { hand: "Four of a Kind", odds: "100 : 1" },
  { hand: "Full House", odds: "20 : 1" },
  { hand: "Flush", odds: "15 : 1" },
  { hand: "Straight", odds: "10 : 1" },
  { hand: "Three of a Kind", odds: "7 : 1" },
];

export function InfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-3 backdrop-blur-sm" onClick={onClose}>
      <div
        className="tp-scroll tp-fade-in max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-amber-400/25 bg-gradient-to-b from-[#0d1620] to-[#050a0f] p-4 shadow-2xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-amber-200/70">Live game rules</p>
            <h2 className="tp-gold-text mt-1 text-2xl font-black uppercase tracking-wide sm:text-3xl">
              Teen Patti Face Off
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-bold text-white/70 transition hover:bg-white/15 hover:text-white"
          >
            Close
          </button>
        </div>

        <section className="mt-5">
          <h3 className="text-xs font-bold uppercase tracking-[0.22em] text-amber-200/80">How to play</h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-white/70">
            <li>Place chips on Player A, Player B or Tie before the countdown reaches zero.</li>
            <li>
              Optional side bets: <span className="text-white">Pair Plus A</span>,{" "}
              <span className="text-white">Pair Plus B</span> and the <span className="text-white">3+3 Bonus</span> can be
              played together with (or without) the main bets.
            </li>
            <li>The dealer burns and deals six cards — three face up to Player A, three to Player B.</li>
            <li>The stronger three-card Teen Patti hand wins. Main bets pay 0.95:1.</li>
            <li>If both hands are exactly equal, Player A and Player B bets push and are returned.</li>
          </ol>
        </section>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <section>
            <h3 className="text-xs font-bold uppercase tracking-[0.22em] text-amber-200/80">Main bets</h3>
            <Table rows={MAIN_BETS.map((bet) => ({ label: bet.label, odds: bet.odds, note: bet.note }))} />
          </section>
          <section>
            <h3 className="text-xs font-bold uppercase tracking-[0.22em] text-amber-200/80">Hand rankings</h3>
            <div className="mt-2 overflow-hidden rounded-xl border border-white/10">
              {HAND_RANKS.map((rank, index) => (
                <div
                  key={rank.name}
                  className={cn(
                    "flex items-center justify-between gap-2 px-3 py-1.5 text-[11px]",
                    index % 2 === 0 ? "bg-white/[0.03]" : "bg-transparent",
                  )}
                >
                  <span className="text-white/80">
                    <span className="mr-1.5 text-amber-300/80">{index + 1}</span>
                    {rank.name}
                  </span>
                  <span className="shrink-0 text-white/50">{rank.example}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <section>
            <h3 className="text-xs font-bold uppercase tracking-[0.22em] text-amber-200/80">Pair Plus</h3>
            <Table rows={PAIR_PLUS.map((row) => ({ label: row.hand, odds: row.odds }))} />
          </section>
          <section>
            <h3 className="text-xs font-bold uppercase tracking-[0.22em] text-amber-200/80">3+3 Bonus</h3>
            <Table rows={BONUS.map((row) => ({ label: row.hand, odds: row.odds }))} />
            <p className="mt-2 text-[11px] leading-snug text-white/40">
              The 3+3 Bonus uses the best five-card poker hand built from all six dealt cards. Three of a Kind or better
              wins.
            </p>
          </section>
        </div>

        <p className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-[11px] leading-relaxed text-amber-100/70">
          <strong className="font-bold text-amber-200">Demo table.</strong> Chips have no monetary value.
        </p>
      </div>
    </div>
  );
}

interface TableRow {
  label: string;
  odds: string;
  note?: string;
}

function Table({ rows }: { rows: TableRow[] }) {
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-white/10">
      {rows.map((row, index) => (
        <div
          key={row.label}
          className={cn(
            "px-3 py-1.5 text-[11px]",
            index % 2 === 0 ? "bg-white/[0.03]" : "bg-transparent",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-white/80">{row.label}</span>
            <span className="shrink-0 font-bold text-amber-200">{row.odds}</span>
          </div>
          {row.note ? <p className="mt-0.5 text-[10px] leading-snug text-white/35">{row.note}</p> : null}
        </div>
      ))}
    </div>
  );
}
