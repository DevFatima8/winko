import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

const day = Date.parse("2026-10-24T08:00:00Z");
const tomorrow = Date.parse("2026-10-24T19:00:00Z");
const scene = (users = ["alice", "bob"]) => {
  const s = createLegacyScene(users, { poolEnabled: true });
  s.at(day);
  return s;
};
const run = (s, fn) => s.store.transact("test", fn);
async function wager(s, id, userId, amount, game = "aviator") {
  return run(s, async tx => {
    const result = { _id: id, userId, gameId: game, betAmount: amount, winAmount: 0, outcome: "pending", createdAt: new Date(day) };
    await s.pool.addPoolWager(tx, game, result);
    await tx.insert("gameresults", id, result);
    const user = await tx.get("users", userId);
    user.balance -= amount;
    await tx.put("users", userId, user);
  });
}
const close = (s, id, claim = 0, cancel = false) => run(s, tx => s.pool.closePoolWager(tx, id, claim, cancel));
async function legacyFlightBet(s, userId, table, amount) {
  await s.flight.placeBet(userId, table, amount, 0);
  await run(s, async tx => {
    const bet = s.data.gameresults.find(result => result.userId === userId && result.outcome === "pending");
    delete bet.flightModel;
    await s.pool.addPoolWager(tx, table, bet);
    await tx.put("gameresults", bet._id, bet);
  });
}
const settle = (s, game = "aviator") => run(s, tx => s.pool.settleDailyPools(tx, game));
const paid = s => s.data.dailypoolentries.reduce((sum, entry) => sum + entry.payoutCents, 0);

test("Pakistan day boundary, per-game locks and disclosed contract", () => {
  const rules = scene().poolRules;
  assert.equal(rules.pakistanDay(tomorrow - 1), "2026-10-24");
  assert.equal(rules.pakistanDay(tomorrow), "2026-10-25");
  assert.equal(rules.DAILY_POOL_GAMES.length, 70);
  assert.equal(new Set(rules.DAILY_POOL_GAMES.map(rules.dailyPoolLock)).size, 70);
  assert.equal(rules.dailyPoolLock("aviator"), "aviator:shared:v2");
  assert.match(rules.DAILY_POOL_RULES.join(" "), /NOT an instant/);
  assert.match(rules.DAILY_POOL_RULES.join(" "), /including losing rounds/);
});

test("early cashouts are claims, and all credits total exactly 35% including returned stake", async () => {
  const s = scene();
  await wager(s, "a", "alice", 100);
  await wager(s, "b", "bob", 300);
  await close(s, "a", 200);
  await close(s, "b", 600);
  assert.equal(s.users.get("alice").balance, 900);
  await settle(s);
  assert.equal(paid(s), 0, "today must not settle");
  s.at(tomorrow);
  await settle(s);
  const total = paid(s);
  assert.ok(total > 0 && total <= 14000, "one 1x-2x winner, never above the 35% pool");
  assert.equal(Math.round((s.users.get("alice").balance + s.users.get("bob").balance) * 100), 160000 + total);
  assert.ok(s.users.get("alice").balance >= 900);
  assert.ok(s.users.get("bob").balance >= 700);
  assert.equal(s.data.winholds.length, 0);
  assert.ok(s.data.gameresults.every(result => result.poolPending === false));
  const snapshot = structuredClone(s.data);
  await settle(s);
  assert.deepEqual(s.data, snapshot, "repeated settlement must be a no-op");
});

test("all 70 catalog games keep separate daily budgets and distribute exactly 35% without cross-game subsidy", async () => {
  const s = scene();
  for (const game of s.poolRules.DAILY_POOL_GAMES) {
    await wager(s, `${game}:a`, "alice", 1, game);
    await wager(s, `${game}:b`, "bob", 3, game);
    await close(s, `${game}:a`, 0);
    await close(s, `${game}:b`, 12);
  }
  s.at(tomorrow);
  for (const game of s.poolRules.DAILY_POOL_GAMES) {
    await settle(s, game);
    const entries = s.data.dailypoolentries.filter(entry => entry.game === game);
    assert.equal(entries.reduce((sum, entry) => sum + entry.payoutCents, 0), 140, game);
    assert.equal(entries.find(entry => entry.userId === "alice").payoutCents, 0, game);
    assert.equal(entries.find(entry => entry.userId === "bob").payoutCents, 140, game);
  }
  assert.equal(paid(s), 9800);
});

test("single bettor receives 35% of stake, not their multiplier claim", async () => {
  const s = scene();
  await wager(s, "a", "alice", 100);
  await close(s, "a", 5000);
  s.at(tomorrow);
  await settle(s);
  assert.equal(s.users.get("alice").balance, 935);
});

test("no successful claim falls back to all accepted stakes; losers are not final until settlement", async () => {
  const s = scene();
  await wager(s, "a", "alice", 100, "fortune-gems");
  await wager(s, "b", "bob", 300, "fortune-gems");
  await close(s, "a");
  await close(s, "b");
  s.at(tomorrow);
  await settle(s, "fortune-gems");
  assert.equal(s.data.dailypoolentries.find(e => e._id === "a").payoutCents, 3500);
  assert.equal(s.data.dailypoolentries.find(e => e._id === "b").payoutCents, 10500);
});

test("multiplier, card and roulette games pay only 10 of every 100 wagers, each 1x-2x of stake, within the 35% pool", async () => {
  for (const game of [
    "aviator", "dice", "auto-roulette",
    "blackjack", "dragon-tiger", "baccarat", "andar-bahar", "muflis", "amar-akbar-anthony",
    "32-cards", "bollywood-casino", "casino-war", "monster-hilo", "poker-betting", "red-vs-black",
    "rummy", "speed-baccarat", "teen-patti", "teen-patti-999", "teen-patti-ak47", "teen-patti-best-of-four",
    "teen-patti-faceoff", "teen-patti-hukam", "teen-patti-joker", "texas-holdem", "three-card-poker", "three-cards",
  ]) {
    const players = Array.from({ length: 100 }, (_, i) => `player-${i}`);
    const s = scene(players);
    assert.ok(s.poolRules.TEN_WIN_POOL_GAMES.includes(game), `${game}: enrolled in the 10/100 settlement rule`);
    await run(s, async tx => {
      for (let i = 0; i < 100; i++) {
        const id = `${game}-${String(i).padStart(3, "0")}`;
        const result = { _id: id, gameId: game, userId: players[i], betAmount: 100, winAmount: 0, outcome: "pending" };
        await s.pool.addPoolWager(tx, game, result);
        await tx.insert("gameresults", id, result);
        await s.pool.closePoolWager(tx, id, i < 40 ? 150 : 0);
      }
    });
    s.at(tomorrow);
    await settle(s, game);
    const winners = s.data.dailypoolentries.filter(e => e.payoutCents > 0);
    assert.equal(winners.length, 10, game);
    assert.equal(new Set(winners.map(entry => entry.userId)).size, 10, `${game}: ten distinct winners in this 100-player sample`);
    for (const winner of winners) {
      assert.ok(winner.claimCents > 0, `${game}: winners come from positive claims`);
      assert.ok(winner.payoutCents >= 10000 && winner.payoutCents <= 20000, `${game}: payout must be 1x-2x of stake`);
    }
    assert.ok(paid(s) <= 350000, `${game}: never more than the 35% pool`);
    assert.equal(s.data.dailypools.find(p => p.game === game && p.status === "settled").houseCents, 350000 - paid(s));
  }
});

test("successful claims exclude non-claim weights; cancelled bets are excluded", async () => {
  const s = scene();
  await wager(s, "a", "alice", 100);
  await wager(s, "b", "bob", 300);
  await wager(s, "c", "bob", 500);
  await close(s, "a", 120);
  await close(s, "b");
  await close(s, "c", 0, true);
  s.at(tomorrow);
  await settle(s);
  assert.ok(paid(s) >= 10000 && paid(s) <= 14000, "only the positive claim wins, 1x-2x within the pool");
  assert.equal(s.data.dailypoolentries.find(e => e._id === "b").payoutCents, 0);
  assert.equal(s.data.dailypoolentries.find(e => e._id === "c").status, "cancelled");
});

test("unfinished wagers delay this and later days without forced loss; fractional paisa carries chronologically", async () => {
  const s = scene();
  await wager(s, "a", "alice", .01);
  s.at(tomorrow);
  await wager(s, "b", "bob", .02);
  await close(s, "b", .02);
  s.at(tomorrow + 86400000);
  await settle(s);
  assert.equal(s.data.dailypools.filter(p => p.status === "settled").length, 0);
  await close(s, "a", .01);
  await settle(s);
  assert.equal(paid(s), 1);
  assert.equal(s.data.dailypools.find(p => p._id === "aviator:rounding").remainder, 5);
  assert.equal(s.data.dailypools.find(p => p.day === "2026-10-24").carryOut, 35);
  assert.equal(s.data.dailypools.find(p => p.day === "2026-10-25").carryIn, 35);
});

test("games maintain separate pools; zero/cancelled-only days do not manufacture money", async () => {
  const s = scene();
  await wager(s, "a", "alice", 100);
  await close(s, "a", 500);
  await wager(s, "b", "bob", 200, "chicken-dash");
  await close(s, "b", 200);
  await wager(s, "c", "bob", 50, "chicken-road-2");
  await close(s, "c", 0, true);
  s.at(tomorrow);
  await settle(s);
  assert.equal(paid(s), 3500);
  await settle(s, "chicken-dash");
  await settle(s, "chicken-road-2");
  assert.equal(paid(s), 10500);
  assert.equal(s.data.dailypools.find(p => p.game === "chicken-road-2").budgetCents, 0);
});

test("largest remainder conserves paisa, never pays zero weights, uses stable ties and rejects bad input", () => {
  const s = scene();
  assert.deepEqual([...s.pool.allocatePool(1, [{ id: "b", weight: 1 }, { id: "a", weight: 1 }, { id: "zero", weight: 0 }])], [["b", 0], ["a", 1], ["zero", 0]]);
  assert.throws(() => s.pool.allocatePool(1, [{ id: "a", weight: 0 }]), /weights/);
  assert.throws(() => s.pool.allocatePool(-1, []), /budget/);
  assert.throws(() => s.pool.allocatePool(1, [{ id: "a", weight: NaN }]), /weight/);
  assert.throws(() => s.pool.allocatePool(1, [{ id: "a", weight: 1 }, { id: "a", weight: 1 }]), /Duplicate/);
  assert.throws(() => s.pool.cents(Infinity), /Invalid/);
  for (let n = 1; n < 80; n++) {
    const weights = Array.from({ length: n }, (_, i) => ({ id: String(i).padStart(3, "0"), weight: i % 7 }));
    if (!weights.some(w => w.weight)) continue;
    const allocation = s.pool.allocatePool(n * 103, weights);
    assert.equal([...allocation.values()].reduce((a, b) => a + b), n * 103);
    for (const w of weights) if (!w.weight) assert.equal(allocation.get(w.id), 0);
  }
});

test("keyset pagination settles more than 1000 entries without truncation", async () => {
  const s = scene();
  await run(s, async tx => {
    for (let i = 0; i < 1201; i++) {
      const id = `entry-${String(i).padStart(5, "0")}`;
      const result = { _id: id, gameId: "aviator", userId: i % 2 ? "alice" : "bob", betAmount: 1, winAmount: 0, outcome: "pending" };
      await s.pool.addPoolWager(tx, "aviator", result);
      await tx.insert("gameresults", id, result);
      await s.pool.closePoolWager(tx, id, 1);
    }
  });
  s.at(tomorrow);
  await settle(s);
  assert.equal(s.data.dailypoolentries.filter(e => e.status === "settled").length, 1201);
  const winners = s.data.dailypoolentries.filter(e => e.payoutCents > 0);
  assert.equal(winners.length, 120);
  assert.ok(winners.every(e => e.payoutCents >= 100 && e.payoutCents <= 200));
});

test("wallet or result failure rolls all credits, ledger and carry back; retries are safe", async () => {
  for (const fail of ["users", "gameresults", "dailypoolentries", "dailypools"]) {
    const s = scene();
    await wager(s, "a", "alice", 100);
    await close(s, "a", 200);
    s.at(tomorrow);
    const before = structuredClone(s.data);
    s.failNext(fail);
    await assert.rejects(settle(s), /Injected/);
    assert.deepEqual(s.data, before);
    await Promise.all([settle(s), settle(s)]);
    assert.equal(paid(s), 3500);
    assert.equal(s.users.get("alice").balance, 935);
  }
});

test("missing wallet/result prevents silent money loss and duplicate close is rejected", async () => {
  const s = scene();
  await wager(s, "a", "alice", 100);
  await close(s, "a", 200);
  await assert.rejects(close(s, "a", 200), /already/);
  assert.equal(await close(s, "legacy", 200), false);
  s.at(tomorrow);
  s.data.gameresults.splice(0);
  await assert.rejects(settle(s), /result missing/);
  assert.equal(s.users.get("alice").balance, 900);
  s.data.users.splice(0, 1);
  await assert.rejects(settle(s), /wallet missing/);
});

for (const table of ["aviator", "aviator-x"]) {
  test(`${table}: already accepted legacy cashout retains its pool claim; midnight settlement pays once`, async () => {
    const s = scene();
    const first = await s.flight.getState("alice", table);
    await legacyFlightBet(s, "alice", table, 100);
    s.at(first.round.startsAt + 20);
    const replies = await Promise.all([s.flight.cashOut("alice", table, 0), s.flight.cashOut("alice", table, 0)]);
    const claimed = replies.find(reply => reply.ok);
    assert.equal(replies.filter(reply => reply.ok).length, 1);
    assert.equal(claimed.poolPending, true);
    assert.ok(claimed.poolClaim >= 100);
    assert.equal(claimed.win, 0);
    assert.equal(s.users.get("alice").balance, 900);
    assert.equal(s.data.winholds.length, 0);
    s.at(tomorrow);
    await settle(s, table);
    assert.equal(s.users.get("alice").balance, 935);
  });
}

test("Aviator X retains personal rounds and new-mode cancellation refunds once", async () => {
  const s = scene();
  const alice = await s.flight.getState("alice", "aviator-x");
  s.at(day + 100);
  const bob = await s.flight.getState("bob", "aviator-x");
  assert.notEqual(alice.round.startsAt, bob.round.startsAt);
  await legacyFlightBet(s, "alice", "aviator-x", 100);
  assert.equal((await s.flight.getState("bob", "aviator-x")).bets.length, 0);
  assert.equal((await s.flight.cancelBet("alice", "aviator-x")).ok, true);
  assert.ok((await s.flight.cancelBet("alice", "aviator-x")).error);
  assert.equal(s.users.get("alice").balance, 1000);
  assert.equal(s.data.dailypoolentries[0].status, "cancelled");
});

for (const game of ["aviator", "aviator-x"]) {
  test(`${game}: scheduled processing advances abandoned wagers before daily settlement`, async () => {
    const s = scene();
    await legacyFlightBet(s, "alice", game, 100);
    await legacyFlightBet(s, "bob", game, 200);
    s.at(tomorrow);
    await s.poolService.processDailyPool(game);
    const aliceEntry = s.data.dailypoolentries.find(entry => entry.userId === "alice");
    const bobEntry = s.data.dailypoolentries.find(entry => entry.userId === "bob");
    assert.equal(Math.round(s.users.get("alice").balance * 100), 90000 + aliceEntry.payoutCents);
    assert.equal(Math.round(s.users.get("bob").balance * 100), 80000 + bobEntry.payoutCents);
    assert.equal([aliceEntry, bobEntry].filter(entry => entry.payoutCents > 0).length, 1, "one winning wager");
    assert.ok(s.data.dailypoolentries.every(entry => entry.status === "settled"));
    const total = paid(s);
    assert.ok(total >= 10000 && total <= 10500);
    await s.poolService.processDailyPool(game);
    assert.equal(paid(s), total);
    const alice = await s.poolService.playerPoolStatus("alice", game);
    assert.equal(Math.round(alice.balance * 100), 90000 + aliceEntry.payoutCents);
    assert.equal(alice.entries.length, 1);
    assert.equal(alice.entries[0].payout, aliceEntry.payoutCents / 100);
  });
}

test("corrupt carry or mismatched result stops settlement without wallet changes", async () => {
  const s = scene();
  await wager(s, "a", "alice", 100);
  await close(s, "a", 200);
  s.at(tomorrow);
  s.data.dailypools.push({ _id: "aviator:rounding", remainder: 100 });
  await assert.rejects(settle(s), /rounding ledger/);
  s.data.dailypools.pop();
  s.data.gameresults[0].userId = "bob";
  await assert.rejects(settle(s), /does not reconcile/);
  assert.equal(s.users.get("alice").balance, 900);
});

for (const slug of ["chicken-road-2", "chicken-dash"]) {
  test(`${slug}: transactional start, step and claim; settled source matches wallet and result`, async () => {
    const s = scene();
    const started = await s.chicken.startPoolChicken("alice", slug, 100, "easy");
    assert.equal(started.ok, true);
    const table = slug === "chicken-road-2" ? "chickengames" : "chickendashes";
    s.data[table][0].crashLane = 100; // Known safe fixture, never a live wager.
    assert.equal((await s.chicken.actPoolChicken("alice", slug, "step")).event, "safe");
    const result = await s.chicken.actPoolChicken("alice", slug, "cashout");
    assert.equal(result.poolPending, true);
    assert.equal(result.win, 0);
    assert.equal(s.users.get("alice").balance, 900);
    assert.equal(s.data.winholds.length, 0);
    s.at(tomorrow);
    await settle(s, slug);
    assert.equal(s.users.get("alice").balance, 935);
    assert.equal(s.data[table][0].winAmount, 35);
    assert.equal(s.data[table][0].poolPending, false);
    assert.equal(s.data.gameresults[0].winAmount, 35);
  });
  test(`${slug}: failed creation rolls debit back; death stays pending and legacy action delegates`, async () => {
    const s = scene();
    s.failNext("gameresults");
    await assert.rejects(s.chicken.startPoolChicken("alice", slug, 100, "easy"), /Injected/);
    assert.equal(s.users.get("alice").balance, 1000);
    assert.equal(s.data.dailypoolentries.length, 0);
    await s.chicken.startPoolChicken("alice", slug, 100, "easy");
    const table = slug === "chicken-road-2" ? "chickengames" : "chickendashes";
    s.data[table][0].crashLane = 1;
    assert.equal((await s.chicken.actPoolChicken("alice", slug, "step")).event, "dead");
    assert.equal(s.data[table][0].poolPending, true);
    s.at(tomorrow);
    await settle(s, slug);
    assert.equal(s.users.get("alice").balance, 935);
    s.data[table].push({ _id: "legacy", userId: "bob", status: "active" });
    assert.equal(await s.chicken.actPoolChicken("bob", slug, "cashout"), null);
  });
}
