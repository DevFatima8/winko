import { DAILY_POOL_SCHEDULER_MS } from "./dailyPoolConfig";

const state = globalThis as typeof globalThis & { __wxDailyPoolTimer?: ReturnType<typeof setInterval> };

/** Settles finished Pakistan-day pools in-process so no external cron is required. Settlement is idempotent. */
export function startDailyPoolScheduler() {
  // Keep running even when new pool wagers are off, so already-accepted pool wagers still settle.
  if (state.__wxDailyPoolTimer) return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { getMysqlPool } = await import("./mysql");
      if (!await getMysqlPool()) return;
      const { DAILY_POOL_GAMES } = await import("./dailyPoolRules");
      const { processDailyPool } = await import("./dailyPoolService");
      for (const game of DAILY_POOL_GAMES) {
        try { await processDailyPool(game); }
        catch (error) { console.error("[daily pool scheduler]", game, error); }
      }
    } catch (error) {
      console.error("[daily pool scheduler]", error);
    } finally {
      running = false;
    }
  };
  state.__wxDailyPoolTimer = setInterval(() => { void tick(); }, DAILY_POOL_SCHEDULER_MS);
  state.__wxDailyPoolTimer.unref?.();
}
