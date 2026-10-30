import { Game } from "@/models";
import { getGregmornCatalog, type GregmornGame } from "./gregmorn";
import { gregmornGameSlug } from "./gregmornIdentity";

export type ProviderCatalogGame = GregmornGame & { slug: string; isActive: boolean; isHot: boolean };

export async function getProviderCatalog(currency?: string): Promise<ProviderCatalogGame[]> {
  const [catalog, settings] = await Promise.all([
    getGregmornCatalog(currency),
    Game.find({ slug: { $regex: /^gregmorn-[a-f0-9]{40}$/ } }).lean(),
  ]);
  const bySlug = new Map(settings.map(game => [game.slug, game]));
  return catalog.map(game => {
    const slug = gregmornGameSlug(game.id);
    const saved = bySlug.get(slug);
    return { ...game, slug, isActive: saved?.isActive !== false, isHot: saved?.isHot === true };
  });
}

export async function saveProviderGame(game: ProviderCatalogGame) {
  await Game.updateOne({ slug: game.slug }, {
    $set: { name: game.title, category: game.provider, description: game.id, icon: "" },
    $setOnInsert: { isActive: true, isHot: false },
  }, { upsert: true });
  const saved = await Game.findOne({ slug: game.slug }).lean();
  if (!saved) throw new Error("Provider game settings could not be saved.");
  return saved;
}

export async function requireProviderGame(slug: string) {
  const game = (await getProviderCatalog()).find(item => item.slug === slug);
  if (!game) throw new Error("Provider game is not available for this currency.");
  return game;
}
