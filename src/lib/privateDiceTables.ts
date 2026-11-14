import { randomInt } from "node:crypto";
import { grossPayout, type DiceOutcome, type SevenOutcome } from "./multiplayer-rules";
import type { MultiplayerGame } from "./multiplayer-types";

export const isPrivateDiceTable = (game: string) => game === "sic-bo" || game === "tai-xiu" || game === "7-up-down";
type Wager = { option: string; amount: number };

function outcomes(game: MultiplayerGame): (DiceOutcome | SevenOutcome)[] {
  const values: (DiceOutcome | SevenOutcome)[] = [];
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
    if (game === "7-up-down") values.push({ dice: [a, b], total: a + b });
    else for (let c = 1; c <= 6; c++) {
      const total = a + b + c;
      values.push({ dice: [a, b, c], total, side: total >= 11 ? "tai" : "xiu" });
    }
  }
  return values;
}

function candidates(game: MultiplayerGame, bets: readonly Wager[], win: boolean) {
  const stake = Math.round(bets.reduce((sum, bet) => sum + bet.amount, 0) * 100);
  return outcomes(game).filter(outcome => {
    const gross = Math.round(bets.reduce((sum, bet) => sum + grossPayout(game, bet.option, bet.amount, outcome), 0) * 100);
    return win ? gross > stake : gross === 0;
  });
}

export function validDiceAllocation(game: MultiplayerGame, bets: readonly Wager[]) {
  return bets.length > 0 && candidates(game, bets, true).length > 0 && candidates(game, bets, false).length > 0;
}

export function privateDiceOutcome(game: MultiplayerGame, bets: readonly Wager[], win: boolean) {
  const choices = candidates(game, bets, win);
  if (!choices.length) throw new Error("Accepted dice allocation has no matching outcome.");
  return choices[randomInt(choices.length)];
}
