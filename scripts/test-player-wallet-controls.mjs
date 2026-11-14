import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve("src", "components");
const source = relative => readFileSync(path.join(root, ...relative.split("/")), "utf8");
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(path.join(directory, entry.name)) :
      /\.tsx?$/.test(entry.name) ? [path.join(directory, entry.name)] : []);
}
function parse(file, text) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, child => visit(child, callback));
}

test("synchronized game wallets have no arbitrary setter calls outside accepted wager settlement", () => {
  let wallets = 0, legacySettlementCalls = 0;
  for (const file of files(root)) {
    const text = readFileSync(file, "utf8"), ast = parse(file, text);
    const setters = new Set();
    visit(ast, node => {
      if (!ts.isVariableDeclaration(node) || !ts.isArrayBindingPattern(node.name) ||
          !node.initializer || !ts.isCallExpression(node.initializer) ||
          node.initializer.expression.getText(ast) !== "useGameBalance") return;
      wallets++;
      const setter = node.name.elements[1];
      if (setter && ts.isBindingElement(setter) && ts.isIdentifier(setter.name)) setters.add(setter.name.text);
    });
    visit(ast, node => {
      if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || !setters.has(node.expression.text)) return;
      let acceptedSettlement = false;
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression) &&
            parent.expression.expression.getText(ast) === "pool" &&
            ["start", "complete"].includes(parent.expression.name.text)) acceptedSettlement = true;
      }
      const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
      assert.ok(acceptedSettlement, `${path.relative(root, file)}:${line} directly mutates a wallet: ${node.getText(ast)}`);
      legacySettlementCalls++;
    });
  }
  assert.ok(wallets >= 40, "Audit must include the complete game wallet surface");
  assert.ok(legacySettlementCalls > 0, "Legitimate wager debit/payout fallbacks remain covered");
});

for (const file of [
  "european-roulette/RouletteGame.tsx", "poker-roulette/app/page.tsx",
  "head-tail/HeadTailGame.tsx", "birds-beasts/BirdsBeasts.tsx",
  "thai-hi-lo/hi-lo-game.tsx", "tower-betting/Game.tsx",
  "derby-race/DerbyRaceApp.tsx", "crash-bonus/CrashGame.tsx",
  "crash-cricket/CrashCricketApp.tsx", "fishing-arcade/FishingGame.tsx",
  "keno/components/keno/KenoGame.tsx",
]) {
  test(`${file}: no balance reset, free funding or claim-credit control remains`, () => {
    const text = source(file);
    assert.doesNotMatch(text, /\b(?:handleTopUp|topUp|rebuy|handleReset|BONUS_AMOUNT)\b/);
    assert.doesNotMatch(text, /Reset balance|free virtual coins|Claim Rs\. 10,000|Top Up Rs\.|Add Rs\. 1,000|Add Rs\. 10,000 Demo Balance|GET Rs\./i);
    assert.equal(parse(file, text).parseDiagnostics.length, 0);
  });
}

test("Keno's retained stats/history reset does not alter a high or low wallet balance", () => {
  const file = "keno/components/keno/KenoGame.tsx", text = source(file), ast = parse(file, text);
  let reset;
  visit(ast, node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "resetGame") reset = node;
  });
  assert.ok(reset?.body);
  const body = reset.body.statements.map(statement => statement.getText(ast)).join("\n");
  for (const initialBalance of [0, 8474652.3]) {
    let balance = initialBalance;
    const updates = {};
    const setters = ["setStats", "setHistory", "setResult", "setDrawn", "setRevealIndex", "setBigWin", "setToast", "setWalletOpen"];
    new Function("DEFAULT_STATS", "setBalance", ...setters, body)(
      { rounds: 0 }, value => { balance = typeof value === "function" ? value(balance) : value; },
      ...setters.map(name => value => { updates[name] = value; }),
    );
    assert.deepEqual(updates.setHistory, []);
    assert.deepEqual(updates.setDrawn, []);
    assert.equal(updates.setResult, null);
    assert.match(updates.setToast, /Stats and history reset/);
    assert.doesNotMatch(updates.setToast, /balance|restored/i);
    assert.equal(balance, initialBalance);
  }
});

test("fishing statistics reset preserves engine balance and the free reload entry is absent", () => {
  const file = "fishing-arcade/game/engine.ts", text = source(file), ast = parse(file, text);
  let reset;
  visit(ast, node => {
    if (ts.isMethodDeclaration(node) && node.name.getText(ast) === "reset") reset = node;
  });
  assert.ok(reset?.body);
  const body = reset.body.statements.map(statement => statement.getText(ast)).join("\n");
  for (const balance of [0, 8474652.3]) {
    let emitted = 0;
    const engine = { balance, emit() { emitted++; }, shots: 42, wins: 3, totalWon: 100 };
    new Function(body).call(engine);
    assert.equal(engine.balance, balance);
    assert.equal(engine.shots, 0);
    assert.equal(engine.totalWon, 0);
    assert.equal(emitted, 1);
  }
  assert.doesNotMatch(text, /\breload\s*\(/);
  assert.doesNotMatch(source("fishing-arcade/FishingGame.tsx"), /\.reload\s*\(/);
});

test("fishing fits the game container and updates the portrait instruction on rotation", () => {
  const file = "fishing-arcade/FishingGame.tsx", text = source(file), ast = parse(file, text);
  let hook;
  visit(ast, node => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useLayoutEffect") hook = node.arguments[0].getText(ast);
  });
  assert.ok(hook);
  const viewport = { clientWidth: 960, clientHeight: 420 };
  const portrait = {
    matches: true,
    addEventListener(event, callback) { assert.equal(event, "change"); this.change = callback; },
    removeEventListener(event, callback) { assert.equal(event, "change"); assert.equal(callback, this.change); this.change = null; },
  };
  let resize, disconnected = false, scale, ready, needsLandscape;
  const cleanup = new Function("viewportRef", "window", "ResizeObserver", "W", "H", "setScale", "setReady", "setNeedsLandscape", `return (${hook})();`)(
    { current: viewport }, { matchMedia: () => portrait },
    class {
      constructor(callback) { resize = callback; }
      observe(element) { assert.equal(element, viewport); }
      disconnect() { disconnected = true; }
    },
    1280, 720, value => { scale = value; }, value => { ready = value; }, value => { needsLandscape = value; },
  );
  assert.equal(ready, true);
  assert.equal(needsLandscape, true);
  assert.equal(scale, 420 / 720);
  portrait.matches = false;
  portrait.change();
  assert.equal(needsLandscape, false);
  viewport.clientWidth = 640;
  viewport.clientHeight = 280;
  resize();
  assert.equal(scale, 280 / 720, "Short landscape games must not be forced to a 320px minimum height");
  viewport.clientWidth = 480;
  viewport.clientHeight = 800;
  resize();
  assert.equal(scale, 480 / 1280, "Container resizing must not depend on a window resize");
  portrait.matches = true;
  portrait.change();
  assert.equal(needsLandscape, true);
  cleanup();
  assert.equal(disconnected, true);
  assert.equal(portrait.change, null);
});

test("fishing blocks new paid shots in portrait without replacing the active engine", () => {
  const file = "fishing-arcade/FishingGame.tsx", text = source(file), ast = parse(file, text);
  let hook;
  visit(ast, node => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" &&
        node.arguments[0].getText(ast).includes(".setInputEnabled(")) hook = node.arguments[0].getText(ast);
  });
  assert.ok(hook);
  const enabled = [];
  const engineRef = { current: { setInputEnabled: value => enabled.push(value) } };
  const update = new Function("engineRef", "started", "showPay", "noFunds", "needsLandscape", `(${hook})();`);
  update(engineRef, true, false, false, true);
  update(engineRef, true, false, false, false);
  update(engineRef, true, false, false, true);
  update(engineRef, false, false, false, false);
  update(engineRef, true, true, false, false);
  update(engineRef, true, false, true, false);
  assert.deepEqual(enabled, [false, true, false, false, false, false]);
});

test("deposits, withdrawals, real betting and confirmed payouts remain wired", () => {
  assert.match(source("nine-wickets/Game.tsx"), /onAddCoins=.*\/player\/deposit/);
  assert.match(source("speed-baccarat/SpeedBaccaratGame.tsx"), /window\.location\.assign\("\/player\/deposit"\)/);
  assert.match(source("tower-betting/Game.tsx"), /await pool\.start\(/);
  assert.match(source("tower-betting/Game.tsx"), /await pool\.complete\(/);
  assert.match(source("keno/components/keno/KenoGame.tsx"), /await pool\.start\(/);
  assert.match(source("keno/components/keno/KenoGame.tsx"), /await pool\.complete\(/);
  assert.match(readFileSync(path.resolve("src", "app", "player", "wallet", "Client.tsx"), "utf8"), /withdraw/i);
});
