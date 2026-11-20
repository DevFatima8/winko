import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

const ruleModule = { exports: {} };
new Function("require", "exports", ts.transpileModule(
  readFileSync("src\\components\\thai-hi-lo\\lib\\hi-lo.ts", "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText)(() => ({ BET_PRESETS: [10, 20, 50, 100, 200] }), ruleModule.exports);
const rules = ruleModule.exports;
const game = "thai-hi-lo";
const players = Array.from({ length: 100 }, (_, i) => `thai-player-${i}`);
function scene(ids = players, poolEnabled = true) {
  const s = createLegacyScene(ids, { poolEnabled });
  s.at(Date.parse("2026-10-27T08:00:00Z"));
  s.data.games.push({ _id: game, slug: game, isActive: true });
  for (const user of s.data.users) user.balance = 100000000;
  return s;
}
const accept = (s, user, wagerId, amount = 100000) => s.store.transact(game, tx =>
  s.browser.browserPoolLifecycle(tx, user, { game, wagerId, amount, action: "accept", operationId: randomUUID() }, true));
const resolve = (s, user, wagerId, bet) => s.store.transact(game, tx =>
  s.browser.resolveServerBrowserWager(tx, user, { game, wagerId, selection: { bet }, operationId: randomUUID() }, true));

for (const option of rules.BET_OPTIONS) {
  for (const poolEnabled of [false, true]) {
    test(`${option.id}, pool=${poolEnabled}: two 100-player-round cycles pay thirty verified 2x returns, three in every ten`, async () => {
      const s = scene(players, poolEnabled);
      for (let block = 0; block < 2; block++) {
        let wins = 0;
        let tenWins = 0;
        for (const [index, user] of players.entries()) {
          const wagerId = randomUUID();
          const balanceAfterStake = s.users.get(user).balance - 100000;
          assert.equal((await accept(s, user, wagerId)).balance, balanceAfterStake);
          const reply = await resolve(s, user, wagerId, option.id);
          assert.ok(rules.isHiLoOutcome(reply.outcome));
          assert.equal(rules.isWin(option.id, reply.outcome.dice), reply.outcome.won);
          assert.equal(reply.claim, reply.outcome.won ? 200000 : 0);
          assert.equal(reply.outcome.payout, reply.claim);
          assert.equal(reply.balance, balanceAfterStake + reply.claim);
          assert.equal(reply.poolPending, false);
          wins += Number(reply.outcome.won);
          tenWins += Number(reply.outcome.won);
          if (index % 10 === 9) {
            assert.equal(tenWins, 3);
            tenWins = 0;
          }
          assert.deepEqual((await resolve(s, user, wagerId, option.id)).outcome, reply.outcome);
        }
        assert.equal(wins, 30);
      }
      assert.equal(s.data.dailypoolentries.length, 0);
    });
  }
}

test("Thai Hi-Lo rejects invalid choices/claims, rolls back failures, and blocks repeats before debit", async () => {
  const s = scene(["alice"]);
  const wagerId = randomUUID();
  await accept(s, "alice", wagerId, 4321);
  const play = () => s.store.transact(game, tx => s.browser.playServerBrowserWager(tx, "alice", {
    game, wagerId: randomUUID(), stake: 4321, selection: { bet: "high" },
  }, false));
  const pending = structuredClone(s.data);
  await assert.rejects(accept(s, "alice", randomUUID(), 4321), /Finish your active/);
  await assert.rejects(play(), /Finish your active/);
  assert.deepEqual(s.data, pending);
  for (const bet of [null, "", "invalid", "HIGH"]) {
    await assert.rejects(resolve(s, "alice", wagerId, bet), /valid Thai Hi-Lo/);
    assert.equal(s.data.multiplayerrooms.length, 0);
  }
  for (const action of ["complete", "award"]) {
    await assert.rejects(s.store.transact(game, tx => s.browser.browserPoolLifecycle(tx, "alice", {
      game, wagerId, action, amount: 43210, operationId: randomUUID(),
    }, true)), /verification/);
  }
  const before = structuredClone(s.data);
  s.failNext("gameresults");
  await assert.rejects(resolve(s, "alice", wagerId, "triple"), /Injected/);
  assert.deepEqual(s.data, before);
  await resolve(s, "alice", wagerId, "triple");
  await assert.rejects(resolve(s, "alice", wagerId, "low"), /cannot change/);
  const settled = structuredClone(s.data);
  await assert.rejects(accept(s, "alice", randomUUID(), 4321), /already played/);
  await assert.rejects(play(), /already played/);
  assert.deepEqual(s.data, settled);
  await assert.rejects(s.store.transact(game, tx => s.browser.playBrowserWager(tx, "alice", {
    game, wagerId: randomUUID(), stake: 4321, claim: 43210,
  }, true)), /server engine/);
});

test("Thai Hi-Lo preserves old accepted pooled wagers", async () => {
  const s = scene(["alice"]);
  const wagerId = randomUUID();
  await accept(s, "alice", wagerId, 100);
  const row = s.data.gameresults[0];
  delete row.browserServerRequired;
  await s.store.transact(game, async tx => {
    await s.pool.addPoolWager(tx, game, row);
    await tx.put("gameresults", row._id, row);
  });
  const reply = await s.store.transact(game, tx => s.browser.browserPoolLifecycle(tx, "alice", {
    game, wagerId, action: "complete", amount: 3100, operationId: randomUUID(),
  }, true));
  assert.equal(reply.claim, 3100);
  assert.equal(reply.poolPending, true);
  assert.equal(reply.balance, 99999900);
});

test("Thai Hi-Lo rejects amounts outside supported payout precision before debiting", async () => {
  const s = scene(["alice"]);
  s.data.users[0].balance = Number.MAX_SAFE_INTEGER / 100;
  const before = structuredClone(s.data);
  await assert.rejects(accept(s, "alice", randomUUID(), 45035996273705), /supported wallet precision/);
  assert.deepEqual(s.data, before);
});
