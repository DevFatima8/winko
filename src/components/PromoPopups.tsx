"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { XIcon } from "@/components/Icons";
import { useSession } from "@/lib/useDb";
import { Trophy, Coins, Gift, Wallet, Crown, Gem, Banknote, Volume2, Copy, Check, CalendarDays, RefreshCw, Sparkles, Download, type LucideIcon } from "lucide-react";
import { referralLink } from "@/lib/siteUrl";
import { isAppInstalled, useAppInstalled } from "@/lib/appInstall";
import styles from "./PromoPopups.module.css";

const SEG_MAP: Record<string, LucideIcon> = { coin: Coins, gift: Gift, wallet: Wallet, cash: Banknote, crown: Crown, gem: Gem };
const SegIcon = ({ n, size = 18 }: { n: string; size?: number }) => { const I = SEG_MAP[n] ?? Coins; return <I size={size} strokeWidth={2.2} />; };

/*
 * Promotional popups are shown one after another: guests once per visit, players once per login, never for staff.
 */

/* ---------- shared ---------- */
function Overlay({ children }: { children: ReactNode }) {
  return <div className={`${styles.overlay} wx-promo-overlay fixed inset-0 z-[95] flex items-center justify-center overflow-y-auto bg-black/75 p-4`}>{children}</div>;
}

function CloseBelow({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" aria-label="Close" onClick={onClose} className="mx-auto mt-4 flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/80 bg-black/55 text-white">
      <XIcon size={20} />
    </button>
  );
}

function VipPointsWelcomePopup({ points, onClose }: { points: number; onClose: () => void }) {
  return (
    <Overlay>
      <div className="w-full max-w-sm rounded-2xl border border-emerald-300/40 bg-[#10231e] p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/15 text-amber-300"><Trophy size={32} /></div>
        <h2 className="mt-4 text-2xl font-black text-white">Congratulations!</h2>
        <p className="mt-2 text-sm text-emerald-100">You earned <b className="text-amber-300">{points} VIP bet points</b> for joining.</p>
        <button type="button" onClick={onClose} className="mt-5 w-full rounded-xl bg-emerald-400 px-5 py-3 text-sm font-black text-slate-950">Awesome</button>
      </div>
    </Overlay>
  );
}

/* ---------- 1) Maximum Bonus wheel ---------- */
const SEG_COLORS = ["#ff4d4d", "#ff9f2e", "#ffd12e", "#a8e63a", "#3ddc7a", "#2ad4b0", "#2eb4ff", "#3a6cff", "#7a4dff", "#c44dff", "#ff4dc4", "#ff6a3d"];
const SEG_ICONS = ["coin", "gift", "wallet", "cash", "coin", "crown", "wallet", "gift", "coin", "gem", "cash", "wallet"];

function MaxBonusPopup({ onClose, onNext }: { onClose: () => void; onNext: () => void }) {
  const seg = SEG_COLORS.map((c, i) => `${c} ${i * 30}deg ${(i + 1) * 30}deg`).join(", ");
  return (
    <Overlay>
      <div className="relative w-full max-w-xs pt-12 text-center">
        <button type="button" aria-label="Close" onClick={onClose} className="absolute right-0 top-0 z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/80 bg-black/55 text-white"><XIcon size={18} /></button>
        <div className="text-xl font-black text-white drop-shadow">Maximum Bonus</div>
        <div className="mb-3 text-3xl font-black text-[#ffd12e] drop-shadow">₨1,500.00</div>
        <div className="relative mx-auto h-64 w-64 rounded-full border-[10px] border-[#1d4ed8] shadow-[0_0_45px_rgba(59,130,246,.65)]">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full bg-white" style={{ transform: `translate(-50%,-50%) rotate(${i * 30}deg) translateY(-118px)` }} />
          ))}
          <div className="absolute inset-1 overflow-hidden rounded-full" style={{ background: `conic-gradient(${seg})`, animation: "wxpromo-spin 16s linear infinite" }}>
            {SEG_ICONS.map((ic, i) => (
              <span key={i} className="absolute left-1/2 top-1/2 text-white drop-shadow" style={{ transform: `translate(-50%,-50%) rotate(${i * 30 + 15}deg) translateY(-86px)` }}><SegIcon n={ic} /></span>
            ))}
          </div>
          <div className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-[#1d6ef5] text-white ring-4 ring-[#bcd9ff]">
            <span className="text-2xl font-black leading-none">GO</span>
            <span className="text-xs font-bold">64 x</span>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-center gap-2 text-[#ffd12e]"><Coins size={18} /><Banknote size={18} /><Gem size={18} /><Wallet size={18} /></div>
        <div className="mt-1 text-sm font-bold text-white drop-shadow">You can draw 64 times</div>
        <button type="button" onClick={onNext} className="mt-2 rounded-full bg-gradient-to-b from-[#4aa8ff] to-[#1d6ef5] px-8 py-2 text-sm font-black text-white shadow-lg">Go to the lucky draw</button>
      </div>
    </Overlay>
  );
}

/* ---------- 2) Lucky Draw ---------- */
const DRAW_LABELS = ["0-1,500", "8,000", "0-1,300", "800", "0-1,000", "5,000"];

function LuckyDrawPopup({ onClose, onNext }: { onClose: () => void; onNext: () => void }) {
  const router = useRouter();
  const [left, setLeft] = useState(7 * 3600 + 36 * 60 + 19);
  const [copied, setCopied] = useState(false);
  const [refLink, setRefLink] = useState<string>("https://winkox.shop/signup");
  const [depositPct, setDepositPct] = useState<number>(1.5);

  useEffect(() => {
    const id = window.setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const response = await fetch("/api/public/data?view=invite", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Invite data unavailable.");
        const code = data.referralCode ?? "WINKOX";
        const link = referralLink(code);
        if (!alive) return;
        setRefLink(link);
        setDepositPct(data.depositCommissionPct ?? 1.5);
      } catch {
        if (alive) {
          setRefLink("https://winkox.shop/signup");
          setDepositPct(1.5);
        }
      }
    })();
    return () => { alive = false; };
  }, []);

  const hh = String(Math.floor(left / 3600)).padStart(2, "0");
  const mm = String(Math.floor((left % 3600) / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const seg = Array.from({ length: 6 }, (_, i) => `${i % 2 ? "#5aa0f7" : "#2f7ff0"} ${i * 60}deg ${(i + 1) * 60}deg`).join(", ");

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(refLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  };

  return (
    <Overlay>
      <div className="w-full max-w-sm">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-b from-[#2a7ff0] to-[#1257c4] p-3 shadow-2xl ring-1 ring-white/20">
          <div className="flex items-center gap-2 rounded-full bg-[#0e3f96]/80 px-3 py-1.5 text-[11px] font-bold text-white">
            <Volume2 size={14} />
            <div className="relative flex-1 overflow-hidden whitespace-nowrap" dir="ltr">
              <div className="inline-block pl-[100%]" style={{ animation: "wxpromo-marq 14s linear infinite" }}>
                <bdi>Earn {depositPct}% of each friend&apos;s first approved deposit</bdi>
              </div>
            </div>
            <span className="rounded-full bg-white/20 px-1.5">?</span><Gift size={14} />
          </div>
          <div className="mt-2 text-center text-3xl font-black text-[#ffd12e]">1,453.50</div>
          <div className="mx-auto mt-1 h-2 w-4/5 overflow-hidden rounded-full bg-white/25"><div className="h-full w-[58%] rounded-full bg-[#2ecc40]" /></div>
          <div className="relative mx-auto mt-3 h-60 w-60 rounded-full bg-white p-2 shadow-inner">
            {DRAW_LABELS.map((l, i) => (
              <span key={l} className="absolute left-1/2 top-1/2 text-[10px] font-black text-[#1257c4]" style={{ transform: `translate(-50%,-50%) rotate(${i * 60}deg) translateY(-106px) rotate(${-i * 60}deg)` }}>{l}</span>
            ))}
            <div className="relative h-full w-full overflow-hidden rounded-full" style={{ background: `conic-gradient(${seg})` }}>
              {["coin", "wallet", "coin", "wallet", "coin", "wallet"].map((ic, i) => (
                <span key={i} className="absolute left-1/2 top-1/2 text-white drop-shadow" style={{ transform: `translate(-50%,-50%) rotate(${i * 60 + 30}deg) translateY(-64px)` }}><SegIcon n={ic} /></span>
              ))}
            </div>
            <div className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-white text-[#1257c4] shadow">
              <span className="text-xl font-black leading-none">x64</span>
              <span className="text-[11px] font-bold">Free draw</span>
            </div>
          </div>
          <div className="relative z-10 mx-auto -mb-3 mt-2 w-max rounded-md bg-[#e02f2f] px-3 py-1 text-[11px] font-bold text-white shadow">Earn {depositPct}% of each friend&apos;s first approved deposit</div>
          <button type="button" onClick={() => { void copyCode(); }} className="mt-3 w-full rounded-xl bg-white/90 py-3 text-sm font-black text-[#1257c4]">{copied ? "Referral link copied" : "Invite friend, Win bonus"}</button>
          <div className="mt-2 flex items-center justify-between gap-2 px-1 text-[11px] font-bold text-white">
            <button type="button" onClick={copyCode} className="inline-flex max-w-[72%] items-center gap-1 overflow-hidden rounded bg-white/10 px-1.5 py-1 text-left text-[11px] font-bold text-white">
              <span className="truncate">Referral link: {refLink}</span>
              <span className="rounded bg-white/20 px-1">{copied ? <Check size={12} /> : <Copy size={12} />}</span>
            </button>
            <button type="button" onClick={() => router.push("/player/team")} className="rounded bg-white/10 px-2 py-1">My subordinates</button>
          </div>
          <div className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-[#0e3f96]/80 py-2 text-center text-xs font-black text-white"><Sparkles size={13} />Complete tasks for free draws<Sparkles size={13} /></div>
                    <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-white/90 px-3 py-2 text-[11px] font-bold text-[#1257c4]"><CalendarDays size={14} /> Daily Login <span className="text-[#7aa8e8]">Free draw:{hh}:{mm}:{ss}</span></div>
        </div>
        <CloseBelow onClose={onNext} />
      </div>
    </Overlay>
  );
}

/* ---------- 3) First Deposit Extra Reward ---------- */
const TIERS: [number, number][] = [[300, 60], [500, 100], [1000, 200], [3000, 300], [10000, 500], [30000, 1500], [100000, 5000]];

function FirstDepositPopup({ onClose }: { onClose: () => void }) {
  const router = useRouter();

  return (
    <Overlay>
      <div className="w-full max-w-sm">
        <div className="overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="py-3 text-center text-lg font-black text-gray-900">First Deposit Extra Reward</div>
          <div className="mx-3 rounded-xl bg-[#e9f9ef] p-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-base font-black text-gray-900"><Gift size={18} className="text-emerald-600" />Rewards</div>
                <div className="text-[11px] text-gray-500">First deposit reward after registration</div>
              </div>
              <button type="button" onClick={() => router.refresh()} className="inline-flex items-center gap-1 text-sm font-bold text-emerald-500"><RefreshCw size={14} />Refresh</button>
            </div>
            <div className="mt-2 max-h-[42vh] space-y-2 overflow-y-auto pr-1">
              {TIERS.map(([d, b]) => (
                <div key={d} className="flex items-center justify-between rounded-lg bg-[#f2fcf6] px-3 py-2.5 ring-1 ring-emerald-100">
                  <span className="text-sm font-bold text-gray-800">First Deposit ≥ {d.toLocaleString("en-US")}</span>
                  <span className="flex flex-col items-center leading-none">
                    <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#ffd12e] text-sm text-[#7a4a00] ring-2 ring-[#f5a623]"><Coins size={16} /><b className="absolute -right-2.5 -top-2 rounded-full bg-[#ff7a00] px-1 text-[9px] text-white">{b}</b></span>
                    <span className="mt-1 rounded bg-[#20c997] px-1.5 text-[9px] font-black text-white">Bonus</span>
                  </span>
                  <button type="button" onClick={() => { onClose(); router.push(`/player/deposit?amount=${d}`); }} className="rounded-full bg-gradient-to-b from-[#ffa02e] to-[#ff7a00] px-4 py-1.5 text-xs font-black text-white">Deposit</button>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 p-3">
            <button type="button" onClick={() => { onClose(); router.push("/player/history"); }} className="rounded-lg border border-blue-500 bg-white py-2.5 text-sm font-bold text-blue-600">History</button>
            <button type="button" onClick={() => { onClose(); router.push("/player/deposit"); }} className="rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white">View event</button>
          </div>
          <div className="border-t border-gray-100 px-4 py-2.5 text-center text-[11px] text-gray-600">This promotion sequence is shown once per player.</div>
        </div>
        <CloseBelow onClose={onClose} />
      </div>
    </Overlay>
  );
}

/* ---------- 4) Download the APP ---------- */
function AppDownloadPopup({ onClose, onAction }: { onClose: () => void; onAction: (ev: "wx:open-install" | "wx:install-now") => void }) {
  return (
    <Overlay>
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-white/10 bg-[#171122] p-4 shadow-2xl">
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-[#ffd45a] to-[#ff8a00] shadow"><img src="/brand/logo-mark.png" alt="winkox" className="h-9 w-9 object-cover" draggable={false} /></span>
            <p className="text-base font-bold leading-snug text-[#ffb800]">Download the APP to participate in more discounts!</p>
          </div>
          <button type="button" onClick={() => onAction("wx:install-now")} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-[#e11d48] via-[#7c1d6f] to-[#1d4ed8] py-3 text-[14px] font-bold text-white ring-1 ring-[#ffc933]/70"><Download size={16} />Download</button>
        </div>
        <CloseBelow onClose={onClose} />
      </div>
    </Overlay>
  );
}

/* ---------- controller: guests once per visit, players once per login, never staff ---------- */
const LAST = 3;

export function PromoPopups() {
  const installed = useAppInstalled();
  const pathname = usePathname();
  const { user, loading } = useSession();
  const [idx, setIdx] = useState<number | null>(null);
  const [dismissedVipUserId, setDismissedVipUserId] = useState<string | null>(null);
  const shownRef = useRef<string | null>(null);

  const blocked = !!pathname && (pathname.startsWith("/admin") || pathname.startsWith("/games") || pathname.startsWith("/player/games") || pathname === "/login" || pathname === "/signup");
  const isPlayer = user?.role === "client";
  const isStaff = !!user && !isPlayer;
  const showWelcome = isPlayer && user.vipPointsWelcomePending && dismissedVipUserId !== user.id;
  const key = loading || isStaff ? null : isPlayer ? `wx_promo_seen_${user.id}` : "wx_promo_seen_guest";

  useEffect(() => {
    if (blocked || !key || showWelcome) return;
    if (shownRef.current === key) return;
    try { if (sessionStorage.getItem(key) === "1") { shownRef.current = key; return; } } catch { }
    const id = window.setTimeout(() => {
      shownRef.current = key;
      try { sessionStorage.setItem(key, "1"); } catch { }
      setIdx(isAppInstalled() ? 1 : 0);
    }, 800);
    return () => window.clearTimeout(id);
  }, [blocked, key, showWelcome]);

  const next = useCallback(() => setIdx((i) => (i === null || i >= LAST ? null : i + 1)), []);
  const closeWelcome = useCallback(() => {
    if (!user) return;
    setDismissedVipUserId(user.id);
    void fetch("/api/player/vip-points-popup", { method: "POST" });
  }, [user]);
  const installAction = useCallback((ev: "wx:open-install" | "wx:install-now") => {
    setIdx(null);
    window.dispatchEvent(new CustomEvent(ev));
  }, []);
  const visibleIdx = idx === 0 && installed ? 1 : idx;
  const nextVisible = () => setIdx(visibleIdx === null || visibleIdx >= LAST ? null : visibleIdx + 1);

  if (blocked || isStaff) return null;
  if (showWelcome) return <VipPointsWelcomePopup points={100} onClose={closeWelcome} />;
  if (idx === null) return null;
  return (
    <>
      <style>{`@keyframes wxpromo-spin{to{transform:rotate(360deg)}}@keyframes wxpromo-marq{0%{transform:translateX(0)}100%{transform:translateX(-100%)}}`}</style>
      {visibleIdx === 0 ? <AppDownloadPopup onClose={next} onAction={installAction} /> : visibleIdx === 1 ? <MaxBonusPopup onClose={nextVisible} onNext={nextVisible} /> : visibleIdx === 2 ? <LuckyDrawPopup onClose={next} onNext={next} /> : <FirstDepositPopup onClose={next} />}
    </>
  );
}