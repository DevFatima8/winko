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

test("deposits, withdrawals, real betting and confirmed payouts remain wired", () => {
  assert.match(source("nine-wickets/Game.tsx"), /onAddCoins=.*\/player\/deposit/);
  assert.match(source("speed-baccarat/SpeedBaccaratGame.tsx"), /window\.location\.assign\("\/player\/deposit"\)/);
  assert.match(source("tower-betting/Game.tsx"), /await pool\.start\(/);
  assert.match(source("tower-betting/Game.tsx"), /await pool\.complete\(/);
  assert.match(source("keno/components/keno/KenoGame.tsx"), /await pool\.start\(/);
  assert.match(source("keno/components/keno/KenoGame.tsx"), /await pool\.complete\(/);
  assert.match(readFileSync(path.resolve("src", "app", "player", "wallet", "Client.tsx"), "utf8"), /withdraw/i);
});
