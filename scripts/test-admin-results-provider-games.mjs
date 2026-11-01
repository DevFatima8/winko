import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

function load(path) {
  const source = readFileSync(join(process.cwd(), path), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  new Function("module", "exports", "require", outputText)(module, module.exports, (name) => { throw new Error(`Unexpected import: ${name}`); });
  return module.exports;
}

const { gameResultSummaries } = load(join("src", "lib", "gameResultGames.ts"));

test("Results list includes every provider catalog game with its image, even without rounds", () => {
  const summaries = gameResultSummaries(
    [{ _id: "builtin-1", slug: "mines", name: "Mines", icon: "💎" }],
    [{ slug: "gregmorn-a", title: "1001 Fruit Wishes", imageUrl: "https://img/a.png" }, { slug: "gregmorn-b", title: "Mines", imageUrl: "https://img/b.png" }],
    [],
  );
  assert.deepEqual(summaries.map((s) => [s.key, s.name, s.icon, s.total]), [
    ["gregmorn-a", "1001 Fruit Wishes", "https://img/a.png", 0],
    ["builtin-1", "Mines", "💎", 0],
    ["gregmorn-b", "Mines", "https://img/b.png", 0],
  ]);
});

test("Provider results recorded under the saved game id or slug count toward that API game", () => {
  const summaries = gameResultSummaries(
    [{ _id: "saved-1", slug: "gregmorn-a", name: "Old title", icon: "" }],
    [{ slug: "gregmorn-a", title: "Fruit Wishes", imageUrl: "https://img/a.png" }, { slug: "gregmorn-b", title: "Coin Horse", imageUrl: "https://img/b.png" }],
    [
      { _id: "saved-1", total: 3, wins: 1, losses: 2, bet: 30, paid: 12 },
      { _id: "gregmorn-a", total: 1, wins: 0, losses: 1, bet: 5, paid: 0 },
      { _id: "gregmorn-b", total: 2, wins: 2, losses: 0, bet: 4, paid: 9 },
      { _id: "deleted-game", total: 1, wins: 0, losses: 1, bet: 1, paid: 0 },
    ],
  );
  const byKey = Object.fromEntries(summaries.map((s) => [s.key, s]));
  assert.deepEqual([byKey["saved-1"].name, byKey["saved-1"].icon, byKey["saved-1"].total, byKey["saved-1"].wins, byKey["saved-1"].losses, byKey["saved-1"].profit], ["Fruit Wishes", "https://img/a.png", 4, 1, 3, 23]);
  assert.deepEqual(byKey["saved-1"].refs, ["saved-1", "gregmorn-a"]);
  assert.deepEqual([byKey["gregmorn-b"].total, byKey["gregmorn-b"].profit], [2, -5]);
  assert.deepEqual([byKey.unknown.name, byKey.unknown.refs], ["Unknown", ["deleted-game"]]);
  assert.equal(summaries[0].key, "saved-1");
});
