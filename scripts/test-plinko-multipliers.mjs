import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

function scene(prize, pooled = true, side = 0) {
  const loaded = { exports: {} };
  const wallet = { balance: 1000, results: [] };
  const prizes = ["1.8", "1.5", "1.3", "1.1", "1", "0.7"];
  let gateSample = null, prizeSample = null, firstDraw = true;
  const ranges = [];
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
    "./gameBetLimits": { MAX_GAME_BET: 100000 },
    "./outcomes": {
      MAX_MULTIPLIER: 100,
      payoutAfterHouseShare: amount => Math.floor(amount * 0.98 * 100) / 100,
    },
    "./winHold": { holdWinShare: async () => {} },
    "node:crypto": { randomInt: maximum => {
      if (firstDraw) {
        firstDraw = false;
        ranges.push(maximum);
        return gateSample ?? (prize === null ? maximum - 1 : 0);
      }
      if (maximum === 6 && prizeSample !== null) return prizeSample;
      if (maximum === 6 && prizes.includes(prize)) return prizes.indexOf(prize);
      return Math.min(side, maximum - 1);
    } },
    "./playerWinCycle": { nextPlayerWin: async (_tx, game) => { assert.equal(game, "plinko:prizes-v2"); return prize !== null; } },
    "./dailyPoolConfig": { dailyPoolEnabled: () => pooled },
    "./dailyPoolDedicated": {
      acceptDedicatedInstant: async (game, userId, amount, requestId, signature, outcome) => {
        const result = typeof outcome === "function" ? await outcome({}) : outcome;
        if ("error" in result) return result;
        wallet.balance = wallet.balance - amount + result.payout;
        wallet.results.push({ winAmount: result.payout });
        return { ...result.response, payout: result.payout, balance: wallet.balance };
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
  return { ...loaded.exports, wallet, ranges,
    sample(gate, positive) { gateSample = gate; prizeSample = positive; firstDraw = true; },
    resetDraw() { firstDraw = true; },
  };
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
  assert.equal(state.dailyPoolEnabled, false);
  for (const risk of ["low", "medium", "high"]) {
    for (const rows of state.rows) assert.deepEqual(state.tables[risk][rows], plinko.multipliersFor(risk, rows));
  }
});

test("the actual canvas paints all thirteen server multipliers in the confirmed order", async () => {
  const { outputText } = ts.transpileModule(readFileSync("src\\components\\PlinkoGame.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const loaded = {};
  const allowed = new Set(["react/jsx-runtime", "@/lib/client", "@/lib/gameAudio", "next/link", "react", "@/lib/walletSync", "@/lib/walletReveal", "@/lib/betPresets", "@/lib/gameBetLimits"]);
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
          plinko.resetDraw();
          const before = plinko.wallet.balance;
          const result = await plinko.drop("player", 10, risk, 12, "test-drop");
          assert.equal(result.multiplier, prize === null ? 0 : Number(prize));
          assert.equal(result.multiplier, plinko.TABLES[risk][12][result.bucket]);
          assert.equal(result.path.length, 12);
          assert.equal(result.path.reduce((sum, direction) => sum + direction, 0), result.bucket);
          if (prize === null) assert.equal(result.bucket, 6);
          else assert.equal(result.bucket < 6, side === 0);
          assert.equal(result.poolPending, undefined);
          assert.equal(result.payout, plinko.plinkoPayout(10, result.multiplier));
          assert.equal(plinko.wallet.balance, before - 10 + result.payout);
          assert.equal(plinko.wallet.results.at(-1).winAmount, result.payout);
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

test("all random draws produce exactly 80% net RTP after the 2% deduction", () => {
  const p = scene(null);
  const amount = 10;
  const prizes = p.PLINKO_PRIZES.map(Number);
  const denominator = prizes.reduce((sum, m) => sum + Math.round(p.plinkoPayout(amount, m) * 100), 0);
  let paidCents = 0;
  for (let gate = 0; gate < denominator; gate++) {
    for (let positive = 0; positive < prizes.length; positive++) {
      p.sample(gate, positive);
      const prize = p.plinkoPrize(amount);
      paidCents += Math.round(p.plinkoPayout(amount, Number(prize)) * 100);
    }
  }
  assert.equal(paidCents / (denominator * prizes.length), amount * 80);
  for (let stake = 10; stake <= 100000; stake++) {
    const sum = prizes.reduce((total, m) => total + Math.round(p.plinkoPayout(stake, m) * 100), 0);
    const cutoff = stake * 80 * prizes.length;
    p.sample(cutoff - 1, 0);
    assert.equal(p.plinkoPrize(stake), "1.8");
    assert.equal(p.ranges.at(-1), sum);
    p.sample(cutoff, 0);
    assert.equal(p.plinkoPrize(stake), null);
    assert.equal(cutoff * sum / (sum * prizes.length), stake * 80);
  }
  assert.equal(p.plinkoPayout(100, 1.8), 176.4);
});

test("new Plinko payouts are atomic and concurrent retries cannot redraw or double-pay", async () => {
  for (const poolEnabled of [true, false]) {
    const s = createLegacyScene(["alice"], { poolEnabled });
    s.data.plinkobets = [];
    const play = () => s.plinko.drop("alice", 10, "medium", 12, "plinko-atomic-request");
    assert.match((await s.plinko.drop("alice", 2000, "medium", 12, "plinko-insufficient")).error, /Insufficient/);
    for (const table of ["users", "gameresults", "plinkobets", "multiplayerrequests"]) {
      const before = structuredClone(s.data);
      s.failNext(table);
      await assert.rejects(play(), /Injected/);
      assert.deepEqual(s.data, before);
    }
    const replies = await Promise.all([play(), play(), play()]);
    assert.ok(replies.every(reply => reply.id === replies[0].id && reply.multiplier === replies[0].multiplier));
    const first = replies[0];
    assert.equal(first.payout, s.plinko.plinkoPayout(10, first.multiplier));
    assert.equal(first.poolPending, undefined);
    assert.equal(s.users.get("alice").balance, 990 + first.payout);
    assert.equal(s.data.gameresults.length, 1);
    assert.equal(s.data.plinkobets.length, 1);
    assert.equal(s.data.winholds.length, 0, "2% is retained, not later credited back to the player");
    assert.equal(s.data.dailypoolentries.length, 0);
    assert.equal(s.data.gameresults[0].winAmount, first.payout);
    s.at(Date.parse("2026-11-16T19:00:00Z"));
    const replay = await play();
    assert.equal(replay.id, first.id);
    assert.equal(replay.payout, first.payout);
    assert.equal(s.data.gameresults.length, 1);
  }
});

test("repeat players get fresh independent draws without consuming legacy eligibility cycles", async () => {
  const s = createLegacyScene(["alice"], { poolEnabled: true });
  s.data.plinkobets = [];
  const eligibility = { _id: "plinko:prizes-v2:ten-player-wins:v1", players: ["alice"], remaining: Array(99).fill(false) };
  s.data.multiplayerrooms.push(structuredClone(eligibility));
  for (let round = 0; round < 20; round++) {
    const reply = await s.plinko.drop("alice", 10, "low", 12, `plinko-repeat-${round.toString().padStart(4, "0")}`);
    assert.equal(reply.ok, true);
    assert.equal(reply.payout, s.plinko.plinkoPayout(10, reply.multiplier));
  }
  assert.equal(s.data.plinkobets.length, 20);
  assert.deepEqual(s.data.multiplayerrooms.find(row => row._id === eligibility._id), eligibility);
  assert.equal(s.data.multiplayerrooms.length, 1);
});