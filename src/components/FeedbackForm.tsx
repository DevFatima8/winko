"use client";

import { localApi } from "@/lib/client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";

const input = "w-full rounded-xl border border-[#3a2470] bg-black/30 px-3 py-2.5 text-white outline-none focus:border-[#d946ef]";

export function FeedbackForm({ loggedIn, name, phone }: { loggedIn: boolean; name?: string; phone?: string }) {
  const { isUr } = useI18n();
  const [state, setState] = useState<{ ok?: boolean; error?: string }>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"create" | "history">("create");
  const [history, setHistory] = useState<{ id: string; type: string; message: string; status: string; createdAt: string }[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const showHistory = async () => {
    setTab("history"); setLoadingHistory(true); setHistoryError("");
    try {
      const response = await fetch("/api/player/feedback", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Feedback load failed.");
      setHistory(data.list);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Feedback load failed.");
    } finally { setLoadingHistory(false); }
  };
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;
    setBusy(true);
    setState({});
    try {
      const r = await localApi("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(fd)) });
      const j = await r.json();
      if (!r.ok || j.error || j.ok !== true) throw new Error(j.error ?? "Feedback submit nahi hua. Dobara try karein.");
      setState({ ok: true }); form.reset(); setMessage("");
    } catch (error) {
      setState({ error: error instanceof Error ? error.message : "Feedback submit nahi hua. Dobara try karein." });
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <div className="flex gap-2" role="group" aria-label="Feedback views">
        <button type="button" aria-pressed={tab === "create"} onClick={() => setTab("create")} className={`rounded-full px-4 py-2 text-sm ${tab === "create" ? "btn-gold" : "border border-white/15 text-slate-300"}`}>{isUr ? "فیڈبیک لکھیں" : "Create Feedback"}</button>
        {loggedIn && <button type="button" aria-pressed={tab === "history"} onClick={() => void showHistory()} className={`rounded-full px-4 py-2 text-sm ${tab === "history" ? "btn-gold" : "border border-white/15 text-slate-300"}`}>{isUr ? "میرا فیڈبیک" : "My Feedback"}</button>}
      </div>
      {tab === "history" ? <div className="space-y-3">
        {loadingHistory ? <p role="status" className="animate-pulse rounded-xl bg-white/5 p-5 text-sm">Loading feedback...</p> : historyError ? <div role="alert"><p className="text-sm text-red-300">{historyError}</p><button type="button" onClick={() => void showHistory()} className="mt-2 text-sm text-amber-300">Try again</button></div> : history.length ? history.map((entry) => <article key={entry.id} className="rounded-xl border border-white/10 p-3">
          <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-400"><span className="capitalize">{entry.type === "other" ? "Feedback" : entry.type} · {entry.status}</span><time>{new Date(entry.createdAt).toLocaleString()}</time></div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-white">{entry.message}</p>
        </article>) : <p className="py-6 text-center text-sm text-slate-400">{isUr ? "ابھی کوئی فیڈبیک نہیں۔" : "No feedback submitted yet."}</p>}
      </div> : <form onSubmit={submit} className="space-y-3">
      {!loggedIn && (
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="name" required placeholder={isUr ? "آپ کا نام" : "Your name"} className={input} />
          <input name="phone" required placeholder="03XXXXXXXXX" className={input} />
        </div>
      )}
      {loggedIn && <p className="text-xs text-[#b8a7e6]">{isUr ? "بھیجنے والا:" : "Sending as:"} <b className="text-white">{name}</b> · {phone}</p>}
      <label className="block space-y-2 text-sm"><span>{isUr ? "فیڈبیک کی قسم" : "Feedback Type"} <span className="text-red-400">*</span></span><select name="type" required defaultValue="" disabled={busy} className={input}>
        <option value="" disabled>{isUr ? "فیڈبیک کی قسم منتخب کریں" : "Please select feedback type"}</option>
        <option value="reward">{isUr ? "انعام / بونس کلیم" : "Reward / bonus claim"}</option>
        <option value="complaint">{isUr ? "شکایت" : "Complaint"}</option>
        <option value="suggestion">{isUr ? "تجویز" : "Suggestion"}</option>
        <option value="other">{isUr ? "عام فیڈبیک / دیگر" : "General feedback / Other"}</option>
      </select></label>
      <label className="block space-y-2 text-sm"><span>{isUr ? "فیڈبیک کی تفصیل" : "Feedback Content (Suggestions for revision)"} <span className="text-red-400">*</span></span><textarea name="message" required maxLength={3000} disabled={busy} value={message} onChange={(e) => setMessage(e.target.value)} rows={5} placeholder={isUr ? "اپنی رائے، تجویز یا مسئلے کی تفصیل لکھیں۔" : "Share your feedback, suggestions, reward claim or details of any issue."} className={input} /></label>
      <p className="text-right text-xs text-slate-400">{message.length}/3000</p>
      {state.error && <p role="alert" className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-300">{isUr ? "شکریہ! آپ کا فیڈبیک ایڈمن ٹیم کو بھیج دیا گیا ہے۔" : "Thank you! Your feedback has been sent to the admin team."}</p>}
      <button disabled={busy} className="btn-gold w-full rounded-xl px-6 py-2.5 text-sm font-black disabled:opacity-60">{busy ? isUr ? "بھیجا جا رہا ہے..." : "Submitting..." : isUr ? "فیڈبیک بھیجیں" : "Submit feedback"}</button>
    </form>}
    </div>
  );
}
