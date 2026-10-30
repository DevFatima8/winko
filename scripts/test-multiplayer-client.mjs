import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function scene(game = "baccarat") {
  let cursor = 0, dirty = true, view, now = 10000, uuid = 0;
  const slots = [], effects = [], calls = [], broadcasts = [], logs = [], notices = [], timers = new Map();
  const same = (a, b) => a && b && a.length === b.length && a.every((item, index) => Object.is(item, b[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, (next) => {
        slots[index].value = typeof next === "function" ? next(slots[index].value) : next;
        dirty = true;
      }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useCallback(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: fn, deps };
      return slots[index].value;
    },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps, cleanup: previous?.cleanup };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn(); });
      }
    },
  };
  const clock = class extends Date { static now() { return now; } };
  const schedule = (fn, delay, interval = false) => {
    const id = Symbol();
    timers.set(id, { fn, delay, interval });
    return id;
  };
  const require = (name) => {
    if (name === "react") return react;
    if (name === "./walletSync") return { broadcastBalanceUpdate: (...args) => broadcasts.push(args) };
    if (name === "./dailyPoolConsent") return { dailyPoolConsent: () => undefined };
    if (name === "./gameResultNotice") return { notifyGameResult: (...args) => notices.push(args) };
    if (name === "./cardGameRules" || name === "./rouletteGameRules") {
      const module = { exports: {} };
      const rules = ts.transpileModule(readFileSync(`src\\lib\\${name.slice(2)}.ts`, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      }).outputText;
      new Function("exports", rules)(module.exports);
      return module.exports;
    }
    throw new Error(`Unexpected client import ${name}`);
  };
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync("src\\lib\\useMultiplayerGame.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const document = { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" };
  const fetch = (url, options) => new Promise((resolve, reject) => {
    calls.push({ url, options, resolve, reject });
    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  });
  new Function("require", "exports", "fetch", "document", "Date", "crypto", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "console", code)(
    require, loaded.exports, fetch, document, clock, { randomUUID: () => `request-${++uuid}` },
    (fn, delay) => schedule(fn, delay), (id) => timers.delete(id),
    (fn, delay) => schedule(fn, delay, true), (id) => timers.delete(id),
    { error: (...args) => logs.push({ level: "error", args }), warn: (...args) => logs.push({ level: "warn", args }) },
  );
  function flush() {
    for (let count = 0; dirty && count < 20; count++) {
      dirty = false;
      cursor = 0;
      view = loaded.exports.useMultiplayerGame(game);
      for (const effect of effects.splice(0)) effect();
    }
    assert.equal(dirty, false);
  }
  flush();
  return {
    calls, broadcasts, logs, notices, timers, flush,
    get view() { flush(); return view; },
    setNow(value) { now = value; },
    async respond(index, data, status = 200) {
      calls[index].resolve({ ok: status < 400, status, json: async () => data });
      for (let count = 0; count < 10; count++) await Promise.resolve();
      flush();
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

const state = (overrides = {}) => ({
  game: "baccarat", serverNow: 10000, balance: 1000,
  round: { roundNo: 71, phase: "betting", bettingEndsAt: 20000, resultAt: 24000, endsAt: 29000, result: null },
  bets: [], queuedBets: [], myBets: [], myQueuedBets: [], history: [], ...overrides,
});

test("live transport coalesces reads and only broadcasts changed authoritative balances", async () => {
  const s = scene();
  const a = s.view.refresh();
  assert.equal(s.view.refresh(), a);
  assert.equal(s.calls.length, 1);
  await s.respond(0, state());
  await a;
  assert.deepEqual(s.broadcasts, [[1000, "baccarat"]]);
  const b = s.view.refresh();
  await s.respond(1, state({ serverNow: 11000 }));
  await b;
  assert.equal(s.broadcasts.length, 1);
  assert.equal(s.view.state.round.roundNo, 71);
  s.unmount();
  assert.equal(s.timers.size, 0);
});

test("spectator connection has public live wagers but no wallet or wager writes", async () => {
  const s = scene();
  const bets = [{ id: "bet1", name: "A***n", option: "banker", amount: 100, roundNo: 71, status: "pending", payout: 0, mine: false }];
  await s.respond(0, state({ balance: null, bets }));
  assert.deepEqual(s.view.state.bets, bets);
  assert.deepEqual(s.broadcasts, []);
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].options.method, undefined);
  s.unmount();
});

test("card bets target only the displayed open round, including its final milliseconds", async () => {
  for (const time of [10000, 19501, 19999]) {
    const target = 71;
    const s = scene();
    await s.respond(0, state());
    s.setNow(time);
    const placing = s.view.place("player", 100);
    const body = JSON.parse(s.calls[1].options.body);
    assert.equal(body.roundNo, target);
    assert.equal(body.option, "player");
    assert.equal(body.amount, 100);
    assert.equal(body.action, "bet");
    assert.equal(body.requestId, "request-1");
    await s.respond(1, { ok: true, roundNo: target, queued: target === 72 });
    await s.respond(2, state());
    await placing;
    s.unmount();
  }
});

test("all live cards and roulettes reject closed-round bets without submitting N+1 requests", async () => {
  for (const game of ["baccarat", "speed-baccarat", "32-cards", "auto-roulette", "lightning-roulette"]) {
    for (const phase of ["betting", "running", "result"]) {
      const s = scene(game);
      await s.respond(0, state({ game, round: { ...state().round, phase } }));
      s.setNow(phase === "betting" ? 20000 : 22000);
      assert.match((await s.view.place("player", 100)).error, /Wait for the next round/);
      assert.equal(s.calls.length, 1);
      s.unmount();
    }
  }
});

test("unrelated live games retain their existing explicit N+1 reservations", async () => {
  const s = scene("nine-wickets");
  await s.respond(0, state({ game: "nine-wickets" }));
  s.setNow(22000);
  const pending = s.view.place("six", 100);
  assert.equal(JSON.parse(s.calls[1].options.body).roundNo, 72);
  await s.respond(1, { ok: true, roundNo: 72, queued: true });
  await s.respond(2, state({ game: "nine-wickets" }));
  await pending;
  s.unmount();
});

test("duplicate rapid clicks are refused while one bet is pending", async () => {
  const s = scene();
  await s.respond(0, state());
  const pending = s.view.place("player", 100);
  assert.ok("error" in await s.view.place("player", 100));
  assert.equal(s.calls.length, 2);
  await s.respond(1, { ok: true, roundNo: 71 });
  await s.respond(2, state());
  await pending;
  s.unmount();
});

test("stale round rejection is shown and never becomes a success-shaped response", async () => {
  const s = scene();
  await s.respond(0, state());
  const pending = s.view.place("player", 100);
  await s.respond(1, { error: "Round has changed" }, 409);
  await s.respond(2, state());
  assert.deepEqual(await pending, { error: "Round has changed" });
  s.unmount();
});

test("unmount aborts pending polling and does not broadcast a late wallet response", async () => {
  const s = scene();
  s.unmount();
  assert.equal(s.calls[0].options.signal.aborted, true);
  await s.respond(0, state());
  assert.deepEqual(s.broadcasts, []);
  assert.equal(s.timers.size, 0);
  assert.deepEqual(s.logs, []);
});

test("state timeout releases the in-flight read and exposes an explicit reconnect error", async () => {
  const s = scene();
  const timeout = [...s.timers.values()].find((timer) => timer.delay === 15000);
  timeout.fn();
  for (let count = 0; count < 10; count++) await Promise.resolve();
  assert.match(s.view.error, /timed out/);
  assert.equal(s.logs.length, 1);
  assert.equal(s.logs[0].level, "warn");
  assert.match(s.logs[0].args[2], /timed out/);
  const retry = s.view.refresh();
  assert.equal(s.calls.length, 2);
  await s.respond(1, state());
  await retry;
  assert.equal(s.view.error, "");
  s.unmount();
});

test("a real state failure is still logged and recovers on the next read", async () => {
  const s = scene();
  const failed = s.view.refresh();
  const failure = new TypeError("Failed to fetch");
  s.calls[0].reject(failure);
  await failed;
  assert.match(s.view.error, /interrupted/);
  assert.deepEqual(s.logs, [{ level: "error", args: ["[multiplayer state]", "baccarat", failure] }]);
  const retry = s.view.refresh();
  await s.respond(1, state());
  await retry;
  assert.equal(s.view.error, "");
  s.unmount();
});

test("a successful bet stays successful when its state refresh times out without resubmitting", async () => {
  const s = scene();
  await s.respond(0, state());
  const placing = s.view.place("player", 100);
  const reply = { ok: true, roundNo: 71, queued: false };
  await s.respond(1, reply);
  assert.equal([...s.timers.values()].some((timer) => timer.delay === 20000), false);
  const timeout = [...s.timers.values()].find((timer) => timer.delay === 15000);
  timeout.fn();
  assert.deepEqual(await placing, reply);
  assert.equal(s.view.busy, false);
  assert.match(s.view.error, /timed out/);
  assert.equal(s.calls.filter((call) => call.options.method === "POST").length, 1);
  assert.equal(s.logs.some((log) => log.level === "error"), false);
  const retry = s.view.refresh();
  await s.respond(3, state({ balance: 900 }));
  await retry;
  assert.equal(s.view.error, "");
  assert.equal(s.view.state.balance, 900);
  s.unmount();
});

test("nine-wickets action timeout warns and checks live status without placing another bet", async () => {
  const s = scene("nine-wickets");
  await s.respond(0, state({ game: "nine-wickets" }));
  const placing = s.view.place("six", 100);
  const timeout = [...s.timers.values()].find(timer => timer.delay === 20000);
  timeout.fn();
  const reply = await placing;
  assert.match(reply.error, /timed out.*may already have been accepted/);
  assert.equal(s.calls[1].options.signal.reason.name, "TimeoutError");
  assert.equal(s.view.busy, false);
  assert.match(s.view.error, /Check bet status/);
  assert.equal(s.logs.length, 1);
  assert.equal(s.logs[0].level, "warn");
  assert.equal(s.logs[0].args[1], "nine-wickets");
  assert.equal(s.calls.length, 3);
  assert.equal(s.calls[2].options.method, undefined, "recovery only reads live state");
  const accepted = { id: "bet-1", option: "six", amount: 100, roundNo: 71, status: "pending", mine: true };
  await s.respond(2, state({ game: "nine-wickets", balance: 900, myBets: [accepted] }));
  assert.equal(s.view.state.balance, 900);
  assert.deepEqual(s.view.state.myBets, [accepted]);
  assert.equal(s.calls.filter(call => call.options.method === "POST").length, 1);
  s.unmount();
  assert.equal(s.timers.size, 0);
});

test("leaving nine-wickets aborts a pending action without logging a console error or retrying it", async () => {
  const s = scene("nine-wickets");
  await s.respond(0, state({ game: "nine-wickets" }));
  const placing = s.view.place("six", 100);
  s.unmount();
  assert.equal(s.calls[1].options.signal.aborted, true);
  assert.deepEqual(await placing, { error: "Request cancelled." });
  assert.deepEqual(s.logs, []);
  assert.equal(s.calls.length, 2);
  assert.equal(s.timers.size, 0);
});

test("real action failures remain visible and trigger a status read without another wager", async () => {
  const s = scene("nine-wickets");
  await s.respond(0, state({ game: "nine-wickets" }));
  const placing = s.view.place("six", 100);
  const cause = new TypeError("Failed to fetch");
  s.calls[1].reject(cause);
  assert.deepEqual(await placing, { error: "Connection interrupted. Check bet status before trying again." });
  assert.equal(s.view.busy, false);
  assert.deepEqual(s.logs, [{ level: "error", args: ["[multiplayer action]", "nine-wickets", cause] }]);
  assert.equal(s.calls.length, 3);
  assert.equal(s.calls[2].options.method, undefined);
  assert.equal(s.calls.filter(call => call.options.method === "POST").length, 1);
  await s.respond(2, state({ game: "nine-wickets" }));
  s.unmount();
});

test("multiplayer results aggregate the player's finished bets once, never spectators or queued bets", async () => {
  const s = scene("nine-wickets");
  await s.respond(0, state({ game: "nine-wickets", bets: [{ id: "spectator", status: "win", payout: 999 }] }));
  assert.equal(s.notices.length, 0);
  const finished = state({
    game: "nine-wickets",
    myBets: [
      { id: "a", roundNo: 71, status: "win", poolPending: true, poolClaim: 250, payout: 0 },
      { id: "b", roundNo: 71, status: "lose", poolPending: true, poolClaim: 0, payout: 0 },
    ],
    myQueuedBets: [{ id: "next", roundNo: 72, status: "pending", payout: 0 }],
  });
  const refresh = s.view.refresh();
  await s.respond(1, finished);
  await refresh;
  assert.deepEqual(s.notices, [["nine-wickets", "71:a,b", 250, true]]);
  const repeated = s.view.refresh();
  await s.respond(2, finished);
  await repeated;
  assert.equal(s.notices.length, 1);
  s.unmount();
});

test("multiplayer no-win and confirmed cashout results use their actual amounts", async () => {
  const s = scene("blast-off");
  await s.respond(0, state({
    game: "blast-off",
    myBets: [
      { id: "cashout", roundNo: 71, status: "win", payout: 220 },
      { id: "flying", roundNo: 71, status: "pending", payout: 0 },
    ],
  }));
  assert.deepEqual(s.notices, [["blast-off", "71:cashout", 220, false]]);
  const refresh = s.view.refresh();
  await s.respond(1, state({ game: "blast-off", myBets: [{ id: "flying", roundNo: 71, status: "lose", payout: 0 }] }));
  await refresh;
  assert.deepEqual(s.notices[1], ["blast-off", "71:flying", 0, false]);
  s.unmount();
});
