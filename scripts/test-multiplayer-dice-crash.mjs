import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const cases = [
  { slug: "sic-bo", file: "sic-bo\\SicBoGame.tsx", capture: "live,phase,round,seconds,dice,history,lastResult,placeBet,setSelectedMarket,cancelBet", option: "small", result: { dice: [1, 2, 3], total: 6, side: "xiu" } },
  { slug: "tai-xiu", file: "tai-xiu-game\\casino.tsx", capture: "live,rolling,roundNo,seconds,outcome,personalBets,session,placeBet,setMode,roundsLeft,setRoundsLeft", option: "tai", result: { dice: [4, 5, 6], total: 15, side: "tai" } },
  { slug: "7-up-down", file: "7-up-down\\SevenUpDown.tsx", capture: "live,phase,roundNo,timeLeft,diceValues,history,lastResult,placeBet,undoLastBet,clearBets", option: "down", result: { dice: [1, 3], total: 4 } },
  { slug: "blast-off", file: "blast-off\\BlastOff.tsx", capture: "live,e,actions,settlements,setAuto,setTarget", option: "main", result: { crashPoint: 2.75 } },
  { slug: "nine-wickets", file: "nine-wickets\\Game.tsx", capture: "live,phase,round,timeLeft,match,balls,history,settled,stats,placeBet,cancelBet", option: "six", result: { outcome: "six" } },
];
const componentRoot = "src\\components\\";
const read = file => readFileSync(file, "utf8");
const changed = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
function room(c, phase = "betting", personal = []) {
  return {
    game: c.slug, serverNow: 105000, balance: 900,
    round: { roundNo: 71, phase, bettingEndsAt: 110000, resultAt: 114000, endsAt: 118000, result: phase === "result" ? c.result : null, multiplier: phase === "running" ? 1.4 : undefined },
    bets: personal, myBets: personal.filter(b => b.mine), queuedBets: [], myQueuedBets: [], history: [],
  };
}
const wager = (c, status = "pending", mine = true) => ({
  id: mine ? "personal-bet" : "other-bet", name: mine ? "P***1" : "Q***2", option: c.option,
  amount: 100, roundNo: 71, status, payout: status === "win" ? 196 : 0, mine,
  ...(c.slug === "blast-off" && status === "win" ? { cashoutMultiplier: 2 } : {}),
});

function harness(c, initial = room(c), network = null) {
  let cursor = 0, dirty = false, alive = true, captured, tree, effects = [];
  const slots = [], timers = new Map(), listeners = new Map(), calls = [], afterUnmount = [];
  let timerId = 0;
  const live = { state: initial, now: 105000, error: "", busy: false,
    place: async (...args) => { calls.push(["place", ...args]); return { ok: true, roundNo: live.state.round.roundNo + (live.state.round.phase === "betting" ? 0 : 1), queued: live.state.round.phase !== "betting" }; },
    cancel: async (...args) => { calls.push(["cancel", ...args]); return { ok: true, roundNo: args[0] }; },
    cashout: async (...args) => { calls.push(["cashout", ...args]); return { ok: true, roundNo: live.state.round.roundNo }; },
    refresh: async () => { calls.push(["refresh"]); },
  };
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[i].value, value => {
        if (!alive) { afterUnmount.push(i); return; }
        const next = typeof value === "function" ? value(slots[i].value) : value;
        if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true; }
      }];
    },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useEffect(fn, deps) {
      const i = cursor++, previous = slots[i];
      if (!previous || changed(previous.deps, deps)) {
        slots[i] = { deps, cleanup: previous?.cleanup };
        effects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { deps, value: fn };
      return slots[i].value;
    },
  };
  const jsx = (type, props) => ({ type: typeof type === "function" ? type.displayName ?? type.name : type, props });
  const window = {
    location: { href: "" },
    matchMedia: () => ({ matches: false, addEventListener: (name, fn) => listeners.set("media:" + name, fn), removeEventListener: name => listeners.delete("media:" + name) }),
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name),
  };
  const document = { getElementById: () => null, fullscreenElement: null, visibilityState: "visible",
    addEventListener: (name, fn) => listeners.set("document:" + name, fn),
    removeEventListener: name => listeners.delete("document:" + name) };
  const stub = name => Object.assign(() => null, { displayName: name });
  const cache = new Map();
  function load(file, capture = false) {
    if (cache.has(file)) return cache.get(file);
    let source = read(file);
    if (capture) {
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword));
      const result = fn?.body?.statements.findLast(n => ts.isReturnStatement(n));
      assert.ok(result, `${file}: component return found`);
      source = source.slice(0, result.getStart(ast)) + `__capture({${c.capture}});\n` + source.slice(result.getStart(ast));
    }
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
    const loaded = { exports: {} };
    const require = name => {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "@/lib/useMultiplayerGame") return network ? load("src\\lib\\useMultiplayerGame.ts") : { useMultiplayerGame: slug => { assert.equal(slug, c.slug); return live; } };
      if (name === "./walletSync") return { broadcastBalanceUpdate: (...args) => calls.push(["wallet", ...args]) };
      if (name === "./dailyPoolConsent") return { dailyPoolConsent: () => undefined };
      if (name === "@/lib/multiplayer-types") return load("src\\lib\\multiplayer-types.ts");
      if (name === "@/lib/betPresets") return { BET_PRESETS: [25, 50, 100, 500, 1000] };
      if (name === "@/lib/gameSfx") return { gameSfx: new Proxy({}, { get: () => () => {} }) };
      if (name.endsWith("/sound")) return { sfx: new Proxy({}, { get: () => () => {} }), playSound: () => {} };
      if (name === "./lib/engine") return load(path.join(path.dirname(file), "lib\\engine.ts"));
      if (name === "./lib/taixiu") return load("src\\components\\tai-xiu-game\\lib\\game.ts");
      if (name.endsWith(".css")) return {};
      if (name === "next/image" || name === "next/link") return { __esModule: true, default: stub(name) };
      return new Proxy({ __esModule: true, default: stub(name) }, { get: (obj, key) => obj[key] ?? stub(String(key)) });
    };
    new Function("require", "module", "exports", "__capture", "window", "document", "setTimeout", "clearTimeout", "fetch", "setInterval", "clearInterval", output)(
      require, loaded, loaded.exports, value => { captured = value; }, window, document,
      (fn, delay = 0) => { timers.set(++timerId, { fn, delay }); return timerId; }, id => timers.delete(id),
      network ?? (() => { throw new Error("Components must never perform financial network writes"); }),
      (fn, delay) => { timers.set(++timerId, { fn, delay, interval: true }); return timerId; }, id => timers.delete(id),
    );
    cache.set(file, loaded.exports);
    return loaded.exports;
  }
  const Component = load(componentRoot + c.file, true).default;
  function render(next, { flushTimers = true } = {}) {
    if (next) live.state = next;
    let count = 0;
    do {
      dirty = false; cursor = 0; effects = [];
      tree = Component({});
      for (const effect of effects) effect();
      if (flushTimers) {
        for (const [id, timer] of [...timers]) {
          if (timer.delay !== 0 || timer.interval) continue;
          timers.delete(id);
          timer.fn();
        }
      }
      assert.ok(++count < 30, `${c.slug}: component stabilizes`);
    } while (dirty);
    return captured;
  }
  function unmount() {
    alive = false;
    for (const slot of slots) slot.cleanup?.();
  }
  return { live, calls, render, unmount, window, listeners, timers, afterUnmount, get captured() { return captured; }, get tree() { return tree; } };
}
function nodes(tree) {
  if (tree == null || typeof tree === "boolean") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (typeof tree !== "object") return [tree];
  return [tree, ...nodes(tree.props?.children)];
}
const text = tree => nodes(tree).filter(n => typeof n === "string" || typeof n === "number").join(" ");
function assertLivePanel(h) {
  assert.ok(nodes(h.tree).some(n => n?.type === "LiveMultiplayerBets" && n.props.state === h.live.state), "actual shared-state panel present");
}
async function place(h, c) {
  if (c.slug === "sic-bo") {
    h.captured.setSelectedMarket({ id: c.option, label: "Small", description: "", payout: 1 }); h.render();
    await h.captured.placeBet();
  } else if (c.slug === "tai-xiu") await h.captured.placeBet();
  else if (c.slug === "blast-off") { h.captured.actions.placeBet(); await Promise.resolve(); }
  else await h.captured.placeBet(c.option, 100);
}

for (const c of cases) {
  test(`${c.slug}: actual source consumes shared clock/result and never manufactures spectator records`, () => {
    const h = harness(c); let a = h.render();
    assertLivePanel(h);
    assert.equal(a.seconds ?? a.timeLeft ?? a.e.cd, 5);
    h.live.now = 108500; a = h.render();
    assert.equal(a.seconds ?? a.timeLeft ?? a.e.cd, c.slug === "blast-off" ? 1.5 : 2);
    const finished = room(c, "result");
    a = h.render(finished);
    if (c.slug === "sic-bo") { assert.deepEqual(a.dice, c.result.dice); assert.equal(a.lastResult, null); }
    if (c.slug === "7-up-down") { assert.deepEqual(a.diceValues, c.result.dice); assert.equal(a.lastResult, null); }
    if (c.slug === "tai-xiu") { assert.equal(a.outcome.total, c.result.total); assert.equal(a.personalBets.length, 0); assert.equal(a.outcome.stake, 0); }
    if (c.slug === "nine-wickets") { assert.equal(a.balls[0].outcome, c.result.outcome); assert.equal(a.stats.bets, 0); assert.equal(a.settled, null); }
    if (c.slug === "blast-off") { assert.equal(a.e.multiplier, c.result.crashPoint); assert.equal(a.e.bet, null); assert.equal(a.e.stats.rounds, 0); assert.equal(a.e.roster.length, 0); }
    assert.equal((a.history ?? a.personalBets ?? a.settlements).length, 0);
    assert.deepEqual(h.calls, []);
    h.unmount();
  });
  test(`${c.slug}: actual UI places through server hook, displays masked players and cancels N+1 reservations`, async () => {
    const state = room(c, "running", [wager(c, "pending", false)]);
    state.queuedBets = [ { ...wager(c), id: "queued", roundNo: 72 } ];
    state.myQueuedBets = state.queuedBets;
    const h = harness(c, state); h.render();
    assertLivePanel(h);
    await place(h, c);
    assert.equal(h.calls[0][0], "place"); assert.equal(h.calls[0][1], c.option);
    assert.equal(h.calls[0][2], c.slug === "sic-bo" || c.slug === "7-up-down" ? 25 : 100);
    const cancel = nodes(h.tree).find(n => n?.type === "button" && text(n).includes("Cancel next-round bets"));
    assert.ok(cancel, "server reservation has cancellation UI");
    cancel.props.onClick();
    assert.deepEqual(h.calls.at(-1), ["cancel", 72]);
    if (c.slug === "blast-off") assert.deepEqual(h.captured.e.roster.map(r => r.name), ["Q***2"]);
    h.unmount();
  });
  test(`${c.slug}: settled personal wagers use server payouts once; zero stakes never affect statistics`, () => {
    const h = harness(c);
    const rows = [wager(c, "win"), { ...wager(c, "lose"), id: "zero", amount: 0 }];
    const state = room(c, "result", rows);
    const a = h.render(state);
    const personal = a.history ?? a.personalBets ?? a.settlements;
    assert.equal(personal.length, 1);
    assert.equal(h.render({ ...state }).history?.length ?? h.captured.personalBets?.length ?? h.captured.settlements?.length, 1);
    if (c.slug === "sic-bo") assert.equal(a.lastResult.profit, 96);
    if (c.slug === "7-up-down") assert.equal(a.lastResult.payout, 96);
    if (c.slug === "tai-xiu") assert.equal(a.personalBets[0].payout, 196);
    if (c.slug === "nine-wickets") assert.equal(a.stats.returned, 196);
    if (c.slug === "blast-off") assert.equal(a.e.stats.net, 96);
    h.unmount();
  });
  test(`${c.slug}: a daily-pool claim is not recorded as a paid loss or wallet win`, () => {
    const h = harness(c);
    const state = room(c, "result", [{ ...wager(c, "lose"), poolPending: true, poolClaim: 0 }]);
    const a = h.render(state);
    if (c.slug === "7-up-down") assert.match(a.lastResult.poolMessage, /daily pool payout pending/);
    else {
      const personal = a.history ?? a.personalBets ?? a.settlements;
      assert.equal(personal.length, 0);
    }
    if (c.slug === "blast-off") {
      assert.equal(a.e.stats.net, 0);
      assert.match(a.e.notice, /daily payout pending/);
      assert.doesNotMatch(text(h.tree), /Lost -|Won \+/);
    }
    if (c.slug === "nine-wickets") assert.equal(a.stats.returned, 0);
    assert.deepEqual(h.calls, []);
    h.unmount();
  });
  test(`${c.slug}: components contain no personal clock engine, random outcomes, wallet writes or fabricated players`, () => {
    const source = read(componentRoot + c.file);
    assert.doesNotMatch(source, /Math\.random|setInterval|requestAnimationFrame|useGameBalance|reportGameBalanceChange|setGameBalance|\/api\/roll|useLiveTable|useRoundQueue|useLiveBetQueue|SEED_BALLS|DEMO_ACTIVITY|EXAMPLE_ROUNDS|buildRoster|generateCrashPoint/);
    assert.match(source, /useMultiplayerGame/);
  });
}

test("blast-off: auto is one server-owned cashout target, manual cashout is a real action and no repeat wager is generated", async () => {
  const c = cases.find(c => c.slug === "blast-off"), h = harness(c);
  h.render(); h.captured.setTarget(3.5); h.render();
  h.captured.actions.placeBet();
  assert.deepEqual(h.calls, [["place", "main", 100, 3.5]]);
  h.captured.setAuto(false); h.render(); h.captured.actions.placeBet();
  assert.deepEqual(h.calls.at(-1), ["place", "main", 100, undefined]);
  h.live.now = 111000;
  h.render(room(c, "running", [wager(c)]));
  assert.ok(Math.abs(h.captured.e.multiplier - Math.exp(.155)) < 1e-10);
  h.captured.actions.cashOut();
  assert.deepEqual(h.calls.at(-1), ["cashout", "personal-bet"]);
  h.render(room(c, "result", [wager(c, "lose")]));
  const next = room(c); next.round.roundNo = 72; h.render(next);
  assert.equal(h.calls.filter(c => c[0] === "place").length, 2);
  h.unmount(); assert.equal(h.listeners.size, 0);
});

test("blast-off: hidden future deadlines do not control flight animation or predict cashouts", () => {
  const c = cases.find(c => c.slug === "blast-off");
  for (const phase of ["betting", "running"]) {
    const state = room(c, phase, [wager(c)]);
    state.round.resultAt = 0;
    state.round.endsAt = 0;
    const h = harness(c, state);
    h.live.now = 112000;
    let a = h.render();
    const expected = phase === "running" ? Math.exp(.155 * 2) : 1;
    assert.equal(a.e.multiplier, expected);
    assert.equal(a.e.crashPoint, expected);
    assert.equal(a.e.hold, 0);
    assert.equal(a.e.roster[0].cashoutAt, null);
    assert.equal(a.e.roster[0].cashedAt, null);
    const altered = { ...state, round: { ...state.round, resultAt: 990000, endsAt: 999000 } };
    a = h.render(altered);
    assert.equal(a.e.multiplier, expected);
    assert.equal(a.e.hold, 0);
    assert.deepEqual(h.calls, []);
    h.unmount();
  }
});

test("nine-wickets: late joins use persisted shared match snapshot, not a private replay or fake viewer count", () => {
  const c = cases.find(c => c.slug === "nine-wickets"), state = room(c, "result");
  const match = { batting: 1, runs: 96, wickets: 3, balls: 67, target: 151, innings: 2 };
  state.round.result = { ...c.result, match };
  const h = harness(c, state); h.render();
  assert.equal(h.captured.match, match);
  assert.match(read(componentRoot + c.file), /viewers=\{playerBets\}/);
  assert.doesNotMatch(read("src\\components\\tai-xiu-game\\casino-dialogs.tsx"), /lucky\.ace|goldrush|Add 5,000 free coins|balance: Math\.min/);
  h.unmount();
});

test("tai-xiu: opt-in repeated auto rounds advance only on new shared betting windows, and stop is effective", async () => {
  const c = cases.find(c => c.slug === "tai-xiu"), h = harness(c);
  h.render(); h.captured.setMode("auto"); h.render(); await h.captured.placeBet(); h.render();
  assert.equal(h.captured.roundsLeft, 4); assert.equal(h.calls.length, 1);
  h.render(); assert.equal(h.calls.length, 1);
  const state = room(c); state.round.roundNo = 72;
  h.render(state); await Promise.resolve(); h.render();
  assert.equal(h.calls.length, 2); assert.equal(h.captured.roundsLeft, 3);
  h.captured.setRoundsLeft(0); h.render(); state.round.roundNo = 73; h.render({ ...state });
  assert.equal(h.calls.length, 2);
  h.unmount();
});

for (const slug of ["sic-bo", "tai-xiu", "nine-wickets"]) {
  test(`${slug}: pending placement cannot update component state after unmount`, async () => {
    const c = cases.find(c => c.slug === slug), h = harness(c);
    let resolve;
    h.live.place = () => new Promise(done => { resolve = done; });
    h.render();
    const pending = place(h, c);
    h.unmount(); resolve({ ok: true, roundNo: 71 }); await pending;
    assert.deepEqual(h.afterUnmount, []);
    assert.equal(h.timers.size, 0);
  });
}

for (const c of cases.filter(c => c.slug !== "blast-off")) {
  test(`${c.slug}: deferred settlement is cancelled on cleanup and replays once after an interrupted effect`, () => {
    const h = harness(c);
    const state = room(c, "result", [wager(c, "win")]);
    h.render(state, { flushTimers: false });
    assert.equal((h.captured.history ?? h.captured.personalBets).length, 0);
    h.render({ ...state });
    assert.equal((h.captured.history ?? h.captured.personalBets).length, 1);
    h.render({ ...state });
    assert.equal((h.captured.history ?? h.captured.personalBets).length, 1);
    h.unmount();
    const pending = harness(c);
    pending.render(state, { flushTimers: false });
    pending.unmount();
    assert.equal(pending.timers.size, 0);
    assert.deepEqual(pending.afterUnmount, []);
  });
}

const flush = async h => { for (let i = 0; i < 8; i++) { await Promise.resolve(); h.render(); } };
test("actual hook + component: countdown zero routes current/queued/cancel/cashout only to multiplayer API", async () => {
  const c = cases.find(c => c.slug === "blast-off");
  let state = room(c), clock = state.serverNow;
  const requests = [], replies = [];
  const network = async (url, init = {}) => {
    requests.push({ url, ...init });
    if (init.method === "POST") {
      const action = JSON.parse(init.body); replies.push(action);
      return { ok: true, json: async () => ({ ok: true, roundNo: action.roundNo }) };
    }
    return { ok: true, json: async () => ({ ...state, serverNow: clock }) };
  };
  const h = harness(c, state, network); h.render(); await flush(h);
  assert.equal(h.captured.live.state.round.roundNo, 71);
  await h.captured.live.place("main", 100, 2); await flush(h);
  assert.equal(replies.at(-1).roundNo, 71);
  clock = state.round.bettingEndsAt - 300;
  await h.captured.live.refresh(); await flush(h);
  await h.captured.live.place("main", 100, 2); await flush(h);
  assert.equal(replies.at(-1).roundNo, 71);
  clock = state.round.bettingEndsAt;
  await h.captured.live.refresh(); await flush(h);
  await h.captured.live.place("main", 100, 2); await flush(h);
  assert.equal(replies.at(-1).roundNo, 72);
  await h.captured.live.cancel(72, "queued-bet"); await flush(h);
  assert.equal(replies.at(-1).action, "cancel"); assert.equal(replies.at(-1).betId, "queued-bet");
  state = room(c, "running", [wager(c)]); clock = state.round.bettingEndsAt + 1000;
  await h.captured.live.refresh(); await flush(h);
  await h.captured.live.cashout("personal-bet"); await flush(h);
  assert.equal(replies.at(-1).action, "cashout"); assert.equal(replies.at(-1).roundNo, 71);
  assert.ok(requests.every(r => r.url === "/api/multiplayer/blast-off"));
  assert.equal(new Set(replies.map(r => r.requestId)).size, replies.length);
  assert.deepEqual(h.calls.filter(c => c[0] === "wallet"), [["wallet", 900, "blast-off"]]);
  h.unmount();
  assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
});

test("actual hook + component: unmount aborts both live read and pending wager without local state or wallet writes", async () => {
  const c = cases.find(c => c.slug === "blast-off"), state = room(c);
  const requests = [];
  let resolvePost, resolveRead;
  const h = harness(c, state, (url, init = {}) => {
    requests.push({ url, ...init });
    if (init.method === "POST") return new Promise(resolve => { resolvePost = resolve; });
    if (requests.length === 1) return Promise.resolve({ ok: true, json: async () => state });
    return new Promise(resolve => { resolveRead = resolve; });
  });
  h.render(); await flush(h);
  const post = h.captured.live.place("main", 100);
  const read = h.captured.live.refresh();
  h.unmount();
  assert.ok(requests.slice(1).every(r => r.signal.aborted));
  resolvePost({ ok: true, json: async () => ({ ok: true, roundNo: 71 }) });
  resolveRead({ ok: true, json: async () => ({ ...state, balance: 800 }) });
  await Promise.all([post, read]);
  assert.deepEqual(h.afterUnmount, []);
  assert.equal(h.calls.filter(c => c[0] === "wallet").length, 1);
  assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
});
