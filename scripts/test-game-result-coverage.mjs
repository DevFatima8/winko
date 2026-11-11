import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

function load(file, imports = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", code)(name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}

const notices = load("src\\lib\\gameResultNotice.ts");
const catalog = load("src\\lib\\gameCatalog.ts");

function popup(game) {
  const target = new EventTarget(), slots = [], effects = [];
  let cursor = 0;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], next => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ??= { current: initial };
    },
    useCallback(fn) { return fn; },
    useEffect(fn) {
      const index = cursor++;
      if (!slots[index]) {
        slots[index] = {};
        effects.push(() => { slots[index].cleanup = fn(); });
      }
    },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync("src\\components\\GameResultPopup.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", "window", "document", code)(name => ({
    react: hooks,
    "react-dom": { createPortal: node => node },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "./GameOverOverlay": { GameResultMessage: () => null },
    "@/lib/gameResultNotice": notices,
  })[name], module, module.exports, target, { body: {} });
  const render = () => {
    cursor = 0;
    const tree = module.exports.GameResultPopup({ game });
    effects.splice(0).forEach(fn => fn());
    return tree;
  };
  render();
  return {
    render,
    emit(detail) { target.dispatchEvent(new CustomEvent("wx:game-result", { detail })); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test("every catalog game has a shared completion path reachable from its game view", () => {
  const covered = new Set(notices.LEGACY_RESULT_GAMES);
  const visited = new Set();
  function scan(file) {
    file = path.resolve(file);
    if (visited.has(file)) return;
    visited.add(file);
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isCallExpression(node) && ["usePoolLifecycle", "useBrowserWager", "useMultiplayerGame", "notifyGameResult", "completeBrowserProjectile"].includes(node.expression.getText(source))) {
        const first = node.arguments[0];
        if (first && ts.isStringLiteral(first)) covered.add(first.text);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    for (const node of source.statements) {
      if ((!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) || !node.moduleSpecifier) continue;
      const name = node.moduleSpecifier.text;
      const base = name.startsWith("@/components/") ? path.join("src", name.slice(2)) :
        name.startsWith(".") ? path.resolve(path.dirname(file), name) : null;
      if (!base) continue;
      const dependency = [base, `${base}.tsx`, `${base}.ts`, path.join(base, "index.tsx"), path.join(base, "index.ts")]
        .find(candidate => /\.(tsx|ts)$/.test(candidate) && existsSync(candidate));
      if (dependency && dependency.includes(`${path.sep}components${path.sep}`)) scan(dependency);
    }
  }
  scan("src\\components\\GameView.tsx");
  assert.equal(catalog.GAME_SLUGS.length, 70);
  for (const game of catalog.GAME_SLUGS) assert.ok(covered.has(game), `${game}: missing a completion connection`);
});

test("all 70 game frames show win amounts and suppress losses", () => {
  for (const game of catalog.GAME_SLUGS) {
    const p = popup(game);
    p.emit({ game, id: "win", win: 1234.5, won: true });
    let message = p.render();
    assert.equal(message.props.title, "Congratulations! You win", game);
    assert.equal(message.props.winAmount, 1234.5, game);
    message.props.onDismiss();
    p.emit({ game, id: "loss", win: 0, won: false });
    message = p.render();
    assert.equal(message, null, game);
    p.unmount();
  }
});

test("both Aviator legacy event adapters ignore losses and retain the next win amount without a stake", () => {
  for (const game of ["aviator", "aviator-x"]) {
    const p = popup(game);
    p.emit({ game: "Aviator", bet: 500, win: 0, won: false });
    assert.equal(p.render(), null);
    p.emit({ game: "Aviator", bet: 500, win: 750, won: true });
    const message = p.render();
    assert.equal(message.props.winAmount, 750);
    assert.equal(message.props.bet, undefined);
    message.props.onDismiss();
    assert.equal(p.render(), null);
    p.unmount();
  }
});

test("repeated polling and legacy result adapters cannot duplicate a shared round message", () => {
  const p = popup("nine-wickets");
  const result = { game: "nine-wickets", id: "round-123", win: 100, won: true };
  p.emit(result);
  p.emit(result);
  p.emit({ game: "9 Wickets", win: 100, won: true });
  const message = p.render();
  message.props.onDismiss();
  assert.equal(p.render(), null);
  p.unmount();
});

test("simultaneous game results are queued instead of losing a message", () => {
  const p = popup("crash-goal");
  p.emit({ game: "crash-goal", id: "panel-1", win: 100, won: true });
  p.emit({ game: "crash-goal", id: "panel-2", win: 200, won: true });
  const first = p.render();
  assert.equal(first.props.winAmount, 100);
  first.props.onDismiss();
  const second = p.render();
  assert.equal(second.props.winAmount, 200);
  assert.notEqual(first.key, second.key);
  second.props.onDismiss();
  assert.equal(p.render(), null);
  p.unmount();
});

test("pending claims retain their disclosure and zero-claim losses are not queued", () => {
  const p = popup("fortune-toucan");
  p.emit({ game: "fortune-toucan", id: "a", win: 0, won: false, poolPending: true, poolClaim: 250 });
  const win = p.render();
  assert.equal(win.props.winAmount, 250);
  assert.match(win.props.result, /Provisional.*pending; not credited yet/);
  win.props.onDismiss();
  p.emit({ game: "fortune-toucan", id: "b", win: 0, won: false, bet: 100, poolPending: true, poolClaim: 0 });
  assert.equal(p.render(), null);
  p.unmount();
});

test("other games and events after leaving the game never display a result", () => {
  const p = popup("aviator");
  p.emit({ game: "fortune-toucan", id: "other", win: 100, won: true });
  p.emit({ game: "Mines", win: 0, won: false });
  assert.equal(p.render(), null);
  p.unmount();
  p.emit({ game: "Aviator", win: 100, won: true });
  assert.equal(p.render(), null);
});
