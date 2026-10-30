"use client";
import { Card, ProviderBadge, StatusBadge, fmt, fmtDate } from "@/components/Shell";
import { StatCard } from "@/components/Shell";
import { useState } from "react";
import { usePage, NOT_FOUND, REDIRECT } from "@/lib/useDb";

export default function HistoryPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  const [copied, setCopied] = useState(false);
  void params; void searchParams;
  return usePage(async () => {
    const response = await fetch("/api/player/history", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "History load nahi ho saki.");
    const tx = data.transactions as { _id: string; type: "deposit" | "withdraw"; provider: string; createdAt: string; amount: number; status: string; method: string }[];
    const plays = data.plays as { _id: string; gameId: { name: string; icon: string } | null; roundNo: number | null; createdAt: string; betAmount: number; winAmount: number; outcome: string; poolPending?: boolean; poolClaim?: number }[];
    const totals = data.totals as { rounds: number; bets: number; wins: number };
    const me = data.me as { id: string; referralCode: string | null; vipLevel: number; balance: number };
    const levels = data.vipLevels as { level?: number; name?: string; minDeposit?: number }[];
    const inviteLink = `${window.location.origin}/signup?ref=${me.referralCode ?? ""}`;

    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">My History</h1>
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total game rounds" value={totals.rounds.toLocaleString()} />
          <StatCard label="Total games earnings" value={fmt(totals.wins)} accent="text-emerald-300" />
          <StatCard label="Net game result" value={fmt(totals.wins - totals.bets)} accent={totals.wins >= totals.bets ? "text-emerald-300" : "text-red-300"} sub={`Bets ${fmt(totals.bets)}`} />
          <StatCard label="Current balance" value={fmt(me.balance)} accent="text-[#ffb800]" />
        </div>
        <Card title="Invite & VIP levels">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-[#b8a7e6]">Referral code: <b className="font-mono text-white">{me.referralCode ?? "-"}</b></span>
            <button type="button" onClick={async () => {
              try {
                await navigator.clipboard.writeText(inviteLink);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              } catch (error) {
                console.error("[player history] Could not copy the invite link.", error);
              }
            }} className="btn-outline rounded-lg px-3 py-1.5 text-xs font-bold">{copied ? "Copied" : "Copy invite link"}</button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {levels.map((level) => (
              <div key={level.level} className={`min-w-0 rounded-xl p-3 ${level.level === me.vipLevel ? "bg-[#ffb800]/15 ring-1 ring-[#ffb800]" : "bg-black/30"}`}>
                <div className="font-bold text-white">VIP {level.level} · {level.name}</div>
                <div className="mt-1 text-xs text-[#b8a7e6]">Deposit {fmt(level.minDeposit ?? 0)}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Deposits & Withdrawals">
          <ul className="divide-y divide-slate-800 text-sm">
            {tx.map((t) => (
              <li key={String(t._id)} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className={`font-bold uppercase ${t.type === "deposit" ? "text-emerald-400" : "text-red-400"}`}>{t.type}</span>
                  <ProviderBadge provider={t.provider} />
                  <span className="text-xs text-slate-500">{fmtDate(t.createdAt)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-white">{fmt(t.amount)}</span>
                  <StatusBadge status={t.status} />{t.method === "gateway" && <span className="rounded bg-[#ffb800]/20 px-1.5 py-0.5 text-[9px] font-black text-[#ffb800]">TEST</span>}
                </div>
              </li>
            ))}
            {tx.length === 0 && <li className="py-6 text-center text-slate-500">Abhi koi transaction nahi.</li>}
          </ul>
        </Card>
        <Card title="Game History">
          <ul className="divide-y divide-slate-800 text-sm">
            {plays.map((p) => (
              <li key={String(p._id)} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><span className="mr-2">{p.gameId?.icon}</span><span className="font-medium text-white">{p.gameId?.name}</span><span className="ml-2 text-xs text-slate-500">#{p.roundNo} · {fmtDate(p.createdAt)}</span></div>
                <div className="flex flex-wrap items-center gap-3"><span className="text-slate-400">Bet {fmt(p.betAmount)}</span><span className="text-emerald-400">{p.poolPending ? `Claim ${fmt(p.poolClaim ?? 0)}` : `Win ${fmt(p.winAmount)}`}</span><StatusBadge status={p.poolPending ? "pending" : p.outcome} /></div>
              </li>
            ))}
            {plays.length === 0 && <li className="py-6 text-center text-slate-500">Abhi koi game nahi kheli.</li>}
          </ul>
        </Card>
      </div>
    );
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
