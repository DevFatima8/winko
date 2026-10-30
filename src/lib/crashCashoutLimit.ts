/** A crash round ends as soon as this share of the round's players has cashed out. */
export const CASHOUT_CRASH_SHARE = 0.2;

export function cashoutLimitReached(cashedOut: number, players: number): boolean {
  return players > 0 && cashedOut >= Math.ceil(players * CASHOUT_CRASH_SHARE);
}
