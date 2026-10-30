export const SERVER_BROWSER_CARD_GAMES = [
  "poker", "poker-betting", "muflis", "teen-patti-best-of-four",
  "teen-patti-ak47", "red-vs-black", "three-cards",
  "amar-akbar-anthony", "bollywood-casino", "teen-patti-faceoff", "teen-patti-hukam", "teen-patti-joker",
  "blackjack", "monster-hilo", "rummy", "teen-patti", "teen-patti-999", "texas-holdem", "three-card-poker", "casino-war",
] as const;

export const isServerBrowserCardGame = (game: string) =>
  SERVER_BROWSER_CARD_GAMES.some(value => value === game);

/** Recovery needs the immutable choice, not a new random selection. */
export const AUTO_RESOLVE_BROWSER_CARD_GAMES = [
  "poker", "poker-betting", "muflis", "teen-patti-best-of-four",
] as const;
export const isAutoResolveBrowserCardGame = (game: string) =>
  AUTO_RESOLVE_BROWSER_CARD_GAMES.some(value => value === game);

export const INTERACTIVE_BROWSER_CARD_GAMES = [
  "blackjack", "monster-hilo", "rummy", "teen-patti", "teen-patti-999",
  "texas-holdem", "three-card-poker", "casino-war",
] as const;
export const isInteractiveBrowserCardGame = (game: string) =>
  INTERACTIVE_BROWSER_CARD_GAMES.some(value => value === game);
