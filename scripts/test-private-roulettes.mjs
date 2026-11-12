import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import test from "node:test";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

const players = Array.from({ length: 100 }, (_, i) => `roulette-player-${i}`);
const make = (game, users = players) => {
  const scene = createLegacyScene(users, { poolEnabled: true });
  scene.data.games.push({ _id: game, slug: game, isActive: true });
  return scene;
};
const request = (roundNo, option, amount = 100) => ({ action: "bet", requestId: randomUUID(), roundNo, option, amount });
const option = game => game === "auto-roulette" ? "n:17" : "n-17";
const cycle = (s, game) => s.data.multiplayerrooms.find(room => room._id === `${game}:bet-wins-30-of-100:v1`);

for (const game of ["auto-roulette", "lightning-roulette"]) {
  test(`${game}: 100 personal players have thirty wheel-matching wins, single debit/credit and a 2x aggregate gross cap`, async () => {
    const s = make(game);
    const historical = { _id: `${game}:ten-player-wins:v1`, players: ["previous"], remaining: [false] };
    s.data.multiplayerrooms.push(structuredClone(historical));
    let paid = 0;
    for (const userId of players) {
      s.at(100000);
      const start = await s.multiplayer.read(game, userId);
      assert.equal(start.tableMode, "personal");
      assert.equal(start.round.result, null);
      const input = request(start.round.roundNo, option(game));
      await s.multiplayer.act(game, userId, input);
      await s.multiplayer.act(game, userId, input);
      assert.equal(s.users.get(userId).balance, 900);
      s.at(start.round.bettingEndsAt);
      const spinning = await s.multiplayer.read(game, userId);
      assert.ok(spinning.round.result);
      assert.equal(s.users.get(userId).balance, 900, "wheel spins before settlement");
      s.at(start.round.resultAt);
      const done = await s.multiplayer.read(game, userId);
      const payout = done.myBets[0].payout;
      assert.equal(payout > 0, done.round.result.number === 17);
      assert.ok(payout === 0 || payout === 196);
      assert.equal(s.users.get(userId).balance, 900 + payout);
      const holds = s.data.winholds.filter(hold => hold.userId === userId);
      assert.equal(payout + holds.reduce((sum, hold) => sum + hold.amount, 0), payout > 0 ? 200 : 0);
      const before = structuredClone(s.data);
      await s.multiplayer.act(game, userId, input);
      await s.multiplayer.read(game, userId);
      assert.deepEqual(s.data, before);
      if (payout) paid++;
    }
    assert.equal(paid, 30);
    assert.equal(s.data.gameresults.length, 100);
    assert.equal(s.data.dailypoolentries.length, 0, "new roulette bets are instant even with pool mode on");
    assert.equal(cycle(s, game).remaining.length, 100);
    assert.deepEqual(s.data.multiplayerrooms.find(room => room._id === historical._id), historical);
  });

  test(`${game}: multiple feasible spots stay playable, covering bets and failed writes roll back`, async () => {
    const s = make(game, ["alice", "bob"]);
    const start = await s.multiplayer.read(game, "alice");
    const input = request(start.round.roundNo, option(game));
    const empty = structuredClone(s.data);
    s.failNext("users");
    await assert.rejects(s.multiplayer.act(game, "alice", input), /Injected/);
    assert.deepEqual(s.data, empty);
    await s.multiplayer.act(game, "alice", input);
    const red = game === "auto-roulette" ? "red" : "out-red";
    await s.multiplayer.act(game, "alice", request(start.round.roundNo, red));
    const black = game === "auto-roulette" ? "black" : "out-black";
    await s.multiplayer.act(game, "alice", request(start.round.roundNo, black));
    const accepted = structuredClone(s.data);
    await assert.rejects(s.multiplayer.act(game, "alice", request(start.round.roundNo, game === "auto-roulette" ? "n:0" : "n-0")), /profitable|cover/);
    assert.deepEqual(s.data, accepted);
    assert.equal((await s.multiplayer.read(game, "bob")).bets.length, 0);
    assert.equal((await s.multiplayer.read(game)).bets.length, 0);
    assert.equal(cycle(s, game), undefined, "slot is not drawn before close");
    s.at(start.round.resultAt);
    const before = structuredClone(s.data);
    s.failNext("gameresults");
    await assert.rejects(s.multiplayer.read(game, "alice"), /Injected/);
    assert.deepEqual(s.data, before);
    const done = await s.multiplayer.read(game, "alice");
    const gross = done.myBets.reduce((sum, bet) => sum + bet.payout, 0)
      + s.data.winholds.reduce((sum, hold) => sum + hold.amount, 0);
    assert.ok(gross <= 600);
    assert.equal(cycle(s, game).remaining.length, 99);
    if (gross > 0) {
      assert.ok(done.myBets.reduce((sum, bet) => sum + bet.payout, 0) > 300);
      for (const bet of done.myBets.filter(bet => bet.payout > 0)) {
        const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
        assert.ok(bet.option === option(game) ? done.round.result.number === 17
          : bet.option === red ? redNumbers.includes(done.round.result.number)
          : done.round.result.number !== 0 && !redNumbers.includes(done.round.result.number));
      }
    }
  });

  test(`${game}: full cancellation refunds once without consuming a cycle slot`, async () => {
    const s = make(game, ["alice"]);
    const start = await s.multiplayer.read(game, "alice");
    await s.multiplayer.act(game, "alice", request(start.round.roundNo, option(game)));
    const cancel = { action: "cancel", roundNo: start.round.roundNo, requestId: randomUUID() };
    await s.multiplayer.act(game, "alice", cancel);
    await s.multiplayer.act(game, "alice", cancel);
    s.at(start.round.resultAt);
    await s.multiplayer.read(game, "alice");
    assert.equal(s.users.get("alice").balance, 1000);
    assert.equal(cycle(s, game), undefined);
    assert.equal(s.data.gameresults.length, 0);
  });

  test(`${game}: a delayed wager crossing the betting deadline cannot reserve the next wheel`, async () => {
    const s = make(game, ["alice"]);
    const start = await s.multiplayer.read(game, "alice");
    s.at(start.round.bettingEndsAt - 1);
    s.setReadDelay(2);
    await assert.rejects(s.multiplayer.act(game, "alice", request(start.round.roundNo, option(game))), /Betting is closed|Betting closed/);
    assert.equal(s.users.get("alice").balance, 1000);
    assert.equal(s.data.gameresults.length, 0);
    assert.equal(cycle(s, game), undefined);
    s.setReadDelay(0);
    s.at(start.round.endsAt);
    const next = await s.multiplayer.read(game, "alice");
    assert.deepEqual(next.myQueuedBets, []);
    await s.multiplayer.act(game, "alice", request(next.round.roundNo, option(game)));
    assert.equal(s.users.get("alice").balance, 900);
  });

  test(`${game}: three unwagered rounds spin and reopen without taking money or a player slot`, async () => {
    const s = make(game, ["alice"]);
    for (const user of ["alice", null]) {
      let state = await s.multiplayer.read(game, user);
      for (let index = 0; index < 3; index++) {
        s.at(state.round.bettingEndsAt);
        const spinning = await s.multiplayer.read(game, user);
        assert.equal(spinning.round.phase, "running");
        assert.ok(Number.isInteger(spinning.round.result.number));
        assert.deepEqual(spinning.myBets, []);
        s.at(spinning.round.resultAt);
        const result = await s.multiplayer.read(game, user);
        assert.equal(result.round.result.number, spinning.round.result.number);
        s.at(result.round.endsAt);
        const next = await s.multiplayer.read(game, user);
        assert.equal(next.round.roundNo, state.round.roundNo + 1);
        assert.equal(next.round.phase, "betting");
        assert.deepEqual(next.myQueuedBets, []);
        state = next;
      }
    }
    assert.equal(s.users.get("alice").balance, 1000);
    assert.equal(s.data.gameresults.length, 0);
    assert.equal(s.data.winholds.length, 0);
    assert.equal(cycle(s, game), undefined);
  });

  test(`${game}: repeat players consume a new slot only in the next betting window`, async () => {
    const s = make(game, ["alice"]);
    const start = await s.multiplayer.read(game, "alice");
    await s.multiplayer.act(game, "alice", request(start.round.roundNo, option(game)));
    s.at(start.round.bettingEndsAt);
    await assert.rejects(s.multiplayer.act(game, "alice", request(start.round.roundNo + 1, option(game))), /Wait for the next round/);
    assert.equal(s.users.get("alice").balance, 900);
    await s.multiplayer.read(game, "alice");
    const assigned = structuredClone(cycle(s, game));
    s.at(start.round.endsAt);
    const next = await s.multiplayer.read(game, "alice");
    assert.equal(next.myBets.length, 0);
    assert.equal(next.myQueuedBets.length, 0);
    assert.deepEqual(cycle(s, game), assigned);
    await s.multiplayer.act(game, "alice", request(next.round.roundNo, option(game)));
    const balance = s.users.get("alice").balance;
    s.at(next.round.resultAt);
    const done = await s.multiplayer.read(game, "alice");
    assert.equal(s.users.get("alice").balance, balance + done.myBets[0].payout);
    assert.equal(cycle(s, game).remaining.length, assigned.remaining.length - 1);
  });

  test(`${game}: 1 crore winning stake is capped at 2 crore, including holds`, async () => {
    const s = make(game, ["alice"]);
    s.users.get("alice").balance = 20000000;
    s.data.multiplayerrooms.push({ _id: `${game}:bet-wins-30-of-100:v1`, players: Array.from({ length: 99 }, (_, i) => `prior-${i}`), remaining: [true] });
    const start = await s.multiplayer.read(game, "alice");
    await s.multiplayer.act(game, "alice", request(start.round.roundNo, option(game), 10000000));
    assert.equal(s.users.get("alice").balance, 10000000);
    s.at(start.round.resultAt);
    const done = await s.multiplayer.read(game, "alice");
    assert.equal(done.myBets[0].payout, 19600000);
    assert.equal(s.data.winholds[0].amount, 400000);
    assert.equal(s.users.get("alice").balance, 29600000);
  });

  test(`${game}: preexisting shared wager keeps original common number and high paytable`, async () => {
    const s = make(game, ["alice", "bob"]);
    s.data.multiplayerrooms.push({
      _id: game, gameId: game, game, roundNo: 7, startedAt: 100000,
      outcome: { number: 17, lightning: game === "lightning-roulette" ? { 17: 100 } : {} },
      settled: false, bets: [{ id: "original-wager", userId: "alice", name: "A***e", option: option(game), amount: 100, roundNo: 7, status: "pending", payout: 0 }],
      queuedBets: [], history: [],
    });
    s.users.get("alice").balance = 900;
    const old = await s.multiplayer.read(game, "alice");
    assert.equal(old.tableMode, "shared");
    assert.equal((await s.multiplayer.read(game, "bob")).tableMode, "personal");
    s.at(old.round.resultAt);
    const done = await s.multiplayer.read(game, "alice");
    assert.equal(done.round.result.number, 17);
    assert.equal(done.myBets[0].payout, game === "lightning-roulette" ? 9898 : 3528);
    assert.equal(cycle(s, game), undefined);
    s.at(old.round.endsAt);
    await s.multiplayer.read(game, "alice");
    assert.equal((await s.multiplayer.read(game, "alice")).tableMode, "personal");
    assert.equal(s.data.gameresults.length, 1);
  });

  test(`${game}: preexisting pooled shared wager remains deferred and never credits the instant wallet`, async () => {
    const s = make(game, ["alice"]);
    const betId = "original-pooled-wager";
    const resultId = createHash("sha256").update(`result:${betId}`).digest("hex");
    const record = {
      _id: resultId, gameId: game, userId: "alice", roundNo: 7, betSlot: 0,
      betAmount: 100, winAmount: 0, outcome: "pending", createdAt: new Date(100000), updatedAt: new Date(100000),
    };
    await s.store.transact(`multiplayer:${game}`, async tx => {
      await s.pool.addPoolWager(tx, game, record);
      await tx.insert("gameresults", resultId, record);
    });
    s.data.multiplayerrooms.push({
      _id: game, gameId: game, game, roundNo: 7, startedAt: 100000,
      outcome: { number: 17, lightning: game === "lightning-roulette" ? { 17: 100 } : {} },
      settled: false, bets: [{
        id: betId, userId: "alice", name: "A***e", option: option(game), amount: 100, roundNo: 7,
        status: "pending", payout: 0, poolVersion: "daily-pool-v1", poolPending: true, poolClaim: 0,
      }], queuedBets: [], history: [],
    });
    s.users.get("alice").balance = 900;
    const old = await s.multiplayer.read(game, "alice");
    assert.equal(old.tableMode, "shared");
    s.at(old.round.resultAt);
    const done = await s.multiplayer.read(game, "alice");
    assert.equal(done.myBets[0].payout, 0);
    assert.equal(done.myBets[0].poolClaim, game === "lightning-roulette" ? 10100 : 3600);
    assert.equal(done.myBets[0].poolPending, true);
    assert.equal(s.users.get("alice").balance, 900);
    assert.equal(s.data.dailypoolentries[0].status, "closed");
    assert.equal(s.data.winholds.length, 0);
    assert.equal(cycle(s, game), undefined);
    const saved = structuredClone(s.data);
    await s.multiplayer.read(game, "alice");
    assert.deepEqual(s.data, saved);
  });
}
