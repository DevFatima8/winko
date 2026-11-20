import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as net from "node:net";
import test from "node:test";
import ts from "typescript";

function load(file, imports) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "exports", code)(name => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  }, loaded.exports);
  return loaded.exports;
}
const ip = load("src\\lib\\requestIp.ts", { "node:net": net });

test("server IP parsing prefers hosting client headers, skips private hops and validates IPv4/IPv6", () => {
  for (const [headers, expected] of [
    [{ "cf-connecting-ip": "203.0.113.42", "x-forwarded-for": "198.51.100.4" }, "203.0.113.42"],
    [{ "x-forwarded-for": "10.0.0.1, ::ffff:203.0.113.42, 192.168.0.1" }, "203.0.113.42"],
    [{ "x-real-ip": "[2001:db8::7]:443" }, "2001:db8::7"],
    [{ "x-real-ip": "203.0.113.42:12345" }, "203.0.113.42"],
    [{ "cf-connecting-ip": "not-an-ip", "x-real-ip": "999.0.0.1", "x-forwarded-for": "198.51.100.4" }, "198.51.100.4"],
    [{}, null],
  ]) assert.equal(ip.requestIp(new Request("http://localhost", { headers })), expected);
});

test("login and signup record the server request IP, never a submitted form IP", async () => {
  for (const mode of ["login", "signup"]) {
    const writes = [], sessions = [], events = [];
    const player = { _id: "player", name: "Player", phone: "03012345678", role: "client", isActive: true, passwordHash: "fixture", username: "player", referralCode: "CODE" };
    const route = load(`src\\app\\api\\auth\\${mode}\\route.ts`, {
      "next/server": { NextResponse: { json: Response.json } },
      "@/lib/requestIp": ip,
      "@/lib/mongo": { dbConnect: async () => {} },
      "@/lib/mysql": { ensureMysqlReady: async () => {} },
      "@/models": {
        oid: String, User: {
          findOne: async () => player,
          find: () => ({ lean: async () => [] }),
          updateOneAtomic: async (_filter, update) => { writes.push(update.$set); return { modifiedCount: 1 }; },
          create: async row => { writes.push(row); return { ...player, ...row }; },
        },
        LoginEvent: { create: async row => events.push(row) },
      },
      "@/lib/auth": { verifyPassword: async () => true, isStaff: () => false, hashPassword: async () => "fixture" },
      "@/lib/platform": { assignPaymentAccounts: async () => {}, genReferralCode: () => "CODE", genUsername: () => "player", getSettings: async () => ({}) },
      "@/lib/seed": { ensurePaymentAccounts: async () => {} },
      "@/lib/serverAuth": {
        createDeviceSession: async (_id, _request, address) => { sessions.push(address); return "session"; },
        setAuthCookie: response => response,
      },
    });
    const form = new FormData();
    for (const [key, value] of Object.entries({ name: "Player", phone: player.phone, password: "password", confirmPassword: "password", loginIp: "198.51.100.99", registrationIp: "198.51.100.99" })) form.set(key, value);
    const response = await route.POST(new Request("http://localhost", { method: "POST", headers: { "x-real-ip": "203.0.113.42" }, body: form }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).id, "player");
    assert.equal(writes[0].lastLoginIp, "203.0.113.42");
    if (mode === "signup") {
      assert.equal(writes[0].registrationIp, "203.0.113.42");
      assert.equal(writes[0].creditScore, 100);
    }
    assert.deepEqual(sessions, ["203.0.113.42"]);
    assert.equal(events[0].ip, "203.0.113.42");
  }
});
