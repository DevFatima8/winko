"use client";
import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Shell, fmt } from "@/components/Shell";
import { PageLoadingSkeleton, useSession } from "@/lib/useDb";
import { useI18n } from "@/lib/i18n/client";
import { SupportWidget } from "@/components/SupportWidget";
import { HomeIcon, GiftIcon, UsersIcon, WalletIcon, UserIcon } from "@/components/Icons";

export default function ClientLayout({ children }: { children: ReactNode }) {
  const { user, loading, error } = useSession();
  const { t } = useI18n();
  const pathname = usePathname();
  const hideSidebar = pathname.startsWith("/player/games/");
  useEffect(() => {
    if (loading) return;
    if (!user) window.location.replace("/login");
    else if (user.role === "admin") window.location.replace("/admin");
  }, [user, loading]);
  if (loading || !user || user.role !== "client") return (
    <div className="wx-bg min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        {loading && <p className="text-sm text-[#b8a7e6]" role="status">{error ? "Connection slow hai — reconnect ho raha hai..." : "Account load ho raha hai..."}</p>}
        <PageLoadingSkeleton message="Account loading" />
      </div>
    </div>
  );
  if (!user.isActive) return (
    <div className="wx-bg flex min-h-[100dvh] items-center justify-center p-4 text-white">
      <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#140c2a] p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15 text-3xl">!</div>
        <h1 className="mt-4 text-2xl font-black text-red-300">Account Blocked</h1>
        <p className="mt-2 text-sm text-[#e9ddff]">Aapka account temporarily block hai.</p>
        <div className="mt-4 rounded-xl bg-black/30 p-3 text-left text-sm text-[#ffe0a3] ring-1 ring-red-500/20"><b className="text-white">Reason:</b> {user.adminNote || "Administrator ne account block kiya hai."}</div>
        <button onClick={() => window.dispatchEvent(new CustomEvent("wx:open-support"))} className="btn-gold mt-5 w-full rounded-xl px-4 py-3 text-sm font-black">Contact Support to Unblock</button>
        <p className="mt-3 text-xs text-[#b8a7e6]">Support ko apna reason batayein. Admin review ke baad account unblock kar sakta hai.</p>
      </div>
      <SupportWidget userName={user.name} />
    </div>
  );
  const nav = [
    { href: "/player", label: t("games"), icon: "🎮" },
    { href: "/player/deposit", label: t("wallet"), icon: "💰" },
    { href: "/player/team", label: t("invite"), icon: "🤝" },
    { href: "/player/records", label: "My Records", icon: "🧾" },
    { href: "/player/profile", label: t("profile"), icon: "👤" },
    { href: "/player/notifications", label: t("notifications"), icon: "🔔" },
    { href: "/help", label: t("helpCenter"), icon: "📘" },
  ];
  return (
    <Shell title="Player" nav={nav} userName={user.name} playerMenu={{ uid: user.displayId ?? undefined, balance: user.balance }} badge={<div className="btn-gold rounded-xl px-3 py-2"><div className="text-[10px] font-semibold uppercase">{t("balance")}</div><div className="text-lg font-black">{fmt(user.balance)}</div></div>} hideSidebar={hideSidebar} mobileTabs={[
      { href: "/player", label: t("home"), icon: <HomeIcon size={22} /> },
      { href: "/promo", label: t("promo"), icon: <GiftIcon size={22} /> },
      { href: "/player/team", label: t("invite"), icon: <UsersIcon size={24} />, center: true },
      { href: "/player/deposit", label: t("deposit"), icon: <WalletIcon size={22} /> },
      { href: "/player/profile", label: t("profile"), icon: <UserIcon size={22} /> },
    ]}>
      {children}
    </Shell>
  );
}
