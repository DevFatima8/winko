"use client";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Header, BottomNav, MARQUEE, CONTAINER } from "@/components/lobby/Lobby";
import { SupportWidget } from "@/components/SupportWidget";
import { GiftIcon, WalletIcon, UsersIcon, PercentIcon, LifeBuoyIcon, CrownIcon, PackageIcon } from "@/components/Icons";
import type { ReactNode } from "react";
import styles from "./Promotions.module.css";
const PROMO_ICONS: Record<string, ReactNode> = { gift: <GiftIcon size={24} />, wallet: <WalletIcon size={24} />, users: <UsersIcon size={24} />, percent: <PercentIcon size={24} />, rescue: <LifeBuoyIcon size={24} />, crown: <CrownIcon size={24} />, packet: <PackageIcon size={24} /> };


const PROMOS = [
  { icon: "gift", title: "Welcome Bonus — PKR 1500", desc: "Register karein aur pehli deposit par welcome reward hasil karein.", tag: "New users" },
  { icon: "wallet", title: "7% Bonus on every deposit", desc: "Har deposit par 7% extra balance — PKR 60,000 tak. JazzCash & Easypaisa dono par.", tag: "Deposit" },
  { icon: "users", title: "Invite & Earn 288 PKR", desc: "1 dost ko invite karein jo pehli deposit kare — 288 PKR bonus, plus 2% deposit commission.", tag: "Invite", id: "invite" },
  { icon: "percent", title: "Daily Cashback", desc: "Har bet par cashback — agle din 00:00 ke baad claim karein.", tag: "Rebate" },
  { icon: "rescue", title: "Weekly Rescue Fund", desc: "Losses par har hafte PKR 100,000 tak rescue fund.", tag: "Fund" },
  { icon: "crown", title: "VIP Levels", desc: "Tasks complete karein, VIP level upgrade karein aur highest benefits free mein enjoy karein.", tag: "VIP" },
  { icon: "packet", title: "Red Packets", desc: "Rozana 3 random red packets — PKR 888,888 tak jeetne ka mauqa.", tag: "Daily" },
];

const PROMOS_UR: Record<string, [string, string]> = {
  "Welcome Bonus — PKR 1500": ["ویلکم بونس — PKR 1500", "رجسٹر کریں اور پہلی ڈپازٹ پر ویلکم انعام حاصل کریں۔"],
  "7% Bonus on every deposit": ["ہر ڈپازٹ پر 7% بونس", "ہر ڈپازٹ پر 7% اضافی بیلنس — PKR 60,000 تک۔ جاز کیش اور ایزی پیسہ دونوں پر۔"],
  "Invite & Earn 288 PKR": ["انوائٹ کریں اور 288 PKR کمائیں", "1 دوست کو انوائٹ کریں جو پہلی بار ڈپازٹ کرے — 288 PKR بونس، ساتھ 2% ڈپازٹ کمیشن۔"],
  "Daily Cashback": ["روزانہ کیش بیک", "ہر بیٹ پر کیش بیک — اگلے دن 00:00 کے بعد کلیم کریں۔"],
  "Weekly Rescue Fund": ["ہفتہ وار ریسکیو فنڈ", "نقصان پر ہر ہفتے PKR 100,000 تک ریسکیو فنڈ۔"],
  "VIP Levels": ["VIP لیولز", "ٹاسک مکمل کریں، VIP لیول بڑھائیں اور بہترین فوائد مفت حاصل کریں۔"],
  "Red Packets": ["ریڈ پیکٹس", "روزانہ 3 رینڈم ریڈ پیکٹس — PKR 888,888 تک جیتنے کا موقع۔"],
};
import { useI18n } from "@/lib/i18n/client";
import { usePage, NOT_FOUND, REDIRECT } from "@/lib/useDb";

export default function PromoPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  const { t, locale } = useI18n();
  void locale;
  void params; void searchParams;
  return usePage(async () => {

    let me = null;
    try { me = await getCurrentUser(); } catch { }
    const viewer = { loggedIn: !!me, isAdmin: me?.role === "admin", name: me?.name, balance: me?.balance };
    return (
      <div className="wx-bg min-h-screen text-white">
        <Header viewer={viewer} active="promo" />
        <main className={`${CONTAINER} space-y-3 px-3 pb-28 pt-3 md:px-4 md:pb-12 lg:px-6`}>
          <h1 className="text-xl font-black md:text-2xl">{t("promoTitle")}</h1>
          <div className="rounded-xl bg-black/30 px-3 py-2 text-xs text-[#b8a7e6] ring-1 ring-[#3a2470]">{t("marquee")[1]}</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {PROMOS.map((p) => (
              <div key={p.title} id={p.id} className="wx-card wx-hover flex gap-3 rounded-2xl p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center text-white">{PROMO_ICONS[p.icon] ?? <GiftIcon size={28} />}</div>
                <div className={styles.content}>
                  <div className={styles.heading}><h2 className={styles.title}>{locale === "ur" ? (PROMOS_UR[p.title]?.[0] ?? p.title) : p.title}</h2><span className={styles.badge}>{p.tag}</span></div>
                  <p className="mt-1 text-xs text-[#b8a7e6]">{locale === "ur" ? (PROMOS_UR[p.title]?.[1] ?? p.desc) : p.desc}</p>
                  <Link href={viewer.loggedIn ? "/player/deposit" : "/signup"} className={`${styles.action} btn-violet mt-2 rounded-full px-3 py-1 text-xs font-bold`}>{viewer.loggedIn ? t("depositNow") : t("registerToClaim")}</Link>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-[11px] text-[#6f5fa3]">{t("promoNote")}</p>
        </main>
        <SupportWidget userName={viewer.name} />
        <BottomNav viewer={viewer} active="promo" />
      </div>
    );
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
