import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import ts from "typescript";

function load(file, imports = {}) {
  const js = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", js)(name => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected server dependency ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}
const types = load(join("src", "lib", "multiplayer-types.ts"));
const cardRules = load(join("src", "lib", "cardGameRules.ts"));
const rules = load(join("src", "lib", "multiplayer-rules.ts"), { "node:crypto": crypto });
const poolRules = load(join("src", "lib", "dailyPoolRules.ts"), { "./gameCatalog": load(join("src", "lib", "gameCatalog.ts")), "./multiplayer-types": types });
const pool = load(join("src", "lib", "dailyPool.ts"), { "./dailyPoolRules": poolRules, "node:crypto": crypto });
const cycles = load(join("src", "lib", "playerWinCycle.ts"), { "node:crypto": crypto });
const privateCards = load(join("src", "lib", "privateCardTables.ts"), {
  "node:crypto": crypto, "./multiplayer-rules": rules, "./playerWinCycle": cycles,
});
const rouletteRules = load(join("src", "lib", "rouletteGameRules.ts"));
const privateRoulettes = load(join("src", "lib", "privateRouletteTables.ts"), {
  "node:crypto": crypto, "./multiplayer-rules": rules,
});
const backendPath = join("src", "lib", "multiplayer.ts");
const fixed = {
  "7-up-down": { dice: [2, 3], total: 5 },
  "blast-off": { crashPoint: 3 },
  "nine-wickets": { outcome: "four" },
};

// Explicit test-only persistence. Nothing imports a database driver or reads .env.
function fixture(overrides = {}, poolEnabled = false) {
  let data = new Map(), now = 1_000_000, tail = Promise.resolve(), failAt = null;
  const writes = [];
  const document = (table, id) => data.get(`${table}:${id}`);
  const seed = (table, id, value) => data.set(`${table}:${id}`, structuredClone(value));
  for (const slug of types.MULTIPLAYER_GAMES) seed("games", slug, { _id: `catalog-${slug}`, slug, isActive: true });
  for (const [id, name] of [["u1", "Alice"], ["u2", "Bob"]]) seed("users", id, { _id: id, name, role: "client", isActive: true, balance: 10000, vipBetPoints: 0, blockedGames: [] });
  const store = {
    async transact(_room, fn) {
      const previous = tail;
      let release;
      tail = new Promise(resolve => { release = resolve; });
      await previous;
      const before = structuredClone(data), writeLength = writes.length;
      const tx = {
        now: async () => now,
        page: async (table, filters, afterId = "") => [...data].filter(([key, row]) => key.startsWith(`${table}:`) && row._id > afterId && Object.entries(filters).every(([field, value]) => row[field] === value)).map(([, row]) => structuredClone(row)).sort((a, b) => a._id.localeCompare(b._id)).slice(0, 500),
        get: async (table, id) => structuredClone(document(table, id) ?? null),
        find: async (table, field, value, limit) => [...data].filter(([key, row]) => key.startsWith(`${table}:`) && row[field] === value).slice(0, limit).map(([, row]) => structuredClone(row)),
        findWhere: async (table, filters, limit = 100, sort) => {
          const rows = [...data].filter(([key, row]) => key.startsWith(`${table}:`) && Object.entries(filters).every(([field, value]) => row[field] === value)).map(([, row]) => structuredClone(row));
          if (sort) rows.sort((a, b) => (a[sort.field] < b[sort.field] ? -1 : a[sort.field] > b[sort.field] ? 1 : 0) * (sort.direction === "desc" ? -1 : 1));
          return rows.slice(0, Math.max(1, Math.min(1000, limit)));
        },
        async remove(table, id) { writes.push({ table, id, removed: true }); data.delete(`${table}:${id}`); },
        async put(table, id, row) {
          if (failAt === table) throw new Error("fixture write failure");
          writes.push({ table, id }); seed(table, id, row);
        },
        async insert(table, id, row) {
          assert.equal(document(table, id), undefined, `Duplicate insert ${table}:${id}`);
          return this.put(table, id, row);
        },
      };
      try { return await fn(tx); }
      catch (error) { data = before; writes.splice(writeLength); throw error; }
      finally { release(); }
    },
  };
  const backend = load(backendPath, {
    "node:crypto": crypto, "./multiplayer-types": types,
    "./multiplayer-rules": { ...rules, createOutcome: game => structuredClone(overrides[game] ?? fixed[game] ?? rules.createOutcome(game)) },
    "./multiplayer-store": { mysqlMultiplayerStore: store },
    "./dailyPool": pool, "./dailyPoolRules": poolRules, "./dailyPoolConfig": { dailyPoolEnabled: () => poolEnabled },
    "./cardGameRules": cardRules,
    // These fixtures exercise the pre-migration shared-room contract; personal tables have their own integration suite.
    "./privateCardTables": { ...privateCards, isPrivateCardTable: () => false },
    "./rouletteGameRules": { ...rouletteRules, isLiveRouletteGame: () => false, isRouletteGame: () => false },
    "./privateRouletteTables": privateRoulettes, "./playerWinCycle": cycles,
  });
  return {
    ...backend, service: backend.createMultiplayerService(store),
    second: backend.createMultiplayerService(store), store, writes, seed, document,
    now: () => now, at: value => { now = value; }, fail: table => { failAt = table; },
    rows: table => [...data].filter(([key]) => key.startsWith(`${table}:`)).map(([, row]) => structuredClone(row)),
  };
}
let serial = 0;
const bet = (roundNo, option = "down", amount = 100, extra = {}) => ({ action: "bet", requestId: `request_${++serial}`, roundNo, option, amount, ...extra });
const action = (kind, roundNo, extra = {}) => ({ action: kind, requestId: `request_${++serial}`, roundNo, ...extra });
const rejects = (promise, status) => assert.rejects(promise, error => error.status === status);

test("pending claims, including zero-claim losses, never become a paid-win or final-loss message", () => {
  assert.equal(types.poolRoundMessage([]), null);
  assert.equal(types.poolRoundMessage([{ poolPending: false, poolClaim: 200 }]), null);
  assert.match(types.poolRoundMessage([{ poolPending: true, poolClaim: 0 }]), /Rs\. 0\.00.*payout pending/);
  assert.match(types.poolRoundMessage([{ poolPending: true, poolClaim: 200 }, { poolPending: false, poolClaim: 1000 }]), /Rs\. 200\.00/);
});

test("non-card multiplayer games record accepted stakes, close claims, and pay exactly 35% once at Pakistan midnight", async () => {
  const options = { baccarat: "player", "speed-baccarat": "player", "dream-catcher": "1", "football-studio": "HOME",
    "auto-roulette": "n:1", "lightning-roulette": "n-1", "sic-bo": "small", "blast-off": "main",
    "nine-wickets": "boundary", "7-up-down": "down", "tai-xiu": "tai", "32-cards": "A" };
  for (const game of types.MULTIPLAYER_GAMES) {
    if (cardRules.isCardGame(game)) continue;
    const f = fixture({}, true);
    f.at(Date.parse("2026-10-24T08:00:00Z"));
    const initial = await f.service.read(game, "u1");
    const input = bet(initial.round.roundNo, options[game], 100, { poolRulesVersion: poolRules.DAILY_POOL_VERSION });
    await f.service.act(game, "u1", input);
    await f.service.act(game, "u1", input);
    assert.equal(f.document("users", "u1").balance, 9900, game);
    assert.equal(f.rows("dailypoolentries").length, 1, game);
    f.at(game === "blast-off" ? initial.round.bettingEndsAt + rules.flightMs(3) + 1 : initial.round.resultAt);
    const completed = await f.service.read(game, "u1");
    assert.equal(completed.myBets[0].poolPending, true, game);
    assert.equal(completed.myBets[0].payout, 0, game);
    assert.equal(f.rows("dailypoolentries")[0].status, "closed", game);
    assert.equal(f.document("users", "u1").balance, 9900, game);
    assert.equal(f.rows("winholds").length, 0, game);
    f.at(Date.parse("2026-10-24T19:00:00Z"));
    await f.service.read(game, "u1");
    await f.service.read(game, "u1");
    assert.equal(f.document("users", "u1").balance, 9935, game);
    assert.equal(f.rows("gameresults")[0].poolPending, false, game);
    assert.equal(f.rows("gameresults")[0].winAmount, 35, game);
  }
});

const cardOutcomes = {
  baccarat: { playerCards: [], bankerCards: [], playerTotal: 8, bankerTotal: 3, winner: "player" },
  "speed-baccarat": { player: [], banker: [], pTotal: 8, bTotal: 3, winner: "player", playerPair: false, bankerPair: false },
  "32-cards": { draws: [[], [], [], []], totals: [24, 21, 20, 19], winner: 0 },
};
const cardOptions = { baccarat: ["player", "banker"], "speed-baccarat": ["player", "banker"], "32-cards": ["A", "B"] };

async function seedOldCardPoolWager(f, game, input) {
  await f.service.act(game, "u1", input);
  await f.store.transact(poolRules.dailyPoolLock(game), async tx => {
    const room = await tx.get("multiplayerrooms", game);
    const wager = room.bets.at(-1);
    const id = crypto.createHash("sha256").update(`result:${wager.id}`).digest("hex");
    const result = { _id: id, gameId: room.gameId, userId: "u1", roundNo: wager.roundNo, betSlot: 0,
      betAmount: wager.amount, winAmount: 0, outcome: "pending", createdAt: new Date(f.now()), updatedAt: new Date(f.now()) };
    await pool.addPoolWager(tx, game, result);
    await tx.insert("gameresults", id, result);
    Object.assign(wager, { poolVersion: result.poolVersion, poolPending: true, poolClaim: 0 });
    await tx.put("multiplayerrooms", game, room);
  });
}

for (const game of Object.keys(cardOutcomes)) {
  for (const poolEnabled of [false, true]) {
    test(`${game}: instant per-user wallet debit, shared winner credit and replay with global pool ${poolEnabled}`, async () => {
      const f = fixture(cardOutcomes, poolEnabled);
      f.at(Date.parse("2026-10-24T08:00:00Z"));
      const initial = await f.service.read(game, "u1");
      const input = bet(initial.round.roundNo, cardOptions[game][0], 100);
      await Promise.all([f.service.act(game, "u1", input), f.second.act(game, "u1", input)]);
      await f.service.act(game, "u2", bet(initial.round.roundNo, cardOptions[game][1], 100));
      assert.equal(f.document("users", "u1").balance, 9900);
      assert.equal(f.document("users", "u2").balance, 9900);
      f.at(initial.round.bettingEndsAt);
      const first = await f.service.read(game, "u1"), second = await f.second.read(game, "u2");
      assert.deepEqual(first.round, second.round);
      f.at(initial.round.resultAt);
      const completed = await f.service.read(game, "u1");
      const expected = Math.floor(rules.grossPayout(game, cardOptions[game][0], 100, cardOutcomes[game]) * .98 * 100 + 1e-8) / 100;
      assert.equal(completed.myBets[0].payout, expected);
      assert.ok(!completed.myBets[0].poolPending);
      assert.ok(!completed.myBets[0].poolVersion);
      assert.equal(f.document("users", "u1").balance, 9900 + expected);
      assert.equal(f.document("users", "u2").balance, 9900);
      await f.second.read(game, "u2");
      await f.service.act(game, "u1", input);
      assert.equal(f.document("users", "u1").balance, 9900 + expected);
      f.at(Date.parse("2026-10-24T19:00:00Z"));
      await f.service.read(game, "u1");
      assert.equal(f.document("users", "u1").balance, 9900 + expected);
      assert.equal(f.rows("dailypoolentries").length, 0);
      assert.equal(f.rows("gameresults").filter(row => row.userId === "u1").length, 1);
    });

    test(`${game}: new queues are refused; previously accepted reservations still cancel and settle with global pool ${poolEnabled}`, async () => {
      const f = fixture(cardOutcomes, poolEnabled), option = cardOptions[game][0];
      const initial = await f.service.read(game, "u1");
      f.fail("multiplayerrequests");
      const failed = bet(1, option);
      await assert.rejects(f.service.act(game, "u1", failed), /fixture write failure/);
      assert.equal(f.document("users", "u1").balance, 10000);
      assert.equal(f.document("multiplayerrooms", game).bets.length, 0);
      f.fail(null);
      await f.service.act(game, "u1", failed);
      f.at(initial.round.bettingEndsAt);
      await assert.rejects(f.service.act(game, "u1", bet(2, option, 50)), /Wait for the next round/);
      await assert.rejects(f.service.act(game, "u2", bet(2, option, 70)), /Wait for the next round/);
      assert.equal(f.document("users", "u1").balance, 9900);
      assert.equal(f.document("users", "u2").balance, 10000);
      const savedRoom = structuredClone(f.document("multiplayerrooms", game));
      for (const [userId, amount] of [["u1", 50], ["u2", 70]]) {
        const user = structuredClone(f.document("users", userId));
        user.balance -= amount;
        f.seed("users", userId, user);
        savedRoom.queuedBets.push({
          id: `original-queue-${userId}`, userId, name: "P***r", option, amount,
          roundNo: 2, status: "pending", payout: 0,
        });
      }
      f.seed("multiplayerrooms", game, savedRoom);
      const cancel = action("cancel", 2);
      await f.service.act(game, "u1", cancel);
      await f.service.act(game, "u1", cancel);
      assert.equal(f.document("users", "u1").balance, 9900);
      assert.equal(f.document("users", "u2").balance, 9930);
      f.at(initial.round.resultAt);
      f.fail("gameresults");
      await assert.rejects(f.service.read(game, "u1"), /fixture write failure/);
      assert.equal(f.document("users", "u1").balance, 9900);
      assert.equal(f.document("multiplayerrooms", game).bets[0].status, "pending");
      assert.equal(f.rows("winholds").length, 0);
      f.fail(null);
      const done = await f.service.read(game, "u1");
      assert.equal(f.document("users", "u1").balance, 9900 + done.myBets[0].payout);
      const balance = f.document("users", "u1").balance;
      f.at(initial.round.endsAt);
      const next = await f.service.read(game, "u2");
      assert.equal(next.myBets[0].status, "pending");
      assert.equal(f.document("users", "u2").balance, 9930);
      f.at(next.round.resultAt);
      const queuedDone = await f.service.read(game, "u2");
      assert.equal(f.document("users", "u2").balance, 9930 + queuedDone.myBets[0].payout);
      assert.equal(f.document("users", "u1").balance, balance);
      await f.second.read(game, "u2");
      assert.equal(f.rows("dailypoolentries").length, 0);
    });
  }

  for (const poolEnabled of [false, true]) {
  test(`${game}: previously accepted pooled obligations remain deferred with global pool ${poolEnabled}`, async () => {
    const f = fixture(cardOutcomes, poolEnabled);
    f.at(Date.parse("2026-10-24T08:00:00Z"));
    const initial = await f.service.read(game, "u1"), option = cardOptions[game][0];
    await seedOldCardPoolWager(f, game, bet(1, option));
    await f.service.act(game, "u1", bet(1, option));
    f.at(initial.round.resultAt);
    const done = await f.service.read(game, "u1");
    assert.equal(done.myBets[0].payout, 0);
    assert.equal(done.myBets[0].poolPending, true);
    assert.ok(done.myBets[1].payout > 0);
    assert.equal(f.document("users", "u1").balance, 9800 + done.myBets[1].payout);
    assert.equal(f.rows("dailypoolentries")[0].status, "closed");
    f.at(Date.parse("2026-10-24T19:00:00Z"));
    await f.service.read(game, "u1");
    assert.equal(f.document("users", "u1").balance, 9835 + done.myBets[1].payout);
    await f.second.read(game, "u1");
    assert.equal(f.document("users", "u1").balance, 9835 + done.myBets[1].payout);
  });
  test(`${game}: cancelling an old pooled wager refunds once with global pool ${poolEnabled}`, async () => {
    const f = fixture(cardOutcomes, poolEnabled);
    await f.service.read(game, "u1");
    await seedOldCardPoolWager(f, game, bet(1, cardOptions[game][0]));
    const cancel = action("cancel", 1);
    await f.service.act(game, "u1", cancel);
    await f.second.act(game, "u1", cancel);
    assert.equal(f.document("users", "u1").balance, 10000);
    assert.equal(f.rows("dailypoolentries")[0].status, "cancelled");
    assert.equal(f.rows("gameresults").length, 0);
  });
  }
  test(`${game}: 100 distinct players on the public winning option must all be paid, not quota-filtered`, async () => {
    const f = fixture(cardOutcomes, true);
    const initial = await f.service.read(game);
    for (let i = 0; i < 100; i++) {
      const id = `player-${i}`;
      f.seed("users", id, { _id: id, name: id, role: "client", isActive: true, balance: 1000 });
      await f.service.act(game, id, bet(1, cardOptions[game][0]));
      assert.equal(f.document("users", id).balance, 900);
    }
    f.at(initial.round.resultAt);
    const done = await f.service.read(game);
    assert.equal(done.bets.filter(bet => bet.status === "win").length, 100);
    assert.ok(done.bets.every(bet => bet.payout > 0 && !bet.poolPending));
    for (let i = 0; i < 100; i++) assert.ok(f.document("users", `player-${i}`).balance > 1000);
    assert.equal(f.rows("dailypoolentries").length, 0);
  });
}

test("pool multiplayer cancellation refunds exactly once and excludes the wager; spectators create no obligations", async () => {
  const f = fixture({}, true), game = "7-up-down";
  const initial = await f.service.read(game);
  assert.equal(f.rows("dailypoolentries").length, 0);
  await rejects(f.service.act(game, "u1", bet(1)), 400);
  const input = bet(1, "down", 100, { poolRulesVersion: poolRules.DAILY_POOL_VERSION });
  await f.service.act(game, "u1", input);
  const state = await f.service.read(game, "u1");
  const cancel = action("cancel", initial.round.roundNo, { betId: state.myBets[0].id });
  await f.service.act(game, "u1", cancel);
  await f.service.act(game, "u1", cancel);
  assert.equal(f.document("users", "u1").balance, 10000);
  assert.equal(f.rows("dailypoolentries")[0].status, "cancelled");
  assert.equal(f.rows("gameresults").length, 0);
});

test("All twelve real games generate legal outcomes and preserve source gross payout formulas", () => {
  for (const slug of types.MULTIPLAYER_GAMES) {
    for (let n = 0; n < 20; n++) {
      const result = rules.createOutcome(slug);
      assert.ok(result && !("seed" in result));
      if (slug === "tai-xiu") {
        assert.ok(result.total >= 4 && result.total <= 17);
        assert.ok(!result.dice.every(d => d === result.dice[0]));
      }
      if (slug === "dream-catcher") {
        assert.ok(result.steps.length <= 16);
        assert.equal(result.totalMultiplier, result.steps.reduce((m, s) => m * s.multiplier, 1));
        assert.ok(!result.finalSpot.endsWith("x"));
      }
      if (slug === "32-cards") assert.equal(result.totals[result.winner], Math.max(...result.totals));
    }
  }
  const payout = (g, option, outcome) => rules.grossPayout(g, option, 100, outcome);
  assert.equal(payout("baccarat", "banker", { winner: "banker" }), 195);
  assert.equal(payout("baccarat", "player", { winner: "tie" }), 0);
  assert.equal(payout("speed-baccarat", "player", { winner: "tie" }), 100);
  assert.equal(payout("speed-baccarat", "bankerPair", { bankerPair: true }), 1200);
  assert.equal(payout("football-studio", "HOME", { outcome: "DRAW" }), 50);
  assert.equal(payout("football-studio", "DRAW", { outcome: "DRAW" }), 1200);
  assert.equal(payout("32-cards", "A", { winner: 0, totals: [20, 19, 18, 17] }), 1220);
  assert.equal(payout("auto-roulette", "n:0", { number: 0, lightning: {} }), 3600);
  assert.equal(payout("lightning-roulette", "n-0", { number: 0, lightning: { 0: 500 } }), 50100);
  assert.equal(payout("dream-catcher", "40", { finalSpot: "40", totalMultiplier: 14 }), 57400);
  assert.equal(payout("sic-bo", "small", { dice: [2, 2, 2], total: 6 }), 0);
  assert.equal(payout("sic-bo", "triple", { dice: [2, 2, 2], total: 6 }), 3100);
  assert.equal(payout("sic-bo", "total-4", { dice: [1, 1, 2], total: 4 }), 5100);
  assert.equal(payout("tai-xiu", "tai", { side: "tai" }), 200);
  assert.equal(payout("7-up-down", "lucky", { total: 7 }), 500);
  assert.equal(payout("nine-wickets", "boundary", { outcome: "four" }), 320);
  assert.equal(payout("blast-off", "main", { crashPoint: 3 }), 0);
  assert.equal(rules.validateOption("auto-roulette", "sp:1-36"), false);
  assert.equal(rules.validateOption("lightning-roulette", "co-0"), false);
  assert.equal(rules.validateOption("sic-bo", "total-18"), false);
  assert.equal(rules.validateOption("nine-wickets", "__proto__"), false);
});

test("Two players share round, countdown, fair result, real masked bets and private ownership", async () => {
  const f = fixture(), initial = await f.service.read("7-up-down");
  assert.equal(initial.balance, null);
  assert.deepEqual(initial.bets, []);
  await f.service.act("7-up-down", "u1", bet(1));
  await f.service.act("7-up-down", "u1", bet(1, "down", 50));
  await f.second.act("7-up-down", "u2", bet(1, "up", 200));
  const one = await f.service.read("7-up-down", "u1"), two = await f.second.read("7-up-down", "u2");
  assert.deepEqual(one.round, two.round);
  assert.equal(one.round.result, null);
  assert.equal(one.bets.reduce((n, b) => n + b.amount, 0), 350);
  assert.equal(one.myBets.length, 2);
  assert.equal(two.myBets.length, 1);
  assert.ok(one.bets.every(b => b.name.includes("***") && !("userId" in b)));
  assert.ok(!JSON.stringify(one).includes("Alice"));
  f.at(initial.round.resultAt);
  const resultOne = await f.service.read("7-up-down", "u1"), resultTwo = await f.second.read("7-up-down", "u2");
  assert.deepEqual(resultOne.round.result, resultTwo.round.result);
  assert.deepEqual(resultOne.round.result, fixed["7-up-down"]);
  assert.equal(resultOne.balance, 10000 - 150 + 294);
  assert.equal(resultTwo.balance, 9800);
  assert.equal(f.rows("gameresults").length, 3);
  assert.ok(f.rows("gameresults").every(row => row.gameId === "catalog-7-up-down"));
  assert.equal(f.rows("winholds").reduce((n, row) => n + row.amount, 0), 6);
  const before = f.writes.length;
  const guest = await f.service.read("7-up-down");
  assert.equal(guest.balance, null);
  assert.equal(guest.myBets.length, 0);
  assert.ok(guest.bets.every(b => !b.mine));
  assert.equal(f.writes.length, before, "An unchanged spectator read writes no documents");
});

test("Retries across workers reserve once, prevent payload reuse and refund cancellation once", async () => {
  const f = fixture(), wager = bet(1);
  await Promise.all([f.service.act("7-up-down", "u1", wager), f.second.act("7-up-down", "u1", wager)]);
  assert.equal(f.document("users", "u1").balance, 9900);
  await rejects(f.service.act("7-up-down", "u1", { ...wager, amount: 200 }), 409);
  const cancel = action("cancel", 1);
  await Promise.all([f.service.act("7-up-down", "u1", cancel), f.second.act("7-up-down", "u1", cancel)]);
  assert.equal(f.document("users", "u1").balance, 10000);
  await rejects(f.service.act("7-up-down", "u1", action("cancel", 1)), 409);
  const state = await f.service.read("7-up-down", "u1");
  assert.equal(state.bets[0].status, "cancelled");
});

test("Multiple chip requests use the original aggregate spot rounding and one house share", async () => {
  const f = fixture({ baccarat: { playerCards: [], bankerCards: [], playerTotal: 3, bankerTotal: 8, winner: "banker" } });
  const state = await f.service.read("baccarat");
  await f.service.act("baccarat", "u1", bet(1, "banker", 50));
  await f.service.act("baccarat", "u1", bet(1, "banker", 50));
  f.at(state.round.resultAt);
  const result = await f.service.read("baccarat", "u1");
  assert.equal(result.myBets.reduce((sum, b) => sum + Math.round(b.payout * 100), 0), 19110);
  assert.equal(result.balance, 10091.1);
  assert.equal(f.rows("winholds").reduce((sum, row) => sum + Math.round(row.amount * 100), 0), 390);
  assert.equal(f.rows("gameresults").reduce((sum, row) => sum + JSON.parse(row.resultData).grossPayout, 0), 195);
});

test("Countdown accepts bets through the last millisecond, then locks and runs without an extra debit", async () => {
  const f = fixture(), start = await f.service.read("7-up-down");
  f.at(start.round.bettingEndsAt - 1);
  const placed = await f.service.act("7-up-down", "u1", bet(1));
  assert.equal(placed.queued, false);
  const before = await f.service.read("7-up-down", "u1");
  assert.equal(before.round.phase, "betting");
  assert.equal(before.myBets.length, 1);
  assert.equal(before.balance, 9900);
  f.at(start.round.bettingEndsAt);
  const running = await f.service.read("7-up-down", "u1");
  assert.equal(running.round.phase, "running");
  assert.equal(running.myBets.length, 1);
  assert.equal(running.balance, 9900);
  await rejects(f.service.act("7-up-down", "u1", action("cancel", 1)), 409);
  await rejects(f.service.act("7-up-down", "u1", bet(1)), 409);
  const spectator = await f.service.read("7-up-down", "u2");
  assert.deepEqual(spectator.myBets, []);
  f.at(start.round.resultAt);
  const result = await f.service.read("7-up-down", "u2");
  assert.deepEqual(result.myBets, []);
  assert.equal(result.balance, 10000);
  assert.equal(f.rows("gameresults").filter(row => row.userId === "u2").length, 0);
});

test("Countdown zero locks betting; next-round reservations and cancellations stay isolated", async () => {
  const f = fixture(), start = await f.service.read("7-up-down");
  f.at(start.round.bettingEndsAt);
  await rejects(f.service.act("7-up-down", "u1", bet(1)), 409);
  await f.service.act("7-up-down", "u1", bet(2, "down", 100));
  await f.service.act("7-up-down", "u2", bet(2, "up", 200));
  assert.equal(f.document("users", "u1").balance, 9900);
  const state = await f.service.read("7-up-down", "u1");
  await rejects(f.service.act("7-up-down", "u1", action("cancel", 2, { betId: state.queuedBets.find(b => !b.mine).id })), 409);
  await f.service.act("7-up-down", "u1", action("cancel", 2));
  assert.equal(f.document("users", "u2").balance, 9800);
  assert.equal(f.document("users", "u1").balance, 10000);
  f.at(start.round.endsAt + 100);
  const next = await f.service.read("7-up-down", "u2");
  assert.equal(next.round.roundNo, 2);
  assert.equal(next.myBets[0].amount, 200);
  await rejects(f.service.act("7-up-down", "u2", bet(1)), 409);
  assert.equal(f.document("users", "u2").balance, 9800);
});

test("Insufficient funds and invalid money never reserve a wager or receipt", async () => {
  const f = fixture();
  await rejects(f.service.act("7-up-down", "u1", bet(1, "down", 10001)), 409);
  for (const amount of [NaN, Infinity, -1, 0, 0.5, 1.001]) await rejects(f.service.act("7-up-down", "u1", bet(1, "down", amount)), 400);
  await rejects(f.service.act("7-up-down", "u1", bet(1, "unrecognized")), 400);
  assert.equal(f.document("users", "u1").balance, 10000);
  assert.equal(f.rows("multiplayerrequests").length, 0);
});

test("Reconnect after everyone leaves settles current and queued liabilities before bounded idle skip", async () => {
  const f = fixture(), state = await f.service.read("7-up-down");
  await f.service.act("7-up-down", "u1", bet(1));
  f.at(state.round.bettingEndsAt + 1);
  await f.service.act("7-up-down", "u1", bet(2));
  f.at(f.now() + 365 * 24 * 3600 * 1000);
  const resumed = await f.service.read("7-up-down", "u1");
  assert.ok(resumed.round.roundNo > 2);
  assert.equal(resumed.balance, 10192);
  assert.equal(f.rows("gameresults").length, 2);
  await Promise.all([f.service.read("7-up-down"), f.second.read("7-up-down")]);
  assert.equal(f.document("users", "u1").balance, 10192);
  assert.equal(f.rows("gameresults").length, 2);
  assert.ok(resumed.history.some(round => round.roundNo === 1));
  assert.ok(resumed.history.some(round => round.roundNo === 2));
});

test("Settlement failures rollback wallet, result, hold and room; retry pays exactly once", async () => {
  const f = fixture(), state = await f.service.read("7-up-down");
  await f.service.act("7-up-down", "u1", bet(1));
  f.at(state.round.resultAt);
  f.fail("gameresults");
  await assert.rejects(f.service.read("7-up-down"), /fixture write failure/);
  assert.equal(f.document("users", "u1").balance, 9900);
  assert.equal(f.rows("winholds").length, 0);
  assert.equal(f.document("multiplayerrooms", "7-up-down").settled, false);
  f.fail(null);
  await Promise.all([f.service.read("7-up-down"), f.second.read("7-up-down")]);
  assert.equal(f.document("users", "u1").balance, 10096);
  assert.equal(f.rows("gameresults").length, 1);
});

test("Disabling a catalog game denies new wagers without trapping existing reserved funds", async () => {
  const f = fixture(), state = await f.service.read("7-up-down");
  await f.service.act("7-up-down", "u1", bet(1));
  f.seed("games", "7-up-down", { _id: "catalog-7-up-down", slug: "7-up-down", isActive: false });
  await rejects(f.service.act("7-up-down", "u2", bet(1)), 403);
  f.at(state.round.resultAt);
  await f.service.read("7-up-down");
  assert.equal(f.document("users", "u1").balance, 10096);
  assert.equal(f.rows("gameresults").length, 1);
});

test("No future outcome leakage; wheel targets appear only after betting closes", async () => {
  for (const game of types.MULTIPLAYER_GAMES) {
    const f = fixture(), state = await f.service.read(game);
    assert.equal(state.round.result, null);
    assert.equal(state.history.length, 0);
    if (game === "blast-off") {
      assert.equal(state.round.resultAt, 0);
      assert.equal(state.round.endsAt, 0);
      f.at(state.round.bettingEndsAt + 100);
      const flying = await f.service.read(game);
      assert.equal(flying.round.result, null);
      assert.ok(!JSON.stringify(flying).includes("crashPoint"));
    } else {
      f.at(state.round.bettingEndsAt);
      const running = await f.service.read(game);
      assert.equal(running.round.result !== null, ["auto-roulette", "lightning-roulette", "dream-catcher", "32-cards", "baccarat"].includes(game));
    }
  }
});

test("Flight auto cashouts run on server deadlines without browser actions; no crash leaked in results", async () => {
  const f = fixture(), start = await f.service.read("blast-off");
  await f.service.act("blast-off", "u1", bet(1, "main", 100, { autoCashout: 2 }));
  await f.service.act("blast-off", "u2", bet(1, "main", 100, { autoCashout: 3 }));
  f.at(start.round.bettingEndsAt + rules.flightMs(2) + 1);
  const flight = await f.service.read("blast-off", "u1");
  assert.equal(flight.round.result, null);
  assert.equal(flight.balance, 10096);
  assert.equal(flight.myBets[0].cashoutMultiplier, 2);
  assert.equal(JSON.parse(f.rows("gameresults")[0].resultData).result, null);
  f.at(start.round.bettingEndsAt + rules.flightMs(3));
  const crashed = await f.service.read("blast-off", "u2");
  assert.equal(crashed.round.phase, "result");
  assert.equal(crashed.round.result.crashPoint, 3);
  assert.equal(crashed.myBets[0].status, "lose", "Crash equality never qualifies as a successful auto cashout");
  await rejects(f.service.act("blast-off", "u2", action("cashout", 1)), 409);
  assert.equal(f.rows("gameresults").length, 2);
});

test("Distinct hidden crash points have identical public deadlines and no future auto-cashout predictions", async () => {
  const fixtures = [fixture({ "blast-off": { crashPoint: 2 } }), fixture({ "blast-off": { crashPoint: 12 } })];
  const compare = async () => {
    const states = await Promise.all(fixtures.map(f => f.service.read("blast-off", "u1")));
    assert.deepEqual(states[0].round, states[1].round);
    for (const state of states) {
      assert.equal(state.round.resultAt, 0);
      assert.equal(state.round.endsAt, 0);
      assert.equal(state.round.result, null);
      assert.deepEqual(state.history, []);
      assert.ok(!/"(?:crashPoint|seed|outcome|cashoutMultiplier|cashoutAt|cashedAt)"\s*:/.test(JSON.stringify(state)));
      assert.ok(state.bets.every(b => b.status === "pending" && b.payout === 0));
      assert.ok(state.queuedBets.every(b => b.status === "pending" && b.payout === 0));
    }
  };
  await compare();
  for (const f of fixtures) {
    await f.service.act("blast-off", "u1", bet(1, "main", 100, { autoCashout: 5 }));
    await f.service.act("blast-off", "u2", bet(1, "main", 100, { autoCashout: 1.8 }));
  }
  await compare();
  for (const f of fixtures) {
    const start = await f.service.read("blast-off");
    f.at(start.round.bettingEndsAt + 100);
    await f.service.act("blast-off", "u1", bet(2, "main", 100, { autoCashout: 7 }));
  }
  await compare();
  for (const f of fixtures) {
    const guest = await f.service.read("blast-off");
    assert.ok(guest.bets.every(b => !("autoCashout" in b)));
    const owner = await f.service.read("blast-off", "u1");
    assert.equal(owner.myBets[0].autoCashout, 5, "Own explicit target is a user setting, not a future result");
    assert.ok(owner.bets.filter(b => !b.mine).every(b => !("autoCashout" in b)));
  }
  const first = fixtures[0], initial = await first.service.read("blast-off");
  first.at(initial.round.bettingEndsAt + rules.flightMs(2));
  const revealed = await first.service.read("blast-off");
  assert.equal(revealed.round.phase, "result");
  assert.equal(revealed.round.result.crashPoint, 2);
  assert.equal(revealed.round.resultAt, initial.round.bettingEndsAt + rules.flightMs(2));
  assert.equal(revealed.round.endsAt, revealed.round.resultAt + rules.timings("blast-off").resultMs);
});

test("Manual flight cashout ignores client multiplier and timestamps; reserve/credit once", async () => {
  const f = fixture(), start = await f.service.read("blast-off");
  await f.service.act("blast-off", "u1", bet(1, "main"));
  await rejects(f.service.act("blast-off", "u1", action("cashout", 1)), 409);
  f.at(start.round.bettingEndsAt + rules.flightMs(1.5) + 1);
  const cashout = action("cashout", 1, { multiplier: 200, timestamp: start.round.bettingEndsAt });
  await f.service.act("blast-off", "u1", cashout);
  await f.second.act("blast-off", "u1", cashout);
  const state = await f.service.read("blast-off", "u1");
  assert.equal(state.myBets[0].cashoutMultiplier, 1.5);
  assert.equal(state.balance, 10047);
  await rejects(f.service.act("blast-off", "u1", action("cashout", 1)), 409);
});

test("Cricket persists complete shared match snapshots beyond bounded round history", async () => {
  const f = fixture();
  for (let i = 0; i < 45; i++) {
    const state = await f.service.read("nine-wickets");
    f.at(state.round.resultAt);
    const result = await f.service.read("nine-wickets");
    assert.ok(result.round.result.match);
    f.at(result.round.endsAt);
  }
  const joined = await f.second.read("nine-wickets");
  assert.equal(joined.history.length, 40);
  assert.ok(joined.history[0].result.match.balls > 0);
  assert.deepEqual(joined.history[0].result.match, f.document("multiplayerrooms", "nine-wickets").cricketMatch);
  assert.equal(f.rows("gameresults").length, 0, "No spectator GameResult documents");
});

test("Route authenticates clients, rejects unknown games, preserves statuses and never caches errors", async () => {
  const f = fixture();
  function route(user, service = f.service) {
    return load(join("src", "app", "api", "multiplayer", "[game]", "route.ts"), {
      "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
      "@/lib/serverAuth": { getServerSessionUser: async () => user },
      "@/lib/multiplayer": { ...f, multiplayer: service },
      "@/lib/requestOrigin": load(join("src", "lib", "requestOrigin.ts"), { "./siteUrl": { SITE_URL: "https://example.test" } }),
    });
  }
  const context = { params: Promise.resolve({ game: "7-up-down" }) };
  const request = () => new Request("https://example.test/api/multiplayer/7-up-down", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bet(1)) });
  const guest = route(null);
  assert.equal((await guest.GET(new Request("https://example.test"), context)).status, 200);
  assert.equal((await guest.POST(request(), context)).status, 401);
  assert.equal((await route({ id: "u1", dbRole: "agent" }).POST(request(), context)).status, 403);
  const denied = await guest.GET(new Request("https://example.test"), { params: Promise.resolve({ game: "not-a-game" }) });
  assert.equal(denied.status, 404);
  assert.match(denied.headers.get("Cache-Control"), /no-store/);
  const broken = route(null, { read: async () => { throw new f.MultiplayerError("Database busy", 503); } });
  assert.equal((await broken.GET(new Request("https://example.test"), context)).status, 503);
  f.seed("users", "u1", { ...f.document("users", "u1"), blockedGames: ["7-up-down"] });
  assert.equal((await route({ id: "u1", dbRole: "client" }).POST(request(), context)).status, 403);
  assert.equal(f.rows("multiplayerrequests").length, 0);
});

test("Production store uses one transaction/connection and InnoDB row locks, bounded SQL, no fallback", async () => {
  const calls = [];
  const connection = {
    ping: async () => {},
    query: async (sql, params) => { calls.push({ sql, params }); return sql.includes(" AS now") ? [[{ now: "123456" }]] : [[]]; },
    execute: async (sql, params) => { calls.push({ sql, params }); return [{}]; },
    beginTransaction: async () => calls.push("begin"),
    commit: async () => calls.push("commit"),
    rollback: async () => calls.push("rollback"),
    release: () => calls.push("release"),
  };
  const loaded = load(join("src", "lib", "multiplayer-store.ts"), { "./mysql": { ensureMysqlTable: async () => {}, getMysqlPool: async () => ({ getConnection: async () => connection }) } });
  await loaded.mysqlMultiplayerStore.transact("multiplayer:7-up-down", async tx => {
    assert.equal(await tx.now(), 123456);
    await tx.get("users", "u1", true);
    await tx.put("users", "u1", { _id: "u1", balance: 42 });
    await tx.find("games", "slug", "7-up-down", 90000);
  });

  test("Store exact filters preserve JSON scalar types, sort numerically before limiting, and remove transactionally", async () => {
    const calls = [];
    const connection = {
      ping: async () => {},
      query: async (sql, params) => { calls.push({ sql, params }); return [[]]; },
      execute: async (sql, params) => { calls.push({ sql, params }); return [{}]; },
      beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {},
    };
    const { mysqlMultiplayerStore } = load(join("src", "lib", "multiplayer-store.ts"), { "./mysql": { ensureMysqlTable: async () => {}, getMysqlPool: async () => ({ getConnection: async () => connection }) } });
    await mysqlMultiplayerStore.transact("aviator", async tx => {
      await tx.findWhere("gameresults", { gameId: "real'game", roundNo: 12, outcome: "pending", betSlot: 0, claimed: false, resultData: null }, 50, { field: "roundNo", direction: "desc" });
      const select = calls.at(-1);
      assert.match(select.sql, /ORDER BY CASE WHEN JSON_TYPE\(JSON_EXTRACT\(data, '\$\.roundNo'\)\) IN \('INTEGER', 'DOUBLE', 'DECIMAL'\) THEN CAST\(JSON_UNQUOTE\(JSON_EXTRACT\(data, '\$\.roundNo'\)\) AS DECIMAL\(65,20\)\) END DESC, JSON_UNQUOTE\(JSON_EXTRACT\(data, '\$\.roundNo'\)\) DESC, id ASC LIMIT 50$/);
      assert.doesNotMatch(select.sql, /= JSON_EXTRACT\(\?, '\$'\)/, "MariaDB JSON expression equality must not hide existing rounds");
      assert.match(select.sql, /JSON_TYPE\(JSON_EXTRACT\(data, '\$\.resultData'\)\) = 'NULL'/);
      assert.match(select.sql, /BINARY JSON_UNQUOTE\(JSON_EXTRACT\(data, '\$\.gameId'\)\) = BINARY \?/);
      assert.match(select.sql, /JSON_TYPE\(JSON_EXTRACT\(data, '\$\.claimed'\)\) = 'BOOLEAN'/);
      assert.doesNotMatch(select.sql, /\bAS JSON\b/i, "MariaDB does not support CAST(... AS JSON)");
      assert.deepEqual(select.params, ["real'game", 12, "pending", 0, "false"]);
      assert.ok(!select.sql.includes("real'game"));
      await tx.findWhere("aviatorrounds", {}, 90000);
      assert.match(calls.at(-1).sql, /ORDER BY id ASC LIMIT 1000$/);
      await tx.remove("cardbets", "bet-id");
      assert.deepEqual(calls.at(-1), { sql: "DELETE FROM `cardbets` WHERE id = ?", params: ["bet-id"] });
      const before = calls.length;
      for (const [filters, limit, sort] of [
        [{ "gameId') OR 1=1 --": "x" }, 1],
        [{ roundNo: Infinity }, 1],
        [{ roundNo: { $gt: 0 } }, 1],
        [{ roundNo: undefined }, 1],
        [{ roundNo: 1 }, NaN],
        [{}, 1, { field: "roundNo", direction: "desc; DELETE" }],
        [{}, 1, { field: "roundNo') DESC --", direction: "desc" }],
      ]) await assert.rejects(tx.findWhere("gameresults", filters, limit, sort));
      assert.equal(calls.length, before, "Invalid queries never reach MySQL");
    });

    test("Hot-reloaded store creates required tables despite a resolved legacy initialization promise", async () => {
      const oldPool = globalThis.__winkoxMysqlPool, oldInit = globalThis.__winkoxInitPromise;
      const tables = new Set(), events = [];
      let failCreate = true;
      const connection = {
        ping: async () => {},
        query: async sql => { events.push(sql); return [[]]; },
        execute: async sql => {
          assert.ok(tables.has("multiplayerlocks"), "Lock table exists before first transactional lock insert");
          events.push(sql); return [{}];
        },
        beginTransaction: async () => events.push("begin"),
        commit: async () => events.push("commit"),
        rollback: async () => events.push("rollback"),
        release: () => events.push("release"),
      };
      const pool = {
        listenerCount: () => 1,
        execute: async sql => {
          const table = sql.match(/CREATE TABLE IF NOT EXISTS `([^`]+)`/)?.[1];
          assert.ok(table, "Only required table DDL is executed by initialization");
          events.push(`ensure:${table}`);
          if (failCreate) throw new Error("fixture schema permission failure");
          tables.add(table); return [{}];
        },
        getConnection: async () => { events.push("connection"); return connection; },
      };
      globalThis.__winkoxMysqlPool = pool;
      globalThis.__winkoxInitPromise = Promise.resolve(true);
      try {
        const mysql = load(join("src", "lib", "mysql.ts"), { "mysql2/promise": { default: { createPool: () => { throw new Error("No real pool allowed"); } } } });
        const { mysqlMultiplayerStore } = load(join("src", "lib", "multiplayer-store.ts"), { "./mysql": mysql });
        await assert.rejects(mysqlMultiplayerStore.transact("multiplayer:baccarat", async () => "ok"), /schema permission failure/);
        assert.ok(!events.includes("connection"), "DDL failure never starts a financial transaction");
        failCreate = false;
        assert.equal(await mysqlMultiplayerStore.transact("multiplayer:baccarat", async () => "ok"), "ok");
        assert.deepEqual([...tables].sort(), ["dailypoolentries", "dailypools", "multiplayerlocks", "multiplayerrequests", "multiplayerrooms"]);
        assert.ok(events.indexOf("ensure:multiplayerrequests") < events.indexOf("connection"));
        const creates = events.filter(value => value.startsWith("ensure:")).length;
        await mysqlMultiplayerStore.transact("multiplayer:baccarat", async () => "again");
        assert.equal(events.filter(value => value.startsWith("ensure:")).length, creates, "Verified tables are not recreated on every read");
        assert.ok(events.includes("commit"));
      } finally {
        if (oldPool === undefined) delete globalThis.__winkoxMysqlPool; else globalThis.__winkoxMysqlPool = oldPool;
        if (oldInit === undefined) delete globalThis.__winkoxInitPromise; else globalThis.__winkoxInitPromise = oldInit;
      }
    });

    function cleanupFixture({ failAudit = false, failRoom = false } = {}) {
      let snapshot;
      const state = { rooms: {}, requests: {}, users: {}, audit: [] }, queries = [], events = [];
      const room = {
        _id: "7-up-down", game: "7-up-down", gameId: "catalog-7-up-down", roundNo: 1, startedAt: 1_000_000,
        outcome: fixed["7-up-down"], settled: false,
        bets: [
          { id: "selected-pending", userId: "u1", status: "pending", amount: 50 },
          { id: "other-pending", userId: "u2", status: "pending", amount: 60 },
          { id: "selected-old", userId: "u1", status: "win", settledAt: 100, amount: 100 },
          { id: "selected-recent", userId: "u1", status: "lose", settledAt: 300, amount: 100 },
          { id: "other-old", userId: "u2", status: "win", settledAt: 100, amount: 100 },
        ],
        queuedBets: [{ id: "selected-queued", userId: "u1", status: "pending", amount: 70 }],
        history: [{ roundNo: 0, result: fixed["7-up-down"] }],
      };
      state.rooms["7-up-down"] = structuredClone(room);
      state.users.u1 = { _id: "u1", role: "client", balance: 500, isActive: false };
      state.users.u2 = { _id: "u2", role: "client", balance: 600, isActive: false };
      state.requests.r1 = { userId: "u1" };
      state.requests.r2 = { userId: "u2" };
      state.requests.legacy = { fingerprint: "opaque-pre-metadata-key" };
      const connection = {
        async beginTransaction() { snapshot = structuredClone(state); events.push("begin"); },
        async execute(sql, values = []) {
          queries.push({ sql, values });
          if (sql.startsWith("SELECT id, data FROM users") || sql.startsWith("SELECT id FROM users")) {
            events.push("wallet-lock");
            return [Object.values(state.users).filter(user => !sql.includes("AND id = ?") || user._id === values[0]).map(user => ({ id: user._id, data: structuredClone(user) }))];
          }
          if (sql.startsWith("SELECT id, data FROM multiplayerrooms")) return [Object.entries(state.rooms).map(([id, data]) => ({ id, data: structuredClone(data) }))];
          if (sql.startsWith("SELECT id FROM multiplayerlocks")) { events.push(`room-lock:${values[0]}`); return [[{ id: values[0] }]]; }
          if (sql.startsWith("UPDATE multiplayerrooms")) {
            if (failRoom) throw new Error("fixture room update failure");
            state.rooms[values[1]] = JSON.parse(values[0]); return [{ affectedRows: 1 }];
          }
          if (sql.startsWith("DELETE FROM multiplayerrooms")) { delete state.rooms[values[0]]; return [{ affectedRows: 1 }]; }
          if (sql.startsWith("DELETE FROM multiplayerrequests")) {
            let count = 0;
            for (const [id, receipt] of Object.entries(state.requests)) if (!values.length || values.includes(receipt.userId)) { delete state.requests[id]; count++; }
            return [{ affectedRows: count }];
          }
          if (sql.startsWith("SELECT id FROM supportthreads") || sql.startsWith("SELECT JSON_UNQUOTE")) return [[]];
          if (sql.startsWith("DELETE FROM `users`")) { delete state.users[values[0]]; return [{ affectedRows: 1 }]; }
          if (sql.startsWith("UPDATE users SET data = JSON_REMOVE")) {
            for (const id of values.slice(1)) if (state.users[id]) state.users[id].balance = 0;
          }
          if (sql.startsWith("INSERT INTO adminlogs")) {
            if (failAudit) throw new Error("fixture cleanup audit failure");
            state.audit.push(JSON.parse(values[1]));
          }
          return [{ affectedRows: 0 }];
        },
        async commit() { events.push("commit"); },
        async rollback() { Object.assign(state, snapshot); events.push("rollback"); },
        release() { events.push("release"); },
      };
      const mysql = {
        ensureMysqlTable: async (table, strict) => { assert.equal(strict, true); events.push(`ensure:${table}`); },
        ensureMysqlReady: async () => true,
        getMysqlPool: async () => ({ getConnection: async () => connection }),
      };
      const cleanup = load(join("src", "lib", "multiplayer-cleanup.ts"), { "./mysql": mysql, "./multiplayer-types": types, "./multiplayer-rules": rules, "./dailyPoolRules": poolRules });
      return {
        ...load(join("src", "lib", "playerDataReset.ts"), { "./mysql": mysql, "./multiplayer-cleanup": cleanup, "./sharedLegacyCardCleanup": load(join("src", "lib", "sharedLegacyCardCleanup.ts"), {}) }),
        ...load(join("src", "lib", "selectedHistoryCleanup.ts"), { "./mysql": mysql, "./multiplayer-cleanup": cleanup }),
        state, queries, events, original: room,
      };
    }

    test("Individual account deletion atomically prunes pending/current/queued room bets and owned receipts", async () => {
      const f = cleanupFixture();
      await f.resetPlayerData({ userId: "u1", deleteAccount: true, actorId: "owner", actorName: "Owner" });
      const room = f.state.rooms["7-up-down"];
      assert.equal(f.state.users.u1, undefined);
      assert.deepEqual(room.bets.map(b => b.id), ["other-pending", "other-old"]);
      assert.deepEqual(room.queuedBets, []);
      assert.deepEqual(room.history, f.original.history, "One player's deletion preserves the common public result history");
      assert.equal(f.state.users.u2.balance, 600, "Other wallets are neither refunded nor reset");
      assert.deepEqual(Object.keys(f.state.requests).sort(), ["legacy", "r2"]);
      assert.equal(f.events.filter(event => event.startsWith("room-lock:")).length, 70);
      assert.ok(f.events.lastIndexOf("room-lock:multiplayer:tai-xiu") < f.events.indexOf("wallet-lock"));
      assert.ok(f.events.includes("commit"));
    });

    test("Reset never refunds removed reserved wagers; full reset clears shared room data and receipts", async () => {
      const individual = cleanupFixture();
      await individual.resetPlayerData({ userId: "u1", actorId: "owner", actorName: "Owner" });
      assert.equal(individual.state.users.u1.balance, 0);
      assert.equal(individual.state.users.u2.balance, 600);
      assert.ok(individual.state.rooms["7-up-down"].bets.every(b => b.userId !== "u1"));
      const all = cleanupFixture();
      await all.resetPlayerData({ actorId: "owner", actorName: "Owner" });
      assert.deepEqual(all.state.rooms, {});
      assert.deepEqual(all.state.requests, {});
      assert.ok(Object.values(all.state.users).every(user => user.balance === 0));
    });

    test("Selected games history prunes only selected owner's settled records within cutoff; no pending/balance/result/receipt changes", async () => {
      const f = cleanupFixture();
      await f.deleteSelectedHistory({ userId: "u1", selection: { categories: ["games"], from: new Date(50), before: new Date(200) }, actorId: "owner", actorName: "Owner" });
      const room = f.state.rooms["7-up-down"];
      assert.deepEqual(room.bets.map(b => b.id), ["selected-pending", "other-pending", "selected-recent", "other-old"]);
      assert.deepEqual(room.queuedBets, f.original.queuedBets);
      assert.deepEqual(room.history, f.original.history);
      assert.equal(f.state.users.u1.balance, 500);
      assert.equal(f.state.users.u2.balance, 600);
      assert.equal(Object.keys(f.state.requests).length, 3, "History deletion preserves durable idempotency receipts");
      assert.ok(f.events.includes("commit"));
    });

    test("Room cleanup and deletion audit failures rollback all room/account/request changes", async () => {
      for (const options of [{ failRoom: true }, { failAudit: true }]) {
        const f = cleanupFixture(options);
        await assert.rejects(f.resetPlayerData({ userId: "u1", deleteAccount: true, actorId: "owner", actorName: "Owner" }), /fixture/);
        assert.deepEqual(f.state.rooms["7-up-down"], f.original);
        assert.equal(f.state.users.u1.balance, 500);
        assert.equal(Object.keys(f.state.requests).length, 3);
        assert.ok(f.events.includes("rollback"));
        assert.ok(!f.events.includes("commit"));
      }
      const f = cleanupFixture({ failAudit: true });
      await assert.rejects(f.deleteSelectedHistory({ userId: "u1", selection: { categories: ["games"], before: new Date(200) }, actorId: "owner", actorName: "Owner" }), /audit failure/);
      assert.deepEqual(f.state.rooms["7-up-down"], f.original);
      assert.ok(f.events.includes("rollback"));
    });
    const f = fixture();
    f.seed("cardbets", "delete-me", { _id: "delete-me", roundNo: 5 });
    await assert.rejects(f.store.transact("cards", async tx => {
      await tx.remove("cardbets", "delete-me");
      assert.equal(await tx.get("cardbets", "delete-me"), null);
      throw new Error("rollback removal");
    }), /rollback removal/);
    assert.ok(f.document("cardbets", "delete-me"));
    await f.store.transact("cards", tx => tx.remove("cardbets", "delete-me"));
    assert.equal(f.document("cardbets", "delete-me"), undefined);
  });
  const sql = calls.filter(c => typeof c === "object").map(c => c.sql).join("\n");
  assert.match(sql, /ISOLATION LEVEL READ COMMITTED/);
  assert.match(sql, /multiplayerlocks.*FOR UPDATE/);
  assert.match(sql, /users.*FOR UPDATE/);
  assert.match(sql, /LIMIT 1000/);
  assert.deepEqual(calls.filter(c => typeof c === "string"), ["begin", "commit", "release"]);
  await assert.rejects(loaded.mysqlMultiplayerStore.transact("multiplayer:7-up-down", async tx => {
    await tx.put("users", "u1", { balance: 20 });
    throw new Error("abort transaction");
  }), /abort transaction/);
  assert.deepEqual(calls.filter(c => typeof c === "string").slice(-3), ["begin", "rollback", "release"]);
  const unavailable = load(join("src", "lib", "multiplayer-store.ts"), { "./mysql": { getMysqlPool: async () => null } });
  await assert.rejects(unavailable.mysqlMultiplayerStore.transact("multiplayer:7-up-down", async () => {}), /configured MySQL/);
});
