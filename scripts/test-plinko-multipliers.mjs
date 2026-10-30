import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { randomInt } from "node:crypto";
import ts from "typescript";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

function scene(prize) {
  const module = { exports: {} };
  const imports = {
    "./mongo": { dbConnect: async () => {} },
    "@/models": { oid: id => id },
    "./gameAccess": { checkGameAccess: async () => null },
    "./outcomes": {
      MAX_MULTIPLIER: 100,
      payoutAfterHouseShare: amount => Math.floor(amount * 0.98 * 100) / 100,
    },
    "./winHold": {},
    "node:crypto": { randomInt },
    "./playerWinCycle": { nextPlayerPrize: async (tx, game, userId, prizes) => { assert.equal(game, "plinko:prizes-v2"); assert.equal(prizes.length, 10); return prize; } },
    "./dailyPoolConfig": { dailyPoolEnabled: () => true },
    "./dailyPoolDedicated": {
      acceptDedicatedInstant: async (game, userId, amount, requestId, signature, outcome) => {
        const result = typeof outcome === "function" ? await outcome({}) : outcome;
        return { ...result.response, poolClaim: result.claim, poolPending: true };
      },
    },
  };
  const code = ts.transpileModule(readFileSync("src\\lib\\plinko.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", code)(name => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}

test("every Plinko table has a 0x centre, the payable prizes and 25x scale markers", () => {
  const { ROWS, TABLES, multipliersFor, PLINKO_PRIZES } = scene(null);
  assert.deepEqual([...PLINKO_PRIZES].sort(), ["0.2", "0.2", "0.9", "0.9", "0.9", "1.3", "1.3", "1.3", "1.3", "1.3"]);
  for (const risk of ["low", "medium", "high"]) {
    for (const rows of ROWS) {
      const table = TABLES[risk][rows];
      assert.equal(table.length, rows + 1, `${risk}/${rows}: bucket count`);
      assert.deepEqual(table, [...table].reverse(), `${risk}/${rows}: symmetry`);
      assert.deepEqual(multipliersFor(risk, rows), table);
      assert.deepEqual(table.slice(0, 4), [25, 1.3, 0.9, 0.2]);
      assert.ok(table.slice(4, -4).every(value => value === 0), `${risk}/${rows}: 0x centre`);
      assert.equal(Math.max(...table), 25);
    }
  }
  assert.deepEqual(TABLES.medium[16], [25, 1.3, 0.9, 0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0.9, 1.3, 25]);
});

test("the state endpoint exposes exactly the same multipliers used for drops", async () => {
  const plinko = scene(null);
  const state = await plinko.getState(null);
  for (const risk of ["low", "medium", "high"]) {
    for (const rows of state.rows) assert.deepEqual(state.tables[risk][rows], plinko.multipliersFor(risk, rows));
  }
});

for (const prize of [null, "0.2", "0.9", "1.3"]) {
  test(`the server win cycle decides the bucket (${prize ?? "no win"})`, async () => {
    const plinko = scene(prize);
    for (const risk of ["low", "medium", "high"]) {
      for (const rows of plinko.ROWS) {
        const result = await plinko.drop("player", 10, risk, rows, "test-drop");
        assert.equal(result.multiplier, prize === null ? 0 : Number(prize));
        assert.equal(result.multiplier, plinko.TABLES[risk][rows][result.bucket]);
        assert.equal(result.path.length, rows);
        assert.equal(result.path.reduce((sum, direction) => sum + direction, 0), result.bucket);
        assert.equal(result.poolClaim, Math.round(10 * result.multiplier * 100) / 100);
        assert.equal(result.poolPending, true);
      }

    }
  });
}

test("Plinko discloses the 25x marker and partial returns without advertising a payable 25x", () => {
  const ui = readFileSync("src\\components\\PlinkoGame.tsx", "utf8");
  assert.match(ui, /25x\* is a scale marker only: 0% chance of payout/);
  assert.match(ui, /Below 1x returns less than your stake/);
  assert.doesNotMatch(ui, /Provably Fair|1\.00%/);
});

test("Plinko commits exactly 2/5/3 positive returns per 100 distinct players, preserving retries and old wagers", async () => {
  const players = Array.from({ length: 200 }, (_, i) => `plinko-player-${i}`);
  const s = createLegacyScene(players, { poolEnabled: true });
  s.data.plinkobets = [];
  const day = Date.parse("2026-10-24T08:00:00Z");
  s.at(day);
  const oldPrizeCycle = { _id: "plinko:player-prizes:v1", remaining: ["0.4", "1.9"] };
  s.data.multiplayerrooms.push(structuredClone(oldPrizeCycle));

  for (let cycle = 0; cycle < 2; cycle++) {
    const replies = await Promise.all(players.slice(cycle * 100, (cycle + 1) * 100).map((player, i) =>
      s.plinko.drop(player, 10, ["low", "medium", "high"][i % 3], 8 + i % 9, `plinko-request-${player}`)));
    assert.equal(replies.filter(reply => reply.multiplier === 0).length, 90);
    assert.equal(replies.filter(reply => reply.multiplier === 0.2).length, 2);
    assert.equal(replies.filter(reply => reply.multiplier === 1.3).length, 5);
    assert.equal(replies.filter(reply => reply.multiplier === 0.9).length, 3);
    assert.equal(replies.filter(reply => reply.multiplier === 25).length, 0);
    const winnerCycle = structuredClone(s.data.multiplayerrooms.find(row => row._id === "plinko:prizes-v2:ten-player-wins:v1"));
    const player = players[cycle * 100];
    const replay = await s.plinko.drop(player, 10, "low", 8, `plinko-request-${player}`);
    assert.equal(replay.id, replies[0].id);
    assert.equal(replay.multiplier, replies[0].multiplier);
    assert.deepEqual(s.data.multiplayerrooms.find(row => row._id === winnerCycle._id), winnerCycle);
  }
  assert.deepEqual(s.data.multiplayerrooms.find(row => row._id === oldPrizeCycle._id), oldPrizeCycle);

  s.at(day + 86400000);
  await s.store.transact("daily-pool:plinko", tx => s.pool.settleDailyPools(tx, "plinko"));
  for (const source of s.data.plinkobets) {
    assert.equal(source.poolPending, false);
    assert.equal(source.payout, 10 * source.multiplier);
  }
});

test("Plinko rejected bets and failed writes do not consume a cycle slot; repeat players cannot redraw", async () => {
  const s = createLegacyScene(["alice"], { poolEnabled: true });
  s.data.plinkobets = [];
  const cycleRows = () => structuredClone(s.data.multiplayerrooms.filter(row => row._id.startsWith("plinko:prizes-v2:")));
  const play = requestId => s.plinko.drop("alice", 10, "medium", 16, requestId);
  assert.match((await s.plinko.drop("alice", 2000, "medium", 16, "plinko-insufficient-01")).error, /Insufficient/);
  assert.deepEqual(cycleRows(), []);

  s.failNext("plinkobets");
  await assert.rejects(play("plinko-failed-write-01"), /Injected/);
  assert.deepEqual(cycleRows(), []);
  assert.equal(s.users.get("alice").balance, 1000);
  assert.equal(s.data.gameresults.length, 0);

  const first = await play("plinko-failed-write-01");
  assert.equal(first.ok, true);
  const before = cycleRows();
  const repeat = await play("plinko-repeat-player-01");
  assert.equal(repeat.multiplier, 0);
  assert.equal(repeat.poolClaim, 0);
  assert.deepEqual(cycleRows(), before);
});