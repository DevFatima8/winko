import assert from "node:assert/strict";
import { randomInt, randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import test from "node:test";
import ts from "typescript";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

function loader(scene) {
  const cache = new Map();
  return function load(path) {
    const absolute = resolve(path);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const module = { exports: {} };
    cache.set(absolute, module);
    const require = name => {
      if (name === "node:crypto") return { randomInt, randomUUID, createHash };
      if (name === "./dailyPoolBrowser" && scene) return scene.browser;
      if (name === "./dailyPoolConfig") return { dailyPoolEnabled: () => true };
      if (name.startsWith("@/")) return load(`src\\${name.slice(2).replaceAll("/", "\\")}.ts`);
      if (name.startsWith(".")) return load(resolve(dirname(absolute), `${name}.ts`));
      throw new Error(`Unexpected test module ${name}`);
    };
    const code = ts.transpileModule(readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    new Function("require", "module", "exports", code)(require, module, module.exports);
    return module.exports;
  };
}
const engines = loader();
const faceoff = engines("src\\components\\teen-patti-faceoff\\lib\\teenpatti.ts");
const hukam = engines("src\\components\\teen-patti-hukam\\lib\\hukam.ts");
const joker = engines("src\\components\\teen-patti-joker\\lib\\teen-patti.ts");
const games = {
  "amar-akbar-anthony": { amar: 10, akbar: 0, anthony: 0 },
  "bollywood-casino": { andar: 10, bahar: 0, joker: 0 },
  "teen-patti-hukam": { A: 10, B: 0 },
  "teen-patti-joker": { player: 10, dealer: 0, tie: 0 },
  "teen-patti-faceoff": { A: 10, B: 0, TIE: 0, PP_A: 0, PP_B: 0, BONUS: 0 },
};
const users = Array.from({ length: 100 }, (_, i) => `remaining-card-${i}`);
const sum = bets => Object.values(bets).reduce((a, b) => a + b, 0);
const make = (game, players = users) => {
  const scene = createLegacyScene(players, { poolEnabled: true });
  scene.data.games.push({ _id: game, slug: game, isActive: true });
  return scene;
};
const accept = (s, game, userId, wagerId, amount, operationId = randomUUID()) =>
  s.store.transact(`daily-pool:${game}`, tx => s.browser.browserPoolLifecycle(tx, userId, {
    game, wagerId, operationId, amount, action: "accept",
  }, true));
const resolveRound = (s, game, userId, wagerId, bets) =>
  s.store.transact(`daily-pool:${game}`, tx => s.browser.resolveServerBrowserWager(tx, userId, {
    game, wagerId, operationId: randomUUID(), selection: { bets },
  }, true));

function check(game, result, bets) {
  if (game === "amar-akbar-anthony") {
    assert.equal(result.payout, bets[result.win] * 3);
    assert.equal(result.playerWins, result.payout > sum(bets));
  } else if (game === "bollywood-casino") {
    const match = result.cards.findIndex(card => card.rank === result.first.rank);
    assert.equal(match, result.cards.length - 1);
    const point = result.cards.at(-1);
    assert.equal(point.isPoint, true);
    assert.equal(result.winner === "joker" ? result.cards.length === 1 : point.side === result.winner, true);
    assert.equal(result.payout, bets[result.winner] * (result.winner === "joker" ? 12 : 2));
    const identities = [result.first, ...result.cards].map(card => `${card.rank}:${card.suit}`);
    assert.equal(new Set(identities).size, identities.length);
  } else if (game === "teen-patti-hukam") {
    assert.deepEqual(result.sa, hukam.score(result.a, result.hukam.r));
    assert.deepEqual(result.sb, hukam.score(result.b, result.hukam.r));
    assert.equal(result.winner, hukam.compareScores(result.sa, result.sb) > 0 ? "A" : "B");
    assert.equal(result.payout, Math.round(bets[result.winner] * 198) / 100);
  } else if (game === "teen-patti-joker") {
    const comparison = joker.compareEvals(joker.evaluateHand(result.playerHand), joker.evaluateHand(result.dealerHand));
    assert.equal(result.outcome, comparison > 0 ? "player" : comparison < 0 ? "dealer" : "tie");
    assert.equal(result.payout, joker.returnsForOutcome(bets, result.outcome));
  } else {
    const actual = faceoff.settle(result.handA, result.handB, bets);
    assert.equal(result.payout, Math.round(actual.totalReturned * 100) / 100);
    assert.equal(result.winner, actual.winner);
    assert.deepEqual(result.spots, actual.spots);
  }
}

test("remaining resolver engines independently produce 10 profitable, card-consistent payouts per 100 players", async () => {
  for (const [game, bets] of Object.entries(games)) {
    const s = make(game);
    const { serverRemainingDealCardOutcome } = loader(s)("src\\lib\\browserCardRemainingDeals.ts");
    let winners = 0;
    for (const userId of users) {
      const wagerId = randomUUID(), operationId = randomUUID();
      await accept(s, game, userId, wagerId, sum(bets));
      const dealt = await s.store.transact(`daily-pool:${game}`, async tx => {
        const result = await serverRemainingDealCardOutcome(tx, userId, game, sum(bets), { bets });
        await s.browser.browserPoolLifecycle(tx, userId, {
          game, wagerId, operationId, amount: result.claim, action: "complete",
        }, true, true);
        return result;
      });
      check(game, dealt.outcome, bets);
      assert.equal(s.users.get(userId).balance, Math.round((1000 - sum(bets) + dealt.claim) * 100) / 100);
      if (dealt.claim > sum(bets)) winners++;
      const balance = s.users.get(userId).balance;
      await s.store.transact(`daily-pool:${game}`, tx => s.browser.browserPoolLifecycle(tx, userId, {
        game, wagerId, operationId, amount: dealt.claim, action: "complete",
      }, true, true));
      assert.equal(s.users.get(userId).balance, balance);
    }
    assert.equal(winners, 10, game);
  }
});

for (const [game, bets] of Object.entries(games)) {
  test(`${game}: 100 distinct players, 10 card-matching wins, single instant debit/credit and immutable replay`, async () => {
    const s = make(game);
    const replies = await Promise.all(users.map(async userId => {
      const wagerId = randomUUID(), operationId = randomUUID();
      await accept(s, game, userId, wagerId, sum(bets), operationId);
      await accept(s, game, userId, wagerId, sum(bets), operationId);
      assert.equal(s.users.get(userId).balance, 1000 - sum(bets));
      const reply = await resolveRound(s, game, userId, wagerId, bets);
      check(game, reply.outcome, bets);
      assert.equal(reply.poolPending, false);
      assert.equal(reply.claim, reply.outcome.payout);
      assert.equal(s.users.get(userId).balance, Math.round((1000 - sum(bets) + reply.claim) * 100) / 100);
      assert.deepEqual((await resolveRound(s, game, userId, wagerId, bets)).outcome, reply.outcome);
      return reply;
    }));
    assert.equal(replies.filter(reply => reply.claim > sum(bets)).length, 10);
    assert.equal(replies.filter(reply => reply.claim > 0).length, 10);
    assert.equal(s.data.dailypoolentries.length, 0);
  });

  test(`${game}: invalid selection and failed persistence never consume a cycle slot or wallet credit`, async () => {
    const s = make(game, ["alice"]), wagerId = randomUUID();
    await accept(s, game, "alice", wagerId, sum(bets));
    const before = structuredClone(s.data);
    await assert.rejects(resolveRound(s, game, "alice", wagerId, { ...bets, invalid: 0 }));
    assert.deepEqual(s.data, before);
    s.failNext("gameresults");
    await assert.rejects(resolveRound(s, game, "alice", wagerId, bets), /Injected/);
    assert.deepEqual(s.data, before);
    const reply = await resolveRound(s, game, "alice", wagerId, bets);
    const after = structuredClone(s.data);
    assert.deepEqual((await resolveRound(s, game, "alice", wagerId, bets)).outcome, reply.outcome);
    assert.deepEqual(s.data, after);
    await assert.rejects(resolveRound(s, game, "alice", wagerId, { ...bets, invalid: 0 }), /cannot change/);
  });
}

test("side-only and multi-option allocations retain actual, card-derived awards", async () => {
  const cases = [
    ["amar-akbar-anthony", { amar: 10, akbar: 10, anthony: 0 }],
    ["bollywood-casino", { andar: 0, bahar: 0, joker: 10 }],
    ["teen-patti-joker", { player: 0, dealer: 0, tie: 10 }],
    ["teen-patti-faceoff", { A: 0, B: 0, TIE: 10, PP_A: 0, PP_B: 0, BONUS: 0 }],
    ["teen-patti-faceoff", { A: 0, B: 0, TIE: 0, PP_A: 10, PP_B: 10, BONUS: 10 }],
  ];
  for (const [game, bets] of cases) {
    const s = make(game);
    let winners = 0;
    for (const userId of users) {
      const wagerId = randomUUID();
      await accept(s, game, userId, wagerId, sum(bets));
      const reply = await resolveRound(s, game, userId, wagerId, bets);
      check(game, reply.outcome, bets);
      if (reply.claim > sum(bets)) winners++;
    }
    assert.equal(winners, 10, `${game}: side and combined bets obey the same quota`);
  }
});

test("covered allocations are explicitly rejected before quota, not settled as fabricated losses", async () => {
  for (const [game, bets] of [
    ["amar-akbar-anthony", { amar: 10, akbar: 10, anthony: 10 }],
    ["bollywood-casino", { andar: 10, bahar: 10, joker: 10 }],
    ["teen-patti-hukam", { A: 10, B: 10 }],
    ["teen-patti-joker", { player: 10, dealer: 10, tie: 0 }],
    ["teen-patti-faceoff", { A: 10, B: 10, TIE: 0, PP_A: 0, PP_B: 0, BONUS: 0 }],
  ]) {
    const s = make(game, ["alice"]), wagerId = randomUUID();
    await accept(s, game, "alice", wagerId, sum(bets));
    const before = structuredClone(s.data);
    await assert.rejects(resolveRound(s, game, "alice", wagerId, bets), /cover|allocation|losing|main/i);
    assert.deepEqual(s.data, before);
  }
});

test("Casino War: 100 users and both tie decisions preserve 10 net wins with true card payouts", async () => {
  for (const choice of ["war", "surrender"]) {
    const s = make("casino-war");
    const { actCasinoWar } = loader(s)("src\\lib\\browserCasinoWar.ts");
    const action = (userId, wagerId, move, selection, operationId = randomUUID()) =>
      s.store.transact("daily-pool:casino-war", tx => actCasinoWar(tx, userId, {
        game: "casino-war", wagerId, operationId, move, selection,
      }, true));
    let winners = 0;
    for (const userId of users) {
      const wagerId = randomUUID(), operationId = randomUUID();
      // A substantial tie bet guarantees the paid tie remains a genuine winner
      // whether the player chooses war or surrender.
      await accept(s, "casino-war", userId, wagerId, 20);
      const initial = await action(userId, wagerId, "deal", { ante: 10, tie: 10 }, operationId);
      assert.deepEqual(await action(userId, wagerId, "deal", { ante: 10, tie: 10 }, operationId), { ...initial, replay: true });
      let final = initial;
      if (initial.status === "active") {
        const view = initial.outcome.view;
        assert.equal(view.player.rank, view.dealer.rank);
        assert.equal(s.users.get(userId).balance, 1090, "tie side credit is immediate");
        final = await action(userId, wagerId, choice, {});
        if (choice === "war") {
          assert.ok(final.outcome.view.war.player.rank > final.outcome.view.war.dealer.rank);
          assert.equal(s.users.get(userId).balance, 1110);
        } else assert.equal(s.users.get(userId).balance, 1095);
      } else {
        assert.ok(initial.outcome.view.player.rank < initial.outcome.view.dealer.rank);
        assert.equal(s.users.get(userId).balance, 980);
      }
      assert.equal(final.status, "closed");
      if (s.users.get(userId).balance > 1000) winners++;
    }
    assert.equal(winners, 10);
  }
});

test("Casino War rejects invalid splits and action order, rolls back failures, and restores immutable tie state", async () => {
  const s = make("casino-war", ["alice"]);
  const { actCasinoWar } = loader(s)("src\\lib\\browserCasinoWar.ts");
  const wagerId = randomUUID();
  const action = (move, selection, operationId = randomUUID()) =>
    s.store.transact("daily-pool:casino-war", tx => actCasinoWar(tx, "alice", {
      game: "casino-war", wagerId, operationId, move, selection,
    }, true));
  await accept(s, "casino-war", "alice", wagerId, 20);
  const before = structuredClone(s.data);
  await assert.rejects(action("war", {}), /Deal|deal/);
  await assert.rejects(action("deal", { ante: 10, tie: 9 }), /bets|stake/);
  assert.deepEqual(s.data, before);
  s.failNext("gameresults");
  await assert.rejects(action("deal", { ante: 10, tie: 10 }), /Injected/);
  assert.deepEqual(s.data, before);
  const dealt = await action("deal", { ante: 10, tie: 10 });
  const saved = structuredClone(s.data);
  assert.deepEqual((await action("state", {})).outcome, dealt.outcome);
  assert.deepEqual(s.data, saved, "state recovery never deals or credits again");
  await assert.rejects(action("deal", { ante: 10, tie: 10 }), /finished|already/);
});

test("Casino War engine keeps hidden war cards private and surrender returns a loss, not a fabricated win", () => {
  const { casinoWarEngine } = engines("src\\lib\\casinoWarInteractive.ts");
  let initial;
  for (let attempt = 0; attempt < 1000; attempt++) {
    const candidate = casinoWarEngine.start({ stake: 10, selection: { ante: 10, tie: 0 }, win: false });
    if (candidate.phase === "tie") { initial = candidate; break; }
  }
  assert.ok(initial, "ante-only tie offers still exist");
  assert.equal(initial.credit ?? 0, 0);
  assert.equal(initial.view.war, undefined);
  const surrendered = casinoWarEngine.act(initial.state, "surrender", { stake: 10 });
  assert.equal(surrendered.claim, 5);
  assert.ok(surrendered.claim < 10, "a partial ante return is not a profitable win");
  const war = casinoWarEngine.act(initial.state, "war", { stake: 10 });
  assert.equal(war.debit, 10);
  assert.equal(war.claim, 0);
  assert.ok(war.view.war.player.rank < war.view.war.dealer.rank);
  assert.deepEqual(casinoWarEngine.act(initial.state, "war", { stake: 10 }), war, "retry never redraws war cards");
  assert.throws(() => casinoWarEngine.act(surrendered.state, "war", { stake: 10 }), /finished/);
});
