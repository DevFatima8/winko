"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { GlobeIcon } from "@/components/Icons";

export function LanguageSwitch({ compact }: { compact?: boolean }) {
  const { locale } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const set = (l: "en" | "ur") => {
    document.cookie = `lang=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setOpen(false);
    start(() => router.refresh());
  };
  if (compact) {
    return (
      <div className="wx-lang overflow-hidden rounded-full bg-black/30 ring-1 ring-[#3a2470] text-[11px] font-bold">
        <button onClick={() => set("en")} className={locale === "en" ? "wx-lang-on" : "text-[#b8a7e6]"}>EN</button>
        <button onClick={() => set("ur")} className={locale === "ur" ? "wx-lang-on" : "text-[#b8a7e6]"} style={{ fontFamily: "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif" }}>اردو</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className={`flex items-center gap-1 rounded-full bg-black/30 px-3 py-1 text-xs font-semibold text-white ring-1 ring-[#3a2470] ${pending ? "opacity-60" : ""}`}>
        <GlobeIcon size={14} /> {locale === "ur" ? "اردو" : "English"} <span className="text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-36 overflow-hidden rounded-xl border border-[#3a2470] bg-[#140c2a] shadow-2xl">
          <button onClick={() => set("en")} className={`flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-white/5 ${locale === "en" ? "text-[#ffb800]" : "text-white"}`}>English {locale === "en" && "✓"}</button>
          <button onClick={() => set("ur")} className={`flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-white/5 ${locale === "ur" ? "text-[#ffb800]" : "text-white"}`}>اردو {locale === "ur" && "✓"}</button>
        </div>
      )}
    </div>
  );
}
