import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const components = [
  "treasure-bowl/Game.tsx",
  "gates-of-olympus/GatesOfOlympusGame.tsx",
  "fortune-toucan/FortuneToucanGame.tsx",
  "fortune-toucan/GameOverlays.tsx",
  "fortune-ox/FortuneOxGame.tsx",
  "evo-casino/EvoCasinoGame.tsx",
  "sweet-bonanza-clone/Game.tsx",
  "super-fruits-slot/SlotGame.tsx",
  "fortune-gems/FortuneGemsGame.tsx",
  "hotline/HotlineGame.tsx",
  "diao-chan/components/GameScreen.tsx",
  "Slot777Game.tsx",
];
const read = (file) => readFileSync(path.join("src", "components", ...file.split("/")), "utf8");

for (const file of components) {
  test(`${file}: wallet setters are only used by wager/settlement callbacks`, () => {
    const source = read(file);
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const setters = new Set();
    const visit = (node, callback) => {
      callback(node);
      ts.forEachChild(node, (child) => visit(child, callback));
    };
    visit(tree, (node) => {
      if (!ts.isVariableDeclaration(node) || !ts.isArrayBindingPattern(node.name)) return;
      if (!node.initializer || !ts.isCallExpression(node.initializer)) return;
      if (node.initializer.expression.getText(tree) !== "useGameBalance") return;
      const setter = node.name.elements[1];
      if (setter && ts.isBindingElement(setter)) setters.add(setter.name.getText(tree));
    });
    visit(tree, (node) => {
      if (!ts.isIdentifier(node) || !setters.has(node.text)) return;
      if (ts.isBindingElement(node.parent) && node.parent.name === node) return;
      if (ts.isArrayLiteralExpression(node.parent) &&
          ts.isCallExpression(node.parent.parent) &&
          ["useCallback", "useEffect"].includes(node.parent.parent.expression.getText(tree)) &&
          node.parent.parent.arguments[1] === node.parent) return;
      assert.ok(ts.isCallExpression(node.parent) && node.parent.expression === node,
        `${file}: wallet setter must not be passed to a player control`);
      let ancestor = node.parent.parent;
      while (ancestor) {
        if (ts.isCallExpression(ancestor) &&
            ["pool.start", "pool.complete", "pool.cancel"].includes(ancestor.expression.getText(tree))) return;
        ancestor = ancestor.parent;
      }
      assert.fail(`${file}: wallet change outside genuine wager/settlement callback`);
    });
    assert.doesNotMatch(source, /reset (?:your )?(?:demo )?balance|balance reset|balance restored|grab a fresh stack|ADD Rs\.|onReset/iu);
  });
}

test("Treasure Bowl keeps its wallet-neutral round reset", () => {
  const source = read("treasure-bowl/Game.tsx");
  assert.match(source, /const resetDemo = \(\) => \{[\s\S]*?clearTimers\(\)/u);
  assert.match(source, /onClick=\{resetDemo\}/u);
  assert.match(source, /useGameBalance\("treasure-bowl", 1000\)/u);
});

test("Super Fruits insufficient-balance dialog dismisses without refilling", () => {
  const source = read("super-fruits-slot/SlotGame.tsx");
  assert.match(source, /onClick=\{\(\) => setBroke\(false\)\}[\s\S]*?CLOSE/u);
  assert.doesNotMatch(source, /const refill|sfx\.refill|\bsetBalance\b/u);
});
