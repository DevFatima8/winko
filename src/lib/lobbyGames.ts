export const HOT_GAME_ORDER = ["aviator", "birds-beasts", "lucky-777", "chicken-road-2", "nine-wickets", "blast-off", "andar-bahar", "thai-hi-lo", "aviator-x"] as const;
export function hotGameRank(slug: string) {
  const index = HOT_GAME_ORDER.findIndex(value => value === slug);
  return index < 0 ? HOT_GAME_ORDER.length : index;
}
