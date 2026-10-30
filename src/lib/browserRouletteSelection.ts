import { CATALOG, payoutFor } from "@/components/european-roulette/roulette";
import { NUMBERS, SPOTS, returnFor } from "@/components/mini-roulette/lib/roulette";
import { CATEGORY_ODDS } from "@/components/poker-roulette/lib/poker";
import { isBrowserRouletteGame } from "./rouletteGameRules";

export class BrowserRouletteSelectionError extends Error {}
export type BrowserRouletteSelection = { bets: Record<string, number> };
const cents = (value: number) => Math.round(value * 100);

/** Pure validation shared by the table before debit and the server before consuming a slot. */
export function validateBrowserRouletteSelection(game: string, stake: number, selection: unknown) {
  if (!isBrowserRouletteGame(game)) throw new BrowserRouletteSelectionError("Unsupported roulette game.");
  if (!selection || typeof selection !== "object" || Array.isArray(selection) ||
      Object.keys(selection).length !== 1 || !("bets" in selection)) {
    throw new BrowserRouletteSelectionError("Choose a roulette bet allocation.");
  }
  const bets = (selection as BrowserRouletteSelection).bets;
  if (!bets || typeof bets !== "object" || Array.isArray(bets) || !Object.keys(bets).length ||
      !Number.isFinite(stake) || stake < 10 || cents(stake) / 100 !== stake) {
    throw new BrowserRouletteSelectionError("Invalid roulette stake allocation.");
  }
  let allocated = 0;
  for (const [id, amount] of Object.entries(bets)) {
    const known = game === "european-roulette" ? Object.hasOwn(CATALOG, id) :
      game === "mini-roulette" ? Object.hasOwn(SPOTS, id) : /^[1-9]$/.test(id);
    if (!known || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 ||
        cents(amount) / 100 !== amount || !Number.isSafeInteger(cents(amount))) {
      throw new BrowserRouletteSelectionError("Invalid roulette bet allocation.");
    }
    allocated += cents(amount);
  }
  if (!Number.isSafeInteger(allocated) || allocated !== cents(stake)) {
    throw new BrowserRouletteSelectionError("Roulette allocation must match the accepted stake.");
  }
  const placed = Object.entries(bets).map(([id, amount]) => ({ id, amount }));
  const possibilities = game === "european-roulette" ? Array.from({ length: 37 }, (_, i) => i) :
    game === "mini-roulette" ? NUMBERS : Array.from({ length: 10 }, (_, i) => i);
  const returns = possibilities.map(value => {
    const raw = game === "european-roulette" ? payoutFor(placed, value) :
      game === "mini-roulette" ? returnFor(bets, value) :
      Object.entries(bets).reduce((sum, [id, amount]) => sum + (value >= Number(id) ? amount * (CATEGORY_ODDS[Number(id)] + 1) : 0), 0);
    return { value, payout: Math.min(cents(raw), cents(stake) * 2) / 100 };
  });
  const wins = returns.filter(result => result.payout > stake);
  const losses = returns.filter(result => result.payout === 0);
  if (!losses.length) throw new BrowserRouletteSelectionError("Bets covering every outcome are not allowed. Leave at least one losing outcome uncovered.");
  if (!wins.length) throw new BrowserRouletteSelectionError("This allocation cannot produce a winning return under the 2x gross cap. Change your bets.");
  return { bets, wins, losses };
}
