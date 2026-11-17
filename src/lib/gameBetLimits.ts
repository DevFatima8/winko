export const MIN_GAME_BET = 10;
export const MAX_GAME_BET = 100_000;

export function gameBetError(amount: number, existingStake = 0): string | null {
  if (!Number.isFinite(amount) || amount < MIN_GAME_BET) return "Minimum bet is Rs. 10.";
  if (!Number.isFinite(existingStake) || existingStake < 0) return "Invalid existing wager amount.";
  if (amount > MAX_GAME_BET || Math.round(amount * 100) + Math.round(existingStake * 100) > MAX_GAME_BET * 100) {
    return "Maximum bet per player per round is Rs. 100,000.";
  }
  return null;
}
