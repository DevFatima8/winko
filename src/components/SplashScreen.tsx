"use client";
import { useEffect, useState } from "react";

const MIN_MS = 900;
const MAX_MS = 4000;

/** Full-screen branded loader shown on first open while the site and its data warm up. */
export function SplashScreen() {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const started = Date.now();
    const pageLoaded = new Promise<void>((resolve) => {
      if (document.readyState === "complete") resolve();
      else window.addEventListener("load", () => resolve(), { once: true });
    });
    const dataWarm = fetch("/api/public/data?view=info", { cache: "no-store" }).then(() => undefined).catch(() => undefined);
    const cap = new Promise<void>((resolve) => window.setTimeout(resolve, MAX_MS));
    let t1 = 0, t2 = 0;
    void Promise.race([Promise.all([pageLoaded, dataWarm]), cap]).then(() => {
      const wait = Math.max(0, MIN_MS - (Date.now() - started));
      t1 = window.setTimeout(() => {
        setLeaving(true);
        t2 = window.setTimeout(() => setGone(true), 500);
      }, wait);
    });
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, []);

  if (gone) return null;
  return (
    <div
      aria-hidden={leaving}
      className="wx-splash"
      style={{
        position: "fixed", inset: 0, zIndex: 99999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28,
        background: "radial-gradient(circle at 50% 40%, #12211f 0%, #050b0f 70%)",
        opacity: leaving ? 0 : 1, transition: "opacity .5s ease", pointerEvents: leaving ? "none" : "auto",
      }}
    >
      <div style={{ position: "relative", width: "min(62vw, 280px)", aspectRatio: "1 / 1" }}>
        <div className="wx-splash-ring" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-mark.png" alt="winkox" className="wx-splash-logo" />
      </div>
      <div className="wx-splash-bar"><span /></div>
      <style>{`
        .wx-splash-logo{position:absolute;inset:12%;width:76%;height:76%;object-fit:contain;animation:wxSplashPulse 1.6s ease-in-out infinite;filter:drop-shadow(0 0 24px rgba(255,184,0,.45))}
        .wx-splash-ring{position:absolute;inset:0;border-radius:9999px;border:3px solid rgba(255,184,0,.15);border-top-color:#ffb800;border-right-color:#22d3b6;animation:wxSplashSpin 1.1s linear infinite}
        .wx-splash-bar{width:min(52vw,200px);height:4px;border-radius:9999px;background:rgba(255,255,255,.1);overflow:hidden}
        .wx-splash-bar span{display:block;height:100%;width:40%;border-radius:inherit;background:linear-gradient(90deg,#ffb800,#22d3b6);animation:wxSplashBar 1.2s ease-in-out infinite}
        @keyframes wxSplashSpin{to{transform:rotate(360deg)}}
        @keyframes wxSplashPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
        @keyframes wxSplashBar{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}
      `}</style>
    </div>
  );
}
