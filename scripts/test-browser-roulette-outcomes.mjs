import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

const load = path => {
  const module = { exports: {} };
  new Function("exports", ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText)(module.exports);
  return module.exports;
};
const european = load("src\\components\\european-roulette\\roulette.ts");
const poker = load("src\\components\\poker-roulette\\lib\\poker.ts");
const games = ["european-roulette", "mini-roulette", "poker-roulette"];
const players = Array.from({ length: 100 }, (_, i) => `roulette-player-${i}`);
const stake = 30.15;
const selection = game => ({ bets: game === "european-roulette" ? { s1: 20.10, red: 10.05 } :
  game === "mini-roulette" ? { "s-1": 20.10, red: 10.05 } : { 1: 20.10, 9: 10.05 } });
const scene = (game, users = players, poolEnabled = true) => {
  const s = createLegacyScene(users, { poolEnabled });
  s.data.games.push({ _id: game, slug: game, isActive: true });
  return s;
};
const accept = (s, game, userId, wagerId, operationId = randomUUID()) =>
  s.store.transact(`daily-pool:${game}`, tx => s.browser.browserPoolLifecycle(tx, userId, {
    game, wagerId, operationId, action: "accept", amount: stake,
  }, true));
const resolve = (s, game, userId, wagerId, choice = selection(game)) =>
  s.store.transact(`daily-pool:${game}`, tx => s.browser.resolveServerBrowserWager(tx, userId, {
    game, wagerId, operationId: randomUUID(), selection: choice,
  }, true));
const cents = value => Math.round(value * 100);

function assertOutcome(game, reply) {
  const result = reply.outcome;
  const bets = selection(game).bets;
  let raw;
  if (game === "european-roulette") {
    assert.ok(Number.isInteger(result.number) && result.number >= 0 && result.number <= 36);
    raw = european.payoutFor(Object.entries(bets).map(([id, amount]) => ({ id, amount })), result.number);
  } else if (game === "mini-roulette") {
    assert.ok(Number.isInteger(result.number) && result.number >= 1 && result.number <= 12);
    raw = (result.number === 1 ? bets["s-1"] * 11.64 : 0) +
      ([1, 3, 5, 8, 10, 12].includes(result.number) ? bets.red * 1.94 : 0);
  } else {
    assert.equal(result.cards.length, 5);
    assert.equal(new Set(result.cards.map(card => `${card.rank}:${card.suit}`)).size, 5);
    assert.equal(poker.evaluateHand(result.cards), result.category);
    assert.deepEqual(result.winners, Object.keys(bets).map(Number).filter(cat => result.category >= cat));
    raw = Object.entries(bets).reduce((sum, [cat, amount]) =>
      sum + (result.category >= Number(cat) ? amount * (poker.CATEGORY_ODDS[cat] + 1) : 0), 0);
  }
  assert.equal(cents(result.payout), Math.min(cents(raw), cents(stake) * 2));
  assert.equal(reply.claim, result.payout);
  assert.ok(reply.claim === 0 || reply.claim > stake);
  assert.ok(reply.claim <= stake * 2);
}

for (const game of games) {
  test(`${game}: the same player gets exactly 30 paid wins in 100 new rounds`, async () => {
    const s = scene(game, ["alice"]);
    s.users.get("alice").balance = 10000;
    let wins = 0;
    for (let round = 0; round < 100; round++) {
      const wagerId = randomUUID();
      await accept(s, game, "alice", wagerId);
      const reply = await resolve(s, game, "alice", wagerId);
      assertOutcome(game, reply);
      wins += Number(reply.claim > stake);
      assert.equal((await resolve(s, game, "alice", wagerId)).claim, reply.claim);
    }
    assert.equal(wins, 30);
  });

  test(`${game}: actual lifecycle, 100 distinct players, 30 real winners, capped instant settlement and immutable replay`, async () => {
    const s = scene(game);
    const historical = { _id: `${game}:ten-player-wins:v1`, players: ["previous"], remaining: [false] };
    s.data.multiplayerrooms.push(structuredClone(historical));
    const replies = await Promise.all(players.map(async userId => {
      const wagerId = randomUUID(), operationId = randomUUID();
      await accept(s, game, userId, wagerId, operationId);
      await accept(s, game, userId, wagerId, operationId);
      assert.equal(cents(s.users.get(userId).balance), 100000 - cents(stake));
      const reply = await resolve(s, game, userId, wagerId);
      assertOutcome(game, reply);
      assert.equal(reply.poolPending, false);
      assert.equal(cents(s.users.get(userId).balance), 100000 - cents(stake) + cents(reply.claim));
      const replay = await resolve(s, game, userId, wagerId);
      assert.deepEqual(replay.outcome, reply.outcome);
      assert.equal(replay.claim, reply.claim);
      await assert.rejects(resolve(s, game, userId, wagerId, { bets: { changed: stake } }), /cannot change/);
      return reply;
    }));
    assert.equal(replies.filter(reply => reply.claim > 0).length, 30);
    assert.equal(s.data.dailypoolentries.length, 0);
    assert.equal(s.data.multiplayerrooms.find(row => row._id === `${game}:bet-wins-30-of-100:v1`).remaining.length, 100);
    assert.deepEqual(s.data.multiplayerrooms.find(row => row._id === historical._id), historical);
  });

  test(`${game}: no unverified payouts; failed atomic settlement consumes neither slot nor wallet credit`, async () => {
    const s = scene(game, ["alice"]);
    const wagerId = randomUUID();
    await accept(s, game, "alice", wagerId);
    for (const action of ["complete", "award"]) {
      await assert.rejects(s.store.transact(`daily-pool:${game}`, tx => s.browser.browserPoolLifecycle(tx, "alice", {
        game, wagerId, operationId: randomUUID(), action, amount: 1000,
      }, true)), /verification/);
    }
    const before = structuredClone(s.data);
    for (const choice of [
      { bets: { invalid: stake } }, { bets: { [Object.keys(selection(game).bets)[0]]: 1 } },
      { bets: selection(game).bets, forged: true },
    ]) {
      await assert.rejects(resolve(s, game, "alice", wagerId, choice), /allocation|selection/);
      assert.deepEqual(s.data, before);
    }
    s.failNext("gameresults");
    await assert.rejects(resolve(s, game, "alice", wagerId), /Injected/);
    assert.deepEqual(s.data, before);
    const reply = await resolve(s, game, "alice", wagerId);
    assertOutcome(game, reply);
    const completed = structuredClone(s.data);
    assert.deepEqual((await resolve(s, game, "alice", wagerId)).outcome, reply.outcome);
    assert.deepEqual(s.data, completed);
    const second = randomUUID();
    await accept(s, game, "alice", second);
    assertOutcome(game, await resolve(s, game, "alice", second));
    assert.equal(s.data.multiplayerrooms.find(row => row._id === `${game}:bet-wins-30-of-100:v1`).remaining.length, 98);
  });

  test(`${game}: new wagers are instant even without the global pool flag`, async () => {
    const s = scene(game, ["alice"], false);
    const wagerId = randomUUID();
    await accept(s, game, "alice", wagerId);
    assert.equal((await resolve(s, game, "alice", wagerId)).poolPending, false);
    assert.equal(s.data.dailypoolentries.length, 0);
  });

  test(`${game}: old accepted daily-pool wager finishes its uncapped saved contract`, async () => {
    const s = scene(game, ["alice"]);
    const wagerId = randomUUID();
    await accept(s, game, "alice", wagerId);
    await s.store.transact(`daily-pool:${game}`, async tx => {
      const saved = s.data.gameresults.find(row => row.userId === "alice");
      delete saved.browserServerRequired;
      await s.pool.addPoolWager(tx, game, saved);
      await tx.put("gameresults", saved._id, saved);
    });
    const reply = await s.store.transact(`daily-pool:${game}`, tx => s.browser.browserPoolLifecycle(tx, "alice", {
      game, wagerId, operationId: randomUUID(), action: "complete", amount: 999,
    }, true));
    assert.equal(reply.claim, 999);
    assert.equal(reply.poolPending, true);
    assert.equal(cents(s.users.get("alice").balance), 100000 - cents(stake));
    assert.equal(s.data.multiplayerrooms.length, 0);
  });
}

for (const game of ["european-roulette", "mini-roulette"]) {
  test(`${game}: covered-all-number allocations are rejected before consuming a cycle slot`, async () => {
    const s = scene(game, ["alice"]);
    const wagerId = randomUUID();
    await accept(s, game, "alice", wagerId);
    const bets = game === "european-roulette" ? { red: 10.05, black: 10.05, s0: 10.05 } : { red: 20.10, black: 10.05 };
    const before = structuredClone(s.data);
    await assert.rejects(resolve(s, game, "alice", wagerId, { bets }), /every outcome|uncovered/);
    assert.deepEqual(s.data, before);
  });
}
