import assert from "node:assert/strict";
import { legacyBrowserPool } from "./browser-pool-legacy-stub.mjs";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import ts from "typescript";

// Execute the real component hooks/state machines with virtual browser time and
// an in-memory wallet. JSX children, drawing and audio are deliberately inert.
const root = path.resolve("src", "components");
// Server-backed Blast Off and Nine Wickets are exercised against their actual
// shared components/hook in test-multiplayer-dice-crash.mjs.
const specs = [
  ["crash-bonus/CrashGame.tsx", "CrashGame", "phase, bet, balance, placeBet, myRounds, stats, queue"],
  ["crash-cricket/CrashCricketApp.tsx", "CrashCricketApp", "phase, panel1, panel2, balance, handlePlaceOrQueueBet, handleCancelBet, userBetHistory"],
  ["crash-goal/CrashGoal.tsx", "CrashGoal", "phase, slots, balance, primaryAction, myHistory, stats, queue"],
  ["race-betting/RaceBettingGame.tsx", "Race20GamePage", "phase, activeBets, balance, handlePlaceBet, history, stats, queue"],
  ["birds-beasts/BirdsBeasts.tsx", "BirdsBeasts", "phase, bets, balance, placeBet, history, queue"],
  ["derby-race/DerbyRaceApp.tsx", "HomePage", "phase, bet, balance, primaryAction, completeRace, planRef, history, queue"],
];

function scene(spec) {
  let cursor = 0, dirty = false, now = 0, nextId = 0, probe;
  const slots = [], effects = [], timers = new Map(), listeners = new Map(), cache = new Map();
  const writes = [], requests = [];
  let funds = 5000, walletSetter;
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const hooks = {
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) {
        slots[i] = { value: typeof initial === "function" ? initial() : initial };
        slots[i].set = (value) => {
          const next = typeof value === "function" ? value(slots[i].value) : value;
          if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true; }
        };
      }
      return [slots[i].value, slots[i].set];
    },
    useRef(value) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { current: value };
      return slots[i];
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (changed(slots[i]?.deps, deps)) effects.push(() => {
        slots[i]?.cleanup?.();
        slots[i] = { deps, cleanup: fn() };
      });
    },
    useMemo(fn, deps) {
      const i = cursor++;
      if (changed(slots[i]?.deps, deps)) slots[i] = { value: fn(), deps };
      return slots[i].value;
    },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    forwardRef: (fn) => fn,
  };
  hooks.default = hooks;
  const noop = new Proxy(() => false, { get: () => noop });
  const schedule = (fn, delay = 0, interval = 0) => {
    const id = ++nextId;
    timers.set(id, { at: now + Math.max(1, delay), fn, interval });
    return id;
  };
  const storage = new Map();
  const windowMock = {
    requestAnimationFrame: (fn) => schedule(() => fn(now), 16),
    cancelAnimationFrame: (id) => timers.delete(id),
    setTimeout: (fn, ms) => schedule(fn, ms),
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn, ms) => schedule(fn, ms, ms),
    clearInterval: (id) => timers.delete(id),
    addEventListener: (name, fn) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
    },
    removeEventListener: (name, fn) => listeners.get(name)?.delete(fn),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  };
  const original = new Map();
  const replace = (key, value) => {
    original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  };
  for (const [key, value] of Object.entries({
    window: windowMock, localStorage: windowMock.localStorage,
    setTimeout: windowMock.setTimeout, clearTimeout: windowMock.clearTimeout,
    setInterval: windowMock.setInterval, clearInterval: windowMock.clearInterval,
    requestAnimationFrame: (fn) => schedule(() => fn(now), 16),
    cancelAnimationFrame: (id) => timers.delete(id),
    performance: { now: () => now },
    document: { addEventListener() {}, removeEventListener() {} },
    fetch: async (...args) => {
      requests.push(args);
      return { ok: true, json: async () => ({ slot: 0 }) };
    },
    alert: () => {},
  })) replace(key, value);
  const realDateNow = Date.now;
  Date.now = () => 1800000000000 + now;
  const wallet = {
    ...legacyBrowserPool({
      useState: hooks.useState,
      balance: () => funds,
      update: value => { writes.push(value - funds); funds = value; walletSetter(value); },
      resolve: async (_game, _stake, selection) => {
        const response = await fetch("/fixture", { body: JSON.stringify(selection) });
        return { outcome: await response.json(), claim: 0 };
      },
    }),
    useGameBalance() {
      const [balance, set] = hooks.useState(funds);
      walletSetter = set;
      const commit = hooks.useCallback((value) => {
        const next = typeof value === "function" ? value(funds) : value;
        writes.push(next - funds);
        funds = next;
        set(next);
      }, []);
      return [balance, commit];
    },
    getStoredWalletBalance: () => funds,
    reportGameBalanceChange: (_game, delta, balance) => { writes.push(delta); funds = balance; },
  };
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = { exports: {} };
    cache.set(filename, loaded);
    let source = readFileSync(filename, "utf8");
    const isMain = filename === path.resolve(root, spec[0]);
    const transformer = (context) => (file) => {
      function visit(node) {
        if (isMain && ts.isFunctionDeclaration(node) && node.name?.text === spec[1]) {
          const expose = ts.factory.createExpressionStatement(ts.factory.createBinaryExpression(
            ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier("globalThis"), "__roundProbe"),
            ts.SyntaxKind.EqualsToken,
            ts.factory.createObjectLiteralExpression(spec[2].split(",").map((name) => ts.factory.createShorthandPropertyAssignment(name.trim()))),
          ));
          return ts.factory.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type,
            ts.factory.updateBlock(node.body, node.body.statements.flatMap((statement) => ts.isReturnStatement(statement) ? [expose, statement] : [statement])));
        }
        return ts.visitEachChild(node, visit, context);
      }
      return ts.visitNode(file, visit);
    };
    source = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      transformers: { before: [transformer] },
    }).outputText;
    const require = (name) => {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name === "@/lib/walletSync") return wallet;
      if (name === "@/lib/gameResultNotice") return { notifyGameResult: () => {} };
      if (name === "@/lib/visibleAnimationFrame") return load(path.resolve("src", "lib", "visibleAnimationFrame.ts"));
      if (name === "@/lib/crashCashoutLimit") return load(path.resolve("src", "lib", "crashCashoutLimit.ts"));
      if (name === "@/lib/betPresets") return { BET_PRESETS: [100, 500, 1000] };
      if (name === "@/components/BetAmountInput") return noop;
      if (name.endsWith(".css") || name === "next/link" || name === "lucide-react" || name === "canvas-confetti" || /sound|audio|gameSfx/i.test(name)) {
        if (name.includes("useSounds")) return { useSounds: () => noop };
        return noop;
      }
      assert.ok(name.startsWith("."), `Unexpected external import ${name}`);
      const base = path.resolve(path.dirname(filename), name);
      const resolved = [base, `${base}.ts`, `${base}.tsx`].find((candidate) => existsSync(candidate));
      assert.ok(resolved, name);
      return load(resolved);
    };
    new Function("require", "module", "exports", source)(require, loaded, loaded.exports);
    return loaded.exports;
  }
  const exports = load(path.resolve(root, spec[0]));
  const Component = exports.default ?? exports.CrashGoal;
  function flush() {
    let turns = 0;
    do {
      assert.ok(++turns < 100, "Component must stabilize");
      dirty = false; cursor = 0;
      Component({});
      probe = globalThis.__roundProbe;
      while (effects.length) effects.shift()();
    } while (dirty);
  }
  flush();
  const api = {
    get probe() { return probe; }, writes, requests,
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        let id, task;
        for (const [candidateId, candidate] of timers) if (candidate.at <= end && (!task || candidate.at < task.at)) { id = candidateId; task = candidate; }
        if (!task) break;
        now = task.at;
        if (task.interval) task.at += task.interval;
        else timers.delete(id);
        task.fn();
        await Promise.resolve(); await Promise.resolve();
        flush();
      }
      now = end;
      await Promise.resolve(); await Promise.resolve();
      flush();
    },
    async until(predicate) {
      for (let i = 0; i < 1600; i++) {
        if (predicate()) return;
        await api.advance(250);
      }
      assert.fail(`Round did not progress: ${api.phase()}`);
    },
    phase() { return probe?.engineRef?.current.phase ?? probe?.phase ?? "loading"; },
    open() { return /^(betting|BETTING|idle)$/.test(api.phase()); },
    bet() {
      if (probe.engineRef) return probe.engineRef.current.bet;
      if (probe.panel1) return probe.panel1.isBetPlaced;
      if (probe.slots) return probe.slots.some((slot) => slot.placed);
      if (probe.activeBets) return probe.activeBets.length > 0;
      if (probe.bets) return Object.keys(probe.bets).length > 0;
      return probe.bet;
    },
    place() {
      if (probe.actionsRef) probe.actionsRef.current.placeBet();
      else if (probe.handlePlaceOrQueueBet) probe.handlePlaceOrQueueBet(1);
      else if (probe.primaryAction) probe.primaryAction(0);
      else if (probe.handlePlaceBet) probe.handlePlaceBet("SUIT_BACK", "Spade", 3.8, "SPADE");
      else if (spec[0].includes("nine-wickets")) probe.placeBet("six", 100);
      else if (spec[0].includes("birds-beasts")) probe.placeBet("birds");
      else probe.placeBet();
      flush();
    },
    cancel() {
      if (probe.handleCancelBet) probe.handleCancelBet(1);
      else probe.queue.cancel();
      flush();
    },
    funds(value) {
      funds = value;
      walletSetter?.(value);
      listeners.get("wx:balance-update")?.forEach((fn) => fn({ detail: { balance: value } }));
      flush();
    },
    personalCount() {
      return probe.engineRef?.current.stats.rounds ?? probe.myRounds?.length ?? probe.userBetHistory?.length ?? probe.myHistory?.length ?? probe.stats?.bets ?? probe.stats?.playerRounds ?? (spec[0].includes("derby-race") ? probe.history.length : 0);
    },
    dispose() {
      for (const slot of slots) slot?.cleanup?.();
      assert.equal(timers.size, 0, "All round/animation/notification timers must be cleaned up");
      Date.now = realDateNow;
      for (const [key, descriptor] of original) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
      delete globalThis.__roundProbe;
    },
  };
  return api;
}

for (const spec of specs) test(`${spec[1]}: spectator rounds, one-shot queue, cancel, funding revalidation and no replay`, async () => {
  const game = scene(spec);
  try {
    await game.until(() => game.open());
    for (let i = 0; i < 2; i++) {
      await game.until(() => !game.open());
      await game.until(() => game.open());
    }
    assert.equal(game.personalCount(), 0, "Spectators must not gain personal results");
    assert.equal(game.writes.length, 0, "Spectator rounds must never write wallet");
    assert.equal(game.requests.length, 0, "Spectator rounds must not request financial outcomes");

    await game.until(() => !game.open());
    game.place(); game.place();
    assert.equal(game.writes.length, 0, "Queued clicks do not charge current round");
    assert.ok(!game.bet(), "Queued wager must never become active in the current round");
    game.cancel();
    await game.until(() => game.open());
    assert.equal(game.writes.length, 0, "Cancelled next-round bet cannot charge");

    await game.until(() => !game.open());
    game.place();
    game.funds(0);
    await game.until(() => game.open());
    assert.equal(game.writes.length, 0, "Queue activation rechecks available funds");
    assert.ok(!game.bet(), "Rejected queue cannot become an active bet");
    const status = game.probe.panel1?.status ?? game.probe.queue.status;
    assert.match(status, /rejected|insufficient/i);

    game.funds(5000);
    await game.until(() => !game.open());
    game.place(); game.place();
    await game.until(() => game.open());
    assert.equal(game.writes.filter((delta) => delta < 0).length, 1, "Exactly one accepted debit");
    assert.ok(game.bet(), "Queue activates only at the next opening");
    await game.until(() => !game.open());
    if (spec[0].includes("derby-race")) {
      await game.until(() => game.phase() === "racing");
      const plan = game.probe.planRef.current;
      game.probe.completeRace(plan);
      game.probe.completeRace(plan);
      assert.equal(game.writes.filter((delta) => delta > 0).length, plan.playerWon ? 1 : 0, "Duplicate race completion cannot pay twice");
      if (plan.playerWon) assert.equal(game.writes.find((delta) => delta > 0), Number((plan.stake * 2.75).toFixed(2)), "Preserve Derby payout");
    }
    await game.until(() => game.open());
    assert.equal(game.writes.filter((delta) => delta < 0).length, 1, "Manual wager must not replay");
    assert.ok(!game.bet(), "Next spectator round has no personal bet");
    assert.equal(game.personalCount(), spec[0].includes("birds-beasts") ? 0 : 1, "One accepted round settles once");
    await game.until(() => !game.open());
    const beforeUnmount = game.writes.length;
    game.place();
    assert.equal(game.writes.length, beforeUnmount, "Unmounting with a queued wager must not debit");
  } finally {
    game.dispose();
  }
});
