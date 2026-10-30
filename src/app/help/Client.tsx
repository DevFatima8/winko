"use client";
import Link from "next/link";
import type { HelpArticleDoc } from "@/models";
import { Header, BottomNav, CONTAINER } from "@/components/lobby/Lobby";
import { OpenSupportButton } from "@/components/OpenSupport";
import { SupportWidget } from "@/components/SupportWidget";
import { WhatsAppIcon, TelegramIcon, BookIcon, WalletIcon, BanknoteIcon, GamepadIcon, UserIcon, CircleHelpIcon } from "@/components/Icons";
import { useI18n } from "@/lib/i18n/client";
import { usePage, NOT_FOUND, REDIRECT } from "@/lib/useDb";

export default function HelpPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  const { t, locale } = useI18n();
  void locale;
  void params; void searchParams;
  return usePage(async () => {
    const response = await fetch("/api/public/data?view=help", { cache: "no-store" });
    const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Help guides load nahi ho sake.");
    const list = data.articles as HelpArticleDoc[];
    const me = data.me;
    const viewer = { loggedIn: !!me, isAdmin: me?.role === "admin", name: me?.name, balance: me?.balance };
    const cats = Array.from(new Set(list.map((a) => a.category)));
    const l = data.links;
    return (
      <div className="wx-bg min-h-screen text-white">
        <Header viewer={viewer} />
        <main className={`${CONTAINER} space-y-4 px-3 pb-28 pt-3 md:px-4 md:pb-12 lg:px-6`}>
          <div className="wx-card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
            <div><h1 className="flex items-center gap-2 text-xl font-black md:text-2xl"><BookIcon size={24} />{t("helpTitle").replace("📘 ", "")}</h1><p className="text-sm text-[#b8a7e6]">{t("helpSub")}</p></div>
            <div className="flex flex-wrap gap-2">
              <OpenSupportButton />
              {l?.whatsapp && <a href={l.whatsapp} target="_blank" rel="noreferrer" className="keep-white inline-flex items-center gap-2 rounded-full bg-[#25d366] px-4 py-2 text-sm font-bold text-white"><WhatsAppIcon size={16} /> WhatsApp</a>}
              {l?.telegram && <a href={l.telegram} target="_blank" rel="noreferrer" className="keep-white inline-flex items-center gap-2 rounded-full bg-[#229ED9] px-4 py-2 text-sm font-bold text-white"><TelegramIcon size={16} /> Telegram</a>}
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto">{cats.map((c) => <a key={c} href={`#cat-${c}`} className="shrink-0 rounded-full bg-black/30 px-3 py-1 text-xs font-bold text-[#c4b5fd] ring-1 ring-[#3a2470]">{c}</a>)}</div>
          {cats.map((c) => (
            <section key={c} id={`cat-${c}`} className="space-y-3">
              <h2 className="flex items-center gap-2 text-lg font-black"><span className="text-[#c4b5fd]">{c === "Deposit" ? <WalletIcon size={20} /> : c === "Withdraw" ? <BanknoteIcon size={20} /> : c === "Games" ? <GamepadIcon size={20} /> : c === "Account" ? <UserIcon size={20} /> : <CircleHelpIcon size={20} />}</span>{c}</h2>
              {list.filter((a) => a.category === c).map((a) => (
                <details key={String(a._id)} id={String(a._id)} className="wx-card group rounded-2xl p-4" open={list.length <= 4}>
                  <summary className="flex cursor-pointer list-none items-center justify-between font-bold text-white"><span>{a.title}</span><span className="text-[#b8a7e6] transition group-open:rotate-180">▾</span></summary>
                  <ol className="mt-3 space-y-3">
                    {a.steps.map((s, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#d946ef] text-xs font-black">{i + 1}</span>
                        <div className="min-w-0 flex-1"><p className="text-sm text-[#e9ddff]">{s.text}</p>{s.image && <img src={s.image} alt={`Step ${i + 1}`} className="mt-2 max-h-80 rounded-xl border border-[#3a2470] object-contain" />}</div>
                      </li>
                    ))}
                  </ol>
                </details>
              ))}
            </section>
          ))}
          {list.length === 0 && <p className="py-10 text-center text-[#6f5fa3]">{t("noGuides")}</p>}
          <p className="text-center text-xs text-[#6f5fa3]"><Link href="/" className="text-[#c4b5fd]">{t("backHome")}</Link></p>
        </main>
        <SupportWidget userName={viewer.name} />
        <BottomNav viewer={viewer} active="home" />
      </div>
    );
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
