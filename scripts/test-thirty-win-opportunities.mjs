import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

const specs = {
  dice: { selection: { target: 50, dir: "under" }, win: outcome => outcome.win },
  "rock-paper-scissors": { selection: { choice: "rock" }, win: outcome => outcome.win },
  "thai-hi-lo": { selection: { bet: "high" }, win: outcome => outcome.won },
  "treasure-bowl": { selection: {}, win: outcome => outcome.isWin },
  ludo: { selection: {}, win: outcome => outcome.winner === 0 },
  "race-betting": { selection: { bets: [{ type: "SUIT_BACK", target: "SPADE", odds: 3.75, stake: 10, isLay: false }] },
    win: outcome => outcome.winningSuit === "SPADE" },
};

for (const [game, spec] of Object.entries(specs)) {
  test(`${game}: persistent 30/100 repeat-player opportunities, matching outcomes, replay and rollback`, async () => {
    const s = createLegacyScene(["alice"], { poolEnabled: false });
    s.data.games.push({ _id: game, slug: game, isActive: true });
    s.data.users[0].balance = 100000;
    const submit = input => s.store.transact(game, tx => s.browser.playServerBrowserWager(tx, "alice", input, false));
    for (let block = 0; block < 2; block++) {
      let opportunities = 0;
      for (let index = 0; index < 100; index++) {
        const input = { game, wagerId: randomUUID(), stake: 10, selection: spec.selection };
        const before = s.users.get("alice").balance;
        if (index === 0 && block === 0) {
          const snapshot = structuredClone(s.data);
          s.failNext("gameresults");
          await assert.rejects(submit(input), /Injected/);
          assert.deepEqual(s.data, snapshot);
        }
        const reply = await submit(input);
        assert.equal(reply.poolPending, false);
        assert.equal(reply.balance, Math.round((before - 10 + reply.claim) * 100) / 100);
        const after = structuredClone(s.data);
        const replay = await submit(input);
        assert.equal(replay.replay, true);
        assert.deepEqual(replay.outcome, reply.outcome);
        assert.deepEqual(s.data, after);
        opportunities += Number(spec.win(reply.outcome));
        if (game === "dice") assert.equal(reply.outcome.win, reply.outcome.value < 50);
        if (game === "rock-paper-scissors") assert.equal(reply.outcome.house, reply.outcome.win ? "scissors" : "paper");
      }
      assert.equal(opportunities, 30);
      assert.equal(s.data.multiplayerrooms.find(row => row._id === `${game}:bet-wins-30-of-100:v1`).remaining.length, 100);
    }
    assert.equal(s.data.dailypoolentries.length, 0);
    await assert.rejects(s.store.transact(game, tx => s.browser.playBrowserWager(tx, "alice", {
      game, wagerId: randomUUID(), stake: 10, claim: 999,
    }, true)), /server engine/);
  });
}

for (const [game, option] of [["sic-bo", "small"], ["tai-xiu", "tai"], ["7-up-down", "lucky"]]) {
  test(`${game}: personal dice rounds assign thirty opportunities, multiple chips and cancellations do not redraw`, async () => {
    const s = createLegacyScene(["alice"], { poolEnabled: false });
    s.data.games.push({ _id: game, slug: game, isActive: true });
    s.data.users[0].balance = 100000;
    const api = s.multiplayer;
    let at = 100000, wins = 0;
    for (let index = 0; index < 100; index++) {
      s.at(at);
      const state = await api.read(game, "alice");
      assert.equal(state.tableMode, "personal");
      const bet = { action: "bet", roundNo: state.round.roundNo, option, amount: 10, requestId: randomUUID() };
      if (index === 0) {
        const before = structuredClone(s.data);
        s.failNext("users");
        await assert.rejects(api.act(game, "alice", bet), /Injected/);
        assert.deepEqual(s.data, before);
      }
      await api.act(game, "alice", bet);
      await api.act(game, "alice", bet);
      await api.act(game, "alice", { ...bet, requestId: randomUUID() });
      assert.equal(s.data.multiplayerrooms.some(row => row._id === `${game}:bet-wins-30-of-100:v1`), index > 0);
      s.at(state.round.endsAt - 1);
      const final = await api.read(game, "alice");
      assert.equal(final.myBets.length, 2);
      assert.ok(final.myBets.every(bet => !bet.poolPending));
      wins += Number(final.myBets.some(bet => bet.payout > 0));
      at = state.round.endsAt + 1;
    }
    assert.equal(wins, 30);
    const remaining = structuredClone(s.data.multiplayerrooms.find(row => row._id === `${game}:bet-wins-30-of-100:v1`));
    s.at(at);
    const state = await api.read(game, "alice");
    const roundNo = state.round.roundNo;
    await api.act(game, "alice", { action: "bet", roundNo, option, amount: 10, requestId: randomUUID() });
    await api.act(game, "alice", { action: "cancel", roundNo, requestId: randomUUID() });
    s.at(state.round.endsAt - 1);
    await api.read(game, "alice");
    assert.deepEqual(s.data.multiplayerrooms.find(row => row._id === remaining._id), remaining);
  });
}

test("invalid dice choices and covering live allocations cannot debit or consume a slot", async () => {
  const s = createLegacyScene(["alice"]);
  for (const game of ["dice", "tai-xiu"]) s.data.games.push({ _id: game, slug: game, isActive: true });
  const snapshot = structuredClone(s.data);
  await assert.rejects(s.store.transact("dice", tx => s.browser.playServerBrowserWager(tx, "alice", {
    game: "dice", wagerId: randomUUID(), stake: 10, selection: { target: 100, dir: "under" },
  }, false)), /valid dice/);
  assert.deepEqual(s.data, snapshot);
  const api = s.multiplayer;
  const state = await api.read("tai-xiu", "alice");
  await api.act("tai-xiu", "alice", { action: "bet", roundNo: state.round.roundNo, option: "tai", amount: 10, requestId: randomUUID() });
  const accepted = structuredClone(s.data);
  await assert.rejects(api.act("tai-xiu", "alice", {
    action: "bet", roundNo: state.round.roundNo, option: "xiu", amount: 10, requestId: randomUUID(),
  }), /zero-return/);
  assert.deepEqual(s.data, accepted);
});

test("Dice target edges generate values in the assigned winning or losing band for both directions", async () => {
  for (const dir of ["under", "over"]) for (const target of [1, 99]) for (const win of [false, true]) {
    const s = createLegacyScene(["alice"]);
    s.data.games.push({ _id: "dice", slug: "dice", isActive: true });
    s.data.multiplayerrooms.push({ _id: "dice:bet-wins-30-of-100:v1", remaining: [win] });
    const reply = await s.store.transact("dice", tx => s.browser.playServerBrowserWager(tx, "alice", {
      game: "dice", wagerId: randomUUID(), stake: 10, selection: { dir, target },
    }, false));
    assert.equal(reply.outcome.win, win);
    assert.equal(dir === "under" ? reply.outcome.value < target : reply.outcome.value > target, win);
    assert.ok(reply.outcome.value >= 0 && reply.outcome.value <= 100);
    assert.equal(reply.claim > 0, win);
  }
});

test("previously accepted browser wagers keep their original pooled claim and consume no new opportunity", async () => {
  for (const game of ["dice", "rock-paper-scissors", "race-betting", "tower-betting"]) {
    const s = createLegacyScene(["alice"], { poolEnabled: true });
    s.data.games.push({ _id: game, slug: game, isActive: true });
    const wagerId = randomUUID();
    await s.store.transact(game, async tx => {
      await s.browser.browserPoolLifecycle(tx, "alice", {
        game, wagerId, operationId: randomUUID(), action: "accept", amount: 10,
      }, false);
      const row = s.data.gameresults[0];
      delete row.browserServerRequired;
      await s.pool.addPoolWager(tx, game, row);
      await tx.put("gameresults", row._id, row);
    });
    const input = { game, wagerId, operationId: randomUUID(), action: "complete", amount: 17.5 };
    const reply = await s.store.transact(game, tx => s.browser.browserPoolLifecycle(tx, "alice", input, true));
    assert.equal(reply.claim, 17.5);
    assert.equal(reply.poolPending, true);
    assert.equal(reply.balance, 990);
    const after = structuredClone(s.data);
    await s.store.transact(game, tx => s.browser.browserPoolLifecycle(tx, "alice", input, true));
    assert.deepEqual(s.data, after);
    assert.equal(s.data.multiplayerrooms.length, 0);
  }
});

test("Race Betting covering allocations are rejected without drawing a quota and remain refundable", async () => {
  const game = "race-betting";
  const s = createLegacyScene(["alice"]);
  s.data.games.push({ _id: game, slug: game, isActive: true });
  const wagerId = randomUUID();
  await s.store.transact(game, tx => s.browser.browserPoolLifecycle(tx, "alice", {
    game, wagerId, operationId: randomUUID(), action: "accept", amount: 20,
  }, false));
  const bets = ["COLOR_RED", "COLOR_BLACK"].map(type => ({ type, stake: 10, odds: 1.95, isLay: false }));
  await assert.rejects(s.store.transact(game, tx => s.browser.resolveServerBrowserWager(tx, "alice", {
    game, wagerId, operationId: randomUUID(), selection: { bets },
  }, false)), /Remove conflicting bets/);
  assert.equal(s.data.multiplayerrooms.length, 0);
  await s.store.transact(game, tx => s.browser.browserPoolLifecycle(tx, "alice", {
    game, wagerId, operationId: randomUUID(), action: "refund", amount: 0,
  }, false));
  assert.equal(s.users.get("alice").balance, 1000);
});

test("configured daily-pool games retain provisional claims, consent checks and zero immediate credit", async () => {
  for (const game of ["dice", "rock-paper-scissors", "race-betting", "ludo"]) {
    const s = createLegacyScene(["alice"], { poolEnabled: true });
    s.data.games.push({ _id: game, slug: game, isActive: true });
    const input = { game, wagerId: randomUUID(), stake: 10, selection: specs[game].selection };
    const before = structuredClone(s.data);
    await assert.rejects(s.store.transact(game, tx => s.browser.playServerBrowserWager(tx, "alice", input, true)), /rules/);
    assert.deepEqual(s.data, before);
    const reply = await s.store.transact(game, tx => s.browser.playServerBrowserWager(tx, "alice", {
      ...input, poolVersion: s.poolRules.DAILY_POOL_VERSION,
    }, true));
    assert.equal(reply.poolPending, true);
    assert.equal(reply.balance, 990);
    assert.equal(s.data.dailypoolentries.length, 1);
    assert.equal(s.data.dailypoolentries[0].claimCents, Math.round(reply.claim * 100));
    assert.equal(s.data.gameresults[0].winAmount, 0);
  }
  for (const [game, option] of [["tai-xiu", "tai"], ["sic-bo", "small"], ["7-up-down", "down"]]) {
    const s = createLegacyScene(["alice"], { poolEnabled: true });
    s.data.games.push({ _id: game, slug: game, isActive: true });
    const api = s.multiplayer;
    const state = await api.read(game, "alice");
    const bet = { action: "bet", roundNo: state.round.roundNo, option, amount: 10, requestId: randomUUID() };
    await assert.rejects(api.act(game, "alice", bet), /daily-pool rules/);
    await api.act(game, "alice", { ...bet, poolRulesVersion: s.poolRules.DAILY_POOL_VERSION });
    s.at(state.round.endsAt - 1);
    const final = await api.read(game, "alice");
    assert.equal(final.myBets[0].poolPending, true);
    assert.equal(final.balance, 990);
    assert.equal(s.data.dailypoolentries.length, 1);
  }
});
