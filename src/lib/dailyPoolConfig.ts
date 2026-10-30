// New wagers use each game's existing instant payouts. Set DAILY_POOL_ENABLED=true
// to accept new wagers into the deferred 35% daily pool instead.
export function dailyPoolEnabled() {
  return process.env.DAILY_POOL_ENABLED === "true";
}

export const DAILY_POOL_SCHEDULER_MS = 60_000;
