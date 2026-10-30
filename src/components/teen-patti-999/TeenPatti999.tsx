"use client";

import { useEffect, useState } from "react";
import { useGameBalance, useDailyPoolMode } from "@/lib/walletSync";
import type { ReactNode } from "react";
import "./teen-patti-999.css";
import Lobby from "./Lobby";
import GameTable from "./GameTable";
import Modal from "./Modal";
import { formatINR } from "./lib/utils";
import { setMuted } from "./lib/sounds";

export interface TableInfo {
  id: string;
  name: string;
  boot: number;
  desc: string;
  players: number;
  gradient: string;
}

export const TABLES: TableInfo[] = [
  {
    id: "classic",
    name: "Classic Teen Patti",
    boot: 10,
    desc: "Boot Rs. 10 • Classic rules",
    players: 12453,
    gradient: "from-emerald-600 via-emerald-800 to-slate-900",
  },
  {
    id: "highroller",
    name: "High Roller",
    boot: 100,
    desc: "Boot Rs. 100 • High stakes",
    players: 8210,
    gradient: "from-amber-500 via-amber-800 to-slate-900",
  },
  {
    id: "vip",
    name: "VIP Gold",
    boot: 1000,
    desc: "Boot Rs. 1,000 • VIP table",
    players: 3355,
    gradient: "from-purple-500 via-purple-800 to-slate-900",
  },
];

export interface Stats {
  games: number;
  wins: number;
  losses: number;
  biggestWin: number;
  totalWon: number;
}

type ModalKind = "rules" | "profile";

const DEFAULT_STATS: Stats = {
  games: 0,
  wins: 0,
  losses: 0,
  biggestWin: 0,
  totalWon: 0,
};

const RANKINGS: Array<[string, string]> = [
  ["Trail (Three of a Kind)", "A♠ A♥ A♦ — three cards of the same rank"],
  ["Pure Sequence (Straight Flush)", "A♥ 2♥ 3♥ — three in a row, same suit"],
  ["Sequence (Straight)", "A♠ 2♦ 3♣ — three in a row (A-2-3 is highest)"],
  ["Color (Flush)", "K♣ 9♣ 4♣ — three cards of the same suit"],
  ["Pair", "Q♦ Q♠ 7♣ — two cards of the same rank"],
  ["High Card", "A♦ J♣ 8♠ — no combination, highest card wins"],
];

export default function TeenPatti999() {
  const poolEnabled = useDailyPoolMode();
  const [screen, setScreen] = useState<"lobby" | "table">("lobby");
  const [table, setTable] = useState<TableInfo>(TABLES[0]);
  const [balance] = useGameBalance("teen-patti-999", 10000);
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);
  const [muted, setMutedState] = useState(false);
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load persisted state (virtual wallet + stats) on first mount.
  useEffect(() => {
    try {
      const s = localStorage.getItem("tp999_stats");
      if (s) setStats({ ...DEFAULT_STATS, ...JSON.parse(s) });
      const m = localStorage.getItem("tp999_muted") === "1";
      setMutedState(m);
      setMuted(m);
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem("tp999_balance", String(balance));
  }, [balance, loaded]);
  useEffect(() => {
    if (loaded) localStorage.setItem("tp999_stats", JSON.stringify(stats));
  }, [stats, loaded]);

  const toggleMute = () => {
    setMutedState((m) => {
      const next = !m;
      setMuted(next);
      try {
        localStorage.setItem("tp999_muted", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const handleGameEnd = (r: { won: boolean; net: number }) => {
    setStats((s) => ({
      games: s.games + 1,
      wins: s.wins + (r.won ? 1 : 0),
      losses: s.losses + (r.won ? 0 : 1),
      biggestWin: Math.max(s.biggestWin, r.won ? r.net : 0),
      totalWon: s.totalWon + (r.won ? r.net : 0),
    }));
  };

  const tile =  (label: string, value: ReactNode) => (
    <div className="rounded-xl bg-slate-800/80 p-3">
      <p className="text-lg font-black text-amber-300">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
    </div>
  );

  return (
    <>
      {screen === "lobby" ? (
        <Lobby
          balance={balance}
          stats={stats}
          muted={muted}
          tables={TABLES}
          onToggleMute={toggleMute}
          onOpenRules={() => setModal("rules")}
          onOpenProfile={() => setModal("profile")}
          onPlay={(t) => {
            setTable(t);
            setScreen("table");
          }}
        />
      ) : (
        <GameTable
          table={table}
          balance={balance}
          onGameEnd={handleGameEnd}
          onExit={() => setScreen("lobby")}
          muted={muted}
          onToggleMute={toggleMute}
          onOpenRules={() => setModal("rules")}
        />
      )}

      {/* Profile / stats */}
      <Modal open={modal === "profile"} title="👤 Profile" onClose={() => setModal(null)}>
        <div className="grid grid-cols-2 gap-2 text-center">
          {tile("Balance", formatINR(balance))}
          {tile("Games Played", stats.games)}
          {tile("Wins", stats.wins)}
          {tile(poolEnabled ? "Best game net (not paid)" : "Biggest Win", formatINR(stats.biggestWin))}
          {tile(poolEnabled ? "Indicative game return (not paid)" : "Total Won", formatINR(stats.totalWon))}
          {tile("Table", table.name)}
        </div>
        <button
          onClick={() => setStats(DEFAULT_STATS)}
          className="mt-4 w-full rounded-xl bg-slate-700 py-2 text-sm font-bold text-slate-200"
        >
          Reset Stats
        </button>
      </Modal>

      {/* Rules */}
      <Modal open={modal === "rules"} title="📖 How to Play" onClose={() => setModal(null)} wide>
        <h3 className="mb-1 text-sm font-black uppercase tracking-wider text-amber-300">
          The Game
        </h3>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">
          <li>Every round starts with a boot (ante) from you and the Dealer.</li>
          <li>3 cards are dealt to you and 3 to the Dealer.</li>
          <li>
            Play <b className="text-emerald-300">BLIND</b> (bet the boot amount, cards stay
            hidden) or <b className="text-sky-300">SEEN</b> (bet double and see your cards).
          </li>
          <li>
            On your turn: <b className="text-amber-300">CHAAL</b> (keep betting — the stake
            doubles every round), <b className="text-rose-300">SHOW</b> (compare hands now)
            or <b className="text-slate-300">PACK</b> (fold and lose the pot).
          </li>
          <li>At showdown, the best 3-card hand wins the whole pot.</li>
        </ol>

        <h3 className="mb-1 mt-4 text-sm font-black uppercase tracking-wider text-amber-300">
          Hand Rankings (best → worst)
        </h3>
        <ul className="space-y-1 text-sm">
          {RANKINGS.map(([name, example]) => (
            <li key={name} className="rounded-lg bg-slate-800/70 px-2 py-1.5">
              <b className="text-amber-200">{name}</b>
              <span className="block text-[11px] text-slate-400">{example}</span>
            </li>
          ))}
        </ul>

        <h3 className="mb-1 mt-4 text-sm font-black uppercase tracking-wider text-amber-300">
          Pairs Plus Side Bet
        </h3>
        <p className="text-sm text-slate-300">
          Optional side bet on your own hand: Pair 1:1 • Color 3:1 • Sequence 4:1 • Pure
          Sequence 5:1 • Trail 10:1.
        </p>

        <p className="mt-4 rounded-xl bg-slate-900/70 p-3 text-center text-[11px] leading-relaxed text-slate-500">
          18+ • This game uses virtual chips only — no real money, no gambling. For
          entertainment purposes only. Play responsibly.
        </p>
      </Modal>
    </>
  );
}
