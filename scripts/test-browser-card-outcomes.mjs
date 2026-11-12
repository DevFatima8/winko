import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

const games = ["poker", "poker-betting", "muflis", "teen-patti-best-of-four", "teen-patti-ak47", "red-vs-black", "three-cards"];
const players = Array.from({ length: 100 }, (_, i) => `card-player-${i}`);
const load = path => {
  const mod = { exports: {} };
  new Function("exports", ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText)(mod.exports);
  return mod.exports;
};
const poker = load("src\\components\\poker\\lib\\poker.ts");
const cardRules = load("src\\lib\\cardGameRules.ts");
const rouletteRules = load("src\\lib\\rouletteGameRules.ts");
const cycleModule = { exports: {} };
new Function("require", "exports", ts.transpileModule(readFileSync("src\\lib\\playerWinCycle.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(name => name === "node:crypto" ? { randomInt } :
  name === "./rouletteGameRules" ? rouletteRules : cardRules, cycleModule.exports);

test("all card, roulette and wheel titles have 30 opportunities per 100 rounds, including repeat players", async () => {
  const rows = new Map();
  const tx = {
    get: async (_table, id) => structuredClone(rows.get(id) ?? null),
    put: async (_table, id, value) => { rows.set(id, structuredClone(value)); },
  };
  for (const game of [...cardRules.CARD_GAMES, ...rouletteRules.ROULETTE_GAMES, ...rouletteRules.WHEEL_GAMES, "plinko", "fortune-ox", "thai-hi-lo"]) {
    const expected = cardRules.isCardGame(game) || rouletteRules.isRouletteGame(game) || rouletteRules.isWheelGame(game) ? 30 : 10;
    const oldId = `${game}:ten-player-wins:v1`;
    if (expected === 30) rows.set(oldId, { _id: oldId, players: ["old"], remaining: Array(99).fill(false) });
    const old = structuredClone(rows.get(oldId));
    for (let block = 0; block < 2; block++) {
      let wins = 0;
      for (let index = 0; index < 100; index++) {
        const player = expected === 30 ? "repeat-player" : `${block}-${index}`;
        wins += Number(await cycleModule.exports.nextPlayerWin(tx, game, player));
        if (expected === 10 && index < 99) {
          const before = structuredClone([...rows]);
          assert.equal(await cycleModule.exports.nextPlayerWin(tx, game, player), false);
          assert.deepEqual([...rows], before);
        }
      }
      assert.equal(wins, expected, game);
    }
    if (expected === 30) assert.deepEqual(rows.get(oldId), old, "historical cycle is preserved");
  }
  assert.equal(rows.get("rummy:bet-wins-30-of-100:v1").remaining.length, 100);
});
const muflis = load("src\\components\\muflis\\lib\\muflis.ts");
const four = load("src\\components\\teen-patti-best-of-four\\lib\\teenpatti.ts");
const ak = load("src\\components\\teen-patti-ak47\\lib\\teenpatti.ts");
const choice = game => game === "teen-patti-ak47" ? { ante: 10, pairPlus: 10 } : game === "red-vs-black" ? { color: "red" } : game === "three-cards" ? { picked: 1 } : {};
const stake = game => game === "teen-patti-ak47" ? 20 : 10.15;
const accept = (s, game, userId, wagerId, operationId = randomUUID()) => s.store.transact(`daily-pool:${game}`, tx =>
  s.browser.browserPoolLifecycle(tx, userId, { game, wagerId, operationId, action: "accept", amount: stake(game) }, true));
const resolve = (s, game, userId, wagerId, selection = choice(game)) => s.store.transact(`daily-pool:${game}`, tx =>
  s.browser.resolveServerBrowserWager(tx, userId, { game, wagerId, operationId: randomUUID(), selection }, true));
const scene = (game, users = players) => {
  const s = createLegacyScene(users, { poolEnabled: true });
  s.data.games.push({ _id: game, slug: game, isActive: true });
  return s;
};

for (const game of ["wheel-betting", "hotline"]) {
  test(`${game}: 100 paid rounds by one player produce 30 instant wins, with immutable replays`, async () => {
    const s = scene(game, ["alice"]);
    s.users.get("alice").balance = 100000;
    let wins = 0;
    for (let round = 0; round < 100; round++) {
      const input = { game, wagerId: randomUUID(), stake: 10, selection: game === "hotline" ? { color: "red", highRisk: false } : {} };
      const play = () => s.store.transact(`daily-pool:${game}`, tx => s.browser.playServerBrowserWager(tx, "alice", input, true));
      const reply = await play();
      wins += Number(reply.claim > 10);
      assert.equal(reply.poolPending, false);
      const balance = s.users.get("alice").balance;
      assert.deepEqual((await play()).outcome, reply.outcome);
      assert.equal(s.users.get("alice").balance, balance);
    }
    assert.equal(wins, 30);
    assert.equal(s.data.dailypoolentries.length, 0);
  });
}

function assertCards(game, outcome, amount) {
  if (game === "poker" || game === "poker-betting") {
    assert.equal(poker.isDealResult(outcome), true);
    assert.equal(outcome.payout, outcome.playerWins ? Math.round(amount * (1 + poker.PAYOUTS[outcome.playerScore.category]) * 100) / 100 : 0);
  } else if (game === "muflis") {
    assert.equal(outcome.playerWins, muflis.compareMuflis(muflis.evaluateHand(outcome.playerHand.cards), muflis.evaluateHand(outcome.dealerHand.cards)) > 0);
    assert.equal(outcome.payout, outcome.playerWins ? Math.round(amount * 200) / 100 : 0);
  } else if (game === "teen-patti-best-of-four") {
    assert.equal(outcome.outcome === "win", four.compareEval(four.bestOfFour(outcome.player), four.bestOfFour(outcome.dealer)) > 0);
    assert.equal(outcome.payout, outcome.outcome === "win" ? Math.round(amount * 200) / 100 : 0);
  } else if (game === "teen-patti-ak47") {
    assert.deepEqual(outcome.playerEval, ak.evaluateWithWilds(outcome.player));
    assert.deepEqual(outcome.dealerEval, ak.evaluateWithWilds(outcome.dealer));
    const won = outcome.playerEval.score > outcome.dealerEval.score;
    assert.equal(outcome.outcome === "win", won);
    const multiplier = ak.PAIR_PLUS_PAYOUT[outcome.playerEval.category];
    assert.equal(outcome.payout, (won ? 20 : 0) + (multiplier ? (multiplier + 1) * 10 : 0));
  } else if (game === "red-vs-black") {
    assert.equal(outcome.isWin, outcome.winningColor === "red");
    assert.ok((outcome.winningColor === "red" ? ["♥", "♦"] : ["♠", "♣"]).includes(outcome.suit));
    assert.equal(outcome.payout, outcome.isWin ? Math.round(amount * 200) / 100 : 0);
  } else {
    assert.equal(outcome.picked, 1);
    assert.equal(outcome.win, outcome.cards[1].rank === "A" && outcome.cards[1].suit === "♠");
    assert.equal(outcome.cards.filter(card => card.rank === "A" && card.suit === "♠").length, 1);
    assert.equal(outcome.payout, outcome.win ? Math.round(amount * 2.8) : 0);
  }
}

for (const game of games) {
  test(`${game}: 100 distinct players, thirty card-consistent instant winners, one debit/credit and immutable retries`, async () => {
    const s = scene(game);
    const replies = await Promise.all(players.map(async userId => {
      const wagerId = randomUUID(), operationId = randomUUID();
      await accept(s, game, userId, wagerId, operationId);
      await accept(s, game, userId, wagerId, operationId);
      assert.equal(s.users.get(userId).balance, 1000 - stake(game));
      const reply = await resolve(s, game, userId, wagerId);
      assertCards(game, reply.outcome, stake(game));
      assert.equal(reply.claim, reply.outcome.payout);
      assert.equal(reply.poolPending, false, "global pool environment must not defer a new card wager");
      assert.equal(s.users.get(userId).balance, Math.round((1000 - stake(game) + reply.claim) * 100) / 100);
      const snapshot = structuredClone(s.data);
      assert.deepEqual((await resolve(s, game, userId, wagerId)).outcome, reply.outcome);
      // Other concurrent players may transact, so assert the single wager remains immutable.
      assert.deepEqual(s.data.gameresults.find(row => row.userId === userId), snapshot.gameresults.find(row => row.userId === userId));
      return reply;
    }));
    assert.equal(replies.filter(reply => reply.claim > 0).length, 30);
    assert.equal(s.data.dailypoolentries.length, 0);
    const cycle = s.data.multiplayerrooms.find(row => row._id === `${game}:bet-wins-30-of-100:v1`);
    assert.equal(cycle.remaining.length, 100);
  });

  test(`${game}: forged claims blocked; rollback and recovery preserve exact result and wallet`, async () => {
    const s = scene(game, ["alice"]);
    const wagerId = randomUUID();
    await accept(s, game, "alice", wagerId);
    for (const action of ["complete", "award"]) {
      await assert.rejects(s.store.transact(`daily-pool:${game}`, tx => s.browser.browserPoolLifecycle(tx, "alice", {
        game, wagerId, operationId: randomUUID(), action, amount: 10000,
      }, true)), /verification/);
    }
    const before = structuredClone(s.data);
    s.failNext("gameresults");
    await assert.rejects(resolve(s, game, "alice", wagerId), /Injected/);
    assert.deepEqual(s.data, before);
    const reply = await resolve(s, game, "alice", wagerId);
    const completed = structuredClone(s.data);
    assert.deepEqual((await resolve(s, game, "alice", wagerId)).outcome, reply.outcome);
    assert.deepEqual(s.data, completed);
    await assert.rejects(resolve(s, game, "alice", wagerId, { changed: true }), /cannot change/);
    await assert.rejects(s.store.transact(`daily-pool:${game}`, tx => s.browser.playBrowserWager(tx, "alice", {
      game, wagerId: randomUUID(), stake: 10, claim: 9999,
    }, true)), /server engine/);
  });
}

test("thirteen newly migrated browser cards debit once and reject unverified payouts", async () => {
  for (const game of [
    "blackjack", "amar-akbar-anthony", "bollywood-casino", "casino-war", "monster-hilo",
    "rummy", "teen-patti", "teen-patti-999", "teen-patti-faceoff", "teen-patti-hukam",
    "teen-patti-joker", "texas-holdem", "three-card-poker",
  ]) {
    const s = scene(game, ["alice"]);
    const wagerId = randomUUID();
    const accept = { game, wagerId, operationId: randomUUID(), action: "accept", amount: 10 };
    const complete = { game, wagerId, operationId: randomUUID(), action: "complete", amount: 20 };
    const run = input => s.store.transact(`daily-pool:${game}`, tx => s.browser.browserPoolLifecycle(tx, "alice", input, true));
    await run(accept);
    await run(accept);
    assert.equal(s.users.get("alice").balance, 990, game);
    await assert.rejects(run(complete), /verification/, game);
    assert.equal(s.users.get("alice").balance, 990, game);
    assert.equal(s.data.dailypoolentries.length, 0, game);
    assert.equal(s.data.multiplayerrooms.length, 0, game);
  }
});

for (const game of ["poker", "blackjack", "monster-hilo", "rummy", "teen-patti", "teen-patti-999", "texas-holdem", "three-card-poker", "casino-war"]) {
test(`${game}: accepted pooled card obligations keep their original claim, ledger and deferred settlement`, async () => {
  const s = scene(game, ["alice"]);
  const wagerId = randomUUID();
  await accept(s, game, "alice", wagerId);
  const id = s.data.gameresults[0]._id;
  await s.store.transact(`daily-pool:${game}`, async tx => {
    const result = await tx.get("gameresults", id);
    delete result.browserServerRequired;
    await s.pool.addPoolWager(tx, game, result);
    await tx.put("gameresults", id, result);
  });
  const input = { game, wagerId, operationId: randomUUID(), action: "complete", amount: 25 };
  const reply = await s.store.transact(`daily-pool:${game}`, tx => s.browser.browserPoolLifecycle(tx, "alice", input, true));
  assert.equal(reply.claim, 25);
  assert.equal(reply.poolPending, true);
  assert.equal(s.users.get("alice").balance, 989.85);
  assert.equal(s.data.dailypoolentries[0].claimCents, 2500);
  const before = structuredClone(s.data);
  await s.store.transact(`daily-pool:${game}`, tx => s.browser.browserPoolLifecycle(tx, "alice", input, true));
  assert.deepEqual(s.data, before);
  assert.equal(s.data.multiplayerrooms.some(row => row._id === `${game}:bet-wins-30-of-100:v1`), false);
});
}

test("interactive wagers reject generic resolution and post-deal wallet bypasses while keeping pre-deal refunds", async () => {
  for (const game of ["blackjack", "monster-hilo", "rummy", "teen-patti", "teen-patti-999", "texas-holdem", "three-card-poker", "casino-war"]) {
    const s = scene(game, ["alice"]);
    const wagerId = randomUUID();
    await accept(s, game, "alice", wagerId);
    const run = (action, amount) => s.store.transact(`daily-pool:${game}`, tx => s.browser.browserPoolLifecycle(tx, "alice", {
      game, wagerId, operationId: randomUUID(), action, amount,
    }, true));
    await assert.rejects(resolve(s, game, "alice", wagerId), /table actions/);
    await s.store.transact(`daily-pool:${game}`, async tx => {
      const id = s.data.gameresults[0]._id;
      const result = await tx.get("gameresults", id);
      result.browserCardState = { phase: "playing" };
      await tx.put("gameresults", id, result);
    });
    const dealt = structuredClone(s.data);
    for (const [action, amount] of [["refund", 0], ["reduce", 10], ["complete", 20], ["award", 20], ["increment", 10]]) {
      await assert.rejects(run(action, amount), /verification|verified table action/);
      assert.deepEqual(s.data, dealt);
    }
    await s.store.transact(`daily-pool:${game}`, async tx => {
      const id = s.data.gameresults[0]._id;
      const result = await tx.get("gameresults", id);
      delete result.browserCardState;
      await tx.put("gameresults", id, result);
    });
    await run("refund", 0);
    assert.equal(s.users.get("alice").balance, 1000);
  }
});

for (const game of ["teen-patti-ak47", "red-vs-black", "three-cards"]) {
  test(`${game}: invalid selection cannot consume a cycle slot or wallet payout`, async () => {
    const s = scene(game, ["alice"]);
    const wagerId = randomUUID();
    await accept(s, game, "alice", wagerId);
    const before = structuredClone(s.data);
    await assert.rejects(resolve(s, game, "alice", wagerId, {}), /allocation|colour|card/);
    assert.deepEqual(s.data, before);
  });
}
