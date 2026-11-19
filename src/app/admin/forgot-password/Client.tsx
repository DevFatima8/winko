"use client";

import { useCallback, useEffect, useState } from "react";

type RequestItem = {
  id: string;
  requestNo: string;
  phone: string;
  accountId: string | null;
  name: string | null;
  status: "pending" | "replied";
  adminReply: string | null;
  createdAt: string;
  repliedAt: string | null;
};

export default function ForgotPasswordAdminClient() {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/forgot-password", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Requests load nahi ho sakin.");
      if (!Array.isArray(data.requests)) throw new Error("Requests ka response valid nahi.");
      setRequests(data.requests);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Requests load nahi ho sakin.");
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void load(); }, 0);
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 5000);
    window.addEventListener("focus", load);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  const sendReply = async (item: RequestItem) => {
    const reply = (drafts[item.id] ?? "").trim();
    if (!reply || busy) return;
    setBusy(item.id);
    setError("");
    try {
      const response = await fetch("/api/admin/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, reply }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Reply send nahi ho saka.");
      setDrafts((current) => ({ ...current, [item.id]: "" }));
      await load();
      window.dispatchEvent(new CustomEvent("wx:admin-refresh"));
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Reply send nahi ho saka.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Forgot Password Requests</h1>
        <p className="text-sm text-[#b8a7e6]">User ka request ID, phone aur account ID/naam check karke jawab dein. Current password kabhi reply mein na bhejein.</p>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</p>}
      <div className="space-y-3">
        {requests.map((item) => (
          <section key={item.id} className="wx-card rounded-2xl p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-black text-[#ffb800]">{item.requestNo}</p>
                <p className="mt-1 text-sm text-white">Phone: <b>{item.phone}</b></p>
                <p className="text-sm text-white">Account ID: <b>{item.accountId || "Nahi diya"}</b></p>
                <p className="text-sm text-white">Naam: <b>{item.name || "Nahi diya"}</b></p>
                <p className="mt-1 text-xs text-[#8f7abd]">Received {new Date(item.createdAt).toLocaleString("en-PK")}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${item.status === "pending" ? "bg-amber-400/15 text-amber-200" : "bg-emerald-400/15 text-emerald-200"}`}>{item.status === "pending" ? "Pending reply" : "Replied"}</span>
            </div>
            {item.status === "pending" ? (
              <div className="mt-4 space-y-2">
                <textarea value={drafts[item.id] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))} maxLength={2000} rows={3} placeholder="Verification ya recovery ke safe next steps likhein — password nahi." className="w-full rounded-xl border border-[#3a2470] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#d946ef]" />
                <button type="button" disabled={busy !== null || !(drafts[item.id] ?? "").trim()} onClick={() => void sendReply(item)} className="btn-gold rounded-xl px-4 py-2 text-sm font-black disabled:opacity-60">{busy === item.id ? "Sending..." : "Reply"}</button>
              </div>
            ) : <p className="mt-3 whitespace-pre-wrap rounded-xl bg-black/25 p-3 text-sm text-[#e9ddff]">{item.adminReply}</p>}
          </section>
        ))}
        {requests.length === 0 && <div className="wx-card rounded-2xl p-8 text-center text-sm text-[#8f7abd]">Abhi koi forgot password request nahi hai.</div>}
      </div>
    </div>
  );
}
