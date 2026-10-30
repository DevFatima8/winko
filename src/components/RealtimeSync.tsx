"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { playGameSound, unlockGameAudio } from "@/lib/gameAudio";

export type LiveNotification = { id: string; title: string; body: string; type: string; audience?: string; href?: string | null; at: string; read: boolean };
type RealtimeValue = { notification: LiveNotification | null; announcement: string };

const RealtimeContext = createContext<RealtimeValue>({ notification: null, announcement: "" });
export const useRealtime = () => useContext(RealtimeContext);

export function RealtimeSync({ children }: { children: ReactNode }) {
  const [sessionReady, setSessionReady] = useState(false);
  const [notification, setNotification] = useState<LiveNotification | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const syncSession = () => {
      setSessionReady(true);
    };
    const unlockAudio = () => {
      unlockGameAudio();
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
    syncSession();
    window.addEventListener("wx:session", syncSession);
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("wx:session", syncSession);
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    const stream = new EventSource("/api/events");
    let firstAnnouncement = true;
    stream.addEventListener("notification", (event) => {
      const item = JSON.parse((event as MessageEvent).data) as LiveNotification;
      setNotification(item);
      playGameSound("notification");
      if (item.audience === "user" && item.href?.startsWith("/player/wallet")) {
        window.dispatchEvent(new CustomEvent("wx:balance-update"));
        window.dispatchEvent(new CustomEvent("wx:data-refresh"));
      }
      if (item.title === "New support message") window.dispatchEvent(new CustomEvent("wx:support-update"));
    });
    stream.addEventListener("refresh", () => { window.dispatchEvent(new CustomEvent("wx:data-refresh")); });
    stream.addEventListener("announcement", (event) => {
      if (firstAnnouncement) firstAnnouncement = false;
      else playGameSound("notification");
      try { setAnnouncement(JSON.parse((event as MessageEvent).data) as string); }
      catch { setAnnouncement((event as MessageEvent).data); }
    });
    return () => stream.close();
  }, [sessionReady]);

  return <RealtimeContext.Provider value={{ notification, announcement }}>{children}</RealtimeContext.Provider>;
}
