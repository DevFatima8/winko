export const CARD_GAMES = [
  "blackjack", "dragon-tiger", "baccarat", "andar-bahar", "muflis", "poker",
  "amar-akbar-anthony", "32-cards", "bollywood-casino", "casino-war", "monster-hilo",
  "poker-betting", "red-vs-black", "rummy", "speed-baccarat", "teen-patti",
  "teen-patti-999", "teen-patti-ak47", "teen-patti-best-of-four", "teen-patti-faceoff",
  "teen-patti-hukam", "teen-patti-joker", "texas-holdem", "three-card-poker", "three-cards", "football-studio",
] as const;

export function isCardGame(game: string): boolean {
  return CARD_GAMES.some(value => value === game);
}
