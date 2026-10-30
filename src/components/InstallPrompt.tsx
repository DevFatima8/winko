"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { DownloadIcon, XIcon } from "./Icons";
import Image from "next/image";
import { isAppInstalled, rememberAppInstalled, resetAppInstalled, useAppInstalled, type AppInstallEvent } from "@/lib/appInstall";

const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

export function InstallPrompt() {
  const pathname = usePathname();
  const hidden = /^\/(?:(?:player\/)?games\/|admin(?:\/|$))/.test(pathname ?? "");
  const prompting = useRef(false);
  const installed = useAppInstalled();
  const [popup, setPopup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [device, setDevice] = useState<"ios" | "android" | "safari" | "desktop">("desktop");
  const [manual, setManual] = useState(false);
  const [ready, setReady] = useState(false);
  const [shortcutHidden, setShortcutHidden] = useState(false);
  const create = useCallback(async () => {
    if (prompting.current || isAppInstalled()) return;
    setPopup(true);
    setError("");
    const event = window.__wxInstallPrompt;
    if (!event) {
      setManual(true);
      if (!window.isSecureContext) setError("App install karne ke liye website HTTPS par Chrome mein kholein.");
      return;
    }
    delete window.__wxInstallPrompt;
    prompting.current = true;
    setReady(false);
    setManual(false);
    setBusy(true);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "accepted") setPopup(false);
      else setManual(true);
    } catch (error) {
      console.error("[app install]", error);
      setError("Install prompt nahi khul saka. Neeche diye browser steps use karein.");
      setManual(true);
    } finally { prompting.current = false; setBusy(false); }
  }, []);

  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const initial = window.setTimeout(() => {
      if (standalone()) rememberAppInstalled();
      else if (window.__wxInstallPrompt) {
        resetAppInstalled();
        setReady(true);
      }
      setDevice(ios ? "ios" : /Android/i.test(ua) ? "android" : /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua) ? "safari" : "desktop");
    }, 0);
    const prompt = (event: Event) => {
      event.preventDefault();
      window.__wxInstallPrompt = event as AppInstallEvent;
      resetAppInstalled();
      setReady(true);
      setManual(false);
      setError("");
    };
    const open = () => { if (!isAppInstalled()) { setPopup(true); setError(""); setManual(!window.__wxInstallPrompt); } };
    const install = () => { if (!isAppInstalled()) void create(); };
    const done = () => { rememberAppInstalled(); setPopup(false); delete window.__wxInstallPrompt; setReady(false); };
    const mode = window.matchMedia("(display-mode: standalone)");
    const modeChanged = () => { if (standalone()) done(); };
    window.addEventListener("beforeinstallprompt", prompt);
    window.addEventListener("wx:open-install", open);
    window.addEventListener("wx:install-now", install);
    window.addEventListener("appinstalled", done);
    mode.addEventListener("change", modeChanged);
    return () => {
      clearTimeout(initial);
      window.removeEventListener("beforeinstallprompt", prompt);
      window.removeEventListener("wx:open-install", open);
      window.removeEventListener("wx:install-now", install);
      window.removeEventListener("appinstalled", done);
      mode.removeEventListener("change", modeChanged);
    };
  }, [create]);

  if (installed || hidden) return null;
  return <>
    {!shortcutHidden && <div className="fixed bottom-[10.5rem] left-3 z-[39] md:bottom-20 md:left-auto md:right-6">
      <button type="button" aria-label="Install winkox app" disabled={busy} onClick={() => void create()} className="keep-white flex items-center justify-center rounded-full bg-gradient-to-r from-[#8b5cf6] to-[#d946ef] p-3 text-white shadow-lg"><DownloadIcon size={16} /></button>
      <button type="button" aria-label="Hide download shortcut" onClick={() => setShortcutHidden(true)} className="keep-white absolute -left-1 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-white/60 bg-slate-950 text-white shadow"><XIcon size={12} /></button>
    </div>}
    {popup && <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/70 p-4" onClick={() => !busy && setPopup(false)}>
      <section role="dialog" aria-modal="true" aria-labelledby="install-title" className="max-h-[85dvh] w-full max-w-[340px] overflow-y-auto rounded-2xl bg-white p-4 text-slate-900 shadow-2xl sm:max-w-md sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3"><h2 id="install-title" className="text-lg font-bold">Install winkox app</h2><button type="button" disabled={busy} aria-label="Close install instructions" onClick={() => setPopup(false)} className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-500"><XIcon size={18} /></button></div>
        <div className="my-4 flex items-center gap-3"><Image src="/icon-192.png" width={48} height={48} alt="winkox" className="rounded-xl" /><div><b>winkox</b><p className="text-xs text-slate-500">Phone & computer web app</p></div></div>
        {device !== "ios" && (manual || device === "safari") && <div className="mt-4 space-y-2 rounded-xl bg-sky-50 p-3 text-sm leading-relaxed text-sky-900">
          {device === "android" ? <p>Chrome/Edge ke <b>⋮ menu → Install app</b> ya <b>Add to Home screen → Install</b> chunein. Sirf browser bookmark ki bajaye app install karein.</p>
            : device === "safari" ? <p>Mac Safari mein <b>File → Add to Dock → Add</b> chunein. App Dock aur Applications se khulegi.</p>
              : <p>Chrome/Edge mein address bar ka <b>Install</b> icon use karein, ya browser menu mein <b>Install winkox / Install this site as an app</b> chunein. Agar sirf <b>Create shortcut</b> mile to <b>Open as window</b> select karein. Firefox mein app install option na ho to Chrome/Edge use karein.</p>}
        </div>}
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setPopup(false)} className="rounded-full border border-slate-300 px-4 py-2 text-sm">Close</button>{device !== "ios" && device !== "safari" && <button type="button" disabled={busy || !ready} onClick={() => void create()} className="rounded-full bg-[#7edfff] px-4 py-2 text-sm font-bold text-[#07435a] disabled:opacity-60">{busy ? "Opening..." : ready ? "Install app" : "Use Chrome menu"}</button>}</div>
      </section>
    </div>}
  </>;
}
