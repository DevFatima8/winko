"use client";
import { Card } from "@/components/Shell";
import { useState } from "react";
import { toggleGameAction, toggleGameHotAction } from "@/lib/actions";
import { usePage } from "@/lib/useDb";
import { GameGridSkeleton } from "@/components/lobby/GameGridSkeleton";
import { refreshAdminData } from "@/lib/adminLiveUpdates";

type ProviderGame = { _id: string; name: string; slug: string; category: string; isActive: boolean; isHot?: boolean; icon: string; imageUrl: string; stats: { c: number; bet: number; win: number } };
type GamesData = { games: ProviderGame[]; blocked: { _id: string; c: number }[]; level: number };

export default function GamesAdminPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  void params; void searchParams;
  return usePage(async () => {
    const response = await fetch("/api/admin/data?view=games", { cache: "no-store" });
    const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Games load nahi ho sake.");
    return <ProviderGamesManager data={data as GamesData} />;
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})], <GameGridSkeleton />);
}

function ProviderGamesManager({ data }: { data: GamesData }) {
    const [search, setSearch] = useState("");
    const [provider, setProvider] = useState("");
    const [limit, setLimit] = useState(60);
    const [pending, setPending] = useState<string | null>(null);
    const [error, setError] = useState("");
    const bm = new Map(data.blocked.map(b => [b._id, b.c]));
    const games = data.games.filter(game => (!provider || game.category === provider) &&
      `${game.name} ${game.category}`.toLowerCase().includes(search.trim().toLowerCase()));
    const providers = [...new Set(data.games.map(game => game.category))].sort();
    async function updateGame(game: ProviderGame, hot: boolean) {
      if (pending) return;
      setPending(game.slug);
      setError("");
      try {
        if (hot) await toggleGameHotAction(game.slug, !game.isHot);
        else await toggleGameAction(game.slug, !game.isActive);
        refreshAdminData();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Provider game settings could not be saved.");
      } finally {
        setPending(null);
      }
    }
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Provider Games On / Off</h1>
          <p className="text-sm text-[#b8a7e6]">Game ko ON/OFF karein, aur lobby ke Hot Games section ke liye alag se select karein. OFF game lobby ya All Games mein available nahi hoti. Kisi ek user ko block karne ke liye Users → user → Game Restrictions.</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <input aria-label="Search provider games" value={search} onChange={event => { setSearch(event.target.value); setLimit(60); }}
            placeholder="Search games..." className="min-w-0 flex-1 rounded-xl border border-[#3a2470] bg-[#100a21] px-3 py-2 text-sm text-white" />
          <select aria-label="Game provider" value={provider} onChange={event => { setProvider(event.target.value); setLimit(60); }}
            className="min-w-0 rounded-xl border border-[#3a2470] bg-[#100a21] px-3 py-2 text-sm text-white">
            <option value="">All providers</option>
            {providers.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <p className="text-sm text-[#b8a7e6]">{games.length} provider games</p>
        {error && <p role="alert" className="rounded-xl border border-red-500/30 p-3 text-sm text-red-200">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {games.slice(0, limit).map((g) => {
            const s = g.stats;
            return (
              <Card key={g.slug.toLowerCase()}>
                <div className="flex items-start gap-3">
                  <img src={g.imageUrl} alt="" loading="lazy" className="h-16 w-16 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate font-bold text-white">{g.name}</div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${g.isActive ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>{g.isActive ? "ON" : "OFF"}</span>
                    </div>
                    <div className="break-all text-xs text-[#b8a7e6]">{g.category}</div>
                    <div className="mt-1 text-xs text-[#b8a7e6]">{s?.c ?? 0} transactions · Bets Rs. {(s?.bet ?? 0).toLocaleString()} · Payout Rs. {(s?.win ?? 0).toLocaleString()}</div>
                    <div className="text-xs text-[#b8a7e6]">Profit: <b className={(s?.bet ?? 0) - (s?.win ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}>Rs. {((s?.bet ?? 0) - (s?.win ?? 0)).toLocaleString()}</b> · {bm.get(g.slug) ?? 0} users restricted</div>
                  </div>
                </div>
                {Number(data.level) >= 2 && <form action={async () => updateGame(g, false)} className="mt-3">
                  <button disabled={pending !== null} className={`w-full rounded-xl py-2 text-sm font-bold disabled:opacity-50 ${g.isActive ? "bg-red-500/20 text-red-300 hover:bg-red-500/30" : "btn-gold"}`}>{g.isActive ? "Turn OFF" : "Turn ON"}</button>
                </form>}
                {Number(data.level) >= 2 && <form action={async () => updateGame(g, true)} className="mt-2">
                  <button disabled={!g.isActive || pending !== null} className={`w-full rounded-xl py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 ${g.isHot ? "bg-orange-500/20 text-orange-200 hover:bg-orange-500/30" : "bg-violet-500/20 text-violet-200 hover:bg-violet-500/30"}`}>
                    {g.isHot ? "Remove from Lobby Hot Games" : "Add to Lobby Hot Games"}
                  </button>
                </form>}
              </Card>
            );
          })}
        </div>
        {games.length > limit && <button type="button" onClick={() => setLimit(value => value + 60)} className="btn-violet rounded-xl px-4 py-2 text-sm font-bold">Load more games ({games.length - limit})</button>}
      </div>
    );
}
