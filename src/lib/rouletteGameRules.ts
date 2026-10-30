export const ROULETTE_GAMES = [
  "european-roulette", "auto-roulette", "lightning-roulette", "mini-roulette", "poker-roulette",
] as const;
export const BROWSER_ROULETTE_GAMES = ["european-roulette", "mini-roulette", "poker-roulette"] as const;
export const isRouletteGame = (game: string) => ROULETTE_GAMES.some(value => value === game);
export const isBrowserRouletteGame = (game: string) => BROWSER_ROULETTE_GAMES.some(value => value === game);
export const isLiveRouletteGame = (game: string) => game === "auto-roulette" || game === "lightning-roulette";
