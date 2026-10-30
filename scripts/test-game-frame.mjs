import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(file, resolve) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(resolve, module, module.exports);
  return module.exports;
}

const catalog = load("src\\lib\\gameCatalog.ts", () => { throw new Error("Unexpected catalog import"); });
const rules = { isDailyPoolGame: slug => catalog.GAME_SLUGS.includes(slug) };
const component = () => null;
const components = new Proxy({}, { get: (_target, name) => name === "__esModule" ? true : component });
const { GameView } = load("src\\components\\GameView.tsx", name => {
  if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  if (name === "react") return { useCallback: fn => fn, useEffect() {} };
  if (name === "next/navigation") return { useRouter: () => ({ back() {}, replace() {} }) };
  if (name === "@/lib/i18n/client") return { useI18n: () => ({ t: key => key, locale: "en" }) };
  if (name === "@/lib/gameCatalog") return catalog;
  if (name === "@/lib/dailyPoolRules") return rules;
  assert.notEqual(name, "@/components/GameWalletBar", "The duplicate wallet header must not mount in games");
  return components;
});

test("all catalog games retain their native component inside a bounded scrollable frame without duplicate titles or wallet bars", () => {
  assert.equal(catalog.GAME_SLUGS.length, 70);
  for (const slug of catalog.GAME_SLUGS) {
    const resultScope = GameView({ slug, backHref: "/player" });
    assert.equal(resultScope.props.value, true);
    const [popup, frame] = resultScope.props.children;
    assert.equal(popup.props.game, slug, `${slug}: shared result display stays mounted`);
    assert.equal(frame.props["data-game-frame"], slug);
    assert.match(frame.props.className, /\bh-full\b/);
    assert.match(frame.props.className, /\bmin-h-0\b/);
    assert.match(frame.props.className, /\boverflow-y-auto\b/);
    const children = frame.props.children.filter(Boolean);
    assert.equal(children.length, 2, `${slug}: only the game and retained how-to instructions`);
    const [surface, instructions] = children;
    assert.match(surface.props.className, /\bgame-surface\b/);
    assert.match(surface.props.className, /\bh-full\b/);
    assert.match(surface.props.className, /\bshrink-0\b/);
    assert.match(surface.props.className, /\boverflow-y-auto\b/);
    assert.equal(surface.props.children.type, component, `${slug}: existing engine stays mounted`);
    assert.equal(surface.props.children.props.game, slug, `${slug}: shared rules cover every catalog game`);
    assert.equal(surface.props.children.props.children.type, component, `${slug}: native engine remains inside the consent gate`);
    assert.equal(instructions.props.children[0].type, "b", `${slug}: original instructions remain accessible`);
  }
});
