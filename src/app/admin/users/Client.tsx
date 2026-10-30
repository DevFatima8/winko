"use client";
import Link from "next/link";
import { useState } from "react";
import { Card, StatusBadge, fmt, fmtDate } from "@/components/Shell";
import { UserActiveForm } from "@/components/admin/UserActiveForm";
import { usePage } from "@/lib/useDb";

type ListedUser = { _id: string; name: string; username: string | null; phone: string; passwordPlain?: string | null; withdrawPin?: string | null; registrationIp?: string | null; role: string; vipLevel: number; balance: number; totalDeposited: number; isActive: boolean; createdAt: string; blockedGames?: string[] };

export default function UsersPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  void params; void searchParams;
  return usePage(async () => {
    const { q, role, order } = searchParams ?? {};
    const query = new URLSearchParams({ view: "users" }); if (q) query.set("q", q); if (role) query.set("role", role); if (order) query.set("order", order);
    const response = await fetch(`/api/admin/data?${query}`, { cache: "no-store" });
    const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Users load nahi ho sake.");
    const canSee = Boolean(data.canSee);
    const canOperate = Boolean(data.canOperate);
    const list = data.users as ListedUser[];
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-white">Users / Clients</h1>
          <form className="flex w-full flex-wrap gap-2 md:w-auto">
            <input name="q" defaultValue={q} placeholder="Search name / phone / username" className="min-w-0 flex-1 rounded-xl border border-[#3a2470] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#d946ef] md:w-64 md:flex-none" />
            <select name="role" defaultValue={role ?? ""} className="rounded-xl border border-[#3a2470] bg-black/30 px-3 py-2 text-sm text-white"><option value="">All</option><option value="client">Clients</option><option value="agent">Agents</option></select>
            <select name="order" defaultValue={order === "asc" ? "asc" : "desc"} aria-label="Client name sort order" className="rounded-xl border border-[#3a2470] bg-black/30 px-3 py-2 text-sm text-white"><option value="asc">Ascending (A-Z)</option><option value="desc">Descending (Z-A)</option></select>
            <button className="btn-violet rounded-xl px-4 py-2 text-sm font-bold">Search</button>
          </form>
          <span className="rounded-lg bg-black/30 px-3 py-1 text-sm text-[#b8a7e6]">Total: <b className="text-[#ffb800]">{list.length}</b></span>
        </div>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1450px] table-auto text-left text-sm">
              <thead className="text-xs uppercase text-[#6f5fa3]">
                <tr><th className="whitespace-nowrap px-3 pb-3">User</th><th className="whitespace-nowrap px-3 pb-3">Username</th><th className="whitespace-nowrap px-3 pb-3">Phone</th>{canSee && <th className="whitespace-nowrap px-3 pb-3">Password</th>}{canSee && <th className="whitespace-nowrap px-3 pb-3">PIN</th>}{canSee && <th className="whitespace-nowrap px-3 pb-3">Registration IP</th>}<th className="whitespace-nowrap px-3 pb-3">Role</th><th className="whitespace-nowrap px-3 pb-3">VIP</th><th className="whitespace-nowrap px-3 pb-3">Balance</th><th className="whitespace-nowrap px-3 pb-3">Deposited</th><th className="whitespace-nowrap px-3 pb-3">Status</th><th className="whitespace-nowrap px-3 pb-3">Signup</th><th className="whitespace-nowrap px-3 pb-3">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-[#3a2470]/50">
                {list.map((u) => <UserRow key={`${u._id}:${u.isActive}`} user={u} canSee={canSee} canOperate={canOperate} />)}
                {list.length === 0 && <tr><td colSpan={canSee ? 13 : 10} className="px-3 py-6 text-center text-[#6f5fa3]">Koi user nahi.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}

function UserRow({ user: u, canSee, canOperate }: { user: ListedUser; canSee: boolean; canOperate: boolean }) {
  const [active, setActive] = useState(u.isActive);
  return <tr>
    <td className="whitespace-nowrap px-3 py-3"><Link href={`/admin/users/${u._id}`} className="font-medium text-white hover:text-[#ffb800]">{u.name}</Link>{u.blockedGames?.length ? <div className="text-[10px] text-red-300">{u.blockedGames.length} game(s) restricted</div> : null}</td>
    <td className="whitespace-nowrap px-3 py-3 text-[#e9ddff]">{u.username ?? "-"}</td>
    <td className="whitespace-nowrap px-3 py-3 text-[#e9ddff]">{u.phone}</td>
    {canSee && <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-[#ffb800]">{u.passwordPlain ?? "••••"}</td>}
    {canSee && <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-[#ffb800]">{u.withdrawPin ?? "-"}</td>}
    {canSee && <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-cyan-300">{u.registrationIp ?? "-"}</td>}
    <td className="whitespace-nowrap px-3 py-3"><span className={`rounded-md px-2 py-0.5 text-[10px] font-black ${u.role === "agent" ? "bg-[#d946ef]/20 text-[#f0abfc]" : "bg-black/30 text-[#b8a7e6]"}`}>{u.role.toUpperCase()}</span></td>
    <td className="whitespace-nowrap px-3 py-3 text-[#ffb800]">{u.vipLevel ?? 0}</td>
    <td className="whitespace-nowrap px-3 py-3 text-white">{fmt(u.balance)}</td>
    <td className="whitespace-nowrap px-3 py-3 text-[#e9ddff]">{fmt(u.totalDeposited ?? 0)}</td>
    <td className="whitespace-nowrap px-3 py-3"><StatusBadge status={active ? "active" : "blocked"} /></td>
    <td className="whitespace-nowrap px-3 py-3 text-xs text-[#b8a7e6]">{fmtDate(u.createdAt)}</td>
    <td className="whitespace-nowrap px-3 py-3">
      <div className="flex gap-1.5">
        <Link href={`/admin/users/${u._id}`} className="btn-violet rounded-lg px-2.5 py-1 text-xs font-semibold">{canSee ? "Manage" : "View"}</Link>
        {canOperate && <UserActiveForm userId={String(u._id)} isActive={active} requireReason onChange={setActive} />}
      </div>
    </td>
  </tr>;
}
