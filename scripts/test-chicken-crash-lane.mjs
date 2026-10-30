import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import ts from "typescript";

function load(winRate) {
  const text = readFileSync(join("src", "lib", "crashLane.ts"), "utf8");
  const source = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)((name) => {
    if (name === "node:crypto") return { randomInt };
    if (name === "./outcomes") return { isWinOutcome: () => Math.random() < winRate };
    throw new Error(`Unexpected import: ${name}`);
  }, loaded, loaded.exports);
  return loaded.exports.spreadCrashLane;
}

const afterShare = (gross) => Math.floor(Math.max(0, gross) * 0.98 * 100) / 100;

// Chicken Road 2: 25 cells, `cars` of them hidden.
function road(cars) {
  const lanes = 25 - cars, surv = [1], mult = [];
  for (let k = 1; k <= lanes; k++) {
    surv[k] = surv[k - 1] * (lanes - k + 1) / (25 - k + 1);
    mult.push(Math.min(100, Math.max(1, Math.floor((0.98 / surv[k]) * 100) / 100)));
  }
  return { surv, profit: mult.findIndex((m) => afterShare(m * 100) > 100) + 1 };
}

// Chicken Dash: mirrors buildLevel() in src/lib/chickendash.ts.
function dash(steps, first, max) {
  const RTP = 0.9685, p1 = RTP / first, target = first / max;
  const prodFor = (pEnd) => { let p = 1; for (let k = 2; k <= steps; k++) p *= p1 + ((pEnd - p1) * (k - 1)) / (steps - 1); return p; };
  let lo = 0.01, hi = p1;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (prodFor(mid) > target) hi = mid; else lo = mid; }
  const pEnd = (lo + hi) / 2, surv = [1], ladder = [];
  for (let k = 1; k <= steps; k++) {
    surv[k] = surv[k - 1] * (k === 1 ? p1 : p1 + ((pEnd - p1) * (k - 1)) / (steps - 1));
    ladder.push(Math.round((RTP / surv[k]) * 100) / 100);
  }
  ladder[0] = first; ladder[steps - 1] = Math.min(100, max);
  return { surv, profit: ladder.findIndex((m) => afterShare(100 * m) > 100) + 1 };
}

const LEVELS = {
  "road easy": road(1), "road medium": road(3), "road hard": road(5), "road hardcore": road(10),
  "dash easy": dash(28, 1.01, 14.54), "dash normal": dash(24, 1.05, 43.15), "dash hard": dash(20, 1.21, 100),
};
const N = 30000;

for (const [name, { surv, profit }] of Object.entries(LEVELS)) {
  const lanes = surv.length - 1;

  test(`${name}: losing rounds can be hit on any lane, never clear the road`, () => {
    const spread = load(0);
    const hits = new Set();
    let pastMiddle = 0;
    for (let i = 0; i < N; i++) {
      const lane = spread(surv, profit);
      assert.ok(Number.isInteger(lane) && lane >= 1 && lane <= lanes, `lane ${lane} out of range`);
      hits.add(lane);
      if (lane > lanes / 2) pastMiddle++;
    }
    assert.ok(hits.has(1) && hits.has(2), "out at the start / just after the start");
    assert.ok(pastMiddle > 0, "out after the middle is possible");
    if (!name.endsWith("hardcore") && !name.endsWith("hard")) assert.equal(hits.size, lanes, `every lane incl. the one before the end: ${[...hits].sort((a, b) => a - b)}`);
  });

  test(`${name}: winning rounds pass the first profit lane and may still be hit later`, () => {
    const spread = load(1);
    let cleared = 0, hitLater = 0;
    for (let i = 0; i < N; i++) {
      const lane = spread(surv, profit);
      assert.ok(lane > profit && lane <= lanes + 1, `lane ${lane} (profit ${profit})`);
      if (lane === lanes + 1) cleared++; else hitLater++;
    }
    assert.ok(hitLater > 0, `hit later ${hitLater}`);
    if (surv[lanes] / surv[profit] > 1e-3) assert.ok(cleared > 0, `cleared ${cleared}`);
  });
}

test("Chicken Dash easy: not mostly out at the start and not mostly never out", () => {
  const { surv, profit } = LEVELS["dash easy"];
  const spread = load(0.35), lanes = surv.length - 1;
  let first = 0, cleared = 0, start = 0, early = 0, middle = 0, late = 0;
  for (let i = 0; i < N; i++) {
    const lane = spread(surv, profit);
    if (lane === 1) first++;
    if (lane > lanes) { cleared++; continue; }
    const f = lane / lanes;
    if (f <= 0.15) start++; else if (f <= 0.4) early++; else if (f <= 0.7) middle++; else late++;
  }
  assert.ok(first / N < 0.15, `lane-1 share ${first / N}`);
  assert.ok(cleared / N < 0.2, `clear share ${cleared / N}`);
  for (const n of [start, early, middle, late]) assert.ok(n / N > 0.05, `section spread ${[start, early, middle, late]}`);
});

test("no lane is ever a guaranteed-safe or guaranteed-out spot", () => {
  for (const name of ["road easy", "dash easy", "dash normal"]) {
    const { surv, profit } = LEVELS[name];
    const spread = load(0.35), lanes = surv.length - 1;
    const reached = Array(lanes + 2).fill(0), hit = Array(lanes + 2).fill(0);
    for (let i = 0; i < 60000; i++) {
      const lane = spread(surv, profit);
      for (let k = 1; k <= Math.min(lane, lanes); k++) reached[k]++;
      if (lane <= lanes) hit[lane]++;
    }
    for (let k = 1; k < lanes; k++) {
      if (reached[k] < 200) continue;
      const rate = hit[k] / reached[k];
      assert.ok(rate > 0 && rate < 0.9, `${name} lane ${k} hit rate ${rate}`);
    }
  }
});

test("35% of rounds are winning rounds (always reach a profitable cash-out)", () => {
  const { surv, profit } = LEVELS["dash normal"];
  let wins = 0;
  const spreadWin = load(1), spreadMixed = load(0.35);
  for (let i = 0; i < 2000; i++) assert.ok(spreadWin(surv, profit) > profit);
  for (let i = 0; i < N; i++) if (spreadMixed(surv, profit) > profit) wins++;
  assert.ok(wins / N >= 0.33, `share ${wins / N}`);
});
