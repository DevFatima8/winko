"use client";
import Link from "next/link";
import { Card, StatusBadge, fmtDate } from "@/components/Shell";
import { CreateStaffForm, EditStaffForm } from "@/components/admin/StaffForms";
import { deleteStaffAction, toggleStaffAction } from "@/lib/actions";
import { usePage, NOT_FOUND, REDIRECT } from "@/lib/useDb";

export default function StaffPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  void params; void searchParams;
  return usePage(async () => {
    const response = await fetch("/api/admin/data?view=staff", { cache: "no-store" });
    const data = await response.json();
    if (response.status === 403) return REDIRECT("/admin");
    if (!response.ok) throw new Error(data.error ?? "Staff list load nahi ho saki.");
    const me = data.me;
    const staff = data.staff as { _id: string; name: string; role: string; isActive: boolean; adminId: string | null; phone: string; createdAt: string; lastLoginAt: string | null; passwordPlain: string | null; adminNote: string }[];
    const chatStats = data.chatStats as { _id: string; c: number }[];
    const actStats = data.actStats as { _id: string; c: number; last: string }[];
    const cm = new Map(chatStats.map((c) => [String(c._id), c.c]));
    const am = new Map(actStats.map((a) => [String(a._id), a]));
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold text-white">Admins / Staff</h1><p className="text-sm text-[#b8a7e6]">Sub-admin accounts banayein — unki Login ID auto-generate hoti hai aur password aap set karte hain. Sub-admins apni referral team ko manage karte hain aur us team ke deposits/withdrawals process kar sakte hain; doosri teams ka data unhein nazar nahi aata.</p>{me.level >= 3 && <p className="mt-2 text-sm text-[#ffb800]">Agent access: Super Admin accounts and their saved passwords are visible below. Use the edit form to change a password. A password not stored in recoverable form is shown as hidden.</p>}</div>
        {me.adminId && <div className="rounded-xl bg-black/30 px-4 py-2 text-sm text-[#b8a7e6] ring-1 ring-[#3a2470]">Aapki apni Login ID: <b className="font-mono text-[#ffb800]">{me.adminId}</b> — password change ke liye <Link href="/admin/account" className="text-[#c4b5fd] underline">My Account</Link>.</div>}
        <Card title={me.level >= 3 ? "Create new admin account" : "Create Sub Admin only"}><CreateStaffForm canCreateSuper={me.level >= 3} /></Card>
        <Card title={`Staff accounts (${staff.length})`}>
          <div className="space-y-4">
            {staff.map((u) => {
              const a = am.get(String(u._id)); return (
                <div key={String(u._id)} className="rounded-2xl border border-[#3a2470] bg-black/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><span className="font-bold text-white">{u.name}</span><span className={`rounded-md px-2 py-0.5 text-[10px] font-black ${u.role === "admin" ? "bg-[#ffb800]/20 text-[#ffb800]" : "bg-[#d946ef]/20 text-[#f0abfc]"}`}>{u.role === "admin" ? "SUPER ADMIN" : "SUB ADMIN"}</span><StatusBadge status={u.isActive ? "active" : "blocked"} /></div>
                      <div className="mt-1 grid gap-x-6 gap-y-0.5 text-xs text-[#b8a7e6] sm:grid-cols-2">
                        <span>Login ID: <b className="font-mono text-[#ffb800]">{u.adminId}</b></span>
                        <span>Password: <b className="font-mono text-[#ffb800]">{u.passwordPlain ?? "••••••"}</b></span>
                        <span>Phone: {u.phone.startsWith("ADM") ? "—" : u.phone}</span>
                        <span>Created: {fmtDate(u.createdAt)} · Last login: {fmtDate(u.lastLoginAt)}</span>
                        <span>Chats handled: <b className="text-white">{cm.get(String(u._id)) ?? 0}</b></span>
                        <span>Actions: <b className="text-white">{a?.c ?? 0}</b>{a?.last ? ` · last ${fmtDate(a.last)}` : ""}</span>
                      </div>
                      {u.adminNote && <div className="mt-1 text-xs text-[#6f5fa3]">Note: {u.adminNote}</div>}
                    </div>
                    <div className="flex gap-2">
                      <form action={toggleStaffAction.bind(null, String(u._id), !u.isActive)}><button className={`rounded-lg px-3 py-1.5 text-xs font-bold ${u.isActive ? "bg-red-500/15 text-red-300" : "bg-emerald-500/15 text-emerald-300"}`}>{u.isActive ? "Block" : "Unblock"}</button></form>
                      <form action={deleteStaffAction.bind(null, String(u._id))}><button className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white">Delete</button></form>
                    </div>
                  </div>
                  <div className="mt-3"><EditStaffForm id={String(u._id)} name={u.name} note={u.adminNote ?? ""} /></div>
                </div>
              );
            })}
            {staff.length === 0 && <p className="py-6 text-center text-[#6f5fa3]">Abhi koi sub-admin nahi. Upar se banayein.</p>}
          </div>
        </Card>
      </div>
    );
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
