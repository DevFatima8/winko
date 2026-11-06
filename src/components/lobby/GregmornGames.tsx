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

export function GregmornGames({ category = "All", lobby = false, catalog }: { category?: string; lobby?: boolean; catalog?: ProviderCatalogState }) {
  const ownCatalog = useProviderCatalog(catalog === undefined);
  const { games, loading, error: catalogError } = catalog ?? ownCatalog;
  const router = useRouter();
  const titleId = useId();
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("");
  const [limit, setLimit] = useState(60);
  const [launchError, setError] = useState("");
  const error = launchError || catalogError;
  const [launching, setLaunching] = useState<string | null>(null);
  const [restPhase, setRestPhase] = useState(false);
  const [restored, setRestored] = useState(false);
  const [sliderScrollLeft, setSliderScrollLeft] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  useGameReturnScroll(restored && !loading && !catalogError);

  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => {
      if (!alive) return;
      const saved = readProviderGameReturn();
      if (saved && saved.category === category) {
        setSearch(saved.search);
        setProvider(saved.provider);
        setLimit(saved.limit);
        setSliderScrollLeft(saved.sliderScrollLeft);
      }
      setRestored(true);
    });
    const back = (event: PageTransitionEvent) => { if (event.persisted) setLaunching(null); };
    window.addEventListener("pageshow", back);
    return () => { alive = false; window.removeEventListener("pageshow", back); };
  }, [category]);

  async function launch(game: ProviderCatalogGame) {
    if (launching) return;
    setLaunching(game.id);
    setError("");
    try {
      const user = await getCurrentUser(true);
      if (!user) { router.push("/login"); setLaunching(null); return; }
      if (user.dbRole !== "client") throw new Error("Please sign in with a player account to play.");
      const response = await fetch("/api/gregmorn/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id, returnTo: `${window.location.pathname}${window.location.search}${window.location.hash}` }),
      });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || typeof data.url !== "string") throw new Error(data.error ?? "Game launch failed.");
      rememberGameReturn({
        category, search, provider, limit,
        sliderScrollLeft: sectionRef.current?.querySelector("[data-provider-slider]")?.scrollLeft ?? 0,
      });
      window.location.assign(data.url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Game launch failed.");
      setLaunching(null);
    }
  }

  const providers = [...new Set(games.map(game => game.provider))].sort();
  const filtered = games.filter(game =>
    matchesProviderCategory(game, category) &&
    (!provider || game.provider === provider) &&
    (!search.trim() || `${game.title} ${game.provider}`.toLowerCase().includes(search.trim().toLowerCase())));
  const ordered = lobby ? [...filtered.filter(game => game.isHot), ...filtered.filter(game => !game.isHot)] : filtered;
  const visible = ordered.slice(0, limit);
  const cards = visible.map((game, index) => (
    <button key={game.id} type="button" onClick={() => void launch(game)} disabled={launching !== null || game.isEnabled === false}
      title={game.isEnabled === false ? "This game is currently unavailable from the provider." : undefined}
      className="group block w-full min-w-0 overflow-hidden rounded-xl border border-[#3a2470] bg-[#1b1038] text-left transition hover:border-[#8b5cf6] disabled:cursor-wait disabled:opacity-70">
      <span className="relative block aspect-square overflow-hidden bg-[#100a21]">
        <GameThumbnail src={game.imageUrl} alt={game.title} loading={index < 6 ? "eager" : "lazy"} className={`h-full w-full ${game.imageUrl.startsWith("/games/") && game.imageUrl.endsWith("_1024x700.jpg") ? "object-cover object-center" : "object-contain"}`} />
        {game.isHot && <span className="absolute left-1 top-1 rounded bg-orange-600 px-2 py-1 text-[10px] font-black text-white">HOT</span>}
        {game.isEnabled === false && <span className="absolute left-1 top-1 rounded bg-slate-800 px-2 py-1 text-[10px] font-bold text-white">Unavailable</span>}
        {launching === game.id && <span className="absolute inset-0 flex items-center justify-center bg-black/70 text-xs font-bold text-white" role="status">Opening…</span>}
      </span>
      <span className="block truncate px-2 pt-2 text-sm font-bold text-white">{game.title}</span>
      <span className="block truncate px-2 pb-2 text-xs text-[#b8a7e6]">{game.provider}</span>
    </button>
  ));
  const hotCount = visible.filter(game => game.isHot).length;

  return (
    <section ref={sectionRef} className="wx-card space-y-3 rounded-2xl p-3 md:p-4" aria-labelledby={titleId}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 id={titleId} className="text-base font-black text-white md:text-lg">{category === "Hot" ? "Hot Games" : lobby ? restPhase || hotCount === 0 ? "All Games" : "Hot Games" : "Provider Games"}</h2>
          <p className="text-xs text-[#b8a7e6]">{loading ? "Provider games" : `Showing ${visible.length} of ${ordered.length} games`}</p>
        </div>
        {loading && <span className="text-xs text-[#b8a7e6]" role="status">Loading…</span>}
      </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <input aria-label="Search provider games" value={search} onChange={event => { setSearch(event.target.value); setLimit(60); setRestPhase(false); setSliderScrollLeft(0); }}
            placeholder="Search games..." className="min-w-0 flex-1 rounded-xl border border-[#3a2470] bg-[#100a21] px-3 py-2 text-sm text-white" />
          <select aria-label="Game provider" value={provider} onChange={event => { setProvider(event.target.value); setLimit(60); setRestPhase(false); setSliderScrollLeft(0); }}
            className="min-w-0 rounded-xl border border-[#3a2470] bg-[#100a21] px-3 py-2 text-sm text-white">
            <option value="">All providers</option>
            {providers.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
      {error && <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-100" role="status">{error}</p>}
      {loading && <GameGridSkeleton />}
      {!loading && !error && filtered.length === 0 && <p className="text-sm text-[#b8a7e6]">No provider games match this selection.</p>}
      {visible.length > 0 && (lobby ? (
        <HotSlider key={`${search}\u0000${provider}`} hot={cards.slice(0, hotCount)} rest={cards.slice(hotCount)}
          initialScrollLeft={sliderScrollLeft}
          onPhase={setRestPhase} onEnd={() => setLimit(value => Math.min(value + 60, ordered.length))} />
      ) : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">{cards}</div>)}
      {!lobby && ordered.length > visible.length && <button type="button" onClick={() => setLimit(value => value + 60)} className="btn-violet rounded-xl px-4 py-2 text-sm font-bold">Load more games ({ordered.length - visible.length})</button>}
    </section>
  );
}
