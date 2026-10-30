"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { CAT_ICONS, PROVIDER_CATS } from "@/components/lobby/Lobby";
import { Header, BottomNav } from "@/components/lobby/Lobby";
import { useSession } from "@/lib/useDb";
import { useI18n } from "@/lib/i18n/client";
import { ArrowLeftIcon, TrophyIcon, GamepadIcon } from "@/components/Icons";
import { useGameReturnScroll } from "@/lib/gameNavigation";
import { GregmornGames } from "@/components/lobby/GregmornGames";

const CATEGORIES = PROVIDER_CATS;

export default function AllGames() {
  const { user } = useSession();
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const [categoryOverride, setCategoryOverride] = useState<string | null>(null);
  useGameReturnScroll(true);

  const requestedCategory = searchParams.get("cat");
  const selectedCategory = categoryOverride ?? CATEGORIES.find((category) => category.key.toLowerCase() === requestedCategory?.toLowerCase())?.key ?? "All";

  return (
    <div className="wx-bg min-h-[100dvh] text-white">
      <Header viewer={{ loggedIn: !!user, isAdmin: user?.role === "admin", name: user?.name, balance: user?.balance, uid: user?.role === "client" ? user.displayId ?? undefined : user?.adminId ?? user?.id }} active="games" />
      <main className="mx-auto w-full max-w-[1320px] px-2 pb-28 pt-2 sm:px-5 sm:pt-5 md:px-6 lg:pb-10">
        <div className="mb-2 flex items-center justify-between gap-2 sm:mb-6 sm:gap-3">
          <Link href="/" className="inline-flex items-center gap-1 rounded-full bg-black/30 px-2.5 py-1.5 text-xs font-bold text-[#c4b5fd] ring-1 ring-[#3a2470] transition hover:bg-black/40 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"><ArrowLeftIcon size={14} /> {t("home")}</Link>
          <span className="rounded-full border border-[#8b5cf6]/40 bg-[#8b5cf6]/10 px-2.5 py-1 text-[10px] font-semibold text-[#d8c8ff] sm:px-3 sm:py-1 sm:text-xs">Browse by category</span>
        </div>

        <section className="relative mb-3 overflow-hidden rounded-2xl border border-[#8b5cf6]/40 bg-gradient-to-br from-[#24104d] via-[#150d2e] to-[#0b0716] p-3 shadow-[0_12px_36px_rgba(59,7,100,.2)] sm:mb-7 sm:rounded-3xl sm:p-8 sm:shadow-[0_20px_60px_rgba(59,7,100,.25)]">
          <div className="pointer-events-none absolute -right-10 -top-20 hidden h-64 w-64 rounded-full bg-fuchsia-500/10 blur-3xl sm:block" />
          <div className="relative flex min-w-0 items-center justify-between gap-2 sm:flex-wrap sm:items-end sm:gap-5">
            <div className="flex min-w-0 items-center gap-2 sm:block">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center text-white sm:mb-3 sm:h-12 sm:w-12"><TrophyIcon size={22} /></div>
              <div className="min-w-0">
                <h1 className="text-lg font-black leading-tight tracking-tight sm:text-4xl">All Games</h1>
                <p className="mt-0.5 max-w-xl truncate text-[10px] leading-tight text-[#b8a7e6] sm:mt-2 sm:whitespace-normal sm:text-sm">Choose a category and find a game to play.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)] items-start gap-2 min-[380px]:grid-cols-[100px_minmax(0,1fr)] sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-3 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-4">
          <aside className="sticky top-2 min-w-0 rounded-xl border border-[#3a2470] bg-[#100a21]/90 p-1.5 min-[380px]:p-2 sm:top-24 sm:rounded-3xl sm:p-3 lg:p-4">
            <div className="mb-2 sm:mb-3">
              <h2 className="text-[10px] font-black leading-tight min-[380px]:text-[11px] sm:text-base lg:text-lg">Categories</h2>
              <p className="mt-0.5 hidden text-xs text-[#8f80b8] sm:block">Choose a category</p>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5 sm:gap-2">
              {CATEGORIES.map((category) => {
                const active = selectedCategory === category.key;
                return (
                  <button key={category.key} type="button" onClick={() => setCategoryOverride(category.key)} aria-pressed={active}
                    className={`group relative flex h-[58px] min-w-0 items-center overflow-hidden rounded-lg border text-left transition hover:border-[#c4b5fd] min-[380px]:h-[62px] sm:h-[68px] sm:rounded-xl lg:h-[70px] ${active ? "border-[#ffb800] ring-1 ring-[#ffb800]/40 sm:ring-2" : "border-[#3a2470]"}`}>
                    <img src={category.img} alt="" className="absolute inset-0 h-full w-full object-cover opacity-100 transition duration-300 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/25 via-black/15 to-black/55" />
                    <div className="relative flex min-w-0 items-center gap-1 px-1 min-[380px]:gap-1.5 min-[380px]:px-1.5 sm:gap-2.5 sm:px-2.5 lg:px-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-black/45 text-white sm:h-8 sm:w-8 sm:rounded-lg">{category.key === "All" ? <GamepadIcon size={16} /> : CAT_ICONS[category.key] ?? category.icon}</span>
                      <span className="min-w-0 flex-1">
                        <b className="block whitespace-normal break-words text-[8px] font-black leading-tight text-white min-[380px]:text-[9px] sm:text-[11px] lg:text-xs">{category.key === "Live" ? "Live Casino" : category.label}</b>
                      </span>
                      {active && <span className="hidden h-2 w-2 shrink-0 rounded-full bg-[#ffb800] shadow-[0_0_10px_#ffb800] min-[420px]:block" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="min-w-0 overflow-hidden rounded-xl border border-[#3a2470] bg-[#100a21]/85 p-1.5 min-[380px]:p-2 sm:rounded-3xl sm:p-4 lg:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0"><h2 className="break-words text-sm font-black min-[380px]:text-base sm:text-xl">{CATEGORIES.find((category) => category.key === selectedCategory)?.label ?? "All games"}</h2></div>
            <span className="hidden rounded-full bg-[#8b5cf6]/15 px-3 py-1 text-xs font-bold text-[#d8c8ff] sm:inline-flex">{selectedCategory === "All" ? "All categories" : "Category filter active"}</span>
          </div>
          <GregmornGames key={selectedCategory} category={selectedCategory} />
          </section>
        </section>
      </main>
      <BottomNav viewer={{ loggedIn: !!user, isAdmin: user?.role === "admin" }} active="home" />
    </div>
  );
}
