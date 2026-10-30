const REQUESTED_GAMES: readonly (readonly string[])[] = [
  ["Aviator"],
  ["Aviator X"],
  ["Chicken Dash"],
  ["Mines"],
  ["Dragon Tiger"],
  ["Limbo"],
  ["Andr bahar", "Andar Bahar"],
  ["Chicken Road 2", "Chicken Road 2.0", "Chicken Road Two"],
  ["Plinko"],
  ["Lucky777"],
  ["Amar Akbar Anthony"],
  ["7 Up down", "7 Up 7 Down"],
  ["32 Cards"],
  ["Roulette"],
  ["Baccarat"],
  ["Birds & Beasts", "Birds and Beasts"],
  ["Black Jack"],
  ["Blast Off"],
  ["Bollywood Casino"],
  ["Casino War"],
  ["Crash Bonus"],
  ["Evo Casino"],
  ["Fortune Gems 500"],
  ["Coin Toss (Head/Tail)", "Coin Toss", "Head Tail", "Heads or Tails"],
  ["Teen Patti Muflis", "Muflis"],
  ["Poker"],
  ["Rock Paper Scissors"],
  ["9Wickers Sports", "9Wickets Sports", "9 Wickets", "Nine Wickets"],
  ["Crash Cricket"],
  ["Crash Goal"],
  ["Derby Race"],
  ["Dice"],
  ["Dream Catcher"],
  ["European Roulette"],
  ["Football Studio cards", "Football Studio"],
  ["Fortune Ox"],
  ["Fortune Toucan"],
  ["Gates of Olympus"],
  ["Honey Trap of Diao Chan"],
  ["Hotline"],
  ["Keno"],
  ["Lightning Roulette"],
  ["Ludo Quick"],
  ["Monster HiLo"],
  ["Poker Roulette"],
  ["Mini Roulette"],
  ["Race 20-20"],
  ["Red VS Black", "Red versus Black"],
  ["Rummy"],
  ["Sic Bo"],
  ["Sweet Bonanza"],
  ["Super Fruits Slot"],
  ["Tai Xiu"],
  ["Teen Patti"],
  ["Teen Patti Best of Four", "Teen Patti Best of 4"],
  ["Teen Patti AK47"],
  ["Teen Patti 999"],
  ["Teen Patti Faceoff"],
  ["Teen Patti Hukam"],
  ["Thai Hi Lo"],
  ["Teen Patti Joker"],
  ["Three Card Poker"],
  ["Texas Hold'em", "Texas Holdem"],
  ["Tower"],
  ["Treasure Bowl X-Huge"],
  ["Wheel"],
  ["Win drop"],
  ["Win Three Cards"],
];

function normalizedTitle(title: string) {
  return title.toLowerCase().replace(/\+/g, "plus").replace(/[^a-z0-9]/g, "");
}

const selectionOrder = new Map(REQUESTED_GAMES.flatMap((aliases, index) =>
  aliases.map(title => [normalizedTitle(title), index] as const)));

export function selectGregmornGames<T extends { id: string; title: string }>(catalog: readonly T[]): T[] {
  const selected = new Map<number, T>();
  for (const game of catalog) {
    const order = selectionOrder.get(normalizedTitle(game.title));
    if (order === undefined) continue;
    const existing = selected.get(order);
    // Keep the same provider entry even if the API changes catalogue ordering.
    if (!existing || game.id < existing.id) selected.set(order, game);
  }
  return [...selected.entries()].sort(([a], [b]) => a - b).map(([, game]) => game);
}
