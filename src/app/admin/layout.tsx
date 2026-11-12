"use client";
import { useEffect, type ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { AdminLiveSync } from "@/components/AdminLiveSync";
import { PageLoadingSkeleton, useSession } from "@/lib/useDb";
import { useI18n } from "@/lib/i18n/client";
import { usePendingPayments } from "@/components/admin/usePendingPayments";
import { PendingPaymentBadge } from "@/components/admin/PendingPaymentBadge";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading, error } = useSession();
  const { t } = useI18n();
  const payments = usePendingPayments(user?.role === "admin" ? user.id : undefined);
  useEffect(() => { if (!loading && (!user || user.role !== "admin")) window.location.replace("/login"); }, [user, loading]);
  if (loading || !user || user.role !== "admin") return (
    <div className="wx-bg min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        {loading && <p className="text-sm text-[#b8a7e6]" role="status">{error ? "Connection slow hai — reconnect ho raha hai..." : "Admin panel load ho raha hai..."}</p>}
        <PageLoadingSkeleton message="Admin panel loading" />
      </div>
    </div>
  );
  const superNav = user.level >= 2;
  const nav = [
    { href: "/admin", label: t("dashboard"), icon: "📊" },
    { href: "/admin/support", label: t("liveSupportAdmin"), icon: "💬" },
    { href: "/admin/users", label: t("usersAdmin"), icon: "👥" },
    ...(user.level >= 3 ? [{ href: "/admin/devices", label: "Login devices", icon: "🛡️" }] : []),
    { href: "/admin/deposits", label: t("depositsAdmin"), icon: "💳", badge: <PendingPaymentBadge label={t("depositsAdmin")} count={payments.counts?.deposits} error={payments.error} /> },
    { href: "/admin/withdrawals", label: t("withdrawalsAdmin"), icon: "💳", badge: <PendingPaymentBadge label={t("withdrawalsAdmin")} count={payments.counts?.withdrawals} error={payments.error} /> },
    { href: "/admin/feedback", label: t("feedbackAdmin"), icon: "📢" },
    { href: "/admin/games", label: superNav ? t("gamesOnOff") : t("gamesAdmin"), icon: "🎮" },
    { href: "/admin/results", label: t("gameResultsAdmin"), icon: "🎯" },
    { href: "/admin/vip-bets", label: "VIP required bets", icon: "⭐" },
    ...(superNav ? [
      { href: "/admin/leaderboard", label: "Leaderboard", icon: "🏆" },
    ] : []),
    { href: "/admin/records", label: t("recordsAdmin"), icon: "📒" },
    { href: "/admin/agents", label: t("agentsAdmin"), icon: "🤝" },
    { href: "/admin/notifications", label: t("notificationsAdmin"), icon: "🔔" },
    ...(superNav ? [
      { href: "/admin/announcements", label: "Announcements", icon: "📢" },
      { href: "/admin/staff", label: t("staffAdmin"), icon: "🛡️" },
      { href: "/admin/logs", label: t("activityLogs"), icon: "📜" },
      ...(user.level >= 3 ? [{ href: "/admin/cleanup", label: t("historyCleanup"), icon: "🧹" }] : []),
      { href: "/admin/vip", label: "VIP deposit levels", icon: "👑" },
      { href: "/admin/help", label: t("helpCenterAdmin"), icon: "📘" },
      { href: "/admin/payments", label: t("paymentAccountsAdmin"), icon: "🏦" },
      { href: "/admin/settings", label: t("settingsAdmin"), icon: "⚙️" },
    ] : []),
    { href: "/admin/account", label: t("myAccountAdmin"), icon: "👤" },
  ];
  return (
    <Shell title={user.level >= 3 ? "Agent" : superNav ? t("superAdmin") : t("admin")} nav={nav} userName={`${user.name}${user.adminId ? ` · ${user.adminId}` : ""}`} support={false} showInstallPrompt={false} badge={<span className="btn-violet rounded-lg px-3 py-1 text-xs font-bold">{user.level >= 3 ? "Agent" : superNav ? t("superAdmin") : t("admin")}</span>}>
      <AdminLiveSync />
      {children}
    </Shell>
  );
}
