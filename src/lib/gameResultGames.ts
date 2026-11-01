import type { GameDoc } from "@/models";

export function gameResultGameMap(games: readonly Pick<GameDoc, "_id" | "slug" | "name" | "icon">[]) {
  const byReference = new Map<string, { name: string; icon: string }>();
  for (const game of games) {
    const display = { name: game.name, icon: /^(https?:)?\/\//.test(game.icon ?? "") ? "🎮" : game.icon };
    byReference.set(String(game._id), display);
    if (game.slug) byReference.set(game.slug, display);
  }
  return byReference;
}

export type GameResultStat = { _id: unknown; total: number; wins: number; losses: number; bet: number; paid: number };
export type GameResultSummary = { key: string; name: string; icon: string; refs: string[]; total: number; wins: number; losses: number; profit: number };

// Combines panel games, every provider (API) catalog game and the per-game result totals into one list.
export function gameResultSummaries(
  games: readonly Pick<GameDoc, "_id" | "slug" | "name" | "icon">[],
  providerGames: readonly { slug: string; title: string; imageUrl: string }[],
  stats: readonly GameResultStat[],
) {
  const entries = new Map<string, GameResultSummary>();
  const byRef = new Map<string, GameResultSummary>();
  const link = (entry: GameResultSummary, ref: string) => {
    if (!ref || byRef.has(ref)) return;
    byRef.set(ref, entry);
    entry.refs.push(ref);
  };
  for (const game of games) {
    const id = String(game._id);
    const slug = game.slug?.trim() ?? "";
    const existing = (slug && byRef.get(slug)) || byRef.get(id);
    const entry = existing ?? { key: id, name: game.name, icon: game.icon ?? "", refs: [], total: 0, wins: 0, losses: 0, profit: 0 };
    if (!existing) entries.set(entry.key, entry);
    link(entry, id);
    link(entry, slug);
  }
  for (const game of providerGames) {
    let entry = byRef.get(game.slug);
    if (!entry) {
      entry = { key: game.slug, name: game.title, icon: "", refs: [], total: 0, wins: 0, losses: 0, profit: 0 };
      entries.set(entry.key, entry);
      link(entry, game.slug);
    }
    entry.name = game.title || entry.name;
    if (game.imageUrl) entry.icon = game.imageUrl;
  }
  for (const stat of stats) {
    const ref = stat._id == null ? "" : String(stat._id);
    let entry = byRef.get(ref);
    if (!entry) {
      entry = entries.get("unknown") ?? { key: "unknown", name: "Unknown", icon: "🎮", refs: [], total: 0, wins: 0, losses: 0, profit: 0 };
      entries.set(entry.key, entry);
      if (!entry.refs.includes(ref)) entry.refs.push(ref);
    }
    entry.total += Number(stat.total) || 0;
    entry.wins += Number(stat.wins) || 0;
    entry.losses += Number(stat.losses) || 0;
    entry.profit += (Number(stat.bet) || 0) - (Number(stat.paid) || 0);
  }
  return [...entries.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}
