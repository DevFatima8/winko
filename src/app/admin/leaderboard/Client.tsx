"use client";

import { useState } from "react";
import { Card } from "@/components/Shell";
import { saveLeaderboardAction, type ActionState } from "@/lib/actions";
import { usePage, REDIRECT } from "@/lib/useDb";
import { useAdminActionState } from "@/lib/adminLiveUpdates";

type Entry = { name: string; amount: number };

function LeaderboardEditor({ initial }: { initial: Entry[] }) {
    const [entries, setEntries] = useState(() => Array.from({ length: 3 }, (_, index) => initial[index] ?? { name: "", amount: 0 }));
    const [state, action, pending] = useAdminActionState<ActionState, FormData>(saveLeaderboardAction, undefined);
    const update = (index: number, change: Partial<Entry>) => setEntries((current) => current.map((entry, i) => i === index ? { ...entry, ...change } : entry));
    return (
        <form action={action} className="space-y-4">
            <input type="hidden" name="entries" value={JSON.stringify(entries)} />
            <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                    <thead className="text-xs uppercase text-[#6f5fa3]"><tr><th className="pb-3">Rank</th><th className="pb-3">Winner name</th><th className="pb-3">Winning amount (Rs.)</th></tr></thead>
                    <tbody className="divide-y divide-[#3a2470]/50">{entries.map((entry, index) => (
                        <tr key={index}>
                            <td className="py-2 font-black text-[#ffb800]">{index + 1}</td>
                            <td className="py-2 pr-3"><input value={entry.name} maxLength={50} required onChange={(event) => update(index, { name: event.target.value })} placeholder="Winner name" className="w-full rounded-lg border border-[#3a2470] bg-black/30 px-3 py-2 text-sm text-white" /></td>
                            <td className="py-2 pr-3"><input value={entry.amount} type="number" min="0" step="1" onChange={(event) => update(index, { amount: Number(event.target.value) })} className="w-full rounded-lg border border-[#3a2470] bg-black/30 px-3 py-2 text-sm text-white" /></td>
                        </tr>
                    ))}</tbody>
                </table>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <button disabled={pending} className="btn-gold rounded-xl px-6 py-2 text-sm font-black disabled:opacity-50">{pending ? "Saving..." : "Save leaderboard"}</button>
                {state?.error && <span className="text-sm text-red-300">{state.error}</span>}
                {state?.success && <span className="text-sm text-emerald-300">{state.success}</span>}
            </div>
        </form>
    );
}

export default function LeaderboardAdminClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
    return usePage(async () => {
        const response = await fetch("/api/admin/data?view=leaderboard", { cache: "no-store" });
        const data = await response.json();
        if (response.status === 403) return REDIRECT("/admin");
        if (!response.ok) throw new Error(data.error ?? "Leaderboard load nahi ho saka.");
        return <div className="space-y-6"><div><h1 className="text-2xl font-bold text-white">Home Leaderboard</h1><p className="text-sm text-[#b8a7e6]">Sirf top 3 winner names aur amounts yahan manage karein.</p></div><Card><LeaderboardEditor initial={(data.entries as Entry[]).slice(0, 3)} /></Card></div>;
    }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}