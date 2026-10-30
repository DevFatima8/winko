import { GAME_ORDER } from "./gameCatalog";
import { MULTIPLAYER_GAMES } from "./multiplayer-types";

export const BROWSER_POOL_GAMES = [
  "dice", "rock-paper-scissors", "tower-betting", "three-cards", "treasure-bowl",
  "fortune-ox", "fortune-gems",
  "fortune-toucan", "super-fruits", "sweet-bonanza", "keno", "hotline", "monster-hilo",
  "gates-of-olympus",
  "evo-casino", "amar-akbar-anthony", "derby-race", "crash-bonus",
  "mini-roulette", "european-roulette", "blackjack", "three-card-poker", "casino-war", "poker", "rummy",
  "teen-patti", "teen-patti-ak47", "teen-patti-joker", "teen-patti-best-of-four", "teen-patti-hukam",
  "muflis", "thai-hi-lo",
  "poker-betting", "poker-roulette", "red-vs-black", "teen-patti-faceoff",
  "teen-patti-999",
  "head-tail", "wheel-betting", "ludo", "birds-beasts",
  "bollywood-casino", "race-betting", "diao-chan",
  "crash-goal", "crash-cricket",
  "fishing-arcade",
  "texas-holdem",
] as const;
export const isBrowserPoolGame = (game: string): game is typeof BROWSER_POOL_GAMES[number] =>
  BROWSER_POOL_GAMES.some(value => value === game);

const nonBrowser = new Set<string>([
  "aviator", "aviator-x", "chicken-road-2", "chicken-dash", "dragon-tiger", "andar-bahar",
  "plinko", "limbo", "lucky-777", "mines", ...MULTIPLAYER_GAMES, ...BROWSER_POOL_GAMES,
]);

/** Fail closed: adding a catalog game never silently enables the old delta endpoint. */
export const UNSUPPORTED_BROWSER_POOL_GAMES = GAME_ORDER.filter(game => !nonBrowser.has(game));
export const isUnsupportedBrowserPoolGame = (game: string) =>
  UNSUPPORTED_BROWSER_POOL_GAMES.some(value => value === game);
