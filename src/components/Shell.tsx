"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { destroySession } from "@/lib/auth";
import { SupportWidget } from "./SupportWidget";
import { NotificationBell } from "./NotificationBell";
import { Marquee } from "./lobby/LobbyClient";
import { LanguageSwitch } from "./LanguageSwitch";
import { ThemeToggle } from "./ThemeToggle";
import { BrandLogo } from "./BrandLogo";
import { MobileNavDrawer, ActiveLink } from "./MobileNavDrawer";
import { ReferralCommissionPopup } from "./ReferralCommissionPopup";
import { useI18n } from "@/lib/i18n/client";
import { GamepadIcon, WalletIcon, UsersIcon, HistoryIcon, UserIcon, BellIcon, BookIcon, HomeIcon, TargetIcon, ShieldIcon, CrownIcon, MegaphoneIcon, BanknoteIcon, HeadsetIcon, PackageIcon, PercentIcon, CalendarIcon, CircleHelpIcon, RefreshIcon, StarIcon, TrophyIcon } from "./Icons";
import type { ReactNode } from "react";

type NavItem = { href: string; label: string; icon: string; badge?: ReactNode };
const ICONS: Record<string, ReactNode> = { "⭐": <StarIcon size={20} />, "🏆": <TrophyIcon size={20} />, "🧹": <RefreshIcon size={20} />, "🎮": <GamepadIcon size={20} />, "💰": <WalletIcon size={20} />, "🤝": <UsersIcon size={20} />, "🧾": <HistoryIcon size={20} />, "👤": <UserIcon size={20} />, "🔔": <BellIcon size={20} />, "📘": <BookIcon size={20} />, "📊": <TargetIcon size={20} />, "👥": <UsersIcon size={20} />, "💳": <BanknoteIcon size={20} />, "💬": <HeadsetIcon size={20} />, "🎯": <TargetIcon size={20} />, "📒": <PackageIcon size={20} />, "👑": <CrownIcon size={20} />, "🏦": <WalletIcon size={20} />, "⚙️": <ShieldIcon size={20} />, "📢": <MegaphoneIcon size={20} />, "%": <PercentIcon size={20} />, "📅": <CalendarIcon size={20} />, "🛡️": <ShieldIcon size={20} />, "📜": <HistoryIcon size={20} />, "❓": <CircleHelpIcon size={20} /> };
const ico = (i: string) => ICONS[i] ?? <span className="text-lg leading-none">{i}</span>;

const linkBase = "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#e9ddff] transition hover:bg-[#8b5cf6]/20 hover:text-white md:justify-center xl:justify-start";
const linkActive = "bg-[#8b5cf6]/20 text-white ring-1 ring-[#8b5cf6]/40";

export function Shell({ title, nav, userName, badge, children, support = true, hideSidebar = false, mobileTabs, playerMenu }: { playerMenu?: { uid?: string; balance?: number }; mobileTabs?: { href: string; label: string; icon: ReactNode; center?: boolean }[]; title: string; nav: NavItem[]; userName: string; badge?: ReactNode; children: ReactNode; support?: boolean; showInstallPrompt?: boolean; hideSidebar?: boolean }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const isPlayerHome = pathname === "/player";
  const isPlayerProfile = pathname.startsWith("/player/profile");
  const isProfilePage = pathname === "/player/profile";
  const isDepositPage = pathname === "/player/deposit";
  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); await destroySession(); window.location.assign("/login"); };
  const mobileItems = nav.map((n) => ({ href: n.href, label: n.label, icon: ico(n.icon), badge: n.badge }));
  const tabs = nav.slice(0, 4);

  return (
    <div className={`wx-shell-root wx-bg flex min-h-[100dvh] ${hideSidebar ? "flex-col" : "flex-col md:flex-row"}`}>
      {!hideSidebar && (
        <aside className="wx-sidebar-desktop hidden shrink-0 flex-col border-r border-[#3a2470] bg-[#140c2a]/90 backdrop-blur rtl:border-l rtl:border-r-0 md:sticky md:top-0 md:flex md:h-[100dvh] md:w-[4.5rem] xl:w-64 2xl:w-72">
          {/* header (fixed) */}
          <Link href="/" className="flex shrink-0 items-center gap-3 border-b border-[#3a2470]/60 px-3 py-4 xl:px-5">
            <BrandLogo className="h-10 w-10 shrink-0 drop-shadow-[0_0_10px_rgba(255,184,0,.5)]" />
            <div className="hidden min-w-0 xl:block">
              <div className="truncate font-black text-white"><span className="text-gold-grad">winkox</span> <span className="text-xs font-semibold text-[#b8a7e6]">{title}</span></div>
              <div className="truncate text-xs text-[#b8a7e6]">{userName}</div>
            </div>
          </Link>
          {/* nav (scrolls independently) */}
          <nav className="wx-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-2 py-3 xl:px-3">
            {nav.map((n) => (
              <ActiveLink key={n.href} href={n.href} exact={n.href === "/admin" || n.href === "/player"} className={linkBase} activeClassName={linkActive}>
                <span className="relative shrink-0 text-[#c4b5fd]" title={n.label}>{ico(n.icon)}{n.badge && <span className="absolute -right-2.5 -top-2 xl:hidden">{n.badge}</span>}</span>
                <span className="hidden min-w-0 flex-1 truncate xl:inline">{n.label}</span>
                {n.badge && <span className="hidden shrink-0 xl:inline-flex">{n.badge}</span>}
              </ActiveLink>
            ))}
            <Link href="/" title={t("home")} className={linkBase}>
              <span className="shrink-0 text-[#c4b5fd]"><HomeIcon size={20} /></span><span className="hidden xl:inline">{t("home")}</span>
            </Link>
          </nav>
          {/* footer (fixed) */}
          <div className="shrink-0 border-t border-[#3a2470]/60 p-2 xl:p-4">
            <div className="mt-2 flex flex-col items-center gap-2 xl:mt-3 xl:flex-row xl:justify-start"><LanguageSwitch compact /></div>
            <button title={t("logout")} className="mt-2 w-full rounded-xl border border-[#3a2470] py-2 text-sm text-[#b8a7e6] hover:border-[#ff3b5c] hover:text-[#ff3b5c] xl:mt-3" onClick={logout}>
              <span className="xl:hidden">⎋</span><span className="hidden xl:inline">{t("logout")}</span>
            </button>
          </div>
        </aside>
      )}

      {/* ===== Mobile top bar ===== */}
      {!hideSidebar && !isDepositPage && <div className={`sticky top-0 z-40 flex items-center justify-between gap-2 px-2 py-2 md:hidden ${isPlayerProfile ? "" : "border-b border-[#3a2470] bg-[#140c2a]/95 backdrop-blur"}`}>
        <div className="flex min-w-0 items-center gap-2">
          <MobileNavDrawer
            title={`winkox · ${title}`}
            items={mobileItems}
            playerMenu={playerMenu ? { name: userName, uid: playerMenu.uid, balance: playerMenu.balance, onLogout: logout } : undefined}
            footer={<div className="space-y-2"><div className="flex items-center justify-between gap-2"><LanguageSwitch compact /><ThemeToggle compact /></div><button className="w-full rounded-xl border border-[#3a2470] py-2 text-sm text-[#b8a7e6]" onClick={logout}>{t("logout")}</button></div>}
          />
          {!isPlayerProfile && <Link href="/" className="flex min-w-0 items-center gap-2">
            <BrandLogo className="h-8 w-8 shrink-0" />
            <div className="hidden truncate text-sm font-black text-white min-[380px]:block"><span className="text-gold-grad">winkox</span> <span className="text-xs font-semibold text-[#b8a7e6]">{title}</span></div>
          </Link>}
        </div>
        {isProfilePage && <div className="flex items-center gap-1">
          <button type="button" aria-label="Support" onClick={() => window.dispatchEvent(new CustomEvent("wx:open-support"))} className="flex h-8 w-8 items-center justify-center text-white"><HeadsetIcon size={20} /></button>
          <NotificationBell loggedIn />
        </div>}
        {!isPlayerProfile && <div className="flex shrink-0 items-center gap-1.5">
          {!isPlayerHome && <span className="hidden min-[420px]:inline-flex">{badge}</span>}
          <NotificationBell loggedIn />
          <button type="button" title="Reload page" aria-label="Reload page" onClick={() => window.location.reload()} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#3a2470] text-[#b8a7e6] transition hover:border-[#00e5a0] hover:text-[#00e5a0]"><RefreshIcon size={16} /></button>
          {!playerMenu && <button className="rounded-lg border border-[#3a2470] px-2 py-1.5 text-[11px] text-[#b8a7e6]" onClick={logout}>{t("logout")}</button>}
        </div>}
      </div>}

      {/* ===== Main ===== */}
      <main className={`wx-main min-w-0 flex-1 ${isDepositPage ? "pb-28 md:p-6" : "p-2 pb-28 sm:p-4 md:pb-6 lg:p-8 2xl:px-12"} ${hideSidebar ? "md:pb-8" : ""}`}>
        <div className={`mx-auto w-full ${hideSidebar ? "max-w-[1300px]" : "max-w-[1600px] 2xl:max-w-[1800px]"}`}>
          {isProfilePage && <div className="mb-3 hidden items-center justify-end gap-1 md:flex">
            <button type="button" aria-label="Support" onClick={() => window.dispatchEvent(new CustomEvent("wx:open-support"))} className="flex h-8 w-8 items-center justify-center text-white"><HeadsetIcon size={20} /></button>
            <NotificationBell loggedIn />
          </div>}
          {support && !hideSidebar && !isPlayerProfile && !isDepositPage && <div className="mb-3 hidden items-center justify-end gap-2 md:flex"><ThemeToggle /><NotificationBell loggedIn /></div>}
          {!support && !hideSidebar && !isPlayerProfile && !isDepositPage && <div className="mb-3 hidden items-center justify-end gap-2 md:flex"><ThemeToggle /><LanguageSwitch compact /><NotificationBell loggedIn /></div>}
          {!hideSidebar && !isPlayerHome && !isPlayerProfile && !isDepositPage && !pathname.startsWith("/admin") && <div className="mb-3"><Marquee items={t("marquee")} /></div>}
          {children}
        </div>
      </main>
      {support && <SupportWidget userName={userName} />}
      <ReferralCommissionPopup />

      {/* ===== Mobile bottom tabs (4 + More) ===== */}
      {mobileTabs ? (
        <nav className="fixed inset-x-0 bottom-0 z-40 flex items-end border-t border-[#3a2470] bg-[#140c2a]/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,.35)] backdrop-blur md:hidden">
          {mobileTabs.map((n) => n.center ? (
            <ActiveLink key={n.href} href={n.href} exact className="relative -top-4 flex min-w-0 flex-1 flex-col items-center text-[10px] font-semibold text-[#b8a7e6]" activeClassName="!text-[#ffb800]">
              <span className="btn-gold flex h-14 w-14 items-center justify-center rounded-full ring-4 ring-[#140c2a]">{n.icon}</span>
              <span className="mt-0.5 w-full truncate px-1 text-center">{n.label}</span>
            </ActiveLink>
          ) : (
            <ActiveLink key={n.href} href={n.href} exact className="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold text-[#b8a7e6]" activeClassName="!text-[#ffb800]">
              <span>{n.icon}</span>
              <span className="w-full truncate px-1 text-center">{n.label}</span>
            </ActiveLink>
          ))}
        </nav>
      ) : (
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[#3a2470] bg-[#140c2a]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {tabs.map((n) => (
          <ActiveLink key={n.href} href={n.href} exact={n.href === "/admin" || n.href === "/player"} className="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold text-[#b8a7e6]" activeClassName="!text-[#ffb800]">
            <span className="relative">{ico(n.icon)}{n.badge && <span className="absolute -right-4 -top-1">{n.badge}</span>}</span>
            <span className="w-full truncate px-1 text-center">{n.label}</span>
          </ActiveLink>
        ))}
        <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-semibold text-[#b8a7e6]">
          <MobileNavDrawer title={`winkox · ${title}`} items={mobileItems} footer={<button className="w-full rounded-xl border border-[#3a2470] py-2 text-sm text-[#b8a7e6]" onClick={logout}>{t("logout")}</button>} />
          <span>More</span>
        </div>
      </nav>
      )}
    </div>
  );
}

export function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="wx-card min-w-0 rounded-2xl p-3 sm:p-4 lg:p-5">
      <div className="truncate text-[11px] text-[#b8a7e6] sm:text-sm">{label}</div>
      <div className="mt-1 min-w-0" style={{ containerType: "inline-size" }}>
        <div
          className={`whitespace-nowrap font-black leading-tight tabular-nums ${accent ?? "text-white"}`}
          style={{ fontSize: `clamp(0.75rem, calc(100cqw / ${Math.max(String(value).length, 7) * 0.6}), 1.875rem)` }}
          title={String(value)}
        >{value}</div>
      </div>
      {sub && <div className="mt-1 break-words text-[11px] text-slate-500 sm:text-xs">{sub}</div>}
    </div>
  );
}

export function Card({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="wx-card min-w-0 rounded-2xl p-3 sm:p-4 lg:p-5">
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-4">
          {title && <h2 className="text-sm font-bold text-white sm:text-base lg:text-lg">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-yellow-500/15 text-yellow-400",
    approved: "bg-emerald-500/15 text-emerald-400",
    rejected: "bg-red-500/15 text-red-400",
    win: "bg-emerald-500/15 text-emerald-400",
    lose: "bg-red-500/15 text-red-400",
    active: "bg-emerald-500/15 text-emerald-400",
    blocked: "bg-red-500/15 text-red-400",
  };
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${map[status] ?? "bg-slate-700 text-slate-300"}`}>{status}</span>;
}

export function ProviderBadge({ provider }: { provider: string }) {
  if (provider === "raast") return <span className="whitespace-nowrap rounded-md bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">Raast</span>;
  return provider === "jazzcash" ? (
    <span className="whitespace-nowrap rounded-md bg-red-600 px-2 py-0.5 text-xs font-bold text-white">JazzCash</span>
  ) : (
    <span className="whitespace-nowrap rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">Easypaisa</span>
  );
}

export const fmt = (n: string | number) => `Rs. ${Number(n).toLocaleString("en-PK", { minimumFractionDigits: 0 })}`;
export const fmtDate = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" }) : "-");
