import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

function load(file, imports = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", code)(name => imports[name], module, module.exports);
  return module.exports;
}

const config = load("src\\components\\birds-beasts\\lib\\game-config.ts");
const engine = load("src\\components\\birds-beasts\\lib\\engine.ts", { "./game-config": config });
const cycle = load("src\\lib\\playerWinCycle.ts", { "node:crypto": crypto });
const rng = () => crypto.randomInt(0, 2 ** 31) / 2 ** 31;

function store() {
  const rows = new Map();
  return {
    rows,
    get: async (table, id) => structuredClone(rows.get(`${table}:${id}`) ?? null),
    put: async (table, id, row) => { rows.set(`${table}:${id}`, structuredClone(row)); },
  };
}

test("Birds & Beasts pays exactly 30 net wins in every block of 100 bets, for any player", async () => {
  const tx = store();
  const choices = [{ birds: 100 }, { beasts: 50 }, { eagle: 100 }, { goldenShark: 50, chicken: 50 }];
  for (let block = 0; block < 5; block++) {
    let wins = 0;
    for (let bet = 0; bet < 100; bet++) {
      const bets = choices[bet % choices.length];
      const won = await cycle.nextBetWin(tx, "birds-beasts", config.BET_WINNERS_PER_100);
      const decision = engine.decideFixedOutcome(bets, won, rng);
      const { net } = config.evaluateBets(bets, decision.slot);
      assert.equal(net > 0, won, "The wheel light must match the counted result");
      if (net > 0) wins++;
    }
    assert.equal(wins, 30, `block ${block + 1}`);
  }
});

test("a corrupted saved bet cycle is rejected instead of changing the winner count", async () => {
  const tx = store();
  await tx.put("multiplayerrooms", "birds-beasts:bet-wins-30-of-100:v1", { remaining: Array(40).fill(true) });
  await assert.rejects(cycle.nextBetWin(tx, "birds-beasts", 30), /invalid/);
});
