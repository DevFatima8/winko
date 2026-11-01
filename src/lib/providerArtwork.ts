import { GAME_IMAGES } from "./gameCatalog";

const normalize = (title: string) => title.toLowerCase().replace(/[^a-z0-9]/g, "");
const artwork = new Map(Object.entries(GAME_IMAGES).flatMap(([slug, path]) => [
  [normalize(slug), path],
  [normalize(path.split("/").pop()!.replace(/^\d+_/, "").replace(/_1024x700\.jpg$/, "")), path],
] as [string, string][]));
const aliases: Record<string, string> = {
  "blackjack": "blackjack", "andr bahar": "andar-bahar", "chicken road 2.0": "chicken-road-2",
  "lucky777": "lucky-777", "7 up down": "7-up-down", "roulette": "european-roulette",
  "birds & beasts": "birds-beasts", "evo casino": "evo-casino", "fortune gems 500": "fortune-gems",
  "coin toss": "head-tail", "coin toss (head/tail)": "head-tail", "teen patti muflis": "muflis",
  "9Wickers Sports": "nine-wickets", "9Wickets Sports": "nine-wickets", "crash goal": "crash-goal",
  "football studio cards": "football-studio", "honey trap of diao chan": "diao-chan",
  "ludo quick": "ludo", "race 20-20": "race-betting", "super fruits slot": "super-fruits",
  "teen patti best of four": "teen-patti-best-of-four", "tower": "tower-betting",
  "treasure bowl x-huge": "treasure-bowl", "wheel": "wheel-betting", "win three cards": "three-cards",
};
for (const [title, slug] of Object.entries(aliases)) artwork.set(normalize(title), GAME_IMAGES[slug]);

export function providerArtwork(title: string, fallback: string) {
  return artwork.get(normalize(title)) ?? fallback;
}
