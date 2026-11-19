"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

type Receipt = { requestNo: string; token: string };
type ReplyStatus = { status: "pending" | "replied"; reply: string | null };
const RECEIPT_KEY = "wx_forgot_password_receipt";

export default function ForgotPasswordClient() {
  const [phone, setPhone] = useState("");
  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [replyStatus, setReplyStatus] = useState<ReplyStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(RECEIPT_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<Receipt>;
          if (typeof parsed.requestNo === "string" && typeof parsed.token === "string") {
            setReceipt({ requestNo: parsed.requestNo, token: parsed.token });
          }
        }
      } catch (loadError) {
        console.error("[forgot-password:receipt]", loadError);
        setError("Saved request load nahi ho saki. Apna request number yaad rakhein.");
      } finally {
        setReady(true);
      }
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  const refreshReply = useCallback(async (current: Receipt) => {
    const response = await fetch(`/api/auth/forgot-password?requestNo=${encodeURIComponent(current.requestNo)}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${current.token}` },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Request status load nahi ho saka.");
    if ((data.status !== "pending" && data.status !== "replied") || (data.reply !== null && typeof data.reply !== "string")) {
      throw new Error("Request status ka response valid nahi.");
    }
    setReplyStatus({ status: data.status, reply: data.reply });
  }, []);

  useEffect(() => {
    if (!receipt) return;
    let active = true;
    const refresh = () => {
      if (!active || document.hidden) return;
      void refreshReply(receipt).catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Request status load nahi ho saka.");
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [receipt, refreshReply]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, accountId, name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Request submit nahi ho saki.");
      if (typeof data.requestNo !== "string" || typeof data.token !== "string") throw new Error("Request receipt valid nahi.");
      const next = { requestNo: data.requestNo, token: data.token };
      setReceipt(next);
      setReplyStatus({ status: "pending", reply: null });
      try {
        localStorage.setItem(RECEIPT_KEY, JSON.stringify(next));
      } catch (saveError) {
        console.error("[forgot-password:save-receipt]", saveError);
        setError("Request bhej di gayi, lekin browser receipt save nahi kar saka. Request number note kar lein.");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Request submit nahi ho saki.");
    } finally {
      setBusy(false);
    }
  };

  const newRequest = () => {
    try {
      localStorage.removeItem(RECEIPT_KEY);
    } catch (clearError) {
      console.error("[forgot-password:clear-receipt]", clearError);
    }
    setReceipt(null);
    setReplyStatus(null);
    setError("");
  };

  return (
    <main className="wx-bg flex min-h-screen items-center justify-center px-4 py-10">
      <section className="wx-card w-full max-w-lg rounded-3xl p-6 sm:p-8">
        <div className="mb-5 flex items-center justify-between">
          <Link href="/login" className="text-sm text-[#b8a7e6] hover:text-white">← Login par wapas</Link>
        </div>
        <h1 className="text-2xl font-black text-white">Forgot password?</h1>
        <p className="mt-2 text-sm text-[#b8a7e6]">Apna registered phone number aur account ID ya naam bhejein. Admin account details check karke is request par jawab dega.</p>
        <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">Aapka current password screen par dikhaya ya message mein bheja nahi jayega. Password bhoolne par admin aapko safe next steps batayega.</p>

        {error && <p role="alert" className="mt-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</p>}

        {!ready ? <p className="mt-5 text-sm text-[#b8a7e6]" role="status">Saved request load ho rahi hai...</p> : receipt ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-[#3a2470] bg-black/25 p-4">
              <p className="text-xs uppercase tracking-wide text-[#b8a7e6]">Aapka request ID</p>
              <p className="mt-1 text-2xl font-black text-[#ffb800]">{receipt.requestNo}</p>
              <p className="mt-2 text-sm text-[#b8a7e6]">Admin ko yahi ID nazar aayegi. Jawab isi device/browser par yahan automatically show hoga.</p>
            </div>
            {replyStatus?.status === "replied" ? (
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4">
                <h2 className="font-bold text-emerald-200">Admin ka jawab</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-white">{replyStatus.reply}</p>
              </div>
            ) : <p className="text-sm text-amber-200" role="status">Request admin ke jawab ka intezar kar rahi hai...</p>}
            <button type="button" onClick={newRequest} className="rounded-xl border border-[#3a2470] px-4 py-2 text-sm font-bold text-[#b8a7e6]">New request</button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#e9ddff]">Phone number</span>
              <input required value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" inputMode="tel" maxLength={24} placeholder="03XXXXXXXXX" className="w-full rounded-xl border border-[#3a2470] bg-black/40 px-4 py-3 text-white outline-none focus:border-[#d946ef]" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#e9ddff]">Account/User ID <span className="text-[#8f7abd]">(agar yaad ho)</span></span>
              <input value={accountId} onChange={(event) => setAccountId(event.target.value)} maxLength={50} placeholder="WX ID ya username" className="w-full rounded-xl border border-[#3a2470] bg-black/40 px-4 py-3 text-white outline-none focus:border-[#d946ef]" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#e9ddff]">Account par diya hua naam <span className="text-[#8f7abd]">(ID yaad na ho to zaroori)</span></span>
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Apna poora naam" className="w-full rounded-xl border border-[#3a2470] bg-black/40 px-4 py-3 text-white outline-none focus:border-[#d946ef]" />
            </label>
            <button disabled={busy || (!accountId.trim() && !name.trim())} className="btn-gold w-full rounded-full py-3 font-black disabled:opacity-60">{busy ? "Request bhej rahe hain..." : "Admin ko request bhejein"}</button>
          </form>
        )}
      </section>
    </main>
  );
}
