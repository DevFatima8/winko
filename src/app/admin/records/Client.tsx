"use client";
import { useMemo, useState } from "react";
import { Card, StatCard, fmt, fmtDate } from "@/components/Shell";
import { usePage } from "@/lib/useDb";

type Player = { id: string; name: string; phone: string; joinedAt: string; referrer: { name: string; role: string } | null };
type Dep = { userId: string; amount: number; at: string };
type View = "first" | "none" | "all";
const PERIODS: [string, string, number | null][] = [["all", "All time", null], ["today", "Today", 1], ["week", "7 days", 7], ["month", "30 days", 30], ["year", "1 year", 365]];

function DepositorsPanel({ players, deposits }: { players: Player[]; deposits: Dep[] }) {
  const [period, setPeriod] = useState("all");
  const [custom, setCustom] = useState("");
  const [view, setView] = useState<View>("first");

  const days = custom && Number(custom) > 0 ? Number(custom) : PERIODS.find((p) => p[0] === period)?.[2] ?? null;
  const since = useMemo(() => {
    if (days === null) return 0;
    const start = new Date();
    if (days === 1) start.setHours(0, 0, 0, 0); else start.setTime(start.getTime() - days * 86400000);
    return start.getTime();
  }, [days]);

  const data = useMemo(() => {
    const byUser = new Map<string, Dep[]>();
    for (const d of deposits) byUser.set(d.userId, [...(byUser.get(d.userId) ?? []), d]);
    const first = new Map<string, Dep>();
    for (const [uid, list] of byUser) first.set(uid, [...list].sort((a, b) => +new Date(a.at) - +new Date(b.at))[0]);
    const pmap = new Map(players.map((p) => [p.id, p]));
    const inRange = (iso: string) => +new Date(iso) >= since;
    const firstRows = [...first.entries()].filter(([, d]) => inRange(d.at)).flatMap(([uid, d]) => pmap.has(uid) ? [{ p: pmap.get(uid)!, d }] : []).sort((a, b) => +new Date(b.d.at) - +new Date(a.d.at));
    const noneRows = players.filter((p) => !byUser.has(p.id) && inRange(p.joinedAt)).sort((a, b) => +new Date(b.joinedAt) - +new Date(a.joinedAt));
    const allRows = [...byUser.entries()].flatMap(([uid, list]) => {
      const p = pmap.get(uid); const inP = list.filter((d) => inRange(d.at));
      return p && inP.length ? [{ p, total: inP.reduce((s, d) => s + d.amount, 0), count: inP.length, last: inP.map((d) => d.at).sort().at(-1)! }] : [];
    }).sort((a, b) => b.total - a.total);
    return { firstRows, noneRows, allRows };
  }, [players, deposits, since]);

  const refLabel = (p: Player) => p.referrer ? `${p.referrer.name}${p.referrer.role === "subadmin" ? " (Sub-admin)" : ""}` : "Direct / Admin";
  const tabCls = (on: boolean) => `min-w-0 rounded-2xl border p-3 text-left transition sm:p-4 ${on ? "border-fuchsia-400/70 bg-fuchsia-500/10" : "border-slate-800 bg-slate-900/60 hover:border-slate-600"}`;
  const totalAll = data.allRows.reduce((s, r) => s + r.total, 0);

  return (
    <Card title="Depositors">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => { setPeriod(key); setCustom(""); }} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${!custom && period === key ? "bg-yellow-400 text-slate-950" : "bg-slate-800 text-slate-300"}`}>{label}</button>
          ))}
          <input type="number" min={1} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Custom days" aria-label="Custom days" className={`w-32 rounded-lg border bg-slate-950 px-3 py-1.5 text-sm text-white outline-none focus:border-yellow-400 ${custom ? "border-yellow-400" : "border-slate-700"}`} />
        </div>

        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3">
          <button type="button" onClick={() => setView("first")} className={tabCls(view === "first")}><div className="text-xs text-slate-400">First deposit done</div><div className="text-2xl font-black text-emerald-400">{data.firstRows.length}</div><div className="text-[11px] text-slate-500">players</div></button>
          <button type="button" onClick={() => setView("none")} className={tabCls(view === "none")}><div className="text-xs text-slate-400">No deposit yet</div><div className="text-2xl font-black text-red-400">{data.noneRows.length}</div><div className="text-[11px] text-slate-500">players</div></button>
          <button type="button" onClick={() => setView("all")} className={tabCls(view === "all")}><div className="text-xs text-slate-400">All deposits</div><div className="text-2xl font-black text-yellow-300">{data.allRows.length}</div><div className="truncate text-[11px] text-slate-500">{fmt(totalAll)} total</div></button>
        </div>

        <ul className="divide-y divide-slate-800 text-sm">
          {view === "first" && data.firstRows.map(({ p, d }) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
              <div className="min-w-0"><div className="truncate font-semibold text-white">{p.name} <span className="text-xs font-normal text-slate-500">{p.phone}</span></div><div className="text-xs text-slate-400">Referred by: <b className="text-fuchsia-300">{refLabel(p)}</b></div></div>
              <div className="text-right"><div className="font-bold text-emerald-300">{fmt(d.amount)}</div><div className="text-xs text-slate-500">{fmtDate(d.at)}</div></div>
            </li>
          ))}
          {view === "none" && data.noneRows.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
              <div className="min-w-0"><div className="truncate font-semibold text-white">{p.name} <span className="text-xs font-normal text-slate-500">{p.phone}</span></div><div className="text-xs text-slate-400">Referred by: <b className="text-fuchsia-300">{refLabel(p)}</b></div></div>
              <div className="text-xs text-slate-500">Joined {fmtDate(p.joinedAt)}</div>
            </li>
          ))}
          {view === "all" && data.allRows.map(({ p, total, count, last }) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
              <div className="min-w-0"><div className="truncate font-semibold text-white">{p.name} <span className="text-xs font-normal text-slate-500">{p.phone}</span></div><div className="text-xs text-slate-400">Referred by: <b className="text-fuchsia-300">{refLabel(p)}</b></div></div>
              <div className="text-right"><div className="font-bold text-emerald-300">{fmt(total)} <span className="text-xs font-normal text-slate-500">({count})</span></div><div className="text-xs text-slate-500">Last {fmtDate(last)}</div></div>
            </li>
          ))}
          {(view === "first" ? data.firstRows : view === "none" ? data.noneRows : data.allRows).length === 0 && <li className="py-6 text-center text-slate-500">Is period mein koi record nahi.</li>}
        </ul>
      </div>
    </Card>
  );
}

export default function RecordsPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  void params; void searchParams;
  return usePage(async () => {
    const response = await fetch("/api/admin/data?view=records", { cache: "no-store" });
    const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Records load nahi ho sake.");
    const players = (data.players ?? []) as Player[];
    const deposits = (data.deposits ?? []) as Dep[];
    const agg = data.agg as { _id: { type: string; status: string }; c: number; s: number }[];
    const get = (t: string, st: string) => agg.find((a) => a._id.type === t && a._id.status === st) ?? { c: 0, s: 0 };
    const daily = data.daily as { _id: { d: string; type: string }; s: number; c: number }[];
    const days = Array.from(new Set(daily.map((d) => d._id.d)));
    const byProvider = data.byProvider as { _id: { p: string; type: string }; s: number; c: number }[];
    const topDep = data.topDep as { _id: string; s: number; c: number; user: { name: string; phone: string }[] }[];
    const depA = get("deposit", "approved"), wdA = get("withdraw", "approved");
    const gwAgg = data.gwAgg as { _id: string; s: number; c: number }[];
    const gwDep = gwAgg.find((g) => g._id === "deposit"), gwWd = gwAgg.find((g) => g._id === "withdraw");
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Deposit & Withdrawal Records</h1>
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 md:grid-cols-4">
          <StatCard label="Total Deposits (approved)" value={fmt(depA.s)} sub={`${depA.c} transactions`} accent="text-emerald-300" />
          <StatCard label="Total Withdrawals (approved)" value={fmt(wdA.s)} sub={`${wdA.c} transactions`} accent="text-red-300" />
          <StatCard label="Net (Dep − Wd)" value={fmt(depA.s - wdA.s)} accent="text-[#ffb800]" />
          <StatCard label="Pending" value={`${get("deposit", "pending").c} dep · ${get("withdraw", "pending").c} wd`} sub={`Rs. ${(get("deposit", "pending").s + get("withdraw", "pending").s).toLocaleString()} pending`} />
          <StatCard label="Rejected deposits" value={fmt(get("deposit", "rejected").s)} sub={`${get("deposit", "rejected").c} txns`} />
          <StatCard label="Rejected withdrawals" value={fmt(get("withdraw", "rejected").s)} sub={`${get("withdraw", "rejected").c} txns`} />
          {byProvider.filter((p) => p._id.type === "deposit").map((p) => <StatCard key={p._id.p} label={`Deposits via ${p._id.p}`} value={fmt(p.s)} sub={`${p.c} txns`} />)}
          <StatCard label="Test gateway volume (fake)" value={`${fmt(gwDep?.s ?? 0)} in`} sub={`${gwDep?.c ?? 0} test deposits · ${fmt(gwWd?.s ?? 0)} out (${gwWd?.c ?? 0})`} accent="text-[#ffb800]" />
          <StatCard label="Real deposits (excl. test)" value={fmt(depA.s - (gwDep?.s ?? 0))} sub={`Real withdrawals ${fmt(wdA.s - (gwWd?.s ?? 0))}`} accent="text-emerald-300" />
        </div>
        <DepositorsPanel players={players} deposits={deposits} />
        <div className="grid gap-4 md:gap-6 xl:grid-cols-2">
          <Card title="Daily summary (PKT)">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-[#6f5fa3]"><tr><th className="pb-2">Date</th><th className="pb-2">Deposits</th><th className="pb-2">Withdrawals</th><th className="pb-2">Net</th></tr></thead>
                <tbody className="divide-y divide-[#3a2470]/50">
                  {days.map((d) => { const dep = daily.find((x) => x._id.d === d && x._id.type === "deposit"); const wd = daily.find((x) => x._id.d === d && x._id.type === "withdraw"); const net = (dep?.s ?? 0) - (wd?.s ?? 0); return <tr key={d}><td className="py-2 text-white">{d}</td><td className="py-2 text-emerald-300">{fmt(dep?.s ?? 0)} <span className="text-xs text-[#6f5fa3]">({dep?.c ?? 0})</span></td><td className="py-2 text-red-300">{fmt(wd?.s ?? 0)} <span className="text-xs text-[#6f5fa3]">({wd?.c ?? 0})</span></td><td className={`py-2 font-bold ${net >= 0 ? "text-[#ffb800]" : "text-red-300"}`}>{fmt(net)}</td></tr>; })}
                  {days.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-[#6f5fa3]">Abhi koi approved transaction nahi.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Top depositors">
            <ul className="divide-y divide-[#3a2470]/50 text-sm">
              {topDep.map((t, i) => <li key={String(t._id)} className="flex items-center justify-between py-2"><span className="text-white">#{i + 1} {t.user[0]?.name ?? "-"} <span className="text-xs text-[#b8a7e6]">{t.user[0]?.phone}</span></span><span className="font-bold text-emerald-300">{fmt(t.s)} <span className="text-xs font-normal text-[#6f5fa3]">({t.c})</span></span></li>)}
              {topDep.length === 0 && <li className="py-4 text-center text-[#6f5fa3]">—</li>}
            </ul>
          </Card>
        </div>
      </div>
    );
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
