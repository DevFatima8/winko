import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import ts from "typescript";

function fixture(connections) {
  const source = readFileSync(join("src", "lib", "multiplayer-store.ts"), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  let acquired = 0;
  new Function("require", "module", "exports", js)(name => {
    assert.equal(name, "./mysql");
    return {
      ensureMysqlTable: async () => {},
      getMysqlPool: async () => ({
        getConnection: async () => {
          assert.ok(acquired < connections.length, "Unexpected transaction retry");
          return connections[acquired++];
        },
      }),
    };
  }, loaded, loaded.exports);
  return loaded.exports.mysqlMultiplayerStore;
}

function connection(overrides = {}) {
  const calls = [];
  const methods = Object.fromEntries(
    ["ping", "query", "beginTransaction", "execute", "commit", "rollback", "destroy", "release"]
      .map(method => [method, (...args) => {
        calls.push(method);
        return overrides[method]?.(...args);
      }]),
  );
  return { ...methods, calls };
}

test("successful transactions commit and release the connection", async () => {
  const db = connection();
  assert.equal(await fixture([db]).transact("test", async () => 42), 42);
  assert.deepEqual(db.calls, ["ping", "query", "beginTransaction", "execute", "query", "commit", "release"]);
});

test("a stale connection is replaced before transaction work starts", async () => {
  const stale = connection({ ping() { throw Object.assign(new Error("closed state"), { fatal: true }); } });
  const fresh = connection();
  let runs = 0;
  await fixture([stale, fresh]).transact("test", async () => { runs++; });
  assert.deepEqual(stale.calls, ["ping", "destroy"]);
  assert.equal(runs, 1);
  assert.ok(fresh.calls.includes("commit"));
});

test("connection validation stops after one replacement", async () => {
  const error = Object.assign(new Error("connection closed"), { fatal: true });
  const first = connection({ ping() { throw error; } });
  const second = connection({ ping() { throw error; } });
  await assert.rejects(fixture([first, second]).transact("test", async () => assert.fail("Must not run")), e => e === error);
  assert.deepEqual(second.calls, ["ping", "destroy"]);
});

for (const stage of ["query", "beginTransaction"]) {
  test(`a connection reset during ${stage} is replaced before financial work`, async () => {
    const error = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET", fatal: true });
    const stale = connection({ [stage]() { throw error; } });
    const fresh = connection();
    let runs = 0;
    assert.equal(await fixture([stale, fresh]).transact("test", async () => { runs++; return 42; }), 42);
    assert.equal(runs, 1);
    assert.equal(stale.calls.at(-1), "destroy");
    assert.ok(!stale.calls.includes("execute"));
    assert.ok(!stale.calls.includes("commit"));
    assert.ok(fresh.calls.includes("commit"));
  });
}

test("repeated BEGIN connection failures stop after one replacement without financial work", async () => {
  const error = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
  const first = connection({ beginTransaction() { throw error; } });
  const second = connection({ beginTransaction() { throw error; } });
  await assert.rejects(fixture([first, second]).transact("test", async () => assert.fail("Must not run")), e => e === error);
  for (const db of [first, second]) {
    assert.deepEqual(db.calls, ["ping", "query", "beginTransaction", "destroy"]);
  }
});

test("non-connection BEGIN failures are surfaced without retry", async () => {
  const error = new Error("Transaction configuration denied");
  const db = connection({ beginTransaction() { throw error; } });
  await assert.rejects(fixture([db]).transact("test", async () => assert.fail("Must not run")), e => e === error);
  assert.deepEqual(db.calls, ["ping", "query", "beginTransaction", "destroy"]);
});

test("connection errors after acquiring the financial lock are never replayed", async () => {
  const error = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
  const db = connection({ execute() { throw error; } });
  await assert.rejects(fixture([db]).transact("test", async () => assert.fail("Must not run")), e => e === error);
  assert.ok(db.calls.includes("destroy"));
  assert.ok(!db.calls.includes("rollback"));
});

test("fatal transaction errors destroy the connection without rollback or replay", async () => {
  const error = Object.assign(new Error("connection lost"), { fatal: true });
  const db = connection();
  await assert.rejects(fixture([db]).transact("test", async () => { throw error; }), e => e === error);
  assert.ok(db.calls.includes("destroy"));
  assert.ok(!db.calls.includes("rollback"));
  assert.ok(!db.calls.includes("commit"));
  assert.equal(db.calls.at(-1), "release");
});

test("ordinary transaction errors roll back and preserve the original error", async () => {
  const error = new Error("write failed");
  const db = connection();
  await assert.rejects(fixture([db]).transact("test", async () => { throw error; }), e => e === error);
  assert.deepEqual(db.calls.slice(-2), ["rollback", "release"]);
});

test("rollback errors are logged without replacing the original failure", async t => {
  const original = new Error("write failed");
  const rollbackError = Object.assign(new Error("closed state"), { fatal: true });
  const messages = [];
  t.mock.method(console, "error", (...args) => messages.push(args));
  const db = connection({ rollback() { throw rollbackError; } });
  await assert.rejects(fixture([db]).transact("test", async () => { throw original; }), e => e === original);
  assert.deepEqual(db.calls.slice(-3), ["rollback", "destroy", "release"]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0][1], rollbackError);
});

test("a lost commit response never replays the transaction", async () => {
  const error = Object.assign(new Error("commit connection lost"), { code: "ECONNRESET" });
  const db = connection({ commit() { throw error; } });
  let runs = 0;
  await assert.rejects(fixture([db]).transact("test", async () => { runs++; }), e => e === error);
  assert.equal(runs, 1);
  assert.ok(db.calls.includes("destroy"));
  assert.ok(!db.calls.includes("rollback"));
});
