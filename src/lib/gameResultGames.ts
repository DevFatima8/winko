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
