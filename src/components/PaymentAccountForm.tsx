"use client";

import { useState } from "react";
import { addPaymentAccountAction, type ActionState } from "@/lib/actions";
import { compressImage } from "@/lib/imageFile";
import { useAdminActionState } from "@/lib/adminLiveUpdates";

const field = "w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white placeholder:text-slate-600 focus:border-yellow-400";

export function PaymentAccountForm() {
  const [qr, setQr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [qrError, setQrError] = useState("");
  const [state, action, pending] = useAdminActionState<ActionState, FormData>(async (prev, form) => {
    const result = await addPaymentAccountAction(prev, form);
    if (result?.success) setQr(null);
    return result;
  }, undefined);

  const onFile = async (file?: File) => {
    setQrError("");
    if (!file) return setQr(null);
    setUploading(true);
    try {
      const dataUrl = await compressImage(file, 640, 0.9);
      const res = await fetch("/api/admin/upload-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error || "QR upload nahi ho saka.");
      setQr(json.url);
    } catch (e) {
      setQr(null);
      setQrError(e instanceof Error ? e.message : "Image load nahi ho saki.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <select name="provider" required className={field}>
        <option value="jazzcash">JazzCash</option>
        <option value="easypaisa">Easypaisa</option>
        <option value="raast">Raast</option>
      </select>
      <input name="accountTitle" required placeholder="Account Title (e.g. Ahmed Ali)" className={field} />
      <input name="accountNumber" required placeholder="Till ID" className={field} />
      <label className="flex min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-300 hover:border-yellow-400">
        <span className="shrink-0 rounded-lg bg-slate-800 px-2 py-1 text-xs font-bold text-yellow-300">Upload QR</span>
        <span className="truncate text-xs text-slate-500">{uploading ? "Uploading..." : qr ? "QR uploaded ✓" : "PNG / JPG"}</span>
        <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      <input type="hidden" name="qrImage" value={qr ?? ""} />
      {qr && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt="QR preview" className="h-28 w-28 rounded-xl border border-slate-700 bg-white object-contain p-1 sm:col-span-2" />
      )}
      <button disabled={pending || uploading} className="rounded-xl bg-yellow-400 px-4 py-2.5 font-bold text-slate-950 hover:bg-yellow-300 disabled:opacity-60 sm:col-span-2">
        {pending ? "Saving..." : uploading ? "QR upload ho rahi hai..." : "+ Add Account"}
      </button>
      {qrError && <p className="text-sm text-red-400 sm:col-span-2">{qrError}</p>}
      {state?.error && <p className="text-sm text-red-400 sm:col-span-2">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-400 sm:col-span-2">{state.success}</p>}
    </form>
  );
}
