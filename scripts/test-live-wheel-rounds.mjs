import assert from "node:assert/strict";
import { legacyBrowserPool } from "./browser-pool-legacy-stub.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import ts from "typescript";
// Shared Dream Catcher coverage runs separately via npm run test:multiplayer.

const root = path.resolve(".");
const noop = () => {};
const sounds = new Proxy({}, { get: () => noop });
const cases = [
  { dir: "european-roulette", file: "RouletteGame.tsx", expose: "spin, placeBet, clear, bets, total, result, wheelRef, history", place: (h) => h.api.placeBet("s1"), start: (h) => h.api.spin(), stake: (a) => a.total },
  { dir: "mini-roulette", file: "components\\roulette\\MiniRoulette.tsx", expose: "spin, placeBet, clear, bets, total, activeStake, wheelRef, history, playAgain", place: (h) => h.api.placeBet("s-1"), start: (h) => h.api.spin(), stake: (a) => a.total },
  { dir: "wheel-betting", file: "WheelGame.tsx", expose: "doSpin, runRound, queuedBet, stats, records, overlay, wheelRef, queuedRef, setQueuedBet", place: (h) => h.api.doSpin(), start: (h) => h.api.runRound(), stake: (a) => a.queuedBet ?? 0 },
];

// Execute the actual component hooks and handlers with deterministic timers and
// an imperative wheel double. Game engines and payout functions are not mocked.
function harness(config, serverNumber = 2) {
  const slots = [], pending = [], intervals = new Map(), timeouts = new Map(), requests = [], serverOutcomes = [], poolCalls = [];
  let cursor = 0, nextTimer = 1, writes = 0, api, tree, walletBalance = 1000, walletSetter;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const hooks = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
    },
    useRef(initial) {
      const i = cursor++;
      return slots[i] ??= { current: initial };
    },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: fn(), deps };
      return slots[i].value;
    },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        slots[i]?.cleanup?.();
        slots[i] = { deps, fn };
        pending.push(() => { slots[i].cleanup = fn(); });
      }
    },
  };
  const transport = legacyBrowserPool({
      useState: hooks.useState,
      balance: () => walletBalance,
      update: value => { walletBalance = value; writes++; walletSetter(value); },
      resolve: async (game, stake, selection) => {
        if (game === "european-roulette" || game === "mini-roulette") {
          const rules = load(path.join(root, "src", "lib", "browserRouletteSelection.ts"));
          const checked = rules.validateBrowserRouletteSelection(game, stake, selection);
          const outcome = [...checked.wins, ...checked.losses].find(result => result.value === serverNumber);
          assert.ok(outcome, "fixture number must be a real wheel number");
          serverOutcomes.push({ number: outcome.value, payout: outcome.payout });
          return { outcome: serverOutcomes.at(-1), claim: outcome.payout };
        }
        const response = await fetch("/fixture", { method: "POST", body: JSON.stringify({ bet: stake }) });
        const outcome = await response.json();
        return { outcome, claim: outcome.payout };
      },
    });
  const wallet = {
    ...transport,
    // Records every wallet/server lifecycle request a component makes.
    usePoolLifecycle(game) {
      const lifecycle = transport.usePoolLifecycle(game);
      return {
        ...lifecycle,
        start: (...args) => { poolCalls.push("start"); return lifecycle.start(...args); },
        resolveServer: (...args) => { poolCalls.push("resolve"); return lifecycle.resolveServer(...args); },
        complete: (...args) => { poolCalls.push("complete"); return lifecycle.complete(...args); },
      };
    },
    useGameBalance() {
      const [balance, setter] = hooks.useState(1000);
      walletBalance = balance;
      walletSetter = setter;
      return [balance, (value) => { writes++; setter(value); }];
    },
  };
  const cache = new Map();
  const clock = {
    setTimeout(fn) { const id = nextTimer++; timeouts.set(id, fn); return id; },
    clearTimeout(id) { timeouts.delete(id); },
    setInterval(fn) { const id = nextTimer++; intervals.set(id, fn); return id; },
    clearInterval(id) { intervals.delete(id); },
  };
  const storage = { getItem: () => null, setItem: noop };
  const window = { ...clock, localStorage: storage, addEventListener: noop, removeEventListener: noop };
  async function fetch(url, options) {
    requests.push(options.method);
    const bet = options.body ? JSON.parse(options.body).bet : 0;
    return { ok: true, json: async () => ({ index: 0, multiplier: 0, payout: 0, profit: -bet, win: false, hash: "abc" }) };
  }
  function load(file, component = false) {
    if (cache.has(file)) return cache.get(file);
    let text = readFileSync(file, "utf8");
    if (component) {
      const start = text.indexOf("export default function");
      text = text.slice(0, start) + text.slice(start).replace("\n  return (", `\n  globalThis.capture({ ${config.expose} });\n  return (`);
    }
    const output = ts.transpileModule(text, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
      reportDiagnostics: true,
    });
    assert.equal(output.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0, file);
    const loaded = { exports: {} };
    const resolver = (name) => {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name === "@/lib/walletSync") return wallet;
      if (name === "@/lib/betPresets") return { BET_PRESETS: [50, 100, 200, 500, 1000] };
      if (name.startsWith("@/lib/browserRoulette") || name === "./rouletteGameRules" || /^@\/components\/(european-roulette\/roulette|mini-roulette\/lib\/roulette|poker-roulette\/lib\/poker)$/.test(name)) {
        const target = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(file), name);
        return load(`${target}.ts`);
      }
      if (/sound|audio|gameSfx/i.test(name)) return new Proxy({ gameSfx: sounds, tableAudio: sounds, sfx: sounds }, { get: (o, k) => o[k] ?? noop });
      if (/roulette$|engine$|config$|lib\/wheel$/.test(name)) {
        const target = path.resolve(path.dirname(file), name);
        return load(`${target}.ts`);
      }
      return new Proxy({}, { get: () => noop });
    };
    new Function("require", "module", "exports", "globalThis", "window", "localStorage", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "fetch", output.outputText)(
      resolver, loaded, loaded.exports, { capture: (value) => { api = value; } }, window, storage,
      clock.setTimeout, clock.clearTimeout, clock.setInterval, clock.clearInterval, fetch,
    );
    cache.set(file, loaded.exports);
    return loaded.exports;
  }
  const Component = load(path.join(root, "src", "components", config.dir, config.file), true).default;
  const h = {
    get api() { return api; }, get writes() { return writes; }, get balance() { return walletBalance; }, requests, serverOutcomes, poolCalls,
    render() { cursor = 0; tree = Component({}); pending.splice(0).forEach((fn) => fn()); return tree; },
    async flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); h.render(); },
    async tick() {
      for (const fn of [...intervals.values()]) fn();
      await h.flush();
    },
    async settle() {
      for (let i = 0; i < 30; i++) {
        await h.flush();
        if (!timeouts.size) break;
        const jobs = [...timeouts.values()];
        timeouts.clear();
        jobs.forEach((fn) => fn());
      }
      await h.flush();
    },
    strictReplay() {
      for (const slot of slots) if (slot?.fn) { slot.cleanup?.(); slot.cleanup = slot.fn(); }
    },
    unmount() {
      for (const slot of slots) slot?.cleanup?.();
    },
    setFunds(value) { slots[config.dir === "european-roulette" ? 1 : config.dir === "mini-roulette" ? 1 : 0] = value; h.render(); },
  };
  h.render();
  h.render();
  return h;
}

for (const config of cases) {
  test(`${config.dir}: rapid start clicks consume one snapshot; unmount blocks late settlement and restart`, async () => {
    const h = harness(config);
    await config.place(h); h.render();
    let release, animations = 0;
    const animation = () => { animations++; return new Promise((resolve) => { release = resolve; }); };
    h.api.wheelRef.current = { spin: animation, spinToIndex: animation, spinTo: animation, stop: noop };
    for (let i = 0; i < 8; i++) void config.start(h);
    await h.flush();
    if (!release) await h.settle();
    assert.equal(animations, 1);
    assert.equal(h.writes, 1, "Only the single accepted positive snapshot debits");
    const before = JSON.stringify({ history: h.api.history, records: h.api.records, stats: h.api.stats });
    h.unmount();
    release();
    await h.settle(); await h.tick(); await h.settle();
    assert.equal(h.writes, 1, "Unmount prevents late payout/refund writes");
    assert.equal(JSON.stringify({ history: h.api.history, records: h.api.records, stats: h.api.stats }), before);
    assert.equal(animations, 1, "Unmount stops the round scheduler");
  });

  test(`${config.dir}: repeated spectator rounds animate without financial writes or personal records`, async () => {
    const h = harness(config);
    let spins = 0;
    h.api.wheelRef.current = { spin: async () => { spins++; }, spinToIndex: async () => { spins++; }, spinTo: async () => { spins++; }, stop: noop };
    h.strictReplay();
    for (let i = 0; i < 3; i++) { await h.tick(); await h.settle(); }
    assert.ok(spins >= 3);
    assert.equal(h.writes, 0);
    if (h.api.stats) assert.equal(h.api.stats.rounds ?? h.api.stats.spins, 0);
    if (config.dir === "wheel-betting") {
      assert.deepEqual(h.api.records, []);
      assert.equal(h.api.overlay, null);
      assert.deepEqual(h.requests, ["GET", "GET", "GET"]);
    }
  });

  // Lucky Wheel keeps its next-round queue; browser roulettes close betting mid-round (below).
  if (config.dir === "wheel-betting") test(`${config.dir}: mid-spin wager stays queued, clear cancels, active outcome cannot consume it`, async () => {
    const h = harness(config);
    let release;
    const animation = () => release ? Promise.resolve() : new Promise((resolve) => { release = resolve; });
    h.api.wheelRef.current = { spin: animation, spinToIndex: animation, spinTo: animation, stop: noop };
    void config.start(h);
    await h.flush();
    if (!release) await h.settle();
    await config.place(h); h.render();
    const queued = config.stake(h.api);
    assert.ok(queued > 0);
    assert.equal(h.writes, 0, "Queue placement does not debit a running spectator round");
    release?.();
    await h.settle();
    assert.equal(config.stake(h.api), queued, "Settlement must preserve next-round queue");
    if (h.api.playAgain) { h.api.playAgain(); h.render(); assert.equal(config.stake(h.api), queued); }
    if (h.api.clear) h.api.clear();
    else if (h.api.clearBets) h.api.clearBets();
    else { h.api.queuedRef.current = null; h.api.setQueuedBet(null); }
    h.render();
    assert.equal(config.stake(h.api), 0);
    assert.equal(h.writes, 0);
  });

  if (config.dir === "wheel-betting") test(`${config.dir}: active paid snapshot stays separate from a new queued wager`, async () => {
    const h = harness(config);
    await config.place(h); h.render();
    const activeStake = config.stake(h.api);
    let release;
    const animation = () => release ? Promise.resolve() : new Promise((resolve) => { release = resolve; });
    h.api.wheelRef.current = { spin: animation, spinToIndex: animation, spinTo: animation, stop: noop };
    void config.start(h); await h.flush();
    if (!release) await h.settle();
    assert.equal(config.stake(h.api), 0);
    await config.place(h); h.render();
    const nextStake = config.stake(h.api);
    assert.ok(nextStake > 0);
    release();
    await h.settle();
    assert.equal(config.stake(h.api), nextStake);
    if (h.api.result) assert.equal(h.api.result.total, activeStake);
    if (h.api.activeStake !== undefined) assert.equal(h.api.activeStake, activeStake);
    if (h.api.stats) assert.equal(h.api.stats.wagered, activeStake);
    if (h.api.records) assert.equal(h.api.records[0].bet, activeStake);
    const writes = h.writes;
    void config.start(h); await h.settle();
    assert.equal(config.stake(h.api), 0, "Queued wager enters only the next round");
    assert.ok(h.writes > writes);
    if (h.api.stats) assert.equal(h.api.stats.wagered, activeStake + nextStake);
  });

  test(`${config.dir}: explicit wager settles once, never repeats without autobet`, async () => {
    const h = harness(config);
    h.api.wheelRef.current = { spin: async () => {}, spinToIndex: async () => {}, spinTo: async () => {}, stop: noop };
    await config.place(h); h.render();
    assert.ok(config.stake(h.api) > 0);
    void config.start(h); await h.settle();
    const writes = h.writes;
    assert.ok(writes > 0);
    assert.equal(config.stake(h.api), 0);
    await h.tick(); await h.settle();
    assert.equal(h.writes, writes, "No implicit repeat bet");
  });

  test(`${config.dir}: insufficient queued funds cancel wager but spectator lifecycle continues`, async () => {
    const h = harness(config);
    let spins = 0;
    h.api.wheelRef.current = { spin: async () => { spins++; }, spinToIndex: async () => { spins++; }, spinTo: async () => { spins++; }, stop: noop };
    await config.place(h); h.render();
    h.setFunds(0);
    void config.start(h); await h.settle();
    assert.ok(spins > 0);
    assert.equal(h.writes, 0);
    assert.equal(config.stake(h.api), 0);
  });
}

test("Lucky Wheel rapid manual queue clicks replace one pending wager, never multiply it", async () => {
  const config = cases.find((entry) => entry.dir === "wheel-betting");
  const h = harness(config);
  h.api.wheelRef.current = { spinTo: async () => {}, stop: noop };
  for (let i = 0; i < 12; i++) void h.api.doSpin();
  h.render();
  assert.equal(config.stake(h.api), 10);
  assert.equal(h.writes, 0);
  for (let i = 0; i < 12; i++) void h.api.runRound();
  await h.settle();
  assert.equal(h.api.records.length, 1);
  assert.equal(h.api.stats.wagered, 10);
  assert.equal(h.writes, 1);
  await h.tick(); await h.settle();
  assert.equal(h.api.records.length, 1);
  assert.equal(h.writes, 1);
});

test("Lucky Wheel spectator API uses unchanged engine with zero stake; POST bounds remain enforced", async () => {
  const file = path.join(root, "src", "app", "api", "wheel-betting", "spin", "route.ts");
  const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} }, stakes = [];
  new Function("require", "module", "exports", source)((name) => {
    if (name === "next/server") return { NextResponse: { json: (data, options) => ({ data, ...options }) } };
    if (name === "@/lib/gameAvailability") return { LOCAL_GAMES_CONNECTED: true };
    if (name.endsWith("spin-engine")) return { spin: (stake) => { stakes.push(stake); return { index: 2, multiplier: 2, hash: "abc", payout: 0 }; } };
    return { MIN_BET: 1, MAX_BET: 10000 };
  }, loaded, loaded.exports);
  assert.deepEqual((await loaded.exports.GET()).data, { index: 2, multiplier: 2, hash: "abc" });
  assert.deepEqual(stakes, [0]);
  assert.equal((await loaded.exports.POST({ json: async () => ({ bet: 0 }) })).status, 400);
});

for (const config of cases.slice(0, 2)) {
  for (const serverNumber of [1, 2]) {
    test(`${config.dir}: wheel animation and result use server number ${serverNumber} with capped return`, async () => {
      const h = harness(config, serverNumber);
      const spins = [];
      h.api.wheelRef.current = { spin: async (target) => { spins.push(target); }, stop: noop };
      await config.place(h); h.render();
      void config.start(h); await h.settle();
      const server = h.serverOutcomes[0];
      assert.deepEqual(server, { number: serverNumber, payout: serverNumber === 1 ? 100 : 0 });
      assert.equal(spins[0], config.dir === "mini-roulette" ? [1, 6, 3, 9, 12, 4, 10, 7, 8, 2, 5, 11].indexOf(serverNumber) : serverNumber);
      assert.equal(h.api.history[0], serverNumber);
      if (h.api.result) assert.deepEqual(h.api.result, { number: serverNumber, payout: server.payout, total: 50 });
      assert.equal(h.balance, 1000 - 50 + server.payout);
    });
  }
}

// European and Mini Roulette: rounds keep spinning without a wager, and a bet
// can only be placed while betting is open, for the round that starts next.
for (const config of cases.slice(0, 2)) {
  const idleWheel = (h, counter) => {
    h.api.wheelRef.current = { spin: async (target) => { counter.push(target); }, stop: noop };
  };
  const round = async (h) => { await h.tick(); await h.settle(); };

  test(`${config.dir}: successive idle rounds spin with no wallet or server request`, async () => {
    const h = harness(config, 1);
    const spins = [];
    idleWheel(h, spins);
    for (let i = 0; i < 3; i++) {
      await round(h);
      assert.equal(spins.length, i + 1, "each scheduler tick completes one idle round");
      assert.equal(h.api.history.length, i + 1);
    }
    assert.deepEqual(h.poolCalls, [], "idle rounds never start, resolve or settle a wager");
    assert.deepEqual(h.serverOutcomes, [], "idle rounds never consume a player win slot");
    assert.deepEqual(h.requests, []);
    assert.equal(h.writes, 0);
    assert.equal(h.balance, 1000);
    assert.equal(config.stake(h.api), 0, "no stake is replayed implicitly");
  });

  test(`${config.dir}: wager after an empty round settles the server outcome once`, async () => {
    const h = harness(config, 1);
    const spins = [];
    idleWheel(h, spins);
    await round(h);
    assert.deepEqual(h.poolCalls, []);
    await config.place(h); h.render();
    assert.equal(config.stake(h.api), 50);
    await round(h);
    assert.deepEqual(h.poolCalls, ["start", "resolve"]);
    assert.deepEqual(h.serverOutcomes, [{ number: 1, payout: 100 }]);
    assert.equal(h.api.history[0], 1, "revealed number is the server number");
    assert.equal(spins[1], config.dir === "mini-roulette" ? [1, 6, 3, 9, 12, 4, 10, 7, 8, 2, 5, 11].indexOf(1) : 1);
    assert.equal(h.balance, 1000 - 50 + 100);
    assert.equal(config.stake(h.api), 0);
    await round(h); await round(h);
    assert.equal(h.serverOutcomes.length, 1, "following rounds are idle, not a replayed stake");
    assert.equal(h.poolCalls.length, 2);
    assert.equal(h.balance, 1050);
  });

  test(`${config.dir}: next bet is blocked during the current round and spectator ticks cannot override it`, async () => {
    const h = harness(config, 2);
    let release, animations = 0;
    h.api.wheelRef.current = { spin: () => { animations++; return new Promise((resolve) => { release = resolve; }); }, stop: noop };
    await config.place(h); h.render();
    void config.start(h); await h.flush();
    assert.equal(animations, 1);
    assert.deepEqual(h.poolCalls, ["start", "resolve"]);
    const balance = h.balance;
    await config.place(h); h.render();
    await config.place(h); h.render();
    assert.equal(config.stake(h.api), 0, "no chip is collected for the next round while this one runs");
    await h.tick(); await h.tick();
    void config.start(h); await h.flush();
    assert.equal(animations, 1, "background scheduler cannot start a spectator spin over the accepted wager");
    assert.equal(h.serverOutcomes.length, 1, "no second wager in the same round");
    release(); await h.settle();
    assert.equal(h.api.history[0], 2);
    assert.equal(h.balance, balance, "server outcome 2 loses; no further debit or credit");
    assert.equal(config.stake(h.api), 0, "nothing queued into the next round");
    h.api.wheelRef.current = { spin: async () => {}, stop: noop };
    await round(h);
    assert.equal(h.serverOutcomes.length, 1, "following round is idle");
    assert.equal(h.poolCalls.length, 2);
    await config.place(h); h.render();
    assert.equal(config.stake(h.api), 50, "betting reopens once the preceding round has finished");
  });
}
