"use client";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { StatusBadge, fmt, fmtDate } from "@/components/Shell";
import { useDb, usePage } from "@/lib/useDb";

type Row = { _id: string; userId: { name: string; phone: string } | null; roundNo: number | null; betAmount: number; winAmount: number; outcome: string; resultData: string | null; createdAt: string };
type GameSummary = { key: string; icon: string; name: string; total: number; wins: number; losses: number; profit: number };
type Filter = "all" | "win" | "lose";

function GameIcon({ icon }: { icon: string }) {
  if (/^(https?:)?\/\//.test(icon) || icon.startsWith("/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" className="h-full w-full rounded-xl object-cover" loading="lazy" />;
  }
  return <>{icon}</>;
}

function ResultsView({ games }: { games: GameSummary[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const sections = games;
  const current = sections.find((s) => s.key === selected) ?? null;

  if (!current) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-white">Game Results</h1>
          <p className="mt-1 text-sm text-slate-400">Kisi game par click karein — uske saare win aur lose results dikhayi denge.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {sections.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => { setSelected(s.key); setFilter("all"); }}
              className="group min-w-0 rounded-2xl border border-fuchsia-500/20 bg-[#0b0820]/80 p-4 text-left shadow-[0_0_24px_-14px_rgba(168,85,247,0.7)] transition hover:-translate-y-0.5 hover:border-fuchsia-400/60"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/5 text-2xl"><GameIcon icon={s.icon} /></span>
                <div className="min-w-0">
                  <div className="truncate font-bold text-white">{s.name}</div>
                  <div className="text-xs text-slate-500">{s.total} rounds</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded-lg bg-emerald-500/10 py-1.5"><div className="text-base font-black text-emerald-400">{s.wins}</div><div className="text-slate-400">Wins</div></div>
                <div className="rounded-lg bg-red-500/10 py-1.5"><div className="text-base font-black text-red-400">{s.losses}</div><div className="text-slate-400">Losses</div></div>
              </div>
            </button>
          ))}
          {sections.length === 0 && <p className="col-span-full py-8 text-center text-slate-500">Abhi koi game nahi.</p>}
        </div>
      </div>
    );
  }

  return <GameResultsDetail key={current.key} current={current} filter={filter} setFilter={setFilter} onBack={() => setSelected(null)} />;
}

function GameResultsDetail({ current, filter, setFilter, onBack }: { current: GameSummary; filter: Filter; setFilter: (filter: Filter) => void; onBack: () => void }) {
  const { data, error } = useDb<Row[]>(async (signal) => {
    const response = await fetch(`/api/admin/data?view=results&game=${encodeURIComponent(current.key)}`, { cache: "no-store", signal });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error ?? "Results load nahi ho sake.");
    return json.rows as Row[];
  }, [current.key]);
  const list = (data ?? []).filter((r) => filter === "all" || r.outcome === filter);
  const tabs: [Filter, string, number][] = [["all", "All", current.total], ["win", "Win", current.wins], ["lose", "Lose", current.losses]];
  const emptyText = error ? `Results load nahi ho sake: ${error}` : data === null ? "Loading results..." : "Is filter ke liye koi result nahi.";

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-700"><ArrowLeft size={14} /> All games</button>
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/5 text-3xl"><GameIcon icon={current.icon} /></span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-white">{current.name}</h1>
          <p className="text-sm text-slate-400">House profit: <b className={current.profit >= 0 ? "text-emerald-400" : "text-red-400"}>{fmt(current.profit)}</b></p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map(([key, label, n]) => (
          <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === key ? (key === "lose" ? "bg-red-400 text-slate-950" : key === "win" ? "bg-emerald-400 text-slate-950" : "bg-yellow-400 text-slate-950") : "bg-slate-800 text-slate-300"}`}>{label} ({n})</button>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 p-3 md:block">
        <table className="w-full min-w-[760px] text-left text-sm [&_td]:whitespace-nowrap [&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3 [&_th]:pb-2">
          <thead className="text-xs uppercase text-slate-500"><tr><th>Player</th><th>Round</th><th>Bet</th><th>Win</th><th>Outcome</th><th>Details</th><th>Time</th></tr></thead>
          <tbody className="divide-y divide-slate-800">
            {list.map((r) => (
              <tr key={String(r._id)}>
                <td className="text-slate-300">{r.userId?.name ?? "—"}<div className="text-xs text-slate-500">{r.userId?.phone}</div></td>
                <td className="text-slate-400">#{r.roundNo ?? "-"}</td>
                <td className="text-slate-200">{fmt(r.betAmount)}</td>
                <td className="text-emerald-400">{fmt(r.winAmount)}</td>
                <td><StatusBadge status={r.outcome} /></td>
                <td className="max-w-[220px] truncate text-xs text-slate-400" title={r.resultData ?? ""}>{r.resultData ?? "-"}</td>
                <td className="text-slate-400">{fmtDate(r.createdAt)}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} className="!whitespace-normal py-8 text-center text-slate-500">{emptyText}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 md:hidden">
        {list.map((r) => (
          <div key={String(r._id)} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0"><div className="truncate font-semibold text-white">{r.userId?.name ?? "—"}</div><div className="text-xs text-slate-500">{r.userId?.phone} · #{r.roundNo ?? "-"}</div></div>
              <StatusBadge status={r.outcome} />
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs">
              <span className="text-slate-400">Bet <b className="text-slate-200">{fmt(r.betAmount)}</b></span>
              <span className="text-slate-400">Win <b className="text-emerald-400">{fmt(r.winAmount)}</b></span>
              <span className="text-slate-500">{fmtDate(r.createdAt)}</span>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="py-8 text-center text-slate-500">{emptyText}</p>}
      </div>
    </div>
  );
}

export default function ResultsPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  return usePage(async () => {
    const response = await fetch("/api/admin/data?view=results", { cache: "no-store" });
    const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Results load nahi ho sake.");
    return <ResultsView games={data.games as GameSummary[]} />;
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
