"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n, Hi } from "../../lib/i18n/client";
import { useRealtime } from "../../components/RealtimeSync";
import { visibleInterval } from "../../lib/visibleInterval";
import { LanguageSwitch } from "../../components/LanguageSwitch";
import { BrandLogo } from "../../components/BrandLogo";
import { Drawer as GlobalDrawer } from "../../components/Drawer";
import { PlayerMenu } from "../../components/PlayerMenu";
import { HomeIcon, FlameIcon, SpadeIcon, GamepadIcon, GiftIcon, WalletIcon, BanknoteIcon, HistoryIcon, BookIcon, UserIcon, MegaphoneIcon, MailIcon, ArrowUpIcon, XIcon, MenuIcon, GlobeIcon, CrownIcon, UsersIcon } from "../../components/Icons";
import type { CSSProperties, ReactNode } from "react";
import { GAME_IMAGES } from "@/lib/gameCatalog";

/* ---------- Banner carousel ---------- */
export type Slide = { img?: string; bg: string; kicker?: string; title: string; sub?: string; href: string; cta: string; emoji?: string };
export function BannerCarousel({ slides }: { slides: Slide[] }) {
  const { isUr } = useI18n();
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % slides.length), 5000);
    return () => clearInterval(id);
  }, [slides.length]);
  return (
    <div className="relative overflow-hidden rounded-2xl border wx-drawer-border shadow-[0_10px_40px_rgba(139,92,246,.35)] md:rounded-3xl" dir="ltr">
      <div className="flex transition-transform duration-700 ease-out" style={{ transform: `translateX(-${i * 100}%)` }}>
        {slides.map((s, k) => (
          <Link key={k} href={s.href} className={`on-image relative block aspect-[2.5/1] w-full shrink-0 md:aspect-[3.2/1] lg:aspect-[3.6/1] ${s.bg}`}>
            {s.img && <img src={s.img} alt="" className={`absolute inset-y-0 h-full w-[62%] object-cover ${isUr ? "left-0 object-right [mask-image:linear-gradient(270deg,transparent,black_35%)]" : "right-0 object-left [mask-image:linear-gradient(90deg,transparent,black_35%)]"}`} />}
            <div className={`absolute inset-0 ${isUr ? "bg-[radial-gradient(circle_at_80%_30%,rgba(255,255,255,.10),transparent_45%)]" : "bg-[radial-gradient(circle_at_20%_30%,rgba(255,255,255,.10),transparent_45%)]"}`} />
            <div dir={isUr ? "rtl" : "ltr"} className={`absolute inset-0 flex flex-col justify-center p-3 pb-5 sm:p-6 lg:p-8 ${isUr ? "items-end text-right" : "items-start"}`}>
              {s.kicker && <span className="mb-1 w-max max-w-[60%] truncate rounded-full bg-black/30 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#ffd45a] ring-1 ring-[#ffb800]/50 sm:mb-2 sm:px-2.5 sm:text-xs">{s.kicker}</span>}
              <h2 className="max-w-[58%] text-[15px] font-black uppercase leading-[1.05] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,.7)] min-[380px]:text-[17px] sm:text-4xl lg:text-5xl">
                <Hi s={s.title} />
              </h2>
              {s.sub && <p className="mt-1 line-clamp-2 max-w-[58%] text-[9px] font-semibold leading-tight wx-rowtext drop-shadow min-[380px]:text-[10px] sm:mt-1.5 sm:text-sm lg:text-base">{s.sub}</p>}
              <span className="btn-gold mt-1.5 w-max rounded-full px-2.5 py-1 text-[9px] font-black sm:mt-3 sm:px-4 sm:py-1.5 sm:text-sm">{s.cta} →</span>
            </div>
            {s.emoji && !s.img && <span className={`absolute top-1/2 -translate-y-1/2 text-[64px] drop-shadow-[0_10px_20px_rgba(0,0,0,.5)] sm:text-[110px] lg:text-[150px] ${isUr ? "left-4 lg:left-12" : "right-4 lg:right-12"}`}>{s.emoji}</span>}
          </Link>
        ))}
      </div>
      <div className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-1.5 sm:bottom-2">
        {slides.map((_, k) => <button key={k} aria-label={`Slide ${k + 1}`} onClick={() => setI(k)} className={`wx-dot h-1.5 rounded-full transition-all ${k === i ? "w-6 bg-[#ffb800]" : "w-1.5 bg-white/50"}`} />)}
      </div>
    </div>
  );
}

/* ---------- Marquee ---------- */
export function Marquee({ items }: { items: string[] }) {
  const { announcement, notification } = useRealtime();
  const [broadcasts, setBroadcasts] = useState<string[]>([]);
  const load = useCallback(async () => {
    const response = await fetch("/api/notifications", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as { items?: { title: string; body: string; audience?: string }[] };
    setBroadcasts((data.items ?? []).filter((item) => item.audience === "all").map((item) => `${item.title}: ${item.body}`));
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const stop = visibleInterval(() => void load(), 120000);
    return () => { window.clearTimeout(initial); stop(); };
  }, [load]);
  const liveBroadcast = notification?.audience === "all" ? `${notification.title}: ${notification.body}` : "";
  const adminLines = announcement.split("\n").map((s) => s.trim()).filter(Boolean);
  const list = adminLines.length ? adminLines : [liveBroadcast, ...broadcasts.filter((item) => item !== liveBroadcast)].filter(Boolean);
  const lines = list.length ? list : items;
  const key = lines.join("\u0001");
  const [tick, setTick] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const idx = tick % lines.length;
  // JS-driven (rAF) so it never depends on CSS animation rules: slide up in, scroll right → left, then next announcement.
  useEffect(() => {
    const box = boxRef.current;
    const el = textRef.current;
    if (!box || !el) return;
    const width = el.scrollWidth;
    const slideMs = tick > 0 ? 550 : 0;
    const holdMs = 600;
    const moveMs = Math.max(3500, (width / 55) * 1000);
    const total = slideMs + holdMs + moveMs;
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const t = now - start;
      if (t < slideMs) {
        const p = 1 - Math.pow(1 - t / slideMs, 3);
        box.style.transform = `translateY(${(1 - p) * 100}%)`;
        box.style.opacity = String(p);
        el.style.transform = "translateX(0)";
      } else {
        box.style.transform = "translateY(0)";
        box.style.opacity = "1";
        const m = Math.min(1, Math.max(0, (t - slideMs - holdMs) / moveMs));
        el.style.transform = `translateX(${-m * width}px)`;
      }
      if (t >= total) { setTick((n) => n + 1); return; }
      raf = requestAnimationFrame(frame);
    };
    box.style.transform = tick > 0 ? "translateY(100%)" : "translateY(0)";
    box.style.opacity = tick > 0 ? "0" : "1";
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [tick, key]);
  return (
    <div className="flex items-center gap-2 rounded-xl bg-black/30 px-3 py-2 ring-1 ring-[#3a2470]">
      <span className="shrink-0 text-[#ffb800]"><MegaphoneIcon size={16} /></span>
      <div className="relative h-6 flex-1 overflow-hidden text-xs font-semibold leading-6 text-white" dir="ltr" aria-live="polite">
        <div ref={boxRef} className="absolute inset-0 flex items-center">
          <span ref={textRef} className="inline-block whitespace-nowrap will-change-transform"><bdi>{lines[idx]}</bdi></span>
        </div>
      </div>
      <Link href="/promo" className="relative shrink-0 rounded-md bg-[#241546] p-1.5 text-[#b8a7e6]">
        <MailIcon size={14} />{lines.length > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ff3b5c] px-1 text-[9px] font-bold text-white">{list.length}</span>}
      </Link>
    </div>
  );
}


/* ---------- Jackpot counter ---------- */
export function JackpotCounter({ start }: { start: number }) {
  const [v, setV] = useState(start);
  useEffect(() => {
    const id = setInterval(() => setV((x) => x + Math.floor(Math.random() * 900) + 50), 700);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums">{v.toLocaleString("en-US")}</span>;
}

/* ---------- Recent settled wins ---------- */
type RecentWin = { id: string; player: string; gameSlug: string; gameName: string; winAmount: number };
export function WinnersTicker() {
  const tickerRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<RecentWin[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let disposed = false;
    let controller: AbortController | null = null;
    const load = async () => {
      if (!tickerRef.current?.getClientRects().length || document.hidden) return;
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      try {
        const response = await fetch("/api/public/data?view=recent-wins", { cache: "no-store", signal: requestController.signal });
        if (!response.ok) throw new Error("Recent wins could not be loaded.");
        const data = await response.json() as { wins?: RecentWin[] };
        if (!disposed) {
          setItems(Array.isArray(data.wins) ? data.wins : []);
          setLoadState("ready");
        }
      } catch {
        if (!disposed && !requestController.signal.aborted) setLoadState("error");
      }
    };
    void load();
    const breakpoint = window.matchMedia("(min-width: 768px)");
    const onBreakpoint = () => void load();
    breakpoint.addEventListener("change", onBreakpoint);
    const stop = visibleInterval(() => void load(), 30000);
    return () => { disposed = true; controller?.abort(); stop(); breakpoint.removeEventListener("change", onBreakpoint); };
  }, []);
  useEffect(() => {
    const ticker = tickerRef.current;
    if (!ticker) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let previous = 0;
    let direction = 1;
    let pausedUntil = 0;
    let dragging = false;
    const pause = () => { pausedUntil = performance.now() + 1800; };
    const onPointerDown = () => { dragging = true; pause(); };
    const onPointerUp = () => { dragging = false; pause(); };
    const move = (now: number) => {
      const elapsed = previous ? Math.min(now - previous, 50) : 0;
      previous = now;
      if (!document.hidden && ticker.getClientRects().length && !reducedMotion.matches && !dragging && now >= pausedUntil && !ticker.matches(":hover, :focus-within")) {
        const max = ticker.scrollWidth - ticker.clientWidth;
        if (max > 0) {
          const next = Math.max(0, Math.min(max, ticker.scrollLeft + direction * elapsed * 0.03));
          ticker.scrollLeft = next;
          if (next >= max || next <= 0) {
            direction *= -1;
            pausedUntil = now + 900;
          }
        }
      }
      frame = requestAnimationFrame(move);
    };
    ticker.addEventListener("pointerdown", onPointerDown);
    ticker.addEventListener("wheel", pause, { passive: true });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    frame = requestAnimationFrame(move);
    return () => {
      cancelAnimationFrame(frame);
      ticker.removeEventListener("pointerdown", onPointerDown);
      ticker.removeEventListener("wheel", pause);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);
  return (
    <div ref={tickerRef} data-winners-ticker className="flex min-h-16 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" dir="ltr">
      {items.map((win) => (
        <div key={win.id} className="flex shrink-0 items-center gap-2 rounded-xl bg-black/30 px-2 py-2 ring-1 ring-[#3a2470]">
          {GAME_IMAGES[win.gameSlug] && <img src={GAME_IMAGES[win.gameSlug]} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg object-cover" />}
          <div className="space-y-0.5 whitespace-nowrap">
            <div className="text-[13px] font-bold leading-4 text-white">{win.player}</div>
            <div className="text-xs font-semibold leading-4 text-[#b8a7e6]">{win.gameName}</div>
            <div className="text-base font-black leading-5 text-[#ffb800]">+Rs. {win.winAmount.toLocaleString("en-PK", { maximumFractionDigits: 2 })}</div>
          </div>
        </div>
      ))}
      {items.length === 0 && <div className="flex min-h-16 w-full items-center justify-center rounded-xl border border-dashed border-[#3a2470] px-3 text-center text-xs text-[#b8a7e6]">
        {loadState === "loading" ? "Loading recent wins…" : loadState === "error" ? "Recent wins could not be loaded." : "No recent wins yet."}
      </div>}
      {items.length > 0 && loadState === "error" && <div role="status" className="flex shrink-0 items-center px-3 text-xs text-red-200">Live Wins could not be refreshed. Showing last loaded results.</div>}
    </div>
  );
}

/* ---------- Leaderboard auto-scroll ---------- */
export type Row = { rank: number; name: string; amount: number; up: boolean };
export function LeaderboardTable({ rows, labels = ["Rank", "Username", "Winnings"] }: { rows: Row[]; labels?: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let y = 0;
    const id = setInterval(() => { y += 1; if (y >= el.scrollHeight / 2) y = 0; el.scrollTop = y; }, 40);
    return () => clearInterval(id);
  }, []);
  const all = [...rows, ...rows];
  return (
    <div className="overflow-hidden rounded-xl border wx-drawer-border">
      <div className="on-image grid grid-cols-[60px_1fr_1fr] bg-gradient-to-r from-[#8b5cf6] to-[#d946ef] px-3 py-1.5 text-center text-xs font-bold text-white"><span>{labels[0]}</span><span>{labels[1]}</span><span>{labels[2]}</span></div>
      <div ref={ref} className="h-32 overflow-hidden bg-black/30 md:h-44 lg:h-52">
        {all.map((r, i) => (
          <div key={i} className="grid grid-cols-[60px_1fr_1fr] border-b wx-drawer-border/60 px-3 py-1.5 text-center text-xs wx-rowtext">
            <span className="font-bold text-white">{r.rank} <span className={r.up ? "text-emerald-400" : "text-[#ff3b5c]"}>{r.up ? "▲" : "▼"}</span></span>
            <span>{r.name}</span>
            <span className="font-semibold text-[#ffb800]">Rs. {r.amount.toLocaleString("en-US")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Side drawer ---------- */
export function Drawer({ loggedIn, isAdmin, name, uid, balance }: { loggedIn: boolean; isAdmin: boolean; name?: string; uid?: string; balance?: number }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const links: [ReactNode, string, string][] = [
    [<HomeIcon key="h" size={18} />, t("home"), "/"], [<FlameIcon key="f" size={18} />, t("hotGames"), "/games-all?cat=Hot"], [<GamepadIcon key="g" size={18} />, t("games"), "/games-all"],
    [<GiftIcon key="p" size={18} />, t("promo"), "/promo"], [<CrownIcon key="v" size={18} />, "VIP", "/vip"], [<UsersIcon key="i" size={18} />, t("invite"), loggedIn ? "/player/team" : "/invite"],
    [<WalletIcon key="d" size={18} />, t("deposit"), loggedIn ? "/player/deposit" : "/login"], [<BanknoteIcon key="w" size={18} />, t("withdraw"), loggedIn ? "/player/withdraw" : "/login"],
    [<HistoryIcon key="b" size={18} />, t("betHistory"), loggedIn ? "/player/history" : "/login"], [<BookIcon key="k" size={18} />, t("helpCenter"), "/help"], [<UserIcon key="u" size={18} />, t("profile"), isAdmin ? "/admin" : loggedIn ? "/player/profile" : "/login"],
  ];
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-lg text-white" aria-label="Menu"><MenuIcon size={24} /></button>
      <GlobalDrawer open={open} onClose={() => setOpen(false)} side="left" showClose={isAdmin} widthClass={!isAdmin ? "w-[62%] min-w-[250px] max-w-[320px]" : undefined}>
        {!isAdmin ? (
          <PlayerMenu guest={!loggedIn} name={name ?? ""} uid={uid} balance={balance} onNavigate={() => setOpen(false)} onLogout={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/login"); }} />
        ) : (<>
        <div className="flex items-center gap-2 p-4 pb-3">
          <BrandLogo className="h-9 w-9" /><span className="text-lg font-black text-gold-grad">winkox</span>
        </div>
        <div className="space-y-2 px-3">
          <div className="wx-chip flex items-center justify-between gap-2 rounded-xl bg-black/30 px-3 py-2 text-[11px] text-[#b8a7e6]"><span className="inline-flex min-w-0 items-center gap-1.5 truncate"><GlobeIcon size={13} className="shrink-0" /> {t("language")}</span><LanguageSwitch compact /></div>
        </div>
        <nav className="mt-3 space-y-0.5 px-3">
          {links.map(([i, l, h], index) => <Link key={l + h} href={h} onClick={() => setOpen(false)} style={{ "--drawer-index": index } as CSSProperties} className="wx-drawer-item flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold wx-rowtext hover:wx-row"><span className="wx-rowicon">{i}</span>{l}</Link>)}
        </nav>
        {!loggedIn && (
          <div className="mt-5 grid grid-cols-2 gap-2 border-t border-white/10 p-4">
            <Link href="/signup" className="btn-gold rounded-xl py-2.5 text-center text-sm font-black">{t("register")}</Link>
            <Link href="/login" className="btn-outline rounded-xl py-2.5 text-center text-sm font-bold">{t("login")}</Link>
          </div>
        )}
        </>)}
      </GlobalDrawer>
    </>
  );
}


/* ---------- TOP button ---------- */
export function TopButton() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const h = () => setShow(window.scrollY > 400);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);
  if (!show) return null;
  return (
    <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="btn-violet fixed bottom-24 right-3 z-40 flex h-11 w-11 items-center justify-center rounded-full md:bottom-6 md:right-6" aria-label="Top"><ArrowUpIcon size={20} /></button>
  );
}

/* ---------- Game category tabs ---------- */
export function GameTabs({ tabs, active, labels = {} }: { tabs: string[]; active: string; labels?: Record<string, string> }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      {tabs.map((t) => (
        <Link key={t} href={`/?cat=${encodeURIComponent(t)}#games`} scroll={false} className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold transition ${active === t ? "btn-violet" : "bg-black/30 text-[#b8a7e6] ring-1 ring-[#3a2470] hover:text-white"}`}>
          {labels[t] ?? t}
        </Link>
      ))}
    </div>
  );
}
