type OrderedProviderGame = { provider: string; title: string; id: string };

const names = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function compareProviderGames(a: OrderedProviderGame, b: OrderedProviderGame): number {
  return names.compare(a.provider.trim(), b.provider.trim()) ||
    names.compare(a.title.trim(), b.title.trim()) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
