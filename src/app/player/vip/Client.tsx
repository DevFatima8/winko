"use client";
import { useState } from "react";
import Link from "next/link";
import { fmt } from "@/components/Shell";
import { Bar, SubHeader } from "@/components/PlayerUi";
import { CrownIcon, GiftIcon } from "@/components/Icons";
import { usePage } from "@/lib/useDb";

type Level = { level?: number | null; name?: string | null; minDeposit?: number | null; nextLevelBonus?: number | null; dailyWithdrawLimit?: number | null; withdrawalsPerDay?: number | null; perWithdrawMax?: number | null; minWithdraw?: number | null };
type Me = { vipLevel: number; totalDeposited: number; vipBetPoints?: number };

const TOP_TABS: [string, string][] = [["Event", "/events"], ["Fund", "/player/wallet"], ["VIP", ""], ["Mission", "/promo"], ["Rebate", "/player/team"], ["Unclaimed", "/player/records"], ["History", "/player/records"]];

function Vip({ me, levels }: { me: Me; levels: Level[] }) {
  const [sel, setSel] = useState(me.vipLevel);
  const cur = levels.find((l) => l.level === me.vipLevel);
  const next = levels.find((l) => (l.level ?? 0) > me.vipLevel) ?? null;
  const shown = levels.find((l) => l.level === sel) ?? cur;
  const pct = next ? Math.round((me.totalDeposited / (next.minDeposit || 1)) * 100) : 100;
  const reached = (shown?.level ?? 0) <= me.vipLevel;
  const benefits = (l?: Level) => [
    ["Daily withdraw limit", fmt(l?.dailyWithdrawLimit ?? 0)],
    ["Max per withdrawal", fmt(l?.perWithdrawMax ?? 0)],
    ["Withdrawals per day", String(l?.withdrawalsPerDay ?? "-")],
    ["Min withdrawal", fmt(l?.minWithdraw ?? 0)],
  ];

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <SubHeader title="VIP" />
      <div className="wx-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {TOP_TABS.map(([label, href]) => href
          ? <Link key={label} href={href} className="wx-card shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold text-[#b8a7e6]">{label}</Link>
          : <span key={label} className="btn-gold shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold">{label}</span>)}
      </div>

      <div className="wx-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {levels.map((l) => (
          <button key={l.level} type="button" onClick={() => setSel(l.level ?? 0)} className={`shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-black ${sel === l.level ? "btn-gold" : "wx-card text-[#b8a7e6]"}`}>VIP{l.level}</button>
        ))}
      </div>

      <section className="on-image rounded-2xl bg-gradient-to-br from-[#3b0764] via-[#6d28d9] to-[#c026d3] p-4 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-white/80">Current Level</div>
            <div className="truncate text-2xl font-black text-white">VIP{me.vipLevel} {cur?.name}</div>
          </div>
          <CrownIcon size={44} className="shrink-0 text-[#ffb800]" />
        </div>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] text-white"><span>Deposit</span><span>{fmt(me.totalDeposited)}{next ? ` / ${fmt(next.minDeposit ?? 0)}` : ""}</span></div>
          <Bar pct={pct} />
        </div>
        {next ? <Link href="/player/wallet" className="btn-gold mt-3 block rounded-full py-2.5 text-center text-sm font-black">Level up now</Link> : <div className="mt-3 text-center text-sm font-bold text-[#ffe9a3]">Maximum level reached</div>}
      </section>

      <section className="wx-card rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="font-black text-white">V{shown?.level} level · {benefits(shown).length} benefits</div>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${reached ? "bg-emerald-500/15 text-emerald-400" : "bg-black/30 text-[#b8a7e6]"}`}>{reached ? "Reached" : "Locked"}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-black/30 p-3"><div className="text-[11px] text-[#b8a7e6]">Next level bonus</div><div className="font-black text-[#ffb800]">{fmt(shown?.nextLevelBonus ?? 0)}</div></div>
          <div className="rounded-xl bg-black/30 p-3"><div className="text-[11px] text-[#b8a7e6]">Deposit required</div><div className="font-black text-white">{fmt(shown?.minDeposit ?? 0)}</div></div>
        </div>
        <div className="mt-3 text-xs font-bold text-[#b8a7e6]">VIP Privilege</div>
        <ul className="mt-1 divide-y divide-[#3a2470]/60 text-sm">
          {benefits(shown).map(([k, v]) => <li key={k} className="flex justify-between gap-3 py-2"><span className="text-[#b8a7e6]">{k}</span><b className="text-white">{v}</b></li>)}
        </ul>
      </section>

      <Link href="/promo" className="on-image flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-[#7c4a03] via-[#c98a0b] to-[#f5b92e] p-4">
        <div className="flex min-w-0 items-center gap-3"><GiftIcon size={28} className="shrink-0 text-white" /><div className="min-w-0"><div className="truncate text-sm font-black text-white">Check-in for Mystery Rewards</div><div className="text-[11px] text-white/80">See today&apos;s promotions</div></div></div>
        <span className="rounded-full bg-white/90 px-4 py-1.5 text-xs font-black text-[#7c4a03]">Claim</span>
      </Link>

      <section className="wx-card rounded-2xl p-4">
        <div className="font-black text-white">V{shown?.level} reward</div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-black/30 p-3"><div className="text-[11px] text-[#b8a7e6]">Accumulated Bonuses</div><div className="font-black text-white">{fmt(levels.filter((l) => (l.level ?? 0) <= me.vipLevel).reduce((s, l) => s + (l.nextLevelBonus ?? 0), 0))}</div></div>
          <div className="rounded-xl bg-black/30 p-3"><div className="text-[11px] text-[#b8a7e6]">Next level bonus</div><div className="font-black text-[#ffb800]">+{fmt(shown?.nextLevelBonus ?? 0)}</div></div>
        </div>
      </section>

      <section className="wx-card overflow-hidden rounded-2xl">
        <div className="px-4 py-3 font-black text-white">Benefits comparison</div>
        <div className="wx-scroll overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-xs">
            <thead><tr className="bg-black/30 text-[#b8a7e6]"><th className="px-3 py-2">Level</th><th className="px-3 py-2">Deposit</th><th className="px-3 py-2">Daily limit</th><th className="px-3 py-2">Per withdraw</th><th className="px-3 py-2">Bonus</th></tr></thead>
            <tbody className="divide-y divide-[#3a2470]/60 text-white">
              {levels.map((l) => (
                <tr key={l.level} className={l.level === me.vipLevel ? "bg-[#ffb800]/10" : ""}><td className="px-3 py-2 font-bold">VIP{l.level}</td><td className="px-3 py-2">{fmt(l.minDeposit ?? 0)}</td><td className="px-3 py-2">{fmt(l.dailyWithdrawLimit ?? 0)}</td><td className="px-3 py-2">{fmt(l.perWithdrawMax ?? 0)}</td><td className="px-3 py-2">{fmt(l.nextLevelBonus ?? 0)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function VipPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  return usePage(async () => {
    const response = await fetch("/api/player/profile", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "VIP data load nahi ho saka.");
    const levels = [...(data.settings.vipLevels as Level[])].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
    return <Vip me={data.me as Me} levels={levels} />;
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
