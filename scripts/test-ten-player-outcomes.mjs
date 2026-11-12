import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

const players = Array.from({ length: 100 }, (_, i) => `player-${i}`);
const cycle = (s, game) => s.data.multiplayerrooms.find(row => row._id === `${game}:ten-player-wins:v1`);

for (const game of ["fishing-arcade", "derby-race"]) {
  test(`${game}: repeat-player wagers consume exactly 30 opportunities per 100, replays do not redraw`, async () => {
    const s = createLegacyScene(["alice"], { poolEnabled: false });
    s.data.games.push({ _id: game, slug: game, isActive: true });
    s.data.users[0].balance = 100000;
    for (let block = 0; block < 2; block++) {
      let wins = 0;
      for (let bet = 0; bet < 100; bet++) {
        const wagerId = randomUUID();
        const acceptInput = { game, wagerId, operationId: randomUUID(), action: "accept", amount: 10 };
        if (bet === 0 && block === 0) {
          const before = structuredClone(s.data);
          s.failNext("users");
          await assert.rejects(s.store.transact(game, tx => s.browser.browserPoolLifecycle(tx, "alice", acceptInput, false)), /Injected/);
          assert.deepEqual(s.data, before, "Acceptance failure must roll back the cycle and wallet");
        }
        const accepted = await s.store.transact(game, tx => s.browser.browserPoolLifecycle(tx, "alice", acceptInput, false));
        let won;
        if (game === "fishing-arcade") {
          const replay = await s.store.transact(game, tx => s.browser.browserPoolLifecycle(tx, "alice", acceptInput, false));
          assert.equal(replay.shotWin, accepted.shotWin);
          won = accepted.shotWin;
          if (!won) await assert.rejects(s.store.transact(game, tx => s.browser.browserPoolLifecycle(tx, "alice", {
            game, wagerId, operationId: randomUUID(), action: "complete", amount: 15,
          }, false)), /no winning opportunity/);
          await s.store.transact(game, tx => s.browser.browserPoolLifecycle(tx, "alice", {
            game, wagerId, operationId: randomUUID(), action: "complete", amount: won ? 15 : 0,
          }, false));
        } else {
          const input = { game, wagerId, operationId: randomUUID(), selection: { horseId: bet % 6 + 1, round: bet + 1 } };
          const reply = await s.store.transact(game, tx => s.browser.resolveServerBrowserWager(tx, "alice", input, false));
          const replay = await s.store.transact(game, tx => s.browser.resolveServerBrowserWager(tx, "alice", input, false));
          assert.deepEqual(replay.outcome, reply.outcome);
          won = reply.outcome.playerWon;
          assert.equal(won, reply.outcome.winnerId === input.selection.horseId);
          assert.equal(reply.claim, won ? 27.5 : 0);
          assert.equal(Math.max(...reply.outcome.finishingPaces), 1);
        }
        wins += Number(won);
      }
      assert.equal(wins, 30);
      assert.equal(s.data.multiplayerrooms.find(row => row._id === `${game}:bet-wins-30-of-100:v1`).remaining.length, 100);
    }
  });
}

for (const pooled of [false, true]) {
  for (const slug of ["chicken-road-2", "chicken-dash"]) {
    test(`${slug}, pooled=${pooled}: independent crash lanes allow unrestricted cashouts with no player quota`, async () => {
      const s = createLegacyScene(players, { poolEnabled: pooled });
      let draw = 0;
      s.crashLanes.sampleCrashLane = survival => 1 + draw++ % survival.length;
      const starts = await Promise.all(players.map(user => s.chicken.startPoolChicken(user, slug, 10, "easy")));
      assert.ok(starts.every(reply => reply.ok));
      assert.equal(cycle(s, slug), undefined);
      const accepted = s.data[slug === "chicken-road-2" ? "chickengames" : "chickendashes"];
      assert.ok(accepted.every(game => game.crashModel === "independent-lanes-v1" && !game.playerCycleVersion));
      assert.ok(accepted.some(game => game.crashLane > game.lanes / 2 && game.crashLane <= game.lanes));
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
      assert.equal(cashed, accepted.filter(game => game.crashLane > 1).length);
      assert.ok(cashed > 30, "valid early cashouts are not denied to force a winner quota");
      assert.equal(draw, 100, "actions never reroll the accepted crash lane");
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

test("Chicken rounds crash at the saved early, middle and final lane without rerolling", async () => {
  for (const slug of ["chicken-road-2", "chicken-dash"]) {
    for (const point of [1, 2, 12, 24, 29]) {
      const s = createLegacyScene(["alice"]);
      let expected, draws = 0;
      s.crashLanes.sampleCrashLane = survival => {
        draws++;
        expected = Math.min(point, survival.length);
        return expected;
      };
      await s.chicken.startPoolChicken("alice", slug, 10, "easy");
      let result;
      for (let step = 0; step < 30; step++) {
        result = await s.chicken.actPoolChicken("alice", slug, "step");
        if (result.game.status !== "active") break;
      }
      assert.equal(draws, 1);
      const saved = s.data[slug === "chicken-road-2" ? "chickengames" : "chickendashes"][0];
      assert.equal(saved.crashLane, expected);
      assert.equal(saved.position, Math.min(expected, saved.lanes));
      assert.equal(saved.status, expected > saved.lanes ? "cashed" : "dead");
    }
  }
});

test("Legacy chicken cashouts roll back on failures and concurrent retries pay only once", async () => {
  for (const slug of ["chicken-road-2", "chicken-dash"]) {
    const s = createLegacyScene(["alice"]);
    await s.chicken.startPoolChicken("alice", slug, 100, "easy");
    const game = s.data[slug === "chicken-road-2" ? "chickengames" : "chickendashes"][0];
    delete game.playerCycleVersion;
    delete game.crashModel;
    game.position = 1;
    for (const table of ["users", "winholds", "gameresults", slug === "chicken-road-2" ? "chickengames" : "chickendashes"]) {
      const before = structuredClone(s.data);
      s.failNext(table);
      await assert.rejects(s.chicken.actPoolChicken("alice", slug, "cashout"), /Injected/);
      assert.deepEqual(s.data, before);
    }
    const [a, b] = await Promise.all([
      s.chicken.actPoolChicken("alice", slug, "cashout"),
      s.chicken.actPoolChicken("alice", slug, "cashout"),
    ]);
    assert.equal([a, b].filter(Boolean).length, 1);
    const paid = a ?? b;
    assert.equal(s.users.get("alice").balance, 900 + paid.win);
    assert.equal(s.data.winholds.length, 1);
    assert.equal(s.data.gameresults[0].outcome, slug === "chicken-dash" && paid.win <= 100 ? "lose" : "win");
  }
});

test("Legacy chicken final step and cashout cannot both settle", async () => {
  for (const slug of ["chicken-road-2", "chicken-dash"]) {
    const s = createLegacyScene(["alice"]);
    await s.chicken.startPoolChicken("alice", slug, 100, "easy");
    const game = s.data[slug === "chicken-road-2" ? "chickengames" : "chickendashes"][0];
    delete game.playerCycleVersion;
    delete game.crashModel;
    game.position = game.lanes - 1;
    game.crashLane = game.lanes + 1;
    const [step, cashout] = await Promise.all([
      s.chicken.actPoolChicken("alice", slug, "step"),
      s.chicken.actPoolChicken("alice", slug, "cashout"),
    ]);
    assert.equal(step.event, "finished");
    assert.equal(cashout, null);
    assert.equal(s.users.get("alice").balance, 900 + step.win);
    assert.equal(s.data.winholds.length, 1);
  }
});

test("Chicken rejects invalid bets, rolls back acceptance, and never forces repeat players to crash", async () => {
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
  s.data.chickendashes.find(game => game.status === "active").crashLane = 5;
  assert.notEqual((await s.chicken.actPoolChicken("alice", "chicken-dash", "step")).event, "dead");
  assert.equal(cycle(s, "chicken-dash"), undefined);
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

test("Chicken independent rounds ignore historical player quotas without rewriting them", async () => {
  for (const bad of [
    { players: [], remaining: Array(100).fill(true) },
    { players: ["alice", "alice"], remaining: Array(98).fill(false) },
    { players: [], remaining: ["win", ...Array(99).fill(false)] },
    { players: [], remaining: [] },
  ]) {
    const s = createLegacyScene(["alice"]);
    s.data.multiplayerrooms.push({ _id: "chicken-dash:ten-player-wins:v1", ...bad });
    const before = structuredClone(s.data.multiplayerrooms[0]);
    assert.ok((await s.chicken.startPoolChicken("alice", "chicken-dash", 10, "easy")).ok);
    assert.deepEqual(s.data.multiplayerrooms[0], before);
    assert.equal(s.users.get("alice").balance, 990);
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
