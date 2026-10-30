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

function componentHarness(file, saved = null) {
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
    "react/jsx-runtime": { jsx: stub, jsxs: stub, Fragment: stub },
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
  (loaded.default ?? loaded.CrashGoal)();
  for (const effect of effects) {
    const cleanup = effect();
    if (typeof cleanup === "function") cleanups.push(cleanup);
  }
  return { ...env, writes, pool, unmount() { for (const cleanup of cleanups) cleanup(); }, load };
}

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
