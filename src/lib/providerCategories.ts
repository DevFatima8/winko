export type ProviderCategory = "Mini Games" | "Cards" | "Live" | "Sports" | "Slot" | "Fishing" | "Lottery";

type CategorizedGame = { title: string; provider: string; category?: string };
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const miniGames = new Set([
  "aviator", "aviatorx", "hilo", "hotline", "mines", "plinko", "aviatrix", "aviatrixmines",
  "aviatrixsecondchance", "jetx", "jetx3", "chickenroad2", "chickenroad20", "rockpaperscissors",
  "tower", "plinkofootball", "ludo", "ludoquick", "limbo", "chickendash", "chickendash10000",
  "taixiu", "7up7down", "7updown",
]);

export function providerCategory(game: CategorizedGame): ProviderCategory | null {
  const title = normalize(game.title);
  const category = normalize(game.category ?? "");
  if (miniGames.has(title)) return "Mini Games";
  if (title.startsWith("keno")) return "Lottery";
  if (/^(?:live|livecasino|livedealer|gameshows|roulette|wheel)$/.test(category)) return "Live";
  if (/^(?:fish|fishing|shooting)$/.test(category)) return "Fishing";
  if (/^(?:sport|sports|virtualsport|virtualsports)$/.test(category)) return "Sports";
  if (/^(?:lottery|keno|bingo|scratchcard)$/.test(category)) return "Lottery";
  if (/^(?:card|cards|videopoker|poker)$/.test(category) || /^(teenpatti|blackjack|baccarat|rummy|andarbahar|threecard|texasholdem)/.test(title)) return "Cards";
  if (title === "topcardtrumpscasinowar") return "Cards";
  if (/^(?:crash|minigame|minigames|instantwin|instantgame|arcade|tower)$/.test(category)) return "Mini Games";
  if (/^(?:slot|slots)$/.test(category)) return "Slot";
  if (category === "table") return "Live";
  if (["evolutiongaming", "evolutionghx", "pragmaticplaylive"].includes(normalize(game.provider))) return "Live";
  // Provider labels such as "other" are not sufficient evidence for a game category.
  return null;
}

export function matchesProviderCategory(game: CategorizedGame & { isHot: boolean }, category: string) {
  if (category === "All") return true;
  if (category === "Hot") return game.isHot;
  return providerCategory(game) === category;
}
