"use client";
import Link from "next/link";
import { GameView, GAME_SLUGS } from "@/components/GameView";
import { Header, BottomNav, CONTAINER } from "@/components/lobby/Lobby";
import { SupportWidget } from "@/components/SupportWidget";
import { Hi, useI18n } from "@/lib/i18n/client";
import { usePage, NOT_FOUND, REDIRECT } from "@/lib/useDb";
import { getCurrentUser } from "@/lib/auth";

export default function PublicGamePageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  const { t, locale } = useI18n();
  void locale;
  void params; void searchParams;
  return usePage(async () => {
    const { slug } = params ?? {};
    if (!GAME_SLUGS.includes(slug)) return NOT_FOUND;
    const me = await getCurrentUser();
    if (me?.role === "client") return REDIRECT(`/player/games/${slug}`);

    const viewer = { loggedIn: !!me, isAdmin: me?.role === "admin", name: me?.name };
    const FRAMED_GAMES = [
      "aviator", "aviator-x", "birds-beasts", "blackjack", "chicken-dash", "mines", "dragon-tiger", "limbo",
      "baccarat", "andar-bahar", "chicken-road-2", "plinko", "lucky-777", "dice", "dream-catcher", "european-roulette",
      "evo-casino", "fishing-arcade", "football-studio", "fortune-gems", "fortune-ox", "fortune-toucan", "gates-of-olympus", "head-tail",
      "muflis", "poker", "rock-paper-scissors", "amar-akbar-anthony", "7-up-down", "nine-wickets", "32-cards", "auto-roulette",
      "blast-off", "bollywood-casino", "casino-war", "crash-bonus", "crash-cricket", "crash-goal", "derby-race", "diao-chan",
      "hotline", "keno", "lightning-roulette", "ludo", "mini-roulette", "monster-hilo", "poker-betting", "poker-roulette",
      "race-betting", "red-vs-black", "rummy", "sic-bo", "speed-baccarat", "super-fruits", "sweet-bonanza", "tai-xiu",
      "teen-patti", "teen-patti-999", "teen-patti-ak47", "teen-patti-best-of-four", "teen-patti-faceoff", "teen-patti-hukam", "teen-patti-joker", "texas-holdem",
      "thai-hi-lo", "three-card-poker", "three-cards", "tower-betting", "treasure-bowl", "wheel-betting"
    ];
    const isFramedGame = FRAMED_GAMES.includes(slug);

    if (isFramedGame) {
      return (
        <>
          <div className="wx-bg fixed top-0 left-0 right-0 bottom-[calc(86px+env(safe-area-inset-bottom,0px))] md:bottom-0 z-30 flex h-[calc(100dvh-86px-env(safe-area-inset-bottom,0px))] md:h-[100dvh] w-full flex-col overflow-hidden bg-[#07090e] px-1 pt-1 pb-0 sm:p-2 md:p-3 text-white select-none">
            {!viewer.loggedIn && (
              <div className="mb-1 mx-auto flex w-full max-w-[1440px] shrink-0 items-center justify-between rounded-lg border border-[#3a2470]/60 bg-[#140c2a]/95 px-3 py-1 text-xs text-[#ffe0a3]">
                <span className="truncate text-[11px] sm:text-xs">
                  <Hi s={t("demoBar")} cls="font-black text-white" />
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Link href="/login" className="btn-outline rounded px-2 py-0.5 text-[11px] font-bold">
                    {t("login")}
                  </Link>
                  <Link href="/signup" className="btn-gold rounded px-2 py-0.5 text-[11px] font-black">
                    {t("register")}
                  </Link>
                </div>
              </div>
            )}
            <div className="mx-auto flex h-full w-full max-w-[1440px] min-h-0 flex-1 flex-col overflow-hidden rounded-xl sm:rounded-2xl border border-white/10 shadow-2xl">
              <GameView slug={slug} backHref="/" />
            </div>
            <SupportWidget />
          </div>
          <BottomNav viewer={viewer} active="home" />
        </>
      );
    }

    return (
      <div className="wx-bg min-h-screen text-white">
        <Header viewer={viewer} active="games" showAnnouncement={false} />
        <div className={`${CONTAINER} px-3 pb-28 pt-3 md:px-4 md:pb-10 lg:px-6`}>
          {!viewer.loggedIn && <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#ffb800]/40 bg-[#ffb800]/10 px-3 py-2 text-xs text-[#ffe0a3] sm:text-sm">
            <span><Hi s={t("demoBar")} cls="font-black text-white" /></span>
            <div className="flex gap-2">
              <Link href="/login" className="btn-outline rounded-md px-2.5 py-1 font-bold">{t("login")}</Link>
              <Link href="/signup" className="btn-gold rounded-md px-2.5 py-1 font-black">{t("register")}</Link>
            </div>
          </div>}
          <GameView slug={slug} backHref="/" />
        </div>
        <SupportWidget />
        <BottomNav viewer={viewer} active="home" />
      </div>
    );
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
