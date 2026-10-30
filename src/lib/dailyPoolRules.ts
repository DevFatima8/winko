import { GAME_ORDER } from "./gameCatalog";
import { MULTIPLAYER_GAMES } from "./multiplayer-types";

export const DAILY_POOL_VERSION = "daily-pool-v1";
export const DAILY_POOL_GAMES = GAME_ORDER;
export type DailyPoolGame = typeof DAILY_POOL_GAMES[number];
export const isDailyPoolGame = (game: string): game is DailyPoolGame =>
  DAILY_POOL_GAMES.some((value) => value === game);

export const DAILY_POOL_RULES = [
  "New card, roulette and slot wagers use instant wallet accounting: the server deducts accepted stakes and credits confirmed winnings directly. The deferred daily-pool rules below apply only to other pool-enabled games and previously accepted wagers carrying a pool version.",
  "35% of each game's total accepted daily stakes is allocated to player payouts; 65% is retained by the platform. Cancelled stakes are excluded.",
  "35% is a payout-pool share, not your probability of winning. Individual payouts vary and no individual win or return of stake is guaranteed.",
  "Wins, bonus awards and cashouts are provisional claims against the same pool, not extra wallet payments. Final payouts are settled after the Pakistan day ends and all accepted rounds finish.",
  "The pool is randomly divided between wagers with positive claims; some receive more and others less. A multiplier is not a guaranteed final payout. If there are no positive claims, the pool is shared between all accepted wagers, including losing rounds, in proportion to accepted stakes. Rounding is reconciled to the paisa.",
  "This is NOT an instant payout or a promise that 35% of players will win. Read the rules before accepting.",
  "Multiplier, card, roulette, live, sports and mini games: only 10 of every 100 wagers of the day receive a payout, each between 1x and 2x of its stake. Plinko: each cycle of 100 distinct players has 10 positive returns (two 0.2x, five 1.3x, three 0.9x); the other 90 receive 0x. Repeat players cannot draw again within the same cycle. Below 1x is a partial return, not a profit. The 25x board edges are scale markers only, with a 0% chance of payout. Any part of the 35% pool that is not paid out is retained by the platform.",
  "All 25 card titles use server-assigned winning opportunities for new wagers: 10 per completed cycle of 100 distinct admitted players. Repeat players in an unfinished cycle receive no additional winning slot. Interactive choices, folds, surrenders and cancellations can forfeit an opportunity; partial stake returns are not profitable wins. Invalid covering allocations are rejected. New Dragon Tiger, Andar Bahar, Baccarat, Speed Baccarat and 32 Cards rounds are personal, not shared public results, and return at most 2x the stake including any hold. Already accepted shared/pool wagers keep their original result and settlement contract.",
  "32 Cards assigns eight EVEN and two ODD winning opportunities per cycle, using the final total of the winning hand, not its base player number. An incompatible parity side bet is refused before debit when only the other parity's slots remain. Baccarat, Speed Baccarat and 32 Cards allow one fixed betting spot per personal round; cancelling does not redraw a slot or unlock a different spot. Ten actual paid wins requires admitted players to finish their rounds; cancellations can reduce that number.",
  "Roulette games (European, Auto, Lightning, Mini and Poker Roulette) use personal server-generated results with 10 winning slots per completed cycle of 100 distinct admitted players. Repeat players cannot draw an extra slot within an unfinished cycle. A new round returns at most 2x its combined stake, including returned stake and any hold; displayed base odds and lightning boosts cannot override this cap. Compatible multi-spot bets remain available; allocations covering every result or unable to produce a profitable win and a zero-return result are refused. Stakes deduct on acceptance and verified winnings credit directly; old accepted shared/pool wagers keep their original contract. Fully cancelled live rounds consume no slot.",
  "Slot games use server-generated results with ten positive-return slots per completed cycle of 100 distinct admitted players. Repeat players in an unfinished cycle receive no extra winning slot. The combined return of a paid wager, including its bonus/free spins and any hold, cannot exceed 2x its accepted stake. A returned stake or partial return is not profit. Super Fruits retains five cherry, three lemon and two orange results; Sweet Bonanza retains only 1.2x, 1.4x or 1.6x returns. Old accepted pool wagers keep their original settlement contract.",
] as const;

// Historical pooled wagers retain their accepted cap; new slots settle directly with a 2x gross cap.
export const DAILY_POOL_WIN_CAP: Partial<Record<DailyPoolGame, number>> = { "lucky-777": 2.5 };

// Games settled as "10 winning wagers per 100", each paid 1x–2x of stake from the day's pool. Slots are excluded.
export const TEN_WIN_POOL_GAMES: readonly string[] = [
  "aviator", "aviator-x", "chicken-road-2", "chicken-dash", "limbo", "mines", "dice", "blast-off", "crash-bonus",
  "crash-cricket", "crash-goal", "tower-betting", "wheel-betting", "keno", "head-tail", "rock-paper-scissors",
  "7-up-down", "sic-bo", "tai-xiu", "thai-hi-lo", "football-studio", "nine-wickets", "derby-race", "race-betting",
  "dragon-tiger", "andar-bahar", "muflis", "amar-akbar-anthony", "32-cards", "bollywood-casino", "casino-war",
  "baccarat", "blackjack", "red-vs-black", "rummy", "speed-baccarat", "teen-patti", "teen-patti-999", "teen-patti-ak47",
  "teen-patti-best-of-four", "teen-patti-faceoff", "teen-patti-hukam", "teen-patti-joker", "texas-holdem",
  "three-card-poker", "three-cards", "monster-hilo", "poker-betting", "dream-catcher", "european-roulette", "evo-casino",
  "auto-roulette", "lightning-roulette", "mini-roulette", "poker-roulette",
];

// Games whose claims are already decided by a server win cycle; settlement pays the claim itself (within the pool).
export const EXACT_CLAIM_POOL_GAMES: readonly string[] = ["plinko", "poker"];

export function pakistanDay(now: number) {
  return new Date(now + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function dailyPoolLock(game: DailyPoolGame) {
  if (game === "aviator") return "aviator:shared:v2";
  if (game === "dragon-tiger" || game === "andar-bahar") return `legacy:cards:${game}`;
  if (MULTIPLAYER_GAMES.some(value => value === game)) return `multiplayer:${game}`;
  return `daily-pool:${game}`;
}
