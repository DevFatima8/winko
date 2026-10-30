import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

const players = Array.from({ length: 100 }, (_, i) => `player-${i}`);
const cycle = (s, game) => s.data.multiplayerrooms.find(row => row._id === `${game}:ten-player-wins:v1`);

for (const pooled of [false, true]) {
  for (const slug of ["chicken-road-2", "chicken-dash"]) {
    test(`${slug}, pooled=${pooled}: only ten of 100 different players can cash out`, async () => {
      const s = createLegacyScene(players, { poolEnabled: pooled });
      const starts = await Promise.all(players.map(user => s.chicken.startPoolChicken(user, slug, 10, "easy")));
      assert.ok(starts.every(reply => reply.ok));
      assert.deepEqual(cycle(s, slug).players, []);
      let cashed = 0;
      for (const user of players) {
        const first = await s.chicken.actPoolChicken(user, slug, "step");
        assert.equal(first.ok, true);
        if (first.event === "dead") continue;
        const reply = await s.chicken.actPoolChicken(user, slug, "cashout");
        assert.equal(reply.ok, true);
        assert.equal(reply.game.status, "cashed");
        assert.equal(reply.poolPending, pooled);
        if (!pooled) assert.ok(reply.win > 0);
        cashed++;
        assert.equal(await s.chicken.actPoolChicken(user, slug, "cashout"), null);
      }
      assert.equal(cashed, 10);
      assert.equal(s.data.gameresults.filter(row => row.outcome === "win").length, 10);
      assert.equal(s.data.dailypoolentries.length, pooled ? 100 : 0);
    });
  }

  test(`Treasure Bowl, pooled=${pooled}: ten server wins per 100 players, with replay and client-forgery protection`, async () => {
    const s = createLegacyScene(players, { poolEnabled: pooled });
    s.data.games.push({ _id: "treasure-bowl", slug: "treasure-bowl", isActive: true });
    const replies = await Promise.all(players.map(async user => {
      const wagerId = randomUUID();
      await s.store.transact("treasure-bowl", tx => s.browser.browserPoolLifecycle(tx, user, {
        game: "treasure-bowl", wagerId, operationId: randomUUID(), action: "accept", amount: 10, poolVersion: s.poolRules.DAILY_POOL_VERSION,
      }, pooled));
      const input = { game: "treasure-bowl", wagerId, operationId: randomUUID(), selection: {} };
      const reply = await s.store.transact("treasure-bowl", tx => s.browser.resolveServerBrowserWager(tx, user, input, pooled));
      const replay = await s.store.transact("treasure-bowl", tx => s.browser.resolveServerBrowserWager(tx, user, input, pooled));
      assert.deepEqual(replay.outcome, reply.outcome);
      // Other concurrent players can advance the cycle, so check this wager's recorded outcome instead.
      assert.equal(replay.claim, reply.claim);
      assert.equal(reply.outcome.finalReels.length, 9);
      assert.equal(reply.outcome.isWin, reply.claim > 0);
      return reply;
    }));
    assert.equal(replies.filter(reply => reply.outcome.isWin).length, 10);
    assert.deepEqual(cycle(s, "treasure-bowl").players, []);
    await assert.rejects(s.store.transact("treasure-bowl", tx => s.browser.browserPoolLifecycle(tx, players[0], {
      game: "treasure-bowl", wagerId: randomUUID(), operationId: randomUUID(), action: "complete", amount: 1000000,
    }, pooled)), /verification/);
  });
}

test("Chicken cycle ignores repeat players and rejected bets; a failed transaction rolls back the slot", async () => {
  const s = createLegacyScene(["alice", "bob"]);
  assert.ok((await s.chicken.startPoolChicken("alice", "chicken-dash", 5, "easy")).error);
  assert.equal(cycle(s, "chicken-dash"), undefined);
  s.failNext("gameresults");
  await assert.rejects(s.chicken.startPoolChicken("alice", "chicken-dash", 10, "easy"), /Injected/);
  assert.equal(cycle(s, "chicken-dash"), undefined);
  assert.equal(s.users.get("alice").balance, 1000);
  await s.chicken.startPoolChicken("alice", "chicken-dash", 10, "easy");
  assert.ok((await s.chicken.startPoolChicken("alice", "chicken-dash", 10, "easy")).error);
  for (let i = 0; i < 30; i++) {
    const reply = await s.chicken.actPoolChicken("alice", "chicken-dash", "step");
    if (reply.game.status !== "active") break;
  }
  await s.chicken.startPoolChicken("alice", "chicken-dash", 10, "easy");
  assert.equal((await s.chicken.actPoolChicken("alice", "chicken-dash", "step")).event, "dead");
  assert.equal(cycle(s, "chicken-dash").players.length, 1);
});

for (const count of [5, 10, 50, 100]) {
  for (const pooled of [false, true]) {
    test(`Aviator ${count} players, pooled=${pooled}: crashes immediately at ceil(players/5) cashouts`, async () => {
      const ids = players.slice(0, count);
      const s = createLegacyScene(ids, { poolEnabled: pooled });
      const first = await s.flight.getState(null, "aviator");
      s.data.aviatorrounds[0].crashPoint = 10;
      await Promise.all(ids.map(user => s.flight.placeBet(user, "aviator", 10, 0)));
      // A second panel is still the same player, not another participant.
      await s.flight.placeBet(ids[0], "aviator", 10, 1);
      s.at(first.round.startsAt + 500);
      const replies = await Promise.all(ids.map(user => s.flight.cashOut(user, "aviator", 0, first.round.id)));
      assert.equal(replies.filter(reply => reply.ok).length, Math.ceil(count / 5));
      const state = await s.flight.getState(null, "aviator");
      assert.equal(state.round.status, "crashed");
      assert.equal(state.round.endedAt, first.round.startsAt + 500);
      assert.equal(state.bets.filter(row => row.outcome === "pending").length, 0);
      assert.ok((await s.flight.cashOut(ids[0], "aviator", 1, first.round.id)).error);
    });
  }
}

test("Aviator still crashes at its random crash point when nobody cashes out", async () => {
  const s = createLegacyScene(players.slice(0, 10));
  const first = await s.flight.getState(null, "aviator");
  s.data.aviatorrounds[0].crashPoint = 1.5;
  await Promise.all(players.slice(0, 10).map(user => s.flight.placeBet(user, "aviator", 10, 0)));
  s.at(first.round.startsAt + 100);
  assert.equal((await s.flight.getState(null, "aviator")).round.status, "running");
  s.at(first.round.startsAt + 60_000);
  const state = await s.flight.getState(null, "aviator");
  assert.ok(state.round.status === "crashed" || state.round.id > first.round.id);
  assert.equal(s.data.gameresults.filter(bet => bet.outcome === "pending").length, 0);
  assert.equal(s.data.gameresults.filter(bet => bet.outcome === "win").length, 0);
});

test("Aviator threshold crash failure rolls back cashout, wallet and pending results", async () => {
  const s = createLegacyScene(["alice", "bob"]);
  const first = await s.flight.getState(null, "aviator");
  s.data.aviatorrounds[0].crashPoint = 10;
  await s.flight.placeBet("alice", "aviator", 10, 0);
  await s.flight.placeBet("bob", "aviator", 10, 0);
  s.at(first.round.startsAt + 100);
  await s.flight.getState(null, "aviator");
  const before = structuredClone(s.data);
  s.failNext("aviatorrounds");
  await assert.rejects(s.flight.cashOut("alice", "aviator", 0, first.round.id), /Injected/);
  assert.deepEqual(s.data, before);
});

test("Aviator catches an already exceeded cashout threshold on the next live state read", async () => {
  const s = createLegacyScene(players.slice(0, 10));
  const first = await s.flight.getState(null, "aviator");
  s.data.aviatorrounds[0].crashPoint = 10;
  await Promise.all(players.slice(0, 10).map(user => s.flight.placeBet(user, "aviator", 10, 0)));
  s.data.gameresults[0].outcome = "win";
  s.data.gameresults[1].outcome = "win";
  s.at(first.round.startsAt + 200);
  const state = await s.flight.getState(null, "aviator");
  assert.equal(state.round.status, "crashed");
  assert.equal(state.bets.filter(bet => bet.outcome === "pending").length, 0);
});

test("Treasure Bowl retries consume one slot, repeat players do not draw again, and failures roll back", async () => {
  const s = createLegacyScene(["alice", "bob"]);
  s.data.games.push({ _id: "treasure-bowl", slug: "treasure-bowl", isActive: true });
  const input = { game: "treasure-bowl", wagerId: randomUUID(), stake: 10, selection: {} };
  const play = value => s.store.transact("treasure-bowl", tx => s.browser.playServerBrowserWager(tx, "alice", value, false));
  s.failNext("gameresults");
  const before = structuredClone(s.data);
  await assert.rejects(play(input), /Injected/);
  assert.deepEqual(s.data, before);
  const first = await play(input);
  const after = structuredClone(s.data);
  const replay = await play(input);
  assert.deepEqual(first.outcome, replay.outcome);
  assert.deepEqual(s.data, after);
  const repeat = await play({ ...input, wagerId: randomUUID() });
  assert.equal(repeat.outcome.isWin, false);
  assert.equal(repeat.claim, 0);
  assert.deepEqual(cycle(s, "treasure-bowl").players, ["alice"]);
});

test("Malformed player cycles cannot accept a wager or debit a wallet", async () => {
  for (const bad of [
    { players: [], remaining: Array(100).fill(true) },
    { players: ["alice", "alice"], remaining: Array(98).fill(false) },
    { players: [], remaining: ["win", ...Array(99).fill(false)] },
    { players: [], remaining: [] },
  ]) {
    const s = createLegacyScene(["alice"]);
    s.data.multiplayerrooms.push({ _id: "chicken-dash:ten-player-wins:v1", ...bad });
    const before = structuredClone(s.data);
    await assert.rejects(s.chicken.startPoolChicken("alice", "chicken-dash", 10, "easy"), /cycle is invalid/);
    assert.deepEqual(s.data, before);
  }
});

test("Treasure Bowl blocks forged completion on new wagers but preserves already accepted legacy hands", async () => {
  const s = createLegacyScene(["alice"]);
  s.data.games.push({ _id: "treasure-bowl", slug: "treasure-bowl", isActive: true });
  const wagerId = randomUUID();
  const accept = { game: "treasure-bowl", wagerId, operationId: randomUUID(), action: "accept", amount: 10 };
  await s.store.transact("treasure-bowl", tx => s.browser.browserPoolLifecycle(tx, "alice", accept, false));
  const complete = { ...accept, operationId: randomUUID(), action: "complete", amount: 20 };
  await assert.rejects(s.store.transact("treasure-bowl", tx => s.browser.browserPoolLifecycle(tx, "alice", complete, false)), /verification/);
  assert.equal(s.users.get("alice").balance, 990);
  // Accepted pre-upgrade hands have no server-required marker.
  delete s.data.gameresults[0].browserServerRequired;
  await s.store.transact("treasure-bowl", tx => s.browser.browserPoolLifecycle(tx, "alice", complete, false));
  assert.equal(s.users.get("alice").balance, 1010);
  assert.equal(cycle(s, "treasure-bowl"), undefined);
});
