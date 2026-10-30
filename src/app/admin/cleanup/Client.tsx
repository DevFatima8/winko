"use client";

import { cleanupHistoryAction } from "@/lib/actions";
import { Card } from "@/components/Shell";
import { usePage, REDIRECT } from "@/lib/useDb";
import { PlayerDataResetForm } from "@/components/admin/PlayerDataResetForm";
import { HistoryActionForm } from "@/components/admin/HistoryActionForm";
import { SelectedHistoryForm } from "@/components/admin/SelectedHistoryForm";

const input = "w-full rounded-xl border border-[#3a2470] bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-[#d946ef]";

function CleanupForm() {
    return (
        <HistoryActionForm action={cleanupHistoryAction} confirmation="DELETE HISTORY" label="Delete selected history">
            <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-[#b8a7e6]">History category</span>
                    <select name="kind" required className={input} defaultValue="">
                        <option value="" disabled>Select history</option>
                        <option value="transactions">Deposits & withdrawals</option>
                        <option value="game-results">Mini-game results and bets</option>
                        <option value="aviator">Aviator rounds</option>
                        <option value="card-games">Dragon Tiger / Andar Bahar rounds and bets</option>
                        <option value="notifications">Notifications and announcements</option>
                        <option value="support">Support chats</option>
                        <option value="gateway">Payment gateway sessions</option>
                        <option value="commissions">Referral commissions</option>
                        <option value="admin-logs">Admin activity logs</option>
                    </select>
                </label>
                <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-[#b8a7e6]">Delete records older than (days)</span>
                    <input name="olderThanDays" type="number" min="0" placeholder="0 = all records in selected category" className={input} />
                </label>
            </div>
            <label className="block text-xs text-[#b8a7e6]">Current Agent password<input name="password" type="password" autoComplete="current-password" required className={`mt-1 ${input}`} /></label>
            <label className="block text-xs text-[#b8a7e6]">Type DELETE HISTORY<input name="confirmation" autoComplete="off" required className={`mt-1 ${input}`} /></label>
            <div className="rounded-xl bg-red-500/10 p-3 text-xs text-red-200 ring-1 ring-red-500/20">
                This removes history only. Users, balances, staff accounts, payment accounts, games and settings are never deleted here. Leave days as 0 to delete the complete selected category.
            </div>
        </HistoryActionForm>
    );
}

export default function CleanupPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
    void params; void searchParams;
    return usePage(async () => {
        const response = await fetch("/api/admin/data?view=account", { cache: "no-store" });
        const data = await response.json();
        if (response.status === 403) return REDIRECT("/admin");
        if (!response.ok || Number(data.me?.level) < 3) return REDIRECT("/admin");
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">History Cleanup</h1>
                    <p className="mt-1 text-sm text-[#b8a7e6]">Agent-only controls. Super Admin cannot delete player accounts or clear player history.</p>
                </div>
                <Card title="Reset all player history and balances"><PlayerDataResetForm /></Card>
                <Card title="Delete all / selected player history (balances unchanged)"><SelectedHistoryForm /></Card>
                <Card title="Delete old history">
                    <CleanupForm />
                </Card>
            </div>
        );
    }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
