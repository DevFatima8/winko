import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";

function load(file, imports, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "exports", ...Object.keys(globals), code)(name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  }, exports, ...Object.values(globals));
  return exports;
}
const presets = load("src\\lib\\betPresets.ts", {});

function adminScene({ me = { id: "staff", role: "admin", level: 2, dbRole: "admin", name: "Staff" },
  player = { role: "client", referredBy: "someone-else" }, matchedCount = 1, fail = false } = {}) {
  const writes = [], logs = [], errors = [];
  const route = load("src\\app\\api\\admin\\bet-presets\\route.ts", {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/models": {
      oid: id => id,
      User: {
        findById: () => ({ lean: async () => player }),
        updateOne: async (filter, update) => { if (fail) throw new Error("Write failed"); writes.push({ filter, update }); return { matchedCount }; },
      },
      AdminLog: { create: async row => logs.push(row) },
    },
    "@/lib/serverAuth": { getServerSessionUser: async () => me },
    "@/lib/betPresets": presets,
    "@/lib/auth": { isStaff: role => ["owner", "admin", "subadmin"].includes(role) },
  }, { console: { error: (...args) => errors.push(args) } });
  return {
    writes, logs, errors,
    post: (body = { userId: "player", betPresets: [10, 25, 75, 100, 500] }) => route.POST(new Request("http://fixture.invalid/api/admin/bet-presets", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })),
  };
}

test("admin custom bet updates enforce login, staff level, player scope and valid amounts", async () => {
  for (const [options, status] of [
    [{ me: null }, 403], [{ me: { role: "client", level: 2 } }, 403],
    [{ me: { role: "admin", level: 0 } }, 403],
    [{ me: { id: "staff", role: "admin", level: 1 } }, 404],
    [{ player: { role: "admin" } }, 404], [{ player: null }, 404],
  ]) {
    const scene = adminScene(options);
    assert.equal((await scene.post()).status, status);
    assert.equal(scene.writes.length, 0);
  }
  for (const betPresets of [[5, 20, 50, 100, 200], [10, 10, 50, 100, 200], [10, 20, 50], [10, 20, 50, 100, 50001]]) {
    const scene = adminScene();
    assert.equal((await scene.post({ userId: "player", betPresets })).status, 400);
    assert.equal(scene.writes.length, 0);
  }
});

test("authorized staff persist only the target player's presets and record the actor", async () => {
  for (const level of [1, 2]) {
    const scene = adminScene({ me: { id: "staff", role: "admin", level, dbRole: "subadmin", name: "Staff" }, player: { role: "client", referredBy: "staff" } });
    const response = await scene.post();
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).betPresets, [10, 25, 75, 100, 500]);
    assert.deepEqual(scene.writes, [{ filter: { _id: "player" }, update: { $set: { betPresets: [10, 25, 75, 100, 500] } } }]);
    assert.equal(scene.logs[0].actorId, "staff");
    assert.equal(scene.logs[0].target, "player");
  }
  const failed = adminScene({ fail: true });
  assert.equal((await failed.post()).status, 503);
  assert.equal(failed.errors.length, 1);
  assert.equal((await adminScene({ matchedCount: 0 }).post()).status, 404);
});

test("successful signup returns the lobby directly and replaces the registration history entry immediately", async () => {
  let sessions = 0, cleared = 0;
  const { signupAction } = load("src\\lib\\clientActions.ts", {
    "@/lib/auth": { createSession: async () => sessions++ },
    "./providerCatalogCache": { clearProviderCatalog: async () => cleared++ },
  }, {
    document: { cookie: "" }, sessionStorage: {},
    fetch: async url => {
      assert.equal(url, "/api/auth/signup");
      return Response.json({ id: "new-player", role: "client", name: "Player" });
    },
  });
  const state = await signupAction(undefined, new FormData());
  assert.equal(state.redirect, "/");
  assert.equal(sessions, 1);
  assert.equal(cleared, 1);
  const effects = [], timers = [], destinations = [];
  const { AuthForm } = load("src\\components\\AuthForm.tsx", {
    "react/jsx-runtime": jsxRuntime,
    react: { useActionState: () => [state, () => {}, false], useState: initial => [initial, () => {}], useEffect: fn => effects.push(fn) },
    "next/link": { default: "a" }, "@/lib/clientActions": {},
    "@/lib/i18n/client": { useI18n: () => ({ t: key => key }) },
    ...Object.fromEntries(["ThemeToggle", "LanguageSwitch", "BrandLogo"].map(name => [`@/components/${name}`, { [name]: name }])),
  }, {
    window: { location: { replace: url => destinations.push(url) } },
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    clearTimeout() {},
  });
  AuthForm({ mode: "signup" });
  effects[0]();
  assert.equal(timers[0].delay, 0);
  timers[0].callback();
  assert.deepEqual(destinations, ["/"]);
});

test("switching from another player's custom presets cannot reload signup or login before the lobby redirect", async () => {
  for (const pathname of ["/signup", "/login", "/player/games/birds-beasts"]) {
    const effects = [], updates = [];
    let reloads = 0;
    const user = { id: "new-player", role: "client", betPresets: [10, 20, 50, 100, 200] };
    const { useSession: runSessionHook } = load("src\\lib\\useDb.tsx", {
      react: {
        useState: initial => [initial, value => updates.push(value)],
        useEffect: fn => effects.push(fn), useRef: current => ({ current }), useCallback: fn => fn,
      },
      "react/jsx-runtime": jsxRuntime, "next/navigation": { notFound() {} },
      "./auth": { getCurrentUser: async () => user },
      "./betPresets": { activateBetPresets: () => true },
    }, { window: { location: { pathname, reload: () => reloads++ } } });
    runSessionHook();
    effects[0]();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reloads, pathname.startsWith("/player/games/") ? 1 : 0);
    if (pathname === "/signup") assert.ok(updates.includes(user), "the successful session is retained on signup");
  }
});
