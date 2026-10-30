import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";

const source = readFileSync("src\\components\\AviatorGame.tsx", "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const loaded = { exports: {} };
const imports = new Set([
  "react/jsx-runtime", "next/link", "@/lib/client", "@/lib/gameAudio", "@/lib/gameSfx",
  "@/lib/walletSync", "@/lib/betPresets", "react", "./AviatorScenicView", "@/lib/aviatorScenery",
]);
new Function("require", "module", "exports", code)(name => {
  assert.ok(imports.has(name), `Unexpected dependency: ${name}`);
  return {};
}, loaded, loaded.exports);
const { aviatorDisplayMultiplier, aviatorDisplayFrame, aviatorTakeoffAt } = loaded.exports;
const { aviatorNextCountdown, aviatorApplyBet } = loaded.exports;

test("Aviator: the confirmed crash clock exposes the next betting countdown despite a slow state read", () => {
  const round = { status: "crashed", endedAt: 100000 };
  assert.equal(aviatorNextCountdown(round, 103499, 6000), 0);
  assert.equal(aviatorNextCountdown(round, 103500, 6000), 6);
  assert.equal(aviatorNextCountdown(round, 104500, 6000), 5);
  assert.equal(aviatorNextCountdown(round, 108500, 6000), 1);
  assert.equal(aviatorNextCountdown(round, 109500, 6000), 0);
  assert.equal(aviatorNextCountdown(round, 110500, 6000), 0);
  assert.equal(aviatorNextCountdown({ status: "running", endedAt: null }, 104500, 6000), 0);
  assert.equal(aviatorNextCountdown(round, 102000, 6000, 2000), 6);
  assert.equal(aviatorNextCountdown(round, 104500, 6000, 3500, 104000), 0, "Show the final crash multiplier before covering it with the countdown");
  assert.equal(aviatorNextCountdown(round, 105000, 6000, 3500, 104000), 4.5);
});

test("Aviator: committed bet receipts update current/queued panels without waiting for history", () => {
  const state = { round: { id: 42 }, balance: 1000, myBets: [], queued: [], history: [{ id: 41, crashPoint: 3.3 }] };
  const receipt = { round: 42, balance: 950, bet: { id: "confirmed", slot: 0, bet: 50, win: 0, outcome: "pending", data: null } };
  const active = aviatorApplyBet(state, receipt);
  assert.equal(active.balance, 950);
  assert.deepEqual(active.myBets, [receipt.bet]);
  assert.equal(active.round, state.round);
  assert.equal(active.history, state.history);
  const queued = aviatorApplyBet(state, { ...receipt, round: 43 });
  assert.deepEqual(queued.queued, [{ slot: 0, bet: 50 }]);
  assert.deepEqual(queued.myBets, []);
  assert.equal(queued.balance, 950);
  assert.equal(aviatorApplyBet(state, { ...receipt, round: 40 }), state);
  assert.equal(aviatorApplyBet(state, { ...receipt, round: 45 }), state);
});

test("Aviator: bet confirmation releases the button before a slow refresh and blocks double submission", async () => {
  const ast = ts.createSourceFile("AviatorGame.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "placeBet") handler = node.initializer.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(handler);
  const js = ts.transpileModule(`const handler = ${handler};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let resolveApi, resolveRefresh, calls = 0;
  const state = { round: { id: 42, status: "waiting", startsAt: performance.now() + 6000 }, config: { minBet: 10 }, balance: 1000, myBets: [], queued: [] };
  const panels = [{ amount: "50", busy: false }];
  const stRef = { current: state }, accepted = { current: 0 }, sequence = { current: 0 };
  const pending = { current: new Set() };
  const refreshRead = new Promise(resolve => { resolveRefresh = resolve; });
  const place = new Function(
    "panelsRef", "pendingBets", "stRef", "targetClockOffset", "setPanel", "api", "table", "showToast",
    "acceptedRefresh", "refreshSequence", "aviatorApplyBet", "setState", "broadcastBalanceUpdate", "refresh",
    `${js}\nreturn handler;`,
  )(
    { current: panels }, pending, stRef, { current: 0 },
    (slot, patch) => Object.assign(panels[slot], patch),
    async (_url, init) => { calls++; assert.equal(JSON.parse(init.body).queueIfClosed, true); return new Promise(resolve => { resolveApi = resolve; }); },
    "aviator", () => {}, accepted, sequence, aviatorApplyBet, () => {}, () => {}, () => refreshRead,
  );
  const request = place(0);
  assert.equal(panels[0].busy, true);
  await place(0);
  assert.equal(calls, 1);
  resolveApi({ ok: true, round: 42, queued: false, balance: 950, bet: { id: "bet1", slot: 0, bet: 50, outcome: "pending" } });
  await request;
  assert.equal(panels[0].busy, false);
  assert.equal(pending.current.size, 0);
  assert.equal(stRef.current.myBets[0].bet, 50);
  assert.ok(accepted.current > 0, "Ignore pre-confirmation reads so they cannot remove the accepted bet");
  resolveRefresh();
});
const display = (state, projected) => {
  const value = aviatorDisplayMultiplier(state.round, projected);
  return state.round.status === "crashed" ? value : Math.floor(value * 100) / 100;
};

for (const table of ["aviator", "aviator-x"]) {
  test(`${table}: delayed crash updates cannot show 3.45x before a 3.30x crash`, async () => {
    const s = createLegacyScene();
    s.flight.generateCrashPoint = () => ({ crashPoint: 3.3, seed: "", hash: "" });
    const first = await s.flight.getState("alice", table);
    const crashAt = first.round.startsAt + Math.log(3.3) / first.config.growth * 1000 + 1;
    s.at(crashAt - 200);
    const running = await s.flight.getState("alice", table);
    assert.equal(running.round.status, "running");
    assert.equal(running.round.crashPoint, null);
    const shown = [running.round.multiplier, 3.45, 10, 50].map(projected => display(running, projected));
    assert.ok(shown.every(value => value <= 3.3));
    s.at(crashAt + 10);
    const crashed = await s.flight.getState("alice", table);
    assert.equal(crashed.round.status, "crashed");
    assert.equal(display(crashed, 50), 3.3);
    assert.ok(shown.every(value => value <= display(crashed, 50)));
    assert.equal(crashed.history[0].crashPoint, display(crashed, 50));
    assert.deepEqual(s.changes, []);
  });

  test(`${table}: slow state reads crossing the crash time never confirm an overshoot`, async () => {
    const s = createLegacyScene();
    s.flight.generateCrashPoint = () => ({ crashPoint: 3.3, seed: "", hash: "" });
    const first = await s.flight.getState("alice", table);
    const crashAt = first.round.startsAt + Math.log(3.3) / first.config.growth * 1000 + 1;
    s.at(crashAt - 100);
    s.setReadDelay(1000);
    const delayed = await s.flight.getState("alice", table);
    assert.equal(delayed.round.status, "running");
    assert.ok(delayed.serverNow > crashAt);
    assert.equal(delayed.round.multiplier, 3.3);
    assert.equal(display(delayed, 3.45), 3.3);
    assert.equal(delayed.round.crashPoint, null);
  });

  test(`${table}: display increases monotonically and resets only in the next round`, async () => {
    const s = createLegacyScene();
    s.flight.generateCrashPoint = () => ({ crashPoint: 3.45, seed: "", hash: "" });
    const first = await s.flight.getState("alice", table);
    assert.equal(display(first, 1), 1);
    const duration = Math.log(3.45) / first.config.growth * 1000 + 1;
    let previous = 1;
    for (let fraction = 0; fraction <= 20; fraction++) {
      s.at(first.round.startsAt + duration * fraction / 20);
      const state = await s.flight.getState("alice", table);
      for (const delay of [0, 600, 2000, 15000]) {
        const projected = Math.exp(state.config.growth * (duration * fraction / 20 + delay) / 1000);
        const value = display(state, projected);
        assert.ok(value >= previous, `${previous}x must not decrease to ${value}x`);
        assert.ok(value <= 3.45);
        previous = value;
      }
    }
    assert.equal(previous, 3.45);
    s.at(first.round.startsAt + duration + 3500);
    const next = await s.flight.getState("alice", table);
    assert.equal(next.round.id, first.round.id + 1);
    assert.equal(next.round.status, "waiting");
    assert.equal(display(next, 1), 1);
  });
}

test("the shared animation uses the capped value for the screen and plane, not payout logic", () => {
  assert.match(source, /aviatorDisplayFrame\(s\.round, now, s\.config, frame, flightDisplay\.current, completed\)/);
  assert.match(source, /setMult\(visualPhase === "crashed" \? flightMultiplier : Math\.floor\(flightMultiplier \* 100\) \/ 100\)/);
  assert.match(source, /draw\(canvas, sizeRef\.current, T, visualPhase, flightMultiplier, now, visualRound\)/);
  assert.match(source, /if \(ph === "running"\) \{\s*panelsRef\.current\.forEach/);
  assert.match(source, /p\.autoCash && mine && target >= 1\.01 && m >= target/);
});

const CFG = createLegacyScene().flight.TABLES;
const crashTime = (startsAt, crash, growth) => startsAt + Math.log(crash) / growth * 1000 + 1;

test("the real generator retains the 65/35 bands and produces distinct random crash points above 50x", () => {
  const aviator = readFileSync("src\\lib\\aviator.ts", "utf8");
  const code = ts.transpileModule(aviator, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let uniform = 0;
  const crypto = { getRandomValues(array) {
    const hex = Math.floor(uniform * 2 ** 52).toString(16).padStart(13, "0").padEnd(array.length * 2, "0");
    array.set(Buffer.from(hex, "hex"));
    return array;
  } };
  const module = { exports: {} };
  new Function("require", "module", "exports", "crypto", code)(() => ({}), module, module.exports, crypto);
  for (const table of ["aviator", "aviator-x"]) {
    let low = 0, high = 0;
    for (let i = 0; i < 100; i++) {
      uniform = (i + 0.5) / 100;
      const { crashPoint } = module.exports.generateCrashPoint(table);
      if (crashPoint < 2) low++; else high++;
    }
    assert.equal(low, 65);
    assert.equal(high, 35);
    const points = [0.9861, 0.99, 0.995, 0.999].map(value => {
      uniform = value;
      return module.exports.generateCrashPoint(table).crashPoint;
    });
    assert.ok(points.every(value => value > 50 && value <= 10000));
    assert.equal(new Set(points).size, points.length);
  }
});

/** Simulates the browser: frames every 1000/fps ms, server samples arriving after a poll gap + latency. */
function simulate({ table, crash, startsAt = 10_000, fps = 60, poll = 150, latency = 80, until = 2500, stallFrom = Infinity, stallTo = -Infinity }) {
  const cfg = CFG[table], crashAt = crashTime(startsAt, crash, cfg.growth);
  const sample = time => {
    const status = time >= crashAt ? "crashed" : time >= startsAt ? "running" : "waiting";
    return { id: 1, startsAt, status, endedAt: status === "crashed" ? crashAt : null, crashPoint: status === "crashed" ? crash : null,
      multiplier: status === "crashed" ? crash : Math.min(crash, Math.exp(cfg.growth * Math.max(0, time - startsAt) / 1000)) };
  };
  let round = sample(startsAt - 3000), nextPoll = startsAt - 3000, previous = null;
  const frames = [];
  for (let now = startsAt - 3000; now <= crashAt + until; now += 1000 / fps) {
    if (now >= nextPoll && !(now >= stallFrom && now < stallTo)) { round = sample(now - latency); nextPoll = now + poll + latency; }
    const result = aviatorDisplayFrame(round, now, cfg, now, previous);
    previous = result.display;
    frames.push({ now, value: result.display.value, phase: result.phase, shown: result.phase === "crashed" ? result.display.value : Math.floor(result.display.value * 100) / 100, crashedAt: result.display.crashedAt });
  }
  return { frames, crashAt, startsAt };
}

for (const table of ["aviator", "aviator-x"]) {
  test(`${table}: overlapping reads with occasional 1s replies keep the count moving without a visible stop`, () => {
    const cfg = CFG[table];
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const latencyOf = () => { const r = rand(); return r < 0.08 ? 600 + rand() * 500 : 120 + rand() * 260; };
    let previous = null, worst = 0, now = 0;
    for (let id = 1; id <= 4; id++) {
      const crash = [6.5, 9.03, 12.34, 4.24][id - 1], startsAt = now + 6000;
      const crashAt = crashTime(startsAt, crash, cfg.growth);
      const sample = t => { const status = t >= crashAt ? "crashed" : t >= startsAt ? "running" : "waiting";
        return { id, startsAt, status, endedAt: status === "crashed" ? crashAt : null, crashPoint: status === "crashed" ? crash : null,
          multiplier: status === "crashed" ? crash : Math.min(crash, Math.exp(cfg.growth * Math.max(0, t - startsAt) / 1000)) }; };
      let round = sample(now), nextSend = now, pending = [], shown = null, since = 0, last = 0;
      for (; now < crashAt + 3600; now += 1000 / 60) {
        if (now >= nextSend) {
          if (pending.length < 3) { const l = latencyOf(); pending.push({ at: now + l, round: sample(now + l / 2) }); }
          nextSend = now + 150;
        }
        for (const reply of pending.filter(r => r.at <= now)) if (reply.round.multiplier >= round.multiplier || reply.round.status !== round.status) round = reply.round;
        pending = pending.filter(r => r.at > now);
        const result = aviatorDisplayFrame(round, now, cfg, now, previous, [{ id: id - 1, crashPoint: 2 }]);
        previous = result.display;
        if (result.display.id !== id) continue;
        assert.ok(result.display.value >= last);
        last = result.display.value;
        if (result.phase === "running") {
          const value = Math.floor(result.display.value * 100) / 100;
          if (value !== shown) { if (shown !== null && id > 1) worst = Math.max(worst, now - since); shown = value; since = now; }
        } else if (result.phase === "crashed") assert.equal(result.display.value, crash);
      }
    }
    const natural = Math.log(1.01) / cfg.growth * 1000;
    assert.ok(worst <= natural + 120, `a hundredth held ${Math.round(worst)}ms (natural ${Math.round(natural)}ms)`);
  });

  test(`${table}: real epoch timestamps reach the exact crash and release the next round`, () => {
    const cfg = CFG[table], startsAt = 1792937765217;
    for (const crash of [1.01, 1.25, 1.27, 1.98, 3.45, 9.03, 50.54, 123.45]) {
      const { frames, crashAt } = simulate({ table, crash, startsAt });
      const final = frames.at(-1);
      assert.equal(final.phase, "crashed", `${crash}x must not stall below its final hundredth`);
      assert.equal(final.value, crash);
      assert.ok(final.crashedAt !== null);
      const round = { id: 1, startsAt, status: "crashed", multiplier: crash, crashPoint: crash, endedAt: crashAt };
      let result = aviatorDisplayFrame(round, final.now, cfg, final.now, null);
      const next = { id: 2, startsAt: final.now + 6000, status: "waiting", multiplier: 1, crashPoint: null, endedAt: null };
      for (let dt = 0; dt <= 2000; dt += 1000 / 60) {
        result = aviatorDisplayFrame(next, final.now + dt, cfg, final.now + dt, result.display, [{ id: 1, crashPoint: crash }]);
      }
      assert.equal(result.display.id, 2, `${crash}x must allow the next round`);
      assert.equal(result.phase, "waiting");
    }
  });

  for (const fps of [30, 60, 120]) {
    test(`${table}: ${fps}fps counts every hundredth smoothly and finishes exactly on the crash point`, () => {
      for (const crash of [1, 1.01, 1.44, 2.18, 4.24, 5.07, 12.34, 50.54, 123.45]) {
        const { frames } = simulate({ table, crash, fps });
        let last = 0, maxStep = 0;
        for (const f of frames) {
          assert.ok(f.value >= last, `${crash}x: count went backwards ${last} -> ${f.value}`);
          assert.ok(f.value <= crash, `${crash}x: displayed ${f.value} beyond the crash`);
          if (f.phase === "running" && last) maxStep = Math.max(maxStep, f.value / last);
          last = f.value;
        }
        const crashed = frames.filter(f => f.phase === "crashed");
        assert.ok(crashed.length > 0, `${crash}x never reached the crashed frame`);
        assert.ok(crashed.every(f => f.shown === crash), `${crash}x final value must stay ${crash}`);
        const firstCrash = frames.indexOf(crashed[0]);
        assert.ok(frames.slice(firstCrash).every(f => f.phase === "crashed"), "The crash must not flicker back to running");
        assert.ok(maxStep < 1.01, `${crash}x: counter jumped by ${maxStep}`);
      }
    });
  }

  test(`${table}: 2.18x to 4.24x shows the in-between hundredths instead of jumping`, () => {
    const { frames } = simulate({ table, crash: 4.24 });
    const shown = new Set(frames.filter(f => f.value >= 2.18 && f.value <= 4.24).map(f => f.shown.toFixed(2)));
    assert.ok(shown.size >= 150, `Expected continuous hundredths, got ${shown.size}`);
  });

  test(`${table}: takeoff counts 1.00 -> 1.01 without braking from a stopped countdown`, () => {
    const { frames, startsAt } = simulate({ table, crash: 1.98, latency: 80 });
    const first = frames.find(f => f.phase === "running");
    const hundredth = frames.find(f => f.shown >= 1.01);
    assert.ok(first && hundredth);
    assert.equal(first.shown, 1);
    assert.ok(first.now - startsAt <= 400, `takeoff waited ${first.now - startsAt}ms for confirmations`);
    assert.equal(first.now, frames.find(f => f.now >= aviatorTakeoffAt({ startsAt }, null)).now, "countdown and takeoff must meet");
    assert.ok(hundredth.now - first.now <= 200, `1.00 held for ${hundredth.now - first.now}ms after takeoff`);
    const start = frames.indexOf(first);
    assert.ok(frames.slice(start).every(f => f.phase !== "waiting"), "Takeoff cannot return to countdown");
    // Every early hundredth (1.00, 1.01, 1.02 ...) changes at about the natural flight pace, no pauses.
    let since = first.now, shown = first.shown, maxHold = 0;
    for (const f of frames.slice(start)) {
      if (f.phase !== "running" || f.shown > 1.3) break;
      if (f.shown !== shown) { maxHold = Math.max(maxHold, f.now - since); since = f.now; shown = f.shown; }
    }
    const natural = Math.log(1.01) / CFG[table].growth * 1000;
    assert.ok(maxHold <= natural * 1.35, `an early hundredth held ${Math.round(maxHold)}ms (natural ${Math.round(natural)}ms)`);
  });

  test(`${table}: a missed crash cannot reset a 9.03x flight into a new 1.27x flight`, () => {
    const cfg = CFG[table], startsAt = 1000, final = 9.15;
    const round = { id: 7, startsAt, status: "running", endedAt: null, crashPoint: null, multiplier: 9.03 };
    let result = aviatorDisplayFrame(round, 40000, cfg, 40000, null);
    const lastShown = result.display.value;
    const next = { id: 8, startsAt: 50000, status: "running", endedAt: null, crashPoint: null, multiplier: 1.27 };
    let finished = null;
    for (let t = 51000; t < 56000; t += 1000 / 60) {
      result = aviatorDisplayFrame(next, t, cfg, t, result.display, [{ id: 7, crashPoint: final }]);
      if (result.display.id === 7) {
        assert.ok(result.display.value >= lastShown);
        if (result.phase === "crashed") {
          assert.equal(result.display.value, final);
          finished ??= t;
        }
      } else {
        assert.ok(finished !== null, "Must show the old flight's crash before the next flight");
        assert.ok(t - finished >= 1000, "Keep the final multiplier visible before resetting");
        break;
      }
    }
    assert.equal(result.display.id, 8);
  });

  test(`${table}: missing final history waits for the old round, never invents a crash or resets`, () => {
    const cfg = CFG[table], round = { id: 7, startsAt: 1000, status: "running", endedAt: null, crashPoint: null, multiplier: 9.03 };
    const first = aviatorDisplayFrame(round, 40000, cfg, 40000, null);
    const next = { ...round, id: 8, startsAt: 50000, multiplier: 1.27 };
    const waiting = aviatorDisplayFrame(next, 53000, cfg, 53000, first.display);
    assert.equal(waiting.display.id, 7);
    assert.ok(waiting.display.value >= first.display.value);
    assert.equal(waiting.phase, "running");
    assert.equal(waiting.display.round.crashPoint, null);
    const recovered = aviatorDisplayFrame(next, 53016, cfg, 53016, waiting.display, [{ id: 7, crashPoint: 9.15 }]);
    assert.equal(recovered.display.id, 7);
    assert.equal(recovered.display.round.crashPoint, 9.15);
  });

  test(`${table}: out-of-order round updates and altered start times cannot restart a flight`, () => {
    const cfg = CFG[table], round = { id: 7, startsAt: 1000, status: "running", endedAt: null, crashPoint: null, multiplier: 9.03 };
    let result = aviatorDisplayFrame(round, 40000, cfg, 40000, null);
    for (const stale of [
      { ...round, multiplier: 1.27 },
      { ...round, status: "waiting", multiplier: 1 },
      { ...round, startsAt: 39999, multiplier: 1.01 },
      { ...round, id: 6, multiplier: 1.27 },
    ]) {
      const last = result.display.value;
      result = aviatorDisplayFrame(stale, 40016, cfg, 40016, result.display);
      assert.equal(result.display.id, 7);
      assert.equal(result.display.startsAt, 1000);
      assert.ok(result.display.value >= last);
      assert.equal(result.phase, "running");
    }
  });

  test(`${table}: a real round passes 50x and ends at its server-generated 50.54x`, async () => {
    const scene = createLegacyScene();
    scene.flight.generateCrashPoint = () => ({ crashPoint: 50.54, seed: "", hash: "" });
    const first = await scene.flight.getState("alice", table);
    const crashAt = crashTime(first.round.startsAt, 50.54, first.config.growth);
    scene.at(crashAt - 50);
    const running = await scene.flight.getState("alice", table);
    assert.equal(running.round.status, "running");
    assert.ok(running.round.multiplier > 50);
    assert.ok(scene.flight.multiplierAt(table, new Date(first.round.startsAt), new Date(crashAt - 50)) > 50);
    scene.at(crashAt + 1);
    const crashed = await scene.flight.getState("alice", table);
    assert.equal(crashed.round.crashPoint, 50.54);
    assert.deepEqual(scene.changes, [], "Presentation must not change any wallet");
  });

  test(`${table}: a slow or stalled network holds the number, then catches up without overshooting or jumping`, () => {
    const crash = 3.3;
    const cfg = CFG[table];
    const crashAt = crashTime(10_000, crash, cfg.growth);
    const { frames } = simulate({ table, crash, until: 4000, stallFrom: crashAt - 2500, stallTo: crashAt + 1500 });
    let last = 0;
    for (const f of frames) {
      assert.ok(f.value >= last && f.value <= crash);
      if (f.phase === "running" && last) assert.ok(f.value / last < 1.01);
      last = f.value;
    }
    assert.equal(frames.at(-1).shown, crash);
    assert.equal(frames.at(-1).phase, "crashed");
  });

  test(`${table}: irregular server samples never freeze the counter (no ruk-ruk)`, () => {
    const cfg = CFG[table], startsAt = 10_000, crash = 6, crashAt = crashTime(startsAt, crash, cfg.growth);
    const sample = time => time >= crashAt
      ? { id: 1, startsAt, status: "crashed", endedAt: crashAt, crashPoint: crash, multiplier: crash }
      : { id: 1, startsAt, status: time >= startsAt ? "running" : "waiting", endedAt: null, crashPoint: null, multiplier: Math.min(crash, Math.exp(cfg.growth * Math.max(0, time - startsAt) / 1000)) };
    const gaps = [250, 600, 300, 450, 700, 280, 520, 330];
    let round = sample(startsAt - 2000), next = startsAt - 2000, g = 0, previous = null, holdFrom = 0, held = "", maxHold = 0;
    for (let now = startsAt - 2000; now <= crashAt + 2500; now += 1000 / 60) {
      if (now >= next) { round = sample(now - 150); next = now + gaps[g++ % gaps.length]; }
      const r = aviatorDisplayFrame(round, now, cfg, now, previous);
      previous = r.display;
      const shown = r.phase === "crashed" ? r.display.value.toFixed(2) : (Math.floor(r.display.value * 100) / 100).toFixed(2);
      if (shown !== held) { if (r.phase === "running" && Number(held) >= 1.05) maxHold = Math.max(maxHold, now - holdFrom); held = shown; holdFrom = now; }
      if (r.phase === "crashed") assert.equal(r.display.value, crash);
    }
    assert.equal(held, crash.toFixed(2));
    assert.ok(maxHold < 300, `Counter froze for ${Math.round(maxHold)}ms`);
  });

  test(`${table}: no fixed one-second delay - the screen stays close to the live round and stops exactly on the crash`, () => {
    for (const crash of [1.5, 4.35, 9.8]) {
      const { frames, crashAt, startsAt } = simulate({ table, crash, latency: 40 });
      const cfg = CFG[table];
      const running = frames.filter(f => f.phase === "running" && f.now > startsAt + 1500 && f.now < crashAt);
      const lags = running.map(f => f.now - (startsAt + Math.log(f.value) / cfg.growth * 1000));
      const avg = lags.reduce((a, b) => a + b, 0) / lags.length;
      assert.ok(avg < 450, `${crash}x: screen trails the live round by ${Math.round(avg)}ms on average`);
      const first = frames.find(f => f.phase === "crashed");
      assert.ok(first.now - crashAt < 600, `${crash}x: crash shown ${Math.round(first.now - crashAt)}ms after it happened`);
      assert.equal(first.shown, crash, "The crash frame shows the exact crash multiplier");
    }
  });

  test(`${table}: the countdown shows 1.00x and the crash animation starts on the visible crash frame`, () => {
    const { frames, startsAt, crashAt } = simulate({ table, crash: 2 });
    assert.ok(frames.filter(f => f.now < startsAt).every(f => f.phase === "waiting" && f.value === 1));
    const first = frames.find(f => f.phase === "crashed");
    assert.ok(first.now >= crashAt, "The final number cannot appear before the server crash");
    assert.equal(first.crashedAt, first.now);
    assert.ok(frames.filter(f => f.phase === "crashed").every(f => f.crashedAt === first.now));
  });

  test(`${table}: joining mid-pause shows the final number at once and a new round resets to 1.00x`, () => {
    const cfg = CFG[table];
    const round = { id: 7, startsAt: 1000, status: "crashed", endedAt: 20_000, crashPoint: 2.5, multiplier: 2.5 };
    const joined = aviatorDisplayFrame(round, 21_000, cfg, 5, null);
    assert.equal(joined.phase, "crashed");
    assert.equal(joined.display.value, 2.5);
    assert.equal(joined.display.crashedAt, 20_000);
    const next = aviatorDisplayFrame({ id: 8, startsAt: 30_000, status: "waiting", endedAt: null, crashPoint: null, multiplier: 1 }, 24_000, cfg, 3005, joined.display);
    assert.equal(next.phase, "waiting");
    assert.equal(next.display.value, 1);
  });
}

function refreshFixture() {
  const effects = [], timers = new Map(), intervals = new Map(), warnings = [], errors = [];
  const flightRequests = [];
  let nextId = 0, captured, requests = 0, succeed = false, flightReply = null;
  const hookImports = {
    react: {
      useState: initial => [typeof initial === "function" ? initial() : initial, () => {}],
      useRef: initial => ({ current: initial }),
      useEffect: fn => effects.push(fn),
      useCallback: fn => fn,
    },
    "react/jsx-runtime": { jsx: () => null, jsxs: () => null },
    "@/lib/betPresets": { BET_PRESETS: [10, 20, 50, 100, 200] },
    "@/lib/walletSync": { broadcastBalanceUpdate() {} },
    "@/lib/client": {
      localApi: async (_url, { signal }) => {
        if (_url.startsWith("/api/aviator/flight?")) {
          flightRequests.push(_url);
          return { ok: true, status: flightReply ? 200 : 204, json: async () => flightReply };
        }
        requests++;
        if (succeed) return { ok: true, json: async () => ({ serverNow: 1000, balance: 100, round: { id: 1 } }) };
        return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
      },
    },
  };
  const js = ts.transpileModule(source.replace("  if (!state) {", "  capture({ refresh, refreshMounted, stRef, flightSnapshot });\n  if (!state) {"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "capture", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "console", js)(
    name => {
      assert.ok(imports.has(name), name);
      return hookImports[name] ?? {};
    }, module, module.exports,
    value => { captured = value; },
    (fn, delay) => { const id = ++nextId; timers.set(id, { fn, delay }); return id; },
    id => timers.delete(id),
    fn => { const id = ++nextId; intervals.set(id, fn); return id; },
    id => intervals.delete(id),
    () => 1, () => {},
    { warn: (...args) => warnings.push(args), error: (...args) => errors.push(args) },
  );
  module.exports.AviatorGame({});
  const cleanups = effects.map(fn => fn()).filter(Boolean);
  return {
    captured, warnings, errors, timers, flightRequests,
    get requests() { return requests; },
    succeed: () => { succeed = true; },
    flightReply: value => { flightReply = value; },
    async pollFlight() {
      const entry = [...timers].find(([, timer]) => timer.delay === 150);
      assert.ok(entry, "Animation should poll independently");
      timers.delete(entry[0]);
      await entry[1].fn();
    },
    timeout() {
      const entry = [...timers].find(([, timer]) => timer.delay === 15000);
      assert.ok(entry, "Refresh must have a timeout");
      timers.delete(entry[0]);
      entry[1].fn();
    },
    unmount: () => cleanups.forEach(fn => fn()),
  };
}

test("a flight state timeout is a warning with a reconnect message, not a console AbortError, and retries recover", async () => {
  const f = refreshFixture();
  const pending = f.captured.refresh();
  await Promise.resolve();
  assert.equal(f.requests, 1, "Concurrent reads are deduplicated");
  f.timeout();
  await pending;
  assert.equal(f.errors.length, 0);
  assert.equal(f.warnings.length, 1);
  assert.match(f.warnings[0][1], /timed out.*Reconnecting/);
  f.succeed();
  await f.captured.refresh();
  assert.equal(f.requests, 2);
  assert.equal(f.captured.stRef.current.balance, 100);
  assert.ok(![...f.timers.values()].some(timer => timer.delay === 15000));
  f.unmount();
});

test("leaving the game aborts the read without reporting a connection error", async () => {
  const f = refreshFixture();
  const pending = f.captured.refresh();
  await Promise.resolve();
  f.unmount();
  await pending;
  assert.deepEqual(f.warnings, []);
  assert.deepEqual(f.errors, []);
});

test("lightweight flight samples continue while a full wallet/history refresh is still pending", async () => {
  const f = refreshFixture();
  const pending = f.captured.refresh();
  await Promise.resolve();
  const fullState = { serverNow: 1000, round: { id: 42 }, balance: 100, myBets: [{ id: "actual-bet" }] };
  f.captured.stRef.current = fullState;
  const snapshot = { serverNow: 1200, round: { id: 42, multiplier: 1.2, status: "running" } };
  f.flightReply(snapshot);
  await f.pollFlight();
  assert.equal(f.requests, 1, "The heavy request remains in flight");
  assert.equal(f.flightRequests.length, 1);
  assert.match(f.flightRequests[0], /table=aviator&round=42/);
  assert.equal(f.captured.flightSnapshot.current, snapshot);
  assert.equal(f.captured.stRef.current, fullState, "A visual sample must never overwrite wallet or wager state");
  f.flightReply({ serverNow: 1300, round: { id: 41, multiplier: 2 } });
  await f.pollFlight();
  assert.equal(f.captured.flightSnapshot.current, snapshot, "Old-round animation replies are ignored");
  f.unmount();
  await pending;
  assert.equal(f.captured.flightSnapshot.current, null);
});
