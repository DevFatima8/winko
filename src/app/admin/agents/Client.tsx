"use client";
import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, StatCard, fmt, fmtDate } from "@/components/Shell";
import { usePage } from "@/lib/useDb";

type Sub = { id: string; name: string; phone: string; referralCode: string | null; balance: number; commissionEarned: number; isActive: boolean; createdAt: string; players: number; depositors: number; deposits: number; withdrawals: number; pending: number };
type Member = { id: string; name: string; phone: string; subAdminId: string; balance: number; isActive: boolean; joinedAt: string; dep: number; depC: number; wd: number; wdC: number; pend: number; firstDep: string | null };

function Ledger({ subs, team, isSuper }: { subs: Sub[]; team: Member[]; isSuper: boolean }) {
  const [open, setOpen] = useState<string | null>(subs.length === 1 ? subs[0].id : null);
  const totals = subs.reduce((a, s) => ({ players: a.players + s.players, dep: a.dep + s.deposits, wd: a.wd + s.withdrawals }), { players: 0, dep: 0, wd: 0 });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Sub-admin Referrals</h1>
        <p className="text-sm text-[#b8a7e6]">{isSuper ? "Har sub-admin ne kitne players refer kiye aur unka poora khata (deposit, withdrawal, balance)." : "Aapke referral link se join hone wale players aur unka khata."} Sirf sub-admins apne referral link se players join kara sakte hain.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 md:grid-cols-4">
        <StatCard label="Sub-admins" value={subs.length} />
        <StatCard label="Players referred" value={totals.players} accent="text-[#ffb800]" />
        <StatCard label="Team deposits" value={fmt(totals.dep)} accent="text-emerald-300" />
        <StatCard label="Team withdrawals" value={fmt(totals.wd)} accent="text-red-300" />
      </div>

      <div className="space-y-3">
        {subs.map((s) => {
          const members = team.filter((m) => m.subAdminId === s.id);
          const isOpen = open === s.id;
          return (
            <Card key={s.id}>
              <button type="button" onClick={() => setOpen(isOpen ? null : s.id)} className="flex w-full items-start justify-between gap-3 text-left">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-lg font-bold text-white">{s.name}</span>
                    <span className="rounded bg-[#d946ef]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#f0abfc]">SUB-ADMIN</span>
                    {!s.isActive && <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-300">BLOCKED</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-[#b8a7e6]">{s.phone} · Code <span className="font-mono text-[#ffb800]">{s.referralCode ?? "-"}</span> · Since {fmtDate(s.createdAt)}</div>
                </div>
                <ChevronDown size={18} className={`mt-1 shrink-0 text-slate-400 transition ${isOpen ? "rotate-180" : ""}`} />
              </button>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-3 lg:grid-cols-6">
                {([["Players", String(s.players), "text-white"], ["Deposited", `${s.depositors}/${s.players}`, "text-emerald-300"], ["Deposits", fmt(s.deposits), "text-emerald-300"], ["Withdrawals", fmt(s.withdrawals), "text-red-300"], ["Pending", String(s.pending), "text-yellow-300"], ["Earned", fmt(s.commissionEarned), "text-[#ffb800]"]] as const).map(([label, value, cls]) => (
                  <div key={label} className="min-w-0 rounded-lg bg-black/30 px-2 py-2"><div className="text-slate-400">{label}</div><div className={`truncate text-sm font-black ${cls}`} title={value}>{value}</div></div>
                ))}
              </div>
              {isOpen && (
                <div className="mt-4">
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[760px] text-left text-sm [&_td]:whitespace-nowrap [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:pb-2">
                      <thead className="text-xs uppercase text-[#6f5fa3]"><tr><th>Player</th><th>Joined</th><th>Deposits</th><th>Withdrawals</th><th>Balance</th><th>First deposit</th><th>Pending</th></tr></thead>
                      <tbody className="divide-y divide-[#3a2470]/50">
                        {members.map((m) => (
                          <tr key={m.id}>
                            <td><Link href={`/admin/users/${m.id}`} className="font-medium text-white hover:text-[#ffb800]">{m.name}</Link><div className="text-xs text-slate-500">{m.phone}{!m.isActive && " · blocked"}</div></td>
                            <td className="text-xs text-[#b8a7e6]">{fmtDate(m.joinedAt)}</td>
                            <td className="text-emerald-300">{fmt(m.dep)} <span className="text-xs text-[#6f5fa3]">({m.depC})</span></td>
                            <td className="text-red-300">{fmt(m.wd)} <span className="text-xs text-[#6f5fa3]">({m.wdC})</span></td>
                            <td className="text-white">{fmt(m.balance)}</td>
                            <td className="text-xs text-[#b8a7e6]">{m.firstDep ? fmtDate(m.firstDep) : "Not yet"}</td>
                            <td className="text-yellow-300">{m.pend}</td>
                          </tr>
                        ))}
                        {members.length === 0 && <tr><td colSpan={7} className="!whitespace-normal py-6 text-center text-[#6f5fa3]">Abhi is sub-admin ne koi player refer nahi kiya.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div className="space-y-2 md:hidden">
                    {members.map((m) => (
                      <div key={m.id} className="rounded-xl bg-black/30 p-3 text-sm">
                        <div className="flex items-center justify-between gap-2"><Link href={`/admin/users/${m.id}`} className="min-w-0 truncate font-semibold text-white">{m.name}</Link><span className="shrink-0 text-xs text-slate-500">{m.phone}</span></div>
                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          <span className="text-slate-400">Deposits <b className="text-emerald-300">{fmt(m.dep)}</b></span>
                          <span className="text-slate-400">Withdrawals <b className="text-red-300">{fmt(m.wd)}</b></span>
                          <span className="text-slate-400">Balance <b className="text-white">{fmt(m.balance)}</b></span>
                          <span className="text-slate-400">Pending <b className="text-yellow-300">{m.pend}</b></span>
                          <span className="col-span-2 text-slate-500">Joined {fmtDate(m.joinedAt)} · First deposit {m.firstDep ? fmtDate(m.firstDep) : "not yet"}</span>
                        </div>
                      </div>
                    ))}
                    {members.length === 0 && <p className="py-4 text-center text-[#6f5fa3]">Abhi is sub-admin ne koi player refer nahi kiya.</p>}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
        {subs.length === 0 && <p className="py-8 text-center text-[#6f5fa3]">Abhi koi sub-admin nahi. Admins / Staff page se sub-admin banayein.</p>}
      </div>
    </div>
  );
}

export default function AgentsPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  void params; void searchParams;
  return usePage(async () => {
    const response = await fetch("/api/admin/data?view=agents", { cache: "no-store" });
    const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Referral data load nahi ho saka.");
    const subs = (data.subAdmins ?? []) as Sub[];
    const team = (data.team ?? []) as Member[];
    return <Ledger subs={subs} team={team} isSuper={subs.length !== 1 || (data.unassigned ?? 0) > 0} />;
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
