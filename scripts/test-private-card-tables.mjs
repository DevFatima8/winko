import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import test from "node:test";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

const players = Array.from({ length: 100 }, (_, i) => `private-card-${i}`);
const roomId = (game, player) => createHash("sha256").update(`private-card:${game}:${player}`).digest("hex");
const make = (game, users = players) => {
  const scene = createLegacyScene(users, { poolEnabled: true });
  scene.data.games.push({ _id: game, slug: game, isActive: true });
  return scene;
};
const bet = (roundNo, option, amount = 100) => ({ action: "bet", requestId: randomUUID(), roundNo, option, amount });
const total = cards => cards.reduce((sum, card) => sum + card.value, 0) % 10;

for (const [game, option] of [["baccarat", "player"], ["32-cards", "A"], ["football-studio", "HOME"], ["dream-catcher", "1"]]) {
  test(`${game}: 100 rounds by one player produce 30 paid winners; extra chips and replays do not draw again`, async () => {
    const s = make(game, ["alice"]);
    s.users.get("alice").balance = 100000;
    let wins = 0;
    for (let round = 0; round < 100; round++) {
      const start = await s.multiplayer.read(game, "alice");
      assert.equal(start.tableMode, "personal");
      const request = bet(start.round.roundNo, option, 10);
      await s.multiplayer.act(game, "alice", request);
      await s.multiplayer.act(game, "alice", request);
      await s.multiplayer.act(game, "alice", bet(start.round.roundNo, option, 10));
      s.at(start.round.resultAt);
      const done = await s.multiplayer.read(game, "alice");
      const payout = done.myBets.reduce((sum, row) => sum + row.payout, 0);
      assert.ok(payout === 0 || payout > 20);
      if (game === "dream-catcher" && payout > 0) {
        const gross = 20 * (Number(option) + 1) * done.round.result.totalMultiplier;
        assert.equal(payout, Math.floor(gross * 0.98 * 100 + 1e-8) / 100);
      }
      wins += Number(payout > 20);
      const balance = s.users.get("alice").balance;
      await s.multiplayer.read(game, "alice");
      assert.equal(s.users.get("alice").balance, balance);
      s.at(done.round.endsAt);
    }
    assert.equal(wins, 30);
    assert.equal(s.data.dailypoolentries.length, 0);
  });
}

for (const [game, option] of [["baccarat", "tie"], ["speed-baccarat", "playerPair"], ["32-cards", "A"]]) {
  test(`${game}: a request crossing the betting deadline never reserves the following round`, async () => {
    const s = make(game, ["alice"]);
    const start = await s.multiplayer.read(game, "alice");
    s.at(start.round.bettingEndsAt - 1);
    s.setReadDelay(2);
    await assert.rejects(s.multiplayer.act(game, "alice", bet(start.round.roundNo, option)), /Betting is closed|Betting closed/);
    assert.equal(s.users.get("alice").balance, 1000);
    assert.equal(s.data.gameresults.length, 0);
    assert.ok(!s.data.multiplayerrooms.some(room => room._id.includes("thirty-player-wins") || room._id.includes("parity-cycle")));
    s.setReadDelay(0);
    s.at(start.round.endsAt);
    const next = await s.multiplayer.read(game, "alice");
    assert.equal(next.round.phase, "betting");
    assert.deepEqual(next.myQueuedBets, []);
    await s.multiplayer.act(game, "alice", bet(next.round.roundNo, option));
    assert.equal(s.users.get("alice").balance, 900);
  });

  test(`${game}: unwagered personal and guest rounds deal and restart without wallet or cycle changes`, async () => {
    const s = make(game, ["alice"]);
    for (const user of ["alice", null]) {
      let state = await s.multiplayer.read(game, user);
      for (let index = 0; index < 3; index++) {
        s.at(state.round.resultAt);
        const dealt = await s.multiplayer.read(game, user);
        assert.ok(dealt.round.result);
        assert.deepEqual(dealt.myBets, []);
        assert.deepEqual(dealt.myQueuedBets, []);
        assert.deepEqual(dealt.bets, []);
        s.at(dealt.round.endsAt);
        const next = await s.multiplayer.read(game, user);
        assert.equal(next.round.roundNo, state.round.roundNo + 1);
        assert.equal(next.round.phase, "betting");
        assert.equal(next.round.result, null);
        state = next;
      }
    }
    assert.equal(s.users.get("alice").balance, 1000);
    assert.equal(s.data.gameresults.length, 0);
    assert.equal(s.data.winholds.length, 0);
    assert.ok(!s.data.multiplayerrooms.some(room => room._id.includes("thirty-player-wins") || room._id.includes("parity-cycle")));
  });

  test(`${game}: 100 personal players have thirty paid wins, genuine cards, gross at most 2x and immutable wallets`, async () => {
    const s = make(game);
    const replies = [];
    for (const userId of players) {
      s.at(100000);
      const start = await s.multiplayer.read(game, userId);
      assert.equal(start.tableMode, "personal");
      assert.equal(start.round.result, null);
      const action = bet(start.round.roundNo, option);
      await s.multiplayer.act(game, userId, action);
      await s.multiplayer.act(game, userId, action);
      assert.equal(s.users.get(userId).balance, 900);
      s.at(start.round.resultAt);
      const done = await s.multiplayer.read(game, userId);
      assert.equal(done.myBets.length, 1);
      assert.equal(done.bets.length, 1);
      assert.equal(done.bets[0].mine, true);
      const payout = done.myBets[0].payout;
      assert.ok(payout === 0 || payout > 100 && payout <= 200);
      assert.equal(s.users.get(userId).balance, 900 + payout);
      const r = done.round.result;
      if (game === "baccarat") {
        assert.equal(r.playerTotal, total(r.playerCards));
        assert.equal(r.bankerTotal, total(r.bankerCards));
        assert.equal(payout > 0, r.playerTotal === r.bankerTotal);
      } else if (game === "speed-baccarat") {
        assert.equal(r.pTotal, total(r.player));
        assert.equal(r.bTotal, total(r.banker));
        assert.equal(payout > 0, r.player[0].rank === r.player[1].rank);
      } else {
        r.draws.forEach((draw, index) => assert.equal(r.totals[index], 8 + index + draw.reduce((sum, card) => sum + card.value, 0)));
        assert.equal(payout > 0, r.winner === 0);
        const cards = r.draws.flat();
        assert.equal(new Set(cards.map(card => `${card.rank}:${card.suit}`)).size, cards.length);
      }
      const balance = s.users.get(userId).balance;
      await s.multiplayer.read(game, userId);
      await s.multiplayer.act(game, userId, action);
      assert.equal(s.users.get(userId).balance, balance);
      replies.push(done);
    }
    const wins = replies.filter(reply => reply.myBets[0].payout > 100);
    assert.equal(wins.length, 30);
    if (game === "32-cards") {
      assert.equal(wins.filter(({ round: { result: r } }) => r.totals[r.winner] % 2 === 0).length, 24);
      assert.equal(wins.filter(({ round: { result: r } }) => r.totals[r.winner] % 2 === 1).length, 6);
    }
    assert.equal(s.data.dailypoolentries.length, 0);
    assert.equal(s.data.gameresults.length, 100);
  });
}

test("private tables isolate users and spectators; covered bets and failed writes cannot debit or consume extra slots", async () => {
  const s = make("baccarat", ["alice", "bob"]);
  const start = await s.multiplayer.read("baccarat", "alice");
  const request = bet(start.round.roundNo, "player");
  s.failNext("users");
  const before = structuredClone(s.data);
  await assert.rejects(s.multiplayer.act("baccarat", "alice", request), /Injected/);
  assert.deepEqual(s.data, before);
  await s.multiplayer.act("baccarat", "alice", request);
  const accepted = structuredClone(s.data);
  await assert.rejects(s.multiplayer.act("baccarat", "alice", bet(start.round.roundNo, "banker")), /one betting spot/);
  assert.deepEqual(s.data, accepted);
  const bob = await s.multiplayer.read("baccarat", "bob");
  const guest = await s.multiplayer.read("baccarat");
  assert.equal(bob.bets.length, 0);
  assert.equal(guest.bets.length, 0);
  assert.equal(guest.tableMode, "shared");
  s.at(start.round.bettingEndsAt);
  const running = await s.multiplayer.read("baccarat", "alice");
  assert.ok(running.round.result);
  assert.equal((await s.multiplayer.read("baccarat", "bob")).myBets.length, 0);
  assert.equal(s.data.multiplayerrooms.find(room => room._id === roomId("baccarat", "bob")).cardPrize, undefined);
  s.failNext("gameresults");
  s.at(start.round.resultAt);
  const pending = structuredClone(s.data);
  await assert.rejects(s.multiplayer.read("baccarat", "alice"), /Injected/);
  assert.deepEqual(s.data, pending);
  await s.multiplayer.read("baccarat", "alice");
  assert.equal(s.data.gameresults.length, 1);
});

test("32 Cards parity admission refuses incompatible final slots before debit", async () => {
  const s = make("32-cards", ["alice"]);
  s.data.multiplayerrooms.push({
    _id: "32-cards:private-parity-rounds-30:v3",
    players: Array.from({ length: 98 }, (_, i) => `old-${i}`), remaining: ["odd", "odd"],
  });
  const start = await s.multiplayer.read("32-cards", "alice");
  const before = structuredClone(s.data);
  await assert.rejects(s.multiplayer.act("32-cards", "alice", bet(start.round.roundNo, "EVEN")), /other parity/);
  assert.deepEqual(s.data, before);
  await s.multiplayer.act("32-cards", "alice", bet(start.round.roundNo, "ODD"));
  s.at(start.round.resultAt);
  const done = await s.multiplayer.read("32-cards", "alice");
  assert.equal(done.round.result.totals[done.round.result.winner] % 2, 1);
  assert.equal(done.myBets[0].payout, 191.1);
});

test("32 Cards EVEN/ODD buttons pay 24 even winners and six odd winners across a completed admitted-player cycle", async () => {
  const s = make("32-cards");
  let evenWins = 0, oddWins = 0, rejected = 0;
  for (const userId of players) {
    s.at(100000);
    const start = await s.multiplayer.read("32-cards", userId);
    let option = "EVEN";
    try { await s.multiplayer.act("32-cards", userId, bet(start.round.roundNo, option)); }
    catch (error) {
      assert.match(error.message, /other parity/);
      assert.equal(s.users.get(userId).balance, 1000, "refused parity never debits the wallet");
      rejected++;
      option = "ODD";
      await s.multiplayer.act("32-cards", userId, bet(start.round.roundNo, option));
    }
    s.at(start.round.resultAt);
    const done = await s.multiplayer.read("32-cards", userId);
    const paid = done.myBets[0].payout;
    const parity = done.round.result.totals[done.round.result.winner] % 2;
    assert.equal(paid > 0, parity === (option === "EVEN" ? 0 : 1));
    assert.equal(s.users.get(userId).balance, 900 + paid);
    if (paid > 100) {
      if (parity === 0) evenWins++; else oddWins++;
    }
  }
  assert.equal(evenWins, 24);
  assert.equal(oddWins, 6);
  assert.equal(rejected, 6);
});

test("private card bets wait for the next betting window without reserving or drawing early", async () => {
  const s = make("baccarat", ["alice"]);
  const start = await s.multiplayer.read("baccarat", "alice");
  await s.multiplayer.act("baccarat", "alice", bet(start.round.roundNo, "player"));
  s.at(start.round.bettingEndsAt + 1);
  const request = bet(start.round.roundNo + 1, "tie");
  const balanceBefore = s.users.get("alice").balance;
  const reserved = structuredClone(s.data.multiplayerrooms.find(room => room._id === "baccarat:bet-wins-30-of-100:v1"));
  await assert.rejects(s.multiplayer.act("baccarat", "alice", request), /Wait for the next round/);
  assert.equal(s.users.get("alice").balance, balanceBefore);
  assert.deepEqual(s.data.multiplayerrooms.find(room => room._id === reserved._id), reserved);
  s.at(start.round.endsAt);
  const next = await s.multiplayer.read("baccarat", "alice");
  assert.equal(next.myBets.length, 0);
  assert.equal(next.myQueuedBets.length, 0);
  assert.deepEqual(s.data.multiplayerrooms.find(room => room._id === reserved._id), reserved);
  await s.multiplayer.act("baccarat", "alice", request);
  s.at(next.round.resultAt);
  const done = await s.multiplayer.read("baccarat", "alice");
  assert.equal(s.data.multiplayerrooms.find(room => room._id === reserved._id).remaining.length, reserved.remaining.length - 1);
  assert.equal(done.myBets[0].payout > 0, s.data.multiplayerrooms.find(room => room._id === roomId("baccarat", "alice")).cardPrize === "win");
});

test("an already accepted shared wager keeps its original visible result and high paytable before migration", async () => {
  const s = make("32-cards", ["alice", "bob"]);
  s.data.multiplayerrooms.push({
    _id: "32-cards", gameId: "32-cards", game: "32-cards", roundNo: 7, startedAt: 100000,
    outcome: { draws: [[], [], [], []], totals: [24, 21, 20, 19], winner: 0 }, settled: false,
    bets: [{ id: "original-wager", userId: "alice", name: "A***e", option: "A", amount: 100, roundNo: 7, status: "pending", payout: 0 }],
    queuedBets: [], history: [],
  });
  s.users.get("alice").balance = 900;
  const old = await s.multiplayer.read("32-cards", "alice");
  assert.equal(old.tableMode, "shared");
  assert.equal((await s.multiplayer.read("32-cards", "bob")).tableMode, "personal");
  s.at(old.round.resultAt);
  const done = await s.multiplayer.read("32-cards", "alice");
  assert.equal(done.myBets[0].payout, 1195.6);
  assert.equal(done.round.result.winner, 0);
  s.at(old.round.endsAt);
  await s.multiplayer.read("32-cards", "alice");
  assert.equal((await s.multiplayer.read("32-cards", "alice")).tableMode, "personal");
  assert.equal(s.data.gameresults.length, 1);
});

test("Rs. 1 crore new wagers never return Rs. 14 crore: the ledger and holds together stay within 2x", async () => {
  for (const [game, option] of [["baccarat", "tie"], ["speed-baccarat", "playerPair"], ["32-cards", "A"]]) {
    const s = make(game, ["alice"]);
    s.users.get("alice").balance = 20000000;
    s.data.multiplayerrooms.push(game === "32-cards"
      ? { _id: "32-cards:private-parity-rounds-30:v3", players: Array.from({ length: 99 }, (_, i) => `old-${i}`), remaining: ["even"] }
      : { _id: `${game}:bet-wins-30-of-100:v1`, players: Array.from({ length: 99 }, (_, i) => `old-${i}`), remaining: [true] });
    const start = await s.multiplayer.read(game, "alice");
    const input = bet(start.round.roundNo, option, 10000000);
    await s.multiplayer.act(game, "alice", input);
    assert.equal(s.users.get("alice").balance, 10000000);
    s.at(start.round.resultAt);
    const done = await s.multiplayer.read(game, "alice");
    assert.equal(done.myBets[0].payout, 19600000);
    assert.equal(s.users.get("alice").balance, 29600000);
    const held = s.data.winholds.reduce((sum, hold) => sum + hold.amount, 0);
    assert.equal(held, 400000);
    assert.equal(done.myBets[0].payout + held, 20000000);
    await s.multiplayer.act(game, "alice", input);
    await s.multiplayer.read(game, "alice");
    assert.equal(s.users.get("alice").balance, 29600000);
    assert.equal(s.data.gameresults.length, 1);
    assert.equal(s.data.winholds.length, 1);
  }
});

test("cancellation refunds once without rerolling a reserved slot or switching spots", async () => {
  const s = make("32-cards", ["alice"]);
  const start = await s.multiplayer.read("32-cards", "alice");
  await s.multiplayer.act("32-cards", "alice", bet(start.round.roundNo, "EVEN"));
  const room = s.data.multiplayerrooms.find(row => row._id === roomId("32-cards", "alice"));
  const prize = room.cardPrize;
  const cancel = { action: "cancel", roundNo: start.round.roundNo, requestId: randomUUID() };
  await s.multiplayer.act("32-cards", "alice", cancel);
  await s.multiplayer.act("32-cards", "alice", cancel);
  assert.equal(s.users.get("alice").balance, 1000);
  await assert.rejects(s.multiplayer.act("32-cards", "alice", bet(start.round.roundNo, "ODD")), /chosen spot stays fixed/);
  await s.multiplayer.act("32-cards", "alice", bet(start.round.roundNo, "EVEN"));
  assert.equal(s.data.multiplayerrooms.find(row => row._id === roomId("32-cards", "alice")).cardPrize, prize);
  assert.equal(s.users.get("alice").balance, 900);
});
