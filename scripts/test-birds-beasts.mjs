import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

function load(file, imports = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", code)(name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  }, mod, mod.exports);
  return mod.exports;
}

const config = load("src\\components\\birds-beasts\\lib\\game-config.ts");
const { resolveBirdsBeastsRound: play } = load("src\\lib\\birdsBeastsRounds.ts", {
  "node:crypto": crypto, "@/components/birds-beasts/lib/game-config": config,
});
const ID = "birds-beasts:rounds-20-target:v2";
function store() {
  const rows = new Map();
  return {
    rows,
    get: async (table, id) => structuredClone(rows.get(`${table}:${id}`) ?? null),
    put: async (table, id, row) => { rows.set(`${table}:${id}`, structuredClone(row)); },
  };
}

test("100 player-rounds count once each, including multi-option and idle rounds, with exact appearance quotas", async () => {
  const tx = store();
  const choices = [
    { eagle: 50 }, { owl: 50, lion: 50, panda: 50, chicken: 50, rabbit: 50, goldenShark: 50, silverShark: 50 },
    {}, { birds: 50, beasts: 50 }, { goldenShark: 50 }, { silverShark: 50 },
  ];
  for (let block = 0; block < 100; block++) {
    const counts = { x8: 0, x12: 0, goldenShark: 0, silverShark: 0 };
    for (let round = 1; round <= 100; round++) {
      const bets = choices[crypto.randomInt(choices.length)];
      const reply = await play(tx, bets);
      const { slot, animal } = reply.outcome;
      assert.equal(config.WHEEL[slot], animal);
      const result = config.evaluateBets(bets, slot);
      assert.equal(reply.claim, result.payout);
      assert.equal(reply.outcome.outcome, config.totalOf(bets) === 0 ? "idle" : result.net > 0 ? "win" : "lose");
      if (config.SHARKS.includes(animal)) {
        counts[animal]++;
        assert.ok(round >= 91, `Shark at ${round}`);
      } else if (config.ANIMALS[animal].multiplier === 8) counts.x8++;
      else if (config.ANIMALS[animal].multiplier === 12) counts.x12++;
      const saved = await tx.get("multiplayerrooms", ID);
      assert.equal(saved.remaining.length, round === 100 ? 100 : 100 - round);
    }
    assert.deepEqual(counts, { x8: 2, x12: 2, goldenShark: 1, silverShark: 1 });
  }
});

test("20 winning targets are used but impossible results are not forged and all combinations still settle", async () => {
  const tx = store();
  // Both ordinary categories have winning and losing lights for this allocation.
  const bets = { eagle: 50, owl: 50, chicken: 50 };
  await tx.put("multiplayerrooms", ID, {
    remaining: [...Array(90).fill("regular"), "x8", "x8", "x12", "x12",
      ...Array(4).fill("regular"), "goldenShark", "silverShark"],
    targets: [...Array(20).fill(true), ...Array(80).fill(false)],
  });
  let matched = 0;
  let actualWins = 0;
  for (let round = 0; round < 100; round++) {
    const before = await tx.get("multiplayerrooms", ID);
    const wantWin = before.targets[0];
    const reply = await play(tx, bets);
    if (wantWin) matched++;
    actualWins += Number(reply.outcome.outcome === "win");
    if (!config.SHARKS.includes(reply.outcome.animal)) {
      assert.equal(reply.outcome.outcome === "win", wantWin);
    }
  }
  assert.equal(matched, 20);
  assert.equal(actualWins, 20);
  // This allocation loses money on every light: a target win cannot override the paytable.
  const covering = Object.fromEntries([...config.ANIMAL_IDS, "birds", "beasts"].map(key => [key, key.includes("Shark") ? 1 : 1000]));
  const reply = await play(tx, covering);
  assert.equal(reply.claim, config.evaluateBets(covering, reply.outcome.slot).payout);
  await tx.put("multiplayerrooms", ID, { remaining: ["goldenShark", "silverShark"], targets: [true, false] });
  const impossibleWin = await play(tx, { eagle: 50 });
  assert.equal(impossibleWin.outcome.animal, "goldenShark");
  assert.equal(impossibleWin.outcome.outcome, "lose");
  assert.equal(impossibleWin.claim, 0);
});

test("invalid saved schedules fail rather than silently resetting the quotas", async () => {
  for (const saved of [
    { remaining: ["goldenShark", ...Array(99).fill("regular")], targets: Array(100).fill(false) },
    { remaining: ["x8", "x8", "x8"], targets: [false, false, false] },
    { remaining: ["unknown"], targets: [true] },
    { remaining: ["regular"], targets: [] },
  ]) {
    const tx = store();
    await tx.put("multiplayerrooms", ID, saved);
    await assert.rejects(play(tx, {}), /cycle is invalid/);
  }
});

test("paid round replay cannot advance the cycle twice or credit a second payout", async () => {
  const s = createLegacyScene(["alice"], { poolEnabled: false });
  s.data.games.push({ _id: "birds-beasts", slug: "birds-beasts", isActive: true });
  const wagerId = crypto.randomUUID();
  await s.store.transact("birds-beasts", tx => s.browser.browserPoolLifecycle(tx, "alice", {
    game: "birds-beasts", wagerId, operationId: crypto.randomUUID(), action: "accept", amount: 100,
  }, false));
  const resolve = () => s.store.transact("birds-beasts", tx => s.browser.resolveServerBrowserWager(tx, "alice", {
    game: "birds-beasts", wagerId, operationId: crypto.randomUUID(), selection: { bets: { birds: 50, beasts: 50 } },
  }, false));
  const accepted = structuredClone(s.data);
  s.failNext("gameresults");
  await assert.rejects(resolve(), /Injected database failure/);
  assert.deepEqual(s.data, accepted, "Failed settlement must roll back both the cycle and the wallet");
  const first = await resolve();
  const state = structuredClone(s.data.multiplayerrooms);
  const balance = s.data.users[0].balance;
  const replays = await Promise.all([resolve(), resolve()]);
  for (const replay of replays) assert.deepEqual(replay.outcome, first.outcome);
  assert.equal(s.data.users[0].balance, balance);
  assert.deepEqual(s.data.multiplayerrooms, state);
  assert.equal(s.data.multiplayerrooms.find(row => row._id === ID).remaining.length, 99);
});

test("idle round API retries reuse one scheduled result and cannot settle paid bets", async () => {
  const tx = store();
  const route = load("src\\app\\api\\spin\\route.ts", {
    "node:crypto": crypto,
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    "@/lib/gameAvailability": { LOCAL_GAMES_CONNECTED: true },
    "@/lib/serverAuth": { getServerSessionUser: async () => ({ id: "alice" }) },
    "@/lib/multiplayer-store": { mysqlMultiplayerStore: { transact: async (lock, run) => {
      assert.equal(lock, "daily-pool:birds-beasts");
      return run(tx);
    } } },
    "@/lib/dailyPoolRules": { dailyPoolLock: game => `daily-pool:${game}` },
    "@/lib/birdsBeastsRounds": { resolveBirdsBeastsRound: play },
  });
  const request = body => ({ json: async () => body });
  const roundId = crypto.randomUUID();
  const first = await route.POST(request({ roundId }));
  const replay = await route.POST(request({ roundId }));
  assert.equal(first.status, 200);
  assert.deepEqual(replay, first);
  assert.equal((await tx.get("multiplayerrooms", ID)).remaining.length, 99);
  assert.equal((await route.POST(request({ roundId, bets: { eagle: 50 } }))).status, 400);
});

test("the balance is still held until the wheel reveals the confirmed result", () => {
  const source = readFileSync("src\\components\\birds-beasts\\BirdsBeasts.tsx", "utf8");
  assert.match(source, /resolveServer\(\{ bets: snapshot \}, \{ holdBalance: true \}\)/);
  assert.ok(source.indexOf("pool.releaseBalance()", source.indexOf('phase === "result"')) > 0);
});
