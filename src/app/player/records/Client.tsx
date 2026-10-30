"use client";
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight, Gamepad2 } from "lucide-react";
import { Card, StatusBadge, fmt, fmtDate } from "@/components/Shell";
import { SubHeader } from "@/components/PlayerUi";
import { usePage } from "@/lib/useDb";

type Tx = { _id: string; type: "deposit" | "withdraw"; createdAt: string; amount: number; status: string; method?: string; slipImage?: string | null; adminNote?: string | null };
type Play = { _id: string; gameId: { name: string; icon: string } | null; roundNo: number | null; createdAt: string; betAmount: number; winAmount: number; outcome: string; poolPending?: boolean; poolClaim?: number };
type Data = { transactions: Tx[]; plays: Play[]; totals: { rounds: number; bets: number; wins: number }; me: { balance: number }; holds: { locked: number; claimable: number } };

const TABS = ["Statement", "Bet Record", "Report", "Retrieve Balance", "Deposit Records", "Withdrawal Records"] as const;
type Tab = (typeof TABS)[number];
const PERIODS = [["today", "Today"], ["7d", "Last 7 days"], ["30d", "Last 30 days"], ["all", "All"]] as const;

const sel = "min-w-0 flex-1 rounded-lg border border-[#3a2470] bg-black/30 px-2 py-2 text-xs font-semibold text-white outline-none";
const inPeriod = (iso: string, p: string) => {
  if (p === "all") return true;
  const d = new Date(iso);
  if (p === "today") return d.toDateString() === new Date().toDateString();
  if (p.startsWith("d:")) {
    const n = Number(p.slice(2));
    return n > 0 ? Date.now() - d.getTime() <= n * 86400000 : true;
  }
  return Date.now() - d.getTime() <= (p === "7d" ? 7 : 30) * 86400000;
};
const Empty = ({ text }: { text: string }) => <div className="py-12 text-center text-sm text-[#b8a7e6]">{text}</div>;

function Records({ data }: { data: Data }) {
  const [tab, setTab] = useState<Tab>("Statement");
  const [basePeriod, setPeriod] = useState("today");
  const [days, setDays] = useState("");
  const period = basePeriod === "custom" ? `d:${days}` : basePeriod;
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");
  const { transactions: tx, plays, me } = data;
  const approved = (x: Tx) => x.status === "approved";
  const sumTx = (type: Tx["type"]) => tx.filter((x) => x.type === type && approved(x)).reduce((s, x) => s + x.amount, 0);

  const ledger = [
    ...tx.map((x) => ({ id: x._id, at: x.createdAt, kind: x.type === "deposit" ? "deposit" : "withdraw", title: x.type === "deposit" ? "Deposit" : "Withdrawal", amount: x.type === "deposit" ? x.amount : -x.amount, status: x.status })),
    ...plays.filter((p) => p.outcome !== "pending" && !p.poolPending).map((p) => ({ id: p._id, at: p.createdAt, kind: "game", title: `${p.gameId?.name ?? "Game"} #${p.roundNo ?? "-"}`, amount: p.winAmount - p.betAmount, status: p.outcome })),
  ].filter((x) => inPeriod(x.at, period) && (kind === "all" || x.kind === kind)).sort((a, b) => +new Date(b.at) - +new Date(a.at));

  const betList = plays.filter((p) => inPeriod(p.createdAt, period) && (status === "all" || (p.poolPending ? "pending" : p.outcome) === status));
  const rep = plays.filter((p) => inPeriod(p.createdAt, period) && p.outcome !== "pending" && !p.poolPending);
  const repBet = rep.reduce((s, p) => s + p.betAmount, 0);
  const repWin = rep.reduce((s, p) => s + p.winAmount, 0);
  const txList = (type: Tx["type"]) => tx.filter((x) => x.type === type && inPeriod(x.createdAt, period) && (status === "all" || x.status === status));

  const periodSel = (
    <div className="flex min-w-0 flex-1 gap-2">
      <select aria-label="Period" value={basePeriod} onChange={(e) => setPeriod(e.target.value)} className={sel}>{PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}<option value="custom">Custom days</option></select>
      {basePeriod === "custom" && <input aria-label="Number of days" type="number" inputMode="numeric" min={1} placeholder="Days e.g. 20" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} className={`${sel} w-24 flex-none`} />}
    </div>
  );
  const statusSel = (opts: string[]) => <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className={sel}><option value="all">All Status</option>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
  const txRows = (list: Tx[]) => list.length === 0 ? <Empty text="No Records" /> : (
    <ul className="divide-y divide-[#3a2470]/60 text-sm">
      {list.map((x) => (
        <li key={String(x._id)} className="py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0"><div className="font-semibold text-white">{x.type === "deposit" ? "Deposit" : "Withdrawal"}</div><div className="text-xs text-[#b8a7e6]">{fmtDate(x.createdAt)}</div></div>
            <div className="flex shrink-0 items-center gap-2"><span className="font-bold text-white">{fmt(x.amount)}</span><StatusBadge status={x.status} /></div>
          </div>
          {x.slipImage && (
            <a href={x.slipImage} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-3 rounded-xl bg-black/30 p-2 text-xs text-[#c4b5fd]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={x.slipImage} alt="Payment slip" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
              <span>Payment slip (tap to view)</span>
            </a>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 lg:max-w-6xl">
      <SubHeader title="My Records" />
      <div className="wx-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
        {TABS.map((x) => (
          <motion.button whileTap={{ scale: 0.95 }} key={x} type="button" onClick={() => { setTab(x); setStatus("all"); setKind("all"); }} className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-bold transition-all lg:px-6 lg:py-2.5 lg:text-sm ${tab === x ? "btn-gold !shadow-none" : "wx-card text-[#b8a7e6] hover:text-white"}`}>{x}</motion.button>
        ))}
      </div>

      <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-4">
      {tab === "Statement" && (
        <div className="grid gap-4 lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:items-start lg:gap-6">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#4c1d95] via-[#2e1065] to-[#150a35] p-4 shadow-[0_14px_34px_rgba(76,29,149,.4)] lg:col-span-4 lg:col-start-9 lg:row-start-1 lg:p-5">
            <motion.div aria-hidden animate={{ x: [0, 12, 0] }} transition={{ duration: 7, repeat: Infinity }} className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[#ffb800]/20 blur-2xl" />
            <div className="relative flex flex-wrap items-center justify-between gap-3 lg:flex-col lg:items-start">
              <div><div className="text-xs text-[#d4c8ff]">Current balance</div><div className="text-2xl font-black text-[#ffb800] lg:text-3xl">{fmt(me.balance)}</div></div>
            </div>
          </div>

          <div className="space-y-4 lg:col-span-8 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <div className="flex gap-2">{periodSel}
              <select aria-label="Account change type" value={kind} onChange={(e) => setKind(e.target.value)} className={sel}><option value="all">Account change type</option><option value="deposit">Deposit</option><option value="withdraw">Withdrawal</option><option value="game">Game</option></select>
            </div>
            <Card title="Statement">
              {ledger.length === 0 ? <Empty text="No Records" /> : (
                <ul className="divide-y divide-[#3a2470]/60 text-sm">
                  {ledger.map((x, i) => (
                    <motion.li initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }} key={`${x.kind}-${x.id}`} className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-white/[0.03] lg:px-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base ${x.amount >= 0 ? "bg-emerald-500/15" : "bg-red-500/15"}`}>{x.kind === "deposit" ? <ArrowDownLeft size={18} className="text-emerald-400" /> : x.kind === "withdraw" ? <ArrowUpRight size={18} className="text-red-400" /> : <Gamepad2 size={18} className="text-[#c4b5fd]" />}</span>
                        <div className="min-w-0"><div className="truncate font-semibold text-white">{x.title}</div><div className="text-xs text-[#b8a7e6]">{fmtDate(x.at)} · {x.status}</div></div>
                      </div>
                      <span className={`shrink-0 font-black ${x.amount >= 0 ? "text-emerald-400" : "text-red-400"}`}>{x.amount >= 0 ? "+" : "-"}{fmt(Math.abs(x.amount))}</span>
                    </motion.li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-[11px] lg:col-span-4 lg:col-start-9 lg:row-start-2 lg:grid-cols-1 lg:self-start lg:gap-3 lg:text-left lg:text-sm">
            <div className="wx-card rounded-xl p-2 lg:flex lg:items-center lg:justify-between lg:p-4"><div className="text-[#b8a7e6]">Total Deposits</div><div className="font-black text-emerald-400">{fmt(sumTx("deposit"))}</div></div>
            <div className="wx-card rounded-xl p-2 lg:flex lg:items-center lg:justify-between lg:p-4"><div className="text-[#b8a7e6]">Total Withdrawal</div><div className="font-black text-red-400">{fmt(sumTx("withdraw"))}</div></div>
            <div className="wx-card rounded-xl p-2 lg:flex lg:items-center lg:justify-between lg:p-4"><div className="text-[#b8a7e6]">Total Received</div><div className="font-black text-[#ffb800]">{fmt(data.totals.wins)}</div></div>
          </div>
        </div>
      )}

      {tab === "Bet Record" && (<>
        <div className="flex gap-2">{periodSel}{statusSel(["win", "lose", "pending"])}</div>
        <Card title="Bet Record">
          {betList.length === 0 ? <Empty text="No Records" /> : (
            <ul className="divide-y divide-[#3a2470]/60 text-sm">
              {betList.map((p) => (
                <li key={String(p._id)} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><span className="mr-2">{p.gameId?.icon}</span><span className="font-semibold text-white">{p.gameId?.name}</span><span className="ml-2 text-xs text-[#b8a7e6]">#{p.roundNo} · {fmtDate(p.createdAt)}</span></div>
                  <div className="flex flex-wrap items-center gap-3 text-xs"><span className="text-[#b8a7e6]">Bet {fmt(p.betAmount)}</span><span className="text-emerald-400">{p.poolPending ? `Claim ${fmt(p.poolClaim ?? 0)}` : `Win ${fmt(p.winAmount)}`}</span><StatusBadge status={p.poolPending ? "pending" : p.outcome} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </>)}

      {tab === "Report" && (<>
        <div className="flex gap-2">{periodSel}</div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="wx-card rounded-2xl p-4"><div className="text-xs text-[#b8a7e6]">Total W/L</div><div className={`text-xl font-black ${repWin - repBet >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(repWin - repBet)}</div></div>
          <div className="wx-card rounded-2xl p-4"><div className="text-xs text-[#b8a7e6]">Total bet</div><div className="text-xl font-black text-white">{fmt(repBet)}</div></div>
          <div className="wx-card rounded-2xl p-4"><div className="text-xs text-[#b8a7e6]">Total valid bets</div><div className="text-xl font-black text-white">{fmt(repBet)}</div></div>
          <div className="wx-card rounded-2xl p-4"><div className="text-xs text-[#b8a7e6]">Total bet count</div><div className="text-xl font-black text-white">{rep.length.toLocaleString()}</div></div>
        </div>
        <Card title="W/L ranking">
          {rep.length === 0 ? <Empty text="No Records" /> : (() => {
            const byGame = new Map<string, number>();
            rep.forEach((p) => byGame.set(p.gameId?.name ?? "Game", (byGame.get(p.gameId?.name ?? "Game") ?? 0) + p.winAmount - p.betAmount));
            return <ul className="divide-y divide-[#3a2470]/60 text-sm">{[...byGame.entries()].sort((a, b) => b[1] - a[1]).map(([name, v]) => <li key={name} className="flex justify-between gap-3 py-2.5"><span className="truncate text-white">{name}</span><span className={`font-black ${v >= 0 ? "text-emerald-400" : "text-red-400"}`}>{v >= 0 ? "+" : "-"}{fmt(Math.abs(v))}</span></li>)}</ul>;
          })()}
        </Card>
      </>)}

      {tab === "Retrieve Balance" && (<>
        <div className="wx-card rounded-2xl p-4"><div className="text-xs text-[#b8a7e6]">Current balance</div><div className="text-2xl font-black text-[#ffb800]">{fmt(me.balance)}</div></div>
        <Link href="/player/withdraw" className="btn-gold block rounded-full py-3 text-center text-sm font-black">Withdraw</Link>
      </>)}

      {tab === "Deposit Records" && (<>
        <div className="flex gap-2">{periodSel}{statusSel(["pending", "approved", "rejected"])}</div>
        <Card title="Deposit Records">{txRows(txList("deposit"))}</Card>
      </>)}

      {tab === "Withdrawal Records" && (<>
        <div className="flex gap-2">{periodSel}{statusSel(["pending", "approved", "rejected"])}</div>
        <Card title="Withdrawal Records">{txRows(txList("withdraw"))}</Card>
        <div className="wx-card flex justify-between rounded-xl p-3 text-sm"><span className="text-[#b8a7e6]">Total Withdrawal</span><b className="text-white">{fmt(sumTx("withdraw"))}</b></div>
      </>)}
      </motion.div>
    </div>
  );
}

export default function RecordsPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  return usePage(async () => {
    const response = await fetch("/api/player/history", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Records load nahi ho sakay.");
    return <Records data={data as Data} />;
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
