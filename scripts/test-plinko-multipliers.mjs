import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

function scene(prize, pooled = true, side = 0) {
  const loaded = { exports: {} };
  const wallet = { balance: 1000, results: [] };
  const prizes = ["1.8", "1.5", "1.3", "1.1", "1", "0.7"];
  const imports = {
    "./mongo": { dbConnect: async () => {} },
    "@/models": {
      oid: id => id,
      User: {
        updateOne: async (filter, update) => {
          if (filter.balance && wallet.balance < filter.balance.$gte) return { modifiedCount: 0 };
          wallet.balance += update.$inc.balance;
          return { modifiedCount: 1 };
        },
        findById: () => ({ lean: async () => ({ balance: wallet.balance }) }),
      },
      Game: { findOneAndUpdate: () => ({ lean: async () => ({ _id: "plinko" }) }) },
      PlinkoBet: { create: async data => ({ ...data, _id: "saved-bet" }) },
      GameResult: { create: async data => { wallet.results.push(data); return data; } },
    },
    "./gameAccess": { checkGameAccess: async () => null },
    "./outcomes": {
      MAX_MULTIPLIER: 100,
      payoutAfterHouseShare: amount => Math.floor(amount * 0.98 * 100) / 100,
    },
    "./winHold": { holdWinShare: async () => {} },
    "node:crypto": { randomInt: maximum => {
      if (maximum === 10) return prize === null ? 1 : 0;
      if (maximum === 6) return prizes.indexOf(prize);
      if (maximum === 2) return side;
      assert.equal(maximum, 1);
      return 0;
    } },
    "./playerWinCycle": { nextPlayerWin: async (_tx, game) => { assert.equal(game, "plinko:prizes-v2"); return prize !== null; } },
    "./dailyPoolConfig": { dailyPoolEnabled: () => pooled },
    "./dailyPoolDedicated": {
      acceptDedicatedInstant: async (game, userId, amount, requestId, signature, outcome) => {
        const result = typeof outcome === "function" ? await outcome({}) : outcome;
        if ("error" in result) return result;
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
  }, loaded, loaded.exports);
  return { ...loaded.exports, wallet };
}

test("the fixed board matches the confirmed 13-bucket paytable for every risk", () => {
  const { ROWS, TABLES, multipliersFor, PLINKO_PRIZES } = scene(null);
  const expected = [1.8, 1.5, 1.3, 1.1, 1, 0.7, 0, 0.7, 1, 1.1, 1.3, 1.5, 1.8];
  assert.deepEqual(ROWS, [12]);
  assert.deepEqual(PLINKO_PRIZES.map(Number), [1.8, 1.5, 1.3, 1.1, 1, 0.7]);
  for (const risk of ["low", "medium", "high"]) {
    for (const rows of ROWS) {
      const table = TABLES[risk][rows];
      assert.equal(table.length, rows + 1, `${risk}/${rows}: bucket count`);
      assert.deepEqual(multipliersFor(risk, rows), table);
      assert.deepEqual(table, expected);
    }
  }
});

test("the state endpoint exposes exactly the same multipliers used for drops", async () => {
  const plinko = scene(null);
  const state = await plinko.getState(null);
  for (const risk of ["low", "medium", "high"]) {
    for (const rows of state.rows) assert.deepEqual(state.tables[risk][rows], plinko.multipliersFor(risk, rows));
  }
});

test("the actual canvas paints all thirteen server multipliers in the confirmed order", async () => {
  const { outputText } = ts.transpileModule(readFileSync("src\\components\\PlinkoGame.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const loaded = {};
  const allowed = new Set(["react/jsx-runtime", "@/lib/client", "@/lib/gameAudio", "next/link", "react", "@/lib/walletSync", "@/lib/walletReveal", "@/lib/betPresets"]);
  new Function("require", "exports", `${outputText}\nexports.drawScene = drawScene;`)(name => {
    assert.ok(allowed.has(name), `Unexpected canvas dependency: ${name}`);
    return {};
  }, loaded);
  const labels = [];
  const ctx = {
    clearRect() {}, beginPath() {}, arc() {}, fill() {}, moveTo() {}, arcTo() {}, closePath() {},
    fillText(label) { labels.push(label); },
  };
  const state = await scene(null).getState(null);
  loaded.drawScene(ctx, { rows: 12, table: state.tables.medium[12], balls: [], hitPegs: new Map(), bucketBounce: new Map() }, 0);
  assert.deepEqual(labels, ["1.8x", "1.5x", "1.3x", "1.1x", "1x", "0.7x", "0x", "0.7x", "1x", "1.1x", "1.3x", "1.5x", "1.8x"]);
});

for (const prize of [null, "0.7", "1", "1.1", "1.3", "1.5", "1.8"]) {
  test(`actual paths, claims and wallet payouts match the payable ${prize ?? "0"}x bucket on both sides`, async () => {
    for (const pooled of [true, false]) {
      for (const side of [0, 1]) {
        const plinko = scene(prize, pooled, side);
        for (const risk of ["low", "medium", "high"]) {
          const before = plinko.wallet.balance;
          const result = await plinko.drop("player", 10, risk, 12, "test-drop");
          assert.equal(result.multiplier, prize === null ? 0 : Number(prize));
          assert.equal(result.multiplier, plinko.TABLES[risk][12][result.bucket]);
          assert.equal(result.path.length, 12);
          assert.equal(result.path.reduce((sum, direction) => sum + direction, 0), result.bucket);
          if (prize === null) assert.equal(result.bucket, 6);
          else assert.equal(result.bucket < 6, side === 0);
          if (pooled) {
            assert.equal(result.poolClaim, Math.round(10 * result.multiplier * 100) / 100);
            assert.equal(result.poolPending, true);
          } else {
            assert.equal(result.payout, Math.floor(10 * result.multiplier * 0.98 * 100) / 100);
            assert.equal(plinko.wallet.balance, before - 10 + result.payout);
            assert.equal(plinko.wallet.results.at(-1).winAmount, result.payout);
          }
        }
      }
    }
  });
}

test("new drops reject other row counts before drawing or funding a wager", async () => {
  for (const pooled of [true, false]) {
    const plinko = scene(null, pooled);
    for (const rows of [8, 10, 11, 13, 16, NaN]) assert.match((await plinko.drop("player", 10, "medium", rows)).error, /12 rows/);
    assert.equal(plinko.wallet.balance, 1000);
    assert.deepEqual(plinko.wallet.results, []);
  }
});

test("Plinko still commits ten positive returns per 100 distinct players, preserving retries and old prize documents", async () => {
  const players = Array.from({ length: 200 }, (_, i) => `plinko-player-${i}`);
  const s = createLegacyScene(players, { poolEnabled: true });
  s.data.plinkobets = [];
  const day = Date.parse("2026-10-24T08:00:00Z");
  s.at(day);
  const oldPrizeCycle = { _id: "plinko:prizes-v2:player-prizes:v1", remaining: ["0.2", "0.9", "1.3"] };
  s.data.multiplayerrooms.push(structuredClone(oldPrizeCycle));

  for (let cycle = 0; cycle < 2; cycle++) {
    const replies = await Promise.all(players.slice(cycle * 100, (cycle + 1) * 100).map((player, i) =>
      s.plinko.drop(player, 10, ["low", "medium", "high"][i % 3], 12, `plinko-request-${player}`)));
    assert.equal(replies.filter(reply => reply.multiplier === 0).length, 90);
    assert.equal(replies.filter(reply => reply.multiplier > 0).length, 10);
    assert.ok(replies.every(reply => [0, 0.7, 1, 1.1, 1.3, 1.5, 1.8].includes(reply.multiplier)));
    const winnerCycle = structuredClone(s.data.multiplayerrooms.find(row => row._id === "plinko:prizes-v2:ten-player-wins:v1"));
    const player = players[cycle * 100];
    const replay = await s.plinko.drop(player, 10, "low", 12, `plinko-request-${player}`);
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
  const play = requestId => s.plinko.drop("alice", 10, "medium", 12, requestId);
  assert.match((await s.plinko.drop("alice", 2000, "medium", 12, "plinko-insufficient-01")).error, /Insufficient/);
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

test("a paytable update does not reset an unfinished eligibility cycle or let an old player draw again", async () => {
  const players = ["alice", ...Array.from({ length: 99 }, (_, i) => `next-player-${i}`)];
  const s = createLegacyScene(players, { poolEnabled: true });
  s.data.plinkobets = [];
  const eligibility = {
    _id: "plinko:prizes-v2:ten-player-wins:v1", players: ["alice"],
    remaining: [...Array(9).fill(true), ...Array(90).fill(false)],
  };
  s.data.multiplayerrooms.push(structuredClone(eligibility));
  const repeat = await s.plinko.drop("alice", 10, "low", 12, "plinko-existing-player");
  assert.equal(repeat.multiplier, 0);
  assert.deepEqual(s.data.multiplayerrooms.find(row => row._id === eligibility._id), eligibility);
  const replies = await Promise.all(players.slice(1).map(player => s.plinko.drop(player, 10, "low", 12, `plinko-${player}`)));
  assert.equal(replies.filter(reply => reply.multiplier > 0).length, 9);
  assert.equal(replies.filter(reply => reply.multiplier === 0).length, 90);
});