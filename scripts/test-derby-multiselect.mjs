import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

for (const horseIds of [[1], [1, 3, 5], [1, 2, 3, 4, 5, 6]]) {
  test(`Derby ${horseIds.length} selections: per-runner debit, 3.25x winning return, unchanged primary draw cycle and exact replay`, async () => {
    const s = createLegacyScene(["alice"], { poolEnabled: false });
    s.data.games.push({ _id: "derby-race", slug: "derby-race", isActive: true });
    s.data.users[0].balance = 100000;
    let primaryWins = 0;
    for (let round = 1; round <= 100; round++) {
      const wagerId = randomUUID(), game = "derby-race", amount = 100 * horseIds.length;
      const selection = { horseId: horseIds[0], horseIds, round };
      const before = s.data.users[0].balance;
      await s.store.transact(game, tx => s.browser.browserPoolLifecycle(tx, "alice", {
        game, wagerId, operationId: randomUUID(), action: "accept", amount,
      }, false));
      assert.equal(s.data.users[0].balance, before - amount);
      const input = { game, wagerId, operationId: randomUUID(), selection };
      const reply = await s.store.transact(game, tx => s.browser.resolveServerBrowserWager(tx, "alice", input, false));
      const selectedWinner = horseIds.includes(reply.outcome.winnerId);
      assert.equal(reply.outcome.playerWon, selectedWinner);
      assert.equal(reply.claim, selectedWinner ? 325 : 0, "Return includes the winning stake once, not all selected stakes");
      assert.equal(reply.balance, before - amount + reply.claim);
      assert.equal(Math.max(...reply.outcome.finishingPaces), 1);
      if (reply.outcome.winnerId === horseIds[0]) primaryWins++;
      const replay = await s.store.transact(game, tx => s.browser.resolveServerBrowserWager(tx, "alice", input, false));
      assert.deepEqual(replay.outcome, reply.outcome);
      assert.equal(s.data.users[0].balance, reply.balance);
      if (horseIds.length === 6) {
        assert.equal(reply.claim, 325);
        assert.equal(reply.balance - before, -275, "Covering every runner is not a guaranteed net win");
      }
    }
    assert.equal(primaryWins, 30, "The original 30/100 primary-horse opportunity cycle is unchanged");
  });
}

test("Derby rejects duplicate/out-of-range selections and invalid allocation before an instant debit", async () => {
  const s = createLegacyScene(["alice"], { poolEnabled: false });
  s.data.games.push({ _id: "derby-race", slug: "derby-race", isActive: true });
  for (const [horseIds, stake] of [[[1, 1], 200], [[1, 7], 200], [[], 100], [[1, 2, 3], 100], [[2], 100]]) {
    const before = structuredClone(s.data);
    await assert.rejects(s.store.transact("derby-race", tx => s.browser.playServerBrowserWager(tx, "alice", {
      game: "derby-race", wagerId: randomUUID(), stake, selection: { horseId: 1, horseIds, round: 1 },
    }, false)), /valid Derby|whole-rupee/);
    assert.deepEqual(s.data, before);
  }
});

test("previously accepted single-horse contracts keep their 2.75x return, including paisa stakes", async () => {
  const s = createLegacyScene(["alice"], { poolEnabled: false }), game = "derby-race", wagerId = randomUUID();
  s.data.games.push({ _id: game, slug: game, isActive: true });
  s.data.multiplayerrooms.push({ _id: `${game}:bet-wins-30-of-100:v1`, remaining: [true] });
  await s.store.transact(game, tx => s.browser.browserPoolLifecycle(tx, "alice", {
    game, wagerId, operationId: randomUUID(), action: "accept", amount: 10.25,
  }, false));
  const reply = await s.store.transact(game, tx => s.browser.resolveServerBrowserWager(tx, "alice", {
    game, wagerId, operationId: randomUUID(), selection: { horseId: 2, round: 1 },
  }, false));
  assert.equal(reply.claim, 28.19);
  assert.equal(reply.outcome.payoutMultiplier, 2.75);
});
