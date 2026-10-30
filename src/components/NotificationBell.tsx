"use client";

import { localApi } from "@/lib/client";
import { useCallback, useEffect, useState } from "react";
import { useRef } from "react";
import { useI18n } from "@/lib/i18n/client";
import { BellIcon, XIcon, GiftIcon, MegaphoneIcon, CheckIcon, ShieldIcon } from "@/components/Icons";
import { playGameSound } from "@/lib/gameAudio";
import { useRealtime } from "@/components/RealtimeSync";
import { visibleInterval } from "@/lib/visibleInterval";

type N = { id: string; title: string; body: string; type: string; href?: string | null; at: string; read: boolean };

export function NotificationBell({ loggedIn }: { loggedIn: boolean }) {
  const [items, setItems] = useState<N[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<N | null>(null);
  const seenLiveIdRef = useRef<string | null>(null);
  const knownIdsRef = useRef<Set<string> | null>(null);
  const serverRetryAtRef = useRef(0);
  const { notification: liveNotification } = useRealtime();
  const { t } = useI18n();
  const load = useCallback(async () => {
    const serverRequest = loggedIn && Date.now() >= serverRetryAtRef.current
      ? fetch("/api/notifications", { cache: "no-store" }).catch(() => null)
      : Promise.resolve(null);
    const [serverResponse, localResponse] = await Promise.all([
      serverRequest,
      localApi("/api/notifications", { cache: "no-store" }).catch(() => null),
    ]);
    if (serverResponse?.status === 503) serverRetryAtRef.current = Date.now() + 30000;
    const serverData = serverResponse?.ok ? await serverResponse.json() : { items: [] };
    const localData = localResponse?.ok ? await localResponse.json() : { items: [] };
    const merged = [...(serverData.items ?? []), ...(localData.items ?? [])] as N[];
    const byId = new Map(merged.map((item) => [item.id, item]));
    const nextItems = [...byId.values()].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 30);
    if (knownIdsRef.current) {
      const fresh = nextItems.filter((item) => !item.read && !knownIdsRef.current?.has(item.id));
      for (const item of fresh) {
        if (item.id === seenLiveIdRef.current) continue;
        seenLiveIdRef.current = item.id;
        window.dispatchEvent(new CustomEvent("wx:session"));
        window.dispatchEvent(new CustomEvent("wx:data-refresh"));
        playGameSound("notification");
        setToast(item);
        window.setTimeout(() => setToast((current) => current?.id === item.id ? null : current), 7000);
      }
    }
    knownIdsRef.current = new Set(nextItems.map((item) => item.id));
    setItems(nextItems);
    setUnread(nextItems.filter((item) => !item.read).length);
    // popup latest unread once
    const latestUnread = nextItems.find((n) => !n.read);
    if (latestUnread && loggedIn) {
      const key = "wx_seen_" + latestUnread.id;
      if (!sessionStorage.getItem(key)) { sessionStorage.setItem(key, "1"); setToast(latestUnread); setTimeout(() => setToast(null), 7000); }
    }
  }, [loggedIn]);
  useEffect(() => {
    void load();
    const stop = visibleInterval(load, 90000);
    const handleLocalNotification = () => { void load(); };
    window.addEventListener("wx:notification-local", handleLocalNotification);
    return () => { stop(); window.removeEventListener("wx:notification-local", handleLocalNotification); };
  }, [load, loggedIn]);
  useEffect(() => {
    if (!loggedIn || !liveNotification || seenLiveIdRef.current === liveNotification.id) return;
    seenLiveIdRef.current = liveNotification.id;
    knownIdsRef.current?.add(liveNotification.id);
    const item: N = { ...liveNotification, at: String(liveNotification.at), read: false };
    setItems((current) => [item, ...current.filter((existing) => existing.id !== item.id)].slice(0, 30));
    setUnread((current) => current + 1);
    window.dispatchEvent(new CustomEvent("wx:session"));
    window.dispatchEvent(new CustomEvent("wx:data-refresh"));
    setToast(item);
    window.setTimeout(() => setToast((current) => current?.id === item.id ? null : current), 7000);
  }, [liveNotification, loggedIn]);
  const openPanel = async () => {
    setOpen((o) => !o);
    if (!open && unread > 0 && loggedIn) {
      await Promise.all([
        fetch("/api/notifications", { method: "POST" }).catch(() => null),
        localApi("/api/notifications", { method: "POST" }).catch(() => null),
      ]);
      setUnread(0); setItems((xs) => xs.map((x) => ({ ...x, read: true })));
    }
  };
  const icon = (t: string) => (t === "promo" ? <GiftIcon size={20} /> : t === "warning" ? <ShieldIcon size={20} /> : t === "success" ? <CheckIcon size={20} /> : <MegaphoneIcon size={20} />);
  const openNotification = (item: N) => { if (item.href) window.location.assign(item.href); };
  return (
    <>
      <button onClick={openPanel} className="relative flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-[#c4b5fd] ring-1 ring-[#3a2470] hover:text-white" aria-label="Notifications">
        <BellIcon size={16} />{unread > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ff3b5c] px-1 text-[9px] font-black text-white">{unread}</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)}>
          <div className="absolute right-2 top-14 w-[calc(100vw-1rem)] max-w-sm overflow-hidden rounded-2xl border border-[#3a2470] bg-[#140c2a] shadow-2xl md:right-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#3a2470] px-4 py-2.5"><span className="font-black text-white">{t("notifTitle")}</span><button onClick={() => setOpen(false)} className="text-[#b8a7e6]"><XIcon size={18} /></button></div>
            <div className="max-h-[60vh] overflow-y-auto">
              {items.map((n) => (
                <button type="button" key={n.id} onClick={() => openNotification(n)} className={`flex w-full gap-3 border-b border-[#3a2470]/50 px-4 py-3 text-left ${n.href ? "cursor-pointer hover:bg-[#8b5cf6]/15" : ""} ${!n.read ? "bg-[#8b5cf6]/10" : ""}`}>
                  <span className="mt-0.5 text-[#c4b5fd]">{icon(n.type)}</span>
                  <div className="min-w-0"><div className="text-sm font-bold text-white">{n.title}</div><div className="text-xs text-[#e9ddff]">{n.body}</div><div className="mt-0.5 text-[10px] text-[#6f5fa3]">{new Date(n.at).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}</div></div>
                </button>
              ))}
              {items.length === 0 && <p className="p-6 text-center text-sm text-[#6f5fa3]">{t("noNotif")}</p>}
            </div>
          </div>
        </div>
      )}
      {toast && (
        <button type="button" className="fixed inset-x-3 top-16 z-[70] mx-auto max-w-sm animate-[pop_.3s_ease-out] rounded-2xl border border-[#ffb800]/50 bg-[#1b1038] p-3 text-left shadow-2xl md:right-6 md:left-auto" onClick={() => { if (toast.href) window.location.assign(toast.href); else setToast(null); }}>
          <div className="flex gap-3"><span className="text-[#ffb800]">{icon(toast.type)}</span><div><div className="text-sm font-black text-white">{toast.title}</div><div className="text-xs text-[#e9ddff]">{toast.body}</div></div></div>
          <style>{`@keyframes pop{0%{transform:translateY(-10px);opacity:0}100%{transform:translateY(0);opacity:1}}`}</style>
        </button>
      )}
    </>
  );
}
