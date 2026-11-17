import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

function load(file, imports = {}, globals = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", "window", "document", "performance", code)(name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  }, mod, mod.exports, globals.window, globals.document, globals.performance);
  return mod.exports;
}

const config = load("src\\components\\birds-beasts\\lib\\game-config.ts");
const { resolveBirdsBeastsRound: play } = load("src\\lib\\birdsBeastsRounds.ts", {
  "node:crypto": crypto, "@/components/birds-beasts/lib/game-config": config,
});
const ID = "birds-beasts:rounds-20-target:v2";
function store() {
  const rows = new Map();
  return {
    rows,
    get: async (table, id) => structuredClone(rows.get(`${table}:${id}`) ?? null),
    put: async (table, id, row) => { rows.set(`${table}:${id}`, structuredClone(row)); },
  };
}

test("100 player-rounds count once each, including multi-option and idle rounds, with exact appearance quotas", async () => {
  const tx = store();
  const choices = [
    { eagle: 50 }, { owl: 50, lion: 50, panda: 50, chicken: 50, rabbit: 50, goldenShark: 50, silverShark: 50 },
    {}, { birds: 50, beasts: 50 }, { goldenShark: 50 }, { silverShark: 50 },
  ];
  for (let block = 0; block < 100; block++) {
    const counts = { x8: 0, x12: 0, goldenShark: 0, silverShark: 0 };
    for (let round = 1; round <= 100; round++) {
      const bets = choices[crypto.randomInt(choices.length)];
      const reply = await play(tx, bets);
      const { slot, animal } = reply.outcome;
      assert.equal(config.WHEEL[slot], animal);
      const result = config.evaluateBets(bets, slot);
      assert.equal(reply.claim, result.payout);
      assert.equal(reply.outcome.outcome, config.totalOf(bets) === 0 ? "idle" : result.net > 0 ? "win" : "lose");
      if (config.SHARKS.includes(animal)) {
        counts[animal]++;
        assert.ok(round >= 91, `Shark at ${round}`);
      } else if (config.ANIMALS[animal].multiplier === 8) counts.x8++;
      else if (config.ANIMALS[animal].multiplier === 12) counts.x12++;
      const saved = await tx.get("multiplayerrooms", ID);
      assert.equal(saved.remaining.length, round === 100 ? 100 : 100 - round);
    }
    assert.deepEqual(counts, { x8: 2, x12: 2, goldenShark: 1, silverShark: 1 });
  }
});

test("20 winning targets are used but impossible results are not forged and all combinations still settle", async () => {
  const tx = store();
  // Both ordinary categories have winning and losing lights for this allocation.
  const bets = { eagle: 50, owl: 50, chicken: 50 };
  await tx.put("multiplayerrooms", ID, {
    remaining: [...Array(90).fill("regular"), "x8", "x8", "x12", "x12",
      ...Array(4).fill("regular"), "goldenShark", "silverShark"],
    targets: [...Array(20).fill(true), ...Array(80).fill(false)],
  });
  let matched = 0;
  let actualWins = 0;
  for (let round = 0; round < 100; round++) {
    const before = await tx.get("multiplayerrooms", ID);
    const wantWin = before.targets[0];
    const reply = await play(tx, bets);
    if (wantWin) matched++;
    actualWins += Number(reply.outcome.outcome === "win");
    if (!config.SHARKS.includes(reply.outcome.animal)) {
      assert.equal(reply.outcome.outcome === "win", wantWin);
    }
  }
  assert.equal(matched, 20);
  assert.equal(actualWins, 20);
  // This allocation loses money on every light: a target win cannot override the paytable.
  const covering = Object.fromEntries([...config.ANIMAL_IDS, "birds", "beasts"].map(key => [key, key.includes("Shark") ? 1 : 1000]));
  const reply = await play(tx, covering);
  assert.equal(reply.claim, config.evaluateBets(covering, reply.outcome.slot).payout);
  await tx.put("multiplayerrooms", ID, { remaining: ["goldenShark", "silverShark"], targets: [true, false] });
  const impossibleWin = await play(tx, { eagle: 50 });
  assert.equal(impossibleWin.outcome.animal, "goldenShark");
  assert.equal(impossibleWin.outcome.outcome, "lose");
  assert.equal(impossibleWin.claim, 0);
});

test("invalid saved schedules fail rather than silently resetting the quotas", async () => {
  for (const saved of [
    { remaining: ["goldenShark", ...Array(99).fill("regular")], targets: Array(100).fill(false) },
    { remaining: ["x8", "x8", "x8"], targets: [false, false, false] },
    { remaining: ["unknown"], targets: [true] },
    { remaining: ["regular"], targets: [] },
  ]) {
    const tx = store();
    await tx.put("multiplayerrooms", ID, saved);
    await assert.rejects(play(tx, {}), /cycle is invalid/);
  }
});

test("paid round replay cannot advance the cycle twice or credit a second payout", async () => {
  const s = createLegacyScene(["alice"], { poolEnabled: false });
  s.data.games.push({ _id: "birds-beasts", slug: "birds-beasts", isActive: true });
  const wagerId = crypto.randomUUID();
  await s.store.transact("birds-beasts", tx => s.browser.browserPoolLifecycle(tx, "alice", {
    game: "birds-beasts", wagerId, operationId: crypto.randomUUID(), action: "accept", amount: 100,
  }, false));
  const resolve = () => s.store.transact("birds-beasts", tx => s.browser.resolveServerBrowserWager(tx, "alice", {
    game: "birds-beasts", wagerId, operationId: crypto.randomUUID(), selection: { bets: { birds: 50, beasts: 50 } },
  }, false));
  const accepted = structuredClone(s.data);
  s.failNext("gameresults");
  await assert.rejects(resolve(), /Injected database failure/);
  assert.deepEqual(s.data, accepted, "Failed settlement must roll back both the cycle and the wallet");
  const first = await resolve();
  const state = structuredClone(s.data.multiplayerrooms);
  const balance = s.data.users[0].balance;
  const replays = await Promise.all([resolve(), resolve()]);
  for (const replay of replays) assert.deepEqual(replay.outcome, first.outcome);
  assert.equal(s.data.users[0].balance, balance);
  assert.deepEqual(s.data.multiplayerrooms, state);
  assert.equal(s.data.multiplayerrooms.find(row => row._id === ID).remaining.length, 99);
});

test("idle round API retries reuse one scheduled result and cannot settle paid bets", async () => {
  let open = false;
  const sharedResult = { slot: config.WHEEL.indexOf("owl"), animal: "owl", outcome: "idle" };
  const route = load("src\\app\\api\\spin\\route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    "@/lib/gameAvailability": { LOCAL_GAMES_CONNECTED: true },
    "@/lib/serverAuth": { getServerSessionUser: async () => ({ id: "alice" }) },
    "@/lib/multiplayer": { multiplayer: { read: async game => {
      assert.equal(game, "birds-beasts");
      return { round: { roundNo: 20, result: open ? null : sharedResult } };
    } } },
  });
  const request = body => ({ json: async () => body });
  const roundId = crypto.randomUUID();
  const first = await route.POST(request({ roundId }));
  const replay = await route.POST(request({ roundId }));
  assert.equal(first.status, 200);
  assert.deepEqual(replay, first);
  assert.equal(first.body.roundNo, 20);
  assert.deepEqual((await route.POST(request({ roundId: crypto.randomUUID() }))).body, first.body);
  assert.equal((await route.POST(request({ roundId, bets: { eagle: 50 } }))).status, 400);
  open = true;
  assert.equal((await route.POST(request({ roundId }))).status, 409);
});

test("animal multipliers include stake exactly once, including multiple winning selections", () => {
  const owl = config.WHEEL.indexOf("owl");
  assert.equal(config.evaluateBets({ owl: 100 }, owl).payout, 800);
  assert.equal(config.evaluateBets({ owl: 100 }, owl).net, 700);
  assert.equal(config.evaluateBets({ owl: 100, rabbit: 100 }, owl).payout, 800);
  assert.equal(config.evaluateBets({ owl: 100, birds: 100 }, owl).payout, 995);
  const shark = config.WHEEL.indexOf("goldenShark");
  assert.equal(config.evaluateBets({ goldenShark: 100, birds: 100 }, shark).payout, 5000);
});

const animationFile = "src\\components\\birds-beasts\\hooks\\useWheelAnimation.ts";
const { wheelStepAt } = load(animationFile, {
  react: {}, "@/lib/visibleAnimationFrame": {}, "../lib/game-config": config,
});

test("every wheel target advances clockwise without a long penultimate pause and stops exactly on its outcome", () => {
  for (let target = 0; target < config.SLOT_COUNT; target++) {
    const finalStep = 2 * config.SLOT_COUNT + target;
    let previous = 0, changedAt = 0;
    for (let elapsed = 16; elapsed <= 10000; elapsed += 16) {
      const step = wheelStepAt(1000 + elapsed, 1000, 11000, target);
      assert.ok(step >= previous && step <= previous + 1, `${target}: ${previous} -> ${step}`);
      assert.ok(elapsed - changedAt <= 450, `${target}: stopped too long on ${previous}`);
      if (step !== previous) changedAt = elapsed;
      previous = step;
    }
    assert.equal(previous, finalStep);
    assert.equal(wheelStepAt(15000, 1000, 11000, target) % config.SLOT_COUNT, target);
  }
});

function wheelHarness(initial, initialNow) {
  let cursor = 0, dirty = false, frameTime = 0, nextId = 0, result, round = initial, serverNow = initialNow;
  const slots = [], frames = new Map(), events = new Map();
  let effects = [];
  const listen = (prefix, name, fn) => events.set(`${prefix}:${name}`, fn);
  const window = {
    requestAnimationFrame: fn => { frames.set(++nextId, fn); return nextId; },
    cancelAnimationFrame: id => frames.delete(id),
    addEventListener: (name, fn) => listen("window", name, fn),
    removeEventListener: name => events.delete(`window:${name}`),
  };
  const document = {
    hidden: false,
    addEventListener: (name, fn) => listen("document", name, fn),
    removeEventListener: name => events.delete(`document:${name}`),
  };
  const globals = { window, document, performance: { now: () => frameTime } };
  const react = {
    useRef: value => { const i = cursor++; return slots[i] ??= { current: value }; },
    useState: value => {
      const i = cursor++;
      slots[i] ??= { value };
      return [slots[i].value, next => {
        const value = typeof next === "function" ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
      }];
    },
    useEffect: (fn, deps) => {
      const i = cursor++, previous = slots[i];
      if (!previous || deps.some((value, at) => !Object.is(value, previous.deps[at]))) {
        slots[i] = { deps, cleanup: previous?.cleanup };
        effects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  const visible = load("src\\lib\\visibleAnimationFrame.ts", {}, globals);
  const { useWheelAnimation } = load(animationFile, {
    react, "../lib/game-config": config, "@/lib/visibleAnimationFrame": visible,
  }, globals);
  const render = (nextRound = round, nextNow = serverNow) => {
    round = nextRound;
    serverNow = nextNow;
    let count = 0;
    do {
      cursor = 0; dirty = false; effects = [];
      result = useWheelAnimation(round, serverNow);
      for (const effect of effects) effect();
      assert.ok(++count < 10);
    } while (dirty);
    return result;
  };
  render();
  return {
    render, frames, events, get result() { return result; },
    frame(time) {
      frameTime = time;
      const batch = [...frames.values()];
      frames.clear();
      for (const fn of batch) fn(time);
      return render();
    },
    visible(value) { document.hidden = !value; events.get("document:visibilitychange")?.(); },
    unmount() { for (const slot of slots) slot.cleanup?.(); },
  };
}
const spinningRound = (target = 17, roundNo = 1) => ({
  roundNo, phase: "running", bettingEndsAt: 0, resultAt: 11000, endsAt: 16000,
  result: { slot: target, animal: config.WHEEL[target], outcome: "idle" },
});

test("wheel clock corrections and repeated snapshots cannot rewind, restart or freeze the live spin", () => {
  const round = spinningRound(), h = wheelHarness(round, 1000);
  let previous = h.result.activeSlot, changedAt = 0;
  for (let time = 16; time <= 9000; time += 16) {
    if (time === 2000) h.render({ ...round }, 1000 + time - 500);
    if (time === 4000) h.render({ ...round }, 1000 + time + 1000);
    if (time === 6000) {
      const before = h.result.activeSlot;
      h.render({ ...round }, 0);
      assert.equal(h.result.activeSlot, before);
      assert.equal(h.result.started, true, "A clock correction must not reopen the closed banner");
    }
    const { activeSlot } = h.frame(time);
    const advance = (activeSlot - previous + config.SLOT_COUNT) % config.SLOT_COUNT;
    assert.ok(advance <= 1, `Rewound or skipped: ${previous} -> ${activeSlot}`);
    assert.ok(time - changedAt < 850, `Spin froze on ${activeSlot}`);
    if (activeSlot !== previous) changedAt = time;
    previous = activeSlot;
  }
  h.render({ ...round, phase: "result" }, 11000);
  assert.equal(h.result.activeSlot, round.result.slot);
  h.frame(9016);
  assert.equal(h.frames.size, 0);
  h.render({ ...round, phase: "result" }, 11500);
  assert.equal(h.result.activeSlot, round.result.slot);
  const next = { ...spinningRound(2, 2), phase: "betting", result: null, bettingEndsAt: 26000, resultAt: 37000 };
  h.render(next, 16000);
  assert.deepEqual(h.result, { activeSlot: null, started: false });
  h.unmount();
  assert.equal(h.frames.size + h.events.size, 0);
});

test("late joins and resumed tabs land on the same server slot and clean up all frames on navigation", () => {
  const round = spinningRound(5), h = wheelHarness(round, 10000);
  assert.notEqual(h.result.activeSlot, null);
  h.frame(16);
  h.visible(false);
  assert.equal(h.frames.size, 0);
  h.frame(1200);
  h.render({ ...round, phase: "result" }, 11200);
  assert.equal(h.result.activeSlot, 5);
  h.visible(true);
  h.frame(1216);
  assert.equal(h.result.activeSlot, 5);
  assert.equal(h.frames.size, 0);
  h.unmount();
  assert.equal(h.events.size, 0);
});

test("a delayed browser frame cannot jump over wheel lights while the spin is still live", () => {
  const round = spinningRound(22), h = wheelHarness(round, config.TIMES_UP_MS);
  let previous = h.result.activeSlot;
  for (const time of [16, 500, 516, 532, 1500, 1516, 1532]) {
    const { activeSlot } = h.frame(time);
    assert.ok((activeSlot - previous + config.SLOT_COUNT) % config.SLOT_COUNT <= 1);
    previous = activeSlot;
  }
  h.render({ ...round, phase: "result" }, round.resultAt);
  assert.equal(h.result.activeSlot, 22);
  h.unmount();
});
