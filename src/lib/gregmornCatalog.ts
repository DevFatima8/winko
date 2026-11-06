import { Game } from "@/models";
import { getGregmornCatalog, type GregmornGame } from "./gregmorn";
import { gregmornGameSlug } from "./gregmornIdentity";
import { providerArtwork } from "./providerArtwork";

export type ProviderCatalogGame = GregmornGame & { slug: string; isActive: boolean; isHot: boolean; isHiddenByAdmin?: boolean };

const catalogRequests = new Map<string, Promise<GregmornGame[]>>();
const catalogs = new Map<string, { games: GregmornGame[]; expiresAt: number }>();
function getCachedCatalog(currency: string): Promise<GregmornGame[]> {
  const cached = catalogs.get(currency);
  const refresh = () => {
    let pending = catalogRequests.get(currency);
    if (!pending) {
      pending = getGregmornCatalog(currency).then(games => {
        catalogs.set(currency, { games, expiresAt: Date.now() + 60_000 });
        return games;
      }).finally(() => { catalogRequests.delete(currency); });
      catalogRequests.set(currency, pending);
    }
    return pending;
  };
  if (cached) {
    if (cached.expiresAt <= Date.now()) {
      void refresh().catch(error => { console.error("[Provider catalog] Background refresh failed", error); });
    }
    return Promise.resolve(cached.games);
  }
  return refresh();
}

export async function getProviderCatalog(currency?: string): Promise<ProviderCatalogGame[]> {
  const [catalog, settings] = await Promise.all([
    getCachedCatalog(currency ?? process.env.GREGMORN_CURRENCY ?? "PKR"),
    Game.find({ slug: { $regex: /^gregmorn-[a-f0-9]{40}$/ } }).lean(),
  ]);
  const bySlug = new Map(settings.map(game => [game.slug, game]));
  return catalog.map(game => {
    const slug = gregmornGameSlug(game.id);
    const saved = bySlug.get(slug);
    const isHiddenByAdmin = saved?.isActive === false;
    return { ...game, imageUrl: providerArtwork(game.title, game.imageUrl), slug,
      isActive: game.isEnabled && !isHiddenByAdmin, isHiddenByAdmin,
      isHot: game.isEnabled && !isHiddenByAdmin && saved?.isHot === true };
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
