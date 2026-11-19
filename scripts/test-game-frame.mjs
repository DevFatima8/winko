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
    const availability = GameView({ slug, backHref: "/player" });
    assert.equal(availability.props.slug, slug);
    assert.equal(availability.props.backHref, "/player");
    const resultScope = availability.props.children;
    assert.equal(resultScope.props.value, slug !== "blackjack");
    const [popup, frame] = resultScope.props.children;
    if (slug !== "blackjack") assert.equal(popup.props.game, slug, `${slug}: shared result display stays mounted`);
    assert.equal(frame.props["data-game-frame"], slug);
    assert.match(frame.props.className, /\bh-full\b/);
    assert.match(frame.props.className, /\bmin-h-0\b/);
    assert.match(frame.props.className, /\boverflow-y-auto\b/);
    const children = frame.props.children.filter(Boolean);
    assert.equal(children.length, 2, `${slug}: shared toolbar plus the native game`);
    const [toolbar, surface] = children;
    const [back, instructions, history] = toolbar.props.children;
    const nativeBack = surface.props.children.props.children.props.backHref;
    if (nativeBack) assert.equal(back, false, `${slug}: do not duplicate the native Back control`);
    else {
      assert.equal(back.type, "button");
      assert.equal(back.props["aria-label"], "Back to games");
      assert.equal(typeof back.props.onClick, "function");
    }
    assert.equal(instructions.type, "details", `${slug}: original instructions remain accessible`);
    assert.equal(history.props.game, slug);
    assert.match(surface.props.className, /\bgame-surface\b/);
    assert.match(surface.props.className, /\bflex-1\b/);
    assert.match(surface.props.className, /\bmin-h-0\b/);
    assert.match(surface.props.className, /\boverflow-y-auto\b/);
    assert.equal(surface.props.children.type, component, `${slug}: existing engine stays mounted`);
    assert.equal(surface.props.children.props.game, slug, `${slug}: shared rules cover every catalog game`);
    assert.equal(surface.props.children.props.children.type, component, `${slug}: native engine remains inside the consent gate`);
  }
});

test("availability gates never mount an engine until a successful active non-maintenance response", async () => {
  const previous = globalThis.fetch;
  const nativeEngine = { type: "native-engine" };
  try {
    for (const [reply, expected] of [
      [{ active: true, underMaintenance: true }, "Under maintenance"],
      [{ active: false, underMaintenance: false }, "Game unavailable"],
      [{ active: true, underMaintenance: false }, "ready"],
    ]) {
      let state = "loading", cleanup;
      globalThis.fetch = async (url, options) => {
        assert.match(url, /view=game&slug=derby-race/);
        assert.equal(options.cache, "no-store");
        return Response.json(reply);
      };
      const { GameAvailability } = load("src\\components\\GameAvailability.tsx", name => {
        if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
        if (name === "next/link") return { default: "a" };
        if (name === "react") return {
          useState: initial => initial === "loading" ? [state, value => { state = value; }] : [0, () => {}],
          useEffect: fn => { cleanup = fn(); },
        };
        throw new Error(name);
      });
      const render = () => GameAvailability({ slug: "derby-race", backHref: "/player", children: nativeEngine });
      assert.notEqual(render(), nativeEngine);
      await new Promise(resolve => setImmediate(resolve));
      const result = render();
      if (expected === "ready") assert.equal(result, nativeEngine);
      else {
        assert.equal(result.props.children[0].props.children, expected);
        assert.equal(result.props.children[2].props.href, "/player");
      }
      cleanup();
    }
  } finally { globalThis.fetch = previous; }
});
