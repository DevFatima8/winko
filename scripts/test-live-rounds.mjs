import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { createLegacyScene } from "./multiplayer-legacy-harness.mjs";
// Shared Auto/Lightning Roulette coverage runs separately via npm run test:multiplayer.

function aviatorPollingScene() {
  const path = "src\\components\\AviatorGame.tsx";
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "AviatorGame");
  const declaration = component.body.statements.flatMap((node) => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : [])
    .find((node) => node.name.getText(source) === "refresh");
  assert.ok(declaration, "Test executes the actual Aviator polling callback");
  const calls = [], states = [], notices = [], balances = [], timers = new Map();
  const ref = (current) => ({ current });
  const context = {
    refreshSequence: ref(0), acceptedRefresh: ref(0), refreshInFlight: ref(null), refreshController: ref(null),
    refreshMounted: ref(true), refreshError: ref(false), targetClockOffset: ref(null), stRef: ref(null),
    useCallback: (fn) => fn, table: "aviator", performance: { now: () => 0 },
    localApi: (_url, options) => new Promise((resolve, reject) => {
      calls.push({ resolve, reject, options });
      options.signal.addEventListener("abort", () => reject(new Error("Request aborted")), { once: true });
    }),
    setState: (value) => states.push(value), broadcastBalanceUpdate: (value) => balances.push(value),
    showToast: (...args) => notices.push(args), console: { error: () => {} },
    setTimeout: (fn) => { const id = Symbol(); timers.set(id, fn); return id; },
    clearTimeout: (id) => timers.delete(id),
  };
  const loaded = { exports: {} };
  const code = ts.transpileModule(`export const refresh = ${declaration.initializer.getText(source)};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function(...Object.keys(context), "exports", code)(...Object.values(context), loaded.exports);
  return { refresh: loaded.exports.refresh, context, calls, states, notices, balances, timers };
}

test("Aviator polling coalesces slow requests rather than accumulating requests every 600ms", async () => {
  const s = aviatorPollingScene();
  const first = s.refresh();
  assert.equal(s.refresh(), first);
  assert.equal(s.refresh(), first);
  await Promise.resolve();
  assert.equal(s.calls.length, 1);
  s.calls[0].resolve({ ok: true, json: async () => ({ serverNow: 100, balance: 0 }) });
  await first;
  assert.equal(s.states.length, 1);
  assert.equal(s.context.refreshInFlight.current, null);
  assert.equal(s.timers.size, 0);
  const next = s.refresh(); await Promise.resolve();
  s.calls[1].resolve({ ok: true, json: async () => ({ serverNow: 200, balance: 0 }) });
  await next;
  assert.equal(s.states.length, 2);
  assert.deepEqual(s.balances, [0], "Unchanged spectator wallet does not repeatedly trigger session refreshes");
});

test("Aviator polling times out visibly, retries, and cannot update state after unmount", async () => {
  const s = aviatorPollingScene();
  const first = s.refresh(); await Promise.resolve();
  [...s.timers.values()][0]();
  await first;
  assert.equal(s.notices.length, 1);
  assert.equal(s.states.length, 0);
  const second = s.refresh(); await Promise.resolve();
  assert.equal(s.calls.length, 2);
  s.context.refreshMounted.current = false;
  s.calls[1].resolve({ ok: true, json: async () => ({ serverNow: 100, balance: 0 }) });
  await second;
  assert.equal(s.states.length, 0);
  assert.equal(s.timers.size, 0);
});

{
    function aviatorScene(table, userId = "player") {
      let now = 100000;
      const scene = createLegacyScene(["player"]);
      const rounds = scene.data.aviatorrounds, bets = scene.data.gameresults, wallet = [];
      const advance = async () => {
        await scene.flight.getState(userId, table);
        wallet.splice(0, wallet.length, ...scene.changes.map(change => change.delta));
        return rounds.at(-1);
      };
      return {
        api: scene.flight, rounds, bets, wallet, userId, table, advance,
        at(value) { now = value; scene.at(now); },
        tick(ms) { now += ms; scene.at(now); },
        setReadDelay(ms) { scene.setReadDelay(ms); },
      };
    }

    // Aviator's shared transactions are covered by test-shared-aviator.mjs.
    for (const table of ["aviator-x"]) {
      test(`${table}: spectator rounds restart and legacy betStarted:false never pauses the timer`, async () => {
        const s = aviatorScene(table, null);
        for (let round = 1; round <= 3; round++) {
          const waiting = await s.advance();
          assert.equal(waiting.status, "waiting");
          waiting.betStarted = false;
          assert.equal(waiting.roundNo, round);
          s.at(+waiting.startsAt);
          assert.equal((await s.advance()).status, "running");
          s.tick(1000);
          assert.equal((await s.advance()).status, "crashed");
          s.tick(3500);
        }
        assert.deepEqual(s.bets, []);
        assert.deepEqual(s.wallet, []);
      });
      test(`${table}: placing/cancelling cannot reset countdown and midflight bets settle only next round`, async () => {
        const s = aviatorScene(table);
        const waiting = await s.advance();
        const startsAt = +waiting.startsAt;
        s.tick(3000);
        assert.equal((await s.api.placeBet("player", table, 50, 0)).ok, true);
        assert.equal(+s.rounds[0].startsAt, startsAt);
        assert.equal((await s.api.cancelBet("player", table, 0)).ok, true);
        assert.equal(+s.rounds[0].startsAt, startsAt);
        s.tick(3000);
        assert.equal((await s.advance()).status, "running");
        const queued = await s.api.placeBet("player", table, 100, 0);
        assert.equal(queued.queued, true);
        assert.equal(queued.round, 2);
        assert.ok((await s.api.placeBet("player", table, 100, 0)).error, "Same slot cannot queue twice");
        s.tick(1000); await s.advance();
        assert.equal(s.bets[0].outcome, "pending", "Round N cannot settle N+1 bet");
        s.tick(3500); await s.advance(); s.tick(7000); await s.advance();
        assert.equal(s.bets[0].outcome, "lose");
        assert.deepEqual(s.wallet, [-50, 50, -100]);
      });
      test(`${table}: a slow database read across betting close queues the bet instead of joining the flight`, async () => {
        const s = aviatorScene(table);
        await s.advance(); s.tick(5500); s.setReadDelay(1000);
        const placed = await s.api.placeBet("player", table, 50);
        assert.equal(placed.queued, true);
        assert.equal(placed.round, 2);
        assert.equal(s.bets[0].outcome, "pending");
      });
    }
}
