export const SLOT_GAMES = [
  "lucky-777", "treasure-bowl", "fortune-ox", "fortune-gems", "fortune-toucan",
  "gates-of-olympus", "diao-chan", "super-fruits", "sweet-bonanza", "hotline",
] as const;

export const isSlotGame = (game: string): game is typeof SLOT_GAMES[number] =>
  SLOT_GAMES.some(value => value === game);

export const SLOT_GROSS_CAP = 2;
