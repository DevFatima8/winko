import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

const cycleId = "lucky-777:ten-player-wins:v1";
const prizeId = "lucky-777:player-prizes:v1";
const categories = { miss: 90, orange: 1, lemon: 2, cherry3: 3, cherry2: 2, cherry1: 2 };
const players = ["alice", "bob", ...Array.from({ length: 98 }, (_, i) => `player-${i}`)];
const today = Date.parse("2026-10-25T12:00:00Z");
function scene(pooled) {
  const s = createLegacyScene(players, { poolEnabled: pooled });
  s.at(today);
  for (const user of s.data.users) user.balance = 1000000;
  return s;
}
const play = (s, index, amount = 10, user = players[index % 100]) =>
  s.slot.spin(user, amount, `slot-request-${String(index).padStart(6, "0")}`);
const cycle = s => s.data.multiplayerrooms.find(row => row._id === cycleId);
const quota = s => structuredClone(s.data.multiplayerrooms);
function forceWin(s) {
  s.data.multiplayerrooms.push(
    { _id: cycleId, players: Array.from({ length: 99 }, (_, i) => `previous-${i}`), remaining: [true] },
    { _id: prizeId, remaining: ["orange"] },
  );
}
function category(reels) {
  if (reels.every(s => s === "orange")) return "orange";
  if (reels.every(s => s === "lemon")) return "lemon";
  const cherries = reels.filter(s => s === "cherry").length;
  return cherries ? `cherry${cherries}` : "miss";
}
function count(results, amount = 10) {
  const counts = Object.fromEntries(Object.keys(categories).map(key => [key, 0]));
  for (const result of results) {
    assert.equal(result.ok, true, result.error);
    const kind = category(result.reels);
    counts[kind]++;
    const match = result.reels && result.win;
    if (kind !== "miss") {
      assert.ok(match);
      assert.equal(match.mult, kind === "cherry1" ? 1 : 2);
    } else assert.equal(match, null);
    assert.ok(result.payout <= amount * 2 && (result.poolClaim ?? 0) <= amount * 2);
  }
  return counts;
}

for (const pooled of [false, true]) {
  const mode = pooled ? "pooled" : "legacy";
  test(`${mode}: two completed blocks of 100 distinct players give exactly ten genuine wins`, async () => {
    const s = scene(pooled);
    for (let block = 0; block < 2; block++) {
      const results = [];
      for (let index = block * 100; index < (block + 1) * 100; index++) results.push(await play(s, index));
      assert.deepEqual(count(results), categories);
      assert.equal(results.filter(result => result.win).length, 10);
      for (const result of results) assert.equal(Boolean(s.slot.evaluate(result.reels)), Boolean(result.win));
      assert.deepEqual(cycle(s).players, []);
      assert.equal(cycle(s).remaining.length, 100);
      assert.equal(cycle(s).remaining.filter(Boolean).length, 10);
      assert.ok(results.every(result => result.payout <= 20 && !result.poolPending));
      assert.equal(s.data.dailypoolentries.length, 0);
    }
    assert.equal(s.data.gameresults.length, 200);
    assert.equal(s.data.multiplayerrequests.length, 200);
    assert.equal(s.slot.theoreticalRtp(), 0.18);
  });

  test(`${mode}: repeated admitted players lose without consuming more quota or prizes`, async () => {
    const s = scene(pooled);
    const first = await play(s, 0);
    assert.ok(first.ok);
    const before = quota(s);
    for (let i = 1; i < 21; i++) {
      const repeat = await play(s, 1000 + i, 10, "alice");
      assert.equal(repeat.win, null);
      assert.equal(s.slot.evaluate(repeat.reels), null);
      assert.equal(repeat.payout, 0);
      assert.equal(repeat.poolClaim ?? 0, 0);
    }
    assert.deepEqual(quota(s), before);
    const rest = [];
    for (let i = 1; i < 100; i++) rest.push(await play(s, i));
    assert.deepEqual(count([first, ...rest]), categories);
  });

  test(`${mode}: concurrent duplicate requests charge once and consume one cycle slot`, async () => {
    const s = scene(pooled);
    const [a, b] = await Promise.all([play(s, 1), play(s, 1)]);
    assert.deepEqual(a.reels, b.reels);
    assert.equal(a.payout, b.payout);
    assert.equal(a.balance, b.balance);
    assert.equal(s.data.gameresults.length, 1);
    assert.equal(cycle(s).remaining.length, 99);
    const before = structuredClone(s.data);
    const changed = await play(s, 1, 20);
    assert.match(changed.error, /different wager/);
    assert.deepEqual(s.data, before);
  });

  test(`${mode}: concurrent distinct players share one 100-player block`, async () => {
    const s = scene(pooled);
    const results = await Promise.all(Array.from({ length: 100 }, (_, index) => play(s, index)));
    assert.deepEqual(count(results), categories);
    assert.equal(cycle(s).remaining.length, 100);
    assert.deepEqual(cycle(s).players, []);
    assert.equal(s.data.gameresults.length, 100);
  });

  test(`${mode}: invalid, blocked and insufficient bets never consume a slot`, async () => {
    const s = scene(pooled);
    for (const amount of [0, 5, NaN, Infinity]) assert.ok((await play(s, 1, amount)).error);
    assert.ok((await s.slot.spin("alice", 10, "bad")).error);
    s.data.users[1].blockedGames = ["lucky-777"];
    assert.ok((await play(s, 1)).error);
    s.data.users[1].blockedGames = [];
    s.data.users[1].balance = 0;
    assert.match((await play(s, 1)).error, /Insufficient/);
    assert.equal(cycle(s), undefined);
    assert.equal(s.data.gameresults.length, 0);
  });

  test(`${mode}: transaction failures roll back the cycle, wallet and replay identity`, async () => {
    const tables = ["multiplayerrooms", "users", "gameresults", "multiplayerrequests", "winholds"];
    for (const table of tables) {
      const s = scene(pooled);
      forceWin(s);
      const before = structuredClone(s.data);
      s.failNext(table);
      await assert.rejects(play(s, 1), /Injected/);
      assert.deepEqual(s.data, before, table);
      const retry = await play(s, 1);
      assert.equal(category(retry.reels), "orange");
      assert.equal(cycle(s).remaining.length, 100);
      assert.equal(s.data.multiplayerrooms.find(row => row._id === prizeId).remaining.length, 10);
    }
  });

  test(`${mode}: persisted cycles survive a fresh worker and a day change`, async () => {
    const first = scene(pooled);
    const results = [];
    for (let i = 0; i < 37; i++) results.push(await play(first, i));
    const second = scene(pooled);
    Object.assign(second.data, structuredClone(first.data));
    second.at(Date.parse("2026-10-26T12:00:00Z"));
    assert.equal(cycle(second).remaining.length, 63);
    for (let i = 37; i < 100; i++) results.push(await play(second, i));
    assert.deepEqual(count(results), categories);
  });

  test(`${mode}: a malformed persisted cycle fails explicitly without accepting a bet`, async () => {
    for (const remaining of [["jackpot"], Array(100).fill(true), null]) {
      const s = scene(pooled);
      s.data.multiplayerrooms.push({ _id: cycleId, players: [], remaining });
      const before = structuredClone(s.data);
      await assert.rejects(play(s, 1), /player win cycle is invalid/);
      assert.deepEqual(s.data, before);
    }
  });

  test(`${mode}: 100000 stake returns no more than 200000 including wallet credit and holds`, async () => {
    const s = scene(pooled);
    forceWin(s);
    const before = s.users.get("bob").balance;
    const result = await play(s, 1, 100000);
    assert.equal(result.win.mult, 2);
    assert.equal(category(result.reels), "orange");
    const record = s.data.gameresults[0];
    assert.match(record.resultData, /×2/);
    assert.doesNotMatch(record.resultData, /×10\b/);
    assert.equal(result.poolPending, undefined);
    assert.equal(result.poolClaim, undefined);
    const holds = s.data.winholds.reduce((total, row) => total + row.amount, 0);
    const returned = s.users.get("bob").balance - before + 100000 + holds;
    assert.ok(returned <= 200000);
    assert.equal(returned, 200000);
    const accepted = structuredClone(s.data);
    await play(s, 1, 100000);
    assert.deepEqual(s.data, accepted);
  });
}

test("changing pool activation cannot replay an accepted request as another spin", async () => {
  for (const pooled of [false, true]) {
    const s = scene(pooled);
    const first = await play(s, 1);
    const remaining = structuredClone(cycle(s).remaining);
    const balance = s.users.get("bob").balance;
    s.setPoolEnabled(!pooled);
    const replay = await play(s, 1);
    assert.deepEqual(replay.reels, first.reels);
    assert.equal(replay.balance, balance);
    assert.equal(replay.payout, first.payout);
    assert.deepEqual(cycle(s).remaining, remaining);
    assert.equal(s.data.gameresults.length, 1);
  }
});

test("previously accepted pooled requests retain their original claim and never redraw", async () => {
  const s = scene(true);
  const requestId = "slot-request-000001";
  const id = "accepted-before-slot-migration";
  const now = new Date(today);
  const result = {
    _id: id, gameId: "lucky-777", userId: "bob", betAmount: 100000, winAmount: 0,
    outcome: "pending", createdAt: now, updatedAt: now, resultData: "Original pooled result",
  };
  await s.store.transact("lucky-777", async tx => {
    await s.pool.addPoolWager(tx, "lucky-777", result);
    await s.pool.closePoolWager(tx, id, 250000);
    result.poolClaim = 250000;
    await tx.insert("gameresults", id, result);
  });
  s.data.users.find(user => user._id === "bob").balance -= 100000;
  s.data.multiplayerrequests.push({
    _id: createHash("sha256").update(`dedicated:lucky-777:bob:${requestId}`).digest("hex"),
    fingerprint: "[100000]", resultId: id,
    response: { ok: true, reels: ["orange", "orange", "orange"], win: { label: "Orange", mult: 10 },
      payout: 0, poolPending: true, poolClaim: 250000 },
  });
  const replay = await s.slot.spin("bob", 100000, requestId);
  assert.equal(replay.poolPending, true);
  assert.equal(replay.poolClaim, 250000);
  assert.equal(replay.payout, 0);
  assert.equal(replay.balance, 900000);
  assert.equal(cycle(s), undefined);
  assert.equal(s.data.gameresults.length, 1);
});

test("pool activation cannot add extra winners or allocate extra slot payments overnight", async () => {
  const s = scene(true);
  const before = s.data.users.reduce((sum, user) => sum + user.balance, 0);
  for (let i = 0; i < 100; i++) await play(s, i);
  const winners = s.data.gameresults.filter(entry => entry.winAmount > 0).length;
  assert.equal(winners, 10);
  s.at(Date.parse("2026-10-26T12:00:00Z"));
  await s.store.transact("daily-pool:lucky-777", tx => s.pool.settleDailyPools(tx, "lucky-777"));
  const after = s.data.users.reduce((sum, user) => sum + user.balance, 0);
  const paid = s.data.gameresults.reduce((sum, entry) => sum + Math.round(entry.winAmount * 100), 0);
  assert.equal(Math.round((before - after) * 100), 100000 - paid);
  assert.equal(s.data.dailypoolentries.length, 0);
  assert.equal(s.data.dailypools.length, 0);
  assert.equal(paid + s.data.winholds.reduce((sum, row) => sum + Math.round(row.amount * 100), 0), 18000);
  const remaining = structuredClone(cycle(s).remaining);
  const balance = s.users.get("bob").balance;
  const replay = await play(s, 1);
  assert.equal(replay.poolPending, undefined);
  assert.equal(replay.balance, balance);
  assert.deepEqual(cycle(s).remaining, remaining);
  assert.equal(s.data.gameresults.length, 100);
});

test("all existing paytable rows and symbols remain unchanged", () => {
  const s = scene(false);
  assert.deepEqual(s.slot.PAYTABLE.map(row => row.mult), [100, 100, 50, 25, 10, 20, 12, 10, 8, 6, 2, 1]);
  assert.equal(s.slot.SYMBOLS.length, 9);
  for (const [reels, mult] of [
    [["seven", "seven", "seven"], 100], [["bell", "bell", "bell"], 20], [["plum", "plum", "plum"], 12],
    [["bar1", "bar2", "bar3"], 10],
  ]) assert.equal(s.slot.evaluate(reels).mult, mult);
});

test("bet chips update the visible BET directly with no custom input or Set button", () => {
  const slots = [];
  let cursor = 0;
  slots[0] = { balance: 1000, limits: { min: 10, max: 10000 }, paytable: [], recent: [] };
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], next => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }];
    },
    useRef(initial) {
      const i = cursor++;
      return slots[i] ??= { current: initial };
    },
    useCallback: fn => fn,
    useEffect() {},
  };
  const jsx = (type, props) => ({ type, props });
  const imports = {
    react, "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/lib/client": {}, "@/lib/gameAudio": {}, "@/lib/walletSync": {},
    "@/lib/betPresets": { BET_PRESETS: [10, 20, 50, 100, 200] },
    "next/link": { __esModule: true, default: "link" },
  };
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync("src\\components\\Slot777Game.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", code)(name => {
    assert.ok(name in imports, `Unexpected UI import: ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  const render = () => { cursor = 0; return loaded.exports.Slot777Game({}); };
  function nodes(tree) {
    if (!tree || typeof tree !== "object") return [];
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    return [tree, ...nodes(tree.props?.children)];
  }
  for (const amount of [10, 20, 50, 100, 200]) {
    let tree = nodes(render());
    assert.equal(tree.some(node => node.type === "input"), false);
    assert.equal(tree.some(node => node.type === "button" && node.props.children === "Set"), false);
    const chip = tree.find(node => node.type === "button" && node.props.children === amount);
    assert.ok(chip);
    chip.props.onClick();
    tree = nodes(render());
    const display = tree.find(node => Array.isArray(node.props?.children) && node.props.children[0]?.props?.children === "Bet");
    assert.equal(display.props.children[1].props.children, amount);
    assert.ok(tree.some(node => node.type === "button" && node.props.children === "AUTO"));
    assert.ok(tree.some(node => node.type === "button" && node.props.children === "SPIN"));
  }
});
