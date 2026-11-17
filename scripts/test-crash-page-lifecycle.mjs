import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

function environment() {
  let nextId = 0;
  const frames = new Map(), timers = new Map(), contexts = [];
  function events() {
    const handlers = new Map();
    return {
      addEventListener(name, handler) {
        if (!handlers.has(name)) handlers.set(name, new Set());
        handlers.get(name).add(handler);
      },
      removeEventListener(name, handler) { handlers.get(name)?.delete(handler); },
      emit(name) { for (const handler of [...handlers.get(name) ?? []]) handler(); },
      count() { return [...handlers.values()].reduce((total, set) => total + set.size, 0); },
    };
  }
  class AudioContext {
    state = "running";
    currentTime = 0;
    destination = {};
    oscillators = [];
    constructor() { contexts.push(this); }
    resume() { this.state = "running"; return Promise.resolve(); }
    close() { this.state = "closed"; return Promise.resolve(); }
    createOscillator() {
      const parameter = { setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} };
      const oscillator = { frequency: parameter, stopped: false,
        connect(node) { return node; }, disconnect() {}, start() {},
        stop() { this.stopped = true; } };
      this.oscillators.push(oscillator);
      return oscillator;
    }
    createGain() {
      return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} },
        connect(node) { return node; }, disconnect() {} };
    }
  }
  const document = { ...events(), hidden: false };
  const window = { ...events(), AudioContext,
    requestAnimationFrame(fn) { frames.set(++nextId, fn); return nextId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(fn) { timers.set(++nextId, fn); return nextId; },
    clearTimeout(id) { timers.delete(id); } };
  return { window, document, frames, timers, contexts,
    frame(now = 0) {
      const batch = [...frames.values()];
      frames.clear();
      for (const fn of batch) fn(now);
    },
    visible(value) { document.hidden = !value; document.emit("visibilitychange"); } };
}

function loader(env, overrides = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const source = readFileSync(file, "utf8");
    const output = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020,
    } }).outputText;
    const loaded = { exports: {} };
    const require = name => {
      if (name in overrides) return overrides[name];
      if (name === "@/lib/visibleAnimationFrame") return load("src\\lib\\visibleAnimationFrame.ts");
      if (name === "@/lib/gameSfx") return load("src\\lib\\gameSfx.ts");
      if (name === "@/lib/crashCashoutLimit") return load("src\\lib\\crashCashoutLimit.ts");
      if (name === "@/lib/gameBetLimits") return load("src\\lib\\gameBetLimits.ts");
      if (name === "./lib/soundEngine") return load("src\\components\\crash-cricket\\lib\\soundEngine.ts");
      if (name.endsWith(".css")) return {};
      if (name.startsWith(".")) return load(path.join(path.dirname(file), name + ".ts"));
      throw new Error(`Unexpected import: ${name}`);
    };
    new Function("require", "module", "exports", "window", "document", "performance",
      "setTimeout", "clearTimeout", output)(
      require, loaded, loaded.exports, env.window, env.document, { now: () => 0 },
      env.window.setTimeout, env.window.clearTimeout,
    );
    cache.set(file, loaded.exports);
    return loaded.exports;
  }
  return load;
}

test("visible frames stop while hidden, resume with real timestamps and clean up on navigation", () => {
  const env = environment();
  const { visibleAnimationFrame } = loader(env)("src\\lib\\visibleAnimationFrame.ts");
  const timestamps = [];
  const stop = visibleAnimationFrame(now => { timestamps.push(now); });
  env.frame(20);
  assert.deepEqual(timestamps, [20]);
  env.visible(false);
  assert.equal(env.frames.size, 0);
  env.frame(30);
  assert.deepEqual(timestamps, [20]);
  env.visible(true);
  env.frame(10000);
  assert.deepEqual(timestamps, [20, 10000]);
  const stale = [...env.frames.values()][0];
  stop();
  stale(11000);
  env.visible(false);
  env.visible(true);
  env.window.emit("pageshow");
  assert.equal(env.frames.size, 0);
  assert.equal(env.document.count() + env.window.count(), 0);
  assert.deepEqual(timestamps, [20, 10000]);
});

test("pagehide suspends frames and pageshow resumes without duplicate frames", () => {
  const env = environment();
  const { visibleAnimationFrame } = loader(env)("src\\lib\\visibleAnimationFrame.ts");
  const stop = visibleAnimationFrame(() => {});
  env.window.emit("pagehide");
  assert.equal(env.frames.size, 0);
  env.document.emit("visibilitychange");
  assert.equal(env.frames.size, 0);
  env.window.emit("pageshow");
  env.window.emit("pageshow");
  assert.equal(env.frames.size, 1);
  stop();
});

test("completed and initially hidden loops do not accidentally restart", () => {
  const env = environment();
  env.visible(false);
  const { visibleAnimationFrame } = loader(env)("src\\lib\\visibleAnimationFrame.ts");
  let calls = 0;
  const stop = visibleAnimationFrame(() => { calls++; return false; });
  assert.equal(env.frames.size, 0);
  env.visible(true);
  env.frame();
  env.visible(false);
  env.visible(true);
  assert.equal(calls, 1);
  assert.equal(env.frames.size, 0);
  stop();
});

test("cricket releases continuous and queued audio on departure and blocks late sounds", () => {
  const env = environment();
  const { soundEngine } = loader(env)("src\\components\\crash-cricket\\lib\\soundEngine.ts");
  soundEngine.startFlightSound();
  assert.equal(env.contexts.length, 0);
  soundEngine.setActive(true);
  soundEngine.startFlightSound();
  const context = env.contexts[0];
  assert.equal(context.oscillators[0].stopped, false);
  soundEngine.setActive(false);
  assert.equal(context.oscillators[0].stopped, true);
  assert.equal(context.state, "closed");
  soundEngine.playClick();
  soundEngine.startFlightSound();
  assert.equal(env.contexts.length, 1);
  soundEngine.setActive(true);
  env.visible(false);
  soundEngine.startFlightSound();
  assert.equal(env.contexts.length, 1);
  env.visible(true);
  soundEngine.setMuted(true);
  soundEngine.startFlightSound();
  assert.equal(env.contexts.length, 1);
  soundEngine.setMuted(false);
  soundEngine.startFlightSound();
  assert.equal(env.contexts.length, 2);
  soundEngine.setActive(false);
});

test("shared crash effects close queued tones and remain silent on a hidden page", () => {
  const env = environment();
  const { gameSfx } = loader(env)("src\\lib\\gameSfx.ts");
  gameSfx.win();
  assert.equal(env.contexts[0].oscillators.length, 5);
  gameSfx.stop();
  assert.equal(env.contexts[0].state, "closed");
  gameSfx.stop();
  env.visible(false);
  gameSfx.go();
  assert.equal(env.contexts.length, 1);
  env.visible(true);
  gameSfx.go();
  assert.equal(env.contexts.length, 2);
  gameSfx.stop();
});

function componentHarness(file, saved = null, captureTree = false) {
  const env = environment(), effects = [], cleanups = [], writes = [];
  const react = {
    useState(value) { return [typeof value === "function" ? value() : value, () => {}]; },
    useRef(current) { return { current }; },
    useEffect(fn) { effects.push(fn); },
    useCallback(fn) { return fn; },
    useMemo(fn) { return fn(); },
  };
  const pool = { busy: false, enabled: true, checkpoint() {},
    start: async amount => { writes.push(["start", amount]); return true; },
    complete: async amount => { writes.push(["complete", amount]); return true; } };
  const stub = () => null;
  const load = loader(env, {
    react: { ...react, default: react },
    "react/jsx-runtime": captureTree
      ? { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: stub }
      : { jsx: stub, jsxs: stub, Fragment: stub },
    "@/lib/walletSync": { useGameBalance: () => [1000, () => {}], usePoolLifecycle: () => pool,
      usePoolRoundState: (_game, key, initial) => [key === "machine" ? saved : initial, () => {}] },
    "@/lib/betPresets": { BET_PRESETS: [10, 20, 50, 100, 200] },
    "../blast-off/useRoundQueue": { useRoundQueue: () => ({ consume: () => null, setStatus() {} }) },
    "./lib/crashEngine": { generateInitialHistory: () => [], generateSimulatedBetsForRound: () => [] },
    "./lib/crash": { formatMoney: String, formatMultiplier: String },
    "./lib/players": { createRoster: () => [], randomRoundId: () => "1" },
    "./TopBar": { TopBar: stub }, "./Sidebar": { Sidebar: stub }, "./Stadium": { Stadium: stub },
    "./SoccerBall": { SoccerBall: stub, MiniBall: stub }, "./BetPanel": { BetPanel: stub, EdgeButton: stub },
    "./CricketFlightCanvas": { __esModule: true, default: stub },
    "./BetControlPanel": { __esModule: true, default: stub },
    "./LiveBetsSidebar": { __esModule: true, default: stub },
    "lucide-react": new Proxy({}, { get: () => stub }),
  });
  const loaded = load(file);
  const tree = (loaded.default ?? loaded.CrashGoal)();
  for (const effect of effects) {
    const cleanup = effect();
    if (typeof cleanup === "function") cleanups.push(cleanup);
  }
  return { ...env, writes, pool, tree, unmount() { for (const cleanup of cleanups) cleanup(); }, load };
}

test("Crash Goal sends the selected stake and ignores changes while it is being accepted", async () => {
  const env = componentHarness("src\\components\\crash-goal\\CrashGoal.tsx", null, true);
  const nodes = [];
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    nodes.push(node);
    visit(node.props?.children);
  };
  visit(env.tree);
  const panel = nodes.find(node => node.props?.onAmountChange && node.props?.onPrimaryAction);
  assert.ok(panel);
  let machine;
  env.pool.checkpoint = saved => { machine = saved.machine; };
  panel.props.onAmountChange(200);
  let finish;
  env.pool.start = amount => {
    env.writes.push(["start", amount]);
    env.pool.busy = true;
    return new Promise(resolve => { finish = resolve; });
  };
  const pending = panel.props.onPrimaryAction();
  panel.props.onAmountChange(50);
  env.pool.busy = false;
  finish(true);
  await pending;
  assert.deepEqual(env.writes, [["start", 200]]);
  assert.equal(machine.slots[0].amount, 200);
  env.unmount();
});

for (const [game, file] of [
  ["bonus", "src\\components\\crash-bonus\\CrashGame.tsx"],
  ["goal", "src\\components\\crash-goal\\CrashGoal.tsx"],
  ["cricket", "src\\components\\crash-cricket\\CrashCricketApp.tsx"],
]) {
  test(`${game} cancels local frames and audio on page exit without touching wagers`, () => {
    const env = componentHarness(file);
    assert.ok(env.frames.size > 0);
    if (game === "cricket") {
      env.load("src\\components\\crash-cricket\\lib\\soundEngine.ts").soundEngine.startFlightSound();
    } else env.load("src\\lib\\gameSfx.ts").gameSfx.go();
    assert.equal(env.contexts.length, 1);
    env.visible(false);
    assert.equal(env.contexts[0].state, "closed");
    assert.equal(env.frames.size, 0);
    env.visible(true);
    assert.ok(env.frames.size > 0);
    env.unmount();
    env.window.emit("pageshow");
    env.visible(false);
    env.visible(true);
    assert.equal(env.frames.size, 0);
    assert.equal(env.document.count() + env.window.count(), 0);
    assert.deepEqual(env.writes, []);
  });
}

test("cricket resumes flight audio only for an active visible in-flight page", () => {
  const env = componentHarness("src\\components\\crash-cricket\\CrashCricketApp.tsx", {
    phase: "IN_FLIGHT", started: Date.now(), roundId: 1,
    panel1: {}, panel2: {}, target: { crashPoint: 2 },
  });
  assert.equal(env.contexts.length, 1);
  env.visible(false);
  assert.equal(env.contexts[0].state, "closed");
  env.visible(true);
  assert.equal(env.contexts.length, 2);
  env.unmount();
  assert.equal(env.contexts[1].state, "closed");
  const engine = env.load("src\\components\\crash-cricket\\lib\\soundEngine.ts").soundEngine;
  engine.startFlightSound();
  assert.equal(env.contexts.length, 2);
});

test("leaving while cricket settles a round cannot start a queued or automatic bet afterwards", async () => {
  const env = componentHarness("src\\components\\crash-cricket\\CrashCricketApp.tsx", {
    phase: "CRASHED", started: Date.now(), roundId: 1,
    panel1: { isBetPlaced: true, cashedOutAt: null, autoBet: true, stake: 100 },
    panel2: {}, target: { crashPoint: 2 },
  });
  let finishSettlement, completions = 0;
  env.pool.complete = () => {
    completions++;
    return new Promise(resolve => { finishSettlement = resolve; });
  };
  env.frame(3201);
  assert.equal(completions, 1);
  env.unmount();
  finishSettlement(true);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(env.writes, []);
  assert.equal(env.frames.size, 0);
  assert.equal(env.timers.size, 0);
});

test("Blast Off advances on every frame between live samples, smooths resync and freezes at crash", () => {
  let now = 0, nextId = 0;
  const frames = new Map(), cleanups = [], rendered = [], resizeObservers = [];
  const handle = { current: null };
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({
    createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    measureText: () => ({ width: 40 }),
  }, { get: (obj, key) => obj[key] ?? (() => {}) });
  const canvas = { width: 800, height: 500, getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 800, height: 500 }) };
  let refIndex = 0;
  const react = {
    useRef: value => ({ current: refIndex++ === 0 ? canvas : value }),
    useImperativeHandle: (ref, factory) => { ref.current = factory(); },
    useEffect: effect => { cleanups.push(effect()); },
    forwardRef: fn => fn,
  };
  const file = "src\\components\\blast-off\\FlightDeck.tsx";
  let source = readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const render = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "render");
  const at = render.body.statements[0].getStart(ast);
  source = source.slice(0, at) + "__capture(s);\n" + source.slice(at);
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  const loaded = { exports: {} };
  const blastRules = loader(environment())("src\\lib\\blastOffRules.ts");
  new Function("require", "module", "exports", "window", "performance", "Image", "ResizeObserver",
    "requestAnimationFrame", "cancelAnimationFrame", "__capture", output)(
    name => {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx: () => null };
      if (name === "@/lib/blastOffRules") return blastRules;
      throw new Error(`Unexpected FlightDeck dependency: ${name}`);
    }, loaded, loaded.exports, { devicePixelRatio: 1 }, { now: () => now },
    class { complete = false; },
    class { constructor() { resizeObservers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
    fn => { frames.set(++nextId, fn); return nextId; }, id => frames.delete(id),
    state => rendered.push({ ...state }),
  );
  loaded.exports.default({ reduced: false }, handle);
  const sample = (phase, t, multiplier = Math.exp(0.155 * t), maxMultiplier) => {
    handle.current.draw({ phase, t, multiplier, crashPoint: multiplier, countdown: 0, betPlaced: true, maxMultiplier });
  };
  const frame = time => {
    now = time;
    const batch = [...frames.values()];
    frames.clear();
    for (const fn of batch) fn(now);
    return rendered.at(-1);
  };
  sample("flying", 0);
  let previous = 0;
  for (const time of [16, 32, 48, 64, 80]) {
    const current = frame(time);
    assert.ok(current.t > previous, "Every frame must advance even without another transport sample");
    assert.ok(Math.abs(current.t - time / 1000) < 1e-9);
    assert.equal(current.multiplier, Math.exp(0.155 * current.t));
    previous = current.t;
  }
  sample("flying", 0.02);
  for (const time of [96, 112, 128, 144]) {
    const current = frame(time);
    assert.ok(current.t > previous, "A backward clock correction must not freeze or reverse the plane");
    assert.ok(current.t - previous < 0.017);
    previous = current.t;
  }
  const capped = frame(60000);
  assert.equal(capped.t, Math.log(99.99) / 0.155, "Stale transport must not move the curve to 100x");
  assert.ok(Math.abs(capped.multiplier - 99.99) < 1e-10);
  assert.ok(capped.multiplier < 100);
  sample("crashed", 0.1, 1.02);
  assert.equal(frame(60016).t, 0.1);
  assert.equal(frame(60500).multiplier, 1.02);
  sample("betting", 0, 1);
  assert.equal(frame(60516).t, 0);
  sample("flying", 0);
  assert.ok(Math.abs(frame(60532).t - 0.016) < 1e-9, "A new round resets the flight clock");
  sample("betting", 0, 1);
  frame(60548);
  sample("flying", 0, 1, 250.01);
  assert.ok(Math.abs(frame(120000).multiplier - 250.01) < 1e-10, "Only a previously accepted flight keeps its old display cap");
  for (const cleanup of cleanups) cleanup();
  assert.equal(frames.size, 0);
  assert.ok(resizeObservers.every(observer => observer.disconnected));
});

test("crash rounds end once 20% of the round's players have cashed out", () => {
  const source = readFileSync(path.resolve("src/lib/crashCashoutLimit.ts"), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} };
  new Function("module", "exports", output)(loaded, loaded.exports);
  const { cashoutLimitReached, CASHOUT_CRASH_SHARE } = loaded.exports;
  assert.equal(CASHOUT_CRASH_SHARE, 0.2);
  assert.equal(cashoutLimitReached(0, 0), false);
  assert.equal(cashoutLimitReached(3, 20), false);
  assert.equal(cashoutLimitReached(4, 20), true);
  assert.equal(cashoutLimitReached(2, 11), false);
  assert.equal(cashoutLimitReached(3, 11), true);
  assert.equal(cashoutLimitReached(9, 20), true);
});
