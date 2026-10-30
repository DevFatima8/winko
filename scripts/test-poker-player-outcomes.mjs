import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import ts from "typescript";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

const module = { exports: {} };
new Function("exports", ts.transpileModule(readFileSync("src\\components\\poker\\lib\\poker.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(module.exports);
const engine = module.exports;
const day = Date.parse("2026-10-24T08:00:00Z");
const players = Array.from({ length: 200 }, (_, i) => `poker-player-${i}`);
const cycle = s => s.data.multiplayerrooms.find(row => row._id === "poker:ten-player-wins:v1");
const scene = (users = players, pooled = true) => {
  const s = createLegacyScene(users, { poolEnabled: pooled });
  s.at(day);
  s.data.games.push({ _id: "poker", slug: "poker", isActive: true });
  return s;
};
const accept = (s, userId, wagerId, pooled, amount = 10) => s.store.transact("daily-pool:poker", tx =>
  s.browser.browserPoolLifecycle(tx, userId, {
    game: "poker", wagerId, operationId: randomUUID(), action: "accept", amount,
    poolVersion: s.poolRules.DAILY_POOL_VERSION,
  }, pooled));
const resolve = (s, userId, wagerId, pooled) => s.store.transact("daily-pool:poker", tx =>
  s.browser.resolveServerBrowserWager(tx, userId, {
    game: "poker", wagerId, operationId: randomUUID(), selection: {},
  }, pooled));

for (const pooled of [false, true]) {
  test(`Poker global pool=${pooled}, new bets instant: actual hands have exactly ten winners in each 100-player cycle, including concurrent players`, async () => {
    const s = scene(players, pooled);
    for (let offset = 0; offset < 200; offset += 100) {
      const replies = await Promise.all(players.slice(offset, offset + 100).map(async userId => {
        const wagerId = randomUUID();
        await accept(s, userId, wagerId, pooled, 10.15);
        const result = await resolve(s, userId, wagerId, pooled);
        const replay = await resolve(s, userId, wagerId, pooled);
        assert.deepEqual(replay.outcome, result.outcome);
        assert.equal(replay.claim, result.claim);
        assert.equal(engine.isDealResult(result.outcome), true);
        const { playerWins, playerScore, dealerScore, payout } = result.outcome;
        assert.equal(playerWins, playerScore.value > dealerScore.value);
        assert.equal(playerWins, result.claim > 0);
        assert.equal(payout, result.claim);
        assert.equal(payout, playerWins ? Math.round(10.15 * (1 + engine.PAYOUTS[playerScore.category]) * 100) / 100 : 0);
        assert.equal(result.status, "closed");
        assert.equal(result.poolPending, false);
        assert.equal(s.users.get(userId).balance, Math.round((1000 - 10.15 + payout) * 100) / 100);
        return result;
      }));
      assert.equal(replies.filter(result => result.outcome.playerWins).length, 10);
      assert.equal(replies.filter(result => !result.outcome.playerWins).length, 90);
      assert.deepEqual(cycle(s).players, []);
    }
    assert.equal(s.data.gameresults.length, 200);
    assert.equal(s.data.dailypoolentries.length, 0);
  });
}

test("Poker rejects forged claims, failed bets and extra client awards; retries and repeat players cannot consume extra slots", async () => {
  const s = scene(["alice", "bob"], false);
  await assert.rejects(accept(s, "alice", randomUUID(), false, 5), /Minimum/);
  await assert.rejects(accept(s, "alice", randomUUID(), false, 2000), /Insufficient/);
  assert.equal(cycle(s), undefined);
  const wagerId = randomUUID();
  await accept(s, "alice", wagerId, false);
  for (const action of ["complete", "award"]) {
    await assert.rejects(s.store.transact("daily-pool:poker", tx => s.browser.browserPoolLifecycle(tx, "alice", {
      game: "poker", wagerId, operationId: randomUUID(), action, amount: 10000,
    }, false)), /verification/);
  }
  await assert.rejects(s.store.transact("daily-pool:poker", tx => s.browser.playBrowserWager(tx, "bob", {
    game: "poker", wagerId: randomUUID(), stake: 10, claim: 10000,
  }, false)), /server engine/);
  const before = structuredClone(s.data);
  s.failNext("gameresults");
  await assert.rejects(resolve(s, "alice", wagerId, false), /Injected/);
  assert.deepEqual(s.data, before);
  await resolve(s, "alice", wagerId, false);
  const after = structuredClone(s.data);
  await resolve(s, "alice", wagerId, false);
  assert.deepEqual(s.data, after);

  const repeatId = randomUUID();
  await accept(s, "alice", repeatId, false);
  const repeat = await resolve(s, "alice", repeatId, false);
  assert.equal(repeat.claim, 0);
  assert.equal(repeat.outcome.playerWins, false);
  assert.equal(cycle(s).players.length, 1);

  const input = { game: "poker", wagerId: randomUUID(), stake: 10, selection: {} };
  const play = () => s.store.transact("daily-pool:poker", tx => s.browser.playServerBrowserWager(tx, "bob", input, false));
  const result = await play();
  assert.equal(engine.isDealResult(result.outcome), true);
  const saved = structuredClone(s.data);
  assert.deepEqual((await play()).outcome, result.outcome);
  assert.deepEqual(s.data, saved);
  assert.equal(cycle(s).players.length, 2);
});

test("Poker accepted before the server-cycle change can finish with its saved original claim", async () => {
  const s = scene(["alice"], false);
  const wagerId = randomUUID();
  await accept(s, "alice", wagerId, false);
  delete s.data.gameresults[0].browserServerRequired;
  await s.store.transact("daily-pool:poker", tx => s.browser.browserPoolLifecycle(tx, "alice", {
    game: "poker", wagerId, operationId: randomUUID(), action: "complete", amount: 20,
  }, false));
  assert.equal(s.users.get("alice").balance, 1010);
  assert.equal(cycle(s), undefined);
});

test("Poker client only animates the server deal, never draws a local result or completes a second payout", () => {
  const source = readFileSync("src\\components\\poker\\PokerGame.tsx", "utf8");
  assert.match(source, /pool\.resolveServer\(\{\}\)/);
  assert.doesNotMatch(source, /dealRound\(|pool\.plan\(|pool\.complete\(/);
  assert.match(source, /dealing\.current \|\| pool\.busy/);
  assert.match(source, /i \* 220/);
  assert.match(source, /\}, 2700\)/);
});
