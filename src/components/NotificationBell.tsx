"use client";

import { useCallback, useEffect, useState } from "react";
import { useRef } from "react";
import { useI18n } from "@/lib/i18n/client";
import { BellIcon, XIcon, GiftIcon, MegaphoneIcon, CheckIcon, ShieldIcon } from "@/components/Icons";
import { useRealtime } from "@/components/RealtimeSync";
import { visibleInterval } from "@/lib/visibleInterval";

type N = { id: string; title: string; body: string; type: string; href?: string | null; at: string; read: boolean };

export function NotificationBell({ loggedIn }: { loggedIn: boolean }) {
  const [items, setItems] = useState<N[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [readError, setReadError] = useState("");
  const seenLiveIdsRef = useRef(new Set<string>());
  const knownIdsRef = useRef<Set<string> | null>(null);
  const serverRetryAtRef = useRef(0);
  const { notification: liveNotification } = useRealtime();
  const { t } = useI18n();
  const load = useCallback(async () => {
    const serverRequest = Date.now() >= serverRetryAtRef.current
      ? fetch("/api/notifications", { cache: "no-store" }).catch(() => null)
      : Promise.resolve(null);
    const serverResponse = await serverRequest;
    if (serverResponse?.status === 503) serverRetryAtRef.current = Date.now() + 30000;
    const serverData = serverResponse?.ok ? await serverResponse.json() : { items: [] };
    const merged = (serverData.items ?? []) as N[];
    const byId = new Map(merged.map((item) => [item.id, item]));
    const nextItems = [...byId.values()].filter((item) => !item.read)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 30);
    knownIdsRef.current = new Set(nextItems.map((item) => item.id));
    setItems(nextItems);
    setUnread(nextItems.filter((item) => !item.read).length);
  }, []);
  useEffect(() => {
    void load();
    const stop = visibleInterval(load, 90000);
    const handleLocalNotification = () => { void load(); };
    window.addEventListener("wx:notification-local", handleLocalNotification);
    return () => { stop(); window.removeEventListener("wx:notification-local", handleLocalNotification); };
  }, [load]);
  useEffect(() => {
    if (!loggedIn || !liveNotification || seenLiveIdsRef.current.has(liveNotification.id) || knownIdsRef.current?.has(liveNotification.id)) return;
    seenLiveIdsRef.current.add(liveNotification.id);
    if (seenLiveIdsRef.current.size > 100) seenLiveIdsRef.current.delete(seenLiveIdsRef.current.values().next().value!);
    knownIdsRef.current?.add(liveNotification.id);
    const item: N = { ...liveNotification, at: String(liveNotification.at), read: false };
    setItems((current) => [item, ...current.filter((existing) => existing.id !== item.id)].slice(0, 30));
    setUnread((current) => current + 1);
  }, [liveNotification, loggedIn]);
  const openPanel = () => {
    setOpen((value) => !value);
    setReadError("");
  };
  const openNotification = async (item: N) => {
    try {
      if (!item.read && loggedIn) {
        const response = await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id }),
        });
        const data = await response.json();
        if (!response.ok || data.ok !== true) throw new Error(data.error ?? "Notification ko read mark nahi kiya ja saka.");
      }
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      if (!item.read) setUnread((current) => Math.max(0, current - 1));
      setOpen(false);
      if (item.href) window.location.assign(item.href);
    } catch (error) {
      setReadError(error instanceof Error ? error.message : "Notification ko read mark nahi kiya ja saka.");
    }
  };
  const icon = (t: string) => (t === "promo" ? <GiftIcon size={20} /> : t === "warning" ? <ShieldIcon size={20} /> : t === "success" ? <CheckIcon size={20} /> : <MegaphoneIcon size={20} />);
  return (
    <>
      <button onClick={openPanel} className="relative flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-[#c4b5fd] ring-1 ring-[#3a2470] hover:text-white" aria-label="Notifications">
        <BellIcon size={16} />{unread > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ff3b5c] px-1 text-[9px] font-black text-white">{unread}</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)}>
          <div className="absolute right-2 top-14 w-[calc(100vw-1rem)] max-w-sm overflow-hidden rounded-2xl border border-[#3a2470] bg-[#140c2a] shadow-2xl md:right-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#3a2470] px-4 py-2.5"><span className="font-black text-white">{t("notifTitle")}</span><button onClick={() => setOpen(false)} className="text-[#b8a7e6]"><XIcon size={18} /></button></div>
            {readError && <p role="alert" className="px-4 py-2 text-xs text-red-300">{readError}</p>}
            <div className="max-h-[60vh] overflow-y-auto">
              {items.map((n) => (
                <button type="button" key={n.id} onClick={() => void openNotification(n)} className={`flex w-full gap-3 border-b border-[#3a2470]/50 px-4 py-3 text-left ${n.href ? "cursor-pointer hover:bg-[#8b5cf6]/15" : ""} ${!n.read ? "bg-[#8b5cf6]/10" : ""}`}>
                  <span className="mt-0.5 text-[#c4b5fd]">{icon(n.type)}</span>
                  <div className="min-w-0"><div className="text-sm font-bold text-white">{n.title}</div><div className="text-xs text-[#e9ddff]">{n.body}</div><div className="mt-0.5 text-[10px] text-[#6f5fa3]">{new Date(n.at).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}</div></div>
                </button>
              ))}
              {items.length === 0 && <p className="p-6 text-center text-sm text-[#6f5fa3]">{t("noNotif")}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
