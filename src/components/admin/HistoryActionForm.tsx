"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/actions";
import { refreshAdminData } from "@/lib/adminLiveUpdates";

export function HistoryActionForm({ action: serverAction, confirmation, children, label, destination }: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  confirmation: string;
  children: ReactNode;
  label: string;
  destination?: string;
}) {
  const router = useRouter();
  const [validationError, setValidationError] = useState("");
  const [state, action, pending] = useActionState<ActionState, FormData>(async (previous, form) => {
    try {
      const result = await serverAction(previous, form);
      if (result?.success) {
        if (destination) router.replace(destination);
        else refreshAdminData();
      }
      return result;
    } catch (error) {
      console.error("[History action]", error);
      return { error: "Request complete nahi ho saki. Agent login aur internet connection check karke dobara try karein." };
    }
  }, undefined);
  return <form action={action} noValidate aria-busy={pending} className="space-y-3" onSubmit={(event) => {
    const form = event.currentTarget;
    setValidationError("");
    if (!form.checkValidity()) {
      event.preventDefault();
      setValidationError("Required fields complete karein: category (agar ho), current Agent password aur confirmation text.");
      form.querySelector<HTMLElement>(":invalid")?.focus();
      return;
    }
    if (String(new FormData(form).get("confirmation") ?? "").trim() !== confirmation) {
      event.preventDefault();
      setValidationError(`Confirmation mein bilkul ye likhein: ${confirmation}`);
      form.querySelector<HTMLInputElement>('[name="confirmation"]')?.focus();
    }
  }}>
    {children}
    <p className="text-xs text-red-200">Confirmation text likh kar submit karne se selected data permanently delete hoga. Ye undo nahi ho sakta.</p>
    {(validationError || state?.error) && <p role="alert" className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{validationError || state?.error}</p>}
    {!validationError && state?.success && <p role="status" className="rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-300">{state.success}</p>}
    <button type="submit" disabled={pending} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{pending ? "Deleting..." : label}</button>
  </form>;
}
