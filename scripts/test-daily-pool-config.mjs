import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

function load(path, imports = {}) {
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}

function withEnv(value, fn, database = true) {
  const previous = process.env.DAILY_POOL_ENABLED;
  const mysql = ["DATABASE_URL", "MYSQL_URL", "MYSQL_HOST", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE"].map(key => [key, process.env[key]]);
  for (const [key] of mysql) delete process.env[key];
  if (database) {
    process.env.MYSQL_HOST = "fixture";
    process.env.MYSQL_USER = "fixture";
    process.env.MYSQL_PASSWORD = "fixture";
    process.env.MYSQL_DATABASE = "fixture";
  }
  if (value === undefined) delete process.env.DAILY_POOL_ENABLED; else process.env.DAILY_POOL_ENABLED = value;
  try { return fn(); } finally {
    if (previous === undefined) delete process.env.DAILY_POOL_ENABLED; else process.env.DAILY_POOL_ENABLED = previous;
    for (const [key, previousValue] of mysql) {
      if (previousValue === undefined) delete process.env[key]; else process.env[key] = previousValue;
    }
  }
}

test("new wagers use instant payouts by default and only an explicit true enables the pool", () => {
  const config = load("src\\lib\\dailyPoolConfig.ts");
  assert.equal(withEnv(undefined, () => config.dailyPoolEnabled()), false);
  assert.equal(withEnv("true", () => config.dailyPoolEnabled()), true);
  assert.equal(withEnv("false", () => config.dailyPoolEnabled()), false);
  assert.equal(withEnv(undefined, () => config.dailyPoolEnabled(), false), false, "local fallback mode must not require MySQL");
});

test("in-process scheduler starts once and settles every game pool without an external cron", async () => {
  const config = load("src\\lib\\dailyPoolConfig.ts");
  const games = ["aviator", "dice", "teen-patti"];
  const calls = [];
  const timers = [];
  const originalSetInterval = globalThis.setInterval;
  delete globalThis.__wxDailyPoolTimer;
  globalThis.setInterval = (fn, ms) => { timers.push({ fn, ms }); return { unref() {} }; };
  try {
    const scheduler = load("src\\lib\\dailyPoolScheduler.ts", {
      "./dailyPoolConfig": config,
      "./mysql": { getMysqlPool: async () => ({}) },
      "./dailyPoolRules": { DAILY_POOL_GAMES: games },
      "./dailyPoolService": { processDailyPool: async game => { calls.push(game); if (game === "dice") throw new Error("Fixture failure"); } },
    });
    withEnv(undefined, () => { scheduler.startDailyPoolScheduler(); scheduler.startDailyPoolScheduler(); });
    assert.equal(timers.length, 1, "scheduler must not start twice");
    assert.equal(timers[0].ms, config.DAILY_POOL_SCHEDULER_MS);
    const originalError = console.error;
    console.error = () => {};
    try { await timers[0].fn(); await new Promise(resolve => setTimeout(resolve, 20)); }
    finally { console.error = originalError; }
    assert.deepEqual(calls, games, "one failing game must not block later games");
  } finally {
    globalThis.setInterval = originalSetInterval;
    delete globalThis.__wxDailyPoolTimer;
  }
});

test("scheduler still starts when new pool wagers are disabled so existing pools settle", () => {
  const config = load("src\\lib\\dailyPoolConfig.ts");
  const timers = [];
  const originalSetInterval = globalThis.setInterval;
  delete globalThis.__wxDailyPoolTimer;
  globalThis.setInterval = (fn, ms) => { timers.push(ms); return { unref() {} }; };
  try {
    const scheduler = load("src\\lib\\dailyPoolScheduler.ts", { "./dailyPoolConfig": config });
    withEnv("false", () => scheduler.startDailyPoolScheduler());
    assert.equal(timers.length, 1);
  } finally {
    globalThis.setInterval = originalSetInterval;
    delete globalThis.__wxDailyPoolTimer;
  }
});

test("winners share exactly 35% of all stakes randomly; non-winners get nothing", async () => {
  const day = Date.parse("2026-10-24T08:00:00Z");
  const tomorrow = Date.parse("2026-10-24T19:00:00Z");
  const splits = new Set();
  for (let round = 0; round < 12; round++) {
    const s = createLegacyScene(["alice", "bob", "carol"], { poolEnabled: true });
    s.at(day);
    const run = fn => s.store.transact("test", fn);
    for (const [id, userId, amount] of [["a", "alice", 100], ["b", "bob", 100], ["c", "carol", 800]]) {
      await run(async tx => {
        const result = { _id: id, userId, gameId: "fortune-gems", betAmount: amount, winAmount: 0, outcome: "pending", createdAt: new Date(day) };
        await s.pool.addPoolWager(tx, "fortune-gems", result);
        await tx.insert("gameresults", id, result);
      });
    }
    await run(tx => s.pool.closePoolWager(tx, "a", 200, false));
    await run(tx => s.pool.closePoolWager(tx, "b", 200, false));
    await run(tx => s.pool.closePoolWager(tx, "c", 0, false));
    s.at(tomorrow);
    await run(tx => s.pool.settleDailyPools(tx, "fortune-gems"));
    const entry = id => s.data.dailypoolentries.find(e => e._id === id);
    assert.equal(entry("a").payoutCents + entry("b").payoutCents, 35000, "exactly 35% of Rs. 1,000");
    assert.equal(entry("c").payoutCents, 0, "a non-winning wager receives nothing when winners exist");
    splits.add(entry("a").payoutCents);
  }
  assert.ok(splits.size > 1, "winners must receive random, unequal shares across days");
});
