import assert from "node:assert/strict";
import test from "node:test";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

test("Aviator and Aviator X accept requested presets with a Rs. 10 minimum", async () => {
  const s = createLegacyScene();
  const first = await s.flight.getState("alice", "aviator");
  assert.equal(first.config.minBet, 10);
  for (const amount of [10, 20, 50, 100, 200, 125.5]) {
    const result = await s.flight.placeBet("alice", "aviator", amount, 0);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal((await s.flight.getState("alice", "aviator")).myBets[0].bet, amount);
    assert.equal((await s.flight.cancelBet("alice", "aviator", 0)).ok, true);
    assert.equal(s.users.get("alice").balance, 1000);
  }
  assert.ok((await s.flight.placeBet("alice", "aviator", 0, 0)).error);
  assert.ok((await s.flight.placeBet("alice", "aviator", 9.99, 0)).error);
  assert.ok((await s.flight.placeBet("alice", "aviator", 50000.01, 0)).error);
  assert.equal((await s.flight.getState("alice", "aviator-x")).config.minBet, 10);
});

test("Aviator X allows only two panels for current and next-round wagers without charging rejected requests", async () => {
  const s = createLegacyScene();
  const first = await s.flight.getState("alice", "aviator-x");
  assert.equal(first.config.slots, 2);
  const placed = await Promise.all([0, 1].map(slot => s.flight.placeBet("alice", "aviator-x", 50, slot, first.round.id)));
  assert.ok(placed.every(reply => reply.ok));
  assert.equal(s.users.get("alice").balance, 900);
  assert.equal((await s.flight.placeBet("alice", "aviator-x", 50, 0, first.round.id)).error, "Bet already placed.");
  for (const slot of [2, 3, -1, 0.5]) {
    assert.equal((await s.flight.placeBet("alice", "aviator-x", 50, slot, first.round.id)).error, "Invalid bet panel.");
  }
  s.at(first.round.startsAt + 180);
  for (const slot of [0, 1]) {
    assert.equal((await s.flight.placeBet("alice", "aviator-x", 50, slot, first.round.id + 1)).ok, true);
  }
  assert.equal((await s.flight.placeBet("alice", "aviator-x", 50, 2, first.round.id + 1, true, 1.01)).error, "Invalid bet panel.");
  const state = await s.flight.getState("alice", "aviator-x");
  assert.deepEqual(state.myBets.map(bet => bet.slot).sort(), [0, 1]);
  assert.deepEqual(state.queued.map(bet => bet.slot).sort(), [0, 1]);
  assert.equal(s.users.get("alice").balance, 800);
  assert.equal(s.data.gameresults.length, 4);
});

test("Aviator X counts an accepted old third-panel wager toward the two-bet limit and keeps its cancellation", async () => {
  const s = createLegacyScene();
  const config = s.flight.TABLES["aviator-x"];
  const first = await s.flight.getState("alice", "aviator-x");
  config.slots = 3;
  assert.equal((await s.flight.placeBet("alice", "aviator-x", 70, 2, first.round.id)).ok, true);
  config.slots = 2;
  assert.equal((await s.flight.placeBet("alice", "aviator-x", 50, 0, first.round.id)).ok, true);
  assert.match((await s.flight.placeBet("alice", "aviator-x", 50, 1, first.round.id)).error, /two bets/i);
  assert.equal(s.users.get("alice").balance, 880);
  assert.equal((await s.flight.cancelBet("alice", "aviator-x", 2, first.round.id)).ok, true);
  assert.equal(s.users.get("alice").balance, 950);
  assert.equal((await s.flight.placeBet("alice", "aviator-x", 50, 1, first.round.id)).ok, true);
  assert.deepEqual((await s.flight.getState("alice", "aviator-x")).myBets.map(bet => bet.slot).sort(), [0, 1]);
});

test("Aviator X keeps cashout of an already accepted third-panel bet without permitting another one", async () => {
  const s = createLegacyScene();
  const config = s.flight.TABLES["aviator-x"];
  const first = await s.flight.getState("alice", "aviator-x");
  config.slots = 3;
  assert.equal((await s.flight.placeBet("alice", "aviator-x", 70, 2, first.round.id)).ok, true);
  config.slots = 2;
  s.at(first.round.startsAt + 180);
  assert.equal((await s.flight.cashOut("alice", "aviator-x", 2, first.round.id)).ok, true);
  assert.equal(s.users.get("alice").balance, 1000.7);
  assert.equal((await s.flight.cashOut("alice", "aviator-x", 2, first.round.id)).error, "No active bet.");
  assert.equal((await s.flight.placeBet("alice", "aviator-x", 70, 2)).error, "Invalid bet panel.");
  assert.equal((await s.flight.cashOut("alice", "aviator-x", 3)).error, "Invalid cashout request.");
  assert.equal((await s.flight.cashOut("alice", "aviator", 2)).error, "Invalid cashout request.");
  assert.equal(s.users.get("alice").balance, 1000.7);
});

test("Aviator: two players and a guest share one flight and see actual masked wagers", async () => {
  const s = createLegacyScene();
  const first = await s.flight.getState("alice", "aviator");
  assert.equal(first.round.crashPoint, null);
  await s.flight.placeBet("alice", "aviator", 50, 0);
  await s.flight.placeBet("bob", "aviator", 100, 0);
  const [alice, bob, guest] = await Promise.all([
    s.flight.getState("alice", "aviator"), s.flight.getState("bob", "aviator"), s.flight.getState(null, "aviator"),
  ]);
  assert.deepEqual(alice.round, bob.round);
  assert.deepEqual(alice.round, guest.round);
  assert.equal(s.data.aviatorrounds.length, 1);
  assert.equal(guest.bets.length, 2);
  assert.equal(guest.totals.amount, 150);
  assert.deepEqual(guest.bets.map((bet) => bet.name).sort(), ["a***e", "b***b"]);
  assert.equal(alice.myBets.length, 1);
  assert.equal(alice.myBets[0].bet, 50);
  assert.equal(bob.myBets[0].bet, 100);
  assert.deepEqual(guest.myBets, []);
});

test("Aviator: shared crash settles every actual pending player and cashouts pay once", async () => {
  const s = createLegacyScene();
  const first = await s.flight.getState(null, "aviator");
  await s.flight.placeBet("alice", "aviator", 50, 0);
  await s.flight.placeBet("bob", "aviator", 100, 0);
  s.at(first.round.startsAt + 180);
  const paid = await s.flight.cashOut("alice", "aviator", 0, first.round.id);
  assert.equal(paid.ok, true, JSON.stringify(paid));
  assert.equal(paid.round, first.round.id);
  assert.equal(paid.balance, s.users.get("alice").balance);
  assert.equal(paid.bet.outcome, "win");
  assert.equal(paid.bet.win, paid.win);
  assert.ok((await s.flight.cashOut("alice", "aviator", 0, first.round.id)).error);
  s.at(first.round.startsAt + 1000);
  const guest = await s.flight.getState(null, "aviator");
  assert.equal(guest.round.status, "crashed");
  assert.equal(guest.bets.find((bet) => bet.name === "b***b").outcome, "lose");
  assert.equal(s.users.get("alice").balance, 950 + paid.win);
  assert.equal(s.users.get("bob").balance, 900);
  assert.equal(s.data.winholds.length, 0);
  const previous = s.users.get("alice").balance;
  await s.flight.getState("bob", "aviator");
  assert.equal(s.users.get("alice").balance, previous);
});

test("Aviator: in-flight reservations are isolated to N+1 and scoped cancellations refund once", async () => {
  const s = createLegacyScene();
  const first = await s.flight.getState(null, "aviator");
  s.at(first.round.startsAt + 180);
  assert.equal((await s.flight.placeBet("bob", "aviator", 100, 0)).queued, true);
  s.at(first.round.startsAt + 1000);
  await s.flight.getState("alice", "aviator");
  assert.equal(s.data.gameresults[0].outcome, "pending");
  assert.equal(s.data.gameresults[0].roundNo, first.round.id + 1);
  assert.equal((await s.flight.getState("bob", "aviator")).queued[0].bet, 100);
  assert.ok((await s.flight.cancelBet("bob", "aviator", 0, first.round.id)).error);
  assert.equal((await s.flight.cancelBet("bob", "aviator", 0, first.round.id + 1)).ok, true);
  assert.equal(s.users.get("bob").balance, 1000);
  assert.ok((await s.flight.cancelBet("bob", "aviator", 0)).error);
});

test("Aviator: existing personal reservations migrate without charging or refunding", async () => {
  const s = createLegacyScene();
  s.data.gameresults.push(
    { _id: "old1", gameId: "aviator", userId: "alice", roundNo: 10, betSlot: 0, betAmount: 50, outcome: "pending", createdAt: new Date(1) },
    { _id: "old2", gameId: "aviator", userId: "alice", roundNo: 11, betSlot: 0, betAmount: 100, outcome: "pending", createdAt: new Date(2) },
    { _id: "old3", gameId: "aviator", userId: "bob", roundNo: 8, betSlot: 0, betAmount: 70, outcome: "pending", createdAt: new Date(3) },
  );
  const state = await s.flight.getState("alice", "aviator");
  assert.equal(state.round.id, 12);
  assert.equal(state.myBets[0].bet, 50);
  assert.deepEqual(state.queued, [{ slot: 0, bet: 100 }]);
  assert.equal(s.data.gameresults[2].roundNo, 12);
  assert.equal(s.users.get("alice").balance, 1000);
  assert.equal(s.users.get("bob").balance, 1000);
  assert.deepEqual(s.changes, []);
});

test("Aviator: zero-stake rounds restart on the shared clock without wallet or result writes", async () => {
  const s = createLegacyScene();
  const first = await s.flight.getState(null, "aviator");
  s.at(first.round.startsAt + 1000);
  const crashed = await s.flight.getState(null, "aviator");
  s.at(crashed.round.endedAt + 3500);
  const next = await s.flight.getState("alice", "aviator");
  assert.equal(next.round.id, first.round.id + 1);
  assert.equal(next.round.startsAt, crashed.round.endedAt + 3500 + 10000);
  assert.deepEqual(s.changes, []);
  assert.deepEqual(s.data.gameresults, []);
});

test("Aviator and Aviator X each wait a full ten seconds before new flights", async () => {
  const s = createLegacyScene();
  const first = await s.flight.getState(null, "aviator");
  assert.equal(first.config.waitMs, 10000);
  assert.equal(first.round.startsAt - first.serverNow, 10000);
  s.at(first.round.startsAt + 1000);
  const crashed = await s.flight.getState(null, "aviator");
  s.at(crashed.round.endedAt + 3500);
  const next = await s.flight.getState(null, "aviator");
  assert.equal(next.round.status, "waiting");
  assert.equal(next.round.startsAt - next.serverNow, 10000);
  s.at(next.round.startsAt - 1);
  assert.equal((await s.flight.getState(null, "aviator")).round.status, "waiting");
  s.at(next.round.startsAt);
  assert.equal((await s.flight.getState(null, "aviator")).round.status, "running");
  const x = await s.flight.getState(null, "aviator-x");
  assert.equal(x.config.waitMs, 10000);
  assert.equal(x.round.startsAt - x.serverNow, 10000);
  s.at(x.round.startsAt - 1);
  assert.equal((await s.flight.getState(null, "aviator-x")).round.status, "waiting");
  s.at(x.round.startsAt);
  assert.equal((await s.flight.getState(null, "aviator-x")).round.status, "running");
});

test("Aviator: failed reservation and failed cashout roll back wallet and ledger atomically", async () => {
  const s = createLegacyScene();
  const first = await s.flight.getState(null, "aviator");
  s.failNext("gameresults");
  await assert.rejects(s.flight.placeBet("alice", "aviator", 50, 0), /Injected/);
  assert.equal(s.users.get("alice").balance, 1000);
  assert.equal(s.data.gameresults.length, 0);
  await s.flight.placeBet("alice", "aviator", 50, 0);
  s.at(first.round.startsAt + 180);
  s.failNext("users");
  await assert.rejects(s.flight.cashOut("alice", "aviator", 0), /Injected/);
  assert.equal(s.data.gameresults[0].outcome, "pending");
  assert.equal(s.users.get("alice").balance, 950);
  assert.equal(s.data.winholds.length, 0);
  assert.equal((await s.flight.cashOut("alice", "aviator", 0)).ok, true);
});

test("Aviator: stale targets and slow wallet reads never put a bet into the wrong flight", async () => {
  const s = createLegacyScene();
  const first = await s.flight.getState(null, "aviator");
  s.at(first.round.startsAt - 100);
  s.setReadDelay(150);
  const stale = await s.flight.placeBet("alice", "aviator", 50, 0, first.round.id);
  assert.ok(stale.error);
  assert.equal(s.users.get("alice").balance, 1000);
  s.setReadDelay(0);
  assert.equal((await s.flight.placeBet("alice", "aviator", 50, 0)).queued, true);
});

test("Aviator: an opted-in bet delayed past takeoff reserves N+1 once and returns its committed receipt", async () => {
  const s = createLegacyScene();
  const first = await s.flight.getState("alice", "aviator");
  s.at(first.round.startsAt - 100);
  s.setReadDelay(150);
  const placed = await s.flight.placeBet("alice", "aviator", 50, 0, first.round.id, true);
  assert.equal(placed.ok, true);
  assert.equal(placed.queued, true);
  assert.equal(placed.round, first.round.id + 1);
  assert.equal(placed.balance, 950);
  assert.equal(placed.bet.id, s.data.gameresults[0]._id);
  assert.equal(placed.bet.bet, 50);
  assert.equal(placed.bet.outcome, "pending");
  assert.equal(s.data.gameresults[0].roundNo, first.round.id + 1);
  s.setReadDelay(0);
  const duplicate = await s.flight.placeBet("alice", "aviator", 50, 0, first.round.id, true);
  assert.match(duplicate.error, /already placed/);
  assert.equal(s.users.get("alice").balance, 950);
  assert.equal(s.data.gameresults.length, 1);
  assert.equal((await s.flight.cancelBet("alice", "aviator", 0, placed.round)).ok, true);
  assert.equal(s.users.get("alice").balance, 1000);
});

test("Aviator: current-round receipts preserve the exact amount without entering the legacy pool", async () => {
  const s = createLegacyScene(["alice"], { poolEnabled: true });
  const first = await s.flight.getState("alice", "aviator");
  const placed = await s.flight.placeBet("alice", "aviator", 125.5, 0, first.round.id, true);
  assert.equal(placed.ok, true);
  assert.equal(placed.queued, false);
  assert.equal(placed.round, first.round.id);
  assert.equal(placed.balance, 874.5);
  assert.equal(placed.bet.bet, 125.5);
  assert.equal(placed.bet.poolVersion, undefined);
  assert.equal(placed.bet.flightModel, "aviator-80-pre2-v2");
  assert.equal(s.data.dailypoolentries.length, 0);
});

test("Aviator: takeoff during the wager read rechecks the next flight for duplicate panel reservations", async () => {
  const s = createLegacyScene();
  const first = await s.flight.getState("alice", "aviator");
  s.at(first.round.startsAt - 100);
  s.setWagerReadDelay(150);
  const placed = await s.flight.placeBet("alice", "aviator", 50, 0, first.round.id, true);
  assert.equal(placed.ok, true);
  assert.equal(placed.queued, true);
  assert.equal(placed.round, first.round.id + 1);
  assert.equal(s.data.gameresults[0].roundNo, first.round.id + 1);
  assert.equal(s.users.get("alice").balance, 950);
  assert.ok((await s.flight.placeBet("alice", "aviator", 50, 0, first.round.id, true)).error);
  assert.equal(s.users.get("alice").balance, 950);
});

test("Aviator: queue opt-in rejects targets more than one flight stale and does not change Aviator X", async () => {
  const s = createLegacyScene();
  const first = await s.flight.getState("alice", "aviator");
  assert.ok((await s.flight.placeBet("alice", "aviator", 50, 0, first.round.id - 2, true)).error);
  const x = await s.flight.getState("alice", "aviator-x");
  s.at(x.round.startsAt - 100);
  s.setReadDelay(150);
  assert.ok((await s.flight.placeBet("alice", "aviator-x", 50, 0, x.round.id, true)).error);
  assert.equal(s.users.get("alice").balance, 1000);
});

test("Aviator: concurrent cashouts cannot double credit", async () => {
  const s = createLegacyScene();
  const first = await s.flight.getState(null, "aviator");
  await s.flight.placeBet("alice", "aviator", 50, 0);
  s.at(first.round.startsAt + 180);
  const replies = await Promise.all([s.flight.cashOut("alice", "aviator", 0), s.flight.cashOut("alice", "aviator", 0)]);
  assert.equal(replies.filter((reply) => reply.ok).length, 1);
  assert.equal(s.data.winholds.length, 0);
});
