import { randomInt } from "node:crypto";
import { createOutcome, grossPayout, type RouletteOutcome } from "./multiplayer-rules";

type RouletteGame = "auto-roulette" | "lightning-roulette";
export type RouletteAllocation = { option: string; amount: number };
const money = (amount: number) => Math.round(amount * 100) / 100;

export function rouletteClaims(game: RouletteGame, bets: readonly RouletteAllocation[], outcome: RouletteOutcome) {
  const raw = bets.map(bet => grossPayout(game, bet.option, bet.amount, outcome));
  const total = money(raw.reduce((sum, amount) => sum + amount, 0));
  const stake = money(bets.reduce((sum, bet) => sum + bet.amount, 0));
  const cap = money(2 * stake);
  if (total <= cap) return raw;
  const claims = raw.map(amount => Math.floor(amount / total * Math.round(cap * 100)) / 100);
  let remainder = Math.round((cap - claims.reduce((sum, amount) => sum + amount, 0)) * 100);
  for (let i = 0; remainder > 0; i = (i + 1) % claims.length) {
    if (raw[i] > 0) { claims[i] = money(claims[i] + 0.01); remainder--; }
  }
  return claims;
}

function choices(game: RouletteGame, bets: readonly RouletteAllocation[], lightning: Record<number, number>) {
  const stake = money(bets.reduce((sum, bet) => sum + bet.amount, 0));
  const wins: number[] = [], losses: number[] = [];
  for (let number = 0; number <= 36; number++) {
    const claims = rouletteClaims(game, bets, { number, lightning });
    const gross = claims.reduce((sum, amount) => sum + amount, 0);
    const spots = new Map<string, number>();
    bets.forEach((bet, index) => spots.set(bet.option, money((spots.get(bet.option) ?? 0) + claims[index])));
    const payoutCents = [...spots.values()].reduce((sum, amount) => sum + Math.floor(amount * 0.98 * 100 + 1e-8), 0);
    if (payoutCents > Math.round(stake * 100)) wins.push(number);
    if (gross === 0) losses.push(number);
  }
  return { wins, losses };
}

export function validRouletteAllocation(game: RouletteGame, bets: readonly RouletteAllocation[]) {
  const { wins, losses } = choices(game, bets, {});
  return wins.length > 0 && losses.length > 0;
}

export function privateRouletteOutcome(game: RouletteGame, bets: readonly RouletteAllocation[], win: boolean): RouletteOutcome {
  const outcome = createOutcome(game) as RouletteOutcome;
  const available = choices(game, bets, outcome.lightning);
  const numbers = win ? available.wins : available.losses;
  if (!numbers.length) throw new Error("Personal roulette allocation cannot produce its assigned result.");
  return { ...outcome, number: numbers[randomInt(numbers.length)] };
}
