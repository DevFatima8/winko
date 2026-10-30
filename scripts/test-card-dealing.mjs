import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const jsx = (type, props, key) => ({ type, props, key });
function nodes(node) {
  if (node == null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
function load(file, imports, suffix = "", math = Math) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8") + suffix, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", "Math", code)(name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  }, module, module.exports, math);
  return module.exports;
}
const { AndarBaharStage } = load("src\\components\\CardTable.tsx", {
  react: {}, "react/jsx-runtime": { jsx, jsxs: jsx },
  "@/lib/client": {}, "@/lib/gameAudio": {}, "@/lib/walletSync": {},
  "@/lib/betPresets": { BET_PRESETS: [10, 20, 50, 100, 200] },
  "next/link": {}, "@/components/Icons": {}, "@/components/LiveMultiplayerBets": {},
  "./CardTable.module.css": { default: { dealtCard: "dealt-card" } },
}, "\nexport { AndarBaharStage };");

const result = {
  kind: "andar-bahar", joker: { r: 7, s: 0 },
  andar: [{ r: 2, s: 0 }, { r: 7, s: 1 }],
  bahar: [{ r: 3, s: 0 }], winner: "andar", dealMs: 900,
};
const rows = (time, winner = null) => nodes(AndarBaharStage({ result, revealT: time, winner }))
  .filter(node => typeof node.type === "function" && node.type.name === "AndarBaharRow");

test("Andar Bahar reveals one alternating card per 900ms, not whole rows at once", () => {
  for (const [time, counts] of [[1399, [0, 0]], [1400, [1, 0]], [2299, [1, 0]], [2300, [1, 1]], [3200, [2, 1]]]) {
    assert.deepEqual(rows(time).map(row => row.props.n), counts, String(time));
  }
});

test("clock updates preserve row and card identities so entry animations do not restart", () => {
  const before = rows(1400), after = rows(1500), next = rows(3200, "andar");
  assert.equal(before[0].type, after[0].type);
  assert.equal(before[0].type, next[0].type);
  const cards = row => nodes(row.type(row.props)).filter(node => node.props?.className?.includes("dealt-card"));
  assert.equal(cards(before[0])[0].key, cards(next[0])[0].key);
  assert.equal(cards(next[0]).length, 2);
  assert.equal(nodes(next[0].type(next[0].props)).filter(node => node.props?.glow).length, 1);
  assert.match(readFileSync("src\\components\\CardTable.module.css", "utf8"), /deal-card 650ms/);
  assert.match(readFileSync("src\\components\\CardTable.tsx", "utf8"), /AndarBaharStage key=\{round.roundNo\}/);
});

test("short and long generated deals retain their cards and winner, with enough shared reveal time", () => {
  let seed = 12345;
  const math = Object.create(Math);
  math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const cards = load("src\\lib\\cards.ts", {
    "./gameAccess": {}, "./outcomes": { MAX_MULTIPLIER: 100, payoutAfterHouseShare: n => n },
  }, "", math);
  const lengths = [];
  for (let i = 0; i < 100; i++) {
    const { result: r, revealMs } = cards.generate("andar-bahar");
    const sequence = Array.from({ length: r.andar.length + r.bahar.length }, (_, n) =>
      n % 2 === 0 ? r.andar[n / 2] : r.bahar[(n - 1) / 2]);
    lengths.push(sequence.length);
    assert.equal(r.dealMs, 900);
    assert.equal(revealMs, 1400 + sequence.length * 900 + 3200);
    assert.equal(sequence.at(-1).r, r.joker.r);
    assert.ok(sequence.slice(0, -1).every(card => card.r !== r.joker.r));
    assert.equal(r.winner, sequence.length % 2 ? "andar" : "bahar");
    assert.equal(new Set([r.joker, ...sequence].map(card => `${card.r}:${card.s}`)).size, sequence.length + 1);
  }
  assert.ok(lengths.some(n => n <= 14));
  assert.ok(lengths.some(n => n > 14));
  assert.equal(cards.generate("dragon-tiger").revealMs, 7000);
});
