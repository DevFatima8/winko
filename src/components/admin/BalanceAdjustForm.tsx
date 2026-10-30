"use client";

import { useActionState } from "react";
import { adjustUserBalanceAction, type ActionState } from "../../lib/actions";

const input = "w-full rounded-xl border border-[#3a2470] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#d946ef]";

export function BalanceAdjustForm({ userId, balance }: { userId: string; balance: number }) {
    const [state, action, pending] = useActionState<ActionState, FormData>(adjustUserBalanceAction, undefined);
    return (
        <form action={action} className="space-y-3">
            <input type="hidden" name="id" value={userId} />
            <p className="text-xs text-[#b8a7e6]">Current balance: <b className="text-[#ffb800]">Rs. {balance.toLocaleString()}</b></p>
            <label className="block"><span className="mb-1 block text-xs font-semibold text-[#b8a7e6]">Amount</span><input name="amount" type="number" min="1" step="1" required placeholder="e.g. 1000" className={input} /></label>
            <div className="grid grid-cols-2 gap-2">
                <button name="direction" value="add" disabled={pending} className="rounded-xl bg-emerald-500/20 px-3 py-2.5 text-sm font-black text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-60">{pending ? "Processing..." : "Add amount"}</button>
                <button name="direction" value="remove" disabled={pending} className="rounded-xl bg-red-500/20 px-3 py-2.5 text-sm font-black text-red-300 hover:bg-red-500/30 disabled:opacity-60">Remove amount</button>
            </div>
            {state?.error && <p className="rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-300">{state.error}</p>}
            {state?.success && <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs text-emerald-300">{state.success}</p>}
        </form>
    );
}
