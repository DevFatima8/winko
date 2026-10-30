"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { avatarSrc, isAvatar } from "@/lib/avatars";
import { useI18n } from "@/lib/i18n/client";
import { LanguageSwitch } from "./LanguageSwitch";
import { BrandLogo } from "./BrandLogo";
import { CopyBtn } from "./PlayerUi";
import { useAppInstalled } from "@/lib/appInstall";
import { RefreshIcon, HeadsetIcon, DownloadIcon, GlobeIcon, WalletIcon, BanknoteIcon, GamepadIcon, FlameIcon, SpadeIcon, BellIcon, UserIcon } from "./Icons";

const ico = (dir: string, file: string) => <img src={`/Website-Icons/Website-Icons/${dir}/png/${file}-128.png`} alt="" width={64} height={64} loading="lazy" draggable={false} className="h-full w-full object-contain" />;
const CopyIcon = ({ on }: { on: boolean }) => on ? <span className="text-[9px] text-[#ffb800]">Copied</span> : <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#ffb800" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;

type Tile = { href: string; label: string; icon: ReactNode };

export function PlayerMenu({ name, uid, balance, guest, onNavigate, onLogout }: { name: string; uid?: string; balance?: number; guest?: boolean; onNavigate?: () => void; onLogout?: () => void }) {
  const installed = useAppInstalled();
  const { t } = useI18n();
  const [copied, setCopied] = useState("");
  const [bal, setBal] = useState<number | undefined>(balance);
  const [spin, setSpin] = useState(false);
  useEffect(() => { setBal(balance); }, [balance]);
  const [avatar, setAvatar] = useState<string | null>(null);
  useEffect(() => { if (guest) return; getCurrentUser().then((u) => { if (u && isAvatar(u.avatar)) setAvatar(u.avatar); }).catch(() => { }); }, [guest]);
  const refreshBalance = async () => {
    if (guest || spin) return;
    setSpin(true);
    try { const u = await getCurrentUser(true); if (u) setBal(u.balance); } catch { }
    setTimeout(() => setSpin(false), 500);
  };
  const copy = (key: string, v?: string) => { if (!v) return; try { navigator.clipboard?.writeText(v); } catch { } setCopied(key); setTimeout(() => setCopied(""), 1200); };
  const gate = (h: string) => (guest && h.startsWith("/player") ? "/login" : h);
  const tiles: Tile[] = [
    { href: "/events", label: "Event", icon: ico("01-Event", "Event") },
    { href: "/player/vip", label: "VIP", icon: ico("03-VIP", "VIP") },
    { href: "/player/deposit", label: "Unclaimed", icon: ico("04-Unclaimed", "Unclaimed") },
    { href: "/player/history", label: "History", icon: ico("05-History", "History") },
    { href: "/player/team", label: "Invite", icon: ico("06-Invite", "Invite") },
    { href: "/player/records", label: "Bet record", icon: ico("07-Bet-Record", "Bet-Record") },
    { href: "/help", label: "FAQ", icon: ico("08-FAQ", "FAQ") },
    { href: "/help", label: "Find us", icon: ico("10-Find-Us", "Find-Us") },
    { href: "/feedback", label: "Reward Feedback", icon: ico("11-Reward-Feedback", "Reward-Feedback") },
  ];
  const quick: { href: string; label: string; icon: ReactNode }[] = [
    { href: "/player", label: t("games"), icon: <GamepadIcon size={16} /> },
    { href: "/#games", label: t("hotGames"), icon: <FlameIcon size={16} /> },
    { href: "/games-all?cat=Cards", label: t("cards"), icon: <SpadeIcon size={16} /> },
    { href: "/player/notifications", label: t("notifications"), icon: <BellIcon size={16} /> },
    { href: "/player/profile", label: t("profile"), icon: <UserIcon size={16} /> },
  ];
  const row = "flex w-full cursor-pointer items-center gap-2 px-2.5 py-[clamp(5px,1.1vh,9px)] text-left text-[11px] font-medium text-white";
  const chev = <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-[10px] text-slate-300">›</span>;
  return (
    <div className="flex h-full min-h-0 flex-col justify-between gap-[clamp(4px,1vh,8px)] bg-[#121018] p-2">
      <div className="relative flex shrink-0 items-center justify-center">
        <span role="button" tabIndex={0} onClick={onNavigate} aria-label="Close menu" className="absolute left-0 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-white/10 text-sm leading-none text-white">‹</span>
        <BrandLogo className="h-6 w-6" /><span className="ml-1.5 text-sm font-black text-gold-grad">winkox</span>
      </div>

      <div className="shrink-0 rounded-xl border border-white/10 bg-gradient-to-br from-[#2a2338] to-[#17131f] p-2">
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-[#8b5cf6] to-[#e50539] text-base font-black text-white">{avatar && !guest ? <img src={avatarSrc(avatar)} alt="" width={40} height={40} draggable={false} className="h-full w-full object-cover" /> : (guest ? "G" : name || "U").charAt(0).toUpperCase()}</span>
          <div className="min-w-0 flex-1 text-[12px] leading-snug">
            <span role="button" tabIndex={0} onClick={() => copy("n", name)} className="flex max-w-full cursor-pointer items-center gap-1 font-medium text-slate-200"><span className="truncate">{guest ? "Guest" : name}</span>{!guest && <CopyIcon on={copied === "n"} />}</span>
            {!guest && uid && <div className="flex max-w-full items-center gap-1 text-slate-300"><span className="truncate">{uid}</span><CopyBtn value={uid} label="Copy player ID" /></div>}
          </div>
        </div>
      </div>

      <div className="shrink-0 rounded-xl border border-white/10 bg-gradient-to-br from-[#2a2338] to-[#17131f] p-2">
        <div className="flex items-center gap-1.5 text-[12px] font-bold text-[#ffb800]"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[8px] font-black text-white">Rs</span><span className="underline decoration-[#ffb800]/60 underline-offset-2">{Number(guest ? 0 : bal ?? 0).toLocaleString("en-PK")}</span><span role="button" tabIndex={0} aria-label="Refresh balance" onClick={refreshBalance} className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-slate-300 active:bg-white/10"><RefreshIcon size={12} className={spin ? "animate-spin" : ""} /></span></div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <Link href={guest ? "/login" : "/player/withdraw"} onClick={onNavigate} className="flex items-center justify-center gap-1 rounded-lg bg-gradient-to-br from-[#0f766e] via-[#059669] to-[#22c55e] px-1 py-1.5 text-[11px] font-semibold text-white ring-1 ring-[#6ee7b7]/70"><BanknoteIcon size={13} />{t("withdraw")}</Link>
          <Link href={guest ? "/login" : "/player/deposit"} onClick={onNavigate} style={{ background: "linear-gradient(135deg,#e11d48 0%,#7c1d6f 45%,#1d4ed8 100%)", boxShadow: "inset 0 0 0 1.5px #ffc933" }} className="relative flex items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-black text-white"><span className="absolute -right-1 -top-2 rounded-full bg-[#ff3b30] px-1 text-[8px] font-bold leading-[13px] text-white">5%</span><WalletIcon size={13} />{t("deposit")}</Link>
        </div>
      </div>
      <div className="grid min-h-0 shrink grid-cols-3 gap-x-1 gap-y-[clamp(3px,1vh,8px)]">
        {tiles.map((x) => (
          <Link key={x.label} href={gate(x.href)} onClick={onNavigate} className="flex min-w-0 flex-col items-center gap-0.5 text-center text-[10px] font-medium leading-[1.1] text-slate-200 transition active:scale-95">
            <span className="block h-[clamp(26px,5.2vh,40px)] w-[clamp(26px,5.2vh,40px)]">{x.icon}</span>
            <span className="break-words">{x.label}</span>
          </Link>
        ))}
      </div>

      <div className="grid shrink-0 grid-cols-5 gap-1 rounded-xl border border-white/10 bg-[#1d1a25] p-1">
        {quick.map((q) => (
          <Link key={q.href} href={gate(q.href)} onClick={onNavigate} className="flex min-w-0 flex-col items-center gap-0.5 rounded-lg py-1 text-center text-[8px] leading-tight text-slate-200 active:bg-white/10">
            <span className="text-[#ffcf4a]">{q.icon}</span><span className="w-full truncate">{q.label}</span>
          </Link>
        ))}
      </div>

      <div className="shrink-0 divide-y divide-white/10 rounded-xl border border-white/10 bg-[#1d1a25]">
        <div role="button" tabIndex={0} className={row} onClick={() => { onNavigate?.(); window.dispatchEvent(new CustomEvent("wx:open-support")); }}><HeadsetIcon size={15} />Customer Service{chev}</div>
        {!installed && <button type="button" className={`${row} w-full text-left`} onClick={() => { onNavigate?.(); window.dispatchEvent(new CustomEvent("wx:install-now")); }}><DownloadIcon size={15} />APP Download{chev}</button>}
        <div className={row}><GlobeIcon size={15} /><span>{t("language")}</span><span className="ml-auto"><LanguageSwitch compact /></span></div>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-1.5">
        <Link href="/" onClick={onNavigate} className="rounded-xl border border-white/10 bg-[#1d1a25] py-1.5 text-center text-[11px] font-medium text-white">{t("home")}</Link>
        {guest ? <Link href="/login" onClick={onNavigate} className="rounded-xl border border-[#3a2470] py-1.5 text-center text-[11px] font-medium text-[#b8a7e6]">{t("login")}</Link> : onLogout && <div role="button" tabIndex={0} onClick={onLogout} className="cursor-pointer rounded-xl border border-[#3a2470] py-1.5 text-center text-[11px] font-medium text-[#b8a7e6]">{t("logout")}</div>}
      </div>
    </div>
  );
}
