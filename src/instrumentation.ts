export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startDailyPoolScheduler } = await import("./lib/dailyPoolScheduler");
  startDailyPoolScheduler();
}
