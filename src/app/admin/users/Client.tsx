"use client";
import Link from "next/link";
import { useState } from "react";
import { Card, StatusBadge, fmt, fmtDate } from "@/components/Shell";
import { UserActiveForm } from "@/components/admin/UserActiveForm";
import { useDb } from "@/lib/useDb";
import { AdminUserSearch, type UserSearchFilters } from "@/components/admin/AdminUserSearch";
import { AccountLogoutButton } from "@/components/admin/AccountLogoutButton";

type ListedUser = { _id: string; name: string; username: string | null; phone: string; passwordPlain?: string | null; withdrawPin?: string | null; registrationIp?: string | null; lastLoginIp?: string | null; role: string; vipLevel: number; balance: number; totalDeposited: number; isActive: boolean; createdAt: string; blockedGames?: string[] };

export default function UsersPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  void params;
  const [filters, setFilters] = useState<UserSearchFilters>({ q: searchParams?.q ?? "", role: searchParams?.role ?? "", order: searchParams?.order === "asc" ? "asc" : "desc" });
  const { data, error, reload } = useDb(async signal => {
    const { q, role, order } = filters;
    const query = new URLSearchParams({ view: "users" }); if (q) query.set("q", q); if (role) query.set("role", role); if (order) query.set("order", order);
    const response = await fetch(`/api/admin/data?${query}`, { cache: "no-store", signal });
    const result: { users: ListedUser[]; canSee: boolean; canOperate: boolean; canLogout: boolean; error?: string } = await response.json();
    if (!response.ok || !Array.isArray(result.users)) throw new Error(result.error ?? "Users load nahi ho sake.");
    return result;
  }, [filters]);
  const canSee = Boolean(data?.canSee);
  const canOperate = Boolean(data?.canOperate);
  const list = data?.users ?? [];
  return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-white">Users / Clients</h1>
          <AdminUserSearch initial={filters} onSearch={setFilters} showRole />
          <span className="rounded-lg bg-black/30 px-3 py-1 text-sm text-[#b8a7e6]">Total: <b className="text-[#ffb800]">{list.length}</b></span>
        </div>
        {error && <div role="alert" className="text-red-300">{error} <button type="button" onClick={reload}>Retry</button></div>}
        {!data && !error && <p role="status" className="text-[#b8a7e6]">Loading users...</p>}
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1450px] table-auto text-left text-sm">
              <thead className="text-xs uppercase text-[#6f5fa3]">
                <tr><th className="whitespace-nowrap px-3 pb-3">User</th><th className="whitespace-nowrap px-3 pb-3">Username</th><th className="whitespace-nowrap px-3 pb-3">Phone</th>{canSee && <th className="whitespace-nowrap px-3 pb-3">Password</th>}{canSee && <th className="whitespace-nowrap px-3 pb-3">PIN</th>}{canSee && <th className="whitespace-nowrap px-3 pb-3">Registration IP</th>}{canSee && <th className="whitespace-nowrap px-3 pb-3">Last Login IP</th>}<th className="whitespace-nowrap px-3 pb-3">Role</th><th className="whitespace-nowrap px-3 pb-3">VIP</th><th className="whitespace-nowrap px-3 pb-3">Balance</th><th className="whitespace-nowrap px-3 pb-3">Deposited</th><th className="whitespace-nowrap px-3 pb-3">Status</th><th className="whitespace-nowrap px-3 pb-3">Signup</th><th className="whitespace-nowrap px-3 pb-3">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-[#3a2470]/50">
                {list.map((u) => <UserRow key={`${u._id}:${u.isActive}`} user={u} canSee={canSee} canOperate={canOperate} canLogout={Boolean(data?.canLogout)} />)}
                {data && list.length === 0 && <tr><td colSpan={canSee ? 14 : 10} className="px-3 py-6 text-center text-[#6f5fa3]">Koi user nahi.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
}

function UserRow({ user: u, canSee, canOperate, canLogout }: { user: ListedUser; canSee: boolean; canOperate: boolean; canLogout: boolean }) {
  const [active, setActive] = useState(u.isActive);
  return <tr>
    <td className="whitespace-nowrap px-3 py-3"><Link href={`/admin/users/${u._id}`} className="font-medium text-white hover:text-[#ffb800]">{u.name}</Link>{u.blockedGames?.length ? <div className="text-[10px] text-red-300">{u.blockedGames.length} game(s) restricted</div> : null}</td>
    <td className="whitespace-nowrap px-3 py-3 text-[#e9ddff]">{u.username ?? "-"}</td>
    <td className="whitespace-nowrap px-3 py-3 text-[#e9ddff]">{u.phone}</td>
    {canSee && <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-[#ffb800]">{u.passwordPlain ?? "••••"}</td>}
    {canSee && <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-[#ffb800]">{u.withdrawPin ?? "-"}</td>}
    {canSee && <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-cyan-300">{u.registrationIp ?? "-"}</td>}
    {canSee && <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-cyan-300">{u.lastLoginIp ?? "-"}</td>}
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
        {canLogout && <AccountLogoutButton userId={u._id} name={u.name} />}
      </div>
    </td>
  </tr>;
}
