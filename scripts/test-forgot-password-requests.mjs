import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(file, imports = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", code)(name => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}

async function fixture() {
  const { Model } = load("src\\lib\\localdb.ts");
  const ForgotPasswordRequest = new Model("ForgotPasswordRequest", {
    collection: "forgotpasswordrequests",
    unique: [["requestNo"]],
    defaults: () => ({ status: "pending", adminReply: null, repliedAt: null, repliedById: null, repliedByName: null }),
  });
  ForgotPasswordRequest.updateOneAtomic = ForgotPasswordRequest.updateOne.bind(ForgotPasswordRequest);
  let user = { id: "admin-1", role: "admin", level: 2, name: "Test Admin" };
  const service = load("src\\lib\\forgotPasswordRequests.ts", {
    "node:crypto": await import("node:crypto"),
    "@/models": { ForgotPasswordRequest },
    "@/lib/mongo": { dbConnect: async () => {} },
    "@/lib/serverAuth": { getServerSessionUser: async () => user },
  });
  return { ...service, ForgotPasswordRequest, setUser: value => { user = value; } };
}

test("forgot-password requests generate private reply receipts and clear the pending count after an admin reply", async () => {
  const f = await fixture();
  assert.equal((await f.createForgotPasswordRequest({ phone: "bad", accountId: "WX-1" })).status, 400);
  assert.equal((await f.createForgotPasswordRequest({ phone: "03001234567" })).status, 400);

  const created = await f.createForgotPasswordRequest({ phone: "03001234567", name: "A Player" });
  assert.equal(created.ok, true);
  assert.match(created.requestNo, /^FP-\d{10}$/);
  assert.equal(await f.ForgotPasswordRequest.countDocuments({ status: "pending" }), 1);
  assert.equal((await f.getForgotPasswordRequestReply(created.requestNo, "wrong-token")).status, 404);
  assert.deepEqual(await f.getForgotPasswordRequestReply(created.requestNo, created.token), {
    ok: true, status: "pending", reply: null, repliedAt: null,
  });

  const list = await f.getAdminForgotPasswordRequests(false);
  assert.equal(list.requests[0].requestNo, created.requestNo);
  assert.equal(list.requests[0].phone, "03001234567");
  assert.equal(list.requests[0].name, "A Player");
  assert.equal(list.requests[0].accountId, null);
  assert.equal("trackingTokenHash" in list.requests[0], false);

  f.setUser({ id: "subadmin-1", role: "admin", level: 1, name: "Sub-admin" });
  assert.equal((await f.getAdminForgotPasswordRequests(true)).status, 403);
  assert.equal((await f.replyToForgotPasswordRequest(list.requests[0].id, "Not allowed")).status, 403);
  f.setUser({ id: "admin-1", role: "admin", level: 2, name: "Test Admin" });

  assert.deepEqual(await f.replyToForgotPasswordRequest(list.requests[0].id, "Please contact support to verify your account."), { ok: true });
  assert.equal((await f.getAdminForgotPasswordRequests(true)).unread, 0);
  assert.equal((await f.replyToForgotPasswordRequest(list.requests[0].id, "Duplicate")).status, 409);
  assert.deepEqual(await f.getForgotPasswordRequestReply(created.requestNo, created.token), {
    ok: true, status: "replied", reply: "Please contact support to verify your account.", repliedAt: (await f.ForgotPasswordRequest.findById(list.requests[0].id).lean()).repliedAt,
  });
});

test("forgot-password submissions normalize phone formatting and rate-limit repeated requests", async () => {
  const f = await fixture();
  for (let i = 0; i < 3; i++) {
    const result = await f.createForgotPasswordRequest({ phone: "030 0123-4567", accountId: `WX-${i}` });
    assert.equal(result.ok, true);
  }
  assert.equal((await f.createForgotPasswordRequest({ phone: "03001234567", name: "Player" })).status, 429);
});

test("public request endpoint keeps the tracking token out of URLs and returns only the ticket reply", async () => {
  const f = await fixture();
  const route = load("src\\app\\api\\auth\\forgot-password\\route.ts", {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/requestOrigin": { isAllowedGameOrigin: request => request.headers.get("origin") === "https://winko.test" },
    "@/lib/forgotPasswordRequests": f,
  });
  const submitted = await route.POST(new Request("https://winko.test/api/auth/forgot-password", {
    method: "POST",
    headers: { origin: "https://winko.test", "content-type": "application/json" },
    body: JSON.stringify({ phone: "03001234567", accountId: "WX-123" }),
  }));
  assert.equal(submitted.status, 200);
  assert.equal(submitted.headers.get("cache-control"), "no-store");
  const receipt = await submitted.json();
  assert.match(receipt.requestNo, /^FP-\d{10}$/);
  assert.equal(typeof receipt.token, "string");

  const wrongOrigin = await route.POST(new Request("https://winko.test/api/auth/forgot-password", {
    method: "POST",
    headers: { origin: "https://attacker.test", "content-type": "application/json" },
    body: JSON.stringify({ phone: "03000000000", name: "Someone" }),
  }));
  assert.equal(wrongOrigin.status, 403);

  const status = await route.GET(new Request(`https://winko.test/api/auth/forgot-password?requestNo=${receipt.requestNo}`, {
    headers: { authorization: `Bearer ${receipt.token}` },
  }));
  assert.deepEqual(await status.json(), { ok: true, status: "pending", reply: null, repliedAt: null });
  assert.equal(status.headers.get("cache-control"), "no-store");
});
