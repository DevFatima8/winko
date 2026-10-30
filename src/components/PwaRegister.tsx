"use client";
import { useEffect } from "react";
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())));
      if ("caches" in window) void caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("winkox-v")).map((key) => caches.delete(key))));
      return;
    }
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch((error) => {
      console.error("[service worker registration]", error);
    });
  }, []);
  return null;
}
