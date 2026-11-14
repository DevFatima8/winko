import assert from "node:assert/strict";
import test from "node:test";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

const cycleId = "limbo:bet-wins-30-of-100:v1";
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
  test(`${mode}: every block of 100 wagers has exactly 30 target-hit opportunities`, async () => {
    const s = scene(pooled);
    for (let block = 0; block < 3; block++) {
      let winners = 0;
      for (let i = block * 100; i < (block + 1) * 100; i++) {
        const target = targets[i % targets.length];
        const result = await play(s, players[i % 3], 10, target);
        assert.equal(result.ok, true, result.error);
        assert.equal(result.won, result.result >= target);
        assert.ok(result.result >= 1 && result.result <= 100);
        if (!pooled) assert.equal(result.payout > 0, result.won);
        winners += Number(result.won);
      }
      assert.equal(winners, 30);
      assert.equal(cycle(s).remaining.length, 100);
    }
    assert.equal(s.data.gameresults.length, 300);
  });

  test(`${mode}: concurrent bets from 100 different players share one block`, async () => {
    const s = scene(pooled);
    const results = await Promise.all(players.slice(0, 100).map(user => play(s, user)));
    assert.equal(results.filter(result => result.won).length, 30);
    assert.equal(cycle(s).remaining.length, 100);
  });

  test(`${mode}: repeated bets by the same player complete a 100-round cycle`, async () => {
    const s = scene(pooled, ["alice", "bob"]);
    let wins = 0;
    for (let i = 0; i < 100; i++) if ((await play(s, "alice")).won) wins++;
    assert.equal(wins, 30);
    assert.equal(cycle(s).remaining.length, 100);
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
    assert.equal(cycle(s).remaining.length, 99);
    assert.equal(s.data.gameresults.length, 1);
  });

  test(`${mode}: a failed transaction rolls back the player cycle and the wallet`, async () => {
    const s = scene(pooled, ["alice", "bob"]);
    s.data.multiplayerrooms.push({ _id: cycleId, remaining: [true] });
    const before = structuredClone(s.data);
    s.failNext("gameresults");
    await assert.rejects(play(s, "alice"), /Injected/);
    assert.deepEqual(s.data, before);
    assert.equal((await play(s, "alice")).won, true);
    assert.equal(cycle(s).remaining.length, 100);
  });

  test(`${mode}: a malformed persisted cycle fails without accepting a bet`, async () => {
    for (const bad of [
      { remaining: ["jackpot"] },
      { remaining: [] },
      { remaining: Array(100).fill(true) },
      { remaining: Array(100).fill(false) },
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
    s.data.multiplayerrooms.push({ _id: cycleId, remaining: [true] });
    const result = await play(s, "alice", 50000, 100);
    assert.equal(result.won, true);
    assert.equal(result.payout, 17500);
    assert.equal(result.balance, 67500);
    assert.notEqual(result.poolPending, true);
    assert.equal(s.data.winholds.length, 0);
    assert.equal(s.data.dailypoolentries.length, 0);
  });
}

test("concurrent mixed wagers never pay above 35% and assign exactly 30 target hits", async () => {
  const s = scene(false, players.slice(0, 100));
  const results = await Promise.all(players.slice(0, 100).map((user, i) => play(s, user, i % 2 ? 50000 : 11, 100)));
  assert.equal(results.filter(result => result.won).length, 30);
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
  s.data.multiplayerrooms.push({ _id: cycleId, remaining: [false] });
  await play(s, "alice", 50000, 100, "limbo-budget-loss-0001");
  cycle(s).remaining = [true];
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
