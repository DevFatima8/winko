"use client";

import { useState } from "react";
import { refreshAdminData } from "@/lib/adminLiveUpdates";

export function AccountLogoutButton({ userId, name, onLogout }: { userId: string; name: string; onLogout?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});
  const logout = async () => {
    if (busy || !window.confirm(`Log ${name} out of all current devices? They can log in again.`)) return;
    setBusy(true);
    setMessage({});
    try {
      const response = await fetch("/api/admin/devices", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }),
      });
      const result: { error?: string; success?: string } = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error ?? "Logout failed. Please retry.");
      setMessage({ success: result.success });
      refreshAdminData();
      onLogout?.();
    } catch (error) {
      setMessage({ error: error instanceof Error ? error.message : "Logout failed. Please retry." });
    } finally {
      setBusy(false);
    }
  };
  return <div>
    <button type="button" disabled={busy} onClick={() => void logout()} className="rounded-lg border border-red-400/40 px-2.5 py-1 text-xs text-red-200 disabled:opacity-50">{busy ? "Logging out..." : "Logout all devices"}</button>
    {message.error && <p role="alert" className="mt-1 whitespace-normal text-xs text-red-300">{message.error}</p>}
    {message.success && <p role="status" className="mt-1 whitespace-normal text-xs text-emerald-300">{message.success}</p>}
  </div>;
}
