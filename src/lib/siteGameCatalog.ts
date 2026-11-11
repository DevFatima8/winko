import { Game } from "@/models";
import { GAME_IMAGES, GAME_SLUGS } from "./gameCatalog";
import { PROVIDER_GAMES_VISIBLE } from "./gameAvailability";
import { getProviderCatalog, saveProviderGame, type ProviderCatalogGame } from "./gregmornCatalog";
import { ensureGames } from "./seed";

export async function getSiteGameCatalog(): Promise<ProviderCatalogGame[]> {
  if (PROVIDER_GAMES_VISIBLE) return getProviderCatalog();
  let rows = await Game.find({ slug: { $in: [...GAME_SLUGS] } }).lean();
  const savedSlugs = new Set(rows.map(game => game.slug));
  if (GAME_SLUGS.some(slug => !savedSlugs.has(slug))) {
    await ensureGames();
    rows = await Game.find({ slug: { $in: [...GAME_SLUGS] } }).lean();
  }
  const bySlug = new Map(rows.map(game => [game.slug, game]));
  return GAME_SLUGS.map(slug => {
    const game = bySlug.get(slug);
    if (!game) throw new Error(`Local game is missing from the saved catalogue: ${slug}`);
    const category = slug === "fishing-arcade" ? "Fishing"
      : slug === "lucky-777" ? "Slot"
      : game.category === "original" || game.category === "board" ? "Mini Games"
      : game.category === "wg-cards" ? "Cards" : game.category;
    return {
      id: String(game._id), slug, title: game.name, provider: game.category, category,
      imageUrl: GAME_IMAGES[slug], currency: "PKR", isEnabled: true,
      isActive: game.isActive, isHot: game.isActive && game.isHot === true,
      isHiddenByAdmin: !game.isActive,
    };
  });
}

export async function requireSiteGame(slug: string) {
  const game = (await getSiteGameCatalog()).find(game => game.slug === slug);
  if (!game) throw new Error("Game is not available in the website catalogue.");
  if (PROVIDER_GAMES_VISIBLE) await saveProviderGame(game);
  return game;
}
