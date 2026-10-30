"use client";
import Link from "next/link";
import { Header, BottomNav, CONTAINER } from "@/components/lobby/Lobby";
import { SupportWidget } from "@/components/SupportWidget";
import { getInfoPage, INFO_PAGES } from "@/lib/infoPages";
import { OpenSupportButton } from "@/components/OpenSupport";
import { WhatsAppIcon, TelegramIcon, HeadsetIcon, CrownIcon, BookIcon, MailIcon } from "@/components/Icons";
import { useI18n } from "@/lib/i18n/client";
import { usePage, NOT_FOUND, REDIRECT } from "@/lib/useDb";

export default function InfoPageRouteClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  const { t, locale } = useI18n();
  void locale;
  void params; void searchParams;
  return usePage(async () => {
    const { page } = params ?? {};
    const info = getInfoPage(page);
    if (!info) return NOT_FOUND;
    const ur = locale === "ur";
    const response = await fetch("/api/public/data?view=info", { cache: "no-store" });
    const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Page data load nahi ho saka.");
    const me = data.me, settings = data.settings;
    const viewer = { loggedIn: !!me, isAdmin: me?.role === "admin", name: me?.name, balance: me?.balance };
    const online = Boolean(data.supportOnline);
    const l: { whatsapp?: string; telegram?: string; whatsappChannel?: string; telegramChannel?: string } = settings.links ?? {};
    const vip = [...settings.vipLevels].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));

    const renderP = (txt: string) => {
      if (txt === "VIP_TABLE") return (
        <div className="overflow-x-auto rounded-xl border border-[#3a2470]">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/30 text-xs uppercase text-[#6f5fa3]"><tr><th className="px-3 py-2">{ur ? "لیول" : "Level"}</th><th className="px-3 py-2">{ur ? "کل ڈپازٹ" : "Total deposit"}</th><th className="px-3 py-2">Next-level bonus</th><th className="px-3 py-2">{ur ? "روزانہ وِدڈرا" : "Daily withdraw"}</th><th className="px-3 py-2">Withdrawals per day</th><th className="px-3 py-2">{ur ? "فی وِدڈرا" : "Per withdraw"}</th></tr></thead>
            <tbody className="divide-y divide-[#3a2470]/50">{vip.map((v) => <tr key={v.level}><td className="px-3 py-2 font-bold text-[#ffb800]"><span className="inline-flex items-center gap-1"><CrownIcon size={14} /> {v.level} {v.name}</span></td><td className="px-3 py-2 text-white">Rs. {(v.minDeposit ?? 0).toLocaleString()}+</td><td className="px-3 py-2 text-white">Rs. {(v.nextLevelBonus ?? 0).toLocaleString()}</td><td className="px-3 py-2 text-white">{v.dailyWithdrawLimit ? `Rs. ${v.dailyWithdrawLimit.toLocaleString()}` : "Unlimited"}</td><td className="px-3 py-2 text-white">{v.withdrawalsPerDay ? v.withdrawalsPerDay : "Unlimited"}</td><td className="px-3 py-2 text-white">{v.perWithdrawMax ? `Rs. ${v.perWithdrawMax.toLocaleString()}` : "Unlimited"}</td></tr>)}</tbody>
          </table>
        </div>
      );
      if (txt === "REF_RATES") return (
        <div className="grid gap-2 sm:grid-cols-1">
          {[["1.5%", ur ? "ہر ریفرر کے ذریعے آنے والے کلائنٹ کے پہلے منظور شدہ ڈپازٹ پر" : "on the first approved deposit from each referred client"]].map(([v, d]) => (
            <div key={d} className="rounded-xl bg-black/30 p-3 ring-1 ring-[#3a2470]"><div className="text-2xl font-black text-[#ffb800]">{v}</div><div className="text-xs text-[#b8a7e6]">{d}</div></div>
          ))}
        </div>
      );
      if (txt === "SUPPORT_CHANNELS") return (
        <div className="flex flex-wrap gap-2">
          <OpenSupportButton className="btn-violet inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold"><HeadsetIcon size={16} /> {ur ? "لائیو چیٹ" : "Live chat"}</OpenSupportButton>
          {l.whatsapp && <a href={l.whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#25d366] px-4 py-2 text-sm font-bold text-white"><WhatsAppIcon size={16} /> WhatsApp</a>}
          {l.telegram && <a href={l.telegram} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#29a9ea] px-4 py-2 text-sm font-bold text-white"><TelegramIcon size={16} /> Telegram</a>}
          {l.whatsappChannel && <a href={l.whatsappChannel} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-[#25d366] px-4 py-2 text-sm font-bold text-[#25d366]"><WhatsAppIcon size={16} /> {ur ? "واٹس ایپ چینل" : "WhatsApp Channel"}</a>}
          {l.telegramChannel && <a href={l.telegramChannel} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-[#29a9ea] px-4 py-2 text-sm font-bold text-[#29a9ea]"><TelegramIcon size={16} /> {ur ? "ٹیلیگرام چینل" : "Telegram Channel"}</a>}
        </div>
      );
      if (txt === "SUPPORT_HOURS") return (
        <div className="flex items-center gap-2 text-sm"><span className={`h-2.5 w-2.5 rounded-full ${online ? "bg-emerald-400" : "bg-red-400"}`} /><span className="text-white">{settings.support?.is247 ? "24/7" : `${settings.support?.startHour ?? 9}:00 – ${settings.support?.endHour ?? 23}:00 PKT`}</span><span className="text-[#b8a7e6]">· {online ? (ur ? "ابھی آن لائن" : "online now") : (ur ? "ابھی آف لائن — پیغام چھوڑیں" : "offline now — leave a message")}</span></div>
      );
      return <p className="text-sm leading-relaxed text-[#e9ddff]">{txt}</p>;
    };

    return (
      <div className="wx-bg min-h-screen text-white">
        <Header viewer={viewer} />
        <main className={`${CONTAINER} space-y-4 px-3 pb-28 pt-3 md:px-4 md:pb-12 lg:px-6`}>
          <div className="wx-card flex items-start gap-4 rounded-2xl p-5">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center text-white">{info.icon}</span>
            <div><h1 className="text-xl font-black md:text-2xl">{ur ? info.titleUr : info.title}</h1><p className="mt-1 text-sm text-[#b8a7e6]">{ur ? info.subtitleUr : info.subtitle}</p></div>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="space-y-4">
              {info.sections.map((s, i) => (
                <section key={i} className="wx-card rounded-2xl p-5">
                  <h2 className="mb-3 text-base font-black text-white">{ur ? s.hUr : s.h}</h2>
                  <div className="space-y-2">{(ur ? s.pUr : s.p).map((p, j) => <div key={j}>{renderP(p)}</div>)}</div>
                </section>
              ))}
              {info.cta && (
                <Link href={info.cta.auth && !viewer.loggedIn ? "/login" : info.cta.href} className="btn-gold inline-block rounded-full px-6 py-2.5 text-sm font-black">{ur ? info.cta.labelUr : info.cta.label} →</Link>
              )}
            </div>
            <aside className="wx-card h-max rounded-2xl p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-[#6f5fa3]">{ur ? "مزید" : "More"}</div>
              <ul className="space-y-1">
                {INFO_PAGES.map((p) => <li key={p.slug}><Link href={`/${p.slug}`} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${p.slug === info.slug ? "bg-[#8b5cf6]/15 font-bold text-white" : "text-[#b8a7e6] hover:text-white"}`}><span className="text-[#c4b5fd] [&>svg]:h-4 [&>svg]:w-4">{p.icon}</span>{ur ? p.titleUr : p.title}</Link></li>)}
                <li><Link href="/help" className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[#b8a7e6] hover:text-white"><span className="text-[#c4b5fd]"><BookIcon size={16} /></span>{ur ? "ہیلپ سینٹر" : "Help Center"}</Link></li>
                <li><Link href="/feedback" className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[#b8a7e6] hover:text-white"><span className="text-[#c4b5fd]"><MailIcon size={16} /></span>{ur ? "فیڈبیک" : "Reward Feedback"}</Link></li>
              </ul>
            </aside>
          </div>
        </main>
        <SupportWidget userName={viewer.name} />
        <BottomNav viewer={viewer} active="home" />
      </div>
    );
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
