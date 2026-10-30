"use client";
import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card, ProviderBadge, StatusBadge, fmt, fmtDate } from "@/components/Shell";
import { UserActiveForm } from "@/components/admin/UserActiveForm";
import { PlayerDataResetForm } from "@/components/admin/PlayerDataResetForm";
import { SelectedHistoryForm } from "@/components/admin/SelectedHistoryForm";
import { UserEditForm } from "@/components/admin/UserEditForm";
import { BalanceAdjustForm } from "@/components/admin/BalanceAdjustForm";
import { PaymentLockForm } from "@/components/admin/PaymentLockForm";
import { usePage, NOT_FOUND } from "@/lib/useDb";

export default function UserDetailClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
    return usePage(async (signal) => {
        const { id } = params ?? {};
        if (!id) return NOT_FOUND;
        const response = await fetch(`/api/admin/data?view=user&id=${encodeURIComponent(id)}`, { cache: "no-store", signal });
        if (response.status === 404) return NOT_FOUND;
        const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "User details load nahi ho sake.");
        const u = data.user;
        const canSee = Boolean(data.canSee);
        const canOperate = Boolean(data.canOperate);
        const tx = data.transactions as any[];
        const plays = data.plays as any[];
        const team = data.team as any[];
        const comm = data.commissions as any[];
        const settings = data.settings;
        const referrer = data.referrer;
        const orderedLevels = [...settings.vipLevels].sort((a: any, b: any) => (a.level ?? 0) - (b.level ?? 0));
        const cur = orderedLevels.find((level: any) => level.level === (u.vipLevel ?? 0)) ?? orderedLevels[0];
        const deposits = tx.filter((t) => t.type === "deposit");
        const withdrawals = tx.filter((t) => t.type === "withdraw");
        const bets = plays.reduce((sum, p) => sum + p.betAmount, 0);
        const wins = plays.reduce((sum, p) => sum + p.winAmount, 0);
        const limit = u.paymentDepositLimit ?? 0;
        const pending = deposits.filter((t) => t.status === "pending").reduce((sum, t) => sum + t.amount, 0);

        return <div className="space-y-6">
            <Header key={`${id}:${u.isActive}`} id={id} user={u} canSee={canSee} canOperate={canOperate} />
            {data.canDelete && <Card title="Agent-only player data controls"><div className="grid gap-6 lg:grid-cols-2"><PlayerDataResetForm userId={id} isActive={u.isActive} /><PlayerDataResetForm userId={id} isActive={u.isActive} deleteAccount /></div></Card>}
            {data.canDelete && <Card title="Delete selected player history (balance unchanged)"><SelectedHistoryForm userId={id} /></Card>}
            <nav className="flex gap-2 overflow-x-auto rounded-xl border border-[#3a2470] bg-black/20 p-2 text-xs font-semibold">
                {["Basic Info", "Info Edit", "Control Switches", "Member Payout Info", "Registration / Login", "Recharge Records", "Payout Records", "Downline Summary", "Game Details", "Promotion Records"].map((label) => <a key={label} href={`#${label === "Registration / Login" ? "registration-login-information" : label.toLowerCase().replaceAll(" ", "-")}`} className="whitespace-nowrap rounded-lg border border-[#3a2470] px-3 py-2 text-[#b8a7e6] hover:border-[#00e5a0] hover:text-white">{label}</a>)}
            </nav>

            <section id="basic-info" className="space-y-3">
                <QuickAccountSummary
                    balance={u.balance}
                    locked={limit}
                    pendingRoom={Math.max(0, limit - (u.totalDeposited ?? 0) - pending)}
                    totalDeposited={u.totalDeposited ?? 0}
                    pending={pending}
                    depositsCount={deposits.length}
                    dailyLimit={cur?.dailyWithdrawLimit ?? 0}
                    perWithdrawMax={cur?.perWithdrawMax ?? 0}
                    totalWithdrawn={u.totalWithdrawn ?? 0}
                    canSee={canSee}
                    withdrawPin={u.withdrawPin}
                    registrationIp={u.registrationIp}
                    lastLoginIp={u.lastLoginIp}
                    historicalIps={u.historicalIps ?? []}
                    registeredAt={u.createdAt}
                    lastLoginAt={u.lastLoginAt}
                    bets={bets}
                    wins={wins}
                    rounds={plays.length}
                />
                <div className="grid gap-4 md:grid-cols-3">
                    <section id="control-switches"><Card title="Account Status"><InfoGrid items={[["Operation", u.isActive ? "Available" : "Blocked"], ["Games", u.blockedGames?.length ? `${u.blockedGames.length} restricted` : "Available"], ["Payout", u.withdrawPin ? "PIN enabled" : "PIN not set"], ["Payment lock", limit ? fmt(limit) : "Off"]]} /></Card></section>
                    <section id="downline"><Card title="Ownership & Referral"><InfoGrid items={[["Member level", u.role], ["VIP", `${u.vipLevel ?? 0} ${cur?.name ?? ""}`], ["Register source", referrer ? referrer.name : "Direct"], ["Downline", `${team.length} members`]]} /></Card></section>
                    <Card title="Identity & Contact"><InfoGrid items={[["Real name", u.name], ["Phone", u.phone], ["Email", u.email ?? "-"], ["Username", u.username ?? "-"]]} /></Card>
                </div>
            </section>

            <section id="info-edit" className="grid gap-4 md:grid-cols-2">
                <Card title="Credentials & Settings">
                    <InfoGrid items={[["Username", u.username ?? "-"], ["Phone", u.phone], ["Password", canSee ? (u.passwordPlain ?? "••••••") : "Hidden"], ["Withdraw PIN", canSee ? (u.withdrawPin ?? "Not set") : "Hidden"]]} />
                    {canOperate ? <UserEditForm user={{ id, name: u.name, username: u.username ?? "", email: u.email ?? "", role: u.role, passwordPlain: u.passwordPlain ?? "", withdrawPin: u.withdrawPin ?? "", balance: u.balance, paymentDepositLimit: limit }} /> : <p className="mt-3 rounded-xl bg-black/30 p-3 text-xs text-[#b8a7e6]">You cannot manage this player&apos;s account.</p>}
                    {canOperate && <div className="mt-5 border-t border-[#3a2470]/60 pt-5"><h3 className="mb-2 text-sm font-bold text-white">Manual wallet balance</h3><p className="mb-3 text-xs text-[#b8a7e6]">Only authorized staff can adjust a player in their permitted scope.</p><BalanceAdjustForm userId={id} balance={u.balance} /></div>}
                    <PaymentLockForm userId={id} limit={limit} />
                </Card>
                <div className="space-y-6"><Card title={`Team / Referrals (${team.length})`}>{team.length ? <ul className="divide-y divide-[#3a2470]/50 text-sm">{team.map((t) => <li key={String(t._id)} className="flex justify-between py-2"><Link href={`/admin/users/${t._id}`} className="text-white">{t.name} <span className="text-xs text-[#b8a7e6]">{t.phone}</span></Link><span className="text-xs text-[#b8a7e6]">Deposited {fmt(t.totalDeposited ?? 0)}</span></li>)}</ul> : <Empty text="Koi referral nahi." />}</Card><Card title="Commission history">{comm.length ? <ul className="divide-y divide-[#3a2470]/50 text-sm">{comm.map((c) => <li key={String(c._id)} className="flex justify-between py-2"><span>{c.kind} · {c.fromUserId?.name ?? "-"}</span><b className="text-emerald-300">+{fmt(c.amount)}</b></li>)}</ul> : <Empty text="Abhi koi commission nahi." />}</Card></div>
            </section>

            <section id="recharge-records" className="grid gap-4 md:grid-cols-2"><Card title="Recharge Records"><TransactionTable rows={deposits} /></Card><section id="game-details"><Card title={`Game Details — Bets ${fmt(bets)} · Wins ${fmt(wins)}`}><ul className="divide-y divide-[#3a2470]/50 text-sm">{plays.map((p) => <li key={String(p._id)} className="flex justify-between py-2"><span>{p.gameId?.icon} {p.gameId?.name}</span><span>Bet {fmt(p.betAmount)} · <b className="text-emerald-300">Win {fmt(p.winAmount)}</b></span></li>)}{!plays.length && <li className="py-3 text-[#6f5fa3]">Koi game nahi kheli.</li>}</ul></Card></section></section>
            <section id="payout-records" className="grid gap-4 md:grid-cols-2"><Card title="Payout Records"><TransactionTable rows={withdrawals} /></Card><section id="promotion-records"><Card title="Promotion Records">{comm.length ? <ul className="divide-y divide-[#3a2470]/50 text-sm">{comm.slice(0, 10).map((c) => <li key={String(c._id)} className="flex justify-between py-2"><span>{c.kind} · {fmtDate(c.createdAt)}</span><span className="text-emerald-300">+{fmt(c.amount)}</span></li>)}</ul> : <Empty text="No promotion records." />}</Card></section></section>
        </div>;
    }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}

function QuickAccountSummary({
    balance, locked, pendingRoom, totalDeposited, pending, depositsCount, dailyLimit, perWithdrawMax, totalWithdrawn,
    canSee, withdrawPin, registrationIp, lastLoginIp, historicalIps, registeredAt, lastLoginAt, bets, wins, rounds,
}: {
    balance: number; locked: number; pendingRoom: number; totalDeposited: number; pending: number; depositsCount: number;
    dailyLimit: number; perWithdrawMax: number; totalWithdrawn: number; canSee: boolean; withdrawPin?: string;
    registrationIp?: string; lastLoginIp?: string; historicalIps: string[]; registeredAt: string | Date;
    lastLoginAt?: string | Date; bets: number; wins: number; rounds: number;
}) {
    const [open, setOpen] = useState<string | null>(null);
    const sections = [
        {
            id: "wallet-summary", label: "Balance & wallet", value: fmt(balance), accent: "text-amber-300",
            detail: [["Current balance", fmt(balance)], ["Locked balance", locked ? fmt(locked) : "Unlocked"], ["Pending room", fmt(pendingRoom)], ["Total recharged", fmt(totalDeposited)], ["Pending recharge", fmt(pending)], ["Recharge records", String(depositsCount)]],
        },
        {
            id: "member-payout-info", label: "Member payout info", value: fmt(totalWithdrawn), accent: "text-emerald-300",
            detail: [["Withdrawal PIN", canSee ? (withdrawPin ?? "Not set") : "Hidden"], ["Daily withdraw limit", fmt(dailyLimit)], ["Per withdraw max", fmt(perWithdrawMax)], ["Total withdrawn", fmt(totalWithdrawn)]],
        },
        {
            id: "registration-login-information", label: "Registration & login", value: fmtDate(lastLoginAt), accent: "text-cyan-300",
            detail: [["Register time", fmtDate(registeredAt)], ["Last login time", fmtDate(lastLoginAt)], ["Register IP", canSee ? (registrationIp ?? "-") : "Hidden"], ["Last login IP", canSee ? (lastLoginIp ?? "-") : "Hidden"], ["Historical IPs", canSee ? (historicalIps.join(", ") || "-") : "Hidden"]],
        },
        {
            id: "game-turnover-summary", label: "Game activity", value: fmt(bets), accent: "text-violet-300",
            detail: [["Rounds", String(rounds)], ["Total bets", fmt(bets)], ["Total wins", fmt(wins)], ["Net house result", fmt(bets - wins)]],
        },
    ];
    const selected = sections.find((section) => section.id === open);

    return <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {sections.map((section) => (
                <motion.button
                    key={section.id}
                    id={section.id}
                    type="button"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    aria-expanded={open === section.id}
                    onClick={() => setOpen((current) => current === section.id ? null : section.id)}
                    className={`rounded-2xl border p-3 text-left transition sm:p-4 ${open === section.id ? "border-cyan-300/50 bg-cyan-300/[0.08] shadow-[0_0_25px_rgba(34,211,238,0.09)]" : "border-[#3a2470] bg-black/20 hover:border-cyan-300/30"}`}
                >
                    <span className="block truncate text-[10px] font-bold uppercase tracking-wider text-[#8e7ab9] sm:text-xs">{section.label}</span>
                    <span className={`mt-1 block truncate text-sm font-black sm:text-lg ${section.accent}`}>{section.value}</span>
                    <span className="mt-1 block text-[10px] text-[#8e7ab9]">{open === section.id ? "Hide details" : "Tap for details"}</span>
                </motion.button>
            ))}
        </div>
        <AnimatePresence initial={false}>
            {selected && <motion.div
                key={selected.id}
                initial={{ opacity: 0, height: 0, y: -6 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, y: -6 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="overflow-hidden"
            >
                <div className="rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-[#101a2c] to-[#100b21] p-3 sm:p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <h2 className="text-sm font-bold text-white">{selected.label}</h2>
                        <span className="text-[10px] uppercase tracking-wider text-cyan-200">Account breakdown</span>
                    </div>
                    <InfoGrid items={selected.detail as [string, string][]} />
                </div>
            </motion.div>}
        </AnimatePresence>
    </div>;
}

function Header({ id, user: u, canSee, canOperate }: { id: string; user: any; canSee: boolean; canOperate: boolean }) {
    const [active, setActive] = useState(Boolean(u.isActive));
    return <div className="flex flex-wrap items-center justify-between gap-3"><div><Link href="/admin/users" className="text-xs text-[#b8a7e6]">← All users</Link><h1 className="text-2xl font-bold text-white">{u.name} <span className="text-base font-normal text-[#b8a7e6]">@{u.username ?? "-"}</span></h1><div className="text-sm text-[#b8a7e6]">{u.phone} · {u.email ?? "no email"} · Joined {fmtDate(u.createdAt)} · Last login {fmtDate(u.lastLoginAt)}</div></div><div className="flex flex-wrap items-center gap-2"><StatusBadge status={active ? "active" : "blocked"} />{canOperate && <Link href={`/admin/users/${id}/game-restrictions`} className="btn-violet rounded-lg px-3 py-1.5 text-xs font-bold">Manage game restrictions</Link>}{canOperate && <UserActiveForm userId={id} isActive={active} onChange={setActive} />}</div></div>;
}
function InfoGrid({ items }: { items: [string, string][] }) { return <div className="grid grid-cols-2 gap-2 text-sm">{items.map(([label, value]) => <div key={label} className="rounded-lg bg-black/20 p-2"><div className="text-[10px] uppercase text-[#6f5fa3]">{label}</div><div className="mt-1 break-words text-white" title={value}>{value}</div></div>)}</div>; }
function TransactionTable({ rows }: { rows: any[] }) { return <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-[#6f5fa3]"><tr><th className="pb-2">Provider</th><th className="pb-2">Amount</th><th className="pb-2">Status</th><th className="pb-2">Date</th></tr></thead><tbody className="divide-y divide-[#3a2470]/50">{rows.map((t) => <tr key={String(t._id)}><td className="py-2"><ProviderBadge provider={t.provider} /></td><td className="py-2 text-white">{fmt(t.amount)}</td><td className="py-2"><StatusBadge status={t.status} /></td><td className="py-2 text-xs text-[#b8a7e6]">{fmtDate(t.createdAt)}</td></tr>)}{!rows.length && <tr><td colSpan={4} className="py-4 text-center text-[#6f5fa3]">No records.</td></tr>}</tbody></table></div>; }
function Empty({ text }: { text: string }) { return <p className="py-3 text-sm text-[#6f5fa3]">{text}</p>; }
