import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const module = { exports: {} };
const source = ts.transpileModule(readFileSync("src\\lib\\requestOrigin.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
new Function("require", "module", "exports", source)(() => ({ SITE_URL: "https://game.example" }), module, module.exports);
const { isAllowedGameOrigin } = module.exports;

test("bets accept direct same-origin and explicitly configured proxy-facing origins", () => {
  assert.equal(isAllowedGameOrigin(new Request("http://localhost:3000/api/multiplayer/dice", { headers: { origin: "http://localhost:3000" } })), true);
  assert.equal(isAllowedGameOrigin(new Request("http://127.0.0.1:3000/api/multiplayer/dice", { headers: { origin: "https://game.example" } })), true);
});

test("bets reject foreign, opaque, malformed and spoofed forwarded origins", () => {
  for (const origin of ["https://evil.example", "null", "https://game.example.evil", "https://game.example/path", "https://game.example/"]) {
    assert.equal(isAllowedGameOrigin(new Request("http://localhost:3000/api/multiplayer/dice", {
      headers: { origin, "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" },
    })), false, origin);
  }
  assert.equal(isAllowedGameOrigin(new Request("http://localhost:3000/api", { headers: { "sec-fetch-site": "cross-site" } })), false);
  assert.equal(isAllowedGameOrigin(new Request("http://localhost:3000/api")), true);
});
