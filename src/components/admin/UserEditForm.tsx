"use client";

import { adminUpdateUserAction, type ActionState } from "../../lib/actions";
import { useAdminActionState } from "@/lib/adminLiveUpdates";

type U = { id: string; name: string; username: string; email: string; role: string; passwordPlain: string; withdrawPin: string; balance: number; paymentDepositLimit: number };

const input = "w-full rounded-xl border border-[#3a2470] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#d946ef]";

export function UserEditForm({ user }: { user: U }) {
  const [state, action, pending] = useAdminActionState<ActionState, FormData>(adminUpdateUserAction, undefined);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={user.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-xs font-semibold text-[#b8a7e6]">Full name</span><input name="name" defaultValue={user.name} className={input} /></label>
        <label className="block"><span className="mb-1 block text-xs font-semibold text-[#b8a7e6]">Username</span><input name="username" defaultValue={user.username} className={input} /></label>
        <label className="block"><span className="mb-1 block text-xs font-semibold text-[#b8a7e6]">Email</span><input name="email" defaultValue={user.email} className={input} /></label>
        <label className="block"><span className="mb-1 block text-xs font-semibold text-[#b8a7e6]">New password <span className="text-[#6f5fa3]">(current: <span className="font-mono text-[#ffb800]">{user.passwordPlain || "unknown"}</span>)</span></span><input name="password" placeholder="Khali chhorein = no change" className={input} /></label>
        <label className="block"><span className="mb-1 block text-xs font-semibold text-[#b8a7e6]">Withdrawal PIN <span className="text-[#6f5fa3]">(current: <span className="font-mono text-[#ffb800]">{user.withdrawPin || "not set"}</span>)</span></span><input name="pin" maxLength={4} placeholder="4 digits" className={input} /></label>
        <label className="block"><span className="mb-1 block text-xs font-semibold text-[#b8a7e6]">Payment lock limit <span className="text-[#6f5fa3]">0 = unlocked, current Rs. {user.paymentDepositLimit.toLocaleString()}</span></span><input name="paymentDepositLimit" type="number" min="0" step="1" defaultValue={user.paymentDepositLimit} placeholder="e.g. 30000" className={input} /></label>
      </div>

      {state?.error && <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{state.error}</p>}
      {state?.success && <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-300">{state.success}</p>}
      <button disabled={pending} className="btn-gold rounded-xl px-6 py-2.5 text-sm font-black disabled:opacity-60">{pending ? "Saving..." : "Save changes"}</button>
    </form>
  );
}
