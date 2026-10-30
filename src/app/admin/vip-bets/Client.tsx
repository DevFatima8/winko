"use client";

import { useActionState, useEffect } from "react";
import { Card, fmt } from "@/components/Shell";
import { adjustVipBetPointsAction, type ActionState } from "@/lib/actions";
import { usePage, REDIRECT } from "@/lib/useDb";

type Player = { _id: string; name: string; phone: string; username: string | null; vipBetPoints?: number };

function PointsAdjustment({ user }: { user: Player }) {
    const [state, action, pending] = useActionState<ActionState, FormData>(adjustVipBetPointsAction.bind(null, user._id), undefined);
    useEffect(() => { if (state?.success) window.location.reload(); }, [state]);
    return (
        <form action={action} className="flex min-w-[260px] items-center gap-2">
            <select name="direction" defaultValue="add" aria-label="Points adjustment" className="rounded-lg border border-[#3a2470] bg-black/30 px-2 py-2 text-xs text-white">
                <option value="add">Add</option><option value="remove">Remove</option>
            </select>
            <input name="amount" type="number" min="1" step="1" required placeholder="Points" className="w-24 rounded-lg border border-[#3a2470] bg-black/30 px-2 py-2 text-xs text-white" />
            <button disabled={pending} className="btn-violet rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50">{pending ? "Saving" : "Apply"}</button>
            {state?.error && <span className="text-xs text-red-300">{state.error}</span>}
        </form>
    );
}

export default function VipBetPointsClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
    return usePage(async () => {
        const { q, order } = searchParams ?? {};
        const query = new URLSearchParams({ view: "vipBetPoints" });
        if (q) query.set("q", q);
        if (order) query.set("order", order);
        const response = await fetch(`/api/admin/data?${query}`, { cache: "no-store" });
        const data = await response.json();
        if (response.status === 403) return REDIRECT("/admin");
        if (!response.ok) throw new Error(data.error ?? "VIP points load nahi ho sake.");
        const users = data.users as Player[];
        return (
            <div className="space-y-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div><h1 className="text-2xl font-bold text-white">VIP Required Bets</h1><p className="text-sm text-[#b8a7e6]">Player ke VIP bet points manually add ya remove karein. New registration par 100 points milte hain.</p></div>
                    <form className="flex flex-wrap gap-2">
                        <input name="q" defaultValue={q ?? ""} placeholder="Search player / phone / username" className="min-w-56 rounded-xl border border-[#3a2470] bg-black/30 px-3 py-2 text-sm text-white" />
                        <select name="order" defaultValue={order === "asc" ? "asc" : "desc"} aria-label="Client name sort order" className="rounded-xl border border-[#3a2470] bg-black/30 px-3 py-2 text-sm text-white"><option value="asc">Ascending (A-Z)</option><option value="desc">Descending (Z-A)</option></select>
                        <button className="btn-violet rounded-xl px-4 py-2 text-sm font-bold">Search</button>
                    </form>
                </div>
                <Card>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-left text-sm">
                            <thead className="text-xs uppercase text-[#6f5fa3]"><tr><th className="pb-3">Player</th><th className="pb-3">Username</th><th className="pb-3">Phone</th><th className="pb-3">VIP bet points</th><th className="pb-3">Adjust</th></tr></thead>
                            <tbody className="divide-y divide-[#3a2470]/50">{users.map((user) => <tr key={user._id}><td className="py-3 font-medium text-white">{user.name}</td><td className="py-3 text-[#e9ddff]">{user.username ?? "-"}</td><td className="py-3 text-[#e9ddff]">{user.phone}</td><td className="py-3 font-black text-[#ffb800]">{fmt(user.vipBetPoints ?? 0)}</td><td className="py-3"><PointsAdjustment user={user} /></td></tr>)}{users.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-[#6f5fa3]">Koi player nahi mila.</td></tr>}</tbody>
                        </table>
                    </div>
                </Card>
            </div>
        );
    }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}