"use client";
// testing
import { useEffect } from "react";
import { useActionState } from "react";
import { claimWinHoldsAction, type ActionState } from "@/lib/actions";

export function WinHoldCard({ locked, claimable }: { locked: number; claimable: number }) {
    const [state, action, pending] = useActionState<ActionState, FormData>(claimWinHoldsAction, undefined);
    useEffect(() => {
        if (!state?.success) return;
        window.dispatchEvent(new CustomEvent("wx:balance-update"));
        window.dispatchEvent(new CustomEvent("wx:data-refresh"));
    }, [state]);
    if (locked <= 0 && claimable <= 0) return null;
    return (
        <div className="wx-card rounded-2xl p-4">
            <h3 className="text-sm font-bold text-white">Held Winnings (2%)</h3>
            <p className="mt-1 text-xs text-[#b8a7e6]">Har win ka 2% foran claim kiya ja sakta hai.</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-black/30 p-3 ring-1 ring-[#3a2470]"><div className="text-[10px] uppercase text-[#b8a7e6]">Locked</div><div className="font-black text-white">Rs. {locked.toLocaleString()}</div></div>
                <div className="rounded-xl bg-black/30 p-3 ring-1 ring-[#3a2470]"><div className="text-[10px] uppercase text-[#b8a7e6]">Claimable</div><div className="font-black text-[#ffb800]">Rs. {claimable.toLocaleString()}</div></div>
            </div>
            {state?.error && <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{state.error}</p>}
            {state?.success && <p className="mt-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">{state.success}</p>}
            <form action={action}>
                <button disabled={pending || claimable <= 0} className="btn-gold mt-3 w-full rounded-xl py-2.5 font-black disabled:opacity-50">
                    {pending ? "Please wait..." : "Claim"}
                </button>
            </form>
        </div>
    );
}
