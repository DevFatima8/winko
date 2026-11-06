"use client";

import { useActionState, useEffect } from "react";
import { claimReferralCommissionAction, type ActionState } from "@/lib/actions";
import { useDb } from "@/lib/useDb";

export function ReferralCommissionCard({ initial, locked, earned }: { initial: number; locked: number; earned: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(claimReferralCommissionAction, undefined);
  const { data, error, reload } = useDb<{ claimable: number; locked: number }>(async signal => {
    const response = await fetch("/api/player/winnings", { cache: "no-store", signal });
    const summary = await response.json();
    if (!response.ok) throw new Error(summary.error ?? "Referral commission load nahi ho saki.");
    if (!Number.isFinite(summary.referralClaimable) || summary.referralClaimable < 0) throw new Error("Invalid referral commission summary.");
    if (!Number.isFinite(summary.referralLocked) || summary.referralLocked < 0) throw new Error("Invalid locked referral commission summary.");
    return { claimable: summary.referralClaimable, locked: summary.referralLocked };
  }, [initial, locked]);
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
  const amounts = data ?? { claimable: initial, locked };
  const amount = Math.round((amounts.claimable + amounts.locked) * 100) / 100;
  const claimed = amount === 0 && (earned > 0 || !!state?.success);
  return (
    <section id="referral-commission" className="wx-card scroll-mt-24 space-y-3 rounded-2xl p-4">
      <h2 className="text-sm font-bold text-white">Referral Commission</h2>
      <p className="text-xs text-[#b8a7e6]">claim comission amount after 12am</p>
      <div className="rounded-xl bg-black/30 p-3 ring-1 ring-[#3a2470]">
        <div className="text-[10px] uppercase text-[#b8a7e6]">Commission not claimed</div>
        <div className="break-all font-black text-[#ffb800]">Rs. {amount.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="min-w-0 rounded-xl bg-black/30 p-3 text-[#b8a7e6]">Locked<div className="break-all font-bold text-white">Rs. {amounts.locked.toLocaleString("en-PK")}</div></div>
        <div className="min-w-0 rounded-xl bg-black/30 p-3 text-[#b8a7e6]">Claimable<div className="break-all font-bold text-[#ffb800]">Rs. {amounts.claimable.toLocaleString("en-PK")}</div></div>
      </div>
      {claimed && <p role="status" className="text-sm font-semibold text-emerald-400">Commission claimed</p>}
      {state?.error && <p role="alert" className="text-xs text-red-300">{state.error}</p>}
      {state?.success && <p role="status" className="text-xs text-emerald-400">{state.success}</p>}
      {error && <p role="alert" className="text-xs text-red-300">{error} <button type="button" onClick={reload} className="underline">Retry</button></p>}
      <form action={action}>
        <button disabled={pending || !!error || amounts.claimable <= 0} className="btn-gold w-full rounded-xl py-2.5 font-black disabled:opacity-50">
          {pending ? "Please wait..." : claimed ? "Commission claimed" : "Claim commission"}
        </button>
      </form>
    </section>
  );
}
