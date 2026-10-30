"use client";
import { GameView, GAME_SLUGS } from "@/components/GameView";
import { usePage, NOT_FOUND, REDIRECT } from "@/lib/useDb";

export default function GamePageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  void params; void searchParams;
  return usePage(async () => {
    const { slug } = params ?? {};
    if (!slug || !GAME_SLUGS.includes(slug)) return NOT_FOUND;
    try {
      const response = await fetch(`/api/public/data?view=game&slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        if (data && data.active === false) return NOT_FOUND;
      }
    } catch {
      // Gracefully continue for known games
    }
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
        <div className="fixed top-0 left-0 right-0 bottom-[calc(86px+env(safe-area-inset-bottom,0px))] md:bottom-0 z-30 flex h-[calc(100dvh-86px-env(safe-area-inset-bottom,0px))] md:h-[100dvh] w-full flex-col overflow-hidden bg-[#07090e] px-1 pt-1 pb-0 sm:p-2 md:p-3 text-white select-none">
          <div className="mx-auto flex h-full w-full max-w-[1440px] flex-col overflow-hidden rounded-xl sm:rounded-2xl border border-white/10 shadow-2xl">
            <GameView slug={slug} backHref="/player" />
          </div>
        </div>
      );
    }
    return <GameView slug={slug} backHref="/player" />;
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
