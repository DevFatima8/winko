import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const listeners = new Set();
globalThis.window = {
  dispatchEvent: event => {
    for (const listener of listeners) listener(event);
    return true;
  },
};
globalThis.Event = class TestEvent {
  constructor(type) { this.type = type; }
};

let reducer;
const loaded = { exports: {} };
const code = ts.transpileModule(readFileSync("src\\lib\\adminLiveUpdates.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function("require", "module", "exports", code)(name => {
  assert.equal(name, "react");
  return {
    useActionState: (action, initialState) => {
      reducer = action;
      return [initialState, () => {}, false];
    },
  };
}, loaded, loaded.exports);

test("admin action-state refreshes all loaders only after successful mutations", async () => {
  let refreshes = 0;
  const listener = event => {
    if (event.type === "wx:admin-refresh") refreshes++;
  };
  listeners.add(listener);
  try {
    loaded.exports.useAdminActionState(async (_state, payload) => payload === "ok"
      ? { success: "saved" }
      : { error: "not saved" }, undefined);
    assert.deepEqual(await reducer(undefined, "ok"), { success: "saved" });
    assert.equal(refreshes, 1);
    assert.deepEqual(await reducer(undefined, "failed"), { error: "not saved" });
    assert.equal(refreshes, 1);
  } finally { listeners.delete(listener); }
});

test("wrapped admin actions refresh after success, skip returned errors, and preserve thrown errors", async () => {
  let refreshes = 0;
  const listener = event => {
    if (event.type === "wx:admin-refresh") refreshes++;
  };
  listeners.add(listener);
  try {
    const success = loaded.exports.withAdminRefresh(async id => ({ id }));
    assert.deepEqual(await success("item"), { id: "item" });
    assert.equal(refreshes, 1);

    const rejected = loaded.exports.withAdminRefresh(async () => ({ error: "denied" }));
    assert.deepEqual(await rejected(), { error: "denied" });
    assert.equal(refreshes, 1);

    const failed = loaded.exports.withAdminRefresh(async () => { throw new Error("database unavailable"); });
    await assert.rejects(failed(), /database unavailable/);
    assert.equal(refreshes, 1);

    const noResult = loaded.exports.withAdminRefresh(async () => undefined);
    assert.equal(await noResult(), undefined);
    assert.equal(refreshes, 2);
  } finally { listeners.delete(listener); }
});
