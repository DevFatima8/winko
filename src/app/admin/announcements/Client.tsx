"use client";

import { useEffect, useState } from "react";
import { refreshAdminData } from "@/lib/adminLiveUpdates";

const input = "w-full rounded-lg border border-[#3a2470] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#d946ef]";

function AnnouncementEditor() {
  const [items, setItems] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    fetch("/api/announcements", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Announcement load nahi hui.");
      setItems(data.announcements ?? []);
    }).catch((error) => setMessage(error instanceof Error ? error.message : "Announcement load nahi hui."));
  }, []);
  const add = () => {
    const text = draft.replace(/\s+/g, " ").trim();
    if (!text) return;
    setItems((list) => [...list, text]);
    setDraft("");
    setMessage("");
  };
  const save = async () => {
    const list = draft.trim() ? [...items, draft.replace(/\s+/g, " ").trim()] : items;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/announcements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ announcements: list }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Announcement save nahi hui.");
      setItems(list);
      setDraft("");
      refreshAdminData();
      setMessage("Announcement save ho gayi. Open pages par chand seconds mein update hogi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Announcement save nahi hui.");
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="space-y-4">
      <div>
        <span className="mb-1 block text-sm font-semibold text-white">New announcement</span>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} maxLength={500} placeholder="Announcement likhein..." className={input} />
          <button type="button" onClick={add} className="btn-violet shrink-0 rounded-lg px-4 py-2 text-sm font-bold">+ Add announcement</button>
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-sm font-semibold text-white">Live announcements ({items.length})</div>
        {items.length === 0 && <p className="rounded-lg bg-black/30 px-3 py-2 text-xs text-[#b8a7e6]">Koi announcement nahi hai. Default messages dikhenge.</p>}
        {items.map((text, index) => (
          <div key={`${index}-${text}`} className="flex items-start gap-2 rounded-lg bg-black/30 px-3 py-2 ring-1 ring-[#3a2470]">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#ffb800]/20 text-[10px] font-black text-[#ffb800]">{index + 1}</span>
            <span className="min-w-0 flex-1 break-words text-sm text-white">{text}</span>
            <button type="button" onClick={() => setItems((list) => list.filter((_, i) => i !== index))} className="shrink-0 rounded-md bg-red-500/15 px-2 py-1 text-xs font-bold text-red-300">Delete</button>
          </div>
        ))}
      </div>
      <p className="text-xs text-[#b8a7e6]">Add/Delete ke baad &quot;Save announcements&quot; dabayen. Players ko ek ke baad ek announcement slide hoke dikhegi.</p>
      {message && <p className={`rounded-lg px-3 py-2 text-sm ${message.includes("save ho gayi") ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>{message}</p>}
      <button type="button" onClick={save} disabled={pending} className="btn-gold rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-60">{pending ? "Saving..." : "Save announcements"}</button>
    </div>
  );
}

export default function AnnouncementsClient() {
  return (
    <section className="wx-card max-w-3xl rounded-xl p-4 sm:p-6">
      <h1 className="text-xl font-bold text-white">Announcements</h1>
      <p className="mb-5 mt-1 text-sm text-[#b8a7e6]">Yeh text public, player aur admin pages ke scrolling banner par dikhega.</p>
      <AnnouncementEditor />
    </section>
  );
}