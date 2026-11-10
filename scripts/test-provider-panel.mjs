import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import ts from "typescript";

function load(path, imports = {}) {
  const loaded = { exports: {} };
  const js = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", js)(name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}

const availability = load("src\\lib\\gameAvailability.ts");
const identity = load("src\\lib\\gregmornIdentity.ts", { "node:crypto": { createHash } });
const selection = load("src\\lib\\gregmornSelection.ts");
const order = load("src\\lib\\providerOrder.ts");
const next = { NextResponse: { json: (body, options) => Response.json(body, options) } };
const providerGame = { id: "JILI:game:One", isEnabled: true, title: "Aviator", provider: "JILI", imageUrl: "https://cdn.example/one.jpg" };
const slug = identity.gregmornGameSlug(providerGame.id);
const game = { ...providerGame, currency: "PKR", slug, isActive: true, isHot: true };
const player = { id: "player-id", dbRole: "client", role: "client", isActive: true, blockedGames: [], balance: 100, displayId: "1234567" };

test("admin ON/OFF badges cannot shrink or wrap beside long game titles", async () => {
  const jsx = (type, props) => ({ type, props });
  const page = load("src\\app\\admin\\games\\Client.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useState: value => [value, () => {}] },
    "@/components/Shell": { Card: "card" },
    "@/lib/actions": {},
    "@/lib/adminLiveUpdates": {},
    "@/lib/providerOrder": order,
    "@/components/lobby/GameGridSkeleton": { GameGridSkeleton: "skeleton" },
    "@/lib/useDb": { usePage: loader => loader() },
  });
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ games: [
    { ...game, category: "JILI", name: "40 Super Fruits Bell Link with a very long title", stats: {} },
    { ...game, category: "JILI", slug: "off", name: "Another very long title", isActive: false, stats: {} },
  ], blocked: [], level: 3 });
  try {
    const manager = await page.default({});
    const tree = manager.type(manager.props);
    const badges = [], titles = [];
    function visit(node) {
      if (Array.isArray(node)) node.forEach(visit);
      else if (node && typeof node === "object") {
        if (node.type === "span" && ["ON", "OFF"].includes(node.props.children)) badges.push(node);
        if (node.type === "div" && node.props.className?.includes("truncate")) titles.push(node);
        visit(node.props?.children);
      }
    }
    visit(tree);
    assert.equal(badges.length, 2);
    for (const badge of badges) {
      assert.match(badge.props.className, /\bshrink-0\b/);
      assert.match(badge.props.className, /\bwhitespace-nowrap\b/);
    }
    assert.equal(titles.length, 2);
    for (const title of titles) assert.match(title.props.className, /\bmin-w-0 flex-1 truncate\b/);
  } finally { globalThis.fetch = previous; }
});

test("provider identities preserve case and cannot collide with local slugs", () => {
  assert.equal(identity.isGregmornSlug(slug), true);
  assert.notEqual(slug, identity.gregmornGameSlug(providerGame.id.toLowerCase()));
  assert.equal(identity.isGregmornSlug("aviator"), false);
});

test("admin list has no search/provider controls and keeps positions across API reorder and Hot/OFF changes", async () => {
  const jsx = (type, props) => ({ type, props });
  const page = load("src\\app\\admin\\games\\Client.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useState: value => [value, () => {}] },
    "@/components/Shell": { Card: "card" },
    "@/lib/actions": {}, "@/lib/adminLiveUpdates": {},
    "@/lib/providerOrder": order,
    "@/components/lobby/GameGridSkeleton": { GameGridSkeleton: "skeleton" },
    "@/lib/useDb": { usePage: loader => loader() },
  });
  const rows = [
    { ...game, slug: "z", category: "Z Studio", name: "Game 1", stats: {} },
    { ...game, slug: "a10", category: "A Studio", name: "Game 10", stats: {} },
    { ...game, slug: "a2", category: "A Studio", name: "Game 2", stats: {} },
  ];
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ games: rows, blocked: [], level: 3 });
  async function displayed() {
    const manager = await page.default({});
    const result = [];
    function visit(node) {
      if (Array.isArray(node)) node.forEach(visit);
      else if (node && typeof node === "object") {
        assert.ok(node.type !== "input" && node.type !== "select");
        if (node.props?.className?.includes("truncate")) result.push(node.props.children);
        visit(node.props?.children);
      }
    }
    visit(manager.type(manager.props));
    return result;
  }
  try {
    assert.deepEqual(await displayed(), ["Game 2", "Game 10", "Game 1"]);
    rows.reverse();
    rows[0].isActive = false;
    rows[1].isHot = false;
    assert.deepEqual(await displayed(), ["Game 2", "Game 10", "Game 1"]);
  } finally { globalThis.fetch = previous; }
});

test("catalogue settings preserve admin OFF/hot choices and never expose saved local games", async () => {
  const saved = [{ slug, isActive: false, isHot: true }, { slug: "aviator", isActive: true, isHot: true }];
  const updates = [];
  const catalog = load("src\\lib\\gregmornCatalog.ts", {
    "next/cache": { unstable_cache: callback => callback },
    "@/models": { Game: {
      find: () => ({ lean: async () => saved }),
      updateOne: async (...args) => { updates.push(args); },
      findOne: () => ({ lean: async () => ({ _id: "saved-id", ...saved[0] }) }),
    } },
    "./gregmorn": { getGregmornCatalog: async () => [providerGame] },
    "./gregmornIdentity": identity,
    "./gregmornSelection": selection,
    "./providerArtwork": { providerArtwork: (_, fallback) => fallback },
    "./providerOrder": order,
  });
  const games = await catalog.getProviderCatalog();
  assert.equal(games.length, 1);
  assert.equal(games[0].isActive, false);
  assert.equal(games[0].isHot, false, "admin-hidden games cannot appear in player Hot Games");
  await catalog.saveProviderGame(games[0]);
  assert.equal(updates[0][1].$set.isActive, undefined);
  assert.equal(updates[0][1].$set.isHot, undefined);
  assert.equal(updates[0][1].$setOnInsert.isActive, true);
  await assert.rejects(catalog.requireProviderGame("aviator"), /not available/);
});

test("screenshot selection admits only requested titles, preserves provider artwork and sorts in list order", () => {
    const input = [
      { id: "wheel", title: "Wheel", imageUrl: "https://provider.example/wheel.png" },
      { id: "aviator", title: "AVIATOR", imageUrl: "https://provider.example/aviator.png" },
      { id: "chicken", title: "Chicken Road Two" },
      { id: "blackjack", title: "Blackjack" },
      { id: "other", title: "Unrelated Slot" },
      { id: "plinko-plus", title: "Plinko+" },
      { id: "bonus", title: "Chicken Road Two Bonus" },
      { id: "studio-dice", title: "Football Studio Dice" },
      { id: "fruits-2", title: "Super Fruits Slot 2" },
      { id: "gem", title: "Fortune Gems" },
      { id: "gem-500", title: "Fortune Gems 500" },
      { id: "holdem-bonus", title: "Texas Hold'em Bonus Poker" },
      { id: "aviator", title: "Aviator" },
    ];
    const selected = selection.selectGregmornGames(input);
    assert.deepEqual(selected.map(game => game.id), ["aviator", "chicken", "blackjack", "gem-500", "wheel"]);
    assert.equal(selected[0], input[1], "original title, image and provider identity are unchanged");
    assert.deepEqual(selection.selectGregmornGames([]), []);
});

test("duplicate providers and spelling aliases produce one stable original game card", () => {
  const first = { id: "a-aviator", title: "Aviator", imageUrl: "https://provider.example/original.png" };
  const input = [
    { id: "z-aviator", title: "AVIATOR" }, first,
    { id: "z-chicken", title: "Chicken Road Two" },
    { id: "a-chicken", title: "Chicken Road 2.0" },
    { id: "roulette", title: "Roulette" },
    { id: "european", title: "European Roulette" },
  ];
  const result = selection.selectGregmornGames(input);
  assert.deepEqual(result.map(game => game.id), ["a-aviator", "a-chicken", "roulette", "european"]);
  assert.equal(result[0], first);
  assert.deepEqual(selection.selectGregmornGames([...input].reverse()), result);
});

test("admin on/off and hot actions persist provider choices without changing local settings", async () => {
    const saved = [{ slug, isActive: true, isHot: false }, { slug: "aviator", isActive: true, isHot: true }];
    const revalidated = [];
    let admin = { id: "owner", role: "admin", level: 3 };
    const actions = load("src\\lib\\actions.ts", {
      "next/cache": { revalidatePath: path => revalidated.push(path) },
      "@/models": { Game: { updateMany: async (filter, update) => {
        for (const row of saved) {
          if (filter.slug.$regex.test(row.slug) && (!filter.isActive || row.isActive !== false)) Object.assign(row, update.$set);
        }
      } } },
      "./auth": {}, "./serverAuth": { getServerSessionUser: async () => admin },
      "./platform": {}, "./notifications": {}, "./cloudinary": {},
      "./gregmornCatalog": {
        requireProviderGame: async value => {
          if (value !== slug) throw new Error("Provider game is not available");
          return game;
        },
        saveProviderGame: async () => saved[0],
      },
    });
    await actions.toggleGameHotAction(slug, true);
    assert.equal(saved[0].isHot, true);
    await actions.toggleGameAction(slug, false);
    assert.equal(saved[0].isActive, false);
    assert.equal(saved[0].isHot, false);
    await actions.toggleGameHotAction(slug, true);
    assert.equal(saved[0].isHot, false, "OFF games cannot become hot");
    await actions.toggleGameAction(slug, true);
    assert.equal(saved[0].isActive, true);
    assert.deepEqual(saved[1], { slug: "aviator", isActive: true, isHot: true });
    await assert.rejects(actions.toggleGameAction("aviator", false), /not available/);
    assert.ok(revalidated.includes("/admin/games"));
    admin = { ...admin, level: 1 };
    await assert.rejects(actions.toggleGameHotAction(slug, true), /Unauthorized/);
});

test("admin ON/OFF and Hot choices reach player catalogues without waiting for the provider cache", async () => {
  const saved = [];
  const categories = load("src\\lib\\providerCategories.ts");
  const dbGame = {
    find: () => ({ lean: async () => saved }),
    updateOne: async (filter, update) => {
      if (!saved.some(row => row.slug === filter.slug)) saved.push({ _id: "saved", slug: filter.slug, ...update.$setOnInsert });
    },
    findOne: filter => ({ lean: async () => saved.find(row => row.slug === filter.slug) }),
    updateMany: async (filter, update) => {
      for (const row of saved) {
        if (filter.slug.$regex.test(row.slug) && (!filter.isActive || row.isActive !== false)) Object.assign(row, update.$set);
      }
    },
  };
  let fetches = 0;
  const catalog = load("src\\lib\\gregmornCatalog.ts", {
    "@/models": { Game: dbGame },
    "./gregmorn": { getGregmornCatalog: async () => { fetches++; return [providerGame]; } },
    "./providerOrder": order,
    "./gregmornIdentity": identity,
    "./providerArtwork": { providerArtwork: (_, fallback) => fallback },
  });
  const actions = load("src\\lib\\actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "@/models": { Game: dbGame },
    "./auth": {}, "./serverAuth": { getServerSessionUser: async () => ({ role: "admin", level: 3 }) },
    "./platform": {}, "./notifications": {}, "./cloudinary": {},
    "./gregmornCatalog": catalog,
  });
  const route = load("src\\app\\api\\gregmorn\\catalog\\route.ts", {
    "next/server": next,
    "@/lib/serverAuth": { getServerSessionUser: async () => player },
    "@/lib/gregmornCatalog": catalog,
  });
  const listed = async () => (await (await route.GET(new Request("https://site.example/api/gregmorn/catalog"))).json()).games;
  assert.equal((await listed()).length, 1);
  await actions.toggleGameHotAction(slug, true);
  assert.equal((await listed()).filter(game => categories.matchesProviderCategory(game, "Hot")).length, 1);
  await actions.toggleGameAction(slug, false);
  assert.equal((await listed()).length, 0);
  await actions.toggleGameAction(slug, true);
  assert.equal((await listed()).length, 1);
  assert.equal((await listed())[0].isHot, false);
  await actions.toggleGameHotAction(slug, true);
  assert.equal((await listed())[0].isHot, true);
  await actions.toggleGameHotAction(slug, false);
  assert.equal((await listed()).filter(game => categories.matchesProviderCategory(game, "Hot")).length, 0);
  assert.equal(fetches, 2, "admin changes apply while both currency catalogues stay cached");
});

test("public catalogue hides switched-off and player-restricted provider games", async () => {
  let user = player;
  const route = load("src\\app\\api\\gregmorn\\catalog\\route.ts", {
    "next/server": next,
    "@/lib/serverAuth": { getServerSessionUser: async () => user },
    "@/lib/gregmornCatalog": { getProviderCatalog: async () => [game, { ...game, id: "off", slug: "off", isActive: false }] },
  });
  assert.equal((await (await route.GET(new Request("https://site.example/api/gregmorn/catalog"))).json()).games.length, 1);
  user = { ...player, blockedGames: [slug] };
  assert.equal((await (await route.GET(new Request("https://site.example/api/gregmorn/catalog"))).json()).games.length, 0);
  user = null;
  assert.equal((await (await route.GET(new Request("https://site.example/api/gregmorn/catalog"))).json()).games.length, 1);
});

test("unavailable provider games remain listed but admin-hidden and player-restricted games stay hidden", async () => {
  const unavailable = { ...game, id: "unavailable", slug: "unavailable", isEnabled: false, isActive: false, isHiddenByAdmin: false };
  const route = load("src\\app\\api\\gregmorn\\catalog\\route.ts", {
    "next/server": next,
    "@/lib/serverAuth": { getServerSessionUser: async () => ({ ...player, blockedGames: ["restricted"] }) },
    "@/lib/gregmornCatalog": { getProviderCatalog: async () => [
      game, unavailable,
      { ...unavailable, id: "hidden", slug: "hidden", isHiddenByAdmin: true },
      { ...unavailable, id: "restricted", slug: "restricted" },
    ] },
  });
  const response = await route.GET(new Request("https://site.example/api/gregmorn/catalog"));
  assert.deepEqual((await response.json()).games.map(game => game.id), [game.id, "unavailable"]);
});

test("provider launch enforces restrictions before calling provider and maps the existing wallet", async () => {
  let denied = "Restricted";
  const launches = [], sessions = [];
  const previousExit = process.env.GREGMORN_EXIT_URL;
  process.env.GREGMORN_EXIT_URL = "https://site.example/player";
  const route = load("src\\app\\api\\gregmorn\\launch\\route.ts", {
    "next/server": next,
    "@/lib/serverAuth": { getServerSessionUser: async () => player },
    "@/lib/gregmorn": { openGregmornGame: async input => {
      launches.push(input);
      return { sessionId: "session-id", url: "https://game.example/play", gameId: input.gameId, playerLogin: input.playerLogin, currency: "PKR" };
    } },
    "@/lib/gregmornCatalog": { getProviderCatalog: async () => [game], saveProviderGame: async () => ({ _id: "saved-id" }) },
    "@/lib/gameAccess": { checkGameAccess: async () => denied },
    "@/lib/multiplayer-store": { mysqlMultiplayerStore: { transact: async (_room, fn) => fn({}) } },
    "@/lib/gregmornWallet": { gregmornCallbackRoom: id => id, registerGregmornSession: async (_tx, session) => { sessions.push(session); } },
  });
  const request = (extra = {}) => new Request("https://site.example/api/gregmorn/launch", { method: "POST", body: JSON.stringify({ gameId: game.id, ...extra }) });
  try {
    assert.equal((await route.POST(request())).status, 403);
    assert.equal(launches.length, 0);
    denied = null;
    assert.equal((await route.POST(request())).status, 200);
    assert.equal(launches[0].balance, 100);
    assert.equal(sessions[0].userId, player.id);
    assert.equal(sessions[0].catalogGameId, "saved-id");
    assert.equal(launches[0].exitUrl, "https://site.example/player", "legacy callers keep the configured exit URL");
    assert.equal((await route.POST(request({ returnTo: "/games-all?cat=Hot#games" }))).status, 200);
    assert.equal(launches[1].exitUrl, "https://site.example/games-all?cat=Hot#games");
    assert.equal((await route.POST(request({ returnTo: "/?cat=All" }))).status, 200);
    assert.equal(launches[2].exitUrl, "https://site.example/?cat=All");
    const count = launches.length;
    for (const returnTo of ["//evil.example/", "/\\evil.example/", "https://evil.example/", "/admin", "/api/auth/logout", 123, null]) {
      assert.equal((await route.POST(request({ returnTo }))).status, 400);
    }
    assert.equal(launches.length, count, "invalid destinations cannot launch a provider session");
  } finally {
    if (previousExit === undefined) delete process.env.GREGMORN_EXIT_URL;
    else process.env.GREGMORN_EXIT_URL = previousExit;
  }
});

test("launch selects catalogue currency server-side and preserves nominal PKR wallet numbers", async () => {
  const launches = [], sessions = [], queries = [];
  let currency = "USD";
  const previousExit = process.env.GREGMORN_EXIT_URL;
  const previousCurrency = process.env.GREGMORN_CURRENCY;
  process.env.GREGMORN_EXIT_URL = "https://site.example/player";
  process.env.GREGMORN_CURRENCY = "PKR";
  const route = load("src\\app\\api\\gregmorn\\launch\\route.ts", {
    "next/server": next,
    "@/lib/serverAuth": { getServerSessionUser: async () => player },
    "@/lib/gregmorn": { openGregmornGame: async input => {
      launches.push(input);
      return { ...input, sessionId: `session-${launches.length}`, url: "https://game.example/play" };
    } },
    "@/lib/gregmornCatalog": {
      getProviderCatalog: async (...args) => { queries.push(args); return [{ ...game, currency }]; },
      saveProviderGame: async () => ({ _id: "saved-id" }),
    },
    "@/lib/gameAccess": { checkGameAccess: async () => null },
    "@/lib/multiplayer-store": { mysqlMultiplayerStore: { transact: async (_room, fn) => fn({}) } },
    "@/lib/gregmornWallet": { gregmornCallbackRoom: id => id, registerGregmornSession: async (_tx, session) => { sessions.push(session); } },
  });
  const request = () => new Request("https://site.example/api/gregmorn/launch", {
    method: "POST", body: JSON.stringify({ gameId: game.id, currency: currency === "USD" ? "PKR" : "USD", balance: 9999 }),
  });
  try {
    assert.equal((await route.POST(request())).status, 200);
    assert.equal(launches[0].currency, "USD");
    assert.equal(launches[0].playerLogin, `usd.${player.displayId}`);
    assert.equal(launches[0].balance, 100);
    assert.equal(sessions[0].currency, "USD");
    assert.equal(sessions[0].userId, player.id);
    currency = "PKR";
    assert.equal((await route.POST(request())).status, 200);
    assert.equal(launches[1].currency, "PKR");
    assert.equal(launches[1].playerLogin, player.displayId);
    assert.equal(launches[1].balance, 100);
    process.env.GREGMORN_CURRENCY = "USD";
    assert.equal((await route.POST(request())).status, 200);
    assert.equal(launches[2].playerLogin, `pkr.${player.displayId}`);
    assert.equal(sessions[2].currency, "PKR");
    assert.ok(queries.every(args => args.length === 0), "launch uses the merged, not environment-only catalogue");
  } finally {
    if (previousExit === undefined) delete process.env.GREGMORN_EXIT_URL;
    else process.env.GREGMORN_EXIT_URL = previousExit;
    if (previousCurrency === undefined) delete process.env.GREGMORN_CURRENCY;
    else process.env.GREGMORN_CURRENCY = previousCurrency;
  }
});

test("provider unfinished-round rejection waits and retries real mode with fresh account checks, never demo", async () => {
  const opens = [], sessions = [];
  let pending = true, denied = null, currentPlayer = player;
  const previousExit = process.env.GREGMORN_EXIT_URL;
  process.env.GREGMORN_EXIT_URL = "https://site.example/player";
  class GregmornLaunchError extends Error {
    constructor(reason) { super(reason); this.reason = reason; }
  }
  const route = load("src\\app\\api\\gregmorn\\launch\\route.ts", {
    "next/server": next,
    "@/lib/serverAuth": { getServerSessionUser: async () => currentPlayer },
    "@/lib/gregmorn": {
      GregmornLaunchError,
      openGregmornGame: async input => {
        opens.push(input);
        if (pending) throw new GregmornLaunchError("session_in_progress");
        return { sessionId: "real-session", url: "https://game.example/play", gameId: input.gameId, playerLogin: input.playerLogin, currency: "PKR" };
      },
    },
    "@/lib/gregmornCatalog": { getProviderCatalog: async () => [game], saveProviderGame: async () => ({ _id: "saved-id" }) },
    "@/lib/gameAccess": { checkGameAccess: async () => denied },
    "@/lib/multiplayer-store": { mysqlMultiplayerStore: { transact: async (_room, fn) => fn({}) } },
    "@/lib/gregmornWallet": { gregmornCallbackRoom: id => id, registerGregmornSession: async (_tx, session) => { sessions.push(session); } },
  });
  try {
    const request = () => new Request("https://site.example/api/gregmorn/launch", {
      method: "POST", body: JSON.stringify({ gameId: game.id }),
    });
    const response = await route.POST(request());
    assert.equal(response.status, 409);
    assert.equal(response.headers.get("retry-after"), "10");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      error: "The previous session is still active. Waiting for the next available session.",
      code: "session_in_progress", retryAfter: 10,
    });
    assert.equal(opens.length, 1);
    assert.equal(opens[0].balance, player.balance);
    assert.equal(opens[0].demo, undefined);
    assert.equal(sessions.length, 0);
    denied = "Restricted";
    assert.equal((await route.POST(request())).status, 403);
    assert.equal(opens.length, 1, "retries cannot bypass changed restrictions");
    denied = null;
    currentPlayer = { ...player, isActive: false };
    assert.equal((await route.POST(request())).status, 401);
    assert.equal(opens.length, 1, "retries cannot bypass account deactivation");
    currentPlayer = { ...player, balance: 75 };
    pending = false;
    const success = await route.POST(request());
    assert.equal(success.status, 200);
    assert.equal((await success.json()).url, "https://game.example/play");
    assert.equal(opens[1].demo, undefined);
    assert.equal(opens[1].balance, 75);
    assert.equal(opens[1].playerLogin, player.displayId);
    assert.equal(sessions[0].sessionId, "real-session");
    assert.equal(sessions[0].demo, undefined);
  } finally {
    if (previousExit === undefined) delete process.env.GREGMORN_EXIT_URL;
    else process.env.GREGMORN_EXIT_URL = previousExit;
  }
});

test("direct launch cannot open a provider-disabled game even if a caller marks it active", async () => {
  let launched = false;
  const route = load("src\\app\\api\\gregmorn\\launch\\route.ts", {
    "next/server": next,
    "@/lib/serverAuth": { getServerSessionUser: async () => player },
    "@/lib/gregmorn": { openGregmornGame: async () => { launched = true; } },
    "@/lib/gregmornCatalog": { getProviderCatalog: async () => [{ ...game, isEnabled: false, isActive: true }] },
    "@/lib/gameAccess": {},
    "@/lib/multiplayer-store": {},
    "@/lib/gregmornWallet": {},
  });
  const response = await route.POST(new Request("https://site.example/api/gregmorn/launch", {
    method: "POST", body: JSON.stringify({ gameId: game.id }),
  }));
  assert.equal(response.status, 404);
  assert.equal(launched, false);
});
test("both local game URL entrypoints redirect before rendering preserved engines", async () => {
  for (const path of ["src\\app\\games\\[slug]\\page.tsx", "src\\app\\player\\games\\[slug]\\page.tsx"]) {
    const route = load(path, {
      "./Client": { default: () => { throw new Error("Local engine must not render"); } },
      "react/jsx-runtime": { jsx: () => { throw new Error("Local engine must not render"); } },
      "next/navigation": { redirect: url => { throw new Error(`redirect:${url}`); } },
      "@/lib/gameAvailability": availability,
    });
    await assert.rejects(route.default({}), /redirect:\/games-all/);
  }
});

test("legacy balance actions cannot start local wagers or inject balance deltas", async () => {
  const route = load("src\\app\\api\\player\\balance\\route.ts", {
    "next/server": next, "@/models": {}, "@/lib/serverAuth": { getServerSessionUser: async () => player },
    "@/lib/mongo": {}, "@/lib/dailyPoolConfig": {}, "@/lib/dailyPoolBrowser": {}, "@/lib/dailyPoolRules": {},
    "@/lib/multiplayer-store": {}, "@/lib/cardGameRules": {}, "@/lib/rouletteGameRules": {},
    "@/lib/slotGameRules": {}, "@/lib/browserCardActions": {}, "@/lib/gameAvailability": availability,
  });
  for (const body of [{ delta: 100 }, { action: "accept" }, { action: "increment" }, { action: "play" }, { action: "server-play" }]) {
    const response = await route.POST(new Request("https://site.example/api/player/balance", { method: "POST", body: JSON.stringify(body) }));
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /disconnected/);
  }
});

test("dedicated local outcome APIs reject play without invoking saved engines", async () => {
  const cases = [
    ["src\\app\\api\\flip\\route.ts", { "node:crypto": {}, "@/components/head-tail/lib/game": {} }],
    ["src\\app\\api\\roll\\route.ts", { "node:crypto": {}, "@/components/tai-xiu-game/lib/game": {} }],
    ["src\\app\\api\\spin\\route.ts", { crypto: {}, "next/server": next, "@/components/birds-beasts/lib/engine": {}, "@/components/birds-beasts/lib/game-config": {} }],
    ["src\\app\\api\\ludo\\deal\\route.ts", { "@/lib/ludo": {} }],
    ["src\\app\\api\\wheel-betting\\spin\\route.ts", { "next/server": next, "@/components/wheel-betting/lib/spin-engine": {}, "@/components/wheel-betting/lib/wheel": {} }],
  ];
  for (const [path, imports] of cases) {
    const route = load(path, { ...imports, "@/lib/gameAvailability": availability });
    assert.equal((await route.POST(new Request("https://site.example/api/local", { method: "POST" }))).status, 403, path);
  }
});

test("multiplayer blocks new local bets while leaving accepted-wager cashout available", async () => {
  class MultiplayerError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
  const actions = [];
  const route = load("src\\app\\api\\multiplayer\\[game]\\route.ts", {
    "next/server": next, "@/lib/serverAuth": { getServerSessionUser: async () => player },
    "@/lib/multiplayer": { MultiplayerError, isMultiplayerGame: () => true, multiplayer: { act: async (_game, _id, action) => { actions.push(action); return { ok: true }; } } },
    "@/lib/requestOrigin": { isAllowedGameOrigin: () => true },
    "@/lib/gameAvailability": availability,
  });
  const request = action => new Request("https://site.example/api/multiplayer/aviator", { method: "POST", body: JSON.stringify({ action }) });
  const context = { params: Promise.resolve({ game: "aviator" }) };
  assert.equal((await route.POST(request("bet"), context)).status, 403);
  assert.equal((await route.POST(request("cashout"), context)).status, 200);
  assert.deepEqual(actions, [{ action: "cashout" }]);
});
