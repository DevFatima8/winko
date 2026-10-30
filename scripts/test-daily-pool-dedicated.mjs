import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import ts from "typescript";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

const today = Date.parse("2026-10-24T18:59:00Z");
const tomorrow = Date.parse("2026-10-24T19:00:00Z");
const version = "daily-pool-v1";
function scene() {
  const s = createLegacyScene(["alice", "bob"], { poolEnabled: true });
  for (const table of ["games", "minesgames", "plinkobets"]) s.data[table] ??= [];
  s.at(today);
  const locks = [];
  const store = { transact(lock, fn) { locks.push(lock); return s.store.transact(lock, fn); } };
  const loaded = { exports: {} };
  const require = name => {
    if (name === "node:crypto") return { createHash, randomUUID };
    if (name === "./multiplayer-store") return { mysqlMultiplayerStore: store };
    if (name === "./dailyPool") return s.pool;
    if (name === "./dailyPoolRules") return { DAILY_POOL_VERSION: version, dailyPoolLock: slug => `daily-pool:${slug}` };
    throw new Error(`Unexpected dedicated import: ${name}`);
  };
  const code = ts.transpileModule(readFileSync("src\\lib\\dailyPoolDedicated.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function("require", "module", "exports", code)(require, loaded, loaded.exports);
  return Object.assign(s, { dedicated: loaded.exports, locks });
}
const instant = (claim = 200) => ({ claim, data: "test result", response: { won: claim > 0 } });
const publish = g => structuredClone(g);
const multiplier = (_mines, safe) => 1 + safe;
const settle = (s, slug) => s.dedicated.dedicatedTransaction(slug, async () => {});

test("dedicated instant games debit once, lock claims, and allocate exactly 35% without winholds", async () => {
  for (const slug of ["plinko", "limbo", "lucky-777"]) {
    const s = scene();
    const a = await s.dedicated.acceptDedicatedInstant(slug, "alice", 100, "request-alice-0001", "[100]", instant(200));
    const b = await s.dedicated.acceptDedicatedInstant(slug, "bob", 300, "request-bob-00001", "[300]", instant(600));
    assert.equal(a.payout, 0);
    assert.equal(a.poolPending, true);
    assert.equal(a.poolClaim, 200);
    assert.equal(b.balance, 700);
    assert.equal(s.users.get("alice").balance, 900);
    assert.ok(s.data.gameresults.every(r => r.outcome === "pending" && r.winAmount === 0));
    assert.equal(s.data.winholds.length, 0);
    assert.ok(s.locks.every(lock => lock === `daily-pool:${slug}`));
    s.at(tomorrow);
    await settle(s, slug);
    const total = s.data.dailypoolentries.reduce((sum, r) => sum + r.payoutCents, 0);
    if (slug === "limbo") assert.ok(total > 0 && total <= 14000, "limbo pays 10-of-100 winners 1x-2x within the 35% pool");
    else assert.equal(total, 14000);
    if (slug !== "limbo") assert.equal(Math.round((s.users.get("alice").balance + s.users.get("bob").balance) * 100), 174000);
    assert.ok(s.users.get("alice").balance >= 900);
    assert.ok(s.users.get("bob").balance >= 700);
  }
});

test("concurrent instant replays reuse the durable result, reject changed bets, and return settled status", async () => {
  const s = scene();
  const play = () => s.dedicated.acceptDedicatedInstant("limbo", "alice", 100, "same-request-0001", "[100,2]", instant());
  const [a, b] = await Promise.all([play(), play()]);
  assert.equal(a.id, b.id);
  assert.equal(s.data.gameresults.length, 1);
  assert.equal(s.data.dailypoolentries.length, 1);
  assert.equal(s.users.get("alice").balance, 900);
  const rejected = await s.dedicated.acceptDedicatedInstant("limbo", "alice", 200, "same-request-0001", "[200,2]", instant());
  assert.match(rejected.error, /different wager/);
  assert.equal(s.users.get("alice").balance, 900);
  s.at(tomorrow);
  const replay = await play();
  assert.equal(replay.poolPending, false);
  assert.equal(replay.payout, 35);
  assert.equal(replay.balance, 935);
});

test("no successful instant result falls back to all accepted stakes", async () => {
  const s = scene();
  await s.dedicated.acceptDedicatedInstant("lucky-777", "alice", 100, "request-alice-0001", "[100]", instant(0));
  await s.dedicated.acceptDedicatedInstant("lucky-777", "bob", 300, "request-bob-00001", "[300]", instant(0));
  s.at(tomorrow);
  await settle(s, "lucky-777");
  assert.equal(s.users.get("alice").balance, 935);
  assert.equal(s.users.get("bob").balance, 805);
});

test("a mismatched source record aborts the entire payout transaction before any credit persists", async () => {
  const s = scene();
  const outcome = { ...instant(200), plinko: { risk: "low", rows: 8, path: Array(8).fill(0), bucket: 0, multiplier: 2 } };
  await s.dedicated.acceptDedicatedInstant("plinko", "alice", 100, "source-check-0001", "[100,low,8]", outcome);
  s.data.plinkobets[0].userId = "bob";
  s.at(tomorrow);
  await assert.rejects(settle(s, "plinko"), /does not reconcile/);
  assert.equal(s.users.get("alice").balance, 900);
  assert.equal(s.users.get("bob").balance, 1000);
  assert.equal(s.data.dailypoolentries[0].status, "closed");
  assert.equal(s.data.gameresults[0].poolPending, true);
  s.data.plinkobets[0].userId = "alice";
  await settle(s, "plinko");
  assert.equal(s.users.get("alice").balance, 935);
});

test("Plinko source and accepted result are durable together and settlement updates payout", async () => {
  const s = scene();
  const outcome = { ...instant(20), plinko: { risk: "low", rows: 8, path: Array(8).fill(0), bucket: 0, multiplier: .2 } };
  const response = await s.dedicated.acceptDedicatedInstant("plinko", "alice", 100, "plinko-request-01", "[100,low,8]", outcome);
  const source = s.data.plinkobets[0];
  assert.equal(response.id, source._id);
  assert.equal(source.poolClaim, 20);
  assert.equal(source.payout, 0);
  assert.equal(source.resultId, s.data.gameresults[0]._id);
  s.at(tomorrow);
  await settle(s, "plinko");
  assert.equal(s.data.plinkobets[0].payout, 20, "Plinko pays the server-decided 0.2x claim itself");
  assert.equal(s.data.plinkobets[0].poolPending, false);
});

test("failed instant creation rolls wallet, result, source, pool and idempotency key back", async () => {
  for (const table of ["users", "games", "gameresults", "plinkobets", "dailypools", "dailypoolentries", "multiplayerrequests"]) {
    const s = scene();
    const outcome = { ...instant(), plinko: { risk: "low", rows: 8, path: Array(8).fill(0), bucket: 0, multiplier: 2 } };
    const play = () => s.dedicated.acceptDedicatedInstant("plinko", "alice", 100, "rollback-request-1", "[100]", outcome);
    const before = structuredClone(s.data);
    s.failNext(table);
    await assert.rejects(play(), /Injected/);
    assert.deepEqual(s.data, before, table);
    await play();
    assert.equal(s.users.get("alice").balance, 900);
    assert.equal(s.data.gameresults.length, 1);
  }
});

test("Mines accepts one active durable layout, waits after midnight, and cashout never instantly credits", async () => {
  const s = scene();
  const started = await s.dedicated.acceptPoolMines("alice", 100, 3, [0, 1, 2], publish);
  assert.deepEqual(started.game.mineCells, [0, 1, 2]);
  const duplicate = await s.dedicated.acceptPoolMines("alice", 100, 3, [3, 4, 5], publish);
  assert.match(duplicate.error, /chal rahi/);
  await s.dedicated.actPoolMines("alice", "reveal", 3, multiplier, publish);
  s.at(tomorrow);
  await settle(s, "mines");
  assert.equal(s.users.get("alice").balance, 900);
  const cashed = await s.dedicated.actPoolMines("alice", "cashout", 0, multiplier, publish);
  assert.equal(cashed.win, 0);
  assert.equal(cashed.poolClaim, 200);
  assert.equal(cashed.game.status, "cashed");
  assert.equal(s.users.get("alice").balance, 900);
  await settle(s, "mines");
  assert.equal(s.users.get("alice").balance, 935);
  assert.equal(s.data.minesgames[0].winAmount, 35);
  assert.equal(s.data.minesgames[0].poolPending, false);
  const replay = await s.dedicated.actPoolMines("alice", "cashout", 0, multiplier, publish);
  assert.equal(replay, null);
  assert.equal(s.users.get("alice").balance, 935);
});

test("Mines terminal mine and automatic clear create pending zero-credit results, validate cells", async () => {
  for (const hitMine of [true, false]) {
    const s = scene();
    await s.dedicated.acceptPoolMines("alice", 100, 24, Array.from({ length: 24 }, (_, i) => i), publish);
    const invalid = await s.dedicated.actPoolMines("alice", "reveal", NaN, multiplier, publish);
    assert.match(invalid.error, /Invalid/);
    const premature = await s.dedicated.actPoolMines("alice", "cashout", 0, multiplier, publish);
    assert.ok(premature.error);
    const terminal = await s.dedicated.actPoolMines("alice", "reveal", hitMine ? 0 : 24, multiplier, publish);
    assert.equal(terminal.event, hitMine ? "mine" : "cleared");
    assert.equal(terminal.poolPending, true);
    assert.equal(terminal.poolClaim, hitMine ? 0 : 200);
    assert.equal(s.data.dailypools[0].outstanding, 0);
    assert.equal(s.data.gameresults[0].outcome, "pending");
    assert.equal(s.users.get("alice").balance, 900);
    s.at(tomorrow);
    await settle(s, "mines");
    assert.equal(s.users.get("alice").balance, 935);
  }
});

test("Mines acceptance/action failures roll back and old active rounds remain exclusively legacy", async () => {
  const s = scene();
  const before = structuredClone(s.data);
  s.failNext("minesgames");
  await assert.rejects(s.dedicated.acceptPoolMines("alice", 100, 3, [0, 1, 2], publish), /Injected/);
  assert.deepEqual(s.data, before);
  await s.dedicated.acceptPoolMines("alice", 100, 3, [0, 1, 2], publish);
  await s.dedicated.actPoolMines("alice", "reveal", 3, multiplier, publish);
  const active = structuredClone(s.data);
  s.failNext("gameresults");
  await assert.rejects(s.dedicated.actPoolMines("alice", "cashout", 0, multiplier, publish), /Injected/);
  assert.deepEqual(s.data, active);
  s.data.minesgames[0].poolVersion = undefined;
  const old = structuredClone(s.data);
  assert.equal(await s.dedicated.actPoolMines("alice", "cashout", 0, multiplier, publish), null);
  assert.deepEqual(s.data, old);
});

test("invalid request IDs and insufficient funds cannot create accepted wagers", async () => {
  const s = scene();
  assert.ok((await s.dedicated.acceptDedicatedInstant("limbo", "alice", 100, "", "[100]", instant())).error);
  assert.ok((await s.dedicated.acceptDedicatedInstant("limbo", "alice", 2000, "request-alice-0001", "[2000]", instant())).error);
  assert.equal(s.data.gameresults.length, 0);
  assert.equal(s.data.multiplayerrequests.length, 0);
  assert.equal(s.users.get("alice").balance, 1000);
});
