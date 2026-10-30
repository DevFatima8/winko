"use client";

import { useState, type ReactNode } from "react";

export function WalletTabs({ tabs }: { tabs: { key: string; label: string; badge?: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-xl bg-black/30 p-1 ring-1 ring-[#3a2470]">
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setActive(t.key)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition sm:text-sm ${active === t.key ? "btn-violet" : "text-[#b8a7e6] hover:text-white"}`}>
            <span className="truncate">{t.label}</span>{t.badge && <span className="rounded bg-[#ffb800] px-1 text-[9px] font-black text-slate-950">{t.badge}</span>}
          </button>
        ))}
      </div>
      {tabs.find((t) => t.key === active)?.content}
    </div>
  );
}
