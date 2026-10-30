import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash, randomUUID, randomInt } from "node:crypto";
import ts from "typescript";

function scene() {
  let now = Date.parse("2026-10-24T08:00:00Z");
  let failure = null;
  const rows = {
    users: [{ _id: "alice", balance: 1000, role: "client", isActive: true, blockedGames: [] }],
    games: [{ _id: "dice-id", slug: "dice", isActive: true }, { _id: "rps-id", slug: "rock-paper-scissors", isActive: true }],
    gameresults: [], dailypools: [], dailypoolentries: [],
  };
  const copy = value => structuredClone(value);
  const tx = {
    now: async () => now,
    get: async (table, id) => copy(rows[table].find(row => row._id === id) ?? null),
    findWhere: async (table, filters) => copy(rows[table].filter(row => Object.entries(filters).every(([key, value]) => row[key] === value))),
    page: async (table, filters, after = "") => copy(rows[table].filter(row => row._id > after && Object.entries(filters).every(([key, value]) => row[key] === value)).sort((a, b) => a._id.localeCompare(b._id)).slice(0, 500)),
    put: async (table, id, row) => {
      if (failure === table) { failure = null; throw new Error("Injected persistence failure"); }
      const index = rows[table].findIndex(row => row._id === id);
      if (index < 0) rows[table].push(copy(row)); else rows[table][index] = copy(row);
    },
    insert: async (table, id, row) => {
      if (failure === table) { failure = null; throw new Error("Injected persistence failure"); }
      assert.ok(!rows[table].some(row => row._id === id));
      rows[table].push(copy(row));
    },
  };
  const modules = new Map();
  function load(name) {
    if (modules.has(name)) return modules.get(name);
    const module = { exports: {} };
    const require = specifier => {
      if (specifier === "node:crypto") return { createHash, randomInt };
      if (specifier === "@/components/head-tail/lib/game") return {
        MIN_BET: 1, MAX_BET: 1000, WIN_CHANCE: 0, PAYOUT_MULTIPLIER: 1.96,
        isSide: side => side === "head" || side === "tail",
        otherSide: side => side === "head" ? "tail" : "head",
      };
      if (specifier.startsWith("./")) return load(specifier.slice(2));
      throw new Error(`Unexpected import ${specifier}`);
    };
    const code = ts.transpileModule(readFileSync(`src\\lib\\${name}.ts`, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    new Function("require", "module", "exports", code)(require, module, module.exports);
    modules.set(name, module.exports);
    return module.exports;
  }
  async function transact(fn) {
    const snapshot = copy(rows);
    try { return await fn(tx); }
    catch (error) { for (const table of Object.keys(rows)) rows[table] = snapshot[table]; throw error; }
  }
  const browser = load("dailyPoolBrowser");
  return {
    rows, pool: load("dailyPool"), tx, transact,
    lifecycle: (input, enabled = true) => transact(tx => browser.browserPoolLifecycle(tx, "alice", {
      game: "dice", wagerId: input.wagerId, operationId: randomUUID(),
      action: "accept", amount: 100, poolVersion: "daily-pool-v1", ...input,
    }, enabled)),
    serverPlay: (input, enabled = true) => transact(tx => browser.playServerBrowserWager(tx, "alice", {
      game: "head-tail", wagerId: randomUUID(), stake: 100,
      poolVersion: "daily-pool-v1", selection: { choice: "head" }, ...input,
    }, enabled)),
    at: value => { now = value; },
    fail: table => { failure = table; },
    play: (input, enabled = true) => transact(tx => browser.playBrowserWager(tx, "alice", {
      game: "dice", wagerId: randomUUID(), stake: 100, claim: 200, poolVersion: "daily-pool-v1", ...input,
    }, enabled)),
  };
}

test("explicit instant stake/claim closes a persisted wager without wallet win credit", async () => {
  const s = scene();
  const wagerId = randomUUID();
  await s.play({ wagerId });
  assert.equal(s.rows.users[0].balance, 900);
  assert.equal(s.rows.gameresults[0].winAmount, 0);
  assert.equal(s.rows.gameresults[0].poolClaim, 200);
  assert.equal(s.rows.dailypoolentries[0].status, "closed");
  const replay = await s.play({ wagerId });
  assert.equal(replay.replay, true);
  assert.equal(s.rows.users[0].balance, 900);
  assert.equal(s.rows.dailypoolentries.length, 1);
  await assert.rejects(s.play({ wagerId, claim: 300 }), /different amounts/);
  s.at(Date.parse("2026-10-24T19:00:00Z"));
  await s.transact(tx => s.pool.settleDailyPools(tx, "dice"));
  assert.equal(s.rows.users[0].balance, 935);
});

test("explicit zero claim is a real losing wager and participates in no-claim fallback", async () => {
  const s = scene();
  await s.play({ claim: 0 });
  assert.equal(s.rows.dailypoolentries[0].claimCents, 0);
  s.at(Date.parse("2026-10-24T19:00:00Z"));
  await s.transact(tx => s.pool.settleDailyPools(tx, "dice"));
  assert.equal(s.rows.users[0].balance, 935);
});

test("consent, account access, supported games, and genuine positive stakes are enforced", async () => {
  const s = scene();
  await assert.rejects(s.play({ poolVersion: undefined }), /rules/);
  await assert.rejects(s.play({ game: "head-tail" }), /server engine/);
  await assert.rejects(s.play({ stake: 0 }), /amounts/);
  await assert.rejects(s.play({ stake: NaN }), /amounts/);
  await assert.rejects(s.play({ claim: -1 }), /amounts/);
  await assert.rejects(s.play({ stake: 2000 }), /Insufficient/);
  s.rows.users[0].blockedGames = ["dice"];
  await assert.rejects(s.play({}), /cannot bet/);
  assert.equal(s.rows.gameresults.length, 0);
  assert.equal(s.rows.users[0].balance, 1000);
});

test("incremental wagers retain each accepted Pakistan day and split claims across actual stakes", async () => {
  const s = scene(), wagerId = randomUUID();
  await s.lifecycle({ wagerId });
  s.at(Date.parse("2026-10-24T19:00:00Z"));
  await s.lifecycle({ wagerId, action: "increment", amount: 300 });
  assert.equal(s.rows.users[0].balance, 600);
  assert.equal(s.rows.dailypoolentries.length, 2);
  assert.equal(s.rows.dailypoolentries[0].day, "2026-10-24");
  assert.equal(s.rows.dailypoolentries[1].day, "2026-10-25");
  await s.lifecycle({ wagerId, action: "complete", amount: 800 });
  assert.equal(s.rows.users[0].balance, 600);
  assert.deepEqual(s.rows.dailypoolentries.map(entry => entry.claimCents), [20000, 60000]);
  await s.transact(tx => s.pool.settleDailyPools(tx, "dice"));
  assert.equal(s.rows.users[0].balance, 635);
  s.at(Date.parse("2026-10-25T19:00:00Z"));
  await s.transact(tx => s.pool.settleDailyPools(tx, "dice"));
  assert.equal(s.rows.users[0].balance, 740);
});

test("undo, partial cancellation, full refund, and replays exclude exactly the refunded stake", async () => {
  const s = scene(), wagerId = randomUUID();
  await s.lifecycle({ wagerId });
  await s.lifecycle({ wagerId, action: "increment", amount: 80 });
  const operationId = randomUUID();
  await s.lifecycle({ wagerId, operationId, action: "reduce", amount: 30 });
  await s.lifecycle({ wagerId, operationId, action: "reduce", amount: 30 });
  assert.equal(s.rows.users[0].balance, 850);
  assert.equal(s.rows.dailypoolentries.reduce((sum, entry) => sum + entry.stakeCents, 0), 15000);
  await s.lifecycle({ wagerId, action: "complete", amount: 0 });
  s.at(Date.parse("2026-10-24T19:00:00Z"));
  await s.transact(tx => s.pool.settleDailyPools(tx, "dice"));
  assert.equal(s.rows.users[0].balance, 902.5);
  const second = randomUUID();
  await s.lifecycle({ wagerId: second, amount: 10 });
  await assert.rejects(s.lifecycle({ wagerId: second, action: "increment", amount: 5 }), /Minimum added stake/);
  await s.lifecycle({ wagerId: second, action: "increment", amount: 10 });
  const refundId = randomUUID();
  await s.lifecycle({ wagerId: second, operationId: refundId, action: "refund", amount: 0 });
  await s.lifecycle({ wagerId: second, operationId: refundId, action: "refund", amount: 0 });
  assert.equal(s.rows.users[0].balance, 902.5);
  assert.equal(s.rows.dailypoolentries.filter(entry => entry.status === "cancelled").length, 2);
});

test("free-spin awards accrue one claim against the paid wager without extra stakes or wallet credits", async () => {
  const s = scene(), wagerId = randomUUID();
  await s.lifecycle({ wagerId });
  await s.lifecycle({ wagerId, action: "award", amount: 200 });
  await s.lifecycle({ wagerId, action: "award", amount: 300 });
  assert.equal(s.rows.users[0].balance, 900);
  assert.equal(s.rows.dailypools[0].outstanding, 1);
  await assert.rejects(s.lifecycle({ wagerId, action: "refund", amount: 0 }), /awarded results/);
  await s.lifecycle({ wagerId, action: "complete", amount: 0 });
  assert.equal(s.rows.dailypoolentries.length, 1);
  assert.equal(s.rows.dailypoolentries[0].claimCents, 50000);
  assert.equal(s.rows.users[0].balance, 900);
  await assert.rejects(s.lifecycle({ wagerId, action: "refund", amount: 0 }), /already finished/);
});

test("increment and cancellation identities cannot be reused or replayed as additional money", async () => {
  const s = scene(), wagerId = randomUUID(), operationId = randomUUID();
  await s.lifecycle({ wagerId });
  await s.lifecycle({ wagerId, operationId, action: "increment", amount: 10 });
  await s.lifecycle({ wagerId, operationId, action: "increment", amount: 10 });
  assert.equal(s.rows.users[0].balance, 890);
  assert.equal(s.rows.dailypoolentries.length, 2);
  await assert.rejects(s.lifecycle({ wagerId, operationId, action: "increment", amount: 20 }), /different values/);
  s.fail("gameresults");
  await assert.rejects(s.lifecycle({ wagerId, action: "reduce", amount: 5 }), /persistence/);
  assert.equal(s.rows.users[0].balance, 890);
  assert.equal(s.rows.dailypoolentries.reduce((sum, entry) => sum + entry.stakeCents, 0), 11000);
});

test("existing daily obligations settle before a new default-off browser wallet action", async () => {
  const s = scene();
  await s.play({});
  s.at(Date.parse("2026-10-24T19:00:00Z"));
  await s.play({ wagerId: randomUUID(), poolVersion: undefined }, false);
  assert.equal(s.rows.users[0].balance, 1035);
  assert.equal(s.rows.dailypools[0].status, "settled");
  assert.equal(s.rows.dailypoolentries.length, 1);
});

test("a completed multi-stake bonus claim replays its aggregate claim, not just the root allocation", async () => {
  const s = scene(), wagerId = randomUUID();
  await s.lifecycle({ wagerId });
  await s.lifecycle({ wagerId, action: "increment", amount: 100 });
  await s.lifecycle({ wagerId, action: "award", amount: 20 });
  const input = { wagerId, action: "complete", amount: 300, operationId: randomUUID() };
  const completed = await s.lifecycle(input);
  const replay = await s.lifecycle(input);
  assert.equal(completed.claim, 320);
  assert.equal(replay.claim, 320);
  assert.equal(s.rows.gameresults.reduce((sum, result) => sum + result.poolClaim, 0), 320);
  assert.equal(s.rows.users[0].balance, 800);
});

test("full refunds preserve replay identities without producing a false financial loss in result history", async () => {
  for (const enabled of [false, true]) {
    const s = scene(), wagerId = randomUUID();
    await s.lifecycle({ wagerId }, enabled);
    await s.lifecycle({ wagerId, action: "increment", amount: 50 }, enabled);
    const input = { wagerId, action: "refund", amount: 0, operationId: randomUUID() };
    await s.lifecycle(input, enabled);
    await s.lifecycle(input, enabled);
    assert.equal(s.rows.users[0].balance, 1000);
    assert.ok(s.rows.gameresults.every(result => result.betAmount === 0 && result.winAmount === 0 && result.outcome === "pending"));
    assert.ok(s.rows.dailypoolentries.every(entry => entry.status === "cancelled"));
  }
});

test("legacy active wagers keep legacy increments, bonus credits and terminal payouts after activation", async () => {
  const s = scene(), wagerId = randomUUID();
  await s.lifecycle({ wagerId, poolVersion: undefined }, false);
  await s.lifecycle({ wagerId, action: "increment", amount: 50, poolVersion: undefined }, false);
  await s.lifecycle({ wagerId, action: "award", amount: 10 }, false);
  assert.equal(s.rows.users[0].balance, 860);
  await s.lifecycle({ wagerId, action: "complete", amount: 300 }, true);
  assert.equal(s.rows.users[0].balance, 1160);
  assert.equal(s.rows.dailypoolentries.length, 0);
  assert.equal(s.rows.gameresults[0].winAmount, 310);
});

test("server-backed browser games reject forged claims and replay the same server outcome", async () => {
  const s = scene();
  s.rows.games.push({ _id: "head-tail-id", slug: "head-tail", isActive: true });
  const wagerId = randomUUID();
  const reply = await s.serverPlay({ wagerId });
  assert.deepEqual(reply.outcome, { win: false, result: "tail" });
  const replay = await s.serverPlay({ wagerId });
  assert.deepEqual(replay.outcome, reply.outcome);
  assert.equal(s.rows.users[0].balance, 900);
  assert.equal(s.rows.dailypoolentries.length, 1);
  await assert.rejects(s.serverPlay({ wagerId, selection: { choice: "tail" } }), /different selection/);
  const second = randomUUID();
  await s.lifecycle({ game: "head-tail", wagerId: second });
  await assert.rejects(s.lifecycle({ game: "head-tail", wagerId: second, action: "complete", amount: 9000 }), /verification/);
});

test("every browser catalog game has an explicit engine lifecycle and no unsupported catalog fallback", () => {
  const code = ts.transpileModule(readFileSync("src\\lib\\dailyPoolBrowserGames.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loadData = name => {
    const module = { exports: {} };
    const source = ts.transpileModule(readFileSync(`src\\lib\\${name}.ts`, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    new Function("module", "exports", source)(module, module.exports);
    return module.exports;
  };
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(specifier => loadData(specifier.slice(2)), loaded, loaded.exports);
  assert.equal(loaded.exports.BROWSER_POOL_GAMES.length, 48);
  assert.deepEqual(loaded.exports.UNSUPPORTED_BROWSER_POOL_GAMES, []);
  const engines = {
    "dice": "dice\\DiceGame.tsx", "rock-paper-scissors": "rock-paper-scissors\\RockPaperScissorsGame.tsx",
    "tower-betting": "tower-betting\\Game.tsx", "three-cards": "three-cards\\Game.tsx",
    "treasure-bowl": "treasure-bowl\\Game.tsx", "fortune-ox": "fortune-ox\\FortuneOxGame.tsx",
    "fortune-gems": "fortune-gems\\FortuneGemsGame.tsx", "fortune-toucan": "fortune-toucan\\FortuneToucanGame.tsx",
    "super-fruits": "super-fruits-slot\\SlotGame.tsx", "sweet-bonanza": "sweet-bonanza-clone\\Game.tsx",
    "keno": "keno\\components\\keno\\KenoGame.tsx", "hotline": "hotline\\HotlineGame.tsx",
    "monster-hilo": "monster-hilo\\MonsterHiloGame.tsx", "gates-of-olympus": "gates-of-olympus\\GatesOfOlympusGame.tsx",
    "evo-casino": "evo-casino\\EvoCasinoGame.tsx", "amar-akbar-anthony": "amar-akbar-anthony\\AmarAkbarAnthonyGame.tsx",
    "derby-race": "derby-race\\DerbyRaceApp.tsx", "crash-bonus": "crash-bonus\\CrashGame.tsx",
    "mini-roulette": "mini-roulette\\components\\roulette\\MiniRoulette.tsx", "european-roulette": "european-roulette\\RouletteGame.tsx",
    "blackjack": "blackjack\\BlackjackGame.tsx", "three-card-poker": "three-card-poker\\ThreeCardPoker.tsx",
    "casino-war": "casino-war\\CasinoWar.tsx", "poker": "poker\\PokerGame.tsx", "rummy": "rummy\\RummyGame.tsx",
    "teen-patti": "teen-patti\\TeenPattiGame.tsx", "teen-patti-ak47": "teen-patti-ak47\\TeenPattiAK47.tsx",
    "teen-patti-joker": "teen-patti-joker\\game\\TeenPattiGame.tsx", "teen-patti-best-of-four": "teen-patti-best-of-four\\game\\TeenPattiGame.tsx",
    "teen-patti-hukam": "teen-patti-hukam\\Game.tsx", "muflis": "muflis\\MuflisGame.tsx",
    "thai-hi-lo": "thai-hi-lo\\hi-lo-game.tsx", "poker-betting": "poker-betting\\components\\PokerGame.tsx",
    "poker-roulette": "poker-roulette\\app\\page.tsx", "red-vs-black": "red-vs-black\\RedVsBlackGame.tsx",
    "teen-patti-faceoff": "teen-patti-faceoff\\GameTable.tsx", "teen-patti-999": "teen-patti-999\\GameTable.tsx",
    "head-tail": "head-tail\\HeadTailGame.tsx", "wheel-betting": "wheel-betting\\WheelGame.tsx",
    "ludo": "ludo\\components\\ludo\\LudoApp.tsx", "birds-beasts": "birds-beasts\\BirdsBeasts.tsx",
    "bollywood-casino": "bollywood-casino\\CasinoGame.tsx", "race-betting": "race-betting\\RaceBettingGame.tsx",
    "diao-chan": "diao-chan\\components\\GameScreen.tsx", "crash-goal": "crash-goal\\CrashGoal.tsx",
    "crash-cricket": "crash-cricket\\CrashCricketApp.tsx", "fishing-arcade": "fishing-arcade\\FishingGame.tsx",
    "texas-holdem": "texas-holdem\\Game.tsx",
  };
  const resultViews = {
    "ludo": "ludo\\components\\ludo\\ResultOverlay.tsx",
    "birds-beasts": "birds-beasts\\Wheel.tsx",
    "race-betting": "race-betting\\components\\ActiveBetsPanel.tsx",
    "crash-goal": "crash-goal\\BetPanel.tsx",
    "crash-cricket": "crash-cricket\\CricketFlightCanvas.tsx",
  };
  for (const game of loaded.exports.BROWSER_POOL_GAMES) {
    const engine = readFileSync(`src\\components\\${engines[game]}`, "utf8");
    assert.match(engine, /usePoolLifecycle|useBrowserWager|acceptBrowserProjectile/, game);
    assert.doesNotMatch(engine, /reportGameBalanceChange/, `${game} must not infer result amounts from balances`);
    const resultView = resultViews[game] ? readFileSync(`src\\components\\${resultViews[game]}`, "utf8") : engine;
    assert.match(resultView, /provisional (?:pool )?claim|daily payout pending/i, `${game} must label enabled results as pending, not paid wallet winnings`);
  }
});

test("persistence failure rolls back wallet, stake and claim; exact retry remains safe", async () => {
  const s = scene();
  const wagerId = randomUUID();
  s.fail("gameresults");
  await assert.rejects(s.play({ wagerId }), /persistence/);
  assert.equal(s.rows.users[0].balance, 1000);
  assert.equal(s.rows.dailypoolentries.length, 0);
  await s.play({ wagerId });
  assert.equal(s.rows.users[0].balance, 900);
});

test("accepted legacy explicit wagers keep original balances across activation and replay", async () => {
  const s = scene();
  const wagerId = randomUUID();
  await s.play({ wagerId, poolVersion: undefined }, false);
  assert.equal(s.rows.users[0].balance, 1100);
  assert.equal(s.rows.dailypoolentries.length, 0);
  await s.play({ wagerId });
  assert.equal(s.rows.users[0].balance, 1100);
  assert.equal(s.rows.dailypoolentries.length, 0);
});

test("client adapter persists exact explicit requests and has no success-shaped network fallback", () => {
  const source = readFileSync("src\\lib\\walletSync.ts", "utf8");
  assert.match(source, /localStorage\.setItem\(key, JSON\.stringify\(body\)\)/);
  assert.match(source, /wagerId: crypto\.randomUUID\(\), stake, claim/);
  assert.doesNotMatch(source, /return \{ ok: true, balance: targetBalance \}/);
  assert.match(readFileSync("src\\app\\api\\player\\balance\\route.ts", "utf8"), /if \(poolEnabled\)/);
});
