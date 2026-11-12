import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

const players = Array.from({ length: 200 }, (_, index) => `slot-player-${index}`);
const games = ["treasure-bowl", "super-fruits", "sweet-bonanza", "hotline",
  "fortune-ox", "fortune-gems", "fortune-toucan", "gates-of-olympus", "diao-chan"];
const selection = game => game === "hotline" ? { color: "fire", highRisk: true }
  : game === "fortune-gems" ? { extra: false, baseBet: 100000 } : {};
const cycleId = game => game === "hotline" ? "hotline:bet-wins-30-of-100:v1" : `${game}:ten-player-wins:v1`;

test("all ten slot titles are covered, without changing unrelated card or payment policies", () => {
  const loaded = { exports: {} };
  new Function("exports", ts.transpileModule(readFileSync("src\\lib\\slotGameRules.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText)(loaded.exports);
  const expected = ["lucky-777", "treasure-bowl", "fortune-ox", "fortune-gems", "fortune-toucan",
    "gates-of-olympus", "diao-chan", "super-fruits", "sweet-bonanza", "hotline"];
  assert.deepEqual(loaded.exports.SLOT_GAMES, expected);
  assert.equal(loaded.exports.SLOT_GROSS_CAP, 2);
  const s = scene(["alice"]);
  for (const game of expected.filter(game => game !== "lucky-777")) {
    assert.ok(s.browser.SERVER_BROWSER_POOL_GAMES.includes(game), `${game} requires a server outcome`);
  }
  for (const game of ["amar-akbar-anthony", "poker", "european-roulette", "aviator", "deposit", "withdraw"]) {
    assert.equal(loaded.exports.isSlotGame(game), false);
  }
});

function scene(ids = players, poolEnabled = false) {
  const s = createLegacyScene(ids, { poolEnabled });
  s.at(Date.parse("2026-10-27T08:00:00Z"));
  for (const game of games) s.data.games.push({ _id: game, slug: game, isActive: true });
  for (const user of s.data.users) user.balance = 1000000;
  return s;
}
const accept = (s, game, user, wagerId, amount = 100000, enabled = true) => s.store.transact(game, tx =>
  s.browser.browserPoolLifecycle(tx, user, {
    game, wagerId, operationId: randomUUID(), action: "accept", amount,
  }, enabled));
const resolve = (s, game, user, wagerId, enabled = true, input = selection(game)) => s.store.transact(game, tx =>
  s.browser.resolveServerBrowserWager(tx, user, {
    game, wagerId, operationId: randomUUID(), selection: input,
  }, enabled));

test("Hotline repeat-player bets get exactly 30 random wins per 100, across colours and modes", async () => {
  const s = scene(["alice"], false);
  for (let block = 0; block < 3; block++) {
    let wins = 0;
    for (let bet = 0; bet < 100; bet++) {
      const wagerId = randomUUID();
      const input = { color: ["red", "black", "fire"][bet % 3], highRisk: bet % 2 === 0 };
      await accept(s, "hotline", "alice", wagerId, 10, false);
      const reply = await resolve(s, "hotline", "alice", wagerId, false, input);
      wins += Number(reply.outcome.won);
      assert.equal(reply.outcome.won, reply.outcome.color === input.color);
      const payout = reply.outcome.won ? Math.round(10 * (input.color === "fire" || input.highRisk ? 2 : 1.95) * 100) / 100 : 0;
      assert.equal(reply.claim, payout);
    }
    assert.equal(wins, 30);
  }
  const source = readFileSync("src\\components\\hotline\\HotlineGame.tsx", "utf8");
  assert.doesNotMatch(source, /No win/i);
});

for (const enabled of [false, true]) {
  for (const game of games) {
    test(`${game}, pool flag=${enabled}: exactly ${game === "hotline" ? 30 : 10} positive returns in each of two 100-wager cycles; never 4x`, async () => {
      const s = scene(players, enabled);
      for (let block = 0; block < 2; block++) {
        const replies = await Promise.all(players.slice(block * 100, (block + 1) * 100).map(async user => {
          const wagerId = randomUUID();
          const accepted = await accept(s, game, user, wagerId, 100000, enabled);
          assert.equal(accepted.balance, 900000);
          const reply = await resolve(s, game, user, wagerId, enabled);
          assert.equal(reply.claim, reply.outcome.payout);
          assert.ok(reply.claim <= 200000 && reply.claim >= 0);
          assert.equal(reply.poolPending, false);
          assert.equal(reply.balance, 900000 + reply.claim);
          const replay = await resolve(s, game, user, wagerId, enabled);
          assert.deepEqual(replay.outcome, reply.outcome);
          assert.equal(replay.balance, reply.balance);
          if (game === "hotline") {
            assert.equal(reply.outcome.won, reply.outcome.color === "fire");
            assert.equal(reply.claim, reply.outcome.won ? 200000 : 0);
          }
          if (game === "treasure-bowl") {
            const grid = reply.outcome.finalReels;
            const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 4, 8], [2, 4, 6]];
            const matching = lines.some(line => line.every(index => grid[index] === grid[line[0]]));
            assert.equal(matching, reply.outcome.isWin);
            assert.equal(reply.outcome.isWin, reply.claim > 0);
          }
          return reply;
        }));
        assert.equal(replies.filter(reply => reply.claim > 0).length, game === "hotline" ? 30 : 10);
        const saved = s.data.multiplayerrooms.find(row => row._id === cycleId(game));
        if (game === "hotline") assert.equal(saved.remaining.length, 100);
        else assert.deepEqual(saved.players, []);
      }
      assert.equal(s.data.dailypoolentries.length, 0);
      assert.equal(s.data.gameresults.length, 200);
      const beforeDayChange = structuredClone(s.data.users);
      s.at(Date.parse("2026-10-28T08:00:00Z"));
      await s.store.transact(game, tx => s.pool.settleDailyPools(tx, game));
      assert.deepEqual(s.data.users, beforeDayChange, "no extra lottery payments at day end");
    });
  }
}

for (const game of games) {
  test(`${game}: rejected bets, repeats, rollback and forged claims do not create extra wins`, async () => {
    const s = scene(["alice", "bob"], true);
    await assert.rejects(accept(s, game, "alice", randomUUID(), 5), /Minimum/);
    assert.equal(s.data.multiplayerrooms.length, 0);
    const wagerId = randomUUID();
    await accept(s, game, "alice", wagerId);
    for (const action of ["award", "complete"]) {
      await assert.rejects(s.store.transact(game, tx => s.browser.browserPoolLifecycle(tx, "alice", {
        game, wagerId, operationId: randomUUID(), action, amount: 400000,
      }, true)), /verification/);
    }
    const before = structuredClone(s.data);
    s.failNext("gameresults");
    await assert.rejects(resolve(s, game, "alice", wagerId), /Injected/);
    assert.deepEqual(s.data, before);
    await resolve(s, game, "alice", wagerId);
    const cycle = structuredClone(s.data.multiplayerrooms);
    const repeatId = randomUUID();
    await accept(s, game, "alice", repeatId);
    const repeated = await resolve(s, game, "alice", repeatId);
    if (game === "hotline") {
      assert.equal(repeated.claim, repeated.outcome.won ? 200000 : 0);
      assert.equal(s.data.multiplayerrooms.find(row => row._id === cycleId(game)).remaining.length, 98);
    } else {
      assert.equal(repeated.claim, 0);
      assert.deepEqual(s.data.multiplayerrooms, cycle);
    }
    await assert.rejects(s.store.transact(game, tx => s.browser.playBrowserWager(tx, "bob", {
      game, wagerId: randomUUID(), stake: 100000, claim: 400000,
    }, true)), /server engine/);
  });

  test(`${game}: old accepted client/pool wagers keep their original completion contract`, async () => {
    const s = scene(["alice"], true);
    const wagerId = randomUUID();
    await accept(s, game, "alice", wagerId, 100);
    const row = s.data.gameresults[0];
    delete row.browserServerRequired;
    await s.store.transact(game, async tx => {
      await s.pool.addPoolWager(tx, game, row);
      await tx.put("gameresults", row._id, row);
    });
    const reply = await s.store.transact(game, tx => s.browser.browserPoolLifecycle(tx, "alice", {
      game, wagerId, operationId: randomUUID(), action: "complete", amount: 400,
    }, true));
    assert.equal(reply.poolPending, true);
    assert.equal(reply.claim, 400);
    assert.equal(reply.balance, 999900);
    assert.equal(s.data.multiplayerrooms.length, 0);
  });
}

test("Hotline validates colour/mode before drawing and binds the selection across retries", async () => {
  const s = scene(["alice"]);
  const wagerId = randomUUID();
  await accept(s, "hotline", "alice", wagerId);
  for (const input of [{}, { color: "invalid", highRisk: true }, { color: "red", highRisk: "yes" }]) {
    await assert.rejects(resolve(s, "hotline", "alice", wagerId, false, input), /valid Hotline/);
    assert.equal(s.data.multiplayerrooms.length, 0);
  }
  await resolve(s, "hotline", "alice", wagerId);
  await assert.rejects(resolve(s, "hotline", "alice", wagerId, false, { color: "black", highRisk: true }), /cannot change/);
});

test("Hotline uses only the confirmed result, persists selection and blocks double acceptance", async () => {
  const source = ts.createSourceFile("HotlineGame.tsx",
    readFileSync("src\\components\\hotline\\HotlineGame.tsx", "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler, guard, boxes;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "handleBet") {
      handler = node.initializer.arguments[0].getText(source);
    }
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "generateBoxes") boxes = node.getText(source);
    if (ts.isFunctionDeclaration(node) && node.name?.text === "isHotlineOutcome") guard = node.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(handler && guard && boxes);
  let release;
  const accepted = new Promise(resolve => { release = resolve; });
  const calls = [], values = {};
  const result = { color: "fire", won: true, multiplier: 2, amount: 200000, payout: 200000 };
  const deps = {
    accepting: { current: false }, isRunning: false, betAmount: 100000, balance: 1000000, highRiskMode: true,
    pool: {
      start: async (...args) => { calls.push(["start", ...args]); return accepted; },
      resolveServer: async input => { calls.push(["resolve", input]); return result; },
    },
    acceptedResult: { current: null }, playGameSound() {},
  };
  for (const name of ["SelectedColor", "Result", "Position", "Boxes", "IsRunning", "Confirming"]) {
    deps[`set${name}`] = value => { values[name] = value; };
  }
  const compiled = ts.transpileModule(`${guard}\nconst ${boxes};\nconst run = ${handler};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const run = new Function(...Object.keys(deps), `${compiled}\nreturn run;`)(...Object.values(deps));
  const pending = run("fire");
  await run("black");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][3], { color: "fire", highRisk: true });
  release(true);
  await pending;
  assert.deepEqual(calls[1], ["resolve", { color: "fire", highRisk: true }]);
  assert.equal(deps.acceptedResult.current, result);
  assert.equal(values.Boxes[values.Boxes.length - 15].color, "fire");
  assert.equal(values.IsRunning, true);
  assert.equal(deps.accepting.current, false);
});
