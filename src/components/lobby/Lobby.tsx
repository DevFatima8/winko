"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BannerCarousel, Drawer, JackpotCounter, Marquee, TopButton, WinnersTicker, type Row, type Slide } from "./LobbyClient";
import { NotificationBell } from "../../components/NotificationBell";
import { SupportWidget } from "../../components/SupportWidget";
import { InstallApp } from "../../components/InstallApp";
import { useAppInstalled } from "@/lib/appInstall";
import { rememberGameReturn } from "@/lib/gameNavigation";
import { OpenSupportButton } from "../../components/OpenSupport";
import { LanguageSwitch } from "../../components/LanguageSwitch";
import { BrandLogo } from "../../components/BrandLogo";
import { ThemeToggle } from "../../components/ThemeToggle";
import { useI18n, Hi } from "../../lib/i18n/client";
import { WhatsAppIcon, TelegramIcon, FacebookIcon, InstagramIcon, YouTubeIcon, HeadsetIcon, HomeIcon, GiftIcon, UsersIcon, WalletIcon, UserIcon, ZapIcon, BanknoteIcon, ShieldIcon, FlameIcon, TrophyIcon, CrownIcon, PlayIcon, DownloadIcon, GamepadIcon, SpadeIcon, SlotIcon, FishIcon, CricketIcon, TicketIcon, RefreshIcon } from "../../components/Icons";
import { ArrowUp, Copy, LayoutGrid } from "lucide-react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { avatarSrc, isAvatar } from "@/lib/avatars";
import { GAME_IMAGES, GAME_ORDER } from "@/lib/gameCatalog";
import { GameName } from "./GameName";
import { GameThumbnail } from "./GameThumbnail";
import { PkFlag } from "../PlayerBalance";
import gameLabel from "./GameLabel.module.css";
import { FloatingActions } from "./FloatingActions";
import { ReferralCommissionPopup } from "../ReferralCommissionPopup";
import { GregmornGames } from "./GregmornGames";
import type { ProviderCatalogState } from "@/lib/useProviderCatalog";

export { GAME_ORDER } from "@/lib/gameCatalog";

export type Viewer = { loggedIn: boolean; isAdmin: boolean; name?: string; balance?: number; uid?: string };
export type Links = { whatsapp?: string; whatsappChannel?: string; telegram?: string; telegramChannel?: string; facebook?: string; instagram?: string; youtube?: string; androidUrl?: string; iosUrl?: string };

export const BRAND = { name: "winkox", domain: "winkox.shop", whatsapp: "https://wa.me/923000000000", telegram: "https://t.me/winkox" };

/* ---------------- static content ---------------- */
export const GAME_META: Record<string, { img: string; provider: string; label: string; cat: string[]; hot?: boolean; badge?: string }> = {
  aviator: { img: GAME_IMAGES["aviator"], provider: "SPRIBE", label: "Aviator", cat: ["Hot", "Mini Games", "Demo"], hot: true, badge: "HOT" },
  "chicken-dash": { img: GAME_IMAGES["chicken-dash"], provider: "JILI", label: "Chicken Dash", cat: ["Hot", "Mini Games", "Demo"], badge: "NEW" },
  "dragon-tiger": { img: GAME_IMAGES["dragon-tiger"], provider: "WG", label: "Dragon Tiger", cat: ["Hot", "Cards", "Live", "Demo"], badge: "LIVE" },
  "andar-bahar": { img: GAME_IMAGES["andar-bahar"], provider: "JILI", label: "Andar Bahar", cat: ["Hot", "Cards", "Live", "Demo"], badge: "LIVE" },
  "chicken-road-2": { img: GAME_IMAGES["chicken-road-2"], provider: "IN", label: "Chicken Road 2", cat: ["Hot", "Mini Games", "Demo"], hot: true },
  plinko: { img: GAME_IMAGES["plinko"], provider: "WG", label: "Plinko", cat: ["Hot", "Mini Games", "Demo"], badge: "1.3x" },
  "aviator-x": { img: GAME_IMAGES["aviator-x"], provider: "SPRIBE", label: "Aviator X", cat: ["Hot", "Mini Games", "Demo"], badge: "NEW" },
  limbo: { img: GAME_IMAGES["limbo"], provider: "WG", label: "Limbo", cat: ["Hot", "Mini Games", "Demo"], badge: "1M x" },
  mines: { img: GAME_IMAGES["mines"], provider: "SPRIBE", label: "Mines", cat: ["Hot", "Mini Games", "Demo"], hot: true },
  "lucky-777": { img: GAME_IMAGES["lucky-777"], provider: "JILI", label: "Lucky 777", cat: ["Hot", "Slot", "Demo"], badge: "777x" },

  "dice": { img: GAME_IMAGES["dice"], provider: "SPRIBE", label: "Dice Betting", cat: ["Hot", "Mini Games", "Demo"], badge: "NEW" },
  "dream-catcher": { img: GAME_IMAGES["dream-catcher"], provider: "WG", label: "Dream Catcher", cat: ["Live", "Demo"], badge: "HOT" },
  "european-roulette": { img: GAME_IMAGES["european-roulette"], provider: "WG", label: "European Roulette", cat: ["Hot", "Live", "Demo"] },
  "evo-casino": { img: GAME_IMAGES["evo-casino"], provider: "WG", label: "Evo Casino", cat: ["Live", "Demo"] },
  "fishing-arcade": { img: GAME_IMAGES["fishing-arcade"], provider: "JILI", label: "Fishing Arcade", cat: ["Hot", "Fishing", "Demo"] },
  "football-studio": { img: GAME_IMAGES["football-studio"], provider: "WG", label: "Football Studio", cat: ["Hot", "Sports", "Live", "Demo"], badge: "LIVE" },
  "fortune-gems": { img: GAME_IMAGES["fortune-gems"], provider: "JILI", label: "Fortune Gems", cat: ["Hot", "Slot", "Demo"] },
  "fortune-ox": { img: GAME_IMAGES["fortune-ox"], provider: "JILI", label: "Fortune Ox", cat: ["Slot", "Demo"] },
  "fortune-toucan": { img: GAME_IMAGES["fortune-toucan"], provider: "JILI", label: "Fortune Toucan", cat: ["Slot", "Demo"] },
  "gates-of-olympus": { img: GAME_IMAGES["gates-of-olympus"], provider: "IN", label: "Gates of Olympus", cat: ["Hot", "Slot", "Demo"], badge: "5000x" },
  "head-tail": { img: GAME_IMAGES["head-tail"], provider: "SPRIBE", label: "Head & Tail", cat: ["Mini Games", "Demo"] },
  "muflis": { img: GAME_IMAGES["muflis"], provider: "IN", label: "Muflis Lowball", cat: ["Hot", "Cards", "Demo"] },
  "poker": { img: GAME_IMAGES["poker"], provider: "IN", label: "Poker", cat: ["Hot", "Cards", "Demo"] },
  "rock-paper-scissors": { img: GAME_IMAGES["rock-paper-scissors"], provider: "SPRIBE", label: "Rock Paper Scissors", cat: ["Mini Games", "Demo"] },
  "amar-akbar-anthony": { img: GAME_IMAGES["amar-akbar-anthony"], provider: "IN", label: "Amar Akbar Anthony", cat: ["Hot", "Cards", "Demo"] },
  "7-up-down": { img: GAME_IMAGES["7-up-down"], provider: "IN", label: "7 Up Down", cat: ["Hot", "Mini Games", "Demo"] },
  "nine-wickets": { img: GAME_IMAGES["nine-wickets"], provider: "WG", label: "9 Wickets Live", cat: ["Hot", "Sports", "Live", "Demo"], badge: "LIVE" },
  "32-cards": { img: GAME_IMAGES["32-cards"], provider: "IN", label: "32 Cards", cat: ["Hot", "Cards", "Demo"] },
  "auto-roulette": { img: GAME_IMAGES["auto-roulette"], provider: "WG", label: "Auto Roulette", cat: ["Hot", "Live", "Demo"] },
  "baccarat": { img: GAME_IMAGES["baccarat"], provider: "WG", label: "Baccarat", cat: ["Hot", "Cards", "Live", "Demo"], badge: "LIVE" },
  "birds-beasts": { img: GAME_IMAGES["birds-beasts"], provider: "JILI", label: "Birds & Beasts", cat: ["Hot", "Mini Games", "Demo"], badge: "NEW" },
  "blackjack": { img: GAME_IMAGES["blackjack"], provider: "WG", label: "Blackjack", cat: ["Hot", "Cards", "Demo"] },
  "blast-off": { img: GAME_IMAGES["blast-off"], provider: "SPRIBE", label: "Blast Off", cat: ["Hot", "Mini Games", "Demo"], badge: "NEW" },
  "bollywood-casino": { img: GAME_IMAGES["bollywood-casino"], provider: "IN", label: "Bollywood Casino", cat: ["Hot", "Cards", "Demo"], badge: "HOT" },
  "casino-war": { img: GAME_IMAGES["casino-war"], provider: "WG", label: "Casino War", cat: ["Hot", "Cards", "Demo"], badge: "NEW" },
  "crash-bonus": { img: GAME_IMAGES["crash-bonus"], provider: "SPRIBE", label: "Crash Bonus", cat: ["Hot", "Mini Games", "Demo"], badge: "NEW" },
  "crash-cricket": { img: GAME_IMAGES["crash-cricket"], provider: "SPRIBE", label: "Crash Cricket", cat: ["Hot", "Sports", "Mini Games", "Demo"], badge: "NEW" },
  "crash-goal": { img: GAME_IMAGES["crash-goal"], provider: "SPRIBE", label: "Crash Goal", cat: ["Hot", "Sports", "Mini Games", "Demo"], badge: "NEW" },
  "derby-race": { img: GAME_IMAGES["derby-race"], provider: "JILI", label: "Derby Race", cat: ["Hot", "Sports", "Demo"], badge: "NEW" },
  "diao-chan": { img: GAME_IMAGES["diao-chan"], provider: "JILI", label: "Diao Chan", cat: ["Hot", "Slots", "Demo"], badge: "NEW" },
  "hotline": { img: GAME_IMAGES["hotline"], provider: "IN", label: "Hotline Casino", cat: ["Hot", "Demo"], badge: "HOT" },
  "keno": { img: GAME_IMAGES["keno"], provider: "WG", label: "Keno", cat: ["Hot", "Lottery", "Demo"], badge: "NEW" },
  "lightning-roulette": { img: GAME_IMAGES["lightning-roulette"], provider: "EVO", label: "Lightning Roulette", cat: ["Hot", "Live", "Demo"], badge: "LIVE" },
  "ludo": { img: GAME_IMAGES["ludo"], provider: "IN", label: "Ludo Betting", cat: ["Hot", "Board", "Demo"], badge: "NEW" },
  "mini-roulette": { img: GAME_IMAGES["mini-roulette"], provider: "WG", label: "Mini Roulette", cat: ["Hot", "Table", "Demo"] },
  "monster-hilo": { img: GAME_IMAGES["monster-hilo"], provider: "JILI", label: "Monster HiLo", cat: ["Hot", "Cards", "Demo"], badge: "NEW" },
  "poker-betting": { img: GAME_IMAGES["poker-betting"], provider: "EVO", label: "Poker Betting", cat: ["Hot", "Cards", "Demo"] },
  "poker-roulette": { img: GAME_IMAGES["poker-roulette"], provider: "WG", label: "Poker Roulette", cat: ["Hot", "Table", "Demo"], badge: "NEW" },
  "race-betting": { img: GAME_IMAGES["race-betting"], provider: "IN", label: "Race Betting", cat: ["Hot", "Sports", "Demo"], badge: "NEW" },
  "red-vs-black": { img: GAME_IMAGES["red-vs-black"], provider: "IN", label: "Red Vs Black", cat: ["Hot", "Cards", "Demo"], badge: "NEW" },
  "rummy": { img: GAME_IMAGES["rummy"], provider: "IN", label: "Rummy", cat: ["Hot", "Cards", "Demo"], badge: "NEW" },
  "sic-bo": { img: GAME_IMAGES["sic-bo"], provider: "IN", label: "Sic Bo", cat: ["Hot", "Mini Games", "Demo"], badge: "NEW" },
  "speed-baccarat": { img: GAME_IMAGES["speed-baccarat"], provider: "WG", label: "Speed Baccarat", cat: ["Hot", "Cards", "Live", "Demo"], badge: "LIVE" },
  "super-fruits": { img: GAME_IMAGES["super-fruits"], provider: "JILI", label: "Super Fruits", cat: ["Hot", "Slot", "Demo"], badge: "HOT" },
  "sweet-bonanza": { img: GAME_IMAGES["sweet-bonanza"], provider: "JILI", label: "Sweet Bonanza", cat: ["Hot", "Slot", "Demo"], badge: "NEW" },
  "tai-xiu": { img: GAME_IMAGES["tai-xiu"], provider: "IN", label: "Tai Xiu", cat: ["Hot", "Mini Games", "Demo"], badge: "NEW" },
  "teen-patti": { img: GAME_IMAGES["teen-patti"], provider: "IN", label: "Teen Patti", cat: ["Hot", "Cards", "Demo"], badge: "HOT" },
  "teen-patti-999": { img: GAME_IMAGES["teen-patti-999"], provider: "IN", label: "Teen Patti 999", cat: ["Hot", "Cards", "Demo"], badge: "HOT" },
  "teen-patti-ak47": { img: GAME_IMAGES["teen-patti-ak47"], provider: "IN", label: "Teen Patti AK47", cat: ["Hot", "Cards", "Demo"], badge: "NEW" },
  "teen-patti-best-of-four": { img: GAME_IMAGES["teen-patti-best-of-four"], provider: "IN", label: "Teen Patti Best of 4", cat: ["Hot", "Cards", "Demo"], badge: "NEW" },
  "teen-patti-faceoff": { img: GAME_IMAGES["teen-patti-faceoff"], provider: "IN", label: "Teen Patti Faceoff", cat: ["Hot", "Cards", "Demo"], badge: "HOT" },
  "teen-patti-hukam": { img: GAME_IMAGES["teen-patti-hukam"], provider: "IN", label: "Teen Patti Hukam", cat: ["Hot", "Cards", "Demo"], badge: "NEW" },
  "teen-patti-joker": { img: GAME_IMAGES["teen-patti-joker"], provider: "IN", label: "Teen Patti Joker", cat: ["Hot", "Cards", "Demo"], badge: "NEW" },
  "texas-holdem": { img: GAME_IMAGES["texas-holdem"], provider: "IN", label: "Texas Holdem", cat: ["Hot", "Cards", "Demo"], badge: "NEW" },
  "thai-hi-lo": { img: GAME_IMAGES["thai-hi-lo"], provider: "IN", label: "Thai Hi Lo", cat: ["Hot", "Mini Games", "Demo"], badge: "NEW" },
  "three-card-poker": { img: GAME_IMAGES["three-card-poker"], provider: "IN", label: "Three Card Poker", cat: ["Hot", "Cards", "Demo"], badge: "NEW" },
  "three-cards": { img: GAME_IMAGES["three-cards"], provider: "IN", label: "Three Cards", cat: ["Hot", "Cards", "Demo"], badge: "NEW" },
  "tower-betting": { img: GAME_IMAGES["tower-betting"], provider: "IN", label: "Tower Betting", cat: ["Hot", "Mini Games", "Demo"], badge: "NEW" },
  "treasure-bowl": { img: GAME_IMAGES["treasure-bowl"], provider: "JILI", label: "Treasure Bowl", cat: ["Hot", "Slot", "Demo"], badge: "NEW" },
  "wheel-betting": { img: GAME_IMAGES["wheel-betting"], provider: "IN", label: "Wheel Betting", cat: ["Hot", "Mini Games", "Demo"], badge: "NEW" },
};
const BADGE_STYLE: Record<string, string> = { "777x": "bg-gradient-to-r from-[#ef4444] to-[#b91c1c]", "1M x": "bg-gradient-to-r from-[#0ea5e9] to-[#6366f1]", HOT: "bg-gradient-to-r from-[#ff3b5c] to-[#ff8a00]", NEW: "bg-gradient-to-r from-[#22c55e] to-[#16a34a]", LIVE: "bg-gradient-to-r from-[#d946ef] to-[#8b5cf6]", "1000x": "bg-gradient-to-r from-[#ffb800] to-[#ff8a00] text-slate-950" };

export const MARQUEE = [
  "winkox mein khush aamdeed! Register karein aur PKR 1500 welcome bonus hasil karein",
  "Har deposit par 7% bonus — PKR 60,000 tak! JazzCash & Easypaisa instant",
  "1 dost invite karein jo top-up kare — 588 PKR bonus + 1.5% betting commission + 4% top-up commission",
  "Har bet par cashback — agle din 00:00 ke baad claim karein",
  "Har hafte PKR 100,000 tak rescue fund!",
  "Rozana 3 random red packets — PKR 888,888 tak jeetne ka mauqa",
];

const SLIDES: Slide[] = [
  { bg: "bg-gradient-to-r from-[#04261f] via-[#0b5a4a] to-[#0a8f9e]", img: "/lobby/02_VIP_1024x765.jpg", kicker: "Welcome bonus", title: "Receive |PKR 1500| for free", sub: "Register now & claim your welcome reward instantly", href: "/signup", cta: "Register now" },
  { bg: "bg-gradient-to-r from-[#0a0f14] via-[#12252e] to-[#0e7490]", img: GAME_IMAGES["aviator"], kicker: "Most played", title: "Aviator |up to 1000x|", sub: "Cash out before the plane flies away", href: "/games/aviator", cta: "Play now" },
  { bg: "bg-gradient-to-r from-[#3b0a0a] via-[#7a1f2b] to-[#c2410c]", img: GAME_IMAGES["dragon-tiger"], kicker: "Live cards", title: "Dragon Tiger |Tie pays 1:1|",   sub: "10-second betting countdown · real cards", href: "/games/dragon-tiger", cta: "Join table" },
  { bg: "bg-gradient-to-r from-[#0b2a12] via-[#0f5132] to-[#059669]", img: "/lobby/04_Jackpot_No_Amount_1024x765.jpg", kicker: "Every deposit", title: "|7% bonus| on every deposit", sub: "Win up to PKR 60,000 — JazzCash & Easypaisa", href: "/promo", cta: "View promo" },
];

export const CAT_ICONS: Record<string, ReactNode> = { All: <LayoutGrid size={14} />, Slot: <SlotIcon size={14} />, "Mini Games": <GamepadIcon size={14} />, Live: <HeadsetIcon size={14} />, Cards: <SpadeIcon size={14} />, Fishing: <FishIcon size={14} />, Sports: <CricketIcon size={14} />, Lottery: <TicketIcon size={14} /> };
export const CATS: { key: string; label: string; icon: string; img: string; grad: string }[] = [
  { key: "All", label: "All Games", icon: "🎮", img: "/lobby/01_All_Games.png", grad: "from-[#8b5cf6]" },
  { key: "Mini Games", label: "Mini Games", icon: "🎮", img: "/lobby/02_Mini_Games.png", grad: "from-[#059669]" },
  { key: "Cards", label: "Cards", icon: "🃏", img: "/lobby/03_Cards.png", grad: "from-[#ea580c]" },
  { key: "Live", label: "Live Casino", icon: "🎧", img: "/lobby/04_Live_Casino.png", grad: "from-[#dc2626]" },
  { key: "Sports", label: "Sports", icon: "🏏", img: "/lobby/05_Sports.png", grad: "from-[#16a34a]" },
  { key: "Slot", label: "Slots", icon: "🎰", img: "/lobby/06_Slots.png", grad: "from-[#0e7490]" },
  { key: "Fishing", label: "Fishing", icon: "🐟", img: "/lobby/07_Fishing.png", grad: "from-[#0284c7]" },
  { key: "Lottery", label: "Lottery", icon: "🎱", img: "/lobby/08_Lottery.png", grad: "from-[#ca8a04]" },
];

export const PROVIDER_CATS = [
  CATS[0],
  { key: "Hot", label: "Hot Games", icon: "", img: "/lobby/04_Jackpot_No_Amount_1024x765.jpg", grad: "from-[#ea580c]" },
  ...CATS.slice(1),
];

export const CONTAINER = "mx-auto w-full max-w-[560px] md:max-w-[880px] lg:max-w-[1200px] xl:max-w-[1320px] 2xl:max-w-[1600px] min-[2200px]:max-w-[1900px]";

/* ---------------- pieces ---------------- */
const MI = (f: string) => <img src={`/more-icons/PNG/${f}.png`} alt="" width={32} height={32} draggable={false} className="h-8 w-8 object-contain" />;

function MoreMenu({ onClose, onNavigate, unclaimed }: { onClose: () => void; onNavigate: () => void; unclaimed: number }) {
  const installed = useAppInstalled();
  const router = useRouter();
  const { locale } = useI18n();
  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.origin : "";
    try {
      if (navigator.share) await navigator.share({ title: BRAND.name, url });
      else { await navigator.clipboard?.writeText(url); }
    } catch { }
  };
  const lang = () => { document.cookie = `lang=${locale === "ur" ? "en" : "ur"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`; router.refresh(); };
  type It = { label: string; icon: ReactNode; href?: string; run?: () => void; tag?: string };
  const items: It[] = [
    { label: "VIP", icon: MI("vip"), href: "/player/vip" },
    { label: "Invite", icon: MI("invite"), href: "/player/team" },
    { label: "Support", icon: MI("support"), run: () => window.dispatchEvent(new CustomEvent("wx:open-support")) },
    { label: "Event", icon: MI("event"), href: "/events" },
    { label: "Reward Feedback", icon: MI("reward_feedback"), href: "/feedback" },
    { label: "Security Center", icon: MI("security_center"), href: "/player/profile/security" },
    ...(!installed ? [{ label: "APP Download", icon: MI("app_download"), run: () => window.dispatchEvent(new CustomEvent("wx:install-now")) }] : []),
    { label: "Profile", icon: MI("profile"), href: "/player/profile" },
    { label: "Statement", icon: MI("statement"), href: "/player/history" },
    { label: "Bet record", icon: MI("bet_record"), href: "/player/records" },
    { label: "Report", icon: MI("report"), href: "/player/records" },
    { label: "Unclaimed", icon: MI("unclaimed"), href: "/player/deposit" },
    { label: "Manage withdrawal", icon: MI("manage_withdrawal"), href: "/player/withdraw" },
    { label: "Language", icon: MI("language"), run: lang },
    { label: "Fund", icon: MI("fund"), href: "/player/deposit", tag: "5%" },
    { label: "Share", icon: MI("share"), run: share },
    { label: "Recent", icon: MI("recent"), href: "/games-all" },
    { label: "Favorites", icon: MI("favorites"), href: "/games-all" },
    { label: "Lucky draw", icon: MI("lucky_draw"), href: "/promo" },
    { label: "History", icon: MI("history"), href: "/player/history" },
  ];
  void unclaimed;
  const cell = "relative flex min-w-0 flex-col items-center gap-1 rounded-lg px-0.5 py-1.5 text-center text-[11px] leading-tight text-white active:bg-white/10";
  return (
    <>
      <button type="button" aria-label="Close More menu" className="fixed inset-0 z-40 cursor-default" onClick={onClose} />
      <div className="absolute right-0 top-full z-50 mt-1.5 w-[min(94vw,360px)] rounded-xl border border-[#ffc933]/40 bg-[#1a0f33] p-2 shadow-2xl">
        <div className="grid grid-cols-5 gap-x-0.5 gap-y-1.5">
          {items.map((it) => {
            const inner = (<>{it.icon}<span className="w-full break-words">{it.label}</span>{it.tag && <span className="absolute right-1 top-0 rounded-full bg-emerald-500 px-1 text-[9px] font-bold leading-[14px] text-white">{it.tag}</span>}</>);
            return it.href
              ? <Link key={it.label} href={it.href} onClick={(event) => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) onNavigate(); }} className={cell}>{inner}</Link>
              : <div key={it.label} role="button" tabIndex={0} onClick={() => { onClose(); it.run?.(); }} className={`${cell} cursor-pointer`}>{inner}</div>;
          })}
        </div>
      </div>
    </>
  );
}

const MOB = ["max-md:row-span-2", "", "", "", "", "", "", "max-md:col-span-2"];
const DESK = [
  "md:col-span-6 md:col-start-7 md:row-start-1 md:row-span-2",
  "md:col-span-3 md:col-start-1 md:row-start-2",
  "md:col-span-3 md:col-start-4 md:row-start-2",
  "md:col-span-3 md:col-start-1 md:row-start-3",
  "md:col-span-3 md:col-start-4 md:row-start-3",
  "md:col-span-2 md:col-start-7 md:row-start-3",
  "md:col-span-2 md:col-start-9 md:row-start-3",
  "md:col-span-2 md:col-start-11 md:row-start-3",
];

function MobileUserCard({ viewer }: { viewer: Viewer }) {
  const [more, setMore] = useState(false);
  const [bal, setBal] = useState<number | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [spin, setSpin] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const restore = () => {
      const saved = window.history.state?.wxLobbyMore;
      if (!saved || typeof saved.y !== "number") return;
      setMore(true);
      window.scrollTo({ top: saved.y, behavior: "instant" });
    };
    const frame = requestAnimationFrame(restore);
    window.addEventListener("popstate", restore);
    window.addEventListener("pageshow", restore);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("popstate", restore); window.removeEventListener("pageshow", restore); };
  }, []);
  const rememberMore = () => {
    window.history.replaceState({ ...window.history.state, wxLobbyMore: { y: window.scrollY } }, "");
    setMore(false);
  };
  const closeMore = () => {
    setMore(false);
    if (window.history.state?.wxLobbyMore) {
      const state = { ...window.history.state };
      delete state.wxLobbyMore;
      window.history.replaceState(state, "");
    }
  };
  useEffect(() => { getCurrentUser().then((u) => { if (u && isAvatar(u.avatar)) setAvatar(u.avatar); }).catch(() => { }); }, []);
  const shown = bal ?? viewer.balance ?? 0;
  const withdrawTile = "flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#0f766e] via-[#059669] to-[#22c55e] text-white ring-1 ring-[#6ee7b7]/70";
  const refresh = async () => {
    if (spin) return;
    setSpin(true);
    try { const u = await getCurrentUser(true); if (u) setBal(u.balance); } catch { }
    setTimeout(() => setSpin(false), 500);
  };
  const copy = () => {
    try { void navigator.clipboard?.writeText(viewer.name ?? ""); } catch { }
    setCopied(true); setTimeout(() => setCopied(false), 1200);
  };
  const tile = "flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#e11d48] via-[#7c1d6f] to-[#1d4ed8] text-white ring-1 ring-[#ffc933]/70";
  const moreTile = "flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#7c3aed] via-[#4f46e5] to-[#3730a3] text-white ring-1 ring-[#c4b5fd]/70";
  const shortcut = "m-0 grid h-[52px] min-h-[52px] w-11 grid-rows-[36px_12px] justify-items-center gap-1 self-start !p-0 whitespace-nowrap text-center text-[9px]! leading-none sm:text-[10px]!";
  return (
    <div className="relative flex w-full items-center gap-2 rounded-xl bg-black/30 p-2 ring-1 ring-[#3a2470] sm:w-auto sm:min-w-[400px] sm:shrink-0">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#e50539] text-base font-black text-white ring-1 ring-[#ffc933]/70">
          {avatar ? <img src={avatarSrc(avatar)} alt="" width={44} height={44} draggable={false} className="h-full w-full object-cover" /> : (viewer.name || "U").charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[12px] font-semibold leading-4 text-white">
            <span className="truncate">{viewer.name}</span>
            <span role="button" tabIndex={0} aria-label="Copy name" onClick={copy} className="shrink-0 cursor-pointer text-slate-300">{copied ? <span className="text-[10px] text-emerald-300">Copied</span> : <Copy size={13} />}</span>
          </div>
          <div className="whitespace-nowrap text-[9px] font-medium leading-3 text-slate-300">Credit Score: <span className="text-emerald-300">100</span></div>
      <div className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full border border-[#ffc933]/45 bg-black/30 px-1 py-0.5">
        <PkFlag className="h-4 w-4" />
        <span className="min-w-0 break-all text-[11px] font-bold leading-4 tabular-nums text-[#ffcf4a] min-[380px]:text-[12px]">PKR: {Number(shown).toLocaleString("en-PK", { maximumFractionDigits: 2 })}</span>
        <button type="button" aria-label="Refresh balance" onClick={() => void refresh()} className="flex h-4 w-4 shrink-0 items-center justify-center text-white"><RefreshIcon size={12} className={spin ? "animate-spin" : ""} /></button>
      </div>
      </div>
      </div>
      <div className="grid shrink-0 grid-cols-3 items-start gap-1 text-center text-[9px] leading-none text-slate-200 sm:gap-2 sm:text-[10px]">
        <Link href="/player/deposit" className={`${shortcut} relative`}><span className="absolute -right-1 -top-2 rounded-full bg-[#ff3b30] px-1 text-[8px] font-bold leading-[13px] text-white">5%</span><span className={tile}><WalletIcon size={18} /></span><span className="flex h-3 items-center justify-center leading-3">{t0("Deposit")}</span></Link>
        <Link href="/player/withdraw" className={shortcut}><span className={withdrawTile}><BanknoteIcon size={18} /></span><span className="flex h-3 items-center justify-center leading-3">{t0("Withdraw")}</span></Link>
        <button type="button" aria-expanded={more} aria-label="More" onClick={() => more ? closeMore() : setMore(true)} className={`${shortcut} !min-h-0 !p-0 appearance-none border-0 bg-transparent text-inherit`}><span className={moreTile}><LayoutGrid size={17} /></span><span className="flex h-3 items-center justify-center leading-3">{t0("More")}</span></button>
      </div>
      {more && <MoreMenu onClose={closeMore} onNavigate={rememberMore} unclaimed={0} />}
    </div>
  );
}
const t0 = (s: string) => s;

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const img = size === "lg" ? "h-14 w-14" : size === "sm" ? "h-8 w-8" : "h-6 w-6 sm:h-10 sm:w-10";
  const txt = size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-sm sm:text-xl";
  return (
    <Link href="/" className="flex items-center gap-2">
      <BrandLogo className={`${img} shrink-0 object-contain drop-shadow-[0_0_12px_rgba(255,184,0,.55)]`} />
      <span className={`${txt} font-extrabold uppercase leading-none tracking-[0.08em] [font-family:Inter,'Segoe_UI',system-ui,sans-serif]`}>
        <span className="text-gold-grad">Winko</span><span className="bg-gradient-to-b from-[#ff5a7a] to-[#e50539] bg-clip-text text-transparent">X</span>
      </span>
    </Link>
  );
}

export function Header({ viewer, active = "home", showAnnouncement = true }: { viewer: Viewer; active?: "home" | "promo" | "games"; showAnnouncement?: boolean }) {
  const { t } = useI18n();
  const dep = viewer.loggedIn ? "/player/deposit" : "/login";
  const prof = viewer.isAdmin ? "/admin" : viewer.loggedIn ? "/player" : "/login";
  const navCls = (k: string) => `relative whitespace-nowrap px-3 py-2 text-sm font-semibold tracking-wide transition lg:px-3.5 after:absolute after:inset-x-3 after:-bottom-[9px] after:h-[2px] after:rounded-full after:bg-gradient-to-r after:from-[#ffc933] after:via-[#f472b6] after:to-[#a78bfa] after:transition-transform after:duration-300 ${active === k ? "text-white after:scale-x-100" : "text-[#b9b0d6] after:scale-x-0 hover:text-white hover:after:scale-x-100"}`;
  const navLink = "relative hidden whitespace-nowrap px-3 py-2 text-sm font-semibold tracking-wide text-[#b9b0d6] transition hover:text-white lg:inline-flex after:absolute after:inset-x-3 after:-bottom-[9px] after:h-[2px] after:scale-x-0 after:rounded-full after:bg-gradient-to-r after:from-[#ffc933] after:via-[#f472b6] after:to-[#a78bfa] after:transition-transform after:duration-300 hover:after:scale-x-100";
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0716]/90 shadow-[0_6px_24px_rgba(0,0,0,.35)] backdrop-blur-xl">
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[#ffc933] to-transparent opacity-80" />
        <div className={`${CONTAINER} flex min-w-0 items-center justify-between gap-2 px-2 py-1.5 sm:gap-3 sm:px-3 md:py-2.5 lg:px-6`}>
          <div className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-2">
            <span className="[&>button]:h-8 [&>button]:w-8"><Drawer loggedIn={viewer.loggedIn} isAdmin={viewer.isAdmin} name={viewer.name} uid={viewer.uid} balance={viewer.balance} /></span>
            <Logo />
          </div>
          <nav className="hidden items-center gap-0.5 md:flex md:[&>a]:px-2 lg:gap-1 lg:[&>a]:px-1.5 xl:[&>a]:px-3.5">
            <Link href="/" className={navCls("home")}>{t("home")}</Link>
            <Link href="/#games" className={navCls("games")}>{t("games")}</Link>
            <Link href="/promo" className={navCls("promo")}>{t("promo")}</Link>
            <Link href={dep} className={`${navLink} relative`}>{t("deposit")}<span className="absolute -right-1 top-0 rounded-full bg-[#ff3b30] px-1 text-[8px] font-bold leading-[13px] text-white">5%</span></Link>
            <Link href={viewer.loggedIn ? "/player/team" : "/signup"} className={navLink}>{t("invite")}</Link>
            <Link href="/help" className={navLink}>{t("help")}</Link>
          </nav>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <span className="hidden md:inline-flex"><ThemeToggle /></span>
            <span className="hidden md:inline-flex"><LanguageSwitch /></span>
            <span className="hidden h-6 w-px bg-white/15 md:block" />
            <span className="[&>button]:h-8 [&>button]:w-8"><NotificationBell loggedIn={viewer.loggedIn} /></span>
            <button type="button" title="Reload page" aria-label="Reload page" onClick={() => window.location.reload()} className="hidden h-8 w-8 items-center justify-center rounded-full text-white transition hover:text-[#ffc933] sm:flex"><RefreshIcon size={18} /></button>
            <OpenSupportButton className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white hover:text-[#ffc933]"><HeadsetIcon size={19} /></OpenSupportButton>
            <span className="hidden h-6 w-px bg-white/15 md:block" />
            <div className="hidden items-center gap-2 md:flex">
              {viewer.isAdmin
                ? <Link href={prof} className="btn-violet inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold lg:px-4 lg:text-sm">{t("adminPanel")}</Link>
                : <Link href={dep} aria-label={t("deposit")} title={t("deposit")} className="btn-violet relative inline-flex h-9 w-9 items-center justify-center rounded-full"><span className="absolute -right-1.5 -top-2 rounded-full bg-[#ff3b30] px-1.5 text-[9px] font-bold leading-[14px] text-white">5%</span><WalletIcon size={17} /></Link>}
            </div>
            {/* mobile: compact account button */}
            <span className="md:hidden">
              <Link href={viewer.isAdmin ? prof : dep} className="btn-violet relative flex h-8 w-8 items-center justify-center rounded-full" aria-label={viewer.isAdmin ? "Admin panel" : "Deposit"}>{!viewer.isAdmin && <span className="absolute -right-1.5 -top-2 rounded-full bg-[#ff3b30] px-1 text-[8px] font-bold leading-[13px] text-white">5%</span>}{viewer.isAdmin ? <UserIcon size={16} /> : <WalletIcon size={16} />}</Link>
            </span>
          </div>
        </div>
      </header>
      {showAnnouncement && !viewer.isAdmin && <Marquee items={t("marquee")} />}
    </>
  );
}

function SectionTitle({ icon, title, right }: { icon: string; title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-base font-black text-white md:text-lg"><span className="flex h-6 w-6 items-center justify-center text-white md:h-7 md:w-7">{icon === "🔥" ? <FlameIcon size={16} /> : icon}</span>{title}</div>
      {right}
    </div>
  );
}

export function GameCard({ slug, href }: { slug: string; href: string }) {
  const m = GAME_META[slug];
  return (
    <Link href={href} onClick={(event) => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) rememberGameReturn(); }} aria-label={m.label} className="wx-hover group relative block overflow-hidden rounded-2xl border border-[#3a2470] bg-[#1b1038]"><span className="on-image contents">
      <div className="relative aspect-[0.86]">
        <GameThumbnail src={m.img} alt={m.label} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        {m.badge && m.badge !== "HOT" && m.badge !== "NEW" && <span className={`absolute right-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[9px] font-black text-white shadow ${BADGE_STYLE[m.badge]}`}>{m.badge}</span>}
        <GameName name={m.label} className={`${gameLabel.backdrop} absolute inset-x-0 bottom-[-3px] px-1 py-1 text-center md:px-2 md:py-1.5`} />
        <span className="btn-gold absolute left-1/2 top-[70%] flex min-w-[58px] -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-1 whitespace-nowrap rounded-full px-3.5 py-1 text-[10px] font-black opacity-0 transition group-hover:opacity-100"><PlayIcon size={10} /> PLAY</span>
      </div>
    </span>
    </Link>
  );
}

export function BottomNav({ viewer, active }: { viewer: Viewer; active: "home" | "promo" | "invite" | "deposit" | "profile" }) {
  const { t } = useI18n();
  const dep = viewer.loggedIn ? "/player/deposit" : "/login";
  const prof = viewer.isAdmin ? "/admin" : viewer.loggedIn ? "/player/profile" : "/login";
  const item = (key: typeof active, href: string, icon: ReactNode, label: string) => (
    <Link href={href} className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold min-[380px]:text-[11px] ${active === key ? "text-[#ffb800]" : "text-[#b8a7e6]"}`}>
      <span className="leading-none">{icon}</span><span className="w-full truncate text-center">{label}</span>
    </Link>
  );
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 md:hidden">
      <div className="mx-auto flex w-full max-w-[560px] items-end border-t border-[#3a2470] bg-[#140c2a]/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,.5)] backdrop-blur">
        {item("home", "/", <HomeIcon size={22} />, t("home"))}
        {item("promo", "/promo", <GiftIcon size={22} />, t("promo"))}
        <Link href={viewer.loggedIn ? "/player/team" : "/signup"} className="relative -top-4 flex min-w-0 flex-1 flex-col items-center text-[10px] font-semibold text-white min-[380px]:text-[11px]">
          <span className="btn-gold flex h-12 w-12 items-center justify-center rounded-full ring-4 ring-[#0b0716] min-[380px]:h-14 min-[380px]:w-14"><UsersIcon size={24} /></span>
          <span className="mt-0.5">{t("invite")}</span>
        </Link>
        {item("deposit", dep, <WalletIcon size={22} />, t("deposit"))}
        {item("profile", prof, <UserIcon size={22} />, t("profile"))}
      </div>
    </nav>
  );
}

/* ---------------- Leaderboard Component ---------------- */
function PodiumRankImage({ rank, champion }: { rank: number; champion: boolean }) {
  const [failed, setFailed] = useState(false);
  const size = champion ? "h-16 w-24 sm:h-24 sm:w-32" : "h-14 w-20 sm:h-20 sm:w-28";
  const image = rank === 1
    ? "/Top_3_Leaderboard_Ranks/01_CHAMPION_Gold.png"
    : rank === 2
      ? "/Top_3_Leaderboard_Ranks/02_ELITE_Silver_Blue.png"
      : "/Top_3_Leaderboard_Ranks/03_MASTER_Bronze.png";
  return (
    <div className={`flex ${size} items-center justify-center`}>
      {!failed
        ? <img src={image} alt={`Rank ${rank}`} className="h-full w-full object-contain" onError={() => setFailed(true)} />
        : <span aria-label={`Rank ${rank}`} className="text-4xl leading-none">{rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}</span>}
    </div>
  );
}

function LeaderboardCard({ rows }: { rows: Row[] }) {
  const topRows = rows.slice(0, 3);
  const podium = [topRows[1], topRows[0], topRows[2]].filter((row): row is Row => Boolean(row));

  return (
    <section className="wx-winners-card relative overflow-hidden rounded-2xl border border-white/10 bg-[#0d0a1c] p-3 shadow-[0_10px_40px_rgba(0,0,0,.45)] md:p-6 lg:col-span-7">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#ffc933]/70 to-transparent" />

      {/* Header */}
      <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3 md:mb-6">
        <div className="flex items-center gap-2.5">
          <TrophyIcon size={22} className="text-[#ffc933]" />
          <div>
            <h3 className="text-base font-black leading-none tracking-wide text-white sm:text-lg">Leaderboard</h3>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#9d93c4]">Top winners today</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[.04] px-2.5 py-1 text-[10px] font-bold text-[#cfc7ee]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />Live</span>
      </div>

      {/* Top 3 rank grid */}
      <div className="flex items-end justify-center gap-2 pt-2 pb-5 sm:gap-4 md:pb-8">
        {podium.map((row) => {
          const rank = topRows.indexOf(row) + 1;
          const champion = rank === 1;
          const tone = rank === 1
            ? { ring: "from-[#f5c451] via-[#ffe08a] to-[#b8860b]", text: "text-[#f5c451]", label: "text-[#3b2a00]" }
            : rank === 2
              ? { ring: "from-[#e5e7eb] via-[#cbd5e1] to-[#94a3b8]", text: "text-slate-200", label: "text-slate-900" }
              : { ring: "from-[#f0a56b] via-[#cd7f32] to-[#8a4b1a]", text: "text-[#e0a070]", label: "text-[#2b1606]" };
          return <div key={`${rank}-${row.name}`} className={`flex min-w-0 flex-1 basis-0 flex-col items-center ${champion ? "max-w-[9rem]" : "max-w-[7.5rem]"}`}>
            <div className="relative">
              {champion && <CrownIcon size={22} className="absolute -top-5 left-1/2 -translate-x-1/2 text-[#f5c451]" />}
              <PodiumRankImage rank={rank} champion={champion} />
            </div>
            <div className="mt-1 w-full truncate text-center text-xs font-bold text-slate-200">{row.name}</div>
            <div className={`mt-0.5 flex items-center gap-0.5 text-[11px] font-extrabold ${tone.text}`}><ArrowUp size={11} strokeWidth={3} />{row.amount.toLocaleString("en-US")}</div>
          </div>;
        })}
        {rows.length === 0 && <div className="py-10 text-sm text-slate-500">Leaderboard is being updated.</div>}
      </div>

    </section>
  );
}

/* ---------------- full lobby ---------------- */
export function Lobby({ viewer, cat, links = {}, leaderboard = [], showHeader = true, catalog }: { viewer: Viewer; cat: string; links?: Links; leaderboard?: Row[]; showHeader?: boolean; catalog?: ProviderCatalogState }) {
  const installed = useAppInstalled();
  const { t, locale } = useI18n();
  void cat;
  const wa = links.whatsapp || BRAND.whatsapp; const tg = links.telegram || BRAND.telegram;
  const slides: Slide[] = SLIDES.map((sl, i) => ({
    ...sl, kicker: t(`b${i + 1}k` as "b1k"), title: t(`b${i + 1}t` as "b1t"), sub: t(`b${i + 1}s` as "b1s"),
    cta: [t("registerNow"), t("playNow"), t("joinTable"), t("viewPromo")][i],
    ...(i === 1 || i === 2 ? {
      href: "/games-all", img: "/lobby/01_All_Games.png", kicker: "Provider games",
      title: "Explore |provider games|", sub: "Browse games enabled for your account", cta: t("playNow"),
    } : {}),
  }));

  return (
    <div className="wx-lobby wx-bg min-h-[100dvh] text-white">
      {showHeader && <Header viewer={viewer} active="home" showAnnouncement={false} />}
      <main className={`${CONTAINER} grid grid-cols-2 gap-2 px-2 pb-28 pt-2 md:block md:space-y-5 [&>*]:min-w-0 [&>*:not(.wx-half)]:col-span-2 sm:[&>.wx-half]:col-span-2 md:px-4 md:pb-12 lg:px-6`}>
        <BannerCarousel slides={slides} />

        {viewer.loggedIn && !viewer.isAdmin && <div className="wx-card order-1 rounded-2xl p-2 sm:hidden"><Marquee items={t("marquee")} /></div>}

        {/* marquee + auth */}
        <section className={`wx-card wx-half order-3 flex ${viewer.loggedIn ? "flex-col-reverse justify-center items-stretch" : "flex-row justify-start items-center max-md:order-1 max-md:col-span-2"} sm:flex-row sm:justify-start sm:items-center gap-2 sm:gap-3 md:gap-4 rounded-2xl p-2 sm:p-3 md:order-none md:p-4 ${viewer.loggedIn && !viewer.isAdmin ? "max-sm:order-2 max-sm:col-span-2" : ""}`}>
          {!viewer.isAdmin && <div className={`${viewer.loggedIn ? "hidden sm:block" : ""} min-w-0 w-full flex-1`}>
            <Marquee items={t("marquee")} />
          </div>}

          {viewer.loggedIn && !viewer.isAdmin && <MobileUserCard viewer={viewer} />}
          {viewer.loggedIn ? (
            <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/30 px-3 py-2 ring-1 ring-[#3a2470] md:shrink-0 md:flex-nowrap md:gap-6 md:px-4 md:py-2.5 ${viewer.isAdmin ? "" : "hidden"}`}>
              <div className="min-w-0"><div className="truncate text-[11px] text-[#b8a7e6]">{t("welcome")}, {viewer.name}</div>{viewer.isAdmin && viewer.uid && <div className="truncate text-[10px] text-[#b8a7e6]">ID: <span className="font-mono text-white">{viewer.uid}</span></div>}<div className="break-words text-lg font-black text-[#ffb800]">{viewer.isAdmin ? "Admin" : `Rs. ${(viewer.balance ?? 0).toLocaleString()}`}</div></div>
              <div className="flex w-full flex-row gap-1.5 sm:w-auto sm:gap-2">
                {viewer.isAdmin ? <Link href="/admin" className="btn-violet rounded-full px-5 py-2 text-sm font-bold">{t("adminPanel")}</Link> : (
                  <>
                    <Link href="/player/deposit" className="btn-gold wx-wbtn relative inline-flex min-w-0 flex-1 items-center justify-center gap-1 !whitespace-nowrap ![overflow-wrap:normal] rounded-full px-2 py-2 text-center text-[11px] font-black tracking-normal min-[380px]:gap-1.5 min-[380px]:px-3 min-[380px]:text-xs sm:px-4 sm:text-sm"><span className="absolute -right-1 -top-2 rounded-full bg-[#ff3b30] px-1 text-[8px] font-bold leading-[13px] text-white">5%</span><WalletIcon size={15} className="shrink-0" />{t("deposit")}</Link>
                    <Link href="/player/withdraw" className="btn-outline wx-wbtn inline-flex min-w-0 flex-1 items-center justify-center gap-1 !whitespace-nowrap ![overflow-wrap:normal] rounded-full px-2 py-2 text-center text-[11px] font-bold min-[380px]:gap-1.5 min-[380px]:px-3 min-[380px]:text-xs sm:px-4 sm:text-sm"><BanknoteIcon size={15} className="shrink-0" />{t("withdraw")}</Link>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex w-auto shrink-0 items-center justify-end gap-2">
              <Link
                href="/signup"
                className="btn-gold flex h-8.5 sm:h-10 flex-initial min-w-[64px] sm:min-w-[96px] px-2 sm:px-5 shrink-0 items-center justify-center whitespace-nowrap rounded-full text-center text-xs sm:text-sm font-black active:scale-95 transition"
              >
                {t("register")}
              </Link>
              <Link
                href="/login"
                className="btn-outline flex h-8.5 sm:h-10 flex-initial min-w-[64px] sm:min-w-[96px] px-2 sm:px-5 shrink-0 items-center justify-center whitespace-nowrap rounded-full text-center text-xs sm:text-sm font-bold active:scale-95 transition"
              >
                {t("login")}
              </Link>
            </div>
          )}
        </section>


        <section className="hidden space-y-2 md:block">
          <div className="flex items-center gap-2 px-1 text-xs font-bold text-[#b8a7e6]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#22c55e]" />{t("liveWins")}</div>
          <WinnersTicker />
        </section>

        {/* jackpot + game directory */}
        <div className="contents md:grid md:auto-rows-[120px] md:grid-cols-12 md:gap-3 md:space-y-0 lg:auto-rows-[140px]">
          <div className="order-2 col-span-2 grid grid-cols-2 gap-2 md:contents">
          <Link href="/#games" className="on-image wx-half relative block overflow-hidden rounded-2xl border border-[#ffb800]/40 max-md:col-span-2 md:order-none md:col-span-6 md:col-start-1 md:row-start-1">
            <img src="/lobby/04_Jackpot_No_Amount_1024x765.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-right" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#2e1065] via-[#2e1065]/80 to-transparent" />
            <div className="relative flex h-full min-h-[104px] flex-col justify-center p-2 sm:p-3 md:h-full md:min-h-0 md:p-3">
              <span className="flex items-center gap-1.5 text-xs font-bold sm:text-sm"><FlameIcon size={16} />{t("hotJackpot")}</span>
              <div className="text-gold-grad glow-gold mt-1.5 text-xl font-black italic tracking-wide sm:mt-2 sm:text-3xl lg:text-3xl">{t("jackpot")}</div>
              <div className="mt-1.5 w-max max-w-full rounded-lg border border-[#ffb800]/60 bg-black/60 px-2 py-1 text-[11px] font-black text-[#ffe9a3] sm:mt-2 sm:px-3 sm:text-lg lg:text-xl">PKR <JackpotCounter start={3_301_222_743} /></div>
            </div>
          </Link>
          <section className="col-span-2 space-y-2 md:hidden">
            <div className="flex items-center gap-2 px-1 text-xs font-bold text-[#b8a7e6]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#22c55e]" />{t("liveWins")}</div>
            <WinnersTicker />
          </section>
          <section className="contents">
            {CATS.map((c, i) => (
              <Link key={c.key} href={`/games-all?cat=${encodeURIComponent(c.key)}`} className={`on-image relative block min-w-0 min-h-[92px] overflow-hidden rounded-xl border border-[#8b5cf6]/40 md:min-h-0 ${MOB[i] ?? ""} ${DESK[i] ?? ""}`}>
                <img src={c.img} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <span className={`${gameLabel.label} relative flex items-center gap-1 whitespace-nowrap p-2 text-[13px] !font-black text-white [&>svg]:shrink-0 lg:p-3 lg:text-base`}>{CAT_ICONS[c.key]}{c.label}</span>
              </Link>
            ))}
          </section>
          </div>
          <section className="wx-card order-6 flex flex-col justify-center gap-2 rounded-2xl border border-[#8b5cf6]/40 p-3 hidden md:order-none md:col-span-7 md:min-h-0 md:gap-3 md:p-7">
            <span className="flex h-8 w-8 items-center justify-center text-white md:h-10 md:w-10"><GamepadIcon size={24} /></span>
            <div><h2 className="text-lg font-black text-white">All Games</h2><p className="mt-1 text-sm text-[#b8a7e6]">Browse every game by category.</p></div>
            <Link href="/games-all" className="btn-violet w-max rounded-full px-4 py-2 text-sm font-bold">Explore all games ›</Link>
          </section>
        </div>

        {/* games grid */}
        <section id="games" className="wx-card order-5 scroll-mt-16 space-y-2 rounded-2xl p-2.5 md:order-none md:space-y-3 md:p-4">
          <SectionTitle icon="🔥" title={t("games")} right={<Link href="/games-all" className="rounded-full bg-[#8b5cf6]/20 px-3 py-1 text-xs font-bold text-[#c4b5fd] ring-1 ring-[#8b5cf6]/40 hover:bg-[#8b5cf6]/30">{t("viewAll")} ›</Link>} />
          <GregmornGames lobby catalog={catalog} />
        </section>


        {/* why us */}
        <section className="order-6 grid grid-cols-1 gap-2 md:order-none min-[400px]:grid-cols-2 md:grid-cols-4 md:gap-3">
          {([[<ZapIcon key="z" size={20} />, t("instantDeposit"), t("instantDepositSub")], [<BanknoteIcon key="b" size={20} />, t("fastWithdraw"), t("fastWithdrawSub")], [<ShieldIcon key="s" size={20} />, t("secure"), t("secureSub")], [<HeadsetIcon key="h" size={20} />, t("liveSupport"), t("supportSub")]] as [ReactNode, string, string][]).map(([i, tt, d]) => (
            <div key={tt} className="wx-card flex items-center gap-2.5 rounded-2xl p-2.5 md:gap-3 md:p-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center text-white md:h-10 md:w-10">{i}</span>
              <div><div className="text-sm font-black">{tt}</div><div className="text-[11px] text-[#b8a7e6]">{d}</div></div>
            </div>
          ))}
        </section>

        {/* leaderboard + app */}
        <div className="order-6 space-y-2 md:order-none lg:grid lg:grid-cols-12 lg:gap-4 lg:space-y-0">

          <LeaderboardCard rows={leaderboard} />

          {!installed && <section className="space-y-2 lg:col-span-5"><div className="flex items-center gap-2 px-1 text-sm font-bold"><DownloadIcon size={16} />{t("appDownload")}</div><div className="on-image relative overflow-hidden rounded-2xl border border-[#3a2470] bg-gradient-to-br from-[#3b0764] via-[#1b1038] to-[#0b0716] p-4 lg:flex lg:h-[calc(100%-2rem)] lg:items-center"><div className="flex items-center gap-4 lg:w-full lg:gap-6"><div className="relative h-36 w-20 shrink-0 overflow-hidden rounded-[14px] border-4 border-[#241546] bg-black shadow-xl"><img src="/lobby/04_Jackpot_No_Amount_1024x765.jpg" alt="" className="h-full w-full object-cover" /></div><div className="flex-1 space-y-2"><div className="text-sm font-black">{t("getApp")}</div><p className="text-[11px] text-[#b8a7e6]">{t("getAppSub")}</p><InstallApp androidUrl={links.androidUrl || undefined} iosUrl={links.iosUrl || undefined} /></div></div></div></section>}
        </div>

        {/* footer */}
        <footer className="wx-card order-7 md:order-none space-y-2.5 rounded-2xl p-3 text-center md:space-y-5 md:p-6">
          <div className="flex flex-col items-center gap-1.5">
            <Logo size="sm" />
            <p className="max-w-md text-[10px] leading-snug text-[#9d93c4] md:text-xs">{t("tagline")} — {BRAND.domain}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px] md:mx-auto md:max-w-3xl md:gap-8 md:text-sm">
            {([
              ["Casino", t("casino"), ["/mission", "/rebate", "/vip", "/invite", "/event", "/fund"], t("footerCasino")],
              ["Games", t("games"), ["/#games", "/games-all?cat=Cards", "/games-all?cat=Mini%20Games", "/games-all?cat=Slot", "/games-all?cat=Live", "/games-all?cat=Fishing", "/games-all?cat=Sports", "/games-all?cat=Lottery"], [t("hotLabel"), t("cards"), t("miniGames"), t("slot"), t("liveCasino"), t("fishing"), t("sports"), t("lottery")]],
              ["Support", t("support"), ["/support", "/help", "/feedback", "/terms", "/privacy", "/responsible-gaming"], [...t("footerSupport"), ...(locale === "ur" ? ["شرائط و ضوابط", "پرائیویسی پالیسی", "ذمہ دارانہ گیمنگ"] : ["Terms & Conditions", "Privacy Policy", "Responsible Gaming"])]],
            ] as [string, string, string[], string[]][]).map(([key, h, hrefs, labels]) => (
              <div key={key}>
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-white md:text-sm">{h}</div>
                <ul className="space-y-1 md:space-y-1.5">{hrefs.map((href, idx) => <li key={href}><Link href={href} className="block leading-snug text-[#9d93c4] hover:text-white">{labels[idx]}</Link></li>)}</ul>
              </div>
            ))}
          </div>
          <div className="md:grid md:grid-cols-2 md:gap-6">
            <div className="border-t border-white/10 pt-3"><Link href="/license" className="text-[11px] text-[#9d93c4] hover:text-white md:text-sm">{t("licenseCompliance")}</Link><Link href="/license" className="mx-auto mt-1.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#ff3b5c] text-[10px] font-black text-[#ff3b5c]">18+</Link></div>
            <div className="mt-3 border-t border-white/10 pt-3 md:mt-0"><div className="text-[11px] text-[#9d93c4] md:text-sm">{t("contactUs")}</div>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <a href={wa} target="_blank" rel="noreferrer" title="WhatsApp" className="wx-social hover:!border-[#25d366] hover:!text-[#25d366]"><WhatsAppIcon size={18} /></a>
                <a href={tg} target="_blank" rel="noreferrer" title="Telegram" className="wx-social hover:!border-[#229ED9] hover:!text-[#229ED9]"><TelegramIcon size={18} /></a>
                <OpenSupportButton className="wx-social hover:!border-[#ffc933] hover:!text-[#ffc933]"><HeadsetIcon size={17} /></OpenSupportButton>
                {links.facebook && <a href={links.facebook} target="_blank" rel="noreferrer" title="Facebook" className="wx-social hover:!border-[#1877f2] hover:!text-[#1877f2]"><FacebookIcon size={18} /></a>}
                {links.instagram && <a href={links.instagram} target="_blank" rel="noreferrer" title="Instagram" className="wx-social hover:!border-[#dd2a7b] hover:!text-[#dd2a7b]"><InstagramIcon size={18} /></a>}
                {links.youtube && <a href={links.youtube} target="_blank" rel="noreferrer" title="YouTube" className="wx-social hover:!border-[#ff0000] hover:!text-[#ff4040]"><YouTubeIcon size={18} /></a>}
              </div>
              {(links.whatsappChannel || links.telegramChannel) && (
                <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
                </div>
              )}
            </div>
          </div>
          <p className="pb-1 text-[10px] text-[#6f5fa3]">© {new Date().getFullYear()} {BRAND.name} · {BRAND.domain} · {t("playResponsibly")}</p>
        </footer >
      </main >
      <TopButton />
      <FloatingActions viewer={viewer} whatsappChannel={links.whatsappChannel} />
      {showHeader && viewer.loggedIn && !viewer.isAdmin && <ReferralCommissionPopup />}
      <SupportWidget userName={viewer.name} />
      <BottomNav viewer={viewer} active="home" />
      {locale === "ur" && <span className="hidden" />}
    </div >
  );
}
