import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

function render(path, props, enabled, dependencies = {}) {
  const jsx = (type, props) => ({ type, props });
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(`src\\components\\${path}`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", code)(name => {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "react") return {
      useState: value => [typeof value === "function" ? value() : value, () => {}],
      useEffect: () => {}, useRef: value => ({ current: value }),
    };
    if (name === "@/lib/walletSync") return { useDailyPoolMode: () => enabled };
    if (name === "@/lib/betPresets") return { BET_PRESETS: [10, 50, 100] };
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw new Error(`Unexpected import ${name}`);
  }, module, module.exports);
  return (module.exports.default ?? module.exports.BetPanel)(props);
}

function text(node) {
  if (node == null || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (typeof node === "object") return text(node.props?.children);
  return String(node);
}

test("Ludo terminal win and loss both remain pending, with the authoritative wallet unchanged", () => {
  const dependencies = { "@/lib/ludo": {
    formatMoney: value => `Rs. ${value}`,
    formatSigned: value => String(value),
    settlementFor: () => ({ entry: -100, win: 0, bag: 0, bagReturn: 0, total: -100 }),
  } };
  for (const winner of [0, 1]) {
    const props = { deal: { winner, players: Array.from({ length: 4 }, (_, id) => ({ name: `Player ${id}`, avatar: "" })) }, balance: 900 };
    const legacy = text(render("ludo\\components\\ludo\\ResultOverlay.tsx", props, false, dependencies));
    assert.match(legacy, winner === 0 ? /\bWIN\b/ : /No win/);
    assert.doesNotMatch(legacy, /-100/, "Loss amounts are not presented as result winnings");
    const pending = text(render("ludo\\components\\ludo\\ResultOverlay.tsx", props, true, dependencies));
    assert.match(pending, /DAILY PAYOUT PENDING/);
    assert.match(pending, /not paid/);
    assert.doesNotMatch(pending, /\bWIN\b|\bLOSE\b/);
    assert.match(pending, /Rs\. 900/);
  }
});

test("Crash Goal terminal panel separates claims from wallet winnings on both outcomes", () => {
  const dependencies = { "./lib/crash": { formatMoney: String, formatMultiplier: String } };
  for (const cashedOutAt of [null, 2]) {
    const props = { amount: 50, autoTarget: 2, autoEnabled: false, placed: true, cashedOutAt, phase: "crashed", balance: 900 };
    const legacy = text(render("crash-goal\\BetPanel.tsx", props, false, dependencies));
    assert.match(legacy, cashedOutAt ? /WON/ : /No win/);
    if (!cashedOutAt) assert.doesNotMatch(legacy, /LOST|Lost|-50/, "A no-win result must not display the lost stake");
    const pending = text(render("crash-goal\\BetPanel.tsx", props, true, dependencies));
    assert.match(pending, /Daily payout pending/);
    assert.doesNotMatch(pending, /\bWON\b|\bLOST\b/);
    assert.match(pending, cashedOutAt ? /claim\s+100\b/ : /claim\s+0\b/);
  }
});

test("Birds/Beasts preserves the drawn animal but never announces a final pending loss", () => {
  const dependencies = { "./lib/game-config": {
    ANIMALS: { bird: { name: "Bird", group: "birds", multiplier: 2, image: "" } },
    BET_SECONDS: 10, GROUP_MULTIPLIER: 2, SLOT_COUNT: 1, WHEEL: ["bird"], formatMoney: String,
  } };
  for (const payout of [0, 200]) {
    const props = { phase: "result", secondsLeft: 0, round: 1, activeSlot: 0, resultSlot: 0,
      result: { animal: "bird", payout, net: payout - 100, totalBet: 100 }, showStartBanner: false, coveredSlots: new Set() };
    const legacy = text(render("birds-beasts\\Wheel.tsx", props, false, dependencies));
    assert.match(legacy, payout ? /WIN \+200/ : /No win/);
    if (!payout) assert.doesNotMatch(legacy, /LOSE|Lost|-100/, "A no-win result must not display the lost stake");
    const pending = text(render("birds-beasts\\Wheel.tsx", props, true, dependencies));
    assert.match(pending, /Daily payout pending/);
    assert.match(pending, new RegExp(`provisional claim ${payout}`));
    assert.doesNotMatch(pending, /LOSE -|WIN \+/);
  }
});

test("critical browser result surfaces guard legacy final-loss wording with pending mode", () => {
  const surfaces = [
    ["hotline\\HotlineGame.tsx", /pool\.enabled \? "DAILY PAYOUT PENDING" : result\.won/],
    ["keno\\components\\keno\\KenoGame.tsx", /pool\.enabled \? "Daily payout pending" : result\.win/],
    ["head-tail\\HeadTailGame.tsx", /poolEnabled \? "DAILY PAYOUT PENDING" : lastRound\.win/],
    ["three-cards\\Game.tsx", /setMessage\(pool\.enabled \? "Daily payout pending[^"]*" : "No win"\)/],
    ["three-card-poker\\ThreeCardPoker.tsx", /setHeadline\(pool\.enabled \? "DAILY PAYOUT PENDING"/],
    ["thai-hi-lo\\hi-lo-game.tsx", /pool\.enabled \? "DAILY PAYOUT PENDING" : roundResult\.won/],
    ["teen-patti-hukam\\Game.tsx", /pool\.enabled \? \{ text: `Daily payout pending/],
    ["teen-patti-faceoff\\GameTable.tsx", /pool\.enabled \? "DAILY PAYOUT PENDING" : outcome\.net/],
    ["rock-paper-scissors\\RockPaperScissorsGame.tsx", /poolPending \? "DAILY PAYOUT PENDING[^"]*" : "No win"/],
    ["crash-bonus\\CrashGame.tsx", /showToast\(pool\.enabled \? "Daily payout pending/],
    ["evo-casino\\EvoCasinoGame.tsx", /pool\.enabled \? `LAST[^`]*PROVISIONAL CLAIM[^`]*DAILY PAYOUT PENDING/],
  ];
  for (const [path, expected] of surfaces) assert.match(readFileSync(`src\\components\\${path}`, "utf8"), expected, path);
  for (const path of ["keno\\components\\keno\\KenoGame.tsx", "hotline\\HotlineGame.tsx"]) {
    const source = readFileSync(`src\\components\\${path}`, "utf8");
    assert.match(source, /poolPending: pool\.enabled/);
    assert.match(source, /poolClaim:/);
  }
  const teenPatti = readFileSync("src\\components\\teen-patti\\TeenPattiGame.tsx", "utf8");
  assert.match(teenPatti, /choice: "fold", amount: -betRef\.current, claim: 0/);
  assert.match(teenPatti, /pool\.start\(bet\)/, "The selected stake is charged without an added boot");
  assert.match(teenPatti, /claim: currentBet \* 2/);
  assert.match(teenPatti, /pool\.complete\(win \? currentBet \* 2 : 0\)/);
});

test("card games with removed extra result panels retain shared lifecycle notifications", () => {
  for (const [file, removed] of [
    ["teen-patti-joker\\game\\TeenPattiGame.tsx", /<ResultBanner/],
    ["teen-patti-ak47\\TeenPattiAK47.tsx", /className=\{`result-banner/],
    ["teen-patti-best-of-four\\game\\TeenPattiGame.tsx", /absolute inset-0 z-30 grid place-items-center/],
    ["teen-patti-hukam\\Game.tsx", /\{msg &&/],
    ["teen-patti-faceoff\\GameTable.tsx", /tp-scale-in flex flex-wrap/],
    ["teen-patti\\TeenPattiGame.tsx", /\{result && \(/],
    ["teen-patti-999\\GameTable.tsx", /fixed inset-0 z-40/],
    ["texas-holdem\\Game.tsx", /Deal Next Hand/],
    ["rummy\\RummyGame.tsx", /key="result"/],
    ["three-card-poker\\ThreeCardPoker.tsx", /<GameOverOverlay/],
  ]) {
    const source = readFileSync(`src\\components\\${file}`, "utf8");
    assert.match(source, /usePoolLifecycle\(/, file);
    if (file.startsWith("teen-patti-ak47") || file.startsWith("teen-patti-best-of-four")) {
      assert.match(source, /await pool\.resolveServer\(/, file);
      assert.match(source, /pool\.announce\(\)/, file);
      assert.doesNotMatch(source, /pool\.complete\(/, "Server results cannot be paid twice");
    } else assert.match(source, /await pool\.complete\(/, file);
    assert.doesNotMatch(source, removed, file);
  }
  const wallet = readFileSync("src\\lib\\walletSync.ts", "utf8");
  assert.match(wallet, /if \(action === "complete".*notifyGameResult\(game, body\.wagerId,/s);
});
