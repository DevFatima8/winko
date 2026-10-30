"use client";

import { useEffect, useState } from "react";
import { formatINR } from "./lib/utils";
import type { Stats, TableInfo } from "./TeenPatti999";

interface LobbyProps {
  balance: number;
  stats: Stats;
  muted: boolean;
  tables: TableInfo[];
  onToggleMute: () => void;
  onOpenRules: () => void;
  onOpenProfile: () => void;
  onPlay: (table: TableInfo) => void;
}

const MARQUEE_ITEMS = [
  "★ India's Favourite 3-Card Game ★",
  "★ Blind • Chaaal • Show ★",
  "★ 18+ Play Responsibly ★",
];

export default function Lobby({
  balance,
  stats,
  muted,
  tables,
  onToggleMute,
  onOpenRules,
  onOpenProfile,
  onPlay,
}: LobbyProps) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 3000);
    return () => clearInterval(id);
  }, []);

  const online = (t: TableInfo) =>
    Math.max(
      137,
      t.players +
        Math.round(Math.sin((tick + t.id.length * 7) * 1.7) * 400) +
        (tick % 11) * 37
    ).toLocaleString("en-PK");

  return (
    <div className="relative mx-auto h-full w-full max-w-xl overflow-y-auto overflow-x-hidden flex flex-col justify-between px-1 sm:px-2 md:px-3 pb-2 select-none">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-amber-500/20 bg-slate-900/95 px-3 py-2 backdrop-blur rounded-xl">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-700 text-sm font-black text-slate-950 shadow-[0_0_12px_rgba(245,181,46,.5)]">
          99
        </div>
        <p className="gold-text truncate font-serif text-lg font-black">
          TEEN PATTI <span className="text-amber-300">999</span>
        </p>
        <div className="ml-auto flex items-center gap-1">
          <div className="flex items-center gap-1 rounded-full bg-slate-800 px-2 py-1 text-xs font-bold text-amber-300">
            🪙 {formatINR(balance)}
          </div>
          <button
            onClick={onToggleMute}
            aria-label="Toggle sound"
            className="grid h-7 w-7 place-items-center rounded-full bg-slate-800 text-sm"
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
      </header>

      {/* Announcement marquee */}
      <div className="overflow-hidden border-b border-amber-500/20 bg-gradient-to-r from-amber-950/60 via-rose-950/60 to-amber-950/60 py-1.5">
        <div className="marquee-track">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
            <span
              key={i}
              className="whitespace-nowrap px-4 text-xs font-bold text-amber-200"
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* Hero */}
      <section className="relative m-3 overflow-hidden rounded-3xl border border-amber-400/40 bg-gradient-to-b from-slate-900 to-slate-950 p-6 text-center shadow-[0_0_50px_rgba(245,181,46,.15)]">
        <div className="pointer-events-none absolute -top-10 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="relative text-3xl font-black">
          <span className="text-slate-200">♠</span>{" "}
          <span className="text-rose-500">♥</span>{" "}
          <span className="text-rose-500">♦</span>{" "}
          <span className="text-slate-200">♣</span>
        </div>
        <h1 className="gold-text relative mt-2 font-serif text-5xl font-black drop-shadow">
          TEEN PATTI
        </h1>
        <div className="relative mt-2 inline-block rounded-2xl bg-gradient-to-r from-amber-300 to-amber-600 px-5 py-1 text-xl font-black text-slate-950 shadow-[0_0_20px_rgba(245,181,46,.6)]">
          999
        </div>
        <p className="relative mt-3 text-sm text-slate-300">
          India&apos;s favourite 3-card casino game. Play Blind, Chaaal, Show —
          and win the pot!
        </p>
        <button
          onClick={() =>
            document.getElementById("tables")?.scrollIntoView({ behavior: "smooth" })
          }
          className="btn-gold relative mt-4 w-full rounded-xl py-3 text-lg font-black shadow-[0_0_24px_rgba(245,181,46,.45)]"
        >
          ▶ PLAY NOW
        </button>
        <div className="relative mt-3 flex justify-center gap-4 text-[11px] text-slate-400">
          <span>
            Games <b className="text-slate-200">{stats.games}</b>
          </span>
          <span>
            Wins <b className="text-emerald-400">{stats.wins}</b>
          </span>
        </div>
      </section>

      {/* Tables */}
      <section id="tables" className="mx-3">
        <h2 className="mb-2 text-sm font-black uppercase tracking-widest text-slate-400">
          Choose Your Table
        </h2>
        <div className="grid gap-3">
          {tables.map((t) => (
            <div
              key={t.id}
              className={`relative overflow-hidden rounded-2xl border border-amber-400/30 bg-gradient-to-br p-4 ${t.gradient}`}
            >
              <div className="flex items-center gap-3">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-black/40 text-3xl shadow-inner">
                  🃏
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-black text-white">{t.name}</p>
                  <p className="text-[11px] text-slate-200">{t.desc}</p>
                  <p className="text-[10px] font-bold text-emerald-300">
                    ● {online(t)} players online
                  </p>
                </div>
                <button
                  onClick={() => onPlay(t)}
                  className="btn-gold shrink-0 rounded-xl px-4 py-2 font-black shadow-[0_0_16px_rgba(245,181,46,.4)]"
                >
                  PLAY
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer disclaimer */}
      <footer className="mx-3 mt-6 rounded-2xl bg-slate-900/70 p-4 text-center text-[11px] leading-relaxed text-slate-400">
        18+ • Virtual chips only — no real money, no deposits, no withdrawals •
        For entertainment purposes only • Play responsibly
      </footer>

      {/* Bottom nav */}
      <nav className="sticky bottom-0 z-10 mx-auto mt-3 flex w-full max-w-lg justify-around rounded-xl border border-amber-500/20 bg-slate-900/95 py-2 backdrop-blur shadow-lg">
        <button className="flex flex-col items-center text-[10px] font-bold text-amber-300">
          <span className="text-lg">🏠</span>Home
        </button>
        <button
          onClick={onOpenRules}
          className="flex flex-col items-center text-[10px] font-bold text-slate-300"
        >
          <span className="text-lg">📖</span>Rules
        </button>
        <button
          onClick={onOpenProfile}
          className="flex flex-col items-center text-[10px] font-bold text-slate-300"
        >
          <span className="text-lg">👤</span>Profile
        </button>
      </nav>
    </div>
  );
}
