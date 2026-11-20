import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function service(notification) {
  const calls = [];
  const models = {
    Notification: {
      findOne: filter => ({ lean: async () => {
        calls.push({ kind: "find", filter });
        return notification && notification._id === filter._id && notification.isActive ? notification : null;
      } }),
      updateOneAtomic: async (filter, update) => {
        calls.push({ kind: "update", filter, update });
        notification.readBy.push("player");
        return { matchedCount: 1 };
      },
    },
    User: { find: () => ({ lean: async () => [] }) },
    oid: String,
  };
  const imports = { "./mongo": { dbConnect: async () => {} }, "@/models": models };
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync("src\\lib\\notifications.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", code)(name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return { mark: loaded.exports.markNotificationRead, calls };
}

test("marks one authorized notification as read for the current player", async () => {
  const notification = { _id: "abcdefabcdefabcdefabcdef", audience: "user", userId: "player", isActive: true, readBy: [] };
  const fixture = service(notification);
  assert.deepEqual(await fixture.mark("player", "client", notification._id), { ok: true });

  const readUpdate = fixture.calls.find(call => call.kind === "update");
  assert.equal(readUpdate.filter._id, notification._id);
  assert.equal(readUpdate.filter.readBy.$ne, "player");
  assert.equal(readUpdate.update.$addToSet.readBy, "player");
  assert.ok(readUpdate.filter.$or.some(branch => branch.audience === "user" && branch.userId === "player"));
});

test("does not mark a notification outside the current user's audience", async () => {
  const fixture = service(null);
  const result = await fixture.mark("player", "client", "abcdefabcdefabcdefabcdef");
  assert.deepEqual(result, { ok: false, error: "Notification not found." });
  assert.equal(fixture.calls.filter(call => call.kind === "update").length, 0);
});

test("does not access notifications for an unauthenticated visitor", async () => {
  const fixture = service(null);
  assert.deepEqual(await fixture.mark(null, null, "abcdefabcdefabcdefabcdef"), { ok: false, error: "Unauthorized" });
  assert.equal(fixture.calls.length, 0);
});
