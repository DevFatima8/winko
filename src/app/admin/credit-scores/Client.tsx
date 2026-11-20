"use client";

import { useState } from "react";
import { Card } from "@/components/Shell";
import { AdminUserSearch, type UserSearchFilters } from "@/components/admin/AdminUserSearch";
import { adjustCreditScoreAction, type ActionState } from "@/lib/actions";
import { useAdminActionState } from "@/lib/adminLiveUpdates";
import { DEFAULT_CREDIT_SCORE } from "@/lib/creditScore";
import { useDb } from "@/lib/useDb";

type Player = { _id: string; name: string; phone: string; username: string | null; creditScore?: number };

function ScoreAdjustment({ user }: { user: Player }) {
  const [state, action, pending] = useAdminActionState<ActionState, FormData>(adjustCreditScoreAction.bind(null, user._id), undefined);
  return <form action={action} className="flex flex-wrap items-center gap-2">
    <select name="direction" aria-label={`Adjust ${user.name}'s credit score`} defaultValue="add" className="rounded-lg bg-black/30 p-2">
      <option value="add">Increase</option><option value="remove">Decrease</option>
    </select>
    <input name="amount" aria-label={`Credit score amount for ${user.name}`} type="number" min="1" step="1" required placeholder="Points" className="w-24 rounded-lg bg-black/30 p-2" />
    <button disabled={pending} className="btn-violet rounded-lg px-3 py-2 disabled:opacity-50">{pending ? "Saving..." : "Apply"}</button>
    {state?.error && <span role="alert" className="text-xs text-red-300">{state.error}</span>}
    {state?.success && <span role="status" className="text-xs text-emerald-300">{state.success}</span>}
  </form>;
}

export default function CreditScoresClient({ searchParams = {} }: { searchParams?: Record<string, string> }) {
  const [filters, setFilters] = useState<UserSearchFilters>({ q: searchParams.q ?? "", role: "", order: searchParams.order === "asc" ? "asc" : "desc" });
  const { data, error, reload } = useDb(async signal => {
    const query = new URLSearchParams({ view: "creditScores", q: filters.q, order: filters.order });
    const response = await fetch(`/api/admin/data?${query}`, { cache: "no-store", signal });
    const result: { users?: Player[]; error?: string } = await response.json();
    if (!response.ok || !Array.isArray(result.users)) throw new Error(result.error ?? "Credit scores could not be loaded.");
    return result.users;
  }, [filters]);
  return <div className="space-y-6 text-white">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Credit Scores</h1><p className="text-sm text-[#b8a7e6]">Increase or decrease player credit scores. Default: 100. Wallet balance and VIP points are unchanged.</p></div>
      <AdminUserSearch initial={filters} onSearch={setFilters} />
    </div>
    {error && <div role="alert" className="text-red-300">{error} <button type="button" onClick={reload}>Retry</button></div>}
    {!data && !error && <p role="status">Loading credit scores...</p>}
    {data && <Card><div className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-left text-sm">
        <thead><tr><th className="pb-3">Player</th><th className="pb-3">Username</th><th className="pb-3">Phone</th><th className="pb-3">Credit Score</th><th className="pb-3">Adjust</th></tr></thead>
        <tbody>{data.map(user => <tr key={user._id} className="border-t border-white/10">
          <td className="py-3">{user.name}</td><td>{user.username ?? "-"}</td><td>{user.phone}</td>
          <td className="font-bold text-emerald-300">{(user.creditScore ?? DEFAULT_CREDIT_SCORE).toLocaleString()}</td>
          <td className="py-3"><ScoreAdjustment user={user} /></td>
        </tr>)}
          {!data.length && <tr><td colSpan={5} className="py-6 text-center">No players found.</td></tr>}
        </tbody>
      </table>
    </div></Card>}
  </div>;
}
