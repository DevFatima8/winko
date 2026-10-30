"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type T = { id: string; name: string; phone: string | null; status: string; last: string; at: string; unread: number; assignedTo: string | null; assignedName: string | null; assignedRole: string | null };
type M = { id: string; from: "user" | "agent" | "system"; text: string; agentName: string | null; agentRole?: string | null; at: string };

export function SupportInbox({ initialThread }: { initialThread?: string }) {
  const [threads, setThreads] = useState<T[]>([]);
  const [meInfo, setMeInfo] = useState<{ id: string; level: number }>({ id: "", level: 1 });
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(initialThread ?? null);
  const [msgs, setMsgs] = useState<M[]>([]);
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<"open" | "closed" | "all">("open");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const endRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/support", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Inbox load nahi ho saka.");
      setThreads(j.threads); if (j.me) setMeInfo(j.me); setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Inbox load nahi ho saka.");
    }
  }, []);
  const loadMsgs = useCallback(async () => {
    if (!active) return;
    try {
      const r = await fetch(`/api/admin/support?thread=${encodeURIComponent(active)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Messages load nahi huay.");
      setMsgs(j.messages); setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Messages load nahi huay.");
      setMsgs([]);
    }
  }, [active]);

  useEffect(() => { loadThreads(); const id = setInterval(loadThreads, 4000); return () => clearInterval(id); }, [loadThreads]);
  useEffect(() => { loadMsgs(); const id = setInterval(loadMsgs, 3000); return () => clearInterval(id); }, [loadMsgs]);
  useEffect(() => {
    const refresh = () => { void loadThreads(); void loadMsgs(); };
    window.addEventListener("wx:support-update", refresh);
    return () => window.removeEventListener("wx:support-update", refresh);
  }, [loadMsgs, loadThreads]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  const send = async () => {
    const t = text.trim(); if (!t || !active) return;
    setText("");
    const r = await fetch("/api/admin/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId: active, text: t }) });
    const result = await r.json();
    if (!r.ok) { setErr(result.error ?? "Reply nahi bheja ja saka."); setText(t); return; }
    await loadMsgs(); await loadThreads();
  };
  const release = async () => {
    if (!active) return;
    const r = await fetch("/api/admin/support", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId: active, action: "release" }) });
    const result = await r.json();
    if (!r.ok) { setErr(result.error ?? "Chat release nahi hui."); return; }
    await loadThreads();
  };
  const toggleStatus = async () => {
    if (!cur) return;
    const nextStatus = cur.status === "open" ? "closed" : "open";
    const r = await fetch("/api/admin/support", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId: cur.id, status: nextStatus }) });
    const result = await r.json();
    if (!r.ok) { setErr(result.error ?? "Chat status update nahi hua."); return; }
    await loadThreads();
  };
  const cur = threads.find((t) => t.id === active);
  const shown = threads.filter((t) => filter === "all" || t.status === filter).sort((a, b) => sortOrder === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr] 2xl:grid-cols-[380px_1fr]">
      <div className={`wx-card flex max-h-[70vh] flex-col rounded-2xl ${active ? "hidden lg:flex" : "flex"}`}>
        <div className="flex flex-wrap items-center gap-1 border-b border-[#3a2470] p-2">
          <div className="flex min-w-0 flex-1 gap-1">
            {(["open", "closed", "all"] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={`flex-1 rounded-lg py-1.5 text-xs font-bold capitalize ${filter === f ? "btn-violet" : "text-[#b8a7e6]"}`}>{f}</button>)}
          </div>
          <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as "asc" | "desc")} aria-label="Client name sort order" className="max-w-32 rounded-lg border border-[#3a2470] bg-black/30 px-2 py-1.5 text-[10px] text-white">
            <option value="asc">Ascending (A-Z)</option><option value="desc">Descending (Z-A)</option>
          </select>
        </div>
        {err && !active && <p className="mx-2 mt-2 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-300">{err}</p>}
        <div className="flex-1 overflow-y-auto">
          {shown.map((t) => (
            <button key={t.id} onClick={() => setActive(t.id)} className={`flex w-full items-start gap-2 border-b border-[#3a2470]/50 px-3 py-2.5 text-left hover:bg-[#8b5cf6]/10 ${active === t.id ? "bg-[#8b5cf6]/15" : ""}`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#d946ef] text-sm font-black text-white">{t.name.slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between"><span className="truncate text-sm font-bold text-white">{t.name}</span>{t.unread > 0 && <span className="rounded-full bg-[#ff3b5c] px-1.5 text-[10px] font-black text-white">{t.unread}</span>}</span>
                <span className="block truncate text-xs text-[#b8a7e6]">{t.last || "—"}</span>
                <span className="block text-[10px] text-[#6f5fa3]">{t.phone ?? "guest"} · {new Date(t.at).toLocaleString("en-PK", { dateStyle: "short", timeStyle: "short" })}</span>
                {t.assignedTo ? <span className={`mt-0.5 inline-block rounded px-1.5 text-[9px] font-bold ${t.assignedTo === meInfo.id ? "bg-emerald-500/20 text-emerald-300" : "bg-[#8b5cf6]/20 text-[#c4b5fd]"}`}>{t.assignedTo === meInfo.id ? "Mine" : `Handled by ${t.assignedName ?? "admin"}${t.assignedRole === "subadmin" ? " (Sub-admin)" : ""}`}</span> : <span className="mt-0.5 inline-block rounded bg-[#ffb800]/20 px-1.5 text-[9px] font-bold text-[#ffb800]">Unassigned</span>}
              </span>
            </button>
          ))}
          {shown.length === 0 && <p className="p-6 text-center text-sm text-[#6f5fa3]">Koi {filter} chat nahi.</p>}
        </div>
      </div>

      <div className={`wx-card h-[70vh] flex-col rounded-2xl ${active ? "flex" : "hidden lg:flex"}`}>
        {!cur ? <div className="flex flex-1 items-center justify-center text-sm text-[#6f5fa3]">Left se chat select karein</div> : (
          <>
            <div className="flex items-center justify-between border-b border-[#3a2470] px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2"><button onClick={() => setActive(null)} className="rounded-lg bg-black/30 px-2 py-1 text-xs text-[#b8a7e6] lg:hidden">←</button><div className="min-w-0"><div className="truncate font-bold text-white">{cur.name}</div><div className="text-xs text-[#b8a7e6]">{cur.phone ?? "guest visitor"} · {cur.status}{cur.assignedName ? ` · handled by ${cur.assignedTo === meInfo.id ? "you" : `${cur.assignedName}${cur.assignedRole === "subadmin" ? " (Sub-admin)" : ""}`}` : " · unassigned"}</div></div></div>
              <div className="flex gap-2">
                {meInfo.level >= 2 && cur.assignedTo && <button onClick={release} className="rounded-lg bg-[#ffb800]/15 px-3 py-1.5 text-xs font-bold text-[#ffb800]">Release</button>}
                <button type="button" onClick={toggleStatus} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${cur.status === "open" ? "bg-red-500/15 text-red-300" : "bg-emerald-500/15 text-emerald-300"}`}>{cur.status === "open" ? "Close chat" : "Reopen"}</button>
              </div>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {err && <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{err}</p>}
              {msgs.map((m) => (
                <div key={m.id} className={`flex ${m.from === "agent" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.from === "agent" ? "btn-violet rounded-br-sm" : m.from === "system" ? "bg-[#ffb800]/15 text-[#ffe0a3] ring-1 ring-[#ffb800]/30" : "bg-black/40 text-white rounded-bl-sm ring-1 ring-[#3a2470]"}`}>
                    {m.from === "system" && <div className="mb-0.5 text-[10px] font-bold uppercase opacity-70">Auto reply</div>}
                    {m.from === "agent" && m.agentName && <div className="mb-0.5 text-[10px] font-bold opacity-80">{m.agentName}{m.agentRole === "subadmin" ? " · Sub-admin" : ""}</div>}
                    <div className="whitespace-pre-wrap">{m.text}</div>
                    <div className="mt-0.5 text-right text-[10px] opacity-60">{new Date(m.at).toLocaleTimeString("en-PK", { timeStyle: "short" })}</div>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <div className="flex gap-2 border-t border-[#3a2470] p-3">
              <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Reply likhein..." className="flex-1 rounded-xl border border-[#3a2470] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#d946ef]" />
              <button onClick={send} className="btn-gold rounded-xl px-5 py-2 text-sm font-black">Send</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
