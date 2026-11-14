import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function compile(path, require) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "exports", code)(require, exports);
  return exports;
}
const { THIRTY_WIN_GAMES } = compile("src\\lib\\winOpportunityRules.ts", () => assert.fail("Unexpected rule dependency"));
const { DAILY_POOL_SETTLEMENT_RULES } = compile("src\\lib\\dailyPoolRules.ts", name => {
  if (name === "./gameCatalog") return { GAME_ORDER: [] };
  if (name === "./multiplayer-types") return { MULTIPLAYER_GAMES: [] };
  assert.fail(name);
});
const text = node => Array.isArray(node) ? node.map(text).join(" ") : node && typeof node === "object" ? text(node.props?.children) : node == null || typeof node === "boolean" ? "" : String(node);
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === "object" ? [node, ...nodes(node.props?.children)] : [];
const quotas = /30\/100|\d+ winning|\d+ profitable wins|\d+ zero-return losses|\d+ losing|per 100|100 player-rounds/;

function scene(game) {
  let accepted = null;
  const consents = [];
  const jsx = (type, props) => ({ type, props });
  const component = compile("src\\components\\WinOpportunityNotice.tsx", name => {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "react") return { useState: () => [accepted, value => { accepted = value; }] };
    if (name === "@/lib/dailyPoolRules") return { DAILY_POOL_SETTLEMENT_RULES };
    if (name === "@/lib/dailyPoolConsent") return { acceptDailyPool: value => consents.push(value) };
    assert.fail(`Unexpected notice dependency ${name}`);
  });
  return {
    consents,
    render: (loaded, enabled) => component.WinOpportunityNotice({ game, loaded, enabled, children: "BETTING GAME" }),
  };
}

test("all instant game entries render immediately without a loading gate or banner", () => {
  for (const game of THIRTY_WIN_GAMES) {
    const s = scene(game);
    const loading = s.render(false, false);
    assert.match(text(loading), /BETTING GAME/);
    assert.doesNotMatch(text(loading), quotas);
    assert.doesNotMatch(text(loading), /Loading game status/);
    assert.ok(!nodes(loading).some(node => node.type === "button" || node.type === "details"));
    const ready = s.render(true, false);
    assert.match(text(ready), /BETTING GAME/);
    assert.doesNotMatch(text(ready), quotas);
    assert.ok(!nodes(ready).some(node => node.type === "button" || node.type === "details"));
    assert.deepEqual(s.consents, []);
  }
});

test("pool settlement still requires explicit consent without win/loss quotas", () => {
  const s = scene("dice");
  const loading = s.render(false, true);
  assert.match(text(loading), /BETTING GAME/);
  assert.ok(!nodes(loading).some(node => node.type === "button" || node.type === "details"));
  assert.deepEqual(s.consents, []);
  const ready = s.render(true, true);
  assert.doesNotMatch(text(ready), /BETTING GAME/);
  assert.doesNotMatch(text(ready), quotas);
  assert.match(text(ready), /35%|65%/);
  assert.match(text(ready), /provisional claims/);
  nodes(ready).find(node => node.type === "button").props.onClick();
  const accepted = s.render(true, true);
  assert.match(text(accepted), /BETTING GAME/);
  assert.match(text(accepted), /claims are provisional/);
  assert.doesNotMatch(text(accepted), quotas);
  assert.deepEqual(s.consents, ["dice"]);
});

test("switching from instant to pool mode still requires pool consent", () => {
  const s = scene("dice");
  assert.match(text(s.render(true, false)), /BETTING GAME/);
  const pool = s.render(true, true);
  assert.doesNotMatch(text(pool), /BETTING GAME/);
  nodes(pool).find(node => node.type === "button").props.onClick();
  assert.match(text(s.render(true, true)), /BETTING GAME/);
  assert.deepEqual(s.consents, ["dice"]);
});

test("stale pool mode cannot show a settlement screen while the next game's status loads", () => {
  const s = scene("dice");
  assert.doesNotMatch(text(s.render(true, true)), /BETTING GAME/);
  const next = s.render(false, true);
  assert.match(text(next), /BETTING GAME/);
  assert.ok(!nodes(next).some(node => node.type === "button" || node.type === "details"));
  assert.deepEqual(s.consents, []);
});
