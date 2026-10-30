"use client";
import { Card } from "@/components/Shell";
import { VipForm } from "@/components/admin/Forms";
import { usePage, NOT_FOUND, REDIRECT } from "@/lib/useDb";

export default function VipPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  void params; void searchParams;
  return usePage(async () => {
    const response = await fetch("/api/admin/data?view=vip", { cache: "no-store" });
    const data = await response.json();
    if (response.status === 403) return REDIRECT("/admin");
    if (!response.ok) throw new Error(data.error ?? "VIP settings load nahi ho sakin.");
    const dist = data.dist as { _id: number; c: number }[];
    const levels = (data.levels as { level?: number | null; name?: string | null; minDeposit?: number | null; nextLevelBonus?: number | null; dailyWithdrawLimit?: number | null; withdrawalsPerDay?: number | null; perWithdrawMax?: number | null; minWithdraw?: number | null }[]).sort((a, b) => (a.level ?? 0) - (b.level ?? 0)).map((l) => ({ level: l.level ?? 0, name: l.name ?? "", minDeposit: l.minDeposit ?? 0, nextLevelBonus: l.nextLevelBonus ?? 0, dailyWithdrawLimit: l.dailyWithdrawLimit ?? 0, withdrawalsPerDay: l.withdrawalsPerDay ?? 0, perWithdrawMax: l.perWithdrawMax ?? 0, minWithdraw: l.minWithdraw ?? 500 }));
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">VIP Deposit Levels</h1>
          <p className="text-sm text-[#b8a7e6]">Sheet ke deposit, next-level bonus, daily withdrawal limit aur per-day withdrawal count yahan configure karein. Level total approved deposits se calculate hoti hai; 0 ka matlab unlimited hai. Save karne par sab users ki levels dobara calculate hoti hain.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {levels.map((l) => <span key={l.level} className="rounded-full bg-black/30 px-3 py-1 text-xs text-[#e9ddff] ring-1 ring-[#3a2470]">{l.level} {l.name}: <b className="text-[#ffb800]">{dist.find((d) => d._id === l.level)?.c ?? 0}</b> users</span>)}
        </div>
        <Card title="Level configuration"><VipForm levels={levels} /></Card>
      </div>
    );
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
