"use client";

import { useActionState } from "react";
import { toggleUserActiveAction } from "@/lib/actions";

type StatusState = { error?: string; success?: string; isActive: boolean };

export function UserActiveForm({ userId, isActive, requireReason = false, onChange }: {
  userId: string;
  isActive: boolean;
  requireReason?: boolean;
  onChange?: (active: boolean) => void;
}) {
  const [state, action, pending] = useActionState<StatusState, FormData>(async (previous, form) => {
    try {
      const result = await toggleUserActiveAction(userId, !previous.isActive, form);
      if (result?.success && typeof result.isActive === "boolean") {
        onChange?.(result.isActive);
        window.dispatchEvent(new CustomEvent("wx:admin-refresh"));
        return { ...result, isActive: result.isActive };
      }
      return { isActive: previous.isActive, error: result?.error ?? "Account status update nahi ho saka." };
    } catch (error) {
      console.error("[User account status]", error);
      return { isActive: previous.isActive, error: "Account status update nahi ho saka. Login aur connection check karke dobara try karein." };
    }
  }, { isActive });
  return <form action={action} aria-busy={pending} className="flex flex-wrap items-center gap-1.5">
    {state.isActive && requireReason && <input name="reason" required placeholder="Reason" aria-label="Block reason" disabled={pending} className="w-24 rounded-lg border border-[#3a2470] bg-black/30 px-2 py-1 text-[11px] text-white outline-none" />}
    <button disabled={pending} className={`rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50 ${state.isActive ? "bg-red-500/15 text-red-300" : "bg-emerald-500/15 text-emerald-300"}`}>{pending ? state.isActive ? "Blocking..." : "Unblocking..." : state.isActive ? "Block" : "Unblock"}</button>
    {state.error && <span role="alert" className="text-xs text-red-300">{state.error}</span>}
    {state.success && <span role="status" className="sr-only">{state.success}</span>}
  </form>;
}
