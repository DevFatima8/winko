import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(file, imports = {}) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(name => {
    assert.ok(Object.hasOwn(imports, name), name);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}
const { flightAnimationSnapshot } = load("src\\lib\\aviatorFlight.ts");
const tableConfig = { aviator: { growth: 0.06, maxMult: 10000 }, "aviator-x": { growth: 0.075, maxMult: 10000 } };

for (const table of Object.keys(tableConfig)) {
  test(`${table}: read-only flight samples continue past 50x without a plateau`, () => {
    const { growth, maxMult } = tableConfig[table];
    const round = { roundNo: 42, startsAt: new Date(100000), crashPoint: 50.54, status: "running" };
    const at = multiplier => 100000 + Math.log(multiplier) / growth * 1000;
    for (const value of [49.99, 50, 50.01, 50.35]) {
      const sample = flightAnimationSnapshot(round, at(value), growth, maxMult);
      assert.equal(sample.round.status, "running");
      assert.ok(Math.abs(sample.round.multiplier - value) < 1e-9);
      assert.equal(sample.round.crashPoint, null);
    }
    assert.equal(flightAnimationSnapshot(round, at(50.54) + 2, growth, maxMult).round.crashPoint, 50.54);
  });

  test(`${table}: read-only flight samples never reveal a future result or exceed the real final number`, () => {
    const { growth, maxMult } = tableConfig[table];
    const round = { roundNo: 42, startsAt: new Date(100000), crashPoint: 3.3, status: "waiting" };
    const original = structuredClone(round);
    const crashAt = 100000 + Math.log(3.3) / growth * 1000 + 1;
    let last = 1;
    for (let now = 99000; now < crashAt; now += 50) {
      const state = flightAnimationSnapshot(round, now, growth, maxMult);
      assert.equal(state.round.crashPoint, null);
      assert.equal(state.round.endedAt, null);
      assert.ok(state.round.multiplier >= last && state.round.multiplier <= 3.3);
      last = state.round.multiplier;
    }
    const final = flightAnimationSnapshot(round, crashAt, growth, maxMult);
    assert.equal(final.round.status, "crashed");
    assert.equal(final.round.multiplier, 3.3);
    assert.equal(final.round.crashPoint, 3.3);
    assert.equal(flightAnimationSnapshot(round, crashAt + 10000, growth, maxMult).round.multiplier, 3.3);
    assert.deepEqual(round, original, "The visual endpoint must not settle or change the stored round");
  });
}

function fixture({ table = "aviator", user = null, missing = false, fail = false } = {}) {
  const calls = [];
  const document = { roundNo: 42, startsAt: new Date(100000), crashPoint: 3.3, status: "running" };
  class NextResponse extends Response {
    static json(body, init) { return Response.json(body, init); }
  }
  const route = load("src\\app\\api\\aviator\\flight\\route.ts", {
    "next/server": { NextResponse },
    "@/lib/mysql": { getMysqlPool: async () => ({
      query: async (sql, args) => {
        calls.push({ sql, args });
        if (fail) throw new Error("fixture read unavailable");
        return [missing ? [] : [{ data: JSON.stringify(document), now: 110000 }]];
      },
    }) },
    "@/lib/serverAuth": { getServerSessionUser: async () => user },
    "@/lib/aviatorFlight": { flightAnimationSnapshot },
    "@/lib/aviator": { isTable: value => value in tableConfig, TABLES: tableConfig },
  });
  return {
    calls,
    read: (params = `table=${table}&round=42`) => route.GET(new Request(`http://localhost/api/aviator/flight?${params}`)),
  };
}

test("the animation route performs one uncached parameterized SELECT, with no financial lock or writes", async () => {
  const f = fixture();
  const response = await f.read();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].args, ["aviator:shared:v2", 42]);
  assert.match(f.calls[0].sql, /^SELECT data, UNIX_TIMESTAMP/);
  assert.doesNotMatch(f.calls[0].sql, /FOR UPDATE|UPDATE |INSERT |DELETE |users|gameresults|dailypool/i);
  const state = await response.json();
  assert.deepEqual(Object.keys(state).sort(), ["round", "serverNow"]);
  assert.equal(state.round.crashPoint, null);
});

test("Aviator X animation remains scoped to the authenticated player, never a supplied user ID", async () => {
  const f = fixture({ table: "aviator-x", user: { id: "alice" } });
  await f.read("table=aviator-x&round=42&userId=bob");
  assert.deepEqual(f.calls[0].args, ["aviator-x:alice", 42]);
});

test("keyed live reads use the primary index and still enforce the authenticated room and round", async () => {
  const f = fixture({ table: "aviator-x", user: { id: "alice" } });
  assert.equal((await f.read("table=aviator-x&round=42&key=flight-42")).status, 200);
  assert.match(f.calls[0].sql, /WHERE id = \? AND BINARY/);
  assert.deepEqual(f.calls[0].args, ["flight-42", "aviator-x:alice", 42]);
  assert.equal((await f.read("table=aviator-x&round=42&key=bad%27key")).status, 400);
  assert.equal(f.calls.length, 1);
});

test("guest Aviator X samples use only the guest room", async () => {
  const f = fixture({ table: "aviator-x" });
  await f.read();
  assert.deepEqual(f.calls[0].args, ["aviator-x:guest", 42]);
});

test("invalid flight requests are explicitly rejected before touching MySQL", async () => {
  const f = fixture();
  for (const params of ["table=other&round=1", "table=aviator&round=0", "round=1.5", "round=NaN", "table=aviator"]) {
    assert.equal((await f.read(params)).status, 400);
  }
  assert.equal(f.calls.length, 0);
});

test("a not-yet-created round returns no content instead of inventing a flight", async () => {
  assert.equal((await fixture({ missing: true }).read()).status, 204);
});

test("read failures are logged and return a reconnect error, not a success-shaped result", async t => {
  const log = [];
  t.mock.method(console, "error", (...args) => log.push(args));
  const response = await fixture({ fail: true }).read();
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Reconnecting/);
  assert.equal(log.length, 1);
});
