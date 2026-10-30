import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

const players = Array.from({ length: 200 }, (_, i) => `fruit-player-${i}`);
const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 4, 8], [2, 4, 6]];
const cycle = (s, game) => s.data.multiplayerrooms.find(row => row._id === `${game}:ten-player-wins:v1`);
const scene = (ids, pooled) => {
  const s = createLegacyScene(ids, { poolEnabled: pooled });
  for (const game of ["super-fruits", "sweet-bonanza"]) {
    s.data.games.push({ _id: game, slug: game, isActive: true });
  }
  return s;
};
const accept = (s, user, game, wagerId, pooled, amount = 10) => s.store.transact(game, tx =>
  s.browser.browserPoolLifecycle(tx, user, {
    game, wagerId, operationId: randomUUID(), action: "accept", amount,
    poolVersion: s.poolRules.DAILY_POOL_VERSION,
  }, pooled));
const resolve = (s, user, game, wagerId, pooled) => s.store.transact(game, tx =>
  s.browser.resolveServerBrowserWager(tx, user, {
    game, wagerId, operationId: randomUUID(), selection: {},
  }, pooled));

for (const pooled of [false, true]) {
  for (const game of ["super-fruits", "sweet-bonanza"]) {
    test(`${game}, pooled=${pooled}: two independent 100-player cycles have exactly ten wins`, async () => {
      const s = scene(players, pooled);
      for (let offset = 0; offset < 200; offset += 100) {
        const replies = await Promise.all(players.slice(offset, offset + 100).map(async user => {
          const wagerId = randomUUID();
          const stake = 10.15;
          await accept(s, user, game, wagerId, pooled, stake);
          const reply = await resolve(s, user, game, wagerId, pooled);
          const replay = await resolve(s, user, game, wagerId, pooled);
          assert.deepEqual(replay.outcome, reply.outcome);
          assert.equal(replay.claim, reply.claim);
          assert.equal(reply.claim, reply.outcome.payout);
          assert.equal(reply.status, "closed");
          assert.equal(reply.poolPending, false);
          assert.equal(s.users.get(user).balance,
            Math.round((1000 - stake + reply.claim) * 100) / 100);
          if (game === "super-fruits") {
            const { grid, winLine, winFruit } = reply.outcome;
            assert.equal(grid.length, 9);
            const matches = lines.flatMap((line, index) =>
              line.every(cell => grid[cell] === grid[line[0]]) ? [index] : []);
            assert.deepEqual(matches, winFruit ? [winLine] : []);
            if (winFruit) {
              assert.ok(["cherry", "lemon", "orange"].includes(winFruit));
              assert.equal(grid[lines[winLine][0]], winFruit);
              assert.equal(reply.claim, Math.min(Number((stake * 2).toFixed(2)), Math.round(stake * { cherry: 1.5, lemon: 1.8, orange: 2.2 }[winFruit])));
            } else assert.equal(reply.claim, 0);
          } else {
            const { won, multiplier } = reply.outcome;
            assert.equal(won, reply.claim > 0);
            assert.ok(won ? [1.2, 1.4, 1.6].includes(multiplier) : multiplier === 0);
            assert.equal(reply.claim, Number((stake * multiplier).toFixed(2)));
          }
          return reply;
        }));
        assert.equal(replies.filter(reply => reply.claim > 0).length, 10);
        if (game === "super-fruits") {
          const fruits = replies.map(reply => reply.outcome.winFruit);
          assert.equal(fruits.filter(fruit => fruit === "cherry").length, 5);
          assert.equal(fruits.filter(fruit => fruit === "lemon").length, 3);
          assert.equal(fruits.filter(fruit => fruit === "orange").length, 2);
        }
        assert.deepEqual(cycle(s, game).players, []);
      }
      assert.equal(s.data.gameresults.length, 200);
      assert.equal(s.data.dailypoolentries.length, 0);
    });
  }
}

for (const game of ["super-fruits", "sweet-bonanza"]) {
  test(`${game}: retries, repeat players, rejected bets and rollbacks do not consume extra slots`, async () => {
    const s = scene(["alice", "bob"], false);
    await assert.rejects(accept(s, "alice", game, randomUUID(), false, 5), /Minimum/);
    assert.equal(cycle(s, game), undefined);
    const wagerId = randomUUID();
    await accept(s, "alice", game, wagerId, false);
    const before = structuredClone(s.data);
    s.failNext("gameresults");
    await assert.rejects(resolve(s, "alice", game, wagerId, false), /Injected/);
    assert.deepEqual(s.data, before);
    await resolve(s, "alice", game, wagerId, false);
    const after = structuredClone(s.data);
    await resolve(s, "alice", game, wagerId, false);
    assert.deepEqual(s.data, after);
    const repeatId = randomUUID();
    await accept(s, "alice", game, repeatId, false);
    assert.equal((await resolve(s, "alice", game, repeatId, false)).claim, 0);
    assert.equal(cycle(s, game).players.length, 1);
    assert.equal(cycle(s, game === "super-fruits" ? "sweet-bonanza" : "super-fruits"), undefined);
  });

  test(`${game}: new wagers reject client payouts and both server entry paths share the same cycle`, async () => {
    const s = scene(["alice", "bob"], false);
    const wagerId = randomUUID();
    await accept(s, "alice", game, wagerId, false);
    for (const action of ["complete", "award"]) {
      await assert.rejects(s.store.transact(game, tx => s.browser.browserPoolLifecycle(tx, "alice", {
        game, wagerId, operationId: randomUUID(), action, amount: 9999,
      }, false)), /verification/);
    }
    await assert.rejects(s.store.transact(game, tx => s.browser.playBrowserWager(tx, "bob", {
      game, wagerId: randomUUID(), stake: 10, claim: 9999,
    }, false)), /server engine/);
    await resolve(s, "alice", game, wagerId, false);
    const input = { game, wagerId: randomUUID(), stake: 10, selection: {} };
    const play = () => s.store.transact(game, tx => s.browser.playServerBrowserWager(tx, "bob", input, false));
    const reply = await play();
    const after = structuredClone(s.data);
    assert.deepEqual((await play()).outcome, reply.outcome);
    assert.deepEqual(s.data, after);
    assert.equal(cycle(s, game).players.length, 2);
  });

  test(`${game}: previously accepted client outcomes can still finish`, async () => {
    const s = scene(["alice"], false);
    const wagerId = randomUUID();
    await accept(s, "alice", game, wagerId, false);
    delete s.data.gameresults[0].browserServerRequired;
    await s.store.transact(game, tx => s.browser.browserPoolLifecycle(tx, "alice", {
      game, wagerId, operationId: randomUUID(), action: "complete", amount: 20,
    }, false));
    assert.equal(s.users.get("alice").balance, 1010);
    assert.equal(cycle(s, game), undefined);
  });
}

test("both clients use server outcomes without changing their visual result handling", () => {
  for (const [folder, file] of [["super-fruits-slot", "SlotGame"], ["sweet-bonanza-clone", "Game"]]) {
    const code = readFileSync(`src\\components\\${folder}\\${file}.tsx`, "utf8");
    assert.match(code, /pool\.resolveServer\(\{\}\)/);
    assert.doesNotMatch(code, /pool\.plan\(|Math\.random\(\) < (WIN_RATE|0\.35)/);
    assert.match(code, /notifyGameResult/);
    assert.match(code, /if \(!mounted\.current\) return/);
  }
});
