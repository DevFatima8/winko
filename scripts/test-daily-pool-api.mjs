import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import ts from "typescript";

function load(path, imports = {}) {
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}
const types = load("src\\lib\\multiplayer-types.ts");
const catalog = load("src\\lib\\gameCatalog.ts");
const rules = load("src\\lib\\dailyPoolRules.ts", { "./gameCatalog": catalog, "./multiplayer-types": types });
const next = { NextResponse: { json: (body, init) => Response.json(body, init) } };
function route({ enabled = true, user = { id: "alice", role: "client" }, noActiveChicken = false } = {}) {
  const calls = [];
  const record = name => async (...args) => { calls.push({ name, args }); return { ok: true }; };
  const imports = Object.fromEntries(["plinko", "limbo", "mines", "slot777", "cards", "gateway", "notifications", "feedback"].map(name => [`@/lib/${name}`, {}]));
  return {
    ...load("src\\app\\api\\[...path]\\route.ts", {
      ...imports, "next/server": next,
      "@/lib/aviator": { isTable: table => ["aviator", "aviator-x"].includes(table), placeBet: record("flight"), cashOut: record("flight-cashout"), cancelBet: record("flight-cancel"), flightStatistics: record("flight-stats") },
      "@/lib/cards": { isTable: table => ["dragon-tiger", "andar-bahar"].includes(table), placeBet: record("card-bet") },
      "@/lib/slot777": { spin: record("slot-spin") },
      "@/lib/chicken": { startGame: record("legacy-road"), step: record("legacy-road-step"), cashOut: record("legacy-road-cashout") },
      "@/lib/chickendash": { startGame: record("legacy-dash"), step: record("legacy-dash-step"), cashOut: record("legacy-dash-cashout") },
      "@/lib/serverAuth": { getServerSessionUser: async () => user },
      "@/lib/gameAvailability": { LOCAL_GAMES_CONNECTED: true },
      "@/lib/dailyPoolRules": rules,
      "@/lib/dailyPoolConfig": { dailyPoolEnabled: () => enabled },
      "@/lib/dailyPoolChicken": { startPoolChicken: record("pool-chicken"), actPoolChicken: noActiveChicken ? async (...args) => { calls.push({ name: "pool-action", args }); return null; } : record("pool-action") },
    }),
    calls,
  };
}
const post = (url, body = {}) => new Request(`https://fixture.invalid${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("flight statistics require login and scope players without exposing other players' totals", async () => {
  const guest = route({ user: null });
  assert.equal((await guest.GET(new Request("https://fixture.invalid/api/aviator/stats"))).status, 401);
  assert.equal(guest.calls.length, 0);
  const player = route();
  assert.equal((await player.GET(new Request("https://fixture.invalid/api/aviator/stats?table=aviator-x&userId=bob"))).status, 200);
  assert.deepEqual(player.calls, [{ name: "flight-stats", args: ["aviator-x", "alice"] }]);
  const admin = route({ user: { id: "staff", role: "admin" } });
  assert.equal((await admin.GET(new Request("https://fixture.invalid/api/aviator/stats"))).status, 200);
  assert.deepEqual(admin.calls[0].args, ["aviator", undefined]);
  assert.equal((await admin.GET(new Request("https://fixture.invalid/api/aviator/stats?table=bad"))).status, 400);
});

test("instant card placements do not require a deferred daily-pool acknowledgement", async () => {
  for (const table of ["dragon-tiger", "andar-bahar"]) {
    const f = route();
    const response = await f.POST(post("/api/cards/bet", { table, option: "test", amount: 10 }));
    assert.equal(response.status, 200);
    assert.equal(f.calls[0].name, "card-bet");
    const guest = route({ user: null });
    assert.equal((await guest.POST(post("/api/cards/bet", { table, amount: 10 }))).status, 401);
  }
});

test("instant Lucky 777 bets do not require deferred-pool consent and still require login", async () => {
  const f = route();
  const response = await f.POST(post("/api/slot777", { amount: 100000, requestId: "slot-request-000001" }));
  assert.equal(response.status, 200);
  assert.deepEqual(f.calls, [{ name: "slot-spin", args: ["alice", 100000, "slot-request-000001"] }]);
  const guest = route({ user: null });
  assert.equal((await guest.POST(post("/api/slot777", { amount: 100000 }))).status, 401);
  assert.deepEqual(guest.calls, []);
});

test("Aviator forwards queue and server auto targets without legacy pool consent", async () => {
  const f = route();
  const body = { table: "aviator", amount: 50, slot: 0, roundNo: 42, queueIfClosed: true, autoCashout: 2 };
  assert.equal((await f.POST(post("/api/aviator/bet", body))).status, 200);
  assert.deepEqual(f.calls[0].args, ["alice", "aviator", 50, 0, 42, true, 2]);
  const guest = route({ user: null });
  assert.equal((await guest.POST(post("/api/aviator/bet", body))).status, 401);
  assert.equal(guest.calls.length, 0);
  await f.POST(post("/api/aviator/bet", { ...body, autoCashout: "2" }));
  assert.ok(Number.isNaN(f.calls[1].args[6]));
});

test("unchanged chicken pool placements require authenticated current-rules acknowledgement before mutation", async () => {
  const cases = [
    ["/api/chicken/start", { difficulty: "easy", amount: 100 }],
    ["/api/chickendash/start", { level: "easy", amount: 100 }],
  ];
  for (const [path, body] of cases) {
    for (const version of [undefined, "old-version"]) {
      const fixture = route();
      const response = await fixture.POST(post(path, { ...body, poolRulesVersion: version }));
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /accept/);
      assert.deepEqual(fixture.calls, []);
    }
    const unauthenticated = route({ user: null });
    assert.equal((await unauthenticated.POST(post(path, body))).status, 401);
    const fixture = route();
    assert.equal((await fixture.POST(post(path, { ...body, poolRulesVersion: rules.DAILY_POOL_VERSION }))).status, 200);
    assert.equal(fixture.calls.length, 1);
  }
});

test("cashout/completion is not blocked by new-bet acknowledgement; chicken start keeps its existing dispatcher", async () => {
  for (const path of ["/api/chicken/cashout", "/api/chicken/step", "/api/chickendash/cashout", "/api/chickendash/step", "/api/aviator/cashout"]) {
    const fixture = route();
    assert.equal((await fixture.POST(post(path))).status, 200);
    assert.equal(fixture.calls.length, 1);
  }
  const fixture = route({ enabled: false });
  assert.equal((await fixture.POST(post("/api/chicken/start", { difficulty: "easy", amount: 100 }))).status, 200);
  assert.equal(fixture.calls[0].name, "pool-chicken");
});

test("no active chicken wager does not fall back to a non-transactional action", async () => {
  for (const path of ["/api/chicken/step", "/api/chicken/cashout", "/api/chickendash/step", "/api/chickendash/cashout"]) {
    const fixture = route({ noActiveChicken: true });
    const response = await fixture.POST(post(path));
    assert.ok((await response.json()).error);
    assert.deepEqual(fixture.calls.map(call => call.name), ["pool-action"]);
  }
});

test("client acknowledges each game separately and never changes legacy action payloads", async () => {
  const consent = load("src\\lib\\dailyPoolConsent.ts", { "./dailyPoolRules": rules });
  const client = load("src\\lib\\client.ts", { "./dailyPoolConsent": consent, "./dailyPoolRules": rules });
  const originalFetch = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return Response.json({}); };
  try {
    const send = (url, body) => client.localApi(url, { method: "POST", body: JSON.stringify(body) });
    await send("/api/aviator/bet", { table: "aviator", amount: 100 });
    assert.equal(JSON.parse(calls.at(-1).init.body).poolRulesVersion, undefined);
    consent.acceptDailyPool("aviator");
    await send("/api/aviator/bet", { table: "aviator", amount: 100 });
    assert.equal(JSON.parse(calls.at(-1).init.body).poolRulesVersion, rules.DAILY_POOL_VERSION);
    await send("/api/aviator/bet", { table: "aviator-x", amount: 100 });
    assert.equal(JSON.parse(calls.at(-1).init.body).poolRulesVersion, undefined);
    await send("/api/aviator/cashout", { table: "aviator", slot: 0 });
    assert.deepEqual(JSON.parse(calls.at(-1).init.body), { table: "aviator", slot: 0 });
  } finally { globalThis.fetch = originalFetch; }
});

test("scheduler requires configured secret and exact authentication, then processes every catalog game", async () => {
  const previous = process.env.DAILY_POOL_CRON_SECRET;
  const calls = [];
  const cron = load("src\\app\\api\\cron\\daily-pools\\route.ts", {
    "node:crypto": { timingSafeEqual }, "next/server": next,
    "@/lib/dailyPoolRules": rules,
    "@/lib/dailyPoolService": { processDailyPool: async game => calls.push(game) },
  });

  test("one failed game cannot starve later daily pools; scheduler reports incomplete settlement", async () => {
    const previous = process.env.DAILY_POOL_CRON_SECRET;
    const calls = [];
    const cron = load("src\\app\\api\\cron\\daily-pools\\route.ts", {
      "node:crypto": { timingSafeEqual }, "next/server": next, "@/lib/dailyPoolRules": rules,
      "@/lib/dailyPoolService": { processDailyPool: async game => { calls.push(game); if (game === rules.DAILY_POOL_GAMES[0]) throw new Error("Fixture failure"); } },
    });
    try {
      process.env.DAILY_POOL_CRON_SECRET = "test-only-not-a-deployment-secret";
      const response = await cron.POST(new Request("https://fixture.invalid/api/cron/daily-pools", { method: "POST", headers: { authorization: `Bearer ${process.env.DAILY_POOL_CRON_SECRET}` } }));
      assert.equal(response.status, 503);
      assert.deepEqual((await response.json()).failed, [rules.DAILY_POOL_GAMES[0]]);
      assert.deepEqual(calls, [...rules.DAILY_POOL_GAMES]);
    } finally {
      if (previous === undefined) delete process.env.DAILY_POOL_CRON_SECRET; else process.env.DAILY_POOL_CRON_SECRET = previous;
    }
  });
  const request = token => new Request("https://fixture.invalid/api/cron/daily-pools", { method: "POST", headers: token ? { authorization: token } : {} });
  try {
    delete process.env.DAILY_POOL_CRON_SECRET;
    assert.equal((await cron.POST(request())).status, 503);
    process.env.DAILY_POOL_CRON_SECRET = "test-only-not-a-deployment-secret";
    assert.equal((await cron.POST(request())).status, 401);
    assert.equal((await cron.POST(request("Bearer wrong"))).status, 401);
    assert.deepEqual(calls, []);
    assert.equal((await cron.POST(request(`Bearer ${process.env.DAILY_POOL_CRON_SECRET}`))).status, 200);
    assert.deepEqual(calls, [...rules.DAILY_POOL_GAMES]);
  } finally {
    if (previous === undefined) delete process.env.DAILY_POOL_CRON_SECRET; else process.env.DAILY_POOL_CRON_SECRET = previous;
  }
});

test("personal pool endpoint cannot read another player's wagers", async () => {
  for (const user of [null, { id: "admin", role: "admin" }, { id: "alice", role: "client" }]) {
    const calls = [];
    const api = load("src\\app\\api\\player\\daily-pool\\route.ts", {
      "next/server": next, "@/lib/serverAuth": { getServerSessionUser: async () => user },
      "@/lib/dailyPoolRules": rules, "@/lib/dailyPoolConfig": { dailyPoolEnabled: () => true },
      "@/lib/cardGameRules": load("src\\lib\\cardGameRules.ts"),
      "@/lib/rouletteGameRules": load("src\\lib\\rouletteGameRules.ts"),
      "@/lib/slotGameRules": load("src\\lib\\slotGameRules.ts"),
      "@/lib/dailyPoolService": { playerPoolStatus: async (...args) => { calls.push(args); return { entries: [] }; } },
    });
    const response = await api.GET(new Request("https://fixture.invalid/api/player/daily-pool?game=aviator&userId=bob"));
    assert.equal(response.status, user?.role === "client" ? 200 : 401);
    assert.deepEqual(calls, user?.role === "client" ? [["alice", "aviator"]] : []);
    if (response.status === 200) assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  return [node, ...nodes(node.props?.children)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (node == null || typeof node === "boolean") return "";
  return typeof node === "object" ? text(node.props?.children) : String(node);
}
const jsx = (type, props, key) => ({ type, props, key });

test("round messages preserve pending payouts and have no replay or close controls", () => {
  let state = [], handler, reloads = 0;
  const sequence = { current: 0 };
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  globalThis.document = { body: {} };
  globalThis.window = {
    addEventListener: (_name, fn) => { handler = fn; }, removeEventListener() {},
    location: { reload: () => reloads++ },
  };
  try {
    const popup = load("src\\components\\GameResultPopup.tsx", {
      "react": { useState: () => [state, value => { state = typeof value === "function" ? value(state) : value; }], useRef: () => sequence, useEffect: fn => fn(), useCallback: fn => fn },
      "react-dom": { createPortal: node => node },
      "react/jsx-runtime": { jsx, jsxs: jsx }, "./GameOverOverlay": { GameResultMessage: "result-message" },
      "@/lib/gameResultNotice": load("src\\lib\\gameResultNotice.ts", {}),
    });
    const render = () => popup.GameResultPopup({ game: "aviator" });
    assert.equal(render(), null);
    handler({ detail: { game: "Aviator", bet: 100, win: 0, won: false, poolPending: true, poolClaim: 200 } });
    const pending = render();
    assert.equal(pending.props.title, "Congratulations! You win");
    assert.equal(pending.props.winAmount, 200);
    assert.match(pending.props.result, /Provisional win amount/);
    assert.match(pending.props.result, /not credited yet/);
    assert.doesNotMatch(pending.props.result, /You lose|You won|Congratulations/);
    const buttons = nodes(pending).filter(node => node.type === "button");
    assert.equal(buttons.length, 0);
    pending.props.onDismiss();
    assert.equal(reloads, 0);
    assert.equal(render(), null);
    handler({ detail: { game: "Aviator", bet: 100, win: 200, won: true } });
    assert.equal(render().props.title, "Congratulations! You win");
    assert.equal(render().props.winAmount, 200);
    render().props.onDismiss();
    handler({ detail: { game: "Aviator", bet: 100, win: 0, won: false } });
    assert.equal(render(), null, "Aviator losses remain hidden as requested");
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  }
});

test("the game opens directly without a daily-pool permission dialog", async () => {
  const originalFetch = globalThis.fetch;
  const states = [], effects = [], accepts = [];
  let cursor = 0;
  const notice = load("src\\components\\DailyPoolNotice.tsx", {
    "react": {
      useState: initial => {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [states[index], value => { states[index] = value; }];
      },
      useEffect: fn => { if (!effects.length) effects.push(fn); },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx }, "@/lib/dailyPoolRules": rules,
    "@/lib/dailyPoolConsent": { acceptDailyPool: game => accepts.push(game) },
    "@/lib/walletSync": { broadcastBalanceUpdate: () => {} },
    "@/lib/dailyPoolBrowserGames": { isUnsupportedBrowserPoolGame: () => false },
    "@/lib/cardGameRules": load("src\\lib\\cardGameRules.ts"),
  });
  const render = () => { cursor = 0; return notice.DailyPoolNotice({ game: "aviator", children: "GAME STILL MOUNTED" }); };
  globalThis.fetch = async () => Response.json({ enabled: true, entries: [], balance: 1000 });
  let cleanup;
  try {
    render();
    cleanup = effects[0]();
    await new Promise(resolve => setImmediate(resolve));
    const tree = render();
    assert.deepEqual(accepts, []);
    assert.match(text(tree), /GAME STILL MOUNTED/);
    assert.ok(!nodes(tree).some(node => node.props?.role === "dialog"));
  } finally { cleanup?.(); globalThis.fetch = originalFetch; }
});
