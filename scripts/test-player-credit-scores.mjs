import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(file, imports = {}) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "exports", code)(name => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  }, loaded.exports);
  return loaded.exports;
}
const { adjustCreditScore } = load("src\\lib\\creditScore.ts");

function store() {
  let data = {
    users: new Map([["player", { _id: "player", role: "client", referredBy: "staff", balance: 500, vipBetPoints: 200 }]]),
    adminlogs: new Map(),
  };
  let queue = Promise.resolve(), fail = false;
  const transact = work => {
    const result = queue.then(async () => {
      const staged = structuredClone(data);
      const tx = {
        get: async (table, id, locked) => { assert.equal(locked, true); return staged[table].get(id); },
        now: async () => Date.now(),
        put: async (table, id, row) => staged[table].set(id, row),
        insert: async (table, id, row) => { if (fail) throw new Error("Fixture audit failed"); staged[table].set(id, row); },
      };
      const reply = await work(tx);
      data = staged;
      return reply;
    });
    queue = result.catch(() => {});
    return result;
  };
  return { transact, data: () => data, fail: () => { fail = true; } };
}
const actor = { id: "staff", name: "Staff", dbRole: "subadmin", level: 1 };

test("player session exposes the saved credit score, including zero, separately from VIP points", () => {
  const { toCurrentUser } = load("src\\lib\\auth.ts", { "@/lib/betPresets": { DEFAULT_BET_PRESETS: [10, 20] } });
  const player = { _id: "player", role: "client", vipBetPoints: 400 };
  assert.equal(toCurrentUser(player).creditScore, 100);
  for (const creditScore of [0, 75, 125]) {
    const user = toCurrentUser({ ...player, creditScore });
    assert.equal(user.creditScore, creditScore);
    assert.equal(user.vipBetPoints, 400);
  }
});

test("every staff level adjusts persisted credit scores without touching balance or VIP points", async () => {
  for (const [dbRole, level] of [["subadmin", 1], ["admin", 2], ["owner", 3]]) {
    const s = store();
    assert.equal(await s.transact(tx => adjustCreditScore(tx, { ...actor, dbRole, level }, "player", 25, "add")), 125);
    assert.equal(await s.transact(tx => adjustCreditScore(tx, { ...actor, dbRole, level }, "player", 125, "remove")), 0);
    assert.equal(s.data().users.get("player").balance, 500);
    assert.equal(s.data().users.get("player").vipBetPoints, 200);
    assert.equal(s.data().adminlogs.size, 2);
  }
});

test("credit score edits reject foreign teams, staff accounts, invalid input and negative totals", async () => {
  const s = store();
  const before = structuredClone(s.data());
  for (const [who, id, amount, direction] of [
    [{ ...actor, level: 0, dbRole: "client" }, "player", 1, "add"],
    [{ ...actor, id: "other-admin" }, "player", 1, "add"],
    [actor, "missing", 1, "add"], [actor, "player", 101, "remove"],
    [actor, "player", 1.5, "add"], [actor, "player", 0, "add"],
    [actor, "player", 1, "invalid"], [actor, "player", Number.MAX_SAFE_INTEGER, "add"],
  ]) {
    await assert.rejects(s.transact(tx => adjustCreditScore(tx, who, id, amount, direction)));
    assert.deepEqual(s.data(), before);
  }
  s.data().users.get("player").role = "admin";
  await assert.rejects(s.transact(tx => adjustCreditScore(tx, { ...actor, level: 3, dbRole: "owner" }, "player", 1, "add")), /not found/);
});

test("concurrent adjustments preserve both edits and failed audits roll back the score", async () => {
  const s = store();
  await Promise.all([10, 20].map(amount => s.transact(tx => adjustCreditScore(tx, actor, "player", amount, "add"))));
  assert.equal(s.data().users.get("player").creditScore, 130);
  const before = structuredClone(s.data());
  s.fail();
  await assert.rejects(s.transact(tx => adjustCreditScore(tx, actor, "player", 10, "remove")), /audit failed/);
  assert.deepEqual(s.data(), before);
});

test("credit score listings keep team permissions and only select score-related account fields", async () => {
  for (const level of [0, 1, 2, 3]) {
    const queries = [];
    const route = load("src\\app\\api\\admin\\data\\route.ts", {
      "next/server": { NextResponse: { json: Response.json } },
      "@/models": { User: { find: (filter, fields) => {
        queries.push({ filter, fields });
        return { sort: () => ({ limit: () => ({ lean: async () => [{ _id: "player", name: "Player", creditScore: 80 }] }) }) };
      } } },
      "@/lib/serverAuth": { getServerSessionUser: async () => ({ id: "staff", level, dbRole: ["client", "subadmin", "admin", "owner"][level] }) },
      "@/lib/auth": { isStaff: role => ["subadmin", "admin", "owner"].includes(role) },
      "@/lib/platform": {}, "@/lib/siteGameCatalog": {}, "@/lib/gameCatalog": {},
      "@/lib/gameAvailability": {}, "@/lib/gameResultGames": {}, "@/lib/dashboardLogins": {},
    });
    const response = await route.GET(new Request("http://localhost/api/admin/data?view=creditScores&q=Player"));
    assert.equal(response.status, level === 0 ? 403 : 200);
    if (!level) { assert.equal(queries.length, 0); continue; }
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(queries[0].filter.referredBy, level === 1 ? "staff" : undefined);
    assert.deepEqual(queries[0].filter.role, { $in: ["client", "agent"] });
    assert.match(queries[0].fields, /creditScore/);
    assert.doesNotMatch(queries[0].fields, /password|withdrawPin/);
    assert.equal((await response.json()).users[0].creditScore, 80);
  }
});

test("user search debounces typing, submits without navigation and cancels stale timers", () => {
  const previousTimeout = globalThis.setTimeout, previousClear = globalThis.clearTimeout;
  const timers = new Map(), searches = [];
  let timerId = 0, draft, cleanup;
  const ref = { current: null };
  const jsx = (type, props) => ({ type, props });
  globalThis.setTimeout = fn => { timers.set(++timerId, fn); return timerId; };
  globalThis.clearTimeout = id => timers.delete(id);
  try {
    const { AdminUserSearch } = load("src\\components\\admin\\AdminUserSearch.tsx", {
      "react/jsx-runtime": { jsx, jsxs: jsx },
      react: {
        useState: initial => [draft ??= initial, next => { draft = next; }],
        useRef: () => ref,
        useEffect: fn => { cleanup = fn(); },
      },
    });

    const render = () => AdminUserSearch({ initial: { q: "", role: "", order: "desc" }, onSearch: value => searches.push(value) });
    render().props.children[0].props.onChange({ target: { value: "al" } });
    render().props.children[0].props.onChange({ target: { value: "alice" } });
    assert.equal(timers.size, 1);
    [...timers.values()][0]();
    assert.deepEqual(searches[0], { q: "alice", role: "", order: "desc" });
    let prevented = false;
    render().props.onSubmit({ preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(timers.size, 0);
    cleanup();
  } finally {
    globalThis.setTimeout = previousTimeout; globalThis.clearTimeout = previousClear;
  }
});

test("visible sessions recheck for forced logout on the timer and focus, and stop checking when hidden", async () => {
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  const listeners = new Map(), effects = [], values = [];
  let index = 0, user = { id: "player", role: "client", balance: 100, betPresets: [10, 20] }, interval, stopped = false;
  globalThis.window = {
    setInterval: (fn, delay) => { assert.equal(delay, 15000); interval = fn; return 1; },
    clearInterval: () => { stopped = true; },
    addEventListener: (key, fn) => listeners.set(key, fn),
    removeEventListener: key => listeners.delete(key),
    location: { pathname: "/player" },
  };
  globalThis.document = {
    hidden: false,
    addEventListener: (key, fn) => listeners.set(key, fn),
    removeEventListener: key => listeners.delete(key),
  };
  try {
    const hooks = load("src\\lib\\useDb.tsx", {
      react: {
        useState: initial => {
          const key = index++;
          if (!(key in values)) values[key] = initial;
          return [values[key], next => { values[key] = typeof next === "function" ? next(values[key]) : next; }];
        },
        useEffect: fn => effects.push(fn), useRef: () => ({}), useCallback: fn => fn,
      },
      "./auth": { getCurrentUser: async () => user },
      "./betPresets": { activateBetPresets: () => false },
      "./walletReveal": { walletRevealRevision: () => 0, presentedWalletBalance: value => value },
      "next/navigation": {}, "react/jsx-runtime": {},
    });
    hooks.useSession();
    effects[0]();
    const cleanup = effects[1]();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(values[0].id, "player");
    const before = values[1];
    interval();
    assert.equal(values[1], before + 1);
    globalThis.document.hidden = true;
    interval();
    assert.equal(values[1], before + 1);
    globalThis.document.hidden = false;
    listeners.get("focus")();
    assert.equal(values[1], before + 2);
    user = null;
    index = 0;
    effects.length = 0;
    hooks.useSession();
    effects[0]();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(values[0], null);
    cleanup();
    assert.equal(stopped, true);
    assert.equal(listeners.size, 0);
  } finally {
    globalThis.window = previousWindow; globalThis.document = previousDocument;
  }
});
