import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import ts from "typescript";

const code = ts.transpileModule(readFileSync("src\\lib\\walletSync.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const noticeModule = { exports: {} };
new Function("exports", ts.transpileModule(readFileSync("src\\lib\\gameResultNotice.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(noticeModule.exports);

function harness() {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  const window = new EventTarget();
  window.localStorage = storage;
  window.location = { pathname: "/player/games/dice" };
  const requests = [];
  const notices = [];
  window.addEventListener("wx:game-result", event => notices.push(event.detail));
  const wagers = new Map();
  const operations = new Map();
  let owner = "alice", balance = 1000, loseResponse = null;
  const fetch = async (_url, options = {}) => {
    if (options.method !== "POST") return {
      ok: true, json: async () => ({ ok: true, loggedIn: true, dailyPoolEnabled: true, balance, user: { id: owner } }),
    };
    const body = JSON.parse(options.body);
    requests.push(body);
    assert.equal(body.ownerId, owner, "never submit another account's saved wager");
    if (!operations.has(body.operationId)) {
      if (body.action === "accept") {
        assert.ok(!wagers.has(body.wagerId));
        balance -= body.amount;
        wagers.set(body.wagerId, { stake: body.amount, claim: 0, awards: 0, closed: false });
      } else {
        const wager = wagers.get(body.wagerId);
        assert.ok(wager);
        if (body.action === "increment") { wager.stake += body.amount; balance -= body.amount; }
        if (body.action === "award") wager.awards += body.amount;
        if (body.action === "complete") { wager.claim = body.amount + wager.awards; wager.closed = true; }
        if (body.action === "resolve") {
          wager.claim = 20;
          wager.closed = true;
          wager.outcome = { isWin: true, isHuge: false, payout: 20, finalReels: Array(9).fill("coin") };
        }
        if (body.action === "card-action") {
          wager.moves = (wager.moves ?? 0) + 1;
          wager.closed = body.selection.move === "stand";
          wager.claim = wager.closed ? 20 : 0;
          wager.outcome = { phase: wager.closed ? "result" : "playing", payout: wager.claim };
        }
      }
      operations.set(body.operationId, body);
    }
    if (loseResponse === body.action) { loseResponse = null; throw new Error("Response lost after commit"); }
    return {
      ok: true, status: 200,
      json: async () => ({ ok: true, balance, wagerId: body.wagerId, poolPending: true, claim: wagers.get(body.wagerId)?.claim ?? 0,
        status: wagers.get(body.wagerId)?.closed ? "closed" : "active", outcome: wagers.get(body.wagerId)?.outcome ?? null }),
    };
  };
  const previous = {};
  for (const key of ["window", "localStorage", "fetch", "crypto", "CustomEvent"]) {
    previous[key] = Object.getOwnPropertyDescriptor(globalThis, key);
  }
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: window },
    localStorage: { configurable: true, value: storage },
    fetch: { configurable: true, value: fetch },
    crypto: { configurable: true, value: { randomUUID } },
    CustomEvent: { configurable: true, value: class extends Event {
      constructor(name, options) { super(name); this.detail = options?.detail; }
    } },
  });
  function mount() {
    const effects = [];
    const module = { exports: {} };
    const react = {
      useRef: value => ({ current: value }),
      useState: initial => [typeof initial === "function" ? initial() : initial, () => {}],
      useCallback: callback => callback,
      useEffect: effect => effects.push(effect),
    };
    new Function("require", "module", "exports", code)(specifier => {
      if (specifier === "react") return react;
      if (specifier === "./dailyPoolConsent") return { dailyPoolConsent: () => "daily-pool-v1" };
      if (specifier === "./gameResultNotice") return noticeModule.exports;
      if (specifier === "./cardGameRules" || specifier === "./browserCardGames" || specifier === "./rouletteGameRules" || specifier === "./slotGameRules") {
        const helper = { exports: {} };
        new Function("exports", ts.transpileModule(readFileSync(`src\\lib\\${specifier.slice(2)}.ts`, "utf8"), {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
        }).outputText)(helper.exports);
        return helper.exports;
      }
      throw new Error(`Unexpected import ${specifier}`);
    }, module, module.exports);
    return {
      ...module.exports,
      recover: async () => {
        effects.forEach(effect => effect());
        for (let count = 0; count < 30; count++) await new Promise(resolve => setImmediate(resolve));
      },
    };
  }
  return {
    storage, requests, wagers, notices, mount, get balance() { return balance; },
    lose: action => { loseResponse = action; },
    login: id => { owner = id; },
    restore: () => {
      for (const [key, descriptor] of Object.entries(previous)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

function toucanSpin(pool) {
  const source = ts.createSourceFile("FortuneToucanGame.tsx",
    readFileSync("src\\components\\fortune-toucan\\FortuneToucanGame.tsx", "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "runSpin") {
      callback = node.initializer.arguments[0].getText(source);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(callback);
  const samples = [], messages = [], auto = [], selections = [], validations = [], starts = [];
  const fortune = { exports: {} };
  new Function("exports", ts.transpileModule(
    readFileSync("src\\components\\fortune-toucan\\lib\\fortune.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText)(fortune.exports);
  const noop = () => {};
  const deps = {
    pool: {
      ...pool,
      start: async (stake, legacy, selection) => {
        starts.push({ stake, selection });
        return pool.start(stake, legacy, selection);
      },
      resolveServer: async selection => {
        selections.push(selection);
        const reply = await pool.resolveServer(selection);
        if (!reply) return null;
        // Adapt the shared lifecycle transport's generic 20-Rs. result to this
        // component's typed, reel-supported server fixture.
        const grid = ["coffee", "coffee", "coffee", "egg", "mask", "drum", "coffee", "leaf", "egg"];
        const evaluated = fortune.exports.evaluate(grid, 20);
        assert.equal(evaluated.total, reply.payout);
        return { game: "fortune-toucan", stake: 20, payout: reply.payout, spin: {
          type: "base", grid, wins: evaluated.wins, totalWin: evaluated.total, fullScreen: evaluated.fullScreen,
        } };
      },
    },
    busyLock: { current: false }, betRef: { current: 20 }, balanceRef: { current: 1000 },
    turboRef: { current: true }, autoRef: { current: 0 }, timers: { current: [] },
    audio: () => new Proxy({}, { get: () => noop }), clearTimers: noop, wait: async () => {},
    readBrowserSlotOutcome: (game, outcome, stake) => {
      validations.push({ game, outcome, stake });
      assert.equal(game, "fortune-toucan");
      assert.equal(stake, 20);
      assert.equal(outcome.game, game);
      assert.equal(outcome.stake, stake);
      const evaluated = fortune.exports.evaluate(outcome.spin.grid, stake);
      assert.equal(outcome.payout, evaluated.total);
      assert.deepEqual(outcome.spin.wins, evaluated.wins);
      assert.equal(outcome.spin.totalWin, evaluated.total);
      return outcome;
    },
    winTier: fortune.exports.winTier, formatMoney: fortune.exports.formatMoney, round2: fortune.exports.round2,
    playSpin: stake => {
      samples.push(stake);
      return { totalWin: 0, type: "normal", grid: [], wins: [], fullScreen: false };
    },
    showToast: message => messages.push(message),
  };
  for (const setter of new Set(callback.match(/\bset[A-Z]\w+/g))) deps[setter] = noop;
  deps.setAutoLeft = value => auto.push(value);
  const compiled = ts.transpileModule(`const run = ${callback};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const run = new Function(...Object.keys(deps), `${compiled}\nreturn run;`)(...Object.values(deps));
  return { run, samples, messages, auto, selections, validations, starts, lock: deps.busyLock };
}

test("interactive card moves keep the accepted wager until terminal confirmation and retry the exact move", async () => {
  const h = harness();
  try {
    const pool = h.mount().usePoolLifecycle("blackjack");
    assert.equal(await pool.start(10), true);
    const key = "wx:browser-active:blackjack:main";
    const wagerId = h.storage.getItem(key);
    assert.ok(wagerId);
    assert.deepEqual(await pool.cardAction("deal"), { phase: "playing", payout: 0 });
    assert.equal(h.storage.getItem(key), wagerId);
    h.lose("card-action");
    assert.equal(await pool.cardAction("stand"), null);
    assert.ok(h.storage.getItem(`${key}:request`));
    assert.equal(await pool.cardAction("hit"), null, "an ambiguous move must not be replaced");
    const replay = await pool.cardAction("stand");
    assert.deepEqual(replay, { phase: "result", payout: 20 });
    assert.equal(h.storage.getItem(key), null);
    assert.equal(h.wagers.size, 1);
    assert.equal([...h.wagers.values()][0].moves, 2);
    const stands = h.requests.filter(request => request.selection?.move === "stand");
    assert.equal(stands.length, 2);
    assert.equal(stands[0].operationId, stands[1].operationId);
    assert.equal(stands[0].wagerId, wagerId);
  } finally { h.restore(); }
});

test("interactive reload retries the saved move without inventing a terminal resolve", async () => {
  const h = harness();
  try {
    const pool = h.mount().usePoolLifecycle("blackjack");
    assert.equal(await pool.start(10, () => {}, { ante: 10 }), true);
    h.lose("card-action");
    assert.equal(await pool.cardAction("deal"), null);
    const reloaded = h.mount();
    reloaded.usePoolLifecycle("blackjack");
    await reloaded.recover();
    assert.ok(h.storage.getItem("wx:browser-active:blackjack:main"));
    assert.equal(h.requests.filter(request => request.action === "accept").length, 1);
    assert.equal(h.requests.filter(request => request.action === "resolve").length, 0);
    assert.equal([...h.wagers.values()][0].moves, 1);
    assert.equal(h.balance, 990);
  } finally { h.restore(); }
});

for (const game of ["super-fruits", "sweet-bonanza", "poker", "thai-hi-lo"]) {
  for (const lostAction of ["accept", "resolve"]) {
    test(`${game}: reload recovers lost ${lostAction} without another stake or outcome`, async () => {
      const h = harness();
      try {
        const original = h.mount().usePoolLifecycle(game);
        h.lose(lostAction);
        const selection = game === "thai-hi-lo" ? { bet: "high" } : {};
        const accepted = await original.start(10, () => {}, selection);
        if (accepted) assert.equal(await original.resolveServer(selection), null);
        const reloaded = h.mount();
        reloaded.usePoolLifecycle(game);
        await reloaded.recover();
        assert.equal(h.balance, 990);
        assert.equal(h.wagers.size, 1);
        assert.equal([...h.wagers.values()][0].closed, true);
        assert.equal(h.notices.length, 1);
        assert.equal(h.notices[0].poolClaim, 20);
        assert.equal(h.storage.getItem(`wx:browser-active:${game}:main`), null);
        const retries = h.requests.filter(request => request.action === lostAction);
        assert.equal(retries.length, 2);
        assert.equal(retries[0].operationId, retries[1].operationId);
      } finally { h.restore(); }
    });
  }

  test(`${game}: reload preserves an older accepted client terminal result`, async () => {
    const h = harness();
    try {
      const original = h.mount().usePoolLifecycle(game);
      original.plan(25, { oldOutcome: true });
      await original.start(10);
      const reloaded = h.mount();
      reloaded.usePoolLifecycle(game);
      await reloaded.recover();
      assert.equal([...h.wagers.values()][0].claim, 25);
      assert.equal(h.requests.filter(request => request.action === "resolve").length, 0);
    } finally { h.restore(); }
  });
}

test("reload finishes the exact sampled terminal claim without a new stake or wallet win", async () => {
  const h = harness();
  try {
    const original = h.mount().usePoolLifecycle("fortune-ox");
    original.plan(250, { symbols: ["ox", "ox", "ox"] });
    assert.equal(await original.start(100), true);
    assert.equal(h.balance, 900);
    const reloaded = h.mount();
    reloaded.usePoolLifecycle("fortune-ox");
    await reloaded.recover();
    assert.equal(h.balance, 900);
    assert.equal(h.wagers.size, 1);
    assert.equal([...h.wagers.values()][0].claim, 250);
    assert.equal([...h.wagers.values()][0].closed, true);
    assert.equal(h.storage.getItem("wx:browser-active:fortune-ox:main"), null);
  } finally { h.restore(); }
});

test("Treasure Bowl reload resolves its accepted server wager once without a client terminal claim", async () => {
  const h = harness();
  try {
    const pool = h.mount().usePoolLifecycle("treasure-bowl");
    assert.equal(await pool.start(10), true);
    const reloaded = h.mount();
    reloaded.usePoolLifecycle("treasure-bowl");
    await reloaded.recover();
    assert.equal(h.wagers.size, 1);
    assert.equal(h.balance, 990);
    assert.equal([...h.wagers.values()][0].closed, true);
    assert.equal(h.requests.filter(request => request.action === "resolve").length, 1);
    assert.equal(h.notices.length, 1);
    assert.equal(h.notices[0].poolClaim, 20);
    assert.equal(h.storage.getItem("wx:browser-active:treasure-bowl:main"), null);
  } finally { h.restore(); }
});

test("Treasure Bowl lost server resolution replays the original operation on reload", async () => {
  const h = harness();
  try {
    const pool = h.mount().usePoolLifecycle("treasure-bowl");
    await pool.start(10);
    h.lose("resolve");
    assert.equal(await pool.resolveServer({}), null);
    const reloaded = h.mount();
    reloaded.usePoolLifecycle("treasure-bowl");
    await reloaded.recover();
    assert.equal(h.balance, 990);
    const resolves = h.requests.filter(request => request.action === "resolve");
    assert.equal(resolves.length, 2);
    assert.equal(resolves[0].operationId, resolves[1].operationId);
    assert.equal(h.notices.length, 1);
  } finally { h.restore(); }
});

for (const game of ["fortune-ox", "fortune-gems", "fortune-toucan", "gates-of-olympus", "diao-chan", "hotline", "thai-hi-lo"]) {
  test(`${game}: reload resolves the accepted server selection without a second stake`, async () => {
    const h = harness();
    try {
      const pool = h.mount().usePoolLifecycle(game);
      assert.equal(pool.enabled, false, "new slots do not use deferred pool mode");
      const selection = game === "hotline" ? { color: "red", highRisk: false } : game === "thai-hi-lo" ? { bet: "high" } : {};
      await pool.start(10, () => {}, selection);
      const reloaded = h.mount();
      reloaded.usePoolLifecycle(game);
      await reloaded.recover();
      assert.equal(h.wagers.size, 1);
      assert.equal([...h.wagers.values()][0].closed, true);
      assert.equal(h.requests.filter(request => request.action === "accept").length, 1);
      const resolves = h.requests.filter(request => request.action === "resolve");
      assert.equal(resolves.length, 1);
      assert.deepEqual(resolves[0].selection, selection);
      assert.equal(h.notices.length, 1);
    } finally { h.restore(); }
  });

  test(`${game}: lost server response retries its original operation and announces once`, async () => {
    const h = harness();
    try {
      const pool = h.mount().usePoolLifecycle(game);
      const selection = game === "hotline" ? { color: "fire", highRisk: true } : {};
      await pool.start(10, () => {}, selection);
      h.lose("resolve");
      assert.equal(await pool.resolveServer(selection), null);
      const reloaded = h.mount();
      reloaded.usePoolLifecycle(game);
      await reloaded.recover();
      const resolves = h.requests.filter(request => request.action === "resolve");
      assert.equal(resolves.length, 2);
      assert.equal(resolves[0].operationId, resolves[1].operationId);
      assert.equal(resolves[0].wagerId, resolves[1].wagerId);
      assert.equal(h.wagers.size, 1);
      assert.equal(h.notices.length, 1);
    } finally { h.restore(); }
  });
}

test("lost acceptance response recovers the same operation and original outcome", async () => {
  const h = harness();
  try {
    const original = h.mount().usePoolLifecycle("keno");
    original.plan(375, { draw: [1, 2, 3] });
    h.lose("accept");
    assert.equal(await original.start(100), false);
    const reloaded = h.mount();
    reloaded.usePoolLifecycle("keno");
    await reloaded.recover();
    assert.equal(h.wagers.size, 1);
    assert.equal(h.balance, 900);
    assert.equal([...h.wagers.values()][0].claim, 375);
    const accepts = h.requests.filter(request => request.action === "accept");
    assert.equal(accepts.length, 2);
    assert.equal(accepts[0].operationId, accepts[1].operationId);
  } finally { h.restore(); }
});

test("Toucan retries an unconfirmed acceptance in the same mount without replacing its saved result", async () => {
  const h = harness();
  try {
    const pool = h.mount().usePoolLifecycle("fortune-toucan");
    pool.plan(375, { grid: ["toucan", "toucan", "toucan"] });
    h.lose("accept");
    assert.equal(await pool.start(100), false);
    assert.throws(() => pool.plan(0), /saved round outcome cannot change/);
    const saved = h.storage.getItem("wx:browser-active:fortune-toucan:main:terminal");

    h.lose("accept");
    assert.equal(await pool.resume(), false);
    assert.equal(h.storage.getItem("wx:browser-active:fortune-toucan:main:terminal"), saved);
    assert.equal(h.balance, 900);

    assert.equal(await pool.resume(), true);
    const accepts = h.requests.filter(request => request.action === "accept");
    assert.equal(new Set(accepts.map(request => request.operationId)).size, 1);
    assert.equal(h.wagers.size, 1);
    assert.equal([...h.wagers.values()][0].claim, 375);
    assert.equal([...h.wagers.values()][0].closed, true);
    assert.equal(h.balance, 900);

    pool.plan(0, { grid: ["leaf", "mask", "drum"] });
    assert.equal(await pool.start(20), true);
    assert.equal(await pool.complete(0), true);
    assert.equal(h.wagers.size, 2);
    assert.equal(h.balance, 880);
  } finally { h.restore(); }
});

test("Toucan retries a lost completion with the original wager and operation before allowing a new spin", async () => {
  const h = harness();
  try {
    const pool = h.mount().usePoolLifecycle("fortune-toucan");
    pool.plan(250);
    assert.equal(await pool.start(100), true);
    h.lose("complete");
    assert.equal(await pool.complete(250), false);
    assert.equal(await pool.resume(), true);
    const completions = h.requests.filter(request => request.action === "complete");
    assert.equal(completions.length, 2);
    assert.equal(completions[0].operationId, completions[1].operationId);
    assert.equal(completions[0].wagerId, completions[1].wagerId);
    assert.equal([...h.wagers.values()][0].claim, 250);
    assert.equal(h.balance, 900);
    assert.doesNotThrow(() => pool.plan(0));
  } finally { h.restore(); }
});

test("shared lifecycle publishes the full final claim once confirmed, including bonus awards", async () => {
  const h = harness();
  try {
    const pool = h.mount().usePoolLifecycle("gates-of-olympus");
    await pool.start(100);
    assert.equal(h.notices.length, 0, "acceptance cannot announce a result");
    await pool.award(50);
    assert.equal(h.notices.length, 0, "bonus awards cannot announce a finished round");
    await pool.complete(100);
    assert.equal(h.notices.length, 1);
    assert.deepEqual(h.notices[0], {
      game: "gates-of-olympus", id: h.requests[0].wagerId, win: 0, won: true, poolPending: true, poolClaim: 150,
    });
    assert.equal(h.balance, 900, "the display cannot credit a provisional claim");
  } finally { h.restore(); }
});

test("Toucan cannot resume another account's saved spin", async () => {
  const h = harness();
  try {
    const pool = h.mount().usePoolLifecycle("fortune-toucan");
    pool.plan(250);
    h.lose("accept");
    await pool.start(100);
    const saved = h.storage.getItem("wx:browser-active:fortune-toucan:main:terminal");
    const count = h.requests.length;
    h.login("bob");
    assert.equal(await pool.resume(), false);
    assert.equal(h.requests.length, count);
    assert.equal(h.storage.getItem("wx:browser-active:fortune-toucan:main:terminal"), saved);
  } finally { h.restore(); }
});

test("Toucan spin handler waits for the saved outcome and stops auto-spin when recovery fails", async () => {
  const h = harness();
  try {
    const pool = h.mount().usePoolLifecycle("fortune-toucan");
    pool.plan(375);
    h.lose("accept");
    await pool.start(100);
    const spin = toucanSpin(pool);
    h.lose("accept");
    await spin.run();
    assert.deepEqual(spin.samples, [], "never sample a replacement result before confirmation");
    assert.deepEqual(spin.starts, [], "failed recovery cannot accept a new stake");
    assert.deepEqual(spin.selections, [], "failed recovery cannot resolve a new wager");
    assert.deepEqual(spin.validations, []);
    assert.deepEqual(spin.auto, [0]);
    assert.match(spin.messages[0], /Previous spin needs confirmation/);
    assert.equal(spin.lock.current, false);

    await spin.run();
    assert.deepEqual(spin.samples, [], "new spins no longer draw a client result");
    assert.deepEqual(spin.starts, [{ stake: 20, selection: {} }], "persist the immutable selection before acceptance");
    assert.deepEqual(spin.selections, [{}]);
    assert.equal(spin.validations.length, 1, "validate the server result before animating its reels");
    assert.equal(spin.validations[0].outcome.payout, 20);
    assert.equal(h.wagers.size, 2);
    assert.deepEqual([...h.wagers.values()].map(wager => wager.claim), [375, 20]);
    assert.ok([...h.wagers.values()].every(wager => wager.closed));
    const completes = h.requests.filter(request => request.action === "complete");
    assert.deepEqual(completes.map(request => request.amount), [375], "only the saved legacy wager uses client completion");
    const resolves = h.requests.filter(request => request.action === "resolve");
    assert.equal(resolves.length, 1);
    assert.deepEqual(resolves[0].selection, {});
    assert.equal(resolves[0].wagerId, [...h.wagers.keys()][1]);
    assert.equal(h.balance, 880);
    assert.equal(spin.lock.current, false);
  } finally { h.restore(); }
});

test("compound bonus and incremental transitions resume each exact operation once", async () => {
  const h = harness();
  try {
    const original = h.mount().usePoolLifecycle("texas-holdem");
    original.checkpoint({ state: { phase: "flop", acceptedStake: 100 } });
    assert.equal(await original.start(100), true);
    original.checkpoint({ state: { phase: "handOver", acceptedStake: 150 } });
    original.queue([{ action: "increment", amount: 50 }, { action: "award", amount: 20 }, { action: "complete", amount: 300 }]);
    h.lose("increment");
    assert.equal(await original.increment(50), false);
    const reloaded = h.mount();
    reloaded.usePoolLifecycle("texas-holdem");
    await reloaded.recover();
    const wager = [...h.wagers.values()][0];
    assert.equal(wager.stake, 150);
    assert.equal(wager.claim, 320);
    assert.equal(h.balance, 850);
    const increments = h.requests.filter(request => request.action === "increment");
    assert.equal(increments[0].operationId, increments[1].operationId);
  } finally { h.restore(); }
});

test("interactive snapshots preserve accepted cards and progress without reroll or force settlement", async () => {
  const h = harness();
  try {
    const original = h.mount().usePoolLifecycle("blackjack");
    original.checkpoint({ playerCards: ["AS", "7H"], shoe: ["2D", "KC"], activeBet: 50, status: "playing" });
    await original.start(50);
    const reloaded = h.mount();
    reloaded.usePoolLifecycle("blackjack");
    const [cards] = reloaded.usePoolRoundState("blackjack", "playerCards", []);
    const [shoe] = reloaded.usePoolRoundState("blackjack", "shoe", []);
    await reloaded.recover();
    assert.deepEqual(cards, ["AS", "7H"]);
    assert.deepEqual(shoe, ["2D", "KC"]);
    assert.equal([...h.wagers.values()][0].closed, false);
    assert.equal(h.requests.filter(request => request.action === "complete").length, 0);
  } finally { h.restore(); }
});

test("account switching cannot replay another player's ambiguous acceptance", async () => {
  const h = harness();
  try {
    const original = h.mount().usePoolLifecycle("keno");
    original.plan(0, { draw: [8, 9] });
    h.lose("accept");
    await original.start(100);
    h.login("bob");
    const before = h.requests.length;
    const reloaded = h.mount();
    reloaded.usePoolLifecycle("keno");
    await reloaded.recover();
    assert.equal(h.requests.length, before);
    assert.equal(h.balance, 900);
    assert.equal(h.wagers.size, 1);
    assert.notEqual(h.storage.getItem("wx:browser-active:keno:main:request"), null);
  } finally { h.restore(); }
});

test("accepted zero-loss completion survives reload without refunding, rerolling or recharging", async () => {
  const h = harness();
  try {
    const original = h.mount().usePoolLifecycle("tower-betting");
    original.checkpoint({ playing: true, level: 2, bet: 25, board: [["egg"], ["egg"], ["dragon"]] });
    await original.start(25);
    h.lose("complete");
    assert.equal(await original.complete(0), false);
    const firstClose = h.requests.find(request => request.action === "complete");
    const reloaded = h.mount();
    reloaded.usePoolLifecycle("tower-betting");
    await reloaded.recover();
    assert.equal(h.balance, 975);
    assert.equal(h.wagers.size, 1);
    assert.equal([...h.wagers.values()][0].closed, true);
    assert.equal([...h.wagers.values()][0].claim, 0);
    assert.equal(h.requests.filter(request => request.action === "accept").length, 1);
    assert.ok(h.requests.filter(request => request.action === "complete").every(request => request.operationId === firstClose.operationId));
    assert.equal(h.storage.getItem("wx:browser-active:tower-betting:main"), null);
  } finally { h.restore(); }
});

test("independent projectile recovery preserves each sampled hit and miss after lost responses", async () => {
  const h = harness();
  try {
    const original = h.mount();
    const hitId = randomUUID(), missId = randomUUID();
    const snapshot = { fish: [{ id: 1, species: "Shark", x: 12, y: 14 }], bullets: [{ wagerId: missId, win: false }], pending: { wagerId: hitId } };
    h.lose("accept");
    assert.equal(await original.acceptBrowserProjectile("fishing-arcade", hitId, 10, { target: "Shark" }, snapshot), null);
    const miss = await original.acceptBrowserProjectile("fishing-arcade", missId, 5, { target: null }, snapshot);
    assert.ok(miss);
    h.lose("complete");
    assert.equal(await original.completeBrowserProjectile("fishing-arcade", hitId, 70), null);
    const reloaded = h.mount();
    const recovered = await reloaded.recoverBrowserProjectiles("fishing-arcade");
    assert.deepEqual(recovered.snapshot, snapshot);
    assert.deepEqual(recovered.activeIds, [missId]);
    assert.equal(h.wagers.get(missId).closed, false, "an in-flight shot has no fabricated terminal claim");
    await reloaded.completeBrowserProjectile("fishing-arcade", missId, 0);
    assert.equal(h.balance, 985);
    assert.equal(h.wagers.size, 2);
    assert.deepEqual([...h.wagers.values()].map(wager => wager.claim).sort((a, b) => a - b), [0, 70]);
    assert.ok([...h.wagers.values()].every(wager => wager.closed));
    assert.equal([...Array(h.storage.length)].map((_, index) => h.storage.key(index)).filter(key => key.startsWith("wx:projectile:")).length, 0);
  } finally { h.restore(); }
});

test("restored fishing simulation follows the original projectile to collision or retargeted loss", async () => {
  const h = harness();
  try {
    const transpile = path => ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const configModule = { exports: {} };
    new Function("require", "module", "exports", transpile("src\\components\\fishing-arcade\\game\\config.ts"))(
      () => ({ BET_PRESETS: [10, 20, 50] }), configModule, configModule.exports);
    const engineModule = { exports: {} };
    new Function("require", "module", "exports", transpile("src\\components\\fishing-arcade\\game\\engine.ts"))(
      name => {
        if (name === "./config") return configModule.exports;
        if (name === "./draw") return { makeBackground: () => ({}), makeVignette: () => ({}) };
        if (name === "./sound") return { sfx: new Proxy({}, { get: () => () => {} }) };
        throw new Error(`Unexpected engine import ${name}`);
      }, engineModule, engineModule.exports);
    const completions = [];
    const engine = new engineModule.exports.FishingEngine({
      getContext: () => ({}), addEventListener: () => {}, removeEventListener: () => {},
    }, {
      onChange: () => {}, onBigWin: () => {}, onNoFunds: () => {}, onCheckpoint: () => {},
      onAccept: () => { throw new Error("Restored bullets must not place a new wager"); },
      onComplete: async (id, claim) => { completions.push({ id, claim }); return true; },
    });
    const fish = { ...engine.snapshot().fish[0], id: 100, x: 600, y: 300, baseY: 300,
      vx: 0, vy: 0, drift: 0, wobbleAmp: 0, claimed: true, sp: { ...configModule.exports.SPECIES[0], mult: 7 } };
    const bullet = { wagerId: "original-hit", x: 600, y: 300, vx: 0, vy: -980, win: true,
      targetId: 100, bet: 10, level: 2, travelled: 0, maxDist: 500, platformCut: false };
    const saved = { fish: [fish], bullets: [bullet], pending: null, nextId: 101, time: 1, spawnTimer: 100 };
    await engine.restore(JSON.parse(JSON.stringify(saved)), [bullet.wagerId]);
    assert.equal(engine.snapshot().bullets[0].targetId, 100);
    assert.equal(completions.length, 0, "restoration itself cannot fabricate a claim");
    engine.update(0.01);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(completions, [{ id: "original-hit", claim: 70 }]);
    const miss = { ...bullet, wagerId: "original-retarget", targetId: 999, travelled: 600, maxDist: 500 };
    await engine.restore({ ...saved, fish: [], bullets: [miss] }, [miss.wagerId]);
    engine.update(0.05);
    engine.update(0.05);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(completions[1], { id: "original-retarget", claim: 0 });
  } finally { h.restore(); }
});
