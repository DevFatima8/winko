import assert from "node:assert/strict";
import test from "node:test";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

const cycleId = "limbo:player-cycle:v1";
const players = Array.from({ length: 300 }, (_, i) => `player${String(i).padStart(3, "0")}`);
function scene(pooled, ids = players) {
  const s = createLegacyScene(ids, { poolEnabled: pooled });
  s.at(Date.parse("2026-10-25T12:00:00Z"));
  for (const user of s.data.users) user.balance = 100000;
  return s;
}
let requestNo = 0;
const play = (s, user, amount = 10, target = 2, request = `limbo-request-${String(++requestNo).padStart(8, "0")}`) =>
  s.limbo.play(user, amount, target, request);
const cycle = s => s.data.multiplayerrooms.find(row => row._id === cycleId);
const targets = [1.01, 1.5, 2, 5, 37.5, 100];

for (const pooled of [false, true]) {
  const mode = pooled ? "pooled" : "legacy";
  test(`${mode}: every block of 100 different players has exactly 20 winning players`, async () => {
    const s = scene(pooled);
    for (let block = 0; block < 3; block++) {
      const winners = new Set();
      for (let i = block * 100; i < (block + 1) * 100; i++) {
        const target = targets[i % targets.length];
        // Each player bets repeatedly in the block; only their first bet draws from the cycle.
        // The 100th player's first bet closes the block, so they bet once here.
        for (let repeat = 0; repeat < (i % 100 === 99 ? 1 : 3); repeat++) {
          const result = await play(s, players[i], 10, target);
          assert.equal(result.ok, true, result.error);
          assert.equal(result.won, result.result >= target);
          assert.ok(result.result >= 1 && result.result <= 100);
          if (repeat > 0) assert.equal(result.won, false);
          if (!pooled) assert.equal(result.payout > 0, result.won);
          if (result.won) winners.add(players[i]);
        }
      }
      assert.equal(winners.size, 20);
      assert.deepEqual(cycle(s).players, []);
      assert.equal(cycle(s).remaining.length, 100);
    }
    assert.equal(s.data.gameresults.length, 3 * (99 * 3 + 1));
  });

  test(`${mode}: concurrent bets from 100 different players share one block`, async () => {
    const s = scene(pooled);
    const results = await Promise.all(players.slice(0, 100).map(user => play(s, user)));
    assert.equal(results.filter(result => result.won).length, 20);
    assert.deepEqual(cycle(s).players, []);
  });

  test(`${mode}: repeated bets by the same players do not use up the 100-player block`, async () => {
    const s = scene(pooled, ["alice", "bob"]);
    let wins = 0;
    for (let i = 0; i < 50; i++) if ((await play(s, i % 2 ? "alice" : "bob")).won) wins++;
    assert.ok(wins <= 2);
    assert.deepEqual([...cycle(s).players].sort(), ["alice", "bob"]);
    assert.equal(cycle(s).remaining.length, 98);
  });

  test(`${mode}: a duplicate request replays once and invalid bets never draw a slot`, async () => {
    const s = scene(pooled, ["alice", "bob"]);
    const [a, b] = await Promise.all([play(s, "alice", 10, 2, "limbo-duplicate-0001"), play(s, "alice", 10, 2, "limbo-duplicate-0001")]);
    assert.equal(a.result, b.result);
    assert.equal(a.balance, b.balance);
    assert.equal(cycle(s).remaining.length, 99);
    assert.match((await play(s, "alice", 20, 2, "limbo-duplicate-0001")).error, /different wager/);
    for (const amount of [0, 5, NaN]) assert.ok((await play(s, "bob", amount)).error);
    assert.ok((await s.limbo.play("bob", 10, 2, "bad")).error);
    s.data.users.find(user => user._id === "bob").balance = 0;
    assert.match((await play(s, "bob")).error, /Insufficient/);
    assert.deepEqual(cycle(s).players, ["alice"]);
    assert.equal(s.data.gameresults.length, 1);
  });

  test(`${mode}: a failed transaction rolls back the player cycle and the wallet`, async () => {
    const s = scene(pooled, ["alice", "bob"]);
    s.data.multiplayerrooms.push({ _id: cycleId, players: Array.from({ length: 98 }, (_, i) => `old${i}`), remaining: ["win", "lose"] });
    const before = structuredClone(s.data);
    s.failNext("gameresults");
    await assert.rejects(play(s, "alice"), /Injected/);
    assert.deepEqual(s.data, before);
    assert.equal((await play(s, "alice")).won, true);
    assert.deepEqual(cycle(s).remaining, ["lose"]);
    assert.equal((await play(s, "alice")).won, false);
    assert.deepEqual(cycle(s).remaining, ["lose"]);
  });

  test(`${mode}: a malformed persisted cycle fails without accepting a bet`, async () => {
    for (const bad of [
      { players: [], remaining: ["jackpot"] },
      { players: ["a", "a"], remaining: Array(98).fill("lose") },
      { players: [], remaining: Array(100).fill("win") },
      { remaining: Array(100).fill("lose") },
    ]) {
      const s = scene(pooled, ["alice"]);
      s.data.multiplayerrooms.push({ _id: cycleId, ...bad });
      const before = structuredClone(s.data);
      await assert.rejects(play(s, "alice"), /cycle is invalid/);
      assert.deepEqual(s.data, before);
    }
  });
}

test("a no-win result is always below the target, including 1.01x", () => {
  const s = scene(false, ["alice"]);
  for (let i = 0; i < 2000; i++) {
    const target = targets[i % targets.length];
    assert.ok(s.limbo.roll(target, false).result < target);
    assert.ok(s.limbo.roll(target, true).result >= target);
  }
});

const budgetId = "limbo:instant-budget:v1";
for (const pooled of [false, true]) {
  test(`pool flag ${pooled}: a Rs. 50,000 first winning bet cannot pay a million or create extra holds`, async () => {
    const s = scene(pooled, ["alice"]);
    s.data.multiplayerrooms.push({ _id: cycleId, players: Array.from({ length: 99 }, (_, i) => `old${i}`), remaining: ["win"] });
    const result = await play(s, "alice", 50000, 100);
    assert.equal(result.won, true);
    assert.equal(result.payout, 17500);
    assert.equal(result.balance, 67500);
    assert.notEqual(result.poolPending, true);
    assert.equal(s.data.winholds.length, 0);
    assert.equal(s.data.dailypoolentries.length, 0);
  });
}

test("concurrent mixed wagers never pay above 35% and leave exactly 20 winners", async () => {
  const s = scene(false, players.slice(0, 100));
  const results = await Promise.all(players.slice(0, 100).map((user, i) => play(s, user, i % 2 ? 50000 : 11, 100)));
  assert.equal(results.filter(result => result.won).length, 20);
  let stakeCents = 0, paidCents = 0;
  for (const row of s.data.gameresults) {
    stakeCents += Math.round(row.betAmount * 100);
    paidCents += Math.round(row.winAmount * 100);
    assert.ok(BigInt(paidCents) <= BigInt(stakeCents) * 35n / 100n);
  }
  assert.deepEqual(s.data.multiplayerrooms.find(row => row._id === budgetId), { _id: budgetId, stakeCents, paidCents });
});

test("budget carries forward, replay does not fund it again, and transaction failure restores it", async () => {
  const s = scene(false, ["alice", "bob"]);
  s.data.multiplayerrooms.push({ _id: cycleId, players: Array.from({ length: 98 }, (_, i) => `old${i}`), remaining: ["lose", "win"] });
  await play(s, "alice", 50000, 100, "limbo-budget-loss-0001");
  const before = structuredClone(s.data);
  s.failNext("gameresults");
  await assert.rejects(play(s, "bob", 10, 100, "limbo-budget-win-0001"), /Injected/);
  assert.deepEqual(s.data, before);
  const win = await play(s, "bob", 10, 100, "limbo-budget-win-0001");
  assert.equal(win.payout, 980);
  const after = structuredClone(s.data);
  assert.equal((await play(s, "bob", 10, 100, "limbo-budget-win-0001")).payout, 980);
  assert.deepEqual(s.data, after);
});

test("corrupt persisted budgets reject a wager without consuming its slot or debiting the wallet", async () => {
  for (const bad of [
    { stakeCents: -1, paidCents: 0 }, { stakeCents: 100, paidCents: 36 },
    { stakeCents: 100.5, paidCents: 0 }, { stakeCents: Number.MAX_SAFE_INTEGER + 1, paidCents: 0 },
  ]) {
    const s = scene(false, ["alice"]);
    s.data.multiplayerrooms.push({ _id: budgetId, ...bad });
    const before = structuredClone(s.data);
    await assert.rejects(play(s, "alice"), /budget is invalid/);
    assert.deepEqual(s.data, before);
  }
});
