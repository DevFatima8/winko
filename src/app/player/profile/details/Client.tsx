"use client";
import { Card, StatCard, fmt } from "@/components/Shell";
import { PinForm, PasswordForm, CopyLink } from "@/components/ProfileForms";
import { InstallApp } from "@/components/InstallApp";
import { ProfileDevices } from "@/components/ProfileDevices";
import { OpenSupportButton } from "@/components/OpenSupport";
import { logoutAction } from "@/lib/clientActions";
import { WhatsAppIcon, TelegramIcon, BookIcon, CrownIcon, UserIcon } from "@/components/Icons";
import { useI18n } from "@/lib/i18n/client";
import { usePage, NOT_FOUND, REDIRECT } from "@/lib/useDb";
import Link from "next/link";
import { referralLink } from "@/lib/siteUrl";
import { CopyBtn, SubHeader } from "@/components/PlayerUi";
import { useAppInstalled } from "@/lib/appInstall";

export default function ProfilePageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  const installed = useAppInstalled();
  const { t, locale } = useI18n();
  void locale;
  void params; void searchParams;
  return usePage(async () => {
    const response = await fetch("/api/player/profile", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Profile data load nahi ho saka.");
    const { me, settings, teamMembers: team } = data;
    const u = me;
    const levels = [...settings.vipLevels].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
    const cur = levels.find((level) => level.level === me.vipLevel) ?? levels[0];
    const next = levels.find((level) => (level.level ?? 0) > me.vipLevel) ?? null;

    const link = referralLink(me.referralCode);
    const progress = next ? Math.min(100, Math.round((me.totalDeposited / (next.minDeposit ?? 1)) * 100)) : 100;
    return (
      <div className="space-y-6">
        <SubHeader title={t("profile")} />
        <div className="on-image relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#3b0764] via-[#6d28d9] to-[#c026d3] p-5 shadow-[0_10px_40px_rgba(139,92,246,.4)]">
          <div className="flex min-w-0 items-center gap-4">
            <span aria-label="Player avatar" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/15 text-3xl ring-2 ring-[#ffb800]"><UserIcon size={30} /></span>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-black">{me.name}</h1>
              <div className="text-sm text-[#e9ddff]">@{me.username ?? "-"} · {me.phone}</div>
              <div className="mt-1 flex items-center gap-1 text-xs text-[#e9ddff]">Player ID: <span className="font-mono">{me.displayId}</span><CopyBtn value={me.displayId} label="Copy player ID" /></div>
              <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-black/30 px-2.5 py-0.5 text-xs font-black text-[#ffb800]"><CrownIcon size={12} /> VIP {me.vipLevel} · {cur?.name}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <StatCard label={t("balance")} value={fmt(me.balance)} accent="text-[#ffb800]" />
          <StatCard label={t("totalDeposited")} value={fmt(me.totalDeposited)} accent="text-emerald-300" />
          <StatCard label="Total Withdrawn" value={fmt(me.totalWithdrawn)} accent="text-cyan-300" />
          <StatCard label="Credit Score" value={Number(me.vipBetPoints ?? 0).toLocaleString()} accent="text-violet-300" />
          <StatCard label={t("dailyWithdrawLimit")} value={fmt(cur?.dailyWithdrawLimit ?? 0)} sub={`${t("maxPerWithdraw")} ${fmt(cur?.perWithdrawMax ?? 0)}`} />
          <StatCard label={t("commissionEarned")} value={fmt(me.commissionEarned)} sub={t("teamMembers", { n: team })} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/player/wallet" className="btn-gold rounded-full px-5 py-2 text-sm font-bold">Deposit / Withdraw</Link>
          <Link href="/player/records" className="btn-outline rounded-full px-5 py-2 text-sm font-bold">My Records</Link>
        </div>

        <Card title={t("vipProgress")}>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-white">{t("level")} {me.vipLevel} — {cur?.name}</span>{next ? <span className="text-[#b8a7e6]">{t("next")}: <b className="text-[#ffb800]">{next.name}</b> {t("atTotalDeposit", { n: (next.minDeposit ?? 0).toLocaleString() })} ({t("remaining", { n: Math.max(0, (next.minDeposit ?? 0) - me.totalDeposited).toLocaleString() })})</span> : <span className="text-[#ffb800]">{t("maxLevel")}</span>}</div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-black/40"><div className="h-full rounded-full bg-gradient-to-r from-[#ffb800] to-[#ff8a00]" style={{ width: `${progress}%` }} /></div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {levels.map((l) => (
              <div key={l.level} className={`rounded-xl p-2 ${l.level === me.vipLevel ? "bg-[#ffb800]/15 ring-1 ring-[#ffb800]" : "bg-black/30"}`}>
                <div className="flex items-center gap-1 font-black text-white"><CrownIcon size={12} className="text-[#ffb800]" /> {l.level} {l.name}</div><div className="text-[#b8a7e6]">{t("depositPlus", { n: (l.minDeposit ?? 0).toLocaleString() })}</div><div className="text-[#b8a7e6]">{t("daily", { n: (l.dailyWithdrawLimit ?? 0).toLocaleString() })}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title={t("inviteEarn")}>
          <p className="mb-2 text-sm text-[#b8a7e6]">{t("inviteText", { d: settings.referral?.depositCommissionPct ?? 1.5 })} <b className="font-mono text-white">{me.referralCode}</b></p>
          <CopyLink link={link} />
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card title={me.hasPin ? t("pinSet") : t("setPin")}><p className="mb-3 text-xs text-[#b8a7e6]">{t("pinNote")}</p><PinForm hasPin={me.hasPin} /></Card>
          <Card title={t("changePassword")}><PasswordForm /></Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {!installed && <Card title={t("appTitle")}><p className="mb-3 text-xs text-[#b8a7e6]">{t("appNote")}</p><InstallApp androidUrl={settings.app?.androidUrl || undefined} iosUrl={settings.app?.iosUrl || undefined} /></Card>}
          <Card title={t("supportChannels")}>
            <div className="flex flex-wrap gap-2">
              <OpenSupportButton />
              {settings.links?.whatsappChannel && <a href={settings.links.whatsappChannel} target="_blank" rel="noreferrer" className="keep-white inline-flex items-center gap-2 rounded-full bg-[#25d366] px-4 py-2 text-sm font-bold text-white"><WhatsAppIcon size={16} /> {t("whatsappChannel")}</a>}
              {settings.links?.telegramChannel && <a href={settings.links.telegramChannel} target="_blank" rel="noreferrer" className="keep-white inline-flex items-center gap-2 rounded-full bg-[#229ED9] px-4 py-2 text-sm font-bold text-white"><TelegramIcon size={16} /> {t("telegramChannel")}</a>}
              <Link href="/help" className="btn-outline inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold"><BookIcon size={16} /> {t("helpCenter")}</Link>
            </div>
            <form action={logoutAction} className="mt-4"><button className="w-full rounded-xl border border-[#3a2470] py-2 text-sm text-[#b8a7e6] hover:border-[#ff3b5c] hover:text-[#ff3b5c]">{t("logout")}</button></form>
          </Card>
        </div>
        <Card title="Login devices">
          <p className="mb-3 text-xs text-[#b8a7e6]">Review active sessions and remove any device you no longer use.</p>
          <ProfileDevices />
        </Card>
        {u?.blockedGames?.length ? <p className="text-xs text-red-300">Aap in games ke liye restricted hain: {u.blockedGames.join(", ")}. Support se rabta karein.</p> : null}
      </div>
    );
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {}), installed]);
}
