"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProviderCatalogGame } from "@/lib/gregmornCatalog";
import { getCurrentUser } from "@/lib/auth";
import { GameThumbnail } from "./GameThumbnail";
import { GameGridSkeleton } from "./GameGridSkeleton";
import { HotSlider } from "./HotSlider";
import { useProviderCatalog, type ProviderCatalogState } from "@/lib/useProviderCatalog";
import { readProviderGameReturn, rememberGameReturn, useGameReturnScroll } from "@/lib/gameNavigation";
import { matchesProviderCategory } from "@/lib/providerCategories";
import { compareProviderGames } from "@/lib/providerOrder";

export function GregmornGames({ category = "All", lobby = false, catalog }: { category?: string; lobby?: boolean; catalog?: ProviderCatalogState }) {
  const ownCatalog = useProviderCatalog(catalog === undefined);
  const { games, loading, error: catalogError } = catalog ?? ownCatalog;
  const router = useRouter();
  const titleId = useId();
  const [limit, setLimit] = useState(60);
  const [launchError, setError] = useState("");
  const error = launchError || catalogError;
  const [launching, setLaunching] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const launchController = useRef<AbortController | null>(null);
  const [restPhase, setRestPhase] = useState(false);
  const [restored, setRestored] = useState(false);
  const [sliderScrollLeft, setSliderScrollLeft] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  useGameReturnScroll(restored && !loading && !catalogError);

  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => {
      if (!alive) return;
      setLaunching(null);
      setWaiting(false);
      const saved = readProviderGameReturn();
      if (saved && saved.category === category) {
        setLimit(saved.limit);
        setSliderScrollLeft(saved.sliderScrollLeft);
      }
      setRestored(true);
    });
    const stop = () => {
      launchController.current?.abort();
      launchController.current = null;
    };
    const back = (event: PageTransitionEvent) => {
      if (event.persisted) { stop(); setLaunching(null); setWaiting(false); }
    };
    window.addEventListener("pagehide", stop);
    window.addEventListener("pageshow", back);
    return () => {
      alive = false;
      stop();
      window.removeEventListener("pagehide", stop);
      window.removeEventListener("pageshow", back);
    };
  }, [category]);

  function cancelLaunch() {
    launchController.current?.abort();
    launchController.current = null;
    setLaunching(null);
    setWaiting(false);
  }

  async function launch(game: ProviderCatalogGame) {
    if (launchController.current) return;
    const controller = new AbortController();
    launchController.current = controller;
    const { signal } = controller;
    setLaunching(game.id);
    setWaiting(false);
    setError("");
    try {
      const user = await getCurrentUser(true);
      signal.throwIfAborted();
      if (!user) { router.push("/login"); return; }
      if (user.dbRole !== "client") throw new Error("Please sign in with a player account to play.");
      while (!signal.aborted) {
        const response = await fetch("/api/gregmorn/launch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameId: game.id, returnTo: `${window.location.pathname}${window.location.search}${window.location.hash}` }),
          signal,
        });
        const data = await response.json() as { url?: string; error?: string; code?: string };
        signal.throwIfAborted();
        if (response.status === 409 && data.code === "session_in_progress") {
          setWaiting(true);
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
              signal.removeEventListener("abort", abort);
              resolve();
            }, 10_000);
            function abort() { clearTimeout(timer); reject(signal.reason); }
            signal.addEventListener("abort", abort, { once: true });
          });
          continue;
        }
        if (!response.ok || typeof data.url !== "string") throw new Error(data.error ?? "Game launch failed.");
        rememberGameReturn({
          category, search: "", provider: "", limit,
          sliderScrollLeft: sectionRef.current?.querySelector("[data-provider-slider]")?.scrollLeft ?? 0,
        });
        window.location.assign(data.url);
        return;
      }
    } catch (reason) {
      if (!signal.aborted) setError(reason instanceof Error ? reason.message : "Game launch failed.");
    } finally {
      if (launchController.current === controller) {
        launchController.current = null;
        setLaunching(null);
        setWaiting(false);
      }
    }
  }

  const ordered = games.filter(game => matchesProviderCategory(game, category))
    .sort((a, b) => Number(b.isHot) - Number(a.isHot) || compareProviderGames(a, b));
  const visible = ordered.slice(0, limit);
  const cards = visible.map((game, index) => (
    <button key={game.id} type="button" onClick={() => void launch(game)} disabled={launching !== null || game.isEnabled === false}
      title={game.isEnabled === false ? "This game is currently unavailable from the provider." : undefined}
      className="group relative block w-full min-w-0 rounded-xl border border-[#3a2470] bg-[#1b1038] text-left transition hover:border-[#8b5cf6] disabled:cursor-wait disabled:opacity-70">
      <span className="relative block aspect-square overflow-hidden rounded-t-xl bg-[#100a21]">
        <GameThumbnail src={game.imageUrl} alt={game.title} loading={index < 6 ? "eager" : "lazy"} className={`h-full w-full ${game.imageUrl.startsWith("/games/") && game.imageUrl.endsWith("_1024x700.jpg") ? "object-cover object-center" : "object-contain"}`} />
        {game.isEnabled === false && <span className="absolute left-1 top-1 rounded bg-slate-800 px-2 py-1 text-[10px] font-bold text-white">Unavailable</span>}
        {launching === game.id && <span className="absolute inset-0 flex items-center justify-center bg-black/70 text-xs font-bold text-white" role="status">{waiting ? "Waiting for next session…" : "Opening…"}</span>}
      </span>
      {game.isHot && <svg viewBox="0 0 80 40" role="img" aria-label="Hot" className="pointer-events-none absolute left-1 top-1 z-10 h-auto w-[26%]">
        <path fill="#ef241c" d="M3 27C4 15 18 10 39 9L62 3l-9 8 24-2-18 10 15 2-23 8-24 8C12 41 1 36 3 27Z" />
        <path fill="#ff6a16" d="m9 26 19-9 30-3-15 6 19-2-22 12-23 5Z" />
        <text x="12" y="30" fill="#ffe83b" fontSize="25" fontWeight="900" fontStyle="italic" fontFamily="Arial Black, Arial, sans-serif" transform="rotate(-10 35 23)">HOT</text>
      </svg>}
      <span className="block truncate px-2 pt-2 text-sm font-bold text-white">{game.title}</span>
    </button>
  ));
  const hotCount = visible.filter(game => game.isHot).length;

  return (
    <section ref={sectionRef} className="wx-card space-y-3 rounded-2xl p-3 md:p-4" aria-labelledby={titleId}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 id={titleId} className="text-base font-black text-white md:text-lg">{category === "Hot" ? "Hot Games" : lobby ? restPhase || hotCount === 0 ? "All Games" : "Hot Games" : "Games"}</h2>
        </div>
        {loading && <span className="text-xs text-[#b8a7e6]" role="status">Loading…</span>}
      </div>
      {error && <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-100" role="status">{error}</p>}
      {launching !== null && <div className="flex items-center justify-between gap-2 rounded-lg border border-violet-400/30 bg-violet-500/10 p-3 text-xs text-white">
        <p role="status">{waiting ? "The previous session is still active. Waiting for the next available session; checking every 10 seconds." : "Opening your game…"}</p>
        <button type="button" onClick={cancelLaunch} className="shrink-0 rounded border border-violet-400/50 px-3 py-2 font-bold">Cancel</button>
      </div>}
      {loading && <GameGridSkeleton />}
      {!loading && !error && ordered.length === 0 && <p className="text-sm text-[#b8a7e6]">No provider games match this selection.</p>}
      {visible.length > 0 && (lobby ? (
        <HotSlider hot={cards.slice(0, hotCount)} rest={cards.slice(hotCount)}
          initialScrollLeft={sliderScrollLeft}
          onPhase={setRestPhase} onEnd={() => setLimit(value => Math.min(value + 60, ordered.length))} />
      ) : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">{cards}</div>)}
      {!lobby && ordered.length > visible.length && <button type="button" onClick={() => setLimit(value => value + 60)} className="btn-violet rounded-xl px-4 py-2 text-sm font-bold">Load more games</button>}
    </section>
  );
}
