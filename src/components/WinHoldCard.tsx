"use client";
import { useEffect } from "react";
import { useActionState } from "react";
import { claimWinHoldsAction, type ActionState } from "@/lib/actions";
import { useDb } from "@/lib/useDb";

export function WinHoldCard({ locked, claimable, referralClaimable = 0 }: { locked: number; claimable: number; referralClaimable?: number }) {
    const [state, action, pending] = useActionState<ActionState, FormData>(claimWinHoldsAction, undefined);
    const { data, error, reload } = useDb<{ locked: number; claimable: number; referralClaimable: number }>(async signal => {
        const response = await fetch("/api/player/winnings", { cache: "no-store", signal });
        const summary = await response.json();
        if (!response.ok) throw new Error(summary.error ?? "Winnings load nahi ho sakin.");
        if (!Number.isFinite(summary.locked) || summary.locked < 0 || !Number.isFinite(summary.claimable) || summary.claimable < 0) throw new Error("Invalid winnings summary.");
        if (!Number.isFinite(summary.referralClaimable) || summary.referralClaimable < 0) throw new Error("Invalid referral commission summary.");
        return summary;
    }, [locked, claimable, referralClaimable]);
    useEffect(() => {
        const refresh = () => { if (!document.hidden) reload(); };
        const timer = window.setInterval(refresh, 30_000);
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", refresh);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", refresh);
        };
    }, [reload]);
    useEffect(() => {
        if (!state?.success) return;
        window.dispatchEvent(new CustomEvent("wx:balance-update"));
        window.dispatchEvent(new CustomEvent("wx:data-refresh"));
    }, [state]);
    const amounts = data ?? { locked, claimable, referralClaimable };
    return (
        <div className="wx-card rounded-2xl p-4">
            <h3 className="text-sm font-bold text-white">Winning Amounts</h3>
            <p className="mt-1 text-xs text-[#b8a7e6]">Aaj ki game winnings agle din 12 AM Pakistan time ke baad claim kar sakte hain. Purani eligible winnings kisi bhi din claim kar sakte hain.</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-black/30 p-3 ring-1 ring-[#3a2470]"><div className="text-[10px] uppercase text-[#b8a7e6]">Locked</div><div className="break-all font-black text-white">Rs. {amounts.locked.toLocaleString()}</div></div>
                <div className="rounded-xl bg-black/30 p-3 ring-1 ring-[#3a2470]"><div className="text-[10px] uppercase text-[#b8a7e6]">Claimable</div><div className="break-all font-black text-[#ffb800]">Rs. {amounts.claimable.toLocaleString()}</div></div>
            </div>
            <div className="mt-3 rounded-xl bg-black/30 p-3 text-sm ring-1 ring-[#3a2470]">
                <div className="text-[10px] uppercase text-[#b8a7e6]">Referral Commission - Claimable</div>
                <div className="break-all font-black text-[#ffb800]">Rs. {amounts.referralClaimable.toLocaleString()}</div>
                <p className="mt-1 text-xs text-[#b8a7e6]">Referral commission usi din Claim kar sakte hain. Claim ke baad hi balance mein add hogi.</p>
            </div>
            {state?.error && <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{state.error}</p>}
            {state?.success && <p className="mt-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">{state.success}</p>}
            {error && <p role="alert" className="mt-2 text-xs text-red-300">{error} <button type="button" onClick={reload} className="underline">Retry</button></p>}
            <form action={action}>
                <button disabled={pending || !!error || amounts.claimable + amounts.referralClaimable <= 0} className="btn-gold mt-3 w-full rounded-xl py-2.5 font-black disabled:opacity-50">
                    {pending ? "Please wait..." : "Claim"}
                </button>
            </form>
        </div>
    );
}
