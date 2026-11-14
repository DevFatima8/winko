import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";

const source = ts.transpileModule(readFileSync("src/lib/betPresets.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

test("Three Card Poker displays each actual denomination instead of repeating the fallback five", () => {
  const code = ts.transpileModule(readFileSync("src\\components\\three-card-poker\\ChipButton.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function("require", "exports", code)(name => {
    assert.equal(name, "react/jsx-runtime");
    return jsxRuntime;
  }, exports);
  for (const value of [10, 20, 10000, 50000]) {
    const element = exports.ChipButton({ value, selected: false, onClick() {} });
    assert.ok(renderToStaticMarkup(element).includes(`>${value}</span>`), `Chip ${value} must display its own value`);
    assert.ok(renderToStaticMarkup(exports.MiniChip({ value })).includes(`>${value}</span>`));
  }
});

test("Hotline presets and typed amounts submit exactly, without stake adjusters or balance clamping", async () => {
  const states = [], refs = [], calls = [];
  let stateIndex = 0, refIndex = 0, walletBalance = 1000, release;
  const code = ts.transpileModule(readFileSync("src\\components\\hotline\\HotlineGame.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  const pool = {
    start: async amount => {
      calls.push(amount);
      if (release === "defer") return new Promise(resolve => { release = resolve; });
      return false;
    },
  };
  new Function("require", "exports", code)(name => {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "@/lib/betPresets") return { BET_PRESETS: [10, 20, 50, 100, 200] };
    if (name === "@/lib/gameAudio") return { playGameSound() {}, speakGameVoice() {} };
    if (name === "@/lib/walletSync") return {
      useGameBalance: () => [walletBalance],
      usePoolLifecycle: () => pool,
    };
    assert.equal(name, "react");
    return {
      useState(initial) {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
      },
      useRef(initial) {
        const index = refIndex++;
        return refs[index] ??= { current: initial };
      },
      useEffect() {},
      useCallback: fn => fn,
    };
  }, exports);
  const text = node => Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object" ? text(node.props?.children) : node == null || typeof node === "boolean" ? "" : String(node);
  const render = () => {
    stateIndex = 0;
    refIndex = 0;
    const nodes = [];
    const visit = node => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== "object") return;
      nodes.push(node);
      visit(node.props?.children);
    };
    visit(exports.default());
    return nodes;
  };
  const input = () => render().find(node => node.props?.["aria-label"] === "Custom bet amount");
  const preset = amount => render().find(node => node.type === "button" && node.props.children === amount);
  const bet = color => render().find(node => node.type === "button" && text(node).includes(`BET ${color}`));
  assert.ok(!render().some(node => node.type === "button" && ["-50", "-10", "+10", "+50", "+200", "2X", "½"].includes(text(node).trim())));
  assert.ok(!render().some(node => node.type === "span" && text(node) === "STAKE:"));
  for (const [amount, color] of [[20, "RED"], [200, "BLACK"], [50, "FIRE"]]) {
    preset(amount).props.onClick();
    assert.equal(input().props.value, amount);
    await bet(color).props.onClick();
    assert.equal(calls.at(-1), amount);
  }
  input().props.onChange({ target: { value: "125.75" } });
  input().props.onBlur?.();
  await bet("RED").props.onClick();
  assert.equal(calls.at(-1), 125.75);
  const acceptedCount = calls.length;
  walletBalance = 75;
  preset(200).props.onClick();
  input().props.onBlur?.();
  assert.equal(input().props.value, 200);
  assert.equal(bet("RED").props.disabled, true);
  assert.ok(render().some(node => node.props?.role === "alert" && /Insufficient balance/.test(text(node))));
  for (const value of ["", "5", "20.005", "200"]) {
    input().props.onChange({ target: { value } });
    assert.equal(bet("RED").props.disabled, true);
    await bet("RED").props.onClick();
  }
  assert.equal(calls.length, acceptedCount);
  preset(20).props.onClick();
  release = "defer";
  const pending = bet("RED").props.onClick();
  assert.equal(input().props.disabled, true);
  assert.equal(preset(50).props.disabled, true);
  assert.equal(bet("BLACK").props.disabled, true);
  preset(50).props.onClick();
  assert.equal(input().props.value, 20);
  release(false);
  await pending;
  assert.equal(input().props.disabled, false);
});

test("Dragon Tiger chips update Set amount, custom typing clears leading zeroes, and Rebet is hidden only there", () => {
  const text = readFileSync("src\\components\\CardTable.tsx", "utf8");
  const start = text.indexOf('<div className="flex flex-wrap items-center gap-1.5">', text.indexOf("{/* chips + actions */}"));
  const end = text.indexOf('<div className="mt-1.5 flex items-center justify-between', start);
  assert.ok(start >= 0 && end > start);
  const code = ts.transpileModule(`export function controls(p) {
    const { table, chip, customAmount, dragonAmountText, setChip, setCustomAmount, setDragonAmountText } = p;
    const CHIPS = [10, 20, 50, 100, 200], st = { config: { max: 50000 }, myTotal: 0 };
    const inBetting = true, busy = false, lastBetsRef = { current: [] };
    const rebet = () => {}, cancel = () => {}, setMsg = () => {};
    return (${text.slice(start, end).trim()});
  }`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(() => jsxRuntime, module, module.exports);
  for (const table of ["dragon-tiger", "andar-bahar"]) {
    const state = { table, chip: 10, customAmount: 10, dragonAmountText: "10" };
    const props = {
      ...state,
      setChip: value => { state.chip = value; },
      setCustomAmount: value => { state.customAmount = value; },
      setDragonAmountText: value => { state.dragonAmountText = value; },
    };
    const elements = () => {
      const nodes = [];
      const walk = node => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== "object") return;
        nodes.push(node);
        walk(node.props?.children);
      };
      walk(module.exports.controls({ ...props, ...state }));
      return nodes;
    };
    const button = label => elements().find(node => node.type === "button" && node.props.children === label);
    for (const amount of [10, 20, 50, 100, 200]) {
      button(amount).props.onClick();
      assert.equal(state.chip, amount);
      assert.equal(elements().find(node => node.type === "input").props.value, table === "dragon-tiger" ? String(amount) : 10);
    }
    assert.equal(Boolean(button("Rebet")), table !== "dragon-tiger");
    if (table === "dragon-tiger") {
      const input = () => elements().find(node => node.type === "input");
      input().props.onChange({ target: { value: "" } });
      assert.equal(input().props.value, "");
      input().props.onChange({ target: { value: "050" } });
      assert.equal(input().props.value, "50");
      button("Set").props.onClick();
      assert.equal(state.chip, 50);
      input().props.onChange({ target: { value: "" } });
      input().props.onBlur();
      assert.equal(input().props.value, "10");
    }
  }
});

function createStore(seed = []) {
  const values = new Map(seed);
  const window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
    },
  };
  const loaded = { exports: {} };
  new Function("module", "exports", "window", "CustomEvent", source)(
    loaded,
    loaded.exports,
    window,
    class CustomEvent { constructor(type) { this.type = type; } },
  );
  return { api: loaded.exports, values };
}

test("bet presets default to five requested amounts and reject invalid values", () => {
  const { api } = createStore();
  assert.deepEqual([...api.BET_PRESETS], [10, 20, 50, 100, 200]);
  assert.deepEqual(api.normalizeBetPresets([10, 20.5, 30, 40, 50000]), [10, 20.5, 30, 40, 50000]);
  assert.equal(api.normalizeBetPresets([5, 10, 20, 50, 100]), null);
  for (const invalid of [[1, 2, 3], [1, 2, 3, 4, 4], [0, 2, 3, 4, 5], [1, 2, 3, 4, 50000.01], [1, 2, 3, 4, 1.005], [true, 2, 3, 4, 5]]) {
    assert.equal(api.normalizeBetPresets(invalid), null);
  }
});

test("saved bet presets are scoped per player and update existing shared preset references", () => {
  const { api, values } = createStore();
  const shared = api.BET_PRESETS;
  api.saveBetPresets("player-a", [10, 25, 75, 100, 500]);
  assert.deepEqual([...shared], [10, 25, 75, 100, 500]);
  assert.equal(values.get("wx:active-bet-preset-user"), "player-a");
  assert.deepEqual(JSON.parse(values.get("wx:bet-presets:player-a")), [10, 25, 75, 100, 500]);
  assert.equal(api.activateBetPresets("player-b", [10, 20, 50, 100, 200]), false);
  assert.deepEqual([...shared], [10, 20, 50, 100, 200]);
  api.activateBetPresets("player-a", [10, 25, 75, 100, 500]);
  assert.deepEqual([...shared], [10, 25, 75, 100, 500]);
});

test("stored player amounts are loaded when the game preset module initializes", () => {
  const seed = [
    ["wx:active-bet-preset-user", "player-a"],
    ["wx:bet-presets:player-a", JSON.stringify([10, 25, 75, 100, 500])],
  ];
  const { api } = createStore(seed);
  assert.deepEqual([...api.BET_PRESETS], [10, 25, 75, 100, 500]);
  assert.equal(api.activateBetPresets("player-a", [10, 25, 75, 100, 500]), false);
});

test("separate bet settings page retains existing amounts and saves without reloading or promising API support", async () => {
  const { api, values } = createStore();
  const state = [];
  let index = 0;
  let managePlayer = false;
  const code = ts.transpileModule(readFileSync("src\\app\\player\\profile\\bet-amounts\\Client.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(name => {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "next/link") return { default: "a" };
    if (name === "@/lib/betPresets") return api;
    if (name === "@/lib/useDb") return {};
    assert.equal(name, "react");
    return { useState: initial => {
      const key = index++;
      if (!(key in state)) state[key] = typeof initial === "function" ? initial() : initial;
      return [state[key], value => { state[key] = typeof value === "function" ? value(state[key]) : value; }];
    } };
  }, loaded, loaded.exports);
  const nodes = () => {
    index = 0;
    const result = [];
    const visit = node => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== "object") return;
      result.push(node);
      visit(node.props?.children);
    };
    visit(loaded.exports.BetPresetSettings({ userId: "settings-player", initial: [10000, 20, 50, 100, 200], managePlayer }));
    return result;
  };
  const inputs = () => nodes().filter(node => node.type === "input");
  assert.deepEqual(inputs().map(node => node.props.value), ["10000", "20", "50", "100", "200"]);
  inputs()[0].props.onChange({ target: { value: "500" } });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "/api/player/bet-presets");
    assert.deepEqual(JSON.parse(init.body).betPresets, [500, 20, 50, 100, 200]);
    return new Response(JSON.stringify({ betPresets: [500, 20, 50, 100, 200] }));
  };
  try {
    await nodes().find(node => node.type === "button").props.onClick();
    assert.deepEqual(JSON.parse(values.get("wx:bet-presets:settings-player")), [500, 20, 50, 100, 200]);
    assert.equal(nodes().find(node => node.props?.role === "status").props.children, "Bet amounts saved.");
    assert.match(renderToStaticMarkup(loaded.exports.BetPresetSettings({ userId: "settings-player" })), /these settings do not change them/);
    inputs()[0].props.onChange({ target: { value: "5" } });
    assert.equal(nodes().find(node => node.type === "button").props.disabled, true);
    managePlayer = true;
    inputs()[0].props.onChange({ target: { value: "1000" } });
    const before = [...values];
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "/api/admin/bet-presets");
      assert.deepEqual(JSON.parse(init.body), { userId: "settings-player", betPresets: [1000, 20, 50, 100, 200] });
      return Response.json({ betPresets: [1000, 20, 50, 100, 200] });
    };
    await nodes().find(node => node.type === "button").props.onClick();
    assert.deepEqual([...values], before, "admin saves must not activate a player's presets in the staff browser");
  } finally {
    globalThis.fetch = oldFetch;
  }
  assert.match(readFileSync("src\\app\\player\\profile\\Client.tsx", "utf8"), /href: "\/player\/profile\/bet-amounts"/);
  assert.doesNotMatch(readFileSync("src\\app\\player\\profile\\bet-amounts\\Client.tsx", "utf8"), /location\.reload|Used in every game/);
});

test("Rummy chips render default, saved and legacy amounts without missing labels or colors", () => {
  const path = "src\\components\\rummy\\RummyGame.tsx";
  const text = readFileSync(path, "utf8");
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = file.statements.filter(statement =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === "Chip" ||
    ts.isVariableStatement(statement) && statement.declarationList.declarations.some(
      declaration => ts.isIdentifier(declaration.name) && ["CHIP_COLORS", "CHIP_LABEL"].includes(declaration.name.text),
    ),
  ).map(statement => statement.getText(file)).join("\n");
  const code = ts.transpileModule(`${declarations}\nexport { Chip };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(name => {
    assert.equal(name, "react/jsx-runtime");
    return jsxRuntime;
  }, loaded, loaded.exports);
  const { api } = createStore();
  const defaults = [...api.BET_PRESETS];
  api.saveBetPresets("rummy-player", [10, 20.5, 75, 250, 50000]);
  for (const value of new Set([...defaults, ...api.BET_PRESETS, 500, 1000])) {
    const markup = renderToStaticMarkup(createElement(loaded.exports.Chip, { value, onClick() {} }));
    const expected = value === 1000 ? "1K" : String(value);
    assert.match(markup, new RegExp(`>${expected.replace(".", "\\.")}</text>`));
    assert.match(markup, /<circle[^>]+fill="#[0-9a-f]{6}"/);
    assert.ok(!markup.includes("undefined"), markup);
  }
});
