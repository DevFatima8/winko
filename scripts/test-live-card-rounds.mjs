import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

const tables = ["dragon-tiger", "andar-bahar"];
const primary = table => table === "dragon-tiger" ? "dragon" : "andar";
const room = (table, user) => `${table}:personal:v1:${user === null ? "spectator" : `player:${user}`}`;
const cycle = (s, table) => s.data.multiplayerrooms.find(row => row._id === `${table}:ten-player-wins:v1`);
const raw = (s, table, user) => s.data.cardrounds.filter(row => row.table === room(table, user)).at(-1);
function assertCards(result) {
  const valid = card => {
    assert.ok(Number.isInteger(card.r) && card.r >= 1 && card.r <= 13);
    assert.ok(Number.isInteger(card.s) && card.s >= 0 && card.s <= 3);
  };
  if (result.kind === "dragon-tiger") {
    valid(result.dragon); valid(result.tiger);
    const { dragon, tiger } = result;
    assert.equal(result.winner, dragon.r > tiger.r ? "dragon" : dragon.r < tiger.r ? "tiger" : "tie");
  } else {
    const dealt = result.andar.flatMap((card, index) => [card, result.bahar[index]]).filter(Boolean);
    assert.equal(dealt.length, result.andar.length + result.bahar.length);
    assert.equal(new Set([result.joker, ...dealt].map(card => `${card.r}:${card.s}`)).size, dealt.length + 1);
    [result.joker, ...dealt].forEach(valid);
    assert.ok(dealt.slice(0, -1).every(card => card.r !== result.joker.r));
    assert.equal(dealt.at(-1).r, result.joker.r);
    assert.equal(result.winner, dealt.length % 2 ? "andar" : "bahar");
    assert.equal(result.dealMs, 900);
  }
}

async function seedOld(s, table, users, { winner = primary(table), queued = false, pool = false } = {}) {
  const generated = s.cards.generateForWinner(table, winner);
  const anchor = 100000;
  const round = {
    _id: randomUUID(), table, roundNo: 1, status: "betting",
    bettingEndsAt: new Date(anchor + 20000), revealEndsAt: new Date(anchor + 20000 + generated.revealMs),
    result: JSON.stringify(generated.result), winner,
    createdAt: new Date(anchor), updatedAt: new Date(anchor),
  };
  s.data.cardrounds.push(round);
  for (const userId of users) {
    for (const roundNo of queued ? [1, 2] : [1]) {
      const bet = { _id: randomUUID(), userId, table, roundNo, option: winner, amount: 100, payout: 0, status: "pending", createdAt: new Date(anchor), updatedAt: new Date(anchor) };
      const record = { _id: randomUUID(), gameId: table, userId, roundNo, betSlot: 0, betAmount: 100, winAmount: 0, outcome: "pending", resultData: null, createdAt: new Date(anchor), updatedAt: new Date(anchor) };
      if (pool) await s.store.transact(s.poolRules.dailyPoolLock(table), async tx => {
        await s.pool.addPoolWager(tx, table, record, { sourceTable: "cardbets", sourceId: bet._id });
        Object.assign(bet, { poolResultId: record._id, poolVersion: record.poolVersion, poolPending: true, poolClaim: 0 });
      });
      s.users.get(userId).balance -= 100;
      s.data.cardbets.push(bet);
      s.data.gameresults.push(record);
    }
  }
  return round;
}

for (const table of tables) {
  for (const poolEnabled of [false, true]) {
    test(`${table}: 100 private real-card deals allocate exactly ten net wins; ledger debits and credits once (pool ${poolEnabled})`, async () => {
      const ids = Array.from({ length: 100 }, (_, index) => `player-${index}`);
      const s = createLegacyScene(ids, { poolEnabled });
      for (const user of ids) {
        const state = await s.cards.getState(user, table);
        assert.equal(state.tableMode, "personal");
        assert.equal(state.round.result, null);
        assert.equal(raw(s, table, user).result, "");
        assert.ok((await s.cards.placeBet(user, table, primary(table), 100, 1, `bet-${user}`)).ok);
        assert.equal(s.users.get(user).balance, 900);
        assert.equal(cycle(s, table), undefined);
      }
      s.at(120000);
      const draws = new Map();
      for (const user of ids) {
        const state = await s.cards.getState(user, table);
        assert.equal(state.round.status, "revealing");
        assertCards(state.round.result);
        assert.equal(state.myBets.length, 1);
        assert.equal(state.liveBets.length, 1);
        assert.equal(state.liveBets[0].mine, true);
        assert.ok(state.myExpected === 0 || state.myExpected > 100 && state.myExpected <= 200);
        draws.set(user, structuredClone(state));
      }
      assert.equal([...draws.values()].filter(state => state.myExpected > 100).length, 10);
      assert.equal(s.data.dailypoolentries.length, 0);
      assert.equal(cycle(s, table).players.length, 0);
      s.at(Math.max(...ids.map(user => +raw(s, table, user).revealEndsAt)) + 1);
      for (const user of ids) {
        await s.cards.getState(user, table);
        const expected = draws.get(user).myExpected;
        const bet = s.data.cardbets.find(row => row.userId === user);
        const ledger = s.data.gameresults.find(row => row.userId === user);
        assert.equal(bet.payout, expected);
        assert.equal(ledger.winAmount, expected);
        assert.equal(ledger.outcome, expected ? "win" : "lose");
        assert.equal(s.users.get(user).balance, 900 + expected);
        assert.equal(s.changes.filter(change => change.user === user && change.delta === -100).length, 1);
        assert.equal(s.changes.filter(change => change.user === user && change.delta > 0).length, expected ? 1 : 0);
        await s.cards.placeBet(user, table, primary(table), 100, 1, `bet-${user}`);
        await s.cards.getState(user, table);
        assert.equal(s.users.get(user).balance, 900 + expected);
      }
    });
  }

  test(`${table}: personal cards and histories are private; guests see only independent unwagered deals`, async () => {
    const s = createLegacyScene(["alice", "bob", "spectator"]);
    for (const user of ["alice", "bob", "spectator"]) {
      await s.cards.placeBet(user, table, primary(table), 100, 1);
    }
    const before = await s.cards.getState(null, table);
    assert.deepEqual(before.liveBets, []);
    assert.equal(before.myTotal, 0);
    s.at(120000);
    const alice = await s.cards.getState("alice", table);
    const bob = await s.cards.getState("bob", table);
    const guest = await s.cards.getState(null, table);
    assertCards(alice.round.result); assertCards(bob.round.result);
    assertCards(guest.round.result);
    assert.deepEqual(guest.liveBets, []);
    assert.deepEqual(guest.history, []);
    assert.equal(alice.liveBets.length, 1);
    assert.equal(alice.liveBets[0].name, "a***e");
    assert.equal(bob.liveBets[0].name, "b***b");
    assert.notEqual(raw(s, table, "alice")._id, raw(s, table, "bob")._id);
    assert.notEqual(raw(s, table, null)._id, raw(s, table, "spectator")._id);
    assert.ok(s.data.multiplayerrooms.some(row => row._id === room(table, "alice") && row.ownerId === "alice"));
    s.at(200000);
    await s.cards.getState("alice", table);
    const onlyAlice = await s.cards.getState("alice", table);
    assert.equal(onlyAlice.history.length, 1);
    assert.equal((await s.cards.getState("bob", table)).history.length, 1);
    assert.equal((await s.cards.getState(null, table)).history.length, 1);
    assert.equal(s.data.cardbets.filter(row => row.personalRoom === room(table, null)).length, 0);
  });

  test(`${table}: repeated empty rounds and cancelled stakes do not draw or consume a player slot`, async () => {
    const s = createLegacyScene(["alice"]);
    for (const user of ["alice", null]) {
      s.at(100000);
      let state = await s.cards.getState(user, table);
      for (let index = 0; index < 3; index++) {
        s.at(state.round.bettingEndsAt);
        const revealing = await s.cards.getState(user, table);
        assertCards(revealing.round.result);
        assert.equal(revealing.myTotal, 0);
        assert.equal(revealing.myExpected, 0);
        assert.deepEqual(revealing.liveBets, []);
        s.at(revealing.round.revealEndsAt);
        const next = await s.cards.getState(user, table);
        assert.equal(next.round.roundNo, state.round.roundNo + 1);
        assert.equal(next.round.status, "betting");
        assert.equal(next.round.result, null);
        state = next;
      }
      assert.equal(cycle(s, table), undefined);
      assert.equal(s.users.get("alice").balance, 1000);
      assert.equal(s.data.gameresults.length, 0);
      assert.equal(s.data.winholds.length, 0);
    }
    let state = await s.cards.getState("alice", table);
    if (state.round.status !== "betting") {
      s.at(state.round.revealEndsAt);
      state = await s.cards.getState("alice", table);
    }
    await s.cards.placeBet("alice", table, primary(table), 100, state.round.roundNo, "cancel-me");
    assert.equal((await s.cards.cancelBets("alice", table, "current", state.round.roundNo)).refunded, 100);
    assert.equal(s.users.get("alice").balance, 1000);
    assert.equal(s.data.gameresults.length, 0);
    assert.equal(s.data.cardbets.length, 0);
    assert.ok((await s.cards.cancelBets("alice", table, "current", state.round.roundNo)).error);
    assert.ok((await s.cards.placeBet("alice", table, primary(table), 100, state.round.roundNo, "cancel-me")).ok);
    assert.equal(s.data.cardbets.length, 0);
    s.at(state.round.revealEndsAt + 1);
    await s.cards.getState("alice", table);
    assert.equal(cycle(s, table), undefined);
    assert.equal(s.data.gameresults.length, 0);
  });

  test(`${table}: cancellation and different-option coverage validation cannot consume a slot`, async () => {
    const s = createLegacyScene(["alice"]);
    const options = Object.keys(s.cards.TABLES[table].options);
    await s.cards.placeBet("alice", table, options[0], 100, 1);
    const result = await s.cards.placeBet("alice", table, options.at(-1), 100, 1);
    assert.match(result.error, /net win|zero-return/);
    assert.equal(s.users.get("alice").balance, 900);
    assert.equal(s.data.cardbets.length, 1);
    assert.equal(cycle(s, table), undefined);
    assert.ok((await s.cards.placeBet("alice", table, "fake", 100, 1)).error);
    assert.ok((await s.cards.placeBet("alice", table, options[0], Number.NaN, 1)).error);
    assert.ok((await s.cards.placeBet("alice", table, options[0], 2000, 1)).error);
    assert.ok((await s.cards.placeBet("alice", table, options[0], 50, 42)).error);
    assert.equal(cycle(s, table), undefined);
    assert.equal(s.users.get("alice").balance, 900);
  });

  test(`${table}: concurrent retries debit once and fingerprint conflicts do not alter wagers`, async () => {
    const s = createLegacyScene(["alice"]);
    const replies = await Promise.all(Array.from({ length: 5 }, () => s.cards.placeBet("alice", table, primary(table), 100, 1, "same")));
    assert.ok(replies.every(reply => reply.ok));
    assert.equal(s.data.cardbets.length, 1);
    assert.equal(s.data.gameresults.length, 1);
    assert.equal(s.users.get("alice").balance, 900);
    assert.match((await s.cards.placeBet("alice", table, primary(table), 200, 1, "same")).error, /different wager/);
    assert.equal(cycle(s, table), undefined);
  });

  test(`${table}: reserve, close-allocation, and credit failures roll back together and retry once`, async () => {
    const s = createLegacyScene(["alice"]);
    s.failNext("gameresults");
    await assert.rejects(s.cards.placeBet("alice", table, primary(table), 100, 1, "retry"), /Injected/);
    assert.equal(s.users.get("alice").balance, 1000);
    assert.equal(s.data.cardbets.length, 0);
    assert.equal(s.data.multiplayerrequests.length, 0);
    await s.cards.placeBet("alice", table, primary(table), 100, 1, "retry");
    s.at(120000);
    s.failNext("cardrounds");
    await assert.rejects(s.cards.getState("alice", table), /Injected/);
    assert.equal(raw(s, table, "alice").result, "");
    assert.equal(cycle(s, table), undefined);
    // A valid cycle with only winning slots remaining makes the credit-failure path deterministic.
    s.data.multiplayerrooms.push({ _id: `${table}:ten-player-wins:v1`, players: Array.from({ length: 90 }, (_, i) => `old-${i}`), remaining: Array(10).fill(true) });
    const revealed = await s.cards.getState("alice", table);
    assert.ok(revealed.myExpected > 100);
    assert.equal(cycle(s, table).remaining.length, 9);
    s.at(revealed.round.revealEndsAt);
    s.failNext("users");
    await assert.rejects(s.cards.getState("alice", table), /Injected/);
    assert.equal(s.users.get("alice").balance, 900);
    assert.equal(s.data.cardbets[0].status, "pending");
    assert.equal(s.data.gameresults[0].outcome, "pending");
    assert.equal(s.data.winholds.length, 0);
    await s.cards.getState("alice", table);
    assert.equal(s.users.get("alice").balance, 900 + revealed.myExpected);
    assert.equal(s.data.cardbets[0].payout, revealed.myExpected);
    await s.cards.getState("alice", table);
    assert.equal(s.changes.filter(change => change.delta > 0).length, 1);
    assert.equal(s.data.winholds.length, 1);
    assert.equal(cycle(s, table).remaining.length, 9);
  });

  test(`${table}: a repeated player cannot win again or consume another slot in an unfinished cycle`, async () => {
    const s = createLegacyScene(["alice"]);
    s.data.multiplayerrooms.push({ _id: `${table}:ten-player-wins:v1`, players: ["alice"], remaining: [...Array(9).fill(true), ...Array(90).fill(false)] });
    await s.cards.placeBet("alice", table, primary(table), 100, 1);
    s.at(120000);
    const state = await s.cards.getState("alice", table);
    assert.equal(state.myExpected, 0);
    assertCards(state.round.result);
    assert.equal(cycle(s, table).remaining.length, 99);
    s.at(state.round.revealEndsAt);
    await s.cards.getState("alice", table);
    assert.equal(s.users.get("alice").balance, 900);
    assert.equal(s.data.cardbets[0].payout, 0);
  });

  test(`${table}: each displayed option pays its allocated physical win and a repeat round loses without another slot`, async () => {
    const options = table === "dragon-tiger" ? ["dragon", "tie", "tiger"] : ["andar", "bahar"];
    for (const option of options) {
      const s = createLegacyScene(["alice"]);
      s.data.multiplayerrooms.push({ _id: `${table}:ten-player-wins:v1`, players: Array.from({ length: 90 }, (_, i) => `old-${i}`), remaining: Array(10).fill(true) });
      await s.cards.placeBet("alice", table, option, 100, 1);
      await s.cards.placeBet("alice", table, option, 50, 1);
      s.at(120000);
      const first = await s.cards.getState("alice", table);
      assertCards(first.round.result);
      assert.equal(first.round.result.winner, option);
      const gross = 150 * s.cards.TABLES[table].options[option].mult;
      assert.ok(gross <= 300);
      assert.equal(first.myExpected, Math.round((s.cards.personalPayout(option, option, 100) + s.cards.personalPayout(option, option, 50)) * 100) / 100);
      s.at(first.round.revealEndsAt);
      const second = await s.cards.getState("alice", table);
      assert.equal(s.users.get("alice").balance, 850 + first.myExpected);
      await s.cards.placeBet("alice", table, option, 100, second.round.roundNo);
      s.at(second.round.bettingEndsAt);
      const repeat = await s.cards.getState("alice", table);
      assertCards(repeat.round.result);
      assert.notEqual(repeat.round.result.winner, option);
      assert.equal(repeat.myExpected, 0);
      assert.equal(cycle(s, table).remaining.length, 9);
      s.at(repeat.round.revealEndsAt);
      await s.cards.getState("alice", table);
      assert.equal(s.users.get("alice").balance, 750 + first.myExpected);
    }
  });

  test(`${table}: new bets cannot queue during a deal and become available only in the following round`, async () => {
    const s = createLegacyScene(["alice", "bob"]);
    await s.cards.getState("alice", table);
    await s.cards.getState("bob", table);
    s.at(120000);
    assert.match((await s.cards.placeBet("alice", table, primary(table), 100, 2, "wait")).error, /Wait for the next round/);
    assert.match((await s.cards.placeBet("bob", table, primary(table), 50, 2)).error, /Wait for the next round/);
    assert.equal(cycle(s, table), undefined);
    const watching = await s.cards.getState("alice", table);
    assert.equal(watching.queued.total, 0);
    assert.equal((await s.cards.getState("alice", table)).myTotal, 0);
    assert.ok((await s.cards.cancelBets("alice", table, "queued", 3)).error);
    assert.ok((await s.cards.cancelBets("bob", table, "queued", 2)).error);
    assert.equal(s.users.get("bob").balance, 1000);
    assert.equal(s.users.get("alice").balance, 1000);
    s.at(watching.round.revealEndsAt - 1);
    assert.match((await s.cards.placeBet("alice", table, primary(table), 100, 2, "wait")).error, /closed/);
    s.at(watching.round.revealEndsAt);
    const next = await s.cards.getState("alice", table);
    assert.equal(next.round.roundNo, 2);
    assert.equal(next.myTotal, 0);
    assert.equal(next.round.result, null);
    assert.equal(cycle(s, table), undefined);
    assert.ok((await s.cards.placeBet("alice", table, primary(table), 100, 2, "wait")).ok);
    assert.equal(s.users.get("alice").balance, 900);
    s.at(next.round.bettingEndsAt);
    const draw = await s.cards.getState("alice", table);
    assertCards(draw.round.result);
    assert.equal(cycle(s, table).players.length, 1);
    s.at(draw.round.revealEndsAt);
    await s.cards.getState("alice", table);
    assert.equal(s.users.get("alice").balance, 900 + draw.myExpected);
    await s.cards.placeBet("alice", table, primary(table), 100, 2, "wait");
    assert.equal(s.users.get("alice").balance, 900 + draw.myExpected);
  });

  test(`${table}: betting boundary recheck rejects late or stale operations without allocation`, async () => {
    const s = createLegacyScene(["alice"]);
    await s.cards.getState("alice", table);
    s.at(119999);
    s.setReadDelay(2);
    const late = await s.cards.placeBet("alice", table, primary(table), 100, 1);
    assert.match(late.error, /closed/);
    assert.equal(s.users.get("alice").balance, 1000);
    assert.equal(cycle(s, table), undefined);
    s.setReadDelay(0);
    const stale = await s.cards.placeBet("alice", table, primary(table), 100, 1);
    assert.match(stale.error, /closed/);
    const closed = await s.cards.getState("alice", table);
    s.at(closed.round.revealEndsAt);
    assert.ok((await s.cards.placeBet("alice", table, primary(table), 100, 1)).roundChanged);
    assert.equal(cycle(s, table), undefined);
  });

  test(`${table}: all 100 accepted original common-outcome claims remain payable without personal allocation`, async () => {
    const users = Array.from({ length: 100 }, (_, i) => `legacy-${i}`);
    const s = createLegacyScene(users);
    const old = await seedOld(s, table, users, { winner: table === "dragon-tiger" ? "tie" : "bahar" });
    const result = JSON.parse(old.result);
    s.at(+old.bettingEndsAt);
    const state = await s.cards.getState(users[0], table);
    assert.equal(state.tableMode, "shared");
    assert.deepEqual(state.round.result, result);
    if (table === "dragon-tiger") assert.equal(state.config.options.tie.pays, "8:1");
    s.at(+old.revealEndsAt);
    await s.cards.getState(null, table);
    const expected = Math.round(s.cards.payoutFor(result, result.winner, 100) * 100) / 100;
    for (const user of users) assert.equal(s.users.get(user).balance, 900 + expected);
    assert.equal(s.data.cardbets.filter(bet => bet.status === "win").length, 100);
    assert.equal(cycle(s, table), undefined);
    await s.cards.getState(null, table);
    for (const user of users) assert.equal(s.users.get(user).balance, 900 + expected);
  });

  test(`${table}: legacy queue drains its own common contracts before transparent private migration`, async () => {
    const s = createLegacyScene(["alice", "bob"]);
    const old = await seedOld(s, table, ["alice"], { queued: true });
    const blocked = await s.cards.placeBet("alice", table, primary(table), 100, 1);
    assert.match(blocked.error, /Finish.*shared/);
    assert.equal(s.users.get("alice").balance, 800);
    assert.equal(cycle(s, table), undefined);
    const bob = await s.cards.getState("bob", table);
    assert.ok((await s.cards.placeBet("bob", table, primary(table), 100, bob.round.roundNo)).ok);
    s.at(+old.revealEndsAt);
    const second = await s.cards.getState("alice", table);
    assert.equal(second.round.roundNo, 2);
    assert.equal(second.myTotal, 100);
    const acceptedNext = s.data.cardrounds.find(row => row.table === table && row.roundNo === 2);
    const nextResult = JSON.parse(acceptedNext.result);
    s.at(+acceptedNext.bettingEndsAt);
    assert.deepEqual((await s.cards.getState("alice", table)).round.result, nextResult);
    s.at(+acceptedNext.revealEndsAt);
    const migrated = await s.cards.getState("alice", table);
    assert.ok(migrated.round.roundNo > second.round.roundNo);
    assert.equal(migrated.round.result, null);
    assert.equal(migrated.myTotal, 0);
    const original = JSON.parse(old.result);
    const payout = s.cards.payoutFor(original, original.winner, 100) + s.cards.payoutFor(nextResult, original.winner, 100);
    assert.equal(s.users.get("alice").balance, Math.round((800 + payout) * 100) / 100);
    assert.ok((await s.cards.placeBet("alice", table, primary(table), 100, migrated.round.roundNo)).ok);
    assert.equal(cycle(s, table), undefined);
  });

  test(`${table}: cancelling legacy current wagers does not move accepted queued stakes into the current window`, async () => {
    const s = createLegacyScene(["alice"]);
    const old = await seedOld(s, table, ["alice"], { queued: true });
    assert.equal((await s.cards.cancelBets("alice", table, "current", 1)).refunded, 100);
    const waiting = await s.cards.getState("alice", table);
    assert.equal(waiting.round.roundNo, 1);
    assert.equal(waiting.round.result, null);
    assert.equal(waiting.myTotal, 0);
    assert.equal(waiting.queued.roundNo, 2);
    assert.equal(waiting.queued.total, 100);
    s.at(+old.bettingEndsAt);
    const revealing = await s.cards.getState("alice", table);
    assert.equal(revealing.round.roundNo, 1);
    assert.equal(revealing.queued.total, 100);
    assert.equal((await s.cards.cancelBets("alice", table, "queued", 2)).refunded, 100);
    assert.equal(s.users.get("alice").balance, 1000);
    assert.equal(cycle(s, table), undefined);
  });

  for (const poolEnabled of [false, true]) {
    test(`${table}: old deferred pool obligations and cancellation remain intact (pool ${poolEnabled})`, async () => {
      const s = createLegacyScene(["alice", "bob"], { poolEnabled });
      const old = await seedOld(s, table, ["alice", "bob"], { pool: true });
      assert.equal((await s.cards.cancelBets("bob", table, "current", 1)).refunded, 100);
      assert.equal(s.users.get("bob").balance, 1000);
      assert.equal(s.data.dailypoolentries.find(entry => entry.userId === "bob").status, "cancelled");
      s.at(+old.revealEndsAt);
      await s.cards.getState(null, table);
      const entry = s.data.dailypoolentries.find(row => row.userId === "alice");
      assert.equal(entry.status, "closed");
      assert.equal(s.users.get("alice").balance, 900);
      assert.equal(s.data.cardbets.find(bet => bet.userId === "alice").poolPending, true);
      assert.equal(cycle(s, table), undefined);
      s.at(Date.parse("2026-10-25T19:00:00Z"));
      await s.cards.getState(null, table);
      assert.equal(s.data.dailypoolentries.find(row => row.userId === "alice").status, "settled");
      const balance = s.users.get("alice").balance;
      await s.cards.getState(null, table);
      assert.equal(s.users.get("alice").balance, balance);
    });
  }

  test(`${table}: a failed legacy credit preserves all original claims for retry`, async () => {
    const s = createLegacyScene(["alice", "bob"]);
    const old = await seedOld(s, table, ["alice", "bob"]);
    s.at(+old.revealEndsAt);
    s.failNext("users");
    await assert.rejects(s.cards.getState(null, table), /Injected/);
    assert.ok(s.data.cardbets.every(bet => bet.status === "pending"));
    assert.ok(s.data.gameresults.every(record => record.outcome === "pending"));
    assert.equal(s.users.get("alice").balance, 900);
    await s.cards.getState(null, table);
    assert.ok(s.data.cardbets.every(bet => bet.status === "win"));
    assert.equal(cycle(s, table), undefined);
  });

  test(`${table}: a missing accepted common outcome is not silently rerolled`, async () => {
    const s = createLegacyScene(["alice"]);
    const old = await seedOld(s, table, ["alice"]);
    s.data.cardrounds.splice(0);
    s.at(+old.revealEndsAt);
    await assert.rejects(s.cards.getState("alice", table), /outcome is missing/);
    assert.equal(s.users.get("alice").balance, 900);
    assert.equal(s.data.cardbets[0].status, "pending");
    assert.equal(s.data.gameresults[0].outcome, "pending");
    assert.equal(s.data.cardrounds.length, 0);
    assert.equal(cycle(s, table), undefined);
  });
}

test("Dragon Tiger: mixed feasible stakes respect the combined gross cap; complete coverage is rejected", async () => {
  const table = "dragon-tiger", s = createLegacyScene(["alice"]);
  await s.cards.placeBet("alice", table, "dragon", 100, 1);
  assert.ok((await s.cards.placeBet("alice", table, "tie", 10, 1)).ok);
  const denied = await s.cards.placeBet("alice", table, "tiger", 10, 1);
  assert.match(denied.error, /zero-return/);
  assert.equal(s.users.get("alice").balance, 890);
  assert.equal(cycle(s, table), undefined);
  s.data.multiplayerrooms.push({ _id: `${table}:ten-player-wins:v1`, players: Array.from({ length: 90 }, (_, i) => `old-${i}`), remaining: Array(10).fill(true) });
  s.at(120000);
  const state = await s.cards.getState("alice", table);
  assertCards(state.round.result);
  assert.equal(state.round.result.winner, "dragon");
  assert.equal(state.myExpected, 196);
  s.at(state.round.revealEndsAt);
  await s.cards.getState("alice", table);
  assert.equal(s.users.get("alice").balance, 1086);
  assert.ok(s.data.cardbets.reduce((sum, bet) => sum + bet.payout, 0) <= 220);
});

test("Dragon Tiger: personal ties pay 2x gross with no losing-side refund; accepted legacy ties still pay 9x", async () => {
  const s = createLegacyScene(["alice"]);
  assert.equal(s.cards.TABLES["dragon-tiger"].options.tie.mult, 2);
  assert.equal(s.cards.personalGross("tie", "tie", 100), 200);
  assert.equal(s.cards.personalGross("tie", "dragon", 100), 0);
  const deal = s.cards.generateForWinner("dragon-tiger", "tie");
  assertCards(deal.result);
  assert.equal(s.cards.rawPayoutFor(deal.result, "tie", 100), 900);
  assert.equal(s.cards.rawPayoutFor(deal.result, "dragon", 100), 50);
});

test("Dragon Tiger: original accepted covering bets keep the 9x tie and both half refunds even above the new cap", async () => {
  const table = "dragon-tiger", s = createLegacyScene(["alice"]);
  const old = await seedOld(s, table, ["alice"], { winner: "tie" });
  const original = s.data.cardbets[0];
  for (const option of ["dragon", "tiger"]) s.data.cardbets.push({ ...original, _id: randomUUID(), option });
  s.data.gameresults[0].betAmount = 300;
  s.users.get("alice").balance = 700;
  s.at(+old.bettingEndsAt);
  assert.equal((await s.cards.getState("alice", table)).myExpected, 980);
  s.at(+old.revealEndsAt);
  await s.cards.getState(null, table);
  assert.equal(s.users.get("alice").balance, 1680);
  assert.equal(s.data.gameresults[0].winAmount, 980);
  assert.deepEqual(s.data.cardbets.map(bet => bet.payout).sort((a, b) => a - b), [49, 49, 882]);
  assert.equal(cycle(s, table), undefined);
  await s.cards.getState(null, table);
  assert.equal(s.users.get("alice").balance, 1680);
});

for (const [table, option] of [["dragon-tiger", "tie"], ["andar-bahar", "andar"], ["andar-bahar", "bahar"]]) {
  test(`${table}/${option}: actual 1-crore winning stake returns no more than 2x gross and credits once`, async () => {
    const s = createLegacyScene(["alice"]);
    const stake = 10000000;
    s.users.get("alice").balance = stake;
    s.data.multiplayerrooms.push({ _id: `${table}:ten-player-wins:v1`, players: Array.from({ length: 90 }, (_, i) => `old-${i}`), remaining: Array(10).fill(true) });
    assert.ok((await s.cards.placeBet("alice", table, option, stake, 1, "crore")).ok);
    assert.equal(s.users.get("alice").balance, 0);
    s.at(120000);
    const state = await s.cards.getState("alice", table);
    assertCards(state.round.result);
    assert.equal(state.round.result.winner, option);
    const gross = s.cards.personalGross(option, option, stake);
    assert.ok(gross > stake && gross <= 2 * stake);
    assert.equal(state.myExpected, s.cards.personalPayout(option, option, stake));
    assert.ok(state.myExpected > stake && state.myExpected <= 2 * stake);
    s.at(state.round.revealEndsAt);
    await s.cards.getState("alice", table);
    assert.equal(s.users.get("alice").balance, state.myExpected);
    assert.equal(s.data.gameresults[0].winAmount, state.myExpected);
    assert.equal(s.data.cardbets[0].payout, state.myExpected);
    await s.cards.getState("alice", table);
    await s.cards.placeBet("alice", table, option, stake, 1, "crore");
    assert.equal(s.users.get("alice").balance, state.myExpected);
    assert.equal(s.changes.filter(change => change.delta > 0).length, 1);
    assert.equal(s.data.winholds[0].amount, Math.round(gross * 2) / 100);
  });
}

function cardCleanup() {
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync("src\\lib\\sharedLegacyCardCleanup.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function("module", "exports", code)(loaded, loaded.exports);
  return loaded.exports.cleanupPersonalLegacyCardRooms;
}

test("personal DT/AB reset removes only selected owners' rooms; old common obligations, guests, other games and cycles remain", async () => {
  const s = createLegacyScene(["alice", "bob"]);
  for (const table of tables) {
    for (const user of ["alice", "bob"]) await s.cards.placeBet(user, table, primary(table), 100, 1);
    await s.cards.getState(null, table);
    await seedOld(s, table, ["bob"]);
    s.data.multiplayerrooms.push({ _id: `${table}:ten-player-wins:v1`, players: ["alice"], remaining: [...Array(9).fill(true), ...Array(90).fill(false)] });
  }
  const originalBob = s.data.cardrounds.filter(row => !row.table.includes("player:alice"));
  s.data.multiplayerrooms.push({ _id: "baccarat:personal:alice", ownerId: "alice", game: "baccarat", bets: [], queuedBets: [] });
  const cleanup = cardCleanup();
  const calls = [];
  const connection = { async execute(sql, values) {
    calls.push(sql);
    const table = sql.startsWith("DELETE FROM cardrounds") ? "cardrounds" : "multiplayerrooms";
    const match = row => table === "cardrounds" ? values.includes(row.table) : values.includes(row._id) && tables.includes(row.game) && !Object.hasOwn(row, "bets");
    const affectedRows = s.data[table].filter(match).length;
    for (let i = s.data[table].length - 1; i >= 0; i--) if (match(s.data[table][i])) s.data[table].splice(i, 1);
    return [{ affectedRows }];
  } };
  assert.equal(await cleanup(connection, []), 0);
  assert.equal(calls.length, 0);
  assert.equal(await cleanup(connection, ["alice"]), 4);
  assert.equal(s.data.cardrounds.some(row => row.table.includes("player:alice")), false);
  assert.deepEqual(s.data.cardrounds, originalBob);
  for (const table of tables) assert.ok(cycle(s, table).players.includes("alice"));
  assert.ok(s.data.multiplayerrooms.some(row => row._id === "baccarat:personal:alice"));
  // The endpoint deletes wagers/results and clears the wallet in this same locked transaction.
  await s.store.transact("reset", async tx => {
    for (const collection of ["cardbets", "gameresults"]) {
      for (const row of await tx.findWhere(collection, { userId: "alice" }, 1000)) await tx.remove(collection, row._id);
    }
    const user = await tx.get("users", "alice");
    user.balance = 0;
    await tx.put("users", "alice", user);
  });
  s.at(1000000);
  for (const table of tables) {
    const reset = await s.cards.getState("alice", table);
    assert.equal(reset.tableMode, "personal");
    assert.equal(reset.myTotal, 0);
    assert.equal(reset.round.result, null);
    assert.deepEqual(reset.history, []);
  }
  assert.equal(s.users.get("alice").balance, 0);
  assert.equal(s.data.cardbets.some(row => row.userId === "alice"), false);
  assert.equal(s.data.gameresults.some(row => row.userId === "alice"), false);
  const source = readFileSync("src\\lib\\playerDataReset.ts", "utf8");
  assert.match(source, /cleanupPersonalLegacyCardRooms\(connection, ids\)/);
  assert.ok(source.indexOf("lockMultiplayerCleanupRooms(connection)") < source.indexOf("cleanupPersonalLegacyCardRooms(connection, ids)"));
  assert.ok(source.indexOf("cleanupPersonalLegacyCardRooms(connection, ids)") < source.indexOf("connection.commit()"));
});

test("card activity uses server tableMode to label personal bets without implying shared players", () => {
  const source = readFileSync("src\\components\\CardTable.tsx", "utf8");
  assert.match(source, /tableMode: "personal" \| "shared"/);
  assert.match(source, /<LiveBetActivity\s+personal=\{st\.tableMode === "personal"\}/);
});
