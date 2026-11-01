"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card, StatusBadge, ProviderBadge, fmt, fmtDate } from "@/components/Shell";
import { usePage, NOT_FOUND, REDIRECT } from "@/lib/useDb";
import { Activity, ArrowDownToLine, ArrowUpFromLine, Banknote, Clock, Dices, Gamepad2, Headphones, Landmark, Percent, Repeat, Search, Sparkles, Trophy, UserPlus, Users, Wallet, X, type LucideIcon } from "lucide-react";

type Tone = "cyan" | "green" | "pink" | "amber" | "violet" | "red";
const TONES: Record<Tone, { text: string; ring: string; glow: string; chip: string }> = {
  cyan: { text: "text-cyan-300", ring: "border-cyan-400/25", glow: "from-cyan-400/20", chip: "bg-cyan-400/10 text-cyan-300" },
  green: { text: "text-emerald-300", ring: "border-emerald-400/25", glow: "from-emerald-400/20", chip: "bg-emerald-400/10 text-emerald-300" },
  pink: { text: "text-fuchsia-300", ring: "border-fuchsia-400/25", glow: "from-fuchsia-500/20", chip: "bg-fuchsia-400/10 text-fuchsia-300" },
  amber: { text: "text-amber-300", ring: "border-amber-400/25", glow: "from-amber-400/20", chip: "bg-amber-400/10 text-amber-300" },
  violet: { text: "text-violet-300", ring: "border-violet-400/25", glow: "from-violet-500/20", chip: "bg-violet-400/10 text-violet-300" },
  red: { text: "text-rose-300", ring: "border-rose-400/25", glow: "from-rose-500/20", chip: "bg-rose-400/10 text-rose-300" },
};

function NeonStat({ label, value, sub, tone = "violet", icon: Icon, onClick }: { label: string; value: string | number; sub?: string; tone?: Tone; icon: LucideIcon; onClick: () => void }) {
  const t = TONES[tone];
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" className={`group relative min-w-0 cursor-pointer overflow-hidden rounded-2xl border ${t.ring} bg-[#0b0820]/80 p-3 text-left shadow-[0_0_24px_-12px_rgba(168,85,247,0.6)] transition duration-300 hover:-translate-y-1 hover:border-white/25 hover:shadow-[0_12px_38px_-15px_rgba(34,211,238,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 sm:p-4`}>
      <div className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${t.glow} to-transparent blur-2xl`} />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:text-xs">{label}</div>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110 ${t.chip}`}><Icon size={16} /></span>
      </div>
      <div className="relative mt-2 min-w-0" style={{ containerType: "inline-size" }}>
        <div
          className={`whitespace-nowrap font-black leading-tight tabular-nums ${t.text}`}
          style={{ fontSize: `clamp(0.7rem, calc(100cqw / ${Math.max(String(value).length, 6) * 0.62}), 1.7rem)` }}
          title={String(value)}
        >{value}</div>
      </div>
      {sub && <div className="relative mt-1 break-words text-[11px] text-slate-500 sm:text-xs">{sub}</div>}
      <span className="absolute bottom-2 right-3 text-[9px] font-bold uppercase tracking-wider text-white/0 transition-colors group-hover:text-cyan-200/80">View details</span>
    </button>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400"><span className="h-px w-6 bg-gradient-to-r from-fuchsia-500 to-transparent" />{children}<span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" /></div>;
}

type RecentGameResult = {
  _id: unknown;
  gameId: { name: string; icon: string } | null;
  userId: { name: string } | null;
  betAmount: number;
  outcome: string;
};
type PendingTransaction = {
  _id: unknown;
  userId: { name: string } | null;
  type: string;
  provider: string;
  amount: number;
};

export default function AdminDashboardClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  return usePage(async (signal) => {
    const response = await fetch("/api/admin/data?view=dashboard", { cache: "no-store", signal });
    const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Dashboard data load nahi ho saka.");
    return <DashboardView data={data} />;
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}

type DashboardUser = { _id: string; name: string; phone: string; balance: number; createdAt: string; lastLoginAt: string | null; registrationIp: string | null };
type DailyStats = { key: string; date: string; logins: number; repeats: number; winners: number; repeatPct: number; earningPct: number; repeatEarningPct: number; bet: number; payout: number; earned: number };
type DashboardData = {
  me: { name: string; level: number; referralCode?: string };
  totalUsers: number; todayUsers: number; totalDeposits: number; totalWithdrawals: number;
  pending: number; activeAccounts: number; balance: number; agents: number; openChats: number; unreadChats: number;
  resultStats: { c: number; bet: number; win: number };
  todayDeposits: { amount: number }[];
  todayResults: { userId: string | null; betAmount: number; winAmount: number }[];
  todaySignups: DashboardUser[]; recentUsers: DashboardUser[];
  repeatedPlayers: { id: string; name: string; phone: string; registeredAt: string; registrationIp: string | null; playedAt: string | null }[];
  statsRows: DailyStats[]; recentResults: RecentGameResult[]; pendingTx: PendingTransaction[];
};

function DashboardView({ data }: { data: DashboardData }) {
    const [copiedReferral, setCopiedReferral] = useState(false);
    const [activeMetric, setActiveMetric] = useState<string | null>(null);
    const me = data.me;
    const totalUsers = Number(data.totalUsers), todayUsers = Number(data.todayUsers), dep = Number(data.totalDeposits), wd = Number(data.totalWithdrawals);
    const pending = Number(data.pending), accActive = Number(data.activeAccounts), balance = Number(data.balance);
    const res = data.resultStats as { c: number; bet: number; win: number };
    const todayDeposits = data.todayDeposits as { amount: number }[];
    const todayGameResults = data.todayResults as { userId: string | null; betAmount: number; winAmount: number }[];
    const todaySignups = data.todaySignups;
    const repeatedPlayers = data.repeatedPlayers;
    const statsRows = data.statsRows;
    const agents = Number(data.agents), openChats = Number(data.openChats), unreadChats = Number(data.unreadChats);
    const recentResults = data.recentResults as RecentGameResult[];
    const recentUsers = data.recentUsers;
    const pendingTx = data.pendingTx as PendingTransaction[];
    const todayPaymentTotal = todayDeposits.reduce((sum, tx) => sum + tx.amount, 0);
    const todayBetTotal = todayGameResults.reduce((sum, game) => sum + game.betAmount, 0);
    const todayPayoutTotal = todayGameResults.reduce((sum, game) => sum + game.winAmount, 0);
    const todayEarned = todayBetTotal - todayPayoutTotal;
    const todayPlayerIds = [...new Set(todayGameResults.map((game) => game.userId).filter((id): id is string => !!id).map(String))];
    const todayStats = statsRows[statsRows.length - 1];

    return (
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-3xl border border-fuchsia-500/20 bg-gradient-to-br from-[#150a35] via-[#0b0820] to-[#06142b] p-5 sm:p-7">
          <div className="pointer-events-none absolute -left-10 -top-16 h-48 w-48 rounded-full bg-fuchsia-600/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 right-0 h-56 w-56 rounded-full bg-cyan-500/20 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">{new Date().toLocaleDateString("en-PK", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
              <h1 className="mt-1 break-words text-2xl font-black text-white sm:text-3xl">Welcome back, <span className="bg-gradient-to-r from-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">{me.name ?? "Admin"}</span></h1>
              <p className="mt-1 text-sm text-slate-400">Aaj ka platform overview — sab kuch ek nazar mein.</p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-2 text-sm">
              <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" /></span>
              <span className="font-semibold text-emerald-300">Live</span>
              <span className="text-slate-400">· {fmt(todayEarned)} aaj</span>
            </div>
          </div>
        </div>

        <SectionTitle>Today</SectionTitle>
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 md:grid-cols-4 2xl:grid-cols-6">
          <NeonStat onClick={() => setActiveMetric("total-users")} icon={Users} tone="amber" label="Total Users" value={totalUsers} sub={`+${todayUsers} aaj register hue`} />
          <NeonStat onClick={() => setActiveMetric("today-payments")} icon={Banknote} tone="green" label="Today's Payments" value={fmt(todayPaymentTotal)} sub={`${todayDeposits.length} approved deposits`} />
          <NeonStat onClick={() => setActiveMetric("today-earnings")} icon={Trophy} tone={todayEarned >= 0 ? "green" : "red"} label="Today's Earnings" value={fmt(todayEarned)} sub={`${fmt(todayBetTotal)} bets − payouts`} />
          <NeonStat onClick={() => setActiveMetric("repeat-players")} icon={Repeat} tone="cyan" label="Repeat Players Today" value={repeatedPlayers.length} sub={`${todayPlayerIds.length} players today`} />
          <NeonStat onClick={() => setActiveMetric("today-logins")} icon={Activity} tone="cyan" label="Today's Logins" value={todayStats.logins} sub={`${todayStats.repeatPct.toFixed(1)}% repeat`} />
          <NeonStat onClick={() => setActiveMetric("login-earners")} icon={Percent} tone="green" label="Login Earners" value={`${todayStats.earningPct.toFixed(1)}%`} sub={`${todayStats.winners} winning users`} />
          <NeonStat onClick={() => setActiveMetric("repeat-earners")} icon={UserPlus} tone="violet" label="Repeat Earners" value={`${todayStats.repeatEarningPct.toFixed(1)}%`} sub={`${todayStats.repeats} repeat logins`} />
        </div>

        <SectionTitle>Money</SectionTitle>
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 md:grid-cols-4 2xl:grid-cols-6">
          <NeonStat onClick={() => setActiveMetric("total-deposits")} icon={ArrowDownToLine} tone="green" label="Total Deposits" value={fmt(dep)} />
          <NeonStat onClick={() => setActiveMetric("total-withdrawals")} icon={ArrowUpFromLine} tone="red" label="Total Withdrawals" value={fmt(wd)} />
          <NeonStat onClick={() => setActiveMetric("net-cash")} icon={Landmark} tone="amber" label="Net Cash (Dep − Wd)" value={fmt(dep - wd)} />
          <NeonStat onClick={() => setActiveMetric("wallet-balance")} icon={Wallet} tone="violet" label="Users Wallet Balance" value={fmt(balance)} sub={`${accActive} payment accounts active`} />
          <NeonStat onClick={() => setActiveMetric("pending-requests")} icon={Clock} tone={pending > 0 ? "amber" : "violet"} label="Pending Requests" value={pending} sub="approval ka intezar" />
          <NeonStat onClick={() => setActiveMetric("house-profit")} icon={Trophy} tone={res.bet - res.win >= 0 ? "green" : "red"} label="House Profit (games)" value={fmt(res.bet - res.win)} sub="total bets − total payouts" />
        </div>

        <SectionTitle>Games & Team</SectionTitle>
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 md:grid-cols-4 2xl:grid-cols-6">
          <NeonStat onClick={() => setActiveMetric("game-rounds")} icon={Gamepad2} tone="pink" label="Total Game Rounds" value={res.c} />
          <NeonStat onClick={() => setActiveMetric("total-bets")} icon={Dices} tone="pink" label="Total Bets" value={fmt(res.bet)} />
          <NeonStat onClick={() => setActiveMetric("total-payouts")} icon={Trophy} tone="cyan" label="Total Payouts" value={fmt(res.win)} />
          <NeonStat onClick={() => setActiveMetric("agents")} icon={Users} tone="violet" label="Agents" value={agents} sub="staff accounts" />
          <NeonStat onClick={() => setActiveMetric("support-chats")} icon={Headphones} tone={unreadChats > 0 ? "amber" : "cyan"} label="Support chats" value={openChats} sub={`${unreadChats} unread`} />
        </div>
        {me.level === 1 && me.referralCode && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#3a2470] bg-black/20 p-3">
            <span className="text-sm text-[#b8a7e6]">Your team referral link</span>
            <code className="min-w-0 flex-1 break-all text-xs text-white">{`${window.location.origin}/signup?ref=${me.referralCode}`}</code>
            <button type="button" onClick={async () => {
              try {
                await navigator.clipboard.writeText(`${window.location.origin}/signup?ref=${me.referralCode}`);
                setCopiedReferral(true);
                window.setTimeout(() => setCopiedReferral(false), 1500);
              } catch (error) {
                console.error("[admin dashboard] Could not copy the team referral link.", error);
              }
            }} className="btn-outline rounded-lg px-3 py-1.5 text-xs font-bold">{copiedReferral ? "Copied" : "Copy link"}</button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {(me.level >= 2
            ? [["/admin/support", "Live Support"], ["/admin/staff", "Admins / Staff"], ["/admin/logs", "Activity Logs"], ["/admin/notifications", "Send Notification"], ["/admin/games", "Games On/Off"], ["/admin/vip", "VIP Levels"], ["/admin/records", "Records"], ["/admin/help", "Help Center"], ["/admin/settings", "Settings"]]
            : [["/admin/support", "Live Support"], ["/admin/deposits", "Deposits"], ["/admin/withdrawals", "Withdrawals"], ["/admin/notifications", "Send Notification"], ["/admin/records", "Records"], ["/admin/account", "My Account"]]
          ).map(([h, l]) => <Link key={h} href={h} className="rounded-full border border-fuchsia-400/25 bg-white/[0.03] px-4 py-1.5 text-xs font-bold text-slate-200 transition hover:border-cyan-300/60 hover:text-cyan-200 hover:shadow-[0_0_16px_-4px_rgba(34,211,238,0.6)]">{l}</Link>)}
        </div>

        <div className="grid gap-4 md:gap-6 xl:grid-cols-2">
          <Card title="Latest Game Results" action={<Link href="/admin/results" className="text-sm text-yellow-400">View all →</Link>}>
            {recentResults.length === 0 ? <Empty text="Abhi koi game result nahi." /> : (
              <ul className="divide-y divide-slate-800">
                {recentResults.map((r) => (
                  <li key={String(r._id)} className="flex items-center justify-between py-2.5 text-sm">
                    <div><span className="mr-2">{r.gameId?.icon}</span><span className="font-medium text-white">{r.gameId?.name}</span><span className="ml-2 text-slate-400">{r.userId?.name ?? "—"}</span></div>
                    <div className="flex items-center gap-3"><span className="text-slate-400">{fmt(r.betAmount)}</span><StatusBadge status={r.outcome} /></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Pending Deposits / Withdraws" action={<span className="flex gap-3 text-sm"><Link href="/admin/deposits" className="text-emerald-400">Deposits →</Link><Link href="/admin/withdrawals" className="text-red-400">Withdrawals →</Link></span>}>
            {pendingTx.length === 0 ? <Empty text="Koi pending request nahi." /> : (
              <ul className="divide-y divide-slate-800">
                {pendingTx.map((t) => (
                  <li key={String(t._id)} className="flex items-center justify-between py-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold uppercase ${t.type === "deposit" ? "text-emerald-400" : "text-red-400"}`}>{t.type}</span>
                      <span className="text-white">{t.userId?.name}</span>
                      <ProviderBadge provider={t.provider} />
                    </div>
                    <span className="font-semibold text-white">{fmt(t.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title="Recently Registered Clients" action={<Link href="/admin/users" className="text-sm text-yellow-400">All users →</Link>}>
          <div className="space-y-3 md:hidden">
            {recentUsers.map(user => <MobileDetails key={user._id} title={user.name} fields={[
              ["Phone", user.phone], ["Balance", fmt(user.balance)], ["Registered", fmtDate(user.createdAt)], ["Last Login", fmtDate(user.lastLoginAt)],
            ]} />)}
            {recentUsers.length === 0 && <Empty text="Abhi koi client register nahi hua." />}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr><th className="pb-2">Name</th><th className="pb-2">Phone</th><th className="pb-2">Balance</th><th className="pb-2">Registered</th><th className="pb-2">Last Login</th></tr></thead>
              <tbody className="divide-y divide-slate-800">
                {recentUsers.map((x) => (
                  <tr key={String(x._id)}>
                    <td className="py-2 font-medium text-white">{x.name}</td>
                    <td className="py-2 text-slate-300">{x.phone}</td>
                    <td className="py-2 text-slate-300">{fmt(x.balance)}</td>
                    <td className="py-2 text-slate-400">{fmtDate(x.createdAt)}</td>
                    <td className="py-2 text-slate-400">{fmtDate(x.lastLoginAt)}</td>
                  </tr>
                ))}
                {recentUsers.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-slate-500">Abhi koi client register nahi hua.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Today’s Signups & Repeat Players">
          <div className="space-y-3 md:hidden">
            {todaySignups.map(user => <MobileDetails key={user._id} title={user.name} fields={[
              ["Phone", user.phone], ["Signup date", fmtDate(user.createdAt)], ["Registration IP", user.registrationIp ?? "IP unavailable"],
              ["Today status", repeatedPlayers.some(player => player.id === user._id) ? "Repeat player" : "New player"],
            ]} />)}
            {todaySignups.length === 0 && <Empty text="Aaj koi signup nahi hua." />}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr><th className="pb-2">User</th><th className="pb-2">Phone</th><th className="pb-2">Signup date</th><th className="pb-2">Registration IP</th><th className="pb-2">Today status</th></tr></thead>
              <tbody className="divide-y divide-slate-800">
                {todaySignups.map((user) => <tr key={String(user._id)}><td className="py-2 font-medium text-white">{user.name}</td><td className="py-2 text-slate-300">{user.phone}</td><td className="py-2 text-slate-400">{fmtDate(user.createdAt)}</td><td className="py-2 font-mono text-xs text-cyan-300">{user.registrationIp ?? "IP unavailable"}</td><td className="py-2 text-slate-300">{repeatedPlayers.some((player) => player?.id === String(user._id)) ? "Repeat player" : "New player"}</td></tr>)}
                {todaySignups.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-slate-500">Aaj koi signup nahi hua.</td></tr>}
              </tbody>
            </table>
          </div>
          {repeatedPlayers.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-cyan-300">Today’s repeat players</div>
              <div className="space-y-3 md:hidden">
                {repeatedPlayers.map(player => <MobileDetails key={player.id} title={player.name} fields={[
                  ["Signup date", fmtDate(player.registeredAt)], ["Registration IP", player.registrationIp ?? "IP unavailable"],
                  ["Played today", player.playedAt ? fmtDate(player.playedAt) : "-"],
                ]} />)}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500"><tr><th className="pb-2">User</th><th className="pb-2">Signup date</th><th className="pb-2">Registration IP</th><th className="pb-2">Played today</th></tr></thead>
                  <tbody className="divide-y divide-slate-800">
                    {repeatedPlayers.filter((player): player is NonNullable<typeof player> => !!player).map((player) => <tr key={player.id}><td className="py-2 font-medium text-white">{player.name}</td><td className="py-2 text-slate-400">{fmtDate(player.registeredAt)}</td><td className="py-2 font-mono text-xs text-cyan-300">{player.registrationIp ?? "IP unavailable"}</td><td className="py-2 text-slate-400">{player.playedAt ? fmtDate(player.playedAt) : "-"}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>

        <Card title="Login & Earning Statistics (last 7 days)">
          <div className="mb-3 text-xs text-slate-400">Earning % = logged-in users who won today. Repeat % = logged-in users who signed up before that day. Amounts are game bets, payouts and house earning.</div>
          <div className="space-y-3 md:hidden">
            {statsRows.map(row => <MobileDetails key={row.key} title={row.key} fields={[
              ["Logins", row.logins], ["Repeat users", row.repeats], ["Repeat %", `${row.repeatPct.toFixed(2)}%`],
              ["Earners %", `${row.earningPct.toFixed(2)}%`], ["Repeat earners %", `${row.repeatEarningPct.toFixed(2)}%`],
              ["Bets", fmt(row.bet)], ["Payouts", fmt(row.payout)], ["Earned", fmt(row.earned)],
            ]} />)}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr><th className="pb-2">Statistics date</th><th className="pb-2">Logins</th><th className="pb-2">Repeat users</th><th className="pb-2">Repeat %</th><th className="pb-2">Earners %</th><th className="pb-2">Repeat earners %</th><th className="pb-2">Bets</th><th className="pb-2">Payouts</th><th className="pb-2">Earned</th></tr></thead>
              <tbody className="divide-y divide-slate-800">
                {statsRows.map((row) => <tr key={row.key}><td className="py-2 font-medium text-white">{row.key}</td><td className="py-2 text-slate-300">{row.logins}</td><td className="py-2 text-cyan-300">{row.repeats}</td><td className="py-2 text-cyan-300">{row.repeatPct.toFixed(2)}%</td><td className="py-2 text-emerald-300">{row.earningPct.toFixed(2)}%</td><td className="py-2 text-emerald-300">{row.repeatEarningPct.toFixed(2)}%</td><td className="py-2 text-slate-300">{fmt(row.bet)}</td><td className="py-2 text-slate-300">{fmt(row.payout)}</td><td className={`py-2 font-bold ${row.earned >= 0 ? "text-emerald-300" : "text-red-300"}`}>{fmt(row.earned)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </Card>
        <MetricDetailModal key={activeMetric} metric={activeMetric} onClose={() => setActiveMetric(null)} />
      </div>
    );
}

function MobileDetails({ title, fields }: { title: string; fields: [string, string | number][] }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
      <div className="break-words font-semibold text-white">{title}</div>
      <dl className="mt-2 space-y-2 text-xs">
        {fields.map(([label, value]) => (
          <div key={label} className="grid min-w-0 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3">
            <dt className="min-w-0 break-words text-slate-400">{label}</dt>
            <dd className="min-w-0 break-words text-right text-slate-200 [overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-slate-500">{text}</p>;
}

type DashboardDetail = {
  metric: string;
  title: string;
  description: string;
  rangeLabel?: string;
  summaries: { label: string; value: string | number }[];
  columns: { key: string; label: string }[];
  rows: Record<string, string | number>[];
  page: number;
  pageSize: number;
  totalRows: number;
  hasMore: boolean;
  requestKey?: string;
};

function MetricDetailModal({ metric, onClose }: { metric: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<DashboardDetail | null>(null);
  const [period, setPeriod] = useState(() => metric && ["today-payments", "today-earnings", "repeat-players", "today-logins", "login-earners", "repeat-earners"].includes(metric) ? "today" : "all");
  const [days, setDays] = useState("7");
  const [daysDraft, setDaysDraft] = useState("7");
  const [date, setDate] = useState(() => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10));
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [retryVersion, setRetryVersion] = useState(0);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const requestController = useRef<AbortController | null>(null);
  const requestKey = `${period}:${days}:${date}`;
  const isLoading = !detail || detail.requestKey !== requestKey;

  useEffect(() => {
    if (!metric) return;
    const controller = new AbortController();
    requestController.current = controller;
    const params = new URLSearchParams({ view: "dashboard-detail", metric, page: "1", period });
    if (period === "days") params.set("days", days);
    if (period === "date") params.set("date", date);
    void fetch(`/api/admin/data?${params}`, {
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Metric details load nahi ho sake.");
      if (!controller.signal.aborted) setDetail({ ...data, requestKey: `${period}:${days}:${date}` } as DashboardDetail);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Metric details load nahi ho sake.");
    });
    return () => {
      controller.abort();
      if (requestController.current === controller) requestController.current = null;
    };
  }, [metric, period, days, date, retryVersion]);

  useEffect(() => {
    if (!metric) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [metric, onClose]);

  useEffect(() => {
    if (!metric) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [metric]);

  const loadMore = useCallback(async () => {
    if (!metric || !detail?.hasMore || loadingMore || !requestController.current) return;
    setLoadingMore(true);
    const controller = requestController.current;
    const params = new URLSearchParams({ view: "dashboard-detail", metric, page: String(detail.page + 1), period });
    if (period === "days") params.set("days", days);
    if (period === "date") params.set("date", date);
    try {
      const response = await fetch(`/api/admin/data?${params}`, { cache: "no-store", signal: controller.signal });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error ?? "More records load nahi ho sake.");
      if (!controller.signal.aborted) setDetail((current) => current ? { ...next, requestKey, rows: [...current.rows, ...next.rows] } as DashboardDetail : next as DashboardDetail);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "More records load nahi ho sake.");
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }, [metric, detail, loadingMore, period, days, date, requestKey]);

  useEffect(() => {
    const root = scrollAreaRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || !detail?.hasMore || detail.requestKey !== requestKey || loadingMore || error) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { root, rootMargin: "180px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [detail?.hasMore, detail?.page, detail?.requestKey, loadingMore, requestKey, loadMore, error]);

  return (
    <AnimatePresence>
      {metric && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-[#03020a]/80 p-0 backdrop-blur-md sm:items-center sm:p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={detail?.title ?? "Dashboard metric details"}
            initial={{ opacity: 0, y: 35, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 22, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            className="flex max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-3xl border border-violet-300/20 bg-[#0c0919] shadow-[0_30px_100px_rgba(0,0,0,0.7)] sm:max-h-[90dvh] sm:rounded-3xl"
          >
            <div className="relative shrink-0 overflow-hidden border-b border-white/[0.08] bg-gradient-to-r from-[#211047] via-[#100c24] to-[#071b27] px-4 py-4 sm:px-7 sm:py-6">
              <div className="pointer-events-none absolute -right-10 -top-20 h-56 w-56 rounded-full bg-fuchsia-500/15 blur-3xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">
                    <Sparkles size={13} /> Metric breakdown
                  </div>
                  <h2 className="text-xl font-black text-white sm:text-3xl">{detail?.title ?? "Loading details..."}</h2>
                  <p className="mt-1 max-w-3xl text-xs leading-5 text-violet-100/60 sm:text-sm">{detail?.description ?? "Fetching related dashboard data..."}</p>
                </div>
                <button type="button" onClick={onClose} aria-label="Close details" className="shrink-0 rounded-xl border border-white/10 bg-white/[0.05] p-2.5 text-violet-100/70 transition hover:rotate-90 hover:bg-white/10 hover:text-white">
                  <X size={19} />
                </button>
              </div>
            </div>
            <div ref={scrollAreaRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
              {error && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert"><span>{error}</span><button type="button" onClick={() => { setError(""); setRetryVersion((current) => current + 1); }} className="rounded-lg border border-rose-300/20 px-3 py-1.5 text-xs font-bold hover:bg-rose-300/10">Try again</button></div>}
              <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3 sm:p-4">
                <label className="min-w-[170px] flex-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Filter records
                  <select
                    value={period}
                    onChange={(event) => { setPeriod(event.target.value); setError(""); setLoadingMore(false); }}
                    className="mt-1.5 block w-full rounded-xl border border-white/10 bg-[#171329] px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-white outline-none focus:border-cyan-300/50"
                  >
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="week">Last 7 days</option>
                    <option value="month">This month</option>
                    <option value="year">This year</option>
                    <option value="days">Last N days</option>
                    <option value="date">Specific day</option>
                    <option value="all">All time</option>
                  </select>
                </label>
                {period === "days" && <>
                  <label className="w-32 text-[10px] font-bold uppercase tracking-wider text-slate-400">Number of days<input type="number" min="1" max="3650" value={daysDraft} onChange={(event) => setDaysDraft(event.target.value)} className="mt-1.5 block w-full rounded-xl border border-white/10 bg-[#171329] px-3 py-2.5 text-sm font-medium text-white outline-none focus:border-cyan-300/50" /></label>
                  <button type="button" onClick={() => { setDays(String(Math.min(3650, Math.max(1, Number.parseInt(daysDraft, 10) || 7)))); setError(""); setLoadingMore(false); }} className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-2.5 text-xs font-bold text-cyan-100 transition hover:bg-cyan-300/20">Apply</button>
                </>}
                {period === "date" && <label className="w-44 text-[10px] font-bold uppercase tracking-wider text-slate-400">Choose a day<input type="date" value={date} onChange={(event) => { setDate(event.target.value); setError(""); setLoadingMore(false); }} className="mt-1.5 block w-full rounded-xl border border-white/10 bg-[#171329] px-3 py-2.5 text-sm font-medium text-white outline-none focus:border-cyan-300/50" /></label>}
                {detail?.rangeLabel && detail.requestKey === requestKey && <span className="pb-2 text-xs text-cyan-200/80">Showing {detail.rangeLabel}</span>}
              </div>
              {isLoading ? (
                <div className="space-y-5" role="status" aria-label="Loading metric details">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.04]" />)}</div>
                  <div className="space-y-3 rounded-2xl border border-white/[0.06] p-4">{[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-10 animate-pulse rounded-lg bg-white/[0.05]" />)}</div>
                </div>
              ) : detail && detail.requestKey === requestKey ? (
                <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }} className="space-y-5">
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    {detail.summaries.map((summary, index) => (
                      <motion.div
                        key={summary.label}
                        variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
                        className="relative overflow-hidden rounded-2xl border border-violet-300/10 bg-gradient-to-br from-white/[0.06] to-white/[0.015] p-3.5 sm:p-4"
                      >
                        <div className={`pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full blur-2xl ${index % 2 ? "bg-cyan-400/10" : "bg-fuchsia-400/10"}`} />
                        <div className="relative text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:text-xs">{summary.label}</div>
                        <div className={`relative mt-2 break-words text-lg font-black tabular-nums sm:text-2xl ${index % 2 ? "text-cyan-200" : "text-violet-200"}`}>
                          {typeof summary.value === "number" && isMoneyLabel(summary.label) ? fmt(summary.value) : summary.value}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#100d1d]/90">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-4 py-3 sm:px-5">
                      <div className="flex items-center gap-2 text-sm font-bold text-white"><Search size={15} className="text-cyan-300" /> Related records</div>
                      <div className="text-[11px] text-slate-400">Showing {Math.min(detail.rows.length, detail.totalRows).toLocaleString()} of {detail.totalRows.toLocaleString()}</div>
                    </div>
                    {detail.rows.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-left text-xs sm:text-sm">
                          <thead className="sticky top-0 z-10 bg-[#171329] text-[10px] uppercase tracking-wider text-slate-400 sm:text-[11px]">
                            <tr>{detail.columns.map((column) => <th key={column.key} className="whitespace-nowrap px-3 py-3 font-bold sm:px-4">{column.label}</th>)}</tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.05]">
                            {detail.rows.map((row, index) => (
                              <motion.tr key={`${detail.metric}-${index}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18, delay: Math.min(index * 0.008, 0.12) }} className="transition-colors hover:bg-violet-300/[0.035]">
                                {detail.columns.map((column) => <td key={column.key} className="max-w-[300px] px-3 py-3 text-slate-300 sm:px-4">{renderDetailValue(column.key, row[column.key])}</td>)}
                              </motion.tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="px-5 py-12 text-center">
                        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-400/10 text-violet-200"><Search size={20} /></div>
                        <div className="mt-3 font-bold text-white">No records found</div>
                        <p className="mt-1 text-xs text-slate-400">There is no related data for this metric yet.</p>
                      </div>
                    )}
                    {detail.hasMore && <div ref={sentinelRef} className="border-t border-white/[0.07] p-4 text-center text-xs text-slate-400" role="status">{loadingMore ? "Loading more records..." : "Scroll to load more records"}</div>}
                  </div>
                </motion.div>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center justify-between border-t border-white/[0.07] bg-[#0a0814] px-4 py-3 sm:px-6">
              <span className="text-[10px] text-slate-500 sm:text-xs">Data is limited to your admin access.</span>
              <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/[0.06] hover:text-white">Close</button>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function isMoneyLabel(label: string) {
  return /amount|received|bets|payout|profit|cash|balance/i.test(label);
}

function renderDetailValue(key: string, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return <span className="text-slate-600">—</span>;
  if (key === "date" || key === "registered" || key === "lastLogin" || key === "lastMessageAt") return <span className="whitespace-nowrap text-slate-400">{fmtDate(String(value))}</span>;
  if (["amount", "balance", "bet", "payout", "profit", "bets", "payouts"].includes(key) && typeof value === "number") {
    const color = key === "profit" ? value >= 0 ? "text-emerald-300" : "text-rose-300" : "text-white";
    return <span className={`whitespace-nowrap font-semibold tabular-nums ${color}`}>{fmt(value)}</span>;
  }
  if (key === "status" || key === "outcome" || key === "playerType" || key === "wonToday" || key === "flow") {
    const normalized = String(value).toLowerCase();
    const color = ["active", "win", "yes", "cash in", "new player"].includes(normalized)
      ? "border-emerald-300/15 bg-emerald-400/10 text-emerald-200"
      : ["lose", "blocked", "cash out", "no"].includes(normalized)
        ? "border-rose-300/15 bg-rose-400/10 text-rose-200"
        : "border-cyan-300/15 bg-cyan-400/10 text-cyan-200";
    return <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold capitalize ${color}`}>{String(value)}</span>;
  }
  return <span className="block truncate" title={String(value)}>{typeof value === "number" ? value.toLocaleString() : value}</span>;
}
