import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

export function scene({ win = true, reject = false } = {}) {
  const slots = [];
  const effects = [];
  const timers = new Map();
  const wagers = [];
  const notices = [];
  let cursor = 0;
  let now = 0;
  let timerId = 0;
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], next => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }];
    },
    useRef(initial) {
      const i = cursor++;
      return slots[i] ??= { current: initial };
    },
    useCallback: fn => fn,
    useEffect(fn, deps) {
      const i = cursor++;
      const prior = slots[i];
      if (!prior || deps.some((dep, index) => dep !== prior.deps[index])) {
        effects.push(() => {
          prior?.cleanup?.();
          slots[i] = { deps, cleanup: fn() };
        });
      }
    },
  };
  const schedule = (fn, delay, interval = false) => {
    const id = ++timerId;
    timers.set(id, { fn, at: now + delay, delay, interval });
    return id;
  };
  const browser = {
    setTimeout: (fn, delay) => schedule(fn, delay),
    clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => schedule(fn, delay, true),
    clearInterval: id => timers.delete(id),
  };
  const jsx = (type, props) => ({ type, props });
  const engine = { exports: {} };
  const compile = path => ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("module", "exports", compile("src\\components\\dice\\dice.ts"))(engine, engine.exports);
  const play = async (...args) => {
    wagers.push(args);
    if (reject) throw new Error("Fixture rejection");
    return { balance: 990, poolPending: false, claim: win ? 19.8 : 0, wagerId: "dice-fixture" };
  };
  const imports = {
    "./dice.css": {},
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/link": { __esModule: true, default: "a" },
    "@/lib/walletSync": { useBrowserWager: () => ({ balance: 1000, play, pending: false, error: null }) },
    "@/lib/betPresets": { BET_PRESETS: [10, 20, 50, 100, 200] },
    "@/lib/gameResultNotice": { notifyGameResult: (...args) => notices.push(args) },
    "./dice": { ...engine.exports, rollDice: () => ({ value: win ? 24.25 : 75.75, win }) },
    "./audio": { setSound() {}, sfx: new Proxy({}, { get: () => () => {} }) },
    "./useLocalStorage": { useLocalStorage: (_key, initial) => react.useState(initial) },
    "./icons": new Proxy({}, { get: () => () => null }),
  };
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "window", compile("src\\components\\dice\\DiceGame.tsx"))(
    name => { assert.ok(name in imports, name); return imports[name]; }, loaded, loaded.exports, browser,
  );
  const render = () => {
    cursor = 0;
    const tree = loaded.exports.default({});
    effects.splice(0).forEach(fn => fn());
    return tree;
  };
  function nodes(tree) {
    if (!tree || typeof tree !== "object") return [];
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    if (typeof tree.type === "function") return nodes(tree.type(tree.props));
    return [tree, ...nodes(tree.props?.children)];
  }
  const text = tree => {
    if (tree == null || typeof tree === "boolean") return "";
    if (typeof tree !== "object") return String(tree);
    if (Array.isArray(tree)) return tree.map(text).join("");
    if (typeof tree.type === "function") return text(tree.type(tree.props));
    return text(tree.props?.children);
  };
  const roll = tree => nodes(tree).find(node => node.type === "button" && /ROLL|STOP/.test(text(node)) && "disabled" in node.props);
  const advance = ms => {
    const until = now + ms;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, timer] = next;
      now = timer.at;
      if (timer.interval) timer.at += timer.delay; else timers.delete(id);
      timer.fn();
    }
    now = until;
  };
  const unmount = () => slots.forEach(slot => slot?.cleanup?.());
  return { render, nodes, text, roll, advance, wagers, notices, unmount, timers };
}

for (const win of [true, false]) {
  test(`${win ? "win" : "no win"}: animation and result review block repeat wagers without changing payout`, async () => {
    const s = scene({ win });
    s.roll(s.render()).props.onClick();
    await Promise.resolve();
    assert.deepEqual(s.wagers, [[10, win ? 19.8 : 0]]);
    s.advance(1499);
    let tree = s.render();
    assert.match(s.text(s.roll(tree)), /ROLLING/);
    assert.equal(s.notices.length, 0);
    s.roll(tree).props.onClick();
    assert.equal(s.wagers.length, 1);
    s.advance(1);
    tree = s.render();
    assert.equal(s.roll(tree).props.disabled, true);
    assert.match(s.text(tree), win ? /24.25/ : /75.75/);
    assert.match(s.text(tree), win ? /\+Rs. 9.80/ : /No win/);
    assert.deepEqual(s.notices, [["dice", "dice-fixture", win ? 19.8 : 0, false]]);
    s.advance(1799);
    tree = s.render();
    s.roll(tree).props.onClick();
    assert.equal(s.wagers.length, 1);
    assert.equal(s.roll(tree).props.disabled, true);
    s.advance(1);
    assert.equal(s.roll(s.render()).props.disabled, false);
    s.unmount();
  });
}

test("auto play waits for the complete result review before starting the next roll", async () => {
  const s = scene();
  s.nodes(s.render()).find(node => node.props?.role === "switch").props.onClick();
  s.render();
  s.advance(620);
  await Promise.resolve();
  s.render();
  assert.equal(s.wagers.length, 1);
  s.advance(1500);
  s.render();
  s.advance(1799);
  s.render();
  assert.equal(s.wagers.length, 1);
  s.advance(1);
  s.render();
  s.advance(619);
  assert.equal(s.wagers.length, 1);
  s.advance(1);
  await Promise.resolve();
  assert.equal(s.wagers.length, 2);
  s.unmount();
});

test("unmount cancels the animation and prevents a stale result notice", async () => {
  const s = scene();
  s.roll(s.render()).props.onClick();
  await Promise.resolve();
  s.unmount();
  s.advance(10000);
  assert.equal(s.notices.length, 0);
});

test("a rejected wager unlocks the controls without revealing a result", async () => {
  const s = scene({ reject: true });
  s.roll(s.render()).props.onClick();
  await Promise.resolve();
  assert.equal(s.roll(s.render()).props.disabled, false);
  assert.equal(s.notices.length, 0);
});

test("compact controls retain all presets, directions and auto-play settings", () => {
  const s = scene();
  const tree = s.render();
  const buttons = s.nodes(tree).filter(node => node.type === "button");
  for (const amount of [10, 20, 50, 100, 200]) assert.ok(buttons.some(button => s.text(button) === String(amount)));
  for (const label of ["ROLL UNDER", "ROLL OVER", "STOP ON WIN", "STOP ON NO WIN"]) {
    assert.ok(buttons.some(button => s.text(button) === label), label);
  }
  const panel = s.nodes(tree).find(node => node.type === "aside");
  assert.match(panel.props.className, /min-w-0/);
  const action = s.nodes(panel).find(node => "data-dice-roll-action" in (node.props ?? {}));
  assert.ok(s.nodes(action).includes(s.roll(tree)));
  const orderOf = node => Number(/(?:^|\s)order-(\d)/.exec(node.props.className ?? "")?.[1] ?? 0);
  const blocks = panel.props.children.filter(child => child && typeof child === "object");
  const autoBlock = blocks.find(block => s.nodes(block).some(node => node.props?.role === "switch"));
  const chanceBlock = blocks.find(block => s.nodes(block).some(node => node.props?.id === "winchance"));
  const dirBlock = blocks.find(block => s.nodes(block).some(node => s.text(node) === "ROLL UNDER"));
  assert.ok(orderOf(dirBlock) < orderOf(action) && orderOf(action) < orderOf(chanceBlock) && orderOf(action) < orderOf(autoBlock));
});
