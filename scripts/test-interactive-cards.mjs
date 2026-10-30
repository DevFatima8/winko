import assert from "node:assert/strict";
import { randomInt, randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import test from "node:test";
import ts from "typescript";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

// Same isolated loader as test-card-remaining-deals.mjs: the core and engines run against the
// harness's transactional store and the real dailyPoolBrowser wallet lifecycle.
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
const rummy = loader()("src\\components\\rummy\\engine.ts");
const users = Array.from({ length: 100 }, (_, i) => `interactive-card-${i}`);

function table(game, players = users) {
  const s = createLegacyScene(players, { poolEnabled: true });
  s.data.games.push({ _id: game, slug: game, isActive: true });
  const { actInteractiveCard } = loader(s)("src\\lib\\browserCardInteractive.ts");
  const accept = (userId, wagerId, amount) => s.store.transact(`daily-pool:${game}`, tx => s.browser.browserPoolLifecycle(tx, userId, {
    game, wagerId, operationId: randomUUID(), amount, action: "accept",
  }, true));
  const act = (userId, wagerId, move, selection, operationId = randomUUID()) => s.store.transact(`daily-pool:${game}`, tx =>
    actInteractiveCard(tx, userId, { game, wagerId, operationId, move, selection }, true));
  return { s, accept, act, balance: userId => s.users.get(userId).balance };
}

/**
 * Qualifying strategies: the documented play that converts an assigned winning slot into a profit.
 * Each returns the final reply; the money assertions are made against the wallet itself.
 */
const games = {
  blackjack: { stake: 10, selection: undefined, async play(act, dealt) {
    return dealt.status === "closed" ? dealt : await act("stand");
  } },
  "monster-hilo": { stake: 10, selection: undefined, async play(act, dealt) {
    const guess = await act("guess", { direction: dealt.outcome.view.card.rank <= 8 ? "higher" : "lower" });
    return guess.status === "closed" ? guess : await act("cashout");
  } },
  rummy: { stake: 10, selection: undefined, async play(act, dealt) {
    const groups = rummy.solve(dealt.outcome.view.hand);
    return groups ? await act("declare", { groups: groups.map(g => g.cards.map(c => c.id)) }) : await act("forfeit");
  } },
  "teen-patti": { stake: 10, selection: undefined, async play(act) { return await act("play", { choice: "seen" }); } },
  "teen-patti-999": { stake: 10, selection: { boot: 10, side: 0 }, async play(act) {
    await act("choose", { seen: false });
    return await act("show");
  } },
  "three-card-poker": { stake: 20, selection: { ante: 10, pairPlus: 10 }, async play(act) { return await act("play"); } },
  "texas-holdem": { stake: 20, selection: { openingBet: 20 }, async play(act, dealt) {
    let reply = dealt;
    for (let guard = 0; reply.status === "active" && guard < 20; guard++) reply = await act("call");
    return reply;
  } },
};

for (const [game, spec] of Object.entries(games)) {
  test(`${game}: 100 distinct players get exactly 10 winning slots; qualifying play yields exactly 10 profitable, wallet-exact rounds`, async () => {
    const t = table(game);
    let winners = 0;
    for (const userId of users) {
      const wagerId = randomUUID();
      await t.accept(userId, wagerId, spec.stake);
      assert.equal(t.balance(userId), 1000 - spec.stake, "accepted stake is debited instantly");
      const act = (move, selection) => t.act(userId, wagerId, move, selection);
      const dealOp = randomUUID();
      const dealt = await t.act(userId, wagerId, "deal", spec.selection, dealOp);
      assert.deepEqual(await t.act(userId, wagerId, "deal", spec.selection, dealOp), { ...dealt, replay: true }, "deal replay is immutable");
      const final = await spec.play(act, dealt);
      assert.equal(final.status, "closed");
      assert.equal(final.balance, t.balance(userId), "reply carries the authoritative balance");
      const result = t.s.data.gameresults.find(r => r.userId === userId && r.browserGame === game && r.browserCardState);
      assert.ok(result?.browserCardState.closed, "round state persisted and closed");
      // Net = credited claim minus everything debited for this round; it shows directly in the wallet.
      if (t.balance(userId) > 1000) winners++;
      assert.equal(final.outcome.payout, Math.round((t.balance(userId) - 1000 + result.betAmount) * 100) / 100,
        "claim credited exactly once and equals the displayed payout");
    }
    assert.equal(winners, 10, game);
  });
}

test("forged moves, payouts and selections are rejected without touching the wallet or cycle", async () => {
  const cases = [
    ["blackjack", 10, undefined, [["claim", { payout: 999 }, /Unknown/], ["double", undefined, /first two/, "after-hit"]]],
    ["monster-hilo", 10, undefined, [["cashout", undefined, /at least one guess/], ["guess", { direction: "sideways" }, /higher or lower/]]],
    ["rummy", 10, undefined, [["declare", { groups: [["x", "y", "z"]] }, /each dealt card|meld/], ["win", {}, /Unknown/]]],
    ["teen-patti", 10, undefined, [["play", { choice: "cheat" }, /blind or seen/], ["show", {}, /Unknown/]]],
    ["teen-patti-999", 10, { boot: 10, side: 0 }, [["show", undefined, /Choose blind or seen first/], ["chaal", undefined, /Choose blind or seen first/]]],
    ["three-card-poker", 20, { ante: 10, pairPlus: 10 }, [["raise", undefined, /Unknown/]]],
    ["texas-holdem", 20, { openingBet: 20 }, [["check-raise", undefined, /Unknown|turn/], ["raise", { to: "all" }, /raise amount|turn/]]],
  ];
  for (const [game, stake, selection, forged] of cases) {
    const t = table(game, ["alice"]);
    const wagerId = randomUUID();
    await t.accept("alice", wagerId, stake);
    await assert.rejects(t.act("alice", wagerId, "hit"), /Deal the accepted wager/, `${game} move before deal`);
    if (game === "teen-patti-999") await assert.rejects(t.act("alice", wagerId, "deal", { boot: 10, side: 5 }), /Boot and side/);
    if (game === "three-card-poker") await assert.rejects(t.act("alice", wagerId, "deal", { ante: 15, pairPlus: 10 }), /Ante and Pair Plus/);
    if (game === "texas-holdem") await assert.rejects(t.act("alice", wagerId, "deal", { openingBet: 10 }), /Opening bet/);
    const before = structuredClone(t.s.data);
    await assert.rejects(t.act("bob", wagerId, "deal", selection), /not found|Accepted/, "another player cannot act on the wager");
    await assert.rejects(t.act("alice", wagerId, "DEAL!", selection), /Invalid table action/);
    assert.deepEqual(t.s.data, before, "rejected requests change nothing (no cycle slot consumed)");
    const dealt = await t.act("alice", wagerId, "deal", selection);
    await assert.rejects(t.act("alice", wagerId, "deal", selection), /already dealt|finished/);
    if (dealt.status !== "active") continue;
    for (const [move, sel, pattern, setup] of forged) {
      if (setup === "after-hit") {
        const hit = await t.act("alice", wagerId, "hit");
        if (hit.status !== "active") break;
      }
      const snapshot = structuredClone(t.s.data);
      await assert.rejects(t.act("alice", wagerId, move, sel), pattern, `${game} ${move}`);
      assert.deepEqual(t.s.data, snapshot, `${game} ${move} left no trace`);
    }
  }
});

test("rummy: a forged declaration on an unwinnable hand is rejected; forfeit pays nothing", async () => {
  const t = table("rummy", users);
  let losing = 0;
  for (const userId of users) {
    const wagerId = randomUUID();
    await t.accept(userId, wagerId, 10);
    const dealt = await t.act(userId, wagerId, "deal");
    if (rummy.solve(dealt.outcome.view.hand)) { await t.act(userId, wagerId, "forfeit"); continue; }
    losing++;
    const ids = dealt.outcome.view.hand.map(c => c.id);
    await assert.rejects(t.act(userId, wagerId, "declare", { groups: [ids.slice(0, 3), ids.slice(3, 6), ids.slice(6)] }), /meld|SET or RUN/);
    await assert.rejects(t.act(userId, wagerId, "declare", { groups: [ids.slice(0, 3)] }), /Every dealt card|SET or RUN/);
    const forfeit = await t.act(userId, wagerId, "forfeit");
    assert.equal(forfeit.outcome.payout, 0);
    assert.equal(t.balance(userId), 990);
  }
  assert.equal(losing, 90);
});

test("folds, packs and early cash-outs forfeit honestly: an assigned winning slot is not a guaranteed profit", async () => {
  for (const [game, stake, selection, fold, expected] of [
    ["teen-patti", 10, undefined, ["fold"], 990],
    ["teen-patti-999", 20, { boot: 10, side: 10 }, ["pack"], 980],
    ["three-card-poker", 20, { ante: 10, pairPlus: 10 }, ["fold"], null],
    ["texas-holdem", 20, { openingBet: 20 }, ["fold"], 980],
    ["rummy", 10, undefined, ["forfeit"], 990],
  ]) {
    const t = table(game);
    for (const userId of users.slice(0, 20)) {
      const wagerId = randomUUID();
      await t.accept(userId, wagerId, stake);
      const dealt = await t.act(userId, wagerId, "deal", selection);
      if (dealt.status !== "active") continue;
      const reply = await t.act(userId, wagerId, fold[0]);
      assert.equal(reply.status, "closed");
      // Three Card Poker folding still settles a real Pair Plus side bet from the dealt cards.
      if (expected !== null) assert.equal(t.balance(userId), expected, `${game} fold`);
      else assert.equal(t.balance(userId), 980 + reply.outcome.payout);
      const recovered = await t.act(userId, wagerId, "state");
      assert.equal(recovered.status, "closed");
      assert.deepEqual(recovered.outcome, reply.outcome, "closed rounds recover their result without paying again");
      assert.equal(recovered.balance, t.balance(userId));
      await assert.rejects(t.act(userId, wagerId, fold[0]), /finished/);
    }
  }
});

test("Three Card Poker allows high-value Ante and Pair Plus additions before deal, but no unverified additions after deal", async () => {
  const t = table("three-card-poker", ["alice"]);
  t.s.data.users[0].balance = 1000000;
  const wagerId = randomUUID();
  await t.accept("alice", wagerId, 25000);
  const addOp = randomUUID();
  const increment = operationId => t.s.store.transact("three-card-poker", tx => t.s.browser.browserPoolLifecycle(tx, "alice", {
    game: "three-card-poker", wagerId, operationId, amount: 15000, action: "increment",
  }, true));
  await increment(addOp);
  await increment(addOp);
  assert.equal(t.balance("alice"), 960000);
  await t.act("alice", wagerId, "deal", { ante: 25000, pairPlus: 15000 });
  await assert.rejects(increment(randomUUID()), /verified table action/);
  assert.equal(t.balance("alice"), 960000);
  const playOp = randomUUID();
  const result = await t.act("alice", wagerId, "play", undefined, playOp);
  assert.equal(result.outcome.view.play, 25000);
  assert.equal(t.balance("alice"), 935000 + result.outcome.payout);
  await t.act("alice", wagerId, "play", undefined, playOp);
  assert.equal(t.balance("alice"), 935000 + result.outcome.payout);
});

test("Three Card Poker accepts a custom high-value Pair Plus-only round", async () => {
  const t = table("three-card-poker", ["alice"]);
  t.s.data.users[0].balance = 1000000;
  const wagerId = randomUUID();
  await t.accept("alice", wagerId, 12345);
  const result = await t.act("alice", wagerId, "deal", { ante: 0, pairPlus: 12345 });
  assert.equal(result.status, "closed");
  assert.equal(t.balance("alice"), 1000000 - 12345 + result.outcome.payout);
  assert.equal(result.outcome.view.play, 0);
});

test("interim debits (double, raise/call, chaal, play) are instant, replay-safe, and refuse an empty wallet", async () => {
  const t = table("three-card-poker", ["alice", "bob"]);
  const wagerId = randomUUID();
  await t.accept("alice", wagerId, 20);
  await t.act("alice", wagerId, "deal", { ante: 10, pairPlus: 10 });
  assert.equal(t.balance("alice"), 980);
  const playOp = randomUUID();
  const played = await t.act("alice", wagerId, "play", undefined, playOp);
  assert.equal(t.balance("alice"), 970 + played.outcome.payout, "play debit and settlement applied once");
  assert.deepEqual(await t.act("alice", wagerId, "play", undefined, playOp), { ...played, replay: true });
  assert.equal(t.balance("alice"), 970 + played.outcome.payout, "replayed play neither debits nor credits again");
  await assert.rejects(t.act("alice", wagerId, "fold", undefined, playOp), /different table action/);

  const bobWager = randomUUID();
  await t.accept("bob", bobWager, 20);
  await t.act("bob", bobWager, "deal", { ante: 10, pairPlus: 10 });
  t.s.users.get("bob").balance = 5;
  t.s.data.users.find(u => u._id === "bob").balance = 5;
  await assert.rejects(t.act("bob", bobWager, "play"), /Insufficient balance/);
  const fold = await t.act("bob", bobWager, "fold");
  assert.equal(fold.status, "closed");
});

test("database failure mid-move rolls back debits, credits and round state; the retry completes once", async () => {
  const t = table("teen-patti-999", ["alice"]);
  const wagerId = randomUUID();
  await t.accept("alice", wagerId, 10);
  await t.act("alice", wagerId, "deal", { boot: 10, side: 0 });
  const before = structuredClone(t.s.data);
  t.s.failNext("gameresults");
  const op = randomUUID();
  await assert.rejects(t.act("alice", wagerId, "choose", { seen: false }, op), /Injected/);
  assert.deepEqual(t.s.data, before);
  const chose = await t.act("alice", wagerId, "choose", { seen: false }, op);
  assert.equal(t.balance("alice"), 980, "boot + blind chaal debited once");
  assert.equal(chose.status, "active");
  const state = await t.act("alice", wagerId, "state");
  assert.deepEqual(state.outcome, chose.outcome, "state recovery returns the same public table");
  assert.equal(state.outcome.view.dealer, null, "dealer cards stay hidden before showdown");
  assert.equal(state.outcome.view.player, null, "blind player does not see own cards");
});

test("legacy accepted wagers without server flags can be dealt; unverified client settlement of a dealt round is refused", async () => {
  const t = table("blackjack", ["alice"]);
  const wagerId = randomUUID();
  await t.accept("alice", wagerId, 10);
  const result = t.s.data.gameresults.find(r => r.browserGame === "blackjack");
  delete result.browserServerRequired;
  const dealt = await t.act("alice", wagerId, "deal");
  assert.ok(["active", "closed"].includes(dealt.status));
  if (dealt.status === "active") {
    const snapshot = structuredClone(t.s.data);
    await assert.rejects(t.s.store.transact("daily-pool:blackjack", tx => t.s.browser.browserPoolLifecycle(tx, "alice", {
      game: "blackjack", wagerId, operationId: randomUUID(), amount: 1000, action: "complete",
    }, true)));
    assert.deepEqual(t.s.data, snapshot, "client cannot self-credit a server-dealt round");
  }
});

test("Hold'em: two 100-player crore-stake cycles have ten winners, exact stakes and at most 2x combined returns", async () => {
  const players = Array.from({ length: 200 }, (_, index) => `holdem-large-${index}`);
  const t = table("texas-holdem", players);
  const initial = 1000000000;
  for (const user of t.s.data.users) user.balance = initial;
  for (let block = 0; block < 2; block++) {
    let winners = 0;
    for (const userId of players.slice(block * 100, (block + 1) * 100)) {
      const wagerId = randomUUID();
      const openingBet = 10000000;
      await t.accept(userId, wagerId, openingBet);
      assert.equal(t.balance(userId), initial - openingBet);
      let reply = await t.act(userId, wagerId, "deal", { openingBet });
      assert.equal(reply.outcome.view.frames[0].acceptedStake, openingBet);
      assert.equal(reply.outcome.view.frames[0].playerBet, openingBet);
      assert.equal(reply.outcome.view.frames[0].dealerBet, openingBet, "house matches the actual custom bet, not a 100000 stack");
      for (let guard = 0; reply.status === "active" && guard < 20; guard++) {
        const op = randomUUID();
        reply = await t.act(userId, wagerId, "call", undefined, op);
        const beforeReplay = structuredClone(t.s.data);
        assert.deepEqual(await t.act(userId, wagerId, "call", undefined, op), { ...reply, replay: true });
        assert.deepEqual(t.s.data, beforeReplay);
      }
      assert.equal(reply.status, "closed");
      assert.ok(reply.outcome.payout <= reply.outcome.stake * 2);
      assert.equal(reply.outcome.view.state.grossReturn, reply.outcome.payout);
      if (reply.outcome.view.state.result.winner === "player") {
        assert.equal(reply.outcome.view.state.result.amount, reply.outcome.payout);
      }
      assert.equal(t.balance(userId), initial - reply.outcome.stake + reply.outcome.payout);
      if (t.balance(userId) > initial) winners++;
      if (userId === players[(block + 1) * 100 - 1]) continue;
      const repeat = randomUUID();
      await t.accept(userId, repeat, openingBet);
      let again = await t.act(userId, repeat, "deal", { openingBet });
      for (let guard = 0; again.status === "active" && guard < 20; guard++) again = await t.act(userId, repeat, "call");
      assert.equal(again.outcome.payout, 0, "repeat player cannot gain another winning slot in this cycle");
    }
    assert.equal(winners, 10);
  }
});

test("Hold'em terminal result, frames and wallet return all respect the 2x cap, even with an oversized pot", () => {
  const engine = loader()("src\\lib\\interactiveTexasHoldem.ts").texasHoldemEngine;
  const started = engine.start({ stake: 10000, selection: { openingBet: 10000 }, win: true, balance: 100000 });
  const before = started.state.game;
  const game = {
    ...before, phase: "river", community: before.deck.slice(0, 5), deck: before.deck.slice(5),
    pot: 100000, acceptedStake: 10000, playerBet: 0, dealerBet: 0, currentBet: 0,
    playerActed: false, dealerActed: true, playerAllIn: false, dealerAllIn: false,
  };
  const result = engine.act({ ...started.state, game }, "call", { stake: 10000, balance: 100000 });
  assert.equal(result.phase, "handOver");
  assert.equal(result.claim, 20000, "never return the unbounded 10x pot");
  assert.equal(result.state.game.grossReturn, 20000);
  assert.equal(result.state.game.result.amount, 20000);
  assert.equal(result.view.state.result.amount, 20000);
  assert.equal(result.view.frames.at(-1).grossReturn, 20000);
  assert.equal(result.view.state.playerChips, 120000);
  assert.doesNotMatch(result.view.state.log.at(-1), /100,000/);
});

test("Hold'em raises debit exactly the requested total; invalid raises never silently become another amount", async () => {
  const t = table("texas-holdem", ["alice"]);
  t.s.data.users[0].balance = 1000000000;
  const wagerId = randomUUID();
  await t.accept("alice", wagerId, 10000000);
  await t.act("alice", wagerId, "deal", { openingBet: 10000000 });
  for (const to of [15000000, 2000000000]) {
    const snapshot = structuredClone(t.s.data);
    await assert.rejects(t.act("alice", wagerId, "raise", { to }), /Raise to an amount/);
    assert.deepEqual(t.s.data, snapshot);
  }
  const op = randomUUID();
  const result = await t.act("alice", wagerId, "raise", { to: 25000000 }, op);
  assert.equal(result.outcome.stake, 25000000);
  assert.equal(t.balance("alice"), 975000000 + (result.status === "closed" ? result.outcome.payout : 0));
  assert.ok(result.outcome.payout <= result.outcome.stake * 2);
  const snapshot = structuredClone(t.s.data);
  await t.act("alice", wagerId, "raise", { to: 25000000 }, op);
  assert.deepEqual(t.s.data, snapshot);
});

test("Hold'em opening bets 11–19 derive valid sub-10 calls, debit immediately, and replay without a second debit", async () => {
  for (let openingBet = 11; openingBet <= 19; openingBet++) {
    const t = table("texas-holdem", ["alice"]);
    const wagerId = randomUUID();
    await t.accept("alice", wagerId, openingBet);
    const dealt = await t.act("alice", wagerId, "deal", { openingBet });
    assert.equal(dealt.status, "active");
    const game = dealt.outcome.view.state;
    const smallCall = game.currentBet - game.playerBet;
    assert.equal(smallCall, 20 - openingBet);
    assert.ok(smallCall > 0 && smallCall < 10);
    const operationId = randomUUID();
    const called = await t.act("alice", wagerId, "call", undefined, operationId);
    assert.equal(called.status, "active");
    assert.equal(t.balance("alice"), 980, "opening bet plus real call is exactly the big blind");
    assert.equal(called.outcome.stake, 20);
    assert.equal(t.s.changes.at(-1).delta, -smallCall, "only the derived short call is debited");
    const snapshot = structuredClone(t.s.data), changes = t.s.changes.length;
    assert.deepEqual(await t.act("alice", wagerId, "call", undefined, operationId), { ...called, replay: true });
    assert.deepEqual(t.s.data, snapshot);
    assert.equal(t.s.changes.length, changes);
    await assert.rejects(t.act("alice", wagerId, "raise", { to: 999 }, operationId), /different table action/);
    assert.equal(t.balance("alice"), 980);
  }
});

test("old pooled wagers use real deals and extra-stake moves but defer every terminal claim, including replay", async () => {
  const t = table("teen-patti-999");
  let profitableClaims = 0;
  for (const userId of users) {
    const wagerId = randomUUID();
    await t.accept(userId, wagerId, 10);
    const root = t.s.data.gameresults.find(r => r.userId === userId && r.browserGame === "teen-patti-999");
    await t.s.store.transact("daily-pool:teen-patti-999", async tx => {
      const old = await tx.get("gameresults", root._id);
      delete old.browserServerRequired;
      await t.s.pool.addPoolWager(tx, "teen-patti-999", old);
      await tx.put("gameresults", old._id, old);
    });
    const dealt = await t.act(userId, wagerId, "deal", { boot: 10, side: 0 });
    assert.equal(dealt.poolPending, true, "existing ledger obligation is retained after dealing");
    const chooseId = randomUUID();
    const chosen = await t.act(userId, wagerId, "choose", { seen: false }, chooseId);
    assert.equal(chosen.status, "active");
    assert.equal(chosen.balance, 980, "blind chaal is debited even for a grandfathered pool wager");
    assert.equal(chosen.poolPending, true);
    const afterChoose = structuredClone(t.s.data), chooseChanges = t.s.changes.length;
    assert.deepEqual(await t.act(userId, wagerId, "choose", { seen: false }, chooseId), { ...chosen, replay: true });
    assert.deepEqual(t.s.data, afterChoose);
    assert.equal(t.s.changes.length, chooseChanges);
    const showId = randomUUID();
    const final = await t.act(userId, wagerId, "show", undefined, showId);
    assert.equal(final.status, "closed");
    assert.equal(final.poolPending, true);
    assert.equal(final.outcome.stake, 40);
    assert.equal(final.balance, 960, "show stake debited, but even a genuine win is not prepaid");
    assert.equal(t.balance(userId), 960);
    assert.equal(final.claim, final.outcome.payout);
    const result = t.s.data.gameresults.find(r => r._id === root._id);
    assert.equal(result.poolVersion, t.s.poolRules.DAILY_POOL_VERSION);
    assert.equal(result.poolPending, true);
    const entries = t.s.data.dailypoolentries.filter(e => e.userId === userId);
    assert.equal(entries.length, 3, "original boot, blind chaal, and show each retain their ledger entry");
    assert.deepEqual(entries.map(e => e.stakeCents), [1000, 1000, 2000]);
    assert.ok(entries.every(e => e.status === "closed" && e.payoutCents === 0));
    assert.equal(entries.reduce((sum, e) => sum + e.claimCents, 0), final.claim * 100);
    if (final.claim > 40) profitableClaims++;
    const closed = structuredClone(t.s.data), closedChanges = t.s.changes.length;
    assert.deepEqual(await t.act(userId, wagerId, "show", undefined, showId), { ...final, replay: true });
    const restored = await t.act(userId, wagerId, "state");
    assert.equal(restored.poolPending, true);
    assert.deepEqual(restored.outcome, final.outcome);
    assert.deepEqual(t.s.data, closed);
    assert.equal(t.s.changes.length, closedChanges, "terminal replay and recovery never credit the deferred claim");
  }
  assert.equal(profitableClaims, 10, "test covers positive deferred claims as well as losses");
});