"use client";

import { useActionState } from "react";
import { setUserPaymentLimitAction, type ActionState } from "../../lib/actions";

export function PaymentLockForm({ userId, limit }: { userId: string; limit: number }) {
    const [state, action, pending] = useActionState<ActionState, FormData>(setUserPaymentLimitAction, undefined);
    return (
        <form action={action} className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3">
            <input type="hidden" name="id" value={userId} />
            <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-56 flex-1"><span className="mb-1 block text-xs font-bold text-amber-200">Payment lock limit</span><input name="paymentDepositLimit" type="number" min="0" step="1" defaultValue={limit} placeholder="0 = unlocked" className="w-full rounded-lg border border-[#3a2470] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-amber-400" /></label>
                <button disabled={pending} className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60">{pending ? "Saving..." : "Set payment lock"}</button>
            </div>
            <p className="mt-2 text-xs text-[#b8a7e6]">0 = unlocked. Limit pending aur approved deposits mila kar apply hogi.</p>
            {state?.error && <p className="mt-2 text-xs text-red-300">{state.error}</p>}
            {state?.success && <p className="mt-2 text-xs text-emerald-300">{state.success}</p>}
        </form>
    );
}
