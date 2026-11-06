"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AVATARS, avatarSrc, isAvatar } from "@/lib/avatars";
import { Chevron, CopyBtn } from "@/components/PlayerUi";
import { logoutAction } from "@/lib/clientActions";
import { BanknoteIcon, GlobeIcon, HeadsetIcon, ShieldIcon, UserIcon, WalletIcon } from "@/components/Icons";
import { PlayerBalance } from "@/components/PlayerBalance";
import { getCurrentUser } from "@/lib/auth";
import { useI18n } from "@/lib/i18n/client";
import { usePage } from "@/lib/useDb";
import { DEFAULT_BET_PRESETS, normalizeBetPresets } from "@/lib/betPresets";

const ico = (dir: string, file: string) => <img src={`/Website-Icons/Website-Icons/${dir}/png/${file}-128.png`} alt="" width={32} height={32} draggable={false} className="h-full w-full object-contain" />;
const disc = (bg: string, node: ReactNode) => <span className={`flex h-full w-full items-center justify-center rounded-full text-white ${bg}`}>{node}</span>;

type Row = { href?: string; onClick?: () => void; icon: ReactNode; label: string; hint?: ReactNode; badge?: ReactNode };

function MenuRow({ r }: { r: Row }) {
  const inner = (
    <>
      <span className="h-[26px] w-[26px] shrink-0">{r.icon}</span>
      <span className="min-w-0 flex-1 truncate">{r.label}</span>
      {r.hint}
      <Chevron />
      {r.badge}
    </>
  );
  const cls = "relative flex w-full items-center gap-3 px-3 py-[11px] text-left text-[13px] font-medium text-white active:bg-white/5";
  return r.href ? <Link href={r.href} className={cls}>{inner}</Link> : <div role="button" tabIndex={0} onClick={r.onClick} className={`${cls} cursor-pointer`}>{inner}</div>;
}

function AvatarHeader({ me }: { me: { id: string; name: string; avatar?: string | null } }) {
  const [avatar, setAvatar] = useState<string | null>(isAvatar(me.avatar) ? me.avatar : null);
  const [open, setOpen] = useState(false);
  const choose = async (a: string) => {
    const prev = avatar;
    setAvatar(a);
    setOpen(false);
    try {
      const res = await fetch("/api/player/avatar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ avatar: a }) });
      if (res.ok) void getCurrentUser(true); else setAvatar(prev);
    } catch { setAvatar(prev); }
  };
  return (
    <>
      <div className="relative shrink-0">
        <span className="flex h-[58px] w-[58px] items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#e11d48] via-[#7c1d6f] to-[#1d4ed8] text-2xl font-black text-white ring-2 ring-[#ffc933]/70">
          {avatar ? <img src={avatarSrc(avatar)} alt="" width={58} height={58} draggable={false} className="h-full w-full object-cover" /> : String(me.name ?? "U").charAt(0).toUpperCase()}
        </span>
        <span role="button" tabIndex={0} aria-label="Edit avatar" onClick={() => setOpen(true)} className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-[#ffb800] text-[#1a1030] ring-2 ring-[#120b25]">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        </span>
      </div>
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 sm:items-center" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="flex max-h-[80vh] w-full max-w-md flex-col rounded-t-2xl border border-white/10 bg-[#15101f] p-3 sm:rounded-2xl">
            <div className="mb-2 flex items-center justify-between text-sm font-bold text-white">
              <span>Choose avatar</span>
              <span role="button" tabIndex={0} aria-label="Close" onClick={() => setOpen(false)} className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white/10 text-base leading-none">×</span>
            </div>
            <div className="grid grid-cols-5 content-start gap-x-2 gap-y-3 overflow-y-auto overscroll-contain p-1">
              {AVATARS.map((a) => (
                <div key={a} role="button" tabIndex={0} onClick={() => choose(a)} className={`mx-auto block h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-full ring-2 min-[400px]:h-14 min-[400px]:w-14 ${avatar === a ? "ring-[#ffc933]" : "ring-transparent"}`}>
                  <img src={avatarSrc(a)} alt="" width={56} height={56} loading="lazy" draggable={false} className="block h-full w-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export default function ProfilePageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const switchLang = () => {
    document.cookie = `lang=${locale === "ur" ? "en" : "ur"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  };
  return usePage(async () => {
    const response = await fetch("/api/player/profile", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Profile data load nahi ho saka.");
    const { me, teamMembers = 0, teamPerformance = 0, commission = 0 } = data;
    const money = (n: number) => Number(n ?? 0).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const rows: Row[] = [
      { href: "/player/profile/details", icon: disc("bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8]", <UserIcon size={15} />), label: t("profile") },
      { href: "/player/profile/security", icon: disc("bg-gradient-to-br from-[#22c55e] to-[#15803d]", <ShieldIcon size={15} />), label: "Security Center" },
      { href: "/help", icon: ico("10-Find-Us", "Find-Us"), label: "Find us", hint: <span className="truncate text-[11px] text-slate-400">Prevent it from opening</span> },
      { onClick: switchLang, icon: disc("bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9]", <GlobeIcon size={15} />), label: t("language"), hint: <span className="text-[11px] text-slate-400">{locale === "ur" ? "اردو" : "English"}</span> },
      { href: "/help", icon: ico("08-FAQ", "FAQ"), label: "FAQ" },
      { href: "/feedback", icon: ico("11-Reward-Feedback", "Reward-Feedback"), label: "Reward Feedback" },
      { href: "/player/profile/devices", icon: disc("bg-gradient-to-br from-[#22c55e] to-[#0e7490]", <HeadsetIcon size={15} />), label: "Login device" },
    ];

    return (
      <div className="mx-auto w-full max-w-2xl space-y-2.5 pb-6">
        <div className="flex flex-wrap items-center gap-3 px-1">
          <AvatarHeader me={me} />
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1 text-[15px] font-bold text-white"><span className="truncate">{me.name}</span><CopyBtn value={String(me.name)} /></div>
            <div className="flex items-center gap-1 text-[16px] font-bold text-white"><span className="truncate">{me.displayId}</span><CopyBtn value={me.displayId} label="Copy player ID" /></div>
            <div className="text-[13px] font-semibold text-slate-300">Credit Score: <span className="text-emerald-300">100</span></div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3 px-1">
          <PlayerBalance initial={me.balance} />
          <div className="flex shrink-0 items-start gap-5 text-center text-[11px] leading-none text-white">
            <Link href="/player/deposit" className="relative grid w-[56px] grid-rows-[32px_14px] justify-items-center gap-1 whitespace-nowrap">
              <span className="absolute -right-1 -top-2 rounded-full bg-[#ff3b30] px-1.5 text-[9px] font-bold leading-[14px] text-white">+5%</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#e11d48] via-[#7c1d6f] to-[#1d4ed8] text-white ring-1 ring-[#ffc933]/70"><WalletIcon size={18} /></span>
              <span className="leading-[14px]">{t("deposit")}</span>
            </Link>
            <Link href="/player/withdraw" className="grid w-[56px] grid-rows-[32px_14px] justify-items-center gap-1 whitespace-nowrap">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#0f766e] via-[#059669] to-[#22c55e] text-white ring-1 ring-[#6ee7b7]/70"><BanknoteIcon size={18} /></span>
              <span className="leading-[14px]">{t("withdraw")}</span>
            </Link>
          </div>
        </div>

        <div className="wx-card overflow-hidden rounded-xl">
          <MenuRow r={{ href: "/player/profile/bet-amounts", icon: <span className="flex h-full items-center justify-center font-bold">+</span>, label: "Customize bet amounts", hint: <span className="max-w-[45%] text-right text-xs text-[#ffb800]">{(normalizeBetPresets(me.betPresets) ?? DEFAULT_BET_PRESETS).join(" · ")}</span> }} />
        </div>

        <div className="wx-card rounded-xl">
          <Link href="/player/withdraw" className="flex flex-col items-center gap-1.5 py-4 text-[13px] font-medium text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#0f766e] via-[#059669] to-[#22c55e] ring-1 ring-[#6ee7b7]/70"><BanknoteIcon size={18} /></span>
            Manage withdrawal
          </Link>
        </div>

        <div className="wx-card divide-y divide-white/5 overflow-hidden rounded-xl">
          <MenuRow r={{ href: "/player/vip", icon: ico("03-VIP", "VIP"), label: "VIP" }} />
          <MenuRow r={{ href: "/player/records", icon: ico("07-Bet-Record", "Bet-Record"), label: "My Records", hint: <span className="ml-auto max-w-[55%] text-right text-[11px] leading-tight text-[#ffb800]">Details, records, reports, recover balance</span> }} />
        </div>

        <div className="wx-card rounded-xl px-3 py-2.5">
          <div className="flex items-center justify-between border-b border-white/10 pb-2 text-[13px] text-white">
            <span>Invite</span>
            <Link href="/player/team" className="flex items-center gap-1 text-[#ffb800]">More <Chevron /></Link>
          </div>
          <div className="grid grid-cols-[auto_1fr_1fr_auto] items-end gap-x-3 pt-2 text-[10px] leading-tight text-slate-400">
            <div className="min-w-0"><div className="text-[17px] font-semibold text-slate-300">{teamMembers}<span className="text-slate-300">({teamMembers})</span></div>Direct<br />subordinates</div>
            <div className="min-w-0"><div className="text-[17px] font-semibold text-slate-300">{money(teamPerformance)}</div>Direct<br />performance</div>
            <div className="min-w-0"><div className="text-[17px] font-semibold text-[#ffb800]">{money(commission)}</div>{commission === 0 && me.commissionEarned > 0 ? <>Commission<br />claimed</> : <>Commission not<br />claimed</>}</div>
            <Link href="/player/withdraw#referral-commission" className="self-center rounded-md bg-white/20 px-3 py-1.5 text-[12px] font-medium text-white">Claim</Link>
          </div>
        </div>

        <div className="wx-card divide-y divide-white/5 overflow-hidden rounded-xl">
          {rows.map((r) => <MenuRow key={r.label} r={r} />)}
          <form action={logoutAction}>
            <button className="relative flex w-full items-center gap-3 px-3 py-[11px] text-left text-[13px] font-medium text-white active:bg-white/5">
              <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ef4444] to-[#b91c1c]">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
              </span>
              <span className="min-w-0 flex-1">Quit</span>
              <Chevron />
            </button>
          </form>
        </div>
        {me.blockedGames?.length ? <p className="text-xs text-red-300">Aap in games ke liye restricted hain: {me.blockedGames.join(", ")}. Support se rabta karein.</p> : null}
      </div>
    );
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {}), locale]);
}
